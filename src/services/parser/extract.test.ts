import {
  detectDirection,
  extractAccountHint,
  extractOccurredAt,
  extractReference,
  extractVpa,
  findAmounts,
  parseAmountToken,
  transactionAmount,
} from './extract';

const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();

describe('amounts', () => {
  it.each([
    ['₹124 debited', 12400],
    ['INR 124.00 spent', 12400],
    ['Rs.124 paid', 12400],
    ['UPI payment of ₹124', 12400],
    ['credited ₹10,000', 1000000],
    ['received ₹500', 50000],
    ['Rs 1,23,456.50 credited', 12345650],
    ['Rs.5000/- debited', 500000],
    ['500 INR debited', 50000],
    ['debited by 124.0 on', 12400],
  ])('%s → %i', (text, minor) => {
    expect(transactionAmount(findAmounts(text))?.amountMinor).toBe(minor);
  });

  it('separates balances and limits from the transaction amount', () => {
    const amounts = findAmounts('Rs.500 debited. Avl Bal Rs.1,000. Avl Limit: INR 9,000');
    expect(amounts.map((a) => [a.amountMinor, a.role])).toEqual([
      [50000, 'transaction'],
      [100000, 'balance'],
      [900000, 'limit'],
    ]);
  });

  it('does not read words ending in "rs" as rupees', () => {
    expect(findAmounts('2 hrs 30 mins')).toEqual([]);
  });

  it('rejects zero and malformed tokens', () => {
    expect(parseAmountToken('0.00')).toBeNull();
    expect(parseAmountToken('1,234.5')).toBe(123450);
  });
});

describe('direction', () => {
  it.each([
    ['Rs.10 debited from A/c XX1 and credited to x@ybl', 'debit'],
    ['Asha paid you ₹500', 'credit'],
    ['₹124 paid to Zomato', 'debit'],
    ['Received ₹500 from Ravi', 'credit'],
    ['We have received your payment of ₹410', 'debit'],
    ['Rs 10,000 transferred to your A/c XX12', 'credit'],
    ['Rs 10,000 transferred from your A/c XX12', 'debit'],
    ['Payment successful ₹60', 'debit'],
  ])('%s → %s', (text, direction) => {
    expect(detectDirection(text)?.direction).toBe(direction);
  });

  it('ignores future and promotional verbs', () => {
    expect(detectDirection('Rs.649 will be debited on 5 Oct')).toBeNull();
    expect(detectDirection('Get ₹500 credited instantly')).toBeNull();
  });
});

describe('references, VPAs and accounts', () => {
  it('finds UPI references but not phone numbers', () => {
    expect(extractReference('UPI Ref No. 612345678901')).toBe('612345678901');
    expect(extractReference('Call 18000000000 if not you')).toBeNull();
    expect(extractReference('UTR No. TESTN52026100112345')).toBe('TESTN52026100112345');
  });

  it('finds UPI IDs but not e-mail addresses', () => {
    expect(extractVpa('to shop.test@okaxis on')).toBe('shop.test@okaxis');
    expect(extractVpa('write to care@testbank.com')).toBeNull();
  });

  it('keeps only the last digits of accounts and cards', () => {
    expect(extractAccountHint('A/c no. XXXXXX1234')).toMatchObject({ last4: '1234', kind: 'bank' });
    expect(extractAccountHint('HDFC Bank Credit Card XX4321')).toMatchObject({ last4: '4321', kind: 'credit_card', institution: 'HDFC Bank' });
    expect(extractAccountHint('Acct XX123')).toMatchObject({ last4: '123' });
  });
});

describe('extractOccurredAt', () => {
  const posted = at(2026, 10, 1, 12, 30);
  it('uses a full timestamp from the text', () => {
    expect(extractOccurredAt('On 2026-10-01:12:10:05', posted)).toBe(new Date(2026, 9, 1, 12, 10, 5).getTime());
    expect(extractOccurredAt('01-10-26, 12:28:40', posted)).toBe(new Date(2026, 9, 1, 12, 28, 40).getTime());
  });
  it('uses the post time for same-day dates and implausible dates', () => {
    expect(extractOccurredAt('on 01Oct26', posted)).toBe(posted);
    expect(extractOccurredAt('on 01-01-20', posted)).toBe(posted);
  });
  it('uses noon for an earlier day without a time', () => {
    expect(extractOccurredAt('on 29-Sep-26', posted)).toBe(at(2026, 9, 29, 12));
  });
});
