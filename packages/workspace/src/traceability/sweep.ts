import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { MonotonicClock } from '@rotaris/kernel';
import type { AnnotationSite, SweepResult } from '@rotaris/contracts';
import { checkpoint, type CancelToken } from './cancel.js';
import { annotationKindOf, registerConventions, type ConventionRegistry, type RegisteredConvention } from './conventions.js';
import { decodeUtf8, normaliseLineEndings } from './hashes.js';
import { LEGACY_TOKEN, identifierOf, identifierPattern } from './identifiers.js';
import { isUnderRoot, type ResolvedLayout } from './layout.js';
import { loadParser, parserLoadMs, type Parser } from './parser.js';
import { reportPhase, type ProgressHost } from './progress.js';
import { isSkipped } from './store.js';

/**
 * The repository sweep (REQ-TRACE-080 to REQ-TRACE-088): for each configured root that exists, every claimed
 * extension recursively, de-duplicated, skip components excluded, the generated artifact excluded, iterated sorted
 * by repository-relative POSIX path — implementation roots first, then test roots, each in configured order. Files
 * are read UTF-8 with replacement and normalised to LF (073: patterns run against the normalised text). A static
 * text scan, never an import (079): a reference in a string literal or unreachable code still counts.
 *
 * Every identifier is reported with the line it actually occupies and its own character span (084), the
 * decorator-versus-plain distinction is recorded (086), and offset-to-line mapping is exact at every boundary (087).
 */
export type OccurrenceKind = 'trace' | 'covers' | 'comment';
export type Direction = 'implementation' | 'test';

export interface Occurrence {
  /** null for a comment-form token that resolved to nothing (071) — recorded with no number attached. */
  readonly number: number | null;
  readonly path: string;
  /** 1-based, the line the identifier itself occupies. */
  readonly line: number;
  readonly kind: OccurrenceKind;
  /** Character offsets in the normalised text, end exclusive; the text at the span is exactly the identifier as written. */
  readonly span: readonly [number, number];
  readonly text: string;
  readonly direction: Direction;
  /** Index into `annotations` for the two annotation kinds. */
  readonly annotation?: number;
}

export interface AnnotationRecord {
  readonly path: string;
  readonly kind: 'trace' | 'covers';
  readonly firstLine: number;
  readonly lastLine: number;
  readonly span: readonly [number, number];
  readonly identifiers: readonly string[];
  readonly numbers: readonly number[];
  readonly decorator: boolean;
}

export interface TestFunction { readonly node: string; readonly path: string; readonly name: string; readonly line: number; readonly windowStart: number; readonly windowEnd: number }

/** What the seam's `SweepResult` does not carry and the verification pass needs. */
export interface SweepDetails {
  readonly occurrences: readonly Occurrence[];
  readonly annotations: readonly AnnotationRecord[];
  /** Implementation files holding at least one implementation trace (082). */
  readonly tracedFiles: readonly string[];
  /** Files whose text contains the exempt marker anywhere — a plain substring test (105). */
  readonly markedModules: readonly string[];
  /** Files a project convention's `exempt_module_pattern` matched, and — Part AJ2 — built-in modules the parser found re-export-only (104, rule 1). */
  readonly exemptModules: readonly string[];
  /** For test files: the 1-based lines on which the exempt marker occurs (113). */
  readonly markerLines: Readonly<Record<string, readonly number[]>>;
  /** Collected test functions: pattern-declared conventions by their `test_pattern` (073), the built-in convention from the syntax tree (109; Part AJ2). */
  readonly testFunctions: readonly TestFunction[];
  /** Built-in-convention files under a test root whose test functions could NOT be collected because the parser is unavailable (Part AJ2: empty when it is; REQ-TRACE-109/110). */
  readonly undecidedTestFiles: readonly string[];
  /** Files under an excused test root (047). */
  readonly excusedTestFiles: readonly string[];
  readonly conventionOf: Readonly<Record<string, string>>;
  /** The extensions the toolchain swept, each once (074). */
  readonly extensions: readonly string[];
  readonly files: number;
  // Part AJ2 — what the syntax-tree parser decided (REQ-TRACE-104 rule 1, 109, 110) and what it cost (OQ-24).
  /** Built-in implementation modules with no trace and no marker whose re-export test could not be made because the parser is unavailable. */
  readonly undecidedModules: readonly string[];
  /** Built-in implementation modules whose text did not parse: never excused (104's last sentence). */
  readonly unparsableModules: readonly string[];
  /** Built-in test files whose text did not parse: an empty function list, no orphans (110). */
  readonly unparsableTests: readonly string[];
  /** For a parsed candidate that is not re-export-only: the first statement that disqualified it, for the finding. */
  readonly disqualifiedBy: Readonly<Record<string, { readonly kind: string; readonly line: number }>>;
  /** The parser's availability, and the parse time inside `durationMs` (REQ-TRACE-088 budgets the sweep without it; OQ-24 measures this). */
  readonly parser: { readonly available: true; readonly version: string; readonly loadMs: number } | { readonly available: false; readonly reason: string };
  readonly parseMs: number;
  readonly parsedFiles: number;
}

export interface SweepOutput extends SweepResult { readonly details: SweepDetails }

export interface SweepInput {
  readonly root: string;
  readonly layout: ResolvedLayout;
  /** REQ-TRACE-021's alias table from the store parse (upper-cased key → number, or null when ambiguous). */
  readonly aliases: Readonly<Record<string, number | null>>;
  readonly clock: MonotonicClock;
  readonly token?: CancelToken;
  readonly progress?: ProgressHost;
  /** Part AJ2: the syntax-tree parser; the process's one, loaded on first need, unless a test supplies another. */
  readonly parser?: Parser;
}

/** Offsets at which each line starts; line 1 starts at 0. */
export function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}

/** 1-based line of a character offset — exact at every boundary, including offsets past the end (087). */
export function lineOf(starts: readonly number[], offset: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid]! <= offset) lo = mid; else hi = mid - 1;
  }
  return lo + 1;
}

/** REQ-TRACE-080: enumeration under one root; repository-relative POSIX paths. */
function enumerateRoot(root: string, rootRel: string, registry: ConventionRegistry, layout: ResolvedLayout): string[] {
  let isDir = false;
  try { isDir = statSync(join(root, rootRel)).isDirectory(); } catch { isDir = false; }
  if (!isDir) return [];
  const out: string[] = [];
  const walk = (rel: string): void => {
    let entries;
    try { entries = readdirSync(join(root, rel), { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const relPath = `${rel}/${e.name}`;
      if (isSkipped(relPath.slice(rootRel.length + 1).split('/'), layout.skipParts)) continue;
      if (e.isDirectory()) walk(relPath);
      else if (e.isFile() && registry.claims.has(extname(e.name)) && relPath !== layout.generatedPath) out.push(relPath);
    }
  };
  walk(rootRel);
  return out;
}

export interface FileScan {
  readonly occurrences: Occurrence[];
  readonly annotations: AnnotationRecord[];
  readonly references: number[];
  readonly marked: boolean;
  readonly markerLines: number[];
  readonly exemptByPattern: boolean;
  readonly testFunctions: TestFunction[];
}

/** REQ-TRACE-083: one file's two answers — which requirements it references, and what each annotation says — from one scan. */
export function scanFile(text: string, path: string, direction: Direction, convention: RegisteredConvention, prefix: string, aliases: Readonly<Record<string, number | null>>, exemptMarker: string): FileScan {
  const starts = lineStarts(text);
  const occurrences: Occurrence[] = [];
  const annotations: AnnotationRecord[] = [];
  const references = new Set<number>();
  const idPattern = identifierPattern(prefix);
  const annotationRe = new RegExp(convention.annotation.source, convention.annotation.flags.includes('g') ? convention.annotation.flags : `${convention.annotation.flags}g`);
  for (const m of text.matchAll(annotationRe)) {
    const kind = annotationKindOf(m[1]);
    const whole = m[0];
    const start = m.index;
    const end = start + whole.length;
    const argsOffset = convention.builtIn && m[2] !== undefined ? start + whole.lastIndexOf(m[2]) : start;
    const args = convention.builtIn && m[2] !== undefined ? m[2] : whole;
    const identifiers: string[] = [];
    const numbers: number[] = [];
    const index = annotations.length;
    const referenceRe = new RegExp(convention.reference.source, convention.reference.flags.includes('g') ? convention.reference.flags : `${convention.reference.flags}g`);
    for (const r of args.matchAll(referenceRe)) {
      let number: number | null = null;
      let text_: string;
      let at: number;
      if (convention.builtIn) {
        if (r[3] !== undefined) { number = Number(r[3]); text_ = r[3]; at = r.index + r[0].lastIndexOf(r[3]); }
        else if (r[1] === prefix && r[2] !== undefined && /^(0|[1-9][0-9]*)$/.test(r[2])) { number = Number(r[2]); text_ = `${r[1]}_${r[2]}`; at = r.index + r[0].lastIndexOf(text_); }
        else continue;
      } else {
        const captured = r[1] ?? r[0];
        const canonical = idPattern.exec(captured);
        if (canonical) number = Number(canonical[1]);
        else if (/^(0|[1-9][0-9]*)$/.test(captured)) number = Number(captured);
        else continue;
        text_ = captured;
        at = r.index + r[0].lastIndexOf(captured);
      }
      const abs = argsOffset + at;
      identifiers.push(text_);
      numbers.push(number);
      references.add(number);
      occurrences.push({ number, path, line: lineOf(starts, abs), kind, span: [abs, abs + text_.length], text: text_, direction, annotation: index });
    }
    // REQ-TRACE-086: decorator position — the marker on its own line(s), opened by `@`, with nothing else on those lines.
    const firstLine = lineOf(starts, start);
    const lastLine = lineOf(starts, Math.max(start, end - 1));
    const lineStart = starts[firstLine - 1]!;
    const lineEnd = lastLine < starts.length ? starts[lastLine]! - 1 : text.length;
    const before = text.slice(lineStart, start);
    const after = text.slice(end, lineEnd);
    const decorator = /^\s*@\s*$/.test(before) && after.trim().length === 0;
    annotations.push({ path, kind, firstLine, lastLine, span: [start, end], identifiers, numbers, decorator });
  }
  // REQ-TRACE-070/071: the transitional comment, a test-side convention only; an occurrence outside a test root counts towards nothing.
  if (direction === 'test') {
    for (const m of text.matchAll(/covers:[ \t]+([^\n]*)/gi)) {
      const listOffset = m.index + m[0].length - m[1]!.length;
      for (const t of m[1]!.matchAll(/[^,\s]+/g)) {
        const token = t[0];
        const abs = listOffset + t.index;
        const canonical = idPattern.exec(token);
        let number: number | null;
        if (canonical) number = Number(canonical[1]);
        else if (LEGACY_TOKEN.test(token)) number = aliases[token.toUpperCase()] ?? null;
        else continue;
        if (number !== null) references.add(number);
        occurrences.push({ number, path, line: lineOf(starts, abs), kind: 'comment', span: [abs, abs + token.length], text: token, direction });
      }
    }
  }
  const markerLines: number[] = [];
  let marked = false;
  if (exemptMarker.length > 0) {
    let from = text.indexOf(exemptMarker);
    while (from >= 0) { marked = true; markerLines.push(lineOf(starts, from)); from = text.indexOf(exemptMarker, from + exemptMarker.length); }
  }
  const testFunctions: TestFunction[] = [];
  if (convention.test !== null) {
    const testRe = new RegExp(convention.test.source, convention.test.flags.includes('g') ? convention.test.flags : `${convention.test.flags}g`);
    for (const m of text.matchAll(testRe)) {
      const name = m[1] ?? m[0];
      const line = lineOf(starts, m.index);
      // REQ-TRACE-073: the matched line is the whole span, extended above by REQ-TRACE-112's two lines.
      testFunctions.push({ node: `${path}::${name}`, path, name, line, windowStart: Math.max(1, line - 2), windowEnd: line });
    }
  }
  const exemptByPattern = convention.exemptModule !== null && new RegExp(convention.exemptModule.source, convention.exemptModule.flags).test(text);
  // One file's occurrences in the order they occupy the text, whatever form produced them.
  occurrences.sort((a, b) => a.span[0] - b.span[0]);
  return { occurrences, annotations, references: [...references].sort((a, b) => a - b), marked, markerLines, exemptByPattern, testFunctions };
}

function siteOf(o: Occurrence, prefix: string, testNode: string | undefined): AnnotationSite {
  const kind = o.kind === 'trace' ? 'implementation' : o.kind === 'covers' ? 'test' : 'covers';
  const s: { path: string; line: number; kind: AnnotationSite['kind']; ids: string[]; testNode?: string } = { path: o.path, line: o.line, kind, ids: [o.number === null ? o.text : identifierOf(prefix, o.number)] };
  if (testNode !== undefined) s.testNode = testNode;
  return s;
}

/** The sweep. Throws `CancelledError` at a checkpoint between files (REQ-TRACE-222). */
export function sweepRepository(input: SweepInput): SweepOutput {
  const started = Number(input.clock.now());
  const { root, layout } = input;
  reportPhase(input.progress, 'coverage', 0);
  const registry = registerConventions(layout.annotationConventions);
  const seen = new Set<string>();
  const ordered: { path: string; direction: Direction }[] = [];
  for (const [roots, direction] of [[layout.implRoots, 'implementation'], [layout.testRoots, 'test']] as const) {
    for (const r of roots) {
      const files = enumerateRoot(root, r, registry, layout).filter((p) => !seen.has(p)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      for (const p of files) { seen.add(p); ordered.push({ path: p, direction }); }
    }
  }
  const occurrences: Occurrence[] = [];
  const annotations: AnnotationRecord[] = [];
  const tracedFiles = new Set<string>();
  const markedModules: string[] = [];
  const exemptModules: string[] = [];
  const markerLines: Record<string, number[]> = {};
  const testFunctions: TestFunction[] = [];
  const undecidedTestFiles: string[] = [];
  const excusedTestFiles: string[] = [];
  const conventionOf: Record<string, string> = {};
  const modules: string[] = [];
  const tests: string[] = [];
  // Part AJ2 — the parser is asked only where the patterns cannot decide: a built-in implementation module with no
  // trace and no marker (REQ-TRACE-104's rules 2 and 3 already excuse the rest, and the outcome is the same whichever
  // rule is named first), and every built-in test file that is not excused (109). It is loaded on the first such file,
  // so a repository with nothing to decide never pays for it; the parse time is kept apart from the matching time.
  const undecidedModules: string[] = [];
  const unparsableModules: string[] = [];
  const unparsableTests: string[] = [];
  const disqualifiedBy: Record<string, { kind: string; line: number }> = {};
  let parser: Parser | undefined = input.parser;
  let parseMs = 0;
  let parsedFiles = 0;
  const parserOf = (): Parser => { parser ??= loadParser(input.clock); return parser; };
  const timed = <T>(fn: () => T): T => { const t0 = Number(input.clock.now()); try { return fn(); } finally { parseMs += Number(input.clock.now()) - t0; parsedFiles += 1; } };
  for (const { path, direction } of ordered) {
    checkpoint(input.token, `before ${path}`);
    const convention = registry.claims.get(extname(path))!;
    conventionOf[path] = convention.name;
    const excused = direction === 'test' && layout.excusedTestRoots.some((r) => isUnderRoot(path, r));
    if (excused) excusedTestFiles.push(path);
    let text: string;
    try { text = normaliseLineEndings(decodeUtf8(readFileSync(join(root, path)))); } catch { continue; }
    const scan = scanFile(text, path, direction, convention, layout.idPrefix, input.aliases, layout.exemptMarker);
    const base = annotations.length;
    for (const a of scan.annotations) annotations.push(a);
    let traced = false;
    for (const o of scan.occurrences) {
      occurrences.push(o.annotation === undefined ? o : { ...o, annotation: o.annotation + base });
      if (o.kind === 'trace' && direction === 'implementation' && o.number !== null) { tracedFiles.add(path); traced = true; }
    }
    if (direction === 'implementation') {
      modules.push(path);
      if (scan.marked) markedModules.push(path);
      if (scan.exemptByPattern) exemptModules.push(path);
      if (convention.builtIn && !traced && !scan.marked) {
        const p = parserOf();
        if (!p.available) undecidedModules.push(path);
        else {
          const a = timed(() => p.analyseModule(text, path));
          if (!a.parsed) unparsableModules.push(path);
          else if (a.reExportOnly) exemptModules.push(path);
          else if (a.disqualifiedBy) disqualifiedBy[path] = a.disqualifiedBy;
        }
      }
    } else {
      tests.push(path);
      if (scan.markerLines.length > 0) markerLines[path] = scan.markerLines;
      if (!convention.builtIn) testFunctions.push(...scan.testFunctions);
      else if (!excused) {
        const p = parserOf();
        if (!p.available) undecidedTestFiles.push(path);
        else {
          const c = timed(() => p.collectTests(text, path));
          if (!c.parsed) unparsableTests.push(path); else testFunctions.push(...c.functions);
        }
      }
    }
  }
  const functionsByPath = new Map<string, TestFunction[]>();
  for (const t of testFunctions) { const l = functionsByPath.get(t.path) ?? []; l.push(t); functionsByPath.set(t.path, l); }
  const nodeAt = (o: Occurrence): string | undefined => functionsByPath.get(o.path)?.find((t) => o.line >= t.windowStart && o.line <= t.windowEnd)?.node;
  const sites = occurrences.map((o) => siteOf(o, layout.idPrefix, o.direction === 'test' ? nodeAt(o) : undefined));
  const parserState: SweepDetails['parser'] = parser === undefined ? { available: true, version: 'not needed', loadMs: 0 } : parser.available ? { available: true, version: parser.version, loadMs: parserLoadMs() } : { available: false, reason: parser.reason };
  return {
    sites, modules, tests, durationMs: Math.max(0, Math.round(Number(input.clock.now()) - started)),
    details: {
      occurrences, annotations, tracedFiles: [...tracedFiles], markedModules, exemptModules, markerLines, testFunctions, undecidedTestFiles, excusedTestFiles, conventionOf, extensions: registry.extensions, files: ordered.length,
      undecidedModules, unparsableModules, unparsableTests, disqualifiedBy, parser: parserState, parseMs: Math.round(parseMs), parsedFiles,
    },
  };
}

/** REQ-TRACE-085: whether a line falls within an annotation; and one identifier located by line AND number. */
export function annotationAt(annotations: readonly AnnotationRecord[], path: string, line: number): AnnotationRecord | undefined {
  return annotations.find((a) => a.path === path && line >= a.firstLine && line <= a.lastLine);
}

export function occurrenceAt(occurrences: readonly Occurrence[], path: string, line: number, number: number): Occurrence | undefined {
  return occurrences.find((o) => o.path === path && o.line === line && o.number === number);
}
