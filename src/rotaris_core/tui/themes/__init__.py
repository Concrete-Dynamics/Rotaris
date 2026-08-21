from __future__ import annotations

from rotaris_core.tui.themes.base import Theme
from rotaris_core.tui.themes.dark import DARK
from rotaris_core.tui.themes.mono import MONO
from rotaris_core.tui.themes.tokyo_night import TOKYO_NIGHT

THEMES: dict[str, Theme] = {
    "mono": MONO,
    "tokyo-night": TOKYO_NIGHT,
    "dark": DARK,
}

_current: Theme = MONO


def get_theme() -> Theme:
    return _current


def set_theme(name: str) -> None:
    global _current
    if name not in THEMES:
        raise ValueError(f"Unknown theme: {name!r}. Available: {list(THEMES)}")
    _current = THEMES[name]


__all__ = ["THEMES", "Theme", "get_theme", "set_theme"]
