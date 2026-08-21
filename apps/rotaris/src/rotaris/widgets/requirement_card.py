"""The requirement card and the epic card (SWR-3304, SWR-3308).

A card has exactly one job: let a user decide whether this requirement needs
their attention without opening it. So it states the id, the title, both badges,
the delivery condition, the traceability ring, the number of execution units and
the age of the last run — and it states the *exceptional* facts as sentences,
because "Specification changed since it was delivered" is information and amber
is not.

Four rules run through the whole module:

- **Absent is omitted, never blanked.** A requirement with no run, no units and
  no priority produces a card with no priority row at all
  (SWR-3304).  :class:`~rotaris.models.requirements_state.RequirementCard`
  already drops empty facts; the widget adds no placeholder of its own.
- **Nothing is derived.** Health, delivery state, evidence state and epic
  progress arrive computed (SWR-3311). The epic card *counts* its children's
  engine-assigned states, the way the board's own columns do; it never decides
  one.
- **A fact every card carries is not an alert.** SWR-3304 asks for the
  *exceptional* facts, and a sentence that is true of all sixty cards on a fresh
  board is not one: it costs three lines per card and teaches the reader to stop
  looking at alerts, which is the one thing an alert may not do.
  :func:`card_alerts` is where that judgement lives.
- **One axis, one visual language.** Lifecycle is the project's own state and
  delivery is the state Rotaris moves a card through (SWR-3202). They are
  different questions, so they do not get the same badge: the delivery state
  wears the outlined pill a user drags between columns, and the lifecycle is
  plain text beside it.

A word the card prints is a word the card can explain. Health, evidence states,
execution units and the requirement source are Rotaris vocabulary a first-time
reader has never met, so each one carries a tooltip and an accessible
description saying what it means in ordinary language. Explaining a word is not
deciding one: every value still arrives from the engine (SWR-3311), and the
explanations below describe the vocabulary, never this requirement.

An epic is a grouping element, not a work item (SWR-3308): :class:`EpicCard`
carries no delivery action area at all — absent rather than disabled, so no
later slice can accidentally give an epic a "move to Running" affordance by
enabling something that was already there.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import QHBoxLayout, QLabel, QVBoxLayout, QWidget
from rotaris_core.reqtocode import SWR, traces

from rotaris import theme
from rotaris.theme import raise_to_readable, tokens
from rotaris.widgets.cards import Card, Tag, make_button
from rotaris.widgets.evidence_ring import EvidenceRing, ring_description, ring_summary

if TYPE_CHECKING:
    from PySide6.QtGui import QFocusEvent, QKeyEvent, QMouseEvent

    from rotaris.models.requirements_state import RequirementCard
    from rotaris.theme.color import Color
    from rotaris.theme.spec import Theme

__all__ = [
    "DELIVERY_ACTION_AREA",
    "EVIDENCE_MEANING",
    "EXECUTION_UNITS_MEANING",
    "MOMENT_HINT",
    "SELECTED_MARK",
    "SELECTED_MEANING",
    "EpicCard",
    "RequirementCardWidget",
    "StateChip",
    "alert_severity",
    "blocker_reason",
    "blocker_sentence",
    "card_alerts",
    "card_fact",
    "evidence_button_hint",
    "fact_meaning",
    "health_meaning",
    "is_blocked",
    "moment_hint",
]

#: Object name of the container a delivery action lives in. Slice 6 fills it;
#: the point of naming it here is that a test can assert an epic card has none
#: (SWR-3308) rather than asserting that some button happens to be missing.
DELIVERY_ACTION_AREA = "requirementActions"

#: How a blocked card announces itself before the reason. Matched rather than
#: guessed at: the alert sentences are built in one place
#: (:func:`rotaris.models.requirements_state._card_alerts`) and read here.
_BLOCKED_PREFIX = "Blocked"

#: The two evidence alerts that sibling builds, matched on their own wording for
#: the same reason: one module writes these sentences, this one reads them.
_MISSING_EVIDENCE_SUFFIX = " evidence is missing"
_FAILING_EVIDENCE_SUFFIX = " evidence is failing"

#: What :func:`rotaris.models.requirements_state._last_run_label` says for a
#: requirement nothing has ever executed.
_NEVER_RUN = "Never run"

#: Severity decides both the glyph and the colour of an alert line, so a reader
#: who cannot tell two ambers apart still sees three different marks. The colour
#: alone cannot carry it: the palette has one amber for "stopped" and one for
#: "attention" (:mod:`rotaris.theme`), and they read as the same hue.
_ALERT_GLYPHS: dict[str, str] = {"failed": "✖", "blocked": "■", "attention": "▲"}


def _alert_color(severity: str) -> str:
    """The colour one alert severity is written in, in the active theme.

    A function rather than the module-level table this used to be: a table is
    evaluated at import, before the user has chosen a theme, and the colour it
    holds is then baked into every card built afterwards (SWR-3706).

    All three are *words*, so each takes the text form that owes 4.5:1 rather
    than the saturated step a status dot owes 3:1.
    """
    t = tokens()
    return {
        "failed": t.color.fail_text,
        "blocked": raise_to_readable(theme.delivery_color("blocked"), t),
        "attention": t.color.wait_text,
    }.get(severity, t.color.text_secondary)


#: One plain sentence per health word (SWR-3211), in the engine's own order of
#: precedence. A card prints ``Health: Incomplete Traceability`` and nothing on
#: screen says what that is; this is that explanation, and it explains the
#: *word*, never this requirement — the value itself stays the engine's
#: (SWR-3311).
_HEALTH_MEANING: dict[str, str] = {
    "healthy": "Nothing is outstanding: specification, delivery state and evidence agree.",
    "needs-update": "The specification moved, or evidence that does exist is no longer current.",
    "incomplete-traceability": (
        "Evidence this requirement owes — an implementation site, a covering test or a"
        " verification — has nothing recorded at all."
    ),
    "verification-failed": "Something that ran did not pass.",
    "blocked": "Work is stopped on purpose, and the reason is recorded.",
    "superseded": "Another requirement took this one over.",
    "deprecated": "The project retired this requirement.",
}

#: Where a health word comes from, appended to every explanation. Health is not
#: a field anybody sets, and a user who reads it as one will look for the switch
#: that changes it.
_HEALTH_ORIGIN = "Health is read from the lifecycle, the delivery state and the evidence."

#: What the counts beside the ring mean. ``2 not applicable`` is the phrase that
#: needs it: a reader assumes it is a failure of some kind unless told otherwise.
EVIDENCE_MEANING = (
    'Evidence Rotaris expects for this requirement. "Not applicable" means it does not owe'
    " that kind of evidence at all."
)

#: What an execution unit is (SWR-3401). ``No execution units yet`` is on every
#: card of a project nobody has released work for, and it is the card's only
#: mention of a Rotaris-owned concept.
EXECUTION_UNITS_MEANING = (
    "Execution units are the pieces of work Rotaris splits a requirement into for an agent"
    " run. A requirement nobody has released has none."
)

#: How the card offers the moment behind an age it printed as words. The card
#: keeps the relative form on its face — that is what a board is scanned with —
#: and a relative form alone is unusable the moment a user wants to check it
#: against anything: "just now" is what all sixty cards of a board somebody
#: adopted this morning say, and two cards reading "3 hours ago" can be an hour
#: apart. So the exact value is one hover, or one screen-reader description,
#: away rather than one screen away.
MOMENT_HINT = "At {moment}."

#: The word the board's selected card wears. The stylesheet already tints a
#: selected card and darkens its border, and a tint on a dark surface is both a
#: colour-only signal — which SWR-3314 does not allow to carry a meaning on its
#: own — and, on a board of sixty cards, genuinely hard to find by eye. A word
#: is findable, survives magnification, survives a reader who sees no colour at
#: all, and says which card the board's move controls are talking about.
SELECTED_MARK = "Selected"

#: What that word means, for the reader who has not connected the card to the
#: strip that acts on it.
SELECTED_MEANING = "The board's controls — move, evidence, open — act on this requirement."

#: The optional facts whose value is Rotaris' own vocabulary rather than the
#: project's. ``Source: discovered`` is the one that reliably confuses: it is a
#: configured source's id, not a statement about how the requirement was written.
_FACT_MEANING: dict[str, str] = {
    "Source": "Which configured requirement source this requirement was read from.",
}

#: The evidence states that mean something is actually recorded. Used to decide
#: what the evidence action promises, not to decide a verdict.
_RECORDED_EVIDENCE = frozenset({"satisfied", "stale", "failed"})


@traces(SWR.SWR_3304)
def card_fact(card: RequirementCard, label: str) -> str:
    """The value of one optional fact, or ``""`` when the card omitted it."""
    return next((fact.value for fact in card.facts if fact.label == label), "")


@traces(SWR.SWR_3303)
def is_blocked(card: RequirementCard) -> bool:
    """Whether this requirement is blocked — by state or by a raised blocker.

    Both, because they are two different facts in the engine: a requirement can
    sit in the ``Blocked`` delivery state, and a requirement in any state can
    carry a blocker somebody has to answer (SWR-3303).
    """
    return card.delivery == "blocked" or any(
        alert.startswith(_BLOCKED_PREFIX) for alert in card.alerts
    )


@traces(SWR.SWR_3303)
def blocker_sentence(card: RequirementCard) -> str:
    """Why this card is blocked, in the engine's own words — or ``""``."""
    return next((alert for alert in card.alerts if alert.startswith(_BLOCKED_PREFIX)), "")


@traces(SWR.SWR_3303)
def blocker_reason(card: RequirementCard) -> str:
    """:func:`blocker_sentence` without the board's own ``Blocked…:`` label.

    For a surface that has already said "blocked" — the board's blocked banner
    says it in its heading and again in every row's context — repeating the label
    inside each sentence spends a line on a word the reader has just read. What
    is stripped is only the label this module's sibling
    (:func:`rotaris.models.requirements_state._card_alerts`) put there; the
    engine's sentence comes back untouched, because a surface that reworded it
    would be guessing at a refusal it did not make (SWR-3602).
    """
    return _without_blocked_label(blocker_sentence(card))


@traces(SWR.SWR_3303, SWR.SWR_3304)
def card_alerts(card: RequirementCard) -> tuple[str, ...]:
    """The card's alerts: each stated once, and only while it is still news.

    The projection raises two separate facts for a run that failed: the delivery
    state's ``blocked_reason`` and, when a blocker was recorded for it, that
    blocker's reason. They are different fields carrying the same engine
    sentence, so the card printed the same words twice under two different
    labels — and the board's blocked banner printed them a third time.

    Deduplicated on the sentence rather than on the whole line, since the labels
    are what differ. The first spelling wins and the later one is dropped: the
    card still shows exactly what the engine said, and shows it once.

    The second rule is what makes a fresh board readable. A requirement nobody
    has run owes implementation, test and verification evidence *by definition*,
    so on a new project every card raises the same three alerts — sixty cards,
    one hundred and eighty amber lines, and not one of them separates a
    requirement from its neighbour. SWR-3304 asks for the exceptional facts, and
    a fact that is universally true is the opposite of one. Missing evidence
    becomes exceptional the moment something has run and still produced none, so
    the alert returns with the first run. Failing evidence is never suppressed:
    a failure is news whenever it happens.

    Nothing is hidden by that. The count is on the card either way, beside the
    ring (``Evidence: 3 missing, 2 not applicable``), the ring paints it, and the
    card announces
    :attr:`~rotaris.models.requirements_state.RequirementCard.accessible_description`,
    which is built from the projection's own complete alert list — so a screen
    reader hears every sentence whether or not the card paints it as an alert.
    """
    has_run = card.last_run_label != _NEVER_RUN
    seen: set[str] = set()
    kept: list[str] = []
    for alert in card.alerts:
        if not has_run and alert.endswith(_MISSING_EVIDENCE_SUFFIX):
            continue
        sentence = _without_blocked_label(alert)
        if sentence in seen:
            continue
        seen.add(sentence)
        kept.append(alert)
    return tuple(kept)


@traces(SWR.SWR_3304)
def alert_severity(alert: str) -> str:
    """How loud one alert is: ``failed``, ``blocked`` or ``attention``.

    Three tiers because they ask for three different things: something did not
    pass, something is stopped and waiting on a person, or something wants a
    look. The board's palette gives the middle two the same amber
    (``DELIVERY_BLOCKED`` and ``WAIT`` are one hue at a glance), so the tier
    also chooses the glyph in front of the sentence — the severity survives a
    reader who cannot separate the colours, which is the accessibility rule this
    app holds itself to.
    """
    if alert.startswith(_BLOCKED_PREFIX):
        return "blocked"
    if alert.endswith(_FAILING_EVIDENCE_SUFFIX):
        return "failed"
    return "attention"


@traces(SWR.SWR_3304)
def health_meaning(health: str) -> str:
    """What one health word means, and where it came from — in plain language.

    ``Health: Incomplete Traceability`` is exact and unreadable to somebody who
    met Rotaris ten minutes ago. The card keeps the engine's word — renaming it
    would put the board and every filter into two different vocabularies — and
    explains it beside itself instead.
    """
    stated = _HEALTH_MEANING.get(health, "")
    return f"{stated} {_HEALTH_ORIGIN}".strip()


@traces(SWR.SWR_3304)
def fact_meaning(label: str) -> str:
    """What one optional fact's label means, or ``""`` when it speaks for itself."""
    return _FACT_MEANING.get(label, "")


@traces(SWR.SWR_3306)
def evidence_button_hint(card: RequirementCard) -> str:
    """What the card's evidence action will actually show, before it is pressed.

    Every card offers the action, including one that holds no evidence at all —
    and on a fresh project that is every card. Removing it there would be worse
    (the list of what is missing is exactly what a user of a new project needs),
    so the action states which of the two it is about to open rather than
    promising records that do not exist.
    """
    if any(segment.state in _RECORDED_EVIDENCE for segment in card.evidence):
        return f"Open the implementation sites, covering tests and verification of {card.req_id}."
    return (
        f"Nothing is recorded for {card.req_id} yet — this opens the list of evidence it"
        " still owes."
    )


def _without_blocked_label(alert: str) -> str:
    """*alert* minus a leading ``Blocked: ``/``Blocked (kind): `` label."""
    if not alert.startswith(_BLOCKED_PREFIX):
        return alert
    _label, separator, sentence = alert.partition(": ")
    return sentence if separator else alert


@dataclass(frozen=True)
class _Line:
    """One rendered line of a card's alert or fact stack.

    A value rather than three parallel tuples, because the three travel
    together: the sentence, the colour its severity earned, and the explanation
    a reader who does not know the vocabulary needs.
    """

    text: str
    color: str
    explanation: str = ""


def _id_style() -> str:
    """How a requirement id is painted — deliberately not in the mono face.

    A monospace face gives every glyph the same advance width, which makes the
    hyphens in ``SWR-FR-ADM-001`` as wide as its letters; at 11 px they read as
    en dashes, and a user retyping the id from the screen types the wrong
    character. Ids on this board are read and copied, never aligned in a column,
    so the interface face — where a hyphen is a hyphen — is the readable choice.
    """
    t = tokens()
    return (
        f"font-family:{t.type.body};font-size:{t.type.scale.xs}px;"
        f"font-weight:{t.type.weight_display};color:{t.color.text_secondary};"
    )


def _alert_lines(card: RequirementCard) -> tuple[_Line, ...]:
    """The alert stack: each surviving sentence, marked by what it costs."""
    lines: list[_Line] = []
    for alert in card_alerts(card):
        severity = alert_severity(alert)
        lines.append(_Line(text=f"{_ALERT_GLYPHS[severity]} {alert}", color=_alert_color(severity)))
    return tuple(lines)


def _fact_lines(card: RequirementCard) -> tuple[_Line, ...]:
    """The optional facts — the value at a glance, the exact one behind it.

    ``Last change: just now`` is what the line says, because a card is read by
    scanning it; the moment that change actually happened travels with it as the
    explanation, where a hover or a screen reader reaches it without the user
    leaving the board (SWR-3304).
    """
    return tuple(
        _Line(
            text=fact.glance,
            color=tokens().color.text_secondary,
            explanation=_explained(fact_meaning(fact.label), fact.detail),
        )
        for fact in card.facts
    )


def _explained(meaning: str, moment: str) -> str:
    """One explanation out of what a word means and when a moment was."""
    return " ".join(part for part in (meaning, moment_hint(moment)) if part)


@traces(SWR.SWR_3304)
def moment_hint(moment: str) -> str:
    """``At 2026-08-20 14:05 UTC+02:00.`` — or ``""`` for a fact with no moment."""
    return MOMENT_HINT.format(moment=moment) if moment else ""


class StateChip(QLabel):
    """A one-word state badge, in one of the two axes' two treatments.

    *axis* is the question this badge answers, and it is not decoration: a card
    carries one badge for the project's lifecycle and one for Rotaris' delivery
    state (SWR-3202), and painting both as the same outlined pill said they were
    two values of one thing. The delivery badge keeps the pill — it is the axis
    the user moves a card along, by dragging it between columns — and the
    lifecycle badge is plain text, present and quiet.

    The axis is in the accessible name as well as in the outline, so the
    distinction survives for a reader who gets no outline at all.
    """

    def __init__(
        self,
        text: str,
        color: Color | str,
        *,
        axis: str,
        outlined: bool = False,
        parent: QWidget | None = None,
    ) -> None:
        super().__init__(text, parent)
        self._axis = axis
        self._outlined = outlined
        self.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.set_state(text, color)

    @property
    def axis(self) -> str:
        """Which question this badge answers — ``Lifecycle`` or ``Delivery``."""
        return self._axis

    def set_state(self, text: str, color: Color | str) -> None:
        t = tokens()
        self.setText(text)
        if self._outlined:
            self.setStyleSheet(
                f"QLabel{{color:{color};border:{t.size.hairline}px solid {color};"
                f"border-radius:{t.radius.sm}px;padding:1px 7px;"
                f"font-size:{t.type.scale.x2s}px;}}"
            )
        else:
            self.setStyleSheet(
                f"QLabel{{color:{color};border:none;padding:1px 0px;"
                f"font-size:{t.type.scale.x2s}px;}}"
            )
        stated = f"{self._axis}: {text}"
        self.setAccessibleName(stated)
        self.setToolTip(stated)


@traces(SWR.SWR_3304, SWR.SWR_3314)
class RequirementCardWidget(Card):
    """One requirement, as the board shows it — focusable, named, openable.

    Keyboard-complete on purpose (SWR-3314): the card takes focus, Enter and
    Space open it, and the ring inside it is its own tab stop, so every action a
    mouse reaches is reachable without one.
    """

    #: The card was opened — Enter, Space or a double click.
    activated = Signal(str)
    #: The card took focus or was clicked.
    selected = Signal(str)
    #: The traceability ring was opened (SWR-3306).
    evidence_activated = Signal(str)
    #: A run of this requirement is waiting on the user and they said they would
    #: answer it — carries the **session id**, not the requirement id, because
    #: what it opens is that run's session in the workspace (SWR-3623).
    attention_activated = Signal(str)

    #: Whether a delivery action may attach to this card at all (SWR-3308).
    ACCEPTS_DELIVERY_ACTIONS = True

    def __init__(self, card: RequirementCard, parent: QWidget | None = None) -> None:
        super().__init__(parent=parent)
        self._card = card
        self._selected = False
        t = tokens()
        self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.body.setContentsMargins(t.space.md, t.space[1.25], t.space.md, t.space[1.25])
        self.body.setSpacing(5)

        self.id_label = QLabel()
        self.id_label.setStyleSheet(_id_style())
        self.add_header_widget(self.id_label)

        # The selection mark rides in the header beside the id, hidden until the
        # card is the one the board's controls are aimed at. Hidden rather than
        # blanked so an unselected card spends no height on it.
        self.selected_tag = Tag(SELECTED_MARK, "outline")
        self.selected_tag.setAccessibleName(SELECTED_MARK)
        self.selected_tag.setAccessibleDescription(SELECTED_MEANING)
        self.selected_tag.setToolTip(SELECTED_MEANING)
        self.selected_tag.setVisible(False)
        self.add_header_widget(self.selected_tag)

        # The two badges sit under the id rather than beside it: three controls
        # on one line make the card 350 points wide at its narrowest, which is
        # wider than a column fits at 1000×680 (SWR-3302).
        badges = QHBoxLayout()
        badges.setContentsMargins(0, 0, 0, 0)
        badges.setSpacing(t.space.sm)
        self.lifecycle_chip = StateChip("", t.color.text_secondary, axis="Lifecycle")
        badges.addWidget(self.lifecycle_chip)
        self.delivery_chip = StateChip("", t.color.text_secondary, axis="Delivery", outlined=True)
        badges.addWidget(self.delivery_chip)
        badges.addStretch(1)
        self.body.addLayout(badges)

        self.title_label = QLabel()
        self.title_label.setWordWrap(True)
        self.body.addWidget(self.title_label)

        self.health_label = QLabel()
        self.health_label.setWordWrap(True)
        self.body.addWidget(self.health_label)

        # The ring sits beside the sentence it is a picture of, not in the
        # card's top-right corner. A ring alone at the corner of every card is
        # where this desktop — and most others — put a busy indicator, so a card
        # reading "Never run" appeared to be working on something. Next to
        # "Evidence: 3 missing, 2 not applicable" it is unmistakably a meter of
        # that, and the two channels SWR-3305 pairs are finally adjacent.
        evidence_row = QHBoxLayout()
        evidence_row.setContentsMargins(0, 0, 0, 0)
        evidence_row.setSpacing(8)
        self.ring = EvidenceRing()
        self.ring.activated.connect(lambda: self.evidence_activated.emit(self._card.req_id))
        evidence_row.addWidget(self.ring, 0, Qt.AlignmentFlag.AlignVCenter)
        self.evidence_label = QLabel()
        self.evidence_label.setObjectName("muted")
        self.evidence_label.setWordWrap(True)
        evidence_row.addWidget(self.evidence_label, 1)
        self.body.addLayout(evidence_row)

        self._alerts = QVBoxLayout()
        self._alerts.setContentsMargins(0, 0, 0, 0)
        self._alerts.setSpacing(3)
        self.body.addLayout(self._alerts)

        # A run waiting on this user (SWR-3623). Above the alerts and the facts
        # because it is the only thing on a card that is waiting for *them* —
        # everything else on it is a fact about the requirement. A button rather
        # than a label: it is a door into the session, and a door has to be
        # reachable without a mouse (SWR-3314).
        self.attention_button = make_button("", "ghost")
        self.attention_button.setObjectName("cardAttention")
        self.attention_button.clicked.connect(self._open_attention)
        self.attention_button.hide()
        self.body.addWidget(self.attention_button)

        self._facts = QVBoxLayout()
        self._facts.setContentsMargins(0, 0, 0, 0)
        self._facts.setSpacing(2)
        self.body.addLayout(self._facts)

        self.execution_label = QLabel()
        self.execution_label.setObjectName("muted")
        self.execution_label.setWordWrap(True)
        self.body.addWidget(self.execution_label)

        # The seam SWR-3308 is asserted against and slice 6 fills: a leaf card
        # has an action area, an epic card has none.
        self.action_area = QWidget()
        self.action_area.setObjectName(DELIVERY_ACTION_AREA)
        action_row = QHBoxLayout(self.action_area)
        action_row.setContentsMargins(0, 0, 0, 0)
        action_row.setSpacing(t.space[0.75])
        self.open_button = make_button("Open", "ghost")
        self.open_button.clicked.connect(lambda: self.activated.emit(self._card.req_id))
        action_row.addWidget(self.open_button)
        self.evidence_button = make_button("Evidence", "ghost")
        self.evidence_button.clicked.connect(
            lambda: self.evidence_activated.emit(self._card.req_id)
        )
        action_row.addWidget(self.evidence_button)
        action_row.addStretch(1)
        self.body.addWidget(self.action_area)

        self.set_card(card)
        # Stated rather than left unset: the stylesheet selects on the property,
        # and a card that has never been told either way carries no value for it
        # at all — which works only for as long as nothing asks.
        self.set_selected(False)

    def apply_theme(self, theme: Theme) -> None:
        super().apply_theme(theme)
        # `Card.__init__` installs the hook, so this runs once before the card
        # has built the labels it restyles.
        if hasattr(self, "_facts"):
            self._restyle()

    @property
    def card(self) -> RequirementCard:
        """The value this widget currently paints."""
        return self._card

    @property
    def req_id(self) -> str:
        """Which requirement this card is."""
        return self._card.req_id

    @property
    def delivery_action_area(self) -> QWidget | None:
        """Where a delivery action attaches — ``None`` on an epic (SWR-3308)."""
        return self.action_area

    @traces(SWR.SWR_3304, SWR.SWR_3312)
    def set_card(self, card: RequirementCard) -> None:
        """Repaint this card from *card*, in place.

        In place because SWR-3312 asks for it: a re-evaluation that changed one
        requirement updates one card and leaves the board — its selection, its
        scroll position, its focus — exactly where the user left it.
        """
        self._card = card
        self.id_label.setText(card.req_id)
        self.id_label.setAccessibleName(card.req_id)
        self.ring.set_segments(card.evidence)
        self.title_label.setText(card.title)
        self.title_label.setAccessibleName(card.title)
        health = f"Health: {card.health_label}"
        meaning = health_meaning(card.health)
        self.health_label.setText(health)
        self.health_label.setAccessibleName(health)
        self.health_label.setAccessibleDescription(meaning)
        self.health_label.setToolTip(meaning)
        evidence = f"Evidence: {ring_summary(card.evidence)}"
        explained = f"{ring_description(card.evidence)} {EVIDENCE_MEANING}"
        self.evidence_label.setText(evidence)
        self.evidence_label.setAccessibleName(evidence)
        self.evidence_label.setAccessibleDescription(explained)
        self.evidence_label.setToolTip(explained)
        self._set_attention(card)
        self._fill(self._alerts, _alert_lines(card))
        self._fill(self._facts, _fact_lines(card))
        execution = f"{card.units_label} · {card.last_run_label}"
        explained_run = _explained(EXECUTION_UNITS_MEANING, card.last_run_moment)
        self.execution_label.setText(execution)
        self.execution_label.setAccessibleName(execution)
        self.execution_label.setAccessibleDescription(explained_run)
        self.execution_label.setToolTip(explained_run)
        self.open_button.setAccessibleName(f"Open {card.req_id}")
        self.open_button.setToolTip(f"Open {card.req_id} and its detail view.")
        hint = evidence_button_hint(card)
        self.evidence_button.setAccessibleName(f"Open evidence for {card.req_id}")
        self.evidence_button.setAccessibleDescription(hint)
        self.evidence_button.setToolTip(hint)
        self.setAccessibleName(card.accessible_name)
        self._announce()
        self._restyle()

    @traces(SWR.SWR_3623)
    def _set_attention(self, card: RequirementCard) -> None:
        """Show — or hide — the one thing on this card that is waiting for the user.

        Hidden rather than blanked when there is nothing waiting: an empty
        control on every card is a control the eye learns to skip, and the state
        this exists to make unmissable would go with it.
        """
        attention = card.attention
        if attention is None:
            # Named even while hidden. The board's accessibility sweep walks the
            # whole tree rather than the visible part of it, on the grounds that
            # a control which is nameless when hidden is one nobody notices is
            # nameless the moment it is shown (SWR-3314).
            self.attention_button.setText("")
            self.attention_button.setAccessibleName(f"No run of {card.req_id} is waiting for you")
            self.attention_button.setAccessibleDescription("")
            self.attention_button.setToolTip("")
            self.attention_button.hide()
            return
        self.attention_button.setText(attention.sentence)
        self.attention_button.setAccessibleName(f"{attention.sentence} — {card.req_id}")
        self.attention_button.setAccessibleDescription(attention.announced)
        self.attention_button.setToolTip(attention.announced)
        self.attention_button.setEnabled(bool(attention.session_id))
        self.attention_button.show()

    def _open_attention(self) -> None:
        """Answer the run that is waiting — nowhere else, and never silently.

        A requirement whose run is waiting but whose session id has not been
        recorded yet has nothing to open, so the control says so by being
        disabled rather than by raising a signal nobody can act on.
        """
        attention = self._card.attention
        if attention is not None and attention.session_id:
            self.attention_activated.emit(attention.session_id)

    def _restyle(self) -> None:
        """Every presentation value this card holds, against the active theme.

        Split from :meth:`set_card` because the two answer different events — a
        re-evaluated requirement, and a theme switch — and only this half may run
        without a new value to show. Running :meth:`set_card` for a repaint would
        overwrite the selection sentence :meth:`set_selected` put on the card.
        """
        t = tokens()
        # Through `_id_style` rather than rebuilt here: the id is deliberately
        # *not* monospaced (see that function), and a second spelling of this
        # rule is a second place for it to be lost.
        self.id_label.setStyleSheet(_id_style())
        self.title_label.setStyleSheet(f"font-size:{t.type.scale.sm}px;")
        self.lifecycle_chip.set_state(self._card.lifecycle_label, t.color.text_secondary)
        # Both of these are the engine's colour for a state, painted as a *word*.
        # The semantics table answers with the graphical form — the one a status
        # dot owes 3:1 — so it is lifted to the text floor before it is written
        # into a stylesheet.
        self.delivery_chip.set_state(
            self._card.delivery_label,
            raise_to_readable(theme.delivery_color(self._card.delivery), t),
        )
        self.health_label.setStyleSheet(
            f"font-size:{t.type.scale.xs}px;"
            f"color:{raise_to_readable(theme.health_color(self._card.health), t)};"
        )
        # Rebuilt rather than restyled in place: each line carries the colour its
        # own severity earned (`_Line.color`), so re-deriving the lines is what
        # re-derives their colours. Sweeping a single declaration over them would
        # flatten a failed alert and an attention one to the same word.
        self._fill(self._alerts, _alert_lines(self._card))
        self._fill(self._facts, _fact_lines(self._card))

    def _fill(self, layout: QVBoxLayout, lines: tuple[_Line, ...]) -> None:
        while layout.count():
            item = layout.takeAt(0)
            widget = item.widget()
            if widget is not None:
                widget.setParent(None)
                widget.deleteLater()
        for line in lines:
            label = QLabel(line.text)
            label.setWordWrap(True)
            label.setAccessibleName(line.text)
            label.setStyleSheet(f"font-size:{tokens().type.scale.xs}px;color:{line.color};")
            if line.explanation:
                label.setAccessibleDescription(line.explanation)
                label.setToolTip(line.explanation)
            layout.addWidget(label)

    @traces(SWR.SWR_3312, SWR.SWR_3314)
    def set_selected(self, selected: bool) -> None:
        """Mark this card as the board's selection — in a word, not only a tint.

        The board's move strip names a requirement ("Move SWR-FR-ADM-001 to …")
        and a user scanning sixty cards has to find which one that is. The
        stylesheet's answer was a seven-percent accent tint and a slightly
        different border, which is a colour-only signal and a faint one: the
        card wears the word as well (SWR-3314).

        The state is remembered rather than only painted, because a card is
        repainted in place when its requirement changes (SWR-3312) and a mark
        that a value update silently erased would be worse than no mark — it
        would be right until the moment something happened.
        """
        self._selected = selected
        super().set_selected(selected)
        self.selected_tag.setVisible(selected)
        self._announce()

    def _announce(self) -> None:
        """State everything the card shows, selection included, in one place.

        The description says which of the two states this is, because a reader
        who cannot see the mark still has to be able to ask "am I on the
        selected card". The tooltip only mentions selection when there is
        something to mention: a hover that ends "Not selected" on all sixty
        cards spends the reader's attention on the one card in sixty it does
        not describe.
        """
        stated = self._card.accessible_description
        self.setToolTip(f"{stated}. {SELECTED_MARK}" if self._selected else stated)
        self.setAccessibleDescription(
            f"{stated}. {SELECTED_MARK if self._selected else 'Not selected'}"
        )

    # ── keyboard and mouse (SWR-3314) ─────────────────────────────────────

    @traces(SWR.SWR_3314)
    def keyPressEvent(self, event: QKeyEvent) -> None:  # noqa: N802 — Qt's spelling
        """Enter and Space open the card; Ctrl+E opens its evidence."""
        key = event.key()
        if key in (Qt.Key.Key_Return, Qt.Key.Key_Enter, Qt.Key.Key_Space):
            self.activated.emit(self._card.req_id)
            event.accept()
            return
        if key == Qt.Key.Key_E and event.modifiers() & Qt.KeyboardModifier.ControlModifier:
            self.evidence_activated.emit(self._card.req_id)
            event.accept()
            return
        super().keyPressEvent(event)

    def focusInEvent(self, event: QFocusEvent) -> None:  # noqa: N802 — Qt's spelling
        super().focusInEvent(event)
        self.selected.emit(self._card.req_id)

    def mousePressEvent(self, event: QMouseEvent) -> None:  # noqa: N802 — Qt's spelling
        self.setFocus(Qt.FocusReason.MouseFocusReason)
        self.selected.emit(self._card.req_id)
        super().mousePressEvent(event)

    def mouseDoubleClickEvent(self, event: QMouseEvent) -> None:  # noqa: N802 — Qt's spelling
        self.activated.emit(self._card.req_id)
        event.accept()


@traces(SWR.SWR_3308, SWR.SWR_3314)
class EpicCard(Card):
    """An epic, summarising its children — and carrying no delivery action.

    The counts come from the children's own engine-assigned delivery states and
    evidence states; the progress sentence is the engine's
    (:attr:`~rotaris.models.requirements_state.RequirementCard.epic_label`).
    Counting verdicts is display; deciding one would be a second engine
    (SWR-3311).
    """

    #: Show only this epic's children on the board.
    expand_requested = Signal(str)
    #: The epic itself was opened.
    activated = Signal(str)

    ACCEPTS_DELIVERY_ACTIONS = False

    def __init__(
        self,
        card: RequirementCard,
        children: tuple[RequirementCard, ...] = (),
        parent: QWidget | None = None,
    ) -> None:
        super().__init__(accented=True, parent=parent)
        self._card = card
        self._children: tuple[RequirementCard, ...] = ()
        t = tokens()
        self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)
        self.body.setContentsMargins(t.space.md, t.space[1.25], t.space.md, t.space[1.25])
        self.body.setSpacing(5)

        self.id_label = QLabel()
        self.id_label.setStyleSheet(_id_style())
        self.add_header_widget(self.id_label)
        self.add_header_widget(Tag("Epic", "accent"))

        self.title_label = QLabel()
        self.title_label.setWordWrap(True)
        self.body.addWidget(self.title_label)

        self.progress_label = QLabel()
        self.progress_label.setWordWrap(True)
        self.body.addWidget(self.progress_label)

        self.states_label = QLabel()
        self.states_label.setObjectName("muted")
        self.states_label.setWordWrap(True)
        self.body.addWidget(self.states_label)

        self.traceability_label = QLabel()
        self.traceability_label.setObjectName("muted")
        self.traceability_label.setWordWrap(True)
        self.body.addWidget(self.traceability_label)

        self.activity_label = QLabel()
        self.activity_label.setObjectName("muted")
        self.activity_label.setWordWrap(True)
        self.body.addWidget(self.activity_label)

        self.expand_button = make_button("Show children", "secondary")
        self.expand_button.clicked.connect(lambda: self.expand_requested.emit(self._card.req_id))
        self.body.addWidget(self.expand_button)

        self.set_epic(card, children)

    def apply_theme(self, theme: Theme) -> None:
        super().apply_theme(theme)
        # `Card.__init__` installs the hook, so this runs once before the card
        # has built the labels it restyles.
        if hasattr(self, "progress_label"):
            self._restyle()

    @property
    def card(self) -> RequirementCard:
        """The epic this card paints."""
        return self._card

    @property
    def req_id(self) -> str:
        """Which epic this card is."""
        return self._card.req_id

    @property
    def children_cards(self) -> tuple[RequirementCard, ...]:
        """The children this card is summarising."""
        return self._children

    @property
    def delivery_action_area(self) -> QWidget | None:
        """Always ``None``: an epic's state follows its children (SWR-3308)."""
        return None

    @traces(SWR.SWR_3308)
    def set_epic(self, card: RequirementCard, children: tuple[RequirementCard, ...]) -> None:
        """Summarise *children* under *card*, or state that there are none."""
        self._card = card
        self._children = children
        self.id_label.setText(card.req_id)
        self.id_label.setAccessibleName(card.req_id)
        self.title_label.setText(card.title)
        self.title_label.setAccessibleName(card.title)
        if not children:
            childless = (
                "No child requirements: this epic has nothing to report yet."
                if not card.epic_label
                else f"{card.epic_label}. No child requirement is on this board."
            )
            self.progress_label.setText(childless)
            self.states_label.setText("")
            self.states_label.setVisible(False)
            self.traceability_label.setText("")
            self.traceability_label.setVisible(False)
            self.activity_label.setText("")
            self.activity_label.setVisible(False)
            self.expand_button.setEnabled(False)
            self.expand_button.setToolTip("This epic has no children to show.")
        else:
            progress = card.epic_label or f"{len(children)} child requirements"
            self.progress_label.setText(f"{progress} · {len(children)} on the board")
            self.states_label.setText(_state_counts(children))
            self.states_label.setVisible(True)
            self.traceability_label.setText(_traceability_line(children))
            self.traceability_label.setVisible(True)
            self.activity_label.setText(_activity_line(children))
            self.activity_label.setVisible(True)
            self.expand_button.setEnabled(True)
            self.expand_button.setToolTip(f"Show only the requirements below {card.req_id}")
        for label in (
            self.progress_label,
            self.states_label,
            self.traceability_label,
            self.activity_label,
        ):
            label.setAccessibleName(label.text() or "Epic summary")
        self.expand_button.setAccessibleName(f"Show the children of {card.req_id}")
        self.setAccessibleName(card.accessible_name)
        self.setAccessibleDescription(self.summary)
        self.setToolTip(self.summary)
        self._restyle()

    def _restyle(self) -> None:
        """Every presentation value this card holds, against the active theme."""
        t = tokens()
        # Through `_id_style` rather than rebuilt here: the id is deliberately
        # *not* monospaced (see that function), and a second spelling of this
        # rule is a second place for it to be lost.
        self.id_label.setStyleSheet(_id_style())
        self.title_label.setStyleSheet(f"font-size:{t.type.scale.sm}px;")
        # A childless epic reports nothing, so its progress line is plain
        # secondary text; once it has children the line carries the engine's
        # health, lifted to the floor a word owes.
        progress = (
            raise_to_readable(theme.health_color(self._card.health), t)
            if self._children
            else t.color.text_secondary
        )
        self.progress_label.setStyleSheet(f"font-size:{t.type.scale.xs}px;color:{progress};")

    @property
    def summary(self) -> str:
        """Everything this epic card states, in reading order."""
        parts = [
            self.progress_label.text(),
            self.states_label.text(),
            self.traceability_label.text(),
            self.activity_label.text(),
        ]
        return ". ".join(part for part in parts if part)

    @traces(SWR.SWR_3314)
    def keyPressEvent(self, event: QKeyEvent) -> None:  # noqa: N802 — Qt's spelling
        """Enter opens the epic; Space filters the board to its children."""
        if event.key() in (Qt.Key.Key_Return, Qt.Key.Key_Enter):
            self.activated.emit(self._card.req_id)
            event.accept()
            return
        if event.key() == Qt.Key.Key_Space and self._children:
            self.expand_requested.emit(self._card.req_id)
            event.accept()
            return
        super().keyPressEvent(event)


def _state_counts(children: tuple[RequirementCard, ...]) -> str:
    """``Backlog 3 · Running 1 · Done 5`` — the children by delivery state."""
    counts: dict[str, int] = {}
    for child in children:
        counts[child.delivery_label] = counts.get(child.delivery_label, 0) + 1
    return " · ".join(f"{label} {count}" for label, count in counts.items())


def _traceability_line(children: tuple[RequirementCard, ...]) -> str:
    """How many children hold complete evidence, counted from their own states."""
    satisfied = sum(1 for child in children if child.evidence_state == "satisfied")
    percent = round(100 * satisfied / len(children))
    return f"Traceability {percent}% · {satisfied} of {len(children)} children have full evidence"


def _activity_line(children: tuple[RequirementCard, ...]) -> str:
    """Active runs and blocked children — the two facts an epic owner acts on."""
    running = sum(1 for child in children if child.delivery == "running")
    blocked = sum(1 for child in children if is_blocked(child))
    return f"{running} running · {blocked} blocked"
