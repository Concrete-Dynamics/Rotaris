import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  COLLECTOR_CRASHED_PREFIX,
  COLLECTOR_PARSE_FAILED_PREFIX,
  COLLECTOR_TIMED_OUT_PREFIX,
  IMPROVEMENT_CATEGORIES,
  IMPROVEMENT_RISKS,
  ImprovementAnalysisJobSchema,
  ImprovementArtifactSchema,
  VERIFIER_ROLES,
  VERIFIER_SEVERITIES,
  VerifierCheckSchema,
  VerifierSectionSchema,
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
  analystSystem,
  analyzeImprovement,
  gateProposalKey,
  parseImprovementAnalysis,
  VERIFIER_CHECK_FIELDS,
  VERIFIER_SECTION_FIELDS,
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

  /*
   * PD-LIBRARY-005 (OQ-285): main reads which kind of empty artifact a pass stored from the prefix its notes begin with, so
   * the analyst writes each of REQ-LIBRARY-022/023's notes with the prefix `@rotaris/contracts` exports — and the text after
   * it is the failure's own, which the warning's reason quotes.
   */
  it("writes each empty artifact's notes with the exported prefix (PD-LIBRARY-005, REQ-LIBRARY-022/023)", async () => {
    const deps = (value: AgentBackend, clock = new FakeClock()) => ({
      backend: value,
      model: MODEL,
      thinking: "unset" as const,
      timers: clock.timers,
      credentialFor: () => async () => "key",
    });
    const crashed = await analyzeImprovement(
      job(),
      deps(
        backend(() => ({
          status: "failed",
          text: "",
          usage: { input: 0, output: 0 },
          error: modelError({ code: "http", headline: "Unauthorized", status: 401, transient: false }),
        })).value,
      ),
      new AbortController().signal,
    );
    expect(crashed.notes).toBe(`${COLLECTOR_CRASHED_PREFIX}Unauthorized`);
    expect(crashed.notes?.startsWith("collector crashed: ")).toBe(true);

    const unreadable = await analyzeImprovement(
      job(),
      deps(backend(() => ok("not json at all")).value),
      new AbortController().signal,
    );
    expect(unreadable.proposals).toEqual([]);
    expect(unreadable.notes?.startsWith(COLLECTOR_PARSE_FAILED_PREFIX)).toBe(true);
    expect(unreadable.notes?.startsWith("collector parse failed: ")).toBe(true);
    expect(unreadable.notes!.length).toBeGreaterThan(COLLECTOR_PARSE_FAILED_PREFIX.length);

    const clock = new FakeClock();
    const pending = analyzeImprovement(
      job(),
      deps(
        backend(
          (_input, _count, signal) =>
            new Promise<TurnReport>((resolve) =>
              signal.addEventListener("abort", () =>
                resolve({ status: "failed", text: "", usage: { input: 0, output: 0 }, error: modelError({ code: "aborted", headline: "aborted", transient: false }) }),
              { once: true }),
            ),
        ).value,
        clock,
      ),
      new AbortController().signal,
    );
    clock.advance(1_000);
    expect((await pending).notes).toBe(`${COLLECTOR_TIMED_OUT_PREFIX}1 seconds`);
    expect(COLLECTOR_TIMED_OUT_PREFIX).toBe("collector timed out after ");
  });
});

/**
 * fin46 L1 (docs/defects/fixed/the-improvement-analyst-is-never-told-the-verifier-sections-shape.md): the live run at
 * b9e3005 lost its retrospective to a proposed_verifier_section holding invented keys, because neither system text
 * named that block's keys. Both schemas are strict, so the text must name every key they take, and only those.
 */
describe("REQ-LIBRARY-009/016/022 the analyst is told the proposal's shape", () => {
  const sectionKeys = Object.keys(VerifierSectionSchema.shape).sort();
  const checkKeys = Object.keys(VerifierCheckSchema.shape).sort();
  const retrospectiveJob = (): ImprovementAnalysisJob =>
    job({
      pass: "retrospective",
      source_session_id: null,
      retrospective: {
        sessions: { available: true, entries: [] },
        proposals: { available: true, entries: [] },
        prompts: { available: true, entries: [] },
        persona_memory: { available: true, entries: [] },
        instructions: { available: true, entries: [] },
      },
    });

  it.each([
    ["post_run", () => job()],
    ["retrospective", retrospectiveJob],
  ] as const)(
    "the %s system text names every verifier key, check key, category and risk the schemas take",
    (_pass, make) => {
      const system = analystSystem(make());
      for (const key of [...sectionKeys, ...checkKeys])
        expect(system).toContain(`${key} (`);
      for (const value of [
        ...VERIFIER_ROLES,
        ...VERIFIER_SEVERITIES,
        ...IMPROVEMENT_RISKS,
      ])
        expect(system).toContain(`"${value}"`);
      for (const category of IMPROVEMENT_CATEGORIES)
        expect(system).toContain(category);
      expect(system).toContain(
        "Any other key in proposed_verifier_section or in a check makes the whole reply invalid.",
      );
      const example = /Example: (\{.*\})\./.exec(system)?.[1];
      expect(example).toBeDefined();
      expect(VerifierSectionSchema.safeParse(JSON.parse(example!)).success).toBe(
        true,
      );
    },
  );

  it("describes exactly the keys the strict schemas take, so a key added there is named here", () => {
    expect(Object.keys(VERIFIER_SECTION_FIELDS).sort()).toEqual(sectionKeys);
    expect(Object.keys(VERIFIER_CHECK_FIELDS).sort()).toEqual(checkKeys);
  });

  it("sends the shape on both attempts, and still rejects the invented keys the live run met (REQ-LIBRARY-022)", async () => {
    const clock = new FakeClock();
    const invented = JSON.stringify({
      proposals: [
        {
          category: "verifier_gate_update",
          summary: "Run the suite before completion",
          recommended_action: "Add a test check",
          evidence: [{ kind: "session", text: "the suite was skipped" }],
          proposed_verifier_section: { when: "always", check: "npm test" },
        },
      ],
    });
    const { value, inputs } = backend(() => ok(invented));
    const artifact = await analyzeImprovement(
      retrospectiveJob(),
      {
        backend: value,
        model: MODEL,
        thinking: "unset",
        timers: clock.timers,
        credentialFor: () => async () => "key",
      },
      new AbortController().signal,
    );
    expect(inputs).toHaveLength(2);
    for (const input of inputs) {
      expect(input.systemPrompt).toContain("gate_completion (");
      expect(input.systemPrompt).toContain("failure_pattern (");
    }
    expect(artifact.proposals).toEqual([]);
    expect(artifact.notes).toMatch(/^collector parse failed: .*unrecognized_keys/s);
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

  /*
   * docs/defects/fixed/a-post-run-analysis-after-a-retrospective-is-never-captured.md (fin42) and OQ-271's ruling (R-072,
   * PD-LIBRARY-002 revision 3 (h)): a retrospective artifact carries no source session (revision 2 (a)), so the per-run
   * history drops it before REQ-LIBRARY-034's bound. Every artifact supplied then has the source session REQ-LIBRARY-025
   * records. Before fin42 the null reached `considered_session_ids` and the job's parse threw; before revision 3 the
   * retrospective was kept in the history with no session recorded for it.
   */
  const captureFixture = (hex: string) => {
    const root = mkdtempSync(join(tmpdir(), "rotaris-improvement-capture-"));
    paths.push(root);
    const workspaceId = mintWorkspaceId(hex);
    const opened = openWorkspaceStore(root, workspaceId, "C:\\workspace");
    paths.push(storeDir(root, workspaceId));
    const db = opened.db;
    const dal = new StoreDal(db);
    dal.upsertSession({ session_id: "session-9", workspace_root: "C:\\workspace", execution_status: "completed", created_at: "2026-10-13T09:00:00.000Z", updated_at: "2026-10-13T10:00:00.000Z", run_type: "task_run" });
    dal.updateSessionRun(asSessionId("session-9"), { stop_reason: "completed" });
    const artifact = (id: string, source: string | null, considered: string[]) => ImprovementArtifactSchema.parse({
      artifact_id: id, source_session_id: source, source_kind: source === null ? "retrospective" : "post_run", source_run_type: "task_run",
      generated_at: "2026-10-13T08:00:00.000Z", collector_model: "medium", considered_session_ids: considered, notes: null,
      checkpoints: [], rolled_back_at: null, proposals: [],
    });
    const capture = (priorArtifacts: ReturnType<typeof artifact>[]) => captureImprovementJob(dal, {
      workspaceId, workspaceRoot: "C:\\workspace", sessionId: "session-9", generatedAt: "2026-10-13T10:00:00.000Z",
      timeoutSeconds: 60, collectorModel: "medium", priorArtifacts,
    });
    return { db, artifact, capture };
  };

  it("keeps a retrospective artifact out of a later run's prior-artifact history (REQ-LIBRARY-034, PD-LIBRARY-002 rev 3 (h))", () => {
    const { db, artifact, capture } = captureFixture("000000000000000000000000000000ac");
    const retrospective = artifact("impart_0000000r", null, ["session-0", "session-1"]);
    const postRun = artifact("impart_0000000p", "session-1", []);
    const captured = capture([retrospective, postRun]);
    expect(captured).not.toBeNull();
    expect(captured?.prior_artifacts.map((a) => a.artifact_id)).toEqual(["impart_0000000p"]);
    expect(captured?.considered_session_ids).toEqual(["session-1"]);
    db.close();
  });

  it("drops the retrospective before the five-artifact bound, so five post-run artifacts behind a newer retrospective are all supplied (REQ-LIBRARY-034, PD-LIBRARY-002 rev 3 (h))", () => {
    const { db, artifact, capture } = captureFixture("000000000000000000000000000000ad");
    const retrospective = artifact("impart_0000000r", null, ["session-1"]);
    const postRuns = [1, 2, 3, 4, 5].map((n) => artifact(`impart_000000p${n}`, `session-${n}`, []));
    const captured = capture([retrospective, ...postRuns]);
    expect(IMPROVEMENT_EVIDENCE_BOUNDS.priorArtifacts).toBe(5);
    expect(captured?.prior_artifacts.map((a) => a.artifact_id)).toEqual(postRuns.map((a) => a.artifact_id));
    expect(captured?.considered_session_ids).toEqual(["session-1", "session-2", "session-3", "session-4", "session-5"]);
    db.close();
  });
});

