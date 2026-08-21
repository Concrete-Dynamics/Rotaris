"""Contradicting requirements block instead of being resolved by an agent (SWR-3511).

When two valid requirements contradict each other, choosing between them is a
product decision. An agent that picks one implements a decision nobody made, and
the losing requirement's tests fail afterwards without anyone being able to say
why. So a conflict is not an input to a judgement here — it is a **stop**.

Three properties, and each is the answer to a way this could go wrong:

**Both sides block.** A conflict is a property of the *pair*, so
:class:`RequirementConflict` is normalised to one canonical ordering and
:meth:`ConflictSet.blocks` answers for either end. Blocking only the newer
requirement would let the older one be built and quietly win the argument.

**The blocker names both ids, the statements and the decision.** "Blocked:
conflict" is not actionable. What a user needs is which two requirements, what
each says, and which of the three things they can do about it — change one,
deprecate one, or supersede one — so the block is a question with answers rather
than a wall.

**Resolution is re-evaluation, not bookkeeping.** :func:`evaluate_conflicts` is a
pure function of the current read: delete the ``conflicts-with`` edge or
deprecate one side and the next evaluation simply has no conflict to report.
There is no "resolved" flag to forget to clear, and
:meth:`ConflictSet.cleared_against` makes the disappearance *visible* rather than
merely silent.

Nothing in this module writes: it reads a requirement set and answers with
values. The statements it quotes are requirement content and stay in memory for
the length of one evaluation — persisting them would make Rotaris a second
requirement repository (SWR-3114), which is why the analysis record
(SWR-3514) is written from the ids, never from this.

That rule is not left to a caller's discretion, because a docstring is not a
boundary. Every text this module produces belongs to exactly one of two sets:

```text
render-only  RequirementConflict.message   ids + statements + contradiction
             ConflictBlock.message         board text + the above
             ConflictBlock.rendered(…)     the above, statements resolved now
             ConflictSet.report            the lines a view prints

persistable  RequirementConflict.blocked_reason   ids + contradiction + decisions
             ConflictBlock.blocked_reason         board text + the above
```

A delivery transition's ``reason`` reaches ``<workspace>/.rotaris/requirements/``
on disk, so it takes the persistable half; a user still sees what each
requirement *says*, read back from the source at render time — which is also the
only version that cannot go stale against the requirement it quotes.
"""

from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING, Self

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.model import RelationKind, requirement_sort_key

if TYPE_CHECKING:
    from collections.abc import Iterable, Mapping

    from rotaris_core.requirements.model import CanonicalRequirement

__all__ = [
    "DEFAULT_DECISIONS",
    "ConflictBlock",
    "ConflictDecision",
    "ConflictOrigin",
    "ConflictResolution",
    "ConflictSet",
    "RequirementConflict",
    "declared_conflicts",
    "evaluate_conflicts",
    "statement_of",
]


class ConflictOrigin(StrEnum):
    """Where the knowledge that two requirements contradict came from."""

    #: A ``conflicts-with`` relation authored in the source (SWR-3109).
    DECLARED = "declared"
    #: Found while analysing a change (SWR-3503) rather than stated by anyone.
    DETECTED = "detected"

    @property
    def label(self) -> str:
        """``Declared`` — what a card prints."""
        return self.value.capitalize()


@traces(SWR.SWR_3511)
class ConflictDecision(StrEnum):
    """What a user may do about a conflict. The complete answer space.

    Exactly the three SWR-3511 names. "Let the agent decide" is deliberately not
    a member: it is the outcome this requirement exists to make impossible.
    """

    CHANGE_ONE = "change-one"
    DEPRECATE_ONE = "deprecate-one"
    SUPERSEDE_ONE = "supersede-one"

    @property
    def label(self) -> str:
        """``Deprecate One`` — what a button says."""
        return " ".join(part.capitalize() for part in self.value.split("-"))

    def prompt(self, left: str, right: str) -> str:
        """The decision spelled out for this pair."""
        if self is ConflictDecision.CHANGE_ONE:
            return f"change {left} or {right} so they no longer contradict"
        if self is ConflictDecision.DEPRECATE_ONE:
            return f"deprecate {left} or {right}"
        return f"let one of {left}, {right} supersede the other"


#: The three decisions offered for every conflict, in the order SWR-3511 lists
#: them. A tuple rather than the enum itself so a caller can narrow the offer for
#: a source that cannot deprecate (SWR-3105) without redefining the vocabulary.
DEFAULT_DECISIONS: tuple[ConflictDecision, ...] = (
    ConflictDecision.CHANGE_ONE,
    ConflictDecision.DEPRECATE_ONE,
    ConflictDecision.SUPERSEDE_ONE,
)


@traces(SWR.SWR_3511)
def statement_of(requirement: CanonicalRequirement, *, limit: int = 200) -> str:
    """The one line of *requirement* a conflict quotes.

    The title when there is one, else the first sentence of the description. A
    conflict has to show *what* contradicts, and an id pair does not; a whole
    description would bury it.
    """
    if requirement.title.strip():
        return requirement.title.strip()
    first = requirement.description.strip().splitlines()
    text = first[0].strip() if first else ""
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


@traces(SWR.SWR_3511)
class RequirementConflict(BaseModel):
    """Two requirements that cannot both hold, with what each of them says.

    Normalised: ``left`` is always the lower id, and the statements travel with
    their side through the swap. Without that, ``A conflicts-with B`` and ``B
    conflicts-with A`` would be two conflicts about one fact, and a board would
    show the same contradiction twice.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    left: str
    right: str
    #: What each side says. Requirement content, held for the length of one
    #: evaluation and never persisted (SWR-3114).
    left_statement: str = ""
    right_statement: str = ""
    origin: ConflictOrigin = ConflictOrigin.DECLARED
    #: What contradicts. Mandatory: SWR-3511's second acceptance criterion is
    #: that the blocker names the contradiction, and an empty string is not one.
    contradiction: str
    decisions: tuple[ConflictDecision, ...] = DEFAULT_DECISIONS
    #: Who found it, for a detected conflict (SWR-3514 attribution).
    detected_by: str = ""

    @field_validator("contradiction")
    @classmethod
    def _stated(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError(
                "a conflict states what contradicts; 'these conflict' is not a"
                " decision anybody can take (SWR-3511)",
            )
        return cleaned

    @model_validator(mode="after")
    def _normalised(self) -> Self:
        left, right = self.left.strip(), self.right.strip()
        if not left or not right:
            raise ValueError("a conflict names both requirements")
        if left == right:
            raise ValueError(f"{left} cannot conflict with itself")
        if not self.decisions:
            raise ValueError(
                f"{left}/{right}: a conflict offers at least one way out (SWR-3511)",
            )
        if requirement_sort_key(right) < requirement_sort_key(left):
            # Read both statements out first: assigning one of them would
            # otherwise be the value the second assignment reads back.
            lower, higher = self.right_statement, self.left_statement
            object.__setattr__(self, "left", right)
            object.__setattr__(self, "right", left)
            object.__setattr__(self, "left_statement", lower)
            object.__setattr__(self, "right_statement", higher)
        else:
            object.__setattr__(self, "left", left)
            object.__setattr__(self, "right", right)
        return self

    @property
    def ids(self) -> tuple[str, str]:
        """Both requirements, in canonical order."""
        return (self.left, self.right)

    @property
    def key(self) -> str:
        """The identity of this pair, independent of who declared it."""
        return f"{self.left}|{self.right}"

    def involves(self, req_id: str) -> bool:
        """Whether *req_id* is one of the two."""
        return req_id.strip() in self.ids

    def other(self, req_id: str) -> str:
        """The requirement on the far side of the conflict."""
        cleaned = req_id.strip()
        if cleaned == self.left:
            return self.right
        if cleaned == self.right:
            return self.left
        raise ValueError(f"{req_id} is not part of the conflict {self.key}")

    def statement_for(self, req_id: str) -> str:
        """What *req_id* says, as this conflict quotes it."""
        cleaned = req_id.strip()
        if cleaned == self.left:
            return self.left_statement
        if cleaned == self.right:
            return self.right_statement
        raise ValueError(f"{req_id} is not part of the conflict {self.key}")

    @property
    def question(self) -> str:
        """The decision the user has to take, spelled out."""
        return "; ".join(decision.prompt(self.left, self.right) for decision in self.decisions)

    @property
    def message(self) -> str:
        """The whole block in one line: both ids, both statements, the decision.

        **Render-only, and never persisted.** It quotes
        :attr:`left_statement` and :attr:`right_statement`, which are requirement
        content read from the source for the length of one evaluation. Writing
        this string anywhere under ``<workspace>/.rotaris/requirements/`` would
        make the delivery store a partial mirror of the requirement repository,
        which is exactly what SWR-3114 forbids. Everything that reaches disk uses
        :attr:`blocked_reason`; everything a user reads uses this, rebuilt from
        the current source on every render.
        """
        left = f" ({self.left_statement})" if self.left_statement else ""
        right = f" ({self.right_statement})" if self.right_statement else ""
        return (
            f"{self.left}{left} conflicts with {self.right}{right}:"
            f" {self.contradiction}. Decide: {self.question}"
        )

    @property
    def blocked_reason(self) -> str:
        """The same block with the requirement text left out — the persistable half.

        SWR-3511 asks the blocker to name "both ids and the contradiction", and
        that is precisely what survives here: the two ids, what contradicts, and
        the three decisions. What does *not* survive is the two statements, which
        are titles and descriptions belonging to the source.

        The split is the whole point. A delivery record keeps a
        ``blocked_reason``, and a reader months later has to be able to
        reconstruct the block from it — from ids and hashes, resolving the text
        against whatever the source says *now* (SWR-3114). A stored title would
        instead be the title as it read on the day of the block, silently
        diverging from the requirement it claims to quote.
        """
        return (
            f"{self.left} conflicts with {self.right}:"
            f" {self.contradiction}. Decide: {self.question}"
        )


@traces(SWR.SWR_3511)
class ConflictBlock(BaseModel):
    """One requirement held by one conflict.

    There is no "unblocked" variant: a block exists only while the conflict does,
    so :attr:`schedulable` is ``False`` by construction and a scheduler cannot
    read a standing conflict as a cleared one.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    conflict: RequirementConflict

    @model_validator(mode="after")
    def _about_this_pair(self) -> Self:
        if not self.conflict.involves(self.req_id):
            raise ValueError(
                f"{self.req_id} is not part of the conflict {self.conflict.key}",
            )
        return self

    @property
    def other(self) -> str:
        """The requirement this one contradicts."""
        return self.conflict.other(self.req_id)

    @property
    def schedulable(self) -> bool:
        """Always false: no unit is scheduled while the conflict stands."""
        return False

    @property
    def board_text(self) -> str:
        """``Blocked by conflict with SWR-502`` — what the card says."""
        return f"Blocked by conflict with {self.other}"

    @property
    def message(self) -> str:
        """The card text plus the contradiction and the decision. Render-only.

        Carries the two statements, so it is what a *view* shows and never what a
        store keeps — see :attr:`RequirementConflict.message`. Use
        :attr:`blocked_reason` for anything that is written down.
        """
        return f"{self.board_text}: {self.conflict.message}"

    @property
    def blocked_reason(self) -> str:
        """What a delivery transition records as the reason. No requirement text.

        The one string of this module that is allowed to reach disk: ids, the
        contradiction and the decisions, and nothing that was read out of a
        requirement's title or description (SWR-3114).
        """
        return f"{self.board_text}: {self.conflict.blocked_reason}"

    def rendered(self, conflict: RequirementConflict | None = None) -> str:
        """This block as a user reads it, with the statements resolved *now*.

        The other half of the SWR-3114 split: the store hands back
        :attr:`blocked_reason`, and a surface that wants to show what each
        requirement says re-reads the source and passes the freshly evaluated
        conflict here. Passing nothing renders whatever this block already
        carries, which is the current read in the common case.
        """
        chosen = conflict if conflict is not None else self.conflict
        if not chosen.involves(self.req_id):
            raise ValueError(
                f"{self.req_id} is not part of the conflict {chosen.key};"
                " a block is rendered against its own pair",
            )
        return f"{self.board_text}: {chosen.message}"


@traces(SWR.SWR_3511)
class ConflictResolution(BaseModel):
    """A conflict that no longer stands, and why.

    Reported rather than dropped. A conflict vanishing between two evaluations is
    something a user acted on, and showing "this cleared because SWR-502 is now
    deprecated" is the difference between a system that answered them and one
    that merely stopped complaining.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    conflict: RequirementConflict
    reason: str

    @field_validator("reason")
    @classmethod
    def _stated(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("a cleared conflict says what cleared it")
        return cleaned

    @property
    def ids(self) -> tuple[str, str]:
        """Both requirements the conflict held."""
        return self.conflict.ids

    @property
    def message(self) -> str:
        """One line for the history view."""
        return f"{self.conflict.left} / {self.conflict.right}: {self.reason}"


@traces(SWR.SWR_3511)
class ConflictSet(BaseModel):
    """Every open conflict in one requirement set, and every one that cleared."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    conflicts: tuple[RequirementConflict, ...] = ()
    resolved: tuple[ConflictResolution, ...] = ()

    @model_validator(mode="after")
    def _unique_and_ordered(self) -> Self:
        seen: set[str] = set()
        for conflict in self.conflicts:
            if conflict.key in seen:
                raise ValueError(f"{conflict.key} is reported twice in one evaluation")
            seen.add(conflict.key)
        object.__setattr__(
            self,
            "conflicts",
            tuple(sorted(self.conflicts, key=lambda c: requirement_sort_key(c.left))),
        )
        return self

    @property
    def open(self) -> bool:
        """Whether anything is blocked by a conflict right now."""
        return bool(self.conflicts)

    @property
    def blocked_ids(self) -> tuple[str, ...]:
        """Every requirement held by a conflict — both sides of each pair."""
        return tuple(
            sorted(
                {req_id for conflict in self.conflicts for req_id in conflict.ids},
                key=requirement_sort_key,
            ),
        )

    def for_requirement(self, req_id: str) -> tuple[RequirementConflict, ...]:
        """The conflicts *req_id* is part of."""
        return tuple(conflict for conflict in self.conflicts if conflict.involves(req_id))

    def blocks(self, req_id: str) -> tuple[ConflictBlock, ...]:
        """The blocks standing against *req_id*, one per conflict."""
        return tuple(
            ConflictBlock(req_id=req_id.strip(), conflict=conflict)
            for conflict in self.for_requirement(req_id)
        )

    def schedulable(self, req_id: str) -> bool:
        """Whether *req_id* may be scheduled as far as conflicts are concerned."""
        return not self.for_requirement(req_id)

    def get(self, left: str, right: str) -> RequirementConflict | None:
        """The conflict between two ids, whichever order they are named in."""
        wanted = frozenset({left.strip(), right.strip()})
        return next(
            (conflict for conflict in self.conflicts if frozenset(conflict.ids) == wanted),
            None,
        )

    def cleared_against(self, previous: ConflictSet) -> tuple[ConflictResolution, ...]:
        """Conflicts *previous* reported that this evaluation no longer does.

        What "resolving the conflict in the source clears both blocks on the next
        evaluation" is checked with: run the evaluation again over the edited
        store and ask what disappeared.
        """
        standing = {conflict.key for conflict in self.conflicts}
        explained = {resolution.conflict.key: resolution for resolution in self.resolved}
        return tuple(
            explained.get(
                conflict.key,
                ConflictResolution(
                    conflict=conflict,
                    reason=(
                        f"the source no longer declares a conflict between"
                        f" {conflict.left} and {conflict.right}"
                    ),
                ),
            )
            for conflict in previous.conflicts
            if conflict.key not in standing
        )

    @property
    def report(self) -> tuple[str, ...]:
        """The lines a user is shown: the open blocks, then what cleared."""
        return (
            *(conflict.message for conflict in self.conflicts),
            *(resolution.message for resolution in self.resolved),
        )


def _pair_key(left: str, right: str) -> tuple[str, str]:
    return (
        (left, right)
        if requirement_sort_key(left) <= requirement_sort_key(right)
        else (right, left)
    )


@traces(SWR.SWR_3511)
def declared_conflicts(
    requirements: Iterable[CanonicalRequirement],
) -> tuple[tuple[str, str], ...]:
    """The ``conflicts-with`` pairs a requirement set authors. Pure.

    De-duplicated: the relation is symmetric, so a store that writes it on both
    sides declares one conflict, not two (SWR-3110).
    """
    pairs: set[tuple[str, str]] = set()
    for requirement in requirements:
        for target in requirement.related_ids(RelationKind.CONFLICTS_WITH):
            if target.strip() and target.strip() != requirement.req_id:
                pairs.add(_pair_key(requirement.req_id, target.strip()))
    return tuple(sorted(pairs, key=lambda pair: requirement_sort_key(pair[0])))


def _declared_contradiction(left: str, right: str) -> str:
    return (
        f"{left} and {right} are declared to contradict each other;"
        " their statements cannot both hold"
    )


@traces(SWR.SWR_3511)
def evaluate_conflicts(
    requirements: Iterable[CanonicalRequirement],
    *,
    detected: Iterable[RequirementConflict] = (),
) -> ConflictSet:
    """Every conflict standing over *requirements* right now. Pure.

    Declared and detected conflicts are treated identically — SWR-3511 says
    "whether declared in the source or detected during analysis" — and a pair
    that arrives from both keeps the ``declared`` origin, because the source
    saying it is the stronger fact.

    Two things clear a conflict, and both are stated rather than silent:

    - **one side is deprecated.** The contradiction is decided: the deprecated
      requirement lost, and the other may proceed;
    - **one side is gone.** An id the read does not contain cannot contradict
      anything, and holding the survivor on a relation to nothing would be a
      block nobody could clear.

    A pair whose ``conflicts-with`` edge was simply deleted does not appear here
    at all, which is the third and most common resolution;
    :meth:`ConflictSet.cleared_against` is how that one is made visible.
    """
    by_id: dict[str, CanonicalRequirement] = {}
    for requirement in requirements:
        by_id.setdefault(requirement.req_id, requirement)

    proposed: dict[tuple[str, str], RequirementConflict] = {}
    for conflict in detected:
        proposed[_pair_key(conflict.left, conflict.right)] = conflict
    for left, right in declared_conflicts(by_id.values()):
        existing = proposed.get((left, right))
        proposed[(left, right)] = RequirementConflict(
            left=left,
            right=right,
            left_statement=statement_of(by_id[left]) if left in by_id else "",
            right_statement=statement_of(by_id[right]) if right in by_id else "",
            origin=ConflictOrigin.DECLARED,
            contradiction=(
                existing.contradiction
                if existing is not None
                else _declared_contradiction(left, right)
            ),
            decisions=existing.decisions if existing is not None else DEFAULT_DECISIONS,
            detected_by=existing.detected_by if existing is not None else "",
        )

    standing: list[RequirementConflict] = []
    resolved: list[ConflictResolution] = []
    for pair in sorted(proposed, key=lambda item: requirement_sort_key(item[0])):
        conflict = proposed[pair]
        reason = _resolution_reason(conflict, by_id)
        if reason is None:
            standing.append(conflict)
        else:
            resolved.append(ConflictResolution(conflict=conflict, reason=reason))
    return ConflictSet(conflicts=tuple(standing), resolved=tuple(resolved))


def _resolution_reason(
    conflict: RequirementConflict,
    by_id: Mapping[str, CanonicalRequirement],
) -> str | None:
    """Why *conflict* no longer stands, or ``None`` while it does."""
    missing = tuple(req_id for req_id in conflict.ids if req_id not in by_id)
    if missing:
        return (
            f"{', '.join(missing)} is not in the requirement set any more;"
            " the contradiction cannot stand"
        )
    deprecated = tuple(req_id for req_id in conflict.ids if by_id[req_id].is_deprecated)
    if deprecated:
        return (
            f"{', '.join(deprecated)} is deprecated; the contradiction is decided"
            " and the other requirement may proceed"
        )
    return None
