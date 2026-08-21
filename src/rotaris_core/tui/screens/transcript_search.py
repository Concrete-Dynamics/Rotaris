"""Transcript search modal screen.

REQ-20260616-009f — provides a search overlay that filters
``SessionState.transcript_events`` by substring match and scrolls
the ``ChatPanel`` to the selected event.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, TypedDict, cast

from textual.binding import Binding
from textual.containers import Vertical
from textual.screen import ModalScreen
from textual.widgets import Input, ListItem, ListView, Static

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from textual.app import ComposeResult

    from rotaris_core.tui.app import RotarisTuiApp


class SearchIndexEntry(TypedDict):
    event_index: int
    role: str
    icon: str
    display: str
    searchable: str


_ROLE_ICONS: dict[str, str] = {
    "user": "🙂",
    "agent": "🤖",
    "tool": "🔧",
    "system": "⚙",
    "child": "👶",
    "thinking": "💭",
    "edit_diff": "📝",
}


def _display_text_from_event(event: dict[str, object], max_len: int = 100) -> str:
    """Build a short display string for a transcript event."""
    content = str(event.get("content", "") or "")
    name = str(event.get("name", "") or "")
    tool_name = str(event.get("tool_name", "") or "")
    reasoning = str(event.get("reasoning", "") or "")

    for candidate in (content, reasoning, tool_name):
        candidate = candidate.strip()
        if candidate:
            if len(candidate) > max_len:
                candidate = candidate[: max_len - 1] + "…"
            return candidate
    if name:
        return f"[{name}]"
    return "(empty)"


def _searchable_text_from_event(event: dict[str, object]) -> str:
    """Build a flat searchable string from a transcript event."""
    parts: list[str] = []
    for key in ("content", "reasoning", "name", "tool_name", "persona", "phase"):
        val = str(event.get(key, "") or "").strip()
        if val:
            parts.append(val)
    role = str(event.get("role", "") or "")
    if role:
        parts.append(role)
    return " ".join(parts)


@traces(SWR.SWR_1180)
class TranscriptSearchScreen(ModalScreen[None]):
    """Searchable transcript overlay.

    Pressing Enter on a result dismisses the screen and scrolls the
    transcript to the matching event. Escape dismisses without side effects.
    """

    BINDINGS = [
        Binding("escape", "dismiss_screen", "Close"),
    ]

    def __init__(self, app: RotarisTuiApp) -> None:
        super().__init__()
        self._app = app
        self._search_index: list[SearchIndexEntry] = []

    def compose(self) -> ComposeResult:
        with Vertical(id="transcript-search-container"):
            yield Input(placeholder="Search transcript…", id="transcript-search-input")
            yield Static("", id="transcript-search-status")
            yield ListView(id="transcript-search-results")

    def on_mount(self) -> None:
        self._build_search_index()
        self.query_one("#transcript-search-input", Input).focus()

    def _build_search_index(self) -> None:
        self._search_index.clear()
        session = self._app.current_session
        if session is None:
            return
        for idx, event in enumerate(session.transcript_events):
            typed_event = cast("dict[str, object]", event)
            role = str(event.get("role", ""))
            icon = _ROLE_ICONS.get(role, "📄")
            display = _display_text_from_event(typed_event)
            searchable = _searchable_text_from_event(typed_event)
            self._search_index.append(
                {
                    "event_index": idx,
                    "role": role,
                    "icon": icon,
                    "display": display,
                    "searchable": searchable,
                }
            )

    def _refresh_list(self, query: str) -> None:
        list_view = self.query_one("#transcript-search-results", ListView)
        status = self.query_one("#transcript-search-status", Static)
        list_view.clear()

        if not self._search_index:
            status.update("No transcript to search.")
            return

        q = query.strip().lower()
        if not q:
            status.update(f"{len(self._search_index)} events in transcript.")
            return

        matches = [entry for entry in self._search_index if q in str(entry["searchable"]).lower()]

        if not matches:
            status.update("No results.")
            return

        status.update(f"{len(matches)} match{'es' if len(matches) != 1 else ''}.")
        for entry in matches:
            label = f"{entry['icon']} [{entry['role']}] {entry['display']}"
            list_view.append(ListItem(Static(label)))

    def on_input_changed(self, event: Input.Changed) -> None:
        self._refresh_list(event.value)

    def on_list_view_selected(self, event: ListView.Selected) -> None:
        if not self._search_index:
            self.dismiss(None)
            return

        list_view = self.query_one("#transcript-search-results", ListView)
        visible_items = list_view.children
        if event.item not in visible_items:
            self.dismiss(None)
            return

        idx = visible_items.index(event.item)
        # Re-derive the full match list so we can resolve the correct event_index
        q = self.query_one("#transcript-search-input", Input).value.strip().lower()
        if not q:
            self.dismiss(None)
            return
        matches = [entry for entry in self._search_index if q in str(entry["searchable"]).lower()]
        if idx >= len(matches):
            self.dismiss(None)
            return

        event_index = matches[idx]["event_index"]
        self.dismiss(None)

        # Scroll the chat panel to the approximate position of the event
        try:
            from rotaris_core.tui.widgets.chat_panel import ChatPanel

            chat_panel = self._app.screen.query_one(ChatPanel)
            session = self._app.current_session
            if session and session.transcript_events:
                total = len(session.transcript_events)
                fraction = event_index / max(total - 1, 1)
                target_y = fraction * chat_panel.max_scroll_y
                chat_panel.scroll_to(y=target_y, animate=False)
        except Exception:
            pass

    def action_dismiss_screen(self) -> None:
        self.dismiss(None)
