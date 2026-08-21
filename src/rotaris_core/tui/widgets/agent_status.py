from __future__ import annotations

import datetime as dt
import time
from typing import TYPE_CHECKING, Any, ClassVar, cast

from rich.console import Group
from rich.text import Text
from textual.binding import Binding
from textual.containers import VerticalScroll
from textual.widgets import Static

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.tui.palette import BRAILLE_FRAMES, RenderPalette
from rotaris_core.tui.themes import get_theme

if TYPE_CHECKING:
    from rich.console import RenderableType
    from textual.binding import BindingType
    from textual.events import Click, Key
    from textual.timer import Timer

    from rotaris_core.tui.app import RotarisTuiApp

_MAX_VISIBLE = 5
_ELLIPSIS_ABOVE = 2
_ELLIPSIS_BELOW = 3
_MAX_INDENT_DEPTH = 6
_ACTIVITY_SECTION_RATIO = 3
_FALLBACK_ACTIVITY_LINES = 3


def _parse_datetime(value: object) -> dt.datetime | None:
    if isinstance(value, dt.datetime):
        parsed = value
    elif isinstance(value, str):
        raw = value.strip()
        if not raw:
            return None
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        try:
            parsed = dt.datetime.fromisoformat(raw)
        except ValueError:
            return None
    else:
        return None

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=dt.UTC)
    return parsed.astimezone(dt.UTC)


def _sort_timestamp_key(value: object) -> tuple[int, float]:
    parsed = _parse_datetime(value)
    if parsed is not None:
        return (0, -parsed.timestamp())
    if isinstance(value, int | float):
        return (1, -float(value))
    return (2, 0.0)


def _elapsed_seconds(started_at: object, completed_at: object) -> float | None:
    if started_at is None:
        return None
    if isinstance(started_at, int | float):
        start = float(started_at)
        if isinstance(completed_at, int | float):
            return max(0.0, float(completed_at) - start)
        return max(0.0, time.monotonic() - start)

    start_dt = _parse_datetime(started_at)
    if start_dt is None:
        return None

    end_dt = _parse_datetime(completed_at)
    if end_dt is not None:
        return max(0.0, (end_dt - start_dt).total_seconds())
    return max(0.0, (dt.datetime.now(dt.UTC) - start_dt).total_seconds())


@traces(
    SWR.SWR_1003,
    SWR.SWR_1009,
    SWR.SWR_1029,
    SWR.SWR_1043,
    SWR.SWR_1076,
    SWR.SWR_1077,
    SWR.SWR_1078,
    SWR.SWR_1079,
    SWR.SWR_1080,
    SWR.SWR_1081,
)
@traces(SWR.SWR_1414, SWR.SWR_1415, SWR.SWR_1416, SWR.SWR_1417, SWR.SWR_1418)
class AgentStatusPane(VerticalScroll):
    """Compact agent status panel with collapsed presentation.

    Displays at most ``_MAX_VISIBLE`` concrete agent rows, newest-first.
    Hidden ranges are shown as ellipsis placeholders.  Keyboard navigation
    (Up/Down) traverses the full logical agent list; the focused agent
    always surfaces into the visible window.
    """

    BINDINGS: ClassVar[list[BindingType]] = [
        Binding("up", "navigate_up", "Navigate Up", show=False),
        Binding("down", "navigate_down", "Navigate Down", show=False),
    ]

    can_focus = True
    _ANIMATION_FRAMES = [".", "..", "...", ".."]
    _WAITING_FRAMES = ["◴", "◷", "◶", "◵"]

    def __init__(self, **kwargs: Any) -> None:
        kwargs.pop("shrink", None)
        super().__init__(**kwargs)
        self._content = Static()
        self.border_title = " agents "
        self.border_subtitle = "idle"
        p = RenderPalette.from_theme(get_theme())
        self.styles.border = ("solid", p.border)
        self.agents: list[dict[str, Any]] = []
        self.activity_events: list[dict[str, Any]] = []
        self.show_activity_log = False
        self.focused_agent_id: str | None = None
        self._animation_frame = 0
        self._animation_timer: Timer | None = None
        # Collapsed presentation state
        self._visible_agent_ids: list[str] = []
        self._collapsed_top: int = 0
        self._collapsed_bottom: int = 0
        self._agent_depths: dict[str, int] = {}
        self._agent_branch_flags: dict[str, list[bool]] = {}
        # Click-to-focus: maps rendered line index → agent canonical ID
        self._agent_line_map: dict[int, str] = {}

    def compose(self) -> Any:
        yield self._content

    def on_mount(self) -> None:
        self._animation_timer = self.set_interval(0.5, self._tick_animation)

    def on_resize(self) -> None:
        self._content.update(self._build_renderable())

    _ANIMATED_ICONS = frozenset(
        {"...", "ANIMATED_THINKING", "ANIMATED_TOOL", "ANIMATED_WAITING", "[TOOL]", "💭"},
    )

    def _has_animated_agent(self) -> bool:
        for agent in self.agents:
            icon = str(agent.get("activity_icon") or "")
            if icon in self._ANIMATED_ICONS:
                return True
        return False

    def _tick_animation(self) -> None:
        if not self._has_animated_agent():
            return
        self._animation_frame = (self._animation_frame + 1) % 100
        self._content.update(self._build_renderable())

    def update_agents(
        self,
        agents: list[dict[str, Any]],
        activity_events: list[dict[str, Any]] | None = None,
        *,
        show_activity_log: bool = False,
    ) -> None:
        self.agents = agents
        self.activity_events = activity_events or []
        self.show_activity_log = show_activity_log

        p = RenderPalette.from_theme(get_theme())
        self.border_title = " agents "
        if not agents:
            self.border_subtitle = "idle"
            self.styles.border = ("solid", p.border)
        else:
            self.border_subtitle = "live"
            self.styles.border = ("solid", p.blue)

        self._compute_visible_range()
        self._content.update(self._build_renderable())

    # ------------------------------------------------------------------
    # Collapsed presentation helpers
    # ------------------------------------------------------------------

    def _tree_order(self) -> list[tuple[str, int, list[bool]]]:
        """Return ``(canonical_name, depth, branch_flags)`` triples in grouped tree order.

        ``branch_flags`` is a list of booleans — one per ancestor depth — indicating
        whether that ancestor level still has more siblings following this node.  Used
        to render tree-connector characters (│, ├─, └─).
        """

        def _sort_key(agent: dict[str, Any]) -> tuple[int, float]:
            ts = agent.get("spawned_at") or agent.get("started_at")
            return _sort_timestamp_key(ts)

        agents_by_canonical = {
            self._canonical_for(agent): agent for agent in self.agents if self._canonical_for(agent)
        }
        children_by_parent: dict[str, list[dict[str, Any]]] = {}
        root_agents: list[dict[str, Any]] = []

        for agent in self.agents:
            canonical = self._canonical_for(agent)
            if not canonical:
                continue
            parent_agent_id = str(agent.get("parent_agent_id") or "")
            if parent_agent_id and parent_agent_id in agents_by_canonical:
                children_by_parent.setdefault(parent_agent_id, []).append(agent)
            else:
                root_agents.append(agent)

        ordered: list[tuple[str, int, list[bool]]] = []

        def _visit(agent: dict[str, Any], depth: int, branch_flags: list[bool]) -> None:
            canonical = self._canonical_for(agent)
            if not canonical:
                return
            ordered.append((canonical, min(depth, _MAX_INDENT_DEPTH), branch_flags))
            children = sorted(children_by_parent.get(canonical, []), key=_sort_key)
            for i, child in enumerate(children):
                is_last = i == len(children) - 1
                child_flags = branch_flags + [not is_last]
                _visit(child, depth + 1, child_flags)

        for root_agent in sorted(root_agents, key=_sort_key):
            _visit(root_agent, 0, [])

        return ordered

    def _flattened_order(self) -> list[str]:
        """Return agent canonical names flattened in visual tree order."""
        return [canonical for canonical, *_ in self._tree_order()]

    def _canonical_for(self, agent: dict[str, Any]) -> str:
        return str(agent.get("canonical_name") or agent.get("name") or "")

    def _agent_by_canonical(self, canonical: str) -> dict[str, Any] | None:
        for a in self.agents:
            if self._canonical_for(a) == canonical:
                return a
        return None

    def _compute_visible_range(self) -> None:
        """Compute which agents to show and the collapsed counts above/below."""
        tree_order = self._tree_order()
        self._agent_depths = {canonical: depth for canonical, depth, _ in tree_order}
        self._agent_branch_flags = {canonical: flags for canonical, _, flags in tree_order}
        order = [canonical for canonical, *_ in tree_order]
        total = len(order)

        if total <= _MAX_VISIBLE:
            self._visible_agent_ids = list(order)
            self._collapsed_top = 0
            self._collapsed_bottom = 0
            return

        # Ensure the focused agent is in the visible window.
        focused = self.focused_agent_id
        if focused is not None and focused in order:
            focused_idx = order.index(focused)
            # Try to center: 2 above, focused, 2 below (total 5).
            # But clamp to list bounds.
            start = max(0, focused_idx - _ELLIPSIS_ABOVE)
            end = min(total, focused_idx + _ELLIPSIS_BELOW)
            # If we're near the start, show first 5.
            if focused_idx < _ELLIPSIS_ABOVE:
                start = 0
                end = _MAX_VISIBLE
            # If we're near the end, show last 5.
            if focused_idx >= total - _ELLIPSIS_BELOW:
                start = total - _MAX_VISIBLE
                end = total
        else:
            # No focus — show newest (first) agents.
            start = 0
            end = _MAX_VISIBLE

        self._visible_agent_ids = order[start:end]
        self._collapsed_top = start
        self._collapsed_bottom = total - end

    # ------------------------------------------------------------------
    # Keyboard navigation (Up/Down in the agent pane)
    # ------------------------------------------------------------------

    def on_key(self, event: Key) -> None:
        """Handle Up/Down keys for flattened agent navigation."""
        from textual.keys import Keys

        if event.key == Keys.Up:
            self._navigate_flat(-1)
            event.prevent_default()
            event.stop()
        elif event.key == Keys.Down:
            self._navigate_flat(1)
            event.prevent_default()
            event.stop()

    def _navigate_flat(self, direction: int) -> None:
        order = self._flattened_order()
        if not order:
            return
        total = len(order)
        focused = self.focused_agent_id
        if focused is not None and focused in order:
            idx = order.index(focused)
            new_idx = (idx + direction) % total
        else:
            new_idx = 0 if direction > 0 else total - 1
        target = order[new_idx]
        self._select_agent(target)

    def _select_agent(self, canonical: str) -> None:
        """Persist panel selection in app state and recenter the collapsed view."""
        self.focused_agent_id = canonical
        cast("RotarisTuiApp", self.app).focused_agent_id = canonical
        self._compute_visible_range()
        self._content.update(self._build_renderable())

    # ------------------------------------------------------------------
    # Mouse click support
    # ------------------------------------------------------------------

    def on_click(self, event: Click) -> None:
        """Handle click on an agent row to focus that agent.

        Uses the line map built during ``_build_renderable`` to resolve
        the clicked y-coordinate to an agent canonical ID.  Clicking
        anywhere else (summary, ellipsis, activity log) is a no-op.
        """
        clicked_line = event.y
        canonical = self._agent_line_map.get(clicked_line)
        if canonical is not None and canonical != self.focused_agent_id:
            self._select_agent(canonical)

    # ------------------------------------------------------------------
    # Binding actions (override inherited scroll up/down)
    # ------------------------------------------------------------------

    def action_navigate_up(self) -> None:
        """Navigate to the previous agent in flattened order."""
        self._navigate_flat(-1)

    def action_navigate_down(self) -> None:
        """Navigate to the next agent in flattened order."""
        self._navigate_flat(1)

    # ------------------------------------------------------------------
    # Rendering
    # ------------------------------------------------------------------

    def _build_renderable(self) -> RenderableType:
        p = RenderPalette.from_theme(get_theme())
        self._agent_line_map.clear()

        if not self.agents:
            empty = Text()
            empty.append("No active agents yet.\n", style=f"bold {p.fg_muted}")
            empty.append(
                "Submit a task to watch the orchestrator branch, execute, and settle.",
                style=p.fg_dim,
            )
            return empty

        summary = self._render_summary()
        line_offset = summary.plain.count("\n") + 1  # summary + blank line
        items: list[RenderableType] = [summary, Text("")]

        # Ellipsis for collapsed top range.
        if self._collapsed_top > 0:
            ellipsis = Text()
            ellipsis.append(
                f"  ⋮ {self._collapsed_top} agent(s) above",
                style=p.fg_dim,
            )
            items.append(ellipsis)
            line_offset += 1

        # Visible agent rows — record each row's line index for click-to-focus.
        for canonical in self._visible_agent_ids:
            agent = self._agent_by_canonical(canonical)
            if agent is not None:
                self._agent_line_map[line_offset] = canonical
                line_offset += 1
                items.append(self._render_compact_row(agent, p))

        # Ellipsis for collapsed bottom range.
        if self._collapsed_bottom > 0:
            ellipsis = Text()
            ellipsis.append(
                f"  ⋮ {self._collapsed_bottom} agent(s) below",
                style=p.fg_dim,
            )
            items.append(ellipsis)
            line_offset += 1

        if self.show_activity_log:
            items.append(self._render_activity_log(p))

        return Group(*items)

    def _activity_log_line_budget(self, *, pane_height: int | None = None) -> int:
        height = pane_height if pane_height is not None else self.size.height
        if height <= 0:
            return _FALLBACK_ACTIVITY_LINES if self.activity_events else 1
        if not self.activity_events:
            return 1
        return max(1, height // _ACTIVITY_SECTION_RATIO)

    def _render_activity_log(
        self,
        p: RenderPalette,
        *,
        pane_height: int | None = None,
    ) -> Text:
        activity = Text()
        max_lines = self._activity_log_line_budget(pane_height=pane_height)
        total_events = len(self.activity_events)

        if total_events == 0:
            activity.append("Recent Activity: none", style=f"bold {p.fg_dim}")
            return activity

        if max_lines <= 1:
            activity.append(f"Recent Activity ({total_events})", style=f"bold {p.yellow}")
            return activity

        activity.append("── Recent Activity ──\n", style=f"bold {p.yellow}")

        event_budget = max_lines - 1
        visible_events = self.activity_events[-event_budget:]
        hidden_events = total_events - len(visible_events)
        if hidden_events > 0 and event_budget > 1:
            visible_events = self.activity_events[-(event_budget - 1) :]
            hidden_events = total_events - len(visible_events)

        for event in visible_events:
            agent_name = str(event.get("agent_name", "agent"))
            text = str(event.get("text", "")).strip()
            activity.append(self._truncate(agent_name, 18), style=f"bold {p.fg}")
            activity.append(" :: ", style=p.fg_dim)
            activity.append(f"{self._truncate(text, 56)}\n", style=p.fg_subtle)

        if hidden_events > 0:
            activity.append(f"⋮ {hidden_events} older event(s)", style=p.fg_dim)

        return activity

    def _render_compact_row(
        self,
        agent: dict[str, Any],
        p: RenderPalette,
    ) -> Text:
        """Render a single-line compact agent row.

        Format: ``▶ persona  run  name · state  12s  3 tools``
        (focused agent gets ``▶`` prefix and persona highlighted.)
        """
        state = str(agent.get("state") or "unknown")
        canonical = self._canonical_for(agent)
        is_focused = canonical == self.focused_agent_id
        depth = self._agent_depths.get(canonical, 0)
        branch_flags = self._agent_branch_flags.get(canonical)

        chip, chip_style = self._state_chip(state)
        persona = str(agent.get("persona", "unknown"))
        name = (
            agent.get("display_name") or agent.get("canonical_name") or agent.get("name", "unknown")
        )
        elapsed_str = self._elapsed_display(agent)

        row = Text()
        self._append_focus_prefix(row, is_focused, depth, p, branch_flags)

        # Persona (abbreviated).
        persona_style = p.user_label if is_focused else f"bold {p.fg}"
        row.append(f"{self._truncate(persona, 14):14s}  ", style=persona_style)

        # State chip.
        row.append(f"{chip}  ", style=chip_style)

        # Agent name + state.
        state_text = state.replace("_", " ")
        row.append(f"{self._truncate(str(name), 16)} · {state_text}", style=p.fg_muted)

        self._append_activity(row, agent, p)
        self._append_meta(row, elapsed_str, agent, p)

        return row

    def _append_focus_prefix(
        self,
        row: Text,
        is_focused: bool,
        depth: int,
        p: RenderPalette,
        branch_flags: list[bool] | None = None,
    ) -> None:
        if is_focused:
            row.append("▶ ", style=f"bold {p.user_label}")
        else:
            row.append("  ")
        if depth == 0:
            return
        if branch_flags and len(branch_flags) == depth:
            # Tree-connector rendering: ancestor levels show │ if they continue.
            for continues in branch_flags[:-1]:
                row.append("│  " if continues else "   ", style=p.fg_dim)
            row.append("├─ " if branch_flags[-1] else "└─ ", style=p.fg_dim)
        else:
            # Fallback: plain indentation (e.g. from old session snapshots).
            row.append("  " * depth, style=p.fg_dim)

    def _elapsed_display(self, agent: dict[str, Any]) -> str:
        started_at = agent.get("spawned_at") or agent.get("started_at")
        completed_at = agent.get("completed_at")
        elapsed_secs = _elapsed_seconds(started_at, completed_at)
        if elapsed_secs is None:
            return ""
        return self._format_elapsed(elapsed_secs)

    def _append_activity(self, row: Text, agent: dict[str, Any], p: RenderPalette) -> None:
        activity_text = agent.get("activity_text")
        if not activity_text:
            return

        rendered_icon = self._render_activity_icon(agent.get("activity_icon"))
        display = f"{rendered_icon} {activity_text}" if rendered_icon else str(activity_text)
        row.append(f"  {display}", style=self._activity_style(agent, p))

    def _activity_style(self, agent: dict[str, Any], p: RenderPalette) -> str:
        activity_phase = str(agent.get("activity_phase") or "")
        if activity_phase in {"failed", "blocked"}:
            return p.red
        if activity_phase == "summarizing":
            return f"bold {p.cyan}"
        return p.fg_subtle

    def _append_meta(
        self,
        row: Text,
        elapsed_str: str,
        agent: dict[str, Any],
        p: RenderPalette,
    ) -> None:
        if not elapsed_str:
            return

        meta = elapsed_str
        tool_count = agent.get("tool_call_count", 0)
        if tool_count:
            meta += f"  {tool_count}t"
        row.append(f"  {meta}", style=p.fg_dim)

    def _render_activity_icon(self, activity_icon: object) -> str:
        icon = str(activity_icon or "")
        if icon in {"", "[OK]", "✅"}:
            return ""
        if icon in {"...", "ANIMATED_THINKING", "ANIMATED_TOOL", "[TOOL]", "💭"}:
            return BRAILLE_FRAMES[self._animation_frame % len(BRAILLE_FRAMES)]
        if icon == "ANIMATED_WAITING":
            return self._WAITING_FRAMES[self._animation_frame % len(self._WAITING_FRAMES)]
        if icon in {"[ERR]", "[X]", "❌", "✗"}:
            return "✗"
        if icon == "[!]":
            return "!"
        return icon

    def _render_summary(self) -> Text:
        p = RenderPalette.from_theme(get_theme())
        counts: dict[str, int] = {
            "running": 0,
            "queued": 0,
            "waiting_on_dependencies": 0,
            "summarizing": 0,
            "succeeded": 0,
            "failed": 0,
            "blocked": 0,
        }
        for agent in self.agents:
            state = str(agent.get("state", ""))
            if state in counts:
                counts[state] += 1

        summary = Text()
        chips = [
            ("run", counts["running"], p.green),
            ("sum", counts["summarizing"], p.cyan),
            ("wait", counts["waiting_on_dependencies"] + counts["queued"], p.yellow),
            ("done", counts["succeeded"], p.blue),
            ("block", counts["blocked"], p.red),
            ("fail", counts["failed"], p.red),
        ]
        for index, (label, value, color) in enumerate(chips):
            if index:
                summary.append("  ")
            summary.append(f"{label} ", style=f"bold {color}")
            summary.append(str(value), style=f"bold {p.fg}")
        return summary

    def _truncate(self, text: str, limit: int) -> str:
        if len(text) <= limit:
            return text
        return text[: limit - 1].rstrip() + "…"

    def _format_elapsed(self, seconds: float) -> str:
        if seconds < 60:
            return f"{int(seconds)}s"
        minutes = int(seconds // 60)
        secs = int(seconds % 60)
        if minutes < 60:
            return f"{minutes}m {secs}s"
        hours = minutes // 60
        minutes = minutes % 60
        return f"{hours}h {minutes}m"

    def _state_chip(self, state: str) -> tuple[str, str]:
        p = RenderPalette.from_theme(get_theme())
        mapping = {
            "running": ("run", f"bold {p.green}"),
            "queued": ("q", f"bold {p.yellow}"),
            "waiting_on_dependencies": ("wait", f"bold {p.yellow}"),
            "summarizing": ("sum", f"bold {p.cyan}"),
            "succeeded": ("done", f"bold {p.blue}"),
            "failed": ("fail", f"bold {p.red}"),
            "blocked": ("block", f"bold {p.red}"),
        }
        return mapping.get(state, ("idle", f"bold {p.fg_dim}"))
