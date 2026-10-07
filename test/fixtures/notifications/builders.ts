/**
 * Builders for SYNTHETIC notification fixtures. Never put real notification text, names,
 * account numbers or references here (see CLAUDE.md).
 */
import type { RawNotificationPayload } from '@/types';

/** 1 Oct 2026, 12:30 local (IST in tests). */
export const POSTED_AT = new Date(2026, 9, 1, 12, 30).getTime();

export const PKG = {
  gpay: 'com.google.android.apps.nbu.paisa.user',
  phonepe: 'com.phonepe.app',
  paytm: 'net.one97.paytm',
  bhim: 'in.org.npci.upiapp',
  cred: 'com.dreamplug.androidapp',
  amazon: 'in.amazon.mShop.android.shopping',
  messages: 'com.google.android.apps.messaging',
  samsungMessages: 'com.samsung.android.messaging',
  hdfcApp: 'com.snapwork.hdfc',
  zomato: 'com.application.zomato',
  swiggy: 'in.swiggy.android',
  irctc: 'cris.org.in.prs.ima',
  unknown: 'com.example.somebank',
} as const;

export function payload(overrides: Partial<RawNotificationPayload> & { packageName: string }): RawNotificationPayload {
  return {
    schemaVersion: 1,
    key: `0|${overrides.packageName}|1|null|10001`,
    appName: null,
    postedAt: POSTED_AT,
    when: null,
    channelId: null,
    category: null,
    template: null,
    flags: 0,
    isGroupSummary: false,
    isOngoing: false,
    title: null,
    titleBig: null,
    text: null,
    bigText: null,
    subText: null,
    summaryText: null,
    infoText: null,
    conversationTitle: null,
    textLines: [],
    messages: [],
    ...overrides,
  };
}

/** A regular app notification (title + text, optional expanded text). */
export function app(packageName: string, title: string, text: string, bigText: string | null = null): RawNotificationPayload {
  return payload({ packageName, title, text, bigText });
}

/** A bank SMS as Google Messages shows it: MessagingStyle with the sender as title. */
export function sms(sender: string, body: string, postedAt = POSTED_AT): RawNotificationPayload {
  return payload({
    packageName: PKG.messages,
    category: 'msg',
    template: 'android.app.Notification$MessagingStyle',
    title: sender,
    text: body,
    conversationTitle: null,
    messages: [{ sender, text: body, timestamp: postedAt - 2000 }],
  });
}
