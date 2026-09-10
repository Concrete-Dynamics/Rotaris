import { afterEach, describe, expect, it } from 'vitest';
import { FakeClock } from '@rotaris/kernel';
import { loadParser, parserLoadMs, resetParserForTests } from './parser.js';

/**
 * Part AJ2 — REQ-TRACE-104 rule 1, REQ-TRACE-109, REQ-TRACE-110, REQ-TRACE-111 and REQ-TRACE-112 over the TypeScript
 * compiler API, which is the parser ADR-0040 #3 left to be measured. The annotation names are built by concatenation
 * so a sweep of THIS repository credits nothing here (REQ-TRACE-079).
 */
const C = 'cov' + 'ers';
afterEach(() => resetParserForTests(null));

function parser() {
  const p = loadParser(new FakeClock().monotonic);
  if (!p.available) throw new Error(p.reason);
  return p;
}

describe('REQ-TRACE-104 rule 1: a re-export-only module', () => {
  const analyse = (text: string) => parser().analyseModule(text, 'src/m.ts');
  it('is excused when its parsed contents are nothing beyond imports, assignments naming exported symbols, and documentation or bare string literals', () => {
    expect(analyse(`/** the barrel */\n'use strict';\nimport x from './x';\nimport { y } from './y';\nexport { x, y };\nexport * from './z';\nexport { a as b } from './a';\nexport default x;\nexport const z = x.y.w;\n`)).toEqual({ parsed: true, reExportOnly: true });
    expect(analyse('')).toEqual({ parsed: true, reExportOnly: true });
    expect(analyse('// only a comment\n')).toEqual({ parsed: true, reExportOnly: true });
  });
  it('is disqualified by any function declaration, class declaration, conditional or other executable statement, naming the first', () => {
    expect(analyse(`import x from './x';\nexport function f(): void {}\n`).disqualifiedBy).toEqual({ kind: 'a function declaration (f)', line: 2 });
    expect(analyse('export class K {}\n').disqualifiedBy).toEqual({ kind: 'a class declaration (K)', line: 1 });
    expect(analyse("import x from './x';\nif (x) { x(); }\n").disqualifiedBy).toEqual({ kind: 'a conditional', line: 2 });
    expect(analyse('export const untraced = true;\n').disqualifiedBy).toEqual({ kind: 'a variable initialised with something other than a named symbol', line: 1 });
    expect(analyse("import x from './x';\nexport default x();\n").disqualifiedBy).toEqual({ kind: 'an executable statement', line: 2 });
    expect(analyse("import x from './x';\nx.run();\n").disqualifiedBy).toEqual({ kind: 'an executable statement', line: 2 });
    // R14: a type-only declaration is outside the closed list, so it does not excuse the module either.
    expect(analyse('export interface I { a: number }\n').disqualifiedBy).toEqual({ kind: 'a type declaration', line: 1 });
    expect(analyse('export enum E { A }\n').disqualifiedBy).toEqual({ kind: 'an enum declaration', line: 1 });
  });
  it('excuses nothing it cannot parse (a rule that cannot read a file is in no position to vouch for it)', () => {
    expect(analyse('export function (\n')).toEqual({ parsed: false, reExportOnly: false });
    expect(analyse("export { a } from './a'\nexport {\n")).toEqual({ parsed: false, reExportOnly: false });
  });
});

describe('REQ-TRACE-109..112: test-function collection from the syntax tree', () => {
  const collect = (text: string) => parser().collectTests(text, 'tests/t.ts');
  it('collects module-level functions and async functions named test*, and one level of class methods; nothing deeper; not an arrow', () => {
    const text = [
      '// header',                                                  // 1
      `@${C}(R.X)`,                                                 // 2
      '@other()',                                                   // 3
      'export async function testDecorated(): Promise<void> {',    // 4
      '  await x;',                                                 // 5
      '}',                                                          // 6
      'function testPlain() {}',                                    // 7
      'function helper() {}',                                       // 8
      'export const testArrow = () => {};',                         // 9 — R15: not a declaration
      'class Suite {',                                              // 10
      '  testM() {}',                                               // 11
      '  async testN() { function testInner() {} }',                // 12 — the inner function is a helper
      '  helper() {}',                                              // 13
      '  static testS() {}',                                        // 14
      '  inner = class { testDeep() {} };',                         // 15 — a class inside a class is a helper
      '}',                                                          // 16
      'export default class { testAnon() {} }',                     // 17 — no class name, no node identifier
    ].join('\n');
    const c = collect(text);
    expect(c.parsed).toBe(true);
    expect(c.functions.map((f) => [f.node, f.name, f.line, f.windowStart, f.windowEnd])).toEqual([
      ['tests/t.ts::testDecorated', 'testDecorated', 2, 1, 6],   // 112: the span starts at the first decorator; the window two lines above, floored at 1
      ['tests/t.ts::testPlain', 'testPlain', 7, 5, 7],
      ['tests/t.ts::Suite::testM', 'testM', 11, 9, 11],           // 111: <path>::<Class>::<function>
      ['tests/t.ts::Suite::testN', 'testN', 12, 10, 12],
      ['tests/t.ts::Suite::testS', 'testS', 14, 12, 14],
    ]);
  });
  it('REQ-TRACE-110: a syntax error yields an empty list rather than a failure', () => {
    expect(collect('function testBroken( {\n')).toEqual({ parsed: false, functions: [] });
  });
  it('REQ-TRACE-111: two classes declaring the same method name stay distinguishable', () => {
    const c = collect('class A { testSame() {} }\nclass B { testSame() {} }\n');
    expect(c.functions.map((f) => f.node)).toEqual(['tests/t.ts::A::testSame', 'tests/t.ts::B::testSame']);
  });
});

describe('the loader', () => {
  it('loads the compiler once per process and reports its version and load time by the clock it was given', () => {
    resetParserForTests(null);
    const clock = new FakeClock().monotonic;
    const p = loadParser(clock);
    expect(p.available && /^\d+\.\d+/.test(p.version)).toBe(true);
    expect(loadParser(clock)).toBe(p);
    expect(parserLoadMs()).toBeGreaterThanOrEqual(0);
  });
  it('a failed load is remembered and reported, not thrown', () => {
    resetParserForTests({ available: false, reason: 'simulated' });
    const p = loadParser();
    expect(p).toEqual({ available: false, reason: 'simulated' });
  });
});
