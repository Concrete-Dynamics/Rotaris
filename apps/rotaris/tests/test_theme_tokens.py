"""Every built-in theme is complete, ordered, and readable (SWR-3700, SWR-3705).

These are the tests that make "a theme" a thing with rules rather than a bag of
colours. They sweep *every* registered theme rather than naming one, so adding a
palette means satisfying the same contract, and a palette that cannot is caught
when it is written instead of when a user selects it.
"""

from __future__ import annotations

from dataclasses import fields

import pytest
from rotaris_core.reqtocode import SWR, verifies

from rotaris.theme import palettes
from rotaris.theme.color import (
    Color,
    contrast_ratio,
    hex_color,
    mix,
    oklch,
    to_oklch,
)
from rotaris.theme.spec import ColorTokens, Ramp, Theme

pytestmark = pytest.mark.unit

ALL_THEMES = [palettes.get(name) for name in palettes.names()]
THEME_IDS = [theme.name for theme in ALL_THEMES]


def _themes() -> list[Theme]:
    return ALL_THEMES


# ── the schema is filled in, by every palette ─────────────────────────────


@verifies(SWR.SWR_3700)
@pytest.mark.parametrize("theme", _themes(), ids=THEME_IDS)
def test_a_theme_fills_every_colour_token(theme: Theme) -> None:
    """Productive use: a user picks any theme and no surface is left unpainted.

    A missing token would be a crash at paint time in whichever view happened to
    use it first, which is a bug reported as "the Git view is broken on High
    Contrast" rather than as "the palette is incomplete".
    """
    for field in fields(ColorTokens):
        value = getattr(theme.color, field.name)
        assert value is not None, f"{theme.name} left {field.name} unset"
        if isinstance(value, Ramp):
            assert len(value.steps()) == 9
        elif field.name == "ansi":
            assert set(value) >= {"black", "red", "green", "blue", "white"}
        elif field.name == "viz":
            assert len(value) >= 6, "the categorical ramp needs six distinct series"
        else:
            assert isinstance(value, Color)


@verifies(SWR.SWR_3700)
@pytest.mark.parametrize("theme", _themes(), ids=THEME_IDS)
def test_a_theme_carries_its_identity_and_scales(theme: Theme) -> None:
    assert theme.name and theme.label and theme.description
    assert theme.space.grid_unit > 0
    assert theme.radius.sm <= theme.radius.md <= theme.radius.lg
    assert theme.size.control_height > theme.size.control_height_compact
    assert theme.type.mono_families[-1] == "monospace", (
        "the mono stack must end in a generic family or Qt can fall through to a "
        "proportional face, which breaks the terminal's fixed grid (SWR-2429)"
    )
    scale = theme.type.scale
    assert scale.x2s < scale.xs < scale.sm <= scale.base < scale.md
    assert scale.h6 <= scale.h5 < scale.h4 < scale.h3 < scale.h2 < scale.h1


@verifies(SWR.SWR_3700)
@pytest.mark.parametrize("theme", _themes(), ids=THEME_IDS)
def test_ramps_run_light_to_dark(theme: Theme) -> None:
    """A ramp's step number has to mean the same thing in every hue.

    Components ask for "the 600" without knowing which hue they will get, so a
    ramp that ran the other way would silently invert every fill built on it.
    """
    from rotaris.theme.color import relative_luminance

    for name in ("accent", "axis_x", "axis_y", "danger", "info", "neutral"):
        ramp: Ramp = getattr(theme.color, name)
        luminances = [relative_luminance(step) for step in ramp.steps()]
        assert luminances == sorted(luminances, reverse=True), (
            f"{theme.name}.{name} is not ordered lightest-first"
        )
        assert ramp.base is ramp[500]


@verifies(SWR.SWR_3700)
@pytest.mark.parametrize("theme", _themes(), ids=THEME_IDS)
def test_the_coordinate_system_is_a_property_of_the_palette(theme: Theme) -> None:
    """Run/wait/done are the Y/X/Z axes, not a convention repeated per view.

    The design system's one flourish is that its three axis colours *are* the
    product's three run states. If a palette could set them independently the
    flourish would be decoration; tying them here is what keeps it load-bearing.
    """
    color = theme.color
    assert color.axis_z is color.accent, "Z is the accent itself, not a copy of it"

    # Hue rather than identity: Nocturne predates the ramps and keeps the exact
    # single hex it shipped for each state, so its `run` is not literally a step
    # of the ramp derived around it. What has to hold in every palette is that
    # the state rides the right axis — wire `run` to X and this fails.
    for state, axis in (
        (color.run, color.axis_y),
        (color.run_text, color.axis_y),
        (color.wait, color.axis_x),
        (color.wait_text, color.axis_x),
        (color.done, color.axis_z),
        (color.done_text, color.axis_z),
    ):
        state_hue = to_oklch(state)[2]
        axis_hue = to_oklch(axis[500])[2]
        drift = abs(state_hue - axis_hue)
        assert min(drift, 360 - drift) < 25, (
            f"{theme.name}: {state} does not ride the axis it is supposed to"
        )


# ── the accessibility floors every theme owes ─────────────────────────────

_TEXT_ROLES = (
    "text",
    "text_secondary",
    "text_tertiary",
    "run_text",
    "wait_text",
    "done_text",
    "fail_text",
    "info_text",
    "idle_text",
)
_GRAPHICAL_ROLES = ("run", "wait", "done", "fail", "info_state", "idle")


@verifies(SWR.SWR_3700)
@pytest.mark.parametrize("theme", _themes(), ids=THEME_IDS)
def test_every_text_token_clears_the_body_floor(theme: Theme) -> None:
    """Productive use: a user reads a status word on a card without straining.

    Measured against the theme's own readable ground — the lightest surface text
    is painted on — because clearing that clears every darker one too.
    """
    ground = theme.color.readable_ground
    failures = {
        role: round(contrast_ratio(getattr(theme.color, role), ground), 2)
        for role in _TEXT_ROLES
        if contrast_ratio(getattr(theme.color, role), ground) < theme.min_text_contrast
    }
    assert not failures, f"{theme.name} text under {theme.min_text_contrast}:1 — {failures}"


@verifies(SWR.SWR_3700)
@pytest.mark.parametrize("theme", _themes(), ids=THEME_IDS)
def test_every_graphical_state_token_clears_the_non_text_floor(theme: Theme) -> None:
    """A status dot is a shape, so it owes 3:1 rather than 4.5:1 — but it owes it."""
    ground = theme.color.readable_ground
    failures = {
        role: round(contrast_ratio(getattr(theme.color, role), ground), 2)
        for role in _GRAPHICAL_ROLES
        if contrast_ratio(getattr(theme.color, role), ground) < theme.min_boundary_contrast
    }
    assert not failures, (
        f"{theme.name} indicators under {theme.min_boundary_contrast}:1 — {failures}"
    )


@verifies(SWR.SWR_3700)
@pytest.mark.parametrize("theme", _themes(), ids=THEME_IDS)
def test_an_interactive_boundary_is_visible_on_every_ground_it_is_drawn_on(
    theme: Theme,
) -> None:
    """Including the hover fill, which is the lightest and the easiest to forget.

    A control whose edge disappears on hover is not operable, whatever its label
    contrasts against.
    """
    color = theme.color
    for ground_name in ("bg", "surface", "surface_raised", "panel", "chrome", "hover"):
        ground = getattr(color, ground_name)
        ratio = contrast_ratio(color.border_strong, ground)
        assert ratio >= theme.min_boundary_contrast, (
            f"{theme.name}: border_strong is {ratio:.2f}:1 on {ground_name}"
        )


@verifies(SWR.SWR_3700)
@pytest.mark.parametrize("theme", _themes(), ids=THEME_IDS)
def test_the_terminal_palette_is_readable(theme: Theme) -> None:
    """A terminal is the densest text Rotaris shows; a vendor default is not safe here.

    ``black`` is excluded because it is a background a program selects, never a
    foreground Rotaris paints text in.
    """
    ground = theme.color.terminal_bg
    failures = {
        name: round(contrast_ratio(value, ground), 2)
        for name, value in theme.color.ansi.items()
        if name != "black" and contrast_ratio(value, ground) < theme.min_text_contrast
    }
    assert not failures, f"{theme.name} ANSI colours under the floor — {failures}"


@verifies(SWR.SWR_3700)
@pytest.mark.parametrize("theme", _themes(), ids=THEME_IDS)
def test_the_chart_ramp_is_distinguishable(theme: Theme) -> None:
    """Neighbouring series must not read as the same line."""
    from rotaris.theme.color import relative_luminance

    series = theme.color.viz
    assert len({str(color) for color in series}) == len(series)
    for first, second in zip(series, series[1:], strict=False):
        hue_gap = abs(to_oklch(first)[2] - to_oklch(second)[2])
        hue_gap = min(hue_gap, 360 - hue_gap)
        luminance_gap = abs(relative_luminance(first) - relative_luminance(second))
        assert hue_gap > 20 or luminance_gap > 0.10, (
            f"{theme.name}: {first} and {second} are too close to tell apart"
        )


# ── the colour engine (SWR-3705) ──────────────────────────────────────────


@verifies(SWR.SWR_3705)
@pytest.mark.parametrize(
    ("coordinate", "expected"),
    [
        # Reference conversions. Pure black and white pin the ends of the
        # lightness axis; the neutral mid-point pins the transfer curve; the
        # three primaries pin the matrices.
        ((0.0, 0.0, 0.0), "#000000"),
        ((1.0, 0.0, 0.0), "#ffffff"),
        # Not #777777: OKLab lightness for a grey is the cube root of relative
        # luminance, so L=0.5 is Y=0.125, which is sRGB 99 — a good deal darker
        # than the "50% grey" the number suggests.
        ((0.5, 0.0, 0.0), "#636363"),
        ((0.62796, 0.25768, 29.234), "#ff0000"),
        ((0.86644, 0.29483, 142.495), "#00ff00"),
        ((0.45201, 0.31321, 264.052), "#0000ff"),
    ],
)
def test_oklch_resolves_to_known_srgb(
    coordinate: tuple[float, float, float], expected: str
) -> None:
    resolved = oklch(*coordinate)
    for channel, reference in zip(
        (resolved.red, resolved.green, resolved.blue),
        (int(expected[i : i + 2], 16) for i in (1, 3, 5)),
        strict=True,
    ):
        assert abs(channel - reference) <= 1, f"{resolved} is not within one step of {expected}"


@verifies(SWR.SWR_3705)
def test_an_out_of_gamut_colour_keeps_its_hue() -> None:
    """Productive use: a designer pushes a ramp's chroma past what a display can show.

    Clipping channels would be cheaper and would rotate the hue — a clipped amber
    turns green — so a ramp built from one hue would stop reading as one hue at
    exactly the step meant to be its most saturated.
    """
    impossible = oklch(0.67, 0.40, 86)
    _, chroma, hue = to_oklch(impossible)

    assert chroma < 0.40, "an unreachable chroma must be reduced, not accepted"
    hue_drift = min(abs(hue - 86), 360 - abs(hue - 86))
    assert hue_drift < 3.0, f"hue moved {hue_drift:.1f}° while fitting to sRGB"
    assert 0 <= impossible.red <= 255


@verifies(SWR.SWR_3705)
def test_an_in_gamut_colour_is_left_alone() -> None:
    inside = oklch(0.59, 0.05, 252)
    lightness, chroma, _ = to_oklch(inside)
    assert abs(chroma - 0.05) < 0.005
    assert abs(lightness - 0.59) < 0.005


@verifies(SWR.SWR_3705)
def test_mix_returns_its_endpoints_exactly() -> None:
    first, second = hex_color("#204080"), hex_color("#c0a040")
    assert str(mix(first, second, 0.0)) == str(first)
    assert str(mix(first, second, 1.0)) == str(second)


@verifies(SWR.SWR_3705)
def test_mixing_a_neutral_towards_a_hue_does_not_tint_it_early() -> None:
    """The ground is chroma 0 on purpose; a hover must lighten it, not colour it.

    This is the rule that keeps "true neutral, no hue" true the first time
    something hovers — the whole character of the design system's ground.
    """
    neutral, accent = oklch(0.31, 0, 0), oklch(0.59, 0.16, 252)
    lifted = mix(neutral, accent, 0.10)
    _, chroma, _ = to_oklch(lifted)
    assert chroma < 0.03, f"a 10% mix already carries {chroma:.3f} chroma"


@verifies(SWR.SWR_3705)
def test_a_colour_is_both_stylesheet_text_and_a_qcolor() -> None:
    """One token has to work in an f-string stylesheet and in a QPainter call."""
    opaque = oklch(0.59, 0.16, 252)
    assert str(opaque).startswith("#") and len(str(opaque)) == 7
    assert opaque.qcolor.red() == opaque.red
    assert opaque.qcolor.alpha() == 255

    translucent = opaque.with_opacity(0.5)
    assert str(translucent).startswith("rgba("), "QSS cannot parse #AARRGGBB"
    assert translucent.qcolor.alpha() == 128
    assert translucent.hex == opaque.hex


@verifies(SWR.SWR_3705)
def test_contrast_is_measured_on_what_a_reader_actually_sees() -> None:
    """A translucent token is composited onto its ground before it is measured.

    Qt composites at paint time. A sweep that measured the uncomposited colour
    would report a tint as far more readable than it renders.
    """
    ground = oklch(0.31, 0, 0)
    solid = oklch(0.90, 0, 0)
    faint = solid.with_opacity(0.15)

    assert contrast_ratio(solid, ground) > contrast_ratio(faint, ground)
    assert contrast_ratio(faint, ground) == pytest.approx(
        contrast_ratio(faint.over(ground), ground)
    )


@verifies(SWR.SWR_3705)
@pytest.mark.parametrize("theme", _themes(), ids=THEME_IDS)
def test_no_resolved_colour_leaves_the_representable_range(theme: Theme) -> None:
    for field in fields(ColorTokens):
        value = getattr(theme.color, field.name)
        candidates = (
            value.steps()
            if isinstance(value, Ramp)
            else tuple(value.values())
            if isinstance(value, dict)
            else value
            if isinstance(value, tuple)
            else (value,)
        )
        for color in candidates:
            assert 0 <= color.red <= 255
            assert 0 <= color.green <= 255
            assert 0 <= color.blue <= 255
            assert 0.0 <= color.opacity <= 1.0
