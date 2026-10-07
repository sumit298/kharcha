import { Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { space } from '@/components/theme';
import { Button, Card, Field, Row, Screen, T } from '@/components/ui';
import { selectEffectiveBudgets } from '@/domain/budgets/progress';
import { budgetRepo } from '@/database/repositories';
import { useCategories, useQuery, type CategoryLookup } from '@/hooks/useQuery';
import type { Budget } from '@/types';
import { write } from '@/services/app';
import { saveBudget } from '@/services/budgets';
import { monthKey } from '@/utils/dates';
import { parseAmountInput } from '@/utils/money';

export default function BudgetsScreen() {
  const categories = useCategories();
  const { data: budgets } = useQuery((db) => budgetRepo.list(db));
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Budgets' }} />
      {budgets && categories.list.length > 0 ? <BudgetForm budgets={budgets} categories={categories} /> : null}
    </Screen>
  );
}

function BudgetForm({ budgets, categories }: { budgets: Budget[]; categories: CategoryLookup }) {
  const [month] = useState(() => monthKey(Date.now()));
  const effective = selectEffectiveBudgets(budgets, month);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(effective.map((b) => [b.categoryId ?? 'total', String(Math.round(b.amountMinor / 100))])),
  );
  const [saved, setSaved] = useState(false);

  const save = () =>
    write(async (db) => {
      for (const key of ['total', ...categories.topLevel.map((c) => c.id)]) {
        const text = values[key]?.trim() ?? '';
        const amount = text ? parseAmountInput(text) : null;
        const existing = effective.find((b) => (b.categoryId ?? 'total') === key);
        if (amount === (existing?.amountMinor ?? null)) continue;
        await saveBudget(db, budgets, key === 'total' ? null : key, amount);
      }
    }).then(() => setSaved(true));

  return (
    <>
      <Card>
        <Field label="Total monthly budget (₹)" value={values.total ?? ''} onChangeText={(v) => setValues({ ...values, total: v })} keyboardType="number-pad" placeholder="e.g. 25000" />
        <T variant="caption" color="muted">Safe-to-spend is based on this number.</T>
      </Card>
      <Card>
        <T variant="heading">Category budgets (optional)</T>
        {categories.topLevel.filter((c) => c.kind === 'expense').map((c) => (
          <Row key={c.id} style={{ justifyContent: 'space-between' }}>
            <T style={{ flex: 1 }}>{c.name}</T>
            <View style={{ width: 130 }}>
              <Field value={values[c.id] ?? ''} onChangeText={(v) => setValues({ ...values, [c.id]: v })} keyboardType="number-pad" placeholder="—" accessibilityLabel={`${c.name} budget`} />
            </View>
          </Row>
        ))}
      </Card>
      <Button label={saved ? 'Saved' : 'Save budgets'} icon={saved ? 'check' : undefined} onPress={save} />
      <View style={{ height: space.lg }} />
    </>
  );
}
