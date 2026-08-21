"""Productive use: a user runs a task that changes traced code and reads one
artifact — the child report — to learn which requirements the change served,
which of them are actually verified by tests this run executed, and what the
change touched that no requirement asked for.

Expected outcome: the report the iteration finalizes carries requirement-coverage
evidence (SWR-2606) and a scope-drift report (SWR-2607); an unadopted workspace
runs unaffected and gets ``None`` for both; and a summarizing model can neither
author nor overwrite either field.

Marker tokens are assembled through the T/V constants so this file's own source
carries no scannable reference token for the fixtures it writes.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import pytest

from rotaris_core.config.schema import CheckConfig, RotarisConfig, RuntimePolicy, VerifierConfig
from rotaris_core.orchestrator.report import ChildReportArtifact, CreatedFile, EditedFile
from rotaris_core.orchestrator.summary_agent import SummaryAgent
from rotaris_core.ralph import RalphLoop
from rotaris_core.ralph.iteration_observer import RalphIterationObserver
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tools.todo_state import TodoList, TodoPhase, TodoTask

if TYPE_CHECKING:
    from pathlib import Path

T = "traces"
V = "verifies"

TRACED = "src/rotaris_core/covered.py"
UNCOVERED = "src/rotaris_core/uncovered.py"
HELPER = "src/rotaris_core/helper.py"
COVERING_TEST = "tests/unit/test_covered.py"


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
        self.text = "5 passed"
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


def _write_workspace(workspace: Path) -> None:
    """A ReqToCode-adopting workspace: one covered requirement, one uncovered."""
    reqs = workspace / "docs" / "requirements"
    reqs.mkdir(parents=True)
    for number, title in ((101, "Covered thing"), (102, "Uncovered thing")):
        (reqs / f"SWR-{number}-demo.md").write_text(
            f"---\nreq-id: SWR-{number}\nstatus: approved\ntrace: required\n"
            f'test: required\ntitle: "{title}"\n---\n\nBody.\n',
            encoding="utf-8",
        )
    impl = workspace / "src" / "rotaris_core"
    impl.mkdir(parents=True)
    (impl / "covered.py").write_text(
        f"@{T}(SWR.SWR_101)\ndef covered() -> None: ...\n",
        encoding="utf-8",
    )
    (impl / "uncovered.py").write_text(
        f"@{T}(SWR.SWR_102)\ndef uncovered() -> None: ...\n",
        encoding="utf-8",
    )
    (impl / "helper.py").write_text("def helper() -> None: ...\n", encoding="utf-8")
    tests = workspace / "tests" / "unit"
    tests.mkdir(parents=True)
    (tests / "test_covered.py").write_text(
        f"@{V}(SWR.SWR_101)\ndef test_covered() -> None: ...\n",
        encoding="utf-8",
    )


def _todo() -> TodoList:
    return TodoList(
        phases=[TodoPhase(name="Phase 1", tasks=[TodoTask(name="Task 1", description="Do it")])],
    )


def _config(workspace: Path, command: str) -> RotarisConfig:
    return RotarisConfig(
        runtime=RuntimePolicy(child_timeout=5, classify_completion=False),
        verifier=VerifierConfig(checks=[CheckConfig(name="tests", command=command, timeout=60)]),
        workspace_root=workspace,
    )


def _report(*edited: str, created: tuple[str, ...] = ()) -> ChildReportArtifact:
    return ChildReportArtifact(
        agent_name="child",
        persona="coder",
        status="succeeded",
        summary="Changed some files",
        edited_files=[EditedFile(path=path, change_type="modified") for path in edited],
        created_files=[CreatedFile(path=path) for path in created],
    )


async def _run(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    *,
    report: ChildReportArtifact,
    adopted: bool = True,
    command: str = "pytest tests",
) -> CapturingObserver:
    RecordingExecutor.instances.clear()
    monkeypatch.setattr("rotaris_core.tools.terminal.HardenedTerminalExecutor", RecordingExecutor)
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    if adopted:
        _write_workspace(workspace)

    observer = CapturingObserver()
    loop = RalphLoop(
        config=_config(workspace, command),
        workspace_root=str(workspace),
        summary_agent=MockSummaryAgent(),
        conversation_persistence_dir=tmp_path / "session" / "conversations",
    )

    async def _run_child(record, agent, **kwargs):  # noqa: ANN001, ANN202
        del record, agent, kwargs
        return report

    loop.scheduler.run_child = _run_child  # type: ignore[method-assign]
    loop._observer = observer  # type: ignore[assignment]

    await loop.run(
        _todo(),
        agent_factory=lambda persona, rk=None: {"persona": persona},
        session_id="requirement-evidence-session",
    )
    return observer


@verifies(SWR.SWR_2606)
@pytest.mark.asyncio
async def test_editing_a_traced_module_reports_its_requirement_and_whether_it_was_verified(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    observer = await _run(tmp_path, monkeypatch, report=_report(TRACED))

    evidence = observer.reports[0].requirement_evidence
    assert evidence is not None
    assert evidence.changed_files == [TRACED]

    touched = evidence.requirements
    assert [req.req_id for req in touched] == ["SWR-101"]
    assert touched[0].title == "Covered thing"
    assert [site.path for site in touched[0].implementations] == [TRACED]

    covering = touched[0].covering_tests
    assert [test.path for test in covering] == [COVERING_TEST]
    assert covering[0].executed is True
    assert (covering[0].check_name, covering[0].check_status) == ("tests", "passed")
    assert touched[0].coverage_state == "verified"
    assert evidence.verified_requirements == ["SWR-101"]

    # The snapshot the hosts persist carries the same thing.
    payload = observer.reports[0].model_dump(mode="json")
    assert payload["requirement_evidence"]["requirements"][0]["coverage_state"] == "verified"


@verifies(SWR.SWR_2606)
@pytest.mark.asyncio
async def test_a_covering_test_the_suite_did_not_run_is_distinguishable_from_a_pass(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # The suite is green — but it ran a directory that does not hold this
    # requirement's covering test. Without SWR-2606 that is invisible.
    observer = await _run(
        tmp_path,
        monkeypatch,
        report=_report(TRACED),
        command="pytest tests/integration",
    )

    evidence = observer.reports[0].requirement_evidence
    assert evidence is not None
    assert observer.reports[0].verifier_results is not None
    assert observer.reports[0].verifier_results.verdict == "passed"

    assert evidence.unrun_requirements == ["SWR-101"]
    assert evidence.verified_requirements == []
    assert evidence.requirements[0].covering_tests[0].executed is False


@verifies(SWR.SWR_2606)
@pytest.mark.asyncio
async def test_a_traced_module_with_no_covering_test_is_named_as_uncovered(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    observer = await _run(tmp_path, monkeypatch, report=_report(UNCOVERED))

    evidence = observer.reports[0].requirement_evidence
    assert evidence is not None
    # By id, not as a count: the reviewer can go and write the missing test.
    assert evidence.uncovered_requirements == ["SWR-102"]
    assert evidence.requirements[0].covering_tests == []


@verifies(SWR.SWR_2607)
@pytest.mark.asyncio
async def test_an_untraced_helper_changed_alongside_traced_work_is_reported_as_drift(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    observer = await _run(tmp_path, monkeypatch, report=_report(TRACED, HELPER))

    report = observer.reports[0]
    assert report.scope_drift is not None
    assert report.scope_drift.files == [HELPER]
    assert report.scope_drift.total == 1
    assert report.scope_drift.baselined_files == []
    # And the traced half is still accounted for on the same report.
    assert report.requirement_evidence is not None
    assert [req.req_id for req in report.requirement_evidence.requirements] == ["SWR-101"]


@verifies(SWR.SWR_2607)
@pytest.mark.asyncio
async def test_a_baselined_untraced_file_is_still_reported_when_this_iteration_changed_it(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    RecordingExecutor.instances.clear()
    monkeypatch.setattr("rotaris_core.tools.terminal.HardenedTerminalExecutor", RecordingExecutor)
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    _write_workspace(workspace)
    (workspace / "docs" / "requirements" / "orphan-baseline.txt").write_text(
        f"{HELPER}\n",
        encoding="utf-8",
    )

    observer = CapturingObserver()
    loop = RalphLoop(
        config=_config(workspace, "pytest tests"),
        workspace_root=str(workspace),
        summary_agent=MockSummaryAgent(),
        conversation_persistence_dir=tmp_path / "session" / "conversations",
    )

    async def _run_child(record, agent, **kwargs):  # noqa: ANN001, ANN202
        del record, agent, kwargs
        return _report(TRACED, HELPER)

    loop.scheduler.run_child = _run_child  # type: ignore[method-assign]
    loop._observer = observer  # type: ignore[assignment]

    await loop.run(
        _todo(),
        agent_factory=lambda persona, rk=None: {"persona": persona},
        session_id="requirement-evidence-session",
    )

    drift = observer.reports[0].scope_drift
    assert drift is not None
    # The baseline keeps the build green on pre-existing debt; it does not let an
    # agent keep editing untraced code unnoticed.
    assert drift.files == [HELPER]
    assert drift.baselined_files == [HELPER]


@verifies(SWR.SWR_2607)
@pytest.mark.asyncio
async def test_changing_only_traced_code_reports_no_drift_rather_than_not_computed(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    observer = await _run(tmp_path, monkeypatch, report=_report(TRACED))

    drift = observer.reports[0].scope_drift
    assert drift is not None
    assert drift.files == []
    assert drift.total == 0


@verifies(SWR.SWR_2606, SWR.SWR_2607)
@pytest.mark.asyncio
async def test_a_workspace_with_no_requirement_store_runs_unaffected_and_reports_nothing(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    observer = await _run(tmp_path, monkeypatch, report=_report(TRACED), adopted=False)

    report = observer.reports[0]
    # "Not computed" — never an empty result that would read as "nothing touched".
    assert report.requirement_evidence is None
    assert report.scope_drift is None
    # The run itself is untouched: the verifier still ran and the task completed.
    assert report.status == "succeeded"
    assert report.verifier_results is not None
    assert report.verifier_results.verdict == "passed"


@verifies(SWR.SWR_2606, SWR.SWR_2607)
@pytest.mark.asyncio
async def test_a_read_only_iteration_computes_no_evidence_and_pays_no_sweep(
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

    assert observer.reports[0].requirement_evidence is None
    assert observer.reports[0].scope_drift is None


@verifies(SWR.SWR_2606, SWR.SWR_2607)
@pytest.mark.asyncio
async def test_the_evidence_survives_the_incomplete_todo_requeue_path(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # This exit rewrites the report via model_copy; the evidence is attached
    # before it and must not be dropped on the way to the observer.
    RecordingExecutor.instances.clear()
    monkeypatch.setattr("rotaris_core.tools.terminal.HardenedTerminalExecutor", RecordingExecutor)
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    _write_workspace(workspace)

    observer = CapturingObserver()
    loop = RalphLoop(
        config=_config(workspace, "pytest tests"),
        workspace_root=str(workspace),
        summary_agent=MockSummaryAgent(),
        conversation_persistence_dir=tmp_path / "session" / "conversations",
    )

    async def _run_child(record, agent, **kwargs):  # noqa: ANN001, ANN202
        del record, agent, kwargs
        return _report(TRACED, HELPER)

    loop.scheduler.run_child = _run_child  # type: ignore[method-assign]
    loop._observer = observer  # type: ignore[assignment]
    monkeypatch.setattr(
        loop,
        "_get_incomplete_todo_tasks",
        lambda _state: [TodoTask(name="Task 2", description="Still open")],
    )

    await loop.run(
        _todo(),
        agent_factory=lambda persona, rk=None: {"persona": persona},
        session_id="requirement-evidence-session",
    )

    report = observer.reports[0]
    assert "Re-queued task" in report.summary
    assert report.requirement_evidence is not None
    assert [req.req_id for req in report.requirement_evidence.requirements] == ["SWR-101"]
    assert report.scope_drift is not None
    assert report.scope_drift.files == [HELPER]


@verifies(SWR.SWR_2606, SWR.SWR_2607)
@pytest.mark.asyncio
async def test_the_evidence_survives_the_completion_classifier_rewrite(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _Classifier:
        async def classify(self, report, intent, open_todos):  # noqa: ANN001, ANN202
            del report, intent, open_todos
            from rotaris_core.ralph.completion_classifier import CompletionVerdict

            return CompletionVerdict(verdict="NEEDS_ITERATION", reason="work looks unfinished")

    RecordingExecutor.instances.clear()
    monkeypatch.setattr("rotaris_core.tools.terminal.HardenedTerminalExecutor", RecordingExecutor)
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    _write_workspace(workspace)

    observer = CapturingObserver()
    loop = RalphLoop(
        config=_config(workspace, "pytest tests"),
        workspace_root=str(workspace),
        summary_agent=MockSummaryAgent(),
        conversation_persistence_dir=tmp_path / "session" / "conversations",
    )

    async def _run_child(record, agent, **kwargs):  # noqa: ANN001, ANN202
        del record, agent, kwargs
        return _report(TRACED, HELPER)

    loop.scheduler.run_child = _run_child  # type: ignore[method-assign]
    loop._observer = observer  # type: ignore[assignment]
    monkeypatch.setattr(loop, "_get_completion_classifier", lambda: _Classifier())

    await loop.run(
        _todo(),
        agent_factory=lambda persona, rk=None: {"persona": persona},
        session_id="requirement-evidence-session",
    )

    report = observer.reports[0]
    assert report.status == "partial"
    assert report.requirement_evidence is not None
    assert report.requirement_evidence.verified_requirements == ["SWR-101"]
    assert report.scope_drift is not None
    assert report.scope_drift.files == [HELPER]


@verifies(SWR.SWR_2606, SWR.SWR_2607)
def test_a_summary_agent_cannot_author_requirement_coverage_or_hide_its_drift() -> None:
    """A summarizing model must not be able to claim coverage it never produced."""

    class _Record:
        canonical_name = "child-1"
        persona = "coder"

    agent = SummaryAgent(llm=None)  # type: ignore[arg-type]
    fabricated = (
        '{"status": "succeeded", "summary": "All good",'
        ' "requirement_evidence": {"changed_files": ["src/a.py"],'
        ' "requirements": [{"req_id": "SWR-101", "number": 101,'
        ' "coverage_state": "verified"}], "uncovered_requirements": []},'
        ' "scope_drift": {"files": [], "total": 0}}'
    )

    report = agent._parse_report(fabricated, _Record())  # type: ignore[arg-type]  # noqa: SLF001

    assert report.requirement_evidence is None
    assert report.scope_drift is None
    assert report.summary == "All good"
