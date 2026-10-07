import { accountRepo, rawEventRepo, ruleRepo, transactionRepo } from '@/database/repositories';
import type { SqlDatabase, SqlExecutor } from '@/database/sql';
import { categorize } from '@/services/categorization/categorize';
import { decideDuplicate, DEFAULT_DEDUP_OPTIONS, enrichFromDuplicate, type DedupOptions } from '@/services/deduplication/dedup';
import { detectFinancial } from '@/services/detection/detect';
import { normalizeNotification } from '@/services/notification/normalize';
import { parseTextOf } from '@/services/parser/extract';
import { createDefaultRegistry, type ParserRegistry } from '@/services/parser/registry';
import type { NotificationEvent, RawEvent, RawNotificationPayload, Transaction } from '@/types';
import { newId } from '@/utils/ids';

/** Bump when parsing/detection changes so stored events can be re-processed. */
export const PIPELINE_VERSION = 2;

/** How far back a refund may link to its original expense. */
const REFUND_LOOKBACK_MS = 90 * 86_400_000;

export interface PipelineOptions {
  registry?: ParserRegistry;
  dedup?: DedupOptions;
  now?: () => number;
}

export type ProcessResult =
  | { kind: 'duplicate_event' }
  | { kind: 'not_financial' | 'redacted' | 'failed' | 'status_update'; rawEventId: string }
  | { kind: 'created' | 'merged'; rawEventId: string; transactionId: string };

/**
 * ARCHITECTURE §3: normalize → detect → parse → categorize → deduplicate → persist. Every
 * money-looking notification is stored as a raw event first; parsing can fail, storage can't.
 */
export class Pipeline {
  private readonly registry: ParserRegistry;
  private readonly dedup: DedupOptions;
  private readonly now: () => number;

  constructor(
    private readonly db: SqlDatabase,
    options: PipelineOptions = {},
  ) {
    this.registry = options.registry ?? createDefaultRegistry();
    this.dedup = options.dedup ?? DEFAULT_DEDUP_OPTIONS;
    this.now = options.now ?? Date.now;
  }

  /** Ingests one captured notification (one result per SMS message in it). */
  async ingest(payload: RawNotificationPayload, queueId: number | null = null): Promise<ProcessResult[]> {
    const results: ProcessResult[] = [];
    for (const event of normalizeNotification(payload, '')) {
      results.push(await this.ingestEvent(payload, event, queueId));
    }
    return results;
  }

  private async ingestEvent(payload: RawNotificationPayload, ev: NotificationEvent, queueId: number | null): Promise<ProcessResult> {
    const now = this.now();
    return this.db.transaction(async (tx) => {
      const raw: RawEvent = {
        id: newId(now),
        queueId,
        key: ev.key,
        packageName: ev.packageName,
        appName: ev.appName,
        postedAt: ev.postedAt,
        messageIndex: ev.messageIndex,
        contentHash: ev.contentHash,
        payload,
        status: 'pending',
        parserId: null,
        transactionId: null,
        error: null,
        receivedAt: now,
        processedAt: null,
        pipelineVersion: 0,
      };
      const { isNew } = await rawEventRepo.insertIfNew(tx, raw);
      if (!isNew) return { kind: 'duplicate_event' };
      return this.process(tx, raw, { ...ev, rawEventId: raw.id });
    });
  }

  /** Re-runs events that produced no transaction with an older pipeline version. */
  async reprocessOutdated(): Promise<ProcessResult[]> {
    const results: ProcessResult[] = [];
    const events = await rawEventRepo.outdated(this.db, PIPELINE_VERSION);
    for (const raw of events) {
      if (raw.transactionId || !raw.payload) continue;
      const ev = normalizeNotification(raw.payload, raw.id)[raw.messageIndex];
      if (!ev) continue;
      results.push(await this.db.transaction((tx) => this.process(tx, raw, ev)));
    }
    return results;
  }

  private async process(tx: SqlExecutor, raw: RawEvent, ev: NotificationEvent): Promise<ProcessResult> {
    const now = this.now();
    const save = async (patch: Partial<RawEvent>) => {
      await rawEventRepo.update(tx, { ...raw, ...patch, processedAt: now, pipelineVersion: PIPELINE_VERSION });
    };

    const detection = detectFinancial(ev);
    if (detection.kind === 'redacted') {
      await save({ status: 'redacted' });
      return { kind: 'redacted', rawEventId: raw.id };
    }
    if (detection.kind === 'not_financial') {
      // Keep the text only when it mentioned money (a misclassified payment can then be
      // re-processed). OTPs and messages without any amount are not kept (ARCHITECTURE §10).
      const dropText = detection.sensitive || detection.reason === 'no_amount';
      await save({ status: 'not_financial', error: detection.reason, ...(dropText ? { payload: null } : {}) });
      return { kind: 'not_financial', rawEventId: raw.id };
    }

    const outcome = this.registry.parse(ev);
    if (outcome.kind === 'failed') {
      await save({ status: 'failed', error: outcome.reason });
      return { kind: 'failed', rawEventId: raw.id };
    }
    const parsed = outcome.transaction;

    if (parsed.status === 'pending') {
      await save({ status: 'status_update', parserId: parsed.parserId });
      return { kind: 'status_update', rawEventId: raw.id };
    }
    if (parsed.status === 'failed') {
      // A failure creates no expense; if it matches a recorded payment, send that to Review.
      const candidates = await transactionRepo.candidates(tx, parsed.amountMinor, parsed.occurredAt - this.dedup.windowMs, parsed.occurredAt + this.dedup.windowMs);
      const match = candidates.find((t) => t.direction === parsed.direction && (!parsed.reference || t.reference === parsed.reference));
      if (match && !match.reviewReasons.includes('payment_failed')) {
        await transactionRepo.update(tx, {
          ...match,
          status: 'needs_review',
          reviewReasons: [...match.reviewReasons, 'payment_failed'],
          updatedAt: now,
        });
      }
      await save({ status: 'status_update', parserId: parsed.parserId, transactionId: match?.id ?? null });
      return { kind: 'status_update', rawEventId: raw.id };
    }

    const rules = await ruleRepo.list(tx);
    const category = categorize(parsed, rules, parseTextOf(ev));
    if (category.ruleId) await ruleRepo.recordHit(tx, category.ruleId, now);
    const last4 = parsed.accountHint?.last4 ?? null;
    const account = category.accountId ? null : last4 ? await accountRepo.findByLast4(tx, last4) : null;

    const transaction: Transaction = {
      id: newId(now),
      amountMinor: parsed.amountMinor,
      currency: parsed.currency,
      type: category.type,
      direction: parsed.direction,
      merchantName: category.merchantName,
      merchantRaw: parsed.merchantRaw,
      payeeVpa: parsed.payeeVpa,
      categoryId: category.categoryId,
      subcategoryId: category.subcategoryId,
      categorySource: category.categorySource,
      source: 'notification',
      sourceApp: parsed.sourceApp,
      paymentMethod: category.paymentMethod,
      accountId: category.accountId ?? account?.id ?? null,
      accountLast4: last4,
      reference: parsed.reference,
      occurredAt: parsed.occurredAt,
      notes: null,
      confidence: parsed.confidence,
      status: 'confirmed',
      reviewReasons: category.reviewReasons,
      recurringTransactionId: null,
      linkedTransactionId: null,
      duplicateOfId: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    const nearby = await transactionRepo.candidates(
      tx,
      parsed.amountMinor,
      parsed.occurredAt - (parsed.kind === 'refund' || parsed.kind === 'reversal' ? REFUND_LOOKBACK_MS : this.dedup.windowMs),
      parsed.occurredAt + this.dedup.windowMs,
    );
    const decision = decideDuplicate(
      {
        amountMinor: transaction.amountMinor,
        direction: transaction.direction,
        kind: parsed.kind,
        occurredAt: transaction.occurredAt,
        sourceApp: transaction.sourceApp,
        reference: transaction.reference,
        accountLast4: last4,
        merchantName: transaction.merchantName,
        payeeVpa: transaction.payeeVpa,
      },
      nearby,
      this.dedup,
    );

    if (decision.kind === 'merge') {
      const target = nearby.find((t) => t.id === decision.targetId) as Transaction;
      await transactionRepo.update(tx, { ...enrichFromDuplicate(target, transaction), updatedAt: now });
      await save({ status: 'merged', parserId: parsed.parserId, transactionId: target.id });
      return { kind: 'merged', rawEventId: raw.id, transactionId: target.id };
    }
    if (decision.kind === 'self_transfer') {
      const counterpart = nearby.find((t) => t.id === decision.counterpartId) as Transaction;
      await transactionRepo.update(tx, {
        ...counterpart,
        type: 'transfer',
        categoryId: 'transfers',
        subcategoryId: 'transfers.own_account',
        categorySource: 'generic',
        reviewReasons: counterpart.reviewReasons.filter((r) => r !== 'uncategorized' && r !== 'possible_transfer'),
        updatedAt: now,
      });
      await save({ status: 'merged', parserId: parsed.parserId, transactionId: counterpart.id });
      return { kind: 'merged', rawEventId: raw.id, transactionId: counterpart.id };
    }
    if (decision.kind === 'link_refund') {
      const original = nearby.find((t) => t.id === decision.originalId) as Transaction;
      transaction.type = 'refund';
      transaction.linkedTransactionId = original.id;
      if (!transaction.categoryId || transaction.categoryId === 'income') {
        transaction.categoryId = original.categoryId;
        transaction.subcategoryId = original.subcategoryId;
        transaction.categorySource = original.categorySource;
      }
      transaction.merchantName ??= original.merchantName;
      transaction.reviewReasons = transaction.reviewReasons.filter((r) => r !== 'uncategorized');
    }
    if (decision.kind === 'possible_duplicate') {
      transaction.duplicateOfId = decision.duplicateOfId;
      transaction.reviewReasons = [...transaction.reviewReasons, 'possible_duplicate'];
    }
    if (transaction.reviewReasons.length > 0) transaction.status = 'needs_review';

    await transactionRepo.insert(tx, transaction);
    await save({ status: 'parsed', parserId: parsed.parserId, transactionId: transaction.id });
    return { kind: 'created', rawEventId: raw.id, transactionId: transaction.id };
  }
}
