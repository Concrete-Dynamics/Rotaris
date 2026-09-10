import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { nodeClocks } from '@rotaris/platform';
import type { StoreParse } from '@rotaris/contracts';
import { fixtureParse } from './fixture-store.js';
import {
  appendEpicIndexRow, checkRepositoryForRuns, composeRequirementDocument, createLocation, editRequirementDocument, heldReason, manualReason, nextIdentifier, NOT_A_REPOSITORY,
  probeSourceWritability, provisionUnitWorktree, QUEUE_STOPPED_REASON, readOnlySentence, renderBranch, requirementWorktreePath, runPromptFor, scheduleQueue, slotReason, slugOf, stalledReason, writeSourceDocument, type ScheduleInput,
} from './runs.js';

/**
 * Part AP — the workspace side of runs from the board (spec 08 §Runs Started from the Board, §Delivery Queue, §Editing
 * and Creating Requirements; REQ-GIT-074/137..142): the branch and directory derivation as REQ-GIT-139/140 fix them, the
 * scheduler over its inputs (REQ-TRACE-478..483, 463), the document composer and editor (REQ-TRACE-434/442/443), the
 * identifier convention (spec 08 §Identifier format), and provisioning against a scratch repository (REQ-GIT-140's
 * read-back, REQ-GIT-010's suffix, REQ-TRACE-498's two repository rows).
 */
const clocks = nodeClocks();
let gitPresent = true;
try { execFileSync('git', ['--version'], { stdio: 'ignore' }); } catch { gitPresent = false; }
const env = { ...process.env, GIT_AUTHOR_NAME: 'r', GIT_AUTHOR_EMAIL: 'r@x', GIT_COMMITTER_NAME: 'r', GIT_COMMITTER_EMAIL: 'r@x' };
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'], env }).toString().trim();

describe('REQ-GIT-139: the slug and the rendered branch', () => {
  it.each([
    ['REQ-101', 'req-101'], ['u1', 'u1'], ['Traced and covered', 'traced-and-covered'], ['  Ünïcode / slashes\\here  ', 'n-code-slashes-here'],
    ['...dots.and_underscores...', 'dots.and_underscores'], ['', 'x'], ['///', 'x'],
    ['a'.repeat(39) + '-' + 'b'.repeat(10), 'a'.repeat(39)],
  ])('slug %j → %j', (value, slug) => { expect(slugOf(value)).toBe(slug); });
  it('renders the default template with every value slugged and validates the result as a derived name', () => {
    expect(renderBranch('rotaris/req/{requirement_id}/{unit_id}', { requirementId: 'REQ-101', unitId: 'u1', slug: 'x' })).toEqual({ ok: true, value: 'rotaris/req/req-101/u1' });
    expect(renderBranch('rotaris/req/{req}/{unit}-{slug}', { requirementId: 'REQ-101', unitId: 'u2', slug: 'Traced and covered' })).toEqual({ ok: true, value: 'rotaris/req/req-101/u2-traced-and-covered' });
  });
  it('appends -c<cycle> for cycles after the first and -a<attempt> from the second attempt, the cycle suffix first, neither slugged', () => {
    const t = 'rotaris/req/{req}/{unit}';
    const names = { requirementId: 'REQ-101', unitId: 'u1', slug: 'x' };
    expect(renderBranch(t, names, { cycle: 2 })).toEqual({ ok: true, value: 'rotaris/req/req-101/u1-c2' });
    expect(renderBranch(t, names, { attempt: 2 })).toEqual({ ok: true, value: 'rotaris/req/req-101/u1-a2' });
    expect(renderBranch(t, names, { cycle: 2, attempt: 3 })).toEqual({ ok: true, value: 'rotaris/req/req-101/u1-c2-a3' });
    // A template carrying {attempt} substitutes it and gains no -a suffix.
    expect(renderBranch('rotaris/req/{req}/{unit}/try{attempt}', names, { attempt: 2 })).toEqual({ ok: true, value: 'rotaris/req/req-101/u1/try2' });
  });
  it('a finished name failing REQ-GIT-009 is refused with the fixed error', () => {
    const r = renderBranch('rotaris/req/{req}/{unit}.lock', { requirementId: 'REQ-1', unitId: 'u1', slug: 'x' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/^Invalid Git branch name: rotaris\/req\/req-1\/u1\.lock/);
  });
  it('REQ-GIT-140: the directory is named for the attempt\'s own branch with / → -, directly under .rotaris/requirements/worktrees', () => {
    expect(requirementWorktreePath('D:\\ws', 'rotaris/req/req-101/u1-2')).toBe(resolve('D:\\ws', '.rotaris', 'requirements', 'worktrees', 'rotaris-req-req-101-u1-2'));
  });
});

describe('REQ-TRACE-478..483, 463: the scheduler', () => {
  const base = (over: Partial<ScheduleInput> = {}): ScheduleInput => ({
    candidates: [
      { id: 'REQ-103', unit: 'u1', priority: 'Normal', since: '2026-09-09T10:00:00Z' },
      { id: 'REQ-101', unit: 'u1', priority: 'High', since: '2026-09-09T10:00:02Z' },
      { id: 'REQ-102', unit: 'u2', priority: 'High', since: '2026-09-09T10:00:01Z' },
    ],
    executing: [], settings: { automatic: true, concurrency: 2, stopped: false },
    held: new Set(), armed: new Set(), claimed: new Set(), stalled: new Map(), undisclosed: new Map(),
    ...over,
  });
  it('orders by priority, then the time the requirement entered the released column, then identifier, and dispatches within the free slots', () => {
    const out = scheduleQueue(base());
    expect(out.queue.entries.map((e) => [e.id, e.state])).toEqual([['REQ-102', 'next'], ['REQ-101', 'next'], ['REQ-103', 'deferred']]);
    expect(out.dispatch).toEqual(['REQ-102', 'REQ-101']);
    // Defect AP-2: the count names the slots in use AFTER this pass's own dispatches, not before them.
    expect(out.queue.entries[2]!.reason).toBe(slotReason(2, 2));
  });
  it('concurrency 2 holds a third candidate as deferred with the slot reason while two execute', () => {
    const out = scheduleQueue(base({ executing: [{ id: 'REQ-200', unit: 'u1' }, { id: 'REQ-201', unit: 'u1' }] }));
    expect(out.dispatch).toEqual([]);
    expect(out.queue.entries.slice(0, 2).every((e) => e.state === 'executing')).toBe(true);
    expect(out.queue.entries.slice(2).every((e) => e.state === 'deferred' && e.reason === slotReason(2, 2))).toBe(true);
  });
  it('manual never starts on its own: every candidate is deferred with the manual reason until it is released (armed)', () => {
    const out = scheduleQueue(base({ settings: { automatic: false, concurrency: 2, stopped: false } }));
    expect(out.dispatch).toEqual([]);
    expect(out.queue.entries.every((e) => e.state === 'deferred' && e.reason === manualReason(e.id))).toBe(true);
    const armed = scheduleQueue(base({ settings: { automatic: false, concurrency: 2, stopped: false }, armed: new Set(['REQ-103']) }));
    expect(armed.dispatch).toEqual(['REQ-103']);
  });
  it('a stopped queue defers everything with the stop sentence; a hold defers one; a stalled start reports its cause until released again', () => {
    expect(scheduleQueue(base({ settings: { automatic: true, concurrency: 2, stopped: true } })).queue.entries.every((e) => e.reason === QUEUE_STOPPED_REASON)).toBe(true);
    const held = scheduleQueue(base({ held: new Set(['REQ-102']) }));
    expect(held.queue.entries.find((e) => e.id === 'REQ-102')).toEqual({ id: 'REQ-102', unit: 'u2', state: 'deferred', reason: heldReason('REQ-102') });
    expect(held.dispatch).toEqual(['REQ-101', 'REQ-103']);
    const stalled = scheduleQueue(base({ stalled: new Map([['REQ-102', 'the repository holds no commit.']]) }));
    expect(stalled.queue.entries[0]).toEqual({ id: 'REQ-102', unit: 'u2', state: 'deferred', reason: stalledReason('REQ-102', 'the repository holds no commit.') });
    expect(scheduleQueue(base({ stalled: new Map([['REQ-102', 'x']]), armed: new Set(['REQ-102']) })).dispatch).toContain('REQ-102');
  });
  it('a claimed dispatch keeps its slot as next and is not dispatched twice', () => {
    const out = scheduleQueue(base({ claimed: new Set(['REQ-102']) }));
    expect(out.queue.entries[0]).toEqual({ id: 'REQ-102', unit: 'u2', state: 'next' });
    expect(out.dispatch).toEqual(['REQ-101']);
  });
});

describe('the prompt, the document composer, the editor, the identifier and the location', () => {
  const parse: StoreParse = fixtureParse();
  it('REQ-TRACE-423: the prompt carries the snapshot and the reviewer\'s instructions where a run follows a send-back', () => {
    const p = runPromptFor({ id: 'REQ-101', title: 'T', prose: 'Body.' }, 'u2', 'Use the other API.');
    expect(p).toContain('Implement REQ-101 — T (unit u2).');
    expect(p).toContain('Instructions from the reviewer of the previous run:\nUse the other API.');
    expect(runPromptFor({ id: 'REQ-101', title: 'T', prose: '' }, 'u1')).toContain('(The requirement carries no prose beyond its title.)');
  });
  it('spec 08 §Requirement document: the composed document is LF, frontmatter, the level-1 identifier heading, the prose', () => {
    const text = composeRequirementDocument({ id: 'REQ-107', title: 'Export: the CSV', prose: 'It exports.', kind: 'technical', derivedFrom: ['REQ-101'], priority: 'P2' });
    expect(text).toBe('---\nreq-id: REQ-107\nstatus: draft\ntitle: "Export: the CSV"\ntype: technical\nderived-from: REQ-101\npriority: P2\n---\n\n# REQ-107 - Export: the CSV\n\nIt exports.\n');
    expect(text).not.toContain('\r');
  });
  it('REQ-TRACE-434: an edit replaces the title line, the heading and the prose and leaves every other byte alone; an unrecognised shape is refused', () => {
    const original = '---\r\nreq-id: REQ-101\r\nstatus: approved\r\ntitle: Old title\r\n---\r\n\r\n# REQ-101 - Old title\r\n\r\nOld prose.\r\nSecond line.\r\n\r\n## History\r\n\r\nKept.\r\n';
    const r = editRequirementDocument(original, 'REQ-101', { title: 'New title', prose: 'New prose.' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe('---\r\nreq-id: REQ-101\r\nstatus: approved\r\ntitle: New title\r\n---\r\n\r\n# REQ-101 - New title\r\n\r\nNew prose.\r\n\r\n## History\r\n\r\nKept.\r\n');
    const refused = editRequirementDocument('no heading here', 'REQ-101', { title: 'x', prose: 'y' });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toMatch(/no level-1 heading/);
  });
  it('spec 08 §Identifier format: the next free number in the epic\'s hundreds-block, never a tombstoned one; a full block is refused; no epic → after the highest, skipping x00', () => {
    expect(nextIdentifier(parse, new Set([107]), 'REQ-100')).toEqual({ ok: true, value: 'REQ-108' });
    expect(nextIdentifier(parse, new Set(), 'REQ-101')).toMatchObject({ ok: false });
    const full = { ...parse, records: [...parse.records, ...Array.from({ length: 99 }, (_, i) => ({ ...parse.records[0]!, id: `REQ-${101 + i}`, number: 101 + i, isEpic: false }))] };
    expect(nextIdentifier(full, new Set(), 'REQ-100')).toMatchObject({ ok: false });
    expect(nextIdentifier(parse, new Set(), undefined)).toEqual({ ok: true, value: 'REQ-201' });
  });
  it('REQ-TRACE-443: the previewed location is the one the write produces — an epic\'s child in the directory named for the epic document', () => {
    expect(createLocation(parse, 'REQ-107', 'CSV export', 'REQ-100')).toEqual({ ok: true, value: 'docs/requirements/REQ-100/REQ-107-csv-export.md' });
    expect(createLocation(parse, 'REQ-201', 'Standalone', undefined)).toEqual({ ok: true, value: 'docs/requirements/REQ-201-standalone.md' });
    expect(createLocation(parse, 'REQ-107', 'x', 'REQ-101')).toMatchObject({ ok: false });
  });
  it('the epic index gains a row after its last row; a document without a table gets none', () => {
    const epic = '# REQ-100 - E\n\n| Identifier | Title |\n| --- | --- |\n| [REQ-101](REQ-100/a.md) | A | P1 | approved |\n\n## History\n';
    const out = appendEpicIndexRow(epic, { id: 'REQ-102', title: 'B', priority: undefined, lifecycle: 'draft', relativeLink: 'REQ-100/b.md' });
    expect(out).toContain('| [REQ-101](REQ-100/a.md) | A | P1 | approved |\n| [REQ-102](REQ-100/b.md) | B | — | draft |\n\n## History');
    expect(appendEpicIndexRow('# REQ-100 - E\n\nNo table.\n', { id: 'REQ-102', title: 'B', priority: 'P1', lifecycle: 'draft', relativeLink: 'x' })).toBeNull();
  });
  it('REQ-TRACE-435: one sentence for the read-only case', () => {
    expect(readOnlySentence('REQ-101', 'docs/requirements/a.md')).toBe('REQ-101 is read-only here: its source docs/requirements/a.md cannot be written by this account. Open the artifact to change it.');
  });
});

describe('the source directory and the atomic write', () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'rotaris-ap-src-')); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });
  it('REQ-TRACE-444: a missing store directory offers no editor; a present one is writable and creatable', async () => {
    expect(probeSourceWritability(root, 'docs/requirements')).toMatchObject({ writable: false, canCreate: false });
    mkdirSync(join(root, 'docs', 'requirements'), { recursive: true });
    expect(probeSourceWritability(root, 'docs/requirements')).toEqual({ writable: true, canCreate: true });
    const w = await writeSourceDocument(root, 'docs/requirements/REQ-100/REQ-101-a.md', 'x\n', { clocks });
    expect(w.ok).toBe(true);
    expect(readFileSync(join(root, 'docs', 'requirements', 'REQ-100', 'REQ-101-a.md'), 'utf8')).toBe('x\n');
  });
});

describe.skipIf(!gitPresent)('provisioning against a scratch repository (REQ-GIT-137/140/141, REQ-GIT-010, REQ-TRACE-498)', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'rotaris-ap-git-'));
    git(root, 'init', '-q', '-b', 'main');
    writeFileSync(join(root, '.gitignore'), '.rotaris/\n');
    writeFileSync(join(root, 'README.md'), 'hello\n');
    git(root, 'add', '.');
    git(root, 'commit', '-q', '-m', 'first');
  });
  afterEach(() => { try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* an indexer may hold a fresh .git for a moment (handoff-aj §4) */ } });
  const args = (unit: string, cycle = 1) => ({ workspaceRoot: root, id: 'REQ-101', unit, title: 'Traced and covered', branchTemplate: 'rotaris/req/{requirement_id}/{unit_id}', cycle });
  it('provisions under rotaris/req/ in the fixed directory, reads back top level and branch, and suffixes a collision with -2 in a directory of its own', async () => {
    const first = await provisionUnitWorktree(args('u1'), { clocks });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.branch).toBe('rotaris/req/req-101/u1');
    expect(first.value.path).toBe(requirementWorktreePath(root, 'rotaris/req/req-101/u1'));
    expect(first.value.ref).toBe('REQ-101/u1');
    expect(first.value.baseBranch).toBe('main');
    expect(existsSync(join(first.value.path, 'README.md'))).toBe(true);
    expect(git(first.value.path, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('rotaris/req/req-101/u1');
    // REQ-GIT-140: the same attempt's directory already existing fails with REQ-GIT-008's error rather than being reused.
    const again = await provisionUnitWorktree(args('u1'), { clocks });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toMatch(/^Worktree path already exists: /);
    // The tree removed but its branch left behind: REQ-GIT-010's suffix takes a branch AND a directory of its own (REQ-GIT-140).
    git(root, 'worktree', 'remove', '--force', first.value.path);
    const second = await provisionUnitWorktree(args('u1'), { clocks });
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.value.branch).toBe('rotaris/req/req-101/u1-2');
      expect(second.value.path).toBe(requirementWorktreePath(root, 'rotaris/req/req-101/u1-2'));
      expect(second.value.path).not.toBe(first.value.path);
    }
    // The second cycle renders its own name.
    const cycle2 = await provisionUnitWorktree(args('u2', 2), { clocks });
    expect(cycle2.ok && cycle2.value.branch).toBe('rotaris/req/req-101/u2-c2');
  });
  it('REQ-TRACE-498: not a repository → "nothing to branch from" with setup offered; no commit → the engine quoted', async () => {
    const plain = mkdtempSync(join(tmpdir(), 'rotaris-ap-plain-'));
    try {
      const r = await checkRepositoryForRuns(plain, { clocks });
      expect(r).toEqual({ ok: false, reason: NOT_A_REPOSITORY, offerSetup: true });
    } finally { rmSync(plain, { recursive: true, force: true }); }
    const empty = mkdtempSync(join(tmpdir(), 'rotaris-ap-empty-'));
    try {
      git(empty, 'init', '-q', '-b', 'main');
      const r = await checkRepositoryForRuns(empty, { clocks });
      expect(r.ok).toBe(false);
      if (!r.ok) { expect(r.reason).toMatch(/holds no commit/); expect(r.offerSetup).toBe(false); }
      const p = await provisionUnitWorktree({ ...args('u1'), workspaceRoot: empty }, { clocks });
      expect(p.ok).toBe(false);
    } finally { try { rmSync(empty, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* see above */ } }
  });
});
