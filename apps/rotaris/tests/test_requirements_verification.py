"""Productive use: a colleague deletes a test, a refactor moves a trace, a dependency
bump turns a suite red. The requirement did not change, nothing was delivered, and the
board's evidence is simply older than the repository.
Expected outcome: the user can ask Rotaris to verify; the control says what that costs
before it starts; the pass records what a real suite measured; and nothing it does moves
a card or writes a delivery record — a green suite is evidence, not a decision."""

from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING

import pytest
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery.evidence import EvidenceInputs
from rotaris_core.requirements.delivery.store import DeliveryStore
from rotaris_core.requirements.delivery.verification import VerificationStore
from rotaris_core.requirements.delivery.verification_pass import VerificationTarget
from rotaris_core.requirements.model import CanonicalRequirement, RequirementLifecycle
from rotaris_core.requirements.verification_host import verify_requirements
from rotaris_core.verifier.requirement_evidence import CoveringTest, RequirementSite
from rotaris_core.verifier.runner import CheckResult

from rotaris.models.requirements_state import RequirementsBoardState
from rotaris.views.requirements import (
    VERIFY_RUNNING,
    VERIFY_TOOLTIP,
    RequirementsView,
)

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.unit

NOW = dt.datetime(2026, 8, 16, 12, 0, tzinfo=dt.UTC)
TARGET = VerificationTarget(branch="master", commit="d" * 40)


def _requirement(req_id: str) -> CanonicalRequirement:
    return CanonicalRequirement(
        req_id=req_id,
        title=f"{req_id} title",
        description=f"{req_id} says what the product does.",
        lifecycle=RequirementLifecycle.APPROVED,
        source_id="reqtocode",
        source_path=f"docs/requirements/{req_id}.md",
        current_hash=f"hash-{req_id}",
    )


def _evidence_for(requirement: CanonicalRequirement) -> EvidenceInputs:
    return EvidenceInputs(
        req_id=requirement.req_id,
        requirement_hash=requirement.current_hash,
        implementations=(RequirementSite(path=f"src/{requirement.req_id}.py", line=10),),
        covering_tests=(CoveringTest(path=f"tests/test_{requirement.req_id}.py", line=20),),
    )


def _passing_suite() -> tuple[CheckResult, ...]:
    return (
        CheckResult(
            name="pytest",
            command="uv run pytest tests/",
            severity="blocking",
            status="passed",
            exit_code=0,
        ),
    )


# -- what the action does, and what it deliberately does not ----------------


@verifies(SWR.SWR_3615, SWR.SWR_3220)
def test_a_verification_records_evidence_and_writes_no_delivery_record(
    tmp_path: Path,
) -> None:
    """Productive use: a user verifies a workspace nothing has been delivered in.
    Expected outcome: the evidence is recorded and the delivery store is untouched.
    A green suite is evidence, not a decision — turning it into `Done` stays the
    completion gate's job (SWR-3215), reached through a run or through adoption."""
    requirements = (_requirement("SWR-1"), _requirement("SWR-2"))

    report = verify_requirements(
        tmp_path,
        requirements=requirements,
        evidence_for=_evidence_for,
        checks=_passing_suite(),
        target=TARGET,
        at=NOW,
    )

    assert len(report.recorded) == 2
    assert VerificationStore(tmp_path).read("SWR-1") is not None
    assert DeliveryStore(tmp_path).load_all().records == {}


@verifies(SWR.SWR_3615, SWR.SWR_3201)
def test_verifying_a_backlog_requirement_leaves_it_in_backlog(tmp_path: Path) -> None:
    """Productive use: a user verifies before deciding whether to adopt.
    Expected outcome: the ring changes and the column does not. That is how a user
    learns something is already finished without Rotaris deciding it for them."""
    requirement = _requirement("SWR-4242")

    verify_requirements(
        tmp_path,
        requirements=[requirement],
        evidence_for=_evidence_for,
        checks=_passing_suite(),
        target=TARGET,
        at=NOW,
    )

    assert VerificationStore(tmp_path).read("SWR-4242") is not None
    assert not DeliveryStore(tmp_path).path_for("SWR-4242").exists()
    assert DeliveryStore(tmp_path).read("SWR-4242").delivery.pristine


@verifies(SWR.SWR_3615)
def test_a_workspace_with_no_target_branch_records_nothing(tmp_path: Path) -> None:
    """Productive use: Rotaris opens a directory that is not a checkout.
    Expected outcome: nothing recorded, and no exception. A verification that cannot
    say where it counts is not evidence, and saying so beats inventing a branch."""
    report = verify_requirements(
        tmp_path,
        requirements=[_requirement("SWR-1")],
        evidence_for=_evidence_for,
        checks=_passing_suite(),
        at=NOW,
    )

    assert report.results == ()
    assert VerificationStore(tmp_path).load_all().verifications == {}


# -- what the control says before anything happens -------------------------


@verifies(SWR.SWR_3615)
def test_the_verify_control_states_the_suite_the_cost_and_what_it_will_not_do(
    qtbot,
) -> None:
    """Productive use: a user hovers Verify before pressing it.
    Expected outcome: three facts — it runs *this workspace's* suite, it takes
    minutes, and it moves no card. The third is the one a user would otherwise get
    wrong, and getting it wrong means expecting the board to rearrange itself."""
    view = RequirementsView()
    qtbot.addWidget(view)

    tooltip = view.verify_button.toolTip()

    assert tooltip == VERIFY_TOOLTIP
    assert "own check suite" in tooltip
    assert "minutes" in tooltip
    assert "moves no card" in tooltip
    assert view.verify_button.accessibleName() == "Verify requirements"


@verifies(SWR.SWR_3615)
def test_the_control_says_it_is_running_and_refuses_a_second_press(qtbot) -> None:
    """Productive use: a user presses Verify twice while the suite is running.
    Expected outcome: the control says what it is doing and is disabled. Two suites
    at once would measure each other's half-finished tree."""
    view = RequirementsView()
    qtbot.addWidget(view)

    view.set_board(RequirementsBoardState(verifying=True))

    assert view.verify_button.text() == VERIFY_RUNNING
    assert view.verify_button.isEnabled() is False

    view.set_board(RequirementsBoardState(verifying=False))

    assert view.verify_button.text() == "Verify"
    assert view.verify_button.isEnabled() is True


@verifies(SWR.SWR_3615)
def test_an_adoption_in_flight_also_disables_verify(qtbot) -> None:
    """Productive use: the adoption offer is running and the user reaches for Verify.
    Expected outcome: disabled. Both run the workspace's whole check suite, and the
    board holds one slot for both rather than letting them collide."""
    view = RequirementsView()
    qtbot.addWidget(view)

    view.set_board(RequirementsBoardState(adopting=True))

    assert view.verify_button.isEnabled() is False


@verifies(SWR.SWR_3615)
def test_pressing_verify_asks_for_a_verification_and_nothing_else(qtbot) -> None:
    """Productive use: the user presses Verify.
    Expected outcome: one signal, carrying nothing — one run of the suite answers
    for every requirement it covers, so there is no per-card variant to confuse it
    with."""
    view = RequirementsView()
    qtbot.addWidget(view)
    asked: list[int] = []
    view.verification_requested.connect(lambda: asked.append(1))

    view.verify_button.click()

    assert asked == [1]
