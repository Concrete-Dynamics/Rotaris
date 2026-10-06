import { BUILT_IN_ROLE_NAMES, BUILT_IN_ROLE_TOOLS, ROLE_SPAWN_ALIASES, type BuiltInRoleName, type IntentGrant, type PermissionPreset } from '@rotaris/contracts';
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
}

/**
 * REQ-TOOLS-006 (4) under OQ-145's reading: the allowed-tool lists that bind an agent of `persona` — the entry its own
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
  readonly resolve: (name: string) => { readonly persona: Persona; readonly alias: string | null } | null;
  readonly knownRoles: () => readonly string[];
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
  return { name, tools, coordinatorOnly: false, readOnly: false, systemPrompt: prompt, implementer: tools.some((t) => IMPLEMENTER_TOOLS.has(t)), ...extra };
}

export const ROLE_VOCABULARY = BUILT_IN_ROLE_NAMES;
export type RoleName = BuiltInRoleName;

/** REQ-ORCH-034 / REQ-TOOLS-152: the two aliases, resolved only when the target exists (the vocabulary is contracts'). */
export const ROLE_ALIASES: Readonly<Record<string, RoleName>> = ROLE_SPAWN_ALIASES;

/**
 * REQ-ORCH-029: the orchestrator's built-in instructions while it coordinates — every run whose entry role holds no
 * direct-work bundle.
 */
const ORCHESTRATOR_COORDINATING = (routing: string): string => `You are the orchestrator. You coordinate: you do not modify files or run commands yourself — every work item reaches a specialist through the delegate tool, and you keep a todo list current for work spanning more than one step. ${routing} Delegate in parallel where work is independent, wait only when you need a result, and finish by answering the user plainly with what was done. Where a choice is genuinely the user's to make and guessing would waste work, ask with ask_questions rather than assuming.`;

/**
 * OQ-202 as ruled (R-071, `PD-ORCH-006`): what the coordinator is told where its run grants it the direct-work bundle
 * (REQ-ORCH-016; the built-in mapping grants it on `explicit_trivial` and `single_file_change`, and a `single` override
 * on every intent, REQ-ORCH-025). It names no delegation, so it holds under `single`, where `delegate` is withheld, as
 * well as where the bundle still carries it.
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

const ROUTING = 'Route work to specialists: an ambiguous or under-specified request → requirements-engineer; a question about the repository as it stands → codebase-analyst; a question answerable only from outside the repository → librarian; design → architect; an ordered plan → planner; implementation → coding-agent; testing → tester; documentation → docs-writer; behaviour-preserving restructuring → refactorer; final acceptance → verifier.';

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

export function knownRolesMessage(): string {
  return `Known personas: ${ROLE_VOCABULARY.join(', ')}. Supported aliases: ${Object.entries(ROLE_ALIASES).map(([a, t]) => `${a}->${t}`).join(', ')}.`;
}
