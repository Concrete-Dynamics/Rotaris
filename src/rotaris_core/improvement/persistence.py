"""Workspace-scoped disk persistence for improvement proposal artifacts.

Artifacts live under ``<workspace>/.rotaris/improvement_artifacts/`` as
single JSON files. On first access, legacy session-local artifacts under
``.rotaris/sessions/*/improvement_artifacts/`` are copied into the workspace
store if they are not already present there.
"""

from __future__ import annotations

import logging
from pathlib import Path

from rotaris_core.fs import atomic_write
from rotaris_core.improvement.history import (
    DEFAULT_HISTORY_RETENTION,
    ImprovementHistoryCause,
    has_recorded_history,
    record_artifact_version,
    seed_legacy_version,
)
from rotaris_core.improvement.proposals import (
    ApprovalStatus,
    ImprovementProposal,
    ImprovementProposalArtifact,
    validate_artifact,
)
from rotaris_core.reqtocode import SWR, traces

_log = logging.getLogger(__name__)

_ARTIFACT_DIRNAME = "improvement_artifacts"
_WORKSPACE_STATE_DIRNAME = ".rotaris"
_SESSIONS_DIRNAME = "sessions"
_OPEN_PROPOSAL_STATUSES = frozenset(
    {
        ApprovalStatus.PENDING_REVIEW,
        ApprovalStatus.APPROVED,
        ApprovalStatus.DEFERRED,
    },
)


@traces(SWR.SWR_1604)
def improvement_artifact_dir(workspace_root: Path) -> Path:
    """Directory containing workspace-scoped improvement artifacts."""
    return Path(workspace_root) / _WORKSPACE_STATE_DIRNAME / _ARTIFACT_DIRNAME


def _legacy_sessions_dir(workspace_root: Path) -> Path:
    return Path(workspace_root) / _WORKSPACE_STATE_DIRNAME / _SESSIONS_DIRNAME


def _import_legacy_session_artifacts(workspace_root: Path) -> None:
    target_dir = improvement_artifact_dir(workspace_root)
    sessions_dir = _legacy_sessions_dir(workspace_root)
    if not sessions_dir.exists():
        return

    target_dir.mkdir(parents=True, exist_ok=True)
    for session_dir in sessions_dir.iterdir():
        legacy_dir = session_dir / _ARTIFACT_DIRNAME
        if not legacy_dir.is_dir():
            continue
        for legacy_path in legacy_dir.glob("*.json"):
            target_path = target_dir / legacy_path.name
            if target_path.exists():
                continue
            try:
                ImprovementProposalArtifact.model_validate_json(
                    legacy_path.read_text(encoding="utf-8"),
                )
            except Exception:  # noqa: BLE001
                _log.warning(
                    "Skipping malformed legacy improvement artifact %s",
                    legacy_path,
                    exc_info=True,
                )
                continue
            atomic_write(target_path, legacy_path.read_text(encoding="utf-8"))


def _workspace_artifact_path(workspace_root: Path, artifact_id: str) -> Path:
    return improvement_artifact_dir(workspace_root) / f"{artifact_id}.json"


def _normalize_recommended_action(value: str) -> str:
    return " ".join(value.split()).casefold()


def proposal_dedupe_key(proposal: ImprovementProposal) -> tuple[str, str, str]:
    """Deterministic key for suppressing repeated open workspace proposals."""
    return (
        proposal.category.value,
        (proposal.target_persona or "").strip().casefold(),
        _normalize_recommended_action(proposal.recommended_action),
    )


def list_improvement_artifact_ids(workspace_root: Path) -> list[str]:
    """Return all workspace artifact IDs."""
    _import_legacy_session_artifacts(workspace_root)
    target_dir = improvement_artifact_dir(workspace_root)
    if not target_dir.exists():
        return []
    return sorted(p.stem for p in target_dir.glob("*.json"))


def load_improvement_artifact(
    workspace_root: Path,
    artifact_id: str,
) -> ImprovementProposalArtifact:
    """Load and validate a previously-persisted workspace artifact."""
    _import_legacy_session_artifacts(workspace_root)
    path = _workspace_artifact_path(workspace_root, artifact_id)
    if not path.exists():
        raise FileNotFoundError(f"improvement artifact not found: {path}")
    return ImprovementProposalArtifact.model_validate_json(
        path.read_text(encoding="utf-8"),
    )


def list_improvement_artifacts(
    workspace_root: Path,
) -> list[ImprovementProposalArtifact]:
    """Return all workspace artifacts sorted newest-first by generation time."""
    artifacts = [
        load_improvement_artifact(workspace_root, artifact_id)
        for artifact_id in list_improvement_artifact_ids(workspace_root)
    ]
    return sorted(artifacts, key=lambda artifact: artifact.generated_at, reverse=True)


def latest_improvement_artifact(
    workspace_root: Path,
    *,
    source_session_id: str | None = None,
) -> ImprovementProposalArtifact | None:
    """Return the newest workspace artifact, optionally filtered by source session."""
    for artifact in list_improvement_artifacts(workspace_root):
        if source_session_id is None or artifact.source_session_id == source_session_id:
            return artifact
    return None


def _append_note(existing: str | None, extra: str) -> str:
    if existing and existing.strip():
        return f"{existing.rstrip()}\n{extra}"
    return extra


def suppress_duplicate_open_proposals(
    workspace_root: Path,
    artifact: ImprovementProposalArtifact,
) -> ImprovementProposalArtifact:
    """Drop proposals already covered by open workspace proposals.

    Only proposals already present in other artifacts with status
    ``pending_review``, ``approved``, or ``deferred`` block a newly-generated
    proposal. Rejected proposals do not suppress future re-proposals.
    """
    open_proposal_ids_by_key: dict[tuple[str, str, str], list[str]] = {}
    for existing in list_improvement_artifacts(workspace_root):
        if existing.artifact_id == artifact.artifact_id:
            continue
        for proposal in existing.proposals:
            if proposal.status not in _OPEN_PROPOSAL_STATUSES:
                continue
            key = proposal_dedupe_key(proposal)
            open_proposal_ids_by_key.setdefault(key, []).append(proposal.id)

    kept: list[ImprovementProposal] = []
    suppressed_against: list[str] = []
    for proposal in artifact.proposals:
        duplicate_ids = open_proposal_ids_by_key.get(proposal_dedupe_key(proposal))
        if duplicate_ids:
            suppressed_against.extend(duplicate_ids)
            continue
        kept.append(proposal)

    if len(kept) == len(artifact.proposals):
        return artifact

    deduped_ids = ", ".join(sorted(set(suppressed_against)))
    note = _append_note(
        artifact.notes,
        f"Suppressed duplicate proposals already covered by: {deduped_ids}.",
    )
    return artifact.model_copy(
        update={
            "proposals": kept,
            "notes": note,
        },
    )


def _resolve_history_cause(
    workspace_root: Path,
    artifact_id: str,
    path: Path,
    cause: ImprovementHistoryCause | None,
) -> ImprovementHistoryCause:
    """What to attribute this write to when the caller did not say.

    An artifact that has neither a file nor a history entry is being written for
    the first time, which only the collector does; anything else is an
    unattributed edit. Callers that know better (the approval API, the rollback
    service) pass an explicit cause.
    """
    if cause is not None:
        return cause
    if not path.exists() and not has_recorded_history(workspace_root, artifact_id):
        return ImprovementHistoryCause.COLLECTED
    return ImprovementHistoryCause.EDIT


@traces(SWR.SWR_1640)
def save_improvement_artifact(
    workspace_root: Path,
    artifact: ImprovementProposalArtifact,
    *,
    suppress_duplicates: bool = False,
    cause: ImprovementHistoryCause | None = None,
    history_retention: int = DEFAULT_HISTORY_RETENTION,
) -> Path:
    """Validate, atomically write, and append a history version for ``artifact``.

    The current-state file and its contract are unchanged, so every existing
    reader keeps working. ``cause`` records *why* this version exists; when it is
    omitted the write is inferred to be the collector's first write or an
    unattributed edit (SWR-1640).
    """
    _import_legacy_session_artifacts(workspace_root)
    validate_artifact(artifact)
    to_save = (
        suppress_duplicate_open_proposals(workspace_root, artifact)
        if suppress_duplicates
        else artifact
    )
    validate_artifact(to_save)
    target_dir = improvement_artifact_dir(workspace_root)
    target_dir.mkdir(parents=True, exist_ok=True)
    path = target_dir / f"{to_save.artifact_id}.json"
    resolved_cause = _resolve_history_cause(workspace_root, to_save.artifact_id, path, cause)
    # Migration is lazy and happens here, not on read: an artifact the previous
    # implementation wrote becomes version 1 only when something overwrites it.
    #
    # Both history steps are best-effort. The contract callers already relied on
    # is "this either persists the artifact or raises"; a workspace where only
    # the history sub-tree is unwritable must not turn a successful approval into
    # a failure the user then repeats.
    try:
        seed_legacy_version(workspace_root, to_save.artifact_id)
    except OSError:
        _log.warning(
            "Could not record the pre-existing state of improvement artifact %s",
            to_save.artifact_id,
            exc_info=True,
        )
    atomic_write(path, to_save.model_dump_json(indent=2))
    try:
        record_artifact_version(
            workspace_root,
            to_save,
            cause=resolved_cause,
            retention=history_retention,
        )
    except OSError:
        _log.warning(
            "Could not append a history version for improvement artifact %s",
            to_save.artifact_id,
            exc_info=True,
        )
    return path
