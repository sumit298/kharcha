import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

type EventSubscription = { remove(): void };

export interface SmsInboxRow {
  id: number;
  address: string;
  body: string;
  date: number;
}

export interface SmsSyncCursor {
  at: number;
  id: number;
}

interface NativeModuleShape {
  hasReadPermission(): boolean;
  getLastSyncCursor(): SmsSyncCursor;
  getLastSyncAt(): number;
  setLastSyncCursor(at: number, id: number): void;
  setLastSyncCompletedAt(at: number): void;
  setLastSyncAt(at: number): void;
  readInbox(sinceMs: number, sinceId: number, limit: number): Promise<SmsInboxRow[]>;
  addListener(event: 'onSmsChanged', listener: () => void): EventSubscription;
}

const native = Platform.OS === 'android' ? requireOptionalNativeModule<NativeModuleShape>('SmsReader') : null;

export const isAvailable = native !== null;

export const SmsReader = {
  isAvailable,
  hasReadPermission: (): boolean => native?.hasReadPermission() ?? false,
  getLastSyncCursor: (): SmsSyncCursor => native?.getLastSyncCursor() ?? { at: 0, id: 0 },
  getLastSyncAt: (): number => native?.getLastSyncAt() ?? 0,
  setLastSyncCursor: (at: number, id: number): void => native?.setLastSyncCursor(at, id),
  setLastSyncCompletedAt: (at: number): void => native?.setLastSyncCompletedAt(at),
  setLastSyncAt: (at: number): void => native?.setLastSyncAt(at),
  readInbox: (sinceMs: number, sinceId: number, limit = 200): Promise<SmsInboxRow[]> => native?.readInbox(sinceMs, sinceId, limit) ?? Promise.resolve([]),
  onSmsChanged(listener: () => void): () => void {
    const sub = native?.addListener('onSmsChanged', listener);
    return () => sub?.remove();
  },
};
