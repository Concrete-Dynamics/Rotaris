"""Productive use: a user starts a run whose change breaks the workspace's own
test check and cannot be repaired. They must get a bounded, honest answer — the
agent is given the failing output and a couple of tries, and then the run reports
the task as failed verification with the check named — instead of the harness
grinding through its whole iteration budget on blind retries and calling the
result "abandoned" without saying why.

Expected outcome: hermetic user-flow E2E — no LLM, no network, the real suite
resolver, the real terminal execution path, the real evidence projection, the
real gate and the real repair budget. The run stops after exactly the configured
number of attempts, each retry carries the failing check's actual output, and the
user-visible result names the check.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

import pytest

from rotaris_core.config.schema import CheckConfig, RotarisConfig, RuntimePolicy, VerifierConfig
from rotaris_core.orchestrator.report import ChildReportArtifact, EditedFile
from rotaris_core.ralph import RalphLoop
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tools.todo_state import TodoList, TodoPhase, TodoTask

if TYPE_CHECKING:
    from pathlib import Path

#: The workspace's own check, permanently red. Kept path-free and quote-free so
#: it survives whichever shell the hardened terminal executor picks.
_CHECK_SCRIPT = """\
import sys

print("1 failed - app.py is still broken")
sys.exit(1)
"""

#: The budget under test. Deliberately far below ``max_iterations`` so the
#: assertion proves the repair bound stopped the run, not the global cap.
_MAX_REPAIR_ATTEMPTS = 2


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
    task = TodoTask(name="Task 1", description="Change app.py")
    task.set_execution_context("Change app.py")
    return TodoList(phases=[TodoPhase(name="Phase 1", tasks=[task])])


def _timeline(session_dir: Path) -> list[dict[str, Any]]:
    path = session_dir / "timeline.jsonl"
    if not path.is_file():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


@verifies(SWR.SWR_2605)
@pytest.mark.asyncio
@pytest.mark.timeout(300)
async def test_a_persistently_failing_check_ends_the_run_as_failed_verification(
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    session_dir = tmp_path / "session"
    (workspace / "check.py").write_text(_CHECK_SCRIPT, encoding="utf-8")
    (workspace / "app.py").write_text("print('hi')\n", encoding="utf-8")

    config = RotarisConfig(
        runtime=RuntimePolicy(child_timeout=30, classify_completion=False),
        verifier=VerifierConfig(
            checks=[CheckConfig(name="tests", command="python check.py", timeout=120)],
            max_repair_attempts=_MAX_REPAIR_ATTEMPTS,
        ),
        workspace_root=workspace,
    )
    loop = RalphLoop(
        config=config,
        workspace_root=str(workspace),
        summary_agent=MockSummaryAgent(),
        conversation_persistence_dir=session_dir / "conversations",
    )

    todo = _todo()
    task = todo.phases[0].tasks[0]
    payloads: list[str] = []

    async def _run_child(record, agent, **kwargs):  # noqa: ANN001, ANN202
        del agent, kwargs
        payloads.append(task.execution_payload)
        (workspace / "app.py").write_text(f"print('attempt {len(payloads)}')\n", encoding="utf-8")
        return ChildReportArtifact(
            agent_name=record.canonical_name,
            persona="coder",
            status="succeeded",
            summary="Changed app.py as requested.",
            edited_files=[EditedFile(path="app.py", change_type="modified")],
        )

    loop.scheduler.run_child = _run_child  # type: ignore[method-assign]

    progress = await loop.run(
        todo,
        agent_factory=lambda persona, rk=None: {"persona": persona},
        session_id="repair-e2e-session",
        max_iterations=20,
    )

    # The repair budget stopped the run, not the 20-iteration cap.
    assert len(payloads) == _MAX_REPAIR_ATTEMPTS
    assert [state.outcome.name for state in progress.iterations] == ["PENDING", "ABANDONED"]
    assert progress.completed_tasks == 0
    assert progress.abandoned_tasks == 1

    # The retry was informed: the agent got the check's real output, not the
    # same prompt a second time.
    assert "VERIFICATION FAILURE:" in payloads[1]
    assert "app.py is still broken" in payloads[1]

    # The user-visible result names the check rather than saying "retried too often".
    assert "tests" in progress.iterations[-1].report_summary

    escalations = [
        event for event in _timeline(session_dir) if event["type"] == "repair_escalation"
    ]
    assert len(escalations) == 1
    assert escalations[0]["severity"] == "error"
    assert escalations[0]["metadata"]["unsatisfied_checks"] == ["tests"]
    assert escalations[0]["metadata"]["max_attempts"] == _MAX_REPAIR_ATTEMPTS

    # Every attempt was really verified — one full output log per attempt.
    logs = sorted((session_dir / "evidence" / "verifier").glob("*.log"))
    assert len(logs) == _MAX_REPAIR_ATTEMPTS
    assert all("app.py is still broken" in log.read_text(encoding="utf-8") for log in logs)
