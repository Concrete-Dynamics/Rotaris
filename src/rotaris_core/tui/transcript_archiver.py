"""Transcript event archive — JSONL-based disk storage for evicted transcript events.

Used by the TUI to offload older transcript events from RAM to a disk-backed
archive.  Events are stored one JSON line per event in the session state directory.
"""

from __future__ import annotations

import asyncio
import json
import threading
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from pathlib import Path
    from typing import Any

_ARCHIVE_LOCK = threading.Lock()


@traces(SWR.SWR_1271, SWR.SWR_1273, SWR.SWR_1274)
class TranscriptArchiver:
    """Append-only JSONL archive for evicted transcript events.

    Each session gets one archive file::

        <session_dir>/state/transcript_archive.jsonl

    Events are appended one JSON line per event.  Pages (fixed-size chunks)
    are mapped by offset (page index): page 0 = lines 0..page_size-1, etc.
    """

    def __init__(self, session_dir: Path, page_size: int = 50) -> None:
        self._session_dir = session_dir
        self._page_size = page_size
        self._path = session_dir / "state" / "transcript_archive.jsonl"

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    @property
    def path(self) -> Path:
        return self._path

    @property
    def page_size(self) -> int:
        return self._page_size

    def append(self, events: list[dict[str, Any]]) -> None:
        """Append a batch of events to the archive.

        Thread-safe — uses a module-level ``threading.Lock`` so concurrent
        writes from different archiver instances (or the diagnostics module)
        never interleave lines.
        """
        if not events:
            return
        self._path.parent.mkdir(parents=True, exist_ok=True)
        lines = "\n".join(json.dumps(e, sort_keys=True, default=str) for e in events) + "\n"
        with _ARCHIVE_LOCK, self._path.open("a", encoding="utf-8") as handle:
            handle.write(lines)

    def total_events(self) -> int:
        """Return the total number of archived events (O(n) line count)."""
        if not self._path.exists():
            return 0
        count = 0
        with self._path.open(encoding="utf-8") as handle:
            for line in handle:
                if line.strip():
                    count += 1
        return count

    def page_count(self) -> int:
        total = self.total_events()
        return (total + self._page_size - 1) // self._page_size

    def newest_page_offset(self) -> int | None:
        """Return the newest archived page offset, or ``None`` for an empty archive."""
        total = self.total_events()
        if total <= 0:
            return None
        return (total - 1) // self._page_size

    def event_count_for_page(self, page: int) -> int:
        """Return the number of events currently stored in *page*."""
        total = self.total_events()
        if total <= 0 or page < 0:
            return 0
        start = page * self._page_size
        if start >= total:
            return 0
        return min(self._page_size, total - start)

    async def read_page(self, page: int) -> list[dict[str, Any]] | None:
        """Read a page of events from the archive via ``asyncio.to_thread``.

        Returns ``None`` if the page index is out of range.
        """
        return await asyncio.to_thread(self._read_page_sync, page)

    async def read_last_pages(self, num_pages: int) -> list[dict[str, Any]]:
        """Read the most recent *num_pages* pages from the archive."""
        total_pages = self.page_count()
        if total_pages == 0:
            return []
        start_page = max(0, total_pages - num_pages)
        events: list[dict[str, Any]] = []
        for p in range(start_page, total_pages):
            page_events = await self.read_page(p)
            if page_events:
                events.extend(page_events)
        return events

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _read_page_sync(self, page: int) -> list[dict[str, Any]] | None:
        if not self._path.exists():
            return None
        start = page * self._page_size
        end = start + self._page_size
        events: list[dict[str, Any]] = []
        with self._path.open(encoding="utf-8") as handle:
            for i, line in enumerate(handle):
                stripped = line.strip()
                if not stripped:
                    continue
                if i < start:
                    continue
                if i >= end:
                    break
                try:
                    data = json.loads(stripped)
                except json.JSONDecodeError:
                    continue
                if isinstance(data, dict):
                    events.append(data)
        return events if events else None
