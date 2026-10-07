import { canonicalMerchantName, findKnownMerchant, merchantKey } from '@/domain/merchants/canonical';
import type { MerchantRule, ParsedTransaction } from '@/types';

import { categorize } from './categorize';
import { learnFromCorrection } from './learn';

function parsed(overrides: Partial<ParsedTransaction> = {}): ParsedTransaction {
  return {
    amountMinor: 12400,
    currency: 'INR',
    direction: 'debit',
    kind: 'payment',
    status: 'success',
    merchantRaw: null,
    payeeVpa: null,
    reference: null,
    accountHint: null,
    paymentMethod: 'upi',
    occurredAt: 0,
    balanceAfterMinor: null,
    sourceApp: 'com.example.upi',
    parserId: 'test',
    confidence: 0.9,
    categoryHint: null,
    ...overrides,
  };
}

const NOW = 1_790_000_000_000;

describe('merchant canonicalization', () => {
  it('maps raw names and UPI IDs to built-in merchants', () => {
    expect(canonicalMerchantName('ZOMATO LTD', null)).toBe('Zomato');
    expect(canonicalMerchantName(null, 'swiggy.instamart@icici')).toBe('Swiggy Instamart');
    expect(findKnownMerchant('AMAZON PAY INDIA', null)?.subcategoryId).toBe('shopping.online');
    expect(findKnownMerchant('COCA COLA STALL', null)).toBeNull(); // "ola" needs a word boundary
  });

  it('tidies unknown names and keys them without legal suffixes', () => {
    expect(canonicalMerchantName('SHARMA GENERAL STORE', null)).toBe('Sharma General Store');
    expect(canonicalMerchantName('Asha Test', null)).toBe('Asha Test');
    expect(merchantKey('Sharma Traders Pvt. Ltd.')).toBe('sharma traders');
  });
});

describe('categorize', () => {
  it('uses the built-in merchant dictionary (Zomato → Food › Food Delivery)', () => {
    const c = categorize(parsed({ merchantRaw: 'ZOMATO' }), []);
    expect(c).toMatchObject({
      merchantName: 'Zomato',
      categoryId: 'food',
      subcategoryId: 'food.food_delivery',
      categorySource: 'merchant_rule',
      type: 'expense',
      reviewReasons: [],
    });
  });

  it('lets a learned rule beat the built-in merchant, and a user rule beat a learned one', () => {
    const learned = learnFromCorrection(
      { merchantRaw: 'ZOMATO', merchantName: 'Zomato', payeeVpa: null, type: 'expense' },
      { categoryId: 'personal', subcategoryId: 'personal.misc' },
      [],
      NOW,
    ) as MerchantRule;
    expect(categorize(parsed({ merchantRaw: 'Zomato Ltd' }), [learned])).toMatchObject({
      categoryId: 'personal',
      categorySource: 'user_rule',
      ruleId: learned.id,
    });
    const user: MerchantRule = { ...learned, id: 'user-1', origin: 'user', categoryId: 'food', subcategoryId: 'food.restaurants', updatedAt: NOW - 1 };
    expect(categorize(parsed({ merchantRaw: 'ZOMATO' }), [learned, user]).subcategoryId).toBe('food.restaurants');
  });

  it('falls back to parser hints, then keywords, then review', () => {
    expect(categorize(parsed({ merchantRaw: 'TRAIN', categoryHint: { categoryId: 'travel', subcategoryId: 'travel.trains' } }), []))
      .toMatchObject({ subcategoryId: 'travel.trains', categorySource: 'parser_hint' });
    expect(categorize(parsed({ merchantRaw: 'GUPTA MEDICAL STORE' }), [])).toMatchObject({
      subcategoryId: 'health.pharmacy',
      categorySource: 'generic',
    });
    expect(categorize(parsed({ merchantRaw: 'XYZ123' }), [])).toMatchObject({
      categoryId: null,
      categorySource: 'none',
      reviewReasons: ['uncategorized'],
    });
  });

  it('maps transfers and refunds to the right type', () => {
    expect(categorize(parsed({ kind: 'bill_payment' }), [])).toMatchObject({ type: 'transfer', subcategoryId: 'finance.credit_card_payment' });
    expect(categorize(parsed({ kind: 'atm_withdrawal' }), [])).toMatchObject({ type: 'transfer' });
    expect(categorize(parsed({ kind: 'refund', direction: 'credit', merchantRaw: 'MYNTRA' }), [])).toMatchObject({ type: 'refund', categoryId: 'shopping' });
    expect(categorize(parsed({ merchantRaw: 'ZERODHA BROKING' }), [])).toMatchObject({ type: 'transfer', subcategoryId: 'finance.investments' });
  });

  it('flags payments to personal UPI IDs as possible transfers, and income goes to Other Income', () => {
    expect(categorize(parsed({ payeeVpa: '9000000000@ybl' }), []).reviewReasons).toEqual(['uncategorized', 'possible_transfer']);
    expect(categorize(parsed({ direction: 'credit', kind: 'receipt', merchantRaw: 'TEST EMPLOYER SALARY' }), []).subcategoryId).toBe('income.salary');
    expect(categorize(parsed({ direction: 'credit', kind: 'receipt', merchantRaw: 'Asha' }), []).subcategoryId).toBe('income.other');
  });

  it('flags unknown merchants and low confidence', () => {
    expect(categorize(parsed({ confidence: 0.5 }), []).reviewReasons).toEqual(['uncategorized', 'unknown_merchant', 'low_confidence']);
  });

  it('applies a learned type change (P2P marked as transfer) to future payments', () => {
    const rule = learnFromCorrection(
      { merchantRaw: null, merchantName: null, payeeVpa: '9000000000@ybl', type: 'expense' },
      { categoryId: 'transfers', subcategoryId: 'transfers.family', type: 'transfer' },
      [],
      NOW,
    ) as MerchantRule;
    expect(rule).toMatchObject({ matchField: 'vpa', pattern: '9000000000@ybl', transactionType: 'transfer', origin: 'learned' });
    expect(categorize(parsed({ payeeVpa: '9000000000@YBL'.toLowerCase() }), [rule])).toMatchObject({ type: 'transfer', reviewReasons: [] });
  });
});

describe('learnFromCorrection', () => {
  it('updates an existing learned rule and never overwrites a user rule', () => {
    const tx = { merchantRaw: 'TEA STALL', merchantName: 'Tea Stall', payeeVpa: null, type: 'expense' as const };
    const first = learnFromCorrection(tx, { categoryId: 'food', subcategoryId: 'food.cafes' }, [], NOW) as MerchantRule;
    const second = learnFromCorrection(tx, { categoryId: 'food', subcategoryId: 'food.snacks' }, [first], NOW + 1);
    expect(second).toMatchObject({ id: first.id, subcategoryId: 'food.snacks', updatedAt: NOW + 1 });
    expect(learnFromCorrection(tx, { categoryId: 'food', subcategoryId: null }, [{ ...first, origin: 'user' }], NOW)).toBeNull();
    expect(learnFromCorrection({ merchantRaw: null, merchantName: null, payeeVpa: null, type: 'expense' }, { categoryId: 'food', subcategoryId: null }, [], NOW)).toBeNull();
  });
});
