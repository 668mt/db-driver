import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import type { UsageEntry } from '../types.js';

const POLL_MS = 2000;

export function useUsages(
  dbId?: string,
  search?: string,
  active: boolean = true,
  hasCurrent: boolean = false
): {
  list: UsageEntry[];
  reload: () => Promise<void>;
} {
  const [list, setList] = useState<UsageEntry[]>([]);
  const hasCurrentRef = useRef(hasCurrent);
  hasCurrentRef.current = hasCurrent;

  const reload = async () => {
    try {
      const next = await api.listUsage(dbId, search);
      setList((prev) => {
        if (!hasCurrentRef.current) {
          if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
          return next;
        }
        // 编辑中：只在新条目数 / dbId 集合变化时刷新（避免覆盖用户输入）
        if (prev.length !== next.length) return next;
        const prevDbIds = prev.map((u) => u.dbId).join(',');
        const nextDbIds = next.map((u) => u.dbId).join(',');
        if (prevDbIds !== nextDbIds) return next;
        return prev;
      });
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    reload();
    if (!active) return;
    const id = setInterval(reload, POLL_MS);
    return () => clearInterval(id);
  }, [dbId, search, active]);

  return { list, reload };
}