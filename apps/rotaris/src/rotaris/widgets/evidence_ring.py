"""The traceability ring, and the evidence view it opens (SWR-3305, SWR-3306).

The ring is the board's most compressed claim: five segments, one per evidence
obligation (SWR-3206), each painted in the colour of the health the engine
computed for it (SWR-3207). Two properties decide whether it is honest:

- **It is not a count of annotations.** A requirement with complete traces and a
  failing test paints a red segment. The states arrive from the projection and
  are carried through; nothing here decides one (SWR-3311).
- **It is never colour alone.** Every ring carries an accessible description
  naming each segment and its state, and the card prints
  :func:`ring_summary` beside it. Somebody who cannot separate amber from red
  reads exactly the same facts.

The second half of the module is the view the ring opens (SWR-3306). An
indicator that cannot be opened teaches a user to ignore it, so activating the
ring — by mouse or from the keyboard — lands on the implementation sites and
covering tests as file and line, on what is missing, on the verification block
with its verdict, commit and requirement hash, and on the execution and
integration records. Each site is activatable and reports the intent to open a
file at a line; each known run reports the intent to open its session.

Everything the view needs it takes from the two values the board already has —
:class:`~rotaris.models.requirements_state.RequirementCard` and
:class:`~rotaris.models.requirements_state.RequirementDetail`. The extraction is
pure and lives in :func:`evidence_sites`, :func:`missing_evidence` and
:func:`verification_facts`, so the shape of an evidence view is testable without
a widget, a repository or an engine.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from PySide6.QtCore import QRectF, QSize, Qt, Signal
from PySide6.QtGui import QColor, QPainter, QPen
from PySide6.QtWidgets import (
    QFrame,
    QLabel,
    QScrollArea,
    QVBoxLayout,
    QWidget,
)
from rotaris_core.reqtocode import SWR, traces

from rotaris import theme
from rotaris.models.requirements_state import RequirementFact
from rotaris.theme import tokens
from rotaris.theme.manager import Themed
from rotaris.widgets.cards import SectionLabel, make_button
from rotaris.widgets.patterns import DetailPageHeader

if TYPE_CHECKING:
    from PySide6.QtGui import QKeyEvent, QMouseEvent, QPaintEvent

    from rotaris.models.requirements_state import (
        EvidenceSegment,
        RequirementCard,
        RequirementDetail,
    )
    from rotaris.theme.spec import Theme

__all__ = [
    "EMPTY_RING_REASON",
    "EvidenceRing",
    "EvidenceSite",
    "EvidenceView",
    "RingArc",
    "evidence_run_ids",
    "evidence_sites",
    "missing_evidence",
    "ring_arcs",
    "ring_description",
    "ring_summary",
    "verification_facts",
]

#: What an obligation-free requirement's ring says instead of painting a full
#: circle. A green ring for "nothing was ever required" is the single most
#: misleading thing this widget could draw (SWR-3305).
EMPTY_RING_REASON = "No evidence obligations: this requirement owes no evidence yet."

#: Degrees of empty space between two segments, so five obligations read as five
#: segments rather than as one ring in five colours.
_GAP_DEGREES = 7.0

#: Qt measures arcs in sixteenths of a degree, from 3 o'clock, counter-clockwise.
_SIXTEENTHS = 16
_TWELVE_OCLOCK = 90.0

#: Clear space between the arcs and the widget's edge, on every side. Geometry
#: rather than a spacing token: it is exactly what keeps the focus outline from
#: being drawn on top of the segments it is meant to surround.
_HALO_PX = 3


@dataclass(frozen=True)
class RingArc:
    """One painted segment: which obligation, where it sits, what colour.

    Separated from the painting so the geometry is a value a test can assert on:
    an arc that overlaps its neighbour or a ring that does not close is a defect
    nobody sees in an offscreen screenshot.
    """

    segment: EvidenceSegment
    start_angle: float
    span_angle: float
    color: str

    @property
    def sentence(self) -> str:
        """What this arc says out loud — ``Test: Failed — covering-test-failed``."""
        return self.segment.sentence


@traces(SWR.SWR_3305)
def ring_arcs(segments: tuple[EvidenceSegment, ...]) -> tuple[RingArc, ...]:
    """One arc per obligation, in the engine's own order, clockwise from noon.

    Equal slices: the ring answers "is the evidence complete, current and
    passing", and weighting a segment by anything would turn that into a claim
    about importance that no requirement states.
    """
    count = len(segments)
    if count == 0:
        return ()
    slice_degrees = 360.0 / count
    span = slice_degrees - _GAP_DEGREES
    return tuple(
        RingArc(
            segment=segment,
            start_angle=_TWELVE_OCLOCK - index * slice_degrees - _GAP_DEGREES / 2,
            span_angle=-span,
            color=theme.evidence_color(segment.state),
        )
        for index, segment in enumerate(segments)
    )


@traces(SWR.SWR_3305)
def ring_description(segments: tuple[EvidenceSegment, ...]) -> str:
    """Every segment and its state, as a screen reader announces the ring.

    The whole meaning of the widget in words (SWR-3305): without this the ring
    is a colour wheel, which is precisely the encoding the accessibility
    standard of this app forbids.
    """
    if not segments:
        return EMPTY_RING_REASON
    return "Traceability: " + ". ".join(segment.sentence for segment in segments) + "."


@traces(SWR.SWR_3305)
def ring_summary(segments: tuple[EvidenceSegment, ...]) -> str:
    """``3 satisfied, 1 failed, 1 missing`` — the ring's text twin on the card."""
    if not segments:
        return "No obligations"
    counts: dict[str, int] = {}
    for segment in segments:
        counts[segment.state_label] = counts.get(segment.state_label, 0) + 1
    return ", ".join(f"{count} {label.lower()}" for label, count in counts.items())


@traces(SWR.SWR_3305, SWR.SWR_3314)
class EvidenceRing(Themed, QWidget):
    """The card's evidence indicator: painted, named, focusable and openable.

    Focusable on purpose (SWR-3314): the ring is the entry point to the evidence
    view, and an indicator only a mouse can open is an action a keyboard user
    cannot reach.
    """

    #: The ring was opened — by click, by Enter or by Space.
    activated = Signal()

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._segments: tuple[EvidenceSegment, ...] = ()
        self._arcs: tuple[RingArc, ...] = ()
        self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setAccessibleName("Traceability ring")
        self.setAccessibleDescription(EMPTY_RING_REASON)
        self.setToolTip(EMPTY_RING_REASON)
        self.install_theme_hook()

    @property
    def segments(self) -> tuple[EvidenceSegment, ...]:
        """The obligations this ring currently paints."""
        return self._segments

    @property
    def arcs(self) -> tuple[RingArc, ...]:
        """The geometry this ring currently paints."""
        return self._arcs

    @traces(SWR.SWR_3305)
    def set_segments(self, segments: tuple[EvidenceSegment, ...]) -> None:
        """Paint *segments*, and say the same thing in the accessible description."""
        self._segments = segments
        self._arcs = ring_arcs(segments)
        description = ring_description(segments)
        self.setAccessibleDescription(description)
        self.setToolTip(description)
        self.update()

    def apply_theme(self, theme: Theme) -> None:
        """Re-take the ring's size and its arc colours from *theme*.

        Both are per-theme and both are held rather than read at paint time: a
        high-contrast theme draws a larger, thicker ring, and an arc's colour was
        resolved when the segments arrived — which may have been several themes
        ago.
        """
        side = theme.size.ring_size + 2 * _HALO_PX
        self.setFixedSize(QSize(side, side))
        self._arcs = ring_arcs(self._segments)

    def paintEvent(self, event: QPaintEvent) -> None:  # noqa: N802 — Qt's spelling
        del event
        t = tokens()
        thickness = t.size.ring_thickness
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        inset = thickness / 2 + _HALO_PX
        box = QRectF(self.rect()).adjusted(inset, inset, -inset, -inset)
        painter.setPen(QPen(t.color.track.qcolor, thickness))
        painter.drawEllipse(box)
        for arc in self._arcs:
            pen = QPen(QColor(arc.color), thickness)
            pen.setCapStyle(Qt.PenCapStyle.FlatCap)
            painter.setPen(pen)
            painter.drawArc(
                box,
                round(arc.start_angle * _SIXTEENTHS),
                round(arc.span_angle * _SIXTEENTHS),
            )
        if self.hasFocus():
            # Inset by half the pen so a thick focus ring lands inside the
            # widget instead of being clipped by its own edge.
            edge = t.size.focus_ring / 2
            painter.setPen(QPen(t.color.focus.qcolor, t.size.focus_ring))
            painter.drawEllipse(QRectF(self.rect()).adjusted(edge, edge, -edge, -edge))

    def keyPressEvent(self, event: QKeyEvent) -> None:  # noqa: N802 — Qt's spelling
        if event.key() in (Qt.Key.Key_Return, Qt.Key.Key_Enter, Qt.Key.Key_Space):
            self.activated.emit()
            event.accept()
            return
        super().keyPressEvent(event)

    def mouseReleaseEvent(self, event: QMouseEvent) -> None:  # noqa: N802 — Qt's spelling
        if event.button() == Qt.MouseButton.LeftButton and self.rect().contains(
            event.position().toPoint()
        ):
            self.setFocus(Qt.FocusReason.MouseFocusReason)
            self.activated.emit()
            event.accept()
            return
        super().mouseReleaseEvent(event)


# ── what the evidence view is made of (SWR-3306) ───────────────────────────


@dataclass(frozen=True)
class EvidenceSite:
    """One implementation site or covering test, with somewhere to go.

    ``state`` is the obligation's health as the engine reported it, not a
    per-line verdict: the projection states whether the *test* evidence is
    failing, and inventing a per-file verdict from that would be the second
    answer SWR-3311 forbids.
    """

    kind: str
    label: str
    path: str
    line: int
    state: str
    state_label: str

    @property
    def address(self) -> str:
        """``src/rotaris_core/thing.py:12`` — how the row prints."""
        return f"{self.path}:{self.line}" if self.line else self.path

    @property
    def sentence(self) -> str:
        """``Implementation src/thing.py:12 — Satisfied``, for a screen reader."""
        return f"{self.label} {self.address} — {self.state_label}"


def _section_facts(detail: RequirementDetail, key: str) -> dict[str, str]:
    section = detail.section(key)
    return {fact.label: fact.value for fact in section.facts} if section is not None else {}


def _section_lines(detail: RequirementDetail, key: str) -> tuple[str, ...]:
    section = detail.section(key)
    return section.lines if section is not None else ()


def _count(facts: dict[str, str], label: str) -> int:
    try:
        return int(facts.get(label, "0") or 0)
    except ValueError:
        return 0


def _split_address(address: str) -> tuple[str, int]:
    """``a/b.py:40`` → ``("a/b.py", 40)``; a line-less address keeps line 0."""
    path, _, tail = address.rpartition(":")
    if path and tail.isdigit():
        return path, int(tail)
    return address, 0


def _state_of(card: RequirementCard, kind: str) -> tuple[str, str]:
    """The engine's health for one obligation kind, carried through verbatim."""
    for segment in card.evidence:
        if segment.kind == kind:
            return segment.state, segment.state_label
    return "not-applicable", "Not applicable"


@traces(SWR.SWR_3306)
def evidence_sites(card: RequirementCard, detail: RequirementDetail) -> tuple[EvidenceSite, ...]:
    """Implementation sites and covering tests, in the order the engine listed them.

    The traceability section carries the addresses as one sequence and the two
    counts as facts, which is what tells implementations from tests here — the
    engine's own split, not a guess from the path.
    """
    facts = _section_facts(detail, "traceability")
    lines = _section_lines(detail, "traceability")
    implementations = _count(facts, "Implementation sites")
    tests = _count(facts, "Test sites")
    sites: list[EvidenceSite] = []
    for kind, label, addresses in (
        ("implementation", "Implementation", lines[:implementations]),
        ("test", "Covering test", lines[implementations : implementations + tests]),
    ):
        state, state_label = _state_of(card, kind)
        for address in addresses:
            path, line = _split_address(address)
            sites.append(
                EvidenceSite(
                    kind=kind,
                    label=label,
                    path=path,
                    line=line,
                    state=state,
                    state_label=state_label,
                )
            )
    return tuple(sites)


@traces(SWR.SWR_3306)
def missing_evidence(card: RequirementCard) -> tuple[str, ...]:
    """What is missing, named — never an empty list standing in for "fine".

    A requirement can owe five kinds of evidence and hold none of them; a view
    that shows an empty list for that reads as "nothing to see" (SWR-3306).
    """
    return tuple(
        segment.sentence
        for segment in card.evidence
        if segment.state in {"missing", "failed", "stale"}
    )


@traces(SWR.SWR_3306)
def verification_facts(detail: RequirementDetail) -> tuple[RequirementFact, ...]:
    """Verdict, commit and requirement hash — the block SWR-3306 asks for.

    The verdict and the commit come from the verification section, the hashes
    from the requirement section: both are the projection's values, joined here
    because a user asking "what proved this, and for which version" is asking
    one question.
    """
    verification = _section_facts(detail, "verification")
    requirement = _section_facts(detail, "requirement")
    candidates = (
        ("Verdict", verification.get("Verdict", "")),
        ("Verified commit", verification.get("Verified commit", "")),
        ("Requirement hash", requirement.get("Current hash", "")),
        ("Delivered hash", requirement.get("Delivered hash", "")),
        ("Verified", verification.get("Verified", "")),
        ("Delivered by run", verification.get("Delivered by run", "")),
        ("Run verification", verification.get("Run verification", "")),
    )
    return tuple(RequirementFact(label=label, value=value) for label, value in candidates if value)


@traces(SWR.SWR_3306)
def evidence_run_ids(detail: RequirementDetail) -> tuple[str, ...]:
    """Every run this requirement's evidence names, and can open."""
    verification = _section_facts(detail, "verification")
    delivered = verification.get("Delivered by run", "")
    return (delivered,) if delivered else ()


@traces(SWR.SWR_3306, SWR.SWR_3314)
class EvidenceView(QWidget):
    """Where the ring lands: the sites, the verdict, and the records.

    Read-only, like the whole of this slice: every row reports an *intent* —
    open this file at this line, open this run — and the window decides what
    that means.
    """

    #: ``(path, line)`` — the file this evidence points at.
    site_activated = Signal(str, int)
    #: The run whose session the user wants to see.
    run_activated = Signal(str)
    #: Escape, or the back control.
    close_requested = Signal()

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._req_id = ""
        self._sites: tuple[EvidenceSite, ...] = ()
        self.setObjectName("evidenceView")
        self.setAccessibleName("Evidence")
        t = tokens()
        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(t.space.md)

        self.header = DetailPageHeader("Evidence")
        self.header.back_button.setAccessibleName("Back to the requirement board")
        self.header.back_requested.connect(self.close_requested)
        self.back_button = self.header.back_button
        self.title = self.header.title_label
        root.addWidget(self.header)

        self.summary = QLabel()
        self.summary.setObjectName("muted")
        self.summary.setWordWrap(True)
        self.summary.setAccessibleName("Evidence summary")
        root.addWidget(self.summary)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.Shape.NoFrame)
        scroll.setAccessibleName("Evidence details")
        body = QWidget()
        self._body = QVBoxLayout(body)
        self._body.setContentsMargins(0, 0, 0, 0)
        self._body.setSpacing(t.space.sm)
        self._body.addStretch(1)
        scroll.setWidget(body)
        root.addWidget(scroll, 1)

    @property
    def req_id(self) -> str:
        """Whose evidence is on screen."""
        return self._req_id

    @property
    def sites(self) -> tuple[EvidenceSite, ...]:
        """Every site this view currently offers."""
        return self._sites

    @traces(SWR.SWR_3306)
    def set_evidence(self, card: RequirementCard, detail: RequirementDetail | None) -> None:
        """Render one requirement's evidence, degrading to what is stated missing."""
        self._req_id = card.req_id
        self.title.setText(f"Evidence — {card.req_id}")
        self.title.setAccessibleName(f"Evidence for {card.req_id}")
        self.summary.setText(ring_description(card.evidence))
        self._clear()
        sites = evidence_sites(card, detail) if detail is not None else ()
        self._sites = sites
        self._add_sites(sites)
        self._add_missing(card)
        if detail is not None:
            self._add_facts("Verification", verification_facts(detail))
            self._add_runs(evidence_run_ids(detail))
            self._add_records(detail)
        if not sites and not missing_evidence(card):
            self._add_note(
                "No implementation site and no covering test is recorded for this requirement.",
            )

    # ── rows ──────────────────────────────────────────────────────────────

    def _clear(self) -> None:
        while self._body.count() > 1:
            item = self._body.takeAt(0)
            widget = item.widget()
            if widget is not None:
                widget.setParent(None)
                widget.deleteLater()

    def _insert(self, widget: QWidget) -> None:
        self._body.insertWidget(self._body.count() - 1, widget)

    def _add_sites(self, sites: tuple[EvidenceSite, ...]) -> None:
        if not sites:
            return
        self._insert(SectionLabel("Sites"))
        for site in sites:
            button = make_button(f"{site.label} · {site.address}", "ghost")
            button.setAccessibleName(site.sentence)
            button.setAccessibleDescription(
                f"Opens {site.path} at line {site.line or 1}",
            )
            button.setToolTip(f"Open {site.address}")
            path, line = site.path, site.line
            button.clicked.connect(lambda _=False, p=path, ln=line: self.site_activated.emit(p, ln))
            self._insert(button)

    def _add_missing(self, card: RequirementCard) -> None:
        missing = missing_evidence(card)
        if not missing:
            return
        self._insert(SectionLabel("What is missing"))
        for sentence in missing:
            label = QLabel(f"• {sentence}")
            label.setWordWrap(True)
            label.setAccessibleName(sentence)
            self._insert(label)

    def _add_facts(self, title: str, facts: tuple[RequirementFact, ...]) -> None:
        if not facts:
            self._insert(SectionLabel(title))
            self._add_note("Nothing has verified this requirement yet.")
            return
        self._insert(SectionLabel(title))
        for fact in facts:
            label = QLabel(fact.sentence)
            label.setWordWrap(True)
            label.setAccessibleName(fact.sentence)
            label.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
            self._insert(label)

    def _add_runs(self, run_ids: tuple[str, ...]) -> None:
        if not run_ids:
            return
        self._insert(SectionLabel("Runs"))
        for run_id in run_ids:
            button = make_button(f"Run {run_id}", "ghost")
            button.setAccessibleName(f"Open run {run_id}")
            button.clicked.connect(lambda _=False, rid=run_id: self.run_activated.emit(rid))
            self._insert(button)

    def _add_records(self, detail: RequirementDetail) -> None:
        lines = _section_lines(detail, "execution")
        if not lines:
            return
        self._insert(SectionLabel("Execution and integration records"))
        for line in lines:
            label = QLabel(line)
            label.setWordWrap(True)
            label.setAccessibleName(line)
            self._insert(label)

    def _add_note(self, text: str) -> None:
        label = QLabel(text)
        label.setObjectName("muted")
        label.setWordWrap(True)
        label.setAccessibleName(text)
        self._insert(label)

    def keyPressEvent(self, event: QKeyEvent) -> None:  # noqa: N802 — Qt's spelling
        if event.key() == Qt.Key.Key_Escape:
            self.close_requested.emit()
            event.accept()
            return
        super().keyPressEvent(event)
