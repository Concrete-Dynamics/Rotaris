"""Surfaces and the text that sits on them: cards, kickers, tags, buttons.

These are the design system's `.card`, `.card-kicker`, `.tag`, `.kpi-value` and
`.btn` as Qt widgets. The colour, size and spacing they paint with are read from
:func:`rotaris.theme.tokens` inside the method that paints, never captured when
the module is imported — a card built at startup outlives every theme the user
picks afterwards (SWR-3706).

Two of the design system's rules do not survive a stylesheet at all, and both
are silent: QSS accepts `letter-spacing`, `text-transform` and
`font-variant-numeric` and then ignores them. So the kicker uppercases its own
text and carries its tracking on a `QFont`, and the KPI value carries its
tabular figures the same way. A stylesheet spelling of either would look right
in the source and change nothing on screen.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from PySide6.QtCore import Qt
from PySide6.QtGui import QFont
from PySide6.QtWidgets import (
    QFrame,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QToolButton,
    QVBoxLayout,
    QWidget,
)
from rotaris_core.reqtocode import SWR, traces

from rotaris.theme import tokens
from rotaris.theme.a11y import raise_on
from rotaris.theme.manager import Themed
from rotaris.theme.motif import apply_elevation

if TYPE_CHECKING:
    from collections.abc import Callable

    from rotaris.models.state import ArtifactInfo
    from rotaris.theme.color import Color
    from rotaris.theme.spec import Elevation, Theme


@traces(SWR.SWR_3702)
class SectionLabel(Themed, QLabel):
    """The design system's `.card-kicker`: the small uppercase line above a body.

    Uppercasing happens here rather than in the stylesheet because QSS discards
    `text-transform`, and the tracking is set on a `QFont` because QSS discards
    `letter-spacing` too. That pair is the whole reason a kicker is a widget and
    not three declarations: written as CSS it renders as ordinary small text and
    nothing reports the loss.

    Everything else — colour, size, weight — comes from `QLabel#sectionLabel` in
    the application stylesheet, so the accessibility sweep can still resolve
    what this label is painted in without opening it.
    """

    def __init__(self, text: str, parent: QWidget | None = None) -> None:
        super().__init__(text.upper(), parent)
        self.setObjectName("sectionLabel")
        self.install_theme_hook()

    def setText(self, text: str) -> None:  # noqa: N802 — Qt's spelling
        """Set the kicker's text, uppercased no matter who set it."""
        super().setText(text.upper())

    def apply_theme(self, theme: Theme) -> None:
        type_ = theme.type
        font = type_.body_font(type_.scale.x2s, weight=type_.weight_strong)
        font.setLetterSpacing(QFont.SpacingType.PercentageSpacing, 100 + type_.tracking_label)
        self.setFont(font)


@traces(SWR.SWR_2093, SWR.SWR_3702)
class Card(Themed, QFrame):
    """The design system's `.card`: a surface with an optional kicker and title.

    The surface itself — ground, hairline, radius, the accent rule and the
    selected wash — belongs to `QFrame#card` in the application stylesheet, so a
    card holds no inline style of its own and follows a theme change by being
    repolished like anything else.

    `title` is the card's kicker line, which is what every call site has always
    passed it. Passing `kicker` as well promotes `title` to the design system's
    `.card-title`, the display-face heading that sits under the kicker.

    Subclassing
    -----------

    Two things bite a subclass author, both in the constructor:

    * `Card` already mixes in :class:`~rotaris.theme.manager.Themed`. Listing
      `Themed` again among a subclass's bases is not redundant, it is a
      `TypeError` at import — Python cannot order the two.
    * `Card.__init__` installs the theme hook, and installing it *calls*
      `apply_theme` once. A subclass override therefore runs before the
      subclass has built anything, so it has to survive its own widgets not
      existing yet and then restyle them once they do::

          def __init__(self, parent=None):
              super().__init__("Tokens", parent=parent)
              self.value = QLabel("—")
              self.apply_theme(tokens())      # not install_theme_hook() again

          def apply_theme(self, theme):
              super().apply_theme(theme)      # keeps the elevation following
              if not hasattr(self, "value"):
                  return
              ...

      The hook is installed last on purpose: the alternative is a card whose
      own presentation is never applied until the first theme change. The
      guard is the price, and a crash here reads as "the card is broken"
      rather than "the override ran early", which is why it is spelled out.
    """

    def __init__(
        self,
        title: str = "",
        *,
        kicker: str = "",
        accented: bool = False,
        parent: QWidget | None = None,
    ) -> None:
        super().__init__(parent)
        self.setObjectName("card")
        # The stylesheet paints a card through *both* doors on purpose. A pane
        # that renames its card to say what the card is for — `queueRunning`,
        # `reviewDecisions`, the blocker mount seam — used to lose the ground,
        # the hairline and the radius in the same keystroke, because
        # `QFrame#card` no longer matched anything. The property does not move
        # when the name does, so a card stays a card whatever it is called.
        self.setProperty("surface", "card")
        self.setProperty("accented", "true" if accented else "false")
        self._elevation = ""

        t = tokens()
        self.body = QVBoxLayout(self)
        self.body.setContentsMargins(t.space.lg, t.space.md, t.space.lg, t.space.md)
        self.body.setSpacing(t.space.sm)
        self.header_row = QHBoxLayout()
        self.header_row.setSpacing(t.space.md)

        # A card with only one line of header text has always shown it as the
        # kicker, so a lone `title` keeps meaning that; a card that wants both
        # names the kicker explicitly and gets the two-part header.
        kicker_text, title_text = (kicker, title) if kicker else (title, "")
        self.kicker_label = SectionLabel(kicker_text) if kicker_text else None
        if self.kicker_label is not None:
            self.header_row.addWidget(self.kicker_label)
        self.header_row.addStretch(1)
        self.body.addLayout(self.header_row)

        # Named for its stylesheet role rather than `title_label`, which
        # `EpicCard` in requirement_card.py already uses for its own heading.
        self.heading_label = QLabel(title_text) if title_text else None
        if self.heading_label is not None:
            self.heading_label.setObjectName("heading")
            self.heading_label.setWordWrap(True)
            self.body.addWidget(self.heading_label)

        self.install_theme_hook()

    def add_header_widget(self, widget: QWidget) -> None:
        self.header_row.addWidget(widget)

    def set_selected(self, selected: bool) -> None:
        self.setProperty("selected", "true" if selected else "false")
        self.style().unpolish(self)
        self.style().polish(self)

    @traces(SWR.SWR_3702)
    def set_elevation(self, elevation: str) -> None:
        """Lift the card off the page: `"sm"`, `"md"`, `"lg"`, or `""` to rest.

        In this system a shadow means the surface genuinely floats — a card that
        casts one reads as a dialog — so resting is the default and every card
        that stays put keeps its hairline and nothing else.
        """
        self._elevation = elevation
        self._apply_elevation(tokens())

    def apply_theme(self, theme: Theme) -> None:
        # Only the elevation: it is the one thing a card holds itself, because a
        # drop shadow carries a colour that Qt has already baked into an effect
        # object. Layout metrics stay as `__init__` set them, since a subclass
        # that tightened its own margins would otherwise lose them on a switch.
        self._apply_elevation(theme)

    def _apply_elevation(self, theme: Theme) -> None:
        step = _elevation_step(theme, self._elevation)
        # Cleared before it is re-attached, and left cleared for a resting card:
        # any graphics effect makes Qt render the widget through an offscreen
        # pixmap, which costs a buffer and softens the text drawn on it. Qt
        # documents `nullptr` as the way to remove one; only the PySide6 stub
        # disagrees.
        self.setGraphicsEffect(None)  # type: ignore[arg-type]
        if step is not None:
            apply_elevation(self, step)


def _elevation_step(theme: Theme, level: str) -> Elevation | None:
    steps = {"sm": theme.elevation_sm, "md": theme.elevation_md, "lg": theme.elevation_lg}
    return steps.get(level)


@traces(SWR.SWR_3702)
class Tag(Themed, QLabel):
    """The design system's `.tag`: an inline pill carrying one word of state.

    Variants are `accent`, `neutral`, `outline`, `run`, `wait`, `done` and
    `fail`; an unknown one falls back to `neutral` rather than raising, because a
    tag is decoration around text that already says what it means.

    A tag's text sits on the tag's own fill, not on the card behind it, so its
    contrast is resolved against that fill. Without that step a variant tuned on
    one theme's ground goes unreadable on the next, and the ramp steps the design
    system picks for a tag are close enough together that this is not
    hypothetical.
    """

    def __init__(self, text: str, kind: str = "neutral", parent: QWidget | None = None) -> None:
        super().__init__(text, parent)
        self.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._kind = kind
        self.install_theme_hook()

    @property
    def kind(self) -> str:
        """Which variant this tag currently paints."""
        return self._kind

    def set_kind(self, kind: str) -> None:
        """Restyle in place, for a tag whose meaning changes while it is on screen."""
        self._kind = kind
        self.apply_theme(tokens())

    def apply_theme(self, theme: Theme) -> None:
        fill, text, border = _tag_variant(theme, self._kind)
        # A transparent variant really does sit on whatever card carries it, and
        # `readable_ground` is the lightest of those — clearing it clears the
        # rest.
        ground = (
            theme.color.readable_ground if fill is None else fill.over(theme.color.readable_ground)
        )
        type_ = theme.type
        # 3px/10px is off the 8px module on purpose: a pill's inset follows the
        # cap height of the word inside it, not the layout grid around it.
        pad_y, pad_x = theme.space[0.375], theme.space[1.25]
        self.setStyleSheet(
            "QLabel {"
            f"background:{'transparent' if fill is None else fill};"
            f"color:{raise_on(text, ground, theme.min_text_contrast)};"
            f"border:{theme.size.hairline}px solid {'transparent' if border is None else border};"
            f"border-radius:{theme.radius.sm}px;"
            f"padding:{pad_y}px {pad_x}px;"
            f"font-size:{type_.scale.x2s}px;"
            f"font-weight:{type_.weight_strong};"
            "}"
        )


def _tag_variant(theme: Theme, kind: str) -> tuple[Color | None, Color, Color | None]:
    """One variant as (fill, text, border); `None` means transparent.

    The colours are the design system's own (`.tag-run` and friends): a `fill_*`
    wash, the `_ink` that belongs to it, and no boundary at all. The washes are
    translucent, so a tag now picks up the card beneath it rather than punching
    an opaque block into it — which is also why the fill is handed back rather
    than flattened here: only the caller knows what card it landed on. They are
    resolved per call, so the table cannot freeze at import.
    """
    color = theme.color
    variants: dict[str, tuple[Color | None, Color, Color | None]] = {
        "accent": (color.fill_accent, color.fill_accent_ink, None),
        "neutral": (color.hover, color.text, None),
        "outline": (None, color.text_secondary, color.border_strong),
        "run": (color.fill_y, color.fill_y_ink, None),
        "wait": (color.fill_x, color.fill_x_ink, None),
        # `done` *is* the accent under its coordinate name, so it wears the
        # accent's fill — the two can never drift apart.
        "done": (color.fill_accent, color.fill_accent_ink, None),
        "fail": (color.fill_danger, color.fill_danger_ink, None),
    }
    return variants.get(kind, variants["neutral"])


@traces(SWR.SWR_3702)
def make_button(
    text: str,
    variant: str = "secondary",
    parent: QWidget | None = None,
    *,
    compact: bool = False,
) -> QPushButton:
    """A `.btn` in one of the stylesheet's variants.

    `variant` is `primary`, `secondary`, `ghost`, `danger`, `warning` or `link`;
    `compact` is the design system's `.btn-compact`. Both are Qt properties and
    nothing more, because `QPushButton[variant=…]` in the application stylesheet
    is what actually paints them — a button that styled itself would need
    repolishing on every theme change and would drop out of the sweep that reads
    those rules.
    """
    button = QPushButton(text, parent)
    button.setProperty("variant", variant)
    button.setProperty("compact", "true" if compact else "false")
    button.setCursor(Qt.CursorShape.PointingHandCursor)
    return button


@traces(SWR.SWR_2124)
def make_availability_help(action: str, parent: QWidget | None = None) -> QToolButton:
    """Create an enabled explanation control for an unavailable action group."""
    help_button = QToolButton(parent)
    help_button.setText("?")
    help_button.setProperty("availabilityHelp", "true")
    help_button.setAccessibleName(f"Why {action} is unavailable")
    help_button.setToolTip("Why this action is unavailable")
    help_button.setCursor(Qt.CursorShape.PointingHandCursor)
    help_button.hide()
    return help_button


@traces(SWR.SWR_2124)
def set_action_availability(
    control: QWidget,
    *,
    enabled: bool,
    reason: str = "",
    help_button: QToolButton | None = None,
) -> None:
    """Synchronize control availability with discoverable reason metadata."""
    control.setEnabled(enabled)
    control.setProperty("availabilityReason", reason)
    control.setToolTip("" if enabled else reason)
    control.setAccessibleDescription("" if enabled else reason)
    if help_button is not None:
        help_button.setVisible(not enabled and bool(reason))
        help_button.setToolTip(reason)
        help_button.setAccessibleDescription(reason)


@traces(SWR.SWR_3702)
class KpiCard(Card):
    """Dashboard stat tile: kicker, `.kpi-value`, `.kpi-unit`, optional footer.

    The value is mono with tabular figures. Both have to travel on a `QFont` —
    QSS drops `font-variant-numeric`, and the application-wide `QWidget` rule
    would otherwise pull the label back to the body face — so the family and the
    size are declared twice, once on the font and once in this widget's own
    stylesheet, which is the only rule specific enough to outrank it.
    """

    def __init__(self, title: str, parent: QWidget | None = None) -> None:
        super().__init__(title, accented=True, parent=parent)
        row = QHBoxLayout()
        row.setSpacing(tokens().space.xs)
        self.value_label = QLabel("—")
        self.unit_label = QLabel("")
        row.addWidget(self.value_label)
        row.addWidget(self.unit_label, 0, Qt.AlignmentFlag.AlignBaseline)
        row.addStretch(1)
        self.body.addLayout(row)
        # `Card.__init__` already installed the hook and already called
        # `apply_theme` once, before these two labels existed.
        self.apply_theme(tokens())

    def set_value(self, value: str, unit: str = "") -> None:
        self.value_label.setText(value)
        self.unit_label.setText(unit)

    def apply_theme(self, theme: Theme) -> None:
        super().apply_theme(theme)
        if not hasattr(self, "value_label"):
            return
        type_ = theme.type
        font = type_.mono_font(type_.scale.h3)
        font.setFeature(QFont.Tag("tnum"), 1)
        self.value_label.setFont(font)
        self.value_label.setStyleSheet(
            f"font-family:{type_.mono};font-size:{type_.scale.h3}px;color:{theme.color.text};"
        )
        self.unit_label.setStyleSheet(
            f"font-size:{type_.scale.x2s}px;color:{theme.color.text_tertiary};"
        )


@traces(SWR.SWR_3702)
class _ArtifactLink(Themed, QLabel):
    """One artifact as a line of rich text: status glyph, linked title, producer.

    Rich text carries its colours inside the markup, so there is nothing for a
    repolish to recompute — the line has to be rebuilt from tokens on every theme
    change, which is why this is a widget rather than the plain `QLabel` the
    factory below used to return.
    """

    def __init__(self, info: ArtifactInfo, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._info = info
        self.setWordWrap(True)
        self.setTextInteractionFlags(Qt.TextInteractionFlag.TextBrowserInteraction)
        self.setToolTip(f"{info.slug} · {info.status} · click to inspect/edit")
        self.install_theme_hook()

    def apply_theme(self, theme: Theme) -> None:
        color, info = theme.color, self._info
        # The glyph is a filled dot and owes 3:1; the words beside it are words
        # and owe 4.5:1. Same state, two different tokens.
        glyph = "●" if info.ready else "○"
        glyph_color = color.run if info.ready else color.idle
        suffix = " · edited" if info.edited else ""
        self.setText(
            f'<span style="color:{glyph_color}">{glyph}</span> '
            f'<a href="{info.id}" style="color:{color.accent[300]};text-decoration:none;">'
            f"{info.title}</a> "
            f'<span style="color:{color.text_tertiary}">· {info.producer or info.persona}'
            f"{suffix}</span>"
        )
        self.setStyleSheet(f"font-size:{theme.type.scale.xs}px;color:{color.text_secondary};")


def artifact_link(info: ArtifactInfo, open_callback: Callable[[str], None]) -> QLabel:
    """Clickable one-line artifact row.

    ``open_callback`` receives the artifact id when the title is clicked.
    """
    label = _ArtifactLink(info)
    label.linkActivated.connect(open_callback)
    return label
