import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { createScenarioStore } from './scenarioStore';

const PORT = Number(process.env.PORT ?? 4000);
const store = createScenarioStore();

type ScenarioRequestBody = {
  name?: unknown;
  assumptions?: unknown;
};

const defaultHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

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
        } catch (error) {
          reject(new Error('Invalid JSON payload'));
        }
      })
      .on('error', reject);
  });

const server = http.createServer(async (req, res) => {
  const method = req.method ?? 'GET';
  const requestUrl = req.url ?? '/';

  if (method === 'OPTIONS') {
    res.writeHead(204, defaultHeaders);
    res.end();
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
