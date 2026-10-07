import { PermissionsAndroid, Platform } from 'react-native';

import type { RawNotificationPayload } from '@/types';
import { bumpData } from '@/store/app';

import { getPipeline } from './app';
import { SmsReader } from '../../modules/sms-reader';

const SMS_INBOX_PACKAGE = 'app.kharcha.sms-inbox';
const INITIAL_LOOKBACK_MS = 30 * 86_400_000;
const BATCH_SIZE = 200;

let syncing: Promise<number> | null = null;

export function smsPermissionGranted(): boolean {
  return Platform.OS === 'android' && SmsReader.hasReadPermission();
}

export async function requestSmsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android' || !SmsReader.isAvailable) return false;
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS, {
    title: 'Allow Kharcha to read bank SMS',
    message: 'Kharcha reads recent bank alerts on this phone to record payments when UPI notifications hide the amount. Personal messages are filtered and nothing is uploaded.',
    buttonPositive: 'Allow',
    buttonNegative: 'Not now',
  });
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

function payloadFor(row: { id: number; address: string; body: string; date: number }): RawNotificationPayload {
  const messageId = String(row.id);
  return {
    schemaVersion: 1,
    key: `${SMS_INBOX_PACKAGE}:${messageId}`,
    packageName: SMS_INBOX_PACKAGE,
    appName: 'Bank SMS (inbox)',
    postedAt: row.date,
    when: row.date,
    channelId: null,
    category: 'msg',
    template: 'android.app.Notification$MessagingStyle',
    flags: 0,
    isGroupSummary: false,
    isOngoing: false,
    title: row.address,
    titleBig: null,
    text: row.body,
    bigText: null,
    subText: null,
    summaryText: null,
    infoText: null,
    conversationTitle: row.address,
    textLines: [],
    messages: [{ sender: row.address, text: row.body, timestamp: row.date, messageId }],
  };
}

/** Imports new, money-looking SMS rows through the same pipeline as notifications. */
export function syncSmsInbox(): Promise<number> {
  syncing ??= (async () => {
    if (!smsPermissionGranted()) return 0;

    const pipeline = getPipeline();
    let since = SmsReader.getLastSyncAt();
    if (!since) since = Date.now() - INITIAL_LOOKBACK_MS;

    let imported = 0;
    let changed = false;
    for (;;) {
      const rows = await SmsReader.readInbox(since, BATCH_SIZE);
      if (rows.length === 0) {
        SmsReader.setLastSyncAt(Date.now());
        break;
      }

      for (const row of rows) {
        await pipeline.ingest(payloadFor(row));
        since = Math.max(since, row.date);
        SmsReader.setLastSyncAt(since);
        imported += 1;
        changed = true;
      }
      if (rows.length < BATCH_SIZE) break;
    }

    if (changed) bumpData();
    return imported;
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}
