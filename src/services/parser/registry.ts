import type { NotificationEvent } from '@/types';

import { genericDebitCreditParser, genericUpiParser } from './generic';
import { APP_PROFILES, BANK_PROFILES, createProfileParser, type ParserProfile } from './profiles';
import type { ParseOutcome, TransactionParser } from './types';

/** Tries parsers from highest priority down; the first non-null result wins. */
export class ParserRegistry {
  private parsers: TransactionParser[] = [];

  register(parser: TransactionParser): this {
    if (this.parsers.some((p) => p.id === parser.id)) throw new Error(`Duplicate parser id: ${parser.id}`);
    this.parsers.push(parser);
    this.parsers.sort((a, b) => b.priority - a.priority);
    return this;
  }

  registerProfile(profile: ParserProfile, priority: number): this {
    return this.register(createProfileParser(profile, priority));
  }

  list(): readonly TransactionParser[] {
    return this.parsers;
  }

  parse(event: NotificationEvent): ParseOutcome {
    const tried: string[] = [];
    for (const parser of this.parsers) {
      if (!parser.canParse(event)) continue;
      tried.push(parser.id);
      const transaction = parser.parse(event);
      if (transaction) return { kind: 'parsed', transaction };
    }
    return { kind: 'failed', reason: 'no parser could extract an amount and direction', parserIdsTried: tried };
  }
}

/** App profiles at 300, bank profiles at 200, generic UPI at 100, generic debit/credit at 50. */
export function createDefaultRegistry(): ParserRegistry {
  const registry = new ParserRegistry();
  APP_PROFILES.forEach((profile) => registry.registerProfile(profile, 300));
  BANK_PROFILES.forEach((profile) => registry.registerProfile(profile, 200));
  return registry.register(genericUpiParser).register(genericDebitCreditParser);
}
