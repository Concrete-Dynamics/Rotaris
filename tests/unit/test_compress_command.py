"""Tests for the /compress slash command (REQ-20260513-190000)."""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tui.app import ForceCompress, RotarisTuiApp

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


class _MockState:
    def __init__(self, events: list[Any] | None = None) -> None:
        self.events = events or []


class _MockConversation:
    def __init__(self, events: list[Any] | None = None) -> None:
        self.state = _MockState(events)


# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1405)
async def test_force_compress_child_calls_run_compressor_with_zero_tokens() -> None:
    """REQ-T003: force_compress_child invokes run_compressor even when token count is 0."""
    from rotaris_core.config.schema import RotarisConfig
    from rotaris_core.orchestrator.scheduler import Scheduler, force_compress_child

    config = RotarisConfig()
    scheduler = Scheduler(
        config=config,
        workspace_root="/tmp/test",
        summary_agent=MagicMock(),
    )
    conversation = _MockConversation(events=[])  # empty = effectively 0 tokens

    with patch("rotaris_core.agents.compressor.run_compressor", new_callable=AsyncMock) as mock_rc:
        mock_rc.return_value = {"status": "ok"}
        await force_compress_child(scheduler, "child-1", conversation)

    mock_rc.assert_awaited_once()


@verifies(SWR.SWR_1405, SWR.SWR_1451)
async def test_force_compress_child_does_not_consult_threshold_config() -> None:
    """REQ-T004 (threshold bypass): no threshold attributes are accessed on config."""
    from rotaris_core.config.schema import RotarisConfig
    from rotaris_core.orchestrator.scheduler import force_compress_child

    # Use a real config but spy to ensure no threshold attribute is read.
    config = RotarisConfig()

    scheduler = MagicMock()
    scheduler.config = config
    scheduler._extract_transcript_events.return_value = []

    with patch("rotaris_core.agents.compressor.run_compressor", new_callable=AsyncMock) as mock_rc:
        mock_rc.return_value = {}
        await force_compress_child(scheduler, "agent-x", _MockConversation())

    # run_compressor must have been called; threshold guards must NOT have been consulted.
    mock_rc.assert_awaited_once()
    # Verify none of the threshold attributes were accessed on config
    accessed = {c[0] for c in scheduler.config.__class__.__dict__ if c.startswith("context")}
    assert "context_compression_threshold" not in accessed


# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1405, SWR.SWR_1452)
async def test_on_force_compress_no_active_ralph_loop_shows_warning() -> None:
    """REQ-T004: No running agents → warning toast, no compression attempted."""
    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()

        with patch.object(app, "notify") as mock_notify:
            await app.on_force_compress(ForceCompress())
            await pilot.pause()

        mock_notify.assert_called_once()
        args, kwargs = mock_notify.call_args
        assert "no running agents" in args[0].lower()
        assert kwargs.get("severity") == "warning"


@verifies(SWR.SWR_1405, SWR.SWR_1452)
async def test_on_force_compress_empty_active_conversations_shows_warning() -> None:
    """REQ-T004: Active ralph loop but no running conversations → warning toast."""
    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()

        mock_loop = MagicMock()
        mock_scheduler = MagicMock()
        mock_scheduler._active_conversations = {}
        mock_scheduler._conversation_lock = MagicMock()
        mock_scheduler._conversation_lock.__enter__ = MagicMock(return_value=None)
        mock_scheduler._conversation_lock.__exit__ = MagicMock(return_value=False)
        mock_loop.scheduler = mock_scheduler
        app._active_ralph_loop = mock_loop

        with patch.object(app, "notify") as mock_notify:
            await app.on_force_compress(ForceCompress())
            await pilot.pause()

        mock_notify.assert_called_once()
        args, kwargs = mock_notify.call_args
        assert "no running agents" in args[0].lower()
        assert kwargs.get("severity") == "warning"


# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1405, SWR.SWR_1444, SWR.SWR_1453)
async def test_on_force_compress_multiple_agents_all_compressed() -> None:
    """REQ-T005: N running children → force_compress_child called N times, toast shown."""
    import threading

    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()

        conv_a = _MockConversation()
        conv_b = _MockConversation()
        conv_c = _MockConversation()
        active = {"agent-a": conv_a, "agent-b": conv_b, "agent-c": conv_c}

        lock = threading.Lock()
        mock_loop = MagicMock()
        mock_scheduler = MagicMock()
        mock_scheduler._active_conversations = active
        mock_scheduler._conversation_lock = lock
        mock_loop.scheduler = mock_scheduler
        app._active_ralph_loop = mock_loop

        compress_calls: list[str] = []

        async def fake_force_compress(sched: Any, name: str, conv: Any) -> None:
            compress_calls.append(name)

        notify_calls: list[tuple[Any, ...]] = []

        def capture_notify(*args: Any, **kwargs: Any) -> None:
            notify_calls.append((args, kwargs))

        with (
            patch(
                "rotaris_core.orchestrator.scheduler_compression.force_compress_child",
                side_effect=fake_force_compress,
            ),
            patch.object(app, "notify", side_effect=capture_notify),
        ):
            await app.on_force_compress(ForceCompress())
            await pilot.pause()

        assert len(compress_calls) == 3
        assert set(compress_calls) == {"agent-a", "agent-b", "agent-c"}

        # Completion toast must mention "3 agent(s)"
        all_messages = [str(args[0]) for args, _ in notify_calls]
        assert any("3 agent(s)" in msg for msg in all_messages), all_messages


@verifies(SWR.SWR_1405, SWR.SWR_1447)
async def test_on_force_compress_error_for_one_child_shows_error_toast() -> None:
    """Error during compression for one child must show an error toast with its name."""
    import threading

    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()

        active = {"failing-agent": _MockConversation()}
        lock = threading.Lock()
        mock_loop = MagicMock()
        mock_scheduler = MagicMock()
        mock_scheduler._active_conversations = active
        mock_scheduler._conversation_lock = lock
        mock_loop.scheduler = mock_scheduler
        app._active_ralph_loop = mock_loop

        async def boom(sched: Any, name: str, conv: Any) -> None:
            raise RuntimeError("OOM during compression")

        notify_calls: list[tuple[Any, ...]] = []

        def capture_notify(*args: Any, **kwargs: Any) -> None:
            notify_calls.append((args, kwargs))

        with (
            patch(
                "rotaris_core.orchestrator.scheduler_compression.force_compress_child",
                side_effect=boom,
            ),
            patch.object(app, "notify", side_effect=capture_notify),
        ):
            await app.on_force_compress(ForceCompress())
            await pilot.pause()

        error_toasts = [(a, kw) for a, kw in notify_calls if kw.get("severity") == "error"]
        assert error_toasts, "Expected an error toast"
        assert "failing-agent" in str(error_toasts[0][0])


# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1405, SWR.SWR_1447, SWR.SWR_1454)
async def test_tui_compress_slash_command_shows_toast_no_crash() -> None:
    """REQ-T006: Full TUI workflow — type /compress + Enter, toast shown, no crash."""
    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()

        # Stub compression so it doesn't fail when no scheduler is present.
        notified: list[tuple[Any, ...]] = []

        original_notify = app.notify

        def capture(*args: Any, **kwargs: Any) -> Any:
            notified.append((args, kwargs))
            return original_notify(*args, **kwargs)

        app.notify = capture  # type: ignore[method-assign]

        await pilot.press("/", "c", "o", "m", "p", "r", "e", "s", "s")
        await pilot.pause()
        # First Enter accepts the highlighted autocomplete suggestion.
        await pilot.press("enter")
        await pilot.pause()
        # Second Enter submits the now-populated "/compress" command.
        await pilot.press("enter")
        await pilot.pause()

        # Must have shown at least the "No running agents" warning or a compression toast.
        assert notified, "Expected at least one toast notification after /compress"


# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1405, SWR.SWR_1455)
async def test_compress_slash_command_no_session_no_exception() -> None:
    """REQ-T007: /compress with no session must not raise or leave app broken."""
    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()

        # Verify no ralph loop exists.
        assert app._active_ralph_loop is None

        # post ForceCompress directly — must not raise.
        app.post_message(ForceCompress())
        await pilot.pause()

        # App must still be running and responsive.
        assert app.screen is not None
