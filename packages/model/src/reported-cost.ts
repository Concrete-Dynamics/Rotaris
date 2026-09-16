/**
 * PD-MONITOR-001 — a cost figure the PROVIDER computed, carried rather than derived.
 *
 * The product multiplies no rates: OQ-21 and ADR-0031 still hold every route that would
 * (configured rates, discovery pricing), because each of them multiplies a per-token price by a
 * token count and REQ-PROVIDER-121 forbids doing that in binary floating point. The route this
 * file opens needs no multiplication at all — the provider states the amount, the product adds it
 * to the run's running total and to nothing else.
 *
 * Two halves, both of them protocol-shaped:
 *
 *  - **Asking.** An endpoint answers with its own cost only when the request asks for it, and the
 *    field that asks is the endpoint's, not the product's. Sending it to an endpoint that does not
 *    define it is not free — a strict OpenAI-shaped API rejects an unrecognised body field with a
 *    400 — so the ask is sent only where the protocol defines it. `COST_REPORTING_HOSTS` is that
 *    list, data rather than code, and an endpoint absent from it is asked nothing.
 *  - **Reading.** The SDK's usage mapping keeps the token fields and drops everything else, so the
 *    figure never reaches `totalUsage`; `metadataExtractor` is the seam the SDK provides for exactly
 *    this, and it hands the raw chunk over before that mapping happens.
 */

/**
 * The hosts whose chat-completions protocol defines a way to ask for the request's own cost, with
 * the body fragment each one defines for it. A host answering a cost WITHOUT being asked still has
 * its figure read: the reading half below is host-independent.
 */
export const COST_REPORTING_HOSTS: ReadonlyMap<string, Record<string, unknown>> = new Map([
  ['openrouter.ai', { usage: { include: true } }],
]);

/** The provider-metadata key the extractor writes under, and the adapter reads back. */
export const REPORTED_COST_KEY = 'rotaris';

/** The ask this endpoint defines, or null where it defines none. */
export function costAskFor(baseUrl: string | undefined): Record<string, unknown> | null {
  if (baseUrl === undefined || baseUrl === '') return null;
  let host: string;
  try {
    host = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
  for (const [suffix, ask] of COST_REPORTING_HOSTS) {
    if (host === suffix || host.endsWith(`.${suffix}`)) return ask;
  }
  return null;
}

/**
 * The amount as a plain decimal string, or null when the payload carries none.
 *
 * The figure crosses JSON as a number, so it arrives as a double whatever the provider computed it
 * in — that is the protocol's doing and is where this product's exactness begins, not where it
 * fails: nothing here rounds, scales or adds. `String(n)` gives the shortest decimal that reads
 * back as the same double, which for an amount a provider stated is the amount it stated; the only
 * work done on it is expanding an exponent form (`1.2e-7`) into positional digits, which moves
 * characters and computes nothing.
 */
export function decimalFromNumber(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  const text = String(value);
  if (!text.includes('e') && !text.includes('E')) return text;
  const m = /^(\d+)(?:\.(\d+))?e([+-]?\d+)$/i.exec(text);
  if (m === null) return null;
  const digits = `${m[1]}${m[2] ?? ''}`;
  const point = m[1]!.length + Number(m[3]);
  if (point <= 0) return `0.${'0'.repeat(-point)}${digits}`;
  if (point >= digits.length) return `${digits}${'0'.repeat(point - digits.length)}`;
  return `${digits.slice(0, point)}.${digits.slice(point)}`;
}

/** The `usage.cost` of one streamed chunk or one whole response body, as a decimal string. */
export function costOf(payload: unknown): string | null {
  const usage = (payload as { usage?: { cost?: unknown } } | null)?.usage;
  return usage === undefined || usage === null ? null : decimalFromNumber(usage.cost);
}

/**
 * The SDK's `MetadataExtractor`, structurally typed here rather than imported: the adapter is the
 * only place the SDK's types are named, and this file is asked for a plain object.
 */
export interface ReportedCostExtractor {
  extractMetadata: (args: { parsedBody: unknown }) => Promise<Record<string, Record<string, string>> | undefined>;
  createStreamExtractor: () => {
    processChunk: (parsedChunk: unknown) => void;
    buildMetadata: () => Record<string, Record<string, string>> | undefined;
  };
}

/**
 * The LAST chunk that carries one wins. A streamed response reports usage once, at the end, but a
 * provider that repeats the field mid-stream is reporting the request's running total rather than a
 * second request — taking the last reading is REQ-ORCH-142's "cumulative totals are replaced, never
 * summed", applied within one request. Across requests the figures are added, because there each
 * one is a separate purchase.
 */
export function reportedCostExtractor(): ReportedCostExtractor {
  const metadata = (cost: string | null): Record<string, Record<string, string>> | undefined =>
    cost === null ? undefined : { [REPORTED_COST_KEY]: { reportedCost: cost } };
  return {
    extractMetadata: async ({ parsedBody }) => metadata(costOf(parsedBody)),
    createStreamExtractor: () => {
      let cost: string | null = null;
      return {
        processChunk: (parsedChunk) => {
          const seen = costOf(parsedChunk);
          if (seen !== null) cost = seen;
        },
        buildMetadata: () => metadata(cost),
      };
    },
  };
}

/** The figure back out of the SDK's provider metadata, where the extractor put it. */
export function reportedCostFrom(metadata: unknown): string | null {
  const bag = (metadata as Record<string, Record<string, unknown>> | undefined)?.[REPORTED_COST_KEY];
  const cost = bag?.['reportedCost'];
  return typeof cost === 'string' && cost !== '' ? cost : null;
}
