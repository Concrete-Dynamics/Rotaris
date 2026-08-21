"""Scheduler diagnostics helpers."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.tools.terminal_outcome import classify_terminal_observation

if TYPE_CHECKING:
    from collections.abc import Callable

    from rotaris_core.session.diagnostics import SessionDiagnostics, Severity

    DiagnosticIssueCallback = Callable[[dict[str, Any]], None]


_log = logging.getLogger(__name__)

_ACP_TOOL_TERMINAL_STATUSES = frozenset(
    {
        "blocked",
        "cancelled",
        "completed",
        "done",
        "error",
        "failed",
        "ok",
        "success",
        "succeeded",
    },
)


@dataclass(slots=True)
class TimedToolEventDescription:
    phase: str
    tool_name: str
    call_id: str
    status: str
    args: str | None = None
    result: str | None = None
    outcome_kind: str | None = None
    exit_code: int | None = None
    failure_kind: str | None = None
    warnings: list[str] | None = None

    def __iter__(self) -> Any:
        # Backwards-compatible with older tuple unpacking at call sites/tests.
        yield self.phase
        yield self.tool_name
        yield self.call_id
        yield self.status
        yield self.args
        yield self.result

    def __getitem__(self, index: int) -> object:
        return tuple(self)[index]


@dataclass(slots=True)
class SchedulerDiagnosticsProxy:
    base: SessionDiagnostics
    issue_callback: DiagnosticIssueCallback | None = None

    def issue(
        self,
        *,
        kind: str,
        severity: Severity = "warning",
        actor: str | None = None,
        message: str,
        evidence_ref: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> str | None:
        issue_id = self.base.issue(
            kind=kind,
            severity=severity,
            actor=actor,
            message=message,
            evidence_ref=evidence_ref,
            metadata=metadata,
        )
        callback = self.issue_callback
        if callback is not None:
            try:
                callback(
                    {
                        "id": issue_id,
                        "kind": kind,
                        "severity": severity,
                        "actor": actor,
                        "message": message,
                        "evidence_ref": evidence_ref,
                        "metadata": metadata,
                    },
                )
            except Exception:  # noqa: BLE001
                _log.exception("Diagnostic issue callback failed")
        return issue_id

    def __getattr__(self, name: str) -> Any:
        return getattr(self.base, name)


@traces(SWR.SWR_560, SWR.SWR_561)
def describe_timed_tool_event(
    event: object,
) -> TimedToolEventDescription | None:
    """Classify tool lifecycle events that can be timed by ``tool_call_id``.

    Returns ``(phase, tool_name, call_id, status, args, result)`` or ``None``.
    ``args`` is populated on *start* events (tool arguments).
    ``result`` is populated on *terminal* events (observation / rejection).
    Both are truncated to 2000 characters.
    """
    tool_call_id = str(getattr(event, "tool_call_id", "") or "").strip()
    if not tool_call_id:
        return None

    title = str(getattr(event, "title", "") or "").strip()
    if title:
        status = str(getattr(event, "status", "") or "").strip().lower()
        is_error = bool(getattr(event, "is_error", False))
        if status in _ACP_TOOL_TERMINAL_STATUSES or is_error:
            terminal_status = "error" if is_error else (status or "completed")
            result = _extract_tool_result(event)
            outcome = _extract_terminal_outcome(title, getattr(event, "observation", None))
            if outcome is not None and outcome.kind in {
                "shell_failure",
                "suspicious_success",
                "timeout",
                "invalid_request",
                "execution_error",
                "soft_pause",
            }:
                terminal_status = "error" if outcome.severity == "error" else "warning"
            return TimedToolEventDescription(
                "terminal",
                title,
                tool_call_id,
                terminal_status,
                result=result,
                outcome_kind=outcome.kind if outcome is not None else None,
                exit_code=outcome.exit_code if outcome is not None else None,
                failure_kind=outcome.failure_kind if outcome is not None else None,
                warnings=outcome.warnings if outcome is not None else None,
            )
        return TimedToolEventDescription("start", title, tool_call_id, status or "running")

    tool_name = str(getattr(event, "tool_name", "") or "").strip()
    if not tool_name:
        return None
    if hasattr(event, "action"):
        args = _extract_tool_args(event)
        return TimedToolEventDescription("start", tool_name, tool_call_id, "started", args=args)
    if hasattr(event, "observation"):
        observation = event.observation
        result = _extract_tool_result(event)
        obs_is_error = bool(getattr(observation, "is_error", False))
        outcome = _extract_terminal_outcome(tool_name, observation)
        terminal_status = "error" if obs_is_error else "completed"
        if outcome is not None and outcome.kind in {
            "shell_failure",
            "suspicious_success",
            "timeout",
            "invalid_request",
            "execution_error",
            "soft_pause",
        }:
            terminal_status = "error" if outcome.severity == "error" else "warning"
        return TimedToolEventDescription(
            "terminal",
            tool_name,
            tool_call_id,
            terminal_status,
            result=result,
            outcome_kind=outcome.kind if outcome is not None else None,
            exit_code=outcome.exit_code if outcome is not None else None,
            failure_kind=outcome.failure_kind if outcome is not None else None,
            warnings=outcome.warnings if outcome is not None else None,
        )
    if hasattr(event, "rejection_reason"):
        result = _extract_tool_result(event)
        return TimedToolEventDescription(
            "terminal", tool_name, tool_call_id, "rejected", result=result
        )
    return None


def _extract_terminal_outcome(tool_name: str, observation: object | None) -> Any | None:
    normalized = tool_name.strip().lower().replace(" ", "_")
    if normalized not in {"terminal", "bash"}:
        return None
    if observation is None:
        return None
    return classify_terminal_observation(observation)


def _extract_tool_args(event: object) -> str | None:
    """Extract and truncate tool arguments from a start event."""
    action = getattr(event, "action", None)
    if action is None:
        return None
    try:
        raw = str(action)
    except Exception:  # noqa: BLE001
        return None
    return _truncate(raw, 2000)


def _extract_tool_result(event: object) -> str | None:
    """Extract and truncate tool result from a terminal event."""
    for attr in ("observation", "rejection_reason"):
        value = getattr(event, attr, None)
        if value is not None:
            try:
                raw = str(value)
            except Exception:  # noqa: BLE001
                return None
            return _truncate(raw, 2000)
    return None


def _truncate(text: str, max_chars: int) -> str:
    """Truncate *text* to *max_chars*, appending an ellipsis marker if needed."""
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + "…"


def diagnose_mcp_error(exc: Exception, record: Any) -> str | None:
    """Produce an actionable diagnostic message for MCP connection failures.

    Inspects the exception chain for ``MCPError`` and extracts the underlying
    OS-level cause (e.g. ``OSError: Bad file descriptor`` on Windows when
    ``npx``/``node`` is missing or the stdio transport fails).

    Returns a human-readable diagnostic string, or ``None`` if the exception
    is not an MCP-related failure.
    """
    try:
        from openhands.sdk.mcp.exceptions import MCPError
    except ImportError:
        return None

    # Walk the exception chain looking for MCPError.
    current: BaseException | None = exc
    while current is not None:
        if isinstance(current, MCPError):
            break
        current = current.__cause__
    else:
        return None

    # Extract the root OS-level cause.
    root_cause: BaseException | None = current.__cause__ or current
    while root_cause is not None and root_cause.__cause__ is not None:
        root_cause = root_cause.__cause__

    persona = getattr(record, "persona", "?")
    root_msg = str(root_cause) if root_cause else str(current)

    if "Bad file descriptor" in root_msg or "OSError" in root_msg:
        return (
            f"MCP server failed to start for persona '{persona}'. "
            "This is likely because npx (Node.js) is not installed or not on PATH. "
            "Install Node.js from https://nodejs.org/ or switch the MCP server to HTTP transport. "
            f"Root cause: {root_msg}"
        )
    if "FileNotFoundError" in root_msg or "No such file" in root_msg:
        return (
            f"MCP server command not found for persona '{persona}'. "
            "The configured command (likely npx) is not installed. "
            f"Root cause: {root_msg}"
        )
    return f"MCP connection failed for persona '{persona}'. Root cause: {root_msg}"
