import type { MonotonicClock } from '@rotaris/kernel';
import type { SweepResult } from '@rotaris/contracts';
import type { ResolvedLayout } from './layout.js';
import { parseStore } from './store.js';
import { sweepRepository } from './sweep.js';
import { indexSweep } from './verify.js';

/**
 * The read-only coverage query (REQ-TRACE-171 to REQ-TRACE-176): "what covers requirement X?" without running
 * verification. Its only inputs are the store and the configured roots; it consults no version control, opens no
 * connection and writes nothing. An unknown or uncovered requirement yields empty collections, never a raise.
 * Three entry points (173): one requirement, every requirement keyed by number, and a pure projection of an
 * already-computed sweep. The sweep is NOT reused across single-requirement calls — N calls cost N scans, a
 * documented cost. Sites obtained from a sweep are flagged `executed: false` (175): presence, never execution.
 */
export interface CoverageSite { readonly path: string; readonly line: number; readonly kind: 'implementation' | 'test' | 'covers'; readonly executed: false }
export interface RequirementCoverage {
  readonly number: number;
  readonly implementationSites: readonly CoverageSite[];
  readonly testSites: readonly CoverageSite[];
  readonly isTraced: boolean;
  readonly isTestCovered: boolean;
}

const EMPTY = (number: number): RequirementCoverage => ({ number, implementationSites: [], testSites: [], isTraced: false, isTestCovered: false });

/** REQ-TRACE-173's pure projection; REQ-TRACE-174's keys: declared numbers ∪ every number the sweep saw, ascending. */
export function coverageProjection(sweep: SweepResult, layout: ResolvedLayout, declared: readonly number[]): Map<number, RequirementCoverage> {
  const index = indexSweep(sweep, layout);
  const keys = new Set<number>([...declared, ...index.references.keys()]);
  const out = new Map<number, RequirementCoverage>();
  for (const n of [...keys].sort((a, b) => a - b)) {
    const impl = (index.implementationTraces.get(n) ?? []).map((s) => ({ path: s.path, line: s.line, kind: s.kind, executed: false as const }));
    const tests = (index.coverage.get(n) ?? []).map((s) => ({ path: s.path, line: s.line, kind: s.kind, executed: false as const }));
    out.set(n, { number: n, implementationSites: impl, testSites: tests, isTraced: impl.length > 0, isTestCovered: tests.length > 0 });
  }
  return out;
}

/** One requirement from an already-computed sweep: empty collections for one the sweep never saw (209). */
export function coverageOf(sweep: SweepResult, layout: ResolvedLayout, number: number): RequirementCoverage {
  return coverageProjection(sweep, layout, [number]).get(number) ?? EMPTY(number);
}

/** Every requirement, one full scan. `retiredLog` is the owner's read of the log, since the parse refuses reused identifiers (134). */
export function coverageMap(root: string, layout: ResolvedLayout, clock: MonotonicClock, retiredLog: string | null): Map<number, RequirementCoverage> {
  const parse = parseStore({ root, layout, retiredLog });
  const sweep = sweepRepository({ root, layout, aliases: parse.details.legacyAliases, clock });
  return coverageProjection(sweep, layout, parse.records.map((r) => r.number));
}

/** One requirement, one full scan — the documented N-scans cost of REQ-TRACE-173. */
export function coverageFor(root: string, layout: ResolvedLayout, clock: MonotonicClock, retiredLog: string | null, number: number): RequirementCoverage {
  return coverageMap(root, layout, clock, retiredLog).get(number) ?? EMPTY(number);
}
