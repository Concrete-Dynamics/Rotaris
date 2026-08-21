"""Every wire the requirements area needs, in one object (SWR-3315).

`views/main_window.py` is 120 KB and already carries every view's signal
connections. The requirement feature arrives over four slices, two of them in
parallel, and each of them would otherwise add its connections to that one file
— which would make the window the merge surface of the whole delivery and put
three authors in the same hundred lines.

So the window does exactly three things for this feature, once and never again:
construct this controller, register :attr:`RequirementsController.surface` as a
view, and name it in ``VIEW_ORDER``. Everything else the feature grows —
actions, review, the queue — attaches *here*: the bridge to the engine's
projection API (SWR-3216), the store extension for requirement state, and every
signal connection the requirement views need.

Two rules keep that promise checkable:

- **The view is attached, not constructed by the window.**
  :meth:`RequirementsController.attach_view` connects each signal in
  :data:`RequirementsController.VIEW_SIGNALS` that the view declares. A later
  slice adds a signal to the view and a row to that table; the window never
  learns about it.
- **Nothing here reads the engine directly.** The controller talks to
  :class:`~rotaris.services.requirements_bridge.RequirementsBridge` and to the
  store, and to nothing else (SWR-3311).

The surface itself is small on purpose: a status line stating when the board was
last evaluated, an explicit refresh (SWR-3312), a persistent notice for a failed
evaluation, and — until the board view is attached — a stated summary of what
the projection holds. Those are the states the area owes a user whether or not a
board is on top of them.

**The writing half hangs here too.** A drop, a keyboard move, a review decision,
an edit and a blocker answer all arrive as view signals, are turned into one
:class:`~rotaris.services.requirements_actions.BoardAction` and go through
:class:`~rotaris.services.requirements_actions.RequirementActions` — which is
the desktop's only write path to a delivery state (SWR-3609). The controller
adds the two things a *surface* owes on top of that write: the card says what is
happening while the engine answers, and it says what came back, persistently,
in the engine's own words (SWR-3601, SWR-3602).

Navigation is the same shape (SWR-3612). A run does not get a transcript here;
it gets its session focused in the Workspace view and its commit opened in Git,
by writing the store fields those views already follow. That is also what keeps
``main_window.py`` untouched by this slice: the controller reaches the rest of
the application through the store, never through the window.
"""

from __future__ import annotations

import datetime as dt
import html
import json
import logging
import time
from dataclasses import replace
from typing import TYPE_CHECKING, cast

from PySide6.QtCore import QCoreApplication, QObject, Qt, QThread, QTimer, Signal, Slot
from PySide6.QtWidgets import QHBoxLayout, QLabel, QVBoxLayout, QWidget
from rotaris_core.reqtocode import SWR, traces

from rotaris.models.requirements_state import (
    ActionFeedback,
    PassProgress,
    RequirementAttention,
    RequirementsBoardState,
    SourceProposalOffer,
    counted,
    describe_age,
    describe_moment,
)
from rotaris.models.state import NoticeSeverity, UiNotice
from rotaris.services.requirements_actions import (
    BoardAction,
    FlowReporting,
    RunsInFlight,
    StageReporting,
    action_for_move,
    move_options,
    resume_column,
)
from rotaris.services.requirements_bridge import (
    RefreshKind,
    RequirementsBridge,
    board_source_for,
)
from rotaris.theme import tokens
from rotaris.widgets.cards import make_button
from rotaris.widgets.feedback import EmptyState, InlineBanner

if TYPE_CHECKING:
    from collections.abc import Callable
    from pathlib import Path

    from rotaris_core.requirements.delivery.evaluation import RequirementEvaluator

    from rotaris.models.requirements_state import (
        PendingAction,
        QueueState,
        RequirementDetail,
    )
    from rotaris.models.store import WorkspaceStore
    from rotaris.services.requirement_editing import RequirementEditing
    from rotaris.services.requirements_actions import (
        ActionOutcome,
        FlowEnded,
        MoveOption,
        RequirementActions,
        RequirementProposal,
        SessionLauncher,
    )
    from rotaris.services.requirements_bridge import BoardDelta, BoardSource
    from rotaris.services.run_coordinator import RunCoordinator
    from rotaris.views.requirement_queue import SchedulingControls
    from rotaris.views.requirement_review import DeferredReviews
    from rotaris.widgets.requirement_blockers import RequirementBlockerPanel
    from rotaris.widgets.requirement_editor import (
        RequirementCreationForm,
        RequirementEditorPanel,
    )

__all__ = [
    "ADOPT_SOURCE_ACTION",
    "GIT_VIEW",
    "NO_COMMIT_NOTICE",
    "REFRESH_ACTION",
    "WORKSPACE_VIEW",
    "RequirementsController",
]

#: Where a run's own surfaces live (SWR-3612). Named rather than spelled at each
#: call site, because "the requirements view does not rebuild a transcript" is
#: only true as long as every navigation lands in the view that already owns it.
WORKSPACE_VIEW = "workspace"
GIT_VIEW = "git"

#: The action id the placeholder and the failure notice both raise, so a user
#: retries the same way wherever they are standing.
REFRESH_ACTION = "requirements.refresh"

#: Adopt the mapping discovery proposed for a workspace whose store Rotaris
#: could not read (SWR-3120). The one control that writes a requirement source
#: configuration, and it exists only while there is a validated one to write.
ADOPT_SOURCE_ACTION = "requirements.adopt_source"

#: What the empty state's button says once a mapping is on offer.
_ADOPT_SOURCE_LABEL = "Use this mapping"

#: The identity of the standing notice for a workspace whose checkout has never
#: committed (SWR-3419). Fixed rather than drawn from
#: :meth:`~rotaris.models.store.WorkspaceStore.new_notice_id`, because every
#: evaluation that still finds no commit is restating one condition rather than
#: reporting a new one — a fresh id each time would make one unchanging fact look
#: like a stream of them.
NO_COMMIT_NOTICE = "requirements.no_commit"

#: What that notice's action says. The user's next move is to commit, and then
#: to find out whether the board agrees — which is this button.
_NO_COMMIT_ACTION_LABEL = "Check again"

#: What the offer's button says. A verb naming the outcome, not the tool: the
#: user wants a project a run can start in, not a lesson in git.
_SETUP_ACTION_LABEL = "Set up Git here"

#: Said to a workspace nobody has versioned, where ``no_commit_refusal`` does not
#: apply — there is no repository yet, so there is no branch to have no commit on.
_UNVERSIONED_MESSAGE = "This folder is not a Git repository, so a run has nothing to branch from."

#: Appended to whichever of the two sentences applies. It states the whole of
#: what the button does — including that it commits what is already here, which
#: is the part a user must not discover afterwards.
_SETUP_OFFER = (
    " Rotaris can do it for you: it adds .rotaris/ to .gitignore so its own"
    " records stay out of your history, then commits everything in this folder"
    " as “Initial commit”. Nothing is pushed."
)

#: The link the status line's problem count is drawn as, and the identity of the
#: notice opening it raises (SWR-3312). Fixed like ``NO_COMMIT_NOTICE`` and for
#: the same reason: opening the same problems twice is one report read twice,
#: not two reports.
STORE_NOTICES_HREF = "requirements.notices"
STORE_NOTICES_NOTICE = "requirements.store_notices"

#: What the opened report offers. The problems are things Rotaris could not read
#: in the store, so the move that answers them is to fix the file and read again.
_STORE_NOTICES_ACTION_LABEL = "Re-read requirements"

#: How the notice banner's action is announced while it carries no label of its
#: own. Named after what it does rather than after the control it sits on.
_RETRY_LABEL = "Retry the requirement evaluation"

_VIEW_ID = "requirements"

_log = logging.getLogger(__name__)

#: How many refused requirements an adoption or verification report names before
#: it stops. Every one of them is still refused, and every one still says why on
#: its own card — this only bounds the notice, because a details box with six
#: hundred lines in it is not a report anybody reads (SWR-3609).
_ADOPTION_REPORT_LIMIT = 20

#: The keys the two surfaces this area installs itself register under. Held here
#: rather than imported, so asking "is a review already attached" costs no import
#: of the review module (SWR-3315).
_REVIEW_PANE = "review"
_QUEUE_PANE = "queue"

#: What asking for the judgement promises (SWR-3503, SWR-3319). The third
#: sentence matters most: an analysis records what a change costs and *offers*
#: the work — accepting it stays the user's (SWR-3512).
ANALYSE_TOOLTIP = (
    "Judge what the changed requirements cost, for the ones still waiting on it.\n"
    "This consults a model; on a large store that is minutes, not seconds.\n"
    "It records an analysis and offers work — it starts none."
)

#: Why the same control is disabled. A workspace can switch the analysis off
#: (SWR-3117), and a control that cannot change anything has to say why rather
#: than sit there greyed (apps/rotaris/AGENTS.md).
ANALYSE_OFF_TOOLTIP = (
    "This workspace has change analysis switched off.\n"
    "Set requirements.change.analyze_changes to true to judge what these changes cost.\n"
    "Until then the rules still move cards; nothing judges them."
)

#: What the same control becomes while the judgement is running.
STOP_ANALYSING = "Stop analysing"
STOP_ANALYSING_TOOLTIP = (
    "Stop after the judgement in progress.\n"
    "The board still arrives and every card a rule moved stays moved.\n"
    "What is left unjudged is picked up by the next full evaluation."
)

#: How long a due burst waits when the board is already reading. Short, because
#: this is not a debounce — the window has already closed and the events are
#: pending; it is only "ask again once the current pass is out of the way"
#: (SWR-3210).
_EVALUATION_RETRY_MS = 150

#: Above how many items a phase's reports are throttled at all (SWR-3320). A
#: suite is a handful of checks, minutes apart, and dropping one of those would
#: leave the banner naming the wrong check for the whole of the next one. A
#: phase that reports once per requirement is the opposite case, which is what
#: the interval below exists for.
_PROGRESS_THROTTLE_ABOVE = 20

#: How often a running pass is allowed to publish where it has got to
#: (SWR-3320). The recording phase reports once per requirement, and on a
#: repository-sized store that is fifteen hundred signals arriving faster than
#: the Qt loop drains them — which grows the event queue and delays the very
#: repaint they exist to drive. A phase change and the last item of a phase are
#: published whatever the clock says.
_PROGRESS_EMIT_S = 0.1

#: The phases each pass walks, in the order it walks them (SWR-3320). Adoption
#: records the verification that earned its moves *after* making them
#: (SWR-3220), which is why its recording phase comes last.
_PASS_SEQUENCES: dict[str, tuple[str, ...]] = {
    "verification": ("reading", "checks", "coverage", "recording"),
    "adoption": ("reading", "checks", "coverage", "adopting", "recording"),
}

_EDITOR_PANE = "editor"
_CREATE_PANE = "create"
_BLOCKERS_PANE = "blockers"


@traces(SWR.SWR_3320)
class _PassProgressRelay:
    """Turns a pass's phase reports into board values, at a rate Qt can take.

    Constructed on the Qt thread and called on the worker's: everything it
    touches is its own, and the only thing it does with what it builds is hand
    it to a Qt signal, which Qt delivers on the receiving object's thread. No
    widget is reachable from here.

    Throttled, because the recording phase reports once per requirement. A phase
    change and the item that completes a phase are never dropped — otherwise a
    pass would finish with its counter reading one short of its total.
    """

    def __init__(self, kind: str, emit: Callable[[object], None]) -> None:
        self._emit = emit
        self._sequence = _PASS_SEQUENCES.get(kind, ())
        self._value = PassProgress(
            active=True,
            kind=kind,
            steps=len(self._sequence),
            started_at=time.time(),
        )
        self._last_emit = 0.0
        self._throttled = False

    @property
    def value(self) -> PassProgress:
        """The last value this relay built — what a test reads."""
        return self._value

    def on_phase(self, phase: object, total: int = 0) -> None:
        """A phase started: reset the position and say so straight away."""
        token = str(phase)
        self._throttled = total > _PROGRESS_THROTTLE_ABOVE
        self._value = replace(
            self._value,
            phase=token,
            step=self._step(token),
            index=0,
            total=total,
            label="",
            detail="",
            deadline_s=0.0,
            phase_started_at=time.time(),
        )
        self._publish(force=True)

    def on_item(
        self,
        phase: object,
        label: str,
        index: int,
        total: int,
        detail: str = "",
        deadline_s: float = 0.0,
    ) -> None:
        """One item of *phase* is being worked on."""
        token = str(phase)
        started = token != self._value.phase
        if started:
            # A phase that never announced itself still gets its rate decided
            # from the first thing it reports.
            self._throttled = total > _PROGRESS_THROTTLE_ABOVE
        self._value = replace(
            self._value,
            phase=token,
            step=self._step(token),
            label=label,
            index=index,
            total=total,
            detail=detail,
            deadline_s=deadline_s,
            phase_started_at=time.time() if started else self._value.phase_started_at,
        )
        self._publish(force=started or (total > 0 and index >= total))

    def _step(self, token: str) -> int:
        """Where *token* sits in this pass, 1-based. ``0`` for one it does not walk."""
        return self._sequence.index(token) + 1 if token in self._sequence else 0

    def _publish(self, *, force: bool) -> None:
        now = time.monotonic()
        if self._throttled and not force and now - self._last_emit < _PROGRESS_EMIT_S:
            return
        self._last_emit = now
        self._emit(self._value)


@traces(SWR.SWR_3315)
class RequirementsController(QObject):
    """Owns the requirements area: its bridge, its state and its connections."""

    #: Signals a requirement view may declare, and the controller method each
    #: is connected to. A view that grows a signal is wired by adding a row
    #: here — never by editing ``views/main_window.py`` (SWR-3315).
    VIEW_SIGNALS: tuple[tuple[str, str], ...] = (
        ("refresh_requested", "refresh"),
        ("requirement_selected", "select"),
        ("requirement_activated", "open_requirement"),
        ("scroll_changed", "remember_scroll"),
    )

    #: The *writing* half of the same contract (SWR-3601): a drop, its keyboard
    #: equivalent, every action a review, editor or blocker surface raises, and
    #: the navigation that hands a run back to the views that own it (SWR-3612).
    #:
    #: A second table rather than more rows in the first, because the two answer
    #: different questions and are guarded separately: a board that renders is a
    #: board with :attr:`VIEW_SIGNALS` connected, and a board that *acts* is one
    #: with these connected too. :attr:`connected_action_signals` reports them.
    ACTION_SIGNALS: tuple[tuple[str, str], ...] = (
        ("move_requested", "move_requirement"),
        ("action_requested", "perform_action"),
        ("feedback_dismissed", "dismiss_feedback"),
        ("edit_requested", "edit_requirement"),
        ("create_requested", "create_requirement"),
        ("blocker_answered", "answer_blocker"),
        ("open_file_requested", "open_file"),
        ("queue_requested", "open_queue"),
        ("review_requested", "open_review"),
        ("blockers_requested", "open_blockers"),
        ("open_run_requested", "open_run"),
        ("open_commit_requested", "open_commit"),
        ("adoption_requested", "adopt_existing"),
        ("adoption_dismissed", "dismiss_adoption"),
        ("verification_requested", "verify_existing"),
    )

    #: A requirement the user wants to edit (SWR-3605). The editor surface
    #: connects here; the controller neither owns a dialog nor knows of one.
    edit_requested = Signal(str)
    #: The user wants to create a requirement (SWR-3606).
    creation_requested = Signal()
    #: A requirement whose review the user opened (SWR-3603).
    review_requested = Signal(str)
    #: A requirement whose blocker needs answering (SWR-3607).
    blocker_requested = Signal(str)
    #: ``(control, value)`` — a queue control the scheduler has to apply
    #: (SWR-3608). The queue surface raises it; whatever owns the scheduler
    #: applies it and publishes the new queue back through :meth:`set_queue`.
    queue_control_requested = Signal(str, str)
    #: The :class:`~rotaris.services.requirements_actions.ActionOutcome` of every
    #: performed board action, so a review or queue surface can follow what the
    #: board did without repeating the call (SWR-3604, SWR-3610).
    action_performed = Signal(object)
    #: Internal: hops a
    #: :class:`~rotaris.services.requirements_actions.FlowEnded` from the thread
    #: the flow ran on onto this object's. Never connected to from outside — a
    #: surface that wants the ending reads the feedback it produced.
    _flow_ended = Signal(object)
    #: Internal: the same hop for a
    #: :class:`~rotaris_core.requirements.execution.flow.StageEvent`, so what a
    #: flow is *doing* reaches the board while it is still doing it (SWR-3413).
    _stage_reported = Signal(object)

    def __init__(
        self,
        store: WorkspaceStore,
        *,
        workspace: Path | None = None,
        bridge: RequirementsBridge | None = None,
        source: BoardSource | None = None,
        actions: RequirementActions | None = None,
        clock: Callable[[], dt.datetime] | None = None,
        coordinator: object | None = None,
        parent: QObject | None = None,
    ) -> None:
        super().__init__(parent)
        self._store = store
        self._workspace = workspace
        # The board refuses every release while the workspace has no commit, and
        # the answer changes the moment one is made — including by the offer the
        # notice carries, which is a Git action and not a board one. The window
        # may not tell this area to catch up (SWR-3315), so the area listens for
        # the Git state changing and re-asks the question itself.
        store.git_changed.connect(self._recheck_base)
        #: The suite pass in flight — an adoption (SWR-3614) or a verification
        #: (SWR-3615). ``None`` otherwise, which is also how a second click is
        #: refused. **One slot for both**, because both run the workspace's whole
        #: check suite and running two at once would have them measure each
        #: other's half-finished tree.
        self._pass_thread: QThread | None = None
        self._pass_worker: QObject | None = None
        #: Whether the user put the offer away for this session.
        self._adoption_dismissed = False
        #: Whether this launch has already been told what a released run is
        #: given (SWR-3707). Per controller and not persisted, because that is
        #: what "again next launch" means; the permanent answer is a preference.
        self._run_permissions_told = False
        #: Whether this workspace has been seen with a commit to base runs on
        #: (SWR-3419). One controller holds one workspace for its whole life, and
        #: a checkout that has committed stays committed, so the answer is asked
        #: until it is yes and then never again — see :meth:`_no_commit_notice`.
        self._committed = False
        self._actions = actions
        self._actions_resolved = actions is not None
        #: How a released unit's run becomes a session (SWR-3622). ``None``
        #: without a coordinator to build one around; a board driven without it
        #: — a test, a headless composition — still releases, and the run takes
        #: the self-contained path it always did.
        self._launcher: SessionLauncher | None = None
        self._attach_coordinator(coordinator)
        # A flow ends on the worker thread that ran it, and the feedback it has
        # to supersede lives here. One queued hop, so nothing on the board is
        # ever touched from that thread (SWR-3601).
        self._flow_ended.connect(self._apply_flow_end, Qt.ConnectionType.QueuedConnection)
        self._stage_reported.connect(self._apply_stage, Qt.ConnectionType.QueuedConnection)
        # Whether a run is waiting on this user is a fact about a live session,
        # so it arrives on the session list's schedule rather than the board's
        # (SWR-3623).
        store.sessions_changed.connect(self._sessions_changed)
        self._report_flows(self._actions)
        self._clock: Callable[[], dt.datetime] = (
            clock if clock is not None else lambda: dt.datetime.now(dt.UTC)
        )
        self._bridge = (
            bridge
            if bridge is not None
            else RequirementsBridge(
                source if source is not None else board_source_for(workspace),
                # The same clock, deliberately: every "2 hours ago" on this
                # surface is measured against it, and a bridge left on the wall
                # clock would age the cards from a different now than the status
                # line above them.
                clock=self._clock,
                parent=self,
            )
        )
        self._view: QWidget | None = None
        self._connected: tuple[str, ...] = ()
        self._connected_actions: tuple[str, ...] = ()
        self._requested = False
        # The default surfaces, once installed. Held because the controller is
        # what answers their signals — a pane the view owns but nobody feeds is
        # the inert control SWR-3316 exists to prevent.
        self._editor: RequirementEditorPanel | None = None
        self._creator: RequirementCreationForm | None = None
        self._blockers: RequirementBlockerPanel | None = None
        # The review's off-thread reader, once installed (SWR-3317). Held so a
        # closing window can wait for a read in flight instead of taking its
        # thread down with it.
        self._reviews: DeferredReviews | None = None
        self._editing: RequirementEditing | None = None
        self._editing_resolved = False
        #: The trigger and debounce policy (SWR-3210), built on first use so a
        #: window constructor never reads a workspace's configuration.
        self._evaluator: RequirementEvaluator | None = None
        self._evaluation_timer = QTimer(self)
        self._evaluation_timer.setSingleShot(True)
        self._evaluation_timer.timeout.connect(self._evaluation_due)
        self._surface = self._build_surface()

        self._bridge.evaluated.connect(self._evaluated)
        self._bridge.detail_ready.connect(self._detail_ready)
        self._bridge.failed.connect(self._failed)
        self._bridge.unavailable.connect(self._unavailable)
        self._bridge.busy_changed.connect(self._busy_changed)
        self._bridge.analysing_changed.connect(self._analysing_changed)
        # The board is read when the user first opens it, not when the window is
        # built: a projection reads the repository, and no window constructor
        # may pay for that.
        store.ui_changed.connect(self._active_view_changed)
        # The repository moved under a loaded board — the case SWR-3312 exists
        # for: a commit in another window changes the affected cards here.
        store.git_changed.connect(self._repository_moved)
        store.requirements_changed.connect(self._board_changed)
        self._placeholder.action_requested.connect(self._action)
        self._banner.action_requested.connect(self._action)
        self._banner.dismissed.connect(self._dismiss_notice)
        self._refresh_button.clicked.connect(self.refresh)
        app = QCoreApplication.instance()
        if app is not None:
            # Qt drops this connection when the controller is destroyed, so a
            # window that closed first cannot be called back into.
            app.aboutToQuit.connect(self.shutdown)
        self._render()

    # ── what the window registers ─────────────────────────────────────────

    @property
    def view_id(self) -> str:
        """The id the window registers this area under."""
        return _VIEW_ID

    @property
    def surface(self) -> QWidget:
        """The widget the window puts in its stack — the whole requirements area."""
        return self._surface

    @property
    def bridge(self) -> RequirementsBridge:
        """The one seam to the requirement engine (SWR-3311)."""
        return self._bridge

    @property
    def view(self) -> QWidget | None:
        """The attached board view, when one has been attached."""
        return self._view

    @property
    def connected_signals(self) -> tuple[str, ...]:
        """Which of :attr:`VIEW_SIGNALS` the attached view actually declared.

        Reported rather than assumed: a view that renames a signal silently
        stops being wired, and this is what a test asserts against.
        """
        return self._connected

    @property
    @traces(SWR.SWR_3601, SWR.SWR_3315)
    def connected_action_signals(self) -> tuple[str, ...]:
        """Which of :attr:`ACTION_SIGNALS` the attached view declared.

        The writing half of :attr:`connected_signals`, and reported for the same
        reason: a board whose ``move_requested`` was renamed would still render
        perfectly and quietly stop being able to move anything.
        """
        return self._connected_actions

    @traces(SWR.SWR_3315)
    def attach_view(self, view: QWidget) -> tuple[str, ...]:
        """Put *view* on the surface and connect every signal it declares.

        Returns the names it connected, so the caller — and the test — sees what
        was wired instead of trusting that something was.
        """
        if self._view is not None:
            self._body.removeWidget(self._view)
            self._view.setParent(None)
        self._view = view
        self._body.insertWidget(0, view, 1)
        self._connected = self._connect(view, self.VIEW_SIGNALS)
        self._connected_actions = self._connect(view, self.ACTION_SIGNALS)
        self._push_moves(self._store.requirements)
        self._render()
        return self._connected

    def _connect(self, view: QWidget, table: tuple[tuple[str, str], ...]) -> tuple[str, ...]:
        connected: list[str] = []
        for name, slot in table:
            signal = getattr(view, name, None)
            if signal is None or not hasattr(signal, "connect"):
                continue
            signal.connect(getattr(self, slot))
            connected.append(name)
        return tuple(connected)

    @property
    @traces(SWR.SWR_3601, SWR.SWR_3609)
    def actions(self) -> RequirementActions | None:
        """The board's write path, built from the workspace on first use.

        Built here rather than in the window, for the same reason the bridge is
        (SWR-3315): the requirements area composes its own collaborators, and
        ``main_window.py`` constructs this controller and nothing else. The read
        it needs — is there a writable requirement store — happens on the first
        action rather than in a constructor, so opening Rotaris never pays for it.

        ``None`` is a real state, not a missing dependency: a project that keeps
        no requirement store Rotaris can write has a readable board and no
        actions, and every action method below states that instead of raising
        (SWR-3602).
        """
        if self._actions_resolved:
            return self._actions
        self._actions_resolved = True
        if self._workspace is not None:
            from rotaris.services.requirements_actions import workspace_actions

            self._actions = workspace_actions(self._workspace, launcher=self._launcher)
            self._report_flows(self._actions)
        return self._actions

    @traces(SWR.SWR_3622, SWR.SWR_3315)
    def _attach_coordinator(self, coordinator: object | None) -> None:
        """Build the way a released unit's run becomes a session, if there is one.

        The window constructs this controller and registers its surface, and
        that is the whole of what it does with the requirements area (SWR-3315)
        — so the run coordinator arrives as a collaborator and the launcher
        around it is built here, where every other collaborator of this area is
        built.

        Asked structurally, like the write path is. A composition driven by
        something that is not a coordinator — a test double, a headless run —
        leaves the launcher unset, and a release runs its unit the
        self-contained way it always did rather than failing on a coordinator
        that was never there.
        """
        if coordinator is None or self._workspace is None:
            return
        if not hasattr(coordinator, "launch_new") or not hasattr(
            coordinator,
            "session_run_finished",
        ):
            return
        from rotaris.services.session_launcher import CoordinatorSessionLauncher  # noqa: PLC0415

        # Cast, not an annotation: the two attributes above are the whole of
        # what is required of it, and asking the type system for the concrete
        # class here would make every composition import the coordinator to say
        # it has none.
        self.attach_launcher(
            CoordinatorSessionLauncher(
                cast("RunCoordinator", coordinator),
                self._workspace,
                parent=self,
            ),
        )

    @traces(SWR.SWR_3622)
    def attach_launcher(self, launcher: SessionLauncher) -> None:
        """Give the area a way to start a unit's run as a session (SWR-3622).

        Public as well as constructor-fed: a coordinator that arrives after this
        controller was built — a workspace opened later, a composition that
        assembles in another order — has the same seam to hand itself to.

        Attaching after the write path has already been resolved re-resolves it,
        because a starter built without a launcher runs its units the old way for
        the rest of the session — silently, which is the failure this method
        exists to prevent.
        """
        self._launcher = launcher
        if self._actions_resolved:
            self._actions_resolved = False
            self._actions = None
            _ = self.actions

    @property
    @traces(SWR.SWR_3316, SWR.SWR_3605, SWR.SWR_3606)
    def editing(self) -> RequirementEditing | None:
        """The area's write path into the requirement *text*, built on first use.

        The same shape as :attr:`actions` and for the same reason (SWR-3315):
        the area composes its own collaborators, and the read it needs — which
        sources will accept a write — happens when an editor is first installed
        rather than in a constructor.

        ``None`` is a real state: a workspace whose requirement store Rotaris
        cannot write has a readable board and no editor, and offering one would
        be a save that cannot happen (SWR-3602).
        """
        if self._editing_resolved:
            return self._editing
        self._editing_resolved = True
        if self._workspace is not None:
            from rotaris.services.requirements_actions import workspace_editing

            self._editing = workspace_editing(self._workspace)
        return self._editing

    @traces(SWR.SWR_3316)
    def attach_editing(self, editing: RequirementEditing) -> None:
        """Give the area a composed text-write path, replacing the default."""
        self._editing = editing
        self._editing_resolved = True

    @traces(SWR.SWR_3601)
    def attach_actions(self, actions: RequirementActions) -> None:
        """Give the area a fully composed write path, replacing the default.

        The seam the review surface uses (SWR-3604): accepting a result needs the
        workspace's completion gate (SWR-3215), which is assembled where the
        evidence lives rather than here, and attaching it is how it arrives.
        """
        self._actions = actions
        self._actions_resolved = True
        self._report_flows(actions)
        self._push_moves(self._store.requirements)

    @traces(SWR.SWR_3601, SWR.SWR_3602)
    def _report_flows(self, actions: RequirementActions | None) -> None:
        """Ask this write path's run starter to say how the flows it starts end.

        Asked structurally, the way the transition path asks for a pre-flight: a
        starter that does not dispatch — a headless composition, a double that
        records what it was asked to start — has no later ending to report and is
        left alone. Every path that gives this controller a write path comes
        through here, because an acceptance that outlives its run is the same
        defect whether the composition was built here or handed in (SWR-3601).
        """
        starter = actions.runs if actions is not None else None
        if isinstance(starter, FlowReporting):
            starter.report_flows(self._flow_ended_offthread)
        if isinstance(starter, StageReporting):
            starter.report_stages(self._stage_offthread)
        self._follow_runs(starter)

    @traces(SWR.SWR_3611)
    def _follow_runs(self, starter: object) -> None:
        """Tell the board which flows this process is running (SWR-3611).

        The evaluation frees a requirement left in ``Running`` by a process that
        died, and "this very process is running it" is the one fact that
        distinguishes a live flow from an abandoned one before its first run
        record has a session. Asked structurally like the reporting above: a
        starter that cannot say what is in flight, and a bridge whose source is
        not the workspace board, are both left alone — the pass then falls back
        on liveness and its grace period, which is correct, only slower.
        """
        # ``getattr`` because the constructor reports flows before it builds the
        # bridge: that call has no board to wire, and the one that follows the
        # first resolved write path does.
        bridge = getattr(self, "_bridge", None)
        source = bridge.source if bridge is not None else None
        follow = getattr(source, "follow_runs", None)
        if follow is None or not isinstance(starter, RunsInFlight):
            return
        running = starter
        follow(lambda: running.in_flight)

    def _flow_ended_offthread(self, ended: FlowEnded) -> None:
        """Runs on the flow's worker thread — marshal and return immediately."""
        self._flow_ended.emit(ended)

    def _stage_offthread(self, event: object) -> None:
        """Runs on the flow's worker thread — marshal and return immediately."""
        self._stage_reported.emit(event)

    @traces(SWR.SWR_3413, SWR.SWR_3601)
    @Slot(object)
    def _apply_stage(self, event: object) -> None:
        """A flow moved on: say so where its acceptance is still standing.

        The board reads persisted stores, and for the first minutes of a flow
        there is nothing persisted to read: the delivery state says ``Running``
        while the unit store is still empty, so the card truthfully reads "No
        execution units yet · Never run" and a user watching it cannot tell a
        working run from a stuck one. This is what fills that gap — the same
        feedback slot the acceptance and the ending use, replaced in place, so
        one requirement never accumulates a column of stage lines.

        Deliberately does **not** refresh: an evaluation per stage would re-read
        the whole store several times a minute for a board whose cards cannot
        have changed. The ending refreshes, and that is when they can have.
        """
        req_id = str(getattr(event, "req_id", "") or "")
        message = str(getattr(event, "message", "") or "")
        if not req_id or not message:
            return
        state = self._store.requirements
        standing = next((item for item in state.feedback if item.req_id == req_id), None)
        self._publish(
            tuple(item for item in state.pending if item.req_id != req_id),
            (
                *(item for item in state.feedback if item.req_id != req_id),
                ActionFeedback(
                    req_id=req_id,
                    action=str(BoardAction.RELEASE),
                    # The acceptance's own headline, kept: this strip *is* that
                    # acceptance, still true, with what the run is doing now
                    # underneath it. A second headline would read as a second
                    # piece of news (SWR-3601).
                    title=(
                        standing.title
                        if standing is not None
                        else f"{req_id}: {BoardAction.RELEASE.label.lower()} accepted"
                    ),
                    # The engine's own line, carried verbatim (SWR-3602) — it
                    # already reads ``SWR-1 decomposition: finished — 3 unit(s)``.
                    reason=message,
                    details=standing.details if standing is not None else (),
                    accepted=True,
                    severity="info",
                ),
            ),
        )

    @traces(SWR.SWR_3601, SWR.SWR_3602)
    @Slot(object)
    def _apply_flow_end(self, ended: FlowEnded) -> None:
        """A dispatched flow ended: say so where its acceptance is still standing.

        The **same** feedback slot, never a second strip below the first. The
        acceptance for this requirement is replaced, because leaving both would be
        the contradiction this exists to remove: a green "release accepted —
        started run …" sitting directly above the banner saying the same
        requirement is stopped (SWR-3601, SWR-3602).

        A flow that reached a reviewable result supersedes nothing — its
        acceptance was true and stays true. Either way the delivery store moved
        under the board while this ran, so it is read again for exactly the reason
        an accepted action reads it: the card's column is the projection's to
        state, not this controller's (SWR-3311).
        """
        if not ended.succeeded:
            state = self._store.requirements
            self._publish(
                tuple(item for item in state.pending if item.req_id != ended.req_id),
                (
                    *(item for item in state.feedback if item.req_id != ended.req_id),
                    ActionFeedback(
                        req_id=ended.req_id,
                        action=str(BoardAction.RELEASE),
                        title=ended.title,
                        # The engine's own sentence, carried verbatim (SWR-3602).
                        reason=ended.reason,
                        details=ended.details,
                        accepted=False,
                        # The state and the work disagree: this is the one shape
                        # of board feedback that is a failure rather than a
                        # refusal correctly made.
                        severity="error",
                    ),
                ),
            )
        self.refresh()

    @traces(SWR.SWR_3608, SWR.SWR_3413)
    def follow_scheduling(self, controls: SchedulingControls) -> bool:
        """Let the queue's controls bound what a release actually starts.

        The other half of SWR-3608: the panel already shows the limits and writes
        them back, and this is what makes them *hold*. A stopped queue refuses the
        next release and a spent concurrency limit refuses the one after that,
        with the reason the user sees — rather than a control that persists a
        number nothing reads.

        ``False`` when the write path has no starter to bound, which is the case
        for a project Rotaris cannot write and for a caller that supplied its own.
        """
        starter = self.actions.runs if self.actions is not None else None
        follow = getattr(starter, "follow", None)
        if not callable(follow):
            return False
        follow(lambda: controls.limits)
        return True

    @traces(SWR.SWR_3315)
    def attach_pane(self, key: str, pane: QWidget) -> bool:
        """Register a further requirement surface — review, queue, editor.

        The extension point SWR-3315 promised: a slice that adds a pane calls
        this, and ``main_window.py`` never learns the pane exists. ``False``
        when no board view is attached to hold it yet.
        """
        attach = getattr(self._view, "attach_pane", None)
        if not callable(attach):
            return False
        result: bool = bool(attach(key, pane))
        return result

    # ── what the area does ────────────────────────────────────────────────

    @traces(SWR.SWR_3312, SWR.SWR_3316, SWR.SWR_3319)
    def refresh(self, kind: RefreshKind = RefreshKind.EVALUATE) -> bool:
        """Re-evaluate the board. ``False`` when nothing was started.

        The area installs itself here as well as on first open (SWR-3316), so a
        caller that refreshes without ever selecting the view still gets a board
        to put the result on rather than an evaluation nothing renders.

        The default is the **cheap** kind, and that is the opposite of the
        bridge's default on purpose. The bridge defaults to the expensive pass so
        that nothing which predates the kinds quietly loses behaviour; this
        method is what a *user gesture* reaches — the area header's ``Refresh
        requirements`` button, the refresh a written requirement asks for, the
        re-read a stated failure offers — and none of those should be able to
        wait minutes on a provider without saying so first (SWR-3319). The one
        automatic trigger that may is :meth:`_evaluation_due`, which names its
        kind.
        """
        self.install_board()
        self._requested = True
        return self._bridge.refresh(kind)

    @traces(SWR.SWR_3319, SWR.SWR_3503)
    def analyse(self) -> bool:
        """Judge the changes nothing has judged yet. ``False`` when none started.

        The other half of a cheap refresh. Every pass applies the rules, so cards
        move whatever this costs; what only a full pass buys is the *judgement* —
        what a change costs, and therefore what work to offer (SWR-3503). Left
        implicit, that judgement would arrive whenever the next repository event
        happened to fire; named, it is something a user can ask for and watch.
        """
        return self.refresh(RefreshKind.ANALYSE)

    @traces(SWR.SWR_3319)
    def cancel_analysis(self) -> bool:
        """Stop the analysing pass. ``False`` when nothing is analysing.

        Straight through to the bridge, which is where the token lives. Nothing
        is undone and no board is thrown away — see
        :meth:`~rotaris.services.requirements_bridge.RequirementsBridge.cancel_analysis`.
        """
        return self._bridge.cancel_analysis()

    def select(self, req_id: str) -> None:
        """Move the selection — the value a re-evaluation must preserve."""
        self._store.select_requirement(req_id)

    @traces(SWR.SWR_3307, SWR.SWR_3313)
    def open_requirement(self, req_id: str) -> None:
        """Select a requirement and hand its detail view to the board.

        Twice, when there is more to say: the board's own entry opens the panel
        immediately, and the deep read — the audit trail and the revision history
        (SWR-3313) — replaces it when it lands. Waiting for the second would make
        every detail view cost a git log; skipping it would leave the revision
        history permanently unread, which is the whole question SWR-3313 exists
        to answer.
        """
        self.select(req_id)
        detail = self.detail_for(req_id)
        if detail is not None:
            self._show_detail(detail)
        self._bridge.open_detail(req_id)

    def remember_scroll(self, offset: int) -> None:
        """Record the reader's position, so an evaluation can restore it."""
        self._store.set_requirements_scroll(offset)

    @traces(SWR.SWR_3307)
    def detail_for(self, req_id: str) -> RequirementDetail | None:
        """One requirement's five sections, from the last projection."""
        return self._bridge.detail_for(req_id)

    @traces(SWR.SWR_3313)
    def _detail_ready(self, detail: RequirementDetail) -> None:
        """The deep read landed — show it, unless the user has moved on.

        A detail for a requirement nobody is looking at any more is dropped
        rather than pushed: the user opened another card while this was reading,
        and replacing what they are reading would be the panel changing under
        them.
        """
        if self._store.requirements.selected_req_id in {detail.req_id, ""}:
            self._show_detail(detail)

    def _show_detail(self, detail: RequirementDetail) -> None:
        show = getattr(self._view, "show_detail", None)
        if callable(show):
            show(self._with_detail_attention(detail))

    # ── the writing half (SWR-3601, SWR-3602, SWR-3610) ───────────────────

    @traces(SWR.SWR_3601, SWR.SWR_3602, SWR.SWR_3201)
    def move_requirement(
        self,
        req_id: str,
        source: str,
        target: str,
        reason: str = "",
    ) -> ActionOutcome | None:
        """Perform a drop — or its keyboard equivalent — and report what happened.

        The whole of SWR-3601 in one method: the card states the action while it
        is in flight, the engine decides, and the answer is published as
        persistent feedback. A refused move leaves the delivery state untouched,
        so the board's next paint puts the card back where it came from — the
        "springs back" of the requirement is the *absence* of a state change,
        never a second animation the view has to remember to run.

        *reason* is what a hold carries (SWR-3201) and is empty for every other
        move. Positional-friendly with a default, because the board's
        ``move_requested`` signal is connected to this method by name and a Qt
        connection passes what the signal declares.
        """
        actions = self.actions
        if actions is None:
            return self._no_actions(req_id, source, target)
        action = action_for_move(source, target)
        if action is not None:
            if not self._disclose_run_permissions(action, req_id):
                return self._cancelled(str(action), req_id, source=source, target=target)
            self._begin(actions.begin(action, req_id, source=source, target=target))
        outcome = actions.move(req_id, source=source, target=target, reason=reason)
        return self._finish(outcome)

    @traces(SWR.SWR_3601, SWR.SWR_3610)
    def perform_action(self, action: str, req_id: str, detail: str = "") -> ActionOutcome | None:
        """Perform one named board action — the entry every surface uses.

        A string rather than the enum, because it crosses a Qt signal; it is
        turned back into a :class:`~rotaris.services.requirements_actions
        .BoardAction` here, and an unknown name is refused rather than guessed
        at.
        """
        actions = self.actions
        if actions is None:
            return self._no_actions(req_id, "", "")
        try:
            wanted = BoardAction(action)
        except ValueError:
            return self._refuse(req_id, action, f"{action!r} is not a board action.")
        card = self._store.requirements.card(req_id)
        source = card.delivery if card is not None else ""
        if not self._disclose_run_permissions(wanted, req_id):
            return self._cancelled(action, req_id, source=source, target="")
        self._begin(actions.begin(wanted, req_id, source=source))
        return self._finish(actions.perform(wanted, req_id, source=source, detail=detail))

    @traces(SWR.SWR_3607)
    def answer_blocker(self, req_id: str, answer: str) -> ActionOutcome | None:
        """Answer the question that blocked *req_id* and let the flow continue."""
        actions = self.actions
        card = self._store.requirements.card(req_id)
        if actions is None or card is None:
            return self._no_actions(req_id, "", "")
        self._begin(actions.begin(BoardAction.ANSWER_BLOCKER, req_id, source=card.delivery))
        return self._finish(
            actions.answer_blocker(req_id, target=resume_column(card.blocked_from), answer=answer),
        )

    @traces(SWR.SWR_3605, SWR.SWR_3316)
    def edit_requirement(self, req_id: str) -> None:
        """Raise the edit entry point for *req_id* (SWR-3605).

        The controller does not own an editor: it states the intent, and the
        surface that owns editing answers it. Keeping the intent here is what
        lets the board, the detail view and a later editor all reach editing
        through one wire.

        The default editor is installed on the way through (SWR-3316), on the
        first edit rather than with the board — before that, this signal reached
        nothing and the board's ``Edit`` control was live and inert.
        """
        self.select(req_id)
        self.install_editor()
        self.edit_requested.emit(req_id)

    @traces(SWR.SWR_3606, SWR.SWR_3316)
    def create_requirement(self) -> None:
        """Raise the creation entry point (SWR-3606)."""
        self.install_editor()
        self.creation_requested.emit()

    @traces(SWR.SWR_3603, SWR.SWR_3315)
    def open_review(self, req_id: str) -> None:
        """Raise the review entry point for *req_id* (SWR-3603).

        The deep read is started with it: the review shows the run, its checks
        and its traceability changes, and those live in the detail pass rather
        than on the board (SWR-3313).

        The surface is built on the first review rather than at construction:
        a board that is only read never pays for it, and a review nobody
        installed would leave SWR-3603 as a widget the product cannot reach.
        """
        self.open_requirement(req_id)
        self.install_review()
        self.review_requested.emit(req_id)

    @traces(SWR.SWR_3607, SWR.SWR_3316)
    def open_blockers(self, req_id: str) -> None:
        """Raise the blocker entry point for *req_id* (SWR-3607).

        The detail view answers a blocker on its own, so this is the richer
        surface rather than the only one — built here, on the first request
        (SWR-3316), because before that the request reached nothing.
        """
        self.select(req_id)
        self.install_blockers()
        self.blocker_requested.emit(req_id)

    @traces(SWR.SWR_3608, SWR.SWR_3315)
    def open_queue(self) -> bool:
        """Show the delivery queue, building the surface on first use (SWR-3608).

        ``False`` when there is no board view to hold it. Scheduling a user
        cannot see is the risk SWR-3608 exists for, so the way in is the board's
        own control rather than an integration somebody has to remember.
        """
        self.install_queue()
        from rotaris.views.requirement_queue import open_queue as raise_queue

        return raise_queue(self)

    @traces(SWR.SWR_3614)
    def dismiss_adoption(self) -> None:
        """Put the adoption offer away without writing anything (SWR-3614).

        Dismissal is a display decision and nothing else — no delivery record, no
        audit entry, no state moved. It lasts for this session; the finding is
        recomputed on the next launch, and if it is still true the offer is too.
        """
        self._adoption_dismissed = True
        current = self._store.requirements
        if current.adoption is not None:
            self._store.set_requirements(replace(current, adoption=None))
            self._push_to_view(self._store.requirements, None)

    @traces(SWR.SWR_3614, SWR.SWR_3217)
    def adopt_existing(self) -> bool:
        """Verify this workspace and adopt what the verification supports.

        Runs on a worker, because it executes the project's whole check suite:
        on a repository of any size that is minutes, and doing it on the Qt
        thread would freeze the board for all of them. The board says it is
        verifying meanwhile and stays usable (SWR-3614).

        ``False`` when there is no workspace or a pass is already in flight — a
        second click must not start a second verification.
        """
        if self._workspace is None:
            return False
        return self._start_pass(
            _AdoptionWorker(self._workspace, self._actor_name()),
            self._adoption_produced,
            kind="adoption",
        )

    @traces(SWR.SWR_3615, SWR.SWR_3221)
    def verify_existing(self) -> bool:
        """Run this workspace's check suite once and record what it verified.

        The action SWR-3615 exists for, and deliberately *only* that: it writes
        verifications and moves no card. A green suite is evidence, not a
        decision — turning evidence into ``Done`` stays the completion gate's job
        (SWR-3215), reached through a run or through adoption.

        On the same worker slot as adoption, because both run the whole suite and
        two at once would measure each other's tree.
        """
        if self._workspace is None:
            return False
        return self._start_pass(
            _VerificationWorker(self._workspace),
            self._verification_produced,
            kind="verification",
        )

    @traces(SWR.SWR_3120, SWR.SWR_3106)
    def adopt_source(self) -> bool:
        """Persist the mapping discovery proposed, then read the board with it.

        The acceptance half of SWR-3106, which had no caller: a proposal could be
        read and not taken, so a project Rotaris could describe perfectly still
        needed its configuration written by hand.

        The proposal being adopted is the one the user was shown — carried on the
        state since the refusal, never re-derived here. A second discovery run
        could legitimately answer differently, and the user would then have
        adopted a mapping nobody reviewed.

        ``False`` when there is no workspace, no validated proposal, or a pass is
        already in flight.
        """
        offer = self._store.requirements.source_offer
        if self._workspace is None or offer is None or not offer.worth_offering:
            return False
        return self._start_pass(
            _SourceAdoptionWorker(self._workspace, offer.outcome),
            self._source_adoption_produced,
        )

    @Slot(object)
    def _source_adoption_produced(self, lines: object) -> None:
        """Say what was written, then read the board through it (SWR-3120)."""
        self._report(lines, title="Requirement source")
        self.refresh()

    def _start_pass(
        self,
        worker: _AdoptionWorker | _VerificationWorker | _SourceAdoptionWorker,
        produced: Callable[[object], None],
        kind: str = "",
    ) -> bool:
        """Move *worker* onto a thread of its own and start it.

        Runs on a worker, because these passes execute the project's whole check
        suite: on a repository of any size that is minutes, and doing it on the Qt
        thread would freeze the board for all of them. The board says what it is
        doing meanwhile and stays usable.

        *kind* names the pass for the surface that narrates it (SWR-3320). The
        source-mapping pass declares none: it writes one file and has no phases
        worth walking a user through.
        """
        if self._pass_thread is not None:
            return False
        worker.produced.connect(produced)
        reports = getattr(worker, "progress", None)
        if reports is not None:
            reports.connect(self._pass_progress)
        thread = QThread(self)
        worker.moveToThread(thread)
        thread.started.connect(worker.run)
        worker.finished.connect(thread.quit)
        # Collected on this thread, the same way the bridge collects its own
        # workers: deleting a QThread from inside its own finished handler is
        # what PySide will not forgive.
        thread.finished.connect(self._pass_thread_finished)
        self._pass_thread = thread
        self._pass_worker = worker
        if kind:
            self._store.set_requirement_pass(
                adopting=kind == "adoption",
                verifying=kind == "verification",
                progress=PassProgress(
                    active=True,
                    kind=kind,
                    steps=len(_PASS_SEQUENCES.get(kind, ())),
                    started_at=time.time(),
                ),
            )
        self._push_to_view(self._store.requirements, None)
        thread.start()
        return True

    @Slot(object)
    @traces(SWR.SWR_3320)
    def _pass_progress(self, value: object) -> None:
        """Publish where the running pass has got to — and repaint nothing else.

        Deliberately not :meth:`_push_to_view`: that path rebuilds the board,
        and ten of those a second would spend everything SWR-3317 bought on a
        value that carries no card. The state is written through the store so it
        stays the single source of truth, and the view is handed the value
        through the one method that touches only the pass banner.
        """
        if not isinstance(value, PassProgress):
            return
        current = self._store.requirements
        if not (current.adopting or current.verifying):
            # The pass has already reported; a value still queued behind that
            # report must not bring the banner back.
            return
        self._store.set_requirement_pass(progress=value)
        self._push_pass_progress(value)

    def _push_pass_progress(self, value: PassProgress) -> None:
        """Hand *value* to the view's pass banner, and to nothing else."""
        push = getattr(self._view, "set_pass_progress", None)
        if callable(push):
            push(value)

    @Slot(object)
    def _adoption_produced(self, lines: object) -> None:
        """Report per requirement, then re-read the board (SWR-3609)."""
        self._adoption_dismissed = True
        self._store.set_requirement_pass(adopting=False, progress=PassProgress())
        self._push_pass_progress(PassProgress())
        self._store.set_requirements(
            replace(self._store.requirements, adoption=None),
        )
        self._report(lines, title="Adoption finished")
        self.refresh()

    @Slot(object)
    def _verification_produced(self, lines: object) -> None:
        """Report per requirement, then re-read the board (SWR-3609, SWR-3615)."""
        self._store.set_requirement_pass(verifying=False, progress=PassProgress())
        self._push_pass_progress(PassProgress())
        self._report(lines, title="Verification finished")
        self.refresh()

    def _report(self, lines: object, *, title: str) -> None:
        """State what a pass did, one line per requirement it could not record."""
        stated = tuple(str(line) for line in lines) if isinstance(lines, tuple) else ()
        if not stated:
            return
        self._store.publish_notice(
            UiNotice(
                id=self._store.new_notice_id(),
                severity=NoticeSeverity.INFO,
                title=title,
                message=stated[0],
                details="\n".join(stated[1:]),
                persistent=True,
            ),
        )

    def _pass_thread_finished(self) -> None:
        thread = self._pass_thread
        self._pass_thread = None
        self._pass_worker = None
        if thread is not None:
            thread.deleteLater()

    def _actor_name(self) -> str:
        """Who the audit trail will name for this action (SWR-3610)."""
        import contextlib
        import getpass

        with contextlib.suppress(Exception):
            return getpass.getuser()
        return ""

    @traces(SWR.SWR_3316)
    def install_board(self) -> bool:
        """Attach the default board view. ``False`` when one already is.

        The missing call this requirement exists for (SWR-3316): ``attach_view``
        is an extension point, and an extension point with no default has no
        product behind it. Without this the area shows its own status surface
        forever, every push into the view is a ``getattr`` that finds nothing,
        and — because :meth:`_pane_missing` answers ``False`` for an area with
        no view — no pane can ever install either.

        The board and only the board. Every other surface this area owns stays
        built-on-first-use, which is the trade the review's own docstring
        states: a board somebody only reads must not pay for a review, a queue
        and an editor it never opens. Deferential in the same way as the panes:
        a caller that attached its own view keeps it.
        """
        if self._view is not None:
            return False
        from rotaris.views.requirements import RequirementsView

        # The workspace travels with the view because one board choice — which
        # columns are folded — belongs to the project rather than the person
        # (SWR-3321). It is the same resolved absolute path the desktop keys its
        # other per-workspace state on.
        self.attach_view(RequirementsView(workspace=self._store.workspace_path))
        return True

    @traces(SWR.SWR_3316, SWR.SWR_3605, SWR.SWR_3606)
    def install_editor(self) -> bool:
        """Attach the default editor surface (SWR-3605, SWR-3606).

        Both entry points land here: ``edit_requested`` opens the panel on a
        requirement, ``creation_requested`` opens it empty. Without it the
        board's ``Edit`` and ``New requirement`` controls are live and inert —
        the controller states the intent and nothing answers it.

        ``False`` when a pane is already registered under this key, or when the
        workspace keeps no requirement store Rotaris can write: an editor over
        a read-only project would offer a save that cannot happen (SWR-3602).
        """
        if not self._pane_missing(_EDITOR_PANE):
            return False
        editing = self.editing
        if editing is None:
            return False
        from rotaris.widgets.requirement_editor import (
            RequirementCreationForm,
            RequirementEditorPanel,
        )

        # Two surfaces, because they are two: editing one requirement's text and
        # creating one are different forms with different outcomes, and the
        # module keeps them apart (SWR-3605, SWR-3606).
        panel = RequirementEditorPanel()
        if not self.attach_pane(_EDITOR_PANE, panel):
            return False
        form = RequirementCreationForm()
        self.attach_pane(_CREATE_PANE, form)
        self._editor, self._creator = panel, form
        self.edit_requested.connect(self._open_editor)
        self.creation_requested.connect(self._open_creator)
        panel.edit_submitted.connect(self._apply_edit)
        form.form_changed.connect(self._preview_creation)
        form.creation_submitted.connect(self._apply_creation)
        form.cancelled.connect(self._show_board)
        return True

    def _open_editor(self, req_id: str) -> None:
        """Open the editor on *req_id*'s current text (SWR-3605)."""
        panel = self._editor
        detail = self.detail_for(req_id)
        if panel is None or detail is None:
            return
        panel.show_detail(detail)
        self._show_pane(_EDITOR_PANE)

    def _open_creator(self) -> None:
        """Open the creation form over the sources that accept one (SWR-3606)."""
        form, editing = self._creator, self.editing
        if form is None or editing is None:
            return
        form.set_sources(editing.creation_sources())
        self._show_pane(_CREATE_PANE)

    def _apply_edit(self, req_id: str, title: str, description: str) -> None:
        """Write the edit, report what came back, and re-read the board.

        Nothing here decides a delivery state (SWR-3605): the text is written,
        and whatever state follows from the changed source is the ordinary
        evaluation's answer (SWR-3502).

        The signal's three values are the panel's own, and the panel is the one
        that knows which version the form was opened on — so the write is taken
        from it rather than reassembled from the arguments.
        """
        del req_id, title, description
        panel, editing = self._editor, self.editing
        if panel is None or editing is None:
            return
        opened = panel.opened_on
        outcome = editing.apply(
            panel.current,
            title=opened.title,
            description=opened.description,
        )
        panel.report(outcome)
        if outcome.written:
            self.refresh()

    def _preview_creation(self, form: object) -> None:
        """Resolve where this form would land, before anything is written."""
        creator, editing = self._creator, self.editing
        if creator is None or editing is None:
            return
        from rotaris.services.requirement_editing import NewRequirement

        if isinstance(form, NewRequirement):
            creator.set_target(editing.preview(form))

    def _apply_creation(self, form: object) -> None:
        """Create the requirement the form names, and re-read the board."""
        creator, editing = self._creator, self.editing
        if creator is None or editing is None:
            return
        from rotaris.services.requirement_editing import NewRequirement

        if not isinstance(form, NewRequirement):
            return
        outcome = editing.create(form)
        creator.report(outcome)
        if outcome.written:
            self.refresh()

    def _show_board(self) -> None:
        show = getattr(self._view, "show_board", None)
        if callable(show):
            show()

    @traces(SWR.SWR_3316, SWR.SWR_3607)
    def install_blockers(self) -> bool:
        """Attach the default blocker surface (SWR-3607).

        The detail view carries an answer path of its own, so this is the richer
        surface rather than the only one — but the board's ``Blockers`` control
        raises :attr:`blocker_requested`, and without this nothing answers it.
        """
        if not self._pane_missing(_BLOCKERS_PANE):
            return False
        from rotaris.widgets.requirement_blockers import RequirementBlockerPanel

        panel = RequirementBlockerPanel()
        if not self.attach_pane(_BLOCKERS_PANE, panel):
            return False
        self._blockers = panel
        self.blocker_requested.connect(self._open_blockers_pane)
        panel.answered.connect(self.answer_blocker)
        return True

    def _open_blockers_pane(self, req_id: str) -> None:
        """Show what is blocking *req_id*, and where answering it resumes to."""
        panel = self._blockers
        card = self._store.requirements.card(req_id)
        detail = self.detail_for(req_id)
        if panel is None or card is None or detail is None:
            return
        panel.set_blockers(detail.blockers, resume_to=resume_column(card.blocked_from))
        self._show_pane(_BLOCKERS_PANE)

    def _show_pane(self, key: str) -> bool:
        show = getattr(self._view, "show_pane", None)
        return bool(show(key)) if callable(show) else False

    @traces(SWR.SWR_3315, SWR.SWR_3603, SWR.SWR_3317, SWR.SWR_3613)
    def install_review(self) -> bool:
        """Attach the default review surface. ``False`` when one already is.

        The area composes its own surfaces (SWR-3315): ``main_window.py`` never
        learns that a review exists, and a caller that attached its own —
        another composition, a test — keeps it, because the pane key is checked
        before anything is built.

        Two things the composition supplies that a projection cannot. The read
        happens **on a worker** (SWR-3317): even the per-requirement read
        re-opens the requirement and delivery stores, and on a store of a
        thousand requirements doing that inside the click was a visible stall.
        And the surface is given this workspace's **pending proposals**
        (SWR-3613), because what a run offered is Rotaris' own record rather
        than a fact the board projection carries.
        """
        if not self._pane_missing(_REVIEW_PANE):
            return False
        source = self._bridge.source
        if source is None:
            return False
        from rotaris.services.requirements_bridge import DetailSource
        from rotaris.views.requirement_review import (
            DeferredReviews,
            ProjectionReviews,
            attach_review,
        )

        # The per-requirement read, not the whole board: opening a review must
        # not start an evaluation pass (SWR-3312) — see ProjectionReviews' own
        # note. A source that cannot answer deeply falls back to the board read,
        # which is what it could always do — and which is now a read in fact and
        # not only in name: `project()` stopped evaluating when SWR-3519 split
        # the write off, so this fallback can no longer move a card behind a
        # user who only opened a review.
        deep = source if isinstance(source, DetailSource) else None
        self._reviews = DeferredReviews(
            ProjectionReviews(
                deep.project_detail if deep is not None else lambda _req_id: source.project(),
                proposals=self.pending_proposals,
            ),
            parent=self,
        )
        attach_review(self, reviews=self._reviews)
        return True

    @traces(SWR.SWR_3613)
    def pending_proposals(self, req_id: str) -> tuple[RequirementProposal, ...]:
        """The technical requirements *req_id*'s runs offered and nobody decided.

        Empty for a workspace with no write path: an offer that could not be
        accepted is one the review must not present (SWR-3602).
        """
        actions = self.actions
        port = actions.proposals if actions is not None else None
        return port.pending(req_id) if port is not None else ()

    @traces(SWR.SWR_3315, SWR.SWR_3608)
    def install_queue(self) -> bool:
        """Attach the default queue surface. ``False`` when one already is."""
        if not self._pane_missing(_QUEUE_PANE):
            return False
        from rotaris.views.requirement_queue import attach_queue

        attach_queue(self, self._store, workspace=self._workspace)
        return True

    def _pane_missing(self, key: str) -> bool:
        """Whether this area could hold *key* and does not yet.

        ``False`` for a view that reports no panes at all: a surface this
        controller cannot inspect is one it must not push a pane into.
        """
        view = self._view
        if view is None:
            return False
        panes = getattr(view, "panes", None)
        return key not in tuple(panes) if panes is not None else False

    @traces(SWR.SWR_3608)
    def control_queue(self, control: str, value: str = "") -> None:
        """Pass a queue control on to whatever owns the scheduler (SWR-3608).

        Deliberately not applied here. Concurrency, automatic scheduling and a
        stop are the scheduler's own state; a controller that changed them
        locally would show a queue the scheduler never agreed to, which is the
        second answer SWR-3311 exists to prevent.
        """
        self.queue_control_requested.emit(control, value)

    @traces(SWR.SWR_3608)
    def set_queue(self, queue: QueueState) -> None:
        """Publish the queue the scheduler decided, and show it (SWR-3608)."""
        self._store.set_requirements_queue(queue)
        push = getattr(self._view, "set_queue", None)
        if callable(push):
            push(queue)

    @traces(SWR.SWR_3602)
    def dismiss_feedback(self, req_id: str) -> None:
        """Drop the standing feedback for one requirement.

        The other half of "persists until dismissed or resolved" (SWR-3602):
        nothing expires on a timer, so there has to be a way to say "read".
        """
        state = self._store.requirements
        self._publish(
            state.pending,
            tuple(item for item in state.feedback if item.req_id != req_id),
        )

    # ── navigation into the surfaces that already own a run (SWR-3612) ────

    @traces(SWR.SWR_3612)
    def open_run(self, session_id: str) -> bool:
        """Focus a requirement run's session in the Workspace view.

        Not a transcript of its own: the Workspace view already owns transcripts,
        agent trees and run controls, and a second one here would diverge from it
        the first time either changed (SWR-3612). ``False`` when the run carries
        no session id — a run that never started has nothing to focus.
        """
        if not session_id:
            return False
        self._store.set_focused_session(session_id)
        self._store.set_active_view(WORKSPACE_VIEW)
        return True

    @traces(SWR.SWR_3316, SWR.SWR_3306, SWR.SWR_3310)
    def open_file(self, path: str, line: int = 0) -> bool:
        """Open a file a requirement points at — a traced source, a covering test.

        Every ring, graph node and detail row that names a file raises this, and
        until SWR-3316 nothing listened: the signal was declared on the view and
        connected nowhere, so a click on an evidence site did nothing at all.

        Rotaris keeps no file viewer of its own and the configuration names no
        editor command, so the file is handed to whatever the desktop opens it
        with — the same door ``views/provider_auth.py`` and ``views/settings.py``
        already use for a URL. The line is not jumped to, because promising a
        jump the handler will not make is worse than leaving the reader on the
        row that already names it.

        **Success is silent.** The window that opens is the answer, and the row
        the user clicked already carries the file and the line, so a banner
        saying so repeats what the screen shows — while taking the window's
        highest-priority slot, above whatever failure is standing in it. What
        SWR-3316 exists to prevent is a click that does nothing, and that case
        still speaks: it is published persistently, so it keeps a dismiss
        control and stays until it has been read, and the path rides in the
        copyable details where it can be pasted into a file manager rather than
        stretched across the banner.

        ``False`` when there is no path to open.
        """
        if not path:
            return False
        from pathlib import Path as _Path

        from PySide6.QtCore import QUrl
        from PySide6.QtGui import QDesktopServices

        resolved = _Path(path)
        if not resolved.is_absolute() and self._workspace is not None:
            resolved = self._workspace / resolved
        if QDesktopServices.openUrl(QUrl.fromLocalFile(str(resolved))):
            return True
        self._store.publish_notice(
            UiNotice(
                id=self._store.new_notice_id(),
                severity=NoticeSeverity.WARNING,
                title="Could not open this file",
                message=(
                    f"No application on this computer is set up to open {resolved.name}. "
                    "Copy the path below and open it in an editor of your own."
                ),
                details=f"{resolved}:{line}" if line else str(resolved),
                persistent=True,
            ),
        )
        return False

    @traces(SWR.SWR_3612)
    def open_commit(self, target: str) -> bool:
        """Show a requirement run's branch or commit in the Git view.

        *target* is whichever of the two the surface knows: the queue and the
        review row know the run's **branch**, the detail view knows its
        **commit**, and both mean "show me this run's work". The Git view already
        draws worktrees, branches and history, so this hands it the target and
        switches to it (SWR-3612) — nothing about a run's Git state is rebuilt
        beside the board.

        ``False`` when there is nothing to show: a run that produced no commit
        and got no branch of its own has no Git view to open.
        """
        if not target:
            return False
        self._store.set_git_focus(target)
        self._store.set_active_view(GIT_VIEW)
        return True

    # ── the three steps of one action ─────────────────────────────────────

    def _begin(self, pending: PendingAction) -> None:
        """Say what is happening, before the engine has answered (SWR-3601)."""
        state = self._store.requirements
        self._publish(
            (*(item for item in state.pending if item.req_id != pending.req_id), pending),
            tuple(item for item in state.feedback if item.req_id != pending.req_id),
        )

    def _finish(self, outcome: ActionOutcome) -> ActionOutcome:
        """Publish what came back, and re-read the board when something moved."""
        state = self._store.requirements
        self._publish(
            tuple(item for item in state.pending if item.req_id != outcome.req_id),
            (
                *(item for item in state.feedback if item.req_id != outcome.req_id),
                outcome.feedback(),
            ),
        )
        self.action_performed.emit(outcome)
        if outcome.accepted:
            # The delivery store moved under the board: the card's column, its
            # badges and its run row are all the projection's, so the honest way
            # to show the new state is to read it again (SWR-3311).
            self.refresh()
        return outcome

    def _refuse(self, req_id: str, action: str, reason: str) -> ActionOutcome:
        from rotaris.services.requirements_actions import ActionOutcome as Outcome

        return self._finish(
            Outcome(action=action, req_id=req_id, accepted=False, reason=reason),
        )

    @traces(SWR.SWR_3707)
    def _disclose_run_permissions(self, action: BoardAction, req_id: str) -> bool:
        """Say what a run this action starts is given. ``False`` if the user stopped.

        Asked of :attr:`BoardAction.starts_run` rather than of a list kept here:
        a second list would confirm a different set of gestures from the one that
        actually dispatches work (SWR-3311).

        Silent in three cases, and each is a different reason. There is nothing
        to disclose when the elevation is turned off — that run takes the
        workspace's own mode like any other. There is nobody to disclose it to
        once the user has said "not again", either for this launch or for good.
        And it is never raised for the releases the scheduler drains on its own
        (SWR-3510): the starter's queue lives in memory, so anything it drains
        was released by a gesture that came through here earlier in this launch.
        """
        if not action.starts_run:
            return True
        from rotaris.services.requirement_run_permissions import (
            full_permission_runs,
            notice_suppressed,
            suppress_notice,
        )

        if self._run_permissions_told or not full_permission_runs() or notice_suppressed():
            return True

        from rotaris.widgets.run_permission_dialog import (
            RunPermissionChoice,
            RunPermissionDialog,
        )

        dialog = RunPermissionDialog(req_id, self._surface)
        dialog.exec()
        choice = dialog.choice
        dialog.deleteLater()
        if choice is RunPermissionChoice.CANCEL:
            return False
        # Recorded *after* the answer, so a dialog the user cancelled leaves the
        # next release to ask again rather than starting quietly.
        self._run_permissions_told = True
        if choice is RunPermissionChoice.PROCEED_ALWAYS:
            suppress_notice()
        return True

    @traces(SWR.SWR_3707, SWR.SWR_3602)
    def _cancelled(
        self,
        action: str,
        req_id: str,
        *,
        source: str,
        target: str,
    ) -> ActionOutcome:
        """The user read what the run would be given and said no.

        Published as a refusal, which is the shape the board already knows how to
        undo: nothing was written, so the next paint puts the card back in the
        column it came from (SWR-3602). Worded as their own decision rather than
        as an error, because it is one.
        """
        from rotaris.services.requirements_actions import ActionOutcome as Outcome

        return self._finish(
            Outcome(
                action=action,
                req_id=req_id,
                accepted=False,
                source=source,
                target=target,
                reason="You stopped this release. Nothing was started and nothing moved.",
            ),
        )

    def _no_actions(self, req_id: str, source: str, target: str) -> ActionOutcome:
        from rotaris.services.requirements_actions import ActionOutcome as Outcome

        return self._finish(
            Outcome(
                action="",
                req_id=req_id,
                accepted=False,
                source=source,
                target=target,
                reason=(
                    "This workspace has no write path to its requirement store, "
                    "so the board can show requirements but not move them."
                ),
            ),
        )

    def _publish(
        self,
        pending: tuple[PendingAction, ...],
        feedback: tuple[ActionFeedback, ...],
    ) -> None:
        self._store.set_requirement_actions(pending, feedback)
        push = getattr(self._view, "set_actions", None)
        if callable(push):
            push(pending, feedback)

    @traces(SWR.SWR_3601, SWR.SWR_3602)
    def move_options_for(self, req_id: str) -> tuple[MoveOption, ...]:
        """Which columns *req_id* can be moved to, and why the others cannot.

        Computed here rather than in the view: reachability is the engine's
        transition matrix, and a board that kept its own copy of it would offer
        drops the engine refuses (SWR-3311, SWR-3602).
        """
        card = self._store.requirements.card(req_id)
        if card is None or card.is_epic:
            # An epic's state follows from its children and is never set
            # (SWR-3212, SWR-3308): it has no drop target at all.
            return ()
        return move_options(card.delivery, blocked_from=card.blocked_from)

    def _push_moves(self, state: RequirementsBoardState) -> None:
        push = getattr(self._view, "set_move_options", None)
        if not callable(push):
            return
        push({card.req_id: self.move_options_for(card.req_id) for card in state.cards})

    def shutdown(self) -> None:
        """Let in-flight reads finish before the window goes away."""
        for reader in (self._bridge, self._reviews):
            if reader is None:
                continue
            try:
                reader.shutdown()
            except RuntimeError:
                # The window was destroyed before the application quit and took
                # this reader's C++ object with it. No thread is left to wait for.
                continue

    # ── bridge → store ────────────────────────────────────────────────────

    def _evaluated(self, state: RequirementsBoardState, delta: BoardDelta) -> None:
        # The pass the pending events asked for has landed: close it, so the next
        # burst debounces from empty rather than replaying this one (SWR-3210).
        self._absorb_evaluation()
        if not state.cards:
            # Which source produced this nothing is a fact only this side knows —
            # the projection carries no workspace — and it is the difference
            # between "write some requirements" and "your mapping matched none"
            # (SWR-3120). Carried on the board so the view says it too.
            state = replace(state, empty_reason=self._empty_store_reason())
        blocked = self._no_commit_notice()
        if blocked is not None:
            state = replace(state, notice=blocked)
        state = self._with_attention(state)
        self._store.set_requirements(state, delta)
        published = self._store.requirements
        self._push_to_view(published, delta)
        # Which drops each card now accepts follows from its new delivery state,
        # so it is recomputed with the board rather than at drag time — the view
        # has no way to ask the matrix itself (SWR-3311, SWR-3601).
        self._push_moves(published)
        push_actions = getattr(self._view, "set_actions", None)
        if callable(push_actions):
            push_actions(published.pending, published.feedback)
        push_queue = getattr(self._view, "set_queue", None)
        if callable(push_queue):
            push_queue(published.queue)

    # ── a run waiting on a person (SWR-3623) ──────────────────────────────

    @traces(SWR.SWR_3623)
    def _waiting_runs(self) -> dict[str, RequirementAttention]:
        """Which requirements have a run blocked on this user, by requirement id.

        Joined from the session list rather than from the board, because the
        board cannot know it: whether a run is waiting is a fact about a live
        session, and the engine's projection is built from the requirement store.
        The join needs no lookup — a requirement-started session already carries
        the requirement and unit it belongs to (SWR-3612), and now says whether
        it is waiting (SWR-3623).

        First waiting run wins when a requirement has several units waiting at
        once. A card has room for one door, and any of them is the right one to
        open: answering it is what frees the requirement to make progress, and
        the next one will state itself as soon as this one is answered.
        """
        waiting: dict[str, RequirementAttention] = {}
        for session in self._store.sessions:
            if not session.awaiting_input or not session.requirement_id:
                continue
            waiting.setdefault(
                session.requirement_id,
                RequirementAttention(session_id=session.id, unit_id=session.unit_id),
            )
        return waiting

    @traces(SWR.SWR_3623)
    def _waiting_sessions(self) -> frozenset[str]:
        """Every session blocked on this user, requirement-started or not.

        The queue keys on the session rather than on the requirement because it
        lists *runs*: one requirement can have several units in flight and only
        one of them waiting, and marking the requirement's other rows would
        point the user at runs with nothing to answer.
        """
        return frozenset(
            session.id for session in self._store.sessions if session.awaiting_input and session.id
        )

    @traces(SWR.SWR_3623)
    def _with_attention(self, state: RequirementsBoardState) -> RequirementsBoardState:
        """*state* with its cards and its queue told what is waiting on the user.

        Applied on the way to the store rather than inside the bridge: the bridge
        turns the engine's projection into cards and holds nothing about live
        sessions, and giving it a second input would make "what the board shows"
        depend on two clocks it cannot see.

        The two surfaces key differently on purpose. A card names its
        requirement, so it takes the first waiting run of that requirement. A
        queue row names one *run*, so it keys on the session: a requirement with
        three units in flight and one of them waiting must not light up the other
        two, which have nothing to answer.

        Returns *state* unchanged when nothing is waiting and nothing says it is,
        which is the ordinary case — so an evaluation with nothing to say about
        attention costs no allocation and produces no delta the view has to diff.
        """
        waiting = self._waiting_runs()
        sessions = self._waiting_sessions()
        stated = any(card.attention is not None for card in state.cards) or any(
            run.awaiting_input for run in state.queue.running
        )
        if not waiting and not sessions and not stated:
            return state
        return replace(
            state,
            cards=tuple(replace(card, attention=waiting.get(card.req_id)) for card in state.cards),
            queue=replace(
                state.queue,
                running=tuple(
                    replace(run, awaiting_input=run.session_id in sessions)
                    for run in state.queue.running
                ),
            ),
        )

    @traces(SWR.SWR_3623, SWR.SWR_3307)
    def _with_detail_attention(self, detail: RequirementDetail) -> RequirementDetail:
        """*detail* told which of its runs is waiting on the user.

        The same overlay the cards get, applied at the same seam and for the
        same reason: the detail this is built from comes out of the engine's
        projection, which knows the requirement's runs but not whether one of
        them is blocked on a person right now. Returned unchanged when the
        answer already matches, so re-showing an unchanged detail allocates
        nothing.
        """
        attention = self._waiting_runs().get(detail.req_id)
        if attention == detail.attention:
            return detail
        return replace(detail, attention=attention)

    @traces(SWR.SWR_3623, SWR.SWR_3307)
    def _restate_detail(self) -> None:
        """Re-state the open detail page when the session list moves under it.

        Read back off the panel rather than re-fetched from the bridge: what is
        on screen may be the deep read (SWR-3313), and asking for the detail
        again would answer with the board's shallower one and silently drop the
        revision history the user is looking at.
        """
        panel = getattr(self._view, "detail_view", None)
        current = getattr(panel, "detail", None)
        if current is None:
            return
        updated = self._with_detail_attention(current)
        if updated is not current:
            self._show_detail(updated)

    @traces(SWR.SWR_3623)
    def _sessions_changed(self) -> None:
        """Re-state what is waiting when the session list moves under the board.

        The session list refreshes on its own schedule — a run starting, a run
        ending, the periodic sweep — and a card that learned it was waiting only
        at the next board evaluation would say so minutes late, or keep saying it
        after the user had already answered. This is the other half of
        :meth:`_with_attention`: one of them applies the fact, and the other
        notices it changed.

        Published only when the answer actually differs, because this fires far
        more often than the board changes.
        """
        # Before the board's own early return: a user reading one requirement's
        # detail page is exactly the user this has something to tell, and the
        # page is open whether or not the board behind it has cards.
        self._restate_detail()
        current = self._store.requirements
        if not current.cards and not current.queue.running:
            return
        updated = self._with_attention(current)
        if updated.cards == current.cards and updated.queue == current.queue:
            return
        self._store.set_requirements(updated)
        published = self._store.requirements
        self._push_to_view(published, None)
        # The queue is its own surface with its own setter, so a re-statement
        # that only moved a run's waiting flag reaches the board and nothing
        # else unless it is pushed here too (SWR-3608).
        push_queue = getattr(self._view, "set_queue", None)
        if callable(push_queue):
            push_queue(published.queue)

    @traces(SWR.SWR_3419, SWR.SWR_3601)
    def _no_commit_notice(self) -> UiNotice | None:
        """The standing notice for a checkout that has never committed, or ``None``.

        A run forks from a commit, so a workspace that has none can host no run at
        all — and until this existed the board said nothing about it. The user
        found out by dragging a card: the drop was refused, correctly, and every
        further drop was refused the same way, once per requirement, when the
        condition was never about a requirement in the first place. It is a fact
        about the workspace, so it is stated where the board states facts about
        the workspace, before anything is dragged.

        **Once per evaluation.** The board evaluates, and this is asked as part of
        that — one notice occupying the area's one notice slot, replaced in place
        by the next evaluation. That is also what clears it: the first evaluation
        after the first commit finds a base and returns ``None``, and the slot is
        empty again without anything having to remember to empty it.

        The sentence is
        :func:`~rotaris_core.requirements.execution.target.no_commit_refusal` —
        the same words the drop-time refusal raises, asked without a requirement
        id because nothing has been chosen yet. A second wording here would be a
        second answer to one question, and would drift from the refusal on the
        first edit to either.

        **Warning, not error.** Nothing has failed: the store reads, the board is
        complete, and every requirement on it is accurate — what is missing is a
        precondition for one action, named together with the two words that
        remove it. An error is what
        :meth:`_failed` raises, where the board on screen is no longer the
        repository's. Painting a project's first day in that colour would be the
        alarm this area already publishes too much of, and it would leave nothing
        louder to say when a board really has stopped following its workspace.

        A workspace that has been seen with a commit is never asked again. The
        question costs git, on the thread that repaints the board, and a checkout
        does not go back to having no commits — so the cost belongs to the first
        day of a project, which is the only day the answer is interesting.
        Anything else — no workspace, not a checkout, a git that would not answer
        — is silence here: none of those is "you have not committed yet", and the
        surfaces that own those failures already say so in their own words.

        Only the *committed* answer is remembered, and the asymmetry is
        deliberate. A directory that is not a checkout can become one while the
        board is open — ``git init`` in a project someone just opened is exactly
        the first day this notice exists for — and a remembered "not a checkout"
        would swallow the notice until the next restart. So that answer costs one
        ``git`` call per evaluation and keeps the notice honest, where the
        committed answer cannot change back and is asked once.
        """
        workspace = self._workspace
        if workspace is None or self._committed:
            return None
        from rotaris_core.requirements.execution.target import (
            TargetBranchError,
            no_commit_refusal,
            target_branch_for,
        )

        from rotaris.services.git_service import GIT_SETUP_ACTION, GitService

        unversioned = False
        try:
            target_branch_for(workspace)
        except TargetBranchError as exc:
            unversioned = not exc.no_commit
            if unversioned and not GitService(workspace, self._store).can_prepare():
                # No git on the machine, or a declared branch that is missing:
                # neither is answered by the offer below, and both are already
                # said by the surfaces that own them.
                return None
        except Exception:  # noqa: BLE001 — a check that broke must not stop the board
            logging.getLogger(__name__).exception(
                "could not tell whether %s has a commit to base runs on",
                workspace,
            )
            return None
        else:
            self._committed = True
            return None
        return UiNotice(
            id=NO_COMMIT_NOTICE,
            severity=NoticeSeverity.WARNING,
            title="Nothing can run here yet",
            message=(_UNVERSIONED_MESSAGE if unversioned else no_commit_refusal(workspace))
            + _SETUP_OFFER,
            persistent=True,
            action_label=_SETUP_ACTION_LABEL,
            action_id=GIT_SETUP_ACTION,
        )

    @traces(SWR.SWR_3419, SWR.SWR_3315)
    def _recheck_base(self) -> None:
        """Ask again whether a run could start here, because Git just moved.

        A workspace gains its first commit exactly once, and when it does the
        board is holding a notice that is now false and refusing releases that
        are now legal. Nothing else would clear either until the next evaluation
        the user happened to trigger.

        Cheap by construction: :attr:`_committed` latches once the answer is yes,
        so this costs one ``git`` call per Git refresh only on the days the answer
        is still no, and nothing at all afterwards.
        """
        if self._committed or self._workspace is None:
            return
        if self._no_commit_notice() is not None:
            return
        # The answer turned. Clear the stale notice and re-read the board, so the
        # cards that were refused become droppable without the user asking twice.
        # The notice is the *board's*, not the window's: it was published onto
        # `RequirementsBoardState.notice` and clearing the window's slot instead
        # left "Nothing can run here yet" standing over a workspace that had just
        # committed, until some later evaluation happened to replace it.
        self._dismiss_notice(NO_COMMIT_NOTICE)
        self.analyse()

    @traces(SWR.SWR_2005, SWR.SWR_3419, SWR.SWR_3315)
    def prepare_repository(self) -> None:
        """Take the offer :meth:`_no_commit_notice` carries, and say what it did.

        The offer states what it will do before it is pressed, so what is left
        here is to run it and report which of the two things happened: a first
        commit is a change to the user's project, and a refusal means the
        precondition they were told about still stands. Both are worth seeing,
        and pressing a button that answers with neither is what this area used to
        do — the action id reached the banner and stopped there (SWR-3315).

        The outcome is published to the *window's* notice slot rather than the
        board's, because the board's is about to be rewritten: setting Git up
        refreshes the repository, which re-evaluates the board and replaces
        whatever notice was standing on it. A report the user has not read yet
        must not be swept away by the evaluation its own action started.

        A workspace-less area — the demo store — has nothing to prepare, and the
        offer is never made there.
        """
        workspace = self._workspace
        if workspace is None:  # pragma: no cover - a demo store has no workspace
            return
        from rotaris.services.git_service import GitService

        try:
            done = GitService(workspace, self._store).prepare_repository()
        except RuntimeError as exc:
            # The offer stays on the board: git's refusals here are things the
            # user can fix (an identity it does not have yet), and the way back
            # is the same button.
            self._store.publish_notice(
                UiNotice(
                    id=self._store.new_notice_id(),
                    severity=NoticeSeverity.ERROR,
                    title="Could not set up Git here",
                    message=str(exc),
                    persistent=True,
                ),
            )
            return
        self._store.publish_notice(
            UiNotice(
                id=self._store.new_notice_id(),
                severity=NoticeSeverity.SUCCESS,
                title="This project is ready to run",
                message=done,
            ),
        )

    @traces(SWR.SWR_3312)
    def _failed(self, message: str) -> None:
        """Keep the last good board and say what happened, until it is fixed.

        Persistent and actionable (SWR-3312): a toast that expires would leave a
        board that silently stopped following the repository, which is exactly
        the state the requirement forbids.
        """
        notice = UiNotice(
            id=self._store.new_notice_id(),
            severity=NoticeSeverity.ERROR,
            title="Requirements could not be evaluated",
            message="The board below is the last one Rotaris was able to read.",
            details=message,
            persistent=True,
            action_label="Retry",
            action_id=REFRESH_ACTION,
        )
        self._store.set_requirements(replace(self._store.requirements, notice=notice))

    @traces(SWR.SWR_3311, SWR.SWR_3120)
    def _unavailable(self, reason: str, outcome: object = None) -> None:
        """No projection can be produced — state it, and show no board at all.

        Never a locally derived stand-in (SWR-3311): with no projection there is
        no second place to get one from, and an empty board would read as "this
        project has no requirements".

        *outcome* is the discovery run behind the refusal (SWR-3120). Carried
        onto the state so the area can offer the mapping rather than only
        printing it — the difference between a user who can act and one who has
        to hand-write a configuration file from a paragraph.
        """
        self._store.set_requirements(
            RequirementsBoardState(
                available=False,
                unavailable_reason=reason,
                source_offer=_source_offer(outcome),
            ),
        )

    def _busy_changed(self, busy: bool) -> None:
        current = self._store.requirements
        if busy == current.loading:
            return
        self._store.set_requirements(replace(current, loading=busy))

    def _analysing_changed(self, analysing: bool) -> None:
        """Mirror the expensive pass into the board's own state (SWR-3319).

        The sentence and the control it moves are both the area's own, so the
        store change reaches them through :meth:`_render` and the board is not
        repainted for a state no card carries.
        """
        current = self._store.requirements
        if analysing == current.analysing:
            return
        self._store.set_requirements(replace(current, analysing=analysing))

    # ── store → surface ───────────────────────────────────────────────────

    def _board_changed(self, delta: object) -> None:
        del delta  # the surface shows the board's meta; cards are the view's
        self._render()

    def _active_view_changed(self) -> None:
        if self._store.ui.active_view != _VIEW_ID:
            return
        # Installing is idempotent and cheap once done, so it happens on every
        # entry rather than only the first: a workspace that gained a writable
        # requirement source after the first visit gets its editor (SWR-3316).
        self.install_board()
        if self._requested:
            return
        self.refresh()

    @traces(SWR.SWR_3312, SWR.SWR_3210)
    def _repository_moved(self) -> None:
        """A commit landed: submit it, and let the evaluator decide when to look.

        Still guarded on "a board nobody has opened must not start reading the
        repository". What changed is the *second* guard: this used to drop the
        event whenever a pass was in flight, which is exactly the case a rebase
        produces — a storm of git notifications, one pass started on the first,
        and every event after it lost. The board then showed the repository as it
        was when the storm began.

        The evaluator coalesces instead (SWR-3210): a burst becomes one pass, and
        an event that arrives during a pass is held rather than discarded.
        """
        if not self._store.requirements.available:
            return
        self.submit_evaluation("commit", "the repository moved")

    @traces(SWR.SWR_3210)
    def submit_evaluation(self, trigger: str, detail: str) -> bool:
        """Record a repository event and arm the debounce window.

        ``False`` when this workspace has switched the trigger off (SWR-3117) or
        when the submission came from inside a running pass — the re-entrancy the
        evaluator refuses structurally, because a pass that schedules its own
        successor does not terminate.

        *trigger* is the configuration's own spelling (``commit``,
        ``branch-switch``, …) rather than the enum, so this seam costs no engine
        import at the call site (SWR-3311's lazy-startup discipline).
        """
        from rotaris_core.requirements.delivery.evaluation import (
            EvaluationEvent,
            EvaluationReentryError,
            EvaluationTrigger,
        )

        evaluator = self._evaluation()
        if evaluator is None:
            return False
        try:
            accepted = evaluator.submit(
                EvaluationEvent(
                    trigger=EvaluationTrigger(trigger),
                    at=self._clock(),
                    detail=detail,
                ),
            )
        except EvaluationReentryError:
            _log.warning("Ignoring %s submitted from inside an evaluation", trigger)
            return False
        if accepted:
            self._arm_evaluation()
        return accepted

    def _arm_evaluation(self) -> None:
        """Wake this controller when the pending burst becomes due."""
        evaluator = self._evaluation()
        due_at = evaluator.next_due_at() if evaluator is not None else None
        if due_at is None:
            return
        delay = max(0.0, (due_at - self._clock()).total_seconds())
        self._evaluation_timer.start(int(delay * 1000))

    @traces(SWR.SWR_3210)
    def _evaluation_due(self) -> None:
        """The debounce window closed: run one pass for the whole burst.

        A pass already in flight re-arms rather than stacking — the events stay
        pending and the next window closes on them, which is what turns "an
        evaluation is running" from a reason to lose an event into a reason to
        wait.
        """
        if self._bridge.busy:
            self._evaluation_timer.start(_EVALUATION_RETRY_MS)
            return
        # The one refresh that is allowed to reach a model without being asked
        # (SWR-3319). SWR-3210 declares these events — a commit, a merge, a
        # branch switch, a finished run — as the moments evaluation re-runs, so
        # they are also the declared moments to judge what changed. It says so
        # while it does it, and it can be stopped.
        self.refresh(RefreshKind.ANALYSE)

    def _absorb_evaluation(self) -> None:
        """Close the pass the board just finished.

        The events that asked for this pass are cleared here rather than when it
        started, which is what makes an event arriving *during* a pass count for
        the next one instead of being answered by a read that had already begun.

        Runs on the Qt thread and reads nothing — the repository read happened on
        the bridge's worker, and this is bookkeeping over its result.
        """
        evaluator = self._evaluation()
        if evaluator is None or not evaluator.pending:
            return
        outcome = evaluator.run(self._clock())
        if outcome is not None:
            _log.debug(
                "Requirement evaluation answered %s",
                ", ".join(str(trigger) for trigger in outcome.request.triggers),
            )

    def _evaluation(self) -> RequirementEvaluator | None:
        """This workspace's evaluator, built once (SWR-3210, SWR-3117).

        Built on first use rather than in the constructor, because resolving the
        policy reads the workspace's configuration and no window constructor may
        pay for a file read.

        **What this evaluator is for here is the trigger policy** — which events
        count (SWR-3117), how long a burst is coalesced, and the refusal to let a
        pass schedule its own successor. Its ``evaluate`` returns nothing on
        purpose: SWR-3210's "publish what changed" is already answered by the
        board delta the bridge produces (SWR-3312), and computing a second
        changed set here would be two answers to one question — the exact thing
        the projection contract exists to prevent. The pass itself is
        :meth:`refresh`, on the bridge's worker thread, which is what "never on
        the UI thread" is about.
        """
        from rotaris_core.requirements.delivery.evaluation import (
            EvaluationTrigger,
            RequirementEvaluator,
        )

        from rotaris.views.requirement_queue import load_evaluation_policy

        if self._evaluator is None and self._workspace is not None:
            debounce_ms, triggers = load_evaluation_policy(self._workspace)
            self._evaluator = RequirementEvaluator(
                lambda _request: {},
                debounce_ms=debounce_ms,
                # A token this build does not know is dropped rather than
                # refused: a workspace configured by a newer Rotaris still gets
                # the triggers this one understands (SWR-3117).
                triggers=[
                    EvaluationTrigger(token)
                    for token in triggers
                    if token in set(EvaluationTrigger)
                ],
            )
        return self._evaluator

    def _action(self, action_id: str) -> None:
        """Run the action the area's own notice or placeholder raised.

        Every id this area *puts on a button* has to arrive here, including the
        ones whose work is not the board's. The offer to set Git up was dispatched
        by the window, on the assumption that its notice stood on the window's
        banner; it stands on this one, so pressing it did nothing at all — a
        labelled control that answers with silence, which is worse than the
        precondition it was offered for. The unknown id is logged rather than
        ignored, so the next one is found by whoever added it.
        """
        from rotaris.services.git_service import GIT_SETUP_ACTION

        if action_id == REFRESH_ACTION:
            self.refresh()
        elif action_id == ADOPT_SOURCE_ACTION:
            self.adopt_source()
        elif action_id == GIT_SETUP_ACTION:
            self.prepare_repository()
        else:
            _log.warning("no handler for requirements action %r", action_id)

    def _push_to_view(self, state: RequirementsBoardState, delta: BoardDelta | None) -> None:
        """Hand the board to the attached view, if it takes one.

        *delta* is ``None`` for a push that changed the board's *meta* rather
        than its cards — the adoption offer appearing or going away (SWR-3614) —
        which the view answers with a full repaint rather than a card-by-card
        update, exactly as it does for a projection it cannot diff.
        """
        set_board = getattr(self._view, "set_board", None)
        if callable(set_board):
            set_board(state, delta)

    # ── the surface ───────────────────────────────────────────────────────

    def _build_surface(self) -> QWidget:
        surface = QWidget()
        surface.setObjectName("requirementsView")
        surface.setAccessibleName("Requirements")
        surface.setAccessibleDescription(
            "Requirement board: delivery state, traceability and execution per requirement.",
        )
        root = QVBoxLayout(surface)
        root.setContentsMargins(18, 16, 18, 16)
        root.setSpacing(12)

        header = QHBoxLayout()
        header.setSpacing(10)
        title = QLabel("Requirements")
        title.setStyleSheet("font-size:15px;font-weight:600;")
        header.addWidget(title)
        self._status = QLabel()
        self._status.setObjectName("muted")
        self._status.setAccessibleName("Requirements evaluation status")
        self._status.setWordWrap(True)
        # The line is rich text so the counted problems can be a link rather
        # than a number (SWR-3312). Both interaction flags, because a route only
        # a pointer can take is one half the users cannot take; setting them is
        # also what puts the link in the tab order.
        self._status.setTextFormat(Qt.TextFormat.RichText)
        self._status.setTextInteractionFlags(
            Qt.TextInteractionFlag.LinksAccessibleByMouse
            | Qt.TextInteractionFlag.LinksAccessibleByKeyboard,
        )
        self._status.linkActivated.connect(self._status_link)
        header.addWidget(self._status, 1)
        from rotaris.views.requirements import REEVALUATE_TOOLTIP

        # Here rather than in the board's own header (SWR-3319). The status
        # sentence beside it is where "3 awaiting analysis" and "Analysing
        # changes…" are said, so the control that acts on both belongs next to
        # them — and the board's header already carries six controls, which at
        # the supported minimum of 1000×680 is what it has room for.
        self._analyse_button = make_button("Analyse changes", "ghost")
        self._analyse_button.setAccessibleName("Analyse changed requirements")
        self._analyse_button.setToolTip(ANALYSE_TOOLTIP)
        self._analyse_button.clicked.connect(self._analysis_clicked)
        self._analyse_button.setVisible(False)
        header.addWidget(self._analyse_button, 0, Qt.AlignmentFlag.AlignRight)
        self._refresh_button = make_button("Refresh requirements", "secondary")
        self._refresh_button.setAccessibleName("Refresh requirements")
        # The only control that starts this pass, carrying the sentence the board
        # defines for it (SWR-3319). There were two: the board's toolbar held a
        # second one labelled "Re-evaluate", same slot and same result, and the
        # pair described the work differently — this one promised "Re-evaluate
        # every requirement" while that one promised it ran nothing, both untrue
        # in opposite directions. The duplicate is gone; the sentence stays where
        # the board writes it, so this button cannot drift from what a refresh
        # actually does to the columns.
        self._refresh_button.setToolTip(REEVALUATE_TOOLTIP)
        header.addWidget(self._refresh_button, 0, Qt.AlignmentFlag.AlignRight)
        #: Kept so a test can ask this row what it needs. The area as a whole is
        #: the wrong thing to measure — its minimum is dominated by the board
        #: below, whose width is a different question from whether the controls
        #: beside the status sentence fit (SWR-3314).
        self._header = header
        root.addLayout(header)

        self._banner = InlineBanner()
        # The banner keeps its action button alive between notices and names it
        # from the notice's own label, so a banner that has never carried one has
        # a nameless control on it. The accessibility sweep walks controls rather
        # than visible controls (SWR-2032, SWR-3314), and the fallback is the only
        # action this area's notices ever raise.
        self._banner.action_button.setAccessibleName(_RETRY_LABEL)
        root.addWidget(self._banner)

        self._body = QVBoxLayout()
        self._body.setContentsMargins(0, 0, 0, 0)
        self._body.setSpacing(10)
        self._placeholder = EmptyState(
            "Requirements have not been read yet",
            "Rotaris reads this workspace's requirement store when you open this view.",
            action_label="Read requirements",
            action_id=REFRESH_ACTION,
        )
        self._body.addWidget(self._placeholder)
        root.addLayout(self._body, 1)
        return surface

    def _render(self) -> None:
        """Show the area's own state: status, notice, and what to do next."""
        state = self._store.requirements
        self._banner.show_notice(state.notice)
        notice = state.notice
        self._banner.action_button.setAccessibleName(
            (notice.action_label if notice is not None else "") or _RETRY_LABEL,
        )
        self._refresh_button.setEnabled(not state.loading)
        self._render_analysing(state)
        sentence = self._status_text(state)
        markup = self._status_markup(sentence, state)
        self._status.setText(markup)
        # The count in the sentence is only a count; the sentences behind it are
        # attached here so hovering or reading the line out loud reaches them —
        # and where the count is drawn as a route, the tooltip says where it goes.
        detail = self._notice_detail(state)
        self._status.setToolTip(
            f"{detail}\n\nSelect the count to open these, act on them or dismiss them."
            if detail and STORE_NOTICES_HREF in markup
            else detail,
        )
        self._status.setAccessibleDescription(
            f"{sentence}\n{detail}" if detail else sentence,
        )
        title, description, action, action_id = self._placeholder_text(state)
        self._placeholder.configure(
            title,
            description,
            action_label=action,
            action_id=action_id,
        )
        self._placeholder.setVisible(self._view is None or not state.available)
        if self._view is not None:
            self._view.setVisible(state.available)

    @traces(SWR.SWR_3319)
    def _render_analysing(self, state: RequirementsBoardState) -> None:
        """Offer the judgement, say why it cannot be had, or offer the stop.

        Three facts, one control, and all three were invisible before. *Work is
        owed*: a cheap refresh leaves requirements it moved but did not judge, and
        unnamed those cards look like cards with nothing to do. *Asking would not
        help*: a workspace can switch the analysis off (SWR-3117), and the offer
        then has to become an explanation rather than a greyed control with no
        reason. *It is running*: the pass that can take minutes says so, and the
        control that started it is the control that stops it — a stop is only ever
        reachable for the pass this button began, so a second button would sit
        disabled for the whole life of the board to be pressable for a few minutes
        of it.

        The count rides on the label because the number is the reason to press:
        "Analyse changes (3)" is a sentence, and a bare label beside three
        unjudged cards is a guess.
        """
        owed = len(state.unanalysed)
        if state.analysing:
            self._analyse_button.setVisible(True)
            self._analyse_button.setText(STOP_ANALYSING)
            self._analyse_button.setEnabled(True)
            self._analyse_button.setToolTip(STOP_ANALYSING_TOOLTIP)
            self._analyse_button.setAccessibleName("Stop analysing changes")
            return
        self._analyse_button.setVisible(bool(owed))
        self._analyse_button.setText(f"Analyse changes ({owed})" if owed else "Analyse changes")
        self._analyse_button.setEnabled(bool(owed) and state.analysis_enabled and not state.loading)
        self._analyse_button.setToolTip(
            ANALYSE_TOOLTIP if state.analysis_enabled else ANALYSE_OFF_TOOLTIP,
        )
        self._analyse_button.setAccessibleName("Analyse changed requirements")

    def _analysis_clicked(self) -> None:
        """Start the judgement, or stop the one running — the same control."""
        if self._store.requirements.analysing:
            self.cancel_analysis()
            return
        self.analyse()

    @traces(SWR.SWR_3312, SWR.SWR_3319, SWR.SWR_3304)
    def _status_text(self, state: RequirementsBoardState) -> str:
        """When the board was last evaluated, and how much it holds (SWR-3312).

        The analysing sentence comes first and is its own, not a longer spelling
        of ``loading`` (SWR-3319): every refresh loads, and only this one waits
        on a provider. One word for both is what let a wait of minutes look like
        a read of three files, with nothing on screen to tell them apart.

        The age carries the moment behind it (SWR-3304). "Evaluated just now" is
        true for the first minute and then keeps being read long after it stopped
        meaning anything precise, and it is the one rendering that cannot be
        compared with a commit, a CI run or the clock on the wall — so this line
        prints both, using the same :func:`describe_moment` the cards offer, and
        prints only one where the two would say the same thing (a timestamp with
        no timezone has no relative form to round off).
        """
        if state.progress.active:
            # A pass says where it is before anything else the header could
            # say: it is the longest wait this area has, and the same value the
            # board's banner is drawing (SWR-3320).
            return state.progress.summary
        if state.analysing:
            return "Analysing changes — this may take minutes"
        if state.loading:
            return "Evaluating requirements…"
        if not state.available:
            return "Not evaluated yet"
        age = describe_age(state.evaluated_at, self._clock())
        moment = describe_moment(state.evaluated_at)
        stamp = f"{age} ({moment})" if age and moment and moment != age else age or moment
        when = f"Evaluated {stamp}" if stamp else "Evaluated"
        degraded = f" · {_problem_count(state)}" if state.notices else ""
        awaiting = f" · {len(state.unanalysed)} awaiting analysis" if state.unanalysed else ""
        return f"{when} · {counted(len(state.cards), 'requirement')}{degraded}{awaiting}"

    @traces(SWR.SWR_3312)
    def _status_markup(self, sentence: str, state: RequirementsBoardState) -> str:
        """The status sentence, with its counted problems drawn as the route they are.

        A count of problems is the one part of this line that stands for
        something the user can open, and until this existed nothing said so: the
        sentences behind the number were reachable by hovering, which is a
        pointer-only affordance and no affordance at all to an eye scanning the
        header. Wrapping exactly the counted phrase — and nothing else on the
        line — is what keeps the rest of it what it is, a reading.

        The phrase is rebuilt from the same helper the sentence used, so the two
        cannot drift into a link that covers half the words; a sentence that does
        not contain it is returned as plain escaped text rather than guessed at.
        """
        if not state.notices:
            return html.escape(sentence)
        phrase = _problem_count(state)
        before, marker, after = sentence.partition(phrase)
        if not marker:
            return html.escape(sentence)
        link = (
            f'<a href="{STORE_NOTICES_HREF}" style="color:{tokens().color.accent[300]};">'
            f"{html.escape(phrase)}</a>"
        )
        return f"{html.escape(before)}{link}{html.escape(after)}"

    @traces(SWR.SWR_3312)
    def _status_link(self, href: str) -> None:
        """Answer the one link the status line carries."""
        if href == STORE_NOTICES_HREF:
            self.open_store_notices()

    @traces(SWR.SWR_3312)
    def open_store_notices(self) -> bool:
        """Put the counted problems where they can be read, answered and dismissed.

        The status line could only ever carry the number. What the number stood
        for — the projection's own sentences about the parts of the store it
        could not read — had no route out of a tooltip: nothing could be acted
        on, nothing could be dismissed, and a user who read "5 problems with this
        store" was told a fact they could do nothing with.

        So the count opens them into the area's notice slot, which is the
        mechanism this application already has for exactly this shape of thing:
        a title, the sentences in copyable details, an action that re-reads the
        store once the files are fixed, and — because it is persistent — a
        dismiss control for a reader who has read it. Nothing new is invented for
        it and nothing here judges the notices; they are the projection's words,
        passed through the way :meth:`_notice_detail` passes them.

        It takes the one notice slot, deliberately. A report the user asked for
        is what should be standing in it while they read it, and the notices it
        displaces are restated by the next evaluation — that is how the
        no-commit notice already works. ``False`` when there is nothing to open.
        """
        state = self._store.requirements
        if not state.notices:
            return False
        shown = state.notices[:_ADOPTION_REPORT_LIMIT]
        lines = [f"• {line}" for line in shown]
        remaining = len(state.notices) - len(shown)
        if remaining:
            lines.append(f"• and {counted(remaining, 'more problem')}")
        self._store.set_requirements(
            replace(
                state,
                notice=UiNotice(
                    id=STORE_NOTICES_NOTICE,
                    severity=NoticeSeverity.WARNING,
                    title=_problem_count(state),
                    message=(
                        "The board below is everything Rotaris could read. "
                        "These are the parts it could not."
                    ),
                    details="\n".join(lines),
                    persistent=True,
                    action_label=_STORE_NOTICES_ACTION_LABEL,
                    action_id=REFRESH_ACTION,
                ),
            ),
        )
        return True

    @traces(SWR.SWR_3312)
    def _dismiss_notice(self, notice_id: str) -> None:
        """Clear the area's standing notice when its own Dismiss is pressed.

        The banner asks; it does not decide. Until this was connected the control
        was drawn for every persistent notice this area publishes and answered by
        nobody, so "Dismiss" was a button that did nothing — the dead affordance
        the requirement forbids elsewhere on the same screen.

        A notice that is no longer the one on screen is left alone: the press
        belongs to what the user was looking at, and a race with an evaluation
        that replaced it must not throw away the newer sentence.
        """
        current = self._store.requirements.notice
        if current is None or (notice_id and current.id != notice_id):
            return
        self._store.set_requirements(replace(self._store.requirements, notice=None))

    @traces(SWR.SWR_3312)
    def _notice_detail(self, state: RequirementsBoardState) -> str:
        """What the counted problems actually say, or "" when there are none.

        The status line can only carry a number, and a number nobody can open is
        a report of something the user is never told. These are the projection's
        own sentences about what it could not read (SWR-3312), so they are
        passed through unchanged rather than summarised into a second verdict,
        and they hang off the same line that counts them — as its tooltip and as
        the description a screen reader announces with it.
        """
        return "\n".join(f"• {line}" for line in state.notices)

    @traces(SWR.SWR_3120)
    def _placeholder_text(self, state: RequirementsBoardState) -> tuple[str, str, str, str]:
        """Title, description, action label and action id for an area with no board.

        SWR-3120 asks for three states where this had two. "Rotaris found no
        requirements" and "Rotaris could not read the requirements it found" are
        different facts about a project, and only one of them is the user's to
        fix by writing requirements; collapsing them is what told a project with
        sixty-two of them that it had none.
        """
        offer = state.source_offer
        if not state.available:
            if offer is not None and offer.worth_offering:
                return (
                    offer.title,
                    f"{offer.summary}\n\nNothing has been written yet.",
                    _ADOPT_SOURCE_LABEL,
                    ADOPT_SOURCE_ACTION,
                )
            if offer is not None:
                # Requirement-shaped documents are here and no mapping described
                # them. Naming what was found is the difference between a user
                # who can correct a glob and one who is told "unavailable".
                return (
                    "Requirements are here but Rotaris cannot read them",
                    offer.summary or state.unavailable_reason,
                    "Read requirements",
                    REFRESH_ACTION,
                )
            return (
                "Requirements are unavailable",
                state.unavailable_reason
                or "Rotaris has not read a requirement store for this workspace yet.",
                "Read requirements",
                REFRESH_ACTION,
            )
        if state.empty:
            return (
                "No requirements found",
                self._empty_store_reason(),
                "Re-read requirements",
                REFRESH_ACTION,
            )
        columns = ", ".join(
            f"{column.label} {column.count}" for column in state.columns if column.count
        )
        return (
            f"{counted(len(state.cards), 'requirement')} evaluated",
            columns or "Every requirement is in one column.",
            "Re-read requirements",
            REFRESH_ACTION,
        )

    @traces(SWR.SWR_3120)
    def _empty_store_reason(self) -> str:
        """Why a board that loaded carries nothing — named against its source.

        A **configured** source that reads nothing is a fact about the
        configuration the user accepted, and it is reported as itself: SWR-3106
        makes a persisted mapping the end of discovery for that workspace, so
        nothing here re-proposes one that would then compete with it on every
        start (SWR-3120).
        """
        from rotaris.services.requirements_actions import requirement_source_path

        workspace = self._workspace
        if workspace is not None and requirement_source_path(workspace).is_file():
            configured = requirement_source_path(workspace)
            return (
                f"The requirement source configured in {configured.name} is readable and"
                " matched no requirement. Check its glob and field mappings, or remove it"
                " to let Rotaris propose a mapping again."
            )
        return "This workspace's requirement store is readable but declares no requirement."


@traces(SWR.SWR_3312)
def _problem_count(state: RequirementsBoardState) -> str:
    """``2 problems with this store`` — counted once, for the line and the report.

    The status line prints it, the link is drawn over exactly it, and the opened
    report is titled with it. One spelling, so a reader who follows the count
    lands on a notice that agrees with the words they clicked.
    """
    return f"{counted(len(state.notices), 'problem')} with this store"


@traces(SWR.SWR_3120, SWR.SWR_3106)
def _source_offer(outcome: object) -> SourceProposalOffer | None:
    """*outcome* as the value the area renders and can act on.

    ``None`` for a workspace with nothing to propose for — no discovery ran, or
    it surveyed a tree holding nothing requirement-shaped. That is a state of
    its own and not a failed proposal: "there is nothing here" and "there is
    something here we could not describe" get different sentences (SWR-3120).
    """
    if outcome is None:
        return None
    proposal = getattr(outcome, "proposal", None)
    validation = getattr(outcome, "validation", None)
    survey = getattr(outcome, "survey", None)
    if proposal is None and not getattr(survey, "candidates", ()):
        return None
    config = getattr(proposal, "config", None)
    return SourceProposalOffer(
        summary=outcome.summary() if hasattr(outcome, "summary") else "",
        config_document=json.dumps(config.as_document(), indent=2, sort_keys=True)
        if config is not None
        else "",
        requirement_count=len(getattr(validation, "requirement_ids", ()) or ()),
        acceptable=bool(getattr(outcome, "is_acceptable", False)),
        outcome=outcome,
    )


@traces(SWR.SWR_3120, SWR.SWR_3106)
class _SourceAdoptionWorker(QObject):
    """Persists an accepted requirement-source mapping, off the Qt thread.

    Small work — one validated configuration written to one file — on a worker
    anyway, because :func:`accept_proposal` re-checks the proposal by loading it
    and that read walks the project's whole requirement tree.
    """

    produced = Signal(object)
    finished = Signal()

    def __init__(self, workspace: Path, outcome: object) -> None:
        super().__init__()
        self._workspace = workspace
        self._outcome = outcome

    @Slot()
    def run(self) -> None:
        """Adopt, and hand back the one sentence describing what happened."""
        from rotaris_core.requirements.sources.discovery import (
            DiscoveryOutcome,
            JsonProposalStore,
            accept_proposal,
        )

        from rotaris.services.requirements_actions import requirement_source_path

        lines: tuple[str, ...] = ()
        try:
            if not isinstance(self._outcome, DiscoveryOutcome):
                raise TypeError(  # noqa: TRY301 — reported below like any other refusal
                    "the board offered no discovery outcome to adopt",
                )
            path = requirement_source_path(self._workspace)
            config = accept_proposal(self._outcome, JsonProposalStore(path))
            lines = (
                f"Rotaris now reads this workspace's requirements through {path.name}"
                f" ({config.glob}).",
            )
        except Exception as exc:  # noqa: BLE001 — a refused proposal is reported, never raised
            _log.warning("Requirement source could not be adopted", exc_info=True)
            lines = (f"The proposed requirement source was not adopted: {exc}",)
        finally:
            self.produced.emit(lines)
            self.finished.emit()


@traces(SWR.SWR_3614, SWR.SWR_3217)
class _AdoptionWorker(QObject):
    """Runs one adoption pass off the Qt thread.

    Owns nothing but the workspace path and the actor's name: everything it
    needs is opened inside :meth:`run`, on the worker's own thread, because a
    store opened on the Qt thread and used on this one is the race that makes a
    board occasionally show a requirement twice.

    Reports its phases as it walks them (SWR-3320): the signal is queued across
    the thread boundary by Qt, and the value it carries is an immutable board
    value, so nothing here touches a widget.
    """

    produced = Signal(object)
    #: A :class:`PassProgress`, throttled by the relay that builds it.
    progress = Signal(object)
    finished = Signal()

    def __init__(self, workspace: Path, actor_name: str) -> None:
        super().__init__()
        self._workspace = workspace
        self._actor_name = actor_name

    @Slot()
    def run(self) -> None:
        """Verify, adopt, and hand back what to tell the user."""
        from rotaris.services.requirements_actions import adopt_workspace

        lines: tuple[str, ...] = ()
        relay = _PassProgressRelay("adoption", self.progress.emit)
        try:
            report = adopt_workspace(
                self._workspace,
                actor_name=self._actor_name,
                progress=relay,
            )
            stated = [report.summary]
            stated.extend(result.message for result in report.refused[:_ADOPTION_REPORT_LIMIT])
            if len(report.refused) > _ADOPTION_REPORT_LIMIT:
                stated.append(
                    f"…and {len(report.refused) - _ADOPTION_REPORT_LIMIT} more that were not"
                    " adopted. Open a card to see the condition it did not meet.",
                )
            lines = tuple(stated)
        except Exception as exc:  # noqa: BLE001 - a failed pass is reported, never raised
            _log.warning("Adoption failed", exc_info=True)
            lines = (f"Adoption could not finish: {exc}",)
        finally:
            self.produced.emit(lines)
            self.finished.emit()


@traces(SWR.SWR_3615, SWR.SWR_3221)
class _VerificationWorker(QObject):
    """Runs one verification pass off the Qt thread.

    The sibling of :class:`_AdoptionWorker` and deliberately thinner: it takes no
    actor, because a verification records what a suite measured rather than a
    decision somebody made. The whole composition is the engine's
    (:func:`~rotaris_core.requirements.verification_host.verify_workspace`), so
    this class is a thread and a report and nothing else.

    Its phases reach the board the same way adoption's do (SWR-3320).
    """

    produced = Signal(object)
    #: A :class:`PassProgress`, throttled by the relay that builds it.
    progress = Signal(object)
    finished = Signal()

    def __init__(self, workspace: Path) -> None:
        super().__init__()
        self._workspace = workspace

    @Slot()
    def run(self) -> None:
        """Verify, and hand back what to tell the user."""
        from rotaris_core.requirements.verification_host import verify_workspace

        lines: tuple[str, ...] = ()
        relay = _PassProgressRelay("verification", self.progress.emit)
        try:
            report = verify_workspace(self._workspace, progress=relay)
            unrecorded = report.refused + report.skipped
            stated = [report.summary]
            stated.extend(result.message for result in unrecorded[:_ADOPTION_REPORT_LIMIT])
            if len(unrecorded) > _ADOPTION_REPORT_LIMIT:
                stated.append(
                    f"…and {len(unrecorded) - _ADOPTION_REPORT_LIMIT} more with no"
                    " verification recorded. Open a card to see what its evidence is"
                    " missing.",
                )
            lines = tuple(stated)
        except Exception as exc:  # noqa: BLE001 - a failed pass is reported, never raised
            _log.warning("Verification failed", exc_info=True)
            lines = (f"Verification could not finish: {exc}",)
        finally:
            self.produced.emit(lines)
            self.finished.emit()
