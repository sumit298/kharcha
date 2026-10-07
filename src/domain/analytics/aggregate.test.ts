import { buildDefaultCategoryRows } from '@/domain/categories/defaults';
import type { Category } from '@/types';
import { monthRange } from '@/utils/dates';

import {
  compareWithPreviousMonth,
  dailySeries,
  incomeVsExpense,
  largestExpenses,
  spendingByCategory,
  spendingByMerchant,
  spendingBySourceApp,
  UNKNOWN_MERCHANT,
  weeklySeries,
} from './aggregate';
import { at, makeTransaction } from './testFactories';

const SEPT = monthRange(at(2026, 9, 1));
const CATEGORIES = buildDefaultCategoryRows(0);

describe('spendingByCategory', () => {
  it('groups by top-level category with subcategory children summing to the parent', () => {
    const txs = [
      makeTransaction({ amountMinor: 30000, categoryId: 'food', subcategoryId: 'food.food_delivery' }),
      makeTransaction({ amountMinor: 20000, subcategoryId: 'food.food_delivery' }),
      makeTransaction({ type: 'refund', amountMinor: 5000, subcategoryId: 'food.food_delivery' }),
      makeTransaction({ amountMinor: 10000, categoryId: 'food', subcategoryId: 'food.cafes' }),
      makeTransaction({ amountMinor: 4000, categoryId: 'food' }),
      makeTransaction({ amountMinor: 25000, categoryId: 'transport', subcategoryId: 'transport.cab' }),
    ];
    const result = spendingByCategory(txs, CATEGORIES, SEPT);

    expect(result).toEqual([
      {
        categoryId: 'food',
        spentMinor: 59000,
        count: 5,
        children: [
          { subcategoryId: 'food.food_delivery', spentMinor: 45000, count: 3 },
          { subcategoryId: 'food.cafes', spentMinor: 10000, count: 1 },
          { subcategoryId: null, spentMinor: 4000, count: 1 },
        ],
      },
      {
        categoryId: 'transport',
        spentMinor: 25000,
        count: 1,
        children: [{ subcategoryId: 'transport.cab', spentMinor: 25000, count: 1 }],
      },
    ]);
    for (const parent of result) {
      expect(parent.children.reduce((s, c) => s + c.spentMinor, 0)).toBe(parent.spentMinor);
      expect(parent.children.reduce((s, c) => s + c.count, 0)).toBe(parent.count);
    }
  });

  it('puts uncategorized in a null bucket, sorted last on ties', () => {
    const txs = [
      makeTransaction({ amountMinor: 10000 }),
      makeTransaction({ amountMinor: 10000, categoryId: 'shopping' }),
      makeTransaction({ amountMinor: 10000, categoryId: 'bills' }),
    ];
    expect(spendingByCategory(txs, CATEGORIES, SEPT).map((c) => c.categoryId)).toEqual(['bills', 'shopping', null]);
  });

  it('excludes transfers, income, ignored, deleted, duplicates and out-of-range transactions', () => {
    const txs = [
      makeTransaction({ type: 'transfer', categoryId: 'finance', subcategoryId: 'finance.credit_card_payment' }),
      makeTransaction({ type: 'income', categoryId: 'income' }),
      makeTransaction({ categoryId: 'food', status: 'ignored' }),
      makeTransaction({ categoryId: 'food', deletedAt: 1 }),
      makeTransaction({ categoryId: 'food', reviewReasons: ['possible_duplicate'], status: 'needs_review' }),
      makeTransaction({ categoryId: 'food', occurredAt: at(2026, 10, 1) }),
    ];
    expect(spendingByCategory(txs, CATEGORIES, SEPT)).toEqual([]);
  });

  it('resolves custom subcategories through the given category rows', () => {
    const custom: Category[] = [
      ...CATEGORIES,
      { ...CATEGORIES[0]!, id: 'pets', parentId: null, isSystem: false, sortOrder: 9000 },
      { ...CATEGORIES[0]!, id: 'pets.vet', parentId: 'pets', isSystem: false, sortOrder: 9001 },
    ];
    const result = spendingByCategory([makeTransaction({ amountMinor: 70000, subcategoryId: 'pets.vet' })], custom, SEPT);
    expect(result).toEqual([
      { categoryId: 'pets', spentMinor: 70000, count: 1, children: [{ subcategoryId: 'pets.vet', spentMinor: 70000, count: 1 }] },
    ]);
  });

  it('can report a negative category when refunds exceed spending', () => {
    const txs = [
      makeTransaction({ amountMinor: 10000, categoryId: 'shopping' }),
      makeTransaction({ type: 'refund', amountMinor: 30000, categoryId: 'shopping' }),
      makeTransaction({ amountMinor: 5000, categoryId: 'food' }),
    ];
    expect(spendingByCategory(txs, CATEGORIES, SEPT).map((c) => [c.categoryId, c.spentMinor, c.count])).toEqual([
      ['food', 5000, 1],
      ['shopping', -20000, 2],
    ]);
  });
});

describe('spendingByMerchant', () => {
  it('groups by merchant name, with missing names under Unknown', () => {
    const txs = [
      makeTransaction({ amountMinor: 20000, merchantName: 'Test Cafe' }),
      makeTransaction({ amountMinor: 15000, merchantName: 'Test Cafe' }),
      makeTransaction({ type: 'refund', amountMinor: 5000, merchantName: 'Test Cafe' }),
      makeTransaction({ amountMinor: 40000, merchantName: null }),
      makeTransaction({ amountMinor: 1000, merchantName: '' }),
      makeTransaction({ amountMinor: 10000, merchantName: 'Sample Store' }),
      makeTransaction({ type: 'transfer', amountMinor: 999999, merchantName: 'Sample Store' }),
    ];
    expect(spendingByMerchant(txs, SEPT)).toEqual([
      { merchantName: UNKNOWN_MERCHANT, spentMinor: 41000, count: 2 },
      { merchantName: 'Test Cafe', spentMinor: 30000, count: 3 },
      { merchantName: 'Sample Store', spentMinor: 10000, count: 1 },
    ]);
  });

  it('breaks ties by name ascending', () => {
    const txs = [
      makeTransaction({ amountMinor: 5000, merchantName: 'Zeta Mart' }),
      makeTransaction({ amountMinor: 5000, merchantName: 'Alpha Mart' }),
    ];
    expect(spendingByMerchant(txs, SEPT).map((m) => m.merchantName)).toEqual(['Alpha Mart', 'Zeta Mart']);
  });
});

describe('spendingBySourceApp', () => {
  it('groups by capturing package; manual entries (null) sort last on ties', () => {
    const txs = [
      makeTransaction({ amountMinor: 10000, sourceApp: 'com.example.upi' }),
      makeTransaction({ amountMinor: 20000, sourceApp: 'com.example.upi' }),
      makeTransaction({ amountMinor: 30000, sourceApp: 'com.example.bank' }),
      makeTransaction({ amountMinor: 30000, sourceApp: null, source: 'manual', paymentMethod: 'cash' }),
      makeTransaction({ amountMinor: 5000, sourceApp: 'com.example.sms' }),
      makeTransaction({ type: 'refund', amountMinor: 5000, sourceApp: 'com.example.sms' }),
    ];
    expect(spendingBySourceApp(txs, SEPT)).toEqual([
      { sourceApp: 'com.example.bank', spentMinor: 30000, count: 1 },
      { sourceApp: 'com.example.upi', spentMinor: 30000, count: 2 },
      { sourceApp: null, spentMinor: 30000, count: 1 },
      { sourceApp: 'com.example.sms', spentMinor: 0, count: 2 },
    ]);
  });
});

describe('dailySeries', () => {
  it('returns one zero-filled entry per local day', () => {
    const range = { from: at(2026, 9, 1), to: at(2026, 9, 4) };
    const txs = [
      makeTransaction({ amountMinor: 10000, occurredAt: at(2026, 9, 1, 0, 0) }),
      makeTransaction({ amountMinor: 5000, occurredAt: at(2026, 9, 1, 23, 59) }),
      makeTransaction({ type: 'refund', amountMinor: 2000, occurredAt: at(2026, 9, 3, 9) }),
      makeTransaction({ amountMinor: 99999, occurredAt: at(2026, 9, 4) }),
      makeTransaction({ type: 'transfer', amountMinor: 99999, occurredAt: at(2026, 9, 2, 9) }),
    ];
    expect(dailySeries(txs, range)).toEqual([
      { dayKey: '2026-09-01', from: at(2026, 9, 1), spentMinor: 15000 },
      { dayKey: '2026-09-02', from: at(2026, 9, 2), spentMinor: 0 },
      { dayKey: '2026-09-03', from: at(2026, 9, 3), spentMinor: -2000 },
    ]);
  });

  it('covers a whole month and crosses month boundaries', () => {
    expect(dailySeries([], SEPT)).toHaveLength(30);
    const series = dailySeries([], { from: at(2026, 9, 30), to: at(2026, 10, 2) });
    expect(series.map((d) => d.dayKey)).toEqual(['2026-09-30', '2026-10-01']);
  });

  it('includes a partial first day but only counts transactions inside the range', () => {
    const range = { from: at(2026, 9, 1, 12), to: at(2026, 9, 2, 12) };
    const txs = [
      makeTransaction({ amountMinor: 100, occurredAt: at(2026, 9, 1, 9) }),
      makeTransaction({ amountMinor: 200, occurredAt: at(2026, 9, 1, 13) }),
      makeTransaction({ amountMinor: 400, occurredAt: at(2026, 9, 2, 11) }),
      makeTransaction({ amountMinor: 800, occurredAt: at(2026, 9, 2, 13) }),
    ];
    expect(dailySeries(txs, range).map((d) => [d.dayKey, d.spentMinor])).toEqual([
      ['2026-09-01', 200],
      ['2026-09-02', 400],
    ]);
  });

  it('returns [] for an empty or inverted range', () => {
    expect(dailySeries([], { from: at(2026, 9, 2), to: at(2026, 9, 2) })).toEqual([]);
    expect(dailySeries([], { from: at(2026, 9, 3), to: at(2026, 9, 2) })).toEqual([]);
  });
});

describe('weeklySeries', () => {
  it('uses Monday-start weeks clipped to the range and zero-fills', () => {
    // 1 Sep 2026 is a Tuesday; weeks start Mon 31 Aug, 7, 14, 21, 28 Sep; 1 Oct is a Thursday.
    const txs = [
      makeTransaction({ amountMinor: 10000, occurredAt: at(2026, 9, 1, 10) }),
      makeTransaction({ amountMinor: 5000, occurredAt: at(2026, 9, 6, 23, 59) }),
      makeTransaction({ amountMinor: 7000, occurredAt: at(2026, 9, 7) }),
      makeTransaction({ amountMinor: 3000, occurredAt: at(2026, 9, 30, 20) }),
      makeTransaction({ amountMinor: 99999, occurredAt: at(2026, 8, 31, 10) }),
    ];
    expect(weeklySeries(txs, SEPT)).toEqual([
      { from: at(2026, 9, 1), to: at(2026, 9, 7), spentMinor: 15000 },
      { from: at(2026, 9, 7), to: at(2026, 9, 14), spentMinor: 7000 },
      { from: at(2026, 9, 14), to: at(2026, 9, 21), spentMinor: 0 },
      { from: at(2026, 9, 21), to: at(2026, 9, 28), spentMinor: 0 },
      { from: at(2026, 9, 28), to: at(2026, 10, 1), spentMinor: 3000 },
    ]);
  });

  it('supports Sunday-start weeks', () => {
    const range = { from: at(2026, 9, 1), to: at(2026, 9, 15) };
    const txs = [makeTransaction({ amountMinor: 1000, occurredAt: at(2026, 9, 6, 9) })]; // a Sunday
    expect(weeklySeries(txs, range, 0)).toEqual([
      { from: at(2026, 9, 1), to: at(2026, 9, 6), spentMinor: 0 },
      { from: at(2026, 9, 6), to: at(2026, 9, 13), spentMinor: 1000 },
      { from: at(2026, 9, 13), to: at(2026, 9, 15), spentMinor: 0 },
    ]);
  });

  it('returns [] for an empty range', () => {
    expect(weeklySeries([], { from: at(2026, 9, 7), to: at(2026, 9, 7) })).toEqual([]);
  });
});

describe('largestExpenses', () => {
  it('returns counted expenses by amount desc, then most recent, respecting limit', () => {
    const big = makeTransaction({ amountMinor: 90000, occurredAt: at(2026, 9, 3) });
    const tieOld = makeTransaction({ amountMinor: 50000, occurredAt: at(2026, 9, 4) });
    const tieNew = makeTransaction({ amountMinor: 50000, occurredAt: at(2026, 9, 10) });
    const small = makeTransaction({ amountMinor: 1000 });
    const txs = [
      small,
      tieOld,
      big,
      tieNew,
      makeTransaction({ type: 'refund', amountMinor: 500000 }),
      makeTransaction({ type: 'transfer', amountMinor: 500000 }),
      makeTransaction({ amountMinor: 500000, status: 'ignored' }),
      makeTransaction({ amountMinor: 500000, occurredAt: at(2026, 10, 2) }),
    ];
    expect(largestExpenses(txs, SEPT, 3).map((t) => t.id)).toEqual([big.id, tieNew.id, tieOld.id]);
    expect(largestExpenses(txs, SEPT, 10)).toHaveLength(4);
    expect(largestExpenses(txs, SEPT, 0)).toEqual([]);
    expect(largestExpenses(txs, SEPT, -1)).toEqual([]);
  });

  it('does not mutate the input order', () => {
    const txs = [makeTransaction({ amountMinor: 1 }), makeTransaction({ amountMinor: 2 })];
    const ids = txs.map((t) => t.id);
    largestExpenses(txs, SEPT, 2);
    expect(txs.map((t) => t.id)).toEqual(ids);
  });
});

describe('compareWithPreviousMonth', () => {
  it('compares month-to-date with the same span of the previous month', () => {
    const txs = [
      makeTransaction({ amountMinor: 12500, occurredAt: at(2026, 9, 10) }),
      makeTransaction({ amountMinor: 99999, occurredAt: at(2026, 9, 16) }), // after today
      makeTransaction({ amountMinor: 10000, occurredAt: at(2026, 8, 15, 23, 59) }),
      makeTransaction({ amountMinor: 99999, occurredAt: at(2026, 8, 16) }), // after same day last month
    ];
    expect(compareWithPreviousMonth(txs, at(2026, 9, 15, 10))).toEqual({
      current: { from: at(2026, 9, 1), to: at(2026, 9, 16), spentMinor: 12500 },
      previous: { from: at(2026, 8, 1), to: at(2026, 8, 16), spentMinor: 10000 },
      deltaMinor: 2500,
      deltaPct: 0.25,
    });
  });

  it('clamps to the end of a shorter previous month', () => {
    const txs = [makeTransaction({ amountMinor: 10000, occurredAt: at(2026, 2, 28, 22) })];
    const result = compareWithPreviousMonth(txs, at(2026, 3, 31, 9));
    expect(result.current).toEqual({ from: at(2026, 3, 1), to: at(2026, 4, 1), spentMinor: 0 });
    expect(result.previous).toEqual({ from: at(2026, 2, 1), to: at(2026, 3, 1), spentMinor: 10000 });
    expect(result.deltaPct).toBe(-1);
  });

  it('clamps to 29 Feb in a leap year', () => {
    const result = compareWithPreviousMonth([], at(2028, 3, 31));
    expect(result.previous.from).toBe(at(2028, 2, 1));
    expect(result.previous.to).toBe(at(2028, 3, 1));
    expect(compareWithPreviousMonth([], at(2028, 3, 29)).previous.to).toBe(at(2028, 3, 1));
  });

  it('crosses a year boundary', () => {
    const result = compareWithPreviousMonth([], at(2027, 1, 5));
    expect(result.previous).toEqual({ from: at(2026, 12, 1), to: at(2026, 12, 6), spentMinor: 0 });
  });

  it('returns deltaPct null when the previous spend is zero or negative', () => {
    const now = at(2026, 9, 15);
    const current = makeTransaction({ amountMinor: 5000, occurredAt: at(2026, 9, 5) });
    expect(compareWithPreviousMonth([current], now)).toMatchObject({ deltaMinor: 5000, deltaPct: null });
    const refund = makeTransaction({ type: 'refund', amountMinor: 3000, occurredAt: at(2026, 8, 5) });
    expect(compareWithPreviousMonth([current, refund], now)).toMatchObject({ deltaMinor: 8000, deltaPct: null });
  });

  it('rounds deltaPct to 2 decimals', () => {
    const txs = [
      makeTransaction({ amountMinor: 10001, occurredAt: at(2026, 9, 5) }),
      makeTransaction({ amountMinor: 30000, occurredAt: at(2026, 8, 5) }),
    ];
    expect(compareWithPreviousMonth(txs, at(2026, 9, 15)).deltaPct).toBe(-0.67);
  });
});

describe('incomeVsExpense', () => {
  it('reports counted income, net spending and the difference', () => {
    const txs = [
      makeTransaction({ type: 'income', amountMinor: 5000000 }),
      makeTransaction({ type: 'income', amountMinor: 100000, status: 'ignored' }),
      makeTransaction({ amountMinor: 1200000 }),
      makeTransaction({ type: 'refund', amountMinor: 200000 }),
      makeTransaction({ type: 'transfer', amountMinor: 3000000 }),
    ];
    expect(incomeVsExpense(txs, SEPT)).toEqual({ incomeMinor: 5000000, spentMinor: 1000000, netMinor: 4000000 });
  });

  it('is negative when spending exceeds income', () => {
    const txs = [makeTransaction({ type: 'income', amountMinor: 1000 }), makeTransaction({ amountMinor: 5000 })];
    expect(incomeVsExpense(txs, SEPT)).toEqual({ incomeMinor: 1000, spentMinor: 5000, netMinor: -4000 });
  });
});
