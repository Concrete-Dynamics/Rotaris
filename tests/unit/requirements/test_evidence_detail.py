"""Productive use: a user sees "test evidence failed" on a card and wants to go there —
open the failing test at its line, open the run that produced the verdict, see which
commit and which specification version it was produced against.
Expected outcome: every record carries an address a consumer can act on; a verification
that cannot name its verdict, commit, hash and run is refused rather than displayed; a
missing obligation carries an empty record set and a stated reason instead of an invented
one; and the whole projection survives a persisted round-trip unchanged."""

from __future__ import annotations

import datetime as dt
import json

import pytest
from pydantic import ValidationError

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery.evidence import (
    EvidenceInputs,
    EvidenceProjection,
    EvidenceReason,
    EvidenceState,
    ExecutionRecord,
    IntegrationRecord,
    ObligationEvidence,
    VerificationRecord,
    project_evidence,
    site_address,
)
from rotaris_core.requirements.delivery.obligations import (
    EvidenceKind,
    ObligationLevel,
    resolve_obligations,
)
from rotaris_core.requirements.delivery.staleness import StalenessFinding, StalenessReason
from rotaris_core.requirements.delivery.store import DeliveryRecord
from rotaris_core.requirements.model import CanonicalRequirement
from rotaris_core.verifier.requirement_evidence import CoveringTest, RequirementSite

pytestmark = pytest.mark.unit

AT = dt.datetime(2026, 8, 14, 10, 0, tzinfo=dt.UTC)
REQ = CanonicalRequirement(req_id="SWR-3208", title="Evidence details are navigable")
IMPL = RequirementSite(path="src/rotaris_core/requirements/delivery/evidence.py", line=88)
FAILING = CoveringTest(
    path="tests/unit/requirements/test_evidence_detail.py",
    line=61,
    executed=True,
    check_name="pytest",
    check_status="failed",
    # This test itself failed — the case a per-test report establishes, as opposed
    # to a suite that merely went red somewhere (SWR-2606).
    verdict="failed",
)
VERIFIED = VerificationRecord(
    verdict="failed",
    commit="9f1c0de4bb21",
    requirement_hash="hash-of-3208",
    run_id="run-42",
    verified_at=AT,
    session_id="session-3",
    checks=("pytest", "mypy"),
)


def detailed() -> EvidenceProjection:
    """A requirement whose covering test failed, with every record attached."""
    return project_evidence(
        resolve_obligations(REQ),
        EvidenceInputs(
            req_id=REQ.req_id,
            requirement_hash="hash-of-3208",
            implementations=(IMPL,),
            covering_tests=(FAILING,),
            verification=VERIFIED,
            executions=(
                ExecutionRecord(
                    run_id="run-42",
                    unit_id="unit-1",
                    session_id="session-3",
                    succeeded=True,
                    finished_at=AT,
                ),
            ),
            integrations=(
                IntegrationRecord(
                    integration_id="int-9",
                    unit_ids=("unit-1", "unit-2"),
                    merged_commit="abcdef012345",
                    succeeded=True,
                ),
            ),
        ),
    )


# -- every record is addressable (SWR-3208) --------------------------------


@verifies(SWR.SWR_3208)
def test_a_user_gets_from_failed_test_evidence_to_the_files_line() -> None:
    """The one journey the requirement is about: colour → file → line."""
    projection = detailed()
    test_evidence = projection.for_kind(EvidenceKind.TEST)

    assert test_evidence.state is EvidenceState.FAILED
    assert test_evidence.covering_tests == (FAILING,)
    assert test_evidence.addresses == ("tests/unit/requirements/test_evidence_detail.py:61",)
    assert site_address(FAILING) == f"{FAILING.path}:{FAILING.line}"
    assert site_address(IMPL) == f"{IMPL.path}:{IMPL.line}"


@verifies(SWR.SWR_3208)
def test_every_site_record_carries_a_repository_relative_path_and_a_line() -> None:
    """A site a consumer cannot open is not evidence, so it never gets in."""
    with pytest.raises(ValidationError, match="repository-relative"):
        EvidenceInputs(
            req_id=REQ.req_id,
            implementations=(RequirementSite(path="/absolute/elsewhere.py", line=3),),
        )
    with pytest.raises(ValidationError, match="repository-relative"):
        EvidenceInputs(
            req_id=REQ.req_id,
            implementations=(RequirementSite(path="C:/checkout/module.py", line=3),),
        )
    with pytest.raises(ValidationError, match="line number"):
        EvidenceInputs(
            req_id=REQ.req_id,
            implementations=(RequirementSite(path="src/module.py", line=0),),
        )
    with pytest.raises(ValidationError, match="repository-relative"):
        EvidenceInputs(
            req_id=REQ.req_id,
            covering_tests=(CoveringTest(path="/tmp/test_module.py", line=2),),
        )


@verifies(SWR.SWR_3208)
def test_a_run_a_session_and_an_integration_are_each_openable() -> None:
    """Every non-site record answers "where do I click" too."""
    projection = detailed()

    assert projection.for_kind(EvidenceKind.VERIFICATION).addresses == ("run:run-42@9f1c0de4bb21",)
    assert projection.for_kind(EvidenceKind.EXECUTION).addresses == (
        "session:session-3/run:run-42",
    )
    assert projection.for_kind(EvidenceKind.INTEGRATION).addresses == (
        "integration:int-9@abcdef012345",
    )


# -- the verification record names what it was produced against (SWR-3208) --


@verifies(SWR.SWR_3208)
def test_the_verification_record_names_verdict_commit_hash_and_run() -> None:
    """A verdict without a commit and a hash is a claim, not evidence."""
    assert VERIFIED.verdict == "failed"
    assert VERIFIED.commit == "9f1c0de4bb21"
    assert VERIFIED.requirement_hash == "hash-of-3208"
    assert VERIFIED.run_id == "run-42"

    for missing in ("commit", "requirement_hash", "run_id"):
        payload = VERIFIED.model_dump()
        payload[missing] = "   "
        with pytest.raises(ValidationError, match="names the commit"):
            VerificationRecord.model_validate(payload)


@verifies(SWR.SWR_3208)
def test_an_unrecognised_verdict_is_refused_rather_than_shown_as_a_pass() -> None:
    """The verdict vocabulary is the completion verifier's, not a second one."""
    payload = VERIFIED.model_dump()
    payload["verdict"] = "probably-fine"
    with pytest.raises(ValidationError):
        VerificationRecord.model_validate(payload)


# -- a missing obligation invents nothing (SWR-3208) -----------------------


@verifies(SWR.SWR_3208)
def test_a_missing_obligation_yields_an_empty_record_set_with_a_stated_reason() -> None:
    """Nothing is fabricated to fill the gap, and the gap says what it is."""
    projection = project_evidence(
        resolve_obligations(REQ),
        EvidenceInputs(req_id=REQ.req_id),
    )
    for kind, reason in (
        (EvidenceKind.IMPLEMENTATION, EvidenceReason.NO_IMPLEMENTATION_SITE),
        (EvidenceKind.TEST, EvidenceReason.NO_COVERING_TEST),
        (EvidenceKind.VERIFICATION, EvidenceReason.NO_VERIFICATION),
    ):
        obligation = projection.for_kind(kind)
        assert obligation.state is EvidenceState.MISSING
        assert obligation.reason is reason
        assert obligation.records == ()
        assert obligation.addresses == ()
        assert reason in obligation.detail


@verifies(SWR.SWR_3208)
def test_a_record_set_cannot_be_smuggled_onto_a_missing_obligation() -> None:
    """The invariant is enforced on the model, not left to the projector."""
    with pytest.raises(ValidationError, match="empty record set"):
        ObligationEvidence(
            kind=EvidenceKind.TEST,
            level=ObligationLevel.REQUIRED,
            state=EvidenceState.MISSING,
            reason=EvidenceReason.NO_COVERING_TEST,
            covering_tests=(FAILING,),
        )


@verifies(SWR.SWR_3208, SWR.SWR_3209)
def test_every_unsatisfied_obligation_states_a_reason_and_a_satisfied_one_does_not() -> None:
    """A colour with no reason behind it is exactly what this model refuses."""
    with pytest.raises(ValidationError, match="names the reason"):
        ObligationEvidence(
            kind=EvidenceKind.TEST,
            level=ObligationLevel.REQUIRED,
            state=EvidenceState.FAILED,
            covering_tests=(FAILING,),
        )
    with pytest.raises(ValidationError, match="states no reason"):
        ObligationEvidence(
            kind=EvidenceKind.TEST,
            level=ObligationLevel.REQUIRED,
            state=EvidenceState.SATISFIED,
            reason=EvidenceReason.NO_COVERING_TEST,
        )
    with pytest.raises(ValidationError, match="names the change that made it stale"):
        ObligationEvidence(
            kind=EvidenceKind.TEST,
            level=ObligationLevel.REQUIRED,
            state=EvidenceState.STALE,
            reason=EvidenceReason.NOT_CURRENT,
            covering_tests=(FAILING,),
        )


# -- the records survive persistence (SWR-3208, SWR-3205) ------------------


@verifies(SWR.SWR_3208, SWR.SWR_3205)
def test_the_detail_records_survive_the_store_round_trip() -> None:
    """Persisted and read back, every path, line, commit and run id is still there."""
    projection = detailed()
    stored = DeliveryRecord.blank(REQ.req_id).evolve(
        extras={"evidence": projection.model_dump(mode="json")},
    )

    payload = json.loads(json.dumps(stored.to_payload()))
    restored = EvidenceProjection.model_validate(payload["evidence"])

    assert restored == projection
    assert restored.for_kind(EvidenceKind.TEST).covering_tests[0].path == FAILING.path
    assert restored.for_kind(EvidenceKind.VERIFICATION).verification == VERIFIED
    assert restored.inputs == projection.inputs


@verifies(SWR.SWR_3208, SWR.SWR_3114)
def test_persisting_evidence_never_smuggles_requirement_text_into_the_store() -> None:
    """The record stays operational: no title, no description, no lifecycle."""
    stored = DeliveryRecord.blank(REQ.req_id).evolve(
        extras={"evidence": detailed().model_dump(mode="json")},
    )
    serialised = json.dumps(stored.to_payload())
    for content_field in ('"title"', '"description"', '"lifecycle"', '"status"'):
        assert content_field not in serialised


@verifies(SWR.SWR_3208, SWR.SWR_3209)
def test_a_staleness_finding_travels_with_the_records_it_explains() -> None:
    """A stale obligation is openable too: the finding names the path that moved."""
    finding = StalenessFinding(
        kind=EvidenceKind.IMPLEMENTATION,
        reason=StalenessReason.TRACE_MOVED,
        subject=IMPL.path,
        was=f"{IMPL.path}:12",
    )
    projection = project_evidence(
        resolve_obligations(REQ),
        EvidenceInputs(
            req_id=REQ.req_id,
            implementations=(IMPL,),
            staleness=(finding,),
        ),
    )
    implementation = projection.for_kind(EvidenceKind.IMPLEMENTATION)
    assert implementation.staleness == (finding,)
    assert implementation.addresses == (site_address(IMPL),)
    assert finding.reason in implementation.detail
    assert IMPL.path in finding.message
