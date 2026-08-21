"""Productive use: a developer's suite goes red for one broken test.

SWR-2606 made the honest floor "nobody observed these", which stopped a killed run
accusing 8329 tests. On its own that leaves a red suite saying nothing about any
of its requirements. Expected outcome: where the runner already wrote a report —
and nearly every runner can — the board names the test that broke and verifies the
rest, and where it did not, nothing is invented.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.verifier.test_results import (
    TestRunReport,
    collect_test_report,
    parse_test_report,
    report_verdict,
)

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.unit

JUNIT = """<?xml version="1.0" encoding="utf-8"?>
<testsuites><testsuite name="pytest" tests="3">
  <testcase classname="tests.unit.test_store" name="test_writes"
            file="tests/unit/test_store.py" line="30" time="0.01"/>
  <testcase classname="tests.unit.test_store" name="test_reads"
            file="tests/unit/test_store.py" line="41" time="0.02">
    <failure message="assert 1 == 2">boom</failure>
  </testcase>
  <testcase classname="tests.unit.test_store" name="test_skipped"
            file="tests/unit/test_store.py" line="55">
    <skipped message="no"/>
  </testcase>
</testsuite></testsuites>
"""

GO_JSON = """
{"Action":"run","Package":"example.com/pkg","Test":"TestParse"}
{"Action":"pass","Package":"example.com/pkg","Test":"TestParse","Elapsed":0.02}
{"Action":"fail","Package":"example.com/pkg","Test":"TestRender","Elapsed":0.01}
"""

CARGO_JSON = """
{"type":"suite","event":"started","test_count":2}
{"type":"test","name":"store::writes","event":"ok"}
{"type":"test","name":"store::reads","event":"failed"}
"""

REPORT_LOG = """
{"$report_type":"TestReport","nodeid":"tests/unit/test_store.py::test_writes",\
"when":"call","outcome":"passed"}
{"$report_type":"TestReport","nodeid":"tests/unit/test_store.py::test_reads",\
"when":"call","outcome":"failed"}
"""


# -- one value, whatever the runner wrote (SWR-2622) ------------------------


@verifies(SWR.SWR_2622)
def test_junit_xml_parses_to_files_names_lines_and_outcomes() -> None:
    """The format nearly every runner can already emit, and the richest one."""
    report = parse_test_report(JUNIT, check_name="pytest")

    assert report is not None
    assert report.adapter == "junit-xml"
    outcomes = {case.name: case.outcome for case in report.cases}
    assert outcomes == {"test_writes": "passed", "test_reads": "failed", "test_skipped": "skipped"}
    assert report.files == {"tests/unit/test_store.py"}
    # JUnit line numbers are 0-based; a covering-test site is not.
    assert {case.name: case.line for case in report.cases}["test_writes"] == 31


@verifies(SWR.SWR_2622)
@pytest.mark.parametrize(
    ("text", "adapter", "failing"),
    [
        (GO_JSON, "go-json", "TestRender"),
        (CARGO_JSON, "cargo-json", "store::reads"),
        (REPORT_LOG, "pytest-report-log", "test_reads"),
    ],
)
def test_every_built_in_format_reaches_the_same_port(
    text: str,
    adapter: str,
    failing: str,
) -> None:
    """Selection is by artefact shape, not by the language of the project."""
    report = parse_test_report(text)

    assert report is not None
    assert report.adapter == adapter
    assert [case.name for case in report.cases if not case.passed] == [failing]


@verifies(SWR.SWR_2622)
def test_an_unreadable_artefact_is_no_report_rather_than_a_guess() -> None:
    """`None` degrades exactly to the SWR-2606 floor."""
    assert parse_test_report("this is not a report") is None
    assert parse_test_report("<xml><not-a-suite/></xml>") is None
    assert parse_test_report("") is None


# -- discovery, without ever touching the user's command (SWR-2622) ---------


@verifies(SWR.SWR_2622)
def test_a_report_the_check_just_wrote_is_found(tmp_path: Path) -> None:
    """Productive use: a project whose CI config already asks for JUnit output."""
    (tmp_path / "reports").mkdir()
    (tmp_path / "reports" / "junit.xml").write_text(JUNIT, encoding="utf-8")

    report = collect_test_report(tmp_path, "pytest -q", check_name="pytest")

    assert report is not None
    assert report.check_name == "pytest"
    assert len(report.cases) == 3


@verifies(SWR.SWR_2622)
def test_a_report_named_by_the_command_is_used(tmp_path: Path) -> None:
    """A command already asking for a report is telling us where to look."""
    (tmp_path / "out.xml").write_text(JUNIT, encoding="utf-8")

    report = collect_test_report(tmp_path, "pytest -q --junitxml=out.xml")

    assert report is not None


@verifies(SWR.SWR_2622)
def test_the_scan_never_descends_into_a_worktree_or_a_virtualenv(tmp_path: Path) -> None:
    """This runs after every check, so it may not cost more than a glance.

    A real workspace holds git worktrees, virtualenvs and dependency trees, each
    larger than the project. An unpruned recursive scan across them took a board
    action from 55s to over 120s — the regression this pins.
    """
    buried = tmp_path / ".rotaris" / "requirements" / "worktrees" / "unit-a" / "reports"
    buried.mkdir(parents=True)
    (buried / "junit.xml").write_text(JUNIT, encoding="utf-8")
    vendored = tmp_path / "node_modules" / "pkg" / "reports"
    vendored.mkdir(parents=True)
    (vendored / "junit.xml").write_text(JUNIT, encoding="utf-8")

    assert collect_test_report(tmp_path, "pytest -q") is None


@verifies(SWR.SWR_2622)
def test_an_artefact_older_than_the_run_is_never_read_as_its_evidence(
    tmp_path: Path,
) -> None:
    """Productive use: last week's report is still sitting in the tree.

    Worse than having no report: it would attach confident per-test verdicts to a
    run that never produced them.
    """
    stale = tmp_path / "junit.xml"
    stale.write_text(JUNIT, encoding="utf-8")
    import os

    os.utime(stale, (1_000_000, 1_000_000))

    assert collect_test_report(tmp_path, "pytest -q", written_after=2_000_000) is None
    # …and without the bound it is read, which is what makes the bound the guard.
    assert collect_test_report(tmp_path, "pytest -q") is not None


# -- the matching ladder, and where it refuses to guess (SWR-2622) ----------


@verifies(SWR.SWR_2622, SWR.SWR_2606)
def test_a_named_case_answers_exactly() -> None:
    """The precise rung: this test, by name, in this file."""
    report = parse_test_report(JUNIT)
    assert report is not None

    assert (
        report_verdict(report, test_path="tests/unit/test_store.py", name="test_reads") == "failed"
    )
    assert (
        report_verdict(report, test_path="tests/unit/test_store.py", name="test_writes") == "passed"
    )


@verifies(SWR.SWR_2622, SWR.SWR_2606)
def test_a_line_answers_when_the_runner_reported_one() -> None:
    """The second rung, for a site the sweep knows by position."""
    report = parse_test_report(JUNIT)
    assert report is not None

    assert report_verdict(report, test_path="tests/unit/test_store.py", line=42) == "failed"
    assert report_verdict(report, test_path="tests/unit/test_store.py", line=31) == "passed"


@verifies(SWR.SWR_2622, SWR.SWR_2606)
def test_a_file_level_failure_blames_no_individual_test() -> None:
    """The over-blame SWR-2606 removed must not reappear one level down.

    The file has a failure in it. This test is somewhere in that file. Those two
    facts do not make *this* test the failing one.
    """
    report = parse_test_report(JUNIT)
    assert report is not None

    assert report_verdict(report, test_path="tests/unit/test_store.py") == "unknown"


@verifies(SWR.SWR_2622)
def test_an_incomplete_report_may_narrow_but_never_credit() -> None:
    """A partial run's silence about a test is not a pass."""
    partial = TestRunReport.model_validate(
        {
            "cases": [
                {"file": "tests/unit/test_store.py", "name": "test_writes", "outcome": "passed"},
            ],
            "complete": False,
        },
    )

    # Named, so observed, so answered.
    assert (
        report_verdict(partial, test_path="tests/unit/test_store.py", name="test_writes")
        == "passed"
    )
    # Not named: unobserved, whatever else the report saw in that file.
    assert report_verdict(partial, test_path="tests/unit/test_store.py") == "unknown"


@verifies(SWR.SWR_2622)
def test_a_report_that_says_nothing_about_this_file_answers_nothing() -> None:
    """`None` hands the question back to the check status (SWR-2606)."""
    report = parse_test_report(JUNIT)

    assert report_verdict(report, test_path="tests/unit/test_other.py") is None
    assert report_verdict(None, test_path="tests/unit/test_store.py") is None
