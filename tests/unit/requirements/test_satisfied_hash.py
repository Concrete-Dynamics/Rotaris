"""Productive use: an agent implements a requirement, the author edits that requirement
while the run is still in flight, and the run's result is accepted an hour later. The
board must not claim the newest text was implemented by a run that never saw it.
Expected outcome: Done records the hash the run *started* against (the snapshot,
SWR-3402), earlier deliveries stay in the log so history can name which run delivered
which version, and "never delivered" stays distinguishable from "delivered, then the
specification moved"."""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from typing import TYPE_CHECKING

import pytest
from pydantic import ValidationError

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery import (
    DeliveryActor,
    DeliveryRecord,
    DeliverySnapshot,
    DeliveryState,
    DeliveryStatus,
    DeliveryStore,
    DeliveryTransitions,
    RefusalKind,
    SatisfactionState,
    SatisfiedDelivery,
    SatisfiedLog,
    TransitionCause,
    TransitionRequest,
)
from rotaris_core.requirements.delivery.completion import (
    CompletionCondition,
    CompletionEvidence,
    CompletionOverride,
    CoveringTestEvidence,
    completion_gate,
)
from rotaris_core.requirements.model import CanonicalRequirement

if TYPE_CHECKING:
    from pathlib import Path

    from rotaris_core.requirements.delivery import CompletionGate

pytestmark = pytest.mark.unit

REQ = "SWR-3204"
RUN_STARTED = dt.datetime(2026, 8, 14, 9, 0, tzinfo=dt.UTC)
ACCEPTED = dt.datetime(2026, 8, 14, 17, 0, tzinfo=dt.UTC)
SYSTEM = DeliveryActor.system("requirement-runner")
USER = DeliveryActor.user("dvf")


@dataclass(frozen=True)
class RunSnapshot:
    """What SWR-3402 captures at run start; only the delivery-relevant fields."""

    req_id: str
    requirement_hash: str
    source_revision: str | None = None
    base_commit: str | None = None
    unit_id: str | None = None
    session_id: str | None = None


def in_review(req_id: str = REQ) -> DeliveryRecord:
    """A requirement whose run finished and is waiting to be accepted."""
    return DeliveryRecord(
        req_id=req_id,
        delivery=DeliveryStatus(
            state=DeliveryState.REVIEW,
            changed_at=RUN_STARTED,
            changed_by=SYSTEM,
            cause=TransitionCause.RUN_COMPLETED,
        ),
    )


def completion_for(
    requirement: CanonicalRequirement,
    *,
    override: CompletionOverride | None = None,
) -> CompletionGate:
    """SWR-3215's real check, over a run that did everything except stay current.

    Traces exist, the covering test ran and passed, the verification gate passed
    and the single unit finished — so the only condition that can be unmet is
    ``satisfied-hash-current``, which is exactly the one §16's scenario breaks.
    """

    def read(_record: DeliveryRecord, _request: TransitionRequest) -> CompletionEvidence:
        return CompletionEvidence(
            req_id=requirement.req_id,
            current_hash=requirement.current_hash,
            implementation_traces=("src/rotaris_core/requirements/delivery/satisfied.py:1",),
            covering_tests=(
                CoveringTestEvidence(
                    path="tests/unit/requirements/test_satisfied_hash.py",
                    line=1,
                    executed=True,
                    passed=True,
                ),
            ),
            gate_passed=True,
            integration_complete=True,
        )

    return completion_gate(read, override_for=lambda _record, _request: override)


@verifies(SWR.SWR_3204, SWR.SWR_3215)
def test_done_records_the_snapshot_hash_not_the_hash_at_the_moment_of_acceptance(
    tmp_path: Path,
) -> None:
    """The case of §16: the requirement moved while the run was working on it.

    Two things have to hold at once. SWR-3215 refuses the acceptance, naming the
    version that drifted — a run that never saw the current text has not delivered
    it. And when a named actor overrides that condition anyway, SWR-3204 still
    records the hash the run *started* against, never the one at the moment of
    acceptance: an override forgives a condition, it does not rewrite what was
    delivered.
    """
    at_run_start = CanonicalRequirement(
        req_id=REQ,
        title="Satisfied hash",
        description="Record the version that was delivered.",
    )
    snapshot = RunSnapshot(
        req_id=REQ,
        requirement_hash=at_run_start.current_hash,
        source_revision="rev-1",
        unit_id="unit-1",
        session_id="session-1",
    )
    assert isinstance(snapshot, DeliverySnapshot)

    # ... and while the agent worked, the author sharpened the wording.
    at_acceptance = at_run_start.evolve(description="Record the version that was delivered, twice.")
    assert at_acceptance.current_hash != at_run_start.current_hash

    request = TransitionRequest(
        req_id=REQ,
        target=DeliveryState.DONE,
        actor=USER,
        cause=TransitionCause.COMPLETION_ACCEPTED,
        at=ACCEPTED,
        requirement_hash=at_acceptance.current_hash,
        delivery=SatisfiedDelivery.from_snapshot(
            snapshot,
            run_id="run-1",
            at=ACCEPTED,
            verified_commit="c0ffee",
        ),
    )

    store = DeliveryStore(tmp_path)
    store.seed(in_review())
    refused = DeliveryTransitions(store, completion=completion_for(at_acceptance)).apply(request)

    assert not refused.accepted, "the delivered version is not the current specification"
    assert refused.refusal is not None
    assert refused.refusal.kind is RefusalKind.COMPLETION_CONDITIONS_UNMET
    assert [condition.name for condition in refused.refusal.unmet] == ["satisfied-hash-current"]
    assert at_run_start.current_hash in refused.refusal.message
    assert store.read(REQ).state is DeliveryState.REVIEW

    accepted = DeliveryTransitions(
        store,
        completion=completion_for(
            at_acceptance,
            override=CompletionOverride(
                actor=USER,
                reason="the edit was a wording fix; the implementation stands",
                at=ACCEPTED,
                conditions=(CompletionCondition.SATISFIED_HASH_CURRENT,),
            ),
        ),
    ).apply(request)

    assert accepted.accepted
    stored = store.read(REQ)
    assert stored.satisfied_hash == at_run_start.current_hash
    assert stored.satisfied_hash != at_acceptance.current_hash
    # Which is exactly what makes the edit visible as work (SWR-3502):
    assert stored.satisfied.state_for(at_acceptance.current_hash) is SatisfactionState.STALE
    assert stored.satisfied.state_for(at_run_start.current_hash) is SatisfactionState.SATISFIED


@verifies(SWR.SWR_3204)
def test_from_snapshot_carries_the_run_that_delivered_it_and_the_verified_commit() -> None:
    """ "Which version, by which run, at which commit, when" — all four or none."""
    snapshot = RunSnapshot(
        req_id=REQ,
        requirement_hash="hash-1",
        source_revision="rev-9",
        base_commit="base",
        unit_id="unit-2",
        session_id="session-2",
    )
    entry = SatisfiedDelivery.from_snapshot(
        snapshot,
        run_id="run-42",
        at=ACCEPTED,
        verified_commit="deadbeef",
    )

    assert entry.req_id == REQ
    assert entry.satisfied_hash == "hash-1"
    assert entry.run_id == "run-42"
    assert entry.verified_commit == "deadbeef"
    assert entry.source_revision == "rev-9"
    assert (entry.unit_id, entry.session_id) == ("unit-2", "session-2")
    assert "run-42" in entry.summary


@verifies(SWR.SWR_3204)
def test_a_delivery_that_cannot_name_its_version_or_its_run_is_refused() -> None:
    """An entry without a hash would make Done reachable without one."""
    for satisfied_hash, run_id in (("", "run-1"), ("hash-1", "  ")):
        with pytest.raises(ValidationError, match="names both the version"):
            SatisfiedDelivery(
                satisfied_hash=satisfied_hash,
                run_id=run_id,
                satisfied_at=ACCEPTED,
            )
    with pytest.raises(ValidationError, match="aware"):
        SatisfiedDelivery(
            satisfied_hash="hash-1",
            run_id="run-1",
            satisfied_at=dt.datetime(2026, 8, 14, 17, 0),  # noqa: DTZ001 - the point of the test
        )


@verifies(SWR.SWR_3204)
def test_previous_satisfied_hashes_are_retained_rather_than_overwritten() -> None:
    """Three deliveries, three records: history can name which run delivered which."""
    log = SatisfiedLog()
    for index, version in enumerate(("hash-1", "hash-2", "hash-3"), start=1):
        log = log.appended(
            SatisfiedDelivery(
                req_id=REQ,
                satisfied_hash=version,
                run_id=f"run-{index}",
                satisfied_at=ACCEPTED + dt.timedelta(days=index),
            ),
        )

    assert log.hashes == ("hash-1", "hash-2", "hash-3")
    assert log.satisfied_hash == "hash-3"
    current = log.current
    assert current is not None
    assert current.run_id == "run-3"
    # The SWR-3214 query: given a version, which run delivered it.
    delivering = log.delivering("hash-2")
    assert delivering is not None
    assert delivering.run_id == "run-2"
    assert log.delivering("never-delivered-hash") is None


@verifies(SWR.SWR_3204)
def test_never_delivered_is_distinguishable_from_a_hash_that_no_longer_matches() -> None:
    """A brand-new requirement must not read as a regression."""
    fresh = SatisfiedLog()
    assert fresh.satisfied_hash is None
    assert not fresh.delivered
    assert fresh.state_for("hash-1") is SatisfactionState.NEVER_DELIVERED
    assert not fresh.matches("hash-1")

    delivered = fresh.appended(
        SatisfiedDelivery(
            req_id=REQ,
            satisfied_hash="hash-1",
            run_id="run-1",
            satisfied_at=ACCEPTED,
        ),
    )
    assert delivered.satisfied_hash == "hash-1"
    assert delivered.state_for("hash-1") is SatisfactionState.SATISFIED
    assert delivered.state_for("hash-2") is SatisfactionState.STALE
    assert fresh.state_for("hash-2") is not delivered.state_for("hash-2")


@verifies(SWR.SWR_3204)
def test_the_history_limit_prunes_the_oldest_delivery_and_never_the_current_one() -> None:
    """A capped history stays a history: the version that stands is always in it."""
    log = SatisfiedLog()
    for index in range(1, 6):
        log = log.appended(
            SatisfiedDelivery(
                req_id=REQ,
                satisfied_hash=f"hash-{index}",
                run_id=f"run-{index}",
                satisfied_at=ACCEPTED + dt.timedelta(days=index),
            ),
            limit=3,
        )

    assert log.hashes == ("hash-3", "hash-4", "hash-5")
    assert log.satisfied_hash == "hash-5"


@verifies(SWR.SWR_3204, SWR.SWR_3203)
def test_reaching_done_without_a_recorded_hash_is_impossible(tmp_path: Path) -> None:
    """The board's credibility: no version recorded, no Done — for either actor."""
    store = DeliveryStore(tmp_path)
    store.seed(in_review())
    transitions = DeliveryTransitions(store)

    for actor in (USER, SYSTEM):
        outcome = transitions.apply(
            TransitionRequest(
                req_id=REQ,
                target=DeliveryState.DONE,
                actor=actor,
                cause=TransitionCause.COMPLETION_ACCEPTED,
                at=ACCEPTED,
                requirement_hash="hash-now",
            ),
        )
        assert not outcome.accepted
        assert outcome.refusal is not None
        assert outcome.refusal.kind is RefusalKind.SATISFIED_HASH_MISSING

    assert store.read(REQ).state is DeliveryState.REVIEW
    assert store.read(REQ).satisfied_hash is None


@verifies(SWR.SWR_3204, SWR.SWR_3205)
def test_a_delivery_survives_the_store_round_trip_with_its_whole_history(
    tmp_path: Path,
) -> None:
    """Restarting Rotaris must not lose which version was delivered by which run."""
    store = DeliveryStore(tmp_path)
    log = SatisfiedLog()
    for index in (1, 2):
        log = log.appended(
            SatisfiedDelivery(
                req_id=REQ,
                satisfied_hash=f"hash-{index}",
                run_id=f"run-{index}",
                satisfied_at=ACCEPTED + dt.timedelta(days=index),
                verified_commit=f"commit-{index}",
                source_revision=f"rev-{index}",
                unit_id=f"unit-{index}",
                session_id=f"session-{index}",
            ),
        )
    store.seed(DeliveryRecord(req_id=REQ, satisfied=log))

    reloaded = DeliveryStore(tmp_path).read(REQ)
    assert reloaded.satisfied == log
    assert reloaded.satisfied_hash == "hash-2"
    delivering = reloaded.satisfied.delivering("hash-1")
    assert delivering is not None
    assert delivering.verified_commit == "commit-1"
