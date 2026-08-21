"""Modal screen for reviewing and approving improvement proposals.

Implements REQ-20260515-POSTRUN-IMPROVE-T008: surface the post-run
:class:`ImprovementProposalArtifact` so the user can approve, reject, or
defer individual proposals and optionally kick off an ``improvement_run``.

The screen is intentionally minimal — it edits the on-disk artifact via
:func:`rotaris_core.improvement.approval.set_proposal_status`, so approval
state survives reload (REQ-T004). Starting the improvement run is delegated
to a callable injected by the caller, keeping this screen free of run
machinery for testability.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from textual.binding import Binding
from textual.containers import Vertical
from textual.screen import ModalScreen
from textual.widgets import DataTable, Static

from rotaris_core.improvement.approval import (
    approved_proposals,
    set_proposal_status,
)
from rotaris_core.improvement.persistence import load_improvement_artifact
from rotaris_core.improvement.proposals import ApprovalStatus
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Callable
    from pathlib import Path

    from textual.app import ComposeResult

    from rotaris_core.improvement.proposals import (
        ImprovementProposal,
        ImprovementProposalArtifact,
    )


_STATUS_LABEL = {
    ApprovalStatus.PENDING_REVIEW: "pending",
    ApprovalStatus.APPROVED: "approved",
    ApprovalStatus.REJECTED: "rejected",
    ApprovalStatus.DEFERRED: "deferred",
}


@traces(SWR.SWR_1634)
class ImprovementProposalsScreen(ModalScreen[None]):
    """Review/approve proposals for a single :class:`ImprovementProposalArtifact`."""

    BINDINGS = [
        Binding("a", "approve", "Approve"),
        Binding("r", "reject", "Reject"),
        Binding("d", "defer", "Defer"),
        Binding("p", "reset", "Pending"),
        Binding("s", "start_improvement_run", "Start"),
        Binding("escape", "dismiss_screen", "Close"),
    ]

    def __init__(
        self,
        artifact: ImprovementProposalArtifact,
        workspace_root: Path,
        *,
        start_improvement_run: Callable[
            [ImprovementProposalArtifact, list[ImprovementProposal]],
            None,
        ]
        | None = None,
    ) -> None:
        super().__init__()
        self._artifact = artifact
        self._workspace_root = workspace_root
        self._start_callback = start_improvement_run

    @property
    def artifact(self) -> ImprovementProposalArtifact:
        return self._artifact

    def compose(self) -> ComposeResult:
        header = (
            "Improvement proposals "
            f"(session {self._artifact.source_session_id}, "
            f"artifact {self._artifact.artifact_id}) "
            "— a:approve  r:reject  d:defer  p:pending  s:start  esc:close"
        )
        with Vertical(id="improvement-proposals-container"):
            yield Static(
                header,
                id="improvement-proposals-title",
            )
            if not self._artifact.proposals:
                yield Static(
                    "No proposals in this artifact.",
                    id="improvement-proposals-empty",
                )
            else:
                yield DataTable(
                    id="improvement-proposals-table",
                    cursor_type="row",
                )

    def on_mount(self) -> None:
        if not self._artifact.proposals:
            return
        table = self.query_one("#improvement-proposals-table", DataTable)
        table.add_column("Status", key="status")
        table.add_column("Category", key="category")
        table.add_column("Summary", key="summary")
        for proposal in self._artifact.proposals:
            table.add_row(
                _STATUS_LABEL[proposal.status],
                proposal.category.value,
                proposal.summary,
                key=proposal.id,
            )
        if table.row_count > 0:
            table.focus()

    # ------------------------------------------------------------------ helpers

    def _selected_proposal_id(self) -> str | None:
        try:
            table = self.query_one("#improvement-proposals-table", DataTable)
        except Exception:  # noqa: BLE001 — empty artifact: table absent.
            return None
        if table.cursor_row is None:
            return None
        row_key = table.coordinate_to_cell_key(table.cursor_coordinate).row_key
        return None if row_key.value is None else str(row_key.value)

    def _apply_status(self, status: ApprovalStatus) -> None:
        proposal_id = self._selected_proposal_id()
        if proposal_id is None:
            return
        try:
            self._artifact = set_proposal_status(
                self._workspace_root,
                self._artifact.artifact_id,
                proposal_id,
                status,
            )
        except KeyError:
            # Artifact was edited externally — reload and notify.
            self._artifact = load_improvement_artifact(
                self._workspace_root,
                self._artifact.artifact_id,
            )
            self.notify(
                f"Proposal {proposal_id} no longer exists.",
                severity="warning",
            )
            return
        except OSError as exc:
            self.notify(
                f"Failed to persist approval: {exc}",
                severity="error",
            )
            return
        table = self.query_one("#improvement-proposals-table", DataTable)
        table.update_cell(proposal_id, "status", _STATUS_LABEL[status])
        self.notify(
            f"Proposal {proposal_id} marked {_STATUS_LABEL[status]}.",
            severity="information",
        )

    # ------------------------------------------------------------------ actions

    def action_approve(self) -> None:
        self._apply_status(ApprovalStatus.APPROVED)

    def action_reject(self) -> None:
        self._apply_status(ApprovalStatus.REJECTED)

    def action_defer(self) -> None:
        self._apply_status(ApprovalStatus.DEFERRED)

    def action_reset(self) -> None:
        self._apply_status(ApprovalStatus.PENDING_REVIEW)

    def action_start_improvement_run(self) -> None:
        approved = approved_proposals(self._artifact)
        if not approved:
            # REQ-T005: improvement run must not start without approvals.
            self.notify(
                "No proposals approved — nothing to do.",
                severity="warning",
            )
            return
        if self._start_callback is None:
            self.notify(
                f"Approved {len(approved)} proposal(s). "
                "Run the Improver via the CLI to apply them.",
                severity="information",
            )
            self.dismiss(None)
            return
        try:
            self._start_callback(self._artifact, approved)
        except Exception as exc:  # noqa: BLE001 — surface to user, no crash.
            self.notify(
                f"Failed to start improvement run: {exc}",
                severity="error",
            )
            return
        self.notify(
            f"Started improvement run with {len(approved)} proposal(s).",
            severity="information",
        )
        self.dismiss(None)

    def action_dismiss_screen(self) -> None:
        self.dismiss(None)
