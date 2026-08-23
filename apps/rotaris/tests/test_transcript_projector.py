"""Productive use: a user watches a run that has been going for hours, and the
transcript keeps up — new rows appear, the streaming row changes as it streams,
and neither costs more than it did when the session was a minute old.
Expected outcome: projecting a change touches work proportional to the change,
and produces exactly what a whole-session projection of the same rows produces.

No Qt here on purpose. The projector is the one genuinely stateful piece of this
path — it carries a snapshot across a boundary — so it is pinned on its own,
against the whole-list function it has to agree with, before anything is wired
to it.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import pytest
from rotaris_core.reqtocode import SWR, verifies

from rotaris.services import session_projection
from rotaris.services.session_projection import TranscriptProjector, _project_transcript

if TYPE_CHECKING:
    from rotaris.models.state import TranscriptEvent

pytestmark = pytest.mark.unit


def _message(index: int, agent: str = "coder") -> dict[str, Any]:
    return {"role": "assistant", "name": agent, "content": f"message {index}"}


def _tool(index: int, agent: str = "coder", status: str = "ok") -> dict[str, Any]:
    return {
        "role": "tool",
        "name": agent,
        "tool": f"tool_{index}",
        "content": f"call {index}",
        "tool_event_key": f"call:{index}",
        "tool_terminal": True,
        "status": status,
    }


def _thinking(content: str, agent: str = "coder", **extra: Any) -> dict[str, Any]:
    return {"role": "thinking", "name": agent, "content": content, **extra}


def _transcript(length: int) -> list[dict[str, Any]]:
    """A settled transcript of *length* rows, alternating messages and tools."""
    return [_message(i) if i % 2 else _tool(i) for i in range(length)]


def _whole(rows: list[dict[str, Any]], diffs: list[dict[str, Any]] | None = None):
    return _project_transcript(rows, diffs or [], {}, True)


def _texts(events: tuple[TranscriptEvent, ...]) -> list[str]:
    return [f"{event.role}:{event.text}:{event.tool}:{event.detail}" for event in events]


@verifies(SWR.SWR_2454)
def test_a_delta_projects_what_a_whole_pass_would_have() -> None:
    """Productive use: the view is fed deltas all session and must still show the
    session. Expected outcome: seed-then-deltas equals one whole projection."""
    rows = _transcript(20)
    projector = TranscriptProjector()
    view = list(projector.seed(rows, []))

    # Two rows arrive, then the last one is mutated in place — the shape a
    # streaming tail actually produces.
    rows.extend([_message(20), _tool(21, status="running")])
    first, tail = projector.apply(20, rows[20:])  # type: ignore[misc]
    view[first:] = tail
    rows[21]["status"] = "ok"
    rows[21]["detail"] = "finished"
    first, tail = projector.apply(21, rows[21:])  # type: ignore[misc]
    view[first:] = tail

    assert _texts(tuple(view)) == _texts(_whole(rows))


@verifies(SWR.SWR_2454)
def test_applying_one_change_does_not_grow_with_the_session() -> None:
    """Productive use: the long session is the normal case for this product.
    Expected outcome: appending one row to a 3000-row transcript projects the
    same number of rows as appending one to a 30-row transcript."""
    measured: dict[int, int] = {}
    for length in (30, 300, 3000):
        rows = _transcript(length)
        projector = TranscriptProjector()
        projector.seed(rows, [])
        # Move the boundary to the tail the way the first live delta does, then
        # measure the steady state that follows it.
        rows.append(_message(length))
        projector.apply(length, rows[length:])

        calls = _counting_project_row(session_projection)
        rows.append(_message(length + 1))
        projector.apply(len(rows) - 1, rows[-1:])
        measured[length] = calls.pop()

    assert measured[30] == measured[300] == measured[3000], measured
    # And it really is bounded by the change, not merely equal across lengths.
    assert measured[3000] <= 2, measured


@verifies(SWR.SWR_2454)
def test_a_mutated_row_costs_the_rows_from_it_onward_and_no_more() -> None:
    """Productive use: a tool call opened 5 rows ago finishes while the model
    keeps talking. Expected outcome: the projection redoes those 5 rows, not the
    3000 before them."""
    rows = _transcript(3000)
    projector = TranscriptProjector()
    projector.seed(rows, [])
    rows.append(_tool(3000, status="running"))
    projector.apply(3000, rows[3000:])
    rows.extend(_message(i) for i in range(3001, 3005))
    projector.apply(3000, rows[3000:])

    calls = _counting_project_row(session_projection)
    rows[3000]["status"] = "ok"
    first, tail = projector.apply(3000, rows[3000:])  # type: ignore[misc]

    assert calls.pop() == 5
    assert first == 3000
    assert len(tail) == 5


@verifies(SWR.SWR_2454)
def test_a_delta_reaching_behind_the_boundary_asks_to_be_re_seeded() -> None:
    """Productive use: something reaches further back than the projector kept a
    carry for. Expected outcome: it says so instead of guessing."""
    rows = _transcript(10)
    projector = TranscriptProjector()
    projector.seed(rows, [])
    assert projector.apply(8, rows[8:]) is not None
    assert projector.apply(4, rows[4:]) is None


@verifies(SWR.SWR_2446, SWR.SWR_2454)
def test_the_carry_survives_the_boundary_it_is_taken_at() -> None:
    """Productive use: an unstamped duplicate of a reasoning burst must be
    dropped whether the view was built whole or fed a delta.
    Expected outcome: both paths drop it, including when the duplicate is the
    first row of a delta and its original is behind the boundary."""
    rows: list[dict[str, Any]] = [_message(0), _thinking("a plan", duration=1.2)]
    projector = TranscriptProjector()
    view = list(projector.seed(rows, []))
    rows.append(_thinking("a plan"))  # the unstamped duplicate
    first, tail = projector.apply(2, rows[2:])  # type: ignore[misc]
    view[first:] = tail

    assert _texts(tuple(view)) == _texts(_whole(rows))
    assert len(view) == 2


@verifies(SWR.SWR_2419, SWR.SWR_2454)
def test_a_diff_recorded_after_the_seed_lands_beside_its_tool_row() -> None:
    """Productive use: the agent edits a file mid-session and the user wants the
    diff next to the call that made it. Expected outcome: a diff sent with a
    delta is placed exactly where a whole projection would place it."""
    rows: list[dict[str, Any]] = [_message(0)]
    projector = TranscriptProjector()
    view = list(projector.seed(rows, []))
    diff = {
        "diff_id": "d1",
        "agent_name": "coder",
        "tool_event_key": "call:1",
        "path": "one.txt",
        "lines": [],
    }
    rows.append(_tool(1))
    first, tail = projector.apply(1, rows[1:], [diff])  # type: ignore[misc]
    view[first:] = tail

    assert _texts(tuple(view)) == _texts(_whole(rows, [diff]))


def _counting_project_row(module: Any) -> list[int]:
    """Count ``_project_row`` calls until the returned list is popped.

    A counter rather than a timer: the criterion is about *work*, and a wall
    clock on a shared machine measures the machine.
    """
    counter = [0]
    original = module._project_row  # noqa: SLF001

    def counted(*args: Any, **kwargs: Any) -> Any:
        counter[0] += 1
        return original(*args, **kwargs)

    module._project_row = counted  # noqa: SLF001

    class _Counter(list):
        def pop(self, index: int = -1) -> int:  # type: ignore[override]
            module._project_row = original  # noqa: SLF001
            return counter[0]

    return _Counter()
