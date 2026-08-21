"""Keeping a derived colour readable, whatever theme derived it.

Rotaris generates colours it did not author: a shade per concurrent agent
instance, a chart series beyond the categorical ramp, a hover tint. Each one has
to clear the same floor a hand-picked token does, and "looks fine on the dark
theme" is not a check — High Contrast has a different ground, and Nocturne's is
different again.

The rule this module encodes, and the reason it is a rule: **derive upward**.
On a dark ground the readable band runs from the mid-tones towards white, so a
*darker* shade of a mid-tone token falls under 4.5:1 rather than gaining
contrast. Shading downwards is how instance labels once reached 2.1:1 — invisible
to exactly the readers who need contrast, and those labels are how someone
follows a delegated run.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces

from rotaris.theme.color import contrast_ratio, oklch, to_oklch

if TYPE_CHECKING:
    from rotaris.theme.color import Color
    from rotaris.theme.spec import Theme

__all__ = ["contrast_ratio", "raise_on", "raise_to_readable", "readable_lightness"]

#: Above this a colour is effectively white and climbing further buys nothing.
_MAX_LIGHTNESS = 0.97


def readable_lightness(hue: float, chroma: float, ground: Color, floor: float) -> float:
    """The lowest OKLCH lightness at which this hue clears *floor* on *ground*.

    Bisected rather than tabulated because the answer moves with chroma, and
    every caller here is changing chroma. Luminance rises monotonically with
    lightness at a fixed hue and chroma, so there is exactly one crossing and
    bisection finds it.
    """
    low, high = 0.0, 1.0
    for _ in range(18):
        middle = (low + high) / 2
        if contrast_ratio(oklch(middle, chroma, hue), ground) >= floor:
            high = middle
        else:
            low = middle
    return high


def raise_on(color: Color, ground: Color, floor: float) -> Color:
    """Lift *color* until it clears *floor* on *ground*.

    Hue and chroma are preserved: the colour still identifies whatever it
    identified. Only its lightness moves, and only upward — a colour that
    already clears the floor is returned untouched, so this is safe to wrap
    around a value that is already correct.
    """
    if contrast_ratio(color, ground) >= floor:
        return color
    lightness, chroma, hue = to_oklch(color)
    needed = readable_lightness(hue, chroma, ground, floor)
    return oklch(min(_MAX_LIGHTNESS, max(lightness, needed)), chroma, hue, color.opacity)


@traces(SWR.SWR_3700)
def raise_to_readable(color: Color, theme: Theme, *, floor: float | None = None) -> Color:
    """Lift *color* until it clears the theme's text floor on its readable ground."""
    return raise_on(
        color,
        theme.color.readable_ground,
        theme.min_text_contrast if floor is None else floor,
    )
