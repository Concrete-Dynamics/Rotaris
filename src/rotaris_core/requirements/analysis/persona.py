"""Which persona does an agentic requirements job, and on which model.

SWR-3117 declared the roster — ``config.requirements.personas`` names a persona
for source discovery, decomposition, execution, impact analysis and migration
analysis — and nothing read it. This module is the reader.

Two decisions are worth stating, because both are deliberate departures.

**An unknown persona name never fails the load.** The schema promises it
(``RequirementPersonaConfig``): a workspace whose configuration points at a
persona somebody has since renamed must still open. Resolution therefore falls
back to ``config.default_persona`` and *says so* in the result, so a caller can
report the substitution rather than silently analysing with the wrong voice.
Only a workspace where neither the requested persona nor the default exists is
a real error, and it surfaces where the analysis is attempted, not at startup.

**The persona contributes its model and its purpose, not its system prompt.** A
persona's rendered prompt (``agents.factory._render_prompt``) is written for an
agent: it enumerates tools, MCP servers and delegates. A one-shot judge has
none of those, and handing it a prompt that describes tools it cannot call is
an invitation to answer as if it had used them. What the persona is *for* is
the useful part, and that is :attr:`PersonaConfig.purpose`.

**The resolution carries how long an answer may take.** A model and a deadline
for it are the same configuration read, and splitting them is what let the judge
enforce a limit shorter than the transport's own — see :func:`analyst_timeout`.
Resolving the two together means every composition that already asks *who*
answers gets *how long they have* without asking for it.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.analysis.judge import DEFAULT_JUDGE_TIMEOUT

if TYPE_CHECKING:
    from openhands.sdk import LLM

    from rotaris_core.config.schema import RotarisConfig

__all__ = [
    "PersonaResolutionError",
    "RequirementJob",
    "ResolvedAnalyst",
    "analyst_llm",
    "analyst_timeout",
    "resolve_analyst",
]


#: The agentic requirements jobs, one per field of ``RequirementPersonaConfig``.
RequirementJob = Literal[
    "source_discovery",
    "decomposition",
    "execution",
    "impact_analysis",
    "migration_analysis",
]

_JOBS: tuple[RequirementJob, ...] = (
    "source_discovery",
    "decomposition",
    "execution",
    "impact_analysis",
    "migration_analysis",
)


#: How many full provider answers one judgement may need: the answer itself, and
#: the repair retry that hands a parse error back. A budget that covers only one
#: turns "it had to be asked twice" into "the provider is down".
ANSWERS_PER_JUDGEMENT = 2


class PersonaResolutionError(RuntimeError):
    """Neither the configured persona nor the workspace default exists.

    Raised where an analysis is attempted, never while loading configuration —
    an unopenable workspace is a worse outcome than an analysis that reports it
    cannot run.
    """


@traces(SWR.SWR_3117)
@dataclass(frozen=True)
class ResolvedAnalyst:
    """The persona and model that will answer for one job."""

    job: RequirementJob
    #: What ``config.requirements.personas.<job>`` asked for.
    requested_persona: str
    #: What was actually resolved — differs from *requested_persona* on fallback.
    persona: str
    model: str
    purpose: str
    #: The wall clock one question on :attr:`model` gets, from that model's own
    #: configuration (:func:`analyst_timeout`). Defaulted so a caller that builds
    #: this by hand — every test that skips :func:`resolve_analyst` does — still
    #: gets the judge's floor rather than no timeout at all.
    timeout: float = DEFAULT_JUDGE_TIMEOUT

    @property
    def substituted(self) -> bool:
        """True when the requested persona did not exist and the default stood in."""
        return self.persona != self.requested_persona

    def describe(self) -> str:
        """One line naming persona and model, and the substitution when there was one."""
        base = f"{self.job}: persona {self.persona!r} on model {self.model!r}"
        if not self.substituted:
            return base
        return f"{base} (configured persona {self.requested_persona!r} does not exist)"


@traces(SWR.SWR_3117, SWR.SWR_3106, SWR.SWR_3404, SWR.SWR_3411, SWR.SWR_3503, SWR.SWR_3507)
def resolve_analyst(config: RotarisConfig, job: RequirementJob) -> ResolvedAnalyst:
    """Resolve *job* to the persona and model that will do it.

    Falls back to ``config.default_persona`` when the configured name resolves
    to nothing, and records that in :attr:`ResolvedAnalyst.substituted`.

    Raises:
        PersonaResolutionError: neither the configured persona nor the default
            is defined in this workspace.
    """
    if job not in _JOBS:  # pragma: no cover — Literal keeps callers honest.
        raise PersonaResolutionError(f"unknown requirements job {job!r}")

    requested = str(getattr(config.requirements.personas, job))
    persona = config.personas.get(requested)
    resolved_name = requested

    if persona is None:
        fallback = config.default_persona
        persona = config.personas.get(fallback)
        resolved_name = fallback
        if persona is None:
            raise PersonaResolutionError(
                f"requirements.personas.{job} names persona {requested!r}, which is not "
                f"configured, and the workspace default persona {fallback!r} is not "
                f"configured either — no analyst can run this job",
            )

    return ResolvedAnalyst(
        job=job,
        requested_persona=requested,
        persona=resolved_name,
        model=persona.model,
        purpose=persona.purpose or "",
        timeout=analyst_timeout(config, persona.model),
    )


@traces(SWR.SWR_3117, SWR.SWR_3503)
def analyst_timeout(config: RotarisConfig, model: str) -> float:
    """How long one question on *model* may take, read from *model*'s own configuration.

    The judge capped every analysis at :data:`DEFAULT_JUDGE_TIMEOUT` — 90 s,
    written into the module and read from nowhere — while the transport
    underneath it was configured to allow ``runtime.model_timeout`` (120 s by
    default) for a *single* HTTP attempt, with retries on top. The two limits
    could therefore only disagree, and the shorter one always won: the judge cut
    off calls the workspace still considered healthy, and a reasoning model
    planning the decomposition of a real requirement was reported as a
    ``model-error`` before its first attempt had run out of time. That blocks the
    requirement, so a slow answer became a stopped delivery.

    The budget now comes from the same field ``load_llm_for_model`` reads —
    ``ModelConfig.timeout``, whose whole documented purpose is slow reasoning
    models, falling back to ``runtime.model_timeout`` — multiplied by the answers
    one judgement may need (:data:`ANSWERS_PER_JUDGEMENT`). Raising a model's
    timeout now raises the patience of everything that asks it a question, rather
    than leaving a second, invisible limit to fire first.

    :data:`DEFAULT_JUDGE_TIMEOUT` survives as the floor, so a workspace that
    shortens its transport timeout for interactive work does not thereby make
    every analysis unanswerable.
    """
    model_config = config.models.get(model)
    per_attempt = (
        model_config.timeout
        if model_config is not None and model_config.timeout is not None
        else config.runtime.model_timeout
    )
    return max(DEFAULT_JUDGE_TIMEOUT, float(per_attempt) * ANSWERS_PER_JUDGEMENT)


@traces(SWR.SWR_3117)
def analyst_llm(config: RotarisConfig, resolved: ResolvedAnalyst) -> LLM:
    """Build the LLM handle for *resolved*.

    ``stream=False`` on purpose: this is a meta-call whose whole answer is one
    small JSON object, and a streamed answer would buy latency nobody watches
    while costing the parse a partial payload.
    """
    from rotaris_core.config.loader import build_llm_usage_id, load_llm_for_model

    return load_llm_for_model(
        config,
        resolved.model,
        stream=False,
        usage_id=build_llm_usage_id(
            "requirements",
            model_name=resolved.model,
            scope=resolved.job,
        ),
    )
