/**
 * REQ-PROVIDER-079 — the known (input, output) token-limit table, keyed `provider/model` or `provider/`.
 * The rows are BUILD DATA (ADR-0028's data modules), revised without a specification change; what is
 * normative is the key shape, the positive-integer pairs, the shipped `deepseek/` row, and that the table is
 * consulted only through `lookupKnownLimits`. A table with no matching row leaves the limits unknown.
 */
export interface KnownLimits { readonly input: number; readonly output: number }
export type KnownLimitsTable = Readonly<Record<string, KnownLimits>>;

export const KNOWN_LIMITS: KnownLimitsTable = Object.freeze({
  'openai/gpt-4o': { input: 128_000, output: 16_384 },
  'openai/gpt-4o-mini': { input: 128_000, output: 16_384 },
  'openai/gpt-4.1': { input: 1_047_576, output: 32_768 },
  'openai/gpt-4.1-mini': { input: 1_047_576, output: 32_768 },
  'openai/gpt-4.1-nano': { input: 1_047_576, output: 32_768 },
  'openai/o3': { input: 200_000, output: 100_000 },
  'openai/o4-mini': { input: 200_000, output: 100_000 },
  'anthropic/claude-3-5-sonnet': { input: 200_000, output: 8_192 },
  'anthropic/claude-3-5-haiku': { input: 200_000, output: 8_192 },
  'anthropic/claude-sonnet-4': { input: 200_000, output: 64_000 },
  'anthropic/claude-opus-4': { input: 200_000, output: 32_000 },
  'anthropic/claude-haiku-4-5': { input: 200_000, output: 64_000 },
  'deepseek/deepseek-chat': { input: 131_072, output: 8_192 },
  'deepseek/deepseek-reasoner': { input: 131_072, output: 65_536 },
  'deepseek/': { input: 1_048_576, output: 384_000 },
});

const KEY_SHAPE = /^[a-z0-9][a-z0-9.-]*\/[A-Za-z0-9][A-Za-z0-9._/-]*$|^[a-z0-9][a-z0-9.-]*\/$/;

/** The shape test the table ships with. */
export function validateKnownLimits(table: KnownLimitsTable = KNOWN_LIMITS): string[] {
  const problems: string[] = [];
  for (const [key, v] of Object.entries(table)) {
    if (!KEY_SHAPE.test(key)) problems.push(`${key}: not provider/model or provider/`);
    if (!Number.isInteger(v.input) || v.input <= 0 || !Number.isInteger(v.output) || v.output <= 0) problems.push(`${key}: limits must be positive integers`);
  }
  const ds = table['deepseek/'];
  if (!ds || ds.input !== 1_048_576 || ds.output !== 384_000) problems.push('deepseek/: the provider-wide row must ship as (1,048,576, 384,000)');
  return problems;
}

/** REQ-PROVIDER-079: the suffixes removed one at a time, each shortened form tried as it is produced. */
function* shortenings(id: string): Generator<string> {
  let current = id;
  yield current;
  const suffixes = [/-latest$/, /-\d{4}-\d{2}-\d{2}$/, /-\d{8}$/, /-\d{4}$/];
  let changed = true;
  while (changed) {
    changed = false;
    for (const s of suffixes) {
      if (s.test(current)) {
        current = current.replace(s, '');
        changed = true;
        yield current;
      }
    }
  }
}

/** For lookup, codex and copilot read as openai; an instance is tried under its own id then under `openai-compatible`. */
export function lookupProvidersFor(providerId: string): string[] {
  if (providerId === 'codex' || providerId === 'copilot') return ['openai'];
  if (providerId.startsWith('openai-compatible--')) return [providerId, 'openai-compatible'];
  return [providerId];
}

export function lookupKnownLimits(table: KnownLimitsTable, providerId: string, modelId: string): KnownLimits | null {
  for (const provider of lookupProvidersFor(providerId)) {
    for (const form of shortenings(modelId)) {
      const hit = table[`${provider}/${form}`];
      if (hit) return hit;
    }
    const wide = table[`${provider}/`];
    if (wide) return wide;
  }
  return null;
}
