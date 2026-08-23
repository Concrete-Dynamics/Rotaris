"""Window chrome: title bar, navigation rail, status bar."""

from __future__ import annotations

import html
from typing import TYPE_CHECKING, Final

from PySide6.QtCore import QSize, Qt, QUrl, Signal
from PySide6.QtGui import (
    QDesktopServices,
    QFontMetricsF,
    QIcon,
    QPainter,
    QPixmap,
)
from PySide6.QtWidgets import (
    QApplication,
    QFrame,
    QHBoxLayout,
    QLabel,
    QToolButton,
    QVBoxLayout,
    QWidget,
)
from rotaris_core.reqtocode import SWR, traces

from rotaris.theme import phosphor, tokens
from rotaris.theme.a11y import raise_on
from rotaris.theme.brand import mark_pixmap
from rotaris.theme.manager import Themed
from rotaris.widgets.cards import _tag_variant
from rotaris.widgets.meters import StatusDot

if TYPE_CHECKING:
    from PySide6.QtGui import QResizeEvent

    from rotaris.models.store import WorkspaceStore
    from rotaris.theme.spec import Theme

#: Each item names a Phosphor icon (SWR-3708) — the design system's own
#: vocabulary, not a Unicode character left to Windows font-fallback.
NAV_ITEMS: list[tuple[str, str, str]] = [
    ("dashboard", "gauge", "Overview"),
    ("workspace", "app-window", "Workspace"),
    ("mission", "tree-structure", "Mission"),
    # SWR-3301: requirements sit between the run (Mission) and its result (Git),
    # which is where they belong in the loop the user is actually in.
    ("requirements", "diamonds-four", "Requirements"),
    ("git", "git-branch", "Git"),
    ("library", "books", "Library"),
    ("settings", "gear", "Settings"),
]

#: `.nav-item` labels are 9px — the design system's own component literal, like
#: the button's 7/13. One pixel under `x2s`, because a rail label is a caption
#: under an icon, not a word in a sentence.
_NAV_LABEL_SIZE: Final = 9

#: The `.tag` variant each session status wears in the title-bar chip — the
#: same fills a state tag uses anywhere else, so a chip and a tag never
#: disagree on what a colour means (SWR-3709).
_SESSION_TAG_VARIANT: Final = {
    "starting": "run",
    "running": "run",
    "pausing": "wait",
    "paused": "wait",
    "cancelling": "wait",
    "completed": "done",
    "failed": "fail",
    "cancelled": "fail",
    "idle": "neutral",
}


@traces(SWR.SWR_2092, SWR.SWR_3708)
def _glyph_icon(glyph: str, size: int = 17) -> QIcon:
    """Rasterize a nav-rail symbol as a QIcon at the primary screen DPR.

    *glyph* is preferably a Phosphor icon name (SWR-3708); a raw character
    still works and takes the fallback path below, which exists for the tests
    that exercise font-fallback and for any surface with a genuine text glyph.

    On high-DPI Windows (125%–200% scaling) the physical pixmap is scaled up
    so the glyph renders at the same perceived size as on Linux (1× DPR).

    A fallback character is measured via ``QFontMetricsF.tightBoundingRect``
    and the painter scaled so every glyph fills a consistent fraction of the
    pixmap regardless of which font-fallback rendered it. A Phosphor glyph is
    *not* rescaled: the icon font draws on one em square, and per-glyph
    rescaling would undo exactly that consistency.
    """
    screen = QApplication.primaryScreen()
    dpr = screen.devicePixelRatio() if screen else 1.0
    phys_size = round(size * dpr)
    color = tokens().color
    icon = QIcon()
    is_phosphor = glyph in phosphor.ICONS
    # The resting glyph carries the same step as the label under it, so icon and
    # word read as one nav item rather than two things of different importance.
    for ink, state in (
        (color.text_tertiary, QIcon.State.Off),
        (color.accent[300], QIcon.State.On),
    ):
        if is_phosphor:
            icon.addPixmap(phosphor.pixmap(glyph, ink, size), QIcon.Mode.Normal, state)
            continue
        pixmap = QPixmap(phys_size, phys_size)
        pixmap.setDevicePixelRatio(dpr)
        pixmap.fill(Qt.GlobalColor.transparent)
        painter = QPainter(pixmap)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        painter.setPen(ink.qcolor)
        font = painter.font()
        font.setPointSizeF(size * 0.62)
        painter.setFont(font)

        # Measure the glyph's ink bounds and scale to fill ~82 % of the
        # pixmap.  Without this, thin glyphs (⋔, ⎇, ▤) rendered by
        # Windows font-fallback can appear much smaller than dense ones
        # (◎, ⚙) even at the same point size.
        fm = QFontMetricsF(font)
        gb = fm.tightBoundingRect(glyph)
        if gb.isValid() and gb.width() > 0 and gb.height() > 0:
            fill = 0.82
            scale_x = (phys_size * fill) / gb.width()
            scale_y = (phys_size * fill) / gb.height()
            scale = min(scale_x, scale_y)
            cx = phys_size / 2
            painter.translate(cx, cx)
            painter.scale(scale, scale)
            painter.translate(-cx, -cx)

        painter.drawText(pixmap.rect(), Qt.AlignmentFlag.AlignCenter, glyph)
        painter.end()
        icon.addPixmap(pixmap, QIcon.Mode.Normal, state)
    return icon


@traces(SWR.SWR_2033, SWR.SWR_2414, SWR.SWR_3726)
class TitleBar(Themed, QWidget):
    """Brand strip: mark + name + version, workspace chip, session status."""

    def __init__(self, store: WorkspaceStore, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._store = store
        self.setObjectName("chrome")
        self.setAutoFillBackground(True)
        self.setFixedHeight(tokens().size.title_bar_height)
        space = tokens().space
        layout = QHBoxLayout(self)
        layout.setContentsMargins(space.md, 0, space.md, 0)
        layout.setSpacing(space.md)

        # The UI kit pins the title-bar mark at 22px; the mark itself is the
        # design system's logo (SWR-3726), and the letter placeholder survives
        # only as the degradation when the asset is missing or unrenderable.
        self._mark = QLabel()
        self._mark.setFixedSize(22, 22)
        self._mark.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._mark.setAccessibleName("Rotaris")
        mark = mark_pixmap(22)
        self._mark_is_logo = not mark.isNull()
        if self._mark_is_logo:
            self._mark.setPixmap(mark)
        else:
            self._mark.setText("R")
        layout.addWidget(self._mark)

        self._brand = QLabel("Rotaris")
        layout.addWidget(self._brand)
        self.version_label = QLabel(f"v{store.app_version}")
        layout.addWidget(self.version_label)

        layout.addStretch(1)
        self.workspace_chip = QLabel()
        self.workspace_chip.setAccessibleName("Current workspace and session")
        self.workspace_chip.setObjectName("workspaceChip")
        layout.addWidget(self.workspace_chip)
        layout.addStretch(1)

        # One chip, not a dot floating beside a word: the session status is a
        # tag-styled pill carrying both (SWR-3709).
        self.session_chip = QFrame()
        self.session_chip.setObjectName("sessionChip")
        self.session_chip.setAccessibleName("Session status")
        self._session_chip_layout = QHBoxLayout(self.session_chip)
        self._session_chip_layout.setContentsMargins(0, 0, 0, 0)
        self.status_dot = StatusDot(size=tokens().size.status_dot)
        self._session_chip_layout.addWidget(self.status_dot)
        self.status_label = QLabel()
        self._session_chip_layout.addWidget(self.status_label)
        layout.addWidget(self.session_chip)

        # One step under the session dot: a background review is subordinate to
        # the run it is reviewing, and the two must not compete for the eye.
        self.improvement_dot = StatusDot(size=tokens().size.status_dot - 1)
        self.improvement_dot.hide()
        layout.addWidget(self.improvement_dot)
        self.improvement_label = QLabel("Reviewing run for improvements…")
        self.improvement_label.setAccessibleName("Improvement analysis status")
        self.improvement_label.setAccessibleDescription(
            "Reviewing the completed run for improvements in the background. "
            "You can continue working.",
        )
        self.improvement_label.hide()
        layout.addWidget(self.improvement_label)

        store.status_changed.connect(self.refresh)
        store.improvement_collection_changed.connect(self.refresh)
        # Also the first paint: nothing above styled a widget, and the hook
        # applies the active theme before it returns.
        self.install_theme_hook()

    def apply_theme(self, theme: Theme) -> None:
        color, type_, size = theme.color, theme.type, theme.size
        # `#chrome` already carries the ground from the application stylesheet;
        # only the edge that separates the bar from the content is local.
        self.setStyleSheet(
            f"QWidget#chrome{{border-bottom:{size.hairline}px solid {color.border};}}"
        )
        # The placeholder letter carries the dashed accent frame; the logo
        # paints itself and needs none.
        if not self._mark_is_logo:
            self._mark.setStyleSheet(
                f"border:{size.hairline}px dashed {color.accent[700]};"
                f"border-radius:{theme.radius.sm}px;color:{color.accent[400]};"
                f"font-size:{type_.scale.sm}px;font-weight:{type_.weight_display};"
            )
        else:
            self._mark.setStyleSheet("")
        # No `letter-spacing` on the wordmark: QSS parses the declaration and
        # then discards it, so carrying one here would only look like tracking.
        self._brand.setStyleSheet(
            f"font-size:{type_.scale.base}px;font-weight:{type_.weight_display};"
        )
        self.version_label.setStyleSheet(
            f"font-family:{type_.mono};font-size:{type_.scale.x2s}px;color:{color.text_tertiary};"
        )
        self.workspace_chip.setStyleSheet(
            f"QLabel#workspaceChip{{border:{size.hairline}px solid {color.border};"
            f"border-radius:{theme.radius.sm}px;"
            f"padding:{theme.space.xs}px {theme.space.md}px;"
            f"background:{color.bg};font-size:{type_.scale.sm}px;"
            f"color:{color.text_secondary};}}"
        )
        status_style = f"font-size:{type_.scale.xs}px;color:{color.text_secondary};"
        self.improvement_label.setStyleSheet(status_style)
        # Both dots hold the colour they were last handed, so the states have to
        # be pushed again or they keep painting the palette the user just left.
        self.refresh()

    def refresh(self) -> None:
        s = self._store
        t = tokens()
        color = t.color
        self.version_label.setText(f"v{s.app_version}")
        # Place and name are different kinds of fact and read in different
        # faces (SWR-3709): the path is data (mono), the session is a name
        # (body), and the folder icon says "place" before either is read.
        # Rich text bakes its colours in, so this is rebuilt on every refresh —
        # and apply_theme ends in refresh, which keeps a theme switch honest.
        # One family, resolved the way the metrics code resolves it, because a
        # CSS stack full of quoted names does not survive a style attribute.
        mono_family = t.type.mono_font(t.type.scale.xs).family()
        self.workspace_chip.setText(
            f"{phosphor.markup('folder-simple', color.text_tertiary)}&nbsp; "
            f"<span style=\"font-family:'{mono_family}';"
            f'font-size:{t.type.scale.xs}px;">{html.escape(s.workspace_path)}</span>'
            f'&nbsp;<span style="color:{color.text_tertiary};">·</span>&nbsp;'
            f"{html.escape(s.session_name or '—')}"
        )
        # A dot, not a word: the graphical steps, which owe 3:1. The status
        # itself is spelled out in the label beside it (SWR-3304).
        dot = {
            "running": color.run,
            "starting": color.info_state,
            "pausing": color.wait,
            "paused": color.wait,
            "failed": color.fail,
            "cancelling": color.wait,
            "cancelled": color.fail,
            "completed": color.done,
        }.get(s.session_status, color.idle)
        self.status_dot.set_state(dot, pulse=s.session_status in {"running", "starting"})
        # The chip is a `.tag` in every way but one: the word shares the pill
        # with the dot. The variant follows the state, the fill and ink are the
        # tag pair for it, and contrast is resolved against the chrome the chip
        # actually sits on (SWR-3709).
        kind = _SESSION_TAG_VARIANT.get(s.session_status, "neutral")
        fill, ink, border = _tag_variant(t, kind)
        ground = fill.over(color.chrome) if fill is not None else color.chrome
        ink = raise_on(ink, ground, t.min_text_contrast)
        # `.tag`'s own insets and gap: 2px 7px padding, 5px between dot and word.
        pad_y, pad_x = t.space[0.25], t.space[0.875]
        self._session_chip_layout.setContentsMargins(pad_x, pad_y, pad_x, pad_y)
        self._session_chip_layout.setSpacing(t.space[0.625])
        self.session_chip.setStyleSheet(
            f"QFrame#sessionChip{{background:{'transparent' if fill is None else fill};"
            f"border:{t.size.hairline}px solid {'transparent' if border is None else border};"
            f"border-radius:{t.radius.sm}px;}}"
        )
        self.status_label.setText(f"session {s.session_status}")
        self.status_label.setStyleSheet(
            f"font-size:{t.type.scale.x2s}px;font-weight:{t.type.weight_strong};color:{ink};"
        )
        self.session_chip.setAccessibleDescription(f"Session is {s.session_status}")
        collecting = s.improvement_collection_active
        self.improvement_dot.setVisible(collecting)
        self.improvement_label.setVisible(collecting)
        if collecting:
            self.improvement_dot.set_state(color.info_state, pulse=True)


@traces(SWR.SWR_2092)
class NavRail(Themed, QWidget):
    """Left icon rail; emits view ids from NAV_ITEMS."""

    view_selected = Signal(str)

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setObjectName("chrome")
        self.setAutoFillBackground(True)
        t = tokens()
        self.setFixedWidth(t.size.nav_rail_width)
        layout = QVBoxLayout(self)
        # `.nav-rail`: 12px of air at the ends and the item centred in the 68px
        # column; 4px between items. The two widths are tokens, so the gutter
        # between them is derived rather than pinned.
        layout.setContentsMargins(t.space.sm, t.space.md, t.space.sm, t.space.md)
        layout.setSpacing(t.space.xs)
        self._buttons: dict[str, QToolButton] = {}
        for view_id, _glyph, label in NAV_ITEMS:
            button = QToolButton()
            button.setIconSize(QSize(17, 17))
            button.setText(label)
            button.setCheckable(True)
            button.setCursor(Qt.CursorShape.PointingHandCursor)
            button.setToolButtonStyle(Qt.ToolButtonStyle.ToolButtonTextUnderIcon)
            button.setFixedWidth(t.size.nav_item_width)
            button.setAccessibleName(f"Open {label}")
            button.setToolTip(f"Open {label}")
            button.clicked.connect(lambda _=False, v=view_id: self.select(v, emit=True))
            layout.addWidget(button, 0, Qt.AlignmentFlag.AlignHCenter)
            self._buttons[view_id] = button
        layout.addStretch(1)
        self.select("dashboard")
        # Also the first paint: no button carries a glyph yet, and rasterising
        # them is part of applying a theme.
        self.install_theme_hook()

    def _item_width(self, theme: Theme) -> int:
        """The item width the *labels* need, never less than the token asks for.

        The design system drew this rail for six views, before the requirements
        board (SWR-3301) added a seventh whose name is the longest of them all.
        At the system's own label size "Requirements" is wider than the item it
        has to sit in, and Qt's answer to that is to elide the middle — the rail
        reads "Requ…ents", which is worse than a slightly wider rail.

        Measuring rather than picking a bigger number keeps this correct for the
        themes that change the type scale (High Contrast is a step up across the
        board) and for whatever the eighth view ends up being called.
        """
        metrics = QFontMetricsF(
            theme.type.body_font(_NAV_LABEL_SIZE, weight=theme.type.weight_strong)
        )
        widest = max(metrics.horizontalAdvance(label) for _, _, label in NAV_ITEMS)
        return max(theme.size.nav_item_width, round(widest) + 2 * theme.space.xs)

    def apply_theme(self, theme: Theme) -> None:
        color, type_ = theme.color, theme.type
        item_width = self._item_width(theme)
        self.setFixedWidth(item_width + 2 * theme.space.sm)
        for button in self._buttons.values():
            button.setFixedWidth(item_width)
        self.setStyleSheet(
            f"""
            QWidget#chrome{{border-right:{theme.size.hairline}px solid {color.border};}}
            QToolButton{{
                color:{color.text_tertiary}; border:none;
                border-radius:{theme.radius.sm}px;
                padding:{theme.space.sm}px 0 {theme.space[0.75]}px 0;
                font-size:{_NAV_LABEL_SIZE}px;
                font-weight:{type_.weight_strong};
                width:{item_width}px;
            }}
            QToolButton:hover{{
                color:{color.text_secondary}; background:{color.text.with_opacity(0.05)};
            }}
            QToolButton:checked{{
                color:{color.accent[300]}; background:{color.accent_tint_soft};
            }}
            """
        )
        # A glyph is baked into a pixmap, and repolishing never repaints one, so
        # a new palette means rasterising the whole rail again.
        for view_id, glyph, _label in NAV_ITEMS:
            self._buttons[view_id].setIcon(_glyph_icon(glyph))

    def select(self, view_id: str, emit: bool = False) -> None:
        for vid, button in self._buttons.items():
            button.setChecked(vid == view_id)
        if emit:
            self.view_selected.emit(view_id)

    def current(self) -> str:
        for vid, button in self._buttons.items():
            if button.isChecked():
                return vid
        return ""


@traces(SWR.SWR_2509)
class _StatusLink(Themed, QLabel):
    """A status-strip item that opens something, and looks like it does.

    The strip is one row of identically styled monospace facts. Some of them are
    facts and nothing else — a token count, a cost — and some stand for a place
    the user can be taken to. Until this existed the two were indistinguishable:
    the only thing separating them was a tooltip, which a screen reader reaches
    and an eye does not, so every actionable item read as inert text and was
    never clicked.

    The affordance is the one convention a reader already knows — link colour and
    an underline — and it is the only one that fits, because a 27-pixel row with
    six items in it has no width for a button chrome and no height for one. Qt's
    own anchor carries it: the item is rich text holding a single link, so the
    focus ring, ``Tab`` reach and ``Return`` activation are Qt's rather than a
    hand-rolled imitation of them. What the link does is still said in words —
    each item's tooltip and accessible description name the action — because the
    underline is a convention and a convention is not a sentence.

    The words are set through :meth:`set_item` rather than ``setText`` so the
    caller never has to think about markup, and so a path containing ``&`` is
    escaped rather than swallowed by the rich-text parser.
    """

    #: The link was clicked, or activated from the keyboard.
    activated = Signal()

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setTextFormat(Qt.TextFormat.RichText)
        # Both flags, always: a link only a pointer can reach is half an action.
        # Setting them is also what gives the label a focus policy, so it lands
        # in the tab order beside the controls above it.
        self.setTextInteractionFlags(
            Qt.TextInteractionFlag.LinksAccessibleByMouse
            | Qt.TextInteractionFlag.LinksAccessibleByKeyboard,
        )
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self._item_text = ""
        self._tint: str | None = None
        self.linkActivated.connect(lambda _href: self.activated.emit())
        self.install_theme_hook()

    def set_item(self, text: str, *, tint: str | None = None) -> None:
        """Show *text* as this item's link, or show nothing when it is empty.

        *tint* defaults to the accent at render time rather than in the
        signature: a default argument is evaluated at import, before the user
        has chosen a theme, and the colour is baked into markup that a repolish
        cannot reach afterwards (SWR-3706).
        """
        self._item_text = text
        self._tint = tint
        self._render()

    def _render(self) -> None:
        if not self._item_text:
            self.setText("")
            return
        tint = self._tint or tokens().color.accent[300]
        self.setText(
            f'<a href="#" style="color:{tint};">{html.escape(self._item_text)}</a>',
        )

    def apply_theme(self, theme: Theme) -> None:
        # Rich text carries its colour inside the markup, so the link has to be
        # written again — unpolishing the label leaves the old anchor colour.
        self._render()

    def item_text(self) -> str:
        """The words on the item, without the markup that makes them a link."""
        return self._item_text


@traces(SWR.SWR_2509)
class StatusBar(Themed, QFrame):
    """Bottom strip: path, branch, safety flags, model, tokens, bg sessions.

    Two kinds of item share the row and no longer share an appearance. Most of
    them are readings — the branch, the safety flags, the model, the tokens, the
    cost, the background sessions — and they stay plain text with the default
    cursor, because a reading that looks pressable is a promise the strip cannot
    keep. The ones that stand for somewhere the user can go are links
    (:class:`_StatusLink`): the workspace path opens the folder, and the Rotaris
    Cloud balance opens the account page credit is bought on.

    The other readings are not links because this strip has nothing to call for
    them. "Show me this branch" and "change this model" are the Git and Settings
    views, and a status bar reaches a view only through the window that owns the
    stack — which is a wire this widget cannot make on its own.
    """

    def __init__(self, store: WorkspaceStore, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._store = store
        self.setObjectName("chrome")
        self.setAutoFillBackground(True)
        self.setFixedHeight(tokens().size.status_bar_height)
        space = tokens().space
        layout = QHBoxLayout(self)
        layout.setContentsMargins(space.md, 0, space.md, 0)
        layout.setSpacing(space.lg)
        self.path_label = _StatusLink()
        self.path_label.setAccessibleName("Workspace folder")
        self.path_label.activated.connect(self._open_workspace_folder)
        self.branch_label = QLabel()
        self.branch_label.setAccessibleName("Checked-out branch")
        self.flags_label = QLabel()
        self.flags_label.setAccessibleName("Safety settings in force")
        self.model_label = QLabel()
        self.model_label.setAccessibleName("Model runs use")
        self.tokens_label = QLabel()
        self.tokens_label.setAccessibleName("Tokens used")
        self.cost_label = QLabel()
        self.cost_label.setAccessibleName("Cost so far")
        # Rotaris Cloud balance (SWR-3013): what the run is spending, beside what
        # it has cost so far. Absent entirely when no cloud account is signed in.
        self.cloud_credit_label = _StatusLink()
        self.cloud_credit_label.setAccessibleName("Rotaris Cloud credit")
        self.cloud_credit_label.activated.connect(self._open_cloud_account)
        self.cloud_credit_label.hide()
        self.bg_label = QLabel()
        self.bg_label.setAccessibleName("Background sessions")
        layout.addWidget(self.path_label)
        layout.addWidget(self.branch_label)
        layout.addStretch(1)
        layout.addWidget(self.flags_label)
        layout.addWidget(self.model_label)
        layout.addWidget(self.tokens_label)
        layout.addWidget(self.cost_label)
        layout.addWidget(self.cloud_credit_label)
        layout.addWidget(self.bg_label)

        store.status_changed.connect(self.refresh)
        store.git_changed.connect(self.refresh)
        store.settings_changed.connect(self.refresh)
        store.settings_dirty_changed.connect(lambda _dirty: self.refresh())
        store.sessions_changed.connect(self.refresh)
        store.cloud_credit_changed.connect(self._refresh_cloud_credit)
        self.refresh()
        self.install_theme_hook()

    def apply_theme(self, theme: Theme) -> None:
        color, type_ = theme.color, theme.type
        # The ground comes from `#chrome` in the application stylesheet; the top
        # edge and the strip's mono default are what only this bar wants.
        self.setStyleSheet(
            f"QFrame#chrome{{border-top:{theme.size.hairline}px solid {color.border};}}"
            f"QLabel{{font-family:{type_.mono};font-size:{type_.scale.xs}px;"
            f"color:{color.text_secondary};}}"
        )
        live = f"color:{color.accent[300]};"
        self.branch_label.setStyleSheet(live)
        self.tokens_label.setStyleSheet(live)
        self.cost_label.setStyleSheet(live)
        # The model is the field a reader scans this strip for, so it keeps the
        # full-strength text step the rest of the row steps down from.
        self.model_label.setStyleSheet(f"color:{color.text};")
        # The branch item embeds an icon whose colour rides in rich text, which
        # a repolish cannot reach — the row has to be written again (SWR-3706).
        self.refresh()
        self._refresh_cloud_credit()

    @traces(SWR.SWR_2509)
    def _open_workspace_folder(self) -> None:
        """Show the workspace folder in whatever this desktop browses files with.

        The same door every other path in the product goes through
        (``views/settings.py``, the requirement area's evidence sites): Rotaris
        keeps no file browser and names no command for one, so the folder is
        handed to the desktop. Failure is silent here, and deliberately so — a
        status strip has no notice slot of its own, and the window's belongs to
        whatever the user is actually doing.
        """
        path = self._store.workspace_path
        if path:
            QDesktopServices.openUrl(QUrl.fromLocalFile(path))

    @traces(SWR.SWR_3013)
    def _open_cloud_account(self) -> None:
        """Open the account page, which is where Rotaris Cloud credit is bought.

        The balance is the one item in the strip whose reader most often wants
        to act on it — an exhausted account refuses the next call — and the
        destination is the window's own, imported rather than re-spelled so the
        two cannot drift to different pages.
        """
        from rotaris.services.config_service import ROTARIS_CLOUD_QUICK_START_URL

        QDesktopServices.openUrl(QUrl(ROTARIS_CLOUD_QUICK_START_URL))

    @traces(SWR.SWR_3013)
    def _refresh_cloud_credit(self) -> None:
        """Carry the Rotaris Cloud balance while an account is signed in.

        Its own slot on its own signal: the balance arrives from a background
        poll, and rebuilding the whole strip for it would be work for nothing.
        """
        credit = self._store.cloud_credit
        if credit.phase != "ready":
            self.cloud_credit_label.hide()
            return
        color = tokens().color
        marker = "" if credit.admission_allowed else " ⚠ no credit"
        self.cloud_credit_label.set_item(
            f"{credit.balance_label} credit{marker}",
            # A word, not a dot, so the warning takes the text step that owes
            # 4.5:1 rather than the 3:1 an indicator shape owes.
            tint=color.accent[300] if credit.admission_allowed else color.wait_text,
        )
        self.cloud_credit_label.setToolTip(
            f"Rotaris Cloud · {credit.state_label}. "
            "Opens the account page, where credit is topped up."
        )
        self.cloud_credit_label.setAccessibleDescription(
            f"Rotaris Cloud credit {credit.balance_label}. {credit.state_label}. "
            "Opens the Rotaris Cloud account page."
        )
        self.cloud_credit_label.show()

    @traces(SWR.SWR_2509)
    def _flags(self) -> list[tuple[str, str]]:
        """The safety settings in force, each beside the sentence that explains it.

        Two demands meet in a 27-pixel strip. Every item has to stay short
        enough that the whole row still fits the supported 1000×680 window, and
        ``CB armed`` or ``mode: ask`` mean nothing to a reader who has not
        already been in Settings. So the short form keeps the pixels and the
        sentence rides along with it — into the tooltip and into the accessible
        description — which is how a strip explains itself without growing.

        The sentences deliberately repeat the Settings wording ("Circuit
        breaker", "Secret redaction", "Permission mode"): a reader who goes
        looking for the control this names has to find it under the same word.
        """
        s = self._store
        flags: list[tuple[str, str]] = []
        if s.runtime.circuit_breaker:
            flags.append(
                (
                    "● CB armed",
                    "Circuit breaker: Rotaris stops a run that keeps repeating a failing step.",
                )
            )
        flags.append(
            (
                "redaction: always on",
                "Secret redaction: anything that looks like a credential is masked before it "
                "reaches a model or the transcript.",
            )
        )
        if s.ui.settings_dirty:
            flags.append(
                (
                    "unsaved settings",
                    "Settings have been changed and not saved; runs still use the saved values.",
                )
            )
        outside = s.runtime.allow_outside_workspace
        flags.append(
            (
                "outside-workspace!" if outside else "workspace-scoped",
                "File access: agents may read and write outside this workspace folder."
                if outside
                else "File access: agents may read and write inside this workspace folder only.",
            )
        )
        flags.append(
            (
                f"mode: {s.runtime.permission_mode}",
                f"Permission mode {s.runtime.permission_mode}: how much agents may do without "
                "asking. Change it under the composer or in Settings → Runtime.",
            )
        )
        return flags

    def refresh(self) -> None:
        s = self._store
        self.path_label.set_item(s.workspace_path)
        self.path_label.setToolTip(
            f"Workspace folder: {s.workspace_path}. Opens it in your file manager."
            if s.workspace_path
            else "",
        )
        self.path_label.setAccessibleDescription(
            f"Workspace folder {s.workspace_path}. Opens it in your file manager."
            if s.workspace_path
            else "",
        )
        ahead = f" ↑{s.ahead}" if s.ahead else ""
        active_branch = s.session_runtime_label or s.branch
        # The branch fact carries the design system's own icon (SWR-3708/3709)
        # rather than the ⎇ character font-fallback used to draw it. Rich text
        # bakes the icon's colour in, so apply_theme re-runs this refresh.
        branch_icon = phosphor.markup("git-branch", tokens().color.accent[300])
        self.branch_label.setText(
            f"{branch_icon} {html.escape(active_branch)}{ahead}" if active_branch else ""
        )
        unpushed = ""
        if s.ahead:
            unpushed = f", {s.ahead} commit ahead" if s.ahead == 1 else f", {s.ahead} commits ahead"
        self.branch_label.setToolTip(
            f"Branch this workspace is on: {active_branch}{unpushed}." if active_branch else "",
        )
        flags = self._flags()
        self.flags_label.setText("   ".join(text for text, _why in flags))
        explained = "\n".join(f"{text} — {why}" for text, why in flags)
        self.flags_label.setToolTip(explained)
        self.flags_label.setAccessibleDescription(explained)
        self.model_label.setText(s.active_model)
        self.model_label.setToolTip(
            f"Runs started from this window use {s.active_model}. "
            "Change it in the composer or in Settings → Models."
            if s.active_model
            else "",
        )
        self.tokens_label.setText(f"{s.kpis.cumulative_tokens:,} tok")
        self.tokens_label.setToolTip("Tokens this workspace's runs have used so far.")
        self._refresh_cost()
        bg = sum(1 for sess in s.sessions if sess.status == "background")
        self.bg_label.setText(f"{bg} bg session" + ("s" if bg != 1 else ""))
        self.bg_label.setToolTip(
            "Sessions running in the background, beside the one this window is focused on.",
        )

    @traces(SWR.SWR_841)
    def _refresh_cost(self) -> None:
        """Show what the runs cost, or show nothing at all.

        The projection pre-renders every cost it can state, including "n/a" and
        "—" for a run nothing could price (SWR-841). An empty label is a fourth
        case it never produces: no session has reported usage yet, because none
        has run here. The strip used to render that as the bare word ``cost``
        with nothing in front of it — a label whose value the user was left to
        guess. There is no number to show, so the item is not shown.
        """
        cost = self._store.kpis.cumulative_cost_label
        self.cost_label.setText(f"{cost} cost" if cost else "")
        self.cost_label.setToolTip(
            f"Cost of this workspace's runs so far: {cost}. "
            "Reported by the model provider; an unpriced model reads n/a."
            if cost
            else "",
        )
        self.cost_label.setVisible(bool(cost))

    def resizeEvent(self, event: QResizeEvent) -> None:  # noqa: N802
        super().resizeEvent(event)
        self.path_label.setVisible(self.width() >= 1180)
        self.bg_label.setVisible(self.width() >= 1080)
