import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { FakeClock } from '@rotaris/kernel';
import { renderArtifact } from './artifact.js';
import { coverageOf, coverageProjection } from './coverage.js';
import { parseLayout } from './layout.js';
import { parseStore } from './store.js';
import { sweepRepository } from './sweep.js';
import { CHECK_ORDER, checkRank, verify } from './verify.js';

/**
 * REQ-TRACE-090 to REQ-TRACE-115, 122, 127, 503: the verification pass over a repository this test writes, with
 * one planted finding per check, asserted in REQ-TRACE-091's order.
 */
const clock = new FakeClock();
const T = 'tra' + 'ces';
const C = 'cov' + 'ers';
let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'rotaris-verify-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });
const put = (rel: string, text: string): void => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text); };
const doc = (id: string, status: string, extra = '', title = `Title ${id}`) => `---\nreq-id: ${id}\nstatus: ${status}\ntitle: ${title}\n${extra}---\n# ${id}\n\nprose\n`;
const layout = parseLayout(JSON.stringify({ annotation_conventions: [{ name: 'py', extensions: ['.py'], reference_pattern: '(REQ-\\d+|\\d+)', annotation_pattern: '@(implements|covers)\\(([^()]*)\\)', test_pattern: '^def (test\\w*)', exempt_module_pattern: '^# re-export only' }] }), 'x');

function run(bytes: { artifact?: string | null; debt?: string | null; orphanModules?: string | null; orphanTests?: string | null; retired?: string | null } = {}) {
  const parse = parseStore({ root, layout, retiredLog: bytes.retired ?? null });
  const sweep = sweepRepository({ root, layout, aliases: parse.details.legacyAliases, clock });
  const artifact = bytes.artifact === undefined ? renderArtifact(parse.records, layout.requirementsDir, parse.fingerprint) : bytes.artifact;
  return { parse, sweep, report: verify({ parse, sweep, layout, artifact, debtBaseline: bytes.debt ?? null, orphanModuleBaseline: bytes.orphanModules ?? null, orphanTestBaseline: bytes.orphanTests ?? null, generation: 1 }) };
}

describe('the verification pass', () => {
  it('REQ-TRACE-091: every check reports what it finds, grouped in the fixed order, with the planted finding of each', () => {
    put('docs/requirements/REQ-100-e.md', doc('REQ-100', 'approved', 'trace: optional\ntest: optional\n'));
    put('docs/requirements/REQ-100-e/REQ-101.md', doc('REQ-101', 'approved'));                    // healthy
    put('docs/requirements/REQ-100-e/REQ-102.md', doc('REQ-102', 'approved'));                    // no trace
    put('docs/requirements/REQ-100-e/REQ-103.md', doc('REQ-103', 'approved'));                    // no coverage, trace baselined
    put('docs/requirements/REQ-100-e/REQ-104.md', doc('REQ-104', 'draft'));                       // nothing enforced
    put('docs/requirements/REQ-100-e/REQ-105.md', doc('REQ-105', 'approved', 'type: technical\n'));  // derived-from missing
    put('docs/requirements/REQ-100-e/REQ-106.md', doc('REQ-106', 'approved', 'type: technical\nderived-from: [REQ-106, REQ-150, REQ-300]\ntrace: optional\ntest: optional\n'));
    put('docs/requirements/REQ-100-e/REQ-107.md', doc('REQ-107', 'approved', 'derived-from: REQ-101\ntrace: optional\ntest: optional\n'));
    put('docs/requirements/REQ-300-d.md', doc('REQ-300', 'deprecated', 'legacy-id: OLD-300\n'));
    put('src/traced.ts', `${T}(REQ_101);\n${T}(REQ_300);\n${T}(REQ_150);\n`);
    put('src/untraced.ts', 'export const x = 1;\n');
    put('src/marked.ts', '// trace-exempt\n');
    put('src/legacy/tool.py', 'def f(): pass\n');
    put('src/legacy/reexport.py', '# re-export only\n');
    put('tests/covers.ts', `${C}(REQ_101);\n// ${C}: OLD-300, NOPE-1\n`);
    put('tests/legacy/test_tool.py', '@covers(REQ-101)\ndef test_ok():\n    pass\n\ndef test_orphan():\n    pass\n\ndef test_baselined():\n    pass\n');
    const { report } = run({
      artifact: null,
      debt: 'REQ-103 trace\nREQ-101 test\nREQ-104 trace\nnot a line\n',
      orphanModules: 'src/traced.ts\nsrc/gone.ts\nbad line here\n',
      orphanTests: 'tests/legacy/test_tool.py::test_baselined\ntests/legacy/test_tool.py::test_gone\n',
    });
    expect(report.parseErrorsOnly).toBe(false);
    const seen = { n: 0 };
    const ranks = report.findings.map((f) => checkRank(f, report.requiresParse, seen));
    for (let i = 1; i < ranks.length; i += 1) expect(ranks[i]!, `${report.findings[i]!.code} after ${report.findings[i - 1]!.code}`).toBeGreaterThanOrEqual(ranks[i - 1]!);
    const codes = report.findings.map((f) => `${f.severity}:${f.code}`);
    expect(codes).toEqual([
      'error:artifact',
      'error:baseline-malformed', 'error:baseline-malformed',
      'error:derived-from', 'error:derived-from', 'error:derived-from', 'warning:derived-from', 'error:derived-from',
      'error:missing-requirement',
      'warning:deprecated-reference',
      'error:missing-trace', 'error:missing-trace',
      'error:missing-coverage', 'error:missing-coverage', 'error:missing-coverage',
      'warning:baseline-stale', 'warning:baseline-stale', 'warning:baseline-stale', 'warning:baseline-stale', 'warning:baseline-stale',
      'warning:legacy-unresolved',
      'error:orphan-module', 'warning:requires-parse',
      'error:orphan-test', 'warning:requires-parse',
    ]);
    const m = report.findings.map((f) => f.message);
    expect(m[0]).toBe('src/requirement_ids.ts: the generated requirement-symbol artifact is missing; regenerate it with the requirements view’s "Regenerate requirement symbols" action (REQ-TRACE-509)');
    expect(m[1]).toBe('docs/requirements/debt-baseline.txt:4: malformed baseline line "not a line"; expected <REQ-n> followed by one or two of the flags trace and test');
    expect(m[2]).toMatch(/^docs\/requirements\/orphan-modules\.txt:3: malformed baseline line "bad line here"/);
    expect(m[3]).toBe('docs/requirements/REQ-100-e/REQ-105.md (REQ-105): "Title REQ-105" is type: technical but declares no derived-from; supply the origin identifying which requirement\'s implementation created the need for this additional code');
    expect(m[4]).toContain('(REQ-106): "Title REQ-106" lists itself as its own origin');
    expect(m[5]).toContain('derives from REQ-150, which does not exist');
    expect(m[6]).toContain('derives from REQ-300, which is deprecated; re-point');
    expect(m[7]).toContain('(REQ-107): "Title REQ-107" declares derived-from but is not type: technical');
    expect(m[8]).toBe('src/traced.ts:3: references REQ_150 but no requirement REQ-150 exists; remove the reference or restore the requirement document');
    expect(m[9]).toBe('docs/requirements/REQ-300-d.md (REQ-300): "Title REQ-300" is deprecated and is still referenced at src/traced.ts:2, tests/covers.ts:2; remove the references or re-point them at the superseding requirement (source: docs/requirements/REQ-300-d.md)');
    expect(m[10]).toBe("docs/requirements/REQ-100-e/REQ-102.md (REQ-102): \"Title REQ-102\" is approved with trace: required, and no implementation reference exists; add `@traces(Requirement.REQ_102)` above the implementing element (or the plain call `traces(Requirement.REQ_102);`), importing `traces` from 'rotaris-traceability' and `Requirement` from the generated artifact");
    expect(m[11]).toContain('(REQ-105): "Title REQ-105" is approved with trace: required');
    expect(m[12]).toContain('(REQ-102): "Title REQ-102" is approved with test: required, and no covering test reference exists; add `@covers(Requirement.REQ_102)`');
    expect(m[13]).toContain('(REQ-103): "Title REQ-103" is approved with test: required');
    expect(m[14]).toContain('(REQ-105): "Title REQ-105" is approved with test: required');
    expect(m.slice(15, 20)).toEqual([
      "docs/requirements/debt-baseline.txt: entry REQ-101's test debt is now satisfied; prune it with the requirements view’s \"Update baselines\" action (REQ-TRACE-510)",
      'docs/requirements/debt-baseline.txt: entry REQ-104 no longer names an approved requirement (now draft); prune it with the requirements view’s "Update baselines" action (REQ-TRACE-510)',
      'docs/requirements/orphan-modules.txt: entry src/gone.ts is removed; prune it with the requirements view’s "Update baselines" action (REQ-TRACE-510)',
      'docs/requirements/orphan-modules.txt: entry src/traced.ts is now traced; prune it with the requirements view’s "Update baselines" action (REQ-TRACE-510)',
      'docs/requirements/orphan-tests.txt: entry tests/legacy/test_tool.py::test_gone is now annotated, exempt or removed; prune it with the requirements view’s "Update baselines" action (REQ-TRACE-510)',
    ]);
    expect(m[20]).toBe('tests/covers.ts:2: "NOPE-1" resolves to no requirement (the legacy identifier is unknown); write the canonical identifier in its place');
    expect(m[21]).toMatch(/^src\/legacy\/tool\.py: has no implementation trace; trace it/);
    expect(m[22]).toMatch(/^src\/untraced\.ts: has no implementation trace and no "trace-exempt" marker; whether it is a re-export-only module \(REQ-TRACE-104 rule 1\) needs a syntax tree/);
    expect(m[23]).toMatch(/^tests\/legacy\/test_tool\.py::test_orphan: no coverage annotation or comment reference is present/);
    expect(m[24]).toMatch(/^tests: 1 test file\(s\) under the built-in TypeScript convention were not checked for orphan tests; collecting test functions needs a syntax tree \(REQ-TRACE-109\/110\)/);
    // REQ-TRACE-101/122: the statistics, with every suppressed item counted (REQ-103's trace, the baselined orphan test)
    expect(report.statistics).toEqual({ total: 9, approved: 7, traced: 2, testCovered: 2, debt: { trace: 1, test: 0, orphan: 0, orphanTest: 1 } });
    // the current (unsuppressed) debt the baseline update ratchets against
    expect([...report.current.debt].map(([n, f]) => [n, [...f].sort()])).toEqual([[102, ['test', 'trace']], [103, ['test', 'trace']], [105, ['test', 'trace']]]);
    expect([...report.current.orphanModules]).toEqual(['src/legacy/tool.py', 'src/untraced.ts']);
    expect([...report.current.orphanTests].sort()).toEqual(['tests/legacy/test_tool.py::test_baselined', 'tests/legacy/test_tool.py::test_orphan']);
    expect(report.current.orphanTestsDecidable).toBe(false);
    // evidence: presence, never execution (175)
    expect(report.evidence['REQ-101']).toMatchObject({ implementationTrace: 'satisfied', coveringTest: 'stale' });
    expect(report.evidence['REQ-101']!.sites.map((s) => `${s.path}:${s.line}`)).toEqual(['src/traced.ts:1', 'tests/covers.ts:1', 'tests/legacy/test_tool.py:1']);
    expect(report.evidence['REQ-102']).toEqual({ sites: [] });
    expect(report.evidence['REQ-101']!.sites[2]!.testNode).toBe('tests/legacy/test_tool.py::test_ok');
    // REQ-TRACE-100: every diagnostic about a requirement carries the location prefix
    for (const f of report.findings) if (f.id !== undefined && f.code !== 'missing-requirement' && f.code !== 'baseline-stale') expect(f.message).toMatch(/^[^ ]+\.md \([A-Z]+-\d+\): /);
    expect(CHECK_ORDER.length).toBe(13);
  });
  it('REQ-TRACE-092/096: a parse error short-circuits to the parse errors alone; draft and deprecated carry no obligations', () => {
    put('docs/requirements/a.md', doc('REQ-1', 'approved'));
    put('docs/requirements/b.md', doc('REQ-2', 'wrong'));
    const { report } = run({ artifact: null });
    expect(report.parseErrorsOnly).toBe(true);
    expect(report.findings.map((f) => [f.severity, f.code])).toEqual([['error', 'parse-error']]);
    expect(report.statistics.total).toBe(0);
    rmSync(join(root, 'docs/requirements/b.md'));
    put('docs/requirements/c.md', doc('REQ-3', 'draft'));
    put('docs/requirements/d.md', doc('REQ-4', 'deprecated'));
    const clean = run();
    expect(clean.report.findings.map((f) => f.code)).toEqual(['missing-trace', 'missing-coverage']);
    expect(clean.report.findings.every((f) => f.id === 'REQ-1')).toBe(true);
  });
  it('REQ-TRACE-503: an empty store is a warning that names the directory and the finding; the statistics report zero', () => {
    const { report } = run();
    expect(report.findings[0]).toMatchObject({ severity: 'warning', code: 'empty-store', path: 'docs/requirements' });
    expect(report.findings[0]!.message).toContain('directory is absent');
    expect(report.statistics.total).toBe(0);
    put('docs/requirements/x.md', '---\nkind: note\n---\n');
    expect(run().report.findings[0]!.message).toContain('none declares a requirement identifier');
  });
  it('REQ-TRACE-095: the deprecated-reference site list is capped at five with a (+n more) tail', () => {
    put('docs/requirements/d.md', doc('REQ-9', 'deprecated'));
    put('src/a.ts', Array.from({ length: 7 }, () => `${T}(REQ_9);`).join('\n'));
    const { report } = run();
    expect(report.findings.find((f) => f.code === 'deprecated-reference')!.message).toContain('src/a.ts:1, src/a.ts:2, src/a.ts:3, src/a.ts:4, src/a.ts:5 (+2 more)');
  });
  it('REQ-TRACE-171..175: the coverage query answers from a sweep, keys are declared ∪ referenced, unknown numbers yield empty collections', () => {
    put('docs/requirements/a.md', doc('REQ-1', 'approved'));
    put('docs/requirements/b.md', doc('REQ-2', 'approved'));
    put('src/a.ts', `${T}(REQ_1, REQ_5);\n`);
    put('tests/t.ts', `${C}(REQ_1);\n`);
    const { parse, sweep } = run();
    const all = coverageProjection(sweep, layout, parse.records.map((r) => r.number));
    expect([...all.keys()]).toEqual([1, 2, 5]);
    expect(all.get(1)).toEqual({ number: 1, implementationSites: [{ path: 'src/a.ts', line: 1, kind: 'implementation', executed: false }], testSites: [{ path: 'tests/t.ts', line: 1, kind: 'test', executed: false }], isTraced: true, isTestCovered: true });
    expect(all.get(2)).toMatchObject({ isTraced: false, isTestCovered: false, implementationSites: [], testSites: [] });
    expect(coverageOf(sweep, layout, 77)).toEqual({ number: 77, implementationSites: [], testSites: [], isTraced: false, isTestCovered: false });
  });
});
