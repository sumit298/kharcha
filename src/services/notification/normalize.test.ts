import { payload, PKG, POSTED_AT, sms } from '@fixtures/notifications/builders';

import { normalizeNotification, normalizeText, OWN_PACKAGE } from './normalize';
import { parseSmsSender } from './sender';

describe('normalizeText', () => {
  it('trims lines, collapses spaces, keeps line breaks, strips invisible characters', () => {
    expect(normalizeText('  Sent  Rs.10 \r\n\n  To​ SHOP  ')).toBe('Sent Rs.10\nTo SHOP');
    expect(normalizeText(null)).toBe('');
  });
});

describe('normalizeNotification', () => {
  it('emits one event per MessagingStyle message, titled by sender', () => {
    const raw = payload({
      packageName: PKG.messages,
      title: '2 new messages',
      messages: [
        { sender: 'AX-HDFCBK-S', text: 'Rs.10 debited', timestamp: POSTED_AT - 5000 },
        { sender: 'AX-SBIUPI-S', text: 'Rs.20 credited', timestamp: POSTED_AT - 1000 },
      ],
    });
    const events = normalizeNotification(raw, 'raw-1');
    expect(events.map((e) => [e.messageIndex, e.title, e.body, e.postedAt])).toEqual([
      [0, 'AX-HDFCBK-S', 'Rs.10 debited', POSTED_AT - 5000],
      [1, 'AX-SBIUPI-S', 'Rs.20 credited', POSTED_AT - 1000],
    ]);
    expect(events[0]?.sourceKind).toBe('sms_app');
  });

  it('prefers expanded text and joins collapsed text when it adds information', () => {
    const [same] = normalizeNotification(payload({ packageName: PKG.gpay, title: 'T', text: 'Paid ₹1', bigText: 'Paid ₹1 to X' }), 'r');
    expect(same?.body).toBe('Paid ₹1 to X');
    const [joined] = normalizeNotification(payload({ packageName: PKG.gpay, title: 'T', text: 'A', bigText: 'B' }), 'r');
    expect(joined?.body).toBe('A\nB');
  });

  it('drops group summaries and our own notifications', () => {
    expect(normalizeNotification(payload({ packageName: PKG.gpay, isGroupSummary: true, text: 'x' }), 'r')).toEqual([]);
    expect(normalizeNotification(payload({ packageName: OWN_PACKAGE, text: 'x' }), 'r')).toEqual([]);
  });

  it('flags redacted content', () => {
    expect(normalizeNotification(sms('AX-HDFCBK-S', 'Sensitive notification content hidden'), 'r')[0]?.isRedacted).toBe(true);
  });

  it('hashes re-posts identically but separates identical SMS sent at different times', () => {
    const a = normalizeNotification(sms('AX-HDFCBK-S', 'Rs.10 debited'), 'r1')[0];
    const b = normalizeNotification(sms('AX-HDFCBK-S', 'Rs.10 debited'), 'r2')[0];
    const later = normalizeNotification(sms('AX-HDFCBK-S', 'Rs.10 debited', POSTED_AT + 60_000), 'r3')[0];
    expect(a?.contentHash).toBe(b?.contentHash);
    expect(a?.contentHash).not.toBe(later?.contentHash);
  });
});

describe('parseSmsSender', () => {
  it('reads DLT headers and suffixes', () => {
    expect(parseSmsSender('AX-HDFCBK-S')).toEqual({ header: 'HDFCBK', suffix: 'S' });
    expect(parseSmsSender('VM-HDFCBK')).toEqual({ header: 'HDFCBK', suffix: null });
    expect(parseSmsSender('HDFCBK')).toEqual({ header: 'HDFCBK', suffix: null });
    expect(parseSmsSender('AD-TESTFN-P').suffix).toBe('P');
    expect(parseSmsSender('+919000000000')).toEqual({ header: null, suffix: null });
  });
});
