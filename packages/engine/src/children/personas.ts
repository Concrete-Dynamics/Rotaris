import { BUILT_IN_ROLE_NAMES, ROLE_SPAWN_ALIASES, type BuiltInRoleName } from '@rotaris/contracts';
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
  readonly thinking?: ThinkingLevel | undefined;
  /** REQ-CONFIG-110 / REQ-ORCH-144: the role's own `fallback_model`; absent means the run-level slot (REQ-CONFIG-065). */
  readonly fallbackModel?: ModelRef | undefined;
  readonly fallbackThinking?: ThinkingLevel | undefined;
  /**
   * REQ-MCP-065 / REQ-MCP-114 (Part S): the MCP grant evidence recorded on a child's row at spawn — the granted tools per
   * server and every carried server's fate. Supplied by the run host's resolver from the same memoised resolution the
   * tool port reads; absent for the built-in table, which carries no MCP surface.
   */
  readonly mcpEvidence?: (() => McpGrantEvidence) | undefined;
}

export interface McpGrantEvidence {
  readonly granted: Readonly<Record<string, readonly string[]>>;
  readonly servers: readonly { readonly name: string; readonly transport: string; readonly origin: string; readonly fate: 'connected' | 'dropped'; readonly reason?: string }[];
}
export const EMPTY_MCP_EVIDENCE: McpGrantEvidence = Object.freeze({ granted: {}, servers: [] });

/** ADR-0036: the configured `personas:` overlaid on the built-in table, resolved per run by the root. */
export interface PersonaResolver {
  readonly resolve: (name: string) => { readonly persona: Persona; readonly alias: string | null } | null;
  readonly knownRoles: () => readonly string[];
}

const READ_TOOLS = ['read_file', 'haet_read', 'grep', 'glob'];
const WRITE_TOOLS = ['write_file', 'haet_edit', 'haet'];
const DELEGATION = ['delegate', 'todo'];

function persona(name: string, tools: readonly string[], prompt: string, extra: Partial<Persona> = {}): Persona {
  return { name, tools, coordinatorOnly: false, readOnly: false, systemPrompt: prompt, implementer: tools.some((t) => WRITE_TOOLS.includes(t) || t === 'terminal'), ...extra };
}

export const ROLE_VOCABULARY = BUILT_IN_ROLE_NAMES;
export type RoleName = BuiltInRoleName;

/** REQ-ORCH-034 / REQ-TOOLS-152: the two aliases, resolved only when the target exists (the vocabulary is contracts'). */
export const ROLE_ALIASES: Readonly<Record<string, RoleName>> = ROLE_SPAWN_ALIASES;

const ROUTING = 'Route work to specialists: an ambiguous or under-specified request → requirements-engineer; a question about the repository as it stands → codebase-analyst; a question answerable only from outside the repository → librarian; design → architect; an ordered plan → planner; implementation → coding-agent; testing → tester; documentation → docs-writer; behaviour-preserving restructuring → refactorer; final acceptance → verifier.';

export const BUILT_IN_PERSONAS: Readonly<Record<RoleName, Persona>> = Object.freeze({
  orchestrator: persona('orchestrator', [...READ_TOOLS, ...WRITE_TOOLS, 'terminal', ...DELEGATION],
    `You are the orchestrator. You coordinate: you do not modify files or run commands yourself — every work item reaches a specialist through the delegate tool, and you keep a todo list current for work spanning more than one step. ${ROUTING} Delegate in parallel where work is independent, wait only when you need a result, and finish by answering the user plainly with what was done.`,
    { coordinatorOnly: true }),
  'requirements-engineer': persona('requirements-engineer', READ_TOOLS, 'You clarify ambiguous requests into precise requirements. Read what you need; write nothing; answer with the requirements as you understand them and the questions that remain.'),
  'codebase-analyst': persona('codebase-analyst', READ_TOOLS, 'You answer questions about the repository as it stands. Read and search; never modify anything; answer with what you found and where.'),
  librarian: persona('librarian', READ_TOOLS, 'You answer questions from outside the repository — documentation and references. You never modify the workspace.'),
  architect: persona('architect', READ_TOOLS, 'You design. Read the code, propose a design with its trade-offs, and answer plainly. You write no code.'),
  planner: persona('planner', READ_TOOLS, 'You produce an ordered plan for a task, commissioning whatever research the plan needs. You write no code.'),
  'coding-agent': persona('coding-agent', [...READ_TOOLS, ...WRITE_TOOLS, 'terminal', 'todo'], 'You implement. Read before you edit, make the change the task asks for and nothing more, run what verifies it, and report what you changed and how you checked it.'),
  tester: persona('tester', [...READ_TOOLS, 'terminal', ...WRITE_TOOLS], 'You test. Write or run the tests the task names and report each result with its command and exit status.'),
  'docs-writer': persona('docs-writer', [...READ_TOOLS, ...WRITE_TOOLS], 'You write documentation. Read the code it documents; change nothing but documents.'),
  refactorer: persona('refactorer', [...READ_TOOLS, ...WRITE_TOOLS, 'terminal'], 'You restructure without changing behaviour, and you prove it by running what verifies it.'),
  verifier: persona('verifier', [...READ_TOOLS, 'terminal'], 'You are the acceptance role. Check the work against the task and the evidence handed to you; report pass or fail with the reasons.'),
  'ui-verifier': persona('ui-verifier', [...READ_TOOLS, 'terminal'], 'You verify user interfaces by exercising them and report what you observed.'),
  gatekeeper: persona('gatekeeper', READ_TOOLS, 'You decide whether a change may proceed and say why.'),
});

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
