import type { NotificationEvent, ParsedTransaction } from '@/types';

/**
 * A strategy that turns one financial notification into a ParsedTransaction.
 *
 * Priority bands (higher runs first):
 *   300+ app-specific (Google Pay, PhonePe, …)
 *   200+ bank / card-issuer specific (HDFC, SBI Card, …)
 *   100+ generic UPI / payment
 *    50+ generic debit/credit
 */
export interface TransactionParser {
  readonly id: string;
  readonly priority: number;
  canParse(event: NotificationEvent): boolean;
  /** Return null when this parser can't extract an amount + direction. */
  parse(event: NotificationEvent): ParsedTransaction | null;
}

export type ParseOutcome =
  | { kind: 'parsed'; transaction: ParsedTransaction }
  /** Financial-looking but no parser could extract a transaction → Review. */
  | { kind: 'failed'; reason: string; parserIdsTried: string[] };
