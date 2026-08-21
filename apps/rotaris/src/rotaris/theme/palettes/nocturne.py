"""Nocturne — the palette Rotaris shipped before the design system.

Kept, not archived. Two reasons, and neither is nostalgia:

* It makes the change **reversible**. A user who preferred the blue-violet
  ground picks it in Settings instead of pinning an old release.
* It makes the abstraction **true**. A token layer with one palette in it has
  not been shown to be a token layer at all; the second real palette is what
  proves no widget holds a value of its own.

Every colour below is the hex Nocturne shipped, read rather than re-authored —
this palette is a record of what was, so nothing here is "improved". What it
gains is the steps Qt needs and Nocturne never had: a hover, a pressed fill, a
disabled border. Those are derived from its own seeds
(:func:`palettes._scale.ramp_from_seed`), so they are the colours Nocturne
would have had, at the hue it already used.
"""

from __future__ import annotations

from rotaris_core.reqtocode import SWR, traces

from rotaris.theme.a11y import raise_on
from rotaris.theme.color import Color, hex_color
from rotaris.theme.palettes._scale import AA_BOUNDARY, AA_TEXT, ramp_from_seed
from rotaris.theme.spec import (
    MONO_FAMILIES,
    UI_FAMILIES,
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

_ACCENT = Ramp(
    hex_color("#f5f4ff"),
    hex_color("#e7e5fe"),
    hex_color("#d2cefd"),
    hex_color("#b5abfc"),
    hex_color("#968ae0"),
    hex_color("#7264bc"),
    hex_color("#5d5294"),
    hex_color("#423a6a"),
    hex_color("#2b2741"),
)
_NEUTRAL = Ramp(
    hex_color("#f3f5fe"),
    hex_color("#e4e7f5"),
    hex_color("#cfd3e5"),
    hex_color("#b2b6ca"),
    hex_color("#9397ab"),
    hex_color("#8a8fa5"),
    hex_color("#595d6c"),
    hex_color("#3f424d"),
    hex_color("#292b31"),
)

# Nocturne named one colour per state. The ramps around them are derived, so a
# Nocturne button can have a pressed fill without inventing a new hue.
_RUN = hex_color("#5fbf8d")
_WAIT = hex_color("#cbb26a")
_FAIL = hex_color("#d97b7b")
_INFO = hex_color("#7bbfd4")

_AXIS_Y = ramp_from_seed(_RUN)
_AXIS_X = ramp_from_seed(_WAIT)
_DANGER = ramp_from_seed(_FAIL)
_INFO_RAMP = ramp_from_seed(_INFO)

_SURFACE = hex_color("#232532")
_HOVER = hex_color("#282a38")
# Nocturne had no raised surface — dialogs sat on the same fill as cards. The
# schema needs one, and inventing a lightness for it is how its own invariant
# got broken: `border_strong` was chosen to clear 3:1 against every ground
# Nocturne drew a boundary on, and a ground Nocturne never had was not in that
# set. Interpolating between two surfaces that already clear it keeps the
# guarantee instead of re-deriving the border and changing a shipped colour.
_SURFACE_RAISED = _SURFACE.mix(_HOVER, 0.7)


def _ansi() -> dict[str, Color]:
    """Nocturne's own sixteen, tuned to its ground when it shipped."""
    return {
        "black": hex_color("#20222f"),
        "red": hex_color("#e08a8a"),
        "green": _RUN,
        "brown": _WAIT,
        "yellow": _WAIT,
        "blue": hex_color("#8ab4e0"),
        "magenta": hex_color("#c294dd"),
        "cyan": _INFO,
        "white": _NEUTRAL[200],
        "brightblack": _NEUTRAL[600],
        "brightred": hex_color("#f0a3a3"),
        "brightgreen": hex_color("#86d6ab"),
        "brightbrown": hex_color("#e0cd8f"),
        "brightyellow": hex_color("#e0cd8f"),
        "brightblue": hex_color("#a9cdf2"),
        "brightmagenta": hex_color("#d6b0ec"),
        "brightcyan": hex_color("#a3d8e8"),
        "brightwhite": _NEUTRAL[100],
    }


@traces(SWR.SWR_3700)
def build() -> Theme:
    """Construct the Nocturne theme."""
    accent_500 = hex_color("#9184d9")
    return Theme(
        name="nocturne",
        label="Nocturne",
        description=(
            "The palette Rotaris shipped before the design system: a cool "
            "blue-violet ground with a blurple accent."
        ),
        dark=True,
        color=ColorTokens(
            bg=hex_color("#161826"),
            surface=_SURFACE,
            surface_raised=_SURFACE_RAISED,
            chrome=hex_color("#1a1c2c"),
            panel=hex_color("#1c1e2d"),
            track=hex_color("#22242f"),
            hover=_HOVER,
            overlay=hex_color("#0b0c14").with_opacity(0.70),
            border=hex_color("#292b31"),
            # 3:1 against every ground an interactive boundary is drawn on,
            # including the lighter card surface and the hover fill — not only
            # against the page ground.
            border_strong=hex_color("#6e7388"),
            border_panel=hex_color("#33364a"),
            divider=hex_color("#e9e9ed").with_opacity(0.16),
            focus=hex_color("#d2cefd"),
            text=hex_color("#e9e9ed"),
            text_secondary=_NEUTRAL[400],
            # 4.5:1 against the card surface for small secondary text.
            text_tertiary=_NEUTRAL[600],
            text_disabled=hex_color("#737789"),
            disabled_surface=hex_color("#1b1d28"),
            disabled_border=hex_color("#3f424d"),
            accent=_ACCENT,
            axis_x=_AXIS_X,
            axis_y=_AXIS_Y,
            axis_z=_ACCENT,
            danger=_DANGER,
            info=_INFO_RAMP,
            neutral=_NEUTRAL,
            accent_tint_soft=accent_500.with_opacity(0.07),
            accent_tint=accent_500.with_opacity(0.10),
            accent_tint_strong=accent_500.with_opacity(0.14),
            run=_RUN,
            wait=_WAIT,
            done=accent_500,
            fail=_FAIL,
            info_state=_INFO,
            idle=raise_on(hex_color("#595d6c"), _SURFACE, AA_BOUNDARY),
            # Nocturne's ground is dark enough that its own state colours
            # already clear the text floor, so these lifts are no-ops and the
            # theme still paints the exact colours it shipped. They stay
            # wrapped anyway: the guarantee belongs to the token, not to a fact
            # about one palette that a future edit could quietly break.
            run_text=raise_on(_RUN, _SURFACE, AA_TEXT),
            wait_text=raise_on(_WAIT, _SURFACE, AA_TEXT),
            done_text=raise_on(accent_500, _SURFACE, AA_TEXT),
            fail_text=raise_on(_FAIL, _SURFACE, AA_TEXT),
            info_text=raise_on(_INFO, _SURFACE, AA_TEXT),
            idle_text=raise_on(hex_color("#595d6c"), _SURFACE, AA_TEXT),
            # The design system's pill fills, in Nocturne's own colours: a wash
            # of the state colour under light ink of the same hue. The ink is
            # not pre-lifted here — a wash is translucent, so only the surface
            # carrying it knows what the ink actually sits on.
            fill_accent=accent_500.with_opacity(0.24),
            fill_accent_ink=_ACCENT[200],
            fill_x=_WAIT.with_opacity(0.22),
            fill_x_ink=_AXIS_X[200],
            fill_y=_RUN.with_opacity(0.22),
            fill_y_ink=_AXIS_Y[200],
            fill_danger=_FAIL.with_opacity(0.22),
            fill_danger_ink=_DANGER[300],
            diff_add=_RUN,
            diff_add_bg=_RUN.with_opacity(0.10),
            diff_remove=_FAIL,
            diff_remove_bg=_FAIL.with_opacity(0.10),
            diff_meta=_INFO,
            viz=(
                _ACCENT[400],
                _AXIS_Y[400],
                _AXIS_X[400],
                _INFO_RAMP[400],
                _DANGER[400],
                _NEUTRAL[400],
            ),
            viz_grid=hex_color("#e9e9ed").with_opacity(0.10),
            terminal_bg=hex_color("#12131f"),
            terminal_fg=_NEUTRAL[200],
            terminal_cursor=_ACCENT[400],
            terminal_selection=hex_color("#3a3560"),
            ansi=_ansi(),
            readable_ground=_SURFACE,
        ),
        space=Spacing(xs=4, sm=8, md=12, lg=16, xl=24, x2l=32, x3l=48, x4l=64, grid_unit=32),
        # Nocturne's own radii — tighter than the design system's 6/10/16.
        radius=Radii(sm=4, md=8, lg=14, pill=999, control=6),
        size=Sizing(
            control_height=32,
            control_height_compact=24,
            icon_button=32,
            nav_rail_width=76,
            nav_item_width=60,
            status_dot=7,
            toggle_width=32,
            toggle_height=18,
            ring_size=20,
            ring_thickness=3,
            scrollbar=8,
            focus_ring=2,
            hairline=1,
        ),
        type=Typography(
            # `UI_FAMILIES` is exactly the stack Nocturne has always named; it
            # now says so once, in `spec`, so three palettes cannot drift into
            # three slightly different spellings of the same intent.
            display=css_stack(UI_FAMILIES),
            body=css_stack(UI_FAMILIES),
            mono=css_stack(MONO_FAMILIES),
            display_families=UI_FAMILIES,
            body_families=UI_FAMILIES,
            mono_families=MONO_FAMILIES,
            scale=TypeScale(
                x2s=10, xs=11, sm=12, base=13, md=15, h6=13, h5=15, h4=19, h3=24, h2=31, h1=42
            ),
            weight_display=600,
            weight_body=400,
            weight_strong=600,
            tracking_tight=-1.0,
            tracking_wide=5.0,
            tracking_label=8.0,
            leading_tight=1.15,
            leading_body=1.55,
        ),
        motion=MotionTokens(
            fast=100,
            normal=180,
            slow=260,
            shift=4,
            pulse=1600,
            ease=Motion(0.4, 0.0, 0.2, 1.0),
            ease_out=Motion(0.0, 0.0, 0.2, 1.0),
            ease_in=Motion(0.4, 0.0, 1.0, 1.0),
        ),
        elevation_sm=Elevation(
            border=hex_color("#292b31"), blur=0, offset_y=0, shadow=hex_color("#000000")
        ),
        elevation_md=Elevation(
            border=hex_color("#6e7388"),
            blur=20,
            offset_y=8,
            shadow=hex_color("#05060c").with_opacity(0.55),
        ),
        elevation_lg=Elevation(
            border=hex_color("#6e7388"),
            blur=44,
            offset_y=20,
            shadow=hex_color("#05060c").with_opacity(0.65),
        ),
    )
