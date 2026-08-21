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
    plan_release,
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


# ── the chain a held release has to work through (SWR-3623) ────────────────

MIDDLE = "SWR-503"
TOP = "SWR-504"


def held(
    *ids: str, state: DeliveryState = DeliveryState.BACKLOG
) -> dict[str, RequirementReadiness]:
    """Readiness for a set of requirements that have all delivered nothing."""
    return {req_id: readiness(req_id, state=state) for req_id in ids}


@verifies(SWR.SWR_3623)
def test_the_chain_above_a_held_requirement_comes_back_roots_first() -> None:
    """Productive use: the user wants TOP, and needs to know what to work on instead.

    A line of three: TOP waits for MIDDLE waits for FOUNDATION. The useful answer
    is FOUNDATION — the one with nothing of its own left to wait for — and the
    whole chain in the order it has to land, so the user can see how far away
    what they asked for actually is.
    """
    report = evaluate_dependencies(
        {TOP: (MIDDLE,), MIDDLE: (FOUNDATION,)},
        held(FOUNDATION, MIDDLE, TOP),
    )

    plan = plan_release(TOP, report)

    assert plan.blocked is True
    assert plan.order == (FOUNDATION, MIDDLE)
    assert plan.root == FOUNDATION
    assert plan.resolvable is True
    assert plan.root_state is DeliveryState.BACKLOG
    assert plan.chain == (FOUNDATION, MIDDLE, TOP)
    # The direct blocker is the one the gate raised, carried through untouched.
    assert [blocker.blocking_id for blocker in plan.blockers] == [MIDDLE]
    assert plan.message == f"{TOP} waits for {MIDDLE}; start with {FOUNDATION}"


@verifies(SWR.SWR_3623)
def test_a_requirement_nothing_holds_has_no_chain_to_work_through() -> None:
    """The gate lets it through, so the release goes ahead with nothing to ask."""
    report = evaluate_dependencies(
        {DEPENDENT: (FOUNDATION,)},
        chain(
            foundation=readiness(FOUNDATION, state=DeliveryState.DONE, satisfied="hash-1"),
            dependent=readiness(DEPENDENT, state=DeliveryState.BACKLOG),
        ),
    )

    plan = plan_release(DEPENDENT, report)

    assert plan.blocked is False
    assert plan.order == ()
    assert plan.root == ""
    assert plan.resolvable is False
    assert plan.chain == (DEPENDENT,)


@verifies(SWR.SWR_3623)
def test_two_chains_meeting_at_one_root_propose_that_root_once() -> None:
    """A diamond: TOP waits for both middles, and both wait for FOUNDATION.

    Deterministic and de-duplicated. A plan that proposed a different root on
    the second read would send the user to a different card for no reason they
    could see.
    """
    report = evaluate_dependencies(
        {TOP: (MIDDLE, DEPENDENT), MIDDLE: (FOUNDATION,), DEPENDENT: (FOUNDATION,)},
        held(FOUNDATION, DEPENDENT, MIDDLE, TOP),
    )

    plan = plan_release(TOP, report)

    assert plan.order == (FOUNDATION, DEPENDENT, MIDDLE)
    assert plan.root == FOUNDATION
    assert plan_release(TOP, report).order == plan.order


@verifies(SWR.SWR_3623, SWR.SWR_3510)
def test_a_cycle_in_the_chain_is_stated_and_no_root_is_invented() -> None:
    """Nothing in a loop can be released, so the plan offers nobody and says why."""
    report = evaluate_dependencies(
        {TOP: (FOUNDATION,), FOUNDATION: (MIDDLE,), MIDDLE: (FOUNDATION,)},
        held(FOUNDATION, MIDDLE, TOP),
    )

    plan = plan_release(TOP, report)

    assert plan.blocked is True
    assert plan.resolvable is False
    assert plan.cycle is not None
    assert plan.cycle.contains(FOUNDATION)
    # The loop as a user has to break it, not the downstream symptom.
    assert f"{FOUNDATION} → {MIDDLE} → {FOUNDATION}" in plan.root_reason
    assert "broken in the source" in plan.root_reason
    # Every member is still named: a plan that lost one would understate the work.
    assert set(plan.order) == {FOUNDATION, MIDDLE}


@verifies(SWR.SWR_3623, SWR.SWR_3109)
def test_a_dangling_dependency_is_named_as_unknown_rather_than_released() -> None:
    """Rotaris cannot release a requirement its own store does not contain."""
    report = evaluate_dependencies({TOP: ("SWR-9999",)}, held(TOP))

    plan = plan_release(TOP, report)

    assert plan.unknown == ("SWR-9999",)
    assert plan.root == "SWR-9999"
    assert plan.resolvable is False
    assert "Nothing is known about SWR-9999" in plan.root_reason
    assert plan.root_state is None


@verifies(SWR.SWR_3623)
def test_a_root_already_in_flight_is_reported_in_its_own_state() -> None:
    """ "Start with SWR-501" would be a second release of work already running."""
    report = evaluate_dependencies(
        {TOP: (FOUNDATION,)},
        chain(
            foundation=readiness(FOUNDATION, state=DeliveryState.RUNNING),
            top=readiness(TOP, state=DeliveryState.BACKLOG),
        ),
    )

    plan = plan_release(TOP, report)

    assert plan.root == FOUNDATION
    assert plan.resolvable is False
    assert plan.root_reason == f"{FOUNDATION} is already Running; the work on it has started."


@verifies(SWR.SWR_3623)
def test_a_root_that_needs_an_update_is_still_a_root() -> None:
    """`Needs Update → Ready` is a release, so a re-specified root is offered."""
    report = evaluate_dependencies(
        {TOP: (FOUNDATION,)},
        chain(
            foundation=readiness(FOUNDATION, state=DeliveryState.NEEDS_UPDATE),
            top=readiness(TOP, state=DeliveryState.BACKLOG),
        ),
    )

    plan = plan_release(TOP, report)

    assert plan.resolvable is True
    assert plan.root_state is DeliveryState.NEEDS_UPDATE
    assert plan.root_reason == ""


@verifies(SWR.SWR_3623)
def test_a_deep_chain_is_walked_without_recursion() -> None:
    """A requirement store is user-supplied: depth must not end a board pass."""
    ids = [f"SWR-{6000 + step}" for step in range(400)]
    edges = {child: (parent,) for parent, child in zip(ids, ids[1:], strict=False)}

    report = evaluate_dependencies(edges, held(*ids))
    plan = plan_release(ids[-1], report)

    assert plan.root == ids[0]
    assert len(plan.order) == len(ids) - 1
