import { Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { space } from '@/components/theme';
import { Button, Card, EmptyState, Row, Screen, T } from '@/components/ui';
import { rawEventRepo } from '@/database/repositories';
import { useQuery } from '@/hooks/useQuery';
import { getPipeline, syncNotifications, write } from '@/services/app';
import { findKnownApp } from '@/services/notification/knownApps';
import { normalizeNotification } from '@/services/notification/normalize';
import { syncSmsInbox } from '@/services/sms';

import { NotificationListener } from '../../../modules/notification-listener';

/**
 * Debug "raw notification recorder": what the listener captured and what the pipeline decided.
 * Shown only on this phone; use it to turn real formats into anonymized test fixtures.
 */
export default function DebugScreen() {
  const { data: events = [] } = useQuery((db) => rawEventRepo.recent(db, 100));
  const status = NotificationListener.getStatus();
  const [syncing, setSyncing] = useState(false);

  const syncNow = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      await syncNotifications();
      await syncSmsInbox();
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Captured notifications' }} />
      <Card>
        <T variant="label" color="muted">
          Permission {status.permissionGranted ? 'granted' : 'off'} · listener {status.connected ? 'connected' : 'not connected'} · {status.pending} queued
        </T>
        <Row>
          <Button
            kind="secondary"
            label={syncing ? 'Syncing…' : 'Sync now'}
            onPress={() => void syncNow()}
            loading={syncing}
            style={{ flex: 1 }}
          />
          <Button kind="secondary" label="Re-process" onPress={() => void write(() => getPipeline().reprocessOutdated())} style={{ flex: 1 }} />
        </Row>
        <T variant="caption" color="faint">Never share screenshots of this screen: it shows real notification text.</T>
      </Card>
      {events.length === 0 ? <EmptyState icon="bell-outline" title="Nothing captured yet" /> : null}
      {events.map((e) => {
        const ev = e.payload ? normalizeNotification(e.payload, e.id)[e.messageIndex] : undefined;
        return (
          <Card key={e.id}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T variant="label">{findKnownApp(e.packageName)?.name ?? e.appName ?? e.packageName}</T>
              <T variant="caption" color={e.status === 'parsed' || e.status === 'merged' ? 'positive' : e.status === 'failed' ? 'danger' : 'muted'}>
                {e.status}{e.error ? ` · ${e.error}` : ''}
              </T>
            </Row>
            <View style={{ gap: space.xs }}>
              <T variant="caption" color="faint">{new Date(e.postedAt).toLocaleString('en-IN')} · {e.parserId ?? 'no parser'}</T>
              <T>{ev ? `${ev.title}\n${ev.body}` : '(text not kept)'}</T>
            </View>
          </Card>
        );
      })}
    </Screen>
  );
}
