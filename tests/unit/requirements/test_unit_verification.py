"""Productive use: a user wants to know, per unit, whether the work an agent did actually
holds up — which checks ran, against which commit, and against which version of the
requirement.
Expected outcome: the checks run in the unit's own worktree and never in the base checkout,
the recorded evidence names the commit and the requirement hash it was produced against, a
workspace with no check suite reports "not verified" rather than "verified", and a failure
names the check that failed while the unit's work stays where it is."""

from __future__ import annotations

import datetime as dt
from pathlib import Path

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery.projection import CheckOutcome
from rotaris_core.requirements.execution.contract import RunnerMeasurements
from rotaris_core.requirements.execution.run_seam import RunWorkspace
from rotaris_core.requirements.execution.snapshot import RunSnapshot, capture_snapshot
from rotaris_core.requirements.execution.verification import (
    NO_SUITE_REASON,
    CoverageFinding,
    SuiteRun,
    UnitVerification,
    VerificationError,
    coverage_findings,
    verify_unit,
)
from rotaris_core.requirements.model import CanonicalRequirement

REQ = "SWR-3410"
UNIT = "swr-3410-impl"
AT = dt.datetime(2026, 8, 14, 13, 0, tzinfo=dt.UTC)
COMMIT = "9f1c2d3e4a5b6c7d8e9f0a1b2c3d4e5f60718293"


def requirement() -> CanonicalRequirement:
    return CanonicalRequirement(
        req_id=REQ,
        title="Requirement verification runs inside the unit's workspace",
        description="The checks run where the work is.",
        source_id="specs",
        source_path="specs/verification.md",
        source_revision="r7",
    )


def snapshot() -> RunSnapshot:
    return capture_snapshot(
        requirement(),
        run_id="run-1",
        base_commit="base-1",
        at=AT,
        unit_id=UNIT,
        session_id="20260814-abcdef",
    )


def workspace(tmp_path: Path) -> RunWorkspace:
    tree = tmp_path / "unit-tree"
    tree.mkdir(exist_ok=True)
    return RunWorkspace(
        path=str(tree),
        branch="rotaris/req/swr-3410/impl",
        base_branch="main",
        base_revision="base-1",
    )


def run_in(seen: list[Path], suite: SuiteRun) -> object:
    def run_checks(tree: Path) -> SuiteRun:
        seen.append(tree)
        return suite

    return run_checks


PASSING = SuiteRun(
    executed=True,
    checks=(
        CheckOutcome(name="pytest", status="passed"),
        CheckOutcome(name="mypy", status="passed"),
    ),
    duration_s=4.5,
)


# -- where the checks run --------------------------------------------------


@pytest.mark.unit
@verifies(SWR.SWR_3410)
def test_the_checks_run_in_the_units_own_worktree(tmp_path: Path) -> None:
    """Verifying anywhere else measures a tree the unit never wrote to."""
    base = tmp_path / "base"
    base.mkdir()
    tree = workspace(tmp_path)
    seen: list[Path] = []

    verification = verify_unit(
        snapshot=snapshot(),
        workspace=tree,
        base_workspace=base,
        run_checks=run_in(seen, PASSING),  # type: ignore[arg-type]
        commit=COMMIT,
        at=AT,
    )

    assert [str(path) for path in seen] == [tree.path]
    assert str(base) not in [str(path) for path in seen]
    assert verification.worktree_path == tree.path
    assert verification.branch == tree.branch


@pytest.mark.unit
@verifies(SWR.SWR_3410, SWR.SWR_3405)
def test_verification_refuses_to_run_in_the_base_checkout(tmp_path: Path) -> None:
    """The one workspace a unit's work is guaranteed not to be in."""
    base = tmp_path / "base"
    base.mkdir()
    seen: list[Path] = []

    with pytest.raises(VerificationError, match="the base checkout"):
        verify_unit(
            snapshot=snapshot(),
            workspace=RunWorkspace(path=str(base), branch="main"),
            base_workspace=base,
            run_checks=run_in(seen, PASSING),  # type: ignore[arg-type]
            commit=COMMIT,
        )

    assert seen == []


@pytest.mark.unit
@verifies(SWR.SWR_3410)
def test_a_verdict_with_no_commit_to_attribute_it_to_is_refused(tmp_path: Path) -> None:
    """An unattributable verdict is a claim, not evidence."""
    base = tmp_path / "base"
    base.mkdir()

    with pytest.raises(VerificationError, match="names the commit"):
        verify_unit(
            snapshot=snapshot(),
            workspace=workspace(tmp_path),
            base_workspace=base,
            run_checks=lambda _tree: PASSING,
            commit="   ",
        )


# -- what gets attached ----------------------------------------------------


@pytest.mark.unit
@verifies(SWR.SWR_3410, SWR.SWR_3208)
def test_the_recorded_evidence_names_the_commit_and_the_requirement_hash(
    tmp_path: Path,
) -> None:
    """Both, always: without either, nobody can reproduce what was verified."""
    base = tmp_path / "base"
    base.mkdir()
    taken = snapshot()

    verification = verify_unit(
        snapshot=taken,
        workspace=workspace(tmp_path),
        base_workspace=base,
        run_checks=lambda _tree: PASSING,
        commit=COMMIT,
        at=AT,
    )

    assert verification.verified is True
    assert verification.verdict == "passed"
    assert verification.commit == COMMIT
    assert verification.requirement_hash == taken.requirement_hash
    assert verification.requirement_hash == requirement().current_hash

    record = verification.to_record()
    assert record.verdict == "passed"
    assert record.commit == COMMIT
    assert record.requirement_hash == taken.requirement_hash
    assert record.run_id == "run-1"
    assert record.session_id == "20260814-abcdef"
    assert record.checks == ("pytest", "mypy")
    assert record.verified_at == AT
    assert record.address == f"run:run-1@{COMMIT[:12]}"


@pytest.mark.unit
@verifies(SWR.SWR_3410, SWR.SWR_3402)
def test_the_hash_comes_from_the_snapshot_not_from_the_requirement_now(
    tmp_path: Path,
) -> None:
    """A requirement edited mid-run cannot silently re-target the evidence."""
    base = tmp_path / "base"
    base.mkdir()
    taken = snapshot()
    edited = requirement().evolve(description="changed after the run started")

    verification = verify_unit(
        snapshot=taken,
        workspace=workspace(tmp_path),
        base_workspace=base,
        run_checks=lambda _tree: PASSING,
        commit=COMMIT,
    )

    assert edited.current_hash != taken.requirement_hash
    assert verification.requirement_hash == taken.requirement_hash


# -- not verified is not verified ------------------------------------------


@pytest.mark.unit
@verifies(SWR.SWR_3410)
def test_a_workspace_with_no_check_suite_is_not_verified(tmp_path: Path) -> None:
    """`None` is a third answer, and it is the honest one here."""
    base = tmp_path / "base"
    base.mkdir()

    verification = verify_unit(
        snapshot=snapshot(),
        workspace=workspace(tmp_path),
        base_workspace=base,
        run_checks=lambda _tree: SuiteRun.not_run(),
        commit=COMMIT,
        at=AT,
    )

    assert verification.verified is None
    assert verification.verified is not False
    assert verification.verdict == "skipped"
    assert verification.detail == NO_SUITE_REASON
    assert verification.to_record().verdict == "skipped"
    assert verification.to_record().passed is False


@pytest.mark.unit
@verifies(SWR.SWR_3410)
def test_a_suite_that_ran_nothing_is_not_a_pass() -> None:
    """`SuiteRun.passed` is positive evidence only, never vacuous truth."""
    assert SuiteRun.not_run().passed is False
    assert SuiteRun(executed=True).passed is True
    assert SuiteRun(executed=True, checks=(CheckOutcome(name="c", status="timeout"),)).passed is (
        False
    )
    assert SuiteRun.not_run("nothing configured").skip_reason == "nothing configured"
    assert SuiteRun.not_run("").skip_reason == NO_SUITE_REASON


# -- a failure names the check and keeps the work --------------------------


@pytest.mark.unit
@verifies(SWR.SWR_3410)
def test_a_failing_check_is_named_and_the_units_work_stays_put(tmp_path: Path) -> None:
    """The user reads which check failed, and the tree is still there to fix it in."""
    base = tmp_path / "base"
    base.mkdir()
    tree = workspace(tmp_path)

    verification = verify_unit(
        snapshot=snapshot(),
        workspace=tree,
        base_workspace=base,
        run_checks=lambda _tree: SuiteRun(
            executed=True,
            checks=(
                CheckOutcome(name="pytest", status="failed"),
                CheckOutcome(name="ruff", status="passed"),
                CheckOutcome(name="slow-suite", status="timeout"),
            ),
        ),
        commit=COMMIT,
        at=AT,
    )

    assert verification.verified is False
    assert verification.verdict == "failed"
    assert [check.name for check in verification.failed_checks] == ["pytest", "slow-suite"]
    assert "pytest" in verification.detail
    assert "slow-suite" in verification.detail
    # Nothing was cleaned up: the worktree is still named, so it can be opened.
    assert verification.worktree_path == tree.path
    assert Path(verification.worktree_path).is_dir()


@pytest.mark.unit
@verifies(SWR.SWR_3410, SWR.SWR_2606)
def test_complete_traceability_with_a_failing_covering_test_is_not_verified(
    tmp_path: Path,
) -> None:
    """A green suite cannot outvote a covering test that failed."""
    base = tmp_path / "base"
    base.mkdir()

    verification = verify_unit(
        snapshot=snapshot(),
        workspace=workspace(tmp_path),
        base_workspace=base,
        run_checks=lambda _tree: PASSING,
        commit=COMMIT,
        coverage=(
            CoverageFinding(req_id=REQ, state="failing"),
            CoverageFinding(req_id="SWR-3405", state="verified"),
        ),
    )

    assert verification.verified is False
    assert [finding.req_id for finding in verification.failing_coverage] == [REQ]
    assert "failing coverage" in verification.detail


@pytest.mark.unit
@verifies(SWR.SWR_3410, SWR.SWR_2606)
def test_coverage_findings_come_from_the_verifiers_own_evidence() -> None:
    """One vocabulary for "not run", shared with SWR-2606 rather than restated."""
    from rotaris_core.verifier.requirement_evidence import TouchedRequirement

    touched = [
        TouchedRequirement(req_id="SWR-1", number=1, coverage_state="not_run"),
        TouchedRequirement(req_id="SWR-2", number=2, coverage_state="verified"),
    ]

    findings = coverage_findings(touched)

    assert [finding.state for finding in findings] == ["not_run", "verified"]
    assert findings[0].verified is False
    assert findings[1].verified is True
    assert findings[0].message == "SWR-1: not run"


@pytest.mark.unit
@verifies(SWR.SWR_3410, SWR.SWR_2602)
def test_the_completion_verifiers_own_run_becomes_a_suite_run() -> None:
    """Composition, not a second runner: whatever SWR-2602 measured lands here."""
    from rotaris_core.verifier.runner import CheckResult, VerifierRunResult

    run = VerifierRunResult(
        executed=True,
        suite_source="config",
        duration_s=12.5,
        results=[
            CheckResult(name="pytest", command="uv run pytest", status="failed", exit_code=1),
            CheckResult(name="ruff", command="uv run ruff check", status="passed"),
        ],
    )

    suite = SuiteRun.from_verifier_run(run)

    assert suite.executed is True
    assert suite.duration_s == 12.5
    assert [check.name for check in suite.checks] == ["pytest", "ruff"]
    assert [check.name for check in suite.failed_checks] == ["pytest"]
    assert suite.passed is False
    assert suite.verdict == "failed"

    skipped = SuiteRun.from_verifier_run(
        VerifierRunResult(
            executed=False,
            suite_source="detection_empty",
            skip_reason="no marker recognised",
        ),
    )
    assert skipped.verdict == "skipped"
    assert skipped.skip_reason == "no marker recognised"


# -- what the completion contract is allowed to read -----------------------


@pytest.mark.unit
@verifies(SWR.SWR_3410, SWR.SWR_3408)
def test_verification_fills_only_the_fields_it_actually_measured() -> None:
    """A verification that never looked at a commit must not grant it."""
    verification = UnitVerification(
        run_id="run-1",
        req_id=REQ,
        unit_id=UNIT,
        worktree_path="/w/unit",
        commit=COMMIT,
        requirement_hash="hash-1",
        suite=PASSING,
        coverage=(CoverageFinding(req_id=REQ, state="verified"),),
    )

    measured = verification.measured()

    assert measured.tests_executed is True
    assert measured.tests_passed is True
    assert measured.traceability_established is True
    assert [check.name for check in measured.checks] == ["pytest", "mypy"]
    # Untouched: these are somebody else's measurement, and an unmeasured
    # obligation stays unmet (SWR-3408).
    assert measured.worktree_clean is False
    assert measured.change_attributable is False
    assert measured.specification_stable is False
    assert measured.reqtocode_current is False

    # An uncovered requirement does not establish traceability.
    uncovered = verification.model_copy(
        update={"coverage": (CoverageFinding(req_id=REQ, state="uncovered"),)},
    )
    assert uncovered.measured().traceability_established is False

    # And an existing measurement is carried forward rather than reset.
    carried = verification.measured(RunnerMeasurements(worktree_clean=True, tests_updated=True))
    assert carried.worktree_clean is True
    assert carried.tests_updated is True
    assert carried.tests_passed is True


@pytest.mark.unit
@verifies(SWR.SWR_3410)
def test_a_verification_names_every_part_of_itself() -> None:
    """An evidence record missing the tree, the commit or the hash is not evidence."""
    with pytest.raises(VerificationError, match="names the run"):
        UnitVerification(
            run_id="run-1",
            req_id=REQ,
            worktree_path="  ",
            commit=COMMIT,
            requirement_hash="hash-1",
        )
    with pytest.raises(VerificationError, match="names the run"):
        UnitVerification(
            run_id="run-1",
            req_id=REQ,
            worktree_path="/w/unit",
            commit=COMMIT,
            requirement_hash="   ",
        )
