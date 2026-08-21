"""Shared run-setup pipeline for CLI background runs and TUI runs.

Both entry points (``cli/background.py`` and ``tui/app_run.py``) assemble
the same machinery around :class:`~rotaris_core.ralph.loop.RalphLoop`:
intent classification, contextual todo construction, summary-agent /
improvement-collector factories, the persona → Agent factory, and
post-run state application.  This module owns that pipeline; the entry
points only supply UI wiring and persistence.

Heavy imports stay inside functions (lazy-import rule).
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Callable
    from pathlib import Path

    from openhands.sdk import Agent

    from rotaris_core.config.schema import PersonaConfig, RotarisConfig
    from rotaris_core.improvement.collector import ImprovementCollector
    from rotaris_core.orchestrator.summary_agent import SummaryAgent
    from rotaris_core.ralph.intent_classifier import IntentClassificationResult
    from rotaris_core.ralph.loop import RalphLoop
    from rotaris_core.ralph.state import RalphProgressFile
    from rotaris_core.session.state import SessionState
    from rotaris_core.tools.todo_state import TodoList, TodoTask

    # (persona, persona_config, model_override) -> (config, persona_config, model_key)
    ModelResolver = Callable[
        [str, PersonaConfig, str | None],
        tuple[RotarisConfig, PersonaConfig, str],
    ]
    RuntimeKwargsAugmentor = Callable[[str, dict[str, Any]], None]

_log = logging.getLogger(__name__)


@traces(SWR.SWR_147, SWR.SWR_148, SWR.SWR_167)
def _prior_orchestrator_response(progress: RalphProgressFile | dict[str, Any] | None) -> str | None:
    """Select latest usable completed orchestrator response from this session only."""
    if progress is None:
        return None

    from rotaris_core.ralph.state import RalphIterationOutcome, RalphProgressFile

    try:
        parsed_progress = (
            progress
            if isinstance(progress, RalphProgressFile)
            else RalphProgressFile.model_validate(progress)
        )
    except (TypeError, ValueError):
        return None

    for iteration in reversed(parsed_progress.iterations):
        if (
            iteration.persona != "orchestrator"
            or iteration.outcome != RalphIterationOutcome.COMPLETED
        ):
            continue
        summary = (iteration.report_summary or "").strip()
        if summary:
            return summary
        response = (iteration.agent_response or "").strip()
        if response:
            return response
    return None


@traces(SWR.SWR_147, SWR.SWR_148, SWR.SWR_167)
async def classify_run_intent(
    config: RotarisConfig,
    task_text: str,
    *,
    entrypoint: str,
    progress: RalphProgressFile | dict[str, Any] | None = None,
) -> IntentClassificationResult:
    """Classify user intent with bounded, attributable same-session history."""
    from rotaris_core.ralph import intent_classifier

    try:
        return await intent_classifier.classify_initial_intent(
            config,
            task_text,
            metadata={"entrypoint": entrypoint},
            prior_orchestrator_response=_prior_orchestrator_response(progress),
        )
    except Exception as exc:  # noqa: BLE001
        _log.warning("Intent classification pre-flight failed (%s); continuing", exc)
        return intent_classifier.IntentClassificationResult(
            intent=intent_classifier.FALLBACK_INTENT,
            reason=f"classification pre-flight error: {exc}",
            fallback=True,
        )


@traces(SWR.SWR_2128)
def build_run_todo(
    state: SessionState,
    task_text: str,
    session_dir: Path,
) -> tuple[TodoList, TodoTask]:
    """Build the run's todo list with the new top-level task appended.

    Preserves existing todo state when resuming a session.  The contextual
    payload embeds the current transcript, session artifacts, prior todo
    state, and prior progress — call this AFTER appending the user/intent
    transcript events so the payload reflects them.
    """
    from rotaris_core.session.task_context import (
        build_contextual_task_payload,
        build_progress_context,
        build_session_artifact_context,
        build_task_display_name,
        build_todo_context,
    )
    from rotaris_core.tools.todo_state import TodoList, TodoPhase, TodoTask

    contextual_task = build_contextual_task_payload(
        task_text,
        state.transcript_events,
        artifact_context=build_session_artifact_context(session_dir),
        todo_context=build_todo_context(state.todo_state),
        progress_context=build_progress_context(state.ralph_progress),
    )
    top_level_task = TodoTask(name=build_task_display_name(task_text), description=task_text)
    top_level_task.set_execution_context(contextual_task)

    if state.todo_state and state.todo_state.get("phases"):
        todo = TodoList.model_validate(state.todo_state)
        if todo.phases:
            todo.phases[0].tasks.append(top_level_task)
        else:
            todo.phases.append(TodoPhase(name="main", tasks=[top_level_task]))
    else:
        todo = TodoList(phases=[TodoPhase(name="main", tasks=[top_level_task])])
    return todo, top_level_task


@traces(SWR.SWR_2128)
def make_summary_agent_factory(config: RotarisConfig) -> Callable[[str], SummaryAgent]:
    """Return the per-persona SummaryAgent factory used by RalphLoop/Scheduler."""

    def summary_agent_for_persona(persona: str) -> SummaryAgent:
        from rotaris_core.config.loader import build_llm_usage_id, load_llm_for_model
        from rotaris_core.orchestrator.summary_agent import SummaryAgent

        persona_config = config.personas.get(persona)
        summary_model = (
            persona_config.summary_model
            if persona_config is not None and persona_config.summary_model is not None
            else config.default_summary_model
        )
        if summary_model is None:
            raise ValueError(f"Summary model must be configured for persona '{persona}'")
        _log.info("Using summary model '%s' for persona '%s'", summary_model, persona)
        summary_llm = load_llm_for_model(
            config,
            summary_model,
            usage_id=build_llm_usage_id("summary", model_name=summary_model, scope=persona),
        )
        return SummaryAgent(llm=summary_llm, timeout=config.runtime.summary_timeout)

    return summary_agent_for_persona


@traces(SWR.SWR_2128, SWR.SWR_1638)
def make_improvement_collector_factory(
    config: RotarisConfig,
) -> Callable[[], ImprovementCollector]:
    """Return the cheap-model ImprovementCollector factory for the post-run pass."""

    def improvement_collector_factory() -> ImprovementCollector:
        from rotaris_core.config.loader import build_llm_usage_id, load_llm_for_model
        from rotaris_core.improvement import ImprovementCollector

        collector_model = config.improvement_collector_model or config.medium_model
        if collector_model is None:
            raise ValueError(
                "medium_model must be configured to enable the post-run improvement collector.",
            )
        collector_llm = load_llm_for_model(
            config,
            collector_model,
            usage_id=build_llm_usage_id(
                "improvement_collector",
                model_name=collector_model,
                scope="session",
            ),
        )
        return ImprovementCollector(
            llm=collector_llm,
            timeout=float(config.runtime.improvement_collector_timeout),
        )

    return improvement_collector_factory


@traces(SWR.SWR_2128)
def make_improvement_context_provider(
    state: SessionState,
) -> Callable[[], dict[str, Any]]:
    """Return a provider that snapshots the session transcript for the collector."""

    def improvement_context_provider() -> dict[str, Any]:
        return {"transcript_events": list(state.transcript_events or [])}

    return improvement_context_provider


@traces(SWR.SWR_2128)
def make_agent_factory(
    config: RotarisConfig,
    *,
    intent_tools: list[str] | None,
    intent: str = "",
    run_override: str = "",
    resolve_model: ModelResolver | None = None,
    augment_runtime_kwargs: RuntimeKwargsAugmentor | None = None,
) -> Callable[..., Agent]:
    """Return the persona → Agent factory passed into ``RalphLoop.run``.

    ``resolve_model`` lets a host override model selection (the TUI resolves
    the user's active model and runtime model configs); the default resolves
    ``model_override or persona_config.model`` against the given config.
    ``augment_runtime_kwargs`` lets a host inject extra runtime kwargs
    (e.g. the TUI's condenser token callback) before agent creation.
    ``intent`` is the run's classified intent; it is propagated to *every*
    spawned persona so each resolves its own playbook cell (SWR-2416).
    ``run_override`` is the host-selected delegation strategy (``swarm`` / ``single``),
    rendered after the cell and declared to win over it.
    """

    def agent_factory(
        persona: str,
        runtime_kwargs: dict[str, Any] | None = None,
        model_override: str | None = None,
    ) -> Agent:
        from rotaris_core.agents import factory as agents_factory
        from rotaris_core.config import loader as config_loader

        persona_config = config.personas.get(persona)
        if persona_config is None:
            raise ValueError(f"Unknown persona: {persona}")
        effective_runtime_kwargs = dict(runtime_kwargs or {})
        if intent:
            effective_runtime_kwargs.setdefault("intent", intent)
        if run_override:
            effective_runtime_kwargs.setdefault("run_override", run_override)
        if persona == config.default_persona and intent_tools is not None:
            effective_runtime_kwargs.setdefault("intent_tools", intent_tools)
        if augment_runtime_kwargs is not None:
            augment_runtime_kwargs(persona, effective_runtime_kwargs)

        if resolve_model is not None:
            effective_config, effective_persona_config, model_key = resolve_model(
                persona,
                persona_config,
                model_override,
            )
        else:
            effective_config = config
            effective_persona_config = persona_config
            model_key = model_override or persona_config.model

        llm = config_loader.load_llm_for_model(
            effective_config,
            model_key,
            stream=True,
            usage_id=config_loader.build_llm_usage_id(
                "agent",
                model_name=model_key,
                scope=persona,
            ),
        )
        factory_fn = agents_factory.create_agent_for_persona(
            effective_persona_config,
            effective_config,
            runtime_kwargs=effective_runtime_kwargs or None,
        )
        return factory_fn(llm)

    return agent_factory


@traces(SWR.SWR_2128)
def make_entry_model_resolver(config: RotarisConfig, host: Any) -> ModelResolver:
    """Resolve the entry persona's model from a live ``host`` attribute.

    ``host.entry_model_override`` is re-read on every agent spawn — each Ralph
    iteration spawns a fresh child, so a GUI host can flip the attribute
    mid-run (e.g. switch back to the primary model once the user has
    re-authenticated its provider) and the next iteration picks it up without
    restarting the run. The override only targets the default/entry persona;
    delegated children keep their configured models, and an explicit
    ``model_override`` argument (quota/fallback machinery) always wins.
    """

    def resolve_model(
        persona: str,
        persona_config: PersonaConfig,
        model_override: str | None,
    ) -> tuple[RotarisConfig, PersonaConfig, str]:
        if model_override is not None:
            return config, persona_config, model_override
        live_model = getattr(host, "entry_model_override", None)
        live_reasoning = getattr(host, "entry_reasoning_override", None)
        if persona == config.default_persona and (live_model or live_reasoning):
            model_key = str(live_model) if live_model else persona_config.model
            effective_persona_config = (
                persona_config.model_copy(update={"model": model_key})
                if model_key != persona_config.model
                else persona_config
            )
            if live_reasoning:
                base_model_cfg = config.models.get(model_key)
                if base_model_cfg is not None:
                    effective_config = config.model_copy(
                        update={
                            "models": {
                                **config.models,
                                model_key: base_model_cfg.model_copy(
                                    update={"reasoning_effort": str(live_reasoning)}
                                ),
                            },
                            "personas": {
                                **config.personas,
                                persona: effective_persona_config,
                            },
                        },
                    )
                    return effective_config, effective_persona_config, model_key
            return config, effective_persona_config, model_key
        return config, persona_config, persona_config.model

    return resolve_model


@traces(SWR.SWR_2128)
def apply_progress_to_state(
    state: SessionState,
    progress: RalphProgressFile,
    todo: TodoList,
    ralph: RalphLoop,
) -> None:
    """Record a finished run's progress, todo state, and improvement artifact id."""
    state.ralph_progress = progress.model_dump(mode="json")
    state.todo_state = todo.model_dump(mode="json")
    artifact_id = ralph.last_improvement_artifact_id
    if artifact_id is not None and artifact_id not in state.improvement_artifact_ids:
        state.improvement_artifact_ids.append(artifact_id)


@traces(SWR.SWR_1639)
def apply_post_run_improvement_result(
    state: SessionState,
    result: Any,
) -> None:
    """Record a persisted post-run artifact on its source session exactly once."""
    artifact_id = getattr(result, "artifact_id", None)
    if artifact_id is not None and artifact_id not in state.improvement_artifact_ids:
        state.improvement_artifact_ids.append(artifact_id)
