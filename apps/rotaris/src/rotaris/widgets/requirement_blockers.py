"""Answering the blockers the engine raised, from the board (SWR-3607).

A blocked requirement that arrives as a state with no way to answer is worse
than no blocker at all: the work stops and the product offers nothing to do
about it. So every blocker kind the engine can raise
(:class:`~rotaris_core.requirements.delivery.projection.BlockerKind`) has a
presentation *and* an answer path here, and the mapping is a closed table rather
than a chain of ``if``s a later surface can forget to extend.

```text
BlockerKind      presentation                        answer path
─────────────    ─────────────────────────────────   ─────────────────────────
decision         question + option consequences      choose  → answered
conflict         both requirements, side by side     choose / navigate
dependency       what it waits for                   navigate → the blocker
run-failure      the run's own stated reason         inspect  → the run
stated           the person's reason                 resume   → where it came from
```

Three things are deliberate:

- **Nothing is worded here.** The reason, the question and each option's
  consequence are the engine's (SWR-3512, SWR-3511, SWR-3510), carried through
  :func:`~rotaris.models.requirements_state.build_blockers`. A consequence the
  board invented would be a button nobody can take responsibility for.
- **Answering does not act.** The panel emits the answer; the controller returns
  it to the engine through the board's single write path (SWR-3609), and the
  flow resumes from the state the requirement was blocked in — no restart, and
  no second opinion about where it resumes (:attr:`BlockerAnswer.resume_to` is
  the record's ``blocked_from``, never a choice of this surface).
- **A blocker with no options is still shown, and still has a path.** A
  dependency block is a fact with a destination; a spent-retry run failure is a
  fact with a run to look at. Rendering them as unanswerable text would be the
  failure SWR-3607 exists to prevent.

The decision half of SWR-3512 reaches this module structurally:
:func:`blocker_from_decision` turns a raised
:class:`~rotaris_core.requirements.change.decisions.PendingDecision` into the
board's own :class:`~rotaris.models.requirements_state.Blocker` through a
narrow protocol, so a widget never imports the change-propagation package and
the two can still not drift apart — the protocol is what a test checks the real
decision against.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from types import MappingProxyType
from typing import TYPE_CHECKING, Protocol

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import QFrame, QHBoxLayout, QLabel, QVBoxLayout, QWidget
from rotaris_core.reqtocode import SWR, traces

from rotaris.models.requirements_state import Blocker, BlockerChoice
from rotaris.theme import tokens
from rotaris.widgets.cards import Card, SectionLabel, make_button

if TYPE_CHECKING:
    from collections.abc import Iterable, Mapping, Sequence

    from rotaris.theme.spec import Theme

__all__ = [
    "BLOCKER_KINDS",
    "BLOCKER_PANEL",
    "NO_BLOCKERS",
    "AnswerPath",
    "BlockerAnswer",
    "BlockerPresentation",
    "RaisedDecision",
    "RaisedOption",
    "RequirementBlockerPanel",
    "answer_for",
    "blocker_from_decision",
    "presentation_for",
]

#: Object name of the panel, so a surface can find it and a test can assert the
#: seam rather than assert that some widget happens to be present.
BLOCKER_PANEL = "requirementBlockerPanel"

#: What the panel says when nothing is blocking. A fact about the requirement,
#: never a blank pane.
NO_BLOCKERS = "Nothing is blocking this requirement."

#: The kinds the engine can raise (``BlockerKind``). Held as a tuple so the
#: completeness sweep below is over a *closed* set: a sixth kind added to the
#: engine fails :func:`presentation_for` immediately instead of quietly getting
#: the fallback presentation.
BLOCKER_KINDS: tuple[str, ...] = ("dependency", "conflict", "decision", "run-failure", "stated")


@traces(SWR.SWR_3607)
class AnswerPath(StrEnum):
    """How a user gets a blocker out of the way.

    Four, and each of them is something the user can actually do from the board.
    There is no ``none``: a blocker with no way forward is the state SWR-3607
    exists to abolish.
    """

    #: The engine offered named options; choosing one is the answer (SWR-3512).
    CHOOSE = "choose"
    #: The answer is elsewhere: open the requirement that blocks this one
    #: (SWR-3510) or the one it contradicts (SWR-3511).
    NAVIGATE = "navigate"
    #: A person blocked it with a reason; clearing it returns the requirement to
    #: the state it was blocked in (SWR-3201).
    RESUME = "resume"
    #: The run itself is the answer path: look at what failed (SWR-3415). Not a
    #: retry — retries are spent by the time this blocker exists, and offering
    #: one here would be the board promising something the engine refuses.
    INSPECT = "inspect"

    @property
    def label(self) -> str:
        """What the control for this path is called."""
        return _PATH_LABELS[self]


_PATH_LABELS: Mapping[AnswerPath, str] = MappingProxyType(
    {
        AnswerPath.CHOOSE: "Answer",
        AnswerPath.NAVIGATE: "Open the requirement that blocks this one",
        AnswerPath.RESUME: "Clear the blocker",
        AnswerPath.INSPECT: "Open the run that failed",
    },
)


@traces(SWR.SWR_3607)
@dataclass(frozen=True)
class BlockerPresentation:
    """How one blocker is shown, and how it is answered.

    Pure and derived only from the blocker itself, so the same blocker is
    presented identically wherever it appears — the card, the detail view, this
    panel — and a test can assert the whole table without a widget.
    """

    kind: str
    heading: str
    lead: str
    path: AnswerPath
    #: Whether the blocking requirements are navigation targets (SWR-3510).
    navigable: bool = False
    #: Whether this requirement and the ones it contradicts are shown beside
    #: each other, which is what SWR-3511 asks a conflict to look like.
    side_by_side: bool = False

    @property
    def action_label(self) -> str:
        """What the control that follows this presentation's path is called."""
        return self.path.label


_HEADINGS: Mapping[str, tuple[str, str]] = MappingProxyType(
    {
        "dependency": (
            "Dependency",
            "This requirement waits for another one to be delivered.",
        ),
        "conflict": (
            "Conflict",
            "This requirement and another one cannot both be satisfied as written.",
        ),
        "decision": (
            "Decision",
            "The engine stopped and asked, because this is not its decision to take.",
        ),
        "run-failure": (
            "Run failure",
            "The run failed and its retries are spent, so this waits on a person.",
        ),
        "stated": (
            "Blocked",
            "Somebody blocked this requirement and said why.",
        ),
    },
)


@traces(SWR.SWR_3607, SWR.SWR_3510, SWR.SWR_3511, SWR.SWR_3512)
def presentation_for(blocker: Blocker) -> BlockerPresentation:
    """How *blocker* is shown and answered — one row of the closed table.

    The options win over the kind: an engine that offered named alternatives has
    already said what the answer is, whatever kind raised it. Only when it
    offered none does the kind decide, and every kind decides on something.
    """
    heading, lead = _HEADINGS.get(
        blocker.kind,
        ("Blocked", "This requirement is not moving, and the engine stated why."),
    )
    navigable = bool(blocker.blocking_ids)
    side_by_side = blocker.kind == "conflict"
    if blocker.choices:
        path = AnswerPath.CHOOSE
    elif navigable:
        path = AnswerPath.NAVIGATE
    elif blocker.kind == "run-failure":
        path = AnswerPath.INSPECT
    else:
        path = AnswerPath.RESUME
    return BlockerPresentation(
        kind=blocker.kind,
        heading=heading,
        lead=lead,
        path=path,
        navigable=navigable,
        side_by_side=side_by_side,
    )


@traces(SWR.SWR_3607)
@dataclass(frozen=True)
class BlockerAnswer:
    """What goes back to the engine when a user answers a blocker.

    Every field is either the blocker's or the record's. ``resume_to`` in
    particular is the delivery state the requirement was blocked *in*: where a
    cleared blocker resumes is a fact of the record (SWR-3201), and a surface
    that chose one would resume the flow somewhere it never was.
    """

    req_id: str
    kind: str
    choice: str
    consequence: str = ""
    decision_id: str = ""
    resume_to: str = ""

    @property
    def sentence(self) -> str:
        """One line for the audit trail's ``reason`` and for a screen reader."""
        answer = f"{self.req_id}: {self.choice}"
        because = f" — {self.consequence}" if self.consequence else ""
        where = f", resuming in {self.resume_to}" if self.resume_to else ""
        return f"{answer}{because}{where}"


@traces(SWR.SWR_3607)
def answer_for(blocker: Blocker, choice: str, *, resume_to: str = "") -> BlockerAnswer | None:
    """The answer *choice* means for *blocker*, or ``None`` when it offers none.

    Refused rather than guessed: an answer naming an option that was never
    offered is exactly what
    :meth:`~rotaris_core.requirements.change.decisions.PendingDecision.answered`
    rejects at the engine's door, and letting it travel that far would put a
    choice nobody proposed on its way into the audit trail.
    """
    offered = next((one for one in blocker.choices if one.key == choice), None)
    if offered is None:
        return None
    return BlockerAnswer(
        req_id=blocker.req_id,
        kind=blocker.kind,
        choice=offered.key,
        consequence=offered.consequence,
        decision_id=blocker.decision_id,
        resume_to=resume_to,
    )


# ── the decisions slice 5 raises, as this board shows them (SWR-3512) ───────


class RaisedOption(Protocol):
    """One alternative a raised decision offered, with what it would cost."""

    @property
    def name(self) -> str: ...

    @property
    def consequence(self) -> str: ...


class RaisedDecision(Protocol):
    """A decision the engine escalated and parked a requirement on.

    Structural on purpose:
    :class:`~rotaris_core.requirements.change.decisions.PendingDecision`
    satisfies it without this module importing the change-propagation package —
    which keeps a widget free of the engine and still lets a test pin the two
    shapes against each other.
    """

    @property
    def req_id(self) -> str: ...

    @property
    def question(self) -> str: ...

    @property
    def decision_id(self) -> str: ...

    @property
    def options(self) -> Sequence[RaisedOption]: ...


@traces(SWR.SWR_3607, SWR.SWR_3512)
def blocker_from_decision(decision: RaisedDecision, *, reason: str = "") -> Blocker:
    """The board's blocker for one escalated decision (SWR-3512, SWR-3607).

    The question travels as the question and every option keeps its own
    consequence, so the control a user presses says what pressing it will cause.
    *reason* is the trigger's own sentence when the caller has one; without it
    the question stands as the reason, which is still the engine's wording.
    """
    return Blocker(
        req_id=decision.req_id,
        kind="decision",
        reason=reason.strip() or decision.question,
        question=decision.question,
        decision_id=decision.decision_id,
        choices=tuple(
            BlockerChoice(key=option.name, label=option.name, consequence=option.consequence)
            for option in decision.options
        ),
    )


# ── the surface (SWR-3607, SWR-3314) ───────────────────────────────────────


@traces(SWR.SWR_3607, SWR.SWR_3314)
class RequirementBlockerPanel(Card):
    """Every blocker on one requirement, each with the way out of it.

    Keyboard-complete by construction: every path is a button, so a blocker is
    answerable, navigable or inspectable with the keyboard alone, and each
    control carries an accessible name naming the requirement it acts on
    (SWR-3314). Nothing here is hover-only and nothing is colour-only — the kind
    is a heading, not a hue.
    """

    #: ``(req_id, option key)`` — the user chose one of the engine's options.
    answered = Signal(str, str)
    #: A requirement that blocks or contradicts this one should be opened.
    navigate_requested = Signal(str)
    #: A person's block should be cleared, returning the requirement to the
    #: state it was blocked in.
    resume_requested = Signal(str)
    #: The failed run behind this blocker should be opened, in the surfaces that
    #: already own runs (SWR-3612).
    inspect_requested = Signal(str)

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__("Blockers", parent=parent)
        self.setObjectName(BLOCKER_PANEL)
        self.setAccessibleName("Blockers")
        self._blockers: tuple[Blocker, ...] = ()
        self._resume_to = ""
        #: Every row label that carries a colour, paired with the tone it means.
        #: The tone rather than the colour, because a colour captured while the
        #: row was built is the one the theme in force at the time had.
        self._toned: list[tuple[QLabel, str]] = []
        self.empty_label = QLabel(NO_BLOCKERS)
        self.empty_label.setObjectName("muted")
        self.empty_label.setWordWrap(True)
        self.body.addWidget(self.empty_label)
        self._rows = QVBoxLayout()
        self._rows.setSpacing(tokens().space[1.25])
        self.body.addLayout(self._rows)

    def apply_theme(self, theme: Theme) -> None:
        super().apply_theme(theme)
        # `Card.__init__` installs the hook, so this runs once before the panel
        # has a tone list to walk.
        if hasattr(self, "_toned"):
            self._restyle()

    def _restyle(self) -> None:
        """Re-colour every row label from the active theme."""
        t = tokens()
        declarations = {
            # The engine's own reason for the block, in words — so it owes the
            # text floor rather than the 3:1 the amber of a status dot owes.
            "reason": f"color:{t.color.wait_text};",
            "lead": f"color:{t.color.text_secondary};",
            "question": f"color:{t.color.text};",
            "party": f"color:{t.color.text};font-weight:{t.type.weight_display};",
        }
        for label, tone in self._toned:
            label.setStyleSheet(declarations[tone])

    @property
    def blockers(self) -> tuple[Blocker, ...]:
        """The blockers this panel is showing."""
        return self._blockers

    @property
    def resume_to(self) -> str:
        """The delivery state a cleared blocker returns the requirement to."""
        return self._resume_to

    @traces(SWR.SWR_3607)
    def set_blockers(self, blockers: Iterable[Blocker], *, resume_to: str = "") -> None:
        """Present *blockers*, each with its presentation and its answer path.

        *resume_to* is the record's ``blocked_from``, handed in rather than
        derived: this panel has no access to the delivery record and must not
        invent the state a cleared blocker resumes into (SWR-3201, SWR-3311).
        """
        self._blockers = tuple(blockers)
        self._resume_to = resume_to
        self._clear()
        self.empty_label.setVisible(not self._blockers)
        for blocker in self._blockers:
            self._rows.addWidget(self._row(blocker))
        self._restyle()
        self.setAccessibleDescription(
            "; ".join(blocker.accessible_description for blocker in self._blockers) or NO_BLOCKERS,
        )

    @traces(SWR.SWR_3607)
    def answer(self, blocker: Blocker, choice: str) -> BlockerAnswer | None:
        """The payload a chosen option produces, for a caller that wants it typed."""
        return answer_for(blocker, choice, resume_to=self._resume_to)

    def _clear(self) -> None:
        # The tone list holds references into the rows being discarded; keeping
        # them would leave _restyle painting labels whose C++ half is gone.
        self._toned.clear()
        while self._rows.count():
            item = self._rows.takeAt(0)
            widget = item.widget() if item is not None else None
            if widget is not None:
                widget.setParent(None)

    def _row(self, blocker: Blocker) -> QWidget:
        presentation = presentation_for(blocker)
        t = tokens()
        row = QFrame()
        row.setObjectName("card")
        row.setAccessibleName(f"{presentation.heading} on {blocker.req_id}")
        row.setAccessibleDescription(blocker.accessible_description)
        layout = QVBoxLayout(row)
        layout.setContentsMargins(t.space.md, t.space[1.25], t.space.md, t.space[1.25])
        layout.setSpacing(t.space[0.75])
        layout.addWidget(SectionLabel(presentation.heading))
        for text, tone in (
            (blocker.reason, "reason"),
            (presentation.lead, "lead"),
            (blocker.question, "question"),
        ):
            if not text:
                continue
            label = QLabel(text)
            label.setWordWrap(True)
            label.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
            self._toned.append((label, tone))
            layout.addWidget(label)
        if presentation.side_by_side:
            layout.addWidget(self._conflict(blocker))
        elif presentation.navigable:
            layout.addLayout(self._navigation(blocker))
        layout.addLayout(self._controls(blocker, presentation))
        return row

    def _conflict(self, blocker: Blocker) -> QWidget:
        """This requirement and the ones it contradicts, side by side (SWR-3511)."""
        panel = QWidget()
        columns = QHBoxLayout(panel)
        columns.setContentsMargins(0, 0, 0, 0)
        columns.setSpacing(tokens().space[1.25])
        columns.addWidget(self._party(blocker.req_id, "This requirement", navigable=False))
        for other in blocker.blocking_ids:
            columns.addWidget(self._party(other, "Conflicts with", navigable=True))
        return panel

    def _party(self, req_id: str, role: str, *, navigable: bool) -> QWidget:
        t = tokens()
        column = QFrame()
        column.setObjectName("card")
        layout = QVBoxLayout(column)
        layout.setContentsMargins(t.space[1.25], t.space.sm, t.space[1.25], t.space.sm)
        layout.setSpacing(t.space.xs)
        layout.addWidget(SectionLabel(role))
        if navigable:
            button = make_button(f"Open {req_id}", "secondary")
            button.setAccessibleName(f"Open {req_id}, which conflicts with this requirement")
            button.clicked.connect(lambda *_: self.navigate_requested.emit(req_id))
            layout.addWidget(button, 0, Qt.AlignmentFlag.AlignLeft)
        else:
            name = QLabel(req_id)
            self._toned.append((name, "party"))
            layout.addWidget(name)
        return column

    def _navigation(self, blocker: Blocker) -> QHBoxLayout:
        """A control per requirement this one waits for (SWR-3510)."""
        links = QHBoxLayout()
        links.setSpacing(tokens().space.sm)
        for other in blocker.blocking_ids:
            button = make_button(f"Open {other}", "secondary")
            button.setAccessibleName(f"Open {other}, which blocks {blocker.req_id}")
            button.clicked.connect(lambda *_, target=other: self.navigate_requested.emit(target))
            links.addWidget(button)
        links.addStretch(1)
        return links

    def _controls(self, blocker: Blocker, presentation: BlockerPresentation) -> QHBoxLayout:
        controls = QHBoxLayout()
        controls.setSpacing(tokens().space.sm)
        for choice in blocker.choices:
            button = make_button(choice.label or choice.key, "primary")
            button.setAccessibleName(f"{choice.label or choice.key} for {blocker.req_id}")
            button.setAccessibleDescription(choice.sentence)
            button.setToolTip(choice.consequence)
            key, req_id = choice.key, blocker.req_id
            button.clicked.connect(lambda *_, k=key, r=req_id: self.answered.emit(r, k))
            controls.addWidget(button)
        if presentation.path is AnswerPath.RESUME:
            resume = make_button(presentation.action_label, "primary")
            resume.setAccessibleName(f"Clear the blocker on {blocker.req_id}")
            resume.setAccessibleDescription(
                f"Returns {blocker.req_id} to {self._resume_to or 'the state it was blocked in'}.",
            )
            resume.clicked.connect(
                lambda *_, r=blocker.req_id: self.resume_requested.emit(r),
            )
            controls.addWidget(resume)
        if presentation.path is AnswerPath.INSPECT:
            inspect = make_button(presentation.action_label, "secondary")
            inspect.setAccessibleName(f"Open the run that failed for {blocker.req_id}")
            inspect.clicked.connect(
                lambda *_, r=blocker.req_id: self.inspect_requested.emit(r),
            )
            controls.addWidget(inspect)
        controls.addStretch(1)
        return controls
