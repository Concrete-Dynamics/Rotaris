import { readdirSync, readFileSync, statSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { compareCodePoints } from '@rotaris/kernel';
import { isDisabled, readInstalledManifest, type DisabledSkills } from './manifest.js';
import { parseSkill, type ParsedSkill } from './parse.js';
import { installedManifestPath, projectDirectories, skillRoots, type SkillRoot, type SkillRootsEnv, type SkillScope } from './roots.js';

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

/**
 * REQ-WORKSPACE-045 names two ways a file can be unreadable — an I/O error and a **decoding** error — and asks that
 * each be skipped with a warning naming the path and the error. `readFileSync(path, 'utf8')` reports only the first:
 * Node's lenient decode replaces every undecodable sequence with U+FFFD and never throws, so a file that is not UTF-8
 * was merged, replacement characters and all, with no warning (measured 2026-09-27 over the bytes
 * `68 69 0a ff fe c3 28 0a`, which came back as `"hi\n���(\n"`). The decoder here is strict: an undecodable
 * sequence throws, and the throw reaches the same warning path an I/O error does. The BOM is left in place
 * (`ignoreBOM`), so a file that decodes reads exactly as it did before — only the file that cannot be decoded changes
 * what happens. Every reader of these ports shares the rule: an instruction file (REQ-WORKSPACE-045), a `SKILL.md`
 * (REQ-WORKSPACE-053, OQ-79), a force-loaded body (REQ-WORKSPACE-062), the disable manifest (REQ-WORKSPACE-052) and a
 * `SKILL.md` loaded by hand (`loadManualSkill`, REQ-WORKSPACE-057/151), which now fails with its "SKILL.md not found"
 * sentence and the decoder's reason where it used to load with U+FFFD in the text.
 */
const STRICT_UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/** `node:fs`, with every "it is not there" answer folded into the shape the walk expects. */
export const NODE_DISCOVERY_PORTS: DiscoveryPorts = {
  readDir: (dir) => { try { return readdirSync(dir); } catch { return []; } },
  readFile: (path) => STRICT_UTF8.decode(readFileSync(path)),
  isDirectory: (path) => { try { return statSync(path).isDirectory(); } catch { return false; } },
  isFile: (path) => { try { return statSync(path).isFile(); } catch { return false; } },
};

/**
 * OQ-386 point 1 (ruled 2026-10-21): the same four questions, answered without holding the caller's event loop — what the
 * run host's warm-up at a workspace open reads the tree through (`discoverSkillsAsync`). Each answers as its synchronous
 * twin does, the strict decoder included, so a walk over either set of ports reaches the same discovery.
 */
export interface AsyncDiscoveryPorts {
  readonly readDir: (dir: string) => Promise<readonly string[]>;
  readonly readFile: (path: string) => Promise<string>;
  readonly isDirectory: (path: string) => Promise<boolean>;
  readonly isFile: (path: string) => Promise<boolean>;
}

/** `node:fs/promises`, folded exactly as `NODE_DISCOVERY_PORTS` folds `node:fs`. */
export const NODE_ASYNC_DISCOVERY_PORTS: AsyncDiscoveryPorts = {
  readDir: async (dir) => { try { return await readdir(dir); } catch { return []; } },
  readFile: async (path) => STRICT_UTF8.decode(await readFile(path)),
  isDirectory: async (path) => { try { return (await stat(path)).isDirectory(); } catch { return false; } },
  isFile: async (path) => { try { return (await stat(path)).isFile(); } catch { return false; } },
};

/** Synchronous ports behind the asynchronous face — for a caller that injects one set and is asked for the other (tests, `SkillHost`). */
export function asyncDiscoveryPorts(ports: DiscoveryPorts): AsyncDiscoveryPorts {
  return {
    readDir: async (dir) => ports.readDir(dir),
    readFile: async (path) => ports.readFile(path),
    isDirectory: async (path) => ports.isDirectory(path),
    isFile: async (path) => ports.isFile(path),
  };
}

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

/** What one read of a file came to: its text, or the reason it could not be read. */
type FileRead = { readonly text: string } | { readonly cause: unknown };

const messageOf = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));

/** REQ-WORKSPACE-052: the manifest's reading — `null` when it is simply not there, which is no warning. */
function disabledFrom(path: string, read: FileRead | null): DisabledSkills {
  if (read === null) return readInstalledManifest(null, path);
  try {
    if ('cause' in read) throw read.cause;
    return readInstalledManifest(read.text, path);
  } catch (cause) {
    return { names: new Set(), warning: `${path} could not be read (${messageOf(cause)}); no skill is disabled by it` };
  }
}

/** REQ-WORKSPACE-052: the manifest's text, or null when it is simply not there. */
export function readDisabledSkills(home: string, ports: DiscoveryPorts): DisabledSkills {
  const path = installedManifestPath(home);
  if (!ports.isFile(path)) return disabledFrom(path, null);
  let read: FileRead;
  try { read = { text: ports.readFile(path) }; } catch (cause) { read = { cause }; }
  return disabledFrom(path, read);
}

/**
 * What one child of a root came to. The walk asks four questions of it, in this order and each only if the one before
 * allowed it — a directory? holding a `SKILL.md`? not disabled? readable? — so `probeChild` and `probeChildAsync` below are
 * the one sequence written for each kind of port, and everything decided from the answers is `Admitted.admit`'s alone.
 */
type ChildProbe =
  | { readonly kind: 'none' }
  | { readonly kind: 'read'; readonly path: string; readonly directory: string; readonly read: FileRead };

const NOT_A_SKILL: ChildProbe = { kind: 'none' };

function probeChild(root: SkillRoot, child: string, disabled: DisabledSkills, ports: DiscoveryPorts): ChildProbe {
  const directory = join(root.dir, child);
  if (!ports.isDirectory(directory)) return NOT_A_SKILL;
  const path = join(directory, SKILL_FILE);
  if (!ports.isFile(path)) return NOT_A_SKILL;
  // REQ-WORKSPACE-052: the manifest matches the DIRECTORY name, so a disabled skill is never opened.
  if (isDisabled(disabled, child)) return NOT_A_SKILL;
  try { return { kind: 'read', path, directory, read: { text: ports.readFile(path) } }; } catch (cause) { return { kind: 'read', path, directory, read: { cause } }; }
}

/**
 * The rules applied to the probes, in discovery order (root order, then each root's children by code point) — which the
 * asynchronous walk keeps however its reads interleave, because it folds its probes only once they are all in.
 */
class Admitted {
  private readonly skipped: { path: string; reason: string }[] = [];
  // Insertion order is discovery order, which is what makes "the first to yield a name wins" a plain first-seen rule.
  private readonly won = new Map<string, DiscoveredSkill & { shadowed: string[] }>();

  admit(scope: SkillScope, probe: ChildProbe): void {
    if (probe.kind === 'none') return;
    const { path, directory, read } = probe;
    if ('cause' in read) {
      // REQ-WORKSPACE-053's "unreadable file", which a file that is not UTF-8 is read as too (OQ-79): skipped with
      // the reason, never parsed with replacement characters standing in for what the author wrote.
      this.skipped.push({ path, reason: `unreadable file: ${messageOf(read.cause)}` });
      return;
    }
    const parsed = parseSkill(read.text);
    if (!parsed.ok) { this.skipped.push({ path, reason: parsed.reason }); return; }
    const held = this.won.get(parsed.skill.name);
    // REQ-WORKSPACE-054: the earlier (higher-priority) skill wins; the later one is recorded, never dropped.
    if (held) { held.shadowed.push(path); return; }
    this.won.set(parsed.skill.name, { ...parsed.skill, scope, path, directory, shadowed: [] });
  }

  discovery(disabled: DisabledSkills): SkillDiscovery {
    const skills = [...this.won.values()].sort((a, b) => compareCodePoints(a.name, b.name));
    return { skills, skipped: this.skipped, warnings: disabled.warning === null ? [] : [disabled.warning] };
  }
}

export function discoverSkills(env: SkillRootsEnv, ports: DiscoveryPorts = NODE_DISCOVERY_PORTS): SkillDiscovery {
  const disabled = readDisabledSkills(env.home, ports);
  const admitted = new Admitted();
  for (const root of skillRoots(env)) {
    const children = [...ports.readDir(root.dir)].sort(compareCodePoints);
    for (const child of children) admitted.admit(root.scope, probeChild(root, child, disabled, ports));
  }
  return admitted.discovery(disabled);
}

/**
 * OQ-386 point 1: how many of the asynchronous walk's port calls may be in flight at once. Each one is a job on libuv's
 * thread pool, which holds four threads by default (`UV_THREADPOOL_SIZE`) and which the run host shares with everything
 * else it does on disk — the store's files, the tools' reads, a checkpoint's copy. A walk that queued a thousand stats at
 * once would hold the whole pool, so a request arriving meanwhile would wait behind the tree after all, only on the pool
 * rather than on the loop. Four keeps the walk at most one pool's width wide and leaves a read that arrives behind it a
 * queue of four to wait on, not the tree's.
 */
export const DISCOVERY_READS_IN_FLIGHT = 4;

/**
 * OQ-386 point 1: what an asynchronous walk rejects with when its caller's `stopped` answered yes — the walk was superseded
 * (a rescan or a session creation cleared the catalogue it would fill), and it stops rather than reading on. It is never a
 * file's failure: a probe rethrows it instead of recording an unreadable file.
 */
export class DiscoveryStopped extends Error {
  constructor() {
    super('the skill discovery was stopped: its result is no longer wanted');
    this.name = 'DiscoveryStopped';
  }
}

/**
 * At most `width` tasks running; the rest wait their turn in the order they asked. A finishing task hands its slot on. A
 * task whose turn comes after `stopped` answered yes is never started: it rejects with `DiscoveryStopped` and hands its slot
 * on, so a stopped walk issues no read beyond the ones already in flight.
 */
function bounded(width: number, stopped: () => boolean): <T>(task: () => Promise<T>) => Promise<T> {
  let running = 0;
  // A cursor, not `shift`: a directory of 200,000 children queues that many tasks, and shifting an array that long is linear,
  // so the queue alone held the loop for tens of seconds (measured 2026-11-01), which is what this walk exists not to do.
  const waiting: (() => void)[] = [];
  let next = 0;
  return async (task) => {
    if (running < width) running += 1;
    else await new Promise<void>((turn) => waiting.push(turn));
    try {
      if (stopped()) throw new DiscoveryStopped();
      return await task();
    } finally {
      const turn = waiting[next];
      // The slot passes straight to the next task, so one that asks in between can never make it width + 1.
      if (turn) { waiting[next] = () => undefined; next += 1; turn(); } else running -= 1;
    }
  };
}

/** `SkillRootsEnv` with its one question asked without holding the loop. */
export type AsyncSkillRootsEnv = Omit<SkillRootsEnv, 'exists'> & { readonly exists: (path: string) => Promise<boolean> };

/**
 * REQ-WORKSPACE-051's ladder, its `.git` probes asked asynchronously. `projectDirectories` asks `exists` of `<dir>/.git`
 * nearest first and stops at the first yes; answered "no" throughout, it names every probe it could make, in its order.
 * Those are asked here one at a time, stopping at the first yes as it would, and `skillRoots` is handed the answers — so
 * the ladder is still the one rule `roots.ts` states, and not a second copy of it.
 */
async function skillRootsAsync(env: AsyncSkillRootsEnv, run: <T>(task: () => Promise<T>) => Promise<T>): Promise<readonly SkillRoot[]> {
  const probes: string[] = [];
  projectDirectories({ workspaceRoot: env.workspaceRoot, exists: (path) => { probes.push(path); return false; } });
  const present = new Set<string>();
  for (const path of probes) {
    if (await run(() => env.exists(path))) { present.add(path); break; }
  }
  return skillRoots({ ...env, exists: (path) => present.has(path) });
}

async function probeChildAsync(root: SkillRoot, child: string, disabled: DisabledSkills, ports: AsyncDiscoveryPorts, run: <T>(task: () => Promise<T>) => Promise<T>): Promise<ChildProbe> {
  const directory = join(root.dir, child);
  if (!(await run(() => ports.isDirectory(directory)))) return NOT_A_SKILL;
  const path = join(directory, SKILL_FILE);
  if (!(await run(() => ports.isFile(path)))) return NOT_A_SKILL;
  // REQ-WORKSPACE-052: the manifest matches the DIRECTORY name, so a disabled skill is never opened.
  if (isDisabled(disabled, child)) return NOT_A_SKILL;
  try { return { kind: 'read', path, directory, read: { text: await run(() => ports.readFile(path)) } }; } catch (cause) {
    if (cause instanceof DiscoveryStopped) throw cause;
    return { kind: 'read', path, directory, read: { cause } };
  }
}

/**
 * OQ-386 point 1 (ruled 2026-10-21): `discoverSkills`, reading the tree asynchronously — the same discovery for the same
 * tree (`Admitted` decides both), with at most `width` reads in flight (`DISCOVERY_READS_IN_FLIGHT`). The manifest is read
 * first, as the synchronous walk reads it, so a disabled skill is still never opened; the roots are then listed and their
 * children probed side by side, and the probes are folded in discovery order once every one is in. A port that rejects
 * outside a file read rejects the walk, which its caller logs; `NODE_ASYNC_DISCOVERY_PORTS` folds those answers instead.
 *
 * `stopped` is asked before every read the walk would start. Once it answers yes the walk starts no further read and rejects
 * with `DiscoveryStopped`: a walk whose result its caller will set aside must not go on loading the disk beside the walk
 * that replaces it (the run host's warm-up, overtaken by a rescan or a session creation).
 */
export async function discoverSkillsAsync(
  env: AsyncSkillRootsEnv,
  ports: AsyncDiscoveryPorts = NODE_ASYNC_DISCOVERY_PORTS,
  width: number = DISCOVERY_READS_IN_FLIGHT,
  stopped: () => boolean = () => false,
): Promise<SkillDiscovery> {
  const run = bounded(Math.max(1, width), stopped);
  const manifest = installedManifestPath(env.home);
  let disabled: DisabledSkills;
  if (!(await run(() => ports.isFile(manifest)))) disabled = disabledFrom(manifest, null);
  else {
    let read: FileRead;
    try { read = { text: await run(() => ports.readFile(manifest)) }; } catch (cause) {
      if (cause instanceof DiscoveryStopped) throw cause;
      read = { cause };
    }
    disabled = disabledFrom(manifest, read);
  }
  const roots = await skillRootsAsync(env, run);
  const probed = await Promise.all(roots.map(async (root) => {
    const children = [...(await run(() => ports.readDir(root.dir)))].sort(compareCodePoints);
    return { root, probes: await Promise.all(children.map((child) => probeChildAsync(root, child, disabled, ports, run))) };
  }));
  const admitted = new Admitted();
  for (const { root, probes } of probed) for (const probe of probes) admitted.admit(root.scope, probe);
  return admitted.discovery(disabled);
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
