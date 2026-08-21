from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from rotaris_core.reqtocode import SWR, traces

_log = logging.getLogger(__name__)

_MAX_CONTEXT_EVENTS = 6
_MAX_EVENT_CHARS = 700
_MAX_HISTORY_CHARS = 3200
_MAX_TASK_TITLE_CHARS = 80
_MAX_TODO_TASKS = 20
_MAX_PROGRESS_ITERATIONS = 5
_MAX_STRUCTURED_ITEM_CHARS = 700
_MAX_LATEST_ARTIFACT_CHARS = 6000


@traces(SWR.SWR_1511, SWR.SWR_1512)
def build_task_display_name(task_text: str) -> str:
    """Return a compact single-line title for session/task UI and child IDs."""
    title = " ".join(task_text.strip().split())
    if not title:
        return "User request"
    if len(title) <= _MAX_TASK_TITLE_CHARS:
        return title
    return title[: _MAX_TASK_TITLE_CHARS - 3].rstrip(" -:,.") + "..."


@traces(SWR.SWR_2907)
def session_task_title(todo_state: dict[str, Any] | None) -> str:
    """Return the run's current display title from its persisted todo state.

    Top-level run tasks are appended to the first phase (``build_run_todo``),
    so the newest task there is what the session is doing now. Empty when the
    session has no recorded task — callers fall back to the session id.
    """
    for phase in (todo_state or {}).get("phases") or []:
        for task in reversed(phase.get("tasks") or []):
            name = str(task.get("name") or "").strip()
            if name:
                return name
    return ""


def build_contextual_task_payload(
    task_text: str,
    transcript_events: list[dict[str, Any]],
    *,
    artifact_context: str = "",
    todo_context: str = "",
    progress_context: str = "",
) -> str:
    """Expand a new top-level task with recent session context when available."""
    normalized_task = task_text.strip()
    recent_events = _select_recent_context_events(transcript_events)
    handoff = build_session_handoff_context(
        artifact_context=artifact_context,
        todo_context=todo_context,
        progress_context=progress_context,
    )
    if not recent_events and not handoff:
        return normalized_task

    payload_parts = [
        "You are continuing an existing Rotaris session.\n"
        "Treat the latest user request as a follow-up to the session below, not as the "
        "start of a brand-new interaction.\n"
        "Prior session context is authoritative. Do not re-explore prior findings unless "
        "you need to verify a specific edit or fill a gap not covered by the handoff.\n"
        "First derive actionable remaining work from the prior findings, then execute only "
        "the user's latest request.\n"
        "Resolve references like 'it', 'that', 'this', or 'the previous result' using the "
        "session context.\n"
        "Do not claim there is no prior context unless the history below is genuinely "
        "insufficient.\n\n"
        f"Latest user request:\n{normalized_task}",
    ]
    if handoff:
        payload_parts.append("Authoritative session handoff:\n" + handoff)
    if recent_events:
        payload_parts.append("Recent session context:\n" + _render_history(recent_events))
    return "\n\n".join(payload_parts)


def build_session_handoff_context(
    *,
    artifact_context: str = "",
    todo_context: str = "",
    progress_context: str = "",
) -> str:
    """Combine structured session carry-over for a follow-up root task."""
    parts = [
        part.strip() for part in (artifact_context, todo_context, progress_context) if part.strip()
    ]
    return "\n\n".join(parts)


def build_session_artifact_context(
    session_dir: Path | str | None,
    *,
    baseline_max_chars: int = 8000,
    latest_artifact_max_chars: int = _MAX_LATEST_ARTIFACT_CHARS,
) -> str:
    """Return compact artifact context for a root follow-up task."""
    if session_dir is None:
        return ""

    from rotaris_core.orchestrator.artifacts import SessionArtifactStore

    store = SessionArtifactStore(Path(session_dir))
    try:
        store.hydrate()
    except Exception:  # noqa: BLE001
        _log.exception("Artifact handoff hydration failed; continuing without artifact context")
        return ""
    latest = _latest_orchestrator_artifact(store)
    exclude_ids = {latest.id} if latest is not None else set()
    blocks: list[str] = []
    if latest is not None:
        full_block, _resolved = store.full_block([latest.id])
        if full_block:
            blocks.append(_truncate(full_block.strip(), latest_artifact_max_chars))
    baseline, _baseline_ids = store.baseline_block(
        exclude_ids=exclude_ids,
        max_chars=baseline_max_chars,
    )
    if baseline:
        blocks.append(baseline.strip())
    return "\n\n".join(blocks)


def build_todo_context(todo_state: dict[str, Any] | None) -> str:
    """Render a concise summary of the previous top-level todo state."""
    if not todo_state:
        return ""

    lines = ["PRIOR TODO STATE:"]
    task_count = 0
    for phase in todo_state.get("phases", []) or []:
        phase_name = str(phase.get("name") or "unnamed phase")
        lines.append(f"- Phase: {phase_name}")
        for task in phase.get("tasks", []) or []:
            task_count += 1
            if task_count > _MAX_TODO_TASKS:
                lines.append("- [... additional todo tasks elided]")
                return "\n".join(lines)
            status = str(task.get("status") or "UNKNOWN")
            name = str(task.get("name") or task.get("description") or "Unnamed task")
            description = str(task.get("description") or "").strip()
            item = f"  - [{status}] {_truncate_inline(name)}"
            if description and description != name:
                item += f" - {_truncate_inline(description)}"
            lines.append(item)
    return "\n".join(lines) if len(lines) > 1 else ""


def build_progress_context(ralph_progress: dict[str, Any] | None) -> str:
    """Render a concise summary of prior Ralph progress."""
    if not ralph_progress:
        return ""

    lines = ["PRIOR RALPH PROGRESS:"]
    for key in ("stop_reason", "total_tasks", "completed_tasks", "abandoned_tasks"):
        value = ralph_progress.get(key)
        if value is not None:
            lines.append(f"- {key}: {value}")

    iterations = list(ralph_progress.get("iterations", []) or [])
    if iterations:
        lines.append("- Recent iterations:")
    for iteration in iterations[-_MAX_PROGRESS_ITERATIONS:]:
        task_name = str(iteration.get("task_name") or iteration.get("task_id") or "task")
        outcome = str(iteration.get("outcome") or "unknown")
        summary = str(iteration.get("report_summary") or "").strip()
        line = f"  - {outcome}: {_truncate_inline(task_name)}"
        if summary:
            line += f" - {_truncate_inline(summary)}"
        lines.append(line)
    return "\n".join(lines) if len(lines) > 1 else ""


def _latest_orchestrator_artifact(store: Any) -> Any | None:
    records = [
        record
        for record in store.list(
            kind="child_report",
            persona="orchestrator",
            include_superseded=False,
        )
        if record.status in {"succeeded", "published"}
    ]
    if not records:
        return None
    return max(records, key=lambda record: record.created_at)


def _truncate(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 80].rstrip() + (
        "\n\n[... prior context elided to stay within the follow-up handoff budget.]"
    )


def _select_recent_context_events(
    transcript_events: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    meaningful_events: list[dict[str, Any]] = []
    for event in transcript_events:
        role = str(event.get("role", ""))
        content = str(event.get("content", "")).strip()
        if not content:
            continue
        if role not in {"user", "agent"}:
            continue
        meaningful_events.append(event)

    return meaningful_events[-_MAX_CONTEXT_EVENTS:]


def _render_history(events: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    total_chars = 0

    for event in reversed(events):
        role = str(event.get("role", ""))
        content = str(event.get("content", "")).strip().replace("\n", " ")
        if len(content) > _MAX_EVENT_CHARS:
            content = content[: _MAX_EVENT_CHARS - 1].rstrip() + "…"

        if role == "agent":
            agent_name = str(event.get("name", "")).strip()
            label = f"Agent ({agent_name})" if agent_name else "Agent"
        else:
            label = "User"

        line = f"- {label}: {content}"
        projected = total_chars + len(line) + 1
        if lines and projected > _MAX_HISTORY_CHARS:
            break

        lines.append(line)
        total_chars = projected

    lines.reverse()
    return "\n".join(lines)


def _truncate_inline(text: str, max_chars: int = _MAX_STRUCTURED_ITEM_CHARS) -> str:
    text = " ".join(text.split())
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 3].rstrip() + "..."
