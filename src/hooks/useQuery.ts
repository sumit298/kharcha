import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { categoryRepo } from '@/database/repositories';
import type { SqlDatabase } from '@/database/sql';
import { getDb } from '@/services/app';
import { useAppStore } from '@/store/app';
import type { Category } from '@/types';

/**
 * Runs `fn` against the DB; re-runs when data changes, when `key` changes (pass whatever the query
 * depends on, e.g. an id or a serialized filter) or when the screen regains focus.
 */
export function useQuery<T>(fn: (db: SqlDatabase) => Promise<T>, key: string | number = ''): { data: T | undefined; reload: () => void } {
  const version = useAppStore((s) => s.dataVersion);
  const [data, setData] = useState<T>();
  const fnRef = useRef(fn);
  useLayoutEffect(() => {
    fnRef.current = fn;
  });
  const load = useCallback(() => {
    let alive = true;
    fnRef.current(getDb()).then((value) => alive && setData(value)).catch((e) => console.warn('query failed', e));
    return () => {
      alive = false;
    };
  }, []);
  // Re-run when data was written or the query's key changed.
  useEffect(load, [load, version, key]);
  useFocusEffect(load);
  return { data, reload: load };
}

export interface CategoryLookup {
  list: Category[];
  byId: Map<string, Category>;
  topLevel: Category[];
  childrenOf: (id: string) => Category[];
  name: (id: string | null | undefined) => string;
}

export function useCategories(): CategoryLookup {
  const { data = [] } = useQuery((db) => categoryRepo.list(db));
  const byId = new Map(data.map((c) => [c.id, c]));
  return {
    list: data,
    byId,
    topLevel: data.filter((c) => c.parentId === null),
    childrenOf: (id) => data.filter((c) => c.parentId === id),
    name: (id) => (id ? (byId.get(id)?.name ?? 'Unknown') : 'Uncategorized'),
  };
}
