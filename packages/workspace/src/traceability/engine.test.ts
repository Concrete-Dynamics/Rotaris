import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Clocks } from '@rotaris/kernel';
import { nodeClocks } from '@rotaris/platform';
import type { ChangeEntry } from '@rotaris/contracts';
import { createTraceabilityEngine, fsArtifactIo, type ArtifactIo } from './engine.js';
import { createInThreadExecutor } from './executor.js';
import { LAYOUT_CONFIG_FILE } from './layout.js';

/**
 * ADR-0040's owner side through the seam: one I/O owner, the writes in order, busy, cancel, byte-stable
 * regeneration, the REQ-TRACE-089 behavioural test, and the change comparison against a repository this test makes.
 */
const clocks: Clocks = nodeClocks();
const T = 'tra' + 'ces';
const C = 'cov' + 'ers';
let root: string;
let gitPresent = true;
try { execFileSync('git', ['--version'], { stdio: 'ignore' }); } catch { gitPresent = false; }
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'rotaris-engine-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });
const put = (rel: string, text: string): void => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text); };
const read = (rel: string): string | null => (existsSync(join(root, rel)) ? readFileSync(join(root, rel), 'utf8') : null);
const doc = (id: string, status: string, extra = '', prose = 'prose') => `---\nreq-id: ${id}\nstatus: ${status}\ntitle: Title ${id}\n${extra}---\n# ${id}\n\n${prose}\n`;
const signal = () => new AbortController().signal;

function recordingIo(): ArtifactIo & { readonly writes: string[] } {
  const inner = fsArtifactIo(clocks.timers);
  const writes: string[] = [];
  return { writes, read: (p) => inner.read(p), replace: (p, t) => { writes.push(p); return inner.replace(p, t); } };
}

function seed(): void {
  put('docs/requirements/REQ-100-e.md', doc('REQ-100', 'approved', 'trace: optional\ntest: optional\n'));
  put('docs/requirements/REQ-100-e/REQ-101.md', doc('REQ-101', 'approved'));
  put('docs/requirements/REQ-100-e/REQ-102.md', doc('REQ-102', 'approved'));
  put('src/a.ts', `${T}(REQ_101);\n`);
  put('tests/t.ts', `${C}(REQ_101);\n`);
}

describe('the engine (owner side)', () => {
  it('parseStore, sweep and verify through the seam; check returns the report; a configuration error performs nothing', async () => {
    seed();
    const engine = createTraceabilityEngine({ executor: createInThreadExecutor(clocks), io: fsArtifactIo(clocks.timers), clocks });
    const parsed = await engine.parseStore(root, { signal: signal() });
    expect(parsed.ok && parsed.value.records.map((r) => r.id)).toEqual(['REQ-100', 'REQ-101', 'REQ-102']);
    if (!parsed.ok) throw new Error('parse');
    const swept = await engine.sweep(parsed.value, { signal: signal() });
    expect(swept.ok && swept.value.sites.length).toBe(2);
    if (!swept.ok) throw new Error('sweep');
    const verified = await engine.verify(parsed.value, swept.value, { signal: signal() });
    expect(verified.ok && verified.value.findings.map((f) => f.code)).toEqual(['artifact', 'missing-trace', 'missing-coverage', 'requires-parse']);
    const checked = await engine.check(root, { signal: signal() });
    expect(checked.ok && checked.value.parseErrorsOnly).toBe(false);
    expect(checked.ok && checked.value.report.generation).toBe(2);
    put(LAYOUT_CONFIG_FILE, '{"typo": 1}');
    const bad = await engine.check(root, { signal: signal() });
    expect(!bad.ok && bad.error.kind === 'configuration' && bad.error.cause).toContain('unrecognized keys: typo');
  });
  it('REQ-TRACE-509/060/133/136: regenerate writes the tombstone before the artifact, LF, then reports already up to date byte-identically; a retired date never moves', async () => {
    seed();
    // a previous generation carried REQ-107, which the store no longer declares
    put('src/requirement_ids.ts', '  [107, new RequirementMeta("REQ-107", 107, Lifecycle.Approved, "Gone \\"quoted\\"", "docs/requirements/x.md", true, true, "0123456789abcdef", "product", [])],\n');
    const io = recordingIo();
    const engine = createTraceabilityEngine({ executor: createInThreadExecutor(clocks), io, clocks });
    const first = await engine.regenerate(root, { signal: signal() });
    expect(first.ok && first.value).toMatchObject({ artifactPath: 'src/requirement_ids.ts', outcome: 'regenerated', count: 3 });
    expect(io.writes).toEqual([join(root, 'docs/requirements/retired-identifiers.tsv'), join(root, 'src/requirement_ids.ts')]);
    const artifact = read('src/requirement_ids.ts')!;
    expect(artifact).not.toContain('\r');
    expect(artifact.endsWith('\n')).toBe(true);
    expect(artifact).toContain('REQ_101 = 101');
    const log = read('docs/requirements/retired-identifiers.tsv')!;
    expect(log).toMatch(/\nREQ-107\t\d{4}-\d{2}-\d{2}\tGone "quoted"\n$/);
    const second = await engine.regenerate(root, { signal: signal() });
    expect(second.ok && second.value.outcome).toBe('already up to date');
    expect(io.writes.length).toBe(2);
    expect(read('src/requirement_ids.ts')).toBe(artifact);
    expect(read('docs/requirements/retired-identifiers.tsv')).toBe(log);
    // REQ-TRACE-063: a parse error writes nothing and reports the errors
    put('docs/requirements/bad.md', doc('REQ-01', 'draft'));
    const broken = await engine.regenerate(root, { signal: signal() });
    expect(!broken.ok && broken.error.kind).toBe('parse');
    expect(read('src/requirement_ids.ts')).toBe(artifact);
  });
  it('REQ-TRACE-510/123..129: the baselines bootstrap, then only ever shrink; the orphan-test baseline is preserved while .ts tests need the parser', async () => {
    seed();
    put('src/orphan.ts', 'export const o = 1;\n');
    put('docs/requirements/orphan-tests.txt', '# kept\ntests/t.ts::test_old\n');
    const engine = createTraceabilityEngine({ executor: createInThreadExecutor(clocks), io: fsArtifactIo(clocks.timers), clocks });
    const first = await engine.updateBaselines(root, { signal: signal() });
    expect(first.ok && first.value).toEqual([{ path: 'docs/requirements/debt-baseline.txt', entries: 1 }, { path: 'docs/requirements/orphan-modules.txt', entries: 1 }, { path: 'docs/requirements/orphan-tests.txt', entries: 1 }]);
    const debt = read('docs/requirements/debt-baseline.txt')!;
    expect(debt.endsWith('REQ-102 test trace\n')).toBe(true);
    expect(read('docs/requirements/orphan-modules.txt')!.endsWith('src/orphan.ts\n')).toBe(true);
    expect(read('docs/requirements/orphan-tests.txt')).toBe('# kept\ntests/t.ts::test_old\n');
    // REQ-TRACE-128: a second update over an unchanged repository is byte-identical
    await engine.updateBaselines(root, { signal: signal() });
    expect(read('docs/requirements/debt-baseline.txt')).toBe(debt);
    // REQ-TRACE-129: pay the trace debt, add a new unannotated requirement — the paid flag is pruned, the new debt is not added
    put('src/b.ts', `${T}(REQ_102);\n`);
    put('docs/requirements/REQ-100-e/REQ-103.md', doc('REQ-103', 'approved'));
    const third = await engine.updateBaselines(root, { signal: signal() });
    expect(third.ok && third.value[0]).toEqual({ path: 'docs/requirements/debt-baseline.txt', entries: 1 });
    expect(read('docs/requirements/debt-baseline.txt')!.endsWith('REQ-102 test\n')).toBe(true);
    const checked = await engine.check(root, { signal: signal() });
    expect(checked.ok && checked.value.report.findings.filter((f) => f.id === 'REQ-103').map((f) => f.code)).toEqual(['missing-trace', 'missing-coverage']);
    expect(checked.ok && checked.value.report.statistics.debt).toEqual({ trace: 0, test: 1, orphan: 1, orphanTest: 0 });
  });
  it('REQ-TRACE-512/226: a second operation of the same kind is refused busy; cancel signals it and answers false when nothing is in flight', async () => {
    seed();
    const engine = createTraceabilityEngine({ executor: createInThreadExecutor(clocks), io: fsArtifactIo(clocks.timers), clocks });
    const a = engine.regenerate(root, { signal: signal() });
    const b = engine.regenerate(root, { signal: signal() });
    expect(engine.inFlight(root)).toEqual(['regenerate']);
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra.ok).toBe(true);
    expect(!rb.ok && rb.error).toEqual({ kind: 'busy', operation: 'regenerate' });
    expect(engine.cancel(root, 'regenerate')).toBe(false);
    // cancel from a progress callback, mid-pass: the next checkpoint raises, nothing is written
    rmSync(join(root, 'src/requirement_ids.ts'));
    const c = new AbortController();
    const cancelled = await engine.regenerate(root, { signal: c.signal, progress: (r) => { if (r.kind === 'phase' && r.phase === 'reading') expect(engine.cancel(root, 'regenerate')).toBe(true); } });
    expect(!cancelled.ok && cancelled.error).toEqual({ kind: 'cancelled' });
    expect(existsSync(join(root, 'src/requirement_ids.ts'))).toBe(false);
    const pre = new AbortController();
    pre.abort();
    const early = await engine.check(root, { signal: pre.signal });
    expect(!early.ok && early.error).toEqual({ kind: 'cancelled' });
  });
  it('REQ-TRACE-089: a change made by means the application cannot observe is reported by the very next operation, with nothing to clear', async () => {
    seed();
    const engine = createTraceabilityEngine({ executor: createInThreadExecutor(clocks), io: fsArtifactIo(clocks.timers), clocks });
    await engine.regenerate(root, { signal: signal() });
    const clean = await engine.check(root, { signal: signal() });
    expect(clean.ok && clean.value.report.findings.map((f) => f.code)).toEqual(['missing-trace', 'missing-coverage', 'requires-parse']);
    // another program edits a document, restores an older artifact, edits a baseline and the retired log
    put('docs/requirements/REQ-100-e/REQ-101.md', doc('REQ-101', 'approved', '', 'rewritten by another program'));
    put('docs/requirements/debt-baseline.txt', 'REQ-102 trace test\n');
    put('docs/requirements/retired-identifiers.tsv', 'REQ-102\t2020-01-01\told\n');
    const next = await engine.check(root, { signal: signal() });
    expect(next.ok && next.value.parseErrorsOnly).toBe(true);
    expect(next.ok && next.value.report.findings[0]!.message).toContain('REQ-102 was retired on 2020-01-01');
    rmSync(join(root, 'docs/requirements/retired-identifiers.tsv'));
    const after = await engine.check(root, { signal: signal() });
    expect(after.ok && after.value.report.findings.map((f) => f.code)).toEqual(['artifact', 'requires-parse']);
    expect(after.ok && after.value.report.statistics.debt).toEqual({ trace: 1, test: 1, orphan: 0, orphanTest: 0 });
  });
});

describe.skipIf(!gitPresent)('REQ-TRACE-156..170/511: the change comparison against a repository this test makes', () => {
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'ignore', env: { ...process.env, GIT_AUTHOR_NAME: 'r', GIT_AUTHOR_EMAIL: 'r@x', GIT_COMMITTER_NAME: 'r', GIT_COMMITTER_EMAIL: 'r@x' } });
  it('added, modified with drift, status, removed; drift clears when a site file is touched; an unknown base is no base', async () => {
    seed();
    put('docs/requirements/REQ-100-e/REQ-103.md', doc('REQ-103', 'draft'));
    put('docs/requirements/REQ-100-e/REQ-104.md', doc('REQ-104', 'approved', 'trace: optional\ntest: optional\n'));
    put('src/c.ts', `${T}(REQ_103, REQ_104);\n`);
    const engine = createTraceabilityEngine({ executor: createInThreadExecutor(clocks), io: fsArtifactIo(clocks.timers), clocks });
    git('init', '-q', '-b', 'main');
    await engine.regenerate(root, { signal: signal() });
    git('add', '.');
    git('-c', 'commit.gpgsign=false', '-c', 'gc.auto=0', 'commit', '-q', '-m', 'base');
    const same = await engine.compare(root, undefined, { signal: signal() });
    expect(same.ok && same.value).toMatchObject({ entries: [], drift: false, noBase: false, unpropagated: 0 });
    // REQ-101 rewritten (approved, site untouched → drift); REQ-103 draft → approved with prose (modified carrying the transition, draft cannot drift... it is approved now and its site is untouched → drift);
    // REQ-104 deprecated — a status line is document text, so the hash moves too and it is MODIFIED carrying the transition (a pure  change is classifyChanges' unit case); REQ-102 removed (no sites → no drift); REQ-105 added
    put('docs/requirements/REQ-100-e/REQ-101.md', doc('REQ-101', 'approved', '', 'rewritten'));
    put('docs/requirements/REQ-100-e/REQ-103.md', doc('REQ-103', 'approved', '', 'now approved'));
    put('docs/requirements/REQ-100-e/REQ-104.md', doc('REQ-104', 'deprecated', 'trace: optional\ntest: optional\n'));
    rmSync(join(root, 'docs/requirements/REQ-100-e/REQ-102.md'));
    put('docs/requirements/REQ-100-e/REQ-105.md', doc('REQ-105', 'draft'));
    const changed = await engine.compare(root, 'HEAD', { signal: signal() });
    if (!changed.ok) throw new Error(JSON.stringify(changed.error));
    const brief = (e: ChangeEntry) => [e.kind, e.id, e.drift, e.from ?? null, e.to ?? null, e.sites.map((s) => `${s.path}:${s.line}`)];
    expect(changed.value.entries.map(brief)).toEqual([
      ['modified', 'REQ-101', true, null, null, ['src/a.ts:1', 'tests/t.ts:1']],
      ['removed', 'REQ-102', false, 'approved', null, []],
      ['modified', 'REQ-103', true, 'draft', 'approved', ['src/c.ts:1']],
      ['modified', 'REQ-104', false, 'approved', 'deprecated', ['src/c.ts:1']],
      ['added', 'REQ-105', false, null, null, []],
    ]);
    expect(changed.value).toMatchObject({ drift: true, unpropagated: 2, noBase: false });
    expect(changed.value.entries[0]!.obligation).toBe('Re-check every site in the list against the rewritten text.');
    // touching a site file clears the drift for the requirements whose sites it holds — including an untracked new file counted as touched
    put('src/a.ts', `${T}(REQ_101); // revisited\n`);
    put('src/c.ts', `${T}(REQ_103, REQ_104); // revisited\n`);
    const cleared = await engine.compare(root, 'HEAD', { signal: signal() });
    expect(cleared.ok && cleared.value.entries.map((e) => e.drift)).toEqual([false, false, false, false, false]);
    const none = await engine.compare(root, 'no-such-revision', { signal: signal() });
    expect(none.ok && none.value).toMatchObject({ entries: [], drift: false, noBase: true, unpropagated: 0 });
  });
});
