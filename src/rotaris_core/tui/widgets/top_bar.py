from __future__ import annotations

from typing import TYPE_CHECKING, Any

from rich.text import Text
from textual.containers import Horizontal
from textual.widgets import Static

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from textual.app import ComposeResult

    from rotaris_core.tui.palette import RenderPalette
    from rotaris_core.tui.view_model import FocusedAgentBadge


@traces(
    SWR.SWR_1246, SWR.SWR_1247, SWR.SWR_1248, SWR.SWR_1249, SWR.SWR_1250, SWR.SWR_1251, SWR.SWR_1428
)
class TopBar(Horizontal):
    _BADGE_STATE_CLASSES = (
        "-none",
        "-running",
        "-waiting",
        "-succeeded",
        "-failed",
        "-cancelled",
    )

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self.title_text = ""
        self.version_text = ""
        self.focus_badge_text = "No agent selected"
        self.focus_badge_state = "none"

    def compose(self) -> ComposeResult:
        yield Static(id="top-bar-title")
        yield Static(self.focus_badge_text, id="top-bar-focus")
        yield Static(id="top-bar-version")

    def on_mount(self) -> None:
        from rotaris_core import __version__

        self.title_text = self.app.title or "Rotaris"
        self.version_text = f"v{__version__}"

        self.query_one("#top-bar-title", Static).update(self.title_text)
        self.update_focus_badge(None)
        self.query_one("#top-bar-version", Static).update(self.version_text)

    def update_focus_badge(self, badge: FocusedAgentBadge | None) -> None:
        from rotaris_core.tui.palette import RenderPalette
        from rotaris_core.tui.themes import get_theme

        p = RenderPalette.from_theme(get_theme())
        if badge is None:
            text = "No agent selected"
            state = "none"
            style = p.fg_dim
        else:
            text = badge.text
            state = self._badge_class_state(badge.state)
            style = self._badge_style(state, p)

        self.focus_badge_text = text
        self.focus_badge_state = state
        focus = self.query_one("#top-bar-focus", Static)
        for state_class in self._BADGE_STATE_CLASSES:
            focus.set_class(False, state_class)
        focus.set_class(True, f"-{state}")
        focus.update(Text(text, style=style))

    def _badge_class_state(self, state: str) -> str:
        mapping = {
            "running": "running",
            "queued": "waiting",
            "waiting_on_dependencies": "waiting",
            "summarizing": "running",
            "succeeded": "succeeded",
            "failed": "failed",
            "cancelled": "cancelled",
            "blocked": "cancelled",
        }
        return mapping.get(state, "none")

    def _badge_style(self, state: str, palette: RenderPalette) -> str:
        p = palette
        if state == "running":
            return f"bold {p.green}"
        if state == "waiting":
            return f"bold {p.yellow}"
        if state == "succeeded":
            return f"bold {p.blue}"
        if state == "failed":
            return f"bold {p.red}"
        if state == "cancelled":
            return f"bold {p.purple}"
        return p.fg_dim
