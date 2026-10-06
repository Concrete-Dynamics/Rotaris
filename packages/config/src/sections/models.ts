import { isPlainMap, type PlainMap } from '../merge.js';
import { REASONING_LEVELS, type ReasoningLevel } from '../keys.js';
import { FieldReader, typeName, vocabularyString, type ProblemSink } from './field.js';

/**
 * `models:` entries (REQ-CONFIG-082..097): exactly two required fields; every other field has a default.
 * `api_key` is a secret — redacted in any rendering (REQ-CONFIG-083); the shipped two entries read theirs
 * from `OPENAI_API_KEY` (REQ-CONFIG-097). Known-token-limit back-fill (REQ-CONFIG-096) is not built: no
 * limits table ships with this build, and the two budget fields stay as written.
 */
export const API_MODES = ['chat', 'responses'] as const;
export type ApiMode = (typeof API_MODES)[number];

export interface ModelEntry {
  readonly provider: string;
  readonly model_id: string;
  readonly api_key: string | null;
  readonly api_key_env: string | null;
  readonly auth_provider: string | null;
  readonly base_url: string | null;
  readonly disable_streaming: boolean;
  readonly disable_responses_api: boolean;
  readonly api_mode: ApiMode | null;
  readonly max_input_tokens: number | null;
  readonly max_output_tokens: number | null;
  readonly context_compression_threshold: number | null;
  readonly timeout: number | null;
  readonly num_retries: number | null;
  readonly temperature: number | null;
  readonly top_p: number | null;
  readonly top_k: number | null;
  readonly presence_penalty: number | null;
  readonly repetition_penalty: number | null;
  readonly seed: number | null;
  readonly extra_body: PlainMap;
  /** REQ-CONFIG-088 (amended, OQ-21): a decimal ≥ 0 as the canonical decimal string of `money.ts`, or null. */
  readonly input_cost_per_token: string | null;
  readonly output_cost_per_token: string | null;
  readonly thinking: ReasoningLevel | null;
  readonly reasoning_effort: string | null;
  readonly reasoning_effort_map: Readonly<Record<string, string>>;
  /**
   * REQ-CONFIG-094/057: the cap the entry STATES — a number, or `null` written explicitly (unbounded) — and absent when the
   * key is not written. The provider's declared cap is not filled in here: configuration holds no list of provider names
   * (PD-PROVIDER-001, REQ-MONITOR-021); the cap in force is `modelCapInForce`'s.
   */
  readonly max_parallel?: number | null;
  /** REQ-PROVIDER-149: explicit provider declaration consumed by the composer gate. */
  readonly accepts_image_input: boolean;
}

export const MODEL_ENTRY_KEYS = [
  'provider', 'model_id', 'api_key', 'api_key_env', 'auth_provider', 'base_url', 'disable_streaming', 'disable_responses_api', 'api_mode',
  'max_input_tokens', 'max_output_tokens', 'context_compression_threshold', 'timeout', 'num_retries',
  'temperature', 'top_p', 'top_k', 'presence_penalty', 'repetition_penalty', 'seed', 'extra_body',
  'input_cost_per_token', 'output_cost_per_token', 'thinking', 'reasoning_effort', 'reasoning_effort_map', 'max_parallel', 'accepts_image_input',
] as const;

/**
 * REQ-CONFIG-095 under PD-PROVIDER-001 (REQ-MONITOR-021, REQ-PROVIDER-049): the cap in force for a model. A `max_parallel`
 * the entry states replaces the provider's declared cap entirely — raising it, lowering it, or removing it with an
 * explicit `null` (REQ-CONFIG-057); unstated, the cap is the number the provider's catalogue entry declares (`declared`,
 * the catalogue's `sharedQuotaCaps`, handed in by whoever can read the catalogue), and a provider declaring none leaves
 * the model unbounded. Until fin22 the two numbers were a list of provider names here (`defaultMaxParallel`,
 * `docs/defects/fixed/the-shared-quota-cap-is-a-list-of-provider-names-not-a-catalogue-property.md`).
 */
export function modelCapInForce(entry: ModelEntry | undefined, declared: Readonly<Record<string, number>>): number | null {
  if (entry === undefined) return null;
  if (entry.max_parallel !== undefined) return entry.max_parallel;
  return Object.hasOwn(declared, entry.provider) ? declared[entry.provider]! : null;
}

/** REQ-CONFIG-090: `thinking` accepts the legacy boolean spellings — `true` is `high`, `false` is unset. */
function thinkingOf(r: FieldReader, key: string): ReasoningLevel | null {
  const raw = r.raw(key);
  if (raw === undefined || raw === null) return null;
  if (raw === true) return 'high';
  if (raw === false) return null;
  const text = vocabularyString(raw);
  if (text !== null && (REASONING_LEVELS as readonly string[]).includes(text)) return text as ReasoningLevel;
  r.error(key, `'${text ?? typeName(raw)}' is not a reasoning level; expected one of: ${REASONING_LEVELS.join(', ')}`);
  return null;
}

export function readModelEntry(name: string, value: unknown, sink: ProblemSink): ModelEntry | null {
  const base = `models.${name}`;
  if (!isPlainMap(value)) { sink.errors.push({ path: base, message: `a models entry must be a mapping, got ${typeName(value)}` }); return null; }
  const r = new FieldReader(value, base, sink);
  r.warnUnknown(MODEL_ENTRY_KEYS);
  const provider = r.requiredString('provider');
  const modelId = r.requiredString('model_id');
  const disableResponses = r.bool('disable_responses_api', false);
  const authProvider = r.stringOrNull('auth_provider');
  const entry: ModelEntry = {
    provider: provider ?? '',
    model_id: modelId ?? '',
    api_key: r.stringOrNull('api_key'),
    api_key_env: r.stringOrNull('api_key_env'),
    auth_provider: authProvider,
    base_url: r.stringOrNull('base_url'),
    disable_streaming: r.bool('disable_streaming', false),
    // REQ-CONFIG-084: automatically enabled when the auth provider is copilot.
    disable_responses_api: disableResponses || authProvider === 'copilot',
    api_mode: r.vocabularyOrNull('api_mode', API_MODES),
    max_input_tokens: r.intOrNull('max_input_tokens', { min: 1 }),
    max_output_tokens: r.intOrNull('max_output_tokens', { min: 1 }),
    context_compression_threshold: r.intOrNull('context_compression_threshold', { min: 1 }),
    timeout: r.intOrNull('timeout', { min: 1 }),
    num_retries: r.intOrNull('num_retries', { min: 0 }),
    temperature: r.floatOrNull('temperature'),
    top_p: r.floatOrNull('top_p'),
    top_k: r.intOrNull('top_k'),
    presence_penalty: r.floatOrNull('presence_penalty'),
    repetition_penalty: r.floatOrNull('repetition_penalty'),
    seed: r.intOrNull('seed'),
    extra_body: r.mappingOrNull('extra_body') ?? {},
    input_cost_per_token: r.decimalOrNull('input_cost_per_token'),
    output_cost_per_token: r.decimalOrNull('output_cost_per_token'),
    thinking: thinkingOf(r, 'thinking'),
    reasoning_effort: r.stringOrNull('reasoning_effort'),
    reasoning_effort_map: r.stringMapOrNull('reasoning_effort_map') ?? {},
    ...(r.has('max_parallel') ? { max_parallel: r.intOrNull('max_parallel', { min: 1 }) } : {}),
    accepts_image_input: r.bool('accepts_image_input', false),
  };
  return provider === null || modelId === null ? null : entry;
}

export function readModelsSection(value: unknown, sink: ProblemSink): Record<string, ModelEntry> {
  const out: Record<string, ModelEntry> = {};
  if (value === undefined || value === null) return out;
  if (!isPlainMap(value)) { sink.errors.push({ path: 'models', message: `must be a mapping of model entries, got ${typeName(value)}` }); return out; }
  for (const [name, entry] of Object.entries(value)) {
    const read = readModelEntry(name, entry, sink);
    if (read) out[name] = read;
  }
  return out;
}

/** A model's per-token prices, each the decimal its configuration states (REQ-CONFIG-088). */
export interface ModelPricing {
  readonly input: string;
  readonly output: string;
}

/** REQ-CONFIG-088: pricing takes effect only when both figures are set. */
export function effectivePricing(entry: Pick<ModelEntry, 'input_cost_per_token' | 'output_cost_per_token'>): ModelPricing | null {
  return entry.input_cost_per_token !== null && entry.output_cost_per_token !== null ? { input: entry.input_cost_per_token, output: entry.output_cost_per_token } : null;
}

/** REQ-CONFIG-092/093: the four strings a provider receives unchanged; `max` → `xhigh`; a map entry wins; `auto` reaches no provider. */
export function providerEffort(entry: Pick<ModelEntry, 'thinking' | 'reasoning_effort' | 'reasoning_effort_map'>): string | null {
  if (entry.reasoning_effort !== null) return entry.reasoning_effort;
  const level = entry.thinking;
  if (level === null || level === 'auto') return null;
  const mapped = entry.reasoning_effort_map[level];
  if (mapped !== undefined) return mapped;
  return level === 'max' ? 'xhigh' : level;
}

/** REQ-CONFIG-083: a diagnostic rendering never carries the key. */
export function redactedModel(entry: ModelEntry): ModelEntry {
  return entry.api_key === null ? entry : { ...entry, api_key: '[redacted]' };
}
