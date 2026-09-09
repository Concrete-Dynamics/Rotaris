import type { AnnotationSite, Finding, RequirementEvidence, RequirementRecord, StoreParse, SweepResult, VerificationReport } from '@rotaris/contracts';
import { DECLARATIONS_MODULE, ENUM_NAME, REGENERATE_ACTION, isArtifactUpToDate, renderArtifact } from './artifact.js';
import { PRUNE_ACTION, parseDebtBaseline, parseOrphanModuleBaseline, parseOrphanTestBaseline, suppressed, type DebtFlag } from './baselines.js';
import { COVERS_ANNOTATION, TRACE_ANNOTATION } from './conventions.js';
import { identifierOf, identifierPattern, symbolName } from './identifiers.js';
import { isUnderRoot, type ResolvedLayout } from './layout.js';
import { byNumber } from './store.js';
import type { SweepDetails, SweepOutput } from './sweep.js';

/**
 * The verification pass (REQ-TRACE-090 to REQ-TRACE-115, 122, 127, 503): pure — lists in, lists out, nothing
 * written, nothing logged. One reading of the store and one of the repository serve every check (091), and the
 * findings come back grouped by check in the order 091 lists the checks: the generated artifact, malformed baseline
 * lines, derived-from integrity, references to requirements that no longer exist, deprecated references, missing
 * implementation traces, missing coverage, stale baseline entries, unresolved legacy comment references, orphan
 * modules, orphan tests. Any parse error short-circuits to the parse errors alone (092). The empty-store warning of
 * 503 leads the list, since it describes the reading every check was made against.
 *
 * Two checks need a syntax tree this build does not carry (ADR-0040 #3 leaves the parser to be measured — wave 2):
 * REQ-TRACE-104 rule 1 (re-export-only modules) and REQ-TRACE-109/110 (test-function collection) for the built-in
 * TypeScript convention. Those are reported as `requires-parse` warnings stating why, never guessed at with a
 * pattern; a pattern-declared convention is regex by specification (073) and runs both checks in full.
 */
export const FINDING_CODES = ['parse-error', 'empty-store', 'artifact', 'baseline-malformed', 'derived-from', 'missing-requirement', 'deprecated-reference', 'missing-trace', 'missing-coverage', 'baseline-stale', 'legacy-unresolved', 'orphan-module', 'orphan-test', 'requires-parse'] as const;
export type FindingCode = (typeof FINDING_CODES)[number];

/** The rank of each code in REQ-TRACE-091's order; `requires-parse` takes the rank of the check it stands in for, given by the caller. */
export const CHECK_ORDER: readonly FindingCode[] = ['parse-error', 'empty-store', 'artifact', 'baseline-malformed', 'derived-from', 'missing-requirement', 'deprecated-reference', 'missing-trace', 'missing-coverage', 'baseline-stale', 'legacy-unresolved', 'orphan-module', 'orphan-test'];

export interface VerifyInput {
  readonly parse: StoreParse;
  readonly sweep: SweepResult;
  readonly layout: ResolvedLayout;
  readonly artifact: string | null;
  readonly debtBaseline: string | null;
  readonly orphanModuleBaseline: string | null;
  readonly orphanTestBaseline: string | null;
  readonly generation: number;
}

/** What the baseline update needs beside the report: the CURRENT (unsuppressed) debt, and whether the orphan-test set could be decided. */
export interface CurrentDebt {
  readonly debt: Map<number, Set<DebtFlag>>;
  readonly orphanModules: Set<string>;
  readonly orphanTests: Set<string>;
  readonly orphanTestsDecidable: boolean;
}

export interface VerifyOutput extends VerificationReport {
  readonly parseErrorsOnly: boolean;
  readonly current: CurrentDebt;
  readonly artifactUpToDate: boolean;
  readonly freshArtifact: string;
  /** The check each `requires-parse` finding stands in for, in emission order. */
  readonly requiresParse: readonly { readonly check: 'orphan-module' | 'orphan-test'; readonly path: string }[];
}

type Direction = 'implementation' | 'test';

interface SweepIndex {
  readonly implementationTraces: Map<number, AnnotationSite[]>;
  readonly coverage: Map<number, AnnotationSite[]>;
  readonly references: Map<number, AnnotationSite[]>;
  readonly unresolved: AnnotationSite[];
  readonly tracedFiles: Set<string>;
}

function directionOf(path: string, layout: ResolvedLayout): Direction | null {
  if (layout.implRoots.some((r) => isUnderRoot(path, r))) return 'implementation';
  if (layout.testRoots.some((r) => isUnderRoot(path, r))) return 'test';
  return null;
}

/** REQ-TRACE-072/082: the sweep's sites indexed by number and direction — derivable from the seam value alone. */
export function indexSweep(sweep: SweepResult, layout: ResolvedLayout): SweepIndex {
  const idPattern = identifierPattern(layout.idPrefix);
  const add = (m: Map<number, AnnotationSite[]>, n: number, s: AnnotationSite): void => { const l = m.get(n) ?? []; l.push(s); m.set(n, l); };
  const index: SweepIndex = { implementationTraces: new Map(), coverage: new Map(), references: new Map(), unresolved: [], tracedFiles: new Set() };
  for (const s of sweep.sites) {
    const direction = directionOf(s.path, layout);
    for (const id of s.ids) {
      const m = idPattern.exec(id);
      if (!m) { if (s.kind === 'covers') index.unresolved.push(s); continue; }
      const n = Number(m[1]);
      add(index.references, n, s);
      if (s.kind === 'implementation' && direction === 'implementation') { add(index.implementationTraces, n, s); index.tracedFiles.add(s.path); }
      else if ((s.kind === 'test' || s.kind === 'covers') && direction === 'test') add(index.coverage, n, s);
    }
  }
  return index;
}

function detailsOf(sweep: SweepResult): SweepDetails | null {
  return (sweep as Partial<SweepOutput>).details ?? null;
}

const at = (s: AnnotationSite): string => `${s.path}:${s.line}`;
const quote = (title: string): string => JSON.stringify(title);

function finding(severity: Finding['severity'], code: FindingCode, message: string, where: { id?: string; path?: string; line?: number } = {}): Finding {
  const f: { severity: Finding['severity']; code: string; message: string; id?: string; path?: string; line?: number } = { severity, code, message };
  if (where.id !== undefined) f.id = where.id;
  if (where.path !== undefined) f.path = where.path;
  if (where.line !== undefined) f.line = where.line;
  return f;
}

/** REQ-TRACE-100: `<path>.md (<identifier>): <message>` for a finding about a requirement. */
function located(r: RequirementRecord, message: string): string {
  return `${r.sourcePath} (${r.id}): ${message}`;
}

function traceRemedy(r: RequirementRecord): string {
  const sym = `${ENUM_NAME}.${symbolName(r.id)}`;
  return `add \`@${TRACE_ANNOTATION}(${sym})\` above the implementing element (or the plain call \`${TRACE_ANNOTATION}(${sym});\`), importing \`${TRACE_ANNOTATION}\` from '${DECLARATIONS_MODULE}' and \`${ENUM_NAME}\` from the generated artifact`;
}

function coverageRemedy(r: RequirementRecord): string {
  const sym = `${ENUM_NAME}.${symbolName(r.id)}`;
  return `add \`@${COVERS_ANNOTATION}(${sym})\` above the covering test (or the plain call \`${COVERS_ANNOTATION}(${sym});\`), importing \`${COVERS_ANNOTATION}\` from '${DECLARATIONS_MODULE}' and \`${ENUM_NAME}\` from the generated artifact`;
}

export function verify(input: VerifyInput): VerifyOutput {
  const { parse, sweep, layout } = input;
  const prefix = layout.idPrefix;
  const records = parse.records;
  const fresh = renderArtifact(records, layout.requirementsDir, parse.fingerprint);
  const artifactUpToDate = isArtifactUpToDate(input.artifact, fresh);
  const empty: CurrentDebt = { debt: new Map(), orphanModules: new Set(), orphanTests: new Set(), orphanTestsDecidable: false };
  const statisticsOf = (traced: number, covered: number, debt: VerificationReport['statistics']['debt']): VerificationReport['statistics'] => ({ total: records.length, approved: records.filter((r) => r.status === 'approved').length, traced, testCovered: covered, debt });
  // REQ-TRACE-092: any parse error short-circuits to the parse errors alone.
  if (parse.errors.length > 0) {
    const findings = parse.errors.map((e) => finding('error', 'parse-error', e.message, { path: e.path, ...(e.line === undefined ? {} : { line: e.line }) }));
    // Everything downstream depends on a clean parse, so the statistics report nothing rather than a partial count.
    return { generation: input.generation, findings, statistics: { total: 0, approved: 0, traced: 0, testCovered: 0, debt: { trace: 0, test: 0, orphan: 0, orphanTest: 0 } }, evidence: {}, parseErrorsOnly: true, current: empty, artifactUpToDate, freshArtifact: fresh, requiresParse: [] };
  }
  const findings: Finding[] = [];
  const requiresParse: { check: 'orphan-module' | 'orphan-test'; path: string }[] = [];
  const index = indexSweep(sweep, layout);
  const details = detailsOf(sweep);
  const map = byNumber(parse);
  const debt = parseDebtBaseline(input.debtBaseline, prefix, layout.baselinePath);
  const orphanModules = parseOrphanModuleBaseline(input.orphanModuleBaseline, layout.orphanBaselinePath);
  const orphanTests = parseOrphanTestBaseline(input.orphanTestBaseline, layout.testOrphanBaselinePath);

  // (0) REQ-TRACE-503: a store that declares nothing is said, never passed over.
  if (parse.empty !== undefined) {
    const next = parse.empty === 'no-directory' ? `create the directory and write the first requirement document in it (or point the layout's requirements_dir at the store)`
      : parse.empty === 'no-documents' ? 'no document under it carries frontmatter; write the first requirement document against the template'
        : 'documents there carry frontmatter, but none declares a req-id, so they are of a kind this parser does not read; add req-id to them or point requirements_dir at the store of this kind';
    findings.push(finding('warning', 'empty-store', `${layout.requirementsDir}: the requirement store ${parse.empty === 'no-directory' ? 'directory is absent' : parse.empty === 'no-documents' ? 'holds no document carrying frontmatter' : 'holds documents carrying frontmatter of which none declares a requirement identifier'}; ${next}`, { path: layout.requirementsDir }));
  }
  // (1) REQ-TRACE-093: a stale or missing artifact is an error, naming the path and the action.
  if (!artifactUpToDate) findings.push(finding('error', 'artifact', `${layout.generatedPath}: the generated requirement-symbol artifact is ${input.artifact === null ? 'missing' : 'stale'}; regenerate it with ${REGENERATE_ACTION}`, { path: layout.generatedPath }));
  // (2) REQ-TRACE-117: malformed baseline lines, the three files in the fixed order.
  for (const b of [debt, orphanModules, orphanTests]) for (const m of b.malformed) findings.push(finding('error', 'baseline-malformed', m.message, { path: m.path, line: m.line }));
  // (3) REQ-TRACE-098: derived-from integrity, five rules.
  for (const r of records) {
    if (r.kind === 'technical' && r.derivedFrom.length === 0) findings.push(finding('error', 'derived-from', located(r, `${quote(r.title)} is type: technical but declares no derived-from; supply the origin identifying which requirement's implementation created the need for this additional code`), { id: r.id, path: r.sourcePath }));
    if (r.kind !== 'technical' && r.derivedFrom.length > 0) findings.push(finding('error', 'derived-from', located(r, `${quote(r.title)} declares derived-from but is not type: technical; set type: technical or remove the link`), { id: r.id, path: r.sourcePath }));
    for (const origin of r.derivedFrom) {
      if (origin === r.id) { findings.push(finding('error', 'derived-from', located(r, `${quote(r.title)} lists itself as its own origin; point derived-from at the requirement whose implementation created the need`), { id: r.id, path: r.sourcePath })); continue; }
      const o = map.get(Number(origin.slice(prefix.length + 1)));
      if (o === undefined) findings.push(finding('error', 'derived-from', located(r, `${quote(r.title)} derives from ${origin}, which does not exist; point derived-from at an existing requirement`), { id: r.id, path: r.sourcePath }));
      else if (o.status === 'deprecated') findings.push(finding('warning', 'derived-from', located(r, `${quote(r.title)} derives from ${origin}, which is deprecated; re-point derived-from at the superseding requirement`), { id: r.id, path: r.sourcePath }));
    }
  }
  // (4) REQ-TRACE-094: references to numbers no requirement declares — once per occurrence, over sorted numbers.
  for (const n of [...index.references.keys()].sort((a, b) => a - b)) {
    if (map.has(n)) continue;
    for (const s of index.references.get(n)!) findings.push(finding('error', 'missing-requirement', `${at(s)}: references ${symbolName(identifierOf(prefix, n))} but no requirement ${identifierOf(prefix, n)} exists; remove the reference or restore the requirement document`, { id: identifierOf(prefix, n), path: s.path, line: s.line }));
  }
  // (5) REQ-TRACE-095: deprecated requirements still referenced — a warning at any lifecycle, sites capped at 5.
  for (const r of records) {
    if (r.status !== 'deprecated') continue;
    const sites = index.references.get(r.number) ?? [];
    if (sites.length === 0) continue;
    const shown = sites.slice(0, 5).map(at).join(', ');
    findings.push(finding('warning', 'deprecated-reference', located(r, `${quote(r.title)} is deprecated and is still referenced at ${shown}${sites.length > 5 ? ` (+${sites.length - 5} more)` : ''}; remove the references or re-point them at the superseding requirement (source: ${r.sourcePath})`), { id: r.id, path: r.sourcePath }));
  }
  // (6) and (7) REQ-TRACE-096/097/122: approved requirements only; baseline suppression per flag, every suppressed item counted.
  const currentDebt = new Map<number, Set<DebtFlag>>();
  let traced = 0;
  let covered = 0;
  const debtCounts = { trace: 0, test: 0 };
  const missingTrace: Finding[] = [];
  const missingCoverage: Finding[] = [];
  for (const r of records) {
    const hasTrace = (index.implementationTraces.get(r.number)?.length ?? 0) > 0;
    const hasCoverage = (index.coverage.get(r.number)?.length ?? 0) > 0;
    if (hasTrace) traced += 1;
    if (hasCoverage) covered += 1;
    if (r.status !== 'approved') continue;
    const unmet = new Set<DebtFlag>();
    if (r.traceRequired && !hasTrace) {
      unmet.add('trace');
      if (suppressed(debt.entries, r.number, 'trace')) debtCounts.trace += 1;
      else missingTrace.push(finding('error', 'missing-trace', located(r, `${quote(r.title)} is approved with trace: required, and no implementation reference exists; ${traceRemedy(r)}`), { id: r.id, path: r.sourcePath }));
    }
    if (r.testRequired && !hasCoverage) {
      unmet.add('test');
      if (suppressed(debt.entries, r.number, 'test')) debtCounts.test += 1;
      else missingCoverage.push(finding('error', 'missing-coverage', located(r, `${quote(r.title)} is approved with test: required, and no covering test reference exists; ${coverageRemedy(r)}`), { id: r.id, path: r.sourcePath }));
    }
    if (unmet.size > 0) currentDebt.set(r.number, unmet);
  }
  findings.push(...missingTrace, ...missingCoverage);
  // (8) REQ-TRACE-107/115/127: stale baseline entries — warnings only; a stale baseline never fails the build.
  for (const [n, flags] of debt.entries) {
    const r = map.get(n);
    const id = identifierOf(prefix, n);
    if (r === undefined || r.status !== 'approved') {
      findings.push(finding('warning', 'baseline-stale', `${layout.baselinePath}: entry ${id} no longer names an approved requirement (${r === undefined ? 'deleted' : `now ${r.status}`}); prune it with ${PRUNE_ACTION}`, { id, path: layout.baselinePath }));
      continue;
    }
    const satisfied = [...flags].filter((f) => (f === 'trace' ? !r.traceRequired || (index.implementationTraces.get(n)?.length ?? 0) > 0 : !r.testRequired || (index.coverage.get(n)?.length ?? 0) > 0)).sort();
    if (satisfied.length > 0) findings.push(finding('warning', 'baseline-stale', `${layout.baselinePath}: entry ${id}'s ${satisfied.join(' ')} debt is now satisfied; prune it with ${PRUNE_ACTION}`, { id, path: layout.baselinePath }));
  }
  // The orphan sets are needed both here (stale entries) and in (10)/(11); computed once.
  const modules = [...sweep.modules].sort();
  const marked = new Set(details?.markedModules ?? []);
  const exempt = new Set(details?.exemptModules ?? []);
  const conventionOf = details?.conventionOf ?? {};
  const candidates = modules.filter((m) => !index.tracedFiles.has(m) && !marked.has(m) && !exempt.has(m));
  const currentOrphanModules = new Set(candidates);
  for (const entry of [...orphanModules.entries].sort()) {
    if (currentOrphanModules.has(entry)) continue;
    const why = index.tracedFiles.has(entry) ? 'now traced' : marked.has(entry) || exempt.has(entry) ? 'now exempt' : 'removed';
    findings.push(finding('warning', 'baseline-stale', `${layout.orphanBaselinePath}: entry ${entry} is ${why}; prune it with ${PRUNE_ACTION}`, { path: layout.orphanBaselinePath }));
  }
  const undecided = new Set(details?.undecidedTestFiles ?? []);
  const excused = new Set(details?.excusedTestFiles ?? []);
  const markerLines = details?.markerLines ?? {};
  const coverageLinesByFile = new Map<string, number[]>();
  for (const sites of index.coverage.values()) for (const s of sites) { const l = coverageLinesByFile.get(s.path) ?? []; l.push(s.line); coverageLinesByFile.set(s.path, l); }
  const currentOrphanTests = new Set<string>();
  for (const t of details?.testFunctions ?? []) {
    if (excused.has(t.path)) continue;
    const inWindow = (line: number): boolean => line >= t.windowStart && line <= t.windowEnd;
    if ((coverageLinesByFile.get(t.path) ?? []).some(inWindow) || (markerLines[t.path] ?? []).some(inWindow)) continue;
    currentOrphanTests.add(t.node);
  }
  const orphanTestsDecidable = undecided.size === 0;
  for (const entry of [...orphanTests.entries].sort()) {
    if (currentOrphanTests.has(entry)) continue;
    const file = entry.slice(0, entry.indexOf('::'));
    if (undecided.has(file)) continue;
    findings.push(finding('warning', 'baseline-stale', `${layout.testOrphanBaselinePath}: entry ${entry} is now annotated, exempt or removed; prune it with ${PRUNE_ACTION}`, { path: layout.testOrphanBaselinePath }));
  }
  // (9) REQ-TRACE-071: unresolved legacy comment references — warnings naming file, 1-based line, the token as written.
  for (const s of index.unresolved) {
    const token = s.ids[0] ?? '';
    const alias = (parse as { details?: { legacyAliases?: Record<string, number | null> } }).details?.legacyAliases?.[token.toUpperCase()];
    findings.push(finding('warning', 'legacy-unresolved', `${at(s)}: ${JSON.stringify(token)} resolves to no requirement (${alias === null ? 'the legacy identifier is claimed by more than one requirement' : 'the legacy identifier is unknown'}); write the canonical identifier in its place`, { path: s.path, line: s.line }));
  }
  // (10) REQ-TRACE-102..107: orphan modules, per file, sorted; the built-in convention's rule 1 needs the parser.
  let orphanSuppressed = 0;
  for (const m of candidates) {
    const builtIn = (conventionOf[m] ?? 'typescript') === 'typescript';
    if (orphanModules.entries.has(m)) { orphanSuppressed += 1; continue; }
    if (builtIn) {
      requiresParse.push({ check: 'orphan-module', path: m });
      findings.push(finding('warning', 'requires-parse', `${m}: has no implementation trace and no ${JSON.stringify(layout.exemptMarker)} marker; whether it is a re-export-only module (REQ-TRACE-104 rule 1) needs a syntax tree this build does not yet carry, so it is reported as an orphan candidate rather than an orphan — trace it with \`${TRACE_ANNOTATION}(...)\`, author a technical requirement with an origin if none fits, or mark it ${JSON.stringify(layout.exemptMarker)} if it is intentionally trace-free`, { path: m }));
    } else {
      findings.push(finding('error', 'orphan-module', `${m}: has no implementation trace; trace it to the requirement it serves with the convention's annotation, author a technical requirement with an origin if none fits, or mark it ${JSON.stringify(layout.exemptMarker)} if it is intentionally trace-free`, { path: m }));
    }
  }
  // (11) REQ-TRACE-108..115: orphan tests; the built-in convention's collection needs the parser.
  let orphanTestSuppressed = 0;
  for (const node of [...currentOrphanTests].sort()) {
    if (orphanTests.entries.has(node)) { orphanTestSuppressed += 1; continue; }
    findings.push(finding('error', 'orphan-test', `${node}: no coverage annotation or comment reference is present; annotate the test with the requirement it covers, author a technical requirement with an origin if none fits, or mark it ${JSON.stringify(layout.exemptMarker)} within its window`, { path: node.slice(0, node.indexOf('::')) }));
  }
  if (undecided.size > 0) {
    requiresParse.push({ check: 'orphan-test', path: layout.testRoots.join(', ') });
    findings.push(finding('warning', 'requires-parse', `${layout.testRoots.join(', ')}: ${undecided.size} test file(s) under the built-in TypeScript convention were not checked for orphan tests; collecting test functions needs a syntax tree (REQ-TRACE-109/110) this build does not yet carry`, { path: layout.testRoots[0] ?? '' }));
  }
  // Evidence (the seam's `RequirementEvidence`): presence is what a static scan can assert (175), never execution.
  const evidence: Record<string, RequirementEvidence> = {};
  for (const r of records) {
    const sites = index.references.get(r.number) ?? [];
    const e: { implementationTrace?: 'satisfied'; coveringTest?: 'stale'; sites: AnnotationSite[] } = { sites };
    if ((index.implementationTraces.get(r.number)?.length ?? 0) > 0) e.implementationTrace = 'satisfied';
    if ((index.coverage.get(r.number)?.length ?? 0) > 0) e.coveringTest = 'stale';
    evidence[r.id] = e;
  }
  return {
    generation: input.generation, findings, statistics: statisticsOf(traced, covered, { trace: debtCounts.trace, test: debtCounts.test, orphan: orphanSuppressed, orphanTest: orphanTestSuppressed }), evidence,
    parseErrorsOnly: false, current: { debt: currentDebt, orphanModules: currentOrphanModules, orphanTests: currentOrphanTests, orphanTestsDecidable }, artifactUpToDate, freshArtifact: fresh, requiresParse,
  };
}

/** The check a finding belongs to, for REQ-TRACE-091 ordering assertions: `requires-parse` stands in the slot of the check it reports on. */
export function checkRank(f: Finding, requiresParse: readonly { readonly check: 'orphan-module' | 'orphan-test' }[], seenRequiresParse: { n: number }): number {
  if (f.code === 'requires-parse') { const r = requiresParse[seenRequiresParse.n]; seenRequiresParse.n += 1; return CHECK_ORDER.indexOf(r?.check ?? 'orphan-module'); }
  return CHECK_ORDER.indexOf(f.code as FindingCode);
}
