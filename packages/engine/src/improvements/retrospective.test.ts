import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ImprovementArtifactSchema } from "@rotaris/contracts";
import { asSessionId, mintWorkspaceId } from "@rotaris/kernel";
import {
  forgetSpelling,
  openWorkspaceStore,
  storeDir,
  StoreDal,
} from "@rotaris/store";
import {
  captureRetrospectiveJob,
  RETROSPECTIVE_EVIDENCE_BOUNDS,
} from "./retrospective.js";
import { improvementPrompt, parseImprovementAnalysis } from "./analyst.js";

const paths: string[] = [];
afterEach(() => {
  for (const path of paths.splice(0)) {
    forgetSpelling(path);
    rmSync(path, { recursive: true, force: true });
  }
});

let counter = 0;
function workspace(): {
  dal: StoreDal;
  root: string;
  workspaceId: string;
  close: () => void;
} {
  counter += 1;
  const root = mkdtempSync(join(tmpdir(), "rotaris-retrospective-"));
  paths.push(root);
  const workspaceId = mintWorkspaceId(
    `0000000000000000000000000000${String(counter).padStart(4, "0")}`,
  );
  const opened = openWorkspaceStore(root, workspaceId, root);
  paths.push(storeDir(root, workspaceId));
  return {
    dal: new StoreDal(opened.db),
    root,
    workspaceId,
    close: () => opened.db.close(),
  };
}

function session(dal: StoreDal, id: string, updatedAt: string): void {
  dal.upsertSession({
    session_id: id,
    workspace_root: "C:\\workspace",
    execution_status: "completed",
    created_at: "2026-09-16T09:00:00.000Z",
    updated_at: updatedAt,
    run_type: "task_run",
  });
  dal.updateSessionRun(asSessionId(id), {
    stop_reason: "completed",
    iterations_completed: 3,
  });
}

const input = (workspaceId: string, root: string) => ({
  workspaceId,
  workspaceRoot: root,
  generatedAt: "2026-09-17T10:00:00.000Z",
  timeoutSeconds: 120,
  collectorModel: "medium",
  priorArtifacts: [],
});

describe("PD-LIBRARY-002: the retrospective capture", () => {
  it("captures nothing at all in a workspace whose record is empty", () => {
    const w = workspace();
    expect(captureRetrospectiveJob(w.dal, input(w.workspaceId, w.root))).toBeNull();
    w.close();
  });

  it("reads the newest sessions, the prompts, the persona memory and the instruction files, each entry naming its record", () => {
    const w = workspace();
    for (
      let index = 0;
      index < RETROSPECTIVE_EVIDENCE_BOUNDS.sessions + 5;
      index += 1
    ) {
      session(
        w.dal,
        `session-${String(index).padStart(2, "0")}`,
        `2026-09-16T${String(index % 24).padStart(2, "0")}:00:00.000Z`,
      );
    }
    w.dal.pushPrompt("history", "run the suite", "2026-09-16T10:00:00.000Z");
    w.dal.pushPrompt(
      "stash",
      "x".repeat(RETROSPECTIVE_EVIDENCE_BOUNDS.promptChars + 500),
      "2026-09-16T10:00:00.000Z",
    );
    mkdirSync(join(w.root, ".rotaris", "persona_memory"), { recursive: true });
    writeFileSync(
      join(w.root, ".rotaris", "persona_memory", "coding-agent.md"),
      "remember the build gate",
    );
    writeFileSync(
      join(w.root, "AGENTS.md"),
      "# House rules\nRun the suite before a claim.",
    );

    const job = captureRetrospectiveJob(w.dal, input(w.workspaceId, w.root))!;
    expect(job.pass).toBe("retrospective");
    expect(job.source_session_id).toBeNull();
    // The bound is the newest N, and `considered_session_ids` names exactly what was read.
    expect(job.considered_session_ids).toHaveLength(
      RETROSPECTIVE_EVIDENCE_BOUNDS.sessions,
    );
    expect(job.retrospective!.sessions.entries).toHaveLength(
      RETROSPECTIVE_EVIDENCE_BOUNDS.sessions,
    );
    for (const entry of job.retrospective!.sessions.entries) {
      expect(job.considered_session_ids).toContain(
        (JSON.parse(entry) as { session_id: string }).session_id,
      );
    }
    // Every cut is visible, and the prompt bound is per entry.
    const stashed = JSON.parse(
      job.retrospective!.prompts.entries.find((entry) =>
        entry.includes('"stash"'),
      )!,
    ) as { text: string };
    expect(stashed.text).toHaveLength(RETROSPECTIVE_EVIDENCE_BOUNDS.promptChars);
    expect(stashed.text.endsWith("…")).toBe(true);
    expect(JSON.parse(job.retrospective!.persona_memory.entries[0]!)).toMatchObject({
      persona: "coding-agent",
    });
    expect(JSON.parse(job.retrospective!.instructions.entries[0]!)).toMatchObject({
      file: "AGENTS.md",
    });
    // The sibling's run-scoped sources are present and empty: one job shape serves both passes.
    expect([
      job.progress.entries,
      job.transcript.entries,
      job.gate.entries,
      job.prior_artifacts,
    ]).toEqual([[], [], [], []]);
    w.close();
  });

  it("reads the same evidence twice over an unchanged workspace, and never through the mutating prompt reader", () => {
    const w = workspace();
    session(w.dal, "session-1", "2026-09-16T10:00:00.000Z");
    w.dal.pushPrompt("history", "first", "2026-09-16T10:00:00.000Z");
    const first = captureRetrospectiveJob(w.dal, input(w.workspaceId, w.root))!;
    const second = captureRetrospectiveJob(w.dal, input(w.workspaceId, w.root))!;
    expect(second.retrospective).toEqual(first.retrospective);
    expect(w.dal.readPrompts().history).toEqual(["first"]);
    w.close();
  });

  it("reports a proposal history that could not be read as unavailable rather than as empty", () => {
    const w = workspace();
    session(w.dal, "session-1", "2026-09-16T10:00:00.000Z");
    const job = captureRetrospectiveJob(w.dal, {
      ...input(w.workspaceId, w.root),
      priorArtifactsAvailable: false,
    })!;
    expect(job.retrospective!.proposals).toEqual({
      available: false,
      entries: [],
    });
    expect(job.prior_artifacts_available).toBe(false);
    w.close();
  });

  it("carries the prior proposals and their decisions, so the pass can see what was already raised", () => {
    const w = workspace();
    session(w.dal, "session-1", "2026-09-16T10:00:00.000Z");
    const prior = ImprovementArtifactSchema.parse({
      artifact_id: "impart_00000002",
      source_session_id: "session-1",
      source_run_type: "task_run",
      generated_at: "2026-09-16T11:00:00.000Z",
      collector_model: "medium",
      considered_session_ids: [],
      notes: null,
      checkpoints: [],
      rolled_back_at: null,
      proposals: [
        {
          id: "imp_00000001",
          category: "agents_md_update",
          summary: "Name the build gate",
          evidence: [{ kind: "transcript", text: "the gate was skipped" }],
          recommended_action: "Add a line to AGENTS.md",
          created_at: "2026-09-16T11:00:00.000Z",
          status: "rejected",
        },
      ],
    });
    const job = captureRetrospectiveJob(w.dal, {
      ...input(w.workspaceId, w.root),
      priorArtifacts: [prior],
    })!;
    expect(
      JSON.parse(job.retrospective!.proposals.entries[0]!),
    ).toMatchObject({
      proposal_id: "imp_00000001",
      status: "rejected",
      artifact_id: "impart_00000002",
    });
    w.close();
  });
});

describe("PD-LIBRARY-002: the analyst over a retrospective job", () => {
  it("serialises the five sources, stamps source_kind, and attributes each evidence entry to a session it actually read", () => {
    const w = workspace();
    session(w.dal, "session-1", "2026-09-16T10:00:00.000Z");
    w.dal.pushPrompt("history", "run the suite", "2026-09-16T10:00:00.000Z");
    const job = captureRetrospectiveJob(w.dal, input(w.workspaceId, w.root))!;
    const prompt = improvementPrompt(job);
    expect(prompt).toContain("frozen workspace-wide evidence");
    expect(prompt).toContain("session_digests");
    expect(prompt).toContain("saved_prompts");

    const artifact = parseImprovementAnalysis(
      JSON.stringify({
        proposals: [
          {
            category: "agents_md_update",
            summary: "Name the build gate in AGENTS.md",
            recommended_action: "Add one line",
            evidence: [
              {
                kind: "session",
                text: "three runs skipped it",
                source_session_id: "session-1",
              },
              {
                kind: "session",
                text: "invented",
                source_session_id: "session-never-read",
              },
            ],
          },
        ],
      }),
      job,
      () => "imp_00000009",
    );

    expect(artifact.source_kind).toBe("retrospective");
    expect(artifact.source_session_id).toBeNull();
    expect(artifact.source_run_type).toBe("task_run");
    expect(artifact.considered_session_ids).toEqual(["session-1"]);
    expect(
      artifact.proposals[0]!.evidence.map((entry) => entry.source_session_id),
    ).toEqual(["session-1", null]);
    w.close();
  });

  it("names an unreadable retrospective source in the artifact's notes, and not the sibling's six", () => {
    const w = workspace();
    session(w.dal, "session-1", "2026-09-16T10:00:00.000Z");
    const job = captureRetrospectiveJob(w.dal, {
      ...input(w.workspaceId, w.root),
      priorArtifactsAvailable: false,
    })!;
    const artifact = parseImprovementAnalysis(
      JSON.stringify({ proposals: [] }),
      job,
      () => "imp_00000009",
    );
    expect(artifact.notes).toBe("prior proposals unavailable at capture");
    w.close();
  });
});
