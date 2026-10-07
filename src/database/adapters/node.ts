/** Test-only adapter over Node's built-in SQLite. Never imported by app code. */
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import type { SqlDatabase, SqlExecutor, SqlParams } from '../sql';

function bind(params?: SqlParams): SQLInputValue[] {
  if (!params) return [];
  if (Array.isArray(params)) return params as SQLInputValue[];
  throw new Error('node adapter: use positional parameters');
}

export function openNodeDatabase(path = ':memory:'): SqlDatabase {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  let queue: Promise<unknown> = Promise.resolve();
  const executor: SqlExecutor = {
    execAsync: async (sql) => {
      db.exec(sql);
    },
    runAsync: async (sql, params) => {
      const r = db.prepare(sql).run(...bind(params));
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
    },
    getFirstAsync: async <T>(sql: string, params?: SqlParams) => (db.prepare(sql).get(...bind(params)) as T | undefined) ?? null,
    getAllAsync: async <T>(sql: string, params?: SqlParams) => db.prepare(sql).all(...bind(params)) as T[],
  };
  return {
    ...executor,
    transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
      const run = queue.then(async () => {
        db.exec('BEGIN EXCLUSIVE');
        try {
          const result = await fn(executor);
          db.exec('COMMIT');
          return result;
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
      });
      queue = run.catch(() => undefined);
      return run;
    },
    closeAsync: async () => db.close(),
  };
}
