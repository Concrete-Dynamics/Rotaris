"""Productive use: a user (and the parent agent) reads one artifact — the child
report — to learn whether the workspace's own checks passed on the code that was
just changed, rather than trusting a summary the model wrote about itself.

Expected outcome: the report the iteration finalizes carries the deterministic
verdict, the suite it came from, and the per-check results; a summarizing model
cannot write or overwrite that evidence.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import pytest

from rotaris_core.config.schema import CheckConfig, RotarisConfig, RuntimePolicy, VerifierConfig
from rotaris_core.orchestrator.report import ChildReportArtifact, EditedFile
from rotaris_core.orchestrator.summary_agent import SummaryAgent
from rotaris_core.ralph import RalphLoop
from rotaris_core.ralph.iteration_observer import RalphIterationObserver
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tools.todo_state import TodoList, TodoPhase, TodoTask

if TYPE_CHECKING:
    from pathlib import Path


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
    def __call__(self, action: Any, conversation: Any = None) -> Any:
        observation = super().__call__(action, conversation)
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
    """Captures the report exactly as the iteration finalizes it."""

    def __init__(self) -> None:
        self.reports: list[ChildReportArtifact] = []

    def on_iteration_end(self, record, report, manager, todo, outcome) -> None:  # noqa: ANN001
        del record, manager, todo, outcome
        self.reports.append(report)


def _todo() -> TodoList:
    return TodoList(
        phases=[TodoPhase(name="Phase 1", tasks=[TodoTask(name="Task 1", description="Do it")])],
    )


def _config(workspace: Path) -> RotarisConfig:
    return RotarisConfig(
        runtime=RuntimePolicy(child_timeout=5, classify_completion=False),
        verifier=VerifierConfig(
            checks=[CheckConfig(name="tests", command="echo verified", timeout=60)],
        ),
        workspace_root=workspace,
    )


def _loop(
    workspace: Path,
    session_dir: Path,
    report: ChildReportArtifact,
    observer: RalphIterationObserver,
) -> RalphLoop:
    loop = RalphLoop(
        config=_config(workspace),
        workspace_root=str(workspace),
        summary_agent=MockSummaryAgent(),
        conversation_persistence_dir=session_dir / "conversations",
    )

    async def _run_child(record, agent, **kwargs):  # noqa: ANN001, ANN202
        del record, agent, kwargs
        return report

    loop.scheduler.run_child = _run_child  # type: ignore[method-assign]
    loop._observer = observer  # type: ignore[assignment]
    return loop


def _edited_report() -> ChildReportArtifact:
    return ChildReportArtifact(
        agent_name="child",
        persona="coder",
        status="succeeded",
        summary="Edited a file",
        edited_files=[EditedFile(path="src/app.py", change_type="modified")],
    )


async def _run(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    *,
    report: ChildReportArtifact,
    executor: type[RecordingExecutor] = RecordingExecutor,
    max_iterations: int | None = None,
) -> CapturingObserver:
    RecordingExecutor.instances.clear()
    monkeypatch.setattr("rotaris_core.tools.terminal.HardenedTerminalExecutor", executor)
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    observer = CapturingObserver()
    loop = _loop(workspace, tmp_path / "session", report, observer)

    kwargs: dict[str, Any] = {}
    if max_iterations is not None:
        kwargs["max_iterations"] = max_iterations
    await loop.run(
        _todo(),
        agent_factory=lambda persona, rk=None: {"persona": persona},
        session_id="verifier-evidence-session",
        **kwargs,
    )
    return observer


@verifies(SWR.SWR_2603)
@pytest.mark.asyncio
async def test_an_iteration_that_edited_files_carries_the_check_results_in_its_report(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    observer = await _run(tmp_path, monkeypatch, report=_edited_report())

    assert len(observer.reports) == 1
    evidence = observer.reports[0].verifier_results
    assert evidence is not None
    assert evidence.verdict == "passed"
    assert evidence.executed is True
    assert evidence.suite_source == "config"

    check = evidence.checks[0]
    assert (check.name, check.command, check.status) == ("tests", "echo verified", "passed")
    assert check.duration_s >= 0.0
    assert "verified" in check.output_excerpt

    # The excerpt is bounded; the full output stays referenced by path, and that
    # path points at a real log under the session's evidence directory.
    logs = sorted((tmp_path / "session" / "evidence" / "verifier").glob("*.log"))
    assert [str(log) for log in logs] == [check.output_log_path]
    assert "verified" in logs[0].read_text(encoding="utf-8")

    # The snapshot the hosts persist (tui/ralph_loop.py) carries the same thing.
    payload = observer.reports[0].model_dump(mode="json")
    assert payload["verifier_results"]["verdict"] == "passed"
    assert payload["verifier_results"]["checks"][0]["output_log_path"] == check.output_log_path


@verifies(SWR.SWR_2603)
@pytest.mark.asyncio
async def test_a_read_only_iteration_reports_a_skipped_verdict_with_the_reason(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    read_only = ChildReportArtifact(
        agent_name="child",
        persona="coder",
        status="succeeded",
        summary="Only read the code",
    )

    observer = await _run(tmp_path, monkeypatch, report=read_only)

    evidence = observer.reports[0].verifier_results
    assert evidence is not None
    # "skipped", never "passed": nothing was verified, and the gate must be able
    # to tell those apart.
    assert evidence.verdict == "skipped"
    assert evidence.executed is False
    assert "No tracked file modifications" in str(evidence.skip_reason)
    assert evidence.checks == []
    assert RecordingExecutor.instances == []


@verifies(SWR.SWR_2603)
@pytest.mark.asyncio
async def test_a_blocking_failure_reaches_the_report_as_a_failed_verdict(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    observer = await _run(
        tmp_path,
        monkeypatch,
        report=_edited_report(),
        executor=FailingExecutor,
        max_iterations=1,
    )

    report = observer.reports[0]
    evidence = report.verifier_results
    assert evidence is not None
    assert evidence.verdict == "failed"
    assert [check.name for check in evidence.blocking_failures] == ["tests"]
    assert evidence.checks[0].exit_code == 2
    assert "1 failed" in evidence.checks[0].output_excerpt
    # The LLM never mentioned a test failure — `tests` is what the model wrote
    # about itself, and it is empty. Only the deterministic evidence knows, which
    # is exactly why it lives in its own field; the SWR-2604 gate reads that field
    # and is the reason the status now says "partial" rather than "succeeded".
    assert report.tests == []
    assert report.status == "partial"


@verifies(SWR.SWR_2603)
@pytest.mark.asyncio
async def test_the_evidence_survives_the_incomplete_todo_requeue_path(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # The loop rewrites the report via model_copy on this path; the evidence is
    # attached before it and must not be dropped on the way to the observer.
    RecordingExecutor.instances.clear()
    monkeypatch.setattr("rotaris_core.tools.terminal.HardenedTerminalExecutor", RecordingExecutor)
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    observer = CapturingObserver()
    loop = _loop(workspace, tmp_path / "session", _edited_report(), observer)

    incomplete = TodoList(
        phases=[
            TodoPhase(
                name="Phase 1",
                tasks=[
                    TodoTask(name="Task 1", description="Do it"),
                    TodoTask(name="Task 2", description="Still open"),
                ],
            ),
        ],
    )
    monkeypatch.setattr(
        loop,
        "_get_incomplete_todo_tasks",
        lambda _state: list(incomplete.phases[0].tasks),
    )

    await loop.run(
        _todo(),
        agent_factory=lambda persona, rk=None: {"persona": persona},
        session_id="verifier-evidence-session",
    )

    assert observer.reports, "the iteration never reached on_iteration_end"
    evidence = observer.reports[0].verifier_results
    assert evidence is not None
    assert evidence.verdict == "passed"
    # The summary was rewritten by the requeue path, and the evidence rode along.
    assert "Re-queued task" in observer.reports[0].summary


@verifies(SWR.SWR_2603)
@pytest.mark.asyncio
async def test_the_evidence_survives_the_completion_classifier_rewrite(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # A NEEDS_ITERATION verdict rewrites status and summary via model_copy. The
    # deterministic evidence must not be lost in that rewrite — SWR-2604 gates
    # on exactly this report.
    class _Classifier:
        async def classify(self, report, intent, open_todos):  # noqa: ANN001, ANN202
            del report, intent, open_todos
            from rotaris_core.ralph.completion_classifier import CompletionVerdict

            return CompletionVerdict(verdict="NEEDS_ITERATION", reason="work looks unfinished")

    RecordingExecutor.instances.clear()
    monkeypatch.setattr("rotaris_core.tools.terminal.HardenedTerminalExecutor", RecordingExecutor)
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    observer = CapturingObserver()
    loop = _loop(workspace, tmp_path / "session", _edited_report(), observer)
    monkeypatch.setattr(loop, "_get_completion_classifier", lambda: _Classifier())

    await loop.run(
        _todo(),
        agent_factory=lambda persona, rk=None: {"persona": persona},
        session_id="verifier-evidence-session",
    )

    report = observer.reports[0]
    assert report.status == "partial"
    assert "work looks unfinished" in report.summary
    assert report.verifier_results is not None
    assert report.verifier_results.verdict == "passed"


@verifies(SWR.SWR_2603)
def test_a_summary_agent_that_fabricates_verifier_results_cannot_write_them() -> None:
    """A summarizing model must not be able to author its own passing verdict."""

    class _Record:
        canonical_name = "child-1"
        persona = "coder"

    agent = SummaryAgent(llm=None)  # type: ignore[arg-type]
    fabricated = (
        '{"status": "succeeded", "summary": "All good",'
        ' "verifier_results": {"verdict": "passed", "executed": true,'
        ' "suite_source": "config", "checks": [{"name": "tests",'
        ' "command": "pytest", "status": "passed"}]}}'
    )

    report = agent._parse_report(fabricated, _Record())  # type: ignore[arg-type]  # noqa: SLF001

    assert report.verifier_results is None
    assert report.summary == "All good"
