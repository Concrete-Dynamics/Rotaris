import { formatAmount } from '@rotaris/kernel';
import { COST_QUALIFIERS, type CostQualifier, type SessionRecord } from '@rotaris/contracts';

/**
 * REQ-MONITOR-166: the cost label carries its own qualifier, so no view has to invent a description for a
 * run whose price could not be established.
 *
 * PD-MONITOR-001 revision 2 fixes four qualifiers and their labels, and the qualifier is the one the run EARNED
 * and recorded with its total (`sessions.cost_qualifier`, v21) — read back, never re-derived from the amount,
 * because since configured rates price requests a non-zero total no longer says how it was reached. The amount is
 * rendered under REQ-PROVIDER-121's rule: half-up, two decimal places, four below one hundredth, and **no
 * currency symbol**, because no figure here names a currency and the product does not pick one (the narrowing).
 *
 * Two falsified readings, kept beside their replacement: "no rate is configured in this build, so the price is
 * unknown" (revision 0), and "a total that is not zero is a reported price" (revision 1, when a provider's report
 * was the only route to a figure).
 */
export function costLabelOf(cost: string, qualifier: string): SessionRecord['costLabel'] {
  const unknown = { text: 'price not established', qualifier: 'unknown' } as const;
  if (qualifier === 'unknown' || !(COST_QUALIFIERS as readonly string[]).includes(qualifier)) return unknown;
  const amount = formatAmount(cost);
  if (amount === null) return { text: `${cost} (price not established)`, qualifier: 'unknown' };
  switch (qualifier as Exclude<CostQualifier, 'unknown'>) {
    case 'incomplete': return { text: `at least ${amount}; some requests have no price`, qualifier: 'incomplete' };
    case 'configured': return { text: `${amount} at configured rates`, qualifier: 'configured' };
    case 'reported': return { text: `${amount} reported by the provider`, qualifier: 'reported' };
  }
}
