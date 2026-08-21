from __future__ import annotations

import contextlib
import json
import logging
import os
import tempfile
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from pathlib import Path

_DEFAULT_CAPACITY = 50
_log = logging.getLogger(__name__)


@traces(SWR.SWR_1153)
class PromptHistory:
    """In-memory FIFO ring buffer for prompt history cycling (bash/zsh style).

    index 0 = oldest entry, index -1 = newest entry.
    cursor == len(entries) means "unsent" (empty field).
    """

    def __init__(self, capacity: int = _DEFAULT_CAPACITY, path: Path | None = None) -> None:
        self._capacity = capacity
        self._path = path
        self._entries: list[str] = self._load()
        self._cursor: int = len(self._entries)  # "past end" initially

    # -- properties ----------------------------------------------------------

    @property
    def entries(self) -> list[str]:
        return list(self._entries)

    @property
    def cursor(self) -> int:
        return self._cursor

    @property
    def path(self) -> Path | None:
        return self._path

    @property
    def at_unsent(self) -> bool:
        return self._cursor == len(self._entries)

    # -- mutation ------------------------------------------------------------

    def append(self, text: str) -> None:
        """Append a submitted text; no-op for blank. Evicts oldest if at capacity."""
        if not text.strip():
            return
        self._entries.append(text)
        if len(self._entries) > self._capacity:
            self._entries.pop(0)
        self._cursor = len(self._entries)
        self._save()

    # -- navigation ----------------------------------------------------------

    def prev(self) -> str | None:
        """Move cursor toward older entries. Returns text to display, or None if empty."""
        if not self._entries:
            return None
        if self._cursor > 0:
            self._cursor -= 1
        return self._entries[self._cursor]

    def next(self) -> str | None:
        """Move cursor toward newer entries. Returns text, or '' for unsent state."""
        if self._cursor < len(self._entries):
            self._cursor += 1
        if self._cursor == len(self._entries):
            return ""  # unsent state
        return self._entries[self._cursor]

    def reset_cursor(self) -> None:
        """Reset cursor to unsent position."""
        self._cursor = len(self._entries)

    # -- persistence ---------------------------------------------------------

    def _load(self) -> list[str]:
        if self._path is None or not self._path.exists():
            return []
        try:
            data = json.loads(self._path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            _log.warning("Failed to load prompt history from %s: %s", self._path, exc)
            return []

        if not isinstance(data, list):
            _log.warning("Invalid prompt history in %s: expected JSON list", self._path)
            return []
        return [str(entry) for entry in data][-self._capacity :]

    def _save(self) -> None:
        if self._path is None:
            return
        self._path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp_path = tempfile.mkstemp(
            dir=str(self._path.parent),
            prefix=".prompt_history_",
            suffix=".tmp",
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as file_handle:
                json.dump(self._entries, file_handle, ensure_ascii=False)
            os.replace(tmp_path, self._path)
        except OSError:
            _log.exception("Failed to save prompt history to %s", self._path)
            with contextlib.suppress(OSError):
                os.unlink(tmp_path)
