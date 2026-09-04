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
