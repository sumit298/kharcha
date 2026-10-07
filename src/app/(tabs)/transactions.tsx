import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, SectionList, View } from 'react-native';

import { TransactionRow } from '@/components/TransactionRow';
import { space, useTheme } from '@/components/theme';
import { Chip, Divider, EmptyState, Field, Row, T } from '@/components/ui';
import { transactionRepo, type TransactionFilter } from '@/database/repositories';
import { useCategories, useQuery } from '@/hooks/useQuery';
import type { Transaction, TransactionType } from '@/types';
import { addDays, addMonths, dayKey, monthRange, startOfDay } from '@/utils/dates';

type Period = 'month' | 'last_month' | '7d' | 'all';
type Kind = 'all' | 'expense' | 'income' | 'transfer';

const KIND_TYPES: Record<Kind, TransactionType[] | undefined> = {
  all: undefined,
  expense: ['expense', 'refund'],
  income: ['income'],
  transfer: ['transfer'],
};

function periodRange(p: Period, now: number): { from?: number; to?: number } {
  if (p === 'month') return monthRange(now);
  if (p === 'last_month') return monthRange(addMonths(now, -1));
  if (p === '7d') return { from: addDays(startOfDay(now), -6), to: addDays(startOfDay(now), 1) };
  return {};
}

function dayLabel(key: string, now: number): string {
  if (key === dayKey(now)) return 'TODAY';
  if (key === dayKey(addDays(now, -1))) return 'YESTERDAY';
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y as number, (m as number) - 1, d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();
}

export default function TransactionsScreen() {
  const t = useTheme();
  const params = useLocalSearchParams<{ merchant?: string; sourceApp?: string; categoryId?: string }>();
  const categories = useCategories();
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState<Period>(params.merchant || params.sourceApp ? 'all' : 'month');
  const [kind, setKind] = useState<Kind>('all');
  const [categoryId, setCategoryId] = useState<string | undefined>(params.categoryId);
  const [source, setSource] = useState<'all' | 'notification' | 'manual'>('all');
  const [now] = useState(Date.now);

  const filter: TransactionFilter = {
    ...periodRange(period, now),
    search: search.trim() || undefined,
    types: KIND_TYPES[kind],
    categoryId,
    merchantName: params.merchant,
    sourceApp: params.sourceApp,
    source: source === 'all' ? undefined : source,
    limit: 500,
  };
  const { data = [] } = useQuery((db) => transactionRepo.list(db, filter), JSON.stringify(filter));

  const sections = useMemo(() => {
    const groups = new Map<string, Transaction[]>();
    for (const tx of data) {
      const key = dayKey(tx.occurredAt);
      groups.set(key, [...(groups.get(key) ?? []), tx]);
    }
    return [...groups].map(([key, items]) => ({ key, title: dayLabel(key, now), data: items }));
  }, [data, now]);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ padding: space.lg, paddingBottom: space.sm, gap: space.sm }}>
        {params.merchant || params.sourceApp ? (
          <Row style={{ justifyContent: 'space-between' }}>
            <T variant="heading">{params.merchant ?? params.sourceApp}</T>
            <Chip label="Clear" icon="close" onPress={() => router.setParams({ merchant: undefined, sourceApp: undefined })} />
          </Row>
        ) : null}
        <Field value={search} onChangeText={setSearch} placeholder="Search merchant, UPI ID or note" accessibilityLabel="Search" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          {(['month', 'last_month', '7d', 'all'] as Period[]).map((p) => (
            <Chip key={p} label={{ month: 'This month', last_month: 'Last month', '7d': '7 days', all: 'All time' }[p]} selected={period === p} onPress={() => setPeriod(p)} />
          ))}
          <View style={{ width: 1, backgroundColor: t.border }} />
          {(['all', 'expense', 'income', 'transfer'] as Kind[]).map((k) => (
            <Chip key={k} label={{ all: 'All', expense: 'Spending', income: 'Income', transfer: 'Transfers' }[k]} selected={kind === k} onPress={() => setKind(k)} />
          ))}
          <View style={{ width: 1, backgroundColor: t.border }} />
          {(['notification', 'manual'] as const).map((s) => (
            <Chip key={s} label={s === 'notification' ? 'Automatic' : 'Manual'} selected={source === s} onPress={() => setSource(source === s ? 'all' : s)} />
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          {categories.topLevel.map((c) => (
            <Chip key={c.id} label={c.name} icon={c.icon} selected={categoryId === c.id} onPress={() => setCategoryId(categoryId === c.id ? undefined : c.id)} />
          ))}
        </ScrollView>
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(tx) => tx.id}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl }}
        stickySectionHeadersEnabled
        renderSectionHeader={({ section }) => (
          <View style={{ backgroundColor: t.bg, paddingTop: space.md, paddingBottom: space.xs }}>
            <T variant="label" color="faint">{section.title}</T>
          </View>
        )}
        ItemSeparatorComponent={Divider}
        renderItem={({ item }) => <TransactionRow tx={item} categories={categories} />}
        ListEmptyComponent={<EmptyState icon="magnify" title="Nothing here" body="Try another period or filter." />}
      />
    </View>
  );
}
