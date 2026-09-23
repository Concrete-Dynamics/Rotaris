import { addAmounts, multiplyAmount } from '@rotaris/kernel';
import type { CostQualifier } from '@rotaris/contracts';
import type { ModelPricing } from '@rotaris/config';
import type { Usage } from '@rotaris/model';

/**
 * PD-MONITOR-001 revision 2: how one completed provider request is priced, by the first of these that applies —
 * the figure the provider **reported** for it; else, where the model the request was sent to has both per-token
 * prices (REQ-CONFIG-088), its input tokens times the input price plus its output tokens times the output price,
 * exact (**configured**); else no figure at all (**unpriced**), because none is estimated or invented.
 *
 * Cached input is charged at the full input price, because `Usage` carries no cached-token count, and image
 * pricing (REQ-PROVIDER-150) is outside the revision — both are the directive's stated costs.
 */
export type RequestPricing = 'reported' | 'configured' | 'unpriced';

/** A completed request's usage with the figure it was priced at, `cost` absent exactly when it is unpriced. */
export interface PricedUsage extends Usage {
  readonly pricing: RequestPricing;
}

/**
 * Prices one request. `rates` are the prices of the model THIS request was sent to — the ladder cell's model at
 * the moment of the call, so a request re-run on a fallback is priced at the fallback's rates.
 */
export function priceRequest(usage: Usage, rates: ModelPricing | null | undefined): PricedUsage {
  if (usage.cost !== undefined) return { ...usage, pricing: 'reported' };
  // Nothing counted, nothing to price: an attempt that failed before the provider counted a token is not a configured figure of 0.
  if (!rates || (usage.input === 0 && usage.output === 0)) return { ...usage, pricing: 'unpriced' };
  const input = multiplyAmount(rates.input, usage.input);
  const output = multiplyAmount(rates.output, usage.output);
  // `effectivePricing` hands over only decimals the loader validated, so a null here is a caller's defect: unpriced, not guessed.
  if (input === null || output === null) return { ...usage, pricing: 'unpriced' };
  return { ...usage, cost: addAmounts(input, output), pricing: 'configured' };
}

/**
 * What the run's requests have been, as far as the qualifier needs to know: whether any carried a figure, whether
 * any carried none, and whether any figure came from configured rates. A request that reported no tokens and no
 * cost — an attempt that failed before the provider counted anything — moved no total and counts as neither.
 */
export interface PricingTally {
  readonly priced: boolean;
  readonly unpriced: boolean;
  readonly configured: boolean;
}

export const EMPTY_TALLY: PricingTally = { priced: false, unpriced: false, configured: false };

export function tallyRequest(tally: PricingTally, u: PricedUsage): PricingTally {
  if (u.pricing === 'unpriced') return u.input === 0 && u.output === 0 ? tally : { ...tally, unpriced: true };
  return { ...tally, priced: true, configured: tally.configured || u.pricing === 'configured' };
}

/** The directive's table: the qualifier the run's requests earn. */
export function qualifierOf(t: PricingTally): CostQualifier {
  if (!t.priced) return 'unknown';
  if (t.unpriced) return 'incomplete';
  return t.configured ? 'configured' : 'reported';
}

/**
 * The tally back from what a save persisted: the qualifier and whether the run has counted any tokens. The four
 * qualifiers and the token total together decide all three facts, so a continuation counts on from where the last
 * run stopped without a column per fact. `unknown` with tokens means requests were counted and none was priced;
 * `unknown` without them means nothing was counted yet.
 */
export function tallyFrom(qualifier: string | undefined, hasTokens: boolean): PricingTally {
  switch (qualifier) {
    case 'incomplete': return { priced: true, unpriced: true, configured: false };
    case 'reported': return { priced: true, unpriced: false, configured: false };
    case 'configured': return { priced: true, unpriced: false, configured: true };
    default: return { priced: false, unpriced: hasTokens, configured: false };
  }
}
