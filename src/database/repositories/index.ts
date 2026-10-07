import { buildDefaultCategoryRows } from '@/domain/categories/defaults';
import type {
  Account,
  Budget,
  Category,
  MerchantRule,
  RawEvent,
  RawEventStatus,
  RecurringTransaction,
  Transaction,
  TransactionType,
} from '@/types';

import type { SqlExecutor, SqlValue } from '../sql';
import { Table } from './table';

export const categoriesTable = new Table<Category>(
  'categories',
  ['id', 'name', 'parentId', 'kind', 'icon', 'color', 'isSystem', 'sortOrder', 'createdAt', 'updatedAt', 'deletedAt'],
  { isSystem: 'bool' },
);
export const accountsTable = new Table<Account>(
  'accounts',
  ['id', 'name', 'type', 'institution', 'last4', 'isDefault', 'createdAt', 'updatedAt', 'deletedAt'],
  { isDefault: 'bool' },
);
export const rulesTable = new Table<MerchantRule>(
  'merchant_rules',
  [
    'id', 'merchantName', 'matchField', 'matchType', 'pattern', 'categoryId', 'subcategoryId', 'transactionType',
    'defaultPaymentMethod', 'accountId', 'notes', 'origin', 'enabled', 'hitCount', 'lastMatchedAt', 'createdAt',
    'updatedAt', 'deletedAt',
  ],
  { enabled: 'bool' },
);
export const recurringTable = new Table<RecurringTransaction>(
  'recurring_transactions',
  [
    'id', 'name', 'amountMinor', 'currency', 'type', 'frequency', 'interval', 'nextDueAt', 'anchorDay', 'categoryId',
    'subcategoryId', 'accountId', 'merchantName', 'isActive', 'createdAt', 'updatedAt', 'deletedAt',
  ],
  { isActive: 'bool' },
);
export const transactionsTable = new Table<Transaction>(
  'transactions',
  [
    'id', 'amountMinor', 'currency', 'type', 'direction', 'merchantName', 'merchantRaw', 'payeeVpa', 'categoryId',
    'subcategoryId', 'categorySource', 'source', 'sourceApp', 'paymentMethod', 'accountId', 'accountLast4', 'reference',
    'occurredAt', 'notes', 'confidence', 'status', 'reviewReasons', 'recurringTransactionId', 'linkedTransactionId',
    'duplicateOfId', 'createdAt', 'updatedAt', 'deletedAt',
  ],
  { reviewReasons: 'json' },
);
export const rawEventsTable = new Table<RawEvent>(
  'raw_events',
  [
    'id', 'queueId', 'key', 'packageName', 'appName', 'postedAt', 'messageIndex', 'contentHash', 'payload', 'status',
    'parserId', 'transactionId', 'error', 'receivedAt', 'processedAt', 'pipelineVersion',
  ],
  { payload: 'json' },
);
export const budgetsTable = new Table<Budget>('budgets', [
  'id', 'categoryId', 'amountMinor', 'effectiveFrom', 'createdAt', 'updatedAt', 'deletedAt',
]);

const LIVE = 'deleted_at IS NULL';

// ─── Categories ───────────────────────────────────────────────────────────────

export const categoryRepo = {
  list: (db: SqlExecutor) => categoriesTable.where(db, `WHERE ${LIVE} ORDER BY sort_order, name`),
  upsert: (db: SqlExecutor, c: Category) => categoriesTable.upsert(db, c),
  /** Inserts built-in categories that are missing (idempotent). */
  async seedDefaults(db: SqlExecutor, now: number): Promise<void> {
    for (const row of buildDefaultCategoryRows(now)) {
      await db.runAsync('INSERT OR IGNORE INTO categories (' + categoriesTable.columns.join(', ') + ') VALUES (' +
        categoriesTable.columns.map(() => '?').join(', ') + ')', categoriesTable.toRow(row));
    }
  },
  /**
   * Soft-deletes a custom category and its subcategories; their transactions become
   * uncategorized. Built-in categories can't be deleted (rename/hide them instead).
   */
  async remove(db: SqlExecutor, id: string, now: number): Promise<boolean> {
    const cat = await categoriesTable.get(db, id);
    if (!cat || cat.isSystem) return false;
    await db.runAsync(`UPDATE categories SET deleted_at = ?, updated_at = ? WHERE id = ? OR parent_id = ?`, [now, now, id, id]);
    await db.runAsync(
      `UPDATE transactions SET category_id = NULL, subcategory_id = NULL, category_source = 'none', updated_at = ?
       WHERE category_id = ? OR subcategory_id = ? OR subcategory_id IN (SELECT id FROM categories WHERE parent_id = ?)`,
      [now, id, id, id],
    );
    return true;
  },
};

// ─── Accounts ─────────────────────────────────────────────────────────────────

export const accountRepo = {
  list: (db: SqlExecutor) => accountsTable.where(db, `WHERE ${LIVE} ORDER BY is_default DESC, name`),
  upsert: (db: SqlExecutor, a: Account) => accountsTable.upsert(db, a),
  /** Account whose last digits match (3-digit hints match 4-digit accounts by suffix). */
  async findByLast4(db: SqlExecutor, last4: string): Promise<Account | null> {
    const accounts = await accountsTable.where(db, `WHERE ${LIVE} AND last4 IS NOT NULL`);
    return accounts.find((a) => a.last4 !== null && (a.last4.endsWith(last4) || last4.endsWith(a.last4))) ?? null;
  },
  async remove(db: SqlExecutor, id: string, now: number): Promise<void> {
    await db.runAsync('UPDATE accounts SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);
    await db.runAsync('UPDATE transactions SET account_id = NULL, updated_at = ? WHERE account_id = ?', [now, id]);
  },
};

// ─── Merchant rules ───────────────────────────────────────────────────────────

export const ruleRepo = {
  list: (db: SqlExecutor) => rulesTable.where(db, `WHERE ${LIVE} ORDER BY origin, merchant_name`),
  upsert: (db: SqlExecutor, r: MerchantRule) => rulesTable.upsert(db, r),
  async recordHit(db: SqlExecutor, id: string, now: number): Promise<void> {
    await db.runAsync('UPDATE merchant_rules SET hit_count = hit_count + 1, last_matched_at = ? WHERE id = ?', [now, id]);
  },
  async remove(db: SqlExecutor, id: string, now: number): Promise<void> {
    await db.runAsync('UPDATE merchant_rules SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);
  },
};

// ─── Transactions ─────────────────────────────────────────────────────────────

export interface TransactionFilter {
  from?: number;
  to?: number;
  search?: string;
  categoryId?: string;
  merchantName?: string;
  types?: TransactionType[];
  accountId?: string;
  sourceApp?: string;
  source?: Transaction['source'];
  needsReview?: boolean;
  limit?: number;
}

export const transactionRepo = {
  get: (db: SqlExecutor, id: string) => transactionsTable.get(db, id),
  insert: (db: SqlExecutor, t: Transaction) => transactionsTable.insert(db, t),
  update: (db: SqlExecutor, t: Transaction) => transactionsTable.upsert(db, t),
  /** Live transactions with this amount in [from, to] — dedup candidates. */
  candidates: (db: SqlExecutor, amountMinor: number, from: number, to: number) =>
    transactionsTable.where(db, `WHERE ${LIVE} AND amount_minor = ? AND occurred_at BETWEEN ? AND ?`, [amountMinor, from, to]),
  inRange: (db: SqlExecutor, from: number, to: number) =>
    transactionsTable.where(db, `WHERE ${LIVE} AND occurred_at >= ? AND occurred_at < ? ORDER BY occurred_at DESC`, [from, to]),
  async list(db: SqlExecutor, f: TransactionFilter = {}): Promise<Transaction[]> {
    const where: string[] = [LIVE];
    const params: SqlValue[] = [];
    if (f.from !== undefined) {
      where.push('occurred_at >= ?');
      params.push(f.from);
    }
    if (f.to !== undefined) {
      where.push('occurred_at < ?');
      params.push(f.to);
    }
    if (f.categoryId) {
      where.push('(category_id = ? OR subcategory_id = ?)');
      params.push(f.categoryId, f.categoryId);
    }
    if (f.merchantName) {
      where.push('merchant_name = ?');
      params.push(f.merchantName);
    }
    if (f.accountId) {
      where.push('account_id = ?');
      params.push(f.accountId);
    }
    if (f.sourceApp) {
      where.push('source_app = ?');
      params.push(f.sourceApp);
    }
    if (f.source) {
      where.push('source = ?');
      params.push(f.source);
    }
    if (f.types?.length) {
      where.push(`type IN (${f.types.map(() => '?').join(',')})`);
      params.push(...f.types);
    }
    if (f.needsReview) where.push(`status = 'needs_review'`);
    if (f.search) {
      const like = `%${f.search.toLowerCase()}%`;
      where.push('(lower(merchant_name) LIKE ? OR lower(merchant_raw) LIKE ? OR lower(payee_vpa) LIKE ? OR lower(notes) LIKE ?)');
      params.push(like, like, like, like);
    }
    const limit = f.limit ? ` LIMIT ${Math.floor(f.limit)}` : '';
    return transactionsTable.where(db, `WHERE ${where.join(' AND ')} ORDER BY occurred_at DESC${limit}`, params);
  },
  async countNeedsReview(db: SqlExecutor): Promise<number> {
    const row = await db.getFirstAsync<{ n: number }>(`SELECT count(*) AS n FROM transactions WHERE ${LIVE} AND status = 'needs_review'`);
    return row?.n ?? 0;
  },
  async remove(db: SqlExecutor, id: string, now: number): Promise<void> {
    await db.runAsync('UPDATE transactions SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);
  },
};

// ─── Raw events ───────────────────────────────────────────────────────────────

/** Identical content within this window is a re-post, not a new payment. */
export const REPOST_WINDOW_MS = 2 * 60_000;

export const rawEventRepo = {
  get: (db: SqlExecutor, id: string) => rawEventsTable.get(db, id),
  /**
   * ARCHITECTURE §7 layer 1. Inserts unless an event with the same content hash was posted at
   * the same time (re-read from the shade) or within REPOST_WINDOW_MS (re-post/update). Two
   * identical notifications further apart are two events. Returns the stored event and whether
   * it is new.
   */
  async insertIfNew(db: SqlExecutor, event: RawEvent): Promise<{ event: RawEvent; isNew: boolean }> {
    const existing = await db.getFirstAsync<Record<string, SqlValue>>(
      `SELECT * FROM raw_events WHERE content_hash = ? AND posted_at BETWEEN ? AND ? LIMIT 1`,
      [event.contentHash, event.postedAt - REPOST_WINDOW_MS, event.postedAt + REPOST_WINDOW_MS],
    );
    if (existing) return { event: rawEventsTable.fromRow(existing), isNew: false };
    await rawEventsTable.insert(db, event);
    return { event, isNew: true };
  },
  update: (db: SqlExecutor, e: RawEvent) => rawEventsTable.upsert(db, e),
  byStatus: (db: SqlExecutor, statuses: RawEventStatus[], limit = 200) =>
    rawEventsTable.where(db, `WHERE status IN (${statuses.map(() => '?').join(',')}) ORDER BY posted_at DESC LIMIT ${limit}`, statuses),
  outdated: (db: SqlExecutor, pipelineVersion: number) =>
    rawEventsTable.where(db, 'WHERE pipeline_version < ? AND payload IS NOT NULL ORDER BY posted_at', [pipelineVersion]),
  recent: (db: SqlExecutor, limit = 100) => rawEventsTable.where(db, `ORDER BY received_at DESC LIMIT ${limit}`),
  async countByStatus(db: SqlExecutor, status: RawEventStatus): Promise<number> {
    const row = await db.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM raw_events WHERE status = ?', [status]);
    return row?.n ?? 0;
  },
  /** Bulk status change, e.g. dismiss every redacted event from Review. */
  async changeStatus(db: SqlExecutor, from: RawEventStatus, to: RawEventStatus): Promise<void> {
    await db.runAsync('UPDATE raw_events SET status = ? WHERE status = ?', [to, from]);
  },
};

// ─── Budgets, recurring, settings ─────────────────────────────────────────────

export const budgetRepo = {
  list: (db: SqlExecutor) => budgetsTable.where(db, `WHERE ${LIVE}`),
  upsert: (db: SqlExecutor, b: Budget) => budgetsTable.upsert(db, b),
  async remove(db: SqlExecutor, id: string, now: number): Promise<void> {
    await db.runAsync('UPDATE budgets SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);
  },
};

export const recurringRepo = {
  list: (db: SqlExecutor) => recurringTable.where(db, `WHERE ${LIVE} ORDER BY next_due_at`),
  get: (db: SqlExecutor, id: string) => recurringTable.get(db, id),
  upsert: (db: SqlExecutor, r: RecurringTransaction) => recurringTable.upsert(db, r),
  async remove(db: SqlExecutor, id: string, now: number): Promise<void> {
    await db.runAsync('UPDATE recurring_transactions SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);
  },
};

export const settingsRepo = {
  async get<T>(db: SqlExecutor, key: string, fallback: T): Promise<T> {
    const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
    return row ? (JSON.parse(row.value) as T) : fallback;
  },
  async set(db: SqlExecutor, key: string, value: unknown, now: number): Promise<void> {
    await db.runAsync(
      'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
      [key, JSON.stringify(value), now],
    );
  },
};

/** "Delete all data": wipes every table (the native queue is cleared separately). */
export async function deleteAllData(db: SqlExecutor): Promise<void> {
  await db.execAsync(
    'DELETE FROM raw_events; DELETE FROM transactions; DELETE FROM merchant_rules; DELETE FROM budgets; DELETE FROM recurring_transactions; DELETE FROM accounts; DELETE FROM settings; DELETE FROM categories;',
  );
}
