"""Productive use: a user looks at one requirement's traceability ring and asks the
only question that matters — is this actually delivered? Every trace is in place, every
covering test is named, and the test is red.
Expected outcome: the ring says `failed`, not `satisfied`. Evidence that exists but
nobody ran says `stale`, which is a third answer and not a shade of `satisfied`; an
obligation with no evidence at all says `missing` and names the requirement; and all of
it is computed from data, so the rules hold with no repository anywhere near them."""

from __future__ import annotations

import datetime as dt

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery.evidence import (
    EvidenceInputs,
    EvidenceProjection,
    EvidenceReason,
    EvidenceState,
    ExecutionRecord,
    VerificationRecord,
    project_evidence,
)
from rotaris_core.requirements.delivery.obligations import (
    EVIDENCE_KINDS,
    EvidenceKind,
    ObligationLevel,
    resolve_obligations,
)
from rotaris_core.requirements.delivery.staleness import StalenessFinding, StalenessReason
from rotaris_core.requirements.model import CanonicalRequirement
from rotaris_core.verifier.evidence import (  # noqa: TC001 - a default value's type.
    VerifierVerdict,
)
from rotaris_core.verifier.requirement_evidence import CoveringTest, RequirementSite

pytestmark = pytest.mark.unit

AT = dt.datetime(2026, 8, 14, 10, 0, tzinfo=dt.UTC)
REQ = CanonicalRequirement(req_id="SWR-3207", title="Evidence health projection")
IMPL = RequirementSite(path="src/rotaris_core/requirements/delivery/evidence.py", line=42)
TEST_PATH = "tests/unit/requirements/test_evidence_health.py"


def covering(
    *,
    executed: bool = True,
    status: str | None = "passed",
    verdict: str | None = None,
) -> CoveringTest:
    """A covering test the last suite did (or did not) run.

    *status* is the **check's** status and *verdict* is what the run could say
    about this **test**. Left unset, the verdict is derived from the status the
    way a stored record's is — which for anything but ``passed`` is ``unknown``,
    because a check status alone never names a failing test. A test that means
    "this test itself failed" says ``verdict="failed"``, which is what a per-test
    report supplies.
    """
    fields: dict[str, object] = {
        "path": TEST_PATH,
        "line": 17,
        "executed": executed,
        "check_name": "pytest" if executed else None,
        "check_status": status if executed else None,
    }
    if verdict is not None:
        fields["verdict"] = verdict
    return CoveringTest(**fields)  # type: ignore[arg-type]


def verification(
    verdict: VerifierVerdict = "passed",
    *,
    requirement_hash: str = "h-1",
) -> VerificationRecord:
    """A completion-gate verdict for this requirement."""
    return VerificationRecord(
        verdict=verdict,
        commit="c0ffee1234",
        requirement_hash=requirement_hash,
        run_id="run-7",
        verified_at=AT,
    )


def inputs(**changes: object) -> EvidenceInputs:
    """A fully-evidenced requirement, with *changes* applied."""
    base: dict[str, object] = {
        "req_id": REQ.req_id,
        "requirement_hash": "h-1",
        "implementations": (IMPL,),
        "covering_tests": (covering(),),
        "verification": verification(),
        "executions": (ExecutionRecord(run_id="run-7", succeeded=True),),
    }
    base.update(changes)
    return EvidenceInputs.model_validate(base)


def project(**changes: object) -> EvidenceProjection:
    """The projection of a fully-evidenced requirement with *changes* applied."""
    return project_evidence(resolve_obligations(REQ), inputs(**changes))


# -- the core case: complete traceability is not delivery (SWR-3207, §22) ---


@verifies(SWR.SWR_3207)
def test_complete_traceability_with_a_failing_test_projects_failed() -> None:
    """Every trace in place, the test red: the ring is red, not green."""
    projection = project(covering_tests=(covering(status="failed", verdict="failed"),))

    test_evidence = projection.for_kind(EvidenceKind.TEST)
    assert test_evidence.state is not EvidenceState.SATISFIED
    assert test_evidence.state is EvidenceState.FAILED
    assert test_evidence.reason is EvidenceReason.COVERING_TEST_FAILED

    # The traceability around it really is complete — that is what makes this the
    # case worth having: nothing else is wrong, and the answer is still not green.
    assert projection.for_kind(EvidenceKind.IMPLEMENTATION).state is EvidenceState.SATISFIED
    assert projection.for_kind(EvidenceKind.VERIFICATION).state is EvidenceState.SATISFIED

    assert projection.state is EvidenceState.FAILED
    assert not projection.satisfied
    assert projection.kinds_in(EvidenceState.FAILED) == (EvidenceKind.TEST,)
    assert EvidenceKind.TEST in {obligation.kind for obligation in projection.blocking}


@verifies(SWR.SWR_3207)
def test_a_timed_out_check_is_unobserved_evidence_not_failed_evidence() -> None:
    """A covering test the suite killed proves nothing — and accuses nothing.

    It never reads as green, which is what matters for the ring. It also never
    reads as *red*: nothing measured this test, so naming it as a failure would
    send a user to a file where there is nothing to fix.
    """
    projection = project(covering_tests=(covering(status="timeout"),))
    test_evidence = projection.for_kind(EvidenceKind.TEST)
    assert test_evidence.state is EvidenceState.STALE
    assert test_evidence.reason is EvidenceReason.RESULT_UNKNOWN
    assert test_evidence.state is not EvidenceState.SATISFIED


@verifies(SWR.SWR_3207)
def test_one_failing_covering_test_outweighs_a_passing_sibling() -> None:
    """Two tests cover it, one is red: the evidence never averages out."""
    projection = project(
        covering_tests=(covering(), covering(status="failed", verdict="failed")),
    )
    assert projection.for_kind(EvidenceKind.TEST).state is EvidenceState.FAILED


# -- the second case: exists, but nobody ran it (SWR-3207) -----------------


@verifies(SWR.SWR_3207)
def test_a_covering_test_that_never_ran_projects_stale_and_names_why() -> None:
    """Named evidence nobody executed is not evidence — and it says so."""
    projection = project(covering_tests=(covering(executed=False),))

    test_evidence = projection.for_kind(EvidenceKind.TEST)
    assert test_evidence.state is EvidenceState.STALE
    assert test_evidence.reason is EvidenceReason.NOT_CURRENT
    assert [finding.reason for finding in test_evidence.staleness] == [StalenessReason.NEVER_RUN]
    assert test_evidence.staleness[0].subject == f"{TEST_PATH}:17"
    # The record is still carried: the user has to be able to go and run it.
    assert test_evidence.covering_tests == (covering(executed=False),)


@verifies(SWR.SWR_3207)
def test_satisfied_stale_and_missing_are_three_answers_not_two() -> None:
    """The distinction is three-way: ran and passed, exists but unrun, absent."""
    satisfied = project().for_kind(EvidenceKind.TEST)
    stale = project(covering_tests=(covering(executed=False),)).for_kind(EvidenceKind.TEST)
    missing = project(covering_tests=()).for_kind(EvidenceKind.TEST)

    states = (satisfied.state, stale.state, missing.state)
    assert states == (EvidenceState.SATISFIED, EvidenceState.STALE, EvidenceState.MISSING)
    assert len(set(states)) == 3
    assert satisfied.reason is None
    assert stale.reason is EvidenceReason.NOT_CURRENT
    assert missing.reason is EvidenceReason.NO_COVERING_TEST


# -- the third case: nothing there at all (SWR-3207) -----------------------


@verifies(SWR.SWR_3207)
def test_a_required_obligation_with_no_evidence_is_missing_and_names_the_requirement() -> None:
    """A gap is reported as a gap, against a named requirement."""
    projection = project(covering_tests=())

    missing = projection.for_kind(EvidenceKind.TEST)
    assert missing.state is EvidenceState.MISSING
    assert missing.reason is EvidenceReason.NO_COVERING_TEST
    assert missing.records == ()
    assert projection.detail.startswith("SWR-3207: ")
    assert "test" in projection.detail


@verifies(SWR.SWR_3206, SWR.SWR_3207)
def test_an_optional_obligation_with_nothing_recorded_is_not_a_gap() -> None:
    """A requirement delivered by hand has no execution record and is not thereby broken."""
    projection = project(executions=())

    execution = projection.for_kind(EvidenceKind.EXECUTION)
    assert execution.level is ObligationLevel.OPTIONAL
    assert execution.state is EvidenceState.NOT_APPLICABLE
    assert execution.reason is EvidenceReason.OPTIONAL_AND_ABSENT
    assert execution not in projection.blocking
    assert projection.state is EvidenceState.SATISFIED


@verifies(SWR.SWR_3206, SWR.SWR_3207)
def test_a_trace_optional_requirement_reports_no_missing_implementation() -> None:
    """The source said no trace is owed; the board does not invent one."""
    lenient = REQ.evolve(trace_required=False)
    projection = project_evidence(
        resolve_obligations(lenient),
        EvidenceInputs(
            req_id=lenient.req_id,
            requirement_hash="h-1",
            covering_tests=(covering(),),
            verification=verification(),
        ),
    )

    implementation = projection.for_kind(EvidenceKind.IMPLEMENTATION)
    assert implementation.level is ObligationLevel.OPTIONAL
    assert implementation.state is not EvidenceState.MISSING
    assert implementation.state is EvidenceState.NOT_APPLICABLE
    assert projection.blocking == ()


# -- verification (SWR-3207) -----------------------------------------------


@verifies(SWR.SWR_3207)
def test_a_failed_verification_is_failed_and_a_skipped_one_is_stale() -> None:
    """A gate that said no is a failure; a gate that never ran is not a pass."""
    failed = project(verification=verification("failed")).for_kind(EvidenceKind.VERIFICATION)
    assert failed.state is EvidenceState.FAILED
    assert failed.reason is EvidenceReason.VERIFICATION_FAILED

    skipped = project(verification=verification("skipped")).for_kind(EvidenceKind.VERIFICATION)
    assert skipped.state is EvidenceState.STALE
    assert [finding.reason for finding in skipped.staleness] == [StalenessReason.NEVER_RUN]


@verifies(SWR.SWR_3207, SWR.SWR_3209)
def test_evidence_that_was_not_reverified_since_a_change_is_stale_not_satisfied() -> None:
    """The implementation moved under a green verification: stale, and it says which file."""
    moved = StalenessFinding(
        kind=EvidenceKind.IMPLEMENTATION,
        reason=StalenessReason.IMPLEMENTATION_CHANGED,
        subject=IMPL.path,
    )
    projection = project(staleness=(moved,))

    implementation = projection.for_kind(EvidenceKind.IMPLEMENTATION)
    assert implementation.state is EvidenceState.STALE
    assert implementation.staleness == (moved,)
    assert implementation.implementations == (IMPL,)
    assert projection.state is EvidenceState.STALE
    # Only the kind the finding is about moves; the others keep their own answer.
    assert projection.for_kind(EvidenceKind.TEST).state is EvidenceState.SATISFIED


# -- the aggregate and its ordering (SWR-3207) -----------------------------


@verifies(SWR.SWR_3207)
def test_the_ring_reports_the_loudest_obligation_it_has() -> None:
    """Failure beats a gap, a gap beats staleness, staleness beats green."""
    everything_wrong = project(
        covering_tests=(covering(status="failed", verdict="failed"),),
        implementations=(),
        verification=None,
    )
    assert everything_wrong.state is EvidenceState.FAILED

    gap_only = project(implementations=())
    assert gap_only.state is EvidenceState.MISSING

    stale_only = project(
        staleness=(
            StalenessFinding(
                kind=EvidenceKind.TEST,
                reason=StalenessReason.TEST_CHANGED,
                subject=TEST_PATH,
            ),
        ),
    )
    assert stale_only.state is EvidenceState.STALE
    assert project().state is EvidenceState.SATISFIED
    assert project().satisfied


@verifies(SWR.SWR_3207)
def test_the_projection_is_complete_and_carries_the_inputs_it_was_derived_from() -> None:
    """One entry per kind, in board order, plus the facts that produced them."""
    given = inputs()
    projection = project_evidence(resolve_obligations(REQ), given)

    assert tuple(o.kind for o in projection.obligations) == EVIDENCE_KINDS
    assert projection.inputs == given
    assert projection.req_id == REQ.req_id
    for kind in EVIDENCE_KINDS:
        assert projection.state_of(kind) is projection.for_kind(kind).state


@verifies(SWR.SWR_3207)
def test_projecting_one_requirements_evidence_onto_anothers_obligations_is_refused() -> None:
    """The one mix-up a board could never notice is the one that raises."""
    other = resolve_obligations(CanonicalRequirement(req_id="SWR-9999"))
    with pytest.raises(ValueError, match="SWR-9999"):
        project_evidence(other, inputs())


# -- purity (SWR-3207: independently testable without a repository) --------


@verifies(SWR.SWR_3207)
def test_the_projection_touches_no_file_no_process_and_no_clock(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Every repository fact is an input, so the rules run with the world unplugged."""
    import builtins
    import subprocess
    import time

    def forbidden(*_args: object, **_kwargs: object) -> object:
        raise AssertionError("the evidence projection must be pure over its inputs")

    monkeypatch.setattr(builtins, "open", forbidden)
    monkeypatch.setattr(subprocess, "run", forbidden)
    monkeypatch.setattr(subprocess, "Popen", forbidden)
    monkeypatch.setattr(time, "time", forbidden)

    projection = project_evidence(resolve_obligations(REQ), inputs())
    assert projection.state is EvidenceState.SATISFIED


@verifies(SWR.SWR_3207)
def test_the_same_inputs_always_produce_the_same_projection() -> None:
    """Pure means repeatable: two passes over one fact set are one answer."""
    obligations = resolve_obligations(REQ)
    given = inputs(covering_tests=(covering(status="failed"),))
    assert project_evidence(obligations, given) == project_evidence(obligations, given)
