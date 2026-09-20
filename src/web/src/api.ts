import type { DbConnectionConfig, UsageEntry } from './types.js';

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  listConnections(): Promise<DbConnectionConfig[]> {
    return jsonFetch('/api/connections');
  },
  getConnection(dbId: string): Promise<DbConnectionConfig> {
    return jsonFetch(`/api/connections/${encodeURIComponent(dbId)}`);
  },
  saveConnection(conn: Omit<DbConnectionConfig, 'createdAt' | 'updatedAt'>): Promise<DbConnectionConfig> {
    return jsonFetch('/api/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(conn),
    });
  },
  deleteConnection(dbId: string): Promise<{ ok: true }> {
    return jsonFetch(`/api/connections/${encodeURIComponent(dbId)}`, { method: 'DELETE' });
  },
  testConnection(conn: Omit<DbConnectionConfig, 'createdAt' | 'updatedAt'>): Promise<{ ok: boolean; error?: string }> {
    return jsonFetch('/api/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(conn),
    });
  },
  listUsage(dbId?: string, search?: string): Promise<UsageEntry[]> {
    const params: string[] = [];
    if (dbId) params.push(`dbId=${encodeURIComponent(dbId)}`);
    if (search) params.push(`search=${encodeURIComponent(search)}`);
    const q = params.length ? '?' + params.join('&') : '';
    return jsonFetch(`/api/usage${q}`);
  },
  saveUsage(title: string, content: string, dbId: string): Promise<UsageEntry> {
    return jsonFetch('/api/usage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content, dbId }),
    });
  },
  updateUsage(index: number, title: string, content: string, dbId: string): Promise<UsageEntry> {
    return jsonFetch(`/api/usage/${index}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content, dbId }),
    });
  },
  deleteUsage(index: number): Promise<{ ok: true; removed: UsageEntry }> {
    return jsonFetch(`/api/usage/${index}`, { method: 'DELETE' });
  },
  renderMarkdown(md: string): Promise<{ html: string }> {
    return jsonFetch('/api/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown: md }),
    });
  },
};