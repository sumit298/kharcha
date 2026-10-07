import { defaultParentOf } from '@/domain/categories/defaults';
import type { Category, Transaction } from '@/types';
import { isInRange, type DateRange } from '@/utils/dates';

/** Category rows by ID, used to resolve a transaction's top-level category. */
export type CategoryIndex = ReadonlyMap<string, Category>;

export function indexCategories(categories: readonly Category[]): CategoryIndex {
  return new Map(categories.map((c) => [c.id, c]));
}

/** Status rules shared by spending and income (ARCHITECTURE §8). */
function isCountable(tx: Transaction): boolean {
  return (
    tx.deletedAt === null &&
    (tx.status === 'confirmed' || tx.status === 'needs_review') &&
    !tx.reviewReasons.includes('possible_duplicate')
  );
}

/**
 * ARCHITECTURE §8: an expense or refund that is not deleted, is confirmed or in review, and is
 * not flagged as a possible duplicate.
 */
export function isCountedForSpending(tx: Transaction): boolean {
  return (tx.type === 'expense' || tx.type === 'refund') && isCountable(tx);
}

/** An income transaction under the same status rules as spending. Transfers never count. */
export function isCountedAsIncome(tx: Transaction): boolean {
  return tx.type === 'income' && isCountable(tx);
}

/** What a transaction adds to net spending: +amount (expense), −amount (refund), 0 if not counted. */
export function spendingContribution(tx: Transaction): number {
  if (!isCountedForSpending(tx)) return 0;
  return tx.type === 'refund' ? -tx.amountMinor : tx.amountMinor;
}

/**
 * Top-level category of a transaction: `categoryId` when set, else the parent of
 * `subcategoryId` (from `categories`, falling back to the built-in tree). null = uncategorized.
 */
export function topLevelCategoryId(
  tx: Pick<Transaction, 'categoryId' | 'subcategoryId'>,
  categories: CategoryIndex,
): string | null {
  if (tx.categoryId !== null) return tx.categoryId;
  if (tx.subcategoryId === null) return null;
  const sub = categories.get(tx.subcategoryId);
  return sub ? (sub.parentId ?? sub.id) : defaultParentOf(tx.subcategoryId);
}

/** True when `categoryId` is the transaction's top-level category or its subcategory. */
export function isInCategory(
  tx: Pick<Transaction, 'categoryId' | 'subcategoryId'>,
  categoryId: string,
  categories: CategoryIndex,
): boolean {
  return tx.subcategoryId === categoryId || topLevelCategoryId(tx, categories) === categoryId;
}

export interface SpendingFilter {
  /** Top-level category or subcategory ID. */
  categoryId?: string;
  /** Resolves transactions that carry only a subcategoryId; built-in IDs resolve without it. */
  categories?: readonly Category[];
}

/** Σ expense − Σ refund in `range`, in minor units. Negative when refunds exceed spending. */
export function netSpending(
  txs: readonly Transaction[],
  range: DateRange,
  { categoryId, categories = [] }: SpendingFilter = {},
): number {
  const index = indexCategories(categories);
  let total = 0;
  for (const tx of txs) {
    if (!isInRange(tx.occurredAt, range)) continue;
    if (categoryId !== undefined && !isInCategory(tx, categoryId, index)) continue;
    total += spendingContribution(tx);
  }
  return total;
}

/** Σ counted income in `range`, in minor units. */
export function totalIncome(txs: readonly Transaction[], range: DateRange): number {
  let total = 0;
  for (const tx of txs) {
    if (isCountedAsIncome(tx) && isInRange(tx.occurredAt, range)) total += tx.amountMinor;
  }
  return total;
}
