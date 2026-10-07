import {
  indexCategories,
  isCountedForSpending,
  isInCategory,
  spendingContribution,
  type CategoryIndex,
} from '@/domain/analytics/spending';
import type { Budget, Category, Transaction } from '@/types';
import { daysInMonth as daysInMonthOf, isInRange, monthRange, parseMonthKey } from '@/utils/dates';

export type BudgetStatus = 'on_track' | 'warning' | 'over';

export interface BudgetLine {
  /** null = total monthly budget. */
  categoryId: string | null;
  budgetMinor: number;
  /** Net spending (expenses − refunds) in the month. */
  spentMinor: number;
  /** budget − spent; negative when over. */
  remainingMinor: number;
  /** spent / budget as a fraction, 2 decimals, never negative; Infinity for spend against a 0 budget. */
  pctUsed: number;
  avgDailyMinor: number;
  projectedMonthEndMinor: number;
  status: BudgetStatus;
}

export interface BudgetProgress {
  /** Days of the month counted for averages: through today (current), all (past), 0 (future). */
  daysElapsed: number;
  daysInMonth: number;
  total: BudgetLine | null;
  /** Category budgets in category sort order. */
  categories: BudgetLine[];
}

export interface BudgetProgressInput {
  /** Budget rows; the effective row per category for `month` is picked by selectEffectiveBudgets. */
  budgets: readonly Budget[];
  transactions: readonly Transaction[];
  categories: readonly Category[];
  /** "YYYY-MM" */
  month: string;
  now: number;
}

const WARNING_PCT = 0.8;

/**
 * The budget in force per category for `month`: among non-deleted rows with
 * effectiveFrom ≤ month, the latest effectiveFrom wins (then the latest update).
 */
export function selectEffectiveBudgets(budgets: readonly Budget[], month: string): Budget[] {
  const byCategory = new Map<string | null, Budget>();
  for (const budget of budgets) {
    if (budget.deletedAt !== null || budget.effectiveFrom > month) continue;
    const current = byCategory.get(budget.categoryId);
    if (
      !current ||
      budget.effectiveFrom > current.effectiveFrom ||
      (budget.effectiveFrom === current.effectiveFrom && budget.updatedAt > current.updatedAt)
    ) {
      byCategory.set(budget.categoryId, budget);
    }
  }
  return [...byCategory.values()];
}

function usedFraction(spentMinor: number, budgetMinor: number): number {
  if (spentMinor <= 0) return 0;
  if (budgetMinor <= 0) return Infinity;
  return Math.round((spentMinor * 100) / budgetMinor) / 100;
}

function budgetLine(
  categoryId: string | null,
  budgetMinor: number,
  spentMinor: number,
  daysElapsed: number,
  daysInMonth: number,
): BudgetLine {
  const pctUsed = usedFraction(spentMinor, budgetMinor);
  const avgDailyMinor = daysElapsed > 0 ? Math.round(spentMinor / daysElapsed) : 0;
  const projectedMonthEndMinor =
    daysElapsed > 0 ? Math.round((spentMinor * daysInMonth) / daysElapsed) : spentMinor;
  const status: BudgetStatus =
    spentMinor > budgetMinor
      ? 'over'
      : projectedMonthEndMinor > budgetMinor || (spentMinor > 0 && spentMinor >= budgetMinor * WARNING_PCT)
        ? 'warning'
        : 'on_track';
  return {
    categoryId,
    budgetMinor,
    spentMinor,
    remainingMinor: budgetMinor - spentMinor,
    pctUsed,
    avgDailyMinor,
    projectedMonthEndMinor,
    status,
  };
}

function bySortOrder(index: CategoryIndex): (a: BudgetLine, b: BudgetLine) => number {
  const rank = (id: string | null) =>
    (id === null ? undefined : index.get(id)?.sortOrder) ?? Number.MAX_SAFE_INTEGER;
  return (a, b) =>
    rank(a.categoryId) - rank(b.categoryId) || (a.categoryId ?? '').localeCompare(b.categoryId ?? '');
}

/**
 * Spending against each budget for `month`. Category budgets count their top-level category
 * (and a budget on a subcategory counts that subcategory). Projection = spent / daysElapsed ×
 * daysInMonth; `warning` when the projection exceeds the budget or 80% is used, `over` when
 * spending exceeds it.
 */
export function computeBudgetProgress({
  budgets,
  transactions,
  categories,
  month,
  now,
}: BudgetProgressInput): BudgetProgress {
  const range = monthRange(parseMonthKey(month));
  const daysInMonth = daysInMonthOf(range.from);
  const daysElapsed = now < range.from ? 0 : now >= range.to ? daysInMonth : new Date(now).getDate();
  const index = indexCategories(categories);
  const counted = transactions.filter((tx) => isCountedForSpending(tx) && isInRange(tx.occurredAt, range));
  const spentIn = (categoryId: string | null) =>
    counted.reduce(
      (sum, tx) =>
        categoryId === null || isInCategory(tx, categoryId, index) ? sum + spendingContribution(tx) : sum,
      0,
    );

  let total: BudgetLine | null = null;
  const lines: BudgetLine[] = [];
  for (const budget of selectEffectiveBudgets(budgets, month)) {
    const line = budgetLine(
      budget.categoryId,
      budget.amountMinor,
      spentIn(budget.categoryId),
      daysElapsed,
      daysInMonth,
    );
    if (budget.categoryId === null) total = line;
    else lines.push(line);
  }
  return { daysElapsed, daysInMonth, total, categories: lines.sort(bySortOrder(index)) };
}
