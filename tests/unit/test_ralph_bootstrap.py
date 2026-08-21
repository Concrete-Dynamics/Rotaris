from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING, Any

import pytest

from rotaris_core.config.schema import PersonaConfig, RotarisConfig, RuntimePolicy
from rotaris_core.ralph import bootstrap
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.state import SessionState

if TYPE_CHECKING:
    from pathlib import Path


def make_config(**kwargs: Any) -> RotarisConfig:
    return RotarisConfig(runtime=RuntimePolicy(child_timeout=5), **kwargs)


def make_state(**overrides: Any) -> SessionState:
    now = dt.datetime.now(dt.UTC)
    defaults: dict[str, Any] = {
        "session_id": "boot-test",
        "workspace_root": "/tmp/test",
        "created_at": now,
        "updated_at": now,
    }
    defaults.update(overrides)
    return SessionState(**defaults)


@verifies(SWR.SWR_154)
async def test_classify_run_intent_falls_back_on_error(monkeypatch: pytest.MonkeyPatch) -> None:
    """Productive use: user can still begin a run when classifier setup fails.
    Expected outcome: standard fallback intent remains available."""

    async def boom(config: Any, text: str, **kwargs: Any) -> Any:
        raise RuntimeError("classifier down")

    monkeypatch.setattr("rotaris_core.ralph.intent_classifier.classify_initial_intent", boom)
    result = await bootstrap.classify_run_intent(make_config(), "do things", entrypoint="test")
    assert result.fallback is True
    assert "classifier down" in result.reason


@verifies(SWR.SWR_167)
async def test_classify_run_intent_includes_latest_orchestrator_response(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: user resumes with latest orchestrator result as intent context.
    Expected outcome: usable summary wins; foreign, pending, and unattributed history stays excluded."""
    from rotaris_core.ralph.intent_classifier import FALLBACK_INTENT, IntentClassificationResult

    seen: dict[str, Any] = {}

    async def fake(config: Any, text: str, **kwargs: Any) -> Any:
        seen.update(kwargs)
        return IntentClassificationResult(intent=FALLBACK_INTENT, reason="ok", fallback=False)

    progress = {
        "session_id": "boot-test",
        "started_at": "2026-01-01T00:00:00Z",
        "iterations": [
            {
                "iteration_number": 1,
                "task_id": "old",
                "task_name": "old",
                "started_at": "2026-01-01T00:00:00Z",
                "outcome": "completed",
                "persona": "coder",
                "report_summary": "foreign",
            },
            {
                "iteration_number": 2,
                "task_id": "pending",
                "task_name": "pending",
                "started_at": "2026-01-01T00:01:00Z",
                "outcome": "pending",
                "persona": "orchestrator",
                "report_summary": "not complete",
            },
            {
                "iteration_number": 3,
                "task_id": "old-orch",
                "task_name": "old orch",
                "started_at": "2026-01-01T00:02:00Z",
                "outcome": "completed",
                "persona": "orchestrator",
                "report_summary": "older summary",
            },
            {
                "iteration_number": 4,
                "task_id": "latest",
                "task_name": "latest",
                "started_at": "2026-01-01T00:03:00Z",
                "outcome": "completed",
                "persona": "orchestrator",
                "report_summary": "  latest summary  ",
                "agent_response": "unused",
            },
        ],
    }
    monkeypatch.setattr("rotaris_core.ralph.intent_classifier.classify_initial_intent", fake)

    await bootstrap.classify_run_intent(
        make_config(), "follow up", entrypoint="tui", progress=progress
    )

    assert seen["metadata"] == {"entrypoint": "tui"}
    assert seen["prior_orchestrator_response"] == "latest summary"


@verifies(SWR.SWR_167)
async def test_classify_run_intent_uses_response_fallback_and_omits_unusable_history(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: user resumes safely when old reports are incomplete.
    Expected outcome: response fallback works and unusable history adds no field."""
    from rotaris_core.ralph.intent_classifier import FALLBACK_INTENT, IntentClassificationResult

    calls: list[dict[str, Any]] = []

    async def fake(config: Any, text: str, **kwargs: Any) -> Any:
        calls.append(kwargs)
        return IntentClassificationResult(intent=FALLBACK_INTENT, fallback=False)

    response_only = {
        "session_id": "boot-test",
        "started_at": "2026-01-01T00:00:00Z",
        "iterations": [
            {
                "iteration_number": 1,
                "task_id": "response",
                "task_name": "response",
                "started_at": "2026-01-01T00:00:00Z",
                "outcome": "completed",
                "persona": "orchestrator",
                "report_summary": " ",
                "agent_response": "  response fallback  ",
            }
        ],
    }
    unusable = {
        "session_id": "boot-test",
        "started_at": "2026-01-01T00:00:00Z",
        "iterations": [
            {
                "iteration_number": 1,
                "task_id": "none",
                "task_name": "none",
                "started_at": "2026-01-01T00:00:00Z",
                "outcome": "completed",
                "persona": "orchestrator",
                "report_summary": " ",
                "agent_response": " ",
            }
        ],
    }
    monkeypatch.setattr("rotaris_core.ralph.intent_classifier.classify_initial_intent", fake)

    await bootstrap.classify_run_intent(
        make_config(), "follow up", entrypoint="background", progress=response_only
    )
    await bootstrap.classify_run_intent(
        make_config(), "fresh", entrypoint="background", progress=unusable
    )

    assert calls[0]["prior_orchestrator_response"] == "response fallback"
    assert calls[1]["prior_orchestrator_response"] is None


@verifies(SWR.SWR_2128, SWR.SWR_1512)
def test_build_run_todo_creates_main_phase_when_no_prior_state(tmp_path: Path) -> None:
    state = make_state()
    todo, top_task = bootstrap.build_run_todo(state, "build the feature", tmp_path)
    assert [phase.name for phase in todo.phases] == ["main"]
    assert todo.phases[0].tasks == [top_task]
    assert top_task.execution_payload  # contextual payload was set


@verifies(SWR.SWR_2128)
def test_build_run_todo_appends_to_existing_first_phase(tmp_path: Path) -> None:
    state = make_state()
    prior, _ = bootstrap.build_run_todo(state, "first task", tmp_path)
    state.todo_state = prior.model_dump(mode="json")

    todo, top_task = bootstrap.build_run_todo(state, "second task", tmp_path)
    assert len(todo.phases[0].tasks) == 2
    assert todo.phases[0].tasks[-1] is top_task


@verifies(SWR.SWR_2128)
def test_make_summary_agent_factory_resolves_persona_summary_model(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}

    def fake_load_llm(config: Any, model_key: Any, **kwargs: Any) -> str:
        captured["model_key"] = model_key
        return "llm-stub"

    monkeypatch.setattr("rotaris_core.config.loader.load_llm_for_model", fake_load_llm)
    config = make_config(
        personas={
            "orchestrator": PersonaConfig(
                name="orchestrator",
                model="big-model",
                summary_model="persona-summary",
            ),
        },
    )
    factory = bootstrap.make_summary_agent_factory(config)
    agent = factory("orchestrator")
    assert captured["model_key"] == "persona-summary"
    assert agent.llm == "llm-stub"


@verifies(SWR.SWR_2128)
def test_make_summary_agent_factory_falls_back_to_default_summary_model(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}

    def fake_load_llm(config: Any, model_key: Any, **kwargs: Any) -> str:
        captured["model_key"] = model_key
        return "llm-stub"

    monkeypatch.setattr("rotaris_core.config.loader.load_llm_for_model", fake_load_llm)
    config = make_config()
    factory = bootstrap.make_summary_agent_factory(config)
    factory("unknown-persona")
    assert captured["model_key"] == config.default_summary_model


@verifies(SWR.SWR_2128)
def test_make_improvement_collector_factory_raises_without_model() -> None:
    factory = bootstrap.make_improvement_collector_factory(make_config())
    with pytest.raises(ValueError, match="medium_model must be configured"):
        factory()


@verifies(SWR.SWR_2128)
def test_make_improvement_context_provider_snapshots_transcript() -> None:
    state = make_state()
    state.transcript_events.append({"role": "user", "content": "hi"})
    provider = bootstrap.make_improvement_context_provider(state)
    ctx = provider()
    assert ctx["transcript_events"] == [{"role": "user", "content": "hi"}]
    # Must be a copy, not the live list.
    ctx["transcript_events"].append({"role": "x", "content": "y"})
    assert len(state.transcript_events) == 1


@verifies(SWR.SWR_2128)
def test_make_agent_factory_injects_intent_tools_for_default_persona(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}

    def fake_load_llm(config: Any, model_key: Any, **kwargs: Any) -> str:
        captured["model_key"] = model_key
        return "fake-llm"

    def fake_create_agent(persona_config: Any, config: Any, runtime_kwargs: Any = None) -> Any:
        captured["runtime_kwargs"] = runtime_kwargs
        return lambda llm: {"agent_for": llm}

    monkeypatch.setattr("rotaris_core.config.loader.load_llm_for_model", fake_load_llm)
    monkeypatch.setattr("rotaris_core.agents.factory.create_agent_for_persona", fake_create_agent)

    config = make_config(
        personas={
            "orchestrator": PersonaConfig(name="orchestrator", model="test-model"),
        },
    )
    assert config.default_persona == "orchestrator"

    factory = bootstrap.make_agent_factory(
        config,
        intent_tools=["read_file"],
    )
    agent = factory("orchestrator")
    assert agent == {"agent_for": "fake-llm"}
    assert captured["model_key"] == "test-model"
    assert captured["runtime_kwargs"]["intent_tools"] == ["read_file"]


@verifies(SWR.SWR_2128)
def test_make_agent_factory_uses_model_resolver_and_augmentor(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}

    def fake_load_llm(config: Any, model_key: Any, **kwargs: Any) -> str:
        captured["model_key"] = model_key
        return "fake-llm"

    def fake_create_agent(persona_config: Any, config: Any, runtime_kwargs: Any = None) -> Any:
        captured["runtime_kwargs"] = runtime_kwargs
        return lambda llm: {"agent_for": llm}

    monkeypatch.setattr("rotaris_core.config.loader.load_llm_for_model", fake_load_llm)
    monkeypatch.setattr("rotaris_core.agents.factory.create_agent_for_persona", fake_create_agent)

    config = make_config(
        personas={
            "coder": PersonaConfig(name="coder", model="base-model"),
        },
    )

    def resolve_model(persona: str, persona_config: Any, model_override: str | None) -> Any:
        return config, persona_config, "resolved-model"

    def augment(persona: str, kwargs: dict[str, Any]) -> None:
        kwargs["condenser_token_callback"] = "sentinel"

    factory = bootstrap.make_agent_factory(
        config,
        intent_tools=None,
        resolve_model=resolve_model,
        augment_runtime_kwargs=augment,
    )
    factory("coder")
    assert captured["model_key"] == "resolved-model"
    assert captured["runtime_kwargs"]["condenser_token_callback"] == "sentinel"
    # Non-default persona must NOT receive the orchestrator-only tool allow-list.
    assert "intent_tools" not in captured["runtime_kwargs"]


@verifies(SWR.SWR_2416)
def test_make_agent_factory_propagates_run_intent_to_every_persona(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The playbook matrix needs the run intent in every child, not just the entry agent."""
    captured: dict[str, Any] = {}

    def fake_load_llm(config: Any, model_key: Any, **kwargs: Any) -> str:
        return "fake-llm"

    def fake_create_agent(persona_config: Any, config: Any, runtime_kwargs: Any = None) -> Any:
        captured["runtime_kwargs"] = runtime_kwargs
        return lambda llm: {"agent_for": llm}

    monkeypatch.setattr("rotaris_core.config.loader.load_llm_for_model", fake_load_llm)
    monkeypatch.setattr("rotaris_core.agents.factory.create_agent_for_persona", fake_create_agent)

    config = make_config(
        personas={
            "orchestrator": PersonaConfig(name="orchestrator", model="test-model"),
            "coder": PersonaConfig(name="coder", model="test-model"),
        },
    )
    factory = bootstrap.make_agent_factory(
        config,
        intent_tools=None,
        intent="moderate_feature",
    )

    factory("orchestrator")
    assert captured["runtime_kwargs"]["intent"] == "moderate_feature"

    factory("coder")
    assert captured["runtime_kwargs"]["intent"] == "moderate_feature"
    # ...while the orchestrator-only tool allow-list stays orchestrator-only.
    assert "intent_tools" not in captured["runtime_kwargs"]


@verifies(SWR.SWR_2416)
def test_make_agent_factory_omits_intent_when_unclassified(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}

    monkeypatch.setattr(
        "rotaris_core.config.loader.load_llm_for_model",
        lambda config, model_key, **kwargs: "fake-llm",
    )

    def fake_create_agent(persona_config: Any, config: Any, runtime_kwargs: Any = None) -> Any:
        captured["runtime_kwargs"] = runtime_kwargs
        return lambda llm: {"agent_for": llm}

    monkeypatch.setattr("rotaris_core.agents.factory.create_agent_for_persona", fake_create_agent)

    config = make_config(personas={"coder": PersonaConfig(name="coder", model="test-model")})
    bootstrap.make_agent_factory(config, intent_tools=None)("coder")
    assert "intent" not in (captured["runtime_kwargs"] or {})


@verifies(SWR.SWR_2128)
def test_make_entry_model_resolver_prefers_live_override_for_default_persona() -> None:
    class Host:
        entry_model_override: str | None = None

    host = Host()
    persona_config = PersonaConfig(name="orchestrator", model="primary-model")
    config = make_config(personas={"orchestrator": persona_config})
    assert config.default_persona == "orchestrator"
    resolve = bootstrap.make_entry_model_resolver(config, host)

    # No override yet → persona's configured model.
    assert resolve("orchestrator", persona_config, None)[2] == "primary-model"

    # Live override applies to the default persona only.
    host.entry_model_override = "reauthed-model"
    assert resolve("orchestrator", persona_config, None)[2] == "reauthed-model"
    child_config = PersonaConfig(name="coder", model="child-model")
    assert resolve("coder", child_config, None)[2] == "child-model"

    # Explicit model_override (quota/fallback machinery) always wins.
    assert resolve("orchestrator", persona_config, "forced-model")[2] == "forced-model"


@verifies(SWR.SWR_2128)
def test_make_entry_model_resolver_tolerates_host_without_attribute() -> None:
    persona_config = PersonaConfig(name="orchestrator", model="primary-model")
    config = make_config(personas={"orchestrator": persona_config})
    resolve = bootstrap.make_entry_model_resolver(config, object())
    assert resolve("orchestrator", persona_config, None)[2] == "primary-model"


@verifies(SWR.SWR_2128)
def test_make_agent_factory_unknown_persona_raises() -> None:
    factory = bootstrap.make_agent_factory(
        make_config(),
        intent_tools=None,
    )
    with pytest.raises(ValueError, match="Unknown persona"):
        factory("no-such-persona")


@verifies(SWR.SWR_2128)
def test_apply_progress_to_state_records_progress_and_artifact_id() -> None:
    from rotaris_core.ralph.state import RalphProgressFile
    from rotaris_core.tools.todo_state import TodoList, TodoPhase, TodoTask

    state = make_state()
    todo = TodoList(phases=[TodoPhase(name="main", tasks=[TodoTask(name="t", description="t")])])
    progress = RalphProgressFile(
        session_id="boot-test",
        started_at=dt.datetime.now(dt.UTC),
        total_tasks=1,
    )
    ralph = type("FakeRalph", (), {"last_improvement_artifact_id": "artifact-1"})()

    bootstrap.apply_progress_to_state(state, progress, todo, ralph)
    assert state.ralph_progress is not None
    assert state.todo_state is not None
    assert state.improvement_artifact_ids == ["artifact-1"]

    # Idempotent on artifact id.
    bootstrap.apply_progress_to_state(state, progress, todo, ralph)
    assert state.improvement_artifact_ids == ["artifact-1"]
