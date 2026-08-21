"""The design system's patterns: compositions, not new inventory.

Everything here is assembled from primitives that already exist — a `Card`, a
`Table`, `make_button` — because that is what the design system means by a
pattern. A pattern that reimplemented the card it draws would be a second card,
and the second card is the one that stops matching the first.

Each earns its place by being the thing views were otherwise rebuilding by
hand:

* :class:`PageHeader` — the title row every view opens with.
* :class:`DetailPageHeader` — that row with the way back attached, for a page
  the user reached *from* somewhere and has to be able to leave.
* :class:`ContentColumn` — the measure a page's body stops growing at, so a
  sentence on a 1900px monitor is still a sentence and not a ribbon.
* :class:`SectionHeader` — a kicker with its datum beside it (``AGENTS · 3
  live``), the UI kit's counted-section pattern.
* :class:`TableCard` — the card whose table runs flush to its edges, as in the
  Mission delegation tree and the Git commit list.
* :class:`LogPanel` — the monospace run log, capped so a long session cannot
  turn it into a leak.
* :class:`ConfirmDialog` — the destructive confirm, which in this app has to
  name what it is about to affect rather than ask whether the user is sure.

Anything the application stylesheet already paints by objectName is used through
that name rather than restated inline: `pageTitle`, `heading`, `muted`, `dim`,
`dialogSurface` and `QFrame[role="divider"]` are all rules that exist, and a
component that re-declared them would be a second place to retune the theme.
"""

from __future__ import annotations

from collections import deque
from html import escape
from typing import TYPE_CHECKING, Final

from PySide6.QtCore import QCoreApplication, Qt, Signal
from PySide6.QtWidgets import (
    QApplication,
    QDialog,
    QFrame,
    QHBoxLayout,
    QLabel,
    QPlainTextEdit,
    QVBoxLayout,
    QWidget,
)
from rotaris_core.reqtocode import SWR, traces

from rotaris.theme import tokens
from rotaris.theme.manager import Themed, theme_manager
from rotaris.theme.motif import apply_elevation
from rotaris.widgets.cards import Card, SectionLabel, make_button
from rotaris.widgets.data_table import Table

if TYPE_CHECKING:
    from collections.abc import Iterable

    from PySide6.QtGui import QResizeEvent

    from rotaris.theme.color import Color
    from rotaris.theme.spec import Theme

__all__ = [
    "ConfirmDialog",
    "ContentColumn",
    "DetailPageHeader",
    "LogPanel",
    "PageHeader",
    "SectionHeader",
    "TableCard",
]

#: How wide the level column is, in characters. The design system pins it at
#: 40px because HTML has no character grid; a monospace panel does, and five
#: characters covers every level the product logs. A longer one pushes its own
#: message right rather than being cut: a level name is information, and losing
#: one is worse than a ragged edge on the line that carries it.
_LEVEL_COLUMN: Final = 5

#: The dialog's width, from `.dialog`. A layout constant rather than a token —
#: it is the measure a sentence of body text stays readable at, and no theme
#: changes that.
_DIALOG_WIDTH: Final = 440

#: How wide a reading column is allowed to get, for the same reason and in the
#: same units as `_DIALOG_WIDTH`: a line of prose stops being readable somewhere
#: around 90 characters, and the requirement panes are shown on monitors twice
#: this wide. Wider than the dialog because these pages carry rows of controls
#: and two-up cards, not one column of sentences.
_CONTENT_MEASURE: Final = 1040


def _rule() -> QFrame:
    """A hairline separator the application stylesheet paints.

    Height is set by whoever owns it, because a `QFrame` with nothing in it asks
    for no height at all and a layout would give it exactly that.
    """
    line = QFrame()
    line.setProperty("role", "divider")
    return line


def _level_color(theme: Theme, level: str) -> Color:
    """The colour for a log level, in the *text* form of each state token.

    A level is a word, so it owes 4.5:1 and not the 3:1 a status dot owes. The
    word itself is what carries the meaning; the colour only sorts the lines
    faster for readers who can use it.
    """
    color = theme.color
    return {
        "info": color.info_text,
        "run": color.run_text,
        "ok": color.done_text,
        "done": color.done_text,
        "warn": color.wait_text,
        "warning": color.wait_text,
        "error": color.fail_text,
        "fail": color.fail_text,
    }.get(level.strip().lower(), color.idle_text)


def _render_line(theme: Theme, row: tuple[str, str, str]) -> str:
    """One log row as rich text: time, level column, message."""
    moment, level, message = row
    padded = escape(level.strip().upper().ljust(_LEVEL_COLUMN)).replace(" ", "&nbsp;")
    return (
        f'<span style="color:{theme.color.text_tertiary}">{escape(moment)}</span>&nbsp;'
        f'<span style="color:{_level_color(theme, level)}">{padded}</span>&nbsp;'
        f'<span style="color:{theme.color.text_secondary}">{escape(message)}</span>'
    )


@traces(SWR.SWR_3702)
class PageHeader(Themed, QWidget):
    """`.page-header` — the title, its subtitle, and the view's actions.

    The title takes its face from the stylesheet's `pageTitle` rule and the
    subtitle its colour from `dim`; only the subtitle's size is set here,
    because no rule carries it.
    """

    def __init__(self, title: str, subtitle: str = "", parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._row = QHBoxLayout(self)
        self._row.setContentsMargins(0, 0, 0, 0)
        self.title_label = QLabel(title)
        self.title_label.setObjectName("pageTitle")
        self.subtitle_label = QLabel(subtitle)
        self.subtitle_label.setObjectName("dim")
        self.subtitle_label.setVisible(bool(subtitle))
        # Baseline, not centre: the subtitle continues the title's line, and
        # centring an 11px word against a 20px one leaves it floating.
        self._row.addWidget(self.title_label, 0, Qt.AlignmentFlag.AlignBaseline)
        self._row.addWidget(self.subtitle_label, 0, Qt.AlignmentFlag.AlignBaseline)
        self._row.addStretch(1)
        self._actions = QHBoxLayout()
        self._row.addLayout(self._actions)
        self.setAccessibleName(title)
        self.install_theme_hook()

    def add_action(self, widget: QWidget) -> None:
        """Add a control to the right-hand end of the row."""
        self._actions.addWidget(widget)

    def set_title(self, title: str) -> None:
        self.title_label.setText(title)
        self.setAccessibleName(title)

    def set_subtitle(self, subtitle: str) -> None:
        self.subtitle_label.setText(subtitle)
        self.subtitle_label.setVisible(bool(subtitle))

    def apply_theme(self, theme: Theme) -> None:
        self._row.setSpacing(theme.space[1.75])
        self._actions.setSpacing(theme.space.sm)
        self.subtitle_label.setStyleSheet(f"font-size:{theme.type.scale.xs}px;")


@traces(SWR.SWR_3702)
class ContentColumn(QWidget):
    """Centres a page's body and stops it growing past a readable measure.

    A detail pane fills whatever the window gives it, and on a wide monitor that
    left a 600px ribbon of text against 1300px of nothing — which reads as a
    page that failed to load rather than as a page with room. The column expands
    with the window up to :data:`_CONTENT_MEASURE` and then stops, so the layout
    is identical in the supported 1000×680 window and merely centred above it.
    """

    def __init__(self, content: QWidget, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._column = QVBoxLayout(self)
        self._column.setContentsMargins(0, 0, 0, 0)
        self._column.setSpacing(0)
        self._column.addWidget(content)
        self.content = content
        self._centre()

    def resizeEvent(self, event: QResizeEvent) -> None:  # noqa: N802 — Qt's spelling
        super().resizeEvent(event)
        self._centre()

    def _centre(self) -> None:
        """Push the surplus width into the margins, evenly.

        Margins rather than a stretch on either side: expanding spacers and an
        expanding child divide the width by their stretch factors *before* any
        maximum applies, which handed the content a third of a wide window and
        left it narrower than it had been. A margin is arithmetic, and it is the
        same arithmetic at every window size.
        """
        surplus = max(0, self.width() - _CONTENT_MEASURE)
        side = surplus // 2
        self._column.setContentsMargins(side, 0, surplus - side, 0)


@traces(SWR.SWR_3702, SWR.SWR_3314)
class DetailPageHeader(PageHeader):
    """A page header with the way back at the head of its row.

    Every pane behind the requirement board — detail, queue, review, graph,
    evidence — is somewhere the user *arrived*, and each was building the same
    ghost button and the same heading by hand, at slightly different sizes. The
    control leads the row rather than trailing the actions: it is the first
    thing in the reading order, which is also where a keyboard user expects to
    find the way out (SWR-3314).
    """

    #: The user wants to go back where they came from.
    back_requested = Signal()

    def __init__(
        self,
        title: str,
        subtitle: str = "",
        *,
        back_label: str = "Back to board",
        parent: QWidget | None = None,
    ) -> None:
        super().__init__(title, subtitle, parent)
        # Compact and ghost: the way back is a control the user needs to find,
        # not the loudest thing on a page whose title is the point.
        self.back_button = make_button(back_label, "ghost", compact=True)
        self.back_button.setAccessibleName(back_label)
        self.back_button.clicked.connect(self.back_requested)
        self._row.insertWidget(0, self.back_button)
        # The subtitle carries a stated fact here — what the scheduler is doing,
        # which state a requirement is in — not the aside `dim` is for, so it
        # takes the body-secondary step every other sentence on the page takes.
        self.subtitle_label.setObjectName("muted")
        # Wrapping, and given the row's spare width. Without the wrap the whole
        # sentence has to fit on one line, which makes the *header* demand more
        # width than the supported 1000×680 window has (SWR-3302); without the
        # stretch it wraps inside a narrow column while the row beside it is
        # empty.
        self.subtitle_label.setWordWrap(True)
        self._row.setStretch(self._row.indexOf(self.subtitle_label), 1)


@traces(SWR.SWR_3709)
class SectionHeader(Themed, QWidget):
    """A kicker with the datum that belongs to it: ``AGENTS · 3 live``.

    The design system's UI kit pairs a section's kicker with the one number a
    reader checks it for — and tells the two apart typographically. The kicker
    is a :class:`~rotaris.widgets.cards.SectionLabel` (uppercase, tracked); the
    datum is *data*, so it renders in the mono face, is never uppercased, and
    takes its colour from what it counts. Before this pattern each call site
    improvised the pairing, and the improvisations disagreed — one crammed the
    count into the kicker's own uppercased text, the next left it an unstyled
    default label.

    The datum's tone names a meaning, not a colour: ``live`` for a count of
    things running now, ``neutral`` for everything else. Both resolve against
    the active theme when applied, in the text step (a datum is words and owes
    4.5:1, not the 3:1 a dot owes — the same split as the state aliases).
    """

    #: Tones a datum can take → the Color attribute that carries it. An
    #: attribute name, not a Color: the value is resolved from the active theme
    #: in :meth:`apply_theme`, never captured here (SWR-3706).
    _TONES: Final = {"neutral": "text_secondary", "live": "run_text"}

    def __init__(self, title: str, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        row = QHBoxLayout(self)
        row.setContentsMargins(0, 0, 0, 0)
        self.label = SectionLabel(title)
        self.separator = QLabel("·")
        self.separator.hide()
        self.datum = QLabel("")
        # The mono face comes from the application stylesheet's
        # `QLabel[mono="true"]` rule — the same door every other mono label
        # uses. Setting a QFont here instead would lose to that stylesheet at
        # polish time, which is exactly the silent override QSS is known for.
        self.datum.setProperty("mono", "true")
        self.datum.hide()
        self._tone = "neutral"
        row.addWidget(self.label)
        row.addWidget(self.separator)
        row.addWidget(self.datum)
        row.addStretch(1)
        self._row = row
        self.install_theme_hook()

    def set_datum(self, text: str, tone: str = "neutral") -> None:
        """Show *text* beside the kicker, or nothing when it is empty.

        An unknown *tone* is a programming error and raises, for the same
        reason an unknown icon name does: rendered silently in the fallback
        colour it would survive review.
        """
        if tone not in self._TONES:
            raise KeyError(tone)
        self._tone = tone
        self.datum.setText(text)
        self.datum.setVisible(bool(text))
        self.separator.setVisible(bool(text))
        self.apply_theme(theme_manager().current)

    def apply_theme(self, theme: Theme) -> None:
        color, type_ = theme.color, theme.type
        self._row.setSpacing(theme.space[0.75])
        ink = getattr(color, self._TONES[self._tone])
        self.datum.setStyleSheet(f"font-size:{type_.scale.x2s}px;color:{ink};")
        # Tertiary, not border_strong: the dot is rendered *text* and owes the
        # 4.5:1 a word owes — border_strong sits a hair under that on a panel.
        self.separator.setStyleSheet(f"color:{color.text_tertiary};")


@traces(SWR.SWR_3702)
class TableCard(Card):
    """`.table-card` — a card with no padding, whose table runs to its edges.

    The card's own padding moves onto the header row and the footer, which is
    what lets the table's rows be full-bleed and separated from both by a
    hairline. The table is inset by the same amount instead, so its first column
    starts under the card's title rather than seven pixels to the left of it.
    """

    def __init__(self, title: str, parent: QWidget | None = None) -> None:
        super().__init__(title, parent=parent)
        self.body.setContentsMargins(0, 0, 0, 0)
        self.body.setSpacing(0)
        self._head_rule = _rule()
        self.body.addWidget(self._head_rule)
        self.table = Table(title)
        self.body.addWidget(self.table, 1)

        self._foot = QWidget()
        foot_column = QVBoxLayout(self._foot)
        foot_column.setContentsMargins(0, 0, 0, 0)
        foot_column.setSpacing(0)
        self._foot_rule = _rule()
        foot_column.addWidget(self._foot_rule)
        self._foot_row = QHBoxLayout()
        self.footer_label = QLabel()
        self.footer_label.setObjectName("dim")
        self._foot_row.addWidget(self.footer_label)
        self._foot_row.addStretch(1)
        foot_column.addLayout(self._foot_row)
        self._foot.setVisible(False)
        self.body.addWidget(self._foot)
        # `Card.__init__` installed the theme hook and called `apply_theme`
        # once already, before any of the above existed.
        self.apply_theme(tokens())

    def set_footer(self, text: str) -> None:
        """Show a summary line under the table, or hide it when *text* is empty."""
        self.footer_label.setText(text)
        self._foot.setVisible(bool(text))

    def apply_theme(self, theme: Theme) -> None:
        super().apply_theme(theme)
        if not hasattr(self, "table"):
            return
        pad_y, pad_x = theme.space[1.25], theme.space.lg
        self.header_row.setContentsMargins(pad_x, pad_y, pad_x, pad_y)
        self._foot_row.setContentsMargins(pad_x, pad_y, pad_x, pad_y)
        for rule in (self._head_rule, self._foot_rule):
            rule.setFixedHeight(theme.size.hairline)
        self.footer_label.setStyleSheet(f"font-size:{theme.type.scale.xs}px;")
        # Qt has no per-column padding, so the inset that lines the first column
        # up with the card's title is padding on the view itself — which, for a
        # scroll area, is where the viewport starts.
        self.table.setStyleSheet(
            f"QTableView {{ padding-left:{pad_x}px; padding-right:{pad_x}px; }}"
        )


@traces(SWR.SWR_3702)
class LogPanel(Themed, QPlainTextEdit):
    """`.log-panel` — a monospace run log of `(time, level, message)` rows.

    **Retention is capped, and that is not a detail.** A panel that keeps every
    line it is handed is a leak with a slow fuse: an agent run emits thousands
    over an afternoon, and each is held twice — once as a paragraph in the
    document and once in the rows this re-renders from when the theme changes.
    `max_lines` bounds both, and the oldest line falls off the top as a new one
    arrives.

    Read-only rather than a stack of labels, which is what keeps the whole log
    selectable and copyable in one gesture: the app's rules require anything a
    user may need to paste into a bug report to stay copyable, and a column of
    per-line widgets cannot be dragged across.
    """

    def __init__(
        self, name: str = "Log", *, max_lines: int = 500, parent: QWidget | None = None
    ) -> None:
        super().__init__(parent)
        self._rows: deque[tuple[str, str, str]] = deque(maxlen=max_lines)
        self.setObjectName("logPanel")
        self.setReadOnly(True)
        # Nothing here is editable, so an undo stack would be a second copy of
        # every line — precisely what the cap exists to prevent.
        self.setUndoRedoEnabled(False)
        self.setMaximumBlockCount(max_lines)
        self.setAccessibleName(name)
        self.setAccessibleDescription(f"The most recent {max_lines} log lines")
        self.install_theme_hook()

    def append_line(self, moment: str, level: str, message: str) -> None:
        """Add one row, dropping the oldest when the panel is full."""
        row = (moment, level, message)
        self._rows.append(row)
        bar = self.verticalScrollBar()
        # A reader who has scrolled up is reading something; only a reader
        # already at the tail is following the run and wants to be carried.
        following = bar.value() >= bar.maximum() - 1
        self.appendHtml(_render_line(tokens(), row))
        if following:
            bar.setValue(bar.maximum())

    def clear(self) -> None:
        """Drop every retained line, not just the ones on screen."""
        self._rows.clear()
        super().clear()

    def apply_theme(self, theme: Theme) -> None:
        # Both, and not by accident: the application stylesheet gives every
        # QPlainTextEdit the body face at `base`, and only a rule on the widget
        # itself outranks that — while the document measures its lines against
        # the widget's QFont, which a stylesheet alone does not reliably set.
        self.setFont(theme.type.mono_font(theme.type.scale.xs))
        self.setStyleSheet(
            f"QPlainTextEdit#logPanel {{"
            f"background:{theme.color.bg};"
            f"color:{theme.color.text_secondary};"
            f"border:{theme.size.hairline}px solid {theme.color.border};"
            f"border-radius:{theme.radius.md}px;"
            f"padding:{theme.space.md}px {theme.space.lg}px;"
            f"font-family:{theme.type.mono};"
            f"font-size:{theme.type.scale.xs}px;"
            f"}}"
        )
        bar = self.verticalScrollBar()
        position = bar.value()
        super().clear()
        for row in self._rows:
            self.appendHtml(_render_line(theme, row))
        bar.setValue(min(position, bar.maximum()))


@traces(SWR.SWR_3702)
class ConfirmDialog(Themed, QDialog):
    """`.dialog` — the destructive confirm, on a raised and elevated surface.

    *impacts* is what separates this from a yes/no box: the app's rules do not
    accept "are you sure", so a caller lists what the action will actually
    touch, and the list is selectable because a user copying it into a note
    before agreeing is a reasonable thing to do. *detail* is the same courtesy
    for technical text — a command line, a path, a provider payload.

    The safe action holds focus and is the default, so Enter and Escape both
    decline. Nothing in a destructive dialog should be one keystroke away from
    happening by accident.
    """

    def __init__(
        self,
        title: str,
        message: str,
        impacts: Iterable[str] = (),
        *,
        confirm_label: str,
        cancel_label: str = "Cancel",
        detail: str = "",
        parent: QWidget | None = None,
    ) -> None:
        super().__init__(parent)
        listed = [item for item in impacts if item]
        self.setWindowTitle(title)
        self.setModal(True)
        self.setMinimumWidth(_DIALOG_WIDTH)
        self.setAccessibleName(title)
        self.setAccessibleDescription(" ".join([message, *listed]))

        self._outer = QVBoxLayout(self)
        self._surface = QFrame()
        self._surface.setObjectName("dialogSurface")
        self._outer.addWidget(self._surface)
        self._column = QVBoxLayout(self._surface)

        self.title_label = QLabel(title)
        self.title_label.setObjectName("heading")
        self.title_label.setWordWrap(True)
        self._column.addWidget(self.title_label)

        self.message_label = QLabel(message)
        self.message_label.setObjectName("muted")
        self.message_label.setWordWrap(True)
        self._column.addWidget(self.message_label)

        self.impact_label = QLabel("\n".join(f"• {item}" for item in listed))
        self.impact_label.setObjectName("muted")
        self.impact_label.setWordWrap(True)
        self.impact_label.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        self.impact_label.setVisible(bool(listed))
        self._column.addWidget(self.impact_label)

        self.detail_label = QLabel(detail)
        self.detail_label.setObjectName("dim")
        self.detail_label.setProperty("mono", "true")
        self.detail_label.setWordWrap(True)
        self.detail_label.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        self.detail_label.setVisible(bool(detail))
        self._column.addWidget(self.detail_label)

        self._actions = QHBoxLayout()
        self._actions.addStretch(1)
        self.cancel_button = make_button(cancel_label, "secondary")
        self.cancel_button.setAccessibleName(cancel_label)
        self.cancel_button.clicked.connect(self.reject)
        self._actions.addWidget(self.cancel_button)
        self.confirm_button = make_button(confirm_label, "danger")
        self.confirm_button.setAccessibleName(confirm_label)
        self.confirm_button.setAccessibleDescription("Confirms this irreversible action")
        self.confirm_button.clicked.connect(self.accept)
        self._actions.addWidget(self.confirm_button)
        self._column.addLayout(self._actions)

        self.cancel_button.setDefault(True)
        self.cancel_button.setFocus()
        self.install_theme_hook()

    @classmethod
    def ask(
        cls,
        title: str,
        message: str,
        impacts: Iterable[str] = (),
        *,
        confirm_label: str,
        cancel_label: str = "Cancel",
        detail: str = "",
        parent: QWidget | None = None,
    ) -> bool:
        """Ask, and answer no without asking when there is nobody to ask.

        Programmatic shutdown and test teardown must never raise an interactive
        confirmation: a modal opened while the application is closing has no one
        to dismiss it and blocks the very teardown that opened it. Declining is
        the safe half of a destructive choice, so that is what a caller gets.
        """
        if QApplication.instance() is None or QCoreApplication.closingDown():
            return False
        dialog = cls(
            title,
            message,
            impacts,
            confirm_label=confirm_label,
            cancel_label=cancel_label,
            detail=detail,
            parent=parent,
        )
        return dialog.exec() == QDialog.DialogCode.Accepted

    def apply_theme(self, theme: Theme) -> None:
        # The shadow is drawn inside the dialog's own rectangle, so this margin
        # is the room it has to fall into; without it there is nothing to see.
        margin = theme.space.md
        self._outer.setContentsMargins(margin, margin, margin, margin)
        self._column.setContentsMargins(
            theme.space.xl, theme.space.lg, theme.space.xl, theme.space.lg
        )
        self._column.setSpacing(theme.space.md)
        self._actions.setSpacing(theme.space.sm)
        # `heading` already carries the display face and its weight; a dialog
        # title is simply set one step larger than a card's.
        self.title_label.setStyleSheet(f"font-size:{theme.type.scale.h4}px;")
        self.message_label.setStyleSheet(f"font-size:{theme.type.scale.base}px;")
        self.detail_label.setStyleSheet(f"font-size:{theme.type.scale.xs}px;")
        apply_elevation(self._surface, theme.elevation_lg)
