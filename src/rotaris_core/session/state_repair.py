"""Post-deserialization repair for reasoning_content on persisted events.

DeepSeek V4 (and other models in ``SEND_REASONING_CONTENT_MODELS``) reject API
requests when a prior assistant message is missing its ``reasoning_content`` and
thinking mode is active. The repair runs **only at session-open time** (or
explicit session-close), never during normal agent iteration, to avoid CPU cost
on every LLM call.

Callers should invoke ``repair_reasoning_content()`` immediately after loading
a session snapshot and before the first agent step.
"""

from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from pathlib import Path

from rotaris_core.fs import atomic_write
from rotaris_core.models.thinking_catalog import model_requires_reasoning_echo
from rotaris_core.reqtocode import SWR, traces

_log = logging.getLogger(__name__)

_REASONING_SENTINEL = ""


@traces(SWR.SWR_1550)
def repair_reasoning_content(
    session_dir: Path,
    model_name: str | None,
) -> int:
    """Repair missing ``reasoning_content`` in persisted event files.

    Scans all event logs under ``<session_dir>/evidence/conversations/event_logs/``.
    Rewrites any ``ActionEvent`` or agent ``MessageEvent`` that is missing
    ``reasoning_content`` when the model requires it.

    Args:
        session_dir: Path to the session directory (contains ``evidence/``).
        model_name: The orchestrator's model name (e.g.  ``"deepseek/deepseek-v4-pro"``).

    Returns:
        Number of events repaired.

    """
    if not model_requires_reasoning_echo(model_name):
        return 0

    event_logs_dir = session_dir / "evidence" / "conversations" / "event_logs"
    if not event_logs_dir.is_dir():
        return 0

    repaired = 0
    for convo_dir in event_logs_dir.iterdir():
        if not convo_dir.is_dir():
            continue
        events_dir = convo_dir / "events"
        if not events_dir.is_dir():
            continue
        for event_file in sorted(events_dir.iterdir()):
            if not event_file.name.endswith(".json"):
                continue
            if _repair_event_file(event_file):
                repaired += 1

    if repaired:
        _log.info(
            "Repaired reasoning_content for %d event(s) in session %s",
            repaired,
            session_dir.name,
        )
    return repaired


def _repair_event_file(path: Path) -> bool:
    """Repair a single event file if its reasoning_content is missing.

    Returns True if the file was modified.
    """
    try:
        with path.open("r", encoding="utf-8") as fh:
            raw = fh.read()
    except OSError:
        return False

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return False
    if not _needs_repair(data):
        return False

    if data.get("kind") == "MessageEvent" and isinstance(data.get("llm_message"), dict):
        data["llm_message"]["reasoning_content"] = _REASONING_SENTINEL
    else:
        data["reasoning_content"] = _REASONING_SENTINEL
    repaired_raw = json.dumps(data, indent=None, ensure_ascii=False)
    atomic_write(path, repaired_raw)
    _log.debug("Repaired missing reasoning_content in %s", path.name)
    return True


def _needs_repair(event: dict[str, Any]) -> bool:
    """Return True if the event is missing ``reasoning_content`` and should have it.

    Repair candidates:
    - ``ActionEvent`` (kind is ``"ActionEvent"``) with missing or null ``reasoning_content``.
    - Agent ``MessageEvent`` (kind ``"MessageEvent"``, source ``"agent"``) whose
      ``llm_message.reasoning_content`` is missing or null.
    """
    kind = event.get("kind", "")
    if kind == "ActionEvent":
        return event.get("reasoning_content") is None
    if kind == "MessageEvent" and event.get("source") == "agent":
        llm_msg = event.get("llm_message")
        if isinstance(llm_msg, dict):
            return llm_msg.get("reasoning_content") is None
    return False
