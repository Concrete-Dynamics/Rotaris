"""Productive use: a team points Rotaris at a codebase whose requirements were all
implemented by hand. The board opens with every card in Backlog — correctly, because
Rotaris delivered none of them — and offers to verify the work and take it over.
Expected outcome: the offer states real numbers, nothing is written until the user
accepts, accepting verifies before it moves anything, a requirement whose tests did not
run is refused by name, and what was adopted says it was adopted rather than run."""

from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING

import pytest
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery.evidence import EvidenceInputs
from rotaris_core.requirements.delivery.projection import BoardInputs, project_board
from rotaris_core.requirements.delivery.satisfied import (
    DeliveryOrigin,
    SatisfiedDelivery,
    SatisfiedLog,
)
from rotaris_core.requirements.delivery.state import (
    DeliveryActor,
    DeliveryState,
    DeliveryStatus,
    TransitionCause,
)
from rotaris_core.requirements.delivery.store import DeliveryIndex, DeliveryRecord, DeliveryStore
from rotaris_core.requirements.model import CanonicalRequirement, RequirementLifecycle
from rotaris_core.requirements.registry import RequirementIndex
from rotaris_core.verifier.requirement_evidence import CoveringTest, RequirementSite
from rotaris_core.verifier.runner import CheckResult

from rotaris.models.requirements_state import AdoptionOffer, build_board_state
from rotaris.services.requirements_actions import (
    adopt_existing_work,
    adoption_evidence,
)

if TYPE_CHECKING:
    from collections.abc import Iterable
    from pathlib import Path

pytestmark = pytest.mark.unit

NOW = dt.datetime(2026, 8, 15, 12, 0, tzinfo=dt.UTC)


def _requirement(
    req_id: str,
    *,
    lifecycle: RequirementLifecycle = RequirementLifecycle.APPROVED,
) -> CanonicalRequirement:
    return CanonicalRequirement(
        req_id=req_id,
        title=f"{req_id} title",
        description=f"{req_id} says what the product does.",
        lifecycle=lifecycle,
        source_id="reqtocode",
        source_path=f"docs/requirements/{req_id}.md",
    )


def _complete_evidence(req_id: str) -> EvidenceInputs:
    """A requirement whose implementation and covering test are both there."""
    return EvidenceInputs(
        req_id=req_id,
        implementations=(RequirementSite(path=f"src/{req_id}.py", line=10),),
        covering_tests=(CoveringTest(path=f"tests/test_{req_id}.py", line=20),),
    )


def _passing_suite() -> tuple[CheckResult, ...]:
    """A check suite that ran the tests and passed — what adoption needs to see."""
    return (
        CheckResult(
            name="pytest",
            command="uv run pytest -q",
            severity="blocking",
            status="passed",
            exit_code=0,
        ),
    )


def _failing_suite() -> tuple[CheckResult, ...]:
    return (
        CheckResult(
            name="pytest",
            command="uv run pytest -q",
            severity="blocking",
            status="failed",
            exit_code=1,
        ),
    )


def _adopt(
    workspace: Path,
    requirements: Iterable[CanonicalRequirement],
    *,
    checks: tuple[CheckResult, ...],
    evidence: dict[str, EvidenceInputs] | None = None,
):
    known = dict(evidence or {})

    def evidence_for(requirement: CanonicalRequirement) -> EvidenceInputs:
        return known.get(requirement.req_id) or _complete_evidence(requirement.req_id)

    return adopt_existing_work(
        workspace,
        requirements=tuple(requirements),
        evidence_for=evidence_for,
        checks=checks,
        actor_name="dvf",
        at=NOW,
        commit="c0ffee",
    )


# ── the evidence adoption judges against (SWR-3217) ────────────────────────


@verifies(SWR.SWR_3217)
def test_a_covering_test_nobody_ran_is_not_evidence_that_it_passed() -> None:
    """The property that makes adoption honest, asserted directly.

    A coverage sweep knows a test *exists*; it cannot know anything ran it
    (SWR-2606). With no check suite behind it, adoption must therefore see an
    unexecuted test — and the gate refuses on that, which is the correct outcome
    rather than a limitation to work around.
    """
    evidence = adoption_evidence(_requirement("SWR-1"), _complete_evidence("SWR-1"), checks=())

    assert evidence.covering_tests
    assert not any(test.verifying for test in evidence.covering_tests)
    assert not evidence.gate_passed


@verifies(SWR.SWR_3217)
def test_a_suite_that_ran_the_tests_makes_them_evidence() -> None:
    """With a real suite behind it the same requirement is genuinely verified."""
    evidence = adoption_evidence(
        _requirement("SWR-1"),
        _complete_evidence("SWR-1"),
        checks=_passing_suite(),
    )

    assert all(test.verifying for test in evidence.covering_tests)
    assert evidence.gate_passed
    assert evidence.implementation_traces == ("src/SWR-1.py",)


@verifies(SWR.SWR_3217)
def test_a_failing_suite_is_not_a_completion_gate_that_passed() -> None:
    """A blocking check that failed means the workspace is not in a state to adopt."""
    evidence = adoption_evidence(
        _requirement("SWR-1"),
        _complete_evidence("SWR-1"),
        checks=_failing_suite(),
    )

    assert not evidence.gate_passed


# ── the pass itself (SWR-3217) ─────────────────────────────────────────────


@verifies(SWR.SWR_3217, SWR.SWR_3219)
def test_verified_work_is_adopted_and_says_so(tmp_path: Path) -> None:
    """Productive use: the whole point — a hand-built requirement becomes Done.
    Expected outcome: it carries the version that was verified, the commit it was
    verified at, and an origin that never lets it read as a run Rotaris performed."""
    report = _adopt(tmp_path, [_requirement("SWR-1")], checks=_passing_suite())

    assert [result.req_id for result in report.adopted] == ["SWR-1"]
    stored = DeliveryStore(tmp_path).load("SWR-1").record
    assert stored.delivery.state is DeliveryState.DONE
    assert stored.delivery.cause is TransitionCause.ADOPTED
    current = stored.satisfied.current
    assert current is not None
    assert current.origin is DeliveryOrigin.ADOPTED
    assert current.verified_commit == "c0ffee"
    assert "adopted from verification run" in current.summary


@verifies(SWR.SWR_3217, SWR.SWR_3609)
def test_without_a_verification_nothing_is_adopted_and_each_says_why(tmp_path: Path) -> None:
    """Productive use: somebody adopts a workspace whose check suite never ran.
    Expected outcome: not one requirement moves, and every refusal names the condition —
    which is what makes the report actionable rather than a wall (SWR-3609)."""
    report = _adopt(tmp_path, [_requirement("SWR-1"), _requirement("SWR-2")], checks=())

    assert not report.adopted
    assert len(report.refused) == 2
    for result in report.refused:
        assert "covering-tests-passed" in {condition.name for condition in result.unmet}
    assert not list(tmp_path.rglob("*.json"))


@verifies(SWR.SWR_3217)
def test_a_requirement_with_no_trace_is_left_where_it_is(tmp_path: Path) -> None:
    """Productive use: half the project is implemented, half is not.
    Expected outcome: adoption takes the half that is and leaves the rest in Backlog,
    which is the board telling the truth rather than turning uniformly green."""
    report = _adopt(
        tmp_path,
        [_requirement("SWR-1"), _requirement("SWR-2")],
        checks=_passing_suite(),
        evidence={"SWR-2": EvidenceInputs(req_id="SWR-2")},
    )

    assert [result.req_id for result in report.adopted] == ["SWR-1"]
    assert [result.req_id for result in report.refused] == ["SWR-2"]
    assert DeliveryStore(tmp_path).load("SWR-2").record.delivery.pristine


@verifies(SWR.SWR_3217)
def test_a_requirement_a_user_already_moved_is_never_touched(tmp_path: Path) -> None:
    """The one way this feature could destroy real work, refused end to end."""
    store = DeliveryStore(tmp_path)
    store.seed(
        DeliveryRecord(
            req_id="SWR-1",
            delivery=DeliveryStatus(
                state=DeliveryState.READY,
                changed_at=NOW,
                changed_by=DeliveryActor.user("dvf"),
                cause=TransitionCause.USER_ACTION,
            ),
        ),
    )

    report = _adopt(tmp_path, [_requirement("SWR-1")], checks=_passing_suite())

    assert [result.req_id for result in report.skipped] == ["SWR-1"]
    assert store.load("SWR-1").record.delivery.state is DeliveryState.READY


@verifies(SWR.SWR_3217)
def test_a_deprecated_requirement_is_retired_not_adopted(tmp_path: Path) -> None:
    """Productive use: the project deprecated a requirement years ago.
    Expected outcome: adoption leaves it alone — retired is not finished."""
    report = _adopt(
        tmp_path,
        [_requirement("SWR-1", lifecycle=RequirementLifecycle.DEPRECATED)],
        checks=_passing_suite(),
    )

    assert [result.req_id for result in report.skipped] == ["SWR-1"]
    assert not report.adopted


# ── the offer the board makes (SWR-3614) ───────────────────────────────────


def _projection(records: Iterable[DeliveryRecord] = (), *, traced: bool = True):
    requirements = [_requirement("SWR-1"), _requirement("SWR-2")]
    evidence = (
        {req.req_id: _complete_evidence(req.req_id) for req in requirements} if traced else {}
    )
    return project_board(
        BoardInputs(
            index=RequirementIndex(requirements=tuple(requirements), generation=1),
            delivery=DeliveryIndex(records={record.req_id: record for record in records}),
            evidence=evidence,
            evaluated_at=NOW,
        ),
    )


@verifies(SWR.SWR_3614)
def test_the_offer_states_numbers_read_off_the_projection() -> None:
    """Productive use: a user opens Requirements on an existing codebase.
    Expected outcome: the board says how many requirements already have traces, out of
    how many — numbers they could count themselves and get the same answer."""
    state = build_board_state(_projection())

    assert state.adoption == AdoptionOffer(traced=2, total=2)
    assert state.adoption is not None
    assert "2 of 2 requirements already have implementation traces" in state.adoption.title
    # Epic and lifecycle, not health: before anything has been verified every
    # requirement owes a verification nobody produced, so health reads
    # `Incomplete Traceability` across the whole board and separates nothing.
    assert "group the board by epic or lifecycle instead" in state.adoption.message


@verifies(SWR.SWR_3614)
def test_there_is_no_offer_once_anything_has_been_delivered() -> None:
    """Productive use: the workspace has been used; one requirement is Done.
    Expected outcome: the offer disappears on its own, because the finding it reports —
    "Rotaris has delivered none of these" — has stopped being true."""
    delivered = DeliveryRecord(
        req_id="SWR-1",
        delivery=DeliveryStatus(
            state=DeliveryState.DONE,
            changed_at=NOW,
            changed_by=DeliveryActor.system("runner"),
            cause=TransitionCause.COMPLETION_ACCEPTED,
        ),
        satisfied=SatisfiedLog(
            entries=(
                SatisfiedDelivery(
                    req_id="SWR-1",
                    satisfied_hash="h",
                    run_id="run-7",
                    satisfied_at=NOW,
                ),
            ),
        ),
    )

    assert build_board_state(_projection([delivered])).adoption is None


@verifies(SWR.SWR_3614)
def test_there_is_no_offer_when_there_is_nothing_to_adopt() -> None:
    """An offer that would adopt nothing is noise, so it is not made."""
    assert build_board_state(_projection(traced=False)).adoption is None


@verifies(SWR.SWR_3614, SWR.SWR_3201)
def test_building_the_offer_writes_nothing(tmp_path: Path) -> None:
    """Productive use: the board is read, and read again.
    Expected outcome: no delivery record exists — SWR-3201's "Backlog without a write"
    survives the offer being computed and shown."""
    build_board_state(_projection())
    build_board_state(_projection())

    assert not list(tmp_path.rglob("*.json"))
    assert DeliveryStore(tmp_path).load("SWR-1").record.delivery.pristine
