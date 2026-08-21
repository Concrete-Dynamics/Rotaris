"""Reusable Rotaris feedback, empty-state, and safety components.

Everything here states something the user has to be able to read *after* the
moment it appeared: an area that is empty and why, a failure with a way out, a
destructive action with its impact named. That is the line this module holds
against :mod:`rotaris.widgets.overlays` — a toast is for an acknowledgement
nobody needs to come back to, and these are for everything else.

Presentation is read from the active theme inside the method that applies it.
The type scale is not the same in every palette (13/14/15px for the same role),
so a widget that wrote a size into a stylesheet once would keep the previous
theme's proportions after a switch — which is why the components below carry
:class:`~rotaris.theme.manager.Themed` rather than styling themselves in
`__init__` and leaving it there.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QApplication,
    QDialog,
    QDialogButtonBox,
    QFrame,
    QHBoxLayout,
    QLabel,
    QListWidget,
    QListWidgetItem,
    QPushButton,
    QVBoxLayout,
    QWidget,
)
from rotaris_core.reqtocode import SWR, traces

from rotaris.models.state import NoticeSeverity, UiNotice
from rotaris.theme import tokens
from rotaris.theme.manager import Themed
from rotaris.theme.motif import GridBackground
from rotaris.widgets.cards import make_button
from rotaris.widgets.meters import ProgressBarThin

if TYPE_CHECKING:
    from collections.abc import Iterable, Sequence

    from PySide6.QtGui import QResizeEvent

    from rotaris.theme.spec import Theme


@traces(SWR.SWR_2029, SWR.SWR_3702)
class EmptyState(Themed, QFrame):
    """Purposeful blank-slate panel with one optional recovery action.

    The design system's `.empty-state`: a dashed boundary rather than a filled
    card, so a region with nothing in it does not read as a region with
    something in it. The dash, the radius and the ground all arrive from the
    application stylesheet through the `emptyState` object name, so nothing
    below repeats them.
    """

    action_requested = Signal(str)

    def __init__(
        self,
        title: str,
        description: str,
        *,
        action_label: str = "",
        action_id: str = "",
        compact: bool = False,
        motif: bool = False,
        parent: QWidget | None = None,
    ) -> None:
        super().__init__(parent)
        self.setObjectName("emptyState")
        self.setAccessibleName(title)
        self.setAccessibleDescription(description)
        self._compact = compact
        # The dot grid is allowed behind an empty state and a hero area and
        # nowhere else. It is the 8px module made visible, and under a table or
        # a transcript it competes with the rows instead of measuring them.
        self._grid = GridBackground(self, dots=True) if motif else None
        if self._grid is not None:
            self._grid.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)
            self._grid.lower()
        self._layout = QVBoxLayout(self)
        self.title_label = QLabel(title)
        self.title_label.setObjectName("muted")
        self.title_label.setWordWrap(True)
        self.title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._layout.addWidget(self.title_label)
        self.description_label = QLabel(description)
        self.description_label.setObjectName("dim")
        self.description_label.setWordWrap(True)
        self.description_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._layout.addWidget(self.description_label)
        self.action_button: QPushButton | None = None
        if action_label:
            button = make_button(action_label, "primary")
            button.setAccessibleName(action_label)
            button.setProperty("actionId", action_id)
            button.clicked.connect(
                lambda: self.action_requested.emit(str(button.property("actionId") or ""))
            )
            self._layout.addWidget(button, 0, Qt.AlignmentFlag.AlignHCenter)
            self.action_button = button
        self.install_theme_hook()

    def apply_theme(self, theme: Theme) -> None:
        space, type_ = theme.space, theme.type
        # Generous on purpose: an empty state is mostly margin, and the air is
        # what tells a reader the area is finished rather than still loading.
        block = space.md if self._compact else space.x2l
        side = space.md if self._compact else space.xl
        self._layout.setContentsMargins(side, block, side, block)
        self._layout.setSpacing(space.sm)
        self.title_label.setStyleSheet(
            f"font-size:{type_.scale.base}px;font-weight:{type_.weight_display};"
        )
        self.description_label.setStyleSheet(f"font-size:{type_.scale.xs}px;")

    def resizeEvent(self, event: QResizeEvent) -> None:  # noqa: N802 — Qt's spelling
        super().resizeEvent(event)
        if self._grid is not None:
            # Inside the content box, so the motif never paints over the dashed
            # boundary that is the component's whole silhouette.
            self._grid.setGeometry(self.contentsRect())

    def configure(
        self,
        title: str,
        description: str,
        *,
        action_label: str = "",
        action_id: str = "",
    ) -> None:
        self.title_label.setText(title)
        self.description_label.setText(description)
        self.setAccessibleName(title)
        self.setAccessibleDescription(description)
        if self.action_button is not None:
            self.action_button.setText(action_label)
            self.action_button.setAccessibleName(action_label)
            self.action_button.setProperty("actionId", action_id)
            self.action_button.setVisible(bool(action_label))


class InlineBanner(Themed, QFrame):
    """Persistent, screen-reader-visible status with optional recovery action."""

    action_requested = Signal(str)
    dismissed = Signal(str)

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setObjectName("inlineBanner")
        self._notice_id = ""
        self._severity: NoticeSeverity | None = None
        root = QHBoxLayout(self)
        self._root = root
        self.icon = QLabel("i")
        self.icon.setAlignment(Qt.AlignmentFlag.AlignCenter)
        root.addWidget(self.icon)
        copy = QVBoxLayout()
        self.title = QLabel()
        copy.addWidget(self.title)
        self.message = QLabel()
        self.message.setObjectName("muted")
        self.message.setWordWrap(True)
        copy.addWidget(self.message)
        self.details = QLabel()
        self.details.setObjectName("dim")
        self.details.setWordWrap(True)
        self.details.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        copy.addWidget(self.details)
        # Kept so a progress meter can be added later, on the one banner that
        # narrates a run rather than stating a finding (SWR-3320).
        self._copy = copy
        self._progress: ProgressBarThin | None = None
        self._percent: int | None = None
        root.addLayout(copy, 1)
        self.action_button = make_button("", "secondary")
        # A button with no label yet still has to announce something: it is a
        # real control in the widget tree even while the banner is hidden.
        self.action_button.setAccessibleName("Notice action")
        self.action_button.clicked.connect(self._emit_action)
        root.addWidget(self.action_button)
        self.copy_button = make_button("Copy details", "ghost")
        self.copy_button.setAccessibleName("Copy technical details")
        self.copy_button.clicked.connect(self._copy_details)
        root.addWidget(self.copy_button)
        self.dismiss_button = make_button("Dismiss", "ghost")
        self.dismiss_button.clicked.connect(self._dismiss)
        root.addWidget(self.dismiss_button)
        self.hide()
        self.install_theme_hook()

    def apply_theme(self, theme: Theme) -> None:
        space, type_ = theme.space, theme.type
        self._root.setContentsMargins(space.md, space.sm, space.md, space.sm)
        self._root.setSpacing(space.sm)
        self._copy.setSpacing(space[0.25])
        self.icon.setFixedWidth(space.lg)
        self.title.setStyleSheet(f"font-weight:{type_.weight_display};")
        self._restyle(theme)
        if self._progress is not None and self._percent is not None:
            self._progress.set_fill(self._percent, color=theme.color.accent.base)

    def _restyle(self, theme: Theme) -> None:
        """Repaint the severity, which is a border and a glyph, not a fill."""
        if self._severity is None:
            return
        color = theme.color
        # The rule and the glyph are the same state in two roles, and the roles
        # owe different contrast: a border is a boundary at 3:1, a glyph is a
        # word at 4.5:1. Reading both from one token is how the glyph ends up
        # legible only to whoever picked the colour.
        rules = {
            NoticeSeverity.INFO: color.info_state,
            NoticeSeverity.SUCCESS: color.run,
            NoticeSeverity.WARNING: color.wait,
            NoticeSeverity.ERROR: color.fail,
        }
        glyph_colors = {
            NoticeSeverity.INFO: color.info_text,
            NoticeSeverity.SUCCESS: color.run_text,
            NoticeSeverity.WARNING: color.wait_text,
            NoticeSeverity.ERROR: color.fail_text,
        }
        rule = rules[self._severity]
        # Three hairlines: thick enough to register before the title is read,
        # and it thickens with a theme that thickens its hairline.
        self.setStyleSheet(
            f"QFrame#inlineBanner{{background:{color.surface};"
            f"border:{theme.size.hairline}px solid {rule};"
            f"border-left:{theme.size.hairline * 3}px solid {rule};"
            f"border-radius:{theme.radius.md}px;}}"
        )
        self.icon.setStyleSheet(f"color:{glyph_colors[self._severity]};")

    def show_notice(self, notice: UiNotice | None) -> None:
        # A meter belongs to the notice it was set for, and nothing else: a bar
        # that survived a change of notice would be measuring the wrong thing.
        self.set_progress(None)
        if notice is None:
            self._notice_id = ""
            self.hide()
            return
        self._notice_id = notice.id
        glyphs = {
            NoticeSeverity.INFO: "i",
            NoticeSeverity.SUCCESS: "✓",
            NoticeSeverity.WARNING: "!",
            NoticeSeverity.ERROR: "×",
        }
        self._severity = notice.severity
        self.icon.setText(glyphs[notice.severity])
        self.title.setText(notice.title)
        self.message.setText(notice.message)
        self.message.setVisible(bool(notice.message))
        self.details.setText(notice.details)
        self.details.setVisible(bool(notice.details))
        self.copy_button.setVisible(bool(notice.details))
        self.action_button.setText(notice.action_label)
        self.action_button.setAccessibleName(notice.action_label or "Notice action")
        self.action_button.setProperty("actionId", notice.action_id)
        self.action_button.setVisible(bool(notice.action_label and notice.action_id))
        self.dismiss_button.setVisible(notice.persistent)
        self._restyle(tokens())
        self.setAccessibleName(f"{notice.severity.value}: {notice.title}")
        self.setAccessibleDescription(" ".join(filter(None, (notice.message, notice.details))))
        self.show()

    def _emit_action(self) -> None:
        self.action_requested.emit(str(self.action_button.property("actionId") or ""))

    def _dismiss(self) -> None:
        self.dismissed.emit(self._notice_id)

    def _copy_details(self) -> None:
        QApplication.clipboard().setText(self.details.text())

    @traces(SWR.SWR_3320)
    def set_progress(self, percent: int | None, *, label: str = "") -> None:
        """Show how far the work this banner narrates has got, or show no meter.

        Opt-in, hidden by default and cleared by :meth:`show_notice`: every other
        banner in the app states a finding rather than a run, and a meter on one
        of those would be measuring nothing.

        ``None`` means the phase has no denominator, and then there is no bar —
        an invented one is worse than none. *label* is what the meter says out
        loud; the sentence above it carries the same count in words, so the fill
        is never the only channel (`apps/rotaris/AGENTS.md`).
        """
        if percent is None:
            self._percent = None
            if self._progress is not None:
                self._progress.setVisible(False)
            return
        if self._progress is None:
            self._progress = ProgressBarThin()
            self._progress.setVisible(False)
            self._copy.addWidget(self._progress)
        self._percent = max(0, min(100, percent))
        # Never the amber a high fill would otherwise pick: this meter measures
        # progress, and amber in this app means something is wrong.
        self._progress.set_fill(self._percent, color=tokens().color.accent.base)
        self._progress.setAccessibleName(label or f"Progress {percent}%")
        self._progress.setAccessibleDescription(label)
        self._progress.setVisible(True)

    @property
    def progress_bar(self) -> ProgressBarThin | None:
        """The meter, once one has been shown. ``None`` until then."""
        return self._progress


class ConfirmImpactDialog(QDialog):
    """Confirmation dialog that names the irreversible impact before proceeding.

    Tokens are read once, here, rather than through a theme hook. The dialog is
    modal, so Settings — the only place a theme is chosen — cannot be reached
    while one is open, and a dialog that outlives a switch does not exist.
    """

    def __init__(
        self,
        title: str,
        message: str,
        impacts: Iterable[str],
        *,
        confirm_label: str,
        parent: QWidget | None = None,
    ) -> None:
        super().__init__(parent)
        theme = tokens()
        self.setWindowTitle(title)
        self.setModal(True)
        self.setMinimumWidth(460)
        self.setAccessibleName(title)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(theme.space.lg, theme.space.lg, theme.space.lg, theme.space.lg)
        layout.setSpacing(theme.space.md)
        heading = QLabel(title)
        heading.setObjectName("heading")
        layout.addWidget(heading)
        description = QLabel(message)
        description.setWordWrap(True)
        layout.addWidget(description)
        impact_list = [item for item in impacts if item]
        if impact_list:
            impact = QLabel("\n".join(f"• {item}" for item in impact_list))
            impact.setObjectName("muted")
            impact.setWordWrap(True)
            impact.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
            layout.addWidget(impact)
        buttons = QDialogButtonBox(QDialogButtonBox.StandardButton.Cancel)
        confirm = QPushButton(confirm_label)
        confirm.setProperty("variant", "danger")
        confirm.setAccessibleDescription("Confirms this irreversible action")
        buttons.addButton(confirm, QDialogButtonBox.ButtonRole.DestructiveRole)
        confirm.clicked.connect(self.accept)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)
        buttons.button(QDialogButtonBox.StandardButton.Cancel).setFocus()


@traces(SWR.SWR_2413)
class MergeOrderDialog(QDialog):
    """Confirmation dialog that lets the user order worktrees before integration."""

    def __init__(
        self,
        entries: Sequence[tuple[str, str]],
        *,
        parent: QWidget | None = None,
    ) -> None:
        super().__init__(parent)
        theme = tokens()
        title = "Merge selected worktrees?"
        self.setWindowTitle(title)
        self.setModal(True)
        self.setMinimumWidth(460)
        self.setAccessibleName(title)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(theme.space.lg, theme.space.lg, theme.space.lg, theme.space.lg)
        layout.setSpacing(theme.space.md)
        heading = QLabel(title)
        heading.setObjectName("heading")
        layout.addWidget(heading)
        description = QLabel(
            "Selected worktree files may be staged and committed. A hidden integration agent "
            "merges them in the order below and resolves conflicts. The base branch changes only "
            "after all selected branches integrate cleanly."
        )
        description.setWordWrap(True)
        layout.addWidget(description)

        self.order_list = QListWidget()
        self.order_list.setAccessibleName("Merge order")
        self.order_list.setAccessibleDescription("Branches are merged from top to bottom")
        for session_id, branch in entries:
            item = QListWidgetItem(f"{branch} — {session_id}" if branch else session_id)
            item.setData(Qt.ItemDataRole.UserRole, session_id)
            self.order_list.addItem(item)
        self.order_list.setCurrentRow(0 if self.order_list.count() else -1)
        self.order_list.currentRowChanged.connect(self._sync_move_buttons)
        layout.addWidget(self.order_list)

        moves = QHBoxLayout()
        moves.setSpacing(theme.space.sm)
        self.move_up_button = make_button("Move up", "secondary")
        self.move_up_button.setAccessibleName("Move selected branch earlier")
        self.move_up_button.clicked.connect(lambda: self._move(-1))
        moves.addWidget(self.move_up_button)
        self.move_down_button = make_button("Move down", "secondary")
        self.move_down_button.setAccessibleName("Move selected branch later")
        self.move_down_button.clicked.connect(lambda: self._move(1))
        moves.addWidget(self.move_down_button)
        moves.addStretch(1)
        layout.addLayout(moves)

        buttons = QDialogButtonBox(QDialogButtonBox.StandardButton.Cancel)
        confirm = QPushButton("Start integration")
        confirm.setProperty("variant", "danger")
        confirm.setAccessibleDescription("Merges the listed branches into the base branch")
        buttons.addButton(confirm, QDialogButtonBox.ButtonRole.DestructiveRole)
        confirm.clicked.connect(self.accept)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)
        buttons.button(QDialogButtonBox.StandardButton.Cancel).setFocus()
        self._sync_move_buttons()

    @property
    def ordered_session_ids(self) -> list[str]:
        return [
            str(self.order_list.item(row).data(Qt.ItemDataRole.UserRole))
            for row in range(self.order_list.count())
        ]

    def _move(self, offset: int) -> None:
        row = self.order_list.currentRow()
        target = row + offset
        if row < 0 or not 0 <= target < self.order_list.count():
            return
        self.order_list.insertItem(target, self.order_list.takeItem(row))
        self.order_list.setCurrentRow(target)

    def _sync_move_buttons(self) -> None:
        row = self.order_list.currentRow()
        last = self.order_list.count() - 1
        self.move_up_button.setEnabled(row > 0)
        self.move_down_button.setEnabled(0 <= row < last)
        self.move_up_button.setToolTip("" if row > 0 else "This branch is already merged first.")
        self.move_down_button.setToolTip(
            "" if 0 <= row < last else "This branch is already merged last."
        )
