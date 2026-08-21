"""The seam that makes a run persist what it emits (SWR-2901).

The writer, the reader, the query API and the export were built as a library and
left unwired: nothing in a real run ever called them, so every finished run's
history was still gone the moment the process ended.  This module is the join.

The shape is dictated by the bus.  ``events.bus`` holds **one** sink per session
— registering a second one replaces the first — so the store cannot simply add
itself alongside a host's stream.  :class:`StoringEventSink` is therefore a tee:
it is the sink the run registers, it persists every event through
:func:`~rotaris_core.eventstore.writer.store_event`, and it forwards to whatever
sink the host passed in (the headless JSONL stream, an SDK queue, or nothing at
all).

Two consequences are the whole point of SWR-2901:

* **Every run is stored, streaming or not.**  A host that passes no sink still
  gets a tee, so an interactive session and a headless CI run leave the same
  trace behind.
* **Order is emission order.**  The tee sits on the bus, so the store sees
  exactly the sequence the stream sees — which is what lets a consumer treat a
  stored session and a live one as interchangeable inputs.

Persisting happens *before* forwarding, deliberately: the downstream sink is a
foreign callable, and an event lost to a broken consumer must still be on disk.
Exceptions from downstream are not caught here — ``events.bus.publish`` already
turns them into a logged warning, and swallowing them twice would hide a broken
consumer from the one place that reports it.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from rotaris_core.eventstore.writer import (
    DEFAULT_MAX_EVENTS,
    discard_event_store,
    open_session_store,
    register_event_store,
    store_event,
)
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from pathlib import Path

    from rotaris_core.events.bus import EventSink
    from rotaris_core.events.schema import RotarisEvent
    from rotaris_core.eventstore.writer import SessionEventStore


@traces(SWR.SWR_2901)
class StoringEventSink:
    """A bus sink that persists each event, then passes it on.

    Args:
        session_id: The session whose store receives the events.  Resolved
            through the registry on every call rather than held as an object, so
            :func:`detach_session_store` genuinely stops persistence — the same
            late binding the bus and the permission audit log use.
        downstream: The host's own sink, or ``None`` for a run with no stream.

    Callable, not a closure, so a host can inspect what it registered:
    :attr:`downstream` is what the headless CLI hands back to itself when it
    needs the raw stream object.
    """

    __slots__ = ("_downstream", "_session_id")

    def __init__(self, session_id: str, downstream: EventSink | None = None) -> None:
        self._session_id = session_id
        self._downstream = downstream

    @property
    def session_id(self) -> str:
        """The session this sink persists for."""
        return self._session_id

    @property
    def downstream(self) -> EventSink | None:
        """The host sink this tee forwards to, if any."""
        return self._downstream

    def __call__(self, event: RotarisEvent) -> None:
        """Persist *event*, then forward it."""
        store_event(self._session_id, event)
        if self._downstream is not None:
            self._downstream(event)


@traces(SWR.SWR_2901)
def attach_session_store(
    session_dir: Path | str,
    *,
    session_id: str,
    downstream: EventSink | None = None,
    max_events: int | None = DEFAULT_MAX_EVENTS,
) -> StoringEventSink:
    """Open, register and wrap the store for one run.

    Returns the sink the caller must register on the bus.  Doing the two halves
    together is what stops them drifting apart: a store registered without its
    sink records nothing, and a sink registered without its store forwards into
    a silent no-op.

    Never raises for a store that cannot be created — ``open_session_store``
    degrades an unwritable session directory to a logged warning — because a
    run must not fail because of its own history.
    """
    store = open_session_store(session_dir, session_id=session_id, max_events=max_events)
    register_event_store(session_id, store)
    return StoringEventSink(session_id, downstream)


@traces(SWR.SWR_2901)
def detach_session_store(session_id: str | None) -> None:
    """Stop persisting for *session_id* once its run is over.

    The mirror of :func:`attach_session_store`, and the reason the sink resolves
    its store late: after this call the same sink object is inert, so an event
    that escapes a run's ``finally`` cannot append to a finished session.
    """
    discard_event_store(session_id)


@traces(SWR.SWR_2901)
def session_store_of(session_id: str | None) -> SessionEventStore | None:
    """The store currently registered for *session_id*, or ``None``.

    Exists for the hosts that want to report on the store they just wrote — how
    many events were dropped to the cap, where the file landed — without
    reaching into the registry module themselves.
    """
    from rotaris_core.eventstore.writer import resolve_event_store

    return resolve_event_store(session_id)
