"""Where the chosen theme is remembered (SWR-3701).

A separate service for one string looks like ceremony until you notice what it
buys: :class:`~rotaris.theme.manager.ThemeManager` takes a callback rather than
importing this, so the theme package can be tested with no `QSettings`, no
application, and no desktop at all. "What Rotaris paints itself in" and "where
Rotaris keeps preferences" are genuinely different concerns, and the token layer
is the one that has to stay portable.

It shares the ``QSettings`` the desktop's other global preferences already live
in — panel sizes (SWR-3011) among them — so a user's appearance choices are in
one place rather than in a file of their own.
"""

from __future__ import annotations

from PySide6.QtCore import QSettings
from rotaris_core.reqtocode import SWR, traces

from rotaris.theme import palettes, theme_manager

__all__ = ["SETTINGS_KEY", "install_theme_persistence", "read_theme_preference"]

#: Under the same root group the rest of the desktop's preferences use, so a
#: settings file stays readable by a human looking for why the app opened the
#: way it did.
SETTINGS_KEY = "appearance/theme"


@traces(SWR.SWR_3701)
def read_theme_preference() -> str:
    """The stored theme name, or the default when there is none.

    Never validates against the registry: resolving an unknown name is
    :func:`rotaris.theme.palettes.get`'s job and it degrades to the default
    there. Checking twice would mean two places to keep in step, and the one
    that got missed would be the one that raised.
    """
    stored = QSettings().value(SETTINGS_KEY, "")
    return stored if isinstance(stored, str) and stored else palettes.DEFAULT_THEME


@traces(SWR.SWR_3701)
def write_theme_preference(name: str) -> None:
    settings = QSettings()
    settings.setValue(SETTINGS_KEY, name)
    # Rotaris is a long-running app that people close by closing the window, and
    # an unsynced preference is one that silently did not take.
    settings.sync()


@traces(SWR.SWR_3701)
def install_theme_persistence() -> str:
    """Restore the stored theme and keep writing every later choice.

    Called once, before the first window. Restoring deliberately does not write
    back: a machine that could not resolve the stored name would otherwise
    overwrite the user's choice with the default, and it would never return.
    """
    manager = theme_manager()
    manager.set_persistence(write_theme_preference)
    return manager.restore(read_theme_preference()).name
