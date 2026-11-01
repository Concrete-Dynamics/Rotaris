import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { err, millis, ok, toIsoUtc, type Clocks, type Failure, type Result, type Timers } from '@rotaris/kernel';
import { replaceDocument, type RetryLadder } from '@rotaris/platform';
import type { ChangeEntry, PassOptions, StoreParse, SweepResult, TraceabilityEngine, TraceabilityFailure, VerificationReport } from '@rotaris/contracts';
import type { JobExecutor } from './executor.js';
import type { ArtifactBytes, BaselinesValue, CheckValue, Job, JobOutcome, RegenerateValue } from './jobs.js';
import { loadLayout, type ResolvedLayout } from './layout.js';
import { discoverRoot } from './root.js';
import type { CompareOutput } from './compare.js';

/**
 * The engine's owner side — the seam `TraceabilityEngine` (contracts/src/requirements.ts), implemented here and
 * faked by AK's tests. ONE I/O owner (ADR-0040 #6): every read of the generated artifact, the three baselines and
 * the retired-identifier log is an open-read-close here, every replace is platform's stage-and-replace here, with
 * REQ-TRACE-061's ladder — five attempts, delays 0.05, 0.1, 0.2 and 0.4 s, never conditioned on attributing the
 * failure to another process — and no other execution context opens those paths. A job runs on the executor with
 * only the bytes.
 *
 * REQ-TRACE-512: every operation runs against the root discovered from the workspace (REQ-TRACE-048/049) and the
 * layout found there; at most one operation of a kind is in flight per workspace — a second is refused with
 * `busy`, never queued; a layout that does not read or validate is `configuration` with nothing performed; an
 * unanticipated failure is `failed` naming what failed. REQ-TRACE-502: no lock, lease or coordination file, and no
 * invocation waits for another — what is ordered is individual whole-file operations issued from this one place.
 */
export const TRACE_REPLACE_LADDER: RetryLadder = { delays: [millis(50), millis(100), millis(200), millis(400)] };

export interface ArtifactIo {
  /** Open-read-close; null when absent. */
  read(absolutePath: string): string | null;
  replace(absolutePath: string, text: string): Promise<Result<unknown, Failure>>;
}

export function fsArtifactIo(timers: Timers): ArtifactIo {
  return {
    read(path) {
      try { return readFileSync(path, 'utf8'); } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw e;
      }
    },
    replace: (path, text) => replaceDocument(path, text, { ladder: TRACE_REPLACE_LADDER, timers, createParent: true }),
  };
}

export type OperationName = 'parseStore' | 'sweep' | 'verify' | 'check' | 'regenerate' | 'updateBaselines' | 'compare';

export interface EngineDeps {
  readonly executor: JobExecutor;
  readonly io: ArtifactIo;
  readonly clocks: Clocks;
  readonly log?: (message: string) => void;
  readonly gitEnv?: Readonly<Record<string, string | undefined>>;
  readonly gitExecutable?: string;
}

export interface TraceabilityEngineHandle extends TraceabilityEngine {
  /** REQ-TRACE-226: false when nothing is in flight for that root and operation, true after signalling. */
  cancel(root: string, operation: OperationName): boolean;
  inFlight(root: string): readonly OperationName[];
  dispose(): void;
}

interface Prepared { readonly root: string; readonly layout: ResolvedLayout; readonly bytes: ArtifactBytes }

export function createTraceabilityEngine(deps: EngineDeps): TraceabilityEngineHandle {
  const inFlight = new Map<string, AbortController>();
  let generation = 0;
  const key = (root: string, op: OperationName): string => `${root}\0${op}`;

  const prepare = (start: string): Result<Prepared, TraceabilityFailure> => {
    const root = discoverRoot(start);
    const load = loadLayout(root);
    if (!load.ok) return err({ kind: 'configuration', path: load.path, cause: load.cause });
    const layout = load.layout;
    try {
      const read = (rel: string): string | null => deps.io.read(join(root, rel));
      return ok({ root, layout, bytes: { artifact: read(layout.generatedPath), debtBaseline: read(layout.baselinePath), orphanModuleBaseline: read(layout.orphanBaselinePath), orphanTestBaseline: read(layout.testOrphanBaselinePath), retiredLog: read(layout.tombstonePath) } });
    } catch (e) {
      return err({ kind: 'failed', what: 'reading the repository artifacts', cause: e instanceof Error ? e.message : String(e) });
    }
  };

  async function operate<T>(op: OperationName, start: string, options: PassOptions, build: (p: Prepared) => Job): Promise<Result<T, TraceabilityFailure>> {
    const prepared = prepare(start);
    if (!prepared.ok) return prepared;
    const k = key(prepared.value.root, op);
    if (inFlight.has(k)) return err({ kind: 'busy', operation: op });
    const controller = new AbortController();
    const forward = (): void => controller.abort();
    if (options.signal.aborted) controller.abort(); else options.signal.addEventListener('abort', forward, { once: true });
    inFlight.set(k, controller);
    try {
      const outcome: JobOutcome = await deps.executor.run(build(prepared.value), { signal: controller.signal, ...(options.progress ? { progress: options.progress } : {}), onHookError: (hook, e) => deps.log?.(`traceability: progress hook ${hook} raised and was stepped over: ${e instanceof Error ? e.message : String(e)}`) });
      if (!outcome.result.ok) return outcome.result;
      for (const w of outcome.writes) {
        // REQ-TRACE-222: a checkpoint between one artifact and the next; a replace under way is never interrupted.
        if (controller.signal.aborted) return err({ kind: 'cancelled' });
        const r = await deps.io.replace(join(prepared.value.root, w.path), w.text);
        if (!r.ok) return err({ kind: 'failed', what: `replacing ${w.path}`, cause: `${r.error.headline}${r.error.detail === undefined ? '' : `: ${r.error.detail}`}` });
      }
      return ok(outcome.result.value as T);
    } finally {
      options.signal.removeEventListener('abort', forward);
      inFlight.delete(k);
    }
  }

  const today = (): string => toIsoUtc(deps.clocks.wall.instant()).slice(0, 10);

  return {
    parseStore: (root, options) => operate<StoreParse>('parseStore', root, options, (p) => ({ op: 'parse', ...p })),
    sweep: (parse, options) => operate<SweepResult>('sweep', parse.root, options, (p) => ({ op: 'sweep', ...p, parse })),
    verify: (parse, sweep, options) => operate<VerificationReport>('verify', parse.root, options, (p) => ({ op: 'verify', ...p, parse, sweep, generation: ++generation })),
    check: (root, options) => operate<CheckValue>('check', root, options, (p) => ({ op: 'check', ...p, generation: ++generation })),
    regenerate: (root, options) => operate<RegenerateValue>('regenerate', root, options, (p) => ({ op: 'regenerate', ...p, today: today() })),
    updateBaselines: async (root, options) => {
      const r = await operate<BaselinesValue>('updateBaselines', root, options, (p) => ({ op: 'baselines', ...p, generation: ++generation }));
      return r.ok ? ok(r.value.written) : r;
    },
    compare: (root, base, options) => operate<{ entries: readonly ChangeEntry[]; drift: boolean; noBase: boolean; unpropagated: number } & CompareOutput>('compare', root, options, (p) => ({ op: 'compare', ...p, base: base ?? 'HEAD', ...(deps.gitEnv ? { gitEnv: deps.gitEnv } : {}), ...(deps.gitExecutable ? { gitExecutable: deps.gitExecutable } : {}) })),
    cancel(root, operation) {
      const c = inFlight.get(key(discoverRoot(root), operation));
      if (!c) return false;
      c.abort();
      return true;
    },
    inFlight(root) {
      const prefix = `${discoverRoot(root)}\0`;
      return [...inFlight.keys()].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length) as OperationName);
    },
    dispose() { deps.executor.dispose(); },
  };
}
