import { BUILT_IN_ROLE_NAMES, BUILT_IN_ROLE_TOOLS, isDelegationTarget, NOT_DELEGATION_TARGETS, ROLE_SPAWN_ALIASES, type BuiltInRoleName, type IntentGrant, type PermissionPreset } from '@rotaris/contracts';
import type { ModelRef, ThinkingLevel } from '@rotaris/model';
/**
 * Decision 2 of the plan: REQ-ORCH-028's thirteen roles and the two aliases as a BUILT-IN table, each
 * with a tool declaration and a short system prompt of our own authorship, until ADR-0036 loads
 * `agents.yaml`. The orchestrator is `coordinator_only` (REQ-ORCH-029) except under a `single` override,
 * which grants the direct-work bundle and withholds `delegate` from every role (REQ-ORCH-025).
 */
export interface Persona {
  readonly name: string;
  readonly tools: readonly string[];
  readonly coordinatorOnly: boolean;
  readonly readOnly: boolean;
  /**
   * REQ-CONFIG-106: the role's `can_publish_artifacts` — the grant without which a declared `artifact_write` is withheld
   * (REQ-TOOLS-150) and its removal recorded as `artifact_publish_not_granted` (REQ-TOOLS-004). False for every built-in role:
   * OQ-212, ruled 2026-10-07 under the owner's delegation (R-072), keeps publishing a grant a workspace's configuration makes.
   */
  readonly canPublishArtifacts: boolean;
  readonly systemPrompt: string;
  /** REQ-ORCH-028: a role whose tools write workspace files holds implementation delegations. */
  readonly implementer: boolean;
  /** REQ-CONFIG-098: the role's own model once configuration resolves it; absent means the run's model. */
  readonly modelRef?: ModelRef | undefined;
  /**
   * REQ-CONFIG-094: the `models:` key `modelRef` was resolved from, a loader-owned synthetic copy unwrapped to the entry
   * it was copied from — the key a child of this role is recorded and capped under. Absent with `modelRef`.
   */
  readonly modelKey?: string | undefined;
  readonly thinking?: ThinkingLevel | undefined;
  /** REQ-CONFIG-110 / REQ-ORCH-144: the role's own `fallback_model`; absent means the run-level slot (REQ-CONFIG-065). */
  readonly fallbackModel?: ModelRef | undefined;
  readonly fallbackThinking?: ThinkingLevel | undefined;
  /**
   * REQ-CONFIG-109 / REQ-TOOLS-048/074: the role's own `permission_mode` pin. It wins over a session-level
   * override unless that override is at least as restrictive as it (REQ-TOOLS-047's order), and it is what
   * a loosening mid-session change leaves alone. Absent means the role takes the session's mode.
   */
  readonly permissionMode?: PermissionPreset | undefined;
  /**
   * REQ-CONFIG-108: the role's `stall_timeout`, which substitutes for `runtime.child_stall_timeout` on this role's
   * children and no others. Read by PD-ORCH-004's progress rule; absent means the run's value.
   */
  readonly stallTimeoutMs?: number | undefined;
  /**
   * REQ-CONFIG-107: the role's `skip_auto_sibling_context` — the persona-level setting REQ-TOOLS-152 names, which forces the
   * omission `suppress_auto_context` asks for on every child of this role. Absent means false: the index is given.
   */
  readonly skipAutoSiblingContext?: boolean | undefined;
  /**
   * REQ-CONFIG-103 / REQ-TOOLS-006 (4): the role's `tool_restrictions` — role names (REQ-CONFIG-062) mapped to allowed-tool
   * lists. Absent for the built-in table, which restricts nothing. Read through `toolRestrictionsFor`.
   */
  readonly toolRestrictions?: Readonly<Record<string, readonly string[]>> | undefined;
  /**
   * REQ-CONFIG-101 as OQ-229 reads it (ruled 2026-10-07 under R-072): the role's `delegates_to` when it names any persona — the
   * delegation targets an agent of this role may delegate to. Absent, or empty, narrows nothing; the built-in table carries none.
   */
  readonly delegatesTo?: readonly string[] | undefined;
}

/**
 * REQ-TOOLS-006 (4) under OQ-145's reading, confirmed 2026-10-06 by R-071: the allowed-tool lists that bind an agent of `persona` — the entry its own
 * persona's map gives its name, and the entry the map of the persona that DELEGATED it gives that name. The entry agent
 * has no parent agent. A tool survives only the lists that name it (`restrictionsAllow`); an empty answer restricts
 * nothing (REQ-CONFIG-103: "an entity absent from the map is unrestricted").
 *
 * The reason the map narrowed nothing, kept beside its replacement (acceptance finding A4, R-067): the loader parsed it,
 * the registry held a stage for a map from a tool to `false`, and the persona the run host built carried no such field,
 * so no configured restriction ever reached a grant.
 */
export function toolRestrictionsFor(persona: Pick<Persona, 'name' | 'toolRestrictions'>, parentPersona?: Pick<Persona, 'toolRestrictions'> | null): readonly (readonly string[])[] {
  const lists: (readonly string[])[] = [];
  const own = persona.toolRestrictions?.[persona.name];
  if (own) lists.push(own);
  const theirs = parentPersona?.toolRestrictions?.[persona.name];
  if (theirs) lists.push(theirs);
  return lists;
}

export interface McpGrantEvidence {
  readonly granted: Readonly<Record<string, readonly string[]>>;
  readonly servers: readonly { readonly name: string; readonly transport: string; readonly origin: string; readonly fate: 'connected' | 'dropped'; readonly reason?: string }[];
}
export const EMPTY_MCP_EVIDENCE: McpGrantEvidence = Object.freeze({ granted: {}, servers: [] });

/**
 * REQ-MCP-065 with REQ-TOOLS-006: the grant an agent's tool port put in force — the native tools its one resolution kept
 * after the controls, and its MCP evidence: the tools each carried server grants it after `read_only`, the `restricted`
 * preset, `tool_restrictions` and the plan gate, and every carried server's fate (REQ-MCP-114). A child's row records it
 * once its port is ready (`ToolPort.grant`). Until 2026-10-01 the row recorded, at spawn, the persona's declared tools and
 * its MCP surface before any control (`docs/defects/fixed/a-childs-recorded-grant-is-its-declared-tools-not-the-narrowed-set.md`).
 */
export interface AgentGrant {
  readonly tools: readonly string[];
  readonly mcp: McpGrantEvidence;
}

/** ADR-0036: the configured `personas:` overlaid on the built-in table, resolved per run by the root. */
export interface PersonaResolver {
  /** Every persona of the configuration, a reserved one included: the classifier, the entry role and resumes read it. */
  readonly resolve: (name: string) => { readonly persona: Persona; readonly alias: string | null } | null;
  /**
   * OQ-228 (ruled 2026-10-07 under R-072): the delegation targets — every persona of the configuration but the three the
   * specification reserves (`NOT_DELEGATION_TARGETS`). Named `knownRoles` until the ruling, when it was every `personas:` key and
   * the catalogue, the ledger's rejection and the write-scope refusal's writers all read it unfiltered (finding P5).
   */
  readonly delegationTargets: () => readonly string[];
}

/**
 * OQ-228 and OQ-229 (ruled 2026-10-07 under R-072): the personas an agent of `caller`'s persona may delegate to — the resolver's
 * delegation targets (the built-in table's where none resolved), narrowed to the caller's `delegates_to` when that names any.
 * `delegate`'s catalogue, admission, the ledger and the write-scope refusal's writers all read this one list.
 */
export function delegationTargetsFor(resolver: PersonaResolver | null | undefined, caller?: Pick<Persona, 'delegatesTo'> | null): readonly string[] {
  const all = resolver ? resolver.delegationTargets() : ROLE_VOCABULARY.filter(isDelegationTarget);
  const list = caller?.delegatesTo;
  return list !== undefined && list.length > 0 ? all.filter((n) => list.includes(n)) : all;
}

/** REQ-ORCH-034: the aliases whose target is among `targets`, as `<alias>-><target>`, resolved as admission resolves them. */
export function aliasesAmong(resolver: PersonaResolver | null | undefined, targets: readonly string[]): readonly { readonly alias: string; readonly target: string }[] {
  return Object.keys(ROLE_ALIASES).flatMap((alias) => {
    const r = resolver ? resolver.resolve(alias) : resolveRole(alias);
    return r !== null && targets.includes(r.persona.name) ? [{ alias, target: r.persona.name }] : [];
  });
}

/** REQ-ORCH-034's list after every refusal of a persona: the caller's targets and the aliases among them. */
function knownTargetsSentence(resolver: PersonaResolver | null | undefined, caller: Pick<Persona, 'name' | 'delegatesTo'> | null | undefined): string {
  const targets = delegationTargetsFor(resolver, caller);
  if (targets.length === 0) return `${caller?.name ?? 'This agent'} can delegate to no persona.`;
  const aliases = aliasesAmong(resolver, targets);
  return `Known personas: ${targets.join(', ')}. Supported aliases: ${aliases.length > 0 ? aliases.map((a) => `${a.alias}->${a.target}`).join(', ') : 'none'}.`;
}

export type DelegationTargetResolution =
  | { readonly ok: true; readonly persona: Persona; readonly alias: string | null }
  | { readonly ok: false; readonly reason: string };

/**
 * OQ-228 and OQ-229 (ruled 2026-10-07 under R-072), building REQ-ORCH-034 and REQ-ORCH-038: the persona a delegation names,
 * resolved alias first, or the refusal, in this order — a name no persona answers to; a persona the product runs itself (one of
 * `NOT_DELEGATION_TARGETS`, built in or configured); a persona outside the caller's non-empty `delegates_to`. Every refusal lists
 * the caller's targets and the aliases among them. `resolveRole` and `PersonaResolver.resolve` are unchanged: the classifier, the
 * entry role, a parent's persona, PD-ORCH-005's resumes and a `session_id` follow-up still resolve every persona.
 */
export function resolveDelegationTarget(resolver: PersonaResolver | null | undefined, name: string, caller?: Pick<Persona, 'name' | 'delegatesTo'> | null): DelegationTargetResolution {
  const resolved = resolver ? resolver.resolve(name) : resolveRole(name);
  if (resolved === null) return { ok: false, reason: `Unknown persona '${name}'. ${knownTargetsSentence(resolver, caller)}` };
  const target = resolved.persona.name;
  const named = resolved.alias !== null ? `'${name}' (alias of '${target}')` : `'${name}'`;
  if (!isDelegationTarget(target)) {
    return { ok: false, reason: `${named} is a persona the product runs itself (${NOT_DELEGATION_TARGETS[target]!}); it is not a delegation target. ${knownTargetsSentence(resolver, caller)}` };
  }
  const list = caller?.delegatesTo;
  if (list !== undefined && list.length > 0 && !list.includes(target)) {
    return { ok: false, reason: `${named} is not a persona ${caller?.name ?? 'this agent'} may delegate to: its delegates_to lists ${list.join(', ')}. ${knownTargetsSentence(resolver, caller)}` };
  }
  return { ok: true, persona: resolved.persona, alias: resolved.alias };
}

/*
 * The built-in roles' tool DECLARATIONS — the read group, the write group, delegation and `ask_questions`, with the
 * reasons each group holds what it holds — live in `@rotaris/contracts` (`BUILT_IN_ROLE_TOOLS`, `roles.ts`) since
 * live-run finding K1 (R-067, 2026-09-29), so the configuration loader's role view names the same declaration this table
 * does and a surface can let it stand in (REQ-MONITOR-060). The prompts and the flags stay here.
 */

/** REQ-ORCH-028: a role whose tools write workspace files, or run commands, holds implementation delegations. */
const IMPLEMENTER_TOOLS: ReadonlySet<string> = new Set(['write_file', 'haet_edit', 'haet', 'terminal']);

function persona(name: string, tools: readonly string[], prompt: string, extra: Partial<Persona> = {}): Persona {
  return { name, tools, coordinatorOnly: false, readOnly: false, canPublishArtifacts: false, systemPrompt: prompt, implementer: tools.some((t) => IMPLEMENTER_TOOLS.has(t)), ...extra };
}

export const ROLE_VOCABULARY = BUILT_IN_ROLE_NAMES;
export type RoleName = BuiltInRoleName;

/** REQ-ORCH-034 / REQ-TOOLS-152: the two aliases, resolved only when the target exists (the vocabulary is contracts'). */
export const ROLE_ALIASES: Readonly<Record<string, RoleName>> = ROLE_SPAWN_ALIASES;

/**
 * REQ-ORCH-029: the orchestrator's built-in instructions while it coordinates — every run whose entry role holds no
 * direct-work bundle. The todo clause here is instruction text, and REQ-ORCH-029 says no instruction text decides it: since
 * OQ-213 (ruled 2026-10-07, R-072) the run itself refuses a task's second work item until the coordinator has written its own
 * todo list (`Run.todoListOwed`), whatever this text or a configured `system_prompt` says.
 */
const ORCHESTRATOR_COORDINATING = (routing: string): string => `You are the orchestrator. You coordinate: you do not modify files or run commands yourself — every work item reaches a specialist through the delegate tool, and you keep a todo list current for work spanning more than one step. ${routing} Delegate in parallel where work is independent, wait only when you need a result, and finish by answering the user plainly with what was done. Where a choice is genuinely the user's to make and guessing would waste work, ask with ask_questions rather than assuming.`;

/**
 * OQ-202 as ruled (R-071, `PD-ORCH-006`): what the coordinator is told where its run grants it the direct-work bundle
 * (REQ-ORCH-016; the built-in mapping grants it on `explicit_trivial` and `single_file_change`, and a `single` override
 * on every intent, REQ-ORCH-025). It names no delegation, so it holds under `single`, where `delegate` is withheld, as
 * well as where the bundle still carries it. Its todo clause is held by the run since OQ-213 wherever the entry role still
 * coordinates (`Run.todoListOwed`); under `single` it stays instruction, the role being the worker (REQ-ORCH-025).
 */
export const DIRECT_WORK_INSTRUCTION = 'For this run you hold the tools to read and write files and run commands yourself: do the work with them rather than handing it to a specialist, keep a todo list current where the work spans more than one step, and finish by answering the user plainly with what was done.';
const ORCHESTRATOR_DIRECT_WORK = `You are the orchestrator. ${DIRECT_WORK_INSTRUCTION} Where a choice is genuinely the user's to make and guessing would waste work, ask with ask_questions rather than assuming.`;

/**
 * OQ-202 as ruled (R-071, `PD-ORCH-006`): the entry role's instructions for the run's grant. A coordinator granted the
 * direct-work bundle is told to do the work itself, so its instructions and its tool listing agree: the built-in
 * coordinating prompt is replaced by its direct-work form, and a prompt the configuration supplies (REQ-CONFIG-100's
 * `system_prompt`) is kept whole with the instruction after it. A run with no grant, and an entry role that is not a
 * coordinator, keep the prompt they were given.
 *
 * The reason this exists, kept beside it: until the ruling the coordinator was granted `write_file` and `terminal` on the
 * two simplest intents while its prompt said it did not modify files or run commands, and the model spent its first turn
 * on the contradiction before using them (14.5 s of a 32 s run, the default live run at `27a5127`, finding G2).
 */
export function entryInstructionsFor(systemPrompt: string, grant: IntentGrant | null, role: Pick<Persona, 'coordinatorOnly'> | null): string {
  if (grant !== 'direct-work' || role?.coordinatorOnly !== true) return systemPrompt;
  if (systemPrompt === BUILT_IN_ORCHESTRATOR_PROMPT) return ORCHESTRATOR_DIRECT_WORK;
  return systemPrompt === '' ? DIRECT_WORK_INSTRUCTION : `${systemPrompt}\n\n${DIRECT_WORK_INSTRUCTION}`;
}

/** REQ-ORCH-025: the heading the `swarm` layer opens with, so it is never read as part of the section before it (the MCP listing). */
export const SWARM_HEADING = '## Run override: `swarm`';

/**
 * REQ-ORCH-025: the one effect of a `swarm` run override — instruction text demanding maximum parallel delegation, with
 * REQ-ORCH-028's overlapping-ownership rule restated, since the override does not lift it. Nothing else changes: the
 * grant (REQ-ORCH-016: `swarm` is not an input to the mapping), the tools and the coordinating status are the run's as
 * they would be without it.
 *
 * "Taking precedence over the matrix cell": the text says so, and names the two slots whose guidance it overrides where they
 * differ — CHUNKING's `milestones` (one finished before the next starts) and BUDGET's `tight` (delegate sparingly). BUDGET's
 * clamp is enforced, not advice (REQ-ORCH-024), so the demand is bounded by the limits the run enforces rather than told to
 * exceed them.
 *
 * The reason the precedence sentence exists, kept beside it: the first form (finacc3, F07's repair, round 0) demanded parallel
 * delegation directly under a cell's "finish and verify one before starting the next" with nothing saying which wins — the
 * contradiction PD-ORCH-006 removed from the direct-work prompt (finding G2).
 */
export const SWARM_INSTRUCTION = [
  SWARM_HEADING,
  '',
  'The user started this run under the `swarm` override. This section is the last layer of your instructions and takes precedence over the playbook above wherever the two differ on how to divide and delegate the work: where its CHUNKING says to finish one milestone before starting the next, or its BUDGET says to delegate sparingly, follow this section instead, within the child limits the run enforces.',
  '',
  'Delegate as widely and in parallel as the work allows. Split the task into as many independent work items as it truly has (a task that is one item, such as a plain question, stays one delegation), hand each to its own specialist at once rather than one after another, and wait only where one item needs another\'s result. Overlapping ownership stays forbidden: never hold two implementation delegations for the same todo item at once.',
].join('\n');

/**
 * REQ-ORCH-153: while the plan gate holds the run, no child whose role writes files or runs commands may be spawned, so the
 * `swarm` demand is pointed at the plan rather than at spawning implementers the gate would refuse.
 */
export const SWARM_PLAN_HELD_NOTE = 'While this run\'s plan awaits approval no child that writes files or runs commands can be started: apply this section to the plan instead, laying the work out as independent items to be delegated in parallel once the plan is approved.';

/**
 * REQ-ORCH-025: the run override's layer of the entry role's instructions, or '' where it renders none. Only `swarm` renders
 * text: `single` is a capability change the grant and the withheld `delegate` carry, never advice. The text is given to an
 * entry role that declares `delegate`, so it is never a demand the role has no tool to meet. `runTurn` places it after
 * everything else the prompt carries — the role's instructions, its playbook, the session's context units and the MCP
 * section (`withRunOverrideLayer`, `run/turn.ts`) — "placed after everything else".
 *
 * The reason this exists, kept beside it: until 2026-10-06 (finacc3, finding F07) no reader of the instructions read the
 * override, so a `swarm` run was the same run as an `orchestrator` one
 * (`docs/defects/fixed/the-swarm-run-override-changes-no-instruction-text.md`). The first repair placed the
 * text after the playbook but before the context units and the MCP section, and called that the final layer; it was not.
 *
 * On a run the mapping in force grants the direct-work bundle (built-in or a user's mapping file), `PD-ORCH-006` revision 3
 * (OQ-205 as ruled, R-072) governs REQ-ORCH-025's `swarm`: the entry role is told the direct-work statement alone and no
 * `swarm` text on any turn, the turn the plan gate holds and a continuation included. Until 2026-10-07 this was OQ-205's
 * reading while it was open; the ruling confirmed it as built.
 */
export function runOverrideLayer(override: 'single' | 'swarm' | null, grant: IntentGrant | null, role: Pick<Persona, 'tools'> | null, planHeld = false): string {
  if (override !== 'swarm' || grant === 'direct-work' || role?.tools.includes('delegate') !== true) return '';
  return planHeld ? `${SWARM_INSTRUCTION}\n\n${SWARM_PLAN_HELD_NOTE}` : SWARM_INSTRUCTION;
}

/*
 * REQ-ORCH-028's default routing, with the two capability clauses it states for `codebase-analyst` and `librarian`. The reason
 * they were missing, kept beside the repair: the first table kept the routes and dropped both clauses, and in both duress live
 * runs of 2026-10-06 the coordinator gave `codebase-analyst` a write task (OQ-216, covered work). What every persona's tools
 * let it do is stated in `delegate`'s description, built per caller (PD-TOOLS-006 revision 4).
 */
const ROUTING = 'Route work to specialists: an ambiguous or under-specified request → requirements-engineer; a question about the repository as it stands → codebase-analyst, which reads the workspace but does not modify it; a question answerable only from outside the repository → librarian, which likewise does not modify the workspace; design → architect; an ordered plan → planner; implementation → coding-agent; testing → tester; documentation → docs-writer; behaviour-preserving restructuring → refactorer; final acceptance → verifier.';

export const BUILT_IN_PERSONAS: Readonly<Record<RoleName, Persona>> = Object.freeze({
  orchestrator: persona('orchestrator', BUILT_IN_ROLE_TOOLS['orchestrator'], ORCHESTRATOR_COORDINATING(ROUTING), { coordinatorOnly: true }),
  'requirements-engineer': persona('requirements-engineer', BUILT_IN_ROLE_TOOLS['requirements-engineer'], 'You clarify ambiguous requests into precise requirements. Read what you need; write nothing; answer with the requirements as you understand them and the questions that remain.'),
  'codebase-analyst': persona('codebase-analyst', BUILT_IN_ROLE_TOOLS['codebase-analyst'], 'You answer questions about the repository as it stands. Read and search; never modify anything; answer with what you found and where.'),
  librarian: persona('librarian', BUILT_IN_ROLE_TOOLS['librarian'], 'You answer questions from outside the repository — documentation and references. You never modify the workspace.'),
  architect: persona('architect', BUILT_IN_ROLE_TOOLS['architect'], 'You design. Read the code, propose a design with its trade-offs, and answer plainly. You write no code.'),
  planner: persona('planner', BUILT_IN_ROLE_TOOLS['planner'], 'You produce an ordered plan for a task, commissioning whatever research the plan needs. You write no code.'),
  'coding-agent': persona('coding-agent', BUILT_IN_ROLE_TOOLS['coding-agent'], 'You implement. Read before you edit, make the change the task asks for and nothing more, run what verifies it, and report what you changed and how you checked it.'),
  tester: persona('tester', BUILT_IN_ROLE_TOOLS['tester'], 'You test. Write or run the tests the task names and report each result with its command and exit status.'),
  'docs-writer': persona('docs-writer', BUILT_IN_ROLE_TOOLS['docs-writer'], 'You write documentation. Read the code it documents; change nothing but documents.'),
  refactorer: persona('refactorer', BUILT_IN_ROLE_TOOLS['refactorer'], 'You restructure without changing behaviour, and you prove it by running what verifies it.'),
  verifier: persona('verifier', BUILT_IN_ROLE_TOOLS['verifier'], 'You are the acceptance role. Check the work against the task and the evidence handed to you; report pass or fail with the reasons.'),
  'ui-verifier': persona('ui-verifier', BUILT_IN_ROLE_TOOLS['ui-verifier'], 'You verify user interfaces by exercising them and report what you observed.'),
  gatekeeper: persona('gatekeeper', BUILT_IN_ROLE_TOOLS['gatekeeper'], 'You decide whether a change may proceed and say why.'),
});

/** The orchestrator's built-in coordinating prompt, which `entryInstructionsFor` recognises to replace. */
const BUILT_IN_ORCHESTRATOR_PROMPT = BUILT_IN_PERSONAS.orchestrator.systemPrompt;

/** REQ-ORCH-034: resolve a persona or alias; null when unknown. */
export function resolveRole(name: string): { persona: Persona; alias: string | null } | null {
  const direct = BUILT_IN_PERSONAS[name as RoleName];
  if (direct) return { persona: direct, alias: null };
  const target = ROLE_ALIASES[name];
  if (target && BUILT_IN_PERSONAS[target]) return { persona: BUILT_IN_PERSONAS[target], alias: name };
  return null;
}

/** REQ-ORCH-034 over the built-in table: its delegation targets (OQ-228: `gatekeeper` is not one) and the aliases. */
export function knownRolesMessage(): string {
  return knownTargetsSentence(null, null);
}
