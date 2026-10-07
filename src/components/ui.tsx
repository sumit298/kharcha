import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { font, radius, space, useTheme } from './theme';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export function Icon({ name, size = 22, color }: { name: IconName | string; size?: number; color?: string }) {
  const t = useTheme();
  return <MaterialCommunityIcons name={name as IconName} size={size} color={color ?? t.textMuted} />;
}

type TextVariant = keyof typeof font;
export function T({
  children,
  variant = 'body',
  color,
  style,
  numberOfLines,
}: {
  children: ReactNode;
  variant?: TextVariant;
  color?: 'muted' | 'faint' | 'primary' | 'positive' | 'danger' | 'warning' | string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const t = useTheme();
  const named: Record<string, string> = {
    muted: t.textMuted,
    faint: t.textFaint,
    primary: t.primary,
    positive: t.positive,
    danger: t.danger,
    warning: t.warning,
  };
  return (
    <Text numberOfLines={numberOfLines} style={[font[variant], { color: color ? (named[color] ?? color) : t.text }, style]}>
      {children}
    </Text>
  );
}

/** Scrollable screen body with the theme background. */
export function Screen({ children, scroll = true, edges }: { children: ReactNode; scroll?: boolean; edges?: ('top' | 'bottom')[] }) {
  const t = useTheme();
  return (
    <SafeAreaView edges={edges ?? []} style={{ flex: 1, backgroundColor: t.bg }}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.screen, { flex: 1 }]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const t = useTheme();
  const body = <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }, style]}>{children}</View>;
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      {body}
    </Pressable>
  );
}

export function Row({ children, style, gap = space.sm }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  icon,
  disabled,
  loading,
  style,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const colors = {
    primary: { bg: t.primary, fg: t.onPrimary },
    secondary: { bg: t.surfaceAlt, fg: t.text },
    ghost: { bg: 'transparent', fg: t.primary },
    danger: { bg: t.dangerSoft, fg: t.danger },
  }[kind];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: colors.bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={colors.fg} /> : icon ? <Icon name={icon} size={18} color={colors.fg} /> : null}
      <Text style={[font.heading, { color: colors.fg, fontSize: 15 }]}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress: () => void; icon?: string | null }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={[styles.chip, { backgroundColor: selected ? t.primary : t.surfaceAlt }]}
    >
      {icon ? <Icon name={icon} size={16} color={selected ? t.onPrimary : t.textMuted} /> : null}
      <Text style={[font.label, { color: selected ? t.onPrimary : t.text }]}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label?: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: space.xs }}>
      {label ? <T variant="label" color="muted">{label}</T> : null}
      <TextInput
        placeholderTextColor={t.textFaint}
        {...props}
        style={[styles.input, { backgroundColor: t.surface, borderColor: t.border, color: t.text }, props.style]}
      />
    </View>
  );
}

export function ProgressBar({ fraction, tone = 'primary' }: { fraction: number; tone?: 'primary' | 'warning' | 'danger' | 'positive' }) {
  const t = useTheme();
  const color = { primary: t.primary, warning: t.warning, danger: t.danger, positive: t.positive }[tone];
  const pct = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 1));
  return (
    <View style={[styles.track, { backgroundColor: t.surfaceAlt }]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}>
      <View style={{ width: `${pct * 100}%`, backgroundColor: color, height: '100%', borderRadius: radius.pill }} />
    </View>
  );
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: space.sm }}>
      <T variant="heading">{title}</T>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={12} accessibilityRole="button">
          <T variant="label" color="primary">{action}</T>
        </Pressable>
      ) : null}
    </Row>
  );
}

export function EmptyState({ icon, title, body, children }: { icon: IconName; title: string; body?: string; children?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: t.surfaceAlt }]}>
        <Icon name={icon} size={28} />
      </View>
      <T variant="heading" style={{ textAlign: 'center' }}>{title}</T>
      {body ? <T color="muted" style={{ textAlign: 'center' }}>{body}</T> : null}
      {children}
    </View>
  );
}

export function Loading() {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg }}>
      <ActivityIndicator color={t.primary} />
    </View>
  );
}

export function ListItem({
  title,
  subtitle,
  icon,
  right,
  onPress,
}: {
  title: string;
  subtitle?: string | null;
  icon?: IconName | string;
  right?: ReactNode;
  onPress?: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.listItem, { opacity: pressed ? 0.7 : 1 }]} accessibilityRole={onPress ? 'button' : undefined}>
      {icon ? (
        <View style={[styles.listIcon, { backgroundColor: t.surfaceAlt }]}>
          <Icon name={icon} size={20} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <T numberOfLines={1}>{title}</T>
        {subtitle ? <T variant="caption" color="muted" numberOfLines={1}>{subtitle}</T> : null}
      </View>
      {right ?? (onPress ? <Icon name="chevron-right" size={20} color={t.textFaint} /> : null)}
    </Pressable>
  );
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.border }} />;
}

const styles = StyleSheet.create({
  screen: { padding: space.lg, gap: space.md, paddingBottom: space.xxl * 2 },
  card: { borderRadius: radius.lg, padding: space.lg, gap: space.sm, borderWidth: StyleSheet.hairlineWidth },
  button: { minHeight: 48, borderRadius: radius.md, paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  chip: { minHeight: 36, paddingHorizontal: space.md, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 6 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, fontSize: 16 },
  track: { height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xxl, paddingHorizontal: space.lg },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56, paddingVertical: space.sm },
  listIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
