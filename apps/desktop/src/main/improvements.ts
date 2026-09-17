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
  readonly log: (message: string, level?: "info" | "warn") => void;
}

export interface ImprovementCoordinator {
  enqueue(job: ImprovementAnalysisJob): void;
  cancelWorkspace(workspaceRoot: string): void;
  shutdown(): void;
  pending(): number;
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

  const publish = (job: ImprovementAnalysisJob | null): void => {
    deps.activity({
      workspace_id: job?.workspace_id ?? active?.job.workspace_id ?? "",
      active: active !== null,
      queued: queue.length,
      source_session_id: active?.job.source_session_id ?? null,
      // REQ-LIBRARY-125 with PD-LIBRARY-002: the indicator says WHICH pass is running, so the two are told
      // apart while one FIFO orders both.
      pass: active?.job.pass ?? job?.pass ?? "post_run",
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
          deps.log(
            `improvements: the analyst could not start for ${label(job)}`,
            "warn",
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
          deps.log(
            `improvements: the artifact save failed for ${label(job)}`,
            "warn",
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
          deps.log(
            `improvements: canonical reread failed for ${analyzed.artifact.artifact_id}`,
            "warn",
          );
        return;
      }
      deps.stored(reread.value as ImprovementArtifactRecord);
    } catch (cause) {
      if (!running.cancelled && !closing)
        deps.log(
          `improvements: ${label(job)} failed: ${
            cause instanceof Error ? cause.message : String(cause)
          }`,
          "warn",
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
  } satisfies ImprovementCoordinator);
}
