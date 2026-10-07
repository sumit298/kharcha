import type { SqlDatabase } from '../sql';

/**
 * Numbered migrations, applied in order; PRAGMA user_version records the last one applied.
 * Never edit a shipped migration — add a new one. Every table carries id/created_at/updated_at/
 * deleted_at so a future sync layer can replicate rows (ARCHITECTURE §5).
 */
export const MIGRATIONS: readonly string[] = [
  /* 1 */ `
  CREATE TABLE categories (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    parent_id TEXT REFERENCES categories(id),
    kind TEXT NOT NULL,
    icon TEXT,
    color TEXT,
    is_system INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );
  CREATE TABLE accounts (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    institution TEXT,
    last4 TEXT,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );
  CREATE TABLE merchant_rules (
    id TEXT PRIMARY KEY NOT NULL,
    merchant_name TEXT NOT NULL,
    match_field TEXT NOT NULL,
    match_type TEXT NOT NULL,
    pattern TEXT NOT NULL,
    category_id TEXT,
    subcategory_id TEXT,
    transaction_type TEXT,
    default_payment_method TEXT,
    account_id TEXT,
    notes TEXT,
    origin TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    hit_count INTEGER NOT NULL DEFAULT 0,
    last_matched_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );
  CREATE TABLE recurring_transactions (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    amount_minor INTEGER NOT NULL,
    currency TEXT NOT NULL,
    type TEXT NOT NULL,
    frequency TEXT NOT NULL,
    interval INTEGER NOT NULL DEFAULT 1,
    next_due_at INTEGER NOT NULL,
    anchor_day INTEGER,
    category_id TEXT,
    subcategory_id TEXT,
    account_id TEXT,
    merchant_name TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );
  CREATE TABLE transactions (
    id TEXT PRIMARY KEY NOT NULL,
    amount_minor INTEGER NOT NULL,
    currency TEXT NOT NULL,
    type TEXT NOT NULL,
    direction TEXT NOT NULL,
    merchant_name TEXT,
    merchant_raw TEXT,
    payee_vpa TEXT,
    category_id TEXT,
    subcategory_id TEXT,
    category_source TEXT NOT NULL,
    source TEXT NOT NULL,
    source_app TEXT,
    payment_method TEXT NOT NULL,
    account_id TEXT,
    account_last4 TEXT,
    reference TEXT,
    occurred_at INTEGER NOT NULL,
    notes TEXT,
    confidence REAL NOT NULL,
    status TEXT NOT NULL,
    review_reasons TEXT NOT NULL DEFAULT '[]',
    recurring_transaction_id TEXT,
    linked_transaction_id TEXT,
    duplicate_of_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );
  CREATE INDEX transactions_occurred_at ON transactions(occurred_at);
  CREATE INDEX transactions_amount ON transactions(amount_minor, occurred_at);
  CREATE INDEX transactions_reference ON transactions(reference);
  CREATE INDEX transactions_status ON transactions(status);
  CREATE TABLE raw_events (
    id TEXT PRIMARY KEY NOT NULL,
    queue_id INTEGER,
    key TEXT NOT NULL,
    package_name TEXT NOT NULL,
    app_name TEXT,
    posted_at INTEGER NOT NULL,
    message_index INTEGER NOT NULL DEFAULT 0,
    content_hash TEXT NOT NULL,
    payload TEXT,
    status TEXT NOT NULL,
    parser_id TEXT,
    transaction_id TEXT,
    error TEXT,
    received_at INTEGER NOT NULL,
    processed_at INTEGER,
    pipeline_version INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX raw_events_hash ON raw_events(content_hash, posted_at);
  CREATE INDEX raw_events_status ON raw_events(status);
  CREATE TABLE budgets (
    id TEXT PRIMARY KEY NOT NULL,
    category_id TEXT,
    amount_minor INTEGER NOT NULL,
    effective_from TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );
  CREATE TABLE settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  `,
];

export async function runMigrations(db: SqlDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version] as string;
    const next = version + 1;
    await db.transaction(async (tx) => {
      await tx.execAsync(sql);
      await tx.execAsync(`PRAGMA user_version = ${next}`);
    });
    version = next;
  }
  return version;
}
