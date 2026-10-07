import type { RecurrenceFrequency, RecurringTransaction } from '@/types';
import { addDays, startOfDay, type DateRange } from '@/utils/dates';

type Schedule = Pick<RecurringTransaction, 'frequency' | 'interval' | 'nextDueAt' | 'anchorDay'>;

const MONTHS_PER_PERIOD: Record<Exclude<RecurrenceFrequency, 'weekly'>, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

export interface UpcomingOccurrence {
  recurring: RecurringTransaction;
  /** Local start of the due day. */
  dueAt: number;
  /** Due before the queried range and not yet paid. */
  isOverdue: boolean;
}

function periodsPerStep(rec: Schedule): number {
  return Number.isInteger(rec.interval) && rec.interval > 0 ? rec.interval : 1;
}

/** anchorDay when valid, else the day of month of nextDueAt. */
function effectiveAnchorDay(rec: Schedule): number {
  const { anchorDay } = rec;
  if (anchorDay !== null && Number.isInteger(anchorDay) && anchorDay >= 1 && anchorDay <= 31) return anchorDay;
  return new Date(rec.nextDueAt).getDate();
}

/** Local midnight of `day` in the given month, clamped to the month's length. monthIndex may overflow. */
function clampedDate(year: number, monthIndex: number, day: number): number {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return new Date(year, monthIndex, Math.min(day, lastDay)).getTime();
}

/** The k-th due date, counting nextDueAt as k = 0. Strictly increasing in k. */
function occurrenceAt(rec: Schedule, k: number): number {
  const first = startOfDay(rec.nextDueAt);
  if (k === 0) return first;
  if (rec.frequency === 'weekly') return addDays(first, 7 * periodsPerStep(rec) * k);
  const d = new Date(first);
  const months = MONTHS_PER_PERIOD[rec.frequency] * periodsPerStep(rec) * k;
  return clampedDate(d.getFullYear(), d.getMonth() + months, effectiveAnchorDay(rec));
}

/**
 * Due dates (local start of day) from nextDueAt onward that fall in `range`. Monthly-based
 * schedules land on anchorDay, clamped to short months without drifting (31 → Feb 28 → Mar 31).
 * Ignores isActive; callers filter.
 */
export function occurrencesBetween(rec: Schedule, range: DateRange): number[] {
  const dates: number[] = [];
  for (let k = 0, due = occurrenceAt(rec, 0); due < range.to; due = occurrenceAt(rec, ++k)) {
    if (due >= range.from) dates.push(due);
  }
  return dates;
}

/** First due date strictly after `ts`, counting from nextDueAt. */
export function nextOccurrenceAfter(rec: Schedule, ts: number): number {
  let k = 0;
  let due = occurrenceAt(rec, 0);
  while (due <= ts) due = occurrenceAt(rec, ++k);
  return due;
}

/**
 * Moves nextDueAt to the occurrence after the current one. For monthly-based schedules a
 * missing anchorDay is pinned to the current due day so later clamping cannot drift.
 * updatedAt is left to the caller.
 */
export function advanceAfterPayment(rec: RecurringTransaction): RecurringTransaction {
  return {
    ...rec,
    nextDueAt: occurrenceAt(rec, 1),
    anchorDay: rec.frequency === 'weekly' ? rec.anchorDay : effectiveAnchorDay(rec),
  };
}

/**
 * Due dates of active, non-deleted items in `range`, sorted by date then name. An item whose
 * nextDueAt is before range.from is still unpaid and is included once, as overdue, at that date.
 */
export function upcoming(recs: readonly RecurringTransaction[], range: DateRange): UpcomingOccurrence[] {
  const items: UpcomingOccurrence[] = [];
  for (const rec of recs) {
    if (!rec.isActive || rec.deletedAt !== null) continue;
    const firstDue = startOfDay(rec.nextDueAt);
    if (firstDue < range.from) items.push({ recurring: rec, dueAt: firstDue, isOverdue: true });
    for (const dueAt of occurrencesBetween(rec, range)) items.push({ recurring: rec, dueAt, isOverdue: false });
  }
  return items.sort(
    (a, b) =>
      a.dueAt - b.dueAt ||
      a.recurring.name.localeCompare(b.recurring.name) ||
      a.recurring.id.localeCompare(b.recurring.id),
  );
}
