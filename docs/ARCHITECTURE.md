# Kharcha — Architecture

Kharcha is a local-first Android expense tracker. It records spending automatically from
transaction notifications (UPI apps, bank apps, card apps, and bank SMS surfaced by the SMS
app), so the user reviews exceptions instead of typing every expense.

This document is the contract every module is built against. Change it deliberately.

## 1. Principles

1. **Never lose a transaction.** Every notification that looks financial is stored raw before
   anything else happens. Parsing can fail; storage cannot.
2. **Raw first, re-parse later.** Raw events are immutable and kept. When a parser improves,
   stored events can be re-processed (idempotently).
3. **Deterministic parsing.** No LLM or network calls. Regex/rule based, unit-tested against
   fixtures.
4. **Local-first & private.** No backend, no analytics SDKs, no crash reporters. Data lives in
   SQLite on the phone. Export is user-initiated.
5. **Minimal native code.** Kotlin only captures and queues notifications. All logic is
   TypeScript.
6. **Merchant, category and source app are separate facts.** "Zomato" (merchant) →
   "Food Delivery" (category), seen via "Google Pay" or "HDFC SMS" (source app). Never
   conflate them.

## 2. Stack

| Concern | Choice | Why |
|---|---|---|
| App framework | Expo SDK 57 (React Native 0.86, New Architecture) with CNG | Recommended RN framework; `android/` is generated, native code lives in `modules/` |
| Native capture | Local Expo modules `modules/notification-listener` and `modules/sms-reader` (Kotlin) | UPI layouts and Android sensitive-notification redaction require a direct SMS fallback |
| Database | `expo-sqlite` (WAL, foreign keys on) | Maintained, first-party |
| Navigation | Expo Router (built on React Navigation) | Expo default |
| State | Zustand (UI state only; the DB is the source of truth) | Small, predictable |
| Tests | Jest (`jest-expo` preset); repositories tested on real SQLite via `node:sqlite` | Fast, no emulator needed |

## 3. End-to-end flow

```
Android notification
  → NotificationListenerService (Kotlin)
      · drop group summaries, ongoing notifications, our own package
      · keep if package is in the allowlist OR text matches a money pattern (₹/Rs/INR + digits)
      · write RawNotificationPayload to native queue (queue.db, owned only by Kotlin)
      · if the JS app is running, emit "queueChanged"
  → JS drain (on app start, on resume, on "queueChanged")
      · read queue rows → insert into raw_events (unique content hash ⇒ idempotent) → ack queue
  → Pipeline (TypeScript, per raw event)
      1. normalize      RawNotificationPayload → NotificationEvent[] (one per SMS message)
      2. detect         is this financial? (not OTP, not promo, not "request money", …)
      3. parse          parser registry, highest priority first → ParsedTransaction | failure
                        (app profiles 300 → bank profiles 200 → generic UPI 100 → generic 50)
      4. categorize     rules precedence (see §6) → category + merchant canonical name
      5. deduplicate    against recent transactions (see §7) → new | merge | possible duplicate
      6. persist        transactions + raw_events.status/transaction_id in one DB transaction
  → UI reads repositories (dashboard, history, review inbox, analytics)

Direct SMS fallback (when enabled)
  → `Telephony.Sms.Inbox` query (Kotlin, `READ_SMS`)
      · filter to recent money-looking financial messages
      · stable provider row id becomes the message identity
  → same JS pipeline as notifications
```

**Why no Headless JS in V1:** Headless JS under the New Architecture has open reliability bugs
(timers on Samsung One UI, an Expo SDK 57 bug closing expo-sqlite connections). Because the
native queue is durable, processing on app open is enough for V1 and loses nothing. Background
processing (WorkManager / Headless JS) can be added later for alerts and widgets.

**Two SQLite files, one owner each.** Kotlin owns `queue.db` (Android framework SQLite). JS owns
`kharcha.db` (expo-sqlite). They never open each other's file — two SQLite libraries on one
file in one process risk corruption.

**Detection (step 2)** rejects, with a reason kept on the raw event: `otp` (text not kept),
`no_amount`, `balance_info`, `promotional` (incl. DLT `-P` senders), `collect_request`,
`mandate_setup`, `statement`, `payment_reminder` (incl. AutoPay pre-debit "will be debited"),
`no_transaction`. An explicit verb plus an account/reference beats offer text appended to a real
alert. A money-looking notification from a payment app that can't be classified is `financial`,
so a parse failure lands in Review instead of being dropped.

**Parsers** are declarative `ParserProfile`s (package names, DLT SMS headers, RCS sender names,
optional regex templates with named groups) on top of shared extractors in
`services/parser/extract.ts`. Adding a bank or app is adding a profile.

## 4. Folder structure

```
src/
  app/                    Expo Router screens: (tabs)/ home, transactions, review, insights,
                          settings; add, transaction/[id], safe-to-spend, onboarding, settings/*
  components/             Theme (light/dark tokens) and shared UI components
  hooks/                  useQuery (reload on data change/focus), useCategories
  store/                  Zustand stores (UI state)
  types/                  Shared domain types (the contract)
  utils/                  dates, money, ids — pure helpers
  domain/
    categories/           Built-in category tree
    merchants/            Merchant canonicalization + built-in merchant dictionary
    budgets/              Budget progress, safe-to-spend
    recurring/            Recurrence math, upcoming items
    analytics/            Aggregations for charts
  services/
    notification/         Normalization, known-apps registry, native bridge wrapper
    detection/            Financial-notification detection
    parser/               TransactionParser implementations + registry
    categorization/       Rule engine + learning from corrections
    deduplication/        Duplicate matching + evidence merging
    pipeline/             Orchestrates the flow in §3
    transactions/         User actions: quick add, set category (+ learning), review answers
    data/                 CSV export, JSON backup/restore
    app.ts, queries.ts    App start-up (DB, pipeline, queue drain) and screen read models
  database/
    sql.ts                SqlDatabase interface (expo-sqlite shaped)
    adapters/             expo-sqlite adapter, node:sqlite adapter for tests
    migrations/           Numbered migrations (PRAGMA user_version)
    repositories/         One repository per aggregate
modules/
  notification-listener/  Local Expo module (Kotlin): KharchaNotificationListenerService,
                          QueueDb (kharcha_queue.db), NotificationListenerModule (JS bridge)
  sms-reader/             Local Expo module (Kotlin): recent `Telephony.Sms.Inbox` reader,
                          content-observer signal, permission/status bridge
test/
  fixtures/notifications/ Synthetic notification fixtures (never real user data)
docs/
```

## 5. Money, time, identity

- **Money** is an integer in minor units (`amountMinor`, paise for INR). Always positive;
  direction/type carry the sign. Never store floats.
- **Time** is epoch milliseconds. "Today", "this month" use the device's local time zone
  (tests run with `TZ=Asia/Kolkata`). Month keys are `YYYY-MM`, day keys `YYYY-MM-DD`.
- **IDs** are UUIDv7 strings (time-ordered, sync-friendly). Built-in categories use stable
  readable IDs (`food`, `food.food_delivery`) so rules and seeds can reference them.
- **Sync-readiness:** every table has `id`, `created_at`, `updated_at`, `deleted_at` (soft
  delete). A future sync layer can replicate rows without schema rewrites.

## 6. Categorization precedence

For a parsed transaction, the first match wins:

1. **User rule** — rules the user created, or learned from their corrections (origin `user`
   or `learned`).
2. **Merchant rule** — built-in merchant dictionary (origin `builtin`), e.g. Zomato →
   Food › Food Delivery.
3. **App-specific parser hint** — a parser's `categoryHint` (e.g. an IRCTC notification →
   Travel › Trains).
4. **Generic categorization** — keyword heuristics over merchant/VPA/text (e.g. "petrol",
   "pharmacy").
5. **Uncategorized** — `categoryId = null`, transaction goes to Review with reason
   `uncategorized`.

**Learning:** when the user changes a transaction's category, a `learned` rule is upserted for
that canonical merchant (or VPA if no merchant). Future matches use it. The user can edit or
delete learned rules.

Rules can also set the transaction **type** (e.g. "transfers to my own VPA are transfers") and
the **account**.

## 7. Deduplication

One payment can produce several notifications (UPI app + bank app + bank SMS + merchant app).

**Layer 1 — idempotency (same notification seen again).** `content_hash` = hash(package,
title, body, message timestamp for SMS). A new raw event is dropped when an event with the same
hash was posted within ±2 minutes (`REPOST_WINDOW_MS`) — this covers re-posts, updates and
re-reads from `getActiveNotifications()` (same post time). Identical text further apart (two equal
₹10 payments) is two events, so the hash is indexed, not unique.

**Layer 2 — same payment from different sources.** Candidates: existing non-deleted
transactions with the same `amountMinor`, same direction, `occurredAt` within the dedup window
(default ±15 min, configurable).

| Evidence | Decision |
|---|---|
| Same reference (UPI RRN / txn id) | **Merge** (certain) |
| Both have references and they differ | **Not a duplicate** |
| Different source apps, amount equal, within 3 min, and account last4 or merchant agrees | **Merge** |
| Different source apps, amount equal, within window, nothing contradicts | **Possible duplicate** → new txn with `needs_review` + `possible_duplicate`, `duplicateOfId` set |
| Same source app, different notification | **New** (two ₹10 chai payments are two payments) |
| Merchant or account last4 clearly contradict | **New** |

Low confidence never deletes data. Merging enriches the existing transaction with fields it
lacks (reference, VPA, merchant, account) and links the raw event to it.

## 8. Accounting rules

- **Spending** in a period = Σ `expense` − Σ `refund` (a refund reduces spending in its
  category). Income is tracked separately. **Transfers never count as spending or income.**
- **Counted statuses:** `confirmed` and `needs_review`, **except** transactions flagged
  `possible_duplicate`, which are excluded until the user resolves them. `ignored` and deleted
  transactions never count.
- **Credit card bill payments** are `transfer` (bank → card), because the card purchases were
  already recorded as expenses.
- **Wallet / UPI Lite top-ups** are `transfer` (bank → wallet); spends from them are expenses.
- **ATM withdrawals** are `transfer` (bank → cash). Cash spending is logged via quick manual
  entry; counting the withdrawal too would double-count.
- **P2P payments to a person's VPA** default to `expense`, uncategorized, with review reason
  `possible_transfer`; the user's answer becomes a learned rule for that VPA (many small shops
  in India take payments on personal VPAs).
- **Savings / investments** (e.g. SIPs, broker top-ups) are `transfer`: money moved, not spent.
- **Failed payments** create no expense. If a failure matches an existing transaction, that
  transaction goes to Review with reason `payment_failed`. Reversals are `refund`s linked to
  the original.
- **Pending** payment notifications create no transaction; the later success does.

## 9. Safe to spend

```
remaining          = monthly budget − net spending so far
upcomingCommitted  = recurring expenses due from today to month end, not yet paid
available          = max(0, remaining − upcomingCommitted)
daysLeft           = days remaining in the month, including today
safePerDay         = floor(available / daysLeft)
```

Every component is exposed so the UI can show the breakdown when tapped.

## 10. Privacy

- Never stored: UPI PIN, passwords, CVV, full card numbers, OTPs, auth tokens. Parsers keep
  only the last 4 digits of accounts/cards.
- OTP / security notifications are classified as non-financial and their raw text is not kept.
- Android 15+ may redact OTP-like notifications ("Sensitive notification content hidden");
  such events are stored with status `redacted` and surfaced in Review.
- "Delete all data" wipes both databases.

## 11. Testing notes

- Fixtures in `test/fixtures/notifications/` are **synthetic**. Never commit real SMS or
  notification text.
- Real formats will be captured on the user's phone via a debug "raw notification recorder"
  screen and turned into new (anonymized) fixtures.
- `npm run check` = typecheck + tests. Run before declaring any task done.
