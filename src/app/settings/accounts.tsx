import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { Button, Card, Chip, Divider, EmptyState, Field, ListItem, Row, Screen, T } from '@/components/ui';
import { accountRepo } from '@/database/repositories';
import { useQuery } from '@/hooks/useQuery';
import { write } from '@/services/app';
import type { Account, AccountType } from '@/types';
import { newId } from '@/utils/ids';

const TYPES: { type: AccountType; label: string; icon: string }[] = [
  { type: 'bank', label: 'Bank account', icon: 'bank-outline' },
  { type: 'credit_card', label: 'Credit card', icon: 'credit-card-outline' },
  { type: 'wallet', label: 'Wallet', icon: 'wallet-outline' },
  { type: 'upi_lite', label: 'UPI Lite', icon: 'lightning-bolt-outline' },
  { type: 'cash', label: 'Cash', icon: 'cash' },
];

export default function AccountsScreen() {
  const { data: accounts = [] } = useQuery((db) => accountRepo.list(db));
  const [editing, setEditing] = useState<Account | 'new' | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('bank');
  const [last4, setLast4] = useState('');

  const open = (a: Account | null) => {
    setEditing(a ?? 'new');
    setName(a?.name ?? '');
    setType(a?.type ?? 'bank');
    setLast4(a?.last4 ?? '');
  };

  const save = async () => {
    if (!name.trim()) return;
    const now = Date.now();
    const a = editing && editing !== 'new' ? editing : null;
    const digits = last4.replace(/\D/g, '').slice(-4);
    await write((db) =>
      accountRepo.upsert(db, {
        id: a?.id ?? newId(now),
        name: name.trim(),
        type,
        institution: a?.institution ?? null,
        last4: digits || null,
        isDefault: a?.isDefault ?? accounts.length === 0,
        createdAt: a?.createdAt ?? now,
        updatedAt: now,
        deletedAt: null,
      }),
    );
    setEditing(null);
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Accounts' }} />
      <T color="muted">
        Add the last 4 digits shown in your bank SMS (e.g. “A/c XX1234”) and Kharcha will link those transactions to the account. Never enter full card numbers, PINs or passwords.
      </T>
      {editing ? (
        <Card>
          <Field label="Name" value={name} onChangeText={setName} placeholder="HDFC Savings" />
          <Row style={{ flexWrap: 'wrap' }}>
            {TYPES.map((t) => (
              <Chip key={t.type} label={t.label} icon={t.icon} selected={type === t.type} onPress={() => setType(t.type)} />
            ))}
          </Row>
          {type !== 'cash' ? <Field label="Last 4 digits (optional)" value={last4} onChangeText={setLast4} keyboardType="number-pad" maxLength={4} /> : null}
          <Row>
            <Button kind="secondary" label="Cancel" onPress={() => setEditing(null)} style={{ flex: 1 }} />
            <Button label="Save" onPress={save} style={{ flex: 1 }} />
          </Row>
        </Card>
      ) : (
        <Button icon="plus" label="Add account" onPress={() => open(null)} />
      )}
      {accounts.length === 0 && !editing ? <EmptyState icon="bank-outline" title="No accounts" body="Optional. Transactions work without accounts." /> : null}
      <Card style={{ display: accounts.length ? 'flex' : 'none' }}>
        {accounts.map((a, i) => (
          <View key={a.id}>
            {i > 0 ? <Divider /> : null}
            <ListItem
              icon={TYPES.find((t) => t.type === a.type)?.icon ?? 'bank'}
              title={a.name}
              subtitle={[TYPES.find((t) => t.type === a.type)?.label, a.last4 ? `••${a.last4}` : null, a.isDefault ? 'default' : null].filter(Boolean).join(' · ')}
              onPress={() => open(a)}
              right={
                <Chip label="Delete" onPress={() =>
                  Alert.alert(`Delete ${a.name}?`, 'Transactions keep their amounts but lose the account link.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => write((db) => accountRepo.remove(db, a.id, Date.now())) },
                  ])
                } />
              }
            />
          </View>
        ))}
      </Card>
    </Screen>
  );
}
