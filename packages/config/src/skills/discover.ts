import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { compareCodePoints } from '@rotaris/kernel';
import { isDisabled, readInstalledManifest, type DisabledSkills } from './manifest.js';
import { parseSkill, type ParsedSkill } from './parse.js';
import { installedManifestPath, skillRoots, type SkillRootsEnv, type SkillScope } from './roots.js';

/**
 * REQ-WORKSPACE-051..054 — the walk. The ONE module in this directory that touches a filesystem, and it
 * reaches it through injectable ports so every rule above stays checkable without laying down a tree
 * (`config/src/mcp/discovery-files.ts` is the precedent; ADR-0063 decision 1).
 *
 * Within any root only **immediate child directories** count, and only those holding a `SKILL.md`.
 * Children are visited in ascending name order — by code point, `kernel/order.ts`, not by locale — so
 * that the outcome never depends on the order the filesystem happens to list them in, which is the
 * requirement's own reason.
 *
 * The **first location to yield a particular normalized name wins outright** over every later one. A
 * later file with the same name is not dropped: it is recorded against the winner as a **shadowed**
 * path, which is what REQ-WORKSPACE-054's "recorded and reportable per name" asks for and what the
 * Settings tab's Source tooltip shows (REQ-WORKSPACE-067).
 */
export interface DiscoveryPorts {
  readonly readDir: (dir: string) => readonly string[];
  readonly readFile: (path: string) => string;
  readonly isDirectory: (path: string) => boolean;
  readonly isFile: (path: string) => boolean;
}

/** `node:fs`, with every "it is not there" answer folded into the shape the walk expects. */
export const NODE_DISCOVERY_PORTS: DiscoveryPorts = {
  readDir: (dir) => { try { return readdirSync(dir); } catch { return []; } },
  readFile: (path) => readFileSync(path, 'utf8'),
  isDirectory: (path) => { try { return statSync(path).isDirectory(); } catch { return false; } },
  isFile: (path) => { try { return statSync(path).isFile(); } catch { return false; } },
};

/**
 * REQ-WORKSPACE-067: the Source cell's label. `manual` is not a search scope — nothing is discovered
 * under it — but it is the third value that cell can read, marking a skill loaded by hand as applying to
 * this session only (REQ-WORKSPACE-057, 151), so the three live in one type.
 */
export type SkillScopeLabel = SkillScope | 'manual';

export interface DiscoveredSkill extends ParsedSkill {
  readonly scope: SkillScopeLabel;
  /** The absolute path of the `SKILL.md` itself (REQ-WORKSPACE-061, REQ-WORKSPACE-067). */
  readonly path: string;
  /** The directory holding it — what becomes a read root (REQ-WORKSPACE-059). */
  readonly directory: string;
  /** The `SKILL.md` paths this one won over, in discovery order (REQ-WORKSPACE-054). */
  readonly shadowed: readonly string[];
}

export interface SkillDiscovery {
  /** Ascending normalized name (REQ-WORKSPACE-061's order, and the table's). */
  readonly skills: readonly DiscoveredSkill[];
  /** REQ-WORKSPACE-053: every file skipped, with the reason, so nothing is silently absent. */
  readonly skipped: readonly { readonly path: string; readonly reason: string }[];
  /** Warnings for the log — today, only an unreadable disable manifest (REQ-WORKSPACE-052). */
  readonly warnings: readonly string[];
}

export const SKILL_FILE = 'SKILL.md';

/** REQ-WORKSPACE-052: the manifest's text, or null when it is simply not there. */
export function readDisabledSkills(home: string, ports: DiscoveryPorts): DisabledSkills {
  const path = installedManifestPath(home);
  if (!ports.isFile(path)) return readInstalledManifest(null, path);
  try {
    return readInstalledManifest(ports.readFile(path), path);
  } catch (cause) {
    return { names: new Set(), warning: `${path} could not be read (${cause instanceof Error ? cause.message : String(cause)}); no skill is disabled by it` };
  }
}

export function discoverSkills(env: SkillRootsEnv, ports: DiscoveryPorts = NODE_DISCOVERY_PORTS): SkillDiscovery {
  const disabled = readDisabledSkills(env.home, ports);
  const warnings: string[] = disabled.warning === null ? [] : [disabled.warning];
  const skipped: { path: string; reason: string }[] = [];
  // Insertion order is discovery order, which is what makes "the first to yield a name wins" a plain first-seen rule.
  const won = new Map<string, DiscoveredSkill & { shadowed: string[] }>();

  for (const root of skillRoots(env)) {
    const children = [...ports.readDir(root.dir)].sort(compareCodePoints);
    for (const child of children) {
      const directory = join(root.dir, child);
      if (!ports.isDirectory(directory)) continue;
      const path = join(directory, SKILL_FILE);
      if (!ports.isFile(path)) continue;
      // REQ-WORKSPACE-052: the manifest matches the DIRECTORY name, so a disabled skill is never opened.
      if (isDisabled(disabled, child)) continue;
      let text: string;
      try {
        text = ports.readFile(path);
      } catch (cause) {
        skipped.push({ path, reason: `unreadable file: ${cause instanceof Error ? cause.message : String(cause)}` });
        continue;
      }
      const parsed = parseSkill(text);
      if (!parsed.ok) { skipped.push({ path, reason: parsed.reason }); continue; }
      const held = won.get(parsed.skill.name);
      // REQ-WORKSPACE-054: the earlier (higher-priority) skill wins; the later one is recorded, never dropped.
      if (held) { held.shadowed.push(path); continue; }
      won.set(parsed.skill.name, { ...parsed.skill, scope: root.scope, path, directory, shadowed: [] });
    }
  }

  const skills = [...won.values()].sort((a, b) => compareCodePoints(a.name, b.name));
  return { skills, skipped, warnings };
}

/**
 * REQ-WORKSPACE-059 — the sorted, resolved set of all cataloged skill directories, registered as
 * additional READ roots for agent file tools. Sorted so the value is stable run to run; de-duplicated
 * because two skills may sit under one parent only if that parent is itself a skill directory, which is
 * not a layout the requirement forbids.
 */
export function skillReadRoots(skills: readonly { readonly directory: string }[]): readonly string[] {
  return [...new Set(skills.map((s) => s.directory))].sort(compareCodePoints);
}
