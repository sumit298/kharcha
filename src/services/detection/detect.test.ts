import { detectFinancial } from './detect';
import { normalizeNotification } from '@/services/notification/normalize';
import { sms } from '@fixtures/notifications/builders';

describe('financial detection', () => {
  it('rejects bills that ask the user to pay to avoid charges', () => {
    const event = normalizeNotification(sms('AX-TESTBK-S', 'Your bill of Rs 708 is due. Pay now to avoid charges.'), 'raw-1')[0]!;
    expect(detectFinancial(event)).toMatchObject({ kind: 'not_financial', reason: 'payment_reminder' });
  });
});
