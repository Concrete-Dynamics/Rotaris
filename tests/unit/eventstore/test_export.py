"""Unit coverage for trajectory export (SWR-2903).

A trajectory is the artifact an evaluation harness, a regression comparison or a
bug report consumes.  It has to be honest about what the run did (summary counts
that match the events), honest about what it does *not* contain (truncation),
and it must not become a new place for a credential to escape.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

from rotaris_core.events.schema import (
    ChildSpawnEvent,
    ErrorEvent,
    IterationEndEvent,
    IterationStartEvent,
    PermissionDecisionEvent,
    ResultEvent,
    SessionEndEvent,
    SessionStartEvent,
    ToolFinishEvent,
    ToolStartEvent,
    UsageUpdateEvent,
    VerifierResultEvent,
    serialize_event,
)
from rotaris_core.eventstore.export import (
    TRAJECTORY_SCHEMA_VERSION,
    Trajectory,
    batch_document,
    build_trajectory,
    export_session,
    export_sessions,
    trajectory_document,
    write_trajectories,
    write_trajectory,
)
from rotaris_core.eventstore.reader import StoredEvent, read_events
from rotaris_core.eventstore.writer import open_session_store
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from pathlib import Path

_SECRET = "sk-live-do-not-leak-me"


def _run_events(session_id: str = "run-1") -> list[Any]:
    """A run with tool calls, a permission denial and a verifier failure."""
    return [
        SessionStartEvent(
            session_id=session_id,
            task="fix the parser",
            workspace="/repo",
            persona="developer",
            permission_mode="ask",
        ),
        IterationStartEvent(session_id=session_id, iteration=1, task="fix the parser"),
        ToolStartEvent(
            session_id=session_id,
            tool_name="bash",
            call_id="c1",
            arguments={"command": f"curl -H 'Authorization: Bearer {_SECRET}'"},
        ),
        ToolFinishEvent(session_id=session_id, tool_name="bash", call_id="c1", status="ok"),
        PermissionDecisionEvent(
            session_id=session_id,
            tool_name="bash",
            decision="deny",
            source="rule",
            rule_id="no-network",
            summary=f"bash: curl -H 'Authorization: Bearer {_SECRET}'",
        ),
        ToolStartEvent(session_id=session_id, tool_name="write", call_id="c2"),
        ToolFinishEvent(
            session_id=session_id,
            tool_name="write",
            call_id="c2",
            status="error",
            error="permission_denied",
        ),
        ChildSpawnEvent(session_id=session_id, child_id="k1", agent_name="researcher"),
        VerifierResultEvent(session_id=session_id, iteration=1, passed=False, summary="tests fail"),
        ErrorEvent(session_id=session_id, message="verifier failed", fatal=False),
        IterationEndEvent(session_id=session_id, iteration=1, outcome="abandoned"),
        UsageUpdateEvent(session_id=session_id, tokens={"total": 10}, cost={"total_usd": 0.1}),
        SessionEndEvent(
            session_id=session_id,
            status="failed",
            stop_reason="verifier rejected the change",
            iterations_completed=1,
            duration_seconds=12.5,
            tokens={"total": 42},
            cost={"total_usd": 0.5},
        ),
        ResultEvent(session_id=session_id, result={"status": "failed", "session_id": session_id}),
    ]


def _store_run(session_dir: Path, session_id: str = "run-1") -> Path:
    store = open_session_store(session_dir, max_events=None)
    for event in _run_events(session_id):
        store.append(event)
    return session_dir


def _stored(events: list[Any]) -> list[StoredEvent]:
    return list(read_events([serialize_event(event) for event in events]))


@verifies(SWR.SWR_2903)
def test_the_summary_counts_match_the_exported_events() -> None:
    """Productive use: an evaluation harness needs the shape of a run without
    parsing every line.
    Expected outcome: a run with tool calls, a permission denial and a verifier
    failure exports all three, and every summary number agrees with the events
    the document itself carries."""
    trajectory = build_trajectory(_stored(_run_events()))
    summary = trajectory.summary

    assert summary.event_count == len(trajectory.events)
    assert summary.tool_calls == 2
    assert summary.tool_failures == 1
    assert summary.permission_decisions == 1
    assert summary.permission_denials == 1
    assert summary.verifier_runs == 1
    assert summary.verifier_failures == 1
    assert summary.child_agents == 1
    assert summary.errors == 1
    assert summary.fatal_errors == 0
    assert summary.iterations == 1
    assert summary.iterations_completed == 1
    assert summary.unknown_event_count == 0
    assert summary.event_counts["tool.start"] == 2
    assert sum(summary.event_counts.values()) == summary.event_count
    # session.end carries the final figures and wins over the earlier update.
    assert summary.tokens == {"total": 42}
    assert summary.cost == {"total_usd": 0.5}


@verifies(SWR.SWR_2903)
def test_the_trajectory_carries_the_runs_identity_and_outcome() -> None:
    """Productive use: a bug report has to say which run it describes.
    Expected outcome: session id, task, workspace and the terminal status come
    from the run's own lifecycle events."""
    trajectory = build_trajectory(_stored(_run_events()))

    assert trajectory.trajectory_version == TRAJECTORY_SCHEMA_VERSION
    assert trajectory.session_id == "run-1"
    assert trajectory.task == "fix the parser"
    assert trajectory.workspace == "/repo"
    assert trajectory.persona == "developer"
    assert trajectory.permission_mode == "ask"
    assert trajectory.status == "failed"
    assert trajectory.stop_reason == "verifier rejected the change"
    assert trajectory.duration_seconds == 12.5
    assert trajectory.started_at == trajectory.events[0]["timestamp"]
    assert trajectory.ended_at == trajectory.events[-1]["timestamp"]


@verifies(SWR.SWR_2903)
def test_the_outcome_falls_back_to_the_result_event() -> None:
    """Productive use: a run is killed before it could emit session.end.
    Expected outcome: the terminal result event still supplies the status, so a
    trajectory is never silently statusless."""
    events = [
        SessionStartEvent(session_id="run-2", task="t"),
        ResultEvent(
            session_id="run-2",
            result={"status": "interrupted", "stop_reason": "user pressed Ctrl-C"},
        ),
    ]

    trajectory = build_trajectory(_stored(events))

    assert trajectory.status == "interrupted"
    assert trajectory.stop_reason == "user pressed Ctrl-C"


@verifies(SWR.SWR_2903)
def test_a_credential_in_a_tool_argument_appears_nowhere_in_the_export(tmp_path: Path) -> None:
    """Productive use: a run passes an API key to a shell tool and the run is
    later exported for evaluation.
    Expected outcome: the export contains the tool call but not the credential —
    the masking the schema applied is inherited, never undone."""
    session_dir = _store_run(tmp_path / "run-1")

    trajectory = export_session(session_dir)
    document = json.dumps(trajectory_document(trajectory))

    assert _SECRET not in document
    assert "bash" in document, "the export must still describe the call that was masked"
    assert "***" in document


@verifies(SWR.SWR_2903)
def test_a_truncated_store_exports_as_explicitly_truncated(tmp_path: Path) -> None:
    """Productive use: a runaway run exceeded its store cap and is exported.
    Expected outcome: the document says it is truncated and how many events were
    dropped, instead of presenting a partial run as complete."""
    session_dir = tmp_path / "run-capped"
    store = open_session_store(session_dir, max_events=4)
    for iteration in range(1, 11):
        store.append(IterationStartEvent(session_id="run-capped", iteration=iteration))

    trajectory = export_session(session_dir)

    assert trajectory.truncated is True
    assert trajectory.dropped_events == 6
    assert trajectory.summary.event_count == 4

    intact = export_session(_store_run(tmp_path / "run-1"))
    assert intact.truncated is False
    assert intact.dropped_events == 0


@verifies(SWR.SWR_2903)
def test_unknown_events_survive_the_export_and_are_counted(tmp_path: Path) -> None:
    """Productive use: a store written by a newer build is exported by an older
    one.
    Expected outcome: the unknown events are written through unchanged and
    counted separately, so nothing is lost and nothing is misreported."""
    session_dir = tmp_path / "run-future"
    store = open_session_store(session_dir, max_events=None)
    store.append(SessionStartEvent(session_id="run-future", task="t"))
    store.append_line(
        json.dumps(
            {
                "schema_version": 2,
                "event": "context.compacted",
                "timestamp": "2026-08-09T12:00:00+00:00",
                "session_id": "run-future",
                "tokens_reclaimed": 4096,
            },
            sort_keys=True,
        ),
    )

    trajectory = export_session(session_dir)

    assert trajectory.summary.unknown_event_count == 1
    assert trajectory.summary.event_counts["context.compacted"] == 1
    assert trajectory.events[1]["tokens_reclaimed"] == 4096


@verifies(SWR.SWR_2903)
def test_a_corrupt_line_is_reported_in_the_summary(tmp_path: Path) -> None:
    """Productive use: a killed run's store is exported for a bug report.
    Expected outcome: the export succeeds and records that a line could not be
    read, rather than quietly showing fewer events."""
    session_dir = _store_run(tmp_path / "run-1")
    with (session_dir / "evidence" / "events.jsonl").open("a", encoding="utf-8") as handle:
        handle.write('{"event":"iteration.st')

    trajectory = export_session(session_dir)

    assert trajectory.summary.read_warning_count == 1
    assert trajectory.summary.event_count == len(_run_events())


@verifies(SWR.SWR_2903)
def test_the_export_is_portable_and_needs_no_session_directory(tmp_path: Path) -> None:
    """Productive use: a trajectory is handed to another tool on another machine.
    Expected outcome: it round-trips through plain JSON, records only the
    workspace root the run itself reported, and stays readable after the session
    directory is gone."""
    session_dir = _store_run(tmp_path / "run-1")
    target = tmp_path / "exports" / "run-1.json"

    write_trajectory(export_session(session_dir), target)
    # Deepest-first, so every directory is empty by the time it is removed.
    for child in sorted(session_dir.rglob("*"), reverse=True):
        if child.is_file():
            child.unlink()
        else:
            child.rmdir()
    session_dir.rmdir()

    document = json.loads(target.read_text(encoding="utf-8"))
    restored = Trajectory.model_validate(document)

    assert not session_dir.exists()
    assert restored.session_id == "run-1"
    assert restored.workspace == "/repo"
    assert restored.summary.tool_calls == 2
    assert len(restored.events) == len(_run_events())
    assert str(tmp_path) not in target.read_text(encoding="utf-8")


@verifies(SWR.SWR_2903)
def test_several_sessions_export_as_one_evaluation_batch(tmp_path: Path) -> None:
    """Productive use: a set of runs is evaluated together.
    Expected outcome: exporting a batch yields one document holding one
    trajectory per session, in the order asked for."""
    first = _store_run(tmp_path / "run-1", "run-1")
    second = _store_run(tmp_path / "run-2", "run-2")

    trajectories = export_sessions([first, second])
    document = batch_document(trajectories)

    assert [t.session_id for t in trajectories] == ["run-1", "run-2"]
    assert document["count"] == 2
    assert [t["session_id"] for t in document["trajectories"]] == ["run-1", "run-2"]

    target = write_trajectories(trajectories, tmp_path / "batch.json")
    reloaded = json.loads(target.read_text(encoding="utf-8"))
    assert reloaded["count"] == 2
    assert reloaded["trajectories"][1]["summary"]["tool_calls"] == 2


@verifies(SWR.SWR_2903)
def test_the_run_identity_comes_from_the_events_not_the_folder(tmp_path: Path) -> None:
    """Productive use: a session directory is copied or archived under a new name
    and then exported.
    Expected outcome: the trajectory reports the session id the run itself
    recorded, so the document never disagrees with the events it contains."""
    archived = tmp_path / "sessions-backup" / "copy-of-a-run"
    archived.mkdir(parents=True)
    _store_run(archived, "run-1")

    trajectory = export_session(archived)

    assert trajectory.session_id == "run-1"
    assert {event["session_id"] for event in trajectory.events} == {"run-1"}
    # An explicit id still wins over both.
    assert export_session(archived, session_id="override").session_id == "override"


@verifies(SWR.SWR_2903)
def test_an_empty_session_exports_as_an_empty_trajectory(tmp_path: Path) -> None:
    """Productive use: a session that never emitted anything is exported.
    Expected outcome: a valid, empty document rather than an error."""
    session_dir = tmp_path / "run-empty"
    open_session_store(session_dir)

    trajectory = export_session(session_dir)

    assert trajectory.session_id == "run-empty"
    assert trajectory.events == []
    assert trajectory.summary.event_count == 0
    assert trajectory.started_at == ""
    assert trajectory.status == ""
