import {
  ImprovementArtifactSchema,
  RecordedImprovementVersionSchema,
  parseImprovementArtifact,
  type ImprovementArtifact,
  type ImprovementArtifactRecord,
  type ImprovementProposal,
  type ImprovementVersionCause,
  type ProposalStatus,
  type RecordedImprovementVersion,
} from "@rotaris/contracts";
import {
  IMPROVEMENT_HISTORY_LIMIT,
  ImprovementDal,
  type ImprovementArtifactRow,
  type StoreHandle,
} from "@rotaris/store";

export const IMPROVEMENT_NOT_FOUND = (id: string): string =>
  `improvement artifact not found: ${id}`;
export const PROPOSAL_NOT_FOUND = (
  artifactId: string,
  proposalId: string,
): string => `proposal '${proposalId}' not found in artifact '${artifactId}'`;

export class ImprovementConflictError extends Error {
  constructor(
    readonly artifactId: string,
    readonly expected: number,
    readonly actual: number,
  ) {
    super(
      `improvement artifact '${artifactId}' changed from version ${expected} to ${actual}`,
    );
    this.name = "ImprovementConflictError";
  }
}

export interface ImprovementLogger {
  warn(message: string): void;
}
export interface ImprovementHistory {
  readonly versions: readonly RecordedImprovementVersion[];
  readonly skipped: readonly number[];
  readonly versionsPruned: number;
  readonly versionsNeverRecorded: number;
}

export interface ImprovementReader {
  ids(): readonly string[];
  list(): readonly ImprovementArtifactRecord[];
  artifact(id: string): ImprovementArtifactRecord;
  latest(sourceSessionId?: string): ImprovementArtifactRecord | undefined;
  history(id: string): ImprovementHistory;
  version(id: string, version: number): RecordedImprovementVersion;
  approved(id: string): readonly ImprovementProposal[];
}

export interface ImprovementWriteResult {
  readonly record: ImprovementArtifactRecord;
  readonly changed: boolean;
}
export interface ImprovementReviewResult extends ImprovementWriteResult {
  readonly previous: ProposalStatus;
  readonly current: ProposalStatus;
}

export interface ImprovementWriter {
  save(
    artifact: unknown,
    cause?: ImprovementVersionCause,
    options?: {
      readonly suppressDuplicates?: boolean;
      readonly expectedVersionsDue?: number;
    },
  ): ImprovementWriteResult;
  review(
    artifactId: string,
    proposalId: string,
    status: ProposalStatus,
    expectedVersionsDue?: number,
  ): ImprovementReviewResult;
  edit(
    artifactId: string,
    proposalId: string,
    fields: { readonly summary: string; readonly recommended_action: string },
    expectedVersionsDue?: number,
  ): ImprovementWriteResult;
  deleteProposal(
    artifactId: string,
    proposalId: string,
    expectedVersionsDue?: number,
  ): ImprovementWriteResult;
}

interface WriterDeps {
  readonly now: () => string;
  readonly logger?: ImprovementLogger;
  /** Deterministic failure seam for ADR-0061's best-effort history proof. */
  readonly beforeVersionWrite?: () => void;
}

interface PendingVersion {
  readonly version: number;
  readonly recorded_at: string;
  readonly cause: ImprovementVersionCause;
  readonly artifact: ImprovementArtifact;
}

interface CommitOptions {
  readonly expectedVersionsDue?: number;
  readonly suppressDuplicates?: boolean;
}

const fallbackLogger: ImprovementLogger = {
  warn: (message) => console.warn(message),
};

function parseRow(row: ImprovementArtifactRow): ImprovementArtifact {
  return parseImprovementArtifact(JSON.parse(row.body) as unknown);
}

function neverRecorded(
  dal: ImprovementDal,
  row: ImprovementArtifactRow,
): number {
  return Math.max(
    0,
    row.versions_due - row.versions_pruned - dal.versionCount(row.artifact_id),
  );
}

function recordOf(
  dal: ImprovementDal,
  row: ImprovementArtifactRow,
): ImprovementArtifactRecord {
  return {
    artifact: parseRow(row),
    versions_due: row.versions_due,
    versions_pruned: row.versions_pruned,
    versions_never_recorded: neverRecorded(dal, row),
  };
}

function normalizeKey(value: string | null): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}
function proposalKey(proposal: ImprovementProposal): string {
  return `${proposal.category}\u0000${normalizeKey(
    proposal.target_persona,
  )}\u0000${normalizeKey(proposal.recommended_action)}`;
}

function appendSuppressionNote(
  notes: string | null,
  ids: readonly string[],
): string | null {
  if (ids.length === 0) return notes;
  const line = `Suppressed duplicate proposals already covered by: ${[...ids]
    .sort()
    .join(", ")}.`;
  return notes === null || notes === "" ? line : `${notes}\n${line}`;
}

function proposalIn(
  artifact: ImprovementArtifact,
  artifactId: string,
  proposalId: string,
): ImprovementProposal {
  const proposal = artifact.proposals.find(
    (candidate) => candidate.id === proposalId,
  );
  if (proposal === undefined)
    throw new Error(PROPOSAL_NOT_FOUND(artifactId, proposalId));
  return proposal;
}

function parseRecordedVersion(row: {
  readonly version: number;
  readonly recorded_at: string;
  readonly cause: string;
  readonly body: string;
}): RecordedImprovementVersion {
  return RecordedImprovementVersionSchema.parse({
    version: row.version,
    recorded_at: row.recorded_at,
    cause: row.cause,
    artifact: JSON.parse(row.body) as unknown,
  });
}

export function createImprovementReader(
  db: StoreHandle,
  logger: ImprovementLogger = fallbackLogger,
): ImprovementReader {
  const dal = new ImprovementDal(db);
  const safe = (
    row: ImprovementArtifactRow,
  ): ImprovementArtifactRecord | undefined => {
    try {
      return recordOf(dal, row);
    } catch (error) {
      logger.warn(
        `malformed improvement artifact '${row.artifact_id}' skipped: ${String(
          error,
        )}`,
      );
      return undefined;
    }
  };
  return Object.freeze({
    ids: () => dal.listIds(),
    list: () =>
      dal.readTransaction(() =>
        dal
          .listNewest()
          .map(safe)
          .filter(
            (record): record is ImprovementArtifactRecord =>
              record !== undefined,
          ),
      ),
    artifact(id) {
      const row = dal.read(id);
      if (row === undefined) throw new Error(IMPROVEMENT_NOT_FOUND(id));
      return recordOf(dal, row);
    },
    latest(sourceSessionId) {
      const rows =
        sourceSessionId === undefined
          ? dal.listNewest()
          : dal
              .listNewest()
              .filter((row) => row.source_session_id === sourceSessionId);
      for (const row of rows) {
        const parsed = safe(row);
        if (parsed !== undefined) return parsed;
      }
      return undefined;
    },
    history(id) {
      const artifact = dal.read(id);
      if (artifact === undefined)
        return {
          versions: [],
          skipped: [],
          versionsPruned: 0,
          versionsNeverRecorded: 0,
        };
      const versions: RecordedImprovementVersion[] = [];
      const skipped: number[] = [];
      for (const row of dal.versions(id)) {
        try {
          versions.push(parseRecordedVersion(row));
        } catch (error) {
          skipped.push(row.version);
          logger.warn(
            `improvement artifact '${id}' recorded version ${
              row.version
            } skipped: ${String(error)}`,
          );
        }
      }
      if (artifact.versions_due === 0 && versions.length === 0) {
        versions.push({
          version: 1,
          recorded_at: artifact.generated_at,
          cause: "unknown",
          artifact: parseRow(artifact),
        });
      }
      return {
        versions,
        skipped,
        versionsPruned: artifact.versions_pruned,
        versionsNeverRecorded: neverRecorded(dal, artifact),
      };
    },
    version(id, version) {
      if (dal.read(id) === undefined)
        throw new Error(
          `improvement artifact '${id}' has no recorded version ${version}`,
        );
      const row = dal.version(id, version);
      if (row === undefined)
        throw new Error(
          `improvement artifact '${id}' has no recorded version ${version}`,
        );
      return parseRecordedVersion(row);
    },
    approved(id) {
      return this.artifact(id).artifact.proposals.filter(
        (proposal) => proposal.status === "approved",
      );
    },
  } satisfies ImprovementReader);
}

export function createImprovementWriter(
  reader: ImprovementReader,
  db: StoreHandle,
  deps: WriterDeps,
): ImprovementWriter {
  void reader; // Construction direction is part of the capability boundary.
  const dal = new ImprovementDal(db);
  const logger = deps.logger ?? fallbackLogger;

  const suppressDuplicates = (
    input: ImprovementArtifact,
  ): ImprovementArtifact => {
    const covering = new Set<string>();
    const open = new Map<string, string>();
    for (const row of dal.listNewest()) {
      if (row.artifact_id === input.artifact_id) continue;
      let prior: ImprovementArtifact;
      try {
        prior = parseRow(row);
      } catch {
        continue;
      }
      for (const proposal of prior.proposals) {
        if (proposal.status !== "rejected")
          open.set(proposalKey(proposal), prior.artifact_id);
      }
    }
    const proposals = input.proposals.filter((proposal) => {
      const coveredBy = open.get(proposalKey(proposal));
      if (coveredBy === undefined) return true;
      covering.add(coveredBy);
      return false;
    });
    return parseImprovementArtifact({
      ...input,
      proposals,
      notes: appendSuppressionNote(input.notes, [...covering]),
    });
  };

  const recordVersions = (
    artifactId: string,
    pending: readonly PendingVersion[],
  ): void => {
    try {
      deps.beforeVersionWrite?.();
      dal.durableTransaction(() => {
        for (const version of pending) {
          dal.insertVersion({
            artifact_id: artifactId,
            version: version.version,
            recorded_at: version.recorded_at,
            cause: version.cause,
            body: JSON.stringify(version.artifact),
          });
        }
        const row = dal.read(artifactId);
        if (row === undefined)
          throw new Error(IMPROVEMENT_NOT_FOUND(artifactId));
        const pruned = dal.retain(artifactId, IMPROVEMENT_HISTORY_LIMIT);
        if (pruned > 0) dal.setPruned(artifactId, row.versions_pruned + pruned);
      });
    } catch (error) {
      logger.warn(
        `improvement '${artifactId}' version recording failed: ${String(
          error,
        )}`,
      );
    }
  };

  const commit = (
    artifactId: string,
    cause: ImprovementVersionCause,
    resolve: (current: ImprovementArtifact | undefined) => ImprovementArtifact,
    options: CommitOptions = {},
  ): ImprovementWriteResult => {
    const pending: PendingVersion[] = [];
    const committed = dal.durableTransaction(() => {
      const currentRow = dal.read(artifactId);
      const actual = currentRow?.versions_due ?? 0;
      if (
        options.expectedVersionsDue !== undefined &&
        actual !== options.expectedVersionsDue
      ) {
        throw new ImprovementConflictError(
          artifactId,
          options.expectedVersionsDue,
          actual,
        );
      }
      const current =
        currentRow === undefined ? undefined : parseRow(currentRow);
      let artifact = parseImprovementArtifact(resolve(current));
      if (artifact.artifact_id !== artifactId)
        throw new Error(
          `improvement artifact id changed during mutation: ${artifactId}`,
        );
      if (options.suppressDuplicates) artifact = suppressDuplicates(artifact);

      let next = actual;
      if (
        currentRow !== undefined &&
        currentRow.versions_due === 0 &&
        dal.versionCount(artifactId) === 0
      ) {
        pending.push({
          version: ++next,
          recorded_at: currentRow.generated_at,
          cause: "unknown",
          artifact: current!,
        });
      }
      pending.push({
        version: ++next,
        recorded_at: deps.now(),
        cause,
        artifact,
      });
      dal.write({
        artifact_id: artifact.artifact_id,
        source_session_id: artifact.source_session_id,
        source_kind: artifact.source_kind,
        source_run_type: artifact.source_run_type,
        generated_at: artifact.generated_at,
        body: JSON.stringify(artifact),
        versions_due: next,
        versions_pruned: currentRow?.versions_pruned ?? 0,
      });
      // PD-LIBRARY-002: a retrospective belongs to no session, so there is no snapshot to associate it with
      // (REQ-LIBRARY-036 is about re-associating a session's own artifacts across resumes).
      if (artifact.source_session_id !== null)
        dal.associateWithSession(
          artifact.source_session_id,
          artifact.artifact_id,
        );
      return artifact;
    });

    recordVersions(artifactId, pending);
    const row = dal.read(committed.artifact_id);
    if (row === undefined)
      throw new Error(IMPROVEMENT_NOT_FOUND(committed.artifact_id));
    return { record: recordOf(dal, row), changed: true };
  };

  const mutate = (
    artifactId: string,
    cause: ImprovementVersionCause,
    expectedVersionsDue: number | undefined,
    transform: (current: ImprovementArtifact) => ImprovementArtifact,
  ): ImprovementWriteResult =>
    commit(
      artifactId,
      cause,
      (current) => {
        if (current === undefined)
          throw new Error(IMPROVEMENT_NOT_FOUND(artifactId));
        return transform(current);
      },
      // exactOptionalPropertyTypes: an explicit `undefined` is not assignable to an optional
      // property, so the key is included only when the caller supplied a value.
      expectedVersionsDue === undefined ? {} : { expectedVersionsDue },
    );

  return Object.freeze({
    save(raw, cause = "collected", options = {}) {
      const input = parseImprovementArtifact(raw);
      return commit(input.artifact_id, cause, () => input, options);
    },
    review(artifactId, proposalId, status, expectedVersionsDue) {
      let previous: ProposalStatus | undefined;
      const result = mutate(
        artifactId,
        "status_change",
        expectedVersionsDue,
        (current) => {
          const proposal = proposalIn(current, artifactId, proposalId);
          previous = proposal.status;
          return ImprovementArtifactSchema.parse({
            ...current,
            proposals: current.proposals.map((candidate) =>
              candidate.id === proposalId
                ? { ...candidate, status }
                : candidate,
            ),
          });
        },
      );
      return { ...result, previous: previous!, current: status };
    },
    edit(artifactId, proposalId, fields, expectedVersionsDue) {
      return mutate(artifactId, "edit", expectedVersionsDue, (current) => {
        proposalIn(current, artifactId, proposalId);
        return ImprovementArtifactSchema.parse({
          ...current,
          proposals: current.proposals.map((candidate) =>
            candidate.id === proposalId
              ? {
                  ...candidate,
                  summary: fields.summary,
                  recommended_action: fields.recommended_action,
                }
              : candidate,
          ),
        });
      });
    },
    deleteProposal(artifactId, proposalId, expectedVersionsDue) {
      return mutate(artifactId, "delete", expectedVersionsDue, (current) => {
        proposalIn(current, artifactId, proposalId);
        return ImprovementArtifactSchema.parse({
          ...current,
          proposals: current.proposals.filter(
            (proposal) => proposal.id !== proposalId,
          ),
        });
      });
    },
  } satisfies ImprovementWriter);
}
