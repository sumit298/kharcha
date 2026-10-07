import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import type { CategoryLookup } from '@/hooks/useQuery';
import type { Transaction } from '@/types';
import { formatMoney } from '@/utils/money';

import { space, useTheme } from './theme';
import { Icon, T } from './ui';

export function amountLabel(tx: Pick<Transaction, 'amountMinor' | 'currency' | 'type'>): string {
  const sign = tx.type === 'income' || tx.type === 'refund' ? '+' : tx.type === 'transfer' ? '' : '−';
  return `${sign}${formatMoney(tx.amountMinor, tx.currency)}`;
}

export function TransactionRow({ tx, categories }: { tx: Transaction; categories: CategoryLookup }) {
  const t = useTheme();
  const cat = categories.byId.get(tx.subcategoryId ?? '') ?? categories.byId.get(tx.categoryId ?? '');
  const parent = tx.categoryId ? categories.byId.get(tx.categoryId) : undefined;
  const tone = tx.type === 'income' || tx.type === 'refund' ? t.positive : tx.type === 'transfer' ? t.textMuted : t.text;
  const subtitle = [cat?.name ?? (tx.type === 'transfer' ? 'Transfer' : 'Uncategorized'), tx.type === 'refund' ? 'Refund' : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable
      onPress={() => router.push(`/transaction/${tx.id}`)}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={`${tx.merchantName ?? 'Unknown'}, ${amountLabel(tx)}`}
    >
      <View style={[styles.icon, { backgroundColor: (parent?.color ?? t.textFaint) + '22' }]}>
        <Icon name={cat?.icon ?? parent?.icon ?? 'help-circle-outline'} size={20} color={parent?.color ?? t.textMuted} />
      </View>
      <View style={{ flex: 1 }}>
        <T numberOfLines={1}>{tx.merchantName ?? tx.payeeVpa ?? 'Unknown'}</T>
        <T variant="caption" color="muted" numberOfLines={1}>{subtitle}</T>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <T style={{ color: tone, fontWeight: '600', textDecorationLine: tx.status === 'ignored' ? 'line-through' : 'none' }}>{amountLabel(tx)}</T>
        {tx.status === 'needs_review' ? <T variant="caption" color="warning">Review</T> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 60, paddingVertical: space.sm },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
