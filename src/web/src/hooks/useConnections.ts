import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import type { DbConnectionConfig } from '../types.js';

const POLL_MS = 2000;
const TEST_CONCURRENCY = 3;

export type TestStatus = 'unknown' | 'testing' | 'ok' | 'failed';

export interface ConnectionState extends DbConnectionConfig {
  testStatus: TestStatus;
  testError?: string;
}

export function useConnections(): {
  list: ConnectionState[];
  reload: () => Promise<void>;
  retest: (dbId: string) => Promise<void>;
} {
  const [list, setList] = useState<ConnectionState[]>([]);
  const testedRef = useRef<Set<string>>(new Set());
  const testingRef = useRef<Set<string>>(new Set());

  const reload = async () => {
    try {
      const next = await api.listConnections();
      setList((prev) => {
        const merged: ConnectionState[] = next.map((c) => {
          const old = prev.find((p) => p.dbId === c.dbId);
          return {
            ...c,
            testStatus: old?.testStatus ?? 'unknown',
            testError: old?.testError,
          };
        });
        return merged;
      });
      const newDbIds = next
        .map((c) => c.dbId)
        .filter((id) => !testedRef.current.has(id));
      if (newDbIds.length > 0) {
        newDbIds.forEach((id) => testedRef.current.add(id));
        runTests(next.filter((c) => newDbIds.includes(c.dbId)));
      }
    } catch {
      /* ignore polling errors */
    }
  };

  const runTests = async (conns: DbConnectionConfig[]) => {
    const queue = [...conns];
    const workers: Promise<void>[] = [];
    for (let i = 0; i < TEST_CONCURRENCY; i++) {
      workers.push(
        (async () => {
          while (queue.length > 0) {
            const conn = queue.shift();
            if (!conn) break;
            if (testingRef.current.has(conn.dbId)) continue;
            testingRef.current.add(conn.dbId);
            setList((prev) =>
              prev.map((p) =>
                p.dbId === conn.dbId
                  ? { ...p, testStatus: 'testing', testError: undefined }
                  : p
              )
            );
            try {
              const res = await api.testConnection(conn);
              setList((prev) =>
                prev.map((p) =>
                  p.dbId === conn.dbId
                    ? {
                        ...p,
                        testStatus: res.ok ? 'ok' : 'failed',
                        testError: res.ok ? undefined : res.error,
                      }
                    : p
                )
              );
            } catch (e) {
              setList((prev) =>
                prev.map((p) =>
                  p.dbId === conn.dbId
                    ? {
                        ...p,
                        testStatus: 'failed',
                        testError: (e as Error).message,
                      }
                    : p
                )
              );
            } finally {
              testingRef.current.delete(conn.dbId);
            }
          }
        })()
      );
    }
    await Promise.all(workers);
  };

  const retest = async (dbId: string) => {
    const conn = list.find((c) => c.dbId === dbId);
    if (!conn) return;
    if (testingRef.current.has(dbId)) return;
    await runTests([conn]);
  };

  useEffect(() => {
    reload();
    const id = setInterval(reload, POLL_MS);
    return () => clearInterval(id);
  }, []);

  return { list, reload, retest };
}