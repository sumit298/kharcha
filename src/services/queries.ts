import { spendingByCategory } from '@/domain/analytics/aggregate';
import { netSpending } from '@/domain/analytics/spending';
import { computeBudgetProgress, selectEffectiveBudgets } from '@/domain/budgets/progress';
import { computeSafeToSpend } from '@/domain/budgets/safeToSpend';
import { upcoming } from '@/domain/recurring/schedule';
import { budgetRepo, categoryRepo, recurringRepo, settingsRepo, transactionRepo } from '@/database/repositories';
import type { SqlDatabase } from '@/database/sql';
import { addDays, dayRange, monthKey, monthRange, startOfDay } from '@/utils/dates';

export const SETTINGS = {
  onboarded: 'onboarded',
} as const;

export async function isOnboarded(db: SqlDatabase): Promise<boolean> {
  return settingsRepo.get(db, SETTINGS.onboarded, false);
}

/** Everything the dashboard shows, in one read. */
export async function loadDashboard(db: SqlDatabase, now = Date.now()) {
  const month = monthRange(now);
  const [txs, budgets, categories, recurring, reviewCount] = await Promise.all([
    transactionRepo.inRange(db, month.from, month.to),
    budgetRepo.list(db),
    categoryRepo.list(db),
    recurringRepo.list(db),
    transactionRepo.countNeedsReview(db),
  ]);
  const key = monthKey(now);
  const total = selectEffectiveBudgets(budgets, key).find((b) => b.categoryId === null) ?? null;
  return {
    monthKey: key,
    totalBudgetMinor: total?.amountMinor ?? null,
    safe: total ? computeSafeToSpend({ totalBudgetMinor: total.amountMinor, transactions: txs, recurring, now }) : null,
    todayMinor: netSpending(txs, dayRange(now)),
    monthMinor: netSpending(txs, month),
    progress: computeBudgetProgress({ budgets, transactions: txs, categories, month: key, now }),
    breakdown: spendingByCategory(txs, categories, month),
    upcoming: upcoming(recurring.filter((r) => r.type === 'expense'), { from: startOfDay(now), to: addDays(startOfDay(now), 31) }).slice(0, 4),
    recent: txs.slice(0, 6),
    reviewCount,
  };
}

export type Dashboard = Awaited<ReturnType<typeof loadDashboard>>;
