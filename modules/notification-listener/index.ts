import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

type EventSubscription = { remove(): void };

export interface QueueRow {
  id: number;
  /** JSON of RawNotificationPayload. */
  payload: string;
}

export interface ListenerStatus {
  permissionGranted: boolean;
  connected: boolean;
  connectionChangedAt: number;
  lastEventAt: number;
  pending: number;
}

interface NativeModuleShape {
  isPermissionGranted(): boolean;
  getStatus(): ListenerStatus;
  openPermissionSettings(): void;
  openBatterySettings(): void;
  requestRebind(): void;
  setAllowlist(packages: string[]): void;
  readQueue(limit: number): Promise<QueueRow[]>;
  ackQueue(ids: number[]): Promise<void>;
  clearQueue(): Promise<void>;
  addListener(event: 'onQueueChanged', listener: (e: { pending: number }) => void): EventSubscription;
}

/** null on platforms/builds without the native module (web, Expo Go, Jest). */
const native = Platform.OS === 'android' ? requireOptionalNativeModule<NativeModuleShape>('NotificationListener') : null;

export const isAvailable = native !== null;

const UNAVAILABLE: ListenerStatus = { permissionGranted: false, connected: false, connectionChangedAt: 0, lastEventAt: 0, pending: 0 };

export const NotificationListener = {
  getStatus: (): ListenerStatus => native?.getStatus() ?? UNAVAILABLE,
  openPermissionSettings: () => native?.openPermissionSettings(),
  openBatterySettings: () => native?.openBatterySettings(),
  requestRebind: () => native?.requestRebind(),
  setAllowlist: (packages: string[]) => native?.setAllowlist(packages),
  readQueue: (limit = 100): Promise<QueueRow[]> => native?.readQueue(limit) ?? Promise.resolve([]),
  ackQueue: (ids: number[]): Promise<void> => native?.ackQueue(ids) ?? Promise.resolve(),
  clearQueue: (): Promise<void> => native?.clearQueue() ?? Promise.resolve(),
  onQueueChanged(listener: (pending: number) => void): () => void {
    const sub = native?.addListener('onQueueChanged', (e) => listener(e.pending));
    return () => sub?.remove();
  },
};
