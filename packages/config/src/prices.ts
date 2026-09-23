import { isMap, isScalar, isSeq, type Node } from 'yaml';
import { amountFromText } from '@rotaris/kernel';
import { isPlainMap } from './merge.js';

/**
 * REQ-CONFIG-088 (amended 2026-09-23, OQ-21) and PD-MONITOR-001 revision 2: a per-token price is taken as the decimal
 * its TEXT states, never as the binary floating-point value a YAML number parses to. The YAML library converts
 * `0.000003` to a double the moment it builds the plain value, so the exact reading has to be taken from the
 * scalar's source text before that value is used — `3e-6`, `0.000003` and `.000003` then all arrive as
 * `0.000003`, and a price quoted as a string arrives as that string.
 */
export const PRICE_KEYS: ReadonlySet<string> = new Set(['input_cost_per_token', 'output_cost_per_token']);

/**
 * Walks a parsed YAML node and the plain value `plainOf` built from it, in step, and replaces each price key's
 * numeric value in the plain value with the decimal its scalar's source text states. Everything else is left as
 * it was, including a price whose text is not a decimal (the validator reports that), so the walk can only make a
 * number exact and never changes what a document means. Mutates `plain`, which the caller owns.
 */
export function exactPrices(node: Node | null | undefined, plain: unknown): void {
  if (node === null || node === undefined) return;
  if (isMap(node) && isPlainMap(plain)) {
    for (const pair of node.items) {
      const key = isScalar(pair.key) ? String(pair.key.value) : null;
      if (key === null || !(key in plain)) continue;
      const value = pair.value as Node | null;
      if (PRICE_KEYS.has(key) && isScalar(value) && typeof value.value === 'number') {
        const exact = amountFromText(typeof value.source === 'string' ? value.source : String(value.value));
        if (exact !== null) plain[key] = exact;
        continue;
      }
      exactPrices(value, plain[key]);
    }
    return;
  }
  if (isSeq(node) && Array.isArray(plain)) node.items.forEach((item, i) => exactPrices(item as Node, plain[i]));
}
