import { FIXTURES } from '@fixtures/notifications';
import { detectFinancial } from '@/services/detection/detect';
import { normalizeNotification } from '@/services/notification/normalize';

import { createDefaultRegistry } from './registry';

const registry = createDefaultRegistry();

describe('synthetic notification corpus', () => {
  it.each(FIXTURES.map((f) => [f.id, f] as const))('%s', (_id, fixture) => {
    const events = normalizeNotification(fixture.payload, 'raw-1');
    expect(events).toHaveLength(1);
    const event = events[0]!;
    const detection = detectFinancial(event);
    const verdict = detection.kind === 'not_financial' ? detection.reason : detection.kind;
    expect(verdict).toBe(fixture.detect);
    if (fixture.parsed === undefined) return;

    const outcome = registry.parse(event);
    if (fixture.parsed === null) {
      expect(outcome.kind).toBe('failed');
      return;
    }
    if (outcome.kind !== 'parsed') throw new Error(`expected a parse, got ${JSON.stringify(outcome)}`);
    const tx = outcome.transaction;
    const { last4, ...rest } = fixture.parsed;
    expect(tx).toMatchObject(rest);
    if (last4 !== undefined) expect(tx.accountHint?.last4 ?? null).toBe(last4);
    expect(tx.confidence).toBeGreaterThan(0);
    expect(tx.confidence).toBeLessThanOrEqual(1);
  });
});
