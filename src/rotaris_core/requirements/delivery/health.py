"""One word per requirement, derived and never stored (SWR-3211).

Lifecycle (SWR-3101), delivery state (SWR-3201) and five evidence obligations
(SWR-3206) are the right *model* and the wrong *summary*. A user scanning a board
of ninety cards needs one word per card — as long as that word stays a view onto
the three inputs and never becomes a third stored truth that can disagree with
them.

Two properties make that stick, and both are structural rather than promised:

- **Health is computed here and nowhere else.** Nothing in this module writes;
  :class:`DerivedHealth` is not a field of any persisted record, and no
  transition (SWR-3203) takes one as input. A stored health would be a fact that
  can rot; a health that gates a transition would be a rule nobody can find.
- **The precedence is data.** :data:`HEALTH_RULES` is an ordered tuple of
  (health, predicate) pairs whose last entry always matches, so the derivation is
  *total* by construction: every combination of inputs yields exactly one health,
  and the order is inspectable rather than buried in a chain of ``if``.

The order is SWR-3211's own enumeration read from its worst end, and each step
has a reason:

1. ``Deprecated`` — the project retired the text; nothing about its evidence is
   worth a colour any more.
2. ``Superseded`` — another requirement took over (SWR-3110). Same reason.
3. ``Blocked`` — work is stopped on purpose and the reason is recorded
   (SWR-3201). It outranks evidence because acting on the evidence is exactly
   what is blocked.
4. ``Verification Failed`` — something is *wrong*, which is louder than
   something being unknown.
5. ``Incomplete Traceability`` — a *required* obligation has no evidence at all.
   A hole outranks the staleness below it: there is nothing there to re-confirm,
   and writing the missing trace or test is a different job from re-running one.
6. ``Needs Update`` — the specification moved, or evidence that does exist is no
   longer current. Last before healthy, and never hidden: the specification half
   of it is also shown as the delivery-state badge beside the health word
   (SWR-3202), so nothing is lost by ranking it below a hole.
7. ``Healthy`` — the total fallback.
"""

from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING, Self

from pydantic import BaseModel, ConfigDict

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.delivery.evidence import EvidenceState
from rotaris_core.requirements.delivery.obligations import EvidenceKind, ObligationLevel
from rotaris_core.requirements.delivery.satisfied import SatisfactionState
from rotaris_core.requirements.delivery.state import DeliveryState
from rotaris_core.requirements.model import RequirementLifecycle

if TYPE_CHECKING:
    from collections.abc import Callable

    from rotaris_core.requirements.delivery.evidence import EvidenceProjection
    from rotaris_core.requirements.delivery.state import DeliveryView

__all__ = [
    "HEALTH_PRECEDENCE",
    "HEALTH_RULES",
    "DerivedHealth",
    "HealthInputs",
    "RequirementHealth",
    "derive_health",
]


@traces(SWR.SWR_3211)
class RequirementHealth(StrEnum):
    """The one word a card shows (SWR-3211).

    The value is the stable token, :attr:`label` is what a user reads — the same
    split :class:`~rotaris_core.requirements.delivery.state.DeliveryState` uses,
    so a display rename never moves a persisted string. Nothing persists a health
    today; keeping the split means nothing has to be renamed if a filter or a
    query string ever does.
    """

    HEALTHY = "healthy"
    NEEDS_UPDATE = "needs-update"
    INCOMPLETE_TRACEABILITY = "incomplete-traceability"
    VERIFICATION_FAILED = "verification-failed"
    BLOCKED = "blocked"
    SUPERSEDED = "superseded"
    DEPRECATED = "deprecated"

    @property
    def label(self) -> str:
        """``Incomplete Traceability``, not ``incomplete-traceability``."""
        return " ".join(part.capitalize() for part in self.value.split("-"))


@traces(SWR.SWR_3211)
class HealthInputs(BaseModel):
    """Everything a health is derived from, and nothing else.

    Carried on the result so the inputs that produced a health are retrievable
    from it (SWR-3211): a user who disagrees with a badge can see the three axes
    that made it without re-running anything.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str = ""
    #: The project's own axis, read from the source on every read (SWR-3101).
    lifecycle: RequirementLifecycle = RequirementLifecycle.DRAFT
    #: Rotaris' axis (SWR-3201).
    delivery_state: DeliveryState = DeliveryState.BACKLOG
    #: The requirement that replaced this one, when one did (SWR-3110).
    superseded_by: str | None = None
    #: How the delivered version relates to the current one (SWR-3204).
    satisfaction: SatisfactionState = SatisfactionState.NEVER_DELIVERED
    #: The evidence projection's overall state (SWR-3207).
    evidence_state: EvidenceState = EvidenceState.NOT_APPLICABLE
    #: Which kinds are in which state, so a badge can be explained per obligation.
    failed_kinds: tuple[EvidenceKind, ...] = ()
    #: Required obligations with no evidence at all — the traceability gap.
    missing_kinds: tuple[EvidenceKind, ...] = ()
    stale_kinds: tuple[EvidenceKind, ...] = ()

    @classmethod
    def of(
        cls,
        view: DeliveryView,
        projection: EvidenceProjection,
        *,
        satisfaction: SatisfactionState = SatisfactionState.NEVER_DELIVERED,
        superseded_by: str | None = None,
    ) -> Self:
        """Gather the inputs from the two axes and the evidence projection.

        ``missing_kinds`` counts only *required* obligations: an optional
        obligation nobody recorded is an absence, not a gap, and reporting it as
        incomplete traceability would make every hand-delivered requirement red
        forever (SWR-3206).
        """
        return cls(
            req_id=view.req_id,
            lifecycle=view.lifecycle,
            delivery_state=view.state,
            superseded_by=superseded_by,
            satisfaction=satisfaction,
            evidence_state=projection.state,
            failed_kinds=projection.kinds_in(EvidenceState.FAILED),
            missing_kinds=tuple(
                obligation.kind
                for obligation in projection.obligations
                if obligation.state is EvidenceState.MISSING
                and obligation.level is ObligationLevel.REQUIRED
            ),
            stale_kinds=projection.kinds_in(EvidenceState.STALE),
        )


def _is_deprecated(inputs: HealthInputs) -> bool:
    return inputs.lifecycle is RequirementLifecycle.DEPRECATED


def _is_superseded(inputs: HealthInputs) -> bool:
    return bool(inputs.superseded_by and inputs.superseded_by.strip())


def _is_blocked(inputs: HealthInputs) -> bool:
    return inputs.delivery_state is DeliveryState.BLOCKED


def _verification_failed(inputs: HealthInputs) -> bool:
    return bool(inputs.failed_kinds) or inputs.evidence_state is EvidenceState.FAILED


def _needs_update(inputs: HealthInputs) -> bool:
    """The specification moved, or evidence that exists stopped being current.

    Three different facts, one badge: Rotaris' own ``Needs Update`` state, a
    delivered version that is no longer the current one (SWR-3204), and evidence
    that went stale under a requirement nobody edited (SWR-3209). A user's next
    action is the same in all three — look at it again — which is why one word
    carries all three and the delivery badge beside it separates them.
    """
    return (
        inputs.delivery_state is DeliveryState.NEEDS_UPDATE
        or inputs.satisfaction is SatisfactionState.STALE
        or bool(inputs.stale_kinds)
        or inputs.evidence_state is EvidenceState.STALE
    )


def _incomplete_traceability(inputs: HealthInputs) -> bool:
    return bool(inputs.missing_kinds) or inputs.evidence_state is EvidenceState.MISSING


def _always(_: HealthInputs) -> bool:
    """The rule that makes the derivation total."""
    return True


#: The precedence order as data: the first matching rule wins, and the last rule
#: always matches. Every combination of inputs therefore yields exactly one
#: health, which is what SWR-3211 means by "total".
HEALTH_RULES: tuple[tuple[RequirementHealth, Callable[[HealthInputs], bool]], ...] = (
    (RequirementHealth.DEPRECATED, _is_deprecated),
    (RequirementHealth.SUPERSEDED, _is_superseded),
    (RequirementHealth.BLOCKED, _is_blocked),
    (RequirementHealth.VERIFICATION_FAILED, _verification_failed),
    (RequirementHealth.INCOMPLETE_TRACEABILITY, _incomplete_traceability),
    (RequirementHealth.NEEDS_UPDATE, _needs_update),
    (RequirementHealth.HEALTHY, _always),
)

#: The healths in precedence order — the documented order SWR-3211 asks for.
HEALTH_PRECEDENCE: tuple[RequirementHealth, ...] = tuple(health for health, _ in HEALTH_RULES)


@traces(SWR.SWR_3211)
class DerivedHealth(BaseModel):
    """A health, the inputs behind it, and where in the order it came from.

    Never persisted, and deliberately not a field of any record: the moment a
    health is stored it becomes a second truth that can disagree with the three
    axes it was derived from, which is precisely what SWR-3211 forbids.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    health: RequirementHealth
    inputs: HealthInputs
    #: Where in :data:`HEALTH_PRECEDENCE` the rule that fired sits, so "why this
    #: and not that" is answerable without re-running the rules.
    rank: int

    @property
    def label(self) -> str:
        """The word a card shows."""
        return self.health.label

    @property
    def outranked(self) -> tuple[RequirementHealth, ...]:
        """The healths that would have won had their rule matched."""
        return HEALTH_PRECEDENCE[: self.rank]

    @property
    def message(self) -> str:
        """One line naming the requirement, the health and the evidence behind it."""
        who = f"{self.inputs.req_id}: " if self.inputs.req_id else ""
        kinds = self.inputs.failed_kinds or self.inputs.stale_kinds or self.inputs.missing_kinds
        because = f" ({', '.join(kinds)})" if kinds else ""
        return (
            f"{who}{self.health.label}"
            f" [{self.inputs.lifecycle} / {self.inputs.delivery_state.label}]{because}"
        )


@traces(SWR.SWR_3211)
def derive_health(inputs: HealthInputs) -> DerivedHealth:
    """The one word for these inputs — total, deterministic and unstored.

    Recomputed on every evaluation (SWR-3210) and never written anywhere. A
    requirement can be ``approved`` and ``Verification Failed`` at the same time:
    the lifecycle says the text stands, the health says the implementation does
    not, and collapsing the two would hide exactly the case worth seeing.
    """
    for rank, (health, matches) in enumerate(HEALTH_RULES):
        if matches(inputs):
            return DerivedHealth(health=health, inputs=inputs, rank=rank)
    raise AssertionError(  # pragma: no cover - the last rule always matches
        "HEALTH_RULES lost its total fallback; every combination must yield a health",
    )
