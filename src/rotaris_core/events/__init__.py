"""Runtime event stream: versioned schema (SWR-1829) and bus (SWR-1828).

Import from this package, not from its modules — the split between ``schema``
and ``bus`` is an implementation detail.

Kept import-light on purpose: nothing here reaches ``rotaris_core.tools`` or
``rotaris_core.config``, both of which pull in the agent SDK and cost seconds.
A stream consumer must be able to parse a line without booting a runtime.

``StreamEventObserver`` and ``CompositeIterationObserver`` are the one
exception: they subclass ``rotaris_core.ralph.iteration_observer``, whose
package ``__init__`` executes the Ralph loop and with it the whole agent SDK.
They are therefore re-exported through a module ``__getattr__`` (PEP 562), so
``from rotaris_core.events import publish`` stays cheap while
``from rotaris_core.events import StreamEventObserver`` still works and pays for
the runtime only when a caller actually wants to run one.
"""

from typing import TYPE_CHECKING, Any

from rotaris_core.events.bus import (
    EventSink,
    discard_event_sink,
    publish,
    register_event_sink,
    reset_event_registry,
    resolve_event_sink,
)
from rotaris_core.events.schema import (
    EVENT_SCHEMA_VERSION,
    AgentMessageEvent,
    AnyEvent,
    ApprovalRequestedEvent,
    CheckpointCreatedEvent,
    CheckpointRestoredEvent,
    ChildCompleteEvent,
    ChildSpawnEvent,
    ChildTransitionEvent,
    ErrorEvent,
    GateDecisionEvent,
    GateRepairEvent,
    HookFinishEvent,
    HookStartEvent,
    IterationEndEvent,
    IterationStartEvent,
    PermissionDecisionEvent,
    ResultEvent,
    RotarisEvent,
    SessionEndEvent,
    SessionStartEvent,
    ToolFinishEvent,
    ToolStartEvent,
    UsageUpdateEvent,
    VerifierProgressEvent,
    VerifierResultEvent,
    parse_event,
    redact_arguments,
    redact_text,
    serialize_event,
)

if TYPE_CHECKING:
    from rotaris_core.events.observer import (
        CompositeIterationObserver,
        StreamEventObserver,
    )

#: Names served lazily by :func:`__getattr__`; see the module docstring.
_LAZY_EXPORTS = frozenset({"CompositeIterationObserver", "StreamEventObserver"})


def __getattr__(name: str) -> Any:
    """Resolve the SDK-heavy observer exports on first use, not on import."""
    if name in _LAZY_EXPORTS:
        from rotaris_core.events import observer

        return getattr(observer, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = [
    "EVENT_SCHEMA_VERSION",
    "AgentMessageEvent",
    "AnyEvent",
    "ApprovalRequestedEvent",
    "CheckpointCreatedEvent",
    "CheckpointRestoredEvent",
    "ChildCompleteEvent",
    "ChildSpawnEvent",
    "ChildTransitionEvent",
    "CompositeIterationObserver",
    "ErrorEvent",
    "EventSink",
    "GateDecisionEvent",
    "GateRepairEvent",
    "HookFinishEvent",
    "HookStartEvent",
    "IterationEndEvent",
    "IterationStartEvent",
    "PermissionDecisionEvent",
    "ResultEvent",
    "RotarisEvent",
    "SessionEndEvent",
    "SessionStartEvent",
    "StreamEventObserver",
    "ToolFinishEvent",
    "ToolStartEvent",
    "UsageUpdateEvent",
    "VerifierProgressEvent",
    "VerifierResultEvent",
    "discard_event_sink",
    "parse_event",
    "publish",
    "redact_arguments",
    "redact_text",
    "register_event_sink",
    "reset_event_registry",
    "resolve_event_sink",
    "serialize_event",
]
