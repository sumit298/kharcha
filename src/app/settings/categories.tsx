import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { space } from '@/components/theme';
import { Button, Card, Chip, Divider, Field, Icon, Row, Screen, T } from '@/components/ui';
import { categoryRepo } from '@/database/repositories';
import { useCategories } from '@/hooks/useQuery';
import { write } from '@/services/app';
import type { Category } from '@/types';
import { newId } from '@/utils/ids';

export default function CategoriesScreen() {
  const categories = useCategories();
  const [editing, setEditing] = useState<{ category: Category | null; parentId: string | null } | null>(null);
  const [name, setName] = useState('');

  const open = (category: Category | null, parentId: string | null) => {
    setEditing({ category, parentId });
    setName(category?.name ?? '');
  };

  const save = async () => {
    if (!editing || !name.trim()) return;
    const now = Date.now();
    const parent = editing.parentId ? categories.byId.get(editing.parentId) : undefined;
    const c = editing.category;
    await write((db) =>
      categoryRepo.upsert(db, c ? { ...c, name: name.trim(), updatedAt: now } : {
        id: newId(now),
        name: name.trim(),
        parentId: editing.parentId,
        kind: parent?.kind ?? 'expense',
        icon: parent?.icon ?? 'tag-outline',
        color: parent?.color ?? '#828282',
        isSystem: false,
        sortOrder: (parent?.sortOrder ?? 9000) + 90,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }),
    );
    setEditing(null);
  };

  const remove = (c: Category) =>
    Alert.alert(`Delete ${c.name}?`, 'Its transactions become uncategorized.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => write((db) => categoryRepo.remove(db, c.id, Date.now())) },
    ]);

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Categories' }} />
      {editing ? (
        <Card>
          <T variant="heading">{editing.category ? 'Rename' : editing.parentId ? `New subcategory in ${categories.name(editing.parentId)}` : 'New category'}</T>
          <Field value={name} onChangeText={setName} placeholder="Name" autoFocus />
          <Row>
            <Button kind="secondary" label="Cancel" onPress={() => setEditing(null)} style={{ flex: 1 }} />
            <Button label="Save" onPress={save} style={{ flex: 1 }} />
          </Row>
        </Card>
      ) : (
        <Button icon="plus" label="New category" onPress={() => open(null, null)} />
      )}
      {categories.topLevel.map((top) => (
        <Card key={top.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Row>
              <Icon name={top.icon ?? 'tag'} color={top.color ?? undefined} />
              <T variant="heading">{top.name}</T>
            </Row>
            <Row>
              <Chip label="Rename" onPress={() => open(top, null)} />
              {!top.isSystem ? <Chip label="Delete" onPress={() => remove(top)} /> : null}
            </Row>
          </Row>
          <Divider />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {categories.childrenOf(top.id).map((sub) => (
              <Chip key={sub.id} label={sub.name} onPress={() =>
                Alert.alert(sub.name, undefined, [
                  { text: 'Rename', onPress: () => open(sub, top.id) },
                  ...(sub.isSystem ? [] : [{ text: 'Delete', style: 'destructive' as const, onPress: () => remove(sub) }]),
                  { text: 'Cancel', style: 'cancel' as const },
                ])
              } />
            ))}
            <Chip label="Add" icon="plus" onPress={() => open(null, top.id)} />
          </View>
        </Card>
      ))}
    </Screen>
  );
}
