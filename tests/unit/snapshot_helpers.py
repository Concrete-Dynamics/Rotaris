"""Shared helpers for snapshot (visual regression) tests.

Import these in individual ``test_tui_snapshot_*.py`` files to
avoid duplicating fixtures.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any
from unittest.mock import MagicMock

from textual.app import App, ComposeResult

from rotaris_core.config.schema import MCPServerConfig, RotarisConfig
from rotaris_core.improvement.proposals import (
    ImprovementEvidence,
    ImprovementProposal,
    ImprovementProposalArtifact,
    ImprovementProposalCategory,
)

if TYPE_CHECKING:
    from pathlib import Path


class _SingleScreenApp(App[None]):
    """Minimal app that pushes a single screen in on_mount."""

    screen_type: Any | None = None
    screen_args: tuple[Any, ...] = ()
    screen_kwargs: dict[str, Any] = {}

    def compose(self) -> ComposeResult:
        yield from ()

    def on_mount(self) -> None:
        if self.screen_type is not None:
            self.push_screen(self.screen_type(*self.screen_args, **self.screen_kwargs))


def make_agent_session(agents: list[dict[str, Any]] | None = None) -> MagicMock:
    """Return a mock session with 3 agents and transcript events."""
    session = MagicMock()
    session.token_usage = {"total_tokens": 0}
    session.child_states = agents or [
        {
            "name": "orchestrator",
            "canonical_name": "orchestrator",
            "persona": "orchestrator",
            "state": "running",
            "parent_agent_id": "",
        },
        {
            "name": "impl",
            "canonical_name": "orchestrator.impl",
            "persona": "coding-agent",
            "state": "running",
            "parent_agent_id": "orchestrator",
        },
        {
            "name": "test",
            "canonical_name": "orchestrator.test",
            "persona": "tester",
            "state": "completed",
            "parent_agent_id": "orchestrator",
        },
    ]
    session.transcript_events = [
        {
            "role": "agent",
            "name": "orchestrator",
            "content": "Starting the task. Delegating implementation to coding-agent.",
        },
        {
            "role": "agent",
            "name": "impl",
            "content": "Created `main.py` with the requested function.",
        },
        {
            "role": "agent",
            "name": "test",
            "content": "All tests pass. No issues found.",
        },
    ]
    session.todo_state = None
    session.agent_todo_state = None
    session.execution_status = "completed"
    return session


def config_with_mcp(tmp_path: Path) -> RotarisConfig:
    """Return a RotarisConfig with two MCP servers."""
    cfg = RotarisConfig(workspace_root=tmp_path)
    cfg.mcp_servers = {
        "filesystem": MCPServerConfig(
            type="stdio",
            command="npx",
            args=["-y", "@modelcontextprotocol/server-filesystem", str(tmp_path)],
        ),
        "github": MCPServerConfig(
            type="stdio", command="npx", args=["-y", "@modelcontextprotocol/server-github"]
        ),
    }
    cfg.mcp_server_sources = {"filesystem": "discovered-project", "github": "discovered-user"}
    return cfg


def two_proposal_artifact(session_id: str = "snap-test") -> ImprovementProposalArtifact:
    """Return an ImprovementProposalArtifact with two pending proposals."""
    return ImprovementProposalArtifact(
        artifact_id="impart_snapshot",
        source_session_id=session_id,
        proposals=[
            ImprovementProposal(
                id="imp_snapshot_a",
                category=ImprovementProposalCategory.DOCUMENTATION_UPDATE,
                summary="Add CLI usage docs to README",
                recommended_action="Extend README.md with example commands",
                evidence=[ImprovementEvidence(kind="transcript_observation", text="asked twice")],
            ),
            ImprovementProposal(
                id="imp_snapshot_b",
                category=ImprovementProposalCategory.WORKSPACE_NOTE,
                summary="Tests need PYTHONPATH=src",
                recommended_action="Add AGENTS.md note about PYTHONPATH",
                evidence=[ImprovementEvidence(kind="tool_failure", text="import error")],
            ),
        ],
    )
