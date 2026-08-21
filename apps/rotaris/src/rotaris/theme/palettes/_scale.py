"""The shape every Rotaris ramp climbs.

One lightness curve and one chroma profile, shared by every palette. That is
what makes "the 600 step" mean the same thing whether the hue is amber, teal or
violet — so a component can ask for a step without knowing which hue the theme
will hand it.

The numbers are read off the design system's accent ramp, which is the one it
specifies in full; the others in that file follow it closely enough that the
difference is not visible on screen.
"""

from __future__ import annotations

from rotaris_core.reqtocode import SWR, traces

from rotaris.theme.color import Color, contrast_ratio, oklch, to_oklch
from rotaris.theme.spec import Ramp

__all__ = [
    "AA_BOUNDARY",
    "AA_TEXT",
    "LIGHTNESS",
    "ramp_from_seed",
    "ramp_of_hue",
    "step_clearing",
]

#: Lightness at each step, lightest first. Nine steps, 100 through 900.
LIGHTNESS: tuple[float, ...] = (0.96, 0.91, 0.83, 0.72, 0.59, 0.50, 0.42, 0.33, 0.24)

#: WCAG 2.2 AA. Body text, and everything else a user has to be able to make
#: out — a control's boundary, a status dot, a chart line.
AA_TEXT = 4.5
AA_BOUNDARY = 3.0

#: Chroma at each step as a fraction of the ramp's peak. Colour is strongest in
#: the middle and drains towards both ends: a 100 is nearly white and a 900 is
#: nearly the ground, and neither can hold much chroma without leaving sRGB.
_CHROMA_PROFILE: tuple[float, ...] = (0.19, 0.38, 0.63, 0.84, 1.00, 0.94, 0.78, 0.56, 0.36)


@traces(SWR.SWR_3700)
def ramp_of_hue(hue: float, peak_chroma: float) -> Ramp:
    """A full ramp at one hue, peaking at `peak_chroma` on the 500 step."""
    return Ramp(
        *(
            oklch(lightness, peak_chroma * profile, hue)
            for lightness, profile in zip(LIGHTNESS, _CHROMA_PROFILE, strict=True)
        )
    )


def step_clearing(ramp: Ramp, ground: Color, floor: float, *, start: int = 500) -> Color:
    """The first step from *start* upward that clears *floor* on *ground*.

    The design system specifies a ramp; Rotaris specifies a contrast floor. Where
    they disagree this resolves it the smallest possible way — by moving one step
    lighter, staying inside the ramp the designer drew, rather than by inventing
    a colour or by lowering the floor.

    Which step a role lands on is therefore a property of the theme's own ground,
    which is the point: the same rule gives Nocturne its 500 and High Contrast
    its 300 without either palette having to know about the other.
    """
    for step in range(start, 0, -100):
        candidate = ramp[step]
        if contrast_ratio(candidate, ground) >= floor:
            return candidate
    return ramp[100]


def ramp_from_seed(seed: Color) -> Ramp:
    """A full ramp built around one existing colour.

    Used by palettes that predate this system and shipped a single hex per
    meaning rather than a ramp. The seed's hue is kept and its chroma becomes
    the peak, so the ramp is recognisably the colour the palette already had —
    the legacy theme still looks like itself, it just gained the steps Qt needs
    for a hover, a pressed fill and a disabled border.
    """
    _, chroma, hue = to_oklch(seed)
    return ramp_of_hue(hue, chroma)
