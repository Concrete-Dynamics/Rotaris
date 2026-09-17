import { createHash } from "node:crypto";
import {
  IMPROVEMENT_CATEGORIES,
  ImprovementArtifactSchema,
  type ImprovementAnalysisJob,
  type ImprovementArtifact,
  type ImprovementEvidence,
  type ImprovementProposal,
} from "@rotaris/contracts";
import { millis, type Timers } from "@rotaris/kernel";
import type { AgentBackend, ModelRef, ThinkingLevel } from "@rotaris/model";
import { mintImprovementId } from "./capture.js";

export const IMPROVEMENT_ANALYST_SYSTEM = [
  "You are the post-run improvement analyst for a software workspace.",
  "Use only the frozen evidence in the request.",
  "Return one JSON object with a proposals array and optional notes.",
  "Each proposal needs category, summary, evidence, recommended_action, risk, target_persona when relevant, and proposed_verifier_section when relevant.",
  "Evidence entries need kind and text. Return an empty proposals array when the evidence supports no proposal.",
].join(" ");

/**
 * PD-LIBRARY-002: the retrospective asks a different question of the same analyst — how this workspace is
 * worked in across runs, rather than how one run went. The category vocabulary, the JSON shape and the
 * empty-array outcome are the sibling's, because a retrospective proposal is an ordinary proposal.
 */
export const RETROSPECTIVE_SYSTEM = [
  "You are the retrospective improvement analyst for a software workspace.",
  "The evidence spans many past sessions in this one workspace, plus its saved prompts, persona memory, instruction files and earlier proposals.",
  "Propose how the workspace itself is set up and worked in — recurring friction, stale instructions, missing checks — never how one run went.",
  "Use only the frozen evidence in the request, and do not repeat a proposal the prior proposals already carry.",
  "Every evidence entry must name the record it came from: set source_session_id to a session id from considered_session_ids when the entry cites a session.",
  "Return one JSON object with a proposals array and optional notes.",
  "Each proposal needs category, summary, evidence, recommended_action, risk, target_persona when relevant, and proposed_verifier_section when relevant.",
  "Evidence entries need kind and text. Return an empty proposals array when the evidence supports no proposal.",
].join(" ");

/** The system text this pass speaks with (ADR-0065 decision 1: one analyst, two passes). */
export function analystSystem(job: ImprovementAnalysisJob): string {
  return job.pass === "retrospective"
    ? RETROSPECTIVE_SYSTEM
    : IMPROVEMENT_ANALYST_SYSTEM;
}

export interface ImprovementAnalystDeps {
  readonly backend: AgentBackend;
  readonly model: ModelRef;
  readonly thinking: ThinkingLevel;
  readonly timers: Timers;
  readonly credentialFor: (model: ModelRef) => () => Promise<string>;
  readonly mintProposalId?: () => string;
  readonly warn?: (message: string) => void;
}

function withoutFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function sortedStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value.filter((entry): entry is string => typeof entry === "string"),
        ),
      ].sort()
    : [];
}

interface GateSituation {
  readonly state: string | null;
  readonly config_fingerprint: string | null;
  readonly unrunnable_checks: readonly string[];
  readonly uncovered_roles: readonly string[];
}

function gateSituation(job: ImprovementAnalysisJob): GateSituation {
  const raw = job.gate.entries.at(-1);
  if (raw === undefined)
    return {
      state: null,
      config_fingerprint: null,
      unrunnable_checks: [],
      uncovered_roles: [],
    };
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    return {
      state: typeof value["state"] === "string" ? value["state"] : null,
      config_fingerprint:
        typeof value["config_fingerprint"] === "string"
          ? value["config_fingerprint"]
          : null,
      unrunnable_checks: sortedStrings(value["unrunnable_checks"]),
      uncovered_roles: sortedStrings(value["uncovered_roles"]),
    };
  } catch {
    return {
      state: null,
      config_fingerprint: null,
      unrunnable_checks: [],
      uncovered_roles: [],
    };
  }
}

export function gateProposalKey(
  section: Readonly<Record<string, unknown>>,
  situation: GateSituation,
): string {
  const body = canonical({
    section,
    situation: {
      config_fingerprint: situation.config_fingerprint,
      state: situation.state,
      uncovered_roles: [...situation.uncovered_roles].sort(),
      unrunnable_checks: [...situation.unrunnable_checks].sort(),
    },
  });
  return createHash("sha256").update(body, "utf8").digest("hex").slice(0, 16);
}

function stampGateProposal(
  proposal: ImprovementProposal,
  job: ImprovementAnalysisJob,
): ImprovementProposal {
  if (proposal.category !== "verifier_gate_update") return proposal;
  const situation = gateSituation(job);
  const section = proposal.proposed_verifier_section!;
  const key = gateProposalKey(section, situation);
  const evidence: ImprovementEvidence[] = [
    ...proposal.evidence.filter(
      (entry) => entry.kind !== "verifier_gate_state",
    ),
    {
      kind: "verifier_gate_state",
      text: `gate state ${situation.state ?? "unknown"} at fingerprint ${(
        situation.config_fingerprint ?? "unknown"
      ).slice(0, 12)}`,
      source_task_id: null,
      source_artifact_id: null,
      source_session_id: job.source_session_id,
      excerpt: key,
    },
  ];
  return { ...proposal, evidence };
}

function priorPendingGateKeys(job: ImprovementAnalysisJob): Set<string> {
  return new Set(
    job.prior_artifacts
      .flatMap((artifact) => artifact.proposals)
      .filter(
        (proposal) =>
          proposal.category === "verifier_gate_update" &&
          proposal.status === "pending_review",
      )
      .flatMap((proposal) => proposal.evidence)
      .filter(
        (entry) =>
          entry.kind === "verifier_gate_state" && entry.excerpt !== undefined,
      )
      .map((entry) => entry.excerpt!),
  );
}

function sourceNotes(job: ImprovementAnalysisJob): string[] {
  const sources: [string, boolean][] =
    job.pass === "retrospective"
      ? [
          ["session history", job.retrospective?.sessions.available ?? false],
          ["prior proposals", job.retrospective?.proposals.available ?? false],
          ["saved prompts", job.retrospective?.prompts.available ?? false],
          [
            "persona memory",
            job.retrospective?.persona_memory.available ?? false,
          ],
          [
            "instruction files",
            job.retrospective?.instructions.available ?? false,
          ],
        ]
      : [
          ["progress", job.progress.available],
          ["todo", job.todo.available],
          ["child reports", job.child_reports.available],
          ["transcript", job.transcript.available],
          ["gate evidence", job.gate.available],
          ["prior artifact history", job.prior_artifacts_available],
        ];
  return sources
    .filter((entry): entry is [string, false] => entry[1] === false)
    .map(([name]) => `${name} unavailable at capture`);
}

/**
 * PD-LIBRARY-002's attribution clause. A post-run entry belongs to the one session that triggered the pass;
 * a retrospective entry names its own record, and an id the capture never read is refused rather than
 * carried, so a proposal's evidence always points at material this pass actually consumed.
 */
function evidenceSession(
  job: ImprovementAnalysisJob,
  entry: Readonly<Record<string, unknown>>,
): string | null {
  if (job.pass !== "retrospective") return job.source_session_id;
  const claimed = entry["source_session_id"];
  return typeof claimed === "string" &&
    job.considered_session_ids.includes(claimed)
    ? claimed
    : null;
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

export function parseImprovementAnalysis(
  text: string,
  job: ImprovementAnalysisJob,
  mintProposalId: () => string = () => mintImprovementId("imp_"),
): ImprovementArtifact {
  let root: Record<string, unknown>;
  try {
    root = asObject(
      JSON.parse(withoutFence(text)) as unknown,
      "collector output",
    );
  } catch (cause) {
    throw new Error(
      `collector output is invalid JSON: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
  }
  if (!Array.isArray(root["proposals"]))
    throw new Error("collector output proposals must be a list");
  const categories = new Set<string>(IMPROVEMENT_CATEGORIES);
  const proposals = root["proposals"].map((raw, index) => {
    const proposal = asObject(raw, `proposals.${index}`);
    const evidenceRaw = proposal["evidence"];
    if (!Array.isArray(evidenceRaw))
      throw new Error(`proposals.${index}.evidence must be a list`);
    const evidence = evidenceRaw.map((rawEntry, evidenceIndex) => {
      const entry = asObject(
        rawEntry,
        `proposals.${index}.evidence.${evidenceIndex}`,
      );
      return {
        ...entry,
        source_session_id: evidenceSession(job, entry),
        source_task_id: entry["source_task_id"] ?? null,
        source_artifact_id: entry["source_artifact_id"] ?? null,
      };
    });
    const id =
      typeof proposal["id"] === "string" &&
      /^imp_[0-9A-Za-z]{8}$/.test(proposal["id"])
        ? proposal["id"]
        : mintProposalId();
    const category =
      typeof proposal["category"] === "string" &&
      categories.has(proposal["category"])
        ? proposal["category"]
        : "workspace_note";
    return stampGateProposal(
      {
        ...proposal,
        id,
        category,
        evidence,
        created_at:
          typeof proposal["created_at"] === "string"
            ? proposal["created_at"]
            : job.generated_at,
        status: proposal["status"] ?? "pending_review",
        risk: proposal["risk"] ?? "low",
        target_persona: proposal["target_persona"] ?? null,
        proposed_verifier_section:
          proposal["proposed_verifier_section"] ?? null,
      } as ImprovementProposal,
      job,
    );
  });
  const priorKeys = priorPendingGateKeys(job);
  const deduped = proposals.filter(
    (proposal) =>
      proposal.category !== "verifier_gate_update" ||
      !proposal.evidence.some(
        (entry) =>
          entry.kind === "verifier_gate_state" &&
          entry.excerpt !== undefined &&
          priorKeys.has(entry.excerpt),
      ),
  );
  const modelNotes =
    root["notes"] === null || root["notes"] === undefined
      ? []
      : [
          typeof root["notes"] === "string"
            ? root["notes"]
            : JSON.stringify(root["notes"]),
        ];
  const notes = [...modelNotes, ...sourceNotes(job)]
    .filter((entry) => entry.trim() !== "")
    .join("\n");
  return ImprovementArtifactSchema.parse({
    artifact_id: job.artifact_id,
    source_session_id: job.source_session_id,
    // PD-LIBRARY-002 (ADR-0065 decision 2): `source_kind` is what tells the two passes apart; `source_run_type`
    // stays REQ-SESSION-021's marker, because a retrospective starts no session and a filter by it must not move.
    source_kind: job.pass,
    source_run_type: "task_run",
    generated_at: job.generated_at,
    collector_model: job.collector_model,
    proposals: deduped,
    considered_session_ids: job.considered_session_ids,
    notes: notes === "" ? null : notes,
    checkpoints: [],
    rolled_back_at: null,
  });
}

function recovery(
  job: ImprovementAnalysisJob,
  notes: string,
): ImprovementArtifact {
  return ImprovementArtifactSchema.parse({
    artifact_id: job.artifact_id,
    source_session_id: job.source_session_id,
    source_kind: job.pass,
    source_run_type: "task_run",
    generated_at: job.generated_at,
    collector_model: job.collector_model,
    proposals: [],
    considered_session_ids: job.considered_session_ids,
    notes,
    checkpoints: [],
    rolled_back_at: null,
  });
}

export function improvementPrompt(job: ImprovementAnalysisJob): string {
  if (job.pass === "retrospective") return retrospectivePrompt(job);
  return `Analyse this frozen post-run evidence and return the required JSON object.\n${JSON.stringify(
    {
      source_session_id: job.source_session_id,
      progress: job.progress.entries,
      todo: job.todo.entries,
      child_reports: job.child_reports.entries,
      gate: job.gate.entries,
      transcript: job.transcript.entries,
      prior_artifacts: job.prior_artifacts,
    },
  )}`;
}

/**
 * PD-LIBRARY-002: the same frozen-evidence contract, over the five workspace-wide sources. The capture has
 * already bounded and visibly cut every entry, so this only names each source for the model.
 */
function retrospectivePrompt(job: ImprovementAnalysisJob): string {
  const sources = job.retrospective;
  return `Analyse this frozen workspace-wide evidence and return the required JSON object.\n${JSON.stringify(
    {
      workspace_id: job.workspace_id,
      considered_session_ids: job.considered_session_ids,
      session_digests: sources?.sessions.entries ?? [],
      prior_proposals: sources?.proposals.entries ?? [],
      saved_prompts: sources?.prompts.entries ?? [],
      persona_memory: sources?.persona_memory.entries ?? [],
      instruction_files: sources?.instructions.entries ?? [],
    },
  )}`;
}

/** REQ-LIBRARY-015/022..024: two parse attempts inside one hard wall-clock bound. */
export async function analyzeImprovement(
  job: ImprovementAnalysisJob,
  deps: ImprovementAnalystDeps,
  signal: AbortSignal,
): Promise<ImprovementArtifact> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal.aborted) abort();
  else signal.addEventListener("abort", abort, { once: true });
  let timeoutHandle: { cancel(): void } | undefined;
  const timedOut = new Promise<"timeout">((resolve) => {
    timeoutHandle = deps.timers.after(
      millis(job.timeout_seconds * 1_000),
      () => {
        controller.abort();
        resolve("timeout");
      },
    );
  });
  const run = async (): Promise<ImprovementArtifact> => {
    const base = improvementPrompt(job);
    let parseError = "";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const request =
        attempt === 0
          ? base
          : `${base}\n\nThe previous response failed parsing: ${parseError}. Return corrected machine-readable JSON only.`;
      const report = await deps.backend.runTurn(
        {
          persona: "improvement-analyst",
          systemPrompt: analystSystem(job),
          messages: [
            { role: "user", content: [{ kind: "text", text: request }] },
          ],
          tools: [],
          model: deps.model,
          thinking: deps.thinking,
          timeoutMs: job.timeout_seconds * 1_000,
          retries: 0,
          resolveCredential: deps.credentialFor(deps.model),
          output: { kind: "json_object" },
        },
        {
          delta: () => undefined,
          reasoning: () => undefined,
          usage: () => undefined,
        },
        controller.signal,
      );
      if (report.status === "failed") throw new Error(report.error.headline);
      try {
        return parseImprovementAnalysis(report.text, job, deps.mintProposalId);
      } catch (cause) {
        parseError = cause instanceof Error ? cause.message : String(cause);
      }
    }
    return recovery(job, `collector parse failed: ${parseError}`);
  };

  try {
    const outcome = await Promise.race([run(), timedOut]);
    return outcome === "timeout"
      ? recovery(
          job,
          `collector timed out after ${job.timeout_seconds} seconds`,
        )
      : outcome;
  } catch (cause) {
    if (controller.signal.aborted && !signal.aborted)
      return recovery(
        job,
        `collector timed out after ${job.timeout_seconds} seconds`,
      );
    return recovery(
      job,
      `collector crashed: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
  } finally {
    timeoutHandle?.cancel();
    signal.removeEventListener("abort", abort);
  }
}
