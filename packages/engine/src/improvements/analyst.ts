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
  return [
    ["progress", job.progress.available],
    ["todo", job.todo.available],
    ["child reports", job.child_reports.available],
    ["transcript", job.transcript.available],
    ["gate evidence", job.gate.available],
    ["prior artifact history", job.prior_artifacts_available],
  ]
    .filter((entry): entry is [string, false] => entry[1] === false)
    .map(([name]) => `${name} unavailable at capture`);
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
        source_session_id: job.source_session_id,
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
          systemPrompt: IMPROVEMENT_ANALYST_SYSTEM,
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
