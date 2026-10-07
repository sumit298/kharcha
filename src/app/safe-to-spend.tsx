import { View } from 'react-native';

import { space } from '@/components/theme';
import { Card, Divider, EmptyState, Row, Screen, T } from '@/components/ui';
import { useQuery } from '@/hooks/useQuery';
import { loadDashboard } from '@/services/queries';
import { formatMoney } from '@/utils/money';

function Line({ label, value, strong, minus }: { label: string; value: number; strong?: boolean; minus?: boolean }) {
  return (
    <Row style={{ justifyContent: 'space-between', minHeight: 36 }}>
      <T variant={strong ? 'heading' : 'body'} color={strong ? undefined : 'muted'}>{label}</T>
      <T variant={strong ? 'heading' : 'body'}>{minus ? '− ' : ''}{formatMoney(value, 'INR', { paise: 'never' })}</T>
    </Row>
  );
}

/** ARCHITECTURE §9, made transparent. */
export default function SafeToSpendScreen() {
  const { data } = useQuery((db) => loadDashboard(db));
  const s = data?.safe;
  if (!s) return <Screen><EmptyState icon="wallet-outline" title="No budget set" body="Set a monthly budget in Settings → Budgets." /></Screen>;
  return (
    <Screen>
      <Card>
        <Line label="Monthly budget" value={s.budgetMinor} />
        <Line label="Spent so far" value={s.spentMinor} minus />
        <Divider />
        <Line label="Remaining" value={s.remainingMinor} strong />
        <Line label="Upcoming bills this month" value={s.upcomingCommittedMinor} minus />
        <Divider />
        <Line label="Actually available" value={s.availableMinor} strong />
        <T color="muted">÷ {s.daysLeft} day{s.daysLeft === 1 ? '' : 's'} left (including today)</T>
        <Divider />
        <Line label="Safe to spend per day" value={s.safePerDayMinor} strong />
      </Card>
      {s.upcomingItems.length > 0 ? (
        <Card>
          <T variant="heading">Upcoming bills counted</T>
          {s.upcomingItems.map((u) => (
            <View key={`${u.recurringId}-${u.dueAt}`} style={{ gap: space.xs }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T>{u.name}</T>
                <T>{formatMoney(u.amountMinor, 'INR', { paise: 'never' })}</T>
              </Row>
              <T variant="caption" color={u.isOverdue ? 'danger' : 'muted'}>
                {u.isOverdue ? 'Overdue since ' : 'Due '}
                {new Date(u.dueAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              </T>
            </View>
          ))}
        </Card>
      ) : null}
      <T variant="caption" color="muted">
        Spending counts expenses minus refunds. Transfers (card bill payments, ATM withdrawals, moving money between your accounts) and suspected duplicates are not counted.
      </T>
    </Screen>
  );
}
