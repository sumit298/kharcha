import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState, View } from 'react-native';

import { space, useTheme } from '@/components/theme';
import { Button, Card, Chip, Field, Icon, Row, Screen, T } from '@/components/ui';
import { budgetRepo, settingsRepo } from '@/database/repositories';
import { useCategories } from '@/hooks/useQuery';
import { write } from '@/services/app';
import { saveBudget } from '@/services/budgets';
import { SETTINGS } from '@/services/queries';
import { parseAmountInput } from '@/utils/money';

import { NotificationListener, isAvailable } from '../../modules/notification-listener';

type Step = 'welcome' | 'access' | 'budget' | 'categories';

function Bullet({ icon, text }: { icon: string; text: string }) {
  const t = useTheme();
  return (
    <Row style={{ alignItems: 'flex-start' }} gap={space.md}>
      <Icon name={icon} color={t.primary} />
      <T style={{ flex: 1 }}>{text}</T>
    </Row>
  );
}

export default function Onboarding() {
  const t = useTheme();
  const categories = useCategories();
  const [step, setStep] = useState<Step>('welcome');
  const [granted, setGranted] = useState(NotificationListener.getStatus().permissionGranted);
  const [budget, setBudget] = useState('');
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && setGranted(NotificationListener.getStatus().permissionGranted));
    return () => sub.remove();
  }, []);

  const finish = async () => {
    await write(async (db) => {
      const amount = parseAmountInput(budget);
      if (amount) await saveBudget(db, await budgetRepo.list(db), null, amount);
      for (const id of hidden) {
        await db.runAsync('UPDATE categories SET deleted_at = ?, updated_at = ? WHERE id = ? OR parent_id = ?', [Date.now(), Date.now(), id, id]);
      }
      await settingsRepo.set(db, SETTINGS.onboarded, true, Date.now());
    });
    router.replace('/');
  };

  return (
    <Screen edges={['top', 'bottom']}>
      {step === 'welcome' ? (
        <View style={{ gap: space.lg, paddingTop: space.xxl }}>
          <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: t.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="wallet-outline" size={34} color={t.primary} />
          </View>
          <T variant="title" style={{ fontSize: 30 }}>Track spending without typing it in</T>
          <Bullet icon="bell-ring-outline" text="Kharcha reads payment notifications from UPI apps, bank apps and bank SMS, and records each payment for you." />
          <Bullet icon="tag-outline" text="Payments are sorted into categories automatically. Fix one and Kharcha remembers." />
          <Bullet icon="inbox-outline" text="Anything it isn't sure about waits in Review, so it takes seconds, not minutes." />
          <Bullet icon="shield-lock-outline" text="Everything stays on this phone. No account, no server, no ads." />
          <Button label="Get started" onPress={() => setStep('access')} />
        </View>
      ) : null}

      {step === 'access' ? (
        <View style={{ gap: space.lg, paddingTop: space.xl }}>
          <T variant="title">Allow notification access</T>
          <T color="muted">
            Android will ask you to allow Kharcha to read notifications. Kharcha only keeps ones about money and discards OTPs immediately. Nothing leaves your phone.
          </T>
          <Card>
            <Bullet icon="numeric-1-circle-outline" text="Tap the button below and switch Kharcha on." />
            <Bullet icon="numeric-2-circle-outline" text="If Android says the setting is restricted, open App info → ⋮ → Allow restricted settings, then try again." />
            <Bullet icon="numeric-3-circle-outline" text="In battery settings, set Kharcha to Unrestricted so your phone doesn’t stop it." />
          </Card>
          {granted ? (
            <Row>
              <Icon name="check-circle" color={t.positive} />
              <T color="positive">Notification access is on</T>
            </Row>
          ) : (
            <Button label={isAvailable ? 'Open notification access' : 'Not available in this build'} disabled={!isAvailable} onPress={() => NotificationListener.openPermissionSettings()} />
          )}
          <Button kind="secondary" label="Battery settings" onPress={() => NotificationListener.openBatterySettings()} disabled={!isAvailable} />
          <Button kind={granted ? 'primary' : 'ghost'} label={granted ? 'Continue' : 'Skip for now'} onPress={() => setStep('budget')} />
        </View>
      ) : null}

      {step === 'budget' ? (
        <View style={{ gap: space.lg, paddingTop: space.xl }}>
          <T variant="title">Monthly budget</T>
          <T color="muted">How much do you want to spend in a month? Kharcha turns this into a safe daily amount.</T>
          <Field value={budget} onChangeText={setBudget} keyboardType="number-pad" placeholder="₹ 25,000" autoFocus accessibilityLabel="Monthly budget" />
          <Row style={{ flexWrap: 'wrap' }}>
            {[15000, 25000, 40000, 60000].map((v) => (
              <Chip key={v} label={`₹${v.toLocaleString('en-IN')}`} selected={budget === String(v)} onPress={() => setBudget(String(v))} />
            ))}
          </Row>
          <Button label="Continue" onPress={() => setStep('categories')} />
          <Button kind="ghost" label="Skip" onPress={() => { setBudget(''); setStep('categories'); }} />
        </View>
      ) : null}

      {step === 'categories' ? (
        <View style={{ gap: space.lg, paddingTop: space.xl }}>
          <T variant="title">Your categories</T>
          <T color="muted">Untick any you’ll never use. You can add and rename categories later.</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {categories.topLevel.filter((c) => c.kind === 'expense').map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                icon={c.icon}
                selected={!hidden.has(c.id)}
                onPress={() => {
                  const next = new Set(hidden);
                  if (next.has(c.id)) next.delete(c.id);
                  else next.add(c.id);
                  setHidden(next);
                }}
              />
            ))}
          </View>
          <Button label="Show my dashboard" onPress={finish} />
        </View>
      ) : null}
    </Screen>
  );
}
