import type {
  ImprovementActivity,
  ImprovementAnalysisJob,
  ImprovementArtifactRecord,
  ProcessReply,
  RunHostRequest,
  WorkspaceServiceRequest,
} from "@rotaris/contracts";
import { millis, type Millis } from "@rotaris/kernel";

export interface ImprovementCoordinatorDeps {
  readonly analyze: (
    request: RunHostRequest,
    bound: Millis,
  ) => Promise<ProcessReply>;
  readonly cancel: (artifactId: string) => void;
  readonly service: (
    workspaceRoot: string,
    request: WorkspaceServiceRequest,
    bound: Millis,
  ) => Promise<ProcessReply> | undefined;
  readonly activity: (activity: ImprovementActivity) => void;
  readonly stored: (record: ImprovementArtifactRecord) => void;
  /**
   * REQ-LIBRARY-124: a job that ended without an artifact for any reason other than cancellation. The
   * reason is the user's, not the log's — what the run host or the workspace service said, in its words.
   */
  readonly failed: (job: ImprovementAnalysisJob, reason: string) => void;
  readonly log: (message: string, level?: "info" | "warn") => void;
}

export interface ImprovementCoordinator {
  enqueue(job: ImprovementAnalysisJob): void;
  cancelWorkspace(workspaceRoot: string): void;
  shutdown(): void;
  pending(): number;
  /**
   * PD-LIBRARY-002 revision 2, clause (e) (OQ-236): whether a retrospective is queued or running for this workspace.
   * A post-run job never counts: the retrospective's gesture queues behind one rather than resting while it runs.
   */
  retrospectivePending(workspaceId: string): boolean;
}

/** REQ-LIBRARY-024/035/125/127: one application-wide FIFO, detached from every run. */
export function createImprovementCoordinator(
  deps: ImprovementCoordinatorDeps,
): ImprovementCoordinator {
  const queue: ImprovementAnalysisJob[] = [];
  let active: { job: ImprovementAnalysisJob; cancelled: boolean } | null = null;
  let closing = false;

  /** What a log line calls a job: a retrospective has no session to name (PD-LIBRARY-002). */
  const label = (job: ImprovementAnalysisJob): string =>
    job.pass === "retrospective"
      ? `the retrospective ${job.artifact_id}`
      : `session ${job.source_session_id}`;

  /** What a refusal is asked for: the answering process's own words, or the shape of the answer it gave. */
  const reasonOf = (reply: ProcessReply | undefined): string =>
    reply === undefined
      ? "the workspace service did not answer"
      : reply.kind === "refused"
        ? reply.detail === undefined
          ? reply.headline
          : `${reply.headline}: ${reply.detail}`
        : `the answer was '${reply.kind}'`;

  /**
   * REQ-LIBRARY-035(b) records a failure in the application log; REQ-LIBRARY-124 adds the notice the user
   * sees and says the log entry stays IN ADDITION to it. Both are written in one place so no failure path
   * can grow one without the other. Cancellation (REQ-LIBRARY-127) and shutdown never reach here.
   */
  const failed = (
    job: ImprovementAnalysisJob,
    logged: string,
    reason: string,
  ): void => {
    deps.log(`improvements: ${logged}`, "warn");
    deps.failed(job, reason);
  };

  /** PD-LIBRARY-002 revision 2 (e): a retrospective of this workspace waiting in the FIFO or being analysed. */
  const retrospectivePending = (workspaceId: string): boolean =>
    (active !== null &&
      !active.cancelled &&
      active.job.pass === "retrospective" &&
      active.job.workspace_id === workspaceId) ||
    queue.some(
      (queued) =>
        queued.pass === "retrospective" && queued.workspace_id === workspaceId,
    );

  const publish = (job: ImprovementAnalysisJob | null): void => {
    const workspaceId = job?.workspace_id ?? active?.job.workspace_id ?? "";
    deps.activity({
      workspace_id: workspaceId,
      active: active !== null,
      queued: queue.length,
      source_session_id: active?.job.source_session_id ?? null,
      // REQ-LIBRARY-125 with PD-LIBRARY-002: the indicator says WHICH pass is running, so the two are told
      // apart while one FIFO orders both.
      pass: active?.job.pass ?? job?.pass ?? "post_run",
      // PD-LIBRARY-002 revision 2 (e), for the workspace this publication names; main re-reads it per window
      // through `retrospectivePending`, since a window of another workspace is told about its own.
      retrospective_pending: workspaceId !== "" && retrospectivePending(workspaceId),
    });
  };

  const drain = async (): Promise<void> => {
    if (active !== null || closing) return;
    const job = queue.shift();
    if (job === undefined) {
      publish(null);
      return;
    }
    active = { job, cancelled: false };
    const running = active;
    publish(job);
    try {
      const analyzed = await deps.analyze(
        { kind: "improvement.analyze", job },
        millis((job.timeout_seconds + 5) * 1_000),
      );
      if (
        running.cancelled ||
        closing ||
        analyzed.kind !== "improvement.analyzed"
      ) {
        if (
          analyzed.kind !== "improvement.analyzed" &&
          !running.cancelled &&
          !closing
        ) {
          failed(
            job,
            `the analyst could not start for ${label(job)}`,
            `the analyst could not start — ${reasonOf(analyzed)}`,
          );
        }
        return;
      }
      const saved = await deps.service(
        job.workspace_root,
        {
          kind: "improvements.command",
          workspaceRoot: job.workspace_root,
          command: { action: "save-collected", artifact: analyzed.artifact },
        },
        millis(10_000),
      );
      if (
        running.cancelled ||
        closing ||
        saved?.kind !== "improvements.result"
      ) {
        if (!running.cancelled && !closing)
          failed(
            job,
            `the artifact save failed for ${label(job)}`,
            `the artifact could not be saved — ${reasonOf(saved)}`,
          );
        return;
      }
      const reread = await deps.service(
        job.workspace_root,
        {
          kind: "improvements.command",
          workspaceRoot: job.workspace_root,
          command: {
            action: "get",
            artifact_id: analyzed.artifact.artifact_id,
          },
        },
        millis(10_000),
      );
      if (
        running.cancelled ||
        closing ||
        reread?.kind !== "improvements.result"
      ) {
        if (!running.cancelled && !closing)
          failed(
            job,
            `canonical reread failed for ${analyzed.artifact.artifact_id}`,
            `the saved artifact could not be re-read — ${reasonOf(reread)}`,
          );
        return;
      }
      deps.stored(reread.value as ImprovementArtifactRecord);
    } catch (cause) {
      if (!running.cancelled && !closing)
        failed(
          job,
          `${label(job)} failed: ${
            cause instanceof Error ? cause.message : String(cause)
          }`,
          cause instanceof Error ? cause.message : String(cause),
        );
    } finally {
      active = null;
      publish(job);
      void drain();
    }
  };

  return Object.freeze({
    enqueue(job: ImprovementAnalysisJob) {
      if (closing) return;
      queue.push(job);
      publish(job);
      void drain();
    },
    cancelWorkspace(workspaceRoot: string) {
      for (let index = queue.length - 1; index >= 0; index -= 1) {
        if (queue[index]!.workspace_root === workspaceRoot) {
          deps.cancel(queue[index]!.artifact_id);
          queue.splice(index, 1);
        }
      }
      if (active?.job.workspace_root === workspaceRoot) {
        active.cancelled = true;
        deps.cancel(active.job.artifact_id);
      }
      publish(active?.job ?? null);
    },
    shutdown() {
      closing = true;
      for (const job of queue) deps.cancel(job.artifact_id);
      queue.splice(0);
      if (active !== null) {
        active.cancelled = true;
        deps.cancel(active.job.artifact_id);
      }
      publish(active?.job ?? null);
    },
    pending: () => queue.length + (active === null ? 0 : 1),
    retrospectivePending,
  } satisfies ImprovementCoordinator);
}
