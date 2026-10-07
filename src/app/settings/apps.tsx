import { Stack } from 'expo-router';
import { View } from 'react-native';

import { Card, Divider, ListItem, Screen, T } from '@/components/ui';
import { KNOWN_APPS } from '@/services/notification/knownApps';
import { BANK_PROFILES } from '@/services/parser/profiles';
import type { SourceKind } from '@/types';

const GROUPS: { kind: SourceKind; title: string; icon: string }[] = [
  { kind: 'upi_app', title: 'UPI apps', icon: 'cellphone-nfc' },
  { kind: 'sms_app', title: 'SMS apps (bank SMS)', icon: 'message-text-outline' },
  { kind: 'bank_app', title: 'Bank apps', icon: 'bank-outline' },
  { kind: 'card_app', title: 'Card apps', icon: 'credit-card-outline' },
  { kind: 'wallet_app', title: 'Wallets', icon: 'wallet-outline' },
  { kind: 'merchant_app', title: 'Merchant apps', icon: 'storefront-outline' },
];

export default function AppsScreen() {
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Supported apps' }} />
      <T color="muted">
        Any app whose notification mentions an amount is read, so unlisted banks and apps work too. Listed apps get better accuracy.
      </T>
      {GROUPS.map((g) => (
        <Card key={g.kind}>
          <T variant="heading">{g.title}</T>
          {KNOWN_APPS.filter((a) => a.sourceKind === g.kind).map((a, i) => (
            <View key={a.packageName}>
              {i > 0 ? <Divider /> : null}
              <ListItem icon={g.icon} title={a.name} subtitle={a.packageName} />
            </View>
          ))}
        </Card>
      ))}
      <Card>
        <T variant="heading">Banks recognised in SMS</T>
        <T color="muted">{BANK_PROFILES.map((b) => b.institution).join(', ')}</T>
      </Card>
    </Screen>
  );
}
