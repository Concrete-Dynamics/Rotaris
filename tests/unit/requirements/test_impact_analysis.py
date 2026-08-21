"""Productive use: a delivered requirement changed and Rotaris has to decide what that
costs — nothing at all for a reworded sentence, an implementation and a test change for a
new acceptance criterion.
Expected outcome: the answer is always exactly one of the six outcomes; an answer that
cannot be read, or that names no reason, becomes ``human clarification required`` instead
of a guess; an analysis that could not run at all reaches no outcome and says why; and the
analyser cannot write — it holds no writable collaborator and leaves every file on disk
byte-identical.
"""

from __future__ import annotations

import datetime as dt
import hashlib
from typing import TYPE_CHECKING

import pytest
from pydantic import ValidationError

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.change.impact import (
    RULE_DECIDER,
    RULE_PERSONA,
    ImpactAnalysis,
    ImpactAnalyzer,
    ImpactFailureKind,
    ImpactOutcome,
    ImpactRequest,
    RequirementVersion,
    read_only_report,
    read_verdict,
    version_diff,
)
from rotaris_core.requirements.model import CanonicalRequirement, RequirementLifecycle

if TYPE_CHECKING:
    from collections.abc import Mapping
    from pathlib import Path

pytestmark = pytest.mark.unit

REQ = "SWR-9001"
AT = dt.datetime(2026, 8, 14, 12, 0, tzinfo=dt.UTC)
PERSONA = "impact-analyst"
MODEL = "scripted-analyst-1"

BEFORE_TEXT = "The user signs in with an email and a password."
AFTER_TEXT = (
    "The user signs in with an email and a password.\n\n"
    "A sixth failed attempt locks the account for fifteen minutes."
)


def version(text: str, *, title: str = "Log in", revision: str = "r1") -> RequirementVersion:
    """One requirement version, built the way a source read produces it."""
    return RequirementVersion.of(
        CanonicalRequirement(
            req_id=REQ,
            title=title,
            description=text,
            lifecycle=RequirementLifecycle.APPROVED,
            source_id="reqtocode",
            source_revision=revision,
        ),
    )


def request_for(before: str, after: str) -> ImpactRequest:
    """The analysis request for a change from *before* to *after*."""
    return ImpactRequest.between(
        version(before, revision="r1"),
        version(after, revision="r2"),
        traces=("src/pkg/login.py:41",),
        tests=("tests/unit/test_login.py:12",),
        evidence="satisfied",
        delivering_run="run-17",
        verified_commit="c0ffee",
    )


class ScriptedAnalyst:
    """An impact analyst that answers a fixed payload and counts its calls."""

    def __init__(self, payload: Mapping[str, object]) -> None:
        self._payload = payload
        self.requests: list[ImpactRequest] = []

    def analyse(self, request: ImpactRequest) -> Mapping[str, object]:
        self.requests.append(request)
        return self._payload


class BrokenAnalyst:
    """An analyst that is unreachable — the outage case."""

    def analyse(self, request: ImpactRequest) -> Mapping[str, object]:
        del request
        raise TimeoutError("the analyst did not answer within 60s")


def analyzer_with(payload: Mapping[str, object]) -> tuple[ImpactAnalyzer, ScriptedAnalyst]:
    """An analyser wired to a scripted analyst, with a fixed clock."""
    analyst = ScriptedAnalyst(payload)
    return (
        ImpactAnalyzer(model=analyst, persona=PERSONA, model_name=MODEL, clock=lambda: AT),
        analyst,
    )


# --------------------------------------------------------------------------
# The answer space (SWR-3503)
# --------------------------------------------------------------------------


@pytest.mark.parametrize("outcome", list(ImpactOutcome))
@verifies(SWR.SWR_3503)
def test_each_of_the_six_outcomes_is_read_back_as_itself(outcome: ImpactOutcome) -> None:
    """The vocabulary is closed and every member of it round-trips."""
    verdict = read_verdict({"outcome": str(outcome), "reasoning": "because of the diff"})

    assert verdict.outcome is outcome
    assert verdict.reasoning == "because of the diff"


@verifies(SWR.SWR_3503)
def test_an_outcome_outside_the_six_becomes_human_clarification() -> None:
    """A seventh answer is not a seventh outcome — it is an undecided analysis."""
    verdict = read_verdict({"outcome": "maybe-rewrite-everything", "reasoning": "unsure"})

    assert verdict.outcome is ImpactOutcome.HUMAN_CLARIFICATION_REQUIRED
    assert "maybe-rewrite-everything" in verdict.reasoning
    assert "unsure" in verdict.reasoning, "what the analyst did say is kept for the human"


@verifies(SWR.SWR_3503)
def test_an_answer_with_no_outcome_becomes_human_clarification() -> None:
    """Silence is not consent to change code."""
    verdict = read_verdict({"reasoning": "the diff is ambiguous", "question": "which behaviour?"})

    assert verdict.outcome is ImpactOutcome.HUMAN_CLARIFICATION_REQUIRED
    assert "named no outcome" in verdict.reasoning
    assert verdict.question == "which behaviour?"


@verifies(SWR.SWR_3503)
def test_an_outcome_without_reasoning_becomes_human_clarification() -> None:
    """An unreviewable verdict is worse than an admitted question (SWR-3514)."""
    verdict = read_verdict({"outcome": str(ImpactOutcome.NO_BEHAVIOURAL_IMPACT)})

    assert verdict.outcome is ImpactOutcome.HUMAN_CLARIFICATION_REQUIRED
    assert "without stating why" in verdict.reasoning


@verifies(SWR.SWR_3503)
def test_the_outcomes_say_what_they_cost() -> None:
    """What a caller switches on, stated once and asserted once."""
    assert not ImpactOutcome.NO_BEHAVIOURAL_IMPACT.costs_a_run
    assert not ImpactOutcome.NO_BEHAVIOURAL_IMPACT.blocks

    assert ImpactOutcome.TESTS_AFFECTED.touches_tests
    assert not ImpactOutcome.TESTS_AFFECTED.touches_implementation

    assert ImpactOutcome.IMPLEMENTATION_AFFECTED.touches_implementation
    assert not ImpactOutcome.IMPLEMENTATION_AFFECTED.touches_tests

    both = ImpactOutcome.IMPLEMENTATION_AND_TESTS_AFFECTED
    assert both.touches_implementation and both.touches_tests and both.costs_a_run

    assert ImpactOutcome.DECOMPOSITION_REQUIRED.blocks
    assert not ImpactOutcome.DECOMPOSITION_REQUIRED.costs_a_run
    assert ImpactOutcome.HUMAN_CLARIFICATION_REQUIRED.blocks


# --------------------------------------------------------------------------
# The analyser (SWR-3503)
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3503)
def test_a_new_acceptance_criterion_reaches_the_analyst_and_its_verdict() -> None:
    """The productive path: both versions and their diff are what gets judged."""
    analyzer, analyst = analyzer_with(
        {
            "outcome": str(ImpactOutcome.IMPLEMENTATION_AND_TESTS_AFFECTED),
            "reasoning": "a new lock-out rule is behaviour and nothing covers it",
            "considered": ["the existing covering test", "the trace in login.py"],
        },
    )

    analysis = analyzer.analyse(request_for(BEFORE_TEXT, AFTER_TEXT))

    assert analysis.outcome is ImpactOutcome.IMPLEMENTATION_AND_TESTS_AFFECTED
    assert analysis.costs_a_run
    assert analysis.failure is None
    assert analysis.persona == PERSONA
    assert analysis.model == MODEL
    assert analysis.at == AT
    assert len(analyst.requests) == 1
    seen = analyst.requests[0]
    assert any("locks the account" in line for line in seen.diff)
    assert seen.traces == ("src/pkg/login.py:41",)
    assert seen.tests == ("tests/unit/test_login.py:12",)
    assert seen.evidence == "satisfied"


@verifies(SWR.SWR_3503)
def test_two_canonically_identical_versions_never_reach_the_analyst() -> None:
    """A whitespace edit must not put a prompt — or a run — on the critical path."""
    analyzer, analyst = analyzer_with({"outcome": str(ImpactOutcome.IMPLEMENTATION_AFFECTED)})

    analysis = analyzer.analyse(
        ImpactRequest.between(version(BEFORE_TEXT), version(BEFORE_TEXT + "   \n")),
    )

    assert analyst.requests == [], "an empty diff is decided without asking anyone"
    assert analysis.outcome is ImpactOutcome.NO_BEHAVIOURAL_IMPACT
    assert not analysis.costs_a_run
    assert analysis.persona == RULE_PERSONA
    assert analysis.model == RULE_DECIDER


@verifies(SWR.SWR_3503)
def test_an_analyst_that_fails_leaves_no_outcome_and_states_why() -> None:
    """An outage must not read as a verdict — the requirement stays in Needs Update."""
    analyzer = ImpactAnalyzer(
        model=BrokenAnalyst(),
        persona=PERSONA,
        model_name=MODEL,
        clock=lambda: AT,
    )

    analysis = analyzer.analyse(request_for(BEFORE_TEXT, AFTER_TEXT))

    assert analysis.outcome is None
    assert not analysis.decided
    assert not analysis.costs_a_run
    assert analysis.failure is not None
    assert analysis.failure.kind is ImpactFailureKind.MODEL_ERROR
    assert "TimeoutError" in analysis.failure.detail
    assert "Needs Update" in analysis.message


@verifies(SWR.SWR_3503)
def test_no_configured_analyst_is_a_stated_failure_not_a_silent_pass() -> None:
    """ "Nobody looked" and "nothing to do" are not the same answer."""
    analysis = ImpactAnalyzer(clock=lambda: AT).analyse(request_for(BEFORE_TEXT, AFTER_TEXT))

    assert analysis.outcome is None
    assert analysis.failure is not None
    assert analysis.failure.kind is ImpactFailureKind.NO_ANALYST


@verifies(SWR.SWR_3503)
def test_an_unreadable_answer_is_downgraded_rather_than_guessed() -> None:
    """Through the analyser, not only through the parser."""
    analyzer, _ = analyzer_with({"outcome": "definitely-fine"})

    analysis = analyzer.analyse(request_for(BEFORE_TEXT, AFTER_TEXT))

    assert analysis.outcome is ImpactOutcome.HUMAN_CLARIFICATION_REQUIRED
    assert analysis.decided
    assert not analysis.costs_a_run


@verifies(SWR.SWR_3503, SWR.SWR_3514)
def test_an_analyst_nobody_can_name_is_refused_at_construction() -> None:
    """An outcome that cannot be attributed is unauditable (SWR-3514)."""
    with pytest.raises(ValueError, match="persona and the model"):
        ImpactAnalyzer(model=ScriptedAnalyst({}), persona="", model_name=MODEL)


@verifies(SWR.SWR_3503)
def test_an_analysis_is_either_decided_or_failed_never_both() -> None:
    """The value itself refuses the ambiguous shape."""
    with pytest.raises(ValidationError, match="never both and never neither"):
        ImpactAnalysis(req_id=REQ, at=AT)


# --------------------------------------------------------------------------
# The diff the analyst reads
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3503)
def test_the_diff_names_which_field_moved() -> None:
    """ "the title changed" and "a sentence changed" must not read alike."""
    title_change = version_diff(version(BEFORE_TEXT), version(BEFORE_TEXT, title="Sign in"))
    body_change = version_diff(version(BEFORE_TEXT), version(AFTER_TEXT))

    assert any(line.startswith("-title: Log in") for line in title_change)
    assert not any("description" in line and line.startswith(("+", "-")) for line in title_change)
    assert any("locks the account" in line for line in body_change)


@verifies(SWR.SWR_3503)
def test_identical_versions_produce_an_empty_diff() -> None:
    """The cheap answer the short-circuit rests on."""
    assert version_diff(version(BEFORE_TEXT), version(BEFORE_TEXT)) == ()
    assert ImpactRequest.between(version(BEFORE_TEXT), version(BEFORE_TEXT)).identical


# --------------------------------------------------------------------------
# Read-only (SWR-3503's third acceptance criterion, Gate 4)
# --------------------------------------------------------------------------


class WritableThing:
    """A collaborator with a write operation, planted to prove the check bites."""

    def analyse(self, request: ImpactRequest) -> Mapping[str, object]:
        del request
        return {}

    def update(self, text: str) -> None:
        """The operation an impact analyser may never be handed."""
        del text


@verifies(SWR.SWR_3503)
def test_the_analyser_holds_no_collaborator_that_could_write() -> None:
    """Read-onlyness is structural: there is nothing to write with."""
    analyzer, _ = analyzer_with({"outcome": str(ImpactOutcome.NO_BEHAVIOURAL_IMPACT)})

    assert read_only_report(analyzer) == ()


@verifies(SWR.SWR_3503)
def test_the_read_only_check_names_a_writable_collaborator() -> None:
    """A check that cannot fail is not a check."""
    smuggled = ImpactAnalyzer(model=WritableThing(), persona=PERSONA, model_name=MODEL)

    assert read_only_report(smuggled) == ("model.update",)


@verifies(SWR.SWR_3503)
def test_an_analysis_leaves_the_source_the_code_and_the_tests_byte_identical(
    tmp_path: Path,
) -> None:
    """The guarantee as a productive check, not as a docstring.

    A requirement document, the module implementing it and the test covering it
    are on disk. The analysis runs over both versions of the requirement, decides
    that code has to change — and not one byte of any of the three moves, because
    deciding and doing are separate acts and only the second one is a run.
    """
    store = tmp_path / "docs" / "requirements"
    store.mkdir(parents=True)
    (store / "SWR-9001-login.md").write_text(
        f"---\nreq-id: {REQ}\nstatus: approved\n---\n\n# {REQ} — Log in\n\n{AFTER_TEXT}\n",
        encoding="utf-8",
    )
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "login.py").write_text("def sign_in() -> None: ...\n", encoding="utf-8")
    (tmp_path / "tests").mkdir()
    (tmp_path / "tests" / "test_login.py").write_text("def test_sign_in(): ...\n", encoding="utf-8")

    def fingerprint() -> dict[str, str]:
        return {
            str(path.relative_to(tmp_path)): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in sorted(tmp_path.rglob("*"))
            if path.is_file()
        }

    before = fingerprint()
    analyzer, _ = analyzer_with(
        {
            "outcome": str(ImpactOutcome.IMPLEMENTATION_AND_TESTS_AFFECTED),
            "reasoning": "the lock-out rule is new behaviour",
        },
    )

    analysis = analyzer.analyse(request_for(BEFORE_TEXT, AFTER_TEXT))

    assert analysis.costs_a_run, "the analysis really did ask for a code change"
    assert fingerprint() == before, "deciding that code must change may not change code"
