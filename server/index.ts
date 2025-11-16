import http from 'node:http';
import https from 'node:https';
import { randomUUID } from 'node:crypto';
import { createScenarioStore } from './scenarioStore';

const PORT = Number(process.env.PORT ?? 4000);
const store = createScenarioStore();
const CMHC_ENDPOINT = 'https://www03.cmhc-schl.gc.ca/hmip-pimh/en/TableMapChart/ExportTable';
const VACANCY_CACHE_MS = 1000 * 60 * 60; // 1 hour

type ScenarioRequestBody = {
  name?: unknown;
  assumptions?: unknown;
};

const defaultHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

type VacancyPoint = {
  date: string;
  year: number;
  quarter: number;
  season: string;
  label: string;
  rate: number;
  quality: string | null;
};

type VacancyResponse = {
  metroCode: string;
  season: 'October' | 'April';
  retrievedAt: string;
  points: VacancyPoint[];
};

const vacancyCache = new Map<string, { expiresAt: number; payload: VacancyResponse }>();

const sendJson = (res: http.ServerResponse, status: number, payload: unknown): void => {
  res.writeHead(status, { ...defaultHeaders, 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
};

const parseRequestBody = (req: http.IncomingMessage): Promise<ScenarioRequestBody> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req
      .on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      })
      .on('end', () => {
        if (!chunks.length) {
          resolve({});
          return;
        }
        try {
          const raw = Buffer.concat(chunks).toString('utf8');
          resolve(JSON.parse(raw));
        } catch {
          reject(new Error('Invalid JSON payload'));
        }
      })
      .on('error', reject);
  });

const monthLookup: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

type ParsedDate = {
  iso: string;
  year: number;
  quarter: number;
  season: string;
};

const parseDateLabel = (label: string): ParsedDate | null => {
  const trimmed = label.trim();
  if (!trimmed) {
    return null;
  }
  const monthMatch = trimmed.match(/^(\d{4})\s+([A-Za-z]+)$/);
  if (monthMatch) {
    const year = Number(monthMatch[1]);
    const season = monthMatch[2];
    const monthNumber = monthLookup[season.toLowerCase()];
    if (!Number.isFinite(year) || !monthNumber) {
      return null;
    }
    const date = new Date(Date.UTC(year, monthNumber - 1, 1));
    const quarter = Math.floor((monthNumber - 1) / 3) + 1;
    return {
      iso: date.toISOString(),
      year,
      quarter,
      season,
    };
  }
  const quarterMatch = trimmed.match(/^(\d{4})\/Q(\d)$/i);
  if (quarterMatch) {
    const year = Number(quarterMatch[1]);
    const quarter = Number(quarterMatch[2]);
    if (!Number.isFinite(year) || !Number.isFinite(quarter) || quarter < 1 || quarter > 4) {
      return null;
    }
    const monthNumber = (quarter - 1) * 3 + 1;
    const date = new Date(Date.UTC(year, monthNumber - 1, 1));
    const seasonNames = ['Q1', 'Q2', 'Q3', 'Q4'];
    return {
      iso: date.toISOString(),
      year,
      quarter,
      season: seasonNames[quarter - 1],
    };
  }
  return null;
};

const parseVacancyCsv = (csv: string): VacancyPoint[] => {
  const sanitized = csv.replace(/\r/g, '');
  const lines = sanitized
    .split('\n')
    .map((line) => line.replace(/^\uFEFF/, '').trim())
    .filter((line) => line.length);
  const headerIndex = lines.findIndex((line) => line.startsWith(','));
  if (headerIndex === -1) {
    return [];
  }
  const headers = lines[headerIndex]
    .split(',')
    .map((cell) => cell.trim().toLowerCase());
  const totalIndex = headers.findIndex((cell) => cell === 'total');
  if (totalIndex === -1) {
    return [];
  }
  const points: VacancyPoint[] = [];
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const row = lines[index];
    if (row.toLowerCase().startsWith('notes') || row.toLowerCase().startsWith('source')) {
      break;
    }
    const cells = row.split(',').map((cell) => cell.trim());
    const label = cells[0] ?? '';
    const dateInfo = parseDateLabel(label);
    if (!label || !dateInfo) {
      continue;
    }
    const rate = Number(cells[totalIndex] ?? '');
    if (!Number.isFinite(rate)) {
      continue;
    }
    const qualityRaw = cells[totalIndex + 1]?.trim() ?? '';
    let normalizedQuality: string | null = null;
    if (qualityRaw) {
      const cleaned = qualityRaw.replace(/[^a-dA-D+*]/g, '').toUpperCase();
      normalizedQuality = cleaned.length ? cleaned : null;
    }
    points.push({
      date: dateInfo.iso,
      year: dateInfo.year,
      quarter: dateInfo.quarter,
      season: dateInfo.season,
      label,
      rate,
      quality: normalizedQuality,
    });
  }
  return points;
};

const fetchCmhcVacancyData = async (metroCode: string, season: 'October' | 'April'): Promise<VacancyResponse> => {
  const params = new URLSearchParams();
  params.set('TableId', '2.2.1');
  params.set('GeographyId', metroCode);
  params.set('GeographyTypeId', '3');
  params.set('exportType', 'csv');
  params.append('AppliedFilters[0].Key', 'dwelling_type_desc_en');
  params.append('AppliedFilters[0].Value', 'Row / Apartment');
  params.append('AppliedFilters[1].Key', 'season');
  params.append('AppliedFilters[1].Value', season);

  const body = params.toString();
  const payload = await new Promise<string>((resolve, reject) => {
    const request = https.request(
      CMHC_ENDPOINT,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`CMHC request failed with status ${response.statusCode ?? 'unknown'}`));
          response.resume();
          return;
        }
        const responseChunks: Buffer[] = [];
        response.setEncoding('utf8');
        response
          .on('data', (chunk: string) => {
            responseChunks.push(Buffer.from(chunk, 'utf8'));
          })
          .on('end', () => {
            resolve(Buffer.concat(responseChunks).toString('utf8'));
          })
          .on('error', reject);
      },
    );
    request.on('error', reject);
    request.write(body);
    request.end();
  });

  return {
    metroCode,
    season,
    retrievedAt: new Date().toISOString(),
    points: parseVacancyCsv(payload),
  };
};

const server = http.createServer(async (req, res) => {
  const method = req.method ?? 'GET';
  const requestUrl = req.url ?? '/';

  if (method === 'OPTIONS') {
    res.writeHead(204, defaultHeaders);
    res.end();
    return;
  }

  if (requestUrl.startsWith('/api/cmhc/vacancy')) {
    if (method !== 'GET') {
      sendJson(res, 405, { message: 'Method not allowed' });
      return;
    }
    const url = new URL(requestUrl, `http://${req.headers.host ?? 'localhost'}`);
    const metroCode = url.searchParams.get('metroCode')?.trim() ?? '';
    if (!/^\d{3,5}$/.test(metroCode)) {
      sendJson(res, 400, { message: 'metroCode query parameter is required' });
      return;
    }
    const seasonParam = (url.searchParams.get('season') ?? '').toLowerCase();
    const season: 'October' | 'April' = seasonParam === 'april' ? 'April' : 'October';
    const cacheKey = `${metroCode}:${season}`;
    const cached = vacancyCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      sendJson(res, 200, cached.payload);
      return;
    }
    try {
      const payload = await fetchCmhcVacancyData(metroCode, season);
      vacancyCache.set(cacheKey, { expiresAt: Date.now() + VACANCY_CACHE_MS, payload });
      sendJson(res, 200, payload);
    } catch (error) {
      console.error('Failed to fetch CMHC vacancy data:', error);
      sendJson(res, 502, { message: 'Unable to load CMHC vacancy data' });
    }
    return;
  }

  if (requestUrl.startsWith('/api/scenarios')) {
    const url = new URL(requestUrl, `http://${req.headers.host ?? 'localhost'}`);
    if (method === 'GET' && url.pathname === '/api/scenarios') {
      try {
        const scenarios = await store.list();
        sendJson(res, 200, { scenarios });
      } catch (error) {
        console.error('Failed to list scenarios:', error);
        sendJson(res, 500, { message: 'Unable to load scenarios' });
      }
      return;
    }

    if (method === 'POST' && url.pathname === '/api/scenarios') {
      try {
        const body = await parseRequestBody(req);
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!name) {
          sendJson(res, 400, { message: 'Scenario name is required' });
          return;
        }
        if (name.length > 120) {
          sendJson(res, 400, { message: 'Scenario name is too long' });
          return;
        }
        if (typeof body.assumptions !== 'object' || body.assumptions == null) {
          sendJson(res, 400, { message: 'Assumptions payload is required' });
          return;
        }

        const record = await store.create({
          id: randomUUID(),
          name,
          assumptions: body.assumptions,
          createdAt: new Date().toISOString(),
        });
        sendJson(res, 201, { scenario: record });
      } catch (error) {
        console.error('Failed to create scenario:', error);
        const message = error instanceof Error ? error.message : 'Unable to save scenario';
        sendJson(res, 400, { message });
      }
      return;
    }

    if (method === 'DELETE') {
      const segments = url.pathname.split('/').filter(Boolean);
      const scenarioId = segments[2];
      if (!scenarioId) {
        sendJson(res, 400, { message: 'Scenario id is required' });
        return;
      }
      try {
        const deleted = await store.delete(scenarioId);
        if (!deleted) {
          sendJson(res, 404, { message: 'Scenario not found' });
          return;
        }
        sendJson(res, 200, { success: true });
      } catch (error) {
        console.error('Failed to delete scenario:', error);
        sendJson(res, 500, { message: 'Unable to delete scenario' });
      }
      return;
    }
  }

  sendJson(res, 404, { message: 'Not Found' });
});

server.listen(PORT, () => {
  console.log(`Scenario API listening on http://localhost:${PORT}`);
});
