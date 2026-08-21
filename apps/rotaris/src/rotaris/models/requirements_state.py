"""What the requirements area shows, as plain values (SWR-3304, SWR-3307).

The board renders one thing and one thing only: the engine's board projection
(SWR-3216). This module is the translation between that projection and the
widgets — id, badges, ring segments, the sentences a card states, the five
sections of the detail view — and it is deliberately **framework-free**, exactly
like :mod:`rotaris.models.state`.

Three properties are load-bearing:

- **Nothing is derived here.** Health, evidence state, delivery state and epic
  progress arrive computed and are carried through verbatim (SWR-3311). This
  module chooses words and order; it never chooses a verdict. A test asserts the
  rendered health is the projection's, character for character.
- **Absent is not blank.** A requirement with no run, no units and no priority
  produces a card with no run row, no unit row and no priority row — not rows
  holding ``—`` (SWR-3304). The same rule runs through the detail view, where
  each of the five sections carries its own stated empty message (SWR-3307)
  instead of one shared "nothing here".
- **Words, not only colour.** ``Specification changed``, ``Blocked``,
  ``Tests failing`` are sentences on the card. The colour tokens in
  :mod:`rotaris.theme` are a second channel over the top of them, never the only
  one.

The same three properties hold for the values the *writing* half of the board
needs — :class:`PendingAction` and :class:`ActionFeedback` for a move and its
answer (SWR-3601, SWR-3602), :class:`Blocker` for a question the engine
escalated (SWR-3607), :class:`QueueState` for what the scheduler will run next
(SWR-3608). None of them decides anything: a refusal's reason is the transition
function's own stated precondition, a blocker's options and their consequences
are the engine's, and the queue is rendered in the order the scheduler chose
rather than in one this module computed.

Purity is what makes all of that testable without Qt and without a repository:
every function here takes its inputs, including the clock, and returns a value.
The engine's own types are imported only for typing, so importing this module —
which :mod:`rotaris.models.store` does at startup — never drags the requirement
engine into a desktop launch that may never open the board.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from functools import cache, cached_property
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    import datetime as dt
    from collections.abc import Iterable

    from rotaris_core.requirements.delivery.history import RevisionEntry
    from rotaris_core.requirements.delivery.projection import (
        BoardEntry,
        BoardProjection,
        QueueView,
    )

    from rotaris.models.state import UiNotice

__all__ = [
    "DETAIL_SECTIONS",
    "NO_HISTORY_REASON",
    "PENDING_HISTORY_REASON",
    "READ_ONLY_SOURCE_NOTICE",
    "ActionFeedback",
    "Blocker",
    "BlockerChoice",
    "BoardColumn",
    "DetailSection",
    "EvidenceSegment",
    "PendingAction",
    "QueueCandidate",
    "QueueRun",
    "QueueState",
    "RelationLink",
    "RequirementCard",
    "RequirementDetail",
    "RequirementFact",
    "RequirementsBoardState",
    "Revision",
    "SourceProposalOffer",
    "build_blockers",
    "build_board_state",
    "build_card",
    "build_detail",
    "build_queue_state",
    "counted",
    "describe_age",
    "describe_moment",
]


# ── the small values a card and a section are made of ──────────────────────


@dataclass(frozen=True)
class RequirementFact:
    """One labelled fact. Present only when the projection had it.

    A fact with an empty value is never constructed: "omitted cleanly when not
    present" (SWR-3304) is enforced by the builders below rather than left to
    each widget to remember.

    :attr:`detail` is the exact value behind a rounded one — today always the
    absolute moment behind a relative age (:func:`describe_moment`). It is part
    of :attr:`sentence`, because a surface with a line to spare should print
    what a user can check, and it is deliberately *not* part of :attr:`glance`,
    because a card is read at a glance and "3 hours ago" is what is read there.
    A card offers the rest in its tooltip and its accessible description, so the
    exact moment is one hover away rather than one screen away.
    """

    label: str
    value: str
    detail: str = ""

    @property
    def glance(self) -> str:
        """``Last change: just now`` — the fact as a card paints it."""
        return f"{self.label}: {self.value}"

    @property
    def sentence(self) -> str:
        """``Priority: Critical`` — what a screen reader announces."""
        return f"{self.glance} ({self.detail})" if self.detail else self.glance


@dataclass(frozen=True)
class EvidenceSegment:
    """One obligation as the traceability ring shows it (SWR-3305, SWR-3306).

    ``state`` is the engine's own token, so :func:`rotaris.theme.evidence_color`
    resolves the colour and no view has to know one. ``detail`` carries the
    reason the engine gave, because a ring segment without a reason is the
    colour-only encoding SWR-3304 forbids.
    """

    kind: str
    label: str
    state: str
    state_label: str
    detail: str = ""
    required: bool = True

    @property
    def sentence(self) -> str:
        """``Test: Failed — covering-test-failed``."""
        because = f" — {self.detail}" if self.detail else ""
        return f"{self.label}: {self.state_label}{because}"


@dataclass(frozen=True)
class RelationLink:
    """One related requirement, and whether the store actually contains it.

    An unresolved target is a link that still names its id (SWR-3307): hiding a
    dangling ``depends-on`` would make the board quietly wrong about the
    project.
    """

    kind: str
    label: str
    req_id: str
    resolved: bool = True

    @property
    def sentence(self) -> str:
        """``Depends on SWR-3101`` — or ``… (unresolved)`` when it dangles."""
        missing = " (unresolved)" if not self.resolved else ""
        return f"{self.label} {self.req_id}{missing}"


# ── what a board action looks like while it happens (SWR-3601, SWR-3602) ───


@traces(SWR.SWR_3601)
@dataclass(frozen=True)
class PendingAction:
    """A board action the engine has not answered yet.

    SWR-3601 asks for the *work* to be visible, not only the moved card: a drop
    on ``Ready`` that starts a run has a moment between the drop and the run in
    which the honest thing to show is "releasing this requirement", and a card
    that simply sat in its new column would be claiming a state the engine had
    not accepted.
    """

    req_id: str
    action: str
    #: What is happening, in words — ``Releasing SWR-3101 for implementation``.
    label: str
    source: str = ""
    target: str = ""

    @property
    def sentence(self) -> str:
        """``Releasing SWR-3101 for implementation — Backlog → Ready``."""
        move = f" — {_label(self.source)} → {_label(self.target)}" if self.target else ""
        return f"{self.label}{move}"


@traces(SWR.SWR_3602)
@dataclass(frozen=True)
class ActionFeedback:
    """What became of a board action — in the engine's words, never the board's.

    :attr:`reason` is the refused transition's own stated precondition and
    :attr:`details` its unmet conditions (SWR-3203, SWR-3215). Nothing here is
    composed from a UI-side guess, which is the whole of SWR-3602: a user told
    "not allowed" repeats the action, a user told "Done records the specification
    version that was delivered" does not.

    A refusal is deliberately *not* an error: :attr:`severity` stays at
    ``warning`` so the board does not enter a failure state over a move it
    correctly declined.
    """

    req_id: str
    action: str
    title: str
    reason: str = ""
    details: tuple[str, ...] = ()
    #: The column the card springs back to (SWR-3601).
    source: str = ""
    target: str = ""
    accepted: bool = False
    severity: str = "warning"

    @property
    def sentence(self) -> str:
        """``SWR-3101 could not be accepted — every completion condition holds``."""
        because = f" — {self.reason}" if self.reason else ""
        return f"{self.title}{because}"

    @property
    def message(self) -> str:
        """The sentence plus every named condition, for a screen reader."""
        extra = ("; " + "; ".join(self.details)) if self.details else ""
        return f"{self.sentence}{extra}"


# ── blockers, as the detail view offers them (SWR-3607) ────────────────────


@traces(SWR.SWR_3607)
@dataclass(frozen=True)
class BlockerChoice:
    """One answer the user may give, and what it will cause.

    The consequence is the engine's (:class:`~rotaris_core.requirements.delivery
    .projection.BlockerOption`): an option whose effect the board invented would
    be a button nobody can take responsibility for.
    """

    key: str
    label: str = ""
    consequence: str = ""

    @property
    def sentence(self) -> str:
        """``Split the requirement — creates two requirements and re-plans``."""
        name = self.label or self.key
        return f"{name} — {self.consequence}" if self.consequence else name


@traces(SWR.SWR_3607)
@dataclass(frozen=True)
class Blocker:
    """One raised blocker, its question and its answer path (SWR-3607)."""

    req_id: str
    kind: str
    reason: str
    question: str = ""
    decision_id: str = ""
    choices: tuple[BlockerChoice, ...] = ()
    #: The requirements that block or contradict this one (SWR-3510, SWR-3511).
    blocking_ids: tuple[str, ...] = ()

    @property
    def answerable(self) -> bool:
        """Whether this blocker can be resolved from the board at all."""
        return bool(self.choices)

    @property
    def sentence(self) -> str:
        """``Dependency: SWR-3101 has not been delivered``."""
        return f"{_label(self.kind)}: {self.reason}"

    @property
    def accessible_description(self) -> str:
        """Every fact of this blocker, in reading order."""
        parts = [self.sentence, self.question, *(choice.sentence for choice in self.choices)]
        if self.blocking_ids:
            parts.append("Blocked by " + ", ".join(self.blocking_ids))
        return ". ".join(part for part in parts if part)


# ── the delivery queue, as the board shows and controls it (SWR-3608) ──────


@traces(SWR.SWR_3608)
@dataclass(frozen=True)
class QueueCandidate:
    """One candidate in the delivery queue, and why it is where it is.

    A held candidate always carries the scheduler's own stated reason: a queue
    that shows *what* is held without *why* is the risk SWR-3608 names.
    """

    req_id: str
    unit_id: str = ""
    position: int = 0
    priority: str = ""
    held: bool = False
    hold_reason: str = ""
    waiting_for: tuple[str, ...] = ()

    @property
    def what(self) -> str:
        """``SWR-3101/unit-2`` — the candidate, unit and all."""
        return f"{self.req_id}/{self.unit_id}" if self.unit_id else self.req_id

    @property
    def sentence(self) -> str:
        """``#2 SWR-3101`` — or ``SWR-3101: held — waits for SWR-3100``."""
        if self.held:
            waiting = f" (waits for {', '.join(self.waiting_for)})" if self.waiting_for else ""
            return f"{self.what}: held — {self.hold_reason}{waiting}"
        return f"#{self.position} {self.what}"


@traces(SWR.SWR_3608, SWR.SWR_3611, SWR.SWR_3612)
@dataclass(frozen=True)
class QueueRun:
    """One run in flight, and where its activity already lives (SWR-3612).

    :attr:`session_id` is what makes the queue navigable rather than a second
    transcript: the run's own surfaces are the Workspace, Mission and Git views,
    and this is the id that focuses them.

    :attr:`interrupted` is the other half of that honesty (SWR-3611): after a
    restart, a run whose process is gone is carried through as *interrupted*
    rather than being rendered as still running. The engine decides which it is;
    this only refuses to lose the distinction.
    """

    req_id: str
    run_id: str
    unit_id: str = ""
    session_id: str = ""
    branch: str = ""
    worktree_path: str = ""
    outcome: str = ""
    interrupted: bool = False

    @property
    def sentence(self) -> str:
        """``SWR-3101/unit-1 — run-7 (Running)``."""
        what = f"{self.req_id}/{self.unit_id}" if self.unit_id else self.req_id
        state = f" ({_label(self.outcome)})" if self.outcome else ""
        return f"{what} — {self.run_id}{state}"


@traces(SWR.SWR_3608)
@dataclass(frozen=True)
class QueueState:
    """The delivery queue at one moment, exactly as the scheduler decided it."""

    candidates: tuple[QueueCandidate, ...] = ()
    running: tuple[QueueRun, ...] = ()
    automatic: bool = False
    concurrency_limit: int = 0
    #: The user stopped the queue. Work already in flight keeps running, which is
    #: why this is a fact of its own rather than "the queue is empty" (SWR-3608).
    stopped: bool = False
    updated_at: dt.datetime | None = None

    @property
    def ready(self) -> tuple[QueueCandidate, ...]:
        """The candidates the scheduler will start, in the order it will use."""
        return tuple(
            sorted(
                (candidate for candidate in self.candidates if not candidate.held),
                key=lambda candidate: (candidate.position, candidate.req_id),
            ),
        )

    @property
    def held(self) -> tuple[QueueCandidate, ...]:
        """Every held candidate, each with its stated reason."""
        return tuple(candidate for candidate in self.candidates if candidate.held)

    @property
    def next_up(self) -> QueueCandidate | None:
        """What runs next, or ``None`` when nothing will."""
        ready = self.ready
        return ready[0] if ready else None

    @property
    def empty(self) -> bool:
        """Whether the queue holds nothing at all."""
        return not (self.candidates or self.running)

    @property
    def summary(self) -> str:
        """One line: what runs, what is next, what is held, and whether it is on."""
        mode = "Automatic scheduling is on" if self.automatic else "Automatic scheduling is off"
        if self.stopped:
            mode = "The queue is stopped"
        following = self.next_up
        nxt = f"next {following.what}" if following is not None else "nothing queued"
        return (
            f"{mode} · {len(self.running)} running · {nxt}"
            f" · {len(self.held)} held · limit {self.concurrency_limit or 'unset'}"
        )


# ── the card (SWR-3304) ────────────────────────────────────────────────────


@dataclass(frozen=True)
class RequirementCard:
    """One requirement as a card shows it, without opening it.

    Everything SWR-3304 lists: id, title, the two badges, the delivery
    condition, the ring, the unit count and the age of the last run — plus the
    exceptional facts as sentences in :attr:`alerts`, and the optional facts in
    :attr:`facts`, which holds only the ones the projection actually had.
    """

    req_id: str
    title: str
    lifecycle: str
    lifecycle_label: str
    delivery: str
    delivery_label: str
    health: str
    health_label: str
    evidence_state: str
    evidence: tuple[EvidenceSegment, ...] = ()
    #: Stated exceptional facts — ``Specification changed``, ``Blocked: …``,
    #: ``Tests failing``. Sentences, never a colour on its own (SWR-3304).
    alerts: tuple[str, ...] = ()
    #: Priority, parent epic, dependencies, assigned agent, last change — each
    #: present only when the projection carried it.
    facts: tuple[RequirementFact, ...] = ()
    unit_count: int = 0
    #: ``2 execution units`` / ``No execution units yet``. Always a sentence:
    #: the empty case is a fact about the requirement, not a blank (SWR-3304).
    units_label: str = "No execution units yet"
    last_run_label: str = "Never run"
    #: The exact moment behind :attr:`last_run_label`, as
    #: :func:`describe_moment` renders it — empty for a requirement nothing has
    #: ever run.
    last_run_moment: str = ""
    is_epic: bool = False
    epic_label: str = ""
    schedulable: bool = False
    #: The state a blocked requirement returns to once its blocker clears
    #: (SWR-3201). Carried on the card because it is the *only* target a user
    #: may move a blocked card to, and the board offers drop targets without
    #: opening the requirement (SWR-3601).
    blocked_from: str = ""
    #: The specification version this card was drawn from (SWR-3107). Carried so
    #: a board action can record the hash it acted on (SWR-3610) without opening
    #: the requirement first.
    current_hash: str = ""

    @property
    def accessible_name(self) -> str:
        """``SWR-3304 Requirement card`` — how the card is announced."""
        return f"{self.req_id} {self.title}".strip()

    @property
    def last_run_announced(self) -> str:
        """The last run with the exact moment behind its age, when there is one.

        The card paints :attr:`last_run_label` — the relative form is what a
        board is scanned with — and announces this, so a reader who cannot hover
        a tooltip is not the one reader who never learns when the run was.
        """
        if not self.last_run_moment:
            return self.last_run_label
        return f"{self.last_run_label} ({self.last_run_moment})"

    @property
    def accessible_description(self) -> str:
        """Every fact the card states, in reading order.

        Assembled from the same values the widgets paint, so a control that
        shows something the description omits is a bug in one place rather than
        a divergence between the visual and the announced card.
        """
        parts = [
            f"{self.lifecycle_label}, {self.delivery_label}",
            f"health {self.health_label}",
            *self.alerts,
            self.units_label,
            self.last_run_announced,
            *(fact.sentence for fact in self.facts),
        ]
        if self.epic_label:
            parts.insert(1, self.epic_label)
        return ". ".join(part for part in parts if part)


# ── the detail view (SWR-3307) ─────────────────────────────────────────────


#: The five sections SWR-3307 names, in order, with the message each shows when
#: it has nothing. Declared as data so the view cannot render four of them and
#: so a section's empty state is written once rather than per widget.
DETAIL_SECTIONS: tuple[tuple[str, str, str], ...] = (
    ("requirement", "Requirement", "This requirement could not be read from its source."),
    ("relations", "Relations", "This requirement stands on its own: no epic, no relations."),
    ("execution", "Execution", "Nothing has run for this requirement yet."),
    ("traceability", "Traceability", "No implementation site and no covering test are recorded."),
    ("verification", "Verification", "Nothing has verified this requirement yet."),
)


@dataclass(frozen=True)
class DetailSection:
    """One section of the detail view, with its own stated empty state."""

    key: str
    title: str
    empty_message: str
    facts: tuple[RequirementFact, ...] = ()
    links: tuple[RelationLink, ...] = ()
    lines: tuple[str, ...] = ()
    body: str = ""

    @property
    def empty(self) -> bool:
        """Whether this section has nothing to show — and says so itself."""
        return not (self.facts or self.links or self.lines or self.body)


#: What the history panel says when the projection carried no revision history
#: and none is on its way. "This source keeps no history" and "this requirement
#: has one revision" are different facts, and only the engine can tell them
#: apart — so the desktop states the absence rather than inventing a list
#: (SWR-3313).
NO_HISTORY_REASON = (
    "Source history is unavailable for this requirement: no revision history was reported for it."
)

#: While the deep read is in flight. A detail view opens on the board's own
#: projection, which does not carry the revision history — reading it means
#: reading the source's own revisions, and that happens off the Qt thread
#: (SWR-3312). Saying "unavailable" during that second would be wrong.
PENDING_HISTORY_REASON = "Reading the revision history of this requirement…"

#: What the detail view says instead of offering an edit control, when the
#: originating source cannot be written (SWR-3605, SWR-3105). Named rather than
#: composed at the widget, because the notice, the tooltip and the accessible
#: description all have to be the same sentence.
READ_ONLY_SOURCE_NOTICE = "Source is read-only"


@dataclass(frozen=True)
class Revision:
    """One version of a requirement, and what became of it (SWR-3313).

    The rendering value behind
    :class:`~rotaris_core.requirements.delivery.history.RevisionEntry`: the
    engine decides which versions exist, which one is current and which run
    delivered which; this chooses the words for them and nothing else
    (SWR-3311).
    """

    requirement_hash: str
    outcome: str
    run_id: str = ""
    commit: str = ""
    delivered: bool = False
    current: bool = False
    when: str = ""
    #: The exact moment behind :attr:`when`. A history panel is the one surface
    #: where two entries are read against each other, so it prints both.
    moment: str = ""
    #: The source's own one-line description of the revision, when it has one.
    subject: str = ""

    @property
    def sentence(self) -> str:
        """``a1b2c3 — Delivered by run-7 (current)`` — one line of history."""
        marks = [self.outcome]
        if self.run_id:
            marks.append(f"run {self.run_id}")
        if self.commit:
            marks.append(f"commit {self.commit}")
        if self.when:
            marks.append(f"{self.when} ({self.moment})" if self.moment else self.when)
        if self.subject:
            marks.append(self.subject)
        if self.current:
            marks.append("current revision")
        return f"{self.requirement_hash} — {', '.join(marks)}"


@traces(SWR.SWR_3616)
@dataclass(frozen=True)
class ChangeWork:
    """What a change asks for, as the detail view offers it (SWR-3616).

    Every sentence is the engine's. A board that phrased "this would create two
    units" itself would be a button nobody can take responsibility for — the same
    rule the blocker options follow (SWR-3512).
    """

    req_id: str
    #: The analyst's verdict, as its own token (``tests-affected``).
    outcome: str
    #: One line: what this costs and what accepting would do.
    summary: str
    reasoning: str = ""
    units: tuple[str, ...] = ()
    verifies_instead: bool = False
    decomposes: bool = False

    @property
    def cost(self) -> str:
        """What accepting spends, in the words a person decides on.

        Stated because the two are different decisions: minutes of this
        workspace's own test suite, or an agent run against a model.
        """
        if self.verifies_instead:
            return "Runs this workspace's checks once. No agent run."
        if self.decomposes:
            return "Plans the split first; no agent runs until the plan is there."
        return (
            f"Starts {counted(len(self.units), 'agent run')}"
            " when the queue reaches this requirement."
        )


@dataclass(frozen=True)
class RequirementDetail:
    """Everything about one requirement, in one place (SWR-3307)."""

    req_id: str
    title: str
    sections: tuple[DetailSection, ...] = ()
    #: The two axes a board card carries, in the engine's own tokens and words
    #: (SWR-3202). The detail view states them where a card would — as badges
    #: beside the id — and a badge has to be able to *colour* itself, which the
    #: pre-composed sentence in the requirement section cannot do. Both are here
    #: so the two surfaces answer "what state is this in" identically.
    lifecycle: str = ""
    lifecycle_label: str = ""
    delivery: str = ""
    delivery_label: str = ""
    #: The derived health axis (SWR-3211), same reason.
    health: str = ""
    health_label: str = ""
    #: Priority and parent epic — the two facts a board card shows that the
    #: detail view previously had no way to say at a glance. Empty when the
    #: projection carried neither, which is the common case for a loose
    #: requirement.
    priority: str = ""
    priority_label: str = ""
    epic: str = ""
    #: Whether this requirement is itself an epic (SWR-3304).
    is_epic: bool = False
    #: Every known version of this requirement, oldest first (SWR-3313). Empty
    #: when the projection carried no history — which is *not* the same as "this
    #: requirement has never had one", and :attr:`history_reason` says which.
    revisions: tuple[Revision, ...] = ()
    #: Whether the source's own revision history could be read. ``False`` with
    #: revisions present is a real state: a store outside version control still
    #: has the versions Rotaris recorded itself.
    history_available: bool = False
    #: Why the history is not what it could be, in the engine's own words.
    history_reason: str = ""
    #: The source's own text as this pass read it — what an editor opens on
    #: (SWR-3605). Never a Rotaris copy (SWR-3114).
    description: str = ""
    #: Whether the originating source accepts an edit of this requirement
    #: (SWR-3105, SWR-3605). The engine's answer, carried through.
    editable: bool = False
    source_id: str = ""
    source_path: str = ""
    #: Every blocker raised against this requirement, with its answer path
    #: (SWR-3607).
    blockers: tuple[Blocker, ...] = ()
    #: What this requirement's last change was analysed to cost, waiting for
    #: somebody to accept it (SWR-3616). ``None`` for the common card: nothing
    #: was edited, or the work has already been released.
    offer: ChangeWork | None = None

    def section(self, key: str) -> DetailSection | None:
        """One section by key, or ``None`` when this detail carries none."""
        return next((section for section in self.sections if section.key == key), None)

    @property
    def links(self) -> tuple[RelationLink, ...]:
        """Every navigable relation, across sections (SWR-3307)."""
        return tuple(link for section in self.sections for link in section.links)

    @property
    def read_only_reason(self) -> str:
        """Why this requirement cannot be edited here — naming the source.

        ``""`` when it can. Stated rather than shown as a disabled field with no
        explanation, and it names the source so the user knows *where* the text
        lives instead (SWR-3605).
        """
        if self.editable:
            return ""
        where = self.source_path or self.source_id or "its source"
        source = f" ({self.source_id})" if self.source_id and self.source_path else ""
        return f"{READ_ONLY_SOURCE_NOTICE}: {where}{source} cannot be written from Rotaris."


# ── the board (SWR-3302, SWR-3312) ─────────────────────────────────────────


@dataclass(frozen=True)
class BoardColumn:
    """One delivery column: its state token, its heading and what is in it."""

    key: str
    label: str
    req_ids: tuple[str, ...] = ()

    @property
    def count(self) -> int:
        """What the column header prints."""
        return len(self.req_ids)


@traces(SWR.SWR_3614)
@dataclass(frozen=True)
class AdoptionOffer:
    """What the board offers a workspace Rotaris has never worked in (SWR-3614).

    A finding and an offer, never an action taken: adoption writes a delivery
    record for potentially every requirement in a project and runs the project's
    verification to do it, and both are things a user chooses. This is the same
    principle SWR-3613 settled for derived requirements — what Rotaris concludes
    is offered, and acceptance is what writes.
    """

    #: How many requirements already carry an implementation trace.
    traced: int = 0
    #: How many the project has in total.
    total: int = 0

    @property
    def worth_offering(self) -> bool:
        """Whether there is anything here to offer.

        Nothing traced means nothing adoption could confirm, and an offer that
        would adopt nothing is noise.
        """
        return self.traced > 0 and self.total > 0

    @property
    def title(self) -> str:
        """The heading, stating the finding in numbers read off the projection."""
        return f"{self.traced} of {self.total} requirements already have implementation traces"

    @property
    def message(self) -> str:
        """What adoption will do, and the cheaper alternative beside it.

        The alternative names *epic* and *lifecycle* rather than health, and the
        difference is not cosmetic: before anything has been verified, health is
        as degenerate as delivery state is. Every requirement owes a verification
        (SWR-3206) and none has one yet, so the whole board reads ``Incomplete
        Traceability`` — truthfully, and just as uselessly as one Backlog column.
        Epic and lifecycle are the axes that actually separate a project on the
        day it adopts Rotaris; health becomes worth grouping by *after* a
        verification has run.
        """
        return (
            "Rotaris has not delivered any of them. Verifying runs this workspace's"
            " check suite and moves only what passes to Done — nothing is written"
            " until you accept. To look at the project without writing anything,"
            " group the board by epic or lifecycle instead."
        )


#: The phases an adoption or verification pass walks, in the order it walks
#: them (SWR-3320). Verification stops after ``recording``; adoption is the only
#: pass that reaches ``adopting``, which is why the number of steps is carried
#: on the value rather than read off this tuple.
PASS_PHASES: tuple[str, ...] = ("reading", "checks", "coverage", "recording", "adopting")

#: What each phase is doing, in the words a user reads. Held beside the phase
#: tokens rather than in the view: the controller's status line and the board's
#: banner both say it, and two hand-written copies are two sentences that
#: eventually disagree.
PASS_PHASE_SENTENCES: dict[str, str] = {
    "reading": "Reading requirement sources",
    "checks": "Running this workspace's check suite",
    "coverage": "Sweeping coverage across the repository",
    "recording": "Recording verifications",
    "adopting": "Adopting what the verification supports",
}

#: What a phase's counter counts. A phase absent here has no denominator at all
#: and states none — an invented one is worse than no number.
PASS_PHASE_UNITS: dict[str, str] = {
    "checks": "checks",
    "recording": "requirements",
    "adopting": "candidates",
}


@traces(SWR.SWR_3320)
@dataclass(frozen=True)
class PassProgress:
    """Where a running adoption or verification pass has got to (SWR-3320).

    The shape of :class:`~rotaris.models.state.VerifierSummary` and for its
    reasons: a frozen value of plain scalars that crosses the worker boundary,
    with the two continuously-changing things — the elapsed clock and the fill
    of a bar — derived from it on the surface rather than written into it on
    every tick.

    Narration only. What may be clicked follows from ``adopting`` / ``verifying``
    (SWR-3614, SWR-3615), never from this: a progress value that arrives late,
    is throttled away, or never arrives at all must not be able to enable a
    control.

    There is deliberately no percentage for the pass as a whole. One phase — the
    check suite — dominates it and its duration is unknown until it ends, so a
    single bar would sit near a tenth for minutes and then jump, and a number
    that behaves that way teaches a user to disregard the number.
    """

    #: Whether a pass is running. False is the value a finished pass returns to.
    active: bool = False
    #: ``"adoption"`` or ``"verification"`` — which pass this is.
    kind: str = ""
    #: One of :data:`PASS_PHASES`. Empty before the first phase is reported.
    phase: str = ""
    #: 1-based position of the phase in this pass, and how many it has.
    step: int = 0
    steps: int = 0
    #: What the phase is working on right now — a check's name, a requirement's
    #: id. Empty for a phase that has no items.
    label: str = ""
    #: The item's detail line, e.g. the command a check invokes.
    detail: str = ""
    #: 1-based position within the phase, and the phase's total. ``total == 0``
    #: means this phase has no denominator and must render as indeterminate.
    index: int = 0
    total: int = 0
    #: ``time.time()`` when the pass and the current phase started, so both
    #: clocks are rendered on the surface instead of being written per tick.
    started_at: float = 0.0
    phase_started_at: float = 0.0
    #: The running check's effective timeout in seconds, after the suite budget.
    deadline_s: float = 0.0

    @property
    def position_label(self) -> str:
        """``"pytest (2/3)"`` — the item and where it sits in its phase."""
        if not self.label:
            return ""
        if self.total <= 0:
            return self.label
        return f"{self.label} ({self.index}/{self.total})"

    @property
    def counted(self) -> str:
        """``"812 of 1496 requirements"`` — the phase's own count, with its unit.

        Empty for a phase with no denominator. The unit travels with the number
        because a bare count beside a bare bar is exactly the ambiguity this
        requirement exists to remove.
        """
        unit = PASS_PHASE_UNITS.get(self.phase, "")
        if not unit or self.total <= 0:
            return ""
        return f"{self.index} of {self.total} {unit}"

    @property
    def phase_percent(self) -> int | None:
        """How far *this phase* has got, or ``None`` when it cannot be said.

        Named for the phase on purpose: nothing here is a percentage of the
        pass, and a shorter name would eventually be read as one.
        """
        if self.total <= 0 or self.index <= 0:
            return None
        return min(100, round(self.index * 100 / self.total))

    @property
    def sentence(self) -> str:
        """The line the board shows, without the clock the surface appends."""
        if not self.active:
            return ""
        doing = PASS_PHASE_SENTENCES.get(self.phase, "Starting")
        # No ordinal before the first phase reports: "Step 0 of 4" is a position
        # nothing is at.
        parts = [f"Step {self.step} of {self.steps}"] if self.steps and self.step else []
        parts.append(doing)
        position = self.position_label
        if position:
            parts.append(position)
        return " · ".join(parts)

    def elapsed(self, now: float) -> str:
        """``2:41`` — how long this pass has run, as a stopwatch reading.

        Computed from *now* rather than stored, which is the whole reason
        :attr:`started_at` is a timestamp: the surface redraws this once a
        second without the pass having to send anything. The stopwatch idiom is
        the run header's (SWR-2609), so the two long waits in this app read the
        same way.
        """
        if not self.started_at:
            return ""
        minutes, seconds = divmod(max(0, int(now - self.started_at)), 60)
        return f"{minutes}:{seconds:02d}"

    @property
    def summary(self) -> str:
        """The shorter line the status header shows — the phase and its count."""
        if not self.active:
            return ""
        doing = PASS_PHASE_SENTENCES.get(self.phase, "Starting")
        counted = self.counted
        return f"{doing} · {counted}" if counted else f"{doing}…"


@traces(SWR.SWR_3120, SWR.SWR_3106)
@dataclass(frozen=True)
class SourceProposalOffer:
    """The mapping Rotaris would read this workspace's requirements with.

    The same shape as :class:`AdoptionOffer` and for the same reason: a finding
    the board reports, and acceptance is what writes (SWR-3106). Nothing here
    has touched the workspace — :attr:`outcome` has already been *validated by
    loading it*, which is why :attr:`requirement_count` is a measurement rather
    than an estimate.

    :attr:`outcome` is carried rather than re-derived so that accepting costs no
    second analysis, and so that what is persisted is the proposal the user was
    shown: a re-run could legitimately answer differently and the user would
    then adopt a mapping nobody reviewed.
    """

    #: What discovery found, in the words it reports them.
    summary: str = ""
    #: The configuration exactly as it would be written to disk.
    config_document: str = ""
    #: How many requirements the mapping read when it was validated.
    requirement_count: int = 0
    #: Whether there is a validated configuration to adopt at all.
    acceptable: bool = False
    #: The ``DiscoveryOutcome`` behind this. Typed as ``object`` because the
    #: desktop's state model does not import the requirement engine (SWR-3311).
    outcome: object | None = None

    @property
    def worth_offering(self) -> bool:
        """Whether the board has a mapping a user could accept."""
        return self.acceptable and self.outcome is not None

    @property
    def title(self) -> str:
        """The heading, stating the finding in numbers read off the validation."""
        return f"Rotaris can read {counted(self.requirement_count, 'requirement')} here"


@traces(SWR.SWR_3318)
@dataclass(frozen=True)
class BoardGrouping:
    """One axis the board can group its columns by, as a surface reads it.

    The engine owns the vocabulary (``BoardAxis``) and this is its flattened
    form, held here rather than in the view because the board surfaces may not
    import the requirement engine at run time (SWR-3311) — and a second
    hand-written copy of the axis list in the view is exactly the divergence that
    rule exists to prevent.
    """

    key: str
    label: str
    #: Whether a drop between columns is a workflow action on this axis. Only
    #: delivery state is: health is derived and lifecycle is the project's, so
    #: dragging a card into one of their columns would promise a write that
    #: cannot happen (SWR-3601, SWR-3318).
    draggable: bool = False
    #: Every column this axis shows before a single card is looked at. Empty for
    #: the axes whose values the project invents — one per epic or source it
    #: actually has, rather than one per epic it might have.
    column_keys: tuple[str, ...] = ()
    #: What the column of requirements with no value on this axis is called.
    unset_label: str = ""


#: The axis a board opens on when nothing was remembered: SWR-3302's own answer.
#: Spelled here rather than imported so a board can be constructed before the
#: engine has been loaded; :func:`board_groupings` asserts the two agree.
DEFAULT_BOARD_AXIS = "delivery"


@traces(SWR.SWR_3318)
@cache
def board_groupings() -> tuple[BoardGrouping, ...]:
    """Every grouping the board offers, in the engine's own order (SWR-3318).

    The engine import is *inside* the function on purpose. This module is
    imported while the window is being built, and pulling the requirement engine
    in at that moment puts its whole dependency tree in front of a cheap widget —
    the cost this package's lazy-import convention exists to avoid. Cached
    because the answer is a fixed vocabulary, not projection data.
    """
    from rotaris_core.requirements.delivery.projection import (
        UNSET_COLUMN_LABELS,
        BoardAxis,
        axis_column_keys,
    )

    return tuple(
        BoardGrouping(
            key=str(axis),
            label=axis.label,
            draggable=axis.draggable,
            column_keys=axis_column_keys(axis),
            unset_label=UNSET_COLUMN_LABELS[axis],
        )
        for axis in BoardAxis
    )


@traces(SWR.SWR_3318)
def grouping_for(key: str) -> BoardGrouping:
    """The grouping *key* names, falling back to the delivery axis.

    A stored axis this build no longer offers must not leave the board unable to
    draw itself, so an unknown key resolves to the default rather than raising
    (SWR-3318).
    """
    groupings = board_groupings()
    by_key = {grouping.key: grouping for grouping in groupings}
    return by_key.get(key) or by_key[DEFAULT_BOARD_AXIS]


@dataclass(frozen=True)
class RequirementsBoardState:
    """The whole requirements area at one moment.

    The default value is the state of a window that has not opened the board
    yet: no cards, not available, nothing failed. That is deliberately
    distinguishable from "the board loaded and this project has no
    requirements", which is :attr:`available` with no cards — the two need
    different words on screen and only the projection can tell them apart.

    :attr:`selected_req_id` and :attr:`scroll_offset` live here rather than in a
    widget because SWR-3312 requires them to survive a re-evaluation, and a
    value that survives has to be held somewhere the rebuild does not touch.
    """

    cards: tuple[RequirementCard, ...] = ()
    columns: tuple[BoardColumn, ...] = ()
    generation: int = 0
    evaluated_at: dt.datetime | None = None
    #: Degradations behind this projection — unreadable records, sources that
    #: failed, dangling relations. Shown; never swallowed.
    notices: tuple[str, ...] = ()
    #: Ids the source no longer declares but Rotaris still has data for.
    removed: tuple[str, ...] = ()
    #: Whether a projection was ever produced. False means the area has nothing
    #: to show *and knows why* — see :attr:`unavailable_reason`.
    available: bool = False
    unavailable_reason: str = ""
    #: The mapping Rotaris would use for a workspace whose store it could not
    #: read (SWR-3120). ``None`` when a board was produced, when there is no
    #: workspace, or when nothing requirement-shaped was found to propose for.
    source_offer: SourceProposalOffer | None = None
    #: Why a board that loaded carries no card, named against the source that
    #: produced it (SWR-3120). Filled in where the workspace is known; empty
    #: leaves the surface its own default sentence.
    empty_reason: str = ""
    #: A failed evaluation keeps the last good board and states what happened
    #: until it is fixed (SWR-3312).
    notice: UiNotice | None = None
    loading: bool = False
    selected_req_id: str = ""
    scroll_offset: int = 0
    #: Board actions the engine has not answered yet (SWR-3601).
    pending: tuple[PendingAction, ...] = ()
    #: What became of the board actions that have been answered (SWR-3602).
    #: Persistent: it survives a re-evaluation and is dropped by being dismissed
    #: or by its requirement leaving the board, never by a timer.
    feedback: tuple[ActionFeedback, ...] = ()
    #: The delivery queue as the scheduler decided it (SWR-3608).
    queue: QueueState = QueueState()
    #: What the board offers a workspace that has never delivered anything
    #: (SWR-3614). ``None`` once anything has been delivered or adopted, or once
    #: the user dismissed it — the offer reports a finding, and a finding that is
    #: no longer true must stop being shown.
    adoption: AdoptionOffer | None = None
    #: True while an adoption pass is running, so the board can say so and stay
    #: usable rather than looking hung (SWR-3614).
    adopting: bool = False
    #: True while a verification pass is running (SWR-3615). Separate from
    #: :attr:`adopting` because they say different things to a user — one is
    #: taking work over, the other is re-measuring work already taken over — even
    #: though only one of them can be running at a time.
    verifying: bool = False
    #: Where the running pass has got to (SWR-3320). Default-constructed rather
    #: than ``None`` for the reason :attr:`queue` is: every surface reads it on
    #: every repaint, and a value that is sometimes absent is a value every
    #: reader has to guard.
    progress: PassProgress = PassProgress()
    #: True while an evaluation that may consult a model is in flight (SWR-3319).
    #: Separate from :attr:`loading` for the reason the whole state exists: every
    #: refresh loads, and only this one can take minutes, so a board that spelled
    #: both as "Evaluating requirements…" would leave a user unable to tell a
    #: file read from a wait on a provider.
    analysing: bool = False
    #: Requirements that changed and are waiting for an impact analysis
    #: (SWR-3519). A cheap refresh leaves these behind by design; naming them is
    #: what turns "this card offers nothing" into "this card has not been judged
    #: yet, and here is how to ask".
    unanalysed: tuple[str, ...] = ()
    #: Whether asking would help — the workspace's own
    #: ``requirements.change.analyze_changes`` (SWR-3117). False turns the offer
    #: above into an explanation, because a control that cannot change anything
    #: is worse than no control.
    analysis_enabled: bool = True

    @cached_property
    def _by_id(self) -> dict[str, RequirementCard]:
        """One index, built at most once per board.

        A board of several hundred cards is looked up per repaint and once per
        changed card after an evaluation; a linear scan per lookup is how an
        in-place update (SWR-3312) starts costing quadratic time.
        """
        return {card.req_id: card for card in self.cards}

    def card(self, req_id: str) -> RequirementCard | None:
        """One card, or ``None`` when the board does not carry that id."""
        return self._by_id.get(req_id)

    @property
    def ids(self) -> tuple[str, ...]:
        """Every projected id, in board order."""
        return tuple(card.req_id for card in self.cards)

    @property
    def empty(self) -> bool:
        """Whether a loaded board carries no requirement at all."""
        return not self.cards

    def column(self, key: str) -> BoardColumn | None:
        """One delivery column by its state token."""
        return next((column for column in self.columns if column.key == key), None)

    @traces(SWR.SWR_3312, SWR.SWR_3602)
    @traces(SWR.SWR_3320)
    def preserving(self, previous: RequirementsBoardState) -> RequirementsBoardState:
        """This board, carrying *previous*'s selection, scroll position and feedback.

        The rule SWR-3312 asks for, in one place: a re-evaluation keeps the
        card the user had selected and the position they had scrolled to. A
        selection whose requirement is *gone* is dropped rather than kept as a
        dangling id — that is the one case where the user's context genuinely
        cannot survive, and pretending otherwise would leave the detail view
        open on nothing.

        Refusal feedback and in-flight actions travel the same way, for
        SWR-3602's reason rather than SWR-3312's: feedback that persists "until
        dismissed or resolved" cannot be swept away by the next evaluation, and
        an evaluation landing between a drop and its answer must not erase the
        fact that something is in flight. Both are dropped for a requirement the
        new board no longer carries, which *is* the feedback being resolved.

        A pass in flight travels the same way, and for a third reason
        (SWR-3320): :attr:`adopting`, :attr:`verifying` and :attr:`progress`
        describe a worker thread, and an evaluation knows nothing about one. A
        board built while a pass runs defaults all three to "no pass", so
        without this the repository event that lands mid-pass would re-enable
        the controls and wipe what the surface says about a run that is very
        much still going.
        """
        selected = previous.selected_req_id if previous.selected_req_id in self._by_id else ""
        return replace(
            self,
            selected_req_id=selected,
            scroll_offset=previous.scroll_offset,
            pending=tuple(item for item in previous.pending if item.req_id in self._by_id),
            feedback=tuple(item for item in previous.feedback if item.req_id in self._by_id),
            adopting=previous.adopting,
            verifying=previous.verifying,
            progress=previous.progress,
        )

    def pending_for(self, req_id: str) -> PendingAction | None:
        """The action in flight for one requirement, when one is (SWR-3601)."""
        return next((item for item in self.pending if item.req_id == req_id), None)

    def feedback_for(self, req_id: str) -> ActionFeedback | None:
        """The standing feedback for one requirement, when there is any."""
        return next((item for item in self.feedback if item.req_id == req_id), None)


# ── building the values above out of a projection ──────────────────────────


_MINUTE = 60.0
_HOUR = 3600.0
_DAY = 86400.0

#: The word every "this requirement is stopped" alert opens with, whichever
#: field the engine raised it from. Named because two of those alerts carry the
#: same sentence behind different labels — see :func:`_blocked_sentence`.
_BLOCKED_LABEL = "Blocked"


def counted(count: int, noun: str, *, plural: str = "") -> str:
    """``1 requirement``, ``2 requirements`` — a count as a sentence says it.

    ``(s)`` is a template, not language. It stood in a status line, in a column's
    accessible description, in a graph's summary and in the offer a workspace
    with an unread store gets, and every one of those is announced by a screen
    reader exactly as written: "sixty-two requirement open bracket s close
    bracket". Reading a number out loud is the one thing a count is for, so the
    word is chosen where the number is known rather than left to the reader.

    *plural* is for the nouns English does not form by adding an ``s``. Nothing
    the board counts needs it yet; it lives beside the count anyway, because the
    day one does the alternative is a second helper that surfaces have to know
    to pick.
    """
    return f"{count} {noun if count == 1 else (plural or f'{noun}s')}"


@traces(SWR.SWR_3304)
def describe_age(when: dt.datetime | None, now: dt.datetime | None) -> str:
    """How long ago *when* was, in words — or an absolute time without a clock.

    Injected rather than read: `datetime.now()` inside a renderer makes the
    board untestable and the age wrong the moment a projection is rendered on
    another thread than it was built on. Without a *now* the timestamp itself is
    printed, which is still an honest answer.
    """
    if when is None:
        return ""
    if now is None or now.tzinfo is None or when.tzinfo is None:
        return when.strftime("%Y-%m-%d %H:%M")
    seconds = (now - when).total_seconds()
    if seconds < 0:
        return "just now"
    if seconds < _MINUTE:
        return "just now"
    if seconds < _HOUR:
        return _plural(int(seconds // _MINUTE), "minute")
    if seconds < _DAY:
        return _plural(int(seconds // _HOUR), "hour")
    return _plural(int(seconds // _DAY), "day")


@traces(SWR.SWR_3304)
def describe_moment(when: dt.datetime | None) -> str:
    """The moment itself, in local time — the value a relative age rounds off.

    "3 hours ago" is what a board is read with, and it is the one rendering a
    user cannot act on. Two cards both reading "3 hours ago" may be an hour
    apart; on a board somebody adopted this morning *every* card reads "just
    now", so the field separates nothing; and neither form can be compared with
    a commit log, a CI run or a colleague's screen. So every age this module
    renders carries the moment behind it, and each surface decides which of the
    two it paints — the card paints the age and offers this one, the detail view
    and the history panel have the room to print both.

    Local rather than UTC, because the clock a user checks a timestamp against
    is the one on their own wall; the offset is printed with it so the string
    stays unambiguous once it leaves that wall — pasted into an issue, or read
    to someone in another timezone. A naive timestamp is printed as it stands,
    since inventing an offset for it would be a guess and nothing here guesses.

    No clock is read here, for the same reason :func:`describe_age` takes *now*
    rather than calling it: a renderer that reads the clock cannot be tested and
    answers differently on the thread it happens to run on. An absolute moment
    needs no clock at all.
    """
    if when is None:
        return ""
    local = when.astimezone() if when.tzinfo is not None else when
    stamp = local.strftime("%Y-%m-%d %H:%M")
    offset = local.strftime("%z")
    return f"{stamp} UTC{offset[:3]}:{offset[3:5]}" if offset else stamp


def _plural(count: int, unit: str) -> str:
    return f"{count} {unit} ago" if count == 1 else f"{count} {unit}s ago"


def _label(token: str) -> str:
    """``needs-update`` → ``Needs Update``: the engine's token, as a user reads it."""
    return " ".join(part.capitalize() for part in str(token).split("-"))


def _fact(label: str, value: object, *, detail: str = "") -> RequirementFact | None:
    """A fact, or ``None`` when there is nothing to state (SWR-3304).

    *detail* rides along with the value it belongs to rather than being a second
    fact: a card that omitted "Last change" would otherwise still be able to
    carry the moment that change happened.
    """
    text = "" if value is None else str(value).strip()
    return RequirementFact(label=label, value=text, detail=detail) if text else None


def _facts(*candidates: RequirementFact | None) -> tuple[RequirementFact, ...]:
    return tuple(fact for fact in candidates if fact is not None)


def _joined(values: Iterable[str], *, limit: int = 4) -> str:
    """``a, b, c and 2 more`` — a list a card can hold without growing."""
    items = [value for value in values if value]
    if not items:
        return ""
    if len(items) <= limit:
        return ", ".join(items)
    return f"{', '.join(items[:limit])} and {len(items) - limit} more"


@traces(SWR.SWR_3304, SWR.SWR_3311)
def build_card(entry: BoardEntry, *, now: dt.datetime | None = None) -> RequirementCard:
    """One card from one projection entry — carried through, never derived.

    Health, evidence state and both badges are the engine's values; this
    function decides wording and order only (SWR-3311).
    """
    lifecycle, delivery = entry.badges
    execution = entry.execution
    alerts = _card_alerts(entry)
    return RequirementCard(
        req_id=entry.req_id,
        title=entry.title,
        lifecycle=str(entry.lifecycle),
        lifecycle_label=_label(str(entry.lifecycle)),
        delivery=str(entry.state),
        delivery_label=delivery,
        health=str(entry.health.health),
        health_label=entry.health.health.label,
        evidence_state=str(entry.evidence_state),
        evidence=_segments(entry),
        alerts=alerts,
        facts=_card_facts(entry, now=now),
        unit_count=execution.unit_count,
        units_label=_units_label(execution.unit_count),
        last_run_label=_last_run_label(entry, now=now),
        last_run_moment=(
            describe_moment(execution.last_run_at) if execution.last_run is not None else ""
        ),
        is_epic=entry.is_epic,
        epic_label=_epic_label(entry),
        schedulable=entry.schedulable,
        blocked_from=str(entry.delivery.blocked_from or ""),
        current_hash=entry.current_hash,
    )


def _units_label(count: int) -> str:
    if count == 0:
        return "No execution units yet"
    return "1 execution unit" if count == 1 else f"{count} execution units"


def _last_run_label(entry: BoardEntry, *, now: dt.datetime | None) -> str:
    """``Last run 2 hours ago (Failed)`` — or the honest ``Never run``."""
    run = entry.execution.last_run
    if run is None:
        return "Never run"
    age = describe_age(entry.execution.last_run_at, now)
    when = f" {age}" if age else ""
    return f"Last run{when} ({run.outcome.label})"


def _epic_label(entry: BoardEntry) -> str:
    """``4 of 9 requirements done`` — an epic card's own progress (SWR-3308).

    Names the excluded deprecated children when there are any. The card prints
    this beside the number of children *on the board*, and those two totals differ
    by exactly the deprecated ones (SWR-3212) — ``0 of 72`` next to ``78 on the
    board`` reads as an inconsistency until the card says where the six went.
    """
    progress = entry.epic
    if progress is None:
        return ""
    excluded = f" · {len(progress.deprecated)} deprecated excluded" if progress.deprecated else ""
    return f"{progress.done} of {progress.total} requirements done{excluded}"


def _blocked_sentence(alert: str) -> str:
    """*alert* minus a leading ``Blocked: ``/``Blocked (kind): `` label.

    What two alerts have to be compared on to find out whether they say the same
    thing. The labels are exactly what differs between the delivery state's
    ``blocked_reason`` and the reason a blocker recorded for the same stop, so
    comparing whole lines finds two distinct alerts where a reader finds one
    sentence printed twice.
    """
    if not alert.startswith(_BLOCKED_LABEL):
        return alert
    _label, separator, sentence = alert.partition(": ")
    return sentence if separator else alert


@traces(SWR.SWR_3304)
def _card_alerts(entry: BoardEntry) -> tuple[str, ...]:
    """The exceptional facts, as sentences, each said once (SWR-3304).

    Stated rather than coloured: a user who cannot distinguish amber from red
    still reads "Specification changed" and "Tests failing", and both are facts
    the engine already decided — the wording is the only thing chosen here.

    **Deduplicated on the sentence, not on the line.** A run that failed reaches
    this projection twice: once as the delivery state's ``blocked_reason`` and
    once as the reason of the blocker recorded for it. Same engine sentence, two
    fields, two labels — so a card printed the identical words under ``Blocked:``
    and under ``Blocked (run failure):``, and the board's blocked banner printed
    them a third time.

    The dedupe belongs here rather than in the widget that paints the stack,
    because :attr:`RequirementCard.accessible_description` is assembled from
    these values too. Deduplicating at the paint step fixed the card for the eye
    and left a screen reader announcing the repeat — one card, two accounts of
    what it says, which is precisely the divergence that description exists to
    rule out. Stripped once here, the painted alerts, the announced description
    and the banner agree by construction.

    The first spelling wins and later ones are dropped, so the card still shows
    exactly what the engine said, and shows it once.
    """
    alerts: list[str] = []
    if entry.specification_changed:
        alerts.append("Specification changed since it was delivered")
    if entry.delivery.blocked_reason:
        alerts.append(f"Blocked: {entry.delivery.blocked_reason}")
    for blocker in entry.blockers:
        alerts.append(f"Blocked ({blocker.kind}): {blocker.reason}")
    for obligation in entry.evidence.blocking:
        if str(obligation.state) == "failed":
            alerts.append(f"{obligation.kind.label} evidence is failing")
        else:
            alerts.append(f"{obligation.kind.label} evidence is missing")
    if entry.availability != "available" and entry.unavailable_reason:
        alerts.append(entry.unavailable_reason)
    if entry.review is not None and entry.review.specification_changed:
        alerts.append("Awaiting review: the specification moved while the run was in flight")
    seen: set[str] = set()
    kept: list[str] = []
    for alert in alerts:
        sentence = _blocked_sentence(alert)
        if sentence in seen:
            continue
        seen.add(sentence)
        kept.append(alert)
    return tuple(kept)


def _card_facts(entry: BoardEntry, *, now: dt.datetime | None) -> tuple[RequirementFact, ...]:
    """Priority, epic, source, dependencies, agent and last change — present ones only.

    ``Source`` is on the card rather than only on the detail view because two
    board-level features read it off the card: SWR-3309's source filter and
    SWR-3318's source grouping. Without it both dimensions are present in the
    interface and permanently empty, which is worse than not offering them.
    """
    relations = entry.relations
    priority = str(entry.priority)
    return _facts(
        _fact("Priority", entry.priority.label if priority != "none" else ""),
        _fact("Epic", relations.epic),
        _fact("Source", entry.source_id),
        _fact("Depends on", _joined(relations.depends_on)),
        _fact("Agent", entry.execution.agent),
        _fact(
            "Last change",
            describe_age(entry.last_changed_at, now),
            detail=describe_moment(entry.last_changed_at),
        ),
    )


def _segments(entry: BoardEntry) -> tuple[EvidenceSegment, ...]:
    """One ring segment per obligation, in the engine's own order (SWR-3305)."""
    return tuple(
        EvidenceSegment(
            kind=str(obligation.kind),
            label=obligation.kind.label,
            state=str(obligation.state),
            state_label=obligation.state.label,
            detail=str(obligation.reason) if obligation.reason is not None else "",
            required=str(obligation.level) == "required",
        )
        for obligation in entry.evidence.obligations
    )


# ── the detail view ────────────────────────────────────────────────────────


_RELATION_LABELS: dict[str, str] = {
    "parent": "Parent epic",
    "children": "Child",
    "derived-from": "Derived from",
    "derived-requirements": "Derived requirement",
    "supersedes": "Supersedes",
    "superseded-by": "Superseded by",
    "depends-on": "Depends on",
    "blocks": "Blocks",
    "refines": "Refines",
    "refined-by": "Refined by",
    "conflicts-with": "Conflicts with",
    "related-to": "Related to",
}


@traces(SWR.SWR_3307, SWR.SWR_3313)
def build_detail(
    entry: BoardEntry,
    *,
    now: dt.datetime | None = None,
    history_pending: bool = False,
) -> RequirementDetail:
    """The five sections of one requirement's detail view (SWR-3307).

    Every section is always constructed, even when it has nothing: an absent
    section is indistinguishable from a section nobody implemented, and each one
    carries the empty message :data:`DETAIL_SECTIONS` states for it.

    The revision history comes from :attr:`BoardEntry.history` — the engine's
    own join of the source's revisions, the hashes Rotaris recorded and the
    deliveries (SWR-3214). It is never reconstructed here: two hashes on a card
    cannot show a requirement's third version, and a desktop that guessed at the
    list would answer "which version did we build" differently from the agents
    (SWR-3311). *history_pending* says the deep read is still in flight, which is
    a third state and not "unavailable".
    """
    builders = {
        "requirement": _requirement_section,
        "relations": _relations_section,
        "execution": _execution_section,
        "traceability": _traceability_section,
        "verification": _verification_section,
    }
    sections = tuple(
        builders[key](entry, now, DetailSection(key=key, title=title, empty_message=empty))
        for key, title, empty in DETAIL_SECTIONS
    )
    history = entry.history
    lifecycle, delivery = entry.badges
    priority = str(entry.priority)
    detail = RequirementDetail(
        req_id=entry.req_id,
        title=entry.title,
        sections=sections,
        # The same six values `build_card` carries, read off the same entry: a
        # card and the detail view it opens must not be able to disagree about
        # what state a requirement is in (SWR-3311).
        lifecycle=str(entry.lifecycle),
        lifecycle_label=_label(str(entry.lifecycle)),
        delivery=str(entry.state),
        delivery_label=delivery,
        health=str(entry.health.health),
        health_label=entry.health.health.label,
        priority=priority if priority != "none" else "",
        priority_label=entry.priority.label if priority != "none" else "",
        epic=entry.relations.epic or "",
        is_epic=entry.is_epic,
        # The facts the editing and blocker entry points hang off (SWR-3605,
        # SWR-3607). All of them are the engine's: what the source allows, where
        # the artefact is, and which blockers were raised against it.
        description=entry.description,
        editable=entry.editable,
        source_id=entry.source_id,
        source_path=entry.source_path or "",
        blockers=build_blockers(entry),
        offer=build_change_work(entry),
        history_available=False,
        history_reason=PENDING_HISTORY_REASON if history_pending else NO_HISTORY_REASON,
    )
    if history is None:
        return detail
    return replace(
        detail,
        revisions=tuple(_revision(revision, now=now) for revision in history.entries),
        history_available=history.source_history_available,
        history_reason=history.unavailable_reason,
    )


@traces(SWR.SWR_3616)
def build_change_work(entry: BoardEntry) -> ChangeWork | None:
    """The offer this card carries, in the board's own vocabulary.

    Carried through, never composed: every sentence is the engine's
    (:class:`~rotaris_core.requirements.delivery.projection.OfferView`), so what
    the board says a change costs and what accepting it actually does are one
    answer (SWR-3311).
    """
    offer = entry.offer
    if offer is None:
        return None
    return ChangeWork(
        req_id=offer.req_id,
        outcome=offer.outcome,
        summary=offer.summary,
        reasoning=offer.reasoning,
        units=offer.units,
        verifies_instead=offer.verifies_instead,
        decomposes=offer.decomposes,
    )


@traces(SWR.SWR_3607)
def build_blockers(entry: BoardEntry) -> tuple[Blocker, ...]:
    """Every blocker raised against one requirement, with its answer path.

    Carried through, never composed: the kind, the reason, the question and each
    option's consequence are the engine's (SWR-3512, SWR-3511, SWR-3510), and a
    blocker the board worded itself would offer an answer the engine never
    promised to honour.
    """
    return tuple(
        Blocker(
            req_id=blocker.req_id,
            kind=str(blocker.kind),
            reason=blocker.reason,
            question=blocker.question,
            decision_id=blocker.decision_id or "",
            choices=tuple(
                BlockerChoice(
                    key=option.key,
                    label=option.label or _label(option.key),
                    consequence=option.consequence,
                )
                for option in blocker.options
            ),
            blocking_ids=blocker.blocking_ids,
        )
        for blocker in entry.blockers
    )


@traces(SWR.SWR_3313)
def _revision(entry: RevisionEntry, *, now: dt.datetime | None) -> Revision:
    """One engine revision as the panel words it — ordering and marking are its own.

    The commit shown is the one worth activating: for a delivered version the
    commit whose verification passed (SWR-3410), for an undelivered one the
    commit that introduced the text. Merging the two would tell a user that the
    edit which changed the requirement had implemented it.
    """
    return Revision(
        requirement_hash=entry.requirement_hash or entry.artefact_commit or "unknown version",
        outcome="Delivered" if entry.delivered else "Not yet delivered",
        run_id=entry.run_id or "",
        commit=(entry.implementing_commit if entry.delivered else entry.artefact_commit) or "",
        delivered=entry.delivered,
        current=entry.current,
        when=describe_age(entry.at, now),
        moment=describe_moment(entry.at),
        subject=entry.subject,
    )


def _requirement_section(
    entry: BoardEntry,
    now: dt.datetime | None,
    blank: DetailSection,
) -> DetailSection:
    """Id, text, source and both axes — read from the source, never from a copy."""
    del now
    lifecycle, delivery = entry.badges
    return replace(
        blank,
        # The description is the source's own text as the projection read it
        # this pass (SWR-3114): Rotaris keeps no copy to render instead.
        body=entry.description,
        facts=_facts(
            _fact("Id", entry.req_id),
            _fact("Title", entry.title),
            _fact("Type", _label(str(entry.req_type))),
            _fact("Lifecycle", _label(lifecycle)),
            _fact("Delivery state", delivery),
            _fact("Health", entry.health.health.label),
            _fact("Source", entry.source_id),
            _fact("Source path", entry.source_path),
            _fact("Source revision", entry.source_revision),
            _fact("Current hash", entry.current_hash),
            _fact("Delivered hash", entry.satisfied_hash),
            _fact("Unavailable", entry.unavailable_reason),
        ),
    )


def _relations_section(
    entry: BoardEntry,
    now: dt.datetime | None,
    blank: DetailSection,
) -> DetailSection:
    """Every neighbour as a navigable link — dangling ones included (SWR-3307)."""
    del now
    relations = entry.relations
    dangling = {(str(item.kind), item.target) for item in relations.unresolved}
    links = [
        RelationLink(
            kind=kind,
            label=_RELATION_LABELS.get(kind, _label(kind)),
            req_id=target,
            resolved=(kind, target) not in dangling,
        )
        for kind, target in relations.edges
    ]
    known = {(link.kind, link.req_id) for link in links}
    links.extend(
        RelationLink(
            kind=kind,
            label=_RELATION_LABELS.get(kind, _label(kind)),
            req_id=target,
            resolved=False,
        )
        for kind, target in sorted(dangling)
        if (kind, target) not in known
    )
    return replace(blank, links=tuple(links))


def _execution_section(
    entry: BoardEntry,
    now: dt.datetime | None,
    blank: DetailSection,
) -> DetailSection:
    """Units, runs, worktrees, branches and commits — and the work not started yet.

    The offer (SWR-3616) belongs here rather than in its own section: it is
    *execution that has not begun*, and a user reading "no units, no runs" needs
    to see in the same place that there is work waiting for their word.
    """
    execution = entry.execution
    offer = entry.offer
    if execution.empty and offer is None:
        return blank
    queue = execution.queue_entry
    return replace(
        blank,
        facts=_facts(
            _fact("Execution units", execution.unit_count or ""),
            _fact("Outstanding", _joined(execution.outstanding_units)),
            _fact("Branches", _joined(execution.branches)),
            _fact("Commits", _joined(execution.commits)),
            _fact("Queue", queue.message if queue is not None else ""),
            _fact(
                "Active run",
                execution.active_run.summary if execution.active_run is not None else "",
            ),
            _fact(
                "Last run",
                describe_age(execution.last_run_at, now),
                detail=describe_moment(execution.last_run_at),
            ),
            _fact("This change asks for", offer.summary if offer is not None else ""),
        ),
        lines=(
            *(unit.summary for unit in execution.units),
            *(run.summary for run in execution.runs),
            *(integration.summary for integration in execution.integrations),
        ),
    )


def _traceability_section(
    entry: BoardEntry,
    now: dt.datetime | None,
    blank: DetailSection,
) -> DetailSection:
    """Implementation sites, test sites, and what is missing or stale (SWR-3208)."""
    del now
    from rotaris_core.requirements.delivery.evidence import site_address

    missing = [
        obligation.kind.label
        for obligation in entry.evidence.obligations
        if str(obligation.state) == "missing"
    ]
    stale = [
        finding.message
        for obligation in entry.evidence.obligations
        for finding in obligation.staleness
    ]
    implementations = [site_address(site) for site in entry.implementations]
    tests = [site_address(site) for site in entry.covering_tests]
    if not (implementations or tests or missing or stale):
        return blank
    return replace(
        blank,
        facts=_facts(
            _fact("Implementation sites", len(implementations) or ""),
            _fact("Test sites", len(tests) or ""),
            _fact("Missing evidence", _joined(missing)),
        ),
        lines=(*implementations, *tests, *stale),
    )


def _verification_section(
    entry: BoardEntry,
    now: dt.datetime | None,
    blank: DetailSection,
) -> DetailSection:
    """What Rotaris measured: checks, verdict and the last accepted delivery."""
    verification = next(
        (
            obligation.verification
            for obligation in entry.evidence.obligations
            if obligation.verification is not None
        ),
        None,
    )
    last_run = entry.execution.last_run
    checks = last_run.checks if last_run is not None else ()
    delivered = entry.deliveries[-1] if entry.deliveries else None
    lines = tuple(f"{check.name}: {check.status or 'not run'}" for check in checks)
    facts = _facts(
        _fact("Verdict", str(verification.verdict) if verification is not None else ""),
        _fact("Verified commit", verification.commit if verification is not None else ""),
        _fact(
            "Verified",
            describe_age(verification.verified_at, now) if verification is not None else "",
            detail=describe_moment(verification.verified_at) if verification is not None else "",
        ),
        _fact(
            "Last successful verification",
            describe_age(delivered.satisfied_at, now) if delivered is not None else "",
            detail=describe_moment(delivered.satisfied_at) if delivered is not None else "",
        ),
        _fact("Delivered by run", delivered.run_id if delivered is not None else ""),
        _fact(
            "Run verification",
            "" if last_run is None or last_run.verified is None else last_run.verification_detail,
        ),
    )
    if not (facts or lines):
        return blank
    return replace(blank, facts=facts, lines=lines)


# ── the whole board ────────────────────────────────────────────────────────


@traces(SWR.SWR_3608, SWR.SWR_3311)
def build_queue_state(queue: QueueView) -> QueueState:
    """The scheduler's queue as the board renders it — its order, not a new one.

    Position, hold reason and the concurrency limit are read straight off the
    engine's :class:`~rotaris_core.requirements.delivery.projection.QueueView`.
    Sorting the candidates here by anything of the board's own would show a queue
    no scheduler agreed to, which is the failure SWR-3608's first acceptance
    criterion names.
    """
    return QueueState(
        candidates=tuple(
            QueueCandidate(
                req_id=entry.req_id,
                unit_id=entry.unit_id or "",
                position=entry.position,
                priority=entry.priority.label if str(entry.priority) != "none" else "",
                held=entry.held,
                hold_reason=entry.hold_reason,
                waiting_for=entry.waiting_for,
            )
            for entry in queue.entries
        ),
        running=tuple(
            QueueRun(
                req_id=run.snapshot.req_id if run.snapshot is not None else "",
                run_id=run.run_id,
                unit_id=run.unit_id or "",
                session_id=run.session_id or "",
                branch=run.branch or "",
                worktree_path=run.worktree_path or "",
                outcome=str(run.outcome),
                interrupted=run.interrupted,
            )
            for run in queue.running
        ),
        automatic=queue.automatic,
        concurrency_limit=queue.concurrency_limit,
        stopped=queue.stopped,
        updated_at=queue.updated_at,
    )


@traces(SWR.SWR_3304, SWR.SWR_3311)
def build_board_state(
    projection: BoardProjection,
    *,
    now: dt.datetime | None = None,
) -> RequirementsBoardState:
    """The board state one projection produces — pure, and side-effect free.

    Called on a worker thread (SWR-3312), which is why it must not touch a
    widget, a clock or the filesystem: *now* is handed in, and the projection is
    already complete when it arrives.
    """
    when = now if now is not None else projection.evaluated_at
    cards = tuple(build_card(entry, now=when) for entry in projection.sorted_entries())
    columns = tuple(
        BoardColumn(key=str(state), label=state.label, req_ids=ids)
        for state, ids in projection.columns().items()
    )
    return RequirementsBoardState(
        cards=cards,
        columns=columns,
        generation=projection.generation,
        evaluated_at=projection.evaluated_at,
        notices=projection.notices,
        removed=projection.removed,
        available=True,
        queue=build_queue_state(projection.queue),
        adoption=_adoption_offer(projection),
    )


@traces(SWR.SWR_3614)
def _adoption_offer(projection: BoardProjection) -> AdoptionOffer | None:
    """The finding the board offers to act on, or ``None`` (SWR-3614).

    Computed from the projection that is already in hand — no extra read, no
    write, and nothing the board could not have counted itself. ``None`` the
    moment *anything* has been delivered or adopted: the offer's whole claim is
    "Rotaris has not delivered any of these", and a workspace where that stopped
    being true must stop being told it.

    Epics are excluded from both numbers. They have no implementation of their
    own and adoption never touches them (SWR-3212), so counting them would put a
    denominator on the offer that adoption could never reach.
    """
    leaves = projection.leaf_entries
    if any(entry.deliveries or not entry.delivery.pristine for entry in leaves):
        return None
    traced = sum(1 for entry in leaves if entry.implementations)
    offer = AdoptionOffer(traced=traced, total=len(leaves))
    return offer if offer.worth_offering else None
