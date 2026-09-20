import { useEffect, useState } from 'react';
import { api } from '../api.js';
import type { UsageEntry } from '../types.js';

const POLL_MS = 2000;

export function useUsages(
  dbId?: string,
  search?: string,
  active: boolean = true,
  hasCurrent: boolean = true
): {
  list: UsageEntry[];
  reload: () => Promise<void>;
} {
  const [list, setList] = useState<UsageEntry[]>([]);

  const reload = async () => {
    try {
      const next = await api.listUsage(dbId, search);
      setList((prev) => {
        if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
        return next;
      });
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    reload();
    if (!active || hasCurrent) return;
    const id = setInterval(reload, POLL_MS);
    return () => clearInterval(id);
  }, [dbId, search, active, hasCurrent]);

  return { list, reload };
}