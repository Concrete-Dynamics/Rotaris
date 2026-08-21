"""Persistent on/off state for MCP servers."""

from __future__ import annotations

import contextlib
import json
import logging
import os
import tempfile
import threading
from typing import TYPE_CHECKING, cast

from rotaris_core.config.paths import GLOBAL_CONFIG_DIR
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from pathlib import Path

_log = logging.getLogger(__name__)

_DEFAULT_TOGGLE_PATH = GLOBAL_CONFIG_DIR / "mcp_toggles.json"


def _parse_json(text: str) -> object:
    return cast("object", json.loads(text))


@traces(SWR.SWR_1719)
class MCPToggleStore:
    """Persist MCP server enabled/disabled state to a global JSON file."""

    def __init__(self, path: Path | None = None) -> None:
        self._path: Path = path or _DEFAULT_TOGGLE_PATH
        self._lock: threading.Lock = threading.Lock()
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._states: dict[str, bool] = {}
        self.reload()

    def is_enabled(self, name: str) -> bool:
        with self._lock:
            return self._states.get(name, True)

    def set_enabled(self, name: str, enabled: bool) -> None:
        with self._lock:
            self._states[name] = enabled
            self._save_unlocked()

    def all_states(self) -> dict[str, bool]:
        with self._lock:
            return dict(self._states)

    def reload(self) -> None:
        with self._lock:
            self._states = self._load_unlocked()

    def _load_unlocked(self) -> dict[str, bool]:
        if not self._path.exists():
            return {}
        try:
            raw_data = _parse_json(self._path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            _log.warning("Failed to load MCP toggles from %s: %s", self._path, exc)
            return {}

        if not isinstance(raw_data, dict):
            _log.warning("Invalid MCP toggles in %s: expected JSON object", self._path)
            return {}

        raw_mapping = cast("dict[object, object]", raw_data)
        states: dict[str, bool] = {}
        for key, value in raw_mapping.items():
            if not isinstance(key, str) or type(value) is not bool:
                _log.warning(
                    "Invalid MCP toggles in %s: expected object[str, bool]",
                    self._path,
                )
                return {}
            states[key] = value
        return states

    def _save_unlocked(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp_path = tempfile.mkstemp(
            dir=str(self._path.parent),
            prefix=".mcp_toggles_",
            suffix=".tmp",
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as file_handle:
                json.dump(self._states, file_handle, ensure_ascii=False, sort_keys=True)
            os.replace(tmp_path, self._path)
        except OSError:
            _log.exception("Failed to save MCP toggles to %s", self._path)
            with contextlib.suppress(OSError):
                os.unlink(tmp_path)
