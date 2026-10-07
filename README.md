# Kharcha

A local-first Android expense tracker for India. Kharcha reads payment notifications from UPI
apps and banks, with an optional direct bank-SMS fallback for payments whose notifications are
custom-rendered or hidden by Android. It records and categorizes each payment automatically, so
you only review the exceptions instead of typing every expense.

- **Automatic:** notification access tracks payment events; optional Bank SMS access fills in
  amounts that UPI notifications do not expose.
- **Private:** all data stays on the phone. No account, no server, no analytics, no AI/LLM parsing.
- **Built with:** Expo SDK 57 (React Native, TypeScript), SQLite, and two small Kotlin modules.

> Status: Core features and the direct SMS fallback are implemented. Real-device testing and
> parser tuning are in progress. See [docs/DEVICE_TESTING.md](docs/DEVICE_TESTING.md).

---

## Features

### Automatic tracking
- **Notification listener:** a Kotlin `NotificationListenerService` keeps notifications from
  known payment, bank, card and merchant apps, plus notifications that mention money (₹ / Rs /
  INR). They go into a durable on-device queue, so nothing is lost if the app isn't running.
- **Supported sources:**
  - UPI apps: Google Pay, PhonePe, Paytm, BHIM, CRED, Amazon Pay, MobiKwik
  - Direct bank SMS inbox reading through the optional `READ_SMS` permission; this works
    independently of whether Messages or Truecaller exposes the SMS text in its notification
  - Bank-SMS notification copies from Google Messages, Samsung Messages, AOSP/Xiaomi Messaging
    and Truecaller when Android exposes them
  - Bank apps: HDFC, SBI, ICICI, Axis, Kotak, IDFC and others
  - Merchant apps: Zomato, Swiggy, Blinkit, Zepto, Uber, Ola, Rapido, IRCTC, Netflix, Spotify
  - Unknown apps are still read when they mention an amount.
- **Bank SMS fallback:** when enabled in Settings, Kharcha reads recent money-looking rows from
  the phone's SMS inbox on app start/resume, after a new SMS arrives, and during a periodic poll.
  It uses the same parser, categorization and deduplication pipeline as notifications. This is
  the reliable path for GPay, PhonePe and other UPI apps that use custom `RemoteViews`, and for
  Android 15+ devices that replace bank-SMS notification text with “Sensitive notification
  content hidden”.
- **Look-alikes are rejected:** OTPs (their text is discarded), cashback and loan offers,
  promotional SMS (`-P` sender IDs), collect requests, AutoPay set-up, "₹649 will be debited
  on…" pre-debit notices, bill-due reminders, statements and balance-only alerts.
- **What gets extracted:**
  - amount and currency
  - debit or credit
  - merchant or payer, and UPI ID
  - UPI reference (RRN/UTR)
  - account/card last 4 digits (never more)
  - payment method (UPI, UPI Lite, card, NEFT/IMPS/RTGS, ATM, AutoPay, wallet)
  - date and time
  - status (success, failed, pending)
- **Transaction types:**
  - Spending, income and refunds
  - Reversals of failed payments are linked to the original payment
  - Transfers, which never count as spending: credit-card bill payments, UPI Lite/wallet
    top-ups, ATM withdrawals, self-transfers, and investments (e.g. Zerodha, Groww)
- **Deduplication:** one payment seen by GPay *and* the bank SMS is recorded once (matched by
  UPI reference, or by amount + time + merchant/account). Uncertain matches go to Review as
  "possible duplicate". Nothing is deleted silently.
- **Re-processing:** raw notifications and imported SMS events are kept, so payments are
  recovered when a parser is improved.

### Categorization
- 13 categories and about 70 subcategories (Food & Dining, Transportation, Housing,
  Shopping, Health, Entertainment, Bills & Subscriptions, Finance, Education, Travel, Personal,
  Income, Transfers).
- Rules apply in this order: **your rules → learned rules → built-in merchant list (~70 Indian
  merchants) → app hint → keywords (petrol, pharmacy, tea…) → Review**.
- **Learning:** change a category once (e.g. a tea stall → Snacks) and future payments to that
  merchant or UPI ID follow it. Other pending payments from the same merchant update too.
- Payments to a personal UPI ID (phone-number handle) ask whether they were a transfer to
  family.

### Screens
| Screen | What it does |
|---|---|
| **Onboarding** | Welcome, explanation of notification access, permission and battery setup, monthly budget, choose categories |
| **Home** | Safe to spend per day, today, this month, budget progress (total and per category), where the money went, upcoming bills, recent transactions, "Automatic tracking is paused" warning, Add button |
| **Safe to spend** | The full calculation: budget − spent − upcoming bills ÷ days left |
| **Add expense** | Amount + category is enough; merchant, note and date are optional; expense or income |
| **Transactions** | Search, period filters, spending/income/transfer filters, automatic/manual filters, category filters, grouped by day (Today, Yesterday, …) |
| **Transaction detail** | Change type, category (remembered), account, merchant, amount and note; ignore or delete |
| **Review** | Uncategorized payments (one-tap category chips), possible duplicates, failed payments, possible transfers, low-confidence reads, and notifications that couldn't be read or that Android hid; includes **Sync now**, a live sync spinner and last-sync timer |
| **Insights** | Monthly total, income vs spending, change vs last month, category breakdown, daily and weekly bars, **Where am I spending?** (by merchant or by app; tap to see the transactions), largest expenses, recurring payments |
| **Settings** | Listener status and last capture, optional Bank SMS permission/status, battery settings, and the screens below |
| ↳ Budgets | Total monthly budget and optional per-category budgets |
| ↳ Recurring payments | Rent, EMIs, subscriptions: amount, frequency, day; mark as paid, pause, delete |
| ↳ Accounts | Bank, credit card, wallet, UPI Lite, cash, with optional last 4 digits so SMS link to the account |
| ↳ Merchant & app rules | Add or edit rules (name, match field, category, transfer flag, payment method, notes); see learned and built-in rules |
| ↳ Categories | Create, rename, add subcategories, delete custom ones |
| ↳ Supported apps | The apps and banks Kharcha knows |
| ↳ Export, backup & restore | CSV export, full JSON backup, restore from backup, delete all data |
| ↳ Privacy | What is read, what is stored, what is never stored |
| ↳ Captured notifications | Debug view: everything the listener recorded and what the pipeline decided |

Light and dark mode follow the system setting.

### Not implemented yet
- Importing CSV from other apps (restore works only from a Kharcha JSON backup).
- Cloud backup/sync, widgets, receipt scanning, AI insights (planned for later; the database
  is already designed to support sync).
- Automatically matching recurring payments to transactions (use **Mark paid**).

---

## Setup

### Requirements
- Node ≥ 22.13 (Node 24 recommended; tests use `node:sqlite`)
- JDK 17
- Android SDK (platform 36+, build tools) and NDK 27.1
- An Android phone with USB debugging, or an emulator

**macOS (Apple Silicon), without Android Studio:**
```bash
brew install --cask temurin@17 android-commandlinetools
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator
sdkmanager --licenses
sdkmanager "platform-tools" "emulator" "platforms;android-36" "build-tools;36.0.0" "ndk;27.1.12297006" \
  "system-images;android-35;google_apis;arm64-v8a"      # arm64, not x86_64, on Apple Silicon
```
Put the three `export` lines in `~/.zshrc`. With Android Studio instead, use
`ANDROID_HOME=$HOME/Library/Android/sdk`. **Linux:** `ANDROID_HOME=$HOME/Android/Sdk`.

If the build says *SDK location not found*, `ANDROID_HOME` isn't set in that terminal. Either
export it, or create `android/local.properties` containing `sdk.dir=<your ANDROID_HOME>`.
`npx expo prebuild --clean` deletes that file, so prefer the environment variable.

### Install and check
```bash
npm install            # the project .npmrc sets legacy-peer-deps (see below)
npm run check          # typecheck + unit tests (run with TZ=Asia/Kolkata)
npm run lint
```
Expo SDK 57 ships conflicting *optional* peer ranges (`react-dom`, `react-native-worklets`), so
plain npm refuses to install. The checked-in `.npmrc` (`legacy-peer-deps=true`) avoids this, and
the peers the app really needs (`react-dom`, `expo-modules-core`, `@react-native/jest-preset`)
are pinned in `package.json`. Always add packages with `npx expo install <pkg>`.

### Run on an emulator
```bash
avdmanager create avd -n pixel -k "system-images;android-35;google_apis;arm64-v8a"
emulator -avd pixel &          # wait for the home screen
npx expo run:android
```

### Run on a phone
```bash
adb devices                       # the phone must be listed as "device"
npx expo run:android --device     # builds, installs, starts Metro
```
**No cable?** Wireless debugging (Developer options → Wireless debugging → *Pair device with
pairing code*, then `adb pair <ip>:<pairing-port>` and `adb connect <ip>:<port>`) needs the Mac
and phone on the same Wi‑Fi *with device-to-device traffic allowed*. Hostel/PG and office
networks usually block it ("protocol fault" on `adb pair`). Use a USB cable once, or a
hotspot from a third device.

Samsung One UI 6.1.1+: turn off *Auto Blocker* first. Always install with adb/`expo run`:
Play Protect blocks notification-listener apps installed from a browser or file manager.

After changing native code or `app.json`, regenerate the Android project:
```bash
npx expo prebuild -p android --clean
```
`android/` is generated and git-ignored. Never edit it by hand. Native code lives only in
`modules/`.

### Grant access
- In the app, tap **Open notification access** during onboarding and switch Kharcha on.
  If Android says *Restricted setting*: App info → ⋮ → *Allow restricted settings*.
- In **Settings**, tap **Enable bank SMS fallback** and allow `READ_SMS`. This is recommended on
  Android 15+ because Android may redact bank-SMS notification content, and UPI apps may render
  payment amounts in custom layouts that notification listeners cannot read.
- Or, for development:
  ```bash
  adb shell cmd notification allow_listener app.kharcha/expo.modules.notificationlistener.KharchaNotificationListenerService
  ```
- Set the battery setting to **Unrestricted** (on Xiaomi, also turn on *Autostart*).
- The `RECEIVE_SENSITIVE_NOTIFICATIONS` ADB app-op is optional and may be blocked by the phone
  manufacturer. It is not required when the direct Bank SMS fallback is enabled.

### Try it without spending money
```bash
adb shell cmd notification post -S bigtext -t 'Payment successful' t1 '₹124 paid to Zomato'
adb emu sms send AXHDFCBK 'Sent Rs.124.00 From HDFC Bank A/C *1234 To ZOMATO LTD On 01/10/26 Ref 612345678902'   # emulator only
```
Both describe the same payment, so it is recorded once, as Zomato under Food › Food Delivery.

### Before daily use
Create a personal release keystore and keep it safe. Reinstalling with a different signing key
forces an uninstall, which deletes all data. Make a JSON backup before any reinstall.

---

## Project layout

```
src/
  app/              Screens (Expo Router): (tabs)/, add, transaction/[id], safe-to-spend,
                    onboarding, settings/*
  components/       Theme (light/dark) and UI components
  hooks/            useQuery, useCategories
  store/            Zustand (UI state only; SQLite is the source of truth)
  domain/           Pure logic: categories, merchants, budgets, safe-to-spend, recurring, analytics
  services/
    notification/   Known apps, normalization, SMS sender parsing, queue drain
    detection/      Is this notification a real transaction?
    parser/         Shared extractors, bank/app profiles, generic parsers, registry
    categorization/ Rules engine and learning from corrections
    deduplication/  Same-payment matching
    pipeline/       normalize → detect → parse → categorize → dedup → save
    transactions/   User actions (quick add, set category, review answers)
    data/           CSV export, JSON backup/restore
  database/         SqlDatabase interface, expo-sqlite and node:sqlite adapters,
                    migrations, repositories
modules/notification-listener/   Kotlin listener, queue database, JS bridge
modules/sms-reader/              Kotlin SMS inbox reader, content observer, JS bridge
test/fixtures/notifications/     Synthetic notification examples (45 cases)
docs/ARCHITECTURE.md             The design contract (pipeline, dedup, accounting rules)
docs/DEVICE_TESTING.md           Phone testing guide and checklist
```

## Adding a bank or app
1. Add the app's package name to `src/services/notification/knownApps.ts`.
2. Add a `ParserProfile` to `src/services/parser/profiles.ts`, with its package name, SMS sender
   IDs, and optionally a regex template for its exact format.
3. Add **anonymized** examples to `test/fixtures/notifications/index.ts` and run
   `npm run check`.
4. Bump `PIPELINE_VERSION` in `src/services/pipeline/pipeline.ts` so stored notifications that
   couldn't be read before are re-processed.

## Privacy rules for contributors
Never commit real SMS, notification text, names, account numbers or transactions. Fixtures
are synthetic. There is no network access with user data and no analytics or crash SDKs.
