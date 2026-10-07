import { router, type Href } from 'expo-router';
import { AppState, View } from 'react-native';
import { useEffect, useState } from 'react';

import { space } from '@/components/theme';
import { Card, Divider, ListItem, Screen, T } from '@/components/ui';
import type { IconName } from '@/components/ui';

import { NotificationListener, isAvailable } from '../../../modules/notification-listener';
import { isAvailable as smsReaderAvailable } from '../../../modules/sms-reader';
import { requestSmsPermission, smsPermissionGranted, syncSmsInbox } from '@/services/sms';

const ITEMS: { title: string; subtitle: string; icon: IconName; href: Href }[][] = [
  [
    { title: 'Budgets', subtitle: 'Monthly total and per category', icon: 'wallet-outline', href: '/settings/budgets' },
    { title: 'Recurring payments', subtitle: 'Rent, EMIs, subscriptions', icon: 'calendar-sync-outline', href: '/settings/recurring' },
    { title: 'Accounts', subtitle: 'Banks, cards, wallets, cash', icon: 'bank-outline', href: '/settings/accounts' },
  ],
  [
    { title: 'Merchant & app rules', subtitle: 'How payments get categorized', icon: 'tag-outline', href: '/settings/rules' },
    { title: 'Categories', subtitle: 'Create, rename, delete', icon: 'shape-outline', href: '/settings/categories' },
    { title: 'Supported apps', subtitle: 'Apps Kharcha reads payments from', icon: 'apps', href: '/settings/apps' },
  ],
  [
    { title: 'Export, backup & restore', subtitle: 'CSV, JSON, delete all data', icon: 'database-export-outline', href: '/settings/data' },
    { title: 'Privacy', subtitle: 'What Kharcha reads and stores', icon: 'shield-lock-outline', href: '/settings/privacy' },
    { title: 'Captured notifications', subtitle: 'Debug: what the listener recorded', icon: 'bug-outline', href: '/settings/debug' },
  ],
];

export default function SettingsScreen() {
  const status = NotificationListener.getStatus();
  const [smsGranted, setSmsGranted] = useState(smsPermissionGranted());
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => state === 'active' && setSmsGranted(smsPermissionGranted()));
    return () => sub.remove();
  }, []);
  const enableSms = async () => {
    const granted = await requestSmsPermission();
    setSmsGranted(granted || smsPermissionGranted());
    if (granted) void syncSmsInbox().catch(() => undefined);
  };
  const ago = status.lastEventAt ? new Date(status.lastEventAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'never';
  return (
    <Screen>
      <Card>
        <ListItem
          icon={status.permissionGranted ? 'bell-check-outline' : 'bell-off-outline'}
          title={!isAvailable ? 'Listener not in this build' : status.permissionGranted ? (status.connected ? 'Automatic tracking is on' : 'Access granted, reconnecting…') : 'Notification access is off'}
          subtitle={`Last captured: ${ago}`}
          onPress={() => NotificationListener.openPermissionSettings()}
        />
        <Divider />
        <ListItem
          icon={smsGranted ? 'message-check-outline' : 'message-alert-outline'}
          title={smsGranted ? 'Bank SMS access is on' : 'Enable bank SMS fallback'}
          subtitle={smsGranted ? 'Reads new money-looking SMS from the inbox' : 'Needed when UPI notifications hide the amount'}
          right={!smsReaderAvailable ? <T color="muted">Android only</T> : smsGranted ? <T color="positive">On</T> : <T color="primary">Enable</T>}
          onPress={smsReaderAvailable && !smsGranted ? enableSms : undefined}
        />
        <Divider />
        <ListItem
          icon="battery-heart-outline"
          title="Battery settings"
          subtitle="Set Kharcha to Unrestricted so tracking isn't stopped"
          onPress={() => NotificationListener.openBatterySettings()}
        />
      </Card>
      {ITEMS.map((group, gi) => (
        <Card key={gi}>
          {group.map((item, i) => (
            <View key={item.title}>
              {i > 0 ? <Divider /> : null}
              <ListItem icon={item.icon} title={item.title} subtitle={item.subtitle} onPress={() => router.push(item.href)} />
            </View>
          ))}
        </Card>
      ))}
      <T variant="caption" color="faint" style={{ textAlign: 'center', marginTop: space.md }}>Kharcha 1.0 · all data stays on this phone</T>
    </Screen>
  );
}
