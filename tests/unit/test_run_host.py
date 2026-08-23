"""The host-neutral run entry point's promises to every host (SWR-1830).

``execute_run`` is what the headless CLI and the Python SDK both call, so the
things asserted here are the things neither host has to re-implement: an
impossible request is refused *before* a session exists, and however a run ends
— crash, cancellation, success — the session lock is released and the event sink
is unregistered, with exactly one terminal ``result`` event written.

Only the agent runtime is faked (``cli.background._run_task``, the seam below
which every LLM call lives). The session store, the lock, the event bus and the
``RunResult`` construction are all real.
"""

from __future__ import annotations

import asyncio
import subprocess
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any

import pytest

from rotaris_core.cli import background
from rotaris_core.config.schema import RotarisConfig
from rotaris_core.events.bus import reset_event_registry, resolve_event_sink
from rotaris_core.ralph.state import (
    RalphIterationOutcome,
    RalphIterationState,
    RalphProgressFile,
)
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.run_host import RunRequest, execute_run, failed_before_start
from rotaris_core.run_result import EXIT_CODES, RunStatus
from rotaris_core.session import SessionManager

if TYPE_CHECKING:
    from collections.abc import Iterator

    from rotaris_core.events.schema import RotarisEvent

pytestmark = pytest.mark.unit


@pytest.fixture(autouse=True)
def _clean_event_registry() -> Iterator[None]:
    """A sink left registered would bleed one run's events into the next."""
    reset_event_registry()
    yield
    reset_event_registry()


class _RecordingSink:
    """An event sink that keeps every event, like a consumer's stream would."""

    def __init__(self) -> None:
        self.events: list[RotarisEvent] = []

    def __call__(self, event: RotarisEvent) -> None:
        self.events.append(event)

    @property
    def names(self) -> list[str]:
        return [event.event for event in self.events]


def _request(workspace: Path, **overrides: Any) -> RunRequest:
    return RunRequest(
        task=overrides.pop("task", "do the thing"),
        config=RotarisConfig(workspace_root=workspace),
        **overrides,
    )


def _git(cwd: Path, *args: str) -> None:
    result = subprocess.run(
        ["git", *args], cwd=cwd, text=True, encoding="utf-8", capture_output=True, check=False
    )
    assert result.returncode == 0, result.stderr


def _repository(tmp_path: Path) -> Path:
    """A real repository, because attaching a worktree is a real git operation."""
    _git(tmp_path, "init", "-b", "main")
    _git(tmp_path, "config", "user.name", "Test User")
    _git(tmp_path, "config", "user.email", "test@example.invalid")
    (tmp_path / ".gitignore").write_text(".rotaris/\n", encoding="utf-8")
    (tmp_path / "base.txt").write_text("base\n", encoding="utf-8")
    _git(tmp_path, "add", ".")
    _git(tmp_path, "commit", "-m", "initial")
    return tmp_path


def _completed_progress(session_id: str) -> RalphProgressFile:
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
        stop_reason="all tasks completed",
    )


@verifies(SWR.SWR_1830, SWR.SWR_2408, SWR.SWR_2409)
async def test_impossible_worktree_flags_are_refused_before_a_session_exists(
    tmp_path: Path,
) -> None:
    """Productive use: an integrator asks for an isolated worktree and an existing
    one in the same call.
    Expected outcome: the run is refused with an error result and a diagnostic
    instead of an exception, and no half-built session is left in the workspace."""
    manager = SessionManager(tmp_path)
    sink = _RecordingSink()

    result = await execute_run(
        _request(tmp_path, isolate=True, worktree_path=tmp_path / "elsewhere"),
        manager,
        event_sink=sink,
    )

    assert result.status is RunStatus.ERROR
    assert result.exit_code == EXIT_CODES[RunStatus.ERROR] == 1
    assert result.error == "Error: choose either --isolate or --worktree, not both."
    assert failed_before_start(result)
    assert result.session_id == ""
    assert manager.list_sessions() == []
    # The consumer is still owed exactly one terminal event.
    assert sink.names == ["result"]


@verifies(SWR.SWR_1830, SWR.SWR_2408)
async def test_worktree_options_are_refused_when_resuming_a_session(
    tmp_path: Path,
) -> None:
    """Productive use: a caller resumes a session and passes --isolate out of habit.
    Expected outcome: the request is refused rather than silently rebinding the
    session's workspace to a new worktree mid-history."""
    manager = SessionManager(tmp_path)
    state = manager.create_session(RotarisConfig(workspace_root=tmp_path))
    manager.release_lock(state.session_id)

    result = await execute_run(
        _request(tmp_path, session_id=state.session_id, isolate=True),
        manager,
    )

    assert result.status is RunStatus.ERROR
    assert result.error == "Error: worktree options apply only when creating a new session."
    # Refused before the lock was touched, so the session is still resumable.
    assert manager.acquire_lock(state.session_id)
    manager.release_lock(state.session_id)


@verifies(SWR.SWR_1830, SWR.SWR_1828)
async def test_a_crashing_run_releases_the_lock_and_the_sink(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a long-lived host runs several tasks and one of them dies
    inside the agent runtime.
    Expected outcome: the session it crashed in can be resumed and its stream is
    closed, so the next run neither blocks on a stale lock nor writes into the
    dead run's sink."""

    async def _explode(*_args: Any, **_kwargs: Any) -> RalphProgressFile:
        raise RuntimeError("the model provider went away")

    monkeypatch.setattr(background, "_run_task", _explode)
    manager = SessionManager(tmp_path)
    sink = _RecordingSink()

    result = await execute_run(_request(tmp_path), manager, event_sink=sink)

    assert result.status is RunStatus.ERROR
    assert result.error is not None
    assert "the model provider went away" in result.error
    # A runtime failure is *not* a pre-run failure: the session exists.
    assert not failed_before_start(result)
    assert result.session_id
    assert resolve_event_sink(result.session_id) is None
    assert manager.acquire_lock(result.session_id), "the crashed run kept its lock"
    manager.release_lock(result.session_id)
    assert sink.names[0] == "session.start"
    assert sink.names[-1] == "result"
    assert sink.names.count("result") == 1
    assert sink.names.index("session.end") < sink.names.index("result")


@verifies(SWR.SWR_1830)
async def test_a_run_cancelled_before_it_starts_reports_interrupted(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: an embedding application cancels a run in the same tick it
    started it — a user who changed their mind immediately.
    Expected outcome: the agent runtime is never entered, the result says
    interrupted with the SIGINT exit code, and the session is left resumable."""
    entered = False

    async def _should_not_run(*_args: Any, **_kwargs: Any) -> RalphProgressFile:
        nonlocal entered
        entered = True
        return _completed_progress("unused")

    monkeypatch.setattr(background, "_run_task", _should_not_run)
    manager = SessionManager(tmp_path)
    cancel_event = asyncio.Event()
    cancel_event.set()

    result = await execute_run(_request(tmp_path), manager, cancel_event=cancel_event)

    assert entered is False, "a run we already know is unwanted must not start"
    assert result.status is RunStatus.INTERRUPTED
    assert result.exit_code == EXIT_CODES[RunStatus.INTERRUPTED] == 130
    assert manager.acquire_lock(result.session_id)
    manager.release_lock(result.session_id)
    assert manager.load_session(result.session_id).execution_status == "paused"


@verifies(SWR.SWR_1830)
async def test_cancelling_mid_run_asks_the_loop_to_stop_before_forcing_it(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: an operator stops a run that is already working.
    Expected outcome: the loop is asked to shut down gracefully — the same request
    Ctrl-C makes — and the run still returns an interrupted result rather than
    leaving the caller with a cancelled coroutine."""
    stop_requests: list[str] = []
    running = asyncio.Event()

    async def _stoppable_run(*_args: Any, **kwargs: Any) -> RalphProgressFile:
        handler = kwargs["interrupt_handler"]
        stopped = asyncio.Event()
        handler.set_callbacks(
            on_first_interrupt=lambda: (stop_requests.append("graceful"), stopped.set())[0],
            on_second_interrupt=lambda: stop_requests.append("forced"),
        )
        running.set()
        await stopped.wait()
        return _completed_progress("unused")

    monkeypatch.setattr(background, "_run_task", _stoppable_run)
    manager = SessionManager(tmp_path)
    cancel_event = asyncio.Event()

    async def _cancel_once_running() -> None:
        await running.wait()
        cancel_event.set()

    canceller = asyncio.ensure_future(_cancel_once_running())
    result = await execute_run(_request(tmp_path), manager, cancel_event=cancel_event)
    await canceller

    assert stop_requests == ["graceful"], "the loop must be asked before it is cancelled"
    assert result.status is RunStatus.INTERRUPTED
    assert manager.acquire_lock(result.session_id)
    manager.release_lock(result.session_id)


@verifies(SWR.SWR_1830, SWR.SWR_1828)
async def test_a_successful_run_returns_a_completed_result_without_printing(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Productive use: a library embeds Rotaris and renders the outcome itself.
    Expected outcome: the terminal result comes back as a value, the run writes
    nothing to the process's own output, and the session is an ordinary one a
    plain SessionManager can load afterwards."""

    async def _succeed(
        _task: str,
        _config: Any,
        _manager: Any,
        state: Any,
        _max_iterations: int | None,
        **_kwargs: Any,
    ) -> RalphProgressFile:
        return _completed_progress(state.session_id)

    monkeypatch.setattr(background, "_run_task", _succeed)
    manager = SessionManager(tmp_path)

    result = await execute_run(_request(tmp_path), manager)

    captured = capsys.readouterr()
    assert captured.out == ""
    assert captured.err == ""
    assert result.status is RunStatus.COMPLETED
    assert result.exit_code == 0
    assert manager.load_session(result.session_id).execution_status == "completed"


@verifies(SWR.SWR_1830)
async def test_a_session_locked_elsewhere_is_refused_without_stealing_the_lock(
    tmp_path: Path,
) -> None:
    """Productive use: two hosts try to resume the same session at once.
    Expected outcome: the second one is told it cannot have the session, and the
    first one's lock survives the attempt."""
    manager = SessionManager(tmp_path)
    state = manager.create_session(RotarisConfig(workspace_root=tmp_path))
    # create_session leaves the lock held — exactly the "somebody is running it"
    # state a second host would meet.

    result = await execute_run(_request(tmp_path, session_id=state.session_id), manager)

    assert result.status is RunStatus.ERROR
    assert result.error is not None
    assert "unable to acquire lock" in result.error
    assert failed_before_start(result)
    assert result.session_id == state.session_id
    manager.release_lock(state.session_id)


@verifies(SWR.SWR_2453)
async def test_a_run_declares_its_kind_and_whether_it_is_machinery(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: the desktop merges two session worktrees — a run the product
    performs on the user's behalf rather than one the user typed.
    Expected outcome: the runtime is told what kind of run it is, the session
    records the same thing, and the session stays out of the list the user
    browses. These are the two seams the integration run needed; they are on the
    shared request so no host has to keep its own lifecycle to get them."""
    from rotaris_core.improvement.types import RunType

    seen: dict[str, Any] = {}

    async def _capture(*_args: Any, **kwargs: Any) -> RalphProgressFile:
        seen.update(kwargs)
        return _completed_progress("unused")

    monkeypatch.setattr(background, "_run_task", _capture)
    manager = SessionManager(tmp_path)

    result = await execute_run(
        _request(tmp_path, run_type=RunType.INTEGRATION_RUN, internal=True),
        manager,
    )

    assert result.status is RunStatus.COMPLETED
    assert seen["run_type"] is RunType.INTEGRATION_RUN
    # On the session too, not only on the loop: a resumed run has to know what it
    # is, and the loop is gone by then.
    assert manager.load_session(result.session_id).run_type is RunType.INTEGRATION_RUN
    assert manager.list_sessions() == []
    listed = manager.list_sessions(include_internal=True)
    assert [item["session_id"] for item in listed] == [result.session_id]


@verifies(SWR.SWR_2453, SWR.SWR_2409)
async def test_a_host_may_name_the_session_and_prepare_the_tree_it_runs_in(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a host mints the session id so it can show the run in its
    own lists before the worker reports back, prepares the merged tree the run
    has to work in, and hands the lifecycle both.
    Expected outcome: the run adopts the id and executes in that tree, instead of
    the host having to create the session itself to get either."""
    from rotaris_core.session.worktrees import GitWorktreeService

    base = _repository(tmp_path)
    prepared = Path(GitWorktreeService(base).create_for_session("prepared-tree").path)
    manager = SessionManager(base)
    chosen = manager.new_session_id()
    roots: list[Any] = []

    async def _capture(_prompt: Any, config: Any, *_args: Any, **_kwargs: Any) -> RalphProgressFile:
        roots.append(config.workspace_root)
        return _completed_progress("unused")

    monkeypatch.setattr(background, "_run_task", _capture)

    result = await execute_run(
        _request(base, new_session_id=chosen, worktree_path=prepared),
        manager,
    )

    assert result.status is RunStatus.COMPLETED
    assert result.session_id == chosen
    assert roots == [prepared]
    # Attached, not created: releasing the session must not delete a tree the
    # host prepared and still owns.
    binding = manager.load_session(chosen).worktree
    assert binding is not None
    assert binding.created_by_session is False
