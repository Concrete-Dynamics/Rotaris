"""Hermetic user-flow coverage for `--output-format stream-json` (SWR-1828/SWR-1829).

Drives the real ``rotaris-headless`` entry point — ``argparse_app.main(argv)`` —
through the real ``run_background``, faking only the one thing a test must not
do for real: the agent runtime itself (``cli.background._run_task``, the seam
below which every LLM call and subprocess lives).

There is no pre-existing harness for this: the repository's other CLI tests
(``tests/integration/test_cli.py``, ``test_cli_argparse.py``,
``test_worktree_cli.py``) all replace ``run_background`` wholesale, so none of
them exercise session creation, the event sink, the stdout/stderr split, or the
exit code.  ``tests/integration/scripted_llm.py`` fakes a *lower* seam (the LLM
inside a real conversation) and would drag a full agent bootstrap into a test
about an output channel.

What is asserted is the contract, not the wording: stdout is pure JSONL, the
stream opens with ``session.start`` and closes with ``result``, diagnostics move
to stderr, the process exit code equals the status inside that final event, and
``--output-format text`` behaves exactly as it did before the flag existed.

``test_a_headless_stream_json_run_is_consumable_end_to_end`` at the bottom is the
epic's canonical flow: it makes every one of those assertions in a *single* run,
plus the two the per-behaviour tests above cannot reach on their own — that a
credential in a tool argument reaches no serialized event, and that
``session.start.sandboxed`` reports the availability verdict rather than the
configured mode.
"""

from __future__ import annotations

import importlib
import json
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

import pytest

from rotaris_core.cli import argparse_app, background
from rotaris_core.config.schema import RotarisConfig
from rotaris_core.events.bus import publish, reset_event_registry, resolve_event_sink
from rotaris_core.events.schema import (
    IterationEndEvent,
    IterationStartEvent,
    ToolFinishEvent,
    ToolStartEvent,
    parse_event,
)
from rotaris_core.ralph.state import (
    RalphIterationOutcome,
    RalphIterationState,
    RalphProgressFile,
)
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.run_result import EXIT_CODES, RunStatus

if TYPE_CHECKING:
    from collections.abc import Iterator
    from pathlib import Path

pytestmark = [pytest.mark.integration, pytest.mark.e2e]


@pytest.fixture(autouse=True)
def _clean_event_registry() -> Iterator[None]:
    """A sink left registered would bleed one run's events into the next."""
    reset_event_registry()
    yield
    reset_event_registry()


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


def _progress(
    session_id: str,
    *,
    completed: int,
    abandoned: int,
    stop_reason: str,
) -> RalphProgressFile:
    outcome = RalphIterationOutcome.COMPLETED if completed else RalphIterationOutcome.ABANDONED
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
                outcome=outcome,
                report_summary="the sandbox refused to start",
            ),
        ],
        total_tasks=1,
        completed_tasks=completed,
        abandoned_tasks=abandoned,
        stop_reason=stop_reason,
    )


def _install_fake_run(
    monkeypatch: pytest.MonkeyPatch,
    *,
    completed: int = 1,
    abandoned: int = 0,
    stop_reason: str = "all tasks completed",
) -> None:
    """Replace the agent runtime with a scripted one that publishes two events."""

    async def _fake_run_task(
        task: str,
        _config: Any,
        _session_manager: Any,
        state: Any,
        _max_iterations: int | None,
        **kwargs: Any,
    ) -> RalphProgressFile:
        assert kwargs.get("stream_events") in (True, False)
        publish(
            state.session_id,
            IterationStartEvent(session_id=state.session_id, iteration=1, task=task),
        )
        publish(
            state.session_id,
            IterationEndEvent(
                session_id=state.session_id,
                iteration=1,
                outcome="completed" if completed else "abandoned",
                summary="scripted iteration",
            ),
        )
        return _progress(
            state.session_id,
            completed=completed,
            abandoned=abandoned,
            stop_reason=stop_reason,
        )

    monkeypatch.setattr(background, "_run_task", _fake_run_task)


def _stream_events(stdout: str) -> list[dict[str, Any]]:
    """Decode stdout as JSONL, failing loudly on the first non-JSON line."""
    events: list[dict[str, Any]] = []
    for number, line in enumerate(stdout.splitlines(), start=1):
        if not line.strip():
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError as exc:  # pragma: no cover - the failure message is the point
            pytest.fail(f"stdout line {number} is not JSON: {line!r} ({exc})")
        assert isinstance(payload, dict), f"stdout line {number} is not a JSON object"
        # Round-tripping through the published schema is the actual promise:
        # a consumer must be able to reconstruct the typed event.
        parse_event(payload)
        events.append(payload)
    return events


@verifies(SWR.SWR_1828, SWR.SWR_1829)
def test_stream_json_run_writes_only_events_to_stdout(
    headless_workspace: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Productive use: a CI job runs a Rotaris task and parses its output as JSONL.
    Expected outcome: every stdout line is a schema-valid event, the stream opens
    with session.start and ends with result, and the human-readable progress
    messages are on stderr instead."""
    _install_fake_run(monkeypatch)

    code = argparse_app.main(
        [
            "run",
            "add a changelog entry",
            "--workspace",
            str(headless_workspace),
            "--output-format",
            "stream-json",
        ],
    )
    captured = capsys.readouterr()

    events = _stream_events(captured.out)
    names = [event["event"] for event in events]
    assert names[0] == "session.start"
    assert names[-1] == "result"
    assert names.count("result") == 1
    assert "session.end" in names
    assert names.index("session.end") < names.index("result")
    assert {"iteration.start", "iteration.end"} <= set(names)

    assert events[0]["task"] == "add a changelog entry"
    assert all(event["schema_version"] == 1 for event in events)

    # The diagnostics that used to go to stdout must have moved, not vanished.
    assert "Created session" in captured.err
    assert "Done." in captured.err
    assert "Created session" not in captured.out
    assert code == 0


@verifies(SWR.SWR_1828)
def test_exit_code_is_the_status_carried_by_the_final_result_event(
    headless_workspace: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Productive use: a pipeline gates on the exit code and logs the result event.
    Expected outcome: the code and the reported status are the same decision, for
    a run that succeeds and for one that fails."""
    _install_fake_run(monkeypatch)
    success_code = argparse_app.main(
        [
            "run",
            "succeeding task",
            "--workspace",
            str(headless_workspace),
            "--output-format",
            "stream-json",
        ],
    )
    success_result = _stream_events(capsys.readouterr().out)[-1]

    _install_fake_run(monkeypatch, completed=0, abandoned=1, stop_reason="all tasks completed")
    failure_code = argparse_app.main(
        [
            "run",
            "failing task",
            "--workspace",
            str(headless_workspace),
            "--output-format",
            "stream-json",
        ],
    )
    failure_result = _stream_events(capsys.readouterr().out)[-1]

    assert success_result["result"]["status"] == RunStatus.COMPLETED.value
    assert success_code == EXIT_CODES[RunStatus.COMPLETED] == 0

    assert failure_result["result"]["status"] == RunStatus.FAILED.value
    assert failure_code == EXIT_CODES[RunStatus.FAILED] == 1
    assert failure_result["result"]["session_id"]


@verifies(SWR.SWR_1828)
def test_iteration_limit_reports_its_own_exit_code(
    headless_workspace: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Productive use: an operator caps a run with --max-iterations and needs to
    tell "hit the cap" apart from "failed".
    Expected outcome: the run exits 2 and the result event says max_iterations."""
    _install_fake_run(monkeypatch, stop_reason="iteration limit reached")

    code = argparse_app.main(
        [
            "run",
            "long task",
            "--workspace",
            str(headless_workspace),
            "--max-iterations",
            "1",
            "--output-format",
            "stream-json",
        ],
    )
    result = _stream_events(capsys.readouterr().out)[-1]

    assert result["result"]["status"] == RunStatus.MAX_ITERATIONS.value
    assert code == EXIT_CODES[RunStatus.MAX_ITERATIONS] == 2


@verifies(SWR.SWR_1828)
def test_an_interrupted_run_reports_the_sigint_exit_code_and_still_ends_the_stream(
    headless_workspace: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Productive use: an operator presses Ctrl-C while a streamed run is going.
    Expected outcome: the stream still closes with a result event saying
    'interrupted', and the process reports the conventional SIGINT code."""

    async def _interrupted(*_args: Any, **_kwargs: Any) -> RalphProgressFile:
        raise KeyboardInterrupt

    monkeypatch.setattr(background, "_run_task", _interrupted)

    code = argparse_app.main(
        [
            "run",
            "a long task",
            "--workspace",
            str(headless_workspace),
            "--output-format",
            "stream-json",
        ],
    )
    captured = capsys.readouterr()

    events = _stream_events(captured.out)
    assert events[-1]["event"] == "result"
    assert events[-1]["result"]["status"] == RunStatus.INTERRUPTED.value
    assert code == EXIT_CODES[RunStatus.INTERRUPTED] == 130
    assert "Interrupted." in captured.err


@verifies(SWR.SWR_1828)
def test_a_failing_run_leaves_no_sink_behind_for_the_next_run(
    headless_workspace: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Productive use: a long-lived host runs several tasks in one process.
    Expected outcome: a crashed streamed run unregisters its sink, so the next
    run's events cannot be written into the previous run's stdout stream."""

    async def _explode(*_args: Any, **_kwargs: Any) -> RalphProgressFile:
        raise RuntimeError("the model provider went away")

    monkeypatch.setattr(background, "_run_task", _explode)

    code = argparse_app.main(
        [
            "run",
            "doomed task",
            "--workspace",
            str(headless_workspace),
            "--output-format",
            "stream-json",
        ],
    )
    captured = capsys.readouterr()
    events = _stream_events(captured.out)
    session_id = events[-1]["result"]["session_id"]

    assert events[-1]["event"] == "result"
    assert events[-1]["result"]["status"] == RunStatus.ERROR.value
    assert code == EXIT_CODES[RunStatus.ERROR] == 1
    assert "the model provider went away" in captured.err
    assert resolve_event_sink(session_id) is None


@verifies(SWR.SWR_1828)
def test_an_argument_error_still_ends_the_stream_with_a_result_event(
    headless_workspace: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Productive use: a script mis-invokes the CLI while parsing its JSON output.
    Expected outcome: the consumer still gets one terminal result event on stdout
    and a non-zero exit code, instead of an empty stream."""
    _install_fake_run(monkeypatch)

    code = argparse_app.main(
        [
            "run",
            "impossible task",
            "--workspace",
            str(headless_workspace),
            "--isolate",
            "--worktree",
            str(headless_workspace / "elsewhere"),
            "--output-format",
            "stream-json",
        ],
    )
    captured = capsys.readouterr()

    events = _stream_events(captured.out)
    assert [event["event"] for event in events] == ["result"]
    assert events[0]["result"]["status"] == RunStatus.ERROR.value
    assert code == EXIT_CODES[RunStatus.ERROR] == 1
    assert "choose either --isolate or --worktree" in captured.err


@verifies(SWR.SWR_1828)
def test_text_output_is_unchanged_and_is_the_default(
    headless_workspace: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Productive use: an existing user keeps running Rotaris without the new flag.
    Expected outcome: stdout is the same human-readable progress as before, with
    no JSON, whether the default or an explicit --output-format text is used."""
    _install_fake_run(monkeypatch)
    default_code = argparse_app.main(
        ["run", "a task", "--workspace", str(headless_workspace)],
    )
    default = capsys.readouterr()

    _install_fake_run(monkeypatch)
    explicit_code = argparse_app.main(
        [
            "run",
            "a task",
            "--workspace",
            str(headless_workspace),
            "--output-format",
            "text",
        ],
    )
    explicit = capsys.readouterr()

    for captured in (default, explicit):
        lines = captured.out.splitlines()
        assert lines[0].startswith("Created session ")
        assert lines[-1] == "Done."
        assert "{" not in captured.out
    assert default_code == explicit_code == 0
    # No sink means no stream: the text path must not pay for the event bus.
    assert "session.start" not in default.out


@verifies(SWR.SWR_1828)
def test_stream_json_never_starts_the_interactive_tui(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a user forgets --background and still wants a parseable stream.
    Expected outcome: `rotaris-cli run --output-format stream-json` takes the
    background path, so the TUI never takes over stdout."""
    from typer.testing import CliRunner

    # ``rotaris_core.cli`` re-exports the Typer object as ``app``, which shadows
    # the submodule of the same name for both ``import`` forms.
    cli_app_module = importlib.import_module("rotaris_core.cli.app")

    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(
        cli_app_module,
        "_load_cli_config",
        lambda workspace_root, _config_path: RotarisConfig(workspace_root=workspace_root),
    )
    monkeypatch.setattr("rotaris_core.config.validation.validate_config", lambda _config: [])
    monkeypatch.setattr(
        "rotaris_core.cli.background.run_background",
        lambda **kwargs: calls.append(kwargs),
    )

    result = CliRunner().invoke(
        cli_app_module.app,
        [
            "run",
            "--workspace",
            str(tmp_path),
            "--output-format",
            "stream-json",
            "publish the report",
        ],
    )

    assert result.exit_code == 0, result.output
    assert len(calls) == 1
    assert calls[0]["output_format"] == "stream-json"
    assert calls[0]["task"] == "publish the report"


@verifies(SWR.SWR_1828)
def test_stream_json_without_a_task_is_refused(
    tmp_path: Path,
) -> None:
    """Productive use: a user asks for a JSON stream but gives nothing to run.
    Expected outcome: a clear diagnostic and a non-zero exit, rather than a TUI
    writing terminal escapes into a machine-readable stream."""
    from typer.testing import CliRunner

    from rotaris_core.cli.app import app

    result = CliRunner().invoke(
        app,
        ["run", "--workspace", str(tmp_path), "--output-format", "stream-json"],
    )

    assert result.exit_code == 2
    assert "requires a task" in result.output


@verifies(SWR.SWR_1828)
def test_an_unknown_output_format_is_rejected_by_both_entry_points(
    tmp_path: Path,
) -> None:
    """Productive use: a script passes a misspelled format name.
    Expected outcome: both CLIs refuse it instead of silently falling back to text."""
    from typer.testing import CliRunner

    from rotaris_core.cli.app import app

    typer_result = CliRunner().invoke(
        app,
        ["run", "--workspace", str(tmp_path), "--output-format", "json", "a task"],
    )
    assert typer_result.exit_code == 2
    assert "unknown --output-format" in typer_result.output

    with pytest.raises(SystemExit) as exc_info:
        argparse_app.main(["run", "a task", "--output-format", "json"])
    assert exc_info.value.code == 2


#: A credential shape the redactor must catch wherever a tool argument carries it.
LEAKED_SECRET = "ghp_realvalue123"
LEAKY_COMMAND = f"deploy --token GITHUB_TOKEN={LEAKED_SECRET}"


def _sandboxed_config(workspace: Path) -> RotarisConfig:
    """A config that *asks* for a sandbox, whatever the host can actually do."""
    config = RotarisConfig(workspace_root=workspace)
    config.runtime.sandbox_mode = "workspace-write"
    return config


def _force_sandbox_verdict(monkeypatch: pytest.MonkeyPatch, *, available: bool) -> None:
    """Pin the availability probe; the host's own verdict must not decide a test.

    Native Windows — the maintainer's platform — always probes unavailable, so
    without this the "available" half of the contract would silently never run.
    """
    from rotaris_core.sandbox.spec import SandboxAvailability

    verdict = SandboxAvailability(
        available=available,
        backend="bubblewrap" if available else "unavailable",
        reason="" if available else "bwrap was not found on PATH",
        remediation="" if available else "install bubblewrap",
    )
    monkeypatch.setattr("rotaris_core.sandbox.session.probe_sandbox", lambda: verdict)

    # The same verdict through the *launch* probe. ``probe_sandbox`` answers
    # "is a sandbox active" for the session.start field; ``ensure_sandbox_available``
    # answers "may this run start at all" and goes through the backend. Pinning
    # only the first left a run that reported itself sandboxed and then met the
    # host's real, absent backend at launch.
    class _Backend:
        name = verdict.backend

        def probe(self) -> object:
            return verdict

    monkeypatch.setattr("rotaris_core.sandbox.session.resolve_backend", lambda: _Backend())


def _install_fake_run_with_a_tool_call(monkeypatch: pytest.MonkeyPatch) -> None:
    """A scripted run that exercises the iteration *and* tool event families."""

    async def _fake_run_task(
        task: str,
        _config: Any,
        _session_manager: Any,
        state: Any,
        _max_iterations: int | None,
        **_kwargs: Any,
    ) -> RalphProgressFile:
        session_id = state.session_id
        publish(session_id, IterationStartEvent(session_id=session_id, iteration=1, task=task))
        publish(
            session_id,
            ToolStartEvent(
                session_id=session_id,
                tool_name="terminal",
                call_id="call-1",
                arguments={"command": LEAKY_COMMAND},
            ),
        )
        publish(
            session_id,
            ToolFinishEvent(
                session_id=session_id,
                tool_name="terminal",
                call_id="call-1",
                status="success",
                duration_ms=12.0,
            ),
        )
        publish(
            session_id,
            IterationEndEvent(
                session_id=session_id,
                iteration=1,
                outcome="completed",
                summary="deployed",
            ),
        )
        return _progress(session_id, completed=1, abandoned=0, stop_reason="all tasks completed")

    monkeypatch.setattr(background, "_run_task", _fake_run_task)


@verifies(SWR.SWR_1828, SWR.SWR_1829, SWR.SWR_2507)
def test_a_headless_stream_json_run_is_consumable_end_to_end(
    headless_workspace: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Productive use: a CI job runs `rotaris-headless run --output-format
    stream-json`, pipes stdout into a JSON parser, and gates on the exit code.
    Expected outcome: every stdout line is a schema-valid event between
    session.start and result, the prose is on stderr, the exit code is the status
    the final event reports, a credential in a tool argument never reaches the
    wire, and session.start.sandboxed states what the run really got rather than
    what it asked for."""
    monkeypatch.setattr(
        argparse_app,
        "_load_config",
        lambda workspace_root, _config_path: _sandboxed_config(workspace_root),
    )
    # The sandbox this config asks for is available here. A configured sandbox
    # the host *cannot* provide no longer produces a stream at all — the run is
    # refused before it starts; that is the test below.
    _force_sandbox_verdict(monkeypatch, available=True)
    _install_fake_run_with_a_tool_call(monkeypatch)

    code = argparse_app.main(
        [
            "run",
            "ship the release",
            "--workspace",
            str(headless_workspace),
            "--output-format",
            "stream-json",
        ],
    )
    captured = capsys.readouterr()

    # 1 — every non-empty stdout line is JSON that round-trips through the
    # schema: ``_stream_events`` fails on the first line that is not, so
    # reaching the assertions below is itself the guarantee.
    events = _stream_events(captured.out)
    assert events, "the stream must not be empty"
    assert all(event["schema_version"] == 1 for event in events)

    # 2 — the stream opens and closes on the documented events.
    names = [event["event"] for event in events]
    assert names[0] == "session.start"
    assert names[-1] == "result"
    assert {"iteration.start", "tool.start", "tool.finish", "iteration.end"} <= set(names)

    # 3 — the human-readable channel moved to stderr, and took nothing with it.
    assert "Created session" in captured.err
    assert "Done." in captured.err
    assert "Created session" not in captured.out
    assert "Done." not in captured.out

    # 4 — the exit code is *derived from* the status in the final event.
    reported = RunStatus(events[-1]["result"]["status"])
    assert code == EXIT_CODES[reported]
    assert reported is RunStatus.COMPLETED

    # 5 — the credential appears in no serialized event, under any key.
    assert LEAKED_SECRET not in captured.out
    tool_start = next(event for event in events if event["event"] == "tool.start")
    assert LEAKED_SECRET not in json.dumps(tool_start)
    assert "deploy" in tool_start["arguments"]["command"], "readable text must survive"

    # 6 — sandboxed reports availability, not configuration.
    assert events[0]["sandboxed"] is True


@verifies(SWR.SWR_2507)
def test_a_sandbox_the_host_cannot_provide_refuses_the_run_before_it_starts(
    headless_workspace: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Productive use: a CI job asks for a sandbox on a runner that has none.

    Expected outcome: the job fails at launch, naming the reason, rather than
    executing the whole run on the bare host and reporting ``sandboxed: false``
    in a field nobody reads. SWR-2507 forbids the quiet downgrade, and the
    desktop has always refused here; this is the headless host being held to the
    same promise now that both share one lifecycle.

    The stream is therefore one line — the terminal ``result`` — which is what a
    consumer needs to tell "refused before it began" from "ran and failed"."""
    monkeypatch.setattr(
        argparse_app,
        "_load_config",
        lambda workspace_root, _config_path: _sandboxed_config(workspace_root),
    )
    _force_sandbox_verdict(monkeypatch, available=False)
    _install_fake_run_with_a_tool_call(monkeypatch)

    code = argparse_app.main(
        [
            "run",
            "ship the release",
            "--workspace",
            str(headless_workspace),
            "--output-format",
            "stream-json",
        ],
    )

    events = _stream_events(capsys.readouterr().out)
    assert [event["event"] for event in events] == ["result"]
    reported = RunStatus(events[-1]["result"]["status"])
    assert reported is RunStatus.ERROR
    assert code == EXIT_CODES[reported]
    # The backend's own reason and remediation, not a generic refusal: what the
    # operator needs is the missing tool's name and how to install it.
    error = events[-1]["result"]["error"]
    assert "bwrap was not found on PATH" in error
    assert "install bubblewrap" in error
