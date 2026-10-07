import { router } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { CategoryPicker, type CategoryChoice } from '@/components/CategoryPicker';
import { font, space, useTheme } from '@/components/theme';
import { Button, Chip, Field, Row, Screen, T } from '@/components/ui';
import { useCategories } from '@/hooks/useQuery';
import { write } from '@/services/app';
import { addManualTransaction } from '@/services/transactions/actions';
import type { TransactionType } from '@/types';
import { addDays, startOfDay } from '@/utils/dates';
import { parseAmountInput } from '@/utils/money';

/** Quick add: amount + category is enough; everything else is optional. */
export default function AddScreen() {
  const t = useTheme();
  const categories = useCategories();
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<TransactionType>('expense');
  const [choice, setChoice] = useState<CategoryChoice | null>(null);
  const [merchant, setMerchant] = useState('');
  const [note, setNote] = useState('');
  const [dayOffset, setDayOffset] = useState(0);
  const [more, setMore] = useState(false);
  const amountMinor = parseAmountInput(amount);

  const save = async () => {
    if (!amountMinor) return;
    const now = Date.now();
    const occurredAt = dayOffset === 0 ? now : addDays(startOfDay(now), dayOffset) + 12 * 3600_000;
    await write((db) =>
      addManualTransaction(db, {
        amountMinor,
        type,
        categoryId: choice?.categoryId ?? (type === 'income' ? 'income' : null),
        subcategoryId: choice?.subcategoryId ?? null,
        merchantName: merchant,
        notes: note,
        occurredAt,
      }),
    );
    router.back();
  };

  return (
    <Screen>
      <Row>
        <Chip label="Expense" selected={type === 'expense'} onPress={() => setType('expense')} />
        <Chip label="Income" selected={type === 'income'} onPress={() => setType('income')} />
      </Row>
      <Row style={{ justifyContent: 'center', paddingVertical: space.lg }} gap={4}>
        <T variant="hero" color="muted">₹</T>
        <TextInput
          autoFocus
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={t.textFaint}
          accessibilityLabel="Amount in rupees"
          style={[font.hero, { color: t.text, minWidth: 120 }]}
        />
      </Row>
      <T variant="label" color="muted">Category</T>
      <CategoryPicker categories={categories} value={choice} onChange={setChoice} kinds={type === 'income' ? ['income'] : ['expense']} />
      {more ? (
        <View style={{ gap: space.md }}>
          <Field label="Merchant" value={merchant} onChangeText={setMerchant} placeholder="Optional" />
          <Field label="Note" value={note} onChangeText={setNote} placeholder="Optional" />
          <T variant="label" color="muted">Date</T>
          <Row>
            {[0, -1, -2].map((d) => (
              <Chip key={d} label={d === 0 ? 'Today' : d === -1 ? 'Yesterday' : '2 days ago'} selected={dayOffset === d} onPress={() => setDayOffset(d)} />
            ))}
          </Row>
        </View>
      ) : (
        <Button kind="ghost" label="Add merchant, note or date" onPress={() => setMore(true)} />
      )}
      <Button label="Save" onPress={save} disabled={!amountMinor} />
    </Screen>
  );
}
