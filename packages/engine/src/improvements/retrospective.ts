import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  ImprovementAnalysisJobSchema,
  type ImprovementAnalysisJob,
  type ImprovementArtifact,
  type ImprovementCapturedSource,
} from "@rotaris/contracts";
import { asSessionId } from "@rotaris/kernel";
import type { StoreDal } from "@rotaris/store";
import { bounded, mintImprovementId, visiblyCut } from "./capture.js";

/**
 * PD-LIBRARY-002 (ADR-0065 decision 6): the retrospective's evidence bounds. Fixed constants, the same in
 * every workspace, never configuration — the directive fixes this pass's configuration surface at exactly
 * its timeout, its slot and the slot's thinking companion, mirroring REQ-LIBRARY-165's rule for the sibling.
 * Because they are constants, two passes over an unchanged workspace consume the same evidence.
 */
export const RETROSPECTIVE_EVIDENCE_BOUNDS = Object.freeze({
  sessions: 25,
  sessionChars: 2_000,
  sessionsTotalChars: 50_000,
  proposals: 20,
  proposalChars: 400,
  // 25 from each list is PD-LIBRARY-002's 50 prompts; `PROMPT_CAPS` holds 200 history and 100 stash.
  promptsPerList: 25,
  promptChars: 200,
  personaMemoryFiles: 10,
  personaMemoryChars: 4_000,
  instructionChars: 20_000,
});

/** The directory the executor writes a persona memory file into (REQ-LIBRARY-006's `persona_memory_update`). */
const PERSONA_MEMORY_DIR = join(".rotaris", "persona_memory");
/**
 * FALSIFIED 2026-09-22, kept beside its replacement: `const INSTRUCTION_FILES = ["AGENTS.md",
 * "AGENTS.override.md"]`, described as "REQ-WORKSPACE-041's discovery, in the order that requirement fixes".
 * It was a copy of that requirement's sentence rather than a use of it, and the sentence moved:
 * `PD-WORKSPACE-002` widened discovery to four names at the workspace root and two at each of five further
 * bases, and gave every file an on/off switch. `PD-LIBRARY-002` pointed this read at the rule by NAME, so
 * the read was meant to widen with it — instead the two readers of the same files disagreed about what an
 * instruction file is, and this one read files the user had switched off.
 *
 * The set is no longer decided here. It arrives on the input, computed by the run host, which owns the
 * configuration and the policy; the engine may not depend on `@rotaris/config` and should not be the place
 * a policy is restated. Which switches reach an analysis rather than an agent is **OQ-65**; what the build
 * proceeds under is that the retrospective consumes exactly the set injection consumes.
 */
export interface RetrospectiveInstructionFile {
  /** The stable identity the per-file switch keys on, e.g. `workspace:AGENTS.md`. */
  readonly id: string;
  /** The file's own name, which is what the retrospective's evidence and any proposal cite. */
  readonly name: string;
  /** Absolute path, already resolved against the base the file was discovered under. */
  readonly path: string;
}

function parsedList(raw: string | null): unknown[] {
  if (raw === null) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value) ? value : [value];
  } catch {
    return [];
  }
}

/**
 * The session's own opening prompt. `rowsBefore` is the only transcript reader and it descends, so a small
 * `beforeIndex` asks the index for the first rows and the reverse puts them back in order. One indexed read
 * per session, never a scan: REQ-LIBRARY-018's bound is about what the pass consumes, and a capture that
 * walked 25 transcripts would consume the workspace instead.
 */
function openingPrompt(dal: StoreDal, sessionId: string): string | null {
  const rows = dal.rowsBefore(asSessionId(sessionId), 8, 8).reverse();
  const opening = rows.find((row) => row.kind === "user");
  return opening === undefined ? null : opening.body;
}

/** One session, as the pass reads it: what was asked, what it cost, how it ended, and what went wrong. */
function sessionDigest(dal: StoreDal, sessionId: string): string | null {
  const row = dal.getSession(asSessionId(sessionId));
  if (row === undefined) return null;
  const toolCounts = dal
    .toolCallCounts(asSessionId(sessionId))
    .map((entry) => `${entry.tool_name}:${entry.count}`)
    .sort();
  const issues = dal
    .issuesOf(asSessionId(sessionId))
    .slice(-5)
    .map((issue) =>
      visiblyCut(`${issue.severity} ${issue.kind}: ${issue.message}`, 200),
    );
  return JSON.stringify({
    session_id: row.session_id,
    run_type: row.run_type,
    status: row.execution_status,
    started_at: row.run_started_at ?? row.created_at,
    ended_at: row.updated_at,
    stop_reason: row.stop_reason,
    iterations: row.iterations_completed,
    tool_calls: row.tool_calls,
    tool_call_counts: toolCounts,
    compressions: row.compressions,
    tokens: { input: row.tokens_input, output: row.tokens_output },
    cost: row.cost,
    children: dal.childrenOf(asSessionId(sessionId)).length,
    summary: row.summary_text === null ? null : visiblyCut(row.summary_text, 400),
    summary_status: row.summary_status,
    opening_prompt: (() => {
      const prompt = openingPrompt(dal, sessionId);
      return prompt === null ? null : visiblyCut(prompt, 600);
    })(),
    todo: parsedList(row.todo).length,
    progress: parsedList(row.progress).length,
    issues,
  });
}

/** `listSessions` already orders newest-updated first, which is the order the bound cuts from. */
function newestSessions(dal: StoreDal): string[] {
  return dal
    .listSessions()
    .slice(0, RETROSPECTIVE_EVIDENCE_BOUNDS.sessions)
    .map((row) => row.session_id);
}

function sessionsSource(dal: StoreDal): ImprovementCapturedSource {
  const digests = newestSessions(dal).flatMap((sessionId) => {
    const digest = sessionDigest(dal, sessionId);
    return digest === null ? [] : [digest];
  });
  return {
    available: true,
    entries: bounded(
      digests,
      RETROSPECTIVE_EVIDENCE_BOUNDS.sessionChars,
      RETROSPECTIVE_EVIDENCE_BOUNDS.sessionsTotalChars,
    ),
  };
}

/**
 * What the workspace has already been told, and what it decided about it. A rejected proposal is as much
 * evidence as an open one: it is how the pass learns that an idea was raised and turned down (REQ-LIBRARY-030
 * keeps a rejection from suppressing a later proposal, and this keeps the pass from re-raising it blindly).
 */
function proposalsSource(
  priorArtifacts: readonly ImprovementArtifact[],
  available: boolean,
): ImprovementCapturedSource {
  if (!available) return { available: false, entries: [] };
  const entries = priorArtifacts
    .flatMap((artifact) =>
      artifact.proposals.map((proposal) =>
        JSON.stringify({
          artifact_id: artifact.artifact_id,
          source_kind: artifact.source_kind,
          proposal_id: proposal.id,
          category: proposal.category,
          status: proposal.status,
          summary: proposal.summary,
          target_persona: proposal.target_persona,
        }),
      ),
    )
    .slice(0, RETROSPECTIVE_EVIDENCE_BOUNDS.proposals);
  return {
    available: true,
    entries: entries.map((entry) =>
      visiblyCut(entry, RETROSPECTIVE_EVIDENCE_BOUNDS.proposalChars),
    ),
  };
}

/**
 * The saved prompts, read entry by entry through `promptAt`. `readPrompts` prunes and trims as it reads, and
 * a capture may not write to the store it is reading (REQ-LIBRARY-033 freezes evidence; it does not edit it).
 */
function promptsSource(dal: StoreDal): ImprovementCapturedSource {
  const entries: string[] = [];
  for (const list of ["stash", "history"] as const) {
    for (
      let index = 0;
      index < RETROSPECTIVE_EVIDENCE_BOUNDS.promptsPerList;
      index += 1
    ) {
      const text = dal.promptAt(list, index);
      if (text === "") break;
      entries.push(
        JSON.stringify({
          list,
          index,
          text: visiblyCut(text, RETROSPECTIVE_EVIDENCE_BOUNDS.promptChars),
        }),
      );
    }
  }
  return { available: true, entries };
}

function readTextFile(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function personaMemorySource(workspaceRoot: string): ImprovementCapturedSource {
  const directory = join(workspaceRoot, PERSONA_MEMORY_DIR);
  let names: string[];
  try {
    names = readdirSync(directory)
      .filter((name) => name.toLowerCase().endsWith(".md"))
      .sort();
  } catch (cause) {
    // A directory that is not there is a workspace with no persona memory, which is a source that WAS
    // obtained and held nothing (REQ-LIBRARY-019's distinction). Anything else is a source that failed.
    return (cause as NodeJS.ErrnoException).code === "ENOENT"
      ? { available: true, entries: [] }
      : { available: false, entries: [] };
  }
  const entries = names
    .slice(0, RETROSPECTIVE_EVIDENCE_BOUNDS.personaMemoryFiles)
    .flatMap((name) => {
      const body = readTextFile(join(directory, name));
      return body === null
        ? []
        : [
            JSON.stringify({
              persona: name.replace(/\.md$/i, ""),
              path: `${PERSONA_MEMORY_DIR}/${name}`,
              body: visiblyCut(
                body,
                RETROSPECTIVE_EVIDENCE_BOUNDS.personaMemoryChars,
              ),
            }),
          ];
    });
  return { available: true, entries };
}

function instructionsSource(files: readonly RetrospectiveInstructionFile[]): ImprovementCapturedSource {
  const found = files.flatMap((file) => {
    try {
      if (!statSync(file.path).isFile()) return [];
    } catch {
      return [];
    }
    const body = readTextFile(file.path);
    return body === null ? [] : [{ name: file.name, body }];
  });
  if (found.length === 0) return { available: true, entries: [] };
  return {
    available: true,
    entries: bounded(
      found.map((file) => JSON.stringify({ file: file.name, body: file.body })),
      RETROSPECTIVE_EVIDENCE_BOUNDS.instructionChars,
      RETROSPECTIVE_EVIDENCE_BOUNDS.instructionChars,
    ),
  };
}

export interface CaptureRetrospectiveInput {
  readonly workspaceId: string;
  readonly workspaceRoot: string;
  readonly generatedAt: string;
  readonly timeoutSeconds: number;
  readonly collectorModel: string;
  readonly priorArtifactsAvailable?: boolean;
  readonly priorArtifacts: readonly ImprovementArtifact[];
  /**
   * The instruction files this pass may read, already discovered and already filtered by the per-file and
   * master switches (`PD-WORKSPACE-002`, REQ-WORKSPACE-048) by the caller that owns the configuration.
   * Omitted means none — an absent policy is read as "nothing to offer", never as "read the root and hope".
   */
  readonly instructionFiles?: readonly RetrospectiveInstructionFile[];
}

/**
 * PD-LIBRARY-002: one frozen, bounded, workspace-wide snapshot. It reads only material this product already
 * keeps for THIS workspace — never another workspace, never a user-global location, never the network — and
 * returns `null` when the workspace's record holds nothing at all to read, so a gesture in an empty workspace
 * captures no pass rather than spending a model call on nothing.
 */
export function captureRetrospectiveJob(
  dal: StoreDal,
  input: CaptureRetrospectiveInput,
): ImprovementAnalysisJob | null {
  const sessions = sessionsSource(dal);
  const proposals = proposalsSource(
    input.priorArtifacts,
    input.priorArtifactsAvailable ?? true,
  );
  const prompts = promptsSource(dal);
  const personaMemory = personaMemorySource(input.workspaceRoot);
  const instructions = instructionsSource(input.instructionFiles ?? []);
  const empty =
    sessions.entries.length === 0 &&
    proposals.entries.length === 0 &&
    prompts.entries.length === 0 &&
    personaMemory.entries.length === 0 &&
    instructions.entries.length === 0;
  if (empty) return null;

  const considered = [...new Set(newestSessions(dal))];

  const none: ImprovementCapturedSource = { available: true, entries: [] };
  return ImprovementAnalysisJobSchema.parse({
    artifact_id: mintImprovementId("impart_"),
    workspace_id: input.workspaceId,
    workspace_root: input.workspaceRoot,
    source_session_id: null,
    generated_at: input.generatedAt,
    timeout_seconds: input.timeoutSeconds,
    collector_model: input.collectorModel,
    considered_session_ids: considered,
    pass: "retrospective",
    // The sibling's six sources belong to a run, and this pass has none. They are present and empty rather
    // than absent, because one job shape serves both passes (ADR-0065 decision 1).
    progress: none,
    todo: none,
    child_reports: none,
    transcript: none,
    gate: none,
    prior_artifacts_available: input.priorArtifactsAvailable ?? true,
    prior_artifacts: [],
    retrospective: {
      sessions,
      proposals,
      prompts,
      persona_memory: personaMemory,
      instructions,
    },
  });
}
