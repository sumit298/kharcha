import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

type EventSubscription = { remove(): void };

export interface SmsInboxRow {
  id: number;
  address: string;
  body: string;
  date: number;
}

interface NativeModuleShape {
  hasReadPermission(): boolean;
  getLastSyncAt(): number;
  setLastSyncAt(at: number): void;
  readInbox(sinceMs: number, limit: number): Promise<SmsInboxRow[]>;
  addListener(event: 'onSmsChanged', listener: () => void): EventSubscription;
}

const native = Platform.OS === 'android' ? requireOptionalNativeModule<NativeModuleShape>('SmsReader') : null;

export const isAvailable = native !== null;

export const SmsReader = {
  isAvailable,
  hasReadPermission: (): boolean => native?.hasReadPermission() ?? false,
  getLastSyncAt: (): number => native?.getLastSyncAt() ?? 0,
  setLastSyncAt: (at: number): void => native?.setLastSyncAt(at),
  readInbox: (sinceMs: number, limit = 200): Promise<SmsInboxRow[]> => native?.readInbox(sinceMs, limit) ?? Promise.resolve([]),
  onSmsChanged(listener: () => void): () => void {
    const sub = native?.addListener('onSmsChanged', listener);
    return () => sub?.remove();
  },
};
