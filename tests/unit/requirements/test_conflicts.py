"""Productive use: a project ends up with two requirements that contradict each other —
one says the basket locks after three failed payments, the other says it never locks — and
an agent would happily build whichever it saw first.
Expected outcome: both requirements block, not just the newer one; the block names both
ids, what each of them says and the decision the user has to take; nothing is scheduled for
either while the conflict stands; and resolving it in the source — deleting the relation or
deprecating one side — clears both blocks on the next evaluation, visibly.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.change.conflicts import (
    ConflictDecision,
    ConflictOrigin,
    ConflictSet,
    RequirementConflict,
    declared_conflicts,
    evaluate_conflicts,
    statement_of,
)
from rotaris_core.requirements.model import (
    CanonicalRequirement,
    Relation,
    RelationKind,
    RequirementLifecycle,
)

pytestmark = pytest.mark.unit

LOCKS = "SWR-501"
NEVER_LOCKS = "SWR-502"
UNRELATED = "SWR-503"

LOCK_TEXT = "A basket locks for an hour after three failed payments."
NEVER_TEXT = "A basket is always payable; nothing ever locks it."


def requirement(
    req_id: str,
    title: str,
    description: str,
    *,
    conflicts_with: tuple[str, ...] = (),
    lifecycle: RequirementLifecycle = RequirementLifecycle.APPROVED,
) -> CanonicalRequirement:
    """One requirement as a source read produces it."""
    return CanonicalRequirement(
        req_id=req_id,
        title=title,
        description=description,
        lifecycle=lifecycle,
        source_id="store",
        source_path=f"docs/requirements/{req_id}.md",
        relations=tuple(
            Relation(kind=RelationKind.CONFLICTS_WITH, target=target) for target in conflicts_with
        ),
    )


def store(
    *,
    declare: bool = True,
    deprecate: str | None = None,
    drop: str | None = None,
    lock_title: str = "A basket locks after repeated failure",
) -> tuple[CanonicalRequirement, ...]:
    """The two contradicting requirements, plus an unrelated third."""
    requirements = [
        requirement(
            LOCKS,
            lock_title,
            LOCK_TEXT,
            conflicts_with=(NEVER_LOCKS,) if declare else (),
            lifecycle=(
                RequirementLifecycle.DEPRECATED
                if deprecate == LOCKS
                else RequirementLifecycle.APPROVED
            ),
        ),
        requirement(
            NEVER_LOCKS,
            "A basket is always payable",
            NEVER_TEXT,
            lifecycle=(
                RequirementLifecycle.DEPRECATED
                if deprecate == NEVER_LOCKS
                else RequirementLifecycle.APPROVED
            ),
        ),
        requirement(UNRELATED, "VAT is shown separately", "The receipt separates net and VAT."),
    ]
    return tuple(entry for entry in requirements if entry.req_id != drop)


@verifies(SWR.SWR_3511)
def test_both_requirements_block_not_only_the_one_that_declared_it() -> None:
    """A conflict is a property of the pair; blocking one side decides it silently."""
    conflicts = evaluate_conflicts(store())

    assert conflicts.open
    assert conflicts.blocked_ids == (LOCKS, NEVER_LOCKS)
    assert conflicts.schedulable(LOCKS) is False
    assert conflicts.schedulable(NEVER_LOCKS) is False
    assert conflicts.schedulable(UNRELATED) is True
    assert all(block.schedulable is False for block in conflicts.blocks(LOCKS))
    assert conflicts.blocks(NEVER_LOCKS)[0].other == LOCKS


@verifies(SWR.SWR_3511)
def test_the_block_names_both_ids_the_statements_and_the_decision() -> None:
    """ "Blocked: conflict" is not something a user can act on."""
    conflicts = evaluate_conflicts(store())
    block = conflicts.blocks(LOCKS)[0]

    assert block.board_text == f"Blocked by conflict with {NEVER_LOCKS}"
    message = block.message
    assert LOCKS in message
    assert NEVER_LOCKS in message
    assert "A basket locks after repeated failure" in message
    assert "A basket is always payable" in message
    assert "cannot both hold" in message
    assert "change" in message
    assert "deprecate" in message
    assert "supersede" in message


@verifies(SWR.SWR_3511, SWR.SWR_3114)
def test_the_persisted_reason_carries_the_ids_and_the_decision_but_no_requirement_text() -> None:
    """The half of the block that is allowed to reach disk.

    A delivery record's ``blocked_reason`` is written under
    ``<workspace>/.rotaris/requirements/``. SWR-3114 forbids requirement content
    there — and a title inside a value is invisible to a deny-list over *field
    names*, so the split has to happen before the string is built, not after.

    What survives is what SWR-3511 actually asks the blocker to name: both ids
    and the contradiction, plus the three ways out.
    """
    conflicts = evaluate_conflicts(store())
    block = conflicts.blocks(LOCKS)[0]
    reason = block.blocked_reason

    assert LOCKS in reason
    assert NEVER_LOCKS in reason
    assert "cannot both hold" in reason
    for decision in ConflictDecision:
        assert decision.prompt(LOCKS, NEVER_LOCKS) in reason

    for prose in (
        "A basket locks after repeated failure",
        "A basket is always payable",
        LOCK_TEXT,
        NEVER_TEXT,
    ):
        assert prose not in reason
        assert prose not in block.conflict.blocked_reason
    # The render-only half still carries them, which is what makes it the
    # render-only half.
    assert "A basket locks after repeated failure" in block.message


@verifies(SWR.SWR_3511, SWR.SWR_3114)
def test_the_statements_are_resolved_at_render_time_from_the_current_read() -> None:
    """The other half: the prose is joined back in from the source, not from a store.

    The point is that it is the *current* text. A stored title would be the title
    as it read on the day of the block; re-rendering against a fresh evaluation
    shows whatever the requirement says now, which is the only version that
    cannot silently diverge from the source it claims to quote.
    """
    block = evaluate_conflicts(store()).blocks(LOCKS)[0]

    reworded = evaluate_conflicts(
        store(lock_title="A basket locks after three declined cards"),
    ).get(LOCKS, NEVER_LOCKS)
    assert reworded is not None

    card = block.rendered(reworded)
    assert "A basket locks after three declined cards" in card
    assert "A basket locks after repeated failure" not in card
    assert block.board_text in card

    # And a block may only be rendered against its own pair.
    other = RequirementConflict(
        left=NEVER_LOCKS,
        right=UNRELATED,
        contradiction="these two also disagree",
    )
    with pytest.raises(ValueError, match="is not part of the conflict"):
        block.rendered(other)


@verifies(SWR.SWR_3511)
def test_the_decision_vocabulary_is_the_three_things_a_user_may_do() -> None:
    """ "Let the agent decide" is deliberately not one of them."""
    assert {str(decision) for decision in ConflictDecision} == {
        "change-one",
        "deprecate-one",
        "supersede-one",
    }
    conflict = evaluate_conflicts(store()).conflicts[0]
    assert conflict.decisions == (
        ConflictDecision.CHANGE_ONE,
        ConflictDecision.DEPRECATE_ONE,
        ConflictDecision.SUPERSEDE_ONE,
    )
    assert conflict.question.count(";") == 2


@verifies(SWR.SWR_3511)
def test_a_symmetric_declaration_produces_one_conflict_not_two() -> None:
    """A store writing the relation on both sides states one fact (SWR-3110)."""
    both = (
        requirement(
            LOCKS,
            "A basket locks after repeated failure",
            LOCK_TEXT,
            conflicts_with=(NEVER_LOCKS,),
        ),
        requirement(
            NEVER_LOCKS,
            "A basket is always payable",
            NEVER_TEXT,
            conflicts_with=(LOCKS,),
        ),
    )

    assert declared_conflicts(both) == ((LOCKS, NEVER_LOCKS),)
    conflicts = evaluate_conflicts(both)
    assert len(conflicts.conflicts) == 1
    assert conflicts.conflicts[0].ids == (LOCKS, NEVER_LOCKS)


@verifies(SWR.SWR_3511)
def test_a_conflict_declared_the_other_way_round_is_still_the_same_conflict() -> None:
    """Normalisation, so a board never shows one contradiction twice."""
    conflict = RequirementConflict(
        left=NEVER_LOCKS,
        right=LOCKS,
        left_statement=NEVER_TEXT,
        right_statement=LOCK_TEXT,
        contradiction="one locks the basket, the other never does",
    )

    assert conflict.ids == (LOCKS, NEVER_LOCKS)
    assert conflict.statement_for(LOCKS) == LOCK_TEXT
    assert conflict.statement_for(NEVER_LOCKS) == NEVER_TEXT
    assert conflict.other(LOCKS) == NEVER_LOCKS


@verifies(SWR.SWR_3511)
def test_a_detected_conflict_blocks_exactly_like_a_declared_one() -> None:
    """SWR-3511 makes no distinction, and neither does the gate."""
    detected = RequirementConflict(
        left=LOCKS,
        right=NEVER_LOCKS,
        origin=ConflictOrigin.DETECTED,
        contradiction="the two acceptance criteria cannot both be satisfied",
        detected_by="impact-analyst (claude-opus-5)",
    )

    conflicts = evaluate_conflicts(store(declare=False), detected=(detected,))

    assert conflicts.blocked_ids == (LOCKS, NEVER_LOCKS)
    found = conflicts.get(NEVER_LOCKS, LOCKS)
    assert found is not None
    assert found.origin is ConflictOrigin.DETECTED
    assert found.detected_by == "impact-analyst (claude-opus-5)"


@verifies(SWR.SWR_3511)
def test_a_conflict_both_declared_and_detected_keeps_the_detected_contradiction() -> None:
    """The source saying it is the stronger fact; the analysis said *why*."""
    detected = RequirementConflict(
        left=LOCKS,
        right=NEVER_LOCKS,
        origin=ConflictOrigin.DETECTED,
        contradiction="the two acceptance criteria cannot both be satisfied",
        detected_by="impact-analyst (claude-opus-5)",
    )

    conflict = evaluate_conflicts(store(), detected=(detected,)).conflicts[0]

    assert conflict.origin is ConflictOrigin.DECLARED
    assert conflict.contradiction == "the two acceptance criteria cannot both be satisfied"
    assert conflict.detected_by == "impact-analyst (claude-opus-5)"


@verifies(SWR.SWR_3511)
def test_deleting_the_relation_clears_both_blocks_on_the_next_evaluation() -> None:
    """Resolution is re-evaluation; there is no flag anyone can forget to clear."""
    before = evaluate_conflicts(store())
    after = evaluate_conflicts(store(declare=False))

    assert after.open is False
    assert after.schedulable(LOCKS) is True
    assert after.schedulable(NEVER_LOCKS) is True

    cleared = after.cleared_against(before)
    assert [resolution.ids for resolution in cleared] == [(LOCKS, NEVER_LOCKS)]
    assert "no longer declares a conflict" in cleared[0].message


@verifies(SWR.SWR_3511)
def test_deprecating_one_side_clears_the_conflict_and_says_so() -> None:
    """The decision was taken; the survivor may proceed and the reason is visible."""
    before = evaluate_conflicts(store())
    after = evaluate_conflicts(store(deprecate=NEVER_LOCKS))

    assert after.open is False
    assert after.schedulable(LOCKS) is True
    assert [resolution.conflict.ids for resolution in after.resolved] == [(LOCKS, NEVER_LOCKS)]
    assert "deprecated" in after.resolved[0].reason
    assert after.cleared_against(before)[0].reason == after.resolved[0].reason


@verifies(SWR.SWR_3511)
def test_a_conflict_with_a_requirement_that_no_longer_exists_does_not_stand() -> None:
    """Holding the survivor on a relation to nothing would be a block nobody can clear."""
    conflicts = evaluate_conflicts(store(drop=NEVER_LOCKS))

    assert conflicts.open is False
    assert conflicts.schedulable(LOCKS) is True
    assert "is not in the requirement set any more" in conflicts.resolved[0].reason


@verifies(SWR.SWR_3511)
def test_a_conflict_without_a_stated_contradiction_cannot_be_built() -> None:
    """A block a user cannot act on is not a block, it is a wall."""
    with pytest.raises(ValidationError, match="states what contradicts"):
        RequirementConflict(left=LOCKS, right=NEVER_LOCKS, contradiction="   ")
    with pytest.raises(ValidationError, match="cannot conflict with itself"):
        RequirementConflict(left=LOCKS, right=LOCKS, contradiction="itself")
    with pytest.raises(ValidationError, match="at least one way out"):
        RequirementConflict(
            left=LOCKS,
            right=NEVER_LOCKS,
            contradiction="they disagree",
            decisions=(),
        )


@verifies(SWR.SWR_3511)
def test_the_same_pair_cannot_be_reported_twice_in_one_evaluation() -> None:
    """Two rows for one contradiction would read as two decisions to take."""
    conflict = RequirementConflict(
        left=LOCKS,
        right=NEVER_LOCKS,
        contradiction="they disagree",
    )
    with pytest.raises(ValidationError, match="reported twice"):
        ConflictSet(conflicts=(conflict, conflict))


@verifies(SWR.SWR_3511)
def test_a_conflict_quotes_the_title_or_the_first_line_of_the_description() -> None:
    """The block has to show *what* contradicts, not only which ids do."""
    titled = requirement(LOCKS, "A basket locks after repeated failure", LOCK_TEXT)
    untitled = CanonicalRequirement(req_id=NEVER_LOCKS, description=NEVER_TEXT)

    assert statement_of(titled) == "A basket locks after repeated failure"
    assert statement_of(untitled) == NEVER_TEXT
