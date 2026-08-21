"""The observers that bridge the loop onto hooks and checkpoints (SWR-2703, SWR-2436).

Both classes under test are adapters: they turn one
:class:`~rotaris_core.ralph.iteration_observer.RalphIterationObserver` callback
into one call on a collaborator. What is worth asserting is therefore not the
collaborator's behaviour — the hook runner and the checkpoint service have their
own suites, against real processes and real Git — but the mapping itself, and the
two properties a run depends on: that every lifecycle event reaches its hook
exactly once, and that nothing an observer touches can end the run.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import pytest

from rotaris_core.hooks.models import ResolvedHook
from rotaris_core.hooks.observer import HookLifecycleObserver
from rotaris_core.hooks.runner import HookRunner
from rotaris_core.ralph.iteration_observer import RalphIterationObserver
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.checkpoint_observer import CheckpointObserver

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.unit


class _RecordingRunner:
    """Stands in for :class:`HookRunner`, recording ``(event, fields)`` pairs."""

    def __init__(self, *, events: set[str] | None = None) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self._events = events

    def has_hooks(self, event: str) -> bool:
        return True if self._events is None else event in self._events

    def run_lifecycle(self, event: str, **fields: Any) -> tuple[()]:
        self.calls.append((event, dict(fields)))
        return ()

    @property
    def fired(self) -> list[str]:
        return [event for event, _fields in self.calls]

    def fields_for(self, event: str) -> dict[str, Any]:
        for name, fields in self.calls:
            if name == event:
                return fields
        raise AssertionError(f"{event} never fired; got {self.fired}")


class _Record:
    """The bits of a ``ChildTaskRecord`` these observers read."""

    def __init__(self, *, canonical_name: str = "coder-1", task_id: str = "t-1") -> None:
        self.canonical_name = canonical_name
        self.task_id = task_id
        self.persona = "coder"
        self.state = "SUCCEEDED"


class _Report:
    def __init__(self, *, status: str = "succeeded", summary: str = "Wrote the file.") -> None:
        self.status = status
        self.summary = summary


class _Manager:
    def __init__(self, report: Any = None) -> None:
        self.results_by_task_id = {"t-1": report} if report is not None else {}


class _Task:
    name = "ship it"


class _VerifierRun:
    def __init__(self, *, executed: bool = True, passed: bool = True) -> None:
        self.executed = executed
        self.passed = passed
        self.skip_reason = "" if executed else "no files changed"
        self.blocking_failures = [] if passed else [_Check("pytest")]


class _Check:
    def __init__(self, name: str) -> None:
        self.name = name


def _hook(event: str, command: str = "true", *, name: str = "notify") -> ResolvedHook:
    return ResolvedHook(
        name=name,
        event=event,
        matcher="",
        command=command,
        timeout_seconds=5.0,
        required=False,
        source="global",
        index=0,
    )


# --------------------------------------------------------------- hook bridge


@verifies(SWR.SWR_2703)
def test_every_lifecycle_event_reaches_its_hook_exactly_once() -> None:
    """Productive use: a user attaches one shell command per lifecycle event and
    expects each to run when that thing happens, and only then.
    Expected outcome: all five SWR-2703 events fire once, from the observer
    callback that corresponds to each."""
    runner = _RecordingRunner()
    observer = HookLifecycleObserver(runner)  # type: ignore[arg-type]
    record, report, manager = _Record(), _Report(), _Manager(_Report())

    observer.on_session_start("s-1", "ship it")
    observer.on_iteration_start(3, _Task())  # type: ignore[arg-type]
    observer.on_child_terminal(record, manager)  # type: ignore[arg-type]
    observer.on_verifier_run(3, _VerifierRun())  # type: ignore[arg-type]
    observer.on_iteration_end(record, report, manager, None, "completed")  # type: ignore[arg-type]
    observer.on_session_end("s-1", "completed")

    assert runner.fired == [
        "session_start",
        "child_completed",
        "verifier_finished",
        "iteration_end",
        "session_end",
    ]


@verifies(SWR.SWR_2703)
def test_an_iteration_end_hook_is_told_which_iteration_ended() -> None:
    """Productive use: an ``iteration_end`` hook appends one line per iteration to
    a build log and the user reads the numbers back.
    Expected outcome: the payload carries the number from the matching
    ``on_iteration_start``, not a placeholder, and it advances with the loop."""
    runner = _RecordingRunner()
    observer = HookLifecycleObserver(runner)  # type: ignore[arg-type]
    record, report, manager = _Record(), _Report(), _Manager()

    for iteration in (1, 2, 7):
        observer.on_iteration_start(iteration, _Task())  # type: ignore[arg-type]
        observer.on_iteration_end(record, report, manager, None, "completed")  # type: ignore[arg-type]

    assert [fields["iteration"] for event, fields in runner.calls] == [1, 2, 7]


@verifies(SWR.SWR_2703)
def test_the_event_payload_carries_what_the_hook_has_to_branch_on() -> None:
    """Productive use: a ``child_completed`` hook posts the child's summary to a
    chat channel and a ``verifier_finished`` hook only alerts on a failure.
    Expected outcome: the child report summary and the verifier verdict are in
    their events' payloads, so the hook does not have to guess."""
    runner = _RecordingRunner()
    observer = HookLifecycleObserver(runner)  # type: ignore[arg-type]

    observer.on_child_terminal(
        _Record(),  # type: ignore[arg-type]
        _Manager(_Report(summary="Refactored the parser.")),  # type: ignore[arg-type]
    )
    observer.on_verifier_run(2, _VerifierRun(passed=False))  # type: ignore[arg-type]

    child = runner.fields_for("child_completed")
    assert child["child_name"] == "coder-1"
    assert child["summary"] == "Refactored the parser."
    assert child["status"] == "succeeded"

    verifier = runner.fields_for("verifier_finished")
    assert verifier == {
        "iteration": 2,
        "executed": True,
        "passed": False,
        "skip_reason": "",
        "failed_checks": ["pytest"],
    }


@verifies(SWR.SWR_2703)
def test_a_run_without_hooks_for_an_event_assembles_no_payload() -> None:
    """Productive use: a user configures a single ``session_end`` hook and the rest
    of the run must not slow down for the four events they did not use.
    Expected outcome: only the configured event reaches the runner."""
    runner = _RecordingRunner(events={"session_end"})
    observer = HookLifecycleObserver(runner)  # type: ignore[arg-type]

    observer.on_session_start("s-1", "ship it")
    observer.on_child_terminal(_Record(), _Manager())  # type: ignore[arg-type]
    observer.on_verifier_run(1, _VerifierRun())  # type: ignore[arg-type]
    observer.on_iteration_end(_Record(), _Report(), _Manager(), None, "completed")  # type: ignore[arg-type]
    observer.on_session_end("s-1", "completed")

    assert runner.fired == ["session_end"]


@verifies(SWR.SWR_2703, SWR.SWR_2704)
def test_a_hook_that_fails_cannot_end_the_run() -> None:
    """Productive use: a user's ``iteration_end`` hook has a typo in it, and their
    hours-long run must survive it.
    Expected outcome: the observer returns normally, the run continues, and the
    non-zero exit is reported as a warning rather than raised."""
    runner = HookRunner(
        session_id="s-1",
        workspace=_here(),
        hooks=(_hook("iteration_end", "exit 9"),),
    )
    observer = HookLifecycleObserver(runner)

    observer.on_iteration_start(1, _Task())  # type: ignore[arg-type]
    observer.on_iteration_end(_Record(), _Report(), _Manager(), None, "completed")  # type: ignore[arg-type]

    outcomes = runner.run_lifecycle("iteration_end", iteration=1)
    assert outcomes and outcomes[0].exit_code == 9
    assert outcomes[0].warning
    # SWR-2703: a lifecycle hook is informational whatever its exit code.
    assert outcomes[0].blocked is False


@verifies(SWR.SWR_2703)
def test_a_broken_runner_does_not_reach_the_loop() -> None:
    """Productive use: nothing about the hook feature may turn a working run into a
    crashed one, including a defect in the hook machinery itself.
    Expected outcome: an observer whose runner raises still returns normally."""

    class _Exploding:
        def has_hooks(self, event: str) -> bool:
            del event
            return True

        def run_lifecycle(self, event: str, **fields: Any) -> tuple[()]:
            del event, fields
            raise RuntimeError("the runner is broken")

    observer = HookLifecycleObserver(_Exploding())  # type: ignore[arg-type]

    observer.on_session_start("s-1", "ship it")
    observer.on_session_end("s-1", "completed")
    observer.on_child_terminal(_Record(), _Manager())  # type: ignore[arg-type]
    observer.on_verifier_run(1, _VerifierRun())  # type: ignore[arg-type]
    observer.on_iteration_end(_Record(), _Report(), _Manager(), None, "completed")  # type: ignore[arg-type]


def _here() -> Path:
    from pathlib import Path

    return Path(__file__).resolve().parent


# --------------------------------------------------------- checkpoint bridge


class _RecordingService:
    def __init__(self) -> None:
        self.captures: list[dict[str, Any]] = []

    def capture(self, *, iteration: int = 0, child_name: str = "", kind: str = "iteration") -> None:
        self.captures.append({"iteration": iteration, "child_name": child_name, "kind": kind})
        return None


@verifies(SWR.SWR_2436)
def test_each_finished_iteration_asks_for_a_checkpoint_of_its_own_number() -> None:
    """Productive use: a user wants to undo "what iteration 2 did", so the recorded
    checkpoint has to name iteration 2.
    Expected outcome: one capture per iteration, carrying that iteration's number
    and the child that produced the work."""
    service = _RecordingService()
    observer = CheckpointObserver(service)  # type: ignore[arg-type]

    for iteration in (1, 2):
        observer.on_iteration_start(iteration, _Task())  # type: ignore[arg-type]
        observer.on_iteration_end(
            _Record(canonical_name=f"coder-{iteration}"),  # type: ignore[arg-type]
            _Report(),  # type: ignore[arg-type]
            _Manager(),  # type: ignore[arg-type]
            None,  # type: ignore[arg-type]
            "completed",  # type: ignore[arg-type]
        )

    assert service.captures == [
        {"iteration": 1, "child_name": "coder-1", "kind": "iteration"},
        {"iteration": 2, "child_name": "coder-2", "kind": "iteration"},
    ]


@verifies(SWR.SWR_2436)
def test_a_checkpoint_failure_cannot_end_the_iteration() -> None:
    """Productive use: a workspace where Git refuses must still finish its run.
    Expected outcome: a service that raises is absorbed by the observer."""

    class _Exploding:
        def capture(self, **kwargs: Any) -> None:
            del kwargs
            raise OSError("git is on fire")

    observer = CheckpointObserver(_Exploding())  # type: ignore[arg-type]
    observer.on_iteration_start(1, _Task())  # type: ignore[arg-type]
    observer.on_iteration_end(_Record(), _Report(), _Manager(), None, "completed")  # type: ignore[arg-type]


# ----------------------------------------------------------------- the seam


@verifies(SWR.SWR_2703)
def test_the_base_observer_declares_the_session_boundary_hooks() -> None:
    """Productive use: any host observer can watch a session's boundaries, not just
    the hook bridge — the composite forwards whatever the base declares.
    Expected outcome: both hooks exist on the base class and are no-ops there, so
    an observer that does not care about them inherits nothing to go wrong."""
    observer = RalphIterationObserver()

    assert observer.on_session_start("s-1", "ship it") is None
    assert observer.on_session_end("s-1", "completed") is None
