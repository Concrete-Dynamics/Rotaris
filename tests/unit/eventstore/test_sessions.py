"""Finding the sessions a user can replay (SWR-2904).

``events list`` is the entry point to everything else in the group: a user who
cannot find a session id cannot replay or export one.  What matters here is that
the listing is honest — newest first, a truncated store marked as truncated, and
a session with no store simply absent rather than an error.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

import pytest

from rotaris_core.events.schema import IterationStartEvent
from rotaris_core.eventstore import (
    SessionEventStore,
    format_stored_session_rows,
    has_event_store,
    list_stored_sessions,
    resolve_stored_session,
    summarize_stored_session,
)
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.unit


def _write_session(root: Path, session_id: str, stamps: list[str]) -> Path:
    """A session directory with one stored event per timestamp in *stamps*."""
    session_dir = root / session_id
    store = SessionEventStore(session_dir, session_id=session_id, max_events=None)
    store.initialize()
    for index, stamp in enumerate(stamps, start=1):
        event = IterationStartEvent(session_id=session_id, iteration=index, task="t")
        payload = event.model_dump(mode="json")
        # Stamped by hand so the ordering assertions do not depend on the clock.
        payload["timestamp"] = stamp
        store.append_line(json.dumps(payload, separators=(",", ":"), sort_keys=True))
    return session_dir


@verifies(SWR.SWR_2904)
def test_the_listing_puts_the_most_recent_run_first(tmp_path: Path) -> None:
    """Productive use: a user finished a run a minute ago and wants to replay it.
    Expected outcome: it is the first line, not buried under every older run in
    the workspace."""
    _write_session(tmp_path, "old00001", ["2026-08-01T10:00:00+00:00", "2026-08-01T10:05:00+00:00"])
    _write_session(tmp_path, "new00001", ["2026-08-09T09:00:00+00:00", "2026-08-09T09:30:00+00:00"])

    sessions = list_stored_sessions(tmp_path)

    assert [session.session_id for session in sessions] == ["new00001", "old00001"]
    assert sessions[0].event_count == 2
    assert sessions[0].first_timestamp == "2026-08-09T09:00:00+00:00"
    assert sessions[0].last_timestamp == "2026-08-09T09:30:00+00:00"


@verifies(SWR.SWR_2904)
def test_a_session_without_a_store_is_absent_rather_than_an_error(tmp_path: Path) -> None:
    """Productive use: a workspace holds sessions from before the store existed.
    Expected outcome: they are simply not offered for replay, and the ones that
    can be replayed still are."""
    (tmp_path / "nostore1").mkdir()
    _write_session(tmp_path, "hasstore", ["2026-08-09T09:00:00+00:00"])

    sessions = list_stored_sessions(tmp_path)

    assert [session.session_id for session in sessions] == ["hasstore"]
    assert has_event_store(tmp_path / "nostore1") is False
    assert resolve_stored_session(tmp_path, "nostore1") is None
    assert resolve_stored_session(tmp_path, "hasstore") == (tmp_path / "hasstore").resolve()


@verifies(SWR.SWR_2904)
def test_a_session_id_cannot_reach_outside_the_workspace_it_named(tmp_path: Path) -> None:
    """Productive use: a session id arrives from a script, a paste or a CI
    variable rather than from ``events list``.
    Expected outcome: ``--workspace`` means what it says — an id that escapes the
    workspace resolves to nothing instead of printing another tree's history."""
    outside = tmp_path / "elsewhere"
    outside.mkdir()
    _write_session(outside, "secret01", ["2026-08-09T09:00:00+00:00"])
    inside = tmp_path / "workspace" / "sessions"
    inside.mkdir(parents=True)
    _write_session(inside, "mine0001", ["2026-08-09T09:00:00+00:00"])

    assert resolve_stored_session(inside, "../../elsewhere/secret01") is None
    assert resolve_stored_session(inside, str(outside / "secret01")) is None
    assert resolve_stored_session(inside, "mine0001") == (inside / "mine0001").resolve()


@verifies(SWR.SWR_2904)
def test_an_empty_workspace_lists_nothing_instead_of_failing(tmp_path: Path) -> None:
    """Productive use: a user asks for stored runs before anything has run.
    Expected outcome: an empty answer, because "nothing has run yet" is a fact,
    not a failure."""
    assert list_stored_sessions(tmp_path / "never-created") == []
    assert list_stored_sessions(tmp_path) == []
    assert format_stored_session_rows([]) == []


@verifies(SWR.SWR_2904, SWR.SWR_2901)
def test_a_capped_store_is_listed_as_truncated_with_what_it_lost(tmp_path: Path) -> None:
    """Productive use: a long run trimmed its own history.
    Expected outcome: the row says so, so a user never reads a survivor count as
    the whole run."""
    session_dir = tmp_path / "capped01"
    store = SessionEventStore(session_dir, session_id="capped01", max_events=1)
    store.initialize()
    for index in range(6):
        store.append(IterationStartEvent(session_id="capped01", iteration=index, task="t"))

    summary = summarize_stored_session(session_dir)
    row = format_stored_session_rows([summary])[0]

    assert summary.truncated is True
    assert summary.dropped_events > 0
    assert "truncated" in row
    assert "capped01" in row


@verifies(SWR.SWR_2904)
def test_an_unknown_event_type_is_counted_rather_than_skipped(tmp_path: Path) -> None:
    """Productive use: a store written by a newer Rotaris is listed by this one.
    Expected outcome: the count includes the records this build cannot name —
    under-reporting them would make the listing disagree with the replay."""
    session_dir = _write_session(tmp_path, "future01", ["2026-08-09T09:00:00+00:00"])
    store_path = session_dir / "evidence" / "events.jsonl"
    with store_path.open("a", encoding="utf-8") as handle:
        handle.write(
            json.dumps(
                {
                    "schema_version": 2,
                    "event": "context.compacted",
                    "timestamp": "2026-08-09T09:01:00+00:00",
                    "session_id": "future01",
                },
                sort_keys=True,
            )
            + "\n",
        )

    summary = summarize_stored_session(session_dir)

    assert summary.event_count == 2
    assert summary.last_timestamp == "2026-08-09T09:01:00+00:00"


@verifies(SWR.SWR_2904)
def test_a_row_names_the_session_its_size_and_its_span(tmp_path: Path) -> None:
    """Productive use: a user picks a run out of a listing of several.
    Expected outcome: one aligned line carries everything the choice needs."""
    _write_session(tmp_path, "aaa00001", ["2026-08-09T09:00:00+00:00"])
    _write_session(
        tmp_path,
        "bbb00001",
        ["2026-08-09T10:00:00+00:00", "2026-08-09T10:04:00+00:00"],
    )

    rows = format_stored_session_rows(list_stored_sessions(tmp_path))

    assert len(rows) == 2
    assert "bbb00001" in rows[0]
    assert "2 events" in rows[0]
    assert "2026-08-09T10:00:00+00:00" in rows[0]
    # Aligned: the id column is the same width on every row.
    assert rows[0].index("events") == rows[1].index("events")
