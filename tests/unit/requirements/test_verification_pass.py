"""One suite run, attributed — and refused where it was measured (SWR-3221).

The load-bearing test in this file is
:func:`test_a_verification_measured_in_a_unit_worktree_is_refused`. Everything
else describes how one run is shared out across the requirements it covered; that
one is why a worktree measurement cannot become requirement evidence no matter
which function a caller reaches for.
"""

from __future__ import annotations

import datetime as dt

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery.evidence import EvidenceInputs
from rotaris_core.requirements.delivery.verification import VerificationOrigin
from rotaris_core.requirements.delivery.verification_pass import (
    NO_CHECK_SUITE,
    NOTHING_EXECUTED,
    OFF_TARGET_BRANCH,
    VerificationOutcome,
    VerificationTarget,
    plan_verifications,
)
from rotaris_core.requirements.model import CanonicalRequirement
from rotaris_core.verifier.requirement_evidence import CoveringTest, RequirementSite
from rotaris_core.verifier.runner import CheckResult

pytestmark = pytest.mark.unit

AT = dt.datetime(2026, 8, 16, 11, 0, tzinfo=dt.UTC)
TARGET = VerificationTarget(branch="dev", commit="a" * 40)
WORKTREE_COMMIT = "b" * 40

ONE = CanonicalRequirement(req_id="SWR-1", title="One", current_hash="h-1")
TWO = CanonicalRequirement(req_id="SWR-2", title="Two", current_hash="h-2")


def _evidence(*, observed: str = "not_run", **tests: str) -> object:
    """A reader answering with one covering test per requirement, at *tests*' paths.

    *observed* is what a per-test report already said about each of those tests.
    The default is "nothing" — a coverage sweep on its own knows a test exists and
    no more — and a caller that means "a report named this test as passed/failed"
    says so, which is the only way that claim can enter the pass (SWR-2606).
    """

    def evidence_for(requirement: CanonicalRequirement) -> EvidenceInputs:
        path = tests.get(requirement.req_id.replace("-", "_"))
        return EvidenceInputs(
            req_id=requirement.req_id,
            requirement_hash=requirement.current_hash,
            implementations=(RequirementSite(path="src/thing.py", line=3),),
            covering_tests=(
                () if path is None else (CoveringTest(path=path, line=9, verdict=observed),)
            ),
        )

    return evidence_for


def _check(
    name: str = "pytest",
    *,
    command: str = "uv run pytest tests/",
    status: str = "passed",
    severity: str = "blocking",
) -> CheckResult:
    return CheckResult(
        name=name,
        command=command,
        severity=severity,  # type: ignore[arg-type]
        status=status,  # type: ignore[arg-type]
        exit_code=0 if status == "passed" else 1,
    )


# -- the guard this whole design rests on ----------------------------------


@verifies(SWR.SWR_3221)
def test_a_verification_measured_in_a_unit_worktree_is_refused() -> None:
    """Productive use: two requirements run in parallel in two worktrees, and one of
    them tries to record the suite that passed in its own tree.
    Expected outcome: refused, for every requirement, naming the precondition. Two
    requirements can each be green alone and red together, so a measurement taken
    off the target branch is evidence about a unit and not about a requirement."""
    report = plan_verifications(
        [ONE, TWO],
        _evidence(SWR_1="tests/test_one.py", SWR_2="tests/test_two.py"),
        checks=[_check()],
        target=TARGET,
        measured_commit=WORKTREE_COMMIT,
        reachable=lambda commit: commit != WORKTREE_COMMIT,
        run_id="run-1",
        at=AT,
    )

    assert report.recorded == ()
    assert [result.req_id for result in report.refused] == ["SWR-1", "SWR-2"]
    assert report.refused[0].detail == OFF_TARGET_BRANCH
    assert report.verifications == ()


@verifies(SWR.SWR_3221)
def test_a_commit_on_the_target_branch_records_normally() -> None:
    """Productive use: the same suite, run on the branch the work landed on.
    Expected outcome: recorded — the guard refuses a place, not a caller."""
    report = plan_verifications(
        [ONE],
        _evidence(SWR_1="tests/test_one.py"),
        checks=[_check()],
        target=TARGET,
        reachable=lambda _commit: True,
        run_id="run-1",
        at=AT,
    )

    assert [result.req_id for result in report.recorded] == ["SWR-1"]
    assert report.verifications[0].commit == TARGET.commit
    assert report.verifications[0].target_branch == "dev"


@verifies(SWR.SWR_3221, SWR.SWR_3209)
def test_an_unknown_ancestry_records_rather_than_refusing() -> None:
    """Productive use: the workspace is not a git checkout, so nobody can be asked.
    Expected outcome: recorded. `None` is unknown, not "no" — and a workspace
    without git has no worktrees for this guard to be protecting against. Reading
    unknown as a refusal would make the pass useless exactly where it is harmless."""
    report = plan_verifications(
        [ONE],
        _evidence(SWR_1="tests/test_one.py"),
        checks=[_check()],
        target=TARGET,
        reachable=lambda _commit: None,
        run_id="run-1",
        at=AT,
    )

    assert len(report.recorded) == 1


@verifies(SWR.SWR_3221, SWR.SWR_3419)
def test_the_pass_names_the_branch_it_measured_and_invents_none() -> None:
    """Productive use: a team works on `dev`, not on the default branch.
    Expected outcome: `dev` is what the artefact records. Nothing in the pass knows
    the name of any branch; it is told (SWR-3419)."""
    report = plan_verifications(
        [ONE],
        _evidence(SWR_1="tests/test_one.py"),
        checks=[_check()],
        target=VerificationTarget(branch="release/2.1", commit="c" * 40),
        run_id="run-1",
        at=AT,
    )

    assert report.verifications[0].target_branch == "release/2.1"
    assert "on release/2.1" in report.summary


# -- one run, shared out ---------------------------------------------------


@verifies(SWR.SWR_3221, SWR.SWR_2606)
def test_one_run_records_only_the_requirements_whose_tests_it_executed() -> None:
    """Productive use: the configured suite runs one directory, not the whole tree.
    Expected outcome: the requirement it covered is recorded, the one it never
    reached is skipped and says so. Recording a non-measurement for everything the
    suite missed would fill the store with verdicts nobody measured."""
    report = plan_verifications(
        [ONE, TWO],
        _evidence(SWR_1="tests/unit/test_one.py", SWR_2="tests/other/test_two.py"),
        checks=[_check(command="uv run pytest tests/unit")],
        target=TARGET,
        run_id="run-1",
        at=AT,
    )

    assert [result.req_id for result in report.recorded] == ["SWR-1"]
    assert [result.req_id for result in report.skipped] == ["SWR-2"]
    assert report.skipped[0].detail == NOTHING_EXECUTED


@verifies(SWR.SWR_3221)
def test_a_requirement_with_no_covering_test_is_never_recorded() -> None:
    """Productive use: a requirement nobody has written a test for.
    Expected outcome: skipped. There is nothing for a suite to have proved, and a
    verification saying otherwise would be the confident lie this lane prevents."""
    report = plan_verifications(
        [ONE],
        _evidence(),
        checks=[_check()],
        target=TARGET,
        run_id="run-1",
        at=AT,
    )

    assert report.recorded == ()
    assert report.skipped[0].detail == NOTHING_EXECUTED


@verifies(SWR.SWR_3221, SWR.SWR_3410)
def test_a_workspace_with_no_checks_records_nothing_and_says_why() -> None:
    """Productive use: a project that has not configured a check suite verifies.
    Expected outcome: no records, and a stated reason. "Nobody checked" and
    "everything holds" are different answers and only one earns evidence."""
    report = plan_verifications(
        [ONE, TWO],
        _evidence(SWR_1="tests/test_one.py"),
        checks=[],
        target=TARGET,
        run_id="run-1",
        at=AT,
    )

    assert report.recorded == ()
    assert len(report.skipped) == 2
    assert report.skipped[0].detail == NO_CHECK_SUITE


@verifies(SWR.SWR_3221)
def test_a_failing_covering_test_makes_that_requirements_verdict_failed() -> None:
    """Productive use: the run's test report names this requirement's test as red.
    Expected outcome: `failed`, recorded rather than withheld — a red verdict is
    evidence too, and it is what turns the ring red for a reason. The report is
    what carries it: a red *suite* alone never names which test broke."""
    report = plan_verifications(
        [ONE],
        _evidence(SWR_1="tests/test_one.py", observed="failed"),
        checks=[_check(status="failed")],
        target=TARGET,
        run_id="run-1",
        at=AT,
    )

    assert report.verifications[0].record.verdict == "failed"
    assert report.verifications[0].passed is False


@verifies(SWR.SWR_3221, SWR.SWR_2606)
def test_a_suite_that_observed_nothing_records_nothing_rather_than_a_failure() -> None:
    """Productive use: the check suite is killed by its timeout part-way through.
    Expected outcome: the requirement is reported inconclusive and **no** record is
    written. Writing `failed` here is what put 1225 unearned failures in a real
    store; withholding the record also leaves any earlier, real verification
    standing, because nothing has been learned that would replace it."""
    report = plan_verifications(
        [ONE],
        _evidence(SWR_1="tests/test_one.py"),
        checks=[_check(status="timeout")],
        target=TARGET,
        run_id="run-1",
        at=AT,
    )

    assert report.verifications == ()
    assert [result.outcome for result in report.inconclusive] == [
        VerificationOutcome.INCONCLUSIVE,
    ]
    assert "observed none of them" in report.inconclusive[0].detail


@verifies(SWR.SWR_3221, SWR.SWR_2604)
def test_a_failed_blocking_check_stops_any_requirement_reading_as_passed() -> None:
    """Productive use: the tests are green and the workspace's lint check is red.
    Expected outcome: no requirement measured by that run is `passed`. The gate the
    workspace configured is the thing being trusted, and a green ring over a red
    suite is the failure this lane exists to prevent."""
    report = plan_verifications(
        [ONE],
        _evidence(SWR_1="tests/test_one.py"),
        checks=[_check(), _check("ruff", command="uv run ruff check .", status="failed")],
        target=TARGET,
        run_id="run-1",
        at=AT,
    )

    assert report.verifications[0].record.verdict == "failed"
    assert report.verifications[0].record.checks == ("pytest", "ruff")


@verifies(SWR.SWR_3221)
def test_an_advisory_check_does_not_gate_the_verdict() -> None:
    """Productive use: an advisory check is red and everything blocking is green.
    Expected outcome: `passed`. Advisory checks do not gate, the same way they do
    not gate a run (SWR-2604)."""
    report = plan_verifications(
        [ONE],
        _evidence(SWR_1="tests/test_one.py"),
        checks=[
            _check(),
            _check("mypy", command="uv run mypy src", status="failed", severity="advisory"),
        ],
        target=TARGET,
        run_id="run-1",
        at=AT,
    )

    assert report.verifications[0].record.verdict == "passed"


@verifies(SWR.SWR_3221, SWR.SWR_3220)
def test_the_recorded_artefact_carries_the_sites_the_run_was_measured_over() -> None:
    """Productive use: the artefact is written and read again after a refactor.
    Expected outcome: it holds today's traces and covering tests as the baseline —
    what SWR-3209 will compare the repository against."""
    report = plan_verifications(
        [ONE],
        _evidence(SWR_1="tests/test_one.py"),
        checks=[_check()],
        target=TARGET,
        run_id="run-1",
        at=AT,
        origin=VerificationOrigin.ADOPTED,
    )

    verification = report.verifications[0]

    assert verification.implementations == (RequirementSite(path="src/thing.py", line=3),)
    assert verification.baseline.covering_tests == (
        RequirementSite(path="tests/test_one.py", line=9),
    )
    assert verification.origin is VerificationOrigin.ADOPTED
    assert verification.executed_tests[0].check_name == "pytest"


@verifies(SWR.SWR_3221, SWR.SWR_3609)
def test_the_report_answers_per_requirement_not_in_aggregate() -> None:
    """Productive use: a user verifies a board and asks what happened to SWR-2.
    Expected outcome: one line per requirement, naming the outcome and the reason —
    the obligation SWR-3609 places on every bulk action."""
    report = plan_verifications(
        [ONE, TWO],
        _evidence(SWR_1="tests/unit/test_one.py"),
        checks=[_check(command="uv run pytest tests/unit")],
        target=TARGET,
        run_id="run-1",
        at=AT,
    )

    assert len(report.results) == 2
    assert {result.req_id for result in report.results} == {"SWR-1", "SWR-2"}
    assert report.results[1].outcome is VerificationOutcome.SKIPPED
    assert "SWR-2" in report.results[1].message
    assert report.summary == "1 verified on dev, 0 refused, 1 not reached"


@verifies(SWR.SWR_3221)
def test_a_target_must_name_both_its_branch_and_its_commit() -> None:
    """Productive use: a caller builds a target from a detached or unknown checkout.
    Expected outcome: refused at construction. A verification that cannot say where
    it counts is not evidence."""
    with pytest.raises(ValueError, match="names the branch"):
        VerificationTarget(branch="", commit="a" * 40)
    with pytest.raises(ValueError, match="names the branch"):
        VerificationTarget(branch="dev", commit="  ")
