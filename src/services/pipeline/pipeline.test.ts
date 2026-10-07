import { app, PKG, POSTED_AT, sms } from '@fixtures/notifications/builders';
import { prepareDatabase } from '@/database/bootstrap';
import { openNodeDatabase } from '@/database/adapters/node';
import { accountRepo, categoryRepo, rawEventRepo, ruleRepo, transactionRepo } from '@/database/repositories';
import type { SqlDatabase } from '@/database/sql';
import { addManualTransaction, resolveDuplicate, setCategory } from '@/services/transactions/actions';

import { Pipeline } from './pipeline';

let db: SqlDatabase;
let clock = POSTED_AT;
let pipeline: Pipeline;

beforeEach(async () => {
  db = openNodeDatabase();
  await prepareDatabase(db, POSTED_AT);
  clock = POSTED_AT;
  pipeline = new Pipeline(db, { now: () => clock });
});

afterEach(() => db.closeAsync());

const allTx = () => transactionRepo.list(db);

describe('database', () => {
  it('migrates idempotently and seeds categories once', async () => {
    await prepareDatabase(db, POSTED_AT);
    const cats = await categoryRepo.list(db);
    expect(cats.filter((c) => c.id === 'food.food_delivery')).toHaveLength(1);
    expect(cats.length).toBeGreaterThan(80);
  });
});

describe('pipeline', () => {
  it('records a UPI payment, categorized, end to end', async () => {
    const [result] = await pipeline.ingest(app(PKG.gpay, 'Payment successful', '₹124 paid to Zomato'));
    expect(result?.kind).toBe('created');
    const [tx] = await allTx();
    expect(tx).toMatchObject({
      amountMinor: 12400,
      type: 'expense',
      merchantName: 'Zomato',
      subcategoryId: 'food.food_delivery',
      status: 'confirmed',
      sourceApp: PKG.gpay,
    });
  });

  it('ignores an exact re-post of the same notification', async () => {
    const n = app(PKG.gpay, 'Payment successful', '₹124 paid to Zomato');
    await pipeline.ingest(n);
    expect(await pipeline.ingest(n)).toEqual([{ kind: 'duplicate_event' }]);
    expect(await allTx()).toHaveLength(1);
  });

  it('records one ₹124 payment when GPay and the bank SMS both report it', async () => {
    await pipeline.ingest(app(PKG.gpay, 'Payment successful', '₹124 paid to Zomato'));
    clock += 40_000;
    const [r] = await pipeline.ingest(
      sms('AX-HDFCBK-S', 'Sent Rs.124.00\nFrom HDFC Bank A/C *1234\nTo ZOMATO LTD\nOn 01/10/26\nRef 612345678902', POSTED_AT + 40_000),
    );
    expect(r?.kind).toBe('merged');
    const txs = await allTx();
    expect(txs).toHaveLength(1);
    expect(txs[0]).toMatchObject({ reference: '612345678902', accountLast4: '1234', merchantName: 'Zomato' });
  });

  it('flags a weaker match as a possible duplicate that does not count until resolved', async () => {
    await pipeline.ingest(app(PKG.gpay, 'Payment successful', '₹500 paid'));
    clock += 9 * 60_000;
    await pipeline.ingest(sms('AX-HDFCBK-S', 'Rs.500 debited from A/c XX1234 on 01-10-26', POSTED_AT + 9 * 60_000));
    const txs = await allTx();
    expect(txs).toHaveLength(2);
    const dup = txs.find((t) => t.reviewReasons.includes('possible_duplicate'));
    expect(dup?.status).toBe('needs_review');
    await resolveDuplicate(db, dup!.id, true, clock);
    expect((await transactionRepo.get(db, dup!.id))?.status).toBe('ignored');
  });

  it('stores rejected and failed notifications as raw events, without OTP text', async () => {
    await pipeline.ingest(sms('AX-HDFCBK-S', '482913 is your OTP for login. Never share it.'));
    await pipeline.ingest(app(PKG.gpay, 'Payment', '₹300 something odd happened'));
    const events = await rawEventRepo.recent(db);
    const otp = events.find((e) => e.error === 'otp');
    expect(otp).toMatchObject({ status: 'not_financial', payload: null });
    expect(events.find((e) => e.status === 'failed')).toBeDefined();
    expect(await allTx()).toHaveLength(0);
  });

  it('does not keep the text of messages without any amount (personal SMS)', async () => {
    await pipeline.ingest(sms('Mom', 'Call me when you reach home'));
    const [event] = await rawEventRepo.recent(db);
    expect(event).toMatchObject({ status: 'not_financial', error: 'no_amount', payload: null });
  });

  it('keeps hidden (redacted) notifications as one countable status, dismissible in bulk', async () => {
    await pipeline.ingest(sms('AX-HDFCBK-S', 'Sensitive notification content hidden'));
    clock += 5 * 60_000;
    await pipeline.ingest(sms('AX-ICICIB-S', 'Sensitive notification content hidden', POSTED_AT + 5 * 60_000));
    expect(await rawEventRepo.countByStatus(db, 'redacted')).toBe(2);
    await rawEventRepo.changeStatus(db, 'redacted', 'ignored');
    expect(await rawEventRepo.countByStatus(db, 'redacted')).toBe(0);
  });

  it('purges previously stored text of no-amount messages on start', async () => {
    await pipeline.ingest(sms('Friend', 'Dinner at 8?'));
    await db.runAsync("UPDATE raw_events SET payload = '{}'");
    await prepareDatabase(db, POSTED_AT);
    expect((await rawEventRepo.recent(db))[0]?.payload).toBeNull();
  });

  it('marks a recorded payment for review when a failure notice follows', async () => {
    await pipeline.ingest(app(PKG.paytm, 'Paid', 'Paid Rs.399 to Big Mart'));
    clock += 60_000;
    await pipeline.ingest(app(PKG.paytm, 'Payment Failed', 'Your payment of ₹399 to Big Mart failed.'));
    const [tx] = await allTx();
    expect(tx?.reviewReasons).toContain('payment_failed');
  });

  it('links a refund to the original expense', async () => {
    await pipeline.ingest(sms('AX-ICICIB-S', 'ICICI Bank Acct XX123 debited for Rs 499.00 on 01-Oct-26; MYNTRA credited. UPI:612345678906.'));
    clock += 2 * 86_400_000;
    await pipeline.ingest(sms('AX-ICICIB-S', 'Refund of Rs 499.00 from MYNTRA credited to your Acct XX123.', POSTED_AT + 2 * 86_400_000));
    const refund = (await allTx()).find((t) => t.type === 'refund');
    expect(refund?.linkedTransactionId).toBeTruthy();
    expect(refund?.categoryId).toBe('shopping');
  });

  it('turns a debit + credit with the same reference into one transfer', async () => {
    await pipeline.ingest(sms('AX-HDFCBK-S', 'Rs.2,000 debited from A/c XX1234 to VPA me.test@okaxis UPI Ref 612345678920'));
    clock += 30_000;
    await pipeline.ingest(sms('AX-AXISBK-S', 'Rs.2,000 credited to A/c XX5555 from VPA me.test@okhdfc UPI Ref 612345678920', POSTED_AT + 30_000));
    const txs = await allTx();
    expect(txs).toHaveLength(1);
    expect(txs[0]?.type).toBe('transfer');
  });

  it('matches a configured account by its last digits', async () => {
    await accountRepo.upsert(db, { id: 'acc-hdfc', name: 'HDFC Savings', type: 'bank', institution: 'HDFC Bank', last4: '1234', isDefault: true, createdAt: 0, updatedAt: 0, deletedAt: null });
    await pipeline.ingest(sms('AX-HDFCBK-S', 'Rs.50 debited from A/c XX1234 to VPA shop.test@okaxis UPI Ref 612345678930'));
    expect((await allTx())[0]?.accountId).toBe('acc-hdfc');
  });

  it('learns from a correction and applies it to future and pending transactions', async () => {
    await pipeline.ingest(app(PKG.gpay, 'Payment successful', '₹40 paid to Raju Tea Corner'));
    clock += 3600_000;
    await pipeline.ingest(app(PKG.gpay, 'Payment successful', '₹30 paid to Raju Tea Corner'));
    const [first] = await allTx();
    expect(first?.subcategoryId).toBe('food.cafes'); // keyword "tea"
    await setCategory(db, first!.id, { categoryId: 'food', subcategoryId: 'food.snacks' }, clock);
    expect((await ruleRepo.list(db))[0]).toMatchObject({ origin: 'learned', pattern: 'raju tea corner' });
    clock += 3600_000;
    await pipeline.ingest(app(PKG.gpay, 'Payment successful', '₹20 paid to Raju Tea Corner'));
    const latest = (await allTx())[0];
    expect(latest).toMatchObject({ amountMinor: 2000, subcategoryId: 'food.snacks', categorySource: 'user_rule' });
  });

  it('saves a quick manual expense', async () => {
    await addManualTransaction(db, { amountMinor: 6000, categoryId: 'food', subcategoryId: 'food.snacks' }, clock);
    expect(await allTx()).toEqual([expect.objectContaining({ source: 'manual', paymentMethod: 'cash', status: 'confirmed' })]);
  });

  it('re-processes failed events after a parser improvement', async () => {
    await pipeline.ingest(app(PKG.gpay, 'Payment', '₹300 something odd happened'));
    expect(await pipeline.reprocessOutdated()).toEqual([]); // already at the current version
  });
});
