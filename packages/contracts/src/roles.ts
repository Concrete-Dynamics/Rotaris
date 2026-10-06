/**
 * REQ-ORCH-028's thirteen built-in roles and their two spawn aliases (REQ-ORCH-034 / REQ-TOOLS-152), held
 * here so the configuration loader (which cannot import the engine) and the engine's persona table name
 * the same set. The prompts stay in the engine. The roles' tool DECLARATIONS are here too since live-run finding K1
 * (R-067, 2026-09-29): the loader's role view must name the declaration the run host resolves from, so a surface can
 * let a persona's declared tools stand in where no resolved set is known (REQ-MONITOR-060).
 */
export const BUILT_IN_ROLE_NAMES = [
  'orchestrator', 'requirements-engineer', 'codebase-analyst', 'librarian', 'architect', 'planner', 'coding-agent',
  'tester', 'docs-writer', 'refactorer', 'verifier', 'ui-verifier', 'gatekeeper',
] as const;
export type BuiltInRoleName = (typeof BUILT_IN_ROLE_NAMES)[number];

/**
 * Part Y: `artifact_read` and `artifact_list` join the read group. Three reasons, none of them convenience:
 * REQ-TOOLS-007 puts both in the read-only class, REQ-ORCH-016's direct-work bundle already names both as
 * capabilities, and REQ-LIBRARY-097 gives EVERY newly created agent a block whose elision marker names
 * `artifact_list` as the way to reach what it left out — a marker naming a tool no persona declares would be
 * false on its face. `artifact_write` is deliberately NOT here: publishing is a grant (REQ-TOOLS-004 keeps a
 * reason code for withholding it), so a persona that should publish declares it in configuration
 * (REQ-TOOLS-002). That no built-in persona does is the owner's, raised as OQ-212 (2026-10-06; this comment claimed it
 * recorded before any entry existed, F16).
 */
/**
 * OQ-61, ruled 2026-09-18: `git_read` joins the read group with the search tools rather than as a
 * grant. It answers repository identity for the worktree the run already occupies — the question an
 * isolated analyst or verifier otherwise records as unverifiable — declaring reads and joining the
 * read-only class, so it survives `read_only`, `coordinator_only` and the plan-gate hold by
 * construction rather than by a second decision.
 */
const READ_TOOLS: readonly string[] = ['read_file', 'haet_read', 'grep', 'glob', 'git_read', 'artifact_read', 'artifact_list'];
const WRITE_TOOLS: readonly string[] = ['write_file', 'haet_edit', 'haet'];
const DELEGATION: readonly string[] = ['delegate', 'todo'];
/**
 * Part AC: `ask_questions` reaches the ORCHESTRATOR, and only it, for now.
 *
 * Found by building the tool (2026-09-07): the executor existed, the prerequisite was met, the registry kept the
 * name — and no agent could still call it, because **no built-in persona declared it**, and REQ-ORCH-016's
 * direct-work bundle does not name it either (it is not a workspace capability and declares no facet). The
 * registry's declared-but-unexecuted path had a second gate behind the first, and nothing said so: a name a
 * persona never declares produces no removal and no reason code, so the tool was simply absent from the listing
 * in silence.
 *
 * The orchestrator, because REQ-CHAT-094 scopes a pending prompt to ONE CONVERSATION and the orchestrator's is the
 * conversation the desktop user is in — REQ-CHAT-051's trailer names the agent that asked, and the run-level agent
 * is that one. `coordinator_only` does not remove it: `COORDINATOR_REMOVES` is the closed five write-and-command
 * names (REQ-TOOLS-006), and asking a person a question is neither.
 *
 * **Whether a delegated child may ask the user was left open, deliberately.** REQ-CHAT-094's "per conversation"
 * admits more than one asker and the mechanism supports it (the wait registry is per tool port, which is per
 * conversation), but no requirement says which personas should, REQ-CHAT-051 defines exactly one question trailer,
 * and `requirements-engineer` — the persona whose whole job is "the questions that remain" — is the obvious
 * candidate. Raised as OQ-52 against REQ-TOOLS-002 rather than settled here, and ruled 2026-10-06 (R-071): `ask_questions`
 * stays on the orchestrator alone, and a delegated child does not ask the user a structured question.
 */
const ASK: readonly string[] = ['ask_questions'];

/**
 * REQ-TOOLS-002 / REQ-ORCH-028: the tools each built-in role DECLARES, before the registry narrows them (REQ-TOOLS-006) and
 * removes what a prerequisite leaves unmet (REQ-TOOLS-004). The engine's persona table reads its tool lists from here.
 */
export const BUILT_IN_ROLE_TOOLS: Readonly<Record<BuiltInRoleName, readonly string[]>> = Object.freeze({
  orchestrator: [...READ_TOOLS, ...WRITE_TOOLS, 'terminal', ...DELEGATION, ...ASK],
  'requirements-engineer': READ_TOOLS,
  'codebase-analyst': READ_TOOLS,
  librarian: READ_TOOLS,
  architect: READ_TOOLS,
  planner: READ_TOOLS,
  'coding-agent': [...READ_TOOLS, ...WRITE_TOOLS, 'terminal', 'todo'],
  tester: [...READ_TOOLS, 'terminal', ...WRITE_TOOLS],
  'docs-writer': [...READ_TOOLS, ...WRITE_TOOLS],
  refactorer: [...READ_TOOLS, ...WRITE_TOOLS, 'terminal'],
  verifier: [...READ_TOOLS, 'terminal'],
  'ui-verifier': [...READ_TOOLS, 'terminal'],
  gatekeeper: READ_TOOLS,
});

/**
 * REQ-TOOLS-002 (decision 3 of the plan: `personas:` overlaid on the built-in table): a role's declared tools — the
 * configuration's `tools:` list when it states one, else the built-in role's declaration, else none. The run host's
 * persona resolver and the configuration snapshot's role view both read this, so they cannot name different sets.
 */
export function declaredToolsOf(role: string, stated: readonly string[]): readonly string[] {
  if (stated.length > 0) return stated;
  return isBuiltInRole(role) ? BUILT_IN_ROLE_TOOLS[role] : [];
}

/** REQ-ORCH-034: `coder` → `coding-agent`, `playwright` → `ui-verifier`; resolved only when the target exists. */
export const ROLE_SPAWN_ALIASES: Readonly<Record<string, BuiltInRoleName>> = Object.freeze({ coder: 'coding-agent', playwright: 'ui-verifier' });

/** REQ-CONFIG-062: the legacy role-name vocabulary a configuration file is canonicalised by, per scope, before any merge. */
export const LEGACY_ROLE_ALIASES: Readonly<Record<string, BuiltInRoleName>> = Object.freeze({ oracle: 'codebase-analyst' });

export function isBuiltInRole(name: string): name is BuiltInRoleName {
  return (BUILT_IN_ROLE_NAMES as readonly string[]).includes(name);
}

// Part AL2 — the renderer WINDOW roles (ADR-0056: one bundle, the role arrives by route). The terminal window
// (REQ-SHELL-079..111) is the seventh; `renderer/main.tsx`'s boot branch and `main/windows.ts` name it from here so
// the query string is spelt once. The agent roles above are a different vocabulary and are not touched.
export const WINDOW_ROLES = ['main', 'approval', 'pause', 'provider', 'hook-review', 'persona', 'rows-proof', 'terminal'] as const;
export type WindowRole = (typeof WINDOW_ROLES)[number];
/** REQ-SHELL-081: the one terminal window per main window; `?role=terminal`. */
export const TERMINAL_WINDOW_ROLE: WindowRole = 'terminal';
