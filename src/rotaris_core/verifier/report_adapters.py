"""How to get per-test results out of a runner nobody recognised (SWR-2623).

SWR-2622 reads the report a runner already wrote. Most runners can write one and
do not by default, and a project's declared command (SWR-2620) frequently wraps
its runner — ``make test``, ``just check``, a shell script — so no flag can be
injected from outside. This module closes both, and it does so with the pattern
:mod:`rotaris_core.requirements.sources.discovery` already proved on the sibling
port rather than a second one invented here.

The correspondence is deliberate, down to the vocabulary:

============================  =======================================
``sources/discovery.py``      here
============================  =======================================
``SourceAnalyst``             :class:`ReportAnalyst`
``HeuristicAnalyst``          :class:`ProbeAnalyst` — free, tried first
``SourceProposal``            :class:`ReportProposal`
``validate_proposal``         :func:`validate_report_proposal`
``discover_source``           :func:`discover_report_adapter`
``ProposalKind.PROGRAMMATIC`` the same rule, the same ``declarative_blocker``
============================  =======================================

Four properties carry over because they are what make the pattern safe:

- **The ladder costs nothing until it has to.** The deterministic analyst tries a
  table of known report-emitting arguments. A model is consulted only where that
  produced nothing adoptable, and never for a check that produced no output —
  there is nothing to read, and a model asked anyway could only invent.
- **A proposal is data the user accepts.** Nothing here writes configuration.
- **A proposal is validated by running it.** Not inspected — run, parsed, and
  checked against something already known.
- **The model is in the authoring loop, never the evidence loop.** What it
  produces is a parser. Once bound, every later run is deterministic, repeatable
  and free, exactly as ``load_or_discover`` makes source discovery.

**The check that makes a fabricated adapter unbindable.** A proposal's report has
to *agree with the check's own exit status*: a passing check must yield no
failures and a failing check at least one. An adapter that invents plausible JSON
cannot satisfy a fact that was measured independently of it, so the guarantee is
structural rather than a matter of trusting the author.
"""

from __future__ import annotations

import logging
from enum import StrEnum
from typing import TYPE_CHECKING, Protocol, Self, runtime_checkable

from pydantic import BaseModel, ConfigDict, model_validator

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.verifier.test_results import TestRunReport, parse_test_report

if TYPE_CHECKING:
    from collections.abc import Callable, Sequence
    from pathlib import Path

    from rotaris_core.verifier.runner import CheckResult

_log = logging.getLogger(__name__)

__all__ = [
    "AdapterAttempt",
    "AdapterOutcome",
    "ProbeAnalyst",
    "ProposalKind",
    "ReportAnalyst",
    "ReportProposal",
    "ReportValidation",
    "ValidationIssueKind",
    "discover_report_adapter",
    "validate_report_proposal",
]

#: Runners we already know how to ask for a report, and what to ask with. The
#: whole deterministic tier: a project using one of these never costs a token.
#:
#: ``{report}`` is substituted with the path the probe writes to.
PROBE_ARGUMENTS: tuple[tuple[str, str], ...] = (
    ("pytest", "--junitxml={report}"),
    ("jest", "--reporters=default --reporters=jest-junit"),
    ("vitest", "--reporter=junit --outputFile={report}"),
    ("mocha", "--reporter=xunit --reporter-option output={report}"),
    ("go test", "-json"),
    ("cargo test", "--message-format=json"),
    ("rspec", "--format RspecJunitFormatter --out {report}"),
    ("phpunit", "--log-junit {report}"),
    ("dotnet test", "--logger junit"),
    ("ctest", "--output-junit {report}"),
)

#: Where a probe is asked to write, relative to the workspace.
PROBE_REPORT_PATH = ".rotaris/verifier/probe-report.xml"


class ProposalKind(StrEnum):
    """Whether the proposal can be expressed as configuration."""

    DECLARATIVE = "declarative"
    PROGRAMMATIC = "programmatic"


class ValidationIssueKind(StrEnum):
    """Why a proposal must not be bound."""

    NOT_DECLARATIVE = "not-declarative"
    NOTHING_PARSED = "nothing-parsed"
    UNKNOWN_FILE = "unknown-file"
    #: The report and the check's own exit status disagree. The one that makes a
    #: fabricated adapter unbindable.
    CONTRADICTS_THE_CHECK = "contradicts-the-check"


@traces(SWR.SWR_2623)
class ReportProposal(BaseModel):
    """How to make one check emit per-test results.

    ``command`` is the whole proposed invocation — the check's own command plus
    whatever produces the report — because a wrapper cannot be extended from
    outside and only the proposal knows where the argument belongs.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    kind: ProposalKind = ProposalKind.DECLARATIVE
    #: The command to run in place of the check's, for a declarative proposal.
    command: str = ""
    #: Where the report lands, relative to the workspace. Empty when the runner
    #: writes to stdout and the command's own output is the report.
    report_path: str = ""
    #: A workspace-local command that converts raw output into port JSON, for a
    #: programmatic proposal.
    adapter_command: str = ""
    #: Why configuration cannot express this runner. Required for, and only
    #: meaningful on, a programmatic proposal.
    declarative_blocker: str = ""
    #: Who proposed this, carried through to ``TestRunReport.adapter``.
    author: str = ""

    @model_validator(mode="after")
    def _kind_and_payload_agree(self) -> Self:
        if self.kind is ProposalKind.DECLARATIVE:
            if not self.command.strip():
                raise ValueError("a declarative proposal names the command that emits a report")
            if self.declarative_blocker:
                raise ValueError(
                    "a declarative proposal states no blocker: the blocker is the reason"
                    " a proposal had to be programmatic (SWR-2623)",
                )
            return self
        if not self.adapter_command.strip():
            raise ValueError("a programmatic proposal names the adapter that produces the report")
        if not self.declarative_blocker.strip():
            raise ValueError(
                "a programmatic proposal states which part of this runner configuration"
                " cannot express, or it is a declarative proposal (SWR-2623)",
            )
        return self

    def describe(self) -> str:
        """One line a confirmation step can show."""
        if self.kind is ProposalKind.DECLARATIVE:
            where = f" → {self.report_path}" if self.report_path else " (on stdout)"
            return f"run `{self.command}`{where}"
        return f"run `{self.adapter_command}` over the output: {self.declarative_blocker}"


@traces(SWR.SWR_2623)
class ReportValidation(BaseModel):
    """What running a proposal produced, and every reason not to bind it."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    issues: tuple[tuple[ValidationIssueKind, str], ...] = ()
    cases: int = 0

    @property
    def ok(self) -> bool:
        """Whether this proposal may be bound."""
        return not self.issues

    def describe(self) -> str:
        """The refusal, as sentences."""
        if self.ok:
            return f"{self.cases} case(s) reported"
        return "; ".join(f"{kind}: {message}" for kind, message in self.issues)


@traces(SWR.SWR_2623)
class AdapterAttempt(BaseModel):
    """One analyst's turn, and what became of it — including the one not taken."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    label: str
    consulted: bool = True
    proposed: bool = False
    accepted: bool = False
    note: str = ""


@traces(SWR.SWR_2623)
class AdapterOutcome(BaseModel):
    """The whole discovery run: what to bind, or why nothing can be."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    proposal: ReportProposal | None = None
    validation: ReportValidation | None = None
    attempts: tuple[AdapterAttempt, ...] = ()

    @property
    def is_acceptable(self) -> bool:
        """Whether this run produced something a user could adopt."""
        return self.proposal is not None and self.validation is not None and self.validation.ok

    @property
    def summary(self) -> str:
        """One line: what was tried, and what came of it."""
        tried = ", ".join(attempt.label for attempt in self.attempts) or "nothing"
        if self.is_acceptable and self.proposal is not None:
            return f"{self.proposal.describe()} (tried: {tried})"
        return f"no adapter could be bound (tried: {tried})"


@runtime_checkable
class ReportAnalyst(Protocol):
    """Whatever turns a check into a proposal — the single seam for judgement.

    A deterministic prober and a model-backed analyst are the same shape here, so
    the ladder can be exercised, and tested, without a model anywhere near it.
    """

    def propose(self, check: CheckResult) -> ReportProposal | None:
        """A proposal for *check*, or ``None`` when nothing can be said."""
        ...


@traces(SWR.SWR_2623)
class ProbeAnalyst:
    """The deterministic tier: a table of runners and how to ask them (SWR-2623).

    Free, tried first, and enough for most projects — a runner in
    :data:`PROBE_ARGUMENTS` never costs a token. What it cannot do is read an
    unfamiliar wrapper and work out where an argument belongs, which is the
    judgement the seam above it exists for.
    """

    label = "probe"
    consults_a_model = False
    unavailable_reason = "no known report argument matches this command"

    def propose(self, check: CheckResult) -> ReportProposal | None:
        """The first known runner this command mentions, asked for a report."""
        command = str(getattr(check, "command", "") or "")
        for runner, argument in PROBE_ARGUMENTS:
            if runner not in command:
                continue
            writes_a_file = "{report}" in argument
            return ReportProposal(
                kind=ProposalKind.DECLARATIVE,
                command=f"{command} {argument.format(report=PROBE_REPORT_PATH)}".strip(),
                report_path=PROBE_REPORT_PATH if writes_a_file else "",
                author=self.label,
            )
        return None


@traces(SWR.SWR_2623)
def validate_report_proposal(
    root: Path,
    check: CheckResult,
    proposal: ReportProposal,
    run: Callable[[str], tuple[int, str]],
) -> ReportValidation:
    """Run *proposal* and report what stops it being bound.

    Validation is a real run, not an inspection — the same decision
    :func:`~rotaris_core.requirements.sources.discovery.validate_proposal` makes,
    for the same reason: a configuration that looks plausible and produces nothing
    is exactly what gets adopted and discovered three weeks later.

    The third check is the important one. The report has to **agree with the
    check's own exit status**, which was measured before any of this and cannot be
    influenced by the proposal. An adapter that fabricates results cannot satisfy
    it, so "a hallucinated adapter is unbindable" is a property of the procedure
    rather than a hope about the author.
    """
    if proposal.kind is ProposalKind.PROGRAMMATIC:
        return ReportValidation(
            issues=(
                (
                    ValidationIssueKind.NOT_DECLARATIVE,
                    "a programmatic adapter is validated by running it under the"
                    f" permission engine, not by loading it: {proposal.declarative_blocker}",
                ),
            ),
        )

    exit_code, output = run(proposal.command)
    text = output
    if proposal.report_path:
        try:
            text = (root / proposal.report_path).read_text(encoding="utf-8", errors="replace")
        except OSError as error:
            return ReportValidation(
                issues=((ValidationIssueKind.NOTHING_PARSED, f"no report was written: {error}"),),
            )

    report = parse_test_report(text, check_name=str(getattr(check, "name", "")), root=root)
    if report is None or not report.cases:
        return ReportValidation(
            issues=(
                (
                    ValidationIssueKind.NOTHING_PARSED,
                    "the command produced nothing any reader recognised as a test report",
                ),
            ),
        )

    issues: list[tuple[ValidationIssueKind, str]] = []
    for case in report.cases:
        if case.file and not (root / case.file).exists():
            issues.append(
                (
                    ValidationIssueKind.UNKNOWN_FILE,
                    f"the report names {case.file}, which is not in this repository",
                ),
            )
            break

    failures = sum(1 for case in report.cases if not case.passed and case.outcome != "skipped")
    check_passed = str(getattr(check, "status", "")) == "passed"
    if check_passed and failures:
        issues.append(
            (
                ValidationIssueKind.CONTRADICTS_THE_CHECK,
                f"the check passed and the report claims {failures} failure(s)",
            ),
        )
    elif not check_passed and exit_code != 0 and not failures:
        issues.append(
            (
                ValidationIssueKind.CONTRADICTS_THE_CHECK,
                "the check did not pass and the report claims no failure at all",
            ),
        )

    return ReportValidation(issues=tuple(issues), cases=len(report.cases))


def _wants_judgement(analyst: ReportAnalyst) -> bool:
    """Whether consulting *analyst* costs a model call."""
    return bool(getattr(analyst, "consults_a_model", False))


def _label(analyst: ReportAnalyst) -> str:
    return str(getattr(analyst, "label", "") or type(analyst).__name__)


@traces(SWR.SWR_2623)
def discover_report_adapter(
    root: Path,
    check: CheckResult,
    analysts: Sequence[ReportAnalyst],
    run: Callable[[str], tuple[int, str]],
) -> AdapterOutcome:
    """Propose, validate, and write nothing.

    Analysts are tried **in order and each proposal is validated before the next
    is considered**. That ordering is the whole escalation rule: the deterministic
    prober goes first and costs nothing, and a model is reached only where
    determinism produced nothing a user could adopt.

    A model is not asked about a check that produced no output at all. There is
    nothing there to read, and the answer could only be invented — the same guard
    ``discover_source`` applies to a repository holding no structured document.
    """
    attempts: list[AdapterAttempt] = []
    refusal: tuple[ReportProposal, ReportValidation] | None = None
    has_output = bool(str(getattr(check, "output_excerpt", "") or "").strip())

    for analyst in analysts:
        label = _label(analyst)
        if _wants_judgement(analyst) and not has_output:
            attempts.append(
                AdapterAttempt(
                    label=label,
                    consulted=False,
                    note="the check produced no output, so there is nothing to read",
                ),
            )
            continue
        try:
            proposal = analyst.propose(check)
        except Exception:  # noqa: BLE001 - an analyst that fails is not an outage
            _log.warning("Report analyst %s failed", label, exc_info=True)
            attempts.append(AdapterAttempt(label=label, note="the analyst raised"))
            continue
        if proposal is None:
            attempts.append(
                AdapterAttempt(
                    label=label,
                    proposed=False,
                    note=str(getattr(analyst, "unavailable_reason", "") or ""),
                ),
            )
            continue
        validation = validate_report_proposal(root, check, proposal, run)
        attempts.append(AdapterAttempt(label=label, proposed=True, accepted=validation.ok))
        if validation.ok:
            return AdapterOutcome(
                proposal=proposal,
                validation=validation,
                attempts=tuple(attempts),
            )
        refusal = (proposal, validation)

    if refusal is None:
        return AdapterOutcome(attempts=tuple(attempts))
    return AdapterOutcome(
        proposal=refusal[0],
        validation=refusal[1],
        attempts=tuple(attempts),
    )


@traces(SWR.SWR_2623)
def bound_report(
    root: Path,
    check: CheckResult,
    proposal: ReportProposal,
    run: Callable[[str], tuple[int, str]],
) -> TestRunReport | None:
    """Run a bound adapter and read what it produced.

    The evidence path once a proposal has been accepted: deterministic, and with
    no analyst anywhere in it. The model authored a parser; from here on the
    parser is all there is.
    """
    exit_code, output = run(
        proposal.command if proposal.kind is ProposalKind.DECLARATIVE else proposal.adapter_command,
    )
    del exit_code
    text = output
    if proposal.report_path:
        try:
            text = (root / proposal.report_path).read_text(encoding="utf-8", errors="replace")
        except OSError:
            return None
    report = parse_test_report(text, check_name=str(getattr(check, "name", "")), root=root)
    if report is None:
        return None
    return report.model_copy(
        update={"adapter": f"{report.adapter} via {proposal.author or 'authored'}"},
    )
