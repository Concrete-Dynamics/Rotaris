"""Productive use: a user runs a task that changes their code, and the workspace's
own checks run automatically afterwards instead of being taken on the agent's word.

Expected outcome: an iteration that modified files executes the configured check
suite and its per-check results are visible in the session output; a read-only
iteration skips the suite and the skip reason is recorded rather than dropped.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

import pytest

from rotaris_core.config.schema import CheckConfig, RotarisConfig, RuntimePolicy, VerifierConfig
from rotaris_core.orchestrator.report import ChildReportArtifact, EditedFile
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


def _todo() -> TodoList:
    return TodoList(
        phases=[TodoPhase(name="Phase 1", tasks=[TodoTask(name="Task 1", description="Do it")])],
    )


def _config(workspace: Path, *, command: str = "echo verified") -> RotarisConfig:
    return RotarisConfig(
        runtime=RuntimePolicy(child_timeout=5, classify_completion=False),
        verifier=VerifierConfig(checks=[CheckConfig(name="echo", command=command, timeout=60)]),
        workspace_root=workspace,
    )


def _loop(workspace: Path, session_dir: Path, report: ChildReportArtifact) -> RalphLoop:
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
    return loop


def _timeline(session_dir: Path) -> list[dict[str, Any]]:
    path = session_dir / "timeline.jsonl"
    if not path.is_file():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


def _events(session_dir: Path, event_type: str) -> list[dict[str, Any]]:
    return [event for event in _timeline(session_dir) if event.get("type") == event_type]


@verifies(SWR.SWR_2602)
@pytest.mark.asyncio
async def test_an_iteration_that_edited_files_runs_the_configured_check_suite(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    RecordingExecutor.instances.clear()
    monkeypatch.setattr("rotaris_core.tools.terminal.HardenedTerminalExecutor", RecordingExecutor)
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    session_dir = tmp_path / "session"
    report = ChildReportArtifact(
        agent_name="child",
        persona="orchestrator",
        status="succeeded",
        summary="Edited a file",
        edited_files=[EditedFile(path="src/app.py", change_type="modified")],
    )
    loop = _loop(workspace, session_dir, report)

    await loop.run(
        _todo(),
        agent_factory=lambda persona, rk=None: {"persona": persona},
        session_id="verifier-session",
    )

    assert [executor.commands for executor in RecordingExecutor.instances] == [["echo verified"]]
    assert RecordingExecutor.instances[0].working_dir == str(workspace)

    result = loop.last_verifier_run
    assert result is not None
    assert result.executed is True
    assert [(item.name, item.status) for item in result.results] == [("echo", "passed")]


@verifies(SWR.SWR_2602)
@pytest.mark.asyncio
async def test_a_read_only_iteration_skips_the_suite_and_records_the_reason(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    RecordingExecutor.instances.clear()
    monkeypatch.setattr("rotaris_core.tools.terminal.HardenedTerminalExecutor", RecordingExecutor)
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    session_dir = tmp_path / "session"
    report = ChildReportArtifact(
        agent_name="child",
        persona="orchestrator",
        status="succeeded",
        summary="Only read the code",
    )
    loop = _loop(workspace, session_dir, report)

    await loop.run(
        _todo(),
        agent_factory=lambda persona, rk=None: {"persona": persona},
        session_id="verifier-session",
    )

    assert RecordingExecutor.instances == []
    result = loop.last_verifier_run
    assert result is not None
    assert result.executed is False
    assert "No tracked file modifications" in str(result.skip_reason)

    skipped = _events(session_dir, "verifier_run_skipped")
    assert len(skipped) == 1
    assert "No tracked file modifications" in skipped[0]["metadata"]["skip_reason"]
    assert _events(session_dir, "verifier_run_completed") == []


@verifies(SWR.SWR_2602)
@pytest.mark.asyncio
async def test_a_failing_blocking_check_is_recorded_as_a_warning_in_the_session_output(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FailingExecutor(RecordingExecutor):
        def __call__(self, action: Any, conversation: Any = None) -> Any:
            observation = super().__call__(action, conversation)
            observation.exit_code = 2
            observation.text = "1 failed"
            return observation

    RecordingExecutor.instances.clear()
    monkeypatch.setattr("rotaris_core.tools.terminal.HardenedTerminalExecutor", FailingExecutor)
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    session_dir = tmp_path / "session"
    report = ChildReportArtifact(
        agent_name="child",
        persona="orchestrator",
        status="succeeded",
        summary="Edited a file",
        edited_files=[EditedFile(path="src/app.py", change_type="modified")],
    )
    loop = _loop(workspace, session_dir, report)

    # One iteration only: since SWR-2604 the failing blocking check gates
    # completion, so an unbounded run would re-queue this task until the
    # iteration limit. What this test is about is the single run's record.
    await loop.run(
        _todo(),
        agent_factory=lambda persona, rk=None: {"persona": persona},
        session_id="verifier-session",
        max_iterations=1,
    )

    result = loop.last_verifier_run
    assert result is not None
    assert [item.name for item in result.blocking_failures] == ["echo"]

    completed = _events(session_dir, "verifier_run_completed")
    assert len(completed) == 1
    assert completed[0]["severity"] == "warning"
    assert completed[0]["metadata"]["blocking_failures"] == ["echo"]
    assert completed[0]["metadata"]["checks"][0]["exit_code"] == 2


@verifies(SWR.SWR_2602)
@pytest.mark.asyncio
async def test_the_run_is_offered_to_the_observer_without_requiring_the_hook(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Not every host observer subclasses RalphIterationObserver (Rotaris' run
    # bridge is duck-typed), so a host predating this hook must still complete.
    class LegacyObserver:
        def __getattr__(self, name: str) -> Any:
            if name.startswith("on_") or name.endswith("_callbacks"):
                return lambda *args, **kwargs: None
            raise AttributeError(name)

        def extra_runtime_kwargs(self) -> dict[str, Any]:
            return {}

    received: list[Any] = []

    class ModernObserver(RalphIterationObserver):
        def on_verifier_run(self, iteration_num: int, result: Any) -> None:
            received.append((iteration_num, result))

    RecordingExecutor.instances.clear()
    monkeypatch.setattr("rotaris_core.tools.terminal.HardenedTerminalExecutor", RecordingExecutor)
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    report = ChildReportArtifact(
        agent_name="child",
        persona="orchestrator",
        status="succeeded",
        summary="Edited a file",
        edited_files=[EditedFile(path="src/app.py", change_type="modified")],
    )

    for index, observer in enumerate((LegacyObserver(), ModernObserver())):
        loop = _loop(workspace, tmp_path / f"session-{index}", report)
        loop._observer = observer  # type: ignore[assignment]
        progress = await loop.run(
            _todo(),
            agent_factory=lambda persona, rk=None: {"persona": persona},
            session_id="verifier-session",
        )
        # The iteration completed rather than crashing on a missing hook.
        assert progress.abandoned_tasks == 0
        assert loop.last_verifier_run is not None

    assert len(received) == 1
    assert received[0][0] == 1
    assert received[0][1].executed is True


@verifies(SWR.SWR_2601, SWR.SWR_2602)
@pytest.mark.asyncio
@pytest.mark.timeout(300)
async def test_a_run_that_changes_files_executes_the_real_configured_check(
    tmp_path: Path,
) -> None:
    """Hermetic user-flow E2E: no LLM, no network, real terminal execution path.

    The workspace declares a check; a run that changes a file must actually
    execute it and leave the result where a user can see it.
    """
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    session_dir = tmp_path / "session"
    report = ChildReportArtifact(
        agent_name="child",
        persona="orchestrator",
        status="succeeded",
        summary="Edited a file",
        edited_files=[EditedFile(path="app.py", change_type="modified")],
    )
    (workspace / "app.py").write_text("print('hi')\n", encoding="utf-8")
    loop = _loop(workspace, session_dir, report)

    await loop.run(
        _todo(),
        agent_factory=lambda persona, rk=None: {"persona": persona},
        session_id="verifier-session",
    )

    result = loop.last_verifier_run
    assert result is not None, "the verifier never ran"
    assert result.executed is True
    check = result.results[0]
    assert (check.name, check.status, check.exit_code) == ("echo", "passed", 0)
    assert "verified" in check.output_excerpt

    # Visible in the session output: the timeline entry and the full-output log.
    completed = _events(session_dir, "verifier_run_completed")
    assert len(completed) == 1
    assert completed[0]["metadata"]["checks"][0]["status"] == "passed"

    logs = sorted((session_dir / "evidence" / "verifier").glob("*.log"))
    assert len(logs) == 1
    assert "verified" in logs[0].read_text(encoding="utf-8")
    assert str(logs[0]) == check.output_log_path


@verifies(SWR.SWR_2609)
@pytest.mark.asyncio
async def test_verification_reports_itself_while_it_runs_not_only_when_it_ends(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The gap that made a finished agent look like a hung run is now narrated.

    Before this, the last thing a session recorded between the child ending and
    the iteration ending was the conversation closing — for however many minutes
    the suite took.
    """
    RecordingExecutor.instances.clear()
    monkeypatch.setattr("rotaris_core.tools.terminal.HardenedTerminalExecutor", RecordingExecutor)
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    session_dir = tmp_path / "session"
    report = ChildReportArtifact(
        agent_name="child",
        persona="orchestrator",
        status="succeeded",
        summary="Edited a file",
        edited_files=[EditedFile(path="src/app.py", change_type="modified")],
    )
    loop = _loop(workspace, session_dir, report)

    await loop.run(
        _todo(),
        agent_factory=lambda persona, rk=None: {"persona": persona},
        session_id="verifier-session",
    )

    started = _events(session_dir, "verifier_started")
    assert len(started) == 1
    assert started[0]["metadata"]["checks"] == ["echo"]

    check_started = _events(session_dir, "verifier_check_started")
    assert [event["metadata"]["check"] for event in check_started] == ["echo"]
    assert check_started[0]["metadata"]["index"] == 1
    assert check_started[0]["metadata"]["total"] == 1
    assert check_started[0]["metadata"]["deadline_s"] > 0

    check_finished = _events(session_dir, "verifier_check_finished")
    assert [event["metadata"]["status"] for event in check_finished] == ["passed"]

    ordered = [event["type"] for event in _timeline(session_dir)]
    assert ordered.index("verifier_started") < ordered.index("verifier_check_started")
    assert ordered.index("verifier_check_started") < ordered.index("verifier_check_finished")
    assert ordered.index("verifier_check_finished") < ordered.index("verifier_run_completed")


@verifies(SWR.SWR_2609)
@pytest.mark.asyncio
async def test_a_read_only_iteration_never_announces_a_verification_phase(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A host that lit its indicator here would have nothing to turn it off."""
    RecordingExecutor.instances.clear()
    monkeypatch.setattr("rotaris_core.tools.terminal.HardenedTerminalExecutor", RecordingExecutor)
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    session_dir = tmp_path / "session"
    report = ChildReportArtifact(
        agent_name="child",
        persona="orchestrator",
        status="succeeded",
        summary="Only read the code",
    )
    loop = _loop(workspace, session_dir, report)

    await loop.run(
        _todo(),
        agent_factory=lambda persona, rk=None: {"persona": persona},
        session_id="verifier-session",
    )

    assert _events(session_dir, "verifier_started") == []
    assert _events(session_dir, "verifier_check_started") == []


@verifies(SWR.SWR_2609, SWR.SWR_2610)
@pytest.mark.asyncio
async def test_a_host_is_offered_the_running_suite_and_loses_it_when_it_ends(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The skip control is live exactly while there is something to skip."""
    RecordingExecutor.instances.clear()
    monkeypatch.setattr("rotaris_core.tools.terminal.HardenedTerminalExecutor", RecordingExecutor)
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    session_dir = tmp_path / "session"
    report = ChildReportArtifact(
        agent_name="child",
        persona="orchestrator",
        status="succeeded",
        summary="Edited a file",
        edited_files=[EditedFile(path="src/app.py", change_type="modified")],
    )
    loop = _loop(workspace, session_dir, report)

    seen: list[tuple[str, Any]] = []

    class SkipOfferingObserver(RalphIterationObserver):
        def on_verifier_started(self, iteration_num: int, suite: Any, control: Any) -> None:
            del iteration_num
            seen.append(("started", control))

        def on_verifier_check_started(  # noqa: PLR0913
            self,
            iteration_num: int,
            check: Any,
            index: int,
            total: int,
            deadline_s: float,
        ) -> None:
            del iteration_num, index, total, deadline_s
            seen.append(("check", check.name))

        def on_verifier_run(self, iteration_num: int, result: Any) -> None:
            del iteration_num, result
            seen.append(("ended", loop.skip_verifier_check()))

    loop._observer = SkipOfferingObserver()  # noqa: SLF001

    await loop.run(
        _todo(),
        agent_factory=lambda persona, rk=None: {"persona": persona},
        session_id="verifier-session",
    )

    assert [name for name, _ in seen] == ["started", "check", "ended"]
    assert seen[0][1] is not None
    # By the time the suite has ended there is nothing left to skip.
    assert seen[2][1] is False
    assert loop.skip_verifier_check() is False
