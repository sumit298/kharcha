import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { Stack, router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Alert } from 'react-native';

import { Button, Card, Screen, T } from '@/components/ui';
import { categoryRepo, deleteAllData, transactionRepo } from '@/database/repositories';
import { prepareDatabase } from '@/database/bootstrap';
import { getDb, write } from '@/services/app';
import { createBackup, parseBackup, restoreBackup, transactionsToCsv } from '@/services/data/exportImport';
import { dayKey } from '@/utils/dates';

import { NotificationListener } from '../../../modules/notification-listener';
import { SmsReader } from '../../../modules/sms-reader';

/** Today's date for export file names (called from handlers, not during render). */
const stamp = () => dayKey(Date.now());

async function shareText(name: string, text: string, mimeType: string) {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(text);
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: name });
}

export default function DataScreen() {
  const [busy, setBusy] = useState<string | null>(null);
  const run = (label: string, fn: () => Promise<void>) => async () => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      Alert.alert('Something went wrong', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const exportCsv = run('csv', async () => {
    const db = getDb();
    const [txs, cats] = await Promise.all([transactionRepo.list(db), categoryRepo.list(db)]);
    await shareText(`kharcha-transactions-${stamp()}.csv`, transactionsToCsv(txs, cats), 'text/csv');
  });

  const exportJson = run('json', async () => {
    const backup = await createBackup(getDb());
    await shareText(`kharcha-backup-${stamp()}.json`, JSON.stringify(backup), 'application/json');
  });

  const restore = run('restore', async () => {
    const picked = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
    if (picked.canceled || !picked.assets[0]) return;
    const backup = parseBackup(new File(picked.assets[0].uri).textSync());
    const count = backup.tables.transactions?.length ?? 0;
    await new Promise<void>((resolve) =>
      Alert.alert('Restore backup?', `This replaces everything on this phone with the backup (${count} transactions).`, [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve() },
        { text: 'Restore', style: 'destructive', onPress: () => void write((db) => restoreBackup(db, backup)).then(() => resolve()) },
      ]),
    );
  });

  const wipe = () =>
    Alert.alert('Delete all data?', 'Every transaction, rule, budget and captured notification on this phone is deleted. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete everything',
        style: 'destructive',
        onPress: () =>
          void write(async (db) => {
            await deleteAllData(db);
            await NotificationListener.clearQueue();
            // Start the direct-SMS experiment from this moment; do not re-import older inbox rows.
            SmsReader.setLastSyncAt(Date.now());
            await prepareDatabase(db);
          }).then(() => router.replace('/onboarding')),
      },
    ]);

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Export, backup & restore' }} />
      <Card>
        <T variant="heading">Export</T>
        <T color="muted">Your data is yours. Exports are only shared where you choose.</T>
        <Button kind="secondary" icon="file-delimited-outline" label="Export transactions (CSV)" onPress={exportCsv} loading={busy === 'csv'} />
        <Button kind="secondary" icon="code-json" label="Full backup (JSON)" onPress={exportJson} loading={busy === 'json'} />
      </Card>
      <Card>
        <T variant="heading">Restore</T>
        <T color="muted">Restore a Kharcha JSON backup, e.g. after reinstalling or moving to a new phone.</T>
        <Button kind="secondary" icon="database-import-outline" label="Restore from backup" onPress={restore} loading={busy === 'restore'} />
      </Card>
      <Card>
        <T variant="heading">Delete all data</T>
        <T color="muted">Removes everything Kharcha stored on this phone.</T>
        <Button kind="danger" icon="delete-forever-outline" label="Delete all data" onPress={wipe} />
      </Card>
    </Screen>
  );
}
