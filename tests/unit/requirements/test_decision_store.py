"""Productive use: Rotaris cannot tell which of two readings of an edited requirement is
meant, asks, and the person closes their laptop before answering.
Expected outcome: the question is still there tomorrow — with its options and what each
would cost — because a blocked requirement with nothing to choose from is the state the
board's answer path exists to abolish.

The audit trail records that somebody was asked; that is history. This file is about the
artefact that makes the question answerable, and about what it does when it cannot be read.
"""

from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.change.decision_store import (
    DECISION_SCHEMA_VERSION,
    DecisionNoticeKind,
    PendingDecisionStore,
)
from rotaris_core.requirements.change.decisions import (
    DecisionOption,
    DecisionRecord,
    DecisionTrigger,
    PendingDecision,
)
from rotaris_core.requirements.delivery.state import DeliveryActor, DeliveryState

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.unit

REQ = "SWR-9001"
AT = dt.datetime(2026, 8, 16, 9, 0, tzinfo=dt.UTC)
LATER = dt.datetime(2026, 8, 16, 11, 0, tzinfo=dt.UTC)
DVF = DeliveryActor.user("dvf")

OPTIONS = (
    DecisionOption(
        name="tighten the existing rule",
        consequence="the current implementation is updated and its tests re-written",
    ),
    DecisionOption(
        name="add a second rule beside it",
        consequence="a new behaviour is implemented and the old one is left alone",
    ),
)


def question(*, at: dt.datetime = AT, text: str = "") -> PendingDecision:
    return PendingDecision(
        req_id=REQ,
        trigger=DecisionTrigger.UNCLEAR_SCOPE,
        question=(
            text or "Does 'a failed attempt' mean a wrong password only, or any rejected sign-in?"
        ),
        options=OPTIONS,
        target=DeliveryState.BLOCKED,
        raised_at=at,
        requirement_hash="abc123",
    )


def answer(pending: PendingDecision, *, at: dt.datetime = LATER) -> DecisionRecord:
    return pending.answered(OPTIONS[0].name, by=DVF, at=at)


@verifies(SWR.SWR_3516, SWR.SWR_3611)
def test_a_raised_question_is_there_after_a_restart(tmp_path: Path) -> None:
    """Productive use: the person who was asked comes back the next morning.
    Expected outcome: the question, its options and what each would cost are exactly as
    they were — read by a store built fresh, which is what a restart is."""
    PendingDecisionStore(tmp_path).raise_question(question())

    reopened = PendingDecisionStore(tmp_path).open_for(REQ)

    assert reopened is not None
    assert reopened.question == question().question
    assert [option.name for option in reopened.options] == [option.name for option in OPTIONS]
    # The consequences survive, which is the half a reason sentence cannot carry.
    assert all(option.consequence for option in reopened.options)
    assert reopened.trigger is DecisionTrigger.UNCLEAR_SCOPE
    assert reopened.raised_at == AT


@verifies(SWR.SWR_3516, SWR.SWR_3512)
def test_answering_closes_the_question_and_keeps_the_answer(tmp_path: Path) -> None:
    """A stored question that outlived its answer would offer an option list for something
    already decided, and choosing again would append a second answer to one question."""
    store = PendingDecisionStore(tmp_path)
    pending = question()
    store.raise_question(pending)

    store.record_answer(answer(pending))

    held = store.read(REQ)
    assert held is not None
    assert not held.waiting
    assert store.open_for(REQ) is None
    (recorded,) = held.answers
    assert recorded.chosen == OPTIONS[0].name
    assert recorded.answered_by == DVF
    assert recorded.answered_at == LATER


@verifies(SWR.SWR_3516, SWR.SWR_3213)
def test_asking_again_keeps_what_was_decided_last_time(tmp_path: Path) -> None:
    """ "We decided the opposite in March" is only readable if March is still there."""
    store = PendingDecisionStore(tmp_path)
    first = question()
    store.raise_question(first)
    store.record_answer(answer(first))

    store.raise_question(question(at=LATER, text="Is the lock per account or per address?"))

    held = store.read(REQ)
    assert held is not None
    assert held.waiting
    assert held.open is not None
    assert "per account" in held.open.question
    assert len(held.answers) == 1, "the earlier answer is history, not something to overwrite"
    assert held.answers[0].chosen == OPTIONS[0].name


@verifies(SWR.SWR_3516)
def test_a_requirement_nobody_asked_about_has_no_file(tmp_path: Path) -> None:
    """The common case costs nothing — no file, no directory, no read that fails."""
    store = PendingDecisionStore(tmp_path)

    assert store.read(REQ) is None
    assert store.open_for(REQ) is None
    assert store.waiting() == ()
    assert not store.directory.exists()


@verifies(SWR.SWR_3516)
def test_only_the_requirements_still_waiting_are_listed(tmp_path: Path) -> None:
    """What a board asks for: which cards have something to answer, right now."""
    store = PendingDecisionStore(tmp_path)
    pending = question()
    store.raise_question(pending)
    store.raise_question(pending.model_copy(update={"req_id": "SWR-9002"}))
    store.record_answer(answer(pending))

    assert store.waiting() == ("SWR-9002",)


@verifies(SWR.SWR_3516, SWR.SWR_3205)
def test_an_unreadable_artefact_costs_one_answer_path_and_no_more(tmp_path: Path) -> None:
    """A board that refused to render because one file was corrupt would be worse than one
    that says "no open decision" for the requirement whose file is broken."""
    store = PendingDecisionStore(tmp_path)
    store.raise_question(question())
    store.raise_question(question().model_copy(update={"req_id": "SWR-9002"}))
    store.path_for(REQ).write_text("{ not json", encoding="utf-8")

    read = store.load(REQ)

    assert read.decisions is None
    assert [notice.kind for notice in read.notices] == [DecisionNoticeKind.UNREADABLE]
    # The other requirement is untouched.
    assert store.open_for("SWR-9002") is not None
    assert store.waiting() == ("SWR-9002",)


@verifies(SWR.SWR_3516, SWR.SWR_3205)
def test_an_artefact_from_a_newer_build_is_reported_not_reinterpreted(tmp_path: Path) -> None:
    """The rule every store in this package applies: a payload this build does not
    understand is kept and named, never read as if it were the current shape."""
    import json

    store = PendingDecisionStore(tmp_path)
    store.raise_question(question())
    payload = json.loads(store.path_for(REQ).read_text(encoding="utf-8"))
    payload["schema_version"] = DECISION_SCHEMA_VERSION + 1
    store.path_for(REQ).write_text(json.dumps(payload), encoding="utf-8")

    read = store.load(REQ)

    assert read.decisions is None
    assert [notice.kind for notice in read.notices] == [DecisionNoticeKind.FUTURE_SCHEMA]
    assert read.stored_version == DECISION_SCHEMA_VERSION + 1


@verifies(SWR.SWR_3516)
def test_an_artefact_holding_neither_half_is_unreadable_not_empty(tmp_path: Path) -> None:
    """Something was written here. Reading it as "nothing was ever asked" would silently
    drop a question somebody is waiting on — the same reasoning SWR-3220 applies to a
    verification that lost its sites."""
    import json

    store = PendingDecisionStore(tmp_path)
    store.raise_question(question())
    store.path_for(REQ).write_text(
        json.dumps({"req_id": REQ, "schema_version": DECISION_SCHEMA_VERSION}),
        encoding="utf-8",
    )

    read = store.load(REQ)

    assert read.decisions is None
    assert [notice.kind for notice in read.notices] == [DecisionNoticeKind.UNREADABLE]
    assert "holds neither" in read.notices[0].detail
