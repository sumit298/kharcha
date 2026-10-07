/** ISO 4217 code. INR is the default; others are kept as seen in the notification. */
export type CurrencyCode = 'INR' | (string & {});

export const DEFAULT_CURRENCY: CurrencyCode = 'INR';

/**
 * Integer amount in the currency's minor unit (paise for INR).
 * Always a non-negative safe integer — direction/type carries the sign.
 */
export type MinorUnits = number;
