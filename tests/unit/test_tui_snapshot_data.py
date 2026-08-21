"""Snapshot tests — data screens (MCP servers, improvement proposals).

Generate baselines with::

    pytest tests/unit/test_tui_snapshot_data.py --snapshot-update
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from pathlib import Path

from rotaris_core.reqtocode import SWR, verifies

from .snapshot_helpers import _SingleScreenApp, config_with_mcp, two_proposal_artifact

# -------- MCP Servers --------


@verifies(SWR.SWR_1717, SWR.SWR_1718, SWR.SWR_1719, SWR.SWR_1720, SWR.SWR_1721)
def test_snapshot_mcp_servers(snap_compare: Any, monkeypatch: Any, tmp_path: Path) -> None:
    """Baseline: MCP servers screen with toggled servers."""

    toggle_file = tmp_path / "mcp_toggles.json"
    toggle_file.write_text(json.dumps({"filesystem": True, "github": False}))
    monkeypatch.setattr("rotaris_core.tui.mcp_toggles._DEFAULT_TOGGLE_PATH", toggle_file)

    from rotaris_core.tui.mcp_toggles import MCPToggleStore
    from rotaris_core.tui.screens.mcp_servers import MCPServersScreen

    cfg = config_with_mcp(tmp_path)
    servers = [
        {
            "name": name,
            "source": cfg.mcp_server_sources.get(name, "default"),
            "type": server.type,
            "status": "active",
        }
        for name, server in cfg.mcp_servers.items()
    ]

    class _App(_SingleScreenApp):
        screen_type = MCPServersScreen
        screen_args = (servers, MCPToggleStore())

    assert snap_compare(_App())


# -------- Improvement Proposals --------


@verifies(SWR.SWR_1634)
def test_snapshot_improvement_proposals(snap_compare: Any, tmp_path: Path) -> None:
    """Baseline: improvement proposals with two pending proposals."""

    from rotaris_core.improvement.persistence import save_improvement_artifact
    from rotaris_core.tui.screens.improvement_proposals import ImprovementProposalsScreen

    artifact = two_proposal_artifact()
    save_improvement_artifact(tmp_path, artifact)

    class _App(_SingleScreenApp):
        screen_type = ImprovementProposalsScreen
        screen_args = (artifact, tmp_path)

    assert snap_compare(_App())
