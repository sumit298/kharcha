# Testing Kharcha on your phone

## 1. Install

1. Phone: Settings → About phone → tap *Build number* 7× → Developer options → **USB debugging** on.
   Samsung One UI 6.1.1+: turn off *Auto Blocker* first.
2. Connect USB, accept the "Allow USB debugging" prompt, then on the computer:
   ```bash
   adb devices                       # phone must show as "device"
   npx expo run:android --device     # builds, installs and starts Metro
   ```
3. Keep Metro running while testing (debug build). Shake the phone for the dev menu.

## 2. Grant access

- In the app: onboarding → **Open notification access** → switch Kharcha on.
  If Android says *Restricted setting*: App info → ⋮ → *Allow restricted settings*, then retry.
- Or from the computer:
  ```bash
  adb shell cmd notification allow_listener app.kharcha/expo.modules.notificationlistener.KharchaNotificationListenerService
  ```
- Battery: Settings → Apps → Kharcha → Battery → **Unrestricted** (Xiaomi: also *Autostart* on).
- Android 15+, so bank SMS aren't hidden as "sensitive" (your own phone only):
  ```bash
  adb shell appops set --user 0 app.kharcha RECEIVE_SENSITIVE_NOTIFICATIONS allow
  ```
  then toggle notification access off and on.

## 3. Smoke test without spending money

```bash
adb shell cmd notification post -S bigtext -t 'Payment successful' t1 '₹124 paid to Zomato'
```
(posted as `com.android.shell`; picked up because it contains an amount). Open Kharcha → the
payment appears on Home, categorized as Food › Food Delivery. Settings → *Captured notifications*
shows what the listener recorded and what the pipeline decided.

## 4. Real-world checklist (Phase 6)

For a few days, use your phone normally, then check each item:

- [ ] A UPI payment from Google Pay / PhonePe / Paytm appears once, even when the bank SMS also
      arrives (check *Captured notifications*: one `parsed`, one `merged`).
- [ ] A card payment SMS is recorded with the right merchant.
- [ ] Money received shows as income, not spending.
- [ ] OTPs, offers, "will be debited" AutoPay notices and bill reminders do **not** create
      transactions (status `not_financial` with a reason).
- [ ] Self-transfer between your own accounts becomes one transfer, not spending.
- [ ] After the phone was idle overnight, new payments still arrive (battery settings).
- [ ] Changing a merchant's category once applies to its next payment.

## 5. When something is misread

1. Settings → *Captured notifications* shows the exact text and the status/reason.
2. **Anonymize** it: replace names, account digits, references, phone numbers and amounts.
3. Add it as a fixture in `test/fixtures/notifications/index.ts` with the expected result, fix
   the parser until `npm run check` passes, then bump `PIPELINE_VERSION` in
   `src/services/pipeline/pipeline.ts`. On next start, failed/unread events are re-processed.

Never commit real notification text (see CLAUDE.md).

## 6. Before daily use

Create a personal release keystore and keep it safe. Reinstalling with a different signing key
forces an uninstall, which deletes all data. Make a JSON backup (Settings → Export, backup &
restore) before any reinstall.
