"""Productive use: a user edits a requirement while an agent is implementing it. The run
finishes successfully — against the old text — and the user is shown the conflict instead
of a green Done.
Expected outcome: a completed run always lands in Review, never in Done; when the snapshot
hash and the current hash differ, the review carries both and the stated reason
"specification changed during execution", the audit record names both hashes, and the
later Review → Done attempt is refused no matter what completion gate the workspace
supplies. A run whose requirement did not change is untouched by the rule."""

from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery.satisfied import SatisfiedDelivery
from rotaris_core.requirements.delivery.state import (
    DeliveryActor,
    DeliveryState,
    DeliveryStatus,
    TransitionCause,
)
from rotaris_core.requirements.delivery.store import DeliveryRecord, DeliveryStore
from rotaris_core.requirements.delivery.transitions import (
    DeliveryTransitions,
    RefusalKind,
    TransitionRequest,
    UnmetCondition,
    apply_transition,
)
from rotaris_core.requirements.execution.snapshot import (
    SPECIFICATION_CHANGED_CONDITION,
    SPECIFICATION_CHANGED_REASON,
    SnapshotStore,
    capture_snapshot,
    completion_transition,
    detect_drift,
    review_for,
    specification_guard,
)
from rotaris_core.requirements.model import CanonicalRequirement

if TYPE_CHECKING:
    from collections.abc import Sequence
    from pathlib import Path

    from rotaris_core.requirements.execution.snapshot import RunSnapshot

REQ = "SWR-3403"
START = dt.datetime(2026, 8, 14, 9, 0, tzinfo=dt.UTC)
FINISH = dt.datetime(2026, 8, 14, 11, 0, tzinfo=dt.UTC)
ACCEPT = dt.datetime(2026, 8, 14, 12, 0, tzinfo=dt.UTC)

RUNNER = DeliveryActor.system("requirement-runner")
USER = DeliveryActor.user("dvf")

TITLE = "Import a CSV with a preview"
ORIGINAL = "The user picks a file, sees the parsed rows, and confirms before writing."
EDITED = (
    "The user picks a file, sees the parsed rows, and confirms before writing. "
    "Rows that fail validation are listed separately and never imported."
)


def requirement(description: str = ORIGINAL) -> CanonicalRequirement:
    return CanonicalRequirement(
        req_id=REQ,
        title=TITLE,
        description=description,
        source_id="specs",
        source_path="specs/import.md",
        source_revision="r7",
    )


def snapshot_of(subject: CanonicalRequirement) -> RunSnapshot:
    return capture_snapshot(
        subject,
        run_id="run-1",
        base_commit="c0ffee1",
        at=START,
        unit_id="swr-3403-impl",
        session_id="20260814-abcdef",
    )


def running_record(req_id: str = REQ) -> DeliveryRecord:
    """A requirement whose run is in flight."""
    return DeliveryRecord(
        req_id=req_id,
        delivery=DeliveryStatus(
            state=DeliveryState.RUNNING,
            changed_at=START,
            changed_by=RUNNER,
            cause=TransitionCause.RUN_STARTED,
        ),
    )


def permissive(
    _record: DeliveryRecord,
    _request: TransitionRequest,
) -> Sequence[UnmetCondition]:
    """A completion gate that would grant Done — the hostile case for SWR-3403."""
    return ()


def done_request(snapshot: RunSnapshot, *, current_hash: str) -> TransitionRequest:
    """What accepting a review looks like: Done, recording the run's version."""
    return TransitionRequest(
        req_id=REQ,
        target=DeliveryState.DONE,
        actor=USER,
        cause=TransitionCause.COMPLETION_ACCEPTED,
        at=ACCEPT,
        requirement_hash=current_hash,
        delivery=SatisfiedDelivery.from_snapshot(
            snapshot,
            run_id=snapshot.run_id,
            at=ACCEPT,
            verified_commit="deadbee",
        ),
    )


def reviewed(record: DeliveryRecord) -> DeliveryRecord:
    """The same requirement, one accepted Running → Review later."""
    return record.evolve(
        delivery=record.delivery.moved_to(
            DeliveryState.REVIEW,
            actor=RUNNER,
            at=FINISH,
            cause=TransitionCause.RUN_COMPLETED,
        ),
    )


# -- detection -------------------------------------------------------------


@pytest.mark.unit
@verifies(SWR.SWR_3403)
def test_a_specification_edited_mid_run_is_detected_on_both_hashes() -> None:
    """The comparison is the hash; the diff is for the human beside it."""
    original = requirement()
    snapshot = snapshot_of(original)
    drift = detect_drift(snapshot, requirement(EDITED))

    assert drift.changed
    assert drift.snapshot_hash == original.current_hash
    assert drift.current_hash == requirement(EDITED).current_hash
    assert drift.reason == SPECIFICATION_CHANGED_REASON
    assert drift.snapshot_hash in drift.detail
    assert drift.current_hash in drift.detail
    assert "listed separately" in drift.diff
    assert drift.diff.startswith("---")


@pytest.mark.unit
@verifies(SWR.SWR_3403)
def test_a_run_whose_requirement_did_not_change_reports_no_drift() -> None:
    """The rule does not fire on a requirement nobody touched."""
    original = requirement()
    drift = detect_drift(snapshot_of(original), original)

    assert not drift.changed
    assert drift.reason == ""
    assert drift.diff == ""
    assert "unchanged" in drift.message


@pytest.mark.unit
@verifies(SWR.SWR_3403)
def test_a_snapshot_is_never_compared_against_another_requirement() -> None:
    """A mismatch here would silently compare two unrelated texts."""
    with pytest.raises(ValueError, match="compared against"):
        detect_drift(snapshot_of(requirement()), requirement().model_copy(update={"req_id": "X-1"}))


# -- the completion transition ---------------------------------------------


@pytest.mark.unit
@verifies(SWR.SWR_3403)
def test_a_completed_run_asks_for_review_and_never_for_done() -> None:
    """Both cases: drifted and clean. Done is a separate decision either way."""
    original = requirement()
    drifted = detect_drift(snapshot_of(original), requirement(EDITED))
    clean = detect_drift(snapshot_of(original), original)

    for drift in (drifted, clean):
        request = completion_transition(drift, actor=RUNNER, at=FINISH)
        assert request.target is DeliveryState.REVIEW
        assert request.delivery is None

    assert completion_transition(drifted, actor=RUNNER, at=FINISH).cause is (
        TransitionCause.SPECIFICATION_CHANGED
    )
    assert completion_transition(clean, actor=RUNNER, at=FINISH).cause is (
        TransitionCause.RUN_COMPLETED
    )


@pytest.mark.unit
@verifies(SWR.SWR_3403)
def test_the_audit_record_of_the_completion_names_both_hashes() -> None:
    """Months later the trail still says which version was implemented."""
    original = requirement()
    snapshot = snapshot_of(original)
    current = requirement(EDITED)
    drift = detect_drift(snapshot, current)

    outcome = apply_transition(
        running_record(),
        completion_transition(drift, actor=RUNNER, at=FINISH),
    )

    assert outcome.accepted
    record = outcome.transition
    assert record is not None
    assert record.target is DeliveryState.REVIEW
    assert record.cause is TransitionCause.SPECIFICATION_CHANGED
    assert record.requirement_hash == current.current_hash
    assert snapshot.requirement_hash in record.detail
    assert current.current_hash in record.detail
    assert SPECIFICATION_CHANGED_REASON in record.detail
    assert record.run_id == "run-1"


# -- Done is unreachable while the drift stands (the core proof) -----------


@pytest.mark.unit
@verifies(SWR.SWR_3403)
def test_done_is_refused_for_a_drifted_run_whatever_the_gate_says() -> None:
    """A permissive completion gate cannot vote the mismatch away."""
    original = requirement()
    snapshot = snapshot_of(original)
    current = requirement(EDITED)
    record = reviewed(running_record())

    outcome = apply_transition(
        record,
        done_request(snapshot, current_hash=current.current_hash),
        completion=specification_guard(
            permissive,
            current_hash_for=lambda _req_id: current.current_hash,
        ),
    )

    assert not outcome.accepted
    refusal = outcome.refusal
    assert refusal is not None
    assert refusal.kind is RefusalKind.COMPLETION_CONDITIONS_UNMET
    assert [condition.name for condition in refusal.unmet] == [SPECIFICATION_CHANGED_CONDITION]
    assert snapshot.requirement_hash in refusal.unmet[0].detail
    assert current.current_hash in refusal.unmet[0].detail
    assert SPECIFICATION_CHANGED_REASON in refusal.message
    # And nothing moved: the record is the one that was passed in.
    assert outcome.record is record
    assert outcome.record.state is DeliveryState.REVIEW
    assert outcome.record.satisfied_hash is None


@pytest.mark.unit
@verifies(SWR.SWR_3403)
def test_the_guard_keeps_the_workspaces_own_conditions_as_well() -> None:
    """Wrapping, not replacing: the inner gate's findings still arrive."""
    original = requirement()
    snapshot = snapshot_of(original)
    current = requirement(EDITED)

    def strict(
        _record: DeliveryRecord,
        _request: TransitionRequest,
    ) -> Sequence[UnmetCondition]:
        return (UnmetCondition(name="covering-test-passed", detail="it failed"),)

    outcome = apply_transition(
        reviewed(running_record()),
        done_request(snapshot, current_hash=current.current_hash),
        completion=specification_guard(
            strict,
            current_hash_for=lambda _req_id: current.current_hash,
        ),
    )

    assert not outcome.accepted
    assert outcome.refusal is not None
    assert [condition.name for condition in outcome.refusal.unmet] == [
        "covering-test-passed",
        SPECIFICATION_CHANGED_CONDITION,
    ]


@pytest.mark.unit
@verifies(SWR.SWR_3403)
def test_a_run_whose_requirement_did_not_change_still_reaches_done() -> None:
    """The rule is precise: an unchanged requirement is unaffected by it."""
    original = requirement()
    snapshot = snapshot_of(original)

    outcome = apply_transition(
        reviewed(running_record()),
        done_request(snapshot, current_hash=original.current_hash),
        completion=specification_guard(
            permissive,
            current_hash_for=lambda _req_id: original.current_hash,
        ),
    )

    assert outcome.accepted
    assert outcome.record.state is DeliveryState.DONE
    assert outcome.record.satisfied_hash == original.current_hash


@pytest.mark.unit
@verifies(SWR.SWR_3403)
def test_the_guard_asks_for_the_current_hash_at_the_moment_of_the_transition() -> None:
    """Not a value captured when the review was rendered — the edit may be newer."""
    original = requirement()
    snapshot = snapshot_of(original)
    asked: list[str] = []
    hashes = iter((original.current_hash, requirement(EDITED).current_hash))

    def current_hash_for(req_id: str) -> str:
        asked.append(req_id)
        return next(hashes)

    gate = specification_guard(permissive, current_hash_for=current_hash_for)
    record = reviewed(running_record())

    first = apply_transition(record, done_request(snapshot, current_hash="x"), completion=gate)
    assert first.accepted
    assert asked == [REQ]

    second = apply_transition(record, done_request(snapshot, current_hash="x"), completion=gate)
    assert not second.accepted
    assert asked == [REQ, REQ]


@pytest.mark.unit
@verifies(SWR.SWR_3403)
def test_a_reloaded_snapshot_still_blocks_done_though_its_diff_is_gone(
    tmp_path: Path,
) -> None:
    """After a crash the hash survives; the prose does not, and that is enough."""
    store = SnapshotStore(tmp_path)
    store.save(snapshot_of(requirement()))
    reloaded = store.load("run-1")
    assert reloaded is not None

    drift = detect_drift(reloaded, requirement(EDITED))
    assert drift.changed
    assert drift.diff == ""
    assert drift.reason == SPECIFICATION_CHANGED_REASON


# -- what the user is shown ------------------------------------------------


@pytest.mark.unit
@verifies(SWR.SWR_3403)
def test_the_review_carries_both_hashes_and_the_stated_reason() -> None:
    """The board's review surface (SWR-3216, SWR-3603) reads exactly this."""
    original = requirement()
    snapshot = snapshot_of(original)
    current = requirement(EDITED)
    drift = detect_drift(snapshot, current)

    view = review_for(drift, branch="rotaris/req/swr-3403/impl", worktree_path="/tmp/wt")

    assert view.req_id == REQ
    assert view.run_id == "run-1"
    assert view.snapshot_hash == original.current_hash
    assert view.current_hash == current.current_hash
    assert view.specification_changed
    assert view.reason == SPECIFICATION_CHANGED_REASON
    assert SPECIFICATION_CHANGED_REASON in view.summary
    assert view.branch == "rotaris/req/swr-3403/impl"
    # The diff travels with the drift record beside it.
    assert "listed separately" in drift.diff


# -- the whole flow, through the real store --------------------------------


@pytest.mark.integration
@verifies(SWR.SWR_3403)
def test_a_user_who_edits_a_requirement_mid_run_is_shown_the_conflict_not_a_green_done(
    tmp_path: Path,
) -> None:
    """The productive flow, end to end, against a real delivery store on disk.

    Ready → Running → (the author edits) → run completes → Review with both
    hashes → accepting it is refused, and the requirement stays in Review with
    nothing recorded as delivered.
    """
    store = DeliveryStore(tmp_path)
    transitions = DeliveryTransitions(store)
    snapshots = SnapshotStore(tmp_path)

    def move(
        target: DeliveryState,
        *,
        actor: DeliveryActor,
        cause: TransitionCause,
        at: dt.datetime,
    ) -> None:
        outcome = transitions.apply(
            TransitionRequest(req_id=REQ, target=target, actor=actor, cause=cause, at=at),
        )
        assert outcome.accepted, outcome.message

    move(DeliveryState.READY, actor=USER, cause=TransitionCause.USER_ACTION, at=START)
    move(
        DeliveryState.RUNNING,
        actor=RUNNER,
        cause=TransitionCause.RUN_STARTED,
        at=START,
    )

    # The run captures the specification it was given, and persists it.
    original = requirement()
    snapshot = snapshot_of(original)
    snapshots.save(snapshot)

    # …and while it runs, the author rewrites the acceptance condition.
    current = requirement(EDITED)
    assert current.current_hash != original.current_hash

    drift = detect_drift(snapshot, current)
    completion = transitions.apply(completion_transition(drift, actor=RUNNER, at=FINISH))
    assert completion.accepted
    assert store.read(REQ).state is DeliveryState.REVIEW

    review = review_for(drift)
    assert review.specification_changed
    assert review.snapshot_hash == original.current_hash
    assert review.current_hash == current.current_hash

    refused = transitions.apply(
        done_request(snapshot, current_hash=current.current_hash),
        completion=specification_guard(
            permissive,
            current_hash_for=lambda _req_id: current.current_hash,
        ),
    )

    assert not refused.accepted
    assert refused.refusal is not None
    assert SPECIFICATION_CHANGED_REASON in refused.refusal.message

    stored = store.read(REQ)
    assert stored.state is DeliveryState.REVIEW
    assert stored.satisfied_hash is None
