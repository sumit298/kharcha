import { findKnownApp } from '@/services/notification/knownApps';
import type { CategoryHint, Direction, NotificationEvent, ParsedKind, ParsedTransaction, PaymentMethod } from '@/types';

import {
  balanceAmount,
  detectDirection,
  detectKind,
  detectPaymentMethod,
  detectStatus,
  extractAccountHint,
  extractCounterparty,
  extractOccurredAt,
  extractReference,
  findAmounts,
  parseTextOf,
  transactionAmount,
} from './extract';
import type { TransactionParser } from './types';

/** Fields a template already knows; they override generic extraction. */
export interface KnownFields {
  amountMinor?: number;
  direction?: Direction;
  kind?: ParsedKind;
  merchantRaw?: string | null;
  payeeVpa?: string | null;
  reference?: string | null;
  last4?: string | null;
  paymentMethod?: PaymentMethod;
}

export interface BuildOptions {
  parserId: string;
  /** Confidence when everything was found with an explicit verb. */
  baseConfidence: number;
  defaultPaymentMethod?: PaymentMethod;
  institution?: string | null;
  categoryHint?: CategoryHint | null;
  known?: KnownFields;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Builds a ParsedTransaction from the event text with the shared extractors. Returns null when
 * no transaction amount or no direction can be found.
 */
export function buildParsed(event: NotificationEvent, options: BuildOptions): ParsedTransaction | null {
  const text = parseTextOf(event);
  const known = options.known ?? {};
  const amounts = findAmounts(text);
  const amount = transactionAmount(amounts);
  const amountMinor = known.amountMinor ?? amount?.amountMinor;
  if (amountMinor === undefined) return null;

  const directionMatch = known.direction ? null : detectDirection(text);
  const direction = known.direction ?? directionMatch?.direction;
  if (!direction) return null;

  const kind = known.kind ?? detectKind(text, direction);
  const party = extractCounterparty(text, direction);
  const app = findKnownApp(event.packageName);
  let merchantRaw = known.merchantRaw !== undefined ? known.merchantRaw : party.merchantRaw;
  if (!merchantRaw && app?.merchant) merchantRaw = app.merchant.name;
  const payeeVpa = known.payeeVpa !== undefined ? known.payeeVpa : party.payeeVpa;

  const hint = extractAccountHint(text);
  const institution = options.institution ?? hint?.institution ?? app?.institution ?? null;
  const last4 = known.last4 !== undefined ? known.last4 : (hint?.last4 ?? null);
  const accountHint = last4 || hint?.kind || institution ? { last4, kind: hint?.kind ?? null, institution } : null;

  const fallbackMethod =
    options.defaultPaymentMethod ??
    (event.sourceKind === 'upi_app' ? 'upi' : event.sourceKind === 'wallet_app' ? 'wallet' : 'unknown');
  const paymentMethod = known.paymentMethod ?? detectPaymentMethod(text, fallbackMethod);

  let confidence = options.baseConfidence;
  if (directionMatch?.strength === 'weak') confidence -= 0.15;
  if (!merchantRaw && !payeeVpa && direction === 'debit') confidence -= 0.1;
  const otherAmounts = amounts.filter((a) => a.role === 'transaction' && a.amountMinor !== amountMinor);
  if (otherAmounts.length > 0) confidence -= 0.1;

  return {
    amountMinor,
    currency: amount?.currency ?? 'INR',
    direction,
    kind,
    status: detectStatus(text, kind),
    merchantRaw,
    payeeVpa,
    reference: known.reference !== undefined ? known.reference : extractReference(text),
    accountHint,
    paymentMethod,
    occurredAt: extractOccurredAt(text, event.postedAt),
    balanceAfterMinor: balanceAmount(amounts),
    sourceApp: event.packageName,
    parserId: options.parserId,
    confidence: round2(Math.min(1, Math.max(0.1, confidence))),
    categoryHint: options.categoryHint ?? app?.merchant?.categoryHint ?? null,
  };
}

const UPI_SIGNAL = /\bupi\b|\bvpa\b|@[a-z]{2,}\b|\bp2[am]\b/i;

/** Priority 100: anything mentioning UPI, or from a UPI app. */
export const genericUpiParser: TransactionParser = {
  id: 'generic.upi',
  priority: 100,
  canParse: (event) => event.sourceKind === 'upi_app' || UPI_SIGNAL.test(parseTextOf(event)),
  parse: (event) => buildParsed(event, { parserId: 'generic.upi', baseConfidence: 0.85, defaultPaymentMethod: 'upi' }),
};

/** Priority 50: last resort for any amount + debit/credit wording. */
export const genericDebitCreditParser: TransactionParser = {
  id: 'generic.debit_credit',
  priority: 50,
  canParse: () => true,
  parse: (event) => buildParsed(event, { parserId: 'generic.debit_credit', baseConfidence: 0.75 }),
};
