import { readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import type { Clocks, Result } from '@rotaris/kernel';
import { err, ok } from '@rotaris/kernel';
import { resolvePreset, type HeadlessPolicy } from '@rotaris/contracts';
import { loadConfiguration, overlayLiveState, renderFatal, type LiveState, type LoadedConfiguration, type ModelEntry } from '@rotaris/config';
import { BUILT_IN_PERSONAS, parseLogLevel, resolveRole, RUN_CONFIG_DEFAULTS, type ClassifierSlots, type ModelSetup, type Persona, type PersonaResolver, type RoleName, type RunSetup, type RuntimePosture } from '@rotaris/engine';
import { AiSdkModelClient, DefaultAgentBackend, type AgentBackend, type ModelClient, type ModelRef, type ThinkingLevel } from '@rotaris/model';

/**
 * ADR-0036 / ADR-0037 at the run-host root: one load per run start (Tier B — the files, then the live
 * state main holds, then the loader's own passes), turned into what the engine takes — the model setup,
 * the runtime posture, the persona resolver. Nothing here is read from the environment any more except
 * the two stopgaps the map names: `ROTARIS_MODEL_DIALECT=scripted` (verification only) and
 * `ROTARIS_MODEL_TIER` (ADR-0028's, in intent.ts).
 *
 * Credentials (decision 2 of the plan): the entry model's `api_key` or `api_key_env`, resolved per request.
 * Every model call of a run authenticates with the entry model's resolver; per-model keys for the other
 * slots wait on ADR-0029. Stated in codebase.md.
 */
export const PROVIDER_BASE_URLS: Readonly<Record<string, string>> = Object.freeze({
  openai: 'https://api.openai.com/v1',
});
export const SCRIPTED_PROVIDER = 'scripted';

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
  readonly modelTimeoutS: number;
  readonly loopClassificationTimeoutS: number;
}

export function runtimeFromConfiguration(cfg: LoadedConfiguration): RuntimeFromConfiguration {
  const r = cfg.runtime;
  return {
    permissionMode: resolvePreset(r.permission_mode).preset,
    allowUnsandboxedAutonomous: r.allow_unsandboxed_autonomous,
    // ADR-0022: no confinement backend exists on this platform; a requested mode is recorded, never honoured.
    sandbox: { requested: r.sandbox_mode !== 'off', available: false, backend: '' },
    sessionLogLevel: parseLogLevel(r.session_log_level).level,
    modelConcurrencyCap: null,
    modelCapFor: (modelKey) => cfg.models[modelKey]?.max_parallel ?? null,
    childBudget: { maxDepth: r.max_depth, maxTotal: r.max_children, maxActive: r.max_active_children },
    drainTimeoutMs: Math.round(r.shutdown_drain_timeout * 1000),
    approvalTimeoutMs: Math.round(r.approval_timeout_seconds * 1000),
    headlessPolicy: r.headless_approval_policy,
    allowOutsideWorkspace: r.allow_outside_workspace,
    additionalReadOnlyRoots: r.additional_read_only_roots,
    shellCommandTimeoutS: r.shell_command_timeout,
    runOverride: cfg.delegationStrategy === 'single' ? 'single' : cfg.delegationStrategy === 'swarm' ? 'swarm' : null,
    retentionCap: r.event_retention_per_session,
    iterationLimit: r.max_iterations,
    consecutiveRetryLimit: r.task_consecutive_retry_limit,
    transientRetries: r.auto_retries_transient,
    modelTimeoutS: r.model_timeout,
    loopClassificationTimeoutS: r.loop_classification_timeout,
  };
}

export function thinkingOf(entry: Pick<ModelEntry, 'thinking'> | null | undefined): ThinkingLevel {
  const t = entry?.thinking;
  return t === null || t === undefined || t === 'auto' ? 'unset' : t;
}

/** A `models:` entry as the model port's reference; null when the entry is absent or has no reachable endpoint. */
export function modelRefOf(cfg: LoadedConfiguration, name: string | null, scripted: boolean): ModelRef | null {
  if (name === null) return null;
  const entry = cfg.models[name];
  if (!entry) return null;
  if (scripted || entry.provider === SCRIPTED_PROVIDER) return { providerId: SCRIPTED_PROVIDER, modelId: entry.model_id, dialect: 'chat' };
  const baseUrl = entry.base_url ?? PROVIDER_BASE_URLS[entry.provider];
  if (!baseUrl) return null;
  const dialect = entry.api_mode === 'responses' && !entry.disable_responses_api ? 'responses' : 'chat';
  return { providerId: entry.provider, modelId: entry.model_id, dialect, baseUrl };
}

/** REQ-CONFIG-083: the entry model's credential, read per request; `api_key` outranks `api_key_env`. */
export function credentialResolver(entry: ModelEntry | undefined, env: Readonly<Record<string, string | undefined>>): () => Promise<string> {
  return async () => entry?.api_key ?? (entry?.api_key_env ? env[entry.api_key_env] ?? '' : '');
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
    const tools = entry && entry.tools.length > 0 ? entry.tools : base?.tools ?? [];
    const modelRef = entry ? modelRefOf(cfg, entry.model, scripted) : null;
    const persona: Persona = {
      name: role,
      tools,
      coordinatorOnly: stated(role, 'coordinator_only') ? entry!.coordinator_only : base?.coordinatorOnly ?? false,
      readOnly: stated(role, 'read_only') ? entry!.read_only : base?.readOnly ?? false,
      systemPrompt: prompt,
      implementer: tools.some((t) => ['write_file', 'haet_edit', 'haet', 'terminal'].includes(t)),
      ...(modelRef ? { modelRef, thinking: thinkingOf(entry ? cfg.models[entry.model] : null) } : {}),
    };
    return persona;
  };
  return {
    resolve: (name) => {
      const direct = cache.has(name) ? cache.get(name)! : (cache.set(name, build(name)), cache.get(name)!);
      if (direct) return { persona: direct, alias: null };
      const alias = resolveRole(name);
      if (!alias) return null;
      const target = cache.has(alias.persona.name) ? cache.get(alias.persona.name)! : (cache.set(alias.persona.name, build(alias.persona.name)), cache.get(alias.persona.name)!);
      return target ? { persona: target, alias: name } : null;
    },
    knownRoles: () => Object.keys(cfg.personas),
  };
}

/** REQ-ORCH-005's slots from the configuration: the three the classifier ladder may use. */
export function classifierSlotsOf(cfg: LoadedConfiguration, scripted: boolean): ClassifierSlots {
  return {
    small: modelRefOf(cfg, cfg.slots.small_model, scripted),
    fallback: modelRefOf(cfg, cfg.slots.fallback_model, scripted),
    summary: modelRefOf(cfg, cfg.slots.default_summary_model, scripted),
  };
}

export interface ConfiguredRun extends RunSetup {
  readonly cfg: LoadedConfiguration;
  readonly runtime: RuntimeFromConfiguration;
  readonly scripted: boolean;
}

export interface ConfigureDeps {
  readonly clocks: Clocks;
  readonly globalDir: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  /** The scripted client, verification only (`ROTARIS_MODEL_DIALECT=scripted`). */
  readonly scriptedClient: () => ModelClient;
  readonly onRequest: (info: { url: string; method: string }) => void;
  readonly log: (m: string) => void;
  /** ADR-0037 Tier B: the settings store's current values, as main last told this process. */
  readonly liveState: () => LiveState;
}

/**
 * The load, the overlay, the refusals: a fatal file refuses the run with REQ-CONFIG-478's report; referential
 * errors are warnings while a person is present and fatal otherwise (REQ-CONFIG-245/246); an entry model
 * with no reachable endpoint refuses (REQ-EVENTS-021, one result of status error).
 */
export function configureRun(workspaceRoot: string, attended: boolean, deps: ConfigureDeps): Result<ConfiguredRun, { readonly reason: string; readonly cfg?: LoadedConfiguration }> {
  const loaded = loadConfiguration({ globalDir: deps.globalDir, workspaceRoot, now: () => deps.clocks.monotonic.now() });
  if (!loaded.ok) return err({ reason: `The configuration could not be loaded: ${renderFatal(loaded.error)}` });
  const live = overlayLiveState(loaded.value, deps.liveState());
  if (!live.ok) return err({ reason: `The configuration could not be applied with the current settings: ${renderFatal(live.error)}`, cfg: loaded.value });
  const cfg = live.value;
  const warnings: string[] = [...cfg.warnings.map((w) => `configuration: ${w}`)];
  if (cfg.referential.length > 0) {
    const lines = cfg.referential.map((m) => `configuration: ${m}`);
    // REQ-CONFIG-246: with no person present, referential errors are always fatal to the run.
    if (!attended) return err({ reason: `The configuration has ${cfg.referential.length} unresolved reference(s) and no one is present to correct them: ${cfg.referential.join('; ')}`, cfg });
    warnings.push(...lines);
  }
  const scripted = deps.env['ROTARIS_MODEL_DIALECT'] === 'scripted';
  const personas = personaResolverFor(cfg, scripted, (m) => warnings.push(m));
  const entryRole = personas.resolve(cfg.defaultPersona);
  if (!entryRole) return err({ reason: `default_persona '${cfg.defaultPersona}' names no role this build knows.`, cfg });
  const entryModelName = cfg.personas[cfg.defaultPersona]?.model ?? null;
  const entry = entryModelName ? cfg.models[entryModelName] : undefined;
  const model = entryRole.persona.modelRef ?? modelRefOf(cfg, entryModelName, scripted);
  if (!model) {
    const why = entryModelName === null ? `role ${cfg.defaultPersona} names no model` : !entry ? `model '${entryModelName}' is not a configured model` : `model '${entryModelName}' (provider ${entry.provider}) has no base_url and this build knows no endpoint for that provider`;
    return err({ reason: `No usable model is configured for the entry role, so the run was refused before it started: ${why}.`, cfg });
  }
  const runtime = runtimeFromConfiguration(cfg);
  const isScripted = model.providerId === SCRIPTED_PROVIDER;
  const client: ModelClient = isScripted ? deps.scriptedClient() : new AiSdkModelClient({ baseUrl: model.baseUrl ?? PROVIDER_BASE_URLS['openai']!, onRequest: (i) => deps.onRequest(i) });
  const backend: AgentBackend = new DefaultAgentBackend(client);
  const setup: ModelSetup = {
    backend,
    config: {
      ...RUN_CONFIG_DEFAULTS,
      persona: cfg.defaultPersona,
      systemPrompt: entryRole.persona.systemPrompt,
      model,
      thinking: entryRole.persona.thinking ?? thinkingOf(entry),
      modelTimeoutMs: Math.round((entry?.timeout ?? runtime.modelTimeoutS) * 1000),
      modelRetries: entry?.num_retries ?? RUN_CONFIG_DEFAULTS.modelRetries,
      iterationLimit: runtime.iterationLimit,
      transientRetries: runtime.transientRetries,
      consecutiveRetryLimit: runtime.consecutiveRetryLimit,
      resolveCredential: isScripted ? async () => '' : credentialResolver(entry, deps.env),
    },
  };
  deps.log(`configuration: loaded in ${cfg.loadMs === null ? '?' : cfg.loadMs.toFixed(1)} ms; entry ${cfg.defaultPersona} on ${model.providerId}/${model.modelId}${model.baseUrl ? ` at ${model.baseUrl}` : ''}; permission_mode=${runtime.permissionMode}; strategy=${cfg.delegationStrategy}; breaker=${cfg.circuitBreaker.enabled ? 'on' : 'off'}`);
  return ok({ cfg, model: setup, runtime, retentionCap: runtime.retentionCap, personas, warnings, scripted: isScripted });
}
