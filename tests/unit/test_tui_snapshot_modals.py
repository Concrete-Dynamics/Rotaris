"""Snapshot tests — modal screens (session picker, quota wait, command palette).

Generate baselines with::

    pytest tests/unit/test_tui_snapshot_modals.py --snapshot-update
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any
from unittest.mock import MagicMock

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tui.app import RotarisTuiApp

from .snapshot_helpers import _SingleScreenApp

if TYPE_CHECKING:
    from textual.pilot import Pilot


# -------- Session Picker --------


@verifies(SWR.SWR_1028, SWR.SWR_1126)
def test_snapshot_session_picker(snap_compare: Any) -> None:
    """Baseline: session picker modal with multiple sessions."""

    from rotaris_core.tui.screens.session_picker import SessionPickerScreen

    mgr = MagicMock()
    mgr.list_sessions.return_value = [
        {"session_id": "a1b2c3", "created_at": "2026-06-01 10:00", "execution_status": "completed"},
        {"session_id": "d4e5f6", "created_at": "2026-06-05 14:30", "execution_status": "running"},
        {"session_id": "g7h8i9", "created_at": "2026-06-04 09:15", "execution_status": "failed"},
    ]

    class _App(_SingleScreenApp):
        screen_type = SessionPickerScreen
        screen_args = (mgr,)

    assert snap_compare(_App())


# -------- Quota Wait --------


@verifies(SWR.SWR_903)
def test_snapshot_quota_wait(snap_compare: Any) -> None:
    """Baseline: quota wait screen for API rate limit."""

    from rotaris_core.tui.screens.modals import QuotaWaitScreen

    async def run_before(pilot: Pilot[Any]) -> None:
        await pilot.pause()
        pilot.app.push_screen(
            QuotaWaitScreen(
                title="GitHub Copilot — rate limit reached",
                body="Model gpt-5.2-codex is rate-limited. Estimated wait: 60 seconds.",
                allow_auto_resume=True,
            )
        )
        await pilot.pause()

    assert snap_compare(RotarisTuiApp(), run_before=run_before)


# -------- Command Palette --------


@verifies(SWR.SWR_1169)
def test_snapshot_command_palette(snap_compare: Any) -> None:
    """Baseline: command palette open on the main screen."""

    async def run_before(pilot: Pilot[Any]) -> None:
        await pilot.pause()
        pilot.app.action_command_palette()
        await pilot.pause()

    assert snap_compare(RotarisTuiApp(), run_before=run_before)
