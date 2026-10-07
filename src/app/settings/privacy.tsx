import { Stack } from 'expo-router';

import { Card, Screen, T } from '@/components/ui';

const POINTS: [string, string][] = [
  ['Why notification access?', 'Banks and UPI apps tell you about every payment through notifications. Reading them is how Kharcha records spending without you typing it in.'],
  ['What is read', 'Notifications that mention money (₹, Rs, INR) or come from payment, bank and SMS apps. If you enable Bank SMS access, Kharcha also reads recent money-looking SMS from the phone inbox.'],
  ['What is stored', 'Amount, merchant, date, app, the last 4 digits of the account, the UPI reference, and the notification text so a misread payment can be fixed later.'],
  ['Never stored', 'OTPs (discarded on sight), UPI PINs, passwords, CVVs, full card or account numbers.'],
  ['Where it lives', 'Only on this phone, in Kharcha’s private storage. There is no Kharcha server, no account, no analytics and no crash reporting. Nothing is sent over the internet.'],
  ['You are in control', 'Export or back up whenever you want, and delete everything from Settings → Export, backup & restore. Turning off notification access stops tracking immediately.'],
];

export default function PrivacyScreen() {
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Privacy' }} />
      {POINTS.map(([title, body]) => (
        <Card key={title}>
          <T variant="heading">{title}</T>
          <T color="muted">{body}</T>
        </Card>
      ))}
    </Screen>
  );
}
