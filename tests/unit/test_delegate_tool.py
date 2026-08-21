from __future__ import annotations

from unittest.mock import Mock

import pytest

from rotaris_core.config.schema import PersonaConfig, RotarisConfig, RuntimePolicy
from rotaris_core.orchestrator import (
    DelegateAction,
    RotarisDelegateExecutor,
    RotarisDelegateTool,
)
from rotaris_core.orchestrator.child_manager import ChildManager
from rotaris_core.reqtocode import SWR, verifies


class PauseableConversation:
    def __init__(self) -> None:
        self.paused = False

    def pause(self) -> None:
        self.paused = True


@pytest.fixture
def policy() -> RuntimePolicy:
    return RuntimePolicy(max_children=8, max_depth=3)


@pytest.fixture
def child_manager(policy: RuntimePolicy) -> ChildManager:
    return ChildManager(parent_agent_id="parent", current_depth=1, policy=policy)


@pytest.fixture
def scheduler() -> Mock:
    scheduler = Mock()
    scheduler.config = None
    return scheduler


@pytest.fixture
def agent_factory() -> Mock:
    return Mock(side_effect=lambda persona: Mock(persona=persona))


@pytest.fixture
def executor(
    child_manager: ChildManager,
    scheduler: Mock,
    agent_factory: Mock,
) -> RotarisDelegateExecutor:
    return RotarisDelegateExecutor(child_manager, scheduler, agent_factory)


@verifies(SWR.SWR_101, SWR.SWR_102, SWR.SWR_1113)
def test_successful_delegation_without_dependencies_returns_queued(
    executor: RotarisDelegateExecutor,
) -> None:
    obs = executor(
        DelegateAction(persona="coding-agent", task_name="build_api", task="Implement API"),
    )

    assert obs.is_error is False
    assert obs.canonical_name == "build_api"
    assert obs.status == "queued"
    assert obs.message == "Task queued for execution"


@verifies(SWR.SWR_105)
def test_delegation_resolves_coder_alias_before_spawning(
    child_manager: ChildManager,
    agent_factory: Mock,
) -> None:
    scheduler = Mock()
    scheduler.config = RotarisConfig(
        personas={
            "orchestrator": PersonaConfig(name="orchestrator", model="gpt-4o"),
            "coding-agent": PersonaConfig(name="coding-agent", model="gpt-4o"),
        },
    )
    executor = RotarisDelegateExecutor(child_manager, scheduler, agent_factory)

    obs = executor(DelegateAction(persona="coder", task_name="bump_version", task="Bump it"))

    assert obs.is_error is False
    assert obs.status == "queued"
    assert child_manager._children["bump_version"].persona == "coding-agent"
    assert "alias 'coder' resolved to 'coding-agent'" in obs.message


@verifies(SWR.SWR_105)
def test_delegation_resolves_playwright_alias_before_spawning(
    child_manager: ChildManager,
    agent_factory: Mock,
) -> None:
    scheduler = Mock()
    scheduler.config = RotarisConfig(
        personas={
            "orchestrator": PersonaConfig(name="orchestrator", model="gpt-4o"),
            "ui-verifier": PersonaConfig(name="ui-verifier", model="gpt-4o"),
        },
    )
    executor = RotarisDelegateExecutor(child_manager, scheduler, agent_factory)

    obs = executor(
        DelegateAction(persona="playwright", task_name="verify_login", task="Check login"),
    )

    assert obs.is_error is False
    assert obs.status == "queued"
    assert child_manager._children["verify_login"].persona == "ui-verifier"
    assert "alias 'playwright' resolved to 'ui-verifier'" in obs.message


@verifies(SWR.SWR_102)
def test_delegation_rejects_unknown_persona_before_spawning(
    child_manager: ChildManager,
    agent_factory: Mock,
) -> None:
    scheduler = Mock()
    scheduler.config = RotarisConfig(
        personas={
            "orchestrator": PersonaConfig(name="orchestrator", model="gpt-4o"),
            "coding-agent": PersonaConfig(name="coding-agent", model="gpt-4o"),
        },
    )
    executor = RotarisDelegateExecutor(child_manager, scheduler, agent_factory)

    obs = executor(DelegateAction(persona="not-real", task_name="bad", task="Nope"))

    assert obs.is_error is True
    assert obs.status == "rejected"
    assert "Unknown persona: not-real" in obs.message
    assert child_manager.snapshot_children() == []


@verifies(SWR.SWR_110)
def test_successful_delegation_pauses_parent_conversation_by_default(
    executor: RotarisDelegateExecutor,
) -> None:
    conversation = PauseableConversation()

    executor(
        DelegateAction(
            persona="coding-agent",
            task_name="build_api",
            task="Implement API",
            run_in_background=False,
        ),
        conversation=conversation,
    )

    assert conversation.paused is True


@verifies(SWR.SWR_110)
def test_background_delegation_pauses_parent_conversation(
    executor: RotarisDelegateExecutor,
) -> None:
    conversation = PauseableConversation()

    executor(
        DelegateAction(
            persona="coding-agent",
            task_name="build_api",
            task="Implement API",
        ),
        conversation=conversation,
    )

    assert conversation.paused is True


@verifies(SWR.SWR_107)
def test_successful_delegation_with_dependencies_returns_waiting_on_dependencies(
    executor: RotarisDelegateExecutor,
    child_manager: ChildManager,
) -> None:
    child_manager.spawn_child("setup_db", "coding-agent", "Prepare schema")

    obs = executor(
        DelegateAction(
            persona="coding-agent",
            task_name="build_api",
            task="Implement API",
            depends_on=["setup_db"],
        ),
    )

    assert obs.is_error is False
    assert obs.canonical_name == "build_api"
    assert obs.status == "waiting_on_dependencies"
    assert "setup_db" in obs.message


@verifies(SWR.SWR_106)
def test_rejected_when_max_depth_exceeded_returns_error_observation(
    scheduler: Mock,
    agent_factory: Mock,
) -> None:
    child_manager = ChildManager(
        parent_agent_id="parent",
        current_depth=3,
        policy=RuntimePolicy(max_children=8, max_depth=3),
    )
    executor = RotarisDelegateExecutor(child_manager, scheduler, agent_factory)

    obs = executor(DelegateAction(persona="coding-agent", task_name="deep", task="Too deep"))

    assert obs.is_error is True
    assert obs.status == "rejected"
    assert obs.canonical_name == "deep"
    assert "Max depth" in obs.message


@verifies(SWR.SWR_104)
def test_rejected_when_max_active_children_exceeded_returns_error_observation(
    scheduler: Mock,
    agent_factory: Mock,
) -> None:
    child_manager = ChildManager(
        parent_agent_id="parent",
        current_depth=1,
        policy=RuntimePolicy(max_children=20, max_active_children=1, max_depth=3),
    )
    child_manager.spawn_child("first", "coding-agent", "Do first")
    executor = RotarisDelegateExecutor(child_manager, scheduler, agent_factory)

    obs = executor(DelegateAction(persona="coding-agent", task_name="second", task="Do second"))

    assert obs.is_error is True
    assert obs.status == "rejected"
    assert "Max active children" in obs.message


@verifies(SWR.SWR_107)
def test_rejected_when_dependency_is_unknown_returns_error_observation(
    executor: RotarisDelegateExecutor,
) -> None:
    obs = executor(
        DelegateAction(
            persona="coding-agent",
            task_name="build_api",
            task="Implement API",
            depends_on=["missing_task"],
        ),
    )

    assert obs.is_error is True
    assert obs.status == "rejected"
    assert "missing_task" in obs.message
    assert "Known task names" in obs.message


@verifies(SWR.SWR_108)
def test_rejected_when_cycle_detected_returns_error_observation(
    executor: RotarisDelegateExecutor,
    child_manager: ChildManager,
) -> None:
    child_manager.spawn_child("A", "coding-agent", "Task A")
    child_manager.spawn_child("B", "coding-agent", "Task B", depends_on=["A"])
    child_manager._children["A"].depends_on = ["B"]

    obs = executor(
        DelegateAction(
            persona="coding-agent",
            task_name="C",
            task="Task C",
            depends_on=["A"],
        ),
    )

    assert obs.is_error is True
    assert obs.status == "rejected"
    assert "cycle" in obs.message.lower()


@verifies(SWR.SWR_103, SWR.SWR_1114)
def test_name_deduplication_returns_unique_canonical_names(
    executor: RotarisDelegateExecutor,
) -> None:
    first = executor(DelegateAction(persona="coding-agent", task_name="task", task="First"))
    second = executor(DelegateAction(persona="coding-agent", task_name="task", task="Second"))

    assert first.canonical_name == "task"
    assert second.canonical_name == "task_1"
    assert first.canonical_name != second.canonical_name


@verifies(SWR.SWR_102)
def test_delegate_observation_to_llm_content_uses_required_format(
    executor: RotarisDelegateExecutor,
) -> None:
    obs = executor(DelegateAction(persona="coding-agent", task_name="task", task="First"))

    content_texts = [item.text for item in obs.to_llm_content]
    assert len(content_texts) == 1
    text = content_texts[0]
    assert text.startswith("Task 'task': queued — Task queued for execution")
    assert "task_id: bg_" in text


@verifies(
    SWR.SWR_554,
    SWR.SWR_1809,
    SWR.SWR_1810,
    SWR.SWR_1811,
    SWR.SWR_1812,
    SWR.SWR_1813,
)
def test_delegate_tool_create_returns_single_tool_instance_with_executor(
    child_manager: ChildManager,
    scheduler: Mock,
    agent_factory: Mock,
) -> None:
    tools = RotarisDelegateTool.create(
        child_manager=child_manager,
        scheduler=scheduler,
        agent_factory=agent_factory,
    )

    assert len(tools) == 1
    tool = tools[0]
    assert isinstance(tool, RotarisDelegateTool)
    assert tool.name == "delegate"
    assert tool.description.startswith("Delegate a task to a child agent persona")
    assert tool.action_type is DelegateAction
    assert tool.observation_type.__name__ == "RotarisDelegateObservation"
    assert isinstance(tool.executor, RotarisDelegateExecutor)


# ---------------------------------------------------------------------------
# inherited_context: forward already-completed sibling reports
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_113, SWR.SWR_114, SWR.SWR_129)
def test_inherited_context_prepends_succeeded_sibling_report(
    executor: RotarisDelegateExecutor,
    child_manager: ChildManager,
) -> None:
    """Productive use: an orchestrator can pass completed sibling work to a new child.
    Expected outcome: the child receives the sibling's authoritative final response.
    """
    from rotaris_core.orchestrator.child_state import ChildTaskState
    from rotaris_core.orchestrator.report import ChildReportArtifact

    # Spawn + complete a research sibling.
    parent = child_manager.spawn_child(
        "research",
        "librarian",
        "do research",
        run_in_background=True,
    )
    record = child_manager._children["research"]
    record.transition(ChildTaskState.RUNNING)
    child_manager.mark_child_terminal(
        "research",
        ChildTaskState.SUCCEEDED,
        ChildReportArtifact(
            agent_name="agent",
            persona="librarian",
            status="succeeded",
            summary="Mapped X",
            final_response="Files: a.py, b.py. Pattern: factory.",
        ),
    )

    obs = executor(
        DelegateAction(
            persona="coding-agent",
            task_name="implement_x",
            task="Implement X using the research above.",
            inherited_context=[parent.task_id],
        ),
    )

    assert obs.status == "queued"
    payload = child_manager._children["implement_x"].task_payload
    assert "PRIOR AGENT CONTEXT:" in payload
    assert "RESULT:\nFiles: a.py, b.py. Pattern: factory." in payload
    assert "librarian" in payload
    # Original task body is preserved after the prefix
    assert "Implement X using the research above." in payload


@verifies(SWR.SWR_140)
def test_inherited_context_silently_skips_unknown_task_ids(
    executor: RotarisDelegateExecutor,
    child_manager: ChildManager,
) -> None:
    obs = executor(
        DelegateAction(
            persona="coding-agent",
            task_name="implement_y",
            task="Just do it.",
            inherited_context=["bg_doesnotexist"],
        ),
    )
    assert obs.status == "queued"
    payload = child_manager._children["implement_y"].task_payload
    # No prefix because there were no resolvable succeeded siblings.
    assert "PRIOR AGENT CONTEXT:" not in payload
    assert payload == "Just do it."


@verifies(SWR.SWR_116)
def test_workspace_root_is_prepended_when_available(
    child_manager: ChildManager,
    agent_factory: Mock,
    tmp_path,
) -> None:
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()

    scheduler = Mock()
    scheduler.config = RotarisConfig(
        workspace_root=workspace_root,
        personas={
            "coding-agent": PersonaConfig(name="coding-agent", model="gpt-4o"),
        },
    )
    executor = RotarisDelegateExecutor(child_manager, scheduler, agent_factory)

    obs = executor(
        DelegateAction(persona="coding-agent", task_name="implement_z", task="Do the work.")
    )

    assert obs.status == "queued"
    payload = child_manager._children["implement_z"].task_payload
    assert payload.startswith("AUTHORITATIVE WORKSPACE ROOT:\n")
    assert f"`{workspace_root.resolve()}`" in payload
    assert "Do the work." in payload


# ---------------------------------------------------------------------------
# Per-model parallelism (max_parallel) — queue instead of reject
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_920)
def test_queued_when_per_model_parallelism_exceeded(
    scheduler: Mock,
    agent_factory: Mock,
) -> None:
    """When max_parallel=2 and 2 RUNNING children use the same model,
    a 3rd delegation is queued (not rejected)."""
    from rotaris_core.config.schema import ModelConfig, PersonaConfig, RotarisConfig
    from rotaris_core.orchestrator.child_state import ChildTaskState

    policy = RuntimePolicy(max_children=20, max_active_children=20, max_depth=3)
    child_manager = ChildManager(parent_agent_id="parent", current_depth=1, policy=policy)
    # Spawn 2 children and transition them to RUNNING so they count as active.
    child_manager.spawn_child("first", "coding-agent", "Do first", model_key="deepseek-v4")
    child_manager.spawn_child("second", "coding-agent", "Do second", model_key="deepseek-v4")
    child_manager._children["first"].transition(ChildTaskState.RUNNING)
    child_manager._children["second"].transition(ChildTaskState.RUNNING)

    scheduler.config = RotarisConfig(
        personas={
            "coding-agent": PersonaConfig(name="coding-agent", model="deepseek-v4"),
        },
        models={
            "deepseek-v4": ModelConfig(
                provider="deepseek", model_id="deepseek-v4-pro", max_parallel=2
            ),
        },
    )
    executor = RotarisDelegateExecutor(child_manager, scheduler, agent_factory)

    obs = executor(DelegateAction(persona="coding-agent", task_name="third", task="Do third"))

    assert obs.is_error is False
    assert obs.status == "waiting_on_model_slot"
    assert "waiting for model slot" in obs.message
    assert "deepseek-v4" in obs.message
    assert child_manager._children["third"].state == ChildTaskState.WAITING_ON_MODEL_SLOT


@verifies(SWR.SWR_920)
def test_model_slot_releases_when_child_terminates(
    scheduler: Mock,
    agent_factory: Mock,
) -> None:
    """When a RUNNING child finishes, a WAITING_ON_MODEL_SLOT child is released."""
    from rotaris_core.config.schema import ModelConfig, PersonaConfig, RotarisConfig
    from rotaris_core.orchestrator.child_state import ChildTaskState
    from rotaris_core.orchestrator.report import ChildReportArtifact

    policy = RuntimePolicy(max_children=20, max_active_children=20, max_depth=3)
    child_manager = ChildManager(parent_agent_id="parent", current_depth=1, policy=policy)
    # Synthetic child (no model_key) — does NOT count toward model slot limit.
    child_manager.spawn_child("synthetic", "coding-agent", "Pre-existing work")
    child_manager._children["synthetic"].transition(ChildTaskState.RUNNING)

    scheduler.config = RotarisConfig(
        personas={
            "coding-agent": PersonaConfig(name="coding-agent", model="deepseek-v4"),
        },
        models={
            "deepseek-v4": ModelConfig(
                provider="deepseek", model_id="deepseek-v4-pro", max_parallel=1
            ),
        },
    )
    executor = RotarisDelegateExecutor(child_manager, scheduler, agent_factory)

    # First delegation uses the only slot; second should queue.
    obs1 = executor(
        DelegateAction(persona="coding-agent", task_name="first_delegate", task="Task 1")
    )
    assert obs1.status == "queued"
    child_manager._children["first_delegate"].transition(ChildTaskState.RUNNING)

    obs2 = executor(
        DelegateAction(persona="coding-agent", task_name="second_delegate", task="Task 2")
    )
    assert obs2.status == "waiting_on_model_slot"

    # Mark the DELEGATED child terminal; "second_delegate" should be released.
    child_manager.mark_child_terminal(
        "first_delegate",
        ChildTaskState.SUCCEEDED,
        ChildReportArtifact(
            agent_name="agent", persona="coding-agent", status="succeeded", summary="done"
        ),
    )
    assert child_manager._children["second_delegate"].state == ChildTaskState.QUEUED


@verifies(SWR.SWR_920)
def test_per_model_parallelism_not_checked_when_max_parallel_is_none() -> None:
    """When max_parallel=None, even many children don't trigger queueing."""
    from unittest.mock import Mock

    from rotaris_core.config.schema import ModelConfig, PersonaConfig, RotarisConfig

    scheduler = Mock()
    agent_factory = Mock(side_effect=lambda persona: Mock(persona=persona))

    policy = RuntimePolicy(max_children=20, max_active_children=20, max_depth=3)
    child_manager = ChildManager(parent_agent_id="parent", current_depth=1, policy=policy)
    for i in range(5):
        child_manager.spawn_child(f"child{i}", "coding-agent", f"Task {i}")

    scheduler.config = RotarisConfig(
        personas={
            "coding-agent": PersonaConfig(name="coding-agent", model="deepseek-v4"),
        },
        models={
            "deepseek-v4": ModelConfig(
                provider="deepseek", model_id="deepseek-v4-pro", max_parallel=None
            ),
        },
    )
    executor = RotarisDelegateExecutor(child_manager, scheduler, agent_factory)

    obs = executor(DelegateAction(persona="coding-agent", task_name="extra", task="One more"))

    assert obs.is_error is False
    assert obs.status == "queued"


@verifies(SWR.SWR_920)
def test_per_model_parallelism_not_checked_when_config_missing(
    scheduler: Mock,
    agent_factory: Mock,
) -> None:
    """When scheduler.config is None, the check is skipped entirely."""
    policy = RuntimePolicy(max_children=20, max_active_children=20, max_depth=3)
    child_manager = ChildManager(parent_agent_id="parent", current_depth=1, policy=policy)
    for i in range(5):
        child_manager.spawn_child(f"child{i}", "coding-agent", f"Task {i}")

    scheduler.config = None
    executor = RotarisDelegateExecutor(child_manager, scheduler, agent_factory)

    obs = executor(DelegateAction(persona="coding-agent", task_name="extra", task="One more"))

    assert obs.is_error is False
    assert obs.status == "queued"


@verifies(SWR.SWR_920)
def test_per_model_parallelism_skips_terminal_children(
    scheduler: Mock,
    agent_factory: Mock,
) -> None:
    """Only RUNNING children count toward max_parallel."""
    from rotaris_core.config.schema import ModelConfig, PersonaConfig, RotarisConfig
    from rotaris_core.orchestrator.child_state import ChildTaskState
    from rotaris_core.orchestrator.report import ChildReportArtifact

    policy = RuntimePolicy(max_children=20, max_active_children=20, max_depth=3)
    child_manager = ChildManager(parent_agent_id="parent", current_depth=1, policy=policy)
    # Spawn 2 children using coding-agent, mark one terminal.
    child_manager.spawn_child("first", "coding-agent", "Do first", model_key="deepseek-v4")
    child_manager.spawn_child("second", "coding-agent", "Do second", model_key="deepseek-v4")
    child_manager._children["first"].transition(ChildTaskState.RUNNING)
    child_manager._children["second"].transition(ChildTaskState.RUNNING)
    child_manager.mark_child_terminal(
        "first",
        ChildTaskState.SUCCEEDED,
        ChildReportArtifact(
            agent_name="agent", persona="coding-agent", status="succeeded", summary="done"
        ),
    )

    scheduler.config = RotarisConfig(
        personas={
            "coding-agent": PersonaConfig(name="coding-agent", model="deepseek-v4"),
        },
        models={
            "deepseek-v4": ModelConfig(
                provider="deepseek", model_id="deepseek-v4-pro", max_parallel=2
            ),
        },
    )
    executor = RotarisDelegateExecutor(child_manager, scheduler, agent_factory)

    # Only 1 RUNNING child, so 3rd should still succeed directly (not queued).
    obs = executor(DelegateAction(persona="coding-agent", task_name="third", task="Do third"))

    assert obs.is_error is False
    assert obs.status == "queued"
