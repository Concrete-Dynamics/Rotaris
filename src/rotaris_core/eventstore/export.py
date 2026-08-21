"""Trajectory export — one self-contained document per run (SWR-2903).

A *trajectory* is what an evaluation harness, a regression comparison or a bug
report actually needs: the run's identity, its ordered events, and a summary
block that gives the shape of the run without parsing every line.

Four properties are the requirement:

* **Portable.**  The document records the workspace root the run itself
  reported and nothing else about the producing machine — no session directory,
  no temp paths — and it is plain JSON, so consuming it needs neither the agent
  SDK nor a live session directory.
* **Redaction inherited, never re-implemented.**  Event payloads are copied
  verbatim from the store, and the store holds exactly what the wire schema
  emitted, which the schema's validators already masked.  There is no second
  masking pass here because a second implementation is a second thing to get
  wrong: an export can only contain a credential if the stream did.
* **Truncation visible.**  A capped store (SWR-2901) exports with
  ``truncated=True`` and the number of dropped events, so a partial run is never
  presented as a complete one.
* **Batchable.**  A set of sessions exports as one document, so a batch of runs
  can be evaluated together.

Unknown event types survive the export intact: they are counted separately in
the summary and their payloads are written through unchanged, for the same
forward-compatibility reason the reader keeps them opaque.
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path
from typing import TYPE_CHECKING, Any

from pydantic import BaseModel, ConfigDict, Field

from rotaris_core.eventstore.reader import read_session_events
from rotaris_core.eventstore.writer import read_store_metadata
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Callable, Iterable

    from rotaris_core.eventstore.reader import StoredEvent, StoreReadWarning
    from rotaris_core.eventstore.writer import StoreMetadata

#: Version of the trajectory document format.  Independent of
#: ``EVENT_SCHEMA_VERSION``: the events inside carry their own version, and a
#: change to the wrapper is not a change to the wire format.
TRAJECTORY_SCHEMA_VERSION = 1

#: Event types the summary counts by name.  Kept here rather than imported from
#: the schema so an export of a store written by a newer build still counts what
#: it recognizes instead of failing on what it does not.
_SESSION_START = "session.start"
_SESSION_END = "session.end"
_ITERATION_START = "iteration.start"
_TOOL_START = "tool.start"
_TOOL_FINISH = "tool.finish"
_PERMISSION_DECISION = "permission.decision"
_VERIFIER_RESULT = "verifier.result"
_CHILD_SPAWN = "child.spawn"
_USAGE_UPDATE = "usage.update"
_ERROR = "error"
_RESULT = "result"


@traces(SWR.SWR_2903)
class TrajectorySummary(BaseModel):
    """Aggregate shape of a run, derived from its events alone.

    Every number here is recomputed from the exported event list, so a summary
    can never disagree with the events it accompanies.
    """

    model_config = ConfigDict(extra="ignore")

    event_count: int = 0
    unknown_event_count: int = 0
    read_warning_count: int = 0
    #: How many runs this store holds.  One for an ordinary session; more when
    #: the session was resumed, because the store is per *session* (SWR-2901)
    #: and a resumed run appends to the history it is continuing.  A consumer
    #: that needs a single run must split on the ``session.start`` boundaries
    #: rather than read this document as one.
    runs: int = 0
    iterations: int = 0
    iterations_completed: int = 0
    tool_calls: int = 0
    tool_failures: int = 0
    permission_decisions: int = 0
    permission_denials: int = 0
    verifier_runs: int = 0
    verifier_failures: int = 0
    child_agents: int = 0
    errors: int = 0
    fatal_errors: int = 0
    #: Per-``event`` totals, including unknown types.
    event_counts: dict[str, int] = Field(default_factory=dict)
    #: A serialized ``rotaris_core.tokens.TokenSnapshot``, as the run reported it.
    tokens: dict[str, Any] | None = None
    #: A serialized ``rotaris_core.cost.CostSnapshot``, as the run reported it.
    cost: dict[str, Any] | None = None


@traces(SWR.SWR_2903)
class Trajectory(BaseModel):
    """One run, self-contained: identity, ordered events, summary.

    ``events`` holds the raw stored payloads rather than reconstructed models —
    that is what makes a trajectory of a newer store readable by an older build,
    and what guarantees the export says exactly what the stream said.
    """

    model_config = ConfigDict(extra="ignore")

    trajectory_version: int = TRAJECTORY_SCHEMA_VERSION
    session_id: str = ""
    task: str = ""
    workspace: str = ""
    persona: str = ""
    permission_mode: str = ""
    started_at: str = ""
    ended_at: str = ""
    status: str = ""
    stop_reason: str = ""
    duration_seconds: float | None = None
    #: ``True`` when the store dropped events to stay under its cap (SWR-2901).
    truncated: bool = False
    dropped_events: int = 0
    summary: TrajectorySummary = Field(default_factory=TrajectorySummary)
    events: list[dict[str, Any]] = Field(default_factory=list)


def _as_dict(value: Any) -> dict[str, Any] | None:
    """Keep a payload sub-object only when it really is a JSON object."""
    return value if isinstance(value, dict) else None


def _as_int(value: Any) -> int:
    """Read an int field defensively; ``bool`` is not an iteration count."""
    return value if isinstance(value, int) and not isinstance(value, bool) else 0


def _as_str(value: Any) -> str:
    """Read a string field defensively."""
    return value if isinstance(value, str) else ""


@traces(SWR.SWR_2903)
def build_trajectory(
    events: Iterable[StoredEvent],
    *,
    session_id: str = "",
    metadata: StoreMetadata | None = None,
    read_warnings: int = 0,
) -> Trajectory:
    """Fold an ordered event stream into one trajectory document.

    Consumes *events* once, in order, so it works directly on the reader's
    generator.  The events are materialized here — a trajectory is by definition
    a whole document — which is why streaming lives in the reader and not here.
    """
    payloads: list[dict[str, Any]] = []
    counts: Counter[str] = Counter()
    summary = TrajectorySummary(read_warning_count=read_warnings)
    iterations_seen: set[int] = set()
    resolved_session_id = session_id

    for stored in events:
        payload = stored.payload
        payloads.append(payload)
        event_type = stored.event_type
        counts[event_type] += 1
        if not stored.known:
            summary.unknown_event_count += 1
        if not resolved_session_id:
            resolved_session_id = stored.session_id

        if event_type == _ITERATION_START:
            iteration = stored.iteration
            if iteration is not None:
                iterations_seen.add(iteration)
        elif event_type == _TOOL_START:
            summary.tool_calls += 1
        elif event_type == _TOOL_FINISH:
            if payload.get("error"):
                summary.tool_failures += 1
        elif event_type == _PERMISSION_DECISION:
            summary.permission_decisions += 1
            if _as_str(payload.get("decision")) == "deny":
                summary.permission_denials += 1
        elif event_type == _VERIFIER_RESULT:
            summary.verifier_runs += 1
            if not payload.get("passed"):
                summary.verifier_failures += 1
        elif event_type == _CHILD_SPAWN:
            summary.child_agents += 1
        elif event_type == _ERROR:
            summary.errors += 1
            if payload.get("fatal"):
                summary.fatal_errors += 1

        if event_type in (_SESSION_END, _USAGE_UPDATE):
            # Latest wins: ``usage.update`` is cumulative and ``session.end``
            # carries the final figure, so the last one seen is the total.
            tokens = _as_dict(payload.get("tokens"))
            cost = _as_dict(payload.get("cost"))
            if tokens is not None:
                summary.tokens = tokens
            if cost is not None:
                summary.cost = cost

    summary.event_count = len(payloads)
    summary.iterations = len(iterations_seen)
    summary.runs = counts[_SESSION_START]
    summary.event_counts = dict(sorted(counts.items()))

    trajectory = Trajectory(
        session_id=resolved_session_id,
        started_at=_as_str(payloads[0].get("timestamp")) if payloads else "",
        ended_at=_as_str(payloads[-1].get("timestamp")) if payloads else "",
        summary=summary,
        events=payloads,
    )
    _apply_identity(trajectory, payloads)
    if metadata is not None:
        trajectory.truncated = metadata.truncated
        trajectory.dropped_events = metadata.dropped_events
    return trajectory


def _apply_identity(trajectory: Trajectory, payloads: list[dict[str, Any]]) -> None:
    """Fill the run's identity and outcome from its lifecycle events.

    ``session.start`` names the run, ``session.end`` and ``result`` report how it
    went.  Read here in a second pass because they are three events out of
    potentially thousands and folding them into the counting loop would spread
    identity logic across it.

    All three are read from the **last** occurrence, and that agreement is the
    point: a resumed session's store holds several runs, and taking the task
    from the first ``session.start`` while taking the status from the last
    ``session.end`` would describe one run with another run's outcome.
    ``summary.runs`` is what tells a consumer the document covers more than one.
    """
    for payload in reversed(payloads):
        if _as_str(payload.get("event")) != _SESSION_START:
            continue
        trajectory.task = _as_str(payload.get("task"))
        trajectory.workspace = _as_str(payload.get("workspace"))
        trajectory.persona = _as_str(payload.get("persona"))
        trajectory.permission_mode = _as_str(payload.get("permission_mode"))
        break

    for payload in reversed(payloads):
        event_type = _as_str(payload.get("event"))
        if event_type == _SESSION_END:
            trajectory.status = _as_str(payload.get("status"))
            trajectory.stop_reason = _as_str(payload.get("stop_reason"))
            duration = payload.get("duration_seconds")
            if isinstance(duration, int | float) and not isinstance(duration, bool):
                trajectory.duration_seconds = float(duration)
            trajectory.summary.iterations_completed = _as_int(payload.get("iterations_completed"))
            break

    if not trajectory.status:
        for payload in reversed(payloads):
            if _as_str(payload.get("event")) != _RESULT:
                continue
            result = _as_dict(payload.get("result")) or {}
            trajectory.status = _as_str(result.get("status"))
            trajectory.stop_reason = _as_str(result.get("stop_reason"))
            break


@traces(SWR.SWR_2903)
def export_session(
    session_dir: Path | str,
    *,
    session_id: str = "",
    on_warning: Callable[[StoreReadWarning], None] | None = None,
) -> Trajectory:
    """Export one stored session as a trajectory.

    Counts the reader's warnings into the summary: a document built from a store
    with a corrupt line should say so, not quietly present fewer events.
    """
    directory = Path(session_dir)
    warnings: list[StoreReadWarning] = []

    def _collect(warning: StoreReadWarning) -> None:
        warnings.append(warning)
        if on_warning is not None:
            on_warning(warning)

    events = list(read_session_events(directory, on_warning=_collect))
    trajectory = build_trajectory(
        events,
        session_id=session_id,
        metadata=read_store_metadata(directory),
        read_warnings=len(warnings),
    )
    if not trajectory.session_id:
        # Only when the events themselves carry no id.  Preferring the directory
        # name would make a copied or archived session export under its folder's
        # name while every event inside it still says otherwise — in a document
        # whose whole point is portable run identity.
        trajectory.session_id = directory.name
    return trajectory


@traces(SWR.SWR_2903)
def export_sessions(
    session_dirs: Iterable[Path | str],
    *,
    on_warning: Callable[[StoreReadWarning], None] | None = None,
) -> list[Trajectory]:
    """Export a batch of sessions, one trajectory each, in the order given."""
    return [export_session(directory, on_warning=on_warning) for directory in session_dirs]


@traces(SWR.SWR_2903)
def trajectory_document(trajectory: Trajectory) -> dict[str, Any]:
    """Render one trajectory as a plain JSON-safe object."""
    return trajectory.model_dump(mode="json")


@traces(SWR.SWR_2903)
def batch_document(trajectories: Iterable[Trajectory]) -> dict[str, Any]:
    """Render several trajectories as one evaluation-batch document."""
    items = [trajectory_document(trajectory) for trajectory in trajectories]
    return {
        "trajectory_version": TRAJECTORY_SCHEMA_VERSION,
        "count": len(items),
        "trajectories": items,
    }


@traces(SWR.SWR_2903)
def write_trajectory(trajectory: Trajectory, path: Path | str) -> Path:
    """Write one trajectory to *path* as pretty-printed JSON.

    ``atomic_write`` rather than a plain write for the same reason every other
    artifact in this repo uses it: a half-written export read by a harness is
    worse than no export.
    """
    return _write_json(trajectory_document(trajectory), Path(path))


@traces(SWR.SWR_2903)
def write_trajectories(trajectories: Iterable[Trajectory], path: Path | str) -> Path:
    """Write a batch document to *path* as pretty-printed JSON."""
    return _write_json(batch_document(trajectories), Path(path))


def _write_json(document: dict[str, Any], path: Path) -> Path:
    """Serialize and atomically write one export document."""
    from rotaris_core.fs import atomic_write

    path.parent.mkdir(parents=True, exist_ok=True)
    atomic_write(path, json.dumps(document, sort_keys=True, indent=2, default=str) + "\n")
    return path
