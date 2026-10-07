import { at, makeRecurring, makeTransaction } from '@/domain/analytics/testFactories';
import { computeSafeToSpend } from '@/domain/budgets/safeToSpend';

const rupees = (r: number) => r * 100;

describe('computeSafeToSpend (ARCHITECTURE §9)', () => {
  it('reproduces the spec example', () => {
    const rent = makeRecurring({ name: 'Rent', amountMinor: rupees(8000), nextDueAt: at(2026, 9, 25), anchorDay: 25 });
    const result = computeSafeToSpend({
      totalBudgetMinor: rupees(25000),
      transactions: [
        makeTransaction({ amountMinor: rupees(10000), occurredAt: at(2026, 9, 5) }),
        makeTransaction({ amountMinor: rupees(3200), occurredAt: at(2026, 9, 18) }),
      ],
      recurring: [rent],
      now: at(2026, 9, 21, 10),
    });
    expect(result).toEqual({
      monthKey: '2026-09',
      budgetMinor: rupees(25000),
      spentMinor: rupees(13200),
      remainingMinor: rupees(11800),
      upcomingCommittedMinor: rupees(8000),
      upcomingItems: [
        { recurringId: rent.id, name: 'Rent', amountMinor: rupees(8000), dueAt: at(2026, 9, 25), isOverdue: false },
      ],
      availableMinor: rupees(3800),
      daysLeft: 10,
      safePerDayMinor: rupees(380),
      isOverBudget: false,
    });
  });

  it('uses net spending for the whole current month only (§8)', () => {
    const result = computeSafeToSpend({
      totalBudgetMinor: rupees(1000),
      transactions: [
        makeTransaction({ amountMinor: rupees(300), occurredAt: at(2026, 9, 2) }),
        makeTransaction({ type: 'refund', amountMinor: rupees(100), occurredAt: at(2026, 9, 3) }),
        makeTransaction({ type: 'transfer', amountMinor: rupees(900), occurredAt: at(2026, 9, 3) }),
        makeTransaction({ type: 'income', amountMinor: rupees(900), occurredAt: at(2026, 9, 3) }),
        makeTransaction({ amountMinor: rupees(900), occurredAt: at(2026, 9, 3), status: 'ignored' }),
        makeTransaction({ amountMinor: rupees(900), occurredAt: at(2026, 9, 3), reviewReasons: ['possible_duplicate'] }),
        makeTransaction({ amountMinor: rupees(900), occurredAt: at(2026, 8, 31, 23, 59) }),
      ],
      recurring: [],
      now: at(2026, 9, 21),
    });
    expect(result).toMatchObject({ spentMinor: rupees(200), remainingMinor: rupees(800), availableMinor: rupees(800) });
  });

  it('counts an item due today as upcoming, not overdue', () => {
    const bill = makeRecurring({ amountMinor: rupees(500), nextDueAt: at(2026, 9, 21), anchorDay: 21 });
    const result = computeSafeToSpend({ totalBudgetMinor: rupees(5000), transactions: [], recurring: [bill], now: at(2026, 9, 21, 22) });
    expect(result.upcomingItems).toEqual([expect.objectContaining({ dueAt: at(2026, 9, 21), isOverdue: false })]);
    expect(result.upcomingCommittedMinor).toBe(rupees(500));
  });

  it('counts overdue unpaid recurring expenses first', () => {
    const overdue = makeRecurring({ name: 'Overdue Bill', amountMinor: rupees(700), nextDueAt: at(2026, 9, 5), anchorDay: 5 });
    const later = makeRecurring({ name: 'Later Bill', amountMinor: rupees(300), nextDueAt: at(2026, 9, 28), anchorDay: 28 });
    const result = computeSafeToSpend({
      totalBudgetMinor: rupees(5000),
      transactions: [],
      recurring: [later, overdue],
      now: at(2026, 9, 21),
    });
    expect(result.upcomingItems.map((i) => [i.name, i.dueAt, i.isOverdue])).toEqual([
      ['Overdue Bill', at(2026, 9, 5), true],
      ['Later Bill', at(2026, 9, 28), false],
    ]);
    expect(result.upcomingCommittedMinor).toBe(rupees(1000));
    expect(result.availableMinor).toBe(rupees(4000));
  });

  it('counts every weekly occurrence left in the month', () => {
    // 21 Sep 2026 is a Monday.
    const weekly = makeRecurring({ frequency: 'weekly', anchorDay: null, amountMinor: rupees(100), nextDueAt: at(2026, 9, 21) });
    const result = computeSafeToSpend({ totalBudgetMinor: rupees(5000), transactions: [], recurring: [weekly], now: at(2026, 9, 21) });
    expect(result.upcomingItems.map((i) => i.dueAt)).toEqual([at(2026, 9, 21), at(2026, 9, 28)]);
    expect(result.upcomingCommittedMinor).toBe(rupees(200));
  });

  it('ignores recurring due next month, income, inactive and deleted items', () => {
    const result = computeSafeToSpend({
      totalBudgetMinor: rupees(5000),
      transactions: [],
      recurring: [
        makeRecurring({ amountMinor: rupees(100), nextDueAt: at(2026, 10, 1), anchorDay: 1 }),
        makeRecurring({ type: 'income', amountMinor: rupees(100), nextDueAt: at(2026, 9, 25), anchorDay: 25 }),
        makeRecurring({ type: 'income', amountMinor: rupees(100), nextDueAt: at(2026, 9, 1), anchorDay: 1 }),
        makeRecurring({ isActive: false, amountMinor: rupees(100), nextDueAt: at(2026, 9, 25), anchorDay: 25 }),
        makeRecurring({ deletedAt: 1, amountMinor: rupees(100), nextDueAt: at(2026, 9, 25), anchorDay: 25 }),
      ],
      now: at(2026, 9, 21),
    });
    expect(result.upcomingItems).toEqual([]);
    expect(result.upcomingCommittedMinor).toBe(0);
    expect(result.availableMinor).toBe(rupees(5000));
  });

  it('floors available at 0 and flags over budget', () => {
    const result = computeSafeToSpend({
      totalBudgetMinor: rupees(1000),
      transactions: [makeTransaction({ amountMinor: rupees(1500), occurredAt: at(2026, 9, 10) })],
      recurring: [],
      now: at(2026, 9, 21),
    });
    expect(result).toMatchObject({
      remainingMinor: rupees(-500),
      availableMinor: 0,
      safePerDayMinor: 0,
      isOverBudget: true,
    });
  });

  it('floors available at 0 when commitments exceed what remains, without flagging over budget', () => {
    const result = computeSafeToSpend({
      totalBudgetMinor: rupees(1000),
      transactions: [makeTransaction({ amountMinor: rupees(1000), occurredAt: at(2026, 9, 10) })],
      recurring: [makeRecurring({ amountMinor: rupees(200), nextDueAt: at(2026, 9, 25), anchorDay: 25 })],
      now: at(2026, 9, 21),
    });
    expect(result).toMatchObject({ remainingMinor: 0, availableMinor: 0, isOverBudget: false });
  });

  it('floors the per-day amount to whole paise', () => {
    const result = computeSafeToSpend({ totalBudgetMinor: 1000, transactions: [], recurring: [], now: at(2026, 9, 21) });
    expect(result).toMatchObject({ availableMinor: 1000, daysLeft: 10, safePerDayMinor: 100 });
    const odd = computeSafeToSpend({ totalBudgetMinor: 1009, transactions: [], recurring: [], now: at(2026, 9, 21) });
    expect(odd.safePerDayMinor).toBe(100);
  });

  it('gives the whole available amount on the last day of the month', () => {
    const result = computeSafeToSpend({ totalBudgetMinor: rupees(900), transactions: [], recurring: [], now: at(2026, 9, 30, 23, 59) });
    expect(result).toMatchObject({ daysLeft: 1, safePerDayMinor: rupees(900) });
  });

  it('counts the full month on the 1st', () => {
    const result = computeSafeToSpend({ totalBudgetMinor: rupees(3100), transactions: [], recurring: [], now: at(2026, 10, 1) });
    expect(result).toMatchObject({ monthKey: '2026-10', daysLeft: 31, safePerDayMinor: rupees(100) });
  });
});
