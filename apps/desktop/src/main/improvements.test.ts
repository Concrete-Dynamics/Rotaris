import { describe, expect, it, vi } from "vitest";
import {
  ImprovementAnalysisJobSchema,
  ImprovementArtifactRecordSchema,
  ImprovementArtifactSchema,
  type ImprovementAnalysisJob,
  type ProcessReply,
} from "@rotaris/contracts";
import { createImprovementCoordinator } from "./improvements.js";

function job(
  id: string,
  session: string,
  workspace = "C:\\workspace",
): ImprovementAnalysisJob {
  return ImprovementAnalysisJobSchema.parse({
    artifact_id: id,
    workspace_id: `workspace-${session}`,
    workspace_root: workspace,
    source_session_id: session,
    generated_at: "2026-09-14T10:00:00.000Z",
    timeout_seconds: 60,
    collector_model: "medium",
    considered_session_ids: [],
    progress: { available: true, entries: [] },
    todo: { available: true, entries: [] },
    child_reports: { available: true, entries: [] },
    transcript: { available: true, entries: [] },
    gate: { available: true, entries: [] },
    prior_artifacts_available: true,
    prior_artifacts: [],
  });
}

function artifact(job: ImprovementAnalysisJob) {
  return ImprovementArtifactSchema.parse({
    artifact_id: job.artifact_id,
    source_session_id: job.source_session_id,
    source_run_type: "task_run",
    generated_at: job.generated_at,
    collector_model: job.collector_model,
    proposals: [],
    considered_session_ids: [],
    notes: null,
    checkpoints: [],
    rolled_back_at: null,
  });
}

describe("REQ-LIBRARY-024/035/125 improvement coordinator", () => {
  it("runs one FIFO job at a time and stores only after analysis", async () => {
    const first = job("impart_00000001", "session-1");
    const second = job("impart_00000002", "session-2");
    const waiting: ((reply: ProcessReply) => void)[] = [];
    const analyzed: string[] = [];
    const serviceCalls: string[] = [];
    const stored: string[] = [];
    const coordinator = createImprovementCoordinator({
      analyze: (request) => {
        if (request.kind !== "improvement.analyze")
          throw new Error("wrong request");
        analyzed.push(request.job.artifact_id);
        return new Promise((resolve) => waiting.push(resolve));
      },
      cancel: () => undefined,
      service: async (_root, request) => {
        if (request.kind !== "improvements.command")
          throw new Error("wrong request");
        serviceCalls.push(request.command.action);
        const selected =
          request.command.action === "get" &&
          request.command.artifact_id === second.artifact_id
            ? second
            : first;
        return {
          kind: "improvements.result",
          value: ImprovementArtifactRecordSchema.parse({
            artifact: artifact(selected),
            versions_due: 1,
            versions_pruned: 0,
            versions_never_recorded: 0,
          }),
          ...(request.command.action === "save-collected"
            ? { changed: true }
            : {}),
        };
      },
      activity: () => undefined,
      stored: (record) => stored.push(record.artifact.artifact_id),
      failed: () => undefined,
      log: () => undefined,
    });

    coordinator.enqueue(first);
    coordinator.enqueue(second);
    expect(analyzed).toEqual([first.artifact_id]);
    expect(coordinator.pending()).toBe(2);

    waiting.shift()!({
      kind: "improvement.analyzed",
      artifact: artifact(first),
    });
    await vi.waitFor(() =>
      expect(analyzed).toEqual([first.artifact_id, second.artifact_id]),
    );
    waiting.shift()!({
      kind: "improvement.analyzed",
      artifact: artifact(second),
    });
    await vi.waitFor(() =>
      expect(stored).toEqual([first.artifact_id, second.artifact_id]),
    );
    expect(serviceCalls).toEqual([
      "save-collected",
      "get",
      "save-collected",
      "get",
    ]);
    expect(coordinator.pending()).toBe(0);
  });

  it("drops queued workspace jobs when that workspace closes", async () => {
    const running = job("impart_00000001", "session-1", "C:\\one");
    const cancelled = job("impart_00000002", "session-2", "C:\\two");
    let release: ((reply: ProcessReply) => void) | undefined;
    const analyzed: string[] = [];
    const cancelledIds: string[] = [];
    const coordinator = createImprovementCoordinator({
      analyze: (request) => {
        if (request.kind !== "improvement.analyze")
          throw new Error("wrong request");
        analyzed.push(request.job.artifact_id);
        return new Promise((resolve) => {
          release = resolve;
        });
      },
      cancel: (artifactId) => cancelledIds.push(artifactId),
      service: async () => ({
        kind: "refused",
        code: "unused",
        headline: "unused",
      }),
      activity: () => undefined,
      stored: () => undefined,
      failed: () => undefined,
      log: () => undefined,
    });
    coordinator.enqueue(running);
    coordinator.enqueue(cancelled);
    coordinator.cancelWorkspace("C:\\two");
    release!({ kind: "refused", code: "cancelled", headline: "cancelled" });
    await vi.waitFor(() => expect(coordinator.pending()).toBe(0));
    expect(analyzed).toEqual([running.artifact_id]);
    expect(cancelledIds).toEqual([cancelled.artifact_id]);
  });
});

describe("REQ-LIBRARY-124/127 a worker failure is not silent", () => {
  /**
   * Every failure path answers the same way: the log line REQ-LIBRARY-035(b) records, AND the notice
   * REQ-LIBRARY-124 owes, carrying the answering process's own words as the reason. The last case is
   * the one the requirement exempts — a cancelled job publishes nothing at all.
   */
  const drive = async (
    analyse: () => Promise<ProcessReply>,
    serve: (action: string) => ProcessReply,
  ) => {
    const only = job("impart_00000001", "session-1");
    const failures: { id: string; reason: string }[] = [];
    const logged: string[] = [];
    const coordinator = createImprovementCoordinator({
      analyze: () => analyse(),
      cancel: () => undefined,
      service: async (_root, request) => {
        if (request.kind !== "improvements.command")
          throw new Error("wrong request");
        return serve(request.command.action);
      },
      activity: () => undefined,
      stored: () => undefined,
      failed: (failedJob, reason) =>
        failures.push({ id: failedJob.artifact_id, reason }),
      log: (message) => logged.push(message),
    });
    coordinator.enqueue(only);
    await vi.waitFor(() => expect(coordinator.pending()).toBe(0));
    return { failures, logged, only };
  };

  const saved = (id: string): ProcessReply => ({
    kind: "improvements.result",
    value: ImprovementArtifactRecordSchema.parse({
      artifact: artifact(job(id, "session-1")),
      versions_due: 1,
      versions_pruned: 0,
      versions_never_recorded: 0,
    }),
  });

  it("names the analyst's refusal when the pass cannot start", async () => {
    const { failures, logged } = await drive(
      async () => ({
        kind: "refused",
        code: "improvement.analyze",
        headline: "the collector model is not configured",
        detail: "medium_model is unset",
      }),
      () => ({ kind: "ack" }),
    );
    expect(failures).toEqual([
      {
        id: "impart_00000001",
        reason:
          "the analyst could not start — the collector model is not configured: medium_model is unset",
      },
    ]);
    // REQ-LIBRARY-124: the log entry stays IN ADDITION to the notice.
    expect(logged).toEqual([
      "improvements: the analyst could not start for session session-1",
    ]);
  });

  it("names the refusal when the artifact cannot be saved", async () => {
    const { failures } = await drive(
      async () => ({
        kind: "improvement.analyzed",
        artifact: artifact(job("impart_00000001", "session-1")),
      }),
      (action) =>
        action === "save-collected"
          ? { kind: "refused", code: "store", headline: "the store is locked" }
          : saved("impart_00000001"),
    );
    expect(failures).toEqual([
      {
        id: "impart_00000001",
        reason: "the artifact could not be saved — the store is locked",
      },
    ]);
  });

  it("names the refusal when the saved artifact cannot be re-read", async () => {
    const { failures } = await drive(
      async () => ({
        kind: "improvement.analyzed",
        artifact: artifact(job("impart_00000001", "session-1")),
      }),
      (action) =>
        action === "save-collected"
          ? saved("impart_00000001")
          : { kind: "refused", code: "store", headline: "the row is gone" },
    );
    expect(failures).toEqual([
      {
        id: "impart_00000001",
        reason: "the saved artifact could not be re-read — the row is gone",
      },
    ]);
  });

  it("carries a thrown cause's message as the reason", async () => {
    const { failures } = await drive(
      async () => {
        throw new Error("the run host went away");
      },
      () => ({ kind: "ack" }),
    );
    expect(failures).toEqual([
      { id: "impart_00000001", reason: "the run host went away" },
    ]);
  });

  it("publishes nothing for a cancelled job (REQ-LIBRARY-127)", async () => {
    const only = job("impart_00000001", "session-1");
    let release: ((reply: ProcessReply) => void) | undefined;
    const failures: string[] = [];
    const logged: string[] = [];
    const coordinator = createImprovementCoordinator({
      analyze: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
      cancel: () => undefined,
      service: async () => ({ kind: "ack" }),
      activity: () => undefined,
      stored: () => undefined,
      failed: (_job, reason) => failures.push(reason),
      log: (message) => logged.push(message),
    });
    coordinator.enqueue(only);
    coordinator.cancelWorkspace(only.workspace_root);
    release!({ kind: "refused", code: "cancelled", headline: "cancelled" });
    await vi.waitFor(() => expect(coordinator.pending()).toBe(0));
    expect(failures).toEqual([]);
    expect(logged).toEqual([]);
  });
});
