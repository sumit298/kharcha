import type { CurrencyCode, MinorUnits } from './money';

export type TransactionType = 'expense' | 'income' | 'transfer' | 'refund';
export type TransactionSource = 'notification' | 'manual' | 'imported';
export type TransactionStatus = 'confirmed' | 'needs_review' | 'ignored';
export type Direction = 'debit' | 'credit';

export type PaymentMethod =
  | 'upi'
  | 'upi_lite'
  | 'debit_card'
  | 'credit_card'
  | 'card'
  | 'netbanking'
  | 'neft'
  | 'imps'
  | 'rtgs'
  | 'wallet'
  | 'cash'
  | 'atm'
  | 'autopay'
  | 'cheque'
  | 'unknown';

export type ReviewReason =
  | 'uncategorized'
  | 'unknown_merchant'
  | 'low_confidence'
  | 'possible_duplicate'
  | 'possible_transfer'
  | 'payment_failed'
  | 'unknown_account';

/** Where the category decision came from (§6 precedence). */
export type CategorySource =
  | 'user'
  | 'user_rule'
  | 'merchant_rule'
  | 'parser_hint'
  | 'generic'
  | 'none';

export interface Transaction {
  id: string;
  /** Always positive. */
  amountMinor: MinorUnits;
  currency: CurrencyCode;
  type: TransactionType;
  direction: Direction;
  /** Canonical display name, e.g. "Zomato". */
  merchantName: string | null;
  /** As seen in the notification, e.g. "ZOMATO LTD". */
  merchantRaw: string | null;
  /** e.g. "zomato@hdfcbank". */
  payeeVpa: string | null;
  categoryId: string | null;
  subcategoryId: string | null;
  categorySource: CategorySource;
  source: TransactionSource;
  /** Package name of the app whose notification created this transaction. */
  sourceApp: string | null;
  paymentMethod: PaymentMethod;
  accountId: string | null;
  /** Last 3–4 digits of the account/card the notification named (dedup evidence). */
  accountLast4: string | null;
  /** UPI RRN / bank transaction reference. */
  reference: string | null;
  /** Epoch ms. */
  occurredAt: number;
  notes: string | null;
  /** 0..1 overall confidence (parse × categorization × dedup). */
  confidence: number;
  status: TransactionStatus;
  reviewReasons: ReviewReason[];
  recurringTransactionId: string | null;
  /** Refund → original expense; transfer counterpart. */
  linkedTransactionId: string | null;
  /** Suspected duplicate of this transaction (review decides). */
  duplicateOfId: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export type ParsedStatus = 'success' | 'failed' | 'pending';

/**
 * What the parser believes happened. Mapped to TransactionType by categorization:
 *   payment        purchase / bill / P2P debit             → expense
 *   receipt        money received (salary, P2P credit)     → income
 *   refund         merchant refund                         → refund
 *   reversal       failed-payment money returned           → refund
 *   transfer       own-account / explicit transfer         → transfer
 *   bill_payment   paying a CREDIT CARD bill (not utility) → transfer
 *   wallet_topup   bank → wallet / UPI Lite load           → transfer
 *   atm_withdrawal cash withdrawal (bank → cash)           → transfer
 *   unknown        can't tell                              → expense (debit) / income (credit), low confidence
 */
export type ParsedKind =
  | 'payment'
  | 'receipt'
  | 'refund'
  | 'reversal'
  | 'transfer'
  | 'bill_payment'
  | 'wallet_topup'
  | 'atm_withdrawal'
  | 'unknown';

export type AccountHintKind = 'bank' | 'card' | 'credit_card' | 'debit_card' | 'wallet' | 'upi_lite';

export interface AccountHint {
  /** Last 4 digits only. Never store more. */
  last4: string | null;
  kind: AccountHintKind | null;
  /** e.g. "HDFC Bank", "SBI Card". */
  institution: string | null;
}

export interface CategoryHint {
  categoryId: string;
  subcategoryId: string | null;
}

/** Output of a TransactionParser. */
export interface ParsedTransaction {
  amountMinor: MinorUnits;
  currency: CurrencyCode;
  direction: Direction;
  kind: ParsedKind;
  status: ParsedStatus;
  merchantRaw: string | null;
  payeeVpa: string | null;
  reference: string | null;
  accountHint: AccountHint | null;
  paymentMethod: PaymentMethod;
  /** From the text if a date/time is present, else the notification post time. Epoch ms. */
  occurredAt: number;
  balanceAfterMinor: MinorUnits | null;
  /** Package name. */
  sourceApp: string;
  parserId: string;
  /** 0..1 */
  confidence: number;
  categoryHint: CategoryHint | null;
}
