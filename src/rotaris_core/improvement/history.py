"""Versioned history of every improvement artifact mutation (SWR-1640).

The current state of an artifact keeps living where it always did — one JSON
file at ``<workspace>/.rotaris/improvement_artifacts/<artifact_id>.json`` — so
:func:`~rotaris_core.improvement.persistence.load_improvement_artifact` and its
callers are untouched by this module. What is new is that every write also
*appends* the state it wrote, under

``<workspace>/.rotaris/improvement_artifacts/history/<artifact_id>/<version>.json``

together with the version number, a UTC timestamp and what caused the write.
That turns "approve, edit, reject" from three destructive overwrites into four
retrievable states (the collected original plus one per mutation), which is what
makes the learning loop auditable rather than merely gated.

Three properties are load-bearing:

* **Lazy migration.** An artifact written before this module existed has no
  history directory. Reading its history synthesises version 1 from the file on
  disk with cause :attr:`ImprovementHistoryCause.UNKNOWN`; nothing is written
  until somebody actually mutates the artifact, so opening a workspace never
  rewrites files nobody touched.
* **Bounded growth.** :data:`DEFAULT_HISTORY_RETENTION` caps the versions kept
  per artifact. Pruning takes the oldest first *except* the very first version,
  so the initial collected state and the current state are the last two things a
  long-lived workspace can lose.
* **Atomicity.** Every version file goes through
  :func:`~rotaris_core.fs.atomic_write`, exactly like the current-state file.
"""

from __future__ import annotations

import datetime as dt
import logging
from enum import StrEnum
from typing import TYPE_CHECKING

from pydantic import BaseModel, Field

from rotaris_core.fs import atomic_write
from rotaris_core.improvement.proposals import ImprovementProposalArtifact
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from pathlib import Path

_log = logging.getLogger(__name__)

#: Sub-directory of the artifact store that holds every artifact's versions.
#: Artifact ids are ``impart_<8 base62>``, so this name can never collide with
#: one, and it is not a ``*.json`` file so the artifact listing skips it.
HISTORY_DIRNAME = "history"

#: How many versions are kept per artifact before pruning starts.
DEFAULT_HISTORY_RETENTION = 25

_VERSION_DIGITS = 6


@traces(SWR.SWR_1640)
class ImprovementHistoryCause(StrEnum):
    """Why a version of an improvement artifact was recorded."""

    #: The collector authored the artifact.
    COLLECTED = "collected"
    #: A proposal was approved, rejected or deferred.
    STATUS_CHANGE = "status_change"
    #: A proposal's free-text fields were edited.
    EDIT = "edit"
    #: A proposal was removed from the artifact.
    DELETE = "delete"
    #: A rollback point was recorded around an improvement run (SWR-1641).
    CHECKPOINT = "checkpoint"
    #: An applied improvement run was rolled back (SWR-1641).
    ROLLBACK = "rollback"
    #: The state a pre-SWR-1640 workspace already had on disk.
    UNKNOWN = "unknown"


@traces(SWR.SWR_1640)
class ImprovementArtifactVersion(BaseModel):
    """One recorded state of an artifact, with when and why it was written."""

    version: int = Field(ge=1, description="Monotonically increasing, starting at 1.")
    recorded_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.UTC))
    cause: ImprovementHistoryCause = ImprovementHistoryCause.UNKNOWN
    artifact: ImprovementProposalArtifact


@traces(SWR.SWR_1640)
def artifact_history_dir(workspace_root: Path, artifact_id: str) -> Path:
    """Directory holding every recorded version of one artifact."""
    from rotaris_core.improvement.persistence import improvement_artifact_dir

    return improvement_artifact_dir(workspace_root) / HISTORY_DIRNAME / artifact_id


def _version_path(workspace_root: Path, artifact_id: str, version: int) -> Path:
    directory = artifact_history_dir(workspace_root, artifact_id)
    return directory / f"{version:0{_VERSION_DIGITS}d}.json"


def _recorded_version_numbers(workspace_root: Path, artifact_id: str) -> list[int]:
    """Version numbers with a file on disk, ascending. Never raises."""
    directory = artifact_history_dir(workspace_root, artifact_id)
    if not directory.is_dir():
        return []
    numbers: list[int] = []
    for path in directory.glob("*.json"):
        if path.stem.isdigit():
            numbers.append(int(path.stem))
    return sorted(numbers)


def _read_version(path: Path) -> ImprovementArtifactVersion | None:
    try:
        return ImprovementArtifactVersion.model_validate_json(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        _log.warning("Skipping unreadable improvement artifact version %s", path, exc_info=True)
        return None


def _current_artifact(workspace_root: Path, artifact_id: str) -> ImprovementProposalArtifact | None:
    """The artifact's current on-disk state, or ``None`` when it is absent/broken."""
    from rotaris_core.improvement.persistence import improvement_artifact_dir

    path = improvement_artifact_dir(workspace_root) / f"{artifact_id}.json"
    try:
        return ImprovementProposalArtifact.model_validate_json(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


@traces(SWR.SWR_1640)
def has_recorded_history(workspace_root: Path, artifact_id: str) -> bool:
    """Whether any version was ever written for ``artifact_id``.

    ``False`` for a legacy artifact that predates this module, which is what
    :func:`seed_legacy_version` keys off.
    """
    return bool(_recorded_version_numbers(workspace_root, artifact_id))


@traces(SWR.SWR_1640)
def list_artifact_versions(
    workspace_root: Path,
    artifact_id: str,
) -> list[ImprovementArtifactVersion]:
    """Every recorded version of ``artifact_id``, newest first.

    A legacy artifact with no history directory yields a single synthesised
    version 1 carrying its current on-disk state and cause ``unknown``. Nothing
    is written: migration happens on the next real mutation, not on a read.
    """
    numbers = _recorded_version_numbers(workspace_root, artifact_id)
    if not numbers:
        current = _current_artifact(workspace_root, artifact_id)
        if current is None:
            return []
        return [
            ImprovementArtifactVersion(
                version=1,
                recorded_at=current.generated_at,
                cause=ImprovementHistoryCause.UNKNOWN,
                artifact=current,
            ),
        ]
    versions: list[ImprovementArtifactVersion] = []
    for number in numbers:
        version = _read_version(_version_path(workspace_root, artifact_id, number))
        if version is not None:
            versions.append(version)
    return sorted(versions, key=lambda entry: entry.version, reverse=True)


@traces(SWR.SWR_1640)
def load_artifact_version(
    workspace_root: Path,
    artifact_id: str,
    version: int,
) -> ImprovementArtifactVersion:
    """One specific recorded version.

    Raises:
        FileNotFoundError: no such version was recorded (or retention dropped it).
    """
    for entry in list_artifact_versions(workspace_root, artifact_id):
        if entry.version == version:
            return entry
    raise FileNotFoundError(
        f"improvement artifact {artifact_id!r} has no recorded version {version}",
    )


@traces(SWR.SWR_1640)
def latest_artifact_version(
    workspace_root: Path,
    artifact_id: str,
) -> ImprovementArtifactVersion | None:
    """The newest recorded version, or ``None`` when the artifact is unknown."""
    versions = list_artifact_versions(workspace_root, artifact_id)
    return versions[0] if versions else None


def _write_version(
    workspace_root: Path,
    artifact: ImprovementProposalArtifact,
    *,
    version: int,
    cause: ImprovementHistoryCause,
    recorded_at: dt.datetime | None = None,
) -> ImprovementArtifactVersion:
    entry = ImprovementArtifactVersion(
        version=version,
        recorded_at=recorded_at if recorded_at is not None else dt.datetime.now(dt.UTC),
        cause=cause,
        artifact=artifact,
    )
    directory = artifact_history_dir(workspace_root, artifact.artifact_id)
    directory.mkdir(parents=True, exist_ok=True)
    atomic_write(
        _version_path(workspace_root, artifact.artifact_id, version),
        entry.model_dump_json(indent=2),
    )
    return entry


@traces(SWR.SWR_1640)
def seed_legacy_version(workspace_root: Path, artifact_id: str) -> bool:
    """Record the pre-SWR-1640 on-disk state as version 1; report whether it did.

    Called immediately *before* the first history-aware overwrite of an artifact
    that already existed, so the state the previous implementation left behind
    becomes the first version instead of being lost. A no-op when history already
    exists or when the artifact has no readable file yet.
    """
    if has_recorded_history(workspace_root, artifact_id):
        return False
    current = _current_artifact(workspace_root, artifact_id)
    if current is None:
        return False
    _write_version(
        workspace_root,
        current,
        version=1,
        cause=ImprovementHistoryCause.UNKNOWN,
        recorded_at=current.generated_at,
    )
    return True


@traces(SWR.SWR_1640)
def record_artifact_version(
    workspace_root: Path,
    artifact: ImprovementProposalArtifact,
    *,
    cause: ImprovementHistoryCause,
    retention: int = DEFAULT_HISTORY_RETENTION,
) -> ImprovementArtifactVersion:
    """Append ``artifact`` as the next version and prune to ``retention``."""
    numbers = _recorded_version_numbers(workspace_root, artifact.artifact_id)
    next_version = (numbers[-1] + 1) if numbers else 1
    entry = _write_version(workspace_root, artifact, version=next_version, cause=cause)
    prune_artifact_history(workspace_root, artifact.artifact_id, keep=retention)
    return entry


@traces(SWR.SWR_1640)
def prune_artifact_history(workspace_root: Path, artifact_id: str, *, keep: int) -> int:
    """Drop the oldest versions past ``keep``; return how many went.

    The very first version is exempt while ``keep >= 2``: it holds the state the
    collector originally proposed, which is the one thing an audit of "what did
    this say when it was approved?" cannot do without. Everything else goes
    oldest-first, so the current state is the last to be dropped — and at
    ``keep == 1`` the current state is what survives, because a history whose
    only entry contradicts the file on disk would be worse than none.
    """
    numbers = _recorded_version_numbers(workspace_root, artifact_id)
    if keep <= 0:
        doomed = numbers
    elif keep == 1:
        doomed = numbers[:-1]
    else:
        surplus = max(len(numbers) - keep, 0)
        # numbers[0] is the initial state; start dropping one past it.
        doomed = numbers[1:][:surplus]
    for number in doomed:
        path = _version_path(workspace_root, artifact_id, number)
        try:
            path.unlink(missing_ok=True)
        except OSError:
            _log.warning("Could not prune improvement artifact version %s", path, exc_info=True)
    return len(doomed)
