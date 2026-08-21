import pytest

from rotaris_core.api.prompts import prompt_api
from rotaris_core.config.schema import RotarisConfig, RuntimePolicy
from rotaris_core.core.prompt_types import PromptRegistry, QueuedStatus
from rotaris_core.orchestrator.report import ChildReportArtifact
from rotaris_core.ralph.loop import RalphLoop
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tools.todo_state import TodoList, TodoPhase, TodoTask


@pytest.fixture(autouse=True)
def clean_registry():
    """Fixture to provide a clean registry instance."""
    registry = PromptRegistry()
    with registry._lock:
        registry._steering_prompts.clear()
        registry._queued_prompts.clear()
    return registry


@verifies(SWR.SWR_1005)
@pytest.mark.asyncio
async def test_queued_prompt_triggers_new_task_in_ralph_loop(clean_registry):
    todo = TodoList(
        phases=[
            TodoPhase(
                name="Phase 1",
                tasks=[TodoTask(name="Original Task", description="Do something")],
            ),
        ],
    )
    loop = RalphLoop(
        config=RotarisConfig(runtime=RuntimePolicy(child_timeout=5)),
        workspace_root="/tmp/test_queued",
        summary_agent=object(),
        conversation_factory=lambda agent: object(),
    )

    queued_content = "This is a queued prompt"
    prompt_api.submit_queued(content=queued_content)
    assert clean_registry.get_queued_prompts()[0].status == QueuedStatus.QUEUED

    async def run_child(record, *_args, **_kwargs):
        return ChildReportArtifact(
            agent_name=record.canonical_name,
            persona=record.persona,
            status="succeeded",
            summary=f"Completed {record.name}",
        )

    calls: list[str] = []

    async def tracking_run_child(record, *args, **kwargs):
        calls.append(record.task_payload)
        return await run_child(record, *args, **kwargs)

    loop.scheduler.run_child = tracking_run_child  # type: ignore[method-assign]

    def agent_factory(persona, runtime_kwargs=None, model_override=None):
        del runtime_kwargs, model_override
        return {"persona": persona}

    progress = await loop.run(todo, agent_factory=agent_factory, session_id="queued-test")

    assert calls == ["Do something", queued_content]
    assert progress.completed_tasks == 2
    assert len(progress.iterations) == 2
    queued_phase = next(phase for phase in todo.phases if phase.name == "Queued Prompts")
    assert queued_phase.tasks[0].description == queued_content
    assert clean_registry.get_queued_prompts()[0].status == QueuedStatus.TRIGGERED
