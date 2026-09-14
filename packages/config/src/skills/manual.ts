import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { NODE_DISCOVERY_PORTS, SKILL_FILE, type DiscoveredSkill, type DiscoveryPorts } from './discover.js';
import { parseSkill } from './parse.js';

/**
 * REQ-WORKSPACE-057 — loading a `SKILL.md` by hand. Accepts a path to the file **or to a directory
 * containing one**, with `~` expansion and relative paths resolved against the workspace root.
 *
 * The two failure sentences are the requirement's, verbatim, because the surfaces quote them: the
 * Settings action reports "the reason REQ-WORKSPACE-057 gives for it" (151) and the typed command
 * surfaces the same text (REQ-CHAT-162).
 *
 * A manual skill carries the scope label `manual`, overrides a discovered skill of the same normalized
 * name, applies to the current session only and **persists nothing** — which is the caller's to honour;
 * this module only resolves and reads.
 */
export const skillNotFound = (raw: string): string => `SKILL.md not found: ${raw}`;
export const skillPathNotAcceptable = (raw: string): string => `manual skill path must be a SKILL.md file or directory: ${raw}`;

export type ManualSkillLoad = { readonly ok: true; readonly skill: DiscoveredSkill } | { readonly ok: false; readonly reason: string };

/** `~` and `~/…` against the supplied home; every other spelling is left alone (a path may legitimately contain `~`). */
export function expandHome(raw: string, home: string = homedir()): string {
  if (raw === '~') return home;
  if (raw.startsWith('~/') || raw.startsWith('~\\')) return join(home, raw.slice(2));
  return raw;
}

export interface ManualSkillEnv {
  readonly workspaceRoot: string;
  readonly home?: string;
}

export function loadManualSkill(raw: string, env: ManualSkillEnv, ports: DiscoveryPorts = NODE_DISCOVERY_PORTS): ManualSkillLoad {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: false, reason: skillNotFound(raw) };
  const expanded = expandHome(trimmed, env.home);
  const absolute = isAbsolute(expanded) ? resolve(expanded) : resolve(env.workspaceRoot, expanded);

  let path: string;
  let directory: string;
  if (ports.isDirectory(absolute)) {
    path = join(absolute, SKILL_FILE);
    directory = absolute;
    // A directory that holds no SKILL.md is "not found" rather than "not acceptable": the path names a
    // place a skill could be and is not one, which is what the user needs told.
    if (!ports.isFile(path)) return { ok: false, reason: skillNotFound(raw) };
  } else if (ports.isFile(absolute)) {
    // REQ-WORKSPACE-057 accepts a `SKILL.md` file; any other file is the second failure, not the first.
    if (basename(absolute) !== SKILL_FILE) return { ok: false, reason: skillPathNotAcceptable(raw) };
    path = absolute;
    directory = dirname(absolute);
  } else {
    return { ok: false, reason: skillNotFound(raw) };
  }

  let text: string;
  try {
    text = ports.readFile(path);
  } catch (cause) {
    return { ok: false, reason: `${skillNotFound(raw)} (${cause instanceof Error ? cause.message : String(cause)})` };
  }
  const parsed = parseSkill(text);
  // A file that exists but does not parse reports the parser's own reason, which names what is wrong with
  // it — more use than either of the two path sentences, neither of which would be true.
  if (!parsed.ok) return { ok: false, reason: `${path}: ${parsed.reason}` };
  return { ok: true, skill: { ...parsed.skill, scope: 'manual', path, directory, shadowed: [] } };
}
