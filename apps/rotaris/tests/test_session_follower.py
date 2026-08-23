"""Productive use: a user starts a run in a terminal and watches it in the
desktop, or leaves a headless job going and opens the window on it later.

Expected outcome: the conversation is there while it happens, and looking again
costs what the run added rather than what it has said so far.

Before the engine owned the transcript, neither half held. A foreign session's
`state/ui_transcript.json` was written near the end of the run, so there was
nothing to show while it ran; and it is rewritten whole, so showing it cost the
whole session every time. These pin the consumer that closes both.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

import pytest
from rotaris_core.events.schema import (
    IterationStartEvent,
    TranscriptRowEvent,
    serialize_event,
)
from rotaris_core.eventstore.writer import event_store_path
from rotaris_core.reqtocode import SWR, verifies

from rotaris.services.session_follower import SessionFollower

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.unit


def _store(session_dir: Path) -> Path:
    path = event_store_path(session_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def _append(session_dir: Path, *events: Any) -> None:
    """Add lines to the session's store, the way a run in another process does."""
    path = _store(session_dir)
    with path.open("a", encoding="utf-8") as handle:
        for event in events:
            handle.write(serialize_event(event) + "\n")


def _row(index: int, **fields: Any) -> TranscriptRowEvent:
    fields.setdefault("role", "agent")
    fields.setdefault("name", "coder-1")
    return TranscriptRowEvent(session_id="s-1", index=index, row=fields)


@verifies(SWR.SWR_2454)
def test_the_conversation_of_a_run_in_another_process_is_readable(tmp_path: Path) -> None:
    """Productive use: the run is happening elsewhere and the window is open on it.
    Expected outcome: what the agent said is on screen, in the order it said it."""
    _append(
        tmp_path,
        _row(0, role="user", content="fix the parser"),
        _row(1, role="thinking", content="the trailing comma, probably"),
        _row(2, content="Checking the tokenizer."),
    )
    follower = SessionFollower(tmp_path)

    delta = follower.poll()

    assert delta is not None
    assert delta.first == 0
    assert [row["content"] for row in delta.rows] == [
        "fix the parser",
        "the trailing comma, probably",
        "Checking the tokenizer.",
    ]


@verifies(SWR.SWR_2454)
def test_looking_again_costs_what_the_run_added(tmp_path: Path) -> None:
    """Productive use: the run keeps going and the window keeps watching.
    Expected outcome: the second look carries the new rows and starts at them —
    it is not the session again with one line on the end."""
    _append(tmp_path, *[_row(index, content=f"line {index}") for index in range(200)])
    follower = SessionFollower(tmp_path)
    follower.poll()

    _append(tmp_path, _row(200, content="and one more"))
    delta = follower.poll()

    assert delta is not None
    assert delta.first == 200
    assert [row["content"] for row in delta.rows] == ["and one more"]


@verifies(SWR.SWR_2454)
@pytest.mark.parametrize("length", [30, 300, 3000])
def test_one_new_row_costs_one_new_row_whatever_the_session_holds(
    tmp_path: Path, length: int
) -> None:
    """Productive use: hour three of a Ralph loop, watched from another window.
    Expected outcome: the update is the size of the change — the property that
    stops the sessions worth watching being the ones served worst."""
    session_dir = tmp_path / str(length)
    _append(session_dir, *[_row(index, content=f"line {index}") for index in range(length)])
    follower = SessionFollower(session_dir)
    follower.poll()

    _append(session_dir, _row(length, content="the newest thing"))
    delta = follower.poll()

    assert delta is not None
    assert len(delta.rows) == 1
    assert delta.first == length


@verifies(SWR.SWR_2454)
def test_a_row_that_settles_replaces_the_one_it_opened(tmp_path: Path) -> None:
    """Productive use: a tool call the user watched start finally finishes.
    Expected outcome: the row it opened is the row that changes — the transcript
    does not grow a second copy of the same call."""
    _append(tmp_path, _row(0, role="tool", tool="bash", status="running", content="pytest -q"))
    follower = SessionFollower(tmp_path)
    follower.poll()

    _append(
        tmp_path,
        _row(0, role="tool", tool="bash", status="ok", content="pytest -q", detail="12 passed"),
    )
    delta = follower.poll()

    assert delta is not None
    assert delta.first == 0
    assert len(follower.rows) == 1
    assert follower.rows[0]["status"] == "ok"
    assert follower.rows[0]["detail"] == "12 passed"


@verifies(SWR.SWR_2454)
def test_a_run_that_said_nothing_new_reports_nothing(tmp_path: Path) -> None:
    """Productive use: the watched agent is thinking, or waiting on a tool.
    Expected outcome: no delta and no re-read — idle costs nothing."""
    _append(tmp_path, _row(0, content="working on it"))
    follower = SessionFollower(tmp_path)
    follower.poll()
    offset = follower.offset

    assert follower.poll() is None
    assert follower.offset == offset


@verifies(SWR.SWR_2454)
def test_events_that_are_not_transcript_rows_are_passed_over(tmp_path: Path) -> None:
    """Productive use: the store carries a run's whole history, most of which is
    not conversation. Expected outcome: the mechanics are skipped and the
    position still advances past them, so they are not read twice."""
    _append(
        tmp_path,
        IterationStartEvent(session_id="s-1", iteration=1, task="fix the parser"),
        _row(0, content="on it"),
        IterationStartEvent(session_id="s-1", iteration=2, task="fix the parser"),
    )
    follower = SessionFollower(tmp_path)

    delta = follower.poll()

    assert delta is not None
    assert [row["content"] for row in delta.rows] == ["on it"]
    assert follower.poll() is None


@verifies(SWR.SWR_2454)
def test_a_session_with_no_store_yet_is_not_an_error(tmp_path: Path) -> None:
    """Productive use: the window opens on a session whose run has not emitted
    anything. Expected outcome: nothing to show, and nothing raised."""
    assert SessionFollower(tmp_path / "never").poll() is None


@verifies(SWR.SWR_2454, SWR.SWR_2901)
def test_a_store_that_lost_its_start_is_read_again_from_the_beginning(tmp_path: Path) -> None:
    """Productive use: a very long run hits the store's cap, so its oldest events
    are dropped and the file shortens under the follower.
    Expected outcome: what was derived from the old file is discarded and the
    view is told to start over, rather than new rows being appended to a history
    that is gone."""
    _append(tmp_path, *[_row(index, content=f"line {index}") for index in range(6)])
    follower = SessionFollower(tmp_path)
    follower.poll()

    _store(tmp_path).write_text(
        serialize_event(_row(0, content="only this survived")) + "\n", encoding="utf-8"
    )
    delta = follower.poll()

    assert delta is not None
    assert delta.first == 0, "a shortened store restarts the view rather than continuing it"
    assert [row["content"] for row in delta.rows] == ["only this survived"]


@verifies(SWR.SWR_2454)
def test_a_row_missing_from_the_middle_keeps_every_later_row_in_place(tmp_path: Path) -> None:
    """Productive use: one line of the store is lost — dropped to the cap, or
    half-written by a killed process. Expected outcome: the rows around it stay
    at the positions the run gave them. A transcript quietly out of order is
    worse than one line that says it is missing."""
    _append(tmp_path, _row(0, content="first"), _row(2, content="third"))
    follower = SessionFollower(tmp_path)

    delta = follower.poll()

    assert delta is not None
    assert [row["content"] for row in delta.rows] == [
        "first",
        "(this line was not recorded)",
        "third",
    ]


@pytest.mark.integration
@verifies(SWR.SWR_2454, SWR.SWR_1829)
def test_what_the_follower_shows_is_what_the_session_recorded(tmp_path: Path) -> None:
    """Productive use: a user watches a run from outside it and then opens that
    session afterwards. Expected outcome: the same conversation both times.

    This is the invariant the whole design rests on. The rows a follower places
    are not built from the wire — they *are* the run's rows, carried verbatim and
    put back where they came from — so a view fed by the store and a view built
    from the session record are the same rows either way, and cannot disagree
    about what the run said."""
    from rotaris_core.events.bus import register_event_sink, reset_event_registry
    from rotaris_core.eventstore import (
        attach_session_store,
        reset_event_store_registry,
    )
    from rotaris_core.session.manager import SessionManager
    from rotaris_core.session.transcript import (
        ensure_transcript_recorder,
        reset_transcript_recorders,
    )
    from run_wiring import action_event, demo_config, message_event, observation_event, sdk_events

    reset_event_registry()
    reset_event_store_registry()
    reset_transcript_recorders()
    sdk = sdk_events()
    manager = SessionManager(tmp_path)
    state = manager.create_session(demo_config())
    session_dir = manager.session_dir(state.session_id)
    try:
        # Exactly the wiring a real run gets: the store is the bus sink, and the
        # recorder publishes each row it writes.
        register_event_sink(
            state.session_id,
            attach_session_store(session_dir, session_id=state.session_id),
        )
        recorder = ensure_transcript_recorder(state.session_id, state)
        recorder.record_user("fix the parser")
        action = action_event(sdk)
        recorder.record_conversation_event("coder-1", "coder", action)
        recorder.record_conversation_event("coder-1", "coder", observation_event(sdk, action))
        recorder.record_conversation_event(
            "coder-1", "coder", message_event(sdk, "The tokenizer was dropping it.")
        )

        follower = SessionFollower(session_dir)
        delta = follower.poll()
    finally:
        reset_event_registry()
        reset_event_store_registry()
        reset_transcript_recorders()

    assert delta is not None
    # Row for row, the session's own transcript.
    assert len(follower.rows) == len(state.transcript_events)
    for followed, recorded in zip(follower.rows, state.transcript_events, strict=True):
        assert followed["role"] == recorded["role"]
        assert followed.get("content") == recorded.get("content")
    # And the parts a reader actually looks at came through, not just the shape.
    assert [row["role"] for row in follower.rows] == ["user", "tool", "agent"]
    assert follower.rows[1]["status"] == "ok", "the tool row settled, in one row"
    assert follower.rows[2]["content"] == "The tokenizer was dropping it."


@verifies(SWR.SWR_2454)
def test_a_malformed_row_does_not_stall_the_follow(tmp_path: Path) -> None:
    """Productive use: something wrote a line the follower cannot use.
    Expected outcome: the rows around it still arrive, and the position advances
    past it so the next look is not stuck on the same bad line."""
    path = _store(tmp_path)
    path.write_text(
        "\n".join(
            [
                serialize_event(_row(0, content="before")),
                json.dumps({"event": "transcript.row", "index": "not a number", "row": {}}),
                json.dumps({"event": "transcript.row", "index": 1, "row": "not a row"}),
                serialize_event(_row(1, content="after")),
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    follower = SessionFollower(tmp_path)

    delta = follower.poll()

    assert delta is not None
    assert [row["content"] for row in delta.rows] == ["before", "after"]
    assert follower.poll() is None
