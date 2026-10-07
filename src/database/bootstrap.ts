import { categoryRepo } from './repositories';
import { runMigrations } from './migrations';
import type { SqlDatabase } from './sql';

/** Migrates, seeds built-in categories and purges text that must not be kept. Safe on every start. */
export async function prepareDatabase(db: SqlDatabase, now = Date.now()): Promise<void> {
  await runMigrations(db);
  await categoryRepo.seedDefaults(db, now);
  // Earlier builds kept the text of notifications without any amount (e.g. personal SMS).
  await db.runAsync("UPDATE raw_events SET payload = NULL WHERE status = 'not_financial' AND error IN ('no_amount', 'otp')");
}
