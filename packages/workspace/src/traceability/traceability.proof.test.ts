import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { nodeClocks } from '@rotaris/platform';
import { createTraceabilityEngine, fsArtifactIo } from './engine.js';
import { createInThreadExecutor } from './executor.js';
import { loadLayout } from './layout.js';
import { loadParser, parserLoadMs } from './parser.js';
import { parseStore } from './store.js';
import { SPIKE_7, generateScaleRepository } from './scale-fixture.js';
import { growthPair, interleavedMinima } from './growth-readings.js';
import { sweepRepository, type SweepDetails } from './sweep.js';

/**
 * Spike 7 and the Part AJ proof, driven by `apps/desktop/scripts/traceability-proof.mjs`, which sets
 * ROTARIS_TRACEABILITY_PROOF to an output directory and ROTARIS_TRACEABILITY_FIXTURE to a COPY of the fixture
 * store. Skipped in an ordinary `pnpm test`: the scale tree is 1,500 documents and 1,000 source files and the
 * timings are meaningless under a parallel suite.
 *
 * REQ-TRACE-088's reference conditions: one execution thread, a warm file-system cache, timing the pass alone.
 * Each measurement is taken twice and the second (warm) run is reported; the first is kept beside it.
 */
const out = process.env.ROTARIS_TRACEABILITY_PROOF;
const results: Record<string, unknown> = {};
const ms = (fn: () => void): number => { const t0 = performance.now(); fn(); return Math.round((performance.now() - t0) * 10) / 10; };
/**
 * Part R2 — the linear-growth ratios below are a quotient of two WALL-CLOCK measurements, which is load-sensitive by
 * construction: they went red once at 3.06 on a machine running five build agents and passed three times when the
 * machine was quieter (the plan's Reservations, 2026-09-10, "wave 3 should give it a floor or measure work instead of
 * time"). What is taken here is the measurement's own asymmetry: load can only make a pass SLOWER, never faster, so
 * the least contaminated estimate of a cost is the MINIMUM of repeated readings — not one reading and not their mean.
 * Each paired timing is taken three times, the minimum is what the ratio is computed from, and every reading is
 * recorded beside it. The 3.0 threshold is NOT raised. The work counts (documents, files, sites, functions) are
 * recorded with them so the proof can assert the input really is half-size, which no clock can tell it.
 *
 * 2026-10-01 (R-067): `msMin` still takes the budget figures; the GROWTH pairs are read by `interleavedMinima`
 * (`growth-readings.ts`) — seven readings a side after a warm-up each, the sides alternating. All full-size readings
 * used to come first and the half-size ones after them, so the half side ran hotter and the parse ratio read 3.04 to
 * 3.37 on an idle host against a work ratio of 2.14; and the sweep's full side was a single reading
 * (`docs/defects/fixed/traceability-proofs-growth-ratio-times-the-full-and-half-trees-unevenly.md`).
 */
const msMin = (fn: () => void, runs = 3): { readonly minMs: number; readonly runsMs: readonly number[] } => {
  const all: number[] = [];
  for (let i = 0; i < runs; i += 1) all.push(ms(fn));
  return { minMs: Math.min(...all), runsMs: all };
};

describe.skipIf(!out)('spike 7 — the traceability engine at scale', () => {
  const scale = resolve(out ?? '.', 'scale');
  it('REQ-TRACE-501: a 1,500-document store parses in about one second, streaming', () => {
    rmSync(scale, { recursive: true, force: true });
    mkdirSync(scale, { recursive: true });
    const shape = generateScaleRepository(scale, SPIKE_7);
    const load = loadLayout(scale);
    if (!load.ok) throw new Error(load.cause);
    const layout = load.layout;
    let parsed = parseStore({ root: scale, layout, retiredLog: null });
    const cold = ms(() => { parsed = parseStore({ root: scale, layout, retiredLog: null }); });
    const before = process.memoryUsage();
    const warmRuns = msMin(() => { parsed = parseStore({ root: scale, layout, retiredLog: null }); });
    const warm = warmRuns.minMs;
    const after = process.memoryUsage();
    expect(parsed.errors).toEqual([]);
    expect(parsed.records.length).toBe(shape.requirements);
    results.parse = { documents: shape.documents, requirements: shape.requirements, storeBytes: shape.bytes, coldMs: cold, warmMs: warm, warmRunsMs: warmRuns.runsMs, heapDeltaMiB: Math.round((after.heapUsed - before.heapUsed) / 1048576 * 10) / 10, rssMiB: Math.round(after.rss / 1048576) };
    expect(warm).toBeLessThan(1_500);
    // linear growth: half the store in about half the time (REQ-TRACE-501's linear clause), the two sides read evenly
    const halfDir = join(scale, '..', 'scale-half');
    rmSync(halfDir, { recursive: true, force: true });
    mkdirSync(halfDir, { recursive: true });
    const halfShape = generateScaleRepository(halfDir, { ...SPIKE_7, blocks: 7, implFiles: 400, testFiles: 100 });
    const growth = interleavedMinima({
      full: () => ms(() => { parseStore({ root: scale, layout, retiredLog: null }); }),
      half: () => ms(() => { parseStore({ root: halfDir, layout, retiredLog: null }); }),
    });
    results.parseHalf = { documents: halfShape.documents, storeBytes: halfShape.bytes, ...growthPair(growth, { full: shape.documents, half: halfShape.documents }) };
    if (out) writeFileSync(join(out, 'spike-results.json'), JSON.stringify(results, null, 2));
  });
  it('REQ-TRACE-088: 10^3 source files carrying 10^4 annotation sites sweep in about one second on one thread', () => {
    const load = loadLayout(scale);
    if (!load.ok) throw new Error(load.cause);
    const layout = load.layout;
    const clock = nodeClocks().monotonic;
    const parsed = parseStore({ root: scale, layout, retiredLog: null });
    // Part AJ2: the sweep now parses the built-in test files it meets (REQ-TRACE-109); REQ-TRACE-088 budgets enumeration,
    // reading and matching ALONE, so the budgeted figure is the sweep's duration less the parse time it keeps apart.
    let swept = sweepRepository({ root: scale, layout, aliases: parsed.details.legacyAliases, clock });
    const cold = swept.durationMs - swept.details.parseMs;
    const parserLoadedIn = parserLoadMs();
    swept = sweepRepository({ root: scale, layout, aliases: parsed.details.legacyAliases, clock });
    const warm = swept.durationMs - swept.details.parseMs;
    expect(swept.details.files).toBe(SPIKE_7.implFiles + SPIKE_7.testFiles);
    expect(swept.sites.length).toBeGreaterThanOrEqual(10_000);
    results.sweep = { files: swept.details.files, sites: swept.sites.length, annotations: swept.details.annotations.length, coldMs: cold, warmMs: warm, parseMs: swept.details.parseMs, parsedFiles: swept.details.parsedFiles, wholeMs: swept.durationMs, parserLoadMs: parserLoadedIn };
    expect(warm).toBeLessThan(1_500);
    // linear growth: a half-size tree in about half the time. The sweep times itself, so each reader returns the
    // sweep's own figure less the parse time it keeps apart, the same figure the budget above reads; the two sides are
    // read evenly (`interleavedMinima`), where the full side used to be the one reading above against a minimum of three.
    const halfDir = join(scale, '..', 'scale-half');
    const halfParsed = parseStore({ root: halfDir, layout, retiredLog: null });
    let half = sweepRepository({ root: halfDir, layout, aliases: halfParsed.details.legacyAliases, clock });
    const growth = interleavedMinima({
      full: () => { const s = sweepRepository({ root: scale, layout, aliases: parsed.details.legacyAliases, clock }); return s.durationMs - s.details.parseMs; },
      half: () => { half = sweepRepository({ root: halfDir, layout, aliases: halfParsed.details.legacyAliases, clock }); return half.durationMs - half.details.parseMs; },
    });
    // The sweep's figures are whole milliseconds, so the quotient's denominator is floored at 1 ms as before.
    results.sweepHalf = { files: half.details.files, sites: half.sites.length, ...growthPair(growth, { full: swept.details.files, half: half.details.files }, 1) };
    if (out) writeFileSync(join(out, 'spike-results.json'), JSON.stringify(results, null, 2));
  });
  it('OQ-24 (Part AJ2): the parse-requiring checks of REQ-TRACE-104 rule 1 and REQ-TRACE-109/110 over the same 10^3-file tree, with the TypeScript compiler API', () => {
    const load = loadLayout(scale);
    if (!load.ok) throw new Error(load.cause);
    const layout = load.layout;
    const clock = nodeClocks().monotonic;
    const parser = loadParser(clock);
    if (!parser.available) throw new Error(parser.reason);
    // Every file of the tree, read once outside the timing: REQ-TRACE-088's reference conditions time the pass alone.
    const corpus = (dir: string) => {
      const parsed = parseStore({ root: dir, layout, retiredLog: null });
      const swept = sweepRepository({ root: dir, layout, aliases: parsed.details.legacyAliases, clock });
      const texts = [...swept.modules.map((p) => ({ p, module: true, text: readFileSync(join(dir, p), 'utf8') })), ...swept.tests.map((p) => ({ p, module: false, text: readFileSync(join(dir, p), 'utf8') }))];
      let functions = 0; let reExportOnly = 0; let unparsable = 0;
      const pass = () => { functions = 0; reExportOnly = 0; unparsable = 0; for (const f of texts) { if (f.module) { const a = parser.analyseModule(f.text, f.p); if (!a.parsed) unparsable += 1; else if (a.reExportOnly) reExportOnly += 1; } else { const c = parser.collectTests(f.text, f.p); if (!c.parsed) unparsable += 1; functions += c.functions.length; } } };
      return { swept, texts, pass, counts: () => ({ functions, reExportOnly, unparsable }) };
    };
    const full = corpus(scale);
    const cold = ms(full.pass);
    const warmRuns = msMin(full.pass);
    const warm = warmRuns.minMs;
    const counts = full.counts();
    expect(full.texts.length).toBe(SPIKE_7.implFiles + SPIKE_7.testFiles);
    expect(counts).toEqual({ functions: SPIKE_7.testFiles * SPIKE_7.sitesPerFile, reExportOnly: 0, unparsable: 0 });
    // Inside the sweep the parser is asked only where the patterns cannot decide: every module here carries a trace, so
    // exactly the test files were parsed there (REQ-TRACE-104 rules 2 and 3 excuse the rest before rule 1 is reached).
    expect(full.swept.details.parsedFiles).toBe(SPIKE_7.testFiles);
    expect(full.swept.details.parser.available).toBe(true);
    const halfDir = join(scale, '..', 'scale-half');
    const half = corpus(halfDir);
    // the growth pair, read evenly (`interleavedMinima`); the budget-free figures above stay the full side's own
    const growth = interleavedMinima({ full: () => ms(full.pass), half: () => ms(half.pass) });
    results.parser = {
      version: parser.version, loadMs: parserLoadMs(), files: full.texts.length, modules: SPIKE_7.implFiles, tests: SPIKE_7.testFiles, functions: counts.functions,
      coldMs: cold, warmMs: warm, warmRunsMs: warmRuns.runsMs, perFileMs: Math.round((warm / full.texts.length) * 1000) / 1000,
      sweepParseMs: full.swept.details.parseMs, sweepParsedFiles: full.swept.details.parsedFiles,
      halfFiles: half.texts.length, halfWarmMs: growth.half.minMs,
      ...growthPair(growth, { full: full.texts.length, half: half.texts.length }, 1),
    };
    if (out) writeFileSync(join(out, 'spike-results.json'), JSON.stringify(results, null, 2));
  });
});

// ---- the fixture drive (stage 2 of apps/desktop/scripts/traceability-proof.mjs) ----
const fixtureRoot = process.env.ROTARIS_TRACEABILITY_FIXTURE;
describe.skipIf(!out || !fixtureRoot)('the fixture store through the engine, in-thread', () => {
  it('records and hashes, the planted findings in REQ-TRACE-091 order, regenerate and baselines byte-stable, compare, cancel, busy', async () => {
    const root = fixtureRoot!;
    const clocks = nodeClocks();
    const io = fsArtifactIo(clocks.timers);
    const writes: string[] = [];
    const engine = createTraceabilityEngine({ executor: createInThreadExecutor(clocks), io: { read: (p) => io.read(p), replace: (p, t) => { writes.push(relative(root, p).replace(/\\/g, '/')); return io.replace(p, t); } }, clocks });
    const signal = () => new AbortController().signal;
    const fixture: Record<string, unknown> = { passed: false };
    // records and the three hashes, recomputed here from the bytes on disk
    const parsed = await engine.parseStore(root, { signal: signal() });
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.error));
    expect(parsed.value.errors).toEqual([]);
    expect(parsed.value.records.map((r) => r.id)).toEqual(['REQ-100', 'REQ-101', 'REQ-102', 'REQ-103', 'REQ-104', 'REQ-105', 'REQ-106', 'REQ-200', 'REQ-201', 'REQ-202', 'REQ-300']);
    expect(parsed.value.records.map((r) => r.epic ?? null)).toEqual([null, 'REQ-100', 'REQ-100', 'REQ-100', 'REQ-100', 'REQ-100', 'REQ-100', null, 'REQ-200', 'REQ-200', null]);
    expect(parsed.value.records.find((r) => r.id === 'REQ-201')).toMatchObject({ status: 'draft', legacyId: 'LEGACY-201', title: 'The draft child', traceRequired: false });
    expect(parsed.value.records.find((r) => r.id === 'REQ-105')).toMatchObject({ kind: 'technical', derivedFrom: ['REQ-101'] });
    for (const r of parsed.value.records) {
      const bytes = readFileSync(join(root, r.sourcePath));
      const normalised = bytes.toString('utf8').replace(/\r\n?/g, '\n');
      expect(r.contentHash, r.id).toBe(createHash('sha256').update(normalised).digest('hex').slice(0, 16));
      expect(r.canonicalHash).toHaveLength(32);
    }
    expect(new Set(parsed.value.records.filter((r) => r.sourcePath.endsWith('REQ-200-multi.md')).map((r) => r.contentHash)).size).toBe(1);
    expect(parsed.value.fingerprint).toHaveLength(64);
    fixture.records = parsed.value.records.map((r) => ({ id: r.id, status: r.status, contentHash: r.contentHash, canonicalHash: r.canonicalHash, epic: r.epic ?? null }));
    fixture.fingerprint = parsed.value.fingerprint;
    // Part AJ2: the parser decides the two checks wave 1 left as `requires-parse`. The proof script plants two files in
    // this copy — `src/barrel.ts`, re-export-only, which rule 1 excuses; and `tests/renamed.ts`, whose one test function
    // was renamed from the name the orphan-test baseline still carries — and the sweep says which files it parsed.
    const swept = await engine.sweep(parsed.value, { signal: signal() });
    if (!swept.ok) throw new Error(JSON.stringify(swept.error));
    const details = (swept.value as { details?: SweepDetails }).details;
    expect(details?.parser.available).toBe(true);
    expect(details?.exemptModules).toContain('src/barrel.ts');
    expect(details?.undecidedModules).toEqual([]);
    expect(details?.undecidedTestFiles).toEqual([]);
    expect(details?.testFunctions.map((t) => t.node).sort()).toEqual(['tests/covers.ts::testLegacy', 'tests/covers.ts::testPlainCall', 'tests/covers.ts::testTraced', 'tests/legacy/test_tool.py::test_covered', 'tests/legacy/test_tool.py::test_orphan', 'tests/renamed.ts::testRenamed']);
    fixture.parsedFiles = details?.parsedFiles;
    fixture.exemptModules = details?.exemptModules;
    // check: the planted findings, one per check, in REQ-TRACE-091's order
    const checked = await engine.check(root, { signal: signal() });
    if (!checked.ok) throw new Error(JSON.stringify(checked.error));
    expect(checked.value.parseErrorsOnly).toBe(false);
    const codes = checked.value.report.findings.map((f) => f.code);
    expect(codes).toEqual(['artifact', 'baseline-malformed', 'derived-from', 'missing-requirement', 'deprecated-reference', 'missing-trace', 'missing-coverage', 'baseline-stale', 'baseline-stale', 'legacy-unresolved', 'orphan-module', 'orphan-module', 'orphan-test', 'orphan-test']);
    expect(checked.value.report.findings.map((f) => f.severity)).toEqual(['error', 'error', 'error', 'error', 'warning', 'error', 'error', 'warning', 'warning', 'warning', 'error', 'error', 'error', 'error']);
    expect(checked.value.report.findings.map((f) => f.id ?? f.path)).toEqual(['src/requirement_ids.ts', 'docs/requirements/debt-baseline.txt', 'REQ-106', 'REQ-150', 'REQ-300', 'REQ-102', 'REQ-103', 'REQ-101', 'docs/requirements/orphan-tests.txt', 'tests/covers.ts', 'src/legacy/tool.py', 'src/untraced.ts', 'tests/legacy/test_tool.py', 'tests/renamed.ts']);
    expect(codes).not.toContain('requires-parse');
    // the re-export-only module is excused (REQ-TRACE-104 rule 1); the literal-initialised one is an orphan and the finding says why
    expect(checked.value.report.findings.some((f) => f.path === 'src/barrel.ts')).toBe(false);
    expect(checked.value.report.findings[11]!.message).toContain('src/untraced.ts: has no implementation trace and it is not a re-export-only module (it declares a variable initialised with something other than a named symbol at line 3)');
    // the renamed function: the baseline's old name is stale, the new name is an orphan reported at its own file and line (REQ-TRACE-100/508)
    expect(checked.value.report.findings[8]!.message).toContain('entry tests/renamed.ts::testOriginal is now annotated, exempt or removed');
    expect(checked.value.report.findings[13]).toMatchObject({ code: 'orphan-test', path: 'tests/renamed.ts', line: 4 });
    expect(checked.value.report.findings[13]!.message.startsWith('tests/renamed.ts:4 (tests/renamed.ts::testRenamed): ')).toBe(true);
    expect(checked.value.report.statistics).toEqual({ total: 11, approved: 8, traced: 4, testCovered: 4, debt: { trace: 0, test: 0, orphan: 0, orphanTest: 0 } });
    // evidence: presence for the two static obligations (175); the verification verdict for the third (R16), stale here because the artifact is
    expect(checked.value.report.evidence['REQ-101']).toMatchObject({ implementationTrace: 'satisfied', coveringTest: 'stale', verification: 'stale' });
    expect(checked.value.report.evidence['REQ-102']!.verification).toBe('failed');
    fixture.checkCodes = codes;
    fixture.checkMessages = checked.value.report.findings.map((f) => f.message);
    fixture.statistics = checked.value.report.statistics;
    // regenerate: the tombstone (REQ-107, carried by the stale artifact) before the artifact; then already up to date, byte-identical
    const before = readFileSync(join(root, 'src/requirement_ids.ts'), 'utf8');
    const first = await engine.regenerate(root, { signal: signal() });
    if (!first.ok) throw new Error(JSON.stringify(first.error));
    expect(first.value).toMatchObject({ artifactPath: 'src/requirement_ids.ts', outcome: 'regenerated', count: 11 });
    expect(writes).toEqual(['docs/requirements/retired-identifiers.tsv', 'src/requirement_ids.ts']);
    const artifact = readFileSync(join(root, 'src/requirement_ids.ts'), 'utf8');
    expect(artifact).not.toBe(before);
    expect(artifact).not.toContain('\r');
    expect(artifact).toContain(`// rotaris-traceability-fingerprint: ${parsed.value.fingerprint}`);
    expect(artifact).toContain('  /** @deprecated ');
    const log = readFileSync(join(root, 'docs/requirements/retired-identifiers.tsv'), 'utf8');
    expect(log).toMatch(/\nREQ-107\t\d{4}-\d{2}-\d{2}\tRemoved since this generation\n/);
    expect(log).toContain('REQ-999\t2026-01-01\tRetired fixture requirement');
    const second = await engine.regenerate(root, { signal: signal() });
    expect(second.ok && second.value.outcome).toBe('already up to date');
    expect(writes.length).toBe(2);
    expect(readFileSync(join(root, 'src/requirement_ids.ts'), 'utf8')).toBe(artifact);
    expect(readFileSync(join(root, 'docs/requirements/retired-identifiers.tsv'), 'utf8')).toBe(log);
    const afterRegenerate = await engine.check(root, { signal: signal() });
    expect(afterRegenerate.ok && afterRegenerate.value.report.findings.map((f) => f.code)).toEqual(codes.filter((c) => c !== 'artifact'));
    // over a fresh artifact the verdict of a requirement with no error against it is `satisfied` (R16)
    expect(afterRegenerate.ok && afterRegenerate.value.report.evidence['REQ-101']!.verification).toBe('satisfied');
    fixture.artifactBytes = Buffer.byteLength(artifact);
    // baselines: the three in order; Part AJ2 — the orphan-test baseline's first real write (R11 decided: the parser
    // decides every .ts test file), which prunes the renamed entry and adds nothing; a second update byte-identical
    const baselines = await engine.updateBaselines(root, { signal: signal() });
    if (!baselines.ok) throw new Error(JSON.stringify(baselines.error));
    expect(baselines.value).toEqual([{ path: 'docs/requirements/debt-baseline.txt', entries: 0 }, { path: 'docs/requirements/orphan-modules.txt', entries: 0 }, { path: 'docs/requirements/orphan-tests.txt', entries: 0 }]);
    expect(writes.slice(2)).toEqual(['docs/requirements/debt-baseline.txt', 'docs/requirements/orphan-modules.txt', 'docs/requirements/orphan-tests.txt']);
    const written = ['debt-baseline.txt', 'orphan-modules.txt', 'orphan-tests.txt'].map((f) => readFileSync(join(root, 'docs/requirements', f), 'utf8'));
    expect(written[2]!.startsWith('# Orphan-test baseline. This file may only SHRINK')).toBe(true);
    expect(written[2]).not.toContain('testOriginal');
    await engine.updateBaselines(root, { signal: signal() });
    expect(['debt-baseline.txt', 'orphan-modules.txt', 'orphan-tests.txt'].map((f) => readFileSync(join(root, 'docs/requirements', f), 'utf8'))).toEqual(written);
    const afterBaselines = await engine.check(root, { signal: signal() });
    expect(afterBaselines.ok && afterBaselines.value.report.findings.map((f) => f.code)).toEqual(codes.filter((c) => c !== 'artifact' && c !== 'baseline-malformed' && c !== 'baseline-stale'));
    // cancel mid-pass: the artifact is removed first so a write would be visible; nothing is written
    rmSync(join(root, 'src/requirement_ids.ts'));
    const c = new AbortController();
    const cancelled = await engine.regenerate(root, { signal: c.signal, progress: (r) => { if (r.kind === 'phase' && r.phase === 'reading') c.abort(); } });
    expect(!cancelled.ok && cancelled.error).toEqual({ kind: 'cancelled' });
    expect(existsSync(join(root, 'src/requirement_ids.ts'))).toBe(false);
    // busy: a second regenerate while one is in flight
    const a = engine.regenerate(root, { signal: signal() });
    const b = engine.regenerate(root, { signal: signal() });
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra.ok).toBe(true);
    expect(!rb.ok && rb.error).toEqual({ kind: 'busy', operation: 'regenerate' });
    expect(readFileSync(join(root, 'src/requirement_ids.ts'), 'utf8')).toBe(artifact);
    // compare against a base this test commits (skipped without git)
    let gitPresent = true;
    try { execFileSync('git', ['--version'], { stdio: 'ignore' }); } catch { gitPresent = false; }
    if (gitPresent) {
      const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'ignore', env: { ...process.env, GIT_AUTHOR_NAME: 'r', GIT_AUTHOR_EMAIL: 'r@x', GIT_COMMITTER_NAME: 'r', GIT_COMMITTER_EMAIL: 'r@x' } });
      git('init', '-q', '-b', 'main');
      git('add', '.');
      git('-c', 'commit.gpgsign=false', '-c', 'gc.auto=0', 'commit', '-q', '-m', 'base');
      const same = await engine.compare(root, undefined, { signal: signal() });
      expect(same.ok && same.value).toMatchObject({ entries: [], drift: false, noBase: false, unpropagated: 0 });
      const doc = join(root, 'docs/requirements/REQ-100-fixture-epic/REQ-101-traced-and-covered.md');
      writeFileSync(doc, readFileSync(doc, 'utf8').replace('The healthy requirement', 'The rewritten requirement'));
      const changed = await engine.compare(root, 'HEAD', { signal: signal() });
      if (!changed.ok) throw new Error(JSON.stringify(changed.error));
      expect(changed.value.entries.map((e) => [e.kind, e.id, e.drift, e.sites.length])).toEqual([['modified', 'REQ-101', true, 3]]);
      expect(changed.value).toMatchObject({ drift: true, unpropagated: 1, noBase: false });
      const none = await engine.compare(root, 'no-such-revision', { signal: signal() });
      expect(none.ok && none.value.noBase).toBe(true);
      fixture.compare = { entries: changed.value.entries.length, unpropagated: changed.value.unpropagated };
    } else fixture.compare = 'skipped: git is not on the path';
    fixture.writes = writes;
    fixture.passed = true;
    writeFileSync(join(out!, 'fixture-results.json'), JSON.stringify(fixture, null, 2));
  });
});
