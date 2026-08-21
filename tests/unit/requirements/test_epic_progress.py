"""Productive use: a user opens an epic card. Twelve requirements sit under it, two of
them retired, one blocked and one being implemented right now.
Expected outcome: the card shows counts and percentages computed from the children — not a
number anyone maintains — the retired two are excluded and named, a nested epic rolls its
subtree up transitively, and dragging the epic itself onto another column is refused
because its state follows from its children."""

from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING

import pytest
from pydantic import ValidationError

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery import (
    DeliveryActor,
    DeliveryRecord,
    DeliveryState,
    DeliveryStatus,
    DeliveryStore,
    DeliveryTransitions,
    DeliveryView,
    RefusalKind,
    TransitionCause,
    TransitionRequest,
)
from rotaris_core.requirements.delivery.epics import (
    ChildProgress,
    EpicProgress,
    aggregate_epic,
    aggregate_epics,
    apply_epic_transition,
    counted_leaves,
    derived_state,
    derived_status,
    epic_transitions,
    is_epic,
)
from rotaris_core.requirements.model import (
    CanonicalRequirement,
    RequirementHierarchy,
    RequirementLifecycle,
    build_hierarchy,
)

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.unit

EPIC = "SWR-3200"
AT = dt.datetime(2026, 8, 14, 9, 0, tzinfo=dt.UTC)
USER = DeliveryActor.user("dvf")
SYSTEM = DeliveryActor.system("requirement-runner")

BACKLOG = DeliveryState.BACKLOG
READY = DeliveryState.READY
RUNNING = DeliveryState.RUNNING
REVIEW = DeliveryState.REVIEW
NEEDS_UPDATE = DeliveryState.NEEDS_UPDATE
BLOCKED = DeliveryState.BLOCKED
DONE = DeliveryState.DONE


def hierarchy_of(parents: dict[str, str | None]) -> RequirementHierarchy:
    """A hierarchy over ids, each with the parent the mapping gives it."""
    return build_hierarchy(
        CanonicalRequirement(req_id=req_id, parent=parent) for req_id, parent in parents.items()
    )


def status_in(state: DeliveryState, *, reason: str = "") -> DeliveryStatus:
    """A stored status sitting in *state*, with the provenance a moved state carries."""
    if state is BACKLOG:
        return DeliveryStatus()
    return DeliveryStatus(
        state=state,
        blocked_reason=reason or ("the upstream API is down" if state is BLOCKED else ""),
        changed_at=AT,
        changed_by=SYSTEM,
        cause=TransitionCause.RUN_COMPLETED,
    )


def child(
    req_id: str,
    state: DeliveryState,
    *,
    lifecycle: RequirementLifecycle = RequirementLifecycle.APPROVED,
    traced: bool = False,
    verified: bool = False,
    run: str | None = None,
    reason: str = "",
) -> ChildProgress:
    return ChildProgress(
        view=DeliveryView(
            req_id=req_id, lifecycle=lifecycle, delivery=status_in(state, reason=reason)
        ),
        traced=traced,
        verified=verified,
        active_run_id=run,
    )


def flat_epic(states: list[DeliveryState]) -> tuple[RequirementHierarchy, dict[str, ChildProgress]]:
    """An epic with one child per state given, ids ``SWR-3201``…"""
    ids = [f"SWR-{3201 + index}" for index in range(len(states))]
    parents: dict[str, str | None] = {EPIC: None}
    parents.update({req_id: EPIC for req_id in ids})
    progress = {
        req_id: child(req_id, state, traced=state is not BACKLOG, verified=state is DONE)
        for req_id, state in zip(ids, states, strict=True)
    }
    return hierarchy_of(parents), progress


@verifies(SWR.SWR_3212)
def test_a_twelve_child_epic_reports_the_counts_and_percentages_its_children_imply() -> None:
    """The card's numbers, every one of them computed from the twelve rows below it."""
    states = [DONE] * 5 + [REVIEW, RUNNING, BLOCKED, NEEDS_UPDATE, READY, READY, BACKLOG]
    hierarchy, progress = flat_epic(states)

    epic = aggregate_epic(EPIC, hierarchy, progress)

    assert epic.total == 12
    assert epic.counts == {
        DONE: 5,
        REVIEW: 1,
        RUNNING: 1,
        BLOCKED: 1,
        NEEDS_UPDATE: 1,
        READY: 2,
        BACKLOG: 1,
    }
    assert sum(epic.counts.values()) == 12
    assert epic.done == 5
    assert epic.completion == pytest.approx(5 / 12)
    # Eleven of twelve carry an implementation trace; five are verified.
    assert epic.traced == 11
    assert epic.traceability_percent == pytest.approx(91.7)
    assert epic.verification_percent == pytest.approx(41.7)
    assert epic.state is BLOCKED, "a blocked child stops the epic"
    assert "5/12 done" in epic.summary


@verifies(SWR.SWR_3212)
def test_every_state_appears_in_the_counts_even_when_nothing_is_in_it() -> None:
    """A bar must not have to guess which columns exist."""
    hierarchy, progress = flat_epic([DONE, DONE])

    epic = aggregate_epic(EPIC, hierarchy, progress)

    assert set(epic.counts) == set(DeliveryState)
    assert epic.counts[RUNNING] == 0
    assert epic.state is DONE


@verifies(SWR.SWR_3212)
def test_deprecated_children_are_excluded_from_progress_and_stated_separately() -> None:
    """ "3 of 12, and 2 more are retired" is honest; "3 of 14" is not."""
    hierarchy = hierarchy_of({EPIC: None, "SWR-3201": EPIC, "SWR-3202": EPIC, "SWR-3203": EPIC})
    progress = {
        "SWR-3201": child("SWR-3201", DONE, traced=True, verified=True),
        "SWR-3202": child("SWR-3202", BACKLOG, lifecycle=RequirementLifecycle.DEPRECATED),
        "SWR-3203": child("SWR-3203", DONE, traced=True, verified=True),
    }

    epic = aggregate_epic(EPIC, hierarchy, progress)

    assert epic.children == ("SWR-3201", "SWR-3203")
    assert epic.deprecated == ("SWR-3202",)
    assert epic.total == 2
    assert epic.counts[BACKLOG] == 0, "a retired child is not backlog work"
    assert epic.traceability_percent == 100.0
    assert epic.state is DONE, "every non-deprecated child is done"
    assert "1 deprecated" in epic.summary


@verifies(SWR.SWR_3212, SWR.SWR_3108)
def test_nested_epics_aggregate_transitively() -> None:
    """An epic of groups of requirements reports the requirements, at any depth."""
    hierarchy = hierarchy_of(
        {
            EPIC: None,
            "SWR-3210": EPIC,  # a group inside the epic
            "SWR-3211": "SWR-3210",
            "SWR-3212": "SWR-3210",
            "SWR-3220": EPIC,  # a second group
            "SWR-3221": "SWR-3220",
            "SWR-3230": EPIC,  # a plain requirement beside the groups
        },
    )
    progress = {
        "SWR-3211": child("SWR-3211", DONE, traced=True, verified=True),
        "SWR-3212": child("SWR-3212", DONE, traced=True, verified=True),
        "SWR-3221": child("SWR-3221", RUNNING, traced=True, run="run-3"),
        "SWR-3230": child("SWR-3230", DONE, traced=True, verified=True),
    }

    everything = aggregate_epics(hierarchy, progress)

    assert set(everything) == {EPIC, "SWR-3210", "SWR-3220"}
    assert counted_leaves(EPIC, hierarchy) == (
        "SWR-3211",
        "SWR-3212",
        "SWR-3221",
        "SWR-3230",
    )

    inner = everything["SWR-3210"]
    assert inner.total == 2
    assert inner.state is DONE

    outer = everything[EPIC]
    assert outer.total == 4, "the groups themselves are not requirements"
    assert outer.counts[DONE] == 3
    assert outer.counts[RUNNING] == 1
    assert outer.state is RUNNING, "a run below a group is a run below the epic"
    assert outer.child_epics == ("SWR-3210", "SWR-3220")
    assert outer.verification_percent == pytest.approx(75.0)


@pytest.mark.parametrize(
    ("counts", "expected"),
    [
        ({}, BACKLOG),
        ({DONE: 3}, DONE),
        ({DONE: 2, BLOCKED: 1, RUNNING: 1}, BLOCKED),
        ({DONE: 2, RUNNING: 1}, RUNNING),
        ({DONE: 2, NEEDS_UPDATE: 1}, NEEDS_UPDATE),
        ({DONE: 2, REVIEW: 1}, REVIEW),
        ({DONE: 1, BACKLOG: 2}, READY),
        ({READY: 1, BACKLOG: 2}, READY),
        ({BACKLOG: 4}, BACKLOG),
    ],
)
@verifies(SWR.SWR_3212)
def test_the_derived_state_follows_the_precedence_swr_3212_states(
    counts: dict[DeliveryState, int],
    expected: DeliveryState,
) -> None:
    """Done only when every child is; Blocked before Running; and never vacuously Done."""
    assert derived_state(counts) is expected


@verifies(SWR.SWR_3212)
def test_an_epic_with_no_children_left_to_count_is_backlog_not_done() -> None:
    """ "Every child is done" is vacuously true of no children — and would be a lie."""
    hierarchy = hierarchy_of({EPIC: None, "SWR-3201": EPIC})
    progress = {
        "SWR-3201": child("SWR-3201", DONE, lifecycle=RequirementLifecycle.DEPRECATED),
    }

    epic = aggregate_epic(EPIC, hierarchy, progress)

    assert epic.total == 0
    assert epic.deprecated == ("SWR-3201",)
    assert epic.state is BACKLOG
    assert epic.completion == 0.0
    assert epic.traceability == 0.0


@verifies(SWR.SWR_3212)
def test_a_child_rotaris_has_never_recorded_still_counts_as_backlog() -> None:
    """Dropping an unknown child would make every percentage flattering."""
    hierarchy = hierarchy_of({EPIC: None, "SWR-3201": EPIC, "SWR-3202": EPIC})
    progress = {"SWR-3201": child("SWR-3201", DONE, traced=True, verified=True)}

    epic = aggregate_epic(EPIC, hierarchy, progress)

    assert epic.total == 2
    assert epic.counts[BACKLOG] == 1
    assert epic.completion == pytest.approx(0.5)
    assert epic.traceability_percent == pytest.approx(50.0)
    assert epic.state is READY


@verifies(SWR.SWR_3212)
def test_the_active_runs_and_the_blockers_are_named_rather_than_counted() -> None:
    """A card that says "1 blocked" sends the user hunting; this one says which."""
    hierarchy = hierarchy_of({EPIC: None, "SWR-3201": EPIC, "SWR-3202": EPIC, "SWR-3203": EPIC})
    progress = {
        "SWR-3201": child("SWR-3201", RUNNING, traced=True, run="run-11"),
        "SWR-3202": child("SWR-3202", BLOCKED, reason="the upstream API is down"),
        "SWR-3203": child("SWR-3203", DONE, traced=True, verified=True),
    }

    epic = aggregate_epic(EPIC, hierarchy, progress)

    assert [(run.req_id, run.run_id) for run in epic.active_runs] == [("SWR-3201", "run-11")]
    assert [blocker.message for blocker in epic.blockers] == [
        "SWR-3202: the upstream API is down",
    ]
    assert epic.state is BLOCKED


@verifies(SWR.SWR_3212, SWR.SWR_3203)
def test_an_epics_state_cannot_be_set_directly_but_its_children_can() -> None:
    """The refusal lives with the hierarchy, so no board action can route around it."""
    hierarchy = hierarchy_of({EPIC: None, "SWR-3201": EPIC})
    assert is_epic(EPIC, hierarchy)
    assert not is_epic("SWR-3201", hierarchy)

    refused = apply_epic_transition(
        DeliveryRecord.blank(EPIC),
        TransitionRequest(
            req_id=EPIC,
            target=READY,
            actor=USER,
            cause=TransitionCause.USER_ACTION,
            at=AT,
        ),
        hierarchy,
    )

    assert refused.refusal is not None
    assert refused.refusal.kind is RefusalKind.DERIVED_STATE
    assert "follows from its children" in refused.refusal.message
    assert refused.record == DeliveryRecord.blank(EPIC)

    accepted = apply_epic_transition(
        DeliveryRecord.blank("SWR-3201"),
        TransitionRequest(
            req_id="SWR-3201",
            target=READY,
            actor=USER,
            cause=TransitionCause.USER_ACTION,
            at=AT,
        ),
        hierarchy,
    )

    assert accepted.accepted
    assert accepted.record.state is READY


@verifies(SWR.SWR_3212, SWR.SWR_3201)
def test_the_derived_state_is_published_as_a_whole_status_a_card_can_read() -> None:
    """A bare state is not enough: a badge needs a reason, a column needs a time.

    An epic's record is never written, so a consumer reading the *stored* status
    would show Backlog under an epic whose children are running. The aggregation
    therefore publishes a whole
    :class:`~rotaris_core.requirements.delivery.state.DeliveryStatus`, carrying
    the provenance of the child change that produced it.
    """
    later = AT + dt.timedelta(hours=3)
    hierarchy = hierarchy_of({EPIC: None, "SWR-3201": EPIC, "SWR-3202": EPIC})
    running = child("SWR-3201", RUNNING)
    blocked = ChildProgress(
        view=DeliveryView(
            req_id="SWR-3202",
            lifecycle=RequirementLifecycle.APPROVED,
            delivery=DeliveryStatus(
                state=BLOCKED,
                blocked_reason="the upstream API is down",
                blocked_from=RUNNING,
                changed_at=later,
                changed_by=USER,
                cause=TransitionCause.BLOCKER_RAISED,
            ),
        ),
    )

    epic = aggregate_epic(EPIC, hierarchy, {"SWR-3201": running, "SWR-3202": blocked})

    assert epic.state is BLOCKED
    assert epic.status.state is BLOCKED, "one answer, published twice"
    assert epic.status.blocked_reason == "SWR-3202: the upstream API is down"
    assert epic.status.changed_at == later, "the child that moved last is the provenance"
    assert epic.status.changed_by == USER
    assert epic.status.cause is TransitionCause.BLOCKER_RAISED
    # And it is a status the state machine's own invariants accept: a Blocked one
    # states its reason, a moved one names who moved it (SWR-3201).
    assert DeliveryStatus.model_validate(epic.status.model_dump()) == epic.status

    untouched = aggregate_epic(
        EPIC,
        hierarchy,
        {"SWR-3201": child("SWR-3201", BACKLOG), "SWR-3202": child("SWR-3202", BACKLOG)},
    )
    assert untouched.status.pristine, "an epic nothing happened below is Backlog, and unwritten"


@verifies(SWR.SWR_3212)
def test_the_derived_status_cannot_disagree_with_the_derived_state() -> None:
    """The two are one fact; a progress that published both differently would lie."""
    with pytest.raises(ValidationError, match="one answer"):
        EpicProgress(req_id=EPIC, state=RUNNING, status=DeliveryStatus())

    assert derived_status(BACKLOG) == DeliveryStatus()
    assert derived_status(RUNNING, provenance=child("SWR-3201", RUNNING)).state is RUNNING


@verifies(SWR.SWR_3212, SWR.SWR_3203)
def test_the_writer_that_knows_the_hierarchy_refuses_an_epic_without_being_told(
    tmp_path: Path,
) -> None:
    """The refusal has to sit on the seam that *writes*, not only on the pure one.

    ``apply_epic_transition`` is pure and persists nothing, so a caller reaching
    the store through a plain
    :class:`~rotaris_core.requirements.delivery.transitions.DeliveryTransitions`
    would have to remember ``derived=is_epic(...)`` on every call.
    :func:`epic_transitions` binds the hierarchy to the writer instead, and a
    caller that passes ``derived=False`` explicitly still cannot set an epic.
    """
    hierarchy = hierarchy_of({EPIC: None, "SWR-3201": EPIC})
    store = DeliveryStore(tmp_path)
    transitions = epic_transitions(store, hierarchy)

    def request(req_id: str) -> TransitionRequest:
        return TransitionRequest(
            req_id=req_id,
            target=READY,
            actor=USER,
            cause=TransitionCause.USER_ACTION,
            at=AT,
        )

    refused = transitions.apply(request(EPIC), derived=False)
    assert not refused.accepted
    assert refused.refusal is not None
    assert refused.refusal.kind is RefusalKind.DERIVED_STATE
    assert not store.path_for(EPIC).exists(), "a refused transition writes nothing"

    accepted = transitions.apply(request("SWR-3201"))
    assert accepted.accepted
    assert store.read("SWR-3201").state is READY

    # The unbound writer is the one that would have let it through, which is why
    # the hierarchy-bound constructor exists.
    assert DeliveryTransitions(store).apply(request(EPIC)).accepted


@verifies(SWR.SWR_3212, SWR.SWR_3202)
def test_a_childs_progress_joins_its_record_with_the_projects_lifecycle() -> None:
    """Two axes, two owners: the record is Rotaris', the lifecycle is the project's."""
    record = DeliveryRecord(req_id="SWR-3201", delivery=status_in(RUNNING))

    progress = ChildProgress.of_record(
        record,
        lifecycle=RequirementLifecycle.DEPRECATED,
        traced=True,
        active_run_id="run-2",
    )

    assert progress.req_id == "SWR-3201"
    assert progress.state is RUNNING
    assert progress.deprecated
    assert progress.view.badges == ("deprecated", "Running")
    assert not progress.verified
