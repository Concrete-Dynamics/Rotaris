import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { asSessionId, mintWorkspaceId } from "@rotaris/kernel";
import {
  CURRENT_SCHEMA_VERSION,
  ImprovementDal,
  StoreDal,
  forgetSpelling,
  openStore,
  openWorkspaceStore,
  storeDir,
  storeFile,
} from "@rotaris/store";
import {
  createImprovementReader,
  createImprovementWriter,
  ImprovementConflictError,
} from "./handles.js";
import { importLegacyImprovements } from "./legacy.js";

let root: string;
let workspace: string;
const workspaceId = mintWorkspaceId("000000000000000000000000000000aa");

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "rotaris-improvements-"));
  workspace = mkdtempSync(join(tmpdir(), "rotaris-improvements-ws-"));
});
afterEach(() => {
  forgetSpelling(storeDir(root, workspaceId));
  rmSync(root, { recursive: true, force: true });
  rmSync(workspace, { recursive: true, force: true });
});

const evidence = [
  {
    kind: "other",
    text: "Repeated work was observed.",
    source_task_id: null,
    source_artifact_id: null,
    source_session_id: "session-1",
  },
];
function artifact(id = "impart_00000001", action = "Record the result once.") {
  return {
    artifact_id: id,
    source_session_id: "session-1",
    source_kind: "post_run" as const,
    source_run_type: "task_run" as const,
    generated_at: "2026-09-14T10:00:00.000Z",
    collector_model: "analyst",
    proposals: [
      {
        id: "imp_00000001",
        category: "workspace_note" as const,
        summary: "Keep the observation.",
        evidence,
        recommended_action: action,
        risk: "low" as const,
        status: "pending_review" as const,
        target_persona: null,
        proposed_verifier_section: null,
        created_at: "2026-09-14T10:00:00.000Z",
      },
    ],
    considered_session_ids: [],
    notes: null,
    checkpoints: [],
    rolled_back_at: null,
  };
}

function opened() {
  const resolved = openWorkspaceStore(root, workspaceId, workspace);
  const sessions = new StoreDal(resolved.db);
  sessions.upsertSession({
    session_id: "session-1",
    execution_status: "completed",
    workspace_root: workspace,
    created_at: "2026-09-14T09:00:00.000Z",
    updated_at: "2026-09-14T10:00:00.000Z",
  });
  return resolved;
}

describe("improvement store handles (ADR-0061)", () => {
  it("migrates v19, records the session association and survives reopen", () => {
    const resolved = opened();
    expect(CURRENT_SCHEMA_VERSION).toBe(30); // REQ-MONITOR-102 (R-067) appended v26; the explicit cancel's mark (OQ-103, R-067) v27; a child's attachments and inherited block (REQ-LIBRARY-098, R-067) v28; the plan cycle's root under way (REQ-MONITOR-102 with REQ-ORCH-153, R-067) v29; every plan cycle's root (REQ-MONITOR-044 with REQ-ORCH-153, R-067) v30
    const sessionDal = new StoreDal(resolved.db);
    sessionDal.upsertSession({
      session_id: "typed-run",
      execution_status: "idle",
      workspace_root: workspace,
      created_at: "2026-09-14T09:00:00.000Z",
      updated_at: "2026-09-14T09:00:00.000Z",
      run_type: "improvement_run",
    });
    sessionDal.upsertSession({
      session_id: "typed-run",
      execution_status: "running",
      workspace_root: workspace,
      created_at: "later",
      updated_at: "later",
      run_type: "task_run",
    });
    expect(sessionDal.getSession(asSessionId("typed-run"))?.run_type).toBe(
      "improvement_run",
    );
    const reader = createImprovementReader(resolved.db);
    const writer = createImprovementWriter(reader, resolved.db, {
      now: () => "2026-09-14T10:01:00.000Z",
    });
    const saved = writer.save(artifact(), "collected", {
      suppressDuplicates: true,
    });
    expect(saved.record).toMatchObject({
      versions_due: 1,
      versions_pruned: 0,
      versions_never_recorded: 0,
    });
    expect(reader.ids()).toEqual(["impart_00000001"]);
    expect(reader.history("impart_00000001").versions).toHaveLength(1);
    const session = sessionDal.getSession(asSessionId("session-1"))!;
    expect(JSON.parse(session.improvement_artifact_ids)).toEqual([
      "impart_00000001",
    ]);
    resolved.db.close();

    const reopened = openStore(storeFile(root, workspaceId), {
      mustExist: true,
    });
    expect(
      createImprovementReader(reopened).artifact("impart_00000001").artifact
        .proposals[0]?.summary,
    ).toBe("Keep the observation.");
    reopened.close();
  });

  it("records review, edit and delete as distinct immutable states", () => {
    const resolved = opened();
    let tick = 1;
    const reader = createImprovementReader(resolved.db);
    const writer = createImprovementWriter(reader, resolved.db, {
      now: () => `2026-09-14T10:0${tick++}:00.000Z`,
    });
    writer.save(artifact());
    writer.review("impart_00000001", "imp_00000001", "approved");
    writer.edit("impart_00000001", "imp_00000001", {
      summary: "Edited summary.",
      recommended_action: "Edited action.",
    });
    writer.review("impart_00000001", "imp_00000001", "rejected");
    expect(
      reader
        .history("impart_00000001")
        .versions.map((version) => version.cause),
    ).toEqual(["status_change", "edit", "status_change", "collected"]);
    writer.deleteProposal("impart_00000001", "imp_00000001");
    expect(reader.artifact("impart_00000001").artifact.proposals).toEqual([]);
    expect(reader.history("impart_00000001").versions[0]?.cause).toBe("delete");
    resolved.db.close();
  });

  it("suppresses open cross-artifact duplicates and names the covering artifact", () => {
    const resolved = opened();
    const reader = createImprovementReader(resolved.db);
    const writer = createImprovementWriter(reader, resolved.db, {
      now: () => "2026-09-14T10:01:00.000Z",
    });
    writer.save(artifact("impart_00000001"), "collected", {
      suppressDuplicates: true,
    });
    const result = writer.save(artifact("impart_00000002"), "collected", {
      suppressDuplicates: true,
    });
    expect(result.record.artifact.proposals).toEqual([]);
    expect(result.record.artifact.notes).toBe(
      "Suppressed duplicate proposals already covered by: impart_00000001.",
    );
    resolved.db.close();
  });

  it("keeps an artifact mutation when its best-effort version write fails", () => {
    const resolved = opened();
    const warnings: string[] = [];
    const reader = createImprovementReader(resolved.db);
    const writer = createImprovementWriter(reader, resolved.db, {
      now: () => "2026-09-14T10:01:00.000Z",
      beforeVersionWrite: () => {
        throw new Error("version unavailable");
      },
      logger: { warn: (message) => warnings.push(message) },
    });
    const result = writer.save(artifact());
    expect(result.record).toMatchObject({
      versions_due: 1,
      versions_never_recorded: 1,
    });
    expect(reader.artifact("impart_00000001").artifact.artifact_id).toBe(
      "impart_00000001",
    );
    expect(warnings[0]).toContain("version unavailable");
    resolved.db.close();
  });

  it("uses a due counter as compare-and-set guard across connections", () => {
    const resolved = opened();
    const readerA = createImprovementReader(resolved.db);
    const writerA = createImprovementWriter(readerA, resolved.db, {
      now: () => "2026-09-14T10:01:00.000Z",
    });
    writerA.save(artifact());
    const second = openStore(storeFile(root, workspaceId), { mustExist: true });
    const readerB = createImprovementReader(second);
    const writerB = createImprovementWriter(readerB, second, {
      now: () => "2026-09-14T10:02:00.000Z",
    });
    const stale = readerB.artifact("impart_00000001").versions_due;
    writerA.review("impart_00000001", "imp_00000001", "approved", stale);
    expect(() =>
      writerB.review("impart_00000001", "imp_00000001", "deferred", stale),
    ).toThrow(ImprovementConflictError);
    second.close();
    resolved.db.close();
  });

  it("merges decisions for different proposals across store connections", () => {
    const resolved = opened();
    const firstArtifact = artifact();
    const secondProposal = {
      ...firstArtifact.proposals[0]!,
      id: "imp_00000002",
      summary: "Keep the second observation.",
      recommended_action: "Record the second result once.",
    };
    const readerA = createImprovementReader(resolved.db);
    const writerA = createImprovementWriter(readerA, resolved.db, {
      now: () => "2026-09-14T10:01:00.000Z",
    });
    writerA.save({
      ...firstArtifact,
      proposals: [...firstArtifact.proposals, secondProposal],
    });

    const second = openStore(storeFile(root, workspaceId), { mustExist: true });
    const readerB = createImprovementReader(second);
    const writerB = createImprovementWriter(readerB, second, {
      now: () => "2026-09-14T10:02:00.000Z",
    });
    writerA.review("impart_00000001", "imp_00000001", "approved");
    writerB.review("impart_00000001", "imp_00000002", "deferred");

    expect(
      readerA
        .artifact("impart_00000001")
        .artifact.proposals.map(({ id, status }) => ({ id, status })),
    ).toEqual([
      { id: "imp_00000001", status: "approved" },
      { id: "imp_00000002", status: "deferred" },
    ]);
    second.close();
    resolved.db.close();
  });

  it("skips a recorded version with an invalid cause", () => {
    const resolved = opened();
    const warnings: string[] = [];
    const reader = createImprovementReader(resolved.db, {
      warn: (message) => warnings.push(message),
    });
    const writer = createImprovementWriter(reader, resolved.db, {
      now: () => "2026-09-14T10:01:00.000Z",
    });
    writer.save(artifact());
    resolved.db
      .prepare(
        "UPDATE improvement_artifact_versions SET cause = 'drifted' WHERE artifact_id = ? AND version = 1",
      )
      .run("impart_00000001");

    expect(reader.history("impart_00000001")).toMatchObject({
      versions: [],
      skipped: [1],
    });
    expect(() => reader.version("impart_00000001", 1)).toThrow();
    expect(warnings[0]).toContain("recorded version 1 skipped");
    resolved.db.close();
  });

  it("retains version 1 plus the newest 24 and accounts for pruning", () => {
    const resolved = opened();
    const reader = createImprovementReader(resolved.db);
    const writer = createImprovementWriter(reader, resolved.db, {
      now: () => "2026-09-14T10:01:00.000Z",
    });
    writer.save(artifact());
    for (let i = 0; i < 30; i++)
      writer.review(
        "impart_00000001",
        "imp_00000001",
        i % 2 === 0 ? "approved" : "deferred",
      );
    const history = reader.history("impart_00000001");
    expect(history.versions).toHaveLength(25);
    expect(history.versions.at(-1)?.version).toBe(1);
    expect(history.versionsPruned).toBe(6);
    expect(history.versionsNeverRecorded).toBe(0);
    resolved.db.close();
  });

  it("synthesizes pre-history version one and seeds it on first overwrite", () => {
    const resolved = opened();
    const dal = new ImprovementDal(resolved.db);
    const initial = artifact();
    dal.write({
      artifact_id: initial.artifact_id,
      source_session_id: initial.source_session_id,
      source_kind: initial.source_kind,
      source_run_type: initial.source_run_type,
      generated_at: initial.generated_at,
      body: JSON.stringify(initial),
      versions_due: 0,
      versions_pruned: 0,
    });
    const reader = createImprovementReader(resolved.db);
    expect(reader.history(initial.artifact_id).versions[0]?.cause).toBe(
      "unknown",
    );
    const writer = createImprovementWriter(reader, resolved.db, {
      now: () => "2026-09-14T10:01:00.000Z",
    });
    writer.edit(initial.artifact_id, "imp_00000001", {
      summary: "New state.",
      recommended_action: "New action.",
    });
    expect(
      reader
        .history(initial.artifact_id)
        .versions.map((version) => version.cause),
    ).toEqual(["edit", "unknown"]);
    resolved.db.close();
  });

  it("imports valid legacy artifacts once and leaves every legacy file byte-identical", () => {
    const resolved = opened();
    const directory = join(
      workspace,
      ".rotaris",
      "sessions",
      "session-1",
      "improvement_artifacts",
    );
    mkdirSync(directory, { recursive: true });
    const validPath = join(directory, "one.json");
    const malformedPath = join(directory, "broken.json");
    const valid = JSON.stringify(artifact(), null, 2);
    writeFileSync(validPath, valid);
    writeFileSync(malformedPath, "{broken");
    const warnings: string[] = [];
    const logger = { warn: (message: string) => warnings.push(message) };
    const reader = createImprovementReader(resolved.db, logger);
    const writer = createImprovementWriter(reader, resolved.db, {
      now: () => "2026-09-14T10:01:00.000Z",
      logger,
    });
    expect(importLegacyImprovements(workspace, reader, writer, logger)).toEqual(
      { imported: 1, skipped: 1 },
    );
    expect(importLegacyImprovements(workspace, reader, writer, logger)).toEqual(
      { imported: 0, skipped: 1 },
    );
    expect(readFileSync(validPath, "utf8")).toBe(valid);
    expect(readFileSync(malformedPath, "utf8")).toBe("{broken");
    expect(warnings).toHaveLength(2);
    resolved.db.close();
  });
});
