import { readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import type { Clocks, Result } from '@rotaris/kernel';
import { countNoun, err, ok } from '@rotaris/kernel';
import { declaredToolsOf, isDelegationTarget, NOT_DELEGATION_TARGETS, resolvePreset, SANDBOX_MODE_NAMES, type HeadlessPolicy, type ModelTier, type SandboxModeName } from '@rotaris/contracts';
import { compressionTrigger, effectivePricing, isPlainMap, modelCapInForce, launchConfigurationSnapshot, loadConfiguration, overlayLiveState, PROJECT_SETTINGS_FILE, readProjectSnapshot, renderFatal, syntheticOriginOf, type BuiltinLaunch, type LiveState, type LoadedConfiguration, type ModelEntry, type ProjectSnapshot } from '@rotaris/config';
import { renderUnavailability, type AvailabilityVerdict, type PolicyRead } from '@rotaris/agent-tools';
import { BUILT_IN_PERSONAS, parseLogLevel, resolveRole, RUN_CONFIG_DEFAULTS, TIER_ROLES, type CatalogueEntry, type ClassifierSlots, type HelperModel, type ModelChoice, type ModelLookup, type ModelSetup, type Persona, type PersonaResolver, type ResolvedTrigger, type RoleName, type RunSetup, type RuntimePosture, type TierRole } from '@rotaris/engine';
import { AiSdkModelClient, DefaultAgentBackend, type AgentBackend, type ModelClient, type ModelRef, type ThinkingLevel } from '@rotaris/model';

/**
 * ADR-0036 / ADR-0037 at the run-host root: one load per run start (Tier B — the files, then the live
 * state main holds, then the loader's own passes), turned into what the engine takes — the model setup,
 * the runtime posture, the persona resolver. Nothing here is read from the environment any more except
 * the one stopgap the map names: the dialect switch (`…_MODEL_DIALECT=scripted`, verification only), which `scriptedDialect`
 * reads behind `__ROTARIS_SEAMS__`, so a packaged build carries neither the read nor the name.
 *
 * Credentials: a model naming an `auth_provider` (REQ-CONFIG-083, REQ-PROVIDER-092) authenticates with the
 * bearer main LEASED to this run for that provider (ADR-0030; `session.start` asks `credentials.lease` for the
 * providers `authProvidersOf` names, REQ-PROVIDER-066); a model naming none uses its `api_key` or
 * `api_key_env`, resolved per request. Since Part L every call resolves the credential OF THE MODEL IT GOES TO
 * (`credentialFor`, keyed by what a `ModelRef` carries): the classifier's slot, the loop classifier's model, the
 * summariser's `default_summary_model` (REQ-CONFIG-065) and a child persona's own model each carry their own
 * bearer or key. (Until then every call of a run authenticated with the entry model's resolver — a second
 * provider on `small_model` got the wrong bearer; ADR-0030's note.) The entry role's model TIER (REQ-ORCH-023)
 * is the slot alias its model resolved through (`resolved_persona_model_tiers`), no longer an environment
 * variable.
 */
export const PROVIDER_BASE_URLS: Readonly<Record<string, string>> = Object.freeze({
  openai: 'https://api.openai.com/v1',
});
export const SCRIPTED_PROVIDER = 'scripted';

/**
 * OQ-312 (ruled 2026-10-14 under R-072, no directive): whether a `models:` entry's provider is answered by the scripted client.
 * Only in a build with the verification seams: with `__ROTARIS_SEAMS__` false (a packaged build) a `scripted` entry with no
 * `base_url` is a provider this build knows no endpoint for, refused as any other (REQ-EVENTS-021/019), and one with a
 * `base_url` is an OpenAI-compatible provider name authenticated as configured (REQ-CONFIG-082, ADR-0029/0030). Until the
 * ruling's build the provider was tested bare, and a shipped build answered it with the scripted client and no credential
 * (docs/defects/fixed/a-packaged-build-answers-a-scripted-provider-entry-with-the-scripted-client.md).
 */
export function isScriptedProvider(provider: string): boolean {
  return __ROTARIS_SEAMS__ && provider === SCRIPTED_PROVIDER;
}

export interface RuntimeFromConfiguration extends RuntimePosture {
  readonly approvalTimeoutMs: number;
  readonly headlessPolicy: HeadlessPolicy;
  readonly allowOutsideWorkspace: boolean;
  readonly additionalReadOnlyRoots: readonly string[];
  /** REQ-CONFIG-116: `runtime.shell_command_timeout`, seconds. */
  readonly shellCommandTimeoutS: number;
  /** REQ-ORCH-025: `single` | `swarm` | null, from `rotaris.delegation_strategy`. */
  readonly runOverride: 'single' | 'swarm' | null;
  readonly retentionCap: number;
  readonly iterationLimit: number;
  readonly consecutiveRetryLimit: number;
  readonly transientRetries: number;
  /** REQ-ORCH-092: `auto_retries_validation`. */
  readonly validationRetries: number;
  readonly modelTimeoutS: number;
  /** REQ-CONFIG-114: `llm_response_timeout`, floored at 30 s here whatever the file says. */
  readonly llmResponseTimeoutS: number;
  readonly loopClassificationTimeoutS: number;
  /**
   * ADR-0022: what the terminal enforcement point needs to render this run's confinement afresh for
   * each call (REQ-SANDBOX-093) — the mode in force (the layered key with the launch dialog's
   * override already folded in, REQ-SANDBOX-122), the configured additional writable roots
   * (REQ-SANDBOX-050/058), the network opt-in (REQ-SANDBOX-051/059), and the verdict that governed
   * whether this run was allowed to start at all (REQ-SANDBOX-094).
   */
  readonly confinement: {
    readonly mode: SandboxModeName;
    readonly writableRoots: readonly string[];
    readonly allowNetwork: boolean;
    readonly verdict: AvailabilityVerdict | null;
  };
}

export function runtimeFromConfiguration(cfg: LoadedConfiguration, verdict: AvailabilityVerdict | null = null, sharedQuotaCaps: Readonly<Record<string, number>> = {}): RuntimeFromConfiguration {
  const r = cfg.runtime;
  return {
    permissionMode: resolvePreset(r.permission_mode).preset,
    allowUnsandboxedAutonomous: r.allow_unsandboxed_autonomous,
    /*
     * ADR-0022 / REQ-SANDBOX-093: the pair the run records. `requested` is the selection;
     * `available` is the probe's VERDICT, never the selection restated. REQ-SANDBOX-098: the input
     * to permission-mode resolution requires both, and selection alone must never count as present
     * — treating it as present would remove the tightening while commands executed unconfined.
     * A run that asked for confinement this host cannot deliver never reaches here at all: the gate
     * in `prepareRun` refuses it before the session exists (REQ-SANDBOX-095). A retrospective's setup,
     * which meets no gate (`PrepareOptions.retrospective`), does reach here with `requested` true and
     * `available` false where the verdict is unsettled or unavailable — and still no run: that setup
     * is never cached into `configured` nor handed to a run, so no run records this pair from it
     * (REQ-SANDBOX-094).
     */
    sandbox: { requested: r.sandbox_mode !== 'off', available: verdict?.available ?? false, backend: verdict?.available === true ? verdict.backend : '' },
    confinement: { mode: r.sandbox_mode, writableRoots: r.sandbox_writable_roots, allowNetwork: r.sandbox_allow_network, verdict },
    sessionLogLevel: parseLogLevel(r.session_log_level).level,
    modelConcurrencyCap: null,
    // REQ-CONFIG-094 under PD-PROVIDER-001: the entry's stated cap, else its provider's declared one (`modelCapInForce`).
    modelCapFor: (modelKey) => modelCapInForce(cfg.models[modelKey], sharedQuotaCaps),
    childBudget: { maxDepth: r.max_depth, maxTotal: r.max_children, maxActive: r.max_active_children },
    drainTimeoutMs: Math.round(r.shutdown_drain_timeout * 1000),
    approvalTimeoutMs: Math.round(r.approval_timeout_seconds * 1000),
    headlessPolicy: r.headless_approval_policy,
    allowOutsideWorkspace: r.allow_outside_workspace,
    additionalReadOnlyRoots: r.additional_read_only_roots,
    shellCommandTimeoutS: r.shell_command_timeout,
    runOverride: cfg.delegationStrategy === 'single' ? 'single' : cfg.delegationStrategy === 'swarm' ? 'swarm' : null,
    retentionCap: r.event_retention_per_session,
    messageLimit: r.message_limit,
    iterationLimit: r.max_iterations,
    consecutiveRetryLimit: r.task_consecutive_retry_limit,
    transientRetries: r.auto_retries_transient,
    validationRetries: r.auto_retries_validation,
    modelTimeoutS: r.model_timeout,
    llmResponseTimeoutS: Math.max(30, r.llm_response_timeout),
    loopClassificationTimeoutS: r.loop_classification_timeout,
    // REQ-ORCH-088: `runtime.child_timeout` reaches the run (it was read by the loader and never handed over before Part Q).
    childTimeoutMs: Math.round(r.child_timeout * 1000),
    // PD-ORCH-004: `runtime.child_stall_timeout` reaches the run as the window of the progress rule — the first reader
    // of a key the loader validated from the start.
    childStallTimeoutMs: Math.round(r.child_stall_timeout * 1000),
    // REQ-ORCH-134 / PD-ORCH-005 clause 2: `runtime.graceful_pause_tool_deadline` reaches the run as the pause's tool
    // deadline — the first reader of a key the loader validated from the start.
    pauseToolDeadlineMs: Math.round(r.graceful_pause_tool_deadline * 1000),
    // REQ-ORCH-152 / REQ-CONFIG-476: the run-start mode reaches the run. The loader validated the key from Part I
    // and nothing read it until the plan gate was built (ADR-0062).
    runStartMode: r.run_start_mode,
  };
}

/** What one `fetch` call reads, with the cost of the read for the log. */
export type EgressRead = PolicyRead & { readonly loadMs: number };

/**
 * REQ-SANDBOX-038 / REQ-SANDBOX-118 / REQ-TOOLS-089: the egress policy the `fetch` tool enforces is read from
 * the owning run's CURRENT SAVED configuration at each call — the files and the discovery snapshot only, never
 * the live state main holds for the settings surface (an unsaved edit reaches nothing). A saved edit to the host
 * lists therefore takes effect on the next fetch with no restart, and two runs in one process each read their own
 * workspace's lists. A fatal load refuses the call (fail closed, REQ-SANDBOX-032). The cost is a YAML parse of
 * two files plus the snapshot per call; a fetch is network-bound, so that is acceptable and it is logged.
 */
export function egressReader(globalDir: string, workspaceRoot: string, clocks: Clocks): () => Promise<EgressRead> {
  return async () => {
    const started = clocks.monotonic.now();
    const loaded = loadConfiguration({ globalDir, workspaceRoot, keepIgnored: false, now: () => clocks.monotonic.now() });
    const loadMs = clocks.monotonic.now() - started;
    if (!loaded.ok) return { ok: false, reason: renderFatal(loaded.error), loadMs };
    const r = loaded.value.runtime;
    return {
      ok: true, loadMs,
      policy: { denied: r.network_denied_hosts, allowed: r.network_allowed_hosts, defaultDisposition: r.network_egress_policy },
      toolCallTimeoutS: r.tool_call_timeout,
    };
  };
}

export function thinkingOf(entry: Pick<ModelEntry, 'thinking'> | null | undefined): ThinkingLevel {
  const t = entry?.thinking;
  return t === null || t === undefined || t === 'auto' ? 'unset' : t;
}

/**
 * A `models:` entry as the model port's reference; null when the entry is absent or has no reachable endpoint. Under
 * the scripted dialect the reference keeps the entry's own provider family (Part Q: two scripted providers must stay
 * distinct for REQ-NOTIFY-082's candidate rule); the scripted client answers for every family regardless. An entry naming the
 * `scripted` provider is the scripted client's only where the seams are compiled in (`isScriptedProvider`, OQ-312).
 */
export function modelRefOf(cfg: LoadedConfiguration, name: string | null, scripted: boolean): ModelRef | null {
  if (name === null) return null;
  const entry = cfg.models[name];
  if (!entry) return null;
  if (scripted || isScriptedProvider(entry.provider)) return { providerId: entry.provider === '' ? SCRIPTED_PROVIDER : entry.provider, modelId: entry.model_id, dialect: 'chat', acceptsImageInput: entry.accepts_image_input };
  const baseUrl = entry.base_url ?? PROVIDER_BASE_URLS[entry.provider];
  if (!baseUrl) return null;
  const dialect = entry.api_mode === 'responses' && !entry.disable_responses_api ? 'responses' : 'chat';
  return { providerId: entry.provider, modelId: entry.model_id, dialect, baseUrl, acceptsImageInput: entry.accepts_image_input };
}

/** REQ-CONFIG-083 / REQ-PROVIDER-092: an `auth_provider` reads the leased bearer; otherwise `api_key` outranks `api_key_env`. Read per request. */
export function credentialResolver(entry: ModelEntry | undefined, env: Readonly<Record<string, string | undefined>>, bearers: () => Readonly<Record<string, string>> = () => ({})): () => Promise<string> {
  return async () => {
    if (entry?.auth_provider) return bearers()[entry.auth_provider] ?? '';
    return entry?.api_key ?? (entry?.api_key_env ? env[entry.api_key_env] ?? '' : '');
  };
}

/** What a `ModelRef` carries, as the key a credential is looked up by: two entries alike in all three share one. */
export function credentialKey(ref: ModelRef): string {
  return `${ref.providerId}|${ref.baseUrl ?? ''}|${ref.modelId}`;
}

/**
 * ADR-0030 per model: one resolver per `models:` entry, found by the reference a call carries; a reference no
 * entry produced (a scripted stand-in, a mid-run switch to an unknown key) falls back to the entry model's
 * resolver with a warning, so no call goes out with no credential at all.
 */
export function credentialFactory(cfg: LoadedConfiguration, scripted: boolean, env: Readonly<Record<string, string | undefined>>, bearers: () => Readonly<Record<string, string>>, entry: () => Promise<string>, warn: (m: string) => void): (model: ModelRef) => () => Promise<string> {
  const byKey = new Map<string, () => Promise<string>>();
  for (const [name, e] of Object.entries(cfg.models)) {
    const ref = modelRefOf(cfg, name, scripted);
    if (!ref) continue;
    const key = credentialKey(ref);
    if (!byKey.has(key)) byKey.set(key, isScriptedProvider(ref.providerId) ? async () => '' : credentialResolver(e, env, bearers));
  }
  const warned = new Set<string>();
  return (model) => {
    const found = byKey.get(credentialKey(model));
    if (found) return found;
    if (isScriptedProvider(model.providerId)) return async () => '';
    if (!warned.has(credentialKey(model))) { warned.add(credentialKey(model)); warn(`credentials: no models: entry produced ${model.providerId}/${model.modelId}; the entry model's credential is used for it`); }
    return entry;
  };
}

/** REQ-PROVIDER-066: the sign-in providers behind every configured model, each once, sorted. */
export function authProvidersOf(cfg: LoadedConfiguration): string[] {
  return [...new Set(Object.values(cfg.models).map((m) => m.auth_provider).filter((p): p is string => typeof p === 'string' && p.length > 0))].sort();
}

/** REQ-ORCH-023 / ADR-0028: the entry role's tier is the slot its model resolved through; none → undetermined. */
export function entryTierOf(cfg: LoadedConfiguration): ModelTier | null {
  const alias = cfg.resolvedPersonaModelTiers[cfg.defaultPersona];
  return alias === 'small_model' ? 'small' : alias === 'medium_model' ? 'medium' : alias === 'large_model' ? 'large' : null;
}

/** Decision 3 of the plan: `personas:` overlaid on the built-in table — stated fields win, the prompt is the file's when it supplies one. */
export function personaResolverFor(cfg: LoadedConfiguration, scripted: boolean, warn: (m: string) => void): PersonaResolver {
  const stated = (role: string, field: string): boolean => {
    const personas = cfg.merged['personas'];
    const entry = personas && typeof personas === 'object' ? (personas as Record<string, unknown>)[role] : undefined;
    return entry !== null && typeof entry === 'object' && Object.prototype.hasOwnProperty.call(entry, field);
  };
  const cache = new Map<string, Persona | null>();
  const build = (role: string): Persona | null => {
    const entry = cfg.personas[role];
    const base = BUILT_IN_PERSONAS[role as RoleName];
    if (!entry && !base) return null;
    let prompt = base?.systemPrompt ?? '';
    if (entry?.system_prompt) prompt = entry.system_prompt;
    else if (entry?.system_prompt_file) {
      const file = isAbsolute(entry.system_prompt_file) ? entry.system_prompt_file : join(cfg.workspaceRoot, entry.system_prompt_file);
      try { prompt = readFileSync(file, 'utf8'); } catch (cause) { warn(`persona ${role}: system_prompt_file ${file} could not be read (${String(cause)}); the built-in prompt stands`); }
    }
    // REQ-TOOLS-002: the file's `tools:` when it states any, else the built-in role's — the rule the snapshot's role view reads too.
    const tools = declaredToolsOf(role, entry?.tools ?? []);
    const modelRef = entry ? modelRefOf(cfg, entry.model, scripted) : null;
    // REQ-CONFIG-110 / REQ-ORCH-144: the role's own fallback_model (already tier-substituted, REQ-CONFIG-073); a name no entry
    // resolves is a referential warning the loader already raised, and the role then falls back through the run-level slot.
    const fallbackRef = entry?.fallback_model ? modelRefOf(cfg, entry.fallback_model, scripted) : null;
    const persona: Persona = {
      name: role,
      tools,
      coordinatorOnly: stated(role, 'coordinator_only') ? entry!.coordinator_only : base?.coordinatorOnly ?? false,
      readOnly: stated(role, 'read_only') ? entry!.read_only : base?.readOnly ?? false,
      // REQ-CONFIG-106 (OQ-212, R-072): the flag the loader read and nothing carried until the repair of
      // can-publish-artifacts-is-read-and-never-gates-artifact-write.md; the tool port grants `artifact_write` by it.
      canPublishArtifacts: stated(role, 'can_publish_artifacts') ? entry!.can_publish_artifacts : base?.canPublishArtifacts ?? false,
      systemPrompt: prompt,
      implementer: tools.some((t) => ['write_file', 'haet_edit', 'haet', 'terminal'].includes(t)),
      // REQ-CONFIG-094 (live-run finding D5): the `models:` key beside the reference, a synthetic copy (REQ-CONFIG-081)
      // mapped to the entry the loader recorded it was copied from — the key a child of this role is recorded and capped under.
      ...(modelRef && entry ? { modelRef, modelKey: syntheticOriginOf(entry.model, cfg.syntheticOrigins), thinking: thinkingOf(cfg.models[entry.model]) } : {}),
      ...(fallbackRef && entry?.fallback_model ? { fallbackModel: fallbackRef, fallbackThinking: thinkingOf(cfg.models[entry.fallback_model]) } : {}),
      // REQ-CONFIG-109 / REQ-TOOLS-048: the role's `permission_mode` pin, parsed by the loader and read at agent
      // construction and at every mid-session change (REQ-TOOLS-074). Absent means the role takes the session's mode.
      ...(entry?.permission_mode ? { permissionMode: entry.permission_mode } : {}),
      // REQ-CONFIG-108: the role's `stall_timeout` substitutes for `runtime.child_stall_timeout` on its children
      // (PD-ORCH-004's progress rule is its reader); null or absent means the run's value.
      ...(typeof entry?.stall_timeout === 'number' ? { stallTimeoutMs: Math.round(entry.stall_timeout * 1000) } : {}),
      // REQ-CONFIG-107 / REQ-TOOLS-152: the role's `skip_auto_sibling_context` forces the omission `suppress_auto_context`
      // asks for; the engine reads it at each assembly of a child's payload. False or absent gives the index.
      ...(entry?.skip_auto_sibling_context === true ? { skipAutoSiblingContext: true } : {}),
      // REQ-CONFIG-103 / REQ-TOOLS-006 (4): the role's `tool_restrictions`, its keys already canonical (REQ-CONFIG-062). The
      // tool port and the write-scope refusal read it through `toolRestrictionsFor` (OQ-145); until acceptance finding A4
      // (R-067) the loader parsed it and nothing carried it here, so it narrowed no grant.
      ...(entry?.tool_restrictions ? { toolRestrictions: entry.tool_restrictions } : {}),
      // REQ-CONFIG-101 as OQ-229 reads it (R-072): a `delegates_to` that names any persona narrows the role's delegation targets;
      // an empty one narrows nothing. Until OQ-229's build the loader validated the list and nothing carried it here.
      ...(entry && entry.delegates_to.length > 0 ? { delegatesTo: entry.delegates_to } : {}),
    };
    return persona;
  };
  /*
   * OQ-229 (ruled 2026-10-07 under R-072): at run setup, once per run, each configured list whose effect a person could misread
   * is logged — an entry naming a persona the product runs itself, which permits nothing (OQ-228); a list on a persona whose
   * declared tools hold no `delegate`, which has no effect; a list that leaves its persona no delegation target; and an
   * explicitly stated empty list on a persona that holds `delegate`, which narrows nothing. The loader's referential and cycle
   * messages (REQ-CONFIG-231/232) are unchanged.
   */
  for (const role of Object.keys(cfg.personas)) {
    const entry = cfg.personas[role]!;
    const tools = declaredToolsOf(role, entry.tools ?? []);
    const list = entry.delegates_to;
    for (const target of list) if (!isDelegationTarget(target)) warn(`persona ${role}: delegates_to names '${target}', a persona the product runs itself (${NOT_DELEGATION_TARGETS[target]}), which is not a delegation target; the entry permits nothing (OQ-228, OQ-229)`);
    if (list.length > 0 && !tools.includes('delegate')) warn(`persona ${role}: delegates_to has no effect, since its tools hold no delegate (REQ-CONFIG-101, OQ-229)`);
    else if (list.length > 0 && !list.some((t) => isDelegationTarget(t) && Object.prototype.hasOwnProperty.call(cfg.personas, t))) warn(`persona ${role}: delegates_to (${list.join(', ')}) leaves it no delegation target, so every delegation it makes is refused (REQ-CONFIG-101, OQ-229)`);
    if (list.length === 0 && stated(role, 'delegates_to') && tools.includes('delegate')) warn(`persona ${role}: delegates_to is stated empty, which narrows nothing; leave delegate out of its tools to stop it delegating (REQ-CONFIG-101, OQ-229)`);
  }
  return {
    resolve: (name) => {
      const direct = cache.has(name) ? cache.get(name)! : (cache.set(name, build(name)), cache.get(name)!);
      if (direct) return { persona: direct, alias: null };
      const alias = resolveRole(name);
      if (!alias) return null;
      const target = cache.has(alias.persona.name) ? cache.get(alias.persona.name)! : (cache.set(alias.persona.name, build(alias.persona.name)), cache.get(alias.persona.name)!);
      return target ? { persona: target, alias: name } : null;
    },
    // OQ-228 (R-072): the delegation targets, every configured persona but the three the specification reserves. It was
    // `knownRoles: () => Object.keys(cfg.personas)`, which offered `intent-classifier` to every coordinator (finding P5).
    delegationTargets: () => Object.keys(cfg.personas).filter(isDelegationTarget),
  };
}

/**
 * REQ-ORCH-005's slots from the configuration: the three the classifier ladder may use. A slot whose model
 * names an `auth_provider` main could not lease is dropped with a warning, so REQ-ORCH-009's order consults
 * the next slot instead of sending a request that will be refused (`leased` is the map main answered; absent
 * means no lease was asked, as in tests and the scripted dialect).
 */
export function classifierSlotsOf(cfg: LoadedConfiguration, scripted: boolean, leased?: Readonly<Record<string, string>>, warn: (m: string) => void = () => undefined): ClassifierSlots {
  const slot = (name: string | null, label: string): ModelRef | null => {
    const ref = modelRefOf(cfg, name, scripted);
    if (!ref || !leased || name === null || scripted) return ref;
    const provider = cfg.models[name]?.auth_provider;
    if (provider && !leased[provider]) { warn(`${label} names ${name}, whose provider ${provider} is not authenticated; the slot is skipped for this run (REQ-ORCH-009)`); return null; }
    return ref;
  };
  return {
    small: slot(cfg.slots.small_model, 'small_model'),
    fallback: slot(cfg.slots.fallback_model, 'fallback_model'),
    summary: slot(cfg.slots.default_summary_model, 'default_summary_model'),
  };
}

/** REQ-ORCH-145 / REQ-CONFIG-086: the entry's own timeout and retry count, when stated, as the choice carries them. */
function settingsOf(entry: ModelEntry | undefined): Pick<ModelChoice, 'timeoutMs' | 'retries'> {
  return {
    ...(entry?.timeout === null || entry?.timeout === undefined ? {} : { timeoutMs: Math.round(entry.timeout * 1000) }),
    ...(entry?.num_retries === null || entry?.num_retries === undefined ? {} : { retries: entry.num_retries }),
  };
}

/** The keys the two scopes' files state under `models:` — everything else in `cfg.models` came from the discovery snapshot. */
function configuredModelKeys(cfg: LoadedConfiguration): Set<string> {
  const keys = new Set<string>();
  for (const scope of ['global', 'workspace'] as const) {
    for (const doc of [cfg.raw[scope].agents, cfg.raw[scope].models]) {
      const models = doc?.['models'];
      if (isPlainMap(models)) for (const k of Object.keys(models)) keys.add(k);
    }
  }
  return keys;
}

/**
 * Part Q / REQ-NOTIFY-082: every `models:` entry as the same-tier rule sees it. The provider identity is the sign-in
 * provider when the entry names one, else its family. A recorded role is a tier slot naming the model — the three
 * configured slots for a configured model, each authenticated provider's own picks in the snapshot for a discovered
 * one (the loader folds only the first provider's picks into the slots, so the per-provider roles are read from the
 * snapshot itself). A discovered model whose provider was not leased is present but unusable.
 */
export function catalogueOf(cfg: LoadedConfiguration, scripted: boolean, leased: Readonly<Record<string, string>> | undefined, snapshot: ProjectSnapshot | null): CatalogueEntry[] {
  const configured = configuredModelKeys(cfg);
  const roles = new Map<string, Set<TierRole>>();
  const add = (key: string, role: TierRole) => { const set = roles.get(key) ?? new Set<TierRole>(); set.add(role); roles.set(key, set); };
  for (const tier of TIER_ROLES) { const v = cfg.slots[tier]; if (v && cfg.models[v]) add(v, tier); }
  if (snapshot) {
    for (const rec of Object.values(snapshot.providers)) {
      if (!rec.authenticated) continue;
      for (const tier of TIER_ROLES) { const v = rec[tier]; if (typeof v === 'string' && cfg.models[v]) add(v, tier); }
    }
  }
  // Discovered = folded from the snapshot; everything else (the files' entries and the built-in defaults) is configured.
  const discovered = new Set<string>(snapshot ? Object.values(snapshot.providers).flatMap((rec) => (rec.authenticated ? rec.models.map((m) => m.id) : [])) : []);
  const out: CatalogueEntry[] = [];
  for (const [key, e] of Object.entries(cfg.models)) {
    const ref = modelRefOf(cfg, key, scripted);
    if (!ref) continue;
    const usable = scripted || !e.auth_provider || !leased || Boolean(leased[e.auth_provider]);
    // PD-MONITOR-001 revision 2 / REQ-CONFIG-088: the entry's prices ride with it, so the ladder prices a request at
    // the rates of the model it was sent to; absent unless both are set.
    const pricing = effectivePricing(e);
    out.push({ key, provider: e.auth_provider ?? e.provider, model: ref, thinking: thinkingOf(e), roles: [...(roles.get(key) ?? [])], origin: discovered.has(key) && !configured.has(key) ? 'discovered' : 'configured', usable, ...settingsOf(e), ...(pricing ? { pricing } : {}) });
  }
  return out;
}

/**
 * Part AH (ADR-0060) — REQ-MONITOR-080: the compressing model when `compressor.model` names one this run can
 * reach; null means the agent's own model, which is reachable, authenticated and able to hold the context by
 * construction. The name has already been substituted through the tier slots by the loader (REQ-CONFIG-073).
 */
export function compressorOf(cfg: LoadedConfiguration, scripted: boolean): { model: ModelRef; thinking: ThinkingLevel } | null {
  const name = cfg.compressor.model;
  const ref = modelRefOf(cfg, name, scripted);
  if (!ref || !name) return null;
  return { model: ref, thinking: thinkingOf(cfg.models[name]) };
}

/**
 * REQ-CONFIG-134 / REQ-MONITOR-078: the trigger for the model an agent actually calls, resolved by the ONE
 * implementation of the capacity ladder (`compressionTrigger`). A model this configuration does not name —
 * a discovered one, or one reached by a mid-run switch — resolves against the configured default capacity,
 * which is what REQ-MONITOR-078 (3) says to do when nothing better is known.
 */
export function compressionTriggerFor(cfg: LoadedConfiguration): (model: ModelRef) => ResolvedTrigger {
  return (model) => {
    const entry = Object.values(cfg.models).find((e) => e.model_id === model.modelId) ?? null;
    return compressionTrigger(cfg.compressor, { context_compression_threshold: entry?.context_compression_threshold ?? null, max_input_tokens: entry?.max_input_tokens ?? null });
  };
}

/**
 * REQ-MONITOR-049 / REQ-CONFIG-085 (Part AH, ADR-0060 decision 8): each configured model's own maximum input
 * tokens by `models:` key — the figure an agent's context meter is measured against. Part R declared the
 * lookup and recorded it unfilled because nothing carried these figures out of the configuration; this does.
 */
export function contextLimitsOf(cfg: LoadedConfiguration): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, entry] of Object.entries(cfg.models)) if (entry.max_input_tokens !== null && entry.max_input_tokens > 0) out[key] = entry.max_input_tokens;
  return out;
}

/** REQ-CONFIG-065: the summariser's model, when `default_summary_model` names one this run can reach. */
export function summariserOf(cfg: LoadedConfiguration, scripted: boolean): { model: ModelRef; thinking: ThinkingLevel } | null {
  const name = cfg.slots.default_summary_model;
  const ref = modelRefOf(cfg, name, scripted);
  if (!ref || !name) return null;
  const slot = cfg.slotThinking.default_summary_model;
  return { model: ref, thinking: slot && slot !== 'auto' ? slot : thinkingOf(cfg.models[name]) };
}

/** REQ-LIBRARY-037/040: explicit collector slot, then the medium-tier slot. */
export function improvementCollectorOf(cfg: LoadedConfiguration, scripted: boolean): { key: string; model: ModelRef; thinking: ThinkingLevel } | null {
  const slot = cfg.slots.improvement_collector_model ? 'improvement_collector_model' : 'medium_model';
  const name = cfg.slots[slot];
  const model = modelRefOf(cfg, name, scripted);
  if (!name || !model) return null;
  const configuredThinking = cfg.slotThinking[slot];
  return {
    key: name,
    model,
    thinking: configuredThinking && configuredThinking !== 'auto' ? configuredThinking : thinkingOf(cfg.models[name]),
  };
}

/**
 * OQ-189's ruling (R-071, PD-MONITOR-007): the post-run analyst's model once the session has had its say — the collector's
 * slot with the session's overrides followed (its key the override's, so the artifact names the model that ran), or not
 * `ok` where the pair it ends on is held out of quota, and then the analysis is skipped. Until 2026-10-06 the configured
 * model was called, and a provider that had refused it reported the analysis failed.
 */
export function postRunAnalystOf(collector: { readonly key: string; readonly model: ModelRef; readonly thinking: ThinkingLevel }, helperModel: HelperModel): { readonly ok: true; readonly key: string; readonly model: ModelRef; readonly thinking: ThinkingLevel } | { readonly ok: false; readonly reason: string } {
  const h = helperModel({ model: collector.model, thinking: collector.thinking });
  return h.ok ? { ok: true, key: h.key ?? collector.key, model: h.model, thinking: h.thinking } : h;
}

/**
 * PD-LIBRARY-002: the retrospective's own slot, then the medium tier — the ladder REQ-LIBRARY-040 states for
 * the sibling, which the directive adopts. A workspace where neither resolves captures no pass at all.
 */
export function retrospectiveOf(cfg: LoadedConfiguration, scripted: boolean): { key: string; model: ModelRef; thinking: ThinkingLevel } | null {
  const slot = cfg.slots.retrospective_model ? 'retrospective_model' : 'medium_model';
  const name = cfg.slots[slot];
  const model = modelRefOf(cfg, name, scripted);
  if (!name || !model) return null;
  const configuredThinking = cfg.slotThinking[slot];
  return {
    key: name,
    model,
    thinking: configuredThinking && configuredThinking !== 'auto' ? configuredThinking : thinkingOf(cfg.models[name]),
  };
}

export interface ConfiguredRun extends RunSetup {
  readonly cfg: LoadedConfiguration;
  readonly runtime: RuntimeFromConfiguration;
  readonly scripted: boolean;
  /** REQ-PROVIDER-066: the providers to lease before the run starts. */
  readonly authProviders: readonly string[];
  /** The entry model's sign-in provider, when it names one: an unleased one refuses the run (REQ-WORKSPACE-137). */
  readonly entryAuthProvider: string | null;
  readonly tier: ModelTier | null;
}

export interface ConfigureDeps {
  readonly clocks: Clocks;
  readonly globalDir: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  /** REQ-MCP-033 / ADR-0035 (Part T): what the reserved token launches — this application's own executable with the token first. */
  readonly codeIntelligenceLaunch?: BuiltinLaunch | null;
  /**
   * The scripted client: every model under the dialect switch, or an entry naming the `scripted` provider — both verification
   * only, and neither reachable in a packaged build (`isScriptedProvider`, OQ-312), where `host.ts` hands a function that throws.
   */
  readonly scriptedClient: () => ModelClient;
  readonly onRequest: (info: { url: string; method: string; headers: Record<string, string> }) => void;
  readonly log: (m: string) => void;
  /** ADR-0037 Tier B: the settings store's current values, as main last told this process. */
  readonly liveState: () => LiveState;
  /** ADR-0030: the bearers main leased for this workspace's current run, read per request. */
  readonly bearers: (workspaceRoot: string) => Readonly<Record<string, string>>;
  /**
   * ADR-0022 / REQ-SANDBOX-067: the CACHED availability verdict, owned at application lifetime by the
   * run host's one `ConfinementService`. Read synchronously and never probed from here: every path
   * that prepares a run awaits the probe first (REQ-SANDBOX-097) — a run start in `launchSession`, and
   * every continuation (`session.continue`, `session.prompt`, `session.planDecision`, `session.retry`,
   * the restarts of REQ-NOTIFY-070/074) in `dispatch` before its lease and again in
   * `leaseForContinuation`. `null` — no probe has completed — is read as unavailable, the fail-closed
   * side of REQ-SANDBOX-068; only a retrospective's setup, which meets no gate, reads it unsettled.
   * FALSIFIED 2026-10-20, kept beside its replacement: "the launch has already awaited the probe, and a
   * continuation reads what that launch settled" — no continuation settled it, so one reached before any
   * launch or Settings read was refused as unavailable with no reason
   * (docs/defects/fixed/a-continuation-before-the-confinement-verdict-settles-is-refused-as-confinement-unavailable.md).
   */
  readonly confinement?: (() => AvailabilityVerdict | null) | undefined;
  /** PD-PROVIDER-001: the shared-quota caps the provider catalogue declares, by provider id, as main handed them. */
  readonly sharedQuotaCaps?: (() => Readonly<Record<string, number>>) | undefined;
}

/** REQ-SANDBOX-122: the mode has exactly two sources — the layered key, and the launch dialog's override. */
export interface PrepareOptions {
  readonly boardPermissions?: 'permissive' | undefined;
  readonly sandboxMode?: string | undefined;
  /**
   * PD-ORCH-005 clause 4: the role the run's entry agent is set up as, in place of `default_persona` — the persona an
   * open iteration's root ran as, which a continue that resumes it restores. Absent means `default_persona`.
   */
  readonly entryPersona?: string | undefined;
  /**
   * PD-LIBRARY-002 with ADR-0030: the setup is a retrospective's (`leasedSetup`), whose one request goes to its own model
   * (`retrospectiveOf`: `retrospective_model`, then `medium_model`) and nothing to the entry role's. An entry role with no usable
   * model then does not refuse it: the setup is completed with the retrospective's model in the entry model's place, and the log
   * says so. With no resolvable retrospective model either, the `no-model` refusal stands. Until 2026-10-15 the entry role's
   * refusal stood for the retrospective too, and was answered "The workspace configuration could not be loaded"
   * (docs/defects/fixed/a-retrospective-is-refused-as-an-unloadable-configuration-when-the-entry-role-has-no-usable-model.md).
   * Nor is it met by ADR-0022's start-time confinement gate, which is a run start's (see the gate in `prepareRun`).
   *
   * PD-LIBRARY-002 revision 6 (OQ-363, ruled 2026-10-20 under R-072): nor by a run's other refusals of a configuration that loads.
   * A `default_persona` naming no role this build knows is completed on the retrospective's own model as an unusable entry model
   * is — no role's system text, the configured name kept, the log saying so — and referential errors are the setup's warnings
   * whatever `attended` holds (REQ-CONFIG-246 binds a run, and a retrospective is none). A retrospective's setup is therefore
   * refused only as `unloaded` (the configuration did not load or apply) and as `no-model` (no retrospective model resolves), and
   * `leasedSetup` adds the lease's refusal (revision 5). Until 2026-10-20 a default_persona naming no known role, and referential
   * errors with no presenter, refused a retrospective's setup, answered `retrospective.configuration`.
   */
  readonly retrospective?: boolean | undefined;
}

/**
 * The load, the overlay, the refusals: a fatal file refuses the run with REQ-CONFIG-478's report; referential
 * errors are warnings while a person is present and fatal otherwise (REQ-CONFIG-245/246); an entry model
 * with no reachable endpoint refuses (REQ-EVENTS-021, one result of status error).
 *
 * The codes:
 * - `confinement` (REQ-NOTIFY-060/061): the start-time gate refused the confinement mode the run asked for, so the run never
 *   reached a started state; main reports that class in REQ-NOTIFY-061's own notice.
 * - `unloaded`: the configuration did not load, or did not apply over the current settings — the one refusal a reader may word
 *   as "the configuration could not be loaded". Every other refusal is of a configuration that loaded (REQ-NOTIFY-254: the
 *   reason is worded by the layer that determined it), which a retrospective says as such
 *   (docs/defects/fixed/a-retrospective-is-refused-as-an-unloadable-configuration-when-confinement-is-requested.md).
 * - `no-model`: no usable model for the entry role; for a retrospective, no resolvable retrospective model either.
 * - none: a run's other refusals (an unknown `default_persona`, referential errors with no one present), which a retrospective
 *   never meets since PD-LIBRARY-002 revision 6.
 *
 * A retrospective's setup (`PrepareOptions.retrospective`) is refused only as `unloaded` and `no-model`, and `leasedSetup` adds
 * the lease's refusal. Until 2026-10-20 a default_persona naming no known role, and referential errors with no presenter, refused
 * a retrospective's setup, answered `retrospective.configuration`. *(Until 2026-10-20 these were three doc comments in a row, and
 * TypeScript attached only the last.)*
 */
export type ConfigureRefusal = { readonly reason: string; readonly cfg?: LoadedConfiguration; readonly code?: 'no-model' | 'confinement' | 'unloaded' };

/** Captured inputs and the credential boundary for one launch (REQ-TRACE-470/471). */
export interface PreparedRun {
  readonly authProviders: readonly string[];
  readonly entryAuthProvider: string | null;
  /**
   * PD-LIBRARY-002 with ADR-0030 and REQ-PROVIDER-066: the sign-in provider of the model a retrospective's request goes to —
   * `retrospective_model`, then `medium_model` (`retrospectiveOf`) — when that model names one; null when no retrospective model
   * resolves, or the model is the scripted client's. A retrospective's lease refuses on this provider, as a run's refuses on its
   * entry provider. Until 2026-10-14 the retrospective's lease checked the entry role's provider
   * (docs/defects/fixed/a-retrospectives-lease-checks-the-entry-roles-provider-not-the-retrospective-models.md).
   */
  readonly retrospectiveAuthProvider: string | null;
  readonly complete: (bearers: Readonly<Record<string, string>>) => ConfiguredRun;
}

/**
 * REQ-CHAT-006 / REQ-SESSION-026: the catalogue a run of this workspace would read (`resilience.catalogue`), for READING a
 * session no run of this process has started — which configured key a session-wide override replaces (the engine's
 * `SessionsDeps.restingCatalogue`). The same load, live overlay and snapshot fold as `prepareRun`, and nothing of a run
 * start: no refusal gate, no client, no log line, no `.gitignore` upkeep, and none of what the run host's per-run `configure` does around it (the
 * MCP configuration load, the run maps). `null` where the configuration does not load or the live state does not apply.
 */
export function restingCatalogueOf(workspaceRoot: string, deps: Pick<ConfigureDeps, 'globalDir' | 'env' | 'liveState' | 'bearers' | 'codeIntelligenceLaunch'>): CatalogueEntry[] | null {
  // REQ-CONFIG-013's `.gitignore` upkeep is a run start's; a read switches it off, as the loader allows a read-only surface.
  const loaded = loadConfiguration({ globalDir: deps.globalDir, workspaceRoot, keepIgnored: false, builtinLaunch: deps.codeIntelligenceLaunch ?? null });
  if (!loaded.ok) return null;
  const live = overlayLiveState(loaded.value, deps.liveState());
  if (!live.ok) return null;
  const snapshotRead = readProjectSnapshot(join(deps.globalDir, PROJECT_SETTINGS_FILE), () => undefined);
  return catalogueOf(live.value, scriptedDialect(deps.env), deps.bearers(workspaceRoot), snapshotRead.ok ? snapshotRead.value : null);
}

/**
 * The dialect switch: every model of every run answered by the scripted client, with no credential asked — verification only.
 * Read behind `__ROTARIS_SEAMS__` on the read's own line, so a packaged build compiles the read and its name out and answers a
 * model with the scripted client nowhere (OQ-312: nor where an entry names the `scripted` provider). Until 2026-10-14 it was read
 * with no flag, and one variable replaced every model of a shipped build with the stand-in
 * (docs/defects/fixed/a-packaged-build-still-answers-the-scripted-model-clients-variables.md).
 */
export function scriptedDialect(env: Readonly<Record<string, string | undefined>>): boolean {
  return __ROTARIS_SEAMS__ ? env['ROTARIS_MODEL_DIALECT'] === 'scripted' : false;
}

export function configureRun(workspaceRoot: string, attended: boolean, deps: ConfigureDeps, options?: PrepareOptions): Result<ConfiguredRun, ConfigureRefusal> {
  const prepared = prepareRun(workspaceRoot, attended, deps, undefined, options);
  return prepared.ok ? ok(prepared.value.complete(deps.bearers(workspaceRoot))) : prepared;
}

/**
 * REQ-SANDBOX-090: configuration that sets no confinement mode means `off`, but a value the session
 * layer cannot RECOGNISE is an error and must never be treated as "no confinement" — such a value
 * means validation did not run, and quietly settling on `off` there would be exactly the unannounced
 * downgrade this domain rules out.
 *
 * REQ-SANDBOX-122: exactly two sources, the layered key and the launch dialog's per-session override.
 */
export function effectiveSandboxMode(configured: string, override: string | undefined): Result<SandboxModeName, string> {
  const raw = (override ?? configured ?? '').trim().toLowerCase();
  if (raw === '') return ok('off');
  const found = SANDBOX_MODE_NAMES.find((m) => m === raw);
  return found === undefined
    ? err(`The confinement mode '${override ?? configured}' is not one of ${SANDBOX_MODE_NAMES.join(', ')}, so this run was refused rather than started without confinement.`)
    : ok(found);
}

/** Load and validate once, before the asynchronous credential lease. */
export function prepareRun(workspaceRoot: string, attended: boolean, deps: ConfigureDeps, boardPermissions?: 'permissive', options?: PrepareOptions): Result<PreparedRun, ConfigureRefusal> {
  const loaded = loadConfiguration({ globalDir: deps.globalDir, workspaceRoot, now: () => deps.clocks.monotonic.now(), builtinLaunch: deps.codeIntelligenceLaunch ?? null });
  // REQ-CONFIG-478 names the first problem; REQ-MCP-002 requires EVERY defect reported, so the rest follow it.
  if (!loaded.ok) return err({ reason: `The configuration could not be loaded: ${renderFatal(loaded.error)}${loaded.error.lines.length > 1 ? ` All problems: ${loaded.error.lines.join(' | ')}` : ''}`, code: 'unloaded' });
  const live = overlayLiveState(loaded.value, deps.liveState());
  if (!live.ok) return err({ reason: `The configuration could not be applied with the current settings: ${renderFatal(live.error)}`, cfg: loaded.value, code: 'unloaded' });
  // REQ-TRACE-470: this grant is confined to the launch and includes the Tier C opt-in.
  const granted: LoadedConfiguration = boardPermissions === 'permissive'
    ? { ...live.value, runtime: { ...live.value.runtime, permission_mode: 'autonomous', allow_unsandboxed_autonomous: true } }
    : live.value;
  /*
   * ADR-0022's start-time gate (REQ-SANDBOX-094, -095, -097). It sits HERE — before the credential
   * lease, before the session row, before the session lock — because REQ-SANDBOX-097 requires the
   * availability decision be settled before the run does anything else, and REQ-SANDBOX-095 requires
   * that no usable session and no shell able to run a command outside confinement be left behind.
   * Refusing here leaves nothing to clean up, which is the strongest form of that.
   *
   * The refusal travels as REQ-EVENTS-021's reason, so it becomes the run's one `result` of status
   * error, carrying the backend's own reason AND remediation as unaltered substrings
   * (REQ-EVENTS-024, REQ-SANDBOX-126). Mode `off` is not a failure (REQ-SANDBOX-092) and does no
   * probing at all (REQ-SANDBOX-074).
   *
   * A retrospective's setup (`PrepareOptions.retrospective`) does not pass through it: the gate protects the shell a run would
   * open, and a retrospective is no run — it starts no session, opens no shell and runs no tool, its one request going to its own
   * model (PD-LIBRARY-002, ADR-0065 decision 5). Its setup never reaches a run (`retrospectiveSetup` caches nothing), so no run
   * records a confinement fact from it (REQ-SANDBOX-094), and the configured mode stays as the file states it. Until 2026-10-15 it
   * was gated, and refused wherever the run host had not yet settled the verdict — `peek()` is null until a run start or
   * Settings asks — or where confinement is unavailable
   * (docs/defects/fixed/a-retrospective-is-refused-as-an-unloadable-configuration-when-confinement-is-requested.md).
   */
  const verdict = deps.confinement?.() ?? null;
  let moded: LoadedConfiguration = granted;
  if (options?.retrospective !== true) {
    const mode = effectiveSandboxMode(granted.runtime.sandbox_mode, options?.sandboxMode);
    if (!mode.ok) return err({ reason: mode.error, cfg: granted, code: 'confinement' });
    if (mode.value !== 'off' && verdict?.available !== true) {
      return err({ reason: renderUnavailability(verdict ?? { available: false, backend: 'unavailable', reason: '', remediation: '' }), cfg: granted, code: 'confinement' });
    }
    // The override is folded into the captured configuration, so the run, its snapshot and its audit
    // all read one mode rather than the file's and the dialog's separately (REQ-SANDBOX-104, -122).
    if (granted.runtime.sandbox_mode !== mode.value) moded = { ...granted, runtime: { ...granted.runtime, sandbox_mode: mode.value } };
  }
  const warnings: string[] = [...moded.warnings.map((w) => `configuration: ${w}`)];
  if (moded.referential.length > 0) {
    const lines = moded.referential.map((m) => `configuration: ${m}`);
    // REQ-CONFIG-246: with no person present, referential errors are always fatal to the run. A retrospective is no run, and
    // its setup reads no attendedness: the lines are its warnings whatever `attended` holds, written to the log at its capture
    // (PD-LIBRARY-002 revision 6, OQ-363). Until 2026-10-20 they refused it with no presenter.
    if (!attended && options?.retrospective !== true) return err({ reason: `The configuration has ${countNoun(moded.referential.length, 'unresolved reference')} and no one is present to correct ${moded.referential.length === 1 ? 'it' : 'them'}: ${moded.referential.join('; ')}`, cfg: moded });
    warnings.push(...lines);
  }
  const scripted = scriptedDialect(deps.env);
  const personas = personaResolverFor(moded, scripted, (m) => warnings.push(m));
  /*
   * PD-ORCH-005 clause 4: a continue that resumes an open iteration sets the run up as the persona its root ran as,
   * folded into the captured configuration so the entry role, its model tier and the log read one persona. A persona the
   * configuration no longer knows cannot be restored: the run is set up as the entry role, and says so — refusing left a
   * crashed session no way on (found by phase 4's second review).
   */
  const wanted = options?.entryPersona;
  const restored = wanted !== undefined && personas.resolve(wanted) !== null ? wanted : undefined;
  if (wanted !== undefined && restored === undefined) warnings.push(`configuration: the open iteration's root ran as '${wanted}', which this configuration no longer knows; it resumes as the entry role '${moded.defaultPersona}' (PD-ORCH-005).`);
  const cfg: LoadedConfiguration = restored === undefined ? moded : { ...moded, defaultPersona: restored };
  const entryRole = personas.resolve(cfg.defaultPersona);
  /*
   * PD-LIBRARY-002 revision 6 (OQ-363, ruled 2026-10-20 under R-072): a `default_persona` naming no role this build knows refuses
   * a run (word for word below) and not a retrospective, which sends nothing to the entry role. Its setup is completed on the
   * retrospective's own model (`retrospectiveOf`) as an entry role with no usable model is: the configured persona name kept, no
   * role's system text, that model's `models:` entry for the credential, timeout and retries. Where no retrospective model
   * resolves either, the pass is refused as `no-model`. Until 2026-10-20 the run's refusal stood for the retrospective too.
   */
  let personaStandIn: ReturnType<typeof retrospectiveOf> = null;
  if (!entryRole) {
    if (options?.retrospective !== true) return err({ reason: `default_persona '${cfg.defaultPersona}' names no role this build knows.`, cfg });
    personaStandIn = retrospectiveOf(cfg, scripted);
    if (personaStandIn === null) return err({ reason: `default_persona '${cfg.defaultPersona}' names no role this build knows, and no retrospective model resolves (retrospective_model, then medium_model).`, cfg, code: 'no-model' });
    deps.log(`configuration: default_persona '${cfg.defaultPersona}' names no role this build knows; a retrospective sends nothing to it, so its setup is completed on its own model '${personaStandIn.key}' (PD-LIBRARY-002)`);
  }
  const statedModelName = entryRole ? cfg.personas[cfg.defaultPersona]?.model ?? null : null;
  const stated = entryRole ? entryRole.persona.modelRef ?? modelRefOf(cfg, statedModelName, scripted) : null;
  // A retrospective's setup takes its own model where the entry role has none it could use (`PrepareOptions.retrospective`).
  const standIn = personaStandIn ?? (stated === null && options?.retrospective === true ? retrospectiveOf(cfg, scripted) : null);
  const model = stated ?? standIn?.model ?? null;
  const why = (): string => {
    const named = statedModelName === null ? undefined : cfg.models[statedModelName];
    return statedModelName === null ? `role ${cfg.defaultPersona} names no model` : !named ? `model '${statedModelName}' is not a configured model` : `model '${statedModelName}' (provider ${named.provider}) has no base_url and this build knows no endpoint for that provider`;
  };
  if (!model) return err({ reason: `No usable model is configured for the entry role, so the run was refused before it started: ${why()}.`, cfg, code: 'no-model' });
  if (standIn !== null && personaStandIn === null) deps.log(`configuration: the entry role ${cfg.defaultPersona} has no usable model (${why()}); a retrospective sends nothing to it, so its setup is completed on its own model '${standIn.key}' (PD-LIBRARY-002)`);
  const entryModelName = standIn?.key ?? statedModelName;
  const entry = entryModelName ? cfg.models[entryModelName] : undefined;
  const roleModelKey = entryRole ? entryRole.persona.modelKey : undefined;
  const snapshotRead = readProjectSnapshot(join(deps.globalDir, PROJECT_SETTINGS_FILE), () => undefined);
  const authProviders = authProvidersOf(cfg);
  const isScripted = scripted || isScriptedProvider(model.providerId);
  const entryAuthProvider = isScripted ? null : entry?.auth_provider ?? null;
  const retrospective = retrospectiveOf(cfg, scripted);
  const retrospectiveAuthProvider = retrospective === null || scripted || isScriptedProvider(retrospective.model.providerId) ? null : cfg.models[retrospective.key]?.auth_provider ?? null;
  return ok({ authProviders, entryAuthProvider, retrospectiveAuthProvider, complete: (bearers) => {
    const runtime = runtimeFromConfiguration(cfg, verdict, deps.sharedQuotaCaps?.() ?? {});
    // The adapter's idle bound (REQ-CONFIG-115) is re-armed from the run host's own timer port, never a global.
    const client: ModelClient = isScripted ? deps.scriptedClient() : new AiSdkModelClient({ baseUrl: model.baseUrl ?? PROVIDER_BASE_URLS['openai']!, onRequest: (i) => deps.onRequest(i), timers: deps.clocks.timers, monotonic: deps.clocks.monotonic });
    const backend: AgentBackend = new DefaultAgentBackend(client);
    const entryCredential = isScripted ? async () => '' : credentialResolver(entry, deps.env, () => bearers);
    const setup: ModelSetup = {
      backend,
      summariser: summariserOf(cfg, scripted),
      // Part AH (ADR-0060): the compressing pass's model; the section's figures travel beside it on the setup.
      compression: {
        model: compressorOf(cfg, scripted), timeoutMs: cfg.compressor.timeout_seconds * 1000,
        charsPerToken: cfg.compressor.chars_per_token, preserveRecentTurns: cfg.compressor.preserve_recent_turns,
        triggerFor: compressionTriggerFor(cfg),
      },
      config: {
        ...RUN_CONFIG_DEFAULTS,
        persona: cfg.defaultPersona,
        // A retrospective completed on its own model for an unknown persona (revision 6) carries no role's system text.
        systemPrompt: entryRole ? entryRole.persona.systemPrompt : '',
        model,
        // REQ-CONFIG-094 (live-run finding D5): the run's model's `models:` key, which a child on the run's model is recorded under.
        ...(roleModelKey !== undefined ? { modelKey: roleModelKey } : entryModelName !== null ? { modelKey: syntheticOriginOf(entryModelName, cfg.syntheticOrigins) } : {}),
        thinking: entryRole ? entryRole.persona.thinking ?? thinkingOf(entry) : personaStandIn?.thinking ?? thinkingOf(entry),
        modelTimeoutMs: Math.round((entry?.timeout ?? runtime.modelTimeoutS) * 1000),
        modelRetries: entry?.num_retries ?? RUN_CONFIG_DEFAULTS.modelRetries,
        iterationLimit: runtime.iterationLimit,
        transientRetries: runtime.transientRetries,
        validationRetries: runtime.validationRetries,
        llmResponseTimeoutMs: Math.round(runtime.llmResponseTimeoutS * 1000),
        consecutiveRetryLimit: runtime.consecutiveRetryLimit,
        credentialFor: credentialFactory(cfg, scripted, deps.env, () => bearers, entryCredential, (m) => warnings.push(m)),
      },
    };
    const tier = entryTierOf(cfg);
    const resolvedSystemPrompts = Object.fromEntries(Object.keys(cfg.personas).map((role) => [role, personas.resolve(role)?.persona.systemPrompt ?? '']));
    const configurationSnapshot = launchConfigurationSnapshot(cfg, resolvedSystemPrompts);
    // Part Q: the catalogue the same-tier rule reads, with the snapshot's per-provider picks as the discovered roles.
    const catalogue = catalogueOf(cfg, scripted, bearers, snapshotRead.ok ? snapshotRead.value : null);
    const fallbackName = cfg.slots.fallback_model;
    const fallbackRef = modelRefOf(cfg, fallbackName, scripted);
    const fallbackModel: ModelChoice | null = fallbackRef && fallbackName ? { model: fallbackRef, thinking: thinkingOf(cfg.models[fallbackName]), ...settingsOf(cfg.models[fallbackName]) } : null;
    deps.log(`configuration: loaded in ${cfg.loadMs === null ? '?' : cfg.loadMs.toFixed(1)} ms; entry ${cfg.defaultPersona} on ${model.providerId}/${model.modelId}${model.baseUrl ? ` at ${model.baseUrl}` : ''}; auth_provider=${entry?.auth_provider ?? 'none'}; tier=${tier ?? 'undetermined'}; slots: small=${cfg.slots.small_model ?? '-'} fallback=${cfg.slots.fallback_model ?? '-'} summary=${cfg.slots.default_summary_model ?? '-'}; permission_mode=${runtime.permissionMode}; strategy=${cfg.delegationStrategy}; breaker=${cfg.circuitBreaker.enabled ? 'on' : 'off'}; catalogue=${catalogue.map((c) => `${c.key}[${c.provider}:${c.roles.map((r) => r[0]).join('') || '-'}${c.usable ? '' : ',unleased'}]`).join(' ')}; llm_response_timeout=${runtime.llmResponseTimeoutS} s; child_timeout=${(runtime.childTimeoutMs ?? 0) / 1000} s; improvement_collector_timeout=${cfg.runtime.improvement_collector_timeout} s`);
    // REQ-MONITOR-142 / REQ-ORCH-091 (d): a mid-run switch resolves a `models:` key the same way the entry model was, or says why not.
    const models = (key: string): ModelLookup => {
      const e = cfg.models[key];
      if (!e) return { ok: false, reason: `'${key}' is not a configured model` };
      const ref = modelRefOf(cfg, key, scripted);
      if (!ref) return { ok: false, reason: `model '${key}' (provider ${e.provider}) has no base_url and this build knows no endpoint for that provider` };
      if (!isScripted && e.auth_provider && !bearers[e.auth_provider]) return { ok: false, reason: `provider ${e.auth_provider} is not authenticated for this run` };
      return { ok: true, key, choice: { model: ref, thinking: thinkingOf(e), ...settingsOf(e) } };
    };
    return { cfg, model: setup, runtime, configurationSnapshot, retentionCap: runtime.retentionCap, personas, models, warnings, scripted: isScripted, authProviders, entryAuthProvider, tier, resilience: { catalogue, fallbackModel, ...(fallbackModel && fallbackName ? { fallbackKey: fallbackName } : {}) }, contextLimits: contextLimitsOf(cfg) };
  } });
}
