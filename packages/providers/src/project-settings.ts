import { stringify as stringifyYaml } from 'yaml';
import { err, failure, hasCredentialPrefix, isSecretLookingName, ok, type Failure, type Result, type Timers } from '@rotaris/kernel';
import { NO_RETRY, replaceDocument, type RetryLadder } from '@rotaris/platform';
import { readProjectSnapshot, type ProjectSnapshot, type ProviderRecord, type SnapshotModel } from '@rotaris/config';
import type { DiscoveredModel } from './discovery.js';
import type { SlotPicks } from './slots.js';
import { withLock, type LockDeps } from './credentials/lock.js';

/**
 * REQ-PROVIDER-084..087 — the discovered-provider catalogue persisted as `project_settings.yaml` in the
 * per-user configuration directory: `version: 1`, a `providers` map, unknown keys rejected, keys emitted in
 * written order, non-ASCII literal, mode 0644, atomic writes under the adjacent lock, every write preceded
 * by the secret screen of 086. The READER and the types are `config`'s (`project-settings.ts` there), because the
 * loader folds this document as layer 3 and may not import this package. Naming: `snapshot.ts` in `config` is what
 * the Settings screen reads; this file is named after the document it owns.
 */
export { readProjectSnapshot, parseSnapshot, UNSUPPORTED_VERSION, PROJECT_SETTINGS_FILE, type ProjectSnapshot, type ProviderRecord, type SnapshotModel } from '@rotaris/config';

function isMap(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
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
