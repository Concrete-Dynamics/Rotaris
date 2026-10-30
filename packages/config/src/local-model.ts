import { join } from 'node:path';
import { BUILT_IN_ROLE_NAMES } from '@rotaris/contracts';
import { err, ok, type Result } from '@rotaris/kernel';
import { MODEL_SLOTS } from './keys.js';
import { AGENTS_FILE_NAME } from './load.js';
import type { PlainMap } from './merge.js';
import { writeConfigFields, type WriteOutcome, type WriteRefusal } from './writers.js';

/**
 * R-088 — every agent role on one locally hosted, OpenAI-compatible model (the owner's `ds41`), as CONFIGURATION and
 * nothing else: REQ-PROVIDER-051's `openai-compatible--<label>` instance as a `models:` entry (REQ-CONFIG-082..097), every
 * slot of REQ-CONFIG-063 pointed at it, `compressor:` and `circuit_breaker:` with them, and a `personas:` block that
 * binds each of the thirteen built-in roles and `intent-classifier` by name (REQ-CONFIG-098) — so no role reaches the
 * shipped defaults through a tier alias it was never pointed past.
 *
 * The endpoint is the USER's: nothing here holds an address, a host name or a key. The key is named by environment
 * variable (`api_key_env`, REQ-CONFIG-083) and read per request; the base URL arrives as an argument. `applyLocalModel`
 * writes the layer through the scoped per-field writer (REQ-CONFIG-441..444), which overlays field by field and keeps
 * the file's comments, so applying it twice changes nothing the second time — one repeatable action
 * (`pnpm local-model:apply`).
 */
export const LOCAL_MODEL_ROLES: readonly string[] = [...BUILT_IN_ROLE_NAMES, 'intent-classifier'];

/** The two non-slot model references: REQ-CONFIG-132's compressor and REQ-CONFIG-136's circuit-breaker classifier. */
export const LOCAL_MODEL_SECTIONS = ['compressor', 'circuit_breaker'] as const;

export interface LocalModelSpec {
  /** The `models:` key and the instance label, `ds41` for the owner's model. */
  readonly label: string;
  /** The identifier the endpoint serves the model under. */
  readonly modelId: string;
  /** The endpoint, supplied by the user, never shipped. */
  readonly baseUrl: string;
  /** The environment variable holding the key; null for an endpoint that takes none. */
  readonly apiKeyEnv: string | null;
  /** A reasoning model spends tokens before it answers; a small cap leaves it no content (REQ-ADOPT-027's lesson). */
  readonly maxOutputTokens?: number;
}

/** REQ-PROVIDER-051: the label lowercased, every run of non-alphanumerics one `-`, trimmed. */
export function localInstanceId(label: string): string {
  return `openai-compatible--${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`;
}

/** REQ-PROVIDER-053's shape: a scheme and a host, trailing slashes dropped. */
export function normaliseLocalBaseUrl(raw: string): Result<string, string> {
  const s = raw.trim().replace(/\/+$/, '');
  let parsed: URL;
  try { parsed = new URL(s); } catch { return err('the base URL must include a scheme and a host name'); }
  if (!/^https?:$/.test(parsed.protocol) || parsed.hostname === '') return err('the base URL must be http or https and name a host');
  return ok(s);
}

export function localModelLayer(spec: LocalModelSpec): Result<PlainMap, string> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(spec.label)) return err('the label must be letters, digits, dot, underscore or hyphen, starting with a letter or digit');
  if (spec.modelId.trim() === '') return err('the model id must not be empty');
  if (spec.apiKeyEnv !== null && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(spec.apiKeyEnv)) return err('the key variable must be an environment variable name');
  const base = normaliseLocalBaseUrl(spec.baseUrl);
  if (!base.ok) return base;
  const entry: PlainMap = { provider: localInstanceId(spec.label), model_id: spec.modelId.trim(), base_url: base.value, max_output_tokens: spec.maxOutputTokens ?? 16_384 };
  if (spec.apiKeyEnv !== null) entry['api_key_env'] = spec.apiKeyEnv;
  const layer: PlainMap = { models: { [spec.label]: entry } };
  for (const slot of MODEL_SLOTS) layer[slot] = spec.label;
  for (const section of LOCAL_MODEL_SECTIONS) layer[section] = { model: spec.label };
  layer['personas'] = Object.fromEntries(LOCAL_MODEL_ROLES.map((role) => [role, { model: spec.label }]));
  return ok(layer);
}

/** Writes the layer into `<configDir>/agents.yaml`, field by field; idempotent. */
export async function applyLocalModel(configDir: string, spec: LocalModelSpec): Promise<Result<WriteOutcome, WriteRefusal | { readonly code: 'invalid-spec'; readonly fault: string }>> {
  const layer = localModelLayer(spec);
  if (!layer.ok) return err({ code: 'invalid-spec', fault: layer.error });
  return writeConfigFields(join(configDir, AGENTS_FILE_NAME), layer.value);
}
