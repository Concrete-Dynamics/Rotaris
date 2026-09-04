import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { WORKSPACE_SCOPE_DIR } from '@rotaris/platform';
import { err, ok, type Result } from '@rotaris/kernel';
import { parseConfig, plainOf, triOf, asMap, vocabularyText, type ParsedConfig } from './document.js';
import { builtInDefaults } from './defaults.js';
import { canonicaliseRoles, isPlainMap, mergeLayers, type Layer, type PlainMap } from './merge.js';
import { MODEL_SLOTS, thinkingKeyOf, type ModelSlot, type ReasoningLevel, type TierAlias, REASONING_LEVELS } from './keys.js';
import { EMPTY_HOOKS_LAYER, mergeHooks, readHooksSection, type HooksLayer, type HooksResolved } from './hooks-section.js';
import { readRuntimeSection, type RuntimeSection } from './sections/runtime.js';
import { readModelsSection, type ModelEntry } from './sections/models.js';
import { readPersonasSection, type PersonaEntry } from './sections/personas.js';
import { readCompressorSection, type CompressorSection } from './sections/compressor.js';
import { readCircuitBreakerSection, type CircuitBreakerSection } from './circuit-breaker-section.js';
import { FieldReader, typeName, vocabularyString, type Problem, type ProblemSink } from './sections/field.js';
import { resolveSlotsAndReasoning } from './slots.js';
import { referentialMessages, renderProblems, type FatalLoadReport } from './validate.js';

/**
 * ADR-0036 alternative B, the whole loader: `loadConfiguration(globalDir, workspaceRoot)` — the entry point
 * takes NO database handle (the ADR's guard, in the signature) — reads the two scopes' four files fresh
 * (REQ-CONFIG-014), folds them under the four merge classes in REQ-CONFIG-031's order with the built-in
 * defaults copied first (REQ-CONFIG-032), runs the passes in REQ-CONFIG-035..037's order, and yields a
 * configuration that is already fully resolved. The discovery-snapshot and auto-discovered-server layers
 * (REQ-CONFIG-033/034) have no producer in this build; their positions in the order are empty.
 */
export const MODELS_FILE = 'models.yml' as const;
export const AGENTS_FILE_NAME = 'agents.yaml' as const;
export type ConfigScope = 'global' | 'workspace';
export const DELEGATION_STRATEGIES = ['orchestrator', 'swarm', 'single'] as const;
export type DelegationStrategy = (typeof DELEGATION_STRATEGIES)[number];

export interface ScopeFiles {
  readonly scope: ConfigScope;
  readonly dir: string;
  readonly agents: string;
  readonly models: string;
}

export function scopeFiles(globalDir: string, workspaceRoot: string): { global: ScopeFiles; workspace: ScopeFiles } {
  const wsDir = join(workspaceRoot, WORKSPACE_SCOPE_DIR);
  return {
    global: { scope: 'global', dir: globalDir, agents: join(globalDir, AGENTS_FILE_NAME), models: join(globalDir, MODELS_FILE) },
    workspace: { scope: 'workspace', dir: wsDir, agents: join(wsDir, AGENTS_FILE_NAME), models: join(wsDir, MODELS_FILE) },
  };
}

export interface LoadedConfiguration {
  readonly workspaceRoot: string;
  readonly defaultPersona: string;
  readonly slots: Readonly<Record<ModelSlot, string | null>>;
  readonly slotThinking: Readonly<Record<ModelSlot, ReasoningLevel | null>>;
  readonly models: Readonly<Record<string, ModelEntry>>;
  readonly personas: Readonly<Record<string, PersonaEntry>>;
  readonly runtime: RuntimeSection;
  readonly compressor: CompressorSection;
  readonly circuitBreaker: CircuitBreakerSection;
  readonly hooks: HooksResolved;
  readonly worktreeStorageSubpath: string;
  readonly injectAgentsMd: boolean;
  /** Outside the layered model (REQ-CONFIG-477 ground 1): a second lookup over the workspace document only. */
  readonly delegationStrategy: DelegationStrategy;
  /** REQ-CONFIG-071: computed, never serialised (REQ-CONFIG-072). */
  readonly resolvedPersonaModelTiers: Readonly<Record<string, TierAlias>>;
  /** REQ-CONFIG-233's warn-and-continue conditions, rendered. */
  readonly warnings: readonly string[];
  /** REQ-CONFIG-229: the referential stage's messages; empty means valid. */
  readonly referential: readonly string[];
  /** Each scope's raw documents as plain values, for the surfaces that show what a file says (REQ-CONFIG-471). */
  readonly raw: Readonly<Record<ConfigScope, { readonly agents: PlainMap | null; readonly models: PlainMap | null }>>;
  readonly files: { global: ScopeFiles; workspace: ScopeFiles };
  /** The merged plain document the typed sections were read from — ADR-0037's Tier B overlays THIS and resolves again. */
  readonly merged: PlainMap;
  /** ADR-0036 "Revisit if": the load's time on the caller's monotonic clock; null when none was supplied. */
  readonly loadMs: number | null;
}

type ReadFile =
  | { readonly state: 'absent' }
  | { readonly state: 'read'; readonly parsed: ParsedConfig; readonly plain: PlainMap | null }
  | { readonly state: 'fatal'; readonly report: Omit<FatalLoadReport, 'lines' | 'scope'> };

/** REQ-CONFIG-016/017/018/019/462: absent and empty are silent; markup, encoding and top-level faults abort. */
function readConfigFile(path: string): ReadFile {
  let bytes: Buffer;
  try {
    bytes = readFileSync(path);
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return { state: 'absent' };
    if (code === 'EISDIR') return { state: 'fatal', report: { file: path, path: '', message: 'the path is a directory, not a configuration file', kind: 'unreadable' } };
    return { state: 'fatal', report: { file: path, path: '', message: `the file could not be read: ${String(cause)}`, kind: 'unreadable' } };
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return { state: 'fatal', report: { file: path, path: '', message: 'the file must be UTF-8 text (its bytes cannot be decoded as UTF-8; this is not a markup fault)', kind: 'encoding' } };
  }
  const parsed = parseConfig(text);
  if (!parsed.ok) return { state: 'fatal', report: { file: path, path: '', message: `YAML syntax error: ${parsed.error.reason}`, kind: 'syntax' } };
  if (parsed.value.root === null) {
    if (parsed.value.topLevelType === 'null') return { state: 'read', parsed: parsed.value, plain: null };
    return { state: 'fatal', report: { file: path, path: '', message: `top-level content must be a mapping, got ${parsed.value.topLevelType}`, kind: 'top-level' } };
  }
  const plain = plainOf(parsed.value.root);
  return { state: 'read', parsed: parsed.value, plain: isPlainMap(plain) ? plain : null };
}

/** REQ-CONFIG-013: best-effort, idempotent, atomic enough for its purpose; every failure swallowed. */
export function keepScopeDirIgnored(workspaceRoot: string): void {
  try {
    const file = join(workspaceRoot, '.gitignore');
    let existing = '';
    try { existing = readFileSync(file, 'utf8'); } catch (cause) { if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') return; }
    const ignored = existing.split(/\r?\n/).some((line) => line.trim().replace(/\/$/, '') === WORKSPACE_SCOPE_DIR);
    if (ignored) return;
    if (existing === '') writeFileSync(file, `${WORKSPACE_SCOPE_DIR}/\n`, 'utf8');
    else appendFileSync(file, `${existing.endsWith('\n') ? '' : '\n'}${WORKSPACE_SCOPE_DIR}/\n`, 'utf8');
  } catch { /* REQ-CONFIG-013: never fails the load */ }
}

/** The separate parse of `rotaris.delegation_strategy`: workspace only, no merge, no schema; anything else leaves the default. */
export function readDelegationStrategy(parsed: ParsedConfig | null): DelegationStrategy {
  if (!parsed) return 'orchestrator';
  const section = triOf(parsed.root, 'rotaris');
  if (section.kind !== 'value') return 'orchestrator';
  const map = asMap(section.value);
  if (!map) return 'orchestrator';
  const value = triOf(map, 'delegation_strategy');
  const text = value.kind === 'value' ? vocabularyText(value.value) : null;
  return text !== null && (DELEGATION_STRATEGIES as readonly string[]).includes(text) ? (text as DelegationStrategy) : 'orchestrator';
}

export interface LoadOptions {
  readonly globalDir: string;
  readonly workspaceRoot: string;
  /** Configured tool servers by name for referential validation; none in this build. */
  readonly toolServers?: readonly string[];
  /** The built-in hook layer (REQ-HOOKS-013); none ship (REQ-HOOKS-009). */
  readonly hookDefaults?: HooksLayer;
  /** REQ-CONFIG-013's side effect, on by default; a read-only surface may switch it off. */
  readonly keepIgnored?: boolean;
  /** ADR-0006: time comes from the caller's monotonic clock, never a global. */
  readonly now?: () => number;
}

function readSlots(top: PlainMap, sink: ProblemSink): { slots: Record<ModelSlot, string | null>; thinking: Record<ModelSlot, ReasoningLevel | null> } {
  const r = new FieldReader(top, '', sink);
  const slots = {} as Record<ModelSlot, string | null>;
  const thinking = {} as Record<ModelSlot, ReasoningLevel | null>;
  for (const slot of MODEL_SLOTS) {
    slots[slot] = r.stringOrNull(slot);
    const key = thinkingKeyOf(slot);
    const raw = top[key];
    if (raw === undefined || raw === null) { thinking[slot] = null; continue; }
    const text = vocabularyString(raw);
    if (text !== null && (REASONING_LEVELS as readonly string[]).includes(text)) thinking[slot] = text as ReasoningLevel;
    else { sink.errors.push({ path: key, message: `'${text ?? typeName(raw)}' is not a reasoning level; expected one of: ${REASONING_LEVELS.join(', ')}` }); thinking[slot] = null; }
  }
  return { slots, thinking };
}

export function loadConfiguration(opts: LoadOptions): Result<LoadedConfiguration, FatalLoadReport> {
  const started = opts.now?.() ?? null;
  const files = scopeFiles(opts.globalDir, opts.workspaceRoot);
  if (opts.keepIgnored !== false) keepScopeDirIgnored(opts.workspaceRoot);

  const layers: Layer[] = [{ source: 'built-in defaults', value: builtInDefaults() }];
  const hookLayers: HooksLayer[] = [opts.hookDefaults ?? EMPTY_HOOKS_LAYER('default')];
  const raw: Record<ConfigScope, { agents: PlainMap | null; models: PlainMap | null }> = { global: { agents: null, models: null }, workspace: { agents: null, models: null } };
  const problems: (Problem & { file: string; scope: ConfigScope })[] = [];
  let workspaceAgents: ParsedConfig | null = null;

  for (const scope of [files.global, files.workspace]) {
    const agents = readConfigFile(scope.agents);
    if (agents.state === 'fatal') return err({ ...agents.report, scope: scope.scope, lines: renderProblems([{ path: agents.report.path, message: agents.report.message }]) });
    if (agents.state === 'read') {
      raw[scope.scope].agents = agents.plain;
      if (scope.scope === 'workspace') workspaceAgents = agents.parsed;
      if (agents.plain) layers.push({ source: scope.agents, value: canonicaliseRoles(agents.plain) });
      // REQ-CONFIG-233: hook faults are fatal; the hooks reader keeps its tri-state list semantics per scope.
      const hooks = readHooksSection(agents.parsed, scope.scope);
      if (!hooks.ok) problems.push(...hooks.error.map((p) => ({ ...p, file: scope.agents, scope: scope.scope })));
      else hookLayers.push(hooks.value);
    }
    const models = readConfigFile(scope.models);
    if (models.state === 'fatal') return err({ ...models.report, scope: scope.scope, lines: renderProblems([{ path: models.report.path, message: models.report.message }]) });
    if (models.state === 'read' && models.plain) {
      raw[scope.scope].models = models.plain;
      // REQ-CONFIG-004/005: only `models:` is consumed, overlaying that scope's agents.yaml block per field; other keys are ignored silently.
      if (models.plain['models'] !== undefined) layers.push({ source: scope.models, value: { models: models.plain['models'] } });
    }
  }

  const merged = mergeLayers(layers);
  const hooks = mergeHooks(hookLayers);
  return resolveMerged(merged.value, {
    workspaceRoot: opts.workspaceRoot, hooks, files, raw, problems, delegationStrategy: readDelegationStrategy(workspaceAgents),
    mergeWarnings: merged.warnings.map((w) => `${w.source}: ${w.message}`), ...(opts.toolServers ? { toolServers: opts.toolServers } : {}),
    loadMs: started === null || !opts.now ? null : opts.now() - started,
  });
}

export interface ResolveContext {
  readonly workspaceRoot: string;
  readonly hooks: HooksResolved;
  readonly files: { global: ScopeFiles; workspace: ScopeFiles };
  readonly raw: Readonly<Record<ConfigScope, { readonly agents: PlainMap | null; readonly models: PlainMap | null }>>;
  /** Fatal problems found before the merge (the hooks section's), each with its file. */
  readonly problems?: readonly (Problem & { file: string; scope: ConfigScope })[];
  readonly delegationStrategy: DelegationStrategy;
  readonly mergeWarnings?: readonly string[];
  readonly toolServers?: readonly string[];
  readonly loadMs: number | null;
}

/**
 * The passes over a merged document in REQ-CONFIG-035..037's order: the typed sections (schema, fatal),
 * tier aliases and reasoning synthesis, then the referential list. The load calls this once; ADR-0037's
 * Tier B calls it again over the same document with the live state overlaid — "exactly as the loader
 * does" by construction, not by two implementations agreeing.
 */
export function resolveMerged(top: PlainMap, ctx: ResolveContext): Result<LoadedConfiguration, FatalLoadReport> {
  const files = ctx.files;
  const problems = ctx.problems ?? [];
  const sink: ProblemSink = { errors: [], warnings: [] };
  const { slots, thinking } = readSlots(top, sink);
  const defaultPersona = new FieldReader(top, '', sink).string('default_persona', 'orchestrator');
  const worktree = new FieldReader(top, '', sink).string('worktree_storage_subpath', 'worktrees');
  const injectAgentsMd = new FieldReader(top, '', sink).bool('inject_agents_md', true);
  const models = readModelsSection(top['models'], sink);
  const personas = readPersonasSection(top['personas'], sink);
  const runtime = readRuntimeSection(top['runtime'], sink);
  const compressor = readCompressorSection(top['compressor'], sink);
  const circuitBreaker = readCircuitBreakerSection(top['circuit_breaker'], sink);

  const fatal = [...problems, ...sink.errors.map((p) => ({ ...p, file: files.workspace.agents, scope: 'workspace' as const }))];
  if (fatal.length > 0) {
    const first = fatal[0]!;
    // A schema problem is found on the merged value; the workspace file is the one a user edits by default (REQ-CONFIG-463).
    return err({ file: first.file, scope: first.scope, path: first.path, message: first.message, kind: 'schema', lines: renderProblems(fatal) });
  }

  const draft = { slots, slotThinking: thinking, models, personas, compressorModel: compressor.model, circuitBreakerModel: circuitBreaker.model };
  const resolution = resolveSlotsAndReasoning(draft);
  const hooks = ctx.hooks;
  const referential = referentialMessages({ defaultPersona, slots: draft.slots, models: draft.models, personas: draft.personas, compressorModel: draft.compressorModel, ...(ctx.toolServers ? { toolServers: ctx.toolServers } : {}) });

  const warnings = [
    ...(ctx.mergeWarnings ?? []),
    ...sink.warnings.map((w) => `${w.path}: ${w.message}`),
    ...resolution.warnings,
  ];

  return ok({
    workspaceRoot: ctx.workspaceRoot,
    defaultPersona,
    slots: draft.slots,
    slotThinking: thinking,
    models: draft.models,
    personas: draft.personas,
    runtime,
    compressor: { ...compressor, model: draft.compressorModel },
    circuitBreaker: { ...circuitBreaker, model: draft.circuitBreakerModel },
    hooks,
    worktreeStorageSubpath: worktree,
    injectAgentsMd,
    delegationStrategy: ctx.delegationStrategy,
    resolvedPersonaModelTiers: resolution.resolvedPersonaModelTiers,
    warnings,
    referential,
    raw: ctx.raw,
    files,
    merged: top,
    loadMs: ctx.loadMs,
  });
}
