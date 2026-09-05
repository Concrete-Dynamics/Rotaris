import { existsSync, readFileSync } from 'node:fs';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { err, failure, hasCredentialPrefix, isSecretLookingName, ok, type Failure, type Result, type Timers } from '@rotaris/kernel';
import { NO_RETRY, replaceDocument, type RetryLadder } from '@rotaris/platform';
import type { DiscoveredModel } from './discovery.js';
import type { SlotPicks } from './slots.js';
import { withLock, type LockDeps } from './credentials/lock.js';

/**
 * REQ-PROVIDER-084..087 — the discovered-provider catalogue persisted as `project_settings.yaml` in the
 * per-user configuration directory: `version: 1`, a `providers` map, unknown keys rejected, keys emitted in
 * written order, non-ASCII literal, mode 0644, atomic writes under the adjacent lock, every write preceded
 * by the secret screen of 086. Reading takes no lock (ADR-0032). Naming: `snapshot.ts` in `config` is what
 * the Settings screen reads; this file is named after the document it owns.
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
    doc = parseYaml(text);
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

/**
 * REQ-PROVIDER-086 — the secret screen: a key meeting REQ-TOOLS-172's test, or carrying the segment
 * `session`, or containing `ghu_`; a string value carrying a credential prefix at a token boundary. The
 * only exemptions: the two per-token price keys beneath `pricing`, and the keys beneath `limits`.
 */
export function screenSecrets(doc: unknown, path = ''): string | null {
  if (typeof doc === 'string') return hasCredentialPrefix(doc) ? path : null;
  if (Array.isArray(doc)) {
    for (let i = 0; i < doc.length; i++) {
      const hit = screenSecrets(doc[i], `${path}[${i}]`);
      if (hit !== null) return hit;
    }
    return null;
  }
  if (isMap(doc)) {
    for (const [key, value] of Object.entries(doc)) {
      const here = path.length === 0 ? key : `${path}.${key}`;
      const parentKey = path.split(/[.[]/).pop() ?? '';
      const exempt = (parentKey === 'pricing' && (key === 'input_cost_per_token' || key === 'output_cost_per_token')) || parentKey === 'limits';
      if (!exempt) {
        const lower = key.toLowerCase();
        const segments = lower.replace(/^-+/, '').split(/[^a-z0-9]+/);
        if (isSecretLookingName(key) || segments.includes('session') || lower.includes('ghu_')) return here;
      }
      const hit = screenSecrets(value, here);
      if (hit !== null) return hit;
    }
  }
  return null;
}

export const REFUSED_SECRET = 'Refusing to write snapshot: secret-like field detected:';

/** Keys in written order, non-ASCII literal. */
export function serializeSnapshot(snap: ProjectSnapshot): string {
  return stringifyYaml({ version: snap.version, providers: snap.providers }, { lineWidth: 0, defaultStringType: 'PLAIN', defaultKeyType: 'PLAIN' });
}

/**
 * REQ-PROVIDER-083 — the persisted list: the picked models first, the rest sorted by qualified id;
 * previously known models the refresh did not return are preserved (sorted, appended) and counted; every
 * row carries the shared discovery timestamp.
 */
export interface ProviderMeta {
  readonly id: string;
  readonly displayName: string;
  readonly family: string | null;
  readonly baseUrl: string | null;
  readonly authenticated: boolean;
}

export function mergeProviderRecord(previous: ProviderRecord | null, discovered: readonly DiscoveredModel[], picks: SlotPicks, meta: ProviderMeta, nowIso: string): { record: ProviderRecord; preserved: number } {
  const fresh = new Map<string, SnapshotModel>();
  for (const m of discovered) {
    if (fresh.has(m.qualifiedId)) continue;
    fresh.set(m.qualifiedId, { id: m.qualifiedId, capabilities: m.capabilities, limits: m.limits, pricing: m.pricing, discovered_at: nowIso, ...(m.displayName !== null ? { display_name: m.displayName } : {}) });
  }
  const pickedIds = [picks.picks.small, picks.picks.medium, picks.picks.large].filter((x): x is string => x !== null);
  const picked: SnapshotModel[] = [];
  for (const id of pickedIds) {
    const m = fresh.get(id);
    if (m && !picked.some((p) => p.id === id)) picked.push(m);
  }
  const rest = [...fresh.values()].filter((m) => !pickedIds.includes(m.id)).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const preservedRows = (previous?.models ?? []).filter((m) => !fresh.has(m.id)).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const models = [...picked, ...rest, ...preservedRows];
  const record: ProviderRecord = {
    id: meta.id, display_name: meta.displayName, authenticated: meta.authenticated, discovered_at: nowIso, models,
    ...(meta.family !== null ? { family: meta.family } : {}),
    ...(meta.baseUrl !== null ? { base_url: meta.baseUrl } : {}),
    ...(picks.default_summary_model !== null ? { default_summary_model: picks.default_summary_model } : {}),
    ...(picks.large_model !== null ? { large_model: picks.large_model } : {}),
    ...(picks.medium_model !== null ? { medium_model: picks.medium_model } : {}),
    ...(picks.small_model !== null ? { small_model: picks.small_model } : {}),
    ...(picks.fallback_model !== null ? { fallback_model: picks.fallback_model } : {}),
  };
  return { record, preserved: preservedRows.length };
}

export interface ProjectSettingsDeps {
  readonly path: string;
  readonly lock: LockDeps;
  readonly timers: Timers;
  readonly ladder?: RetryLadder;
  readonly warn: (m: string) => void;
}

/** REQ-PROVIDER-087: upsert one record (creating the file), remove one (reporting whether anything was removed). */
export class ProjectSettingsStore {
  constructor(private readonly deps: ProjectSettingsDeps) {}

  get path(): string { return this.deps.path; }
  private get lockPath(): string { return `${this.deps.path}.lock`; }

  read(): Result<ProjectSnapshot | null, string> {
    return readProjectSnapshot(this.deps.path, this.deps.warn);
  }

  private async write(snap: ProjectSnapshot): Promise<Result<void, Failure>> {
    const hit = screenSecrets(snap);
    if (hit !== null) return err(failure('snapshot.secret', `${REFUSED_SECRET} ${hit}`));
    const r = await replaceDocument(this.deps.path, serializeSnapshot(snap), { mode: 0o644, ladder: this.deps.ladder ?? NO_RETRY, timers: this.deps.timers, createParent: true });
    return r.ok ? ok(undefined) : err(r.error);
  }

  async upsertProvider(record: ProviderRecord): Promise<Result<void, Failure>> {
    return withLock(this.lockPath, this.deps.lock, async () => {
      const current = this.read();
      if (!current.ok) return err(failure('snapshot.read', current.error));
      const providers: Record<string, ProviderRecord> = { ...(current.value?.providers ?? {}) };
      providers[record.id] = record;
      return this.write({ version: 1, providers });
    });
  }

  async removeProvider(id: string): Promise<Result<{ removed: boolean }, Failure>> {
    return withLock<{ removed: boolean }>(this.lockPath, this.deps.lock, async () => {
      const current = this.read();
      if (!current.ok) return err(failure('snapshot.read', current.error));
      if (!current.value || !(id in current.value.providers)) return ok({ removed: false });
      const providers: Record<string, ProviderRecord> = { ...current.value.providers };
      delete providers[id];
      const w = await this.write({ version: 1, providers });
      return w.ok ? ok({ removed: true }) : w;
    });
  }
}
