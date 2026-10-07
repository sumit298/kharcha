import * as Crypto from 'expo-crypto';

import { openExpoDatabase } from '@/database/adapters/expo';
import { prepareDatabase } from '@/database/bootstrap';
import type { SqlDatabase } from '@/database/sql';
import { drainQueue, syncAllowlist } from '@/services/notification/drain';
import { Pipeline } from '@/services/pipeline/pipeline';
import { bumpData } from '@/store/app';
import { configureRandomSource } from '@/utils/ids';

let db: SqlDatabase | null = null;
let pipeline: Pipeline | null = null;

export function getDb(): SqlDatabase {
  if (!db) throw new Error('Database not ready');
  return db;
}

export function getPipeline(): Pipeline {
  if (!pipeline) throw new Error('Pipeline not ready');
  return pipeline;
}

/** App start: random source for IDs, open + migrate + seed, then process queued notifications. */
export async function initApp(): Promise<void> {
  if (db) return;
  configureRandomSource((bytes) => {
    Crypto.getRandomValues(bytes);
  });
  const opened = await openExpoDatabase();
  await prepareDatabase(opened);
  db = opened;
  pipeline = new Pipeline(opened);
  syncAllowlist();
  await pipeline.reprocessOutdated();
  await syncNotifications();
}

/** Drains the native queue; call on start, resume and the native "queueChanged" event. */
export async function syncNotifications(): Promise<number> {
  if (!pipeline) return 0;
  const results = await drainQueue(pipeline);
  if (results.length > 0) bumpData();
  return results.length;
}

/** Runs a write and tells screens to reload. */
export async function write<T>(fn: (db: SqlDatabase) => Promise<T>): Promise<T> {
  const result = await fn(getDb());
  bumpData();
  return result;
}
