import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Bars, ShareBar } from '@/components/Bars';
import { space, useTheme } from '@/components/theme';
import { Card, Chip, EmptyState, Icon, Row, Screen, SectionTitle, T } from '@/components/ui';
import {
  compareWithPreviousMonth,
  dailySeries,
  dailyTransactionTotals,
  incomeVsExpense,
  largestExpenses,
  spendingByCategory,
  spendingByMerchant,
  spendingBySourceApp,
  weeklySeries,
} from '@/domain/analytics/aggregate';
import { recurringRepo, transactionRepo } from '@/database/repositories';
import { useCategories, useQuery } from '@/hooks/useQuery';
import { findKnownApp } from '@/services/notification/knownApps';
import { addDays, addMonths, dayKey, daysInMonth, monthRange } from '@/utils/dates';
import { formatMoney, formatMoneyCompact } from '@/utils/money';

const money = (m: number) => formatMoney(m, 'INR', { paise: 'never' });

export default function InsightsScreen() {
  const t = useTheme();
  const categories = useCategories();
  const [offset, setOffset] = useState(0);
  const [by, setBy] = useState<'merchant' | 'app'>('merchant');
  const [now] = useState(Date.now);
  const anchor = offset === 0 ? now : monthRange(addMonths(now, offset)).to - 1;
  const range = monthRange(anchor);
  const prev = monthRange(addMonths(range.from, -1));
  const { data } = useQuery(async (db) => {
    const [txs, recurring] = await Promise.all([transactionRepo.inRange(db, prev.from, range.to), recurringRepo.list(db)]);
    return { txs, recurring };
  }, range.from);
  const txs = data?.txs ?? [];

  const cats = spendingByCategory(txs, categories.list, range);
  const total = cats.reduce((s, c) => s + c.spentMinor, 0);
  const cmp = compareWithPreviousMonth(txs, anchor);
  const daily = dailySeries(txs, range);
  const dailyTotals = dailyTransactionTotals(txs, range);
  const weekly = weeklySeries(txs, range);
  const ranked = by === 'merchant' ? spendingByMerchant(txs, range) : spendingBySourceApp(txs, range);
  const top = ranked[0]?.spentMinor ?? 1;
  const flow = incomeVsExpense(txs, range);
  const largest = largestExpenses(txs, range, 5);
  const activeRecurring = (data?.recurring ?? []).filter((item) => item.isActive);
  const monthName = new Date(range.from).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const calendarLeadingDays = (new Date(range.from).getDay() + 6) % 7;
  const calendarCells = Array.from({ length: calendarLeadingDays + daysInMonth(range.from) }, (_, index) => {
    if (index < calendarLeadingDays) return null;
    return dailyTotals[index - calendarLeadingDays];
  });
  while (calendarCells.length % 7 !== 0) calendarCells.push(null);
  const activeDays = dailyTotals.filter((day) => day.debitMinor > 0 || day.creditMinor > 0).length;

  return (
    <Screen>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        <Chip label="This month" selected={offset === 0} onPress={() => setOffset(0)} />
        <Chip label="Last month" selected={offset === -1} onPress={() => setOffset(-1)} />
        <Chip label="2 months ago" selected={offset === -2} onPress={() => setOffset(-2)} />
      </ScrollView>

      <Card>
        <T variant="label" color="muted">MONTH AT A GLANCE</T>
        <T variant="title">{money(total)} spent</T>
        {cmp.deltaPct !== null ? (
          <T color={cmp.deltaMinor > 0 ? 'danger' : 'positive'}>
            {cmp.deltaMinor > 0 ? '▲' : '▼'} {Math.abs(Math.round(cmp.deltaPct * 100))}% vs the same days last month ({money(cmp.previous.spentMinor)})
          </T>
        ) : null}
        <Row style={{ justifyContent: 'space-between', marginTop: space.sm }}>
          <View>
            <T variant="caption" color="muted">Money in</T>
            <T color="positive" style={{ fontWeight: '600' }}>{money(flow.incomeMinor)}</T>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <T variant="caption" color="muted">Money out</T>
            <T style={{ fontWeight: '600' }}>{money(flow.spentMinor)}</T>
          </View>
        </Row>
      </Card>

      <Card>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ gap: 2 }}>
            <T variant="label" color="muted">MONTHLY ACTIVITY</T>
            <T variant="heading">{monthName}</T>
          </View>
          <Row gap={space.xs}>
            <Pressable
              onPress={() => setOffset((value) => value - 1)}
              style={[styles.calendarNav, { backgroundColor: t.surfaceAlt }]}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Previous month"
            >
              <Icon name="chevron-left" size={20} color={t.textMuted} />
            </Pressable>
            <Pressable
              onPress={() => offset < 0 && setOffset((value) => value + 1)}
              disabled={offset >= 0}
              style={[styles.calendarNav, { backgroundColor: t.surfaceAlt, opacity: offset >= 0 ? 0.35 : 1 }]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Next month"
              accessibilityState={{ disabled: offset >= 0 }}
            >
              <Icon name="chevron-right" size={20} color={t.textMuted} />
            </Pressable>
          </Row>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row gap={space.md}>
            <Row gap={space.xs}>
              <View style={[styles.legendDot, { backgroundColor: t.textMuted }]} />
              <T variant="caption" color="muted">Debit</T>
            </Row>
            <Row gap={space.xs}>
              <View style={[styles.legendDot, { backgroundColor: t.positive }]} />
              <T variant="caption" color="muted">Credit</T>
            </Row>
          </Row>
          <T variant="caption" color="faint">{activeDays} active day{activeDays === 1 ? '' : 's'}</T>
        </Row>
        <Row gap={0}>
          {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((label) => (
            <View key={label} style={styles.weekday}>
              <T variant="caption" color="faint">{label}</T>
            </View>
          ))}
        </Row>
        <View style={{ gap: 2 }}>
          {Array.from({ length: calendarCells.length / 7 }, (_, week) => (
            <Row key={week} gap={2} style={{ alignItems: 'stretch' }}>
              {calendarCells.slice(week * 7, week * 7 + 7).map((day, index) => {
                const today = day?.dayKey === dayKey(now);
                const active = day && (day.debitMinor > 0 || day.creditMinor > 0);
                return (
                  <View
                    key={day?.dayKey ?? `empty-${week}-${index}`}
                    style={[styles.calendarDay, { backgroundColor: active ? t.surfaceAlt : 'transparent' }]}
                  >
                    {day ? (
                      <Pressable
                        onPress={() => router.push({ pathname: '/transactions', params: { dayFrom: String(day.from), dayTo: String(addDays(day.from, 1)) } })}
                        accessibilityRole="button"
                        accessibilityLabel={`Open transactions for ${new Date(day.from).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}`}
                        style={{ flex: 1, gap: 1 }}
                      >
                        <View style={[styles.dayNumber, today ? { backgroundColor: t.primary } : null]}>
                          <T variant="caption" color={today ? t.onPrimary : 'muted'} style={{ fontWeight: '700' }}>{new Date(day.from).getDate()}</T>
                        </View>
                        {day.debitMinor > 0 ? <T variant="caption" color="muted" numberOfLines={1}>−{formatMoneyCompact(day.debitMinor)}</T> : null}
                        {day.creditMinor > 0 ? <T variant="caption" color="positive" numberOfLines={1}>+{formatMoneyCompact(day.creditMinor)}</T> : null}
                      </Pressable>
                    ) : null}
                  </View>
                );
              })}
            </Row>
          ))}
        </View>
      </Card>

      {total === 0 && txs.length === 0 ? <EmptyState icon="chart-box-outline" title="No spending yet" body="Charts appear once transactions are recorded." /> : null}

      <Card>
        <SectionTitle title="By category" />
        {cats.length > 0 ? cats.map((c) => {
          const cat = c.categoryId ? categories.byId.get(c.categoryId) : undefined;
          return (
            <Pressable key={c.categoryId ?? 'none'} onPress={() => c.categoryId && router.push({ pathname: '/transactions', params: { categoryId: c.categoryId } })} style={{ gap: 4, paddingVertical: 6 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T>{categories.name(c.categoryId)}</T>
                <T style={{ fontWeight: '600' }}>{money(c.spentMinor)}</T>
              </Row>
              <ShareBar fraction={total > 0 ? c.spentMinor / total : 0} color={cat?.color ?? undefined} />
            </Pressable>
          );
        }) : <T color="muted">No spending categories for this month.</T>}
      </Card>

      <Card>
        <SectionTitle title="Daily" />
        <Bars values={daily.map((d) => d.spentMinor)} labels={daily.map((d, i) => (i % 5 === 0 ? String(new Date(d.from).getDate()) : null))} />
        <SectionTitle title="Weekly" />
        <Bars
          height={72}
          values={weekly.map((w) => w.spentMinor)}
          labels={weekly.map((w) => formatMoneyCompact(w.spentMinor))}
        />
      </Card>

      <Card>
        <SectionTitle title="Where am I spending?" />
        <Row>
          <Chip label="Merchants" selected={by === 'merchant'} onPress={() => setBy('merchant')} />
          <Chip label="Apps" selected={by === 'app'} onPress={() => setBy('app')} />
        </Row>
        {ranked.slice(0, 10).map((r) => {
          const key = 'merchantName' in r ? r.merchantName : (r.sourceApp ?? 'Manual');
          const label = 'merchantName' in r ? r.merchantName : r.sourceApp ? (findKnownApp(r.sourceApp)?.name ?? r.sourceApp) : 'Manual entries';
          const params = 'merchantName' in r ? { merchant: r.merchantName } : r.sourceApp ? { sourceApp: r.sourceApp } : null;
          return (
            <Pressable key={key} onPress={() => params && router.push({ pathname: '/transactions', params })} style={{ gap: 4, paddingVertical: 6 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T numberOfLines={1} style={{ flex: 1 }}>{label}</T>
                <T variant="caption" color="muted">{r.count}×</T>
                <T style={{ fontWeight: '600', minWidth: 72, textAlign: 'right' }}>{money(r.spentMinor)}</T>
              </Row>
              <ShareBar fraction={r.spentMinor / top} />
            </Pressable>
          );
        })}
        {ranked.length === 0 ? <T color="muted">No spending breakdown for this month.</T> : null}
      </Card>

      <Card>
        <SectionTitle title="Largest expenses" />
        {largest.map((tx) => (
          <Pressable key={tx.id} onPress={() => router.push(`/transaction/${tx.id}`)}>
            <Row style={{ justifyContent: 'space-between', minHeight: 36 }}>
              <T numberOfLines={1} style={{ flex: 1 }}>{tx.merchantName ?? 'Unknown'}</T>
              <T style={{ fontWeight: '600' }}>{money(tx.amountMinor)}</T>
            </Row>
          </Pressable>
        ))}
        {largest.length === 0 ? <T color="muted">No expenses for this month.</T> : null}
      </Card>

      <Card>
        <SectionTitle title="Recurring" action="Manage" onAction={() => router.push('/settings/recurring')} />
        {activeRecurring.map((r) => (
          <Row key={r.id} style={{ justifyContent: 'space-between', minHeight: 32 }}>
            <T>{r.name}</T>
            <T color="muted">{money(r.amountMinor)} / {r.frequency.replace('ly', '')}</T>
          </Row>
        ))}
        {activeRecurring.length === 0 ? <T color="muted">No active recurring payments.</T> : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  calendarNav: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  weekday: { flex: 1, alignItems: 'center', paddingVertical: 2 },
  calendarDay: { flex: 1, minHeight: 64, padding: space.xs, borderRadius: 10, gap: 1 },
  dayNumber: { width: 23, height: 23, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
