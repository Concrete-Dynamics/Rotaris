"""Productive use: a user starts a run against their own workspace. The first
attempt breaks the workspace's declared test check; the run must not come back
saying the task is done. Once the next attempt fixes it, the same run finishes
normally.

Expected outcome: hermetic user-flow E2E — no LLM, no network, the real suite
resolver, the real terminal execution path, the real evidence projection and the
real gate. A run whose change fails the check reports the task as not completed
and names the failing check; after the fix the same run completes.
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

#: The workspace's own check: green only once the repair marker exists. Kept
#: path-free and quote-free so it survives whichever shell the hardened terminal
#: executor picks on the host platform.
_CHECK_SCRIPT = """\
import pathlib
import sys

if pathlib.Path("fixed.marker").is_file():
    print("all checks passed")
    sys.exit(0)
print("1 failed - app.py is broken")
sys.exit(1)
"""


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
        phases=[
            TodoPhase(
                name="Phase 1",
                tasks=[TodoTask(name="Task 1", description="Change app.py")],
            ),
        ],
    )


def _timeline(session_dir: Path) -> list[dict[str, Any]]:
    path = session_dir / "timeline.jsonl"
    if not path.is_file():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


@verifies(SWR.SWR_2603, SWR.SWR_2604)
@pytest.mark.asyncio
@pytest.mark.timeout(300)
async def test_a_run_that_breaks_a_blocking_check_completes_only_after_it_is_fixed(
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
        ),
        workspace_root=workspace,
    )
    loop = RalphLoop(
        config=config,
        workspace_root=str(workspace),
        summary_agent=MockSummaryAgent(),
        conversation_persistence_dir=session_dir / "conversations",
    )

    attempts: list[int] = []

    async def _run_child(record, agent, **kwargs):  # noqa: ANN001, ANN202
        del agent, kwargs
        attempts.append(len(attempts) + 1)
        if len(attempts) > 1:
            # The second attempt is the repair: it makes the workspace's own
            # check green again.
            (workspace / "fixed.marker").write_text("fixed\n", encoding="utf-8")
        (workspace / "app.py").write_text(f"print('attempt {len(attempts)}')\n", encoding="utf-8")
        return ChildReportArtifact(
            agent_name=record.canonical_name,
            persona="coder",
            status="succeeded",
            summary="Changed app.py as requested.",
            edited_files=[EditedFile(path="app.py", change_type="modified")],
        )

    loop.scheduler.run_child = _run_child  # type: ignore[method-assign]

    todo = _todo()
    progress = await loop.run(
        todo,
        agent_factory=lambda persona, rk=None: {"persona": persona},
        session_id="gate-e2e-session",
        max_iterations=4,
    )

    # Two iterations: the broken one was not accepted, the repaired one was.
    assert len(attempts) == 2, "the run stopped without giving the fix a chance"
    assert progress.completed_tasks == 1
    assert progress.stop_reason == "all tasks completed"
    assert [state.outcome.name for state in progress.iterations] == ["PENDING", "COMPLETED"]

    # Iteration 1: the agent claimed success, the check disagreed, and the gate
    # is what the user sees in the summary.
    assert "tests (failed)" in progress.iterations[0].report_summary

    decisions = [
        event for event in _timeline(session_dir) if event["type"] == "completion_gate_decision"
    ]
    assert [event["metadata"]["decision"] for event in decisions] == ["gated", "passed"]
    assert decisions[0]["metadata"]["unsatisfied_checks"] == ["tests"]
    assert decisions[0]["severity"] == "warning"

    # The full output of the failing check is on disk, not just summarized.
    logs = sorted((session_dir / "evidence" / "verifier").glob("*.log"))
    assert len(logs) == 2
    assert "app.py is broken" in logs[0].read_text(encoding="utf-8")
    assert "all checks passed" in logs[1].read_text(encoding="utf-8")
