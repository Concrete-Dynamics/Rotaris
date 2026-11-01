/**
 * The requirement coverage report (whats-next item N90, 2026-10-13): the citation forms the code uses, read as the
 * identifiers they name; the three kinds of citing file; the live shipping denominator; and the report over the tree.
 * The fixtures' identifiers are made up (`REQ-DEMO-…`), and this directory is not read by the sweep.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PD, REQ, SUPERSEDED_BY } from '@rotaris/kernel';
// @ts-expect-error — the tools directory is plain ESM, run by node without a build step.
import { branchCitations, branchReport, branchText, buildReport, byDomain, citationsIn, definitionSpan, driftReport, driftText, kindOf, MAX_RANGE, parseBlame, parseLastTouch, parseRemoved, readDrift, readTree, sectionsOf, summaryText, uncitedBySection } from './coverage.mjs';
import { REDIRECTING } from '../build-id/build-id.mjs';

const ids = (text: string): string[] => [...(citationsIn(text) as Set<string>)].sort();

describe('requirement coverage — the citation forms', () => {
  it('reads a lone identifier, and a directive', () => {
    expect(ids('// REQ-DEMO-007: the thing. PD-DEMO-002 governs.')).toEqual(['PD-DEMO-002', 'REQ-DEMO-007']);
  });

  it('expands `..`, `to` and `through` ranges, and keeps `/` and comma lists as lists', () => {
    expect(ids('(REQ-DEMO-001..004)')).toEqual(['REQ-DEMO-001', 'REQ-DEMO-002', 'REQ-DEMO-003', 'REQ-DEMO-004']);
    expect(ids('REQ-DEMO-010 to 012')).toEqual(['REQ-DEMO-010', 'REQ-DEMO-011', 'REQ-DEMO-012']);
    expect(ids('REQ-DEMO-010 through REQ-DEMO-012')).toEqual(['REQ-DEMO-010', 'REQ-DEMO-011', 'REQ-DEMO-012']);
    expect(ids('REQ-DEMO-020/022/025')).toEqual(['REQ-DEMO-020', 'REQ-DEMO-022', 'REQ-DEMO-025']);
    expect(ids('REQ-DEMO-020 / REQ-DEMO-030')).toEqual(['REQ-DEMO-020', 'REQ-DEMO-030']);
    expect(ids('REQ-DEMO-102, 105, 110 and 111')).toEqual(['REQ-DEMO-102', 'REQ-DEMO-105', 'REQ-DEMO-110', 'REQ-DEMO-111']);
    expect(ids('REQ-DEMO-102, and 104')).toEqual(['REQ-DEMO-102', 'REQ-DEMO-104']);
  });

  it('keeps a run of two series apart: the second range names its own series, never the first', () => {
    expect(ids('REQ-DEMO-076..078, REQ-OTHER-132..134')).toEqual([
      'REQ-DEMO-076', 'REQ-DEMO-077', 'REQ-DEMO-078', 'REQ-OTHER-132', 'REQ-OTHER-133', 'REQ-OTHER-134',
    ]);
    expect(ids('REQ-DEMO-088/090, REQ-OTHER-081..083/094')).toEqual([
      'REQ-DEMO-088', 'REQ-DEMO-090', 'REQ-OTHER-081', 'REQ-OTHER-082', 'REQ-OTHER-083', 'REQ-OTHER-094',
    ]);
  });

  it('switches series and kind inside one run: a directive after a requirement takes the bare numbers after it', () => {
    expect(ids('REQ-DEMO-001 / PD-DEMO-002, 003')).toEqual(['PD-DEMO-002', 'PD-DEMO-003', 'REQ-DEMO-001']);
    expect(ids('PD-DEMO-004 and REQ-DEMO-010 to 012')).toEqual(['PD-DEMO-004', 'REQ-DEMO-010', 'REQ-DEMO-011', 'REQ-DEMO-012']);
  });

  it('does not read a quantity after a citation as a continuation: a number with its unit is no identifier', () => {
    expect(ids('REQ-DEMO-001, 200 ms later')).toEqual(['REQ-DEMO-001']);
    expect(ids('REQ-DEMO-001 to 100 notices')).toEqual(['REQ-DEMO-001']);
    expect(ids('REQ-DEMO-001 and 300 characters')).toEqual(['REQ-DEMO-001']);
    expect(ids('REQ-DEMO-001, 250%')).toEqual(['REQ-DEMO-001']);
    // A list that goes on is still a list.
    expect(ids('REQ-DEMO-001, 002 and 003 say so')).toEqual(['REQ-DEMO-001', 'REQ-DEMO-002', 'REQ-DEMO-003']);
  });

  it('reads a tight continuation (`..`, `–`, `/`) as one even when a unit word follows it, and units in any case', () => {
    expect(ids('REQ-DEMO-031..033 calls')).toEqual(['REQ-DEMO-031', 'REQ-DEMO-032', 'REQ-DEMO-033']);
    expect(ids('REQ-DEMO-007/008 files')).toEqual(['REQ-DEMO-007', 'REQ-DEMO-008']);
    expect(ids('REQ-DEMO-010–011 lines')).toEqual(['REQ-DEMO-010', 'REQ-DEMO-011']);
    expect(ids('REQ-DEMO-001, 200 MS later')).toEqual(['REQ-DEMO-001']);
    expect(ids('REQ-DEMO-001 to 100 Notices')).toEqual(['REQ-DEMO-001']);
  });

  it('does not read a date or a wider span as a range', () => {
    expect(ids('REQ-DEMO-001, 2026-10-13')).toEqual(['REQ-DEMO-001']);
    expect(ids(`REQ-DEMO-001..${String(2 + MAX_RANGE).padStart(3, '0')}`)).toEqual(['REQ-DEMO-001', `REQ-DEMO-${String(2 + MAX_RANGE).padStart(3, '0')}`]);
    expect(ids('REQ-DEMO-010..008')).toEqual(['REQ-DEMO-008', 'REQ-DEMO-010']);
  });
});

describe('requirement coverage — what a citing file is', () => {
  it('a test, a proof or the implementation', () => {
    expect(kindOf('packages/engine/src/run/run.test.ts')).toBe('test');
    expect(kindOf('packages/ui/src/x.spec.tsx')).toBe('test');
    expect(kindOf('apps/desktop/scripts/lib/driver.test.ts')).toBe('test');
    expect(kindOf('apps/desktop/scripts/live-run.mjs')).toBe('proof');
    expect(kindOf('apps/desktop/scripts/lib/duress-checks.mjs')).toBe('proof');
    expect(kindOf('apps/desktop/src/main/index.ts')).toBe('implementation');
    expect(kindOf('tools/symbol-artifact/generate.mjs')).toBe('implementation');
  });

  it('names the specification section a requirement sits under, never a requirement heading', () => {
    const at = sectionsOf(['# Title', '## Overview', 'x', '### Routing', '#### REQ-DEMO-001 — a heading', 'y'].join('\n'));
    expect(at(1)).toBe('');
    expect(at(3)).toBe('Overview');
    expect(at(6)).toBe('Routing');
  });
});

describe('requirement coverage — the report', () => {
  const requirements = [
    { id: 'REQ-DEMO-001', domain: 'DEMO', file: '01-demo.md', line: 10, withdrawn: false },
    { id: 'REQ-DEMO-002', domain: 'DEMO', file: '01-demo.md', line: 11, withdrawn: false },
    { id: 'REQ-DEMO-003', domain: 'DEMO', file: '01-demo.md', line: 12, withdrawn: false },
    { id: 'REQ-DEMO-004', domain: 'DEMO', file: '01-demo.md', line: 13, withdrawn: true },
    { id: 'REQ-DEMO-005', domain: 'DEMO', file: '01-demo.md', line: 14, withdrawn: false },
    { id: 'REQ-DEMO-006', domain: 'DEMO', file: '01-demo.md', line: 15, withdrawn: false },
    { id: 'REQ-TUI-001', domain: 'TUI', file: '17-terminal-ui.md', line: 9, withdrawn: false },
  ];
  const directives = [
    { id: 'PD-DEMO-001', supersedes: ['REQ-DEMO-005'], narrows: [], extends: [] },
    { id: 'PD-DEMO-002', supersedes: [], narrows: ['REQ-DEMO-006'], extends: [] },
  ];
  const files = new Map([
    ['packages/demo/src/a.ts', '// REQ-DEMO-001..002, REQ-DEMO-005, REQ-TUI-001'],
    ['packages/demo/src/a.test.ts', "it('REQ-DEMO-002', () => {});"],
    ['apps/desktop/scripts/demo-proof.mjs', '// PD-DEMO-002 driven in the built app'],
  ]);
  const report = buildReport({ requirements, directives, files, sectionOf: () => 'Routing' });

  it('counts live shipping requirements only: not withdrawn, not retired, not superseded', () => {
    expect(report.total).toBe(7);
    expect(report.excluded).toEqual({ withdrawn: 1, retired: 1, superseded: 1 });
    expect(report.rows.map((r: { id: string }) => r.id)).toEqual(['REQ-DEMO-001', 'REQ-DEMO-002', 'REQ-DEMO-003', 'REQ-DEMO-006']);
  });

  it('gives each requirement its citing files by kind, and a status', () => {
    const row = (id: string) => report.rows.find((r: { id: string }) => r.id === id);
    expect(row('REQ-DEMO-001')).toMatchObject({ status: 'implementation-only', cites: { implementation: ['packages/demo/src/a.ts'], test: [], proof: [] } });
    expect(row('REQ-DEMO-002')).toMatchObject({ status: 'tested', cites: { implementation: ['packages/demo/src/a.ts'], test: ['packages/demo/src/a.test.ts'] } });
    expect(row('REQ-DEMO-003')).toMatchObject({ status: 'uncited', section: 'Routing', spec: '01-demo.md', line: 12 });
    expect(row('REQ-DEMO-006')).toMatchObject({ status: 'uncited', directives: [{ id: 'PD-DEMO-002', relation: 'narrows', cited: true }] });
  });

  it('sums per domain and groups the uncited by section', () => {
    expect(byDomain(report.rows)).toEqual([
      { domain: 'DEMO', live: 4, uncited: 2, implementationOnly: 1, tested: 1, proved: 0, uncitedViaDirective: 1 },
    ]);
    expect(uncitedBySection(report.rows)).toEqual([
      { spec: '01-demo.md', section: 'Routing', live: 4, uncited: ['REQ-DEMO-003', 'REQ-DEMO-006'] },
    ]);
    expect(summaryText(report)).toContain('4 live shipping (excluded: 1 withdrawn, 1 in retired domains, 1 superseded by a directive)');
  });
});

describe('requirement coverage — over this repository', () => {
  it('accounts for every identifier in the artifact, and reads citations from the tree', async () => {
    const root = join(import.meta.dirname, '..', '..');
    const report = buildReport(await readTree(root));
    const all = Object.values(REQ) as Array<{ id: string; domain: string; withdrawn: boolean }>;
    expect(report.total).toBe(all.length);
    expect(report.excluded.withdrawn).toBe(all.filter((r) => r.withdrawn).length);
    expect(report.excluded.retired).toBe(all.filter((r) => !r.withdrawn && (r.domain === 'TUI' || r.domain === 'CLI')).length);
    expect(report.excluded.superseded).toBe(Object.keys(SUPERSEDED_BY).length);
    expect(report.rows.length + report.excluded.withdrawn + report.excluded.retired + report.excluded.superseded).toBe(all.length);
    expect(Object.keys(PD).length).toBeGreaterThan(0);
    // The generator cites the requirement it implements, and its back-pointer test cites it too.
    const symbols = report.rows.find((r: { id: string }) => r.id === 'REQ-TRACE-181');
    expect(symbols?.cites.implementation).toContain('tools/symbol-artifact/generate.mjs');
    // No row is a retired, withdrawn or superseded identifier.
    for (const r of report.rows as Array<{ id: string; domain: string }>) {
      expect(r.domain === 'TUI' || r.domain === 'CLI' || r.id in SUPERSEDED_BY).toBe(false);
    }
  });
});

type Touch = { commit: string; time: number };

describe('requirement coverage — branch-relative citations (--since; ReqToCode §3.6, R-092)', () => {
  it('names what the touched files cite now and did not, what they no longer cite, and whether a drop is cited elsewhere', () => {
    const r = branchCitations({
      before: new Map([['packages/a/src/x.ts', '// REQ-DEMO-001, REQ-DEMO-002'], ['packages/a/src/gone.ts', '// REQ-DEMO-005']]),
      after: new Map([['packages/a/src/x.ts', '// REQ-DEMO-001, REQ-DEMO-003..004'], ['packages/a/src/gone.ts', ''], ['packages/a/src/new.ts', '// PD-DEMO-001 and REQ-DEMO-003']]),
      citedInTree: new Set(['REQ-DEMO-002']),
    });
    expect(r.files).toEqual(['packages/a/src/gone.ts', 'packages/a/src/new.ts', 'packages/a/src/x.ts']);
    expect(r.cites).toEqual([
      { id: 'PD-DEMO-001', files: ['packages/a/src/new.ts'] },
      { id: 'REQ-DEMO-003', files: ['packages/a/src/new.ts', 'packages/a/src/x.ts'] },
      { id: 'REQ-DEMO-004', files: ['packages/a/src/x.ts'] },
    ]);
    expect(r.drops).toEqual([
      { id: 'REQ-DEMO-002', files: ['packages/a/src/x.ts'], citedElsewhere: true },
      { id: 'REQ-DEMO-005', files: ['packages/a/src/gone.ts'], citedElsewhere: false },
    ]);
  });

  it('a citation moved between two touched files is neither cited nor dropped', () => {
    const r = branchCitations({ before: new Map([['a.ts', 'REQ-DEMO-001'], ['b.ts', '']]), after: new Map([['a.ts', ''], ['b.ts', 'REQ-DEMO-001']]) });
    expect(r.cites).toEqual([]);
    expect(r.drops).toEqual([]);
  });
});

describe('requirement coverage — the git output drift reads (ReqToCode §4.7, R-092)', () => {
  it('a definition spans its line and the plain lines continuing it, never a note, a list item, a heading or the next one', () => {
    const lines = ['## S', '- **REQ-DEMO-001** — first', '  1. a numbered step', '  2. another', '', '  > Narrowed by PD-DEMO-001.',
      '- **REQ-DEMO-002** — second', '**REQ-DEMO-003** — third', '  > Superseded by PD-DEMO-002.', '- **REQ-DEMO-004** — fourth', '- an item'];
    expect(definitionSpan(lines, 2)).toEqual([2, 4]);
    expect(definitionSpan(lines, 7)).toEqual([7, 7]);
    expect(definitionSpan(lines, 8)).toEqual([8, 8]);
    expect(definitionSpan(lines, 10)).toEqual([10, 10]);
  });

  it('reads blame porcelain as one commit, committer time and text per final line', () => {
    const a = 'a'.repeat(40);
    const b = 'b'.repeat(40);
    const text = [`${a} 1 1 2`, 'author X', 'committer-time 100', 'filename f.md', '\tline one', `${a} 2 2`, '\tline two',
      `${b} 5 3 1`, 'committer-time 200', 'filename f.md', '\tline three', ''].join('\n');
    expect(parseBlame(text)).toEqual([
      { commit: a, time: 100, text: 'line one' }, { commit: a, time: 100, text: 'line two' }, { commit: b, time: 200, text: 'line three' },
    ]);
  });

  it('reads a zero-context diff as the removed lines and where each stood, link targets dropped', () => {
    const text = ['diff --git a/docs/spec/d.md b/docs/spec/d.md', '--- a/docs/spec/d.md', '+++ /dev/null', '@@ -3,2 +0,0 @@',
      '-- **REQ-DEMO-001** — see [x](../x.md)', '-- **REQ-DEMO-002** — two', 'diff --git a/docs/spec/d/1.md b/docs/spec/d/1.md',
      '--- /dev/null', '+++ b/docs/spec/d/1.md', '@@ -0,0 +1,2 @@', '+- **REQ-DEMO-001** — see [x](../../x.md)', '+- **REQ-DEMO-002** — two', ''].join('\n');
    const removed = parseRemoved(text);
    expect(removed.get('- **REQ-DEMO-001** — see [x]()')).toEqual({ file: 'docs/spec/d.md', line: 3 });
    expect(removed.get('- **REQ-DEMO-002** — two')).toEqual({ file: 'docs/spec/d.md', line: 4 });
    expect(removed.size).toBe(2);
  });

  it('reads a newest-first name log as each path’s latest commit', () => {
    const a = 'a'.repeat(40);
    const b = 'b'.repeat(40);
    const touched = parseLastTouch([`@@${b} 200`, '', 'x.ts', `@@${a} 100`, '', 'x.ts', 'y.ts', ''].join('\n')) as Map<string, Touch>;
    expect(touched.get('x.ts')).toEqual({ commit: b, time: 200 });
    expect(touched.get('y.ts')).toEqual({ commit: a, time: 100 });
  });

  it('drifts a requirement whose definition changed after every implementation file citing it, and no other', () => {
    const row = (id: string, implementation: string[], test: string[] = []) => ({ id, domain: 'DEMO', spec: 'd.md', line: 1, section: '',
      cites: { implementation, test, proof: [] }, directives: [], status: 'tested' });
    const day = (d: string) => Date.parse(`${d}T00:00:00Z`) / 1000;
    const at = (commit: string, d: string): Touch => ({ commit, time: day(d) });
    const report = driftReport({
      rows: [row('REQ-DEMO-001', ['a.ts', 'b.ts']), row('REQ-DEMO-002', ['a.ts', 'c.ts']), row('REQ-DEMO-003', [], ['t.test.ts']), row('REQ-DEMO-004', ['new.ts'])],
      definitions: new Map([['REQ-DEMO-001', at('d1', '2026-03-01')], ['REQ-DEMO-002', at('d2', '2026-03-01')],
        ['REQ-DEMO-003', at('d3', '2026-03-01')], ['REQ-DEMO-004', at('d4', '2026-03-01')]]),
      touched: new Map([['a.ts', at('ca', '2026-01-01')], ['b.ts', at('cb', '2026-02-01')], ['c.ts', at('cc', '2026-03-01')], ['t.test.ts', at('ct', '2026-01-01')]]),
    });
    // 002: its definition is no later than its latest citing file (a tie does not drift); 003: no implementation
    // citation; 004: its citing file is in no commit (untracked), so it is newer than any definition.
    expect(report).toEqual({ citedByImplementation: 3, drifted: [
      { id: 'REQ-DEMO-001', spec: 'docs/spec/d.md:1', definition: { commit: 'd1', date: '2026-03-01' }, latest: { file: 'b.ts', commit: 'cb', date: '2026-02-01' } },
    ] });
    expect(driftText(report)).toContain('REQ-DEMO-001  defined 2026-03-01 (d1)  docs/spec/d.md:1  latest citing 2026-02-01 (cb) b.ts');
  });
});

describe('requirement coverage — --since and --drift over a fixture repository', () => {
  /** A commit needs an author, and the operator's own configuration may ask for a signature this test cannot make. */
  const IDENTITY = ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@invalid', '-c', 'commit.gpgsign=false'];
  /** Without the variables an enclosing git process sets (a hook running `pnpm check`), which would aim at this repository. */
  const ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !(REDIRECTING as readonly string[]).includes(k)));
  let root = '';
  const git = (args: string[], date?: string): string => {
    const env = date ? { ...ENV, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : ENV;
    const r = spawnSync('git', ['-C', root, ...IDENTITY, ...args], { encoding: 'utf8', env });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
    return r.stdout.trim();
  };
  const put = (rel: string, text: string) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text); };
  const commit = (message: string, date: string) => { git(['add', '-A']); git(['commit', '-q', '-m', message], date); return git(['rev-parse', 'HEAD']); };
  const SPEC = '# D\n\n- **REQ-DEMO-001** — the first, as written; see [the other](other.md)\n- **REQ-DEMO-002** — the second\n';
  const AMENDED = SPEC.replace('as written', 'as amended');
  const commits: Record<string, string> = {};

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'rotaris-coverage-'));
    git(['init', '-q']);
    put('docs/spec/d.md', SPEC);
    put('packages/a/src/z.ts', '// REQ-DEMO-001\n');
    put('packages/a/src/y.ts', '// REQ-DEMO-002\n');
    put('packages/a/src/x.ts', '// REQ-DEMO-002\n');
    commits.first = commit('the specification and its code', '2026-01-01T00:00:00Z');
    // REQ-DEMO-001's text changes after the one file citing it was last touched: it drifts.
    put('docs/spec/d.md', AMENDED);
    commits.amended = commit('amend REQ-DEMO-001', '2026-02-01T00:00:00Z');
    // The domain moves verbatim into a part one folder deeper, its link rewritten: no definition changes, so
    // REQ-DEMO-002 (defined with its code) does not drift.
    unlinkSync(join(root, 'docs/spec/d.md'));
    put('docs/spec/d/01-part.md', AMENDED.replace('](other.md)', '](../other.md)'));
    commits.moved = commit('split the domain into parts', '2026-03-01T00:00:00Z');
    git(['branch', 'base']);
    // The branch: x.ts drops REQ-DEMO-002 (y.ts still cites it) and cites REQ-DEMO-003; an untracked file cites 004.
    put('packages/a/src/x.ts', '// REQ-DEMO-003\n');
    commits.branch = commit('the branch', '2026-04-01T00:00:00Z');
    put('packages/a/src/untracked.ts', '// REQ-DEMO-004\n');
  });
  afterAll(() => { rmSync(root, { recursive: true, force: true }); });

  it('--since names what the branch cites and drops against its merge-base, the untracked file included', () => {
    const r = branchReport(root, 'base');
    expect(r.base).toBe(commits.moved);
    expect(r.files).toEqual(['packages/a/src/untracked.ts', 'packages/a/src/x.ts']);
    expect(r.cites.map((c: { id: string }) => c.id)).toEqual(['REQ-DEMO-003', 'REQ-DEMO-004']);
    expect(r.drops).toEqual([{ id: 'REQ-DEMO-002', files: ['packages/a/src/x.ts'], citedElsewhere: true }]);
    expect(branchText(r)).toContain('this branch cites: REQ-DEMO-003, REQ-DEMO-004');
    expect(branchText(r)).toContain('drops: REQ-DEMO-002\n'.trim());
  });

  it('--drift sees through the verbatim move to the amendment, and drifts only what changed after its code', async () => {
    const requirements = [
      { id: 'REQ-DEMO-001', domain: 'DEMO', file: 'd/01-part.md', line: 3, withdrawn: false },
      { id: 'REQ-DEMO-002', domain: 'DEMO', file: 'd/01-part.md', line: 4, withdrawn: false },
    ];
    const files = new Map([['packages/a/src/z.ts', '// REQ-DEMO-001\n'], ['packages/a/src/y.ts', '// REQ-DEMO-002\n']]);
    const drift = await readDrift(root, buildReport({ requirements, directives: [], files }));
    expect(drift).toEqual({ citedByImplementation: 2, drifted: [{
      id: 'REQ-DEMO-001', spec: 'docs/spec/d/01-part.md:3',
      definition: { commit: commits.amended, date: '2026-02-01' },
      latest: { file: 'packages/a/src/z.ts', commit: commits.first, date: '2026-01-01' },
    }] });
  });
});
