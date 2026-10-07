/**
 * Indian commercial SMS senders use DLT headers like "AX-HDFCBK-S": a 2-letter operator/circle
 * prefix, a 6-character header registered to the business, and (since TRAI's 2025 rules) a
 * suffix: S = service, T = transactional, P = promotional, G = government. Older phones and
 * some SMS apps show only "HDFCBK" or "AX-HDFCBK". RCS alerts show a display name instead.
 */
export type SenderSuffix = 'S' | 'T' | 'P' | 'G';

export interface SmsSender {
  /** Registered header, upper-cased, e.g. "HDFCBK"; null for phone numbers and display names. */
  header: string | null;
  suffix: SenderSuffix | null;
}

const DLT = /^(?:[A-Z]{2}-)?([A-Z0-9]{6})(?:-([STPG]))?$/i;

export function parseSmsSender(title: string): SmsSender {
  const m = DLT.exec(title.trim());
  if (!m?.[1] || /^\d+$/.test(m[1])) return { header: null, suffix: null };
  return { header: m[1].toUpperCase(), suffix: (m[2]?.toUpperCase() as SenderSuffix | undefined) ?? null };
}
