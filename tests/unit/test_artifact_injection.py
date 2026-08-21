"""Tests for hybrid auto-injection of artifacts into delegate task payloads."""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import Mock

import pytest

from rotaris_core.config.schema import PersonaConfig, RotarisConfig, RuntimePolicy
from rotaris_core.orchestrator import RotarisDelegateExecutor
from rotaris_core.orchestrator.artifacts import SessionArtifactStore
from rotaris_core.orchestrator.child_manager import ChildManager
from rotaris_core.orchestrator.child_state import ChildTaskRecord, ChildTaskState
from rotaris_core.orchestrator.delegate_tool import RotarisDelegateAction
from rotaris_core.orchestrator.report import ChildReportArtifact
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from pathlib import Path


@pytest.fixture
def policy() -> RuntimePolicy:
    return RuntimePolicy(max_children=8, max_depth=3)


@pytest.fixture
def artifact_store(tmp_path: Path) -> SessionArtifactStore:
    store = SessionArtifactStore(tmp_path)
    # Pre-populate with two prior artifacts.
    store.publish(
        slug="research-input-composer",
        title="Research on InputComposer",
        body="Found the widget at src/rotaris_core/tui/widgets/input_composer.py",
        persona="librarian",
        tags=["research", "ui"],
    )
    store.publish(
        slug="design-foo",
        title="Design for Foo",
        body="Plan: add a new field, then wire it through.",
        persona="architect",
        tags=["design"],
    )
    return store


@pytest.fixture
def child_manager(policy: RuntimePolicy, artifact_store: SessionArtifactStore) -> ChildManager:
    return ChildManager(
        parent_agent_id="parent",
        current_depth=1,
        policy=policy,
        artifact_store=artifact_store,
    )


@pytest.fixture
def scheduler() -> Mock:
    sched = Mock()
    sched.config = RotarisConfig(
        personas={
            "coding-agent": PersonaConfig(name="coding-agent", model="gpt-4o"),
            "planner": PersonaConfig(name="planner", model="gpt-4o"),
            "executor": PersonaConfig(
                name="executor",
                model="gpt-4o",
                skip_auto_sibling_context=True,
            ),
        },
    )
    return sched


@pytest.fixture
def executor(child_manager: ChildManager, scheduler: Mock) -> RotarisDelegateExecutor:
    agent_factory = Mock(side_effect=lambda persona: Mock(persona=persona))
    return RotarisDelegateExecutor(child_manager, scheduler, agent_factory)


def _spawned_payload(child_manager: ChildManager, task_name: str) -> str:
    return child_manager._children[task_name].task_payload


@verifies(SWR.SWR_114, SWR.SWR_1526)
def test_baseline_block_is_prepended_by_default(
    executor: RotarisDelegateExecutor,
    child_manager: ChildManager,
) -> None:
    executor(RotarisDelegateAction(persona="coding-agent", task_name="impl", task="Do the thing"))

    spawned = child_manager._children["impl"]
    payload = spawned.task_payload
    assert "PRIOR SIBLING SUMMARIES" in payload
    assert "research-input-composer" in payload
    assert "design-foo" in payload
    assert payload.endswith("Do the thing")
    assert len(spawned.received_artifact_ids) == 2


@verifies(SWR.SWR_114, SWR.SWR_1528)
def test_suppress_auto_context_disables_baseline(
    executor: RotarisDelegateExecutor,
    child_manager: ChildManager,
) -> None:
    executor(
        RotarisDelegateAction(
            persona="coding-agent",
            task_name="impl",
            task="Do the thing",
            suppress_auto_context=True,
        ),
    )
    payload = _spawned_payload(child_manager, "impl")
    assert "PRIOR SIBLING SUMMARIES" not in payload
    assert payload.startswith("AUTHORITATIVE WORKSPACE ROOT:\n")
    assert payload.endswith("\n\nDo the thing")
    assert child_manager._children["impl"].received_artifact_ids == []


@verifies(SWR.SWR_114, SWR.SWR_1528)
def test_persona_skip_auto_sibling_context_disables_baseline(
    executor: RotarisDelegateExecutor,
    child_manager: ChildManager,
) -> None:
    # ChildManager has no config attribute by default — wire the scheduler config in.
    # type: ignore[attr-defined]
    child_manager.config = executor.scheduler.config
    executor(RotarisDelegateAction(persona="executor", task_name="run", task="Just run"))
    payload = _spawned_payload(child_manager, "run")
    assert "PRIOR SIBLING SUMMARIES" not in payload


@verifies(SWR.SWR_114, SWR.SWR_1525, SWR.SWR_1527)
def test_attach_artifacts_injects_full_block_before_task(
    executor: RotarisDelegateExecutor,
    child_manager: ChildManager,
    artifact_store: SessionArtifactStore,
) -> None:
    research = artifact_store.get("research-input-composer")
    assert research is not None

    executor(
        RotarisDelegateAction(
            persona="coding-agent",
            task_name="impl",
            task="Apply the plan",
            attach_artifacts=[research.id],
        ),
    )

    payload = _spawned_payload(child_manager, "impl")
    assert "PRIOR AGENT CONTEXT (FULL)" in payload
    assert "research-input-composer" in payload
    # The attached artifact should NOT appear in the baseline block too.
    assert payload.count("research-input-composer") >= 1
    full_pos = payload.find("PRIOR AGENT CONTEXT (FULL)")
    task_pos = payload.find("Apply the plan")
    assert full_pos < task_pos
    assert research.id in child_manager._children["impl"].received_artifact_ids


@verifies(SWR.SWR_114)
def test_attached_artifact_excluded_from_baseline(
    executor: RotarisDelegateExecutor,
    child_manager: ChildManager,
    artifact_store: SessionArtifactStore,
) -> None:
    research = artifact_store.get("research-input-composer")
    assert research is not None

    executor(
        RotarisDelegateAction(
            persona="coding-agent",
            task_name="impl",
            task="Apply the plan",
            attach_artifacts=[research.id],
        ),
    )

    payload = _spawned_payload(child_manager, "impl")
    # The baseline block must not duplicate the attached artifact.
    baseline_start = payload.find("PRIOR SIBLING SUMMARIES")
    baseline_end = payload.find("PRIOR AGENT CONTEXT (FULL)")
    baseline = payload[baseline_start:baseline_end] if baseline_start != -1 else ""
    assert "research-input-composer" not in baseline
    # But the other artifact (design-foo) should be there.
    assert "design-foo" in baseline


@verifies(SWR.SWR_114, SWR.SWR_1525)
def test_attach_artifacts_with_unknown_id_is_silently_skipped(
    executor: RotarisDelegateExecutor,
    child_manager: ChildManager,
) -> None:
    obs = executor(
        RotarisDelegateAction(
            persona="coding-agent",
            task_name="impl",
            task="Just do it",
            attach_artifacts=["art_does-not-exist"],
        ),
    )
    assert obs.status == "queued"
    assert "missing attached artifacts: art_does-not-exist" in obs.message
    payload = _spawned_payload(child_manager, "impl")
    assert "PRIOR AGENT CONTEXT (FULL)" not in payload


@verifies(SWR.SWR_114)
def test_attach_published_artifact_injects_current_body_markdown(
    executor: RotarisDelegateExecutor,
    child_manager: ChildManager,
    artifact_store: SessionArtifactStore,
) -> None:
    plan = artifact_store.publish(
        slug="plan-current",
        title="Current Plan",
        body="# Current Plan\n\n- exact step one\n- exact step two",
        persona="planner",
        tags=["plan"],
    )

    executor(
        RotarisDelegateAction(
            persona="coding-agent",
            task_name="impl-plan",
            task="Implement the plan",
            attach_artifacts=[plan.id],
            suppress_auto_context=True,
        ),
    )

    payload = _spawned_payload(child_manager, "impl-plan")
    assert "PRIOR AGENT CONTEXT (FULL)" in payload
    assert "# Current Plan" in payload
    assert "- exact step one" in payload
    assert "- exact step two" in payload


@verifies(SWR.SWR_1010)
def test_attach_edited_child_report_uses_current_body_markdown(
    executor: RotarisDelegateExecutor,
    child_manager: ChildManager,
    artifact_store: SessionArtifactStore,
) -> None:
    record = ChildTaskRecord(
        name="research",
        canonical_name="research",
        persona="librarian",
        task_payload="Inspect the code",
        depends_on=[],
        run_in_background=True,
        task_id="task-research",
        state=ChildTaskState.SUCCEEDED,
    )
    report = ChildReportArtifact(
        agent_name="research",
        persona="librarian",
        status="succeeded",
        summary="Original summary",
        key_findings="Original findings",
    )
    artifact = artifact_store.upsert_from_child_report(record, report)
    artifact_store.update_body(artifact.id, "# Edited Research\n\nCurrent saved body")

    executor(
        RotarisDelegateAction(
            persona="coding-agent",
            task_name="impl-edited-report",
            task="Use the research",
            attach_artifacts=[artifact.id],
            suppress_auto_context=True,
        ),
    )

    payload = _spawned_payload(child_manager, "impl-edited-report")
    assert "# Edited Research" in payload
    assert "Current saved body" in payload
    assert "Original findings" not in payload


@verifies(SWR.SWR_114)
def test_no_artifact_store_means_no_injection(policy: RuntimePolicy, scheduler: Mock) -> None:
    cm = ChildManager(parent_agent_id="p", current_depth=1, policy=policy)
    assert cm.artifact_store is None
    agent_factory = Mock(side_effect=lambda persona: Mock(persona=persona))
    exec_ = RotarisDelegateExecutor(cm, scheduler, agent_factory)
    exec_(RotarisDelegateAction(persona="coding-agent", task_name="impl", task="Do it"))
    payload = cm._children["impl"].task_payload
    assert payload.startswith("AUTHORITATIVE WORKSPACE ROOT:\n")
    assert "PRIOR AGENT CONTEXT" not in payload
    assert payload.endswith("\n\nDo it")
