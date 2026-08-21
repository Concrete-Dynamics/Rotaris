"""Requirement-coverage evidence (SWR-2606): what a change was accountable to.

Productive scenario: an agent edits a module that implements a requirement. The
question the child report must answer is not "did the suite pass" but "does the
requirement this change served still have named evidence, and did that evidence
actually run this time".

Marker tokens (traces/verifies) are assembled through the T/V constants so this
file's own source carries no scannable reference token — the repository-level
sweep must not pick up synthetic fixtures.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.verifier.requirement_evidence import (
    CoveringTest,
    RequirementEvidence,
    build_iteration_evidence,
    changed_paths,
    check_path_selectors,
    executed_test_runners,
    narrows_selection,
    verdict_for,
)
from rotaris_core.verifier.runner import CheckResult

if TYPE_CHECKING:
    from pathlib import Path

T = "traces"
V = "verifies"


def _write_repo(root: Path, *, with_covering_test: bool = True) -> None:
    """A minimal ReqToCode workspace: two requirements, two traced modules."""
    reqs = root / "docs" / "requirements"
    reqs.mkdir(parents=True)
    for number, title in ((101, "Covered thing"), (102, "Uncovered thing")):
        (reqs / f"SWR-{number}-demo.md").write_text(
            f"---\nreq-id: SWR-{number}\nstatus: approved\ntrace: required\n"
            f'test: required\ntitle: "{title}"\n---\n\nBody.\n',
            encoding="utf-8",
        )
    impl = root / "src" / "rotaris_core"
    impl.mkdir(parents=True)
    (impl / "covered.py").write_text(
        f"@{T}(SWR.SWR_101)\ndef covered() -> None: ...\n",
        encoding="utf-8",
    )
    (impl / "uncovered.py").write_text(
        f"@{T}(SWR.SWR_102)\ndef uncovered() -> None: ...\n",
        encoding="utf-8",
    )
    tests = root / "tests" / "unit"
    tests.mkdir(parents=True)
    if with_covering_test:
        (tests / "test_covered.py").write_text(
            f"@{V}(SWR.SWR_101)\ndef test_covered() -> None: ...\n",
            encoding="utf-8",
        )


def _check(name: str, command: str, status: str = "passed") -> CheckResult:
    return CheckResult(name=name, command=command, status=status)  # type: ignore[arg-type]


PASSING_SUITE = "python -m pytest tests -q"


@verifies(SWR.SWR_2606)
def test_editing_a_traced_module_names_its_requirement_with_title_and_status(
    tmp_path: Path,
) -> None:
    _write_repo(tmp_path)

    evidence = build_iteration_evidence(
        tmp_path,
        ["src/rotaris_core/covered.py"],
        [_check("tests", PASSING_SUITE)],
    )

    assert evidence is not None
    touched = evidence.requirements.requirements
    assert [req.req_id for req in touched] == ["SWR-101"]
    assert (touched[0].number, touched[0].status, touched[0].title) == (
        101,
        "approved",
        "Covered thing",
    )
    # Only the sites inside the changed set: the report explains why *this*
    # requirement is listed, not everything the requirement has ever touched.
    assert [(s.path, s.line) for s in touched[0].implementations] == [
        ("src/rotaris_core/covered.py", 1),
    ]


@verifies(SWR.SWR_2606)
def test_a_covering_test_that_the_suite_ran_is_reported_as_verified(tmp_path: Path) -> None:
    _write_repo(tmp_path)

    evidence = build_iteration_evidence(
        tmp_path,
        ["src/rotaris_core/covered.py"],
        [_check("tests", PASSING_SUITE)],
    )

    assert evidence is not None
    req = evidence.requirements.requirements[0]
    assert req.coverage_state == "verified"
    assert req.is_covered and req.is_verified
    covering = req.covering_tests[0]
    assert (covering.path, covering.line) == ("tests/unit/test_covered.py", 1)
    assert covering.executed is True
    assert (covering.check_name, covering.check_status) == ("tests", "passed")
    assert evidence.requirements.verified_requirements == ["SWR-101"]
    assert evidence.requirements.uncovered_requirements == []
    assert evidence.requirements.unrun_requirements == []


@verifies(SWR.SWR_2606)
def test_a_covering_test_the_suite_never_ran_is_not_the_same_as_a_passing_one(
    tmp_path: Path,
) -> None:
    # The whole point of SWR-2606: the suite is green, but it ran a directory
    # that does not contain this requirement's covering test.
    _write_repo(tmp_path)

    evidence = build_iteration_evidence(
        tmp_path,
        ["src/rotaris_core/covered.py"],
        [_check("tests", "python -m pytest tests/integration -q")],
    )

    assert evidence is not None
    req = evidence.requirements.requirements[0]
    assert req.coverage_state == "not_run"
    assert req.is_covered is True
    assert req.is_verified is False
    covering = req.covering_tests[0]
    assert covering.executed is False
    assert (covering.check_name, covering.check_status) == (None, None)
    assert evidence.requirements.unrun_requirements == ["SWR-101"]


@verifies(SWR.SWR_2606)
def test_a_touched_requirement_with_no_covering_test_is_named_not_counted(
    tmp_path: Path,
) -> None:
    _write_repo(tmp_path)

    evidence = build_iteration_evidence(
        tmp_path,
        ["src/rotaris_core/uncovered.py"],
        [_check("tests", PASSING_SUITE)],
    )

    assert evidence is not None
    assert evidence.requirements.uncovered_requirements == ["SWR-102"]
    req = evidence.requirements.requirements[0]
    assert req.covering_tests == []
    assert req.coverage_state == "uncovered"


@verifies(SWR.SWR_2606)
def test_a_failing_check_leaves_the_requirement_unobserved_rather_than_failing(
    tmp_path: Path,
) -> None:
    """Productive use: a developer's suite goes red somewhere else in the repo.

    Their requirement's own covering test may have passed inside that very run —
    the suite's exit code cannot tell us, and neither can we. So the requirement
    reads *inconclusive*, and is never listed among the failures a reader will go
    and investigate. It is still not verified: unknown does not earn a tick.
    """
    _write_repo(tmp_path)

    evidence = build_iteration_evidence(
        tmp_path,
        ["src/rotaris_core/covered.py"],
        [_check("tests", PASSING_SUITE, status="failed")],
    )

    assert evidence is not None
    req = evidence.requirements.requirements[0]
    assert req.coverage_state == "inconclusive"
    assert req.is_verified is False
    # The check-level fact is still on the record, for the audit trail.
    assert req.covering_tests[0].check_status == "failed"
    # …but it is not read as a statement about this test.
    assert req.covering_tests[0].verdict == "unknown"
    assert evidence.requirements.failing_requirements == []
    assert evidence.requirements.inconclusive_requirements == ["SWR-101"]


@verifies(SWR.SWR_2606)
def test_a_timed_out_suite_accuses_no_test_it_never_observed(
    tmp_path: Path,
) -> None:
    """Productive use: the suite outgrows its budget and is killed part-way.

    The regression this whole tier exists for. A killed run reported every
    covering test in the repository as failed, naming file and line, and a board
    refused 1413 requirements on the strength of it.
    """
    _write_repo(tmp_path)

    evidence = build_iteration_evidence(
        tmp_path,
        ["src/rotaris_core/covered.py"],
        [_check("tests", PASSING_SUITE, status="timeout")],
    )

    assert evidence is not None
    req = evidence.requirements.requirements[0]
    assert req.coverage_state == "inconclusive"
    assert req.covering_tests[0].verdict == "unknown"
    assert evidence.requirements.failing_requirements == []


@verifies(SWR.SWR_2606)
def test_a_green_run_that_selected_a_subset_credits_nothing_it_did_not_run(
    tmp_path: Path,
) -> None:
    """Productive use: someone re-runs one test with ``-k`` and it passes.

    The false positive that mirrors the false negative. The run is green and it
    reached the file, but it chose which tests inside it to run, so it cannot
    stand as evidence for the covering tests it skipped.
    """
    _write_repo(tmp_path)

    evidence = build_iteration_evidence(
        tmp_path,
        ["src/rotaris_core/covered.py"],
        [_check("tests", f"{PASSING_SUITE} -k serialise")],
    )

    assert evidence is not None
    req = evidence.requirements.requirements[0]
    assert req.coverage_state == "inconclusive"
    assert req.is_verified is False


@verifies(SWR.SWR_2606)
def test_a_failing_runner_wins_over_a_passing_one_so_evidence_never_overclaims(
    tmp_path: Path,
) -> None:
    _write_repo(tmp_path)

    evidence = build_iteration_evidence(
        tmp_path,
        ["src/rotaris_core/covered.py"],
        [
            _check("smoke", "pytest tests/unit -q"),
            _check("full", "pytest tests/unit -q", status="failed"),
        ],
    )

    assert evidence is not None
    covering = evidence.requirements.requirements[0].covering_tests[0]
    assert (covering.check_name, covering.check_status) == ("full", "failed")


@verifies(SWR.SWR_2606)
def test_a_lint_check_is_not_evidence_that_a_covering_test_ran(tmp_path: Path) -> None:
    _write_repo(tmp_path)

    evidence = build_iteration_evidence(
        tmp_path,
        ["src/rotaris_core/covered.py"],
        [_check("lint", "ruff check ."), _check("types", "mypy src")],
    )

    assert evidence is not None
    assert evidence.requirements.requirements[0].coverage_state == "not_run"


@verifies(SWR.SWR_2606)
def test_a_skipped_check_is_not_evidence_that_a_covering_test_ran(tmp_path: Path) -> None:
    _write_repo(tmp_path)

    evidence = build_iteration_evidence(
        tmp_path,
        ["src/rotaris_core/covered.py"],
        [_check("tests", PASSING_SUITE, status="skipped")],
    )

    assert evidence is not None
    assert evidence.requirements.requirements[0].coverage_state == "not_run"


@verifies(SWR.SWR_2606)
def test_a_workspace_with_no_requirement_store_yields_not_computed(tmp_path: Path) -> None:
    impl = tmp_path / "src" / "rotaris_core"
    impl.mkdir(parents=True)
    (impl / "plain.py").write_text("def plain() -> None: ...\n", encoding="utf-8")

    assert build_iteration_evidence(tmp_path, ["src/rotaris_core/plain.py"]) is None


@verifies(SWR.SWR_2606)
def test_an_iteration_that_changed_nothing_is_not_computed_and_costs_nothing(
    tmp_path: Path,
) -> None:
    _write_repo(tmp_path)

    assert build_iteration_evidence(tmp_path, []) is None


@verifies(SWR.SWR_2606)
def test_not_computed_is_distinguishable_from_a_change_that_touched_no_requirement(
    tmp_path: Path,
) -> None:
    _write_repo(tmp_path)
    (tmp_path / "src" / "rotaris_core" / "helper.py").write_text(
        "def helper() -> None: ...\n",
        encoding="utf-8",
    )

    evidence = build_iteration_evidence(tmp_path, ["src/rotaris_core/helper.py"])

    # Computed, and the answer is "no requirement" — not the same fact as `None`.
    assert evidence is not None
    assert evidence.requirements.requirements == []
    assert evidence.requirements.changed_files == ["src/rotaris_core/helper.py"]


@verifies(SWR.SWR_2606)
def test_the_evidence_survives_the_json_round_trip_the_report_goes_through(
    tmp_path: Path,
) -> None:
    _write_repo(tmp_path)

    evidence = build_iteration_evidence(
        tmp_path,
        ["src/rotaris_core/covered.py"],
        [_check("tests", PASSING_SUITE)],
    )
    assert evidence is not None

    payload = evidence.requirements.model_dump(mode="json")
    restored = RequirementEvidence.model_validate(payload)

    assert restored == evidence.requirements
    assert restored.requirements[0].coverage_state == "verified"
    assert restored.duration_s >= 0.0


@verifies(SWR.SWR_2606)
def test_changed_paths_normalizes_what_the_report_declared(tmp_path: Path) -> None:
    class _Entry:
        def __init__(self, path: str) -> None:
            self.path = path

    workspace = tmp_path / "ws"
    (workspace / "src").mkdir(parents=True)

    paths = changed_paths(
        workspace,
        [
            _Entry("src\\a.py"),
            _Entry("./src/a.py"),
            _Entry(str(workspace / "src" / "b.py")),
            _Entry("   "),
            _Entry(str(tmp_path / "elsewhere" / "c.py")),
        ],
        [_Entry("src/new.py"), object()],
    )

    # Duplicates collapse, separators normalize, an absolute path inside the
    # workspace becomes repo-relative, and one outside it is dropped rather than
    # reported as though it lived in the repository.
    assert paths == ["src/a.py", "src/b.py", "src/new.py"]


@verifies(SWR.SWR_2606)
def test_check_path_selectors_reads_targets_not_flags() -> None:
    assert check_path_selectors("python -m pytest -q") == []
    assert check_path_selectors("pytest tests/unit -q --timeout=300") == ["tests/unit"]
    assert check_path_selectors('pytest -k "not slow" tests/unit/test_x.py::test_y') == [
        "tests/unit/test_x.py",
    ]
    assert check_path_selectors("ruff check .") == [""]
    # A separator-free token is only a path when the caller knows that directory
    # exists — otherwise `cargo test` would "select" a directory named `test`.
    assert check_path_selectors("pytest tests -q") == []
    assert check_path_selectors("pytest tests -q", {"tests"}) == ["tests"]
    assert check_path_selectors("cargo test", {"tests"}) == []
    # The interpreter is not a target. Reading `.venv/bin/python` as one would
    # make an unfiltered whole-suite run look filtered to nothing.
    assert check_path_selectors(".venv/bin/python -m pytest -q") == []
    assert check_path_selectors("uv run pytest tests/unit") == ["tests/unit"]
    # A runner recognised only by the check's name still drops its program word.
    assert check_path_selectors("./scripts/run-checks.sh --all") == []
    # Selection-flag values are filters, not targets.
    assert check_path_selectors("pytest -k tests/slow", {"tests"}) == []
    # A target path may itself contain a runner name; the boundary is the first
    # runner, not the last, so the real target is not swallowed.
    assert check_path_selectors("pytest /tmp/pytest-of-me/run/tests/unit") == [
        "/tmp/pytest-of-me/run/tests/unit",
    ]


@verifies(SWR.SWR_2606)
def test_an_interpreter_path_is_not_read_as_a_test_selector(tmp_path: Path) -> None:
    _write_repo(tmp_path)

    evidence = build_iteration_evidence(
        tmp_path,
        ["src/rotaris_core/covered.py"],
        [_check("tests", ".venv/bin/python -m pytest -q")],
    )

    assert evidence is not None
    assert evidence.requirements.requirements[0].coverage_state == "verified"


@verifies(SWR.SWR_2606)
def test_an_absolute_test_target_still_matches_the_repo_relative_site(tmp_path: Path) -> None:
    _write_repo(tmp_path)

    evidence = build_iteration_evidence(
        tmp_path,
        ["src/rotaris_core/covered.py"],
        [_check("tests", f"pytest {(tmp_path / 'tests' / 'unit').as_posix()}")],
    )

    assert evidence is not None
    assert evidence.requirements.requirements[0].coverage_state == "verified"


@verifies(SWR.SWR_2606)
def test_an_absolute_target_elsewhere_does_not_count_as_running_the_covering_test(
    tmp_path: Path,
) -> None:
    _write_repo(tmp_path)

    evidence = build_iteration_evidence(
        tmp_path,
        ["src/rotaris_core/covered.py"],
        [_check("tests", f"pytest {(tmp_path / 'tests' / 'integration').as_posix()}")],
    )

    assert evidence is not None
    assert evidence.requirements.requirements[0].coverage_state == "not_run"


@verifies(SWR.SWR_2606)
def test_test_runner_checks_keeps_only_executed_runners() -> None:
    checks = [
        _check("lint", "ruff check ."),
        _check("unit", "pnpm run test"),
        _check("integration", "pytest tests/integration", status="skipped"),
        _check("e2e", "cargo test"),
        _check("smoke tests", "echo verified"),
    ]

    assert [check.name for check in executed_test_runners(checks)] == [
        "unit",
        "e2e",
        "smoke tests",
    ]


# -- the suite-level → test-level step, in isolation (SWR-2606) -------------


@verifies(SWR.SWR_2606)
def test_narrows_selection_separates_choosing_files_from_choosing_tests() -> None:
    """Naming a path is not narrowing; choosing tests inside a file is.

    ``pytest tests/unit`` runs every test in the files it reaches, so a green run
    is evidence for all of them. ``pytest -k name`` does not, and neither does a
    node id — the distinction the two functions divide between them.
    """
    assert not narrows_selection("uv run pytest -q")
    assert not narrows_selection("pytest tests/unit tests/integration")
    # Early exit is not narrowing: it only bites when something fails, and a
    # failing check is already unattributable for every test.
    assert not narrows_selection("pytest -x --maxfail=1 tests/unit")

    assert narrows_selection("pytest -k serialise")
    assert narrows_selection("pytest -m 'not slow'")
    assert narrows_selection("pytest --lf")
    assert narrows_selection("pytest tests/unit/test_store.py::test_one")
    assert narrows_selection("jest --testNamePattern=login")
    assert narrows_selection("go test -run TestParse ./...")


@verifies(SWR.SWR_2606)
def test_verdict_for_licenses_only_what_a_check_actually_observed() -> None:
    """The whole tiering table, in one place.

    A check status is a fact about a process. Only a green unfiltered run carries
    over to "every test in these files passed"; nothing else licenses a claim
    about an individual test.
    """
    assert verdict_for(None) == "not_run"
    assert verdict_for(_check("tests", PASSING_SUITE)) == "passed"
    assert verdict_for(_check("tests", PASSING_SUITE, status="failed")) == "unknown"
    assert verdict_for(_check("tests", PASSING_SUITE, status="timeout")) == "unknown"
    assert verdict_for(_check("tests", PASSING_SUITE, status="skipped")) == "not_run"
    assert verdict_for(_check("tests", f"{PASSING_SUITE} -k one")) == "unknown"


@verifies(SWR.SWR_2606)
def test_a_record_written_before_verdicts_existed_reads_honestly() -> None:
    """Productive use: a store written by the previous version is opened today.

    Repair on read, and the reason there is no migration to run first: every
    verification already on disk carries a check status and no verdict, and those
    are exactly the records that read a killed suite as a per-test failure.
    """
    killed = CoveringTest.model_validate(
        {
            "path": "tests/unit/test_child_manager.py",
            "line": 32,
            "executed": True,
            "check_name": "pytest",
            "check_status": "timeout",
        },
    )
    assert killed.verdict == "unknown"

    green = CoveringTest.model_validate(
        {
            "path": "tests/unit/test_child_manager.py",
            "line": 32,
            "executed": True,
            "check_name": "pytest",
            "check_status": "passed",
        },
    )
    assert green.verdict == "passed"

    # A record that never ran keeps saying so.
    unrun = CoveringTest.model_validate(
        {"path": "tests/unit/test_child_manager.py", "line": 32, "executed": False},
    )
    assert unrun.verdict == "not_run"


# -- a report turns the floor back into precision (SWR-2622) ----------------


def _reporting_check(name: str, command: str, *, status: str, cases: list[dict]) -> CheckResult:
    """A check that produced a per-test report, as the runner attaches one."""
    from rotaris_core.verifier.test_results import TestRunReport

    return CheckResult(
        name=name,
        command=command,
        status=status,  # type: ignore[arg-type]
        report=TestRunReport.model_validate({"cases": cases, "complete": True}),
    )


@verifies(SWR.SWR_2622, SWR.SWR_2606)
def test_a_red_suite_with_a_report_names_the_broken_test_and_verifies_the_rest(
    tmp_path: Path,
) -> None:
    """Productive use: one test breaks and the suite goes red.

    Without a report every requirement the run touched reads `unknown`, which is
    honest and nearly as unhelpful as the false failures it replaced. With one —
    and nearly every runner can write one — the board says which test broke.
    """
    _write_repo(tmp_path)

    covered = _reporting_check(
        "tests",
        PASSING_SUITE,
        status="failed",
        cases=[
            {
                "file": "tests/unit/test_covered.py",
                "name": "test_covered",
                "line": 1,
                "outcome": "failed",
            },
        ],
    )
    evidence = build_iteration_evidence(
        tmp_path,
        ["src/rotaris_core/covered.py"],
        [covered],
    )

    assert evidence is not None
    req = evidence.requirements.requirements[0]
    assert req.coverage_state == "failing"
    assert req.covering_tests[0].verdict == "failed"
    assert evidence.requirements.failing_requirements == ["SWR-101"]


@verifies(SWR.SWR_2622, SWR.SWR_2606)
def test_a_report_that_clears_this_test_verifies_it_even_though_the_suite_is_red(
    tmp_path: Path,
) -> None:
    """The other half, and the one that makes a red suite usable again.

    This requirement's test ran and passed inside a run that failed elsewhere.
    The suite is still red — the completion gate answers that separately — but
    this requirement is no longer punished for somebody else's failure.
    """
    _write_repo(tmp_path)

    covered = _reporting_check(
        "tests",
        PASSING_SUITE,
        status="failed",
        cases=[
            {
                "file": "tests/unit/test_covered.py",
                "name": "test_covered",
                "line": 1,
                "outcome": "passed",
            },
        ],
    )
    evidence = build_iteration_evidence(
        tmp_path,
        ["src/rotaris_core/covered.py"],
        [covered],
    )

    assert evidence is not None
    assert evidence.requirements.requirements[0].coverage_state == "verified"
