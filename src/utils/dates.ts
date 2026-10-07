/**
 * Calendar helpers in the device's local time zone. All timestamps are epoch ms.
 * Ranges are half-open: [from, to).
 */

export interface DateRange {
  from: number;
  to: number;
}

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function addDays(ts: number, days: number): number {
  const d = new Date(ts);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

export function startOfMonth(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

export function startOfNextMonth(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
}

export function daysInMonth(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

/** Days left in the month including the day of `ts`. */
export function daysRemainingInMonth(ts: number): number {
  return daysInMonth(ts) - new Date(ts).getDate() + 1;
}

/** Same day-of-month `months` later, clamped (Jan 31 + 1 month → Feb 28/29). Keeps time of day. */
export function addMonths(ts: number, months: number): number {
  const d = new Date(ts);
  const targetMonthStart = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const lastDay = new Date(targetMonthStart.getFullYear(), targetMonthStart.getMonth() + 1, 0).getDate();
  return new Date(
    targetMonthStart.getFullYear(),
    targetMonthStart.getMonth(),
    Math.min(d.getDate(), lastDay),
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
    d.getMilliseconds(),
  ).getTime();
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "YYYY-MM" */
export function monthKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** "YYYY-MM-DD" */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Start of the month for a "YYYY-MM" key. Throws on malformed input. */
export function parseMonthKey(key: string): number {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  const month = m ? Number(m[2]) : 0;
  if (!m || month < 1 || month > 12) throw new Error(`Invalid month key: ${key}`);
  return new Date(Number(m[1]), month - 1, 1).getTime();
}

export function dayRange(ts: number): DateRange {
  const from = startOfDay(ts);
  return { from, to: addDays(from, 1) };
}

export function monthRange(ts: number): DateRange {
  return { from: startOfMonth(ts), to: startOfNextMonth(ts) };
}

/** Week containing `ts`. Monday-start by default (weekStartsOn: 0 = Sunday … 6 = Saturday). */
export function weekRange(ts: number, weekStartsOn = 1): DateRange {
  const day = startOfDay(ts);
  const offset = (new Date(day).getDay() - weekStartsOn + 7) % 7;
  const from = addDays(day, -offset);
  return { from, to: addDays(from, 7) };
}

export function isInRange(ts: number, range: DateRange): boolean {
  return ts >= range.from && ts < range.to;
}
