"""The theme registry.

Adding a theme to Rotaris is adding one module beside these three and one line
to `_BUILDERS`. Nothing else in the application changes — that is the claim
SWR-3700 makes, and this file is where it is either true or not.

Themes are built lazily and then cached. Building one resolves a few hundred
OKLCH coordinates, which is fast but not free, and the palettes a user never
selects should not cost anything at startup.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Final

from rotaris.theme.palettes import high_contrast, nocturne, rotaris_dim

if TYPE_CHECKING:
    from collections.abc import Callable

    from rotaris.theme.spec import Theme

__all__ = ["DEFAULT_THEME", "available", "get", "names"]

#: What Rotaris paints itself in when nothing says otherwise.
DEFAULT_THEME: Final = "rotaris-dim"

_BUILDERS: Final[dict[str, Callable[[], Theme]]] = {
    "rotaris-dim": rotaris_dim.build,
    "nocturne": nocturne.build,
    "high-contrast": high_contrast.build,
}

_CACHE: dict[str, Theme] = {}


def names() -> tuple[str, ...]:
    """Every built-in theme key, in the order Settings should offer them."""
    return tuple(_BUILDERS)


def get(name: str) -> Theme:
    """The theme called *name*, or the default if there is no such theme.

    Degrading rather than raising is deliberate. The only caller that passes an
    unknown name is the config layer replaying a preference written by an older
    or newer Rotaris, and refusing to start over a stale string in a settings
    file would be a worse failure than quietly painting the default.
    """
    key = name if name in _BUILDERS else DEFAULT_THEME
    cached = _CACHE.get(key)
    if cached is None:
        cached = _CACHE[key] = _BUILDERS[key]()
    return cached


def available() -> tuple[Theme, ...]:
    """Every built-in theme, built. For Settings, which shows all of them."""
    return tuple(get(name) for name in _BUILDERS)
