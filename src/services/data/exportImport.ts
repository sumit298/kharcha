import {
  accountsTable,
  budgetsTable,
  categoriesTable,
  rawEventsTable,
  recurringTable,
  rulesTable,
  transactionsTable,
} from '@/database/repositories';
import type { SqlDatabase, SqlValue } from '@/database/sql';
import type { Category, Transaction } from '@/types';

const TABLES = [categoriesTable, accountsTable, rulesTable, recurringTable, budgetsTable, transactionsTable, rawEventsTable] as const;

export const BACKUP_FORMAT = 'kharcha-backup';
export const BACKUP_VERSION = 1;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: number;
  tables: Record<string, unknown[]>;
  settings: { key: string; value: string; updated_at: number }[];
}

function csvCell(value: string | number | null): string {
  if (value === null) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const pad = (n: number) => String(n).padStart(2, '0');
function localDateTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Spreadsheet-friendly CSV; amounts in rupees with 2 decimals, negative for money out. */
export function transactionsToCsv(txs: readonly Transaction[], categories: readonly Category[]): string {
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const header = ['date', 'amount', 'currency', 'type', 'merchant', 'category', 'subcategory', 'payment_method', 'source', 'source_app', 'reference', 'status', 'notes', 'id'];
  const rows = txs.map((t) => {
    const signed = t.direction === 'debit' ? -t.amountMinor : t.amountMinor;
    return [
      localDateTime(t.occurredAt),
      (signed / 100).toFixed(2),
      t.currency,
      t.type,
      t.merchantName,
      t.categoryId ? (names.get(t.categoryId) ?? t.categoryId) : null,
      t.subcategoryId ? (names.get(t.subcategoryId) ?? t.subcategoryId) : null,
      t.paymentMethod,
      t.source,
      t.sourceApp,
      t.reference,
      t.status,
      t.notes,
      t.id,
    ].map(csvCell).join(',');
  });
  return [header.join(','), ...rows].join('\n') + '\n';
}

/** Full backup of every table (raw events included, so history can be re-parsed after restore). */
export async function createBackup(db: SqlDatabase, now = Date.now()): Promise<Backup> {
  const tables: Record<string, unknown[]> = {};
  for (const table of TABLES) tables[table.name] = await table.where(db, '');
  const settings = await db.getAllAsync<{ key: string; value: string; updated_at: number }>('SELECT * FROM settings');
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now, tables, settings };
}

export function parseBackup(text: string): Backup {
  const data = JSON.parse(text) as Partial<Backup>;
  if (data.format !== BACKUP_FORMAT || typeof data.version !== 'number' || !data.tables) {
    throw new Error('This file is not a Kharcha backup.');
  }
  if (data.version > BACKUP_VERSION) throw new Error('This backup was made by a newer version of Kharcha.');
  return data as Backup;
}

/** Replaces all data with the backup, in one transaction (all or nothing). */
export async function restoreBackup(db: SqlDatabase, backup: Backup): Promise<void> {
  await db.transaction(async (tx) => {
    for (const table of [...TABLES].reverse()) await tx.runAsync(`DELETE FROM ${table.name}`);
    await tx.runAsync('DELETE FROM settings');
    for (const table of TABLES) {
      for (const row of backup.tables[table.name] ?? []) {
        await table.insert(tx, row as never);
      }
    }
    for (const s of backup.settings ?? []) {
      await tx.runAsync('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)', [s.key, s.value, s.updated_at] as SqlValue[]);
    }
  });
}
