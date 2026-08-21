"""The faces carried inside the application (SWR-3703).

Qt's answer to a family it cannot find is not an error and not a blank: it
silently substitutes the closest thing it has, and the interface renders in a
face nobody chose. Bundling is how a face stops being a property of the host's
font directory.

Three faces ship, and they do not all ship for the same reason.

`JetBrains Mono` is load-bearing. The terminal (SWR-2429) paints on a fixed grid
whose cell width comes from the mono font's advance; hand it a proportional
fallback and every glyph lands somewhere other than its cell, so box drawing
tears and a progress bar crawls sideways as it fills. It sits *last* in
:data:`~rotaris.theme.spec.MONO_FAMILIES` — a host that has Cascadia Mono or
Menlo keeps the mono its user already knows — which makes it the floor rather
than the choice.

`Space Grotesk` and `Manrope` are the design system's brand pair, and no shipped
palette names them: tried in the product, they were rejected as unreadable at
the sizes an operator actually reads here. They stay bundled for two reasons.
A future palette may want them, and naming a face is the cheapest thing a theme
can do only if the face is guaranteed present. And under the `offscreen`
platform Qt reports *no* host families at all, so without a registered face the
test suite and the screenshot pipeline render windows with no text in them.

Registration is deliberately not load-bearing for launch. A face that will not
load is reported and skipped, the stacks fall through to the next family, and
Rotaris starts. An interface in the wrong face is a defect; an interface that
refuses to open is an outage.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Final

from PySide6.QtGui import QFontDatabase
from rotaris_core.reqtocode import SWR, traces

__all__ = ["FONT_DIR", "register_bundled_fonts", "registered_families"]

_log = logging.getLogger(__name__)

#: Resolved from this module's own location rather than the working directory or
#: an installed-package lookup, because both are wrong in one of the two ways
#: Rotaris runs. PyInstaller lays the package out under its extraction root the
#: same way it sits in the source tree, so a path anchored on ``__file__`` is the
#: single expression that holds for a checkout and for a frozen build.
FONT_DIR: Final[Path] = Path(__file__).resolve().parent.parent / "assets" / "fonts"

#: The extensions Qt can take from a file. The directory also holds each face's
#: licence, and handing a ``.txt`` to the font database would produce a failure
#: line in the log for a file that was never a font.
_FACE_SUFFIXES: Final[frozenset[str]] = frozenset({".ttf", ".otf", ".ttc"})

_registered: tuple[str, ...] = ()
#: Which directory the cache above describes. Keying the cache on the path
#: rather than on a bare "already ran" flag keeps the idempotence honest: the
#: second call for the same directory is free, and a call after the directory
#: has been repointed does the work again instead of returning a stale answer.
_registered_from: Path | None = None


@traces(SWR.SWR_3703)
def register_bundled_fonts() -> tuple[str, ...]:
    """Hand every bundled face to Qt; return the families it accepted, sorted.

    Safe to call more than once — Qt would happily register the same file twice
    and report the family twice — and safe to call when the assets are missing or
    damaged, which is the whole point: this runs before the first window, and
    nothing it can discover is a reason not to open one.
    """
    global _registered, _registered_from
    directory = FONT_DIR
    if _registered_from == directory:
        return _registered

    families: set[str] = set()
    if not directory.is_dir():
        _log.warning("no bundled fonts at %s; falling back to the host's families", directory)
    else:
        for path in sorted(directory.iterdir()):
            if path.suffix.lower() in _FACE_SUFFIXES:
                families.update(_register_face(path))

    _registered_from = directory
    _registered = tuple(sorted(families))
    return _registered


def registered_families() -> tuple[str, ...]:
    """The families the last registration produced, empty before it has run."""
    return _registered


def _register_face(path: Path) -> tuple[str, ...]:
    """Register one file, reporting rather than raising when Qt refuses it."""
    try:
        font_id = QFontDatabase.addApplicationFont(str(path))
    except Exception:
        # Reached when there is no QGuiApplication yet, or when the platform
        # font engine fails underneath Qt. Both are startup-order or host
        # problems that the caller cannot act on and must not die of.
        _log.exception("the font database refused %s", path.name)
        return ()
    if font_id < 0:
        _log.warning("%s is not a font Qt can read; skipping it", path.name)
        return ()
    families = tuple(QFontDatabase.applicationFontFamilies(font_id))
    if not families:
        _log.warning("%s registered but names no family; skipping it", path.name)
    return families
