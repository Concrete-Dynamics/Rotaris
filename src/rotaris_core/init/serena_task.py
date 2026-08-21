"""Run the ``serena`` project-initialization task through a real LLM agent (SWR-2803).

The `project-initializer` persona is a genuine agent, not a hard-coded MCP call:
it is given the Serena toolset plus read-only file tools and asked to run
Serena's onboarding for code projects. That is deliberate. Serena's own
onboarding is model-driven, the memories it writes are only as good as the
context the agent gathered, and the set of initialization steps is meant to grow
(SWR-2800) without this module learning each one.

What this module keeps *away* from the model is the part that must be
deterministic:

* **Activation.** Not a step the agent performs at all. Serena is launched bound
  to the workspace (SWR-2905), which puts it in single-project mode and stops it
  advertising ``activate_project`` — the tool is not withheld by instruction, it
  does not exist. The step is still *reported*, because the modal renders it, and
  its status is derived from whether Serena's tools reached the conversation.
* **Classification.** :func:`~rotaris_core.init.classifier.classify_project` runs
  here and the answer is handed to the agent as a stated fact, so the
  "skip onboarding for a non-code project" rule (SWR-2804) is decided by a
  filesystem scan rather than by a small model's judgement.
* **The verdict.** The outcome is read out of the conversation's own tool
  events, not out of the model's prose. The final report is parsed too, but only
  to be *compared*: a model that claims ``onboarding: success`` without ever
  calling ``onboarding`` is reported as a failure — and so is one that called it
  and then wrote nothing, because ``onboarding`` writes no memory itself.
* **The marker.** ``initialization:`` is written only on success — but by
  :mod:`rotaris_core.init.registry`, the sole writer for every task, so a failed
  run leaves the workspace re-promptable (SWR-2802) and a future task author
  cannot forget the rule.

The task runs on a bare :class:`~openhands.sdk.LocalConversation` rather than
through :class:`~rotaris_core.orchestrator.scheduler.Scheduler`. Todo correction,
stall watchdogs, circuit breakers and child reports all exist to manage
open-ended delegated work; a one-step setup task needs none of it and would only
inherit their failure modes.

Permissions are narrowed, not widened. Clicking *Initialize* is the user's
consent for the setup calls that button implies, so exactly those tools
(:data:`INIT_ALLOWED_TOOLS`) are pre-approved for this persona, for this run.
Every other tool — including Serena's symbolic *editing* tools — still goes
through the workspace's configured permission mode. A standing permissive mode
would hand those editing tools to an unattended agent, which is precisely what a
read-only initializer must not have.
"""

from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Literal

from rotaris_core.init.classifier import classify_project
from rotaris_core.init.registry import InitStepResult, InitTaskResult
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Callable
    from pathlib import Path

    from openhands.sdk import LLM, Agent

    from rotaris_core.config.schema import PersonaConfig, RotarisConfig
    from rotaris_core.init.classifier import ProjectKind

_log = logging.getLogger(__name__)

SERENA_TASK_ID = "serena"
"""Task id recorded in ``initialization.completed`` (SWR-2802)."""

PROJECT_INITIALIZER_PERSONA = "project-initializer"
"""Persona that performs the task (SWR-2803)."""

ONBOARDING_TOOL = "onboarding"

WRITE_MEMORY_TOOL = "write_memory"
"""The tool that does the work ``onboarding`` only asks for.

Serena's ``onboarding`` writes nothing: it returns a prompt telling the model what
to gather and then persist. Reading ``onboarding`` alone as the verdict meant an
agent could call it, write not one memory, and be recorded as having onboarded the
project — permanently, since the marker is never re-offered. So a successful
``write_memory`` is required too: the step claims memories exist, and this is what
makes that claim true.
"""

SERENA_READY_TOOL = ONBOARDING_TOOL
"""The tool whose presence proves Serena reached the conversation (SWR-2905).

Activation is no longer something the agent does, so the runner has to answer
"is Serena set up for this workspace?" for itself. It asks the toolset rather
than the model: Serena only advertises ``onboarding`` when it is running with an
active project, so the tool being *offered* — not called — is the evidence. A
docs-only workspace, where the tool is deliberately never invoked, is reported
just as accurately as a code one.
"""

ACTIVATION_STEP = "activation"
ONBOARDING_STEP = "onboarding"

DEFAULT_TIMEOUT_SECONDS = 300.0
"""Wall-clock budget for the whole agent run before it is declared failed."""

DEFAULT_MAX_ITERATIONS = 24
"""Hard bound on agent steps — a two-step task never needs more."""

_PAUSE_GRACE_SECONDS = 10.0
"""How long a timed-out run may unwind after ``pause()`` before we close anyway."""

ActivationStatus = Literal["success", "failure"]
OnboardingStatus = Literal["success", "skipped-no-code", "failure"]

__all__ = [
    "ACTIVATION_STEP",
    "DEFAULT_MAX_ITERATIONS",
    "DEFAULT_TIMEOUT_SECONDS",
    "INIT_ALLOWED_TOOLS",
    "ONBOARDING_STEP",
    "ONBOARDING_TOOL",
    "PROJECT_INITIALIZER_PERSONA",
    "SERENA_READY_TOOL",
    "SERENA_TASK_ID",
    "ActivationStatus",
    "InitStepResult",
    "InitTaskResult",
    "OnboardingStatus",
    "SerenaInitResult",
    "ToolCallRecord",
    "build_task_message",
    "run_serena_initialization",
    "run_serena_initialization_sync",
]


# ---------------------------------------------------------------------------
# Result contract
#
# ``InitStepResult`` and ``InitTaskResult`` are the generic initialization-task
# contract owned by ``rotaris_core.init.registry``. They live there so Rotaris can
# dispatch any registered task without naming Serena (SWR-2800). This module
# only extends them, via ``SerenaInitResult``.
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ToolCallRecord:
    """One tool the agent actually invoked, and how it ended.

    ``ok`` is ``False`` when the call's observation was flagged as an error, and
    ``None`` when no observation ever arrived — a run cut short mid-call must
    never read as a success.
    """

    name: str
    ok: bool | None
    detail: str = ""


@dataclass(frozen=True)
@traces(SWR.SWR_2803, SWR.SWR_2804)
class SerenaInitResult(InitTaskResult):
    """Outcome of one ``serena`` initialization run.

    Extends the generic :class:`InitTaskResult` with the evidence the verdict was
    derived from, so a caller can audit *why* a run was judged as it was. The
    generic fields are what the Rotaris modal renders; these extras are for
    diagnostics and tests.

    Attributes:
        final_report: The model's terminal message, or ``None`` when it never
            produced one (e.g. it stopped mid-tool-call).
        tool_calls: Every tool invocation observed, in order.
        warnings: Non-fatal discrepancies — most importantly, disagreements
            between the model's prose and what its tool calls actually did.
    """

    final_report: str | None = None
    tool_calls: tuple[ToolCallRecord, ...] = ()
    warnings: tuple[str, ...] = ()

    @property
    def activation(self) -> str:
        """Step 1 status: ``success`` or ``failure``."""
        return self.step_status(ACTIVATION_STEP) or "failure"

    @property
    def onboarding(self) -> str:
        """Step 2 status: ``success``, ``skipped-no-code``, or ``failure``."""
        return self.step_status(ONBOARDING_STEP) or "failure"

    @property
    def called_tools(self) -> tuple[str, ...]:
        """Names of the tools the agent invoked, in call order (repeats included)."""
        return tuple(record.name for record in self.tool_calls)


@dataclass
class _StepOutcome:
    """Mutable accumulator used while walking the conversation's events."""

    calls: list[ToolCallRecord] = field(default_factory=list)

    def succeeded(self, tool: str) -> bool:
        return any(record.name == tool and record.ok is True for record in self.calls)

    def attempted(self, tool: str) -> bool:
        return any(record.name == tool for record in self.calls)

    def failure_detail(self, tool: str) -> str:
        for record in reversed(self.calls):
            if record.name == tool and record.ok is not True and record.detail:
                return record.detail
        return ""


# ---------------------------------------------------------------------------
# Entry point


@traces(SWR.SWR_2802, SWR.SWR_2803)
def run_serena_initialization_sync(
    config: RotarisConfig,
    workspace_root: Path,
    **kwargs: Any,
) -> SerenaInitResult:
    """Blocking adapter matching the registry's ``InitTaskRunner`` protocol.

    :func:`run_serena_initialization` is a coroutine, but
    :func:`rotaris_core.init.registry.run_pending_tasks` is synchronous — it is
    driven from a Qt worker thread, which has no running event loop. Handing the
    registry the coroutine function directly would make every Serena run fail
    with an un-awaited coroutine, so the adapter is the registered entry point.

    Raises:
        RuntimeError: If called from a thread that already has a running event
            loop. That would mean the registry is being driven from inside async
            code, where :func:`run_serena_initialization` should be awaited
            directly instead.
    """
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(run_serena_initialization(config, workspace_root, **kwargs))

    msg = (
        "run_serena_initialization_sync() was called from a thread with a running "
        "event loop; await run_serena_initialization() instead."
    )
    raise RuntimeError(msg)


@traces(SWR.SWR_2803, SWR.SWR_2905)
def build_task_message(workspace_root: Path, classification: ProjectKind) -> str:
    """Render the task message handed to the agent.

    The classification is stated as a decided fact rather than asked as a
    question — the skip rule must not depend on the model re-inspecting the
    filesystem. Activation is stated the same way, and for a stronger reason: it
    already happened at Serena's launch (SWR-2905), so an agent told to "activate
    the project" would go looking for a tool that is not there.
    """
    if classification == "non-code":
        instruction = (
            "Because the classification is `non-code`, do NOTHING: do not call Serena's "
            "`onboarding` tool, and report `onboarding: skipped-no-code`."
        )
    else:
        instruction = (
            "Because the classification is `code`, call Serena's `onboarding` tool so the "
            "project's durable memories are written."
        )

    return (
        "Write this workspace's Serena onboarding memories.\n\n"
        f"Workspace path: {workspace_root}\n"
        f"Classification: {classification}\n\n"
        "Serena is already activated for this workspace — it was launched bound to it, "
        "so there is no project to activate and no activation tool to call.\n\n"
        f"Your task: {instruction}\n\n"
        "Finish with the required report block (`onboarding:`, `summary:`). Do not report "
        "an activation line — the framework determines that one itself."
    )


@traces(SWR.SWR_2803, SWR.SWR_2804)
async def run_serena_initialization(
    config: RotarisConfig,
    workspace_root: Path,
    *,
    llm: LLM | None = None,
    mcp_tool_provider: Any | None = None,
    conversation_factory: Callable[[Agent], Any] | None = None,
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    max_iterations: int = DEFAULT_MAX_ITERATIONS,
    **_forwarded: Any,
) -> SerenaInitResult:
    """Run the ``serena`` initialization task and report per-step status.

    The ``(config, workspace_root, **kwargs)`` signature is the shape the
    initialization-task registry (U5) holds as a task's ``run`` member, so this
    function can be dispatched generically.

    Args:
        config: Resolved workspace config. Supplies the persona, the model slot
            behind ``small_model``, and ``project_init.source_extensions``.
        workspace_root: Project being initialized. Also the conversation's
            workspace and the project Serena was launched bound to (SWR-2905).
        llm: Override for the persona's LLM. Tests inject a scripted LLM here;
            production leaves it ``None`` and the model is loaded through the
            same seam the Ralph bootstrap uses.
        mcp_tool_provider: Optional session-scoped MCP tool provider. When
            ``None`` the conversation creates its own clients from the agent's
            MCP config, which is what a standalone initialization run wants.
        conversation_factory: Override for conversation construction, for a
            caller that needs persistence or callbacks. The default builds a
            plain :class:`~openhands.sdk.LocalConversation`.
        timeout_seconds: Wall-clock budget for the agent run.
        max_iterations: Upper bound on agent steps.
        _forwarded: Absorbed and ignored. :func:`run_pending_tasks` forwards its
            extra keyword arguments to *every* registered runner, so a
            collaborator another task needs (``is_cancelled``) must not make this
            one fail with an unexpected argument.

    Returns:
        A :class:`SerenaInitResult`. On success the workspace's
        ``initialization:`` marker has been written with the classification; on
        failure the config is left untouched so the prompt can be re-triggered.

    An initialization failure is returned, not raised — the caller is a modal
    that has to render it. Programming errors (an unknown persona, a broken
    config) still raise.
    """
    persona = _resolve_persona(config)
    classification = await asyncio.to_thread(
        classify_project,
        workspace_root,
        list(config.project_init.source_extensions),
    )
    _log.info(
        "Serena initialization starting — workspace=%s classification=%s",
        workspace_root,
        classification,
    )

    try:
        agent = await asyncio.to_thread(_build_agent, persona, config, llm)
    except Exception as exc:  # noqa: BLE001 — reported, not raised, to the modal
        _log.exception("Serena initialization could not build the project-initializer agent")
        return _agent_setup_failure(classification, error=str(exc))

    events: list[Any] = []
    timed_out = False
    run_error: str | None = None
    serena_ready = False

    # The initializer's Serena grant is memory-writing, not code-editing (SWR-3008):
    # scope the provider to it before the conversation materialises the tools.
    from rotaris_core.mcp.scoped_tool_provider import scope_tool_provider_for_persona

    scoped_provider = scope_tool_provider_for_persona(mcp_tool_provider, persona, config)

    try:
        conversation = await asyncio.to_thread(
            _create_conversation,
            agent,
            workspace_root,
            mcp_tool_provider=scoped_provider,
            conversation_factory=conversation_factory,
            max_iterations=max_iterations,
        )
    except Exception as exc:  # noqa: BLE001 — a dead MCP server must reach the modal
        # Conversation construction is where MCP clients are started, so this is
        # the path a missing or crashing Serena server takes.
        _log.exception("Serena initialization could not open a conversation")
        return _agent_setup_failure(classification, error=str(exc))

    try:
        try:
            await asyncio.to_thread(
                conversation.send_message,
                build_task_message(workspace_root, classification),
            )
            # Sending the first message is what makes the SDK resolve the agent's
            # tools, so this is the earliest point Serena's arrival can be read —
            # and it must be read before ``run()``, which may fail for reasons of
            # its own and would leave the activation step unanswerable.
            serena_ready = _serena_reached_the_agent(conversation)
            await _run_with_timeout(conversation, timeout_seconds)
        except TimeoutError:
            timed_out = True
            run_error = (
                f"The project-initializer agent did not finish within {timeout_seconds:.0f}s."
            )
            _log.warning("Serena initialization timed out after %.0fs", timeout_seconds)
        except Exception as exc:  # noqa: BLE001 — reported, not raised, to the modal
            run_error = f"The project-initializer agent failed: {exc}"
            _log.exception("Serena initialization agent run failed")
        finally:
            events = _snapshot_events(conversation)
    finally:
        await _close_quietly(conversation)

    return await _finalize(
        workspace_root,
        classification,
        events,
        run_error=run_error,
        timed_out=timed_out,
        serena_ready=serena_ready,
    )


# ---------------------------------------------------------------------------
# Construction helpers


def _resolve_persona(config: RotarisConfig) -> PersonaConfig:
    persona = config.personas.get(PROJECT_INITIALIZER_PERSONA)
    if persona is None:
        raise ValueError(
            f"Persona {PROJECT_INITIALIZER_PERSONA!r} is not configured; "
            "project initialization cannot run.",
        )
    return persona


def _build_agent(persona: PersonaConfig, config: RotarisConfig, llm: LLM | None) -> Agent:
    """Create the persona's agent, loading its LLM when one was not injected."""
    from rotaris_core.agents import factory as agents_factory
    from rotaris_core.config import loader as config_loader

    resolved_llm = llm
    if resolved_llm is None:
        # This task runs on a bare LocalConversation with no visualizer and no
        # token_callbacks (see module docstring), so no on_token callback is ever
        # wired up. Requesting stream=True here does not get streamed responses —
        # the SDK silently degrades to a non-streaming call per request — but it
        # does make load_llm_for_model attach stream_options to the request body
        # as if streaming were happening. Some OpenAI-compatible endpoints (e.g.
        # DeepSeek) reject stream_options unless stream is actually true, so ask
        # for what this task actually does: a non-streaming completion.
        resolved_llm = config_loader.load_llm_for_model(
            config,
            persona.model,
            stream=False,
            usage_id=config_loader.build_llm_usage_id(
                "agent",
                model_name=persona.model,
                scope=PROJECT_INITIALIZER_PERSONA,
            ),
        )
    agent = agents_factory.create_agent_for_persona(persona, config)(resolved_llm)
    _grant_initialization_tools(agent, persona, config)
    return agent


INIT_ALLOWED_TOOLS = frozenset({ONBOARDING_TOOL, "write_memory"})
"""Serena tools the initialization run may call without an approval prompt.

Deliberately a closed list, not a permissive mode. Serena also exposes symbolic
*editing* tools, and a standing permissive mode would hand those to an agent
running unattended against a project the user may have opened seconds ago.
``write_memory`` is included because Serena's own ``onboarding`` tool instructs
the agent to persist its findings — without it, "Initialize" would still stop
mid-run for an approval the user already gave by clicking the button.

``activate_project`` is absent because it no longer exists: Serena is launched
bound to the workspace (SWR-2905) and stops advertising it.
"""


@traces(SWR.SWR_2803)
def _grant_initialization_tools(
    agent: Agent,
    persona: PersonaConfig,
    config: RotarisConfig,
) -> None:
    """Pre-approve exactly the tools initialization needs, for this run only.

    The user consents once, by clicking *Initialize*; being asked again for each
    Serena call the button implies is noise that trains people to click through
    approval dialogs. So this narrows rather than widens: the scoped rules are
    *prepended* to the workspace's configured preset, which still decides every
    other tool, path and command. Anything outside
    :data:`INIT_ALLOWED_TOOLS` — including Serena's editing tools — prompts
    exactly as it would for any other persona.

    The grant is bound to this agent's permission binding key, so it applies to
    this initialization run and nothing else.
    """
    del config  # The preset already reached the engine the factory registered.
    from rotaris_core.permissions import (
        Decision,
        PermissionPolicy,
        PermissionRule,
        resolve_permission_engine,
    )

    binding_key = getattr(agent, "permission_binding_key", None)
    if binding_key is None:
        _log.warning(
            "project-initializer agent exposes no permission binding key; "
            "initialization will follow the workspace's default prompting behaviour",
        )
        return

    # Narrow the engine the factory already built rather than constructing a new
    # one: it carries the resolved path auth, audit sink and approval resolver
    # for this agent, and rebuilding it here would silently drop them.
    engine = resolve_permission_engine(binding_key)
    base = engine.policy
    engine.set_policy(
        PermissionPolicy(
            rules=(
                PermissionRule(
                    rule_id="project-init:serena-setup-tools",
                    decision=Decision.ALLOW,
                    tools=INIT_ALLOWED_TOOLS,
                    personas=frozenset({persona.name}),
                    description="Serena setup tool invoked by the project initializer.",
                ),
                *base.rules,
            ),
            default_decision=base.default_decision,
            preset_name=base.preset_name,
        ),
    )


def _create_conversation(
    agent: Agent,
    workspace_root: Path,
    *,
    mcp_tool_provider: Any | None,
    conversation_factory: Callable[[Agent], Any] | None,
    max_iterations: int,
) -> Any:
    if conversation_factory is not None:
        return conversation_factory(agent)

    from openhands.sdk import LocalConversation

    kwargs: dict[str, Any] = {
        "agent": agent,
        "workspace": workspace_root,
        "visualizer": None,
        "delete_on_close": False,
        "max_iteration_per_run": max_iterations,
    }
    if mcp_tool_provider is not None:
        kwargs["mcp_tool_provider"] = mcp_tool_provider
    return LocalConversation(**kwargs)


async def _run_with_timeout(conversation: Any, timeout_seconds: float) -> None:
    """Run the conversation in a worker thread under a wall-clock budget.

    ``LocalConversation.run()`` is synchronous SDK code, so it goes through
    :func:`asyncio.to_thread`. A worker thread cannot be cancelled, so a timeout
    is handled by *asking* the conversation to stop (``pause()``) and giving the
    thread a short grace window to unwind — closing MCP clients underneath a
    thread that is still stepping the agent is what leaks subprocesses. The task
    is shielded so the timeout cancels only the wait, never the thread wrapper.

    Raises:
        TimeoutError: when the budget elapsed, whether or not the thread has
            since unwound.
    """
    run_task = asyncio.create_task(asyncio.to_thread(conversation.run))
    try:
        await asyncio.wait_for(asyncio.shield(run_task), timeout=timeout_seconds)
    except TimeoutError:
        _pause_quietly(conversation)
        try:
            await asyncio.wait_for(asyncio.shield(run_task), timeout=_PAUSE_GRACE_SECONDS)
        except Exception:  # noqa: BLE001 — the timeout below is the reported failure
            _log.debug("Initialization conversation did not unwind after pause", exc_info=True)
        if not run_task.done():
            # Never leave an orphaned task whose exception nobody retrieves.
            run_task.add_done_callback(_discard_task_result)
        raise


def _discard_task_result(task: asyncio.Task[Any]) -> None:
    if not task.cancelled():
        task.exception()


def _pause_quietly(conversation: Any) -> None:
    """Ask a still-running conversation to stop; never let that mask the timeout."""
    pause = getattr(conversation, "pause", None)
    if pause is None:
        return
    try:
        pause()
    except Exception:  # noqa: BLE001 — best-effort on an already-failing path
        _log.debug("Pausing the initialization conversation failed", exc_info=True)


async def _close_quietly(conversation: Any) -> None:
    """Release the conversation's MCP clients and workspace, whatever happened."""
    close = getattr(conversation, "close", None)
    if close is None:
        return
    try:
        await asyncio.to_thread(close)
    except Exception:  # noqa: BLE001 — cleanup must not replace the real outcome
        _log.warning("Closing the initialization conversation failed", exc_info=True)


@traces(SWR.SWR_2905)
def _serena_reached_the_agent(conversation: Any) -> bool:
    """Whether Serena's tools are on this conversation — the activation verdict.

    Serena is bound to the workspace at launch (SWR-2905), so "did activation
    work?" is really "did Serena start and hand us its toolset?". Reading the
    agent's resolved tool map answers that from the framework's own state rather
    than from anything the model says or does; a docs-only workspace that never
    calls a Serena tool still reports activation accurately.

    A conversation whose agent never initialised answers ``False``: a run that
    could not get that far certainly did not activate anything.
    """
    try:
        tools = conversation.agent.tools_map
    except Exception:  # noqa: BLE001 — an uninitialised agent is a failed activation
        _log.debug("Could not read the initialization agent's tool map", exc_info=True)
        return False
    return SERENA_READY_TOOL in set(tools)


def _snapshot_events(conversation: Any) -> list[Any]:
    """Copy the conversation's events, tolerating a conversation that never started."""
    try:
        return list(conversation.state.events)
    except Exception:  # noqa: BLE001 — a half-built conversation still needs a verdict
        _log.debug("Could not read events from the initialization conversation", exc_info=True)
        return []


# ---------------------------------------------------------------------------
# Verdict


def _collect_tool_calls(events: list[Any]) -> _StepOutcome:
    """Reduce SDK events to the tool calls that were made and how each ended.

    Actions are matched to their outcome by ``tool_call_id``; a call whose
    observation never arrived keeps ``ok=None`` so a run cut short mid-call is
    never mistaken for a success. Errors surface through three distinct event
    types — an ``ObservationEvent`` carrying ``is_error`` (the tool ran and the
    server reported a failure), an ``AgentErrorEvent`` (the tool raised or the
    call was malformed) and a ``UserRejectObservation`` (a policy or hook blocked
    it) — and all three count as a failed call.
    """
    from openhands.sdk.event.llm_convertible import (
        ActionEvent,
        ObservationBaseEvent,
        ObservationEvent,
    )

    order: list[str] = []
    by_key: dict[str, dict[str, Any]] = {}

    def _add(name: str, prefix: str, call_id: Any) -> dict[str, Any]:
        key = str(call_id) if call_id else f"__{prefix}_{len(order)}"
        entry: dict[str, Any] = {"name": name, "ok": None, "detail": ""}
        order.append(key)
        by_key[key] = entry
        return entry

    for event in events:
        if isinstance(event, ActionEvent):
            _add(event.tool_name, "action", getattr(event, "tool_call_id", None))
            continue

        if not isinstance(event, ObservationBaseEvent):
            continue

        call_id = getattr(event, "tool_call_id", None)
        entry = by_key.get(str(call_id)) if call_id else None
        if entry is None:
            # No matching action — an observation replayed from persistence, or
            # a tool the SDK dispatched without emitting an action first.
            entry = _add(event.tool_name, "observation", None)

        if isinstance(event, ObservationEvent):
            observation = getattr(event, "observation", None)
            is_error = bool(getattr(observation, "is_error", False))
            entry["ok"] = not is_error
            entry["detail"] = _preview(observation) if is_error else ""
        else:
            entry["ok"] = False
            entry["detail"] = _preview(
                getattr(event, "error", None) or getattr(event, "rejection_reason", None) or event,
            )

    return _StepOutcome(
        calls=[
            ToolCallRecord(
                name=str(by_key[key]["name"]),
                ok=by_key[key]["ok"],
                detail=str(by_key[key]["detail"]),
            )
            for key in order
        ],
    )


def _preview(value: Any, limit: int = 400) -> str:
    if value is None:
        return ""
    return str(value).strip()[:limit]


_REPORT_LINE_RE = re.compile(
    r"^\s*(activation|onboarding|summary)\s*:\s*(.+?)\s*$",
    re.IGNORECASE | re.MULTILINE,
)


def _parse_final_report(report: str | None) -> dict[str, str]:
    """Extract the ``key: value`` report lines, last occurrence winning.

    The model is told to *end* with the block, so a later line supersedes an
    earlier one it may have written while thinking out loud.
    """
    if not report:
        return {}
    parsed: dict[str, str] = {}
    for match in _REPORT_LINE_RE.finditer(report):
        parsed[match.group(1).lower()] = match.group(2).strip().strip("`").strip()
    return parsed


def _extract_final_report(events: list[Any]) -> str | None:
    """Return the agent's terminal message, or ``None`` if tool activity followed it.

    ``extract_final_response`` works on the flat ``{"role", "content"}``
    transcript shape the orchestrator uses, so the SDK events are projected onto
    it first. Only the roles that function needs are reproduced: ``tool`` marks
    activity that invalidates an earlier "final" message; ``agent``/``user``
    carry text.
    """
    from openhands.sdk.event.llm_convertible import (
        ActionEvent,
        MessageEvent,
        ObservationBaseEvent,
    )

    from rotaris_core.orchestrator.report import extract_final_response

    transcript: list[dict[str, Any]] = []
    for event in events:
        if isinstance(event, ActionEvent | ObservationBaseEvent):
            transcript.append({"role": "tool", "content": ""})
        elif isinstance(event, MessageEvent):
            transcript.append(
                {
                    "role": str(event.source),
                    "content": _message_text(getattr(event, "llm_message", None)),
                },
            )
    return extract_final_response(transcript)


def _message_text(llm_message: Any) -> str:
    parts = getattr(llm_message, "content", None) or []
    chunks = [str(getattr(part, "text", "") or "") for part in parts]
    return "\n".join(chunk for chunk in chunks if chunk).strip()


def _default_summary(activation: str, onboarding: str) -> str:
    if activation != "success":
        return (
            "Serena did not start for this project, so initialization did not complete. "
            "Check that the Serena MCP server is installed and configured, then retry."
        )
    if onboarding == "skipped-no-code":
        return (
            "Serena is activated for this project. No code memories were created "
            "because the workspace contains documentation only."
        )
    if onboarding == "success":
        return "Serena is activated for this project and its onboarding memories are written."
    return (
        "Serena is activated for this project, but writing its onboarding memories failed. "
        "Retry initialization to complete the setup."
    )


async def _finalize(
    workspace_root: Path,
    classification: ProjectKind,
    events: list[Any],
    *,
    run_error: str | None,
    timed_out: bool,
    serena_ready: bool,
) -> SerenaInitResult:
    """Turn the run's events into a verdict, and write the marker when it passed."""
    outcome = _collect_tool_calls(events)
    final_report = _extract_final_report(events)
    reported = _parse_final_report(final_report)

    # Decided by the framework, not by the run: Serena is bound at launch
    # (SWR-2905), so activation succeeded exactly when its toolset arrived.
    activation: ActivationStatus = "success" if serena_ready else "failure"

    onboarding: OnboardingStatus
    if outcome.succeeded(ONBOARDING_TOOL) and outcome.succeeded(WRITE_MEMORY_TOOL):
        onboarding = "success"
    elif outcome.attempted(ONBOARDING_TOOL):
        onboarding = "failure"
    elif classification == "non-code":
        onboarding = "skipped-no-code"
    else:
        onboarding = "failure"

    warnings: list[str] = []
    if classification == "non-code" and outcome.attempted(ONBOARDING_TOOL):
        warnings.append(
            "The agent ran Serena onboarding even though the project is classified "
            "non-code; the skip rule (SWR-2804) was not honoured.",
        )
    warnings.extend(_report_discrepancies(reported, onboarding))

    ok = activation == "success" and onboarding in {"success", "skipped-no-code"}
    if run_error is not None and not ok:
        error: str | None = run_error
    elif run_error is not None:
        # A crashed or timed-out run may still have completed both steps before
        # it died. The events decide the verdict, but the incident is recorded.
        warnings.append(run_error)
        error = None
    elif ok:
        error = None
    else:
        error = _failure_reason(outcome, activation, onboarding, timed_out=timed_out)

    summary = reported.get("summary") or _default_summary(activation, onboarding)

    # The `initialization:` marker is written by the registry, not here — it is
    # the sole writer for every task, so a future task author cannot forget it,
    # and a failed write downgrades the task to a retryable failure there
    # (`registry._record_or_fail`). Running this task directly, outside
    # `run_pending_tasks`, therefore records nothing by design.
    _log.info(
        "Serena initialization finished — ok=%s activation=%s onboarding=%s tools=%s",
        ok,
        activation,
        onboarding,
        ",".join(record.name for record in outcome.calls) or "-",
    )

    return SerenaInitResult(
        task_id=SERENA_TASK_ID,
        status="success" if ok else "failure",
        steps=(
            InitStepResult(
                name=ACTIVATION_STEP,
                status=activation,
                detail=(
                    "Serena's tools did not reach this run." if activation == "failure" else ""
                ),
            ),
            InitStepResult(
                name=ONBOARDING_STEP,
                status=onboarding,
                detail=outcome.failure_detail(ONBOARDING_TOOL) if onboarding == "failure" else "",
            ),
        ),
        classification=classification,
        error=error,
        retryable=not ok,
        summary=summary,
        final_report=final_report,
        tool_calls=tuple(outcome.calls),
        warnings=tuple(warnings),
    )


def _report_discrepancies(
    reported: dict[str, str],
    onboarding: OnboardingStatus,
) -> list[str]:
    """Flag where the model's prose disagrees with its own tool calls.

    Only the onboarding line is compared. Activation is not the model's to claim
    — it is decided by the framework (SWR-2905) — and an agent that volunteers an
    activation line anyway is reporting on something it cannot observe, so its
    answer is neither trusted nor argued with.
    """
    claimed = reported.get(ONBOARDING_STEP)
    if claimed and claimed.lower() != onboarding:
        return [
            f"The agent reported '{ONBOARDING_STEP}: {claimed}' but its tool calls show "
            f"'{onboarding}'; the tool calls decide.",
        ]
    return []


def _failure_reason(
    outcome: _StepOutcome,
    activation: ActivationStatus,
    onboarding: OnboardingStatus,
    *,
    timed_out: bool,
) -> str:
    if timed_out:
        return "The project-initializer agent timed out before completing initialization."
    if activation == "failure":
        return (
            "Serena's tools never reached the project-initializer, so this workspace "
            "was not activated; the Serena MCP server is most likely unavailable."
        )
    if onboarding == "failure":
        if not outcome.attempted(ONBOARDING_TOOL):
            return (
                "The project is a code project but the agent never called Serena's "
                "`onboarding`, so no project memories were written."
            )
        if outcome.succeeded(ONBOARDING_TOOL) and not outcome.succeeded(WRITE_MEMORY_TOOL):
            detail = outcome.failure_detail(WRITE_MEMORY_TOOL)
            return (
                "Serena's `onboarding` ran but no project memory was written"
                f"{f': {detail}' if detail else '.'}"
            )
        detail = outcome.failure_detail(ONBOARDING_TOOL)
        return f"Serena's `onboarding` failed{f': {detail}' if detail else '.'}"
    return "Serena initialization did not complete."


def _agent_setup_failure(classification: ProjectKind, *, error: str) -> SerenaInitResult:
    """Result for a run that never got as far as stepping the agent.

    Covers both halves of setup — building the agent and opening the
    conversation (which is where MCP clients start), so a Serena server that is
    missing or crashes on launch lands here rather than raising.
    """
    onboarding: OnboardingStatus = "skipped-no-code" if classification == "non-code" else "failure"
    return SerenaInitResult(
        task_id=SERENA_TASK_ID,
        status="failure",
        steps=(
            InitStepResult(name=ACTIVATION_STEP, status="failure", detail=error),
            InitStepResult(name=ONBOARDING_STEP, status=onboarding),
        ),
        classification=classification,
        error=f"The project-initializer could not start: {error}",
        retryable=True,
        summary=(
            "Serena initialization could not start. Check that the Serena MCP server "
            "is installed and configured, then retry."
        ),
    )
