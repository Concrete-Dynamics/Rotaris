from __future__ import annotations

import bisect
import hashlib
import json
from collections import OrderedDict
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from textual.strip import Strip

from rotaris_core.reqtocode import SWR, traces

MAX_RENDERED_BLOCKS = 300
MAX_RENDERED_ROWS = 10_000
MAX_MARKDOWN_SOURCE_CHARS = 2_000_000


@dataclass(frozen=True, slots=True)
class TranscriptBlockKey:
    """Stable identity plus render-affecting fingerprint for one transcript block."""

    identity: str
    fingerprint: str
    theme: str
    volatile: bool = False

    @property
    def content(self) -> tuple[str, str, str]:
        """Return the parts that decide *what* is drawn, ignoring where it lands."""
        return (self.identity, self.fingerprint, self.theme)


@dataclass(frozen=True, slots=True)
class TranscriptBlock:
    """One displayable transcript block.

    The raw transcript event shape remains unchanged; this wraps it with the
    state needed by the renderer.
    """

    index: int
    event: dict[str, Any]
    hide_header: bool
    key: TranscriptBlockKey
    estimated_height: int


@dataclass(slots=True)
class RenderedBlock:
    strips: list[Strip]
    reasoning_line_offsets: set[int]

    @property
    def height(self) -> int:
        return max(1, len(self.strips))


RenderBlock = Callable[[TranscriptBlock, int], RenderedBlock]

# Block content plus the width it was rendered at: the pane hands out its final
# width only after layout settles, so the same block is legitimately rendered at
# more than one width during a run (SWR-1280).
RenderCacheKey = tuple[str, str, str, int]


def fingerprint_event(event: dict[str, Any], *, hide_header: bool, mode: dict[str, Any]) -> str:
    """Return a compact fingerprint for fields that affect rendering."""

    payload = {
        "event": event,
        "hide_header": hide_header,
        "mode": mode,
    }
    data = json.dumps(payload, sort_keys=True, default=str, separators=(",", ":"))
    return hashlib.blake2b(data.encode("utf-8"), digest_size=16).hexdigest()


def estimate_event_height(event: dict[str, Any], *, hide_header: bool) -> int:
    role = str(event.get("role", ""))
    content = str(event.get("content", ""))
    base = 0 if hide_header else 1
    if role in {"agent", "user", "system", "thinking"}:
        base += max(1, min(8, len(content.splitlines()) or 1))
        if str(event.get("reasoning", "")).strip():
            base += 1
    elif role == "tool":
        base += max(1, min(4, len(content.splitlines()) or 1))
    elif role == "edit_diff":
        entries = (
            event.get("diff", {}).get("entries", []) if isinstance(event.get("diff"), dict) else []
        )
        base += max(1, min(12, len(entries) + 1))
    else:
        base += max(1, min(4, len(content.splitlines()) or 1))
    return max(1, base)


@traces(SWR.SWR_1279, SWR.SWR_1280, SWR.SWR_1281, SWR.SWR_1282, SWR.SWR_1283)
class TranscriptRenderStore:
    """Virtual transcript line index with bounded rendered-block caches."""

    def __init__(self) -> None:
        self.blocks: list[TranscriptBlock] = []
        self._starts: list[int] = []
        self._heights: dict[str, int] = {}
        self._rendered: OrderedDict[RenderCacheKey, RenderedBlock] = OrderedDict()
        self._rendered_rows = 0
        self._markdown_sources: OrderedDict[str, str] = OrderedDict()
        self._markdown_source_chars = 0
        self.render_call_count = 0

    @property
    def total_height(self) -> int:
        if not self.blocks:
            return 0
        last = self.blocks[-1]
        return self._starts[-1] + self.height_for(last)

    @property
    def cache_block_count(self) -> int:
        return len(self._rendered)

    @property
    def cache_row_count(self) -> int:
        return self._rendered_rows

    @property
    def markdown_source_chars(self) -> int:
        return self._markdown_source_chars

    def set_blocks(self, blocks: list[TranscriptBlock]) -> None:
        self.blocks = blocks
        active_identities = {block.key.identity for block in blocks}
        for identity in list(self._heights):
            if identity not in active_identities:
                self._heights.pop(identity, None)
        active_content = {block.key.content for block in blocks if not block.key.volatile}
        for key in list(self._rendered):
            if key[:3] not in active_content:
                self._drop_rendered(key)
        self._rebuild_starts()

    def clear(self) -> None:
        self.blocks.clear()
        self._starts.clear()
        self._heights.clear()
        self._rendered.clear()
        self._rendered_rows = 0
        self._markdown_sources.clear()
        self._markdown_source_chars = 0

    def height_for(self, block: TranscriptBlock) -> int:
        return self._heights.get(block.key.identity, block.estimated_height)

    def block_index_at_line(self, line: int) -> int | None:
        if not self.blocks:
            return None
        index = bisect.bisect_right(self._starts, max(0, line)) - 1
        return min(max(index, 0), len(self.blocks) - 1)

    def line_to_block(self, line: int) -> tuple[TranscriptBlock, int] | None:
        index = self.block_index_at_line(line)
        if index is None:
            return None
        block = self.blocks[index]
        return block, max(0, line - self._starts[index])

    def render_block(
        self,
        block: TranscriptBlock,
        width: int,
        renderer: RenderBlock,
    ) -> RenderedBlock:
        cache_key: RenderCacheKey = (*block.key.content, width)
        if not block.key.volatile:
            cached = self._rendered.get(cache_key)
            if cached is not None:
                self._rendered.move_to_end(cache_key)
                return cached

        self.render_call_count += 1
        rendered = renderer(block, width)
        self._record_height(block, rendered.height)
        if not block.key.volatile:
            self._rendered[cache_key] = rendered
            self._rendered_rows += rendered.height
            self._enforce_render_cache_limits()
            content = str(block.event.get("content", ""))
            if content and len(content) < MAX_MARKDOWN_SOURCE_CHARS:
                self._remember_markdown_source(block.key.fingerprint, content)
        return rendered

    def render_line(
        self,
        line: int,
        width: int,
        renderer: RenderBlock,
    ) -> Strip | None:
        mapped = self.line_to_block(line)
        if mapped is None:
            return None
        block, offset = mapped
        rendered = self.render_block(block, width, renderer)
        if offset >= len(rendered.strips):
            return Strip.blank(width)
        return rendered.strips[offset]

    def visible_blocks(self, start_line: int, end_line: int, *, buffer_blocks: int = 4) -> range:
        if not self.blocks:
            return range(0)
        first = self.block_index_at_line(start_line) or 0
        last = self.block_index_at_line(end_line) or len(self.blocks) - 1
        first = max(0, first - buffer_blocks)
        last = min(len(self.blocks) - 1, last + buffer_blocks)
        return range(first, last + 1)

    def start_for_block(self, block_index: int) -> int:
        if not self._starts:
            return 0
        return self._starts[min(max(block_index, 0), len(self._starts) - 1)]

    def _record_height(self, block: TranscriptBlock, height: int) -> None:
        height = max(1, height)
        if self._heights.get(block.key.identity) == height:
            return
        self._heights[block.key.identity] = height
        self._rebuild_starts()

    def _rebuild_starts(self) -> None:
        self._starts = []
        next_start = 0
        for block in self.blocks:
            self._starts.append(next_start)
            next_start += self.height_for(block)

    def _drop_rendered(self, key: RenderCacheKey) -> None:
        rendered = self._rendered.pop(key, None)
        if rendered is not None:
            self._rendered_rows = max(0, self._rendered_rows - rendered.height)

    def _enforce_render_cache_limits(self) -> None:
        while (
            len(self._rendered) > MAX_RENDERED_BLOCKS or self._rendered_rows > MAX_RENDERED_ROWS
        ) and self._rendered:
            key, rendered = self._rendered.popitem(last=False)
            del key
            self._rendered_rows = max(0, self._rendered_rows - rendered.height)

    def _remember_markdown_source(self, key: str, source: str) -> None:
        old = self._markdown_sources.pop(key, None)
        if old is not None:
            self._markdown_source_chars -= len(old)
        self._markdown_sources[key] = source
        self._markdown_source_chars += len(source)
        while self._markdown_source_chars > MAX_MARKDOWN_SOURCE_CHARS and self._markdown_sources:
            _, removed = self._markdown_sources.popitem(last=False)
            self._markdown_source_chars = max(0, self._markdown_source_chars - len(removed))
