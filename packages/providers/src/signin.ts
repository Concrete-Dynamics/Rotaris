import { displayMask, err, failure, ok, type Failure, type Result, type WallClock } from '@rotaris/kernel';
import { toIsoUtc } from '@rotaris/kernel';
import { CATALOGUE, displayNameFor, instanceId, isInstanceId, lookupProvider, METHOD_LABELS, modelsEndpoint, normalizeBaseUrl, PROVIDER_IDS, signInMethodFor, type SignInMethod } from './catalogue.js';
import { credentialStatus, headerValidKey, type CredentialStatus, type CredentialStore, type StoredCredential } from './credentials/store.js';
import { discover, type DiscoveredModel, type DiscoveryError, type FetchLike } from './discovery.js';
import { KNOWN_LIMITS } from './limits.data.js';
import { mergeProviderRecord, type ProjectSettingsStore, type ProviderRecord } from './project-settings.js';
import { assignSlots } from './slots.js';

/**
 * ADR-0030's sign-in flows, Part K: the API-KEY method only (REQ-PROVIDER-050..054, 108, 133), for
 * `openai-compatible--<slug>` instances and the built-in `deepseek`; validate → discover → persist the
 * credential AFTER discovery → upsert the snapshot with rollback → the outcome. The device-code and
 * browser-PKCE authenticators are owed: a sign-in to a provider needing one ends in REQ-PROVIDER-012's
 * one failure outcome naming the method. Sign-out (102/060), delete (055), validate (141/108), refresh
 * (147), health (118 → REQ-NOTIFY-200) and the provider list (140). The per-provider last error (057) is
 * held here, in memory, single-valued.
 */
export interface SignInDeps {
  readonly credentials: CredentialStore;
  readonly settings: ProjectSettingsStore;
  readonly wall: WallClock;
  readonly fetch?: FetchLike;
  readonly log: (m: string) => void;
  readonly warn: (m: string) => void;
}

export type SignInOutcome =
  | { readonly outcome: 'signed-in'; readonly id: string; readonly displayName: string; readonly discovered: number; readonly message: string; readonly keyValidated: boolean }
  | { readonly outcome: 'needs-confirmation'; readonly id: string; readonly message: string }
  | { readonly outcome: 'no-models'; readonly id: string; readonly message: string }
  | { readonly outcome: 'cancelled' }
  | { readonly outcome: 'failed'; readonly message: string };

export interface AddInstanceRequest {
  readonly label: string;
  readonly baseUrl: string;
  readonly apiKey: string;
  /** REQ-PROVIDER-052: the user confirmed replacing an existing instance of the same id. */
  readonly replace?: boolean;
  /** REQ-WORKSPACE-135 / REQ-PROVIDER-097: continue with zero models. */
  readonly allowEmpty?: boolean;
}

export const PROVIDER_STATES = ['checking', 'coming_soon', 'error', 'healthy', 'unauthenticated', 'unknown', 'warning'] as const;
export type ProviderState = (typeof PROVIDER_STATES)[number];

export interface ProviderHealth { readonly state: ProviderState; readonly detail: string; readonly available: boolean }

export interface ProviderRow {
  readonly id: string;
  readonly displayName: string;
  readonly method: SignInMethod | null;
  readonly methodLabel: string;
  readonly authenticated: boolean;
  readonly status: CredentialStatus;
  /** REQ-PROVIDER-107/140: the display mask, or null when no key is stored. */
  readonly maskedKey: string | null;
  readonly baseUrl: string | null;
  readonly modelCount: number;
  readonly userDefined: boolean;
  readonly available: boolean;
  readonly lastError: string | null;
}

export interface PrimingReport {
  readonly authenticated: readonly string[];
  readonly renewed: readonly string[];
  readonly unresolved: Readonly<Record<string, string>>;
  readonly ok: boolean;
}

export class ProviderService {
  private readonly lastErrors = new Map<string, string>();

  constructor(private readonly deps: SignInDeps) {}

  private nowSeconds(): number { return Math.floor(this.deps.wall.instant() / 1000); }
  private nowIso(): string { return toIsoUtc(this.deps.wall.instant()); }

  lastError(id: string): string | null { return this.lastErrors.get(id) ?? null; }
  private recordError(id: string, message: string): void { this.lastErrors.set(id, message); }
  private clearError(id: string): void { this.lastErrors.delete(id); }

  private snapshotRecord(id: string): ProviderRecord | null {
    const snap = this.deps.settings.read();
    return snap.ok ? snap.value?.providers[id] ?? null : null;
  }

  displayName(id: string): string { return displayNameFor(id, this.snapshotRecord(id)?.display_name ?? null); }

  /** REQ-PROVIDER-010/059: from the stored credential and the clock alone; no network. */
  status(id: string): CredentialStatus { return credentialStatus(this.deps.credentials.load(id), this.nowSeconds()); }

  method(id: string): SignInMethod | null {
    const family = this.deps.credentials.load(id)?.extra['provider_family'] ?? null;
    const m = signInMethodFor(id, family);
    if (m === null && !CATALOGUE.some((c) => c.id === id)) this.deps.warn(`Unknown auth provider: ${id}`);
    return m;
  }

  private discoveryUrl(id: string, baseUrl: string | null): string | null {
    const entry = lookupProvider(id);
    return baseUrl !== null ? modelsEndpoint(baseUrl) : entry.ok ? entry.value.discoveryUrl : null;
  }

  private async runDiscovery(id: string, token: string, baseUrl: string | null, displayName: string = this.displayName(id)): Promise<Result<DiscoveredModel[], DiscoveryError>> {
    const url = this.discoveryUrl(id, baseUrl);
    if (url === null) return err({ kind: 'refused', status: null, message: `${displayName} declares no catalog endpoint.` });
    return discover({ providerId: id, displayName, modelsUrl: url, token, knownLimits: KNOWN_LIMITS, ...(this.deps.fetch ? { fetch: this.deps.fetch } : {}) });
  }

  /**
   * REQ-PROVIDER-133 relies on discovery refusing a bad key; a catalog that answers WITHOUT a key (OpenRouter's does)
   * proves nothing about the key. Found on the slice's first execution: a key of another vendor's shape was stored as
   * validated. The flow completes — the catalog is real — but says so, and the health detail carries it.
   */
  private async catalogIsPublic(id: string, baseUrl: string | null, displayName: string): Promise<boolean> {
    const url = this.discoveryUrl(id, baseUrl);
    if (url === null) return false;
    const anonymous = await discover({ providerId: id, displayName, modelsUrl: url, token: '', knownLimits: KNOWN_LIMITS, ...(this.deps.fetch ? { fetch: this.deps.fetch } : {}) });
    return anonymous.ok;
  }

  static readonly PUBLIC_CATALOG_NOTE = 'This endpoint answers its model catalog without a key, so the key could not be validated against it; the first run will tell.';

  /** The base URL a record carries: the instance's stored `api_base`, else the catalogue's default. */
  private recordBase(id: string, cred: StoredCredential | null): string | null {
    if (isInstanceId(id)) return cred?.extra['api_base'] ?? this.snapshotRecord(id)?.base_url ?? null;
    const entry = lookupProvider(id);
    return entry.ok ? entry.value.baseUrl : null;
  }

  private async persistModels(id: string, displayName: string, family: string | null, baseUrl: string | null, models: readonly DiscoveredModel[]): Promise<Result<{ preserved: number }, Failure>> {
    const previous = this.snapshotRecord(id);
    const picks = assignSlots(models.map((m) => ({ qualifiedId: m.qualifiedId, id: m.id, available: true })));
    const { record, preserved } = mergeProviderRecord(previous, models, picks, { id, displayName, family, baseUrl, authenticated: true }, this.nowIso());
    const w = await this.deps.settings.upsertProvider(record);
    return w.ok ? ok({ preserved }) : w;
  }

  /**
   * REQ-PROVIDER-052/054: an OpenAI-compatible instance. Validate label, URL and key; confirm a replacement;
   * discover; refuse zero models unless allowed; persist the credential; persist the models with rollback.
   */
  async addInstance(req: AddInstanceRequest): Promise<SignInOutcome> {
    const idr = instanceId(req.label);
    if (!idr.ok) return { outcome: 'failed', message: idr.error };
    const id = idr.value;
    const base = normalizeBaseUrl(req.baseUrl);
    if (!base.ok) return { outcome: 'failed', message: base.error };
    const key = headerValidKey(req.apiKey);
    if (!key.ok) return { outcome: 'failed', message: key.error };
    if (key.value.length === 0) return { outcome: 'failed', message: 'API key is required.' };
    const exists = this.deps.credentials.exists(id) || this.snapshotRecord(id) !== null;
    if (exists && !req.replace) return { outcome: 'needs-confirmation', id, message: `Replace the existing provider instance '${req.label}'?` };
    return this.completeApiKeySignIn(id, req.label.trim(), 'openai-compatible', base.value, base.value, key.value, { provider_family: 'openai-compatible', api_base: base.value }, req.allowEmpty ?? false, `Added ${req.label.trim()}; discovered {n} model(s).`);
  }

  /** REQ-PROVIDER-050: a built-in API-key provider (deepseek); persist only after discovery with ≥1 model. */
  async signInWithKey(id: string, apiKey: string, allowEmpty = false): Promise<SignInOutcome> {
    const entry = lookupProvider(id);
    if (!entry.ok) return { outcome: 'failed', message: `${entry.error.headline}. ${entry.error.detail ?? ''}`.trim() };
    if (!entry.value.available) return { outcome: 'failed', message: entry.value.unavailabilityReason ?? 'This provider is not available.' };
    const method = entry.value.signInMethod;
    if (method !== 'api-key' || entry.value.connectionMode === 'local-sdk') {
      const message = `${entry.value.displayName} signs in with "${METHOD_LABELS[method]}", which this build does not provide yet.`;
      return { outcome: 'failed', message };
    }
    const key = headerValidKey(apiKey);
    if (!key.ok) return { outcome: 'failed', message: key.error };
    if (key.value.length === 0) return { outcome: 'failed', message: 'API key is required.' };
    // The record carries the catalogue's base URL so the configuration layer needs no catalogue of its own (REQ-PROVIDER-091).
    return this.completeApiKeySignIn(id, entry.value.displayName, null, null, entry.value.baseUrl, key.value, {}, allowEmpty, `Login complete for ${entry.value.displayName}; discovered {n} model(s).`);
  }

  private async completeApiKeySignIn(id: string, displayName: string, family: string | null, discoveryBase: string | null, recordBase: string | null, key: string, extra: Record<string, string>, allowEmpty: boolean, successTemplate: string): Promise<SignInOutcome> {
    const found = await this.runDiscovery(id, key, discoveryBase, displayName);
    if (!found.ok) {
      // REQ-PROVIDER-054: the key redacted in any error text.
      const message = found.error.message.split(key).join('[redacted]');
      this.recordError(id, message);
      return { outcome: 'failed', message };
    }
    if (found.value.length === 0 && !allowEmpty) return { outcome: 'no-models', id, message: 'no models discovered.' };
    // REQ-PROVIDER-133: the credential is persisted only after discovery succeeded.
    const previous = this.deps.credentials.load(id);
    const credential: StoredCredential = { access_token: key, refresh_token: '', expires_at: 0, account_id: null, extra: { ...(previous?.extra ?? {}), ...extra } };
    const saved = await this.deps.credentials.save(id, credential);
    if (!saved.ok) {
      const message = `${saved.error.headline}${saved.error.detail ? ` (${saved.error.detail})` : ''}`;
      this.recordError(id, message);
      return { outcome: 'failed', message };
    }
    const persisted = await this.persistModels(id, displayName, family, recordBase, found.value);
    if (!persisted.ok) {
      // REQ-PROVIDER-054: roll back the credential just saved.
      await this.deps.credentials.delete(id);
      const message = `Could not save provider ${id}: ${persisted.error.headline}${persisted.error.detail ? ` (${persisted.error.detail})` : ''}`;
      this.recordError(id, message);
      return { outcome: 'failed', message };
    }
    this.clearError(id);
    const publicCatalog = await this.catalogIsPublic(id, discoveryBase, displayName);
    const message = `${successTemplate.replace('{n}', String(found.value.length))}${publicCatalog ? ` ${ProviderService.PUBLIC_CATALOG_NOTE}` : ''}`;
    this.deps.log(message);
    return { outcome: 'signed-in', id, displayName, discovered: found.value.length, message, keyValidated: !publicCatalog };
  }

  /** REQ-PROVIDER-108/141: replace the key; validated by discovery unless the user opted out. */
  async replaceKey(id: string, apiKey: string, validate = true): Promise<Result<string, string>> {
    const method = this.method(id);
    if (method !== 'api-key') return err(`${this.displayName(id)} does not sign in with an API key.`);
    const key = headerValidKey(apiKey);
    if (!key.ok) return err(key.error);
    if (key.value.length === 0) return err(`A key is required for ${this.displayName(id)}.`);
    const previous = this.deps.credentials.load(id);
    const baseUrl = previous?.extra['api_base'] ?? this.snapshotRecord(id)?.base_url ?? null;
    const extra: Record<string, string> = { ...(previous?.extra ?? {}) };
    if (isInstanceId(id)) { extra['provider_family'] = 'openai-compatible'; if (baseUrl) extra['api_base'] = baseUrl; }
    let models: DiscoveredModel[] | null = null;
    if (validate) {
      const found = await this.runDiscovery(id, key.value, isInstanceId(id) ? baseUrl : null);
      if (!found.ok) { const m = `Validation failed for ${this.displayName(id)}: ${found.error.message.split(key.value).join('[redacted]')}`; this.recordError(id, m); return err(m); }
      if (found.value.length === 0) { const m = `Validation failed for ${this.displayName(id)}: no models discovered.`; this.recordError(id, m); return err(m); }
      models = found.value;
    }
    const saved = await this.deps.credentials.save(id, { access_token: key.value, refresh_token: '', expires_at: 0, account_id: null, extra });
    if (!saved.ok) return err(saved.error.headline);
    if (models) {
      const p = await this.persistModels(id, this.displayName(id), isInstanceId(id) ? 'openai-compatible' : null, isInstanceId(id) ? baseUrl : this.recordBase(id, previous), models);
      if (!p.ok) return err(p.error.headline);
    }
    this.clearError(id);
    return ok(models ? `Validated ${this.displayName(id)}; discovered ${models.length} model(s).` : `Saved the key for ${this.displayName(id)}.`);
  }

  /** REQ-PROVIDER-141: a changed base URL re-runs discovery when a key is stored and updates both places. */
  async setBaseUrl(id: string, baseUrl: string): Promise<Result<string, string>> {
    if (!isInstanceId(id)) return err(`${this.displayName(id)} has a fixed endpoint.`);
    const base = normalizeBaseUrl(baseUrl);
    if (!base.ok) return err(base.error);
    const cred = this.deps.credentials.load(id);
    if (cred) {
      const found = await this.runDiscovery(id, cred.access_token, base.value);
      if (!found.ok) { const m = `Validation failed for ${this.displayName(id)}: ${found.error.message}`; this.recordError(id, m); return err(m); }
      const saved = await this.deps.credentials.save(id, { ...cred, extra: { ...cred.extra, provider_family: 'openai-compatible', api_base: base.value } });
      if (!saved.ok) return err(saved.error.headline);
      const p = await this.persistModels(id, this.displayName(id), 'openai-compatible', base.value, found.value);
      if (!p.ok) return err(p.error.headline);
      this.clearError(id);
      return ok(`Validated ${this.displayName(id)} at ${base.value}; discovered ${found.value.length} model(s).`);
    }
    const rec = this.snapshotRecord(id);
    if (!rec) return err(`${this.displayName(id)} is not configured.`);
    const w = await this.deps.settings.upsertProvider({ ...rec, base_url: base.value });
    return w.ok ? ok(`Saved the base URL for ${this.displayName(id)}.`) : err(w.error.headline);
  }

  /** REQ-PROVIDER-108/141: validate requires stored credentials; re-runs discovery; persists models. */
  async validate(id: string): Promise<Result<string, string>> {
    const cred = this.deps.credentials.load(id);
    if (!cred) return err(`${this.displayName(id)} is not authenticated.`);
    const found = await this.runDiscovery(id, cred.access_token, isInstanceId(id) ? cred.extra['api_base'] ?? null : null);
    if (!found.ok) {
      const m = `Validation failed for ${this.displayName(id)}: ${found.error.message}`;
      this.recordError(id, m);
      // REQ-PROVIDER-098: a refused catalog read discards the stored authentication (codex excepted).
      if (found.error.kind === 'auth' && id !== 'codex') { await this.deps.credentials.delete(id); this.deps.log(`Discarded stored authentication for ${this.displayName(id)}.`); }
      return err(m);
    }
    const p = await this.persistModels(id, this.displayName(id), isInstanceId(id) ? 'openai-compatible' : null, this.recordBase(id, cred), found.value);
    if (!p.ok) return err(p.error.headline);
    this.clearError(id);
    return ok(`Validated ${this.displayName(id)}; discovered ${found.value.length} model(s).${p.value.preserved > 0 ? ` ${p.value.preserved} previously known model(s) preserved.` : ''}`);
  }

  /** REQ-PROVIDER-102/060: sign-out. Never touches the snapshot. */
  async signOut(target: string): Promise<{ readonly outcome: 'signed-out' | 'nothing' | 'failed' | 'unknown'; readonly message: string }> {
    const id = target.trim().toLowerCase();
    const known = this.knownSignOutTargets();
    if (!known.includes(id)) return { outcome: 'unknown', message: `Unknown provider '${id}'. Known providers: ${known.join(', ')}. A user-defined instance is named openai-compatible--<label>.` };
    const name = this.displayName(id);
    const r = await this.deps.credentials.delete(id);
    this.lastErrors.delete(id);
    if (!r.ok) return { outcome: 'failed', message: `Sign-out of ${name} failed: ${r.error.headline}${r.error.detail ? ` (${r.error.detail})` : ''}` };
    return r.value.removed ? { outcome: 'signed-out', message: `Signed out of ${name}.` } : { outcome: 'nothing', message: `${name} was not signed in; nothing to do.` };
  }

  /** REQ-PROVIDER-102: catalogue ids minus the family id, plus every instance with a credential or a snapshot entry. */
  knownSignOutTargets(): string[] {
    const ids = new Set<string>(PROVIDER_IDS.filter((p) => p !== 'openai-compatible'));
    for (const id of this.deps.credentials.list()) if (isInstanceId(id)) ids.add(id);
    const snap = this.deps.settings.read();
    if (snap.ok && snap.value) for (const id of Object.keys(snap.value.providers)) if (isInstanceId(id)) ids.add(id);
    return [...ids].sort();
  }

  /** REQ-PROVIDER-143: the providers holding a stored credential right now, each with its display name. */
  signedIn(): { id: string; displayName: string }[] {
    return this.deps.credentials.list().map((id) => ({ id, displayName: this.displayName(id) }));
  }

  /** REQ-PROVIDER-055: only instances are deletable; the snapshot entry and the credential are removed; references untouched. */
  async deleteInstance(id: string): Promise<Result<{ message: string; credentialRemoved: boolean; snapshotRemoved: boolean }, string>> {
    if (!isInstanceId(id)) return err(`Provider ${id} is built-in or not user-defined.`);
    const hadCredential = this.deps.credentials.exists(id);
    const hadSnapshot = this.snapshotRecord(id) !== null;
    if (!hadCredential && !hadSnapshot) return err(`Unknown user-defined provider: ${id}.`);
    const s = await this.deps.settings.removeProvider(id);
    if (!s.ok) return err(s.error.headline);
    const c = await this.deps.credentials.delete(id);
    if (!c.ok) return err(c.error.headline);
    this.lastErrors.delete(id);
    return ok({ message: `Deleted user-defined provider ${id}.`, credentialRemoved: c.value.removed, snapshotRemoved: s.value.removed });
  }

  /** REQ-PROVIDER-147: refresh one or all; bulk silently skips the unauthenticated, a targeted one reports the skip as a failure. */
  async refresh(ids: readonly string[] | 'all', report: (line: string) => void): Promise<{ succeeded: number; failed: number; skipped: number; complete: boolean }> {
    // REQ-PROVIDER-135: the family id is a template, never credentialed, and is no refresh target.
    const targets = ids === 'all' ? this.allKnownIds().filter((id) => id !== 'openai-compatible') : [...ids];
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;
    for (const id of targets) {
      if (ids !== 'all' && !this.allKnownIds().includes(id)) { failed += 1; report(`${id} is not a known provider. Known: ${this.allKnownIds().join(', ')}.`); continue; }
      if (!this.deps.credentials.exists(id)) {
        if (ids === 'all') { skipped += 1; continue; }
        failed += 1;
        report(`${this.displayName(id)} was skipped: it is not authenticated. Sign in to it first.`);
        continue;
      }
      report(`Refreshing ${this.displayName(id)}…`);
      const r = await this.validate(id);
      if (r.ok) { succeeded += 1; report(r.value); } else { failed += 1; report(r.error); }
    }
    const parts: string[] = [];
    if (succeeded > 0) parts.push(`${succeeded} succeeded`);
    if (failed > 0) parts.push(`${failed} failed`);
    if (skipped > 0) parts.push(`${skipped} skipped (not authenticated)`);
    const complete = failed === 0 && skipped === 0;
    report(`Catalog refresh ${complete ? 'completed with nothing failed and nothing skipped' : 'finished with failures or skips'}${parts.length > 0 ? `: ${parts.join(', ')}` : ''}.`);
    return { succeeded, failed, skipped, complete };
  }

  allKnownIds(): string[] {
    const ids = new Set<string>([...PROVIDER_IDS, ...this.deps.credentials.list()]);
    const snap = this.deps.settings.read();
    if (snap.ok && snap.value) for (const id of Object.keys(snap.value.providers)) ids.add(id);
    return [...ids].sort();
  }

  /** REQ-PROVIDER-118 → REQ-NOTIFY-200: the observations reduced to one state with its detail. */
  async health(id: string): Promise<ProviderHealth> {
    const entry = lookupProvider(id);
    if (entry.ok && !entry.value.available) return { state: 'coming_soon', detail: entry.value.unavailabilityReason ?? '', available: false };
    const method = this.method(id);
    if (method === null) return { state: 'unknown', detail: 'Authentication is managed by model configuration.', available: true };
    const status = this.status(id);
    if (status === 'unauthenticated') return { state: 'unauthenticated', detail: 'Not authenticated.', available: true };
    if (status === 'expired') return { state: 'unauthenticated', detail: 'Authentication expired; re-authentication required.', available: true };
    const cred = this.deps.credentials.load(id)!;
    let found: Result<DiscoveredModel[], DiscoveryError>;
    try {
      found = await this.runDiscovery(id, cred.access_token, isInstanceId(id) ? cred.extra['api_base'] ?? null : null);
    } catch (cause) {
      return { state: 'error', detail: String((cause as Error).message ?? cause), available: true };
    }
    if (!found.ok) {
      if (found.error.kind === 'auth') return { state: 'unauthenticated', detail: found.error.message, available: true };
      return { state: 'error', detail: found.error.message, available: true };
    }
    const p = await this.persistModels(id, this.displayName(id), isInstanceId(id) ? 'openai-compatible' : null, this.recordBase(id, cred), found.value);
    if (!p.ok) return { state: 'error', detail: p.error.headline, available: true };
    return { state: 'healthy', detail: `Validated ${this.displayName(id)}; discovered ${found.value.length} model(s).`, available: true };
  }

  /** REQ-PROVIDER-140: the union of credential ids, catalogue ids and snapshot ids, each once, by id. */
  list(): ProviderRow[] {
    return this.allKnownIds().map((id) => {
      const entry = lookupProvider(id);
      const rec = this.snapshotRecord(id);
      const cred = this.deps.credentials.load(id);
      const method = this.method(id);
      const status = credentialStatus(cred, this.nowSeconds());
      return {
        id, displayName: this.displayName(id), method, methodLabel: method ? METHOD_LABELS[method] : 'Authentication is managed by model configuration.',
        authenticated: status === 'authenticated', status,
        maskedKey: cred && method === 'api-key' && cred.access_token.length > 0 ? displayMask(cred.access_token) : null,
        baseUrl: cred?.extra['api_base'] ?? rec?.base_url ?? (entry.ok ? entry.value.baseUrl : null),
        modelCount: rec?.models.length ?? 0, userDefined: isInstanceId(id), available: entry.ok ? entry.value.available : true,
        lastError: this.lastError(id),
      };
    });
  }

  /**
   * ADR-0030 / REQ-PROVIDER-057/067: the bearers leased to a run, resolved from the store and the clock. API
   * keys carry no expiry, so nothing is renewed this part; an unresolved provider is reported once with its
   * reason and never fails the run here (the run host decides what an unresolved entry model means).
   */
  lease(ids: readonly string[]): { bearers: Record<string, string>; report: PrimingReport } {
    const bearers: Record<string, string> = {};
    const authenticated: string[] = [];
    const unresolved: Record<string, string> = {};
    for (const id of new Set(ids)) {
      const cred = this.deps.credentials.load(id);
      const status = credentialStatus(cred, this.nowSeconds());
      if (status === 'authenticated' && cred) { bearers[id] = cred.access_token; authenticated.push(id); this.clearError(id); continue; }
      const reason = status === 'expired' ? 'Authentication expired; re-authentication required.' : 'Authentication required';
      unresolved[id] = reason;
      this.recordError(id, reason);
    }
    return { bearers, report: { authenticated, renewed: [], unresolved, ok: Object.keys(unresolved).length === 0 } };
  }

  /** REQ-PROVIDER-132: the uniform health sentence for a configured provider. */
  healthIssue(id: string): { message: string; editable: boolean } | null {
    const status = this.status(id);
    if (status === 'authenticated') return null;
    const name = this.displayName(id);
    if (status === 'expired') return { message: `${name} authentication is expired.`, editable: false };
    return this.method(id) === 'api-key' ? { message: `${name} is missing an API key.`, editable: true } : { message: `${name} is not authenticated.`, editable: false };
  }
}

export const NEEDS_KEY = (name: string) => `A key is required for ${name}.`;
export function unavailableMethodMessage(name: string, method: SignInMethod): string {
  return `${name} signs in with "${METHOD_LABELS[method]}", which this build does not provide yet.`;
}
export function failureText(f: Failure): string { return f.detail ? `${f.headline} (${f.detail})` : f.headline; }
export { failure };
