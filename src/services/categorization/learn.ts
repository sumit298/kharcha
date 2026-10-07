import { merchantKey } from '@/domain/merchants/canonical';
import type { MerchantRule, Transaction, TransactionType } from '@/types';
import { newId } from '@/utils/ids';

export interface Correction {
  categoryId: string | null;
  subcategoryId: string | null;
  /** Set when the user also changed the type (e.g. marked a P2P payment as a transfer). */
  type?: TransactionType;
}

/**
 * ARCHITECTURE §6 "Learning": when the user re-categorizes a transaction, upsert a `learned`
 * rule for its merchant (or its UPI ID when there's no merchant name). Returns the rule to save,
 * or null when there's nothing to key it on. An existing `user` rule is never overwritten.
 */
export function learnFromCorrection(
  tx: Pick<Transaction, 'merchantRaw' | 'merchantName' | 'payeeVpa' | 'type'>,
  correction: Correction,
  rules: readonly MerchantRule[],
  now: number,
): MerchantRule | null {
  const raw = tx.merchantRaw ?? tx.merchantName;
  const key = raw
    ? { matchField: 'merchant' as const, pattern: merchantKey(raw) }
    : tx.payeeVpa
      ? { matchField: 'vpa' as const, pattern: tx.payeeVpa.toLowerCase() }
      : null;
  if (!key || !key.pattern) return null;

  const existing = rules.find(
    (r) => r.deletedAt === null && r.matchType === 'exact' && r.matchField === key.matchField && r.pattern === key.pattern,
  );
  if (existing?.origin === 'user') return null;

  const transactionType = correction.type && correction.type !== tx.type ? correction.type : (existing?.transactionType ?? null);
  if (existing) {
    return {
      ...existing,
      categoryId: correction.categoryId,
      subcategoryId: correction.subcategoryId,
      transactionType,
      enabled: true,
      updatedAt: now,
    };
  }
  return {
    id: newId(now),
    merchantName: tx.merchantName ?? raw ?? tx.payeeVpa ?? key.pattern,
    matchField: key.matchField,
    matchType: 'exact',
    pattern: key.pattern,
    categoryId: correction.categoryId,
    subcategoryId: correction.subcategoryId,
    transactionType,
    defaultPaymentMethod: null,
    accountId: null,
    notes: null,
    origin: 'learned',
    enabled: true,
    hitCount: 0,
    lastMatchedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}
