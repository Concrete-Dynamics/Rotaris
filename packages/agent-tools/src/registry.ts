import { PUBLIC_TOOL_NAMES, TOOL_ALIASES, type PublicToolName } from '@rotaris/contracts';

/**
 * ADR-0016: the tool registry is ONE frozen table from public name to the three facets of
 * REQ-TOOLS-001, with the alias table beside it and the two classes of REQ-TOOLS-007 as literal sets.
 * A name outside the table carries no declaration; the accessor is direction-aware
 * (`grantsOn` / `withholdsOn`), so REQ-TOOLS-001's fail-closed reading lives in the type of the query
 * rather than in a reviewer's memory. Narrowing is a fold over four ordered stage functions that can
 * only remove (REQ-TOOLS-006); one resolution feeds both the prompt listing and the callable set
 * (REQ-TOOLS-010, REQ-TOOLS-167).
 */
export type Facet = 'readsWorkspaceFiles' | 'writesWorkspaceFiles' | 'runsCommands';

export interface Declaration {
  readonly readsWorkspaceFiles: boolean;
  readonly writesWorkspaceFiles: boolean;
  readonly runsCommands: boolean;
}

const d = (r: boolean, w: boolean, c: boolean): Declaration => Object.freeze({ readsWorkspaceFiles: r, writesWorkspaceFiles: w, runsCommands: c });

/** REQ-TOOLS-001: the product's single definition of the per-tool declarations. */
export const DECLARATIONS: Readonly<Record<PublicToolName, Declaration>> = Object.freeze({
  ask_questions: d(false, false, false),
  delegate: d(false, false, false),
  background_output: d(false, false, false),
  wait_for_tasks: d(false, false, false),
  haet: d(true, true, false),
  haet_edit: d(true, true, false),
  haet_read: d(true, false, false),
  read_file: d(true, false, false),
  write_file: d(true, true, false),
  terminal: d(false, false, true),
  git_commit: d(true, true, false),
  todo: d(false, false, false),
  fetch: d(false, false, false),
  grep: d(true, false, false),
  glob: d(true, false, false),
  artifact_read: d(false, false, false),
  artifact_list: d(false, false, false),
  artifact_write: d(false, false, false),
});

/** REQ-TOOLS-007: the read-only class, exactly. */
export const READ_ONLY_CLASS: ReadonlySet<PublicToolName> = new Set<PublicToolName>([
  'grep', 'glob', 'fetch', 'haet_read', 'read_file', 'artifact_read', 'artifact_list', 'artifact_write',
]);
/** REQ-TOOLS-007: the network class, exactly. */
export const NETWORK_CLASS: ReadonlySet<PublicToolName> = new Set<PublicToolName>(['fetch']);

/** REQ-TOOLS-006: `coordinator_only` removes exactly these five and nothing else. */
export const COORDINATOR_REMOVES: ReadonlySet<PublicToolName> = new Set<PublicToolName>(['terminal', 'write_file', 'haet_edit', 'haet', 'git_commit']);

/** REQ-TOOLS-014: never gated; they live in the gate, not in the table (ADR-0016 c.4). */
export const META_TOOL_NAMES: ReadonlySet<string> = new Set(['finish', 'finishtool', 'think', 'thinktool']);

export function isPublicToolName(name: string): name is PublicToolName {
  return (PUBLIC_TOOL_NAMES as readonly string[]).includes(name);
}

/** The alias resolves to its target; any other name is itself. */
export function canonicalToolName(name: string): string {
  return TOOL_ALIASES[name] ?? name;
}

/** A rule that GRANTS on a facet: an undeclared tool declares nothing. */
export function grantsOn(name: string, facet: Facet): boolean {
  const c = canonicalToolName(name);
  return isPublicToolName(c) ? DECLARATIONS[c][facet] : false;
}

/** A rule that WITHHOLDS on a facet: an undeclared tool declares all three. */
export function withholdsOn(name: string, facet: Facet): boolean {
  const c = canonicalToolName(name);
  return isPublicToolName(c) ? DECLARATIONS[c][facet] : true;
}

export type NarrowingControl = 'run_allow_list' | 'coordinator_only' | 'read_only' | 'tool_restrictions';

export interface NarrowingControls {
  /** REQ-TOOLS-006 (1): per-run, orchestrator only; absent narrows nothing. */
  readonly runAllowList?: readonly string[] | null;
  readonly coordinatorOnly?: boolean;
  readonly readOnly?: boolean;
  /** REQ-TOOLS-006 (4): a name mapped to `false` is removed. */
  readonly toolRestrictions?: Readonly<Record<string, boolean>> | null;
}

export interface Removal {
  readonly tool: string;
  readonly control: NarrowingControl | 'prerequisite';
  readonly reason?: string;
}

export interface Narrowed {
  readonly tools: readonly string[];
  readonly removals: readonly Removal[];
  /** REQ-TOOLS-006: allow-list names the persona never declared, logged once for the run. */
  readonly ignoredAllowListNames: readonly string[];
}

type Stage = (tools: readonly string[]) => readonly string[];

/** REQ-TOOLS-005: declaring `delegate` surfaces the three delegation tools. */
export function expandDeclared(declared: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of declared) {
    const n = raw.trim();
    if (n === '' || out.includes(n)) continue;
    out.push(n);
    if (n === 'delegate') for (const extra of ['background_output', 'wait_for_tasks']) if (!out.includes(extra)) out.push(extra);
  }
  return out;
}

/**
 * The fold. Each stage returns a subset of its input (asserted in tests); no stage adds a tool.
 * `isOrchestrator` says whether stage 1 applies at all (it binds the orchestrator persona alone).
 */
export function narrow(declared: readonly string[], controls: NarrowingControls, isOrchestrator: boolean): Narrowed {
  const removals: Removal[] = [];
  const ignored: string[] = [];
  const stages: readonly [NarrowingControl, Stage][] = [
    ['run_allow_list', (tools) => {
      const list = controls.runAllowList;
      if (!isOrchestrator || !list) return tools;
      const allow = new Set(list.map(canonicalToolName));
      for (const n of list) if (!tools.map(canonicalToolName).includes(canonicalToolName(n))) ignored.push(n);
      return tools.filter((t) => allow.has(canonicalToolName(t)));
    }],
    ['coordinator_only', (tools) => (controls.coordinatorOnly ? tools.filter((t) => !COORDINATOR_REMOVES.has(t as PublicToolName)) : tools)],
    ['read_only', (tools) => (controls.readOnly ? tools.filter((t) => READ_ONLY_CLASS.has(canonicalToolName(t) as PublicToolName)) : tools)],
    ['tool_restrictions', (tools) => {
      const r = controls.toolRestrictions;
      if (!r) return tools;
      return tools.filter((t) => r[t] !== false && r[canonicalToolName(t)] !== false);
    }],
  ];
  let tools: readonly string[] = expandDeclared(declared);
  for (const [control, stage] of stages) {
    const next = stage(tools);
    for (const t of tools) if (!next.includes(t)) removals.push({ tool: t, control });
    tools = next;
  }
  return { tools, removals, ignoredAllowListNames: ignored };
}

/** REQ-TOOLS-004: stable, documented reason codes. */
export type PrerequisiteReason =
  | 'delegation_runtime_absent'
  | 'user_prompt_channel_absent'
  | 'artifact_store_absent'
  | 'artifact_publish_not_granted'
  | 'terminal_backend_absent'
  | 'executor_absent'
  | 'plugin_unloadable';

export interface Prerequisites {
  readonly delegationRuntime: boolean;
  readonly userPromptChannel: boolean;
  readonly artifactStore: boolean;
  readonly canPublishArtifacts: boolean;
  readonly terminalBackend: boolean;
  /** The executors this build actually registers; a declared name without one is removed. */
  readonly executors: ReadonlySet<string>;
}

const DELEGATION = new Set(['delegate', 'background_output', 'wait_for_tasks']);
const ARTIFACTS = new Set(['artifact_read', 'artifact_list', 'artifact_write']);

export function removeUnmet(tools: readonly string[], p: Prerequisites): { tools: string[]; removals: Removal[] } {
  const kept: string[] = [];
  const removals: Removal[] = [];
  const drop = (tool: string, reason: PrerequisiteReason) => removals.push({ tool, control: 'prerequisite', reason });
  for (const t of tools) {
    const c = canonicalToolName(t);
    if (DELEGATION.has(c) && !p.delegationRuntime) drop(t, 'delegation_runtime_absent');
    else if (c === 'ask_questions' && !p.userPromptChannel) drop(t, 'user_prompt_channel_absent');
    else if (ARTIFACTS.has(c) && !p.artifactStore) drop(t, 'artifact_store_absent');
    else if (c === 'artifact_write' && !p.canPublishArtifacts) drop(t, 'artifact_publish_not_granted');
    else if (c === 'terminal' && !p.terminalBackend) drop(t, 'terminal_backend_absent');
    else if (!p.executors.has(c)) drop(t, 'executor_absent');
    else kept.push(t);
  }
  return { tools: kept, removals };
}

export interface PersonaToolConfig {
  readonly name: string;
  readonly tools: readonly string[];
  readonly coordinatorOnly?: boolean;
  readonly readOnly?: boolean;
  readonly toolRestrictions?: Readonly<Record<string, boolean>> | null;
}

export interface ResolvedToolSet {
  /** In declaration order; the ONE value the prompt listing and the callable set both read. */
  readonly tools: readonly string[];
  readonly removals: readonly Removal[];
  readonly ignoredAllowListNames: readonly string[];
}

/** REQ-TOOLS-002: validation of a persona's `tools:` entries, with the MCP sentence when asked for. */
export function validateDeclared(persona: string, declared: readonly string[], configuredMcpServers: ReadonlySet<string> = new Set()): string[] {
  const errors: string[] = [];
  for (const entry of declared) {
    if (isPublicToolName(entry)) continue;
    let msg = `Persona '${persona}' declares tool '${entry}', which is not a public tool name. Accepted names: ${PUBLIC_TOOL_NAMES.join(', ')}.`;
    if (configuredMcpServers.has(entry)) msg += ` MCP servers are granted through mcp_servers, not tools.`;
    errors.push(msg);
  }
  return errors;
}

/** Runs once per agent construction; its single result feeds both readers (ADR-0016). */
export function resolveToolSet(persona: PersonaToolConfig, controls: { runAllowList?: readonly string[] | null }, prerequisites: Prerequisites, isOrchestrator: boolean): ResolvedToolSet {
  const narrowed = narrow(persona.tools, {
    runAllowList: controls.runAllowList ?? null,
    coordinatorOnly: persona.coordinatorOnly ?? false,
    readOnly: persona.readOnly ?? false,
    toolRestrictions: persona.toolRestrictions ?? null,
  }, isOrchestrator);
  const unmet = removeUnmet(narrowed.tools, prerequisites);
  return { tools: unmet.tools, removals: [...narrowed.removals, ...unmet.removals], ignoredAllowListNames: narrowed.ignoredAllowListNames };
}
