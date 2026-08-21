"""Taking over the work a project already had (SWR-3217, SWR-3218).

Every project that adopts Rotaris arrives with requirements whose code is
written, annotated and green. Their honest delivery state is ``Backlog`` —
Rotaris' axis records what *Rotaris' delivery* did, and it did nothing — which is
correct and useless at the same time: one column holding every card answers no
question.

The way out is the one SWR-3504 already sanctions for a reworded requirement:
**verify the implementation that is already there.** A requirement whose
completion conditions genuinely hold at the current commit has earned ``Done``;
the only thing missing was a run willing to check.

Three properties make this honest rather than convenient, and each is structural:

- **The gate is the ordinary one.** Adoption does not relax a completion
  condition, supply a weaker check or exempt itself. It builds a
  :class:`~rotaris_core.requirements.delivery.transitions.TransitionRequest` and
  hands it to the same :class:`DeliveryTransitions` a real delivery goes through,
  with the same :data:`CompletionGate` (SWR-3215). A requirement whose covering
  tests did not run is refused here exactly as it would be refused after a run.
- **The evidence has to come from something that executed.**
  ``CoveringTest.executed`` is false until a suite actually ran the file, so a
  caller cannot adopt by asserting; it has to supply evidence from a verification
  run. That is why :func:`adopt` takes a ``run_id`` and a commit rather than
  inventing them.
- **Nothing is a candidate by accident.** :func:`adoption_candidates` excludes
  epics (their state is derived, SWR-3212), requirements the project deprecated,
  and — the one that matters most — every requirement whose delivery record is
  no longer pristine. A requirement a user has already moved is never
  re-interpreted by a bulk pass.

Everything except :func:`adopt` is pure: requirement facts and delivery records
in, a report out, with no store, clock or subprocess of its own, in the same
shape :mod:`.epics` uses.
"""

from __future__ import annotations

import datetime as dt  # noqa: TC003 - Pydantic resolves this at runtime.
from enum import StrEnum
from typing import TYPE_CHECKING

from pydantic import BaseModel, ConfigDict

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.delivery.satisfied import SatisfiedDelivery
from rotaris_core.requirements.delivery.state import (
    DeliveryActor,  # noqa: TC001 - Pydantic resolves this at runtime.
    DeliveryState,
    TransitionCause,
)
from rotaris_core.requirements.delivery.transitions import (
    TransitionRequest,
    UnmetCondition,  # noqa: TC001 - Pydantic resolves this at runtime.
)
from rotaris_core.requirements.model import RequirementLifecycle
from rotaris_core.requirements.pass_progress import PassPhase, notify

if TYPE_CHECKING:
    from collections.abc import Callable, Mapping, Sequence

    from rotaris_core.requirements.delivery.store import DeliveryRecord
    from rotaris_core.requirements.delivery.transitions import (
        DeliveryTransitions,
        TransitionOutcome,
    )
    from rotaris_core.requirements.model import CanonicalRequirement
    from rotaris_core.requirements.pass_progress import PassProgress

__all__ = [
    "AdoptionCandidate",
    "AdoptionOutcome",
    "AdoptionReport",
    "AdoptionResult",
    "adopt",
    "adoption_candidates",
    "unjudged_adoption",
]


@traces(SWR.SWR_3217)
class AdoptionOutcome(StrEnum):
    """What adoption did with one requirement.

    Three answers, not two: "we did not consider it" and "we considered it and
    the conditions did not hold" are different facts, and a user acting on the
    report needs to tell them apart — the first is nothing to fix, the second is
    a named missing test.
    """

    ADOPTED = "adopted"
    #: Never a candidate: an epic, deprecated, or already moved by someone.
    SKIPPED = "skipped"
    #: A candidate whose completion conditions did not hold.
    REFUSED = "refused"
    #: A candidate the pass could not judge, because the verification it would
    #: have judged against observed nothing. Four answers, not three: refusing a
    #: requirement implies its conditions were checked and found wanting, and
    #: saying that about a suite that was killed before it reported is how a whole
    #: board came to accuse itself (SWR-2606).
    INCONCLUSIVE = "inconclusive"


@traces(SWR.SWR_3217)
class AdoptionCandidate(BaseModel):
    """One requirement adoption may attempt, with the version it would record."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    #: The hash adoption would record as satisfied — the requirement's current
    #: one, because that is the version the verification actually ran against.
    current_hash: str
    source_revision: str | None = None


@traces(SWR.SWR_3217)
class AdoptionResult(BaseModel):
    """What happened to one requirement, and why."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    outcome: AdoptionOutcome
    detail: str = ""
    #: Every completion condition that did not hold, named individually
    #: (SWR-3215). Empty unless the outcome is ``refused``.
    unmet: tuple[UnmetCondition, ...] = ()

    @property
    def adopted(self) -> bool:
        """Whether this requirement was taken over."""
        return self.outcome is AdoptionOutcome.ADOPTED

    @property
    def message(self) -> str:
        """``SWR-3201: refused — covering-tests-passed: … did not run``."""
        unmet = "; ".join(condition.message for condition in self.unmet)
        because = f" — {self.detail}" if self.detail else ""
        trailing = f" ({unmet})" if unmet else ""
        return f"{self.req_id}: {self.outcome}{because}{trailing}"


@traces(SWR.SWR_3217)
class AdoptionReport(BaseModel):
    """One adoption pass, per requirement (SWR-3609).

    Never a bare count: "adopted 900 of 1500" tells a user nothing they can act
    on, and the 600 are the interesting half.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    results: tuple[AdoptionResult, ...] = ()
    #: The verification run whose evidence this pass judged against.
    run_id: str = ""
    commit: str | None = None
    at: dt.datetime | None = None
    #: Why this pass judged nothing, when it judged nothing. One sentence about
    #: the *run*, carried on the report rather than copied onto every candidate:
    #: the finding is that the measurement failed, and it is one finding.
    blocked_reason: str = ""

    def _of(self, outcome: AdoptionOutcome) -> tuple[AdoptionResult, ...]:
        return tuple(result for result in self.results if result.outcome is outcome)

    @property
    def adopted(self) -> tuple[AdoptionResult, ...]:
        """The requirements this pass took over."""
        return self._of(AdoptionOutcome.ADOPTED)

    @property
    def refused(self) -> tuple[AdoptionResult, ...]:
        """The candidates whose conditions did not hold, each naming them."""
        return self._of(AdoptionOutcome.REFUSED)

    @property
    def skipped(self) -> tuple[AdoptionResult, ...]:
        """The requirements that were never candidates, each saying why."""
        return self._of(AdoptionOutcome.SKIPPED)

    @property
    def inconclusive(self) -> tuple[AdoptionResult, ...]:
        """The candidates this pass could not judge."""
        return self._of(AdoptionOutcome.INCONCLUSIVE)

    @property
    def changed(self) -> bool:
        """Whether this pass wrote anything at all."""
        return bool(self.adopted)

    @property
    def summary(self) -> str:
        """One line: what was taken over, refused, not judged, never considered.

        When the pass could not judge anything, the *reason* leads and the counts
        follow. A user whose suite timed out needs one sentence about the suite,
        not a tally implying fourteen hundred separate findings.
        """
        counts = (
            f"{len(self.adopted)} adopted, {len(self.refused)} refused,"
            f" {len(self.skipped)} not considered"
        )
        if not self.blocked_reason:
            return counts
        return f"{self.blocked_reason} — {counts}, {len(self.inconclusive)} not judged"


@traces(SWR.SWR_3217)
def adoption_candidates(
    requirements: Sequence[CanonicalRequirement],
    delivery: Mapping[str, DeliveryRecord],
    *,
    is_epic: Callable[[str], bool] | None = None,
) -> tuple[tuple[AdoptionCandidate, ...], tuple[AdoptionResult, ...]]:
    """Split *requirements* into what adoption may attempt and what it skips.

    Returns the candidates **and** the skip results together, because a pass that
    silently dropped the requirements it would not consider would report "900
    adopted" over a store of 1500 and leave the user to work out where the rest
    went (SWR-3609).

    Three exclusions, each for a different reason:

    - an **epic** has no implementation of its own and its state is its
      children's (SWR-3212), so adopting one would be inventing a fact;
    - a **deprecated** requirement was retired by the project, which is not the
      same as having been finished;
    - a requirement whose delivery record is **not pristine** has already been
      moved by somebody. This is the exclusion that matters: a bulk pass that
      re-interpreted a state a user set by hand would destroy real work, and
      ``pristine`` (SWR-3201) is exactly "Rotaris has never recorded anything
      about this".
    """
    candidates: list[AdoptionCandidate] = []
    skipped: list[AdoptionResult] = []
    for requirement in requirements:
        req_id = requirement.req_id
        reason = _not_a_candidate(requirement, delivery.get(req_id), is_epic)
        if reason:
            skipped.append(
                AdoptionResult(req_id=req_id, outcome=AdoptionOutcome.SKIPPED, detail=reason),
            )
            continue
        candidates.append(
            AdoptionCandidate(
                req_id=req_id,
                current_hash=requirement.current_hash,
                source_revision=requirement.source_revision,
            ),
        )
    return tuple(candidates), tuple(skipped)


def _not_a_candidate(
    requirement: CanonicalRequirement,
    record: DeliveryRecord | None,
    is_epic: Callable[[str], bool] | None,
) -> str:
    """Why *requirement* is not up for adoption, or empty when it is."""
    if is_epic is not None and is_epic(requirement.req_id):
        return "an epic's state follows from its children (SWR-3212)"
    if requirement.lifecycle is RequirementLifecycle.DEPRECATED:
        return "the project retired this requirement"
    # No "has a hash" check: ``CanonicalRequirement`` computes ``current_hash``
    # from the requirement's own text when the source did not supply one
    # (SWR-3107), so an empty one is not a state this function can be handed.
    if record is not None and not record.delivery.pristine:
        return f"already moved to {record.delivery.state.label}; adoption never overrides a user"
    return ""


@traces(SWR.SWR_3217)
def unjudged_adoption(
    candidates: Sequence[AdoptionCandidate],
    *,
    reason: str,
    skipped: Sequence[AdoptionResult] = (),
    run_id: str = "",
    commit: str | None = None,
    at: dt.datetime | None = None,
) -> AdoptionReport:
    """The report for a pass whose verification observed nothing (SWR-2606).

    Attempting the candidates anyway would produce a refusal per requirement, each
    naming covering tests as unsatisfied — a page of findings manufactured from a
    single fact about a process that died. So the pass does not attempt them: it
    states the one thing that is true, once, and leaves every delivery record
    exactly as it was.

    Not a silent skip either. Every candidate is still named, with
    :attr:`AdoptionOutcome.INCONCLUSIVE`, because SWR-3609's rule that a bulk pass
    accounts for everything it was given does not relax just because the answer is
    "could not tell".
    """
    return AdoptionReport(
        results=(
            *skipped,
            *(
                AdoptionResult(
                    req_id=candidate.req_id,
                    outcome=AdoptionOutcome.INCONCLUSIVE,
                    detail=reason,
                )
                for candidate in candidates
            ),
        ),
        run_id=run_id,
        commit=commit,
        at=at,
        blocked_reason=reason,
    )


@traces(SWR.SWR_3217, SWR.SWR_3218)
@traces(SWR.SWR_3620)
def adopt(
    candidates: Sequence[AdoptionCandidate],
    transitions: DeliveryTransitions,
    *,
    actor: DeliveryActor,
    run_id: str,
    at: dt.datetime,
    commit: str | None = None,
    skipped: Sequence[AdoptionResult] = (),
    progress: PassProgress | None = None,
) -> AdoptionReport:
    """Attempt every candidate through the ordinary write path (SWR-3218).

    *run_id* is the verification run whose evidence the gate will judge against,
    and it is mandatory: an adoption that cannot name the run that checked it is
    a claim, and this whole module exists to refuse claims. The same run id lands
    on every satisfied record the pass writes, because one verification pass over
    the repository is what confirmed all of them.

    Nothing here decides whether a requirement *deserves* ``Done``.
    :meth:`DeliveryTransitions.apply` runs the completion gate the workspace
    configured, inside the store's lock, against evidence read at that moment —
    so a requirement whose covering tests did not run comes back refused with the
    condition named, exactly as it would after a real delivery.

    *progress* is told the candidate this pass is attempting, one at a time
    (SWR-3620). Each attempt takes the store's lock and runs the workspace's
    completion gate, so on a repository-sized store this loop is worth counting.
    """
    results = list(skipped)
    notify(progress, "on_phase", PassPhase.ADOPTING, len(candidates))
    for position, candidate in enumerate(candidates, start=1):
        notify(
            progress,
            "on_item",
            PassPhase.ADOPTING,
            candidate.req_id,
            position,
            len(candidates),
        )
        delivered = SatisfiedDelivery.adopted_by(
            candidate.req_id,
            satisfied_hash=candidate.current_hash,
            run_id=run_id,
            at=at,
            verified_commit=commit,
            source_revision=candidate.source_revision,
        )
        outcome = transitions.apply(
            TransitionRequest(
                req_id=candidate.req_id,
                target=DeliveryState.DONE,
                actor=actor,
                cause=TransitionCause.ADOPTED,
                at=at,
                requirement_hash=candidate.current_hash,
                delivery=delivered,
                run_id=run_id,
                detail="adopted from an existing implementation (SWR-3217)",
            ),
        )
        results.append(_result_of(candidate, outcome))
    return AdoptionReport(results=tuple(results), run_id=run_id, commit=commit, at=at)


def _result_of(candidate: AdoptionCandidate, outcome: TransitionOutcome) -> AdoptionResult:
    """One transition outcome as this pass reports it.

    A refusal keeps both halves the user needs: the precondition that failed, and
    — when it was the completion gate — every unmet condition by name, which is
    the difference between "not adopted" and "no test declares that it verifies
    SWR-3201".
    """
    if outcome.accepted:
        return AdoptionResult(req_id=candidate.req_id, outcome=AdoptionOutcome.ADOPTED)
    refusal = outcome.refusal
    return AdoptionResult(
        req_id=candidate.req_id,
        outcome=AdoptionOutcome.REFUSED,
        detail=refusal.precondition if refusal is not None else "",
        unmet=refusal.unmet if refusal is not None else (),
    )
