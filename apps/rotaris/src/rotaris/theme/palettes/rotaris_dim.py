"""Rotaris Dim — the shipped Rotaris design system.

A transcription of the design system's own token files, in the same units the
designer wrote them:

    tokens/colors.css  tokens/typography.css  tokens/spacing.css  tokens/effects.css

vendored for reference under ``docs/reference/rotaris-design-system/``. Where a
line here reads ``oklch(26.5% 0 0)``, the stylesheet reads ``oklch(26.5% 0 0)`` —
that is deliberate, and it is why :mod:`rotaris.theme.color` exists. A hex table
would have been faster to write and impossible to audit.

Three notes on what is *not* a direct transcription:

* **Ramps the design system only partly specifies.** `danger` and `info` ship
  three or four steps because that is all the web components needed. Qt needs
  more (a disabled danger border, a pressed danger fill), so the missing steps
  are filled along the same lightness curve the accent ramp uses —
  96/91/83/72/59/50/42/33/24 — at that hue's chroma. The specified steps are
  kept exactly and marked.
* **Surfaces Qt has and the web mockup did not.** `panel` and `track` name real
  Rotaris surfaces (the left column, the ground of a meter) that the HTML kit
  renders with a generic `surface`. They sit on the same neutral axis.
* **The terminal.** Sixteen ANSI colours are a palette in their own right, and
  a vendor default is not readable on this ground. They are re-derived on the
  three axes, and the accessibility test measures every one of them.
"""

from __future__ import annotations

from rotaris_core.reqtocode import SWR, traces

from rotaris.theme.a11y import raise_on
from rotaris.theme.color import Color, oklch
from rotaris.theme.palettes._scale import AA_BOUNDARY, AA_TEXT, step_clearing
from rotaris.theme.palettes._scale import LIGHTNESS as _LIGHTNESS
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


def _ramp(hue: float, chromas: tuple[float, ...]) -> Ramp:
    """A ramp at one hue with this system's own per-step chroma.

    The design system specifies chroma step by step rather than as a profile, so
    those numbers are kept literally here; only the lightness curve is shared
    (`palettes._scale.LIGHTNESS`).
    """
    return Ramp(
        *(oklch(light, chroma, hue) for light, chroma in zip(_LIGHTNESS, chromas, strict=True))
    )


# ── the three axes and the accent ─────────────────────────────────────────
#: Z — violet, hue 292. The brand accent, and the product's "done".
_ACCENT = _ramp(292, (0.030, 0.060, 0.100, 0.135, 0.160, 0.150, 0.125, 0.090, 0.058))
#: X — amber. The product's "waiting". The design system drifts the hue a
#: little down the ramp (92 → 78) so the dark steps do not go green; that drift
#: is in the source and is kept.
_AXIS_X = Ramp(
    oklch(0.96, 0.045, 92),
    oklch(0.90, 0.088, 90),
    oklch(0.82, 0.132, 88),
    oklch(0.74, 0.168, 87),
    oklch(0.67, 0.190, 86),
    oklch(0.57, 0.172, 84),
    oklch(0.46, 0.146, 82),
    oklch(0.34, 0.106, 80),
    oklch(0.23, 0.066, 78),
)
#: Y — teal. The product's "running".
_AXIS_Y = _ramp(165, (0.045, 0.088, 0.136, 0.172, 0.188, 0.168, 0.136, 0.100, 0.066))

# ── the two exceptions ────────────────────────────────────────────────────
# Outside the coordinate system deliberately: a failure is not a position, and
# neither is an aside. Steps 300/500/700/800 (danger) and 300/500/700 (info) are
# the design system's own; the rest fill the curve.
_DANGER = _ramp(25, (0.030, 0.070, 0.120, 0.170, 0.200, 0.190, 0.165, 0.115, 0.070))
_INFO = _ramp(210, (0.025, 0.050, 0.080, 0.108, 0.130, 0.118, 0.100, 0.072, 0.045))

#: The ground: true neutral, chroma 0 at every step. Never blue-tinted, never
#: sepia, never pure black — the design system is explicit about all three.
_NEUTRAL = _ramp(0, (0.0,) * 9)

_TEXT = oklch(0.94, 0, 0)
_TEXT_SECONDARY = oklch(0.80, 0, 0)
_TEXT_TERTIARY = oklch(0.68, 0, 0)


def _ansi(ground: Color) -> dict[str, Color]:
    """The sixteen ANSI colours, re-derived on this palette.

    A terminal is the densest text Rotaris shows, so every entry is lifted to
    clear the body floor against *ground* — raw xterm red does not, and neither
    does a mid-grey "bright black", which is exactly the colour tools use for
    the dimmed half of their output.

    ``black`` is exempt: it is a background a program selects, not a foreground,
    and lifting it would make a black-on-white run render grey-on-white.

    Names are pyte's, which are the names the escape sequences use.
    """
    palette = {
        "black": oklch(0.30, 0, 0),
        "red": _DANGER[300],
        "green": _AXIS_Y[300],
        "brown": _AXIS_X[300],
        "yellow": _AXIS_X[300],
        "blue": _ACCENT[300],
        "magenta": oklch(0.80, 0.110, 320),
        "cyan": _INFO[300],
        "white": _NEUTRAL[200],
        "brightblack": _NEUTRAL[500],
        "brightred": _DANGER[200],
        "brightgreen": _AXIS_Y[200],
        "brightbrown": _AXIS_X[200],
        "brightyellow": _AXIS_X[200],
        "brightblue": _ACCENT[200],
        "brightmagenta": oklch(0.88, 0.075, 320),
        "brightcyan": _INFO[200],
        "brightwhite": _NEUTRAL[100],
    }
    return {
        name: value if name == "black" else raise_on(value, ground, AA_TEXT)
        for name, value in palette.items()
    }


@traces(SWR.SWR_3700)
def build() -> Theme:
    """Construct the Rotaris Dim theme."""
    surface = oklch(0.25, 0, 0)
    hover = oklch(0.30, 0, 0)
    terminal_bg = oklch(0.16, 0, 0)
    accent_500 = _ACCENT[500]

    # Where the design system and Rotaris' accessibility contract disagree, the
    # contract wins by the smallest move available — one step up the ramp the
    # designer already drew, or the least lightening that clears the floor.
    # Each of these is a documented lift, not a re-colouring:
    #
    #   * this system's ground is still lighter than the palette Rotaris used
    #     before (21% vs ~13%), which compresses the contrast range above it;
    #   * the 500 steps are specified for fills, dots and chart strokes, which
    #     owe 3:1 — the design system paints tag *text* in the 200 and icon
    #     glyphs in the 300, never in the 500.
    def graphical(ramp: Ramp) -> Color:
        return step_clearing(ramp, surface, AA_BOUNDARY, start=500)

    def as_text(ramp: Ramp) -> Color:
        return step_clearing(ramp, surface, AA_TEXT, start=300)

    return Theme(
        name="rotaris-dim",
        label="Rotaris Dim",
        description=(
            "The Rotaris design system: a true-neutral dark ground with a violet "
            "accent and the amber/teal/violet coordinate system for run states."
        ),
        dark=True,
        color=ColorTokens(
            bg=oklch(0.21, 0, 0),
            surface=surface,
            surface_raised=oklch(0.29, 0, 0),
            chrome=oklch(0.23, 0, 0),
            # Not in the web kit: the left column sits between the ground and
            # the chrome so a panel reads as attached to the window rather than
            # floating on the page.
            panel=oklch(0.22, 0, 0),
            # A meter ground is a well, so it goes *below* the page ground.
            track=oklch(0.17, 0, 0),
            hover=hover,
            overlay=oklch(0.12, 0, 0, 0.72),
            border=oklch(0.31, 0, 0),
            # Lifted from the specified 40%: a boundary is drawn on the hover
            # fill too, not only on the page ground, and 40% does not clear 3:1
            # there. This is the lightness that clears it against the lightest
            # ground Rotaris draws a control's edge on.
            border_strong=raise_on(oklch(0.40, 0, 0), hover, AA_BOUNDARY),
            border_panel=oklch(0.28, 0, 0),
            divider=_TEXT.with_opacity(0.09),
            focus=oklch(0.83, 0.10, 292),
            text=_TEXT,
            text_secondary=_TEXT_SECONDARY,
            # The specified 68% clears the floor on this ground unaided — the
            # darker ground is what bought that. The lift stays because
            # "tertiary" is a hierarchy, not permission to go under the floor,
            # and the next retune of the ground must not quietly take it back.
            text_tertiary=raise_on(_TEXT_TERTIARY, surface, AA_TEXT),
            # Lifted from the specified 52% where it does not clear the disabled
            # fill. Disabled text still has a job: it has to say a control
            # exists and is not available. Text you cannot resolve at all says
            # the control is not there.
            text_disabled=raise_on(oklch(0.52, 0, 0), oklch(0.195, 0, 0), AA_BOUNDARY),
            disabled_surface=oklch(0.195, 0, 0),
            disabled_border=oklch(0.32, 0, 0),
            accent=_ACCENT,
            axis_x=_AXIS_X,
            axis_y=_AXIS_Y,
            # Z *is* the accent. Not a copy — the same ramp under its
            # coordinate name, so retuning the brand retunes "done" and the two
            # can never drift apart.
            axis_z=_ACCENT,
            danger=_DANGER,
            info=_INFO,
            neutral=_NEUTRAL,
            accent_tint_soft=accent_500.with_opacity(0.09),
            accent_tint=accent_500.with_opacity(0.13),
            accent_tint_strong=accent_500.with_opacity(0.18),
            run=graphical(_AXIS_Y),
            wait=graphical(_AXIS_X),
            done=graphical(_ACCENT),
            fail=graphical(_DANGER),
            info_state=graphical(_INFO),
            idle=raise_on(_NEUTRAL[600], surface, AA_BOUNDARY),
            run_text=as_text(_AXIS_Y),
            wait_text=as_text(_AXIS_X),
            done_text=as_text(_ACCENT),
            fail_text=as_text(_DANGER),
            info_text=as_text(_INFO),
            idle_text=raise_on(_NEUTRAL[600], surface, AA_TEXT),
            # A wash of the 500 under the 200 of the same hue. Danger takes the
            # 300 rather than the 200: at the 200 a failure tag goes pink, and
            # the one state that must never look decorative is that one.
            fill_accent=accent_500.with_opacity(0.17),
            fill_accent_ink=_ACCENT[200],
            fill_x=_AXIS_X[500].with_opacity(0.16),
            fill_x_ink=_AXIS_X[200],
            fill_y=_AXIS_Y[500].with_opacity(0.16),
            fill_y_ink=_AXIS_Y[200],
            fill_danger=_DANGER[500].with_opacity(0.16),
            fill_danger_ink=_DANGER[300],
            diff_add=_AXIS_Y[300],
            diff_add_bg=_AXIS_Y[500].with_opacity(0.10),
            diff_remove=_DANGER[300],
            diff_remove_bg=_DANGER[500].with_opacity(0.10),
            diff_meta=_INFO[300],
            # Built from the three axes plus their hue midpoints, and used in
            # order. Nothing invents a chart colour outside this set.
            viz=(
                _ACCENT[400],
                _AXIS_Y[400],
                _AXIS_X[400],
                oklch(0.75, 0.100, 205),
                oklch(0.74, 0.130, 125),
                oklch(0.73, 0.125, 350),
            ),
            viz_grid=_TEXT.with_opacity(0.10),
            terminal_bg=terminal_bg,
            terminal_fg=_NEUTRAL[200],
            terminal_cursor=_ACCENT[400],
            terminal_selection=_ACCENT[800],
            ansi=_ansi(terminal_bg),
            readable_ground=surface,
        ),
        space=Spacing(xs=4, sm=8, md=12, lg=16, xl=24, x2l=32, x3l=48, x4l=64, grid_unit=32),
        radius=Radii(sm=5, md=8, lg=14, pill=999, control=8),
        size=Sizing(
            control_height=32,
            control_height_compact=26,
            icon_button=30,
            nav_rail_width=68,
            nav_item_width=54,
            status_dot=6,
            toggle_width=32,
            toggle_height=18,
            ring_size=20,
            ring_thickness=3,
            scrollbar=6,
            focus_ring=2,
            hairline=1,
            title_bar_height=44,
            status_bar_height=26,
        ),
        type=Typography(
            # The design system's brand pair, exactly as `typography.css`
            # names it: Space Grotesk for display and section heads, Manrope
            # for body and UI, JetBrains Mono for every number and path. The
            # host faces behind them are fallbacks, not alternatives.
            display=css_stack(DISPLAY_FAMILIES),
            body=css_stack(BODY_FAMILIES),
            mono=css_stack(MONO_FAMILIES),
            display_families=DISPLAY_FAMILIES,
            body_families=BODY_FAMILIES,
            mono_families=MONO_FAMILIES,
            scale=TypeScale(
                x2s=10,
                xs=11,
                sm=12,
                base=14,
                md=16,
                h6=11,
                h5=16,
                h4=20,
                h3=24,
                h2=32,
                h1=44,
                kpi=26,
            ),
            weight_display=500,
            # Three weights, and only three: hierarchy comes from size, colour
            # and space, never from adding weight, and nothing goes above 500.
            weight_body=400,
            weight_strong=500,
            # em in the source; QFont expresses tracking as a percentage of the
            # glyph advance, so -0.022em is -2.2 and 0.075em is 7.5.
            tracking_tight=-2.2,
            tracking_wide=5.0,
            tracking_label=7.5,
            leading_tight=1.12,
            leading_body=1.62,
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
        # A card at rest is a hairline, not a shadow. Shadows are reserved for
        # things that actually float — dialogs, popovers, toasts.
        elevation_sm=Elevation(border=oklch(0.31, 0, 0), blur=0, offset_y=0, shadow=_TEXT),
        elevation_md=Elevation(
            border=oklch(0.31, 0, 0), blur=16, offset_y=6, shadow=oklch(0.08, 0, 0, 0.44)
        ),
        elevation_lg=Elevation(
            border=oklch(0.31, 0, 0), blur=40, offset_y=18, shadow=oklch(0.08, 0, 0, 0.54)
        ),
    )
