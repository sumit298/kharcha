import { detectFinancial } from './detect';
import { normalizeNotification } from '@/services/notification/normalize';
import { app, PKG, sms } from '@fixtures/notifications/builders';

describe('financial detection', () => {
  it('rejects bills that ask the user to pay to avoid charges', () => {
    const event = normalizeNotification(sms('AX-TESTBK-S', 'Your bill of Rs 708 is due. Pay now to avoid charges.'), 'raw-1')[0]!;
    expect(detectFinancial(event)).toMatchObject({ kind: 'not_financial', reason: 'payment_reminder' });
  });

  it('rejects UPI cashback offers that look like credits', () => {
    const event = normalizeNotification(
      app(PKG.paytm, 'Insurance Payment = ₹30 Cashback', 'Pay your insurance premium on Paytm with code INS30 and get ₹30 cashback.'),
      'raw-2',
    )[0]!;
    expect(detectFinancial(event)).toMatchObject({ kind: 'not_financial', reason: 'promotional' });
  });
});
