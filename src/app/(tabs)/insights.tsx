import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Bars, ShareBar } from '@/components/Bars';
import { space } from '@/components/theme';
import { Card, Chip, EmptyState, Row, Screen, SectionTitle, T } from '@/components/ui';
import {
  compareWithPreviousMonth,
  dailySeries,
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
import { addMonths, monthRange } from '@/utils/dates';
import { formatMoney, formatMoneyCompact } from '@/utils/money';

const money = (m: number) => formatMoney(m, 'INR', { paise: 'never' });

export default function InsightsScreen() {
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
  const weekly = weeklySeries(txs, range);
  const ranked = by === 'merchant' ? spendingByMerchant(txs, range) : spendingBySourceApp(txs, range);
  const top = ranked[0]?.spentMinor ?? 1;
  const flow = incomeVsExpense(txs, range);
  const monthName = new Date(range.from).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  return (
    <Screen>
      <Row>
        <Chip label="This month" selected={offset === 0} onPress={() => setOffset(0)} />
        <Chip label="Last month" selected={offset === -1} onPress={() => setOffset(-1)} />
        <Chip label="2 months ago" selected={offset === -2} onPress={() => setOffset(-2)} />
      </Row>

      <Card>
        <T variant="label" color="muted">{monthName}</T>
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

      {total === 0 && txs.length === 0 ? <EmptyState icon="chart-box-outline" title="No spending yet" body="Charts appear once transactions are recorded." /> : null}

      <Card>
        <SectionTitle title="By category" />
        {cats.map((c) => {
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
        })}
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
      </Card>

      <Card>
        <SectionTitle title="Largest expenses" />
        {largestExpenses(txs, range, 5).map((tx) => (
          <Pressable key={tx.id} onPress={() => router.push(`/transaction/${tx.id}`)}>
            <Row style={{ justifyContent: 'space-between', minHeight: 36 }}>
              <T numberOfLines={1} style={{ flex: 1 }}>{tx.merchantName ?? 'Unknown'}</T>
              <T style={{ fontWeight: '600' }}>{money(tx.amountMinor)}</T>
            </Row>
          </Pressable>
        ))}
      </Card>

      <Card>
        <SectionTitle title="Recurring" action="Manage" onAction={() => router.push('/settings/recurring')} />
        {(data?.recurring ?? []).filter((r) => r.isActive).map((r) => (
          <Row key={r.id} style={{ justifyContent: 'space-between', minHeight: 32 }}>
            <T>{r.name}</T>
            <T color="muted">{money(r.amountMinor)} / {r.frequency.replace('ly', '')}</T>
          </Row>
        ))}
        {(data?.recurring ?? []).length === 0 ? <T color="muted">No recurring payments added.</T> : null}
      </Card>
    </Screen>
  );
}
