import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import {
  deleteConnection,
  getConnection,
  listConnections,
  upsertConnection,
} from '../store/configStore.js';
import type { DbConnectionConfig, DbPermissions, DbType } from '../db/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, 'public');

export interface ServerHandle {
  port: number;
  url: string;
  urlWithToken: string;
  shutdown: () => Promise<void>;
  onLastClientGone: (cb: () => void) => void;
}

interface SavedConnectionPayload {
  dbId: string;
  type: DbType;
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  permissions: DbPermissions;
}

export async function startConfigServer(): Promise<ServerHandle> {
  const httpServer = createServer((req, res) => handleHttp(req, res));
  const wss = new WebSocketServer({ server: httpServer });
  let lastClientGoneCb: (() => void) | null = null;

  wss.on('connection', (ws) => {
    ws.on('close', () => {
      if (wss.clients.size === 0 && lastClientGoneCb) {
        lastClientGoneCb();
      }
    });
  });

  const port = await new Promise<number>((resolve) => {
    httpServer.listen(0, '127.0.0.1', () => {
      const addr = httpServer.address();
      if (addr && typeof addr === 'object') resolve(addr.port);
      else resolve(0);
    });
  });

  const url = `http://127.0.0.1:${port}`;

  return {
    port,
    url,
    urlWithToken: url,
    shutdown: async () => {
      for (const client of wss.clients) {
        try {
          client.close();
        } catch {
          /* ignore */
        }
      }
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
    onLastClientGone: (cb) => {
      lastClientGoneCb = cb;
    },
  };
}

function setCors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function jsonResponse(res: ServerResponse, status: number, body: unknown): void {
  setCors(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function readJson<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({} as T);
      try {
        resolve(JSON.parse(raw) as T);
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

async function handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    setCors(res);
    res.statusCode = 204;
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', 'http://localhost');

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    const html = readFileSync(join(PUBLIC_DIR, 'index.html'));
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(html);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/connections') {
    jsonResponse(res, 200, listConnections());
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/connections') {
    try {
      const body = await readJson<SavedConnectionPayload>(req);
      const saved = upsertConnection({
        dbId: body.dbId,
        type: body.type,
        host: body.host,
        port: Number(body.port),
        user: body.user,
        password: body.password,
        database: body.database,
        permissions: {
          dmlQuery: !!body.permissions?.dmlQuery,
          dmlUpdate: !!body.permissions?.dmlUpdate,
          dmlDelete: !!body.permissions?.dmlDelete,
          ddl: !!body.permissions?.ddl,
        },
      });
      jsonResponse(res, 200, sanitize(saved));
    } catch (e) {
      jsonResponse(res, 400, { error: (e as Error).message });
    }
    return;
  }

  if (req.method === 'DELETE' && url.pathname.startsWith('/api/connections/')) {
    const dbId = decodeURIComponent(url.pathname.replace('/api/connections/', ''));
    const ok = deleteConnection(dbId);
    jsonResponse(res, ok ? 200 : 404, { ok });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/test') {
    try {
      const body = await readJson<SavedConnectionPayload>(req);
      const temp = upsertConnection({
        dbId: body.dbId,
        type: body.type,
        host: body.host,
        port: Number(body.port),
        user: body.user,
        password: body.password,
        database: body.database,
        permissions: {
          dmlQuery: !!body.permissions?.dmlQuery,
          dmlUpdate: !!body.permissions?.dmlUpdate,
          dmlDelete: !!body.permissions?.dmlDelete,
          ddl: !!body.permissions?.ddl,
        },
      });
      const { createDriver } = await import('../db/index.js');
      const { translateDbError } = await import('../utils/errors.js');
      const driver = await createDriver(temp);
      try {
        await driver.testConnection();
        jsonResponse(res, 200, { ok: true });
      } catch (e) {
        jsonResponse(res, 400, { ok: false, error: translateDbError(e, temp.type) });
      } finally {
        await driver.close();
      }
    } catch (e) {
      jsonResponse(res, 400, { ok: false, error: (e as Error).message });
    }
    return;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/connections/')) {
    const dbId = decodeURIComponent(url.pathname.replace('/api/connections/', ''));
    const conn = getConnection(dbId);
    if (!conn) {
      jsonResponse(res, 404, { error: 'not found' });
    } else {
      jsonResponse(res, 200, sanitize(conn));
    }
    return;
  }

  jsonResponse(res, 404, { error: 'not found' });
}

function sanitize(conn: DbConnectionConfig): Omit<DbConnectionConfig, 'password'> & { password: string } {
  return { ...conn, password: conn.password };
}