"""High Contrast — the design system, pushed apart for readers AA does not serve.

4.5:1 is a floor, not a target. It is the point below which text is considered
inaccessible, and a palette that sits just above it is legible to most people and
tiring for the rest. This theme is the same brand — the same three axes, the same
violet accent, the same type — with the distances opened up:

* the ground drops towards black and the text climbs towards white, so body text
  lands near 13:1 rather than near 7:1;
* boundaries are drawn at a lightness that reads as a line rather than a hint,
  because a control whose edge you cannot find is not operable regardless of
  what its label contrasts against;
* the accent moves *up* its ramp. On a darker ground the readable band runs
  towards white, so the design system's 500 would lose contrast here, not gain
  it;
* the focus ring is thicker, because focus is the one cue that has to survive
  every other visual difference between users.

It is not a separate design language. Anything that reads a token gets this for
free, which is the point of the token layer.
"""

from __future__ import annotations

from rotaris_core.reqtocode import SWR, traces

from rotaris.theme.color import Color, oklch
from rotaris.theme.palettes._scale import ramp_of_hue
from rotaris.theme.spec import (
    BODY_FAMILIES,
    DISPLAY_FAMILIES,
    MONO_FAMILIES,
    ColorTokens,
    Elevation,
    Motion,
    MotionTokens,
    Radii,
    Ramp,
    Sizing,
    Spacing,
    Theme,
    TypeScale,
    Typography,
    css_stack,
)

__all__ = ["build"]

# Same hues as the design system, higher chroma: on a near-black ground a
# desaturated hue reads as grey, and the three axes have to stay tellable apart
# for the reader who most needs them to be.
_ACCENT = ramp_of_hue(292, 0.185)
_AXIS_X = ramp_of_hue(87, 0.200)
_AXIS_Y = ramp_of_hue(165, 0.200)
_DANGER = ramp_of_hue(25, 0.215)
_INFO = ramp_of_hue(210, 0.150)
_NEUTRAL = Ramp(
    oklch(0.99, 0, 0),
    oklch(0.95, 0, 0),
    oklch(0.88, 0, 0),
    oklch(0.78, 0, 0),
    oklch(0.66, 0, 0),
    oklch(0.55, 0, 0),
    oklch(0.44, 0, 0),
    oklch(0.32, 0, 0),
    oklch(0.20, 0, 0),
)

_SURFACE = oklch(0.20, 0, 0)
_TEXT = oklch(0.98, 0, 0)


def _ansi() -> dict[str, Color]:
    """Sixteen ANSI colours at the 200 step: a terminal is the densest text here."""
    return {
        "black": oklch(0.28, 0, 0),
        "red": _DANGER[200],
        "green": _AXIS_Y[200],
        "brown": _AXIS_X[200],
        "yellow": _AXIS_X[200],
        "blue": _ACCENT[200],
        "magenta": oklch(0.88, 0.100, 320),
        "cyan": _INFO[200],
        "white": _NEUTRAL[100],
        "brightblack": _NEUTRAL[400],
        "brightred": _DANGER[100],
        "brightgreen": _AXIS_Y[100],
        "brightbrown": _AXIS_X[100],
        "brightyellow": _AXIS_X[100],
        "brightblue": _ACCENT[100],
        "brightmagenta": oklch(0.95, 0.055, 320),
        "brightcyan": _INFO[100],
        "brightwhite": oklch(1.0, 0, 0),
    }


@traces(SWR.SWR_3700)
def build() -> Theme:
    """Construct the High Contrast theme."""
    return Theme(
        name="high-contrast",
        label="High contrast",
        description=(
            "The Rotaris design system with the ground, text and boundaries "
            "pushed well past the AA floor, for readers that floor does not serve."
        ),
        dark=True,
        color=ColorTokens(
            bg=oklch(0.15, 0, 0),
            surface=_SURFACE,
            surface_raised=oklch(0.25, 0, 0),
            chrome=oklch(0.17, 0, 0),
            panel=oklch(0.16, 0, 0),
            track=oklch(0.11, 0, 0),
            hover=oklch(0.32, 0, 0),
            overlay=oklch(0.05, 0, 0, 0.85),
            # A boundary here is a line, not a hint: 0.62 against a 0.20 surface
            # clears 3:1 with room, and the strong variant clears it against the
            # hover fill too.
            border=oklch(0.52, 0, 0),
            border_strong=oklch(0.72, 0, 0),
            border_panel=oklch(0.48, 0, 0),
            divider=_TEXT.with_opacity(0.34),
            focus=oklch(0.95, 0.09, 292),
            text=_TEXT,
            text_secondary=oklch(0.88, 0, 0),
            # Even the quietest text clears 7:1 here. "Tertiary" means less
            # important, not harder to read.
            text_tertiary=oklch(0.78, 0, 0),
            text_disabled=oklch(0.60, 0, 0),
            disabled_surface=oklch(0.18, 0, 0),
            disabled_border=oklch(0.45, 0, 0),
            accent=_ACCENT,
            axis_x=_AXIS_X,
            axis_y=_AXIS_Y,
            axis_z=_ACCENT,
            danger=_DANGER,
            info=_INFO,
            neutral=_NEUTRAL,
            accent_tint_soft=_ACCENT[400].with_opacity(0.16),
            accent_tint=_ACCENT[400].with_opacity(0.24),
            accent_tint_strong=_ACCENT[400].with_opacity(0.34),
            # The 300 step, not the 500: on this ground the readable band runs
            # upward, so the design system's mid-step would be darker here, not
            # louder.
            run=_AXIS_Y[300],
            wait=_AXIS_X[300],
            done=_ACCENT[300],
            fail=_DANGER[300],
            info_state=_INFO[300],
            idle=_NEUTRAL[400],
            # This theme is already at the 300 step for the same reason the
            # text roles need one, so the two coincide here. They are still
            # separate tokens: a component asks for the role it means, and the
            # palette decides whether that is one colour or two.
            run_text=_AXIS_Y[300],
            wait_text=_AXIS_X[300],
            done_text=_ACCENT[300],
            fail_text=_DANGER[300],
            info_text=_INFO[300],
            idle_text=_NEUTRAL[300],
            # Heavier than the dim theme's wash and lighter in the ink, for the
            # same reason every other token here departs from the design
            # system: a translucent pill that merely tints its card is the one
            # thing a high-contrast theme may not ship.
            fill_accent=_ACCENT[400].with_opacity(0.34),
            fill_accent_ink=_ACCENT[200],
            fill_x=_AXIS_X[500].with_opacity(0.34),
            fill_x_ink=_AXIS_X[200],
            fill_y=_AXIS_Y[500].with_opacity(0.34),
            fill_y_ink=_AXIS_Y[200],
            fill_danger=_DANGER[500].with_opacity(0.34),
            fill_danger_ink=_DANGER[200],
            diff_add=_AXIS_Y[200],
            diff_add_bg=_AXIS_Y[500].with_opacity(0.22),
            diff_remove=_DANGER[200],
            diff_remove_bg=_DANGER[500].with_opacity(0.22),
            diff_meta=_INFO[200],
            viz=(
                _ACCENT[300],
                _AXIS_Y[300],
                _AXIS_X[300],
                oklch(0.82, 0.120, 205),
                oklch(0.83, 0.150, 125),
                oklch(0.82, 0.145, 350),
            ),
            viz_grid=_TEXT.with_opacity(0.24),
            terminal_bg=oklch(0.10, 0, 0),
            terminal_fg=oklch(0.95, 0, 0),
            terminal_cursor=_ACCENT[200],
            terminal_selection=_ACCENT[700],
            ansi=_ansi(),
            readable_ground=oklch(0.25, 0, 0),
        ),
        space=Spacing(xs=4, sm=8, md=12, lg=16, xl=24, x2l=32, x3l=48, x4l=64, grid_unit=32),
        radius=Radii(sm=5, md=8, lg=14, pill=999, control=8),
        size=Sizing(
            # Geometry is shared with every palette so a theme switch never
            # reflows a window. Three tokens keep their accessibility delta —
            # a larger dot, a wider scrollbar and a thicker focus ring — for
            # the same reason the weights stay heavy: they are this palette's
            # contrast budget, not decoration.
            control_height=32,
            control_height_compact=26,
            icon_button=30,
            nav_rail_width=68,
            nav_item_width=54,
            status_dot=9,
            toggle_width=32,
            toggle_height=18,
            ring_size=20,
            ring_thickness=3,
            scrollbar=12,
            focus_ring=3,
            hairline=1,
            title_bar_height=44,
            status_bar_height=28,
        ),
        type=Typography(
            # The brand faces lead in every palette; this theme separates
            # itself by weight and contrast, not by typeface.
            display=css_stack(DISPLAY_FAMILIES),
            body=css_stack(BODY_FAMILIES),
            mono=css_stack(MONO_FAMILIES),
            display_families=DISPLAY_FAMILIES,
            body_families=BODY_FAMILIES,
            mono_families=MONO_FAMILIES,
            # One step up across the scale. Size is the cheapest legibility gain
            # there is, and the layouts already hold at 1000×680 with it.
            scale=TypeScale(
                x2s=11,
                xs=12,
                sm=14,
                base=15,
                md=17,
                h6=14,
                h5=17,
                h4=21,
                h3=26,
                h2=34,
                h1=47,
                kpi=27,
            ),
            weight_display=700,
            weight_body=600,
            weight_strong=800,
            tracking_tight=-1.0,
            tracking_wide=6.0,
            tracking_label=10.0,
            leading_tight=1.2,
            leading_body=1.65,
        ),
        motion=MotionTokens(
            fast=90,
            normal=160,
            slow=240,
            shift=3,
            pulse=1600,
            ease=Motion(0.4, 0.0, 0.2, 1.0),
            ease_out=Motion(0.0, 0.0, 0.2, 1.0),
            ease_in=Motion(0.4, 0.0, 1.0, 1.0),
        ),
        elevation_sm=Elevation(border=oklch(0.52, 0, 0), blur=0, offset_y=0, shadow=_TEXT),
        elevation_md=Elevation(
            border=oklch(0.72, 0, 0), blur=16, offset_y=6, shadow=oklch(0.02, 0, 0, 0.75)
        ),
        elevation_lg=Elevation(
            border=oklch(0.72, 0, 0), blur=40, offset_y=18, shadow=oklch(0.02, 0, 0, 0.85)
        ),
    )
