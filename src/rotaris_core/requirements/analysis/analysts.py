"""The five model-backed analysts the engines of this epic were built to accept.

Every engine here declares its own narrow ``Protocol`` next to itself —
``SourceAnalyst`` (SWR-3106), ``DecompositionModel`` (SWR-3404),
``DerivationModel`` (SWR-3411), ``ImpactModel`` (SWR-3503) and
``MigrationAnalyst`` (SWR-3507) — and until now every one of them had exactly
zero implementations. The engines were reachable only from a test that scripted
the answer itself, which is how five ``approved`` requirements ended up with no
production path at all. This module is those implementations, and each of them
is the thinnest thing that can satisfy its protocol.

**They do not validate.** Every engine already owns a tolerant reader that
carries the downgrade policy — ``impact.read_verdict``,
``decomposition.read_proposal``, ``derivation.read_technical_proposal``,
``superseding.read_action`` — and each turns an unreadable answer into a stated,
human-facing outcome rather than a guess. A second policy here would compete
with those and the weaker one would win. An analyst's job therefore ends where
the judge's does: at "JSON text to ``Mapping``". What little reading is left is
*shape*, not judgement — pulling the list out of ``{"proposals": [...]}``,
keying decisions by their site — because the protocols ask for a list and a
mapping where a judge answers with one object.

**They constrain the answer with the engine's own vocabulary.** Every schema is
built from the enum or the model the payload will be read back with
(:class:`~rotaris_core.requirements.change.impact.ImpactOutcome`,
:class:`~rotaris_core.requirements.change.superseding.MigrationAction`,
``PlannedUnit.model_fields``), so the set a provider is restricted to and the
set the reader accepts cannot drift apart. The prompts name the same vocabulary
and a test holds them to it.

**They hold nothing that can write.** ``impact.read_only_report`` checks an
analyser's collaborators structurally for a write operation, and an analyst is
one of them. The model handle is private and nothing here is named anything
resembling ``write``, ``save``, ``create``, ``update`` or ``delete``.

**The model handle is built on first use.** ``analyst_llm`` pulls the OpenHands
SDK in, which costs seconds, and the desktop composes a requirement flow on the
Qt thread. :func:`deferred_completion` therefore hands the judge a callable that
resolves the persona's model the first time an answer is actually needed, so
composing an analyst costs nothing and asking one costs what it costs.

**A failure is raised, not answered.** Four of the five engines already turn an
analyst that raises into a stated result — an ``ImpactFailure``, a
``model-error`` rejection, no proposal, a worklist of open questions — and a
verdict invented here would take that record away from them. The two exceptions
are the ones whose consumer has no failure channel: :class:`RequirementAssessor`
feeds a plain callable the flow would *stop* on, and
:class:`SourceDiscoveryAnalyst` answers ``None`` because ``propose`` says that
is what "nothing can be said" looks like.
"""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING, Any, ClassVar, Self, get_origin

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.analysis.judge import (
    JudgeError,
    StructuredJudge,
    enum_schema,
)
from rotaris_core.requirements.analysis.persona import (
    PersonaResolutionError,
    analyst_llm,
    resolve_analyst,
)

if TYPE_CHECKING:
    from collections.abc import Callable, Mapping, Sequence

    from rotaris_core.config.schema import RotarisConfig
    from rotaris_core.requirements.analysis.persona import RequirementJob, ResolvedAnalyst
    from rotaris_core.requirements.change.impact import ImpactRequest
    from rotaris_core.requirements.change.superseding import MigrationRequest
    from rotaris_core.requirements.execution.decomposition import (
        DecompositionRequest,
        RequirementAssessment,
    )
    from rotaris_core.requirements.execution.derivation import DerivationRequest
    from rotaris_core.requirements.model import CanonicalRequirement
    from rotaris_core.requirements.sources.discovery import (
        ArtifactCandidate,
        RepositorySurvey,
        SourceAnalyst,
        SourceProposal,
    )

_log = logging.getLogger(__name__)

__all__ = [
    "LIST_LIMIT",
    "DecompositionAnalyst",
    "DerivationAnalyst",
    "ImpactAnalyst",
    "RequirementAssessor",
    "SourceDiscoveryAnalyst",
    "SupersedingAnalyst",
    "UnavailableAnalyst",
    "assessment_prompt",
    "assessment_schema",
    "decomposition_prompt",
    "decomposition_schema",
    "deferred_completion",
    "derivation_prompt",
    "derivation_schema",
    "impact_prompt",
    "impact_schema",
    "migration_prompt",
    "migration_schema",
    "source_analysts_for",
    "source_prompt",
    "source_schema",
]

#: How many list entries a prompt carries before it says how many it left out.
#: A requirement with three hundred trace sites must still produce a prompt a
#: model can read and a bill somebody is willing to pay.
LIST_LIMIT = 40


# --------------------------------------------------------------------------
# Reaching the model: late, and through one callable
# --------------------------------------------------------------------------


@traces(SWR.SWR_3117)
def deferred_completion(
    config: RotarisConfig,
    resolved: ResolvedAnalyst,
) -> Callable[..., object]:
    """The persona's model call, built on first use rather than on construction.

    Returned as a plain callable — the same seam the judge takes and every test
    here fills — so nothing about composing an analyst touches a provider, an
    API key or the SDK import. A composition that never asks a question never
    pays for one.
    """
    handle: Any = None

    def complete(messages: object, **kwargs: object) -> object:
        nonlocal handle
        if handle is None:
            handle = analyst_llm(config, resolved)
        return handle.completion(messages, **kwargs)

    return complete


@traces(SWR.SWR_3117)
class _Analyst:
    """What all five share: a persona, one question, one structured answer.

    Subclasses add exactly one method — the one their protocol declares — and a
    pair of prompt builders. Everything about reaching a model, timing it out
    and turning its text into an object is here, once.
    """

    #: Which ``config.requirements.personas`` field answers for this analyst.
    JOB: ClassVar[RequirementJob]

    def __init__(
        self,
        resolved: ResolvedAnalyst,
        *,
        completion: Callable[..., object],
        timeout: float | None = None,
    ) -> None:
        self._who = resolved
        self._complete = completion
        # None, not a constant: how long an answer may take is a fact about the
        # model that was resolved, and ``resolve_analyst`` read it from the same
        # configuration the transport reads. A default of
        # ``DEFAULT_JUDGE_TIMEOUT`` here would silently override it with a limit
        # shorter than one HTTP attempt for every composition that does not pass
        # one — which is every composition (SWR-3117).
        self._timeout = resolved.timeout if timeout is None else timeout

    @classmethod
    def for_config(cls, config: RotarisConfig, *, timeout: float | None = None) -> Self:
        """The analyst this workspace configures for :attr:`JOB` (SWR-3117).

        Raises:
            PersonaResolutionError: neither the configured persona nor the
                workspace default exists.
        """
        resolved = resolve_analyst(config, cls.JOB)
        return cls(resolved, completion=deferred_completion(config, resolved), timeout=timeout)

    @property
    def persona(self) -> str:
        """The persona this analyst answers as (SWR-3117)."""
        return self._who.persona

    @property
    def model_name(self) -> str:
        """The model its answers are recorded against (SWR-3514)."""
        return self._who.model

    @property
    def resolved(self) -> ResolvedAnalyst:
        """Persona, model and whether the configured name had to be substituted."""
        return self._who

    def _system(self, instruction: str) -> str:
        """The system prompt: who is answering, what for, and the task."""
        lines = [
            f"You are {self._who.persona}, answering one question for Rotaris'"
            f" {self._who.job.replace('_', ' ')}.",
        ]
        if self._who.purpose:
            lines.append(f"Your standing purpose: {self._who.purpose}")
        lines.append(instruction)
        return "\n\n".join(lines)

    def _answer(
        self,
        *,
        system: str,
        user: str,
        schema: Mapping[str, Any] | None = None,
    ) -> Mapping[str, Any]:
        """Ask once and return the object that came back.

        Synchronous because every protocol here is: concurrency belongs to the
        scheduler, not to an analyst. The ``asyncio.run`` is the same wrap the
        desktop's ``AgentRunHost`` uses around its own async entry points, and
        like it this is called on a worker thread, never on Qt's.

        Raises:
            JudgeError: the model timed out, was unreachable, or twice answered
                with something that is not a JSON object.
        """
        judge = StructuredJudge(
            schema=schema,
            timeout=self._timeout,
            completion=self._complete,
            # Named so a format this model refuses is refused once per process
            # rather than once per question (SWR-919).
            model=self._who.model,
        )
        return asyncio.run(judge.judge(system=system, user=user))


# --------------------------------------------------------------------------
# Prompt plumbing
# --------------------------------------------------------------------------


def _listing(values: Sequence[str], *, limit: int = LIST_LIMIT, indent: str = "  ") -> str:
    """*values* as an indented block, bounded, stating what it left out."""
    if not values:
        return f"{indent}(none)"
    shown = [f"{indent}{value}" for value in values[:limit]]
    if len(values) > limit:
        shown.append(f"{indent}... and {len(values) - limit} more")
    return "\n".join(shown)


def _block(title: str, values: Sequence[str], *, limit: int = LIST_LIMIT) -> str:
    """One titled, counted, bounded section of a prompt."""
    return f"{title} ({len(values)}):\n{_listing(values, limit=limit)}"


def _typed_properties(fields: Mapping[str, Any], *, skip: frozenset[str]) -> dict[str, Any]:
    """A JSON-Schema property table derived from a Pydantic model's own fields.

    Derived rather than written out so the shape a provider is constrained to
    and the shape the engine's reader accepts cannot drift: adding a field to
    ``PlannedUnit`` adds it here, and a test asserts exactly that.
    """
    properties: dict[str, Any] = {}
    for name, field in fields.items():
        if name in skip:
            continue
        annotation = field.annotation
        if get_origin(annotation) is tuple:
            properties[name] = {"type": "array", "items": {"type": "string"}}
        elif annotation is bool:
            properties[name] = {"type": "boolean"}
        elif annotation is int:
            properties[name] = {"type": "integer"}
        elif annotation is float:
            properties[name] = {"type": "number"}
        else:
            properties[name] = {"type": "string"}
    return properties


def _object_schema(
    name: str,
    *,
    properties: Mapping[str, Any],
    required: Sequence[str],
) -> dict[str, Any]:
    """A ``json_schema`` response format for a shape ``enum_schema`` cannot state.

    Not ``strict``: these carry nested objects and free-form tables, and a
    provider that enforces strict mode over them refuses the whole call. The
    judge's own ladder handles a refusal either way; asking for less here means
    the first rung is usually the one that answers.
    """
    return {
        "type": "json_schema",
        "json_schema": {
            "name": name,
            "schema": {
                "type": "object",
                "properties": dict(properties),
                "required": list(required),
            },
        },
    }


# --------------------------------------------------------------------------
# SWR-3503 — what a requirement change costs
# --------------------------------------------------------------------------


_IMPACT_INSTRUCTION = """\
A requirement that was already delivered has changed. Read the diff between the version the
delivery was made against and the version the requirement has now, and decide what the change
costs. Answer with exactly one outcome from this closed set:

- "no-behavioural-impact": wording, formatting, typography or documentation only. Nothing that
  is built or proved changes.
- "tests-affected": the behaviour is unchanged but what proves it is not.
- "implementation-affected": the behaviour changed and the existing tests still describe it.
- "implementation-and-tests-affected": both moved — the ordinary shape of a changed acceptance
  criterion.
- "decomposition-required": the change is too large for one unit of work and has to be split
  before anything can be built.
- "human-clarification-required": the diff alone cannot decide it. Put the question you would
  ask a human into "question".

State your reasoning in "reasoning": an outcome nobody can check is treated as undecided. List
the facts you weighed in "considered". Answer "human-clarification-required" rather than
guessing; there is no seventh outcome, and you never propose an edit — this analysis reads.
"""


@traces(SWR.SWR_3503)
def impact_schema() -> dict[str, Any]:
    """The response format for an impact verdict, fed from ``ImpactOutcome``."""
    from rotaris_core.requirements.change.impact import ImpactOutcome

    return enum_schema(
        "impact_verdict",
        choice_key="outcome",
        choices=[outcome.value for outcome in ImpactOutcome],
        optional_text_keys=("question",),
        optional_list_keys=("considered",),
    )


@traces(SWR.SWR_3503)
def impact_prompt(request: ImpactRequest) -> str:
    """Everything SWR-3503 says an impact analysis receives, as one prompt.

    The four named inputs — the requirement diff, the existing traces, the
    existing tests and the evidence health — and nothing that could change any
    of them: paths and line numbers, a token, a diff.
    """
    delivered = request.before
    current = request.after
    parts = [
        f"Requirement {request.req_id}: {current.title or '(untitled)'}",
        (
            f"Delivered against version {delivered.content_hash or 'unknown'}"
            f" (source revision {delivered.source_revision or 'unknown'});"
            f" the requirement now reads at version {current.content_hash or 'unknown'}"
            f" (source revision {current.source_revision or 'unknown'})."
        ),
    ]
    if request.delivering_run or request.verified_commit:
        parts.append(
            f"That delivery was run {request.delivering_run or 'unknown'}"
            f" and was verified at commit {request.verified_commit or 'unknown'}.",
        )
    parts.extend(
        (
            f"Lifecycle: {delivered.lifecycle} -> {current.lifecycle}",
            _block("Diff of the requirement text", request.diff, limit=200),
            _block("Implementation traces (@traces sites) claiming it", request.traces),
            _block("Covering tests (@verifies sites)", request.tests),
            f"Evidence health of the existing coverage: {request.evidence or 'unknown'}",
        ),
    )
    if not request.has_tests:
        parts.append("Nothing claims to cover this requirement today.")
    return "\n\n".join(parts)


@traces(SWR.SWR_3503, SWR.SWR_3117)
class ImpactAnalyst(_Analyst):
    """The configured persona, asked what one requirement change costs (SWR-3503).

    Holds a persona, a model name and a callable that reaches a provider — the
    three things ``ImpactAnalyzer`` records an outcome against, and not one
    handle that could change a file, a record or the requirement. That is not
    politeness: ``read_only_report`` walks the analyser's collaborators looking
    for exactly such a handle, and this is one of them.
    """

    JOB: ClassVar[RequirementJob] = "impact_analysis"

    @traces(SWR.SWR_3503)
    def analyse(self, request: ImpactRequest) -> Mapping[str, object]:
        """Answer *request* with an outcome and its reasoning.

        Raises:
            JudgeError: the model was unreachable, timed out, or answered with
                nothing usable — which ``ImpactAnalyzer`` records as an
                ``ImpactFailure`` so the requirement stays in ``Needs Update``.
        """
        return self._answer(
            system=self._system(_IMPACT_INSTRUCTION),
            user=impact_prompt(request),
            schema=impact_schema(),
        )


# --------------------------------------------------------------------------
# SWR-3404 — how large the work is, and how it splits
# --------------------------------------------------------------------------


_ASSESSMENT_INSTRUCTION = """\
Measure how large one requirement's implementation is, before any work starts. Answer with the
eight factors below as numbers — this is data, not a decision: whether the requirement is split
follows from thresholds Rotaris applies to your numbers, and you never see them.

- "affected_components": distinct components or modules the change touches.
- "independent_changes": parts that could each be reviewed on their own.
- "technical_dependencies": ordered steps inside this requirement's own work.
- "test_surface": distinct test surfaces (unit, integration, desktop, ...) involved.
- "architecture_boundaries": architecture boundaries the work crosses.
- "context_tokens": rough size, in tokens, of the context one run would have to hold.
- "parallelisable": whether the parts could genuinely run at the same time.
- "merge_conflict_risk": 0.0 to 1.0, how likely the parts collide on merge.

Count what the requirement's text actually implies. If it describes one small change, say so
with ones and zeros; inflating the numbers costs a user an unnecessary split.
"""


@traces(SWR.SWR_3404)
def assessment_schema() -> dict[str, Any]:
    """The response format for a scope assessment, from ``RequirementAssessment``."""
    from rotaris_core.requirements.execution.decomposition import RequirementAssessment

    properties = _typed_properties(
        RequirementAssessment.model_fields,
        skip=frozenset({"req_id", "notes"}),
    )
    properties["reasoning"] = {"type": "string"}
    return _object_schema(
        "requirement_assessment",
        properties=properties,
        required=["reasoning"],
    )


@traces(SWR.SWR_3404)
def assessment_prompt(requirement: CanonicalRequirement) -> str:
    """The requirement, as the thing whose size is being estimated."""
    return "\n\n".join(
        (
            f"Requirement {requirement.req_id}: {requirement.title or '(untitled)'}",
            f"Lifecycle: {requirement.lifecycle}; type: {requirement.req_type}",
            f"Description:\n{requirement.description or '(empty)'}",
        ),
    )


def _neutral_assessment(req_id: str, note: str) -> RequirementAssessment:
    """The "one ordinary change" assessment, with the reason it is a fallback.

    Every signal at its default is below every threshold, so this yields exactly
    one unit — the same answer a workspace with no assessor at all gets, which is
    the only safe thing to do when the measurement did not happen.
    """
    from rotaris_core.requirements.execution.decomposition import RequirementAssessment

    return RequirementAssessment(req_id=req_id, notes=(note,))


@traces(SWR.SWR_3404)
class RequirementAssessor(_Analyst):
    """The eight factors SWR-3404 assesses a requirement against, measured (SWR-3404).

    Not a protocol implementation — the flow takes a plain
    ``Callable[[CanonicalRequirement], RequirementAssessment]`` — but the same
    kind of thing, and the piece without which decomposition cannot happen at
    all: ``Decomposer`` consults its model only once a signal is over its
    threshold, and an unmeasured requirement has every signal at its default.

    **It never raises.** The flow treats an assessment failure as a reason to
    stop the whole run, and an unreachable provider is not a reason to refuse to
    implement a requirement. A failure therefore becomes the neutral assessment
    with the failure recorded in its notes, which runs the requirement as one
    unit and says why.
    """

    JOB: ClassVar[RequirementJob] = "decomposition"

    @traces(SWR.SWR_3404)
    def __call__(self, requirement: CanonicalRequirement) -> RequirementAssessment:
        """Measure *requirement*, or answer the neutral assessment and say why."""
        try:
            payload = self._answer(
                system=self._system(_ASSESSMENT_INSTRUCTION),
                user=assessment_prompt(requirement),
                schema=assessment_schema(),
            )
        except JudgeError as error:
            _log.info("Scope assessment of %s did not run: %s", requirement.req_id, error)
            return _neutral_assessment(
                requirement.req_id,
                f"the scope assessment did not run ({error}); the requirement is"
                " assessed as one ordinary change",
            )
        return _assessment_from(payload, req_id=requirement.req_id)


def _assessment_from(payload: Mapping[str, object], *, req_id: str) -> RequirementAssessment:
    """Read *payload* as an assessment, keeping only fields the model owns.

    ``req_id`` is the caller's, never the payload's: an assessment that could
    re-target itself would let one requirement's measurement decide another's
    split, and ``Decomposer`` refuses a mismatched pair with an error rather
    than a plan.
    """
    from rotaris_core.requirements.execution.decomposition import (
        DecompositionError,
        RequirementAssessment,
    )

    owned = set(RequirementAssessment.model_fields) - {"req_id", "notes"}
    accepted: dict[str, object] = {
        str(key): value for key, value in payload.items() if str(key) in owned
    }
    accepted["req_id"] = req_id
    reasoning = payload.get("reasoning")
    if isinstance(reasoning, str) and reasoning.strip():
        accepted["notes"] = (reasoning.strip(),)
    try:
        return RequirementAssessment.model_validate(accepted)
    except (DecompositionError, ValueError) as error:
        return _neutral_assessment(
            req_id,
            f"the scope assessment could not be read ({error}); the requirement is"
            " assessed as one ordinary change",
        )


_DECOMPOSITION_INSTRUCTION = """\
A requirement looks too large for one agent run. Propose how to split it into execution units.

Each unit states its own "key" (a short slug its siblings refer to it by), a "title", the
"scope" it is responsible for, and the "rationale" — why it is *separate*, not merely what it
does. "depends_on" names the keys of sibling units this one waits for, and the graph must be
acyclic: a plan whose units wait for each other is rejected and the requirement does not run.
"expected_files" lists the files you expect the unit to touch, so the scheduler can keep
colliding units apart.

Also state a "rationale" for the split as a whole.

You create units, never requirements. Do not answer with a requirement id, a lifecycle, a
type, or anything that authors a requirement; such keys are refused and reported.
"""


@traces(SWR.SWR_3404)
def decomposition_schema() -> dict[str, Any]:
    """The response format for a split proposal, from ``PlannedUnit``'s own fields."""
    from rotaris_core.requirements.execution.decomposition import PlannedUnit

    return _object_schema(
        "decomposition_proposal",
        properties={
            "units": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": _typed_properties(
                        PlannedUnit.model_fields,
                        skip=frozenset(),
                    ),
                    "required": ["key", "scope", "rationale"],
                },
            },
            "rationale": {"type": "string"},
        },
        required=["units", "rationale"],
    )


@traces(SWR.SWR_3404)
def decomposition_prompt(request: DecompositionRequest) -> str:
    """The requirement, what was measured about it, and what pushed it over."""
    assessment = request.assessment
    return "\n\n".join(
        (
            f"Requirement {request.req_id}: {request.title or '(untitled)'}",
            f"Description:\n{request.description or '(empty)'}",
            _block(
                "Signals over their threshold — why a split is being considered",
                tuple(str(signal) for signal in request.triggered),
            ),
            "What was measured:\n"
            + "\n".join(
                (
                    f"  affected components: {assessment.affected_components}",
                    f"  independent changes: {assessment.independent_changes}",
                    f"  technical dependencies: {assessment.technical_dependencies}",
                    f"  test surface: {assessment.test_surface}",
                    f"  architecture boundaries: {assessment.architecture_boundaries}",
                    f"  context size: {assessment.context_tokens} tokens",
                    f"  parallelisable: {assessment.parallelisable}",
                    f"  merge-conflict risk: {assessment.merge_conflict_risk}",
                ),
            ),
            _block("Notes recorded with the measurement", assessment.notes),
            (
                f"Propose at most {request.max_units} unit(s). Fewer is better: a split that"
                " does not make each part reviewable on its own costs more than it saves."
            ),
        ),
    )


@traces(SWR.SWR_3404, SWR.SWR_3117)
class DecompositionAnalyst(_Analyst):
    """The configured persona, asked how one requirement splits (SWR-3404)."""

    JOB: ClassVar[RequirementJob] = "decomposition"

    @traces(SWR.SWR_3404)
    def propose(self, request: DecompositionRequest) -> Mapping[str, object]:
        """Answer *request* with a payload of units and a rationale.

        Raises:
            JudgeError: the planner was unreachable or unusable — which
                ``Decomposer`` turns into a ``model-error`` rejection the flow
                reports and stops at.
        """
        return self._answer(
            system=self._system(_DECOMPOSITION_INSTRUCTION),
            user=decomposition_prompt(request),
            schema=decomposition_schema(),
        )


# --------------------------------------------------------------------------
# SWR-3411 — did this run create a lasting obligation?
# --------------------------------------------------------------------------


_DERIVATION_INSTRUCTION = """\
An execution run has finished. Decide whether the work created a genuine, lasting *technical*
obligation that no product requirement covers — a deterministic file format, a migration
contract, a compatibility guarantee somebody must keep.

Almost always the answer is none, and an empty "proposals" list is the normal answer. Propose
one only when the obligation outlives this run.

Never propose an execution unit. A unit is a work split that disappears when the requirement
is done; a technical requirement is permanent, joins the project's requirement store, and is
traced and tested like any other. A payload describing a unit is refused outright.

Each proposal carries a "title", a "description" of the obligation, and a "rationale" saying
why it is lasting rather than part of this run's work. Do not name an id, a type or a
lifecycle: the store issues those.
"""

#: Fields of a proposal the *caller* supplies. A model that names its own origin
#: could re-parent the requirement it proposes onto something else, which is why
#: ``read_technical_proposal`` strips them and why they are not offered here.
_CALLER_OWNED_PROPOSAL_FIELDS: frozenset[str] = frozenset(
    {"origin", "run_id", "unit_id", "proposed_at"},
)


@traces(SWR.SWR_3411)
def derivation_schema() -> dict[str, Any]:
    """The response format for zero or more technical-requirement proposals."""
    from rotaris_core.requirements.execution.derivation import TechnicalRequirementProposal

    return _object_schema(
        "derived_technical_requirements",
        properties={
            "proposals": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": _typed_properties(
                        TechnicalRequirementProposal.model_fields,
                        skip=_CALLER_OWNED_PROPOSAL_FIELDS,
                    ),
                    "required": ["title", "rationale"],
                },
            },
            "reasoning": {"type": "string"},
        },
        required=["proposals"],
    )


@traces(SWR.SWR_3411)
def derivation_prompt(request: DerivationRequest) -> str:
    """What the run changed and what it says it did — the evidence a proposal rests on."""
    unit = f" (unit {request.unit_id})" if request.unit_id else ""
    return "\n\n".join(
        (
            f"Run {request.run_id or 'unknown'} implemented requirement {request.req_id}{unit}.",
            _block("Files the run changed", request.changed_files),
            f"What the agent reported:\n{request.agent_summary or '(no summary)'}",
        ),
    )


def _proposal_list(payload: Mapping[str, object]) -> tuple[Mapping[str, object], ...]:
    """The ``proposals`` array of *payload*, or nothing at all.

    Shape only: whether an entry is a usable proposal is
    ``read_technical_proposal``'s question, and it answers it with a stated
    refusal this must not pre-empt.
    """
    raw = payload.get("proposals")
    if not isinstance(raw, list | tuple):
        return ()
    return tuple(entry for entry in raw if isinstance(entry, dict))


@traces(SWR.SWR_3411, SWR.SWR_3117)
class DerivationAnalyst(_Analyst):
    """The configured persona, asked whether a run left an obligation behind (SWR-3411).

    Answers as the ``execution`` persona rather than a sixth one: the question
    is about work that just happened in a run, the roster has one field per
    agentic job, and inventing a persona nobody configured would make the answer
    unattributable to anything a workspace declared (SWR-3117).
    """

    JOB: ClassVar[RequirementJob] = "execution"

    @traces(SWR.SWR_3411)
    def propose(self, request: DerivationRequest) -> Sequence[Mapping[str, object]]:
        """Zero or more proposals. An empty answer is the normal one.

        Raises:
            JudgeError: the model was unreachable or unusable — which the
                deriver treats as "no proposal", never as a failed run.
        """
        payload = self._answer(
            system=self._system(_DERIVATION_INSTRUCTION),
            user=derivation_prompt(request),
            schema=derivation_schema(),
        )
        return _proposal_list(payload)


# --------------------------------------------------------------------------
# SWR-3507 — what happens to a superseded requirement's code
# --------------------------------------------------------------------------


_MIGRATION_INSTRUCTION = """\
One or more requirements are being replaced. Every site below — an implementation trace or a
covering test — claims one of them, and each has to be assigned exactly one action:

- "remove": the site is obsolete with the requirement it claims. The code goes.
- "adapt": the code stays where it is and changes to satisfy the new requirement.
- "keep": the site is right as it stands and keeps claiming the old id.
- "migrate": the behaviour belongs to the new requirement and moves there. Name the "target".
- "re-point": only the annotation changes; the same code now claims the new id. Name the
  "target".
- "decision-required": you cannot classify it from what you were given. Put what a human has
  to answer into "question".

Answer with one decision per site, naming the site exactly as it was listed. Every decided
action states its "reasoning"; an action nobody can check cannot be approved. "migrate" and
"re-point" name a "target" that is not the id being replaced, and the other actions name none.

Never guess. "decision-required" is a real answer and the only safe one when you are unsure —
this list ends in code being changed and deleted.
"""


@traces(SWR.SWR_3507)
def migration_schema(request: MigrationRequest) -> dict[str, Any]:
    """The response format for a worklist, constrained to this request's own sites.

    Both closed sets come from the request and the engine: the sites are exactly
    the inventory's keys and the actions are exactly ``MigrationAction``, so an
    answer about a site nobody listed, or in a vocabulary nobody defined, is
    something the provider was asked not to produce — and ``read_action`` still
    downgrades it if it does.
    """
    from rotaris_core.requirements.change.superseding import MigrationAction

    return _object_schema(
        "migration_worklist",
        properties={
            "decisions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "site": {"type": "string", "enum": list(request.inventory.keys)},
                        "action": {
                            "type": "string",
                            "enum": [action.value for action in MigrationAction],
                        },
                        "reasoning": {"type": "string"},
                        "target": {"type": "string"},
                        "question": {"type": "string"},
                    },
                    "required": ["site", "action", "reasoning"],
                },
            },
        },
        required=["decisions"],
    )


@traces(SWR.SWR_3507)
def migration_prompt(request: MigrationRequest) -> str:
    """Who replaces what, and every site that claims the replaced ids."""
    superseding = request.superseding_id or "nothing — the requirements are being removed"
    return "\n\n".join(
        (
            f"Replacing {', '.join(request.superseded_ids)} with {superseding}.",
            _block(
                "Sites to decide, each named exactly as you must answer it",
                tuple(f"{site.key}  —  {site.message}" for site in request.inventory.sites),
                limit=len(request.inventory.sites),
            ),
        ),
    )


def _decisions_by_site(payload: Mapping[str, object]) -> dict[str, Mapping[str, object]]:
    """The answer keyed by site, which is how the worklist looks its entries up.

    Shape only. A site named twice keeps the last answer, a site named for
    something outside the inventory is passed through — ``plan_migration``
    reports it as an unknown site rather than silently dropping the evidence
    that the analysis was answering about something else.
    """
    raw = payload.get("decisions")
    if not isinstance(raw, list | tuple):
        return {}
    answers: dict[str, Mapping[str, object]] = {}
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        site = entry.get("site")
        if isinstance(site, str) and site.strip():
            answers[site.strip()] = {
                str(key): value for key, value in entry.items() if str(key) != "site"
            }
    return answers


@traces(SWR.SWR_3507, SWR.SWR_3117)
class SupersedingAnalyst(_Analyst):
    """The configured persona, asked what happens to a replaced requirement's code (SWR-3507)."""

    JOB: ClassVar[RequirementJob] = "migration_analysis"

    @traces(SWR.SWR_3507)
    def classify(self, request: MigrationRequest) -> Mapping[str, Mapping[str, object]]:
        """Propose an action for each site of *request*.

        An empty inventory is answered without a model call: there is nothing to
        classify, and paying for a question with no sites in it would put a
        prompt on the path of every supersession of an untraced requirement.

        Raises:
            JudgeError: the analyst was unreachable or unusable — which
                ``plan_migration`` turns into a worklist where every site needs a
                decision, with the failure named in ``decided_by``.
        """
        if request.inventory.empty:
            return {}
        payload = self._answer(
            system=self._system(_MIGRATION_INSTRUCTION),
            user=migration_prompt(request),
            schema=migration_schema(request),
        )
        return _decisions_by_site(payload)


# --------------------------------------------------------------------------
# SWR-3106 — where this repository keeps its requirements
# --------------------------------------------------------------------------


_SOURCE_INSTRUCTION = """\
A repository's requirement layout is unknown. Propose a *declarative* source configuration
that reads it — a mapping expressed as data, never a parser.

Each field is an expression: "frontmatter.<key>" reads a frontmatter value, and "heading",
"body", "text", "filename", "stem" and "path" read the document itself. "literal:<value>" is a
constant. Any field may instead be an object carrying "source" and a "pattern" — a regular
expression applied to the resolved text, whose "value" group (else its first group, else the
whole match) is taken. That is how an id embedded in a file name or a first line is reached,
and it is what makes a store with no frontmatter at all describable:

  "id": {"source": "stem", "pattern": "^(FR-\\d+)"}

The configuration carries:

  "source-id": a short attribution for everything this source produces
  "type": "markdown"
  "glob": a repository-relative glob matching the requirement documents
  "id": the expression identifying each requirement — required. It must *read* the id out
      of the document; a constant is refused, because every document would then carry the
      same id and a requirement's id is what every hash and delivery record hangs off
  "title", "description", "parent", "status": optional expressions
  "status-values": the project's own status words mapped onto "draft", "approved" or
      "deprecated" — needed whenever its vocabulary is not already one of those three
  "relations": a table of "parent", "derived-from", "supersedes", "depends-on",
      "refines", "conflicts-with" or "related-to" to expressions

Answer with "kind": "declarative" and that configuration under "config", plus a "rationale"
naming the evidence you used and "evidence" listing the paths it rests on.

Answer with "kind": "programmatic" only when a field mapping genuinely cannot express this
source, and then state in "declarative_blocker" which part it cannot express. A programmatic
proposal without that reason is refused.

The proposal is validated by loading it against the real tree and is shown to a user before
anything is written, so an honest mapping that fails is better than a plausible one that
silently drops documents.
"""


@traces(SWR.SWR_3106)
def source_schema() -> dict[str, Any]:
    """The response format for a source proposal, with ``ProposalKind``'s own words."""
    from rotaris_core.requirements.sources.discovery import ProposalKind

    return _object_schema(
        "source_proposal",
        properties={
            "kind": {"type": "string", "enum": [kind.value for kind in ProposalKind]},
            "config": {"type": "object"},
            "rationale": {"type": "string"},
            "evidence": {"type": "array", "items": {"type": "string"}},
            "declarative_blocker": {"type": "string"},
        },
        required=["kind", "rationale"],
    )


@traces(SWR.SWR_3106)
def source_prompt(survey: RepositorySurvey) -> str:
    """The survey's evidence: what was found, where, and what it carries."""
    parts = [survey.describe()]
    for candidate in survey.candidates:
        parts.append(
            "\n".join(
                (
                    f"Candidate {candidate.glob}:",
                    f"  files matched: {candidate.file_count} (read: {candidate.sampled})",
                    f"  with frontmatter: {candidate.with_frontmatter};"
                    f" with a heading: {candidate.with_heading}",
                    f"  frontmatter keys: {', '.join(candidate.frontmatter_keys) or 'none'}",
                    f"  status-ish key: {candidate.lifecycle_key or 'none'};"
                    f" values seen: {', '.join(candidate.lifecycle_values) or 'none'}",
                    _block("  sample paths", candidate.sample_paths, limit=10),
                    _block("  documents that would not parse", candidate.unreadable, limit=10),
                    _excerpt_block(candidate),
                ),
            ),
        )
    return "\n\n".join(parts)


@traces(SWR.SWR_3121)
def _excerpt_block(candidate: ArtifactCandidate) -> str:
    """A candidate's opening prose, per document (SWR-3121).

    The only part of the survey that says anything about a store with no
    frontmatter — where the key inventory above is empty and every count is
    about documents the reader has otherwise never seen. Without it an agent
    asked to recognise prose is being asked to recognise a file listing.
    """
    if not candidate.excerpts:
        return ""
    lines = ["  opening text of the first documents:"]
    for path, text in candidate.excerpts:
        lines.append(f"    --- {path}")
        lines.extend(f"    {line}" for line in text.splitlines())
    return "\n".join(lines)


def _source_proposal_from(payload: Mapping[str, object]) -> SourceProposal | None:
    """Read *payload* as a proposal, or answer that nothing usable was said.

    Unknown keys are dropped rather than fatal — a model that added a note must
    not cost a whole discovery — but the proposal's own validator still decides
    whether the result is coherent, and a proposal that is not is no proposal.
    """
    from pydantic import ValidationError

    from rotaris_core.requirements.sources.discovery import SourceProposal

    accepted = {
        str(key): value for key, value in payload.items() if str(key) in SourceProposal.model_fields
    }
    if not accepted.get("kind"):
        return None
    try:
        return SourceProposal.model_validate(accepted)
    except (ValidationError, ValueError) as error:
        _log.info("Source discovery answered with no usable proposal: %s", error)
        return None


@traces(SWR.SWR_3106, SWR.SWR_3117)
class SourceDiscoveryAnalyst(_Analyst):
    """The configured persona, asked to describe an unfamiliar requirement store (SWR-3106).

    Reads a survey and answers a proposal. It writes nothing and persists
    nothing: a proposal is data a user accepts in a second, explicit step, and
    the configuration it proposes is validated by *loading* it before anybody is
    asked about it.
    """

    JOB: ClassVar[RequirementJob] = "source_discovery"

    #: Asking this costs a model call, so discovery only does where determinism
    #: failed *and* the repository holds documents to describe (SWR-3121).
    consults_a_model: ClassVar[bool] = True

    def __init__(self, *args: object, **kwargs: object) -> None:
        super().__init__(*args, **kwargs)  # type: ignore[arg-type]
        self._unavailable_reason = ""

    @property
    @traces(SWR.SWR_3121)
    def label(self) -> str:
        """How this analyst is named to a user: who answered, on what model."""
        return f"{self.persona} ({self.model_name})"

    @property
    @traces(SWR.SWR_3121)
    def unavailable_reason(self) -> str:
        """Why the last ask produced nothing, when it was the model's doing.

        Kept so discovery can report "the model was unreachable" as something
        other than "the model had nothing to say" (SWR-3121). Set by the ask
        that failed, and cleared by the next one, so it never describes an
        older attempt than the one being reported.
        """
        return self._unavailable_reason

    @traces(SWR.SWR_3106, SWR.SWR_3121)
    def propose(self, survey: RepositorySurvey) -> SourceProposal | None:
        """A proposal for *survey*, or ``None`` when nothing can be said.

        ``None`` covers both an unusable answer and an unreachable model, because
        ``propose`` has no third channel and discovery already renders it as
        "no analyst could describe this repository" — a sentence a user can act
        on, which an exception out of a survey would not be. Which of the two it
        was is recorded on :attr:`unavailable_reason` rather than lost, because
        "configure a model" and "this store defeated the model" ask different
        things of a user (SWR-3121).
        """
        self._unavailable_reason = ""
        try:
            payload = self._answer(
                system=self._system(_SOURCE_INSTRUCTION),
                user=source_prompt(survey),
                schema=source_schema(),
            )
        except JudgeError as error:
            _log.info("Source discovery did not run: %s", error)
            self._unavailable_reason = f"the model could not be reached ({error})"
            return None
        proposal = _source_proposal_from(payload)
        if proposal is None:
            self._unavailable_reason = "the model answered with no usable proposal"
        return proposal


@traces(SWR.SWR_3121)
class UnavailableAnalyst:
    """The agent this workspace has not got, saying so in the ordinary channel.

    A workspace whose persona roster resolves to nothing still discovers, with
    the deterministic analyst alone. What it must not do is *look* the same as a
    workspace whose agent was asked and found nothing: "configure a model" and
    "this store defeated the model" ask different things of a user (SWR-3121).

    So the absence takes part in the chain rather than being dropped before it.
    It proposes nothing and carries the reason, and discovery reports it through
    exactly the mechanism it reports every other analyst with — one channel, not
    a special case beside one.
    """

    def __init__(self, reason: str, *, label: str = "requirement analysis agent") -> None:
        self._reason = reason
        self._label = label

    @property
    def label(self) -> str:
        """How this absence is named to a user."""
        return self._label

    @property
    def unavailable_reason(self) -> str:
        """Why there is no agent to ask."""
        return self._reason

    @traces(SWR.SWR_3121)
    def propose(self, survey: RepositorySurvey) -> SourceProposal | None:
        """Nothing, always — there is no agent behind this."""
        del survey
        return None


@traces(SWR.SWR_3106, SWR.SWR_3117, SWR.SWR_3121)
def source_analysts_for(
    config: RotarisConfig,
    *,
    source_id: str = "discovered",
    timeout: float | None = None,
) -> tuple[SourceAnalyst, ...]:
    """The analysts this workspace discovers a requirement source with, in order.

    Deterministic first, always: a repository whose layout the heuristic already
    reads costs no model call at all. The configured persona second, for the
    layouts a frontmatter heuristic cannot describe — which is most of them, and
    the whole reason SWR-3106 put a seam here.

    **The order is the escalation rule, and it is enforced by the caller.**
    :func:`~rotaris_core.requirements.sources.discovery.discover_source` runs
    these in sequence and validates each proposal by loading it before
    considering the next, so the agent is reached exactly when the heuristic
    produced nothing a user could adopt. Deciding that needs the tree, which
    this factory does not have and does not want.

    A workspace whose persona roster points at nothing still gets a two-element
    chain: the heuristic, and an :class:`UnavailableAnalyst` that states the
    absence rather than hiding it.
    """
    from rotaris_core.requirements.sources.discovery import HeuristicAnalyst

    heuristic = HeuristicAnalyst(source_id=source_id)
    try:
        agent = SourceDiscoveryAnalyst.for_config(config, timeout=timeout)
    except PersonaResolutionError as error:
        _log.info("Source discovery runs without a model: %s", error)
        return (
            heuristic,
            UnavailableAnalyst(f"no requirement analysis persona resolved ({error})"),
        )
    return (heuristic, agent)
