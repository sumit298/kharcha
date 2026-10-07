import type { Category, Transaction } from '@/types';
import {
  addDays,
  addMonths,
  dayKey,
  isInRange,
  startOfDay,
  startOfMonth,
  weekRange,
  type DateRange,
} from '@/utils/dates';

import {
  indexCategories,
  isCountedForSpending,
  netSpending,
  spendingContribution,
  topLevelCategoryId,
  totalIncome,
} from './spending';

/** Merchant bucket for transactions without a merchant name. */
export const UNKNOWN_MERCHANT = 'Unknown';

interface Tally {
  /** Net spending (expenses − refunds), minor units. */
  spentMinor: number;
  /** Counted transactions, refunds included. */
  count: number;
}

export interface SubcategorySpending extends Tally {
  /** null = assigned to the parent category only. */
  subcategoryId: string | null;
}

export interface CategorySpending extends Tally {
  /** Top-level category ID; null is the uncategorized bucket. */
  categoryId: string | null;
  /** Breakdown by subcategory, sorted like the parents; sums to the parent's totals. */
  children: SubcategorySpending[];
}

export interface MerchantSpending extends Tally {
  merchantName: string;
}

export interface SourceAppSpending extends Tally {
  /** Package name of the capturing app; null for manual or imported entries. */
  sourceApp: string | null;
}

export interface DailySpending {
  dayKey: string;
  /** Local start of day. */
  from: number;
  spentMinor: number;
}

export interface PeriodSpending extends DateRange {
  spentMinor: number;
}

export interface MonthComparison {
  current: PeriodSpending;
  previous: PeriodSpending;
  deltaMinor: number;
  /** Fraction of the previous spend (0.25 = +25%), 2 decimals; null when previous ≤ 0. */
  deltaPct: number | null;
}

export interface IncomeVsExpense {
  incomeMinor: number;
  spentMinor: number;
  /** Income − spending; negative when spending exceeds income. */
  netMinor: number;
}

function countedIn(txs: readonly Transaction[], range: DateRange): Transaction[] {
  return txs.filter((tx) => isCountedForSpending(tx) && isInRange(tx.occurredAt, range));
}

function groupBy<K>(txs: readonly Transaction[], keyOf: (tx: Transaction) => K): Map<K, Transaction[]> {
  const groups = new Map<K, Transaction[]>();
  for (const tx of txs) {
    const key = keyOf(tx);
    const group = groups.get(key);
    if (group) group.push(tx);
    else groups.set(key, [tx]);
  }
  return groups;
}

function sumSpending(txs: readonly Transaction[]): number {
  return txs.reduce((sum, tx) => sum + spendingContribution(tx), 0);
}

function tally(txs: readonly Transaction[]): Tally {
  return { spentMinor: sumSpending(txs), count: txs.length };
}

function compareKeys(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

/** Spending descending; ties by key ascending with null last, so the order is stable. */
function bySpendingDesc<T extends Tally>(keyOf: (item: T) => string | null): (a: T, b: T) => number {
  return (a, b) => b.spentMinor - a.spentMinor || compareKeys(keyOf(a), keyOf(b));
}

/**
 * Net spending per top-level category with a subcategory breakdown, sorted by spending
 * descending. Uncategorized transactions form a bucket with categoryId null.
 */
export function spendingByCategory(
  txs: readonly Transaction[],
  categories: readonly Category[],
  range: DateRange,
): CategorySpending[] {
  const index = indexCategories(categories);
  const byParent = groupBy(countedIn(txs, range), (tx) => topLevelCategoryId(tx, index));
  return Array.from(byParent, ([categoryId, group]): CategorySpending => ({
    categoryId,
    ...tally(group),
    children: Array.from(groupBy(group, (tx) => tx.subcategoryId), ([subcategoryId, sub]) => ({
      subcategoryId,
      ...tally(sub),
    })).sort(bySpendingDesc((c) => c.subcategoryId)),
  })).sort(bySpendingDesc((c) => c.categoryId));
}

/** Net spending per merchant name (UNKNOWN_MERCHANT when missing), sorted descending. */
export function spendingByMerchant(txs: readonly Transaction[], range: DateRange): MerchantSpending[] {
  const byMerchant = groupBy(countedIn(txs, range), (tx) => tx.merchantName || UNKNOWN_MERCHANT);
  return Array.from(byMerchant, ([merchantName, group]) => ({ merchantName, ...tally(group) })).sort(
    bySpendingDesc((m) => m.merchantName),
  );
}

/** Net spending per capturing app (package name), sorted descending. */
export function spendingBySourceApp(txs: readonly Transaction[], range: DateRange): SourceAppSpending[] {
  const byApp = groupBy(countedIn(txs, range), (tx) => tx.sourceApp);
  return Array.from(byApp, ([sourceApp, group]) => ({ sourceApp, ...tally(group) })).sort(
    bySpendingDesc((s) => s.sourceApp),
  );
}

/** One entry per local day overlapping `range`, zero-filled. */
export function dailySeries(txs: readonly Transaction[], range: DateRange): DailySpending[] {
  if (range.to <= range.from) return [];
  const byDay = groupBy(countedIn(txs, range), (tx) => startOfDay(tx.occurredAt));
  const series: DailySpending[] = [];
  for (let day = startOfDay(range.from); day < range.to; day = addDays(day, 1)) {
    series.push({ dayKey: dayKey(day), from: day, spentMinor: sumSpending(byDay.get(day) ?? []) });
  }
  return series;
}

/**
 * One entry per week overlapping `range`, zero-filled. Weeks start on `weekStartsOn`
 * (1 = Monday); the first and last entries are clipped to the range.
 */
export function weeklySeries(txs: readonly Transaction[], range: DateRange, weekStartsOn = 1): PeriodSpending[] {
  if (range.to <= range.from) return [];
  const byWeek = groupBy(countedIn(txs, range), (tx) => weekRange(tx.occurredAt, weekStartsOn).from);
  const series: PeriodSpending[] = [];
  for (let start = weekRange(range.from, weekStartsOn).from; start < range.to; start = addDays(start, 7)) {
    series.push({
      from: Math.max(start, range.from),
      to: Math.min(addDays(start, 7), range.to),
      spentMinor: sumSpending(byWeek.get(start) ?? []),
    });
  }
  return series;
}

/** Up to `limit` counted expenses (refunds excluded) by amount descending, then most recent. */
export function largestExpenses(txs: readonly Transaction[], range: DateRange, limit: number): Transaction[] {
  return countedIn(txs, range)
    .filter((tx) => tx.type === 'expense')
    .sort((a, b) => b.amountMinor - a.amountMinor || b.occurredAt - a.occurredAt)
    .slice(0, Math.max(0, limit));
}

/**
 * Month-to-date spending (through the end of today) against the same span of the previous
 * month: its 1st through the same day of month, clamped to its length.
 */
export function compareWithPreviousMonth(txs: readonly Transaction[], now: number): MonthComparison {
  const today = startOfDay(now);
  const sameDayLastMonth = addMonths(today, -1);
  const currentRange = { from: startOfMonth(today), to: addDays(today, 1) };
  const previousRange = { from: startOfMonth(sameDayLastMonth), to: addDays(sameDayLastMonth, 1) };
  const current = { ...currentRange, spentMinor: netSpending(txs, currentRange) };
  const previous = { ...previousRange, spentMinor: netSpending(txs, previousRange) };
  const deltaMinor = current.spentMinor - previous.spentMinor;
  const deltaPct = previous.spentMinor > 0 ? Math.round((deltaMinor * 100) / previous.spentMinor) / 100 : null;
  return { current, previous, deltaMinor, deltaPct };
}

/** Counted income against net spending in `range`. */
export function incomeVsExpense(txs: readonly Transaction[], range: DateRange): IncomeVsExpense {
  const incomeMinor = totalIncome(txs, range);
  const spentMinor = netSpending(txs, range);
  return { incomeMinor, spentMinor, netMinor: incomeMinor - spentMinor };
}
