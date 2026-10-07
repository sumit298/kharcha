import { useState } from 'react';
import { View } from 'react-native';

import type { CategoryLookup } from '@/hooks/useQuery';
import type { CategoryKind } from '@/types';

import { space } from './theme';
import { Chip, T } from './ui';

export interface CategoryChoice {
  categoryId: string;
  subcategoryId: string | null;
}

/** Two-step picker: top-level category chips, then optional subcategory chips. */
export function CategoryPicker({
  categories,
  value,
  onChange,
  kinds = ['expense'],
}: {
  categories: CategoryLookup;
  value: CategoryChoice | null;
  onChange: (choice: CategoryChoice) => void;
  kinds?: CategoryKind[];
}) {
  const [open, setOpen] = useState<string | null>(value?.categoryId ?? null);
  const tops = categories.topLevel.filter((c) => kinds.includes(c.kind));
  const children = open ? categories.childrenOf(open) : [];
  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {tops.map((c) => (
          <Chip
            key={c.id}
            label={c.name}
            icon={c.icon}
            selected={value?.categoryId === c.id}
            onPress={() => {
              setOpen(c.id);
              onChange({ categoryId: c.id, subcategoryId: null });
            }}
          />
        ))}
      </View>
      {children.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <T variant="label" color="muted">{categories.name(open)}</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {children.map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                icon={c.icon}
                selected={value?.subcategoryId === c.id}
                onPress={() => onChange({ categoryId: open as string, subcategoryId: c.id })}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}
