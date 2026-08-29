"""The board as a writing surface: drops, refusals, attribution and the guard.

Every test here writes through the **real** delivery machinery — a real
:class:`~rotaris_core.requirements.delivery.store.DeliveryStore` under
``tmp_path``, the real audit trail, and the real guarded write path
:class:`~rotaris_core.requirements.execution.snapshot.ExecutionTransitions`.
Nothing stubs a transition outcome, because the whole claim of SWR-3602 is that
the sentence a user reads is the engine's own, and a stubbed refusal would
verify the stub's prose instead.

Two things *are* faked, and both are external systems by the definition in
``apps/rotaris/AGENTS.md``: the agent that a run would drive (a
:class:`~rotaris_core.requirements.execution.run_seam.RunHost`) and the Git
worktree a run would get (an
:class:`~rotaris_core.requirements.execution.run_seam.IsolationProvider`). The
seam between them is the engine's own and runs for real.
"""

from __future__ import annotations

import ast
import datetime as dt
import threading
from pathlib import Path
from typing import TYPE_CHECKING

import pytest
from PySide6.QtCore import QMimeData, QPoint, Qt
from PySide6.QtGui import QDropEvent
from PySide6.QtWidgets import QPushButton
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery.audit import AuditEventKind, AuditStore
from rotaris_core.requirements.delivery.completion import (
    CompletionEvidence,
    CoveringTestEvidence,
    UnitEvidence,
    UnitExecution,
    completion_gate,
)
from rotaris_core.requirements.delivery.projection import BoardInputs, project_board
from rotaris_core.requirements.delivery.satisfied import SatisfiedDelivery
from rotaris_core.requirements.delivery.state import (
    ActorKind,
    DeliveryActor,
    DeliveryState,
    TransitionCause,
)
from rotaris_core.requirements.delivery.store import DeliveryStore
from rotaris_core.requirements.delivery.transitions import RefusalKind, TransitionRequest
from rotaris_core.requirements.execution.flow import (
    FlowResult,
    FlowStage,
    StageEvent,
    StagePhase,
)
from rotaris_core.requirements.execution.run_seam import (
    RequirementRunSeam,
    RunReport,
    RunWorkspace,
    unit_isolation,
)
from rotaris_core.requirements.execution.snapshot import ExecutionTransitions, capture_snapshot
from rotaris_core.requirements.model import CanonicalRequirement, RequirementLifecycle
from rotaris_core.requirements.registry import RequirementIndex
from ui_query import find_by_accessible_name, settle, wait_until

from rotaris.models.requirements_state import build_board_state
from rotaris.models.state import NoticeSeverity
from rotaris.models.store import WorkspaceStore
from rotaris.services.requirements_actions import (
    NO_OVERRIDE_REASON,
    REVIEW_DECISIONS,
    BoardAction,
    FlowEnded,
    FlowRunStarter,
    ProposalOutcome,
    RequirementActions,
    RequirementProposal,
    action_for_move,
    move_options,
    refusal_lines,
    resume_column,
)
from rotaris.services.requirements_controller import RequirementsController
from rotaris.views.requirements import REQUIREMENT_MIME, RequirementsView
from rotaris.widgets.feedback import InlineBanner

if TYPE_CHECKING:
    from collections.abc import Callable, Collection, Iterable, Mapping, Sequence

    from pytestqt.qtbot import QtBot
    from rotaris_core.requirements.delivery.projection import BoardProjection
    from rotaris_core.requirements.delivery.store import DeliveryRecord
    from rotaris_core.requirements.execution.run_seam import (
        IsolationRequest,
        RunResult,
        UnitLaunch,
    )
    from rotaris_core.requirements.execution.snapshot import RunSnapshot

pytestmark = pytest.mark.integration

NOW = dt.datetime(2026, 8, 15, 12, 0, tzinfo=dt.UTC)
SRC_ROOT = Path(__file__).resolve().parents[1] / "src" / "rotaris"


# ── real requirements, a real store, a real write path ─────────────────────


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
    """One workspace with a real delivery store, audit trail and write path.

    The composition a desktop session actually gets: the guarded writer of
    SWR-3403 over the workspace's own stores, plus the workspace's completion
    gate (SWR-3215). The desktop never builds one of these — that is the point of
    SWR-3609 — so a test that wants to see a refusal has to build the *real* one.
    """

    def __init__(
        self,
        root: Path,
        requirements: Iterable[CanonicalRequirement],
        *,
        evidence: Mapping[str, CompletionEvidence] | None = None,
    ) -> None:
        self.root = root
        self.requirements = {item.req_id: item for item in requirements}
        self._evidence = dict(evidence or {})
        self.store = DeliveryStore(root)
        self.audit = AuditStore(root)
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

    def delivery_for(self, req_id: str) -> SatisfiedDelivery | None:
        """The delivering run's satisfied record, built from its snapshot."""
        if req_id not in self.requirements:
            return None
        return SatisfiedDelivery.from_snapshot(
            self.snapshot(req_id),
            run_id="run-1",
            at=NOW,
        )

    def advance(self, req_id: str, *states: DeliveryState) -> None:
        """Walk the system's own transitions, so the record reaches *states*."""
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

    def record(self, req_id: str) -> DeliveryRecord:
        return self.store.read(req_id)

    def project(self) -> BoardProjection:
        return project_board(
            BoardInputs(
                index=RequirementIndex(
                    requirements=tuple(self.requirements.values()),
                    generation=1,
                ),
                delivery=self.store.load_all(),
                evaluated_at=NOW,
            ),
        )


class _RecordingRuns:
    """A run starter that records what the board asked it to start."""

    def __init__(self, *, fail: bool = False) -> None:
        self.started: list[tuple[str, str]] = []
        self.fail = fail

    def start(self, req_id: str, *, instructions: str = "") -> str:
        if self.fail:
            raise RuntimeError("no worktree could be created")
        self.started.append((req_id, instructions))
        return f"run-{len(self.started)}"


class _FakeIsolation:
    """A worktree, without Git. The seam's Git half is the external system."""

    def __init__(self, root: Path) -> None:
        self.root = root
        self.requests: list[IsolationRequest] = []

    def provide(self, request: IsolationRequest) -> RunWorkspace:
        self.requests.append(request)
        path = self.root / (request.session_id or "run")
        path.mkdir(parents=True, exist_ok=True)
        return RunWorkspace(path=str(path), branch=request.branch or "", created=True)


class _FakeHost:
    """The agent, faked. Everything around it in the seam is real."""

    def __init__(self) -> None:
        self.launches: list[UnitLaunch] = []

    def start(self, launch: UnitLaunch) -> RunReport:
        self.launches.append(launch)
        return RunReport(
            session_id=launch.snapshot.session_id,
            produced_commits=("c0ffee1",),
            changed_files=("src/rotaris_core/thing.py",),
            verified=True,
            agent_summary="implemented the requirement",
        )


class _SeamRuns:
    """A run starter over the engine's real launch seam (SWR-3416)."""

    def __init__(self, workspace: _Workspace, root: Path) -> None:
        self.isolation = _FakeIsolation(root)
        self.host = _FakeHost()
        self.results: list[RunResult] = []
        self._workspace = workspace
        self._seam = RequirementRunSeam(
            isolation=self.isolation,
            host=self.host,
            clock=lambda: NOW,
        )

    def start(self, req_id: str, *, instructions: str = "") -> str:
        del instructions
        run_id = f"run-{len(self.results) + 1}"
        snapshot = self._workspace.snapshot(req_id, run_id=run_id)
        result = self._seam.start(
            snapshot=snapshot,
            isolation_request=unit_isolation(req_id, "unit-1", run_id=run_id),
        )
        self.results.append(result)
        return result.run_id


def _actions(
    workspace: _Workspace,
    *,
    runs: object | None = None,
    actor_name: str = "dvf",
    proposals: object | None = None,
    changes: object | None = None,
) -> RequirementActions:
    return RequirementActions(
        workspace.writer,
        runs=runs,  # type: ignore[arg-type]
        hash_for=workspace.hash_for,
        delivery_for=workspace.delivery_for,
        proposals=proposals,  # type: ignore[arg-type]
        changes=changes,  # type: ignore[arg-type]
        actor_name=actor_name,
        clock=lambda: NOW,
    )


class _AcceptingChanges:
    """A change-work port that always has an offer waiting, and records the accept.

    The sibling of :class:`_AcceptingProposals`, for the same reason: the sweep
    needs every board action to be *performable*, and what accepting the work a
    change asks for actually creates is SWR-3616's own tests' business.
    """

    def __init__(self) -> None:
        self.accepted: list[tuple[str, str]] = []

    def pending(self, req_id: str) -> object:
        from rotaris_core.requirements.change_host import ChangeOffer

        return ChangeOffer(
            req_id=req_id,
            record_id="analysis-1",
            outcome="tests-affected",
            reasoning="the criterion the covering tests assert on moved",
            units=("tests",),
        )

    def accept(self, req_id: str, *, actor: object) -> object:
        from rotaris_core.requirements.change_host import OfferOutcome

        self.accepted.append((req_id, str(actor)))
        return OfferOutcome(
            req_id=req_id,
            accepted=True,
            message=f"{req_id}: 1 unit(s) planned",
            unit_ids=(f"{req_id}-tests",),
        )

    def question(self, req_id: str) -> None:
        """No stored question, so answering a blocker stays a plain transition.

        The sweep measures attribution over every action; a port that produced a
        decision here would send ``ANSWER_BLOCKER`` down the engine's answer path
        instead, which is SWR-3512's own tests' business.
        """
        del req_id
        return None

    def answer(  # pragma: no cover - unreachable while `question` answers None
        self,
        req_id: str,
        option: str,
        *,
        actor: object,
    ) -> object:
        raise AssertionError(f"{req_id}: {option} by {actor} — no question was open")


class _AcceptingProposals:
    """A proposal port that always has one offer waiting, and records the accept.

    The sweep below needs every board action to be *performable*; what accepting
    a proposal writes is SWR-3613's own tests' business, not this one's.
    """

    def __init__(self) -> None:
        self.accepted: list[tuple[str, str]] = []

    def pending(self, req_id: str) -> tuple[RequirementProposal, ...]:
        return (
            RequirementProposal(
                req_id=req_id,
                key="run-1:1",
                title="A deterministic merge journal",
                permanence="a technical requirement is permanent",
            ),
        )

    def offer(self, proposals: Sequence[RequirementProposal]) -> tuple[RequirementProposal, ...]:
        return tuple(proposals)

    def accept(self, req_id: str, key: str) -> ProposalOutcome:
        self.accepted.append((req_id, key))
        return ProposalOutcome(
            accepted=True,
            created_id="SWR-9001",
            message=f"SWR-9001 derived from {req_id}",
        )


class _BoardSource:
    """The bridge's port, answering from the live delivery store."""

    def __init__(self, workspace: _Workspace) -> None:
        self._workspace = workspace
        self.calls = 0

    def project(self) -> BoardProjection:
        self.calls += 1
        return self._workspace.project()


def _board(qtbot, workspace: _Workspace) -> tuple[RequirementsController, RequirementsView]:
    """A controller and a real board view, wired the way the window wires them.

    Shown, because focus is real: a card that never appeared cannot take the
    keyboard focus, and every selection on this board starts there.
    """
    store = WorkspaceStore()
    controller = RequirementsController(
        store,
        source=_BoardSource(workspace),
        clock=lambda: NOW,
    )
    # Only the surface is registered: `attach_view` reparents the view into it,
    # and a separately tracked child is destroyed twice at teardown.
    qtbot.addWidget(controller.surface)
    view = RequirementsView()
    controller.attach_view(view)
    controller.surface.resize(1000, 680)
    controller.surface.show()
    qtbot.waitExposed(controller.surface)
    return controller, view


def _evaluate(qtbot, controller: RequirementsController) -> None:
    with qtbot.waitSignal(controller.bridge.evaluated, timeout=5000):
        controller.refresh()
    settle(qtbot)


# ── SWR-3601: a move is an instruction ─────────────────────────────────────


@pytest.mark.unit
@verifies(SWR.SWR_3601)
def test_each_column_move_maps_to_its_action_and_states_its_consequence() -> None:
    """Productive use: a user drags a card and wants to know what will happen.
    Expected outcome: the move names an action, and the action names its effect."""
    assert action_for_move("backlog", "ready") is BoardAction.RELEASE
    assert action_for_move("needs-update", "ready") is BoardAction.RELEASE
    assert action_for_move("ready", "backlog") is BoardAction.RETURN
    assert action_for_move("review", "done") is BoardAction.ACCEPT
    assert action_for_move("review", "ready") is BoardAction.SEND_BACK
    assert action_for_move("ready", "blocked") is BoardAction.HOLD
    assert action_for_move("blocked", "ready") is BoardAction.RESUME
    # A run is started by Rotaris, never by a drop (SWR-3203's system-only edge).
    assert action_for_move("ready", "running") is None
    assert action_for_move("backlog", "backlog") is None

    release = BoardAction.RELEASE
    assert "worktree" in release.consequence
    assert release.confirm is True and release.starts_run is True
    assert BoardAction.ACCEPT.confirm is True
    assert BoardAction.RETURN.confirm is False
    for action in BoardAction:
        assert action.consequence.strip(), f"{action} states no consequence"
        assert action.progress_label.strip(), f"{action} has nothing to show in flight"


@pytest.mark.unit
@verifies(SWR.SWR_3601, SWR.SWR_3602)
def test_move_options_offer_the_matrix_and_explain_every_closed_column() -> None:
    options = {option.target: option for option in move_options("backlog")}

    assert options["ready"].reachable is True
    assert options["ready"].action == str(BoardAction.RELEASE)
    assert options["ready"].confirm is True
    # Done is not adjacent to Backlog at all, and the reason names what is.
    assert options["done"].reachable is False
    assert "not a move this board makes" in options["done"].reason
    assert "Ready" in options["done"].reason
    # Every option carries a non-colour indicator (SWR-3602).
    assert options["ready"].indicator == "→"
    assert options["done"].indicator == "⃠"
    assert options["done"].reason in options["done"].sentence

    # Ready → Running is a legal edge that is closed to a *person*, and the
    # reason says so rather than pretending the edge does not exist.
    running = next(option for option in move_options("ready") if option.target == "running")
    assert running.reachable is False
    assert "Rotaris itself" in running.reason

    blocked = {option.target: option for option in move_options("blocked", blocked_from="review")}
    assert blocked["review"].reachable is True
    assert blocked["backlog"].reachable is False
    assert "returns to Review" in blocked["backlog"].reason


@pytest.mark.unit
@verifies(SWR.SWR_3601, SWR.SWR_3201)
def test_every_release_control_aims_where_the_engine_actually_accepts() -> None:
    """Productive use: the queue's Release, the board's banner and the blocker panel.
    Expected outcome: all three aim at the same column, and it is the one the
    engine takes. A control aimed at the raw `blocked_from` would be refused every
    time it was pressed for a requirement held while a run was in flight."""
    assert resume_column("review") == "review"
    assert resume_column("ready") == "ready"
    assert resume_column("running") == "ready"
    assert resume_column("") == ""

    # And it is the same answer the columns are painted with.
    reachable = [
        option.target
        for option in move_options("blocked", blocked_from="running")
        if option.reachable
    ]
    assert reachable == [resume_column("running")]


@pytest.mark.unit
@verifies(SWR.SWR_3601, SWR.SWR_3602, SWR.SWR_3201)
def test_a_card_blocked_out_of_a_run_is_offered_ready_and_nothing_else() -> None:
    """Productive use: a run is held or fails, and the user comes back to pick the work up.
    Expected outcome: Ready is the one column offered — the same answer the engine
    gives, because the board asks the engine's own function rather than keeping a
    second copy of the rule. Running would be a column that always bounces, and a
    board with no reachable column at all would be a card nobody could move."""
    options = {option.target: option for option in move_options("blocked", blocked_from="running")}

    assert [target for target, option in options.items() if option.reachable] == ["ready"]
    assert "returns to Ready" in options["running"].reason
    assert "returns to Ready" in options["backlog"].reason


@pytest.mark.unit
@verifies(SWR.SWR_3601, SWR.SWR_3602)
def test_a_refused_move_changes_nothing_and_returns_the_card(tmp_path: Path) -> None:
    """Productive use: a user drags a fresh requirement straight onto Done.
    Expected outcome: nothing moves, nothing is recorded, and the card comes back."""
    workspace = _Workspace(tmp_path, [_requirement("SWR-4001")])
    actions = _actions(workspace)

    outcome = actions.perform(BoardAction.ACCEPT, "SWR-4001", source="backlog", target="done")

    assert outcome.accepted is False
    assert outcome.snap_back is True
    assert outcome.recorded is False
    assert outcome.refusal_kind == str(RefusalKind.ILLEGAL_EDGE)
    # The store is untouched, so the board's next paint puts the card back.
    assert workspace.record("SWR-4001").state is DeliveryState.BACKLOG
    assert workspace.audit.read("SWR-4001").empty is True


@verifies(SWR.SWR_3601)
def test_dropping_on_ready_reaches_the_engine_and_starts_a_run(tmp_path: Path) -> None:
    """Productive use: a user releases a requirement for implementation.
    Expected outcome: the engine records the release and the flow is started."""
    workspace = _Workspace(tmp_path, [_requirement("SWR-4002")])
    runs = _RecordingRuns()
    actions = _actions(workspace, runs=runs)

    outcome = actions.move("SWR-4002", source="backlog", target="ready")

    assert outcome.accepted is True
    assert outcome.started_work is True
    assert runs.started == [("SWR-4002", "")]
    # The work starting is shown, not merely the card moving (SWR-3601).
    feedback = outcome.feedback()
    assert f"Started run {outcome.run_id}" in feedback.details
    assert feedback.severity == "success"
    record = workspace.record("SWR-4002")
    assert record.state is DeliveryState.READY
    assert record.delivery.changed_by is not None
    assert record.delivery.changed_by.kind is ActorKind.USER
    assert record.delivery.changed_by.name == "dvf"
    assert record.delivery.requirement_hash == workspace.hash_for("SWR-4002")


@verifies(SWR.SWR_3601)
def test_a_release_whose_run_cannot_start_says_so_without_hiding_the_move(
    tmp_path: Path,
) -> None:
    """Productive use: the release is accepted but the worktree cannot be created.
    Expected outcome: the state moved, the failure is stated, and it reads as an error."""
    workspace = _Workspace(tmp_path, [_requirement("SWR-4003")])
    actions = _actions(workspace, runs=_RecordingRuns(fail=True))

    outcome = actions.release("SWR-4003")

    assert outcome.accepted is True
    assert outcome.started_work is False
    assert "no worktree could be created" in outcome.failure
    assert outcome.feedback().severity == "error"
    assert workspace.record("SWR-4003").state is DeliveryState.READY


def _unborn_project(root: Path) -> Path:
    """A git checkout on its first day: initialised, and never committed to."""
    root.mkdir(parents=True)
    _git_in(root, "init", "-b", "main")
    _git_in(root, "config", "user.name", "Test User")
    _git_in(root, "config", "user.email", "test@example.invalid")
    return root


def _flow_starter(workspace: _Workspace, dispatched: list[object], *, head: str) -> object:
    """The shipped run starter over *workspace*, with the dispatch seam observable."""
    return FlowRunStarter(
        workspace.root,
        transitions=workspace.writer,
        current_for=workspace.requirements.get,
        dispatch=dispatched.append,
        head_for=lambda: head,
        clock=lambda: NOW,
    )


@verifies(SWR.SWR_3419, SWR.SWR_3413, SWR.SWR_3602)
def test_a_project_with_no_commits_refuses_the_release_before_anything_moves(
    tmp_path: Path,
) -> None:
    """Productive use: someone runs `git init` on a new project, opens Rotaris on it and
    drops a requirement on Ready before making the first commit.
    Expected outcome: the drop is refused in words about the missing initial commit, the
    card returns to Backlog, no flow is dispatched and the delivery store is untouched —
    instead of an accepted release whose run dies at the snapshot and parks the
    requirement in Blocked."""
    from rotaris.services.requirements_actions import RunRefusedError

    workspace = _Workspace(_unborn_project(tmp_path / "punchclock"), [_requirement("SWR-4006")])
    dispatched: list[object] = []
    starter = _flow_starter(workspace, dispatched, head="")
    actions = _actions(workspace, runs=starter)

    outcome = actions.release("SWR-4006")

    assert outcome.accepted is False
    assert outcome.snap_back is True
    assert outcome.recorded is False
    # The fact and the fix, in the user's project's own name — no snapshot, no
    # base commit, and no Rotaris requirement id inside somebody else's product.
    assert "punchclock has no commits yet" in outcome.reason
    assert "Make an initial commit" in outcome.reason
    assert outcome.reason.count("SWR-4006") == 1
    assert "SWR-3419" not in outcome.reason
    assert "snapshot" not in outcome.reason.lower()
    assert outcome.feedback().severity == "warning"
    # Nothing was started and nothing was written: the card is where it was.
    assert dispatched == [], "a refused release dispatches no flow"
    assert workspace.record("SWR-4006").state is DeliveryState.BACKLOG
    assert workspace.audit.read("SWR-4006").empty is True

    # …and the launch path itself refuses, so reaching the starter directly —
    # the queue draining a held release, a test, a future surface — cannot get a
    # run past the same condition either.
    with pytest.raises(RunRefusedError) as refused:
        starter.start("SWR-4006")  # type: ignore[attr-defined]
    assert "has no commits yet" in str(refused.value)
    assert dispatched == []


@verifies(SWR.SWR_3419, SWR.SWR_3413, SWR.SWR_3602)
def test_a_base_commit_that_answers_with_nothing_is_refused_on_a_real_checkout_too(
    tmp_path: Path,
) -> None:
    """Productive use: the commit a run is cut from is read through a seam a composition
    may substitute, and the substitute answers with nothing.
    Expected outcome: the same refusal, on a checkout that does have commits — no
    substitute can put a run back on the path that ends at the snapshot's own words."""
    root = _unborn_project(tmp_path / "punchclock")
    _git_in(root, "commit", "--allow-empty", "-m", "the project as it starts")
    workspace = _Workspace(root, [_requirement("SWR-4008")])
    dispatched: list[object] = []
    actions = _actions(workspace, runs=_flow_starter(workspace, dispatched, head=""))

    outcome = actions.release("SWR-4008")

    assert outcome.accepted is False
    assert outcome.snap_back is True
    assert "has no commits yet" in outcome.reason
    assert dispatched == []
    assert workspace.record("SWR-4008").state is DeliveryState.BACKLOG


@verifies(SWR.SWR_3419, SWR.SWR_3602)
def test_the_board_refuses_the_commitless_project_in_the_engines_words_not_its_own(
    tmp_path: Path,
) -> None:
    """Productive use: the same person meets the same missing first commit on the board and
    in the headless command, and expects to be told the same thing.
    Expected outcome: the board's refusal *is* the engine's sentence, character for
    character — not a desktop rewording that happens to agree today. The sentence has one
    home, beside the flag that detects the condition, so there is no second copy for an
    edit to leave behind."""
    from rotaris_core.requirements.execution.target import no_commit_refusal

    workspace = _Workspace(_unborn_project(tmp_path / "punchclock"), [_requirement("SWR-4014")])
    dispatched: list[object] = []
    actions = _actions(workspace, runs=_flow_starter(workspace, dispatched, head=""))

    outcome = actions.release("SWR-4014")

    assert outcome.accepted is False
    assert outcome.reason == no_commit_refusal(workspace.root, "SWR-4014")
    assert dispatched == []


@verifies(SWR.SWR_3419, SWR.SWR_3413)
def test_the_same_release_starts_its_run_once_the_project_has_a_commit(
    tmp_path: Path,
) -> None:
    """Productive use: the same person makes their initial commit and drops the card again.
    Expected outcome: the release is accepted, recorded and dispatched exactly as it is for
    any other project — the refusal above is about the missing commit and nothing else."""
    root = _unborn_project(tmp_path / "punchclock")
    _git_in(root, "commit", "--allow-empty", "-m", "the project as it starts")
    head = _git_in(root, "rev-parse", "HEAD").strip()
    workspace = _Workspace(root, [_requirement("SWR-4007")])
    dispatched: list[object] = []
    actions = _actions(workspace, runs=_flow_starter(workspace, dispatched, head=head))

    outcome = actions.release("SWR-4007")

    assert outcome.accepted is True
    assert outcome.started_work is True
    assert outcome.recorded is True
    assert len(dispatched) == 1, "the flow is handed to the dispatcher, once"
    assert workspace.record("SWR-4007").state is DeliveryState.READY


# ── SWR-3601: an acceptance never outlives the run it started ──────────────


class _StubbedFlow:
    """The engine's flow, stubbed at the one seam a board release crosses.

    Everything on the release's side of it is the shipped object — the
    scheduler's decision, the base commit, the dispatch, the reporting — and what
    this answers with is the engine's own :class:`FlowResult`, validated by the
    engine's own rules. Only the *running* of the stages is replaced: driving a
    real flow to a blocked ending needs an agent, a worktree and a check suite,
    which the flow's own tests already do, and none of that is what a board
    surface is being asked here.
    """

    def __init__(self, result: FlowResult, stages: Sequence[FlowStage] = ()) -> None:
        self.result = result
        self.started: list[str] = []
        #: Stages this flow reports before it ends, for a surface that shows work
        #: in progress (SWR-3413). Empty for the flows whose subject is the
        #: ending rather than the middle.
        self.stages = tuple(stages)
        self.observer: Callable[[StageEvent], None] | None = None

    def start(
        self,
        requirement: CanonicalRequirement,
        *,
        base_commit: str,
        flow_id: str,
        resume: bool = False,
    ) -> FlowResult:
        del base_commit, resume
        self.started.append(requirement.req_id)
        for stage in self.stages:
            if self.observer is not None:
                self.observer(
                    StageEvent(
                        req_id=requirement.req_id,
                        stage=stage,
                        phase=StagePhase.STARTED,
                        at=NOW,
                    ),
                )
        return self.result.model_copy(update={"flow_id": flow_id})


class _StubbedFlowStarter(FlowRunStarter):
    """The shipped starter with only the flow it composes replaced."""

    def __init__(self, workspace: Path, *, flow: _StubbedFlow, **kwargs: object) -> None:
        super().__init__(workspace, **kwargs)  # type: ignore[arg-type]
        self.flow = flow

    def _flow(self, target: object) -> _StubbedFlow:  # type: ignore[override]
        del target
        # The seam the shipped composition passes as ``observer=``, handed to the
        # stub so a stage it reports travels the path a real one does.
        self.flow.observer = self._observer
        return self.flow


def _committed_project(root: Path) -> Path:
    """A checkout with the one commit a run can be cut from."""
    _unborn_project(root)
    _git_in(root, "commit", "--allow-empty", "-m", "the project as it starts")
    return root


def _stubbed_starter(
    workspace: _Workspace,
    dispatched: list[object],
    *,
    result: FlowResult,
    stages: Sequence[FlowStage] = (),
) -> _StubbedFlowStarter:
    """The shipped starter over *workspace*, running a flow that ends in *result*."""
    return _StubbedFlowStarter(
        workspace.root,
        flow=_StubbedFlow(result, stages),
        transitions=workspace.writer,
        current_for=workspace.requirements.get,
        dispatch=dispatched.append,
        head_for=lambda: _git_in(workspace.root, "rev-parse", "HEAD").strip(),
        clock=lambda: NOW,
    )


@verifies(SWR.SWR_2508, SWR.SWR_3602)
def test_a_release_in_a_default_workspace_says_the_run_will_be_denied_its_tools(
    tmp_path: Path,
) -> None:
    """Productive use: a user opens Rotaris on a project they have never configured and
    releases a requirement. `runtime.permission_mode` ships as `ask`, so the unattended
    run has nobody to answer its approval prompts and every mutating call is refused.

    Expected outcome: the release still happens — refusing it would refuse every
    unconfigured workspace — but the acceptance names the condition and the settings that
    resolve it, so the user reads it now instead of inferring it from a console three
    minutes later."""
    workspace = _Workspace(_committed_project(tmp_path / "punchclock"), [_requirement("SWR-4030")])
    starter = _stubbed_starter(workspace, [], result=_reviewable_result("SWR-4030"))
    actions = _actions(workspace, runs=starter)

    outcome = actions.release("SWR-4030")

    assert outcome.accepted is True
    assert outcome.started_work is True
    # The release stands; the caveat rides along with it rather than replacing it.
    assert outcome.feedback().severity == "success"
    caveat = outcome.caveat
    assert "every tool call denied" in caveat
    assert "runtime.permission_mode" in caveat
    assert caveat in outcome.feedback().details


@verifies(SWR.SWR_2508)
def test_a_workspace_that_opted_in_to_unattended_work_is_told_nothing(
    tmp_path: Path,
) -> None:
    """Productive use: a user configures the workspace so its unattended runs can act.

    Expected outcome: no caveat at all. A warning that keeps appearing after the user has
    done what it asked is a warning they stop reading."""
    root = _committed_project(tmp_path / "punchclock")
    config = root / ".rotaris"
    config.mkdir(exist_ok=True)
    (config / "agents.yaml").write_text(
        "runtime:\n  permission_mode: autonomous\n  allow_unsandboxed_autonomous: true\n",
        encoding="utf-8",
    )
    workspace = _Workspace(root, [_requirement("SWR-4031")])
    starter = _stubbed_starter(workspace, [], result=_reviewable_result("SWR-4031"))

    outcome = _actions(workspace, runs=starter).release("SWR-4031")

    assert outcome.accepted is True
    assert outcome.caveat == ""


def _blocked_result(req_id: str) -> FlowResult:
    """What the engine answers with when a run dies before anything is reviewable."""
    return FlowResult(
        req_id=req_id,
        final_state=DeliveryState.BLOCKED,
        failed_stage=FlowStage.SNAPSHOT,
        reason="the requirement snapshot could not be captured",
    )


def _reviewable_result(req_id: str) -> FlowResult:
    """What the engine answers with when the run reached something to review."""
    return FlowResult(req_id=req_id, final_state=DeliveryState.REVIEW)


def _needs_a_look_result(req_id: str) -> FlowResult:
    """What the engine answers when a stage *after* the agent's work failed.

    ``verification`` and ``integration`` do not block: they fail over a worktree
    that already holds an agent's work, so the engine routes them to ``Review``
    on purpose (``FlowStage.blocks_on_failure``). The flow still reports a failed
    stage, so ``FlowResult.succeeded`` is ``False`` — which is the ending that
    used to be described to a user as a run that did not finish.
    """
    return FlowResult(
        req_id=req_id,
        final_state=DeliveryState.REVIEW,
        failed_stage=FlowStage.VERIFICATION,
        reason="the check suite failed in the unit's worktree",
    )


@pytest.mark.unit
@verifies(SWR.SWR_3601)
def test_a_flow_that_dies_on_its_worker_reports_the_ending_to_whoever_showed_it_start(
    tmp_path: Path,
) -> None:
    """Productive use: a release is accepted, its run starts, and the run dies later on
    the worker thread that was carrying it.
    Expected outcome: the starter reports that ending — which requirement, where it
    stopped, the engine's own reason and where the card was left — so nothing is left
    holding an acceptance for a run that is already over."""
    workspace = _Workspace(_committed_project(tmp_path / "punchclock"), [_requirement("SWR-4009")])
    dispatched: list[object] = []
    starter = _stubbed_starter(workspace, dispatched, result=_blocked_result("SWR-4009"))
    endings: list[FlowEnded] = []
    starter.report_flows(endings.append)
    actions = _actions(workspace, runs=starter)

    outcome = actions.release("SWR-4009")

    assert outcome.accepted is True
    assert outcome.started_work is True
    assert endings == [], "an accepted release reports no ending; the flow has not run"

    # The work the dispatcher was handed — what a worker thread would have run.
    dispatched[0]()  # type: ignore[operator]

    assert len(endings) == 1
    ended = endings[0]
    assert ended.req_id == "SWR-4009"
    assert ended.flow_id == outcome.run_id
    assert ended.succeeded is False
    assert ended.stage == "snapshot"
    assert ended.state == "Blocked"
    assert "could not be captured" in ended.reason
    # The headline names the requirement once, in plain words, and carries no
    # Rotaris requirement id into somebody else's project.
    assert ended.title == "SWR-4009: released, but the run did not finish"
    assert ended.title.count("SWR-4009") == 1
    assert "SWR-3601" not in ended.title
    assert any("nothing is running for it" in line for line in ended.details)
    assert any("release it again" in line for line in ended.details)
    # …and the flow is out of flight before the news goes out, so a listener that
    # reads the starter back sees the run gone rather than still running.
    assert starter.in_flight == ()


# ── what this process is running reaches the recovery pass (SWR-3611) ──────


class _FollowingSource:
    """A board source that records what the controller says this process is running.

    The production seam, kept to its two methods: the desktop's board is a
    :class:`~rotaris.services.requirements_bridge.WorkspaceBoard`, which is asked
    for a projection and told — through ``follow_runs`` — how to find out what is
    in flight when a pass needs to know.
    """

    def __init__(self, workspace: _Workspace) -> None:
        self._workspace = workspace
        self.running_here: Callable[[], Collection[str]] | None = None

    def project(self) -> BoardProjection:
        return self._workspace.project()

    def follow_runs(self, running_here: Callable[[], Collection[str]]) -> None:
        self.running_here = running_here


@pytest.mark.e2e
@verifies(SWR.SWR_3611)
def test_a_flow_this_process_just_started_survives_the_board_pass(
    qtbot: QtBot,
    tmp_path: Path,
) -> None:
    """Productive use: a requirement is released and the board refreshes a second later,
    while the flow is still starting and has opened no run record yet.
    Expected outcome: the run is left alone. This crosses the boundary the two unit
    suites each stop at — what the controller publishes as "running here" and what the
    recovery pass compares it against — because each side was internally consistent
    while production handed flow ids to a comparison against requirement ids, and every
    dispatched flow was closed as abandoned within the second."""
    from rotaris_core.requirements.execution.recovery import reconcile_abandoned_runs

    workspace = _Workspace(_committed_project(tmp_path / "punchclock"), [_requirement("SWR-4324")])
    dispatched: list[object] = []
    starter = _stubbed_starter(workspace, dispatched, result=_reviewable_result("SWR-4324"))
    actions = _actions(workspace, runs=starter)
    source = _FollowingSource(workspace)
    controller = RequirementsController(WorkspaceStore(), source=source, clock=lambda: NOW)
    qtbot.addWidget(controller.surface)
    controller.attach_actions(actions)

    assert actions.release("SWR-4324").started_work is True
    assert dispatched, "the flow is on its way to a worker"
    # The move the flow itself makes, before its first unit opens a run record:
    # from here on the board says Running and the history says nothing at all,
    # which is the window this test is about.
    started = workspace.writer.apply(
        TransitionRequest(
            req_id="SWR-4324",
            target=DeliveryState.RUNNING,
            actor=DeliveryActor.system("requirement-flow"),
            cause=TransitionCause.RUN_STARTED,
            at=NOW,
            requirement_hash=workspace.hash_for("SWR-4324"),
        ),
    )
    assert started.accepted, started.message

    assert source.running_here is not None, "the controller told the board what it runs"
    running_here = tuple(source.running_here())
    assert running_here == ("SWR-4324",), "requirement ids, the vocabulary the pass speaks"

    freed = reconcile_abandoned_runs(
        workspace.root,
        current_for=workspace.requirements.get,
        at=NOW + dt.timedelta(hours=2),
        running_here=running_here,
    )

    assert freed == (), "a flow this process is driving is never freed, however long it runs"
    assert workspace.store.read("SWR-4324").state is DeliveryState.RUNNING


# ── clearing a blocker restarts the work it stopped (SWR-3710) ─────────────


def _blocked_out_of(workspace: _Workspace, req_id: str, *, running: bool) -> None:
    """Leave *req_id* in ``Blocked``, having been blocked out of a run or out of Backlog.

    Written through the real matrix, in the moves that actually produce each
    case: a run that started and then failed is what the recovery pass of
    SWR-3611 leaves behind, and a requirement held while it sat in ``Backlog``
    is the other one this must tell apart.
    """
    moves: list[tuple[DeliveryState, TransitionCause, DeliveryActor]] = []
    if running:
        moves.append((DeliveryState.READY, TransitionCause.USER_ACTION, DeliveryActor.user("dvf")))
        moves.append(
            (
                DeliveryState.RUNNING,
                TransitionCause.RUN_STARTED,
                DeliveryActor.system("requirement-flow"),
            ),
        )
    moves.append(
        (
            DeliveryState.BLOCKED,
            TransitionCause.RUN_FAILED if running else TransitionCause.USER_ACTION,
            DeliveryActor.system("run-recovery") if running else DeliveryActor.user("dvf"),
        ),
    )
    for offset, (state, cause, actor) in enumerate(moves):
        outcome = workspace.writer.apply(
            TransitionRequest(
                req_id=req_id,
                target=state,
                actor=actor,
                cause=cause,
                at=NOW + dt.timedelta(seconds=offset),
                requirement_hash=workspace.hash_for(req_id),
                reason="the run's process is gone" if running else "waiting on the API key",
            ),
        )
        assert outcome.accepted, outcome.message


@pytest.mark.unit
@verifies(SWR.SWR_3710)
def test_clearing_a_blocker_on_an_interrupted_run_starts_the_work_again(tmp_path: Path) -> None:
    """Productive use: a run was interrupted, the card was left in Blocked, and the user
    clears the blocker.
    Expected outcome: the one gesture both clears the blocker and dispatches the run.
    The matrix has no Ready → Ready edge, so before this the card landed in Ready with
    nothing behind it and no board gesture could start it — the only way out was
    dragging it to Backlog and releasing it again."""
    workspace = _Workspace(_committed_project(tmp_path / "punchclock"), [_requirement("SWR-4321")])
    _blocked_out_of(workspace, "SWR-4321", running=True)
    dispatched: list[object] = []
    starter = _stubbed_starter(workspace, dispatched, result=_reviewable_result("SWR-4321"))
    actions = _actions(workspace, runs=starter)

    outcome = actions.resume("SWR-4321", blocked_from="running")

    assert outcome.accepted is True
    assert outcome.target == "ready", "a person may not put a requirement back into Running"
    assert outcome.failure == "", outcome.failure
    assert outcome.started_work is True
    assert len(dispatched) == 1, "the flow was handed to the dispatcher, once"
    assert starter.in_flight == ("SWR-4321",)
    assert workspace.store.read("SWR-4321").state is DeliveryState.READY


@pytest.mark.unit
@verifies(SWR.SWR_3710)
def test_clearing_a_blocker_that_returns_to_backlog_starts_nothing(tmp_path: Path) -> None:
    """Productive use: a requirement nobody had released was held, and the hold is lifted.
    Expected outcome: it goes back to Backlog and no run is dispatched. Releasing is the
    human's decision (SWR-3413); clearing a blocker restarts work only where the
    requirement returns to the state a run starts from."""
    workspace = _Workspace(_committed_project(tmp_path / "punchclock"), [_requirement("SWR-4322")])
    _blocked_out_of(workspace, "SWR-4322", running=False)
    dispatched: list[object] = []
    starter = _stubbed_starter(workspace, dispatched, result=_reviewable_result("SWR-4322"))
    actions = _actions(workspace, runs=starter)

    outcome = actions.resume("SWR-4322", blocked_from="backlog")

    assert outcome.accepted is True
    assert outcome.target == "backlog"
    assert outcome.started_work is False
    assert dispatched == []
    assert starter.in_flight == ()
    assert workspace.store.read("SWR-4322").state is DeliveryState.BACKLOG


@pytest.mark.unit
@verifies(SWR.SWR_3710)
def test_a_blocker_is_cleared_even_where_nothing_can_start_the_run(tmp_path: Path) -> None:
    """Productive use: the blocker is cleared in a workspace with no run host at all.
    Expected outcome: the card still leaves Blocked and the reason nothing started is
    said on the outcome. A blocker nobody could clear because the workspace cannot host
    a run would be a worse trap than the stranded card this removes."""
    workspace = _Workspace(_committed_project(tmp_path / "punchclock"), [_requirement("SWR-4323")])
    _blocked_out_of(workspace, "SWR-4323", running=True)

    outcome = _actions(workspace, runs=None).resume("SWR-4323", blocked_from="running")

    assert outcome.accepted is True
    assert outcome.started_work is False
    assert "nothing started" in outcome.failure
    assert workspace.store.read("SWR-4323").state is DeliveryState.READY


@pytest.mark.unit
@verifies(SWR.SWR_3710)
def test_what_clearing_a_blocker_announces_is_what_it_does(tmp_path: Path) -> None:
    """Productive use: the sentence a surface shows before the gesture happens.
    Expected outcome: it names the restarted run, so what a user is told and what
    Rotaris does cannot disagree (SWR-3601)."""
    del tmp_path
    from rotaris.services.requirements_actions import dispatches_a_run

    assert dispatches_a_run(BoardAction.RESUME, "ready") is True
    assert dispatches_a_run(BoardAction.RESUME, "backlog") is False
    assert dispatches_a_run(BoardAction.RELEASE, "ready") is True
    assert "starts the work again" in BoardAction.RESUME.consequence


@pytest.mark.unit
@verifies(SWR.SWR_3601)
def test_a_flow_that_reaches_review_reports_an_ending_that_supersedes_nothing(
    tmp_path: Path,
) -> None:
    """Productive use: the ordinary case — the released run works and produces something
    to review.
    Expected outcome: the ending is reported as a success, so the acceptance the user is
    still reading is left exactly where it is."""
    workspace = _Workspace(_committed_project(tmp_path / "punchclock"), [_requirement("SWR-4012")])
    dispatched: list[object] = []
    starter = _stubbed_starter(workspace, dispatched, result=_reviewable_result("SWR-4012"))
    endings: list[FlowEnded] = []
    starter.report_flows(endings.append)

    _actions(workspace, runs=starter).release("SWR-4012")
    dispatched[0]()  # type: ignore[operator]

    assert [ending.succeeded for ending in endings] == [True]
    assert endings[0].stage == ""


@pytest.mark.unit
@verifies(SWR.SWR_3601, SWR.SWR_3602)
def test_a_run_that_finished_into_review_is_not_reported_as_one_that_did_not_finish(
    tmp_path: Path,
) -> None:
    """Productive use: a released run implements the requirement and then fails its
    verification. The engine leaves the card in Review, because the worktree holds work
    a person can read.
    Expected outcome: the headline says the run needs a look and the remedy is to look at
    it. It used to read "released, but the run did not finish" with "release it again"
    underneath — false about a run that did finish, and pointing at a move Review does not
    offer. A run that never got that far still reads as the stop it was."""
    workspace = _Workspace(_committed_project(tmp_path / "punchclock"), [_requirement("SWR-4013")])
    dispatched: list[object] = []
    starter = _stubbed_starter(workspace, dispatched, result=_needs_a_look_result("SWR-4013"))
    endings: list[FlowEnded] = []
    starter.report_flows(endings.append)

    _actions(workspace, runs=starter).release("SWR-4013")
    dispatched[0]()  # type: ignore[operator]

    assert len(endings) == 1
    ended = endings[0]
    assert ended.succeeded is False, "the engine calls a failed stage unsuccessful"
    assert ended.state == "Review"
    assert ended.stage == "verification"
    assert ended.reviewable is True
    assert ended.title == "SWR-4013: released, and the run needs a look"
    assert "did not finish" not in ended.title
    assert ended.title.count("SWR-4013") == 1
    assert any("what the run produced is still there" in line for line in ended.details)
    assert any("Review what it produced" in line for line in ended.details)
    assert not any("release it again" in line for line in ended.details)

    # The other ending is unchanged: a stage that blocks left nothing to look at.
    blocked = FlowEnded.of(_blocked_result("SWR-4013"))
    assert blocked.reviewable is False
    assert blocked.title == "SWR-4013: released, but the run did not finish"
    assert "It stopped at the snapshot stage." in blocked.details
    assert any("release it again" in line for line in blocked.details)


@pytest.mark.e2e
@verifies(SWR.SWR_3413, SWR.SWR_3601)
def test_a_running_flow_says_which_stage_it_is_on_before_it_ends(
    qtbot,
    tmp_path: Path,
) -> None:
    """Productive use: a user drops a card on Ready and watches. The flow spends minutes
    in analysis and decomposition before any unit exists, so the card sits in Running
    saying "No execution units yet · Never run" — indistinguishable from a stuck run.

    Expected outcome: the acceptance strip reports each stage as the flow reaches it, in
    the engine's own words, replaced in place rather than stacked. The board's own labels
    are left alone: they describe what is persisted, and nothing is persisted yet."""
    workspace = _Workspace(_committed_project(tmp_path / "punchclock"), [_requirement("SWR-4032")])
    dispatched: list[object] = []
    starter = _stubbed_starter(
        workspace,
        dispatched,
        result=_reviewable_result("SWR-4032"),
        stages=(FlowStage.SNAPSHOT, FlowStage.ANALYSIS, FlowStage.DECOMPOSITION),
    )
    controller, view = _board(qtbot, workspace)
    controller.attach_actions(_actions(workspace, runs=starter))
    _evaluate(qtbot, controller)
    wait_until(lambda: not view.populating, timeout=20)

    accepted = controller.move_requirement("SWR-4032", "backlog", "ready")
    assert accepted is not None and accepted.started_work is True
    settle(qtbot)

    worker = threading.Thread(target=dispatched[0], name="flow-under-test")
    worker.start()
    worker.join(timeout=10)
    assert not worker.is_alive()
    wait_until(
        lambda: any(
            item.req_id == "SWR-4032" and "decomposition" in item.reason for item in view.feedback
        ),
        timeout=5,
    )

    standing = [item for item in view.feedback if item.req_id == "SWR-4032"]
    assert len(standing) == 1, "one strip per card — a stage replaces the one before it"
    # The engine's own line, not a board-side gloss (SWR-3602).
    assert "SWR-4032" in standing[0].reason
    assert "decomposition" in standing[0].reason


@pytest.mark.e2e
@verifies(SWR.SWR_3601, SWR.SWR_3602)
def test_a_run_that_dies_replaces_its_own_acceptance_instead_of_stacking_under_it(
    qtbot,
    tmp_path: Path,
) -> None:
    """Productive use: a user drops a card on Ready, reads "release accepted — started
    run …", and the run dies on its worker thread a moment later.
    Expected outcome: that green acceptance is gone. One strip stands in its place,
    naming the same requirement, where the run stopped and what to do about it — never a
    failure stacked under a success that stopped being true. The feedback standing for a
    different requirement is untouched, because a strip belongs to one card."""
    workspace = _Workspace(
        _committed_project(tmp_path / "punchclock"),
        [_requirement("SWR-4010"), _requirement("SWR-4011")],
    )
    dispatched: list[object] = []
    starter = _stubbed_starter(workspace, dispatched, result=_blocked_result("SWR-4010"))
    controller, view = _board(qtbot, workspace)
    controller.attach_actions(_actions(workspace, runs=starter))
    _evaluate(qtbot, controller)
    wait_until(lambda: not view.populating, timeout=20)

    # A standing refusal for the *other* requirement, so "the same slot" can be
    # told apart from "every slot".
    controller.move_requirement("SWR-4011", "backlog", "done")
    accepted = controller.move_requirement("SWR-4010", "backlog", "ready")
    assert accepted is not None and accepted.started_work is True
    settle(qtbot)
    standing = {item.req_id: item for item in view.feedback}
    assert standing["SWR-4010"].severity == "success"
    assert any("Started run" in line for line in standing["SWR-4010"].details)

    # The flow runs where it really runs: on a thread that is not Qt's.
    worker = threading.Thread(target=dispatched[0], name="flow-under-test")
    worker.start()
    worker.join(timeout=10)
    assert not worker.is_alive()
    wait_until(
        lambda: any(
            item.req_id == "SWR-4010" and item.severity == "error" for item in view.feedback
        ),
        timeout=5,
    )

    now = [item for item in view.feedback if item.req_id == "SWR-4010"]
    assert len(now) == 1, "the acceptance is replaced in place, not stacked under"
    assert now[0].title == "SWR-4010: released, but the run did not finish"
    assert "could not be captured" in now[0].reason
    assert not any("Started run" in line for line in now[0].details)
    assert not any("accepted" in line for line in now[0].details)
    # The other card's feedback is its own and is left alone.
    others = [item for item in view.feedback if item.req_id == "SWR-4011"]
    assert len(others) == 1 and others[0].accepted is False
    controller.shutdown()


@pytest.mark.e2e
@verifies(SWR.SWR_3601)
def test_a_run_that_reaches_review_leaves_the_acceptance_the_user_is_reading(
    qtbot,
    tmp_path: Path,
) -> None:
    """Productive use: the same drop, and this time the run works.
    Expected outcome: the acceptance stays exactly as it was — the strip is superseded
    by a failure, never by the run merely finishing."""
    workspace = _Workspace(_committed_project(tmp_path / "punchclock"), [_requirement("SWR-4013")])
    dispatched: list[object] = []
    starter = _stubbed_starter(workspace, dispatched, result=_reviewable_result("SWR-4013"))
    controller, view = _board(qtbot, workspace)
    controller.attach_actions(_actions(workspace, runs=starter))
    _evaluate(qtbot, controller)
    wait_until(lambda: not view.populating, timeout=20)

    controller.move_requirement("SWR-4013", "backlog", "ready")
    settle(qtbot)
    worker = threading.Thread(target=dispatched[0], name="flow-under-test")
    worker.start()
    worker.join(timeout=10)
    settle(qtbot)

    standing = [item for item in view.feedback if item.req_id == "SWR-4013"]
    assert len(standing) == 1
    assert standing[0].severity == "success"
    assert any("Started run" in line for line in standing[0].details)
    controller.shutdown()


@pytest.mark.e2e
@verifies(SWR.SWR_3601, SWR.SWR_3612)
def test_a_user_drags_a_requirement_to_ready_and_a_run_starts(qtbot, tmp_path: Path) -> None:
    """Productive use: a user drags a card from Backlog onto Ready.
    Expected outcome: a real run is launched for it and the card is in Ready."""
    workspace = _Workspace(tmp_path / "ws", [_requirement("SWR-4004")])
    runs = _SeamRuns(workspace, tmp_path / "trees")
    controller, view = _board(qtbot, workspace)
    controller.attach_actions(_actions(workspace, runs=runs))
    _evaluate(qtbot, controller)
    wait_until(lambda: not view.populating, timeout=20)

    view.begin_drag("SWR-4004")
    ready = view.column_widget("ready")
    assert ready is not None
    mime = QMimeData()
    mime.setData(REQUIREMENT_MIME, b"SWR-4004")
    mime.setText("SWR-4004")
    ready.dropEvent(
        QDropEvent(
            QPoint(10, 10),
            Qt.DropAction.MoveAction,
            mime,
            Qt.MouseButton.LeftButton,
            Qt.KeyboardModifier.NoModifier,
        ),
    )
    settle(qtbot)

    # The engine's own seam ran: a workspace was provided and the host launched.
    assert [launch.req_id for launch in runs.host.launches] == ["SWR-4004"]
    assert runs.results[0].succeeded is True
    assert runs.isolation.requests[0].branch == "rotaris/req/swr-4004/unit-1"
    assert workspace.record("SWR-4004").state is DeliveryState.READY
    # …and the run's activity is reachable where it already lives (SWR-3612).
    assert runs.results[0].to_view().session_id == "session-swr-4004"
    controller.shutdown()


# ── SWR-3602: a refused move says why ──────────────────────────────────────


@pytest.mark.unit
@verifies(SWR.SWR_3602)
def test_the_refusal_reason_is_the_engines_own_sentence(tmp_path: Path) -> None:
    """Productive use: a user accepts a requirement whose tests never ran.
    Expected outcome: the words on screen are the transition function's, verbatim."""
    requirement = _requirement("SWR-4005")
    workspace = _Workspace(
        tmp_path,
        [requirement],
        evidence={"SWR-4005": _unverified_evidence("SWR-4005", requirement.current_hash)},
    )
    workspace.advance("SWR-4005", DeliveryState.READY, DeliveryState.RUNNING, DeliveryState.REVIEW)
    actions = _actions(workspace)

    outcome = actions.accept("SWR-4005")

    # The same attempt, taken straight through the engine, for comparison: the
    # board may not paraphrase, summarise or shorten what comes back.
    reference = workspace.writer.apply(
        TransitionRequest(
            req_id="SWR-4005",
            target=DeliveryState.DONE,
            actor=DeliveryActor.user("dvf"),
            cause=TransitionCause.COMPLETION_ACCEPTED,
            at=NOW,
            delivery=workspace.delivery_for("SWR-4005"),
        ),
    )
    assert reference.refusal is not None
    assert outcome.accepted is False
    assert outcome.refusal_kind == str(reference.refusal.kind)
    assert outcome.refusal_kind == str(RefusalKind.COMPLETION_CONDITIONS_UNMET)
    # Character for character the engine's, not a sentence composed here.
    assert outcome.reason == reference.refusal.precondition
    assert outcome.details == refusal_lines(reference.refusal)
    # Every unmet condition is named individually (SWR-3215).
    assert any("covering-tests-passed" in line for line in outcome.details)
    assert any("completion-gate" in line for line in outcome.details)


@pytest.mark.unit
@verifies(SWR.SWR_3602)
def test_refusal_lines_name_each_unmet_condition_separately(tmp_path: Path) -> None:
    requirement = _requirement("SWR-4006")
    workspace = _Workspace(
        tmp_path,
        [requirement],
        evidence={"SWR-4006": _unverified_evidence("SWR-4006", requirement.current_hash)},
    )
    workspace.advance("SWR-4006", DeliveryState.READY, DeliveryState.RUNNING, DeliveryState.REVIEW)

    outcome = workspace.writer.apply(
        TransitionRequest(
            req_id="SWR-4006",
            target=DeliveryState.DONE,
            actor=DeliveryActor.user("dvf"),
            cause=TransitionCause.COMPLETION_ACCEPTED,
            at=NOW,
            delivery=workspace.delivery_for("SWR-4006"),
        ),
    )

    assert outcome.refusal is not None
    lines = refusal_lines(outcome.refusal)
    assert len(lines) == len(outcome.refusal.unmet)
    assert all(
        any(line == condition.message for line in lines) for condition in outcome.refusal.unmet
    )


@verifies(SWR.SWR_3602)
def test_a_refused_move_is_persistent_feedback_and_not_a_board_failure(
    qtbot,
    tmp_path: Path,
) -> None:
    """Productive use: a user tries to skip review and drops a card on Done.
    Expected outcome: a standing explanation, and a board that is still fine."""
    workspace = _Workspace(tmp_path / "ws", [_requirement("SWR-4007")])
    controller, view = _board(qtbot, workspace)
    controller.attach_actions(_actions(workspace))
    _evaluate(qtbot, controller)

    controller.move_requirement("SWR-4007", "backlog", "done")
    settle(qtbot)

    state = controller._store.requirements  # noqa: SLF001 — the published state
    feedback = state.feedback_for("SWR-4007")
    assert feedback is not None
    assert feedback.accepted is False
    assert feedback.reason == "the state machine has an edge between these states"
    # A refusal is the board working, not the board failing (SWR-3602).
    assert feedback.severity == "warning"
    assert state.notice is None
    assert state.available is True
    # …and it stays until it is dismissed, including across an evaluation.
    _evaluate(qtbot, controller)
    assert controller._store.requirements.feedback_for("SWR-4007") is not None  # noqa: SLF001
    controller.dismiss_feedback("SWR-4007")
    assert controller._store.requirements.feedback_for("SWR-4007") is None  # noqa: SLF001
    controller.shutdown()


@verifies(SWR.SWR_3602, SWR.SWR_3314)
def test_unreachable_columns_are_indicated_during_the_drag_in_words(
    qtbot,
    tmp_path: Path,
) -> None:
    """Productive use: a user picks a card up and looks for where it may go.
    Expected outcome: every column says yes or no, in words and with a glyph."""
    workspace = _Workspace(tmp_path / "ws", [_requirement("SWR-4008")])
    # Released already, so the board offers a legal edge (Blocked) beside one
    # that is legal for Rotaris and closed to a person (Running).
    workspace.advance("SWR-4008", DeliveryState.READY)
    controller, view = _board(qtbot, workspace)
    controller.attach_actions(_actions(workspace))
    _evaluate(qtbot, controller)
    wait_until(lambda: not view.populating, timeout=20)

    view.begin_drag("SWR-4008")
    settle(qtbot)

    backlog = view.column_widget("backlog")
    running = view.column_widget("running")
    assert backlog is not None and running is not None
    assert backlog.drop_hint.isVisible() and running.drop_hint.isVisible()
    assert backlog.drop_hint.text().startswith("→")
    assert running.drop_hint.text().startswith("⃠")
    assert "Rotaris itself" in running.drop_hint.text()
    # Colour is a second channel, never the only one: the sentences carry it.
    assert backlog.property("dropState") == "open"
    assert running.property("dropState") == "closed"

    view.cancel_drag()
    assert view.dragging == ""
    assert backlog.drop_hint.isVisible() is False
    controller.shutdown()


@pytest.mark.e2e
@verifies(SWR.SWR_3602, SWR.SWR_3609)
def test_a_user_skipping_review_is_told_which_conditions_are_unmet(
    qtbot,
    tmp_path: Path,
) -> None:
    """Productive use: a user in review presses Move → Done on unverified work.
    Expected outcome: the control refuses, and the banner names every condition."""
    requirement = _requirement("SWR-4009")
    workspace = _Workspace(
        tmp_path / "ws",
        [requirement],
        evidence={"SWR-4009": _unverified_evidence("SWR-4009", requirement.current_hash)},
    )
    workspace.advance("SWR-4009", DeliveryState.READY, DeliveryState.RUNNING, DeliveryState.REVIEW)
    controller, view = _board(qtbot, workspace)
    controller.attach_actions(_actions(workspace))
    _evaluate(qtbot, controller)
    wait_until(lambda: not view.populating, timeout=20)

    card = view.card_widgets["SWR-4009"]
    card.setFocus(Qt.FocusReason.OtherFocusReason)
    settle(qtbot)
    assert view.set_move_target("done") is True
    move = find_by_accessible_name(view, "Move SWR-4009 to Done", QPushButton)
    assert move.isEnabled() is True, "Review → Done is a legal edge; the conditions decide"
    move.click()
    settle(qtbot)

    banner = find_by_accessible_name(view, "warning: SWR-4009: accept refused")
    described = banner.accessibleDescription()
    assert "every completion condition holds" in described
    assert "covering-tests-passed" in described
    assert workspace.record("SWR-4009").state is DeliveryState.REVIEW
    controller.shutdown()


# ── SWR-3609: the user interface cannot force Done ─────────────────────────


#: Engine symbols that *decide* or *mutate* a delivery state. A desktop module
#: importing one of them has a second write path by definition, whatever it does
#: with it. ``evaluate_completion`` and ``CompletionOverride`` are the sharp ones:
#: the first *is* the SWR-3215 verdict and the second is the only way to make a
#: condition stop blocking, so a desktop module holding either could weaken the
#: gate however carefully it was written (SWR-3609).
_FORBIDDEN_ENGINE_NAMES = {
    "apply_transition",
    "DeliveryTransitions",
    "DeliveryStatus",
    "DeliveryRecord",
    "SatisfiedLog",
    "evaluate_completion",
    "CompletionOverride",
}

#: Symbols a desktop module may hold only where composing the area is its job.
#: The bridge opens both stores to *read* the projection (SWR-3311); the action
#: service builds the guarded write path (SWR-3403) and, with it, the workspace's
#: completion gate. ``completion_gate`` and ``CompletionEvidence`` are on this
#: list rather than the forbidden one because a composition that supplied *no*
#: gate would refuse every ``Review → Done`` forever — the same requirement
#: broken from the other side. What the composition root supplies is the evidence
#: the conditions read; the verdict stays behind ``evaluate_completion``, which
#: no desktop module may import at all.
_COMPOSITION_ONLY = {
    "DeliveryStore": {"services/requirements_actions.py", "services/requirements_bridge.py"},
    "AuditStore": {"services/requirements_actions.py", "services/requirements_bridge.py"},
    "ExecutionTransitions": {"services/requirements_actions.py"},
    "SnapshotStore": {"services/requirements_actions.py"},
    "completion_gate": {"services/requirements_actions.py"},
    "CompletionEvidence": {"services/requirements_actions.py"},
    "NeedsUpdatePass": {"services/requirements_actions.py"},
}

#: Methods that mutate a delivery record without any transition at all.
_FORBIDDEN_CALLS = {"moved_to", "evolve"}


@pytest.mark.unit
@verifies(SWR.SWR_3609)
def test_no_desktop_module_writes_the_delivery_store_directly() -> None:
    """Productive use: someone adds a "mark done" button that pokes the store.
    Expected outcome: the sweep names the module and the symbol it reached for."""
    violations: list[str] = []
    swept: list[str] = []
    for path in sorted(SRC_ROOT.rglob("*.py")):
        where = path.relative_to(SRC_ROOT).as_posix()
        swept.append(where)
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom):
                module = node.module or ""
                if not module.startswith("rotaris_core.requirements"):
                    continue
                for alias in node.names:
                    name = alias.name
                    if name in _FORBIDDEN_ENGINE_NAMES:
                        violations.append(f"{where}: imports {name} from {module}")
                    allowed = _COMPOSITION_ONLY.get(name)
                    if allowed is not None and where not in allowed:
                        violations.append(f"{where}: composes {name} outside the composition root")
            if isinstance(node, ast.Attribute) and node.attr in _FORBIDDEN_CALLS:
                violations.append(f"{where}: calls {node.attr} — that bypasses the matrix")

    assert violations == [], "\n".join(violations)
    assert "services/requirements_actions.py" in swept, "the guard swept the wrong tree"
    assert "views/requirements.py" in swept
    # One module builds transition requests, and every other surface reaches a
    # delivery state through it (SWR-3609).
    writers = [
        path.relative_to(SRC_ROOT).as_posix()
        for path in sorted(SRC_ROOT.rglob("*.py"))
        if "TransitionRequest(" in path.read_text(encoding="utf-8")
    ]
    assert writers == ["services/requirements_actions.py"], writers


@pytest.mark.unit
@verifies(SWR.SWR_3609)
def test_the_board_offers_no_override_and_no_column_but_review_reaches_done() -> None:
    """Productive use: a user looks for a "force done" affordance.
    Expected outcome: there is none, and no column but Review can reach Done."""
    assert RequirementActions.offers_override is False
    assert not [action for action in BoardAction if "override" in str(action)]
    assert "engine" in NO_OVERRIDE_REASON
    assert BoardAction.ACCEPT in REVIEW_DECISIONS
    assert len(REVIEW_DECISIONS) == 6, "SWR-3604 offers six decisions, not an accept button"

    for source in ("backlog", "ready", "running", "review", "needs-update", "blocked"):
        done = next(
            (
                option
                for option in move_options(source, blocked_from="review")
                if option.target == "done"
            ),
            None,
        )
        assert done is not None
        assert done.reachable is (source == "review"), f"{source} → Done"


@pytest.mark.unit
@verifies(SWR.SWR_3609)
def test_a_workspace_without_a_requirement_store_has_no_write_path(
    qtbot,
    tmp_path: Path,
) -> None:
    """Productive use: the board is opened on a project that keeps no store.
    Expected outcome: the area says there is nowhere to write, and moves nothing."""
    from rotaris.services.requirements_actions import workspace_actions

    assert workspace_actions(tmp_path) is None

    store = WorkspaceStore()
    controller = RequirementsController(store, workspace=tmp_path, clock=lambda: NOW)
    qtbot.addWidget(controller.surface)

    outcome = controller.move_requirement("SWR-4023", "backlog", "ready")

    assert controller.actions is None
    assert outcome is not None
    assert outcome.accepted is False
    assert "no write path" in outcome.reason
    controller.shutdown()


@pytest.mark.unit
@verifies(SWR.SWR_3609)
def test_a_writer_without_the_specification_guard_is_refused(tmp_path: Path) -> None:
    """Productive use: a composition hands the board a bare delivery writer.
    Expected outcome: it is refused at construction, not silently accepted."""

    class _Unguarded:
        enforces_specification_guard = False

        def apply(self, request: TransitionRequest) -> None:  # pragma: no cover - never called
            raise AssertionError("an unguarded writer must never be reached")

        def record_event(self, event: object) -> None:  # pragma: no cover - never called
            raise AssertionError("an unguarded writer must never be reached")

    del tmp_path
    with pytest.raises(ValueError, match="specification guard"):
        RequirementActions(_Unguarded())  # type: ignore[arg-type]


@verifies(SWR.SWR_3609)
def test_a_bulk_accept_decides_and_reports_one_requirement_at_a_time(tmp_path: Path) -> None:
    """Productive use: a user accepts three reviewed requirements at once.
    Expected outcome: the eligible one is accepted and each refusal names its own reason."""
    ready, unverified, backlogged = (
        _requirement("SWR-4011"),
        _requirement("SWR-4012"),
        _requirement("SWR-4013"),
    )
    workspace = _Workspace(
        tmp_path,
        [ready, unverified, backlogged],
        evidence={
            "SWR-4011": _complete_evidence("SWR-4011", ready.current_hash),
            "SWR-4012": _unverified_evidence("SWR-4012", unverified.current_hash),
        },
    )
    for req_id in ("SWR-4011", "SWR-4012"):
        workspace.advance(req_id, DeliveryState.READY, DeliveryState.RUNNING, DeliveryState.REVIEW)
    actions = _actions(workspace)

    outcomes = actions.bulk_accept(["SWR-4011", "SWR-4012", "SWR-4013"])

    assert [outcome.accepted for outcome in outcomes] == [True, False, False]
    assert outcomes[1].refusal_kind == str(RefusalKind.COMPLETION_CONDITIONS_UNMET)
    assert any("covering-tests-passed" in line for line in outcomes[1].details)
    # The third never reached Review, so its refusal is a different one entirely.
    assert outcomes[2].refusal_kind == str(RefusalKind.ILLEGAL_EDGE)
    assert workspace.record("SWR-4011").state is DeliveryState.DONE
    assert workspace.record("SWR-4012").state is DeliveryState.REVIEW
    assert workspace.record("SWR-4013").state is DeliveryState.BACKLOG


@verifies(SWR.SWR_3609, SWR.SWR_3204)
def test_done_is_unreachable_without_the_delivering_runs_snapshot(tmp_path: Path) -> None:
    """Productive use: the board accepts a requirement that never ran.
    Expected outcome: the engine refuses because there is no version to record."""
    requirement = _requirement("SWR-4014")
    workspace = _Workspace(
        tmp_path,
        [requirement],
        evidence={"SWR-4014": _complete_evidence("SWR-4014", requirement.current_hash)},
    )
    workspace.advance("SWR-4014", DeliveryState.READY, DeliveryState.RUNNING, DeliveryState.REVIEW)
    actions = RequirementActions(
        workspace.writer,
        hash_for=workspace.hash_for,
        # No delivering snapshot at all: the board cannot invent one.
        delivery_for=lambda _req_id: None,
        actor_name="dvf",
        clock=lambda: NOW,
    )

    outcome = actions.accept("SWR-4014")

    assert outcome.accepted is False
    assert outcome.refusal_kind == str(RefusalKind.SATISFIED_HASH_MISSING)
    assert "Done records the specification version" in outcome.reason
    assert workspace.record("SWR-4014").state is DeliveryState.REVIEW


# ── SWR-3610: attributed and auditable ─────────────────────────────────────


@pytest.mark.unit
@verifies(SWR.SWR_3610)
def test_every_state_changing_action_is_attributed_and_leaves_a_record(
    tmp_path: Path,
) -> None:
    """Productive use: an auditor asks which board actions leave no trace.
    Expected outcome: the sweep over the whole action set answers "none"."""
    requirement = _requirement("SWR-4015")
    workspace = _Workspace(
        tmp_path,
        [requirement],
        evidence={"SWR-4015": _complete_evidence("SWR-4015", requirement.current_hash)},
    )
    actions = _actions(
        workspace,
        runs=_RecordingRuns(),
        proposals=_AcceptingProposals(),
        changes=_AcceptingChanges(),
    )
    assert actions.actor.kind is ActorKind.USER
    assert actions.actor.name == "dvf"

    outcomes = {}
    for action in BoardAction:
        # Each action is tried from a state that makes it legal, so the sweep
        # measures attribution rather than the matrix.
        source, target = _stage(workspace, action)
        outcomes[action] = actions.perform(
            action,
            "SWR-4015",
            source=source,
            target=target,
            reason="because the user said so",
            # Accepting a proposal names which one (SWR-3613); every other
            # action ignores the detail.
            detail="run-1:1" if action is BoardAction.ACCEPT_PROPOSAL else "",
        )

    for action, outcome in outcomes.items():
        assert outcome.action == str(action)
        # Every action really happened, so "it left a record" is a fact about a
        # performed action rather than about a refused one.
        assert outcome.accepted, f"{action} was refused: {outcome.reason} {outcome.details}"
        assert outcome.recorded is action.changes_state, f"{action}: recorded={outcome.recorded}"

    # The one action that records nothing is the one that changes nothing.
    assert [action for action in BoardAction if not action.changes_state] == [
        BoardAction.KEEP_WORKTREE,
    ]
    # Every action SWR-3610 names is in the set that leaves a record — and so is
    # the one that creates a proposed technical requirement (SWR-3613).
    named = {
        "release",
        "accept",
        "accept-proposal",
        "rerun",
        "reject",
        "hold",
        "edit",
        "create",
        "answer-blocker",
    }
    assert named <= {str(action) for action in BoardAction if action.changes_state}


def _stage(workspace: _Workspace, action: BoardAction) -> tuple[str, str]:
    """Put SWR-4015 in a state where *action* is legal, and name the move."""
    reset = {
        BoardAction.RELEASE: (),
        BoardAction.RETURN: (DeliveryState.READY,),
        BoardAction.ACCEPT: (DeliveryState.READY, DeliveryState.RUNNING, DeliveryState.REVIEW),
        BoardAction.RERUN: (DeliveryState.READY, DeliveryState.RUNNING, DeliveryState.REVIEW),
        BoardAction.SEND_BACK: (DeliveryState.READY, DeliveryState.RUNNING, DeliveryState.REVIEW),
        BoardAction.REJECT: (DeliveryState.READY, DeliveryState.RUNNING, DeliveryState.REVIEW),
        BoardAction.HOLD: (),
        BoardAction.RESUME: (DeliveryState.BLOCKED,),
        BoardAction.ANSWER_BLOCKER: (DeliveryState.BLOCKED,),
    }.get(action)
    if reset is None:
        return "", ""
    _rewind(workspace, "SWR-4015")
    for state in reset:
        workspace.writer.apply(
            TransitionRequest(
                req_id="SWR-4015",
                target=state,
                actor=DeliveryActor.system("staging"),
                cause=TransitionCause.USER_ACTION,
                at=NOW,
                reason="staged" if state is DeliveryState.BLOCKED else "",
            ),
        )
    current = workspace.record("SWR-4015").state
    target = "backlog" if action in {BoardAction.RESUME, BoardAction.ANSWER_BLOCKER} else ""
    return str(current), target


def _rewind(workspace: _Workspace, req_id: str) -> None:
    """Drop the record so the next staging starts from Backlog."""
    path = workspace.store.path_for(req_id)
    if path.exists():
        path.unlink()


@verifies(SWR.SWR_3610)
def test_a_release_and_an_acceptance_leave_two_attributed_records(tmp_path: Path) -> None:
    """Productive use: months later, someone asks who released and who accepted.
    Expected outcome: two records, both naming the person and the hash they acted on."""
    requirement = _requirement("SWR-4016")
    workspace = _Workspace(
        tmp_path,
        [requirement],
        evidence={"SWR-4016": _complete_evidence("SWR-4016", requirement.current_hash)},
    )
    actions = _actions(workspace, runs=_RecordingRuns())

    assert actions.release("SWR-4016").accepted is True
    workspace.advance("SWR-4016", DeliveryState.RUNNING, DeliveryState.REVIEW)
    assert actions.accept("SWR-4016").accepted is True

    trail = workspace.audit.read("SWR-4016")
    user_events = [
        event
        for event in trail.of_kind(AuditEventKind.DELIVERY_TRANSITION)
        if event.actor.kind is ActorKind.USER
    ]
    assert [event.to_state for event in user_events] == [DeliveryState.READY, DeliveryState.DONE]
    assert {event.actor.name for event in user_events} == {"dvf"}
    assert all(event.requirement_hash == requirement.current_hash for event in user_events)
    assert user_events[-1].satisfied_hash == requirement.current_hash
    # System actions are in the same trail and stay distinguishable from these.
    system = [event for event in trail.transitions() if event.actor.kind is ActorKind.SYSTEM]
    assert [event.to_state for event in system] == [DeliveryState.RUNNING, DeliveryState.REVIEW]


@verifies(SWR.SWR_3610, SWR.SWR_3605)
def test_an_edit_is_recorded_with_its_actor_and_the_hash_it_acted_on(tmp_path: Path) -> None:
    """Productive use: a user edits a requirement from the board.
    Expected outcome: the write-back is in the same trail as the state changes."""
    requirement = _requirement("SWR-4017")
    workspace = _Workspace(tmp_path, [requirement])
    actions = _actions(workspace)

    outcome = actions.perform(
        BoardAction.EDIT,
        "SWR-4017",
        reason="tightened the acceptance condition",
    )

    assert outcome.accepted is True
    assert outcome.recorded is True
    events = workspace.audit.read("SWR-4017").of_kind(AuditEventKind.WRITE_BACK)
    assert len(events) == 1
    assert events[0].actor.kind is ActorKind.USER
    assert events[0].actor.name == "dvf"
    assert events[0].requirement_hash == requirement.current_hash
    assert events[0].reason == "tightened the acceptance condition"


# ── SWR-3612: run activity reaches the surfaces that own it ────────────────


@pytest.mark.unit
@verifies(SWR.SWR_3612)
def test_navigation_intents_carry_the_session_id(qtbot, tmp_path: Path) -> None:
    """Productive use: a user follows a running requirement into its transcript.
    Expected outcome: the Workspace view is focused on that session, not a copy."""
    workspace = _Workspace(tmp_path / "ws", [_requirement("SWR-4018")])
    controller, _view = _board(qtbot, workspace)

    assert controller.open_run("session-7") is True
    assert controller._store.focused_session_id == "session-7"  # noqa: SLF001
    assert controller._store.ui.active_view == "workspace"  # noqa: SLF001
    # The Git view is not merely switched to: it is told what to show, or the
    # user lands on an unrelated history and has to find the run's work by hand.
    assert controller.open_commit("c0ffee1deadbeef") is True
    assert controller._store.ui.active_view == "git"  # noqa: SLF001
    assert controller._store.git_focus == "c0ffee1deadbeef"  # noqa: SLF001
    assert controller.open_commit("rotaris/req/swr-4018/unit-1") is True
    assert controller._store.git_focus == "rotaris/req/swr-4018/unit-1"  # noqa: SLF001
    # A run that never started has no session to focus, and says so.
    assert controller.open_run("") is False
    assert controller.open_commit("") is False
    controller.shutdown()


@pytest.mark.integration
@verifies(SWR.SWR_3612)
def test_the_git_view_lands_on_the_branch_and_the_commit_it_was_given(qtbot) -> None:
    """Productive use: a user follows a requirement run's branch into the Git view.
    Expected outcome: the run's worktree row is selected there, and its commit is too."""
    from rotaris.models.state import CommitInfo, WorktreeInfo
    from rotaris.views.git import GitView

    store = WorkspaceStore()
    store.branch = "main"
    store.worktrees = [
        WorktreeInfo(branch="main", path="/repo", is_base=True, active=True),
        WorktreeInfo(branch="rotaris/req/swr-4018/unit-1", path="/repo/.rotaris/req"),
    ]
    store.commits = [
        CommitInfo("aaaa111", "the project as it stands", "dvf", "2 days ago", False),
        CommitInfo("c0ffee1", "work for SWR-4018", "rotaris", "1 minute ago", True),
    ]
    view = GitView(store)
    qtbot.addWidget(view)
    # The Git view holds its redraws while it is off screen and pays them back
    # on the next Show (HiddenPanelReflow, SWR-2454), so a focus handed to a
    # hidden view selects nothing. Follow the branch the way a user does, with
    # the view actually on screen.
    view.resize(1400, 900)
    view.show()
    qtbot.waitExposed(view)

    # The view coalesces its redraws on a timer, so wait for the selection to
    # land rather than draining the event queue and reading immediately: how
    # much of a 120 ms window a drain clears depends on the machine.
    store.set_git_focus("rotaris/req/swr-4018/unit-1")
    wait_until(lambda: view.worktree_table.currentItem() is not None, timeout=5)
    assert view.worktree_table.currentItem().text(0) == "rotaris/req/swr-4018/unit-1"

    # The full sha a run records still finds the short hash the history shows.
    store.set_git_focus("c0ffee1abcdef0123456789")
    wait_until(lambda: view.commit_table.currentItem() is not None, timeout=5)
    assert view.commit_table.currentItem().text(0) == "c0ffee1"

    # A branch that has already been merged away selects nothing at all, rather
    # than landing the user on whichever row happens to be first.
    # The redraw rebuilds both tables, so the previous selection goes with it
    # and nothing takes its place. Wait for that redraw rather than reading
    # through the coalescer's window at the old selection.
    store.set_git_focus("rotaris/req/gone")
    wait_until(
        lambda: (
            view.commit_table.currentItem() is None and view.worktree_table.currentItem() is None
        ),
        timeout=5,
    )


@pytest.mark.unit
@verifies(SWR.SWR_3612)
def test_the_requirements_view_rebuilds_no_transcript_agent_tree_or_worktree_list() -> None:
    """Productive use: someone adds a transcript to the Requirements view.
    Expected outcome: the sweep names it — those surfaces already exist."""
    owned_elsewhere = {
        "TranscriptView",
        "AgentTree",
        "WorktreeInfo",
        "TranscriptEvent",
        "RunBridge",
    }
    violations: list[str] = []
    for name in (
        "views/requirements.py",
        "views/requirement_detail.py",
        "services/requirements_actions.py",
        "services/requirements_controller.py",
    ):
        source = (SRC_ROOT / name).read_text(encoding="utf-8")
        tree = ast.parse(source)
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom):
                for alias in node.names:
                    if alias.name in owned_elsewhere:
                        violations.append(f"{name}: imports {alias.name}")
    assert violations == [], "\n".join(violations)


@verifies(SWR.SWR_3612)
def test_opening_a_run_from_the_board_focuses_its_session(qtbot, tmp_path: Path) -> None:
    """Productive use: a user opens the run of a finished unit from the board.
    Expected outcome: the Workspace view focuses that session, live or finished."""
    workspace = _Workspace(tmp_path / "ws", [_requirement("SWR-4019")])
    controller, view = _board(qtbot, workspace)
    _evaluate(qtbot, controller)

    assert "open_run_requested" in controller.connected_action_signals
    view.open_run_requested.emit("session-finished")
    settle(qtbot)

    assert controller._store.focused_session_id == "session-finished"  # noqa: SLF001
    assert controller._store.ui.active_view == "workspace"  # noqa: SLF001
    controller.shutdown()


# ── the keyboard equivalent (SWR-3314) ─────────────────────────────────────


@verifies(SWR.SWR_3601, SWR.SWR_3314)
def test_every_drop_has_a_keyboard_equivalent(qtbot, tmp_path: Path) -> None:
    """Productive use: a keyboard user releases a requirement for implementation.
    Expected outcome: the same move, through visible controls, with no mouse."""
    workspace = _Workspace(tmp_path / "ws", [_requirement("SWR-4020")])
    runs = _RecordingRuns()
    controller, view = _board(qtbot, workspace)
    controller.attach_actions(_actions(workspace, runs=runs))
    _evaluate(qtbot, controller)
    wait_until(lambda: not view.populating, timeout=20)

    card = view.card_widgets["SWR-4020"]
    card.setFocus(Qt.FocusReason.OtherFocusReason)
    settle(qtbot)
    assert view.selected_req_id == "SWR-4020"

    # Ctrl+M aims the move control at the first column the engine allows.
    assert view.focus_move_bar() == "ready"
    move = find_by_accessible_name(view, "Move SWR-4020 to Ready", QPushButton)
    assert move.isEnabled() is True
    assert "worktree" in move.toolTip()
    move.click()
    settle(qtbot)

    assert runs.started == [("SWR-4020", "")]
    assert workspace.record("SWR-4020").state is DeliveryState.READY

    # And the unreachable ones explain themselves rather than sitting grey.
    assert view.set_move_target("running") is True
    blocked_move = view.move_button
    assert blocked_move.isEnabled() is False
    assert "Rotaris itself" in blocked_move.toolTip()
    assert blocked_move.toolTip() == blocked_move.accessibleDescription()
    controller.shutdown()


@verifies(SWR.SWR_3601, SWR.SWR_3315)
def test_the_controller_wires_every_writing_signal_the_board_declares(
    qtbot,
    tmp_path: Path,
) -> None:
    """Productive use: a later surface renames one of the board's action signals.
    Expected outcome: the wiring report names what is connected, so the gap shows."""
    workspace = _Workspace(tmp_path / "ws", [_requirement("SWR-4021")])
    controller, view = _board(qtbot, workspace)

    declared = tuple(
        name for name, _ in RequirementsController.ACTION_SIGNALS if hasattr(RequirementsView, name)
    )
    assert controller.connected_action_signals == declared
    assert len(declared) == len(RequirementsController.ACTION_SIGNALS)
    # The reading half is untouched by this slice's additions.
    assert controller.connected_signals == tuple(
        name for name, _ in RequirementsController.VIEW_SIGNALS
    )
    del view
    controller.shutdown()


@verifies(SWR.SWR_3316, SWR.SWR_3306)
def test_an_evidence_site_reaches_something(qtbot, tmp_path: Path) -> None:
    """Productive use: a user clicks the file behind a requirement's evidence.
    Expected outcome: the click reaches the controller. Until SWR-3316 the
    signal carrying it was in neither wiring table, so every evidence link on
    the board was a control that looked live and did nothing at all."""
    workspace = _Workspace(tmp_path / "ws", [_requirement("SWR-4029")])
    controller, view = _board(qtbot, workspace)

    assert "open_file_requested" in controller.connected_action_signals
    # A path is required, and an empty one is refused rather than handed on.
    assert controller.open_file("") is False
    # The blocker entry point installs its surface on the way through, so the
    # board's own `Blockers` control is not inert either.
    controller.open_blockers("SWR-4029")
    settle(qtbot)
    assert "blockers" in view.panes
    controller.shutdown()


def _opener(monkeypatch, *, opens: bool) -> list[str]:
    """Stand in for the desktop's file association, recording what it was asked for.

    The one external system in this test: opening a file for real would launch
    whatever the machine running the suite happens to associate with ``.py``.
    Everything either side of it — the resolution of the path, and what the
    board says afterwards — is Rotaris' own code.
    """
    from PySide6.QtGui import QDesktopServices

    asked: list[str] = []

    def _open(url: object) -> bool:
        asked.append(str(url.toLocalFile()))  # type: ignore[attr-defined]
        return opens

    monkeypatch.setattr(QDesktopServices, "openUrl", _open)
    return asked


@verifies(SWR.SWR_3316)
def test_opening_a_file_that_works_leaves_the_window_alone(
    qtbot,
    tmp_path: Path,
    monkeypatch,
) -> None:
    """Productive use: a user clicks the source file behind a requirement's evidence
    and reads it in their editor. Expected outcome: the file opens and nothing else
    happens. Rotaris used to answer a working click with a full-width banner naming
    the absolute path — the app's highest-priority slot, taken by a success the user
    is already looking at, above whatever failure was standing there."""
    store = WorkspaceStore()
    controller = RequirementsController(
        store,
        workspace=tmp_path,
        source=_BoardSource(_Workspace(tmp_path / "ws", [_requirement("SWR-4030")])),
        clock=lambda: NOW,
    )
    qtbot.addWidget(controller.surface)
    asked = _opener(monkeypatch, opens=True)

    assert controller.open_file("src/rotaris_core/thing.py", 12) is True

    # A relative evidence path is resolved against the workspace before it goes out.
    assert [Path(where) for where in asked] == [tmp_path / "src/rotaris_core/thing.py"]
    assert store.ui.notice is None
    controller.shutdown()


@verifies(SWR.SWR_3316)
def test_a_click_no_application_answered_says_so_and_stays(
    qtbot,
    tmp_path: Path,
    monkeypatch,
) -> None:
    """Productive use: a user clicks an evidence site on a machine with nothing
    registered for that file type. Expected outcome: the one case SWR-3316 exists to
    prevent — a click that does nothing — is named in plain words, tells the user
    what to do instead, and persists with a dismiss control until it is read. The
    path is in the copyable details, not stretched across the banner."""
    store = WorkspaceStore()
    controller = RequirementsController(
        store,
        workspace=tmp_path,
        source=_BoardSource(_Workspace(tmp_path / "ws", [_requirement("SWR-4031")])),
        clock=lambda: NOW,
    )
    qtbot.addWidget(controller.surface)
    _opener(monkeypatch, opens=False)

    assert controller.open_file("src/rotaris_core/thing.py", 12) is False

    notice = store.ui.notice
    assert notice is not None
    assert notice.severity is NoticeSeverity.WARNING
    assert notice.title == "Could not open this file"
    assert "thing.py" in notice.message
    assert notice.persistent, "so the banner offers a dismiss control"
    assert notice.details == f"{tmp_path / 'src/rotaris_core/thing.py'}:12"
    # Named in words a user of their own project can act on.
    for jargon in ("evidence site", "handed to", "SWR-"):
        assert jargon not in f"{notice.title} {notice.message}"

    banner = InlineBanner()
    qtbot.addWidget(banner)
    banner.show_notice(notice)
    assert banner.dismiss_button.isVisibleTo(banner)
    assert banner.copy_button.isVisibleTo(banner)
    controller.shutdown()


@verifies(SWR.SWR_3601)
def test_the_board_state_carries_the_queue_and_the_actions_in_flight(
    qtbot,
    tmp_path: Path,
) -> None:
    """Productive use: a surface added later needs to know what is running.
    Expected outcome: the published board carries the queue and the pending action."""
    workspace = _Workspace(tmp_path / "ws", [_requirement("SWR-4022")])
    controller, view = _board(qtbot, workspace)
    controller.attach_actions(_actions(workspace, runs=_RecordingRuns()))
    _evaluate(qtbot, controller)

    projection = workspace.project()
    state = build_board_state(projection, now=NOW)
    assert state.queue.empty is True
    assert state.queue.summary.startswith("Automatic scheduling is off")

    controller.move_requirement("SWR-4022", "backlog", "ready")
    settle(qtbot)

    published = controller._store.requirements  # noqa: SLF001
    # The action is finished, so nothing is left in flight and the answer stands.
    assert published.pending == ()
    assert published.feedback_for("SWR-4022") is not None
    assert view.feedback == published.feedback
    controller.shutdown()


# ── the shipped composition, through the whole loop ────────────────────────
#
# Everything above builds its own collaborators. This one builds none of them:
# it calls ``workspace_actions`` — the single production composition, the one
# ``RequirementsController.actions`` builds on first use — over a real git
# checkout with a real ReqToCode store, and replaces exactly one thing: the
# agent. The completion gate, the requirement flow, the launch seam, the Git
# worktree, the check suite, the delivery store and the audit trail are the
# shipped objects, reached the way the shipped code reaches them.
#
# That is the whole point of it. A composition that forgets the completion gate,
# forgets the run starter, or forgets to evaluate on read turns this red — and
# those are precisely the three ways this feature can be broken while every
# hand-wired test above stays green.


REAL_REQ = "SWR-501"
FIRST_PROSE = "A basket can be paid for and the user receives a receipt."
ADDED_SENTENCE = "A payment that fails three times locks the basket for an hour."


def _git_in(cwd: Path, *args: str) -> str:
    import subprocess

    result = subprocess.run(
        ["git", *args],
        cwd=cwd,
        text=True,
        encoding="utf-8",
        capture_output=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    return result.stdout


def _document(prose: str) -> str:
    return (
        f"---\nreq-id: {REAL_REQ}\nstatus: approved\ntrace: required\ntest: required\n"
        'title: "A basket can be paid for"\nepic: SWR-500\n---\n\n'
        f"# {REAL_REQ} - A basket can be paid for\n\n{prose}\n\n"
        "## Acceptance criteria\n\n- The receipt names every line item.\n"
    )


def _requirement_file(root: Path) -> Path:
    return root / "docs" / "requirements" / "500-checkout" / f"{REAL_REQ}-basket.md"


def _real_project(root: Path) -> Path:
    """A git checkout that keeps its requirements in a ReqToCode store."""
    (root / "docs" / "requirements" / "500-checkout").mkdir(parents=True)
    (root / "docs" / "requirements" / "500-checkout.md").write_text(
        "---\nreq-id: SWR-500\nstatus: approved\ntrace: optional\ntest: optional\n"
        'title: "Checkout"\n---\n\n# 500 - Checkout\n',
        encoding="utf-8",
    )
    _requirement_file(root).write_text(_document(FIRST_PROSE), encoding="utf-8")
    (root / ".gitignore").write_text(".rotaris/\n", encoding="utf-8")
    (root / ".rotaris").mkdir()
    # A workspace that states its own check suite, so the verification the run
    # host performs is this project's own and not a detected guess (SWR-2601).
    (root / ".rotaris" / "agents.yaml").write_text(
        "verifier:\n  checks:\n    - name: repository\n      command: git rev-parse HEAD\n",
        encoding="utf-8",
    )
    (root / "src").mkdir()
    (root / "tests").mkdir()
    (root / "src" / "checkout.py").write_text("def pay() -> None: ...\n", encoding="utf-8")
    _git_in(root, "init", "-b", "main")
    _git_in(root, "config", "user.name", "Test User")
    _git_in(root, "config", "user.email", "test@example.invalid")
    _git_in(root, "add", ".")
    _git_in(root, "commit", "-m", "the project as it stands")
    return root


class _CommittingAgent:
    """The one external system: an agent that changes files and commits them.

    Called by the *shipped* ``AgentRunHost`` with the task the shipped host
    built, in the worktree the shipped seam provisioned, and it answers with the
    shipped ``RunResult``. It claims nothing about verification: measuring the
    run is Rotaris' job, and an agent that could report itself verified would
    make this test unable to tell whether Rotaris ever measured anything.
    """

    def __init__(self) -> None:
        self.tasks: list[str] = []
        self.trees: list[Path] = []

    def __call__(self, task: str, tree: Path) -> object:
        from rotaris_core.run_result import RunResult, RunStatus

        self.tasks.append(task)
        self.trees.append(tree)
        attempt = len(self.tasks)
        source = f"src/checkout_{attempt}.py"
        covering = f"tests/test_checkout_{attempt}.py"
        (tree / "src").mkdir(exist_ok=True)
        (tree / "tests").mkdir(exist_ok=True)
        (tree / source).write_text(
            f"# implements {REAL_REQ}\ndef pay() -> None: ...\n",
            encoding="utf-8",
        )
        (tree / covering).write_text(
            f"# verifies {REAL_REQ}\ndef test_pay() -> None: ...\n",
            encoding="utf-8",
        )
        _git_in(tree, "add", source, covering)
        _git_in(
            tree,
            "-c",
            "user.name=rotaris",
            "-c",
            "user.email=rotaris@local",
            "commit",
            "-m",
            f"work for {REAL_REQ}",
        )
        return RunResult(
            session_id=f"session-{attempt}",
            status=RunStatus.COMPLETED,
            summary=f"implemented {REAL_REQ} as the task described it",
        )


def _shipped_actions(root: Path, agent: _CommittingAgent) -> RequirementActions:
    """``workspace_actions`` as the controller builds it, with the agent replaced."""
    from rotaris.services.requirements_actions import workspace_actions

    actions = workspace_actions(
        root,
        actor_name="dvf",
        # The flow runs on the calling thread so the test can observe its end.
        # Everything it composes is unchanged; only *where* it runs is.
        dispatch=lambda work: work(),
        run_agent=agent,  # type: ignore[arg-type]
    )
    assert actions is not None, "the project keeps a requirement store Rotaris can write"
    return actions


def _entry(board: object, req_id: str = REAL_REQ) -> object:
    """This requirement's card after one whole board pass.

    Both stages, in the projection worker's order: since SWR-3519 the evaluation
    is the call that writes and moves a card (SWR-3502) and the projection is the
    read that renders what it left (SWR-3216).
    """
    board.evaluate()  # type: ignore[attr-defined]
    found = board.project().entry(req_id)  # type: ignore[attr-defined]
    assert found is not None, f"{req_id} is on the board"
    return found


@pytest.mark.e2e
@verifies(
    SWR.SWR_3601,
    SWR.SWR_3413,
    SWR.SWR_3416,
    SWR.SWR_3215,
    SWR.SWR_3502,
    SWR.SWR_3603,
    SWR.SWR_3609,
)
def test_the_shipped_composition_releases_runs_reviews_accepts_and_notices_an_edit(
    tmp_path: Path,
) -> None:
    """Productive use: a person releases a requirement in Rotaris, lets it run, accepts
    the result, and then edits the requirement again.
    Expected outcome: the release starts a real run in a worktree of its own, the review
    shows what Rotaris measured beside what the agent claimed, `Done` is granted by the
    completion conditions and records the version that was built - and the edit puts the
    card back into `Needs Update` on the next board read, with nobody asking it to."""
    from rotaris.services.requirements_bridge import WorkspaceBoard

    root = _real_project(tmp_path / "project")
    agent = _CommittingAgent()
    actions = _shipped_actions(root, agent)
    board = WorkspaceBoard(root)
    first_hash = _entry(board).current_hash
    assert first_hash
    # The composition arrives with a run starter. Without one every release below
    # would still be "accepted" and would start nothing, which is the shape this
    # whole test exists to make impossible to ship.
    assert actions.starts_runs is True

    # -- 1. the drop on Ready starts work ----------------------------------
    released = actions.release(REAL_REQ, source="backlog")
    assert released.accepted, released.reason
    assert released.failure == "", released.failure
    assert released.started_work, "a drop on Ready starts a run, it does not only move a card"
    assert agent.tasks, "the shipped run host reached the agent"
    assert REAL_REQ in agent.tasks[0]
    assert agent.trees[0].resolve() != root.resolve(), "the run works in a worktree of its own"

    # -- 2. the flow left a reviewable result ------------------------------
    entry = _entry(board)
    assert entry.state is DeliveryState.REVIEW, entry.state
    review = entry.review
    assert review is not None
    # The two facts SWR-3603 keeps apart, and which side each came from.
    assert review.agent_summary.startswith("implemented"), "the agent's claim"
    assert review.verified is True, "Rotaris' own measurement of the run"
    assert [check.name for check in review.checks] == ["repository"]
    assert any(path.startswith("tests/") for path in review.changed_files)

    # -- 3. Done is granted by the conditions, not by the board -------------
    accepted = actions.accept(REAL_REQ)
    assert accepted.accepted, f"{accepted.reason} :: {accepted.details}"
    entry = _entry(board)
    assert entry.state is DeliveryState.DONE
    assert entry.satisfied_hash == first_hash, "Done records the version that was built"

    # -- 4. the edit, and the board read that notices it --------------------
    _requirement_file(root).write_text(
        _document(f"{FIRST_PROSE}\n\n{ADDED_SENTENCE}"),
        encoding="utf-8",
    )
    entry = _entry(board)
    assert entry.current_hash != first_hash, "an edit to the requirement's text moves its hash"
    assert entry.state is DeliveryState.NEEDS_UPDATE, (
        "the ordinary board pass moves a delivered requirement whose text changed (SWR-3502)"
    )
    assert entry.satisfied_hash == first_hash, "still naming the version that was built"
    assert board.specification_moves, "the pass states what it moved"

    # -- 5. and Done is not available for the asking afterwards -------------
    refused = actions.accept(REAL_REQ)
    assert not refused.accepted
    assert refused.reason, "the engine states its own precondition"
    assert _entry(board).state is DeliveryState.NEEDS_UPDATE

    # -- 6. the record says who did what ------------------------------------
    trail = AuditStore(root).read(REAL_REQ)
    human = [event for event in trail.events if event.actor.kind is ActorKind.USER]
    moved = [event for event in trail.events if event.to_state is DeliveryState.NEEDS_UPDATE]
    assert {event.actor.name for event in human} == {"dvf"}
    assert moved and all(event.actor.kind is ActorKind.SYSTEM for event in moved), (
        "the specification move is the system's, never the user's (SWR-3610)"
    )


# --------------------------------------------------------------------------
# answering a decision reaches the engine, not just the delivery state
# --------------------------------------------------------------------------


class _Questioning:
    """A change port with an open question, recording what it was asked to answer."""

    def __init__(self, *, unit_ids: tuple[str, ...] = ()) -> None:
        self.answered: list[tuple[str, str, str]] = []
        self._unit_ids = unit_ids

    def pending(self, req_id: str) -> None:  # pragma: no cover - not an offer test
        del req_id
        return None

    def accept(self, req_id: str, *, actor: object) -> object:  # pragma: no cover
        raise AssertionError(f"{req_id}: {actor} — this port answers questions")

    def question(self, req_id: str) -> object:
        from rotaris_core.requirements.change.decisions import (
            DecisionOption,
            DecisionTrigger,
            PendingDecision,
        )
        from rotaris_core.requirements.change_host import (
            MIGRATION_APPROVED,
            MIGRATION_DECLINED,
        )

        return PendingDecision.raised(
            req_id,
            DecisionTrigger.RISKY_MIGRATION,
            question=f"{req_id} replaces SWR-4001. Carry out the migration now?",
            options=(
                DecisionOption(name=MIGRATION_APPROVED, consequence="the annotations move"),
                DecisionOption(name=MIGRATION_DECLINED, consequence="the worklist waits"),
            ),
            at=NOW,
        )

    def answer(self, req_id: str, option: str, *, actor: object) -> object:
        from rotaris_core.requirements.change_host import OfferOutcome

        self.answered.append((req_id, option, str(actor)))
        return OfferOutcome(
            req_id=req_id,
            accepted=True,
            message=f"{req_id}: {option}",
            unit_ids=self._unit_ids,
        )


class _RefusingQuestion(_Questioning):
    """The same port, whose engine refuses the answer with its own sentence."""

    REFUSAL = "SWR-4015: an unnamed user is not an audit trail (SWR-3512, SWR-3213)"

    def answer(self, req_id: str, option: str, *, actor: object) -> object:
        from rotaris_core.requirements.change_host import OfferOutcome

        self.answered.append((req_id, option, str(actor)))
        return OfferOutcome(req_id=req_id, accepted=False, message=self.REFUSAL)


@verifies(SWR.SWR_3512, SWR.SWR_3607, SWR.SWR_3507)
def test_answering_a_decision_reaches_the_engine_with_the_option_that_was_chosen(
    tmp_path: Path,
) -> None:
    """Productive use: a user picks one of the engine's named options in the blocker panel.
    Expected outcome: that option reaches the engine, attributed to them, and what it plans
    is reported back. Before this the option was recorded as free text on a state transition
    and the engine's question stayed open — so the two options did the same nothing."""
    workspace = _Workspace(tmp_path, [_requirement("SWR-4015")])
    port = _Questioning(unit_ids=("swr-4015-migration",))
    actions = _actions(workspace, changes=port)
    _stage(workspace, BoardAction.ANSWER_BLOCKER)

    outcome = actions.answer_blocker(
        "SWR-4015",
        target="backlog",
        answer="carry out the migration",
    )

    assert outcome.accepted, outcome.reason
    assert port.answered == [
        ("SWR-4015", "carry out the migration", str(DeliveryActor.user("dvf")))
    ]
    assert any("Planned swr-4015-migration" in line for line in outcome.details), outcome.details


@verifies(SWR.SWR_3512, SWR.SWR_3602)
def test_an_engine_that_refuses_the_answer_is_quoted_rather_than_paraphrased(
    tmp_path: Path,
) -> None:
    """Productive use: an answer arrives that the engine will not take — nobody's name on it.
    Expected outcome: the engine's own sentence, and no traceback. SWR-3512 enforces the
    named person by raising, and a board may not show a user a stack trace instead."""
    workspace = _Workspace(tmp_path, [_requirement("SWR-4015")])
    actions = _actions(workspace, changes=_RefusingQuestion())
    _stage(workspace, BoardAction.ANSWER_BLOCKER)

    outcome = actions.answer_blocker("SWR-4015", target="backlog", answer="carry out the migration")

    assert not outcome.accepted
    assert outcome.reason == _RefusingQuestion.REFUSAL


@verifies(SWR.SWR_3607)
def test_a_blocker_with_no_stored_question_is_still_answered_by_the_transition(
    tmp_path: Path,
) -> None:
    """Productive use: a user clears a run blocker, which nobody ever asked a question about.
    Expected outcome: exactly the behaviour that shipped — the card moves and the reason is
    recorded. Only decisions gained a second half; the other blockers did not change."""
    workspace = _Workspace(tmp_path, [_requirement("SWR-4015")])
    actions = _actions(workspace, changes=_AcceptingChanges())
    _stage(workspace, BoardAction.ANSWER_BLOCKER)

    outcome = actions.answer_blocker("SWR-4015", target="backlog", answer="the run is fine now")

    assert outcome.accepted, outcome.reason
    assert outcome.target == "backlog"


# ── SWR-3602: the move strip answers for the column that was picked ────────


@verifies(SWR.SWR_3601, SWR.SWR_3602)
def test_the_move_strip_states_the_column_that_is_picked_and_not_a_list(
    qtbot,
    tmp_path: Path,
) -> None:
    """Productive use: a user selects a backlog requirement and reads the strip above the
    board before pressing Move.
    Expected outcome: the sentence, the picker and the button are about one column — the
    one that is selected — and the sentence says what happens to it.

    The strip used to give three answers at once: a sentence naming every column the
    requirement could reach, a picker holding a different one, and a button whose only
    word about refusing lived in a tooltip. It also read as an action in progress
    ("Move X to: …") while being an enumeration of options."""
    workspace = _Workspace(tmp_path / "ws", [_requirement("SWR-4200")])
    controller, view = _board(qtbot, workspace)
    controller.attach_actions(_actions(workspace))
    _evaluate(qtbot, controller)
    wait_until(lambda: not view.populating, timeout=20)

    view.card_widgets["SWR-4200"].setFocus(Qt.FocusReason.OtherFocusReason)
    settle(qtbot)
    assert view.set_move_target("ready") is True

    stated = view.move_label.text()
    assert stated.startswith("SWR-4200 in Backlog can move to Ready."), stated
    # The consequence is in the sentence itself, not only behind a hover.
    assert "worktree" in stated
    assert view.move_button.isEnabled() is True
    assert view.move_label.accessibleDescription() == stated

    # …and the picker still enumerates, with the engine's own reachability glyph
    # rather than a separate sentence that could disagree with it.
    marks = {
        str(view.move_combo.itemData(index)): view.move_combo.itemText(index)
        for index in range(view.move_combo.count())
    }
    assert marks["ready"] == "→ Ready"
    assert marks["running"] == "⃠ Running"
    running = view.move_combo.itemData(
        view.move_combo.findData("running"),
        Qt.ItemDataRole.ToolTipRole,
    )
    assert "is not a move this board makes" in running
    controller.shutdown()


@verifies(SWR.SWR_3602, SWR.SWR_3314)
def test_a_move_the_board_refuses_says_why_where_the_user_is_looking(
    qtbot,
    tmp_path: Path,
) -> None:
    """Productive use: a user picks a column the engine will not let them move to.
    Expected outcome: the reason is on screen beside the dead button, not only in a
    tooltip they would have to suspect exists and hover to find."""
    workspace = _Workspace(tmp_path / "ws", [_requirement("SWR-4201")])
    controller, view = _board(qtbot, workspace)
    controller.attach_actions(_actions(workspace))
    _evaluate(qtbot, controller)
    wait_until(lambda: not view.populating, timeout=20)

    view.card_widgets["SWR-4201"].setFocus(Qt.FocusReason.OtherFocusReason)
    settle(qtbot)
    assert view.set_move_target("running") is True

    assert view.move_button.isEnabled() is False
    stated = view.move_label.text()
    assert stated.startswith("SWR-4201 in Backlog cannot move to Running."), stated
    # The engine's own words, unchanged — including the columns that *are*
    # reachable, which is the enumeration the sentence used to carry alone.
    assert "is not a move this board makes" in stated
    assert "From Backlog a requirement can reach" in stated
    assert view.move_button.toolTip() in stated
    assert view.move_button.toolTip() == view.move_button.accessibleDescription()
    controller.shutdown()


@verifies(SWR.SWR_3601, SWR.SWR_3314)
def test_the_move_strip_says_what_to_do_when_nothing_is_selected(
    qtbot,
    tmp_path: Path,
) -> None:
    """Productive use: a user opens a board and looks at the move strip before touching
    a card.
    Expected outcome: it asks for a selection and names the chord that reaches it, rather
    than naming a requirement no visible card is marked with."""
    workspace = _Workspace(tmp_path / "ws", [_requirement("SWR-4202")])
    controller, view = _board(qtbot, workspace)
    controller.attach_actions(_actions(workspace))
    _evaluate(qtbot, controller)
    wait_until(lambda: not view.populating, timeout=20)

    assert view.selected_req_id == ""
    assert view.move_label.text() == "Select a requirement on the board to move it (Ctrl+M)"
    assert view.move_button.isEnabled() is False
    assert view.move_button.toolTip() == "Select a requirement on the board to move it."
    controller.shutdown()
