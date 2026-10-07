import { merchantKey } from '@/domain/merchants/canonical';
import type { Direction, ParsedKind, Transaction } from '@/types';

/** What the dedup layer needs to know about an incoming transaction. */
export interface DedupCandidate {
  amountMinor: number;
  direction: Direction;
  kind: ParsedKind;
  occurredAt: number;
  sourceApp: string | null;
  reference: string | null;
  accountLast4: string | null;
  merchantName: string | null;
  payeeVpa: string | null;
}

export type DedupDecision =
  | { kind: 'new' }
  /** Same payment seen by another source: enrich `targetId`, don't create a transaction. */
  | { kind: 'merge'; targetId: string; reason: 'reference' | 'strong_match' }
  /** Probably the same payment, not certain: create it flagged `possible_duplicate`. */
  | { kind: 'possible_duplicate'; duplicateOfId: string }
  /** Debit and credit with the same reference: one own-account transfer. */
  | { kind: 'self_transfer'; counterpartId: string }
  /** A refund/reversal of `originalId`: create it linked to the original. */
  | { kind: 'link_refund'; originalId: string };

export interface DedupOptions {
  /** ± window for cross-source matching (default 15 min, ARCHITECTURE §7). */
  windowMs: number;
  /** Within this, agreeing account or merchant is enough to merge (default 3 min). */
  strongWindowMs: number;
}

export const DEFAULT_DEDUP_OPTIONS: DedupOptions = { windowMs: 15 * 60_000, strongWindowMs: 3 * 60_000 };

const REFUND_KINDS: ReadonlySet<ParsedKind> = new Set(['refund', 'reversal']);

function isLive(tx: Transaction): boolean {
  return tx.deletedAt === null && tx.status !== 'ignored';
}

function sameMerchant(a: DedupCandidate, b: Transaction): boolean | null {
  if (a.payeeVpa && b.payeeVpa) return a.payeeVpa.toLowerCase() === b.payeeVpa.toLowerCase();
  if (!a.merchantName || !b.merchantName) return null;
  const x = merchantKey(a.merchantName);
  const y = merchantKey(b.merchantName);
  if (!x || !y) return null;
  return x === y || x.includes(y) || y.includes(x);
}

function sameAccount(a: DedupCandidate, b: Transaction): boolean | null {
  if (!a.accountLast4 || !b.accountLast4) return null;
  const x = a.accountLast4;
  const y = b.accountLast4;
  // ICICI shows 3 digits, others 4: compare the shared suffix.
  return x.endsWith(y) || y.endsWith(x);
}

/**
 * ARCHITECTURE §7 layer 2. `existing` should hold live transactions near `occurredAt` (and, for
 * refund linking, older expenses with the same amount). Never deletes: low confidence becomes
 * `possible_duplicate`.
 */
export function decideDuplicate(
  candidate: DedupCandidate,
  existing: readonly Transaction[],
  options: DedupOptions = DEFAULT_DEDUP_OPTIONS,
): DedupDecision {
  const live = existing.filter((tx) => isLive(tx) && tx.amountMinor === candidate.amountMinor);

  if (candidate.reference) {
    const sameRef = live.filter((tx) => tx.reference === candidate.reference);
    const sameDirection = sameRef.find((tx) => tx.direction === candidate.direction);
    if (sameDirection) return { kind: 'merge', targetId: sameDirection.id, reason: 'reference' };
    const opposite = sameRef.find((tx) => tx.direction !== candidate.direction);
    if (opposite) {
      return REFUND_KINDS.has(candidate.kind)
        ? { kind: 'link_refund', originalId: opposite.id }
        : { kind: 'self_transfer', counterpartId: opposite.id };
    }
  }

  if (REFUND_KINDS.has(candidate.kind) && candidate.direction === 'credit') {
    const original = live
      .filter((tx) => tx.direction === 'debit' && tx.type === 'expense' && tx.occurredAt <= candidate.occurredAt)
      .filter((tx) => sameMerchant(candidate, tx) === true)
      .sort((a, b) => b.occurredAt - a.occurredAt)[0];
    if (original) return { kind: 'link_refund', originalId: original.id };
  }

  const nearby = live
    .filter((tx) => tx.direction === candidate.direction)
    .filter((tx) => Math.abs(tx.occurredAt - candidate.occurredAt) <= options.windowMs)
    .filter((tx) => !(candidate.reference && tx.reference && tx.reference !== candidate.reference))
    .filter((tx) => !(candidate.sourceApp && tx.sourceApp === candidate.sourceApp))
    .filter((tx) => sameAccount(candidate, tx) !== false && sameMerchant(candidate, tx) !== false)
    .sort((a, b) => Math.abs(a.occurredAt - candidate.occurredAt) - Math.abs(b.occurredAt - candidate.occurredAt));

  const closest = nearby[0];
  if (!closest) return { kind: 'new' };
  const agrees = sameAccount(candidate, closest) === true || sameMerchant(candidate, closest) === true;
  if (agrees && Math.abs(closest.occurredAt - candidate.occurredAt) <= options.strongWindowMs) {
    return { kind: 'merge', targetId: closest.id, reason: 'strong_match' };
  }
  return { kind: 'possible_duplicate', duplicateOfId: closest.id };
}

/**
 * Fills fields the existing transaction lacks from a merged duplicate (reference, VPA, merchant,
 * account). Never overwrites what the user or an earlier source set. updatedAt is the caller's.
 */
export function enrichFromDuplicate(
  target: Transaction,
  from: Pick<Transaction, 'reference' | 'payeeVpa' | 'merchantName' | 'merchantRaw' | 'accountId' | 'accountLast4'>,
): Transaction {
  return {
    ...target,
    reference: target.reference ?? from.reference,
    payeeVpa: target.payeeVpa ?? from.payeeVpa,
    merchantName: target.merchantName ?? from.merchantName,
    merchantRaw: target.merchantRaw ?? from.merchantRaw,
    accountId: target.accountId ?? from.accountId,
    accountLast4: target.accountLast4 ?? from.accountLast4,
    reviewReasons:
      target.merchantName ?? from.merchantName
        ? target.reviewReasons.filter((r) => r !== 'unknown_merchant')
        : target.reviewReasons,
  };
}
