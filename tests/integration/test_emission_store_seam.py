"""The seam between event emission and the event store.

Wave 2 built these in parallel and neither side could test the join.

- The emission unit proved its seven event types reach *a bus subscriber*, by
  registering a plain list-appending sink. It never went through
  ``run_host.execute_run``, so it never exercised the storing sink.
- The store unit proved a scripted run through ``execute_run`` leaves a
  complete store. Its scripted run does not hook, checkpoint, gate or ask, so
  none of the seven new types ever appeared in the store it checked.

Both suites are green and the link between them — bus → ``StoringEventSink`` →
JSONL on disk — is what neither covers. The specific hazard is that the tee
forwards without persisting (or persists without forwarding): the host still
sees every event on stdout, the store still exists and still parses, and the
only symptom is that stored history quietly lacks the P1 features while live
output has them.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

import pytest

from rotaris_core.events import (
    ApprovalRequestedEvent,
    CheckpointCreatedEvent,
    CheckpointRestoredEvent,
    GateDecisionEvent,
    GateRepairEvent,
    HookFinishEvent,
    HookStartEvent,
    RotarisEvent,
    publish,
    register_event_sink,
    reset_event_registry,
)
from rotaris_core.eventstore import (
    StoringEventSink,
    open_session_store,
    read_session_events,
    register_event_store,
    reset_event_store_registry,
)
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from pathlib import Path

_SESSION = "seam2000"


@pytest.fixture(autouse=True)
def _clean_registries() -> object:
    """Both registries are module-level; leaking one poisons sibling tests."""
    reset_event_registry()
    reset_event_store_registry()
    yield
    reset_event_registry()
    reset_event_store_registry()


def _events() -> tuple[RotarisEvent, ...]:
    """One of each type the P1-feature emission produces."""
    return (
        HookStartEvent(
            session_id=_SESSION,
            hook_id="h1",
            hook_name="fmt",
            lifecycle_point="pre_tool",
            scope="workspace",
        ),
        HookFinishEvent(
            session_id=_SESSION,
            hook_id="h1",
            hook_name="fmt",
            lifecycle_point="pre_tool",
            scope="workspace",
            exit_code=0,
        ),
        CheckpointCreatedEvent(session_id=_SESSION, sequence=1, ref="refs/x/1", kind="iteration"),
        CheckpointRestoredEvent(session_id=_SESSION, sequence=1, restored=True),
        GateDecisionEvent(session_id=_SESSION, iteration=1, decision="gated"),
        GateRepairEvent(session_id=_SESSION, iteration=1, action="retry", attempt=1),
        ApprovalRequestedEvent(session_id=_SESSION, request_id="r1", tool_name="terminal"),
    )


def _attach(session_dir: Path, downstream: object | None = None) -> None:
    """Wire a session the way ``execute_run`` does: store, then storing sink."""
    store = open_session_store(session_dir, session_id=_SESSION)
    register_event_store(_SESSION, store)
    register_event_sink(_SESSION, StoringEventSink(_SESSION, downstream))


@verifies(SWR.SWR_1832, SWR.SWR_2901)
def test_emitted_p1_events_reach_the_store(tmp_path: Path) -> None:
    """Publishing through the bus persists, in order, with payloads intact."""
    _attach(tmp_path)

    for event in _events():
        publish(_SESSION, event)

    stored = list(read_session_events(tmp_path))
    assert [record.event_type for record in stored] == [e.event for e in _events()]
    assert [record.known for record in stored] == [True] * len(stored)
    assert stored[-1].payload["request_id"] == "r1"


@verifies(SWR.SWR_1832, SWR.SWR_2901)
def test_the_storing_sink_both_persists_and_forwards(tmp_path: Path) -> None:
    """The tee must do both.

    Doing only one is the failure this module exists for: forwarding without
    persisting leaves live output correct and history empty; persisting without
    forwarding leaves history correct and the user's stream silent. Each looks
    fine from one side.
    """
    seen: list[RotarisEvent] = []
    _attach(tmp_path, seen.append)

    for event in _events():
        publish(_SESSION, event)

    stored = [record.event_type for record in read_session_events(tmp_path)]
    forwarded = [event.event for event in seen]
    assert forwarded == stored
    assert forwarded == [event.event for event in _events()]


@verifies(SWR.SWR_2901)
def test_a_hostile_downstream_does_not_cost_the_store_an_event(tmp_path: Path) -> None:
    """A host whose sink raises must not silently truncate stored history.

    The bus already contains sink failures so a broken stream cannot break a
    run. The question this asks is narrower and is the store's own: when the
    *downstream* fails, does the durable record still get written? Losing the
    stream is recoverable; losing the evidence is not.
    """

    def _hostile(event: RotarisEvent) -> None:
        raise RuntimeError(f"this host cannot render {event.event}")

    _attach(tmp_path, _hostile)

    for event in _events():
        publish(_SESSION, event)

    stored = [record.event_type for record in read_session_events(tmp_path)]
    assert stored == [event.event for event in _events()]


@verifies(SWR.SWR_2901)
def test_stored_lines_are_the_wire_format_verbatim(tmp_path: Path) -> None:
    """A stored line and a streamed line must be the same bytes.

    If they diverge, every consumer needs two parsers and the store stops being
    a replay of the run.
    """
    _attach(tmp_path)
    publish(_SESSION, _events()[0])

    line = (tmp_path / "evidence" / "events.jsonl").read_text(encoding="utf-8").strip()
    payload = json.loads(line)

    assert payload["event"] == "hook.start"
    assert payload["session_id"] == _SESSION
    assert payload["schema_version"] >= 1
    assert line == json.dumps(payload, sort_keys=True, separators=(",", ":"))
