"""Durable event store: persist (SWR-2901), replay (SWR-2902), export (SWR-2903).

The runtime event stream (SWR-1828/SWR-1829) is emission-only — once a run ends,
what it emitted is gone unless someone was listening.  This package is the other
half: every event a run emits is appended to
``<session_dir>/evidence/events.jsonl`` in emission order, read back without
re-running anything, and exported as a self-contained trajectory an evaluation
harness can consume.

Import from this package, not from its modules — the split between ``writer``,
``reader``, ``query`` and ``export`` is an implementation detail.

Kept import-light for the same reason ``rotaris_core.events`` is: nothing here
reaches ``rotaris_core.tools`` or ``rotaris_core.config``, both of which pull in
the agent SDK and cost seconds.  A tool that reads a stored session must not have
to boot a runtime to do it.
"""

from rotaris_core.eventstore.display import (
    format_replay_row,
    format_stored_session_rows,
)
from rotaris_core.eventstore.export import (
    TRAJECTORY_SCHEMA_VERSION,
    Trajectory,
    TrajectorySummary,
    batch_document,
    build_trajectory,
    export_session,
    export_sessions,
    trajectory_document,
    write_trajectories,
    write_trajectory,
)
from rotaris_core.eventstore.query import (
    EventQuery,
    iter_with_iteration,
    parse_timestamp,
    query_events,
    replay_session,
)
from rotaris_core.eventstore.reader import (
    KNOWN_EVENT_TYPES,
    StoredEvent,
    StoreReadWarning,
    StoreTail,
    read_event_models,
    read_events,
    read_session_events,
    tail_events,
    tail_session_events,
)
from rotaris_core.eventstore.sessions import (
    StoredSession,
    has_event_store,
    list_stored_sessions,
    resolve_stored_session,
    summarize_stored_session,
)
from rotaris_core.eventstore.sink import (
    StoringEventSink,
    attach_session_store,
    detach_session_store,
    session_store_of,
)
from rotaris_core.eventstore.writer import (
    DEFAULT_MAX_EVENTS,
    EVENT_STORE_FILENAME,
    EVENT_STORE_METADATA_FILENAME,
    SessionEventStore,
    StoreMetadata,
    discard_event_store,
    event_store_metadata_path,
    event_store_path,
    open_session_store,
    read_store_metadata,
    register_event_store,
    reset_event_store_registry,
    resolve_event_store,
    resolve_store_session_id,
    store_event,
)

__all__ = [
    "DEFAULT_MAX_EVENTS",
    "EVENT_STORE_FILENAME",
    "EVENT_STORE_METADATA_FILENAME",
    "KNOWN_EVENT_TYPES",
    "TRAJECTORY_SCHEMA_VERSION",
    "EventQuery",
    "SessionEventStore",
    "StoreMetadata",
    "StoreReadWarning",
    "StoreTail",
    "StoredEvent",
    "StoredSession",
    "StoringEventSink",
    "Trajectory",
    "TrajectorySummary",
    "attach_session_store",
    "batch_document",
    "build_trajectory",
    "detach_session_store",
    "discard_event_store",
    "event_store_metadata_path",
    "event_store_path",
    "export_session",
    "export_sessions",
    "format_replay_row",
    "format_stored_session_rows",
    "has_event_store",
    "iter_with_iteration",
    "list_stored_sessions",
    "open_session_store",
    "parse_timestamp",
    "query_events",
    "read_event_models",
    "read_events",
    "read_session_events",
    "read_store_metadata",
    "register_event_store",
    "replay_session",
    "reset_event_store_registry",
    "resolve_event_store",
    "resolve_store_session_id",
    "resolve_stored_session",
    "session_store_of",
    "store_event",
    "summarize_stored_session",
    "tail_events",
    "tail_session_events",
    "trajectory_document",
    "write_trajectories",
    "write_trajectory",
]
