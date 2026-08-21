from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Literal

from rotaris_core.reqtocode import SWR, traces

TerminalOutcomeKind = Literal[
    "success",
    "shell_failure",
    "suspicious_success",
    "soft_pause",
    "timeout",
    "invalid_request",
    "execution_error",
    "background_running",
    "background_terminal",
]

TerminalOutcomeSeverity = Literal["info", "warning", "error"]

_PYTEST_FAILED_RE = re.compile(r"=+\s+.*\bfailed\b.*=+", re.IGNORECASE)
_FOUND_ERRORS_RE = re.compile(r"\bFound\s+[1-9][0-9]*\s+errors?\b")

_SUSPICIOUS_MARKERS = (
    "Traceback (most recent call last):",
    "ERROR: file or directory not found",
    "no tests ran",
    "AssertionError",
    "FAILED ",
)


@dataclass(frozen=True, slots=True)
class TerminalOutcome:
    kind: TerminalOutcomeKind
    exit_code: int | None = None
    failure_kind: str | None = None
    severity: TerminalOutcomeSeverity = "info"
    warnings: list[str] = field(default_factory=list)
    summary: str = ""


@traces(SWR.SWR_559)
def classify_terminal_observation(observation: Any) -> TerminalOutcome:
    """Classify a terminal observation into an agent/session-facing outcome."""
    failure_kind = _str_or_none(getattr(observation, "failure_kind", None))
    exit_code = _int_or_none(getattr(observation, "exit_code", None))
    command = str(getattr(observation, "command", "") or "")
    text = _observation_text(observation)
    session_id = _str_or_none(getattr(observation, "session_id", None))
    session_status = _str_or_none(getattr(observation, "session_status", None))
    session_exit_code = _int_or_none(getattr(observation, "session_exit_code", None))

    if failure_kind == "timeout":
        return TerminalOutcome(
            kind="timeout",
            exit_code=exit_code,
            failure_kind=failure_kind,
            severity="error",
            summary="Terminal command timed out and backend was reset.",
        )
    if failure_kind == "invalid_request":
        return TerminalOutcome(
            kind="invalid_request",
            exit_code=exit_code,
            failure_kind=failure_kind,
            severity="warning",
            summary="Terminal request was invalid.",
        )
    if failure_kind == "execution_error":
        return TerminalOutcome(
            kind="execution_error",
            exit_code=exit_code,
            failure_kind=failure_kind,
            severity="error",
            summary="Terminal tool failed before command completion.",
        )

    if session_id is not None:
        if session_status == "running":
            return TerminalOutcome(
                kind="background_running",
                exit_code=session_exit_code if session_exit_code is not None else exit_code,
                severity="info",
                summary="Background terminal session is still running.",
            )
        effective_exit = session_exit_code if session_exit_code is not None else exit_code
        if effective_exit not in (None, 0):
            return TerminalOutcome(
                kind="shell_failure",
                exit_code=effective_exit,
                severity="error",
                summary=f"Background terminal session ended with exit code {effective_exit}.",
            )
        return TerminalOutcome(
            kind="background_terminal",
            exit_code=effective_exit,
            severity="info",
            summary="Background terminal session reached terminal state.",
        )

    if exit_code == -1:
        return TerminalOutcome(
            kind="soft_pause",
            exit_code=exit_code,
            severity="warning",
            summary="Terminal command paused after no stdout.",
        )

    if exit_code is not None and exit_code != 0:
        return TerminalOutcome(
            kind="shell_failure",
            exit_code=exit_code,
            severity="error",
            warnings=_pipeline_warnings(command, text),
            summary=f"Terminal command exited with code {exit_code}.",
        )

    suspicious = _suspicious_warnings(command, text)
    if suspicious:
        return TerminalOutcome(
            kind="suspicious_success",
            exit_code=exit_code,
            severity="warning",
            warnings=suspicious,
            summary="Terminal command exited 0, but output looks failed.",
        )

    return TerminalOutcome(
        kind="success",
        exit_code=exit_code,
        severity="info",
        summary="Terminal command succeeded.",
    )


def _observation_text(observation: Any) -> str:
    text = getattr(observation, "text", None)
    if text is not None:
        return str(text)
    content = getattr(observation, "content", None)
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            value = getattr(item, "text", None)
            if value is not None:
                parts.append(str(value))
        return "\n".join(parts)
    return ""


def _suspicious_warnings(command: str, text: str) -> list[str]:
    warnings: list[str] = []
    lowered = text.lower()
    for marker in _SUSPICIOUS_MARKERS:
        if marker.lower() in lowered:
            warnings.append(f"Output contains failure marker: {marker}")
            break
    if _FOUND_ERRORS_RE.search(text):
        warnings.append("Output contains a tool error count.")
    if _PYTEST_FAILED_RE.search(text):
        warnings.append("Output contains pytest failure summary.")
    warnings.extend(_pipeline_warnings(command, text))
    return _dedupe(warnings)


def _pipeline_warnings(command: str, text: str) -> list[str]:
    if "|" not in command:
        return []
    lowered = text.lower()
    if (
        "error:" in lowered
        or "failed" in lowered
        or "traceback" in lowered
        or "no tests ran" in lowered
    ):
        return ["Pipeline command may have hidden an upstream failure exit code."]
    return []


def _dedupe(items: list[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        result.append(item)
    return result


def _str_or_none(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _int_or_none(value: object) -> int | None:
    if value is None:
        return None
    if not isinstance(value, (str, bytes, bytearray, int, float)):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
