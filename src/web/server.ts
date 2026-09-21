import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { marked } from 'marked';

marked.setOptions({ gfm: true, breaks: true });
import {
  deleteConnection,
  getConnection,
  listConnections,
  upsertConnection,
} from '../store/configStore.js';
import { decryptWithPassphrase } from '../utils/crypto.js';
import {
  addUsage,
  listUsage,
  removeUsage,
  updateUsage,
} from '../store/usageStore.js';
import type { DbConnectionConfig, DbPermissions, DbType } from '../db/types.js';
import { encryptWithPassphrase } from '../utils/crypto.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname);
const PKG_PATH = join(__dirname, '..', '..', 'package.json');

let APP_VERSION = '0.0.0';
try {
  const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf8')) as { version?: string };
  if (pkg.version) APP_VERSION = pkg.version;
} catch {
  /* 保持默认 0.0.0 */
}

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

export async function startConfigServer(preferredPort?: number): Promise<ServerHandle> {
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

  const port = await new Promise<number>((resolve, reject) => {
    httpServer.once('error', reject);
    try {
      httpServer.listen(preferredPort ?? 0, '127.0.0.1', () => {
        const addr = httpServer.address();
        if (addr && typeof addr === 'object') resolve(addr.port);
        else reject(new Error('listen() 未返回有效端口'));
      });
    } catch (e) {
      reject(e);
    }
  });

  if (port === 0) {
    httpServer.close();
    throw new Error('listen() 失败（port=0）');
  }

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
    const tpl = readFileSync(join(PUBLIC_DIR, 'index.html'), 'utf8');
    const html = tpl
      .replace(/__APP_VERSION__/g, APP_VERSION)
      .replace(/<meta name="version" content="[^"]*"\s*\/?>/, `<meta name="version" content="${APP_VERSION}">`);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.end(html);
    return;
  }

  // 静态资源：Vite 输出在 dist/web/assets/*
  if (req.method === 'GET' && url.pathname.startsWith('/assets/')) {
    try {
      const data = readFileSync(join(PUBLIC_DIR, url.pathname));
      const ext = url.pathname.split('.').pop() ?? '';
      const mime: Record<string, string> = {
        js: 'application/javascript; charset=utf-8',
        css: 'text/css; charset=utf-8',
        svg: 'image/svg+xml',
        png: 'image/png',
        ico: 'image/x-icon',
      };
      res.setHeader('Content-Type', mime[ext] ?? 'application/octet-stream');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.end(data);
    } catch {
      jsonResponse(res, 404, { error: 'not found' });
    }
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

  if (req.method === 'GET' && url.pathname === '/api/usage') {
    const dbId = url.searchParams.get('dbId') ?? undefined;
    const search = url.searchParams.get('search') ?? undefined;
    const limit = parseInt(url.searchParams.get('limit') ?? '0', 10) || undefined;
    const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);
    jsonResponse(res, 200, listUsage(dbId, search, limit, offset));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/usage') {
    try {
      const body = (await readJson<{ title?: string; content?: string; dbId?: string }>(req)) ?? {};
      if (!body.title || !body.title.trim()) {
        jsonResponse(res, 400, { error: '--title 不能为空' });
        return;
      }
      if (!body.content || !body.content.trim()) {
        jsonResponse(res, 400, { error: '--content 不能为空' });
        return;
      }
      if (!body.dbId || !body.dbId.trim()) {
        jsonResponse(res, 400, { error: '--dbId 不能为空（用法必须绑定到具体数据库连接）' });
        return;
      }
      const entry = addUsage(body.title, body.content, body.dbId);
      jsonResponse(res, 200, entry);
    } catch (e) {
      jsonResponse(res, 400, { error: (e as Error).message });
    }
    return;
  }

  if (req.method === 'PUT' && /^\/api\/usage\/\d+$/.test(url.pathname)) {
    try {
      const index = parseInt(url.pathname.replace('/api/usage/', ''), 10);
      const body = (await readJson<{ title?: string; content?: string; dbId?: string }>(req)) ?? {};
      const updated = updateUsage(index, body.title, body.content, body.dbId);
      if (!updated) {
        jsonResponse(res, 404, { error: `未找到序号 [${index}]` });
        return;
      }
      jsonResponse(res, 200, updated);
    } catch (e) {
      jsonResponse(res, 400, { error: (e as Error).message });
    }
    return;
  }

  if (req.method === 'DELETE' && /^\/api\/usage\/\d+$/.test(url.pathname)) {
    const index = parseInt(url.pathname.replace('/api/usage/', ''), 10);
    const removed = removeUsage(index);
    if (!removed) {
      jsonResponse(res, 404, { error: `未找到序号 [${index}]` });
      return;
    }
    jsonResponse(res, 200, { ok: true, removed });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/render') {
    try {
      const body = (await readJson<{ markdown?: string }>(req)) ?? {};
      const html = marked.parse(body.markdown ?? '', { async: false }) as string;
      jsonResponse(res, 200, { html });
    } catch (e) {
      jsonResponse(res, 400, { error: (e as Error).message });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/export/connections') {
    try {
      const body = (await readJson<{
        dbIds?: string[];
        passphrase?: string;
      }>(req)) ?? {};
      const passphrase = body.passphrase ?? '';
      if (passphrase.length > 0 && passphrase.length < 8) {
        jsonResponse(res, 400, {
          error: 'passphrase 留空 = 不加密；填了至少 8 位 = 加密文件',
        });
        return;
      }
      const all = listConnections();
      const wanted = (body.dbIds ?? []).filter(Boolean);
      const selected = wanted.length === 0 ? all : all.filter((c) => wanted.includes(c.dbId));
      if (selected.length === 0) {
        jsonResponse(res, 400, { error: '没有选中任何连接' });
        return;
      }
      const payload = {
        version: 1 as const,
        exportedAt: new Date().toISOString(),
        connections: selected,
      };
      const wantEncrypted = passphrase.length >= 8;
      const buf = wantEncrypted
        ? encryptWithPassphrase(Buffer.from(JSON.stringify(payload), 'utf8'), passphrase)
        : Buffer.from(JSON.stringify(payload), 'utf8');
      const filename = `db-driver-backup-${Date.now()}.${wantEncrypted ? 'exp' : 'json'}`;
      jsonResponse(res, 200, {
        ok: true,
        filename,
        count: selected.length,
        encrypted: wantEncrypted,
        base64: buf.toString('base64'),
        size: buf.length,
      });
    } catch (e) {
      jsonResponse(res, 400, { error: (e as Error).message });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/import/preview') {
    try {
      const body = (await readJson<{ base64?: string; passphrase?: string }>(req)) ?? {};
      if (!body.base64) {
        jsonResponse(res, 400, { error: '缺少 base64' });
        return;
      }
      const buf = Buffer.from(body.base64, 'base64');
      const result = parseImportPayload(buf, body.passphrase ?? '');
      if (!result.ok) {
        jsonResponse(res, 400, { error: result.error, needsPassphrase: result.needsPassphrase });
        return;
      }
      const existing = new Set(listConnections().map((c) => c.dbId));
      jsonResponse(res, 200, {
        ok: true,
        encrypted: result.encrypted,
        total: result.connections.length,
        newCount: result.connections.filter((c) => !existing.has(c.dbId)).length,
        conflictCount: result.connections.filter((c) => existing.has(c.dbId)).length,
        connections: result.connections.map((c) => ({
          dbId: c.dbId,
          type: c.type,
          host: c.host,
          port: c.port,
          user: c.user,
          database: c.database,
          description: c.description,
          exists: existing.has(c.dbId),
        })),
      });
    } catch (e) {
      jsonResponse(res, 400, { error: (e as Error).message });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/import/confirm') {
    try {
      const body = (await readJson<{ base64?: string; passphrase?: string; mode?: 'skip' | 'replace' }>(req)) ?? {};
      if (!body.base64) {
        jsonResponse(res, 400, { error: '缺少 base64' });
        return;
      }
      const buf = Buffer.from(body.base64, 'base64');
      const result = parseImportPayload(buf, body.passphrase ?? '');
      if (!result.ok) {
        jsonResponse(res, 400, { error: result.error, needsPassphrase: result.needsPassphrase });
        return;
      }
      const mode = body.mode === 'replace' ? 'replace' : 'skip';
      const existing = new Set(listConnections().map((c) => c.dbId));
      let added = 0;
      let replaced = 0;
      let skipped = 0;
      const errors: string[] = [];
      for (const c of result.connections) {
        const exists = existing.has(c.dbId);
        if (exists && mode === 'skip') {
          skipped++;
          continue;
        }
        try {
          upsertConnection({
            dbId: c.dbId,
            type: c.type,
            host: c.host,
            port: c.port,
            user: c.user,
            password: c.password,
            database: c.database,
            schema: c.schema,
            description: c.description,
            permissions: c.permissions,
          });
          if (exists) replaced++;
          else added++;
        } catch (e) {
          errors.push(`${c.dbId}: ${(e as Error).message}`);
        }
      }
      jsonResponse(res, 200, {
        ok: true,
        mode,
        total: result.connections.length,
        added,
        replaced,
        skipped,
        errors,
      });
    } catch (e) {
      jsonResponse(res, 400, { error: (e as Error).message });
    }
    return;
  }

  jsonResponse(res, 404, { error: 'not found' });
}

function parseImportPayload(buf: Buffer, passphrase: string): {
  ok: true;
  encrypted: boolean;
  connections: Array<Omit<DbConnectionConfig, 'createdAt' | 'updatedAt'>>;
} | { ok: false; error: string; needsPassphrase?: boolean } {
  let json: string;
  let encrypted = false;
  if (passphrase) {
    try {
      const decrypted = decryptWithPassphrase(buf, passphrase);
      json = decrypted.toString('utf8');
      encrypted = true;
    } catch (e) {
      return { ok: false, error: '解密失败：' + (e as Error).message };
    }
  } else {
    json = buf.toString('utf8');
  }
  let payload: { version?: number; exportedAt?: string; connections?: unknown };
  try {
    payload = JSON.parse(json);
  } catch {
    if (!passphrase) {
      return { ok: false, error: 'JSON 解析失败，且未提供 passphrase（文件可能已加密）', needsPassphrase: true };
    }
    return { ok: false, error: '解密后的内容不是有效 JSON' };
  }
  if (payload.version !== 1 || !Array.isArray(payload.connections)) {
    return { ok: false, error: '不是有效的 db-driver 备份文件（缺少 version/connections）' };
  }
  return { ok: true, encrypted, connections: payload.connections as Array<Omit<DbConnectionConfig, 'createdAt' | 'updatedAt'>> };
}

function sanitize(conn: DbConnectionConfig): Omit<DbConnectionConfig, 'password'> & { password: string } {
  return { ...conn, password: conn.password };
}