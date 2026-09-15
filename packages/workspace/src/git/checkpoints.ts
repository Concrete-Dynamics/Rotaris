import { existsSync, lstatSync, mkdirSync, rmSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { millis, type Clocks, type Millis } from '@rotaris/kernel';
import { invokeGit, renderGitCommand, type GitResult } from './invoke.js';
import { excludedPath } from './paths.js';

/**
 * ADR-0039's Git side, executed for the first time: checkpoints are ordinary commits reachable only from
 * `refs/rotaris/checkpoints/<session-id>/<sequence>`, made through a PRIVATE index (`GIT_INDEX_FILE` set after
 * REQ-GIT-031's scrub, ADR-0039 §1) so the repository's own index is never opened; the path set computed by us from
 * explicit listings and filtered by REQ-GIT-003's predicate (§2); `gc.auto=0` on every invocation (§3); the
 * nothing-to-record comparison against HEAD's tree with every excluded path removed (§4). Every invocation goes
 * through `invokeGit` (ADR-0038) under one of REQ-GIT-033's two limits: 30 s for an invocation that only reads or
 * updates refs, 300 s for every one that inspects or writes tree content. Every refusal is a returned value
 * (REQ-GIT-052); nothing here raises past a programming error.
 *
 * Paths come back NUL-separated so they are bytes rather than Git's quoted display form; the helper decodes them as
 * UTF-8 with replacement (REQ-GIT-013), so a path that is not valid UTF-8 is carried with U+FFFD — a reading, recorded
 * on the ADR. Ascending path order is ascending byte order of the UTF-8 encoding (REQ-GIT-057), everywhere here.
 */
export const CHECKPOINT_REF_TIMEOUT: Millis = millis(30_000);
export const CHECKPOINT_TREE_TIMEOUT: Millis = millis(300_000);
export const CHECKPOINT_NAMESPACE = 'refs/rotaris/checkpoints';
/** REQ-GIT-032: the fixed identity, author and committer alike. */
export const CHECKPOINT_IDENTITY = { GIT_AUTHOR_NAME: 'rotaris', GIT_AUTHOR_EMAIL: 'rotaris@local', GIT_COMMITTER_NAME: 'rotaris', GIT_COMMITTER_EMAIL: 'rotaris@local' } as const;
/** Every checkpoint invocation carries this (ADR-0039 §3, REQ-GIT-030: no repack or garbage collection is started). */
const GC_OFF = ['-c', 'gc.auto=0'] as const;

export interface CheckpointDeps {
  readonly clocks: Clocks;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly executable?: string;
  readonly refTimeoutMs?: Millis;
  readonly treeTimeoutMs?: Millis;
}

export const checkpointRef = (sessionId: string, sequence: number, namespace = CHECKPOINT_NAMESPACE): string => `${namespace}/${sessionId}/${sequence}`;

/** REQ-GIT-036: the character set, non-empty, not starting `.`, not ending `.lock` — before any Git call; null when usable. */
export function refCheck(sessionId: string): string | null {
  const bad = sessionId === '' || !/^[A-Za-z0-9._-]+$/.test(sessionId) || sessionId.startsWith('.') || sessionId.endsWith('.lock');
  return bad ? `Session id is not usable in a Git ref name: ${sessionId}` : null;
}
/** REQ-GIT-036: a negative sequence is refused before any Git call. */
export function sequenceCheck(sequence: number): string | null {
  return Number.isInteger(sequence) && sequence >= 0 ? null : `Checkpoint sequence must not be negative: ${sequence}`;
}
/** REQ-GIT-042's sentence. */
export const notUsableTree = (path: string): string => `${path} is not inside a usable Git working tree.`;

/** REQ-GIT-033: the ladder with the applicable limit in whole seconds. */
export function checkpointFailureText(result: GitResult, args: readonly string[], limitMs: number): string {
  switch (result.outcome) {
    case 'cannot-start': return `Could not run Git: ${result.reason}`;
    case 'refused': return `Could not run Git: ${result.reason}`;
    case 'timed-out': return `Git timed out after ${Math.ceil(limitMs / 1000)}s: ${renderGitCommand(args)}`;
    case 'exited': {
      const stderr = result.stderr.trim();
      const stdout = result.stdout.trim();
      return stderr !== '' ? stderr : stdout !== '' ? stdout : 'git command failed';
    }
  }
}

/** REQ-GIT-057: byte order of the UTF-8 encoding, deterministic and locale-free. */
export function byteOrder(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}
export const sortPaths = (paths: Iterable<string>): string[] => [...paths].sort(byteOrder);

/** REQ-GIT-057's one-line reason: the first 5 in ascending path order, ` and <k> more`, then the force sentence after one space. */
export function dirtyReason(dirty: readonly string[]): string {
  const sorted = sortPaths(dirty);
  const shown = sorted.slice(0, 5).join(', ');
  const more = sorted.length > 5 ? ` and ${sorted.length - 5} more` : '';
  return `${sorted.length} uncommitted change(s) would be overwritten: ${shown}${more} Restore again with force to overwrite them.`;
}

/** REQ-GIT-063: the letter is never shown; every unknown letter renders `change`. */
export function verbFor(status: string): string {
  switch (status) {
    case 'A': return 'delete';
    case 'D': return 'recreate';
    case 'M': return 'overwrite';
    case 'R': return 'rename';
    default: return 'change';
  }
}

export interface PreviewEntry {
  /** REQ-GIT-039: the letter as Git reported it (the score stripped), carried through unchanged. */
  readonly status: string;
  /** The working-tree path. */
  readonly path: string;
  /** For `R`: the checkpoint's name for the path, which the restore recreates. */
  readonly otherPath?: string | undefined;
}

/** REQ-GIT-064: the one text, character for character, for every surface that shows a preview. */
export function previewText(sequence: number, entries: readonly PreviewEntry[], dirty: readonly string[], blockedReason: string): string {
  const lines: string[] = [];
  if (entries.length === 0 && blockedReason !== '') return blockedReason;
  if (entries.length === 0) lines.push(`Restoring checkpoint ${sequence} would change nothing.`);
  else {
    lines.push(`Restoring checkpoint ${sequence} would change ${entries.length} file(s):`);
    for (const e of [...entries].sort((a, b) => byteOrder(a.path, b.path))) lines.push(`  ${verbFor(e.status).padEnd(9, ' ')} ${e.path}`);
  }
  if (dirty.length > 0) {
    lines.push(`Warning: ${dirty.length} uncommitted change(s) would be overwritten:`);
    for (const p of sortPaths(dirty)) lines.push(`  ${p}`);
  }
  return lines.join('\n');
}

/** `for-each-ref --format=%(refname)%00%(objectname)`: one record per line; only numeric suffixes under the namespace count (REQ-GIT-037). */
export function parseRefListing(text: string, sessionId: string, namespace = CHECKPOINT_NAMESPACE): { sequence: number; commit: string; ref: string }[] {
  const prefix = `${namespace}/${sessionId}/`;
  const out: { sequence: number; commit: string; ref: string }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const [ref, commit] = line.split('\0');
    if (!ref || !commit || !ref.startsWith(prefix)) continue;
    const suffix = ref.slice(prefix.length);
    if (!/^\d+$/.test(suffix)) continue;
    out.push({ sequence: Number(suffix), commit: commit.trim(), ref });
  }
  return out.sort((a, b) => a.sequence - b.sequence);
}

/** `diff-tree -r -z`: `:<mode> <mode> <sha> <sha> <status>\0<path>\0` and, for a rename, `R<score>\0<old>\0<new>\0`. */
export function parseDiffTree(text: string): PreviewEntry[] {
  const parts = text.split('\0');
  const out: PreviewEntry[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    const meta = parts[i]!;
    if (!meta.startsWith(':')) continue;
    const fields = meta.split(' ');
    const raw = fields[4] ?? '';
    const status = raw.charAt(0);
    if (status === '') continue;
    if (status === 'R' || status === 'C') {
      const from = parts[i + 1] ?? '';
      const to = parts[i + 2] ?? '';
      i += 2;
      if (excludedPath(to) && excludedPath(from)) continue;
      out.push({ status, path: to, otherPath: from });
    } else {
      const path = parts[i + 1] ?? '';
      i += 1;
      if (excludedPath(path)) continue;
      out.push({ status, path });
    }
  }
  return out;
}

const nulList = (text: string): string[] => text.split('\0').filter((p) => p !== '');
const okText = (r: GitResult): string | null => (r.outcome === 'exited' && r.status === 0 ? r.stdout : null);

/** One operation's Git session: a counter, the two limits, and the private index files it made, removed at the end. */
class Session {
  invocations = 0;
  private readonly made: string[] = [];
  private n = 0;
  constructor(private readonly root: string, private readonly sessionId: string, private readonly deps: CheckpointDeps) {}

  /** ADR-0039 §1: under the product's directory, which REQ-GIT-003 excludes, so the index cannot capture itself. */
  privateIndex(): string {
    const dir = join(this.root, '.rotaris', 'checkpoints');
    mkdirSync(dir, { recursive: true });
    this.n += 1;
    const file = join(dir, `index-${this.sessionId}-${process.pid}-${Number(this.deps.clocks.monotonic.now()).toString(36)}-${this.n}`);
    this.made.push(file);
    return file;
  }
  async git(args: readonly string[], limit: 'ref' | 'tree', extra: { index?: string; stdin?: string; identity?: boolean; cwd?: string } = {}): Promise<{ result: GitResult; args: readonly string[]; limitMs: number }> {
    this.invocations += 1;
    const limitMs = Number(limit === 'ref' ? this.deps.refTimeoutMs ?? CHECKPOINT_REF_TIMEOUT : this.deps.treeTimeoutMs ?? CHECKPOINT_TREE_TIMEOUT);
    const setEnv: Record<string, string> = { ...(extra.index ? { GIT_INDEX_FILE: extra.index } : {}), ...(extra.identity ? CHECKPOINT_IDENTITY : {}) };
    const full = [...GC_OFF, ...args];
    const result = await invokeGit({
      args: full, workspaceRoot: extra.cwd ?? this.root, timeoutMs: millis(limitMs), timers: this.deps.clocks.timers, clock: this.deps.clocks.monotonic,
      ...(this.deps.env ? { env: this.deps.env } : {}), ...(this.deps.executable ? { executable: this.deps.executable } : {}),
      ...(Object.keys(setEnv).length > 0 ? { setEnv } : {}), ...(extra.stdin === undefined ? {} : { stdin: extra.stdin }),
    });
    return { result, args: full, limitMs };
  }
  /** A successful text, or the failure text of REQ-GIT-033. */
  async text(args: readonly string[], limit: 'ref' | 'tree', extra: Parameters<Session['git']>[2] = {}): Promise<{ ok: true; text: string } | { ok: false; detail: string }> {
    const r = await this.git(args, limit, extra);
    const text = okText(r.result);
    return text === null ? { ok: false, detail: checkpointFailureText(r.result, r.args, r.limitMs) } : { ok: true, text };
  }
  /** REQ-GIT-042: Git can be run and the root lies inside a working tree. */
  async inside(): Promise<boolean> {
    const r = await this.text(['rev-parse', '--is-inside-work-tree'], 'ref');
    return r.ok && r.text.trim() === 'true';
  }
  /** HEAD's commit, or null when unborn; a Git failure is `false`. */
  async head(): Promise<string | null | false> {
    const r = await this.git(['rev-parse', '--verify', '--quiet', 'HEAD'], 'ref');
    if (r.result.outcome === 'exited' && r.result.status === 0) return r.result.stdout.trim();
    if (r.result.outcome === 'exited' && r.result.stdout.trim() === '' && r.result.stderr.trim() === '') return null;
    return false;
  }
  /**
   * REQ-GIT-034 / ADR-0039 §2: the working tree's capture set — tracked paths (ignored-but-tracked included) minus the
   * ones deleted in the tree, plus the untracked-not-ignored ones when asked — filtered by OUR predicate, staged into a
   * fresh private index, written as a tree. Git records the mode, a symlink's target and a submodule's commit itself.
   */
  async stageWorkingTree(includeUntracked: boolean): Promise<{ ok: true; tree: string; paths: string[]; index: string } | { ok: false; detail: string }> {
    const tracked = await this.text(['ls-files', '-z'], 'tree');
    if (!tracked.ok) return tracked;
    const deleted = await this.text(['ls-files', '-z', '--deleted'], 'tree');
    if (!deleted.ok) return deleted;
    const gone = new Set(nulList(deleted.text));
    const set = new Set(nulList(tracked.text).filter((p) => !gone.has(p)));
    if (includeUntracked) {
      const others = await this.text(['ls-files', '-z', '--others', '--exclude-standard'], 'tree');
      if (!others.ok) return others;
      for (const p of nulList(others.text)) set.add(p);
    }
    const paths = sortPaths([...set].filter((p) => !excludedPath(p)));
    const index = this.privateIndex();
    if (paths.length > 0) {
      const staged = await this.text(['update-index', '--add', '--remove', '-z', '--stdin'], 'tree', { index, stdin: `${paths.join('\0')}\0` });
      if (!staged.ok) return staged;
    }
    const tree = await this.text(['write-tree'], 'tree', { index });
    if (!tree.ok) return tree;
    return { ok: true, tree: tree.text.trim(), paths, index };
  }
  /** ADR-0039 §4: HEAD's tree with every excluded path removed — built only when HEAD's top level has one. */
  async filteredHeadTree(head: string): Promise<{ ok: true; tree: string } | { ok: false; detail: string }> {
    const headTree = await this.text(['rev-parse', `${head}^{tree}`], 'ref');
    if (!headTree.ok) return headTree;
    const top = await this.text(['ls-tree', '--name-only', '-z', head], 'tree');
    if (!top.ok) return top;
    if (!nulList(top.text).some(excludedPath)) return { ok: true, tree: headTree.text.trim() };
    const index = this.privateIndex();
    const read = await this.text(['read-tree', head], 'tree', { index });
    if (!read.ok) return read;
    const listed = await this.text(['ls-files', '-z'], 'tree', { index });
    if (!listed.ok) return listed;
    const excluded = nulList(listed.text).filter(excludedPath);
    if (excluded.length > 0) {
      const removed = await this.text(['update-index', '--force-remove', '-z', '--stdin'], 'tree', { index, stdin: `${excluded.join('\0')}\0` });
      if (!removed.ok) return removed;
    }
    const tree = await this.text(['write-tree'], 'tree', { index });
    return tree.ok ? { ok: true, tree: tree.text.trim() } : tree;
  }
  dispose(): void {
    for (const f of this.made) { try { rmSync(f, { force: true }); } catch { /* scratch */ } }
  }
}

/** REQ-GIT-042: true exactly when Git runs and the root is inside a working tree; false without raising. */
export async function available(treeRoot: string, deps: CheckpointDeps): Promise<boolean> {
  const s = new Session(treeRoot, 'probe', deps);
  const version = await s.text(['--version'], 'ref');
  if (!version.ok) return false;
  return s.inside();
}

export type RefListing = { readonly ok: true; readonly entries: readonly { sequence: number; commit: string; ref: string }[]; readonly invocations: number } | { readonly ok: false; readonly detail: string; readonly invocations: number };

/** REQ-GIT-037: only this session's namespace (the trailing slash), numeric suffixes only, numeric order. */
export async function listRefs(treeRoot: string, sessionId: string, deps: CheckpointDeps, namespace = CHECKPOINT_NAMESPACE): Promise<RefListing> {
  const bad = refCheck(sessionId);
  if (bad) return { ok: false, detail: bad, invocations: 0 };
  const s = new Session(treeRoot, sessionId, deps);
  const r = await s.text(['for-each-ref', '--format=%(refname)%00%(objectname)', `${namespace}/${sessionId}/`], 'ref');
  if (!r.ok) return { ok: false, detail: r.detail, invocations: s.invocations };
  return { ok: true, entries: parseRefListing(r.text, sessionId, namespace), invocations: s.invocations };
}

/** REQ-GIT-038: the ref's commit, or null when the ref is gone (never an error for that). */
export async function resolveRef(treeRoot: string, sessionId: string, sequence: number, deps: CheckpointDeps, namespace = CHECKPOINT_NAMESPACE): Promise<string | null> {
  if (refCheck(sessionId) || sequenceCheck(sequence)) return null;
  const s = new Session(treeRoot, sessionId, deps);
  const r = await s.git(['rev-parse', '--verify', '--quiet', `${checkpointRef(sessionId, sequence, namespace)}^{commit}`], 'ref');
  return r.result.outcome === 'exited' && r.result.status === 0 ? r.result.stdout.trim() : null;
}

export interface CaptureInput {
  readonly sessionId: string;
  readonly sequence: number;
  readonly includeUntracked: boolean;
  readonly namespace?: string;
  /** Improvement rollback points record a clean committed tree as a durable ref too. */
  readonly recordClean?: boolean;
  /** REQ-GIT-047 / REQ-GIT-058 gate 5: the caller renders the message; this layer commits it verbatim. */
  readonly message: string;
}
export type CaptureOutcome =
  | { readonly outcome: 'recorded'; readonly ref: string; readonly commit: string; readonly tree: string; readonly files: readonly string[]; readonly invocations: number; readonly elapsedMs: number }
  | { readonly outcome: 'nothing-to-record'; readonly invocations: number; readonly elapsedMs: number }
  | { readonly outcome: 'unavailable'; readonly detail: string; readonly invocations: number; readonly elapsedMs: number }
  | { readonly outcome: 'failed'; readonly detail: string; readonly invocations: number; readonly elapsedMs: number };

/**
 * REQ-GIT-029/030/032/034/035/046: the capture. Write the tree, write the commit, create the ref (refusing to
 * overwrite one: `update-ref` with the empty old value); HEAD, the branch, the reflogs, the index file and the stash
 * are never named, so they cannot move (REQ-GIT-004).
 */
export async function capture(treeRoot: string, input: CaptureInput, deps: CheckpointDeps): Promise<CaptureOutcome> {
  const started = Number(deps.clocks.monotonic.now());
  const s = new Session(treeRoot, input.sessionId, deps);
  const done = <T extends Omit<CaptureOutcome, 'invocations' | 'elapsedMs'>>(o: T): T & { invocations: number; elapsedMs: number } => { s.dispose(); return { ...o, invocations: s.invocations, elapsedMs: Math.round(Number(deps.clocks.monotonic.now()) - started) }; };
  const bad = refCheck(input.sessionId) ?? sequenceCheck(input.sequence);
  if (bad) return done({ outcome: 'failed', detail: bad });
  try {
    if (!(await s.inside())) return done({ outcome: 'unavailable', detail: notUsableTree(treeRoot) });
    const head = await s.head();
    if (head === false) return done({ outcome: 'failed', detail: 'HEAD could not be read' });
    const staged = await s.stageWorkingTree(input.includeUntracked);
    if (!staged.ok) return done({ outcome: 'failed', detail: staged.detail });
    if (head === null) {
      // REQ-GIT-034: no commits and an empty recorded tree is "nothing to record".
      if (staged.paths.length === 0) return done({ outcome: 'nothing-to-record' });
    } else {
      const filtered = await s.filteredHeadTree(head);
      if (!filtered.ok) return done({ outcome: 'failed', detail: filtered.detail });
      if (filtered.tree === staged.tree && input.recordClean !== true) return done({ outcome: 'nothing-to-record' });
    }
    const commit = await s.text(['commit-tree', staged.tree, ...(head === null ? [] : ['-p', head]), '-m', input.message], 'tree', { identity: true });
    if (!commit.ok) return done({ outcome: 'failed', detail: commit.detail });
    const ref = checkpointRef(input.sessionId, input.sequence, input.namespace);
    // REQ-GIT-046: the empty old value makes the update refuse an existing ref rather than clobber it.
    const created = await s.text(['update-ref', ref, commit.text.trim(), ''], 'ref');
    if (!created.ok) return done({ outcome: 'failed', detail: created.detail });
    // REQ-GIT-038: the paths the commit changed relative to its parent; the whole tree when parentless.
    const changed = head === null
      ? await s.text(['ls-tree', '-r', '--name-only', '-z', commit.text.trim()], 'tree')
      : await s.text(['diff-tree', '--name-only', '-r', '-z', head, commit.text.trim()], 'tree');
    const files = changed.ok ? sortPaths(nulList(changed.text).filter((p) => !excludedPath(p))) : [];
    return done({ outcome: 'recorded', ref, commit: commit.text.trim(), tree: staged.tree, files });
  } catch (cause) {
    return done({ outcome: 'failed', detail: String(cause instanceof Error ? cause.message : cause) });
  }
}

export interface PreviewInput {
  readonly sessionId: string;
  readonly sequence: number;
  /** The recorded commit of the checkpoint; the ref is resolved too, so a pruned ref is reported as gone (REQ-GIT-055). */
  readonly commit: string;
  readonly includeUntracked: boolean;
  /** REQ-GIT-056: the drift candidates, newest first — the caller's 10 most recent recorded plus the last restored. */
  readonly candidates: readonly { readonly sequence: number; readonly commit: string }[];
  readonly namespace?: string;
}
export interface PreviewOutcome {
  /** `ok` | `unmanaged` (gate 2's first sentence) | `ref-gone` (its second) | `inspect-failed` (gate 3). */
  readonly treeState: 'ok' | 'unmanaged' | 'ref-gone' | 'inspect-failed';
  readonly entries: readonly PreviewEntry[];
  readonly dirty: readonly string[];
  readonly blockedReason: string;
  readonly text: string;
  readonly invocations: number;
  readonly elapsedMs: number;
}

/** REQ-GIT-039/055/056/057: the checkpoint's tree against the working tree as a capture would stage it, and the drift check. */
export async function preview(treeRoot: string, input: PreviewInput, deps: CheckpointDeps): Promise<PreviewOutcome> {
  const started = Number(deps.clocks.monotonic.now());
  const s = new Session(treeRoot, input.sessionId, deps);
  const done = (o: Omit<PreviewOutcome, 'text' | 'invocations' | 'elapsedMs'>): PreviewOutcome => {
    s.dispose();
    return { ...o, text: previewText(input.sequence, o.entries, o.dirty, o.blockedReason), invocations: s.invocations, elapsedMs: Math.round(Number(deps.clocks.monotonic.now()) - started) };
  };
  const refuse = (treeState: PreviewOutcome['treeState'], reason: string): PreviewOutcome => done({ treeState, entries: [], dirty: [], blockedReason: reason });
  const bad = refCheck(input.sessionId) ?? sequenceCheck(input.sequence);
  if (bad) return refuse('inspect-failed', `Git could not inspect checkpoint ${input.sequence}: ${bad}`);
  try {
    if (!(await s.inside())) return refuse('unmanaged', `${treeRoot} is not inside a Git working tree, so checkpoint ${input.sequence} cannot be restored.`);
    const live = await s.git(['rev-parse', '--verify', '--quiet', `${checkpointRef(input.sessionId, input.sequence, input.namespace)}^{commit}`], 'ref');
    if (!(live.result.outcome === 'exited' && live.result.status === 0)) return refuse('ref-gone', `Checkpoint ${input.sequence} is recorded for session ${input.sessionId} but its Git snapshot is gone, so it can no longer be restored.`);
    const target = await s.text(['rev-parse', `${input.commit}^{tree}`], 'ref');
    if (!target.ok) return refuse('inspect-failed', `Git could not inspect checkpoint ${input.sequence}: ${target.detail}`);
    const staged = await s.stageWorkingTree(input.includeUntracked);
    if (!staged.ok) return refuse('inspect-failed', `Git could not inspect checkpoint ${input.sequence}: ${staged.detail}`);
    // REQ-GIT-039: checkpoint → working tree at 50 % rename similarity, copies off; the letter states what the restore does.
    const diff = await s.text(['diff-tree', '-r', '-z', '-M50%', target.text.trim(), staged.tree], 'tree');
    if (!diff.ok) return refuse('inspect-failed', `Git could not inspect checkpoint ${input.sequence}: ${diff.detail}`);
    const entries = parseDiffTree(diff.text);
    const touched = new Set(entries.flatMap((e) => (e.otherPath ? [e.path, e.otherPath] : [e.path])));
    // REQ-GIT-056: the drift check — the baseline is a recorded checkpoint, never HEAD.
    let dirty: string[] = [];
    if (input.candidates.length > 0 && touched.size > 0) {
      let baseline: string | null = null;
      let equal = false;
      for (const c of input.candidates) {
        const tree = await s.text(['rev-parse', `${c.commit}^{tree}`], 'ref');
        if (!tree.ok) continue;
        if (tree.text.trim() === staged.tree) { equal = true; break; }
        if (baseline === null) baseline = tree.text.trim();
      }
      if (!equal) {
        if (baseline === null) dirty = sortPaths(touched);
        else {
          const differs = await s.text(['diff-tree', '-r', '-z', '--name-only', baseline, staged.tree], 'tree');
          if (!differs.ok) dirty = sortPaths(touched);
          else {
            const changed = new Set(nulList(differs.text));
            dirty = sortPaths([...touched].filter((p) => changed.has(p)));
          }
        }
      }
    }
    return done({ treeState: 'ok', entries, dirty, blockedReason: dirty.length > 0 ? dirtyReason(dirty) : '' });
  } catch (cause) {
    return refuse('inspect-failed', `Git could not inspect checkpoint ${input.sequence}: ${String(cause instanceof Error ? cause.message : cause)}`);
  }
}

export interface RestoreInput {
  readonly sessionId: string;
  readonly sequence: number;
  readonly commit: string;
  /** The preview's entries: what the restore deletes (`A`, and the working-tree name of an `R`) and what it touches. */
  readonly entries: readonly PreviewEntry[];
}
export type RestoreOutcome =
  | { readonly ok: true; readonly touched: readonly string[]; readonly invocations: number; readonly elapsedMs: number }
  | { readonly ok: false; readonly detail: string; readonly invocations: number; readonly elapsedMs: number };

/**
 * REQ-GIT-040/043/061: the checkpoint's tree read into a private index and materialised through Git
 * (`checkout-index -a -f`, so the repository's line-ending normalisation applies by construction), then the paths the
 * checkpoint does not hold deleted by us — never an ignored path, never one under `.rotaris/`, never following a
 * link. HEAD and the branch are not named and do not move.
 */
export async function restore(treeRoot: string, input: RestoreInput, deps: CheckpointDeps): Promise<RestoreOutcome> {
  const started = Number(deps.clocks.monotonic.now());
  const s = new Session(treeRoot, input.sessionId, deps);
  const done = <T extends Omit<RestoreOutcome, 'invocations' | 'elapsedMs'>>(o: T): T & { invocations: number; elapsedMs: number } => { s.dispose(); return { ...o, invocations: s.invocations, elapsedMs: Math.round(Number(deps.clocks.monotonic.now()) - started) }; };
  try {
    const index = s.privateIndex();
    const read = await s.text(['read-tree', input.commit], 'tree', { index });
    if (!read.ok) return done({ ok: false, detail: read.detail });
    const out = await s.text(['checkout-index', '-a', '-f'], 'tree', { index });
    if (!out.ok) return done({ ok: false, detail: out.detail });
    const touched = new Set<string>();
    const root = resolve(treeRoot);
    for (const e of input.entries) {
      touched.add(e.path);
      if (e.otherPath) touched.add(e.otherPath);
      if (e.status !== 'A' && e.status !== 'R') continue;
      if (excludedPath(e.path)) continue;
      const target = resolve(root, e.path);
      if (!target.startsWith(root)) continue;
      try {
        // lstat, never stat: a link is removed as a link and its target is left alone (REQ-GIT-003).
        const st = lstatSync(target);
        if (st.isDirectory()) continue;
        unlinkSync(target);
      } catch { /* already absent */ }
    }
    return done({ ok: true, touched: sortPaths(touched) });
  } catch (cause) {
    return done({ ok: false, detail: String(cause instanceof Error ? cause.message : cause) });
  }
}

/** REQ-GIT-041: delete the named refs with the compare-and-swap on the recorded commit; a moved ref is left alone. */
export async function deleteRefs(treeRoot: string, sessionId: string, refs: readonly { readonly ref: string; readonly commit: string }[], deps: CheckpointDeps): Promise<{ deleted: number; failed: { ref: string; detail: string }[] }> {
  const s = new Session(treeRoot, sessionId, deps);
  let deleted = 0;
  const failed: { ref: string; detail: string }[] = [];
  for (const r of refs) {
    const d = await s.text(['update-ref', '-d', r.ref, r.commit], 'ref');
    if (d.ok) deleted += 1;
    else failed.push({ ref: r.ref, detail: d.detail });
  }
  return { deleted, failed };
}

/** REQ-GIT-041: every ref of the session except its `keep` most recent (`keep <= 0` removes all); idempotent. */
export async function prune(treeRoot: string, sessionId: string, keep: number, deps: CheckpointDeps, namespace = CHECKPOINT_NAMESPACE): Promise<{ deleted: number; detail?: string }> {
  const listed = await listRefs(treeRoot, sessionId, deps, namespace);
  if (!listed.ok) return { deleted: 0, detail: listed.detail };
  const victims = keep <= 0 ? [...listed.entries] : listed.entries.slice(0, Math.max(0, listed.entries.length - keep));
  const r = await deleteRefs(treeRoot, sessionId, victims, deps);
  return r.failed.length > 0 ? { deleted: r.deleted, detail: r.failed.map((f) => `${f.ref}: ${f.detail}`).join('; ') } : { deleted: r.deleted };
}
export const deleteNamespace = (treeRoot: string, sessionId: string, deps: CheckpointDeps, namespace = CHECKPOINT_NAMESPACE): Promise<{ deleted: number; detail?: string }> => prune(treeRoot, sessionId, 0, deps, namespace);

/** A tree root that exists on disk; the Git question (REQ-GIT-042) is asked separately. */
export const treeRootExists = (path: string): boolean => existsSync(path);
