"""The token schema — what a Rotaris theme has to provide.

This module holds no values. It is the shape a palette fills in, split the way
the design system splits it (`tokens/colors.css`, `typography.css`,
`spacing.css`, `effects.css`) so the two can be read side by side.

Why a schema at all, when the app used to read module-level constants: a
constant is bound at import, and half of Rotaris paints itself in `paintEvent`
or builds a stylesheet in a class body. Those readings freeze whatever was
loaded first, so "switch the theme" quietly means "restart the app". A frozen
token object handed out by :func:`rotaris.theme.tokens` is re-read at each call,
which is what makes a live swap possible at all.

Every field is semantic, not literal. Nothing outside a palette says
"blurple" or "#9184d9"; a widget asks for `color.text_secondary` or
`space.md`, and the palette decides what that is. That is the whole
abstraction: adding a theme is writing one more palette, not touching one
widget.

Some of the design system is CSS that Qt has no equivalent for. Those are
translated rather than dropped, and the translation lives in the token type so
it is decided once:

* QSS has no `box-shadow`. :class:`Elevation` carries a border plus the blur,
  offset and colour of a `QGraphicsDropShadowEffect`.
* QSS ignores `letter-spacing` and `font-variant-numeric` — it accepts the
  declaration and does nothing. :class:`TypeStyle` keeps them as `QFont`
  settings, which do work.
* CSS easing is a cubic bezier; Qt wants a `QEasingCurve`. :class:`Motion`
  keeps the control points and builds the curve on request.
"""

from __future__ import annotations

from contextlib import suppress
from dataclasses import dataclass
from typing import TYPE_CHECKING, Final

from PySide6.QtCore import QEasingCurve, QPointF
from PySide6.QtGui import QFont
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from rotaris.theme.color import Color

__all__ = [
    "ColorTokens",
    "Elevation",
    "Motion",
    "MotionTokens",
    "Radii",
    "Ramp",
    "Sizing",
    "Spacing",
    "Theme",
    "TypeScale",
    "TypeStyle",
    "Typography",
]


@dataclass(frozen=True)
class Ramp:
    """One hue as the design system ships it: nine steps, lightest first.

    Indexable by the CSS step number (`ramp[600]`) so a palette and the
    stylesheet it came from can be compared line by line, and iterable so the
    contrast tests can sweep every step without naming them.
    """

    c100: Color
    c200: Color
    c300: Color
    c400: Color
    c500: Color
    c600: Color
    c700: Color
    c800: Color
    c900: Color

    @property
    def base(self) -> Color:
        """The step used when a caller just wants "the colour" — the 500."""
        return self.c500

    def __getitem__(self, step: int) -> Color:
        try:
            value: Color = getattr(self, f"c{step}")
        except AttributeError:
            raise KeyError(f"no step {step} in ramp (100–900 in hundreds)") from None
        return value

    def steps(self) -> tuple[Color, ...]:
        return tuple(self[step] for step in range(100, 1000, 100))


@dataclass(frozen=True)
class ColorTokens:
    """Every colour a Rotaris surface may paint.

    Grouped as the design system groups them: the ground and its boundaries,
    the text ramp, the brand accent, the three coordinate axes, the two
    exceptions that sit outside the axes, and the derived product aliases.
    """

    # ── ground ────────────────────────────────────────────────────────────
    bg: Color
    surface: Color
    surface_raised: Color
    chrome: Color
    panel: Color
    track: Color
    hover: Color
    overlay: Color

    # ── boundaries ────────────────────────────────────────────────────────
    border: Color
    border_strong: Color
    border_panel: Color
    divider: Color
    focus: Color

    # ── text ──────────────────────────────────────────────────────────────
    text: Color
    text_secondary: Color
    text_tertiary: Color
    text_disabled: Color

    # ── disabled controls ─────────────────────────────────────────────────
    disabled_surface: Color
    disabled_border: Color

    # ── ramps ─────────────────────────────────────────────────────────────
    accent: Ramp
    #: X — amber. The product reads it as "waiting".
    axis_x: Ramp
    #: Y — teal. The product reads it as "running".
    axis_y: Ramp
    #: Z — the brand accent under its coordinate name. The product reads it as
    #: "done", which is why `done` and `accent` are the same colour and neither
    #: is a copy of the other.
    axis_z: Ramp
    #: Outside the coordinate system on purpose: a failure is an exception, not
    #: a position.
    danger: Ramp
    info: Ramp
    neutral: Ramp

    # ── accent tints (hover and selection washes) ─────────────────────────
    accent_tint_soft: Color
    accent_tint: Color
    accent_tint_strong: Color

    # ── product state aliases, graphical ──────────────────────────────────
    #: A status dot, a ring segment, a chart stroke. These owe 3:1 as
    #: non-text contrast, which is what lets them sit at the ramp's saturated
    #: middle where the design system puts them.
    run: Color
    wait: Color
    done: Color
    fail: Color
    info_state: Color
    idle: Color

    # ── product state aliases, text ───────────────────────────────────────
    #: The same states painted as *words*. A label owes 4.5:1, and on a ground
    #: as light as this system's no single step satisfies both duties — which is
    #: why the design system itself paints a tag's text in the 200 or 300 step
    #: and never in the 500 it uses for the dot beside it. Splitting the roles is
    #: how that distinction survives being translated into tokens.
    run_text: Color
    wait_text: Color
    done_text: Color
    fail_text: Color
    info_text: Color
    idle_text: Color

    # ── pill fills ────────────────────────────────────────────────────────
    #: A tag's ground and the word on it. The design system paints these as a
    #: translucent wash of the hue's 500 step under light ink of the same hue —
    #: softer than the opaque 800 block it used to use, without going
    #: pastel-bright. The wash being translucent is the point: a tag picks up
    #: the card beneath it instead of punching a hole in it, which is also why
    #: the ink's contrast has to be resolved against the wash *over* a ground
    #: rather than against either one alone.
    fill_accent: Color
    fill_accent_ink: Color
    fill_x: Color
    fill_x_ink: Color
    fill_y: Color
    fill_y_ink: Color
    fill_danger: Color
    fill_danger_ink: Color

    # ── diff (Git view) ───────────────────────────────────────────────────
    diff_add: Color
    diff_add_bg: Color
    diff_remove: Color
    diff_remove_bg: Color
    diff_meta: Color

    # ── categorical data-viz ramp, used in order ──────────────────────────
    viz: tuple[Color, ...]
    viz_grid: Color

    # ── terminal ──────────────────────────────────────────────────────────
    terminal_bg: Color
    terminal_fg: Color
    terminal_cursor: Color
    terminal_selection: Color
    ansi: dict[str, Color]

    #: The lightest ground body text is painted on. Clearing the contrast floor
    #: against this clears it against every darker ground too, so the
    #: accessibility sweep has one number to check instead of five.
    readable_ground: Color


@dataclass(frozen=True)
class Spacing:
    """The 8px module. `grid_unit` is the motif's visible square."""

    xs: int
    sm: int
    md: int
    lg: int
    xl: int
    x2l: int
    x3l: int
    x4l: int
    grid_unit: int

    def __getitem__(self, steps: float) -> int:
        """`space[1.5]` — a multiple of the module, for a one-off gap."""
        return round(self.sm * steps)


@dataclass(frozen=True)
class Radii:
    sm: int
    md: int
    lg: int
    pill: int
    #: Buttons and inputs. The design system gives surfaces 6/10/16 and then
    #: rounds its controls at 8 — a control is smaller than a card and reads as
    #: over-rounded at the card's radius. Keeping it as its own token is what
    #: stops that 8 becoming a literal in the stylesheet.
    control: int


@dataclass(frozen=True)
class Sizing:
    """Fixed dimensions the design system pins rather than derives."""

    control_height: int
    control_height_compact: int
    icon_button: int
    nav_rail_width: int
    nav_item_width: int
    status_dot: int
    toggle_width: int
    toggle_height: int
    ring_size: int
    ring_thickness: int
    scrollbar: int
    focus_ring: int
    hairline: int


@dataclass(frozen=True)
class TypeStyle:
    """One named text style, complete enough to build a `QFont` from.

    `tracking` and `tabular` exist because QSS accepts `letter-spacing` and
    `font-variant-numeric` and then ignores both. A style that needs them has to
    reach the widget as a font, not as a stylesheet line.
    """

    family: str
    size: int
    weight: int = QFont.Weight.Normal
    #: Letter spacing in percent of the glyph advance, as `QFont` expresses it.
    #: The design system writes em (`0.1em`); 100% is one em, so `0.1em` is 10.
    tracking: float = 0.0
    #: Digits on a fixed advance, so a number that ticks upward does not make
    #: the row beside it dance.
    tabular: bool = False
    italic: bool = False

    def font(self) -> QFont:
        font = QFont(self.family)
        font.setPixelSize(self.size)
        font.setWeight(QFont.Weight(self.weight))
        font.setItalic(self.italic)
        if self.tracking:
            font.setLetterSpacing(QFont.SpacingType.PercentageSpacing, 100 + self.tracking)
        if self.tabular:
            # `QFont.Tag`, not the bare string the signature appears to allow:
            # PySide6 rejects a plain `str` at call time. Guarded because an
            # OpenType feature is an optimisation — a face without `tnum` should
            # render slightly ragged numbers, not fail to construct a font.
            with suppress(ValueError, TypeError):
                font.setFeature(QFont.Tag("tnum"), 1)
        return font


@dataclass(frozen=True)
class TypeScale:
    """Sizes in pixels, named as the design system names them."""

    x2s: int
    xs: int
    sm: int
    base: int
    md: int
    h6: int
    h5: int
    h4: int
    h3: int
    h2: int
    h1: int


#: The interface face, as Rotaris has always named it. The design system pairs a
#: brand display/body duo, and this application deliberately does not use it: the
#: faces were tried in the product and rejected as unreadable at the sizes an
#: operator actually reads here — ten- and eleven-pixel chips, dense table rows.
#: A design system decides what a face *has to do* (a display voice, a body
#: voice, a fixed grid); which face does it is the consuming product's call.
#:
#: Host-first on purpose. `Inter` if the machine has it, otherwise whatever the
#: platform calls its own UI face — the one it has hinted for small sizes.
#:
#: `Manrope` is the floor, not a choice. It sits *after* the generic
#: `sans-serif`, which every desktop with any fonts at all resolves, so a real
#: machine never reaches it. What it covers is the case with no host fonts
#: whatsoever: under Qt's `offscreen` platform `QFontDatabase` reports nothing,
#: and a stack that runs out there renders in whichever single face happens to
#: be registered — in practice the mono one, which is how a test suite and a
#: screenshot pipeline end up measuring and painting a monospaced interface.
UI_FAMILIES: Final[tuple[str, ...]] = (
    "Inter",
    "Segoe UI",
    "system-ui",
    "sans-serif",
    "Manrope",
)

#: The fixed-pitch face. The tail past `Consolas` is not thoroughness: Linux
#: desktops rarely ship any of the first four, and Qt answers a family it cannot
#: find by substituting silently — with a *proportional* face, which puts every
#: glyph off the terminal's fixed grid (SWR-2429). `JetBrains Mono` is bundled
#: (SWR-3703), so it is the one entry that cannot be missing. It sits behind
#: every face a host might have of its own — a machine with Cascadia Mono or
#: Menlo keeps the mono its user already knows — which makes it the floor rather
#: than the choice. Only the generic follows it, and a generic is a request.
MONO_FAMILIES: Final[tuple[str, ...]] = (
    "Cascadia Mono",
    "Cascadia Code",
    "Menlo",
    "Consolas",
    "DejaVu Sans Mono",
    "Liberation Mono",
    "Noto Sans Mono",
    "JetBrains Mono",
    "monospace",
)


def css_stack(families: tuple[str, ...]) -> str:
    """The families as a QSS `font-family` value, quoting the ones that need it.

    An unquoted family name containing a space is not a QSS parse error. It is a
    *different* family, one that does not exist, and Qt answers that by
    substituting a face nobody chose. Deriving the stylesheet string from the
    same tuple `QFont.setFamilies` is handed keeps the painted face and the
    measured face from disagreeing.
    """
    return ", ".join(name if " " not in name else f'"{name}"' for name in families)


@dataclass(frozen=True)
class Typography:
    #: Family *stacks*, comma-separated, for QSS `font-family`.
    display: str
    body: str
    mono: str
    #: The same faces as ordered lists, for `QFont.setFamilies` — a stylesheet
    #: family never reaches `QWidget.fontMetrics()`, so code that measures text
    #: (eliding, terminal cells) has to be given the families directly.
    display_families: tuple[str, ...]
    body_families: tuple[str, ...]
    mono_families: tuple[str, ...]
    scale: TypeScale
    weight_display: int
    weight_body: int
    weight_strong: int
    tracking_tight: float
    tracking_wide: float
    tracking_label: float
    leading_tight: float
    leading_body: float

    def mono_font(self, size: int, *, weight: int | None = None) -> QFont:
        """The mono face the stylesheet paints, as a measurable `QFont`."""
        font = QFont()
        font.setFamilies(list(self.mono_families))
        font.setPixelSize(size)
        font.setWeight(QFont.Weight(weight if weight is not None else self.weight_body))
        # Both matter for the terminal grid: the hint steers Qt's fallback
        # towards a fixed-pitch face, and fixed pitch keeps every advance equal
        # to the cell width.
        font.setStyleHint(QFont.StyleHint.Monospace)
        font.setFixedPitch(True)
        return font

    def body_font(self, size: int, *, weight: int | None = None) -> QFont:
        font = QFont()
        font.setFamilies(list(self.body_families))
        font.setPixelSize(size)
        font.setWeight(QFont.Weight(weight if weight is not None else self.weight_body))
        return font

    def display_font(self, size: int, *, weight: int | None = None) -> QFont:
        font = QFont()
        font.setFamilies(list(self.display_families))
        font.setPixelSize(size)
        font.setWeight(QFont.Weight(weight if weight is not None else self.weight_display))
        return font


@dataclass(frozen=True)
class Elevation:
    """One elevation step.

    The design system writes elevation as `box-shadow`, which QSS does not
    implement at all — not "implements differently", accepts and discards. So a
    step is split: the hairline becomes a real border in the stylesheet, and the
    ambient part becomes a `QGraphicsDropShadowEffect` a widget can attach.
    `blur == 0` means the step is border-only, which is the resting state of
    every card in this system.
    """

    border: Color
    blur: int
    offset_y: int
    shadow: Color

    @property
    def has_shadow(self) -> bool:
        return self.blur > 0


@dataclass(frozen=True)
class MotionTokens:
    """Durations in milliseconds; easings as cubic-bezier control points."""

    fast: int
    normal: int
    slow: int
    #: The distance a rising element travels — a toast, a tooltip.
    shift: int
    #: The one recurring animation in the product: a status dot breathing while
    #: its state is actively running.
    pulse: int
    ease: Motion
    ease_out: Motion
    ease_in: Motion


@dataclass(frozen=True)
class Motion:
    """A CSS cubic-bezier, as a `QEasingCurve`."""

    x1: float
    y1: float
    x2: float
    y2: float

    def curve(self) -> QEasingCurve:
        curve = QEasingCurve(QEasingCurve.Type.BezierSpline)
        curve.addCubicBezierSegment(
            QPointF(self.x1, self.y1), QPointF(self.x2, self.y2), QPointF(1.0, 1.0)
        )
        return curve


@dataclass(frozen=True)
@traces(SWR.SWR_3700)
class Theme:
    """A complete Rotaris theme: identity plus every token group.

    `name` is the persisted key, `label` is what a user reads in Settings, and
    `dark` tells Qt which way round to set its own palette so native pieces
    Rotaris does not style — a native file dialog, a context menu — do not
    arrive white in a dark app.
    """

    name: str
    label: str
    description: str
    dark: bool
    color: ColorTokens
    space: Spacing
    radius: Radii
    size: Sizing
    type: Typography
    motion: MotionTokens
    elevation_sm: Elevation
    elevation_md: Elevation
    elevation_lg: Elevation

    #: WCAG 2.2 AA for body text. Not a per-theme preference: a theme that
    #: cannot clear it is a broken theme, and the accessibility sweep says so.
    min_text_contrast: float = 4.5
    #: AA for large text and for the boundary of an interactive control.
    min_boundary_contrast: float = 3.0
