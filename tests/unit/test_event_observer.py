"""Observer-level event emission and hook composition (SWR-1828 / SWR-1829)."""

from __future__ import annotations

import inspect
from typing import TYPE_CHECKING, Any

import pytest

from rotaris_core.events import (
    CompositeIterationObserver,
    StreamEventObserver,
    register_event_sink,
    reset_event_registry,
)
from rotaris_core.orchestrator.child_state import ChildTaskRecord, ChildTaskState
from rotaris_core.orchestrator.report import ChildReportArtifact
from rotaris_core.ralph.iteration_observer import RalphIterationObserver
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from collections.abc import Iterator

    from rotaris_core.events import RotarisEvent

pytestmark = pytest.mark.usefixtures("clean_event_registry")


@pytest.fixture
def clean_event_registry() -> Iterator[None]:
    """Keep one test's sink from making the next one pass for the wrong reason."""
    reset_event_registry()
    yield
    reset_event_registry()


def _sink(session_id: str) -> list[RotarisEvent]:
    captured: list[RotarisEvent] = []
    register_event_sink(session_id, captured.append)
    return captured


def _record(name: str = "worker-1", task_id: str = "task-1") -> ChildTaskRecord:
    return ChildTaskRecord(
        name=name,
        canonical_name=name,
        persona="engineer",
        task_payload="Fix the failing check",
        task_id=task_id,
    )


class _Manager:
    """Minimal stand-in for the report lookup ``on_child_terminal`` performs."""

    def __init__(self, results: dict[str, ChildReportArtifact] | None = None) -> None:
        self.results_by_task_id = results or {}


class _Task:
    def __init__(self, name: str) -> None:
        self.name = name


# ---------------------------------------------------------------- emission


@verifies(SWR.SWR_1829)
def test_iteration_hooks_publish_start_and_end_with_the_same_iteration_number() -> None:
    """Productive use: a CI consumer can pair an iteration's start with its end.
    Expected outcome: both events carry the iteration number the loop ran, and
    ``iteration.start`` arrives first."""
    captured = _sink("s1")
    observer = StreamEventObserver("s1")

    observer.on_iteration_start(7, _Task("Ship the feature"))  # type: ignore[arg-type]
    observer.on_iteration_end(
        _record(),
        ChildReportArtifact(
            agent_name="worker-1",
            persona="engineer",
            status="succeeded",
            summary="Done and verified",
        ),
        _Manager(),  # type: ignore[arg-type]
        None,  # type: ignore[arg-type]
        "completed",  # type: ignore[arg-type]
    )

    assert [event.event for event in captured] == ["iteration.start", "iteration.end"]
    start, end = captured
    assert start.iteration == 7  # type: ignore[attr-defined]
    assert start.task == "Ship the feature"  # type: ignore[attr-defined]
    assert end.iteration == 7  # type: ignore[attr-defined]
    assert end.outcome == "completed"  # type: ignore[attr-defined]
    assert end.summary == "Done and verified"  # type: ignore[attr-defined]


@verifies(SWR.SWR_1829)
def test_a_child_is_announced_once_even_though_two_hooks_report_the_spawn() -> None:
    """Productive use: a consumer building a child tree sees one node per child.
    Expected outcome: the worker-thread and loop-thread spawn hooks together
    yield exactly one ``child.spawn``."""
    captured = _sink("s2")
    observer = StreamEventObserver("s2")
    record = _record()
    manager = _Manager()

    observer.on_child_spawned(record, manager)  # type: ignore[arg-type]
    observer.on_child_created(record, manager, None)  # type: ignore[arg-type]

    assert [event.event for event in captured] == ["child.spawn"]
    assert captured[0].child_id == "task-1"  # type: ignore[attr-defined]
    assert captured[0].agent_name == "worker-1"  # type: ignore[attr-defined]
    assert captured[0].task == "Fix the failing check"  # type: ignore[attr-defined]


@verifies(SWR.SWR_1829)
def test_child_transitions_carry_the_state_they_came_from() -> None:
    """Productive use: an operator can follow a child through its state machine.
    Expected outcome: each ``child.transition`` names both the previous and the
    new state, and a repeated notification is not re-published."""
    captured = _sink("s3")
    observer = StreamEventObserver("s3")
    record = _record()
    manager = _Manager()

    observer.on_child_spawned(record, manager)  # type: ignore[arg-type]
    record.transition(ChildTaskState.RUNNING)
    observer.on_child_running(record, manager)  # type: ignore[arg-type]
    observer.on_child_running(record, manager)  # type: ignore[arg-type]

    transitions = [event for event in captured if event.event == "child.transition"]
    assert len(transitions) == 1
    assert transitions[0].from_state == "queued"  # type: ignore[attr-defined]
    assert transitions[0].to_state == "running"  # type: ignore[attr-defined]


@verifies(SWR.SWR_1829)
def test_a_terminal_child_publishes_its_report_artifact() -> None:
    """Productive use: a consumer reads a finished child's report off the stream.
    Expected outcome: ``child.complete`` carries the serialized
    ``ChildReportArtifact``, after that child's ``child.spawn``."""
    captured = _sink("s4")
    observer = StreamEventObserver("s4")
    record = _record()
    report = ChildReportArtifact(
        agent_name="worker-1",
        persona="engineer",
        status="succeeded",
        summary="Replaced the broken import",
    )
    manager = _Manager({"task-1": report})

    record.transition(ChildTaskState.RUNNING)
    record.transition(ChildTaskState.SUCCEEDED)
    observer.on_child_terminal(record, manager)  # type: ignore[arg-type]

    kinds = [event.event for event in captured]
    assert kinds.index("child.spawn") < kinds.index("child.complete")
    complete = captured[-1]
    assert complete.event == "child.complete"
    assert complete.report is not None  # type: ignore[attr-defined]
    assert complete.report["summary"] == "Replaced the broken import"  # type: ignore[attr-defined]
    assert complete.report["status"] == "succeeded"  # type: ignore[attr-defined]


@verifies(SWR.SWR_1829)
def test_token_aggregate_publishes_usage_but_an_empty_snapshot_stays_silent() -> None:
    """Productive use: a budget watcher reads running token totals off the stream.
    Expected outcome: a measured snapshot becomes one ``usage.update``; an
    unmeasured iteration publishes nothing rather than implying a reset."""
    captured = _sink("s5")
    observer = StreamEventObserver("s5")

    observer.on_token_aggregate(None)
    observer.on_token_aggregate({})
    observer.on_token_aggregate({"total_tokens": 1234})

    assert [event.event for event in captured] == ["usage.update"]
    assert captured[0].tokens == {"total_tokens": 1234}  # type: ignore[attr-defined]


@verifies(SWR.SWR_1829, SWR.SWR_2602)
def test_verifier_run_publishes_its_checks_and_pass_state() -> None:
    """Productive use: a gate consumer sees which checks a run's verifier failed.
    Expected outcome: ``verifier.result`` carries the per-check payloads and the
    blocking-failure verdict."""
    from rotaris_core.verifier.runner import CheckResult, VerifierRunResult

    captured = _sink("s6")
    observer = StreamEventObserver("s6")
    result = VerifierRunResult(
        executed=True,
        suite_source="config",
        results=[
            CheckResult(
                name="pytest",
                command="pytest -q",
                severity="blocking",
                status="failed",
                exit_code=1,
            ),
        ],
    )

    observer.on_verifier_run(3, result)

    assert [event.event for event in captured] == ["verifier.result"]
    event = captured[0]
    assert event.iteration == 3  # type: ignore[attr-defined]
    assert event.passed is False  # type: ignore[attr-defined]
    assert [check["name"] for check in event.checks] == ["pytest"]  # type: ignore[attr-defined]
    assert "pytest" in event.summary  # type: ignore[attr-defined]


@verifies(SWR.SWR_1828)
def test_a_stream_observer_without_a_sink_publishes_nothing_and_raises_nothing() -> None:
    """Productive use: every existing run keeps working with the stream switched off.
    Expected outcome: driving every hook with no sink registered is silent and
    does not raise."""
    captured = _sink("other-session")
    observer = StreamEventObserver("unregistered")
    record = _record()

    observer.on_iteration_start(1, _Task("t"))  # type: ignore[arg-type]
    observer.on_child_spawned(record, _Manager())  # type: ignore[arg-type]
    observer.on_token_aggregate({"total_tokens": 5})

    assert captured == []


@verifies(SWR.SWR_1828)
def test_a_hook_given_a_hostile_payload_does_not_raise_into_the_loop() -> None:
    """Productive use: a run survives an observer that cannot build an event.
    Expected outcome: the hook swallows the failure instead of aborting the
    iteration the loop calls it from."""
    _sink("s7")
    observer = StreamEventObserver("s7")

    class _Hostile:
        @property
        def name(self) -> str:
            raise RuntimeError("no name for you")

    observer.on_iteration_start(1, _Hostile())  # type: ignore[arg-type]


# --------------------------------------------------------------- composite


def _hook_names() -> set[str]:
    """Every public hook the base observer declares."""
    return {
        name
        for name, value in vars(RalphIterationObserver).items()
        if not name.startswith("_") and callable(value)
    }


@verifies(SWR.SWR_1828)
def test_the_composite_defines_every_hook_the_base_observer_declares() -> None:
    """Productive use: adding a loop hook cannot silently stop reaching a delegate.
    Expected outcome: the composite overrides each public hook name reflected off
    ``RalphIterationObserver``."""
    missing = _hook_names() - set(vars(CompositeIterationObserver))
    assert missing == set(), f"CompositeIterationObserver does not forward: {sorted(missing)}"


@verifies(SWR.SWR_1828)
def test_the_composite_forwards_every_hook_to_every_delegate() -> None:
    """Productive use: turning the stream on does not displace the host's observer.
    Expected outcome: every hook, called with the loop's own arity, reaches both
    delegates."""

    class _Recorder:
        def __init__(self) -> None:
            self.calls: list[str] = []

        def __getattr__(self, name: str) -> Any:
            def _record(*args: Any) -> dict[str, Any]:
                del args
                self.calls.append(name)
                return {}

            return _record

    first, second = _Recorder(), _Recorder()
    composite = CompositeIterationObserver(first, second)

    hooks = sorted(_hook_names())
    for hook in hooks:
        signature = inspect.signature(getattr(RalphIterationObserver, hook))
        arity = len(signature.parameters) - 1  # drop ``self``
        getattr(composite, hook)(*([None] * arity))

    assert first.calls == hooks
    assert second.calls == hooks


@verifies(SWR.SWR_1828)
def test_a_delegate_that_raises_does_not_stop_the_other_delegates() -> None:
    """Productive use: a broken host observer cannot silence the event stream.
    Expected outcome: the surviving delegate still receives the hook."""

    class _Broken(RalphIterationObserver):
        def on_iteration_start(self, iteration_num: int, task: Any) -> None:
            raise RuntimeError("this observer is broken")

    class _Working(RalphIterationObserver):
        def __init__(self) -> None:
            self.seen: list[int] = []

        def on_iteration_start(self, iteration_num: int, task: Any) -> None:
            self.seen.append(iteration_num)

    working = _Working()
    composite = CompositeIterationObserver(_Broken(), working)

    composite.on_iteration_start(4, _Task("t"))  # type: ignore[arg-type]

    assert working.seen == [4]


@verifies(SWR.SWR_1828)
def test_composite_runtime_kwargs_merge_with_the_later_delegate_winning() -> None:
    """Productive use: a host keeps its runtime kwargs when the stream is added.
    Expected outcome: keys from all delegates survive and a collision resolves to
    the later delegate's value."""

    class _First(RalphIterationObserver):
        def extra_runtime_kwargs(self) -> dict[str, Any]:
            return {"shared": "first", "only_first": 1}

    class _Second(RalphIterationObserver):
        def extra_runtime_kwargs(self) -> dict[str, Any]:
            return {"shared": "second", "only_second": 2}

    class _Broken(RalphIterationObserver):
        def extra_runtime_kwargs(self) -> dict[str, Any]:
            raise RuntimeError("nope")

    merged = CompositeIterationObserver(_First(), _Broken(), _Second()).extra_runtime_kwargs()

    assert merged == {"shared": "second", "only_first": 1, "only_second": 2}


@verifies(SWR.SWR_1828)
def test_the_stream_observer_composes_with_a_duck_typed_host_observer() -> None:
    """Productive use: the CLI adds the stream beside its message-limit observer.
    Expected outcome: the host observer still fires and the stream still emits."""

    class _DuckTypedHost:
        def __init__(self) -> None:
            self.limits: list[int] = []

        def on_message_limit_reached(self, message_count: int, message_limit: int) -> None:
            self.limits.append(message_limit)

    captured = _sink("s8")
    host = _DuckTypedHost()
    composite = CompositeIterationObserver(host, StreamEventObserver("s8"))

    composite.on_message_limit_reached(10, 10)
    composite.on_iteration_start(1, _Task("Do the thing"))  # type: ignore[arg-type]

    assert host.limits == [10]
    assert [event.event for event in captured] == ["iteration.start"]
