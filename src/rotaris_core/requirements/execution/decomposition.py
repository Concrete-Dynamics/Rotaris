"""Deciding how many units a requirement needs, and why (SWR-3404).

Some requirements do not fit into one agent run — not because the text is long,
but because they touch several components, need several independent changes, or
would produce a change set no reviewer can check. Attempting them in one run
produces a half-finished worktree and an unusable diff.

So the decision is made *before* anything starts, from stated facts, and its
whole reasoning is a value:

```text
RequirementAssessment ──▶ signals_over(thresholds) ──┬─ nothing triggered ─▶ single_unit_plan()
   (eight factors)                                   │                        one unit, no model call
                                                     └─ something triggered ─▶ DecompositionModel
                                                                                   │
                                                              read_proposal() ◀────┘  (untrusted payload)
                                                                   │
                                                                   ▼
                                                          DecompositionPlan | DecompositionRejection
```

Four properties are load-bearing, and each is checked rather than promised:

- **A small requirement costs nothing.** With no signal over its threshold,
  :meth:`Decomposer.decompose` returns a one-unit plan and never reaches the
  model. No prompt, no latency, no ceremony — the first acceptance criterion of
  SWR-3404 is a code path, not a policy.
- **A cyclic plan is refused and reported.** :class:`DecompositionPlan` validates
  its own dependency graph and names the units in the cycle; the decomposer turns
  that into a :class:`DecompositionRejection` rather than an exception, because a
  model that answered badly is a *result* the flow has to record (SWR-3413).
- **Every separate unit says why it is separate.** A plan with more than one unit
  is rejected unless each of them carries a scope *and* a rationale. "Split into
  four" is not something a reviewer can check; "tests, because the suite is where
  the merge conflict would be" is.
- **Decomposition creates no requirements.** :func:`read_proposal` strips every
  key that would let a decomposing model author a requirement — an id, a type, a
  lifecycle, a ``derived-from`` — and reports what it stripped. A technical
  requirement is a different act with a different path (SWR-3411,
  :mod:`rotaris_core.requirements.execution.derivation`), and a work split can
  never become one by accident.

Pure with respect to the world: the clock is injected, the model is a protocol,
and nothing here reads a file, spawns a process or opens a socket. The persona
that carries the judgement is named in configuration
(``requirements.personas.decomposition``, SWR-3117) and resolved by the caller.
"""

from __future__ import annotations

import datetime as dt  # noqa: TC003 - Pydantic resolves this at runtime.
from enum import StrEnum
from typing import TYPE_CHECKING, Protocol, Self, runtime_checkable

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.execution.units import RequirementUnits, UnitSpec, plan_units

if TYPE_CHECKING:
    from collections.abc import Callable, Mapping, Sequence

    from rotaris_core.requirements.model import CanonicalRequirement

__all__ = [
    "DEFAULT_MAX_UNITS",
    "FORBIDDEN_PROPOSAL_FIELDS",
    "SINGLE_UNIT_KEY",
    "DecompositionError",
    "DecompositionModel",
    "DecompositionPlan",
    "DecompositionProposal",
    "DecompositionRejection",
    "DecompositionRequest",
    "DecompositionResult",
    "DecompositionSignal",
    "DecompositionThresholds",
    "Decomposer",
    "PlannedUnit",
    "ProposalIntake",
    "RejectionKind",
    "RequirementAssessment",
    "read_proposal",
    "signals_over",
    "single_unit_plan",
]

#: The key the one unit of an undivided requirement carries. Stable, so the unit
#: id derived from it (:func:`~rotaris_core.requirements.execution.units.mint_unit_id`)
#: is the same before and after a restart.
SINGLE_UNIT_KEY = "implementation"

#: Upper bound on a plan's units when the caller states none. Mirrors
#: ``requirements.execution.decomposition.max_units`` (SWR-3117); the caller reads
#: configuration, this module only refuses to exceed what it was given.
DEFAULT_MAX_UNITS = 6


class DecompositionError(RuntimeError):
    """A decomposition plan would have been incoherent.

    Deliberately not a :class:`ValueError`: half of these are raised inside
    Pydantic validators, where a ``ValueError`` is folded into a
    ``ValidationError`` whose message buries the sentence a caller has to read.
    """


@traces(SWR.SWR_3404)
class DecompositionSignal(StrEnum):
    """One factor SWR-3404 assesses a requirement against.

    A closed set, in the order the requirement lists them, so "what did Rotaris
    look at" has the same answer in the plan, in the audit trail and on the
    board — and so adding a factor is a visible change rather than a new branch
    inside a function.
    """

    AFFECTED_COMPONENTS = "affected-components"
    INDEPENDENT_CHANGES = "independent-changes"
    TECHNICAL_DEPENDENCIES = "technical-dependencies"
    TEST_SURFACE = "test-surface"
    ARCHITECTURE_BOUNDARIES = "architecture-boundaries"
    CONTEXT_SIZE = "context-size"
    PARALLELISABILITY = "parallelisability"
    MERGE_CONFLICT_RISK = "merge-conflict-risk"

    @property
    def label(self) -> str:
        """``Merge Conflict Risk`` — what an inspection panel prints."""
        return " ".join(part.capitalize() for part in self.value.split("-"))


@traces(SWR.SWR_3404, SWR.SWR_3117)
class DecompositionThresholds(BaseModel):
    """Where each signal stops being ordinary.

    Values rather than magic numbers inside a condition, so a workspace can state
    its own (SWR-3117) and a test can move exactly one of them and assert that
    exactly one signal changes.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    #: More components than this and the change stops being one person's edit.
    affected_components: int = 2
    #: Independent changes that could each be reviewed on their own.
    independent_changes: int = 2
    #: Ordered technical dependencies inside the requirement's own work.
    technical_dependencies: int = 1
    #: Distinct test surfaces (unit, integration, desktop, …) the work touches.
    test_surface: int = 2
    #: Architecture boundaries crossed — a boundary per unit is the point of the
    #: split, and two in one run is what makes a diff unreviewable.
    architecture_boundaries: int = 1
    #: Rough size of the context one run would have to hold, in tokens.
    context_tokens: int = 60_000
    #: Merge-conflict risk, 0.0 – 1.0, as the assessment estimates it.
    merge_conflict_risk: float = 0.5

    @field_validator(
        "affected_components",
        "independent_changes",
        "technical_dependencies",
        "test_surface",
        "architecture_boundaries",
        "context_tokens",
    )
    @classmethod
    def _positive(cls, value: int) -> int:
        if value < 1:
            raise DecompositionError(
                "a decomposition threshold of zero would split every requirement",
            )
        return value


@traces(SWR.SWR_3404)
class RequirementAssessment(BaseModel):
    """What was measured about one requirement, before any run started.

    Data, not judgement: every field is a count, a size or an estimate somebody
    else produced — an impact analysis, a model, a human. The judgement is
    :func:`signals_over`, which is pure and therefore the same for everyone who
    asks.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    affected_components: int = 1
    independent_changes: int = 1
    technical_dependencies: int = 0
    test_surface: int = 1
    architecture_boundaries: int = 1
    context_tokens: int = 0
    #: Whether the work could genuinely run in parallel. On its own it never
    #: triggers a split — it decides whether the units the *other* signals
    #: justified may run at once (SWR-3406).
    parallelisable: bool = False
    merge_conflict_risk: float = 0.0
    #: Free-text observations recorded with the plan, never acted on.
    notes: tuple[str, ...] = ()

    @field_validator("req_id")
    @classmethod
    def _named(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise DecompositionError("an assessment names the requirement it assessed")
        return cleaned

    @field_validator("merge_conflict_risk")
    @classmethod
    def _a_probability(cls, value: float) -> float:
        if not 0.0 <= value <= 1.0:
            raise DecompositionError(f"merge-conflict risk is a 0..1 estimate, got {value}")
        return value

    def value_of(self, signal: DecompositionSignal) -> float:
        """This assessment's measurement for *signal*."""
        match signal:
            case DecompositionSignal.AFFECTED_COMPONENTS:
                return float(self.affected_components)
            case DecompositionSignal.INDEPENDENT_CHANGES:
                return float(self.independent_changes)
            case DecompositionSignal.TECHNICAL_DEPENDENCIES:
                return float(self.technical_dependencies)
            case DecompositionSignal.TEST_SURFACE:
                return float(self.test_surface)
            case DecompositionSignal.ARCHITECTURE_BOUNDARIES:
                return float(self.architecture_boundaries)
            case DecompositionSignal.CONTEXT_SIZE:
                return float(self.context_tokens)
            case DecompositionSignal.PARALLELISABILITY:
                return 1.0 if self.parallelisable else 0.0
            case DecompositionSignal.MERGE_CONFLICT_RISK:
                return self.merge_conflict_risk


def _threshold_of(thresholds: DecompositionThresholds, signal: DecompositionSignal) -> float:
    match signal:
        case DecompositionSignal.AFFECTED_COMPONENTS:
            return float(thresholds.affected_components)
        case DecompositionSignal.INDEPENDENT_CHANGES:
            return float(thresholds.independent_changes)
        case DecompositionSignal.TECHNICAL_DEPENDENCIES:
            return float(thresholds.technical_dependencies)
        case DecompositionSignal.TEST_SURFACE:
            return float(thresholds.test_surface)
        case DecompositionSignal.ARCHITECTURE_BOUNDARIES:
            return float(thresholds.architecture_boundaries)
        case DecompositionSignal.CONTEXT_SIZE:
            return float(thresholds.context_tokens)
        case DecompositionSignal.PARALLELISABILITY:
            # Never a reason to split on its own — see the field's own note.
            return float("inf")
        case DecompositionSignal.MERGE_CONFLICT_RISK:
            return thresholds.merge_conflict_risk


@traces(SWR.SWR_3404)
def signals_over(
    assessment: RequirementAssessment,
    thresholds: DecompositionThresholds | None = None,
) -> tuple[DecompositionSignal, ...]:
    """The signals *assessment* pushes past *thresholds*, in declaration order.

    Pure, and the whole of the split decision: an empty result means one unit,
    and a non-empty one names — individually — every factor that argued for more.
    A count would tell a user nothing they can act on; the names go straight into
    the plan's recorded reasoning.
    """
    limits = thresholds if thresholds is not None else DecompositionThresholds()
    return tuple(
        signal
        for signal in DecompositionSignal
        if assessment.value_of(signal) > _threshold_of(limits, signal)
    )


@traces(SWR.SWR_3404)
class PlannedUnit(BaseModel):
    """One unit a decomposition asks for, with the reason it stands alone.

    Structurally an
    :class:`~rotaris_core.requirements.execution.units.UnitSpec` plus the two
    things SWR-3404 requires and execution does not: the scope, and *why this is
    separate*. :meth:`to_spec` is the one conversion, so a plan and the units it
    produces cannot describe different work.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    #: The handle siblings depend on, and what the unit id is derived from.
    key: str
    title: str = ""
    #: What this unit is responsible for.
    scope: str = ""
    #: Why it is *not* part of another unit (SWR-3404).
    rationale: str = ""
    #: Keys of sibling units this one waits for (SWR-3406).
    depends_on: tuple[str, ...] = ()
    agent: str = ""
    #: Files this unit is expected to touch — the scheduler's conflict signal
    #: (SWR-3412). A prediction, carried so the plan can be inspected before any
    #: run starts.
    expected_files: tuple[str, ...] = ()

    @field_validator("key")
    @classmethod
    def _keyed(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise DecompositionError("a planned unit needs a key its siblings refer to it by")
        return cleaned

    @model_validator(mode="after")
    def _not_its_own_dependency(self) -> Self:
        if self.key in self.depends_on:
            raise DecompositionError(f"{self.key}: a unit cannot wait for itself")
        if len(set(self.depends_on)) != len(self.depends_on):
            raise DecompositionError(f"{self.key}: a dependency is named twice")
        return self

    @traces(SWR.SWR_3404, SWR.SWR_3401)
    def to_spec(self) -> UnitSpec:
        """This planned unit as the execution layer's own spec (SWR-3401)."""
        return UnitSpec(
            key=self.key,
            title=self.title or self.key,
            scope=self.scope,
            depends_on=self.depends_on,
            agent=self.agent,
        )


@traces(SWR.SWR_3404)
class DecompositionPlan(BaseModel):
    """How one requirement will be executed, and the reasoning behind it.

    Inspectable *before* anything runs, which is the point: the units, their
    dependency edges, the signals that argued for the split and the sentence that
    justifies each unit are all readable from this one value. The invariants are
    checked on construction, so an incoherent plan cannot be built and then
    discovered halfway through a run.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    #: The requirement version this plan was made against (SWR-3107), so a plan
    #: kept from an earlier read can be told apart from a current one.
    requirement_hash: str = ""
    units: tuple[PlannedUnit, ...]
    #: What was measured (SWR-3404's eight factors).
    assessment: RequirementAssessment | None = None
    #: The signals that argued for more than one unit, named individually.
    triggered: tuple[DecompositionSignal, ...] = ()
    #: Why the plan looks like this. Mandatory: SWR-3404 asks for the reasoning to
    #: be *recorded before any run starts*, and an empty string records nothing.
    rationale: str
    #: Who produced it — ``assessment`` for the no-split path, the persona name
    #: for a model-produced one.
    planner: str = "assessment"
    recorded_at: dt.datetime | None = None
    #: Keys a proposing model tried to set that would have authored a requirement
    #: (SWR-3411). Non-empty means the attempt was refused, not honoured.
    refused_fields: tuple[str, ...] = ()

    @field_validator("req_id")
    @classmethod
    def _named(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise DecompositionError("a decomposition plan names the requirement it is for")
        return cleaned

    @field_validator("rationale")
    @classmethod
    def _reasoned(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise DecompositionError(
                "a decomposition plan records the reasoning behind it (SWR-3404)",
            )
        return cleaned

    @model_validator(mode="after")
    def _coherent(self) -> Self:
        if not self.units:
            raise DecompositionError(
                f"{self.req_id}: a decomposition plan produces at least one unit;"
                " a requirement nobody plans to implement is not a plan",
            )
        keys = [unit.key for unit in self.units]
        duplicates = sorted({key for key in keys if keys.count(key) > 1})
        if duplicates:
            raise DecompositionError(f"{self.req_id}: units keyed {duplicates} more than once")
        known = set(keys)
        for unit in self.units:
            unknown = [key for key in unit.depends_on if key not in known]
            if unknown:
                raise DecompositionError(
                    f"{self.req_id}: unit {unit.key!r} waits for {unknown},"
                    " which this plan does not contain",
                )
        self._assert_acyclic()
        if len(self.units) > 1:
            for unit in self.units:
                if not unit.scope.strip() or not unit.rationale.strip():
                    raise DecompositionError(
                        f"{self.req_id}: unit {unit.key!r} states neither its scope nor why it"
                        " is separate; a split nobody can check is not a plan (SWR-3404)",
                    )
        return self

    def _assert_acyclic(self) -> None:
        """Refuse a plan whose units wait for each other, naming the cycle."""
        pending = {unit.key: set(unit.depends_on) for unit in self.units}
        resolved: set[str] = set()
        while pending:
            free = sorted(key for key, deps in pending.items() if deps <= resolved)
            if not free:
                raise DecompositionError(
                    f"{self.req_id}: units {sorted(pending)} depend on each other in a cycle;"
                    " a cyclic decomposition can never start (SWR-3404)",
                )
            resolved.update(free)
            for key in free:
                del pending[key]

    @property
    def keys(self) -> tuple[str, ...]:
        """The unit keys, in plan order."""
        return tuple(unit.key for unit in self.units)

    @property
    def count(self) -> int:
        """How many units this plan asks for."""
        return len(self.units)

    @property
    def single(self) -> bool:
        """Whether the requirement runs as one unit and no ceremony."""
        return self.count == 1

    @property
    def cyclic(self) -> bool:
        """Always ``False`` — a cyclic plan cannot be constructed at all."""
        return False

    def unit(self, key: str) -> PlannedUnit | None:
        """The planned unit with this key, or ``None``."""
        return next((unit for unit in self.units if unit.key == key), None)

    @traces(SWR.SWR_3404, SWR.SWR_3401)
    def to_specs(self) -> tuple[UnitSpec, ...]:
        """The plan as execution unit specs, in plan order (SWR-3401)."""
        return tuple(unit.to_spec() for unit in self.units)

    @traces(SWR.SWR_3404, SWR.SWR_3401)
    def to_units(self) -> RequirementUnits:
        """The plan realised as this requirement's execution units.

        Composition, not a second implementation: ids, edges and the graph check
        are :mod:`~rotaris_core.requirements.execution.units`', so a plan and the
        units it becomes cannot disagree about what waits for what.
        """
        return plan_units(self.req_id, self.to_specs())

    @property
    def expected_files(self) -> dict[str, tuple[str, ...]]:
        """``key → predicted paths`` — the scheduler's conflict input (SWR-3412)."""
        return {unit.key: unit.expected_files for unit in self.units if unit.expected_files}

    @property
    def summary(self) -> str:
        """One line: how many units, and what argued for them."""
        because = ", ".join(signal.value for signal in self.triggered) or "no signal triggered"
        return f"{self.req_id}: {self.count} unit(s) — {because}"


@traces(SWR.SWR_3404)
def single_unit_plan(
    req_id: str,
    *,
    requirement_hash: str = "",
    assessment: RequirementAssessment | None = None,
    triggered: Sequence[DecompositionSignal] = (),
    rationale: str = "",
    title: str = "",
    scope: str = "",
    agent: str = "",
    planner: str = "assessment",
    at: dt.datetime | None = None,
) -> DecompositionPlan:
    """The plan of a requirement that fits into one run — and no ceremony.

    One unit, no dependency graph, no model call. The rationale still has to say
    something, because "why is this not split" is a question a reviewer asks of a
    large requirement just as often as of a small one.
    """
    return DecompositionPlan(
        req_id=req_id,
        requirement_hash=requirement_hash,
        units=(
            PlannedUnit(
                key=SINGLE_UNIT_KEY,
                title=title or req_id,
                scope=scope,
                agent=agent,
            ),
        ),
        assessment=assessment,
        triggered=tuple(triggered),
        rationale=rationale
        or (
            f"{req_id} fits into one run: no assessed factor is over its threshold,"
            " so splitting it would add coordination without removing work"
        ),
        planner=planner,
        recorded_at=at,
    )


# --------------------------------------------------------------------------
# The model seam (SWR-3404's judgement half)
# --------------------------------------------------------------------------


#: Keys a decomposing model must not be able to author. Every one of them belongs
#: to a *requirement* rather than to a unit: an id, a type, a lifecycle, a
#: relation. Stripping them is what makes SWR-3404's fourth acceptance criterion
#: structural — a work split cannot turn into a requirement by phrasing, and a
#: genuine technical requirement goes through SWR-3411's own path instead.
FORBIDDEN_PROPOSAL_FIELDS: frozenset[str] = frozenset(
    {
        "req_id",
        "requirement",
        "requirements",
        "new_requirement",
        "new_requirements",
        "derived_from",
        "derived-from",
        "derives",
        "req_type",
        "type",
        "lifecycle",
        "status",
        "epic",
        "parent",
        "supersedes",
        "technical_requirement",
        "create_requirement",
    },
)


@traces(SWR.SWR_3404)
class DecompositionProposal(BaseModel):
    """What a model answered: units and a reason, and nothing that can create one."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    units: tuple[PlannedUnit, ...] = ()
    rationale: str = ""


@traces(SWR.SWR_3404, SWR.SWR_3411)
class ProposalIntake(BaseModel):
    """One model payload read as a proposal — and what was taken out of it."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    proposal: DecompositionProposal
    #: Requirement-authoring keys the payload tried to set, sorted.
    refused: tuple[str, ...] = ()
    #: Keys the proposal shape has no place for, sorted.
    ignored: tuple[str, ...] = ()

    @property
    def tampered(self) -> bool:
        """Whether the payload tried to create a requirement (SWR-3411)."""
        return bool(self.refused)

    @property
    def message(self) -> str:
        """One line for the plan's record and the audit trail."""
        parts: list[str] = []
        if self.refused:
            parts.append(
                f"refused requirement-authoring keys {list(self.refused)};"
                " decomposition creates units, never requirements (SWR-3404)",
            )
        if self.ignored:
            parts.append(f"ignored unknown {list(self.ignored)}")
        return "; ".join(parts) or "payload accepted as a unit proposal"


def _unit_from(value: object, *, index: int) -> PlannedUnit | None:
    """One entry of a model payload as a planned unit, or ``None`` when unusable."""
    if isinstance(value, PlannedUnit):
        return value
    if not isinstance(value, dict):
        return None
    accepted: dict[str, object] = {}
    for raw_key, raw_value in value.items():
        name = str(raw_key).replace("-", "_")
        if name in PlannedUnit.model_fields:
            accepted[name] = raw_value
    if not str(accepted.get("key", "")).strip():
        accepted["key"] = f"unit-{index}"
    try:
        return PlannedUnit.model_validate(accepted)
    except (DecompositionError, ValueError):
        return None


@traces(SWR.SWR_3404, SWR.SWR_3411)
def read_proposal(payload: Mapping[str, object]) -> ProposalIntake:
    """Read *payload* as a unit proposal, refusing anything that authors a requirement.

    Never raises on a hostile or malformed payload: a model that answered badly
    must produce a *rejected* decomposition the flow can report (SWR-3413), not an
    exception halfway through a run. Every dropped key is named, so a prompt that
    drifted shows up instead of being silently absorbed.
    """
    refused: list[str] = []
    ignored: list[str] = []
    units: list[PlannedUnit] = []
    rationale = ""
    for raw_key, value in payload.items():
        name = str(raw_key)
        if name in FORBIDDEN_PROPOSAL_FIELDS:
            refused.append(name)
            continue
        if name == "rationale":
            rationale = str(value) if isinstance(value, str) else ""
            continue
        if name != "units":
            ignored.append(name)
            continue
        if not isinstance(value, list | tuple):
            ignored.append(name)
            continue
        for index, entry in enumerate(value, start=1):
            unit = _unit_from(entry, index=index)
            if unit is None:
                ignored.append(f"units[{index - 1}]")
                continue
            units.append(unit)
    return ProposalIntake(
        proposal=DecompositionProposal(units=tuple(units), rationale=rationale),
        refused=tuple(sorted(set(refused))),
        ignored=tuple(sorted(set(ignored))),
    )


@traces(SWR.SWR_3404)
class DecompositionRequest(BaseModel):
    """What a decomposing model is asked. A value, so a test can assert on it."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    title: str = ""
    description: str = ""
    assessment: RequirementAssessment
    triggered: tuple[DecompositionSignal, ...] = ()
    max_units: int = DEFAULT_MAX_UNITS
    #: The configured persona doing the work (``requirements.personas.decomposition``).
    persona: str = ""


@runtime_checkable
class DecompositionModel(Protocol):
    """Whatever produces a split proposal (SWR-3404).

    A protocol with one method, so the whole decision path is exercised in unit
    tests against three lines of fake and never reaches a network. The real
    implementation runs the configured persona; this module never learns which.
    """

    def propose(self, request: DecompositionRequest) -> Mapping[str, object]:
        """Answer *request* with a payload of units and a rationale."""
        ...


class RejectionKind(StrEnum):
    """Why a proposed decomposition was not used."""

    #: The units wait for each other (SWR-3404's second acceptance criterion).
    CYCLE = "cycle"
    #: More units than the configured bound allows.
    TOO_MANY_UNITS = "too-many-units"
    #: The model answered with no unit at all.
    EMPTY = "empty"
    #: A unit states neither scope nor why it is separate.
    UNJUSTIFIED = "unjustified"
    #: A unit waits for something the plan does not contain.
    UNKNOWN_DEPENDENCY = "unknown-dependency"
    #: The model itself failed.
    MODEL_ERROR = "model-error"


@traces(SWR.SWR_3404)
class DecompositionRejection(BaseModel):
    """A proposal that was refused, and exactly why.

    A value rather than an exception: SWR-3404 asks for a cyclic plan to be
    *reported*, and the flow that asked for the decomposition has to record the
    refusal, show it and stop at that stage (SWR-3413).
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    kind: RejectionKind
    reason: str
    #: The units involved — the cycle's members, the unjustified unit's key.
    units: tuple[str, ...] = ()
    #: Requirement-authoring keys the payload also tried to set (SWR-3411).
    refused_fields: tuple[str, ...] = ()

    @field_validator("reason")
    @classmethod
    def _stated(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise DecompositionError("a rejected decomposition states why (SWR-3404)")
        return cleaned

    @property
    def message(self) -> str:
        """One line a user can act on."""
        who = f" ({', '.join(self.units)})" if self.units else ""
        return f"{self.req_id}: decomposition rejected — {self.kind}{who}: {self.reason}"


@traces(SWR.SWR_3404)
class DecompositionResult(BaseModel):
    """A plan, or a stated rejection. Never both, never neither."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    plan: DecompositionPlan | None = None
    rejection: DecompositionRejection | None = None

    @model_validator(mode="after")
    def _one_answer(self) -> Self:
        if (self.plan is None) == (self.rejection is None):
            raise DecompositionError(
                "a decomposition either produced a plan or was rejected, never both",
            )
        return self

    @property
    def accepted(self) -> bool:
        """Whether a usable plan came out of this."""
        return self.plan is not None

    @property
    def message(self) -> str:
        """The plan's summary, or the rejection's sentence."""
        if self.plan is not None:
            return self.plan.summary
        return self.rejection.message if self.rejection is not None else ""


def _utc_now() -> dt.datetime:
    return dt.datetime.now(dt.UTC)


@traces(SWR.SWR_3404)
class Decomposer:
    """Assess a requirement, and split it only when the assessment says so.

    Everything that could reach a network is injected: the model is a protocol
    and the clock is a callable. What is left — when the model is consulted at
    all, what a proposal may contain, and which proposals are refused — is this
    class, and it is exercised end to end without one.
    """

    def __init__(
        self,
        *,
        model: DecompositionModel | None = None,
        thresholds: DecompositionThresholds | None = None,
        max_units: int = DEFAULT_MAX_UNITS,
        enabled: bool = True,
        persona: str = "",
        clock: Callable[[], dt.datetime] = _utc_now,
    ) -> None:
        self._model = model
        self._thresholds = thresholds if thresholds is not None else DecompositionThresholds()
        self._max_units = max(1, max_units)
        self._enabled = enabled
        self._persona = persona
        self._clock = clock

    @property
    def thresholds(self) -> DecompositionThresholds:
        """The thresholds this decomposer judges against (SWR-3117)."""
        return self._thresholds

    @property
    def enabled(self) -> bool:
        """Whether splitting is permitted at all; ``False`` means one unit always."""
        return self._enabled

    @property
    def max_units(self) -> int:
        """The configured upper bound on a plan's units."""
        return self._max_units

    @traces(SWR.SWR_3404)
    def decompose(
        self,
        requirement: CanonicalRequirement,
        assessment: RequirementAssessment | None = None,
    ) -> DecompositionResult:
        """The plan for *requirement* — one unit, several, or a stated rejection.

        The model is consulted **only** when a signal is over its threshold. A
        small requirement therefore costs one pure function call, which is the
        difference between "decomposition is available" and "decomposition is on
        the path of every run".
        """
        measured = (
            assessment
            if assessment is not None
            else RequirementAssessment(req_id=requirement.req_id)
        )
        if measured.req_id != requirement.req_id:
            raise DecompositionError(
                f"assessment of {measured.req_id!r} used for {requirement.req_id!r}",
            )
        triggered = signals_over(measured, self._thresholds)
        at = self._clock()
        if not self._enabled or not triggered:
            return DecompositionResult(
                plan=single_unit_plan(
                    requirement.req_id,
                    requirement_hash=requirement.current_hash,
                    assessment=measured,
                    triggered=triggered,
                    rationale=self._single_reason(requirement.req_id, triggered),
                    title=requirement.title,
                    at=at,
                ),
            )
        if self._model is None:
            return DecompositionResult(
                plan=single_unit_plan(
                    requirement.req_id,
                    requirement_hash=requirement.current_hash,
                    assessment=measured,
                    triggered=triggered,
                    rationale=(
                        f"{requirement.req_id} looks splittable"
                        f" ({', '.join(signal.value for signal in triggered)}) but no"
                        " decomposition planner is configured; running it as one unit"
                        " is the honest answer"
                    ),
                    title=requirement.title,
                    at=at,
                ),
            )
        return self._from_model(requirement, measured, triggered, at=at)

    def _single_reason(
        self,
        req_id: str,
        triggered: Sequence[DecompositionSignal],
    ) -> str:
        if not self._enabled:
            return f"{req_id} runs as one unit: automatic decomposition is switched off"
        if triggered:
            return f"{req_id} runs as one unit despite {[s.value for s in triggered]}"
        return (
            f"{req_id} fits into one run: none of"
            f" {[signal.value for signal in DecompositionSignal]} is over its threshold"
        )

    def _from_model(
        self,
        requirement: CanonicalRequirement,
        assessment: RequirementAssessment,
        triggered: tuple[DecompositionSignal, ...],
        *,
        at: dt.datetime,
    ) -> DecompositionResult:
        request = DecompositionRequest(
            req_id=requirement.req_id,
            title=requirement.title,
            description=requirement.description,
            assessment=assessment,
            triggered=triggered,
            max_units=self._max_units,
            persona=self._persona,
        )
        model = self._model
        if model is None:  # pragma: no cover - the caller checked, this is the type guard
            raise DecompositionError(f"{requirement.req_id}: no decomposition planner configured")
        try:
            payload = model.propose(request)
        except Exception as exc:  # noqa: BLE001 - a failing planner is a result, not a crash.
            return DecompositionResult(
                rejection=DecompositionRejection(
                    req_id=requirement.req_id,
                    kind=RejectionKind.MODEL_ERROR,
                    reason=f"the decomposition planner failed: {type(exc).__name__}: {exc}",
                ),
            )
        intake = read_proposal(payload)
        units = intake.proposal.units
        if not units:
            return DecompositionResult(
                rejection=DecompositionRejection(
                    req_id=requirement.req_id,
                    kind=RejectionKind.EMPTY,
                    reason="the planner proposed no unit at all",
                    refused_fields=intake.refused,
                ),
            )
        if len(units) > self._max_units:
            return DecompositionResult(
                rejection=DecompositionRejection(
                    req_id=requirement.req_id,
                    kind=RejectionKind.TOO_MANY_UNITS,
                    reason=(
                        f"{len(units)} units proposed, the configured bound is"
                        f" {self._max_units}; a plan over the bound is rejected rather"
                        " than silently truncated"
                    ),
                    units=tuple(unit.key for unit in units),
                    refused_fields=intake.refused,
                ),
            )
        try:
            plan = DecompositionPlan(
                req_id=requirement.req_id,
                requirement_hash=requirement.current_hash,
                units=units,
                assessment=assessment,
                triggered=triggered,
                rationale=intake.proposal.rationale
                or (
                    f"{requirement.req_id} split into {len(units)} units because"
                    f" {', '.join(signal.value for signal in triggered)}"
                ),
                planner=self._persona or "decomposition-model",
                recorded_at=at,
                refused_fields=intake.refused,
            )
        except DecompositionError as exc:
            return DecompositionResult(
                rejection=DecompositionRejection(
                    req_id=requirement.req_id,
                    kind=_rejection_kind(str(exc)),
                    reason=str(exc),
                    units=tuple(unit.key for unit in units),
                    refused_fields=intake.refused,
                ),
            )
        return DecompositionResult(plan=plan)


def _rejection_kind(message: str) -> RejectionKind:
    """Classify a plan validation failure, so the rejection is machine-readable."""
    if "cycle" in message:
        return RejectionKind.CYCLE
    if "does not contain" in message:
        return RejectionKind.UNKNOWN_DEPENDENCY
    return RejectionKind.UNJUSTIFIED
