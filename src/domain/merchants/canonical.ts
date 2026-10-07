import { KNOWN_MERCHANTS, type KnownMerchant } from './dictionary';

const LEGAL_SUFFIXES =
  /\b(?:pvt|private|ltd|limited|llp|inc|corp|corporation|co|company|india|technologies|technology|tech|solutions|services|retail|online|payments|pay|enterprises?)\b/g;

/** Lower-case, punctuation → spaces, single spaces. "ZOMATO*LTD." → "zomato ltd". */
export function cleanMerchantText(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9&'@.\s]/g, ' ')
    .replace(/[.@']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Match key for learned rules: cleaned text without legal suffixes ("ZOMATO LTD" → "zomato"). */
export function merchantKey(raw: string): string {
  const cleaned = cleanMerchantText(raw).replace(LEGAL_SUFFIXES, ' ').replace(/\s+/g, ' ').trim();
  return cleaned || cleanMerchantText(raw);
}

/** Handle of a UPI ID with separators as spaces: "swiggy.instamart@icici" → "swiggy instamart". */
export function vpaHandle(vpa: string): string {
  const local = vpa.toLowerCase().split('@')[0] ?? '';
  return local.replace(/[._-]+/g, ' ').replace(/\d+/g, ' ').replace(/\s+/g, ' ').trim();
}

const ALIAS_PATTERNS = KNOWN_MERCHANTS.map((merchant) => ({
  merchant,
  patterns: merchant.aliases.map((alias) => new RegExp(`(?:^|\\s)${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`)),
}));

/** Built-in merchant for a raw merchant name and/or UPI ID. */
export function findKnownMerchant(merchantRaw: string | null, vpa: string | null): KnownMerchant | null {
  const haystacks = [merchantRaw ? cleanMerchantText(merchantRaw) : '', vpa ? vpaHandle(vpa) : ''].filter(Boolean);
  for (const { merchant, patterns } of ALIAS_PATTERNS) {
    if (haystacks.some((text) => patterns.some((p) => p.test(text)))) return merchant;
  }
  return null;
}

function titleCase(text: string): string {
  return text.replace(/\b([a-z])([a-z]*)/g, (_, first: string, rest: string) => first.toUpperCase() + rest);
}

/**
 * Display name: the built-in name when known, else the raw name tidied ("SHARMA GENERAL STORE"
 * → "Sharma General Store"; mixed-case names are kept), else the UPI ID.
 */
export function canonicalMerchantName(merchantRaw: string | null, vpa: string | null): string | null {
  const known = findKnownMerchant(merchantRaw, vpa);
  if (known) return known.name;
  if (merchantRaw) {
    const trimmed = merchantRaw.replace(/\s+/g, ' ').trim();
    const isShouting = trimmed === trimmed.toUpperCase();
    return isShouting ? titleCase(trimmed.toLowerCase()) : trimmed;
  }
  return vpa;
}
