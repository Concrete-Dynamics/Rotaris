"""Atomic workspace persistence for Rotaris prompt history and stash."""

from __future__ import annotations

import json
import os
import tempfile
from contextlib import suppress
from typing import TYPE_CHECKING, Any

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from pathlib import Path

    from rotaris.models.store import WorkspaceStore


@traces(SWR.SWR_2038)
class PromptPersistence:
    """Persist desktop prompt conveniences without coupling them to the TUI."""

    def __init__(self, workspace: Path, store: WorkspaceStore) -> None:
        self.path = workspace / ".rotaris" / "rotaris-prompts.json"
        self.store = store

    def load(self) -> None:
        try:
            payload: Any = json.loads(self.path.read_text(encoding="utf-8"))
        except (FileNotFoundError, OSError, json.JSONDecodeError):
            return
        if not isinstance(payload, dict):
            return
        history = payload.get("history", [])
        stash = payload.get("stash", [])
        if isinstance(history, list):
            self.store.prompt_history = [str(item) for item in history if str(item).strip()][:200]
        if isinstance(stash, list):
            self.store.prompt_stash = [str(item) for item in stash if str(item).strip()][:100]

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "history": self.store.prompt_history[:200],
            "stash": self.store.prompt_stash[:100],
        }
        handle, temporary = tempfile.mkstemp(
            prefix=".rotaris-prompts-",
            suffix=".json",
            dir=self.path.parent,
        )
        try:
            with os.fdopen(handle, "w", encoding="utf-8") as stream:
                json.dump(payload, stream, ensure_ascii=False, indent=2)
                stream.write("\n")
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, self.path)
        except BaseException:
            with suppress(OSError):
                os.unlink(temporary)
            raise
