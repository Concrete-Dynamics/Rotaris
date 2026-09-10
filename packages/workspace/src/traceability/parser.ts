import { createRequire } from 'node:module';
import type * as TS from 'typescript';
import type { MonotonicClock } from '@rotaris/kernel';
import type { TestFunction } from './sweep.js';

/**
 * Part AJ2 — the syntax-tree parser ADR-0040 #3 left open and the second execution measured (OQ-24). Two checks
 * of the built-in TypeScript convention need a parse and nothing weaker: REQ-TRACE-104 rule 1 (a module excused
 * because its parsed contents are nothing beyond imports, module-level assignments naming exported symbols, and
 * documentation or bare string-literal statements) and REQ-TRACE-109/110 (test functions collected from the
 * syntax tree; a syntax error yields an empty list rather than a failure). Wave 1 reported both as `requires-parse`
 * findings; this module decides them.
 *
 * **The compiler API, and how it is loaded.** The build already carries `typescript` (ADR-0001); a native parser
 * would reintroduce the native-module burden ADR-0040 #3 names. The module is 8.7 MB and is loaded ONCE per
 * process, on first use, through `createRequire` — never through a static import — so that (a) a `parseStore` or
 * a `sweep` over a repository with nothing to decide never pays for it, and (b) the bundler leaves it out of the
 * workspace-service chunk and resolves it from `node_modules` at run time, as it does every other dependency.
 * The measured cost of that load is recorded in `spikes/traceability-scale.md` (about 0.4 s cold, once).
 *
 * NOT BUILT, stated: a packaged build that does not ship `typescript` beside the service finds no module and
 * the parser reports itself unavailable with the cause; the sweep then leaves the two checks undecided exactly as
 * wave 1 did, and the verification pass says so in its `requires-parse` findings. `typescript` is a root
 * development dependency of this repository and is not yet declared as a runtime dependency of the desktop
 * application (handoff §8, a ruling request): `pnpm package` would ship without it. The engine degrades rather
 * than fails, which is the behaviour REQ-TRACE-104's last sentence asks for of a rule that cannot read a file.
 *
 * Readings recorded in ADR-0040's Part AJ′ note: a test function is a *declaration* (`function`/`async function`)
 * at module level, never an arrow assigned to a constant (R15); a type-only declaration (`interface`, `type`) is
 * outside REQ-TRACE-104's closed list and therefore does NOT excuse a module (R14); `parseDiagnostics` is the
 * parser's own syntax-error list — public in behaviour for a decade, absent from the published type — and the
 * public `transpileModule` diagnostics are the fallback should a release drop it.
 */
export interface ModuleAnalysis {
  /** false when the text could not be parsed: REQ-TRACE-104 excuses nothing it cannot read. */
  readonly parsed: boolean;
  readonly reExportOnly: boolean;
  /** For a parsed module that is NOT re-export-only: the first statement that disqualified it, for the finding. */
  readonly disqualifiedBy?: { readonly kind: string; readonly line: number };
}

export interface TestCollection {
  /** false on a syntax error: the list is empty and the file contributes no orphans (REQ-TRACE-110). */
  readonly parsed: boolean;
  readonly functions: readonly TestFunction[];
}

export type Parser =
  | { readonly available: true; readonly version: string; analyseModule(text: string, path: string): ModuleAnalysis; collectTests(text: string, path: string): TestCollection }
  | { readonly available: false; readonly reason: string };

type TSModule = typeof TS;

let loaded: Parser | null = null;
let loadMs = 0;

/** Milliseconds the one-time load of the compiler module took in this process (by the clock the loader was given); 0 before it happened. */
export function parserLoadMs(): number {
  return loadMs;
}

/** The parser for this process, loaded on first call; a failed load is remembered and reported, never retried in a loop. */
export function loadParser(clock?: MonotonicClock): Parser {
  if (loaded) return loaded;
  const t0 = clock === undefined ? 0 : Number(clock.now());
  let ts: TSModule;
  try {
    ts = createRequire(import.meta.url)('typescript') as TSModule;
  } catch (e) {
    loaded = { available: false, reason: `the TypeScript compiler API could not be loaded (${e instanceof Error ? e.message : String(e)})` };
    return loaded;
  }
  loadMs = clock === undefined ? 0 : Math.max(0, Math.round(Number(clock.now()) - t0));
  loaded = { available: true, version: ts.version, analyseModule: (text, path) => analyseModule(ts, text, path), collectTests: (text, path) => collectTests(ts, text, path) };
  return loaded;
}

/** Tests only: forget the loaded module so a load failure can be simulated. */
export function resetParserForTests(next: Parser | null = null): void {
  loaded = next;
}

function sourceFileOf(ts: TSModule, text: string, path: string): { readonly sf: TS.SourceFile; readonly syntaxErrors: number } {
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, false, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const internal = (sf as unknown as { parseDiagnostics?: readonly unknown[] }).parseDiagnostics;
  if (internal !== undefined) return { sf, syntaxErrors: internal.length };
  // The public route, should a release withdraw the field: transpile once for its syntactic diagnostics.
  const diagnostics = ts.transpileModule(text, { reportDiagnostics: true, fileName: path }).diagnostics ?? [];
  return { sf, syntaxErrors: diagnostics.length };
}

/** An expression that merely NAMES a symbol: `a`, `a.b.c`, `this.x` — an assignment of one is a re-export, not executable code. */
function namesSymbol(ts: TSModule, e: TS.Expression): boolean {
  if (ts.isIdentifier(e)) return true;
  if (ts.isPropertyAccessExpression(e)) return namesSymbol(ts, e.expression);
  return false;
}

/** REQ-TRACE-104 rule 1 over one top-level statement: true when it is one of the three permitted kinds. */
function permittedInReExportModule(ts: TSModule, s: TS.Statement): boolean {
  if (ts.isImportDeclaration(s) || ts.isImportEqualsDeclaration(s) || ts.isExportDeclaration(s) || ts.isNamespaceExportDeclaration(s) || ts.isEmptyStatement(s)) return true;
  if (ts.isExportAssignment(s)) return namesSymbol(ts, s.expression);
  if (ts.isVariableStatement(s)) return s.declarationList.declarations.every((d) => d.initializer !== undefined && namesSymbol(ts, d.initializer));
  if (ts.isExpressionStatement(s)) return ts.isStringLiteral(s.expression) || ts.isNoSubstitutionTemplateLiteral(s.expression);
  return false;
}

function analyseModule(ts: TSModule, text: string, path: string): ModuleAnalysis {
  const { sf, syntaxErrors } = sourceFileOf(ts, text, path);
  if (syntaxErrors > 0) return { parsed: false, reExportOnly: false };
  for (const s of sf.statements) {
    if (permittedInReExportModule(ts, s)) continue;
    return { parsed: true, reExportOnly: false, disqualifiedBy: { kind: describeStatement(ts, s), line: sf.getLineAndCharacterOfPosition(s.getStart(sf)).line + 1 } };
  }
  return { parsed: true, reExportOnly: true };
}

function describeStatement(ts: TSModule, s: TS.Statement): string {
  if (ts.isFunctionDeclaration(s)) return `a function declaration${s.name ? ` (${s.name.text})` : ''}`;
  if (ts.isClassDeclaration(s)) return `a class declaration${s.name ? ` (${s.name.text})` : ''}`;
  if (ts.isIfStatement(s)) return 'a conditional';
  if (ts.isVariableStatement(s)) return 'a variable initialised with something other than a named symbol';
  if (ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s)) return 'a type declaration';
  if (ts.isEnumDeclaration(s)) return 'an enum declaration';
  if (ts.isModuleDeclaration(s)) return 'a namespace declaration';
  return 'an executable statement';
}

const TEST_PREFIX = 'test';

function testNameOf(ts: TSModule, name: TS.PropertyName | TS.Identifier | undefined): string | null {
  if (name === undefined) return null;
  const text = ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name) || ts.isNumericLiteral(name) || ts.isPrivateIdentifier(name) ? name.text : null;
  return text !== null && text.startsWith(TEST_PREFIX) ? text : null;
}

/** REQ-TRACE-112: the span starts at the minimum of the declaration line and every decorator line, ends at the syntactic end. */
function spanOf(ts: TSModule, sf: TS.SourceFile, node: TS.Node): { readonly start: number; readonly end: number } {
  let start = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const decorators = ts.canHaveDecorators(node) ? ts.getDecorators(node) ?? [] : [];
  for (const d of decorators) start = Math.min(start, sf.getLineAndCharacterOfPosition(d.getStart(sf)).line + 1);
  return { start, end: sf.getLineAndCharacterOfPosition(node.getEnd()).line + 1 };
}

function collectTests(ts: TSModule, text: string, path: string): TestCollection {
  const { sf, syntaxErrors } = sourceFileOf(ts, text, path);
  if (syntaxErrors > 0) return { parsed: false, functions: [] };
  const functions: TestFunction[] = [];
  const add = (node: TS.Node, name: string, klass: string | undefined): void => {
    const { start, end } = spanOf(ts, sf, node);
    // REQ-TRACE-112: the window extends two lines above the start, so a comment above a decorator stack still counts.
    functions.push({ node: klass === undefined ? `${path}::${name}` : `${path}::${klass}::${name}`, path, name, line: start, windowStart: Math.max(1, start - 2), windowEnd: end });
  };
  for (const s of sf.statements) {
    // REQ-TRACE-109: module-level function declarations (async included) named test*; one level of class nesting.
    if (ts.isFunctionDeclaration(s)) {
      const name = testNameOf(ts, s.name);
      if (name !== null) add(s, name, undefined);
    } else if (ts.isClassDeclaration(s) && s.name !== undefined) {
      for (const m of s.members) {
        if (!ts.isMethodDeclaration(m)) continue;
        const name = testNameOf(ts, m.name);
        if (name !== null) add(m, name, s.name.text);
      }
    }
    // Nothing deeper: a class inside a class and a function inside a test body are helpers (109).
  }
  return { parsed: true, functions };
}
