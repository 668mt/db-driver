import { useEffect, useState } from 'react';
import { api } from '../api.js';
import type { DbConnectionConfig } from '../types.js';

const POLL_MS = 2000;

export function useConnections(): {
  list: DbConnectionConfig[];
  reload: () => Promise<void>;
} {
  const [list, setList] = useState<DbConnectionConfig[]>([]);

  const reload = async () => {
    try {
      const next = await api.listConnections();
      setList((prev) => {
        if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
        return next;
      });
    } catch {
      // ignore polling errors
    }
  };

  useEffect(() => {
    reload();
    const id = setInterval(reload, POLL_MS);
    return () => clearInterval(id);
  }, []);

  return { list, reload };
}