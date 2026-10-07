import * as SQLite from 'expo-sqlite';

import type { SqlDatabase, SqlExecutor, SqlParams, SqlRunResult } from '../sql';

type Txn = Parameters<Parameters<SQLite.SQLiteDatabase["withExclusiveTransactionAsync"]>[0]>[0];

function wrap(db: SQLite.SQLiteDatabase | Txn): SqlExecutor {
  return {
    execAsync: (sql) => db.execAsync(sql),
    runAsync: async (sql, params?: SqlParams): Promise<SqlRunResult> => {
      const r = await db.runAsync(sql, (params ?? []) as SQLite.SQLiteBindParams);
      return { changes: r.changes, lastInsertRowId: r.lastInsertRowId };
    },
    getFirstAsync: <T>(sql: string, params?: SqlParams) => db.getFirstAsync<T>(sql, (params ?? []) as SQLite.SQLiteBindParams),
    getAllAsync: <T>(sql: string, params?: SqlParams) => db.getAllAsync<T>(sql, (params ?? []) as SQLite.SQLiteBindParams),
  };
}

/** Opens kharcha.db with WAL and foreign keys (ARCHITECTURE §2). */
export async function openExpoDatabase(name = 'kharcha.db'): Promise<SqlDatabase> {
  const db = await SQLite.openDatabaseAsync(name);
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  return {
    ...wrap(db),
    async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
      let result: T | undefined;
      await db.withExclusiveTransactionAsync(async (txn) => {
        result = await fn(wrap(txn));
      });
      return result as T;
    },
    closeAsync: () => db.closeAsync(),
  };
}
