from __future__ import annotations

from typing import TYPE_CHECKING, Any

from rich.text import Text
from textual.widgets import Static

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.tui.themes import get_theme

if TYPE_CHECKING:
    from rich.console import RenderableType

_FRAMES = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"


@traces(SWR.SWR_1215)
class SpinnerWidget(Static):
    def __init__(self, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._active = False
        self._frame = 0
        self._session_id: str | None = None

    def on_mount(self) -> None:
        # 10 Hz is plenty for a braille spinner and halves the wakeups
        # vs. the previous 12.5 Hz (0.08s) cadence. The tick is gated by
        # ``_active`` so an idle TUI does not refresh at all.
        self.set_interval(0.1, self._tick)

    def _tick(self) -> None:
        if not self._active:
            return
        self._frame = (self._frame + 1) % len(_FRAMES)
        self.refresh()

    def set_active(self, active: bool) -> None:
        if active == self._active:
            return
        self._active = active
        if not active:
            self._frame = 0
        self.refresh()

    def set_session_id(self, session_id: str | None) -> None:
        if session_id == self._session_id:
            return
        self._session_id = session_id
        self.refresh()

    def render(self) -> RenderableType:
        if not self._active:
            return Text("")
        t = get_theme()
        text = Text()
        text.append(f" {_FRAMES[self._frame]} ", style=f"bold {t.green}")
        text.append("running", style=t.fg_dim)
        if self._session_id:
            text.append(f" ({self._session_id})", style=t.fg_dim)
        return text
