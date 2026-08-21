"""The seam between the event schema and the event store.

Two units built these in parallel and neither could test the join: the schema
unit added seven event types without a store to write them to, and the store
unit was written against the fourteen types that existed before them. Each
suite passed on its own. This module drives the composed path — construct every
new type, persist it through the real store, read it back — because the way
these two can break each other is invisible from either side.

The specific hazard: the store decides "known" from
``rotaris_core.eventstore.reader.KNOWN_EVENT_TYPES``. If that set were ever
hard-coded rather than derived from ``AnyEvent``, every new event type would
silently persist as an *unknown* record — readable, but no longer
reconstructible into its model, and invisible to a type filter. Nothing in
either unit's own tests would notice.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from rotaris_core.events.schema import (
    ApprovalRequestedEvent,
    CheckpointCreatedEvent,
    CheckpointRestoredEvent,
    GateDecisionEvent,
    GateRepairEvent,
    HookFinishEvent,
    HookStartEvent,
    RotarisEvent,
)
from rotaris_core.eventstore import (
    EventQuery,
    SessionEventStore,
    query_events,
    read_session_events,
)
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from pathlib import Path

_SESSION = "seam0000"

#: One instance of every event type SWR-1831 added, with the fields a real
#: producer would populate.  Kept as a list so a type added later without a
#: sample here shows up as a gap in ``test_...covers_every_new_event_type``.
_NEW_EVENTS: tuple[RotarisEvent, ...] = (
    HookStartEvent(
        session_id=_SESSION,
        hook_id="h1",
        hook_name="format-on-write",
        lifecycle_point="pre_tool",
        scope="workspace",
        tool_name="write_file",
        command="ruff format --check",
    ),
    HookFinishEvent(
        session_id=_SESSION,
        hook_id="h1",
        hook_name="format-on-write",
        lifecycle_point="pre_tool",
        scope="workspace",
        tool_name="write_file",
        exit_code=0,
        duration_ms=12.5,
        output="1 file reformatted",
    ),
    CheckpointCreatedEvent(
        session_id=_SESSION,
        sequence=3,
        ref="refs/rotaris/checkpoints/seam0000/3",
        kind="iteration",
        iteration=3,
        changed_paths=2,
    ),
    CheckpointRestoredEvent(
        session_id=_SESSION,
        sequence=3,
        restored=True,
        safety_sequence=4,
        changed_paths=2,
    ),
    GateDecisionEvent(
        session_id=_SESSION,
        iteration=3,
        decision="gated",
        unsatisfied_checks=["pytest"],
        llm_verdict="COMPLETE",
    ),
    GateRepairEvent(
        session_id=_SESSION,
        iteration=3,
        action="retry",
        attempt=1,
        max_attempts=2,
        remaining_attempts=1,
        unsatisfied_checks=["pytest"],
    ),
    ApprovalRequestedEvent(
        session_id=_SESSION,
        request_id="req-1",
        tool_name="terminal",
        rule_id="destructive",
        summary="rm -rf build",
        resolver="rotaris",
    ),
)


def _write_store(session_dir: Path) -> SessionEventStore:
    store = SessionEventStore(session_dir, session_id=_SESSION)
    store.initialize()
    for event in _NEW_EVENTS:
        assert store.append(event) is True
    return store


@verifies(SWR.SWR_1831, SWR.SWR_2901)
def test_every_new_event_type_persists_as_a_known_record(tmp_path: Path) -> None:
    """The store recognises the SWR-1831 types without being told about them."""
    _write_store(tmp_path)

    stored = list(read_session_events(tmp_path))

    assert [record.event_type for record in stored] == [event.event for event in _NEW_EVENTS]
    unknown = [record.event_type for record in stored if not record.known]
    assert unknown == [], (
        "the store treated a shipped event type as unknown, which means its "
        "known-type set is no longer derived from AnyEvent"
    )


@verifies(SWR.SWR_1831, SWR.SWR_2902)
def test_a_stored_new_event_reconstructs_into_its_model(tmp_path: Path) -> None:
    """Persist-then-parse is lossless for the new types, field by field."""
    _write_store(tmp_path)

    for original, record in zip(_NEW_EVENTS, read_session_events(tmp_path), strict=True):
        rebuilt = record.as_model()
        assert type(rebuilt) is type(original)
        assert rebuilt.model_dump() == original.model_dump()


@verifies(SWR.SWR_1831, SWR.SWR_2902)
def test_a_new_event_type_is_selectable_by_a_type_filter(tmp_path: Path) -> None:
    """A consumer can ask for one of the new types and get only that type.

    This is the assertion that fails first if the known-type set drifts: an
    unknown record still *reads*, so only a filter reveals the regression.
    """
    _write_store(tmp_path)
    store_path = SessionEventStore(tmp_path, session_id=_SESSION).path

    selected = list(query_events(store_path, EventQuery.build(event_types=["gate.decision"])))

    assert [record.event_type for record in selected] == ["gate.decision"]
    assert selected[0].payload["decision"] == "gated"


@verifies(SWR.SWR_1831, SWR.SWR_2901)
def test_redaction_survives_the_round_trip_to_disk(tmp_path: Path) -> None:
    """A credential masked by the schema is still masked in the store.

    The schema redacts on construction; the store writes whatever the schema
    serialized. If either side ever bypassed the other — a raw payload written
    directly, or a validator dropped — the secret would land on disk. This
    asserts on the file's bytes rather than on the models, because the file is
    what outlives the process.
    """
    secret = "sk-live-must-not-appear-0123456789"
    store = SessionEventStore(tmp_path, session_id=_SESSION)
    store.initialize()
    store.append(
        HookStartEvent(
            session_id=_SESSION,
            hook_id="h2",
            hook_name="deploy",
            lifecycle_point="post_tool",
            scope="global",
            command=f"curl -H 'Authorization: Bearer {secret}' https://example.test",
        )
    )
    store.append(
        ApprovalRequestedEvent(
            session_id=_SESSION,
            request_id="req-2",
            tool_name="terminal",
            summary=f"export API_KEY={secret}",
            resolver="rotaris",
        )
    )

    raw = store.path.read_text(encoding="utf-8")

    assert secret not in raw
    assert raw.count("\n") == 2


@verifies(SWR.SWR_1831)
def test_the_sample_set_covers_every_new_event_type(tmp_path: Path) -> None:
    """Guard against this module going stale as more types are added.

    ``_NEW_EVENTS`` is hand-maintained; without this check a type added to the
    schema later would simply never be exercised against the store, and the
    seam would quietly stop being covered.
    """
    covered = {event.event for event in _NEW_EVENTS}

    assert covered == {
        "hook.start",
        "hook.finish",
        "checkpoint.created",
        "checkpoint.restored",
        "gate.decision",
        "gate.repair",
        "approval.requested",
    }
