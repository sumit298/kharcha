import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useTheme } from '@/components/theme';
import { EmptyState, Loading, Screen } from '@/components/ui';
import { initApp, syncNotifications } from '@/services/app';
import { syncSmsInbox } from '@/services/sms';
import { useAppStore } from '@/store/app';

import { NotificationListener } from '../../modules/notification-listener';
import { SmsReader } from '../../modules/sms-reader';

export default function RootLayout() {
  const t = useTheme();
  const { ready, error, setReady } = useAppStore();

  useEffect(() => {
    initApp()
      .then(() => setReady(true))
      .catch((e: unknown) => setReady(false, e instanceof Error ? e.message : String(e)));
  }, [setReady]);

  useEffect(() => {
    if (!ready) return;
    void syncSmsInbox().catch(() => undefined);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        NotificationListener.requestRebind();
        void syncNotifications().catch(() => undefined);
        void syncSmsInbox().catch(() => undefined);
      }
    });
    const smsPoll = setInterval(() => void syncSmsInbox().catch(() => undefined), 15 * 60_000);
    const unsubscribe = NotificationListener.onQueueChanged(() => {
      void syncNotifications().catch(() => undefined);
      void syncSmsInbox().catch(() => undefined);
    });
    const unsubscribeSms = SmsReader.onSmsChanged(() => void syncSmsInbox().catch(() => undefined));
    return () => {
      appState.remove();
      clearInterval(smsPoll);
      unsubscribe();
      unsubscribeSms();
    };
  }, [ready]);

  return (
    <SafeAreaProvider>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      {error ? (
        <Screen edges={['top']}>
          <EmptyState icon="alert-circle-outline" title="Kharcha couldn't start" body={error} />
        </Screen>
      ) : !ready ? (
        <Loading />
      ) : (
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: t.bg },
            headerTintColor: t.text,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: t.bg },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          <Stack.Screen name="add" options={{ title: 'Add expense', presentation: 'modal' }} />
          <Stack.Screen name="transaction/[id]" options={{ title: 'Transaction' }} />
          <Stack.Screen name="safe-to-spend" options={{ title: 'Safe to spend' }} />
        </Stack>
      )}
    </SafeAreaProvider>
  );
}
