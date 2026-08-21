"""Every write the requirement board makes, and the one door it makes it through.

A column on this board is not a label, it is a state with consequences
(SWR-3601). Dropping a card on ``Ready`` releases a requirement for agentic
implementation; dropping it on ``Done`` claims it was delivered. So the desktop
needs exactly one place where a gesture becomes an instruction, and this is it.

Three properties are the whole point of the module, and each is asserted by a
test rather than promised here:

- **Nothing writes a delivery state except the engine's transition function.**
  Every state-changing action builds a
  :class:`~rotaris_core.requirements.delivery.transitions.TransitionRequest` and
  hands it to :class:`TransitionPort` — in production
  :class:`~rotaris_core.requirements.execution.snapshot.ExecutionTransitions`,
  which wraps the workspace's own completion gate in the specification guard of
  SWR-3403. This module never touches the delivery store and never builds a
  ``DeliveryStatus``. It *does* assemble the gate, in :func:`workspace_actions`
  and nowhere else — but it supplies the engine only an **evidence reader**
  (:func:`completion_evidence_for`), never a verdict and never an override: the
  conditions of SWR-3215 are evaluated by
  :func:`~rotaris_core.requirements.delivery.completion.evaluate_completion`,
  which this side of the seam neither imports nor can influence. A ``Done`` the
  desktop asked for is therefore granted by the engine's conditions or by
  nothing at all (SWR-3609), and :data:`NO_OVERRIDE_REASON` says why there is no
  third way. A composition that supplied *no* gate would be the same failure in
  the other direction — ``Review → Done`` refused forever, whatever the evidence
  — so the gate is part of the write path rather than an optional extra.
- **A refusal is the engine's sentence, not the board's.**
  :attr:`ActionOutcome.reason` is the refused transition's own stated
  precondition and :attr:`ActionOutcome.details` its individually named unmet
  conditions. The board composes a title around them and adds nothing else
  (SWR-3602).
- **A technical requirement a run proposed is offered, never written**
  (SWR-3613). A finished run records what lasting obligation it discovered
  (:func:`offer_technical_requirements`), the review of its origin presents it
  with the difference SWR-3411 asks to be stated, and only
  :attr:`BoardAction.ACCEPT_PROPOSAL` — through the same
  :meth:`RequirementActions.perform` as everything else — creates it. There is
  no other path here that writes one.
- **Every action that changes state leaves an attributed record.** The actor is
  a :class:`~rotaris_core.requirements.delivery.state.DeliveryActor` of kind
  ``user``, carrying the person's name, and the request carries the
  requirement's hash at that moment; the port appends the audit event of
  SWR-3213. There is no second audit log (SWR-3610).

The mapping half — which move means which action, which columns a card can
reach, what each action will cause — is **pure**: no store, no clock, no engine
state, only the delivery matrix. That is what lets the board indicate
unreachable drop targets during a drag (SWR-3602) and offer the same moves from
the keyboard (SWR-3314) without asking anything to be applied first.

The engine is imported inside the functions that need it, exactly as
:mod:`rotaris.services.requirements_bridge` does: the delivery package is a
large import and a desktop launch that never opens the board must not pay for
it.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, replace
from enum import StrEnum
from pathlib import Path
from typing import TYPE_CHECKING, Protocol, runtime_checkable

from rotaris_core.reqtocode import SWR, traces

from rotaris.models.requirements_state import ActionFeedback, PendingAction

if TYPE_CHECKING:
    from collections.abc import Callable, Iterable, Mapping, Sequence

    from rotaris_core.config.schema import RotarisConfig
    from rotaris_core.requirements.change.decisions import PendingDecision
    from rotaris_core.requirements.change_host import (
        ChangeOffer,
        OfferOutcome,
        RelationBlockers,
    )
    from rotaris_core.requirements.delivery.adoption import AdoptionReport
    from rotaris_core.requirements.delivery.audit import AuditEvent
    from rotaris_core.requirements.delivery.completion import CompletionEvidence
    from rotaris_core.requirements.delivery.evidence import EvidenceInputs
    from rotaris_core.requirements.delivery.projection import CheckOutcome, RunOutcome
    from rotaris_core.requirements.delivery.satisfied import SatisfiedDelivery
    from rotaris_core.requirements.delivery.state import (
        ActorKind,
        DeliveryActor,
        DeliveryState,
        TransitionCause,
    )
    from rotaris_core.requirements.delivery.transitions import (
        TransitionOutcome,
        TransitionRefusal,
        TransitionRequest,
    )
    from rotaris_core.requirements.execution.decomposition import (
        Decomposer,
        RequirementAssessment,
    )
    from rotaris_core.requirements.execution.flow import (
        FlowResult,
        RequirementFlow,
        StageEvent,
    )
    from rotaris_core.requirements.execution.reader import WorkspaceExecution
    from rotaris_core.requirements.execution.run_seam import (
        IsolationProvider,
        RunHost,
        RunReport,
        UnitLaunch,
    )
    from rotaris_core.requirements.execution.scheduler import (
        RunningUnit,
        ScheduleDecision,
        SchedulerLimits,
    )
    from rotaris_core.requirements.execution.target import TargetBranch
    from rotaris_core.requirements.execution.verification import SuiteRun, UnitVerification
    from rotaris_core.requirements.model import CanonicalRequirement
    from rotaris_core.requirements.pass_progress import PassProgress
    from rotaris_core.requirements.sources.base import RequirementSource
    from rotaris_core.requirements.writeback import RequirementWriteBack
    from rotaris_core.run_result import RunResult as AgentRunResult
    from rotaris_core.run_result import RunStatus
    from rotaris_core.verifier.runner import CheckResult

    from rotaris.services.requirement_editing import RequirementEditing

__all__ = [
    "BLOCKED",
    "NO_OVERRIDE_REASON",
    "PROPOSALS_FILE",
    "REQUIREMENT_SOURCE_FILENAME",
    "REVIEW_DECISIONS",
    "UNGUARDED_WRITER",
    "ActionOutcome",
    "AgentRunHost",
    "BoardAction",
    "ChangeWorkPort",
    "FlowEnded",
    "FlowReporting",
    "FlowRunStarter",
    "MoveOption",
    "ProposalOutcome",
    "ProposalPort",
    "QueueDraining",
    "RequirementActions",
    "RequirementProposal",
    "RunPreflight",
    "RunRefusedError",
    "RunStarter",
    "SessionLaunch",
    "SessionLauncher",
    "SessionRunResult",
    "TransitionPort",
    "WorkspaceProposals",
    "action_for_move",
    "attach_session_to_run",
    "move_options",
    "offer_technical_requirements",
    "refusal_lines",
    "requirement_source_for",
    "requirement_source_path",
    "schedule_now",
    "workspace_actions",
    "workspace_editing",
]

#: The delivery state token that is not a stage of progress (SWR-3303). Named
#: because both directions through it are special: anything may enter it, and
#: leaving it goes back to where it came from and nowhere else.
BLOCKED = "blocked"

#: Why the desktop offers no way to force ``Done``. Not an omission — the whole
#: guarantee of SWR-3609 is that the weakest write path is still the engine's:
#: an override control here would need a completion gate of its own, and a gate
#: the user interface owns is a gate the user interface can weaken.
NO_OVERRIDE_REASON = (
    "Rotaris does not force a requirement to Done from the board. "
    "Done is granted by the completion conditions (SWR-3215) evaluated by the engine "
    "at the moment of the transition; this surface supplies the evidence they read "
    "and decides none of them."
)

#: What a transition port that does not enforce the specification guard would
#: cost, stated at the one place that refuses one (SWR-3403, SWR-3609).
UNGUARDED_WRITER = (
    "does not enforce the specification guard: a requirement edited while its run was in "
    "flight could then be accepted as delivered (SWR-3403). Build the writer with "
    "rotaris_core.requirements.execution.snapshot.ExecutionTransitions."
)


@traces(SWR.SWR_3601, SWR.SWR_3610)
class BoardAction(StrEnum):
    """The closed set of instructions the requirement board can give.

    Closed on purpose: SWR-3610 asks for a completeness sweep over the actions,
    and a sweep over a set somebody can extend by writing a new ``if`` in a view
    proves nothing. A surface that needs a new action adds a member here, and the
    sweep immediately demands its consequence, its attribution and its record.
    """

    #: Release for agentic implementation — the drop that starts work.
    RELEASE = "release"
    #: Take a released requirement back off the queue.
    RETURN = "return"
    #: Accept a reviewed result as delivered.
    ACCEPT = "accept"
    #: Run the unit again, unchanged.
    RERUN = "rerun"
    #: Send the agent back with the user's instructions.
    SEND_BACK = "send-back"
    #: Reject the integration; the unit branches and worktrees are kept.
    REJECT = "reject"
    #: Block the requirement with a stated reason.
    HOLD = "hold"
    #: Clear the blocker and return to the state it was blocked in.
    RESUME = "resume"
    #: Answer the question the engine escalated (SWR-3512, SWR-3607).
    ANSWER_BLOCKER = "answer-blocker"
    #: Write an edited requirement back to its own source (SWR-3111, SWR-3605).
    EDIT = "edit"
    #: Create a requirement in the project's own store (SWR-3112, SWR-3606).
    CREATE = "create"
    #: Accept one technical requirement a run proposed (SWR-3411, SWR-3613).
    ACCEPT_PROPOSAL = "accept-proposal"
    #: Carry out the work a requirement's change asks for (SWR-3505, SWR-3616).
    ACCEPT_CHANGE_WORK = "accept-change-work"
    #: Keep the worktree for manual work, and leave the requirement where it is.
    KEEP_WORKTREE = "keep-worktree"

    @property
    def label(self) -> str:
        """``Send back`` — the action as a control names it."""
        return " ".join(self.value.split("-")).capitalize()

    @property
    def changes_state(self) -> bool:
        """Whether performing this action changes something Rotaris records.

        The one action that does not is :attr:`KEEP_WORKTREE`: it declines to act
        and says so. Everything else leaves a record (SWR-3610).
        """
        return self is not BoardAction.KEEP_WORKTREE

    @property
    def transitions(self) -> bool:
        """Whether this action moves the delivery state (SWR-3203)."""
        return self in _TRANSITION_ACTIONS

    @property
    def starts_run(self) -> bool:
        """Whether accepting this action always starts agent work (SWR-3413).

        The answer that needs no context, which is what
        :attr:`confirm` and every surface offering the action can ask.
        :func:`dispatches_a_run` is the one that decides, and it adds the case
        this cannot see: where a resumed requirement is going.
        """
        return self in {BoardAction.RELEASE, BoardAction.RERUN, BoardAction.SEND_BACK}

    @property
    def confirm(self) -> bool:
        """Whether the consequence must be stated before it happens (SWR-3601).

        True for the actions that start runs and for the three that accept
        something: those are the moves whose cost a user cannot take back by
        dragging the card home again — a delivered result, a permanent
        requirement in the project's own store (SWR-3613), or the agent runs a
        change's work asks for (SWR-3616).
        """
        return self.starts_run or self in {
            BoardAction.ACCEPT,
            BoardAction.ACCEPT_PROPOSAL,
            BoardAction.ACCEPT_CHANGE_WORK,
        }

    @property
    def consequence(self) -> str:
        """What this action will cause, in one sentence."""
        return _CONSEQUENCES[self]

    @property
    def progress_label(self) -> str:
        """What the card says while the engine is answering (SWR-3601)."""
        return _PROGRESS[self]


#: The actions that move the delivery state, and therefore reach the engine's
#: transition function rather than the audit trail directly.
_TRANSITION_ACTIONS: frozenset[BoardAction] = frozenset(
    {
        BoardAction.RELEASE,
        BoardAction.RETURN,
        BoardAction.ACCEPT,
        BoardAction.RERUN,
        BoardAction.SEND_BACK,
        BoardAction.REJECT,
        BoardAction.HOLD,
        BoardAction.RESUME,
        BoardAction.ANSWER_BLOCKER,
    },
)

#: Where each transitioning action wants the requirement to end up. ``RESUME``
#: and ``ANSWER_BLOCKER`` are absent: a blocked requirement returns to the state
#: it was blocked in (SWR-3201), which is a fact of the record rather than a
#: choice of the caller.
_TARGETS: Mapping[BoardAction, str] = {
    BoardAction.RELEASE: "ready",
    BoardAction.RETURN: "backlog",
    BoardAction.ACCEPT: "done",
    BoardAction.RERUN: "ready",
    BoardAction.SEND_BACK: "ready",
    BoardAction.REJECT: "ready",
    BoardAction.HOLD: BLOCKED,
}

_CONSEQUENCES: Mapping[BoardAction, str] = {
    BoardAction.RELEASE: (
        "Releases this requirement for agentic implementation: Rotaris snapshots the "
        "specification, decomposes it into execution units and starts work in its own worktree."
    ),
    BoardAction.RETURN: (
        "Takes the requirement back off the queue. Nothing that already ran is discarded."
    ),
    BoardAction.ACCEPT: (
        "Accepts the reviewed result and records the delivered specification version. "
        "Refused unless every completion condition holds."
    ),
    BoardAction.RERUN: (
        "Runs the unit again from the current specification, on a new branch. "
        "The previous branch and worktree are kept."
    ),
    BoardAction.SEND_BACK: (
        "Sends the agent back with your instructions; the next run receives them in its context."
    ),
    BoardAction.REJECT: (
        "Rejects the integration and returns the requirement to Ready. "
        "The unit branches and worktrees are kept for inspection."
    ),
    BoardAction.HOLD: (
        "Blocks the requirement with your stated reason. Nothing is scheduled for it "
        "until the blocker is cleared."
    ),
    BoardAction.RESUME: (
        "Clears the blocker and returns the requirement to the state it was blocked in — "
        "Ready, where that state was Running, since only Rotaris puts a requirement into a run. "
        "Returning to Ready starts the work again; the queue decides when."
    ),
    BoardAction.ANSWER_BLOCKER: (
        "Records your answer, returns it to the engine and lets the flow continue "
        "from where it stopped."
    ),
    BoardAction.EDIT: (
        "Writes the edited text back into the project's own requirement artefact. "
        "A delivered requirement then needs an update (SWR-3502)."
    ),
    BoardAction.CREATE: (
        "Creates the requirement in the chosen source, following that source's own "
        "id and location conventions."
    ),
    BoardAction.ACCEPT_PROPOSAL: (
        "Creates the technical requirement this run proposed, in the project's own "
        "requirement store, with its origin as its derived-from link. It is permanent: "
        "unlike an execution unit it outlives the run that proposed it."
    ),
    BoardAction.ACCEPT_CHANGE_WORK: (
        "Carries out what the analysis of this change concluded: creates the execution "
        "units it named and releases the requirement, or — where it found no behavioural "
        "change — runs this workspace's checks and records the new version as delivered "
        "if they pass. Nothing runs until you accept (SWR-3616)."
    ),
    BoardAction.KEEP_WORKTREE: (
        "Leaves the requirement in review and keeps its worktree and branch for manual work."
    ),
}

_PROGRESS: Mapping[BoardAction, str] = {
    BoardAction.RELEASE: "Releasing for implementation",
    BoardAction.RETURN: "Returning to the backlog",
    BoardAction.ACCEPT: "Accepting the result",
    BoardAction.RERUN: "Starting the unit again",
    BoardAction.SEND_BACK: "Sending the agent back",
    BoardAction.REJECT: "Rejecting the integration",
    BoardAction.HOLD: "Blocking the requirement",
    BoardAction.RESUME: "Clearing the blocker",
    BoardAction.ANSWER_BLOCKER: "Recording the answer",
    BoardAction.EDIT: "Saving the requirement",
    BoardAction.CREATE: "Creating the requirement",
    BoardAction.ACCEPT_PROPOSAL: "Creating the proposed technical requirement",
    BoardAction.ACCEPT_CHANGE_WORK: "Carrying out what the change asks for",
    BoardAction.KEEP_WORKTREE: "Keeping the worktree",
}


@traces(SWR.SWR_3710, SWR.SWR_3413)
def dispatches_a_run(action: BoardAction, target: str) -> bool:
    """Whether *action*, landing in *target*, starts agent work.

    The one place that decides it, asked by the dispatch itself. Three actions
    always start a run (:attr:`BoardAction.starts_run`) and one does so
    conditionally: clearing a blocker restarts the work it stopped, but only
    where the requirement returns to ``Ready`` — the state a run starts from
    (SWR-3710). A requirement blocked out of ``Backlog`` or ``Review`` returns
    there and nothing is dispatched.

    *target* is a column token, the same vocabulary :data:`_TARGETS` and
    :func:`resume_column` speak, so the caller hands over the state it already
    resolved rather than resolving it a second time.
    """
    from rotaris_core.requirements.delivery.state import DeliveryState

    if action.starts_run:
        return True
    return action is BoardAction.RESUME and target == str(DeliveryState.READY)


#: The decisions a review offers (SWR-3604), in the order it offers them. Held
#: here rather than in the review view so the surface cannot grow a seventh
#: option that no action, no consequence and no record exists for.
REVIEW_DECISIONS: tuple[BoardAction, ...] = (
    BoardAction.ACCEPT,
    BoardAction.RERUN,
    BoardAction.SEND_BACK,
    BoardAction.EDIT,
    BoardAction.REJECT,
    BoardAction.KEEP_WORKTREE,
)

#: Which action one column-to-column move means. Only the moves a *user* can
#: make appear; the rest are refused by the matrix itself (SWR-3203).
_MOVES: Mapping[tuple[str, str], BoardAction] = {
    ("backlog", "ready"): BoardAction.RELEASE,
    ("needs-update", "ready"): BoardAction.RELEASE,
    ("ready", "backlog"): BoardAction.RETURN,
    ("review", "done"): BoardAction.ACCEPT,
    ("review", "ready"): BoardAction.SEND_BACK,
}


@traces(SWR.SWR_3601)
def action_for_move(source: str, target: str) -> BoardAction | None:
    """Which action moving a card from *source* to *target* means.

    ``None`` when the move means nothing this board does — which is not the same
    as "the engine would refuse it": the refusal, and its reason, is
    :meth:`RequirementActions.move`'s answer and comes from the transition
    function (SWR-3602).
    """
    if not source or not target or source == target:
        return None
    if target == BLOCKED:
        return BoardAction.HOLD
    if source == BLOCKED:
        return BoardAction.RESUME
    return _MOVES.get((source, target))


@traces(SWR.SWR_3601, SWR.SWR_3602)
@dataclass(frozen=True)
class MoveOption:
    """One column a card could be dropped on, and whether it may be.

    Both halves matter. The reachable ones carry the consequence a user has to
    read before dropping (SWR-3601); the unreachable ones carry a stated reason
    and a glyph, so "you cannot drop here" survives a user who cannot separate
    the two colours the columns are painted in (SWR-3602, SWR-3314).
    """

    target: str
    label: str
    reachable: bool
    action: str = ""
    consequence: str = ""
    #: Why this column cannot be reached, in the matrix' own terms.
    reason: str = ""
    confirm: bool = False

    @property
    def indicator(self) -> str:
        """``→`` or ``⃠`` — the second, non-colour channel (SWR-3602)."""
        return "→" if self.reachable else "⃠"

    @property
    def sentence(self) -> str:
        """What a drop indicator and a keyboard menu entry both announce."""
        because = self.consequence if self.reachable else self.reason
        name = f"{self.indicator} {self.label}"
        return f"{name} — {because}" if because else name


@traces(SWR.SWR_3601, SWR.SWR_3201)
def resume_column(blocked_from: str) -> str:
    """The column a blocked card is released to, given where it was blocked.

    The board's reading of
    :func:`~rotaris_core.requirements.delivery.transitions.resume_target` for the
    ``user`` actor, in column tokens. Every surface that offers "clear the
    blocker" asks this rather than reading ``blocked_from`` directly, because the
    two differ in exactly the case that used to strand a card: a requirement
    blocked out of ``Running`` is released to ``Ready``, and a control aimed at
    ``Running`` would be one the engine refuses every time it is pressed.
    """
    from rotaris_core.requirements.delivery.state import ActorKind as Kind
    from rotaris_core.requirements.delivery.transitions import resume_target

    origin = _state(blocked_from)
    return str(resume_target(origin, Kind.USER)) if origin is not None else ""


@traces(SWR.SWR_3601, SWR.SWR_3602, SWR.SWR_3314)
def move_options(source: str, *, blocked_from: str = "") -> tuple[MoveOption, ...]:
    """Every delivery column, and whether this card may be moved to it.

    The matrix is asked, never copied: :func:`~rotaris_core.requirements.delivery
    .transitions.is_legal` decides reachability for the ``user`` actor and
    :func:`~rotaris_core.requirements.delivery.transitions.permitted_actors`
    supplies the reason an otherwise legal edge is closed to a person — which is
    how "Rotaris moves a requirement to Running when a run starts" ends up on
    screen instead of a UI-side guess about why the drop bounced.

    A blocked requirement is the one case where the matrix is not the whole
    answer: every edge out of ``Blocked`` is legal in the matrix, but the engine
    accepts only the one state it releases to (SWR-3201). *blocked_from* is where
    it was blocked, :func:`~rotaris_core.requirements.delivery.transitions
    .resume_target` turns that into the state it may go to — the same function the
    engine's guard asks, so the column the board offers is the column that will be
    accepted — and the other columns are reported unreachable naming it.
    """
    from rotaris_core.requirements.delivery.state import ActorKind as Kind
    from rotaris_core.requirements.delivery.state import DeliveryState as State
    from rotaris_core.requirements.delivery.transitions import (
        is_legal,
        permitted_actors,
        resume_target,
    )

    origin = _state(source)
    if origin is None:
        return ()
    resume = resume_target(_state(blocked_from), Kind.USER) if source == BLOCKED else None
    reachable_labels = [
        state.label for state in State if state is not origin and is_legal(origin, state, Kind.USER)
    ]
    options: list[MoveOption] = []
    for state in State:
        if state is origin:
            continue
        action = action_for_move(source, str(state))
        legal = is_legal(origin, state, Kind.USER) and action is not None
        if legal and origin is State.BLOCKED:
            legal = resume is not None and state is resume
        options.append(
            _option(
                state.label,
                str(state),
                action=action,
                legal=legal,
                reason=_why_not(
                    origin,
                    state,
                    resume=resume,
                    permitted=permitted_actors(origin, state),
                    reachable_labels=reachable_labels,
                ),
            ),
        )
    return tuple(options)


def _option(
    label: str,
    target: str,
    *,
    action: BoardAction | None,
    legal: bool,
    reason: str,
) -> MoveOption:
    if legal and action is not None:
        return MoveOption(
            target=target,
            label=label,
            reachable=True,
            action=str(action),
            consequence=action.consequence,
            confirm=action.confirm,
        )
    return MoveOption(target=target, label=label, reachable=False, reason=reason)


def _why_not(
    origin: DeliveryState,
    target: DeliveryState,
    *,
    resume: DeliveryState | None,
    permitted: Iterable[ActorKind],
    reachable_labels: Sequence[str],
) -> str:
    """Why *target* is closed, phrased from the matrix rather than invented."""
    from rotaris_core.requirements.delivery.state import ActorKind as Kind
    from rotaris_core.requirements.delivery.state import DeliveryState as State

    kinds = set(permitted)
    if origin is State.BLOCKED:
        where = resume.label if resume is not None else "the state it was blocked in"
        return f"A blocked requirement returns to {where}, and to nothing else."
    if kinds and Kind.USER not in kinds:
        return (
            f"Rotaris itself moves a requirement to {target.label}; "
            "it is not a column you can drop on."
        )
    reachable = ", ".join(reachable_labels) or "nothing"
    return (
        f"{origin.label} → {target.label} is not a move this board makes. "
        f"From {origin.label} a requirement can reach {reachable}."
    )


def _state(token: str) -> DeliveryState | None:
    """The engine's state for a column token, or ``None`` when it names none."""
    from rotaris_core.requirements.delivery.state import parse_delivery_state

    return parse_delivery_state(token)


@traces(SWR.SWR_3602)
def refusal_lines(refusal: TransitionRefusal) -> tuple[str, ...]:
    """Everything the engine said about a refusal, as separate lines.

    Each unmet completion condition on its own line, because SWR-3215 requires
    them named individually and "3 conditions unmet" is not something a user can
    act on.
    """
    lines = [condition.message for condition in refusal.unmet]
    if refusal.detail:
        lines.append(refusal.detail)
    return tuple(lines)


# ── the ports (SWR-3609) ───────────────────────────────────────────────────


@runtime_checkable
class TransitionPort(Protocol):
    """The one door a delivery state changes through, from the desktop's side.

    Deliberately the same shape as
    :class:`~rotaris_core.requirements.execution.flow.TransitionWriter`, so the
    object the engine's own flow writes through is the object the board writes
    through — one write path for both actors (SWR-3203), not two that happen to
    agree today.
    """

    #: Whether ``Review → Done`` passes through the specification guard of
    #: SWR-3403. :class:`RequirementActions` refuses a port that answers ``False``.
    enforces_specification_guard: bool

    def apply(self, request: TransitionRequest) -> TransitionOutcome:
        """Apply *request*, or refuse it and name the precondition that failed."""
        ...

    def record_event(self, event: AuditEvent) -> AuditEvent:
        """Append one event to the requirement's audit trail (SWR-3213)."""
        ...


@runtime_checkable
class RunStarter(Protocol):
    """Whatever starts the engine's requirement flow (SWR-3413).

    A port rather than the flow itself: starting a run reads the requirement,
    snapshots it and creates a worktree, none of which may happen on the Qt
    thread, and the desktop's own launcher is one implementation among the
    headless ones (SWR-3416).
    """

    def start(self, req_id: str, *, instructions: str = "") -> str:
        """Start work for *req_id* and answer with the run or flow id."""
        ...


@runtime_checkable
class QueueDraining(Protocol):
    """A run starter that keeps a queue and can be asked to move it (SWR-3412).

    Separate from :class:`RunStarter` on purpose: starting one requirement and
    working through a queue are different capabilities, and a headless host that
    runs exactly what it was told has no queue to drain. Asking structurally —
    rather than widening ``RunStarter`` — is what lets both remain valid.
    """

    def drain(self) -> tuple[str, ...]:
        """Start whatever the scheduler now selects. Answers the ids started."""
        ...


@runtime_checkable
class RunPreflight(Protocol):
    """A run starter that can say, before anything moves, what would stop it.

    Structural like :class:`QueueDraining`, and for the same reason: a headless
    host that is handed a workspace and told to run has nothing to check ahead of
    time, so widening :class:`RunStarter` would make every implementation carry a
    question only one of them can answer.

    The question exists because a release is two things happening in order — the
    delivery state moves, and then work starts — and the second one used to be
    allowed to fail after the first had already been written. A workspace with no
    commit is knowable *before* the card moves, so it is asked about first: the
    refusal returns the card to the column it came from and the store is never
    touched, rather than leaving a requirement parked in a state whose run never
    existed.
    """

    def refusal_for(self, req_id: str) -> str:
        """Why a run for *req_id* cannot start here, or ``""`` when one can."""
        ...


@runtime_checkable
class RunCaveats(Protocol):
    """A run starter that can name what a release will run into (SWR-2508).

    The other half of :class:`RunPreflight`, and separate because the two carry
    opposite consequences. A refusal stops the move; a caveat rides along with
    an accepted one. Folding them together would force every condition to be
    fatal, and the condition this exists for — an unattended run under a
    permission mode that denies by default — holds in every workspace nobody
    has configured, so making it fatal would ship a board that refuses
    everything.
    """

    def caveat_for(self, req_id: str) -> str:
        """What a run for *req_id* will run into, or ``""`` when nothing will."""
        ...


# ── how the work a release started ended (SWR-3601) ────────────────────────


@traces(SWR.SWR_3601, SWR.SWR_3602)
@dataclass(frozen=True)
class FlowEnded:
    """How a dispatched flow finished, for whoever showed it starting.

    A release is accepted in the moment the card is dropped, and the flow it
    dispatched ends minutes later on a worker thread. Nothing carried that ending
    back, so the board went on showing "release accepted — started run …" while
    the run was already over: the same requirement, at the same moment, carrying a
    green acceptance above the banner saying it was stopped. SWR-3601 asks for the
    *work* to be visible rather than the moved card, and a run that has ended is
    part of the work.

    Deliberately not the engine's
    :class:`~rotaris_core.requirements.execution.flow.FlowResult`. This value
    crosses a thread boundary into a Qt slot, and what a surface has to state is
    the requirement, the verdict and the sentence — never a whole flow's stages,
    events and units, which belong to the run's own surfaces.
    """

    req_id: str
    flow_id: str = ""
    succeeded: bool = False
    #: The stage the flow stopped at, when it named one.
    stage: str = ""
    #: The engine's own reason, carried verbatim (SWR-3602).
    reason: str = ""
    #: The delivery state the requirement was left in, as the board labels it.
    state: str = ""

    @classmethod
    def of(cls, result: FlowResult, *, flow_id: str = "") -> FlowEnded:
        """*result* as the ending a surface can state."""
        return cls(
            req_id=result.req_id,
            flow_id=result.flow_id or flow_id,
            succeeded=result.succeeded,
            stage=str(result.failed_stage) if result.failed_stage is not None else "",
            reason=result.reason,
            state=result.final_state.label,
        )

    @property
    def reviewable(self) -> bool:
        """Whether the flow left work a person can look at.

        :attr:`succeeded` is not the question. The engine calls a run successful
        only when it reached ``Review`` with no failed stage, so a failed
        verification and a conflicting integration both answer ``False`` — and
        both are routed to ``Review`` on purpose, because the stages after an
        agent has produced something leave a tree worth reading
        (``FlowStage.blocks_on_failure``). Where the card was left is the fact
        that tells a stop from a finish, and it is already carried here.
        """
        from rotaris_core.requirements.delivery.state import DeliveryState

        return self.state == DeliveryState.REVIEW.label

    @property
    def title(self) -> str:
        """The headline that supersedes the acceptance this run was given.

        Two endings, two headlines, because they are not the same news. A stage
        that blocks leaves nothing to look at, and "the run did not finish" is
        exactly what happened. A stage the engine sends to ``Review`` leaves a
        worktree full of work in the column whose whole purpose is a person
        reading it — telling that person the run did not finish is false, and it
        was the same sentence a snapshot failure got.

        Names the requirement once, either way.
        """
        if self.reviewable:
            return f"{self.req_id}: released, and the run needs a look"
        return f"{self.req_id}: released, but the run did not finish"

    @property
    def details(self) -> tuple[str, ...]:
        """Where it stopped, where that left the card, and what to do next.

        The remedy follows the same fork as the headline. "Release it again" is
        the way back from a blocked run and is close to meaningless from
        ``Review``, which may not even offer that move — the work exists, and
        what it wants is the reading the column is named after.

        What is deliberately unspecific in both is the *cause*: the reason above
        these lines is the engine's own sentence about a stage this side did not
        run, so naming a cure here would be a guess.
        """
        lines: list[str] = []
        if self.stage:
            lines.append(
                f"Its {self.stage} stage failed, and what the run produced is still there."
                if self.reviewable
                else f"It stopped at the {self.stage} stage."
            )
        lines.append(
            f"The card is in {self.state} now, and nothing is running for it."
            if self.state
            else "Nothing is running for it now.",
        )
        lines.append(
            "Review what it produced, then decide where it goes."
            if self.reviewable
            else "Fix what this message names, then release it again.",
        )
        return tuple(lines)


@runtime_checkable
class FlowReporting(Protocol):
    """A run starter that says how the work it dispatched ended (SWR-3601).

    Structural like :class:`QueueDraining` and :class:`RunPreflight`, and for the
    same reason: a starter that finishes in front of its caller has no later
    ending to report, and widening :class:`RunStarter` would hand every
    implementation a promise only a dispatching one can keep.
    """

    def report_flows(self, ended: Callable[[FlowEnded], None]) -> None:
        """Call *ended* when a dispatched flow finishes, on the flow's thread."""
        ...


@runtime_checkable
class StageReporting(Protocol):
    """A run starter that says what its flows are *doing* (SWR-3413).

    :class:`FlowReporting` says how a flow ended, which is the wrong grain for
    the surface that shows a requirement sitting in ``Running``: a flow spends
    minutes in analysis and decomposition before a unit store exists, and a
    board reading only the persisted stores has nothing to show for any of it.
    The engine already emits a
    :class:`~rotaris_core.requirements.execution.flow.StageEvent` per stage with
    its duration; this is the seam that lets a consumer subscribe.

    Structural, like the protocols beside it, so a non-dispatching starter — a
    headless composition, a double — is simply not one of these.
    """

    def report_stages(self, staged: Callable[[StageEvent], None]) -> None:
        """Call *staged* for each stage event, on the flow's own thread."""
        ...


@runtime_checkable
class RunsInFlight(Protocol):
    """A run starter that can say what it is running right now (SWR-3611).

    Structural for the same reason as :class:`FlowReporting`, and asked for the
    same kind of reason: the recovery pass frees requirements left in ``Running``
    by a process that is gone, and the one thing that tells a live flow from an
    abandoned one — before its first run record has a session to probe — is that
    this very process is driving it. A starter that runs nothing in the
    background has nothing to answer and is not asked.
    """

    @property
    def in_flight(self) -> tuple[str, ...]:
        """The requirements this starter is running, in id order."""
        ...


# ── what one action produced ───────────────────────────────────────────────


@traces(SWR.SWR_3601, SWR.SWR_3602, SWR.SWR_3610)
@dataclass(frozen=True)
class ActionOutcome:
    """What one board action produced: a change, or a stated refusal.

    Never both and never neither. On a refusal :attr:`reason` is the engine's own
    precondition and :attr:`snap_back` is ``True``, which is what returns the card
    to the column it came from (SWR-3601).
    """

    action: str
    req_id: str
    accepted: bool
    source: str = ""
    target: str = ""
    #: The engine's stated precondition, on a refusal. Never a board-side gloss.
    reason: str = ""
    #: Each unmet condition, and the refusal's own detail (SWR-3215).
    details: tuple[str, ...] = ()
    refusal_kind: str = ""
    #: The run this action started, when it started one (SWR-3601).
    run_id: str = ""
    #: Whether an attributed record was written for it (SWR-3610).
    recorded: bool = False
    #: A consequence that happened *after* an accepted transition and failed —
    #: a run that could not be launched. The state moved; the work did not.
    failure: str = ""
    #: Something the started run will run into that did not stop it (SWR-2508).
    #: Distinct from :attr:`failure`: the work *did* start, and this is what a
    #: user should know before waiting on it rather than after.
    caveat: str = ""

    @property
    def snap_back(self) -> bool:
        """Whether the card returns to the column it was dragged out of."""
        return not self.accepted and bool(self.target)

    @property
    def started_work(self) -> bool:
        """Whether a run is now in flight because of this action."""
        return bool(self.run_id)

    @property
    def title(self) -> str:
        """The headline of the feedback this outcome produces."""
        name = BoardAction(self.action).label.lower() if self.action else "this move"
        if self.accepted and self.failure:
            return f"{self.req_id}: {name} succeeded but the work did not start"
        if self.accepted:
            return f"{self.req_id}: {name} accepted"
        return f"{self.req_id}: {name} refused"

    @traces(SWR.SWR_3602)
    def feedback(self) -> ActionFeedback:
        """This outcome as the board states it — persistent, and actionable.

        Persistent rather than a toast (SWR-3602): a refusal a user did not read
        is a refusal they will repeat. A plain acceptance produces feedback too,
        so "the drop worked" is a stated fact and not the absence of an error —
        and an acceptance that *started work* names the run, because SWR-3601
        asks for the work starting to be visible rather than for a moved card.
        """
        started = (f"Started run {self.run_id}",) if self.run_id else ()
        # After the run id, because the run starting is the news and this is a
        # qualification of it (SWR-2508).
        caveat = (self.caveat,) if self.caveat else ()
        return ActionFeedback(
            req_id=self.req_id,
            action=self.action,
            title=self.title,
            reason=self.reason or self.failure,
            details=(*self.details, *started, *caveat),
            source=self.source,
            target=self.target,
            accepted=self.accepted,
            # A refusal is the board working, not the board failing (SWR-3602):
            # only a consequence that broke *after* an accepted transition is an
            # error, because then the state and the work disagree.
            severity="error" if self.failure else ("success" if self.accepted else "warning"),
        )


def _utc_now() -> dt.datetime:
    return dt.datetime.now(dt.UTC)


@traces(SWR.SWR_3601, SWR.SWR_3602, SWR.SWR_3609, SWR.SWR_3610)
class RequirementActions:
    """The board's write path: one entry, one door, one record per action.

    Everything is injected. *transitions* is the guarded write path (SWR-3403),
    *runs* starts the engine's flow, *hash_for* answers "what does this
    requirement say right now" so the record names the version it acted on
    (SWR-3610), and *delivery_for* supplies the delivering run's satisfied
    record — built from the run's **snapshot** (SWR-3402, SWR-3204), which is
    why the board cannot make one up: a requirement with no delivering run
    simply has none, and the engine then refuses ``Done`` naming exactly that.

    The class holds no state of its own beyond its collaborators. That is
    deliberate — an action service that remembered which requirement it had just
    moved would be a second, quietly diverging copy of the delivery store.
    """

    #: Stated as a value so a guard test can assert it rather than read prose:
    #: this surface offers no way to force ``Done`` (SWR-3609).
    offers_override: bool = False

    def __init__(
        self,
        transitions: TransitionPort,
        *,
        runs: RunStarter | None = None,
        hash_for: Callable[[str], str] | None = None,
        delivery_for: Callable[[str], SatisfiedDelivery | None] | None = None,
        proposals: ProposalPort | None = None,
        changes: ChangeWorkPort | None = None,
        actor_name: str = "",
        clock: Callable[[], dt.datetime] | None = None,
    ) -> None:
        if not bool(getattr(transitions, "enforces_specification_guard", False)):
            raise ValueError(f"{type(transitions).__name__} {UNGUARDED_WRITER}")
        self._transitions = transitions
        self._runs = runs
        self._hash_for = hash_for
        self._delivery_for = delivery_for
        self._proposals = proposals
        self._changes = changes
        self._actor_name = actor_name.strip()
        self._clock: Callable[[], dt.datetime] = clock if clock is not None else _utc_now

    @property
    @traces(SWR.SWR_3610)
    def actor(self) -> DeliveryActor:
        """Who these actions are recorded as — a person, never "system".

        The distinction SWR-3610 exists for: an audit trail whose entries all say
        ``system`` cannot answer "who released this", and the human entries are
        exactly the ones a later reader needs to find.
        """
        from rotaris_core.requirements.delivery.state import DeliveryActor

        return DeliveryActor.user(self._actor_name)

    @property
    def starts_runs(self) -> bool:
        """Whether a release can actually start work from here."""
        return self._runs is not None

    @property
    @traces(SWR.SWR_3616)
    def changes(self) -> ChangeWorkPort | None:
        """Where this workspace's change-work offers are read (SWR-3616).

        Exposed for the detail surface, which *presents* an offer and is the only
        place a user meets one. ``None`` when the workspace keeps no requirement
        store, and then a card states that rather than showing an empty box.
        """
        return self._changes

    @property
    @traces(SWR.SWR_3613)
    def proposals(self) -> ProposalPort | None:
        """Where this workspace's derived-requirement offers wait (SWR-3613).

        Exposed for the review surface, which *presents* the offers and is the
        only place a user meets one. ``None`` when the workspace has nowhere to
        keep them, and then a review states that rather than showing an empty
        box.
        """
        return self._proposals

    @property
    @traces(SWR.SWR_3413)
    def runs(self) -> RunStarter | None:
        """The starter a release goes to, so a later surface can bound it.

        Exposed for exactly one caller: the queue, whose controls decide how much
        may run at once and whether anything may start at all (SWR-3608). A stop
        that never reached the thing that starts runs would be a control the user
        can see and the product ignores.
        """
        return self._runs

    # ── the pure half a drag needs before anything is applied ─────────────

    @traces(SWR.SWR_3601)
    def begin(
        self,
        action: BoardAction,
        req_id: str,
        *,
        source: str = "",
        target: str = "",
    ) -> PendingAction:
        """What the card shows while the engine is answering (SWR-3601)."""
        return PendingAction(
            req_id=req_id,
            action=str(action),
            label=f"{action.progress_label} {req_id}".strip(),
            source=source,
            target=target or _TARGETS.get(action, ""),
        )

    # ── the write path ────────────────────────────────────────────────────

    @traces(SWR.SWR_3601, SWR.SWR_3602)
    def move(
        self,
        req_id: str,
        *,
        source: str,
        target: str,
        reason: str = "",
        instructions: str = "",
    ) -> ActionOutcome:
        """Perform the drop of *req_id* from column *source* onto column *target*.

        A move the board has no name for is still *asked*: every user-legal edge
        of the matrix has a :class:`BoardAction`, so an unnamed move is one the
        engine will refuse — and asking it means the sentence the user reads is
        the transition function's own rather than a board-side paraphrase of the
        matrix (SWR-3602). The matrix' own wording is used for the pre-drag
        indication, where there is nothing to ask yet.
        """
        action = action_for_move(source, target)
        if action is None:
            return self._refused_by_engine(req_id, source=source, target=target)
        return self.perform(
            action,
            req_id,
            source=source,
            target=target,
            reason=reason,
            instructions=instructions,
        )

    @traces(SWR.SWR_3601, SWR.SWR_3609, SWR.SWR_3610)
    def perform(
        self,
        action: BoardAction,
        req_id: str,
        *,
        source: str = "",
        target: str = "",
        reason: str = "",
        instructions: str = "",
        detail: str = "",
    ) -> ActionOutcome:
        """Perform one board action. The single entry every write goes through.

        Single on purpose (SWR-3610): a surface that reached the transition
        function directly would be an action nobody attributed, and the
        completeness sweep over :class:`BoardAction` would not see it.
        """
        if not action.changes_state:
            return ActionOutcome(
                action=str(action),
                req_id=req_id,
                accepted=True,
                source=source,
                target=source,
                details=(action.consequence,),
            )
        if action is BoardAction.ACCEPT_PROPOSAL:
            return self._accept_proposal(req_id, detail, reason=reason)
        if action is BoardAction.ACCEPT_CHANGE_WORK:
            return self._accept_change_work(req_id, reason=reason)
        if action is BoardAction.ANSWER_BLOCKER:
            return self._answer_blocker(req_id, source=source, target=target, answer=reason)
        if action.transitions:
            return self._transition(
                action,
                req_id,
                source=source,
                target=target,
                reason=reason,
                instructions=instructions,
                detail=detail,
            )
        return self._record(action, req_id, reason=reason, detail=detail)

    @traces(SWR.SWR_3613, SWR.SWR_3609, SWR.SWR_3610)
    def _accept_proposal(self, req_id: str, key: str, *, reason: str = "") -> ActionOutcome:
        """Create the technical requirement a run offered for *req_id* (SWR-3613).

        The only path that writes one. Nothing creates a derived requirement
        without passing through here, which is what makes "offered, never
        written silently" a property of the code rather than a promise — and it
        goes through :meth:`_record`, so the acceptance is attributed to the
        person who made it (SWR-3610) exactly like every other board action.
        """
        port = self._proposals
        if port is None:
            return ActionOutcome(
                action=str(BoardAction.ACCEPT_PROPOSAL),
                req_id=req_id,
                accepted=False,
                reason=(
                    "This workspace keeps no requirement proposals, so there is nothing to accept."
                ),
            )
        outcome = port.accept(req_id, key)
        if not outcome.accepted:
            return ActionOutcome(
                action=str(BoardAction.ACCEPT_PROPOSAL),
                req_id=req_id,
                accepted=False,
                # The engine's own sentence, carried verbatim (SWR-3602).
                reason=outcome.message,
                details=outcome.details,
            )
        recorded = self._record(
            BoardAction.ACCEPT_PROPOSAL,
            req_id,
            reason=reason,
            detail=outcome.message,
        )
        return replace(
            recorded,
            details=(*recorded.details, *outcome.details, f"Created {outcome.created_id}"),
        )

    @traces(SWR.SWR_3616, SWR.SWR_3505, SWR.SWR_3610)
    def _accept_change_work(self, req_id: str, *, reason: str = "") -> ActionOutcome:
        """Carry out what this requirement's change asks for (SWR-3616).

        The board's half of the offer: the engine decides *what* the change costs
        and does it (``accept_change_work``), and this attributes the decision to
        take it to the person who took it (SWR-3610), through the same
        :meth:`_record` every other board action uses.

        The engine's own sentence is carried verbatim, refusal or not — a user
        told "the requirement changed again since this was analysed" knows to
        re-read it, and one told "not allowed" does not (SWR-3602).
        """
        port = self._changes
        if port is None:
            return ActionOutcome(
                action=str(BoardAction.ACCEPT_CHANGE_WORK),
                req_id=req_id,
                accepted=False,
                reason="This workspace keeps no requirement store, so there is nothing to do.",
            )
        outcome = port.accept(req_id, actor=self.actor)
        if not outcome.accepted:
            return ActionOutcome(
                action=str(BoardAction.ACCEPT_CHANGE_WORK),
                req_id=req_id,
                accepted=False,
                reason=outcome.message,
            )
        recorded = self._record(
            BoardAction.ACCEPT_CHANGE_WORK,
            req_id,
            reason=reason,
            detail=outcome.message,
        )
        return replace(
            recorded,
            details=(
                *recorded.details,
                *(f"Planned {unit_id}" for unit_id in outcome.unit_ids),
            ),
        )

    @traces(SWR.SWR_3607, SWR.SWR_3512, SWR.SWR_3507)
    def _answer_blocker(
        self,
        req_id: str,
        *,
        source: str,
        target: str,
        answer: str,
    ) -> ActionOutcome:
        """Answer the escalated question, act on the answer, and let the flow continue.

        Two kinds of blocker arrive here and they are not the same thing.

        A **run** or **dependency** blocker has no stored question: answering it
        is the transition, exactly as before, and *answer* is the reason recorded
        on it (SWR-3607).

        A **decision** (SWR-3512) has one, and until now the answer stopped short
        of it. The card left ``Blocked``, an audit line was written, and the
        engine's question stayed open with the chosen option discarded into free
        text — so choosing "carry out the migration" and choosing "leave the code
        as it is" did the same nothing, and the question came back on the next
        board read, where the already-open guard then suppressed it for good.
        Here the engine is asked to answer it and to do what the option means;
        *what that is* is the engine's call, never this module's
        (:func:`~rotaris_core.requirements.change_host.answer_decision`).

        An answer the engine acted on has already moved the requirement — an
        approved migration releases it for the unit that carries the worklist out
        — so this does not transition it a second time. Refusals come back with
        the engine's own sentence (SWR-3602), the unnamed-person one included:
        SWR-3512 requires a name and raises rather than returns, and a traceback
        is not something a board may show a user in place of an answer.
        """
        port = self._changes
        pending = port.question(req_id) if port is not None else None
        if port is None or pending is None:
            return self._transition(
                BoardAction.ANSWER_BLOCKER,
                req_id,
                source=source,
                target=target,
                reason=answer,
                instructions="",
                detail="",
            )
        outcome = port.answer(req_id, answer, actor=self.actor)
        if not outcome.accepted:
            return ActionOutcome(
                action=str(BoardAction.ANSWER_BLOCKER),
                req_id=req_id,
                accepted=False,
                source=source,
                # The engine's own sentence, carried verbatim (SWR-3602).
                reason=outcome.message,
            )
        recorded = self._record(
            BoardAction.ANSWER_BLOCKER,
            req_id,
            reason=answer,
            detail=outcome.message,
        )
        return replace(
            recorded,
            details=(
                *recorded.details,
                *(f"Planned {unit_id}" for unit_id in outcome.unit_ids),
            ),
        )

    @traces(SWR.SWR_3609)
    def bulk_accept(self, req_ids: Iterable[str]) -> tuple[ActionOutcome, ...]:
        """Accept several requirements, deciding and reporting one by one.

        Not one decision applied to a list (SWR-3609): the completion conditions
        are evaluated per requirement at the moment of its own transition, so a
        bulk accept over three requirements is three transitions, three answers
        and — for the ones that are refused — three named reasons.
        """
        return tuple(
            self.perform(BoardAction.ACCEPT, req_id, source="review") for req_id in req_ids
        )

    # ── convenience, all of it routed through `perform` ───────────────────

    def release(self, req_id: str, *, source: str = "backlog") -> ActionOutcome:
        """Release *req_id* for implementation (SWR-3601)."""
        return self.perform(BoardAction.RELEASE, req_id, source=source, target="ready")

    def accept(self, req_id: str) -> ActionOutcome:
        """Accept a reviewed result — subject to the engine's conditions."""
        return self.perform(BoardAction.ACCEPT, req_id, source="review", target="done")

    @traces(SWR.SWR_3604)
    def send_back(self, req_id: str, instructions: str) -> ActionOutcome:
        """Send the agent back with *instructions*, and carry them into the run.

        The instructions travel twice on purpose: onto the transition's own
        ``detail``, so the audit trail says what the agent was told (SWR-3213),
        and into the run the release starts, so the next attempt actually
        receives them (SWR-3604, SWR-3407).
        """
        return self.perform(
            BoardAction.SEND_BACK,
            req_id,
            source="review",
            target="ready",
            instructions=instructions,
        )

    def hold(self, req_id: str, *, source: str, reason: str) -> ActionOutcome:
        """Block *req_id* with a stated reason (SWR-3201)."""
        return self.perform(BoardAction.HOLD, req_id, source=source, target=BLOCKED, reason=reason)

    @traces(SWR.SWR_3201, SWR.SWR_3710)
    def resume(self, req_id: str, *, blocked_from: str, reason: str = "") -> ActionOutcome:
        """Clear the blocker on *req_id*, and restart the work it stopped.

        Where it returns to is :func:`resume_column`'s answer and never
        *blocked_from* itself — the two differ in exactly the case this matters
        for, a requirement blocked out of ``Running``, which returns to ``Ready``
        (SWR-3201). Returning to ``Ready`` dispatches, because ``Ready`` is the
        state a run starts from and the matrix has no way back into it from
        itself (SWR-3710).
        """
        return self.perform(
            BoardAction.RESUME,
            req_id,
            source=BLOCKED,
            target=resume_column(blocked_from),
            reason=reason,
        )

    def answer_blocker(self, req_id: str, *, target: str, answer: str) -> ActionOutcome:
        """Answer the escalated question and let the flow continue (SWR-3607)."""
        return self.perform(
            BoardAction.ANSWER_BLOCKER,
            req_id,
            source=BLOCKED,
            target=target,
            reason=answer,
        )

    # ── the two halves of a write ─────────────────────────────────────────

    @traces(SWR.SWR_3602)
    def _refused_by_engine(self, req_id: str, *, source: str, target: str) -> ActionOutcome:
        """Ask the engine about a move this board has no name for.

        Always a refusal in practice — every edge a user may take is named — and
        that is the point: the refusal comes back with the state machine's own
        stated precondition instead of this module explaining the matrix in its
        own words.
        """
        from rotaris_core.requirements.delivery.transitions import TransitionRequest

        state = _state(target)
        if state is None:
            return ActionOutcome(
                action="",
                req_id=req_id,
                accepted=False,
                source=source,
                target=target,
                reason=f"{target or 'nowhere'} is not a delivery state.",
            )
        outcome = self._transitions.apply(
            TransitionRequest(
                req_id=req_id,
                target=state,
                actor=self.actor,
                cause=_cause(BoardAction.RELEASE),
                at=self._clock(),
                requirement_hash=self._hash(req_id),
            ),
        )
        refusal = outcome.refusal
        return ActionOutcome(
            action="",
            req_id=req_id,
            accepted=outcome.accepted,
            source=source,
            target=target,
            reason=refusal.precondition if refusal is not None else "",
            details=refusal_lines(refusal) if refusal is not None else (),
            refusal_kind=str(refusal.kind) if refusal is not None else "",
            recorded=outcome.transition is not None,
        )

    def _transition(
        self,
        action: BoardAction,
        req_id: str,
        *,
        source: str,
        target: str,
        reason: str,
        instructions: str,
        detail: str,
    ) -> ActionOutcome:
        from rotaris_core.requirements.delivery.state import DeliveryState as State
        from rotaris_core.requirements.delivery.transitions import TransitionRequest

        wanted = target or _TARGETS.get(action, "")
        state = _state(wanted)
        if state is None:
            return ActionOutcome(
                action=str(action),
                req_id=req_id,
                accepted=False,
                source=source,
                target=wanted,
                reason=f"{wanted or 'nowhere'} is not a delivery state.",
            )
        refused = self._cannot_start(action, req_id)
        if refused:
            return ActionOutcome(
                action=str(action),
                req_id=req_id,
                accepted=False,
                source=source,
                target=str(state),
                reason=refused,
            )
        said = detail or (f"instructions: {instructions}" if instructions else "")
        request = TransitionRequest(
            req_id=req_id,
            target=state,
            actor=self.actor,
            cause=_cause(action),
            at=self._clock(),
            requirement_hash=self._hash(req_id),
            reason=reason,
            # Never fabricated: the delivering run's snapshot is what Done
            # records (SWR-3204, SWR-3402). Without one the engine refuses and
            # says so, which is precisely the guarantee of SWR-3609.
            delivery=self._delivery(req_id) if state is State.DONE else None,
            detail=said,
        )
        outcome = self._transitions.apply(request)
        return self._from_outcome(
            action,
            outcome,
            req_id=req_id,
            source=source,
            target=str(state),
            instructions=instructions,
        )

    def _from_outcome(
        self,
        action: BoardAction,
        outcome: TransitionOutcome,
        *,
        req_id: str,
        source: str,
        target: str,
        instructions: str,
    ) -> ActionOutcome:
        refusal = outcome.refusal
        if refusal is not None:
            return ActionOutcome(
                action=str(action),
                req_id=req_id,
                accepted=False,
                source=source or str(refusal.source),
                target=target,
                # The engine's sentence, carried verbatim (SWR-3602).
                reason=refusal.precondition,
                details=refusal_lines(refusal),
                refusal_kind=str(refusal.kind),
            )
        run_id, failure = self._start(action, req_id, target, instructions=instructions)
        self._let_the_queue_move()
        return ActionOutcome(
            action=str(action),
            req_id=req_id,
            accepted=True,
            source=source,
            target=target,
            run_id=run_id,
            # The port appended the transition's audit record (SWR-3213); this
            # says so rather than writing a second one (SWR-3610).
            recorded=outcome.transition is not None,
            failure=failure,
            caveat=self._caveat(action, req_id) if run_id else "",
        )

    @traces(SWR.SWR_2508, SWR.SWR_3602)
    def _caveat(self, action: BoardAction, req_id: str) -> str:
        """What the run this action started will run into, or ``""``.

        The counterpart of :meth:`_cannot_start`, asked *after* the release
        rather than before it, because what it names does not stop the release —
        see :meth:`FlowRunStarter.caveat_for`.
        """
        if not action.starts_run or not isinstance(self._runs, RunCaveats):
            return ""
        import logging

        try:
            return self._runs.caveat_for(req_id)
        except Exception:  # noqa: BLE001 — a check that broke must not spoil the release
            logging.getLogger(__name__).exception(
                "the caveat check for %s could not run",
                req_id,
            )
            return ""

    @traces(SWR.SWR_3413, SWR.SWR_3602, SWR.SWR_3419)
    def _cannot_start(self, action: BoardAction, req_id: str) -> str:
        """Why this action's run cannot begin at all, asked before the state moves.

        The order is the whole of it. A release writes ``Ready`` and *then* starts
        work, so a condition that was knowable in advance — a workspace with no
        commit for the run to branch from — used to be discovered after the card
        had already moved, and the requirement was left in a delivery state whose
        run never existed. Asked here, the same condition is a refusal: nothing is
        written, nothing is dispatched, and the card returns to the column it came
        from (SWR-3601, SWR-3602).

        Only starters that keep a workspace of their own can answer, and a run
        that fails for a reason nobody could have known in advance is still
        :attr:`ActionOutcome.failure` — this narrows what reaches that path, it
        does not replace it.
        """
        if not action.starts_run or not isinstance(self._runs, RunPreflight):
            return ""
        import logging

        try:
            return self._runs.refusal_for(req_id)
        except Exception:  # noqa: BLE001 — a check that broke must not refuse the move
            logging.getLogger(__name__).exception(
                "the pre-flight check for %s could not run",
                req_id,
            )
            return ""

    @traces(SWR.SWR_3710)
    def _start(
        self,
        action: BoardAction,
        req_id: str,
        target: str,
        *,
        instructions: str,
    ) -> tuple[str, str]:
        """Start the work this action promised. ``(run_id, failure)``.

        Asked of :func:`dispatches_a_run` rather than of the action alone,
        because clearing a blocker starts a run or does not depending on where
        the requirement returns to (SWR-3710). A launch that fails is one
        sentence on the outcome and never a refusal of the move that was already
        accepted — a blocker nobody could clear because the workspace has no
        commit would be a worse trap than the stranded card this removes.
        """
        if not dispatches_a_run(action, target):
            return "", ""
        if self._runs is None:
            return "", (
                "No run host is configured for this workspace, so the requirement "
                "moved but nothing started."
            )
        try:
            return self._runs.start(req_id, instructions=instructions), ""
        except Exception as exc:  # noqa: BLE001 — a failed launch is one sentence to the user
            return "", f"{type(exc).__name__}: {exc}" if str(exc) else type(exc).__name__

    @traces(SWR.SWR_3510, SWR.SWR_3412)
    def _let_the_queue_move(self) -> None:
        """Let a state change release whatever it unblocked (SWR-3510).

        Every board action that the engine accepted can change the scheduler's
        answer, and the one that matters is the accept that makes a requirement
        ``Done``: its dependents become schedulable at that instant, and
        SWR-3510's third criterion says they are released *without user action*.
        The user acted on the dependency; nobody acts on the dependent.

        Costs nothing when there is no queue — a starter with an empty one
        returns immediately — and cannot fail an action that already succeeded:
        the state moved either way, and a queue that could not move is a logged
        fact rather than a refusal a user cannot act on.
        """
        import logging

        if not isinstance(self._runs, QueueDraining):
            return
        try:
            self._runs.drain()
        except Exception:  # noqa: BLE001 — the action succeeded; the queue is secondary
            logging.getLogger(__name__).exception("the requirement queue could not be drained")

    @traces(SWR.SWR_3610)
    def _record(
        self,
        action: BoardAction,
        req_id: str,
        *,
        reason: str,
        detail: str,
    ) -> ActionOutcome:
        """Record an action that changes an artefact rather than a state.

        Editing and creating a requirement write to the project's own store, not
        to Rotaris' delivery state — but they are still board actions with an
        actor, a time and a hash, and SWR-3610 leaves no room for the ones that
        write no record.
        """
        from rotaris_core.requirements.delivery.audit import AuditEvent, AuditEventKind

        event = AuditEvent(
            req_id=req_id,
            kind=AuditEventKind.WRITE_BACK,
            at=self._clock(),
            actor=self.actor,
            reason=reason,
            requirement_hash=self._hash(req_id),
            detail=detail or f"{action.label} from the requirement board",
        )
        self._transitions.record_event(event)
        return ActionOutcome(
            action=str(action),
            req_id=req_id,
            accepted=True,
            recorded=True,
            details=(event.message,),
        )

    def _hash(self, req_id: str) -> str:
        return (self._hash_for(req_id) if self._hash_for is not None else "") or ""

    def _delivery(self, req_id: str) -> SatisfiedDelivery | None:
        return self._delivery_for(req_id) if self._delivery_for is not None else None


@traces(SWR.SWR_3601, SWR.SWR_3609, SWR.SWR_3215, SWR.SWR_3413)
def workspace_actions(
    workspace: Path,
    *,
    runs: RunStarter | None = None,
    actor_name: str = "",
    clock: Callable[[], dt.datetime] | None = None,
    dispatch: Callable[[Callable[[], None]], None] | None = None,
    run_agent: Callable[[str, Path], AgentRunResult] | None = None,
    launcher: SessionLauncher | None = None,
) -> RequirementActions | None:
    """The board's write path over *workspace*, or ``None`` when it has none.

    ``None`` is the honest answer for a project that keeps no requirement store
    Rotaris can write: the board still reads (through another source, or not at
    all) and every action states that there is nowhere to write to, rather than
    failing at the moment a user drags a card.

    This is the **one production composition** of the requirement feature, and
    every part of the engine a board gesture needs is assembled here:

    - the **guarded writer** (SWR-3403) over this workspace's own delivery store
      and audit trail, re-reading the requirement through the registry at the
      moment of each transition — which is what makes "the specification moved
      under the run" detectable rather than assumed;
    - the workspace's **completion gate** (SWR-3215), reading
      :func:`completion_evidence_for` *inside* the transition so ``Done`` is
      answered against evidence as it stands then, not as it stood when the card
      was drawn. The desktop supplies the evidence *reader*, never a verdict, and
      there is still no override anywhere on this side (SWR-3609): every unmet
      condition comes back as the engine's own refusal;
    - the **run starter** (SWR-3413), which is what makes a drop on ``Ready``
      start work rather than only move a card. Its host is
      :class:`AgentRunHost` — the desktop's consumer of the launch seam
      (SWR-3416) — and its isolation is the engine's ``GitIsolation``, so a
      requirement run gets a worktree of its own (SWR-3405);
    - ``delivery_for``, which reads the *reviewable run's* persisted snapshot
      (SWR-3402) and turns it into the satisfied record ``Done`` would store
      (SWR-3204). A requirement with no such run simply has none, and the engine
      then refuses ``Done`` naming exactly that.

    *runs*, *dispatch* and *run_agent* exist for the same reason a clock is
    injected: a caller that has already composed a run host passes it, a test
    runs the flow on the calling thread instead of a worker, and *run_agent*
    replaces the **one external system** in the whole composition — the agent
    itself. Everything else, including the completion gate, the flow, the launch
    seam, the Git worktree and the check suite, is the shipped object either way.
    Passing none of the three is the shipped path.
    """
    from rotaris_core.requirements.change_host import WorkspaceChanges
    from rotaris_core.requirements.delivery.audit import AuditStore
    from rotaris_core.requirements.delivery.completion import completion_gate
    from rotaris_core.requirements.delivery.satisfied import SatisfiedDelivery as Delivered
    from rotaris_core.requirements.delivery.store import DeliveryStore
    from rotaris_core.requirements.execution.reader import (
        WorkspaceExecution,
        completion_evidence_for,
    )
    from rotaris_core.requirements.execution.snapshot import ExecutionTransitions, SnapshotStore
    from rotaris_core.requirements.memory import RegistryMemory
    from rotaris_core.requirements.registry import RequirementRegistry
    from rotaris_core.requirements.sources.base import history_of

    source = requirement_source_for(workspace)
    if source is None:
        return None
    history = history_of(source)
    # With the workspace's memory (SWR-3119): a removal noticed in one session is
    # still a removal in the next one, and a board reopened tomorrow does not
    # re-report every id the project ever deleted.
    registry = RequirementRegistry([source], memory=RegistryMemory(workspace))
    delivery = DeliveryStore(workspace)
    snapshots = SnapshotStore(workspace)
    ticking: Callable[[], dt.datetime] = clock if clock is not None else _utc_now

    def current_for(req_id: str) -> CanonicalRequirement | None:
        # Re-read, never cached: the whole point of the guard is a value that may
        # have moved since the run started (SWR-3403). The registry refresh is
        # incremental (SWR-3116), so this is a stat sweep rather than a re-parse.
        return registry.refresh().requirement(req_id)

    def execution() -> WorkspaceExecution:
        # A reader per question, deliberately: it caches within one pass, and a
        # long-lived one would answer the completion gate from the records as
        # they stood when the board was drawn (SWR-3215).
        return WorkspaceExecution(
            workspace,
            delivery=delivery,
            requirement_for=registry.index.requirement,
        )

    def delivery_for(req_id: str) -> SatisfiedDelivery | None:
        review = execution().review_for(req_id)
        if review is None or not review.run_id:
            return None
        snapshot = snapshots.load(review.run_id)
        if snapshot is None:
            return None
        return Delivered.from_snapshot(snapshot, run_id=review.run_id, at=ticking())

    def hash_for(req_id: str) -> str:
        requirement = current_for(req_id)
        return requirement.current_hash if requirement is not None else ""

    def evidence_for(
        _record: object,
        request: TransitionRequest,
    ) -> CompletionEvidence:
        return completion_evidence_for(
            execution(),
            request.req_id,
            current_hash=hash_for(request.req_id),
        )

    transitions = ExecutionTransitions(
        delivery,
        current_for=current_for,
        audit=AuditStore(workspace),
        completion=completion_gate(evidence_for),
    )
    return RequirementActions(
        transitions,
        runs=(
            runs
            if runs is not None
            else FlowRunStarter(
                workspace,
                transitions=transitions,
                current_for=current_for,
                host=(
                    AgentRunHost(workspace, run_agent=run_agent) if run_agent is not None else None
                ),
                launcher=launcher,
                dispatch=dispatch,
                proposals=WorkspaceProposals(workspace, clock=clock),
                clock=clock,
            )
        ),
        hash_for=hash_for,
        delivery_for=delivery_for,
        # Where a finished run's derived-requirement offers wait, and the one
        # path that turns one into a requirement (SWR-3613).
        proposals=WorkspaceProposals(workspace, clock=clock),
        # What a *change* asks for, and the one path that carries it out
        # (SWR-3616). The source's own history is what lets the offer be rebuilt
        # and re-checked at the moment it is accepted (SWR-3514); a source that
        # keeps none refuses the acceptance rather than acting on an analysis
        # nobody can reproduce.
        changes=WorkspaceChanges(
            workspace,
            current_for=current_for,
            version_at=(history.read_requirement_at if history is not None else None),
        ),
        actor_name=actor_name,
        clock=clock,
    )


def _cause(action: BoardAction) -> TransitionCause:
    """The recorded cause of this action's transition (SWR-3203, SWR-3213)."""
    from rotaris_core.requirements.delivery.state import TransitionCause as Cause

    return {
        BoardAction.ACCEPT: Cause.COMPLETION_ACCEPTED,
        BoardAction.HOLD: Cause.BLOCKER_RAISED,
        BoardAction.RESUME: Cause.BLOCKER_CLEARED,
        BoardAction.ANSWER_BLOCKER: Cause.BLOCKER_CLEARED,
    }.get(action, Cause.USER_ACTION)


# ── which store this workspace's requirements come from (SWR-3103, SWR-3106) ─


#: Where an accepted discovery proposal is persisted (SWR-3106). One file, in the
#: workspace's own state directory, holding configuration and never requirement
#: text (SWR-3114).
REQUIREMENT_SOURCE_FILENAME = "requirement-source.json"


@traces(SWR.SWR_3106, SWR.SWR_3103, SWR.SWR_3104)
def requirement_source_path(workspace: Path) -> Path:
    """The file a workspace's configured requirement source is written to."""
    return workspace / ".rotaris" / REQUIREMENT_SOURCE_FILENAME


@traces(SWR.SWR_3106, SWR.SWR_3103, SWR.SWR_3115, SWR.SWR_3123)
def requirement_source_for(workspace: Path) -> RequirementSource | None:
    """The source this workspace's requirements are read from, or ``None``.

    A **configured** source wins. SWR-3106's third acceptance criterion is that
    once a proposal is persisted, subsequent loads use the configuration and run
    no analysis — which needs a loader, and this is it. Without one the
    proposal a user accepted would be a file nothing reads, and a project whose
    requirements do not live in a ReqToCode store would stay unreadable however
    carefully it was described.

    Which adapter the configuration builds follows from its kind (SWR-3123): a
    field mapping loads declaratively, a pinned parser loads through the parser
    host. Both answer the same protocol and everything downstream is indifferent.

    Otherwise the built-in ReqToCode store (SWR-3103), selected automatically for
    the projects that keep one, and ``None`` for a workspace that has neither.

    A configured source that cannot be read raises rather than falling back:
    reading a *different* store than the one configured is the one outcome worse
    than saying so.
    """
    from rotaris_core.requirements.sources.declarative import DeclarativeSource
    from rotaris_core.requirements.sources.discovery import JsonProposalStore
    from rotaris_core.requirements.sources.generated import (
        GeneratedParserConfig,
        GeneratedParserSource,
    )
    from rotaris_core.requirements.sources.reqtocode import reqtocode_source_for

    configured = JsonProposalStore(requirement_source_path(workspace)).load()
    if isinstance(configured, GeneratedParserConfig):
        return GeneratedParserSource(workspace, configured)
    if configured is not None:
        return DeclarativeSource(workspace, configured)
    return reqtocode_source_for(workspace)


# ── the completion evidence the gate reads (SWR-3215) ──────────────────────


# ── the technical requirements a run offers (SWR-3411, SWR-3613) ───────────


@traces(SWR.SWR_3411, SWR.SWR_3613)
@dataclass(frozen=True)
class RequirementProposal:
    """One technical requirement a run offered, waiting for a reviewer.

    An offer, never a write (SWR-3613): the run discovered a lasting obligation
    and said so, and the requirement exists only once somebody accepts it.

    :attr:`permanence` and :attr:`transience` are the engine's own sentences
    (``DerivedArtifactKind.explanation``), carried rather than paraphrased — the
    difference SWR-3411 asks Rotaris to state wherever a proposal is presented
    is decided in one place and printed here.
    """

    #: The requirement whose run proposed this — the origin of the derivation.
    req_id: str
    #: How this proposal is named when it is accepted. Stable within an origin.
    key: str
    title: str
    rationale: str = ""
    epic: str = ""
    run_id: str = ""
    unit_id: str = ""
    permanence: str = ""
    transience: str = ""

    @property
    @traces(SWR.SWR_3411, SWR.SWR_3613)
    def sentence(self) -> str:
        """The offer, with the difference between the two kinds stated in it."""
        because = f" It is needed because {self.rationale}" if self.rationale else ""
        contrast = f" Not an execution unit: {self.transience}." if self.transience else ""
        return f"{self.title} — {self.permanence}.{contrast}{because}"

    def as_record(self) -> dict[str, str]:
        """This offer as flat values, for the store below."""
        return {
            "req_id": self.req_id,
            "key": self.key,
            "title": self.title,
            "rationale": self.rationale,
            "epic": self.epic,
            "run_id": self.run_id,
            "unit_id": self.unit_id,
            "permanence": self.permanence,
            "transience": self.transience,
        }


@traces(SWR.SWR_3613)
@dataclass(frozen=True)
class ProposalOutcome:
    """What accepting one offer produced: a requirement, or a stated refusal."""

    accepted: bool
    #: The id the store issued for the created requirement.
    created_id: str = ""
    message: str = ""
    details: tuple[str, ...] = ()


@runtime_checkable
@traces(SWR.SWR_3616)
class ChangeWorkPort(Protocol):
    """What a change asks for, and the one call that carries it out (SWR-3616).

    A port for the same reason the transition writer is one: the detail surface
    *reads* an offer and the board's write path *accepts* it, and neither may
    reach into the engine to do it. The production implementation is
    :class:`~rotaris_core.requirements.change_host.WorkspaceChanges`.
    """

    def pending(self, req_id: str) -> ChangeOffer | None:
        """The offer *req_id* carries, or ``None`` when it carries none."""
        ...

    def accept(self, req_id: str, *, actor: DeliveryActor) -> OfferOutcome:
        """Carry the offer out, attributed to *actor*."""
        ...

    def question(self, req_id: str) -> PendingDecision | None:
        """The question *req_id* is waiting on, or ``None`` when it waits on none."""
        ...

    def answer(self, req_id: str, option: str, *, actor: DeliveryActor) -> OfferOutcome:
        """Answer that question with *option*, and do what the option means."""
        ...


@runtime_checkable
class ProposalPort(Protocol):
    """Where a run's offers wait, and how one becomes a requirement (SWR-3613).

    A port rather than a concrete store, for the same reason the transition
    writer is one: the review surface reads offers and the board's write path
    accepts them, and neither may reach into the engine to do it.
    """

    def pending(self, req_id: str) -> tuple[RequirementProposal, ...]:
        """Every offer still waiting for a decision on *req_id*."""
        ...

    def offer(self, proposals: Sequence[RequirementProposal]) -> tuple[RequirementProposal, ...]:
        """Record what a finished run proposed, without writing any of it."""
        ...

    def accept(self, req_id: str, key: str) -> ProposalOutcome:
        """Create the offered requirement, or state why it was not created."""
        ...


#: Where the offers of one workspace wait. Desktop-owned state under the
#: workspace's own directory, the way every other desktop-only convenience is.
PROPOSALS_FILE = "requirement-proposals.json"


@traces(SWR.SWR_3411, SWR.SWR_3613, SWR.SWR_3112)
class WorkspaceProposals:
    """The offers one workspace is holding, and the write that accepts one.

    Two halves that deliberately do not touch: :meth:`offer` is what a finished
    run calls, and it writes **nothing** into the requirement store — SWR-3613's
    whole point is that a proposal is presented rather than applied. The write
    happens in :meth:`accept`, through the source's own
    :class:`~rotaris_core.requirements.writeback.RequirementWriteBack`
    (SWR-3112), which is the same path a user's "new requirement" takes and the
    reason a Rotaris-derived requirement passes the store's own check.

    ``requirements.human_in_the_loop.confirm_source_writes`` is deliberately not
    consulted here (SWR-3613). Its justification is that the write is already a
    user action — which becomes true of this path exactly when the offer exists,
    and this is the offer. The flag keeps its meaning everywhere else.
    """

    def __init__(self, workspace: Path, *, clock: Callable[[], dt.datetime] | None = None) -> None:
        self._workspace = workspace
        self._clock: Callable[[], dt.datetime] = clock if clock is not None else _utc_now

    @property
    def path(self) -> Path:
        """The file the offers live in."""
        return self._workspace / ".rotaris" / PROPOSALS_FILE

    @traces(SWR.SWR_3613)
    def pending(self, req_id: str) -> tuple[RequirementProposal, ...]:
        """Every offer still waiting for a decision on *req_id*."""
        return tuple(
            proposal for proposal in self._load() if not req_id or proposal.req_id == req_id
        )

    @traces(SWR.SWR_3411, SWR.SWR_3613)
    def offer(self, proposals: Sequence[RequirementProposal]) -> tuple[RequirementProposal, ...]:
        """Record *proposals* as waiting, replacing the ones for the same origins.

        Replacing rather than appending: a second run over the same requirement
        answers the same question again, and two generations of the same offer
        would ask the reviewer to decide twice about one obligation.
        """
        origins = {proposal.req_id for proposal in proposals}
        kept = [proposal for proposal in self._load() if proposal.req_id not in origins]
        stored = tuple([*kept, *proposals])
        self._save(stored)
        return tuple(proposals)

    @traces(SWR.SWR_3613)
    def withdraw(self, req_id: str, key: str) -> RequirementProposal | None:
        """Take one offer off the list, whatever became of it."""
        held = self._load()
        found = next(
            (item for item in held if item.req_id == req_id and item.key == key),
            None,
        )
        if found is not None:
            self._save(tuple(item for item in held if item is not found))
        return found

    @traces(SWR.SWR_3411, SWR.SWR_3613, SWR.SWR_3112, SWR.SWR_3105)
    def accept(self, req_id: str, key: str) -> ProposalOutcome:
        """Create the offered requirement through the source's own write path.

        A refusal — a read-only source (SWR-3105), a draft the store's own check
        rejects (SWR-2331) — comes back as the engine's own sentence and leaves
        the offer standing, so the reviewer can act on the reason rather than
        losing the proposal to it.
        """
        from rotaris_core.requirements.delivery.audit import AuditEvent, AuditEventKind, AuditStore
        from rotaris_core.requirements.delivery.state import DeliveryActor
        from rotaris_core.requirements.execution.derivation import (
            RequirementDerivation,
            TechnicalRequirementProposal,
        )

        offer = next(
            (item for item in self._load() if item.req_id == req_id and item.key == key),
            None,
        )
        if offer is None:
            return ProposalOutcome(
                accepted=False,
                message=(
                    f"{req_id} has no technical requirement waiting under {key!r};"
                    " it may already have been accepted."
                ),
            )
        source = requirement_source_for(self._workspace)
        if source is None:
            return ProposalOutcome(
                accepted=False,
                message=(
                    "This workspace has no requirement store Rotaris can write, "
                    "so the proposed technical requirement cannot be created."
                ),
            )
        outcome = RequirementDerivation(
            _write_back_for(source),
            source_id=source.source_id,
        ).derive(
            TechnicalRequirementProposal(
                origin=offer.req_id,
                title=offer.title,
                description=offer.rationale,
                rationale=offer.rationale,
                epic=offer.epic or None,
                run_id=offer.run_id,
                unit_id=offer.unit_id or None,
            ),
        )
        if outcome.created is None:
            return ProposalOutcome(accepted=False, message=outcome.message)
        self.withdraw(req_id, key)
        # The origin's own audit trail says a requirement was derived from it,
        # which is where SWR-3411's "distinguishable from a unit" becomes
        # visible to a reader (SWR-3213).
        AuditStore(self._workspace).append(
            AuditEvent(
                req_id=req_id,
                kind=AuditEventKind.WRITE_BACK,
                at=self._clock(),
                actor=DeliveryActor.system("requirement-derivation"),
                detail=outcome.created.message,
            ),
        )
        return ProposalOutcome(
            accepted=True,
            created_id=outcome.created.req_id,
            message=outcome.created.message,
            details=(outcome.created.link.message,),
        )

    def _load(self) -> tuple[RequirementProposal, ...]:
        import json

        path = self.path
        if not path.exists():
            return ()
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            # An unreadable offer list is an empty one: it must never be the
            # thing that stops a review from opening.
            return ()
        if not isinstance(payload, list):
            return ()
        return tuple(
            RequirementProposal(
                req_id=str(item.get("req_id", "")),
                key=str(item.get("key", "")),
                title=str(item.get("title", "")),
                rationale=str(item.get("rationale", "")),
                epic=str(item.get("epic", "")),
                run_id=str(item.get("run_id", "")),
                unit_id=str(item.get("unit_id", "")),
                permanence=str(item.get("permanence", "")),
                transience=str(item.get("transience", "")),
            )
            for item in payload
            if isinstance(item, dict) and item.get("req_id") and item.get("key")
        )

    def _save(self, proposals: tuple[RequirementProposal, ...]) -> None:
        import json
        import os

        path = self.path
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(".tmp")
        with temporary.open("w", encoding="utf-8") as handle:
            json.dump([proposal.as_record() for proposal in proposals], handle, indent=2)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)


@traces(SWR.SWR_3411, SWR.SWR_3613, SWR.SWR_3117)
def offer_technical_requirements(
    workspace: Path,
    req_id: str,
    *,
    run_ids: Sequence[str] = (),
    proposals: ProposalPort | None = None,
) -> tuple[RequirementProposal, ...]:
    """Ask what lasting obligation this requirement's runs created, and offer it.

    **When this happens is the decision, and it is this: at the end of the run
    that created the obligation, on that run's own thread.** SWR-3411 leaves the
    moment open — it says an execution *run* may propose — so three moments were
    possible and two are wrong. At release there is nothing to propose *from*:
    the evidence a proposal must rest on is what the run changed. On a later
    gesture it would be a model call on the Qt thread, which is the defect the
    review path is fixed for. What is left is the moment the run ends, which is
    also the only moment at which the answer can have changed.

    **What it does at that moment is offer, never write** (SWR-3613). The
    proposal is recorded as waiting, the review of its origin presents it, and
    the requirement exists only once a reviewer accepts it — which is what makes
    SWR-3411's promise that a proposal is *presented*, with the difference
    between a permanent requirement and a disposable unit stated, true.

    It cannot fail the run either way: a source that refuses, a model that is
    unreachable and a configuration that cannot be read all come back as no
    offer at all, which is also what a run that created no obligation answers.
    """
    from rotaris_core.config.loader import load_config
    from rotaris_core.requirements.analysis.analysts import (
        DerivationAnalyst,
        deferred_completion,
    )
    from rotaris_core.requirements.analysis.persona import (
        PersonaResolutionError,
        resolve_analyst,
    )
    from rotaris_core.requirements.execution.derivation import (
        DerivationRequest,
        DerivedArtifactKind,
        RequirementDerivation,
    )
    from rotaris_core.requirements.execution.history import ExecutionHistory

    source = requirement_source_for(workspace)
    if source is None:
        return ()
    wanted = set(run_ids)
    runs = [
        record
        for record in ExecutionHistory(workspace).load(req_id).succeeded
        if not wanted or record.run_id in wanted
    ]
    if not runs:
        return ()

    config = load_config(workspace)
    try:
        resolved = resolve_analyst(config, DerivationAnalyst.JOB)
    except PersonaResolutionError:
        # No persona, so nothing is asked and nothing is proposed — the same
        # answer a run that created no obligation gives, and the honest one.
        return ()
    last = runs[-1]
    deriver = RequirementDerivation(
        _write_back_for(source),
        source_id=source.source_id,
        model=DerivationAnalyst(resolved, completion=deferred_completion(config, resolved)),
        persona=resolved.persona,
    )
    proposed = deriver.propose(
        DerivationRequest(
            req_id=req_id,
            run_id=last.run_id,
            unit_id=last.unit_id or None,
            # Every file this flow's runs touched, not only the last one's: the
            # obligation may have been created by the unit that finished first.
            changed_files=tuple(sorted({path for run in runs for path in run.changed_files})),
            agent_summary=last.agent_summary,
        ),
    )
    if not proposed:
        return ()
    offers = tuple(
        RequirementProposal(
            req_id=req_id,
            key=f"{last.run_id or 'run'}:{index}",
            title=proposal.title,
            rationale=proposal.rationale or proposal.description,
            epic=proposal.epic or "",
            run_id=proposal.run_id or last.run_id,
            unit_id=proposal.unit_id or "",
            permanence=DerivedArtifactKind.TECHNICAL_REQUIREMENT.explanation,
            transience=DerivedArtifactKind.UNIT.explanation,
        )
        for index, proposal in enumerate(proposed, start=1)
    )
    port = proposals if proposals is not None else WorkspaceProposals(workspace)
    return port.offer(offers)


def _write_back_for(source: RequirementSource) -> RequirementWriteBack:
    """The write path for one source (SWR-3112), built where it is used."""
    from rotaris_core.requirements.writeback import RequirementWriteBack as WriteBack

    return WriteBack([source])


@traces(SWR.SWR_3316, SWR.SWR_3605, SWR.SWR_3606)
def workspace_editing(workspace: Path) -> RequirementEditing | None:
    """The one production composition of the requirement **editor** (SWR-3316).

    The sibling of :func:`workspace_actions`, and deliberately a second function
    rather than a field on it: an editor writes requirement *text* through the
    source's own adapter (SWR-3111, SWR-3112), while the actions write *delivery
    state* through the transition matrix. They share a source and nothing else,
    and a project can perfectly well have one without the other.

    ``None`` when this workspace declares no requirement source Rotaris can
    reach — the same answer, for the same reason, that ``workspace_actions``
    gives.
    """
    from rotaris.services.requirement_editing import RequirementEditing as Editing

    source = requirement_source_for(workspace)
    if source is None:
        return None
    return Editing(_write_back_for(source))


# ── what runs next, and why everything else does not (SWR-3412) ────────────


@traces(SWR.SWR_3412, SWR.SWR_3406, SWR.SWR_3510, SWR.SWR_3511, SWR.SWR_3608)
def schedule_now(
    workspace: Path,
    *,
    limits: SchedulerLimits,
    requirement_for: Callable[[str], CanonicalRequirement | None] | None = None,
    running: Sequence[RunningUnit] = (),
    releasing: Sequence[str] = (),
    relations: RelationBlockers | None = None,
    at: dt.datetime | None = None,
) -> ScheduleDecision:
    """The scheduler's decision for *workspace*, over the facts on disk right now.

    The one place the desktop turns four stores into the scheduler's inputs, and
    it is deliberately the *only* place: the board shows this decision and the
    starter acts on it, so "what the queue says" and "what actually starts" are
    the same answer from the same pure function
    (:func:`~rotaris_core.requirements.execution.scheduler.schedule`) rather than
    two derivations that can drift.

    Nothing is recomputed that a store already holds — units come from
    ``UnitStore`` (SWR-3401), the runs in flight from ``ExecutionHistory``
    (SWR-3414), the states and priorities from ``DeliveryStore`` (SWR-3201), and
    the dependencies from the requirement's own relations (SWR-3109).

    *running* is what the caller knows and the files do not yet: a flow that has
    been dispatched has no run record until its first unit actually starts, and a
    decision blind to it would select the same work twice. *releasing* is the
    same idea one step earlier — the requirements a caller is releasing in this
    very gesture, counted as ``Ready`` when the delivery store has not recorded
    them yet. Both are inputs, not exceptions: every dependency, limit and
    conflict still applies to them.

    **A requirement nobody has decomposed yet still has one candidate.** Units
    are created by the flow, so a freshly released requirement has none on disk —
    and a decision that therefore said nothing about it could not gate its
    release at all. The candidate stands for the run the release will start, and
    its id is the one the flow will derive for a single-unit plan (SWR-3401), not
    an invented one, so the queue names the same unit before and after.

    That placeholder models the release as *one* unit, and for a requirement the
    flow then splits into several it under-counts against ``max_concurrent_units``
    and gives ``avoid_file_conflicts`` nothing to work on until the flow writes
    the real units. One scheduling pass, self-correcting on the next read. It has
    always been so for a first release; since the condition below widened from
    "no units" to "no unit still owing work", a *re-delivered* requirement reaches
    the same placeholder, so the gap is now reachable a second way. Closing it
    means the queue knowing a split before the flow has planned it, which is a
    different problem than the one this function has.

    **Decided 2026-08-15: left as it is, deliberately.** Both ways out cost more
    than the gap does. Decomposing before the scheduling decision would put a
    model call in front of every queue read; teaching the queue to carry an
    estimate and correct it later would give the board a number that is wrong in
    a second, quieter way. The gap costs one scheduling pass and corrects itself
    on the next read, and nothing downstream of it is irreversible. Recorded here
    rather than in a plan document so the next reader finds the decision beside
    the code it is about — and re-open it only if the cycle-aware unit identity of
    SWR-3417 ever makes the split knowable before the flow plans it.
    """
    from rotaris_core.requirements.delivery.projection import read_priority
    from rotaris_core.requirements.delivery.state import DeliveryState
    from rotaris_core.requirements.delivery.store import DeliveryStore
    from rotaris_core.requirements.execution.decomposition import SINGLE_UNIT_KEY
    from rotaris_core.requirements.execution.history import ExecutionHistory
    from rotaris_core.requirements.execution.scheduler import (
        SCHEDULABLE_STATES,
        DeliveryScheduler,
        ScheduledRequirement,
        UnitCandidate,
    )
    from rotaris_core.requirements.execution.scheduler import (
        RunningUnit as Running,
    )
    from rotaris_core.requirements.execution.store import UnitStore
    from rotaris_core.requirements.execution.units import mint_unit_id
    from rotaris_core.requirements.model import RelationKind

    index = DeliveryStore(workspace).load_all()
    units = UnitStore(workspace)
    history = ExecutionHistory(workspace)

    states = {req_id: index.get(req_id).delivery.state for req_id in index.req_ids}
    states.update(
        {
            req_id: DeliveryState.READY
            for req_id in releasing
            if states.get(req_id) not in SCHEDULABLE_STATES
        },
    )
    in_flight = [
        Running(
            req_id=req_id,
            unit_id=run.unit_id or mint_unit_id(req_id, SINGLE_UNIT_KEY),
            run_id=run.run_id,
            expected_files=run.changed_files,
        )
        for req_id in index.req_ids
        for run in history.load(req_id).in_flight
    ]
    known = {unit.key for unit in in_flight}
    in_flight.extend(unit for unit in running if unit.key not in known)

    candidates: list[ScheduledRequirement] = []
    for req_id, state in states.items():
        if state not in SCHEDULABLE_STATES:
            continue
        requirement = requirement_for(req_id) if requirement_for is not None else None
        live = units.load(req_id)
        planned = ScheduledRequirement.from_units(
            live,
            state=state,
            priority=read_priority(index.get(req_id)),
            depends_on=(
                requirement.related_ids(RelationKind.DEPENDS_ON) if requirement is not None else ()
            ),
            # No unit runs for either side of a standing contradiction (SWR-3511).
            # Handed in rather than read from the requirement's own relations,
            # because a conflict may also be *detected* rather than declared and
            # the two must hold the queue the same way.
            contradicts=relations.contradicting(req_id) if relations is not None else (),
        )
        candidates.append(
            planned
            # ``and live.outstanding``: a unit set is *per delivery cycle*, and
            # reading it as if it were per requirement is what made a requirement
            # deliverable exactly once. After the first delivery the set holds one
            # FINISHED unit — not empty, so the fallback below did not fire; not
            # startable either, so the scheduler selected nothing and the release
            # was refused with "the scheduler selected nothing for it". That made
            # SWR-3502 hollow: a delivered requirement whose text moved returns to
            # Needs Update, which is pointless if it can never be delivered again.
            #
            # The condition is "still owes work", not "is empty", because those
            # differ only after a completed cycle — exactly the case that was
            # broken. A half-finished multi-unit requirement still has outstanding
            # units and keeps its split; nothing about a running flow changes.
            #
            # The fallback still mints without ``taken``, which is load-bearing:
            # ``DecompositionPlan.to_units`` does the same, so the queue and the
            # flow name the same unit. A ``-2`` suffix here would make the board
            # show one id while the flow created another.
            if planned.units and live.outstanding
            else planned.model_copy(
                update={
                    "units": (
                        UnitCandidate(
                            req_id=req_id,
                            unit_id=mint_unit_id(req_id, SINGLE_UNIT_KEY),
                        ),
                    ),
                },
            ),
        )
    return DeliveryScheduler(limits=limits, clock=lambda: at or _utc_now()).decide(
        candidates,
        running=tuple(in_flight),
        states=states,
    )


# ── the production run host and run starter (SWR-3413, SWR-3416) ───────────


class RunRefusedError(RuntimeError):
    """The run a board gesture asked for was not started, and this says why.

    Carried to the user by :attr:`ActionOutcome.failure`: the state moved and the
    work did not, which is a different sentence from a refused transition.
    """


#: What the host reports when the agent finished without committing anything.
#: Not a failure — an agent may legitimately conclude that nothing needs doing —
#: but it *is* the reason no verification ran, and SWR-3410 asks for that to be
#: stated rather than left as an empty check list.
NOTHING_COMMITTED = "the run committed nothing to its worktree, so nothing was verified"

#: What the host reports when the workspace configures no check suite.
NO_CHECK_SUITE = "this workspace configures no check suite; nothing verified the run"


def _git(tree: Path, *args: str) -> str:
    """One read-only git command in *tree*. ``""`` when git refuses.

    Never raises and never writes: the host reports what a run produced, and a
    repository that cannot answer must not turn into an exception on a worker
    thread that is holding a delivery transition open.
    """
    import subprocess

    try:
        result = subprocess.run(
            ["git", *args],
            cwd=tree,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=60,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return ""
    return result.stdout if result.returncode == 0 else ""


@traces(SWR.SWR_3707, SWR.SWR_3405)
def board_run_config(workspace: Path, tree: Path) -> RotarisConfig:
    """The configuration a run released from the board is started with.

    Two things happen here and they are separate facts.

    The configuration is the *project's*, with the run pointed at its own tree
    (SWR-3405): a requirement worktree carries no ``.rotaris/`` of its own, and
    reloading from there would silently give the run the built-in defaults.

    Then, unless the user turned it off, it is elevated (SWR-3707). Nobody is
    *watching* a board release, so a run that parks on the first write is a run
    that does not finish while the user is away — the elevation is what makes it
    finishable. It is no longer what makes it *possible*: since SWR-3624 the run
    is a coordinator session with an approval host, so an unelevated release
    stops, says so on the card, and carries on once it is answered.

    And it carries the wait budget the user chose (SWR-3625), because a run that
    does stop to ask should wait as long as they said — by default, until they
    answer.

    A function rather than a method: the elevation is the interesting half and
    it must be readable without an agent, a network or a Qt event loop behind
    it. :meth:`AgentRunHost._execute_agent` is the only caller in production,
    and it is exactly the method a test with an injected agent never reaches.
    """
    from rotaris_core.config.loader import load_config

    from rotaris.services.requirement_run_permissions import (
        answer_wait_seconds,
        elevated,
        full_permission_runs,
    )

    config = load_config(workspace).model_copy(update={"workspace_root": tree})
    # How long the run may wait for the person it asks (SWR-3625). Applied
    # whether or not the run is elevated: an elevated run rarely raises an
    # approval and can still ask a *question*, and the budget covers both.
    config = config.model_copy(
        update={
            "runtime": config.runtime.model_copy(
                update={"approval_timeout_seconds": answer_wait_seconds()},
            ),
        },
    )
    return elevated(config) if full_permission_runs() else config


@traces(SWR.SWR_3624, SWR.SWR_3612)
def attach_session_to_run(workspace: Path, session_id: str, launch: UnitLaunch) -> bool:
    """Record *session_id* on *launch*'s run while the run is still going.

    SWR-3612 says opening a unit's run focuses its session, and the board reads
    the session id off the run record. But ``RunRecord.of_start`` seeds that
    field from the *specification snapshot*, which is captured before any agent
    session exists, and the real id only arrives with ``of_result`` — so a live
    run had nothing to open, and a run that ended without a report (the
    application closed, which is how a released run usually ends) never got one
    at all. The affordance existed for finished runs that reported, and for
    nothing else.

    Appending is the supported shape rather than a trick: ``ExecutionHistory`` is
    one append-only file per requirement, and ``RequirementHistory.of`` keeps a
    run's *newest* content at its first-seen position, which is how ``open`` and
    ``complete`` already write the same run twice.

    ``False`` when there is nothing to amend or the history could not be read.
    Never raises: a run must not fail because the board lost a way to navigate
    to it.
    """
    import logging

    from rotaris_core.requirements.execution.history import ExecutionHistory

    if not session_id:
        return False
    try:
        history = ExecutionHistory(workspace)
        record = history.load(launch.req_id).get(launch.run_id)
        if record is None or record.session_id == session_id:
            return False
        history.append(record.model_copy(update={"session_id": session_id}))
    except Exception:  # noqa: BLE001 — navigation is not worth failing a run over.
        logging.getLogger(__name__).warning(
            "Could not record session %s on run %s.",
            session_id,
            launch.run_id,
            exc_info=True,
        )
        return False
    return True


@traces(SWR.SWR_3624)
def _run_status(status: str, *, failed: bool) -> RunStatus:
    """A coordinator session's status word as the run vocabulary spells it.

    The desktop's handle reports the status the *session* ended in, which is the
    same vocabulary :class:`~rotaris_core.run_result.RunStatus` uses — but it
    travels as a bare string through two Qt signals, so a word neither side
    recognises must land somewhere honest rather than as a silent success. It
    lands on ``ERROR``, because "the run ended in a state nobody named" is a
    failure to report, not a delivery.
    """
    from rotaris_core.run_result import RunStatus

    if failed:
        return RunStatus.FAILED
    try:
        return RunStatus(status.strip().lower())
    except ValueError:
        return RunStatus.ERROR


@traces(SWR.SWR_3624)
@dataclass(frozen=True)
class SessionLaunch:
    """What a unit run needs the desktop to start a session with.

    A value rather than the ``UnitLaunch`` itself: the launcher lives on Qt's
    thread and the launch is composed on the flow's, so what crosses between
    them is deliberately small and already resolved. The worktree is the one the
    seam provisioned — a launcher that created its own would give the unit two
    trees and the run would report on the wrong one (SWR-3405).
    """

    prompt: str
    tree: Path
    branch: str
    req_id: str
    unit_id: str


@traces(SWR.SWR_3624)
@dataclass(frozen=True)
class SessionRunResult:
    """How a launched session ended, in the four fields the report needs.

    ``read_claim`` reads ``summary`` and ``error``; ``_outcome`` reads
    ``status``; the record needs ``session_id``. Everything else about the run is
    measured from the repository afterwards (SWR-3408), so carrying more here
    would be carrying the agent's word for facts Rotaris checks itself.
    """

    session_id: str
    status: str = ""
    summary: str = ""
    error: str = ""


@runtime_checkable
class SessionLauncher(Protocol):
    """Starts a unit's run as a session a user can take part in (SWR-3624).

    A port, not a class: the desktop's implementation owns a Qt object and a run
    coordinator, and neither belongs in a module the headless composition
    imports. A test fills it with three lines.

    :meth:`launch` is called from the flow's worker thread and returns as soon as
    the session has an id; :meth:`wait` blocks that same thread until the session
    ends. Blocking is the shape :class:`~rotaris_core.requirements.execution.run_seam.RunHost`
    asks for — "a host that blocks is trivially wrapped in a thread" — and it is
    what lets a coordinator-driven run keep the seam's synchronous contract.
    """

    def launch(self, launch: SessionLaunch) -> str:
        """Start the session and return its id, or ``""`` if it did not start."""
        ...

    def wait(self, session_id: str) -> SessionRunResult:
        """Block until *session_id* ends, and say how."""
        ...


@traces(SWR.SWR_3416, SWR.SWR_3413, SWR.SWR_3603, SWR.SWR_3410)
class AgentRunHost:
    """Rotaris' own implementation of the engine's run host (SWR-3416).

    The seam asks one question — "run this unit and report what happened" — and
    this answers it with the entry point the headless CLI and the Python SDK
    already use, :func:`rotaris_core.run_host.execute_run`, pointed at the
    worktree the seam provisioned rather than at the user's checkout (SWR-3405).
    Nothing about the agent, the loop, the hooks or the event stream is rebuilt
    here; what this adds is the *report*, and the report keeps two facts apart:

    - **what the agent claims** — its summary and whether it declared itself
      finished — lands in the ``agent_*`` fields;
    - **what Rotaris measured** — the commits the worktree actually gained, the
      files they actually changed and the workspace's own check suite run
      against them (SWR-3410) — lands in ``produced_commits``, ``changed_files``,
      ``verified`` and ``checks``.

    SWR-3603 is that distinction, and it is structural here rather than a matter
    of the review surface labelling things carefully: an agent that says it is
    done and committed nothing reports ``verified=None`` with the reason stated,
    and the completion gate then refuses ``Done`` on its own conditions.

    Synchronous, because the seam is (concurrency is the scheduler's decision).
    It is called on :class:`FlowRunStarter`'s worker thread, never on Qt's.
    """

    def __init__(
        self,
        workspace: Path,
        *,
        max_iterations: int | None = None,
        run_agent: Callable[[str, Path], AgentRunResult] | None = None,
        run_checks: Callable[[Path], SuiteRun] | None = None,
        launcher: SessionLauncher | None = None,
        session_started: Callable[[str, UnitLaunch], None] | None = None,
    ) -> None:
        self._workspace = workspace
        self._max_iterations = max_iterations
        # Kept as given — ``None`` means "use mine", bound per launch in
        # :meth:`start`. Resolving it here would fix the default before the
        # launch it needs to carry exists.
        self._run_agent = run_agent
        self._run_checks = run_checks if run_checks is not None else self._execute_checks
        # How the unit is actually run (SWR-3624). With a launcher the run is a
        # coordinator session the user can steer, pause, stop and answer; without
        # one it is the self-contained ``execute_run`` this host has always used.
        # ``None`` is not a degraded mode — it is what the headless composition
        # and every test with an injected agent get, and both must keep working
        # exactly as they did.
        self._launcher = launcher
        self._session_started = session_started

    @property
    def workspace(self) -> Path:
        """The checkout the run's configuration is read from."""
        return self._workspace

    @traces(SWR.SWR_3416)
    def start(self, launch: UnitLaunch) -> RunReport:
        """Run one unit in its own worktree and report what happened."""
        import logging
        from functools import partial

        from rotaris_core.requirements.delivery.projection import RunOutcome as Outcome
        from rotaris_core.requirements.execution.cli_host import (
            read_claim,
            read_denied_tools,
            tools_confiscated,
        )
        from rotaris_core.requirements.execution.run_seam import RunReport as Report

        tree = Path(launch.workspace.path)
        # The default implementation is bound per launch rather than in the
        # constructor: the attribution a session is registered under belongs to
        # the *host*, not to the agent, so the seam stays two-argument and every
        # injected caller keeps working (SWR-3612).
        run = (
            self._run_agent
            if self._run_agent is not None
            else partial(self._execute_agent, launch=launch)
        )
        try:
            result = run(self._task(launch), tree)
        except Exception as exc:  # noqa: BLE001 — a failed launch is one sentence
            return Report(
                outcome=Outcome.FAILED,
                failure_reason=f"{type(exc).__name__}: {exc}".strip(": "),
            )
        # Measured first, and from the repository only (SWR-3408).
        commits, changed = self._produced(tree, launch.workspace.base_revision)
        measured, detail, checks = self._verified(launch, commits)

        # The agent's answer is read as *claims*, exactly as the headless host
        # reads it: a payload naming `verified`, `produced_commits` or
        # `checks_passed` has those stripped and the attempt named. Two hosts
        # that disagreed about what an agent may assert would be two answers to
        # SWR-3408's one question.
        intake = read_claim(result)
        if intake.tampered:
            logging.getLogger(__name__).warning("%s: %s", launch.run_id, intake.message)

        outcome = self._outcome(result)
        # An agent denied the tools it needed reports the nothing it did as a
        # finished job; the permission trail is how the runner finds out
        # (SWR-3408). Read through the engine's helper rather than repeated
        # here, so this host and ``CliRunHost`` cannot come to two answers.
        denied = read_denied_tools(self._workspace, result.session_id or "")
        outcome, refusal = tools_confiscated(outcome, commits, denied)
        if refusal:
            logging.getLogger(__name__).warning("%s: %s", launch.run_id, refusal)
        return Report(
            outcome=outcome,
            session_id=result.session_id or None,
            produced_commits=commits,
            changed_files=changed,
            verified=measured,
            verification_detail=detail,
            checks=checks,
            failure_reason=(
                "" if outcome is Outcome.SUCCEEDED else (refusal or result.error or result.summary)
            ),
            agent_summary=intake.claim.summary or result.summary,
            agent_risks=intake.claim.risks,
            agent_claimed_complete=intake.claim.claimed_complete,
        )

    # -- what the agent is asked to do -------------------------------------

    def _task(self, launch: UnitLaunch) -> str:
        """The agent's instruction: the rendered context, or the snapshot itself.

        A flow composed with an agent context (SWR-3407) renders it and the seam
        carries it here. Without one the run still gets the *specification* — the
        snapshot's own text, never a re-read of the requirement (SWR-3402) — so a
        run can never be started with nothing to work from.
        """
        rendered = launch.prompt.strip()
        if rendered:
            return rendered
        snapshot = launch.snapshot
        unit = f" (unit {launch.unit_id})" if launch.unit_id else ""
        return (
            f"Implement requirement {snapshot.req_id}{unit} — {snapshot.title}.\n\n"
            f"{snapshot.description}\n\n"
            f"This is the specification as of {snapshot.requirement_hash}; work against it "
            "and do not re-read the requirement file.\n"
            "Work only in this worktree, and commit what you change."
        )

    # -- what Rotaris measured ---------------------------------------------

    def _produced(self, tree: Path, base_revision: str) -> tuple[tuple[str, ...], tuple[str, ...]]:
        """The commits this run added to its worktree, and the files they touched."""
        base = base_revision.strip()
        if not base:
            return (), ()
        commits = tuple(reversed(_git(tree, "rev-list", f"{base}..HEAD").split()))
        if not commits:
            return (), ()
        changed = _git(tree, "diff", "--name-only", base, "HEAD").splitlines()
        return commits, tuple(sorted({line.strip() for line in changed if line.strip()}))

    def _verified(
        self,
        launch: UnitLaunch,
        commits: tuple[str, ...],
    ) -> tuple[bool | None, str, tuple[CheckOutcome, ...]]:
        """The workspace's own checks over the run's worktree (SWR-3410)."""
        from rotaris_core.requirements.execution.verification import (
            VerificationError,
            verify_unit,
        )

        if not commits:
            return None, NOTHING_COMMITTED, ()
        try:
            verification: UnitVerification = verify_unit(
                snapshot=launch.snapshot,
                workspace=launch.workspace,
                base_workspace=self._workspace,
                run_checks=self._run_checks,
                commit=commits[-1],
            )
        except VerificationError as exc:
            return None, str(exc), ()
        return verification.verified, verification.detail, verification.suite.checks

    # -- the two things that reach the world -------------------------------

    @traces(SWR.SWR_3612)
    def _execute_agent(self, task: str, tree: Path, *, launch: UnitLaunch) -> AgentRunResult:
        """One agent run in *tree*, as a session the user can take part in.

        With a launcher (SWR-3624) the run is started through the desktop's run
        coordinator, so it holds a live handle from the moment it starts: the
        workspace's stop, pause and steer controls act on it, an approval or a
        question it raises reaches a person, and closing the application cancels
        it instead of abandoning it. Without one — the headless composition, a
        test with an injected agent — it takes the self-contained path below, and
        that path is unchanged.

        Either way the session is registered in the **base workspace**, not in
        the run's worktree. A requirement worktree gets its own `.rotaris/` if
        something writes one, and a session filed there is invisible: the desktop
        lists `<workspace>/.rotaris/sessions/`, so a requirement-started session
        would not appear at all and the badge naming its requirement would have
        nothing to attach to (SWR-3612). The worktree stays the run's *working
        directory*; only where the session is filed moves.
        """
        if self._launcher is not None:
            return self._run_as_session(task, tree, launch=launch)

        import asyncio

        from rotaris_core.run_host import RunRequest, execute_run
        from rotaris_core.session.manager import SessionManager

        config = board_run_config(self._workspace, tree)
        return asyncio.run(
            execute_run(
                RunRequest(
                    task=task,
                    config=config,
                    max_iterations=self._max_iterations,
                    requirement_id=launch.req_id,
                    unit_id=launch.unit_id or "",
                ),
                SessionManager(self._workspace),
            ),
        )

    @traces(SWR.SWR_3624)
    def _run_as_session(self, task: str, tree: Path, *, launch: UnitLaunch) -> AgentRunResult:
        """Run the unit as a coordinator session and wait for it, on this thread.

        The wait is the point rather than a cost: the seam is synchronous by
        design (SWR-3416), the flow is already on a worker of its own, and a host
        that blocks is the shape that module says it wants. What the coordinator
        buys is everything a user-started session has — a live handle, an
        approval host, and a stop that reaches the agent.

        The session id is announced the moment it exists, before the run ends, so
        the board can open the session it started while it is still running
        (SWR-3612). A launch that produces no session is a launch that did not
        happen, and it is reported as an error rather than waited on forever.
        """
        from rotaris_core.run_result import RunResult, RunStatus

        session_id = self._launcher.launch(  # type: ignore[union-attr]  # guarded by _execute_agent
            SessionLaunch(
                prompt=task,
                tree=tree,
                branch=launch.workspace.branch,
                req_id=launch.req_id,
                unit_id=launch.unit_id or "",
            ),
        )
        if not session_id:
            return RunResult(
                session_id="",
                status=RunStatus.ERROR,
                summary="",
                error="the desktop could not start a session for this unit",
            )
        if self._session_started is not None:
            self._session_started(session_id, launch)
        ended = self._launcher.wait(session_id)  # type: ignore[union-attr]  # same guard
        return RunResult(
            session_id=ended.session_id or session_id,
            status=_run_status(ended.status, failed=bool(ended.error)),
            summary=ended.summary,
            error=ended.error,
        )

    def _execute_checks(self, tree: Path) -> SuiteRun:
        """The completion verifier's suite, run in *tree* (SWR-2602, SWR-3410).

        The engine's builder, called rather than repeated (SWR-3421): this method
        and its headless twin were the same twenty lines differing only in where
        the configuration came from, which is two chances for "verified" to stop
        meaning one thing.
        """
        from rotaris_core.requirements.execution.cli_host import workspace_checks_for

        return workspace_checks_for(self._workspace)(tree)

    def _outcome(self, result: AgentRunResult) -> RunOutcome:
        from rotaris_core.requirements.delivery.projection import RunOutcome as Outcome
        from rotaris_core.run_result import RunStatus

        return {
            RunStatus.COMPLETED: Outcome.SUCCEEDED,
            RunStatus.MAX_ITERATIONS: Outcome.FAILED,
            RunStatus.INTERRUPTED: Outcome.INTERRUPTED,
        }.get(result.status, Outcome.FAILED)


@traces(SWR.SWR_3413, SWR.SWR_3416, SWR.SWR_3601, SWR.SWR_3608)
class FlowRunStarter:
    """What a drop on ``Ready`` actually starts: the engine's requirement flow.

    :class:`RunStarter` is the board's side of SWR-3413; this is the workspace's
    side of it, and it is the only place the desktop composes
    :class:`~rotaris_core.requirements.execution.flow.RequirementFlow`. Everything
    the flow needs comes from the workspace it was built for — the same guarded
    writer the board writes through, the same requirement lookup, the workspace's
    own unit store, history and integration log — so the run and the board can
    never disagree about which requirement is where.

    Two properties are worth naming because both are the point:

    - **The flow does not run on the Qt thread.** :meth:`start` returns the flow
      id as soon as the run is accepted and the flow itself runs on a worker, so
      a release never blocks the board. That is also why nothing about the flow's
      *result* is returned: it lands in the delivery store and the board reads it
      on the next evaluation, exactly as a headless run would (SWR-3416). What a
      caller may ask for instead is to be *told* when a flow ends
      (:meth:`report_flows`), because "this release was accepted" is a claim that
      stops being true the moment the run it started dies (SWR-3601).
    - **The queue's controls are real.** The workspace's ``SchedulerLimits``
      (SWR-3608) are read at each release: a stopped queue refuses, and a
      concurrency limit refuses once that many flows are in flight. A refusal is
      a :class:`RunRefusedError` whose sentence the board shows — never a run that
      quietly starts anyway.
    """

    def __init__(
        self,
        workspace: Path,
        *,
        transitions: TransitionPort,
        current_for: Callable[[str], CanonicalRequirement | None],
        host: RunHost | None = None,
        launcher: SessionLauncher | None = None,
        isolation: IsolationProvider | None = None,
        limits_for: Callable[[], SchedulerLimits] | None = None,
        dispatch: Callable[[Callable[[], None]], None] | None = None,
        head_for: Callable[[], str] | None = None,
        observer: Callable[[StageEvent], None] | None = None,
        proposals: ProposalPort | None = None,
        clock: Callable[[], dt.datetime] | None = None,
    ) -> None:
        self._workspace = workspace
        self._transitions = transitions
        self._current_for = current_for
        self._host = host
        #: What turns a unit run into a session the user can take part in
        #: (SWR-3624). Only reaches the *default* host: a caller that injected a
        #: host of its own already decided how its runs are driven, and quietly
        #: replacing that would make an injected double untestable.
        self._launcher = launcher
        self._isolation = isolation
        self._limits_for = limits_for
        self._proposals = proposals
        self._dispatch = dispatch if dispatch is not None else _spawn
        self._head_for = head_for
        self._observer = observer
        self._clock: Callable[[], dt.datetime] = clock if clock is not None else _utc_now
        #: Who to tell when a dispatched flow ends. Set through
        #: :meth:`report_flows`, called from the flow's own worker thread.
        self._ended: Callable[[FlowEnded], None] | None = None
        self._started = 0
        #: ``flow_id → req_id`` of every flow this starter has dispatched and not
        #: yet seen end. Named for its direction because both halves are strings
        #: and the two vocabularies do not interchange: a reader that took the
        #: keys for requirement ids would hand the recovery pass a set that
        #: matches nothing, and it would free the very flows this process is
        #: driving (SWR-3611).
        self._req_by_flow: dict[str, str] = {}
        #: What :meth:`refusal_for` just resolved, handed straight to the
        #: :meth:`_launch` that follows it. A hand-off rather than a cache: it
        #: holds one answer for one requirement and :meth:`_take_base` empties it
        #: on read, so a later drop — or a project that has committed in the
        #: meantime — always asks git again.
        self._resolved: tuple[str, tuple[TargetBranch | None, str]] | None = None
        #: Requirements a user released that the scheduler held back, with the
        #: instructions they were released with. Drained when a flow finishes.
        self._queued: dict[str, str] = {}
        #: Every flow this starter has finished, newest last. Read by the queue
        #: surface and by tests; never by the board, which reads the store.
        self.results: list[FlowResult] = []

    @property
    @traces(SWR.SWR_3611)
    def in_flight(self) -> tuple[str, ...]:
        """The **requirements** this starter is running right now, in id order.

        :class:`RunsInFlight`'s answer, and requirement ids because that is what
        the recovery pass compares it against (SWR-3611). The flow ids are
        :attr:`flows_in_flight`, and the two are deliberately separate
        properties: a single one serving both readers is what let a set of flow
        ids reach a comparison against requirement ids, where it matched nothing
        and every freshly dispatched flow was closed as abandoned within the
        second.
        """
        return tuple(sorted(set(self._req_by_flow.values())))

    @property
    def flows_in_flight(self) -> tuple[str, ...]:
        """The ids of the flows running right now, in id order."""
        return tuple(sorted(self._req_by_flow))

    @property
    @traces(SWR.SWR_3412)
    def queued(self) -> tuple[str, ...]:
        """Requirements released and waiting for the scheduler, in id order."""
        return tuple(sorted(self._queued))

    @property
    def limits(self) -> SchedulerLimits:
        """The scheduling limits this workspace is configured with (SWR-3608)."""
        if self._limits_for is not None:
            return self._limits_for()
        from rotaris.views.requirement_queue import load_scheduling_limits

        return load_scheduling_limits(self._workspace)

    @traces(SWR.SWR_3608)
    def follow(self, limits_for: Callable[[], SchedulerLimits]) -> None:
        """Take the limits from *limits_for* from now on.

        The queue's controls are live and only half of them are persisted: a
        stopped queue exists in the control object and in no file, because
        SWR-3608 asks a stop to survive nothing more than the session it was made
        in. Pointing the starter at the controls is therefore the only way "the
        queue is stopped" can reach the thing that starts runs — without it the
        control would be a switch the product reads back and ignores.
        """
        self._limits_for = limits_for

    @traces(SWR.SWR_3601, SWR.SWR_3602)
    def report_flows(self, ended: Callable[[FlowEnded], None]) -> None:
        """Tell *ended* how every dispatched flow finishes, from its own thread.

        The other half of :meth:`start`. ``start`` answers the instant the flow is
        accepted, because a release must not block the board — which left the
        surface holding an acceptance it had no way to take back when the flow
        died later. This is that way back, and it is a plain callable rather than
        anything Qt for the same reason the whole module is: what runs on the
        worker is engine code, and marshalling onto a user interface's thread is
        that user interface's business (SWR-3601).
        """
        self._ended = ended

    @traces(SWR.SWR_3413)
    def report_stages(self, staged: Callable[[StageEvent], None]) -> None:
        """Tell *staged* about each stage, from the flow's own thread.

        The finer half of :meth:`report_flows`. Wrapped rather than stored bare
        for the same reason the ending is: an audience that raises must not fail
        the run it is only watching, and a stage observer is called far more
        often than a flow ending — once per stage, per unit, per attempt — so a
        single bad subscriber would otherwise take out every release.

        Marshalling onto a user interface's thread stays that interface's
        business (SWR-3601); what arrives here is engine data on an engine
        thread.
        """
        import logging

        def guarded(event: StageEvent) -> None:
            try:
                staged(event)
            except Exception:  # noqa: BLE001 — a watched run is never failed by its audience
                logging.getLogger(__name__).exception(
                    "a stage of the flow for %s could not be reported",
                    event.req_id,
                )

        self._observer = guarded

    @traces(SWR.SWR_3413, SWR.SWR_3608, SWR.SWR_3412, SWR.SWR_3510)
    def start(self, req_id: str, *, instructions: str = "") -> str:
        """Release *req_id* for implementation. Answers with the flow's id.

        The scheduler decides whether the work begins now (SWR-3412), and its
        answer is the one the board's queue is showing: same function, same
        facts, so what a user reads and what happens cannot disagree.

        Raises :class:`RunRefusedError` — never silently does nothing — when the
        queue is stopped, when the requirement has left the store, or when the
        scheduler held the work back. A hold is *not* the end of it: the release
        stands, the requirement stays queued here, and it starts by itself as
        soon as the hold lifts (SWR-3510's third criterion). The raised sentence
        is the hold's own, so the board says which requirement is being waited
        for rather than "not started".
        """
        limits = self.limits
        if limits.stopped:
            raise RunRefusedError(
                "the requirement queue is stopped, so nothing was started;"
                " start the queue again to release work",
            )
        requirement = self._current_for(req_id)
        if requirement is None:
            raise RunRefusedError(
                f"{req_id} is no longer in this project's requirement store,"
                " so there is nothing to implement",
            )
        if req_id in set(self._req_by_flow.values()):
            raise RunRefusedError(
                f"{req_id} is already running; one flow per requirement at a time",
            )
        decision = self._decide(limits, releasing=(req_id, *self._queued))
        if not any(choice.req_id == req_id for choice in decision.selected):
            self._queued[req_id] = instructions
            raise RunRefusedError(self._held_because(decision, req_id))
        self._queued.pop(req_id, None)
        return self._launch(requirement, instructions=instructions)

    # -- the queue (SWR-3412, SWR-3406, SWR-3510) ---------------------------

    def _decide(
        self,
        limits: SchedulerLimits,
        *,
        releasing: Sequence[str] = (),
    ) -> ScheduleDecision:
        """What may run right now, over the stores plus this starter's own flows."""
        from rotaris_core.requirements.execution.scheduler import RunningUnit

        return schedule_now(
            self._workspace,
            limits=limits,
            requirement_for=self._current_for,
            # The release that is happening right now, and the ones still
            # waiting: both are Ready as far as this decision is concerned, even
            # if the transition that records it has not landed yet.
            releasing=releasing,
            # A dispatched flow has no run record until its first unit starts.
            # Without this the next decision would select the same work twice.
            running=tuple(
                RunningUnit(req_id=req_id, unit_id=f"flow:{flow_id}")
                for flow_id, req_id in self._req_by_flow.items()
            ),
            at=self._clock(),
        )

    def _held_because(self, decision: ScheduleDecision, req_id: str) -> str:
        """The scheduler's own sentence for why *req_id* did not start."""
        held = next((hold for hold in decision.held if hold.req_id == req_id), None)
        if held is not None:
            return f"{held.detail}; {req_id} stays queued and starts when that clears"
        return (
            f"{req_id} was released but the scheduler selected nothing for it;"
            " it stays queued and starts when capacity frees"
        )

    @traces(SWR.SWR_3419, SWR.SWR_3413, SWR.SWR_3602)
    def refusal_for(self, req_id: str) -> str:
        """Why a run for *req_id* cannot start in this workspace, or ``""``.

        The board asks this before it moves a card onto ``Ready``, and it answers
        with exactly the sentence :meth:`_launch` would have raised — one check,
        asked twice, so the refusal a user reads and the refusal that stops the
        dispatch can never be about different things.

        Only what is knowable without doing anything is knowable here: the queue's
        controls and the scheduler's answer are not asked, because a held release
        is queued rather than refused (SWR-3412) and this must not turn one into
        the other.
        """
        try:
            self._resolved = (req_id, self._base(req_id))
        except RunRefusedError as refused:
            self._resolved = None
            return str(refused)
        return ""

    def _take_base(self, req_id: str) -> tuple[TargetBranch | None, str]:
        """The answer :meth:`refusal_for` just resolved for *req_id*, or a fresh one.

        The board asks :meth:`refusal_for` and then, on the same call stack and
        the same thread, dispatches — so resolving twice means a second
        ``load_config`` and two more ``git`` subprocesses on the Qt thread for
        every accepted release, in the one path this whole change is about.

        Taking the answer empties it, so nothing here can go stale: a drop that
        did not come through :meth:`refusal_for` — :meth:`drain` starting queued
        work, say — finds nothing waiting and asks git itself.
        """
        handed = self._resolved
        self._resolved = None
        if handed is not None and handed[0] == req_id:
            return handed[1]
        return self._base(req_id)

    @traces(SWR.SWR_3419, SWR.SWR_3413)
    def _launch(self, requirement: CanonicalRequirement, *, instructions: str) -> str:
        """Dispatch one flow for *requirement* and answer with its id.

        Everything a run needs to exist at all is settled by :meth:`_base` before
        anything is dispatched, so a workspace that cannot host a run costs a
        sentence rather than an agent run that fails several stages later in
        somebody else's words (SWR-3419).
        """
        del instructions  # carried by the transition's detail, not by the flow
        target, base = self._take_base(requirement.req_id)
        flow_id = self._flow_id(requirement.req_id)
        flow = self._flow(target)
        self._req_by_flow[flow_id] = requirement.req_id
        self._dispatch(
            lambda: self._execute(flow, requirement, base_commit=base, flow_id=flow_id),
        )
        return flow_id

    @traces(SWR.SWR_3411, SWR.SWR_3613)
    def _offer(self, result: FlowResult) -> None:
        """Offer whatever lasting obligation this run created (SWR-3411, SWR-3613).

        On the run's own worker thread, where the run just ended — never on the
        Qt thread, and never in a way that can fail a run that already finished.

        It *offers*: the proposal is recorded as waiting and the review of this
        requirement presents it. Nothing is written into the project's store
        until a reviewer accepts, which is the whole of SWR-3613.
        """
        import logging

        if not result.succeeded:
            return
        try:
            offers = offer_technical_requirements(
                self._workspace,
                result.req_id,
                run_ids=result.run_ids,
                proposals=self._proposals,
            )
        except Exception:  # noqa: BLE001 — a finished run is never failed by this
            logging.getLogger(__name__).exception(
                "the technical derivation for %s could not run",
                result.req_id,
            )
            return
        for offer in offers:
            logging.getLogger(__name__).info("%s offers %s", result.req_id, offer.title)

    @traces(SWR.SWR_3412, SWR.SWR_3510)
    def drain(self) -> tuple[str, ...]:
        """Start every queued requirement the scheduler now selects. Answers their ids.

        Called when a flow finishes, which is the only moment the answer can have
        changed: a dependency became ``Done``, or a slot came free. That is what
        makes SWR-3510's "completing a dependency releases its dependents without
        user action" true — and SWR-3412's four-requirement queue work through
        itself in dependency order — without anything polling.

        Only requirements a user actually released are considered. A requirement
        nobody dropped on ``Ready`` is not started here, whatever the queue's
        capacity: releasing is the human's decision (SWR-3413) and this carries it
        out, it does not make it.
        """
        if not self._queued or self.limits.stopped:
            return ()
        decision = self._decide(self.limits, releasing=tuple(self._queued))
        started: list[str] = []
        for choice in decision.selected:
            req_id = choice.req_id
            if req_id not in self._queued or req_id in set(self._req_by_flow.values()):
                continue
            requirement = self._current_for(req_id)
            if requirement is None:
                # It left the store while it waited; forget it rather than fail.
                self._queued.pop(req_id, None)
                continue
            instructions = self._queued.pop(req_id)
            self._launch(requirement, instructions=instructions)
            started.append(req_id)
        return tuple(started)

    # -- composition --------------------------------------------------------

    def _flow_id(self, req_id: str) -> str:
        from rotaris_core.requirements.execution.units import slug_token

        self._started += 1
        return f"{slug_token(req_id, limit=0) or 'req'}-f{self._started}"

    def _head(self) -> str:
        """The commit a run's worktree is cut from (SWR-3402)."""
        if self._head_for is not None:
            return self._head_for()
        return _git(self._workspace, "rev-parse", "HEAD").strip()

    @traces(SWR.SWR_3419, SWR.SWR_3413, SWR.SWR_3602)
    def _base(self, req_id: str) -> tuple[TargetBranch | None, str]:
        """What a run for *req_id* would fork from: its branch and its commit.

        Git has three ways to answer this badly and this decides what each one
        costs, because two of them are the user's to fix and one is not.

        A **declared branch the workspace does not have** is refused by name — the
        setting is wrong and the release stops before it spends anything
        (SWR-3419). A **checkout with no commit** is refused too, in plain words
        about the missing initial commit: it is the ordinary first day of a
        project, and it used to be indistinguishable from the third answer, so the
        run started, reached the snapshot with no base, and parked the requirement
        in ``Blocked`` in the snapshot's vocabulary. A directory that is **not a
        checkout at all** still yields no target and no base, because a
        composition that supplies its own isolation is entitled to run without
        one, and refusing it here would refuse every such composition.

        The empty base is checked independently of how the target resolved. The
        commit is read through :meth:`_head`, which a caller may substitute, and a
        substituted answer of ``""`` is the same run with the same ending — so it
        is the same refusal, rather than a hole the guard above does not cover.
        """
        from rotaris_core.requirements.execution.target import TargetBranchError

        checkout = True
        try:
            target: TargetBranch | None = self._target()
        except TargetBranchError as exc:
            if exc.declared:
                raise RunRefusedError(str(exc)) from exc
            if exc.no_commit:
                raise RunRefusedError(self._no_commit_yet(req_id)) from exc
            # Not a checkout at all — the isolation provider's failure to report,
            # in its own words about worktrees.
            target = None
            checkout = False
        base = self._head()
        if checkout and not base:
            raise RunRefusedError(self._no_commit_yet(req_id))
        return target, base

    @traces(SWR.SWR_2508, SWR.SWR_3602)
    def caveat_for(self, req_id: str) -> str:
        """What this release will run into but is not refused for, or ``""``.

        A *caveat*, deliberately, not a refusal. The condition it names — an
        unattended run under a permission mode that denies by default — holds
        for a default workspace, because ``runtime.permission_mode`` ships as
        ``ask`` and the sandbox opt-in ships off (SWR-2508). Refusing here would
        therefore refuse every release in every workspace nobody has configured,
        which is a policy decision this check has no business making.

        What it can honestly do is say so *before* the wait: the run will spend
        a model call per unit having its tools denied, and until this sentence
        existed the only evidence was a line in a console nobody was reading.
        The run itself is no longer silent about it either — the report a
        confiscated run produces now fails and names the tools
        (:func:`~rotaris_core.requirements.execution.cli_host.tools_confiscated`).

        Best-effort about *reading* the configuration: a workspace whose config
        cannot be loaded gets no caveat. Its run will fail with its own loading
        error, which is a better sentence than a guess about permissions.
        """
        del req_id
        from rotaris_core.permissions.modes import unattended_run_refusal

        try:
            from rotaris_core.config.loader import load_config

            return unattended_run_refusal(load_config(self._workspace))
        except Exception:  # noqa: BLE001 — an unreadable config is not this check's to report
            return ""

    def _no_commit_yet(self, req_id: str) -> str:
        """The refusal a person reads when their project has never committed.

        The sentence is the engine's
        (:func:`~rotaris_core.requirements.execution.target.no_commit_refusal`),
        not this surface's. The headless command refuses the same run for the
        same reason, and a board pre-flight says it before any card is dragged;
        a copy here would be wording that agrees with theirs only until one of
        the three is edited. What stays local is *when* to say it — which is the
        board's question, and the subject of :meth:`_base`.
        """
        from rotaris_core.requirements.execution.target import no_commit_refusal

        return no_commit_refusal(self._workspace, req_id)

    @traces(SWR.SWR_3624, SWR.SWR_3612)
    def _agent_host(self) -> AgentRunHost:
        """This starter's own host, told how to start a session and what to record.

        The two collaborators travel together because they are two halves of one
        fact: the session that runs the unit, and the run record that can be
        opened to reach it. A host given a launcher and no way to record the
        session it started would run interactively and still leave the board
        unable to navigate to it, which is the state SWR-3612 was already in.
        """
        return AgentRunHost(
            self._workspace,
            launcher=self._launcher,
            session_started=self._record_session,
        )

    @traces(SWR.SWR_3612)
    def _record_session(self, session_id: str, launch: UnitLaunch) -> None:
        """Put the session a unit started on its run record, or say why not.

        Never silently: a run whose session was not recorded is a card that
        cannot open its own work, and the user meets that as a control that does
        nothing rather than as a failure anyone reported.
        """
        if not attach_session_to_run(self._workspace, session_id, launch):
            import logging  # noqa: PLC0415

            logging.getLogger(__name__).warning(
                "the session %s of %s could not be recorded on its run, "
                "so the board cannot open it",
                session_id,
                launch.unit_id or launch.req_id,
            )

    @traces(SWR.SWR_3409, SWR.SWR_3419, SWR.SWR_3420)
    def _flow(self, target: TargetBranch | None) -> RequirementFlow:
        """The composition a board release runs — the engine's builders, called.

        ``integrate=`` is the parameter this method did not pass for four slices,
        which is why the flow's integration stage always took its ``None`` branch
        and nothing a requirement run produced ever reached the base. It comes
        from :func:`~rotaris_core.requirements.execution.cli_host.integration_for`
        rather than being assembled here, so a desktop release and a headless run
        land work the same way or not at all (SWR-3416).
        """
        from rotaris_core.requirements.change.migration_host import (
            MigrationRunHost,
            dispatching_host,
        )
        from rotaris_core.requirements.execution.cli_host import integration_for
        from rotaris_core.requirements.execution.flow import FlowStateStore, RequirementFlow
        from rotaris_core.requirements.execution.history import ExecutionHistory
        from rotaris_core.requirements.execution.run_seam import (
            GitIsolation,
            RequirementRunSeam,
        )
        from rotaris_core.requirements.execution.snapshot import SnapshotStore
        from rotaris_core.requirements.execution.store import IntegrationLog, UnitStore

        decomposer, assess = self._decomposition()
        return RequirementFlow(
            transitions=self._transitions,
            seam=RequirementRunSeam(
                isolation=(
                    self._isolation
                    if self._isolation is not None
                    else GitIsolation(self._workspace, target=target)
                ),
                host=dispatching_host(
                    self._host if self._host is not None else self._agent_host(),
                    # A unit carrying an approved worklist is mechanical: the
                    # edits are decided, and an agent asked to make them could
                    # make different ones (SWR-3507).
                    MigrationRunHost(self._workspace),
                ),
                clock=self._clock,
                snapshots=SnapshotStore(self._workspace),
            ),
            current_for=self._require,
            history=ExecutionHistory(self._workspace),
            decomposer=decomposer,
            assess=assess,
            clock=self._clock,
            observer=self._observer,
            progress=FlowStateStore(self._workspace),
            units=UnitStore(self._workspace),
            integrations=IntegrationLog(self._workspace),
            integrate=(
                integration_for(self._workspace, target=target, clock=self._clock)
                if target is not None
                # Nothing to land onto: this workspace has no branch, so a run
                # here fails at isolation long before integration (SWR-3419).
                else None
            ),
        )

    @traces(SWR.SWR_3419)
    def _target(self) -> TargetBranch:
        """The branch this workspace's requirement work is based on and lands on.

        Raises :class:`~rotaris_core.requirements.execution.target.TargetBranchError`
        for a workspace that is not a checkout, a checkout with no commit, and a
        declared branch the workspace does not have. :meth:`_base` decides which
        of the three the board refuses on and which falls through to the
        isolation provider.
        """
        from rotaris_core.requirements.execution.target import target_branch_for

        return target_branch_for(self._workspace)

    @traces(SWR.SWR_3404, SWR.SWR_3117)
    def _decomposition(
        self,
    ) -> tuple[Decomposer | None, Callable[[CanonicalRequirement], RequirementAssessment] | None]:
        """The workspace's own scope assessment and split planner (SWR-3404).

        The engine's builder, called rather than repeated. A headless run
        composes the same two collaborators (SWR-3416), and this module used to
        build them a second time: same configuration source, same persona job,
        same "both halves or neither", same degradation to one unit when the
        configuration cannot be read — two truths about one composition, which is
        the defect this slice exists to remove. The only thing the desktop adds
        is its **clock**, so a plan's ``recorded_at`` and the stage events around
        it come from the one clock this flow was built with.

        Nothing here builds an ``LLM``: the handle inside the analysts is
        deferred, and this runs on the Qt thread a board drop arrives on.
        """
        from rotaris_core.requirements.execution.cli_host import decomposition_for

        return decomposition_for(self._workspace, clock=self._clock)

    def _require(self, req_id: str) -> CanonicalRequirement:
        """The requirement as it reads *now* — the half of SWR-3403 the flow owns."""
        found = self._current_for(req_id)
        if found is None:
            raise RunRefusedError(
                f"{req_id} left the requirement store while its run was in flight",
            )
        return found

    @traces(SWR.SWR_3601, SWR.SWR_3510)
    def _execute(
        self,
        flow: RequirementFlow,
        requirement: CanonicalRequirement,
        *,
        base_commit: str,
        flow_id: str,
    ) -> None:
        """Run one flow to its end, report the ending, then let the queue move.

        Never raises. Two things happen after the flow returns and both are the
        point of it happening *here*: whoever showed this run starting is told how
        it ended (SWR-3601), and the queue is drained, because a finished flow is
        the one event that can change the scheduler's answer — it is what frees a
        slot and what makes a dependency ``Done`` (SWR-3510).

        A flow that raised is an ending too, and a worse one: it produced no
        result at all, so the surface would otherwise keep the acceptance for a
        run whose failure is only in a log file.
        """
        import logging

        log = logging.getLogger(__name__)
        ended = FlowEnded(req_id=requirement.req_id, flow_id=flow_id)
        try:
            result = flow.start(requirement, base_commit=base_commit, flow_id=flow_id, resume=True)
        except Exception as exc:  # noqa: BLE001 — a worker that raised would take the thread
            log.exception("requirement flow %s failed", flow_id)
            ended = replace(ended, reason=f"the run stopped before it could report: {exc}")
        else:
            self.results.append(result)
            self._offer(result)
            ended = FlowEnded.of(result, flow_id=flow_id)
        finally:
            self._req_by_flow.pop(flow_id, None)
        self._report(ended)
        try:
            self.drain()
        except Exception:  # noqa: BLE001 — a queue that cannot move must not kill the worker
            log.exception("the requirement queue could not be drained after %s", flow_id)

    @traces(SWR.SWR_3601)
    def _report(self, ended: FlowEnded) -> None:
        """Hand *ended* to whatever :meth:`report_flows` registered.

        Reported after the flow has been taken out of flight, so a listener that
        reads this starter back sees the run gone rather than still running. A
        listener that raises is logged and nothing more: the flow is over either
        way, and a surface that could not take the news must not also cost the
        queue its drain.
        """
        import logging

        if self._ended is None:
            return
        try:
            self._ended(ended)
        except Exception:  # noqa: BLE001 — a finished run is never failed by its audience
            logging.getLogger(__name__).exception(
                "the end of the flow for %s could not be reported",
                ended.req_id,
            )


def _spawn(work: Callable[[], None]) -> None:
    """Run *work* on a worker thread, daemonised so a close never blocks."""
    import threading

    threading.Thread(target=work, name="rotaris-requirement-flow", daemon=True).start()


# ── adopting the work a project already had (SWR-3217, SWR-3614) ───────────


@traces(SWR.SWR_3614)
def adoption_finding(
    requirements: Sequence[CanonicalRequirement],
    evidence_for: Callable[[CanonicalRequirement], EvidenceInputs],
    delivered: Callable[[str], bool],
) -> tuple[int, int]:
    """``(traced, total)`` — what the board's adoption offer states (SWR-3614).

    Read rather than estimated: the offer names the number of requirements that
    already carry an implementation trace, out of the number the project has, and
    a user who counts them by hand has to get the same answer.

    Returns ``(0, 0)`` once anything has been delivered or adopted. The offer is
    about a workspace Rotaris has never worked in; once it has, the finding it
    reports is no longer true, so the offer disappears on its own rather than
    waiting to be dismissed.
    """
    if any(delivered(requirement.req_id) for requirement in requirements):
        return (0, 0)
    traced = sum(1 for req in requirements if evidence_for(req).implementations)
    return (traced, len(requirements))


@traces(SWR.SWR_3217)
def adoption_evidence(
    requirement: CanonicalRequirement,
    inputs: EvidenceInputs,
    *,
    checks: Sequence[CheckResult] = (),
    blockers: Sequence[str] = (),
) -> CompletionEvidence:
    """What the completion gate reads when adoption asks about *requirement*.

    The sibling of :func:`completion_evidence_for`, and deliberately not a change
    to it: that one describes what a *delivering run* produced, which is right for
    a delivery and empty for a requirement no run ever touched. This one describes
    what the **repository** holds — the traces and covering tests the coverage
    sweep found — with one fact laid over them that the sweep cannot know:
    whether the checks that just ran actually executed each covering test.

    That overlay is why adoption is honest. A coverage sweep reports
    ``executed=False`` by construction (SWR-2606), so without a real check suite
    every requirement fails ``covering-tests-passed`` and adoption moves nothing —
    the correct outcome, not a bug to work around.

    ``units-finished`` and ``integration-complete`` answer themselves: a
    requirement no run ever touched has zero units, so "every unit finished" is
    vacuously true and there is nothing to integrate. The gate says so in those
    words rather than being told to skip them.
    """
    from rotaris_core.requirements.delivery.completion import (
        CompletionEvidence as Evidence,
    )
    from rotaris_core.requirements.delivery.completion import CoveringTestEvidence
    from rotaris_core.verifier.requirement_evidence import (
        executed_test_runners,
        execution_for,
        verdict_for,
    )

    runners = executed_test_runners(list(checks))
    covering = tuple(
        CoveringTestEvidence(
            path=test.path,
            line=test.line,
            executed=(executed := execution_for(test.path, runners)) is not None,
            # ``verdict_for`` and not ``status == "passed"``: a suite that was
            # killed or failed as a whole reached this file without observing this
            # test, and adoption must refuse it as unknown rather than accuse it.
            passed=(verdict := verdict_for(executed, test_path=test.path, line=test.line))
            == "passed",
            inconclusive=verdict == "unknown",
        )
        for test in inputs.covering_tests
    )
    blocking = [check for check in checks if check.severity == "blocking"]
    return Evidence(
        req_id=requirement.req_id,
        current_hash=requirement.current_hash,
        implementation_traces=tuple(site.path for site in inputs.implementations),
        covering_tests=covering,
        # The verification that just ran *is* this requirement's completion gate:
        # there was no delivering run, and what a gate asserts — the declared
        # checks executed and passed — is exactly what was measured. Advisory
        # checks do not gate, the same way they do not gate a run (SWR-2604).
        gate_passed=bool(blocking) and all(str(check.status) == "passed" for check in blocking),
        gate_detail="; ".join(f"{check.name} {check.status}" for check in checks),
        blockers=tuple(blockers),
    )


@traces(SWR.SWR_2606, SWR.SWR_3217)
def _unattributable_suite(checks: Sequence[CheckResult]) -> str:
    """Why this suite can judge nothing, or ``""`` when it can judge.

    A suite judges nothing when every test runner in it was killed or failed as a
    whole: there is then no check whose result can be read as a statement about
    any individual test. A suite with *no* test runner at all is a different case
    and stays outside this — the gate refuses those candidates for a missing
    covering test, which is true and actionable.
    """
    from rotaris_core.verifier.requirement_evidence import executed_test_runners

    runners = executed_test_runners(list(checks))
    if not runners:
        return ""
    if any(str(runner.status) == "passed" for runner in runners):
        return ""
    killed = [runner for runner in runners if str(runner.status) == "timeout"]
    how = "timed out" if killed else "did not pass"
    names = ", ".join(sorted({runner.name for runner in runners}))
    said = (
        f"the check suite that would have verified this workspace {how} ({names}),"
        " so no covering test was observed and nothing could be judged"
    )
    # A killed check carries the budget it was killed by (SWR-2621). Without it
    # the user is told the suite timed out and left to guess by how much.
    budget = next(
        (warning for runner in killed for warning in runner.warnings if "budget" in warning),
        "",
    )
    return f"{said}. {budget}" if budget else said


@traces(SWR.SWR_3217, SWR.SWR_3614)
def adopt_existing_work(
    workspace: Path,
    *,
    requirements: Sequence[CanonicalRequirement],
    evidence_for: Callable[[CanonicalRequirement], EvidenceInputs],
    checks: Sequence[CheckResult] = (),
    actor_name: str = "",
    run_id: str = "",
    commit: str | None = None,
    at: dt.datetime | None = None,
    progress: PassProgress | None = None,
) -> AdoptionReport:
    """Take over every requirement whose completion conditions actually hold.

    The composition root for SWR-3217, and thin on purpose: the candidate rules
    and the write loop are the engine's, the gate is SWR-3215's unmodified, and
    all this adds is the workspace's collaborators — the delivery store, the
    hierarchy that knows what an epic is, and the evidence reader whose sweep the
    board already runs on every read.

    *checks* are the results of the verification the user asked for. Passing none
    is not an error and not a shortcut: the gate then refuses every candidate for
    ``covering-tests-passed``, and the report says so per requirement (SWR-3609).

    A suite that *ran* and observed nothing is the third case, and it is not the
    same as either. Judging against it would refuse every candidate while naming
    covering tests that were never measured, so the pass stops before the gate and
    reports the run instead (:func:`unjudged_adoption`).
    """
    from rotaris_core.requirements.delivery.adoption import (
        adopt,
        adoption_candidates,
        unjudged_adoption,
    )
    from rotaris_core.requirements.delivery.completion import completion_gate
    from rotaris_core.requirements.delivery.epics import epic_transitions, is_epic
    from rotaris_core.requirements.delivery.state import DeliveryActor
    from rotaris_core.requirements.delivery.store import DeliveryStore
    from rotaris_core.requirements.model import build_hierarchy

    moment = at if at is not None else _utc_now()
    store = DeliveryStore(workspace)
    tree = build_hierarchy(tuple(requirements))
    by_id = {requirement.req_id: requirement for requirement in requirements}
    index = store.load_all()
    records = {req_id: index.get(req_id) for req_id in by_id}

    def evidence(_record: object, request: TransitionRequest) -> CompletionEvidence:
        requirement = by_id[request.req_id]
        return adoption_evidence(requirement, evidence_for(requirement), checks=checks)

    candidates, skipped = adoption_candidates(
        requirements,
        records,
        is_epic=lambda req_id: is_epic(req_id, tree),
    )
    unattributable = _unattributable_suite(checks)
    if unattributable:
        return unjudged_adoption(
            candidates,
            reason=unattributable,
            skipped=skipped,
            run_id=run_id or f"adoption-{moment:%Y%m%d-%H%M%S}",
            commit=commit,
            at=moment,
        )
    return adopt(
        candidates,
        epic_transitions(store, tree, completion=completion_gate(evidence)),
        actor=DeliveryActor.user(actor_name),
        run_id=run_id or f"adoption-{moment:%Y%m%d-%H%M%S}",
        at=moment,
        commit=commit,
        skipped=skipped,
        progress=progress,
    )


@traces(SWR.SWR_3217)
@traces(SWR.SWR_3620)
def adoption_verification(
    workspace: Path,
    *,
    progress: PassProgress | None = None,
) -> tuple[Sequence[CheckResult], str]:
    """Run the workspace's own check suite, for adoption to judge against.

    The same suite a delivering run is measured by (SWR-2602) — resolved from the
    workspace's configuration and executed in the workspace itself, because the
    thing being verified is the code that is already there rather than a
    worktree's copy of it.

    Returns the results and the sentence to show when there are none. A workspace
    that declares no checks gets an empty suite and a stated reason, never an
    invented pass: "nobody checked" and "everything holds" are different answers
    and only one of them earns ``Done`` (SWR-3215).
    """
    import asyncio

    from rotaris_core.config.loader import load_config
    from rotaris_core.requirements.pass_progress import PassPhase, check_suite_progress, notify
    from rotaris_core.verifier.change_detection import WorkspaceChangeSignal
    from rotaris_core.verifier.runner import run_check_suite
    from rotaris_core.verifier.suite import resolve_check_suite

    suite = resolve_check_suite(load_config(workspace), workspace)
    if not suite.checks:
        return (), NO_CHECK_SUITE
    notify(progress, "on_phase", PassPhase.CHECKS, len(suite.checks))
    run = asyncio.run(
        run_check_suite(
            suite,
            workspace_root=workspace,
            change=WorkspaceChangeSignal(
                changed=True,
                reason="adopting the work this repository already contains",
                sources=("adoption",),
            ),
            progress=check_suite_progress(progress),
        ),
    )
    if not run.executed:
        return (), run.skip_reason or NO_CHECK_SUITE
    return tuple(run.results), ""


@traces(SWR.SWR_3217, SWR.SWR_3614, SWR.SWR_3220)
def adopt_workspace(
    workspace: Path,
    *,
    actor_name: str = "",
    at: dt.datetime | None = None,
    verify: Callable[[Path], tuple[Sequence[CheckResult], str]] | None = None,
    progress: PassProgress | None = None,
) -> AdoptionReport:
    """Verify this workspace and adopt everything the verification supports.

    What the board's offer runs (SWR-3614). Composed here rather than in the
    controller so the same pass is reachable from a headless caller, and so the
    Qt side never touches the registry, the sweep or the check runner directly.

    *verify* is the seam a test replaces; production runs
    :func:`adoption_verification`, which is a real suite over the real
    repository — the only thing that can make ``covering-tests-passed`` true.

    The suite it runs is also *kept* (SWR-3220), which is the half adoption was
    missing: before this, adoption moved a requirement to ``Done`` and threw away
    the measurement that earned it, so the card showed ``Done`` beside a ring that
    still read ``Incomplete Traceability``. The delivery and the verification are
    two records of one event, and they are written from one run.
    """
    from functools import partial

    from rotaris_core.requirements.delivery.adoption import AdoptionReport as Report
    from rotaris_core.requirements.delivery.projection import CoverageEvidence
    from rotaris_core.requirements.delivery.verification import VerificationOrigin
    from rotaris_core.requirements.pass_progress import PassPhase, notify
    from rotaris_core.requirements.verification_host import verify_requirements

    source = requirement_source_for(workspace)
    if source is None:
        # No requirement source: there is nothing to adopt and nothing to say
        # about it. The board's own "unavailable" path (SWR-3312) already tells
        # the user why the area is empty.
        return Report()
    notify(progress, "on_phase", PassPhase.READING)
    requirements = tuple(source.read().requirements)
    # Progress is bound onto the production runner rather than widening the
    # *verify* seam, which every test double replaces with a one-argument
    # callable (SWR-3620).
    runner = verify if verify is not None else partial(adoption_verification, progress=progress)
    checks, _reason = runner(workspace)
    notify(progress, "on_phase", PassPhase.COVERAGE)
    evidence = CoverageEvidence.for_repository(workspace)
    report = adopt_existing_work(
        workspace,
        requirements=requirements,
        evidence_for=evidence.evidence_for,
        checks=checks,
        actor_name=actor_name,
        commit=_head_commit(workspace),
        at=at,
        progress=progress,
    )
    # Recorded after the adoption and from the same run, so a card that says
    # `Done · adopted` has the measurement behind it rather than beside it.
    verify_requirements(
        workspace,
        requirements=requirements,
        evidence_for=evidence.evidence_for,
        checks=checks,
        at=at,
        origin=VerificationOrigin.ADOPTED,
        progress=progress,
    )
    return report


def _head_commit(workspace: Path) -> str | None:
    """The commit adoption verified against, or ``None`` outside a repository.

    Recorded on every adopted delivery so "which code was this confirmed against"
    stays answerable (SWR-3204). A workspace that is not a git checkout adopts
    just as well; it simply cannot name a commit, and saying so beats inventing
    one.

    Asked of the engine rather than run here. The desktop reads the engine as a
    library and starts no processes of its own (SWR-3311) — the one exemption
    this module holds is the agent run host, and widening it for a convenience
    would make the rule a suggestion.
    """
    import contextlib

    from rotaris_core.requirements.execution.worktrees import GitWorktreeInspector

    with contextlib.suppress(Exception):
        return GitWorktreeInspector().head(workspace) or None
    return None
