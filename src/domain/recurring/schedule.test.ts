import { at, makeRecurring } from '@/domain/analytics/testFactories';
import { advanceAfterPayment, nextOccurrenceAfter, occurrencesBetween, upcoming } from '@/domain/recurring/schedule';

describe('occurrencesBetween', () => {
  it('steps weekly schedules by 7 × interval days', () => {
    // 7 Sep 2026 is a Monday.
    const range = { from: at(2026, 9, 1), to: at(2026, 10, 1) };
    const weekly = makeRecurring({ frequency: 'weekly', anchorDay: null, nextDueAt: at(2026, 9, 7) });
    expect(occurrencesBetween(weekly, range)).toEqual([at(2026, 9, 7), at(2026, 9, 14), at(2026, 9, 21), at(2026, 9, 28)]);
    expect(occurrencesBetween({ ...weekly, interval: 2 }, range)).toEqual([at(2026, 9, 7), at(2026, 9, 21)]);
  });

  it('crosses month boundaries for weekly schedules', () => {
    const weekly = makeRecurring({ frequency: 'weekly', anchorDay: null, nextDueAt: at(2026, 9, 28) });
    expect(occurrencesBetween(weekly, { from: at(2026, 9, 1), to: at(2026, 10, 13) })).toEqual([
      at(2026, 9, 28),
      at(2026, 10, 5),
      at(2026, 10, 12),
    ]);
  });

  it('steps monthly, quarterly and yearly schedules on the anchor day', () => {
    const monthly = makeRecurring({ nextDueAt: at(2026, 1, 15), anchorDay: 15 });
    expect(occurrencesBetween(monthly, { from: at(2026, 1, 1), to: at(2026, 7, 1) })).toEqual([
      at(2026, 1, 15),
      at(2026, 2, 15),
      at(2026, 3, 15),
      at(2026, 4, 15),
      at(2026, 5, 15),
      at(2026, 6, 15),
    ]);
    expect(occurrencesBetween({ ...monthly, interval: 2 }, { from: at(2026, 1, 1), to: at(2026, 7, 1) })).toEqual([
      at(2026, 1, 15),
      at(2026, 3, 15),
      at(2026, 5, 15),
    ]);

    const quarterly = makeRecurring({ frequency: 'quarterly', nextDueAt: at(2026, 1, 10), anchorDay: 10 });
    expect(occurrencesBetween(quarterly, { from: at(2026, 1, 1), to: at(2027, 1, 1) })).toEqual([
      at(2026, 1, 10),
      at(2026, 4, 10),
      at(2026, 7, 10),
      at(2026, 10, 10),
    ]);

    const yearly = makeRecurring({ frequency: 'yearly', nextDueAt: at(2026, 3, 5), anchorDay: 5 });
    expect(occurrencesBetween(yearly, { from: at(2026, 1, 1), to: at(2029, 1, 1) })).toEqual([
      at(2026, 3, 5),
      at(2027, 3, 5),
      at(2028, 3, 5),
    ]);
    expect(occurrencesBetween({ ...yearly, interval: 2 }, { from: at(2026, 1, 1), to: at(2031, 1, 1) })).toEqual([
      at(2026, 3, 5),
      at(2028, 3, 5),
      at(2030, 3, 5),
    ]);
  });

  it('clamps anchor day 31 to short months without drifting', () => {
    const rec = makeRecurring({ nextDueAt: at(2026, 1, 31), anchorDay: 31 });
    expect(occurrencesBetween(rec, { from: at(2026, 1, 1), to: at(2026, 6, 1) })).toEqual([
      at(2026, 1, 31),
      at(2026, 2, 28),
      at(2026, 3, 31),
      at(2026, 4, 30),
      at(2026, 5, 31),
    ]);
  });

  it('keeps anchor 31 when the stored nextDueAt is already a clamped date', () => {
    const rec = makeRecurring({ nextDueAt: at(2026, 2, 28), anchorDay: 31 });
    expect(occurrencesBetween(rec, { from: at(2026, 2, 1), to: at(2026, 5, 1) })).toEqual([
      at(2026, 2, 28),
      at(2026, 3, 31),
      at(2026, 4, 30),
    ]);
  });

  it('uses 29 Feb in leap years', () => {
    const monthly = makeRecurring({ nextDueAt: at(2028, 1, 31), anchorDay: 31 });
    expect(occurrencesBetween(monthly, { from: at(2028, 1, 1), to: at(2028, 4, 1) })).toEqual([
      at(2028, 1, 31),
      at(2028, 2, 29),
      at(2028, 3, 31),
    ]);

    const yearly = makeRecurring({ frequency: 'yearly', nextDueAt: at(2028, 2, 29), anchorDay: 29 });
    expect(occurrencesBetween(yearly, { from: at(2028, 1, 1), to: at(2033, 1, 1) })).toEqual([
      at(2028, 2, 29),
      at(2029, 2, 28),
      at(2030, 2, 28),
      at(2031, 2, 28),
      at(2032, 2, 29),
    ]);
  });

  it('clamps quarterly schedules through February', () => {
    const rec = makeRecurring({ frequency: 'quarterly', nextDueAt: at(2026, 11, 30), anchorDay: 31 });
    expect(occurrencesBetween(rec, { from: at(2026, 11, 1), to: at(2027, 9, 1) })).toEqual([
      at(2026, 11, 30),
      at(2027, 2, 28),
      at(2027, 5, 31),
      at(2027, 8, 31),
    ]);
  });

  it('falls back to the day of nextDueAt when anchorDay is missing or invalid', () => {
    const range = { from: at(2026, 1, 1), to: at(2026, 4, 1) };
    const expected = [at(2026, 1, 31), at(2026, 2, 28), at(2026, 3, 31)];
    for (const anchorDay of [null, 0, 32, 2.5]) {
      expect(occurrencesBetween(makeRecurring({ nextDueAt: at(2026, 1, 31), anchorDay }), range)).toEqual(expected);
    }
  });

  it('treats a non-positive or fractional interval as 1', () => {
    const range = { from: at(2026, 1, 1), to: at(2026, 4, 1) };
    const expected = [at(2026, 1, 10), at(2026, 2, 10), at(2026, 3, 10)];
    for (const interval of [0, -2, 1.5, Number.NaN]) {
      expect(occurrencesBetween(makeRecurring({ nextDueAt: at(2026, 1, 10), anchorDay: 10, interval }), range)).toEqual(
        expected,
      );
    }
  });

  it('returns local start-of-day dates and uses a half-open range', () => {
    const rec = makeRecurring({ nextDueAt: at(2026, 9, 10, 15, 30), anchorDay: 10 });
    expect(occurrencesBetween(rec, { from: at(2026, 9, 10), to: at(2026, 11, 10) })).toEqual([
      at(2026, 9, 10),
      at(2026, 10, 10),
    ]);
  });

  it('skips occurrences before the range and returns [] when none fall in it', () => {
    const rec = makeRecurring({ nextDueAt: at(2026, 1, 5), anchorDay: 5 });
    expect(occurrencesBetween(rec, { from: at(2026, 9, 1), to: at(2026, 10, 1) })).toEqual([at(2026, 9, 5)]);
    expect(occurrencesBetween(rec, { from: at(2026, 9, 6), to: at(2026, 10, 5) })).toEqual([]);
    expect(occurrencesBetween(rec, { from: at(2025, 1, 1), to: at(2026, 1, 5) })).toEqual([]);
    expect(occurrencesBetween(rec, { from: at(2026, 3, 1), to: at(2026, 2, 1) })).toEqual([]);
  });
});

describe('nextOccurrenceAfter', () => {
  const rec = makeRecurring({ nextDueAt: at(2026, 9, 25), anchorDay: 25 });

  it('returns nextDueAt when it is still ahead', () => {
    expect(nextOccurrenceAfter(rec, at(2026, 9, 10))).toBe(at(2026, 9, 25));
  });

  it('is strictly after the given time', () => {
    expect(nextOccurrenceAfter(rec, at(2026, 9, 25))).toBe(at(2026, 10, 25));
    expect(nextOccurrenceAfter(rec, at(2026, 9, 25, 10))).toBe(at(2026, 10, 25));
    expect(nextOccurrenceAfter(rec, at(2026, 12, 31))).toBe(at(2027, 1, 25));
  });

  it('clamps and recovers the anchor day', () => {
    const endOfMonth = makeRecurring({ nextDueAt: at(2026, 1, 31), anchorDay: 31 });
    expect(nextOccurrenceAfter(endOfMonth, at(2026, 2, 10))).toBe(at(2026, 2, 28));
    expect(nextOccurrenceAfter(endOfMonth, at(2026, 2, 28))).toBe(at(2026, 3, 31));
  });

  it('works for weekly schedules', () => {
    const weekly = makeRecurring({ frequency: 'weekly', anchorDay: null, nextDueAt: at(2026, 9, 7) });
    expect(nextOccurrenceAfter(weekly, at(2026, 9, 22))).toBe(at(2026, 9, 28));
  });
});

describe('advanceAfterPayment', () => {
  it('moves to the next occurrence and pins a missing anchor day', () => {
    const rec = makeRecurring({ nextDueAt: at(2026, 1, 31), anchorDay: null, updatedAt: 42 });
    const once = advanceAfterPayment(rec);
    expect(once).toEqual({ ...rec, nextDueAt: at(2026, 2, 28), anchorDay: 31 });
    expect(advanceAfterPayment(once)).toMatchObject({ nextDueAt: at(2026, 3, 31), anchorDay: 31 });
  });

  it('does not drift once clamped to a short month', () => {
    const rec = makeRecurring({ nextDueAt: at(2026, 2, 28), anchorDay: 31 });
    const next = advanceAfterPayment(rec);
    expect(next).toMatchObject({ nextDueAt: at(2026, 3, 31), anchorDay: 31 });
    expect(advanceAfterPayment(next).nextDueAt).toBe(at(2026, 4, 30));
  });

  it('respects interval and frequency', () => {
    expect(advanceAfterPayment(makeRecurring({ nextDueAt: at(2026, 9, 10), anchorDay: 10, interval: 3 })).nextDueAt).toBe(
      at(2026, 12, 10),
    );
    expect(
      advanceAfterPayment(makeRecurring({ frequency: 'yearly', nextDueAt: at(2028, 2, 29), anchorDay: 29 })),
    ).toMatchObject({ nextDueAt: at(2029, 2, 28), anchorDay: 29 });
    expect(
      advanceAfterPayment(makeRecurring({ frequency: 'quarterly', nextDueAt: at(2026, 11, 30), anchorDay: 31 })).nextDueAt,
    ).toBe(at(2027, 2, 28));
  });

  it('leaves weekly anchorDay untouched', () => {
    const weekly = makeRecurring({ frequency: 'weekly', anchorDay: null, interval: 2, nextDueAt: at(2026, 9, 7) });
    expect(advanceAfterPayment(weekly)).toMatchObject({ nextDueAt: at(2026, 9, 21), anchorDay: null });
  });

  it('does not mutate the input', () => {
    const rec = makeRecurring({ nextDueAt: at(2026, 9, 10), anchorDay: null });
    const copy = { ...rec };
    advanceAfterPayment(rec);
    expect(rec).toEqual(copy);
  });
});

describe('upcoming', () => {
  const range = { from: at(2026, 9, 21), to: at(2026, 10, 1) };

  it('lists active items sorted by date then name, with overdue items once at their due date', () => {
    const water = makeRecurring({ name: 'Water', nextDueAt: at(2026, 9, 25), anchorDay: 25 });
    const internet = makeRecurring({ name: 'Internet', nextDueAt: at(2026, 9, 25), anchorDay: 25 });
    // Weekly, unpaid since 7 Sep: overdue once (not for 14 Sep too), then the in-range dates.
    const gym = makeRecurring({ name: 'Gym', frequency: 'weekly', anchorDay: null, nextDueAt: at(2026, 9, 7) });
    const inactive = makeRecurring({ name: 'Inactive', isActive: false, nextDueAt: at(2026, 9, 22), anchorDay: 22 });
    const deleted = makeRecurring({ name: 'Deleted', deletedAt: 1, nextDueAt: at(2026, 9, 22), anchorDay: 22 });
    const later = makeRecurring({ name: 'Later', nextDueAt: at(2026, 10, 1), anchorDay: 1 });

    const result = upcoming([water, inactive, gym, later, deleted, internet], range);
    expect(result.map((o) => [o.recurring.name, o.dueAt, o.isOverdue])).toEqual([
      ['Gym', at(2026, 9, 7), true],
      ['Gym', at(2026, 9, 21), false],
      ['Internet', at(2026, 9, 25), false],
      ['Water', at(2026, 9, 25), false],
      ['Gym', at(2026, 9, 28), false],
    ]);
    expect(result[0]?.recurring).toBe(gym);
  });

  it('marks an overdue monthly item once and skips its next date outside the range', () => {
    const rent = makeRecurring({ name: 'Rent', nextDueAt: at(2026, 9, 5), anchorDay: 5 });
    expect(upcoming([rent], range)).toEqual([{ recurring: rent, dueAt: at(2026, 9, 5), isOverdue: true }]);
  });

  it('breaks name ties by id', () => {
    const b = makeRecurring({ id: 'rec-b', name: 'Same', nextDueAt: at(2026, 9, 25), anchorDay: 25 });
    const a = makeRecurring({ id: 'rec-a', name: 'Same', nextDueAt: at(2026, 9, 25), anchorDay: 25 });
    expect(upcoming([b, a], range).map((o) => o.recurring.id)).toEqual(['rec-a', 'rec-b']);
  });

  it('returns [] when nothing is due', () => {
    expect(upcoming([], range)).toEqual([]);
    expect(upcoming([makeRecurring({ nextDueAt: at(2026, 11, 1), anchorDay: 1 })], range)).toEqual([]);
  });
});
