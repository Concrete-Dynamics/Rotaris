import type { ImprovementAnalysisJob, ImprovementArtifactRecord, ProcessReply } from '@rotaris/contracts';
import { captureImprovementJob, IMPROVEMENT_SKIP_REASONS, type CaptureImprovementInput } from '@rotaris/engine';
import type { StoreDal } from '@rotaris/store';

/** The part of the capture input this helper fills itself; the rest comes from the run that ended. */
export type CaptureAfterRunInput = Omit<CaptureImprovementInput, 'priorArtifactsAvailable' | 'priorArtifacts'>;

export interface CaptureAfterRunDeps {
  /**
   * The stop reason of the run's RESULT, as `run.result` reports it — REQ-ORCH-137's "the stop reason", in the tokens its
   * skip list is written in. It is not the record's: REQ-LIBRARY-032 compares the RECORDED stop reason, which
   * `captureImprovementJob` reads. The two agree except where recording failed (REQ-EVENTS-088), when the engine
   * reports `agent_session_aborted` and the record keeps what it last held. That case is OQ-142.
   */
  readonly stopReason: string;
  readonly input: CaptureAfterRunInput;
  /** The workspace's improvement history, asked of main (REQ-LIBRARY-034); a rejected ask reads as `null`. */
  readonly history: () => Promise<ProcessReply | null>;
  /**
   * The workspace store as it stands NOW — read after the history's await, never before it. A quit, a workspace close
   * or a restore closes the store while the ask is in flight; a closed store answers `null`.
   */
  readonly currentDal: () => StoreDal | null;
  readonly log: (message: string, level: 'info' | 'warn') => void;
  /** Seam for the test beside this file; the product always passes the engine's own capture. */
  readonly capture?: typeof captureImprovementJob;
}

/** A workspace store as the run host holds it: the handle a quit, a workspace close or a restore closes or drops. */
export interface HostStoreSlot {
  readonly db: { readonly open: boolean } | null;
  readonly dal: StoreDal | null;
}

/**
 * The `currentDal` `host.ts` hands `captureAfterRun`: the located slot's DAL only while the host still holds that SAME
 * slot for the workspace (`current`, read from its map at the moment of asking) and its handle is still open. A slot the
 * host dropped or replaced (a workspace close, a restore that reopened the store) and a handle the quit closed all
 * answer `null`.
 */
export function dalWhileOpen(current: HostStoreSlot | undefined, located: HostStoreSlot): StoreDal | null {
  return current === located && located.db !== null && located.db.open ? located.dal : null;
}

/**
 * REQ-ORCH-137 / REQ-LIBRARY-032: the run host's post-run capture, run detached from the run's result.
 *
 * Its first form lived inline in `onRunResult`: it located the store, awaited the history from main, and then read the
 * store it had located — which a quit had closed in the meantime, so `StoreDal.getSession` threw `The database
 * connection is not open` into a closure nothing awaited, and Node printed an unhandled rejection as the application
 * exited (`fixed/an-improvement-capture-racing-the-quit-reads-a-closed-store-and-rejects-unhandled.md`). The outcome was
 * the one the specification names — no job — reached by a throw. Three things now keep it off that path:
 *
 * - a stop reason on REQ-ORCH-137's skip list, read from the run's result, yields no job before anything is asked or
 *   read: the run a quit ended is `application_shutdown`, so it never reaches the store at all (the result and the
 *   record disagree only where recording failed, OQ-142);
 * - the store is looked up again after the await, and a store that is gone or closed is a run with no persisted record
 *   to draw the snapshot from — REQ-LIBRARY-032's last no-job condition, logged rather than thrown;
 * - any other throw from the capture is caught and logged as a warning, and yields no job: REQ-ORCH-137 says a failure of
 *   the pass is never an error, and an unhandled rejection is an error no one reads.
 *
 * It never rejects.
 */
export async function captureAfterRun(deps: CaptureAfterRunDeps): Promise<ImprovementAnalysisJob | null> {
  const { stopReason, input, log } = deps;
  if ((IMPROVEMENT_SKIP_REASONS as readonly string[]).includes(stopReason)) return null;
  const historyReply = await deps.history().catch((cause: unknown) => {
    log(`improvements: history capture failed for ${input.sessionId}: ${cause instanceof Error ? cause.message : String(cause)}`, 'warn');
    return null;
  });
  const dal = deps.currentDal();
  if (dal === null || !dal.db.open) {
    log(`improvements: no job for ${input.sessionId} — the workspace store closed before its record could be read (REQ-LIBRARY-032)`, 'info');
    return null;
  }
  const available = historyReply?.kind === 'improvements.result';
  const prior = available ? (historyReply.value as ImprovementArtifactRecord[]).map((record) => record.artifact) : [];
  try {
    return (deps.capture ?? captureImprovementJob)(dal, { ...input, priorArtifactsAvailable: available, priorArtifacts: prior });
  } catch (cause) {
    log(`improvements: capture failed for ${input.sessionId}, no job: ${cause instanceof Error ? cause.message : String(cause)}`, 'warn');
    return null;
  }
}
