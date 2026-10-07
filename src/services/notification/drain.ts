import { NotificationListener } from '../../../modules/notification-listener';
import type { Pipeline, ProcessResult } from '@/services/pipeline/pipeline';
import type { RawNotificationPayload } from '@/types';

import { KNOWN_APPS } from './knownApps';

let draining: Promise<ProcessResult[]> | null = null;

/**
 * Packages the native listener keeps even without a money pattern (bank/UPI apps sometimes put
 * only "Payment successful" in a notification). SMS apps are excluded: bank SMS always contain an
 * amount, and personal messages must not be captured.
 */
export function allowlistPackages(): string[] {
  return KNOWN_APPS.filter((app) => app.sourceKind !== 'sms_app').map((app) => app.packageName);
}

export function syncAllowlist(): void {
  NotificationListener.setAllowlist(allowlistPackages());
}

/**
 * Moves queued notifications from the native queue into kharcha.db (ARCHITECTURE §3). Rows are
 * acknowledged only after the pipeline stored them, so a crash re-delivers instead of losing.
 * Concurrent calls share one run.
 */
export function drainQueue(pipeline: Pipeline): Promise<ProcessResult[]> {
  draining ??= (async () => {
    const results: ProcessResult[] = [];
    try {
      for (;;) {
        const rows = await NotificationListener.readQueue(100);
        if (rows.length === 0) break;
        for (const row of rows) {
          let payload: RawNotificationPayload | null = null;
          try {
            payload = JSON.parse(row.payload) as RawNotificationPayload;
          } catch {
            payload = null; // unreadable row: drop it rather than block the queue
          }
          if (payload) results.push(...(await pipeline.ingest(payload, row.id)));
          await NotificationListener.ackQueue([row.id]);
        }
      }
    } finally {
      draining = null;
    }
    return results;
  })();
  return draining;
}
