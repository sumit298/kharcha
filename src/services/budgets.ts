import { selectEffectiveBudgets } from '@/domain/budgets/progress';
import { budgetRepo } from '@/database/repositories';
import type { SqlExecutor } from '@/database/sql';
import type { Budget } from '@/types';
import { monthKey } from '@/utils/dates';
import { newId } from '@/utils/ids';

/** Saves a budget effective from this month (older months keep their amounts). */
export async function saveBudget(db: SqlExecutor, budgets: Budget[], categoryId: string | null, amountMinor: number | null, now = Date.now()) {
  const month = monthKey(now);
  const current = budgets.find((b) => b.categoryId === categoryId && b.effectiveFrom === month && b.deletedAt === null);
  if (amountMinor === null) {
    if (current) await budgetRepo.remove(db, current.id, now);
    const effective = selectEffectiveBudgets(budgets, month).find((b) => b.categoryId === categoryId);
    if (effective && effective.id !== current?.id) {
      await budgetRepo.upsert(db, { id: newId(now), categoryId, amountMinor: 0, effectiveFrom: month, createdAt: now, updatedAt: now, deletedAt: now });
    }
    return;
  }
  await budgetRepo.upsert(db, current ? { ...current, amountMinor, updatedAt: now } : { id: newId(now), categoryId, amountMinor, effectiveFrom: month, createdAt: now, updatedAt: now, deletedAt: null });
}

