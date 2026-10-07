import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TransactionRow } from '@/components/TransactionRow';
import { radius, space, useTheme } from '@/components/theme';
import { Button, Card, Divider, EmptyState, Icon, ProgressBar, Row, SectionTitle, T } from '@/components/ui';
import { useCategories, useQuery } from '@/hooks/useQuery';
import { syncNotifications } from '@/services/app';
import { loadDashboard } from '@/services/queries';
import { syncSmsInbox } from '@/services/sms';
import { formatMoney } from '@/utils/money';

import { NotificationListener, isAvailable } from '../../../modules/notification-listener';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function ListenerWarning() {
  const t = useTheme();
  const status = NotificationListener.getStatus();
  if (isAvailable && status.permissionGranted) return null;
  return (
    <Card style={{ backgroundColor: t.warningSoft, borderColor: t.warningSoft }}>
      <Row>
        <Icon name="pause-circle-outline" color={t.warning} />
        <T variant="heading" style={{ flex: 1 }}>Automatic tracking is paused</T>
      </Row>
      <T color="muted">
        {isAvailable
          ? 'Enable notification access to automatically record transactions.'
          : 'This build has no notification listener. Install the Android development build to track automatically.'}
      </T>
      {isAvailable ? <Button label="Enable notification access" onPress={() => NotificationListener.openPermissionSettings()} /> : null}
    </Card>
  );
}

export default function Dashboard() {
  const t = useTheme();
  const categories = useCategories();
  const { data } = useQuery((db) => loadDashboard(db));
  const [refreshing, setRefreshing] = useState(false);
  const now = new Date();

  const refresh = async () => {
    setRefreshing(true);
    try {
      await syncNotifications();
      await syncSmsInbox();
    } catch (error) {
      Alert.alert('Sync failed', error instanceof Error ? error.message : 'Kharcha could not finish checking notifications and bank SMS.');
    } finally {
      setRefreshing(false);
    }
  };

  const safe = data?.safe;
  const total = data?.progress.total;
  const tone = total?.status === 'over' ? 'danger' : total?.status === 'warning' ? 'warning' : 'primary';

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={t.primary} />}
      >
        <Row style={{ justifyContent: 'space-between' }}>
          <T variant="title">{MONTHS[now.getMonth()]}</T>
          {data && data.reviewCount > 0 ? (
            <Button kind="secondary" icon="inbox-outline" label={`${data.reviewCount} to review`} onPress={() => router.push('/review')} style={{ minHeight: 36 }} />
          ) : null}
        </Row>

        <ListenerWarning />

        {safe ? (
          <Card onPress={() => router.push('/safe-to-spend')} style={{ backgroundColor: t.primary, borderColor: t.primary }}>
            <T variant="label" color={t.onPrimary} style={{ opacity: 0.85 }}>Safe to spend</T>
            <Row style={{ alignItems: 'flex-end' }} gap={6}>
              <T variant="hero" color={t.onPrimary}>{formatMoney(safe.safePerDayMinor, 'INR', { paise: 'never' })}</T>
              <T variant="heading" color={t.onPrimary} style={{ marginBottom: 8, opacity: 0.85 }}>/day</T>
            </Row>
            <T variant="caption" color={t.onPrimary} style={{ opacity: 0.85 }}>
              {safe.isOverBudget
                ? `Over budget by ${formatMoney(-safe.remainingMinor, 'INR', { paise: 'never' })}`
                : `${formatMoney(safe.availableMinor, 'INR', { paise: 'never' })} left for ${safe.daysLeft} day${safe.daysLeft === 1 ? '' : 's'} · tap for details`}
            </T>
          </Card>
        ) : data ? (
          <Card onPress={() => router.push('/settings/budgets')}>
            <T variant="heading">Set a monthly budget</T>
            <T color="muted">Kharcha will tell you how much you can safely spend each day.</T>
          </Card>
        ) : null}

        <Row gap={space.md}>
          <Card style={{ flex: 1 }}>
            <T variant="label" color="muted">Today</T>
            <T variant="title">{formatMoney(data?.todayMinor ?? 0, 'INR', { paise: 'never' })}</T>
          </Card>
          <Card style={{ flex: 1 }}>
            <T variant="label" color="muted">This month</T>
            <T variant="title">{formatMoney(data?.monthMinor ?? 0, 'INR', { paise: 'never' })}</T>
          </Card>
        </Row>

        {total ? (
          <Card onPress={() => router.push('/settings/budgets')}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T variant="heading">Budget</T>
              <T color="muted">{formatMoney(total.spentMinor, 'INR', { paise: 'never' })} of {formatMoney(total.budgetMinor, 'INR', { paise: 'never' })}</T>
            </Row>
            <ProgressBar fraction={total.pctUsed} tone={tone} />
            <T variant="caption" color="muted">
              Projected month end {formatMoney(total.projectedMonthEndMinor, 'INR', { paise: 'never' })} · avg {formatMoney(total.avgDailyMinor, 'INR', { paise: 'never' })}/day
            </T>
            {data?.progress.categories.map((line) => (
              <View key={line.categoryId} style={{ gap: 4, marginTop: space.xs }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <T variant="label">{categories.name(line.categoryId)}</T>
                  <T variant="caption" color="muted">{formatMoney(line.spentMinor, 'INR', { paise: 'never' })} / {formatMoney(line.budgetMinor, 'INR', { paise: 'never' })}</T>
                </Row>
                <ProgressBar fraction={line.pctUsed} tone={line.status === 'over' ? 'danger' : line.status === 'warning' ? 'warning' : 'primary'} />
              </View>
            ))}
          </Card>
        ) : null}

        {data && data.breakdown.length > 0 ? (
          <Card>
            <SectionTitle title="Where it went" action="Insights" onAction={() => router.push('/insights')} />
            {data.breakdown.slice(0, 5).map((c) => {
              const cat = c.categoryId ? categories.byId.get(c.categoryId) : undefined;
              return (
                <Row key={c.categoryId ?? 'none'} style={{ justifyContent: 'space-between', minHeight: 32 }}>
                  <Row>
                    <View style={{ width: 10, height: 10, borderRadius: radius.pill, backgroundColor: cat?.color ?? t.textFaint }} />
                    <T>{categories.name(c.categoryId)}</T>
                  </Row>
                  <T style={{ fontWeight: '600' }}>{formatMoney(c.spentMinor, 'INR', { paise: 'never' })}</T>
                </Row>
              );
            })}
          </Card>
        ) : null}

        {data && data.upcoming.length > 0 ? (
          <Card>
            <SectionTitle title="Upcoming" action="All" onAction={() => router.push('/settings/recurring')} />
            {data.upcoming.map((u) => (
              <Row key={`${u.recurring.id}-${u.dueAt}`} style={{ justifyContent: 'space-between', minHeight: 36 }}>
                <View>
                  <T>{u.recurring.name}</T>
                  <T variant="caption" color={u.isOverdue ? 'danger' : 'muted'}>
                    {u.isOverdue ? 'Overdue · ' : ''}{new Date(u.dueAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </T>
                </View>
                <T style={{ fontWeight: '600' }}>{formatMoney(u.recurring.amountMinor, 'INR', { paise: 'never' })}</T>
              </Row>
            ))}
          </Card>
        ) : null}

        <Card>
          <SectionTitle title="Recent" action="See all" onAction={() => router.push('/transactions')} />
          {data && data.recent.length === 0 ? (
            <EmptyState icon="receipt-text-outline" title="No transactions yet" body="Payments appear here automatically as their notifications arrive. Tap + to add cash spending." />
          ) : (
            data?.recent.map((tx, i) => (
              <View key={tx.id}>
                {i > 0 ? <Divider /> : null}
                <TransactionRow tx={tx} categories={categories} />
              </View>
            ))
          )}
        </Card>
      </ScrollView>
      <View style={{ position: 'absolute', right: space.lg, bottom: space.lg }}>
        <Button icon="plus" label="Add" onPress={() => router.push('/add')} style={{ borderRadius: radius.pill, paddingHorizontal: space.xl, elevation: 3 }} />
      </View>
    </SafeAreaView>
  );
}
