"""Persona-specific workspace memory.

Implements REQ-20260515-POSTRUN-IMPROVE-014..019: small, visible,
workspace-local operating notes keyed by persona name. Each persona's memory
lives in ``<workspace>/.rotaris/persona_memory/<persona>.md`` so users can
directly inspect and edit it. Memory is bounded (default 200 non-empty lines)
to keep it reviewable and prevent it from silently becoming a second copy of
the persona's system prompt.

The runtime only **reads** persona memory during agent creation
(`load_persona_memory`); mutation is performed exclusively by the approval-
gated :class:`~rotaris_core.improvement.improver.Improver` or by direct manual
user edits to the file. The primary ``task_run`` never writes here.
"""

from __future__ import annotations

import logging
import os
import re
import tempfile
from contextlib import suppress
from pathlib import Path

from rotaris_core.reqtocode import SWR, traces

_log = logging.getLogger(__name__)

PERSONA_MEMORY_DIR_NAME = "persona_memory"
"""Directory under ``<workspace>/.rotaris/`` that holds persona memory files."""

MAX_PERSONA_MEMORY_LINES = 200
"""Hard line budget enforced on read and on write (REQ-016)."""

_SAFE_PERSONA_NAME_RE = re.compile(r"^[A-Za-z0-9_.\-]+$")


def _validate_persona_name(persona_name: str) -> str:
    """Reject persona names that could escape the persona-memory directory."""
    if not persona_name or not _SAFE_PERSONA_NAME_RE.match(persona_name):
        raise ValueError(
            f"Invalid persona name for persona memory: {persona_name!r} "
            "(allowed: alphanumerics, underscore, dot, dash).",
        )
    return persona_name


def persona_memory_dir(workspace_root: Path) -> Path:
    """Directory containing all persona memory files for this workspace."""
    return Path(workspace_root) / ".rotaris" / PERSONA_MEMORY_DIR_NAME


def persona_memory_path(workspace_root: Path, persona_name: str) -> Path:
    """Absolute path to a single persona's memory file."""
    safe = _validate_persona_name(persona_name)
    return persona_memory_dir(workspace_root) / f"{safe}.md"


def _truncate_to_bound(content: str) -> tuple[str, bool]:
    """Truncate ``content`` to ``MAX_PERSONA_MEMORY_LINES`` lines.

    Returns ``(truncated_content, was_truncated)``.
    """
    lines = content.splitlines()
    if len(lines) <= MAX_PERSONA_MEMORY_LINES:
        return content, False
    kept = lines[:MAX_PERSONA_MEMORY_LINES]
    return "\n".join(kept) + "\n", True


@traces(SWR.SWR_1613, SWR.SWR_1614, SWR.SWR_1615, SWR.SWR_1619)
def load_persona_memory(workspace_root: Path, persona_name: str) -> str | None:
    """Return the persona's workspace memory, or ``None`` if absent/blank.

    The returned content is truncated to ``MAX_PERSONA_MEMORY_LINES`` lines if
    the file on disk exceeds the bound — the underlying file is not modified
    (REQ-016 keeps direct user edits as the source of truth; we only protect
    the agent context).
    """
    path = persona_memory_path(workspace_root, persona_name)
    if not path.is_file():
        return None
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError as exc:
        _log.warning("Failed to read persona memory %s: %s", path, exc)
        return None
    if not raw.strip():
        return None
    content, truncated = _truncate_to_bound(raw)
    if truncated:
        _log.warning(
            "Persona memory for '%s' exceeds %d lines; truncating for injection.",
            persona_name,
            MAX_PERSONA_MEMORY_LINES,
        )
    return content


@traces(SWR.SWR_1616)
def write_persona_memory(
    workspace_root: Path,
    persona_name: str,
    content: str,
) -> Path:
    """Atomically write ``content`` as the persona's workspace memory.

    Enforces the line bound by truncation before persisting. Intended for use
    by the approval-gated :class:`Improver` and tests — the primary
    ``task_run`` MUST NOT call this (REQ-018).
    """
    path = persona_memory_path(workspace_root, persona_name)
    path.parent.mkdir(parents=True, exist_ok=True)
    bounded, truncated = _truncate_to_bound(content)
    if truncated:
        _log.warning(
            "Persona memory for '%s' truncated to %d lines on write.",
            persona_name,
            MAX_PERSONA_MEMORY_LINES,
        )
    if bounded and not bounded.endswith("\n"):
        bounded += "\n"

    fd, tmp = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    os.close(fd)
    try:
        with Path(tmp).open("w", encoding="utf-8", newline="") as fh:
            fh.write(bounded)
        os.replace(tmp, path)
    finally:
        with suppress(FileNotFoundError):
            os.unlink(tmp)
    return path
