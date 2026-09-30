import type { ImprovementAnalysisJob, ImprovementArtifactRecord, ProcessReply } from '@rotaris/contracts';
import { captureImprovementJob, IMPROVEMENT_SKIP_REASONS, type CaptureImprovementInput } from '@rotaris/engine';
import type { StoreDal } from '@rotaris/store';

/** The part of the capture input this helper fills itself; the rest comes from the run that ended. */
export type CaptureAfterRunInput = Omit<CaptureImprovementInput, 'priorArtifactsAvailable' | 'priorArtifacts'>;

export interface CaptureAfterRunDeps {
  /** The run's result stop reason, as `run.result` reports it — the token REQ-ORCH-137's skip list is written in. */
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

/**
 * REQ-ORCH-137 / REQ-LIBRARY-032: the run host's post-run capture, run detached from the run's result.
 *
 * Its first form lived inline in `onRunResult`: it located the store, awaited the history from main, and then read the
 * store it had located — which a quit had closed in the meantime, so `StoreDal.getSession` threw `The database
 * connection is not open` into a closure nothing awaited, and Node printed an unhandled rejection as the application
 * exited (`fixed/an-improvement-capture-racing-the-quit-reads-a-closed-store-and-rejects-unhandled.md`). The outcome was
 * the one the specification names — no job — reached by a throw. Three things now keep it off that path:
 *
 * - a stop reason on REQ-ORCH-137's skip list yields no job before anything is asked or read: the run a quit ended is
 *   `application_shutdown`, so it never reaches the store at all;
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
