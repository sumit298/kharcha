/**
 * Deterministic field extractors shared by every parser (and by detection). Pure functions over
 * notification text. Money is returned in minor units; only the last digits of accounts/cards
 * are ever returned.
 */
import type {
  AccountHint,
  AccountHintKind,
  CurrencyCode,
  Direction,
  NotificationEvent,
  ParsedKind,
  ParsedStatus,
  PaymentMethod,
} from '@/types';

// ─── Text ─────────────────────────────────────────────────────────────────────

/**
 * Text the parsers read. SMS: the message body (the title is only the sender). Other apps:
 * title + body, because many apps put the amount in the title.
 */
export function parseTextOf(event: Pick<NotificationEvent, 'sourceKind' | 'title' | 'body'>): string {
  if (event.sourceKind === 'sms_app') return event.body;
  return [event.title, event.body].filter((part) => part.length > 0).join('\n');
}

// ─── Amounts ──────────────────────────────────────────────────────────────────

export type AmountRole = 'transaction' | 'balance' | 'limit' | 'due';

export interface AmountMatch {
  amountMinor: number;
  currency: CurrencyCode;
  /** Start of the match in the text. */
  index: number;
  role: AmountRole;
}

const NUMBER = String.raw`(\d[\d,]*(?:\.\d{1,2})?)(?![\d])`;
const CURRENCY_CODES: Record<string, CurrencyCode> = {
  '₹': 'INR',
  rs: 'INR',
  'rs.': 'INR',
  inr: 'INR',
  rupees: 'INR',
  usd: 'USD',
  $: 'USD',
  eur: 'EUR',
  '€': 'EUR',
  gbp: 'GBP',
  '£': 'GBP',
  aed: 'AED',
};
const PREFIXED = new RegExp(String.raw`(?<![a-z])(₹|rs\.?|inr|usd|eur|gbp|aed|\$|€|£)\s*` + NUMBER, 'gi');
const SUFFIXED = new RegExp(String.raw`(?<![\d.,])` + NUMBER + String.raw`\s*(inr|rs\.?|rupees)(?![a-z])`, 'gi');
/** SBI-style "debited by 124.0" with no currency marker. */
const BARE_AFTER_VERB = new RegExp(
  String.raw`\b(?:debited|credited|deducted|withdrawn)\s+(?:by|for|with|of)\s+` + NUMBER + String.raw`(?!\s*%)`,
  'gi',
);

/** "1,23,456.5" → 12345650. null for zero, malformed or unsafe values. */
export function parseAmountToken(raw: string): number | null {
  const cleaned = raw.replace(/,/g, '').replace(/\.$/, '');
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!m) return null;
  const minor = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}

function roleOf(text: string, index: number): AmountRole {
  const before = text.slice(Math.max(0, index - 30), index).toLowerCase();
  // Tight keyword-before-amount checks first, so "Bal Rs.1,000. Avl Limit: INR 9,000" reads as a limit.
  if (/\b(?:lmt|limit)\b[^\d\n]{0,14}$/.test(before)) return 'limit';
  if (/\b(?:due|outstanding|min(?:imum)?(?: amt| amount)?)\b[^\d\n]{0,14}$/.test(before)) return 'due';
  if (/\b(?:bal|balance)\b(?![^\n]*\b(?:debited|credited|spent|paid|sent|received)\b)[^\n]{0,24}$/.test(before)) {
    return 'balance';
  }
  return 'transaction';
}

/** Every money amount in the text, in order of appearance, with its role. */
export function findAmounts(text: string): AmountMatch[] {
  const found: AmountMatch[] = [];
  const taken: [number, number][] = [];
  const overlaps = (from: number, to: number) => taken.some(([a, b]) => from < b && to > a);
  const add = (index: number, length: number, rawNumber: string, currencyToken: string) => {
    const amountMinor = parseAmountToken(rawNumber);
    if (amountMinor === null || overlaps(index, index + length)) return;
    taken.push([index, index + length]);
    found.push({
      amountMinor,
      currency: CURRENCY_CODES[currencyToken.toLowerCase()] ?? 'INR',
      index,
      role: roleOf(text, index),
    });
  };
  for (const m of text.matchAll(PREFIXED)) add(m.index, m[0].length, m[2] ?? '', m[1] ?? '');
  for (const m of text.matchAll(SUFFIXED)) add(m.index, m[0].length, m[1] ?? '', m[2] ?? '');
  for (const m of text.matchAll(BARE_AFTER_VERB)) {
    const number = m[1] ?? '';
    add(m.index + m[0].length - number.length, number.length, number, 'inr');
  }
  return found.sort((a, b) => a.index - b.index);
}

/** The amount the transaction is about: the first amount that isn't a balance, limit or due. */
export function transactionAmount(amounts: readonly AmountMatch[]): AmountMatch | null {
  return amounts.find((a) => a.role === 'transaction') ?? null;
}

export function balanceAmount(amounts: readonly AmountMatch[]): number | null {
  return amounts.find((a) => a.role === 'balance')?.amountMinor ?? null;
}

// ─── Direction ────────────────────────────────────────────────────────────────

export interface DirectionMatch {
  direction: Direction;
  /** strong = an explicit verb ("debited", "received"); weak = implied ("payment successful"). */
  strength: 'strong' | 'weak';
  index: number;
}

const STRONG_DIRECTION: [RegExp, Direction][] = [
  // Credits phrased with a debit-looking verb, and vice versa, come first.
  [/\b(?:paid|sent|transferred) you\b/gi, 'credit'],
  [/\b(?:has )?received your (?:payment|money)\b/gi, 'debit'],
  [/\breceived by\b/gi, 'debit'],
  [/\btransferred\b(?=[^.\n]{0,30}\bto your\b)/gi, 'credit'],
  [/\b(?:debited|spent|withdrawn|deducted|charged|debit alert|debit of|trf to)\b/gi, 'debit'],
  [/\bpaid\b(?! you\b)/gi, 'debit'],
  [/\bsent\b(?! you\b)/gi, 'debit'],
  [/\btransferred\b(?![^.\n]{0,30}\bto your\b)/gi, 'debit'],
  [/\bpurchase\b/gi, 'debit'],
  [/\b(?:added|loaded) (?:to|into) (?:your )?(?:[a-z]+ )?(?:wallet|upi lite)\b/gi, 'debit'],
  [/\b(?:credited|deposited|credit alert|credit of|cashback|refunded|refund|reversed|reversal)\b/gi, 'credit'],
  [/\breceived\b(?! your (?:payment|money)\b)(?! by\b)/gi, 'credit'],
  [/(?:₹|rs\.?|inr)\s*[\d,]+(?:\.\d{1,2})?\s*dr\b/gi, 'debit'],
  [/(?:₹|rs\.?|inr)\s*[\d,]+(?:\.\d{1,2})?\s*cr\b/gi, 'credit'],
];

const WEAK_DIRECTION: [RegExp, Direction][] = [
  [/\bpayment (?:was |is |has been )?(?:successful|success|done|complete(?:d)?)\b/gi, 'debit'],
  [/\b(?:payment|txn|transaction) (?:of )?(?:₹|rs\.?|inr)/gi, 'debit'],
  [/\bsuccessfully paid\b/gi, 'debit'],
];

/** Verbs in the future or conditional ("will be debited", "get ₹500 credited") are not events. */
const NOT_YET = /\b(?:will|to|shall|would|may|can|could) be\s*$|\b(?:get|gets|getting|earn|win)\b[^.\n]{0,25}$/i;

function scan(text: string, patterns: [RegExp, Direction][], strength: DirectionMatch['strength']): DirectionMatch[] {
  const matches: DirectionMatch[] = [];
  for (const [pattern, direction] of patterns) {
    for (const m of text.matchAll(pattern)) {
      if (NOT_YET.test(text.slice(Math.max(0, m.index - 30), m.index))) continue;
      matches.push({ direction, strength, index: m.index });
    }
  }
  return matches.sort((a, b) => a.index - b.index);
}

/**
 * Debit or credit from the user's point of view. The earliest explicit verb wins, because it
 * describes the user's account ("A/c XX12 debited …; ZOMATO credited"). Falls back to implied
 * signals such as "payment successful".
 */
export function detectDirection(text: string): DirectionMatch | null {
  return scan(text, STRONG_DIRECTION, 'strong')[0] ?? scan(text, WEAK_DIRECTION, 'weak')[0] ?? null;
}

// ─── Counterparty (merchant / payer) and VPA ──────────────────────────────────

export interface Counterparty {
  /** As written in the notification, e.g. "ZOMATO LTD". */
  merchantRaw: string | null;
  /** Lower-cased UPI ID, e.g. "zomato@hdfcbank". */
  payeeVpa: string | null;
}

const VPA = /^[a-z0-9][a-z0-9._-]{1,255}@[a-z][a-z0-9]{1,63}$/i;
/** A UPI ID inside text; not an e-mail address (no dot-suffixed domain). */
const VPA_IN_TEXT = /(?<![\w.@-])([a-z0-9][a-z0-9._-]{1,255}@[a-z][a-z0-9]{1,63})(?![\w@-]|\.[a-z])/gi;

const STOP_WORDS =
  /\s+(?:on|via|using|ref|refno|ref\.no|upi|txn|transaction|avl|avbl|bal|balance|info|from|for|at|to|thru|through|by|dated|date|not|call|sms|if|towards|is|has|was|successfully|failed|credited|debited|refunded|reversed|received)\b.*$/is;
const NOT_A_NAME =
  /^(?:your|you|u|ur|a\/c|ac|acct|account|the|card|bank|beneficiary|self|vpa|upi|order|txn|transaction|rs\.?|inr|₹|mobile|phone|number|no\.?)\b/i;

/** Cleans a captured merchant/payer phrase; null if it isn't a usable name. */
function cleanName(raw: string): Counterparty | null {
  let name = raw.split('\n')[0] ?? '';
  name = name.replace(STOP_WORDS, '');
  name = name.replace(/\.(?:\s.*)?$/s, (m) => (m === '.' || m.startsWith('. ') ? '' : m));
  name = name.replace(/[\s.,:;!'"-]+$/, '').replace(/^[\s:'"-]+/, '').replace(/\s+/g, ' ');
  if (VPA.test(name)) return { merchantRaw: null, payeeVpa: name.toLowerCase() };
  if (name.length < 2 || name.length > 60) return null;
  if (NOT_A_NAME.test(name)) return null;
  if (/^[\d\s*x#+./-]+$/i.test(name)) return null; // digits, masks, phone numbers
  if (/^(?:₹|rs\.?\s*\d|rs\b|inr|\d)/i.test(name)) return null;
  if (/\b(?:a\/c|acct|card)\b[^a-z]*\d{3,4}$/i.test(name)) return null; // "HDFC Bank A/c XX1234"
  return { merchantRaw: name, payeeVpa: null };
}

function firstValid(text: string, pattern: RegExp, group = 1): Counterparty | null {
  for (const m of text.matchAll(pattern)) {
    const raw = m[group];
    if (raw === undefined) continue;
    const cleaned = cleanName(raw);
    if (cleaned) return cleaned;
  }
  return null;
}

const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*';
const DATE_TOKEN = String.raw`(?:\d{1,4}[-/.]\d{1,2}(?:[-/.]\d{2,4})?|\d{1,2}[-\s]?${MONTH}[-\s,]?\s*\d{2,4})`;

/** UPI/P2M/612345678901/ZOMATO style narration (Axis and others). */
const UPI_NARRATION = /\bUPI\/(?:P2[AM]|DR|CR|MOB)\/(\d{6,})\/([^/\n]+)/i;

const DEBIT_NAME_PATTERNS: RegExp[] = [
  /;\s*([^;\n]+?)\s+credited\b/gi, // "debited for Rs 124 on 27-Sep-26; ZOMATO credited"
  /\bto\s+(?:vpa\s+|a\/c\s+)?([^\n,;()]+)/gi,
  /\bat\s+([^\n,;()]+)/gi,
  new RegExp(String.raw`\bon\s+${DATE_TOKEN}\s+(?:on|at)\s+([^\n,;()]+)`, 'gi'),
  /\btowards\s+([^\n,;()]+)/gi,
  /\bfor\s+([^\n,;()]+)/gi,
];

const CREDIT_NAME_PATTERNS: RegExp[] = [
  /^([^\n]+?)\s+(?:has\s+)?(?:paid|sent)\s+you\b/gim, // "Asha paid you ₹500"
  /\bfrom\s+(?:vpa\s+)?([^\n,;()]+)/gi,
  /\bby\s+(?:vpa\s+)?([^\n,;()]+)/gi,
];

/** First UPI ID in the text (lower-cased), or null. */
export function extractVpa(text: string): string | null {
  for (const m of text.matchAll(VPA_IN_TEXT)) {
    const candidate = m[1];
    if (candidate && VPA.test(candidate)) return candidate.toLowerCase();
  }
  return null;
}

/** Merchant for debits, payer for credits, plus the counterparty's UPI ID when shown. */
export function extractCounterparty(text: string, direction: Direction): Counterparty {
  const narration = UPI_NARRATION.exec(text);
  let party = narration?.[2] ? cleanName(narration[2]) : null;
  if (!party) {
    const patterns = direction === 'debit' ? DEBIT_NAME_PATTERNS : CREDIT_NAME_PATTERNS;
    for (const pattern of patterns) {
      party = firstValid(text, pattern);
      if (party) break;
    }
  }
  return {
    merchantRaw: party?.merchantRaw ?? null,
    payeeVpa: party?.payeeVpa ?? extractVpa(text),
  };
}

// ─── Reference ────────────────────────────────────────────────────────────────

const REFERENCE_PATTERNS: RegExp[] = [
  /\b(?:upi\s*(?:ref(?:erence)?\.?\s*(?:no|id|number)?\.?|txn\s*id|transaction\s*id|id)?|ref(?:erence)?\.?\s*(?:no|num|number|id)?\.?|refno|rrn|utr(?:\s*no\.?)?|txn\s*(?:id|no\.?|ref(?:erence)?)|transaction\s*(?:id|ref(?:erence)?(?:\s*no\.?)?))\s*[:.#-]?\s*(\d{10,22})\b/gi,
  /\b(?:utr(?:\s*no\.?)?|txn\s*id|transaction\s*id|order\s*id)\s*[:.#-]?\s*((?=[a-z]*\d)[a-z0-9]{12,30})\b/gi,
];

/** UPI RRN / UTR / transaction ID (upper-cased), or null. Phone numbers aren't matched. */
export function extractReference(text: string): string | null {
  const narration = UPI_NARRATION.exec(text);
  if (narration?.[1]) return narration[1];
  for (const pattern of REFERENCE_PATTERNS) {
    for (const m of text.matchAll(pattern)) {
      if (m[1]) return m[1].toUpperCase();
    }
  }
  return null;
}

// ─── Account / card ───────────────────────────────────────────────────────────

const MASK = String.raw`(?:no\.?|number|ending(?:\s+(?:with|in))?|[:-])?\s*[x*•#.]*\s*`;
const ACCOUNT_PATTERNS: [RegExp, AccountHintKind][] = [
  [new RegExp(String.raw`\bcredit\s*card\s*` + MASK + String.raw`(\d{3,4})\b`, 'i'), 'credit_card'],
  [new RegExp(String.raw`\bdebit\s*card\s*` + MASK + String.raw`(\d{3,4})\b`, 'i'), 'debit_card'],
  [new RegExp(String.raw`\bcard\s*` + MASK + String.raw`(\d{3,4})\b`, 'i'), 'card'],
  [new RegExp(String.raw`(?:\ba\/c|\bac|\bacct|\baccount)\s*` + MASK + String.raw`(\d{3,4})\b`, 'i'), 'bank'],
  [/\bbank\s*[-–:]?\s*[x*•]*\s*(\d{4})\b/i, 'bank'], // "HDFC Bank ••1234", "HDFC Bank - 1234"
];

const INSTITUTIONS: [RegExp, string][] = [
  [/\bhdfc\b/i, 'HDFC Bank'],
  [/\bsbi card\b/i, 'SBI Card'],
  [/\b(?:sbi|state bank)\b/i, 'SBI'],
  [/\bicici\b/i, 'ICICI Bank'],
  [/\baxis\b/i, 'Axis Bank'],
  [/\bkotak\b/i, 'Kotak Mahindra Bank'],
  [/\bidfc\b/i, 'IDFC FIRST Bank'],
  [/\byes bank\b/i, 'YES Bank'],
  [/\b(?:pnb|punjab national)\b/i, 'Punjab National Bank'],
  [/\b(?:bob|bank of baroda)\b/i, 'Bank of Baroda'],
  [/\bcanara\b/i, 'Canara Bank'],
  [/\bunion bank\b/i, 'Union Bank of India'],
  [/\bindusind\b/i, 'IndusInd Bank'],
  [/\bfederal bank\b/i, 'Federal Bank'],
];

export function detectInstitution(text: string): string | null {
  return INSTITUTIONS.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

/** Account/card the money moved on. Only the last 3–4 digits are kept. */
export function extractAccountHint(text: string): AccountHint | null {
  const institution = detectInstitution(text);
  for (const [pattern, kind] of ACCOUNT_PATTERNS) {
    const digits = pattern.exec(text)?.[1];
    if (digits) return { last4: digits.slice(-4), kind, institution };
  }
  if (/\bupi\s*lite\b/i.test(text)) return { last4: null, kind: 'upi_lite', institution };
  if (/\bwallet\b/i.test(text)) return { last4: null, kind: 'wallet', institution };
  return institution ? { last4: null, kind: null, institution } : null;
}

// ─── Payment method ───────────────────────────────────────────────────────────

const METHOD_PATTERNS: [RegExp, PaymentMethod][] = [
  [/\bupi\s*lite\b/i, 'upi_lite'],
  [/\bauto[- ]?pay\b|\bauto[- ]?debit\b|\bmandate\b|\bnach\b|\becs\b|\bstanding instruction\b/i, 'autopay'],
  [/\batm\b|\bcash withdrawal\b|\bcash wdl\b/i, 'atm'],
  [/\bcredit\s*card\b/i, 'credit_card'],
  [/\bdebit\s*card\b/i, 'debit_card'],
  [/\bneft\b/i, 'neft'],
  [/\bimps\b/i, 'imps'],
  [/\brtgs\b/i, 'rtgs'],
  [/\bnet\s?banking\b/i, 'netbanking'],
  [/\bupi\b|\bvpa\b|\bp2[am]\b/i, 'upi'],
  [/\bcard\b/i, 'card'],
  [/\bwallet\b/i, 'wallet'],
  [/\bcheque\b|\bchq\b/i, 'cheque'],
];

export function detectPaymentMethod(text: string, fallback: PaymentMethod = 'unknown'): PaymentMethod {
  const found = METHOD_PATTERNS.find(([pattern]) => pattern.test(text))?.[1];
  if (found) return found;
  return extractVpa(text) ? 'upi' : fallback;
}

// ─── Status and kind ──────────────────────────────────────────────────────────

const FAILED =
  /\b(?:failed|declined|unsuccessful|not successful|could not be (?:processed|completed)|rejected|was not completed)\b/i;
const PENDING = /\b(?:pending|processing|in progress|awaiting|under process|being processed)\b/i;

export function detectStatus(text: string, kind: ParsedKind): ParsedStatus {
  if (kind === 'refund' || kind === 'reversal') return 'success';
  if (FAILED.test(text)) return 'failed';
  if (PENDING.test(text)) return 'pending';
  return 'success';
}

const REVERSAL = /\brevers(?:ed|al)\b|\bcredited back\b|\bfailed (?:txn|transaction|payment)\b/i;
const REFUND = /\brefund(?:ed)?\b/i;
const ATM = /\batm\b|\bcash withdrawal\b|\bcash wdl\b|\bwithdrawn at\b/i;
const CARD_BILL =
  /\bcredit card (?:bill|payment|dues)\b|\bcard (?:bill|dues) payment\b|\bpayment (?:received )?(?:of [^\n]{1,25} )?(?:towards|for|against) (?:your )?(?:[a-z]+ )?(?:bank )?credit card\b|\bcc bill\b|\btowards (?:your )?[^.\n]{0,25}?\bcard\b/i;
const WALLET_TOPUP =
  /\b(?:added|loaded) (?:to|into) (?:your )?(?:[a-z]+ )?(?:wallet|upi lite)\b|\bwallet (?:top[- ]?up|load|recharge)\b|\bupi lite (?:top[- ]?up|load)\b/i;
const SELF_TRANSFER =
  /\bself[- ]?transfer\b|\bown account\b|\bto self\b|\bbetween your accounts\b|\btransferred to your (?:own )?(?:a\/c|account)\b/i;

/** What happened, from the direction and wording (see ParsedKind). */
export function detectKind(text: string, direction: Direction): ParsedKind {
  if (CARD_BILL.test(text)) return 'bill_payment';
  if (WALLET_TOPUP.test(text)) return 'wallet_topup';
  if (direction === 'credit') {
    if (REVERSAL.test(text)) return 'reversal';
    if (REFUND.test(text)) return 'refund';
  } else if (ATM.test(text)) {
    return 'atm_withdrawal';
  }
  if (SELF_TRANSFER.test(text)) return 'transfer';
  return direction === 'debit' ? 'payment' : 'receipt';
}

// ─── Date / time ──────────────────────────────────────────────────────────────

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const TIME = String.raw`(?:[,\s]+(?:at\s+)?(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?`;
const ISO_DATE = new RegExp(String.raw`\b(\d{4})-(\d{2})-(\d{2})(?:[:\sT,]+(\d{2}):(\d{2})(?::(\d{2}))?)?`, 'i');
const NUMERIC_DATE = new RegExp(String.raw`\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b` + TIME, 'i');
const NAMED_DATE = new RegExp(String.raw`\b(\d{1,2})[-\s]?(${MONTH})[-\s,]?\s*(\d{4}|\d{2})\b` + TIME, 'i');
const SHORT_DATE = /\bon\s+(\d{1,2})[-/](\d{1,2})\b(?![-/.]\d)/i; // "On 20-09"

const MAX_AGE_MS = 10 * 24 * 60 * 60 * 1000;
const MAX_AHEAD_MS = 60 * 60 * 1000;

function fullYear(y: number): number {
  return y < 100 ? 2000 + y : y;
}

function to24h(hour: number, meridiem: string | undefined): number {
  if (!meridiem) return hour;
  const pm = meridiem.toLowerCase() === 'pm';
  if (hour === 12) return pm ? 12 : 0;
  return pm ? hour + 12 : hour;
}

interface DateParts {
  year: number;
  month: number;
  day: number;
  time: { hour: number; minute: number; second: number } | null;
}

function build(parts: DateParts): number | null {
  const { year, month, day, time } = parts;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day, time?.hour ?? 0, time?.minute ?? 0, time?.second ?? 0);
  if (d.getMonth() !== month - 1 || d.getDate() !== day) return null; // 31 Feb etc.
  if (time && (time.hour > 23 || time.minute > 59 || time.second > 59)) return null;
  return d.getTime();
}

function timeOf(h?: string, m?: string, s?: string, meridiem?: string): DateParts['time'] {
  if (h === undefined || m === undefined) return null;
  return { hour: to24h(Number(h), meridiem), minute: Number(m), second: Number(s ?? 0) };
}

function findDateParts(text: string, postedAt: number): DateParts | null {
  let m = ISO_DATE.exec(text);
  if (m) {
    return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]), time: timeOf(m[4], m[5], m[6]) };
  }
  m = NAMED_DATE.exec(text);
  if (m) {
    const month = MONTHS.indexOf((m[2] ?? '').slice(0, 3).toLowerCase()) + 1;
    return { year: fullYear(Number(m[3])), month, day: Number(m[1]), time: timeOf(m[4], m[5], m[6], m[7]) };
  }
  m = NUMERIC_DATE.exec(text);
  if (m) {
    return {
      year: fullYear(Number(m[3])),
      month: Number(m[2]),
      day: Number(m[1]),
      time: timeOf(m[4], m[5], m[6], m[7]),
    };
  }
  m = SHORT_DATE.exec(text);
  if (m) {
    return { year: new Date(postedAt).getFullYear(), month: Number(m[2]), day: Number(m[1]), time: null };
  }
  return null;
}

/**
 * When the transaction happened. A date/time in the text wins when it is plausible (up to 10
 * days before the notification, not more than an hour after). A date without a time on the
 * notification's own day → the post time; on an earlier day → noon of that day.
 */
export function extractOccurredAt(text: string, postedAt: number): number {
  const parts = findDateParts(text, postedAt);
  if (!parts) return postedAt;
  const ts = build(parts);
  if (ts === null) return postedAt;
  if (parts.time) {
    return ts >= postedAt - MAX_AGE_MS && ts <= postedAt + MAX_AHEAD_MS ? ts : postedAt;
  }
  const posted = new Date(postedAt);
  const sameDay =
    parts.year === posted.getFullYear() && parts.month === posted.getMonth() + 1 && parts.day === posted.getDate();
  if (sameDay) return postedAt;
  const noon = ts + 12 * 60 * 60 * 1000;
  return noon >= postedAt - MAX_AGE_MS && noon < postedAt ? noon : postedAt;
}
