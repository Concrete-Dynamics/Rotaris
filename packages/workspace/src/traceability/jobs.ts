import { err, ok, type Clocks, type Result } from '@rotaris/kernel';
import type { StoreParse, SweepResult, TraceabilityFailure, VerificationReport } from '@rotaris/contracts';
import { isArtifactUpToDate, recoverEntries, renderArtifact } from './artifact.js';
import { parseDebtBaseline, parseOrphanModuleBaseline, parseOrphanTestBaseline, ratchetDebt, ratchetSet, renderDebtBaseline, renderOrphanModuleBaseline, renderOrphanTestBaseline } from './baselines.js';
import { CancelledError, type CancelToken } from './cancel.js';
import { compareAgainstBase, type CompareOutput } from './compare.js';
import type { ResolvedLayout } from './layout.js';
import type { ProgressHost } from './progress.js';
import { parseStore, type StoreParseOutput } from './store.js';
import { sweepRepository, type SweepOutput } from './sweep.js';
import { detectRetired, mergeTombstones, parseTombstones, renderTombstones } from './tombstones.js';
import { verify, type VerifyOutput } from './verify.js';

/**
 * A job is the unit the executor runs — in-thread under a test, or on a terminable worker thread in the product —
 * and it is pure with respect to the five repository artifacts: their bytes come IN (read by the owner), and any
 * replacement comes OUT as an ordered list of whole-file writes the owner performs (ADR-0040 #6). A job never opens
 * one of those five paths. It streams the requirement documents and the source files itself.
 */
export type OperationKind = 'parse' | 'sweep' | 'verify' | 'check' | 'regenerate' | 'baselines' | 'compare';

export interface ArtifactBytes {
  readonly artifact: string | null;
  readonly debtBaseline: string | null;
  readonly orphanModuleBaseline: string | null;
  readonly orphanTestBaseline: string | null;
  readonly retiredLog: string | null;
}

interface JobBase { readonly root: string; readonly layout: ResolvedLayout; readonly bytes: ArtifactBytes }
export type Job =
  | (JobBase & { readonly op: 'parse' })
  | (JobBase & { readonly op: 'sweep'; readonly parse: StoreParse })
  | (JobBase & { readonly op: 'verify'; readonly parse: StoreParse; readonly sweep: SweepResult; readonly generation: number })
  | (JobBase & { readonly op: 'check'; readonly generation: number })
  | (JobBase & { readonly op: 'regenerate'; readonly today: string })
  | (JobBase & { readonly op: 'baselines'; readonly generation: number })
  | (JobBase & { readonly op: 'compare'; readonly base: string; readonly gitEnv?: Readonly<Record<string, string | undefined>>; readonly gitExecutable?: string });

/** One whole-file replacement the owner performs, in order, after a successful job (REQ-TRACE-061's ladder). */
export interface JobWrite { readonly path: string; readonly text: string }

export interface JobOutcome<T = unknown> { readonly result: Result<T, TraceabilityFailure>; readonly writes: readonly JobWrite[] }

export interface JobContext {
  readonly clocks: Clocks;
  readonly token?: CancelToken;
  readonly progress?: ProgressHost;
}

export interface RegenerateValue { readonly artifactPath: string; readonly outcome: 'regenerated' | 'already up to date'; readonly count: number; readonly retired: readonly number[] }
export interface BaselinesValue { readonly written: readonly { readonly path: string; readonly entries: number }[]; readonly preserved: readonly string[] }
export interface CheckValue { readonly report: VerificationReport; readonly parseErrorsOnly: boolean }

const none: readonly JobWrite[] = [];

function parseOf(job: JobBase, ctx: JobContext): StoreParseOutput {
  return parseStore({ root: job.root, layout: job.layout, retiredLog: job.bytes.retiredLog, ...(ctx.token ? { token: ctx.token } : {}), ...(ctx.progress ? { progress: ctx.progress } : {}) });
}

function sweepOf(job: JobBase, parse: StoreParse, ctx: JobContext): SweepOutput {
  const aliases = (parse as Partial<StoreParseOutput>).details?.legacyAliases ?? {};
  return sweepRepository({ root: job.root, layout: job.layout, aliases, clock: ctx.clocks.monotonic, ...(ctx.token ? { token: ctx.token } : {}), ...(ctx.progress ? { progress: ctx.progress } : {}) });
}

function verifyOf(job: JobBase, parse: StoreParse, sweep: SweepResult, generation: number): VerifyOutput {
  return verify({ parse, sweep, layout: job.layout, artifact: job.bytes.artifact, debtBaseline: job.bytes.debtBaseline, orphanModuleBaseline: job.bytes.orphanModuleBaseline, orphanTestBaseline: job.bytes.orphanTestBaseline, generation });
}

async function run(job: Job, ctx: JobContext): Promise<JobOutcome> {
  switch (job.op) {
    case 'parse':
      return { result: ok(parseOf(job, ctx)), writes: none };
    case 'sweep':
      return { result: ok(sweepOf(job, job.parse, ctx)), writes: none };
    case 'verify':
      return { result: ok(verifyOf(job, job.parse, job.sweep, job.generation)), writes: none };
    case 'check': {
      const parse = parseOf(job, ctx);
      // REQ-TRACE-092/508: parse errors are presented alone; the sweep is not even made.
      if (parse.errors.length > 0) return { result: ok<CheckValue>({ report: verifyOf(job, parse, { sites: [], modules: [], tests: [], durationMs: 0 }, job.generation), parseErrorsOnly: true }), writes: none };
      const sweep = sweepOf(job, parse, ctx);
      return { result: ok<CheckValue>({ report: verifyOf(job, parse, sweep, job.generation), parseErrorsOnly: false }), writes: none };
    }
    case 'regenerate': {
      const parse = parseOf(job, ctx);
      // REQ-TRACE-063/509: parse errors abort — nothing written, the artifact left exactly as it stood.
      if (parse.errors.length > 0) return { result: err({ kind: 'parse', errors: parse.errors }), writes: none };
      const fresh = renderArtifact(parse.records, job.layout.requirementsDir, parse.fingerprint);
      // REQ-TRACE-132/138/139: deletion observed only here, by comparing the artifact about to be replaced with the store.
      const previous = recoverEntries(job.bytes.artifact);
      const tombstones = parseTombstones(job.bytes.retiredLog, job.layout.idPrefix);
      const retired = detectRetired(previous, new Set(parse.records.map((r) => r.number)), tombstones);
      const writes: JobWrite[] = [];
      // REQ-TRACE-133: the tombstone before the artifact, so a crash between the two leaves the identifier recorded.
      if (retired.length > 0) writes.push({ path: job.layout.tombstonePath, text: renderTombstones(mergeTombstones(tombstones, retired, job.today, job.layout.idPrefix), job.layout.idPrefix) });
      const upToDate = isArtifactUpToDate(job.bytes.artifact, fresh);
      if (!upToDate) writes.push({ path: job.layout.generatedPath, text: fresh });
      return { result: ok<RegenerateValue>({ artifactPath: job.layout.generatedPath, outcome: upToDate ? 'already up to date' : 'regenerated', count: parse.records.length, retired: retired.map((r) => r.number) }), writes };
    }
    case 'baselines': {
      const parse = parseOf(job, ctx);
      if (parse.errors.length > 0) return { result: err({ kind: 'parse', errors: parse.errors }), writes: none };
      const sweep = sweepOf(job, parse, ctx);
      const report = verifyOf(job, parse, sweep, job.generation);
      const prefix = job.layout.idPrefix;
      // REQ-TRACE-123/124/125: the three, in the fixed order; per-identifier intersection, then two set intersections; bootstrap when absent.
      const existingDebt = job.bytes.debtBaseline === null ? null : parseDebtBaseline(job.bytes.debtBaseline, prefix, job.layout.baselinePath).entries;
      const debt = ratchetDebt(existingDebt, report.current.debt);
      const existingOrphans = job.bytes.orphanModuleBaseline === null ? null : parseOrphanModuleBaseline(job.bytes.orphanModuleBaseline, job.layout.orphanBaselinePath).entries;
      const orphans = ratchetSet(existingOrphans, report.current.orphanModules);
      const writes: JobWrite[] = [
        { path: job.layout.baselinePath, text: renderDebtBaseline(debt, prefix) },
        { path: job.layout.orphanBaselinePath, text: renderOrphanModuleBaseline(orphans, job.layout.exemptMarker) },
      ];
      const written: { path: string; entries: number }[] = [{ path: job.layout.baselinePath, entries: debt.size }, { path: job.layout.orphanBaselinePath, entries: orphans.size }];
      const preserved: string[] = [];
      if (report.current.orphanTestsDecidable) {
        const existingTests = job.bytes.orphanTestBaseline === null ? null : parseOrphanTestBaseline(job.bytes.orphanTestBaseline, job.layout.testOrphanBaselinePath).entries;
        const tests = ratchetSet(existingTests, report.current.orphanTests);
        writes.push({ path: job.layout.testOrphanBaselinePath, text: renderOrphanTestBaseline(tests, job.layout.exemptMarker) });
        written.push({ path: job.layout.testOrphanBaselinePath, entries: tests.size });
      } else {
        // Part AJ2 (R11, decided): the orphan-test ratchet is written whenever every built-in test file was decided by
        // the syntax-tree parser — its first real write happened in the second execution. The preserving branch stays
        // for the one case still undecided, a build in which the compiler API cannot be loaded (parser.ts): a shrink-only
        // file written from an undecided set would record an empty baseline that could never regain the orphans a later
        // build finds, so there the file is PRESERVED and its existing count reported.
        const existing = parseOrphanTestBaseline(job.bytes.orphanTestBaseline, job.layout.testOrphanBaselinePath).entries;
        written.push({ path: job.layout.testOrphanBaselinePath, entries: existing.size });
        preserved.push(job.layout.testOrphanBaselinePath);
      }
      return { result: ok<BaselinesValue>({ written, preserved }), writes };
    }
    case 'compare': {
      const parse = parseOf(job, ctx);
      // REQ-TRACE-169: parse errors are returned before version control is touched.
      if (parse.errors.length > 0) return { result: err({ kind: 'parse', errors: parse.errors }), writes: none };
      const sweep = sweepOf(job, parse, ctx);
      const out: CompareOutput = await compareAgainstBase({ root: job.root, layout: job.layout, parse, sweep, base: job.base, clocks: ctx.clocks, ...(job.gitEnv ? { env: job.gitEnv } : {}), ...(job.gitExecutable ? { executable: job.gitExecutable } : {}) });
      return { result: ok(out), writes: none };
    }
  }
}

/** Execute one job. A cancellation checkpoint becomes `{kind:'cancelled'}`; anything unanticipated becomes `{kind:'failed'}` naming the operation (REQ-TRACE-512). */
export async function executeJob(job: Job, ctx: JobContext): Promise<JobOutcome> {
  try {
    return await run(job, ctx);
  } catch (e) {
    if (e instanceof CancelledError) return { result: err({ kind: 'cancelled' }), writes: none };
    return { result: err({ kind: 'failed', what: `the ${job.op} operation`, cause: e instanceof Error ? e.message : String(e) }), writes: none };
  }
}
