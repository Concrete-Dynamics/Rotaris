import { countNoun, displayMask, err, failure, ok, type Failure, type Result, type Timers, type WallClock } from '@rotaris/kernel';
import { toIsoUtc } from '@rotaris/kernel';
import { CATALOGUE, displayNameFor, instanceId, isInstanceId, lookupProvider, MANAGED_BY_CONFIGURATION, METHOD_LABELS, modelsEndpoint, normalizeBaseUrl, PROVIDER_IDS, signInMethodFor, type SignInMethod } from './catalogue.js';
import { credentialStatus, headerValidKey, type CredentialStatus, type CredentialStore, type StoredCredential } from './credentials/store.js';
import { discover, type DiscoveredModel, type DiscoveryError, type FetchLike } from './discovery.js';
import { discoverCodex, discoverCopilot, isAvailable } from './discovery-strategies.js';
import { CLAUDE_CODE_MARKER, CLAUDE_CODE_METHOD_LABEL, CLAUDE_CODE_NO_KEY, CLAUDE_CODE_NOT_INSTALLED, claudeCodeModels, claudeCodeStatus, localToolProblem, type LocalToolState } from './flows/claude-code.js';
import { authenticateCodex, CODEX_ORIGINATOR, refreshCodex } from './flows/codex.js';
import { authenticateCopilot, COPILOT_API_HEADERS, copilotStatus, refreshCopilot } from './flows/copilot.js';
import { CANCELLED_BY_USER, type FlowDeps, type SignInPrompt } from './flows/oauth.js';
import { KNOWN_LIMITS } from './limits.data.js';
import { mergeProviderRecord, type ProjectSettingsStore, type ProviderRecord } from './project-settings.js';
import { assignSlots } from './slots.js';

/**
 * ADR-0030's sign-in flows. The API-KEY method (REQ-PROVIDER-050..054, 108, 133), for
 * `openai-compatible--<slug>` instances and the built-in `deepseek`: validate → discover → persist the credential
 * AFTER discovery → upsert the snapshot with rollback → the outcome. `claude-code` (PD-PROVIDER-002) takes no key: it
 * is connected by asking the Claude Code tool installed on this machine whether it is signed in with a subscription,
 * and what is stored for it is a marker, never that tool's credential. The INTERACTIVE methods (R-111): `copilot`'s device code (REQ-PROVIDER-020..027) and
 * `codex`'s browser PKCE on the loopback listener (REQ-PROVIDER-028..034), in REQ-PROVIDER-096's sequence, the
 * credential stored BEFORE discovery (REQ-PROVIDER-097: every discovery outcome leaves it in place). The hosted
 * provider's OIDC flow is owed and its entry is unavailable (REQ-PROVIDER-006). Silent
 * refresh and the unconditional renew (057/058), the lease with REQ-PROVIDER-067's margin, sign-out (102/060),
 * delete (055), validate (141/108), refresh (147), health (118 → REQ-NOTIFY-200) and the provider list (140).
 * The per-provider last error (057) is held here, in memory, single-valued.
 */
export interface SignInDeps {
  readonly credentials: CredentialStore;
  readonly settings: ProjectSettingsStore;
  readonly wall: WallClock;
  /** The timer port the interactive waits run on (the device flow's poll, the callback's 300 seconds). */
  readonly timers: Timers;
  readonly fetch?: FetchLike;
  /**
   * PD-PROVIDER-002: the Claude Code tool on this machine — whether its executable is on the search path (read without
   * starting anything), and what it says of its own sign-in when asked. Absent where no local tool can be reached.
   */
  readonly localTool?: { readonly installed: () => boolean; readonly state: () => Promise<LocalToolState> };
  readonly log: (m: string) => void;
  readonly warn: (m: string) => void;
}

export type SignInOutcome =
  | { readonly outcome: 'signed-in'; readonly id: string; readonly displayName: string; readonly discovered: number; readonly message: string; readonly keyValidated: boolean }
  | { readonly outcome: 'needs-confirmation'; readonly id: string; readonly message: string }
  | { readonly outcome: 'no-models'; readonly id: string; readonly message: string }
  | { readonly outcome: 'cancelled' }
  | { readonly outcome: 'failed'; readonly message: string };

/**
 * REQ-NOTIFY-076: how the authentication recovery dialog can re-authenticate a provider here. `api-key`: a masked key field
 * stored through `reauthenticateWithKey`. `unavailable`: a device-code or browser provider — those flows are owed (the
 * catalogue's header) — or one the catalogue marks unavailable; `message` says which. `configuration`: an id no sign-in
 * method resolves for, whose credential the model configuration carries (REQ-PROVIDER-118/140, OQ-179).
 */
export type ReauthenticationMethod = { readonly method: 'api-key' | 'interactive' | 'unavailable' | 'configuration'; readonly message: string };

/** REQ-PROVIDER-096: what an interactive sign-in is started with. Nothing here is a credential. */
export interface InteractiveSignInOptions {
  /** REQ-PROVIDER-096: discard the stored authentication first and force the flow. */
  readonly reauthenticate?: boolean;
  readonly allowEmpty?: boolean;
  readonly prompt: (p: SignInPrompt) => void;
  readonly signal?: AbortSignal;
}

/** REQ-PROVIDER-067: renew when within five minutes of expiry. */
export const REFRESH_MARGIN_S = 300;

/**
 * REQ-NOTIFY-076/077: what storing a re-authentication key answered, by the stage that refused it — so a key that could not
 * be STORED is told apart from one the provider refused (`validation`), which REQ-NOTIFY-077 names separately. `catalog`:
 * the key WAS stored, and only the models its validation discovered could not be recorded in the provider settings — not a
 * key that could not be stored, so it never takes REQ-NOTIFY-077's "could not be stored" wording.
 */
export type ReauthenticationOutcome =
  | { readonly ok: true; readonly message: string }
  | { readonly ok: false; readonly stage: 'method' | 'key' | 'validation' | 'storage' | 'catalog'; readonly message: string };

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
  /** PD-PROVIDER-002: connected through the tool installed on this machine — no key field, Authenticate starts the check. */
  readonly local: boolean;
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

/** What a run is leased per provider besides its bearer: the request headers that provider's API needs. Never a credential. */
export type LeasedHeaders = Readonly<Record<string, Readonly<Record<string, string>>>>;

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
  status(id: string): CredentialStatus { return this.statusOf(id, this.deps.credentials.load(id)); }

  /** REQ-PROVIDER-027 (copilot), 045 (claude-code), 034 and 011 (everything else). */
  private statusOf(id: string, cred: StoredCredential | null): CredentialStatus {
    if (id === 'copilot') return copilotStatus(cred, this.nowSeconds());
    if (id === 'claude-code') return claudeCodeStatus(cred);
    return credentialStatus(cred, this.nowSeconds());
  }

  private localSdk(id: string): boolean { return CATALOGUE.some((c) => c.id === id && c.connectionMode === 'local-sdk'); }
  private localInstalled(): boolean { return this.deps.localTool?.installed() ?? false; }
  private async localState(): Promise<LocalToolState> {
    if (!this.deps.localTool || !this.deps.localTool.installed()) return { installed: false, signedIn: false, subscription: false, plan: null };
    return this.deps.localTool.state().catch(() => ({ installed: true, signedIn: false, subscription: false, plan: null }));
  }

  private flowFetch(): FetchLike { return this.deps.fetch ?? ((input, init) => fetch(input, init)); }

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

  /** REQ-PROVIDER-069: the discovery dispatch. `cred` supplies what a strategy reads beside the token (account id, tenant base). */
  private async runDiscovery(id: string, token: string, baseUrl: string | null, displayName: string = this.displayName(id), cred: StoredCredential | null = this.deps.credentials.load(id)): Promise<Result<DiscoveredModel[], DiscoveryError>> {
    if (id === 'claude-code') return ok(claudeCodeModels());
    const url = this.discoveryUrl(id, baseUrl);
    const common = { providerId: id, displayName, token, knownLimits: KNOWN_LIMITS, ...(this.deps.fetch ? { fetch: this.deps.fetch } : {}) };
    if (id === 'codex' && url !== null) return discoverCodex({ ...common, modelsUrl: url, accountId: cred?.account_id ?? null });
    if (id === 'copilot' && url !== null) return discoverCopilot({ ...common, modelsUrl: url, apiBase: cred?.extra['api_base'] ?? null });
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
    // REQ-PROVIDER-099: "using the stored API base for the base URL" — Copilot's tenant base, where the exchange gave one.
    if (id === 'copilot' && cred?.extra['api_base']) return cred.extra['api_base'];
    const entry = lookupProvider(id);
    return entry.ok ? entry.value.baseUrl : null;
  }

  private async persistModels(id: string, displayName: string, family: string | null, baseUrl: string | null, models: readonly DiscoveredModel[]): Promise<Result<{ preserved: number }, Failure>> {
    const previous = this.snapshotRecord(id);
    const picks = assignSlots(models.map((m) => ({ qualifiedId: m.qualifiedId, id: m.id, available: isAvailable(m) })));
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
    return this.completeApiKeySignIn(id, req.label.trim(), 'openai-compatible', base.value, base.value, key.value, { provider_family: 'openai-compatible', api_base: base.value }, req.allowEmpty ?? false, `Added ${req.label.trim()}; discovered {models}.`);
  }

  /** REQ-PROVIDER-050: a built-in API-key provider (deepseek); persist only after discovery with ≥1 model. */
  async signInWithKey(id: string, apiKey: string, allowEmpty = false): Promise<SignInOutcome> {
    const entry = lookupProvider(id);
    if (!entry.ok) return { outcome: 'failed', message: `${entry.error.headline}. ${entry.error.detail ?? ''}`.trim() };
    if (!entry.value.available) return { outcome: 'failed', message: entry.value.unavailabilityReason ?? 'This provider is not available.' };
    const method = entry.value.signInMethod;
    if (method !== 'api-key') return { outcome: 'failed', message: `${entry.value.displayName} signs in with "${METHOD_LABELS[method]}", not with a pasted key.` };
    // PD-PROVIDER-002: a local-sdk provider takes no key by any route.
    if (entry.value.connectionMode === 'local-sdk') return { outcome: 'failed', message: CLAUDE_CODE_NO_KEY };
    const key = headerValidKey(apiKey);
    if (!key.ok) return { outcome: 'failed', message: key.error };
    if (key.value.length === 0) return { outcome: 'failed', message: 'API key is required.' };
    // The record carries the catalogue's base URL so the configuration layer needs no catalogue of its own (REQ-PROVIDER-091).
    return this.completeApiKeySignIn(id, entry.value.displayName, null, null, entry.value.baseUrl, key.value, {}, allowEmpty, `Login complete for ${entry.value.displayName}; discovered {models}.`);
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
    const message = `${successTemplate.replace('{models}', countNoun(found.value.length, 'model'))}${publicCatalog ? ` ${ProviderService.PUBLIC_CATALOG_NOTE}` : ''}`;
    this.deps.log(message);
    return { outcome: 'signed-in', id, displayName, discovered: found.value.length, message, keyValidated: !publicCatalog };
  }

  /**
   * REQ-PROVIDER-108/141: replace the key; validated by discovery unless the user opted out. The refusing stage is named,
   * as for the recovery dialog's key path: `catalog` is a key that WAS stored, so the caller knows the credentials changed
   * (REQ-NOTIFY-068) although the answer is a refusal.
   */
  async replaceKey(id: string, apiKey: string, validate = true): Promise<ReauthenticationOutcome> {
    return this.storeKey(id, apiKey, validate);
  }

  /** REQ-NOTIFY-076: the method the recovery dialog offers for `id`, read from the catalogue and the stored family alone. */
  reauthentication(id: string): ReauthenticationMethod {
    const entry = CATALOGUE.find((c) => c.id === id);
    if (entry && !entry.available) return { method: 'unavailable', message: entry.unavailabilityReason ?? `${entry.displayName} is not available.` };
    const method = signInMethodFor(id, this.deps.credentials.load(id)?.extra['provider_family'] ?? null);
    if (method === null) return { method: 'configuration', message: `${MANAGED_BY_CONFIGURATION} Re-authenticate ${this.displayName(id)} by correcting the key its model configuration names, then retry.` };
    if (method !== 'api-key' || entry?.connectionMode === 'local-sdk') return { method: 'interactive', message: `${this.displayName(id)} signs in with "${METHOD_LABELS[method]}". Start its sign-in, complete it at the provider, then confirm here.` };
    return { method: 'api-key', message: `Enter a new API key for ${this.displayName(id)}. It is validated with the provider's model catalog endpoint before it is saved.` };
  }

  /**
   * REQ-NOTIFY-076/077 / REQ-NOTIFY-202: the recovery dialog's key path — the provider's own key store, a signed-in provider
   * or one never signed in alike: the key validated by discovery before it is saved, saved, and the discovered models
   * persisted. The answer names the stage that refused, so the caller can tell a storage failure apart (REQ-NOTIFY-077).
   */
  async reauthenticateWithKey(id: string, apiKey: string): Promise<ReauthenticationOutcome> {
    const how = this.reauthentication(id);
    if (how.method !== 'api-key') return { ok: false, stage: 'method', message: how.message };
    return this.storeKey(id, apiKey, true);
  }

  /** `replaceKey` and `reauthenticateWithKey`'s one path, with the refusing stage named. The key is never logged or echoed. */
  private async storeKey(id: string, apiKey: string, validate: boolean): Promise<ReauthenticationOutcome> {
    const method = this.method(id);
    if (method !== 'api-key') return { ok: false, stage: 'method', message: `${this.displayName(id)} does not sign in with an API key.` };
    // PD-PROVIDER-002: the settings' key field reaches here too, and a local-sdk provider takes no key.
    if (this.localSdk(id)) return { ok: false, stage: 'method', message: CLAUDE_CODE_NO_KEY };
    const key = headerValidKey(apiKey);
    if (!key.ok) return { ok: false, stage: 'key', message: key.error };
    if (key.value.length === 0) return { ok: false, stage: 'key', message: `A key is required for ${this.displayName(id)}.` };
    const previous = this.deps.credentials.load(id);
    const baseUrl = previous?.extra['api_base'] ?? this.snapshotRecord(id)?.base_url ?? null;
    const extra: Record<string, string> = { ...(previous?.extra ?? {}) };
    if (isInstanceId(id)) { extra['provider_family'] = 'openai-compatible'; if (baseUrl) extra['api_base'] = baseUrl; }
    let models: DiscoveredModel[] | null = null;
    if (validate) {
      const found = await this.runDiscovery(id, key.value, isInstanceId(id) ? baseUrl : null);
      if (!found.ok) { const m = `Validation failed for ${this.displayName(id)}: ${found.error.message.split(key.value).join('[redacted]')}`; this.recordError(id, m); return { ok: false, stage: 'validation', message: m }; }
      if (found.value.length === 0) { const m = `Validation failed for ${this.displayName(id)}: no models discovered.`; this.recordError(id, m); return { ok: false, stage: 'validation', message: m }; }
      models = found.value;
    }
    const saved = await this.deps.credentials.save(id, { access_token: key.value, refresh_token: '', expires_at: 0, account_id: null, extra });
    if (!saved.ok) return { ok: false, stage: 'storage', message: saved.error.headline };
    if (models) {
      const p = await this.persistModels(id, this.displayName(id), isInstanceId(id) ? 'openai-compatible' : null, isInstanceId(id) ? baseUrl : this.recordBase(id, previous), models);
      if (!p.ok) return { ok: false, stage: 'catalog', message: `The key for ${this.displayName(id)} was saved, but its discovered models could not be recorded: ${p.error.headline}` };
    }
    this.clearError(id);
    return { ok: true, message: models ? `Validated ${this.displayName(id)}; discovered ${countNoun(models.length, 'model')}.` : `Saved the key for ${this.displayName(id)}.` };
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
      return ok(`Validated ${this.displayName(id)} at ${base.value}; discovered ${countNoun(found.value.length, 'model')}.`);
    }
    const rec = this.snapshotRecord(id);
    if (!rec) return err(`${this.displayName(id)} is not configured.`);
    const w = await this.deps.settings.upsertProvider({ ...rec, base_url: base.value });
    return w.ok ? ok(`Saved the base URL for ${this.displayName(id)}.`) : err(w.error.headline);
  }

  /** REQ-PROVIDER-108/141: validate requires stored credentials; re-runs discovery; persists models. */
  async validate(id: string): Promise<Result<string, string>> {
    if (!this.deps.credentials.load(id)) return err(`${this.displayName(id)} is not authenticated.`);
    // REQ-PROVIDER-057: an expired credential is refreshed silently before it is used.
    const cred = await this.fresh(id);
    if (!cred) return err(`Validation failed for ${this.displayName(id)}: ${this.lastError(id) ?? 'Authentication required'}`);
    const found = await this.runDiscovery(id, cred.access_token, isInstanceId(id) ? cred.extra['api_base'] ?? null : null, this.displayName(id), cred);
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
    return ok(`Validated ${this.displayName(id)}; discovered ${countNoun(found.value.length, 'model')}.${p.value.preserved > 0 ? ` ${countNoun(p.value.preserved, 'previously known model')} preserved.` : ''}`);
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
    // PD-PROVIDER-002: a local-sdk provider is unavailable exactly when its executable is not on the search path
    // (REQ-CONFIG-371's disposition); connected, its health is what the tool says of its own sign-in — no catalog call.
    if (entry.ok && entry.value.connectionMode === 'local-sdk') {
      if (!this.localInstalled()) return { state: 'error', detail: CLAUDE_CODE_NOT_INSTALLED, available: false };
      if (this.status(id) !== 'authenticated') return { state: 'unauthenticated', detail: 'Not authenticated.', available: true };
      const problem = localToolProblem(await this.localState());
      return problem === null ? { state: 'healthy', detail: `${entry.value.displayName} is signed in on this computer.`, available: true } : { state: 'unauthenticated', detail: problem, available: true };
    }
    const method = this.method(id);
    if (method === null) return { state: 'unknown', detail: 'Authentication is managed by model configuration.', available: true };
    const status = this.status(id);
    if (status === 'unauthenticated') return { state: 'unauthenticated', detail: 'Not authenticated.', available: true };
    // REQ-PROVIDER-057: an expired credential that refreshes silently is not a reason to ask the user for anything.
    const cred = await this.fresh(id);
    if (!cred) return { state: 'unauthenticated', detail: 'Authentication expired; re-authentication required.', available: true };
    let found: Result<DiscoveredModel[], DiscoveryError>;
    try {
      found = await this.runDiscovery(id, cred.access_token, isInstanceId(id) ? cred.extra['api_base'] ?? null : null, this.displayName(id), cred);
    } catch (cause) {
      return { state: 'error', detail: String((cause as Error).message ?? cause), available: true };
    }
    if (!found.ok) {
      if (found.error.kind === 'auth') return { state: 'unauthenticated', detail: found.error.message, available: true };
      return { state: 'error', detail: found.error.message, available: true };
    }
    const p = await this.persistModels(id, this.displayName(id), isInstanceId(id) ? 'openai-compatible' : null, this.recordBase(id, cred), found.value);
    if (!p.ok) return { state: 'error', detail: p.error.headline, available: true };
    return { state: 'healthy', detail: `Validated ${this.displayName(id)}; discovered ${countNoun(found.value.length, 'model')}.`, available: true };
  }

  /** REQ-PROVIDER-140: the union of credential ids, catalogue ids and snapshot ids, each once, by id. */
  list(): ProviderRow[] {
    return this.allKnownIds().map((id) => {
      const entry = lookupProvider(id);
      const rec = this.snapshotRecord(id);
      const cred = this.deps.credentials.load(id);
      const method = this.method(id);
      const status = this.statusOf(id, cred);
      return {
        id, displayName: this.displayName(id), method, methodLabel: this.localSdk(id) ? CLAUDE_CODE_METHOD_LABEL : method ? METHOD_LABELS[method] : 'Authentication is managed by model configuration.',
        local: this.localSdk(id),
        authenticated: status === 'authenticated', status,
        maskedKey: cred && method === 'api-key' && !this.localSdk(id) && cred.access_token.length > 0 ? displayMask(cred.access_token) : null,
        baseUrl: cred?.extra['api_base'] ?? rec?.base_url ?? (entry.ok ? entry.value.baseUrl : null),
        modelCount: rec?.models.length ?? 0, userDefined: isInstanceId(id), available: entry.ok ? entry.value.available && (entry.value.connectionMode !== 'local-sdk' || this.localInstalled()) : true,
        lastError: this.lastError(id),
      };
    });
  }

  /** One refresh per provider at a time: a rotating refresh token spent twice is a credential lost. */
  private readonly renewing = new Map<string, Promise<Result<StoredCredential, string>>>();

  /** The provider's own non-interactive refresh (REQ-PROVIDER-027, 033, 044). A credential with no expiry has nothing to refresh. */
  private async refreshCredential(id: string, cred: StoredCredential): Promise<Result<StoredCredential, string>> {
    const flow = { fetch: this.flowFetch() };
    if (id === 'codex') return refreshCodex(flow, cred, () => this.nowSeconds());
    if (id === 'copilot') return refreshCopilot(flow, cred);
    if (this.localSdk(id)) return ok(cred);
    if (cred.expires_at === 0) return ok(cred);
    return err('Authentication expired; re-authentication required.');
  }

  /**
   * REQ-PROVIDER-058: the unconditional renew — the stored credential refreshed even while still valid, persisted, and
   * returned; when the provider cannot refresh without the user, nothing is returned and the reason is the last error.
   */
  async renew(id: string): Promise<StoredCredential | null> {
    let pending = this.renewing.get(id);
    if (!pending) {
      pending = (async (): Promise<Result<StoredCredential, string>> => {
        const cred = this.deps.credentials.load(id);
        if (!cred) return err('Authentication required');
        const renewed = await this.refreshCredential(id, cred);
        if (!renewed.ok) return renewed;
        if (renewed.value !== cred) {
          const saved = await this.deps.credentials.save(id, renewed.value);
          if (!saved.ok) return err(failureText(saved.error));
        }
        return renewed;
      })().finally(() => { this.renewing.delete(id); });
      this.renewing.set(id, pending);
    }
    const r = await pending;
    if (!r.ok) { this.recordError(id, r.error); return null; }
    this.clearError(id);
    return r.value;
  }

  /**
   * REQ-PROVIDER-057 without an interaction callback: the stored credential when it is usable, a silently refreshed one
   * when it had expired, and nothing — with "Authentication required" as the last error — when neither.
   */
  private async fresh(id: string): Promise<StoredCredential | null> {
    const cred = this.deps.credentials.load(id);
    const status = this.statusOf(id, cred);
    if (status === 'authenticated' && cred) return cred;
    if (status === 'expired') {
      const renewed = await this.renew(id);
      if (renewed) return renewed;
      this.deps.log(`Token refresh failed for ${id}, re-authenticating`);
    }
    this.recordError(id, 'Authentication required');
    return null;
  }

  /** The headers a provider's model API needs on every request, beside the bearer (REQ-PROVIDER-070, 076). Not credentials. */
  private requestHeaders(id: string, cred: StoredCredential): Readonly<Record<string, string>> | null {
    if (id === 'copilot') return COPILOT_API_HEADERS;
    if (id === 'codex') return { originator: CODEX_ORIGINATOR, 'OpenAI-Beta': 'responses=experimental', ...(cred.account_id ? { 'chatgpt-account-id': cred.account_id } : {}) };
    return null;
  }

  /**
   * ADR-0030 / REQ-PROVIDER-057/067: the bearers leased to a run, resolved from the store and the clock. A credential
   * that has expired, or will within the refresh margin, is renewed unconditionally rather than handed back nearly
   * spent; an unresolved provider is reported once with its reason and never fails the run here (the run host decides
   * what an unresolved entry model means). The run host asks again while its run lasts (REQ-PROVIDER-068), which is
   * the same pass: nothing with no expiry is renewed by it.
   */
  async lease(ids: readonly string[]): Promise<{ bearers: Record<string, string>; headers: Record<string, Readonly<Record<string, string>>>; renewable: string[]; report: PrimingReport }> {
    const bearers: Record<string, string> = {};
    const headers: Record<string, Readonly<Record<string, string>>> = {};
    const authenticated: string[] = [];
    const renewed: string[] = [];
    /** The leased credentials that carry an expiry: what REQ-PROVIDER-068's keep-fresh check asks about again. */
    const renewable: string[] = [];
    const unresolved: Record<string, string> = {};
    for (const id of new Set(ids)) {
      let cred = this.deps.credentials.load(id);
      const status = this.statusOf(id, cred);
      if (status === 'unauthenticated' || !cred) { unresolved[id] = 'Authentication required'; this.recordError(id, 'Authentication required'); continue; }
      const expiring = cred.expires_at > 0 && cred.expires_at - this.nowSeconds() <= REFRESH_MARGIN_S;
      if (status === 'expired' || expiring) {
        const next = await this.renew(id);
        if (next) { cred = next; renewed.push(id); }
        else if (status === 'expired') { unresolved[id] = this.lastError(id) ?? 'Authentication expired; re-authentication required.'; this.deps.warn(`${this.displayName(id)} could not be renewed: ${unresolved[id]}`); continue; }
        else { this.deps.warn(`${this.displayName(id)} is close to expiry and could not be renewed: ${this.lastError(id) ?? 'unknown reason'}`); authenticated.push(id); }
      } else { authenticated.push(id); this.clearError(id); }
      bearers[id] = cred.access_token;
      if (cred.expires_at > 0) renewable.push(id);
      const extra = this.requestHeaders(id, cred);
      if (extra) headers[id] = extra;
    }
    return { bearers, headers, renewable, report: { authenticated, renewed, unresolved, ok: Object.keys(unresolved).length === 0 } };
  }

  /**
   * PD-PROVIDER-002 — connecting the local tool: it is asked whether it is signed in with a subscription, and when it
   * is, the marker is stored and the static catalogue recorded. Nothing of the tool's sign-in is read or kept.
   */
  private async connectLocalTool(id: string, name: string): Promise<SignInOutcome> {
    const state = await this.localState();
    const problem = localToolProblem(state);
    if (problem !== null) { this.recordError(id, problem); return { outcome: 'failed', message: problem }; }
    const saved = await this.deps.credentials.save(id, { access_token: CLAUDE_CODE_MARKER, refresh_token: '', expires_at: 0, account_id: null, extra: { connection: 'local-tool', ...(state.plan ? { plan: state.plan } : {}) } });
    if (!saved.ok) { const message = failureText(saved.error); this.recordError(id, message); return { outcome: 'failed', message }; }
    const models = claudeCodeModels();
    const persisted = await this.persistModels(id, name, null, null, models);
    if (!persisted.ok) { await this.deps.credentials.delete(id); const message = `Could not save provider ${id}: ${failureText(persisted.error)}`; this.recordError(id, message); return { outcome: 'failed', message }; }
    this.clearError(id);
    const message = `Login complete for ${name}; discovered ${countNoun(models.length, 'model')}.`;
    this.deps.log(message);
    return { outcome: 'signed-in', id, displayName: name, discovered: models.length, message, keyValidated: true };
  }

  /**
   * REQ-PROVIDER-096/097/099 — the interactive sign-in of a device-code or browser provider: status; a requested
   * re-authentication discards the stored authentication first; an authentication already stored is used as it is;
   * otherwise the provider's own flow runs with the prompt callback. The credential is stored BEFORE discovery, and
   * every discovery outcome leaves it in place (097); a refused catalog read discards it, codex excepted (098).
   */
  async signInInteractive(id: string, opts: InteractiveSignInOptions): Promise<SignInOutcome> {
    const entry = lookupProvider(id);
    if (!entry.ok) return { outcome: 'failed', message: `${entry.error.headline}. ${entry.error.detail ?? ''}`.trim() };
    const name = entry.value.displayName;
    if (!entry.value.available) return { outcome: 'failed', message: entry.value.unavailabilityReason ?? 'This provider is not available.' };
    if (entry.value.connectionMode === 'local-sdk') return this.connectLocalTool(id, name);
    if (entry.value.signInMethod === 'api-key') return { outcome: 'failed', message: `${name} signs in with "${METHOD_LABELS['api-key']}".` };
    if (opts.reauthenticate && this.deps.credentials.exists(id)) {
      await this.deps.credentials.delete(id);
      this.deps.log(`Discarded stored authentication for ${name}.`);
    }
    let cred = opts.reauthenticate ? null : await this.fresh(id);
    if (cred) this.deps.log(`Using the stored authentication for ${name}.`);
    else {
      const flow: FlowDeps = { fetch: this.flowFetch(), timers: this.deps.timers, prompt: opts.prompt, warn: this.deps.warn, ...(opts.signal ? { signal: opts.signal } : {}) };
      const authenticated = id === 'codex' ? await authenticateCodex(flow, () => this.nowSeconds()) : id === 'copilot' ? await authenticateCopilot(flow) : err(`${name} signs in with "${METHOD_LABELS[entry.value.signInMethod]}", which this build does not provide yet.`);
      if (!authenticated.ok) {
        if (authenticated.error === CANCELLED_BY_USER || opts.signal?.aborted) return { outcome: 'cancelled' };
        this.recordError(id, authenticated.error);
        return { outcome: 'failed', message: authenticated.error };
      }
      const saved = await this.deps.credentials.save(id, authenticated.value);
      if (!saved.ok) { const message = failureText(saved.error); this.recordError(id, message); return { outcome: 'failed', message }; }
      cred = authenticated.value;
    }
    const found = await this.runDiscovery(id, cred.access_token, null, name, cred);
    if (!found.ok) {
      this.recordError(id, found.error.message);
      if (found.error.kind === 'auth' && id !== 'codex') { await this.deps.credentials.delete(id); this.deps.log(`Discarded stored authentication for ${name}.`); }
      return { outcome: 'failed', message: `${name}: ${found.error.message}` };
    }
    if (found.value.length === 0 && !opts.allowEmpty) return { outcome: 'no-models', id, message: 'no models discovered.' };
    const persisted = await this.persistModels(id, name, null, this.recordBase(id, cred), found.value);
    if (!persisted.ok) { const message = `Could not save provider ${id}: ${failureText(persisted.error)}`; this.recordError(id, message); return { outcome: 'failed', message }; }
    this.clearError(id);
    const message = `Login complete for ${name}; discovered ${countNoun(found.value.length, 'model')}.`;
    this.deps.log(message);
    return { outcome: 'signed-in', id, displayName: name, discovered: found.value.length, message, keyValidated: true };
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
export function failureText(f: Failure): string { return f.detail ? `${f.headline} (${f.detail})` : f.headline; }
export { failure };
