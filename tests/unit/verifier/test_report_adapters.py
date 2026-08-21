"""Productive use: a user points Rotaris at a project whose runner it has never
seen, and whose `make test` wrapper no flag can be injected into.

Expected outcome: a known runner is handled for free; an unfamiliar one is
described by an agent and bound only after the description has been *run* and
checked against a fact measured independently of it; and a description that
cannot survive that check is refused rather than believed.

No model runs here. Every agent answer is scripted, exactly as
`test_source_discovery_agent.py` does for the sibling port — the pattern this
mirrors (SWR-3106, SWR-3121).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.verifier.report_adapters import (
    ProbeAnalyst,
    ProposalKind,
    ReportProposal,
    ValidationIssueKind,
    bound_report,
    discover_report_adapter,
    validate_report_proposal,
)
from rotaris_core.verifier.runner import CheckResult

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.unit

JUNIT_ONE_FAILURE = """<?xml version="1.0"?>
<testsuite name="s">
  <testcase name="test_writes" file="tests/test_store.py" line="9"/>
  <testcase name="test_reads" file="tests/test_store.py" line="20">
    <failure message="nope">boom</failure>
  </testcase>
</testsuite>
"""

JUNIT_ALL_GREEN = """<?xml version="1.0"?>
<testsuite name="s">
  <testcase name="test_writes" file="tests/test_store.py" line="9"/>
</testsuite>
"""


def _check(
    command: str = "make test", *, status: str = "failed", output: str = "2 failed"
) -> CheckResult:
    return CheckResult(
        name="tests",
        command=command,
        status=status,  # type: ignore[arg-type]
        output_excerpt=output,
    )


def _workspace(tmp_path: Path) -> Path:
    (tmp_path / "tests").mkdir()
    (tmp_path / "tests" / "test_store.py").write_text("", encoding="utf-8")
    return tmp_path


class ScriptedAnalyst:
    """An analyst whose judgement the test writes, counting its calls.

    Carries ``consults_a_model`` so the ladder treats it the way it treats the
    real one — the guard that keeps an empty check from costing a model call is
    keyed on this and not on a class name.
    """

    consults_a_model = True

    def __init__(self, proposal: ReportProposal | None, *, label: str = "scripted") -> None:
        self._proposal = proposal
        self.label = label
        self.unavailable_reason = "" if proposal is not None else "nothing to say"
        self.calls = 0

    def propose(self, check: CheckResult) -> ReportProposal | None:
        del check
        self.calls += 1
        return self._proposal


def _runner(text: str, *, exit_code: int = 1, writes: Path | None = None):
    """A command runner that writes *text* where the proposal said it would."""

    def run(command: str) -> tuple[int, str]:
        del command
        if writes is not None:
            writes.parent.mkdir(parents=True, exist_ok=True)
            writes.write_text(text, encoding="utf-8")
            return exit_code, ""
        return exit_code, text

    return run


# -- the ladder: determinism first, a model only where it ran out ------------


@verifies(SWR.SWR_2623)
def test_a_known_runner_is_handled_without_consulting_a_model(tmp_path: Path) -> None:
    """Productive use: an ordinary pytest project. It must cost nothing."""
    root = _workspace(tmp_path)
    agent = ScriptedAnalyst(None)

    outcome = discover_report_adapter(
        root,
        _check("uv run pytest -q"),
        [ProbeAnalyst(), agent],
        _runner(JUNIT_ONE_FAILURE, writes=root / ".rotaris/verifier/probe-report.xml"),
    )

    assert outcome.is_acceptable
    assert outcome.proposal is not None
    assert "--junitxml" in outcome.proposal.command
    assert agent.calls == 0


@verifies(SWR.SWR_2623)
def test_an_unfamiliar_wrapper_reaches_the_agent_and_its_answer_is_bound(
    tmp_path: Path,
) -> None:
    """Productive use: `make test`, which no flag can be injected into.

    The gap the whole tier exists for — and the answer re-enters the ordinary
    path as a proposal that has to validate like any other.
    """
    root = _workspace(tmp_path)
    agent = ScriptedAnalyst(
        ReportProposal(
            command="make test REPORT=out.xml",
            report_path="out.xml",
            author="gatekeeper",
        ),
    )

    outcome = discover_report_adapter(
        root,
        _check("make test"),
        [ProbeAnalyst(), agent],
        _runner(JUNIT_ONE_FAILURE, writes=root / "out.xml"),
    )

    assert agent.calls == 1
    assert outcome.is_acceptable
    assert [attempt.label for attempt in outcome.attempts] == ["probe", "scripted"]
    assert [attempt.accepted for attempt in outcome.attempts] == [False, True]


@verifies(SWR.SWR_2623)
def test_a_check_that_produced_no_output_never_costs_a_model_call(tmp_path: Path) -> None:
    """There is nothing to read, so a model could only invent an answer."""
    root = _workspace(tmp_path)
    agent = ScriptedAnalyst(ReportProposal(command="whatever", report_path="out.xml"))

    outcome = discover_report_adapter(
        root,
        _check("./run-tests.sh", output=""),
        [ProbeAnalyst(), agent],
        _runner(JUNIT_ONE_FAILURE),
    )

    assert agent.calls == 0
    assert not outcome.is_acceptable
    assert any("nothing to read" in attempt.note for attempt in outcome.attempts)


# -- validated by running it, and by one fact it cannot influence ------------


@verifies(SWR.SWR_2623)
def test_a_proposal_that_produces_nothing_readable_is_refused(tmp_path: Path) -> None:
    """Plausible and useless is the commonest way a mapping gets adopted."""
    root = _workspace(tmp_path)

    validation = validate_report_proposal(
        root,
        _check(),
        ReportProposal(command="make test", report_path=""),
        _runner("Ran 12 tests. 2 failed."),
    )

    assert not validation.ok
    assert validation.issues[0][0] is ValidationIssueKind.NOTHING_PARSED


@verifies(SWR.SWR_2623)
def test_a_report_contradicting_a_passing_check_is_refused(tmp_path: Path) -> None:
    """The keystone. A fabricated adapter cannot satisfy an independent fact.

    The check's exit status was measured before any of this and cannot be
    influenced by the proposal, so "a hallucinated adapter is unbindable" is a
    property of the procedure rather than a hope about its author.
    """
    root = _workspace(tmp_path)

    validation = validate_report_proposal(
        root,
        _check(status="passed", output="ok"),
        ReportProposal(command="make test", report_path="out.xml"),
        _runner(JUNIT_ONE_FAILURE, exit_code=0, writes=root / "out.xml"),
    )

    assert not validation.ok
    assert validation.issues[0][0] is ValidationIssueKind.CONTRADICTS_THE_CHECK


@verifies(SWR.SWR_2623)
def test_a_report_claiming_no_failure_for_a_failing_check_is_refused(
    tmp_path: Path,
) -> None:
    """The same guard, pointed the other way: it must not launder a red run."""
    root = _workspace(tmp_path)

    validation = validate_report_proposal(
        root,
        _check(status="failed"),
        ReportProposal(command="make test", report_path="out.xml"),
        _runner(JUNIT_ALL_GREEN, exit_code=1, writes=root / "out.xml"),
    )

    assert not validation.ok
    assert validation.issues[0][0] is ValidationIssueKind.CONTRADICTS_THE_CHECK


@verifies(SWR.SWR_2623)
def test_a_report_naming_a_file_this_repository_does_not_have_is_refused(
    tmp_path: Path,
) -> None:
    """A report about somebody else's tree is not evidence about this one."""
    root = _workspace(tmp_path)
    elsewhere = JUNIT_ONE_FAILURE.replace("tests/test_store.py", "tests/not_here.py")

    validation = validate_report_proposal(
        root,
        _check(),
        ReportProposal(command="make test", report_path="out.xml"),
        _runner(elsewhere, writes=root / "out.xml"),
    )

    assert not validation.ok
    assert ValidationIssueKind.UNKNOWN_FILE in {kind for kind, _ in validation.issues}


@verifies(SWR.SWR_2623)
def test_a_programmatic_proposal_states_why_configuration_cannot_do_it() -> None:
    """The same rule SWR-3106 applies to a programmatic requirement source."""
    with pytest.raises(ValueError, match="cannot express"):
        ReportProposal(kind=ProposalKind.PROGRAMMATIC, adapter_command="./adapter.py")

    justified = ReportProposal(
        kind=ProposalKind.PROGRAMMATIC,
        adapter_command="./adapter.py",
        declarative_blocker="this runner emits only human-readable text",
    )
    assert "emits only human-readable text" in justified.describe()


# -- once bound, no analysis runs -------------------------------------------


@verifies(SWR.SWR_2623, SWR.SWR_2622)
def test_a_bound_adapter_produces_evidence_with_no_analyst_in_the_path(
    tmp_path: Path,
) -> None:
    """The model authored a parser; from here on the parser is all there is."""
    root = _workspace(tmp_path)
    proposal = ReportProposal(
        command="make test REPORT=out.xml",
        report_path="out.xml",
        author="gatekeeper",
    )

    report = bound_report(
        root,
        _check(),
        proposal,
        _runner(JUNIT_ONE_FAILURE, writes=root / "out.xml"),
    )

    assert report is not None
    assert [case.name for case in report.cases if not case.passed] == ["test_reads"]
    # Provenance travels with the verdict, so a board can say where it came from.
    assert report.adapter == "junit-xml via gatekeeper"
