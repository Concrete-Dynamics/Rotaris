import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { FakeClock } from '@rotaris/kernel';
import { CancelledError, freshToken } from './cancel.js';
import { builtInConvention, registerConventions } from './conventions.js';
import { defaultLayout, parseLayout } from './layout.js';
import { annotationAt, lineOf, lineStarts, occurrenceAt, scanFile, sweepRepository } from './sweep.js';

/** REQ-TRACE-070 to REQ-TRACE-087: the built-in convention, the language seam, and the sweep. */
const clock = new FakeClock();
const ts = builtInConvention();
// REQ-TRACE-079: fixtures build annotation tokens by concatenation so a sweep of THIS repository credits nothing here.
const T = 'tra' + 'ces';
const C = 'cov' + 'ers';

describe('offset-to-line mapping (REQ-TRACE-087)', () => {
  it('is exact at every position from 0 to length+2 over the awkward texts', () => {
    for (const text of ['', '\n', '\n\n\n', 'a', 'ab\ncd', 'ab\ncd\n', 'a\r\nb\r\n'.replace(/\r\n/g, '\n'), 'x\n\ny\n']) {
      const starts = lineStarts(text);
      for (let offset = 0; offset <= text.length + 2; offset += 1) {
        const naive = (text.slice(0, Math.min(offset, text.length)).match(/\n/g) ?? []).length + 1;
        expect(lineOf(starts, offset), `${JSON.stringify(text)} @ ${offset}`).toBe(naive);
      }
    }
  });
});

describe('the built-in convention (REQ-TRACE-076..079, 083..086)', () => {
  it('matches plain calls and decorator position, multi-line argument lists, symbol and bare-integer forms, and refuses a nested call', () => {
    const text = [
      `import { ${T} } from 'rotaris-traceability';`,
      `@${T}(REQ_101)`,
      'export class A {}',
      `${T}(REQ_102, Requirement.REQ_103,`,
      '  104);',
      `${T} (`,
      '  REQ_105',
      ');',
      `${T}(f(REQ_106));`,
      `x.${T}(REQ_107); my${T}(REQ_108);`,
      `@${T}(REQ_109) export class B {}`,
      `const s = "${T}(REQ_110)";`,
    ].join('\n');
    const scan = scanFile(text, 'src/a.ts', 'implementation', ts, 'REQ', {}, 'trace-exempt');
    expect(scan.references).toEqual([101, 102, 103, 104, 105, 109, 110]);
    expect(scan.annotations.map((a) => [a.firstLine, a.lastLine, a.decorator, a.identifiers])).toEqual([
      [2, 2, true, ['REQ_101']], [4, 5, false, ['REQ_102', 'REQ_103', '104']], [6, 8, false, ['REQ_105']], [11, 11, false, ['REQ_109']], [12, 12, false, ['REQ_110']],
    ]);
    // REQ-TRACE-084: each identifier on the line it occupies, with a span whose text is exactly the identifier
    const occ = scan.occurrences;
    expect(occ.map((o) => [o.number, o.line])).toEqual([[101, 2], [102, 4], [103, 4], [104, 5], [105, 7], [109, 11], [110, 12]]);
    for (const o of occ) expect(text.slice(o.span[0], o.span[1])).toBe(o.text);
    // REQ-TRACE-083: the two answers agree exactly
    expect([...new Set(scan.annotations.flatMap((a) => a.numbers))].sort((a, b) => a - b)).toEqual(scan.references);
    // REQ-TRACE-085: a line within an annotation; one identifier by line and number, never by number alone
    expect(annotationAt(scan.annotations, 'src/a.ts', 5)?.firstLine).toBe(4);
    expect(annotationAt(scan.annotations, 'src/a.ts', 3)).toBeUndefined();
    expect(occurrenceAt(occ, 'src/a.ts', 4, 103)?.text).toBe('REQ_103');
    expect(occurrenceAt(occ, 'src/a.ts', 5, 103)).toBeUndefined();
  });
  it('REQ-TRACE-070/071/072: the covers: comment counts only under a test root; legacy tokens resolve through the alias table alone; an unresolved token is recorded with no number', () => {
    const text = `// ${C}: REQ-7, old-a  UNKNOWN-1 REQ-8\n// ${C}:REQ-9\n`;
    const test = scanFile(text, 'tests/t.ts', 'test', ts, 'REQ', { 'OLD-A': 3, SHARED: null }, 'trace-exempt');
    expect(test.occurrences.map((o) => [o.number, o.text, o.line, o.kind])).toEqual([[7, 'REQ-7', 1, 'comment'], [3, 'old-a', 1, 'comment'], [null, 'UNKNOWN-1', 1, 'comment'], [8, 'REQ-8', 1, 'comment']]);
    expect(test.references).toEqual([3, 7, 8]);
    expect(scanFile(text, 'src/t.ts', 'implementation', ts, 'REQ', {}, 'trace-exempt').occurrences).toEqual([]);
  });
  it('REQ-TRACE-105/113: the exempt marker is a plain substring anywhere, with its lines recorded', () => {
    const scan = scanFile('// trace-exempt\nconst s = "trace-exempt";\n', 'src/x.ts', 'implementation', ts, 'REQ', {}, 'trace-exempt');
    expect(scan.marked).toBe(true);
    expect(scan.markerLines).toEqual([1, 2]);
  });
  it('REQ-TRACE-073/074: a project convention claims its extensions after the built-in one; a later claim on .ts is never consulted; the extension list reports each once', () => {
    const reg = registerConventions([
      { name: 'py', extensions: ['.py', '.ts'], referencePattern: '(REQ-\\d+|\\d+)', annotationPattern: '@(implements|covers)\\(([^()]*)\\)', testPattern: '^def (test\\w*)', exemptModulePattern: '^# re-export only' },
      { name: 'py2', extensions: ['.py'], referencePattern: 'x', annotationPattern: 'x', testPattern: 'x', exemptModulePattern: 'x' },
    ]);
    expect(reg.claims.get('.ts')?.name).toBe('typescript');
    expect(reg.claims.get('.py')?.name).toBe('py');
    expect(reg.extensions).toEqual(['.ts', '.py']);
    const py = reg.claims.get('.py')!;
    const scan = scanFile('# re-export only\n@implements(REQ-5, 6)\ndef f(): pass\n\ndef test_one():\n    pass\n@covers(REQ-5)\ndef test_two():\n    pass\n', 'tests/legacy/t.py', 'test', py, 'REQ', {}, 'trace-exempt');
    expect(scan.occurrences.map((o) => [o.number, o.kind, o.line])).toEqual([[5, 'trace', 2], [6, 'trace', 2], [5, 'covers', 7]]);
    expect(scan.testFunctions.map((t) => [t.node, t.windowStart, t.windowEnd])).toEqual([['tests/legacy/t.py::test_one', 3, 5], ['tests/legacy/t.py::test_two', 6, 8]]);
    expect(scan.exemptByPattern).toBe(true);
  });
});

describe('sweepRepository (REQ-TRACE-080..082, 088)', () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'rotaris-sweep-')); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });
  const put = (rel: string, text: string): void => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text); };

  it('visits implementation roots then test roots, sorted, skipping components and the artifact; records direction; CRLF read as LF', () => {
    put('src/b.ts', `${T}(REQ_1);\r\n`);
    put('src/a.ts', `${C}(REQ_2); // a coverage annotation in an implementation root counts towards neither\n`);
    put('src/requirement_ids.ts', `${T}(REQ_3);\n`);
    put('src/node_modules/dep.ts', `${T}(REQ_4);\n`);
    put('src/fixtures/f.ts', `${T}(REQ_5);\n`);
    put('src/c.txt', `${T}(REQ_6);\n`);
    put('tests/t.ts', `${C}(REQ_1);\n// ${C}: REQ-7\n${T}(REQ_8);\n`);
    put('tests/excused/e.ts', `${C}(REQ_1);\n`);
    const layout = parseLayout('{"excused_test_roots": ["tests/excused"]}', 'x');
    const s = sweepRepository({ root, layout, aliases: {}, clock });
    expect(s.modules).toEqual(['src/a.ts', 'src/b.ts']);
    expect(s.tests).toEqual(['tests/excused/e.ts', 'tests/t.ts']);
    expect(s.details.excusedTestFiles).toEqual(['tests/excused/e.ts']);
    expect(s.details.undecidedTestFiles).toEqual(['tests/excused/e.ts', 'tests/t.ts']);
    expect(s.details.tracedFiles).toEqual(['src/b.ts']);
    expect(s.sites.map((x) => [x.path, x.line, x.kind, x.ids[0]])).toEqual([
      ['src/a.ts', 1, 'test', 'REQ-2'], ['src/b.ts', 1, 'implementation', 'REQ-1'], ['tests/excused/e.ts', 1, 'test', 'REQ-1'],
      ['tests/t.ts', 1, 'test', 'REQ-1'], ['tests/t.ts', 2, 'covers', 'REQ-7'], ['tests/t.ts', 3, 'implementation', 'REQ-8'],
    ]);
    expect(s.details.files).toBe(4);
    expect(s.details.extensions).toEqual(['.ts']);
    expect(s.durationMs).toBe(0);
  });
  it('REQ-TRACE-075: a repository written in a language no convention claims reports no traces at all', () => {
    put('src/main.rs', `${T}(REQ_1);\n`);
    const s = sweepRepository({ root, layout: defaultLayout(), aliases: {}, clock });
    expect(s.sites).toEqual([]);
    expect(s.modules).toEqual([]);
  });
  it('REQ-TRACE-222: a checkpoint between files', () => {
    put('src/a.ts', '');
    const c = new AbortController();
    c.abort();
    expect(() => sweepRepository({ root, layout: defaultLayout(), aliases: {}, clock, token: freshToken(c.signal) })).toThrow(CancelledError);
  });
});
