"""Session-keyed event bus for the headless JSON stream (SWR-1828).

Sinks bind late, for the same reason approval hosts (SWR-2504) and audit
sessions (SWR-2506) do: agents are constructed in several spawn paths *before*
the run bootstrap knows where output goes, so the sink is looked up from a
session-keyed registry **at publish time** rather than threaded through every
constructor.  The registry shape is deliberately identical to
``rotaris_core.permissions.audit`` — one module-level dict behind an ``RLock``,
with register / resolve / discard / reset.

Two properties make the bus safe to call from anywhere:

* A session nobody registered is a **silent no-op**.  The desktop app and the
  entire existing test suite run without a sink and must neither pay for the
  stream nor crash because of it.
* :func:`publish` never raises into its caller.  A closed stdout pipe on the
  consumer's side must not kill an agent run mid-tool-call.

Hooks fire both from the event-loop thread and from ``asyncio.to_thread``
workers (``ralph/iteration_observer.on_child_spawned`` is the known case), so
the sink is snapshotted under the lock and invoked **outside** it: a sink that
writes to stdout can block for a long time, and holding the registry lock
across that would serialize — or deadlock — every other agent thread.
"""

from __future__ import annotations

import logging
from threading import RLock
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Callable

    from rotaris_core.events.schema import RotarisEvent

_log = logging.getLogger(__name__)

#: Called on whichever thread emitted the event, with an already-validated
#: model.  A sink must return quickly and must not assume the event loop.
type EventSink = Callable[[RotarisEvent], None]

_sinks_lock = RLock()
_sinks: dict[str, EventSink] = {}


@traces(SWR.SWR_1828)
def register_event_sink(session_id: str, sink: EventSink) -> None:
    """Publish where one session's events go; replaces any previous sink."""
    if not session_id:
        raise ValueError("An event sink needs a non-empty session id.")
    with _sinks_lock:
        _sinks[session_id] = sink


@traces(SWR.SWR_1828)
def resolve_event_sink(session_id: str | None) -> EventSink | None:
    """Return the sink registered for *session_id*, or ``None``.

    Never falls back to another session's sink: one run's events must not leak
    into another run's stream.
    """
    if not session_id:
        return None
    with _sinks_lock:
        return _sinks.get(session_id)


@traces(SWR.SWR_1828)
def discard_event_sink(session_id: str | None) -> None:
    """Stop streaming for *session_id* once its run is over."""
    if not session_id:
        return
    with _sinks_lock:
        _sinks.pop(session_id, None)


@traces(SWR.SWR_1828)
def reset_event_registry() -> None:
    """Clear every registration (test isolation and full-process shutdown)."""
    with _sinks_lock:
        _sinks.clear()


@traces(SWR.SWR_1828)
def publish(session_id: str | None, event: RotarisEvent) -> None:
    """Deliver *event* to the session's sink, if any.

    Silent when no sink is registered, and forgiving when one fails: a broken
    consumer degrades the stream, it does not fail the run.
    """
    sink = resolve_event_sink(session_id)
    if sink is None:
        return
    try:
        sink(event)
    except Exception:  # noqa: BLE001 - a broken stream must not fail the run
        _log.warning(
            "Event sink for session %s failed on a %r event; the event was dropped.",
            session_id,
            event.event,
            exc_info=True,
        )
