import { existsSync, readFileSync } from 'node:fs';
import { parseDocument } from 'yaml';
import { exactPrices } from './prices.js';
import { err, ok, type Result } from '@rotaris/kernel';
import { MODEL_SLOTS, type ModelSlot } from './keys.js';
import type { PlainMap } from './merge.js';
import type { ModelEntry } from './sections/models.js';

/**
 * REQ-PROVIDER-084/085 (the reader) and REQ-CONFIG-034 / REQ-PROVIDER-091 / REQ-CONFIG-204 (the layer):
 * `project_settings.yaml` in the per-user configuration directory is layer 3 of REQ-CONFIG-031 — the
 * discovered-provider snapshot. Reading takes no lock (ADR-0032; ADR-0004 rule 1). The writer, the merge
 * and the secret screen live in `providers`, which imports these types; `config` holds the reader because
 * the loader folds the layer and may not import `providers`.
 */
export interface SnapshotModel {
  readonly id: string;
  readonly display_name?: string;
  readonly capabilities: Readonly<Record<string, unknown>>;
  readonly limits: Readonly<Record<string, number>>;
  readonly pricing: Readonly<Record<string, unknown>>;
  readonly discovered_at: string;
}

export interface ProviderRecord {
  readonly id: string;
  readonly display_name: string;
  readonly family?: string;
  readonly base_url?: string;
  readonly authenticated: boolean;
  readonly default_summary_model?: string;
  readonly large_model?: string;
  readonly medium_model?: string;
  readonly small_model?: string;
  readonly fallback_model?: string;
  readonly discovered_at: string;
  readonly models: readonly SnapshotModel[];
}

export interface ProjectSnapshot {
  readonly version: 1;
  readonly providers: Readonly<Record<string, ProviderRecord>>;
}

export const PROJECT_SETTINGS_FILE = 'project_settings.yaml' as const;
export const UNSUPPORTED_VERSION = 'unsupported project snapshot version';
const PROVIDER_KEYS = new Set(['id', 'display_name', 'family', 'base_url', 'authenticated', 'default_summary_model', 'large_model', 'medium_model', 'small_model', 'fallback_model', 'discovered_at', 'models']);
const MODEL_KEYS = new Set(['id', 'display_name', 'capabilities', 'limits', 'pricing', 'discovered_at']);
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function isMap(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function readModel(v: unknown, where: string, warn: (m: string) => void): Result<SnapshotModel, string> {
  if (!isMap(v)) return err(`${where}: a model record must be a mapping`);
  for (const k of Object.keys(v)) if (!MODEL_KEYS.has(k)) return err(`${where}: unknown key '${k}'`);
  if (typeof v['id'] !== 'string' || v['id'].length === 0) return err(`${where}: id must be a non-empty string`);
  if (v['display_name'] !== undefined && typeof v['display_name'] !== 'string') return err(`${where}: display_name must be a string`);
  if (typeof v['discovered_at'] !== 'string' || !ISO_UTC.test(v['discovered_at'])) return err(`${where}: discovered_at must be ISO-8601 with a UTC offset`);
  const limits: Record<string, number> = {};
  if (v['limits'] !== undefined) {
    if (!isMap(v['limits'])) return err(`${where}: limits must be a mapping`);
    for (const [k, n] of Object.entries(v['limits'])) {
      if (typeof n !== 'number') { warn(`${where}: limits.${k} is not a number and is ignored`); continue; }
      limits[k] = n;
    }
  }
  const capabilities = isMap(v['capabilities']) ? v['capabilities'] : {};
  const pricing = isMap(v['pricing']) ? v['pricing'] : {};
  const out: SnapshotModel = { id: v['id'], capabilities, limits, pricing, discovered_at: v['discovered_at'], ...(typeof v['display_name'] === 'string' ? { display_name: v['display_name'] } : {}) };
  return ok(out);
}

function readProvider(id: string, v: unknown, warn: (m: string) => void): Result<ProviderRecord, string> {
  const where = `providers.${id}`;
  if (!isMap(v)) return err(`${where}: a provider record must be a mapping`);
  for (const k of Object.keys(v)) if (!PROVIDER_KEYS.has(k)) return err(`${where}: unknown key '${k}'`);
  if (v['id'] !== id) return err(`${where}: id must equal the map key`);
  if (typeof v['display_name'] !== 'string') return err(`${where}: display_name must be a string`);
  if (typeof v['authenticated'] !== 'boolean') return err(`${where}: authenticated must be a boolean`);
  if (typeof v['discovered_at'] !== 'string' || !ISO_UTC.test(v['discovered_at'])) return err(`${where}: discovered_at must be ISO-8601 with a UTC offset`);
  for (const k of ['family', 'base_url', 'default_summary_model', 'large_model', 'medium_model', 'small_model', 'fallback_model']) {
    if (v[k] !== undefined && v[k] !== null && typeof v[k] !== 'string') return err(`${where}: ${k} must be a string`);
  }
  if (!Array.isArray(v['models'])) return err(`${where}: models must be a list`);
  const models: SnapshotModel[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < v['models'].length; i++) {
    const m = readModel(v['models'][i], `${where}.models[${i}]`, warn);
    if (!m.ok) return m;
    // REQ-PROVIDER-084: duplicates keep the first and warn.
    if (seen.has(m.value.id)) { warn(`${where}: duplicate model id ${m.value.id}; the first occurrence is kept`); continue; }
    seen.add(m.value.id);
    models.push(m.value);
  }
  const rec: ProviderRecord = {
    id, display_name: v['display_name'], authenticated: v['authenticated'], discovered_at: v['discovered_at'], models,
    ...(typeof v['family'] === 'string' ? { family: v['family'] } : {}),
    ...(typeof v['base_url'] === 'string' ? { base_url: v['base_url'] } : {}),
    ...(typeof v['default_summary_model'] === 'string' ? { default_summary_model: v['default_summary_model'] } : {}),
    ...(typeof v['large_model'] === 'string' ? { large_model: v['large_model'] } : {}),
    ...(typeof v['medium_model'] === 'string' ? { medium_model: v['medium_model'] } : {}),
    ...(typeof v['small_model'] === 'string' ? { small_model: v['small_model'] } : {}),
    ...(typeof v['fallback_model'] === 'string' ? { fallback_model: v['fallback_model'] } : {}),
  };
  return ok(rec);
}

/** REQ-PROVIDER-084/085: strict; the failure text is "Invalid project snapshot at <path>: <detail>". */
export function parseSnapshot(text: string, path: string, warn: (m: string) => void = () => {}): Result<ProjectSnapshot, string> {
  const invalid = (detail: string) => err(`Invalid project snapshot at ${path}: ${detail}`);
  let doc: unknown;
  try {
    const parsed = parseDocument(text);
    if (parsed.errors.length > 0) throw parsed.errors[0]!;
    doc = parsed.toJS();
    // REQ-PROVIDER-072 (amended 2026-09-23, OQ-21): a snapshot price is carried as the decimal its text states.
    exactPrices(parsed.contents, doc);
  } catch (cause) {
    return invalid(String((cause as Error).message ?? cause));
  }
  if (!isMap(doc)) return invalid('the document must be a mapping');
  for (const k of Object.keys(doc)) if (k !== 'version' && k !== 'providers') return invalid(`unknown key '${k}'`);
  if (doc['version'] !== 1) return invalid(UNSUPPORTED_VERSION);
  const providers: Record<string, ProviderRecord> = {};
  const raw = doc['providers'] ?? {};
  if (!isMap(raw)) return invalid('providers must be a mapping');
  for (const [id, v] of Object.entries(raw)) {
    const r = readProvider(id, v, warn);
    if (!r.ok) return invalid(r.error);
    providers[id] = r.value;
  }
  return ok({ version: 1, providers });
}

/** Absent → null; no lock (ADR-0004 rule 1: open-read-close). */
export function readProjectSnapshot(path: string, warn: (m: string) => void = () => {}): Result<ProjectSnapshot | null, string> {
  if (!existsSync(path)) return ok(null);
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (cause) {
    return err(`Invalid project snapshot at ${path}: ${String(cause)}`);
  }
  return parseSnapshot(text, path, warn);
}

/** REQ-PROVIDER-091: the provider family a snapshot model is dispatched as. */
export function snapshotProviderFamily(providerId: string, family: string | undefined): string {
  if (providerId === 'deepseek' || providerId === 'claude-code') return providerId;
  return family ?? 'openai-compatible';
}

/**
 * REQ-CONFIG-034 / REQ-PROVIDER-091 / REQ-CONFIG-204 — the snapshot as a layer: only `models:` and the five
 * startup slots, only for providers marked authenticated; each model an entry keyed by qualified id whose
 * `auth_provider` is the provider id and whose base URL is the record's; slot suggestions taken from
 * authenticated providers in ascending code-point order of id, the first non-null winning.
 */
export const SNAPSHOT_SLOTS = ['large_model', 'medium_model', 'small_model', 'fallback_model', 'default_summary_model'] as const satisfies readonly ModelSlot[];

const isPrice = (v: unknown): v is string | number => typeof v === 'string' || typeof v === 'number';

export function snapshotLayer(snapshot: ProjectSnapshot): { layer: PlainMap | null; authenticated: readonly string[]; slots: Readonly<Partial<Record<ModelSlot, string>>> } {
  const ids = Object.keys(snapshot.providers).filter((id) => snapshot.providers[id]!.authenticated).sort();
  if (ids.length === 0) return { layer: null, authenticated: [], slots: {} };
  const models: PlainMap = {};
  const layer: PlainMap = {};
  for (const id of ids) {
    const rec = snapshot.providers[id]!;
    for (const m of rec.models) {
      const modelId = m.id.startsWith(`${id}/`) ? m.id.slice(id.length + 1) : m.id;
      const entry: Record<string, unknown> = { provider: snapshotProviderFamily(id, rec.family), model_id: modelId, auth_provider: id };
      if (rec.base_url !== undefined) entry['base_url'] = rec.base_url;
      const input = m.limits['context_window'];
      const output = m.limits['max_output_tokens'];
      if (typeof input === 'number') entry['max_input_tokens'] = input;
      if (typeof output === 'number') entry['max_output_tokens'] = output;
      if (m.capabilities?.accepts_image_input === true) entry['accepts_image_input'] = true;
      // REQ-CONFIG-088: both or neither; each already the decimal its text states (`exactPrices` at parse).
      const inCost = m.pricing['input_cost_per_token'];
      const outCost = m.pricing['output_cost_per_token'];
      if (isPrice(inCost) && isPrice(outCost)) { entry['input_cost_per_token'] = inCost; entry['output_cost_per_token'] = outCost; }
      models[m.id] = entry;
    }
    for (const slot of SNAPSHOT_SLOTS) {
      const v = rec[slot];
      if (typeof v === 'string' && v.length > 0 && layer[slot] === undefined) layer[slot] = v;
    }
  }
  layer['models'] = models;
  const slots: Partial<Record<ModelSlot, string>> = {};
  for (const slot of SNAPSHOT_SLOTS) if (typeof layer[slot] === 'string') slots[slot] = layer[slot];
  return { layer, authenticated: ids, slots };
}

/**
 * REQ-CONFIG-332 with REQ-CONFIG-096's candidate ladder: the names a configured `models:` entry is matched under
 * against a snapshot model keyed by its qualified id. Candidates are tried in the requirement's order, with a repeated
 * candidate tried once only: the key itself when it holds a `/`; the bare `model_id`; the `model_id` with a leading
 * provider prefix removed; then each of those re-qualified as `<provider id>/<candidate>`, taking the entry's sign-in
 * provider id before its dispatch provider id (`codex` and `copilot` both read as `openai`, as REQ-CONFIG-096 fixes).
 */
export function snapshotCandidateNames(key: string, entry: Pick<ModelEntry, 'model_id' | 'provider' | 'auth_provider'>): readonly string[] {
  const forms: string[] = [];
  if (key.includes('/')) forms.push(key);
  const modelId = entry.model_id;
  if (modelId !== '') forms.push(modelId);
  const slash = modelId.indexOf('/');
  const stripped = slash >= 0 ? modelId.slice(slash + 1) : null;
  if (stripped !== null && stripped !== '') forms.push(stripped);
  const providers: string[] = [];
  for (const id of [entry.auth_provider, entry.provider]) {
    const normalised = id === 'codex' || id === 'copilot' ? 'openai' : id;
    if (normalised !== null && normalised !== '' && !providers.includes(normalised)) providers.push(normalised);
  }
  const names = [...forms];
  // The re-qualified candidates follow, the sign-in provider's before the dispatch provider's; a repeat is tried once only.
  for (const provider of providers) for (const form of forms) names.push(`${provider}/${form}`);
  return [...new Set(names)];
}

/**
 * REQ-CONFIG-332 / REQ-CONFIG-202: the capability records the discovery snapshot carries, keyed by the snapshot
 * model's qualified id (`SnapshotModel.id`), for every provider the snapshot holds. The layer's own `authenticated`
 * filter (REQ-CONFIG-034) governs which models are FOLDED into the configuration; REQ-CONFIG-332 reads the record
 * the snapshot carries for a model, which is a property of the catalogue rather than of the sign-in state.
 */
export function snapshotCapabilityRecords(snapshot: ProjectSnapshot): Readonly<Record<string, Readonly<Record<string, unknown>>>> {
  const out: Record<string, Readonly<Record<string, unknown>>> = {};
  for (const id of Object.keys(snapshot.providers).sort()) {
    const rec = snapshot.providers[id]!;
    for (const m of rec.models) if (out[m.id] === undefined) out[m.id] = m.capabilities;
  }
  return out;
}

/**
 * The reasoning levels one capability record declares under the product's own name for REQ-PROVIDER-076's raw
 * `supported_reasoning_levels` — `capabilities.reasoning_levels`, exactly as `input_modalities` maps to
 * `accepts_image_input`. Empty when the record declares none, in any other shape, or is absent; the vocabulary
 * intersection is REQ-CONFIG-332's, so this reader does not filter the declared names.
 */
export function capabilityReasoningLevels(capabilities: Readonly<Record<string, unknown>> | undefined): readonly string[] {
  const declared = capabilities?.['reasoning_levels'];
  return Array.isArray(declared) ? declared.filter((level): level is string => typeof level === 'string' && level !== '') : [];
}

/** The capability levels REQ-CONFIG-332 reads for one configured entry: the ladder's first candidate the records hold, or none. */
export function capabilityLevelsForEntry(key: string, entry: ModelEntry, records: Readonly<Record<string, Readonly<Record<string, unknown>>>>): readonly string[] {
  for (const name of snapshotCandidateNames(key, entry)) {
    const record = records[name];
    if (record !== undefined) return capabilityReasoningLevels(record);
  }
  return [];
}

export { MODEL_SLOTS };
