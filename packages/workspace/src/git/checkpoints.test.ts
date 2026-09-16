import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { millis, type Clocks } from '@rotaris/kernel';
import { nodeClocks } from '@rotaris/platform';
import {
  available, capture, checkpointRef, deleteRefs, dirtyReason, isNetworkSubcommand, listRefs, parseDiffTree, parseRefListing, preview, previewText, prune, refCheck, renderGitCommand, resolveRef, restore, sequenceCheck, subcommandIndex, verbFor,
} from '../index.js';

/**
 * ADR-0039's first execution, unit half: the Git side against scratch repositories this test creates (REQ-GIT-003/004/
 * 029..043/046/055..057/063/064). The pure pieces — the ref-name check, the letters, the two texts — need no repository.
 */
/**
 * REQ-GIT-033's bound reaches Git through ADR-0006's timer port, so a test that wants the bound REACHED fires it
 * rather than racing it. A zero bound is fired at once here; every other delay keeps the real timer. The falsified
 * form, kept: a 1 ms bound, which on a warm filesystem lost the race — Git exited first and the sentence named a
 * LATER invocation than the one the proof is about (found on Linux, 2026-09-16, where the same test had passed on
 * Windows for the same reason in reverse). A bound decided by how fast the host's disk is proves nothing.
 */
function firesZeroAtOnce(real: Clocks): Clocks {
  return {
    monotonic: real.monotonic,
    wall: real.wall,
    timers: {
      after: (delay, fn) => (Number(delay) === 0 ? (queueMicrotask(fn), { cancel: () => undefined }) : real.timers.after(delay, fn)),
      every: (period, fn) => real.timers.every(period, fn),
    },
  };
}
const clocks = nodeClocks();
let gitPresent = true;
try { execFileSync('git', ['--version'], { stdio: 'ignore' }); } catch { gitPresent = false; }
const deps = { clocks };
const SID = 'sess-0001';

describe('ADR-0039 pure pieces', () => {
  it('REQ-GIT-036: the ref-name and sequence checks, before any Git call', () => {
    expect(refCheck('abc.DEF_1-2')).toBeNull();
    expect(refCheck('')).toBe('Session id is not usable in a Git ref name: ');
    expect(refCheck('.hidden')).toBe('Session id is not usable in a Git ref name: .hidden');
    expect(refCheck('x.lock')).toBe('Session id is not usable in a Git ref name: x.lock');
    expect(refCheck('a/b')).toBe('Session id is not usable in a Git ref name: a/b');
    expect(sequenceCheck(0)).toBeNull();
    expect(sequenceCheck(-1)).toBe('Checkpoint sequence must not be negative: -1');
  });
  it('REQ-GIT-063/064/057: the verbs, the preview text character for character, the dirty reason', () => {
    expect(['A', 'D', 'M', 'R', 'T'].map(verbFor)).toEqual(['delete', 'recreate', 'overwrite', 'rename', 'change']);
    const text = previewText(3, [{ status: 'M', path: 'b.txt' }, { status: 'A', path: 'a.txt' }, { status: 'R', path: 'z.txt', otherPath: 'y.txt' }, { status: 'X', path: 'q' }], ['b.txt', 'a.txt'], dirtyReason(['b.txt', 'a.txt']));
    expect(text).toBe([
      'Restoring checkpoint 3 would change 4 file(s):',
      '  delete    a.txt',
      '  overwrite b.txt',
      '  change    q',
      '  rename    z.txt',
      'Warning: 2 uncommitted change(s) would be overwritten:',
      '  a.txt',
      '  b.txt',
    ].join('\n'));
    expect(previewText(4, [], [], '')).toBe('Restoring checkpoint 4 would change nothing.');
    expect(previewText(4, [], [], 'Checkpoint 4 is recorded for session s but its Git snapshot is gone, so it can no longer be restored.')).toBe('Checkpoint 4 is recorded for session s but its Git snapshot is gone, so it can no longer be restored.');
    expect(dirtyReason(['f', 'e', 'd', 'c', 'b', 'a', 'g'])).toBe('7 uncommitted change(s) would be overwritten: a, b, c, d, e and 2 more Restore again with force to overwrite them.');
    // Byte order, not locale order: 'B' (0x42) sorts before 'a' (0x61).
    expect(dirtyReason(['a', 'B'])).toBe('2 uncommitted change(s) would be overwritten: B, a Restore again with force to overwrite them.');
  });
  it('REQ-GIT-037: the listing keeps only this namespace and numeric suffixes, sorted numerically', () => {
    const text = [
      `refs/rotaris/checkpoints/${SID}/10\0aaaa`, `refs/rotaris/checkpoints/${SID}/9\0bbbb`, `refs/rotaris/checkpoints/${SID}/1\0cccc`,
      `refs/rotaris/checkpoints/${SID}-other/2\0dddd`, `refs/rotaris/checkpoints/${SID}/x\0eeee`,
    ].join('\n');
    expect(parseRefListing(text, SID).map((e) => [e.sequence, e.commit])).toEqual([[1, 'cccc'], [9, 'bbbb'], [10, 'aaaa']]);
  });
  it('REQ-GIT-039: the diff-tree records, a rename carrying the working-tree name, the excluded paths dropped, an unknown letter kept', () => {
    const text = ':100644 100644 a b M\0m.txt\0:000000 100644 0 c A\0new.txt\0:100644 000000 d 0 D\0old.txt\0:100644 100644 e e R100\0from.txt\0to.txt\0:100644 100644 f g T\0.Rotaris/x\0:100644 100644 h i X\0odd\0';
    expect(parseDiffTree(text)).toEqual([{ status: 'M', path: 'm.txt' }, { status: 'A', path: 'new.txt' }, { status: 'D', path: 'old.txt' }, { status: 'R', path: 'to.txt', otherPath: 'from.txt' }, { status: 'X', path: 'odd' }]);
  });
  it('ADR-0038 chokepoint (found on this execution): a global option before the subcommand no longer hides a network subcommand; the rendering starts at the subcommand', () => {
    expect(subcommandIndex(['-c', 'gc.auto=0', 'push', 'origin'])).toBe(2);
    expect(isNetworkSubcommand(['-c', 'gc.auto=0', 'push', 'origin'])).toBe(true);
    expect(isNetworkSubcommand(['-c', 'gc.auto=0', 'write-tree'])).toBe(false);
    expect(renderGitCommand(['-c', 'gc.auto=0', 'update-index', '--add', '-z', '--stdin'])).toBe('update-index --add -z --stdin');
  });
});

describe.skipIf(!gitPresent)('ADR-0039 against scratch repositories', () => {
  let root: string;
  let ws: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'rotaris-ckpt-')); ws = join(root, 'ws'); mkdirSync(ws); });
  afterEach(() => { try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* held briefly on Windows; left to the temp folder */ } });
  const env = { ...process.env, GIT_AUTHOR_NAME: 'user', GIT_AUTHOR_EMAIL: 'user@x', GIT_COMMITTER_NAME: 'user', GIT_COMMITTER_EMAIL: 'user@x' };
  const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env }).toString();
  const init = (cwd: string) => {
    git(cwd, 'init', '-q', '-b', 'main');
    git(cwd, 'config', 'core.autocrlf', 'false');
    git(cwd, 'config', 'commit.gpgsign', 'false');
  };
  /** REQ-GIT-004's observables, as one comparable value. */
  const fingerprint = (cwd: string) => {
    const indexPath = git(cwd, 'rev-parse', '--git-path', 'index').trim();
    const index = existsSync(join(cwd, indexPath)) ? readFileSync(join(cwd, indexPath)).toString('hex') : existsSync(indexPath) ? readFileSync(indexPath).toString('hex') : '';
    let symbolic = 'detached';
    try { symbolic = git(cwd, 'symbolic-ref', '-q', 'HEAD').trim(); } catch { /* detached */ }
    let head = '';
    try { head = git(cwd, 'rev-parse', '--verify', '-q', 'HEAD').trim(); } catch { /* unborn */ }
    const branches = git(cwd, 'branch', '--list', '--format=%(refname) %(objectname)');
    let headLog = '';
    try { headLog = git(cwd, 'reflog', 'show', '--format=%H %gs', 'HEAD'); } catch { /* none */ }
    const branchLogs = branches.split(/\r?\n/).filter((l) => l !== '').map((l) => { try { return git(cwd, 'reflog', 'show', '--format=%H %gs', l.split(' ')[0]!); } catch { return ''; } }).join('|');
    let stash = '';
    try { stash = git(cwd, 'stash', 'list'); } catch { /* none */ }
    const staged = git(cwd, 'diff', '--cached', '--name-status');
    return { head, symbolic, index, branches, headLog, branchLogs, stash, staged };
  };
  const seed = () => {
    init(ws);
    writeFileSync(join(ws, '.gitignore'), 'ignored.log\n');
    writeFileSync(join(ws, 'README.md'), '# seed\n');
    writeFileSync(join(ws, 'src.txt'), 'one\n');
    mkdirSync(join(ws, 'dir'));
    writeFileSync(join(ws, 'dir', 'nested.txt'), 'nested\n');
    git(ws, 'add', '.');
    git(ws, 'commit', '-q', '-m', 'seed');
  };

  it('REQ-GIT-042: availability is a question to Git', async () => {
    expect(await available(ws, deps)).toBe(false);
    seed();
    expect(await available(ws, deps)).toBe(true);
    expect(await available(join(root, 'absent'), deps)).toBe(false);
    const r = await capture(join(root, 'absent'), { sessionId: SID, sequence: 1, includeUntracked: true, message: 'x' }, deps);
    expect(r.outcome).toBe('unavailable');
    if (r.outcome === 'unavailable') expect(r.detail).toBe(`${join(root, 'absent')} is not inside a usable Git working tree.`);
  });

  it('REQ-GIT-004/029/032/034/035/038/046: a capture records the working tree as a commit under the ref and leaves every observable of the user\'s state identical', async () => {
    seed();
    writeFileSync(join(ws, 'src.txt'), 'one\ntwo\n');
    writeFileSync(join(ws, 'new.txt'), 'untracked\n');
    writeFileSync(join(ws, 'ignored.log'), 'ignored\n');
    mkdirSync(join(ws, '.Rotaris', 'deep'), { recursive: true });
    writeFileSync(join(ws, '.Rotaris', 'deep', 'state.json'), '{}');
    // A staged entry that must survive byte for byte: the index file is REQ-GIT-004's sharpest observable.
    writeFileSync(join(ws, 'staged.txt'), 'staged\n');
    git(ws, 'add', 'staged.txt');
    let linked = false;
    try { symlinkSync('README.md', join(ws, 'link.md')); linked = true; } catch { /* no symlink privilege on this platform */ }
    const before = fingerprint(ws);
    const indexFile = join(root, 'inherited-index');
    writeFileSync(indexFile, 'not an index at all');
    const withInherited = { ...deps, env: { ...process.env, GIT_INDEX_FILE: indexFile, GIT_AUTHOR_NAME: 'someone-else' } };
    const r = await capture(ws, { sessionId: SID, sequence: 1, includeUntracked: true, message: `rotaris checkpoint 1 for session ${SID} (iteration 1)` }, withInherited);
    expect(r.outcome).toBe('recorded');
    if (r.outcome !== 'recorded') return;
    expect(r.ref).toBe(checkpointRef(SID, 1));
    expect(r.invocations).toBeGreaterThan(0);
    // The commit: fixed identity both sides, the message verbatim, the parent HEAD.
    expect(git(ws, 'log', '-1', '--format=%an <%ae>%n%cn <%ce>%n%s%n%P', r.commit).trim().split(/\r?\n/)).toEqual(['rotaris <rotaris@local>', 'rotaris <rotaris@local>', `rotaris checkpoint 1 for session ${SID} (iteration 1)`, before.head]);
    // The tree: the edit, the untracked file, the staged file (its working-tree content); never the ignored file, never `.Rotaris/`.
    const tree = git(ws, 'ls-tree', '-r', '--name-only', r.commit).trim().split(/\r?\n/);
    expect(tree).toContain('src.txt');
    expect(tree).toContain('new.txt');
    expect(tree).toContain('staged.txt');
    expect(tree).not.toContain('ignored.log');
    expect(tree.some((p) => /^\.rotaris\//i.test(p))).toBe(false);
    expect(git(ws, 'show', `${r.commit}:src.txt`)).toBe('one\ntwo\n');
    if (linked) expect(git(ws, 'ls-tree', r.commit, 'link.md')).toMatch(/^120000 blob/);
    expect(r.files).toEqual(['new.txt', 'src.txt', 'staged.txt', ...(linked ? ['link.md'] : [])].sort());
    // REQ-GIT-004: every observable identical; REQ-GIT-031: the inherited index file untouched.
    expect(fingerprint(ws)).toEqual(before);
    expect(readFileSync(indexFile, 'utf8')).toBe('not an index at all');
    // The only addition: one ref under the namespace, reachable from nowhere else.
    expect(git(ws, 'for-each-ref', '--format=%(refname)', 'refs/rotaris/').trim()).toBe(checkpointRef(SID, 1));
    const listed = await listRefs(ws, SID, deps);
    expect(listed.ok && listed.entries.map((e) => [e.sequence, e.commit])).toEqual([[1, r.commit]]);
    expect(await resolveRef(ws, SID, 1, deps)).toBe(r.commit);
    expect(await resolveRef(ws, SID, 7, deps)).toBeNull();
    // REQ-GIT-046: the same sequence again is refused by Git's empty-old-value, never clobbered.
    const again = await capture(ws, { sessionId: SID, sequence: 1, includeUntracked: true, message: 'again' }, deps);
    expect(again.outcome).toBe('failed');
    expect(await resolveRef(ws, SID, 1, deps)).toBe(r.commit);
    // No private index file is left behind.
    expect(existsSync(join(ws, '.rotaris', 'checkpoints')) ? readdirSync(join(ws, '.rotaris', 'checkpoints')) : []).toEqual([]);
  });

  it('REQ-GIT-034/003: nothing to record on a clean tree, and on a tree whose only difference from HEAD lies under .rotaris/ — even when HEAD tracks paths there', async () => {
    seed();
    const clean = await capture(ws, { sessionId: SID, sequence: 1, includeUntracked: true, message: 'm' }, deps);
    expect(clean.outcome).toBe('nothing-to-record');
    // HEAD tracks a path under .rotaris/ (ADR-0039 §4: the filtered HEAD tree keeps "nothing to record" reachable).
    mkdirSync(join(ws, '.rotaris'), { recursive: true });
    writeFileSync(join(ws, '.rotaris', 'tracked.txt'), 'tracked\n');
    git(ws, 'add', '-f', '.rotaris/tracked.txt');
    git(ws, 'commit', '-q', '-m', 'tracks the product directory');
    writeFileSync(join(ws, '.rotaris', 'tracked.txt'), 'changed under the product directory\n');
    writeFileSync(join(ws, '.rotaris', 'scratch.txt'), 'scratch\n');
    const only = await capture(ws, { sessionId: SID, sequence: 1, includeUntracked: true, message: 'm' }, deps);
    expect(only.outcome).toBe('nothing-to-record');
    // A change outside it is recorded, and the recorded tree still holds nothing under .rotaris/.
    writeFileSync(join(ws, 'src.txt'), 'changed\n');
    const rec = await capture(ws, { sessionId: SID, sequence: 1, includeUntracked: true, message: 'm' }, deps);
    expect(rec.outcome).toBe('recorded');
    if (rec.outcome === 'recorded') expect(git(ws, 'ls-tree', '-r', '--name-only', rec.commit)).not.toMatch(/\.rotaris/i);
    // Tracked-only capture (REQ-GIT-035): an untracked file is not recorded.
    writeFileSync(join(ws, 'later.txt'), 'later\n');
    const trackedOnly = await capture(ws, { sessionId: SID, sequence: 2, includeUntracked: false, message: 'm' }, deps);
    expect(trackedOnly.outcome).toBe('recorded');
    if (trackedOnly.outcome === 'recorded') expect(git(ws, 'ls-tree', '-r', '--name-only', trackedOnly.commit)).not.toContain('later.txt');
  });

  it('REQ-GIT-034: an unborn repository records a parentless commit, and an empty one is nothing to record', async () => {
    init(ws);
    const empty = await capture(ws, { sessionId: SID, sequence: 1, includeUntracked: true, message: 'm' }, deps);
    expect(empty.outcome).toBe('nothing-to-record');
    writeFileSync(join(ws, 'first.txt'), 'first\n');
    const r = await capture(ws, { sessionId: SID, sequence: 1, includeUntracked: true, message: 'm' }, deps);
    expect(r.outcome).toBe('recorded');
    if (r.outcome !== 'recorded') return;
    expect(git(ws, 'log', '-1', '--format=%P', r.commit).trim()).toBe('');
    expect(r.files).toEqual(['first.txt']);
    // HEAD is still unborn: the capture created no branch.
    expect(() => git(ws, 'rev-parse', '--verify', '-q', 'HEAD')).toThrow();
  });

  it('REQ-GIT-039/040/056/057/061: the preview letters state what the restore does; the restore puts the tree back and touches exactly the union; drift against a recorded baseline', async () => {
    seed();
    writeFileSync(join(ws, 'src.txt'), 'one\ntwo\n');
    const c1 = await capture(ws, { sessionId: SID, sequence: 1, includeUntracked: true, message: 'c1' }, deps);
    expect(c1.outcome).toBe('recorded');
    if (c1.outcome !== 'recorded') return;
    // Then: edit (M), delete a tracked file (D), create a new file (A), rename by content (R), and a file under .rotaris/ (never seen).
    writeFileSync(join(ws, 'src.txt'), 'one\ntwo\nthree\n');
    rmSync(join(ws, 'dir', 'nested.txt'));
    writeFileSync(join(ws, 'created.txt'), 'created after the checkpoint\n');
    writeFileSync(join(ws, 'moved.md'), '# seed\n');
    rmSync(join(ws, 'README.md'));
    mkdirSync(join(ws, '.rotaris'), { recursive: true });
    writeFileSync(join(ws, '.rotaris', 'x'), 'x');
    const before = fingerprint(ws);
    const p = await preview(ws, { sessionId: SID, sequence: 1, commit: c1.commit, includeUntracked: true, candidates: [{ sequence: 1, commit: c1.commit }] }, deps);
    expect(p.treeState).toBe('ok');
    const byPath = Object.fromEntries(p.entries.map((e) => [e.path, e]));
    expect(byPath['src.txt']?.status).toBe('M');
    expect(byPath['dir/nested.txt']?.status).toBe('D');
    expect(byPath['created.txt']?.status).toBe('A');
    expect(byPath['moved.md']).toEqual({ status: 'R', path: 'moved.md', otherPath: 'README.md' });
    expect(p.entries.some((e) => /rotaris/i.test(e.path))).toBe(false);
    // REQ-GIT-056: the tree differs from the only candidate, so the dirty set is (differs from baseline) ∩ (touched) — the four
    // entries plus the rename's checkpoint-side name, which the restore recreates and which the baseline holds differently.
    expect(p.dirty).toEqual(['README.md', 'created.txt', 'dir/nested.txt', 'moved.md', 'src.txt']);
    expect(p.blockedReason).toBe('5 uncommitted change(s) would be overwritten: README.md, created.txt, dir/nested.txt, moved.md, src.txt Restore again with force to overwrite them.');
    expect(p.text.split('\n')[0]).toBe('Restoring checkpoint 1 would change 4 file(s):');
    expect(p.text).toContain('  rename    moved.md');
    expect(p.text).toContain('  recreate  dir/nested.txt');
    // No candidate at all → no drift (gate 1 refuses such a restore before drift can matter).
    const none = await preview(ws, { sessionId: SID, sequence: 1, commit: c1.commit, includeUntracked: true, candidates: [] }, deps);
    expect(none.dirty).toEqual([]);
    // No candidate readable → drift with the whole touched set.
    const unreadable = await preview(ws, { sessionId: SID, sequence: 1, commit: c1.commit, includeUntracked: true, candidates: [{ sequence: 9, commit: '0'.repeat(40) }] }, deps);
    expect(unreadable.dirty.length).toBe(5);
    // The preview touched nothing (REQ-GIT-004).
    expect(fingerprint(ws)).toEqual(before);
    // The restore: contents back, the created file gone, the rename's working name gone, .rotaris/ untouched, HEAD and the branch where they were.
    const r = await restore(ws, { sessionId: SID, sequence: 1, commit: c1.commit, entries: p.entries }, deps);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.touched).toEqual(['README.md', 'created.txt', 'dir/nested.txt', 'moved.md', 'src.txt']);
    expect(readFileSync(join(ws, 'src.txt'), 'utf8')).toBe('one\ntwo\n');
    expect(readFileSync(join(ws, 'dir', 'nested.txt'), 'utf8')).toBe('nested\n');
    expect(readFileSync(join(ws, 'README.md'), 'utf8')).toBe('# seed\n');
    expect(existsSync(join(ws, 'created.txt'))).toBe(false);
    expect(existsSync(join(ws, 'moved.md'))).toBe(false);
    expect(readFileSync(join(ws, '.rotaris', 'x'), 'utf8')).toBe('x');
    const after = fingerprint(ws);
    expect([after.head, after.symbolic, after.index, after.branches, after.headLog, after.stash, after.staged]).toEqual([before.head, before.symbolic, before.index, before.branches, before.headLog, before.stash, before.staged]);
    // A tree equal to a candidate is undrifted.
    const again = await preview(ws, { sessionId: SID, sequence: 1, commit: c1.commit, includeUntracked: true, candidates: [{ sequence: 1, commit: c1.commit }] }, deps);
    expect(again.entries).toEqual([]);
    expect(again.dirty).toEqual([]);
    expect(again.text).toBe('Restoring checkpoint 1 would change nothing.');
  });

  it('REQ-GIT-055: a pruned ref yields the blocked reason alone, an unmanaged tree its own sentence', async () => {
    seed();
    writeFileSync(join(ws, 'src.txt'), 'x\n');
    const c1 = await capture(ws, { sessionId: SID, sequence: 1, includeUntracked: true, message: 'c1' }, deps);
    if (c1.outcome !== 'recorded') throw new Error(c1.outcome);
    git(ws, 'update-ref', '-d', c1.ref);
    const gone = await preview(ws, { sessionId: SID, sequence: 1, commit: c1.commit, includeUntracked: true, candidates: [] }, deps);
    expect(gone.treeState).toBe('ref-gone');
    expect(gone.text).toBe(`Checkpoint 1 is recorded for session ${SID} but its Git snapshot is gone, so it can no longer be restored.`);
    const plain = join(root, 'plain');
    mkdirSync(plain);
    const unmanaged = await preview(plain, { sessionId: SID, sequence: 1, commit: c1.commit, includeUntracked: true, candidates: [] }, deps);
    expect(unmanaged.treeState).toBe('unmanaged');
    expect(unmanaged.text).toBe(`${plain} is not inside a Git working tree, so checkpoint 1 cannot be restored.`);
  });

  it('REQ-GIT-041: prune keeps the newest, a second prune deletes zero, and a moved ref is not clobbered (compare-and-swap)', async () => {
    seed();
    const commits: string[] = [];
    for (let n = 1; n <= 3; n += 1) {
      writeFileSync(join(ws, 'src.txt'), `v${n}\n`);
      const c = await capture(ws, { sessionId: SID, sequence: n, includeUntracked: true, message: `c${n}` }, deps);
      if (c.outcome !== 'recorded') throw new Error(c.outcome);
      commits.push(c.commit);
    }
    // A prefix id must not see this session's refs (REQ-GIT-037).
    const prefixed = await listRefs(ws, 'sess', deps);
    expect(prefixed.ok && prefixed.entries.length).toBe(0);
    expect((await prune(ws, SID, 2, deps)).deleted).toBe(1);
    expect((await prune(ws, SID, 2, deps)).deleted).toBe(0);
    const left = await listRefs(ws, SID, deps);
    expect(left.ok && left.entries.map((e) => e.sequence)).toEqual([2, 3]);
    // Move ref 2 to commit 3's object from outside; a deletion naming the recorded commit refuses.
    git(ws, 'update-ref', checkpointRef(SID, 2), commits[2]!);
    const cas = await deleteRefs(ws, SID, [{ ref: checkpointRef(SID, 2), commit: commits[1]! }], deps);
    expect(cas.deleted).toBe(0);
    expect(cas.failed).toHaveLength(1);
    expect(await resolveRef(ws, SID, 2, deps)).toBe(commits[2]);
    expect((await prune(ws, SID, 0, deps)).deleted).toBe(2);
    const none = await listRefs(ws, SID, deps);
    expect(none.ok && none.entries).toEqual([]);
  });

  it('REQ-GIT-043: a detached HEAD inside a linked worktree — the ref lands in the shared repository, the restore touches the linked tree only', async () => {
    seed();
    const linkedTree = join(root, 'linked');
    git(ws, 'worktree', 'add', '-q', '--detach', linkedTree, 'HEAD');
    writeFileSync(join(linkedTree, 'src.txt'), 'linked edit\n');
    const mainBefore = fingerprint(ws);
    const c = await capture(linkedTree, { sessionId: SID, sequence: 1, includeUntracked: true, message: 'linked' }, deps);
    expect(c.outcome).toBe('recorded');
    if (c.outcome !== 'recorded') return;
    // Visible from the main tree: the shared repository holds it.
    expect(git(ws, 'for-each-ref', '--format=%(objectname)', checkpointRef(SID, 1)).trim()).toBe(c.commit);
    expect(fingerprint(ws)).toEqual(mainBefore);
    writeFileSync(join(linkedTree, 'src.txt'), 'linked edit again\n');
    writeFileSync(join(ws, 'src.txt'), 'main tree edit\n');
    const p = await preview(linkedTree, { sessionId: SID, sequence: 1, commit: c.commit, includeUntracked: true, candidates: [{ sequence: 1, commit: c.commit }] }, deps);
    const r = await restore(linkedTree, { sessionId: SID, sequence: 1, commit: c.commit, entries: p.entries }, deps);
    expect(r.ok).toBe(true);
    expect(readFileSync(join(linkedTree, 'src.txt'), 'utf8')).toBe('linked edit\n');
    expect(readFileSync(join(ws, 'src.txt'), 'utf8')).toBe('main tree edit\n');
    expect(git(linkedTree, 'rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe('HEAD');
  });

  it('REQ-GIT-033: an invocation past its limit is the fixed sentence with the applicable limit and the rendered command', async () => {
    seed();
    writeFileSync(join(ws, 'src.txt'), 'x\n');
    // The TREE bound is zero and is fired at once through the timer port, so the first invocation it applies to is
    // the one abandoned; the REF bound keeps its default, so the two `rev-parse` calls before it still run for real.
    // `Math.ceil(0 / 1000)` is the applicable limit, rendered as the sentence requires.
    const r = await capture(ws, { sessionId: SID, sequence: 1, includeUntracked: true, message: 'm' }, { clocks: firesZeroAtOnce(clocks), treeTimeoutMs: millis(0) });
    expect(r.outcome).toBe('failed');
    if (r.outcome === 'failed') expect(r.detail).toMatch(/^Git timed out after 0s: ls-files -z$/);
  });
});
