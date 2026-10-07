import {
  buildDefaultCategoryRows,
  DEFAULT_CATEGORIES,
  defaultParentOf,
  isDefaultCategoryId,
} from '@/domain/categories/defaults';

const ALL_IDS = DEFAULT_CATEGORIES.flatMap((c) => [c.id, ...c.children.map((s) => s.id)]);

describe('DEFAULT_CATEGORIES', () => {
  it('has unique IDs', () => {
    expect(new Set(ALL_IDS).size).toBe(ALL_IDS.length);
  });

  it('prefixes every child ID with its parent ID', () => {
    for (const parent of DEFAULT_CATEGORIES) {
      expect(parent.id).not.toContain('.');
      for (const child of parent.children) {
        expect(child.id.startsWith(`${parent.id}.`)).toBe(true);
        expect(child.id.slice(parent.id.length + 1)).toMatch(/^[a-z0-9_]+$/);
      }
    }
  });

  it('keeps fewer than 100 children per parent so sortOrder stays unique', () => {
    for (const parent of DEFAULT_CATEGORIES) expect(parent.children.length).toBeLessThan(100);
  });
});

describe('buildDefaultCategoryRows', () => {
  const now = 1_790_000_000_000;
  const rows = buildDefaultCategoryRows(now);
  const byId = new Map(rows.map((r) => [r.id, r]));

  it('emits one row per built-in category', () => {
    expect(rows.map((r) => r.id).sort()).toEqual([...ALL_IDS].sort());
  });

  it('lists parents before their children', () => {
    const position = new Map(rows.map((r, i) => [r.id, i]));
    for (const row of rows) {
      if (row.parentId === null) continue;
      expect(position.get(row.parentId)).toBeLessThan(position.get(row.id)!);
    }
  });

  it('assigns sortOrder parentIndex × 100 (+ childIndex + 1), increasing in row order', () => {
    expect(byId.get('food')?.sortOrder).toBe(0);
    expect(byId.get('food.restaurants')?.sortOrder).toBe(1);
    expect(byId.get('food.food_delivery')?.sortOrder).toBe(2);
    expect(byId.get('transport')?.sortOrder).toBe(100);
    expect(byId.get('transport.metro')?.sortOrder).toBe(101);
    const orders = rows.map((r) => r.sortOrder);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it('marks rows as system rows with the given timestamps', () => {
    for (const row of rows) {
      expect(row).toMatchObject({ isSystem: true, createdAt: now, updatedAt: now, deletedAt: null });
    }
  });

  it('links children to their parent and inherits colour and kind', () => {
    expect(byId.get('food')).toMatchObject({ parentId: null, kind: 'expense', color: '#F2994A' });
    expect(byId.get('food.cafes')).toMatchObject({ parentId: 'food', kind: 'expense', color: '#F2994A' });
    expect(byId.get('income.salary')).toMatchObject({ parentId: 'income', kind: 'income' });
    expect(byId.get('transfers.own_account')).toMatchObject({ parentId: 'transfers', kind: 'transfer' });
  });

  it('makes credit card payments, investments and savings transfers (§8)', () => {
    expect(byId.get('finance')?.kind).toBe('expense');
    for (const id of ['finance.credit_card_payment', 'finance.investments', 'finance.savings']) {
      expect(byId.get(id)).toMatchObject({ parentId: 'finance', kind: 'transfer' });
    }
    expect(byId.get('finance.emi')?.kind).toBe('expense');
    expect(byId.get('finance.bank_charges')?.kind).toBe('expense');
  });
});

describe('defaultParentOf', () => {
  it('returns the parent of a built-in subcategory', () => {
    expect(defaultParentOf('food.food_delivery')).toBe('food');
    expect(defaultParentOf('finance.savings')).toBe('finance');
    for (const parent of DEFAULT_CATEGORIES) {
      for (const child of parent.children) expect(defaultParentOf(child.id)).toBe(parent.id);
    }
  });

  it('returns null for top-level and unknown IDs', () => {
    expect(defaultParentOf('food')).toBeNull();
    expect(defaultParentOf('food.unknown')).toBeNull();
    expect(defaultParentOf('')).toBeNull();
  });
});

describe('isDefaultCategoryId', () => {
  it('recognises built-in parents and children only', () => {
    expect(isDefaultCategoryId('food')).toBe(true);
    expect(isDefaultCategoryId('food.food_delivery')).toBe(true);
    expect(isDefaultCategoryId('transfers.other')).toBe(true);
    expect(isDefaultCategoryId('food.unknown')).toBe(false);
    expect(isDefaultCategoryId('Food')).toBe(false);
    expect(isDefaultCategoryId('')).toBe(false);
  });
});
