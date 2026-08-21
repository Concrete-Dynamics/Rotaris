"""Snapshot tests — chat panel (transcript, tool events).

Generate baselines with::

    pytest tests/unit/test_tui_snapshot_chat.py --snapshot-update
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tui.app import RotarisTuiApp

from .snapshot_helpers import make_agent_session

if TYPE_CHECKING:
    from textual.pilot import Pilot


@verifies(SWR.SWR_1002, SWR.SWR_1219)
def test_snapshot_chat_agent_messages(snap_compare: Any) -> None:
    """Baseline: chat panel with agent transcript messages."""

    async def run_before(pilot: Pilot[Any]) -> None:
        await pilot.pause()
        pilot.app.current_session = make_agent_session()
        pilot.app.focused_agent_id = "orchestrator"
        pilot.app._refresh_widgets()
        await pilot.pause()

    assert snap_compare(RotarisTuiApp(), run_before=run_before)


@verifies(SWR.SWR_1085)
def test_snapshot_chat_tool_events_on(snap_compare: Any) -> None:
    """Baseline: chat panel with tool events toggled on."""

    async def run_before(pilot: Pilot[Any]) -> None:
        await pilot.pause()
        pilot.app.show_tool_events = True
        pilot.app.current_session = make_agent_session()
        pilot.app.focused_agent_id = "orchestrator"
        pilot.app._refresh_widgets()
        await pilot.pause()

    assert snap_compare(RotarisTuiApp(), run_before=run_before)
