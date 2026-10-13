import { randomBytes } from "node:crypto";
import {
  ImprovementAnalysisJobSchema,
  ImprovementArtifactSchema,
  type ImprovementAnalysisJob,
  type ImprovementArtifact,
  type ImprovementCapturedSource,
} from "@rotaris/contracts";
import { asSessionId } from "@rotaris/kernel";
import type { StoreDal } from "@rotaris/store";

export const IMPROVEMENT_SKIP_REASONS = [
  "user_cancelled",
  "agent_session_aborted",
  "application_shutdown",
] as const;

export const IMPROVEMENT_EVIDENCE_BOUNDS = Object.freeze({
  transcriptEntries: 200,
  transcriptEntryChars: 2_000,
  transcriptChars: 40_000,
  progressEntries: 100,
  todoItems: 200,
  childReports: 20,
  childReportChars: 4_000,
  childReportTotalChars: 60_000,
  gateChars: 8_000,
  priorArtifacts: 5,
  priorArtifactChars: 4_000,
});

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export function mintImprovementId(prefix: "imp_" | "impart_"): string {
  let value = randomBytes(6).readUIntBE(0, 6);
  let body = "";
  for (let index = 0; index < 8; index += 1) {
    body = BASE62[value % 62]! + body;
    value = Math.floor(value / 62);
  }
  return `${prefix}${body}`;
}

export function visiblyCut(text: string, cap: number): string {
  if (text.length <= cap) return text;
  return cap <= 1 ? "…".slice(0, cap) : `${text.slice(0, cap - 1)}…`;
}

/** The sibling pass uses the same packing, so it is shared rather than written twice (PD-LIBRARY-002). */
export function bounded(
  entries: readonly string[],
  itemCap: number,
  totalCap: number,
): string[] {
  const out: string[] = [];
  let used = 0;
  for (const entry of entries) {
    const item = visiblyCut(entry, itemCap);
    const separator = out.length === 0 ? 0 : 1;
    if (used + separator + item.length <= totalCap) {
      out.push(item);
      used += separator + item.length;
      continue;
    }
    const remaining = totalCap - used - separator;
    if (remaining > 0) out.push(visiblyCut(item, remaining));
    break;
  }
  return out;
}

function jsonEntries(
  raw: string | null,
  cap: number,
): ImprovementCapturedSource {
  if (raw === null) return { available: true, entries: [] };
  try {
    const value = JSON.parse(raw) as unknown;
    const entries = Array.isArray(value)
      ? value.slice(-cap).map((entry) => JSON.stringify(entry))
      : [JSON.stringify(value)];
    return { available: true, entries };
  } catch {
    return { available: false, entries: [] };
  }
}

function boundedPriorArtifact(
  artifact: ImprovementArtifact,
): ImprovementArtifact {
  const bounded = ImprovementArtifactSchema.parse({
    ...artifact,
    proposals: artifact.proposals.slice(0, 3).map((proposal) => ({
      ...proposal,
      summary: visiblyCut(proposal.summary, 300),
      recommended_action: visiblyCut(proposal.recommended_action, 300),
      evidence: proposal.evidence.slice(0, 2).map((entry) => ({
        ...entry,
        text: visiblyCut(entry.text, 300),
        ...(entry.excerpt === undefined
          ? {}
          : { excerpt: visiblyCut(entry.excerpt, 300) }),
      })),
      proposed_verifier_section:
        proposal.category === "verifier_gate_update"
          ? { bounded: true }
          : proposal.proposed_verifier_section,
    })),
    notes: artifact.notes === null ? null : visiblyCut(artifact.notes, 400),
    checkpoints: [],
  });
  if (
    JSON.stringify(bounded).length <=
    IMPROVEMENT_EVIDENCE_BOUNDS.priorArtifactChars
  ) {
    return bounded;
  }
  return ImprovementArtifactSchema.parse({
    ...bounded,
    proposals: bounded.proposals.slice(0, 1),
    notes:
      "Prior artifact visibly reduced to the fixed 4,000-character analyst bound…",
  });
}

export interface CaptureImprovementInput {
  readonly workspaceId: string;
  readonly workspaceRoot: string;
  readonly sessionId: string;
  readonly generatedAt: string;
  readonly timeoutSeconds: number;
  readonly collectorModel: string;
  readonly priorArtifactsAvailable?: boolean;
  readonly priorArtifacts: readonly ImprovementArtifact[];
}

/** REQ-LIBRARY-032..034/165: one terminal-state, detached, immutable job snapshot. */
export function captureImprovementJob(
  dal: StoreDal,
  input: CaptureImprovementInput,
): ImprovementAnalysisJob | null {
  const sessionId = asSessionId(input.sessionId);
  const row = dal.getSession(sessionId);
  if (
    row === undefined ||
    row.run_type !== "task_run" ||
    (row.stop_reason !== null &&
      IMPROVEMENT_SKIP_REASONS.includes(
        row.stop_reason as (typeof IMPROVEMENT_SKIP_REASONS)[number],
      ))
  ) {
    return null;
  }

  const transcriptRows = dal
    .rowsBefore(
      sessionId,
      Number.MAX_SAFE_INTEGER,
      IMPROVEMENT_EVIDENCE_BOUNDS.transcriptEntries,
    )
    .reverse()
    .map((entry) => entry.body);
  const children = dal
    .childrenOf(sessionId)
    .filter((child) => child.report !== null)
    .slice(-IMPROVEMENT_EVIDENCE_BOUNDS.childReports)
    .map((child) => child.report!);
  const gateEvents = dal
    .eventsOf(sessionId)
    .filter(
      (event) =>
        event.kind === "gate.decision" ||
        event.kind === "verifier.result" ||
        event.kind === "verifier.progress",
    )
    .map((event) => event.payload);
  const priorArtifacts = input.priorArtifacts
    .filter(
      (artifact) =>
        artifact.source_run_type === "task_run" &&
        artifact.source_session_id !== input.sessionId,
    )
    .slice(0, IMPROVEMENT_EVIDENCE_BOUNDS.priorArtifacts)
    .map(boundedPriorArtifact);

  return ImprovementAnalysisJobSchema.parse({
    artifact_id: mintImprovementId("impart_"),
    workspace_id: input.workspaceId,
    workspace_root: input.workspaceRoot,
    source_session_id: input.sessionId,
    generated_at: input.generatedAt,
    timeout_seconds: input.timeoutSeconds,
    collector_model: input.collectorModel,
    // REQ-LIBRARY-025: the source session of each prior artifact supplied as history. A retrospective's artifact has none
    // (PD-LIBRARY-002 revision 2 (a)) and REQ-LIBRARY-034's filter keeps it, so it records none; until fin42 its null
    // reached the job and the parse threw, and no later run's analysis was captured (OQ-271 asks whether it belongs here).
    considered_session_ids: [
      ...new Set(priorArtifacts.flatMap((artifact) => (artifact.source_session_id === null ? [] : [artifact.source_session_id]))),
    ],
    progress: jsonEntries(
      row.progress,
      IMPROVEMENT_EVIDENCE_BOUNDS.progressEntries,
    ),
    todo: jsonEntries(row.todo, IMPROVEMENT_EVIDENCE_BOUNDS.todoItems),
    child_reports: {
      available: true,
      entries: bounded(
        children,
        IMPROVEMENT_EVIDENCE_BOUNDS.childReportChars,
        IMPROVEMENT_EVIDENCE_BOUNDS.childReportTotalChars,
      ),
    },
    transcript: {
      available: true,
      entries: bounded(
        transcriptRows,
        IMPROVEMENT_EVIDENCE_BOUNDS.transcriptEntryChars,
        IMPROVEMENT_EVIDENCE_BOUNDS.transcriptChars,
      ),
    },
    gate: {
      available: true,
      entries: bounded(
        gateEvents,
        IMPROVEMENT_EVIDENCE_BOUNDS.gateChars,
        IMPROVEMENT_EVIDENCE_BOUNDS.gateChars,
      ),
    },
    prior_artifacts_available: input.priorArtifactsAvailable ?? true,
    prior_artifacts: priorArtifacts,
  });
}
