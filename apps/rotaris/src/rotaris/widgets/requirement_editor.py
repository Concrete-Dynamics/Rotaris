"""Editing a requirement, and creating one, inside Rotaris (SWR-3605, SWR-3606).

The two surfaces a user types into. The writes themselves live one layer down in
:mod:`rotaris.services.requirement_editing`, which owns the seam into the
source's own adapter; this module renders what that seam offers and reports what
it answers.

Two properties are load-bearing here:

- **Editability is the source's answer, never this surface's.**
  :attr:`~rotaris.models.requirements_state.RequirementDetail.editable` carries
  the capability the adapter declared (SWR-3105), and a read-only source gets
  the stated notice plus navigation to the artefact — not a disabled field with
  no explanation (SWR-3605's third).
- **A failed write preserves the input.** Every refusal, conflict and error
  arrives as an :class:`~rotaris.services.requirement_editing.EditOutcome`
  carrying what the user typed, and :meth:`RequirementEditorPanel.report` puts it
  back rather than clearing the form. Losing a paragraph to a hash conflict is
  the one failure an editor may not have.

Nothing here decides a delivery state either — the guard that pins that sweeps
this module and the service one together.
"""

from __future__ import annotations

from dataclasses import replace
from typing import TYPE_CHECKING

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QFormLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QPlainTextEdit,
    QVBoxLayout,
    QWidget,
)
from rotaris_core.reqtocode import SWR, traces

from rotaris.models.requirements_state import READ_ONLY_SOURCE_NOTICE
from rotaris.services.requirement_editing import (
    NOTHING_TO_SAVE,
    TARGET_UNSTATED,
    TITLE_REQUIRED,
    VERSION_FACT,
    CreationOutcome,
    CreationTarget,
    EditInput,
    EditOutcome,
    NewRequirement,
    SourceOption,
)
from rotaris.theme import tokens
from rotaris.theme.manager import Themed
from rotaris.widgets.cards import Card, SectionLabel, make_button, set_action_availability
from rotaris.widgets.feedback import InlineBanner
from rotaris.widgets.forms import Select

if TYPE_CHECKING:
    from collections.abc import Iterable

    from PySide6.QtGui import QKeyEvent

    from rotaris.models.requirements_state import RequirementDetail
    from rotaris.theme.spec import Theme

__all__ = [
    "CREATION_AREA",
    "EDITOR_AREA",
    "RequirementCreationForm",
    "RequirementEditorPanel",
]

#: Object names of the two surfaces, so a test — and a later pane registration —
#: names them rather than reaching for whichever widget happens to be there.
EDITOR_AREA = "requirementEditor"
CREATION_AREA = "requirementCreation"


# ── the editor surface (SWR-3605) ──────────────────────────────────────────


@traces(SWR.SWR_3605, SWR.SWR_3314)
class RequirementEditorPanel(Themed, QWidget):
    """One requirement's text, editable when its source says so.

    Two shapes, never one disabled one. A writable source gets the fields, the
    save control and the version the edit is aimed at; a read-only source gets
    the ``Source is read-only`` notice, the artefact's name and a control that
    opens it — because a greyed-out field explains nothing, and the user's next
    move is to go where the text actually lives (SWR-3605).

    The panel performs no write. It states what the user typed and renders what
    came back; :class:`~rotaris.services.requirement_editing.RequirementEditing` owns the write, which is what keeps
    the file system off the Qt event loop and out of a widget's constructor.
    """

    #: ``(req_id, title, description)`` — the user asked for this to be saved.
    edit_submitted = Signal(str, str, str)
    #: The artefact a read-only requirement lives in should be opened.
    source_requested = Signal(str)
    #: The user left the editor without saving.
    cancelled = Signal()

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setObjectName(EDITOR_AREA)
        self.setAccessibleName("Requirement editor")
        self._detail: RequirementDetail | None = None
        self._opened = EditInput(req_id="")

        t = tokens()
        root = QVBoxLayout(self)
        root.setContentsMargins(t.space.lg, t.space[1.75], t.space.lg, t.space[1.75])
        root.setSpacing(t.space[1.25])

        self.heading = QLabel("No requirement is open")
        self.heading.setWordWrap(True)
        root.addWidget(self.heading)

        self.notice = InlineBanner()
        # The banner's own controls are announced here rather than left to the
        # text they happen to carry: a failed write is exactly the moment a
        # screen-reader user needs to find "dismiss" (SWR-3314).
        self.notice.action_button.setAccessibleName("Retry saving the requirement")
        self.notice.dismiss_button.setAccessibleName("Dismiss the editor notice")
        root.addWidget(self.notice)

        self.form = QWidget()
        form_layout = QFormLayout(self.form)
        form_layout.setContentsMargins(0, 0, 0, 0)
        form_layout.setSpacing(t.space.sm)
        self.title_field = QLineEdit()
        self.title_field.setAccessibleName("Requirement title")
        self.title_field.textChanged.connect(self._sync_save)
        form_layout.addRow(SectionLabel("Title"), self.title_field)
        self.description_field = QPlainTextEdit()
        self.description_field.setAccessibleName("Requirement description")
        self.description_field.setMinimumHeight(120)
        self.description_field.textChanged.connect(self._sync_save)
        form_layout.addRow(SectionLabel("Description"), self.description_field)
        root.addWidget(self.form, 1)

        self.read_only = Card(READ_ONLY_SOURCE_NOTICE)
        self.read_only_label = QLabel()
        self.read_only_label.setObjectName("muted")
        self.read_only_label.setWordWrap(True)
        self.read_only_label.setTextInteractionFlags(
            Qt.TextInteractionFlag.TextSelectableByMouse,
        )
        self.read_only.body.addWidget(self.read_only_label)
        self.open_source_button = make_button("Open the requirement file", "primary")
        self.open_source_button.setAccessibleName("Open the requirement file")
        self.open_source_button.clicked.connect(self._request_source)
        self.read_only.body.addWidget(self.open_source_button, 0, Qt.AlignmentFlag.AlignLeft)
        root.addWidget(self.read_only)

        actions = QHBoxLayout()
        actions.setSpacing(t.space.sm)
        self.version_label = QLabel()
        self.version_label.setObjectName("dim")
        self.version_label.setWordWrap(True)
        actions.addWidget(self.version_label, 1)
        self.cancel_button = make_button("Cancel", "ghost")
        self.cancel_button.setAccessibleName("Close the editor without saving")
        self.cancel_button.clicked.connect(self.cancelled)
        actions.addWidget(self.cancel_button)
        self.save_button = make_button("Save requirement", "primary")
        self.save_button.setAccessibleName("Save requirement")
        self.save_button.clicked.connect(self._save)
        actions.addWidget(self.save_button)
        root.addLayout(actions)

        self._show_editable(editable=False)
        self.install_theme_hook()

    def apply_theme(self, theme: Theme) -> None:
        # The pane's own title. Not `QLabel#heading` from the stylesheet: that
        # one is the display face at h5, and an editor's title sits with the
        # form it labels rather than above a card.
        self.heading.setStyleSheet(
            f"font-size:{theme.type.scale.base}px;"
            f"font-weight:{theme.type.weight_display};"
            f"color:{theme.color.text};"
        )

    # ── what is open ──────────────────────────────────────────────────────

    @property
    def detail(self) -> RequirementDetail | None:
        """The requirement this editor is showing, when one is open."""
        return self._detail

    @property
    def req_id(self) -> str:
        """The open requirement's id, or ``""``."""
        return self._detail.req_id if self._detail is not None else ""

    @property
    def editable(self) -> bool:
        """Whether the open requirement's source accepts an edit (SWR-3105)."""
        return self._detail is not None and self._detail.editable

    @property
    def opened_on(self) -> EditInput:
        """The values the editor was opened on — what a write compares against."""
        return self._opened

    @property
    def current(self) -> EditInput:
        """What the user has typed, aimed at the version the editor opened on."""
        return replace(
            self._opened,
            title=self.title_field.text(),
            description=self.description_field.toPlainText(),
        )

    @property
    def dirty(self) -> bool:
        """Whether anything the user typed differs from what was opened."""
        return bool(
            self._opened.changes(
                title=self.title_field.text(),
                description=self.description_field.toPlainText(),
            ),
        )

    # ── rendering ─────────────────────────────────────────────────────────

    @traces(SWR.SWR_3605, SWR.SWR_3105)
    def show_detail(self, detail: RequirementDetail) -> None:
        """Open *detail* — as an editor, or as the notice its source earns."""
        self._detail = detail
        self._opened = EditInput(
            req_id=detail.req_id,
            title=detail.title,
            description=detail.description,
            expected_hash=_expected_hash(detail),
        )
        self.heading.setText(f"{detail.req_id} — {detail.title}")
        self.setAccessibleName(f"Editor for {detail.req_id}")
        self.title_field.setText(detail.title)
        self.description_field.setPlainText(detail.description)
        self.notice.show_notice(None)
        self.read_only_label.setText(detail.read_only_reason)
        self.read_only_label.setAccessibleName(detail.read_only_reason)
        where = detail.source_path or detail.source_id
        self.open_source_button.setText(f"Open {where}" if where else "Open the requirement file")
        self.open_source_button.setAccessibleName(
            f"Open {where}, where {detail.req_id} is written" if where else "Open the source",
        )
        self.open_source_button.setVisible(bool(where))
        self.version_label.setText(_version_sentence(detail))
        self._show_editable(editable=detail.editable)
        self._sync_save()

    @traces(SWR.SWR_3605)
    def report(self, outcome: EditOutcome) -> None:
        """Render what the write did — and keep the input when it did not.

        On success the editor re-baselines on what was written, so the next Save
        compares against the version now in the store rather than against the one
        the panel was opened on (SWR-3111's conflict check).
        """
        self.notice.show_notice(outcome.notice())
        if not outcome.ok:
            preserved = outcome.preserved
            if preserved is not None:
                self.title_field.setText(preserved.title)
                self.description_field.setPlainText(preserved.description)
            self._sync_save()
            return
        self._opened = replace(
            self._opened,
            title=self.title_field.text(),
            description=self.description_field.toPlainText(),
            expected_hash=outcome.requirement_hash or self._opened.expected_hash,
        )
        self.version_label.setText(
            f"Saved as version {self._opened.expected_hash}"
            if self._opened.expected_hash
            else "Saved.",
        )
        self._sync_save()

    def _show_editable(self, *, editable: bool) -> None:
        self.form.setVisible(editable)
        self.save_button.setVisible(editable)
        self.read_only.setVisible(not editable)
        # Hidden controls must leave the tab order, not sit in it invisibly
        # (apps/rotaris/AGENTS.md, SWR-3314).
        self.title_field.setFocusPolicy(
            Qt.FocusPolicy.StrongFocus if editable else Qt.FocusPolicy.NoFocus,
        )
        self.description_field.setFocusPolicy(
            Qt.FocusPolicy.StrongFocus if editable else Qt.FocusPolicy.NoFocus,
        )

    def _sync_save(self) -> None:
        if not self.editable:
            return
        reason = ""
        if not self.title_field.text().strip():
            reason = TITLE_REQUIRED
        elif not self.dirty:
            reason = NOTHING_TO_SAVE
        set_action_availability(self.save_button, enabled=not reason, reason=reason)

    # ── what the user asks for ────────────────────────────────────────────

    def _save(self) -> None:
        if not self.editable or not self.dirty or not self.title_field.text().strip():
            return
        self.edit_submitted.emit(
            self.req_id,
            self.title_field.text(),
            self.description_field.toPlainText(),
        )

    def _request_source(self) -> None:
        detail = self._detail
        if detail is None:
            return
        where = detail.source_path or detail.source_id
        if where:
            self.source_requested.emit(where)

    def keyPressEvent(self, event: QKeyEvent) -> None:  # noqa: N802 — Qt's spelling
        """Escape leaves the editor, the way every Rotaris pane closes."""
        if event.key() == Qt.Key.Key_Escape:
            event.accept()
            self.cancelled.emit()
            return
        super().keyPressEvent(event)


def _expected_hash(detail: RequirementDetail) -> str:
    """The requirement version this detail was read at, when it carries one.

    Read off the Requirement section's facts rather than invented: the projection
    already states the current version there, and an editor that guessed one
    would disarm the conflict check it is supposed to arm (SWR-3111).
    """
    section = detail.section("requirement")
    if section is None:
        return ""
    return next((fact.value for fact in section.facts if fact.label == VERSION_FACT), "")


def _version_sentence(detail: RequirementDetail) -> str:
    """What the editor says about the version it is changing."""
    version = _expected_hash(detail)
    where = detail.source_path or detail.source_id or "its source"
    if not detail.editable:
        return f"{detail.req_id} is read in {where}."
    if not version:
        return f"Editing {detail.req_id} in {where}."
    return f"Editing version {version} of {detail.req_id} in {where}."


# ── the creation surface (SWR-3606) ────────────────────────────────────────


@traces(SWR.SWR_3606, SWR.SWR_3314)
class RequirementCreationForm(Themed, QWidget):
    """Compose a requirement, see where it will land, then create it.

    The four things SWR-3606 names are controls here — the target source, the
    parent epic, the product/technical classification and, for a technical
    requirement, its origin — and the fifth is a *label*: the id, the file and
    the epic index the write will touch, stated before the button is enabled.

    Nothing is validated twice by two rules. :class:`NewRequirement` decides what
    is missing and the form renders that list, so the sentence beside a disabled
    Create is the same one the write path would have refused with.
    """

    #: The user asked for this requirement to be created.
    creation_submitted = Signal(object)
    #: The composed requirement changed — recompute the target for it.
    form_changed = Signal(object)
    #: The user left creation without creating anything.
    cancelled = Signal()

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setObjectName(CREATION_AREA)
        self.setAccessibleName("Create a requirement")
        self._sources: tuple[SourceOption, ...] = ()
        self._target: CreationTarget | None = None

        t = tokens()
        root = QVBoxLayout(self)
        root.setContentsMargins(t.space.lg, t.space[1.75], t.space.lg, t.space[1.75])
        root.setSpacing(t.space[1.25])

        self.heading = QLabel("Create a requirement")
        root.addWidget(self.heading)

        self.notice = InlineBanner()
        self.notice.action_button.setAccessibleName("Retry creating the requirement")
        self.notice.dismiss_button.setAccessibleName("Dismiss the creation notice")
        root.addWidget(self.notice)

        fields = QFormLayout()
        fields.setContentsMargins(0, 0, 0, 0)
        fields.setSpacing(t.space.sm)
        self.title_field = QLineEdit()
        self.title_field.setAccessibleName("New requirement title")
        self.title_field.textChanged.connect(self._changed)
        fields.addRow(SectionLabel("Title"), self.title_field)
        self.description_field = QPlainTextEdit()
        self.description_field.setAccessibleName("New requirement description")
        self.description_field.setMinimumHeight(90)
        self.description_field.textChanged.connect(self._changed)
        fields.addRow(SectionLabel("Description"), self.description_field)
        self.source_combo = Select()
        self.source_combo.setAccessibleName("Requirement source")
        self.source_combo.currentIndexChanged.connect(self._changed)
        fields.addRow(SectionLabel("Source"), self.source_combo)
        self.parent_field = QLineEdit()
        self.parent_field.setAccessibleName("Parent epic")
        self.parent_field.setPlaceholderText("SWR-3600")
        self.parent_field.textChanged.connect(self._changed)
        fields.addRow(SectionLabel("Epic"), self.parent_field)
        self.kind_combo = Select()
        self.kind_combo.setAccessibleName("Requirement classification")
        self.kind_combo.addItem("Product requirement", userData=False)
        self.kind_combo.addItem("Technical requirement", userData=True)
        self.kind_combo.currentIndexChanged.connect(self._changed)
        fields.addRow(SectionLabel("Classification"), self.kind_combo)
        self.origin_field = QLineEdit()
        self.origin_field.setAccessibleName("Origin requirement")
        self.origin_field.setPlaceholderText("SWR-3401")
        self.origin_field.textChanged.connect(self._changed)
        self.origin_label = SectionLabel("Origin")
        fields.addRow(self.origin_label, self.origin_field)
        root.addLayout(fields)

        self.target_label = QLabel(TARGET_UNSTATED)
        self.target_label.setObjectName("muted")
        self.target_label.setWordWrap(True)
        self.target_label.setAccessibleName("Where this requirement will be written")
        self.target_label.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        root.addWidget(self.target_label)
        root.addStretch(1)

        actions = QHBoxLayout()
        actions.setSpacing(t.space.sm)
        actions.addStretch(1)
        self.cancel_button = make_button("Cancel", "ghost")
        self.cancel_button.setAccessibleName("Close creation without creating anything")
        self.cancel_button.clicked.connect(self.cancelled)
        actions.addWidget(self.cancel_button)
        self.create_button = make_button("Create requirement", "primary")
        self.create_button.setAccessibleName("Create requirement")
        self.create_button.clicked.connect(self._create)
        actions.addWidget(self.create_button)
        root.addLayout(actions)

        self._sync()
        self.install_theme_hook()

    def apply_theme(self, theme: Theme) -> None:
        self.heading.setStyleSheet(
            f"font-size:{theme.type.scale.base}px;"
            f"font-weight:{theme.type.weight_display};"
            f"color:{theme.color.text};"
        )

    # ── what has been composed ────────────────────────────────────────────

    @property
    def sources(self) -> tuple[SourceOption, ...]:
        """The sources this form offers — every one of them creatable."""
        return self._sources

    @property
    def target(self) -> CreationTarget | None:
        """Where the composed requirement would be written, once resolved."""
        return self._target

    @property
    def form(self) -> NewRequirement:
        """The requirement as it currently stands in the fields."""
        return NewRequirement(
            title=self.title_field.text(),
            description=self.description_field.toPlainText(),
            source_id=str(self.source_combo.currentData() or ""),
            parent=self.parent_field.text(),
            technical=bool(self.kind_combo.currentData()),
            origin=self.origin_field.text(),
        )

    @property
    def problems(self) -> tuple[str, ...]:
        """Why this cannot be created yet — the form's own list, plus the target."""
        found = list(self.form.problems)
        if self._target is None:
            found.append(TARGET_UNSTATED)
        return tuple(found)

    # ── rendering ─────────────────────────────────────────────────────────

    @traces(SWR.SWR_3606, SWR.SWR_3105)
    def set_sources(self, options: Iterable[SourceOption]) -> None:
        """Offer exactly *options* — which are only ever creatable sources.

        A store with no creatable source produces an empty list and a stated
        reason on the disabled control, rather than a combo box of things that
        would refuse the write (SWR-3606).
        """
        self._sources = tuple(options)
        self.source_combo.blockSignals(True)  # noqa: FBT003 - Qt's own signature
        self.source_combo.clear()
        for option in self._sources:
            self.source_combo.addItem(option.label, userData=option.source_id)
        self.source_combo.blockSignals(False)  # noqa: FBT003 - Qt's own signature
        self.source_combo.setEnabled(bool(self._sources))
        self._changed()

    @traces(SWR.SWR_3606)
    def set_target(self, target: CreationTarget) -> None:
        """State where the composed requirement will be written."""
        self._target = target
        self.target_label.setText(target.sentence)
        self.target_label.setAccessibleDescription(target.sentence)
        self._sync()

    @traces(SWR.SWR_3606)
    def report(self, outcome: CreationOutcome) -> None:
        """Render what the creation did — keeping the composition when it failed."""
        self.notice.show_notice(outcome.notice())
        if outcome.ok:
            self.title_field.clear()
            self.description_field.clear()
            self.parent_field.clear()
            self.origin_field.clear()
            self.kind_combo.setCurrentIndex(0)
            self._target = None
            self.target_label.setText(TARGET_UNSTATED)
        elif outcome.preserved is not None:
            self._restore(outcome.preserved)
        self._sync()

    def _restore(self, form: NewRequirement) -> None:
        self.title_field.setText(form.title)
        self.description_field.setPlainText(form.description)
        self.parent_field.setText(form.parent)
        self.origin_field.setText(form.origin)
        self.kind_combo.setCurrentIndex(1 if form.technical else 0)

    def _changed(self) -> None:
        self._target = None
        self.target_label.setText(TARGET_UNSTATED)
        self._sync()
        self.form_changed.emit(self.form)

    def _sync(self) -> None:
        technical = bool(self.kind_combo.currentData())
        self.origin_field.setVisible(technical)
        self.origin_label.setVisible(technical)
        self.origin_field.setFocusPolicy(
            Qt.FocusPolicy.StrongFocus if technical else Qt.FocusPolicy.NoFocus,
        )
        problems = self.problems
        set_action_availability(
            self.create_button,
            enabled=not problems,
            reason=" ".join(problems),
        )

    def _create(self) -> None:
        if self.problems:
            return
        self.creation_submitted.emit(self.form)
