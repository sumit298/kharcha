import type { CurrencyCode, MinorUnits } from './money';
import type { RawNotificationPayload } from './notification';
import type { PaymentMethod, TransactionType } from './transaction';

interface Syncable {
  id: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

// ─── Categories ───────────────────────────────────────────────────────────────

export type CategoryKind = 'expense' | 'income' | 'transfer';

export interface Category extends Syncable {
  name: string;
  /** null for a top-level category. */
  parentId: string | null;
  kind: CategoryKind;
  /** MaterialCommunityIcons name. */
  icon: string | null;
  /** Hex colour. */
  color: string | null;
  /** Built-in categories can be renamed/hidden but not hard-deleted. */
  isSystem: boolean;
  sortOrder: number;
}

// ─── Merchant / app rules ─────────────────────────────────────────────────────

/** Which field of a transaction a rule matches on. */
export type RuleMatchField = 'merchant' | 'vpa' | 'source_app' | 'text';
export type RuleMatchType = 'exact' | 'contains' | 'prefix' | 'regex';
/** `user` = created in the rules UI; `learned` = from a correction; `builtin` = shipped. */
export type RuleOrigin = 'user' | 'learned' | 'builtin';

export interface MerchantRule extends Syncable {
  /** Display name the rule assigns, e.g. "Zomato". */
  merchantName: string;
  matchField: RuleMatchField;
  matchType: RuleMatchType;
  /** Lower-cased, whitespace-normalized pattern (regex source when matchType = regex). */
  pattern: string;
  categoryId: string | null;
  subcategoryId: string | null;
  /** Optional override, e.g. mark matches as `transfer`. */
  transactionType: TransactionType | null;
  defaultPaymentMethod: PaymentMethod | null;
  accountId: string | null;
  notes: string | null;
  origin: RuleOrigin;
  enabled: boolean;
  hitCount: number;
  lastMatchedAt: number | null;
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

export type AccountType = 'bank' | 'credit_card' | 'wallet' | 'cash' | 'upi_lite';

export interface Account extends Syncable {
  name: string;
  type: AccountType;
  institution: string | null;
  /** Last 4 digits only. */
  last4: string | null;
  isDefault: boolean;
}

// ─── Budgets ──────────────────────────────────────────────────────────────────

export interface Budget extends Syncable {
  /** null = total monthly budget. */
  categoryId: string | null;
  amountMinor: MinorUnits;
  /** First month (YYYY-MM) this amount applies to; latest effectiveFrom ≤ month wins. */
  effectiveFrom: string;
}

// ─── Recurring ────────────────────────────────────────────────────────────────

export type RecurrenceFrequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface RecurringTransaction extends Syncable {
  name: string;
  amountMinor: MinorUnits;
  currency: CurrencyCode;
  type: 'expense' | 'income';
  frequency: RecurrenceFrequency;
  /** Every N periods (1 = every month for monthly). */
  interval: number;
  /** Next due date, epoch ms at local start of day. */
  nextDueAt: number;
  /**
   * Day of month (1–31) monthly/quarterly/yearly items are anchored to, clamped to shorter
   * months without drifting (31st → Feb 28 → Mar 31). null for weekly.
   */
  anchorDay: number | null;
  categoryId: string | null;
  subcategoryId: string | null;
  accountId: string | null;
  merchantName: string | null;
  isActive: boolean;
}

// ─── Raw events ───────────────────────────────────────────────────────────────

export type RawEventStatus =
  | 'pending'
  | 'not_financial'
  | 'parsed'
  | 'merged'
  | 'status_update'
  | 'failed'
  | 'redacted'
  | 'ignored';

/** One captured notification (or SMS message within one). Immutable payload. */
export interface RawEvent {
  id: string;
  /** Native queue row id it was drained from (null for imports/tests). */
  queueId: number | null;
  key: string;
  packageName: string;
  appName: string | null;
  postedAt: number;
  messageIndex: number;
  contentHash: string;
  /** Null when privacy rules say not to keep the text (OTP etc.). */
  payload: RawNotificationPayload | null;
  status: RawEventStatus;
  parserId: string | null;
  transactionId: string | null;
  error: string | null;
  receivedAt: number;
  processedAt: number | null;
  /** Pipeline version that produced `status`; bump to trigger re-processing. */
  pipelineVersion: number;
}
