import { DEFAULT_CURRENCY, type CurrencyCode, type MinorUnits } from '@/types';

const SYMBOLS: Record<string, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£', AED: 'AED ', SGD: 'S$' };

export function currencySymbol(currency: CurrencyCode): string {
  return SYMBOLS[currency] ?? `${currency} `;
}

/** Indian digit grouping: 1234567 → "12,34,567". */
export function groupIndian(integer: number): string {
  const s = String(Math.trunc(Math.abs(integer)));
  if (s.length <= 3) return s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${last3}`;
}

/** Western grouping: 1234567 → "1,234,567". */
function groupWestern(integer: number): string {
  return String(Math.trunc(Math.abs(integer))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export interface FormatMoneyOptions {
  /** 'auto' shows paise only when non-zero. */
  paise?: 'auto' | 'always' | 'never';
  /** Prefix "+" for positive values (e.g. income). */
  signed?: boolean;
}

/** 12345650 → "₹1,23,456.50". Accepts negative values for display of net amounts. */
export function formatMoney(
  amountMinor: MinorUnits,
  currency: CurrencyCode = DEFAULT_CURRENCY,
  { paise = 'auto', signed = false }: FormatMoneyOptions = {},
): string {
  const negative = amountMinor < 0;
  const abs = Math.abs(Math.round(amountMinor));
  const major = Math.floor(abs / 100);
  const minor = abs % 100;
  let rounded = major;
  let fraction = '';
  if (paise === 'always' || (paise === 'auto' && minor !== 0)) {
    fraction = `.${String(minor).padStart(2, '0')}`;
  } else if (paise === 'never' && minor >= 50) {
    rounded = major + 1;
  }
  const grouped = currency === 'INR' ? groupIndian(rounded) : groupWestern(rounded);
  const sign = negative ? '-' : signed && abs > 0 ? '+' : '';
  return `${sign}${currencySymbol(currency)}${grouped}${fraction}`;
}

/** Short form for charts: ₹950, ₹12.5K, ₹1.2L, ₹3.4Cr (INR) or K/M/B otherwise. */
export function formatMoneyCompact(amountMinor: MinorUnits, currency: CurrencyCode = DEFAULT_CURRENCY): string {
  const sign = amountMinor < 0 ? '-' : '';
  const major = Math.abs(amountMinor) / 100;
  const units: [number, string][] =
    currency === 'INR'
      ? [[1e7, 'Cr'], [1e5, 'L'], [1e3, 'K']]
      : [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  for (const [size, suffix] of units) {
    if (major >= size) {
      const value = major / size;
      const text = value >= 100 ? value.toFixed(0) : value.toFixed(1).replace(/\.0$/, '');
      return `${sign}${currencySymbol(currency)}${text}${suffix}`;
    }
  }
  return `${sign}${currencySymbol(currency)}${Math.round(major)}`;
}

/**
 * Parse a user-typed amount ("1,23,456.5", "₹ 500", "99.") into minor units.
 * String-based (no float maths). Returns null for invalid, zero, or > 2 decimal places.
 */
export function parseAmountInput(input: string): MinorUnits | null {
  const cleaned = input.replace(/[₹\s,]/g, '').replace(/^(rs\.?|inr)/i, '');
  const m = /^(\d+)(?:\.(\d{0,2}))?$/.exec(cleaned);
  if (!m) return null;
  const major = Number(m[1]);
  const minor = Number((m[2] ?? '').padEnd(2, '0'));
  const total = major * 100 + minor;
  if (!Number.isSafeInteger(total) || total <= 0) return null;
  return total;
}
