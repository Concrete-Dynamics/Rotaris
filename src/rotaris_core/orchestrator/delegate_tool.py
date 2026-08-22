"""Delegate tool — action, observation, executor, and tool definition.

Provides :class:`RotarisDelegateAction`, :class:`RotarisDelegateObservation`,
:class:`RotarisDelegateExecutor`, and :class:`RotarisDelegateTool` for
spawning child agent tasks from within an agent conversation.
"""

from __future__ import annotations

from collections.abc import Mapping
from pathlib import Path
from typing import TYPE_CHECKING, Any, ClassVar

from openhands.sdk import Action, Observation, TextContent, ToolDefinition
from openhands.sdk.tool import ToolExecutor
from pydantic import Field

from rotaris_core.orchestrator.child_state import ChildTaskState
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Sequence
    from typing import Self

    from rotaris_core.orchestrator.child_manager import ChildManager
    from rotaris_core.orchestrator.scheduler import AgentFactory, Scheduler

_PERSONA_ALIASES = {
    "coder": "coding-agent",
    "playwright": "ui-verifier",
}


class RotarisDelegateAction(Action):
    """Action to delegate a subtask to a child agent persona."""

    persona: str = Field(description="Target persona name (e.g., 'coding-agent')")
    task_name: str = Field(description="Short unique name for this child task")
    task: str = Field(
        description=(
            "Full task description. Structure with labeled sections: "
            "TASK (what to do), EXPECTED OUTCOME (verifiable result), "
            "MUST DO (mandatory constraints), "
            "MUST NOT DO (explicit prohibitions), "
            "CONTEXT (file paths, patterns, notes)."
        ),
    )
    depends_on: list[str] = Field(
        default_factory=list,
        description=(
            "List of task_ids (format: bg_XXXXXXXX, as returned in the task_id field of a prior "
            "delegation) that must succeed before this task starts. "
            "When a dependency completes, the framework automatically prepends its summary and "
            "key findings to this task's payload — the downstream agent receives the upstream "
            "results without any extra tool calls. "
            "Use this to wire librarian findings into a planner, or planner output into coding "
            "agents."
        ),
    )
    inherited_context: list[str] = Field(
        default_factory=list,
        description=(
            "Optional list of task_ids (format: bg_XXXXXXXX) of ALREADY-COMPLETED prior "
            "siblings whose reports should be propagated into this task's payload as "
            "context, even though this task does NOT depend on their ordering. "
            "Use this in Phase 2C (Realization) to forward research/planning findings "
            "to implementation children without re-summarizing them by hand. "
            "Only succeeded tasks are included; unfinished or failed task_ids are ignored. "
            "Prefer `inherited_context` over rewriting findings into the `task` text."
        ),
    )
    category: str | None = Field(
        default=None,
        description=(
            "Task category for routing. Use task type, NOT model name. "
            "Categories: 'quick' (trivial fixes), 'deep' (thorough autonomous), "
            "'planning' (scope and plan only), 'research' (information gathering). "
            "WARNING: Do not pass a model name here."
        ),
    )
    session_id: str | None = Field(
        default=None,
        description=(
            "Session ID from a previous delegation. Pass this when retrying, "
            "continuing, or clarifying a prior task to preserve full context "
            "and reduce token consumption. Do not open a new session for "
            "follow-ups."
        ),
    )
    run_in_background: bool = Field(
        default=True,
        description=(
            "Controls whether this delegation blocks the current agent until the child finishes. "
            "Defaults to true (non-blocking): the tool returns a task_id immediately and a "
            "system notification is injected when the child completes. "
            "Set to false only when your next action depends on this task's result "
            "and you cannot proceed until it completes."
        ),
    )
    attach_artifacts: list[str] = Field(
        default_factory=list,
        description=(
            "List of artifact ids (art_XXXXXXXX) or slugs whose FULL body — including "
            "snippets, highlight paths, edited/created files — should be injected at the "
            "head of this child's task payload. Use when the child needs concrete prior "
            "evidence (snippets, exact paths) rather than just summaries. Unknown ids are "
            "reported back as warnings, and oversized attachment sets may be partially "
            "elided. Call `artifact_list` first to enumerate available artifacts."
        ),
    )
    suppress_auto_context: bool = Field(
        default=False,
        description=(
            "When true, suppresses the automatic 'PRIOR SIBLING ARTIFACT INDEX' block "
            "that is normally prepended to every child's payload. Use sparingly — e.g. for "
            "pure-execution children that should not be biased by prior research."
        ),
    )


class RotarisDelegateObservation(Observation):
    """Observation returned after a delegate action is processed."""

    canonical_name: str = Field(description="Canonical child task name after deduplication")
    status: str = Field(description="Delegation status")
    message: str = Field(description="Human-readable delegation result")
    task_id: str | None = Field(
        default=None,
        description="Background task ID (populated when status is 'queued')",
    )

    @property
    def to_llm_content(self) -> Sequence[TextContent]:
        """Format this observation as LLM-readable text content."""
        parts = [f"Task '{self.canonical_name}': {self.status} — {self.message}"]
        if self.task_id is not None:
            parts.append(f"task_id: {self.task_id}")
        return [TextContent(text="\n".join(parts))]


@traces(SWR.SWR_102, SWR.SWR_104, SWR.SWR_105, SWR.SWR_110, SWR.SWR_139)
@traces(SWR.SWR_116, SWR.SWR_920)
@traces(SWR.SWR_2433)
class RotarisDelegateExecutor(ToolExecutor[RotarisDelegateAction, RotarisDelegateObservation]):
    """Executor that processes :class:`RotarisDelegateAction` into child tasks."""

    def __init__(
        self,
        child_manager: ChildManager,
        scheduler: Scheduler,
        agent_factory: AgentFactory,
        parent_canonical_name: str | None = None,
    ):
        """Create the executor wired to the given scheduler and child manager."""
        self.child_manager = child_manager
        self.scheduler = scheduler
        self.agent_factory = agent_factory
        self.parent_canonical_name = parent_canonical_name

    def __call__(
        self,
        action: RotarisDelegateAction,
        conversation: object = None,
    ) -> RotarisDelegateObservation:
        """Execute a delegate action: resolve, spawn, and return observation status."""
        try:
            inherited_prefix = self.child_manager.build_inherited_context_block(
                action.inherited_context,
            )
        except ValueError as exc:
            message = str(exc)
            return RotarisDelegateObservation.from_text(
                message,
                is_error=True,
                canonical_name=action.task_name,
                status="rejected",
                message=message,
            )

        try:
            persona = self._resolve_persona(action.persona)
        except ValueError as exc:
            message = str(exc)
            return RotarisDelegateObservation.from_text(
                message,
                is_error=True,
                canonical_name=action.task_name,
                status="rejected",
                message=message,
            )

        # Resolve model key and max_parallel for per-model concurrency tracking.
        model_key, max_parallel = self._resolve_model_parallelism(persona)

        # Persona-level skip_auto_sibling_context flag combines with the
        # per-call suppress_auto_context flag (OR — either disables baseline).
        persona_skip = False
        config = getattr(self.child_manager, "config", None)
        personas_cfg = getattr(config, "personas", None) if config is not None else None
        if isinstance(personas_cfg, Mapping):
            persona_obj = personas_cfg.get(persona)
            persona_skip = bool(getattr(persona_obj, "skip_auto_sibling_context", False))

        # Hybrid auto-injection: baseline summaries + full bodies for attached artifacts.
        baseline_block = ""
        full_block = ""
        attached_ids: list[str] = []
        baseline_ids: list[str] = []
        attachment_warnings: list[str] = []
        store = getattr(self.child_manager, "artifact_store", None)
        if store is not None:
            if action.attach_artifacts:
                full_resolution = store.resolve_full_block(action.attach_artifacts)
                full_block = full_resolution.block
                attached_ids = list(full_resolution.resolved_ids)
                if full_resolution.missing_refs:
                    missing = ", ".join(full_resolution.missing_refs)
                    attachment_warnings.append(f"missing attached artifacts: {missing}")
                if full_resolution.elided_ids:
                    attachment_warnings.append(
                        f"{len(full_resolution.elided_ids)} attached artifact(s) elided for size",
                    )
            if not action.suppress_auto_context and not persona_skip:
                baseline_block, baseline_ids = store.baseline_block(
                    exclude_ids=set(attached_ids),
                    task_name=action.task_name,
                    task_payload=action.task,
                    actor=action.task_name,
                )

        acceptance = self._acceptance_gate(persona)
        if acceptance is not None:
            return acceptance

        workspace_prefix = self._build_workspace_root_prefix()
        task_payload = (
            workspace_prefix
            + self._verifier_evidence_prefix(persona)
            + baseline_block
            + full_block
            + inherited_prefix
            + action.task
        )

        try:
            record = self.child_manager.spawn_child(
                name=action.task_name,
                persona=persona,
                task_payload=task_payload,
                depends_on=action.depends_on,
                inherited_context=action.inherited_context,
                category=action.category,
                session_id=action.session_id,
                run_in_background=action.run_in_background,
                received_artifact_ids=[*baseline_ids, *attached_ids],
                model_key=model_key,
                parent_agent_id=self.parent_canonical_name,
            )
        except ValueError as exc:
            message = str(exc)
            return RotarisDelegateObservation.from_text(
                message,
                is_error=True,
                canonical_name=action.task_name,
                status="rejected",
                message=message,
            )

        # If model parallelism is at capacity, enqueue the child instead of
        # rejecting.  The child waits in WAITING_ON_MODEL_SLOT until a sibling
        # finishes and releases a slot.
        if model_key is not None and max_parallel is not None:
            self.child_manager.enqueue_model_slot(
                record.canonical_name,
                model_key,
                max_parallel,
            )

        self._pause_parent_conversation(conversation)

        task_id = record.task_id or None
        alias_note = (
            f" Persona alias '{action.persona}' resolved to '{record.persona}'."
            if action.persona != record.persona
            else ""
        )
        warning_note = (
            f" Warnings: {'; '.join(attachment_warnings)}." if attachment_warnings else ""
        )

        if record.state == ChildTaskState.WAITING_ON_MODEL_SLOT:
            active = (
                self.child_manager._count_model_active_locked(  # noqa: SLF001
                    model_key,
                )
                if model_key
                else 0
            )
            message = (
                f"Task queued (waiting for model slot: model '{model_key}', "
                f"{active}/{max_parallel} active). Will start automatically "
                f"when a slot opens.{alias_note}{warning_note}"
            )
            return RotarisDelegateObservation.from_text(
                message,
                canonical_name=record.canonical_name,
                status="waiting_on_model_slot",
                message=message,
                task_id=task_id,
            )

        if record.state == ChildTaskState.WAITING_ON_DEPENDENCIES:
            message = (
                f"Task waiting on dependencies: {', '.join(record.depends_on)}"
                f"{alias_note}{warning_note}"
            )
            return RotarisDelegateObservation.from_text(
                message,
                canonical_name=record.canonical_name,
                status="waiting_on_dependencies",
                message=message,
                task_id=task_id,
            )

        message = f"Task queued for execution{alias_note}{warning_note}"
        return RotarisDelegateObservation.from_text(
            message,
            canonical_name=record.canonical_name,
            status="queued",
            message=message,
            task_id=task_id,
        )

    def _resolve_persona(self, persona: str) -> str:
        config = getattr(self.scheduler, "config", None)
        personas = getattr(config, "personas", None)
        if not isinstance(personas, Mapping) or not personas:
            return persona

        if persona in personas:
            return persona

        aliased = _PERSONA_ALIASES.get(persona)
        if aliased is not None and aliased in personas:
            return aliased

        known = ", ".join(sorted(personas)) or "none"
        aliases = ", ".join(
            f"{alias}->{target}"
            for alias, target in sorted(_PERSONA_ALIASES.items())
            if target in personas
        )
        alias_text = f" Supported aliases: {aliases}." if aliases else ""
        raise ValueError(f"Unknown persona: {persona}. Known personas: {known}.{alias_text}")

    def _resolve_model_parallelism(self, persona: str) -> tuple[str | None, int | None]:
        """Resolve the model key and max_parallel for *persona*.

        Returns ``(model_key, max_parallel)``.  Both are ``None`` when the model
        has no parallelism cap configured or the config is not available.
        """
        scheduler_config = getattr(self.scheduler, "config", None)
        if scheduler_config is None:
            return None, None
        personas = getattr(scheduler_config, "personas", None)
        if not isinstance(personas, Mapping):
            return None, None
        persona_cfg = personas.get(persona)
        if persona_cfg is None:
            return None, None
        model_key: str | None = getattr(persona_cfg, "model", None)
        if not model_key:
            return None, None
        models = getattr(scheduler_config, "models", None)
        if not isinstance(models, Mapping):
            return model_key, None
        model_cfg = models.get(model_key)
        if model_cfg is None:
            return model_key, None
        max_parallel: int | None = getattr(model_cfg, "max_parallel", None)
        return model_key, max_parallel

    def _pause_parent_conversation(self, conversation: object) -> None:
        """Yield back to the scheduler so queued child work can run before the parent continues."""
        if conversation is None:
            return

        pause = getattr(conversation, "pause", None)
        if callable(pause):
            pause()

    @traces(SWR.SWR_2619)
    def _last_verifier_evidence(self) -> Any:
        """This iteration's check evidence, when the host published any."""
        return getattr(self.scheduler, "last_verifier_evidence", None)

    @traces(SWR.SWR_2619, SWR.SWR_2603)
    def _verifier_evidence_prefix(self, persona: str) -> str:
        """The suite's own results, carried to the persona that would re-run them.

        Only for the acceptance persona: every other persona is doing the work,
        not grading it, and a table of check results in its payload would be
        noise it has to read past.
        """
        from rotaris_core.verifier.acceptance import (
            ACCEPTANCE_PERSONA,
            acceptance_evidence_block,
        )

        if persona != ACCEPTANCE_PERSONA:
            return ""
        return acceptance_evidence_block(self._last_verifier_evidence())

    @traces(SWR.SWR_2619, SWR.SWR_2604)
    def _acceptance_gate(self, persona: str) -> RotarisDelegateObservation | None:
        """Refuse an acceptance check on a slice whose gate is red, with a reason.

        Not a policy the orchestrator is asked to observe — one it is held to.
        A red gate has already downgraded the verdict and re-queued the task with
        the failing output attached, so a model call spent re-narrating it delays
        the repair it is describing.
        """
        from rotaris_core.verifier.acceptance import (
            ACCEPTANCE_PERSONA,
            may_delegate_acceptance,
        )

        if persona != ACCEPTANCE_PERSONA:
            return None
        decision = may_delegate_acceptance(self._last_verifier_evidence())
        if decision.allowed:
            return None
        return RotarisDelegateObservation.from_text(
            decision.reason,
            is_error=True,
            canonical_name="",
            status="rejected",
            message=decision.reason,
        )

    def _build_workspace_root_prefix(self) -> str:
        config = getattr(self.scheduler, "config", None)
        workspace_root = getattr(config, "workspace_root", None) if config is not None else None
        if not isinstance(workspace_root, Path | str):
            return ""

        resolved = Path(workspace_root).resolve()
        return (
            "AUTHORITATIVE WORKSPACE ROOT:\n"
            f"- `{resolved}`\n"
            "- Use this exact path for all file paths, commands, and project-root assumptions.\n"
            "- If any other absolute path appears later in this task or inherited context, treat it as stale and ignore it.\n\n"
        )


_DELEGATE_TOOL_DESCRIPTION = (
    "Delegate a task to a child agent persona. "
    "Returns immediately with a task_id (format: bg_XXXXXXXX) that identifies the spawned task. "
    "NON-BLOCKING BY DEFAULT: run_in_background=true (the default) returns a task_id instantly "
    "and you can keep working or delegate more tasks in the same turn. "
    "A system notification is injected into your conversation when each background task completes. "
    "Use background_output(task_id) for the compact report, or "
    'background_output(task_id, detail_level="verbatim") for the exact last reply plus '
    "stored evidence. "
    "Use wait_for_tasks(task_ids) to voluntarily block until specific tasks finish. "
    "PARALLEL PATTERN: call delegate multiple times in the same response — all tasks launch "
    "simultaneously. "
    "SEQUENTIAL (rare): set run_in_background=false ONLY when the very next action depends on "
    "this task's result and you cannot proceed — this pauses your agent until the child finishes. "
    "Required parameters: persona (str), task_name (str), task (str). "
    "Optional: depends_on (list[str], default []) — task_ids (bg_XXXXXXXX) that must succeed "
    "before this task starts (DAG pipelines within a batch); "
    "category (str, one of 'quick'|'deep'|'planning'|'research'); "
    "session_id (str, reuse from prior delegation for retries/follow-ups); "
    "run_in_background (bool, default true). "
    "The 'task' field must use labeled sections: TASK, EXPECTED OUTCOME, "
    "MUST DO, MUST NOT DO, CONTEXT. "
    "CONTEXT FORWARDING: when you set depends_on to one or more task_ids, the framework "
    "automatically injects each upstream agent's summary and key findings into the downstream "
    "task's payload before it starts — no extra tool calls needed. "
    "Pipeline example: delegate librarian (research) → capture its task_id → "
    "delegate planner "
    "with depends_on=[librarian_task_id] (planner receives research findings) → capture "
    "planner_task_id → delegate coding agents with depends_on=[planner_task_id] "
    "(coders receive the plan). Each stage gets everything the previous stage produced."
)


@traces(SWR.SWR_102, SWR.SWR_144, SWR.SWR_554)
class RotarisDelegateTool(ToolDefinition[RotarisDelegateAction, RotarisDelegateObservation]):
    """Tool definition wiring :class:`RotarisDelegateAction` to its executor."""

    name: ClassVar[str] = "delegate"

    @classmethod
    def create(cls, conv_state: object = None, **kwargs: Any) -> Sequence[Self]:
        """Create a singleton-instance tool list from the factory kwargs."""
        del conv_state
        child_manager = kwargs["child_manager"]
        scheduler = kwargs["scheduler"]
        agent_factory = kwargs["agent_factory"]
        return [
            cls(
                description=_DELEGATE_TOOL_DESCRIPTION,
                action_type=RotarisDelegateAction,
                observation_type=RotarisDelegateObservation,
                executor=RotarisDelegateExecutor(child_manager, scheduler, agent_factory),
            ),
        ]


# Backward-compatible aliases for local imports/tests. These names intentionally
# point to the unique Rotaris-specific schemas so we don't collide with OpenHands'
# built-in DelegateAction/DelegateObservation subclasses.
DelegateAction = RotarisDelegateAction
DelegateObservation = RotarisDelegateObservation
