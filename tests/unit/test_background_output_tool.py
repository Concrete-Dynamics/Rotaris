"""Tests for background_output tool."""

from __future__ import annotations

import pytest

from rotaris_core.config.schema import RuntimePolicy
from rotaris_core.orchestrator.child_manager import ChildManager
from rotaris_core.orchestrator.child_state import ChildTaskState
from rotaris_core.orchestrator.report import ChildDetailPayload, ChildReportArtifact
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tools.background_output import (
    BackgroundOutputAction,
    BackgroundOutputExecutor,
)


@pytest.fixture
def policy() -> RuntimePolicy:
    return RuntimePolicy(max_children=8, max_depth=3)


@pytest.fixture
def manager(policy: RuntimePolicy) -> ChildManager:
    return ChildManager(parent_agent_id="parent", current_depth=1, policy=policy)


def _make_report(
    name: str = "child",
    persona: str = "builder",
    status: str = "succeeded",
    summary: str = "Done",
    **overrides: object,
) -> ChildReportArtifact:
    payload: dict[str, object] = {
        "agent_name": name,
        "persona": persona,
        "status": status,
        "summary": summary,
    }
    payload.update(overrides)
    return ChildReportArtifact.model_validate(payload)


@verifies(SWR.SWR_141, SWR.SWR_2132)
def test_uses_last_response_when_a_terminal_tool_call_has_no_final_reply(
    manager: ChildManager,
) -> None:
    """Productive use: a parent can retrieve an incomplete child result after a tool call.
    Expected outcome: the latest assistant response is available without a generated summary."""
    record = manager.spawn_child("worker", "builder", "inspect failure", run_in_background=True)
    record.transition(ChildTaskState.RUNNING)
    manager.mark_child_terminal(
        "worker",
        ChildTaskState.SUCCEEDED,
        _make_report(last_response="I started the focused test run.", final_response=None),
    )

    observation = BackgroundOutputExecutor(manager, parent_canonical_name="parent")(
        BackgroundOutputAction(task_id=record.task_id)
    )

    assert observation.status == "ok"
    assert observation.report_text is not None
    assert "Last reply:\nI started the focused test run." in observation.report_text


@verifies(SWR.SWR_141)
def test_ok_when_result_present(manager: ChildManager) -> None:
    record = manager.spawn_child("worker", "builder", "implement feature", run_in_background=True)
    task_id = record.task_id
    report = _make_report()

    record.transition(ChildTaskState.RUNNING)
    manager.mark_child_terminal("worker", ChildTaskState.SUCCEEDED, report)

    executor = BackgroundOutputExecutor(manager, parent_canonical_name="parent")
    obs = executor(BackgroundOutputAction(task_id=task_id))

    assert obs.status == "ok"
    assert obs.task_id == task_id
    assert obs.report_text is not None
    assert "succeeded" in obs.report_text.lower()
    assert "Done" in obs.report_text


@verifies(SWR.SWR_141)
def test_still_running_when_active(manager: ChildManager) -> None:
    record = manager.spawn_child("worker", "builder", "implement feature", run_in_background=True)
    task_id = record.task_id

    executor = BackgroundOutputExecutor(manager, parent_canonical_name="parent")
    obs = executor(BackgroundOutputAction(task_id=task_id))

    assert obs.status == "still_running"
    assert obs.task_id == task_id
    assert obs.report_text is None


@verifies(SWR.SWR_141, SWR.SWR_2426)
def test_exposes_only_direct_child_records(manager: ChildManager) -> None:
    """Productive use: a nested agent can inspect only work it delegated.
    Expected outcome: its child is visible while self and sibling work are not found.
    """
    caller = manager.spawn_child(
        "caller",
        "builder",
        "coordinate work",
        run_in_background=True,
        parent_agent_id="orchestrator",
    )
    direct_child = manager.spawn_child(
        "direct-child",
        "analyst",
        "analyse",
        run_in_background=True,
        parent_agent_id=caller.canonical_name,
    )
    unrelated = manager.spawn_child(
        "unrelated",
        "builder",
        "sibling work",
        run_in_background=True,
        parent_agent_id="orchestrator",
    )
    executor = BackgroundOutputExecutor(
        manager,
        parent_canonical_name=caller.canonical_name,
    )

    direct = executor(BackgroundOutputAction(task_id=direct_child.task_id))
    own = executor(BackgroundOutputAction(task_id=caller.task_id))
    sibling = executor(BackgroundOutputAction(task_id=unrelated.task_id))

    assert direct.status == "still_running"
    assert own.status == "not_found"
    assert sibling.status == "not_found"


@verifies(SWR.SWR_141)
def test_not_found_for_unknown_id(manager: ChildManager) -> None:
    executor = BackgroundOutputExecutor(manager, parent_canonical_name="parent")
    obs = executor(BackgroundOutputAction(task_id="bg_nonexistent"))

    assert obs.status == "not_found"
    assert obs.task_id == "bg_nonexistent"
    assert obs.is_error is True


@verifies(SWR.SWR_141, SWR.SWR_1502, SWR.SWR_1505, SWR.SWR_1506, SWR.SWR_1510)
def test_to_llm_content_ok_includes_report(manager: ChildManager) -> None:
    record = manager.spawn_child("worker", "builder", "implement feature", run_in_background=True)
    task_id = record.task_id
    report = _make_report()

    record.transition(ChildTaskState.RUNNING)
    manager.mark_child_terminal("worker", ChildTaskState.SUCCEEDED, report)

    executor = BackgroundOutputExecutor(manager, parent_canonical_name="parent")
    obs = executor(BackgroundOutputAction(task_id=task_id))

    content = obs.to_llm_content
    assert len(content) == 1
    assert f"background_output({task_id}): ok" in content[0].text


@verifies(SWR.SWR_141, SWR.SWR_1502, SWR.SWR_1505, SWR.SWR_1506, SWR.SWR_1501)
def test_summary_detail_level_includes_artifact_references(manager: ChildManager) -> None:
    record = manager.spawn_child("worker", "builder", "implement feature", run_in_background=True)
    task_id = record.task_id
    report = _make_report(
        artifacts=[
            {
                "type": "agent_published",
                "description": "art_12345678 [plan-v1] Plan v1",
            },
        ],
    )

    record.transition(ChildTaskState.RUNNING)
    manager.mark_child_terminal("worker", ChildTaskState.SUCCEEDED, report)

    obs = BackgroundOutputExecutor(manager, parent_canonical_name="parent")(
        BackgroundOutputAction(task_id=task_id)
    )

    assert obs.report_text is not None
    assert "Artifacts: art_12345678 [plan-v1] Plan v1" in obs.report_text


@verifies(SWR.SWR_141, SWR.SWR_1502)
def test_to_llm_content_still_running(manager: ChildManager) -> None:
    record = manager.spawn_child("worker", "builder", "implement feature", run_in_background=True)
    task_id = record.task_id

    executor = BackgroundOutputExecutor(manager, parent_canonical_name="parent")
    obs = executor(BackgroundOutputAction(task_id=task_id))

    content = obs.to_llm_content
    assert len(content) == 1
    assert "still_running" in content[0].text


@verifies(SWR.SWR_1504, SWR.SWR_1501, SWR.SWR_1503, SWR.SWR_1510)
def test_verbatim_detail_level_includes_exact_response_and_evidence(manager: ChildManager) -> None:
    record = manager.spawn_child("worker", "builder", "implement feature", run_in_background=True)
    task_id = record.task_id
    report = _make_report(
        final_response="Exact child answer",
        edited_files=[{"path": "src/app.py", "change_type": "modified"}],
        created_files=[{"path": "tests/test_app.py"}],
        artifacts=[{"type": "log", "path": "logs/run.txt", "description": "Execution log"}],
        detail_payload=ChildDetailPayload.model_validate(
            {
                "highlight_paths": [{"path": "src/app.py", "reason": "Primary edit location"}],
                "snippets": [
                    {
                        "path": "src/app.py",
                        "content": "def greet():\n    return 'hi'",
                        "reason": "Changed helper",
                    },
                ],
            },
        ),
    )

    record.transition(ChildTaskState.RUNNING)
    manager.mark_child_terminal("worker", ChildTaskState.SUCCEEDED, report)

    executor = BackgroundOutputExecutor(manager, parent_canonical_name="parent")
    obs = executor(BackgroundOutputAction(task_id=task_id, detail_level="verbatim"))

    assert obs.status == "ok"
    assert obs.report_text is not None
    assert "Detail level: verbatim" in obs.report_text
    assert "Exact last reply:\nExact child answer" in obs.report_text
    assert "Touched files:\n- src/app.py\n- tests/test_app.py\n- logs/run.txt" in obs.report_text
    assert "Highlighted paths:\n- src/app.py: Primary edit location" in obs.report_text
    assert "Highlighted snippets:" in obs.report_text
    assert "def greet():\n    return 'hi'" in obs.report_text
