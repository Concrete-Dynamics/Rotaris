from __future__ import annotations

import bisect
import logging
import re
import shutil
import subprocess
import time
import webbrowser
from typing import TYPE_CHECKING, Any, cast, override

from rich.cells import cell_len
from rich.markdown import Markdown
from rich.measure import measure_renderables
from rich.segment import Segment
from rich.style import Style
from rich.text import Text
from textual import events
from textual.geometry import Size
from textual.strip import Strip
from textual.widgets import RichLog

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.tui.palette import BRAILLE_FRAMES, RenderPalette
from rotaris_core.tui.themes import get_theme
from rotaris_core.tui.transcript_renderer import (
    RenderedBlock,
    TranscriptBlock,
    TranscriptBlockKey,
    TranscriptRenderStore,
    estimate_event_height,
    fingerprint_event,
)

if TYPE_CHECKING:
    from textual.selection import Selection

    from rotaris_core.core.prompt_types import QueuedPrompt
    from rotaris_core.orchestrator.report import ChildReportArtifact
    from rotaris_core.tui.app import RotarisTuiApp

_URL_RE = re.compile(r"https?://\S+")
_MAX_LIVE_STREAM_MARKDOWN_CHARS = 4_000

_log = logging.getLogger(__name__)


def _open_url(url: str) -> bool:
    """Open a URL with the platform browser, with a CLI fallback for TUI sessions."""
    if webbrowser.open(url):
        return True

    for command in ("xdg-open", "gio", "open"):
        path = shutil.which(command)
        if path is None:
            continue
        args = [path, url] if command != "gio" else [path, "open", url]
        try:
            subprocess.Popen(  # noqa: S603
                args,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
        except OSError:
            continue
        return True
    return False


_TRAILING_BARE_PROTOCOL_RE = re.compile(r"\b\w+://(?=\s|$|\*|\))")


def _prepare_streaming_markdown(text: str) -> str:
    """Close unclosed code fences and neutralize bare protocol URLs so
    partial markdown renders safely during streaming.

    An incomplete URL like ``https://`` (no host) crashes ``mdurl.parse()``
    when Rich's ``Markdown`` widget resolves autolinks / link destinations.
    Strip any protocol-only fragment that is followed by whitespace, a
    markdown-italic ``*``, a closing parenthesis, or end-of-string.
    """
    text = _TRAILING_BARE_PROTOCOL_RE.sub("", text)
    if text.count("```") % 2 != 0:
        text += "\n```"
    return text


def _streaming_preview_tail(text: str) -> tuple[str, int]:
    if len(text) <= _MAX_LIVE_STREAM_MARKDOWN_CHARS:
        return text, 0
    tail = text[-_MAX_LIVE_STREAM_MARKDOWN_CHARS:].lstrip()
    return tail, len(text) - len(tail)


@traces(SWR.SWR_712, SWR.SWR_713)
@traces(
    SWR.SWR_1002,
    SWR.SWR_1010,
    SWR.SWR_1012,
    SWR.SWR_1013,
    SWR.SWR_1033,
    SWR.SWR_1034,
    SWR.SWR_1082,
    SWR.SWR_1084,
    SWR.SWR_1087,
)
@traces(
    SWR.SWR_1213,
    SWR.SWR_1214,
    SWR.SWR_1215,
    SWR.SWR_1216,
    SWR.SWR_1217,
    SWR.SWR_1218,
    SWR.SWR_1219,
    SWR.SWR_1221,
    SWR.SWR_1222,
    SWR.SWR_1226,
)
@traces(
    SWR.SWR_1233,
    SWR.SWR_1234,
    SWR.SWR_1235,
    SWR.SWR_1237,
    SWR.SWR_1238,
    SWR.SWR_1239,
    SWR.SWR_1240,
    SWR.SWR_1241,
)
@traces(
    SWR.SWR_1265,
    SWR.SWR_1266,
    SWR.SWR_1267,
    SWR.SWR_1268,
    SWR.SWR_1270,
    SWR.SWR_1426,
    SWR.SWR_1427,
    SWR.SWR_1433,
)
class ChatPanel(RichLog):
    _MAX_CHILD_LINE_CHARS = 110

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(auto_scroll=True, highlight=False, markup=True, wrap=True, **kwargs)
        self.border_title = " transcript "
        self.border_subtitle = " live "
        self._following: bool = True
        self._saved_scroll_y: float = 0.0
        self._unread_count: int = 0
        self._breadcrumb: str | None = None
        self._stable_strip_count: int = 0
        self._markdown_cache: dict[str, Markdown] = {}
        # Absolute line indices of clickable "Thought …" reasoning headers.
        # Click in any of these rows toggles ``app.show_reasoning``.
        self._reasoning_header_lines: set[int] = set()
        # True only during a full rebuild so _restore_scroll is not queued on
        # every incremental/streaming refresh tick.
        self._in_full_rebuild: bool = False
        # Set around programmatic scroll_y mutations so watch_scroll_y can
        # distinguish user-initiated scrolls from internal ones.
        self._programmatic_scroll: bool = False
        # Height-map for O(log n) viewport lookups: cumulative line starts
        # per event.  Rebuilt on every full rebuild; incrementally extended
        # on every incremental append.
        self._event_line_starts: list[int] = []
        # Per-event line counts (parallel to _event_line_starts).
        self._event_line_counts: list[int] = []
        # Track the last rendered event count so incremental extends are correct.
        self._last_rendered_event_count: int = 0
        self._virtual_transcript = TranscriptRenderStore()
        self._using_virtual_transcript = False
        self._virtual_width = 0
        self._last_virtual_signature: tuple[str, ...] = ()

    def set_breadcrumb(self, text: str | None) -> None:
        self._breadcrumb = text

    # ------------------------------------------------------------------
    # Virtual transcript rendering
    # ------------------------------------------------------------------

    def set_transcript(
        self,
        transcript_events: list[dict[str, Any]],
        *,
        placeholder_stream_agents: set[str],
        live_stream_messages: dict[str, dict[str, Any]],
        queued_prompts: list[QueuedPrompt],
        focused_agent_id: str | None,
        show_reasoning: bool,
        show_tool_events: bool,
        show_tool_inputs: bool,
        tool_result_max_lines: int,
        tool_input_max_lines: int,
    ) -> None:
        """Replace the visible transcript model without materializing all rows."""

        self._using_virtual_transcript = True
        width = self._content_width()
        self._virtual_width = width
        anchor = self._capture_scroll_anchor()
        mode = {
            "show_reasoning": show_reasoning,
            "tool_result_max_lines": tool_result_max_lines,
            "tool_input_max_lines": tool_input_max_lines,
        }
        blocks = self._build_transcript_blocks(
            transcript_events,
            placeholder_stream_agents=placeholder_stream_agents,
            live_stream_messages=live_stream_messages,
            queued_prompts=queued_prompts,
            focused_agent_id=focused_agent_id,
            show_reasoning=show_reasoning,
            show_tool_events=show_tool_events,
            show_tool_inputs=show_tool_inputs,
            tool_result_max_lines=tool_result_max_lines,
            tool_input_max_lines=tool_input_max_lines,
            mode=mode,
        )
        signature = tuple(block.key.identity + ":" + block.key.fingerprint for block in blocks)
        had_new_blocks = len(signature) > len(self._last_virtual_signature)
        self._last_virtual_signature = signature
        self._virtual_transcript.set_blocks(blocks)
        self._sync_virtual_size()
        self._refresh_virtual_snapshot()

        if self._following:
            self._scroll_to_end_if_following()
            # The surrounding panes may be changing size in the same app
            # refresh.  In that case Textual still exposes the previous
            # scroll range here, so repeat the follow once layout has settled.
            self.call_after_refresh(self._scroll_to_end_if_following)
            self.border_subtitle = " live "
            self._unread_count = 0
        elif anchor is not None:
            self._restore_scroll_anchor(anchor)
            if had_new_blocks:
                self._track_new_message()
        self.refresh()

    def _build_transcript_blocks(
        self,
        transcript_events: list[dict[str, Any]],
        *,
        placeholder_stream_agents: set[str],
        live_stream_messages: dict[str, dict[str, Any]],
        queued_prompts: list[QueuedPrompt],
        focused_agent_id: str | None,
        show_reasoning: bool,
        show_tool_events: bool,
        show_tool_inputs: bool,
        tool_result_max_lines: int,
        tool_input_max_lines: int,
        mode: dict[str, Any],
    ) -> list[TranscriptBlock]:
        blocks: list[TranscriptBlock] = []
        theme_name = get_theme().name
        last_speaker_key: str | None = None
        seen_thinking_events: set[tuple[str, str]] = set()

        if self._breadcrumb is not None:
            breadcrumb_event: dict[str, Any] = {
                "role": "breadcrumb",
                "content": self._breadcrumb,
            }
            blocks.append(
                self._make_block(
                    len(blocks),
                    breadcrumb_event,
                    hide_header=False,
                    volatile=False,
                    theme_name=theme_name,
                    mode=mode,
                ),
            )

        for event in transcript_events:
            virtual_event = self._virtualize_event(
                event,
                placeholder_stream_agents,
                live_stream_messages,
            )
            if virtual_event is None:
                continue
            role = str(virtual_event.get("role", ""))
            if role == "thinking":
                thinking_key = (
                    str(virtual_event.get("name", "")),
                    str(virtual_event.get("content", "")),
                )
                if thinking_key in seen_thinking_events:
                    continue
                seen_thinking_events.add(thinking_key)
            if role == "edit_diff" and not show_tool_events:
                continue
            if role == "tool":
                if "phase" in virtual_event and not show_tool_events:
                    continue
                if "phase" not in virtual_event and not show_tool_inputs:
                    continue
            name = str(virtual_event.get("name", ""))
            persona = str(virtual_event.get("persona", ""))
            speaker_key = f"{role}:{name}:{persona}"
            hide_header = speaker_key == last_speaker_key and role in {"user", "agent", "system"}
            volatile = role in {"live_stream"}
            blocks.append(
                self._make_block(
                    len(blocks),
                    virtual_event,
                    hide_header=hide_header,
                    volatile=volatile,
                    theme_name=theme_name,
                    mode=mode,
                ),
            )
            last_speaker_key = speaker_key if role in {"user", "agent", "system"} else None

        for stream_agent, stream in live_stream_messages.items():
            if stream_agent in placeholder_stream_agents:
                continue
            if focused_agent_id is not None and stream_agent != focused_agent_id:
                continue
            live_event: dict[str, Any] = {
                "role": "live_stream",
                "name": stream_agent,
                "stream": dict(stream),
                "show_reasoning": show_reasoning,
            }
            blocks.append(
                self._make_block(
                    len(blocks),
                    live_event,
                    hide_header=False,
                    volatile=True,
                    theme_name=theme_name,
                    mode=mode,
                ),
            )

        if queued_prompts:
            queued_event: dict[str, Any] = {"role": "queued", "prompts": queued_prompts}
            blocks.append(
                self._make_block(
                    len(blocks),
                    queued_event,
                    hide_header=False,
                    volatile=True,
                    theme_name=theme_name,
                    mode=mode,
                ),
            )
        return blocks

    def _make_block(
        self,
        index: int,
        event: dict[str, Any],
        *,
        hide_header: bool,
        volatile: bool,
        theme_name: str,
        mode: dict[str, Any],
    ) -> TranscriptBlock:
        role = str(event.get("role", ""))
        identity = self._block_identity(index, event)
        fingerprint = fingerprint_event(event, hide_header=hide_header, mode=mode)
        key = TranscriptBlockKey(
            identity=identity,
            fingerprint=fingerprint,
            theme=theme_name,
            volatile=volatile,
        )
        estimate = (
            2 if role == "breadcrumb" else estimate_event_height(event, hide_header=hide_header)
        )
        return TranscriptBlock(
            index=index, event=event, hide_header=hide_header, key=key, estimated_height=estimate
        )

    def _block_identity(self, index: int, event: dict[str, Any]) -> str:
        role = str(event.get("role", ""))
        name = str(event.get("name", ""))
        tool_key = str(event.get("tool_event_key", ""))
        if tool_key:
            return f"{role}:{name}:{tool_key}"
        if role == "live_stream":
            return f"live:{name}"
        if role == "queued":
            return "queued"
        if role == "breadcrumb":
            return "breadcrumb"
        return f"{role}:{name}:{id(event)}"

    def _virtualize_event(
        self,
        event: dict[str, Any],
        placeholder_stream_agents: set[str],
        live_stream_messages: dict[str, dict[str, Any]],
    ) -> dict[str, Any] | None:
        if event.get("role") == "page":
            return None
        if event.get("role") != "agent":
            return event
        content = str(event.get("content", ""))
        if content.strip():
            return event
        agent_name = str(event.get("name", "")).strip()
        if agent_name not in placeholder_stream_agents:
            return None
        stream = live_stream_messages.get(agent_name)
        if stream is None:
            return None
        return {
            "role": "live_stream",
            "name": agent_name,
            "stream": dict(stream),
            "show_reasoning": bool(getattr(self.app, "show_reasoning", False)),
        }

    def _capture_scroll_anchor(self) -> tuple[str, int] | None:
        if not self._using_virtual_transcript:
            return None
        mapped = self._virtual_transcript.line_to_block(int(self.scroll_y))
        if mapped is None:
            return None
        block, offset = mapped
        return block.key.identity, offset

    def _restore_scroll_anchor(self, anchor: tuple[str, int]) -> None:
        identity, offset = anchor
        for index, block in enumerate(self._virtual_transcript.blocks):
            if block.key.identity != identity:
                continue
            self._programmatic_scroll = True
            self.scroll_y = self._virtual_transcript.start_for_block(index) + offset
            self._programmatic_scroll = False
            return

    def _content_width(self) -> int:
        width = self.scrollable_content_region.width or self.size.width
        return max(1, int(width or 80))

    def _sync_virtual_size(self) -> None:
        self._widest_line_width = max(self._widest_line_width, self._content_width())
        self.virtual_size = Size(self._content_width(), self._virtual_transcript.total_height)

    def _refresh_virtual_snapshot(self) -> None:
        """Maintain a bounded compatibility snapshot for tests and selection."""

        width = self._content_width()
        viewport = max(20, int(self.size.height or 20))
        if self._following:
            end_line = self._virtual_transcript.total_height
            start_line = max(0, end_line - viewport)
        else:
            start_line = max(0, int(self.scroll_y))
            end_line = start_line + viewport
        line_limit = 240
        self._reasoning_header_lines.clear()
        strips: list[Strip] = []
        stable_strip_count = 0
        if self._virtual_transcript.total_height <= line_limit:
            block_range = range(len(self._virtual_transcript.blocks))
        else:
            block_range = self._virtual_transcript.visible_blocks(
                start_line,
                end_line,
                buffer_blocks=6,
            )
        for block_index in block_range:
            block = self._virtual_transcript.blocks[block_index]
            absolute_start = self._virtual_transcript.start_for_block(block_index)
            rendered = self._virtual_transcript.render_block(
                block, width, self._render_virtual_block
            )
            for offset in rendered.reasoning_line_offsets:
                self._reasoning_header_lines.add(absolute_start + offset)
            if len(strips) < line_limit:
                visible_strips = rendered.strips[: max(0, line_limit - len(strips))]
                strips.extend(visible_strips)
                if not block.key.volatile:
                    stable_strip_count += len(visible_strips)
        self.lines = strips
        self._stable_strip_count = stable_strip_count
        self._line_cache.clear()
        self._sync_virtual_size()

    # ------------------------------------------------------------------
    # Follow-mode scroll management
    # ------------------------------------------------------------------

    def _scroll_to_end_if_following(self) -> None:
        """Follow the transcript after layout without overriding a user pause."""
        if not self._following:
            return
        self._programmatic_scroll = True
        try:
            # force=True: during a layout settle the vertical-scrollbar
            # reactive can lag reality, making allow_vertical_scroll False
            # and turning this follow into a silent no-op.
            self.scroll_end(animate=False, immediate=True, x_axis=False, force=True)
        finally:
            self._programmatic_scroll = False

    def on_resize(self, event: events.Resize) -> None:
        # RichLog.on_resize sets _size_known and flushes deferred writes; no
        # write() call is effective until this runs once per widget lifetime.
        super().on_resize(event)
        # Surrounding panes can settle their layout after set_transcript's
        # one-shot follow already ran against a stale scroll range; every
        # resize re-anchors the view to the bottom while following.
        if self._following:
            self.call_after_refresh(self._scroll_to_end_if_following)

    def on_mouse_up(self, event: events.MouseUp) -> None:
        if event.button == 1:  # left-click
            # 1) URL handling: if a URL is selected, open it.
            selected = self.screen.get_selected_text()
            if selected:
                url = selected.strip()
                if _URL_RE.fullmatch(url):
                    if _open_url(url):
                        self.notify("Opened in browser", timeout=1.5)
                    else:
                        self.notify("Could not open browser", severity="warning", timeout=3)
                    return
            # 2) Reasoning toggle: clicks on a "Thought…" header row toggle the
            #    global ``show_reasoning`` flag. We translate the click's
            #    viewport coordinates to an absolute line index and check it
            #    against the recorded header lines. Selection-active clicks
            #    are skipped above so we don't toggle while selecting text.
            absolute_line = int(event.y) + int(self.scroll_y)
            if absolute_line in self._reasoning_header_lines:
                from rotaris_core.tui.messages import ToggleReasoning

                self.post_message(ToggleReasoning())
                return
        if event.button == 3:  # right-click
            selected = self.screen.get_selected_text()
            if selected:
                app = cast("RotarisTuiApp", self.app)
                ok = app.try_copy_to_clipboard(selected)
                if ok:
                    self.notify("Copied to clipboard", timeout=1.5)
                else:
                    self.notify(
                        app.clipboard_failure_message(),
                        severity="warning",
                        timeout=3,
                    )

    # ------------------------------------------------------------------
    # Text selection support
    # ------------------------------------------------------------------

    @override
    def _render_line(self, y: int, scroll_x: int, width: int) -> Strip:
        """Override to inject offset metadata so Textual's compositor can map
        screen coordinates to content positions — required for text selection.
        """
        if self._using_virtual_transcript:
            strip = self._virtual_transcript.render_line(
                y,
                width,
                self._render_virtual_block,
            )
            if strip is None:
                return Strip.blank(width, self.rich_style)
            strip = strip.apply_offsets(0, y)
            return strip.crop_extend(scroll_x, scroll_x + width, self.rich_style)

        if y >= len(self.lines):
            return Strip.blank(width, self.rich_style)

        key = (y + self._start_line, scroll_x, width, self._widest_line_width)
        if key in self._line_cache:
            return self._line_cache[key]

        line = self.lines[y].apply_offsets(0, y)
        line = line.crop_extend(scroll_x, scroll_x + width, self.rich_style)

        self._line_cache[key] = line
        return line

    @override
    def render_line(self, y: int) -> Strip:
        """Override RichLog's render_line to apply selection highlighting.

        RichLog's render_line bypasses the Visual.to_strips() pipeline that normally
        applies selection styling.  We apply it manually here so the user can see
        what text is being selected.
        """
        if self._using_virtual_transcript:
            scroll_x, scroll_y = self.scroll_offset
            strip = self._render_line(
                scroll_y + y,
                scroll_x,
                self.scrollable_content_region.width,
            ).apply_style(self.rich_style)
            self._sync_virtual_size()
        else:
            strip = super().render_line(y)
        selection = self.text_selection
        if selection is not None:
            scroll_y = self.scroll_offset.y
            content_y = scroll_y + y
            span = selection.get_span(content_y)
            if span is not None:
                start_x, end_x = span
                sel_style = self.selection_style
                strip = self._apply_selection_highlight(strip, start_x, end_x, sel_style)
        return strip

    def _apply_selection_highlight(
        self,
        strip: Strip,
        start_x: int,
        end_x: int,
        style: Style,
    ) -> Strip:
        """Apply selection highlight style to characters in cell range [start_x, end_x).

        When splitting segments at selection boundaries, offset metadata must be
        preserved per-character so the compositor can still map mouse positions to
        correct content coordinates during drag.
        """
        if end_x == -1:
            end_x = strip.cell_length
        if start_x >= end_x:
            return strip

        new_segments: list[Segment] = []
        x = 0
        for text, seg_style, control in strip._segments:
            if control:
                new_segments.append(Segment(text, seg_style, control))
                continue
            seg_width = cell_len(text)
            seg_end = x + seg_width

            if seg_end <= start_x or x >= end_x:
                new_segments.append(Segment(text, seg_style, control))
            elif x >= start_x and seg_end <= end_x:
                combined = (seg_style + style) if seg_style else style
                new_segments.append(Segment(text, combined, control))
            else:
                orig_offset = (
                    seg_style.meta.get("offset") if seg_style and seg_style._meta else None
                )
                for char_idx, char in enumerate(text):
                    cw = cell_len(char)
                    base: Style | None
                    if orig_offset:
                        char_offset = Style.from_meta(
                            {"offset": (orig_offset[0] + char_idx, orig_offset[1])},
                        )
                        base = (seg_style + char_offset) if seg_style else char_offset
                    else:
                        base = seg_style
                    if start_x <= x < end_x:
                        combined = (base + style) if base else style
                        new_segments.append(Segment(char, combined, None))
                    else:
                        new_segments.append(Segment(char, base, None))
                    x += cw
                continue
            x = seg_end
        return Strip(new_segments, strip.cell_length)

    @override
    def get_selection(self, selection: Selection) -> tuple[str, str] | None:
        if self._using_virtual_transcript:
            start_line = 0 if selection.start is None else max(0, selection.start.y)
            if selection.end is None:
                end_line = self._virtual_transcript.total_height
            else:
                end_line = min(self._virtual_transcript.total_height, selection.end.y + 1)
            if end_line <= start_line:
                return None
            width = self._content_width()
            lines = [
                (
                    self._virtual_transcript.render_line(line, width, self._render_virtual_block)
                    or Strip.blank(width)
                ).text
                for line in range(start_line, end_line)
            ]
            shifted = selection
            if selection.start is not None or selection.end is not None:
                from textual.geometry import Offset
                from textual.selection import Selection as TextualSelection

                shifted = TextualSelection(
                    None
                    if selection.start is None
                    else Offset(selection.start.x, selection.start.y - start_line),
                    None
                    if selection.end is None
                    else Offset(selection.end.x, selection.end.y - start_line),
                )
            extracted = shifted.extract("\n".join(lines))
            if not extracted:
                return None
            return extracted, "\n"

        if not self.lines:
            return None
        text = "\n".join(strip.text for strip in self.lines)
        extracted = selection.extract(text)
        if not extracted:
            return None
        return extracted, "\n"

    # ------------------------------------------------------------------
    # Clickable links
    # ------------------------------------------------------------------

    @override
    def write(
        self,
        content: object,
        width: int | None = None,
        expand: bool = False,
        shrink: bool = True,
        scroll_end: bool | None = None,
        animate: bool = False,
    ) -> ChatPanel:
        self._using_virtual_transcript = False
        if isinstance(content, Text):
            self._linkify_text(content)

        # RichLog.write defers all writes until the first Resize arrives and
        # sets _size_known (the on_resize handler in RichLog).  We override
        # on_resize below to add follow-mode anchoring, so we must also
        # replicate the parent's deferred-write flush guard here: if our
        # override somehow skipped the super call (or it hasn't fired yet),
        # force the flush now so writes are never silently swallowed.
        if not self._size_known and self.size.width:
            super().on_resize(events.Resize(self.size, self.virtual_size, self.container_size))

        lines_before = len(self.lines)
        super().write(
            content,
            width=width,
            expand=expand,
            shrink=shrink,
            scroll_end=scroll_end,
            animate=animate,
        )
        self._inject_click_meta(lines_before)
        return self

    def _render_virtual_block(self, block: TranscriptBlock, width: int) -> RenderedBlock:
        renderables: list[object] = []
        reasoning_offsets: set[int] = set()
        self._collect_event_renderables(block, renderables, reasoning_offsets)
        if not renderables:
            strips = [Strip.blank(width)]
        else:
            strips = self._render_renderables_to_strips(renderables, width)
        return RenderedBlock(strips=strips, reasoning_line_offsets=reasoning_offsets)

    def _collect_event_renderables(
        self,
        block: TranscriptBlock,
        renderables: list[object],
        reasoning_offsets: set[int],
    ) -> None:
        event = block.event
        role = event.get("role")
        content = str(event.get("content", ""))
        if role == "breadcrumb":
            p = RenderPalette.from_theme(get_theme())
            renderables.append(Text(content, style=p.fg_dim))
            renderables.append(Text(""))
        elif role == "user":
            self._collect_user_message(renderables, content, hide_header=block.hide_header)
        elif role == "agent":
            agent_name = str(event.get("name", "agent"))
            reasoning = str(event.get("reasoning", ""))
            if reasoning:
                reasoning_offsets.add(len(renderables))
                self._collect_reasoning_block(
                    renderables,
                    reasoning,
                    event.get("thinking_duration"),
                    show_reasoning=bool(getattr(self.app, "show_reasoning", False)),
                )
            self._collect_agent_message(
                renderables,
                agent_name,
                content,
                hide_header=block.hide_header,
            )
        elif role == "thinking":
            if content:
                reasoning_offsets.add(len(renderables))
                self._collect_reasoning_block(
                    renderables,
                    content,
                    event.get("thinking_duration"),
                    show_reasoning=bool(getattr(self.app, "show_reasoning", False)),
                )
        elif role == "child":
            self._collect_child_spawn_message(
                renderables,
                str(event.get("name", "child")),
                str(event.get("persona", "")),
                content,
            )
        elif role == "tool":
            has_phase = "phase" in event
            max_lines = None
            kind = "result"
            if has_phase:
                config = getattr(self.app, "config", None)
                if config is not None and config.display.tool_result_max_lines > 0:
                    max_lines = config.display.tool_result_max_lines
            else:
                kind = "input"
                config = getattr(self.app, "config", None)
                if config is not None and config.display.tool_input_max_lines > 0:
                    max_lines = config.display.tool_input_max_lines
            self._collect_tool_event(
                renderables,
                str(event.get("icon", "")),
                content,
                str(event.get("phase", "tool")),
                max_lines=max_lines,
                kind=kind,
            )
        elif role == "edit_diff":
            self._collect_diff_block(renderables, event.get("diff", {}))
        elif role == "live_stream":
            stream = event.get("stream", {})
            if isinstance(stream, dict):
                self._collect_streaming_agent_message(
                    renderables,
                    str(stream.get("persona", event.get("name", "agent"))),
                    str(stream.get("content", "")),
                    phase=str(stream.get("phase", "streaming")),
                    reasoning=str(stream.get("reasoning", "")),
                    show_reasoning=bool(getattr(self.app, "show_reasoning", False)),
                    elapsed_thinking=self._stream_elapsed(stream),
                    stalled=bool(stream.get("stalled", False)),
                    hide_header=block.hide_header,
                    reasoning_offsets=reasoning_offsets,
                )
        elif role == "queued":
            prompts = event.get("prompts", [])
            if isinstance(prompts, list):
                self._collect_queued_section(renderables, prompts)
        elif role == "system":
            self._collect_system_message(renderables, content, hide_header=block.hide_header)
        else:
            self._collect_system_message(renderables, content, hide_header=block.hide_header)

    def _render_renderables_to_strips(self, renderables: list[object], width: int) -> list[Strip]:
        strips: list[Strip] = []
        console = self.app.console
        render_options = console.options
        for content in renderables:
            if isinstance(content, Text):
                content = content.copy()
                self._linkify_text(content)
            renderable = self._make_renderable(content)
            render_width = max(1, width)
            try:
                measured = measure_renderables(console, render_options, [renderable]).maximum
            except Exception:
                measured = render_width
            render_width = min(max(measured, 1), width)
            options = render_options.update_width(render_width)
            segments = console.render(renderable, options)
            lines = list(Segment.split_lines(segments))
            if not lines:
                strips.append(Strip.blank(render_width))
            else:
                rendered = Strip.from_lines(lines)
                for strip in rendered:
                    strip.adjust_cell_length(render_width)
                strips.extend(rendered)
        self._inject_click_meta_into(strips, 0)
        return strips or [Strip.blank(width)]

    def _inject_click_meta_into(self, strips: list[Strip], from_line: int) -> None:
        for i in range(from_line, len(strips)):
            strip = strips[i]
            new_segs: list[Segment] | None = None
            for j, seg in enumerate(strip._segments):
                text, style, ctrl = seg
                if style and style.link and style.link.startswith("http"):
                    if new_segs is None:
                        new_segs = list(strip._segments)
                    action = f"link('{style.link}')"
                    click_meta = Style.from_meta({"@click": action})
                    new_segs[j] = Segment(text, style + click_meta, ctrl)
            if new_segs is not None:
                strips[i] = Strip(new_segs, strip.cell_length)

    def _linkify_text(self, text: Text) -> None:
        for m in _URL_RE.finditer(text.plain):
            url = m.group(0).rstrip(".,;:!?)")
            text.stylize(Style(link=url), m.start(), m.start() + len(url))

    def _inject_click_meta(self, from_line: int) -> None:
        for i in range(from_line, len(self.lines)):
            strip = self.lines[i]
            new_segs: list[Segment] | None = None
            for j, seg in enumerate(strip._segments):
                text, style, ctrl = seg
                if style and style.link and style.link.startswith("http"):
                    if new_segs is None:
                        new_segs = list(strip._segments)
                    action = f"link('{style.link}')"
                    click_meta = Style.from_meta({"@click": action})
                    new_segs[j] = Segment(text, style + click_meta, ctrl)
            if new_segs is not None:
                self.lines[i] = Strip(new_segs, strip.cell_length)

    def action_link(self, href: str) -> None:
        if href.startswith("http"):
            if _open_url(href):
                self.notify("Opened in browser", timeout=1.5)
            else:
                self.notify("Could not open browser", severity="warning", timeout=3)

    def action_unqueue_prompt(self, prompt_id: str) -> None:
        app = self.app
        unqueue = getattr(app, "unqueue_prompt", None)
        if callable(unqueue):
            unqueue(prompt_id)

    def on_mouse_scroll_up(self, event: events.MouseScrollUp) -> None:
        if self._following:
            self._following = False
            self.auto_scroll = False
            self.border_subtitle = " paused — scroll down to resume "

    def on_mouse_scroll_down(self, event: events.MouseScrollDown) -> None:
        if not self._following:
            self.call_after_refresh(self._maybe_resume_follow)

    def _maybe_resume_follow(self) -> None:
        if self.is_vertical_scroll_end:
            self._following = True
            self.auto_scroll = True
            self._unread_count = 0
            self.border_subtitle = " live "

    @traces(SWR.SWR_1272)
    def watch_scroll_y(self, old_y: float, new_y: float) -> None:
        """Detect scrollbar-driven scrolls (which don't fire mouse wheel events).

        Mouse-wheel scrolls are already handled by ``on_mouse_scroll_up/down``
        which flip the flags synchronously.  This watcher covers the case where
        the user drags the scrollbar or uses keyboard shortcuts that change
        ``scroll_y`` without dispatching a ``MouseScroll`` event.

        ``super()`` is called unconditionally first so that ScrollView always
        syncs ``vertical_scrollbar.position`` to the current scroll value —
        without this the scrollbar thumb stays stuck at the top regardless of
        how the user scrolls.
        """
        super().watch_scroll_y(old_y, new_y)
        if self._programmatic_scroll:
            return
        if self._following and not self.is_vertical_scroll_end:
            # User scrolled away from the bottom via the scrollbar — pause.
            self._following = False
            self.auto_scroll = False
            self.border_subtitle = " paused — scroll down to resume "
        elif not self._following and self.is_vertical_scroll_end:
            # User dragged scrollbar back to the bottom — resume.
            self._following = True
            self.auto_scroll = True
            self._unread_count = 0
            self.border_subtitle = " live "
        # Scroll-up loading trigger: when the user scrolls near the very top
        # of the transcript, request loading older archived events.
        if new_y < 3.0 and not self._programmatic_scroll:
            from rotaris_core.tui.messages import LoadTranscriptPage

            self.post_message(LoadTranscriptPage())

    # ------------------------------------------------------------------
    # Incremental rendering helpers
    # ------------------------------------------------------------------

    def get_cached_markdown(self, text: str) -> Markdown:
        cached = self._markdown_cache.get(text)
        if cached is None:
            cached = Markdown(text)
            self._markdown_cache[text] = cached
        return cached

    def mark_stable(self) -> None:
        self._stable_strip_count = len(self.lines)

    def clear_volatile(self) -> None:
        target = self._stable_strip_count
        if len(self.lines) <= target:
            return
        del self.lines[target:]
        self._line_cache.clear()
        self.virtual_size = Size(self._widest_line_width, len(self.lines))

    # ------------------------------------------------------------------
    # Height-map for O(log n) event-to-line lookups
    # ------------------------------------------------------------------

    def reset_height_map(self) -> None:
        """Clear the cumulative height map (called before full rebuild)."""
        self._event_line_starts.clear()
        self._event_line_counts.clear()
        self._last_rendered_event_count = 0

    def record_event_height(self, line_count: int) -> None:
        """Record that the most recently rendered event spans *line_count* lines.

        Call this once per event during full rebuild, after all writes for
        that event have completed.  For incremental appends, use
        ``extend_height_map`` instead.
        """
        start = (
            self._event_line_starts[-1] + self._event_line_counts[-1]
            if self._event_line_starts
            else 0
        )
        self._event_line_starts.append(start)
        self._event_line_counts.append(max(line_count, 1))
        self._last_rendered_event_count = len(self._event_line_starts)

    def extend_height_map(self, line_counts: list[int]) -> None:
        """Extend the height map for newly appended events (incremental path).

        *line_counts* must have one entry per newly appended event.
        """
        if not line_counts:
            return
        start = (
            self._event_line_starts[-1] + self._event_line_counts[-1]
            if self._event_line_starts
            else 0
        )
        for lc in line_counts:
            self._event_line_starts.append(start)
            self._event_line_counts.append(max(lc, 1))
            start += max(lc, 1)
        self._last_rendered_event_count = len(self._event_line_starts)

    def get_visible_event_range(
        self,
        scroll_y: float,
        viewport_lines: int,
        *,
        buffer_events: int = 5,
    ) -> tuple[int, int]:
        """Return ``(first_visible_event, last_visible_event)`` indices.

        Uses binary search on the cumulative line-start map.  A buffer of
        *buffer_events* is added above and below the visible range to avoid
        flickering on small scrolls.  Indices are inclusive.

        If the height map is empty (first render), returns ``(0, -1)`` to
        signal "render everything".
        """
        if not self._event_line_starts:
            return (0, -1)
        vis_start = max(0, int(scroll_y))
        vis_end = vis_start + viewport_lines
        total_events = len(self._event_line_starts)
        first = bisect.bisect_right(self._event_line_starts, vis_start) - 1
        first = max(0, first - buffer_events)
        last = bisect.bisect_left(self._event_line_starts, vis_end)
        last = min(total_events - 1, last + buffer_events)
        return (first, last)

    # ------------------------------------------------------------------
    # Rebuild helpers (used by _refresh_widgets in app.py)
    # ------------------------------------------------------------------

    def begin_rebuild(self) -> None:
        """Save scroll position (if paused) then clear for rebuild."""
        self._in_full_rebuild = True
        if not self._following and self.scroll_y > 0:
            self._saved_scroll_y = self.scroll_y
        self._unread_count = 0
        self._programmatic_scroll = True
        self.clear()
        self._programmatic_scroll = False
        self._stable_strip_count = 0
        self._reasoning_header_lines.clear()
        self.reset_height_map()

        if self._breadcrumb is not None:
            p = RenderPalette.from_theme(get_theme())
            self.write(Text(self._breadcrumb, style=p.fg_dim))
            self.write(Text(""))

    def end_rebuild(self) -> None:
        """After rebuild: scroll to bottom in follow mode, else restore position."""
        if self._following:
            self._programmatic_scroll = True
            self.scroll_end(animate=False)
            self._programmatic_scroll = False
        elif self._in_full_rebuild:
            # Only restore the saved position after a *full* rebuild.  Incremental
            # updates (streaming ticks) must not snap the user back on every frame.
            self.call_after_refresh(self._restore_scroll)
        self._in_full_rebuild = False

    def _restore_scroll(self) -> None:
        if not self._following:
            self._programmatic_scroll = True
            self.scroll_y = self._saved_scroll_y
            self._programmatic_scroll = False

    def _track_new_message(self) -> None:
        if not self._following:
            self._unread_count += 1
            suffix = "s" if self._unread_count > 1 else ""
            self.border_subtitle = f" ↓ {self._unread_count} new message{suffix} "

    def add_user_message(self, text: str, *, hide_header: bool = False) -> None:
        p = RenderPalette.from_theme(get_theme())
        if not hide_header:
            msg = Text.assemble(
                ("❯", p.user_label),
                (" ", p.fg_dim),
                (text, p.fg),
            )
            self.write(msg)
        else:
            self.write(Text.assemble(("  ", p.fg_dim), (text, p.fg)))
        self._track_new_message()

    def add_agent_message(self, persona: str, text: str, *, hide_header: bool = False) -> None:
        p = RenderPalette.from_theme(get_theme())
        if not hide_header:
            self.write(
                Text.assemble(
                    ("○", p.agent_label),
                    (" ", p.fg_dim),
                    (persona, p.persona_label),
                ),
            )
        self.write(self.get_cached_markdown(text))
        self._track_new_message()

    def add_reasoning_block(
        self,
        reasoning: str,
        duration: float | None = None,
        *,
        show_reasoning: bool = True,
    ) -> None:
        """Render a finalized reasoning block with a clickable, collapsible
        header. The header line is recorded so ``on_mouse_up`` can detect
        clicks on it and toggle the global ``show_reasoning`` flag.
        """
        p = RenderPalette.from_theme(get_theme())
        duration_text = f" for {duration:.0f}s" if duration else ""
        marker = "▼" if show_reasoning else "▶"
        hint = "click to collapse" if show_reasoning else "click to expand"
        # Record the absolute line index of the header BEFORE writing it so
        # on_mouse_up can map clicks back to a header row.
        header_line = len(self.lines)
        self.write(
            Text.assemble(
                (f"{marker} ", f"bold {p.green}"),
                (f"Thought{duration_text}", p.fg_subtle),
                (f"  ({hint})", p.fg_dim),
            ),
        )
        self._reasoning_header_lines.add(header_line)
        if show_reasoning and reasoning.strip():
            self.write(Text(reasoning, style=p.fg_muted))

    def add_streaming_agent_message(
        self,
        persona: str,
        text: str,
        *,
        phase: str,
        reasoning: str = "",
        show_reasoning: bool = False,
        elapsed_thinking: float | None = None,
        stalled: bool = False,
        hide_header: bool = False,
    ) -> None:
        p = RenderPalette.from_theme(get_theme())
        if phase == "thinking":
            frame = BRAILLE_FRAMES[int(time.monotonic() * 10) % len(BRAILLE_FRAMES)]
            if not hide_header:
                self.write(
                    Text.assemble(
                        ("○", p.agent_label),
                        (" ", p.fg_dim),
                        (persona, p.persona_label),
                        (" ", p.fg_dim),
                        (f"{frame} thinking", f"bold {p.yellow}"),
                    ),
                )
            else:
                self.write(Text.assemble((f"{frame} thinking", f"bold {p.yellow}")))
            elapsed_text = (
                f" ({int(elapsed_thinking)}s)"
                if elapsed_thinking is not None and elapsed_thinking >= 1
                else ""
            )
            if reasoning.strip():
                marker = "▼" if show_reasoning else "▶"
                hint = "click to collapse" if show_reasoning else "click to expand"
                header_line = len(self.lines)
                self.write(
                    Text.assemble(
                        (f"{marker} ", f"bold {p.green}"),
                        (f"Thinking…{elapsed_text}", p.fg_subtle),
                        (f"  ({hint})", p.fg_dim),
                    ),
                )
                self._reasoning_header_lines.add(header_line)
                if show_reasoning:
                    self.write(Text(reasoning, style=p.fg_muted))
            elif stalled:
                self.write(
                    Text(
                        f"Waiting on LLM{elapsed_text}… (model is not streaming)",
                        style=f"bold {p.yellow}",
                    ),
                )
            else:
                self.write(Text(f"Thinking…{elapsed_text}", style=p.fg_subtle))
        else:
            if not hide_header:
                self.write(
                    Text.assemble(
                        ("○", p.agent_label),
                        (" ", p.fg_dim),
                        (persona, p.persona_label),
                        (" ", p.fg_dim),
                        ("streaming", f"bold {p.yellow}"),
                    ),
                )
            if reasoning.strip():
                marker = "▼" if show_reasoning else "▶"
                hint = "click to collapse" if show_reasoning else "click to expand"
                header_line = len(self.lines)
                self.write(
                    Text.assemble(
                        (f"{marker} ", f"bold {p.green}"),
                        ("Thought", p.fg_subtle),
                        (f"  ({hint})", p.fg_dim),
                    ),
                )
                self._reasoning_header_lines.add(header_line)
                if show_reasoning:
                    self.write(Text(reasoning, style=p.fg_muted))
            if text.strip():
                preview, omitted_chars = _streaming_preview_tail(text)
                if omitted_chars:
                    self.write(
                        Text(
                            f"... {omitted_chars:,} earlier chars hidden while streaming; "
                            "full message renders when complete.",
                            style=p.fg_dim,
                        ),
                    )
                    self.write(Text(preview, style=p.fg))
                else:
                    try:
                        self.write(Markdown(_prepare_streaming_markdown(preview)))
                    except Exception:
                        _log.warning(
                            "Markdown render failed for streaming preview; "
                            "falling back to plain text"
                        )
                        self.write(Text(preview, style=p.fg))
        self._track_new_message()

    def add_child_spawn_message(self, name: str, persona: str, task: str) -> None:
        p = RenderPalette.from_theme(get_theme())
        summary = self._compact_text(task, limit=self._MAX_CHILD_LINE_CHARS)
        line = Text()
        line.append("⎇", style=f"bold {p.purple}")
        line.append(" ", style=p.fg_dim)
        line.append(name or "unnamed", style=f"bold {p.fg}")
        if persona:
            line.append(" ", style=p.fg_dim)
            line.append(persona, style=p.purple)
        if summary:
            line.append("  ", style=p.fg_dim)
            line.append(summary, style=p.fg_subtle)
        self.write(line)
        self._track_new_message()

    def add_report(self, report: ChildReportArtifact) -> None:
        from rotaris_core.tui.widgets.report_viewer import build_report_renderable

        self.write(build_report_renderable(report))

    def add_tool_event(
        self,
        icon: str,
        content: str,
        phase: str,
        *,
        max_lines: int | None = None,
        kind: str = "result",
    ) -> None:
        p = RenderPalette.from_theme(get_theme())
        style = p.red if phase in ("failed", "blocked") else p.fg_subtle

        # Apply line truncation for display only (full content stays in transcript)
        truncated = False
        truncated_content = content
        if max_lines is not None:
            lines = content.split("\n")
            if len(lines) > max_lines:
                remaining = len(lines) - max_lines
                truncated_content = "\n".join(lines[:max_lines])
                truncated = True

        line = Text()
        rendered_icon = self._render_status_icon(icon)
        if rendered_icon:
            line.append(rendered_icon + " ", style=style)
        line.append(truncated_content, style=style)
        self.write(line)
        if truncated:
            indicator_style = p.fg_dim
            label = "tool call input" if kind == "input" else "tool result"
            self.write(Text(f"… +{remaining} more lines, {label} truncated", style=indicator_style))

    def add_diff_block(self, raw_diff: object) -> None:
        from rotaris_core.edit_diff import EditDiffArtifact

        try:
            diff = EditDiffArtifact.model_validate(raw_diff)
        except Exception:  # noqa: BLE001
            return

        p = RenderPalette.from_theme(get_theme())
        line_number_width = max((len(str(entry.line_number)) for entry in diff.entries), default=1)

        header = Text()
        header.append("@ ", style=f"bold {p.fg}")
        header.append(diff.path, style=f"bold {p.fg}")
        header.append(" @", style=f"bold {p.fg}")
        if diff.created:
            header.append(" [Created]", style=f"bold {p.green}")
        header.append(f" +{diff.added_lines}", style=f"bold {p.green}")
        header.append(f" -{diff.removed_lines}", style=f"bold {p.red}")
        self.write(header)

        for entry in diff.entries:
            line = Text()
            line.append(f"[{entry.line_number:>{line_number_width}}]", style=p.fg_dim)
            if entry.kind == "add":
                line.append("+ ", style=f"bold {p.green}")
                line.append(entry.text, style=p.green)
            elif entry.kind == "delete":
                line.append("- ", style=f"bold {p.red}")
                line.append(entry.text, style=p.red)
            else:
                line.append("  ", style=p.fg_dim)
                line.append(entry.text, style=p.fg_dim)
            self.write(line)

        if diff.truncated and diff.remaining_changed_lines > 0:
            self.write(
                Text(
                    f"... +{diff.remaining_changed_lines} more lines, diff truncated",
                    style=p.fg_dim,
                ),
            )

    def add_system_message(self, text: str, *, hide_header: bool = False) -> None:
        p = RenderPalette.from_theme(get_theme())
        if not hide_header:
            msg = Text.assemble(
                ("■", p.system_label),
                (" ", p.fg_dim),
                (text, p.fg_muted),
            )
            self.write(msg)
        else:
            self.write(Text.assemble(("  ", p.fg_dim), (text, p.fg_muted)))
        self._track_new_message()

    def add_queued_section(self, prompts: list[QueuedPrompt]) -> None:
        if not prompts:
            return

        p = RenderPalette.from_theme(get_theme())
        self.write(Text(""))
        self.write(
            Text.assemble(
                ("⌛", f"bold {p.yellow}"),
                (" ", p.fg_dim),
                (f"queued for next iteration ({len(prompts)})", f"bold {p.yellow}"),
                ("  click ", p.fg_dim),
                ("unqueue", f"bold {p.red}"),
                (" to remove", p.fg_dim),
            ),
        )

        for prompt in prompts:
            action = f"unqueue_prompt('{prompt.id}')"
            action_style = Style.parse(f"bold {p.red}") + Style.from_meta({"@click": action})

            header = Text()
            header.append("◌", style=f"bold {p.yellow}")
            header.append(" ", style=p.fg_dim)
            header.append(prompt.id[:8], style=f"bold {p.yellow}")
            header.append("  ", style=p.fg_dim)
            header.append("[unqueue]", style=action_style)
            self.write(header)

            indented = "\n".join(f"   {line}" for line in (prompt.content.splitlines() or [""]))
            self.write(Text(indented, style=p.fg_muted))

    def add_auth_message(
        self,
        provider: str,
        *,
        url: str | None = None,
        code: str | None = None,
        status: str | None = None,
    ) -> None:
        p = RenderPalette.from_theme(get_theme())
        header = Text.assemble(
            ("🔐", p.auth_label),
            (" ", p.fg_dim),
            (provider, p.persona_label),
        )
        self.write(header)

        if status:
            self.write(Text(status, style=p.fg))
        if url and code:
            md = f"Open: [{url}]({url})\n\nEnter code: `{code}`"
            self.write(Markdown(md))
        elif url:
            md = f"Open: [{url}]({url})"
            self.write(Markdown(md))
        elif code:
            self.write(Text.assemble(("Code: ", p.fg_dim), (code, f"bold {p.fg}")))

        self._track_new_message()

    def _collect_user_message(
        self,
        renderables: list[object],
        text: str,
        *,
        hide_header: bool = False,
    ) -> None:
        p = RenderPalette.from_theme(get_theme())
        if not hide_header:
            renderables.append(
                Text.assemble(
                    ("❯", p.user_label),
                    (" ", p.fg_dim),
                    (text, p.fg),
                ),
            )
        else:
            renderables.append(Text.assemble(("  ", p.fg_dim), (text, p.fg)))

    def _collect_agent_message(
        self,
        renderables: list[object],
        persona: str,
        text: str,
        *,
        hide_header: bool = False,
    ) -> None:
        p = RenderPalette.from_theme(get_theme())
        if not hide_header:
            renderables.append(
                Text.assemble(
                    ("○", p.agent_label),
                    (" ", p.fg_dim),
                    (persona, p.persona_label),
                ),
            )
        renderables.append(Markdown(text))

    def _collect_reasoning_block(
        self,
        renderables: list[object],
        reasoning: str,
        duration: object = None,
        *,
        show_reasoning: bool = True,
    ) -> None:
        p = RenderPalette.from_theme(get_theme())
        duration_text = ""
        if isinstance(duration, int | float) and duration:
            duration_text = f" for {duration:.0f}s"
        marker = "▼" if show_reasoning else "▶"
        hint = "click to collapse" if show_reasoning else "click to expand"
        renderables.append(
            Text.assemble(
                (f"{marker} ", f"bold {p.green}"),
                (f"Thought{duration_text}", p.fg_subtle),
                (f"  ({hint})", p.fg_dim),
            ),
        )
        if show_reasoning and reasoning.strip():
            renderables.append(Text(reasoning, style=p.fg_muted))

    def _collect_streaming_agent_message(
        self,
        renderables: list[object],
        persona: str,
        text: str,
        *,
        phase: str,
        reasoning: str = "",
        show_reasoning: bool = False,
        elapsed_thinking: float | None = None,
        stalled: bool = False,
        hide_header: bool = False,
        reasoning_offsets: set[int] | None = None,
    ) -> None:
        p = RenderPalette.from_theme(get_theme())
        if phase == "thinking":
            frame = BRAILLE_FRAMES[int(time.monotonic() * 10) % len(BRAILLE_FRAMES)]
            if not hide_header:
                renderables.append(
                    Text.assemble(
                        ("○", p.agent_label),
                        (" ", p.fg_dim),
                        (persona, p.persona_label),
                        (" ", p.fg_dim),
                        (f"{frame} thinking", f"bold {p.yellow}"),
                    ),
                )
            else:
                renderables.append(Text.assemble((f"{frame} thinking", f"bold {p.yellow}")))
            elapsed_text = (
                f" ({int(elapsed_thinking)}s)"
                if elapsed_thinking is not None and elapsed_thinking >= 1
                else ""
            )
            if reasoning.strip():
                if reasoning_offsets is not None:
                    reasoning_offsets.add(len(renderables))
                marker = "▼" if show_reasoning else "▶"
                hint = "click to collapse" if show_reasoning else "click to expand"
                renderables.append(
                    Text.assemble(
                        (f"{marker} ", f"bold {p.green}"),
                        (f"Thinking…{elapsed_text}", p.fg_subtle),
                        (f"  ({hint})", p.fg_dim),
                    ),
                )
                if show_reasoning:
                    renderables.append(Text(reasoning, style=p.fg_muted))
            elif stalled:
                renderables.append(
                    Text(
                        f"Waiting on LLM{elapsed_text}… (model is not streaming)",
                        style=f"bold {p.yellow}",
                    ),
                )
            else:
                renderables.append(Text(f"Thinking…{elapsed_text}", style=p.fg_subtle))
            return

        if not hide_header:
            renderables.append(
                Text.assemble(
                    ("○", p.agent_label),
                    (" ", p.fg_dim),
                    (persona, p.persona_label),
                    (" ", p.fg_dim),
                    ("streaming", f"bold {p.yellow}"),
                ),
            )
        if reasoning.strip():
            if reasoning_offsets is not None:
                reasoning_offsets.add(len(renderables))
            marker = "▼" if show_reasoning else "▶"
            hint = "click to collapse" if show_reasoning else "click to expand"
            renderables.append(
                Text.assemble(
                    (f"{marker} ", f"bold {p.green}"),
                    ("Thought", p.fg_subtle),
                    (f"  ({hint})", p.fg_dim),
                ),
            )
            if show_reasoning:
                renderables.append(Text(reasoning, style=p.fg_muted))
        if text.strip():
            preview, omitted_chars = _streaming_preview_tail(text)
            if omitted_chars:
                renderables.append(
                    Text(
                        f"... {omitted_chars:,} earlier chars hidden while streaming; "
                        "full message renders when complete.",
                        style=p.fg_dim,
                    ),
                )
                renderables.append(Text(preview, style=p.fg))
            else:
                try:
                    renderables.append(Markdown(_prepare_streaming_markdown(preview)))
                except Exception:
                    _log.warning(
                        "Markdown render failed for streaming preview; falling back to plain text",
                    )
                    renderables.append(Text(preview, style=p.fg))

    def _collect_child_spawn_message(
        self,
        renderables: list[object],
        name: str,
        persona: str,
        task: str,
    ) -> None:
        p = RenderPalette.from_theme(get_theme())
        summary = self._compact_text(task, limit=self._MAX_CHILD_LINE_CHARS)
        line = Text()
        line.append("⎇", style=f"bold {p.purple}")
        line.append(" ", style=p.fg_dim)
        line.append(name or "unnamed", style=f"bold {p.fg}")
        if persona:
            line.append(" ", style=p.fg_dim)
            line.append(persona, style=p.purple)
        if summary:
            line.append("  ", style=p.fg_dim)
            line.append(summary, style=p.fg_subtle)
        renderables.append(line)

    def _collect_tool_event(
        self,
        renderables: list[object],
        icon: str,
        content: str,
        phase: str,
        *,
        max_lines: int | None = None,
        kind: str = "result",
    ) -> None:
        p = RenderPalette.from_theme(get_theme())
        style = p.red if phase in ("failed", "blocked") else p.fg_subtle
        truncated = False
        truncated_content = content
        remaining = 0
        if max_lines is not None:
            lines = content.split("\n")
            if len(lines) > max_lines:
                remaining = len(lines) - max_lines
                truncated_content = "\n".join(lines[:max_lines])
                truncated = True

        line = Text()
        rendered_icon = self._render_status_icon(icon)
        if rendered_icon:
            line.append(rendered_icon + " ", style=style)
        line.append(truncated_content, style=style)
        renderables.append(line)
        if truncated:
            label = "tool call input" if kind == "input" else "tool result"
            renderables.append(
                Text(f"… +{remaining} more lines, {label} truncated", style=p.fg_dim),
            )

    def _collect_diff_block(self, renderables: list[object], raw_diff: object) -> None:
        from rotaris_core.edit_diff import EditDiffArtifact

        try:
            diff = EditDiffArtifact.model_validate(raw_diff)
        except Exception:  # noqa: BLE001
            return

        p = RenderPalette.from_theme(get_theme())
        line_number_width = max((len(str(entry.line_number)) for entry in diff.entries), default=1)
        header = Text()
        header.append("@ ", style=f"bold {p.fg}")
        header.append(diff.path, style=f"bold {p.fg}")
        header.append(" @", style=f"bold {p.fg}")
        if diff.created:
            header.append(" [Created]", style=f"bold {p.green}")
        header.append(f" +{diff.added_lines}", style=f"bold {p.green}")
        header.append(f" -{diff.removed_lines}", style=f"bold {p.red}")
        renderables.append(header)

        for entry in diff.entries:
            line = Text()
            line.append(f"[{entry.line_number:>{line_number_width}}]", style=p.fg_dim)
            if entry.kind == "add":
                line.append("+ ", style=f"bold {p.green}")
                line.append(entry.text, style=p.green)
            elif entry.kind == "delete":
                line.append("- ", style=f"bold {p.red}")
                line.append(entry.text, style=p.red)
            else:
                line.append("  ", style=p.fg_dim)
                line.append(entry.text, style=p.fg_dim)
            renderables.append(line)

        if diff.truncated and diff.remaining_changed_lines > 0:
            renderables.append(
                Text(
                    f"... +{diff.remaining_changed_lines} more lines, diff truncated",
                    style=p.fg_dim,
                ),
            )

    def _collect_system_message(
        self,
        renderables: list[object],
        text: str,
        *,
        hide_header: bool = False,
    ) -> None:
        p = RenderPalette.from_theme(get_theme())
        if not hide_header:
            renderables.append(
                Text.assemble(
                    ("■", p.system_label),
                    (" ", p.fg_dim),
                    (text, p.fg_muted),
                ),
            )
        else:
            renderables.append(Text.assemble(("  ", p.fg_dim), (text, p.fg_muted)))

    def _collect_queued_section(
        self, renderables: list[object], prompts: list[QueuedPrompt]
    ) -> None:
        if not prompts:
            return
        p = RenderPalette.from_theme(get_theme())
        renderables.append(Text(""))
        renderables.append(
            Text.assemble(
                ("⌛", f"bold {p.yellow}"),
                (" ", p.fg_dim),
                (f"queued for next iteration ({len(prompts)})", f"bold {p.yellow}"),
                ("  click ", p.fg_dim),
                ("unqueue", f"bold {p.red}"),
                (" to remove", p.fg_dim),
            ),
        )
        for prompt in prompts:
            action = f"unqueue_prompt('{prompt.id}')"
            action_style = Style.parse(f"bold {p.red}") + Style.from_meta({"@click": action})
            header = Text()
            header.append("◌", style=f"bold {p.yellow}")
            header.append(" ", style=p.fg_dim)
            header.append(prompt.id[:8], style=f"bold {p.yellow}")
            header.append("  ", style=p.fg_dim)
            header.append("[unqueue]", style=action_style)
            renderables.append(header)
            indented = "\n".join(f"   {line}" for line in (prompt.content.splitlines() or [""]))
            renderables.append(Text(indented, style=p.fg_muted))

    def _stream_elapsed(self, stream: dict[str, Any]) -> float | None:
        started_at = float(stream.get("thinking_started_at", 0.0) or 0.0)
        return (time.monotonic() - started_at) if started_at else None

    def _compact_text(self, text: str, *, limit: int) -> str:
        normalized = " ".join(text.split())
        if len(normalized) <= limit:
            return normalized
        return normalized[: limit - 1].rstrip() + "…"

    def _render_status_icon(self, icon: str) -> str:
        if icon in {"", "[OK]", "✅"}:
            return ""
        if icon in {"ANIMATED_TOOL", "ANIMATED_THINKING", "[TOOL]", "💭"}:
            return BRAILLE_FRAMES[int(time.monotonic() * 10) % len(BRAILLE_FRAMES)]
        if icon in {"[ERR]", "[X]", "❌", "✗"}:
            return "✗"
        if icon == "[!]":
            return "!"
        return icon
