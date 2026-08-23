"""The reduced-motion gate (SWR-3723).

The design system ships one rule for motion that Qt has no equivalent for:
`prefers-reduced-motion` collapses every animation to instant. This module is
that rule as a gate. Every animated surface — the status-dot pulse, the toast
rise, the spinner, the toggle's knob travel — asks :func:`reduced_motion` before
it starts; a closed gate means the end state is painted directly.

Precedence is simple and testable:

1. a value stored in Settings (set through the Interface page, or by a test),
2. the platform's own reduced-motion setting where one can be detected
   (Windows only, for now),
3. motion on — a platform that does not expose the preference is not a reason
   to make the product worse for everyone on it.

The gate is a deliberate no-op on non-Windows platforms in this first pass:
macOS and Linux expose the preference through platform APIs that are easy to
get wrong from Python, and a wrong answer here silently animates a reader who
asked for stillness. That is recorded as a follow-up, not papered over.
"""

from __future__ import annotations

from typing import Final

from PySide6.QtCore import QSettings
from rotaris_core.reqtocode import SWR, traces

__all__ = ["reduced_motion", "set_reduced_motion"]

#: Where the preference lives, next to the theme name. A boolean; absent means
#: "the user has not said".
_SETTINGS_KEY: Final = "ui/reduced_motion"

_platform: bool | None = None
_stored: bool | None = None
_settings: QSettings | None = None


def _detect_platform() -> bool:
    """The platform's reduced-motion setting, where one is detectable."""
    import sys

    if sys.platform != "win32":
        # See the module docstring: undetectable is not the same as off, but it
        # is all this pass claims to support.
        return False
    import ctypes
    from ctypes import wintypes

    # SPI_GETCLIENTAREAANIMATION: "Turn off all window animations" in Windows'
    # Ease of Access settings. The user's own wording for the same request.
    spi_get_clientarea_animation = 0x1042
    animation = wintypes.BOOL()
    ctypes.windll.user32.SystemParametersInfoW(
        spi_get_clientarea_animation, 0, ctypes.byref(animation), 0
    )
    return not bool(animation.value)


def _read_stored() -> bool:
    """The Settings value, persisted on first read so later reads are free."""
    global _stored, _settings
    if _stored is None:
        if _settings is None:
            _settings = QSettings()
        value = _settings.value(_SETTINGS_KEY, None)
        _stored = False if value is None else bool(value)
    return _stored


@traces(SWR.SWR_3723)
def reduced_motion() -> bool:
    """Whether animation should be withheld right now.

    Read at animation start, never cached by the caller: the user flips the
    toggle in Settings and the next animation honours it without a relaunch.
    """
    if _stored is not None:
        return _stored
    global _platform
    if _platform is None:
        _platform = _detect_platform()
    return _platform


@traces(SWR.SWR_3723)
def set_reduced_motion(reduced: bool) -> None:
    """Set the preference and persist it; `None` is not a state, only absence."""
    global _stored, _settings
    _stored = bool(reduced)
    if _settings is None:
        _settings = QSettings()
    _settings.setValue(_SETTINGS_KEY, _stored)
