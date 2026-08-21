"""What a finished run produced, and what the reviewer decides about it.

Review is where an autonomous system earns trust (SWR-3603). Everything the run
touched has to be readable in one place — the specification version it worked
against, its execution units, the files it changed, the traceability it
produced, the checks Rotaris ran, the agent's own summary and risks, and the
branch and worktree the work lives on — without leaving Rotaris for a terminal.

Three properties carry the requirement, and each is asserted by a test:

- **A claim is not a measurement.** The surface is split down the middle
  (:data:`CLAIMED` / :data:`MEASURED`) and every element belongs to exactly one
  half, declared in :data:`REVIEW_ELEMENTS` rather than decided per widget. The
  agent's summary, its reported risks and its "I am done" live on the left and
  are announced as *claimed*; the checks, the verification verdict, the changed
  files, the traceability additions and the unmet completion conditions live on
  the right and are announced as *measured*. When the two disagree — the agent
  claims completion and Rotaris measured nothing or measured a failure — the
  disagreement is stated at the top rather than left for the reader to spot.
  That separation is the engine's own (SWR-3408): the completion contract keeps
  the runner-owned fields out of the model's payload, and this renders the
  separation it already made rather than re-deriving one (SWR-3311).
- **Absent is stated, never blank.** Every element of :data:`REVIEW_ELEMENTS`
  carries the sentence it shows when the run produced none of it, so "this run
  changed no file" and "nobody looked" never collapse into an empty box.
- **The review decides; it does not act.** All six decisions of SWR-3604 come
  from :data:`~rotaris.services.requirements_actions.REVIEW_DECISIONS`, each
  states the engine's own consequence *beside* its control, and the ones the
  engine marks as needing confirmation are armed before they fire. The write
  itself goes through :class:`~rotaris.services.requirements_actions
  .RequirementActions` — the desktop's single write path (SWR-3609) — so a
  refused ``Accept`` comes back with the completion conditions the engine named
  (SWR-3215), never with a sentence composed here.

This is also where a run's **derived technical requirements are offered**
(SWR-3613). A finished run may discover a lasting obligation no product
requirement covers; the twelfth element presents what it proposed, in words that
state the difference SWR-3411 asks for — a unit is a work split and disappears,
a technical requirement is permanent — and each offer carries its own ``Accept``.
Accepting is what writes it, through the same door as every other decision.
Nothing is created by a run finishing.

Nothing about a *run* is rebuilt here (SWR-3612). A unit's session opens in the
Workspace view, a commit and a worktree open in Git, and a changed file opens as
a diff in the surface that already renders one. This module lists what to open
and raises the intent; the mature surfaces stay the only implementation.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Protocol, runtime_checkable

from PySide6.QtCore import QObject, Qt, QThread, Signal, Slot
from PySide6.QtWidgets import (
    QFrame,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QScrollArea,
    QVBoxLayout,
    QWidget,
)
from rotaris_core.reqtocode import SWR, traces

from rotaris.models.state import NoticeSeverity, UiNotice
from rotaris.services.requirements_actions import (
    REVIEW_DECISIONS,
    BoardAction,
    RequirementProposal,
)
from rotaris.theme import tokens
from rotaris.theme.manager import Themed
from rotaris.widgets.cards import Card, make_button, set_action_availability
from rotaris.widgets.feedback import InlineBanner
from rotaris.widgets.patterns import ContentColumn, DetailPageHeader

if TYPE_CHECKING:
    from collections.abc import Callable

    from PySide6.QtGui import QKeyEvent
    from rotaris_core.requirements.delivery.projection import (
        BoardEntry,
        BoardProjection,
        ExecutionUnitView,
    )

    from rotaris.services.requirements_actions import ActionOutcome
    from rotaris.services.requirements_controller import RequirementsController
    from rotaris.theme.spec import Theme

__all__ = [
    "CLAIMED",
    "CLAIM_ATTRIBUTION",
    "MEASURED",
    "MEASURE_ATTRIBUTION",
    "READING_REVIEW",
    "REVIEW_ELEMENTS",
    "REVIEW_PANE",
    "AgentClaim",
    "DeferredReviews",
    "ProjectionReviews",
    "RequirementReview",
    "RequirementReviewView",
    "ReviewCheck",
    "ReviewDecisions",
    "ReviewElement",
    "ReviewSource",
    "ReviewUnit",
    "RotarisMeasurement",
    "attach_review",
    "build_review",
    "element_lines",
]

#: The key the review surface is attached under (SWR-3315).
REVIEW_PANE = "review"

#: The two halves of the surface. Named once, used for the headings, for the
#: accessible names of every row and for the sweep that checks both exist: the
#: whole of SWR-3603's fourth acceptance criterion is that a reader cannot
#: mistake one for the other.
CLAIMED = "Claimed by the agent"
MEASURED = "Measured by Rotaris"

#: What each half says about itself, under its heading. Written out rather than
#: encoded in a colour, because "the agent said so" is the single most important
#: fact about the left-hand column.
CLAIM_ATTRIBUTION = "The agent's own words. Rotaris did not measure any of this."
MEASURE_ATTRIBUTION = "Rotaris ran these itself. Nothing here is the agent's word."

#: Stated when the agent claims completion and Rotaris did not measure it. The
#: case an autonomous system is reviewed for, so it is a sentence at the top of
#: the surface rather than a difference between two paragraphs.
UNMEASURED_CLAIM = (
    "The agent claims this work is complete. Rotaris has not verified that, "
    "so the claim stands unmeasured."
)
#: …and when Rotaris measured the opposite of the claim.
CONTRADICTED_CLAIM = (
    "The agent claims this work is complete. Rotaris measured otherwise, "
    "so the claim is contradicted."
)

#: What the surface says when the selected requirement is not in review at all.
NOT_IN_REVIEW = "{req_id} is not awaiting a review decision: it is in {state}."

#: What it says when the requirement is in review but no run was recorded for it.
NO_REVIEWABLE_RUN = (
    "{req_id} is awaiting review, but no finished run was recorded for it, "
    "so there is nothing to review yet."
)

#: The one action the outcome notice offers: a decision moves the requirement,
#: so the payload the decision was taken on is stale the moment it lands.
RELOAD_LABEL = "Reload this review"
RELOAD_ACTION = "review.reload"

#: What the instructions field says it needs before the agent can be sent back.
INSTRUCTIONS_REQUIRED = (
    "Sending the agent back needs instructions: the next run receives them in "
    "its context, and an empty one would repeat the run unchanged."
)


# ── the values the surface renders (pure, framework-free) ──────────────────


@traces(SWR.SWR_3603)
@dataclass(frozen=True)
class ReviewCheck:
    """One check Rotaris ran for this run, and what it measured.

    Never merged with the agent's summary: the merge is exactly how an
    autonomous system stops being reviewable (SWR-3408).
    """

    name: str
    status: str = ""
    detail: str = ""

    @property
    def ran(self) -> bool:
        """Whether this check produced an outcome at all."""
        return bool(self.status)

    @property
    def passed(self) -> bool:
        """Whether it reported success."""
        return self.status == "passed"

    @property
    def sentence(self) -> str:
        """``pytest: passed`` — or ``ruff: not run``."""
        because = f" — {self.detail}" if self.detail else ""
        return f"{self.name}: {self.status or 'not run'}{because}"


@traces(SWR.SWR_3603, SWR.SWR_3612)
@dataclass(frozen=True)
class ReviewUnit:
    """One execution unit and its outcome, with the addresses it can be opened at.

    :attr:`session_id` is what makes the unit navigable rather than a second
    transcript (SWR-3612): the run's own surfaces are the Workspace, Mission and
    Git views, and this is the id that focuses them.
    """

    unit_id: str
    state_label: str = ""
    outcome_label: str = ""
    run_id: str = ""
    session_id: str = ""
    branch: str = ""
    worktree_path: str = ""

    @property
    def sentence(self) -> str:
        """``unit-1: Finished — run-3 (Succeeded)``."""
        run = f" — {self.run_id}" if self.run_id else ""
        outcome = f" ({self.outcome_label})" if self.outcome_label else ""
        return f"{self.unit_id}: {self.state_label or 'unknown state'}{run}{outcome}"


@traces(SWR.SWR_3603, SWR.SWR_3408)
@dataclass(frozen=True)
class AgentClaim:
    """What the agent said about its own work. A claim, and labelled as one."""

    summary: str = ""
    risks: tuple[str, ...] = ()
    claimed_complete: bool = False

    @property
    def stated(self) -> bool:
        """Whether the agent said anything at all."""
        return bool(self.summary or self.risks or self.claimed_complete)

    @property
    def completion_sentence(self) -> str:
        """The claim itself, in words rather than as a tick."""
        if self.claimed_complete:
            return "The agent claims the work is complete."
        return "The agent did not claim the work is complete."


@traces(SWR.SWR_3603, SWR.SWR_3408)
@dataclass(frozen=True)
class RotarisMeasurement:
    """What Rotaris itself measured about the run — never the agent's word."""

    checks: tuple[ReviewCheck, ...] = ()
    verified: bool | None = None
    changed_files: tuple[str, ...] = ()
    added_traces: tuple[str, ...] = ()
    added_tests: tuple[str, ...] = ()
    #: The completion conditions that still do not hold (SWR-3215), each named.
    unmet: tuple[str, ...] = ()

    @property
    def verdict_sentence(self) -> str:
        """``Rotaris verified this run.`` — three states, never two.

        ``None`` is not a failure: nothing having verified the run yet and a
        verification that came back negative are different facts, and a surface
        that renders both as "not verified" would make the second invisible.
        """
        if self.verified is None:
            return "Rotaris has not verified this run."
        if self.verified:
            return "Rotaris verified this run."
        return "Rotaris could not verify this run."

    @property
    def failed_checks(self) -> tuple[ReviewCheck, ...]:
        """Every check that ran and did not pass."""
        return tuple(check for check in self.checks if check.ran and not check.passed)

    @property
    def measured(self) -> bool:
        """Whether Rotaris measured anything about this run at all."""
        return bool(self.checks or self.verified is not None)


@traces(SWR.SWR_3603, SWR.SWR_3403)
@dataclass(frozen=True)
class RequirementReview:
    """One requirement in ``Review``, as the surface presents it.

    Two hashes, and the difference between them is the point (SWR-3403): a run
    that finished against a specification somebody edited mid-flight is stated
    here rather than discovered when ``Done`` is refused.
    """

    req_id: str
    title: str = ""
    run_id: str = ""
    snapshot_hash: str = ""
    current_hash: str = ""
    reason: str = ""
    claim: AgentClaim = AgentClaim()
    measurement: RotarisMeasurement = RotarisMeasurement()
    units: tuple[ReviewUnit, ...] = ()
    branch: str = ""
    worktree_path: str = ""
    session_id: str = ""
    #: The technical requirements this run offered, waiting for a decision
    #: (SWR-3613). Offers, not requirements: nothing exists in the project's
    #: store until the reviewer accepts one.
    proposals: tuple[RequirementProposal, ...] = ()
    #: Whether there is a review to present. ``False`` is a real state with its
    #: own stated reason, not a missing value.
    available: bool = False
    unavailable_reason: str = ""

    @property
    def specification_changed(self) -> bool:
        """Whether the requirement moved while the run was in flight (SWR-3403)."""
        return bool(self.snapshot_hash and self.current_hash) and (
            self.snapshot_hash != self.current_hash
        )

    @property
    def specification_sentence(self) -> str:
        """Which version was implemented, and whether it is still current."""
        if not self.snapshot_hash:
            return "This run did not record the specification version it worked against."
        if self.specification_changed:
            return (
                f"Implemented {self.snapshot_hash}; the specification now says"
                f" {self.current_hash}. It changed while the run was in flight."
            )
        return f"Implemented {self.snapshot_hash}, which is still the current version."

    @property
    def disagreement(self) -> str:
        """Where the claim and the measurement do not agree — ``""`` when they do.

        Rotaris' verdict wins where it has one: a run it verified is not
        "contradicted" because one check reported a failure the verification
        already weighed. It is the *absence* of a verdict that lets a failed
        check speak, and the absence of any measurement at all that leaves the
        claim standing on its own.
        """
        if not self.claim.claimed_complete:
            return ""
        if self.measurement.verified is False:
            return CONTRADICTED_CLAIM
        if self.measurement.verified is None and self.measurement.failed_checks:
            return CONTRADICTED_CLAIM
        if not self.measurement.measured:
            return UNMEASURED_CLAIM
        return ""

    @property
    def accessible_description(self) -> str:
        """Every fact of this review, in reading order."""
        if not self.available:
            return self.unavailable_reason
        parts = [
            self.specification_sentence,
            self.reason,
            self.disagreement,
            f"{CLAIMED}: {self.claim.completion_sentence}",
            f"{MEASURED}: {self.measurement.verdict_sentence}",
        ]
        return ". ".join(part for part in parts if part)


@dataclass(frozen=True)
class ReviewElement:
    """One element SWR-3603 requires the review to present.

    Held as data rather than as a sequence of ``addWidget`` calls so the surface
    cannot quietly render nine of them, and so each element's *own* empty
    sentence is written once instead of per widget.
    """

    key: str
    title: str
    #: Which half this element belongs to: ``claim``, ``measurement`` or ``work``.
    side: str
    empty_message: str = ""


CLAIM_SIDE = "claim"
MEASUREMENT_SIDE = "measurement"
WORK_SIDE = "work"

#: Every element the review presents, its half and what it says when the run
#: produced none of it (SWR-3603's first acceptance criterion).
REVIEW_ELEMENTS: tuple[ReviewElement, ...] = (
    ReviewElement("summary", "Agent summary", CLAIM_SIDE, "The agent left no summary."),
    ReviewElement("risks", "Reported risks", CLAIM_SIDE, "The agent reported no risk."),
    ReviewElement("completion", "Completion claim", CLAIM_SIDE),
    ReviewElement(
        "checks",
        "Checks Rotaris ran",
        MEASUREMENT_SIDE,
        "Rotaris ran no check for this run.",
    ),
    ReviewElement("verification", "Verification", MEASUREMENT_SIDE),
    ReviewElement(
        "changed_files",
        "Changed files",
        MEASUREMENT_SIDE,
        "This run recorded no file change.",
    ),
    ReviewElement(
        "traceability",
        "Traceability changes",
        MEASUREMENT_SIDE,
        "This run recorded no new implementation trace and no new covering test.",
    ),
    ReviewElement(
        "unmet",
        "Unmet completion conditions",
        MEASUREMENT_SIDE,
        "Every completion condition Rotaris measured holds.",
    ),
    ReviewElement("specification", "Specification version", WORK_SIDE),
    ReviewElement(
        "units",
        "Execution units",
        WORK_SIDE,
        "No execution unit was recorded for this requirement.",
    ),
    ReviewElement(
        "work",
        "Branch and worktree",
        WORK_SIDE,
        "This run recorded no branch and no worktree.",
    ),
    # The twelfth (SWR-3613). On the work side rather than in either half of the
    # claim/measurement split, because it is neither: it is what this run says it
    # made necessary *beyond* the requirement it was implementing, and it is an
    # offer — nothing has been written.
    ReviewElement(
        "proposals",
        "Technical requirements this run proposes",
        WORK_SIDE,
        "This run proposed no technical requirement.",
    ),
)


@traces(SWR.SWR_3603)
def element_lines(review: RequirementReview, key: str) -> tuple[str, ...]:
    """What one element of *review* states — empty when it has nothing to state.

    The single place that maps an element to its content, so the widget half and
    the accessible description cannot drift apart: both read this.
    """
    claim, measured = review.claim, review.measurement
    if key == "summary":
        return (claim.summary,) if claim.summary else ()
    if key == "risks":
        return claim.risks
    if key == "completion":
        return (claim.completion_sentence,)
    if key == "checks":
        return tuple(check.sentence for check in measured.checks)
    if key == "verification":
        return (measured.verdict_sentence,)
    if key == "changed_files":
        return measured.changed_files
    if key == "traceability":
        return (*measured.added_traces, *measured.added_tests)
    if key == "unmet":
        return measured.unmet
    if key == "specification":
        return (review.specification_sentence,)
    if key == "units":
        return tuple(unit.sentence for unit in review.units)
    if key == "work":
        return tuple(
            fact
            for fact in (
                f"Branch {review.branch}" if review.branch else "",
                f"Worktree {review.worktree_path}" if review.worktree_path else "",
            )
            if fact
        )
    if key == "proposals":
        # The proposal's own sentence, which carries the difference SWR-3411
        # asks to be stated wherever one is presented — a unit is a work split
        # and disappears, a technical requirement is permanent.
        return tuple(proposal.sentence for proposal in review.proposals)
    return ()


# ── building one from the engine's projection ──────────────────────────────


@traces(SWR.SWR_3603, SWR.SWR_3403, SWR.SWR_3311, SWR.SWR_3613)
def build_review(
    entry: BoardEntry,
    *,
    proposals: tuple[RequirementProposal, ...] = (),
) -> RequirementReview:
    """The review one board entry presents — pure, and derived from nothing.

    Every value is carried through from the engine's own
    :class:`~rotaris_core.requirements.delivery.projection.ReviewView` and
    :class:`~rotaris_core.requirements.delivery.projection.ExecutionSummary`.
    The split between claim and measurement is the one those types already make
    (SWR-3408); this chooses the words and the order, never the verdict.

    A requirement that is not awaiting review still produces a value — one that
    says so, with its actual delivery state named. "There is nothing here" and
    "this is not the kind of thing that has a review" are different answers.

    *proposals* is the one thing the projection does not carry (SWR-3613): what
    a run offered is Rotaris' own record of the offer, not a fact about the
    requirement, so it is handed in rather than read off the entry.
    """
    units = tuple(_unit(unit) for unit in entry.execution.units)
    review = entry.review
    if review is None:
        state = entry.state.label
        reason = (
            NO_REVIEWABLE_RUN.format(req_id=entry.req_id)
            if state.lower() == "review"
            else NOT_IN_REVIEW.format(req_id=entry.req_id, state=state)
        )
        return RequirementReview(
            req_id=entry.req_id,
            title=entry.title,
            current_hash=entry.current_hash,
            units=units,
            proposals=proposals,
            available=False,
            unavailable_reason=reason,
        )
    session = next(
        (unit.session_id for unit in units if unit.run_id == review.run_id and unit.session_id),
        next((unit.session_id for unit in units if unit.session_id), ""),
    )
    return RequirementReview(
        req_id=review.req_id or entry.req_id,
        title=entry.title,
        run_id=review.run_id or "",
        snapshot_hash=review.snapshot_hash,
        current_hash=review.current_hash or entry.current_hash,
        reason=review.reason,
        claim=AgentClaim(
            summary=review.agent_summary,
            risks=review.agent_risks,
            claimed_complete=review.agent_claimed_complete,
        ),
        measurement=RotarisMeasurement(
            checks=tuple(
                ReviewCheck(name=check.name, status=check.status, detail=check.detail)
                for check in review.checks
            ),
            verified=review.verified,
            changed_files=review.changed_files,
            added_traces=review.added_traces,
            added_tests=review.added_tests,
            unmet=tuple(condition.message for condition in review.unmet),
        ),
        units=units,
        branch=review.branch or "",
        worktree_path=review.worktree_path or "",
        session_id=session,
        proposals=proposals,
        available=True,
    )


def _unit(unit: ExecutionUnitView) -> ReviewUnit:
    """One unit of the projection as the review lists it.

    The engine's types are imported for typing only, exactly as
    :mod:`rotaris.models.requirements_state` does it: importing this module —
    which a review pane does at startup — must never drag the requirement engine
    into a desktop launch that never opens the board.
    """
    last = unit.last_run
    return ReviewUnit(
        unit_id=unit.unit_id,
        state_label=unit.state.label,
        outcome_label=last.outcome.label if last is not None else "",
        run_id=last.run_id if last is not None else "",
        session_id=(last.session_id or "") if last is not None else "",
        branch=unit.branch or "",
        worktree_path=unit.worktree_path or "",
    )


@runtime_checkable
class ReviewSource(Protocol):
    """Where the surface gets a review from (SWR-3311).

    A port rather than a call into the bridge: the review is read off a board
    projection, and which projection — a fresh one, the last one an evaluation
    produced, or one a test built — is the caller's decision.
    """

    def review_for(self, req_id: str) -> RequirementReview | None:
        """The review of *req_id*, or ``None`` when no projection carries it."""
        ...


@traces(SWR.SWR_3603, SWR.SWR_3311, SWR.SWR_3312)
class ProjectionReviews:
    """Reviews read off whatever projects one requirement.

    The projection is asked for on open rather than cached: a review is opened
    once per decision and has to show what is true *now*, and a stale payload is
    how a user accepts a result that has since been superseded (SWR-3403).

    **One requirement, not the whole board.** This runs on the Qt thread — the
    pane is opened by a click and answers in the same call — so what it may ask
    for is bounded by that. A whole-board read also runs the evaluation pass
    (SWR-3502), and since that pass asks a model what a requirement change costs
    (SWR-3503) it can block for as long as a provider takes: on a checkout whose
    branch edited three delivered requirements, three sequential analyses with a
    frozen window and no way to cancel. The per-requirement read carries the same
    facts — the stores are re-read, ``current_hash`` included — without starting
    an evaluation, and the evaluation still happens where it belongs, on the
    bridge's own worker (SWR-3312).

    Nothing is lost by not evaluating here: what a stale review could otherwise
    cause is refused at the moment it matters. ``ExecutionTransitions`` re-reads
    the requirement inside the transition, so accepting a result whose
    specification has moved is refused by the engine (SWR-3403) whatever the
    pane happened to show.
    """

    def __init__(
        self,
        project: Callable[[str], BoardProjection],
        *,
        proposals: Callable[[str], tuple[RequirementProposal, ...]] | None = None,
    ) -> None:
        self._project = project
        self._proposals = proposals

    def review_for(self, req_id: str) -> RequirementReview | None:
        """The review of *req_id*, or ``None`` when the board does not carry it."""
        entry = self._project(req_id).entry(req_id)
        if entry is None:
            return None
        offered = self._proposals(req_id) if self._proposals is not None else ()
        return build_review(entry, proposals=offered)


#: What the surface says while a review is being read off the Qt thread.
READING_REVIEW = (
    "Rotaris is reading {req_id}'s run: its checks, its changed files and its "
    "traceability. The decisions open when it has an answer."
)


class _ReviewWorker(QObject):
    """One review's read, on a thread of its own (SWR-3317).

    The same shape as the bridge's own workers, and for the same reason: reading
    one requirement's review re-reads the requirement store, the delivery store
    and the run history, and none of that belongs on the thread that is painting
    the pane.
    """

    finished = Signal()
    produced = Signal(str, object)
    failed = Signal(str, str)

    def __init__(self, reviews: ReviewSource, req_id: str) -> None:
        super().__init__()
        self._reviews = reviews
        self._req_id = req_id

    @property
    def req_id(self) -> str:
        """Which requirement this worker is reading — the reader's own question."""
        return self._req_id

    @Slot()
    def run(self) -> None:
        try:
            review = self._reviews.review_for(self._req_id)
        except Exception as exc:  # noqa: BLE001 — a failed read is one sentence
            self.failed.emit(
                self._req_id,
                f"{type(exc).__name__}: {exc}" if str(exc) else type(exc).__name__,
            )
        else:
            self.produced.emit(self._req_id, review)
        finally:
            self.finished.emit()


@traces(SWR.SWR_3317, SWR.SWR_3603, SWR.SWR_3312)
class DeferredReviews(QObject):
    """A :class:`ReviewSource` that answers off the Qt thread (SWR-3317).

    :meth:`review_for` answers *at once* with a review that says it is reading,
    and the real one arrives on :attr:`ready`. That is what keeps the click that
    opens a review from freezing the window while the stores are re-read — on a
    store of a thousand requirements the synchronous read was a visible stall,
    and the decisions were unavailable for its whole length anyway.

    A second request while one is in flight is refused rather than queued, for
    the same reason the bridge refuses a second evaluation: two answers racing
    into one pane is worse than the second click doing nothing.
    """

    #: The review that was read, whenever it lands.
    ready = Signal(object)
    #: ``(req_id, message)`` — the read failed, and this is the engine's words.
    failed = Signal(str, str)

    def __init__(self, reviews: ReviewSource, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self._reviews = reviews
        self._thread: QThread | None = None
        self._worker: _ReviewWorker | None = None
        #: The requirement the user is actually waiting for. A read that lands
        #: naming anything else is a read the user has already moved on from.
        self._wanted = ""

    @property
    def reading(self) -> bool:
        """Whether a read is in flight right now."""
        return self._thread is not None and self._thread.isRunning()

    @property
    def wanted(self) -> str:
        """Which requirement's review the next result must be about."""
        return self._wanted

    @traces(SWR.SWR_3317)
    def review_for(self, req_id: str) -> RequirementReview | None:
        """Start the read, and answer with the review that states it is running.

        A second request while one is in flight **supersedes** it rather than
        being refused. Refusing was worse than it looks: the caller still got a
        "reading…" placeholder for the requirement it asked about, no read was
        ever started for it, and the *earlier* requirement's review then landed
        and was rendered — a live decision surface, with Accept and Reject
        enabled, pointing at work the reviewer was no longer looking at.

        The in-flight read cannot be cancelled mid-flight, so it is allowed to
        finish and its result is dropped on arrival (:meth:`_produced` checks
        :attr:`wanted`), and the one the user is actually waiting for starts as
        soon as the thread frees.
        """
        waiting = RequirementReview(
            req_id=req_id,
            available=False,
            unavailable_reason=READING_REVIEW.format(req_id=req_id),
        )
        if not req_id:
            return waiting
        self._wanted = req_id
        if self.reading:
            return waiting
        worker = _ReviewWorker(self._reviews, req_id)
        worker.produced.connect(self._produced)
        worker.failed.connect(self.failed)
        thread = QThread(self)
        worker.moveToThread(thread)
        thread.started.connect(worker.run)
        worker.finished.connect(thread.quit)
        # Collected on this thread rather than through `deleteLater` on the
        # finishing one: the worker holds Python objects, and PySide faults
        # freeing that wrapper off the main thread. The bridge does the same.
        thread.finished.connect(self._finished)
        self._thread = thread
        self._worker = worker
        thread.start()
        return waiting

    @Slot(str, object)
    def _produced(self, req_id: str, review: object) -> None:
        if req_id != self._wanted:
            # The reviewer opened something else while this was reading. Showing
            # it now would arm Accept and Reject against the wrong requirement.
            return
        if review is None:
            self.failed.emit(req_id, f"{req_id} is no longer on this board.")
            return
        self.ready.emit(review)

    def _finished(self) -> None:
        thread = self._thread
        served = self._worker.req_id if self._worker is not None else ""
        self._thread = None
        self._worker = None
        if thread is not None:
            thread.deleteLater()
        # A request that arrived while the thread was busy was recorded, not
        # served. Serve it now that there is a thread to serve it with.
        if self._wanted and self._wanted != served:
            self.review_for(self._wanted)

    def shutdown(self) -> None:
        """Let an in-flight read finish, so no thread outlives the window."""
        thread = self._thread
        if thread is not None and thread.isRunning():
            thread.quit()
            thread.wait(5000)


# ── the surface ────────────────────────────────────────────────────────────


@traces(SWR.SWR_3603, SWR.SWR_3604, SWR.SWR_3612)
class RequirementReviewView(Themed, QWidget):
    """One reviewable requirement: what was claimed, what was measured, what now."""

    #: ``(action, req_id, detail)`` — a review decision, with the user's
    #: instructions on the one decision that carries any (SWR-3604).
    decision_requested = Signal(str, str, str)
    #: ``(path, line)`` — a changed file the user wants to see as a diff.
    open_file_requested = Signal(str, int)
    #: A run whose session the user wants to open (SWR-3612).
    open_run_requested = Signal(str)
    #: A commit or branch the user wants to see in the Git view (SWR-3612).
    open_commit_requested = Signal(str)
    close_requested = Signal()

    def __init__(
        self,
        *,
        reviews: ReviewSource | None = None,
        parent: QWidget | None = None,
    ) -> None:
        super().__init__(parent)
        self._reviews = reviews
        self._review: RequirementReview | None = None
        self._armed: BoardAction | None = None
        #: Which of several things the armed decision is about (SWR-3613).
        self._armed_detail = ""
        self._elements: dict[str, QWidget] = {}
        self._decision_buttons: dict[str, QWidget] = {}
        self.setObjectName("requirementReview")
        self.setAccessibleName("Requirement review")

        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(10)

        page = QWidget()
        column = QVBoxLayout(page)
        column.setContentsMargins(0, 0, 0, 0)
        column.setSpacing(10)

        self.header = DetailPageHeader("Review")
        self.header.back_button.setAccessibleName("Back to the requirement board")
        self.header.back_requested.connect(self.close_requested)
        self.back_button = self.header.back_button
        self.title = self.header.title_label
        column.addWidget(self.header)

        self.state_label = QLabel()
        self.state_label.setObjectName("muted")
        self.state_label.setWordWrap(True)
        self.state_label.setAccessibleName("Review state")
        column.addWidget(self.state_label)

        # The disagreement between claim and measurement is the headline of the
        # whole surface, so it sits above both halves rather than inside one.
        self.disagreement = QLabel()
        self.disagreement.setObjectName("reviewDisagreement")
        self.disagreement.setWordWrap(True)
        self.disagreement.setVisible(False)
        column.addWidget(self.disagreement)

        # Persistent, and both of its controls do something: a decision moves the
        # requirement under the review that raised it, so the honest follow-up is
        # to read it again rather than to keep looking at the payload the
        # decision was taken on (SWR-3403).
        self.banner = InlineBanner()
        self.banner.action_button.setAccessibleName(RELOAD_LABEL)
        self.banner.dismiss_button.setAccessibleName("Dismiss the review notice")
        self.banner.action_requested.connect(self._reload)
        self.banner.dismissed.connect(self._dismiss_notice)
        column.addWidget(self.banner)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.Shape.NoFrame)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        scroll.setAccessibleName("Review sections")
        self.scroll_area = scroll
        body = QWidget()
        layout = QVBoxLayout(body)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(10)

        halves = QHBoxLayout()
        halves.setSpacing(10)
        self.claim_card = self._half(CLAIMED, CLAIM_ATTRIBUTION, "reviewClaimed")
        self.measured_card = self._half(MEASURED, MEASURE_ATTRIBUTION, "reviewMeasured")
        halves.addWidget(self.claim_card, 1)
        halves.addWidget(self.measured_card, 1)
        layout.addLayout(halves)

        self.work_card = Card("The work")
        self.work_card.setObjectName("reviewWork")
        self.work_card.setAccessibleName("The work this run produced")
        layout.addWidget(self.work_card)

        layout.addWidget(self._build_decisions())
        layout.addStretch(1)
        scroll.setWidget(body)
        column.addWidget(scroll, 1)
        root.addWidget(ContentColumn(page), 1)
        self._render()
        self.install_theme_hook()

    def apply_theme(self, theme: Theme) -> None:
        """Restyle the two persistent labels and redraw both halves."""
        # The disagreement is the headline of the surface and takes the waiting
        # state's *text* step; the sentence beside it says the same thing in
        # words, so nothing here rests on the colour alone (SWR-3304).
        self.disagreement.setStyleSheet(
            f"font-size:{theme.type.scale.xs}px;"
            f"font-weight:{theme.type.weight_display};"
            f"color:{theme.color.wait_text};"
        )
        self.confirm_label.setStyleSheet(
            f"font-size:{theme.type.scale.xs}px;color:{theme.color.text};"
        )
        self._render()

    # ── construction ──────────────────────────────────────────────────────

    def _half(self, heading: str, attribution: str, object_name: str) -> Card:
        card = Card(heading)
        card.setObjectName(object_name)
        card.setAccessibleName(heading)
        card.setAccessibleDescription(attribution)
        note = QLabel(attribution)
        note.setObjectName("muted")
        note.setWordWrap(True)
        note.setAccessibleName(attribution)
        card.body.addWidget(note)
        return card

    def _build_decisions(self) -> QWidget:
        # The one card on this page that is *acted on* rather than read, so it
        # is the one that takes the accent rule. Two accented cards would be no
        # accent at all.
        card = Card("Decision", accented=True)
        card.setObjectName("reviewDecisions")
        card.setAccessibleName("Review decisions")
        for action in REVIEW_DECISIONS:
            card.body.addWidget(self._decision_row(action))
        self.confirm_bar = self._build_confirm_bar()
        card.body.addWidget(self.confirm_bar)
        return card

    @traces(SWR.SWR_3604)
    def _decision_row(self, action: BoardAction) -> QWidget:
        """One decision, with the engine's own consequence beside its control.

        Beside, not behind a tooltip: SWR-3604's first acceptance criterion is
        that every option *names* its consequence for the branch and the
        worktree, and a consequence a user has to hover to find is one they
        decide without.
        """
        row = QWidget()
        row.setAccessibleName(f"{action.label} decision")
        row.setAccessibleDescription(action.consequence)
        layout = QHBoxLayout(row)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(8)
        button = make_button(
            action.label, "primary" if action is BoardAction.ACCEPT else "secondary"
        )
        button.setAccessibleName(action.label)
        button.setAccessibleDescription(action.consequence)
        button.setToolTip(action.consequence)
        button.clicked.connect(lambda _=False, chosen=action: self._choose(chosen))
        button.setMinimumWidth(110)
        layout.addWidget(button)
        self._decision_buttons[str(action)] = button
        consequence = QLabel(action.consequence)
        consequence.setObjectName("muted")
        consequence.setWordWrap(True)
        consequence.setAccessibleName(f"Consequence of {action.label.lower()}")
        layout.addWidget(consequence, 1)
        return row

    def _build_confirm_bar(self) -> QWidget:
        bar = QWidget()
        bar.setObjectName("reviewConfirm")
        bar.setAccessibleName("Confirm this decision")
        bar.setVisible(False)
        layout = QVBoxLayout(bar)
        layout.setContentsMargins(0, 6, 0, 0)
        layout.setSpacing(6)
        self.confirm_label = QLabel()
        self.confirm_label.setWordWrap(True)
        layout.addWidget(self.confirm_label)
        self.instructions = QLineEdit()
        self.instructions.setAccessibleName("Instructions for the agent")
        self.instructions.setPlaceholderText("What should the next run do differently?")
        self.instructions.setVisible(False)
        self.instructions.textChanged.connect(self._sync_confirm)
        layout.addWidget(self.instructions)
        controls = QHBoxLayout()
        controls.setContentsMargins(0, 0, 0, 0)
        controls.setSpacing(6)
        self.confirm_button = make_button("Confirm", "primary")
        self.confirm_button.clicked.connect(self._confirm)
        controls.addWidget(self.confirm_button)
        self.cancel_button = make_button("Cancel", "ghost")
        self.cancel_button.clicked.connect(self.disarm)
        controls.addWidget(self.cancel_button)
        controls.addStretch(1)
        layout.addLayout(controls)
        return bar

    # ── what is on screen ─────────────────────────────────────────────────

    @property
    def review(self) -> RequirementReview | None:
        """The review currently presented, if any."""
        return self._review

    @property
    def req_id(self) -> str:
        """Which requirement is open — ``""`` when none is."""
        return self._review.req_id if self._review is not None else ""

    @property
    def armed(self) -> str:
        """The decision waiting for confirmation, as its action token."""
        return str(self._armed) if self._armed is not None else ""

    @property
    @traces(SWR.SWR_3613)
    def armed_detail(self) -> str:
        """Which of several things the armed decision is about — a proposal's key."""
        return self._armed_detail

    def element_widget(self, key: str) -> QWidget | None:
        """The rendered container of one element of :data:`REVIEW_ELEMENTS`."""
        return self._elements.get(key)

    def decision_button(self, action: str) -> QWidget | None:
        """The control one decision is taken through."""
        return self._decision_buttons.get(action)

    @traces(SWR.SWR_3603)
    def open(self, req_id: str) -> bool:
        """Ask the source for *req_id*'s review and present it.

        ``False`` when no source is attached or the board does not carry the
        requirement — a card that vanished between the click and the open is a
        real race, and inventing a review for it would show work nobody did.
        """
        if self._reviews is None:
            return False
        review = self._reviews.review_for(req_id)
        if review is None:
            return False
        self.show_review(review)
        return True

    @traces(SWR.SWR_3603)
    def show_review(self, review: RequirementReview) -> None:
        """Present *review*: both halves, the work, and the six decisions."""
        self._review = review
        self.disarm()
        self.banner.show_notice(None)
        self._render()

    def _render(self) -> None:
        review = self._review
        if review is None:
            self.title.setText("Review")
            self.title.setAccessibleName("Review")
            self.state_label.setText("Open a requirement in Review to see what its run produced.")
            self.state_label.setAccessibleName(self.state_label.text())
            self.disagreement.setVisible(False)
            self._clear_elements()
            self._sync_decisions(available=False)
            return
        heading = f"{review.req_id} — {review.title}" if review.title else review.req_id
        self.title.setText(f"Review of {heading}")
        self.title.setAccessibleName(self.title.text())
        state = review.unavailable_reason if not review.available else review.reason
        self.state_label.setText(state or "This run is awaiting a review decision.")
        self.state_label.setAccessibleName(self.state_label.text())
        self.disagreement.setText(review.disagreement)
        self.disagreement.setAccessibleName(review.disagreement or "Claim and measurement agree")
        self.disagreement.setVisible(bool(review.disagreement))
        self._clear_elements()
        if review.available:
            self._render_elements(review)
        self._sync_decisions(available=review.available)
        self.setAccessibleDescription(review.accessible_description)

    def _clear_elements(self) -> None:
        for widget in self._elements.values():
            widget.setParent(None)
            widget.deleteLater()
        self._elements = {}

    def _render_elements(self, review: RequirementReview) -> None:
        bodies = {
            CLAIM_SIDE: (self.claim_card, CLAIMED),
            MEASUREMENT_SIDE: (self.measured_card, MEASURED),
            WORK_SIDE: (self.work_card, "Recorded by Rotaris"),
        }
        for element in REVIEW_ELEMENTS:
            card, attribution = bodies[element.side]
            widget = self._element_widget(element, review, attribution)
            self._elements[element.key] = widget
            card.body.addWidget(widget)

    def _element_widget(
        self,
        element: ReviewElement,
        review: RequirementReview,
        attribution: str,
    ) -> QWidget:
        t = tokens()
        block = QWidget()
        block.setAccessibleName(f"{attribution}: {element.title}")
        layout = QVBoxLayout(block)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(3)
        heading = QLabel(element.title)
        heading.setStyleSheet(
            f"font-size:{t.type.scale.x2s}px;"
            f"font-weight:{t.type.weight_display};"
            f"color:{t.color.text_secondary};"
        )
        heading.setAccessibleName(f"{element.title}, {attribution.lower()}")
        layout.addWidget(heading)
        lines = element_lines(review, element.key)
        if not lines:
            message = QLabel(element.empty_message or "Nothing was recorded.")
            message.setObjectName("muted")
            message.setWordWrap(True)
            message.setAccessibleName(message.text())
            layout.addWidget(message)
            block.setAccessibleDescription(message.text())
            return block
        for line in lines:
            layout.addWidget(self._line_widget(element, line, review))
        block.setAccessibleDescription(f"{attribution}. " + ". ".join(lines))
        return block

    def _line_widget(
        self,
        element: ReviewElement,
        line: str,
        review: RequirementReview,
    ) -> QWidget:
        """One line of an element — with the control that opens it, when it has one."""
        t = tokens()
        row = QWidget()
        row.setAccessibleName(line)
        layout = QHBoxLayout(row)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(6)
        label = QLabel(line)
        label.setWordWrap(True)
        label.setAccessibleName(line)
        label.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        mono = element.key in {"changed_files", "traceability", "work"}
        # A path, a trace site and a branch are read character by character, so
        # they take the application stylesheet's mono face by property rather
        # than restating a family this label would then have to keep current.
        label.setProperty("mono", "true" if mono else "false")
        label.setStyleSheet(f"font-size:{t.type.scale.xs}px;color:{t.color.text_secondary};")
        layout.addWidget(label, 1)
        opener = self._opener(element, line, review)
        if opener is not None:
            layout.addWidget(opener)
        return row

    @traces(SWR.SWR_3612)
    def _opener(
        self,
        element: ReviewElement,
        line: str,
        review: RequirementReview,
    ) -> QWidget | None:
        """The control that opens this line where it already lives (SWR-3612).

        A changed file opens as a diff, a unit's run focuses its session in the
        Workspace view and a branch opens in Git. None of the three is drawn
        here: this raises the intent and the mature surface answers it.
        """
        if element.key == "changed_files":
            button = make_button("Open diff", "ghost")
            button.setAccessibleName(f"Open the diff of {line}")
            path = line
            button.clicked.connect(
                lambda _=False, target=path: self.open_file_requested.emit(target, 0)
            )
            return button
        if element.key == "traceability":
            path, _, raw = line.rpartition(":")
            if not path:
                return None
            button = make_button("Open site", "ghost")
            button.setAccessibleName(f"Open {line}")
            line_no = int(raw) if raw.isdigit() else 0
            button.clicked.connect(
                lambda _=False, target=path, at=line_no: self.open_file_requested.emit(target, at),
            )
            return button
        if element.key == "units":
            unit = next(
                (item for item in review.units if line.startswith(f"{item.unit_id}:")), None
            )
            if unit is None or not unit.session_id:
                return None
            button = make_button("Open run", "ghost")
            button.setAccessibleName(f"Open the session of {unit.unit_id} in the Workspace view")
            session = unit.session_id
            button.clicked.connect(
                lambda _=False, target=session: self.open_run_requested.emit(target)
            )
            return button
        if element.key == "work" and line.startswith("Branch "):
            button = make_button("Open in Git", "ghost")
            button.setAccessibleName(f"Open {line.removeprefix('Branch ')} in the Git view")
            branch = line.removeprefix("Branch ")
            button.clicked.connect(
                lambda _=False, target=branch: self.open_commit_requested.emit(target)
            )
            return button
        if element.key == "proposals":
            return self._accept_control(line, review)
        return None

    @traces(SWR.SWR_3613)
    def _accept_control(self, line: str, review: RequirementReview) -> QWidget | None:
        """The control that turns one offer into a requirement (SWR-3613).

        Beside the offer rather than in the decision row, because there can be
        more than one and a decision has to name *which*. It is the same
        decision path as the six: it raises :attr:`decision_requested` with the
        proposal's key as the detail, and the write happens through the board's
        one door.
        """
        proposal = next(
            (item for item in review.proposals if item.sentence == line),
            None,
        )
        if proposal is None:
            return None
        button = make_button("Accept", "secondary")
        button.setAccessibleName(f"Accept the technical requirement {proposal.title}")
        button.setAccessibleDescription(BoardAction.ACCEPT_PROPOSAL.consequence)
        button.setToolTip(BoardAction.ACCEPT_PROPOSAL.consequence)
        key = proposal.key
        button.clicked.connect(
            lambda _=False, target=key: self._choose(BoardAction.ACCEPT_PROPOSAL, target),
        )
        return button

    # ── the six decisions (SWR-3604) ──────────────────────────────────────

    def _sync_decisions(self, *, available: bool) -> None:
        review = self._review
        reason = (
            ""
            if available
            else (
                review.unavailable_reason
                if review is not None
                else "Open a requirement in Review before deciding about it."
            )
        )
        for action in REVIEW_DECISIONS:
            button = self._decision_buttons[str(action)]
            name = f"{action.label} {review.req_id}" if review is not None else action.label
            button.setAccessibleName(name)
            set_action_availability(button, enabled=available, reason=reason)
            if available:
                button.setToolTip(action.consequence)
                button.setAccessibleDescription(action.consequence)

    @traces(SWR.SWR_3604, SWR.SWR_3613)
    def _choose(self, action: BoardAction, detail: str = "") -> None:
        """Take a decision — after arming the ones the engine says to confirm.

        Which ones those are is :attr:`BoardAction.confirm`'s answer, not this
        view's: a board that kept its own list would confirm a different set from
        the one the drop path confirms (SWR-3311).

        *detail* names *which* of several things the decision is about — the
        proposal a reviewer is accepting (SWR-3613). It is carried through the
        confirmation, so what is confirmed is what was clicked.
        """
        review = self._review
        if review is None or not review.available:
            return
        self._armed_detail = detail
        if not action.confirm:
            self.decision_requested.emit(str(action), review.req_id, detail)
            return
        self._armed = action
        self.confirm_bar.setVisible(True)
        named = next((item.title for item in review.proposals if item.key == detail), "")
        subject = f"{review.req_id} — {named}" if named else review.req_id
        self.confirm_label.setText(f"{action.label} {subject} — {action.consequence}")
        self.confirm_label.setAccessibleName(self.confirm_label.text())
        self.confirm_button.setText(f"Confirm {action.label.lower()}")
        self.confirm_button.setAccessibleName(f"Confirm {action.label.lower()} of {review.req_id}")
        self.cancel_button.setAccessibleName(f"Cancel {action.label.lower()} of {review.req_id}")
        needs_instructions = action is BoardAction.SEND_BACK
        self.instructions.setVisible(needs_instructions)
        if needs_instructions:
            self.instructions.setFocus(Qt.FocusReason.OtherFocusReason)
        else:
            self.confirm_button.setFocus(Qt.FocusReason.OtherFocusReason)
        self._sync_confirm()

    def _sync_confirm(self) -> None:
        """Keep the confirm control honest about what it still needs."""
        if self._armed is not BoardAction.SEND_BACK:
            set_action_availability(self.confirm_button, enabled=True)
            return
        ready = bool(self.instructions.text().strip())
        set_action_availability(
            self.confirm_button,
            enabled=ready,
            reason="" if ready else INSTRUCTIONS_REQUIRED,
        )

    def _confirm(self) -> None:
        review, action = self._review, self._armed
        if review is None or action is None:
            return
        detail = (
            self.instructions.text().strip()
            if action is BoardAction.SEND_BACK
            else self._armed_detail
        )
        if action is BoardAction.SEND_BACK and not detail:
            return
        self.disarm()
        self.decision_requested.emit(str(action), review.req_id, detail)

    def disarm(self) -> None:
        """Take back an armed decision without performing it."""
        self._armed = None
        self._armed_detail = ""
        self.confirm_bar.setVisible(False)
        self.instructions.clear()
        self.instructions.setVisible(False)

    @traces(SWR.SWR_3604, SWR.SWR_3602)
    def show_outcome(self, outcome: ActionOutcome) -> None:
        """State what the engine did with a decision — in the engine's own words.

        A refused ``Accept`` is the case that matters (SWR-3215): every unmet
        condition arrives named on :attr:`ActionOutcome.details`, and they are
        shown individually rather than counted.
        """
        if self._review is not None and outcome.req_id and outcome.req_id != self._review.req_id:
            return
        feedback = outcome.feedback()
        self.banner.show_notice(
            UiNotice(
                id=f"review:{outcome.req_id}:{outcome.action}",
                severity=NoticeSeverity(feedback.severity),
                title=feedback.title,
                message=feedback.reason,
                details="\n".join(feedback.details),
                # Persistent, not a toast (SWR-3602): a refusal nobody read is a
                # refusal they will repeat.
                persistent=True,
                action_label=RELOAD_LABEL,
                action_id=RELOAD_ACTION,
            ),
        )

    @traces(SWR.SWR_3317)
    def report_unreadable(self, req_id: str, message: str) -> None:
        """State that the deferred read of *req_id* failed, and offer it again.

        A failed read is not an empty review (SWR-3317): the surface says what
        went wrong, in the reader's own words, and its one action is to try
        again — which is exactly what the reload control already does.
        """
        if self._review is not None and self._review.req_id not in {req_id, ""}:
            return
        self.show_review(
            RequirementReview(
                req_id=req_id,
                available=False,
                unavailable_reason=f"{req_id}'s review could not be read: {message}",
            ),
        )

    def _reload(self, action_id: str) -> None:
        """Read the review again — the requirement moved under it."""
        review = self._review
        if action_id != RELOAD_ACTION or review is None:
            return
        self.open(review.req_id)

    def _dismiss_notice(self, notice_id: str) -> None:
        """The other half of "persists until dismissed or resolved" (SWR-3602)."""
        del notice_id
        self.banner.show_notice(None)

    @traces(SWR.SWR_3314)
    def keyPressEvent(self, event: QKeyEvent) -> None:  # noqa: N802 — Qt's spelling
        """Escape takes back an armed decision, then closes the surface."""
        if event.key() == Qt.Key.Key_Escape:
            if self._armed is not None:
                self.disarm()
            else:
                self.close_requested.emit()
            event.accept()
            return
        super().keyPressEvent(event)


# ── wiring (SWR-3315) ──────────────────────────────────────────────────────


@traces(SWR.SWR_3604, SWR.SWR_3609, SWR.SWR_3610)
class ReviewDecisions(QObject):
    """Turns a review decision into a write through the board's one door.

    Every decision goes through
    :class:`~rotaris.services.requirements_actions.RequirementActions` — the
    desktop's only write path (SWR-3609) — so each one is attributed to the user
    and recorded (SWR-3610), and an ``Accept`` the engine refuses comes back with
    the conditions it named rather than with a sentence composed here.

    ``send-back`` is routed through
    :meth:`~rotaris.services.requirements_actions.RequirementActions.send_back`
    rather than through the controller's generic entry, because the instructions
    have to travel *twice*: onto the transition's own detail, and into the run
    the release starts (SWR-3604, SWR-3407). The controller's ``perform_action``
    carries a detail but no instructions, so it would record what the user said
    and start a run that never hears it.
    """

    #: The :class:`~rotaris.services.requirements_actions.ActionOutcome` of every
    #: decision, whatever became of it.
    decided = Signal(object)

    def __init__(
        self,
        controller: RequirementsController,
        parent: QObject | None = None,
    ) -> None:
        super().__init__(parent if parent is not None else controller)
        self._controller = controller

    @traces(SWR.SWR_3604)
    def decide(self, action: str, req_id: str, detail: str = "") -> ActionOutcome | None:
        """Perform one review decision and report what the engine answered."""
        if action == str(BoardAction.SEND_BACK) and detail:
            return self._send_back(req_id, detail)
        outcome = self._controller.perform_action(action, req_id, detail)
        if outcome is not None:
            self.decided.emit(outcome)
        return outcome

    def _send_back(self, req_id: str, instructions: str) -> ActionOutcome | None:
        actions = self._controller.actions
        if actions is None:
            # No write path at all: the controller states that in its own words
            # rather than this inventing a second sentence for it (SWR-3602).
            return self._controller.perform_action(str(BoardAction.SEND_BACK), req_id, instructions)
        outcome = actions.send_back(req_id, instructions)
        self.decided.emit(outcome)
        if outcome.accepted:
            # The delivery store moved under the board, so the honest way to show
            # the new state is to read it again (SWR-3311).
            self._controller.refresh()
        return outcome


@traces(SWR.SWR_3315, SWR.SWR_3603, SWR.SWR_3612)
def attach_review(
    controller: RequirementsController,
    *,
    reviews: ReviewSource,
    pane: RequirementReviewView | None = None,
) -> RequirementReviewView:
    """Build the review surface and wire it into the requirements area.

    The extension point SWR-3315 promised, used: the pane is registered on the
    controller, the controller's ``review_requested`` opens it, its decisions go
    back through the controller's write path, and its navigation lands in the
    views that already own a run (SWR-3612). ``views/main_window.py`` never
    learns that any of this exists.
    """
    surface = pane if pane is not None else RequirementReviewView(reviews=reviews)
    controller.attach_pane(REVIEW_PANE, surface)
    controller.review_requested.connect(surface.open)
    if isinstance(reviews, DeferredReviews):
        # The read runs on a worker (SWR-3317), so the surface opens on the
        # "reading" state and this is what replaces it with the answer.
        reviews.ready.connect(surface.show_review)
        reviews.failed.connect(surface.report_unreadable)
    decisions = ReviewDecisions(controller)
    surface.decision_requested.connect(decisions.decide)
    decisions.decided.connect(surface.show_outcome)
    surface.open_run_requested.connect(controller.open_run)
    surface.open_commit_requested.connect(controller.open_commit)
    view = controller.view
    if view is None:
        return surface
    forward = getattr(view, "open_file_requested", None)
    if forward is not None and hasattr(forward, "emit"):
        # The board already owns "open this file at this line"; the review raises
        # the same intent rather than growing a second file opener (SWR-3612).
        surface.open_file_requested.connect(forward)
    show_pane = getattr(view, "show_pane", None)
    if callable(show_pane):
        # Opening a review *shows* it: the pane is in the board's stack, and a
        # surface that filled itself in behind the board would answer the user's
        # click with nothing happening.
        controller.review_requested.connect(lambda _req_id: show_pane(REVIEW_PANE))
    show_board = getattr(view, "show_board", None)
    if callable(show_board):
        surface.close_requested.connect(show_board)
    return surface
