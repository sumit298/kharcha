import { defaultParentOf } from '@/domain/categories/defaults';
import { canonicalMerchantName, cleanMerchantText, findKnownMerchant, merchantKey } from '@/domain/merchants/canonical';
import type {
  CategorySource,
  MerchantRule,
  ParsedKind,
  ParsedTransaction,
  PaymentMethod,
  ReviewReason,
  TransactionType,
} from '@/types';

export interface Categorization {
  merchantName: string | null;
  categoryId: string | null;
  subcategoryId: string | null;
  categorySource: CategorySource;
  type: TransactionType;
  /** Rule that decided the category, if any. */
  ruleId: string | null;
  accountId: string | null;
  paymentMethod: PaymentMethod;
  reviewReasons: ReviewReason[];
}

/** ParsedKind → TransactionType (see the table on ParsedKind). */
export function typeForKind(kind: ParsedKind, direction: ParsedTransaction['direction']): TransactionType {
  switch (kind) {
    case 'payment':
      return 'expense';
    case 'receipt':
      return 'income';
    case 'refund':
    case 'reversal':
      return 'refund';
    case 'transfer':
    case 'bill_payment':
    case 'wallet_topup':
    case 'atm_withdrawal':
      return 'transfer';
    case 'unknown':
      return direction === 'debit' ? 'expense' : 'income';
  }
}

/** Where transfers go in the category tree. */
const TRANSFER_CATEGORY: Partial<Record<ParsedKind, string>> = {
  bill_payment: 'finance.credit_card_payment',
  wallet_topup: 'transfers.own_account',
  atm_withdrawal: 'transfers.own_account',
  transfer: 'transfers.own_account',
};

/** Level 4: keyword heuristics over merchant text / UPI ID. */
const GENERIC_KEYWORDS: [RegExp, string][] = [
  [/\b(?:petrol|fuel|filling station|petroleum)\b/, 'transport.fuel'],
  [/\b(?:pharmacy|pharma|chemist|medical store|medicals)\b/, 'health.pharmacy'],
  [/\b(?:hospital|clinic|dental|doctor|diagnostic|labs?|pathology)\b/, 'health.doctor'],
  [/\b(?:cafe|coffee|tea|chai)\b/, 'food.cafes'],
  [/\b(?:restaurant|dhaba|biryani|kitchen|bhojanalaya|hotel)\b/, 'food.restaurants'],
  [/\b(?:bakery|sweets|snacks|juice|chaat)\b/, 'food.snacks'],
  [/\b(?:kirana|grocery|groceries|supermarket|provision|general store|mart)\b/, 'food.groceries'],
  [/\b(?:fruits?|vegetables?|sabzi)\b/, 'food.fruits_vegetables'],
  [/\b(?:dairy|milk)\b/, 'food.dairy'],
  [/\b(?:parking)\b/, 'transport.parking'],
  [/\b(?:toll|fastag)\b/, 'transport.toll'],
  [/\b(?:electricity|power)\b/, 'housing.electricity'],
  [/\b(?:broadband|fiber|fibernet|internet)\b/, 'housing.internet'],
  [/\b(?:recharge|prepaid|postpaid)\b/, 'bills.mobile'],
  [/\b(?:rent)\b/, 'housing.rent'],
  [/\b(?:insurance)\b/, 'finance.insurance'],
  [/\b(?:emi|loan)\b/, 'finance.emi'],
  [/\b(?:salon|spa|parlour|barber)\b/, 'shopping.personal_care'],
  [/\b(?:salary|payroll)\b/, 'income.salary'],
  [/\b(?:interest)\b/, 'income.interest'],
];

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Does `rule` match this transaction? Patterns are lower-cased (ARCHITECTURE §6). */
export function ruleMatches(rule: MerchantRule, tx: Pick<ParsedTransaction, 'merchantRaw' | 'payeeVpa' | 'sourceApp'>, text = ''): boolean {
  if (!rule.enabled || rule.deletedAt !== null) return false;
  const candidates: string[] = [];
  if (rule.matchField === 'merchant' && tx.merchantRaw) {
    candidates.push(merchantKey(tx.merchantRaw), cleanMerchantText(tx.merchantRaw));
  } else if (rule.matchField === 'vpa' && tx.payeeVpa) {
    candidates.push(tx.payeeVpa.toLowerCase());
  } else if (rule.matchField === 'source_app') {
    candidates.push(tx.sourceApp.toLowerCase());
  } else if (rule.matchField === 'text' && text) {
    candidates.push(text.toLowerCase());
  }
  const pattern = rule.pattern;
  return candidates.some((value) => {
    switch (rule.matchType) {
      case 'exact':
        return value === pattern;
      case 'prefix':
        return value.startsWith(pattern);
      case 'contains':
        return new RegExp(`(?:^|\\b)${escapeRegex(pattern)}(?:\\b|$)`).test(value);
      case 'regex':
        try {
          return new RegExp(pattern, 'i').test(value);
        } catch {
          return false;
        }
    }
  });
}

/** User rules before learned ones (the user's explicit choice wins), then more specific fields. */
const FIELD_RANK: Record<MerchantRule['matchField'], number> = { vpa: 0, merchant: 1, source_app: 2, text: 3 };
function ruleOrder(a: MerchantRule, b: MerchantRule): number {
  const origin = (r: MerchantRule) => (r.origin === 'user' ? 0 : r.origin === 'learned' ? 1 : 2);
  return origin(a) - origin(b) || FIELD_RANK[a.matchField] - FIELD_RANK[b.matchField] || b.updatedAt - a.updatedAt;
}

/** A UPI ID that looks like a person's (phone-number handle) rather than a business. */
function looksPersonal(vpa: string | null): boolean {
  if (!vpa) return false;
  const local = vpa.split('@')[0] ?? '';
  return /^\d{10}$/.test(local) || /^\+?91\d{10}$/.test(local);
}

const LOW_CONFIDENCE = 0.6;

/**
 * ARCHITECTURE §6: user/learned rule → built-in merchant → parser hint → keywords → none.
 * Also decides the transaction type and the reasons it needs review.
 */
export function categorize(
  parsed: ParsedTransaction,
  rules: readonly MerchantRule[],
  text = '',
): Categorization {
  const baseType = typeForKind(parsed.kind, parsed.direction);
  const known = findKnownMerchant(parsed.merchantRaw, parsed.payeeVpa);
  const merchantName = canonicalMerchantName(parsed.merchantRaw, parsed.payeeVpa);
  const result: Categorization = {
    merchantName,
    categoryId: null,
    subcategoryId: null,
    categorySource: 'none',
    type: baseType,
    ruleId: null,
    accountId: null,
    paymentMethod: parsed.paymentMethod,
    reviewReasons: [],
  };
  const setCategory = (subOrTop: string, source: CategorySource) => {
    const parent = defaultParentOf(subOrTop);
    result.categoryId = parent ?? subOrTop;
    result.subcategoryId = parent ? subOrTop : null;
    result.categorySource = source;
  };

  const rule = [...rules].filter((r) => r.origin !== 'builtin').sort(ruleOrder).find((r) => ruleMatches(r, parsed, text));
  if (rule) {
    result.ruleId = rule.id;
    result.categoryId = rule.categoryId;
    result.subcategoryId = rule.subcategoryId;
    result.categorySource = 'user_rule';
    if (rule.merchantName) result.merchantName = rule.merchantName;
    if (rule.transactionType) result.type = rule.transactionType;
    if (rule.accountId) result.accountId = rule.accountId;
    if (rule.defaultPaymentMethod && parsed.paymentMethod === 'unknown') result.paymentMethod = rule.defaultPaymentMethod;
  } else if (TRANSFER_CATEGORY[parsed.kind]) {
    setCategory(TRANSFER_CATEGORY[parsed.kind] as string, 'generic');
  } else if (known) {
    result.categoryId = known.categoryId;
    result.subcategoryId = known.subcategoryId;
    result.categorySource = 'merchant_rule';
    if (known.type && baseType === 'expense') result.type = known.type;
  } else if (parsed.categoryHint) {
    result.categoryId = parsed.categoryHint.categoryId;
    result.subcategoryId = parsed.categoryHint.subcategoryId;
    result.categorySource = 'parser_hint';
  } else {
    const haystack = [parsed.merchantRaw && cleanMerchantText(parsed.merchantRaw), parsed.payeeVpa, text.toLowerCase()]
      .filter(Boolean)
      .join(' ');
    const isIncome = baseType === 'income';
    const keyword = GENERIC_KEYWORDS.find(
      ([pattern, id]) => id.startsWith('income.') === isIncome && pattern.test(haystack),
    );
    if (keyword) setCategory(keyword[1], 'generic');
    else if (isIncome) setCategory('income.other', 'generic');
  }

  if (result.type === 'expense' && result.categoryId === null) result.reviewReasons.push('uncategorized');
  if (result.type === 'expense' && !parsed.merchantRaw && !parsed.payeeVpa) result.reviewReasons.push('unknown_merchant');
  if (result.type === 'expense' && !rule && !known && looksPersonal(parsed.payeeVpa)) {
    result.reviewReasons.push('possible_transfer');
  }
  if (parsed.confidence < LOW_CONFIDENCE) result.reviewReasons.push('low_confidence');
  return result;
}
