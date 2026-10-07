import { View } from 'react-native';

import { space, useTheme } from './theme';
import { Row, T } from './ui';

/** Simple vertical bar chart: one bar per value, optional sparse labels. Pure Views, no SVG. */
export function Bars({ values, labels, height = 96, highlightIndex }: { values: number[]; labels?: (string | null)[]; height?: number; highlightIndex?: number }) {
  const t = useTheme();
  const max = Math.max(1, ...values);
  return (
    <View style={{ gap: space.xs }}>
      <Row gap={2} style={{ height, alignItems: 'flex-end' }}>
        {values.map((v, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: Math.max(v > 0 ? 3 : 1, (Math.max(0, v) / max) * height),
              backgroundColor: i === highlightIndex ? t.primary : v > 0 ? t.primary + '88' : t.border,
              borderTopLeftRadius: 3,
              borderTopRightRadius: 3,
            }}
          />
        ))}
      </Row>
      {labels ? (
        <Row gap={2}>
          {labels.map((l, i) => (
            <View key={i} style={{ flex: 1, alignItems: 'center' }}>
              {l ? <T variant="caption" color="faint" numberOfLines={1}>{l}</T> : null}
            </View>
          ))}
        </Row>
      ) : null}
    </View>
  );
}

/** Horizontal share bar for ranked lists. */
export function ShareBar({ fraction, color }: { fraction: number; color?: string }) {
  const t = useTheme();
  return (
    <View style={{ height: 6, backgroundColor: t.surfaceAlt, borderRadius: 3, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(1, fraction)) * 100}%`, height: '100%', backgroundColor: color ?? t.primary }} />
    </View>
  );
}
