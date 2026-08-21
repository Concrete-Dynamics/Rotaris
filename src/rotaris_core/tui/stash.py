"""Prompt stash — git-style LIFO stack for TUI prompt input.

Persists across app launches via a JSON file in the global config directory.
"""

from __future__ import annotations

import contextlib
import json
import logging
import os
import tempfile
from typing import TYPE_CHECKING

from rotaris_core.config.paths import GLOBAL_CONFIG_DIR
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from pathlib import Path

_log = logging.getLogger(__name__)

_DEFAULT_STASH_PATH = GLOBAL_CONFIG_DIR / "prompt_stash.json"


@traces(SWR.SWR_1115, SWR.SWR_1120)
class PromptStash:
    """LIFO stack that persists prompt text entries to a JSON file."""

    def __init__(self, path: Path | None = None) -> None:
        self._path = path or _DEFAULT_STASH_PATH
        self._stack: list[str] = self._load()

    # -- Public API ----------------------------------------------------------

    def push(self, text: str) -> None:
        """Push *text* onto the stash stack and persist."""
        if not text:
            return
        self._stack.append(text)
        self._save()

    def pop(self) -> str | None:
        """Pop the most recent entry.  Returns ``None`` on empty stack."""
        if not self._stack:
            return None
        value = self._stack.pop()
        self._save()
        return value

    def peek(self) -> str | None:
        """Return the top entry without removing it."""
        return self._stack[-1] if self._stack else None

    @property
    def size(self) -> int:
        return len(self._stack)

    @property
    def is_empty(self) -> bool:
        return len(self._stack) == 0

    # -- Persistence ---------------------------------------------------------

    def _load(self) -> list[str]:
        if not self._path.exists():
            return []
        try:
            data = json.loads(self._path.read_text(encoding="utf-8"))
            if isinstance(data, list):
                return [str(entry) for entry in data]
        except (json.JSONDecodeError, OSError) as exc:
            _log.warning("Failed to load prompt stash from %s: %s", self._path, exc)
        return []

    def _save(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        # Atomic write via tempfile + os.replace
        fd, tmp = tempfile.mkstemp(
            dir=str(self._path.parent),
            prefix=".prompt_stash_",
            suffix=".tmp",
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(self._stack, fh, ensure_ascii=False)
            os.replace(tmp, self._path)
        except OSError:
            _log.exception("Failed to save prompt stash to %s", self._path)
            # Clean up temp file on failure
            with contextlib.suppress(OSError):
                os.unlink(tmp)
