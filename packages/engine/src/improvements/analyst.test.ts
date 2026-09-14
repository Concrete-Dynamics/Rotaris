import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ImprovementAnalysisJobSchema,
  ImprovementArtifactSchema,
  type ImprovementAnalysisJob,
} from "@rotaris/contracts";
import { asSessionId, FakeClock, mintWorkspaceId } from "@rotaris/kernel";
import {
  modelError,
  type AgentBackend,
  type TurnInput,
  type TurnReport,
} from "@rotaris/model";
import {
  forgetSpelling,
  openWorkspaceStore,
  storeDir,
  StoreDal,
} from "@rotaris/store";
import {
  analyzeImprovement,
  gateProposalKey,
  parseImprovementAnalysis,
} from "./analyst.js";
import {
  captureImprovementJob,
  IMPROVEMENT_EVIDENCE_BOUNDS,
  IMPROVEMENT_SKIP_REASONS,
  visiblyCut,
} from "./capture.js";

const MODEL = { providerId: "p", modelId: "m", dialect: "chat" as const };
const ok = (text: string): TurnReport => ({
  status: "succeeded",
  text,
  usage: { input: 1, output: 1 },
});

function job(
  overrides: Partial<ImprovementAnalysisJob> = {},
): ImprovementAnalysisJob {
  return ImprovementAnalysisJobSchema.parse({
    artifact_id: "impart_00000001",
    workspace_id: "workspace-1",
    workspace_root: "C:\\workspace",
    source_session_id: "session-1",
    generated_at: "2026-09-14T10:00:00.000Z",
    timeout_seconds: 1,
    collector_model: "medium",
    considered_session_ids: [],
    progress: { available: true, entries: [] },
    todo: { available: true, entries: [] },
    child_reports: { available: true, entries: [] },
    transcript: { available: true, entries: ["finished task"] },
    gate: { available: true, entries: [] },
    prior_artifacts_available: true,
    prior_artifacts: [],
    ...overrides,
  });
}

function backend(
  script: (
    input: TurnInput,
    count: number,
    signal: AbortSignal,
  ) => Promise<TurnReport> | TurnReport,
) {
  const inputs: TurnInput[] = [];
  const value: AgentBackend = {
    ownsTheLoop: false,
    async runTurn(input, _sink, signal) {
      inputs.push(input);
      return script(input, inputs.length, signal);
    },
  };
  return { value, inputs };
}

describe("REQ-LIBRARY-015..034 improvement analyst", () => {
  it("strips one fence, coerces a category, mints ids, backfills evidence, and stringifies notes", () => {
    const artifact = parseImprovementAnalysis(
      "```json\n" +
        JSON.stringify({
          proposals: [
            {
              category: "future_category",
              summary: "Keep this.",
              evidence: [{ kind: "transcript", text: "Observed." }],
              recommended_action: "Write it.",
            },
          ],
          notes: { reason: "bounded" },
        }) +
        "\n```",
      job({ transcript: { available: false, entries: [] } }),
      () => "imp_00000001",
    );
    expect(artifact.proposals[0]).toMatchObject({
      id: "imp_00000001",
      category: "workspace_note",
      status: "pending_review",
      risk: "low",
    });
    expect(artifact.proposals[0]?.evidence[0]?.source_session_id).toBe(
      "session-1",
    );
    expect(artifact.notes).toContain('{"reason":"bounded"}');
    expect(artifact.notes).toContain("transcript unavailable at capture");
  });

  it("stamps gate evidence once and suppresses the same pending gate key from prior history", () => {
    const section = { checks: [{ name: "types", command: "pnpm typecheck" }] };
    const key = gateProposalKey(section, {
      state: null,
      config_fingerprint: null,
      unrunnable_checks: [],
      uncovered_roles: [],
    });
    const prior = ImprovementArtifactSchema.parse({
      artifact_id: "impart_00000002",
      source_session_id: "session-0",
      generated_at: "2026-09-14T09:00:00.000Z",
      collector_model: "medium",
      considered_session_ids: [],
      notes: null,
      checkpoints: [],
      rolled_back_at: null,
      proposals: [
        {
          id: "imp_00000002",
          category: "verifier_gate_update",
          summary: "Gate",
          recommended_action: "Add gate",
          risk: "low",
          status: "pending_review",
          target_persona: null,
          proposed_verifier_section: section,
          created_at: "2026-09-14T09:00:00.000Z",
          evidence: [
            {
              kind: "transcript",
              text: "Observed",
              source_task_id: null,
              source_artifact_id: null,
              source_session_id: "session-0",
            },
            {
              kind: "verifier_gate_state",
              text: "gate state unknown at fingerprint unknown",
              source_task_id: null,
              source_artifact_id: null,
              source_session_id: "session-0",
              excerpt: key,
            },
          ],
        },
      ],
    });
    const artifact = parseImprovementAnalysis(
      JSON.stringify({
        proposals: [
          {
            category: "verifier_gate_update",
            summary: "Gate",
            evidence: [
              { kind: "transcript", text: "Observed" },
              { kind: "verifier_gate_state", text: "stale" },
            ],
            recommended_action: "Add gate",
            proposed_verifier_section: section,
          },
        ],
      }),
      job({ prior_artifacts: [prior], considered_session_ids: ["session-0"] }),
      () => "imp_00000003",
    );
    expect(artifact.proposals).toEqual([]);
  });

  it("retries one parse failure with the same evidence and returns the corrected artifact", async () => {
    const clock = new FakeClock();
    const { value, inputs } = backend((_input, count) =>
      ok(count === 1 ? "bad" : '{"proposals":[]}'),
    );
    const artifact = await analyzeImprovement(
      job(),
      {
        backend: value,
        model: MODEL,
        thinking: "unset",
        timers: clock.timers,
        credentialFor: () => async () => "key",
      },
      new AbortController().signal,
    );
    expect(artifact.proposals).toEqual([]);
    expect(inputs).toHaveLength(2);
    expect(inputs[1]?.messages[0]?.content[0]).toMatchObject({ kind: "text" });
  });

  it("finishes at the hard timeout even while the provider call remains outstanding", async () => {
    const clock = new FakeClock();
    const { value } = backend(async (_input, _count, signal) => {
      await new Promise<void>((resolve) =>
        signal.addEventListener("abort", () => resolve(), { once: true }),
      );
      return {
        status: "failed",
        text: "",
        usage: { input: 0, output: 0 },
        error: modelError({
          code: "aborted",
          headline: "aborted",
          transient: false,
        }),
      };
    });
    const pending = analyzeImprovement(
      job(),
      {
        backend: value,
        model: MODEL,
        thinking: "unset",
        timers: clock.timers,
        credentialFor: () => async () => "key",
      },
      new AbortController().signal,
    );
    clock.advance(1_000);
    await expect(pending).resolves.toMatchObject({
      proposals: [],
      notes: "collector timed out after 1 seconds",
    });
  });
});

describe("REQ-LIBRARY-032/165 improvement capture", () => {
  const paths: string[] = [];
  afterEach(() => {
    for (const path of paths.splice(0)) {
      forgetSpelling(path);
      rmSync(path, { recursive: true, force: true });
    }
  });

  it("keeps the fixed vocabulary and marks every text cut", () => {
    expect(IMPROVEMENT_SKIP_REASONS).toEqual([
      "user_cancelled",
      "agent_session_aborted",
      "application_shutdown",
    ]);
    expect(IMPROVEMENT_EVIDENCE_BOUNDS).toMatchObject({
      transcriptEntries: 200,
      transcriptEntryChars: 2_000,
      transcriptChars: 40_000,
      priorArtifacts: 5,
      priorArtifactChars: 4_000,
    });
    expect(visiblyCut("abcdef", 4)).toBe("abc…");
  });

  it("captures a persisted task run and skips exact ineligible run states", () => {
    const root = mkdtempSync(join(tmpdir(), "rotaris-improvement-capture-"));
    paths.push(root);
    const workspaceId = mintWorkspaceId("000000000000000000000000000000ab");
    const opened = openWorkspaceStore(root, workspaceId, "C:\\workspace");
    paths.push(storeDir(root, workspaceId));
    const db = opened.db;
    const dal = new StoreDal(db);
    dal.upsertSession({
      session_id: "session-1",
      workspace_root: "C:\\workspace",
      execution_status: "completed",
      created_at: "2026-09-14T09:00:00.000Z",
      updated_at: "2026-09-14T10:00:00.000Z",
      run_type: "task_run",
    });
    dal.updateSessionRun(asSessionId("session-1"), {
      stop_reason: "completed",
      progress: JSON.stringify([{ state: "done" }]),
      todo: JSON.stringify([{ task: "done" }]),
    });
    const prior = ImprovementArtifactSchema.parse({
      artifact_id: "impart_00000002",
      source_session_id: "session-0",
      source_run_type: "task_run",
      generated_at: "2026-09-14T09:00:00.000Z",
      collector_model: "medium",
      considered_session_ids: [],
      notes: "n".repeat(20_000),
      checkpoints: [],
      rolled_back_at: null,
      proposals: Array.from({ length: 12 }, (_, index) => ({
        id: `imp_0000000${index % 10}`,
        category: "workspace_note",
        summary: "s".repeat(10_000),
        recommended_action: "a".repeat(10_000),
        risk: "low",
        status: "pending_review",
        target_persona: null,
        proposed_verifier_section: null,
        created_at: "2026-09-14T09:00:00.000Z",
        evidence: [{
          kind: "transcript",
          text: "e".repeat(10_000),
          source_task_id: null,
          source_artifact_id: null,
          source_session_id: "session-0",
        }],
      })),
    });
    const captured = captureImprovementJob(dal, {
      workspaceId,
      workspaceRoot: "C:\\workspace",
      sessionId: "session-1",
      generatedAt: "2026-09-14T10:00:00.000Z",
      timeoutSeconds: 60,
      collectorModel: "medium",
      priorArtifacts: [prior],
    });
    expect(captured).toMatchObject({
      source_session_id: "session-1",
      timeout_seconds: 60,
      progress: { available: true },
      todo: { available: true },
    });
    expect(JSON.stringify(captured?.prior_artifacts[0]).length).toBeLessThanOrEqual(
      IMPROVEMENT_EVIDENCE_BOUNDS.priorArtifactChars,
    );

    dal.updateSessionRun(asSessionId("session-1"), {
      stop_reason: "user_cancelled",
    });
    expect(
      captureImprovementJob(dal, {
        workspaceId,
        workspaceRoot: "C:\\workspace",
        sessionId: "session-1",
        generatedAt: "2026-09-14T10:00:00.000Z",
        timeoutSeconds: 60,
        collectorModel: "medium",
        priorArtifacts: [],
      }),
    ).toBeNull();
    db.close();
  });
});
