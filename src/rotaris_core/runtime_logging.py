from __future__ import annotations

import logging
import os
import shutil
from contextlib import suppress
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Callable
    from pathlib import Path

_LOG_FORMAT = "%(asctime)s %(levelname)s %(name)s: %(message)s"

# OpenHands SDK sub-loggers that are very chatty at INFO and add little signal:
# - conversation.state: dumps the full state + agent dict on every conversation create
# - agent.base: "Loaded N tools from spec" (sometimes emitted twice per child)
# - tool.registry: noisy "duplicate tool" warnings on persona swap (still WARN; see registry)
# - mcp.utils: "Created N MCP tools" per spawn
# - conversation.impl.local_conversation: "Agent execution pause requested" each iteration
# - tools.terminal.*: per-spawn "initialized" messages
_NOISY_OPENHANDS_LOGGERS: tuple[tuple[str, int], ...] = (
    ("openhands.sdk.conversation.state", logging.WARNING),
    ("openhands.sdk.conversation.impl.local_conversation", logging.WARNING),
    ("openhands.sdk.agent.base", logging.WARNING),
    ("openhands.sdk.mcp.utils", logging.WARNING),
    ("openhands.tools.terminal.tmux_pane_pool", logging.WARNING),
    ("openhands.tools.terminal.impl", logging.WARNING),
)


@traces(SWR.SWR_1547)
def configure_session_logging(
    log_path: Path,
    *,
    level: int | str = logging.WARNING,
) -> Callable[[], None]:
    """Attach a per-session file handler and return a cleanup callback.

    *level* may be an int (e.g. ``logging.DEBUG``) or a string
    (``"DEBUG"``, ``"INFO"``, ``"WARNING"``, ``"ERROR"``).
    """
    if isinstance(level, str):
        level = _resolve_log_level(level)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    # The Windows compatibility fallback copies this file because creating
    # symlinks commonly requires elevated privileges.  Ensure the source exists
    # before attempting that copy; FileHandler otherwise creates it too late.
    log_path.touch(exist_ok=True)
    _ensure_run_log_compat(log_path)

    handler = logging.FileHandler(log_path, mode="a", encoding="utf-8")
    handler.setLevel(level)
    handler.setFormatter(logging.Formatter(_LOG_FORMAT))
    logger_states: list[tuple[logging.Logger, int, bool]] = []
    for logger_name in ("rotaris_core", "openhands", "fastmcp", "mcp"):
        logger = logging.getLogger(logger_name)
        logger_states.append((logger, logger.level, logger.propagate))
        logger.addHandler(handler)
        logger.propagate = False
        if logger.level in (logging.NOTSET, 0) or logger.level > level:
            logger.setLevel(level)

    # Quiet known-chatty SDK sub-loggers without affecting our own diagnostics.
    for noisy_name, noisy_level in _NOISY_OPENHANDS_LOGGERS:
        noisy_logger = logging.getLogger(noisy_name)
        logger_states.append((noisy_logger, noisy_logger.level, noisy_logger.propagate))
        if noisy_logger.level in (logging.NOTSET, 0) or noisy_logger.level < noisy_level:
            noisy_logger.setLevel(noisy_level)

    def _cleanup() -> None:
        for logger, previous_level, previous_propagate in logger_states:
            logger.removeHandler(handler)
            logger.setLevel(previous_level)
            logger.propagate = previous_propagate
        handler.close()

    return _cleanup


def _resolve_log_level(level: str) -> int:
    """Resolve a string log level name to a ``logging`` constant."""
    mapping: dict[str, int] = {
        "DEBUG": logging.DEBUG,
        "INFO": logging.INFO,
        "WARNING": logging.WARNING,
        "ERROR": logging.ERROR,
    }
    upper = level.upper()
    if upper in mapping:
        return mapping[upper]
    _log = logging.getLogger(__name__)
    _log.warning("Unknown session_log_level '%s', falling back to WARNING.", level)
    return logging.WARNING


def _ensure_run_log_compat(log_path: Path) -> None:
    """Expose evidence/debug.log at the historical run.log path when possible."""
    if log_path.name != "debug.log" or log_path.parent.name != "evidence":
        return
    compat_path = log_path.parent.parent / "run.log"
    if compat_path.exists() or compat_path.is_symlink():
        return
    try:
        rel_target = os.path.relpath(log_path, compat_path.parent)
        compat_path.symlink_to(rel_target)
    except OSError:
        with suppress(OSError):
            shutil.copyfile(log_path, compat_path)
