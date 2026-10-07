/**
 * Minimal SQL interface the repositories depend on. Shaped after expo-sqlite's async API so
 * the expo adapter is thin, and implementable over node:sqlite for tests.
 */
export type SqlValue = string | number | null | Uint8Array;
export type SqlParams = SqlValue[] | Record<string, SqlValue>;

export interface SqlRunResult {
  changes: number;
  lastInsertRowId: number;
}

/** Anything that can run statements: the database itself or an open transaction. */
export interface SqlExecutor {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: SqlParams): Promise<SqlRunResult>;
  getFirstAsync<T>(sql: string, params?: SqlParams): Promise<T | null>;
  getAllAsync<T>(sql: string, params?: SqlParams): Promise<T[]>;
}

export interface SqlDatabase extends SqlExecutor {
  /**
   * Run `fn` in an exclusive transaction. Only statements issued through the provided
   * executor are part of it (expo-sqlite: withExclusiveTransactionAsync). Commits when `fn`
   * resolves, rolls back when it throws.
   */
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
  closeAsync(): Promise<void>;
}
