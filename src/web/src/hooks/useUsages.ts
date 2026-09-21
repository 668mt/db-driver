import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import type { UsageEntry } from '../types.js';

const POLL_MS = 2000;
const DEFAULT_LIMIT = 20;

export function useUsages(
  dbId?: string,
  search?: string,
  active: boolean = true,
  hasCurrent: boolean = false,
  limit: number = DEFAULT_LIMIT
): {
  list: UsageEntry[];
  total: number;
  hasMore: boolean;
  loading: boolean;
  loadMore: () => Promise<void>;
  reload: () => Promise<void>;
} {
  const [list, setList] = useState<UsageEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loadedCount, setLoadedCount] = useState(limit);
  const [loading, setLoading] = useState(false);
  const hasCurrentRef = useRef(hasCurrent);
  hasCurrentRef.current = hasCurrent;

  const reload = async () => {
    try {
      const res = await api.listUsage(dbId, search, loadedCount, 0);
      setTotal(res.total);
      setList((prev) => {
        if (!hasCurrentRef.current) return res.entries;
        if (prev.length !== res.entries.length) return res.entries;
        const prevIds = prev.map((u) => u.index).join(',');
        const nextIds = res.entries.map((u) => u.index).join(',');
        if (prevIds !== nextIds) return res.entries;
        return prev;
      });
    } catch {
      /* ignore */
    }
  };

  const loadMore = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const next = await api.listUsage(dbId, search, limit, list.length);
      setTotal(next.total);
      setList((prev) => {
        const seen = new Set(prev.map((u) => u.index));
        const merged = [...prev];
        for (const e of next.entries) {
          if (!seen.has(e.index)) merged.push(e);
        }
        return merged;
      });
      setLoadedCount((c) => c + limit);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoadedCount(limit);
    setList([]);
    setTotal(0);
  }, [dbId, search, limit]);

  useEffect(() => {
    reload();
    if (!active) return;
    const id = setInterval(reload, POLL_MS);
    return () => clearInterval(id);
  }, [dbId, search, active, loadedCount]);

  return {
    list,
    total,
    hasMore: list.length < total,
    loading,
    loadMore,
    reload,
  };
}