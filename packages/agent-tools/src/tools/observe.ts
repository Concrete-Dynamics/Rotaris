import type { Dirent } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { ignoredHere, loadRules, type IgnoreRule } from '@rotaris/config';
import { realPathOf } from './fence.js';
import { IGNORE_COMPONENTS, scanExcludes } from './search.js';
import type { Observation } from './types.js';

/**
 * OQ-245 (XE1, ruled 2026-10-13 under R-072): the files a cross-file code-intelligence EDIT call changed, learned by looking.
 * A symbol rename and a cross-file replacement change more files than their arguments name, and the server's result does not
 * name them either (a rename returns a count; a replacement names its files only when every one was written). So the run host
 * takes a snapshot of the files the call can reach before it and another after it, whatever it returned, and the difference
 * is what the call changed (`apps/desktop/src/run-host/mcp.ts`). The reading it replaces, the call's argument path alone, is
 * kept beside it in `@rotaris/config`'s `codeIntelligenceEdit`.
 *
 * A file's identity in a snapshot is its size and its modification and status-change times in nanoseconds: a file rewritten
 * with the same size inside one coarse timestamp still moves its status-change time. The walk prunes what the search walk
 * prunes (REQ-TOOLS-139/140, PD-TOOLS-012: the hard-coded ignore components — the product's `.rotaris` and the code-intelligence
 * runtime's marker directory among them — and the workspace `.gitignore`), skips symbolic links, and keeps files of every size
 * and kind, since a large or binary file a replacement wrote is still a file it changed.
 *
 * A pure unit with no clock and no electron, so the run host and the tests read one definition.
 */
export type TreeSnapshot = ReadonlyMap<string, string>;

/** The most files a snapshot holds before it gives up, so a call on an unbounded tree is reported unobserved, not stalled. */
export const SNAPSHOT_FILE_LIMIT = 200_000;

/**
 * The most file statuses a snapshot reads at once. Until fin39 a directory's files were all read together before the limit was
 * checked, so one directory holding far more than `SNAPSHOT_FILE_LIMIT` files was read whole where the synchronous walk had
 * stopped at the limit, and every read was issued in one turn of the event loop
 * (docs/defects/fixed/a-snapshot-reads-every-file-of-a-directory-before-it-checks-the-limit.md).
 */
export const SNAPSHOT_STAT_BATCH = 256;

/**
 * The files under `base` (relative to `root`; `''` is the whole tree), as root-relative `/` paths mapped to their identity, or
 * null when the walk cannot be completed: a base outside the root, an unreadable base, or more than `limit` files. A base the
 * root-down walk would prune is pruned here too, so it holds nothing; a base that is a file is that one file.
 *
 * Asynchronous: every directory listing and every file's status is read through `node:fs/promises`, a directory's files
 * together in batches of `SNAPSHOT_STAT_BATCH`, so the run host's event loop moves between them — other agents' model
 * streams, tool results and the events the window draws are not held behind a project-wide walk. The reason, kept beside it: until fin38 the walk read with
 * `lstatSync` and `readdirSync`, so a symbol rename or a whole-project replacement stalled everything else the run host did
 * for the length of two walks of up to `SNAPSHOT_FILE_LIMIT` files
 * (docs/defects/fixed/a-cross-file-edit-calls-tree-walk-blocks-the-run-hosts-event-loop.md).
 */
export async function snapshotTree(root: string, base: string, limit: number = SNAPSHOT_FILE_LIMIT): Promise<TreeSnapshot | null> {
  const rootAbs = resolve(root);
  const baseAbs = resolve(rootAbs, base);
  const relOf = (abs: string): string => relative(rootAbs, abs).split(sep).join('/');
  const baseRel = relOf(baseAbs);
  if (baseRel === '..' || baseRel.startsWith('../') || isAbsolute(baseRel)) return null;
  let rules: readonly IgnoreRule[];
  try { rules = loadRules(rootAbs); } catch { rules = []; }
  const out = new Map<string, string>();
  const identity = async (abs: string): Promise<string | null> => {
    try {
      const st = await lstat(abs, { bigint: true });
      return st.isFile() ? `${st.size}:${st.mtimeNs}:${st.ctimeNs}` : null;
    } catch {
      return null;
    }
  };
  let baseIsDir: boolean;
  try {
    const st = await lstat(baseAbs);
    if (st.isSymbolicLink()) return out;
    baseIsDir = st.isDirectory();
  } catch {
    // A base that does not exist (yet) holds nothing; a create under it shows as a created file after.
    return out;
  }
  if (scanExcludes(rules, baseRel, baseIsDir)) return out;
  if (!baseIsDir) {
    const id = await identity(baseAbs);
    if (id !== null) out.set(baseRel, id);
    return out;
  }
  const visit = async (dir: string): Promise<boolean> => {
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return dir !== baseAbs;
    }
    const files: { readonly abs: string; readonly rel: string }[] = [];
    const dirs: string[] = [];
    for (const e of entries) {
      if (e.isSymbolicLink() || IGNORE_COMPONENTS.has(e.name)) continue;
      const abs = join(dir, e.name);
      const r = relOf(abs);
      if (e.isDirectory()) {
        if (!ignoredHere(rules, r, true)) dirs.push(abs);
        continue;
      }
      if (e.isFile() && !ignoredHere(rules, r, false)) files.push({ abs, rel: r });
    }
    // A directory's files are read together, `SNAPSHOT_STAT_BATCH` at a time, and the limit is checked after each batch; the
    // listing's order is kept for what the snapshot holds.
    for (let at = 0; at < files.length; at += SNAPSHOT_STAT_BATCH) {
      const batch = files.slice(at, at + SNAPSHOT_STAT_BATCH);
      const ids = await Promise.all(batch.map((f) => identity(f.abs)));
      for (let i = 0; i < batch.length; i += 1) {
        const id = ids[i];
        if (id === null || id === undefined) continue;
        out.set(batch[i]!.rel, id);
        if (out.size > limit) return false;
      }
    }
    for (const d of dirs) if (!(await visit(d))) return false;
    return true;
  };
  return (await visit(baseAbs)) ? out : null;
}

/** The paths changed, created or removed between two snapshots of one base, in code-point order. */
export function snapshotChanges(before: TreeSnapshot, after: TreeSnapshot): string[] {
  const changed = new Set<string>();
  for (const [path, id] of after) if (before.get(path) !== id) changed.add(path);
  for (const path of before.keys()) if (!after.has(path)) changed.add(path);
  return [...changed].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * The files the product's own file tools wrote, in the order they wrote them, so an observation can leave out what another
 * agent wrote while it looked (OQ-245). Siblings share the workspace: a sibling's `write_file` landing while a rename runs
 * would otherwise be listed under the renaming child. A sibling's terminal write cannot be left out this way — the terminal
 * is outside every count (PD-TOOLS-006) — and is the bound the ruling states: a report may overstate, never conceal
 * (REQ-ORCH-109). The same bound covers a sibling's own code-intelligence EDIT call (a single-file content replacement,
 * or another cross-file one) landing inside the window: only the native tools are journaled, so its file is listed under the
 * observing child too (fin35's review; written down by fin36). One journal per run host; entries are absolute paths, and a
 * mark is a position in it.
 */
export class WriteJournal {
  private readonly entries: { readonly agent: string; readonly path: string }[] = [];
  private dropped = 0;

  /** A position: what is noted after it is what `since` reads. */
  mark(): number {
    return this.dropped + this.entries.length;
  }

  /** `agent`'s native file tool wrote these absolute paths. */
  note(agent: string, paths: Iterable<string>): void {
    for (const path of paths) this.entries.push({ agent, path: resolve(path) });
    // Kept bounded: a mark older than the window is read as having seen what was dropped, which can only list more.
    const excess = this.entries.length - 10_000;
    if (excess > 0) { this.entries.splice(0, excess); this.dropped += excess; }
  }

  /** The absolute paths agents other than `agent` noted since `mark`. */
  since(mark: number, agent: string): ReadonlySet<string> {
    const out = new Set<string>();
    for (let i = Math.max(0, mark - this.dropped); i < this.entries.length; i += 1) {
      const e = this.entries[i]!;
      if (e.agent !== agent) out.add(e.path);
    }
    return out;
  }
}

/**
 * OQ-245: run `call` — a cross-file EDIT call reaching `reach.base` under `root` — between two snapshots, and give its
 * observation the files it changed (`observedPaths`), whatever it returned, less those another agent's file tools wrote
 * meanwhile (`journal`). When either snapshot could not be taken the observation is returned with no `observedPaths` and the
 * ruling's `unobserved` mark: the report then says the call may have changed files the record cannot name, whatever it
 * returned. A `reach` of null observes nothing. The reading it replaces, kept beside it: until the fin35 review the observation
 * was returned unmarked, so a call that erred part-way on a tree the walk could not complete read as refused and never run,
 * and its child was reported as having changed no workspace paths.
 */
export async function observeReach(o: { readonly root: string; readonly reach: { readonly base: string } | null; readonly journal: WriteJournal; readonly agent: string; readonly limit?: number }, call: () => Promise<Observation>): Promise<Observation> {
  if (o.reach === null) return call();
  // The root as the native tools note their writes against it (`realPathOf` in the run host's `tools.ts`), and as the walk can
  // enter it: a workspace reached through a symbolic link was walked as the link, which `lstat` does not follow, so nothing was
  // observed, and a sibling's noted write never matched (fin36,
  // docs/defects/fixed/a-siblings-native-write-is-not-subtracted-from-an-observation-taken-through-a-symlinked-workspace.md).
  // It is that very function, the native resolution: fin36 first resolved the root with the JavaScript `realpathSync`, which on
  // Windows leaves a substituted drive, an 8.3 short name or a drive letter's case as given where the native one canonicalises
  // them, so the spellings could still differ there (fin36's review).
  const root = realPathOf(o.root);
  const mark = o.journal.mark();
  const before = await snapshotTree(root, o.reach.base, o.limit);
  const obs = await call();
  // The ruling's `unobserved` mark: the call ran and nothing names what it changed, so an erred one is not read as refused.
  if (before === null) return { ...obs, unobserved: true };
  const after = await snapshotTree(root, o.reach.base, o.limit);
  if (after === null) return { ...obs, unobserved: true };
  const others = o.journal.since(mark, o.agent);
  const rootAbs = resolve(root);
  const observedPaths = snapshotChanges(before, after).filter((p) => !others.has(resolve(rootAbs, p)));
  return { ...obs, observedPaths };
}
