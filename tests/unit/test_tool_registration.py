"""Productive use: two agents created in the same pass each get tools bound to themselves.
Expected outcome: an artifact, todo update, or wait call is attributed to the agent that
made it, never to whichever sibling happened to be constructed last."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from pathlib import Path

import pytest
from openhands.sdk.tool import Tool
from openhands.sdk.tool.registry import resolve_tool

from rotaris_core.agents.tool_registration import (
    ROOT_BINDING_KEY,
    RuntimeToolBinding,
    _register_artifact_tool_factories,
    _register_ask_questions_tool_factory,
    _register_delegate_tool_factory,
    _register_fetch_tool_factory,
    _register_todo_tool_factory,
    _register_wait_for_tasks_tool_factory,
    build_binding_key,
    discard_runtime_binding,
    identity_params,
    register_runtime_binding,
    resolve_runtime_binding,
)
from rotaris_core.config.schema import PersonaConfig, RotarisConfig, RuntimePolicy
from rotaris_core.orchestrator.artifacts import SessionArtifactStore
from rotaris_core.orchestrator.child_manager import ChildManager
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tools.artifacts import ArtifactWriteAction
from rotaris_core.tools.todo import TodoAction, TodoList


@pytest.fixture(autouse=True)
def _clean_bindings() -> Any:
    """Keep the module-level binding registry from leaking between tests."""
    from rotaris_core.agents import tool_registration

    with tool_registration._bindings_lock:
        tool_registration._runtime_bindings.clear()
        tool_registration._last_runtime_binding = None
    yield
    with tool_registration._bindings_lock:
        tool_registration._runtime_bindings.clear()
        tool_registration._last_runtime_binding = None


def _resolve(name: str, params: dict[str, Any]) -> Any:
    """Resolve one tool spec the way the SDK does at conversation start."""
    return resolve_tool(Tool(name=name, params=params), None)[0]  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# binding key / params helpers


@verifies(SWR.SWR_2426)
def test_binding_key_is_root_without_child_context() -> None:
    assert build_binding_key(None) == ROOT_BINDING_KEY
    assert build_binding_key({}) == ROOT_BINDING_KEY


@verifies(SWR.SWR_2426)
def test_binding_key_is_deterministic_per_child() -> None:
    kwargs = {"child_canonical_name": "planner-1", "session_id": "sess-a"}
    assert build_binding_key(kwargs) == "sess-a/planner-1"
    assert build_binding_key(kwargs) == build_binding_key(dict(kwargs))
    assert build_binding_key({"child_canonical_name": "planner-1"}) == "planner-1"


@verifies(SWR.SWR_2426)
def test_identity_params_are_json_safe() -> None:
    params = identity_params(
        "planner",
        {
            "child_canonical_name": "planner-1",
            "child_task_id": "bg_1234",
            "child_manager": object(),
            "todo_state_callback": lambda _todo: None,
        },
    )

    assert json.loads(json.dumps(params)) == params
    assert params["persona"] == "planner"
    assert params["canonical_name"] == "planner-1"
    assert params["task_id"] == "bg_1234"


@verifies(SWR.SWR_2426)
def test_unknown_binding_key_falls_back_and_warns(
    caplog: pytest.LogCaptureFixture,
) -> None:
    binding = RuntimeToolBinding(artifact_store="store")
    register_runtime_binding("known", binding)

    with caplog.at_level("WARNING", logger="rotaris_core.agents.tool_registration"):
        resolved = resolve_runtime_binding("stale-key")

    assert resolved is binding
    assert "wrong agent" in caplog.text


@verifies(SWR.SWR_2426)
def test_discarded_binding_is_removed() -> None:
    register_runtime_binding("child-a", RuntimeToolBinding(artifact_store="a"))
    register_runtime_binding("child-b", RuntimeToolBinding(artifact_store="b"))

    discard_runtime_binding("child-a")

    from rotaris_core.agents import tool_registration

    assert "child-a" not in tool_registration._runtime_bindings
    assert resolve_runtime_binding("child-b").artifact_store == "b"


@verifies(SWR.SWR_554, SWR.SWR_2426)
def test_delegate_registry_entry_publishes_its_public_name() -> None:
    """Productive use: an orchestrator can call the delegate tool named in its prompt.
    Expected outcome: registry resolution and the LLM schema both expose `delegate`.
    """
    _register_delegate_tool_factory()
    register_runtime_binding(
        "orchestrator",
        RuntimeToolBinding(
            child_manager=object(),
            scheduler=object(),
            agent_factory=object(),
        ),
    )

    tool = _resolve("delegate", {"binding_key": "orchestrator"})

    assert tool.name == "delegate"
    assert tool.to_mcp_tool()["name"] == "delegate"


# ---------------------------------------------------------------------------
# artifact tools


@verifies(SWR.SWR_2426, SWR.SWR_2427)
def test_siblings_resolve_artifact_write_with_own_identity(tmp_path: Path) -> None:
    store = SessionArtifactStore(tmp_path)
    manager = ChildManager(
        parent_agent_id="parent",
        current_depth=0,
        policy=RuntimePolicy(max_children=8, max_depth=3),
    )
    first = manager.spawn_child("analyst-1", "codebase-analyst", "read architecture")
    second = manager.spawn_child("analyst-2", "codebase-analyst", "read tests")

    # Both agents are built before either conversation resolves its tools —
    # exactly the ordering in Scheduler.spawn_children.
    _register_artifact_tool_factories()
    specs = []
    for child in (first, second):
        runtime_kwargs = {
            "child_canonical_name": child.canonical_name,
            "child_task_id": child.task_id,
            "child_manager": manager,
            "artifact_store": store,
        }
        register_runtime_binding(
            build_binding_key(runtime_kwargs),
            RuntimeToolBinding(artifact_store=store, child_manager=manager),
        )
        specs.append(identity_params("codebase-analyst", runtime_kwargs))

    first_exec = _resolve("artifact_write", specs[0]).executor
    second_exec = _resolve("artifact_write", specs[1]).executor

    assert first_exec.canonical_name == first.canonical_name
    assert first_exec.task_id == first.task_id
    assert second_exec.canonical_name == second.canonical_name
    assert second_exec.task_id == second.task_id


@verifies(SWR.SWR_2427)
def test_resolved_write_tool_attributes_artifact_to_its_own_agent(tmp_path: Path) -> None:
    store = SessionArtifactStore(tmp_path)
    manager = ChildManager(
        parent_agent_id="parent",
        current_depth=0,
        policy=RuntimePolicy(max_children=8, max_depth=3),
    )
    architecture = manager.spawn_child("run-architecture", "codebase-analyst", "architecture")
    tests_ui = manager.spawn_child("run-tests-ui", "codebase-analyst", "tests")

    _register_artifact_tool_factories()
    params = {}
    for child in (architecture, tests_ui):
        runtime_kwargs = {
            "child_canonical_name": child.canonical_name,
            "child_task_id": child.task_id,
        }
        register_runtime_binding(
            build_binding_key(runtime_kwargs),
            RuntimeToolBinding(artifact_store=store, child_manager=manager),
        )
        params[child.canonical_name] = identity_params("codebase-analyst", runtime_kwargs)

    tool = _resolve("artifact_write", params[architecture.canonical_name])
    obs = tool.executor(
        ArtifactWriteAction(slug="arch-notes", title="Architecture notes", body="# Notes"),
    )

    record = store.get(obs.artifact_id)
    assert record is not None
    assert record.canonical_name == architecture.canonical_name
    assert record.source_task_id == architecture.task_id
    assert record.created_by == architecture.canonical_name
    assert obs.artifact_id in architecture.produced_artifact_ids
    assert obs.artifact_id not in tests_ui.produced_artifact_ids


@verifies(SWR.SWR_2426)
def test_artifact_read_carries_the_resolving_personas_name(tmp_path: Path) -> None:
    store = SessionArtifactStore(tmp_path)
    _register_artifact_tool_factories()
    for persona in ("planner", "reviewer"):
        runtime_kwargs = {"child_canonical_name": f"{persona}-1"}
        register_runtime_binding(
            build_binding_key(runtime_kwargs),
            RuntimeToolBinding(artifact_store=store),
        )

    planner = _resolve(
        "artifact_read", identity_params("planner", {"child_canonical_name": "planner-1"})
    )
    reviewer = _resolve(
        "artifact_read", identity_params("reviewer", {"child_canonical_name": "reviewer-1"})
    )

    assert planner.executor.persona == "planner"
    assert reviewer.executor.persona == "reviewer"


# ---------------------------------------------------------------------------
# todo / wait_for_tasks


@verifies(SWR.SWR_2426)
def test_todo_callback_fires_only_for_its_own_agent() -> None:
    seen: dict[str, int] = {"a": 0, "b": 0}

    _register_todo_tool_factory()
    params = {}
    for name in ("a", "b"):

        def _callback(_todo: TodoList, _name: str = name) -> None:
            seen[_name] += 1

        runtime_kwargs = {"child_canonical_name": f"child-{name}"}
        register_runtime_binding(
            build_binding_key(runtime_kwargs),
            RuntimeToolBinding(todo_state_callback=_callback),
        )
        params[name] = identity_params("planner", runtime_kwargs)

    tool_a = _resolve("todo", params["a"])
    tool_a.executor(TodoAction(operation="replace", payload=TodoList().model_dump(mode="json")))

    assert seen == {"a": 1, "b": 0}


@verifies(SWR.SWR_2426)
def test_wait_for_tasks_binds_the_callers_own_task_id() -> None:
    manager = ChildManager(
        parent_agent_id="parent",
        current_depth=0,
        policy=RuntimePolicy(max_children=8, max_depth=3),
    )
    first = manager.spawn_child("worker-1", "planner", "one")
    second = manager.spawn_child("worker-2", "planner", "two")

    _register_wait_for_tasks_tool_factory()
    specs = []
    for child in (first, second):
        runtime_kwargs = {
            "child_canonical_name": child.canonical_name,
            "child_task_id": child.task_id,
        }
        register_runtime_binding(
            build_binding_key(runtime_kwargs),
            RuntimeToolBinding(child_manager=manager),
        )
        specs.append(identity_params("planner", runtime_kwargs))

    assert _resolve("wait_for_tasks", specs[0]).executor.current_task_id == first.task_id
    assert _resolve("wait_for_tasks", specs[1]).executor.current_task_id == second.task_id
    assert (
        _resolve("wait_for_tasks", specs[0]).executor.parent_canonical_name == first.canonical_name
    )
    assert (
        _resolve("wait_for_tasks", specs[1]).executor.parent_canonical_name == second.canonical_name
    )


@verifies(SWR.SWR_2426)
def test_wait_for_tasks_uses_root_persona_as_caller_identity() -> None:
    """Productive use: an agent built without child context can still resolve tools.
    Expected outcome: runtime binding falls back to the persona as its canonical caller.

    The manager's parent id deliberately differs from the persona: a matching
    pair would mask the delegate/lookup identity asymmetry this suite guards
    against (the not_found regression fixed alongside SWR-2426).
    """
    manager = ChildManager(
        parent_agent_id="fix-the-widget",
        current_depth=0,
        policy=RuntimePolicy(max_children=8, max_depth=3),
    )
    _register_wait_for_tasks_tool_factory()
    register_runtime_binding(
        build_binding_key(None, "planner"),
        RuntimeToolBinding(child_manager=manager),
    )

    params = identity_params("planner", None)

    assert _resolve("wait_for_tasks", params).executor.parent_canonical_name == "planner"


@verifies(SWR.SWR_2426)
def test_root_identity_agrees_across_delegate_and_lookup_tools() -> None:
    """Productive use: the root orchestrator delegates work, then polls it with
    background_output / wait_for_tasks.
    Expected outcome: all three executors carry the same parent identity, so a
    task id minted by delegate resolves instead of returning not_found.

    Reproduces the 2026-08-03 regression: the root agent's record parent was the
    rebound canonical task name while background_output fell back to the persona
    ("orchestrator"), so every lookup of a valid id failed.
    """
    from rotaris_core.agents.tool_registration import _register_background_output_tool_factory
    from rotaris_core.tools.background_output import BackgroundOutputAction

    manager = ChildManager(
        parent_agent_id="ralph",
        current_depth=0,
        policy=RuntimePolicy(max_children=8, max_depth=3),
    )
    # Mirror RalphLoop._run_iteration: the iteration's own record is spawned,
    # then the manager is rebound to it before any tools resolve.
    root = manager.spawn_child("i-have-an-issue", "orchestrator", "payload")
    manager.rebind_parent(root.canonical_name)
    runtime_kwargs = {
        "child_manager": manager,
        "child_canonical_name": root.canonical_name,
        "child_task_id": root.task_id,
        "session_id": "run-a",
    }

    _register_delegate_tool_factory()
    _register_background_output_tool_factory()
    _register_wait_for_tasks_tool_factory()
    register_runtime_binding(
        build_binding_key(runtime_kwargs, "orchestrator"),
        RuntimeToolBinding(child_manager=manager),
    )
    params = identity_params("orchestrator", runtime_kwargs)

    delegate = _resolve("delegate", params).executor
    background_output = _resolve("background_output", params).executor
    wait_for_tasks = _resolve("wait_for_tasks", params).executor

    assert delegate.parent_canonical_name == root.canonical_name
    assert background_output.parent_canonical_name == root.canonical_name
    assert wait_for_tasks.parent_canonical_name == root.canonical_name

    # A child delegated under that identity must be visible to the lookup tool.
    child = manager.spawn_child(
        "fix-agent-transcript-coloring",
        "coding-agent",
        "payload",
        parent_agent_id=delegate.parent_canonical_name,
    )
    observation = background_output(BackgroundOutputAction(task_id=child.task_id))
    assert observation.status == "still_running"


@verifies(SWR.SWR_2426)
def test_parallel_runs_with_same_agent_names_resolve_their_own_manager() -> None:
    """Productive use: two Rotaris worktree runs execute in one process with
    identically named root agents.
    Expected outcome: session-namespaced binding keys keep each run's tools bound
    to its own ChildManager instead of the last-registered run's.
    """
    from rotaris_core.agents.tool_registration import _register_background_output_tool_factory

    _register_background_output_tool_factory()
    managers = {}
    params = {}
    for session in ("run-a", "run-b"):
        manager = ChildManager(
            parent_agent_id="orchestrator-task",
            current_depth=0,
            policy=RuntimePolicy(max_children=8, max_depth=3),
        )
        runtime_kwargs = {
            "child_canonical_name": "orchestrator-task",
            "session_id": session,
        }
        register_runtime_binding(
            build_binding_key(runtime_kwargs, "orchestrator"),
            RuntimeToolBinding(child_manager=manager),
        )
        managers[session] = manager
        params[session] = identity_params("orchestrator", runtime_kwargs)

    assert params["run-a"]["binding_key"] != params["run-b"]["binding_key"]
    executor_a = _resolve("background_output", params["run-a"]).executor
    executor_b = _resolve("background_output", params["run-b"]).executor
    assert executor_a.child_manager is managers["run-a"]
    assert executor_b.child_manager is managers["run-b"]


# ---------------------------------------------------------------------------
# per-run configuration and barriers


def _run_config(session: str, **runtime: Any) -> RotarisConfig:
    persona = PersonaConfig(name="coder", model="small_model")
    config = RotarisConfig(personas={persona.name: persona}, default_persona=persona.name)
    for field, value in runtime.items():
        setattr(config.runtime, field, value)
    config.runtime.tool_timeout = 11 if session == "run-a" else 22
    return config


@verifies(SWR.SWR_2426, SWR.SWR_2505)
def test_fetch_enforces_the_calling_runs_egress_policy(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: two runs share a process and one of them is not allowed on the web.

    Expected outcome: the strict run's agent still cannot reach the host it was
    told to stay off. The tool registry is keyed by name alone, so the run that
    built an agent last used to own ``fetch`` for everyone — and a denied host
    became reachable because another run happened to permit it."""
    params = {}
    for session, denied in (("run-a", ("blocked.example",)), ("run-b", ())):
        config = _run_config(
            session,
            network_egress_policy="allow",
            network_denied_hosts=list(denied),
        )
        runtime_kwargs = {"child_canonical_name": "coder-1", "session_id": session}
        register_runtime_binding(
            build_binding_key(runtime_kwargs, "coder"),
            RuntimeToolBinding(config=config),
        )
        params[session] = identity_params("coder", runtime_kwargs)
        # Registration order is the whole point: run-b registers last and would
        # otherwise be the policy every run resolves.
        monkeypatch.setattr(
            "rotaris_core.agents.tool_registration._fetch_registered_config_id",
            None,
            raising=False,
        )
        _register_fetch_tool_factory(config)

    strict = _resolve("fetch", params["run-a"]).executor
    permissive = _resolve("fetch", params["run-b"]).executor

    assert strict.egress_policy.denied_hosts == ("blocked.example",)
    assert permissive.egress_policy.denied_hosts == ()
    assert strict.timeout == 11.0, "the shell of one run must not time out by another's clock"


class _RecordingBarrier:
    """A stand-in for one run's user-prompt barrier."""

    def __init__(self) -> None:
        self.asked: list[object] = []

    def create_prompt(self, conversation: object) -> str:
        self.asked.append(conversation)
        return "prompt-1"

    def wait_for_response(self, conversation: object, prompt_id: str, timeout: float) -> Any:
        from rotaris_core.orchestrator.user_prompt_barrier import PromptResponse, PromptWaitStatus

        del conversation, prompt_id, timeout
        return PromptResponse(
            status=PromptWaitStatus.RESOLVED,
            answers={"scope": {"freeform": "yes"}},
        )

    def discard(self, conversation: object) -> None:
        del conversation


@verifies(SWR.SWR_2426)
def test_a_question_reaches_the_user_of_the_run_that_asked_it() -> None:
    """Productive use: two runs are open and the older one asks the user something.

    Expected outcome: the question lands in front of that run's user. A barrier
    belongs to one run and one waiting person, so a question posted to the other
    run's barrier is shown to the wrong user — and waits on nobody."""
    from rotaris_core.tools.ask_questions import AskQuestionsAction, AskQuestionsStep

    _register_ask_questions_tool_factory()
    barriers = {}
    params = {}
    for session in ("run-a", "run-b"):
        barrier = _RecordingBarrier()
        runtime_kwargs = {"child_canonical_name": "orchestrator-task", "session_id": session}
        register_runtime_binding(
            build_binding_key(runtime_kwargs, "orchestrator"),
            RuntimeToolBinding(user_prompt_barrier=barrier),
        )
        barriers[session] = barrier
        params[session] = identity_params("orchestrator", runtime_kwargs)

    tool = _resolve("ask_questions", params["run-a"])
    action = AskQuestionsAction(steps=[AskQuestionsStep(id="scope", title="How far?")])
    observation = tool.executor(action, conversation=object())

    assert len(barriers["run-a"].asked) == 1
    assert barriers["run-b"].asked == [], "the other run's user was never asked anything"
    assert observation.answers == {"scope": {"freeform": "yes"}}
