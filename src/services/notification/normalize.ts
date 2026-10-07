import type { NotificationEvent, RawNotificationPayload } from '@/types';
import { stableHash } from '@/utils/hash';

import { findKnownApp } from './knownApps';

/** Our own package; its notifications are never processed. */
export const OWN_PACKAGE = 'app.kharcha';

/** Android 15+ placeholder for notifications the system thinks contain an OTP. */
const REDACTED_PATTERN = /sensitive notification content hidden/i;

// Zero-width characters, bidi controls and the BOM that some apps sprinkle into text.
const INVISIBLE = /[​-‏‪-‮⁠-⁤﻿]/g;

/**
 * Trims each line, collapses runs of spaces/tabs (NBSP included) and drops blank lines.
 * Line breaks are kept: many bank SMS put one field per line ("To ZOMATO\nOn 27/09/26").
 */
export function normalizeText(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(INVISIBLE, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[\s ]+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

/** Best full body for a non-messaging notification: expanded text, plus collapsed text if it adds anything. */
function bestBody(payload: RawNotificationPayload): string {
  const big = normalizeText(payload.bigText);
  const text = normalizeText(payload.text);
  if (big && text) {
    if (big.includes(text)) return big;
    if (text.includes(big)) return text;
    return `${text}\n${big}`;
  }
  return big || text || normalizeText(payload.textLines.join('\n'));
}

interface Part {
  title: string;
  body: string;
  postedAt: number;
  /** Message timestamp, part of the content hash for messaging-style messages. */
  messageTime: number | null;
  /** Stable SMS provider row id, when this came from the inbox reader. */
  messageId: string | null;
}

function splitParts(payload: RawNotificationPayload, isSmsApp: boolean): Part[] {
  const fallbackTitle = normalizeText(payload.conversationTitle) || normalizeText(payload.titleBig || payload.title);

  // MessagingStyle (SMS/RCS apps): one event per message.
  if (payload.messages.length > 0) {
    return payload.messages.map((message) => ({
      title: normalizeText(message.sender) || fallbackTitle,
      body: normalizeText(message.text),
      postedAt: message.timestamp ?? payload.postedAt,
      messageTime: message.timestamp,
      messageId: message.messageId ?? null,
    }));
  }

  const title = normalizeText(payload.titleBig || payload.title) || normalizeText(payload.conversationTitle);

  // InboxStyle from an SMS app: each line is a separate message. (Verify on device, Phase 6.)
  if (isSmsApp && payload.textLines.length > 1) {
    return payload.textLines.map((line) => ({
      title,
      body: normalizeText(line),
      postedAt: payload.postedAt,
      messageTime: null,
      messageId: null,
    }));
  }

  return [{ title, body: bestBody(payload), postedAt: payload.postedAt, messageTime: null, messageId: null }];
}

/**
 * Stable identity of one message's content. Re-posts, updates and re-reads of the same
 * notification (e.g. getActiveNotifications() on reconnect) hash the same. For messaging-style
 * messages the message timestamp is included, so two identical SMS at different times differ.
 */
export function contentHashOf(packageName: string, title: string, body: string, messageTime: number | null, messageId: string | null = null): string {
  const parts: (string | number | null)[] = [packageName, title, body, messageTime];
  if (messageId !== null) parts.push(messageId);
  return stableHash(JSON.stringify(parts));
}

/**
 * ARCHITECTURE §3 step 1: RawNotificationPayload → NotificationEvent[] (one per SMS message).
 * Drops group summaries, our own notifications and empty messages. Redacted notifications are
 * kept and flagged so they can be shown in Review.
 */
export function normalizeNotification(payload: RawNotificationPayload, rawEventId: string): NotificationEvent[] {
  if (payload.isGroupSummary || payload.packageName === OWN_PACKAGE) return [];
  const known = findKnownApp(payload.packageName);
  const sourceKind = known?.sourceKind ?? 'other';
  const appName = payload.appName ?? known?.name ?? null;

  const events: NotificationEvent[] = [];
  splitParts(payload, sourceKind === 'sms_app').forEach((part, messageIndex) => {
    if (!part.body && !part.title) return;
    events.push({
      rawEventId,
      messageIndex,
      key: payload.key,
      packageName: payload.packageName,
      appName,
      sourceKind,
      postedAt: part.postedAt,
      title: part.title,
      body: part.body,
      channelId: payload.channelId,
      category: payload.category,
      isRedacted: REDACTED_PATTERN.test(part.body) || REDACTED_PATTERN.test(part.title),
      contentHash: contentHashOf(payload.packageName, part.title, part.body, part.messageTime, part.messageId),
    });
  });
  return events;
}
