import { buildDefaultCategoryRows } from '@/domain/categories/defaults';
import type { Category } from '@/types';
import { monthRange } from '@/utils/dates';

import {
  indexCategories,
  isCountedAsIncome,
  isCountedForSpending,
  isInCategory,
  netSpending,
  spendingContribution,
  topLevelCategoryId,
  totalIncome,
} from './spending';
import { at, makeTransaction } from './testFactories';

const SEPT = monthRange(at(2026, 9, 1));

function customCategory(overrides: Partial<Category>): Category {
  return {
    id: 'custom',
    name: 'Custom',
    parentId: null,
    kind: 'expense',
    icon: null,
    color: null,
    isSystem: false,
    sortOrder: 5000,
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    ...overrides,
  };
}

describe('isCountedForSpending (ARCHITECTURE §8)', () => {
  it('counts confirmed and needs_review expenses and refunds', () => {
    expect(isCountedForSpending(makeTransaction({ type: 'expense' }))).toBe(true);
    expect(isCountedForSpending(makeTransaction({ type: 'refund' }))).toBe(true);
    expect(isCountedForSpending(makeTransaction({ status: 'needs_review', reviewReasons: ['uncategorized'] }))).toBe(
      true,
    );
  });

  it('never counts transfers or income', () => {
    expect(isCountedForSpending(makeTransaction({ type: 'transfer' }))).toBe(false);
    expect(isCountedForSpending(makeTransaction({ type: 'income' }))).toBe(false);
  });

  it('excludes ignored, soft-deleted and possible duplicates', () => {
    expect(isCountedForSpending(makeTransaction({ status: 'ignored' }))).toBe(false);
    expect(isCountedForSpending(makeTransaction({ deletedAt: at(2026, 9, 16) }))).toBe(false);
    expect(
      isCountedForSpending(
        makeTransaction({ status: 'needs_review', reviewReasons: ['uncategorized', 'possible_duplicate'] }),
      ),
    ).toBe(false);
  });
});

describe('isCountedAsIncome', () => {
  it('counts only income under the same status rules', () => {
    expect(isCountedAsIncome(makeTransaction({ type: 'income' }))).toBe(true);
    expect(isCountedAsIncome(makeTransaction({ type: 'income', status: 'needs_review' }))).toBe(true);
    expect(isCountedAsIncome(makeTransaction({ type: 'income', status: 'ignored' }))).toBe(false);
    expect(isCountedAsIncome(makeTransaction({ type: 'income', deletedAt: 1 }))).toBe(false);
    expect(isCountedAsIncome(makeTransaction({ type: 'income', reviewReasons: ['possible_duplicate'] }))).toBe(false);
    expect(isCountedAsIncome(makeTransaction({ type: 'refund' }))).toBe(false);
    expect(isCountedAsIncome(makeTransaction({ type: 'transfer', direction: 'credit' }))).toBe(false);
  });
});

describe('spendingContribution', () => {
  it('adds expenses, subtracts refunds and ignores everything else', () => {
    expect(spendingContribution(makeTransaction({ type: 'expense', amountMinor: 12400 }))).toBe(12400);
    expect(spendingContribution(makeTransaction({ type: 'refund', amountMinor: 5000 }))).toBe(-5000);
    expect(spendingContribution(makeTransaction({ type: 'transfer', amountMinor: 5000 }))).toBe(0);
    expect(spendingContribution(makeTransaction({ type: 'income', amountMinor: 5000 }))).toBe(0);
    expect(spendingContribution(makeTransaction({ type: 'expense', status: 'ignored' }))).toBe(0);
  });
});

describe('topLevelCategoryId', () => {
  const none = indexCategories([]);

  it('prefers categoryId when set', () => {
    expect(topLevelCategoryId({ categoryId: 'food', subcategoryId: 'food.cafes' }, none)).toBe('food');
  });

  it('returns null when uncategorized', () => {
    expect(topLevelCategoryId({ categoryId: null, subcategoryId: null }, none)).toBeNull();
  });

  it('resolves a built-in subcategory to its parent without category rows', () => {
    expect(topLevelCategoryId({ categoryId: null, subcategoryId: 'food.food_delivery' }, none)).toBe('food');
    expect(topLevelCategoryId({ categoryId: null, subcategoryId: 'no.such.id' }, none)).toBeNull();
  });

  it('resolves via category rows, including custom subcategories', () => {
    const index = indexCategories([
      customCategory({ id: 'pets' }),
      customCategory({ id: 'pets.vet', parentId: 'pets' }),
    ]);
    expect(topLevelCategoryId({ categoryId: null, subcategoryId: 'pets.vet' }, index)).toBe('pets');
    // A top-level row used as a subcategory resolves to itself.
    expect(topLevelCategoryId({ categoryId: null, subcategoryId: 'pets' }, index)).toBe('pets');
  });

  it('uses the row parentId over the built-in tree when a row exists', () => {
    const index = indexCategories([customCategory({ id: 'food.cafes', parentId: 'custom' })]);
    expect(topLevelCategoryId({ categoryId: null, subcategoryId: 'food.cafes' }, index)).toBe('custom');
  });
});

describe('isInCategory', () => {
  const index = indexCategories(buildDefaultCategoryRows(0));

  it('matches the top-level category or the exact subcategory', () => {
    const tx = { categoryId: null, subcategoryId: 'food.cafes' };
    expect(isInCategory(tx, 'food', index)).toBe(true);
    expect(isInCategory(tx, 'food.cafes', index)).toBe(true);
    expect(isInCategory(tx, 'food.restaurants', index)).toBe(false);
    expect(isInCategory(tx, 'transport', index)).toBe(false);
  });
});

describe('netSpending', () => {
  it('sums expenses minus refunds in range, skipping non-counted transactions', () => {
    const txs = [
      makeTransaction({ amountMinor: 12400 }),
      makeTransaction({ amountMinor: 30000, status: 'needs_review', reviewReasons: ['uncategorized'] }),
      makeTransaction({ type: 'refund', amountMinor: 2400 }),
      makeTransaction({ type: 'transfer', amountMinor: 500000 }),
      makeTransaction({ type: 'income', amountMinor: 900000 }),
      makeTransaction({ amountMinor: 70000, status: 'ignored' }),
      makeTransaction({ amountMinor: 80000, deletedAt: at(2026, 9, 20) }),
      makeTransaction({ amountMinor: 12400, status: 'needs_review', reviewReasons: ['possible_duplicate'] }),
    ];
    expect(netSpending(txs, SEPT)).toBe(12400 + 30000 - 2400);
  });

  it('uses a half-open range', () => {
    const txs = [
      makeTransaction({ amountMinor: 100, occurredAt: at(2026, 9, 1) }),
      makeTransaction({ amountMinor: 200, occurredAt: at(2026, 9, 30, 23, 59) }),
      makeTransaction({ amountMinor: 400, occurredAt: at(2026, 10, 1) }),
      makeTransaction({ amountMinor: 800, occurredAt: at(2026, 8, 31, 23, 59) }),
    ];
    expect(netSpending(txs, SEPT)).toBe(300);
  });

  it('goes negative when refunds exceed spending', () => {
    const txs = [
      makeTransaction({ amountMinor: 10000 }),
      makeTransaction({ type: 'refund', amountMinor: 25000 }),
    ];
    expect(netSpending(txs, SEPT)).toBe(-15000);
  });

  it('returns 0 for no transactions', () => {
    expect(netSpending([], SEPT)).toBe(0);
  });

  it('filters by top-level category, resolving subcategory-only transactions', () => {
    const txs = [
      makeTransaction({ amountMinor: 10000, categoryId: 'food', subcategoryId: 'food.cafes' }),
      makeTransaction({ amountMinor: 20000, subcategoryId: 'food.food_delivery' }),
      makeTransaction({ type: 'refund', amountMinor: 5000, subcategoryId: 'food.food_delivery' }),
      makeTransaction({ amountMinor: 40000, categoryId: 'transport', subcategoryId: 'transport.cab' }),
      makeTransaction({ amountMinor: 80000 }),
    ];
    expect(netSpending(txs, SEPT, { categoryId: 'food' })).toBe(25000);
    expect(netSpending(txs, SEPT, { categoryId: 'food.food_delivery' })).toBe(15000);
    expect(netSpending(txs, SEPT, { categoryId: 'transport' })).toBe(40000);
  });

  it('filters custom categories via the provided rows', () => {
    const categories = [customCategory({ id: 'pets' }), customCategory({ id: 'pets.vet', parentId: 'pets' })];
    const txs = [
      makeTransaction({ amountMinor: 50000, subcategoryId: 'pets.vet' }),
      makeTransaction({ amountMinor: 10000, subcategoryId: 'food.cafes' }),
    ];
    expect(netSpending(txs, SEPT, { categoryId: 'pets', categories })).toBe(50000);
    expect(netSpending(txs, SEPT, { categoryId: 'pets' })).toBe(0);
  });
});

describe('totalIncome', () => {
  it('sums counted income in range only', () => {
    const txs = [
      makeTransaction({ type: 'income', amountMinor: 5000000 }),
      makeTransaction({ type: 'income', amountMinor: 100000, status: 'needs_review' }),
      makeTransaction({ type: 'income', amountMinor: 700000, status: 'ignored' }),
      makeTransaction({ type: 'income', amountMinor: 300000, occurredAt: at(2026, 10, 1) }),
      makeTransaction({ type: 'refund', amountMinor: 20000 }),
      makeTransaction({ type: 'transfer', direction: 'credit', amountMinor: 1000000 }),
      makeTransaction({ type: 'expense', amountMinor: 40000 }),
    ];
    expect(totalIncome(txs, SEPT)).toBe(5100000);
  });
});
