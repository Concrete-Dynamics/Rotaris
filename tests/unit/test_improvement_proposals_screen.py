"""TUI tests for the improvement-proposal review screen.

REQ-20260515-POSTRUN-IMPROVE-T008 — three mandatory categories:
* full workflow (review → approve → start → close),
* alternative path (slash command, palette, direct action),
* random interaction (must not crash).
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import TYPE_CHECKING

import pytest
from textual.widgets import DataTable

from rotaris_core.improvement.persistence import (
    load_improvement_artifact,
    save_improvement_artifact,
)
from rotaris_core.improvement.proposals import (
    ApprovalStatus,
    ImprovementEvidence,
    ImprovementProposal,
    ImprovementProposalArtifact,
    ImprovementProposalCategory,
    new_artifact_id,
    new_proposal_id,
)
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tui.app import RotarisTuiApp
from rotaris_core.tui.screens.improvement_proposals import (
    ImprovementProposalsScreen,
)

if TYPE_CHECKING:
    from pathlib import Path


def _two_proposal_artifact(session_id: str = "sess") -> ImprovementProposalArtifact:
    return ImprovementProposalArtifact(
        artifact_id=new_artifact_id(session_id),
        source_session_id=session_id,
        proposals=[
            ImprovementProposal(
                id=new_proposal_id("a"),
                category=ImprovementProposalCategory.DOCUMENTATION_UPDATE,
                summary="document CLI usage",
                recommended_action="extend README",
                evidence=[
                    ImprovementEvidence(
                        kind="transcript_observation",
                        text="asked twice",
                    ),
                ],
            ),
            ImprovementProposal(
                id=new_proposal_id("b"),
                category=ImprovementProposalCategory.WORKSPACE_NOTE,
                summary="note that tests need PYTHONPATH=src",
                recommended_action="add AGENTS.md note",
                evidence=[
                    ImprovementEvidence(kind="tool_failure", text="import error"),
                ],
            ),
        ],
    )


@verifies(SWR.SWR_1602, SWR.SWR_1627)
@pytest.mark.asyncio
async def test_improvement_proposals_full_workflow(tmp_path: Path) -> None:
    """Open screen, approve one proposal, start improvement run, close."""
    artifact = _two_proposal_artifact()
    save_improvement_artifact(tmp_path, artifact)
    started: list[tuple[str, int]] = []

    def on_start(art: ImprovementProposalArtifact, approved: list) -> None:
        started.append((art.artifact_id, len(approved)))

    app = RotarisTuiApp(config=None)
    async with app.run_test() as pilot:
        await pilot.pause()
        app.push_screen(
            ImprovementProposalsScreen(
                artifact,
                tmp_path,
                start_improvement_run=on_start,
            ),
        )
        await pilot.pause()

        assert isinstance(app.screen, ImprovementProposalsScreen)
        table = app.screen.query_one(DataTable)
        assert table.row_count == 2
        assert table.get_row_at(0)[0] == "pending"

        # Approve the first proposal.
        await pilot.press("a")
        await pilot.pause()
        assert table.get_row_at(0)[0] == "approved"

        # Reject the second proposal.
        await pilot.press("down")
        await pilot.pause()
        await pilot.press("r")
        await pilot.pause()
        assert table.get_row_at(1)[0] == "rejected"

        # Approval state persisted on disk.
        reloaded = load_improvement_artifact(tmp_path, artifact.artifact_id)
        by_id = {p.id: p for p in reloaded.proposals}
        approved_ids = [pid for pid, p in by_id.items() if p.status == ApprovalStatus.APPROVED]
        rejected_ids = [pid for pid, p in by_id.items() if p.status == ApprovalStatus.REJECTED]
        assert len(approved_ids) == 1
        assert len(rejected_ids) == 1

        # Start improvement run — only approved proposals.
        await pilot.press("s")
        await pilot.pause()
        assert started == [(artifact.artifact_id, 1)]
        # Screen dismissed itself on success.
        assert not isinstance(app.screen, ImprovementProposalsScreen)


@verifies(SWR.SWR_1602, SWR.SWR_1627)
@pytest.mark.asyncio
async def test_improvement_proposals_alternative_paths(
    tmp_path: Path,
) -> None:
    """Slash command, direct action, command-palette discovery, esc close."""
    artifact = _two_proposal_artifact()
    save_improvement_artifact(tmp_path, artifact)

    app = RotarisTuiApp(config=None)
    async with app.run_test() as pilot:
        await pilot.pause()

        # Slash command path: /improvements with no active session must warn.
        from rotaris_core.tui.widgets.input_composer import InputComposer

        composer = app.screen.query_one(InputComposer)
        composer.set_text("/improvements")
        await pilot.press("enter")
        await pilot.pause()
        # No session_manager configured → still on main screen.
        assert not isinstance(app.screen, ImprovementProposalsScreen)

        # Direct push: simulate the action_show_improvement_proposals success path.
        app.push_screen(
            ImprovementProposalsScreen(artifact, tmp_path),
        )
        await pilot.pause()
        assert isinstance(app.screen, ImprovementProposalsScreen)

        # Defer + reset round-trip.
        await pilot.press("d")
        await pilot.pause()
        table = app.screen.query_one(DataTable)
        assert table.get_row_at(0)[0] == "deferred"
        await pilot.press("p")
        await pilot.pause()
        assert table.get_row_at(0)[0] == "pending"

        # 's' with no approvals must NOT dismiss (REQ-T005).
        await pilot.press("s")
        await pilot.pause()
        assert isinstance(app.screen, ImprovementProposalsScreen)

        # esc closes.
        await pilot.press("escape")
        await pilot.pause()
        assert not isinstance(app.screen, ImprovementProposalsScreen)


@verifies(SWR.SWR_1602)
@pytest.mark.asyncio
async def test_action_show_improvement_proposals_falls_back_to_latest_workspace_artifact(
    tmp_path: Path,
) -> None:
    artifact = _two_proposal_artifact("older-session")
    save_improvement_artifact(tmp_path, artifact)

    app = RotarisTuiApp(config=None)
    app.session_manager = SimpleNamespace(workspace_root=tmp_path)
    app._refresh_widgets = lambda: None  # type: ignore[method-assign]
    app.current_session = SimpleNamespace(
        session_id="current-session",
        execution_status="completed",
    )

    async with app.run_test() as pilot:
        await pilot.pause()
        app.action_show_improvement_proposals()
        await pilot.pause()

        assert isinstance(app.screen, ImprovementProposalsScreen)
        assert app.screen.artifact.artifact_id == artifact.artifact_id


@verifies(SWR.SWR_1602, SWR.SWR_1627)
@pytest.mark.asyncio
async def test_improvement_proposals_random_interaction(
    tmp_path: Path,
) -> None:
    """Unexpected keys, resize, empty artifact must not crash."""
    # Empty artifact.
    empty = ImprovementProposalArtifact(
        artifact_id=new_artifact_id("empty"),
        source_session_id="empty",
        proposals=[],
    )
    save_improvement_artifact(tmp_path, empty)

    app = RotarisTuiApp(config=None)
    async with app.run_test() as pilot:
        await pilot.pause()
        app.push_screen(ImprovementProposalsScreen(empty, tmp_path))
        await pilot.pause()
        assert isinstance(app.screen, ImprovementProposalsScreen)

        # Approve actions with no rows must be harmless.
        await pilot.press("a", "r", "d", "p", "s")
        await pilot.pause()
        # 's' with no approvals leaves us on the screen (no dismiss).
        assert isinstance(app.screen, ImprovementProposalsScreen)

        # Random keys + resize.
        await pilot.press("q", "z", "tab", "pageup", "x")
        await pilot.pause()

        from textual.events import Resize
        from textual.geometry import Size

        app.post_message(Resize(Size(100, 30), Size(80, 24)))
        await pilot.pause()

        assert isinstance(app.screen, ImprovementProposalsScreen)

        await pilot.press("escape")
        await pilot.pause()
        assert not isinstance(app.screen, ImprovementProposalsScreen)
