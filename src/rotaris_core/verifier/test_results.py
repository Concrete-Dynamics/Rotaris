"""Per-test results, however this project's runner reports them (SWR-2622).

SWR-2606 settled what a check *status* licenses us to say about one test, and the
honest answer without a per-test observation is ``unknown``. This module supplies
the observation, so that a red suite says *which* test is red instead of going
quiet about all of them.

Everything downstream reads one value — :class:`TestRunReport` — and nothing
downstream knows which of several ways it was obtained. Today that is built-in
parsers; SWR-2623 adds an authored adapter behind the same port and changes
nothing here.

**Chosen by artefact shape, not by language.** JUnit XML is the format almost
every runner can already emit — pytest, jest, vitest, cargo-nextest,
gradle/surefire, rspec, phpunit, ctest, dotnet — and the JSON streams of ``go
test -json`` and ``cargo test --message-format=json`` cover most of the rest.
Selection asks "can this be parsed" rather than "is this a Python project",
which is what makes the module work on a repository nobody has seen.

**The user's command is never mutated.** A report path already named in the
command is used, and otherwise conventional locations are scanned — restricted to
files written *during the check's own run*, so an artefact left over from last
week can never be read as this run's evidence. Making a runner emit a report it
does not emit today is a change to the workspace's gate, and gates are written by
their owners (SWR-2614), not by the code that reads them.

**Two safety rules, both about not over-claiming.** A report can only ever say
which tests a run observed; it cannot overrule the suite's own verdict, which the
completion gate answers separately (SWR-2604). And a report that does not account
for the whole selection (``complete=False``) may *narrow* — name the failures it
saw — but may never promote a test it did not name to verified.
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import PurePosixPath
from typing import TYPE_CHECKING, Literal, Self
from xml.etree import ElementTree

from pydantic import BaseModel, ConfigDict, model_validator

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Iterable, Sequence
    from pathlib import Path

_log = logging.getLogger(__name__)

__all__ = [
    "PRUNED_DIRS",
    "TestCaseResult",
    "TestOutcome",
    "TestRunReport",
    "collect_test_report",
    "parse_test_report",
    "rebased",
    "report_verdict",
]

#: What happened to one test case. ``errored`` is kept apart from ``failed``
#: because a collection error is a different repair from an assertion, and every
#: format this module reads distinguishes them.
TestOutcome = Literal["passed", "failed", "skipped", "errored"]

#: Outcomes that mean the test did not pass.
_NOT_PASSED: frozenset[str] = frozenset({"failed", "errored"})

#: Directories a report is never in and a walk must never descend into. A
#: workspace can hold git worktrees, virtualenvs and dependency trees, each of
#: them larger than the project; an unpruned recursive scan across them costs more
#: than the check it is trying to describe.
PRUNED_DIRS: frozenset[str] = frozenset(
    {
        ".git",
        ".hg",
        ".svn",
        ".venv",
        "venv",
        "node_modules",
        "__pycache__",
        ".mypy_cache",
        ".ruff_cache",
        ".pytest_cache",
        ".tox",
        ".nox",
        ".rotaris",
        ".claude",
        "dist",
        "site-packages",
    },
)

#: Where runners conventionally leave a report, relative to the workspace root.
#: Deliberately a **bounded** list of directories rather than a recursive glob:
#: breadth here is worth having, and a `**` walk of an arbitrary user workspace is
#: not — it is unbounded work on every check, including checks that run no tests.
_REPORT_DIRS: tuple[str, ...] = (
    "",
    "reports",
    "test-results",
    "test_results",
    "build/test-results",
    "target/nextest",
    "target/nextest/default",
    "build/reports/tests",
)

#: File names, inside those directories, that look like a test report.
_REPORT_NAME_RE = re.compile(
    r"^(?:junit.*|report.*|test-results?.*|TEST-.*|results?)\.(?:xml|json|jsonl)$",
    re.IGNORECASE,
)

#: How deep below a listed directory to look. One level covers the
#: `build/test-results/test/TEST-*.xml` and `surefire-reports/*.xml` shapes without
#: turning into a tree walk.
_REPORT_DEPTH = 2

#: Flags whose value names where a report is written. Read rather than injected:
#: a command already asking for a report is telling us where to look.
_REPORT_FLAGS: tuple[str, ...] = (
    "--junitxml",
    "--junit-xml",
    "--report-log",
    "--log-junit",
    "--output-junit",
    "--reporter-options",
)

_REPORT_FLAG_RE = re.compile(
    r"(?:" + "|".join(re.escape(flag) for flag in _REPORT_FLAGS) + r")[=\s]+(\S+)",
)


@traces(SWR.SWR_2622)
class TestCaseResult(BaseModel):
    """One test, and what the run did with it."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    #: These names start with ``Test`` because that is what they are about, and
    #: pytest would otherwise try to collect them as test classes.
    __test__ = False

    #: Repository-relative posix path, when the runner reported one.
    file: str = ""
    #: The test's own name, when the runner reported one.
    name: str = ""
    line: int | None = None
    outcome: TestOutcome
    duration_s: float = 0.0

    @model_validator(mode="after")
    def _addressable(self) -> Self:
        if not self.file.strip() and not self.name.strip():
            raise ValueError(
                "a test result names a file, a test, or both; one that names"
                " neither cannot be attributed to anything (SWR-2622)",
            )
        return self

    @property
    def passed(self) -> bool:
        """Whether this case is evidence *for* the thing it covers."""
        return self.outcome == "passed"


@traces(SWR.SWR_2622)
class TestRunReport(BaseModel):
    """Every case one check reported, and whether that is all of them."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    __test__ = False

    check_name: str = ""
    cases: tuple[TestCaseResult, ...] = ()
    #: Whether the report accounts for the whole selection the runner was given.
    #: ``False`` restricts it to narrowing: a case it does not name stays
    #: unobserved rather than becoming verified.
    complete: bool = False
    #: Which reader produced this, carried so a board can say where a verdict
    #: came from and a bad adapter can be found by name.
    adapter: str = ""

    @property
    def files(self) -> frozenset[str]:
        """Every file this report says something about."""
        return frozenset(case.file for case in self.cases if case.file)

    def cases_in(self, file: str) -> tuple[TestCaseResult, ...]:
        """The cases reported for *file*."""
        return tuple(case for case in self.cases if case.file == file)


# --------------------------------------------------------------------------
# Parsing — one function per artefact shape, all returning the same value
# --------------------------------------------------------------------------


def _posix(path: str, *, root: Path | None) -> str:
    """*path* as a repository-relative posix path, when it can be made one."""
    cleaned = path.strip().replace("\\", "/")
    if not cleaned:
        return ""
    pure = PurePosixPath(cleaned)
    if not pure.is_absolute() or root is None:
        return str(pure)
    try:
        return str(PurePosixPath(cleaned).relative_to(PurePosixPath(root.as_posix())))
    except ValueError:
        return str(pure)


def _junit_outcome(case: ElementTree.Element) -> TestOutcome:
    if case.find("failure") is not None:
        return "failed"
    if case.find("error") is not None:
        return "errored"
    if case.find("skipped") is not None:
        return "skipped"
    return "passed"


@traces(SWR.SWR_2622)
def _parse_junit(text: str, *, root: Path | None) -> tuple[TestCaseResult, ...]:
    """JUnit XML — the format nearly every runner can already produce.

    ``file`` and ``line`` are read where the runner supplied them (pytest does)
    and left empty where it did not (many do not), which is exactly what the
    matching ladder in :func:`report_verdict` degrades over.
    """
    try:
        root_element = ElementTree.fromstring(text)  # noqa: S314 - local build artefact
    except ElementTree.ParseError:
        return ()
    cases: list[TestCaseResult] = []
    for case in root_element.iter("testcase"):
        name = (case.get("name") or "").strip()
        file = _posix(case.get("file") or "", root=root)
        if not name and not file:
            continue
        raw_line = case.get("line")
        try:
            line = int(raw_line) + 1 if raw_line is not None else None
        except ValueError:
            line = None
        try:
            duration = float(case.get("time") or 0.0)
        except ValueError:
            duration = 0.0
        cases.append(
            TestCaseResult(
                file=file,
                name=name,
                line=line,
                outcome=_junit_outcome(case),
                duration_s=duration,
            ),
        )
    return tuple(cases)


@traces(SWR.SWR_2622)
def _parse_go_json(text: str, *, root: Path | None) -> tuple[TestCaseResult, ...]:
    """``go test -json`` — one JSON object per line, terminal actions only."""
    outcomes: dict[str, TestOutcome] = {"pass": "passed", "fail": "failed", "skip": "skipped"}
    cases: list[TestCaseResult] = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped.startswith("{"):
            continue
        try:
            event = json.loads(stripped)
        except ValueError:
            continue
        if not isinstance(event, dict):
            continue
        action = str(event.get("Action", ""))
        name = str(event.get("Test", "")).strip()
        if action not in outcomes or not name:
            continue
        package = str(event.get("Package", "")).strip()
        cases.append(
            TestCaseResult(
                file=_posix(package, root=root) if "/" in package else "",
                name=name,
                outcome=outcomes[action],
                duration_s=float(event.get("Elapsed", 0.0) or 0.0),
            ),
        )
    return tuple(cases)


@traces(SWR.SWR_2622)
def _parse_cargo_json(text: str, *, root: Path | None) -> tuple[TestCaseResult, ...]:
    """``cargo test --message-format=json`` — libtest's own event stream."""
    del root  # libtest reports module paths, never files.
    outcomes: dict[str, TestOutcome] = {"ok": "passed", "failed": "failed", "ignored": "skipped"}
    cases: list[TestCaseResult] = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped.startswith("{"):
            continue
        try:
            event = json.loads(stripped)
        except ValueError:
            continue
        if not isinstance(event, dict) or event.get("type") != "test":
            continue
        name = str(event.get("name", "")).strip()
        event_kind = str(event.get("event", ""))
        if not name or event_kind not in outcomes:
            continue
        cases.append(TestCaseResult(name=name, outcome=outcomes[event_kind]))
    return tuple(cases)


@traces(SWR.SWR_2622)
def _parse_pytest_report_log(text: str, *, root: Path | None) -> tuple[TestCaseResult, ...]:
    """pytest ``--report-log`` — JSONL, one record per phase.

    Only the ``call`` phase decides a test's outcome; ``setup`` and ``teardown``
    carry errors, which is a different thing from a failing assertion and is
    reported as such.
    """
    outcomes: dict[str, TestOutcome] = {
        "passed": "passed",
        "failed": "failed",
        "skipped": "skipped",
    }
    cases: list[TestCaseResult] = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped.startswith("{"):
            continue
        try:
            record = json.loads(stripped)
        except ValueError:
            continue
        if not isinstance(record, dict) or record.get("$report_type") != "TestReport":
            continue
        node_id = str(record.get("nodeid", "")).strip()
        when = str(record.get("when", ""))
        outcome = outcomes.get(str(record.get("outcome", "")))
        if not node_id or outcome is None:
            continue
        if when != "call" and outcome == "passed":
            continue
        file, _, name = node_id.partition("::")
        cases.append(
            TestCaseResult(
                file=_posix(file, root=root),
                name=name or node_id,
                outcome="errored" if when != "call" and outcome == "failed" else outcome,
            ),
        )
    return tuple(cases)


#: Every reader, by the name that lands in ``TestRunReport.adapter``. Tried in
#: order; the first that yields a case wins, because an artefact that parses as
#: one format does not parse as another.
_PARSERS = (
    ("junit-xml", _parse_junit),
    ("pytest-report-log", _parse_pytest_report_log),
    ("go-json", _parse_go_json),
    ("cargo-json", _parse_cargo_json),
)


@traces(SWR.SWR_2622)
def parse_test_report(
    text: str,
    *,
    check_name: str = "",
    root: Path | None = None,
    complete: bool = True,
) -> TestRunReport | None:
    """The report *text* holds, or ``None`` when nothing could read it.

    ``None`` is the honest answer for an artefact this module does not recognise,
    and it degrades exactly to the SWR-2606 floor rather than to a guess.
    """
    for adapter, parse in _PARSERS:
        cases = parse(text, root=root)
        if cases:
            return TestRunReport(
                check_name=check_name,
                cases=cases,
                complete=complete,
                adapter=adapter,
            )
    return None


# --------------------------------------------------------------------------
# Discovery — find what the check already wrote, and never write the command
# --------------------------------------------------------------------------


def _named_report_paths(command: str) -> tuple[str, ...]:
    """Report paths the command itself names."""
    return tuple(match.group(1).strip("'\"") for match in _REPORT_FLAG_RE.finditer(command))


def _report_files_under(directory: Path, depth: int) -> Iterable[Path]:
    """Report-shaped files at or just below *directory*, pruning what cannot hold one."""
    if depth < 0:
        return
    try:
        entries = sorted(directory.iterdir())
    except OSError:
        return
    for entry in entries:
        try:
            if entry.is_dir():
                if entry.name not in PRUNED_DIRS:
                    yield from _report_files_under(entry, depth - 1)
            elif _REPORT_NAME_RE.match(entry.name):
                yield entry
        except OSError:
            continue


def _candidate_paths(root: Path, command: str) -> Iterable[Path]:
    """Every artefact that could be this check's report.

    Bounded on purpose. This runs after every check in every workspace, so it may
    not cost more than glancing at the handful of places a report is actually
    written — and a user's workspace can contain git worktrees and virtualenvs
    that dwarf the project itself.
    """
    for named in _named_report_paths(command):
        candidate = root / named
        try:
            if candidate.is_file():
                yield candidate
        except OSError:
            continue
    for relative in _REPORT_DIRS:
        directory = root / relative if relative else root
        # The root itself is only glanced at; the named directories are the ones
        # worth descending into.
        yield from _report_files_under(directory, 0 if not relative else _REPORT_DEPTH)


@traces(SWR.SWR_2622)
def collect_test_report(
    root: Path,
    command: str,
    *,
    check_name: str = "",
    written_after: float | None = None,
) -> TestRunReport | None:
    """The per-test report *command* produced in *root*, if it produced one.

    *written_after* is the moment the check started, as an ``st_mtime``. It is
    what stops a stale artefact — a report from last week's run, or from a
    different check — being read as this run's evidence, which would be a far
    worse failure than having no report at all: it would attribute confident
    per-test verdicts to a run that never produced them.

    Never raises. An unreadable tree, an unparseable artefact and no artefact at
    all are one answer here, and it is the SWR-2606 floor.
    """
    best: TestRunReport | None = None
    for path in _candidate_paths(root, command):
        try:
            if written_after is not None and path.stat().st_mtime < written_after:
                continue
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        report = parse_test_report(text, check_name=check_name, root=root)
        if report is None:
            continue
        if best is None or len(report.cases) > len(best.cases):
            best = report
    return best


@traces(SWR.SWR_2622, SWR.SWR_2618)
def rebased(report: TestRunReport, prefix: str) -> TestRunReport:
    """*report*, with case paths moved from a sub-project's root to the workspace's.

    A check that runs in a sub-project writes a report whose paths are relative to
    that sub-project, and every covering-test site it will be matched against is
    relative to the workspace. Without this the two never meet and a sub-project's
    tests read as unobserved (SWR-2606) forever — silently, which is the worst
    way for attribution to fail.
    """
    if not prefix:
        return report
    base = PurePosixPath(prefix)
    return report.model_copy(
        update={
            "cases": tuple(
                case.model_copy(update={"file": str(base / case.file)}) if case.file else case
                for case in report.cases
            ),
        },
    )


# --------------------------------------------------------------------------
# Attribution — from a report to one covering test's verdict
# --------------------------------------------------------------------------


@traces(SWR.SWR_2622, SWR.SWR_2606)
def report_verdict(
    report: TestRunReport | None,
    *,
    test_path: str,
    line: int | None = None,
    name: str = "",
) -> Literal["passed", "failed", "unknown"] | None:
    """What *report* says about one covering test, or ``None`` if it says nothing.

    The matching ladder, most specific first:

    1. ``(file, name)`` — exact, when both the report and the site carry a name;
    2. ``(file, line)`` — exact, when the runner reported line numbers;
    3. ``file`` — the file was reported and this test is somewhere in it.

    Rung 3 is where the care is. A file whose report contains a failure has *some*
    failing test in it, not necessarily this one, so it answers ``unknown`` rather
    than ``failed``. Blaming every test in a red file would be the same defect
    SWR-2606 removed, one level down.

    An incomplete report may narrow but never credit: a test it does not name
    stays unobserved, because a partial run's silence is not a pass.
    """
    if report is None or not test_path:
        return None
    in_file = report.cases_in(test_path)
    if not in_file:
        return None

    if name:
        exact = [case for case in in_file if case.name == name]
        if exact:
            return "passed" if all(case.passed for case in exact) else "failed"
    if line is not None:
        at_line = [case for case in in_file if case.line == line]
        if at_line:
            return "passed" if all(case.passed for case in at_line) else "failed"

    # File-level only. A failure somewhere in this file is not a failure *here*.
    if any(case.outcome in _NOT_PASSED for case in in_file):
        return "unknown"
    if not report.complete:
        return "unknown"
    return "passed" if all(case.passed or case.outcome == "skipped" for case in in_file) else None


@traces(SWR.SWR_2622)
def reports_of(checks: Sequence[object]) -> dict[str, TestRunReport]:
    """Every report carried by *checks*, keyed by check name."""
    found: dict[str, TestRunReport] = {}
    for check in checks:
        report = getattr(check, "report", None)
        if isinstance(report, TestRunReport):
            found[str(getattr(check, "name", ""))] = report
    return found
