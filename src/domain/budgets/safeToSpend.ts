import { netSpending } from '@/domain/analytics/spending';
import { upcoming } from '@/domain/recurring/schedule';
import type { RecurringTransaction, Transaction } from '@/types';
import { daysRemainingInMonth, monthKey, monthRange, startOfDay } from '@/utils/dates';

export interface SafeToSpendInput {
  totalBudgetMinor: number;
  transactions: readonly Transaction[];
  recurring: readonly RecurringTransaction[];
  now: number;
}

export interface CommittedItem {
  recurringId: string;
  name: string;
  amountMinor: number;
  /** Local start of the due day. */
  dueAt: number;
  /** Due before today and still unpaid. */
  isOverdue: boolean;
}

export interface SafeToSpend {
  /** "YYYY-MM" of `now`. */
  monthKey: string;
  budgetMinor: number;
  /** Net spending this month. */
  spentMinor: number;
  /** budget − spent; negative when over budget. */
  remainingMinor: number;
  upcomingCommittedMinor: number;
  /** Sorted by due date; overdue items first. */
  upcomingItems: CommittedItem[];
  /** max(0, remaining − upcomingCommitted). */
  availableMinor: number;
  /** Days left in the month, today included. */
  daysLeft: number;
  /** floor(available / daysLeft). */
  safePerDayMinor: number;
  /** Spending already exceeds the budget. */
  isOverBudget: boolean;
}

/**
 * ARCHITECTURE §9. Committed = active recurring expenses due from today through month end,
 * plus overdue unpaid ones. Every component is returned so the UI can show the breakdown.
 */
export function computeSafeToSpend({ totalBudgetMinor, transactions, recurring, now }: SafeToSpendInput): SafeToSpend {
  const month = monthRange(now);
  const spentMinor = netSpending(transactions, month);
  const remainingMinor = totalBudgetMinor - spentMinor;
  const upcomingItems = upcoming(
    recurring.filter((rec) => rec.type === 'expense'),
    { from: startOfDay(now), to: month.to },
  ).map(({ recurring: rec, dueAt, isOverdue }) => ({
    recurringId: rec.id,
    name: rec.name,
    amountMinor: rec.amountMinor,
    dueAt,
    isOverdue,
  }));
  const upcomingCommittedMinor = upcomingItems.reduce((sum, item) => sum + item.amountMinor, 0);
  const availableMinor = Math.max(0, remainingMinor - upcomingCommittedMinor);
  const daysLeft = daysRemainingInMonth(now);
  return {
    monthKey: monthKey(now),
    budgetMinor: totalBudgetMinor,
    spentMinor,
    remainingMinor,
    upcomingCommittedMinor,
    upcomingItems,
    availableMinor,
    daysLeft,
    safePerDayMinor: Math.floor(availableMinor / daysLeft),
    isOverBudget: remainingMinor < 0,
  };
}
