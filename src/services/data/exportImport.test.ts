import { openNodeDatabase } from '@/database/adapters/node';
import { prepareDatabase } from '@/database/bootstrap';
import { categoryRepo, settingsRepo, transactionRepo } from '@/database/repositories';
import { at, makeTransaction } from '@/domain/analytics/testFactories';

import { createBackup, parseBackup, restoreBackup, transactionsToCsv } from './exportImport';

describe('export', () => {
  it('writes CSV with signed rupee amounts and escapes cells', () => {
    const csv = transactionsToCsv(
      [makeTransaction({ id: 't1', amountMinor: 12450, merchantName: 'Tea, "Corner"', occurredAt: at(2026, 10, 1, 9, 5), categoryId: 'food' })],
      [{ id: 'food', name: 'Food & Dining' } as never],
    );
    const [header, row] = csv.trim().split('\n');
    expect(header).toMatch(/^date,amount,currency,type,merchant/);
    expect(row).toBe('2026-10-01 09:05,-124.50,INR,expense,"Tea, ""Corner""",Food & Dining,,upi,notification,com.example.upi,,confirmed,,t1');
  });

  it('round-trips a full backup', async () => {
    const db = openNodeDatabase();
    await prepareDatabase(db, 0);
    await transactionRepo.insert(db, makeTransaction({ id: 'keep', reviewReasons: ['uncategorized'] }));
    await settingsRepo.set(db, 'onboarded', true, 0);
    const backup = parseBackup(JSON.stringify(await createBackup(db)));

    const fresh = openNodeDatabase();
    await prepareDatabase(fresh, 0);
    await restoreBackup(fresh, backup);
    expect(await transactionRepo.get(fresh, 'keep')).toMatchObject({ reviewReasons: ['uncategorized'] });
    expect(await settingsRepo.get(fresh, 'onboarded', false)).toBe(true);
    expect((await categoryRepo.list(fresh)).length).toBe((await categoryRepo.list(db)).length);
  });

  it('rejects files that are not backups', () => {
    expect(() => parseBackup('{"hello":1}')).toThrow('not a Kharcha backup');
  });
});
