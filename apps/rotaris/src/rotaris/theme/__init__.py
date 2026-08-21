"""Rotaris design tokens, themes, and the stylesheet built from them.

This package is the sole source of truth for every colour, spacing, radius,
size, font and motion value in the desktop app (SWR-2093, SWR-3700). No view or
widget may hold one of its own.

The shape, top to bottom:

* :mod:`~rotaris.theme.color` resolves the design system's OKLCH to something
  Qt can paint.
* :mod:`~rotaris.theme.spec` declares the token schema — the shape a theme has.
* :mod:`~rotaris.theme.palettes` holds the themes themselves, one module each.
* :mod:`~rotaris.theme.qss` builds the application stylesheet from a theme.
* :mod:`~rotaris.theme.manager` owns which theme is active and repaints the
  application when that changes.
* :mod:`~rotaris.theme.semantics` maps the engine's own vocabulary onto tokens.
* :mod:`~rotaris.theme.motif`, :mod:`~rotaris.theme.fonts` cover the parts of
  the design system Qt has no equivalent for.

Reading a token
---------------

One accessor, called where the value is used::

    from rotaris.theme import tokens

    def paintEvent(self, event):
        t = tokens()
        painter.fillRect(self.rect(), t.color.surface)

Call it **inside** the method that paints or restyles — never in a class body,
a module constant or a default argument. That is not style advice: a value
captured at import time is captured before the user has chosen a theme, and it
will still be showing the wrong palette after they choose another (SWR-3706).

Reacting to a change
--------------------

A widget styled purely by the application stylesheet needs nothing; the manager
repolishes it. A widget that holds presentation itself — an inline stylesheet,
a `QFont`, a colour cached for `paintEvent` — mixes in
:class:`~rotaris.theme.manager.Themed` and implements `apply_theme`.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from rotaris.theme import palettes
from rotaris.theme.a11y import raise_to_readable, readable_lightness
from rotaris.theme.color import (
    Color,
    contrast_ratio,
    hex_color,
    mix,
    oklch,
    relative_luminance,
    srgb,
    to_oklch,
)
from rotaris.theme.manager import (
    Themed,
    ThemeManager,
    build_palette,
    repolish,
    theme_manager,
)
from rotaris.theme.personas import (
    known_personas,
    persona_color,
    persona_display,
    persona_instance_color,
    shade_count,
)
from rotaris.theme.qss import ObjectStyle, build_qss, object_styles
from rotaris.theme.semantics import (
    delivery_color,
    evidence_color,
    health_color,
    state_color,
    terminal_color,
)
from rotaris.theme.spec import (
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
    TypeStyle,
    Typography,
)

if TYPE_CHECKING:
    from PySide6.QtGui import QFont

__all__ = [
    "Color",
    "ColorTokens",
    "Elevation",
    "Motion",
    "MotionTokens",
    "ObjectStyle",
    "Radii",
    "Ramp",
    "Sizing",
    "Spacing",
    "Theme",
    "ThemeManager",
    "Themed",
    "TypeScale",
    "TypeStyle",
    "Typography",
    "build_palette",
    "build_qss",
    "contrast_ratio",
    "delivery_color",
    "evidence_color",
    "health_color",
    "hex_color",
    "known_personas",
    "mix",
    "object_styles",
    "oklch",
    "palettes",
    "persona_color",
    "persona_display",
    "persona_instance_color",
    "raise_to_readable",
    "readable_lightness",
    "relative_luminance",
    "repolish",
    "shade_count",
    "srgb",
    "state_color",
    "terminal_color",
    "theme_manager",
    "to_oklch",
    "tokens",
]


def tokens() -> Theme:
    """The active theme's tokens.

    Cheap — the theme is already built and cached, so calling this per paint is
    the intended usage, not an optimisation to avoid.
    """
    return theme_manager().current


def set_theme(name: str) -> Theme:
    """Switch the active theme and repaint the application."""
    return theme_manager().set_theme(name)


def available_themes() -> tuple[Theme, ...]:
    """Every theme Rotaris can be switched to."""
    return palettes.available()


def mono_font(pixel_size: int) -> QFont:
    """The mono face the stylesheet paints, as a measurable `QFont`.

    A stylesheet `font-family` never reaches `QWidget.fontMetrics()`, so code
    that has to *measure* mono text — eliding to a fixed width, sizing a
    terminal cell — would otherwise measure against the proportional default and
    cut too much.
    """
    return tokens().type.mono_font(pixel_size)
