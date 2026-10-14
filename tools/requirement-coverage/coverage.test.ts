/**
 * The requirement coverage report (whats-next item N90, 2026-10-13): the citation forms the code uses, read as the
 * identifiers they name; the three kinds of citing file; the live shipping denominator; and the report over the tree.
 * The fixtures' identifiers are made up (`REQ-DEMO-…`), and this directory is not read by the sweep.
 */
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PD, REQ, SUPERSEDED_BY } from '@rotaris/kernel';
// @ts-expect-error — the tools directory is plain ESM, run by node without a build step.
import { buildReport, byDomain, citationsIn, kindOf, MAX_RANGE, readTree, sectionsOf, summaryText, uncitedBySection } from './coverage.mjs';

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
