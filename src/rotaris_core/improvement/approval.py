"""Approval state mutations for improvement proposals.

Proposal approval is persisted on the artifact itself: each proposal's
``status`` field is rewritten in place via an atomic JSON write through
:func:`~rotaris_core.improvement.persistence.save_improvement_artifact`. That
guarantees state survives session reload (REQ-20260515-POSTRUN-IMPROVE-008,
REQ-20260515-POSTRUN-IMPROVE-T004).

Direct ``ImprovementProposal`` Pydantic mutation is intentionally avoided in
favour of a small, focused API surface so callers (CLI prompts, future TUI
review screen, tests) all funnel through the same validation path.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from rotaris_core.improvement.history import ImprovementHistoryCause
from rotaris_core.improvement.persistence import (
    load_improvement_artifact,
    save_improvement_artifact,
)
from rotaris_core.improvement.proposals import (
    ApprovalStatus,
    ImprovementProposal,
    ImprovementProposalArtifact,
)
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from pathlib import Path


@traces(SWR.SWR_1608, SWR.SWR_1618, SWR.SWR_1640)
def set_proposal_status(
    workspace_root: Path,
    artifact_id: str,
    proposal_id: str,
    status: ApprovalStatus,
) -> ImprovementProposalArtifact:
    """Mutate a single proposal's approval ``status`` and persist atomically.

    Returns the updated artifact. Raises ``KeyError`` if ``proposal_id`` is
    not present in the artifact.
    """
    artifact = load_improvement_artifact(workspace_root, artifact_id)
    updated_proposals: list[ImprovementProposal] = []
    found = False
    for proposal in artifact.proposals:
        if proposal.id == proposal_id:
            found = True
            updated_proposals.append(
                proposal.model_copy(update={"status": status}),
            )
        else:
            updated_proposals.append(proposal)
    if not found:
        raise KeyError(
            f"proposal {proposal_id!r} not found in artifact {artifact_id!r}",
        )
    updated = artifact.model_copy(update={"proposals": updated_proposals})
    save_improvement_artifact(
        workspace_root,
        updated,
        cause=ImprovementHistoryCause.STATUS_CHANGE,
    )
    return updated


def approved_proposals(
    artifact: ImprovementProposalArtifact,
) -> list[ImprovementProposal]:
    """Return only proposals currently marked ``APPROVED``."""
    return [p for p in artifact.proposals if p.status == ApprovalStatus.APPROVED]


@traces(SWR.SWR_2123, SWR.SWR_1640)
def update_proposal(
    workspace_root: Path,
    artifact_id: str,
    proposal_id: str,
    *,
    summary: str,
    recommended_action: str,
) -> ImprovementProposalArtifact:
    """Edit a proposal's user-editable free-text fields and persist atomically.

    Only ``summary``/``recommended_action`` are editable here; evidence and
    category remain collector-authored. Raises ``KeyError`` if ``proposal_id``
    is not present, ``ValueError`` if the edit fails validation (e.g. blank text).
    """
    artifact = load_improvement_artifact(workspace_root, artifact_id)
    updated_proposals: list[ImprovementProposal] = []
    found = False
    for proposal in artifact.proposals:
        if proposal.id == proposal_id:
            found = True
            updated_proposals.append(
                proposal.model_copy(
                    update={"summary": summary, "recommended_action": recommended_action},
                ),
            )
        else:
            updated_proposals.append(proposal)
    if not found:
        raise KeyError(
            f"proposal {proposal_id!r} not found in artifact {artifact_id!r}",
        )
    updated = artifact.model_copy(update={"proposals": updated_proposals})
    save_improvement_artifact(workspace_root, updated, cause=ImprovementHistoryCause.EDIT)
    return updated


@traces(SWR.SWR_2123, SWR.SWR_1640)
def delete_proposal(
    workspace_root: Path,
    artifact_id: str,
    proposal_id: str,
) -> ImprovementProposalArtifact:
    """Remove a single proposal from its artifact and persist atomically.

    Returns the updated artifact. Raises ``KeyError`` if ``proposal_id`` is
    not present in the artifact.
    """
    artifact = load_improvement_artifact(workspace_root, artifact_id)
    remaining = [p for p in artifact.proposals if p.id != proposal_id]
    if len(remaining) == len(artifact.proposals):
        raise KeyError(
            f"proposal {proposal_id!r} not found in artifact {artifact_id!r}",
        )
    updated = artifact.model_copy(update={"proposals": remaining})
    save_improvement_artifact(workspace_root, updated, cause=ImprovementHistoryCause.DELETE)
    return updated
