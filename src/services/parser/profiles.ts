import { parseSmsSender } from '@/services/notification/sender';
import type { CategoryHint, Direction, NotificationEvent, ParsedKind, PaymentMethod } from '@/types';

import { parseAmountToken, parseTextOf } from './extract';
import { buildParsed, type KnownFields } from './generic';
import type { TransactionParser } from './types';

/**
 * A regex for one exact notification format. Named groups: amount (required), merchant, vpa,
 * ref, last4. Everything not captured is filled in by the generic extractors.
 */
export interface ParserTemplate {
  id: string;
  pattern: RegExp;
  direction: Direction;
  kind?: ParsedKind;
  paymentMethod?: PaymentMethod;
}

/**
 * Declarative parser for one institution or app. Adding a bank or app = adding a profile; a
 * future "add your own app" screen can create these at runtime.
 */
export interface ParserProfile {
  id: string;
  /** Bank / card issuer name used for account hints. */
  institution?: string;
  /** Package names of the institution's or app's own app. */
  packages?: readonly string[];
  /** DLT SMS headers (6 chars, e.g. "HDFCBK"). */
  smsHeaders?: readonly string[];
  /** RCS / display-name senders (case-insensitive exact match). */
  senderNames?: readonly string[];
  templates?: readonly ParserTemplate[];
  defaultPaymentMethod?: PaymentMethod;
  categoryHint?: CategoryHint;
}

const TEMPLATE_CONFIDENCE = 0.95;
const PROFILE_CONFIDENCE = 0.85;

function matchesProfile(profile: ParserProfile, event: NotificationEvent): boolean {
  if (profile.packages?.includes(event.packageName)) return true;
  if (event.sourceKind !== 'sms_app') return false;
  const { header } = parseSmsSender(event.title);
  if (header && profile.smsHeaders?.includes(header)) return true;
  const title = event.title.trim().toLowerCase();
  return profile.senderNames?.some((name) => name.toLowerCase() === title) ?? false;
}

function fieldsFrom(template: ParserTemplate, groups: Record<string, string | undefined>): KnownFields | null {
  const amountMinor = groups.amount ? parseAmountToken(groups.amount) : null;
  if (amountMinor === null) return null;
  const fields: KnownFields = { amountMinor, direction: template.direction };
  if (template.kind) fields.kind = template.kind;
  if (template.paymentMethod) fields.paymentMethod = template.paymentMethod;
  if (groups.merchant) fields.merchantRaw = groups.merchant.trim();
  if (groups.vpa) fields.payeeVpa = groups.vpa.toLowerCase();
  if (groups.ref) fields.reference = groups.ref.toUpperCase();
  if (groups.last4) fields.last4 = groups.last4.slice(-4);
  return fields;
}

export function createProfileParser(profile: ParserProfile, priority: number): TransactionParser {
  const id = `profile.${profile.id}`;
  const common = {
    institution: profile.institution ?? null,
    categoryHint: profile.categoryHint ?? null,
    ...(profile.defaultPaymentMethod ? { defaultPaymentMethod: profile.defaultPaymentMethod } : {}),
  };
  return {
    id,
    priority,
    canParse: (event) => matchesProfile(profile, event),
    parse: (event) => {
      const text = parseTextOf(event);
      for (const template of profile.templates ?? []) {
        const groups = template.pattern.exec(text)?.groups;
        const known = groups ? fieldsFrom(template, groups) : null;
        if (known) {
          const parsed = buildParsed(event, {
            ...common,
            parserId: `${id}.${template.id}`,
            baseConfidence: TEMPLATE_CONFIDENCE,
            known,
          });
          if (parsed) return parsed;
        }
      }
      return buildParsed(event, { ...common, parserId: id, baseConfidence: PROFILE_CONFIDENCE });
    },
  };
}

const AMOUNT = String.raw`(?<amount>\d[\d,]*(?:\.\d{1,2})?)`;

/**
 * Bank profiles. SMS headers and formats are synthetic approximations of public bank alert
 * formats — verify and extend with anonymized real formats in Phase 6.
 */
export const BANK_PROFILES: readonly ParserProfile[] = [
  {
    id: 'hdfc',
    institution: 'HDFC Bank',
    packages: ['com.snapwork.hdfc'],
    smsHeaders: ['HDFCBK', 'HDFCBN'],
    senderNames: ['HDFC Bank'],
    templates: [
      {
        id: 'upi_sent',
        direction: 'debit',
        paymentMethod: 'upi',
        pattern: new RegExp(
          String.raw`Sent Rs\.?\s*${AMOUNT}\s+From HDFC Bank A\/C\s*[x*]*(?<last4>\d{3,4})\s+To (?<merchant>[^\n]+?)\s+On [\d/-]+\s+Ref (?<ref>\d{12})`,
          'i',
        ),
      },
    ],
  },
  { id: 'sbi', institution: 'SBI', packages: ['com.sbi.lotusintouch'], smsHeaders: ['SBIINB', 'SBIUPI', 'ATMSBI', 'CBSSBI', 'SBIPSG'], senderNames: ['SBI'] },
  { id: 'sbi_card', institution: 'SBI Card', smsHeaders: ['SBICRD', 'SBIPRM'], defaultPaymentMethod: 'credit_card' },
  {
    id: 'icici',
    institution: 'ICICI Bank',
    packages: ['com.csam.icici.bank.imobile'],
    smsHeaders: ['ICICIB', 'ICICIT'],
    senderNames: ['ICICI Bank'],
    templates: [
      {
        id: 'upi_debit',
        direction: 'debit',
        paymentMethod: 'upi',
        pattern: new RegExp(
          String.raw`Acct\s*[x*]*(?<last4>\d{3,4}) debited for Rs\.?\s*${AMOUNT} on [\w-]+;\s*(?<merchant>[^\n;]+?) credited\.\s*UPI:?\s*(?<ref>\d{12})`,
          'i',
        ),
      },
    ],
  },
  { id: 'axis', institution: 'Axis Bank', packages: ['com.axis.mobile'], smsHeaders: ['AXISBK', 'AXISMR'], senderNames: ['Axis Bank'] },
  { id: 'kotak', institution: 'Kotak Mahindra Bank', packages: ['com.msf.kbank.mobile'], smsHeaders: ['KOTAKB'], senderNames: ['Kotak Bank'] },
  { id: 'idfc', institution: 'IDFC FIRST Bank', packages: ['com.idfcfirstbank.optimus'], smsHeaders: ['IDFCFB'] },
  { id: 'yes', institution: 'YES Bank', smsHeaders: ['YESBNK'] },
  { id: 'pnb', institution: 'Punjab National Bank', smsHeaders: ['PNBSMS'] },
  { id: 'bob', institution: 'Bank of Baroda', smsHeaders: ['BOBTXN', 'BOBSMS'] },
  { id: 'canara', institution: 'Canara Bank', smsHeaders: ['CANBNK'] },
  { id: 'indusind', institution: 'IndusInd Bank', smsHeaders: ['INDUSB'] },
];

/** App profiles for UPI / wallet apps. Exact formats are unverified until Phase 6. */
export const APP_PROFILES: readonly ParserProfile[] = [
  { id: 'gpay', packages: ['com.google.android.apps.nbu.paisa.user'], defaultPaymentMethod: 'upi' },
  { id: 'amazon_pay', packages: ['in.amazon.mShop.android.shopping'], defaultPaymentMethod: 'upi' },
  { id: 'phonepe', packages: ['com.phonepe.app'], defaultPaymentMethod: 'upi' },
  { id: 'paytm', packages: ['net.one97.paytm'], defaultPaymentMethod: 'upi' },
  { id: 'bhim', packages: ['in.org.npci.upiapp'], defaultPaymentMethod: 'upi' },
  { id: 'cred', packages: ['com.dreamplug.androidapp'], defaultPaymentMethod: 'upi' },
  { id: 'mobikwik', packages: ['com.mobikwik_new'], defaultPaymentMethod: 'wallet' },
];
