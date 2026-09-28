import { dirname, join, parse as parsePath, resolve } from 'node:path';

/**
 * REQ-WORKSPACE-051 — the search order, and nothing else. Pure: the caller supplies the platform, the
 * home directory and an existence test, so the whole ladder is checkable without laying down a tree.
 *
 * **Project scope** covers every directory from the resolved workspace root **upwards to and including
 * the enclosing repository root** — the nearest ancestor holding a `.git` entry, which may be a
 * directory **or a file** so that a linked worktree root also ends the walk (this repository's own
 * proofs run in worktrees, where `.git` is a file), and the workspace root itself when no such ancestor
 * exists. Directories are visited nearest first, and within one directory `.agents/skills` is searched
 * before `.opencode/skills`.
 *
 * **User scope** is `~/.agents/skills`, then `~/.config/opencode/skills`, then
 * `~/.openhands/skills/installed`, then the machine-wide `/etc/codex/skills`. Every project-scope
 * location outranks every user-scope location.
 *
 * **On a platform with no `/etc` hierarchy user scope simply ends at the three home-relative roots.**
 * No platform-specific machine-wide path is substituted and no fourth user-scope root is declared
 * anywhere. The requirement states the reason with the rule and it is worth keeping here: a
 * machine-wide directory carries skills the account using the product may not have written, and the
 * platforms that lack `/etc` offer no directory with the same ownership guarantees, so silently
 * substituting one would widen what can reach an agent's context on that platform alone.
 */
export type SkillScope = 'project' | 'user';

/**
 * The one machine-wide directory both discoveries read under: REQ-WORKSPACE-051's fourth user-scope root is
 * `<here>/skills`, and `PD-WORKSPACE-002`'s machine-wide instruction base is this directory itself. Stated once so
 * the two cannot drift apart, as `hasEtcHierarchy` is.
 */
export const MACHINE_CODEX_DIR = join('/etc', 'codex');

/** `machineDir` as given, or the real directory when absent or blank — one rule for both discoveries. */
export function machineCodexDir(machineDir: string | undefined): string {
  return machineDir === undefined || machineDir.trim() === '' ? MACHINE_CODEX_DIR : resolve(machineDir);
}

export interface SkillRootsEnv {
  readonly workspaceRoot: string;
  /** The user's home directory. Injected rather than read, so the proof can point it at a scratch tree. */
  readonly home: string;
  /** `process.platform`; only `win32` is treated as having no `/etc` today. */
  readonly platform: NodeJS.Platform;
  /** Whether a path names an existing entry of any kind — a directory OR a file (the linked-worktree `.git`). */
  readonly exists: (path: string) => boolean;
  /**
   * The machine-wide directory the fourth user-scope root sits under: `/etc/codex` unless given, so the root is
   * `<machineDir>/skills`. It moves the directory and nothing else — the root keeps its scope, its rank and its
   * platform rule, so a platform with no `/etc` hierarchy still searches no machine-wide root whatever this names.
   *
   * It is the same directory `PD-WORKSPACE-002`'s machine-wide instruction base reads (`InstructionDiscoveryEnv.machineDir`),
   * and injectable for the same reason `home` is: a built-app proof, and the unit tests, must not read whatever
   * skills the operator's real `/etc/codex/skills` holds (`ROTARIS_CAPTURE_SKILLS_MACHINE`, compiled out of a
   * packaged build).
   */
  readonly machineDir?: string | undefined;
}

export interface SkillRoot {
  readonly scope: SkillScope;
  readonly dir: string;
}

/** The `/etc` hierarchy exists everywhere but Windows; REQ-WORKSPACE-051 forbids substituting a fourth root there. */
export function hasEtcHierarchy(platform: NodeJS.Platform): boolean {
  return platform !== 'win32';
}

/**
 * The workspace root and every ancestor up to and including the nearest one holding a `.git` entry,
 * nearest first. With no such ancestor the list is the workspace root alone — never the filesystem
 * root, which would make what an agent was given depend on the whole machine.
 */
export function projectDirectories(env: Pick<SkillRootsEnv, 'workspaceRoot' | 'exists'>): readonly string[] {
  const chain: string[] = [];
  let current = env.workspaceRoot;
  const stop = parsePath(current).root;
  for (;;) {
    chain.push(current);
    if (env.exists(join(current, '.git'))) return chain;
    if (current === stop) break;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  // No repository root anywhere above: the workspace root itself is the whole of project scope.
  return [env.workspaceRoot];
}

/** REQ-WORKSPACE-051's two layouts, in the requirement's order, within one project directory. */
export const PROJECT_LAYOUTS = [['.agents', 'skills'], ['.opencode', 'skills']] as const;

export function skillRoots(env: SkillRootsEnv): readonly SkillRoot[] {
  const roots: SkillRoot[] = [];
  for (const dir of projectDirectories(env)) {
    for (const layout of PROJECT_LAYOUTS) roots.push({ scope: 'project', dir: join(dir, ...layout) });
  }
  roots.push({ scope: 'user', dir: join(env.home, '.agents', 'skills') });
  roots.push({ scope: 'user', dir: join(env.home, '.config', 'opencode', 'skills') });
  roots.push({ scope: 'user', dir: join(env.home, '.openhands', 'skills', 'installed') });
  if (hasEtcHierarchy(env.platform)) roots.push({ scope: 'user', dir: join(machineCodexDir(env.machineDir), 'skills') });
  return roots;
}

/** REQ-WORKSPACE-052: the disable manifest sits beside the OpenHands install root, not inside it. */
export function installedManifestPath(home: string): string {
  return join(home, '.openhands', 'skills', '.installed.json');
}
