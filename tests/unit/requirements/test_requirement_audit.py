"""Productive use: months after a requirement was delivered, someone asks who changed it,
which run implemented which version, what that run touched, and which commit carries it.
Expected outcome: the trail answers all nine of SWR-3213's questions from records written
as the events happened; nothing in the store can rewrite or remove one; a corrupt line
costs its own event and not the history; and a forced completion appears as an override
with the actor who forced it."""

from __future__ import annotations

import datetime as dt
import json
from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery import (
    DeliveryActor,
    DeliveryRecord,
    DeliveryState,
    DeliveryStatus,
    SatisfiedDelivery,
    TransitionCause,
    TransitionRequest,
    apply_transition,
)
from rotaris_core.requirements.delivery.audit import (
    AUDIT_SCHEMA_VERSION,
    AuditEvent,
    AuditEventKind,
    AuditNoticeKind,
    AuditStore,
    AuditTrail,
    audit_filename,
    override_event,
    record_overrides,
)
from rotaris_core.requirements.delivery.completion import (
    CompletionCondition,
    CompletionEvidence,
    CompletionOverride,
    CoveringTestEvidence,
    completion_gate,
    evaluate_completion,
)
from rotaris_core.requirements.tombstones import (
    REQUIREMENT_CONTENT_FIELDS,
    Tombstone,
    TombstoneLog,
    TombstoneStore,
)

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.unit

REQ = "SWR-3213"
DAY_ONE = dt.datetime(2026, 8, 10, 9, 0, tzinfo=dt.UTC)
DAY_TWO = dt.datetime(2026, 8, 12, 9, 0, tzinfo=dt.UTC)
DAY_THREE = dt.datetime(2026, 8, 14, 9, 0, tzinfo=dt.UTC)
AUTHOR = DeliveryActor.user("dvf")
RUNNER = DeliveryActor.system("requirement-runner")
VERSION_ONE = "hash-as-first-written"
VERSION_TWO = "hash-after-the-edit"


def full_trail() -> AuditTrail:
    """One requirement's life: written, run, verified, delivered, superseding another."""
    return AuditTrail.of(
        REQ,
        (
            AuditEvent(
                req_id=REQ,
                kind=AuditEventKind.SPECIFICATION_CHANGED,
                at=DAY_ONE,
                actor=AUTHOR,
                requirement_hash=VERSION_ONE,
                reason="drafted from the target picture",
            ),
            AuditEvent(
                req_id=REQ,
                kind=AuditEventKind.RUN_STARTED,
                at=DAY_TWO,
                actor=RUNNER,
                run_id="run-7",
                requirement_hash=VERSION_ONE,
            ),
            AuditEvent(
                req_id=REQ,
                kind=AuditEventKind.RUN_FINISHED,
                at=DAY_TWO,
                actor=RUNNER,
                run_id="run-7",
                changed_files=(
                    "src/rotaris_core/requirements/delivery/audit.py",
                    "tests/unit/requirements/test_requirement_audit.py",
                ),
            ),
            AuditEvent(
                req_id=REQ,
                kind=AuditEventKind.VERIFICATION,
                at=DAY_TWO,
                actor=RUNNER,
                run_id="run-7",
                tests=("tests/unit/requirements/test_requirement_audit.py:120",),
                verified=True,
            ),
            AuditEvent(
                req_id=REQ,
                kind=AuditEventKind.DELIVERY_TRANSITION,
                at=DAY_TWO,
                actor=AUTHOR,
                from_state=DeliveryState.REVIEW,
                to_state=DeliveryState.DONE,
                cause=TransitionCause.COMPLETION_ACCEPTED,
                requirement_hash=VERSION_ONE,
                satisfied_hash=VERSION_ONE,
                run_id="run-7",
                commit="c0ffee1",
                evidence=("8 checks passed", "1 covering test passed"),
            ),
            AuditEvent(
                req_id=REQ,
                kind=AuditEventKind.SUPERSEDED,
                at=DAY_THREE,
                actor=AUTHOR,
                superseded_ids=("SWR-1207", "SWR-1206"),
            ),
            AuditEvent(
                req_id=REQ,
                kind=AuditEventKind.SPECIFICATION_CHANGED,
                at=DAY_THREE,
                actor=DeliveryActor.user("reviewer"),
                requirement_hash=VERSION_TWO,
                reason="the nine questions were sharpened",
            ),
        ),
    )


@verifies(SWR.SWR_3213)
def test_the_trail_answers_each_of_the_nine_audit_questions() -> None:
    """SWR-3213's list, asked one by one against a trail that recorded a real life."""
    trail = full_trail()

    # 1 + 2: who changed the specification, and when.
    change = trail.last_specification_change()
    assert change is not None
    assert change.actor == DeliveryActor.user("reviewer")
    assert change.at == DAY_THREE

    # 3: which requirement version was implemented.
    assert trail.implemented_versions() == (VERSION_ONE,)
    # 4: which run implemented it.
    assert trail.implementing_run(VERSION_ONE) == "run-7"
    # 5: which files that run changed.
    assert trail.files_changed_by("run-7") == (
        "src/rotaris_core/requirements/delivery/audit.py",
        "tests/unit/requirements/test_requirement_audit.py",
    )
    # 6: which tests verify it.
    assert trail.verifying_tests() == ("tests/unit/requirements/test_requirement_audit.py:120",)
    # 7: when it was last successfully verified.
    assert trail.last_verified_at() == DAY_TWO
    # 8: which commit corresponds to the satisfied hash.
    assert trail.commit_for(VERSION_ONE) == "c0ffee1"
    # 9: which requirements it superseded.
    assert trail.superseded() == ("SWR-1206", "SWR-1207")

    # And the version that arrived afterwards was never implemented, which the
    # same queries say without a special case.
    assert trail.implementing_run(VERSION_TWO) is None
    assert trail.commit_for(VERSION_TWO) is None


@verifies(SWR.SWR_3213)
def test_a_failed_verification_does_not_answer_when_it_was_last_verified() -> None:
    """ "Last verified" that counts failures is how a red requirement looks healthy."""
    trail = AuditTrail.of(
        REQ,
        (
            AuditEvent(
                req_id=REQ,
                kind=AuditEventKind.VERIFICATION,
                at=DAY_ONE,
                actor=RUNNER,
                verified=True,
            ),
            AuditEvent(
                req_id=REQ,
                kind=AuditEventKind.VERIFICATION,
                at=DAY_THREE,
                actor=RUNNER,
                verified=False,
                detail="the covering test failed",
            ),
        ),
    )

    assert trail.last_verified_at() == DAY_ONE


@verifies(SWR.SWR_3213, SWR.SWR_3203)
def test_every_accepted_transition_appends_one_record_and_a_refusal_appends_none(
    tmp_path: Path,
) -> None:
    """The bridge from the state machine: one accepted move, one audit entry."""
    store = AuditStore(tmp_path)
    record = DeliveryRecord.blank(REQ)

    moves = [
        (DeliveryState.READY, AUTHOR, TransitionCause.USER_ACTION),
        (DeliveryState.RUNNING, RUNNER, TransitionCause.RUN_STARTED),
        (DeliveryState.REVIEW, RUNNER, TransitionCause.RUN_COMPLETED),
    ]
    for target, actor, cause in moves:
        outcome = apply_transition(
            record,
            TransitionRequest(
                req_id=REQ,
                target=target,
                actor=actor,
                cause=cause,
                at=DAY_TWO,
                requirement_hash=VERSION_ONE,
                run_id="run-7" if actor is RUNNER else None,
            ),
        )
        assert outcome.transition is not None
        store.append(AuditEvent.of_transition(outcome.transition))
        record = outcome.record

    # A user trying to start a run is refused, and nothing is recorded for it.
    refused = apply_transition(
        DeliveryRecord.blank(REQ),
        TransitionRequest(
            req_id=REQ,
            target=DeliveryState.RUNNING,
            actor=AUTHOR,
            cause=TransitionCause.USER_ACTION,
            at=DAY_TWO,
        ),
    )
    assert refused.transition is None

    trail = store.read(REQ)
    assert [event.to_state for event in trail.transitions()] == [
        DeliveryState.READY,
        DeliveryState.RUNNING,
        DeliveryState.REVIEW,
    ]
    assert [event.seq for event in trail.events] == [1, 2, 3]
    assert trail.events[1].actor == RUNNER
    assert trail.events[1].cause is TransitionCause.RUN_STARTED
    assert trail.runs() == ("run-7",)


@verifies(SWR.SWR_3213)
def test_records_already_written_are_byte_identical_after_every_later_write(
    tmp_path: Path,
) -> None:
    """Append-only, asserted on the bytes rather than promised in a docstring."""
    store = AuditStore(tmp_path)
    for event in full_trail().events[:3]:
        store.append(event)

    path = store.path_for(REQ)
    before = path.read_bytes()

    for event in full_trail().events[3:]:
        store.append(event)
    after = path.read_bytes()

    assert after.startswith(before), "an earlier record must survive a later append unchanged"
    assert len(after) > len(before)
    assert store.read(REQ).events[0].kind is AuditEventKind.SPECIFICATION_CHANGED

    # And there is no operation that could have rewritten one.
    forbidden = ("delete", "remove", "purge", "truncate", "rewrite", "update", "replace")
    assert not [
        name
        for name in dir(store)
        if not name.startswith("_") and any(word in name for word in forbidden)
    ]


@verifies(SWR.SWR_3213, SWR.SWR_3113)
def test_the_trail_survives_the_requirements_removal(tmp_path: Path) -> None:
    """A retired id keeps its history: that is the whole point of recording one."""
    store = AuditStore(tmp_path)
    store.extend(full_trail().events)

    TombstoneStore(tmp_path).save(
        TombstoneLog().with_entry(
            Tombstone(
                req_id=REQ,
                source_id="reqtocode",
                last_hash=VERSION_TWO,
                removed_at=DAY_THREE,
            ),
        ),
    )
    assert TombstoneStore(tmp_path).load().get(REQ) is not None

    trail = AuditStore(tmp_path).read(REQ)
    assert len(trail.events) == len(full_trail().events)
    assert trail.implementing_run(VERSION_ONE) == "run-7"
    assert AuditStore(tmp_path).req_ids() == (REQ,)


@verifies(SWR.SWR_3213)
def test_one_corrupt_line_costs_its_own_event_and_not_the_trail(tmp_path: Path) -> None:
    """A broken byte must not take a requirement's history with it."""
    store = AuditStore(tmp_path)
    store.append(full_trail().events[0])
    path = store.path_for(REQ)
    with path.open("a", encoding="utf-8", newline="\n") as handle:
        handle.write("{not json at all\n")
        handle.write(
            json.dumps({"req_id": REQ, "kind": "invented-kind", "at": "2026-08-14"}) + "\n"
        )
        handle.write(
            json.dumps({"schema_version": AUDIT_SCHEMA_VERSION + 1, "req_id": REQ, "kind": "x"})
            + "\n",
        )
        handle.write(json.dumps({"req_id": "SWR-9999", "kind": "run-started"}) + "\n")
    store.append(full_trail().events[1])

    read = store.load(REQ)

    assert read.degraded
    assert [event.kind for event in read.trail.events] == [
        AuditEventKind.SPECIFICATION_CHANGED,
        AuditEventKind.RUN_STARTED,
    ]
    assert [notice.kind for notice in read.notices] == [
        AuditNoticeKind.UNREADABLE,
        AuditNoticeKind.UNKNOWN_FIELD,
        AuditNoticeKind.FUTURE_SCHEMA,
        AuditNoticeKind.ID_MISMATCH,
    ]
    assert [notice.line for notice in read.notices] == [2, 3, 4, 5]
    assert "invented-kind" in read.notices[1].detail


@verifies(SWR.SWR_3213)
def test_a_record_survives_a_round_trip_through_the_file(tmp_path: Path) -> None:
    """Everything the queries need has to come back off disk, not only out of memory."""
    store = AuditStore(tmp_path)
    original = full_trail().events[4]
    store.append(original)

    loaded = store.read(REQ).events[0]

    assert loaded.model_dump() == original.model_copy(update={"seq": 1}).model_dump()


@verifies(SWR.SWR_3213, SWR.SWR_3114)
def test_the_trail_never_persists_requirement_text(tmp_path: Path) -> None:
    """Rotaris' own data only: the requirement's words stay in the project's store."""
    store = AuditStore(tmp_path)
    store.extend(full_trail().events)

    payload_keys = {
        key
        for line in store.path_for(REQ).read_text(encoding="utf-8").splitlines()
        for key in json.loads(line)
    }

    assert payload_keys & REQUIREMENT_CONTENT_FIELDS == set()
    assert "req_id" in payload_keys


@verifies(SWR.SWR_3213)
def test_a_trail_file_is_named_after_the_requirement_beside_its_delivery_record() -> None:
    """A human reading ``.rotaris/requirements/`` must be able to find a history."""
    assert audit_filename("SWR-3213") == "SWR-3213.jsonl"
    assert audit_filename("PROJ/7").endswith(".jsonl")
    assert audit_filename("PROJ/7") != audit_filename("PROJ-7")


@verifies(SWR.SWR_3213, SWR.SWR_3215)
def test_a_forced_completion_reaches_the_trail_as_an_override(tmp_path: Path) -> None:
    """The override sink is what makes SWR-3215's last acceptance criterion true."""
    store = AuditStore(tmp_path)
    override = CompletionOverride(
        actor=AUTHOR,
        reason="the covering test needs hardware that arrives on Monday",
        at=DAY_THREE,
        conditions=(CompletionCondition.COVERING_TESTS,),
    )
    gate = completion_gate(
        lambda _record, _request: CompletionEvidence(
            req_id=REQ,
            current_hash=VERSION_ONE,
            gate_passed=True,
            implementation_traces=("src/rotaris_core/requirements/delivery/audit.py:1",),
        ),
        override_for=lambda _record, _request: override,
        on_report=record_overrides(store),
    )
    review = DeliveryRecord(
        req_id=REQ,
        delivery=DeliveryStatus(
            state=DeliveryState.REVIEW,
            changed_at=DAY_TWO,
            changed_by=RUNNER,
            cause=TransitionCause.RUN_COMPLETED,
        ),
    )

    outcome = apply_transition(
        review,
        TransitionRequest(
            req_id=REQ,
            target=DeliveryState.DONE,
            actor=AUTHOR,
            cause=TransitionCause.COMPLETION_ACCEPTED,
            at=DAY_THREE,
            requirement_hash=VERSION_ONE,
            delivery=SatisfiedDelivery(
                req_id=REQ,
                satisfied_hash=VERSION_ONE,
                run_id="run-7",
                satisfied_at=DAY_THREE,
            ),
        ),
        completion=gate,
    )
    assert outcome.accepted

    overrides = store.read(REQ).overrides()
    assert len(overrides) == 1
    recorded = overrides[0]
    assert recorded.actor == AUTHOR
    assert "hardware" in recorded.reason
    assert recorded.to_state is DeliveryState.DONE
    assert any("no test declares" in line for line in recorded.evidence)


@verifies(SWR.SWR_3213, SWR.SWR_3215)
def test_a_completion_that_was_earned_leaves_no_override_record(tmp_path: Path) -> None:
    """An override record must mean something; recording the ordinary case would not."""
    store = AuditStore(tmp_path)
    gate = completion_gate(
        lambda _record, _request: CompletionEvidence(
            req_id=REQ,
            current_hash=VERSION_ONE,
            satisfied_hash=VERSION_ONE,
            implementation_traces=("src/rotaris_core/requirements/delivery/audit.py:1",),
            covering_tests=(
                CoveringTestEvidence(path="tests/unit/x.py", executed=True, passed=True),
            ),
            gate_passed=True,
        ),
        obligations_for=lambda _req_id: None,
        on_report=record_overrides(store),
    )

    unmet = gate(
        DeliveryRecord.blank(REQ),
        TransitionRequest(
            req_id=REQ,
            target=DeliveryState.DONE,
            actor=AUTHOR,
            cause=TransitionCause.COMPLETION_ACCEPTED,
            at=DAY_THREE,
        ),
    )

    assert unmet == (), "the conditions were earned, not forgiven"
    assert store.read(REQ).empty
    assert not store.path_for(REQ).exists()


@verifies(SWR.SWR_3213)
def test_an_unforced_report_implies_no_audit_record() -> None:
    """The pure half of the same rule, without a store in the way."""
    report = evaluate_completion(CompletionEvidence(req_id=REQ, current_hash=VERSION_ONE))

    assert not report.complete
    assert override_event(report) is None
