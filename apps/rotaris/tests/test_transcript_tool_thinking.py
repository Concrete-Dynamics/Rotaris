"""Structured tool rows, thinking duration/token counter, and live transcript polish.

Bridge-side stamping is exercised through :class:`ObserverHarness` (real SDK
events, real persisted session), rendering through ``_event_html`` directly,
and the view behaviours (repaint timer, copy menu) through a real
``TranscriptListView``.
"""

from __future__ import annotations

import json
import time

import pytest
from PySide6.QtCore import Qt
from PySide6.QtGui import QGuiApplication
from rotaris_core.reqtocode import SWR, verifies
from run_wiring import (
    ObserverHarness,
    action_event,
    observation_event,
    sdk_events,
    token_chunk,
)
from ui_query import transcript_anchor_point

from rotaris.models.state import TranscriptEvent
from rotaris.theme import persona_instance_color, tokens
from rotaris.views.transcript import (
    TranscriptListView,
    _event_html,
    _event_identity,
)

pytestmark = pytest.mark.unit


# ---------------------------------------------------------------------------
# Bridge stamping (SWR-2444, SWR-2446)
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_2444)
def test_tool_row_carries_status_and_duration_through_projection(tmp_path, qtbot) -> None:
    sdk = sdk_events()
    h = ObserverHarness(tmp_path)
    try:
        action = action_event(sdk)
        h.event(action)
        h.drain()
        running_row = next(e for e in h.state.transcript_events if e.get("role") == "tool")
        assert running_row["status"] == "running"
        assert "duration" not in running_row

        h.event(observation_event(sdk, action, output="3 passed"))
        h.drain()
        store = h.reload_into_store(tmp_path)
    finally:
        h.close()

    assert running_row["status"] == "ok"
    assert running_row["duration"] >= 0.0
    # No glyph baked into the result text anymore (the status field replaces it).
    assert not running_row["detail"].startswith(("✓", "✗", "!"))

    projected = next(e for e in store.transcript if e.kind == "tool")
    assert projected.status == "ok"
    assert projected.duration == running_row["duration"]
    assert projected.event_key == action.tool_call_id


@verifies(SWR.SWR_2444)
def test_failed_tool_row_gets_failed_status(tmp_path, qtbot) -> None:
    sdk = sdk_events()
    h = ObserverHarness(tmp_path)
    try:
        action = action_event(sdk, call_id="call-err", tool_name="write_file")
        h.event(action)
        h.event(
            sdk.AgentErrorEvent(
                source="agent",
                tool_name="write_file",
                tool_call_id="call-err",
                error="write failed",
            )
        )
        h.drain()
        row = next(e for e in h.state.transcript_events if e.get("role") == "tool")
    finally:
        h.close()

    assert row["status"] == "failed"


@verifies(SWR.SWR_2446)
def test_thinking_row_accumulates_chars_and_stamps_duration(tmp_path, qtbot) -> None:
    h = ObserverHarness(tmp_path)
    try:
        h.token(token_chunk(reasoning="a" * 3000))
        h.token(token_chunk(reasoning="b" * 3000))
        h.drain()
        row = next(e for e in h.state.transcript_events if e.get("role") == "thinking")
        assert row["started_at"] > 0
        # Streamed length keeps counting past the persisted content cap.
        assert row["chars"] == 6000
        assert len(row["content"]) == 4000
        assert "duration" not in row

        # Visible text ends the burst and stamps the duration.
        h.token(token_chunk(text="the answer"))
        h.drain()
    finally:
        h.close()

    assert row["duration"] >= 0.0


@verifies(SWR.SWR_2446)
def test_action_reasoning_folds_into_streamed_burst(tmp_path, qtbot) -> None:
    """The action event repeats the streamed reasoning; it must not add a row."""
    sdk = sdk_events()
    h = ObserverHarness(tmp_path)
    try:
        h.token(token_chunk(reasoning="step one, "))
        h.token(token_chunk(reasoning="step two"))
        h.event(action_event(sdk, reasoning_content="step one, step two"))
        h.drain()
        rows = [e for e in h.state.transcript_events if e.get("role") == "thinking"]
    finally:
        h.close()

    assert len(rows) == 1
    assert rows[0]["chars"] == len("step one, step two")
    assert rows[0]["content"] == "step one, step two"
    assert rows[0]["duration"] >= 0.0  # the tool call closed the burst


@verifies(SWR.SWR_2446)
def test_unstreamed_action_reasoning_is_one_complete_row(tmp_path, qtbot) -> None:
    """Reasoning that never streamed arrives whole — the row must not look live."""
    sdk = sdk_events()
    h = ObserverHarness(tmp_path)
    try:
        h.event(action_event(sdk, reasoning_content="silent pondering"))
        h.drain()
        rows = [e for e in h.state.transcript_events if e.get("role") == "thinking"]
    finally:
        h.close()

    assert len(rows) == 1
    assert rows[0]["chars"] == len("silent pondering")
    assert "started_at" not in rows[0]


@verifies(SWR.SWR_2446)
def test_projection_of_dead_session_strips_thinking_liveness() -> None:
    """Loading a finished run must not resurrect 'reasoning…' counters."""
    from rotaris.services.session_projection import _project_transcript

    rows = [
        {
            "role": "thinking",
            "name": "coder-1",
            "content": "orphaned burst",
            "started_at": time.time() - 120,
            "chars": 200,
        }
    ]
    dead = _project_transcript(rows, [], session_live=False)
    assert dead[0].started_at == 0.0
    assert dead[0].char_count == 200

    live = _project_transcript(rows, [], session_live=True)
    assert live[0].started_at > 0.0


@verifies(SWR.SWR_2446)
def test_projection_drops_persisted_duplicate_thinking_rows() -> None:
    """Sessions recorded before the fold fix carry an unstamped copy per burst."""
    from rotaris.services.session_projection import _project_transcript

    stamped = {
        "role": "thinking",
        "name": "coder-1",
        "content": "same reasoning",
        "started_at": time.time() - 300,
        "chars": 51,
        "duration": 2.1,
    }
    duplicate = {
        "role": "thinking",
        "name": "coder-1",
        "content": "same reasoning",
        "started_at": time.time() - 298,
        "chars": 51,
    }
    fresh = {
        "role": "thinking",
        "name": "coder-1",
        "content": "different reasoning",
        "started_at": time.time() - 200,
        "chars": 80,
        "duration": 1.0,
    }
    projected = _project_transcript([stamped, duplicate, fresh], [], session_live=False)
    thinking = [e for e in projected if e.kind == "thinking"]
    assert [e.text for e in thinking] == ["same reasoning", "different reasoning"]
    assert thinking[0].duration == 2.1


@verifies(SWR.SWR_2446)
def test_iteration_end_stamps_duration_on_open_thinking(tmp_path, qtbot) -> None:
    h = ObserverHarness(tmp_path)
    try:
        h.token(token_chunk(reasoning="pondering"))
        h.drain()
        row = next(e for e in h.state.transcript_events if e.get("role") == "thinking")
        assert "duration" not in row
        h.observer.on_iteration_end(h.record, None, h.child_manager, None, None)
        h.drain()
    finally:
        h.close()

    assert row["duration"] >= 0.0


# ---------------------------------------------------------------------------
# Rendering (SWR-2444, SWR-2445, SWR-2446)
# ---------------------------------------------------------------------------


def _tool_event(**overrides: object) -> TranscriptEvent:
    defaults: dict[str, object] = {
        "timestamp": "12:00",
        "role": "coder-1",
        "text": "pytest -x -q",
        "kind": "tool",
        "tool": "shell",
        "detail": "3 passed",
        "full_text": "pytest -x -q --full",
        "full_detail": "3 passed in 0.21s, full output",
        "event_key": "call-1",
    }
    defaults.update(overrides)
    return TranscriptEvent(**defaults)  # type: ignore[arg-type]


@verifies(SWR.SWR_2444)
def test_tool_header_shows_mono_chevron_name_summary_and_outcome() -> None:
    color = tokens().color

    html = _event_html(0, _tool_event(status="ok", duration=1.2), False)
    assert "●" not in html  # no Claude-Code-style status bullet
    assert "▸" in html
    assert color.info_text in html  # teal chevron + tool name
    assert "shell" in html
    assert "pytest -x -q" in html
    assert "ok · 1.2s" in html  # outcome trails inline in the status colour

    running = _event_html(0, _tool_event(status="running"), False)
    assert "running…" in running
    assert "◉" in running  # pulsing live dot

    long_run = _event_html(0, _tool_event(status="ok", duration=100.0), False)
    assert "ok · 1m 40s" in long_run


@verifies(SWR.SWR_2444)
def test_tool_outcome_color_tracks_status() -> None:
    # The outcome is a word trailing the header, so each verdict takes the text
    # step of its axis — the saturated one is for the rail beside it.
    color = tokens().color

    assert color.wait_text in _event_html(0, _tool_event(status="running"), False)
    assert color.run_text in _event_html(0, _tool_event(status="ok"), False)
    assert color.fail_text in _event_html(0, _tool_event(status="failed"), False)
    assert color.fail_text in _event_html(0, _tool_event(status="blocked"), False)


@verifies(SWR.SWR_2444)
def test_legacy_glyph_prefix_is_stripped_and_mapped() -> None:
    color = tokens().color

    legacy = _tool_event(status="", detail="✓ 3 passed", full_detail="✓ 3 passed in 0.21s")
    html = _event_html(0, legacy, False)
    assert "✓" not in html
    assert "3 passed" in html
    assert color.run_text in html

    failed = _tool_event(status="", detail="✗ boom", full_detail="✗ boom")
    assert color.fail_text in _event_html(0, failed, False)


@verifies(SWR.SWR_2445)
def test_expanded_tool_row_renders_input_output_rail_card() -> None:
    color = tokens().color

    html = _event_html(0, _tool_event(status="ok"), False, tool_expanded=True)
    assert "<table" in html
    assert "INPUT</div>" in html
    assert "OUTPUT</div>" in html
    # The rail is a filled shape, so it stays on the saturated step while the
    # words around it take the text one.
    assert f'bgcolor="{color.run}"' in html
    assert color.surface in html  # card surface behind the content
    assert "pytest -x -q --full" in html
    assert "3 passed in 0.21s, full output" in html

    collapsed = _event_html(0, _tool_event(status="ok"), False, tool_expanded=False)
    assert "<table" not in collapsed
    assert "⤷" in collapsed
    assert "3 passed" in collapsed  # one-line preview


@verifies(SWR.SWR_2445)
def test_panel_omits_empty_sections() -> None:
    no_output = _tool_event(status="running", detail="", full_detail="")
    html = _event_html(0, no_output, False, tool_expanded=True)
    assert "INPUT</div>" in html
    assert "OUTPUT</div>" not in html


@verifies(SWR.SWR_2446)
def test_finished_thinking_header_shows_duration_and_tokens() -> None:
    accent = tokens().color.accent

    event = TranscriptEvent(
        "12:00", "coder-1", "deep thoughts", kind="thinking", duration=7.0, char_count=920
    )
    html = _event_html(0, event, False)
    assert "▸ reasoning" in html
    assert accent[400] in html  # reasoning keyword in the accent family
    assert "· 7s" in html
    assert "~230 tok" in html
    assert "deep thoughts" not in html

    expanded = _event_html(0, event, True)
    assert "deep thoughts" in expanded
    assert f'bgcolor="{accent[800]}"' in expanded  # quote-block accent rail


@verifies(SWR.SWR_2446)
def test_live_thinking_header_counts_upward() -> None:
    event = TranscriptEvent(
        "12:00",
        "coder-1",
        "streaming thoughts",
        kind="thinking",
        started_at=time.time() - 5,
        char_count=400,
    )
    html = _event_html(0, event, False)
    assert "reasoning…" in html
    assert "◉" in html  # pulsing live dot
    assert "~100 tok" in html


@verifies(SWR.SWR_2446)
def test_legacy_thinking_row_falls_back_to_plain_header() -> None:
    event = TranscriptEvent("12:00", "coder-1", "old thoughts", kind="thinking")
    html = _event_html(0, event, False)
    assert "▸ reasoning" in html
    assert "tok" not in html
    # A killed run leaves started_at without duration; stale rows stop counting.
    stale = TranscriptEvent(
        "12:00", "coder-1", "stale", kind="thinking", started_at=time.time() - 90_000
    )
    assert "reasoning…" not in _event_html(0, stale, False)


# ---------------------------------------------------------------------------
# Shared mono idiom for delegation / question / approval rows (SWR-2909)
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_2909)
def test_delegation_header_speaks_the_mono_idiom() -> None:
    event = TranscriptEvent(
        timestamp="",
        role="coder-1",
        text=json.dumps(
            {
                "task_name": "coder-1",
                "persona": "coding-agent",
                "run_in_background": True,
                "task": "implement the feature",
            }
        ),
        kind="delegation_context",
        persona="coding-agent",
    )
    collapsed = _event_html(0, event, False, delegation_collapsed=True)
    assert "▸ delegate" in collapsed
    assert tokens().color.info_text in collapsed  # teal keyword
    assert "coding-agent" in collapsed
    assert "Mode:" not in collapsed  # header stays task name + persona (SWR-2433)

    expanded = _event_html(0, event, False, delegation_collapsed=False)
    assert "▾ delegate" in expanded
    assert "Mode: background" in expanded
    assert "implement the feature" in expanded
    rail = persona_instance_color("coding-agent", "coder-1")
    assert f'bgcolor="{rail}"' in expanded  # details behind a persona-coloured rail


@verifies(SWR.SWR_2909)
def test_question_and_approval_rows_drop_emoji_for_mono_headers() -> None:
    question = TranscriptEvent("12:00", "coder-1", "2 questions", kind="question_stepper")
    html = _event_html(3, question, False)
    assert "input needed" in html
    assert "answer →" in html
    assert "rotaris-questions:3" in html
    assert "❓" not in html

    approval = TranscriptEvent("12:00", "coder-1", "shell wants rm -rf", kind="approval")
    html = _event_html(4, approval, False)
    assert "permission required" in html
    assert "decide →" in html
    assert "rotaris-approval:4" in html
    assert "⛔" not in html


# ---------------------------------------------------------------------------
# View behaviours (SWR-2447, SWR-2448, SWR-2449)
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_2447)
def test_live_repaint_timer_runs_only_while_rows_are_live(qtbot) -> None:
    view = TranscriptListView()
    qtbot.addWidget(view)

    live_thinking = TranscriptEvent(
        "12:00", "coder-1", "hmm", kind="thinking", started_at=time.time()
    )
    view.transcript_model.sync([live_thinking])
    assert view._live_repaint.isActive()

    finished = TranscriptEvent(
        "12:00",
        "coder-1",
        "hmm",
        kind="thinking",
        started_at=live_thinking.started_at,
        duration=3.0,
    )
    view.transcript_model.sync([finished])
    assert not view._live_repaint.isActive()

    running_tool = _tool_event(status="running")
    view.transcript_model.sync([finished, running_tool])
    assert view._live_repaint.isActive()

    view.transcript_model.sync([finished, _tool_event(status="ok", duration=0.2)])
    assert not view._live_repaint.isActive()


@verifies(SWR.SWR_2448)
def test_expansion_survives_rows_inserted_above(qtbot) -> None:
    view = TranscriptListView()
    qtbot.addWidget(view)
    tool = _tool_event(status="ok")
    view.transcript_model.sync([tool])
    delegate = view.transcript_delegate
    delegate._expanded_tool.add(_event_identity(tool))

    earlier = TranscriptEvent("11:59", "you", "do the thing", kind="user")
    view.transcript_model.sync([earlier, tool])

    identity = _event_identity(view.transcript_model.event_at(1))
    assert identity in delegate._expanded_tool
    html = delegate._document(1, tool, 600).toHtml()
    assert "pytest -x -q --full" in html


@verifies(SWR.SWR_2449)
def test_copy_menu_offers_tool_input_and_output(qtbot) -> None:
    view = TranscriptListView()
    qtbot.addWidget(view)
    tool = _tool_event(status="ok")
    message = TranscriptEvent("12:01", "coder-1", "done", kind="message")
    view.transcript_model.sync([tool, message])

    view.setCurrentIndex(view.transcript_model.index(0, 0))
    menu = view._build_copy_menu()
    labels = [action.text() for action in menu.actions()]
    assert labels == ["Copy message", "Copy tool input", "Copy tool output"]

    input_action = menu.actions()[1]
    assert input_action.isEnabled()
    input_action.trigger()
    assert QGuiApplication.clipboard().text() == "pytest -x -q --full"
    menu.actions()[2].trigger()
    assert QGuiApplication.clipboard().text() == "3 passed in 0.21s, full output"

    view.setCurrentIndex(view.transcript_model.index(1, 0))
    assert [action.text() for action in view._build_copy_menu().actions()] == ["Copy message"]


# ---------------------------------------------------------------------------
# Consecutive tool-call grouping (SWR-2432)
# ---------------------------------------------------------------------------


def _grouping_view(qtbot, enabled: bool = True) -> TranscriptListView:
    view = TranscriptListView()
    qtbot.addWidget(view)
    view.set_group_tools_getter(lambda: enabled)
    return view


def _reads(count: int, **overrides: object) -> list[TranscriptEvent]:
    return [
        _tool_event(
            tool="read_file",
            text=f"{index}.py",
            detail="",
            full_text="",
            full_detail="",
            event_key=f"call-{index}",
            status="ok",
            duration=1.0,
            **overrides,
        )
        for index in range(count)
    ]


@verifies(SWR.SWR_2432)
def test_grouping_applies_only_when_the_preference_is_on(qtbot) -> None:
    calls = _reads(3)

    off = _grouping_view(qtbot, enabled=False)
    off.set_events(calls)
    assert off.transcript_model.events == calls

    on = _grouping_view(qtbot)
    on.set_events(calls)
    assert [event.kind for event in on.transcript_model.events] == ["tool_group"]


@verifies(SWR.SWR_2432)
def test_clicking_a_group_expands_it_into_its_calls(qtbot) -> None:
    view = _grouping_view(qtbot)
    view.set_events(_reads(3))
    view.show()
    qtbot.waitExposed(view)

    qtbot.mouseClick(
        view.viewport(),
        Qt.MouseButton.LeftButton,
        pos=transcript_anchor_point(view, 0, "rotaris-group:"),
    )

    kinds = [event.kind for event in view.transcript_model.events]
    assert kinds == ["tool_group", "tool", "tool", "tool"]
    header = view.transcript_model.event_at(0)
    assert _event_identity(header) in view.transcript_delegate.expanded_groups
    assert "▾" in view.transcript_delegate._document(0, header, 600).toHtml()

    qtbot.mouseClick(
        view.viewport(),
        Qt.MouseButton.LeftButton,
        pos=transcript_anchor_point(view, 0, "rotaris-group:"),
    )
    assert [event.kind for event in view.transcript_model.events] == ["tool_group"]


@verifies(SWR.SWR_2432)
def test_live_repaint_timer_keeps_a_live_group_counting(qtbot) -> None:
    view = _grouping_view(qtbot)

    running = _reads(2)
    running[-1] = _tool_event(
        tool="read_file",
        text="1.py",
        detail="",
        event_key="call-1",
        status="running",
        started_at=time.time(),
    )
    view.set_events(running)
    assert view.transcript_model.event_at(0).kind == "tool_group"
    assert view._live_repaint.isActive()

    view.set_events(_reads(2))
    assert not view._live_repaint.isActive()


@verifies(SWR.SWR_2432)
def test_bridge_stamps_wall_clock_start_on_a_running_tool_row(tmp_path, qtbot) -> None:
    """A group times itself from its first call, so the row needs a real start."""
    sdk = sdk_events()
    h = ObserverHarness(tmp_path)
    try:
        h.event(action_event(sdk))
        h.drain()
        row = next(e for e in h.state.transcript_events if e.get("role") == "tool")
    finally:
        h.close()

    assert row["status"] == "running"
    assert row["started_at"] > 0.0
    assert abs(row["started_at"] - time.time()) < 60


@verifies(SWR.SWR_2432)
def test_projection_of_dead_session_strips_tool_liveness() -> None:
    """A killed run must not reload as a group counting upward forever."""
    from rotaris.services.session_projection import _project_transcript

    rows = [
        {
            "role": "tool",
            "name": "coder-1",
            "tool": "read_file",
            "content": "a.py",
            "status": "running",
            "started_at": time.time() - 900,
        }
    ]

    dead = _project_transcript(rows, [], session_live=False)
    assert dead[0].status == ""
    assert dead[0].started_at == 0.0

    live = _project_transcript(rows, [], session_live=True)
    assert live[0].status == "running"
    assert live[0].started_at > 0.0
