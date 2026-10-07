import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { CategoryPicker, type CategoryChoice } from '@/components/CategoryPicker';
import { space } from '@/components/theme';
import { Button, Card, Chip, Divider, EmptyState, Field, ListItem, Row, Screen } from '@/components/ui';
import { recurringRepo } from '@/database/repositories';
import { useCategories, useQuery } from '@/hooks/useQuery';
import { write } from '@/services/app';
import { markRecurringPaid } from '@/services/transactions/actions';
import type { RecurrenceFrequency, RecurringTransaction } from '@/types';
import { addDays, startOfDay } from '@/utils/dates';
import { newId } from '@/utils/ids';
import { formatMoney, parseAmountInput } from '@/utils/money';

const FREQS: RecurrenceFrequency[] = ['weekly', 'monthly', 'quarterly', 'yearly'];

function nextDateForDay(day: number, now: number): number {
  const d = new Date(now);
  const thisMonth = new Date(d.getFullYear(), d.getMonth(), Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  if (thisMonth.getTime() >= startOfDay(now)) return thisMonth.getTime();
  return new Date(d.getFullYear(), d.getMonth() + 1, Math.min(day, new Date(d.getFullYear(), d.getMonth() + 2, 0).getDate())).getTime();
}

export default function RecurringScreen() {
  const categories = useCategories();
  const { data: items = [] } = useQuery((db) => recurringRepo.list(db));
  const [editing, setEditing] = useState<RecurringTransaction | null>(null);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [freq, setFreq] = useState<RecurrenceFrequency>('monthly');
  const [day, setDay] = useState('1');
  const [choice, setChoice] = useState<CategoryChoice | null>(null);
  const [open, setOpen] = useState(false);

  const startEdit = (r: RecurringTransaction | null) => {
    setEditing(r);
    setName(r?.name ?? '');
    setAmount(r ? String(r.amountMinor / 100) : '');
    setFreq(r?.frequency ?? 'monthly');
    setDay(String(r?.anchorDay ?? new Date(r?.nextDueAt ?? Date.now()).getDate()));
    setChoice(r?.categoryId ? { categoryId: r.categoryId, subcategoryId: r.subcategoryId } : null);
    setOpen(true);
  };

  const save = async () => {
    const amountMinor = parseAmountInput(amount);
    const dayNum = Math.max(1, Math.min(31, Number(day) || 1));
    if (!name.trim() || !amountMinor) return;
    const now = Date.now();
    const nextDueAt = freq === 'weekly' ? (editing?.nextDueAt ?? addDays(startOfDay(now), 7)) : nextDateForDay(dayNum, now);
    await write((db) =>
      recurringRepo.upsert(db, {
        id: editing?.id ?? newId(now),
        name: name.trim(),
        amountMinor,
        currency: 'INR',
        type: 'expense',
        frequency: freq,
        interval: 1,
        nextDueAt: editing && editing.frequency === freq && editing.anchorDay === dayNum ? editing.nextDueAt : nextDueAt,
        anchorDay: freq === 'weekly' ? null : dayNum,
        categoryId: choice?.categoryId ?? null,
        subcategoryId: choice?.subcategoryId ?? null,
        accountId: editing?.accountId ?? null,
        merchantName: editing?.merchantName ?? null,
        isActive: true,
        createdAt: editing?.createdAt ?? now,
        updatedAt: now,
        deletedAt: null,
      }),
    );
    setOpen(false);
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Recurring payments' }} />
      {open ? (
        <Card>
          <Field label="Name" value={name} onChangeText={setName} placeholder="Rent, Netflix, EMI…" />
          <Field label="Amount (₹)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
          <Row style={{ flexWrap: 'wrap' }}>
            {FREQS.map((f) => (
              <Chip key={f} label={f[0]?.toUpperCase() + f.slice(1)} selected={freq === f} onPress={() => setFreq(f)} />
            ))}
          </Row>
          {freq !== 'weekly' ? <Field label="Day of month" value={day} onChangeText={setDay} keyboardType="number-pad" /> : null}
          <CategoryPicker categories={categories} value={choice} onChange={setChoice} />
          <Row>
            <Button kind="secondary" label="Cancel" onPress={() => setOpen(false)} style={{ flex: 1 }} />
            <Button label="Save" onPress={save} style={{ flex: 1 }} />
          </Row>
        </Card>
      ) : (
        <Button icon="plus" label="Add recurring payment" onPress={() => startEdit(null)} />
      )}
      {items.length === 0 && !open ? <EmptyState icon="calendar-sync-outline" title="No recurring payments" body="Add rent, EMIs and subscriptions so safe-to-spend sets money aside for them." /> : null}
      <Card style={{ display: items.length ? 'flex' : 'none' }}>
        {items.map((r, i) => (
          <View key={r.id} style={{ gap: space.xs }}>
            {i > 0 ? <Divider /> : null}
            <ListItem
              icon={categories.byId.get(r.subcategoryId ?? r.categoryId ?? '')?.icon ?? 'calendar'}
              title={`${r.name} · ${formatMoney(r.amountMinor, 'INR', { paise: 'never' })}`}
              subtitle={`${r.frequency} · next ${new Date(r.nextDueAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}${r.isActive ? '' : ' · paused'}`}
              onPress={() => startEdit(r)}
            />
            <Row>
              <Chip label="Mark paid" icon="check" onPress={() => write((db) => markRecurringPaid(db, r.id, null))} />
              <Chip label={r.isActive ? 'Pause' : 'Resume'} onPress={() => write((db) => recurringRepo.upsert(db, { ...r, isActive: !r.isActive, updatedAt: Date.now() }))} />
              <Chip
                label="Delete"
                onPress={() =>
                  Alert.alert(`Delete ${r.name}?`, undefined, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => write((db) => recurringRepo.remove(db, r.id, Date.now())) },
                  ])
                }
              />
            </Row>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
