"""Question stepper modal — renders ask_questions tool payload as interactive dialog."""

from __future__ import annotations

from typing import TYPE_CHECKING, override

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QDialog,
    QFrame,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)
from rotaris_core.reqtocode import SWR, traces

from rotaris.theme import tokens
from rotaris.theme.manager import Themed

if TYPE_CHECKING:
    from rotaris.models.state import QuestionStep
    from rotaris.theme.spec import Theme

#: The step pill is a circle, so its radius follows its own fixed size rather
#: than a radius token — ``radius.pill`` is a CSS-side "as round as it gets"
#: value that QSS would have to clamp against the box anyway.
_PILL_SIZE = 28


@traces(SWR.SWR_2422)
class QuestionStepper(Themed, QDialog):
    """Modal dialog that renders a stepped question flow from the ask_questions tool.

    The widget is opened from a transcript-row click.  The user navigates
    between steps, selecting options or typing freeform answers, and submits
    all answers at once.
    """

    answers_submitted = Signal(object)  # QuestionAnswers
    cancelled = Signal()

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setWindowTitle("Agent Questions")
        self.setMinimumSize(520, 420)
        self.setModal(True)

        self._steps: tuple[QuestionStep, ...] = ()
        self._step_index: int = 0
        # step_id → {selected_option, freeform_text}
        self._answers: dict[str, dict[str, str | None]] = {}
        self._submitted: bool = False
        self._cancel_emitted = False

        # ── Build layout ────────────────────────────────────────────────
        space = tokens().space
        self._layout = QVBoxLayout(self)
        self._layout.setContentsMargins(space.xl, space[2.5], space.xl, space[2.5])
        self._layout.setSpacing(space[1.75])

        # Step indicator
        self._step_indicator = QHBoxLayout()
        self._step_indicator.setSpacing(space[0.75])
        self._layout.addLayout(self._step_indicator)

        # Divider
        self._divider = QFrame()
        self._divider.setFrameShape(QFrame.Shape.HLine)
        self._divider.setObjectName("stepperDivider")
        self._divider.setProperty("role", "divider")
        self._layout.addWidget(self._divider)

        # Step title
        self._step_title = QLabel()
        self._step_title.setObjectName("heading")
        self._step_title.setWordWrap(True)
        self._layout.addWidget(self._step_title)

        # Step description
        self._step_description = QLabel()
        self._step_description.setObjectName("dim")
        self._step_description.setWordWrap(True)
        self._step_description.setVisible(False)
        self._layout.addWidget(self._step_description)

        # Option list area (scrollable if many options)
        self._options_container = QVBoxLayout()
        self._options_container.setSpacing(space[0.75])
        self._layout.addLayout(self._options_container)

        # Freeform input
        self._freeform_input = QTextEdit()
        self._freeform_input.setObjectName("stepperFreeform")
        self._freeform_input.setPlaceholderText("Or type your own answer…")
        self._freeform_input.setMaximumHeight(100)
        self._freeform_input.setVisible(False)
        self._freeform_input.textChanged.connect(self._on_freeform_changed)
        self._layout.addWidget(self._freeform_input)

        self._layout.addStretch()

        # Navigation bar
        self._nav_layout = QHBoxLayout()
        self._nav_layout.setSpacing(space[1.25])

        self._back_button = QPushButton("← Back")
        self._back_button.setObjectName("stepperBack")
        # A borderless text action: "link" is the one variant that also drops
        # its frame when disabled, which Back is on the first step.
        self._back_button.setProperty("variant", "link")
        self._back_button.clicked.connect(self._go_back)
        self._nav_layout.addWidget(self._back_button)

        self._nav_layout.addStretch()

        self._next_button = QPushButton("Next →")
        self._next_button.setObjectName("stepperNext")
        self._next_button.setProperty("variant", "primary")
        self._next_button.clicked.connect(self._go_next)
        self._next_button.setDefault(True)
        self._nav_layout.addWidget(self._next_button)

        self._submit_button = QPushButton("Submit")
        self._submit_button.setObjectName("stepperSubmit")
        self._submit_button.setProperty("variant", "primary")
        self._submit_button.clicked.connect(self._submit)
        self._submit_button.setVisible(False)
        self._nav_layout.addWidget(self._submit_button)

        self._layout.addLayout(self._nav_layout)

        # Status label (timeout / cancelled messages)
        self._status_label = QLabel()
        self._status_label.setObjectName("stepperStatus")
        self._status_label.setWordWrap(True)
        self._status_label.setVisible(False)
        self._layout.addWidget(self._status_label)

        self.install_theme_hook()

    # ── Public API ──────────────────────────────────────────────────────

    def set_questions(self, steps: list[QuestionStep]) -> None:
        """Load question steps and reset to the first step."""
        if not steps:
            self.close()
            return
        self._steps = tuple(steps)
        self._step_index = 0
        self._answers = {}
        self._submitted = False
        self._cancel_emitted = False
        self._render_current_step()

    def show_error(self, message: str) -> None:
        """Keep answers available and show a recoverable delivery error."""
        self._submitted = False
        self._status_label.setText(message)
        self._status_label.setVisible(True)

    def complete_submission(self) -> None:
        """Close after host confirms exact prompt resolution."""
        self._submitted = True
        self.accept()

    # ── Internal helpers ────────────────────────────────────────────────

    def _rebuild_step_indicator(self) -> None:
        """Rebuild the horizontal pill row."""
        while self._step_indicator.count():
            item = self._step_indicator.takeAt(0)
            if item.widget():
                item.widget().deleteLater()

        theme = tokens()
        color, type_ = theme.color, theme.type
        for i, _step in enumerate(self._steps):
            pill = QLabel(str(i + 1))
            pill.setAlignment(Qt.AlignmentFlag.AlignCenter)
            pill.setFixedSize(_PILL_SIZE, _PILL_SIZE)
            # A pill is a filled shape with a numeral on it, and the numeral is
            # text: it owes 4.5:1 against its own fill, not the 3:1 the fill
            # owes the page. That is why neither of these is the ramp's 500 —
            # the step a status *dot* would use is too close to the digit on it.
            if i == self._step_index:
                background, foreground = color.accent[600], color.accent[100]
            elif i < self._step_index:
                background, foreground = color.axis_y[300], color.bg
            else:
                background, foreground = color.chrome, color.text_tertiary
            pill.setStyleSheet(
                f"QLabel{{background:{background};color:{foreground};"
                f"border-radius:{_PILL_SIZE // 2}px;"
                f"font-weight:{type_.weight_display};font-size:{type_.scale.sm}px;}}"
            )
            self._step_indicator.addWidget(pill)

    def _render_current_step(self) -> None:
        """Render the current step's title, description, options, and freeform."""
        step = self._steps[self._step_index]
        self._step_title.setText(step.title)
        self._step_description.setText(step.description)
        self._step_description.setVisible(bool(step.description))

        # Clear previous options
        while self._options_container.count():
            item = self._options_container.takeAt(0)
            if item.widget():
                item.widget().deleteLater()

        # Rebuild option cards
        current_answer = self._answers.get(step.id, {})
        selected_label = current_answer.get("selected_option")

        for opt in step.options:
            card = _OptionCard(opt.label, opt.description, selected=opt.label == selected_label)
            card.clicked.connect(self._on_option_clicked)
            self._options_container.addWidget(card)

        # Freeform input
        freeform_text = current_answer.get("freeform_text") or ""
        self._freeform_input.blockSignals(True)
        self._freeform_input.setPlainText(freeform_text)
        self._freeform_input.blockSignals(False)
        if step.allow_freeform and not selected_label:
            self._freeform_input.setVisible(True)
            self._freeform_input.setEnabled(True)
        elif step.allow_freeform and selected_label:
            self._freeform_input.setVisible(False)
        else:
            self._freeform_input.setVisible(False)

        self._rebuild_step_indicator()
        self._update_navigation()

    def _update_navigation(self) -> None:
        """Enable/disable nav buttons based on current state."""
        is_first = self._step_index == 0
        is_last = self._step_index == len(self._steps) - 1
        has_answer = self._current_step_has_answer()

        self._back_button.setEnabled(not is_first)
        self._next_button.setVisible(not is_last)
        self._next_button.setEnabled(has_answer)
        self._submit_button.setVisible(is_last)
        self._submit_button.setEnabled(has_answer)

    def _current_step_has_answer(self) -> bool:
        """Check whether the current step has a valid answer."""
        step_id = self._steps[self._step_index].id
        answer = self._answers.get(step_id, {})
        selected = answer.get("selected_option")
        freeform = answer.get("freeform_text", "")
        return bool(selected or (freeform or "").strip())

    def _on_option_clicked(self, label: str) -> None:
        """User clicked an option card."""
        step_id = self._steps[self._step_index].id
        current = self._answers.get(step_id, {})
        # Toggle: clicking the same option deselects it
        if current.get("selected_option") == label:
            self._answers[step_id] = {
                "selected_option": None,
                "freeform_text": current.get("freeform_text"),
            }
        else:
            self._answers[step_id] = {
                "selected_option": label,
                "freeform_text": None,
            }
        self._render_current_step()

    def _on_freeform_changed(self) -> None:
        self._save_freeform()
        self._update_navigation()

    def _go_back(self) -> None:
        """Navigate to the previous step, saving current answer if changed."""
        self._save_freeform()
        if self._step_index > 0:
            self._step_index -= 1
            self._render_current_step()

    def _go_next(self) -> None:
        """Navigate to the next step."""
        self._save_freeform()
        if self._step_index < len(self._steps) - 1:
            self._step_index += 1
            self._render_current_step()

    def _save_freeform(self) -> None:
        """Persist the freeform text for the current step."""
        step = self._steps[self._step_index]
        if step.allow_freeform and self._freeform_input.isVisible():
            current = dict(self._answers.get(step.id, {}))
            text = self._freeform_input.toPlainText().strip()
            current["freeform_text"] = text or None
            self._answers[step.id] = current

    def _submit(self) -> None:
        """Collect all answers and emit."""
        self._save_freeform()
        self._submitted = True
        from rotaris.models.state import QuestionAnswers

        self.answers_submitted.emit(QuestionAnswers(answers=dict(self._answers)))

    def _set_controls_enabled(self, enabled: bool) -> None:
        self._back_button.setEnabled(enabled)
        self._next_button.setEnabled(enabled)
        self._submit_button.setEnabled(enabled)
        self._freeform_input.setEnabled(enabled)
        for i in range(self._options_container.count()):
            w = self._options_container.itemAt(i).widget()
            if w:
                w.setEnabled(enabled)

    @override
    def closeEvent(self, event) -> None:  # type: ignore[no-untyped-def]
        if not self._submitted:
            self._emit_cancelled_once()
        super().closeEvent(event)

    def _emit_cancelled_once(self) -> None:
        if self._cancel_emitted:
            return
        self._cancel_emitted = True
        self.cancelled.emit()

    @override
    def keyPressEvent(self, event) -> None:  # type: ignore[no-untyped-def]
        if event.key() == Qt.Key.Key_Escape:
            if self._step_index > 0:
                self._go_back()
            else:
                self._emit_cancelled_once()
                self.reject()
            return
        super().keyPressEvent(event)

    @override
    def apply_theme(self, theme: Theme) -> None:
        self._status_label.setStyleSheet(
            f"font-size:{theme.type.scale.sm}px;color:{theme.color.wait_text};"
        )
        # The pills carry their palette in their own stylesheets, and a
        # repolish will not recompute those — they have to be built again.
        if self._steps:
            self._rebuild_step_indicator()


class _OptionCard(Themed, QFrame):
    """A clickable single-select option card within the stepper."""

    clicked = Signal(str)  # emits the option label

    def __init__(self, label: str, description: str = "", selected: bool = False) -> None:
        super().__init__()
        self._label = label
        self._selected = selected
        self.setObjectName("stepperOptionCard")
        self.setCursor(Qt.CursorShape.PointingHandCursor)

        space = tokens().space
        layout = QVBoxLayout(self)
        layout.setContentsMargins(space.md, space[1.25], space.md, space[1.25])
        layout.setSpacing(space.xs)

        self._title_label = QLabel(label)
        layout.addWidget(self._title_label)

        self._description_label = QLabel(description) if description else None
        if self._description_label is not None:
            self._description_label.setWordWrap(True)
            layout.addWidget(self._description_label)

        self.install_theme_hook()

    @override
    def mousePressEvent(self, event) -> None:  # type: ignore[no-untyped-def]
        self.clicked.emit(self._label)
        super().mousePressEvent(event)

    @override
    def apply_theme(self, theme: Theme) -> None:
        color, type_ = theme.color, theme.type
        self._title_label.setStyleSheet(
            f"font-weight:{type_.weight_display};font-size:{type_.scale.sm}px;"
            f"color:{color.text};background:transparent;"
        )
        if self._description_label is not None:
            self._description_label.setStyleSheet(
                f"font-size:{type_.scale.xs}px;color:{color.text_tertiary};background:transparent;"
            )
        # Unselected the card stays transparent on purpose: a list of filled
        # cards reads as a list of chosen things. Its boundary is the strong
        # border rather than the card hairline because this card is a control,
        # and an interactive boundary owes 3:1 where a decorative one does not.
        border = color.accent.base if self._selected else color.border_strong
        background = color.surface if self._selected else "transparent"
        self.setStyleSheet(
            f"QFrame#stepperOptionCard{{background:{background};"
            f"border:{theme.size.hairline}px solid {border};"
            f"border-radius:{theme.radius.md}px;}}"
        )
