/**
 * One MessagingStyle message (EXTRA_MESSAGES). SMS apps put each SMS here.
 */
export interface RawMessagingStyleMessage {
  sender: string | null;
  text: string | null;
  timestamp: number | null;
  /** SMS provider row id for inbox imports; absent on notification payloads. */
  messageId?: string | null;
}

/**
 * Exactly what the native listener captured for one notification post.
 * Stored verbatim (as JSON) in raw_events so it can be re-parsed later.
 * Field names mirror android.app.Notification extras.
 */
export interface RawNotificationPayload {
  schemaVersion: 1;
  /** StatusBarNotification.getKey() — userId|pkg|id|tag|uid */
  key: string;
  packageName: string;
  /** App label resolved natively, e.g. "Google Pay". */
  appName: string | null;
  /** StatusBarNotification.getPostTime(), epoch ms. */
  postedAt: number;
  /** Notification.when, epoch ms, if set. */
  when: number | null;
  channelId: string | null;
  /** Notification.category, e.g. "msg". */
  category: string | null;
  /** EXTRA_TEMPLATE, e.g. "android.app.Notification$BigTextStyle". */
  template: string | null;
  flags: number;
  isGroupSummary: boolean;
  isOngoing: boolean;
  title: string | null;
  titleBig: string | null;
  text: string | null;
  bigText: string | null;
  subText: string | null;
  summaryText: string | null;
  infoText: string | null;
  conversationTitle: string | null;
  textLines: string[];
  messages: RawMessagingStyleMessage[];
}

/** What kind of app posted the notification (from the known-apps registry). */
export type SourceKind =
  | 'upi_app'
  | 'bank_app'
  | 'card_app'
  | 'wallet_app'
  | 'sms_app'
  | 'merchant_app'
  | 'other';

/**
 * Normalized notification that every pipeline stage after normalization works with.
 * For SMS apps, one raw payload may yield several events (one per message).
 */
export interface NotificationEvent {
  /** raw_events.id this event came from. */
  rawEventId: string;
  /** Index of the message within a MessagingStyle notification; 0 otherwise. */
  messageIndex: number;
  key: string;
  packageName: string;
  appName: string | null;
  sourceKind: SourceKind;
  /** Best timestamp for when this message/notification happened, epoch ms. */
  postedAt: number;
  /** Sender for SMS (e.g. "AX-HDFCBK-S"), else the notification title. Trimmed, '' if none. */
  title: string;
  /** Full best-available body text; lines trimmed, spaces collapsed, line breaks kept. '' if none. */
  body: string;
  channelId: string | null;
  category: string | null;
  /** Android 15+ "Sensitive notification content hidden". */
  isRedacted: boolean;
  /** Stable hash of (packageName, title, body, message timestamp for SMS) — idempotency key. */
  contentHash: string;
}
