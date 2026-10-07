import { merchantKey } from '@/domain/merchants/canonical';
import { advanceAfterPayment } from '@/domain/recurring/schedule';
import { recurringRepo, ruleRepo, transactionRepo } from '@/database/repositories';
import type { SqlDatabase } from '@/database/sql';
import { learnFromCorrection } from '@/services/categorization/learn';
import type { PaymentMethod, ReviewReason, Transaction, TransactionType } from '@/types';
import { newId } from '@/utils/ids';

export interface ManualEntry {
  amountMinor: number;
  type?: TransactionType;
  categoryId: string | null;
  subcategoryId?: string | null;
  merchantName?: string | null;
  notes?: string | null;
  occurredAt?: number;
  accountId?: string | null;
  paymentMethod?: PaymentMethod;
}

const CATEGORY_REASONS: ReviewReason[] = ['uncategorized', 'unknown_merchant', 'possible_transfer', 'low_confidence'];

function withReasons(tx: Transaction, reasons: ReviewReason[], now: number): Transaction {
  return { ...tx, reviewReasons: reasons, status: tx.status === 'ignored' ? 'ignored' : reasons.length ? 'needs_review' : 'confirmed', updatedAt: now };
}

/** Quick add (cash etc.): only amount and category are needed. */
export async function addManualTransaction(db: SqlDatabase, entry: ManualEntry, now = Date.now()): Promise<Transaction> {
  const type = entry.type ?? 'expense';
  const tx: Transaction = {
    id: newId(now),
    amountMinor: entry.amountMinor,
    currency: 'INR',
    type,
    direction: type === 'income' || type === 'refund' ? 'credit' : 'debit',
    merchantName: entry.merchantName?.trim() || null,
    merchantRaw: null,
    payeeVpa: null,
    categoryId: entry.categoryId,
    subcategoryId: entry.subcategoryId ?? null,
    categorySource: 'user',
    source: 'manual',
    sourceApp: null,
    paymentMethod: entry.paymentMethod ?? 'cash',
    accountId: entry.accountId ?? null,
    accountLast4: null,
    reference: null,
    occurredAt: entry.occurredAt ?? now,
    notes: entry.notes?.trim() || null,
    confidence: 1,
    status: 'confirmed',
    reviewReasons: [],
    recurringTransactionId: null,
    linkedTransactionId: null,
    duplicateOfId: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  await transactionRepo.insert(db, tx);
  return tx;
}

/**
 * The user picked a category (and maybe a type). Saves it, learns a rule for the merchant, and
 * applies the same answer to other transactions from that merchant still waiting in Review.
 */
export async function setCategory(
  db: SqlDatabase,
  id: string,
  change: { categoryId: string | null; subcategoryId: string | null; type?: TransactionType },
  now = Date.now(),
): Promise<number> {
  return db.transaction(async (dbx) => {
    const tx = await transactionRepo.get(dbx, id);
    if (!tx) return 0;
    const rule = learnFromCorrection(tx, change, await ruleRepo.list(dbx), now);
    if (rule) await ruleRepo.upsert(dbx, rule);
    const apply = (t: Transaction): Transaction => {
      const type = change.type ?? t.type;
      const direction = type === 'income' || type === 'refund' ? 'credit' : type === 'expense' ? 'debit' : t.direction;
      return withReasons(
        {
          ...t,
          categoryId: change.categoryId,
          subcategoryId: change.subcategoryId,
          categorySource: t.id === id ? 'user' : 'user_rule',
          type,
          direction,
        },
        t.reviewReasons.filter((r) => !CATEGORY_REASONS.includes(r)),
        now,
      );
    };
    await transactionRepo.update(dbx, apply(tx));
    let updated = 1;
    const key = tx.merchantRaw ?? tx.merchantName;
    const pending = await transactionRepo.list(dbx, { needsReview: true });
    for (const other of pending) {
      if (other.id === id || other.categorySource === 'user') continue;
      const sameMerchant = key && (other.merchantRaw ?? other.merchantName) && merchantKey(other.merchantRaw ?? other.merchantName ?? '') === merchantKey(key);
      const sameVpa = !key && tx.payeeVpa && other.payeeVpa === tx.payeeVpa;
      if (sameMerchant || sameVpa) {
        await transactionRepo.update(dbx, apply(other));
        updated += 1;
      }
    }
    return updated;
  });
}

/** General edit from the transaction screen (amount, merchant, note, date, account). */
export async function editTransaction(
  db: SqlDatabase,
  id: string,
  patch: Partial<Pick<Transaction, 'amountMinor' | 'merchantName' | 'notes' | 'occurredAt' | 'accountId' | 'type' | 'paymentMethod'>>,
  now = Date.now(),
): Promise<void> {
  const tx = await transactionRepo.get(db, id);
  if (!tx) return;
  const reasons = patch.merchantName ? tx.reviewReasons.filter((r) => r !== 'unknown_merchant') : tx.reviewReasons;
  const direction = patch.type === 'income' || patch.type === 'refund'
    ? 'credit'
    : patch.type === 'expense'
      ? 'debit'
      : tx.direction;
  await transactionRepo.update(db, withReasons({ ...tx, ...patch, direction }, reasons, now));
}

/** Review: the suspected duplicate really is a duplicate (ignore it) or isn't (keep both). */
export async function resolveDuplicate(db: SqlDatabase, id: string, isDuplicate: boolean, now = Date.now()): Promise<void> {
  const tx = await transactionRepo.get(db, id);
  if (!tx) return;
  const reasons = tx.reviewReasons.filter((r) => r !== 'possible_duplicate');
  const next = withReasons({ ...tx, duplicateOfId: isDuplicate ? tx.duplicateOfId : null }, reasons, now);
  await transactionRepo.update(db, isDuplicate ? { ...next, status: 'ignored' } : next);
}

/** Review: the payment really failed (ignore it) or went through after all. */
export async function resolveFailed(db: SqlDatabase, id: string, didFail: boolean, now = Date.now()): Promise<void> {
  const tx = await transactionRepo.get(db, id);
  if (!tx) return;
  const next = withReasons(tx, tx.reviewReasons.filter((r) => r !== 'payment_failed'), now);
  await transactionRepo.update(db, didFail ? { ...next, status: 'ignored' } : next);
}

/** Accept as is: clears remaining review reasons. */
export async function confirmTransaction(db: SqlDatabase, id: string, now = Date.now()): Promise<void> {
  const tx = await transactionRepo.get(db, id);
  if (tx) await transactionRepo.update(db, withReasons(tx, [], now));
}

export async function ignoreTransaction(db: SqlDatabase, id: string, now = Date.now()): Promise<void> {
  const tx = await transactionRepo.get(db, id);
  if (tx) await transactionRepo.update(db, { ...tx, status: 'ignored', updatedAt: now });
}

export async function deleteTransaction(db: SqlDatabase, id: string, now = Date.now()): Promise<void> {
  await transactionRepo.remove(db, id, now);
}

/** Links a transaction to a recurring item and moves the item's next due date on. */
export async function markRecurringPaid(db: SqlDatabase, recurringId: string, transactionId: string | null, now = Date.now()): Promise<void> {
  await db.transaction(async (dbx) => {
    const rec = await recurringRepo.get(dbx, recurringId);
    if (!rec) return;
    await recurringRepo.upsert(dbx, { ...advanceAfterPayment(rec), updatedAt: now });
    if (transactionId) {
      const tx = await transactionRepo.get(dbx, transactionId);
      if (tx) await transactionRepo.update(dbx, { ...tx, recurringTransactionId: recurringId, updatedAt: now });
    }
  });
}
