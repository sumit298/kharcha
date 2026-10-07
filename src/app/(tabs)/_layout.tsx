import type { ColorValue } from 'react-native';
import { Redirect, Tabs } from 'expo-router';

import { useTheme } from '@/components/theme';
import { Icon, Loading } from '@/components/ui';
import { useQuery } from '@/hooks/useQuery';
import { transactionRepo } from '@/database/repositories';
import { isOnboarded } from '@/services/queries';

export default function TabsLayout() {
  const t = useTheme();
  const { data: onboarded } = useQuery((db) => isOnboarded(db));
  const { data: reviewCount = 0 } = useQuery((db) => transactionRepo.countNeedsReview(db));
  if (onboarded === undefined) return <Loading />;
  if (!onboarded) return <Redirect href="/onboarding" />;
  const icon = (name: string) =>
    function TabIcon({ color }: { color: ColorValue }) {
      return <Icon name={name} color={color as string} size={24} />;
    };
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: t.bg },
        headerTintColor: t.text,
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.border },
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.textFaint,
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', headerShown: false, tabBarIcon: icon('home-variant-outline') }} />
      <Tabs.Screen name="transactions" options={{ title: 'Transactions', tabBarIcon: icon('format-list-bulleted') }} />
      <Tabs.Screen
        name="review"
        options={{ title: 'Review', tabBarIcon: icon('inbox-outline'), tabBarBadge: reviewCount > 0 ? reviewCount : undefined }}
      />
      <Tabs.Screen name="insights" options={{ title: 'Insights', tabBarIcon: icon('chart-donut') }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: icon('cog-outline') }} />
    </Tabs>
  );
}
