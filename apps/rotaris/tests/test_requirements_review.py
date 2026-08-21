"""Reviewing a finished run: what was claimed, what was measured, what now.

The claim/measurement split is the point of the surface (SWR-3603), so it is
asserted *structurally* rather than by looking for two paragraphs: every element
of ``REVIEW_ELEMENTS`` has to sit inside the half it belongs to, and a line that
the agent wrote must not be reachable under the heading that says Rotaris
measured it.

The decision half writes through the **real** delivery machinery — a real
:class:`~rotaris_core.requirements.delivery.store.DeliveryStore` under
``tmp_path``, the real audit trail and the real guarded write path
:class:`~rotaris_core.requirements.execution.snapshot.ExecutionTransitions` —
because SWR-3604's whole claim is that a refused ``Accept`` names the engine's
own unmet conditions, and a stubbed refusal would verify the stub's prose.

Two things are faked, and both are external systems by the definition in
``apps/rotaris/AGENTS.md``: the agent a run would drive, and the Git worktree it
would get.
"""

from __future__ import annotations

import ast
import datetime as dt
import inspect
from pathlib import Path
from typing import TYPE_CHECKING

import pytest
from a11y import text_contrast_violations, unnamed_controls
from PySide6.QtCore import Qt
from PySide6.QtWidgets import QLabel, QPushButton, QWidget
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery.audit import AuditStore
from rotaris_core.requirements.delivery.completion import (
    CompletionEvidence,
    CoveringTestEvidence,
    UnitEvidence,
    UnitExecution,
    completion_gate,
)
from rotaris_core.requirements.delivery.projection import (
    BoardInputs,
    CheckOutcome,
    project_board,
)
from rotaris_core.requirements.delivery.state import (
    DeliveryActor,
    DeliveryState,
    TransitionCause,
)
from rotaris_core.requirements.delivery.store import DeliveryStore
from rotaris_core.requirements.delivery.transitions import TransitionRequest
from rotaris_core.requirements.execution.derivation import DerivedArtifactKind
from rotaris_core.requirements.execution.history import ExecutionHistory, RunRecord
from rotaris_core.requirements.execution.reader import WorkspaceExecution
from rotaris_core.requirements.execution.snapshot import ExecutionTransitions, capture_snapshot
from rotaris_core.requirements.execution.store import UnitStore
from rotaris_core.requirements.execution.units import ExecutionUnit, RequirementUnits, UnitState
from rotaris_core.requirements.model import CanonicalRequirement, RequirementLifecycle
from rotaris_core.requirements.registry import RequirementIndex
from ui_query import (
    accessible_names,
    click,
    find_all_by_accessible_name,
    find_by_accessible_name,
    settle,
    type_text,
)

from rotaris.models.store import WorkspaceStore
from rotaris.services import requirements_actions, requirements_controller
from rotaris.services.requirements_actions import (
    REVIEW_DECISIONS,
    ActionOutcome,
    BoardAction,
    RequirementActions,
    RequirementProposal,
    WorkspaceProposals,
)
from rotaris.services.requirements_controller import RequirementsController
from rotaris.views.requirement_review import (
    CLAIMED,
    CONTRADICTED_CLAIM,
    INSTRUCTIONS_REQUIRED,
    MEASURED,
    REVIEW_ELEMENTS,
    REVIEW_PANE,
    UNMEASURED_CLAIM,
    AgentClaim,
    DeferredReviews,
    ProjectionReviews,
    RequirementReview,
    RequirementReviewView,
    ReviewCheck,
    ReviewUnit,
    RotarisMeasurement,
    attach_review,
    build_review,
    element_lines,
)
from rotaris.views.requirements import RequirementsView

if TYPE_CHECKING:
    from collections.abc import Iterable, Mapping

    from rotaris_core.requirements.delivery.projection import BoardProjection
    from rotaris_core.requirements.execution.snapshot import RunSnapshot

pytestmark = pytest.mark.integration

NOW = dt.datetime(2026, 8, 15, 12, 0, tzinfo=dt.UTC)
SRC_ROOT = Path(__file__).resolve().parents[1] / "src" / "rotaris"


# ── a crafted review payload, for the rendering half ───────────────────────


def _review(**overrides: object) -> RequirementReview:
    """A complete review: the agent claimed something, Rotaris measured something."""
    base: dict[str, object] = {
        "req_id": "SWR-4101",
        "title": "The board shows a review",
        "run_id": "run-7",
        "snapshot_hash": "a1b2c3",
        "current_hash": "a1b2c3",
        "reason": "the run finished and is awaiting review",
        "claim": AgentClaim(
            summary="Implemented the review view and wired its decisions.",
            risks=("The queue panel was not touched.",),
            claimed_complete=True,
        ),
        "measurement": RotarisMeasurement(
            checks=(
                ReviewCheck(name="pytest", status="passed"),
                ReviewCheck(name="mypy", status="failed", detail="2 errors"),
            ),
            verified=True,
            changed_files=("apps/rotaris/src/rotaris/views/requirement_review.py",),
            added_traces=("apps/rotaris/src/rotaris/views/requirement_review.py:120",),
            added_tests=("apps/rotaris/tests/test_requirements_review.py:40",),
            unmet=(),
        ),
        "units": (
            ReviewUnit(
                unit_id="unit-1",
                state_label="Finished",
                outcome_label="Succeeded",
                run_id="run-7",
                session_id="session-7",
                branch="rotaris/req/swr-4101/unit-1",
                worktree_path="/tmp/trees/run-7",
            ),
        ),
        "branch": "rotaris/req/swr-4101/unit-1",
        "worktree_path": "/tmp/trees/run-7",
        "session_id": "session-7",
        "available": True,
    }
    base.update(overrides)
    return RequirementReview(**base)  # type: ignore[arg-type]


def _pane(qtbot, review: RequirementReview | None = None) -> RequirementReviewView:
    pane = RequirementReviewView()
    qtbot.addWidget(pane)
    pane.resize(1000, 680)
    pane.show()
    qtbot.waitExposed(pane)
    if review is not None:
        pane.show_review(review)
        settle(qtbot)
    return pane


def _inside(ancestor: QWidget, widget: QWidget) -> bool:
    """Whether *widget* is rendered somewhere below *ancestor*."""
    current: QWidget | None = widget
    while current is not None:
        if current is ancestor:
            return True
        parent = current.parent()
        current = parent if isinstance(parent, QWidget) else None
    return False


def _texts(root: QWidget) -> list[str]:
    return [label.text() for label in root.findChildren(QLabel) if label.text()]


# ── a real workspace, for the deciding half ────────────────────────────────


def _requirement(req_id: str, title: str = "") -> CanonicalRequirement:
    return CanonicalRequirement(
        req_id=req_id,
        title=title or f"{req_id} title",
        description=f"{req_id} says what the product does.",
        lifecycle=RequirementLifecycle.APPROVED,
        source_id="reqtocode",
        source_path=f"docs/requirements/{req_id}.md",
    )


def _complete_evidence(req_id: str, current_hash: str) -> CompletionEvidence:
    """Evidence that satisfies every condition of SWR-3215."""
    return CompletionEvidence(
        req_id=req_id,
        current_hash=current_hash,
        satisfied_hash=current_hash,
        units=(UnitEvidence(unit_id="unit-1", execution=UnitExecution.FINISHED),),
        implementation_traces=("src/rotaris_core/thing.py:12",),
        covering_tests=(
            CoveringTestEvidence(
                path="tests/unit/test_thing.py",
                line=40,
                executed=True,
                passed=True,
            ),
        ),
        gate_passed=True,
        integration_complete=True,
    )


def _unverified_evidence(req_id: str, current_hash: str) -> CompletionEvidence:
    """A requirement whose covering test exists but never ran (SWR-3215)."""
    return CompletionEvidence(
        req_id=req_id,
        current_hash=current_hash,
        satisfied_hash=current_hash,
        units=(UnitEvidence(unit_id="unit-1", execution=UnitExecution.FINISHED),),
        implementation_traces=("src/rotaris_core/thing.py:12",),
        covering_tests=(
            CoveringTestEvidence(path="tests/unit/test_thing.py", line=40, executed=False),
        ),
        gate_passed=False,
        integration_complete=True,
    )


class _Workspace:
    """One workspace with real delivery, execution and audit stores."""

    def __init__(
        self,
        root: Path,
        requirements: Iterable[CanonicalRequirement],
        *,
        evidence: Mapping[str, CompletionEvidence] | None = None,
    ) -> None:
        root.mkdir(parents=True, exist_ok=True)
        self.root = root
        self.requirements = {item.req_id: item for item in requirements}
        self._evidence = dict(evidence or {})
        self.store = DeliveryStore(root)
        self.history = ExecutionHistory(root)
        self.units = UnitStore(root)
        self.writer = ExecutionTransitions.for_workspace(
            root,
            current_for=self.requirements.get,
            completion=completion_gate(lambda record, request: self.evidence_for(request.req_id)),
        )

    def evidence_for(self, req_id: str) -> CompletionEvidence:
        known = self._evidence.get(req_id)
        if known is not None:
            return known
        requirement = self.requirements[req_id]
        return CompletionEvidence(req_id=req_id, current_hash=requirement.current_hash)

    def hash_for(self, req_id: str) -> str:
        requirement = self.requirements.get(req_id)
        return requirement.current_hash if requirement is not None else ""

    def snapshot(self, req_id: str, *, run_id: str = "run-1") -> RunSnapshot:
        return capture_snapshot(
            self.requirements[req_id],
            run_id=run_id,
            base_commit="a1b2c3d",
            at=NOW,
            unit_id="unit-1",
            session_id=f"session-{req_id.lower()}",
        )

    def delivery_for(self, req_id: str) -> object | None:
        from rotaris_core.requirements.delivery.satisfied import SatisfiedDelivery

        if req_id not in self.requirements:
            return None
        return SatisfiedDelivery.from_snapshot(self.snapshot(req_id), run_id="run-1", at=NOW)

    def advance(self, req_id: str, *states: DeliveryState) -> None:
        causes = {
            DeliveryState.READY: TransitionCause.USER_ACTION,
            DeliveryState.RUNNING: TransitionCause.RUN_STARTED,
            DeliveryState.REVIEW: TransitionCause.RUN_COMPLETED,
        }
        for offset, state in enumerate(states):
            outcome = self.writer.apply(
                TransitionRequest(
                    req_id=req_id,
                    target=state,
                    actor=DeliveryActor.system("requirement-flow"),
                    cause=causes.get(state, TransitionCause.USER_ACTION),
                    at=NOW + dt.timedelta(seconds=offset),
                    requirement_hash=self.hash_for(req_id),
                ),
            )
            assert outcome.accepted, outcome.message

    def finish_run(
        self,
        req_id: str,
        *,
        run_id: str = "run-1",
        changed_files: tuple[str, ...] = ("src/rotaris_core/thing.py",),
        checks: tuple[CheckOutcome, ...] = (CheckOutcome(name="pytest", status="passed"),),
        agent_summary: str = "implemented the requirement",
        agent_claimed_complete: bool = True,
        verified: bool | None = True,
    ) -> RunRecord:
        """Record a finished run the way the execution slice records one."""
        snapshot = self.snapshot(req_id, run_id=run_id)
        record = RunRecord.opening(snapshot, at=NOW).model_copy(
            update={
                "outcome": "succeeded",
                "worktree_path": str(self.root / "trees" / run_id),
                "branch": f"rotaris/req/{req_id.lower()}/unit-1",
                "produced_commits": ("c0ffee1",),
                "changed_files": changed_files,
                "checks": checks,
                "verified": verified,
                "agent_summary": agent_summary,
                "agent_risks": ("the worktree was not merged",),
                "agent_claimed_complete": agent_claimed_complete,
                "finished_at": NOW + dt.timedelta(minutes=5),
            },
        )
        self.units.save(
            RequirementUnits(
                req_id=req_id,
                units=(
                    ExecutionUnit(
                        req_id=req_id,
                        unit_id="unit-1",
                        title="the whole requirement",
                        state=UnitState.FINISHED,
                        run_ids=(run_id,),
                    ),
                ),
            ),
        )
        return self.history.append(record)

    def project(self) -> BoardProjection:
        reader = WorkspaceExecution(
            self.root,
            delivery=self.store,
            requirement_for=self.requirements.get,
        )
        ids = tuple(self.requirements)
        reviews = {}
        for req_id in ids:
            review = reader.review_for(req_id)
            if review is not None:
                reviews[req_id] = review
        return project_board(
            BoardInputs(
                index=RequirementIndex(
                    requirements=tuple(self.requirements.values()),
                    generation=1,
                ),
                delivery=self.store.load_all(),
                execution={req_id: reader.execution_for(req_id) for req_id in ids},
                reviews=reviews,
                evaluated_at=NOW,
            ),
        )


class _RecordingRuns:
    """A run starter that records what the review asked it to start."""

    def __init__(self) -> None:
        self.started: list[tuple[str, str]] = []

    def start(self, req_id: str, *, instructions: str = "") -> str:
        self.started.append((req_id, instructions))
        return f"run-{len(self.started)}"


class _BoardSource:
    """The bridge's port, answering from the live stores."""

    def __init__(self, workspace: _Workspace) -> None:
        self._workspace = workspace
        self.calls = 0

    def project(self) -> BoardProjection:
        self.calls += 1
        return self._workspace.project()


def _actions(workspace: _Workspace, *, runs: object | None = None) -> RequirementActions:
    return RequirementActions(
        workspace.writer,
        runs=runs,  # type: ignore[arg-type]
        hash_for=workspace.hash_for,
        delivery_for=workspace.delivery_for,  # type: ignore[arg-type]
        actor_name="dvf",
        clock=lambda: NOW,
    )


def _board(
    qtbot,
    workspace: _Workspace,
    *,
    runs: object | None = None,
) -> tuple[RequirementsController, RequirementsView, RequirementReviewView]:
    """A controller, a real board and the review pane attached to it."""
    store = WorkspaceStore()
    source = _BoardSource(workspace)
    controller = RequirementsController(store, source=source, clock=lambda: NOW)
    qtbot.addWidget(controller.surface)
    view = RequirementsView()
    controller.attach_view(view)
    controller.attach_actions(_actions(workspace, runs=runs))
    pane = attach_review(controller, reviews=ProjectionReviews(lambda _req_id: source.project()))
    controller.surface.resize(1000, 680)
    controller.surface.show()
    qtbot.waitExposed(controller.surface)
    with qtbot.waitSignal(controller.bridge.evaluated, timeout=5000):
        controller.refresh()
    settle(qtbot)
    return controller, view, pane


# ── SWR-3603: the review shows everything, and separates the two halves ────


@pytest.mark.unit
@verifies(SWR.SWR_3603)
def test_the_review_separates_what_the_agent_claimed_from_what_rotaris_measured(qtbot) -> None:
    """Productive use: a reviewer has to know which statements are evidence.
    Expected outcome: the agent's words and Rotaris' measurements are in
    separate, separately announced halves, and neither leaks into the other."""
    review = _review()
    pane = _pane(qtbot, review)

    claimed = find_by_accessible_name(pane, CLAIMED)
    measured = find_by_accessible_name(pane, MEASURED)
    assert claimed is not measured

    for element in REVIEW_ELEMENTS:
        widget = pane.element_widget(element.key)
        assert widget is not None, f"{element.key} is not on the review surface"
        if element.side == "claim":
            assert _inside(claimed, widget), f"{element.key} is not under {CLAIMED!r}"
            assert not _inside(measured, widget)
        elif element.side == "measurement":
            assert _inside(measured, widget), f"{element.key} is not under {MEASURED!r}"
            assert not _inside(claimed, widget)

    # The agent's sentence is reachable only under the half that says it is a
    # claim; the check Rotaris ran only under the half that says it measured it.
    summary = review.claim.summary
    assert summary in _texts(claimed)
    assert summary not in _texts(measured)
    assert "pytest: passed" in _texts(measured)
    assert "pytest: passed" not in _texts(claimed)
    # …and each half says, in words, whose statements it holds.
    assert "did not measure" in claimed.accessibleDescription()
    assert "Nothing here is the agent's word" in measured.accessibleDescription()


@pytest.mark.unit
@verifies(SWR.SWR_3603)
def test_a_claim_rotaris_never_measured_is_stated_as_unmeasured(qtbot) -> None:
    """Productive use: an agent reports success and nothing verified it.
    Expected outcome: the review says the claim stands unmeasured, up front."""
    review = _review(
        claim=AgentClaim(summary="All done.", claimed_complete=True),
        measurement=RotarisMeasurement(),
    )
    pane = _pane(qtbot, review)

    assert review.disagreement == UNMEASURED_CLAIM
    assert pane.disagreement.isVisible() is True
    assert pane.disagreement.text() == UNMEASURED_CLAIM
    assert "Rotaris has not verified this run." in element_lines(review, "verification")

    # A verdict that came back negative is a contradiction, not a silence.
    contradicted = _review(
        claim=AgentClaim(summary="All done.", claimed_complete=True),
        measurement=RotarisMeasurement(
            checks=(ReviewCheck(name="pytest", status="failed", detail="1 failed"),),
            verified=False,
        ),
    )
    assert contradicted.disagreement == CONTRADICTED_CLAIM

    # A measured run that agrees with the claim says nothing extra.
    agreed = _review()
    assert agreed.disagreement == ""
    pane.show_review(agreed)
    settle(qtbot)
    assert pane.disagreement.isVisible() is False


@pytest.mark.unit
@verifies(SWR.SWR_3603)
def test_every_listed_element_is_present_or_stated_as_unavailable(qtbot) -> None:
    """Productive use: a run recorded almost nothing and the reviewer opens it.
    Expected outcome: every element is on screen, each stating its own absence."""
    empty = _review(
        claim=AgentClaim(),
        measurement=RotarisMeasurement(),
        units=(),
        branch="",
        worktree_path="",
        snapshot_hash="",
        current_hash="",
    )
    pane = _pane(qtbot, empty)

    for element in REVIEW_ELEMENTS:
        widget = pane.element_widget(element.key)
        assert widget is not None, f"{element.key} vanished when it had no content"
        rendered = _texts(widget)
        if element.empty_message:
            assert element.empty_message in rendered, f"{element.key} rendered a blank"
        else:
            # The three elements that always have something to say do say it.
            assert element_lines(empty, element.key), f"{element.key} states nothing"
    assert "This run recorded no file change." in _texts(pane)
    assert "The agent reported no risk." in _texts(pane)


@pytest.mark.unit
@verifies(SWR.SWR_3603)
def test_the_specification_version_and_its_drift_are_stated(qtbot) -> None:
    """Productive use: somebody edited the requirement while its run was going.
    Expected outcome: the review names both versions and says it changed."""
    drifted = _review(snapshot_hash="a1b2c3", current_hash="d4e5f6")
    pane = _pane(qtbot, drifted)

    assert drifted.specification_changed is True
    sentence = drifted.specification_sentence
    assert "a1b2c3" in sentence
    assert "d4e5f6" in sentence
    assert "changed while the run was in flight" in sentence
    assert sentence in _texts(pane)

    stable = _review()
    assert stable.specification_changed is False
    assert "still the current version" in stable.specification_sentence


@pytest.mark.unit
@verifies(SWR.SWR_3603)
def test_a_requirement_that_is_not_in_review_says_so_rather_than_showing_nothing(
    qtbot,
    tmp_path: Path,
) -> None:
    """Productive use: a user opens the review of a backlog requirement.
    Expected outcome: the surface names the state it is actually in, and offers
    no decision that would act on a run that does not exist."""
    workspace = _Workspace(tmp_path / "ws", [_requirement("SWR-4102")])
    entry = workspace.project().entry("SWR-4102")
    assert entry is not None

    review = build_review(entry)

    assert review.available is False
    assert "Backlog" in review.unavailable_reason
    pane = _pane(qtbot, review)
    assert review.unavailable_reason in _texts(pane)
    accept = find_by_accessible_name(pane, "Accept SWR-4102", QPushButton)
    assert accept.isEnabled() is False
    assert accept.accessibleDescription() == review.unavailable_reason


# ── SWR-3604: six decisions, each naming its consequence ───────────────────


@pytest.mark.unit
@verifies(SWR.SWR_3604)
def test_all_six_decisions_are_reachable_and_each_names_its_consequence(qtbot) -> None:
    """Productive use: a reviewer weighs six options against their cost.
    Expected outcome: all six are on screen, enabled, and each states what it
    will do to the branch and the worktree before it is taken."""
    review = _review()
    pane = _pane(qtbot, review)

    assert len(REVIEW_DECISIONS) == 6
    names = accessible_names(pane, QPushButton, visible_only=True)
    for action in REVIEW_DECISIONS:
        label = f"{action.label} {review.req_id}"
        assert label in names, f"{action} is not reachable"
        button = find_by_accessible_name(pane, label, QPushButton, visible_only=True)
        assert button.isEnabled() is True
        # The engine's own sentence, on the control and beside it.
        assert button.toolTip() == action.consequence
        assert action.consequence in _texts(pane)
    # The two that keep the work say so, in the words the engine uses.
    assert "branches and worktrees are kept" in BoardAction.REJECT.consequence
    assert "keeps its worktree and branch" in BoardAction.KEEP_WORKTREE.consequence


@pytest.mark.unit
@verifies(SWR.SWR_3604)
def test_a_decision_that_starts_work_is_confirmed_before_it_fires(qtbot) -> None:
    """Productive use: a reviewer clicks Accept by accident.
    Expected outcome: nothing is decided until the consequence is confirmed."""
    review = _review()
    pane = _pane(qtbot, review)
    raised: list[tuple[str, str, str]] = []
    pane.decision_requested.connect(lambda *args: raised.append(args))

    click(qtbot, find_by_accessible_name(pane, f"Accept {review.req_id}", QPushButton))
    settle(qtbot)

    assert raised == []
    assert pane.armed == str(BoardAction.ACCEPT)
    assert BoardAction.ACCEPT.consequence in pane.confirm_label.text()
    click(
        qtbot,
        find_by_accessible_name(pane, f"Confirm accept of {review.req_id}", QPushButton),
    )
    settle(qtbot)
    assert raised == [(str(BoardAction.ACCEPT), review.req_id, "")]
    assert pane.armed == ""

    # A decision the engine does not mark for confirmation fires straight away.
    assert BoardAction.KEEP_WORKTREE.confirm is False
    click(qtbot, find_by_accessible_name(pane, f"Keep worktree {review.req_id}", QPushButton))
    settle(qtbot)
    assert raised[-1] == (str(BoardAction.KEEP_WORKTREE), review.req_id, "")


@pytest.mark.unit
@verifies(SWR.SWR_3604)
def test_sending_the_agent_back_needs_instructions_and_carries_them(qtbot) -> None:
    """Productive use: a reviewer wants one thing done differently.
    Expected outcome: the decision is unavailable until the correction is
    written, with the reason stated, and then it carries the text."""
    review = _review()
    pane = _pane(qtbot, review)
    raised: list[tuple[str, str, str]] = []
    pane.decision_requested.connect(lambda *args: raised.append(args))

    click(qtbot, find_by_accessible_name(pane, f"Send back {review.req_id}", QPushButton))
    settle(qtbot)

    confirm = find_by_accessible_name(pane, f"Confirm send back of {review.req_id}", QPushButton)
    assert confirm.isEnabled() is False
    assert confirm.toolTip() == INSTRUCTIONS_REQUIRED
    assert confirm.accessibleDescription() == INSTRUCTIONS_REQUIRED

    field = find_by_accessible_name(pane, "Instructions for the agent")
    type_text(qtbot, field, "Cover the refusal path with a test.")
    settle(qtbot)
    assert confirm.isEnabled() is True
    click(qtbot, confirm)
    settle(qtbot)

    assert raised == [
        (str(BoardAction.SEND_BACK), review.req_id, "Cover the refusal path with a test."),
    ]


@pytest.mark.unit
@verifies(SWR.SWR_3604)
def test_what_the_engine_answered_stands_until_it_is_read(qtbot) -> None:
    """Productive use: a reviewer's Accept is refused while they look away.
    Expected outcome: the refusal and every named condition stay on screen until
    dismissed, and an answer about another requirement never lands here."""
    pane = _pane(qtbot, _review())
    refusal = ActionOutcome(
        action=str(BoardAction.ACCEPT),
        req_id="SWR-4101",
        accepted=False,
        source="review",
        target="done",
        reason="every completion condition of SWR-3215 holds",
        details=("covering-tests-passed: tests/unit/test_a.py did not run",),
    )

    pane.show_outcome(refusal)
    settle(qtbot)

    assert pane.banner.isVisible() is True
    assert "refused" in pane.banner.title.text()
    assert pane.banner.message.text() == refusal.reason
    assert "covering-tests-passed" in pane.banner.details.text()
    # Nothing expires it, and the surface keeps offering the decisions.
    settle(qtbot)
    assert pane.banner.isVisible() is True
    click(qtbot, find_by_accessible_name(pane, "Dismiss the review notice", QPushButton))
    settle(qtbot)
    assert pane.banner.isVisible() is False

    # An answer about a requirement this surface is not showing never lands.
    pane.show_outcome(
        ActionOutcome(action=str(BoardAction.ACCEPT), req_id="SWR-9999", accepted=True),
    )
    settle(qtbot)
    assert pane.banner.isVisible() is False


@pytest.mark.unit
@verifies(SWR.SWR_3603)
def test_the_review_is_announced_readable_and_keyboard_reachable(qtbot) -> None:
    """Productive use: a screen-reader and keyboard user reviews a result.
    Expected outcome: every control announces a name, every label clears its
    WCAG AA ratio, and each decision is reachable without a mouse (SWR-3314)."""
    pane = _pane(qtbot, _review())

    unnamed = unnamed_controls(pane)
    assert not unnamed, f"the review has silent control(s): {unnamed}"
    violations = text_contrast_violations(pane)
    assert not violations, "unreadable text on the review surface:\n" + "\n".join(
        f"  {violation}" for violation in sorted({str(item) for item in violations})
    )

    for action in REVIEW_DECISIONS:
        button = find_by_accessible_name(
            pane,
            f"{action.label} SWR-4101",
            QPushButton,
            visible_only=True,
        )
        assert button.focusPolicy() != Qt.FocusPolicy.NoFocus, f"{action} cannot be tabbed to"
    # The armed confirmation puts the focus where the next keystroke belongs.
    pane._choose(BoardAction.SEND_BACK)  # noqa: SLF001 — the click path is covered above
    settle(qtbot)
    assert find_by_accessible_name(pane, "Instructions for the agent").hasFocus()
    # …and Escape takes the decision back rather than closing over it.
    qtbot.keyClick(pane, Qt.Key.Key_Escape)
    settle(qtbot)
    assert pane.armed == ""


# ── SWR-3612: the run's own surfaces stay the only ones ────────────────────


@pytest.mark.unit
@verifies(SWR.SWR_3612)
def test_the_review_and_queue_surfaces_rebuild_no_run_surface() -> None:
    """Productive use: somebody adds a transcript to the review view.
    Expected outcome: the sweep names it — those surfaces already exist."""
    owned_elsewhere = {
        "TranscriptView",
        "TranscriptListView",
        "AgentTree",
        "WorktreeInfo",
        "TranscriptEvent",
        "RunBridge",
        "GitWorktreeService",
    }
    violations: list[str] = []
    for name in ("views/requirement_review.py", "views/requirement_queue.py"):
        source = (SRC_ROOT / name).read_text(encoding="utf-8")
        for node in ast.walk(ast.parse(source)):
            if isinstance(node, ast.ImportFrom):
                violations.extend(
                    f"{name}: imports {alias.name}"
                    for alias in node.names
                    if alias.name in owned_elsewhere
                )
            if isinstance(node, ast.ClassDef) and any(
                token in node.name for token in ("Transcript", "AgentTree", "WorktreeList")
            ):
                violations.append(f"{name}: declares {node.name}")
    assert violations == [], "\n".join(violations)


@pytest.mark.unit
@verifies(SWR.SWR_3612)
def test_a_unit_run_opens_where_it_already_lives(qtbot) -> None:
    """Productive use: a reviewer wants the transcript of the run being reviewed.
    Expected outcome: the review raises the session and the branch, and draws
    neither a transcript nor a worktree of its own."""
    review = _review()
    pane = _pane(qtbot, review)
    sessions: list[str] = []
    branches: list[str] = []
    files: list[tuple[str, int]] = []
    pane.open_run_requested.connect(sessions.append)
    pane.open_commit_requested.connect(branches.append)
    pane.open_file_requested.connect(lambda path, line: files.append((path, line)))

    click(
        qtbot,
        find_by_accessible_name(
            pane,
            "Open the session of unit-1 in the Workspace view",
            QPushButton,
        ),
    )
    click(
        qtbot,
        find_by_accessible_name(pane, f"Open {review.branch} in the Git view", QPushButton),
    )
    changed = review.measurement.changed_files[0]
    click(qtbot, find_by_accessible_name(pane, f"Open the diff of {changed}", QPushButton))
    settle(qtbot)

    assert sessions == ["session-7"]
    assert branches == [review.branch]
    assert files == [(changed, 0)]


# ── integration: a real run, a real board, a real write path ───────────────


@verifies(SWR.SWR_3603)
def test_a_completed_run_produces_a_review_of_its_real_files_and_checks(
    qtbot,
    tmp_path: Path,
) -> None:
    """Productive use: a run finishes and the user opens its review.
    Expected outcome: the changed files and the check results on screen are the
    ones the run actually recorded, read back through the engine."""
    workspace = _Workspace(tmp_path / "ws", [_requirement("SWR-4103")])
    workspace.advance("SWR-4103", DeliveryState.READY, DeliveryState.RUNNING, DeliveryState.REVIEW)
    workspace.finish_run(
        "SWR-4103",
        changed_files=("src/rotaris_core/alpha.py", "tests/unit/test_alpha.py"),
        checks=(
            CheckOutcome(name="pytest", status="passed", detail="41 passed"),
            CheckOutcome(name="ruff", status="failed", detail="1 error"),
        ),
    )
    controller, view, pane = _board(qtbot, workspace)

    controller.open_review("SWR-4103")
    settle(qtbot)

    assert view.page == REVIEW_PANE
    review = pane.review
    assert review is not None and review.available is True
    assert review.measurement.changed_files == (
        "src/rotaris_core/alpha.py",
        "tests/unit/test_alpha.py",
    )
    assert [check.sentence for check in review.measurement.checks] == [
        "pytest: passed — 41 passed",
        "ruff: failed — 1 error",
    ]
    rendered = _texts(pane)
    assert "src/rotaris_core/alpha.py" in rendered
    assert "ruff: failed — 1 error" in rendered
    # The unit and the branch the run really used, not a placeholder.
    assert review.units[0].unit_id == "unit-1"
    assert review.branch == "rotaris/req/swr-4103/unit-1"
    controller.shutdown()


@verifies(SWR.SWR_3604)
def test_rejecting_an_integration_keeps_the_branches_and_leaves_it_actionable(
    qtbot,
    tmp_path: Path,
) -> None:
    """Productive use: a reviewer rejects a result that was integrated wrongly.
    Expected outcome: the requirement returns to Ready with its branch and
    worktree still recorded, so the work can be inspected and re-run."""
    workspace = _Workspace(tmp_path / "ws", [_requirement("SWR-4104")])
    workspace.advance("SWR-4104", DeliveryState.READY, DeliveryState.RUNNING, DeliveryState.REVIEW)
    workspace.finish_run("SWR-4104")
    controller, _view, pane = _board(qtbot, workspace)
    controller.open_review("SWR-4104")
    settle(qtbot)

    click(qtbot, find_by_accessible_name(pane, "Reject SWR-4104", QPushButton))
    settle(qtbot)

    assert workspace.store.read("SWR-4104").state is DeliveryState.READY
    history = workspace.history.load("SWR-4104")
    assert history.branches == ("rotaris/req/swr-4104/unit-1",)
    assert history.worktrees != ()
    # …and the board can act on it again: it is back on a column with moves.
    assert controller.move_options_for("SWR-4104") != ()
    controller.shutdown()


@verifies(SWR.SWR_3604)
def test_accepting_with_unmet_conditions_is_refused_with_the_conditions_named(
    qtbot,
    tmp_path: Path,
) -> None:
    """Productive use: a reviewer accepts a result whose test never ran.
    Expected outcome: the engine refuses and the review names the condition."""
    requirement = _requirement("SWR-4105")
    workspace = _Workspace(
        tmp_path / "ws",
        [requirement],
        evidence={"SWR-4105": _unverified_evidence("SWR-4105", requirement.current_hash)},
    )
    workspace.advance("SWR-4105", DeliveryState.READY, DeliveryState.RUNNING, DeliveryState.REVIEW)
    workspace.finish_run("SWR-4105", verified=None, checks=())
    controller, _view, pane = _board(qtbot, workspace)
    controller.open_review("SWR-4105")
    settle(qtbot)

    click(qtbot, find_by_accessible_name(pane, "Accept SWR-4105", QPushButton))
    settle(qtbot)
    click(qtbot, find_by_accessible_name(pane, "Confirm accept of SWR-4105", QPushButton))
    settle(qtbot)

    assert workspace.store.read("SWR-4105").state is DeliveryState.REVIEW
    assert pane.banner.isVisible() is True
    stated = f"{pane.banner.title.text()} {pane.banner.message.text()} {pane.banner.details.text()}"
    assert "refused" in stated
    assert "covering-tests-passed" in stated
    # …and the notice offers the one thing that helps: reading the review again,
    # since the decision was taken on a payload the engine has now judged.
    click(qtbot, find_by_accessible_name(pane, "Reload this review", QPushButton))
    settle(qtbot)
    assert pane.req_id == "SWR-4105"
    assert pane.banner.isVisible() is False
    controller.shutdown()


# ── user flows ─────────────────────────────────────────────────────────────


@pytest.mark.e2e
@verifies(SWR.SWR_3603)
def test_a_user_reviews_a_finished_requirement_and_sees_diff_tests_and_branch(
    qtbot,
    tmp_path: Path,
) -> None:
    """Productive use: a user opens a finished requirement to review it.
    Expected outcome: from the board they reach one surface holding the changed
    files, the checks and the branch — readable at the minimum window size."""
    workspace = _Workspace(tmp_path / "ws", [_requirement("SWR-4106")])
    workspace.advance("SWR-4106", DeliveryState.READY, DeliveryState.RUNNING, DeliveryState.REVIEW)
    workspace.finish_run("SWR-4106", changed_files=("src/rotaris_core/beta.py",))
    controller, view, pane = _board(qtbot, workspace)
    qtbot.waitUntil(lambda: not view.populating, timeout=20000)

    # The user opens the requirement, then its review, through visible controls.
    view.requirement_activated.emit("SWR-4106")
    settle(qtbot)
    click(qtbot, find_by_accessible_name(view, "Open the review of SWR-4106", QPushButton))
    settle(qtbot)

    assert view.page == REVIEW_PANE
    names = accessible_names(pane, QPushButton, visible_only=True)
    assert "Open the diff of src/rotaris_core/beta.py" in names
    assert "Open rotaris/req/swr-4106/unit-1 in the Git view" in names
    assert "pytest: passed" in _texts(pane)
    # Readable at 1000×680: nothing on the surface forces the window wider, and
    # the changed file the user came for is on screen rather than clipped away.
    assert controller.surface.size().width() == 1000
    assert pane.minimumSizeHint().width() <= 1000
    assert controller.surface.minimumSizeHint().width() <= 1000
    diff = find_by_accessible_name(
        pane,
        "Open the diff of src/rotaris_core/beta.py",
        QPushButton,
        visible_only=True,
    )
    assert pane.rect().contains(diff.mapTo(pane, diff.rect().topLeft()))
    controller.shutdown()


@pytest.mark.e2e
@verifies(SWR.SWR_3604)
def test_a_user_sends_the_agent_back_and_the_next_run_receives_the_correction(
    qtbot,
    tmp_path: Path,
) -> None:
    """Productive use: a reviewer wants one correction before accepting.
    Expected outcome: the requirement is released again and the run that starts
    is given the reviewer's own words."""
    workspace = _Workspace(tmp_path / "ws", [_requirement("SWR-4107")])
    workspace.advance("SWR-4107", DeliveryState.READY, DeliveryState.RUNNING, DeliveryState.REVIEW)
    workspace.finish_run("SWR-4107")
    runs = _RecordingRuns()
    controller, _view, pane = _board(qtbot, workspace, runs=runs)
    controller.open_review("SWR-4107")
    settle(qtbot)

    click(qtbot, find_by_accessible_name(pane, "Send back SWR-4107", QPushButton))
    settle(qtbot)
    type_text(
        qtbot,
        find_by_accessible_name(pane, "Instructions for the agent"),
        "Name the unmet condition in the refusal.",
    )
    click(qtbot, find_by_accessible_name(pane, "Confirm send back of SWR-4107", QPushButton))
    settle(qtbot)

    assert runs.started == [("SWR-4107", "Name the unmet condition in the refusal.")]
    assert workspace.store.read("SWR-4107").state is DeliveryState.READY
    # The instruction travels twice (SWR-3604): into the run above, and onto the
    # audit trail, so a later reader can see what the agent was told.
    transitions = AuditStore(workspace.root).read("SWR-4107").transitions()
    assert "Name the unmet condition" in transitions[-1].detail
    assert transitions[-1].actor.name == "dvf"
    controller.shutdown()


@pytest.mark.e2e
@verifies(SWR.SWR_3612)
def test_a_user_follows_a_reviewed_run_into_its_session_and_back(
    qtbot,
    tmp_path: Path,
) -> None:
    """Productive use: a reviewer wants to read the transcript of the run.
    Expected outcome: the Workspace view is focused on that session, and the
    board is still where they left it when they come back."""
    workspace = _Workspace(tmp_path / "ws", [_requirement("SWR-4108")])
    workspace.advance("SWR-4108", DeliveryState.READY, DeliveryState.RUNNING, DeliveryState.REVIEW)
    workspace.finish_run("SWR-4108")
    store = WorkspaceStore()
    source = _BoardSource(workspace)
    controller = RequirementsController(store, source=source, clock=lambda: NOW)
    qtbot.addWidget(controller.surface)
    view = RequirementsView()
    controller.attach_view(view)
    pane = attach_review(controller, reviews=ProjectionReviews(lambda _req_id: source.project()))
    controller.surface.resize(1000, 680)
    controller.surface.show()
    qtbot.waitExposed(controller.surface)
    with qtbot.waitSignal(controller.bridge.evaluated, timeout=5000):
        controller.refresh()
    settle(qtbot)
    controller.open_review("SWR-4108")
    settle(qtbot)

    click(
        qtbot,
        find_by_accessible_name(
            pane,
            "Open the session of unit-1 in the Workspace view",
            QPushButton,
        ),
    )
    settle(qtbot)

    assert store.focused_session_id == "session-swr-4108"
    assert store.ui.active_view == "workspace"
    # Coming back leaves the board on the requirement the user was reviewing.
    click(qtbot, find_by_accessible_name(pane, "Back to the requirement board", QPushButton))
    settle(qtbot)
    assert view.page == "board"
    assert store.requirements.selected_req_id == "SWR-4108"
    controller.shutdown()


# ── SWR-3613: a derived technical requirement is offered, never written ────


def _proposal(**overrides: object) -> RequirementProposal:
    """One offer, carrying the two sentences SWR-3411 asks to be stated."""
    base: dict[str, object] = {
        "req_id": "SWR-4101",
        "key": "run-7:1",
        "title": "A deterministic merge journal",
        "rationale": "the integration order has to be replayable",
        "run_id": "run-7",
        "permanence": DerivedArtifactKind.TECHNICAL_REQUIREMENT.explanation,
        "transience": DerivedArtifactKind.UNIT.explanation,
    }
    base.update(overrides)
    return RequirementProposal(**base)  # type: ignore[arg-type]


def _reqtocode_store(root: Path, req_id: str = "SWR-4201") -> Path:
    """A workspace whose requirements live where ReqToCode keeps them."""
    store = root / "docs" / "requirements"
    (store / "4200-derivation").mkdir(parents=True)
    (store / "4200-derivation.md").write_text(
        "---\nreq-id: SWR-4200\nstatus: approved\ntrace: optional\ntest: optional\n"
        'title: "Derivation"\ndate: 2026-08-15\n---\n\n# 4200 — Derivation\n',
        encoding="utf-8",
    )
    (store / "4200-derivation" / f"{req_id}-merge-order.md").write_text(
        f"---\nreq-id: {req_id}\nstatus: approved\ntrace: optional\ntest: optional\n"
        'title: "Units merge in a stated order"\nepic: SWR-4200\ndate: 2026-08-15\n---\n\n'
        f"# {req_id} — Units merge in a stated order\n\n"
        "Rotaris merges finished units in an order the user can read.\n",
        encoding="utf-8",
    )
    return root


def _from_disk(root: Path) -> _Workspace:
    """A `_Workspace` over the requirements that are actually on disk."""
    from rotaris_core.requirements.sources.reqtocode import reqtocode_source_for

    source = reqtocode_source_for(root)
    assert source is not None, "the store this test wrote is not a ReqToCode store"
    return _Workspace(root, source.read().requirements)


@pytest.mark.unit
@verifies(SWR.SWR_3613, SWR.SWR_3411)
def test_the_review_offers_a_proposed_technical_requirement_and_says_what_it_is(
    qtbot,
) -> None:
    """Productive use: a run discovered a lasting obligation and offers it.

    Expected outcome: the review presents the proposal, states in words why a
    technical requirement is not an execution unit, and offers one control that
    accepts it — the offer SWR-3411 promised and nothing ever built.
    """
    offer = _proposal()
    pane = _pane(qtbot, _review(proposals=(offer,)))

    element = pane.element_widget("proposals")
    assert element is not None, "the review has no place for what a run proposed"
    lines = element_lines(pane.review, "proposals")
    assert lines == (offer.sentence,)
    stated = " ".join(_texts(element))
    assert offer.title in stated
    # The difference SWR-3411 asks for, stated where the proposal is presented.
    assert "permanent" in stated
    assert "work split" in stated
    # …and one control that accepts this one, naming which.
    accept = find_by_accessible_name(
        pane,
        f"Accept the technical requirement {offer.title}",
        QPushButton,
        visible_only=True,
    )
    assert accept.isEnabled()
    assert "requirement store" in accept.toolTip()

    # A run that proposed nothing says so rather than showing an empty box.
    pane.show_review(_review())
    settle(qtbot)
    empty = pane.element_widget("proposals")
    assert empty is not None
    assert "proposed no technical requirement" in empty.accessibleDescription()
    assert not find_all_by_accessible_name(
        pane,
        f"Accept the technical requirement {offer.title}",
        QPushButton,
    )


@pytest.mark.unit
@verifies(SWR.SWR_3613, SWR.SWR_3604)
def test_accepting_a_proposal_is_confirmed_and_names_the_one_that_was_clicked(
    qtbot,
) -> None:
    """Productive use: a reviewer accepts one of two proposals.

    Expected outcome: the confirmation names the proposal they clicked, and the
    decision that leaves the surface carries that proposal's own key — creating
    a permanent requirement is not something a stray click may do.
    """
    first = _proposal(key="run-7:1", title="A deterministic merge journal")
    second = _proposal(key="run-7:2", title="A stable worktree naming scheme")
    pane = _pane(qtbot, _review(proposals=(first, second)))

    click(
        qtbot,
        find_by_accessible_name(
            pane,
            f"Accept the technical requirement {second.title}",
            QPushButton,
            visible_only=True,
        ),
    )
    settle(qtbot)

    assert pane.armed == str(BoardAction.ACCEPT_PROPOSAL)
    assert pane.armed_detail == second.key
    assert second.title in pane.confirm_label.text()
    assert BoardAction.ACCEPT_PROPOSAL.consequence in pane.confirm_label.text()

    with qtbot.waitSignal(pane.decision_requested, timeout=1000) as caught:
        click(qtbot, find_by_accessible_name(pane, "Confirm accept proposal of SWR-4101"))
    assert caught.args == [str(BoardAction.ACCEPT_PROPOSAL), "SWR-4101", second.key]
    # Cancelling instead writes nothing and leaves nothing armed.
    click(qtbot, find_by_accessible_name(pane, f"Accept the technical requirement {first.title}"))
    settle(qtbot)
    click(qtbot, find_by_accessible_name(pane, "Cancel accept proposal of SWR-4101"))
    settle(qtbot)
    assert pane.armed == ""
    assert pane.armed_detail == ""


@verifies(SWR.SWR_3613, SWR.SWR_3411, SWR.SWR_3112)
def test_a_run_offers_a_technical_requirement_and_nothing_is_written_until_it_is_accepted(
    tmp_path: Path,
) -> None:
    """Productive use: a run ends having discovered a lasting obligation.

    Expected outcome: the offer waits, the project's store is untouched, and the
    acceptance — and only the acceptance — creates the requirement, with its
    origin as its derived-from link and a record on the origin's audit trail.
    """
    root = _reqtocode_store(tmp_path / "ws")
    proposals = WorkspaceProposals(root, clock=lambda: NOW)
    before = sorted(path.name for path in (root / "docs" / "requirements").rglob("*.md"))

    proposals.offer(
        (
            _proposal(
                req_id="SWR-4201",
                key="run-1:1",
                title="Unit merges are journalled",
                rationale="the integration order has to be replayable",
            ),
        ),
    )

    # Offered, and nothing written: that is the whole of SWR-3613.
    waiting = proposals.pending("SWR-4201")
    assert [item.title for item in waiting] == ["Unit merges are journalled"]
    assert sorted(path.name for path in (root / "docs" / "requirements").rglob("*.md")) == before

    outcome = proposals.accept("SWR-4201", "run-1:1")

    assert outcome.accepted, outcome.message
    assert outcome.created_id
    created = sorted(
        set(path.name for path in (root / "docs" / "requirements").rglob("*.md")) - set(before),
    )
    assert len(created) == 1, f"the acceptance wrote {created}"
    written = next((root / "docs" / "requirements").rglob(created[0]))
    text = written.read_text(encoding="utf-8")
    assert "type: technical" in text
    assert "derived-from: SWR-4201" in text
    # The origin's audit trail says a requirement was derived from it (SWR-3213).
    detail = " ".join(event.detail for event in AuditStore(root).read("SWR-4201").events)
    assert outcome.created_id in detail
    # …and the offer is gone, so nobody is asked to decide about it twice.
    assert proposals.pending("SWR-4201") == ()
    assert proposals.accept("SWR-4201", "run-1:1").accepted is False


@verifies(SWR.SWR_3613, SWR.SWR_3609, SWR.SWR_3610)
def test_accepting_a_proposal_goes_through_the_board_write_path_and_is_attributed(
    tmp_path: Path,
) -> None:
    """Productive use: months later, someone asks who accepted this requirement.

    Expected outcome: the acceptance went through the board's one write path,
    so it carries the person's name and the version they acted on — and a
    refused acceptance says why and changes nothing.
    """
    root = _reqtocode_store(tmp_path / "ws")
    workspace = _from_disk(root)
    proposals = WorkspaceProposals(root, clock=lambda: NOW)
    proposals.offer((_proposal(req_id="SWR-4201", key="run-1:1", title="A merge journal"),))
    actions = RequirementActions(
        workspace.writer,
        hash_for=workspace.hash_for,
        proposals=proposals,
        actor_name="dvf",
        clock=lambda: NOW,
    )

    outcome = actions.perform(BoardAction.ACCEPT_PROPOSAL, "SWR-4201", detail="run-1:1")

    assert outcome.accepted, outcome.reason
    assert outcome.recorded is True
    events = AuditStore(root).read("SWR-4201").events
    mine = [event for event in events if event.actor.name == "dvf"]
    assert mine, "the acceptance left no attributed record"
    assert mine[-1].requirement_hash == workspace.hash_for("SWR-4201")

    # A key nobody offered is refused, with a reason, and writes nothing.
    refused = actions.perform(BoardAction.ACCEPT_PROPOSAL, "SWR-4201", detail="run-9:9")
    assert refused.accepted is False
    assert "nothing waiting" in refused.reason or "no technical requirement" in refused.reason
    assert refused.recorded is False


@pytest.mark.unit
@verifies(SWR.SWR_3613)
def test_the_offer_and_the_acceptance_never_consult_confirm_source_writes() -> None:
    """Productive use: a workspace that confirms every source write is still offered one.

    Expected outcome: this path does not read the flag at all. Its justification
    is that the write is already a user action, which becomes true here exactly
    when there is an offer to accept — and the acceptance *is* that action.
    """
    tree = ast.parse(inspect.getsource(requirements_actions))

    reads = [
        node.attr
        for node in ast.walk(tree)
        if isinstance(node, ast.Attribute) and node.attr == "confirm_source_writes"
    ]
    assert not reads, "the offer path reads a flag SWR-3613 replaced with the offer itself"


@verifies(SWR.SWR_3317, SWR.SWR_3603)
def test_opening_a_review_reads_it_off_the_qt_thread_and_says_so_meanwhile(
    qtbot,
    tmp_path: Path,
) -> None:
    """Productive use: a reviewer opens a review on a large project.

    Expected outcome: the click returns at once with the surface stating it is
    reading, the decisions stay unavailable until there is something to decide
    about, and the real review replaces it when the worker answers.
    """
    workspace = _Workspace(tmp_path / "ws", [_requirement("SWR-4109")])
    workspace.advance("SWR-4109", DeliveryState.READY, DeliveryState.RUNNING, DeliveryState.REVIEW)
    workspace.finish_run("SWR-4109")
    source = _BoardSource(workspace)
    deferred = DeferredReviews(ProjectionReviews(lambda _req_id: source.project()))
    pane = _pane(qtbot)
    pane._reviews = deferred  # noqa: SLF001 — the seam attach_review wires
    deferred.ready.connect(pane.show_review)

    assert pane.open("SWR-4109") is True

    # The click has returned, and the surface says what is happening rather than
    # showing a blank one or freezing until the stores have been read.
    assert pane.review is not None
    assert pane.review.available is False
    assert "reading" in pane.state_label.text().casefold()
    assert deferred.reading is True
    accept = pane.decision_button(str(BoardAction.ACCEPT))
    assert accept is not None and accept.isEnabled() is False
    # A second click while the first read is in flight starts nothing: two
    # answers racing into one pane is worse than the second click doing nothing.
    reads = source.calls
    assert pane.open("SWR-4109") is True
    assert source.calls == reads

    with qtbot.waitSignal(deferred.ready, timeout=20000):
        pass
    settle(qtbot)

    assert pane.review is not None
    assert pane.review.available is True
    assert pane.review.req_id == "SWR-4109"
    assert pane.decision_button(str(BoardAction.ACCEPT)).isEnabled() is True
    deferred.shutdown()


@pytest.mark.integration
@verifies(SWR.SWR_3317, SWR.SWR_3603)
def test_opening_a_second_review_never_shows_the_first_ones_answer(
    qtbot,
    tmp_path: Path,
) -> None:
    """Productive use: a reviewer opens one requirement, changes their mind, opens another.

    Expected outcome: they are shown the review they asked for second. The first
    read cannot be cancelled once it is on the thread, so its answer is dropped
    on arrival rather than rendered — showing it would arm Accept and Reject
    against work the reviewer is no longer looking at, which is the worst shape
    a stale read can take on a decision surface.
    """
    workspace = _Workspace(
        tmp_path / "ws",
        [_requirement("SWR-4110"), _requirement("SWR-4111")],
    )
    for req_id in ("SWR-4110", "SWR-4111"):
        workspace.advance(req_id, DeliveryState.READY, DeliveryState.RUNNING, DeliveryState.REVIEW)
        workspace.finish_run(req_id)
    source = _BoardSource(workspace)
    deferred = DeferredReviews(ProjectionReviews(lambda _req_id: source.project()))
    pane = _pane(qtbot)
    pane._reviews = deferred  # noqa: SLF001 — the seam attach_review wires
    deferred.ready.connect(pane.show_review)

    assert pane.open("SWR-4110") is True
    # …and immediately change to another, while the first read is still in flight.
    assert pane.open("SWR-4111") is True
    assert deferred.wanted == "SWR-4111", "the second requirement is the one being waited for"

    with qtbot.waitSignal(deferred.ready, timeout=20000):
        pass
    settle(qtbot)

    assert pane.review is not None
    assert pane.review.req_id == "SWR-4111", (
        "the reviewer was shown the review they did not ask for"
    )
    assert pane.review.available is True
    # The armed controls belong to what is on screen, not to what was abandoned.
    assert str(pane.review.req_id) in pane.title.text()
    deferred.shutdown()


@pytest.mark.e2e
@verifies(SWR.SWR_3613, SWR.SWR_3411)
def test_a_user_is_offered_a_derived_requirement_and_accepting_it_updates_the_store(
    qtbot,
    tmp_path: Path,
) -> None:
    """Productive use: a run finishes, proposes a technical requirement, and the
    reviewer accepts it.

    Expected outcome: the offer is on the review of the requirement whose run
    made it, accepting it through the visible controls creates the requirement
    in the project's own store, and the store on disk has one more requirement
    than it started with.

    Driven through the production composition: the area's own controller builds
    its board, its write path and its review surface, and the only thing this
    test supplies is the workspace and the run that finished in it.
    """
    root = _reqtocode_store(tmp_path / "ws")
    workspace = _from_disk(root)
    workspace.advance("SWR-4201", DeliveryState.READY, DeliveryState.RUNNING, DeliveryState.REVIEW)
    workspace.finish_run("SWR-4201", changed_files=("src/rotaris_core/merge.py",))
    # What a finished run leaves behind (SWR-3411): an offer, and nothing else.
    WorkspaceProposals(root, clock=lambda: NOW).offer(
        (
            _proposal(
                req_id="SWR-4201",
                key="run-1:1",
                title="Unit merges are journalled",
                rationale="the integration order has to be replayable",
            ),
        ),
    )
    before = {path.name for path in (root / "docs" / "requirements").rglob("*.md")}

    store = WorkspaceStore()
    controller = RequirementsController(store, workspace=root, clock=lambda: NOW)
    qtbot.addWidget(controller.surface)
    controller.surface.resize(1000, 680)
    controller.surface.show()
    qtbot.waitExposed(controller.surface)
    with qtbot.waitSignal(controller.bridge.evaluated, timeout=60000):
        controller.refresh()
    settle(qtbot)

    # Nobody wires a review here: the area installs its own (SWR-3316).
    controller.open_review("SWR-4201")
    settle(qtbot)
    view = controller.view
    assert view is not None
    pane = view.pane(REVIEW_PANE)
    assert isinstance(pane, RequirementReviewView)
    qtbot.waitUntil(lambda: pane.review is not None and pane.review.available, timeout=60000)
    settle(qtbot)

    # The offer is there, and it says what kind of thing it is.
    assert [item.title for item in pane.review.proposals] == ["Unit merges are journalled"]
    assert "permanent" in " ".join(_texts(pane.element_widget("proposals")))

    click(
        qtbot,
        find_by_accessible_name(
            pane,
            "Accept the technical requirement Unit merges are journalled",
            QPushButton,
            visible_only=True,
        ),
    )
    settle(qtbot)
    click(
        qtbot,
        find_by_accessible_name(pane, "Confirm accept proposal of SWR-4201", QPushButton),
    )
    settle(qtbot)

    after = {path.name for path in (root / "docs" / "requirements").rglob("*.md")}
    created = sorted(after - before)
    assert len(created) == 1, f"accepting the offer wrote {created}"
    text = next((root / "docs" / "requirements").rglob(created[0])).read_text(encoding="utf-8")
    assert "type: technical" in text
    assert "derived-from: SWR-4201" in text
    # …and the reviewer is told, in the engine's own words.
    assert pane.banner.isVisible() is True
    assert "accept proposal accepted" in pane.banner.title.text()
    controller.shutdown()


# ── SWR-3315: the area installs its own review surface ─────────────────────


@pytest.mark.integration
@verifies(SWR.SWR_3603, SWR.SWR_3315)
def test_a_board_nobody_wired_a_review_into_still_opens_one(qtbot, tmp_path: Path) -> None:
    """Productive use: the product opens a requirement in Review.
    Expected outcome: the review surface exists without any caller having
    attached one — a pane the application cannot reach is a requirement with no
    effect — and it carries this requirement's own run."""
    workspace = _Workspace(tmp_path / "ws", [_requirement("SWR-4108")])
    workspace.advance("SWR-4108", DeliveryState.READY, DeliveryState.RUNNING, DeliveryState.REVIEW)
    workspace.finish_run("SWR-4108", changed_files=("src/rotaris_core/beta.py",))
    store = WorkspaceStore()
    source = _BoardSource(workspace)
    controller = RequirementsController(store, source=source, clock=lambda: NOW)
    qtbot.addWidget(controller.surface)
    view = RequirementsView()
    controller.attach_view(view)
    controller.surface.resize(1000, 680)
    controller.surface.show()
    qtbot.waitExposed(controller.surface)
    with qtbot.waitSignal(controller.bridge.evaluated, timeout=5000):
        controller.refresh()
    settle(qtbot)

    assert REVIEW_PANE not in view.panes, "nothing has attached a review yet"

    controller.open_review("SWR-4108")
    settle(qtbot)

    assert REVIEW_PANE in view.panes, "the area installs the surface it owns (SWR-3315)"
    assert view.page == REVIEW_PANE, "opening a review shows it"
    # A second open reuses the one that is there rather than stacking another.
    assert controller.install_review() is False
    controller.shutdown()


@pytest.mark.unit
@verifies(SWR.SWR_3603, SWR.SWR_3315)
def test_the_controller_and_the_review_agree_on_the_pane_key() -> None:
    """Productive use: somebody renames the review pane's key.
    Expected outcome: the mismatch is named here rather than showing up as a
    second review surface stacked behind the first."""
    assert requirements_controller._REVIEW_PANE == REVIEW_PANE  # noqa: SLF001 — the mirror
