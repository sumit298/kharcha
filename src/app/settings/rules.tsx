import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { CategoryPicker, type CategoryChoice } from '@/components/CategoryPicker';
import { space } from '@/components/theme';
import { Button, Card, Chip, Divider, EmptyState, Field, ListItem, Row, Screen, T } from '@/components/ui';
import { merchantKey } from '@/domain/merchants/canonical';
import { KNOWN_MERCHANTS } from '@/domain/merchants/dictionary';
import { ruleRepo } from '@/database/repositories';
import { useCategories, useQuery } from '@/hooks/useQuery';
import { write } from '@/services/app';
import type { MerchantRule, PaymentMethod, RuleMatchField } from '@/types';
import { newId } from '@/utils/ids';

const METHODS: (PaymentMethod | null)[] = [null, 'upi', 'credit_card', 'debit_card', 'cash', 'wallet', 'netbanking'];
const FIELDS: { field: RuleMatchField; label: string }[] = [
  { field: 'merchant', label: 'Merchant name' },
  { field: 'vpa', label: 'UPI ID' },
  { field: 'source_app', label: 'App package' },
];

export default function RulesScreen() {
  const categories = useCategories();
  const { data: rules = [] } = useQuery((db) => ruleRepo.list(db));
  const [open, setOpen] = useState<MerchantRule | 'new' | null>(null);
  const [name, setName] = useState('');
  const [field, setField] = useState<RuleMatchField>('merchant');
  const [choice, setChoice] = useState<CategoryChoice | null>(null);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [notes, setNotes] = useState('');
  const [isTransfer, setIsTransfer] = useState(false);
  const [showBuiltin, setShowBuiltin] = useState(false);

  const edit = (r: MerchantRule | null) => {
    setOpen(r ?? 'new');
    setName(r?.merchantName ?? '');
    setField(r?.matchField ?? 'merchant');
    setChoice(r?.categoryId ? { categoryId: r.categoryId, subcategoryId: r.subcategoryId } : null);
    setMethod(r?.defaultPaymentMethod ?? null);
    setNotes(r?.notes ?? '');
    setIsTransfer(r?.transactionType === 'transfer');
  };

  const save = async () => {
    if (!name.trim()) return;
    const now = Date.now();
    const existing = open && open !== 'new' ? open : null;
    const pattern = field === 'merchant' ? merchantKey(name) : name.trim().toLowerCase();
    await write((db) =>
      ruleRepo.upsert(db, {
        id: existing?.id ?? newId(now),
        merchantName: name.trim(),
        matchField: field,
        matchType: field === 'merchant' ? 'contains' : 'exact',
        pattern,
        categoryId: choice?.categoryId ?? null,
        subcategoryId: choice?.subcategoryId ?? null,
        transactionType: isTransfer ? 'transfer' : null,
        defaultPaymentMethod: method,
        accountId: existing?.accountId ?? null,
        notes: notes.trim() || null,
        origin: existing?.origin === 'learned' ? 'learned' : 'user',
        enabled: true,
        hitCount: existing?.hitCount ?? 0,
        lastMatchedAt: existing?.lastMatchedAt ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        deletedAt: null,
      }),
    );
    setOpen(null);
  };

  const label = (r: { categoryId: string | null; subcategoryId: string | null }) =>
    [categories.name(r.categoryId), r.subcategoryId ? categories.name(r.subcategoryId) : null].filter(Boolean).join(' › ');

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Merchant & app rules' }} />
      <T color="muted">Rules run before the built-in list. Kharcha also creates “learned” rules when you change a category.</T>
      {open ? (
        <Card>
          <Field label="Merchant or app name" value={name} onChangeText={setName} placeholder="e.g. Raju Tea Stall" />
          <T variant="label" color="muted">Match on</T>
          <Row style={{ flexWrap: 'wrap' }}>
            {FIELDS.map((f) => (
              <Chip key={f.field} label={f.label} selected={field === f.field} onPress={() => setField(f.field)} />
            ))}
          </Row>
          <T variant="label" color="muted">Category</T>
          <CategoryPicker categories={categories} value={choice} onChange={setChoice} kinds={['expense', 'income', 'transfer']} />
          <Chip label="Always a transfer (not spending)" selected={isTransfer} onPress={() => setIsTransfer(!isTransfer)} />
          <T variant="label" color="muted">Default payment method</T>
          <Row style={{ flexWrap: 'wrap' }}>
            {METHODS.map((m) => (
              <Chip key={m ?? 'none'} label={m ?? 'Any'} selected={method === m} onPress={() => setMethod(m)} />
            ))}
          </Row>
          <Field label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional" />
          <Row>
            <Button kind="secondary" label="Cancel" onPress={() => setOpen(null)} style={{ flex: 1 }} />
            <Button label="Save rule" onPress={save} style={{ flex: 1 }} />
          </Row>
        </Card>
      ) : (
        <Button icon="plus" label="Add merchant/app rule" onPress={() => edit(null)} />
      )}
      {rules.length === 0 ? <EmptyState icon="tag-outline" title="No custom rules yet" /> : null}
      <Card style={{ display: rules.length ? 'flex' : 'none' }}>
        {rules.map((r, i) => (
          <View key={r.id}>
            {i > 0 ? <Divider /> : null}
            <ListItem
              icon={r.origin === 'learned' ? 'school-outline' : 'tag-outline'}
              title={r.merchantName}
              subtitle={`${label(r)}${r.transactionType === 'transfer' ? ' · transfer' : ''} · ${r.origin} · used ${r.hitCount}×`}
              onPress={() => edit(r)}
              right={
                <Chip
                  label="Delete"
                  onPress={() =>
                    Alert.alert(`Delete rule for ${r.merchantName}?`, undefined, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: () => write((db) => ruleRepo.remove(db, r.id, Date.now())) },
                    ])
                  }
                />
              }
            />
          </View>
        ))}
      </Card>
      <Button kind="ghost" label={showBuiltin ? 'Hide built-in merchants' : `Show ${KNOWN_MERCHANTS.length} built-in merchants`} onPress={() => setShowBuiltin(!showBuiltin)} />
      {showBuiltin ? (
        <Card>
          {KNOWN_MERCHANTS.map((m) => (
            <Row key={m.name} style={{ justifyContent: 'space-between', minHeight: 32, gap: space.md }}>
              <T>{m.name}</T>
              <T variant="caption" color="muted" style={{ flexShrink: 1, textAlign: 'right' }}>{label(m)}{m.type === 'transfer' ? ' · transfer' : ''}</T>
            </Row>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
