"""Integration coverage for planner sibling-context auto-injection."""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import Mock

from rotaris_core.config.schema import PersonaConfig, RotarisConfig, RuntimePolicy
from rotaris_core.orchestrator import RotarisDelegateExecutor
from rotaris_core.orchestrator.artifacts import SessionArtifactStore
from rotaris_core.orchestrator.child_manager import ChildManager
from rotaris_core.orchestrator.child_state import ChildTaskState
from rotaris_core.orchestrator.delegate_tool import RotarisDelegateAction
from rotaris_core.orchestrator.report import ChildReportArtifact
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from pathlib import Path


def _report(summary: str, key_findings: str, persona: str) -> ChildReportArtifact:
    return ChildReportArtifact(
        agent_name=persona,
        persona=persona,
        status="succeeded",
        summary=summary,
        key_findings=key_findings,
        tags=[f"topic:{persona}", "phase:research"],
    )


@verifies(SWR.SWR_129, SWR.SWR_143, SWR.SWR_1526, SWR.SWR_1536)
def test_planner_receives_research_context_from_prior_sibling_artifacts(
    tmp_path: Path,
) -> None:
    """Productive use: a planner can consume explicitly published sibling research.
    Expected outcome: authored research artifacts are injected into the planner task.
    """
    store = SessionArtifactStore(tmp_path)
    policy = RuntimePolicy(max_children=8, max_depth=3)
    child_manager = ChildManager(
        parent_agent_id="orchestrator",
        current_depth=1,
        policy=policy,
        artifact_store=store,
    )

    scheduler = Mock()
    scheduler.config = RotarisConfig(
        personas={
            "librarian": PersonaConfig(name="librarian", model="gpt-4o"),
            "codebase-analyst": PersonaConfig(name="codebase-analyst", model="gpt-4o"),
            "planner": PersonaConfig(name="planner", model="gpt-4o"),
        },
    )
    child_manager.config = scheduler.config  # type: ignore[attr-defined]
    executor = RotarisDelegateExecutor(
        child_manager,
        scheduler,
        Mock(side_effect=lambda persona: Mock(persona=persona)),
    )

    librarian = child_manager.spawn_child(
        name="requirements research",
        persona="librarian",
        task_payload="Find the artifact requirements doc.",
    )
    codebase_analyst = child_manager.spawn_child(
        name="input composer map",
        persona="codebase-analyst",
        task_payload="Map InputComposer behavior.",
    )

    librarian.transition(ChildTaskState.RUNNING)
    codebase_analyst.transition(ChildTaskState.RUNNING)

    child_manager.mark_child_terminal(
        librarian.canonical_name,
        ChildTaskState.SUCCEEDED,
        _report(
            "Found the shared artifacts requirement log.",
            "docs/requirement-log/done/requirements-20260522-shared-artifacts.md",
            "librarian",
        ),
    )
    child_manager.mark_child_terminal(
        codebase_analyst.canonical_name,
        ChildTaskState.SUCCEEDED,
        _report(
            "Mapped InputComposer relevant paths.",
            "src/rotaris_core/tui/widgets/input_composer.py handles prompt composition.",
            "codebase-analyst",
        ),
    )
    store.publish(
        slug="requirements-research",
        title="Requirements research",
        body=(
            "Found the shared artifacts requirement log.\n\n"
            "docs/requirement-log/done/requirements-20260522-shared-artifacts.md"
        ),
        persona="librarian",
        source_task_id=librarian.task_id,
        canonical_name=librarian.canonical_name,
    )
    store.publish(
        slug="input-composer-map",
        title="Input composer map",
        body=(
            "Mapped InputComposer relevant paths.\n\n"
            "src/rotaris_core/tui/widgets/input_composer.py handles prompt composition."
        ),
        persona="codebase-analyst",
        source_task_id=codebase_analyst.task_id,
        canonical_name=codebase_analyst.canonical_name,
    )

    observation = executor(
        RotarisDelegateAction(
            persona="planner",
            task_name="implementation plan",
            task="Prepare the fix plan.",
        ),
    )

    assert observation.status == "queued"
    planner = child_manager.snapshot_children()[-1]
    assert planner.persona == "planner"
    assert "PRIOR SIBLING ARTIFACT INDEX" in planner.task_payload
    assert "requirements-research" in planner.task_payload
    assert "input-composer-map" in planner.task_payload
    # The index names what exists and how to fetch it — the bodies stay on disk
    # until the planner asks for them (SWR-1526).
    assert "artifact_read" in planner.task_payload
    assert "requirements-20260522-shared-artifacts.md" not in planner.task_payload
    assert "src/rotaris_core/tui/widgets/input_composer.py" not in planner.task_payload
    assert planner.task_payload.endswith("Prepare the fix plan.")

    # ... and asking for them yields the evidence the summary line omitted.
    body = store.get("requirements-research")
    assert body is not None
    assert "requirements-20260522-shared-artifacts.md" in body.body_markdown


@verifies(SWR.SWR_105, SWR.SWR_161)
def test_planner_can_spawn_research_children_as_nested_dag(
    tmp_path: Path,
) -> None:
    store = SessionArtifactStore(tmp_path)
    policy = RuntimePolicy(max_children=8, max_depth=3)

    scheduler = Mock()
    scheduler.config = RotarisConfig(
        personas={
            "planner": PersonaConfig(name="planner", model="gpt-4o"),
            "librarian": PersonaConfig(name="librarian", model="gpt-4o"),
            "codebase-analyst": PersonaConfig(name="codebase-analyst", model="gpt-4o"),
        },
    )

    orchestrator_manager = ChildManager(
        parent_agent_id="orchestrator",
        current_depth=0,
        policy=policy,
        artifact_store=store,
    )
    # type: ignore[attr-defined]
    orchestrator_manager.config = scheduler.config
    orchestrator_executor = RotarisDelegateExecutor(
        orchestrator_manager,
        scheduler,
        Mock(side_effect=lambda persona: Mock(persona=persona)),
    )

    planner_obs = orchestrator_executor(
        RotarisDelegateAction(
            persona="planner",
            task_name="execution plan",
            task="Plan the work and delegate prerequisite research if needed.",
        ),
    )

    assert planner_obs.status == "queued"
    planner = orchestrator_manager.snapshot_children()[-1]
    assert planner.persona == "planner"
    assert planner.parent_agent_id == "orchestrator"
    assert planner.depth == 1

    planner_manager = ChildManager(
        parent_agent_id=planner.canonical_name,
        current_depth=planner.depth,
        policy=policy,
        artifact_store=store,
    )
    planner_manager.config = scheduler.config  # type: ignore[attr-defined]
    planner_executor = RotarisDelegateExecutor(
        planner_manager,
        scheduler,
        Mock(side_effect=lambda persona: Mock(persona=persona)),
    )

    librarian_obs = planner_executor(
        RotarisDelegateAction(
            persona="librarian",
            task_name="external docs",
            task="Fetch the external API constraints.",
        ),
    )
    analyst_obs = planner_executor(
        RotarisDelegateAction(
            persona="codebase-analyst",
            task_name="repo map",
            task="Map the internal integration points.",
        ),
    )

    assert librarian_obs.status == "queued"
    assert analyst_obs.status == "queued"

    nested_children = planner_manager.snapshot_children()
    assert [child.persona for child in nested_children] == ["librarian", "codebase-analyst"]
    assert [child.parent_agent_id for child in nested_children] == [
        planner.canonical_name,
        planner.canonical_name,
    ]
    assert [child.depth for child in nested_children] == [2, 2]
    assert nested_children[0].task_payload.endswith("Fetch the external API constraints.")
    assert nested_children[1].task_payload.endswith("Map the internal integration points.")
