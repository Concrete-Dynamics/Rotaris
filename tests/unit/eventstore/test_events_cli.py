"""The ``events`` command group over stored sessions (SWR-2904).

Both surfaces are exercised — the Typer CLI a user types and the argparse
headless one a CI job calls — because the requirement is that they behave the
same, and the only way a divergence shows up is by asserting it.

The store is written directly here rather than by running an agent: what is
under test is the command layer (filters, exit codes, rendering), and
``tests/integration/test_event_store.py`` covers the same commands over a real
run's store.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

import pytest
from typer.testing import CliRunner

from rotaris_core.cli import argparse_app
from rotaris_core.cli.app import app
from rotaris_core.events.schema import (
    IterationEndEvent,
    IterationStartEvent,
    ResultEvent,
    SessionStartEvent,
    ToolStartEvent,
)
from rotaris_core.eventstore import SessionEventStore
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from pathlib import Path

    from rotaris_core.events.schema import RotarisEvent

pytestmark = pytest.mark.unit

_SESSION = "cli00001"

runner = CliRunner()


def _events(session_id: str = _SESSION) -> list[RotarisEvent]:
    """A small but realistic run: two iterations with a tool call in each."""
    return [
        SessionStartEvent(session_id=session_id, task="fix the parser", workspace="/w"),
        IterationStartEvent(session_id=session_id, iteration=1, task="fix the parser"),
        ToolStartEvent(session_id=session_id, tool_name="bash", call_id="c1"),
        IterationEndEvent(session_id=session_id, iteration=1, outcome="retry"),
        IterationStartEvent(session_id=session_id, iteration=2, task="fix the parser"),
        ToolStartEvent(session_id=session_id, tool_name="write", call_id="c2"),
        IterationEndEvent(session_id=session_id, iteration=2, outcome="completed"),
        ResultEvent(session_id=session_id, result={"status": "completed", "exit_code": 0}),
    ]


@pytest.fixture
def workspace(tmp_path: Path) -> Path:
    """A workspace with one stored session, laid out as ``SessionManager`` does."""
    session_dir = tmp_path / ".rotaris" / "sessions" / _SESSION
    store = SessionEventStore(session_dir, session_id=_SESSION, max_events=None)
    store.initialize()
    for event in _events():
        store.append(event)
    return tmp_path


def _lines(output: str) -> list[str]:
    return [line for line in output.splitlines() if line.strip()]


@verifies(SWR.SWR_2904)
def test_list_names_the_stored_session_with_its_size(workspace: Path) -> None:
    """Productive use: a user comes back to a workspace and asks what they can
    replay.
    Expected outcome: the session id they need for every other command, with
    enough context to recognise the run."""
    result = runner.invoke(app, ["events", "list", "--workspace", str(workspace)])

    assert result.exit_code == 0
    assert _SESSION in result.output
    assert "8 events" in result.output


@verifies(SWR.SWR_2904)
def test_list_says_so_when_no_run_has_been_stored(tmp_path: Path) -> None:
    """Productive use: a user asks for stored runs in a fresh workspace.
    Expected outcome: a sentence naming the workspace and exit 0 — nothing has
    run yet, which is an answer rather than a failure."""
    result = runner.invoke(app, ["events", "list", "--workspace", str(tmp_path)])

    assert result.exit_code == 0
    assert str(tmp_path) in result.output


@verifies(SWR.SWR_2904)
def test_replay_json_reproduces_the_lines_the_live_stream_emitted(workspace: Path) -> None:
    """Productive use: a consumer written against ``--output-format stream-json``
    is pointed at a finished run instead of a live one.
    Expected outcome: byte-identical lines, so the stored run and the live run are
    interchangeable inputs to the same tooling."""
    store_path = workspace / ".rotaris" / "sessions" / _SESSION / "evidence" / "events.jsonl"
    written = _lines(store_path.read_text(encoding="utf-8"))

    result = runner.invoke(app, ["events", "replay", _SESSION, "--json", "-w", str(workspace)])

    assert result.exit_code == 0
    assert _lines(result.output) == written


@verifies(SWR.SWR_2904)
def test_replay_filters_compose_by_type_and_by_iteration(workspace: Path) -> None:
    """Productive use: a user asks what tools ran in the second iteration.
    Expected outcome: the two filters are ANDed, and the answer is the one tool
    call from that iteration rather than every tool call in the run."""
    result = runner.invoke(
        app,
        [
            "events",
            "replay",
            _SESSION,
            "--type",
            "tool.start",
            "--iteration",
            "2",
            "--json",
            "-w",
            str(workspace),
        ],
    )

    payloads = [json.loads(line) for line in _lines(result.output)]
    assert result.exit_code == 0
    assert [payload["tool_name"] for payload in payloads] == ["write"]


@verifies(SWR.SWR_2904)
def test_a_repeated_type_flag_selects_both_types(workspace: Path) -> None:
    """Productive use: a user wants the run's iteration boundaries only.
    Expected outcome: ``--type`` accumulates instead of the last one winning."""
    result = runner.invoke(
        app,
        [
            "events",
            "replay",
            _SESSION,
            "-t",
            "iteration.start",
            "-t",
            "iteration.end",
            "--json",
            "-w",
            str(workspace),
        ],
    )

    payloads = [json.loads(line) for line in _lines(result.output)]
    assert result.exit_code == 0
    assert [payload["event"] for payload in payloads] == [
        "iteration.start",
        "iteration.end",
        "iteration.start",
        "iteration.end",
    ]


@verifies(SWR.SWR_2904)
def test_a_filter_that_matches_nothing_exits_zero_with_no_output(workspace: Path) -> None:
    """Productive use: a user asks whether a run spawned any child agents.
    Expected outcome: "it did not" comes back as an empty, successful answer — a
    script must not have to treat "no matches" as an error."""
    result = runner.invoke(
        app,
        ["events", "replay", _SESSION, "--type", "child.spawn", "-w", str(workspace)],
    )

    assert result.exit_code == 0
    assert _lines(result.output) == []


@verifies(SWR.SWR_2904)
def test_an_unknown_session_exits_non_zero_naming_the_workspace(workspace: Path) -> None:
    """Productive use: a user mistypes a session id, or looks in the wrong tree.
    Expected outcome: a non-zero exit and a message naming the workspace that was
    searched, so the mistake is visible without guessing."""
    result = runner.invoke(app, ["events", "replay", "nosuch01", "-w", str(workspace)])

    assert result.exit_code == 2
    assert "nosuch01" in result.output
    assert str(workspace) in result.output


@verifies(SWR.SWR_2904)
def test_an_unparseable_time_bound_is_refused_before_reading_anything(workspace: Path) -> None:
    """Productive use: a user passes ``--since yesterday``.
    Expected outcome: the command says which flag it could not read instead of
    silently returning every event or none."""
    result = runner.invoke(
        app,
        ["events", "replay", _SESSION, "--since", "yesterday", "-w", str(workspace)],
    )

    assert result.exit_code == 2
    assert "--since" in result.output


@verifies(SWR.SWR_2904, SWR.SWR_2902)
def test_an_unknown_event_type_is_displayed_rather_than_dropped(workspace: Path) -> None:
    """Productive use: a store written by a newer Rotaris is replayed by this one.
    Expected outcome: the record is shown and marked, never dropped and never
    fatal — the CLI inherits the reader's forward compatibility."""
    store_path = workspace / ".rotaris" / "sessions" / _SESSION / "evidence" / "events.jsonl"
    future = {
        "schema_version": 2,
        "event": "context.compacted",
        "timestamp": "2026-08-09T12:00:00+00:00",
        "session_id": _SESSION,
        "tokens_reclaimed": 4096,
    }
    with store_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(future, sort_keys=True) + "\n")

    human = runner.invoke(app, ["events", "replay", _SESSION, "-w", str(workspace)])
    machine = runner.invoke(app, ["events", "replay", _SESSION, "--json", "-w", str(workspace)])

    assert human.exit_code == 0
    assert "context.compacted" in human.output
    assert "(unknown)" in human.output
    assert machine.exit_code == 0
    assert json.loads(_lines(machine.output)[-1]) == future


@verifies(SWR.SWR_2904, SWR.SWR_2903)
def test_export_writes_one_trajectory_document_to_a_file(workspace: Path, tmp_path: Path) -> None:
    """Productive use: a user hands a finished run to an evaluation harness.
    Expected outcome: one self-contained document on disk, carrying the run's
    events and totals."""
    target = tmp_path / "out" / "trajectory.json"

    result = runner.invoke(
        app,
        ["events", "export", _SESSION, "--output", str(target), "-w", str(workspace)],
    )

    assert result.exit_code == 0
    document = json.loads(target.read_text(encoding="utf-8"))
    assert document["session_id"] == _SESSION
    assert document["summary"]["event_count"] == 8
    assert document["summary"]["tool_calls"] == 2


@verifies(SWR.SWR_2904, SWR.SWR_2903)
def test_export_without_an_output_path_writes_the_document_to_stdout(workspace: Path) -> None:
    """Productive use: a user pipes an export straight into another tool.
    Expected outcome: the document is on stdout and parses as JSON."""
    result = runner.invoke(app, ["events", "export", _SESSION, "-w", str(workspace)])

    assert result.exit_code == 0
    assert json.loads(result.output)["session_id"] == _SESSION


@verifies(SWR.SWR_2904, SWR.SWR_2903)
def test_several_sessions_export_as_one_batch(workspace: Path, tmp_path: Path) -> None:
    """Productive use: a user evaluates a set of runs together.
    Expected outcome: one batch document holding every run, in the order asked
    for."""
    second = workspace / ".rotaris" / "sessions" / "cli00002"
    store = SessionEventStore(second, session_id="cli00002", max_events=None)
    store.initialize()
    for event in _events("cli00002"):
        store.append(event)
    target = tmp_path / "batch.json"

    result = runner.invoke(
        app,
        ["events", "export", _SESSION, "cli00002", "-o", str(target), "-w", str(workspace)],
    )

    assert result.exit_code == 0
    document = json.loads(target.read_text(encoding="utf-8"))
    assert document["count"] == 2
    assert [item["session_id"] for item in document["trajectories"]] == [_SESSION, "cli00002"]


@verifies(SWR.SWR_2904, SWR.SWR_2901)
def test_exporting_a_resumed_session_says_it_covers_more_than_one_run(workspace: Path) -> None:
    """Productive use: a user exports a session they resumed once.
    Expected outcome: exit 0, and a warning that the document covers two runs —
    a harness must not read the summed totals as one run's."""
    session_dir = workspace / ".rotaris" / "sessions" / _SESSION
    store = SessionEventStore(session_dir, session_id=_SESSION, max_events=None)
    for event in _events():
        store.append(event)

    result = runner.invoke(app, ["events", "export", _SESSION, "-w", str(workspace)])

    assert result.exit_code == 0
    assert "2 runs" in result.output
    document = json.loads(result.output[result.output.index("{") :])
    assert document["summary"]["runs"] == 2


@verifies(SWR.SWR_2904)
def test_a_session_id_that_escapes_the_workspace_is_refused(workspace: Path) -> None:
    """Productive use: a session id comes from a script or a paste rather than
    from ``events list``.
    Expected outcome: ``--workspace`` is a boundary, not a hint — an id with a
    path in it is refused instead of printing a store from another tree."""
    escaped = f"../../../{_SESSION}"

    result = runner.invoke(app, ["events", "replay", escaped, "-w", str(workspace)])

    assert result.exit_code == 2
    assert str(workspace) in result.output


@verifies(SWR.SWR_2904, SWR.SWR_2901)
def test_exporting_a_truncated_store_warns_and_still_succeeds(tmp_path: Path) -> None:
    """Productive use: a long run trimmed its own history and is exported anyway.
    Expected outcome: exit 0 with the loss reported, because a partial record is
    still the best record of that run — and the document says so too."""
    session_dir = tmp_path / ".rotaris" / "sessions" / "capped01"
    store = SessionEventStore(session_dir, session_id="capped01", max_events=1)
    store.initialize()
    for event in _events("capped01"):
        store.append(event)

    result = runner.invoke(
        app,
        ["events", "export", "capped01", "-w", str(tmp_path)],
    )

    assert result.exit_code == 0
    assert "truncated" in result.output or "dropped" in result.output
    # The document is the machine-readable half of the same statement.
    document = json.loads(result.output[result.output.index("{") :])
    assert document["truncated"] is True


@verifies(SWR.SWR_2904)
def test_the_headless_surface_offers_the_same_group(workspace: Path) -> None:
    """Productive use: a CI job runs ``rotaris-headless`` and has no Typer.
    Expected outcome: list, replay and export behave exactly as they do on the
    Typer CLI, including the unknown-session exit code."""
    assert argparse_app.main(["events", "list", "-w", str(workspace)]) == 0
    assert argparse_app.main(["events", "replay", _SESSION, "--json", "-w", str(workspace)]) == 0
    assert argparse_app.main(["events", "replay", "nosuch01", "-w", str(workspace)]) == 2
    assert argparse_app.main(["events", "export", "nosuch01", "-w", str(workspace)]) == 2
    assert (
        argparse_app.main(["events", "replay", _SESSION, "--since", "nope", "-w", str(workspace)])
        == 2
    )


@verifies(SWR.SWR_2904)
def test_both_surfaces_replay_the_same_lines(
    workspace: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Productive use: a team scripts against one surface and reads the other.
    Expected outcome: identical output, so neither surface is a second, subtly
    different product."""
    typer_result = runner.invoke(
        app,
        ["events", "replay", _SESSION, "--json", "-t", "tool.start", "-w", str(workspace)],
    )
    capsys.readouterr()
    argparse_app.main(
        ["events", "replay", _SESSION, "--json", "-t", "tool.start", "-w", str(workspace)],
    )
    headless = capsys.readouterr().out

    assert _lines(typer_result.output) == _lines(headless)
    assert len(_lines(headless)) == 2
