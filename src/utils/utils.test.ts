import { DatabaseSync } from 'node:sqlite';

import {
  addDays,
  addMonths,
  dayKey,
  daysInMonth,
  daysRemainingInMonth,
  monthKey,
  monthRange,
  parseMonthKey,
  startOfDay,
  weekRange,
} from './dates';
import { stableHash } from './hash';
import { newId } from './ids';
import { formatMoney, formatMoneyCompact, groupIndian, parseAmountInput } from './money';

const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();

describe('test environment', () => {
  it('runs in Asia/Kolkata with node:sqlite available', () => {
    expect(new Date(0).getTimezoneOffset()).toBe(-330);
    const db = new DatabaseSync(':memory:');
    expect(db.prepare('select 1 as x').get()).toEqual({ x: 1 });
  });
});

describe('dates', () => {
  it('computes local day and month boundaries', () => {
    const ts = at(2026, 9, 27, 23, 59);
    expect(startOfDay(ts)).toBe(at(2026, 9, 27));
    expect(monthRange(ts)).toEqual({ from: at(2026, 9, 1), to: at(2026, 10, 1) });
    expect(dayKey(ts)).toBe('2026-09-27');
    expect(monthKey(ts)).toBe('2026-09');
  });

  it('counts days remaining including today', () => {
    expect(daysInMonth(at(2026, 2, 10))).toBe(28);
    expect(daysInMonth(at(2028, 2, 10))).toBe(29);
    expect(daysRemainingInMonth(at(2026, 9, 21))).toBe(10);
    expect(daysRemainingInMonth(at(2026, 9, 30))).toBe(1);
  });

  it('clamps addMonths to the end of shorter months', () => {
    expect(addMonths(at(2026, 1, 31), 1)).toBe(at(2026, 2, 28));
    expect(addMonths(at(2026, 12, 15), 1)).toBe(at(2027, 1, 15));
    expect(addMonths(at(2026, 3, 31), -1)).toBe(at(2026, 2, 28));
  });

  it('adds calendar days and builds Monday-start weeks', () => {
    expect(addDays(at(2026, 9, 30), 2)).toBe(at(2026, 10, 2));
    // 2026-09-27 is a Sunday → week is Mon 21 … Sun 27
    expect(weekRange(at(2026, 9, 27, 10))).toEqual({ from: at(2026, 9, 21), to: at(2026, 9, 28) });
  });

  it('parses month keys and rejects bad ones', () => {
    expect(parseMonthKey('2026-09')).toBe(at(2026, 9, 1));
    expect(() => parseMonthKey('2026-13')).toThrow();
    expect(() => parseMonthKey('26-09')).toThrow();
  });
});

describe('money', () => {
  it('groups digits the Indian way', () => {
    expect(groupIndian(999)).toBe('999');
    expect(groupIndian(1000)).toBe('1,000');
    expect(groupIndian(123456)).toBe('1,23,456');
    expect(groupIndian(12345678)).toBe('1,23,45,678');
  });

  it('formats minor units', () => {
    expect(formatMoney(12345650)).toBe('₹1,23,456.50');
    expect(formatMoney(12400)).toBe('₹124');
    expect(formatMoney(12400, 'INR', { paise: 'always' })).toBe('₹124.00');
    expect(formatMoney(12450, 'INR', { paise: 'never' })).toBe('₹125');
    expect(formatMoney(-50000)).toBe('-₹500');
    expect(formatMoney(50000, 'INR', { signed: true })).toBe('+₹500');
    expect(formatMoney(123456789, 'USD')).toBe('$1,234,567.89');
  });

  it('formats compact amounts', () => {
    expect(formatMoneyCompact(95000)).toBe('₹950');
    expect(formatMoneyCompact(1250000)).toBe('₹12.5K');
    expect(formatMoneyCompact(12000000)).toBe('₹1.2L');
    expect(formatMoneyCompact(3400000000)).toBe('₹3.4Cr');
  });

  it('parses typed amounts without float errors', () => {
    expect(parseAmountInput('124')).toBe(12400);
    expect(parseAmountInput('1,23,456.5')).toBe(12345650);
    expect(parseAmountInput('₹ 99.99')).toBe(9999);
    expect(parseAmountInput('Rs.1.005')).toBeNull();
    expect(parseAmountInput('0')).toBeNull();
    expect(parseAmountInput('abc')).toBeNull();
    expect(parseAmountInput('')).toBeNull();
  });
});

describe('ids', () => {
  it('produces time-ordered UUIDv7 strings', () => {
    const a = newId(1_790_000_000_000);
    const b = newId(1_790_000_000_001);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a < b).toBe(true);
    expect(newId()).not.toBe(newId());
  });
});

describe('hash', () => {
  it('is stable and sensitive to input', () => {
    expect(stableHash('abc')).toBe(stableHash('abc'));
    expect(stableHash('abc')).not.toBe(stableHash('abd'));
    expect(stableHash('abc')).toHaveLength(22);
  });
});
