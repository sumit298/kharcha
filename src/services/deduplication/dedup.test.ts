import { at, makeTransaction } from '@/domain/analytics/testFactories';

import { decideDuplicate, enrichFromDuplicate, type DedupCandidate } from './dedup';

const T0 = at(2026, 10, 1, 12, 30);
const GPAY = 'com.google.android.apps.nbu.paisa.user';
const SMS = 'com.google.android.apps.messaging';

function candidate(overrides: Partial<DedupCandidate> = {}): DedupCandidate {
  return {
    amountMinor: 12400,
    direction: 'debit',
    kind: 'payment',
    occurredAt: T0,
    sourceApp: SMS,
    reference: null,
    accountLast4: null,
    merchantName: null,
    payeeVpa: null,
    ...overrides,
  };
}

const gpayTx = (overrides = {}) =>
  makeTransaction({ id: 'gpay', amountMinor: 12400, occurredAt: T0 - 60_000, sourceApp: GPAY, merchantName: 'Zomato', ...overrides });

describe('decideDuplicate', () => {
  it('merges on the same UPI reference', () => {
    const existing = [gpayTx({ reference: '612345678901' })];
    expect(decideDuplicate(candidate({ reference: '612345678901', occurredAt: T0 + 10 * 60_000 }), existing)).toEqual({
      kind: 'merge',
      targetId: 'gpay',
      reason: 'reference',
    });
  });

  it('never merges when both references exist and differ', () => {
    const existing = [gpayTx({ reference: '612345678901' })];
    expect(decideDuplicate(candidate({ reference: '612345678999', merchantName: 'Zomato' }), existing)).toEqual({ kind: 'new' });
  });

  it('merges a GPay + bank SMS pair within 3 minutes when the merchant agrees', () => {
    const decision = decideDuplicate(candidate({ merchantName: 'ZOMATO LTD' }), [gpayTx()]);
    expect(decision).toEqual({ kind: 'merge', targetId: 'gpay', reason: 'strong_match' });
  });

  it('flags a possible duplicate when only amount and time agree', () => {
    expect(decideDuplicate(candidate({ occurredAt: T0 + 8 * 60_000 }), [gpayTx()])).toEqual({
      kind: 'possible_duplicate',
      duplicateOfId: 'gpay',
    });
  });

  it('treats two payments from the same app as two payments', () => {
    expect(decideDuplicate(candidate({ sourceApp: GPAY, merchantName: 'Zomato' }), [gpayTx()])).toEqual({ kind: 'new' });
  });

  it('does not match contradicting merchants or accounts, other amounts, or times outside the window', () => {
    expect(decideDuplicate(candidate({ merchantName: 'Swiggy' }), [gpayTx()]).kind).toBe('new');
    expect(decideDuplicate(candidate({ accountLast4: '1234' }), [gpayTx({ accountLast4: '9999' })]).kind).toBe('new');
    expect(decideDuplicate(candidate({ amountMinor: 12500 }), [gpayTx()]).kind).toBe('new');
    expect(decideDuplicate(candidate({ occurredAt: T0 + 30 * 60_000 }), [gpayTx()]).kind).toBe('new');
  });

  it('compares 3-digit and 4-digit account suffixes', () => {
    expect(decideDuplicate(candidate({ accountLast4: '123' }), [gpayTx({ merchantName: null, accountLast4: '0123' })]).kind).toBe('merge');
  });

  it('ignores deleted and ignored transactions', () => {
    expect(decideDuplicate(candidate(), [gpayTx({ deletedAt: T0 })]).kind).toBe('new');
    expect(decideDuplicate(candidate(), [gpayTx({ status: 'ignored' })]).kind).toBe('new');
  });

  it('turns a debit + credit with the same reference into a self transfer', () => {
    const debit = gpayTx({ reference: '612345678901' });
    expect(decideDuplicate(candidate({ direction: 'credit', kind: 'receipt', reference: '612345678901' }), [debit])).toEqual({
      kind: 'self_transfer',
      counterpartId: 'gpay',
    });
  });

  it('links reversals and refunds to the original expense', () => {
    const original = gpayTx({ reference: '612345678901', merchantName: 'Myntra' });
    expect(decideDuplicate(candidate({ direction: 'credit', kind: 'reversal', reference: '612345678901' }), [original])).toEqual({
      kind: 'link_refund',
      originalId: 'gpay',
    });
    const later = candidate({ direction: 'credit', kind: 'refund', merchantName: 'MYNTRA', occurredAt: T0 + 3 * 86_400_000 });
    expect(decideDuplicate(later, [original])).toEqual({ kind: 'link_refund', originalId: 'gpay' });
  });
});

describe('enrichFromDuplicate', () => {
  it('fills only missing fields', () => {
    const target = gpayTx({ reference: null, merchantName: 'Zomato', reviewReasons: ['unknown_merchant'] });
    const merged = enrichFromDuplicate(target, {
      reference: '612345678901',
      payeeVpa: 'zomato@hdfcbank',
      merchantName: 'ZOMATO LTD',
      merchantRaw: 'ZOMATO LTD',
      accountId: 'acc-1',
      accountLast4: '1234',
    });
    expect(merged).toMatchObject({ reference: '612345678901', merchantName: 'Zomato', accountLast4: '1234', reviewReasons: [] });
  });
});
