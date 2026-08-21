"""Slash command suggestion popup and composer match highlighting."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, cast, override

from PySide6.QtCore import QPoint, QSize, Qt, Signal
from PySide6.QtGui import QColor, QFont, QSyntaxHighlighter, QTextCharFormat
from PySide6.QtWidgets import (
    QFrame,
    QListWidget,
    QListWidgetItem,
    QStyle,
    QStyledItemDelegate,
    QVBoxLayout,
    QWidget,
)
from rotaris_core.reqtocode import SWR, traces

from rotaris.models.slash_commands import (
    PARTIAL,
    RESOLVED,
    UNKNOWN,
    classify_slash_token,
)
from rotaris.theme import raise_to_readable, tokens
from rotaris.theme.a11y import raise_on
from rotaris.theme.manager import Themed

if TYPE_CHECKING:
    from collections.abc import Sequence

    from PySide6.QtCore import QModelIndex, QPersistentModelIndex
    from PySide6.QtGui import QPainter, QTextDocument
    from PySide6.QtWidgets import QStyleOptionViewItem

    from rotaris.models.slash_commands import SlashCommand, SlashCommandRegistry
    from rotaris.theme.color import Color
    from rotaris.theme.spec import Theme

#: Structured row data, so tests read semantics rather than rendered pixels.
NAME_ROLE = Qt.ItemDataRole.UserRole + 1
DESCRIPTION_ROLE = Qt.ItemDataRole.UserRole + 2
KIND_ROLE = Qt.ItemDataRole.UserRole + 3
AVAILABLE_ROLE = Qt.ItemDataRole.UserRole + 4

MAX_VISIBLE_ROWS = 8


def row_height() -> int:
    """One suggestion row's height, for the theme in force.

    The compact control height rather than a number of its own. A theme that
    raises the type scale raises this with it, which is what keeps a row from
    clipping the text it was sized around under High Contrast.
    """
    return tokens().size.control_height_compact


def _char_format(color: str, *, bold: bool = False) -> QTextCharFormat:
    fmt = QTextCharFormat()
    fmt.setForeground(QColor(color))
    if bold:
        fmt.setFontWeight(QFont.Weight.Bold)
    return fmt


@traces(SWR.SWR_2440)
class SlashHighlighter(Themed, QSyntaxHighlighter):
    """Colour the leading `/name` token by whether it resolves to a command.

    Resolved, partial, and unknown are three distinct colours, so a typo is
    visible while it is typed instead of after it has been sent to an agent.
    """

    #: Which states are painted bold. Weight is the second channel over hue, so
    #: the three states stay distinguishable to a reader who cannot separate
    #: them by colour (apps/rotaris/AGENTS.md).
    BOLD = {RESOLVED: True, PARTIAL: False, UNKNOWN: True}

    def __init__(self, document: QTextDocument, registry: SlashCommandRegistry) -> None:
        super().__init__(document)
        self._registry = registry
        self._formats: dict[str, QTextCharFormat] = {}
        self._argument_format = QTextCharFormat()
        self.install_theme_hook()

    @classmethod
    def state_colors(cls, theme: Theme) -> dict[str, Color]:
        """The colour each classification is typed in, under *theme*.

        Every one of them is a *text* colour: this paints the characters the
        user is typing, so an unknown command takes the failure token's text
        form and not the saturated one a status dot would take. The partial
        state has no text form of its own — it is a ramp step, and the ramp's
        saturated middle is a shade under the floor on a light-grounded theme —
        so it is lifted the same way, which is a no-op wherever it already
        clears.
        """
        return {
            RESOLVED: theme.color.accent[300],
            PARTIAL: raise_to_readable(theme.color.accent[500], theme),
            UNKNOWN: theme.color.fail_text,
        }

    @classmethod
    def argument_color(cls, theme: Theme) -> Color:
        """What follows the command name — an argument, not part of the token."""
        return theme.color.text_secondary

    def apply_theme(self, theme: Theme) -> None:
        colors = self.state_colors(theme)
        self._formats = {
            state: _char_format(colors[state], bold=bold) for state, bold in self.BOLD.items()
        }
        self._argument_format = _char_format(self.argument_color(theme))
        # The formats are already on the document's blocks; only re-running the
        # highlighter replaces them with the new theme's.
        self.rehighlight()

    @override
    def highlightBlock(self, text: str) -> None:
        document = self.document()
        if document is None or document.blockCount() > 1:
            # Multi-line text is always a prompt, never a command.
            return
        classified = classify_slash_token(text, self._registry)
        if classified is None:
            return
        state, name_end = classified
        self.setFormat(0, name_end, self._formats[state])
        if len(text) > name_end:
            self.setFormat(name_end, len(text) - name_end, self._argument_format)


class _SlashRowDelegate(QStyledItemDelegate):
    """Paint one suggestion as name · description · kind badge."""

    @override
    def sizeHint(
        self, option: QStyleOptionViewItem, index: QModelIndex | QPersistentModelIndex
    ) -> QSize:
        del option, index
        return QSize(0, row_height())

    @override
    def paint(
        self,
        painter: QPainter,
        option: QStyleOptionViewItem,
        index: QModelIndex | QPersistentModelIndex,
    ) -> None:
        painter.save()
        t = tokens()
        # The PySide6 stubs omit the geometry/state fields (as in TranscriptDelegate).
        view_option = cast("Any", option)
        rect = view_option.rect
        selected = bool(view_option.state & QStyle.StateFlag.State_Selected)
        if selected:
            painter.fillRect(rect, t.color.hover.qcolor)
        available = bool(index.data(AVAILABLE_ROLE))
        name = f"/{index.data(NAME_ROLE)}"
        description = str(index.data(DESCRIPTION_ROLE) or "")
        kind = str(index.data(KIND_ROLE) or "")
        padding = t.space[1.25]

        # The highlighted row is painted on the hover fill, which is lighter
        # than the popup's own surface. Resolving each pen against the ground it
        # actually lands on is what stops the dimmest of the three — the kind —
        # dropping under the floor on exactly the row the user is looking at.
        ground = t.color.hover.over(t.color.surface) if selected else t.color.surface

        def readable(color: Color) -> QColor:
            return raise_on(color, ground, t.min_text_contrast).qcolor

        # Disabled text is deliberately not lifted: WCAG exempts it, and a
        # greyed row that met the floor would read as available.
        disabled = t.color.text_disabled.qcolor

        font = painter.font()
        font.setBold(True)
        painter.setFont(font)
        painter.setPen(readable(t.color.accent[300]) if available else disabled)
        metrics = painter.fontMetrics()
        name_width = metrics.horizontalAdvance(name)
        painter.drawText(
            rect.adjusted(padding, 0, 0, 0),
            Qt.AlignmentFlag.AlignVCenter | Qt.AlignmentFlag.AlignLeft,
            name,
        )

        font.setBold(False)
        painter.setFont(font)
        # The kind sits against the right padding, and the description stops one
        # more padding short of it so the two never touch on a narrow composer.
        kind_width = painter.fontMetrics().horizontalAdvance(kind) + 2 * padding
        painter.setPen(readable(t.color.text_secondary) if available else disabled)
        description_rect = rect.adjusted(padding + t.space.sm + name_width, 0, -kind_width, 0)
        painter.drawText(
            description_rect,
            Qt.AlignmentFlag.AlignVCenter | Qt.AlignmentFlag.AlignLeft,
            painter.fontMetrics().elidedText(
                description, Qt.TextElideMode.ElideRight, description_rect.width()
            ),
        )

        painter.setPen(readable(t.color.text_tertiary))
        painter.drawText(
            rect.adjusted(0, 0, -padding, 0),
            Qt.AlignmentFlag.AlignVCenter | Qt.AlignmentFlag.AlignRight,
            kind,
        )
        painter.restore()


@traces(SWR.SWR_2439, SWR.SWR_2441)
class SlashCommandPopup(Themed, QFrame):
    """Focus-free suggestion list anchored above the composer.

    It is a plain child widget rather than a `Qt.Popup`, so the composer keeps
    keyboard focus and typing is never interrupted.
    """

    command_activated = Signal(str)

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setObjectName("slashPopup")
        self.setFocusPolicy(Qt.FocusPolicy.NoFocus)
        self.setAccessibleName("Slash command suggestions")
        layout = QVBoxLayout(self)
        # The frame's own hairline is what these margins hold clear of.
        hairline = tokens().size.hairline
        layout.setContentsMargins(hairline, hairline, hairline, hairline)
        layout.setSpacing(0)
        self.list = QListWidget(self)
        self.list.setObjectName("slashPopupList")
        self.list.setFocusPolicy(Qt.FocusPolicy.NoFocus)
        self.list.setAccessibleName("Slash command suggestions")
        self.list.setUniformItemSizes(True)
        self.list.setItemDelegate(_SlashRowDelegate(self.list))
        self.list.itemClicked.connect(self._activate_item)
        layout.addWidget(self.list)
        self._commands: list[SlashCommand] = []
        self._open = False
        self.hide()
        self.install_theme_hook()

    def apply_theme(self, theme: Theme) -> None:
        color, size = theme.color, theme.size
        # The popup sits over the composer and has to read as a raised surface
        # against it, which is the one thing the global stylesheet's transparent
        # QFrame ground cannot give it.
        self.setStyleSheet(
            f"QFrame#slashPopup{{background:{color.surface};"
            f"border:{size.hairline}px solid {color.border_panel};"
            f"border-radius:{theme.radius.md}px;}}"
        )
        self.list.setStyleSheet(
            f"QListWidget{{background:{color.surface};border:none;"
            f"color:{color.text};font-size:{theme.type.scale.sm}px;}}"
        )

    # ── content ───────────────────────────────────────────────────────────

    def is_open(self) -> bool:
        """Whether suggestions are being offered.

        Distinct from `isVisible()`, which is also False whenever the window
        itself is hidden — the composer's key routing must not depend on that.
        """
        return self._open

    @override
    def hide(self) -> None:
        self._open = False
        super().hide()

    def show_for(self, commands: Sequence[SlashCommand]) -> None:
        """Display `commands`, or hide when there is nothing to suggest."""
        self._commands = list(commands)
        self.list.clear()
        if not self._commands:
            self.hide()
            return
        for command in self._commands:
            available = command.is_available()
            hint = f" {command.argument_hint}" if command.argument_hint else ""
            item = QListWidgetItem()
            item.setData(NAME_ROLE, command.name)
            item.setData(DESCRIPTION_ROLE, f"{command.description}{hint}")
            item.setData(KIND_ROLE, command.kind)
            item.setData(AVAILABLE_ROLE, available)
            item.setText(f"/{command.name} — {command.description}{hint}")
            if not available:
                reason = command.unavailable_reason or "Unavailable right now."
                item.setToolTip(reason)
                item.setData(Qt.ItemDataRole.AccessibleDescriptionRole, reason)
            self.list.addItem(item)
        self.list.setCurrentRow(0)
        self._open = True
        self.show()
        self.raise_()

    def commands(self) -> list[SlashCommand]:
        """The currently suggested commands, in display order."""
        return list(self._commands)

    def current(self) -> SlashCommand | None:
        """The highlighted command, or None when the popup is empty."""
        row = self.list.currentRow()
        if 0 <= row < len(self._commands):
            return self._commands[row]
        return None

    # ── keyboard ──────────────────────────────────────────────────────────

    def move_selection(self, delta: int) -> None:
        """Move the highlight by `delta`, clamped at both ends."""
        if not self._commands:
            return
        row = min(max(self.list.currentRow() + delta, 0), len(self._commands) - 1)
        self.list.setCurrentRow(row)

    # ── geometry ──────────────────────────────────────────────────────────

    def reposition(self, anchor: QWidget) -> None:
        """Place the popup directly above `anchor`, matching its width."""
        parent = self.parentWidget()
        if parent is None:
            return
        t = tokens()
        rows = min(len(self._commands), MAX_VISIBLE_ROWS)
        height = row_height() * rows + 2 * t.size.hairline
        top_left = anchor.mapTo(parent, QPoint(0, 0))
        self.setGeometry(
            top_left.x(),
            max(0, top_left.y() - height - t.space[0.75]),
            anchor.width(),
            height,
        )

    def _activate_item(self, item: QListWidgetItem) -> None:
        self.command_activated.emit(str(item.data(NAME_ROLE)))
