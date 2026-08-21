"""Colour arithmetic for the Rotaris design system.

The design system is authored in OKLCH (`tokens/colors.css`), a perceptual space
Qt cannot read: QSS understands `#rrggbb` and `rgba()`, and `QColor` understands
8-bit channels. So the ramps stay written the way the designer wrote them and are
resolved here, once, at theme construction.

Resolving rather than transcribing is the point. A hand-copied hex table drifts
the first time a ramp is retuned upstream, and the drift is invisible — every
value still *looks* like a colour. Keeping `oklch(59% 0.160 292)` in the palette
means the palette and the design system are the same text, and a re-sync is a
diff a reader can check.

Two consequences of that choice are handled here rather than left to callers:

* **Gamut.** OKLCH addresses colours sRGB cannot show. Naively clipping a
  channel shifts hue — a clipped amber turns green-ish. `_fit_to_srgb` instead
  holds lightness and hue and walks chroma down until the colour fits, which is
  what CSS Color 4 prescribes and what keeps a ramp reading as one hue.
* **Alpha.** Qt paints translucency through `QColor`, but QSS needs the literal
  text `rgba(...)`. `Color` is a `str` subclass carrying both, so one token works
  in an f-string stylesheet and in a `QPainter` call without conversion at the
  call site.
"""

from __future__ import annotations

import math
import re
from typing import Final

from PySide6.QtGui import QColor
from rotaris_core.reqtocode import SWR, traces

__all__ = [
    "Color",
    "contrast_ratio",
    "hex_color",
    "mix",
    "oklch",
    "relative_luminance",
    "srgb",
    "to_oklch",
]

# OKLab → linear sRGB. Ottosson's matrices; the inverse pair is not needed
# because nothing in Rotaris converts a painted colour back into OKLCH.
_LMS_FROM_OKLAB: Final = (
    (1.0, +0.3963377774, +0.2158037573),
    (1.0, -0.1055613458, -0.0638541728),
    (1.0, -0.0894841775, -1.2914855480),
)
_LINEAR_RGB_FROM_LMS: Final = (
    (+4.0767416621, -3.3077115913, +0.2309699292),
    (-1.2684380046, +2.6097574011, -0.3413193965),
    (-0.0041960863, -0.7034186147, +1.7076147010),
)

#: Chroma below this reads as grey, and a grey has no meaningful hue. Mixing
#: towards one would otherwise rotate the hue of a neutral towards its partner's
#: and tint the ground — the whole point of this system's ground is that it has
#: no tint (OKLCH chroma 0).
_ACHROMATIC: Final = 1e-4

_HEX_RE: Final = re.compile(r"^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")


class Color(str):
    """A resolved colour: QSS text, with the channels still attached.

    Subclasses `str` so a token drops straight into an f-string stylesheet —
    which is how every QSS fragment in this package is written — while
    `qcolor` serves the widgets that paint themselves. The string form is
    `#rrggbb` when opaque and `rgba(r, g, b, a)` when not, because those are the
    two spellings Qt's stylesheet parser accepts.
    """

    red: int
    green: int
    blue: int
    opacity: float

    def __new__(cls, red: int, green: int, blue: int, opacity: float = 1.0) -> Color:
        red, green, blue = (_clamp_channel(c) for c in (red, green, blue))
        opacity = min(1.0, max(0.0, opacity))
        if opacity >= 1.0:
            text = f"#{red:02x}{green:02x}{blue:02x}"
        else:
            text = f"rgba({red}, {green}, {blue}, {opacity:.4g})"
        self = super().__new__(cls, text)
        self.red, self.green, self.blue, self.opacity = red, green, blue, opacity
        return self

    @property
    def hex(self) -> str:
        """The opaque `#rrggbb` form, ignoring alpha.

        Some Qt surfaces take a colour but not a translucent one — a palette
        role, an SVG `fill` attribute in a rendered icon. They get the composite
        colour rather than a string Qt would silently fail to parse.
        """
        return f"#{self.red:02x}{self.green:02x}{self.blue:02x}"

    @property
    def qcolor(self) -> QColor:
        """The same colour as a `QColor`, for widgets that paint themselves."""
        return QColor(self.red, self.green, self.blue, round(self.opacity * 255))

    def with_opacity(self, opacity: float) -> Color:
        """This colour at a different alpha — the tint tokens are built this way."""
        return Color(self.red, self.green, self.blue, opacity)

    def mix(self, other: Color, weight: float) -> Color:
        """Blend perceptually towards *other*; `weight` is *other*'s share."""
        return mix(self, other, weight)

    def over(self, ground: Color) -> Color:
        """Flatten this colour onto an opaque *ground*.

        Contrast is a property of what a reader actually sees, so a translucent
        token has to be composited before it can be measured. Qt composites at
        paint time; the accessibility tests need the same answer beforehand.
        """
        if self.opacity >= 1.0:
            return self
        alpha = self.opacity
        return Color(
            round(self.red * alpha + ground.red * (1 - alpha)),
            round(self.green * alpha + ground.green * (1 - alpha)),
            round(self.blue * alpha + ground.blue * (1 - alpha)),
        )


def _clamp_channel(value: int) -> int:
    return 0 if value < 0 else 255 if value > 255 else value


def _to_linear(value: float) -> float:
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def _from_linear(value: float) -> float:
    return value * 12.92 if value <= 0.0031308 else 1.055 * (value ** (1 / 2.4)) - 0.055


def _oklab_to_linear_rgb(lightness: float, a: float, b: float) -> tuple[float, float, float]:
    lms = [row[0] * lightness + row[1] * a + row[2] * b for row in _LMS_FROM_OKLAB]
    cubed = [component**3 for component in lms]
    return tuple(  # type: ignore[return-value]
        sum(coefficient * value for coefficient, value in zip(row, cubed, strict=True))
        for row in _LINEAR_RGB_FROM_LMS
    )


def _in_gamut(linear: tuple[float, float, float]) -> bool:
    return all(-1e-4 <= channel <= 1 + 1e-4 for channel in linear)


def _fit_to_srgb(lightness: float, chroma: float, hue: float) -> tuple[float, float, float]:
    """Reduce chroma until the colour fits sRGB, holding lightness and hue.

    Clipping channels instead would be cheaper and wrong: it moves the hue, so a
    ramp built from one hue stops reading as one hue at the saturated end. Pure
    black and pure white are outside the search — no amount of chroma reduction
    rescues a lightness beyond the display's range, and bisecting towards one
    would spin for no reason.
    """
    radians = math.radians(hue)
    cos_hue, sin_hue = math.cos(radians), math.sin(radians)

    def linear_at(current_chroma: float) -> tuple[float, float, float]:
        return _oklab_to_linear_rgb(lightness, current_chroma * cos_hue, current_chroma * sin_hue)

    if _in_gamut(linear_at(chroma)):
        return linear_at(chroma)
    if lightness <= 0.0:
        return (0.0, 0.0, 0.0)
    if lightness >= 1.0:
        return (1.0, 1.0, 1.0)
    low, high = 0.0, chroma
    for _ in range(24):
        middle = (low + high) / 2
        if _in_gamut(linear_at(middle)):
            low = middle
        else:
            high = middle
    return linear_at(low)


@traces(SWR.SWR_3705)
def oklch(lightness: float, chroma: float, hue: float, opacity: float = 1.0) -> Color:
    """Resolve one OKLCH coordinate to a paintable sRGB colour.

    `lightness` is the 0–1 fraction the CSS percentage denotes, so
    `oklch(27% 0 0)` in the design system is `oklch(0.27, 0, 0)` here.
    """
    red, green, blue = (
        round(_from_linear(min(1.0, max(0.0, channel))) * 255)
        for channel in _fit_to_srgb(lightness, chroma, hue)
    )
    return Color(red, green, blue, opacity)


def srgb(red: int, green: int, blue: int, opacity: float = 1.0) -> Color:
    """A colour given directly in 8-bit sRGB, for values with no OKLCH source."""
    return Color(red, green, blue, opacity)


@traces(SWR.SWR_3705)
def hex_color(value: str, opacity: float = 1.0) -> Color:
    """Parse `#rgb` or `#rrggbb`.

    The legacy palette is written in hex — it predates the design system and is
    kept exactly as it shipped, so it is read rather than re-authored.
    """
    match = _HEX_RE.match(value.strip())
    if match is None:
        raise ValueError(f"not a hex colour: {value!r}")
    digits = match.group(1)
    if len(digits) == 3:
        digits = "".join(digit * 2 for digit in digits)
    red, green, blue = (int(digits[index : index + 2], 16) for index in (0, 2, 4))
    return Color(red, green, blue, opacity)


def to_oklch(color: Color) -> tuple[float, float, float]:
    linear = [_to_linear(channel / 255) for channel in (color.red, color.green, color.blue)]
    lms = [
        max(0.0, sum(c * v for c, v in zip(row, linear, strict=True))) ** (1 / 3)
        for row in _LINEAR_RGB_FROM_LMS_INVERSE
    ]
    lightness, a, b = (sum(c * v for c, v in zip(row, lms, strict=True)) for row in _OKLAB_FROM_LMS)
    return (lightness, math.hypot(a, b), math.degrees(math.atan2(b, a)) % 360)


_LINEAR_RGB_FROM_LMS_INVERSE: Final = (
    (0.4122214708, 0.5363325363, 0.0514459929),
    (0.2119034982, 0.6806995451, 0.1073969566),
    (0.0883024619, 0.2817188376, 0.6299787005),
)
_OKLAB_FROM_LMS: Final = (
    (+0.2104542553, +0.7936177850, -0.0040720468),
    (+1.9779984951, -2.4285922050, +0.4505937099),
    (+0.0259040371, +0.7827717662, -0.8086757660),
)


@traces(SWR.SWR_3705)
def mix(first: Color, second: Color, weight: float) -> Color:
    """`color-mix(in oklch, first, second weight%)`, as the stylesheets spell it.

    Hue takes the shorter arc, and a near-grey endpoint contributes no hue at
    all: mixing the neutral ground towards an accent must lighten it, not tint
    it, or the "true neutral, no hue" ground the design system insists on stops
    being neutral the first time something hovers.
    """
    weight = min(1.0, max(0.0, weight))
    first_l, first_c, first_h = to_oklch(first)
    second_l, second_c, second_h = to_oklch(second)

    lightness = first_l + (second_l - first_l) * weight
    chroma = first_c + (second_c - first_c) * weight
    if first_c < _ACHROMATIC:
        hue = second_h
    elif second_c < _ACHROMATIC:
        hue = first_h
    else:
        delta = (second_h - first_h + 540) % 360 - 180
        hue = (first_h + delta * weight) % 360
    opacity = first.opacity + (second.opacity - first.opacity) * weight
    return oklch(lightness, chroma, hue, opacity)


def as_color(value: Color | str) -> Color:
    """Accept a resolved token or the hex string one renders as.

    The accessibility resolver reads colours back out of live stylesheets, so
    what it has is text — `"#303030"`, not the `Color` that produced it. Coercing
    here rather than at each call site keeps the sweep measuring the same way the
    palette does, which is the only reason its numbers can be trusted against the
    palette's own.
    """
    return value if isinstance(value, Color) else hex_color(value)


def relative_luminance(color: Color | str) -> float:
    """Perceived brightness of an opaque colour, per WCAG 2.2."""
    resolved = as_color(color)
    red, green, blue = (
        _to_linear(channel / 255) for channel in (resolved.red, resolved.green, resolved.blue)
    )
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue


@traces(SWR.SWR_3705)
def contrast_ratio(foreground: Color | str, background: Color | str) -> float:
    """WCAG contrast, 1.0 (identical) to 21.0 (black on white).

    A translucent foreground is composited onto the background first: the ratio
    has to describe what a reader sees, and a reader never sees the unblended
    colour.
    """
    ground = as_color(background)
    first = relative_luminance(as_color(foreground).over(ground))
    second = relative_luminance(ground)
    lighter, darker = max(first, second), min(first, second)
    return (lighter + 0.05) / (darker + 0.05)
