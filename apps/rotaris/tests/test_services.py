from __future__ import annotations

import asyncio
import datetime as dt
from types import SimpleNamespace

import pytest
import yaml
from rotaris_core.auth.provider import (
    AuthFlowType,
    AuthResult,
    AuthStatus,
    DeviceCodePrompt,
    TokenSet,
)
from rotaris_core.config.schema import (
    CircuitBreakerConfig,
    MCPServerConfig,
    ModelConfig,
    PersonaConfig,
    RotarisConfig,
    RuntimePolicy,
    UnavailableModel,
)
from rotaris_core.improvement.persistence import (
    load_improvement_artifact,
    save_improvement_artifact,
)
from rotaris_core.improvement.proposals import (
    ApprovalStatus,
    ImprovementEvidence,
    ImprovementProposalArtifact,
    ImprovementProposalCategory,
)
from rotaris_core.improvement.proposals import ImprovementProposal as BackendImprovementProposal
from rotaris_core.orchestrator.child_manager import ChildManager
from rotaris_core.orchestrator.child_state import ChildTaskState
from rotaris_core.orchestrator.report import ChildReportArtifact
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.state import SessionState

from rotaris.models import (
    AgentState,
    ImprovementProposal,
    McpServer,
    PersonaSpec,
    ProviderInfo,
    SkillInfo,
    TodoItem,
)
from rotaris.models.store import WorkspaceStore
from rotaris.services.config_service import ConfigService
from rotaris.services.run_bridge import RunBridge, _RunWorker, _SessionObserver
from rotaris.services.session_projection import (
    SessionProjectionContext,
    build_session_projection,
)
from rotaris.views.workspace import WorkspaceView

pytestmark = pytest.mark.integration


@verifies(SWR.SWR_2422, SWR.SWR_2423)
def test_pending_question_projection_is_copied_and_emits_only_on_change() -> None:
    """Productive use: a user can read a stable pending prompt while sessions poll.
    Expected outcome: projection owns copied state and identical polls do not rebuild the UI.
    """
    now = dt.datetime.now(dt.UTC)
    state = SessionState(
        session_id="session-questions",
        workspace_root="/workspace",
        created_at=now,
        updated_at=now,
        pending_questions={
            "agent_id": "agent-a",
            "prompt_id": "prompt-a",
            "steps": [{"id": "scope", "title": "Original", "options": []}],
        },
    )
    projection = build_session_projection(
        state,
        RotarisConfig(),
        SessionProjectionContext(),
        [],
    )
    assert projection.transcript[-1].kind == "question_stepper"

    state.pending_questions["steps"][0]["title"] = "Mutated"
    assert projection.pending_questions["steps"][0]["title"] == "Original"

    store = WorkspaceStore()
    emissions: list[object] = []
    store.pending_questions_changed.connect(emissions.append)
    store.set_pending_questions(projection.pending_questions)
    store.set_pending_questions(projection.pending_questions)
    assert emissions == [projection.pending_questions]


def _worker_waiting_on(barrier, conversation, agent_id: str = "agent-a"):
    """A run worker whose loop has *agent_id* blocked on *barrier*.

    Built around the worker's real attributes — an observer holding the loop —
    rather than around the shape the caller wishes it had. The previous double
    invented a ``_ralph`` attribute the worker has never had, which is what let
    a dead code path look covered.
    """
    from rotaris.services.run_bridge import _RunWorker

    scheduler = SimpleNamespace(
        user_prompt_barrier=barrier,
        _active_conversations={agent_id: conversation},
    )
    worker = _RunWorker.__new__(_RunWorker)
    worker._observer = SimpleNamespace(ralph=SimpleNamespace(scheduler=scheduler))
    return worker


@verifies(SWR.SWR_2423)
def test_run_bridge_cancel_questions_releases_exact_waiter(tmp_path) -> None:
    """Productive use: a user can close a prompt without waiting for its timeout.
    Expected outcome: bridge cancellation releases only the identified waiting conversation.
    """
    from rotaris_core.orchestrator.user_prompt_barrier import (
        PromptWaitStatus,
        UserPromptBarrier,
    )

    store = WorkspaceStore()
    bridge = RunBridge(tmp_path, store, ConfigService(tmp_path, store))
    barrier = UserPromptBarrier()
    conversation = SimpleNamespace(id="conversation-a")
    prompt_id = barrier.create_prompt(conversation)
    bridge._worker = _worker_waiting_on(barrier, conversation)
    bridge._run_active = True

    assert bridge.cancel_questions("agent-a", prompt_id)
    response = barrier.wait_for_response(conversation, prompt_id, timeout=0.1)
    assert response.status is PromptWaitStatus.CANCELLED
    bridge._worker = None
    bridge._run_active = False


@verifies(SWR.SWR_2423)
def test_an_answered_question_reaches_the_agent_that_asked_it(tmp_path) -> None:
    """Productive use: an agent asks a question and the user answers it.

    Expected outcome: the agent gets the answer and carries on. This went
    through an attribute the run worker does not have, so every answer was
    dropped and the agent waited out its full timeout instead — with a test
    double supplying the missing attribute, so the suite stayed green."""
    from rotaris_core.orchestrator.user_prompt_barrier import (
        PromptWaitStatus,
        UserPromptBarrier,
    )

    store = WorkspaceStore()
    bridge = RunBridge(tmp_path, store, ConfigService(tmp_path, store))
    barrier = UserPromptBarrier()
    conversation = SimpleNamespace(id="conversation-a")
    prompt_id = barrier.create_prompt(conversation)
    bridge._worker = _worker_waiting_on(barrier, conversation)
    bridge._run_active = True

    answers = {"scope": {"freeform": "the whole module"}}
    assert bridge.resolve_questions("agent-a", prompt_id, answers)

    response = barrier.wait_for_response(conversation, prompt_id, timeout=0.1)
    assert response.status is PromptWaitStatus.RESOLVED
    assert response.answers == answers
    bridge._worker = None
    bridge._run_active = False


@verifies(SWR.SWR_2098)
def test_config_service_persists_skill_injection_policy(tmp_path) -> None:
    store = WorkspaceStore()
    store.skills = [
        SkillInfo("Review changes", "project", "Review pull requests."),
        SkillInfo("Deploy", "user", "Deploy safely."),
    ]
    store.set_skill_load_mode("Review changes", "on")
    store.set_skill_invocation_mode("Deploy", "manual-only")
    store.set_skills_enabled(False)
    service = ConfigService(tmp_path, store)
    service.config = RotarisConfig(workspace_root=tmp_path)

    service.save()

    persisted = yaml.safe_load((tmp_path / ".rotaris" / "agents.yaml").read_text())
    assert persisted["skills"] == {
        "enabled": False,
        "overrides": {"review-changes": "on"},
        "invocation_overrides": {"deploy": "manual-only"},
    }
    assert service.config.skills.enabled is False
    assert service.config.skills.overrides == {"review-changes": "on"}
    assert service.config.skills.invocation_overrides == {"deploy": "manual-only"}


def _write_improvement_artifact(
    workspace_root,
    *,
    artifact_id: str = "impart_00000001",
    proposal_id: str = "imp_00000001",
    status: ApprovalStatus = ApprovalStatus.PENDING_REVIEW,
) -> ImprovementProposalArtifact:
    artifact = ImprovementProposalArtifact(
        artifact_id=artifact_id,
        source_session_id="session-1",
        proposals=[
            BackendImprovementProposal(
                id=proposal_id,
                category=ImprovementProposalCategory.WORKSPACE_NOTE,
                summary="Cache LSP diagnostics between tester runs",
                evidence=[
                    ImprovementEvidence(kind="transcript_observation", text="observed twice")
                ],
                recommended_action="Add a diagnostics cache keyed by file hash.",
                status=status,
            )
        ],
    )
    save_improvement_artifact(workspace_root, artifact)
    return artifact


@verifies(SWR.SWR_2008)
def test_config_service_maps_persisted_session_to_store(tmp_path) -> None:
    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)
    persona = SimpleNamespace(model="model", thinking="high", tools=["shell"])
    service.config = SimpleNamespace(
        default_persona="orchestrator",
        personas={"orchestrator": persona, "coder": persona},
        models={"model": SimpleNamespace(max_input_tokens=200_000)},
    )
    metrics = SimpleNamespace(last_prompt_tokens=1200, tool_call_count=2, tool_calls={"shell": 2})
    state = SimpleNamespace(
        session_id="session-1",
        execution_status="running",
        transcript_events=[{"role": "user", "content": "Build it"}],
        child_states=[
            {
                "canonical_name": "coder-1",
                "persona": "coder",
                "state": "running",
                "task_payload": "Implement view",
                "parent_agent_id": "missing-parent",
            }
        ],
        todo_state={
            "phases": [
                {
                    "id": "phase-1",
                    "name": "Build",
                    "tasks": [{"id": "1", "name": "Implement view", "status": "IN_PROGRESS"}],
                }
            ]
        },
        token_usage=None,
        global_token_usage=SimpleNamespace(total_tokens=3200),
        global_tool_call_count=2,
        agent_metrics={"coder-1": metrics},
        root_context_tokens=51_200,
    )
    store.session_reasoning_override = "low"

    service.apply_session(state)

    assert store.session_name == "session-1"
    assert "orchestrator" not in store.agents
    assert store.run_summary.state is AgentState.RUNNING
    assert store.run_summary.ctx_used == 51_200
    assert store.run_summary.ctx_limit == 200_000
    assert store.run_summary.reasoning == "low"
    assert store.agents["coder-1"].parent_id is None
    assert store.agents["coder-1"].ctx_limit == 200_000
    assert store.todos == [TodoItem("1", "phase-1", "active", "Implement view", "Build")]
    assert store.kpis.cumulative_tokens == 3200


def _tool_set_session(child: dict) -> SimpleNamespace:
    """A minimal persisted session carrying one child record."""
    return SimpleNamespace(
        session_id="session-1",
        execution_status="running",
        transcript_events=[],
        child_states=[child],
        todo_state=None,
        token_usage=None,
        global_token_usage=SimpleNamespace(total_tokens=0),
        global_tool_call_count=0,
        agent_metrics={},
        root_context_tokens=0,
    )


@verifies(SWR.SWR_3010)
def test_agent_node_uses_the_recorded_tool_set(tmp_path) -> None:
    """Productive use: the inspector describes the agent, not the persona template.

    Expected outcome: the projection prefers what the run resolved — so the
    orchestrator's stripped `write_file` stays stripped — and carries the MCP
    tools per server, which the persona declaration never held at all.
    """
    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)
    persona = SimpleNamespace(
        model="model",
        thinking="high",
        tools=["read_file", "write_file", "terminal"],
    )
    service.config = SimpleNamespace(
        default_persona="orchestrator",
        personas={"orchestrator": persona, "analyst": persona},
        models={"model": SimpleNamespace(max_input_tokens=200_000)},
    )

    service.apply_session(
        _tool_set_session(
            {
                "canonical_name": "analyst-1",
                "persona": "analyst",
                "state": "running",
                "task_payload": "Answer a question",
                "granted_tools": ["read_file"],
                "granted_mcp_tools": {"serena": ["find_symbol"]},
            },
        ),
    )

    agent = store.agents["analyst-1"]
    assert agent.tools == ["read_file"]
    assert "write_file" not in agent.tools
    assert agent.mcp_tools == {"serena": ["find_symbol"]}


@verifies(SWR.SWR_3010)
def test_agent_node_falls_back_to_persona_tools(tmp_path) -> None:
    """A session written before the run recorded its tool set still lists something."""
    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)
    persona = SimpleNamespace(model="model", thinking="high", tools=["read_file", "grep"])
    service.config = SimpleNamespace(
        default_persona="orchestrator",
        personas={"orchestrator": persona, "analyst": persona},
        models={"model": SimpleNamespace(max_input_tokens=200_000)},
    )

    service.apply_session(
        _tool_set_session(
            {
                "canonical_name": "analyst-1",
                "persona": "analyst",
                "state": "running",
                "task_payload": "Answer a question",
            },
        ),
    )

    agent = store.agents["analyst-1"]
    assert agent.tools == ["read_file", "grep"]
    assert agent.mcp_tools == {}


@verifies(SWR.SWR_2421)
def test_transcript_events_carry_persona_from_row_stamp_and_child_states(tmp_path) -> None:
    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)
    persona = SimpleNamespace(model="model", thinking="high", tools=["shell"])
    service.config = SimpleNamespace(
        default_persona="orchestrator",
        personas={"orchestrator": persona, "coder": persona, "tester": persona},
        models={"model": SimpleNamespace(max_input_tokens=200_000)},
    )
    state = SimpleNamespace(
        session_id="session-1",
        execution_status="running",
        transcript_events=[
            # The live run bridge stamps the persona onto the row itself…
            {"role": "agent", "name": "coder-1", "persona": "coder", "content": "editing"},
            # …older rows carry only the agent name and lean on child_states.
            {"role": "agent", "name": "tester-1", "content": "running pytest"},
            # Nothing to resolve: keeps the neutral fallback.
            {"role": "agent", "name": "ghost-1", "content": "orphaned row"},
        ],
        child_states=[
            {"canonical_name": "coder-1", "persona": "coder", "state": "running"},
            {"canonical_name": "tester-1", "persona": "tester", "state": "running"},
        ],
        todo_state=None,
        agent_todo_state=None,
        token_usage=None,
        global_token_usage=SimpleNamespace(total_tokens=100),
        global_tool_call_count=0,
        agent_metrics={},
        root_context_tokens=0,
    )

    service.apply_session(state)

    personas = {event.role: event.persona for event in store.transcript}
    assert personas == {"coder-1": "coder", "tester-1": "tester", "ghost-1": ""}


@verifies(SWR.SWR_2060)
def test_config_service_identical_session_poll_emits_no_ui_updates(tmp_path) -> None:
    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)
    state = SimpleNamespace(
        session_id="session-1",
        execution_status="running",
        transcript_events=[{"role": "agent", "content": "Still working"}],
        child_states=[],
        todo_state=None,
        agent_todo_state=None,
        token_usage=None,
        global_token_usage=SimpleNamespace(total_tokens=100),
        global_tool_call_count=0,
        agent_metrics={},
        root_context_tokens=100,
    )
    service.apply_session(state)
    updates: list[str] = []
    store.transcript_changed.connect(lambda: updates.append("transcript"))
    store.agents_changed.connect(lambda: updates.append("agents"))
    store.todos_changed.connect(lambda: updates.append("todos"))
    store.artifacts_changed.connect(lambda: updates.append("artifacts"))
    store.status_changed.connect(lambda: updates.append("status"))
    store.run_state_changed.connect(lambda _state: updates.append("run_state"))

    service.apply_session(state)

    assert updates == []


@verifies(SWR.SWR_2084, SWR.SWR_2096)
def test_config_service_hides_synthetic_persona_model_from_agent_inspector(tmp_path, qtbot) -> None:
    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)
    synthetic_model = "__persona__:codebase-analyst"
    service.config = RotarisConfig(
        default_persona="codebase-analyst",
        models={
            "provider/real-model": ModelConfig(
                provider="test",
                model_id="real-model",
                max_input_tokens=104_800,
            ),
            synthetic_model: ModelConfig(
                provider="test",
                model_id="real-model",
                max_input_tokens=104_800,
                thinking="low",
            ),
        },
        personas={
            "codebase-analyst": PersonaConfig(
                name="codebase-analyst",
                model=synthetic_model,
                thinking="low",
            )
        },
    )
    state = SimpleNamespace(
        session_id="session-1",
        execution_status="running",
        transcript_events=[],
        child_states=[
            {
                "canonical_name": "what-does-codebase-do",
                "persona": "codebase-analyst",
                "state": "succeeded",
                "model_key": synthetic_model,
            }
        ],
        todo_state=None,
        agent_todo_state=None,
        token_usage=None,
        global_token_usage=SimpleNamespace(total_tokens=0),
        global_tool_call_count=0,
        agent_metrics={},
    )

    service.apply_session(state)
    store.select_agent("what-does-codebase-do")
    view = WorkspaceView(store)
    qtbot.addWidget(view)

    assert store.run_summary.model == "provider/real-model"
    assert store.agents["what-does-codebase-do"].model == "provider/real-model"
    assert view.inspector_model.currentText() == "provider/real-model"


@verifies(SWR.SWR_2125)
def test_config_service_does_not_resurrect_deleted_custom_provider(tmp_path, monkeypatch) -> None:
    provider_id = "openai-compatible--deleted-lab"
    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)
    service.config = SimpleNamespace(
        models={
            "deleted/model": SimpleNamespace(
                auth_provider=provider_id,
                provider="openai",
            )
        }
    )
    monkeypatch.setattr(
        "rotaris_core.auth.provider_settings.list_provider_settings",
        lambda: (),
    )
    monkeypatch.setattr(
        "rotaris_core.auth.provider_settings.get_provider_settings",
        lambda requested_id: SimpleNamespace(
            provider_id=requested_id,
            display_name=requested_id,
            authenticated=False,
        ),
    )

    assert [provider.id for provider in service._providers()] == ["concrete-cloud"]


@verifies(SWR.SWR_2125)
def test_config_service_providers_empty_by_default_except_rotaris_cloud(
    tmp_path, monkeypatch
) -> None:
    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)
    service.config = None
    monkeypatch.setattr(
        "rotaris_core.auth.provider_settings.get_provider_settings",
        lambda requested_id: SimpleNamespace(
            provider_id=requested_id,
            display_name="Rotaris Cloud (recommended)",
            authenticated=False,
        ),
    )

    providers = service._providers()

    assert [provider.id for provider in providers] == ["concrete-cloud"]
    assert providers[0].quick_start_url == "https://concrete-dynamics.com/rotaris"


@verifies(SWR.SWR_2125)
def test_config_service_providers_lists_only_authenticated(tmp_path, monkeypatch) -> None:
    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)
    service.config = SimpleNamespace(models={})
    monkeypatch.setattr(
        "rotaris_core.auth.provider_settings.get_provider_settings",
        lambda requested_id: SimpleNamespace(
            provider_id=requested_id,
            display_name="Rotaris Cloud (recommended)",
            authenticated=False,
        ),
    )
    monkeypatch.setattr(
        "rotaris_core.auth.provider_settings.list_provider_settings",
        lambda: (
            SimpleNamespace(provider_id="deepseek", display_name="DeepSeek", authenticated=False),
            SimpleNamespace(
                provider_id="openai-compatible--lab", display_name="Lab", authenticated=True
            ),
        ),
    )

    providers = {provider.id: provider for provider in service._providers()}

    assert set(providers) == {"concrete-cloud", "openai-compatible--lab"}
    assert providers["openai-compatible--lab"].user_defined is True
    assert providers["openai-compatible--lab"].quick_start_url is None


@verifies(SWR.SWR_2006)
def test_config_service_saves_workspace_overlay(tmp_path, monkeypatch) -> None:
    store = WorkspaceStore()
    store.model_slots = [("large_model", "provider/large")]
    store.model_slot_thinking = {"large_model": "high"}
    store.delegation.depth_cap = 5
    store.delegation.fanout_limit = 9
    store.runtime.iteration_cap = 31
    store.runtime.compression_threshold_pct = 72
    service = ConfigService(tmp_path, store)
    expected_config = object()
    monkeypatch.setattr("rotaris_core.config.loader.load_config", lambda _path: expected_config)

    service.save()

    payload = yaml.safe_load((tmp_path / ".rotaris" / "agents.yaml").read_text())
    assert payload["large_model"] == "provider/large"
    assert payload["large_model_thinking"] == "high"
    assert payload["runtime"]["max_depth"] == 5
    assert payload["runtime"]["max_active_children"] == 9
    assert payload["compressor"]["threshold_percentage"] == 72
    assert payload["rotaris"]["delegation_strategy"] == "orchestrator"
    assert service.config is expected_config


@verifies(SWR.SWR_2075)
def test_config_service_loads_persona_field_origins(tmp_path, monkeypatch) -> None:
    global_dir = tmp_path / "global"
    workspace_path = tmp_path / ".rotaris" / "agents.yaml"
    workspace_path.parent.mkdir()
    workspace_path.write_text(
        yaml.safe_dump(
            {
                "personas": {
                    "workspace-only": {"model": "base"},
                    "both": {"model": "base", "thinking": "high"},
                }
            }
        )
    )
    global_dir.mkdir()
    (global_dir / "agents.yaml").write_text(
        yaml.safe_dump(
            {
                "personas": {
                    "global-only": {"thinking": "low"},
                    "both": {"model": "base", "thinking": "medium"},
                }
            }
        )
    )
    monkeypatch.setattr("rotaris_core.config.paths.GLOBAL_CONFIG_DIR", global_dir)
    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)
    service.config = RotarisConfig(
        models={"base": ModelConfig(provider="test", model_id="base")},
        personas={
            name: PersonaConfig(name=name, model="base")
            for name in ("workspace-only", "global-only", "both", "neither")
        },
    )

    service._load_personas()

    origins = {
        persona.name: (persona.model_scope, persona.reasoning_scope) for persona in store.personas
    }
    assert origins == {
        "workspace-only": ("workspace", "default"),
        "global-only": ("default", "global"),
        "both": ("workspace", "workspace"),
        "neither": ("default", "default"),
    }


@verifies(SWR.SWR_2006)
def test_config_service_tolerates_malformed_scope_yaml(tmp_path, monkeypatch) -> None:
    workspace_path = tmp_path / ".rotaris" / "agents.yaml"
    workspace_path.parent.mkdir()
    workspace_path.write_text("personas: [not, a, mapping")
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    (global_dir / "agents.yaml").write_text("personas: definitely-not-a-mapping")
    monkeypatch.setattr("rotaris_core.config.paths.GLOBAL_CONFIG_DIR", global_dir)
    service = ConfigService(tmp_path, WorkspaceStore())

    assert service._raw_scope_personas() == ({}, {})


@verifies(SWR.SWR_2074)
def test_config_service_saves_personas_by_scope_and_reverse_maps_models(
    tmp_path, monkeypatch
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    (global_dir / "agents.yaml").write_text(
        yaml.safe_dump({"personas": {"global-agent": {"purpose": "keep me"}}})
    )
    monkeypatch.setattr("rotaris_core.config.paths.GLOBAL_CONFIG_DIR", global_dir)
    store = WorkspaceStore()
    store.model_slots = [("large_model", "base")]
    store.personas = [
        PersonaSpec(
            "workspace-agent",
            "",
            "large_model",
            "high",
            model_scope="workspace",
            reasoning_scope="workspace",
        ),
        PersonaSpec(
            "global-agent",
            "",
            "base",
            "low",
            model_scope="global",
            reasoning_scope="global",
        ),
    ]
    config = RotarisConfig(
        models={"base": ModelConfig(provider="test", model_id="base")},
        personas={
            name: PersonaConfig(name=name, model="base")
            for name in ("workspace-agent", "global-agent")
        },
    )
    service = ConfigService(tmp_path, store)
    service.config = config
    monkeypatch.setattr("rotaris_core.config.loader.load_config", lambda _path: config)

    service.save()

    workspace = yaml.safe_load((tmp_path / ".rotaris" / "agents.yaml").read_text())
    global_payload = yaml.safe_load((global_dir / "agents.yaml").read_text())
    assert workspace["personas"]["workspace-agent"] == {
        "model": "large_model",
        "thinking": "high",
    }
    assert global_payload["personas"]["global-agent"] == {
        "purpose": "keep me",
        "model": "base",
        "thinking": "low",
    }


@verifies(SWR.SWR_2074, SWR.SWR_2075, SWR.SWR_2076)
def test_config_service_keeps_workspace_and_global_persona_edits_independent(
    tmp_path, monkeypatch
) -> None:
    workspace_path = tmp_path / ".rotaris" / "agents.yaml"
    workspace_path.parent.mkdir()
    workspace_path.write_text(yaml.safe_dump({"personas": {"coder": {"model": "workspace-model"}}}))
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    global_path = global_dir / "agents.yaml"
    global_path.write_text(yaml.safe_dump({"personas": {"coder": {"model": "global-model"}}}))
    monkeypatch.setattr("rotaris_core.config.paths.GLOBAL_CONFIG_DIR", global_dir)
    store = WorkspaceStore()
    config = RotarisConfig(
        models={
            name: ModelConfig(provider="test", model_id=name)
            for name in ("workspace-model", "global-model", "new-global-model")
        },
        personas={"coder": PersonaConfig(name="coder", model="workspace-model")},
    )
    service = ConfigService(tmp_path, store)
    service.config = config
    service._load_personas()
    store.mark_settings_saved()

    assert store.persona_value("coder", "model", "workspace") == "workspace-model"
    assert store.persona_value("coder", "model", "global") == "global-model"

    store.set_persona_edit_scope("global")
    store.set_persona_model("coder", "new-global-model")
    monkeypatch.setattr("rotaris_core.config.loader.load_config", lambda _path: config)
    service.save()

    assert yaml.safe_load(workspace_path.read_text())["personas"]["coder"]["model"] == (
        "workspace-model"
    )
    assert yaml.safe_load(global_path.read_text())["personas"]["coder"]["model"] == (
        "new-global-model"
    )

    store.unset_persona_override("coder", "model")
    service.save()

    workspace_payload = yaml.safe_load(workspace_path.read_text())
    global_payload = yaml.safe_load(global_path.read_text()) or {}
    assert workspace_payload["personas"]["coder"]["model"] == "workspace-model"
    assert "coder" not in global_payload.get("personas", {})


@verifies(SWR.SWR_2096)
def test_config_service_hides_legacy_auto_as_provider_default(tmp_path, monkeypatch) -> None:
    workspace_path = tmp_path / ".rotaris" / "agents.yaml"
    workspace_path.parent.mkdir()
    workspace_path.write_text(
        yaml.safe_dump({"personas": {"coder": {"thinking": "auto"}}}),
        encoding="utf-8",
    )
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    monkeypatch.setattr("rotaris_core.config.paths.GLOBAL_CONFIG_DIR", global_dir)
    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)
    service.config = RotarisConfig(
        models={"base": ModelConfig(provider="openai", model_id="gpt-5")},
        personas={"coder": PersonaConfig(name="coder", model="base", thinking="auto")},
    )

    service._load_personas()

    assert store.persona_value("coder", "reasoning") == "provider_default"
    assert store.personas[0].reasoning == "provider_default"


@verifies(SWR.SWR_2074)
def test_config_service_unsets_only_workspace_persona_key(tmp_path, monkeypatch) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    global_payload = {"personas": {"coder": {"model": "global-model"}}}
    (global_dir / "agents.yaml").write_text(yaml.safe_dump(global_payload))
    monkeypatch.setattr("rotaris_core.config.paths.GLOBAL_CONFIG_DIR", global_dir)
    workspace_path = tmp_path / ".rotaris" / "agents.yaml"
    workspace_path.parent.mkdir()
    workspace_path.write_text(
        yaml.safe_dump({"personas": {"coder": {"model": "local-model", "tools": ["shell"]}}})
    )
    store = WorkspaceStore()
    store.personas = [PersonaSpec("coder", "", "local-model", "medium", model_scope="workspace")]
    store.unset_persona_override("coder", "model")
    config = RotarisConfig(
        models={"global-model": ModelConfig(provider="test", model_id="global")},
        personas={"coder": PersonaConfig(name="coder", model="global-model")},
    )
    service = ConfigService(tmp_path, store)
    service.config = config
    monkeypatch.setattr("rotaris_core.config.loader.load_config", lambda _path: config)

    service.save()

    workspace = yaml.safe_load(workspace_path.read_text())
    assert workspace["personas"]["coder"] == {"tools": ["shell"]}
    assert yaml.safe_load((global_dir / "agents.yaml").read_text()) == global_payload


@verifies(SWR.SWR_2023)
def test_config_service_builds_slot_thinking_into_runtime_model(tmp_path) -> None:
    store = WorkspaceStore()
    store.model_slots = [("large_model", "new-large")]
    store.model_slot_thinking = {"large_model": "max"}
    service = ConfigService(tmp_path, store)
    service.config = RotarisConfig(
        large_model="old-large",
        models={
            "old-large": ModelConfig(provider="openai", model_id="gpt-5-mini"),
            "new-large": ModelConfig(provider="openai", model_id="gpt-5"),
        },
        personas={"orchestrator": PersonaConfig(name="orchestrator", model="old-large")},
    )

    config = service.build_run_config()

    synthetic = "__startup_slot__:large_model"
    assert config.large_model == synthetic
    assert config.models[synthetic].thinking == "max"
    assert config.personas["orchestrator"].model == synthetic
    assert synthetic not in service.config.models


@verifies(SWR.SWR_2123)
def test_refresh_improvement_proposals_loads_workspace_artifact(tmp_path) -> None:
    _write_improvement_artifact(tmp_path)
    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)

    service.refresh_improvement_proposals()

    assert len(store.improvement_proposals) == 1
    proposal = store.improvement_proposals[0]
    assert proposal.id == "imp_00000001"
    assert proposal.artifact_id == "impart_00000001"
    assert proposal.category == "workspace_note"
    assert proposal.summary == "Cache LSP diagnostics between tester runs"
    assert proposal.status == "pending_review"


@verifies(SWR.SWR_2123)
def test_refresh_improvement_proposals_loads_all_workspace_artifacts(tmp_path) -> None:
    _write_improvement_artifact(tmp_path, artifact_id="impart_00000001", proposal_id="imp_a")
    _write_improvement_artifact(tmp_path, artifact_id="impart_00000002", proposal_id="imp_b")
    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)

    service.refresh_improvement_proposals()

    assert {p.id for p in store.improvement_proposals} == {"imp_a", "imp_b"}
    assert {p.artifact_id for p in store.improvement_proposals} == {
        "impart_00000001",
        "impart_00000002",
    }


@verifies(SWR.SWR_2123)
def test_refresh_improvement_proposals_empty_workspace_yields_no_proposals(tmp_path) -> None:
    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)

    service.refresh_improvement_proposals()

    assert store.improvement_proposals == []


@verifies(SWR.SWR_2123)
def test_set_proposal_status_persists_to_disk_and_updates_store(tmp_path) -> None:
    _write_improvement_artifact(tmp_path)
    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)
    service.refresh_improvement_proposals()

    service.set_proposal_status("impart_00000001", "imp_00000001", "approved")

    assert store.improvement_proposals[0].status == "approved"
    reloaded = load_improvement_artifact(tmp_path, "impart_00000001")
    assert reloaded.proposals[0].status == ApprovalStatus.APPROVED


@verifies(SWR.SWR_2123)
def test_set_proposal_status_missing_proposal_raises_key_error(tmp_path) -> None:
    _write_improvement_artifact(tmp_path)
    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)

    with pytest.raises(KeyError):
        service.set_proposal_status("impart_00000001", "imp_missing", "approved")


@verifies(SWR.SWR_2123)
def test_update_proposal_persists_to_disk_and_updates_store(tmp_path) -> None:
    _write_improvement_artifact(tmp_path)
    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)
    service.refresh_improvement_proposals()

    service.update_proposal(
        "impart_00000001",
        "imp_00000001",
        summary="revised summary",
        recommended_action="revised action",
    )

    assert store.improvement_proposals[0].summary == "revised summary"
    assert store.improvement_proposals[0].recommended_action == "revised action"
    reloaded = load_improvement_artifact(tmp_path, "impart_00000001")
    assert reloaded.proposals[0].summary == "revised summary"


@verifies(SWR.SWR_2123)
def test_update_proposal_missing_proposal_raises_key_error(tmp_path) -> None:
    _write_improvement_artifact(tmp_path)
    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)

    with pytest.raises(KeyError):
        service.update_proposal(
            "impart_00000001", "imp_missing", summary="x", recommended_action="y"
        )


@verifies(SWR.SWR_2123)
def test_delete_proposal_persists_to_disk_and_updates_store(tmp_path) -> None:
    _write_improvement_artifact(tmp_path)
    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)
    service.refresh_improvement_proposals()

    service.delete_proposal("impart_00000001", "imp_00000001")

    assert store.improvement_proposals == []
    reloaded = load_improvement_artifact(tmp_path, "impart_00000001")
    assert reloaded.proposals == []


@verifies(SWR.SWR_2123)
def test_delete_proposal_missing_proposal_raises_key_error(tmp_path) -> None:
    _write_improvement_artifact(tmp_path)
    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)

    with pytest.raises(KeyError):
        service.delete_proposal("impart_00000001", "imp_missing")


@verifies(SWR.SWR_2123)
def test_store_set_improvement_proposals_emits_signal() -> None:
    store = WorkspaceStore()
    seen: list[bool] = []
    store.improvement_proposals_changed.connect(lambda: seen.append(True))

    store.set_improvement_proposals(
        [
            ImprovementProposal(
                id="imp_1",
                artifact_id="impart_1",
                category="workspace_note",
                summary="x",
                status="pending_review",
            )
        ]
    )

    assert store.improvement_proposals[0].id == "imp_1"
    assert seen == [True]


@verifies(SWR.SWR_2006)
def test_config_service_builds_isolated_runtime_overrides(tmp_path) -> None:
    store = WorkspaceStore()
    store.model_slots = [("large_model", "new-large")]
    store.delegation.strategy = "single"
    store.delegation.depth_cap = 6
    store.delegation.fanout_limit = 11
    store.runtime.circuit_breaker = False
    store.mcp_servers = [McpServer("browser", "stdio", enabled=False)]
    service = ConfigService(tmp_path, store)
    service.config = RotarisConfig(
        large_model="old-large",
        models={
            "old-large": ModelConfig(provider="test", model_id="old"),
            "new-large": ModelConfig(provider="test", model_id="new"),
        },
        personas={
            "orchestrator": PersonaConfig(
                name="orchestrator",
                model="old-large",
                tools=["delegate", "shell"],
                mcp_servers=["browser"],
            )
        },
        mcp_servers={"browser": MCPServerConfig(command="browser-server")},
        circuit_breaker=CircuitBreakerConfig(enabled=True),
    )

    config = service.build_run_config()

    assert config.large_model == "new-large"
    assert config.personas["orchestrator"].model == "new-large"
    assert config.personas["orchestrator"].tools == ["shell"]
    assert config.personas["orchestrator"].mcp_servers == []
    assert config.mcp_servers == {}
    assert config.runtime.max_depth == 6
    assert config.runtime.max_active_children == 11
    assert config.circuit_breaker.enabled is False
    assert service.config.large_model == "old-large"
    assert service.config.circuit_breaker.enabled is True


@verifies(SWR.SWR_226, SWR.SWR_227)
def test_config_service_loads_and_saves_circuit_breaker_toggle(tmp_path, monkeypatch) -> None:
    workspace_config_dir = tmp_path / ".rotaris"
    workspace_config_dir.mkdir()
    (workspace_config_dir / "agents.yaml").write_text(
        yaml.safe_dump({"circuit_breaker": {"enabled": False}}),
        encoding="utf-8",
    )

    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)
    config = RotarisConfig(circuit_breaker=CircuitBreakerConfig(enabled=False))
    service.config = config
    monkeypatch.setattr("rotaris_core.config.loader.load_config", lambda _path: config)

    service.load()

    assert store.runtime.circuit_breaker is False

    store.runtime.circuit_breaker = True
    service.save()

    saved = yaml.safe_load((workspace_config_dir / "agents.yaml").read_text(encoding="utf-8"))
    assert saved["circuit_breaker"]["enabled"] is True


@verifies(SWR.SWR_2006, SWR.SWR_2072)
def test_config_service_applies_workspace_model_to_default_persona_only(tmp_path) -> None:
    store = WorkspaceStore()
    store.set_active_model("codex/gpt-5")
    service = ConfigService(tmp_path, store)
    service.config = RotarisConfig(
        default_persona="orchestrator",
        models={
            "old-large": ModelConfig(provider="test", model_id="old"),
            "codex/gpt-5": ModelConfig(provider="openai", auth_provider="codex", model_id="gpt-5"),
        },
        personas={
            "orchestrator": PersonaConfig(name="orchestrator", model="old-large"),
            "coder": PersonaConfig(name="coder", model="old-large"),
        },
    )

    config = service.build_run_config()

    # The workspace model dropdown overrides only the default/top-level
    # persona the user talks to; delegated children keep their configured
    # model so mission control reflects what each agent actually runs.
    assert config.personas["orchestrator"].model == "codex/gpt-5"
    assert config.personas["coder"].model == "old-large"


@verifies(SWR.SWR_2095)
def test_config_service_exposes_codex_subscription_windows(tmp_path, monkeypatch) -> None:
    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)
    monkeypatch.setattr(
        "rotaris_core.auth.storage.TokenStorage.load", lambda _self, _provider: None
    )
    service.config = RotarisConfig(
        models={
            "codex/gpt-5": ModelConfig(provider="openai", auth_provider="codex", model_id="gpt-5")
        }
    )

    limits = service._subscription_limits()

    assert [limit.label for limit in limits] == ["Codex usage"]
    assert limits[0].used_label == "Usage unavailable"


@verifies(SWR.SWR_2095)
def test_config_service_exposes_claude_code_subscription_windows(tmp_path, monkeypatch) -> None:
    from rotaris_core.providers.subscription_usage import ProviderSubscriptionLimit

    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)
    service.config = RotarisConfig(
        models={
            "claude-code/opus": ModelConfig(
                provider="anthropic", auth_provider="claude-code", model_id="opus"
            )
        }
    )
    tokens = TokenSet(access_token="sk-ant-oat01-token", refresh_token="")
    monkeypatch.setattr(
        "rotaris_core.auth.storage.TokenStorage.load", lambda _self, _provider: tokens
    )
    monkeypatch.setattr(
        "rotaris_core.providers.subscription_usage.fetch_provider_subscription_limits",
        lambda _provider, _tokens: [
            ProviderSubscriptionLimit(
                "Claude Code 5-hour window", "37% used", 37, "63% remaining · resets in 2h 30m"
            ),
            ProviderSubscriptionLimit(
                "Claude Code 7-day window", "61% used", 61, "39% remaining · resets in 2d 14h"
            ),
        ],
    )

    limits = service._subscription_limits()

    assert [(limit.label, limit.pct, limit.detail) for limit in limits] == [
        ("Claude Code 5-hour window", 37, "63% remaining · resets in 2h 30m"),
        ("Claude Code 7-day window", 61, "39% remaining · resets in 2d 14h"),
    ]


@verifies(SWR.SWR_2095)
def test_config_service_degrades_claude_code_limits_without_a_token(tmp_path, monkeypatch) -> None:
    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)
    monkeypatch.setattr(
        "rotaris_core.auth.storage.TokenStorage.load", lambda _self, _provider: None
    )
    service.config = RotarisConfig(
        models={
            "claude-code/opus": ModelConfig(
                provider="anthropic", auth_provider="claude-code", model_id="opus"
            )
        }
    )

    limits = service._subscription_limits()

    assert [limit.label for limit in limits] == ["Claude Code usage"]
    assert limits[0].used_label == "Usage unavailable"


@verifies(SWR.SWR_2095)
def test_config_service_maps_live_provider_subscription_usage(tmp_path, monkeypatch) -> None:
    from rotaris_core.providers.subscription_usage import ProviderSubscriptionLimit

    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)
    service.config = RotarisConfig(
        models={
            "codex/gpt-5": ModelConfig(provider="openai", auth_provider="codex", model_id="gpt-5")
        }
    )
    tokens = TokenSet(access_token="access", refresh_token="refresh")
    monkeypatch.setattr(
        "rotaris_core.auth.storage.TokenStorage.load", lambda _self, _provider: tokens
    )
    monkeypatch.setattr(
        "rotaris_core.providers.subscription_usage.fetch_provider_subscription_limits",
        lambda _provider, _tokens: [
            ProviderSubscriptionLimit(
                "Codex 5-hour window",
                "42% used",
                42,
                "58% remaining · resets in 2h",
            )
        ],
    )

    limits = service._subscription_limits()

    assert (limits[0].used_label, limits[0].pct, limits[0].detail) == (
        "42% used",
        42,
        "58% remaining · resets in 2h",
    )


@verifies(SWR.SWR_2095)
def test_config_service_refresh_subscription_limits_matches_internal_computation(
    tmp_path, monkeypatch
) -> None:
    from rotaris_core.providers.subscription_usage import ProviderSubscriptionLimit

    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)
    service.config = RotarisConfig(
        models={
            "codex/gpt-5": ModelConfig(provider="openai", auth_provider="codex", model_id="gpt-5")
        }
    )
    tokens = TokenSet(access_token="access", refresh_token="refresh")
    monkeypatch.setattr(
        "rotaris_core.auth.storage.TokenStorage.load", lambda _self, _provider: tokens
    )
    monkeypatch.setattr(
        "rotaris_core.providers.subscription_usage.fetch_provider_subscription_limits",
        lambda _provider, _tokens: [
            ProviderSubscriptionLimit("Codex 5-hour window", "10% used", 10, "90% remaining"),
        ],
    )

    refreshed = service.refresh_subscription_limits()

    assert refreshed == service._subscription_limits()
    assert (refreshed[0].used_label, refreshed[0].pct) == ("10% used", 10)


@verifies(SWR.SWR_2040, SWR.SWR_2041)
def test_config_service_health_check_calls_live_provider_validation(tmp_path, monkeypatch) -> None:
    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)
    settings = SimpleNamespace(
        provider_id="deepseek",
        display_name="DeepSeek",
        auth_flow=AuthFlowType.API_KEY,
    )
    validation_calls: list[str] = []

    async def authenticated(_manager, provider_id: str) -> AuthStatus:
        assert provider_id == "deepseek"
        return AuthStatus.AUTHENTICATED

    monkeypatch.setattr(
        "rotaris_core.auth.provider_settings.get_provider_settings", lambda _provider_id: settings
    )
    monkeypatch.setattr("rotaris_core.auth.manager.AuthManager.check_status", authenticated)
    monkeypatch.setattr(
        "rotaris_core.auth.provider_settings.validate_provider",
        lambda provider_id: (
            validation_calls.append(provider_id)
            or SimpleNamespace(success=True, message="Validated DeepSeek; discovered 4 models.")
        ),
    )

    result = service.check_provider_health("deepseek")

    assert result.status == "healthy"
    assert result.connected is True
    assert validation_calls == ["deepseek"]


@verifies(SWR.SWR_3711)
def test_config_service_health_check_survives_a_running_event_loop(tmp_path, monkeypatch) -> None:
    """A health check reached from async code must not fail on the loop it is in.

    ``asyncio.run`` refuses to start inside a running loop, and it refuses
    *before* awaiting — which used to abandon the status coroutine and report a
    stray "never awaited" warning somewhere else entirely.
    """
    import asyncio

    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)
    settings = SimpleNamespace(
        provider_id="deepseek",
        display_name="DeepSeek",
        auth_flow=AuthFlowType.API_KEY,
    )

    async def authenticated(_manager, provider_id: str) -> AuthStatus:
        return AuthStatus.AUTHENTICATED

    monkeypatch.setattr(
        "rotaris_core.auth.provider_settings.get_provider_settings", lambda _provider_id: settings
    )
    monkeypatch.setattr("rotaris_core.auth.manager.AuthManager.check_status", authenticated)
    monkeypatch.setattr(
        "rotaris_core.auth.provider_settings.validate_provider",
        lambda _provider_id: SimpleNamespace(success=True, message="Validated DeepSeek."),
    )

    async def check_from_inside_a_loop() -> str:
        return service.check_provider_health("deepseek").status

    assert asyncio.run(check_from_inside_a_loop()) == "healthy"


@verifies(SWR.SWR_2040, SWR.SWR_2041)
def test_config_service_health_check_refreshes_models_without_rebuilding_providers(
    tmp_path, monkeypatch
) -> None:
    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)
    existing_providers = [
        ProviderInfo("openai", "OpenAI", True, "Connected", "healthy", "api_key"),
        ProviderInfo("anthropic", "Anthropic", True, "Connected", "healthy", "api_key"),
    ]
    store.providers = existing_providers
    refreshed_config = RotarisConfig(
        models={
            "openai/new-model": ModelConfig(provider="openai", model_id="new-model"),
        }
    )
    settings = SimpleNamespace(
        provider_id="openai",
        display_name="OpenAI",
        auth_flow=AuthFlowType.API_KEY,
    )

    async def authenticated(_manager, provider_id: str) -> AuthStatus:
        assert provider_id == "openai"
        return AuthStatus.AUTHENTICATED

    monkeypatch.setattr(
        "rotaris_core.auth.provider_settings.get_provider_settings", lambda _provider_id: settings
    )
    monkeypatch.setattr("rotaris_core.auth.manager.AuthManager.check_status", authenticated)
    monkeypatch.setattr(
        "rotaris_core.auth.provider_settings.validate_provider",
        lambda _provider_id: SimpleNamespace(success=True, message="Validated OpenAI."),
    )
    monkeypatch.setattr(
        "rotaris_core.config.loader.load_config", lambda _workspace: refreshed_config
    )
    monkeypatch.setattr(service, "_providers", lambda: pytest.fail("providers rebuilt"))

    result = service.check_provider_health("openai")

    assert result.status == "healthy"
    assert store.providers is existing_providers
    assert store.model_catalog == ["openai/new-model"]


@verifies(SWR.SWR_2812, SWR.SWR_2814)
def test_config_service_projects_refused_models_into_the_picker(tmp_path, monkeypatch) -> None:
    """Productive use: a Copilot account with a model switched off opens the app.
    Expected outcome: the model reaches the pickers as an unselectable entry
    carrying its reason, and never counts as a model the workspace has."""
    reason = "Your provider account has this model switched off."
    config = RotarisConfig(
        models={"copilot/gpt-5": ModelConfig(provider="copilot", model_id="gpt-5")},
        unavailable_models={
            "copilot/gpt-5.6-sol": UnavailableModel(
                id="gpt-5.6-sol",
                auth_provider="copilot",
                reason_code="policy_disabled",
                reason=reason,
            )
        },
    )
    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)
    monkeypatch.setattr("rotaris_core.config.loader.load_config", lambda _workspace: config)

    service.refresh_provider_catalog()

    assert [option.name for option in store.model_options] == [
        "copilot/gpt-5",
        "copilot/gpt-5.6-sol",
    ]
    assert store.model_options[1].available is False
    assert store.model_options[1].reason == reason
    assert store.model_catalog == ["copilot/gpt-5"]


@verifies(SWR.SWR_2043)
def test_config_service_health_check_marks_missing_auth_red(tmp_path, monkeypatch) -> None:
    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)
    settings = SimpleNamespace(display_name="DeepSeek", auth_flow=AuthFlowType.API_KEY)

    async def unauthenticated(_manager, _provider_id: str) -> AuthStatus:
        return AuthStatus.UNAUTHENTICATED

    monkeypatch.setattr(
        "rotaris_core.auth.provider_settings.get_provider_settings", lambda _provider_id: settings
    )
    monkeypatch.setattr("rotaris_core.auth.manager.AuthManager.check_status", unauthenticated)

    result = service.check_provider_health("deepseek")

    assert result.status == "unauthenticated"
    assert result.connected is False
    assert result.detail == "Not authenticated."


@verifies(SWR.SWR_2042, SWR.SWR_2043)
def test_config_service_oauth_reauthentication_forwards_device_prompt(
    tmp_path, monkeypatch
) -> None:
    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)
    settings = SimpleNamespace(
        display_name="GitHub Copilot",
        auth_flow=AuthFlowType.DEVICE_CODE,
    )
    prompts: list[object] = []
    logged_out: list[str] = []

    async def authenticate(
        _manager, provider_id: str, *, on_prompt, cancel_event=None
    ) -> AuthResult:
        assert provider_id == "copilot"
        await on_prompt(DeviceCodePrompt("https://github.com/login/device", "ABCD", 5, 900))
        return AuthResult(True, TokenSet("token", "refresh"))

    monkeypatch.setattr(
        "rotaris_core.auth.provider_settings.get_provider_settings", lambda _provider_id: settings
    )
    monkeypatch.setattr("rotaris_core.auth.manager.AuthManager.authenticate", authenticate)
    monkeypatch.setattr(
        "rotaris_core.auth.manager.AuthManager.logout",
        lambda _manager, provider_id: logged_out.append(provider_id),
    )
    monkeypatch.setattr(
        "rotaris_core.auth.provider_settings.validate_provider",
        lambda _provider_id: SimpleNamespace(success=True, message="Validated."),
    )
    monkeypatch.setattr(
        service,
        "check_provider_health",
        lambda provider_id: ProviderInfo(
            provider_id, "GitHub Copilot", True, "Validated.", "healthy", "device_code"
        ),
    )

    result = service.authenticate_provider(
        "copilot",
        reauth=True,
        on_prompt=prompts.append,
    )

    assert result.status == "healthy"
    assert logged_out == ["copilot"]
    assert isinstance(prompts[0], DeviceCodePrompt)


@pytest.mark.asyncio
@verifies(SWR.SWR_2007)
async def test_session_observer_persists_live_child_and_todo_snapshots() -> None:
    class FakeRecord:
        canonical_name = "coder-1"

        def model_dump(self, *, mode: str):
            assert mode == "json"
            return {"canonical_name": self.canonical_name, "state": "running"}

    class FakeTodo:
        def model_dump(self, *, mode: str):
            assert mode == "json"
            return {"phases": []}

    class FakePersister:
        def __init__(self) -> None:
            self.saves = 0

        def request_save(self, _state) -> None:
            self.saves += 1

    record = FakeRecord()
    manager = SimpleNamespace(
        snapshot_children=lambda: [record],
        persister=FakePersister(),
    )
    state = SimpleNamespace(
        child_states=[],
        todo_state=None,
        agent_todo_state=None,
        agent_metrics={},
        transcript_events=[],
    )
    observer = _SessionObserver(asyncio.get_running_loop(), manager, state)
    cancelled: list[tuple[object, str]] = []

    class FakeScheduler:
        async def cancel_child(self, child_manager, agent_id: str) -> bool:
            cancelled.append((child_manager, agent_id))
            return True

    observer.bind_ralph_loop(SimpleNamespace(scheduler=FakeScheduler()))

    observer.on_child_created(record, manager, FakeTodo())
    assert observer.cancel_agent("coder-1") is True
    await asyncio.sleep(0.01)

    assert state.child_states == [
        {"canonical_name": "coder-1", "state": "running", "active_tools": []}
    ]
    assert state.todo_state == {"phases": []}
    assert manager.persister.saves == 1
    assert cancelled == [(manager, "coder-1")]


@verifies(SWR.SWR_561)
@pytest.mark.asyncio
async def test_session_observer_persists_terminal_child_state() -> None:
    """Productive use: a desktop user can reopen a live session after delegated work completes.
    Expected outcome: the persisted child snapshot reports the completed child, not a stale runner."""

    class FakePersister:
        def __init__(self) -> None:
            self.saves = 0

        def request_save(self, _state) -> None:
            self.saves += 1

    observer_holder: dict[str, _SessionObserver] = {}
    manager = ChildManager(
        parent_agent_id="root",
        current_depth=0,
        policy=RuntimePolicy(max_children=4, max_depth=3),
        terminal_state_callback=lambda record: observer_holder["observer"].on_child_terminal(
            record,
            manager,
        ),
    )
    manager.persister = FakePersister()
    state = SimpleNamespace(
        child_states=[],
        todo_state=None,
        agent_todo_state=None,
        agent_metrics={},
        transcript_events=[],
    )
    observer = _SessionObserver(asyncio.get_running_loop(), manager, state)
    observer_holder["observer"] = observer
    record = manager.spawn_child("analyst", "codebase-analyst", "survey", run_in_background=True)

    observer.on_child_created(
        record, manager, SimpleNamespace(model_dump=lambda **_: {"phases": []})
    )
    record.transition(ChildTaskState.RUNNING)
    manager.bump_version()
    observer.on_child_running(record, manager)
    await asyncio.sleep(0)
    # A call the child never got to finish. The in-flight set belongs to the
    # session's transcript recorder now (SWR-2454), which is what the observer
    # asks when it writes an agent's chips into the child state.
    observer._recorder._active_tool_calls[record.canonical_name] = {"call-1": "haet_read"}

    manager.mark_child_terminal(
        record.canonical_name,
        ChildTaskState.SUCCEEDED,
        ChildReportArtifact(
            agent_name=record.canonical_name,
            persona=record.persona,
            status="succeeded",
            summary="Survey complete.",
        ),
    )
    await asyncio.sleep(0)

    persisted = state.child_states[0]
    assert persisted["state"] == "succeeded"
    assert persisted["completed_at"] is not None
    assert persisted["active_tools"] == []
    assert manager.persister.saves == 3


@verifies(SWR.SWR_2007)
def test_bind_scheduler_callbacks_wires_the_ralph_scheduler_not_the_child_manager() -> None:
    # ChildManager (the `manager` RalphLoop._run_iteration hands to
    # bind_scheduler_callbacks) has no `.scheduler` attribute — the live
    # Scheduler instance only lives on the RalphLoop bound via bind_ralph_loop.
    # Regression guard for a crash that killed every run before the first
    # streamed token ever reached the UI.
    manager_without_scheduler_attr = SimpleNamespace()
    state = SimpleNamespace(transcript_events=[])
    observer = _SessionObserver(SimpleNamespace(), SimpleNamespace(), state)
    scheduler = SimpleNamespace(
        _conversation_event_callback=None, _conversation_token_callback=None
    )
    observer.bind_ralph_loop(SimpleNamespace(scheduler=scheduler))

    observer.bind_scheduler_callbacks(manager_without_scheduler_attr)

    assert callable(scheduler._conversation_event_callback)
    # No token callback any more: streamed tokens reach the session's transcript
    # recorder from inside the engine (SWR-2454), so this host has nothing left
    # to do with one. The event callback stays for what is still the host's —
    # the token accounting and the agent tree.
    assert scheduler._conversation_token_callback is None
    assert callable(scheduler._spawn_notification_callback)


@verifies(SWR.SWR_2007)
def test_conversation_event_updates_context_tokens_while_agent_is_running() -> None:
    class FakePersister:
        def __init__(self) -> None:
            self.saves = 0

        def request_save(self, _state) -> None:
            self.saves += 1

    loop = SimpleNamespace(call_soon_threadsafe=lambda fn, *args: fn(*args))
    manager = SimpleNamespace(snapshot_children=list, persister=FakePersister())
    state = SimpleNamespace(
        agent_metrics={},
        root_context_tokens=0,
        child_states=[],
        transcript_events=[],
    )
    observer = _SessionObserver(loop, manager, state)
    llm = SimpleNamespace(
        metrics=SimpleNamespace(
            token_usages=[SimpleNamespace(prompt_tokens=42_000)],
        )
    )
    scheduler = SimpleNamespace(
        _conversation_event_callback=None,
        _conversation_token_callback=None,
        _active_conversations={"coder-1": SimpleNamespace(agent=SimpleNamespace(llm=llm))},
    )
    observer.bind_ralph_loop(SimpleNamespace(scheduler=scheduler))
    observer.bind_scheduler_callbacks(manager)

    scheduler._conversation_event_callback(
        SimpleNamespace(canonical_name="coder-1", persona="coder"),
        object(),
    )

    assert state.agent_metrics["coder-1"].last_prompt_tokens == 42_000
    assert state.root_context_tokens == 42_000
    assert manager.persister.saves >= 1


@verifies(SWR.SWR_2024)
def test_run_worker_pause_requests_graceful_shutdown_on_bound_ralph_loop() -> None:
    calls: list[dict[str, object]] = []
    ralph = SimpleNamespace(request_shutdown=lambda **kwargs: calls.append(kwargs))
    worker = _RunWorker.__new__(_RunWorker)
    worker._observer = SimpleNamespace(ralph=ralph)

    assert worker.pause() is True
    assert calls == [{"force": False}]


@verifies(SWR.SWR_2024)
def test_run_worker_pause_returns_false_without_bound_ralph_loop() -> None:
    worker = _RunWorker.__new__(_RunWorker)
    worker._observer = None

    assert worker.pause() is False


@verifies(SWR.SWR_2024)
def test_run_bridge_pause_delegates_to_worker_when_running() -> None:
    calls: list[str] = []
    bridge = RunBridge.__new__(RunBridge)
    bridge._run_active = True
    bridge._worker = SimpleNamespace(pause=lambda: calls.append("paused") or True)

    assert bridge.pause() is True
    assert calls == ["paused"]


@verifies(SWR.SWR_2024)
def test_run_bridge_pause_returns_false_when_not_running() -> None:
    bridge = RunBridge.__new__(RunBridge)
    bridge._run_active = False
    bridge._worker = None

    assert bridge.pause() is False


@verifies(SWR.SWR_2122)
def test_run_bridge_pause_agent_only_supports_orchestrator() -> None:
    calls: list[str] = []
    bridge = RunBridge.__new__(RunBridge)
    bridge._run_active = True
    bridge._worker = SimpleNamespace(pause=lambda: calls.append("paused") or True)

    assert bridge.pause_agent("coder-1") is False
    assert calls == []
    assert bridge.pause_agent("orchestrator") is True
    assert calls == ["paused"]


# ── truthful model/reasoning controls workstream ──────────────────────────


@verifies(SWR.SWR_2085)
def test_session_observer_switch_entry_reasoning_sets_override_and_posts_system_message() -> None:
    """Verify switch_entry_reasoning sets entry_reasoning_override on the
    observer and posts a system transcript row."""
    events: list[tuple] = []

    def fake_call_soon_threadsafe(fn, *args, **kwargs) -> None:
        events.append((fn, args, kwargs))
        fn(*args, **kwargs)

    loop = SimpleNamespace(call_soon_threadsafe=fake_call_soon_threadsafe)

    class FakePersister:
        def __init__(self) -> None:
            self.saves = 0

        def request_save(self, _state) -> None:
            self.saves += 1

    state = SimpleNamespace(transcript_events=[])
    manager = SimpleNamespace(persister=FakePersister())
    observer = _SessionObserver(loop, manager, state)

    observer.switch_entry_reasoning("low")

    assert observer.entry_reasoning_override == "low"
    assert len(state.transcript_events) == 1
    row = state.transcript_events[0]
    assert row["role"] == "system"
    assert "Switching to reasoning low" in row["content"]
    assert "next iteration" in row["content"]
    assert manager.persister.saves >= 1


@verifies(SWR.SWR_2085)
def test_run_bridge_switch_entry_reasoning_returns_true_when_running() -> None:
    """RunBridge.switch_entry_reasoning delegates to the worker and returns
    True when a run is active."""
    bridge = RunBridge.__new__(RunBridge)
    bridge._run_active = True
    calls: list[str] = []
    bridge._worker = SimpleNamespace(
        switch_entry_reasoning=lambda reasoning: calls.append(reasoning) or True
    )

    assert bridge.switch_entry_reasoning("low") is True
    assert calls == ["low"]


@verifies(SWR.SWR_2085)
def test_run_bridge_switch_entry_reasoning_returns_false_when_worker_absent() -> None:
    bridge = RunBridge.__new__(RunBridge)
    bridge._run_active = True
    bridge._worker = None

    assert bridge.switch_entry_reasoning("low") is False


@verifies(SWR.SWR_2085)
def test_run_bridge_switch_entry_reasoning_returns_false_when_idle() -> None:
    bridge = RunBridge.__new__(RunBridge)
    bridge._run_active = False

    assert bridge.switch_entry_reasoning("low") is False


@verifies(SWR.SWR_2085)
def test_run_bridge_switch_entry_reasoning_returns_false_for_empty_string() -> None:
    bridge = RunBridge.__new__(RunBridge)
    bridge._run_active = True
    bridge._worker = SimpleNamespace(switch_entry_reasoning=lambda r: True)

    assert bridge.switch_entry_reasoning("") is False


@verifies(SWR.SWR_2085)
def test_run_bridge_switch_entry_model_gates_identically_to_reasoning() -> None:
    """switch_entry_model and switch_entry_reasoning share the same gating
    (running + worker present + non-empty value). Verify switch_entry_model
    matches."""
    bridge = RunBridge.__new__(RunBridge)
    bridge._run_active = True
    bridge._worker = SimpleNamespace(switch_entry_model=lambda m: True)

    assert bridge.switch_entry_model("copilot/gpt-5") is True

    bridge._run_active = False
    assert bridge.switch_entry_model("copilot/gpt-5") is False


@verifies(SWR.SWR_2007)
def test_run_bridge_keeps_thread_references_when_bounded_join_times_out() -> None:
    """Productive use: a user closes Rotaris while a run refuses to stop promptly.
    Expected outcome: a timed-out join keeps the thread and worker so shutdown can retry."""
    thread = SimpleNamespace(wait=lambda _timeout: False)
    worker = object()
    bridge = RunBridge.__new__(RunBridge)
    bridge._thread = thread
    bridge._worker = worker

    assert bridge._join_thread() is False
    assert bridge._thread is thread
    assert bridge._worker is worker


@verifies(SWR.SWR_2007)
def test_run_bridge_unbounded_join_releases_finished_thread() -> None:
    """Productive use: a user quits Rotaris after the run has actually stopped.
    Expected outcome: the unbounded join waits once and releases thread and worker."""
    waits: list[bool] = []
    thread = SimpleNamespace(wait=lambda: waits.append(True) or True)
    bridge = RunBridge.__new__(RunBridge)
    bridge._thread = thread
    bridge._worker = object()

    assert bridge._join_thread(timeout_ms=None) is True
    assert waits == [True]
    assert bridge._thread is None
    assert bridge._worker is None


# ── a session that is not running shows no live agent (SWR-2907) ─────────────


def _session_with_a_running_child(execution_status: str) -> SessionState:
    """A snapshot whose header and agent rows disagree, exactly as one on disk can."""
    now = dt.datetime.now(dt.UTC)
    return SessionState(
        session_id="session-settled",
        workspace_root="/workspace",
        created_at=now,
        updated_at=now,
        execution_status=execution_status,
        child_states=[
            {
                "canonical_name": "take-the-next-open-requirement",
                "name": "take-the-next-open-requirement",
                "persona": "orchestrator",
                "state": "running",
                "active_tools": ["delegate"],
                "task_payload": "Coordinating the run",
            },
            {
                "canonical_name": "implement-swr-167",
                "name": "implement-swr-167",
                "persona": "coder",
                "state": "queued",
                "task_payload": "Implement it",
            },
            {
                "canonical_name": "next-open-requirement",
                "name": "next-open-requirement",
                "persona": "requirements",
                "state": "succeeded",
                "task_payload": "Find the next one",
            },
        ],
    )


@verifies(SWR.SWR_2913)
def test_a_finished_session_projects_no_live_agent() -> None:
    """Productive use: a user reads a finished run and the agent list agrees with the header.
    Expected outcome: nothing pulses, nothing claims to run, and the counter reads zero."""
    projection = build_session_projection(
        _session_with_a_running_child("completed"),
        RotarisConfig(),
        SessionProjectionContext(),
        [],
    )

    assert not any(agent.is_live for agent in projection.agents)
    settled = {agent.id: agent for agent in projection.agents}
    assert settled["take-the-next-open-requirement"].state.value == "done"
    assert settled["implement-swr-167"].state.value == "done"
    # A stopped agent holding a live tool chip is the same contradiction.
    assert settled["take-the-next-open-requirement"].active_tools == []
    assert settled["take-the-next-open-requirement"].activity == "ended with the run"
    # An agent that really did finish keeps its own outcome and its own line.
    assert settled["next-open-requirement"].state.value == "done"
    assert settled["next-open-requirement"].activity == "Find the next one"


@verifies(SWR.SWR_2913)
def test_a_failed_session_projects_its_unfinished_agents_as_failed() -> None:
    """Productive use: a user opens a run that died and sees which agents went down with it."""
    projection = build_session_projection(
        _session_with_a_running_child("failed"),
        RotarisConfig(),
        SessionProjectionContext(),
        [],
    )

    settled = {agent.id: agent for agent in projection.agents}
    assert settled["take-the-next-open-requirement"].state.value == "failed"
    assert settled["implement-swr-167"].state.value == "failed"


@verifies(SWR.SWR_2913)
def test_a_cancelled_session_projects_its_unfinished_agents_as_cancelled() -> None:
    """A paused or interrupted run is stopped too; its agents must not pulse either."""
    for status in ("paused", "interrupted", "cancelled"):
        projection = build_session_projection(
            _session_with_a_running_child(status),
            RotarisConfig(),
            SessionProjectionContext(),
            [],
        )

        settled = {agent.id: agent for agent in projection.agents}
        assert settled["take-the-next-open-requirement"].state.value == "cancelled", status
        assert not any(agent.is_live for agent in projection.agents), status


@verifies(SWR.SWR_2913)
def test_a_session_that_has_not_started_keeps_its_agents_as_they_are() -> None:
    """`idle` is the status before a run, not an outcome — there is no ending to give."""
    projection = build_session_projection(
        _session_with_a_running_child("idle"),
        RotarisConfig(),
        SessionProjectionContext(),
        [],
    )

    settled = {agent.id: agent for agent in projection.agents}
    assert settled["take-the-next-open-requirement"].is_live
    assert settled["implement-swr-167"].state.value == "queued"


@verifies(SWR.SWR_2913)
def test_a_running_session_keeps_its_live_agents() -> None:
    """Productive use: a user watches a live run and sees what is actually working."""
    projection = build_session_projection(
        _session_with_a_running_child("running"),
        RotarisConfig(),
        SessionProjectionContext(),
        [],
    )

    settled = {agent.id: agent for agent in projection.agents}
    assert settled["take-the-next-open-requirement"].is_live
    assert settled["take-the-next-open-requirement"].active_tools == ["delegate"]
    assert settled["implement-swr-167"].state.value == "queued"
