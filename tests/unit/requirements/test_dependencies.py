"""Productive use: a user releases two requirements where the second builds on the first,
and expects Rotaris to run them in that order rather than letting an agent invent the
missing foundation.
Expected outcome: the dependent requirement is not schedulable while its dependency is
unmet, the board names the blocking id rather than saying "blocked", a dependency that was
delivered and has since been re-specified still blocks, completing the dependency releases
its dependants with no user action, and a dependency cycle blocks every requirement in it
with the whole cycle named.
"""

from __future__ import annotations

import datetime as dt

import pytest
from pydantic import ValidationError

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.change.dependencies import (
    DependencyBlocker,
    DependencyBlockKind,
    DependencyCycle,
    RequirementReadiness,
    dependency_edges,
    evaluate_dependencies,
    find_cycles,
    gate,
    readiness_of,
    release_after,
)
from rotaris_core.requirements.delivery.satisfied import SatisfiedDelivery, SatisfiedLog
from rotaris_core.requirements.delivery.state import DeliveryState
from rotaris_core.requirements.model import (
    CanonicalRequirement,
    Relation,
    RelationKind,
    RequirementLifecycle,
)
from rotaris_core.requirements.relations import build_relation_graph

pytestmark = pytest.mark.unit

FOUNDATION = "SWR-501"
DEPENDENT = "SWR-502"
AT = dt.datetime(2026, 8, 14, 9, 0, tzinfo=dt.UTC)


def requirement(
    req_id: str,
    *,
    depends_on: tuple[str, ...] = (),
    description: str = "The user gets what they asked for.",
) -> CanonicalRequirement:
    """One requirement as a source read produces it."""
    return CanonicalRequirement(
        req_id=req_id,
        title=f"{req_id} does something",
        description=description,
        lifecycle=RequirementLifecycle.APPROVED,
        source_id="store",
        relations=tuple(
            Relation(kind=RelationKind.DEPENDS_ON, target=target) for target in depends_on
        ),
    )


def readiness(
    req_id: str,
    *,
    state: DeliveryState,
    current: str = "hash-1",
    satisfied: str | None = None,
) -> RequirementReadiness:
    """What is known about one requirement's delivery."""
    return RequirementReadiness(
        req_id=req_id,
        state=state,
        current_hash=current,
        satisfied_hash=satisfied,
    )


def chain(**states: RequirementReadiness) -> dict[str, RequirementReadiness]:
    """Readiness keyed by id."""
    return {entry.req_id: entry for entry in states.values()}


@verifies(SWR.SWR_3510)
def test_a_dependent_requirement_is_not_schedulable_while_its_dependency_is_unmet() -> None:
    """The gate holds the dependant and names the requirement it waits for."""
    report = evaluate_dependencies(
        {DEPENDENT: (FOUNDATION,)},
        chain(
            foundation=readiness(FOUNDATION, state=DeliveryState.RUNNING),
            dependent=readiness(DEPENDENT, state=DeliveryState.READY),
        ),
    )

    verdict = report.verdict_for(DEPENDENT)
    assert verdict.schedulable is False
    assert verdict.board_text == f"Blocked by {FOUNDATION}"
    assert verdict.blockers[0].kind is DependencyBlockKind.UNSATISFIED
    assert "is Running, not Done" in verdict.blockers[0].detail
    assert report.verdict_for(FOUNDATION).schedulable is True
    assert report.blocked_ids == (DEPENDENT,)


@verifies(SWR.SWR_3510)
def test_done_is_not_enough_when_the_specification_has_moved_since() -> None:
    """SWR-3510's satisfaction rule: Done *and* current_hash == satisfied_hash."""
    report = evaluate_dependencies(
        {DEPENDENT: (FOUNDATION,)},
        chain(
            foundation=readiness(
                FOUNDATION,
                state=DeliveryState.DONE,
                current="hash-2",
                satisfied="hash-1",
            ),
            dependent=readiness(DEPENDENT, state=DeliveryState.READY),
        ),
    )

    blocker = report.verdict_for(DEPENDENT).blockers[0]
    assert blocker.kind is DependencyBlockKind.STALE
    assert blocker.board_text == f"Blocked by {FOUNDATION}"
    assert "delivered hash-1" in blocker.detail
    assert "is now hash-2" in blocker.detail


@verifies(SWR.SWR_3510)
def test_a_dependency_that_is_done_and_current_releases_its_dependant() -> None:
    """The only shape of "satisfied" this product recognises."""
    report = evaluate_dependencies(
        {DEPENDENT: (FOUNDATION,)},
        chain(
            foundation=readiness(
                FOUNDATION,
                state=DeliveryState.DONE,
                current="hash-1",
                satisfied="hash-1",
            ),
            dependent=readiness(DEPENDENT, state=DeliveryState.READY),
        ),
    )

    assert report.verdict_for(DEPENDENT).schedulable is True
    assert report.verdict_for(DEPENDENT).board_text == ""
    assert report.blocked_ids == ()


@verifies(SWR.SWR_3510)
def test_a_dependency_nothing_is_known_about_blocks_rather_than_releases() -> None:
    """Guessing "met" would start work on a foundation nobody can point at."""
    report = evaluate_dependencies(
        {DEPENDENT: ("SWR-999",)},
        chain(dependent=readiness(DEPENDENT, state=DeliveryState.READY)),
    )

    blocker = report.verdict_for(DEPENDENT).blockers[0]
    assert blocker.kind is DependencyBlockKind.UNKNOWN
    assert blocker.board_text == "Blocked by SWR-999"
    assert "treated as unmet" in blocker.detail


@verifies(SWR.SWR_3510)
def test_completing_a_dependency_releases_its_dependants_without_user_action() -> None:
    """Two evaluations over the same graph; the second one lets the dependant through."""
    dependencies = {DEPENDENT: (FOUNDATION,), "SWR-503": (FOUNDATION,)}
    before = evaluate_dependencies(
        dependencies,
        chain(
            foundation=readiness(FOUNDATION, state=DeliveryState.RUNNING),
            dependent=readiness(DEPENDENT, state=DeliveryState.READY),
            third=readiness("SWR-503", state=DeliveryState.READY),
        ),
    )
    after = evaluate_dependencies(
        dependencies,
        chain(
            foundation=readiness(
                FOUNDATION,
                state=DeliveryState.DONE,
                current="hash-1",
                satisfied="hash-1",
            ),
            dependent=readiness(DEPENDENT, state=DeliveryState.READY),
            third=readiness("SWR-503", state=DeliveryState.READY),
        ),
    )

    assert before.blocked_ids == (DEPENDENT, "SWR-503")

    manual = release_after(before, after)
    assert manual.released == (DEPENDENT, "SWR-503")
    assert manual.completed == (FOUNDATION,)
    assert manual.starts_now == ()

    automatic = release_after(before, after, automatic=True)
    assert automatic.starts_now == (DEPENDENT, "SWR-503")
    assert "started automatically" in automatic.message


@verifies(SWR.SWR_3510)
def test_a_dependency_cycle_blocks_every_requirement_in_it_with_the_cycle_named() -> None:
    """Breaking a loop needs the loop, not one arbitrary member of it."""
    report = evaluate_dependencies(
        {"SWR-501": ("SWR-502",), "SWR-502": ("SWR-503",), "SWR-503": ("SWR-501",)},
        {},
    )

    assert report.blocked_ids == ("SWR-501", "SWR-502", "SWR-503")
    assert len(report.cycles) == 1
    assert report.cycles[0].members == ("SWR-501", "SWR-502", "SWR-503")
    assert report.cycles[0].message == "SWR-501 → SWR-502 → SWR-503 → SWR-501"
    for req_id in ("SWR-501", "SWR-502", "SWR-503"):
        verdict = report.verdict_for(req_id)
        assert verdict.in_cycle
        blocker = verdict.blockers[0]
        assert blocker.kind is DependencyBlockKind.CYCLE
        assert blocker.cycle == ("SWR-501", "SWR-502", "SWR-503")
        assert "SWR-501 → SWR-502 → SWR-503 → SWR-501" in blocker.detail


@verifies(SWR.SWR_3510)
def test_a_requirement_depending_on_itself_is_a_cycle_of_one() -> None:
    """A source can express it, so the gate has to answer for it."""
    report = evaluate_dependencies({FOUNDATION: (FOUNDATION,)}, {})

    assert [cycle.members for cycle in report.cycles] == [(FOUNDATION,)]
    assert report.verdict_for(FOUNDATION).in_cycle
    assert report.verdict_for(FOUNDATION).schedulable is False


@verifies(SWR.SWR_3510)
def test_two_separate_cycles_are_reported_separately() -> None:
    """One pass, every loop — a second cycle must not hide behind the first."""
    cycles = find_cycles(
        {
            "SWR-501": ("SWR-502",),
            "SWR-502": ("SWR-501",),
            "SWR-601": ("SWR-602",),
            "SWR-602": ("SWR-601",),
            "SWR-701": ("SWR-501",),
        },
    )

    assert [cycle.members for cycle in cycles] == [
        ("SWR-501", "SWR-502"),
        ("SWR-601", "SWR-602"),
    ]
    assert all(not cycle.contains("SWR-701") for cycle in cycles)


@verifies(SWR.SWR_3510)
def test_an_acyclic_chain_reports_no_cycle_however_long_it_is() -> None:
    """A deep chain must not be mistaken for a loop, nor blow the stack."""
    depth = 400
    ids = [f"SWR-{1000 + step}" for step in range(depth)]
    dependencies = {ids[step]: (ids[step + 1],) for step in range(depth - 1)}

    assert find_cycles(dependencies) == ()


@verifies(SWR.SWR_3510)
def test_a_blocked_dependant_outside_the_cycle_names_its_own_dependency() -> None:
    """A requirement waiting on a loop is told what it waits for, not the loop."""
    report = evaluate_dependencies(
        {"SWR-501": ("SWR-502",), "SWR-502": ("SWR-501",), "SWR-701": ("SWR-501",)},
        {},
    )

    verdict = report.verdict_for("SWR-701")
    assert verdict.in_cycle is False
    assert verdict.blockers[0].kind is DependencyBlockKind.UNKNOWN
    assert verdict.board_text == "Blocked by SWR-501"


@verifies(SWR.SWR_3510)
def test_the_gate_reads_depends_on_off_the_requirements_themselves() -> None:
    """The relation already exists in the model; the gate honours it (SWR-3109)."""
    requirements = (
        requirement(FOUNDATION),
        requirement(DEPENDENT, depends_on=(FOUNDATION,)),
    )
    graph = build_relation_graph(requirements)

    assert dependency_edges(graph) == {DEPENDENT: (FOUNDATION,)}

    report = gate(
        requirements,
        {
            FOUNDATION: readiness(FOUNDATION, state=DeliveryState.BACKLOG),
            DEPENDENT: readiness(DEPENDENT, state=DeliveryState.READY),
        },
    )
    assert report.verdict_for(DEPENDENT).board_text == f"Blocked by {FOUNDATION}"


@verifies(SWR.SWR_3510, SWR.SWR_3204)
def test_readiness_joins_the_specification_hash_with_the_delivered_one() -> None:
    """The two axes come from two places and are compared, never merged."""
    spec = requirement(FOUNDATION)
    delivered = SatisfiedLog(
        entries=(
            SatisfiedDelivery(
                req_id=FOUNDATION,
                satisfied_hash=spec.current_hash,
                run_id="run-17",
                satisfied_at=AT,
            ),
        ),
    )

    ready = readiness_of(spec, state=DeliveryState.DONE, satisfied=delivered)
    assert ready.satisfied is True
    assert ready.block_kind is None

    moved = requirement(FOUNDATION, description="The user gets something else entirely.")
    stale = readiness_of(moved, state=DeliveryState.DONE, satisfied=delivered)
    assert stale.satisfied is False
    assert stale.block_kind is DependencyBlockKind.STALE

    never = readiness_of(spec, state=DeliveryState.DONE)
    assert never.delivered is False
    assert never.satisfied is False


@verifies(SWR.SWR_3510)
def test_a_blocker_states_its_reason_and_a_cycle_names_its_cycle() -> None:
    """ "Blocked" without a reason moves the work of finding out onto the user."""
    with pytest.raises(ValidationError, match="states why it blocks"):
        DependencyBlocker(
            req_id=DEPENDENT,
            blocking_id=FOUNDATION,
            kind=DependencyBlockKind.UNSATISFIED,
            detail="  ",
        )
    with pytest.raises(ValidationError, match="names the whole cycle"):
        DependencyBlocker(
            req_id=DEPENDENT,
            blocking_id=FOUNDATION,
            kind=DependencyBlockKind.CYCLE,
            detail="a loop",
        )
    with pytest.raises(ValidationError, match="names each member once"):
        DependencyCycle(members=(FOUNDATION, FOUNDATION))
