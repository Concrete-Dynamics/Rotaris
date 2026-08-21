"""Rendering improvement artifacts, their history and a rollback preview (SWR-1642).

The ``improvements`` command group is the only surface these three requirements
have, so the text it prints lives here rather than inside the Typer callbacks —
the same reason
:mod:`rotaris_core.session.checkpoint_restore` owns ``format_checkpoint_rows``.
A future Rotaris view renders the same lines instead of inventing its own.
"""

from __future__ import annotations

from collections import Counter
from typing import TYPE_CHECKING

from rotaris_core.improvement.proposals import ApprovalStatus
from rotaris_core.reqtocode import SWR, traces
from rotaris_core.session.checkpoint_restore import restore_action

if TYPE_CHECKING:
    from collections.abc import Sequence

    from rotaris_core.improvement.history import ImprovementArtifactVersion
    from rotaris_core.improvement.proposals import ImprovementProposalArtifact
    from rotaris_core.improvement.rollback import ImprovementRollbackPreview

__all__ = [
    "format_artifact_rows",
    "format_history_rows",
    "format_proposal_rows",
    "format_rollback_preview_lines",
    "format_status_counts",
]

_ARTIFACT_HEADER = f"{'ARTIFACT':<18}  {'GENERATED':<25}  {'ROLLBACK':<8}  PROPOSALS"
_HISTORY_HEADER = f"{'VER':>4}  {'RECORDED':<25}  CAUSE"
_PROPOSAL_HEADER = f"{'PROPOSAL':<14}  {'STATUS':<15}  {'RISK':<7}  SUMMARY"


@traces(SWR.SWR_1642)
def format_status_counts(artifact: ImprovementProposalArtifact) -> str:
    """``"approved=1 pending_review=2"`` for one artifact, or ``"none"``."""
    counts = Counter(proposal.status for proposal in artifact.proposals)
    if not counts:
        return "none"
    return " ".join(
        f"{status.value}={counts[status]}" for status in ApprovalStatus if counts.get(status)
    )


@traces(SWR.SWR_1642)
def format_artifact_rows(artifacts: Sequence[ImprovementProposalArtifact]) -> tuple[str, ...]:
    """A header plus one row per artifact, in the order given (newest first)."""
    rows = [_ARTIFACT_HEADER]
    for artifact in artifacts:
        generated = artifact.generated_at.replace(microsecond=0).isoformat()
        rollback = "yes" if artifact.rollback_point is not None else "no"
        rows.append(
            f"{artifact.artifact_id:<18}  {generated:<25}  {rollback:<8}  "
            f"{format_status_counts(artifact)}",
        )
    return tuple(rows)


@traces(SWR.SWR_1642)
def format_proposal_rows(artifact: ImprovementProposalArtifact) -> tuple[str, ...]:
    """A header plus one row per proposal of ``artifact``."""
    rows = [_PROPOSAL_HEADER]
    for proposal in artifact.proposals:
        rows.append(
            f"{proposal.id:<14}  {proposal.status.value:<15}  {proposal.risk.value:<7}  "
            f"{proposal.summary}",
        )
    return tuple(rows)


@traces(SWR.SWR_1642)
def format_history_rows(versions: Sequence[ImprovementArtifactVersion]) -> tuple[str, ...]:
    """A header plus one row per recorded version, in the order given."""
    rows = [_HISTORY_HEADER]
    for version in versions:
        recorded = version.recorded_at.replace(microsecond=0).isoformat()
        rows.append(f"{version.version:>4}  {recorded:<25}  {version.cause.value}")
    return tuple(rows)


@traces(SWR.SWR_1642)
def format_rollback_preview_lines(preview: ImprovementRollbackPreview) -> tuple[str, ...]:
    """The confirmation text for ``preview``: what changes, and what is in the way.

    Every path carries the verb a rollback would apply to it, via
    :func:`~rotaris_core.session.checkpoint_restore.restore_action`, so an added
    file reads as ``delete`` rather than as the engine's checkpoint-relative
    ``A``.
    """
    lines: list[str] = []
    if preview.entries:
        lines.append(
            f"Rolling back improvement {preview.artifact_id} would change "
            f"{len(preview.entries)} file(s):",
        )
        lines.extend(
            f"  {restore_action(entry.status):<9} {entry.path}"
            for entry in sorted(preview.entries, key=lambda item: item.path)
        )
    elif not preview.blocked_reason:
        lines.append(f"Rolling back improvement {preview.artifact_id} would change nothing.")
    if preview.dirty_paths:
        lines.append(
            f"Warning: {len(preview.dirty_paths)} change(s) made since the improvement "
            f"run would be overwritten:",
        )
        lines.extend(f"  {path}" for path in preview.dirty_paths)
    return tuple(lines)
