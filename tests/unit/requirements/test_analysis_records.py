"""Productive use: months after Rotaris decided that a requirement change needed no code,
somebody asks why — and has to be able to read the decision, its inputs and who made it.
Expected outcome: every analysis leaves exactly one record naming persona, model and
inputs; an outcome shown to a user links to the record that produced it; re-running an
analysis appends a record instead of replacing one; and nothing of the requirement's own
text is ever written to disk.
"""

from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING

import pytest
from pydantic import ValidationError

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.change.impact import (
    ImpactAnalyzer,
    ImpactOutcome,
    ImpactRequest,
    RequirementVersion,
)
from rotaris_core.requirements.change.records import (
    ANALYSIS_SUBDIRNAME,
    AnalysisInputs,
    AnalysisKind,
    AnalysisLog,
    AnalysisNoticeKind,
    AnalysisRecord,
    AnalysisRecordStore,
)
from rotaris_core.requirements.model import CanonicalRequirement, RequirementLifecycle
from rotaris_core.requirements.tombstones import requirements_state_dir

if TYPE_CHECKING:
    from collections.abc import Mapping
    from pathlib import Path

pytestmark = pytest.mark.unit

REQ = "SWR-9001"
AT = dt.datetime(2026, 8, 14, 12, 0, tzinfo=dt.UTC)
LATER = AT + dt.timedelta(days=30)
PERSONA = "impact-analyst"
MODEL = "scripted-analyst-1"

SECRET_PROSE = "The user signs in with an email and a password."
EDITED_PROSE = SECRET_PROSE + "\n\nA sixth failed attempt locks the account."


def version(text: str, *, revision: str) -> RequirementVersion:
    """One requirement version carrying real prose, so its absence is provable."""
    return RequirementVersion.of(
        CanonicalRequirement(
            req_id=REQ,
            title="Log in",
            description=text,
            lifecycle=RequirementLifecycle.APPROVED,
            source_id="reqtocode",
            source_revision=revision,
        ),
    )


def request_for(before: str = SECRET_PROSE, after: str = EDITED_PROSE) -> ImpactRequest:
    """The request an impact analysis of that change is given."""
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
    """An impact analyst answering a fixed payload."""

    def __init__(self, payload: Mapping[str, object]) -> None:
        self._payload = payload

    def analyse(self, request: ImpactRequest) -> Mapping[str, object]:
        del request
        return self._payload


VERDICT: dict[str, object] = {
    "outcome": str(ImpactOutcome.NO_BEHAVIOURAL_IMPACT),
    "reasoning": "the added sentence restates an existing rule in other words",
    "considered": ["the existing covering test", "the trace in login.py"],
}


def analysis_at(moment: dt.datetime, payload: Mapping[str, object] | None = None) -> AnalysisRecord:
    """One recorded impact analysis, made at *moment*."""
    analyzer = ImpactAnalyzer(
        model=ScriptedAnalyst(payload if payload is not None else VERDICT),
        persona=PERSONA,
        model_name=MODEL,
        clock=lambda: moment,
    )
    return analyzer.analyse(request_for()).to_record()


# --------------------------------------------------------------------------
# Shape and completeness (SWR-3514)
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3514)
def test_a_record_carries_everything_needed_to_reconstruct_the_decision() -> None:
    """Inputs, outcome, reasoning, persona, model, timestamp — all six, in one value."""
    record = analysis_at(AT)

    assert record.kind is AnalysisKind.IMPACT
    assert record.req_id == REQ
    assert record.at == AT
    assert record.outcome == str(ImpactOutcome.NO_BEHAVIOURAL_IMPACT)
    assert record.reasoning.startswith("the added sentence")
    assert record.considered == ("the existing covering test", "the trace in login.py")
    assert record.persona == PERSONA
    assert record.model == MODEL
    assert record.decider == f"{PERSONA} ({MODEL})"
    assert record.decided

    inputs = record.inputs
    assert inputs.before_hash and inputs.after_hash
    assert inputs.before_hash != inputs.after_hash
    assert inputs.before_revision == "r1"
    assert inputs.after_revision == "r2"
    assert inputs.diff_digest
    assert inputs.diff_lines > 0
    assert inputs.traces == ("src/pkg/login.py:41",)
    assert inputs.tests == ("tests/unit/test_login.py:12",)
    assert inputs.evidence == "satisfied"


@verifies(SWR.SWR_3514)
def test_an_outcome_that_names_no_decider_is_refused() -> None:
    """ "An agent decided something once" is exactly what this record replaces."""
    with pytest.raises(ValidationError, match="names the persona and the model"):
        AnalysisRecord(
            record_id="r",
            kind=AnalysisKind.IMPACT,
            req_id=REQ,
            at=AT,
            outcome="no-behavioural-impact",
            reasoning="because",
        )


@verifies(SWR.SWR_3514)
def test_an_outcome_without_reasoning_is_refused() -> None:
    """A verdict nobody can review is not an auditable decision."""
    with pytest.raises(ValidationError, match="without reasoning cannot be reviewed"):
        AnalysisRecord(
            record_id="r",
            kind=AnalysisKind.IMPACT,
            req_id=REQ,
            at=AT,
            outcome="no-behavioural-impact",
            persona=PERSONA,
            model=MODEL,
        )


@verifies(SWR.SWR_3514)
def test_a_record_states_an_outcome_or_a_failure_never_both_and_never_neither() -> None:
    """The two are different facts and a reader must not be able to confuse them."""
    with pytest.raises(ValidationError, match="never both and never neither"):
        AnalysisRecord(record_id="r", kind=AnalysisKind.IMPACT, req_id=REQ, at=AT)

    with pytest.raises(ValidationError, match="never both and never neither"):
        AnalysisRecord(
            record_id="r",
            kind=AnalysisKind.IMPACT,
            req_id=REQ,
            at=AT,
            outcome="no-behavioural-impact",
            reasoning="because",
            failure="the analyst timed out",
            persona=PERSONA,
            model=MODEL,
        )


@verifies(SWR.SWR_3514)
def test_an_analysis_that_never_ran_still_leaves_a_record() -> None:
    """ "We asked and nobody answered" is a fact a reviewer needs as much as a verdict."""
    record = ImpactAnalyzer(clock=lambda: AT).analyse(request_for()).to_record()

    assert not record.decided
    assert record.failure.startswith("no-analyst")
    assert record.outcome == ""
    assert record.decider == "no analyst"
    assert record.inputs.diff_lines > 0, "what was asked about is still recorded"


# --------------------------------------------------------------------------
# The link from an outcome to its record (SWR-3514)
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3514)
def test_an_outcome_links_to_the_record_that_produced_it() -> None:
    """The id is computed from the decision, so the two cannot drift apart."""
    analyzer = ImpactAnalyzer(
        model=ScriptedAnalyst(VERDICT),
        persona=PERSONA,
        model_name=MODEL,
        clock=lambda: AT,
    )
    analysis = analyzer.analyse(request_for())
    log = AnalysisLog(req_id=REQ).appended(analysis.to_record())

    found = log.get(analysis.record_id)

    assert found is not None
    assert found.reasoning == analysis.reasoning
    assert found.outcome == str(analysis.outcome)
    assert log.get("not-a-record-id") is None


@verifies(SWR.SWR_3514)
def test_two_analyses_of_the_same_inputs_get_two_ids() -> None:
    """A re-run is a second decision, not an overwrite of the first."""
    first = analysis_at(AT)
    second = analysis_at(LATER)

    assert first.record_id != second.record_id
    assert first.inputs.matches(second.inputs), "they were asked about the same thing"


@verifies(SWR.SWR_3514)
def test_the_record_id_is_a_function_of_the_decision_alone() -> None:
    """Deterministic, so an outcome recomputed anywhere finds the same record."""
    assert analysis_at(AT).record_id == analysis_at(AT).record_id


# --------------------------------------------------------------------------
# Append-only (SWR-3514)
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3514)
def test_re_running_an_analysis_appends_a_record_rather_than_replacing_one() -> None:
    """Two runs that disagreed must both stay readable."""
    first = analysis_at(AT)
    second = analysis_at(
        LATER,
        {
            "outcome": str(ImpactOutcome.IMPLEMENTATION_AFFECTED),
            "reasoning": "on a second reading the sentence adds a rule",
        },
    )

    log = AnalysisLog(req_id=REQ).appended(first).appended(second)

    assert [record.record_id for record in log.records] == [first.record_id, second.record_id]
    assert log.latest == second
    assert log.over(first.inputs) == (first, second)
    assert log.get(first.record_id) == first, "the superseded answer is still readable"


@verifies(SWR.SWR_3514)
def test_the_log_has_no_way_to_remove_or_rewrite_a_record() -> None:
    """Append-only is a property of the code, not a promise in prose."""
    forbidden = {"remove", "pop", "replace", "delete", "clear", "insert", "truncate", "set"}

    assert forbidden.isdisjoint(dir(AnalysisLog))
    assert forbidden.isdisjoint(dir(AnalysisRecordStore))


@verifies(SWR.SWR_3514)
def test_one_requirements_reasoning_is_never_filed_under_another() -> None:
    """A misattributed decision is worse than a missing one."""
    with pytest.raises(ValueError, match="cannot be appended"):
        AnalysisLog(req_id="SWR-9002").appended(analysis_at(AT))


# --------------------------------------------------------------------------
# Reproducibility (SWR-3514)
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3514)
def test_the_recorded_inputs_identify_exactly_what_was_analysed() -> None:
    """Re-read the two versions at the recorded revisions, and this says "same"."""
    record = analysis_at(AT)

    rebuilt = request_for().inputs
    assert record.inputs.matches(rebuilt)

    different = request_for(after=EDITED_PROSE + " Again.").inputs
    assert not record.inputs.matches(different)
    assert record.inputs.digest != different.digest


@verifies(SWR.SWR_3514)
def test_inputs_with_the_same_content_in_another_order_are_the_same_inputs() -> None:
    """Site order is not an input; what the sites are is."""
    one = AnalysisInputs(traces=("a.py:1", "b.py:2"), tests=("t.py:3",), diff_digest="d")
    other = AnalysisInputs(traces=("b.py:2", "a.py:1"), tests=("t.py:3",), diff_digest="d")

    assert one.matches(other)


# --------------------------------------------------------------------------
# The store (SWR-3514, SWR-3213, SWR-3114)
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3514)
def test_records_survive_a_round_trip_through_the_store(tmp_path: Path) -> None:
    """Written where the delivery store and the audit trail live, one file per requirement."""
    store = AnalysisRecordStore(tmp_path)
    first = analysis_at(AT)
    second = analysis_at(LATER)

    store.append(first)
    written = store.path_for(REQ).read_text(encoding="utf-8")
    store.append(second)

    assert store.directory == requirements_state_dir(tmp_path) / ANALYSIS_SUBDIRNAME
    text = store.path_for(REQ).read_text(encoding="utf-8")
    assert text.startswith(written), "a record already on disk is byte-identical afterwards"
    assert len(text.splitlines()) == 2

    log = store.read(REQ)
    assert [record.record_id for record in log.records] == [first.record_id, second.record_id]
    assert log.records[0] == first
    assert log.records[1] == second
    assert store.req_ids() == (REQ,)


@verifies(SWR.SWR_3514, SWR.SWR_3114)
def test_the_persisted_record_holds_no_requirement_text(tmp_path: Path) -> None:
    """The reasoning is Rotaris'; the requirement's prose stays in the source."""
    store = AnalysisRecordStore(tmp_path)
    store.append(analysis_at(AT))

    written = store.path_for(REQ).read_text(encoding="utf-8")

    assert SECRET_PROSE not in written
    assert "locks the account" not in written
    assert "Log in" not in written
    assert analysis_at(AT).inputs.diff_digest in written


@verifies(SWR.SWR_3514)
def test_one_corrupt_line_costs_its_own_record_and_nothing_else(tmp_path: Path) -> None:
    """Losing a requirement's whole decision history to one bad byte is not acceptable."""
    store = AnalysisRecordStore(tmp_path)
    store.append(analysis_at(AT))
    with store.path_for(REQ).open("a", encoding="utf-8", newline="\n") as handle:
        handle.write("{not json at all\n")
    store.append(analysis_at(LATER))

    read = store.load(REQ)

    assert read.degraded
    assert [notice.kind for notice in read.notices] == [AnalysisNoticeKind.UNREADABLE]
    assert read.notices[0].line == 2
    assert len(read.log.records) == 2


@verifies(SWR.SWR_3514)
def test_an_unwritten_requirement_reads_as_an_empty_log(tmp_path: Path) -> None:
    """Reading is free and never fails for a requirement nobody analysed."""
    read = AnalysisRecordStore(tmp_path).load("SWR-9999")

    assert read.log.empty
    assert read.log.latest is None
    assert not read.degraded
    assert not (tmp_path / ".rotaris").exists(), "reading writes nothing"
