/**
 * PD-TRACE-002 (REQ-ADOPT-031 to REQ-ADOPT-035, REQ-ADOPT-044): the surveyed shape — its validation over an untrusted proposal, its execution, the evidence it reads
 * and the parse the board's projection takes. Every proposal here is a literal: no test reaches a model.
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compareReqIds, ReqIdSchema, type RequirementsShape } from '@rotaris/contracts';
import { checkShapePattern, citeShape, driftOf, measureShape, shapeParse, titleOf, validateShape } from './shape.js';

const roots: string[] = [];
afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }); });

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'rotaris-shape-'));
  roots.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

/** A namespaced, zero-padded family as bold bullets — the form REQ-ADOPT-008 refused — beside a heading-defined one with criteria and a status line. */
const FILES: Record<string, string> = {
  'docs/spec/08-trace/01.md': '# Trace\n\n- **SYS-TRACE-001** — The board SHALL draw cards. More prose.\n  > a note under it\n- **SYS-TRACE-002** — The board SHALL sort.\n\n## Later\n\n- **SYS-TRACE-010** — The board SHALL filter. See SYS-TRACE-999.\n- **SYS-TRACE-001** — a second definition\n',
  'docs/spec/README.md': '# Index\n\nNothing defined here, SYS-TRACE-001 is mentioned.\n',
  'docs/stories/login.md': '# Stories\n\n### FR-1.2 Login works\n\nStatus: In Progress\n\n#### Acceptance criteria\n\n- [ ] rejects a bad password\n- [x] accepts a good one\n\n### FR-1.10 Logout works\n\nStatus: Done\n\n- [x] ends the session\n\n## Appendix\n\n- [ ] not a criterion of anything\n',
  'src/board.ts': '// SYS-TRACE-001\nexport const a = 1; // SYS-TRACE-002, SYS-TRACE-404\n',
  'src/board.test.ts': '// SYS-TRACE-001\n',
  'tests/login_test.py': '# FR-1.2\n',
};

const SHAPE: RequirementsShape = {
  version: 1,
  stores: [
    { dir: 'docs/spec', definition: '^\\s*-\\s+\\*\\*(?<id>SYS-[A-Z]+-\\d{3})\\*\\*', criteria: false },
    { dir: 'docs/stories', definition: '^###\\s+(?<id>FR-\\d+\\.\\d+)\\s+(?<title>.+)$', criteria: true, status: { pattern: '^Status:\\s*(?<status>.+?)\\s*$', words: [{ word: 'In Progress', delivery: 'running' }, { word: 'Done', delivery: 'done' }, { word: 'Draft', lifecycle: 'draft' }] } },
  ],
  identifier: 'SYS-[A-Z]+-\\d{3}|FR-\\d+\\.\\d+',
  implRoots: ['src'], testRoots: ['tests'], obligations: 'optional', notes: '',
};

describe('validateShape reads an untrusted proposal field by field (PD-TRACE-002 clause 1, REQ-ADOPT-013)', () => {
  it('accepts a shape with namespaced, zero-padded and dotted identifiers', () => {
    const root = project(FILES);
    const v = validateShape(JSON.parse(JSON.stringify(SHAPE)), root);
    expect(v).toMatchObject({ ok: true });
  });

  it.each([
    ['an unknown key', { ...SHAPE, write_to: 'x' }, 'write_to'],
    ['a missing key', (({ notes: _n, ...rest }) => rest)(SHAPE), 'notes'],
    ['another version', { ...SHAPE, version: 2 }, 'version'],
    ['no store', { ...SHAPE, stores: [] }, 'stores'],
    ['a store outside the workspace', { ...SHAPE, stores: [{ ...SHAPE.stores[0]!, dir: '../elsewhere' }] }, 'stores[0].dir'],
    ['a store that does not exist', { ...SHAPE, stores: [{ ...SHAPE.stores[0]!, dir: 'docs/none' }] }, 'stores[0].dir'],
    ['overlapping stores', { ...SHAPE, stores: [SHAPE.stores[0]!, { ...SHAPE.stores[1]!, dir: 'docs/spec/08-trace' }] }, 'stores[1].dir'],
    ['a definition with no id group', { ...SHAPE, stores: [{ ...SHAPE.stores[0]!, definition: '^- (SYS-\\d+)' }] }, 'stores[0].definition'],
    ['a definition that does not compile', { ...SHAPE, stores: [{ ...SHAPE.stores[0]!, definition: '(?<id>[' }] }, 'stores[0].definition'],
    ['a nested quantifier', { ...SHAPE, stores: [{ ...SHAPE.stores[0]!, definition: '(?<id>(a+)+b)' }] }, 'stores[0].definition'],
    ['a backreference', { ...SHAPE, identifier: '(R)\\1-\\d+' }, 'identifier'],
    ['an identifier matching nothing', { ...SHAPE, identifier: '(?:SYS-\\d+)?' }, 'identifier'],
    ['a status word with no meaning', { ...SHAPE, stores: [SHAPE.stores[0]!, { ...SHAPE.stores[1]!, status: { pattern: '(?<status>x)', words: [{ word: 'x' }] } }] }, 'stores[1].status.words[0]'],
    ['a status word of an unknown column', { ...SHAPE, stores: [SHAPE.stores[0]!, { ...SHAPE.stores[1]!, status: { pattern: '(?<status>x)', words: [{ word: 'x', delivery: 'shipped' }] } }] }, 'stores[1].status.words[0].delivery'],
    ['an absolute root', { ...SHAPE, implRoots: ['/etc'] }, 'implRoots'],
    ['unknown obligations', { ...SHAPE, obligations: 'sometimes' }, 'obligations'],
  ])('refuses %s, naming the field', (_what, proposal, field) => {
    const root = project(FILES);
    expect(validateShape(JSON.parse(JSON.stringify(proposal)), root)).toMatchObject({ ok: false, field });
  });

  it('refuses a store that is a symbolic link out of the workspace', () => {
    const root = project(FILES);
    const outside = project({ 'x.md': '- **SYS-OUT-001** — x\n' });
    symlinkSync(outside, join(root, 'docs/linked'));
    expect(validateShape({ ...SHAPE, stores: [{ ...SHAPE.stores[0]!, dir: 'docs/linked' }] }, root)).toMatchObject({ ok: false, field: 'stores[0].dir' });
  });

  it('checks a pattern for its named groups', () => {
    expect(checkShapePattern('(?<id>X-\\d+)', ['id'], ['title'])).toBeNull();
    expect(checkShapePattern('(?<id>X-\\d+)(?<other>y)', ['id'], ['title'])).toMatch(/unknown named group other/);
    expect(checkShapePattern('x'.repeat(301), [])).toMatch(/1 to 300/);
  });
});

describe('measureShape extracts every requirement with where it stands (clauses 4 and 5)', () => {
  it('reads both stores, in identifier order, with line, title, status and criteria', () => {
    const root = project(FILES);
    const m = measureShape(root, SHAPE);
    expect(m.requirements.map((r) => r.id)).toEqual(['FR-1.2', 'FR-1.10', 'SYS-TRACE-001', 'SYS-TRACE-002', 'SYS-TRACE-010']);
    const one = m.requirements.find((r) => r.id === 'SYS-TRACE-001')!;
    expect(one).toMatchObject({ document: 'docs/spec/08-trace/01.md', line: 3, endLine: 4, title: 'The board SHALL draw cards.' });
    expect(one.prose).toBe('- **SYS-TRACE-001** — The board SHALL draw cards. More prose.\n  > a note under it');
    const story = m.requirements.find((r) => r.id === 'FR-1.2')!;
    expect(story.title).toBe('Login works');
    expect(story.status).toEqual({ word: 'In Progress', line: 5, start: 8, end: 19, delivery: 'running' });
    // A heading-defined requirement keeps the deeper heading that holds its criteria.
    expect(story.criteria).toEqual([{ text: 'rejects a bad password', checked: false, line: 9 }, { text: 'accepts a good one', checked: true, line: 10 }]);
    // A higher heading closes it: the appendix's box belongs to nothing.
    expect(m.requirements.find((r) => r.id === 'FR-1.10')!.criteria).toEqual([{ text: 'ends the session', checked: true, line: 16 }]);
  });

  it('hashes a requirement without its status word and its ticks, so the board\'s own writes change no specification (clause 6)', () => {
    const root = project(FILES);
    const before = measureShape(root, SHAPE).requirements.find((r) => r.id === 'FR-1.2')!.canonicalHash;
    writeFileSync(join(root, 'docs/stories/login.md'), FILES['docs/stories/login.md']!.replace('Status: In Progress', 'Status: Done').replace('- [ ] rejects', '- [x] rejects'));
    expect(measureShape(root, SHAPE).requirements.find((r) => r.id === 'FR-1.2')!.canonicalHash).toBe(before);
    writeFileSync(join(root, 'docs/stories/login.md'), FILES['docs/stories/login.md']!.replace('rejects a bad password', 'rejects any bad password'));
    expect(measureShape(root, SHAPE).requirements.find((r) => r.id === 'FR-1.2')!.canonicalHash).not.toBe(before);
  });

  it('measures what a repair round and the drift statement are made of (clauses 3 and 11)', () => {
    const root = project(FILES);
    const m = measureShape(root, SHAPE);
    expect(m.duplicates).toEqual([{ id: 'SYS-TRACE-001', document: 'docs/spec/08-trace/01.md', line: 10 }]);
    expect(m.mentionedOnly).toEqual(['SYS-TRACE-999']);
    expect(m.emptyDocuments).toEqual(['docs/spec/README.md']);
    expect(driftOf(m)).toMatchObject({ mentionedCount: 1, emptyCount: 1, duplicates: 1, malformed: 0 });
    expect(m.documents.map((d) => d.path)).toEqual(['docs/spec/08-trace/01.md', 'docs/stories/login.md']);
  });

  it('counts a definition line whose identifier the shape does not hold, and draws no card for it', () => {
    const root = project({ 'docs/spec/a.md': '- **SYS-A-001** — one\n- **SYS-A-1** — malformed by the shape\n- **SYS-A-002** — two\n' });
    const m = measureShape(root, { ...SHAPE, stores: [{ dir: 'docs/spec', definition: '^-\\s+\\*\\*(?<id>SYS-[A-Z]+-\\d+)\\*\\*', criteria: false }], identifier: 'SYS-[A-Z]+-\\d{3}', implRoots: [], testRoots: [] });
    expect(m.requirements.map((r) => r.id)).toEqual(['SYS-A-001', 'SYS-A-002']);
    expect(m.malformed).toEqual([{ document: 'docs/spec/a.md', line: 2, text: '- **SYS-A-1** — malformed by the shape' }]);
  });

  it('passes over a line longer than the bound and counts it (REQ-ADOPT-017)', () => {
    const root = project({ 'docs/spec/a.md': `- **SYS-A-001** — one\n${'x'.repeat(16_001)}\n- **SYS-A-002** — two\n` });
    const m = measureShape(root, { ...SHAPE, stores: [SHAPE.stores[0]!], implRoots: [], testRoots: [] });
    expect(m.skippedLines).toBe(1);
    expect(m.requirements).toHaveLength(2);
  });
});

describe('the evidence and the parse the projection takes (clauses 4 and 12)', () => {
  it('reads citations under the roots, a test by its root or its name', () => {
    const root = project(FILES);
    const m = measureShape(root, SHAPE);
    const { sites } = citeShape(root, SHAPE, new Set(m.requirements.map((r) => r.id)));
    expect(sites).toEqual([
      { path: 'tests/login_test.py', line: 1, kind: 'test', ids: ['FR-1.2'] },
      { path: 'src/board.test.ts', line: 1, kind: 'test', ids: ['SYS-TRACE-001'] },
      { path: 'src/board.ts', line: 1, kind: 'implementation', ids: ['SYS-TRACE-001'] },
      { path: 'src/board.ts', line: 2, kind: 'implementation', ids: ['SYS-TRACE-002'] },
    ]);
  });

  it('owes nothing by default and everything when the shape says required', () => {
    const root = project(FILES);
    const m = measureShape(root, SHAPE);
    const { sites } = citeShape(root, SHAPE, new Set(m.requirements.map((r) => r.id)));
    const { parse, report } = shapeParse(root, SHAPE, m, sites, 7);
    expect(parse.records.map((r) => [r.id, r.number, r.status, r.traceRequired])).toEqual([['FR-1.2', 1, 'approved', false], ['FR-1.10', 2, 'approved', false], ['SYS-TRACE-001', 3, 'approved', false], ['SYS-TRACE-002', 4, 'approved', false], ['SYS-TRACE-010', 5, 'approved', false]]);
    expect(report.generation).toBe(7);
    expect(report.evidence['SYS-TRACE-001']).toMatchObject({ implementationTrace: 'satisfied', coveringTest: 'satisfied' });
    expect(report.evidence['SYS-TRACE-010']).toEqual({ sites: [] });
    expect(parse.errors).toHaveLength(1);
    expect(parse.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(shapeParse(root, { ...SHAPE, obligations: 'required' }, m, sites, 1).parse.records.every((r) => r.traceRequired && r.testRequired)).toBe(true);
  });
});

describe('an identifier of a surveyed shape crosses a boundary and sorts (clause 1)', () => {
  it.each(['SYS-TRACE-001', 'FR-1.2', 'SYS-12', 'US_7', 'Auth-Login-3'])('%s is an identifier', (id) => expect(ReqIdSchema.safeParse(id).success).toBe(true));
  it.each(['', 'REQ', '-SYS-1', 'SYS--1', 'SYS-1/2', 'REQ 1', `R-${'1'.repeat(90)}`])('%j is not', (id) => expect(ReqIdSchema.safeParse(id).success).toBe(false));
  it('sorts digit runs by value', () => {
    expect(['SYS-AUTH-010', 'FR-1.10', 'SYS-AUTH-009', 'FR-1.2'].sort(compareReqIds)).toEqual(['FR-1.2', 'FR-1.10', 'SYS-AUTH-009', 'SYS-AUTH-010']);
  });
  it('titles a long run of tabs at once (CodeQL 249)', () => {
    const started = performance.now();
    expect(titleOf(`US-1 x${'\t'.repeat(15_000)}y`, 4)).toMatch(/^x/);
    expect(performance.now() - started).toBeLessThan(500);
  });
  it('titles a definition line by what follows the identifier', () => {
    expect(titleOf('| **FR-3** | Export a report | high |', 10)).toBe('Export a report | high');
    expect(titleOf('### SYS-1: Short.', 9)).toBe('Short.');
  });
});
