/** Test-only builders with synthetic data for the budgets, recurring and analytics modules. */
import type { RecurringTransaction, Transaction } from '@/types';

/** Local-time epoch ms (IST under the test runner); month is 1-based. */
export function at(year: number, month: number, day: number, hour = 0, minute = 0): number {
  return new Date(year, month - 1, day, hour, minute).getTime();
}

let sequence = 0;

export function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  sequence += 1;
  const type = overrides.type ?? 'expense';
  return {
    id: `tx-${sequence}`,
    amountMinor: 10000,
    currency: 'INR',
    type,
    direction: type === 'income' || type === 'refund' ? 'credit' : 'debit',
    merchantName: null,
    merchantRaw: null,
    payeeVpa: null,
    categoryId: null,
    subcategoryId: null,
    categorySource: 'none',
    source: 'notification',
    sourceApp: 'com.example.upi',
    paymentMethod: 'upi',
    accountId: null,
    accountLast4: null,
    reference: null,
    occurredAt: at(2026, 9, 15, 12),
    notes: null,
    confidence: 1,
    status: 'confirmed',
    reviewReasons: [],
    recurringTransactionId: null,
    linkedTransactionId: null,
    duplicateOfId: null,
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    ...overrides,
  };
}

export function makeRecurring(overrides: Partial<RecurringTransaction> = {}): RecurringTransaction {
  sequence += 1;
  return {
    id: `rec-${sequence}`,
    name: 'Test Bill',
    amountMinor: 100000,
    currency: 'INR',
    type: 'expense',
    frequency: 'monthly',
    interval: 1,
    nextDueAt: at(2026, 10, 1),
    anchorDay: 1,
    categoryId: null,
    subcategoryId: null,
    accountId: null,
    merchantName: null,
    isActive: true,
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    ...overrides,
  };
}
