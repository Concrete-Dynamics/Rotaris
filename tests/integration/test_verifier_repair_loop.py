"""Productive use: a user's change breaks the workspace's test suite. They want
the harness to hand the agent the failing output and let it try again — twice,
not twenty times — and then stop and tell them which check is still broken,
without taking the rest of the run down with it.

Expected outcome: each gated iteration charges one repair attempt, the retry's
prompt carries that iteration's failing output (and only that iteration's), and
the attempt that spends the budget ends the task as failed-verification with the
checks named — recorded on the report, on the diagnostics timeline, and offered
to the host through an observer hook.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

import pytest

from rotaris_core.config.schema import CheckConfig, RotarisConfig, RuntimePolicy, VerifierConfig
from rotaris_core.orchestrator.report import ChildReportArtifact, EditedFile
from rotaris_core.orchestrator.summary_agent import SummaryAgent
from rotaris_core.ralph import RalphLoop
from rotaris_core.ralph.iteration_observer import RalphIterationObserver
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tools.todo_state import TodoList, TodoPhase, TodoTask
from rotaris_core.verifier.repair import RepairDecision

if TYPE_CHECKING:
    from pathlib import Path

    from rotaris_core.ralph.state import RalphIterationOutcome, RalphProgressFile
    from rotaris_core.verifier.evidence import VerifierEvidence


class RecordingExecutor:
    """Stands in for the terminal backend while keeping the real dispatch path."""

    instances: list[RecordingExecutor] = []

    def __init__(self, **kwargs: Any) -> None:
        self.working_dir = kwargs.get("working_dir")
        self.commands: list[str] = []
        RecordingExecutor.instances.append(self)

    def __call__(self, action: Any, conversation: Any = None) -> Any:
        del conversation
        self.commands.append(action.command)
        return _Observation(action.command)

    def cleanup(self) -> None:
        return


class FailingExecutor(RecordingExecutor):
    """A check suite that stays red no matter how often the agent tries."""

    def __call__(self, action: Any, conversation: Any = None) -> Any:
        observation = super().__call__(action, conversation)
        observation.exit_code = 2
        observation.text = f"1 failed, 4 passed - run #{len(RecordingExecutor.instances)}"
        return observation


class RepairedExecutor(RecordingExecutor):
    """Red on the first run, green afterwards — the agent fixed it."""

    def __call__(self, action: Any, conversation: Any = None) -> Any:
        observation = super().__call__(action, conversation)
        if len(RecordingExecutor.instances) == 1:
            observation.exit_code = 2
            observation.text = "1 failed, 4 passed"
        return observation


class _Observation:
    def __init__(self, command: str) -> None:
        self.command = command
        self.exit_code = 0
        self.text = "verified"
        self.failure_kind = None


class MockSummaryAgent:
    async def generate_report(self, record, transcript, *, fallback_status="failed"):  # noqa: ANN001, ANN201
        del transcript, fallback_status
        return ChildReportArtifact(
            agent_name=record.canonical_name,
            persona=record.persona,
            status="succeeded",
            summary="Done",
        )


class CapturingObserver(RalphIterationObserver):
    """Captures each iteration's finalized report, outcome, and any escalation."""

    def __init__(self) -> None:
        self.reports: list[ChildReportArtifact] = []
        self.outcomes: list[RalphIterationOutcome] = []
        self.escalations: list[tuple[int, RepairDecision, VerifierEvidence | None]] = []

    def on_iteration_end(self, record, report, manager, todo, outcome) -> None:  # noqa: ANN001
        del record, manager, todo
        self.reports.append(report)
        self.outcomes.append(outcome)

    def on_repair_escalation(self, iteration_num, decision, evidence) -> None:  # noqa: ANN001
        self.escalations.append((iteration_num, decision, evidence))


def _todo() -> TodoList:
    task = TodoTask(name="Task 1", description="Fix the module")
    task.set_execution_context("Fix the module")
    return TodoList(phases=[TodoPhase(name="Phase 1", tasks=[task])])


def _config(
    workspace: Path,
    *,
    gate_completion: bool = True,
    max_repair_attempts: int = 2,
) -> RotarisConfig:
    return RotarisConfig(
        runtime=RuntimePolicy(child_timeout=5, classify_completion=False),
        verifier=VerifierConfig(
            checks=[CheckConfig(name="tests", command="echo verified", timeout=60)],
            gate_completion=gate_completion,
            max_repair_attempts=max_repair_attempts,
        ),
        workspace_root=workspace,
    )


def _edited_report() -> ChildReportArtifact:
    return ChildReportArtifact(
        agent_name="child",
        persona="coder",
        status="succeeded",
        summary="Edited a file",
        edited_files=[EditedFile(path="src/app.py", change_type="modified")],
    )


def _timeline(session_dir: Path) -> list[dict[str, Any]]:
    path = session_dir / "timeline.jsonl"
    if not path.is_file():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


def _events(session_dir: Path, event_type: str) -> list[dict[str, Any]]:
    return [event for event in _timeline(session_dir) if event.get("type") == event_type]


class _Run:
    """Everything a test needs to inspect after the loop has finished."""

    def __init__(
        self,
        observer: CapturingObserver,
        todo: TodoList,
        session_dir: Path,
        progress: RalphProgressFile,
        loop: RalphLoop,
        payloads: list[str],
    ) -> None:
        self.observer = observer
        self.todo = todo
        self.session_dir = session_dir
        self.progress = progress
        self.loop = loop
        #: The task's execution payload as each iteration received it.
        self.payloads = payloads


async def _run(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    *,
    executor: type[RecordingExecutor] = FailingExecutor,
    gate_completion: bool = True,
    max_repair_attempts: int = 2,
    max_iterations: int = 10,
) -> _Run:
    RecordingExecutor.instances.clear()
    monkeypatch.setattr("rotaris_core.tools.terminal.HardenedTerminalExecutor", executor)
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    session_dir = tmp_path / "session"
    observer = CapturingObserver()
    todo = _todo()
    task = todo.phases[0].tasks[0]
    payloads: list[str] = []

    loop = RalphLoop(
        config=_config(
            workspace,
            gate_completion=gate_completion,
            max_repair_attempts=max_repair_attempts,
        ),
        workspace_root=str(workspace),
        summary_agent=MockSummaryAgent(),
        conversation_persistence_dir=session_dir / "conversations",
    )

    async def _run_child(record, agent, **kwargs):  # noqa: ANN001, ANN202
        del record, agent, kwargs
        # Captured here rather than after the run: the loop rewrites the payload
        # between iterations, so only the live value proves what the agent saw.
        payloads.append(task.execution_payload)
        return _edited_report()

    loop.scheduler.run_child = _run_child  # type: ignore[method-assign]
    loop._observer = observer  # type: ignore[assignment]

    progress = await loop.run(
        todo,
        agent_factory=lambda persona, rk=None: {"persona": persona},
        session_id="repair-session",
        max_iterations=max_iterations,
    )
    return _Run(observer, todo, session_dir, progress, loop, payloads)


@verifies(SWR.SWR_2605)
@pytest.mark.asyncio
async def test_the_failing_output_reaches_the_next_attempt(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Without this the repair attempt is the original prompt run again, which is
    # exactly how a red check used to consume every remaining iteration.
    run = await _run(tmp_path, monkeypatch)

    assert run.payloads[0] == "Fix the module", "the first attempt gets the plain task"
    second = run.payloads[1]
    assert "VERIFICATION FAILURE:" in second
    assert "Check 'tests' (failed)" in second
    assert "1 failed, 4 passed" in second
    assert second.startswith("Fix the module"), "the original task must survive the injection"


@verifies(SWR.SWR_2605)
@pytest.mark.asyncio
async def test_every_repair_attempt_re_runs_the_verifier(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    run = await _run(tmp_path, monkeypatch)

    # One suite execution per attempt — the budget is spent on verified work,
    # not on the first run's stale evidence.
    assert len(RecordingExecutor.instances) == 2
    assert len(run.observer.reports) == 2


@verifies(SWR.SWR_2605)
@pytest.mark.asyncio
async def test_the_payload_never_accumulates_a_stale_failure_block(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Three attempts, so a second injection happens on top of the first. The
    # agent must see the current failure, not a pile of previous ones.
    run = await _run(tmp_path, monkeypatch, max_repair_attempts=3)

    assert len(run.payloads) == 3
    assert run.payloads[-1].count("VERIFICATION FAILURE:") == 1
    assert run.payloads[-1].count("Check 'tests' (failed)") == 1


@verifies(SWR.SWR_2605)
@pytest.mark.asyncio
async def test_an_exhausted_budget_ends_the_task_as_failed_verification(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    run = await _run(tmp_path, monkeypatch)

    # Bounded: 2 attempts, not the 10-iteration cap.
    assert len(run.observer.reports) == 2
    assert [outcome.name for outcome in run.observer.outcomes] == ["PENDING", "ABANDONED"]

    final = run.observer.reports[-1]
    assert final.status == "failed"
    assert final.repair is not None
    assert final.repair.action == "escalate"
    assert final.repair.attempt == 2
    assert final.repair.unsatisfied_checks == ["tests"]
    assert "tests" in final.summary

    assert run.progress.abandoned_tasks == 1
    assert run.progress.completed_tasks == 0
    # One red check must not take the rest of the run down with it.
    assert run.progress.stop_reason != "agent session aborted"


@verifies(SWR.SWR_2605)
@pytest.mark.asyncio
async def test_a_zero_budget_escalates_on_the_first_gated_iteration(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    run = await _run(tmp_path, monkeypatch, max_repair_attempts=0)

    assert len(run.observer.reports) == 1
    assert run.observer.outcomes[0].name == "ABANDONED"
    assert run.observer.reports[0].repair is not None
    assert run.observer.reports[0].repair.action == "escalate"


@verifies(SWR.SWR_2605)
@pytest.mark.asyncio
async def test_a_repaired_check_completes_and_releases_the_budget(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    run = await _run(tmp_path, monkeypatch, executor=RepairedExecutor)

    assert [outcome.name for outcome in run.observer.outcomes] == ["PENDING", "COMPLETED"]
    assert run.progress.completed_tasks == 1
    # The budget is released, so a later regression starts from a full one
    # instead of an already-spent count.
    assert run.loop._repair_attempts == {}  # noqa: SLF001


@verifies(SWR.SWR_2605)
@pytest.mark.asyncio
async def test_gate_completion_false_runs_no_repair_loop(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    run = await _run(tmp_path, monkeypatch, gate_completion=False)

    assert len(run.observer.reports) == 1
    assert run.observer.reports[0].repair is None
    assert run.observer.reports[0].status == "succeeded"
    assert run.payloads == ["Fix the module"]


@verifies(SWR.SWR_2605)
@pytest.mark.asyncio
async def test_the_repair_decisions_are_recorded_in_the_session_diagnostics(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    run = await _run(tmp_path, monkeypatch)

    scheduled = _events(run.session_dir, "repair_attempt_scheduled")
    assert len(scheduled) == 1
    assert scheduled[0]["metadata"]["attempt"] == 1

    escalations = _events(run.session_dir, "repair_escalation")
    assert len(escalations) == 1
    assert escalations[0]["severity"] == "error"
    metadata = escalations[0]["metadata"]
    assert metadata["action"] == "escalate"
    assert metadata["attempt"] == 2
    assert metadata["max_attempts"] == 2
    assert metadata["unsatisfied_checks"] == ["tests"]


@verifies(SWR.SWR_2605)
@pytest.mark.asyncio
async def test_the_host_is_offered_the_escalation(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    run = await _run(tmp_path, monkeypatch)

    assert len(run.observer.escalations) == 1
    iteration_num, decision, evidence = run.observer.escalations[0]
    assert iteration_num == 2
    assert decision.action == "escalate"
    # The host gets the evidence too, so it can show the user the actual output.
    assert evidence is not None
    assert evidence.checks[0].output_excerpt.startswith("1 failed")


@verifies(SWR.SWR_2605)
@pytest.mark.asyncio
async def test_a_host_without_the_hook_still_survives_an_escalation(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Rotaris' run bridge is duck-typed, so a host built before this hook existed
    # must not turn an escalation into a crashed iteration.
    run = await _run(tmp_path, monkeypatch)
    decision = RepairDecision(
        action="escalate",
        attempt=2,
        max_attempts=2,
        unsatisfied_checks=["tests"],
        reason="still failing",
    )

    run.loop._observer = object()  # type: ignore[assignment]  # noqa: SLF001
    run.loop._notify_repair_observer(2, decision, None)  # noqa: SLF001


@verifies(SWR.SWR_2605)
def test_a_summary_agent_cannot_author_its_own_repair_decision() -> None:
    """A model must not be able to claim a repair attempt it never spent."""

    class _Record:
        canonical_name = "child-1"
        persona = "coder"

    agent = SummaryAgent(llm=None)  # type: ignore[arg-type]
    fabricated = (
        '{"status": "succeeded", "summary": "All good",'
        ' "repair": {"action": "retry", "attempt": 1, "max_attempts": 9,'
        ' "reason": "I gave myself more tries"}}'
    )

    report = agent._parse_report(fabricated, _Record())  # type: ignore[arg-type]  # noqa: SLF001

    assert report.repair is None
    assert report.summary == "All good"
