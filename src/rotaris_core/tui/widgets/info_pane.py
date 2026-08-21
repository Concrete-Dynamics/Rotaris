from __future__ import annotations

from typing import TYPE_CHECKING, Any

from rich.console import Group
from rich.text import Text
from textual.containers import VerticalScroll
from textual.message import Message
from textual.widgets import Static

from rotaris_core.cost import format_cost
from rotaris_core.reqtocode import SWR, traces
from rotaris_core.tracking.tracker import GlobalTracker
from rotaris_core.tui.palette import RenderPalette
from rotaris_core.tui.themes import get_theme

if TYPE_CHECKING:
    from rich.console import RenderableType
    from textual.events import Click


@traces(
    SWR.SWR_1030,
    SWR.SWR_1258,
    SWR.SWR_1259,
    SWR.SWR_1260,
    SWR.SWR_1261,
    SWR.SWR_1262,
    SWR.SWR_1263,
    SWR.SWR_1264,
)
@traces(
    SWR.SWR_1419,
    SWR.SWR_1420,
    SWR.SWR_1421,
    SWR.SWR_1422,
    SWR.SWR_1423,
    SWR.SWR_1424,
    SWR.SWR_1425,
    SWR.SWR_1429,
    SWR.SWR_1431,
)
@traces(SWR.SWR_841)
class InfoPane(VerticalScroll):
    class FocusArtifact(Message):
        """Posted when the user clicks an artifact entry in the info pane."""

        def __init__(self, artifact_id: str) -> None:
            super().__init__()
            self.artifact_id = artifact_id

    def __init__(self, **kwargs: Any) -> None:
        kwargs.pop("shrink", None)
        super().__init__(**kwargs)
        self._content = Static()
        self.border_title = " info "
        p = RenderPalette.from_theme(get_theme())
        self.styles.border = ("solid", p.border)
        self.token_estimate: int = 0
        self.token_is_actual: bool = False
        self.tool_call_count: int = 0
        self.compression_count: int = 0
        self.agent_metrics: list[dict[str, Any]] = []
        # Live size of the focused agent's *current* context window (last prompt
        # tokens).  Distinct from cumulative billing tokens — this is what
        # actually drives compression decisions.  ``0`` means "unknown".
        self.context_tokens: int = 0
        self.compression_threshold_percentage: int = 0
        self.compression_threshold_tokens: int = 0
        self.compression_threshold_capacity: int = 0
        self.mcp_servers: list[dict[str, Any]] = []
        self.tools: list[dict[str, Any]] = []
        self.artifacts_produced: list[dict[str, Any]] = []
        self.artifacts_received: list[dict[str, Any]] = []
        self.artifacts_all: list[dict[str, Any]] = []
        self.focused_artifact_id: str | None = None
        self._warnings: list[dict[str, str]] = []
        self.workspace: str = ""
        self.model_name: str = ""
        self.todos_summary: str = ""
        self.has_session: bool = False
        # Click-to-open: maps rendered line index → artifact ID
        self._artifact_line_map: dict[int, str] = {}

    def compose(self) -> Any:
        yield self._content

    def update_info(self, warnings: list[dict[str, str]] | None = None, **kwargs: Any) -> None:
        self._warnings = warnings or []
        for key, value in kwargs.items():
            if hasattr(self, key):
                setattr(self, key, value)
        self._content.update(self._build_renderable())

    def on_click(self, event: Click) -> None:
        """Handle click on an artifact entry to focus/open it."""
        clicked_line = event.y
        artifact_id = self._artifact_line_map.get(clicked_line)
        if artifact_id is not None:
            self.post_message(self.FocusArtifact(artifact_id))

    def _build_renderable(self) -> RenderableType:
        p = RenderPalette.from_theme(get_theme())
        tracker = GlobalTracker()
        self._artifact_line_map.clear()

        has_data = any(
            [
                self.model_name,
                self.workspace,
                self.token_estimate,
                self.tool_call_count,
                self.compression_count,
                self.agent_metrics,
                self.mcp_servers,
                self.tools,
                self.artifacts_produced,
                self.artifacts_received,
                self.artifacts_all,
                self._warnings,
                self.todos_summary,
            ],
        )

        if not has_data:
            empty = Text()
            empty.append("\nNo session info yet.\n\n", style=f"bold {p.fg_muted}")
            empty.append(
                "Info will appear here once the session starts.",
                style=p.fg_dim,
            )
            return empty

        sections: list[RenderableType] = []

        if self.model_name or self.workspace:
            header = Text()
            if self.model_name:
                header.append("model  ", style=p.fg_dim).append(f"{self.model_name}\n", style=p.fg)
            if self.compression_threshold_percentage > 0:
                header.append("compr threshold  ", style=p.fg_dim)
                header.append(
                    f"{self.compression_threshold_percentage}%"
                    f" → {self.compression_threshold_tokens:,}"
                    f" of {self.compression_threshold_capacity:,} tok",
                    style=p.fg,
                )
            if self.workspace:
                header.append("\nworkspace  ", style=p.fg_dim).append(
                    f"{self.workspace}", style=p.fg
                )
            sections.append(header)
            sections.append(Text())

        # Tokens, tool-call statistics, and per-agent metrics are only
        # meaningful once a session has started.  Skip them in pre-run state
        # so the pane shows a clean workspace overview instead of "~0 tokens".
        if self.has_session:
            # Tokens & Tool Calls Section
            # 1. Global Statistics — the GlobalTracker aggregate is the
            #    authoritative sum across every per-agent record, so it is the
            #    canonical "total tokens" number whenever the tracker has data.
            #    Fall back to the session-level estimate only before any LLM call
            #    has been recorded.
            tracker_has_activity = tracker.has_activity()
            tracker_tokens = tracker.get_global_tokens().total_tokens
            global_tokens = tracker_tokens if tracker_tokens > 0 else self.token_estimate
            global_tools = (
                sum(tracker.get_global_tool_calls().values())
                if tracker_has_activity
                else self.tool_call_count
            )
            global_compressions = (
                tracker.get_global_compressions()
                if tracker_has_activity
                else self.compression_count
            )

            stats_text = Text()
            stats_text.append("cum tok  ", style=p.fg_dim)
            if tracker_tokens > 0 or self.token_is_actual:
                stats_text.append(f"{global_tokens:,}", style=p.cyan)
            else:
                stats_text.append(f"~{global_tokens:,}", style=p.cyan)
            stats_text.append("  |  ", style=p.fg_dim)
            stats_text.append("tool calls  ", style=p.fg_dim)
            stats_text.append(f"{global_tools}", style=p.cyan)
            stats_text.append("  |  ", style=p.fg_dim)
            stats_text.append("compr  ", style=p.fg_dim)
            stats_text.append(f"{global_compressions}", style=p.cyan)
            sections.append(stats_text)

            # Cost gets its own line: the label carries qualifiers ("n/a",
            # "(configured)", "(partial)") that would wrap the stats row and
            # shift every section below it.
            cost_text = Text()
            cost_text.append("cost  ", style=p.fg_dim)
            cost_text.append(format_cost(tracker.get_global_cost()), style=p.cyan)
            sections.append(cost_text)

            # Show the focused agent's live context-window size separately so the
            # user can read compression pressure without confusing it with the
            # cumulative lifetime billing total above.
            if self.context_tokens > 0:
                ctx_text = Text()
                ctx_text.append("context  ", style=p.fg_dim)
                ctx_text.append(f"{self.context_tokens:,}", style=p.cyan)
                ctx_text.append(" tok (current window)", style=p.fg_dim)
                sections.append(ctx_text)

            # 2. Per-Agent Statistics
            if tracker_has_activity:
                agent_rows: list[dict[str, Any]] = []
                for name in tracker.get_all_agent_names():
                    agent_data = tracker.get_agent_data(name)
                    if agent_data is None:
                        continue
                    agent_rows.append(
                        {
                            "name": name,
                            "tokens": agent_data.tokens.total_tokens,
                            "context_tokens": agent_data.last_prompt_tokens,
                            "tool_call_count": sum(agent_data.tool_calls.values()),
                            "compressions": agent_data.compressions,
                        },
                    )
            else:
                agent_rows = list(self.agent_metrics)

            if agent_rows:
                for row_data in agent_rows:
                    row_name = str(row_data.get("name", ""))
                    a_ctx = int(row_data.get("context_tokens", 0) or 0)
                    a_cum = int(row_data.get("tokens", 0) or 0)
                    a_tools = int(row_data.get("tool_call_count", 0) or 0)
                    a_compressions = int(row_data.get("compressions", 0) or 0)
                    if a_ctx == 0 and a_cum == 0 and a_tools == 0 and a_compressions == 0:
                        continue
                    row = Text()
                    row.append(f"  {row_name}  ", style=p.fg_dim)
                    if a_ctx > 0:
                        row.append(f"{a_ctx:,} ctx", style=p.fg)
                    else:
                        row.append(f"{a_cum:,} tok", style=p.fg)
                    row.append(" / ", style=p.fg_dim)
                    row.append(f"{a_tools} calls", style=p.fg)
                    row.append(" / ", style=p.fg_dim)
                    row.append(f"{a_compressions} compr", style=p.fg)
                    sections.append(row)

                sections.append(Text())

        if self.mcp_servers:
            sections.append(Text("MCP Servers", style=p.fg_dim))
            for srv in self.mcp_servers:
                name = srv.get("name", "unknown")
                status = srv.get("status", "unavailable")
                source = srv.get("source", "default")
                srv_type = srv.get("type", "stdio")

                if source == "yaml":
                    glyph = "●"
                    glyph_style = p.fg
                elif source == "discovered-project":
                    glyph = "◆"
                    glyph_style = p.cyan
                elif source == "discovered-user":
                    glyph = "◇"
                    glyph_style = p.cyan
                else:
                    glyph = "○"
                    glyph_style = p.fg_dim

                if status == "active":
                    text_style = p.green
                else:
                    text_style = p.fg_dim
                    glyph_style = p.fg_dim

                line = Text()
                line.append(f"{glyph} ", style=glyph_style)
                line.append(name, style=text_style)

                if srv_type in ("http", "sse"):
                    line.append(f" [{srv_type}]", style=p.fg_dim)

                sections.append(line)
            sections.append(Text())

        if self.tools:
            sections.append(Text("Tools", style=p.fg_dim))
            for tool in self.tools:
                name = tool.get("name", "unknown")
                used = tool.get("used", False)
                if self.has_session:
                    # During/after run: green checkmark for used, dimmed for unused.
                    mark = "✓" if used else " "
                    tool_style = p.fg if used else p.fg_dim
                else:
                    # Pre-run: no usage tracking yet; show all tools in normal style.
                    mark = " "
                    tool_style = p.fg
                sections.append(Text(f"{mark} {name}", style=tool_style))
            sections.append(Text())

        if self.artifacts_produced or self.artifacts_received or self.artifacts_all:
            sections.append(Text("Artifacts", style=p.fg_dim))
            if self.artifacts_all:
                self._append_artifact_group(sections, "All", self.artifacts_all, p)
            else:
                if self.artifacts_produced:
                    self._append_artifact_group(sections, "Produced", self.artifacts_produced, p)
                if self.artifacts_received:
                    self._append_artifact_group(sections, "Received", self.artifacts_received, p)
            sections.append(Text())

        if self._warnings or self.has_session:
            sections.append(Text("Warnings", style=p.fg_dim))
            if self._warnings:
                for warning in self._warnings:
                    level = warning.get("level", "warning")
                    text = warning.get("text", "")
                    if level == "error":
                        sections.append(Text(f"✗ {text}", style=p.red))
                    else:
                        sections.append(Text(f"! {text}", style=p.yellow))
            else:
                sections.append(Text("No warnings", style=p.fg_dim))
            sections.append(Text())

        if self.todos_summary:
            sections.append(Text("Todos", style=p.fg_dim))
            sections.append(Text(self.todos_summary, style=p.fg))
            sections.append(Text())

        if sections and isinstance(sections[-1], Text) and len(sections[-1]) == 0:
            sections.pop()

        # Populate artifact line map by computing cumulative line offsets.
        self._populate_artifact_line_map(sections)

        return Group(*sections)

    def _populate_artifact_line_map(
        self,
        sections: list[RenderableType],
    ) -> None:
        """Walk through sections, compute line offsets, and map artifact rows.

        Each Text renderable contributes ``plain.count('\\n') + 1`` lines.
        When we encounter the "Artifacts" header, subsequent rows that contain
        artifact slugs are mapped to their artifact IDs.
        """
        self._artifact_line_map.clear()
        line_offset = 0
        in_artifacts = False
        all_artifacts = list(self.artifacts_all or [])
        produced = list(self.artifacts_produced or [])
        received = list(self.artifacts_received or [])
        # Build ordered list of artifact dicts in the same order they appear.
        ordered_artifacts: list[dict[str, Any]] = all_artifacts or produced + received
        artifact_idx = 0

        for item in sections:
            if not isinstance(item, Text):
                line_offset += 1
                continue
            plain = item.plain
            lines = plain.count("\n") + 1
            if not in_artifacts and "Artifacts" in plain:
                in_artifacts = True
                line_offset += lines
                continue
            if in_artifacts:
                # Skip blank lines and group labels ("All", "Produced", "Received").
                stripped = plain.strip()
                if not stripped or stripped in ("All", "Produced", "Received"):
                    line_offset += lines
                    continue
                # This is an artifact row.
                if artifact_idx < len(ordered_artifacts):
                    art_id = str(ordered_artifacts[artifact_idx].get("id") or "")
                    if art_id:
                        self._artifact_line_map[line_offset] = art_id
                    artifact_idx += 1
                line_offset += lines
                continue
            line_offset += lines

    def _append_artifact_group(
        self,
        sections: list[RenderableType],
        label: str,
        artifacts: list[dict[str, Any]],
        p: RenderPalette,
    ) -> None:
        sections.append(Text(f"  {label}", style=p.fg_subtle))
        for artifact in artifacts:
            artifact_id = str(artifact.get("id") or "")
            kind = str(artifact.get("kind") or "")
            slug = str(artifact.get("slug") or artifact_id or "artifact")
            title = str(artifact.get("title") or "")
            is_read = bool(artifact.get("read"))
            glyph = "●" if kind == "agent_published" or is_read else "○"
            marker = "▶" if artifact_id == self.focused_artifact_id else " "
            style = f"reverse {p.fg}" if artifact_id == self.focused_artifact_id else p.fg
            muted_style = f"reverse {p.fg_dim}" if marker == "▶" else p.fg_dim
            glyph_style = (
                (f"reverse {p.green}" if marker == "▶" else p.green) if is_read else muted_style
            )
            row = Text()
            row.append(f"{marker} ", style=muted_style)
            row.append(f"{glyph} ", style=glyph_style)
            row.append(self._truncate(slug, 24), style=style)
            if title and title != slug:
                row.append("  ", style=muted_style)
                row.append(self._truncate(title, 34), style=muted_style)
            if artifact.get("edited"):
                row.append("  edited", style=p.yellow)
            sections.append(row)

    @staticmethod
    def _truncate(value: str, limit: int) -> str:
        if len(value) <= limit:
            return value
        return value[: max(0, limit - 1)] + "…"
