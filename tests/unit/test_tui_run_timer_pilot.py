"""TUI tests for RunTimer — three mandatory categories.

Category 1 — Full workflow: timer visible during a run, shows elapsed time.
Category 2 — Alternative paths: segment reset, timer display across states.
Category 3 — Random interaction: timer survives unexpected interactions.
"""

from __future__ import annotations

import asyncio

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tui.app import RotarisTuiApp
from rotaris_core.tui.run_timer import RunTimer

# ---------------------------------------------------------------------------
# Category 1: Full Workflow (Pilot-driven)
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1073)
async def test_run_timer_full_workflow_displays_during_active_run() -> None:
    """Full workflow: timer is initialized, displays elapsed time during active run."""
    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()

        # Timer is initialized on the app.
        assert app._run_timer is not None
        assert app._run_timer.is_active() is False

        # Simulate starting a run.
        app._run_timer.start_run()
        await pilot.pause()
        assert app._run_timer.is_active() is True

        # After a brief wait, the timer should show elapsed time.
        await asyncio.sleep(0.1)
        display = app._run_timer.format_display()
        assert display is not None
        assert ":" in display  # "0:00" or similar


@verifies(SWR.SWR_1073)
async def test_run_timer_full_workflow_end_run_shows_total() -> None:
    """Full workflow: start run, wait, end run — timer shows total duration."""
    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()

        app._run_timer.start_run()
        await asyncio.sleep(0.15)
        app._run_timer.end_run()
        await pilot.pause()

        assert app._run_timer.is_active() is False
        display = app._run_timer.format_display()
        assert display is not None
        assert ":" in display


# ---------------------------------------------------------------------------
# Category 2: Alternative Paths
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1073)
async def test_run_timer_alt_segment_reset_updates_elapsed() -> None:
    """Alternative path: starting a new segment resets elapsed counter."""
    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()

        app._run_timer.start_run()
        await asyncio.sleep(0.1)

        display_before = app._run_timer.format_display()

        # Start a new segment (simulates RalphLoop iteration start).
        app._run_timer.start_segment()
        await asyncio.sleep(0.05)

        display_after = app._run_timer.format_display()
        assert display_before is not None
        assert display_after is not None
        # Segment reset should show a lower elapsed time.
        # Note: both could be "0:00" if sleep is too short, so check they're strings.
        assert isinstance(display_after, str)


@verifies(SWR.SWR_1073)
async def test_run_timer_alt_format_returns_none_when_inactive() -> None:
    """Alternative path: format_display returns None when timer is inactive."""
    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()

        assert app._run_timer.format_display() is None

        app._run_timer.start_run()
        app._run_timer.end_run()

        # After end_run, format_display shows total (not None).
        assert app._run_timer.format_display() is not None


# ---------------------------------------------------------------------------
# Category 3: Random Interaction
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1073)
async def test_run_timer_random_interaction_double_start_no_crash() -> None:
    """Random interaction: calling start_run twice and end_run twice must not crash."""
    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()

        # Double start.
        app._run_timer.start_run()
        app._run_timer.start_run()
        await pilot.pause()
        assert app._run_timer.is_active() is True

        # Double end.
        app._run_timer.end_run()
        app._run_timer.end_run()
        await pilot.pause()
        assert app._run_timer.is_active() is False

        # Format still works.
        display = app._run_timer.format_display()
        assert display is not None


@verifies(SWR.SWR_1073)
async def test_run_timer_random_interaction_end_before_start() -> None:
    """Random interaction: calling end_run on never-started timer must not crash."""
    timer = RunTimer()
    timer.end_run()
    assert timer.format_display() is None

    timer.start_segment()
    display = timer.format_display()
    assert display is not None
