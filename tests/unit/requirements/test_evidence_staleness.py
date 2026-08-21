"""Productive use: nobody touched the requirement all week — but a colleague deleted its
covering test, another refactored the module the trace lived in, and a rebase dropped the
commit the verification ran against. The card must stop being green.
Expected outcome: each of those causes produces its own machine-readable reason, an
untouched repository produces none, a rebased-away verification reports stale rather than
failed, and everything is computed from injected repository facts — no git, no
filesystem, no clock."""

from __future__ import annotations

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery.evidence import (
    EvidenceInputs,
    EvidenceReason,
    EvidenceState,
    VerificationRecord,
    project_evidence,
)
from rotaris_core.requirements.delivery.obligations import EvidenceKind, resolve_obligations
from rotaris_core.requirements.delivery.staleness import (
    FreshnessInputs,
    FreshnessPolicy,
    StalenessReason,
    VerifiedEvidence,
    evaluate_freshness,
    stale_kinds,
)
from rotaris_core.requirements.model import CanonicalRequirement
from rotaris_core.verifier.requirement_evidence import CoveringTest, RequirementSite

pytestmark = pytest.mark.unit

REQ = CanonicalRequirement(req_id="SWR-3209", title="Evidence goes stale")
MODULE = "src/rotaris_core/requirements/delivery/staleness.py"
TEST_FILE = "tests/unit/requirements/test_evidence_staleness.py"
IMPL = RequirementSite(path=MODULE, line=120)
TEST_SITE = RequirementSite(path=TEST_FILE, line=44)

VERIFIED = VerifiedEvidence(
    commit="c0ffee123456",
    requirement_hash="hash-1",
    implementations=(IMPL,),
    covering_tests=(TEST_SITE,),
)


def facts(**changes: object) -> FreshnessInputs:
    """A repository in exactly the state the last verification saw."""
    base: dict[str, object] = {
        "req_id": REQ.req_id,
        "requirement_hash": "hash-1",
        "implementations": (IMPL,),
        "covering_tests": (TEST_SITE,),
        "verified": VERIFIED,
    }
    base.update(changes)
    return FreshnessInputs.model_validate(base)


# -- nothing moved (SWR-3209) ----------------------------------------------


@verifies(SWR.SWR_3209)
def test_an_unchanged_repository_produces_no_staleness_at_all() -> None:
    """The rules must be quiet when nothing happened, or nobody will trust them."""
    assert evaluate_freshness(facts()) == ()
    assert stale_kinds(evaluate_freshness(facts())) == frozenset()


@verifies(SWR.SWR_3209)
def test_a_requirement_that_was_never_verified_has_nothing_to_be_stale_against() -> None:
    """Never fresh is not the same fact as no longer fresh."""
    assert evaluate_freshness(facts(verified=None)) == ()


# -- the covering test was deleted (SWR-3209) ------------------------------


@verifies(SWR.SWR_3209)
def test_deleting_a_covering_test_moves_the_test_evidence_off_satisfied() -> None:
    """The acceptance criterion: no requirement edit, and the card is no longer green."""
    findings = evaluate_freshness(facts(covering_tests=()))

    assert [f.reason for f in findings] == [StalenessReason.COVERING_TEST_DISAPPEARED]
    assert findings[0].kind is EvidenceKind.TEST
    assert findings[0].subject == TEST_FILE

    # And the projection built from those facts really does leave `satisfied`.
    projection = project_evidence(
        resolve_obligations(REQ),
        EvidenceInputs(
            req_id=REQ.req_id,
            requirement_hash="hash-1",
            implementations=(IMPL,),
            covering_tests=(),
            verification=VerificationRecord(
                verdict="passed",
                commit=VERIFIED.commit,
                requirement_hash="hash-1",
                run_id="run-1",
            ),
            staleness=findings,
        ),
    )
    test_evidence = projection.for_kind(EvidenceKind.TEST)
    assert test_evidence.state is not EvidenceState.SATISFIED
    assert test_evidence.state is EvidenceState.MISSING
    assert test_evidence.reason is EvidenceReason.NO_COVERING_TEST
    # The deletion is still named, so the user learns *why* it went missing.
    assert test_evidence.staleness == findings


# -- the implementation changed (SWR-3209) ---------------------------------


@verifies(SWR.SWR_3209)
def test_editing_an_implementing_module_marks_the_implementation_stale() -> None:
    """Stale until a verification runs again — the edit alone is the trigger."""
    findings = evaluate_freshness(facts(changed_paths=frozenset({MODULE})))

    assert [f.reason for f in findings] == [StalenessReason.IMPLEMENTATION_CHANGED]
    assert findings[0].subject == MODULE

    projection = project_evidence(
        resolve_obligations(REQ),
        EvidenceInputs(
            req_id=REQ.req_id,
            implementations=(IMPL,),
            covering_tests=(
                CoveringTest(
                    path=TEST_FILE,
                    line=44,
                    executed=True,
                    check_name="pytest",
                    check_status="passed",
                ),
            ),
            staleness=findings,
        ),
    )
    assert projection.for_kind(EvidenceKind.IMPLEMENTATION).state is EvidenceState.STALE

    # A verification that ran again over the new state clears it: no changed
    # paths, no findings, and the same projection is satisfied.
    assert evaluate_freshness(facts()) == ()


@verifies(SWR.SWR_3209)
def test_a_changed_test_file_is_reported_against_the_test_obligation() -> None:
    """The kind of the finding decides which ring segment stops being green."""
    findings = evaluate_freshness(facts(changed_paths=frozenset({TEST_FILE})))
    assert [f.reason for f in findings] == [StalenessReason.TEST_CHANGED]
    assert stale_kinds(findings) == frozenset({EvidenceKind.TEST})


@verifies(SWR.SWR_3209)
def test_a_trace_that_moved_is_a_move_and_one_that_vanished_is_a_disappearance() -> None:
    """Refactoring into another module is a different fact from deleting the trace."""
    moved_within = evaluate_freshness(
        facts(implementations=(RequirementSite(path=MODULE, line=205),)),
    )
    assert [f.reason for f in moved_within] == [StalenessReason.TRACE_MOVED]
    assert moved_within[0].was == f"{MODULE}:120"

    moved_away = evaluate_freshness(
        facts(implementations=(RequirementSite(path="src/rotaris_core/elsewhere.py", line=8),)),
    )
    assert [f.reason for f in moved_away] == [StalenessReason.TRACE_DISAPPEARED]
    assert moved_away[0].subject == MODULE


@verifies(SWR.SWR_3209)
def test_a_disappeared_file_is_not_also_reported_as_an_edited_one() -> None:
    """One repair per finding: "the trace is gone" and "its file changed" are not both."""
    findings = evaluate_freshness(
        facts(implementations=(), changed_paths=frozenset({MODULE})),
    )
    assert [f.reason for f in findings] == [StalenessReason.TRACE_DISAPPEARED]


# -- the verified commit went away (SWR-3209) ------------------------------


@verifies(SWR.SWR_3209)
def test_a_rebased_away_verification_reports_stale_and_never_failed() -> None:
    """The verification did not fail; it stopped describing this history."""
    findings = evaluate_freshness(facts(verified_commit_is_ancestor=False))

    assert [f.reason for f in findings] == [StalenessReason.VERIFIED_COMMIT_UNREACHABLE]
    assert findings[0].kind is EvidenceKind.VERIFICATION
    assert findings[0].subject == VERIFIED.commit

    projection = project_evidence(
        resolve_obligations(REQ),
        EvidenceInputs(
            req_id=REQ.req_id,
            implementations=(IMPL,),
            verification=VerificationRecord(
                verdict="passed",
                commit=VERIFIED.commit,
                requirement_hash="hash-1",
                run_id="run-1",
            ),
            staleness=findings,
        ),
    )
    verification = projection.for_kind(EvidenceKind.VERIFICATION)
    assert verification.state is not EvidenceState.FAILED
    assert verification.state is EvidenceState.STALE


@verifies(SWR.SWR_3209)
def test_an_unknown_ancestry_is_not_read_as_a_lost_commit() -> None:
    """Nobody asked git, so nothing is claimed — `None` is not `False`."""
    assert evaluate_freshness(facts(verified_commit_is_ancestor=None)) == ()


@verifies(SWR.SWR_3209, SWR.SWR_3204)
def test_a_specification_that_moved_since_the_verification_is_named_as_such() -> None:
    """Requirement freshness and evidence freshness are tracked apart, and both show."""
    findings = evaluate_freshness(facts(requirement_hash="hash-2"))
    assert [f.reason for f in findings] == [StalenessReason.SPECIFICATION_MOVED]
    assert findings[0].subject == "hash-2"
    assert findings[0].was == "hash-1"


# -- several causes at once, and the policy switches (SWR-3209) ------------


@verifies(SWR.SWR_3209)
def test_several_causes_accumulate_rather_than_collapsing_into_one_colour() -> None:
    """Fixing one of three problems must not hide the other two."""
    findings = evaluate_freshness(
        facts(
            covering_tests=(),
            changed_paths=frozenset({MODULE}),
            verified_commit_is_ancestor=False,
        ),
    )
    assert {f.reason for f in findings} == {
        StalenessReason.COVERING_TEST_DISAPPEARED,
        StalenessReason.IMPLEMENTATION_CHANGED,
        StalenessReason.VERIFIED_COMMIT_UNREACHABLE,
    }
    assert stale_kinds(findings) == {
        EvidenceKind.IMPLEMENTATION,
        EvidenceKind.TEST,
        EvidenceKind.VERIFICATION,
    }
    # Deterministic order, so two passes over one repository state diff to nothing.
    assert findings == evaluate_freshness(
        facts(
            covering_tests=(),
            changed_paths=frozenset({MODULE}),
            verified_commit_is_ancestor=False,
        ),
    )


@verifies(SWR.SWR_3209)
def test_every_finding_carries_a_machine_readable_reason_not_just_a_colour() -> None:
    """A board can colour it; a script can act on it."""
    findings = evaluate_freshness(facts(covering_tests=(), verified_commit_is_ancestor=False))
    for finding in findings:
        assert isinstance(finding.reason, StalenessReason)
        assert finding.reason in finding.message
        assert finding.kind.label in finding.message


@verifies(SWR.SWR_3209)
def test_a_workspace_can_switch_off_the_rules_it_does_not_want() -> None:
    """The configuration block is honoured, one rule at a time."""
    no_ancestry = FreshnessPolicy(stale_on_lost_ancestor=False)
    assert evaluate_freshness(facts(verified_commit_is_ancestor=False), policy=no_ancestry) == ()

    no_moves = FreshnessPolicy(stale_on_trace_move=False)
    assert evaluate_freshness(facts(covering_tests=()), policy=no_moves) == ()
    # Switching off the move rule leaves the edit rule working.
    still_reported = evaluate_freshness(
        facts(changed_paths=frozenset({MODULE})),
        policy=no_moves,
    )
    assert [f.reason for f in still_reported] == [StalenessReason.IMPLEMENTATION_CHANGED]


@verifies(SWR.SWR_3209)
def test_the_freshness_rules_touch_no_file_and_no_process(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Repository facts are inputs, which is what makes the rules testable at all."""
    import builtins
    import subprocess

    def forbidden(*_args: object, **_kwargs: object) -> object:
        raise AssertionError("the freshness rules must be pure over their inputs")

    monkeypatch.setattr(builtins, "open", forbidden)
    monkeypatch.setattr(subprocess, "run", forbidden)
    monkeypatch.setattr(subprocess, "Popen", forbidden)

    findings = evaluate_freshness(facts(changed_paths=frozenset({MODULE})))
    assert [f.reason for f in findings] == [StalenessReason.IMPLEMENTATION_CHANGED]
