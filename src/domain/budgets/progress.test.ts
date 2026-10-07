import { at, makeTransaction } from '@/domain/analytics/testFactories';
import { computeBudgetProgress, selectEffectiveBudgets } from '@/domain/budgets/progress';
import { buildDefaultCategoryRows } from '@/domain/categories/defaults';
import type { Budget, Transaction } from '@/types';

const CATEGORIES = buildDefaultCategoryRows(0);

let budgetSeq = 0;
function makeBudget(overrides: Partial<Budget> = {}): Budget {
  budgetSeq += 1;
  return {
    id: `budget-${budgetSeq}`,
    categoryId: null,
    amountMinor: 1000000,
    effectiveFrom: '2026-01',
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    ...overrides,
  };
}

/** Progress for a single total budget in Sep 2026. */
function totalLine(amountMinor: number, transactions: Transaction[], now: number) {
  return computeBudgetProgress({
    budgets: [makeBudget({ amountMinor })],
    transactions,
    categories: CATEGORIES,
    month: '2026-09',
    now,
  }).total!;
}

describe('selectEffectiveBudgets', () => {
  it('picks the latest effectiveFrom ≤ month per category', () => {
    const old = makeBudget({ effectiveFrom: '2026-01', amountMinor: 1 });
    const current = makeBudget({ effectiveFrom: '2026-06', amountMinor: 2 });
    const future = makeBudget({ effectiveFrom: '2026-10', amountMinor: 3 });
    const food = makeBudget({ categoryId: 'food', effectiveFrom: '2026-09', amountMinor: 4 });
    const result = selectEffectiveBudgets([future, current, old, food], '2026-09');
    expect(result).toHaveLength(2);
    expect(result).toEqual(expect.arrayContaining([current, food]));
  });

  it('includes a row effective from exactly this month', () => {
    const row = makeBudget({ effectiveFrom: '2026-09' });
    expect(selectEffectiveBudgets([row], '2026-09')).toEqual([row]);
  });

  it('ignores deleted rows', () => {
    const live = makeBudget({ effectiveFrom: '2026-01' });
    const deleted = makeBudget({ effectiveFrom: '2026-08', deletedAt: 5 });
    expect(selectEffectiveBudgets([live, deleted], '2026-09')).toEqual([live]);
  });

  it('breaks effectiveFrom ties by the latest updatedAt, whatever the order', () => {
    const older = makeBudget({ effectiveFrom: '2026-06', updatedAt: 5 });
    const newer = makeBudget({ effectiveFrom: '2026-06', updatedAt: 10 });
    expect(selectEffectiveBudgets([older, newer], '2026-09')).toEqual([newer]);
    expect(selectEffectiveBudgets([newer, older], '2026-09')).toEqual([newer]);
  });

  it('returns nothing before the first effective month', () => {
    expect(selectEffectiveBudgets([makeBudget({ effectiveFrom: '2026-10' })], '2026-09')).toEqual([]);
  });

  it('compares month keys across years', () => {
    const lastYear = makeBudget({ effectiveFrom: '2025-12' });
    const nextYear = makeBudget({ effectiveFrom: '2027-01' });
    expect(selectEffectiveBudgets([lastYear, nextYear], '2026-09')).toEqual([lastYear]);
  });
});

describe('computeBudgetProgress', () => {
  describe('daysElapsed', () => {
    const progressAt = (now: number, month = '2026-09') =>
      computeBudgetProgress({ budgets: [], transactions: [], categories: CATEGORIES, month, now });

    it('counts through today in the current month', () => {
      expect(progressAt(at(2026, 9, 15, 10))).toMatchObject({ daysElapsed: 15, daysInMonth: 30 });
      expect(progressAt(at(2026, 9, 1)).daysElapsed).toBe(1);
      expect(progressAt(at(2026, 9, 30, 23, 59)).daysElapsed).toBe(30);
    });

    it('counts every day for a past month and none for a future month', () => {
      expect(progressAt(at(2026, 10, 1)).daysElapsed).toBe(30);
      expect(progressAt(at(2027, 1, 5)).daysElapsed).toBe(30);
      expect(progressAt(at(2026, 8, 31, 23, 59)).daysElapsed).toBe(0);
    });

    it('knows leap-year February', () => {
      expect(progressAt(at(2028, 3, 1), '2028-02')).toMatchObject({ daysElapsed: 29, daysInMonth: 29 });
    });

    it('throws on a malformed month key', () => {
      expect(() => progressAt(at(2026, 9, 15), '2026-9')).toThrow();
    });
  });

  it('returns null total and no lines without budgets', () => {
    expect(
      computeBudgetProgress({
        budgets: [],
        transactions: [makeTransaction()],
        categories: CATEGORIES,
        month: '2026-09',
        now: at(2026, 9, 15),
      }),
    ).toMatchObject({ total: null, categories: [] });
  });

  it('counts net spending under §8 rules for the month only', () => {
    const txs = [
      makeTransaction({ amountMinor: 300000, occurredAt: at(2026, 9, 2) }),
      makeTransaction({ amountMinor: 100000, occurredAt: at(2026, 9, 5), status: 'needs_review' }),
      makeTransaction({ type: 'refund', amountMinor: 50000, occurredAt: at(2026, 9, 6) }),
      makeTransaction({ type: 'transfer', amountMinor: 900000, occurredAt: at(2026, 9, 6) }),
      makeTransaction({ type: 'income', amountMinor: 900000, occurredAt: at(2026, 9, 6) }),
      makeTransaction({ amountMinor: 900000, occurredAt: at(2026, 9, 6), status: 'ignored' }),
      makeTransaction({ amountMinor: 900000, occurredAt: at(2026, 9, 6), deletedAt: 1 }),
      makeTransaction({ amountMinor: 900000, occurredAt: at(2026, 9, 6), reviewReasons: ['possible_duplicate'] }),
      makeTransaction({ amountMinor: 900000, occurredAt: at(2026, 8, 31, 23, 59) }),
      makeTransaction({ amountMinor: 900000, occurredAt: at(2026, 10, 1) }),
    ];
    expect(totalLine(1000000, txs, at(2026, 9, 10)).spentMinor).toBe(350000);
  });

  describe('budget line math', () => {
    it('is on track when the projection does not exceed the budget', () => {
      const txs = [makeTransaction({ amountMinor: 500000, occurredAt: at(2026, 9, 3) })];
      expect(totalLine(1000000, txs, at(2026, 9, 15, 18))).toEqual({
        categoryId: null,
        budgetMinor: 1000000,
        spentMinor: 500000,
        remainingMinor: 500000,
        pctUsed: 0.5,
        avgDailyMinor: 33333,
        projectedMonthEndMinor: 1000000,
        status: 'on_track',
      });
    });

    it('warns when the projection exceeds the budget', () => {
      const txs = [makeTransaction({ amountMinor: 600000, occurredAt: at(2026, 9, 3) })];
      expect(totalLine(1000000, txs, at(2026, 9, 15))).toMatchObject({
        pctUsed: 0.6,
        projectedMonthEndMinor: 1200000,
        status: 'warning',
      });
    });

    it('warns at 80% used even when the projection is within budget', () => {
      // Past month: projection = spent.
      const at80 = [makeTransaction({ amountMinor: 800000, occurredAt: at(2026, 9, 3) })];
      expect(totalLine(1000000, at80, at(2026, 10, 5))).toMatchObject({
        pctUsed: 0.8,
        projectedMonthEndMinor: 800000,
        status: 'warning',
      });
      const at79 = [makeTransaction({ amountMinor: 790000, occurredAt: at(2026, 9, 3) })];
      expect(totalLine(1000000, at79, at(2026, 10, 5))).toMatchObject({ pctUsed: 0.79, status: 'on_track' });
      // 79.95% rounds to 0.8 for display but is not yet 80% used.
      const justUnder = [makeTransaction({ amountMinor: 799500, occurredAt: at(2026, 9, 3) })];
      expect(totalLine(1000000, justUnder, at(2026, 10, 5))).toMatchObject({ pctUsed: 0.8, status: 'on_track' });
    });

    it('is a warning, not over, at exactly 100%', () => {
      const txs = [makeTransaction({ amountMinor: 1000000, occurredAt: at(2026, 9, 3) })];
      expect(totalLine(1000000, txs, at(2026, 10, 5))).toMatchObject({
        pctUsed: 1,
        remainingMinor: 0,
        status: 'warning',
      });
    });

    it('is over when spending exceeds the budget', () => {
      const txs = [makeTransaction({ amountMinor: 1000001, occurredAt: at(2026, 9, 3) })];
      expect(totalLine(1000000, txs, at(2026, 10, 5))).toMatchObject({
        pctUsed: 1,
        remainingMinor: -1,
        status: 'over',
      });
    });

    it('rounds pctUsed to 2 decimals', () => {
      const txs = [makeTransaction({ amountMinor: 1, occurredAt: at(2026, 9, 3) })];
      expect(totalLine(3, txs, at(2026, 10, 5)).pctUsed).toBe(0.33);
      const txs2 = [makeTransaction({ amountMinor: 2, occurredAt: at(2026, 9, 3) })];
      expect(totalLine(3, txs2, at(2026, 10, 5)).pctUsed).toBe(0.67);
    });

    it('reports Infinity for spending against a zero budget, and 0 when nothing is spent', () => {
      const txs = [makeTransaction({ amountMinor: 100, occurredAt: at(2026, 9, 3) })];
      expect(totalLine(0, txs, at(2026, 9, 15))).toMatchObject({ pctUsed: Infinity, status: 'over' });
      expect(totalLine(0, [], at(2026, 9, 15))).toMatchObject({ pctUsed: 0, status: 'on_track' });
    });

    it('never reports negative pctUsed when refunds exceed spending', () => {
      const txs = [
        makeTransaction({ amountMinor: 10000, occurredAt: at(2026, 9, 3) }),
        makeTransaction({ type: 'refund', amountMinor: 30000, occurredAt: at(2026, 9, 4) }),
      ];
      expect(totalLine(1000000, txs, at(2026, 9, 10))).toMatchObject({
        spentMinor: -20000,
        remainingMinor: 1020000,
        pctUsed: 0,
        avgDailyMinor: -2000,
        projectedMonthEndMinor: -60000,
        status: 'on_track',
      });
    });

    it('uses spent as the projection for a future month', () => {
      const txs = [makeTransaction({ amountMinor: 50000, occurredAt: at(2026, 9, 3) })];
      expect(totalLine(1000000, txs, at(2026, 8, 20))).toMatchObject({
        avgDailyMinor: 0,
        projectedMonthEndMinor: 50000,
        status: 'on_track',
      });
    });

    it('uses a full-month average for a past month', () => {
      const txs = [makeTransaction({ amountMinor: 300000, occurredAt: at(2026, 9, 3) })];
      expect(totalLine(1000000, txs, at(2026, 11, 1))).toMatchObject({
        avgDailyMinor: 10000,
        projectedMonthEndMinor: 300000,
      });
    });
  });

  describe('category budgets', () => {
    const txs = [
      makeTransaction({ amountMinor: 20000, categoryId: 'food', subcategoryId: 'food.cafes' }),
      makeTransaction({ amountMinor: 30000, subcategoryId: 'food.food_delivery' }),
      makeTransaction({ type: 'refund', amountMinor: 5000, subcategoryId: 'food.food_delivery' }),
      makeTransaction({ amountMinor: 40000, categoryId: 'food' }),
      makeTransaction({ amountMinor: 70000, categoryId: 'transport', subcategoryId: 'transport.cab' }),
      makeTransaction({ amountMinor: 11000 }),
    ];
    const progress = computeBudgetProgress({
      budgets: [
        makeBudget({ categoryId: 'transport', amountMinor: 100000 }),
        makeBudget({ categoryId: 'unknown.b', amountMinor: 100000 }),
        makeBudget({ categoryId: 'food.food_delivery', amountMinor: 100000 }),
        makeBudget({ categoryId: 'unknown.a', amountMinor: 100000 }),
        makeBudget({ categoryId: 'food', amountMinor: 100000 }),
        makeBudget({ categoryId: null, amountMinor: 1000000 }),
      ],
      transactions: txs,
      categories: CATEGORIES,
      month: '2026-09',
      now: at(2026, 9, 20),
    });

    it('counts the top-level category including subcategory-only transactions', () => {
      expect(progress.categories.find((l) => l.categoryId === 'food')?.spentMinor).toBe(85000);
      expect(progress.categories.find((l) => l.categoryId === 'transport')?.spentMinor).toBe(70000);
    });

    it('counts only that subcategory for a subcategory budget', () => {
      expect(progress.categories.find((l) => l.categoryId === 'food.food_delivery')?.spentMinor).toBe(25000);
    });

    it('counts everything, uncategorized included, for the total', () => {
      expect(progress.total?.spentMinor).toBe(166000);
    });

    it('sorts lines by category sortOrder, unknown categories last by ID', () => {
      expect(progress.categories.map((l) => l.categoryId)).toEqual([
        'food',
        'food.food_delivery',
        'transport',
        'unknown.a',
        'unknown.b',
      ]);
    });
  });
});
