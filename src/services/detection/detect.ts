import {
  detectDirection,
  extractAccountHint,
  extractReference,
  findAmounts,
  parseTextOf,
  transactionAmount,
} from '@/services/parser/extract';
import { parseSmsSender } from '@/services/notification/sender';
import type { NotificationEvent, SourceKind } from '@/types';

/** Why a notification was judged not to be a transaction. */
export type NonFinancialReason =
  | 'otp'
  | 'no_amount'
  | 'balance_info'
  | 'promotional'
  | 'collect_request'
  | 'mandate_setup'
  | 'payment_reminder'
  | 'statement'
  | 'no_transaction';

export type DetectionResult =
  | { kind: 'financial' }
  /** Android 15+ hid the content; show it in Review. */
  | { kind: 'redacted' }
  /** `sensitive`: don't keep the raw text (OTPs, ARCHITECTURE §10). */
  | { kind: 'not_financial'; reason: NonFinancialReason; sensitive: boolean };

const OTP_PATTERNS: RegExp[] = [
  /\b(?:otp|one[\s-]?time[\s-]?password|verification code|security code|auth(?:entication)? code)\b[^.\n]{0,60}?\b(?:is|:|-)\s*\d{4,8}\b/i,
  /\b\d{4,8}\b\s+is\s+(?:your|the)\s+(?:otp|one[\s-]?time[\s-]?password|verification code)\b/i,
  /\buse\s+(?:otp\s+)?\d{4,8}\s+(?:as|is)\b/i,
  /\b(?:otp|one[\s-]?time[\s-]?password)\s+(?:for|to)\b[^\n]{0,80}\b\d{4,8}\b/i,
];

/** Marketing language. Transaction alerts with account details still pass (see isEvidence). */
const PROMOTIONAL =
  /\bpre-?approved\b|\bapply now\b|\bclick (?:here|now|to)\b|\blimited[- ]period\b|\bhurry\b|\boffer (?:ends|valid)\b|\bt&c\b|\bget (?:up ?to|upto|flat|instant)\b|\bup ?to \d+% off\b|\b\d+% (?:off|cashback)\b|\bavail (?:now|offer|the)\b|\beligible for (?:a |an )?(?:loan|credit|limit)\b|\binstant (?:personal )?loan\b|\bloan (?:of|up ?to)\b|\bcredit limit (?:increase|enhancement)\b|\bwin (?:up ?to|₹|rs)\b|\bexclusive offer\b|\bspecial offer\b/i;

const COLLECT_REQUEST =
  /\bhas requested\b|\brequested (?:money|a payment|payment|₹|rs|inr)\b|\bpayment request\b|\bcollect request\b|\bis requesting\b|\bsent you a (?:payment |money )?request\b|\bwants you to pay\b|\brequest(?:ing)? (?:for )?(?:₹|rs\.?|inr)/i;

const MANDATE_SETUP =
  /\b(?:mandate|auto[- ]?pay|e-?mandate|standing instruction|si)\b[^.\n]{0,50}\b(?:created|registered|set ?up|activated|enabled|approved|modified)\b|\b(?:created|registered|set ?up|activated)\b[^.\n]{0,30}\b(?:mandate|auto[- ]?pay)\b/i;

const REMINDER =
  /\bwill be (?:debited|deducted|charged|auto[- ]?debited|processed|paid)\b|\b(?:is|are) due\b|\bdue (?:on|by|date)\b|\bpre-?debit\b|\bscheduled (?:for|on)\b|\bupcoming (?:payment|debit|bill|mandate)\b|\breminder\b|\bto avoid (?:late fees?|interruption|disconnection|charges?|penalt(?:y|ies))\b|\bpay (?:now|before|by)\b|\bpayable by\b|\brenews? on\b|\bexpires? on\b/i;

const STATEMENT =
  /\bstatement (?:for|of|is|has been)\b|\be-?statement\b|\btotal (?:amount )?due\b|\bmin(?:imum)? (?:amount )?due\b|\bbill (?:is |has been )?generated\b/i;

const ORDER_STATUS =
  /\b(?:order|shipment|delivery)\b[^.\n]{0,60}\b(?:shipped|arriving|delivered|out for delivery|ready|confirmed)\b|\b(?:shipped|arriving|delivered|out for delivery)\b/i;

const FINANCIAL_APPS: ReadonlySet<SourceKind> = new Set(['upi_app', 'bank_app', 'card_app', 'wallet_app']);

const notFinancial = (reason: NonFinancialReason, sensitive = false): DetectionResult => ({
  kind: 'not_financial',
  reason,
  sensitive,
});

/**
 * ARCHITECTURE §3 step 2: is this notification a completed (or failed/pending) money movement?
 * Rejects OTPs, offers, collect requests, mandate set-ups, reminders and pre-debit notices,
 * statements and balance alerts. When unsure about a notification from a payment app, says
 * `financial` so that a parse failure lands in Review instead of being dropped.
 */
export function detectFinancial(event: NotificationEvent): DetectionResult {
  if (event.isRedacted) return { kind: 'redacted' };
  const text = parseTextOf(event);

  if (OTP_PATTERNS.some((pattern) => pattern.test(text))) return notFinancial('otp', true);

  const amounts = findAmounts(text);
  if (amounts.length === 0) return notFinancial('no_amount');
  if (!transactionAmount(amounts)) {
    if (STATEMENT.test(text)) return notFinancial('statement');
    if (REMINDER.test(text)) return notFinancial('payment_reminder');
    return notFinancial('balance_info');
  }

  const direction = detectDirection(text);
  const strongVerb = direction?.strength === 'strong';
  if (!strongVerb && ORDER_STATUS.test(text)) return notFinancial('no_transaction');
  // An explicit verb plus account details or a reference number is a real alert, even if the
  // bank appended an offer to it.
  const isEvidence = strongVerb && (extractReference(text) !== null || extractAccountHint(text)?.last4 != null);

  if (event.sourceKind === 'sms_app' && parseSmsSender(event.title).suffix === 'P') return notFinancial('promotional');
  if (!isEvidence && PROMOTIONAL.test(text)) return notFinancial('promotional');
  if (!isEvidence && COLLECT_REQUEST.test(text)) return notFinancial('collect_request');
  if (MANDATE_SETUP.test(text) && !isEvidence) return notFinancial('mandate_setup');
  if (!strongVerb && STATEMENT.test(text)) return notFinancial('statement');
  if (!strongVerb && REMINDER.test(text)) return notFinancial('payment_reminder');

  if (!direction && !FINANCIAL_APPS.has(event.sourceKind)) return notFinancial('no_transaction');
  return { kind: 'financial' };
}
