/**
 * REQ-ORCH-028's thirteen built-in roles and their two spawn aliases (REQ-ORCH-034 / REQ-TOOLS-152), held
 * here so the configuration loader (which cannot import the engine) and the engine's persona table name
 * the same set. The prompts and tool grants stay in the engine; this is the vocabulary only.
 */
export const BUILT_IN_ROLE_NAMES = [
  'orchestrator', 'requirements-engineer', 'codebase-analyst', 'librarian', 'architect', 'planner', 'coding-agent',
  'tester', 'docs-writer', 'refactorer', 'verifier', 'ui-verifier', 'gatekeeper',
] as const;
export type BuiltInRoleName = (typeof BUILT_IN_ROLE_NAMES)[number];

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
