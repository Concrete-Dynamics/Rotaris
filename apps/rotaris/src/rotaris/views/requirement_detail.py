"""One requirement, in one place — and the revisions it went through.

The card is a summary. Everything else a requirement has needs a single home or
it ends up spread over dialogs, which is how a product ends up with two answers
to "what is the source path of this requirement". So the detail view renders the
five sections SWR-3307 names — Requirement, Relations, Execution, Traceability,
Verification — from the projection's own
:class:`~rotaris.models.requirements_state.RequirementDetail`, in that order,
always all five, each degrading to its own stated empty message rather than to a
shared "nothing here".

Three details are load-bearing:

- **Relations navigate, and a dangling one is still shown.** A ``depends-on``
  pointing at an id the store does not contain is rendered as unresolved with
  its target id and a stated reason (SWR-3307). Hiding it would make the board
  quietly wrong about the project.
- **The description comes from the source.** It is whatever the projection read
  this pass; Rotaris keeps no copy to render instead (SWR-3114).
- **Escape closes, and focus leaves with it.** A detail view that keeps the
  focus after it closes strands a keyboard user on an invisible pane
  (SWR-3314).

The detail view is also where the *writing* half of the board is entered from
(SWR-3605, SWR-3607). Two entry points, both stated rather than implied:

- **Edit**, when the originating source can be written. When it cannot, the
  panel says ``Source is read-only``, names the artefact, and offers to open it
  instead of showing a disabled field with no explanation — the difference
  SWR-3605's third acceptance criterion is about.
- **Blockers**, when the engine raised any. Each blocker states its reason, its
  question and one control per option carrying that option's *consequence*
  (SWR-3607). :attr:`RequirementDetailView.blocker_area` is the container a
  richer blocker surface mounts into later; until then this is the answer path,
  and it is a complete one.

Neither entry point performs anything. Editing writes through the adapter and
answering a blocker returns to the engine, both by way of the controller — the
same single write path every other board action takes (SWR-3609).

The second half of the module is the revision history (SWR-3313): which version
of this requirement was actually built, by which run, carried by which commit,
and — the question a classical tracker cannot answer — which version was never
built at all. Every one of those facts arrives on
:attr:`~rotaris.models.requirements_state.RequirementDetail.revisions`, assembled
by the engine out of the source's own revisions, the hashes Rotaris recorded and
the deliveries (SWR-3214). This module orders nothing and derives nothing: it
draws the list, marks the current entry the engine marked, and states — rather
than hides — a history that could not be read (SWR-3311).
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Final

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QFrame,
    QHBoxLayout,
    QLabel,
    QScrollArea,
    QVBoxLayout,
    QWidget,
)
from rotaris_core.reqtocode import SWR, traces

from rotaris.models.requirements_state import EXECUTION_SECTION, NO_HISTORY_REASON, Revision
from rotaris.theme import delivery_color, health_color, raise_to_readable, tokens
from rotaris.theme.manager import Themed
from rotaris.widgets.cards import Card, SectionLabel, Tag, make_button, set_action_availability
from rotaris.widgets.feedback import EmptyState
from rotaris.widgets.patterns import ContentColumn, DetailPageHeader
from rotaris.widgets.requirement_card import StateChip

if TYPE_CHECKING:
    from PySide6.QtGui import QKeyEvent
    from PySide6.QtWidgets import QPushButton

    from rotaris.models.requirements_state import (
        Blocker,
        DetailSection,
        RequirementAttention,
        RequirementDetail,
    )
    from rotaris.theme.spec import Theme

__all__ = [
    "BLOCKER_AREA",
    "NO_BLOCKERS_MESSAGE",
    "NO_HISTORY_REASON",
    "NO_REVISIONS_MESSAGE",
    "BlockerPanel",
    "RequirementDetailView",
    "Revision",
    "RevisionHistoryPanel",
]

#: Object name of the container a richer blocker surface mounts into. Named here
#: so a test can assert the seam exists rather than assert that some widget
#: happens to be present (SWR-3607).
BLOCKER_AREA = "requirementBlockers"

#: The facts the state strip states as badges. The requirement section still
#: *carries* them — a projection nobody renders twice is still the projection
#: SWR-3307 describes, and a screen reader walking the section reads the same
#: words — but printing them a second time as grey sentences directly under the
#: badges that already say them is what made the page read as a wall.
STRIP_FACTS: Final = frozenset({"Id", "Title", "Lifecycle", "Delivery state", "Health"})

#: What the blocker panel says when nothing is blocking. A fact about the
#: requirement, not a blank pane.
NO_BLOCKERS_MESSAGE = "Nothing is blocking this requirement."

#: What a panel says when the history *was* read and holds nothing. The other
#: case — a history that could not be read at all — carries the engine's own
#: reason, and the two must not collapse into one sentence (SWR-3313).
NO_REVISIONS_MESSAGE = "No revision of this requirement has been recorded yet."


@traces(SWR.SWR_3313)
class RevisionHistoryPanel(Card):
    """The ordered revisions of one requirement, with the current one marked."""

    #: A run whose session the user wants to open.
    run_activated = Signal(str)
    #: A commit the user wants to see in the Git view.
    commit_activated = Signal(str)

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__("Revision history", parent=parent)
        self._revisions: tuple[Revision, ...] = ()
        self._available = False
        self.setAccessibleName("Revision history")
        self.empty_label = QLabel(NO_HISTORY_REASON)
        self.empty_label.setObjectName("muted")
        self.empty_label.setWordWrap(True)
        self.empty_label.setAccessibleName(NO_HISTORY_REASON)
        self.body.addWidget(self.empty_label)
        self._rows = QVBoxLayout()
        self._rows.setContentsMargins(0, 0, 0, 0)
        self._rows.setSpacing(6)
        self.body.addLayout(self._rows)
        self.apply_theme(tokens())

    def apply_theme(self, theme: Theme) -> None:
        """Redraw the rows, which carry their marker and text colours inline.

        `Card.__init__` installs the hook, so this runs once before the rows
        exist — the guard is that call, not a defensive habit.
        """
        super().apply_theme(theme)
        if hasattr(self, "_rows"):
            self._render_rows()

    @property
    def revisions(self) -> tuple[Revision, ...]:
        """What the panel currently lists, oldest first."""
        return self._revisions

    @property
    def source_history_available(self) -> bool:
        """Whether the listed revisions are the source's own history or only what
        Rotaris recorded itself."""
        return self._available

    @traces(SWR.SWR_3313)
    def set_revisions(
        self,
        revisions: tuple[Revision, ...],
        *,
        available: bool = True,
        reason: str = "",
    ) -> None:
        """List *revisions*, and say what is missing from the list.

        Three states, and they are deliberately not two. A read history with
        entries lists them and says nothing more. A read history with no entries
        says so (:data:`NO_REVISIONS_MESSAGE`). A history that could *not* be
        read carries *reason* — the engine's own words — **beside** whatever
        Rotaris did record, because "this source keeps no revision history" and
        "this requirement has one revision" are different answers to the user's
        question (SWR-3313).
        """
        self._revisions = revisions
        self._available = available
        note = ""
        if not available:
            note = reason.strip() or NO_HISTORY_REASON
        elif not revisions:
            note = NO_REVISIONS_MESSAGE
        self.empty_label.setVisible(bool(note))
        self.empty_label.setText(note)
        self.empty_label.setAccessibleName(note or "Revision history")
        self._render_rows()

    def _render_rows(self) -> None:
        self._clear()
        for index, revision in enumerate(self._revisions, start=1):
            self._rows.addWidget(self._row(index, revision))

    def _clear(self) -> None:
        while self._rows.count():
            item = self._rows.takeAt(0)
            widget = item.widget()
            if widget is not None:
                widget.setParent(None)
                widget.deleteLater()

    def _row(self, index: int, revision: Revision) -> QWidget:
        t = tokens()
        row = QWidget()
        row.setAccessibleName(f"Revision {index}: {revision.sentence}")
        layout = QHBoxLayout(row)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(8)
        marker = QLabel("●" if revision.current else "○")
        marker.setAccessibleName("Current revision" if revision.current else "Earlier revision")
        # The accent's text step rather than its fill step: this marker is a
        # glyph in a run of text, so it owes the text floor and not the 3:1 a
        # painted dot would owe.
        marker_colour = t.color.accent[300] if revision.current else t.color.text_tertiary
        marker.setStyleSheet(f"color:{marker_colour};font-size:{t.type.scale.xs}px;")
        layout.addWidget(marker)
        text = QLabel(revision.sentence)
        text.setWordWrap(True)
        text.setAccessibleName(revision.sentence)
        text.setStyleSheet(
            f"font-size:{t.type.scale.xs}px;"
            f"color:{t.color.text if revision.delivered else t.color.text_secondary};"
        )
        text.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        layout.addWidget(text, 1)
        if revision.run_id:
            run_button = make_button(f"Run {revision.run_id}", "ghost")
            run_button.setAccessibleName(f"Open run {revision.run_id}")
            run_id = revision.run_id
            run_button.clicked.connect(lambda: self.run_activated.emit(run_id))
            layout.addWidget(run_button)
        if revision.commit:
            commit_button = make_button(f"Commit {revision.commit}", "ghost")
            commit_button.setAccessibleName(f"Open commit {revision.commit}")
            commit = revision.commit
            commit_button.clicked.connect(lambda: self.commit_activated.emit(commit))
            layout.addWidget(commit_button)
        return row


@traces(SWR.SWR_3607)
class BlockerPanel(Card):
    """Every blocker on one requirement, with its question and its answers.

    One control per option, and each control carries that option's consequence
    (SWR-3607): "Split the requirement" and "creates two requirements and
    re-plans the work" belong on the same button, because an option whose effect
    a user has to guess at is an option nobody can take responsibility for.

    A blocker with no options is still shown — a dependency block is a fact the
    user has to see even when the only way out is to deliver the other
    requirement — and it navigates to what blocks it instead of offering a
    button that would do nothing (SWR-3510).
    """

    #: ``(req_id, option key)`` — the user chose an answer.
    answered = Signal(str, str)
    #: A requirement that blocks this one, which the user wants to open.
    blocking_activated = Signal(str)

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__("Blockers", parent=parent)
        self.setObjectName(BLOCKER_AREA)
        self.setAccessibleName("Blockers")
        self._blockers: tuple[Blocker, ...] = ()
        # A dashed empty state, not a grey line: "nothing is blocking this" is
        # the best news this panel ever carries, and a sentence alone on a card
        # reads as a panel that failed to fill itself.
        self._empty = EmptyState(
            NO_BLOCKERS_MESSAGE,
            "Anything the engine raises appears here with its question and its answers.",
            compact=True,
        )
        # Kept under the name the panel published before the state replaced the
        # label: it is the same words, in the same place, and it is what the
        # blocker tests read.
        self.empty_label = self._empty.title_label
        self.body.addWidget(self._empty)
        self._rows = QVBoxLayout()
        self._rows.setContentsMargins(0, 0, 0, 0)
        self._rows.setSpacing(8)
        self.body.addLayout(self._rows)
        self.apply_theme(tokens())

    def apply_theme(self, theme: Theme) -> None:
        """Redraw the blockers, whose sentences carry a state colour inline.

        `Card.__init__` installs the hook, so this runs once before the rows
        exist — the guard is that call, not a defensive habit.
        """
        super().apply_theme(theme)
        if hasattr(self, "_rows"):
            self.set_blockers(self._blockers)

    @property
    def blockers(self) -> tuple[Blocker, ...]:
        """What the panel currently presents."""
        return self._blockers

    @traces(SWR.SWR_3607)
    def set_blockers(self, blockers: tuple[Blocker, ...]) -> None:
        """Present *blockers*, each with its reason, question and answer path."""
        self._blockers = blockers
        # Accented only while it holds something. The accent rule is what draws
        # the eye down the page, and a panel saying "nothing is blocking this"
        # must not be the loudest thing on the screen.
        self.setProperty("accented", "true" if blockers else "false")
        self.style().unpolish(self)
        self.style().polish(self)
        while self._rows.count():
            item = self._rows.takeAt(0)
            widget = item.widget()
            if widget is not None:
                widget.setParent(None)
                widget.deleteLater()
        self._empty.setVisible(not blockers)
        for blocker in blockers:
            self._rows.addWidget(self._row(blocker))
        self.setAccessibleDescription(
            "; ".join(blocker.accessible_description for blocker in blockers)
            or NO_BLOCKERS_MESSAGE,
        )

    def _row(self, blocker: Blocker) -> QWidget:
        t = tokens()
        row = QWidget()
        row.setAccessibleName(f"{blocker.req_id} {blocker.sentence}")
        row.setAccessibleDescription(blocker.accessible_description)
        layout = QVBoxLayout(row)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(4)
        # Both lines are read as prose, so both take a text-weight colour: the
        # waiting state's own for the fact, the secondary ramp for the question
        # it raises. The sentence says "blocked" either way (SWR-3304).
        for text, colour in (
            (blocker.sentence, t.color.wait_text),
            (blocker.question, t.color.text_secondary),
        ):
            if not text:
                continue
            label = QLabel(text)
            label.setWordWrap(True)
            label.setAccessibleName(text)
            label.setStyleSheet(f"font-size:{t.type.scale.xs}px;color:{colour};")
            label.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
            layout.addWidget(label)
        controls = QHBoxLayout()
        controls.setContentsMargins(0, 0, 0, 0)
        controls.setSpacing(6)
        for choice in blocker.choices:
            button = make_button(choice.label or choice.key, "secondary")
            button.setAccessibleName(f"{choice.label or choice.key} for {blocker.req_id}")
            # The consequence travels with the control, never beside it.
            button.setToolTip(choice.consequence)
            button.setAccessibleDescription(choice.sentence)
            key, req_id = choice.key, blocker.req_id
            button.clicked.connect(lambda _=False, r=req_id, k=key: self.answered.emit(r, k))
            controls.addWidget(button)
        for blocking in blocker.blocking_ids:
            link = make_button(f"Open {blocking}", "ghost")
            link.setAccessibleName(f"Open {blocking}, which blocks {blocker.req_id}")
            target = blocking
            link.clicked.connect(lambda _=False, req=target: self.blocking_activated.emit(req))
            controls.addWidget(link)
        controls.addStretch(1)
        layout.addLayout(controls)
        return row


@traces(SWR.SWR_3307, SWR.SWR_3314)
class RequirementDetailView(Themed, QWidget):
    """The five sections of one requirement, plus its revision history."""

    #: A related requirement the user wants to open.
    relation_activated = Signal(str)
    #: The evidence view for this requirement (SWR-3306).
    evidence_requested = Signal(str)
    #: The neighbourhood graph around this requirement (SWR-3310).
    graph_requested = Signal(str)
    run_activated = Signal(str)
    commit_activated = Signal(str)
    close_requested = Signal()
    #: This requirement should be edited (SWR-3605). Raised only when the source
    #: declares it writable; a read-only one offers :attr:`source_requested`.
    edit_requested = Signal(str)
    #: The original artefact of a read-only requirement (SWR-3605).
    source_requested = Signal(str)
    #: This requirement's blockers should be opened (SWR-3607).
    blockers_requested = Signal(str)
    #: ``(req_id, option key)`` — a blocker answered from this panel (SWR-3607).
    blocker_answered = Signal(str, str)
    #: This requirement's review should be opened (SWR-3603).
    review_requested = Signal(str)
    #: The session id of a run of this requirement that is waiting on the user
    #: (SWR-3623). Its own signal rather than :attr:`run_activated`, which the
    #: revision history raises with a *run* id: the two are different names for
    #: different things, and one signal carrying either would be a slot that has
    #: to guess which it got.
    attention_activated = Signal(str)

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._detail: RequirementDetail | None = None
        self._sections: dict[str, QWidget] = {}
        self._attention_button: QPushButton | None = None
        self.setObjectName("requirementDetail")
        self.setAccessibleName("Requirement detail")
        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(10)

        page = QWidget()
        column = QVBoxLayout(page)
        column.setContentsMargins(0, 0, 0, 0)
        column.setSpacing(10)

        self.header = DetailPageHeader("Requirement")
        self.header.back_button.setAccessibleName("Back to the requirement board")
        self.header.back_requested.connect(self.close_requested)
        self.back_button = self.header.back_button
        self.title = self.header.title_label
        column.addWidget(self.header)

        # The state strip: the same two axes a board card badges (SWR-3202),
        # in the same treatment, so a card and the page it opens cannot look
        # like they are answering different questions. Priority and the parent
        # epic join them because they are the other two facts a card shows at a
        # glance and this page could only spell out in a sentence.
        self.strip = QWidget()
        self.strip.setAccessibleName("Requirement state")
        self._strip = QHBoxLayout(self.strip)
        self._strip.setContentsMargins(0, 0, 0, 0)
        self._strip.setSpacing(6)
        self._strip.addStretch(1)
        column.addWidget(self.strip)

        # The actions sit on their own row rather than beside the title: the
        # writing entry points of SWR-3605 and SWR-3607 join the two reading ones
        # here, and seven controls on the title line would push the detail pane —
        # and with it the whole stacked view — past the supported 1000×680.
        actions = QHBoxLayout()
        actions.setSpacing(6)
        self.evidence_button = make_button("Open evidence", "secondary")
        self.evidence_button.setAccessibleName("Open evidence")
        self.evidence_button.clicked.connect(self._request_evidence)
        actions.addWidget(self.evidence_button)
        self.graph_button = make_button("Open graph", "secondary")
        self.graph_button.setAccessibleName("Open the requirement graph")
        self.graph_button.clicked.connect(self._request_graph)
        actions.addWidget(self.graph_button)
        self.review_button = make_button("Open review", "secondary")
        self.review_button.setAccessibleName("Open the review of this requirement")
        self.review_button.clicked.connect(self._request_review)
        actions.addWidget(self.review_button)
        self.blockers_button = make_button("Blockers", "secondary")
        self.blockers_button.setAccessibleName("Resolve the blockers of this requirement")
        self.blockers_button.clicked.connect(self._request_blockers)
        self.blockers_button.setVisible(False)
        actions.addWidget(self.blockers_button)
        # Two controls, never one disabled one: a writable source is edited here,
        # a read-only source is *opened* here, and the panel says which it is
        # (SWR-3605).
        self.edit_button = make_button("Edit", "primary")
        self.edit_button.setAccessibleName("Edit this requirement")
        self.edit_button.clicked.connect(self._request_edit)
        actions.addWidget(self.edit_button)
        self.source_button = make_button("Open source", "secondary")
        self.source_button.setAccessibleName("Open the requirement's own file")
        self.source_button.clicked.connect(self._request_source)
        actions.addWidget(self.source_button)
        actions.addStretch(1)
        column.addLayout(actions)

        self.source_notice = QLabel()
        self.source_notice.setObjectName("muted")
        self.source_notice.setWordWrap(True)
        self.source_notice.setAccessibleName("Requirement source")
        self.source_notice.setVisible(False)
        column.addWidget(self.source_notice)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.Shape.NoFrame)
        scroll.setAccessibleName("Requirement detail sections")
        self.scroll_area = scroll
        body = QWidget()
        self._body = QVBoxLayout(body)
        self._body.setContentsMargins(0, 0, 0, 0)
        self._body.setSpacing(10)
        self.blocker_panel = BlockerPanel()
        self.blocker_panel.answered.connect(self.blocker_answered)
        self.blocker_panel.blocking_activated.connect(self.relation_activated)
        self._body.addWidget(self.blocker_panel)
        self.history = RevisionHistoryPanel()
        self.history.run_activated.connect(self.run_activated)
        self.history.commit_activated.connect(self.commit_activated)
        self._body.addWidget(self.history)
        self._body.addStretch(1)
        scroll.setWidget(body)
        column.addWidget(scroll, 1)
        root.addWidget(ContentColumn(page), 1)
        self.install_theme_hook()

    def apply_theme(self, theme: Theme) -> None:
        """Rebuild the sections, whose facts and source lines are styled inline."""
        del theme  # each section re-reads the tokens it is painted with
        if self._detail is not None:
            self.show_detail(self._detail)

    @property
    def detail(self) -> RequirementDetail | None:
        """The requirement currently on screen, if any."""
        return self._detail

    @property
    def req_id(self) -> str:
        """Which requirement is open — ``""`` when none is."""
        return self._detail.req_id if self._detail is not None else ""

    def section_widget(self, key: str) -> QWidget | None:
        """The rendered container of one section, for a test to look into."""
        return self._sections.get(key)

    @property
    def blocker_area(self) -> QWidget:
        """Where the blockers are presented, and where a richer one mounts."""
        return self.blocker_panel

    @traces(SWR.SWR_3307, SWR.SWR_3605, SWR.SWR_3607)
    def show_detail(self, detail: RequirementDetail) -> None:
        """Render every section of *detail*, each degrading on its own."""
        self._detail = detail
        # The id leads the title and the sentence follows it as the subtitle: a
        # 20px display line reading `SWR-6001 — the product shows one
        # requirement in one place` is a heading nobody can scan, and the id is
        # what the user came here holding.
        self.title.setText(detail.req_id)
        self.title.setAccessibleName(
            f"{detail.req_id} — {detail.title}" if detail.title else detail.req_id
        )
        self.header.set_subtitle(detail.title)
        self._render_strip(detail)
        self.evidence_button.setAccessibleName(f"Open evidence for {detail.req_id}")
        self.graph_button.setAccessibleName(f"Open the graph around {detail.req_id}")
        self.review_button.setAccessibleName(f"Open the review of {detail.req_id}")
        self._sync_editing(detail)
        self.blocker_panel.set_blockers(detail.blockers)
        self.blockers_button.setVisible(bool(detail.blockers))
        self.blockers_button.setAccessibleName(
            f"Resolve the {len(detail.blockers)} blocker(s) of {detail.req_id}",
        )
        self._clear_sections()
        anchor = self._body.indexOf(self.blocker_panel)
        for offset, section in enumerate(detail.sections):
            widget = self._section_widget(section)
            if section.key == EXECUTION_SECTION:
                self._mount_attention(widget, detail.attention)
            self._sections[section.key] = widget
            self._body.insertWidget(anchor + offset, widget)
        # Straight from the projection (SWR-3313): the order is the engine's, the
        # current mark is the engine's, and a history it could not read arrives
        # as its own stated reason rather than as an empty list.
        self.history.set_revisions(
            detail.revisions,
            available=detail.history_available,
            reason=detail.history_reason,
        )
        self.setAccessibleDescription(
            f"Detail view of {detail.req_id}: "
            + ", ".join(section.title for section in detail.sections),
        )

    def _render_strip(self, detail: RequirementDetail) -> None:
        """Rebuild the badge strip — a badge per axis the projection carried.

        Nothing here is a colour on its own (SWR-3304): every badge prints the
        engine's own word, and the axis it answers is in its accessible name.
        """
        while self._strip.count() > 1:
            item = self._strip.takeAt(0)
            if (widget := item.widget()) is not None:
                widget.setParent(None)
                widget.deleteLater()
        index = 0

        def add(widget: QWidget) -> None:
            nonlocal index
            self._strip.insertWidget(index, widget)
            index += 1

        if detail.is_epic:
            epic = Tag("Epic", "accent")
            epic.setAccessibleName("This requirement is an epic")
            add(epic)
        t = tokens()
        # The three colours the board card resolves, resolved the same way: the
        # lifecycle stays quiet on purpose (it is the project's axis, not the
        # one a user drags a card along), and the two coloured ones are lifted
        # to the theme's text floor before they reach a stylesheet.
        if detail.lifecycle_label:
            add(StateChip(detail.lifecycle_label, t.color.text_secondary, axis="Lifecycle"))
        if detail.delivery_label:
            add(
                StateChip(
                    detail.delivery_label,
                    raise_to_readable(delivery_color(detail.delivery), t),
                    axis="Delivery",
                    outlined=True,
                )
            )
        if detail.health_label:
            add(
                StateChip(
                    detail.health_label,
                    raise_to_readable(health_color(detail.health), t),
                    axis="Health",
                )
            )
        # Quiet fills, not outlines: the outlined pill belongs to the delivery
        # axis alone — it is the one a user moves a card along — and three
        # identical outlines in a row would say these are three values of one
        # thing. The epic carries its word, because a bare `SWR-3600` beside a
        # priority is not a fact anybody can read at a glance.
        for label, text in (
            ("Priority", detail.priority_label),
            ("Epic", f"Epic {detail.epic}" if detail.epic else ""),
        ):
            if not text:
                continue
            tag = Tag(text, "neutral")
            stated = f"{label}: {detail.priority_label if label == 'Priority' else detail.epic}"
            tag.setAccessibleName(stated)
            tag.setToolTip(stated)
            add(tag)
        self.strip.setVisible(index > 0)

    def _clear_sections(self) -> None:
        for widget in self._sections.values():
            self._body.removeWidget(widget)
            widget.setParent(None)
            widget.deleteLater()
        self._sections = {}
        # It lives inside the execution card, so it dies with it. Dropped here
        # rather than left dangling: a handle to a deleted C++ object is worse
        # than no handle.
        self._attention_button = None

    @traces(SWR.SWR_3623)
    def _mount_attention(self, card: QWidget, attention: RequirementAttention | None) -> None:
        """State a run of this requirement that is waiting, at the top of *card*.

        Above the units and runs rather than among them: this section lists what
        has happened and what is in flight, and the one line in it that is
        waiting on the *reader* is the one they need before they read the rest.
        Nothing at all when nothing is waiting — an empty control on every
        detail page is one the eye learns to skip, and this is the state that
        must not be skipped.
        """
        if attention is None or not attention.session_id:
            return
        button = make_button(attention.stated, "ghost")
        button.setObjectName("detailAttention")
        button.setAccessibleName(attention.stated)
        button.setAccessibleDescription(attention.announced)
        button.setToolTip(attention.announced)
        session_id = attention.session_id
        button.clicked.connect(lambda: self.attention_activated.emit(session_id))
        # Index 0 of a card's body is its header row; content starts at 1.
        body = getattr(card, "body", None)
        if body is None:
            return
        body.insertWidget(1, button)
        self._attention_button = button

    @property
    def attention_button(self) -> QPushButton | None:
        """The waiting run's control, or ``None`` when nothing is waiting."""
        return self._attention_button

    def _section_widget(self, section: DetailSection) -> QWidget:
        t = tokens()
        card = Card(section.title)
        card.setObjectName("card")
        card.setAccessibleName(f"{section.title} section")
        if section.empty:
            message = QLabel(section.empty_message)
            message.setObjectName("muted")
            message.setWordWrap(True)
            message.setAccessibleName(section.empty_message)
            card.body.addWidget(message)
            card.setAccessibleDescription(section.empty_message)
            return card
        described: list[str] = []
        if section.body:
            body = QLabel(section.body)
            body.setWordWrap(True)
            body.setAccessibleName("Requirement description")
            body.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
            card.body.addWidget(body)
            described.append(section.body)
        for fact in section.facts:
            if section.key == "requirement" and fact.label in STRIP_FACTS:
                described.append(fact.sentence)
                continue
            label = QLabel(fact.sentence)
            label.setWordWrap(True)
            label.setAccessibleName(fact.sentence)
            label.setStyleSheet(f"font-size:{t.type.scale.xs}px;color:{t.color.text_secondary};")
            label.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
            card.body.addWidget(label)
            described.append(fact.sentence)
        if section.links:
            card.body.addWidget(SectionLabel("Related requirements"))
        for link in section.links:
            button = make_button(link.sentence, "ghost")
            button.setAccessibleName(link.sentence)
            target = link.req_id
            button.clicked.connect(lambda _=False, req=target: self.relation_activated.emit(req))
            set_action_availability(
                button,
                enabled=link.resolved,
                reason=(
                    ""
                    if link.resolved
                    else f"{target} is not in this requirement store, so it cannot be opened."
                ),
            )
            card.body.addWidget(button)
            described.append(link.sentence)
        for line in section.lines:
            label = QLabel(line)
            label.setWordWrap(True)
            label.setAccessibleName(line)
            # The mono face comes from the application stylesheet's own
            # `[mono="true"]` rule, so a theme with a different mono stack is
            # followed without this label holding a family of its own.
            label.setProperty("mono", "true")
            label.setStyleSheet(f"font-size:{t.type.scale.xs}px;")
            label.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
            card.body.addWidget(label)
            described.append(line)
        card.setAccessibleDescription(". ".join(described))
        return card

    @traces(SWR.SWR_3605)
    def _sync_editing(self, detail: RequirementDetail) -> None:
        """Offer editing, or say why it is not on offer and where the text lives.

        Never a disabled field with no explanation (SWR-3605): a read-only source
        replaces the edit control with the notice and the navigation, so the user
        learns *where* the requirement lives instead of learning that a button is
        grey.
        """
        editable = detail.editable
        self.edit_button.setVisible(editable)
        self.edit_button.setAccessibleName(f"Edit {detail.req_id}")
        self.edit_button.setToolTip(
            f"Write changes back into {detail.source_path or 'the requirement source'}",
        )
        reason = detail.read_only_reason
        self.source_notice.setText(reason)
        self.source_notice.setAccessibleName(reason or "Requirement source")
        self.source_notice.setAccessibleDescription(reason)
        self.source_notice.setVisible(bool(reason))
        self.source_button.setVisible(bool(detail.source_path))
        self.source_button.setAccessibleName(
            f"Open {detail.source_path}"
            if detail.source_path
            else "Open the requirement's own file",
        )
        set_action_availability(
            self.source_button,
            enabled=bool(detail.source_path),
            reason="This requirement's source does not name a file to open.",
        )

    def _request_evidence(self) -> None:
        if self._detail is not None:
            self.evidence_requested.emit(self._detail.req_id)

    def _request_graph(self) -> None:
        if self._detail is not None:
            self.graph_requested.emit(self._detail.req_id)

    def _request_review(self) -> None:
        if self._detail is not None:
            self.review_requested.emit(self._detail.req_id)

    def _request_edit(self) -> None:
        if self._detail is not None and self._detail.editable:
            self.edit_requested.emit(self._detail.req_id)

    def _request_source(self) -> None:
        if self._detail is not None:
            self.source_requested.emit(self._detail.req_id)

    def _request_blockers(self) -> None:
        if self._detail is not None:
            self.blockers_requested.emit(self._detail.req_id)

    @traces(SWR.SWR_3314)
    def keyPressEvent(self, event: QKeyEvent) -> None:  # noqa: N802 — Qt's spelling
        """Escape closes the detail view, the way every pane in this app does."""
        if event.key() == Qt.Key.Key_Escape:
            self.close_requested.emit()
            event.accept()
            return
        super().keyPressEvent(event)
