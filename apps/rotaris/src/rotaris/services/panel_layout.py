"""Global, cross-restart storage for the sizes a user gives Rotaris' panes.

Pane sizes are a property of the person, not of the project: someone who widens
the workspace context sidebar to read their todos wants it wide in every
workspace they open. They are therefore kept in the same process-wide
``QSettings`` that already holds the desktop's other global preferences
(``interface/…``, ``display/…``), under a flat ``panels/<key>`` namespace rather
than the per-workspace ``workspaces/<path>/…`` one.

The service also keeps weak references to the splitters currently alive, which is
what lets "Reset panel sizes" (SWR-3012) act on the window the user is looking at
instead of only on the next launch.
"""

from __future__ import annotations

import weakref
from typing import TYPE_CHECKING

from PySide6.QtCore import QByteArray, QSettings
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from rotaris.widgets.splitter import PanelSplitter

__all__ = ["PANEL_GROUP", "PANEL_LAYOUT_VERSION", "PanelLayoutService", "panel_layout_service"]

#: Root ``QSettings`` group. Everything the service owns lives beneath it, so a
#: reset is one ``remove()`` rather than a key-by-key sweep.
PANEL_GROUP = "panels"

#: Bumped only to deliberately discard every stored size — a redesign that keeps
#: the same pane count would otherwise restore sizes that no longer make sense.
#: A layout that *changes* its pane count needs no bump: Qt's ``restoreState``
#: already refuses a state whose item count does not match.
PANEL_LAYOUT_VERSION = 1


@traces(SWR.SWR_3011, SWR.SWR_3012)
class PanelLayoutService:
    """Read, write, and reset splitter geometry for the whole application."""

    def __init__(self) -> None:
        # Weak, so a closed window's splitters leave on their own. A strong
        # registry here would keep every window ever opened alive for the sake
        # of a reset button.
        self._live: list[weakref.ref[PanelSplitter]] = []

    # ── registry ──────────────────────────────────────────────────────────

    def register(self, splitter: PanelSplitter) -> None:
        """Track ``splitter`` so a reset can restore it without a relaunch."""
        self._prune()
        self._live.append(weakref.ref(splitter))

    def live_splitters(self) -> list[PanelSplitter]:
        """Every registered splitter whose C++ object is still alive."""
        self._prune()
        alive: list[PanelSplitter] = []
        for reference in self._live:
            splitter = reference()
            if splitter is None:
                continue
            try:
                splitter.count()
            except RuntimeError:
                # PySide6 keeps the Python wrapper after Qt deletes the widget;
                # touching it raises rather than segfaulting, which is the only
                # reliable liveness test available here.
                continue
            alive.append(splitter)
        return alive

    def _prune(self) -> None:
        self._live = [reference for reference in self._live if reference() is not None]

    # ── persistence ───────────────────────────────────────────────────────

    def save(self, key: str, splitter: PanelSplitter) -> None:
        """Remember the sizes ``splitter`` currently shows."""
        settings = self._settings()
        settings.setValue(f"{PANEL_GROUP}/version", PANEL_LAYOUT_VERSION)
        settings.setValue(f"{PANEL_GROUP}/{key}/state", splitter.saveState())
        settings.setValue(f"{PANEL_GROUP}/{key}/panes", splitter.count())

    def restore(self, key: str, splitter: PanelSplitter) -> bool:
        """Apply the stored sizes for ``key``; report whether anything applied.

        Returns ``False`` — leaving the splitter on its defaults — when nothing
        is stored, when the store predates the current layout version, or when
        the pane count has changed since the sizes were written.
        """
        settings = self._settings()
        if self._as_int(settings.value(f"{PANEL_GROUP}/version", 0)) != PANEL_LAYOUT_VERSION:
            return False
        # Qt's own `restoreState` accepts a state written for a different number
        # of panes and quietly mis-assigns the sizes, so the count is stored
        # beside it and checked here.
        if self._as_int(settings.value(f"{PANEL_GROUP}/{key}/panes", 0)) != splitter.count():
            return False
        state = settings.value(f"{PANEL_GROUP}/{key}/state")
        if not isinstance(state, QByteArray) or state.isEmpty():
            return False
        return bool(splitter.restoreState(state))

    @staticmethod
    def _as_int(value: object) -> int:
        # A settings file is a text file a user can edit, and the native backend
        # hands integers back as strings: read defensively either way.
        try:
            return int(str(value))
        except (TypeError, ValueError):
            return 0

    def reset_all(self) -> None:
        """Discard every stored size and put the live panes back to default."""
        settings = self._settings()
        settings.remove(PANEL_GROUP)
        settings.sync()
        for splitter in self.live_splitters():
            splitter.apply_defaults()

    def _settings(self) -> QSettings:
        # Constructed per call, never cached: the test suite redirects
        # ``QSettings`` paths per test, and a settings object built at import
        # time would keep writing to whichever path won the race.
        return QSettings()


_SERVICE: PanelLayoutService | None = None


@traces(SWR.SWR_3011)
def panel_layout_service() -> PanelLayoutService:
    """The application-wide service, created on first use."""
    global _SERVICE
    if _SERVICE is None:
        _SERVICE = PanelLayoutService()
    return _SERVICE
