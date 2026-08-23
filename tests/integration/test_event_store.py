"""Hermetic user-flow coverage for the event store (SWR-2901/2902/2903/2904).

The productive flow is one sentence: *a user runs a task, the run ends, and the
run's history is still there* — inspectable, filterable, exportable, without
re-running anything and without the original process still being alive.

The run is driven through the real ``rotaris-headless`` entry point, exactly as
``tests/integration/test_headless_stream.py`` does, faking only the agent runtime
itself (``cli.background._run_task``, the seam below which every LLM call and
subprocess lives).  That makes the events real events, produced by the real bus,
in the real order.

Nothing here attaches the store: the product does.  ``run_host.execute_run``
registers the session's store and hangs the run's bus sink off it, for *every*
run rather than only a ``--output-format stream-json`` one — which is why the
tests below assert as much about a text-mode run as about a streamed one.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

import pytest

from rotaris_core.cli import argparse_app, background
from rotaris_core.config.schema import RotarisConfig
from rotaris_core.events.bus import reset_event_registry, resolve_event_sink
from rotaris_core.events.schema import (
    ErrorEvent,
    IterationEndEvent,
    IterationStartEvent,
    PermissionDecisionEvent,
    ToolFinishEvent,
    ToolStartEvent,
    TranscriptRowEvent,
    VerifierResultEvent,
)
from rotaris_core.eventstore import (
    EventQuery,
    StoreReadWarning,
    attach_session_store,
    event_store_path,
    export_session,
    list_stored_sessions,
    read_session_events,
    replay_session,
    reset_event_store_registry,
    tail_session_events,
    trajectory_document,
    write_trajectory,
)
from rotaris_core.ralph.state import (
    RalphIterationOutcome,
    RalphIterationState,
    RalphProgressFile,
)
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.run_host import RunRequest, execute_run
from rotaris_core.session.manager import SessionManager

if TYPE_CHECKING:
    from collections.abc import Iterator
    from pathlib import Path

    from rotaris_core.events.schema import RotarisEvent

pytestmark = [pytest.mark.integration, pytest.mark.e2e]

#: Planted in a tool argument so the run has a credential to leak if anything
#: between the schema and the export ever stopped masking one.
_SECRET = "sk-live-integration-must-not-leak"


@pytest.fixture(autouse=True)
def _clean_registries() -> Iterator[None]:
    """A sink or store left registered would bleed one run into the next."""
    reset_event_registry()
    reset_event_store_registry()
    yield
    reset_event_registry()
    reset_event_store_registry()


@pytest.fixture
def headless_workspace(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """A scratch workspace whose config loads and validates without a provider."""
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    monkeypatch.setattr(
        argparse_app,
        "_load_config",
        lambda workspace_root, _config_path: RotarisConfig(workspace_root=workspace_root),
    )
    monkeypatch.setattr("rotaris_core.config.validation.validate_config", lambda _config: [])
    return workspace


def _sessions_root(workspace: Path) -> Path:
    """Where ``SessionManager`` puts sessions — asked, not re-derived."""
    return SessionManager(workspace).sessions_dir


def _only_session(workspace: Path) -> str:
    """The id of the one session the run created."""
    sessions = list_stored_sessions(_sessions_root(workspace))
    assert len(sessions) == 1, f"expected exactly one stored session, got {len(sessions)}"
    return sessions[0].session_id


def _session_dir(workspace: Path, session_id: str) -> Path:
    return _sessions_root(workspace) / session_id


def _install_scripted_run(monkeypatch: pytest.MonkeyPatch) -> None:
    """Replace the agent runtime with a scripted one emitting a realistic run.

    Two iterations, two tool calls (one carrying a credential, one failing), a
    permission denial and a failing verifier — the exact mix SWR-2903's
    acceptance criteria name — plus what the agent said while doing it, which is
    the half of a run a person actually reads (SWR-1829).
    """

    async def _fake_run_task(
        task: str,
        _config: Any,
        _session_manager: Any,
        state: Any,
        _max_iterations: int | None,
        **_kwargs: Any,
    ) -> RalphProgressFile:
        from rotaris_core.events.bus import publish

        session_id = state.session_id
        publish(session_id, IterationStartEvent(session_id=session_id, iteration=1, task=task))
        publish(
            session_id,
            TranscriptRowEvent(
                session_id=session_id,
                index=0,
                row={
                    "role": "thinking",
                    "name": "implementer-1",
                    "persona": "coder",
                    "content": "The parser probably mishandles the trailing comma.",
                },
            ),
        )
        publish(
            session_id,
            TranscriptRowEvent(
                session_id=session_id,
                index=1,
                row={
                    "role": "agent",
                    "name": "implementer-1",
                    "persona": "coder",
                    "content": "Checking the tokenizer first.",
                },
            ),
        )
        publish(
            session_id,
            ToolStartEvent(
                session_id=session_id,
                tool_name="bash",
                call_id="c1",
                arguments={"command": f"curl -H 'Authorization: Bearer {_SECRET}'"},
            ),
        )
        publish(
            session_id,
            ToolFinishEvent(
                session_id=session_id,
                tool_name="bash",
                call_id="c1",
                status="ok",
                duration_ms=12.0,
            ),
        )
        publish(
            session_id,
            PermissionDecisionEvent(
                session_id=session_id,
                tool_name="bash",
                decision="deny",
                source="rule",
                rule_id="no-network",
                summary=f"bash: curl -H 'Authorization: Bearer {_SECRET}'",
            ),
        )
        publish(session_id, IterationEndEvent(session_id=session_id, iteration=1, outcome="retry"))
        publish(session_id, IterationStartEvent(session_id=session_id, iteration=2, task=task))
        publish(
            session_id,
            ToolStartEvent(session_id=session_id, tool_name="write", call_id="c2"),
        )
        publish(
            session_id,
            ToolFinishEvent(
                session_id=session_id,
                tool_name="write",
                call_id="c2",
                status="error",
                error="permission_denied",
            ),
        )
        publish(
            session_id,
            VerifierResultEvent(
                session_id=session_id,
                iteration=2,
                passed=False,
                summary="2 tests failed",
            ),
        )
        publish(
            session_id,
            ErrorEvent(session_id=session_id, message="verifier rejected the change", fatal=False),
        )
        publish(
            session_id,
            IterationEndEvent(session_id=session_id, iteration=2, outcome="abandoned"),
        )
        return RalphProgressFile(
            session_id=session_id,
            started_at=datetime.now(UTC),
            iterations=[
                RalphIterationState(
                    iteration_number=1,
                    task_id="task-1",
                    task_name="Task 1",
                    started_at=datetime.now(UTC),
                    ended_at=datetime.now(UTC),
                    outcome=RalphIterationOutcome.COMPLETED,
                    report_summary="done",
                ),
            ],
            total_tasks=1,
            completed_tasks=1,
            abandoned_tasks=0,
            stop_reason="all tasks completed",
        )

    monkeypatch.setattr(background, "_run_task", _fake_run_task)


def _run(workspace: Path, task: str = "fix the parser", *, stream_json: bool = True) -> int:
    argv = ["run", task, "--workspace", str(workspace)]
    if stream_json:
        argv += ["--output-format", "stream-json"]
    return argparse_app.main(argv)


def _stdout_events(stdout: str) -> list[dict[str, Any]]:
    return [json.loads(line) for line in stdout.splitlines() if line.strip()]


@verifies(SWR.SWR_2901, SWR.SWR_2902)
def test_a_scripted_run_leaves_a_store_matching_the_stream_it_emitted(
    headless_workspace: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Productive use: a CI job streams a run's events and later wants the same
    history off disk.
    Expected outcome: the store holds exactly the events the stream emitted, in
    the same order, with the same envelopes — a consumer of one can read the
    other."""
    _install_scripted_run(monkeypatch)

    code = _run(headless_workspace)
    streamed = _stdout_events(capsys.readouterr().out)

    assert code == 0
    session_id = _only_session(headless_workspace)
    session_dir = _session_dir(headless_workspace, session_id)

    stored = list(read_session_events(session_dir))

    assert [s.payload for s in stored] == streamed
    assert [s.event_type for s in stored] == [event["event"] for event in streamed]
    assert stored[0].event_type == "session.start"
    assert stored[-1].event_type == "result"
    assert {"iteration.start", "tool.start", "permission.decision", "verifier.result"} <= {
        s.event_type for s in stored
    }
    assert all(s.known for s in stored)
    assert all(s.session_id == session_id for s in stored)

    # The store lives beside the evidence the session already writes.
    assert event_store_path(session_dir) == session_dir / "evidence" / "events.jsonl"
    assert (session_dir / "evidence" / "permissions.jsonl").exists()


@verifies(SWR.SWR_2901)
def test_a_run_without_a_json_stream_still_leaves_a_complete_store(
    headless_workspace: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Productive use: a user runs a task the ordinary way, with no
    ``--output-format stream-json`` and nobody consuming events.
    Expected outcome: the run leaves the same trace behind as a streamed one —
    an untraceable run was the whole gap SWR-2901 closes.  (Scope: the hosts
    that go through ``execute_run``; Rotaris' desktop bridge drives the loop
    directly and is not wired here.)"""
    _install_scripted_run(monkeypatch)

    code = _run(headless_workspace, stream_json=False)
    captured = capsys.readouterr()

    assert code == 0
    # Nothing machine-readable was printed: the history is on disk, not on stdout.
    assert "iteration.start" not in captured.out

    session_dir = _session_dir(headless_workspace, _only_session(headless_workspace))
    stored = list(read_session_events(session_dir))

    assert [s.event_type for s in stored][:2] == ["session.start", "iteration.start"]
    assert stored[-1].event_type == "result"
    assert [s.event_type for s in stored].count("result") == 1
    assert {"tool.start", "tool.finish", "permission.decision", "verifier.result"} <= {
        s.event_type for s in stored
    }
    assert json.loads(stored[-1].as_line())["result"]["status"] == "completed"


@verifies(SWR.SWR_2901, SWR.SWR_2903)
async def test_a_resumed_session_keeps_one_history_and_says_it_holds_two_runs(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a user resumes a session and later exports it for
    evaluation.
    Expected outcome: the store is per session, so the second run appends to the
    first run's history — and the export says how many runs it covers, with an
    identity that describes the most recent one rather than mixing the two."""
    _install_scripted_run(monkeypatch)
    manager = SessionManager(tmp_path)
    config = RotarisConfig(workspace_root=tmp_path)

    first = await execute_run(RunRequest(task="task A", config=config), manager)
    await execute_run(
        RunRequest(task="task B", config=config, session_id=first.session_id),
        manager,
    )

    trajectory = export_session(manager.session_dir(first.session_id))

    assert trajectory.summary.runs == 2
    # Identity and outcome describe the same run — the latest — rather than the
    # first run's task alongside the second run's status.
    assert trajectory.task == "task B"
    assert trajectory.summary.event_counts["result"] == 2

    # And the CLI does not let that pass silently.
    assert (
        argparse_app.main(
            ["events", "export", first.session_id, "-w", str(tmp_path)],
        )
        == 0
    )


@verifies(SWR.SWR_1832, SWR.SWR_2901)
async def test_the_terminal_result_event_reaches_a_bus_consumer_exactly_once(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: an SDK consumer gates its pipeline on the run's terminal
    ``result`` event.
    Expected outcome: it arrives, through the bus, while the session is still
    registered — and exactly once, so the direct write that used to bypass the
    bus cannot be re-added alongside it without this failing."""
    _install_scripted_run(monkeypatch)
    manager = SessionManager(tmp_path)
    seen: list[RotarisEvent] = []
    registered_at_delivery: list[bool] = []

    def _sink(event: RotarisEvent) -> None:
        seen.append(event)
        if event.event == "result":
            # The old code wrote the terminal event straight to the sink object
            # *after* ``discard_event_sink``; a live registration here is the
            # proof that it now travels the bus like every other event.
            registered_at_delivery.append(resolve_event_sink(event.session_id) is not None)

    result = await execute_run(
        RunRequest(task="fix the parser", config=RotarisConfig(workspace_root=tmp_path)),
        manager,
        event_sink=_sink,
    )

    names = [event.event for event in seen]
    assert names.count("result") == 1
    assert names[-1] == "result"
    assert names.index("session.end") < names.index("result")
    assert registered_at_delivery == [True]

    # The store is attached at the *registry*, never at the sink, so its holding
    # the terminal event is a second, independent proof of the bus path.
    stored = list(read_session_events(manager.session_dir(result.session_id)))
    assert [s.event_type for s in stored].count("result") == 1
    assert stored[-1].event_type == "result"
    assert stored[-1].payload == seen[-1].model_dump(mode="json")


@verifies(SWR.SWR_1832)
def test_a_streamed_run_still_ends_with_exactly_one_result_line(
    headless_workspace: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Productive use: a CI job parses stdout and reads the last line as the
    outcome.
    Expected outcome: one terminal line, still last — publishing the event
    through the bus must not also leave the old direct write on stdout."""
    _install_scripted_run(monkeypatch)

    assert _run(headless_workspace) == 0
    streamed = _stdout_events(capsys.readouterr().out)

    assert [event["event"] for event in streamed].count("result") == 1
    assert streamed[-1]["event"] == "result"
    assert streamed[-1]["result"]["status"] == "completed"


@verifies(SWR.SWR_2902)
def test_a_users_run_history_is_retrievable_after_the_run_ended(
    headless_workspace: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Productive use: a user completes a task and afterwards asks what happened —
    which tools ran, what was denied, what the verifier said.
    Expected outcome: all three answers come from the store alone, filterable by
    type and by iteration, with the run long over."""
    _install_scripted_run(monkeypatch)

    assert _run(headless_workspace) == 0
    capsys.readouterr()
    session_dir = _session_dir(headless_workspace, _only_session(headless_workspace))

    tools = list(replay_session(session_dir, EventQuery.build(event_types=["tool.start"])))
    denials = list(
        replay_session(session_dir, EventQuery.build(event_types=["permission.decision"])),
    )
    verdicts = list(replay_session(session_dir, EventQuery.build(event_types=["verifier.result"])))
    second_iteration = list(replay_session(session_dir, EventQuery.build(iterations=[2])))

    assert [t.payload["tool_name"] for t in tools] == ["bash", "write"]
    assert [d.payload["decision"] for d in denials] == ["deny"]
    assert [v.payload["passed"] for v in verdicts] == [False]
    # Everything that happened *inside* iteration 2, not merely the three event
    # types that carry an iteration field: a user asking "what happened in
    # iteration 2" means the tool calls too.
    assert [e.event_type for e in second_iteration] == [
        "iteration.start",
        "tool.start",
        "tool.finish",
        "verifier.result",
        "error",
        "iteration.end",
    ]
    assert "session.start" not in [e.event_type for e in second_iteration]
    # An empty answer is an answer, not an error.
    assert list(replay_session(session_dir, EventQuery.build(event_types=["child.spawn"]))) == []


@verifies(SWR.SWR_1829, SWR.SWR_2902, SWR.SWR_2454)
def test_a_run_in_another_process_can_be_followed_without_re_reading_it(
    headless_workspace: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Productive use: a headless run is going, and something else — a desktop
    window, a dashboard — wants to show what it is doing while it does it.
    Expected outcome: the conversation is on disk in the store, and following it
    costs what the run added rather than what it has produced in total.

    The two halves are one requirement. A cheap read of a store that carried no
    conversation would have nothing to show, and a store with the conversation
    that had to be re-read whole would get slower for exactly the long sessions
    worth watching."""
    _install_scripted_run(monkeypatch)

    assert _run(headless_workspace) == 0
    capsys.readouterr()
    session_dir = _session_dir(headless_workspace, _only_session(headless_workspace))

    # What a follower reads: the store from wherever it last got to. Read here in
    # two passes over a finished run, which is the same arithmetic a live one
    # produces and is deterministic.
    whole = list(read_session_events(session_dir))
    boundary = tail_session_events(session_dir).offset
    stopped_early = tail_session_events(session_dir, boundary // 2)
    rest = tail_session_events(session_dir, stopped_early.offset)

    assert [event.payload for event in stopped_early.events] + [
        event.payload for event in rest.events
    ] == [event.payload for event in whole[: len(stopped_early.events) + len(rest.events)]]
    assert len(stopped_early.events) + len(rest.events) == len(whole)
    assert rest.restarted is False

    said = [event for event in whole if event.event_type == "transcript.row"]
    assert [event.payload["row"]["role"] for event in said] == ["thinking", "agent"]
    assert said[1].payload["row"]["content"] == "Checking the tokenizer first."
    assert said[1].payload["row"]["name"] == "implementer-1"
    # Each row says where it goes, which is what lets a follower replace rather
    # than append when the run republishes a row it settled.
    assert [event.payload["index"] for event in said] == [0, 1]

    # And the last look, once the run is over, gains nothing and re-reads nothing.
    assert tail_session_events(session_dir, rest.offset).events == ()


@verifies(SWR.SWR_2902)
def test_an_unknown_event_and_a_truncated_tail_are_both_survivable(
    headless_workspace: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Productive use: a store written by a newer build, by a run that was then
    killed mid-write, is read by this build.
    Expected outcome: every valid event is returned, the unknown one comes back
    opaque with its payload intact, and the half-written final line produces a
    warning rather than an exception."""
    _install_scripted_run(monkeypatch)

    assert _run(headless_workspace) == 0
    streamed = _stdout_events(capsys.readouterr().out)
    session_id = _only_session(headless_workspace)
    session_dir = _session_dir(headless_workspace, session_id)
    store_path = event_store_path(session_dir)

    future = {
        "schema_version": 2,
        "event": "context.compacted",
        "timestamp": "2026-08-09T12:00:00+00:00",
        "session_id": session_id,
        "tokens_reclaimed": 4096,
    }
    with store_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(future, sort_keys=True) + "\n")
        handle.write('{"schema_version":1,"event":"iteration.st')

    warnings: list[StoreReadWarning] = []
    stored = list(read_session_events(session_dir, on_warning=warnings.append))

    assert [s.payload for s in stored[: len(streamed)]] == streamed
    assert len(stored) == len(streamed) + 1

    unknown = stored[-1]
    assert unknown.event_type == "context.compacted"
    assert unknown.known is False
    assert unknown.payload == future
    assert all(s.known for s in stored[:-1])

    assert len(warnings) == 1
    assert warnings[0].line_number == len(streamed) + 2
    assert "not valid JSON" in warnings[0].reason


@verifies(SWR.SWR_2903)
def test_a_finished_run_exports_as_one_portable_trajectory(
    headless_workspace: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Productive use: a user finishes a run and hands it to an evaluation
    harness as a single file, on a machine that never had the session directory.
    Expected outcome: the document carries every event the run emitted, its
    totals agree with those events, the planted credential is absent, and it
    still reads after the session directory is deleted."""
    _install_scripted_run(monkeypatch)

    assert _run(headless_workspace) == 0
    streamed = _stdout_events(capsys.readouterr().out)
    session_id = _only_session(headless_workspace)
    session_dir = _session_dir(headless_workspace, session_id)

    trajectory = export_session(session_dir)
    export_path = write_trajectory(trajectory, tmp_path / "exports" / f"{session_id}.json")

    assert trajectory.session_id == session_id
    assert trajectory.task == "fix the parser"
    assert trajectory.workspace == str(headless_workspace)
    assert trajectory.truncated is False
    assert trajectory.events == streamed

    summary = trajectory.summary
    assert summary.event_count == len(streamed)
    assert summary.tool_calls == 2
    assert summary.tool_failures == 1
    assert summary.permission_denials == 1
    assert summary.verifier_failures == 1
    assert summary.iterations == 2
    assert summary.errors == 1
    assert sum(summary.event_counts.values()) == summary.event_count
    assert summary.read_warning_count == 0

    document = export_path.read_text(encoding="utf-8")
    assert _SECRET not in document
    assert "bash" in document

    # Portability: the file alone is enough, session directory or not.
    reloaded = json.loads(document)
    assert reloaded == trajectory_document(trajectory)
    assert reloaded["summary"]["tool_calls"] == 2
    assert len(reloaded["events"]) == len(streamed)


@verifies(SWR.SWR_2901, SWR.SWR_2903)
def test_a_capped_store_keeps_the_newest_events_and_says_so(
    headless_workspace: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Productive use: a long run would otherwise fill the session directory.
    Expected outcome: the store stays bounded, keeps the run's *newest* events,
    and its export is explicitly marked truncated rather than passing a partial
    run off as complete."""
    # The cap is a parameter of the store, not a config knob, so the run's own
    # wiring is the only place a test can shrink it.
    monkeypatch.setattr(
        "rotaris_core.run_host.attach_session_store",
        lambda session_dir, **kwargs: attach_session_store(
            session_dir,
            **{**kwargs, "max_events": 4},
        ),
    )
    _install_scripted_run(monkeypatch)

    assert _run(headless_workspace) == 0
    streamed = _stdout_events(capsys.readouterr().out)
    session_dir = _session_dir(headless_workspace, _only_session(headless_workspace))

    stored = list(read_session_events(session_dir))
    trajectory = export_session(session_dir)

    assert len(streamed) > 4, "the scripted run must overrun the cap for this to mean anything"
    assert len(stored) == 4
    assert [s.payload for s in stored] == streamed[-4:], "the cap must keep the newest events"
    assert trajectory.truncated is True
    assert trajectory.dropped_events == len(streamed) - 4
    assert trajectory.summary.event_count == 4


@verifies(SWR.SWR_2904, SWR.SWR_2901)
def test_a_finished_run_is_listed_replayed_and_exported_from_the_cli_alone(
    headless_workspace: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Productive use: a user finishes a run and, with nothing but the CLI,
    finds it, replays what happened and exports it for evaluation.
    Expected outcome: ``list`` names the session, ``replay --json`` reproduces
    the live stream byte for byte, and ``export`` totals agree with both."""
    _install_scripted_run(monkeypatch)

    assert _run(headless_workspace) == 0
    streamed_lines = [line for line in capsys.readouterr().out.splitlines() if line.strip()]
    session_id = _only_session(headless_workspace)

    assert argparse_app.main(["events", "list", "-w", str(headless_workspace)]) == 0
    listing = capsys.readouterr().out

    assert (
        argparse_app.main(
            ["events", "replay", session_id, "--json", "-w", str(headless_workspace)],
        )
        == 0
    )
    replayed_lines = [line for line in capsys.readouterr().out.splitlines() if line.strip()]

    assert (
        argparse_app.main(
            [
                "events",
                "replay",
                session_id,
                "--json",
                "-t",
                "tool.start",
                "-w",
                str(headless_workspace),
            ],
        )
        == 0
    )
    tool_lines = [line for line in capsys.readouterr().out.splitlines() if line.strip()]

    export_path = tmp_path / "trajectory.json"
    assert (
        argparse_app.main(
            ["events", "export", session_id, "-o", str(export_path), "-w", str(headless_workspace)],
        )
        == 0
    )
    capsys.readouterr()

    assert session_id in listing
    assert f"{len(streamed_lines)} events" in listing
    # Byte-identical, not merely equivalent: a consumer of the live stream must
    # be able to read a replay without knowing which it got.
    assert replayed_lines == streamed_lines
    assert tool_lines == [
        line for line in streamed_lines if json.loads(line)["event"] == "tool.start"
    ]

    document = json.loads(export_path.read_text(encoding="utf-8"))
    assert document["session_id"] == session_id
    assert document["summary"]["event_count"] == len(streamed_lines)
    assert document["events"] == [json.loads(line) for line in streamed_lines]


@verifies(SWR.SWR_2904)
def test_the_cli_refuses_a_session_that_never_ran_here(
    headless_workspace: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Productive use: a user replays a session id copied from another machine.
    Expected outcome: a non-zero exit naming the workspace that was searched,
    rather than an empty successful replay that looks like "nothing happened"."""
    _install_scripted_run(monkeypatch)
    assert _run(headless_workspace) == 0
    capsys.readouterr()

    code = argparse_app.main(["events", "replay", "elsewhere", "-w", str(headless_workspace)])
    captured = capsys.readouterr()

    assert code == 2
    assert "elsewhere" in captured.err
    assert str(headless_workspace) in captured.err
