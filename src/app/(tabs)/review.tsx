import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { amountLabel } from '@/components/TransactionRow';
import { space } from '@/components/theme';
import { Button, Card, Chip, EmptyState, Row, Screen, T } from '@/components/ui';
import { rawEventRepo, transactionRepo } from '@/database/repositories';
import { useCategories, useQuery } from '@/hooks/useQuery';
import { findKnownApp } from '@/services/notification/knownApps';
import { normalizeNotification } from '@/services/notification/normalize';
import { syncNotifications, write } from '@/services/app';
import { syncSmsInbox } from '@/services/sms';
import { confirmTransaction, resolveDuplicate, resolveFailed, setCategory } from '@/services/transactions/actions';
import type { RawEvent, Transaction } from '@/types';

import { SmsReader } from '../../../modules/sms-reader';

const QUICK = ['food', 'transport', 'shopping', 'bills', 'personal'];

const when = (ts: number) => new Date(ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const appName = (pkg: string | null) => (pkg ? (findKnownApp(pkg)?.name ?? pkg) : 'Manual');

function elapsedLabel(timestamp: number, now: number): string {
  if (!timestamp) return 'Not synced yet';
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 10) return 'Last synced just now';
  if (seconds < 60) return `Last synced ${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Last synced ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `Last synced ${hours}h ago`;
}

function ReviewCard({ tx }: { tx: Transaction }) {
  const categories = useCategories();
  const reasons = tx.reviewReasons;
  const pick = (categoryId: string) => write((db) => setCategory(db, tx.id, { categoryId, subcategoryId: null }));
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <T variant="title">{amountLabel(tx)}</T>
          <T>{tx.merchantName ?? tx.payeeVpa ?? 'Unknown merchant'}</T>
          <T variant="caption" color="muted">{when(tx.occurredAt)} · via {appName(tx.sourceApp)}</T>
        </View>
        <Chip label="Details" onPress={() => router.push(`/transaction/${tx.id}`)} />
      </Row>

      {reasons.includes('possible_duplicate') ? (
        <View style={{ gap: space.sm }}>
          <T color="warning">This looks like a payment already recorded from another app.</T>
          <Row>
            <Button kind="secondary" label="Duplicate — remove" onPress={() => write((db) => resolveDuplicate(db, tx.id, true))} style={{ flex: 1 }} />
            <Button kind="secondary" label="Separate payment" onPress={() => write((db) => resolveDuplicate(db, tx.id, false))} style={{ flex: 1 }} />
          </Row>
        </View>
      ) : null}

      {reasons.includes('payment_failed') ? (
        <View style={{ gap: space.sm }}>
          <T color="warning">A “payment failed” notice arrived for this payment.</T>
          <Row>
            <Button kind="secondary" label="It failed" onPress={() => write((db) => resolveFailed(db, tx.id, true))} style={{ flex: 1 }} />
            <Button kind="secondary" label="It went through" onPress={() => write((db) => resolveFailed(db, tx.id, false))} style={{ flex: 1 }} />
          </Row>
        </View>
      ) : null}

      {reasons.includes('possible_transfer') ? (
        <View style={{ gap: space.sm }}>
          <T color="muted">Paid to a personal UPI ID. Was this money sent to family or yourself?</T>
          <Row>
            <Button kind="secondary" label="It's a transfer" onPress={() => write((db) => setCategory(db, tx.id, { categoryId: 'transfers', subcategoryId: 'transfers.family', type: 'transfer' }))} style={{ flex: 1 }} />
          </Row>
        </View>
      ) : null}

      {tx.type === 'expense' && (reasons.includes('uncategorized') || reasons.includes('possible_transfer')) ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {QUICK.map((id) => {
            const c = categories.byId.get(id);
            return c ? <Chip key={id} label={c.name.split(' ')[0] as string} icon={c.icon} onPress={() => pick(id)} /> : null;
          })}
          <Chip label="More…" onPress={() => router.push(`/transaction/${tx.id}`)} />
        </View>
      ) : null}

      {!reasons.some((r) => ['possible_duplicate', 'payment_failed', 'uncategorized', 'possible_transfer'].includes(r)) ? (
        <Row>
          <T variant="caption" color="muted" style={{ flex: 1 }}>
            {reasons.includes('low_confidence') ? 'Not fully sure this was read correctly.' : 'Merchant unknown.'} Check the details.
          </T>
          <Button kind="secondary" label="Looks right" onPress={() => write((db) => confirmTransaction(db, tx.id))} />
        </Row>
      ) : null}
    </Card>
  );
}

function FailedEventCard({ event }: { event: RawEvent }) {
  const ev = event.payload ? normalizeNotification(event.payload, event.id)[event.messageIndex] : undefined;
  return (
    <Card>
      <T variant="label" color="muted">Couldn’t read this notification · {appName(event.packageName)} · {when(event.postedAt)}</T>
      <T>{ev ? `${ev.title}\n${ev.body}` : 'No text kept'}</T>
      <Row>
        <Button kind="secondary" label="Add manually" onPress={() => router.push('/add')} style={{ flex: 1 }} />
        <Button kind="ghost" label="Dismiss" onPress={() => write((db) => rawEventRepo.update(db, { ...event, status: 'ignored' }))} style={{ flex: 1 }} />
      </Row>
    </Card>
  );
}

/** One card for all notifications Android hid (Android 15+ hides likely OTPs from listeners). */
function HiddenSummaryCard({ count }: { count: number }) {
  return (
    <Card>
      <T variant="heading">Android hid {count} notification{count === 1 ? '' : 's'}</T>
      <T color="muted">
        Android hides these notification copies from Kharcha. Tap Sync now above; when bank SMS access is enabled, Kharcha also checks the SMS inbox for the transaction details. These are often OTPs, not payments.
      </T>
      <Row>
        <Button kind="secondary" label="Add manually" onPress={() => router.push('/add')} style={{ flex: 1 }} />
        <Button kind="ghost" label="Dismiss all" onPress={() => write((db) => rawEventRepo.changeStatus(db, 'redacted', 'ignored'))} style={{ flex: 1 }} />
      </Row>
    </Card>
  );
}

export default function ReviewScreen() {
  const { data: txs = [] } = useQuery((db) => transactionRepo.list(db, { needsReview: true, limit: 200 }));
  const { data: failed = [] } = useQuery((db) => rawEventRepo.byStatus(db, ['failed'], 50));
  const { data: hidden = 0 } = useQuery((db) => rawEventRepo.countByStatus(db, 'redacted'));
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(() => SmsReader.getLastSyncAt());
  const [now, setNow] = useState(() => Date.now());
  const total = txs.length + failed.length;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const syncNow = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      await syncNotifications();
      await syncSmsInbox();
      setLastSyncedAt(SmsReader.getLastSyncAt() || Date.now());
      setNow(Date.now());
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Screen>
      <Card>
        <T variant="label" color="muted">Check again for hidden notifications and new bank SMS.</T>
        <Button kind="secondary" label={syncing ? 'Syncing…' : 'Sync now'} onPress={() => void syncNow()} loading={syncing} />
        <T variant="caption" color="faint">{syncing ? 'Checking now…' : elapsedLabel(lastSyncedAt, now)}</T>
      </Card>
      {total === 0 && hidden === 0 ? (
        <EmptyState icon="check-circle-outline" title="All caught up" body="Nothing needs your attention." />
      ) : total > 0 ? (
        <T variant="heading">{total} {total === 1 ? 'item needs' : 'items need'} your attention</T>
      ) : null}
      {txs.map((tx) => (
        <ReviewCard key={tx.id} tx={tx} />
      ))}
      {failed.map((e) => (
        <FailedEventCard key={e.id} event={e} />
      ))}
      {hidden > 0 ? <HiddenSummaryCard count={hidden} /> : null}
    </Screen>
  );
}
