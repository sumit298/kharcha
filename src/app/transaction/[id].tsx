import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { CategoryPicker } from '@/components/CategoryPicker';
import { amountLabel } from '@/components/TransactionRow';
import { space } from '@/components/theme';
import { Button, Card, Chip, Field, Loading, Row, Screen, T } from '@/components/ui';
import { accountRepo, transactionRepo } from '@/database/repositories';
import { useCategories, useQuery } from '@/hooks/useQuery';
import { write } from '@/services/app';
import { findKnownApp } from '@/services/notification/knownApps';
import { deleteTransaction, editTransaction, ignoreTransaction, setCategory } from '@/services/transactions/actions';
import type { Transaction, TransactionType } from '@/types';
import { formatMoney, parseAmountInput } from '@/utils/money';

const TYPES: { type: TransactionType; label: string }[] = [
  { type: 'expense', label: 'Spending' },
  { type: 'income', label: 'Income' },
  { type: 'transfer', label: 'Transfer' },
  { type: 'refund', label: 'Refund' },
];

export default function TransactionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const categories = useCategories();
  const { data: tx } = useQuery((db) => transactionRepo.get(db, id), id);
  const { data: accounts = [] } = useQuery((db) => accountRepo.list(db));
  if (tx === undefined) return <Loading />;
  if (tx === null) return <Screen><T>Transaction not found.</T></Screen>;

  const kinds = tx.type === 'income' ? (['income'] as const) : tx.type === 'transfer' ? (['transfer', 'expense'] as const) : (['expense'] as const);

  return (
    <Screen>
      <Card>
        <T variant="hero" style={{ fontSize: 34 }}>{amountLabel(tx)}</T>
        <T color="muted">
          {new Date(tx.occurredAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
          {' · '}
          {tx.source === 'manual' ? 'Added manually' : `via ${tx.sourceApp ? (findKnownApp(tx.sourceApp)?.name ?? tx.sourceApp) : 'notification'}`}
        </T>
        {tx.reference ? <T variant="caption" color="faint">Ref {tx.reference}</T> : null}
        {tx.payeeVpa ? <T variant="caption" color="faint">UPI ID {tx.payeeVpa}</T> : null}
        {tx.accountLast4 ? <T variant="caption" color="faint">Account ••{tx.accountLast4}</T> : null}
      </Card>

      <T variant="label" color="muted">Type</T>
      <Row style={{ flexWrap: 'wrap' }}>
        {TYPES.map((o) => (
          <Chip key={o.type} label={o.label} selected={tx.type === o.type} onPress={() => write((db) => editTransaction(db, tx.id, { type: o.type }))} />
        ))}
      </Row>

      <T variant="label" color="muted">Category (Kharcha remembers this for {tx.merchantName ?? 'this merchant'})</T>
      <CategoryPicker
        categories={categories}
        value={tx.categoryId ? { categoryId: tx.categoryId, subcategoryId: tx.subcategoryId } : null}
        onChange={(c) => write((db) => setCategory(db, tx.id, c))}
        kinds={[...kinds]}
      />

      {accounts.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <T variant="label" color="muted">Account</T>
          <Row style={{ flexWrap: 'wrap' }}>
            {accounts.map((a) => (
              <Chip key={a.id} label={a.name} selected={tx.accountId === a.id} onPress={() => write((db) => editTransaction(db, tx.id, { accountId: a.id }))} />
            ))}
          </Row>
        </View>
      ) : null}

      <DetailsForm key={tx.id} tx={tx} />

      <Row>
        <Button kind="secondary" label="Ignore" icon="eye-off-outline" onPress={() => write((db) => ignoreTransaction(db, tx.id)).then(() => router.back())} style={{ flex: 1 }} />
        <Button
          kind="danger"
          label="Delete"
          icon="trash-can-outline"
          style={{ flex: 1 }}
          onPress={() =>
            Alert.alert('Delete transaction?', 'This removes it from all totals.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => write((db) => deleteTransaction(db, tx.id)).then(() => router.back()) },
            ])
          }
        />
      </Row>
    </Screen>
  );
}

/** Merchant, amount and note, initialised once from the loaded transaction. */
function DetailsForm({ tx }: { tx: Transaction }) {
  const [merchant, setMerchant] = useState(tx.merchantName ?? '');
  const [amount, setAmount] = useState((tx.amountMinor / 100).toFixed(2).replace(/\.00$/, ''));
  const [note, setNote] = useState(tx.notes ?? '');

  const save = async () => {
    const amountMinor = parseAmountInput(amount);
    await write((db) =>
      editTransaction(db, tx.id, {
        merchantName: merchant.trim() || null,
        notes: note.trim() || null,
        ...(amountMinor ? { amountMinor } : {}),
      }),
    );
    router.back();
  };

  return (
    <>
      <Field label="Merchant" value={merchant} onChangeText={setMerchant} />
      <Field label={`Amount (was ${formatMoney(tx.amountMinor)})`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
      <Field label="Note" value={note} onChangeText={setNote} placeholder="Optional" />
      <Button label="Save" onPress={save} />
    </>
  );
}
