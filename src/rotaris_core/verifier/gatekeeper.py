"""One bounded, detached turn in which the gatekeeper authors a gate (SWR-2614).

The shape is deliberately the one
:mod:`rotaris_core.init.serena_task` already proved for a system-only persona: a
bare :class:`~openhands.sdk.LocalConversation`, no visualizer, a narrowed
permission policy scoped to this run's binding key, a wall-clock budget, and a
result read from the *events* rather than from what the model said about itself.

Four properties are load-bearing, and none of them is a matter of prompt
discipline:

- **It never takes part in the running task.** Authoring is scheduled after an
  iteration reaches its terminal state (SWR-2615), so nothing it does can
  influence a decision the task was making.
- **A failure leaves the gate exactly as it was.** Every path returns a result;
  none raises into the caller. An unwritable, unreachable or unhelpful
  gatekeeper is never an aborted run.
- **What it changed is read from the write tool, not from its report.** The
  executor records every write it performed, so "the gate moved" is an
  observation rather than a claim.
- **It cannot weaken the gate.** That rule lives in
  :func:`~rotaris_core.verifier.gate_writer.authorize_gate_write`, called by the
  tool before it touches the file — so it holds whatever the persona was told,
  understood, or decided.
"""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING, Any, NamedTuple

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.tools.gate_tools import (
    GATE_WRITE_TOOL_NAME,
    PROBE_TOOL_NAME,
    GateWriteExecutor,
    ProbeExecutor,
)

if TYPE_CHECKING:
    from collections.abc import Callable
    from pathlib import Path

    from openhands.sdk import LLM, Agent

    from rotaris_core.config.schema import PersonaConfig, RotarisConfig
    from rotaris_core.verifier.gate_writer import GateWrite

_log = logging.getLogger(__name__)

__all__ = [
    "GATEKEEPER_PERSONA",
    "GatekeeperOutcome",
    "author_gate",
    "author_gate_sync",
    "resolve_gatekeeper_model",
]

GATEKEEPER_PERSONA = "gatekeeper"

#: Wall-clock budget for one authoring turn. Reading a few manifests, probing a
#: handful of commands and writing one section is a minute's work; a gatekeeper
#: still going after this is not going to finish.
DEFAULT_TIMEOUT_SECONDS = 180.0

#: Upper bound on agent steps, so a persona that loops on a refused write stops.
DEFAULT_MAX_ITERATIONS = 20


@traces(SWR.SWR_2614)
class GatekeeperOutcome(NamedTuple):
    """What one authoring turn did to the gate, and what stopped it."""

    #: Every write the tool actually performed, refusals included.
    writes: tuple[GateWrite, ...] = ()
    #: Why the turn produced nothing. Empty when it ran to completion.
    failure: str = ""

    @property
    def wrote(self) -> bool:
        """Whether the gate actually changed."""
        return any(write.written for write in self.writes)

    @property
    def refusals(self) -> tuple[str, ...]:
        """Changes the persona proposed that its authority did not cover.

        These are what SWR-2617 turns into approval-gated proposals: the
        gatekeeper found something it believes should change and correctly could
        not do it.
        """
        return tuple(write.refusal for write in self.writes if write.refusal)

    def describe(self) -> str:
        """One line for the report and the timeline."""
        if self.failure:
            return f"the gate was not authored: {self.failure}"
        if not self.writes:
            return "the gatekeeper found nothing bindable and wrote nothing"
        return "; ".join(write.describe() for write in self.writes)


@traces(SWR.SWR_2614)
def resolve_gatekeeper_model(config: RotarisConfig) -> str:
    """The model gate authoring runs on.

    ``gatekeeper_model`` first, then the chain every other meta-call in this
    repository already walks. Authoring is a short, cheap, once-per-techstack
    job; inheriting a task persona's large model for it would be paying for
    nothing.
    """
    persona = config.personas.get(GATEKEEPER_PERSONA)
    return (
        config.gatekeeper_model
        or config.small_model
        or config.default_summary_model
        or config.fallback_model
        or (persona.model if persona is not None else "")
    )


@traces(SWR.SWR_2614)
def author_gate_sync(
    config: RotarisConfig,
    workspace_root: Path,
    **kwargs: Any,
) -> GatekeeperOutcome:
    """Blocking :func:`author_gate`, for a caller with no event loop."""
    return asyncio.run(author_gate(config, workspace_root, **kwargs))


@traces(SWR.SWR_2614, SWR.SWR_2615)
async def author_gate(
    config: RotarisConfig,
    workspace_root: Path,
    *,
    reason: str = "the workspace's techstack changed",
    llm: LLM | None = None,
    conversation_factory: Callable[[Agent], Any] | None = None,
    permission_engine: Any | None = None,
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    max_iterations: int = DEFAULT_MAX_ITERATIONS,
) -> GatekeeperOutcome:
    """Give the gatekeeper one turn to author *workspace_root*'s gate.

    Returns what happened. Never raises: an unconfigured persona, an unreachable
    model, a conversation that will not open and a turn that runs out of budget
    are all outcomes a caller reports, not exceptions that end a run.
    """
    persona = config.personas.get(GATEKEEPER_PERSONA)
    if persona is None:
        return GatekeeperOutcome(
            failure=f"persona {GATEKEEPER_PERSONA!r} is not configured in this workspace",
        )

    writer = GateWriteExecutor(workspace_root)
    prober = ProbeExecutor(
        workspace_root,
        engine=permission_engine,
        persona=GATEKEEPER_PERSONA,
        timeout=config.verifier.probe_timeout,
    )

    try:
        agent = await asyncio.to_thread(_build_agent, persona, config, llm, prober, writer)
    except Exception as error:  # noqa: BLE001 - reported, never raised
        _log.warning("Gate authoring could not build the gatekeeper agent: %s", error)
        return GatekeeperOutcome(failure=f"the gatekeeper agent could not be built ({error})")

    try:
        conversation = await asyncio.to_thread(
            _create_conversation,
            agent,
            workspace_root,
            conversation_factory=conversation_factory,
            max_iterations=max_iterations,
        )
    except Exception as error:  # noqa: BLE001
        _log.warning("Gate authoring could not open a conversation: %s", error)
        return GatekeeperOutcome(failure=f"the gatekeeper conversation could not open ({error})")

    failure = ""
    try:
        try:
            await asyncio.to_thread(
                conversation.send_message,
                build_task_message(workspace_root, reason),
            )
            await asyncio.wait_for(
                asyncio.to_thread(conversation.run),
                timeout_seconds,
            )
        except TimeoutError:
            failure = f"the gatekeeper did not finish within {timeout_seconds:.0f}s"
            _log.warning("Gate authoring timed out after %.0fs", timeout_seconds)
        except Exception as error:  # noqa: BLE001
            failure = f"the gatekeeper failed ({error})"
            _log.warning("Gate authoring run failed: %s", error, exc_info=True)
    finally:
        await _close_quietly(conversation)

    # Read from the tool, never from the persona's own account of itself.
    return GatekeeperOutcome(writes=tuple(writer.writes), failure=failure)


@traces(SWR.SWR_2614, SWR.SWR_2615)
def build_task_message(workspace_root: Path, reason: str) -> str:
    """The one instruction the turn starts from."""
    return (
        f"Author the quality gate for the workspace at {workspace_root}.\n\n"
        f"Why now: {reason}.\n\n"
        "Read the manifests — including any sub-projects — decide which commands "
        "represent this project's tests, type checks and linting, probe every one "
        "of them with verifier_probe, and write the surviving checks with "
        "verifier_gate_write in a single call.\n\n"
        "Bind nothing that probed 'unavailable'. If nothing is bindable, write "
        "nothing and say so."
    )


def _build_agent(
    persona: PersonaConfig,
    config: RotarisConfig,
    llm: LLM | None,
    prober: ProbeExecutor,
    writer: GateWriteExecutor,
) -> Agent:
    """The persona's agent, with the two gate tools attached to this run alone."""
    from rotaris_core.agents import factory as agents_factory
    from rotaris_core.config import loader as config_loader

    resolved = llm
    if resolved is None:
        model = resolve_gatekeeper_model(config)
        resolved = config_loader.load_llm_for_model(
            config,
            model,
            # A bare conversation wires no token callback, so asking for a stream
            # buys nothing and makes some providers reject the request body — the
            # same reasoning `init/serena_task.py` records.
            stream=False,
            usage_id=config_loader.build_llm_usage_id(
                "agent",
                model_name=model,
                scope=GATEKEEPER_PERSONA,
            ),
        )
    # The executors are bound to one workspace, so they travel on the agent's
    # runtime binding rather than in a factory closure: the SDK tool registry is
    # process-global and resolves a spec when its conversation starts, which is
    # long after this returns (SWR-2426).
    agent = agents_factory.create_agent_for_persona(
        persona,
        config,
        runtime_kwargs={"gate_tools": (prober, writer)},
    )(resolved)
    agent = _attach_gate_tools(agent)
    _grant_gate_tools(agent, persona)
    return agent


@traces(SWR.SWR_2614)
def _attach_gate_tools[AgentT: Agent](agent: AgentT) -> AgentT:
    """Give this agent the two gate tools, and no other agent them.

    Added to the built agent rather than declared in ``persona.tools``, because a
    persona's tool list is validated against ``ALLOWED_PUBLIC_TOOL_NAMES`` — which
    is precisely the property that keeps these two out of every configuration
    file, and therefore out of every other persona's reach.
    """
    from openhands.sdk.tool import Tool

    from rotaris_core.agents.tool_registration import register_gate_tool_factories

    register_gate_tool_factories()
    params = {"binding_key": str(getattr(agent, "permission_binding_key", "") or "")}
    copied: AgentT = agent.model_copy(
        update={
            "tools": [
                *(getattr(agent, "tools", []) or []),
                Tool(name=PROBE_TOOL_NAME, params=params),
                Tool(name=GATE_WRITE_TOOL_NAME, params=params),
            ],
        },
    )
    return copied


@traces(SWR.SWR_2614, SWR.SWR_2501)
def _grant_gate_tools(agent: Agent, persona: PersonaConfig) -> None:
    """Pre-approve the two gate tools for this run, and narrow nothing else.

    The same prepend-a-rule arrangement ``init/serena_task`` uses: the workspace's
    configured preset still decides every other tool, path and command, and the
    grant is bound to this agent's permission binding key so it cannot leak into
    another run.
    """
    from rotaris_core.permissions import (
        Decision,
        PermissionPolicy,
        PermissionRule,
        resolve_permission_engine,
    )

    binding_key = getattr(agent, "permission_binding_key", None)
    if binding_key is None:
        _log.debug("Gatekeeper agent exposes no permission binding key; using workspace defaults")
        return
    engine = resolve_permission_engine(binding_key)
    base = engine.policy
    engine.set_policy(
        PermissionPolicy(
            rules=(
                PermissionRule(
                    rule_id="gatekeeper:gate-tools",
                    decision=Decision.ALLOW,
                    tools=frozenset({PROBE_TOOL_NAME, GATE_WRITE_TOOL_NAME}),
                    personas=frozenset({persona.name}),
                    description="Gate authoring tools invoked by the gatekeeper.",
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
    conversation_factory: Callable[[Agent], Any] | None,
    max_iterations: int,
) -> Any:
    if conversation_factory is not None:
        return conversation_factory(agent)

    from openhands.sdk import LocalConversation

    return LocalConversation(
        agent=agent,
        workspace=workspace_root,
        visualizer=None,
        delete_on_close=False,
        max_iteration_per_run=max_iterations,
    )


async def _close_quietly(conversation: Any) -> None:
    close = getattr(conversation, "close", None)
    if close is None:
        return
    try:
        await asyncio.to_thread(close)
    except Exception as error:  # noqa: BLE001 - closing must not become the failure
        _log.debug("Gatekeeper conversation did not close cleanly: %s", error)
