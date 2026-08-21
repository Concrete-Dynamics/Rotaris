from __future__ import annotations

from types import SimpleNamespace

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tui.app_runtime import upsert_tool_transcript_event


@verifies(SWR.SWR_1084, SWR.SWR_1218)
def test_successful_tool_result_replaces_started_tool_call_content() -> None:
    app = SimpleNamespace(
        _open_tool_events={},
        _render_state=SimpleNamespace(chat_needs_full_rebuild=False),
    )
    transcript_events: list[dict[str, object]] = []
    event = SimpleNamespace(tool_call_id="call-1", tool_name="grep")

    started = upsert_tool_transcript_event(
        app,
        transcript_events,
        "worker",
        event,
        {
            "activity_phase": "tool",
            "feed_icon": "ANIMATED_TOOL",
            "feed_text": "grep: searching docs",
        },
    )
    completed = upsert_tool_transcript_event(
        app,
        transcript_events,
        "worker",
        event,
        {
            "activity_phase": "completed",
            "feed_icon": "✓",
            "feed_text": "docs/architecture.md:42: matched line",
            "feed_replaces_content": "true",
        },
    )

    assert completed is started
    assert len(transcript_events) == 1
    assert transcript_events[0]["phase"] == "completed"
    assert transcript_events[0]["content"] == "docs/architecture.md:42: matched line"
    assert app._render_state.chat_needs_full_rebuild is True


@verifies(SWR.SWR_1084, SWR.SWR_1218)
def test_successful_tool_completion_without_result_keeps_started_content() -> None:
    app = SimpleNamespace(
        _open_tool_events={},
        _render_state=SimpleNamespace(chat_needs_full_rebuild=False),
    )
    transcript_events: list[dict[str, object]] = []
    event = SimpleNamespace(tool_call_id="call-1", tool_name="grep")

    upsert_tool_transcript_event(
        app,
        transcript_events,
        "worker",
        event,
        {
            "activity_phase": "tool",
            "feed_icon": "ANIMATED_TOOL",
            "feed_text": "grep: searching docs",
        },
    )
    upsert_tool_transcript_event(
        app,
        transcript_events,
        "worker",
        event,
        {
            "activity_phase": "completed",
            "feed_icon": "✓",
            "feed_text": "grep",
        },
    )

    assert transcript_events[0]["phase"] == "completed"
    assert transcript_events[0]["content"] == "grep: searching docs"
