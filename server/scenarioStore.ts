import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type ScenarioRecord = {
  id: string;
  name: string;
  createdAt: string;
  assumptions: unknown;
};

export interface ScenarioStore {
  list(): Promise<ScenarioRecord[]>;
  create(record: ScenarioRecord): Promise<ScenarioRecord>;
  delete(id: string): Promise<boolean>;
}

type ScenarioRow = {
  id: string;
  name: string;
  created_at: string;
  assumptions: unknown;
};

class FileScenarioStore implements ScenarioStore {
  private readonly filePath: string;
  private readonly ready: Promise<void>;
  private scenarios: ScenarioRecord[] = [];

  constructor(filePath?: string) {
    this.filePath = filePath ?? path.join(process.cwd(), 'data', 'scenarios.json');
    this.ready = this.initialize();
  }

  private async initialize(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        this.scenarios = data;
      } else {
        this.scenarios = [];
      }
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') {
        await fs.writeFile(this.filePath, '[]\n', 'utf8');
      } else {
        console.error('Failed to read scenario store:', error);
        this.scenarios = [];
      }
    }
  }

  private async ensureReady(): Promise<void> {
    await this.ready;
  }

  private async persist(): Promise<void> {
    await fs.writeFile(this.filePath, JSON.stringify(this.scenarios, null, 2));
  }

  async list(): Promise<ScenarioRecord[]> {
    await this.ensureReady();
    return [...this.scenarios].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async create(record: ScenarioRecord): Promise<ScenarioRecord> {
    await this.ensureReady();
    this.scenarios.push(record);
    await this.persist();
    return record;
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureReady();
    const index = this.scenarios.findIndex((scenario) => scenario.id === id);
    if (index === -1) {
      return false;
    }
    this.scenarios.splice(index, 1);
    await this.persist();
    return true;
  }
}

class SupabaseScenarioStore implements ScenarioStore {
  private readonly client: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.client = createClient(url, serviceRoleKey, {
      auth: {
        persistSession: false,
      },
    });
  }

  private mapRow(row: ScenarioRow): ScenarioRecord {
    return {
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      assumptions: row.assumptions,
    };
  }

  async list(): Promise<ScenarioRecord[]> {
    const { data, error } = await this.client
      .from('scenarios')
      .select('id, name, created_at, assumptions')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    const rows = (data ?? []) as ScenarioRow[];
    return rows.map((row) => this.mapRow(row));
  }

  async create(record: ScenarioRecord): Promise<ScenarioRecord> {
    const { data, error } = await this.client
      .from('scenarios')
      .insert({ name: record.name, assumptions: record.assumptions })
      .select('id, name, created_at, assumptions')
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? 'Unable to create scenario');
    }

    return this.mapRow(data as ScenarioRow);
  }

  async delete(id: string): Promise<boolean> {
    const { error, data } = await this.client
      .from('scenarios')
      .delete()
      .eq('id', id)
      .select('id');

    if (error) {
      throw new Error(error.message);
    }

    const rows = data as Array<{ id: string }> | null;
    return Boolean(rows?.length);
  }
}

export const createScenarioStore = (): ScenarioStore => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && supabaseKey) {
    return new SupabaseScenarioStore(supabaseUrl, supabaseKey);
  }
  return new FileScenarioStore();
};
