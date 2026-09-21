import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
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
import { readCheckpointsSection, type CheckpointsSection } from './sections/checkpoints.js';
import { readRequirementsSection, type RequirementsSection } from './sections/requirements.js'; // Part AP
import { readSkillsSection, type SkillsSection } from './sections/skills.js'; // ADR-0063
import { readInstructionsSection, type InstructionsSection } from './sections/instructions.js'; // PD-WORKSPACE-002
import { readDisplaySection, type DisplaySection } from './display-section.js';
import { readMcpServersSection } from './sections/mcp-servers.js';
import { readDiscoveryFiles, resolveMcpConfiguration, type BuiltinLaunch, type Diagnostic, type DiscoveredServers, type McpConfiguration } from './mcp/index.js';
import { CODE_INTELLIGENCE_MARKER_SEGMENTS } from './mcp/code-intelligence.js';
import { readCircuitBreakerSection, type CircuitBreakerSection } from './circuit-breaker-section.js';
import { FieldReader, typeName, vocabularyString, type Problem, type ProblemSink } from './sections/field.js';
import { resolveSlotsAndReasoning } from './slots.js';
import { referentialMessages, renderProblems, type FatalLoadReport } from './validate.js';
import { PROJECT_SETTINGS_FILE, readProjectSnapshot, snapshotLayer } from './project-settings.js';

/**
 * ADR-0036 alternative B, the whole loader: `loadConfiguration(globalDir, workspaceRoot)` — the entry point
 * takes NO database handle (the ADR's guard, in the signature) — reads the two scopes' four files fresh
 * (REQ-CONFIG-014), folds them under the four merge classes in REQ-CONFIG-031's order with the built-in
 * defaults copied first (REQ-CONFIG-032), runs the passes in REQ-CONFIG-035..037's order, and yields a
 * configuration that is already fully resolved. Layer 3 — the provider/model discovery snapshot
 * (REQ-CONFIG-034, `project_settings.yaml` in the global directory) — is folded since Part K; the
 * auto-discovered-server layer (REQ-CONFIG-033) is the two `mcp.json` files of REQ-MCP-017, read strictly read-only
 * and folded between the defaults and the global scope (REQ-MCP-025) since Part S.
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
  /** REQ-GIT-070..072 (Part P): the three checkpoint keys, `max_per_session` rejected at load below 1 (REQ-GIT-071). */
  readonly checkpoints: CheckpointsSection;
  /** REQ-CONFIG-183/190..198 (Part AP): the strict `requirements:` block — spec 08's queue, change and human-in-the-loop keys, and the run branch template. */
  readonly requirements: RequirementsSection;
  /** REQ-CHAT-166 (Part Z): the transcript's four display caps — the reader `SECTION_KEYS` declared and nothing stood behind. */
  readonly display: DisplaySection;
  /** REQ-CONFIG-166..169 (ADR-0063): the master switch and the two per-skill override maps — the second reader `SECTION_KEYS` declared with nothing behind it. */
  readonly skills: SkillsSection;
  /** PD-WORKSPACE-002: the per-file instruction on/off policy, keyed by stable file identity. */
  readonly instructions: InstructionsSection;
  readonly hooks: HooksResolved;
  readonly worktreeStorageSubpath: string;
  readonly injectAgentsMd: boolean;
  /** Outside the layered model (REQ-CONFIG-477 ground 1): a second lookup over the workspace document only. */
  readonly delegationStrategy: DelegationStrategy;
  /** REQ-CONFIG-071: computed, never serialised (REQ-CONFIG-072). */
  readonly resolvedPersonaModelTiers: Readonly<Record<string, TierAlias>>;
  /** REQ-CONFIG-034: the snapshot providers marked authenticated whose models and slots were folded in. */
  readonly authenticatedProviders: readonly string[];
  /** REQ-CONFIG-341: the slot values the snapshot layer supplied, so an editor can name `discovered` as an origin. */
  readonly discoveredSlots: Readonly<Partial<Record<ModelSlot, string>>>;
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
  /** ADR-0034 (Part S): the merged tool servers resolved at load — origins, commands, availability, environment, descriptions. */
  readonly mcp: McpConfiguration;
  /** What the MCP resolution was computed from, so ADR-0037's Tier B overlay resolves it again identically. */
  readonly mcpInputs: McpResolveContext;
}

/** The inputs of the load-time MCP stages that are not in the merged document. */
export interface McpResolveContext {
  readonly discovered: DiscoveredServers;
  readonly discoveryDiagnostics: readonly Diagnostic[];
  readonly globalDir: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly platform: NodeJS.Platform;
  readonly onPath?: ((executable: string) => boolean) | undefined;
  readonly readFile?: ((path: string) => string | null) | undefined;
  readonly builtinLaunch?: BuiltinLaunch | null | undefined;
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

/**
 * REQ-CONFIG-013 / REQ-MCP-089: best-effort, idempotent, atomic enough for its purpose; every failure swallowed.
 * Two directories, not one, since the merge of Parts T and U (2026-09-06): the bundled code-intelligence runtime
 * creates its per-project marker directory in the workspace root whenever it starts with a project (ADR-0035's
 * note, finding 5), and with the entry enabled by default every first run left an untracked directory in the
 * user's repository — the Git proof's isolated launch found the base tree dirty. The reading taken, flagged for the
 * owner: the marker's directory is ignored by the same amendment as the product's own scope directory; the name
 * comes from the generated manifest (REQ-MCP-116), never a literal.
 */
export function keepScopeDirIgnored(workspaceRoot: string): void {
  try {
    const file = join(workspaceRoot, '.gitignore');
    let existing = '';
    try { existing = readFileSync(file, 'utf8'); } catch (cause) { if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') return; }
    const lines = existing.split(/\r?\n/).map((line) => line.trim().replace(/\/$/, ''));
    const missing = [WORKSPACE_SCOPE_DIR, CODE_INTELLIGENCE_MARKER_SEGMENTS[0]!].filter((dir) => !lines.includes(dir));
    if (missing.length === 0) return;
    const block = missing.map((dir) => `${dir}/\n`).join('');
    if (existing === '') writeFileSync(file, block, 'utf8');
    else appendFileSync(file, `${existing.endsWith('\n') ? '' : '\n'}${block}`, 'utf8');
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
  /** REQ-CONFIG-034: the snapshot's path; `<globalDir>/project_settings.yaml` by default, `null` folds no snapshot. */
  readonly snapshotPath?: string | null;
  /** REQ-MCP-017/087: the process environment the discovery locations and `${VAR}` expansion read; `process.env` by default. */
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly platform?: NodeJS.Platform;
  readonly home?: string;
  /** REQ-MCP-037: the PATH lookup; injectable so a test fixes the answer. */
  readonly onPath?: (executable: string) => boolean;
  /** REQ-MCP-027: the read-only reader for the discovery files and secrets.yaml; the filesystem by default. */
  readonly readFile?: (path: string) => string | null;
  /** REQ-MCP-033 / ADR-0035 (Part T): what the reserved token launches — the run host supplies the application's own executable. */
  readonly builtinLaunch?: BuiltinLaunch | null;
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
  const snapshotWarnings: string[] = [];
  let authenticatedProviders: readonly string[] = [];
  let discoveredSlots: Readonly<Partial<Record<ModelSlot, string>>> = {};
  // Layer 3 (REQ-CONFIG-031): the discovery snapshot; an invalid one is ignored with a warning (REQ-PROVIDER-091).
  const snapshotPath = opts.snapshotPath === undefined ? join(opts.globalDir, PROJECT_SETTINGS_FILE) : opts.snapshotPath;
  if (snapshotPath !== null) {
    const snap = readProjectSnapshot(snapshotPath, (w) => snapshotWarnings.push(`project settings snapshot: ${w}`));
    if (!snap.ok) snapshotWarnings.push(`Ignoring project settings snapshot: ${snap.error}`);
    else if (snap.value) {
      const folded = snapshotLayer(snap.value);
      authenticatedProviders = folded.authenticated;
      discoveredSlots = folded.slots;
      if (folded.layer) layers.push({ source: snapshotPath, value: folded.layer });
    }
  }
  // Layer 2 (REQ-CONFIG-033 / REQ-MCP-025): the discovered `mcp.json` servers, between the defaults and the global scope.
  const env = opts.env ?? process.env;
  const platform = opts.platform ?? process.platform;
  const discovered = readDiscoveryFiles({ workspaceRoot: opts.workspaceRoot, platform, env, home: opts.home ?? homedir(), ...(opts.readFile ? { read: opts.readFile } : {}) });
  const discoveredLayer: PlainMap = {};
  // Only what the file STATED enters the layer (never the filled defaults), so a discovered entry overlays a same-named
  // default field-wise (REQ-MCP-025) and a stated null never CLEARS a lower layer's field (REQ-CONFIG-053).
  for (const [name, plain] of Object.entries(discovered.value.stated)) discoveredLayer[name] = Object.fromEntries(Object.entries(plain).filter(([, v]) => v !== null && v !== undefined));
  if (Object.keys(discoveredLayer).length > 0) layers.push({ source: discovered.value.files[0]!, value: { mcp_servers: discoveredLayer } });
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
    mergeWarnings: [...snapshotWarnings, ...merged.warnings.map((w) => `${w.source}: ${w.message}`)], ...(opts.toolServers ? { toolServers: opts.toolServers } : {}),
    authenticatedProviders, discoveredSlots,
    loadMs: started === null || !opts.now ? null : opts.now() - started,
    mcp: { discovered: discovered.value, discoveryDiagnostics: discovered.diagnostics, globalDir: opts.globalDir, env, platform, onPath: opts.onPath, readFile: opts.readFile, builtinLaunch: opts.builtinLaunch },
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
  readonly authenticatedProviders?: readonly string[];
  readonly discoveredSlots?: Readonly<Partial<Record<ModelSlot, string>>>;
  readonly loadMs: number | null;
  readonly mcp: McpResolveContext;
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
  const checkpoints = readCheckpointsSection(top['checkpoints'], sink);
  const requirements = readRequirementsSection(top['requirements'], sink); // Part AP
  const skills = readSkillsSection(top['skills'], sink); // ADR-0063
  const instructions = readInstructionsSection(top['instructions'], sink); // PD-WORKSPACE-002
  const display = readDisplaySection(top['display'], sink);
  // REQ-MCP-002: every defect of a YAML-scope server entry is fatal and every one is reported (the discovered entries were validated before the merge).
  const mcpServers = readMcpServersSection(top['mcp_servers'], sink);

  const fatal = [...problems, ...sink.errors.map((p) => ({ ...p, file: files.workspace.agents, scope: 'workspace' as const }))];
  if (fatal.length > 0) {
    const first = fatal[0]!;
    // A schema problem is found on the merged value; the workspace file is the one a user edits by default (REQ-CONFIG-463).
    return err({ file: first.file, scope: first.scope, path: first.path, message: first.message, kind: 'schema', lines: renderProblems(fatal) });
  }

  const draft = { slots, slotThinking: thinking, models, personas, compressorModel: compressor.model, circuitBreakerModel: circuitBreaker.model };
  const resolution = resolveSlotsAndReasoning(draft);
  const hooks = ctx.hooks;
  // REQ-MCP-026: "yaml" when any YAML scope named the server; the raw documents say which did.
  const yamlNamed = new Set<string>();
  for (const scope of ['global', 'workspace'] as const) { const m = ctx.raw[scope].agents?.['mcp_servers']; if (isPlainMap(m)) for (const k of Object.keys(m)) yamlNamed.add(k); }
  const mcp = resolveMcpConfiguration({ servers: mcpServers, yamlNamed, discovered: ctx.mcp.discovered, workspaceRoot: ctx.workspaceRoot, globalDir: ctx.mcp.globalDir, env: ctx.mcp.env, platform: ctx.mcp.platform, ...(ctx.mcp.onPath ? { onPath: ctx.mcp.onPath } : {}), ...(ctx.mcp.readFile ? { readFile: ctx.mcp.readFile } : {}), builtinLaunch: ctx.mcp.builtinLaunch ?? null });
  // REQ-MCP-103/105: the server set the referential stage validates against is the merged map (ADR-0016 consequence 3).
  const referential = referentialMessages({ defaultPersona, slots: draft.slots, models: draft.models, personas: draft.personas, compressorModel: draft.compressorModel, toolServers: ctx.toolServers ?? Object.keys(mcp.servers), authenticatedProviders: ctx.authenticatedProviders ?? [] });

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
    checkpoints,
    requirements, // Part AP
    skills, // ADR-0063
    instructions, // PD-WORKSPACE-002
    display,
    hooks,
    worktreeStorageSubpath: worktree,
    injectAgentsMd,
    delegationStrategy: ctx.delegationStrategy,
    resolvedPersonaModelTiers: resolution.resolvedPersonaModelTiers,
    authenticatedProviders: ctx.authenticatedProviders ?? [],
    discoveredSlots: ctx.discoveredSlots ?? {},
    warnings,
    referential,
    raw: ctx.raw,
    files,
    merged: top,
    loadMs: ctx.loadMs,
    mcp: { ...mcp, diagnostics: [...ctx.mcp.discoveryDiagnostics, ...mcp.diagnostics] },
    mcpInputs: ctx.mcp,
  });
}
