from __future__ import annotations

import datetime as dt
import json
import logging
import threading
import uuid
from collections import deque
from typing import TYPE_CHECKING, Any, Literal

from rotaris_core.events import (
    ErrorEvent,
    GateDecisionEvent,
    GateRepairEvent,
    PermissionDecisionEvent,
    RotarisEvent,
    ToolFinishEvent,
    ToolStartEvent,
    publish,
)
from rotaris_core.fs import atomic_write
from rotaris_core.reqtocode import SWR, traces
from rotaris_core.session.state import SessionState

if TYPE_CHECKING:
    from collections.abc import Callable, Sequence
    from pathlib import Path

_log = logging.getLogger(__name__)

Severity = Literal["debug", "info", "warning", "error"]

_LOCK = threading.Lock()
_MAX_ISSUES = 500
_MAX_TOOL_CALLS = 5000
_MAX_MODEL_INPUTS = 5000
_MAX_CONTEXT_SELECTIONS = 2000
_MAX_PERMISSION_DECISIONS = 5000
_MAX_REPORT_VALIDATIONS = 2000
_MAX_MEMORY_SNAPSHOTS = 2000


@traces(SWR.SWR_1828)
def bus_session_id(session_dir: Path | None, session_id: str = "") -> str:
    """Resolve the event-bus key these diagnostics publish under.

    An explicit *session_id* always wins.  The fallback is the session
    directory's name, which *is* the session id everywhere in this codebase —
    ``SessionPersistence.session_dir`` is ``sessions_dir / session_id``, and
    ``Scheduler`` already derives ``binding_session_id`` the same way.  Relying
    on it is what lets the diagnostics writers, constructed several layers deep
    in ``orchestrator/``, address the bus without an id threaded through three
    constructors.

    Returns ``""`` when neither is available; ``events.bus.publish`` treats that
    as a silent no-op, so a caller never has to guard.
    """
    resolved = session_id.strip()
    if resolved:
        return resolved
    return session_dir.name if session_dir is not None else ""


def evidence_dir(session_dir: Path) -> Path:
    return session_dir / "evidence"


def conversations_dir(session_dir: Path) -> Path:
    return evidence_dir(session_dir) / "conversations"


def debug_log_path(session_dir: Path) -> Path:
    return evidence_dir(session_dir) / "debug.log"


def initialize_session_diagnostics(session_dir: Path, state: SessionState) -> None:
    """Create the inspection-oriented session files if they do not exist yet."""
    session_dir.mkdir(parents=True, exist_ok=True)
    state_dir = session_dir / "state"
    state_dir.mkdir(parents=True, exist_ok=True)
    evidence_dir(session_dir).mkdir(parents=True, exist_ok=True)
    conversations_dir(session_dir).mkdir(parents=True, exist_ok=True)

    _write_json_if_missing(state_dir / "run_config.json", _run_config_payload(state))
    _write_json_if_missing(session_dir / "issues.json", {"issues": []})
    _write_json_if_missing(session_dir / "metrics.json", build_metrics(state, session_dir))
    summary_path = session_dir / "summary.md"
    if not summary_path.exists():
        atomic_write(summary_path, render_summary(state, build_metrics(state, session_dir)))
    timeline_path = session_dir / "timeline.jsonl"
    if not timeline_path.exists():
        atomic_write(timeline_path, "")
    tool_calls_path = evidence_dir(session_dir) / "tool-calls.jsonl"
    if not tool_calls_path.exists():
        atomic_write(tool_calls_path, "")
    for filename in (
        "model-input.jsonl",
        "context-selection.jsonl",
        "report-validation.jsonl",
        "memory.jsonl",
        "permissions.jsonl",
    ):
        path = evidence_dir(session_dir) / filename
        if not path.exists():
            atomic_write(path, "")
    _write_json_if_missing(conversations_dir(session_dir) / "index.json", {"conversations": []})


def write_split_state(session_dir: Path, state: SessionState) -> None:
    """Persist the new split session layout."""
    initialize_session_diagnostics(session_dir, state)
    state_dir = session_dir / "state"
    resume = state.model_copy(
        update={
            "config_snapshot": {},
            "transcript_events": [],
            "ui_edit_diffs": [],
            "report_artifacts": _artifact_refs(state.report_artifacts),
        },
    )
    atomic_write(state_dir / "resume.json", resume.model_dump_json(indent=2))
    atomic_write(
        state_dir / "ui_transcript.json",
        json.dumps({"events": state.transcript_events}, indent=2, default=str),
    )
    atomic_write(
        state_dir / "ui_edit_diffs.json",
        json.dumps({"diffs": state.ui_edit_diffs}, indent=2, default=str),
    )

    metrics = build_metrics(state, session_dir)
    atomic_write(session_dir / "metrics.json", json.dumps(metrics, indent=2, default=str))
    atomic_write(session_dir / "summary.md", render_summary(state, metrics))


def load_split_state(session_dir: Path) -> SessionState | None:
    resume_path = session_dir / "state" / "resume.json"
    if not resume_path.exists():
        return None
    state = SessionState.model_validate_json(resume_path.read_text(encoding="utf-8"))
    transcript_path = session_dir / "state" / "ui_transcript.json"
    if transcript_path.exists():
        data = json.loads(transcript_path.read_text(encoding="utf-8"))
        state.transcript_events = list(data.get("events", []))
    edit_diffs_path = session_dir / "state" / "ui_edit_diffs.json"
    if edit_diffs_path.exists():
        data = json.loads(edit_diffs_path.read_text(encoding="utf-8"))
        state.ui_edit_diffs = list(data.get("diffs", []))
    run_config_path = session_dir / "state" / "run_config.json"
    if run_config_path.exists():
        data = json.loads(run_config_path.read_text(encoding="utf-8"))
        config_snapshot = data.get("config_snapshot")
        if isinstance(config_snapshot, dict):
            state.config_snapshot = config_snapshot
    return state


@traces(SWR.SWR_1832)
def emit_timeline_event(
    session_dir: Path,
    event_type: str,
    *,
    severity: Severity = "info",
    actor: str | None = None,
    message: str = "",
    metadata: dict[str, Any] | None = None,
    session_id: str = "",
) -> str:
    event_id = uuid.uuid4().hex[:12]
    payload = {
        "id": event_id,
        "timestamp": dt.datetime.now(dt.UTC).isoformat(),
        "type": event_type,
        "severity": severity,
        "actor": actor,
        "message": message,
        "metadata": metadata or {},
    }
    _append_jsonl(session_dir / "timeline.jsonl", payload)
    # Durable line first, wire event second (SWR-1832): a broken stream can lose
    # an event, it can never lose the timeline record it was derived from.
    _publish_timeline_event(
        bus_session_id(session_dir, session_id),
        event_type,
        metadata or {},
    )
    return event_id


def _as_int(value: Any) -> int:
    """Coerce one metadata field to the event's ``int``; ``0`` when it is not one."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _as_str_list(value: Any) -> list[str]:
    """Coerce one metadata field to the event's ``list[str]``."""
    if isinstance(value, str) or not isinstance(value, list | tuple | set | frozenset):
        return []
    return [str(item) for item in value]


@traces(SWR.SWR_1832)
def _gate_decision_event(bus_id: str, metadata: dict[str, Any]) -> RotarisEvent:
    """Build ``gate.decision`` from the loop's ``completion_gate_decision`` entry."""
    verdict = metadata.get("llm_verdict")
    return GateDecisionEvent(
        session_id=bus_id,
        iteration=_as_int(metadata.get("iteration")),
        decision=str(metadata.get("decision") or ""),
        reason=str(metadata.get("reason") or ""),
        unsatisfied_checks=_as_str_list(metadata.get("unsatisfied_checks")),
        advisory_failures=_as_str_list(metadata.get("advisory_failures")),
        llm_verdict=None if verdict is None else str(verdict),
    )


@traces(SWR.SWR_1832)
def _gate_repair_event(bus_id: str, metadata: dict[str, Any]) -> RotarisEvent:
    """Build ``gate.repair`` from a ``repair_*`` timeline entry.

    ``remaining_attempts`` is not in the timeline metadata — the loop never had
    to write it down — so it is derived here from the budget and clamped at
    zero, which is what an escalation (attempt == max_attempts) reports.
    """
    attempt = _as_int(metadata.get("attempt"))
    max_attempts = _as_int(metadata.get("max_attempts"))
    return GateRepairEvent(
        session_id=bus_id,
        iteration=_as_int(metadata.get("iteration")),
        action=str(metadata.get("action") or ""),
        attempt=attempt,
        max_attempts=max_attempts,
        remaining_attempts=max(max_attempts - attempt, 0),
        unsatisfied_checks=_as_str_list(metadata.get("unsatisfied_checks")),
        reason=str(metadata.get("reason") or ""),
    )


#: Timeline entries that are also wire events (SWR-1832), keyed by the ``type``
#: the producer writes.
#:
#: The completion gate and the repair budget are decided in
#: ``rotaris_core.ralph.loop``, which records each of them here as a timeline
#: entry whose ``metadata`` already carries exactly the fields the event needs.
#: Publishing from this single seam rather than from three call sites in the
#: loop keeps the two representations from drifting, and gives the emission the
#: same "durable record first" ordering ``record_tool_call`` has.
#:
#: Each key must map to exactly one moment: ``repair_attempt_scheduled`` and
#: ``repair_escalation`` are the two mutually exclusive outcomes of one repair
#: decision, so a gated iteration produces exactly one ``gate.repair``.
_TIMELINE_STREAM_EVENTS: dict[str, Callable[[str, dict[str, Any]], RotarisEvent]] = {
    "completion_gate_decision": _gate_decision_event,
    "repair_attempt_scheduled": _gate_repair_event,
    "repair_escalation": _gate_repair_event,
}


@traces(SWR.SWR_1832)
def _publish_timeline_event(bus_id: str, event_type: str, metadata: dict[str, Any]) -> None:
    """Publish the wire event a timeline entry doubles as, if it has one.

    A metadata dict that does not build a valid event is logged and dropped:
    the durable timeline line is already written, and the stream degrading is
    never a reason to fail the iteration that produced it.
    """
    build = _TIMELINE_STREAM_EVENTS.get(event_type)
    if build is None:
        return
    try:
        event = build(bus_id, metadata)
    except Exception:  # noqa: BLE001 - a broken stream must not fail the run.
        _log.warning("Could not build the %s event for the stream.", event_type, exc_info=True)
        return
    publish(bus_id, event)


@traces(SWR.SWR_1829)
def record_issue(
    session_dir: Path,
    *,
    kind: str,
    severity: Severity = "warning",
    actor: str | None = None,
    message: str,
    evidence_ref: str | None = None,
    metadata: dict[str, Any] | None = None,
    session_id: str = "",
) -> str:
    issue_id = uuid.uuid4().hex[:12]
    issue = {
        "id": issue_id,
        "timestamp": dt.datetime.now(dt.UTC).isoformat(),
        "kind": kind,
        "severity": severity,
        "actor": actor,
        "message": message,
        "evidence_ref": evidence_ref,
        "metadata": metadata or {},
    }
    path = session_dir / "issues.json"
    with _LOCK:
        data = _read_json_object(path, {"issues": []})
        issues = list(data.get("issues", []))
        issues.append(issue)
        data["issues"] = issues[-_MAX_ISSUES:]
        path.parent.mkdir(parents=True, exist_ok=True)
        atomic_write(path, json.dumps(data, indent=2, default=str))
    emit_timeline_event(
        session_dir,
        "issue",
        severity=severity,
        actor=actor,
        message=message,
        metadata={"kind": kind, "issue_id": issue_id, **(metadata or {})},
        session_id=session_id,
    )
    # Published after both writes, and only for ``error``: a ``warning`` or
    # ``info`` issue is routine session bookkeeping, and reporting one as an
    # ``error`` event would make a healthy run look broken to a CI consumer.
    if severity == "error":
        bus_id = bus_session_id(session_dir, session_id)
        publish(
            bus_id,
            ErrorEvent(
                session_id=bus_id,
                message=message,
                error_class=kind,
                detail=evidence_ref or "",
                # Nothing routed through an issue aborts the run on its own; the
                # fatal outcome is the run-end result event (unit U6).
                fatal=False,
            ),
        )
    return issue_id


@traces(SWR.SWR_1829)
def record_tool_call(
    session_dir: Path,
    *,
    agent_name: str,
    tool_name: str,
    call_id: str,
    status: str,
    elapsed_ms: int,
    is_error: bool = False,
    args: str | None = None,
    result: str | None = None,
    outcome_kind: str | None = None,
    exit_code: int | None = None,
    failure_kind: str | None = None,
    warnings: list[str] | None = None,
    session_id: str = "",
) -> None:
    payload: dict[str, Any] = {
        "timestamp": dt.datetime.now(dt.UTC).isoformat(),
        "agent_name": agent_name,
        "tool_name": tool_name,
        "call_id": call_id,
        "status": status,
        "elapsed_ms": elapsed_ms,
        "is_error": is_error,
    }
    if args is not None:
        payload["args"] = args
    if result is not None:
        payload["result"] = result
    if outcome_kind is not None:
        payload["outcome_kind"] = outcome_kind
    if exit_code is not None:
        payload["exit_code"] = exit_code
    if failure_kind is not None:
        payload["failure_kind"] = failure_kind
    if warnings:
        payload["warnings"] = warnings
    _append_jsonl(
        evidence_dir(session_dir) / "tool-calls.jsonl",
        payload,
        max_lines=_MAX_TOOL_CALLS,
    )
    _publish_tool_call(
        bus_session_id(session_dir, session_id),
        tool_name=tool_name,
        call_id=call_id,
        status=status,
        elapsed_ms=elapsed_ms,
        is_error=is_error,
        args=args,
        outcome_kind=outcome_kind,
        failure_kind=failure_kind,
    )
    _record_tool_call_issue_if_needed(session_dir, payload, session_id=session_id)


@traces(SWR.SWR_1829)
def _publish_tool_call(
    bus_id: str,
    *,
    tool_name: str,
    call_id: str,
    status: str,
    elapsed_ms: int,
    is_error: bool,
    args: str | None,
    outcome_kind: str | None,
    failure_kind: str | None,
) -> None:
    """Stream the two halves of one already-completed tool call, in order.

    ``record_tool_call`` is handed a finished call — the caller times it and
    reports start and terminal facts together — but the stream owes a consumer
    both a ``tool.start`` and a ``tool.finish``, so both are emitted here.
    """
    publish(
        bus_id,
        ToolStartEvent(
            session_id=bus_id,
            tool_name=tool_name,
            call_id=call_id,
            # Redacted by the model validator rather than here; see
            # ``_tool_arguments``.  What ``evidence/tool-calls.jsonl`` stores is
            # deliberately left as it was — the on-disk record is pre-existing
            # and not this epic's to change.
            arguments=_tool_arguments(args),
        ),
    )
    publish(
        bus_id,
        ToolFinishEvent(
            session_id=bus_id,
            tool_name=tool_name,
            call_id=call_id,
            status=status,
            duration_ms=float(elapsed_ms),
            error=(failure_kind or outcome_kind or status) if is_error else None,
        ),
    )


def _record_tool_call_issue_if_needed(
    session_dir: Path,
    payload: dict[str, Any],
    *,
    session_id: str = "",
) -> None:
    is_error = bool(payload.get("is_error", False))
    outcome_kind = str(payload.get("outcome_kind", "") or "")
    failure_kind = str(payload.get("failure_kind", "") or "")

    issue_kind: str | None = None
    severity: Severity = "warning"
    if outcome_kind == "shell_failure":
        issue_kind = "terminal_shell_failure"
        severity = "error"
    elif outcome_kind == "suspicious_success":
        issue_kind = "terminal_suspicious_success"
    elif outcome_kind == "timeout" or failure_kind == "timeout":
        issue_kind = "terminal_timeout"
        severity = "error"
    elif failure_kind or is_error:
        issue_kind = "tool_error"

    if issue_kind is None:
        return

    record_issue(
        session_dir,
        kind=issue_kind,
        severity=severity,
        actor=str(payload.get("agent_name", "") or "") or None,
        message=(
            f"Tool {payload.get('tool_name')} ended with "
            f"{outcome_kind or failure_kind or payload.get('status')}"
        ),
        evidence_ref="evidence/tool-calls.jsonl",
        metadata={
            "tool_name": payload.get("tool_name"),
            "call_id": payload.get("call_id"),
            "elapsed_ms": payload.get("elapsed_ms"),
            "exit_code": payload.get("exit_code"),
            "failure_kind": payload.get("failure_kind"),
            "warnings": payload.get("warnings", []),
        },
        session_id=session_id,
    )


@traces(SWR.SWR_2506, SWR.SWR_1829, SWR.SWR_1832)
def record_permission_decision(
    session_dir: Path,
    *,
    session_id: str,
    agent_id: str,
    persona: str,
    tool_name: str,
    decision: str,
    rule_id: str,
    source: str,
    summary: str,
    reason: str,
    request_id: str = "",
) -> None:
    """Append one resolved permission decision to the session's audit log.

    *summary* must already be redacted (see
    :func:`rotaris_core.permissions.approval.argument_summary`): this file is the
    durable record, so a secret written here outlives the run.

    *request_id* pairs this decision with the ``approval.requested`` event that
    raised it (SWR-1832).  Callers that have one pass it; the audit sink does
    not, so an unset id falls back to the request the approval resolver raised
    on this very thread — the engine resolves an ``ask`` and records its outcome
    in one synchronous call stack, which is what makes that hand-off exact.  A
    decision that never went to a human leaves the field empty.
    """
    if not request_id:
        from rotaris_core.permissions.approval import take_approval_request_id

        request_id = take_approval_request_id(
            session_id=session_id,
            tool_name=tool_name,
            source=source,
        )
    payload: dict[str, Any] = {
        "timestamp": dt.datetime.now(dt.UTC).isoformat(),
        "session_id": session_id,
        "agent_id": agent_id,
        "persona": persona,
        "tool_name": tool_name,
        "decision": decision,
        "rule_id": rule_id,
        "source": source,
        "summary": summary,
        "reason": reason,
    }
    if request_id:
        # The pairing belongs in the durable trail too, not only on the lossy
        # stream — otherwise an audit replay cannot tell which approval a
        # decision answered.  Written only when there is one, matching how
        # ``record_tool_call`` leaves out the keys that do not apply, so a
        # decision that never went to a human keeps the record it always had.
        payload["request_id"] = request_id
    _append_jsonl(
        evidence_dir(session_dir) / "permissions.jsonl",
        payload,
        max_lines=_MAX_PERMISSION_DECISIONS,
    )
    bus_id = bus_session_id(session_dir, session_id)
    publish(
        bus_id,
        PermissionDecisionEvent(
            session_id=bus_id,
            request_id=request_id,
            tool_name=tool_name,
            decision=decision,
            source=source,
            rule_id=rule_id,
            # Already redacted by the caller; the model validator masks it again
            # because a future caller may not be as careful.
            summary=summary,
        ),
    )
    if decision == "deny":
        record_issue(
            session_dir,
            kind="permission_denied",
            severity="warning",
            actor=agent_id or persona,
            message=f"Permission denied for {summary or tool_name}: {reason}",
            evidence_ref="evidence/permissions.jsonl",
            metadata={
                "tool_name": tool_name,
                "rule_id": rule_id,
                "source": source,
                "persona": persona,
            },
        )
    elif source in {"user-once", "user-session"}:
        emit_timeline_event(
            session_dir,
            "permission_approved",
            actor=agent_id or persona,
            message=f"The user approved {summary or tool_name}",
            metadata={
                "tool_name": tool_name,
                "rule_id": rule_id,
                "source": source,
                "persona": persona,
            },
            session_id=session_id,
        )


@traces(SWR.SWR_2506)
def record_permission_mode_change(
    session_dir: Path,
    *,
    session_id: str,
    requested_mode: str,
    effective_mode: str,
    previous_mode: str,
    source: str,
    reason: str,
    skipped_personas: Sequence[str] = (),
) -> None:
    """Append one mid-session permission mode change to the audit log (SWR-2503).

    Shares ``permissions.jsonl`` with the decisions themselves so the trail
    reads in order: the mode a call was judged under is whatever the most recent
    change above it says.  Carries no argument values, so nothing to redact.

    ``skipped_personas`` names the persona-pinned agents the change did not
    reach (SWR-2509).  It is recorded even when empty, so that a reader can tell
    "reached everything" from "written before this field existed" — an audit
    entry whose silence is ambiguous is worse than no entry at all.
    """
    payload = {
        "timestamp": dt.datetime.now(dt.UTC).isoformat(),
        "event": "permission_mode_change",
        "session_id": session_id,
        "agent_id": source,
        "requested_mode": requested_mode,
        "effective_mode": effective_mode,
        "previous_mode": previous_mode,
        "source": source,
        "reason": reason,
        "skipped_personas": list(skipped_personas),
    }
    _append_jsonl(
        evidence_dir(session_dir) / "permissions.jsonl",
        payload,
        max_lines=_MAX_PERMISSION_DECISIONS,
    )
    emit_timeline_event(
        session_dir,
        "permission_mode_changed",
        actor="permissions",
        message=(
            f"Permission mode changed from '{previous_mode}' to '{effective_mode}'"
            + (f": {reason}" if reason else "")
            + (
                f" (not applied to persona-pinned agents: {', '.join(skipped_personas)})"
                if skipped_personas
                else ""
            )
        ),
        metadata={
            "requested_mode": requested_mode,
            "effective_mode": effective_mode,
            "previous_mode": previous_mode,
            "source": source,
            "skipped_personas": list(skipped_personas),
        },
        session_id=session_id,
    )


def record_model_input(
    session_dir: Path,
    *,
    actor: str | None,
    model: str | None,
    purpose: str | None,
    dropped_stale_system_messages: int,
    dropped_stale_tool_descriptions: int,
    input_messages_before: int,
    input_messages_after: int,
) -> None:
    payload = {
        "timestamp": dt.datetime.now(dt.UTC).isoformat(),
        "actor": actor,
        "model": model,
        "purpose": purpose,
        "dropped_stale_system_messages": dropped_stale_system_messages,
        "dropped_stale_tool_descriptions": dropped_stale_tool_descriptions,
        "input_messages_before": input_messages_before,
        "input_messages_after": input_messages_after,
    }
    _append_jsonl(
        evidence_dir(session_dir) / "model-input.jsonl",
        payload,
        max_lines=_MAX_MODEL_INPUTS,
    )
    if dropped_stale_system_messages or dropped_stale_tool_descriptions:
        record_issue(
            session_dir,
            kind="model_input_sanitized",
            severity="warning",
            actor=actor,
            message=(
                "Dropped stale model-input history "
                f"(system={dropped_stale_system_messages}, "
                f"tool_descriptions={dropped_stale_tool_descriptions})"
            ),
            evidence_ref="evidence/model-input.jsonl",
            metadata=payload,
        )


def record_context_selection(
    session_dir: Path,
    *,
    actor: str | None,
    task_name: str | None,
    available_artifacts: int,
    injected_artifact_ids: Sequence[str],
    elided_artifact_ids: Sequence[str],
    full_artifact_ids: Sequence[str] | None = None,
) -> None:
    payload = {
        "timestamp": dt.datetime.now(dt.UTC).isoformat(),
        "actor": actor,
        "task_name": task_name,
        "available_artifacts": available_artifacts,
        "injected_artifact_ids": injected_artifact_ids,
        "elided_artifact_ids": elided_artifact_ids,
        "full_artifact_ids": full_artifact_ids or [],
    }
    _append_jsonl(
        evidence_dir(session_dir) / "context-selection.jsonl",
        payload,
        max_lines=_MAX_CONTEXT_SELECTIONS,
    )


def record_report_validation(
    session_dir: Path,
    *,
    actor: str,
    original_status: str,
    final_status: str,
    reasons: list[str],
    execution_elapsed_s: float | None = None,
    summary_elapsed_s: float | None = None,
) -> None:
    payload = {
        "timestamp": dt.datetime.now(dt.UTC).isoformat(),
        "actor": actor,
        "original_status": original_status,
        "final_status": final_status,
        "reasons": reasons,
        "execution_elapsed_s": execution_elapsed_s,
        "summary_elapsed_s": summary_elapsed_s,
    }
    _append_jsonl(
        evidence_dir(session_dir) / "report-validation.jsonl",
        payload,
        max_lines=_MAX_REPORT_VALIDATIONS,
    )
    if original_status != final_status or reasons:
        record_issue(
            session_dir,
            kind="report_validation",
            severity="warning",
            actor=actor,
            message=f"Report validation status {original_status} -> {final_status}",
            evidence_ref="evidence/report-validation.jsonl",
            metadata=payload,
        )


def record_memory_snapshot(
    session_dir: Path,
    *,
    label: str,
    actor: str | None,
    rss_bytes: int | None,
    traced_current_bytes: int | None,
    traced_peak_bytes: int | None,
    top_allocations: list[dict[str, Any]],
    metadata: dict[str, Any] | None = None,
) -> None:
    payload = {
        "timestamp": dt.datetime.now(dt.UTC).isoformat(),
        "label": label,
        "actor": actor,
        "rss_bytes": rss_bytes,
        "traced_current_bytes": traced_current_bytes,
        "traced_peak_bytes": traced_peak_bytes,
        "top_allocations": top_allocations,
        "metadata": metadata or {},
    }
    _append_jsonl(
        evidence_dir(session_dir) / "memory.jsonl",
        payload,
        max_lines=_MAX_MEMORY_SNAPSHOTS,
    )


@traces(SWR.SWR_1549)
def update_conversation_index(
    session_dir: Path,
    *,
    conversation_id: str,
    agent_name: str,
    persona: str,
    model: str | None = None,
    task_id: str | None = None,
    status: str = "running",
) -> None:
    events_dir = _resolve_conversation_events_dir(session_dir, conversation_id)
    dir_id = events_dir.parent.name if events_dir is not None else conversation_id
    rel_path = f"evidence/conversations/event_logs/{dir_id}"
    path = conversations_dir(session_dir) / "index.json"
    with _LOCK:
        data = _read_json_object(path, {"conversations": []})
        entries = list(data.get("conversations", []))
        now = dt.datetime.now(dt.UTC).isoformat()
        existing = next((e for e in entries if e.get("conversation_id") == conversation_id), None)
        event_count = _conversation_event_count(session_dir, conversation_id)
        if existing is None:
            entries.append(
                {
                    "conversation_id": conversation_id,
                    "agent_name": agent_name,
                    "persona": persona,
                    "model": model,
                    "task_id": task_id,
                    "started_at": now,
                    "ended_at": None,
                    "status": status,
                    "event_count": event_count,
                    "path": rel_path,
                },
            )
        else:
            existing.update(
                {
                    "agent_name": agent_name,
                    "persona": persona,
                    "model": model or existing.get("model"),
                    "task_id": task_id or existing.get("task_id"),
                    "status": status,
                    "event_count": event_count,
                    "ended_at": now if status != "running" else existing.get("ended_at"),
                },
            )
        data["conversations"] = entries
        path.parent.mkdir(parents=True, exist_ok=True)
        atomic_write(path, json.dumps(data, indent=2, default=str))


def build_metrics(state: SessionState, session_dir: Path) -> dict[str, Any]:
    tool_calls = _read_jsonl(evidence_dir(session_dir) / "tool-calls.jsonl")
    model_inputs = _read_jsonl(evidence_dir(session_dir) / "model-input.jsonl")
    context_selections = _read_jsonl(evidence_dir(session_dir) / "context-selection.jsonl")
    report_validations = _read_jsonl(evidence_dir(session_dir) / "report-validation.jsonl")
    permission_entries = _read_jsonl(evidence_dir(session_dir) / "permissions.jsonl")
    # permissions.jsonl also carries mid-session mode changes (SWR-2503); they
    # carry no decision and must not be counted as one.
    permission_decisions = [e for e in permission_entries if e.get("decision")]
    permission_mode_changes = sum(
        1 for e in permission_entries if e.get("event") == "permission_mode_change"
    )
    issues = _read_json_object(session_dir / "issues.json", {"issues": []}).get("issues", [])
    slowest = sorted(tool_calls, key=lambda e: int(e.get("elapsed_ms", 0)), reverse=True)[:10]
    tool_outcomes = _classify_tool_outcomes(tool_calls)
    stale_system_drops = sum(
        int(e.get("dropped_stale_system_messages", 0) or 0) for e in model_inputs
    )
    stale_tool_drops = sum(
        int(e.get("dropped_stale_tool_descriptions", 0) or 0) for e in model_inputs
    )
    artifact_injected = sum(
        len(e.get("injected_artifact_ids", []) or []) for e in context_selections
    )
    artifact_elided = sum(len(e.get("elided_artifact_ids", []) or []) for e in context_selections)
    return {
        "session_id": state.session_id,
        "execution_status": state.execution_status,
        "updated_at": state.updated_at.isoformat(),
        "global_tool_call_count": state.global_tool_call_count,
        "global_token_usage": state.global_token_usage.model_dump(mode="json"),
        "global_cost": state.global_cost.model_dump(mode="json"),
        "global_compressions": state.global_compressions,
        "agents": {
            name: metrics.model_dump(mode="json")
            for name, metrics in sorted(state.agent_metrics.items())
        },
        "tool_call_records": len(tool_calls),
        "tool_outcomes": tool_outcomes,
        "terminal_shell_failures": tool_outcomes.get("shell_failure", 0),
        "terminal_suspicious_successes": tool_outcomes.get("suspicious_success", 0),
        "terminal_timeouts": tool_outcomes.get("timeout", 0),
        "slowest_tools": slowest,
        "model_input_records": len(model_inputs),
        "stale_system_messages_dropped": stale_system_drops,
        "stale_tool_descriptions_dropped": stale_tool_drops,
        "context_selection_records": len(context_selections),
        "artifact_injected_count": artifact_injected,
        "artifact_elided_count": artifact_elided,
        "report_validation_records": len(report_validations),
        "report_validation_downgrades": sum(
            1 for e in report_validations if e.get("original_status") != e.get("final_status")
        ),
        "permission_decision_records": len(permission_decisions),
        "permission_denials": sum(1 for e in permission_decisions if e.get("decision") == "deny"),
        "permissions_by_decision": _count_by_key(permission_decisions, "decision"),
        "permissions_by_source": _count_by_key(permission_decisions, "source"),
        "permission_mode_changes": permission_mode_changes,
        "issue_count": len(issues),
        "issues_by_kind": _count_by_key(issues, "kind"),
    }


@traces(SWR.SWR_841)
def _format_metrics_cost(metrics: dict[str, Any]) -> str:
    """Render the persisted cost block, tolerating snapshots without one."""
    from rotaris_core.cost import CostSnapshot, format_cost

    raw = metrics.get("global_cost")
    if not isinstance(raw, dict):
        return "n/a"
    return format_cost(CostSnapshot.model_validate(raw))


def render_summary(state: SessionState, metrics: dict[str, Any]) -> str:
    first_user = next(
        (
            str(e.get("content", "")).strip()
            for e in state.transcript_events
            if e.get("role") == "user"
        ),
        "",
    )
    progress = state.ralph_progress or {}
    lines = [
        f"# Session {state.session_id}",
        "",
        f"- Status: {state.execution_status}",
        f"- Workspace: `{state.workspace_root}`",
        f"- Created: {state.created_at.isoformat()}",
        f"- Updated: {state.updated_at.isoformat()}",
    ]
    if first_user:
        lines.append(f"- Task: {first_user[:240]}")
    if progress.get("stop_reason"):
        lines.append(f"- Stop reason: {progress['stop_reason']}")
    lines.extend(
        [
            "",
            "## Metrics",
            "",
            f"- Tool calls: {metrics.get('global_tool_call_count', 0)}",
            f"- Compressions: {metrics.get('global_compressions', 0)}",
            f"- Tokens: {metrics.get('global_token_usage', {}).get('total_tokens', 0)}",
            f"- Cost: {_format_metrics_cost(metrics)}",
            f"- Issues: {metrics.get('issue_count', 0)}",
        ],
    )
    warnings: list[str] = []
    if metrics.get("stale_system_messages_dropped") or metrics.get(
        "stale_tool_descriptions_dropped",
    ):
        warnings.append(
            "Stale model-input instructions were dropped "
            f"(system={metrics.get('stale_system_messages_dropped', 0)}, "
            f"tools={metrics.get('stale_tool_descriptions_dropped', 0)}).",
        )
    if metrics.get("artifact_elided_count", 0) and not metrics.get("artifact_injected_count", 0):
        warnings.append("Artifacts were available but mostly elided from automatic context.")
    if metrics.get("report_validation_downgrades", 0):
        warnings.append(
            f"{metrics.get('report_validation_downgrades')} report(s) were downgraded "
            "by validation.",
        )
    permission_denials = int(metrics.get("permission_denials", 0) or 0)
    if permission_denials:
        warnings.append(
            f"{permission_denials} tool call(s) were denied by the permission policy "
            "(see `evidence/permissions.jsonl`).",
        )
    tool_error_count = metrics.get("issues_by_kind", {}).get("tool_error", 0)
    if tool_error_count:
        warnings.append(f"{tool_error_count} tool error issue(s) recorded.")
    terminal_shell_failures = int(metrics.get("terminal_shell_failures", 0) or 0)
    terminal_suspicious_successes = int(metrics.get("terminal_suspicious_successes", 0) or 0)
    terminal_timeouts = int(metrics.get("terminal_timeouts", 0) or 0)
    if terminal_shell_failures:
        warnings.append(f"{terminal_shell_failures} terminal shell failure(s) recorded.")
    if terminal_suspicious_successes:
        warnings.append(
            f"{terminal_suspicious_successes} suspicious terminal success(es) recorded.",
        )
    if terminal_timeouts:
        warnings.append(f"{terminal_timeouts} terminal timeout(s) recorded.")
    if warnings:
        lines.extend(["", "## Warnings", ""])
        for warning in warnings:
            lines.append(f"- {warning}")
    agents = metrics.get("agents", {})
    if agents:
        lines.extend(["", "## Agents", ""])
        for name, data in agents.items():
            lines.append(
                f"- `{name}`: tools={data.get('tool_call_count', 0)}, "
                f"compressions={data.get('compressions', 0)}, "
                f"tokens={data.get('token_usage', {}).get('total_tokens', 0)}",
            )
    slowest = metrics.get("slowest_tools", [])
    if slowest:
        lines.extend(["", "## Slowest Tools", ""])
        for item in slowest[:5]:
            lines.append(
                f"- `{item.get('agent_name')}` `{item.get('tool_name')}` "
                f"{item.get('elapsed_ms')}ms status={item.get('status')}",
            )
    lines.extend(
        [
            "",
            "## Inspection",
            "",
            "- Start with `issues.json`, then `timeline.jsonl`, then `evidence/debug.log`.",
        ],
    )
    return "\n".join(lines).rstrip() + "\n"


def _run_config_payload(state: SessionState) -> dict[str, Any]:
    config_snapshot = dict(state.config_snapshot)
    # Resolve system_prompt_file references so the actual prompt text is captured.
    personas = config_snapshot.get("personas")
    if isinstance(personas, dict):
        from rotaris_core.agents.factory import load_system_prompt  # lazy import
        from rotaris_core.config.schema import PersonaConfig

        enriched: dict[str, Any] = {}
        for name, cfg in personas.items():
            if isinstance(cfg, dict):
                try:
                    persona = PersonaConfig.model_validate(cfg)
                    resolved = load_system_prompt(persona)
                    if resolved:
                        enriched[name] = {**cfg, "resolved_system_prompt": resolved}
                    else:
                        enriched[name] = cfg
                except Exception:  # noqa: BLE001
                    enriched[name] = cfg
            else:
                enriched[name] = cfg
        config_snapshot["personas"] = enriched
    return {
        "session_id": state.session_id,
        "workspace_root": state.workspace_root,
        "created_at": state.created_at.isoformat(),
        "run_intent": state.run_intent,
        "permission_mode": state.permission_mode,
        "check_suite": state.check_suite.model_dump(mode="json") if state.check_suite else None,
        "resolved_playbooks": _resolved_playbooks(state),
        "hooks": _resolved_hooks(state),
        "config_snapshot": config_snapshot,
    }


@traces(SWR.SWR_2701)
def _resolved_hooks(state: SessionState) -> list[dict[str, Any]]:
    """The effective hook set for this run, recorded with the session snapshot.

    ``run_config.json`` is written once, at session start, so this is the hook
    set the run actually began with — a later config edit cannot rewrite the
    audit trail of what was allowed to execute.

    Commands are stored redacted: a hook command line is user-authored shell and
    routinely carries a token, and this file is read by anyone inspecting the
    session directory.
    """
    if not state.config_snapshot:
        return []
    try:
        from rotaris_core.config.schema import RotarisConfig  # lazy import
        from rotaris_core.hooks.models import resolve_hooks
        from rotaris_core.permissions.approval import redact_secrets

        config = RotarisConfig.model_validate(state.config_snapshot)
        return [
            {
                "hook_id": hook.hook_id,
                "name": hook.name,
                "event": hook.event,
                "matcher": hook.matcher,
                "source": hook.source,
                # str() first: a hand-written config snapshot can carry a
                # non-string command past validation, and the run config must
                # not be the thing that fails a session start.
                "command": redact_secrets(str(hook.command)),
            }
            for hook in resolve_hooks(config)
        ]
    except Exception:  # noqa: BLE001
        return []


@traces(SWR.SWR_2416, SWR.SWR_2425)
def _resolved_playbooks(state: SessionState) -> dict[str, Any]:
    """Return the playbook cell each persona resolves to for this run's intent.

    Recorded alongside ``resolved_system_prompt`` so a finished session can be audited
    for *which* playbook it actually ran, not just the prompt text it produced.
    """
    if not state.run_intent or not state.config_snapshot:
        return {}
    try:
        from rotaris_core.agents.factory import resolve_playbook_for_persona  # lazy import
        from rotaris_core.config.schema import RotarisConfig

        config = RotarisConfig.model_validate(state.config_snapshot)
        cells: dict[str, Any] = {}
        for persona_name in config.personas:
            cell = resolve_playbook_for_persona(persona_name, config, state.run_intent)
            if cell is not None:
                cells[persona_name] = cell.as_dict()
        return cells
    except Exception:  # noqa: BLE001
        return {}


@traces(SWR.SWR_1829)
def _tool_arguments(args: str | None) -> dict[str, Any]:
    """Shape a recorded tool-call argument blob into the stream's mapping form.

    ``record_tool_call`` receives ``args`` as whatever ``str(action)`` produced,
    which is usually a repr and occasionally a JSON object.  A JSON object is
    unpacked so a consumer sees real argument names; anything else is carried
    under a single ``args`` key rather than guessed at.

    The returned mapping is *not* redacted here — ``ToolStartEvent`` masks it in
    a model validator (``redact_arguments``), which is the only path that cannot
    be bypassed by a caller constructing or mutating the event directly.
    """
    if not args:
        return {}
    try:
        parsed = json.loads(args)
    except (TypeError, ValueError):
        return {"args": args}
    if isinstance(parsed, dict) and parsed:
        return {str(key): value for key, value in parsed.items()}
    return {"args": args}


def _artifact_refs(report_artifacts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    refs: list[dict[str, Any]] = []
    for artifact in report_artifacts:
        ref = {k: artifact.get(k) for k in ("id", "agent_name", "status", "path") if k in artifact}
        if ref:
            refs.append(ref)
    return refs


def _append_jsonl(path: Path, payload: dict[str, Any], *, max_lines: int | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    line = json.dumps(payload, sort_keys=True, default=str)
    with _LOCK:
        if max_lines is None or not path.exists():
            with path.open("a", encoding="utf-8") as handle:
                handle.write(line + "\n")
            return
        lines: deque[str] = deque(maxlen=max_lines)
        with path.open(encoding="utf-8") as handle:
            for existing in handle:
                stripped = existing.rstrip("\n")
                if stripped:
                    lines.append(stripped)
        lines.append(line)
        atomic_write(path, "\n".join(lines) + "\n")


def _read_json_object(path: Path, default: dict[str, Any]) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return dict(default)
    return data if isinstance(data, dict) else dict(default)


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            data = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(data, dict):
            rows.append(data)
    return rows


def _write_json_if_missing(path: Path, payload: dict[str, Any]) -> None:
    if path.exists():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    atomic_write(path, json.dumps(payload, indent=2, default=str))


def _count_by_key(items: list[Any], key: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        value = str(item.get(key) or "unknown")
        counts[value] = counts.get(value, 0) + 1
    return counts


@traces(SWR.SWR_2911)
def _classify_tool_outcomes(tool_calls: list[Any]) -> dict[str, int]:
    """Bucket every tool call, not only the ones the terminal classifier saw.

    ``classify_terminal_observation`` is terminal-specific, so ``outcome_kind``
    is absent on every other tool and counting that field alone filed almost
    all calls under ``unknown``.  ``status`` and ``is_error`` are recorded for
    each call regardless, so derive the bucket from those when no richer
    outcome exists; ``unknown`` then means genuinely unclassifiable.
    """
    counts: dict[str, int] = {}
    for item in tool_calls:
        if not isinstance(item, dict):
            continue
        kind = str(item.get("outcome_kind") or "") or _derived_outcome_kind(item)
        counts[kind] = counts.get(kind, 0) + 1
    return counts


@traces(SWR.SWR_2911)
def _derived_outcome_kind(record: dict[str, Any]) -> str:
    """Classify one tool call from its recorded status and error flag."""
    status = str(record.get("status") or "").strip().lower()
    if status == "rejected":
        # A permission rejection is not a tool failure; keep them apart even
        # though ``record_tool_call`` flags both as errors.
        return "rejected"
    if record.get("is_error") or status in {"error", "failed"}:
        # Same label the issue recorder already uses for these calls.
        return "tool_error"
    if status:
        return "success"
    return "unknown"


@traces(SWR.SWR_1547)
def _resolve_conversation_events_dir(session_dir: Path, conversation_id: str) -> Path | None:
    """Return the on-disk ``events/`` directory for *conversation_id*.

    The OpenHands SDK creates event-log directories using ``uuid.UUID.hex``
    (32-char, no hyphens), while *conversation_id* may arrive as a standard
    hyphenated UUID string.  This helper normalises both forms so the caller
    always gets the real directory if one exists.
    """
    event_logs_dir = conversations_dir(session_dir) / "event_logs"

    # Fast path: exact match (hex format from SDK, or already-normalised).
    exact = event_logs_dir / conversation_id / "events"
    if exact.exists():
        return exact

    # Try the hyphen-stripped variant.
    normalised = conversation_id.replace("-", "")
    if normalised != conversation_id:
        alt = event_logs_dir / normalised / "events"
        if alt.exists():
            return alt

    # Fallback: scan the real filesystem for a directory whose name matches
    # when hyphens are removed from both sides.
    return _find_events_dir_by_normalised_name(event_logs_dir, normalised)


def _find_events_dir_by_normalised_name(
    event_logs_dir: Path,
    normalised: str,
) -> Path | None:
    if not event_logs_dir.is_dir():
        return None
    for candidate in sorted(event_logs_dir.iterdir()):
        if candidate.is_dir() and candidate.name.replace("-", "") == normalised:
            events_dir = candidate / "events"
            if events_dir.is_dir():
                return events_dir
    return None


@traces(SWR.SWR_1547)
def _conversation_event_count(session_dir: Path, conversation_id: str) -> int:
    events_dir = _resolve_conversation_events_dir(session_dir, conversation_id)
    if events_dir is None:
        return 0
    return sum(1 for path in events_dir.iterdir() if path.name.endswith(".json"))


@traces(SWR.SWR_1546, SWR.SWR_1547, SWR.SWR_1548, SWR.SWR_1549, SWR.SWR_1829, SWR.SWR_1832)
class SessionDiagnostics:
    """Per-session diagnostics writer with null-object semantics.

    Holds an optional ``session_dir`` and forwards to the module-level writers.
    When ``session_dir`` is ``None``, every method is a no-op. Lets callers drop
    the ubiquitous ``if session_dir is not None:`` guard and inline lazy imports
    while preserving identical persisted output.

    The module-level writers it forwards to also publish the SWR-1829 events
    that converge here — ``tool.start``/``tool.finish``,
    ``permission.decision`` and ``error`` — plus the SWR-1832 ones a timeline
    entry doubles as (``gate.decision`` and ``gate.repair``; see
    :data:`_TIMELINE_STREAM_EVENTS`) — *after* their file write, never
    inside the same guard: a broken stream can lose an event, it can never lose
    a durable record.  Publishing to a session nobody registered a sink for is a
    no-op by design (``events.bus.publish``), so a run without a stream behaves
    exactly as it did before.

    ``session_id`` addresses the bus and is optional: see :func:`bus_session_id`
    for the directory-name fallback that lets the construction sites deep in
    ``orchestrator/`` stream without an id threaded through three constructors.
    Pass it explicitly only when the directory name is not the session id.
    """

    __slots__ = ("_session_dir", "_session_id")

    def __init__(self, session_dir: Path | None, session_id: str = "") -> None:
        self._session_dir = session_dir
        self._session_id = bus_session_id(session_dir, session_id)

    @property
    def enabled(self) -> bool:
        return self._session_dir is not None

    @property
    def session_dir(self) -> Path | None:
        return self._session_dir

    @property
    def session_dir_str(self) -> str | None:
        return str(self._session_dir) if self._session_dir is not None else None

    @property
    def session_id(self) -> str:
        """The bus key these diagnostics publish under; ``""`` means silent."""
        return self._session_id

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
        if self._session_dir is None:
            return None
        return record_issue(
            self._session_dir,
            kind=kind,
            severity=severity,
            actor=actor,
            message=message,
            evidence_ref=evidence_ref,
            metadata=metadata,
            session_id=self._session_id,
        )

    def timeline(
        self,
        event_type: str,
        *,
        severity: Severity = "info",
        actor: str | None = None,
        message: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> str | None:
        if self._session_dir is None:
            return None
        return emit_timeline_event(
            self._session_dir,
            event_type,
            severity=severity,
            actor=actor,
            message=message,
            metadata=metadata,
            session_id=self._session_id,
        )

    def tool_call(
        self,
        *,
        agent_name: str,
        tool_name: str,
        call_id: str,
        status: str,
        elapsed_ms: int,
        is_error: bool = False,
        args: str | None = None,
        result: str | None = None,
        outcome_kind: str | None = None,
        exit_code: int | None = None,
        failure_kind: str | None = None,
        warnings: list[str] | None = None,
    ) -> None:
        if self._session_dir is None:
            return
        record_tool_call(
            self._session_dir,
            agent_name=agent_name,
            tool_name=tool_name,
            call_id=call_id,
            status=status,
            elapsed_ms=elapsed_ms,
            is_error=is_error,
            args=args,
            result=result,
            outcome_kind=outcome_kind,
            exit_code=exit_code,
            failure_kind=failure_kind,
            warnings=warnings,
            session_id=self._session_id,
        )

    @traces(SWR.SWR_2506, SWR.SWR_1829, SWR.SWR_1832)
    def permission_decision(
        self,
        *,
        session_id: str,
        agent_id: str,
        persona: str,
        tool_name: str,
        decision: str,
        rule_id: str,
        source: str,
        summary: str,
        reason: str,
        request_id: str = "",
    ) -> None:
        if self._session_dir is None:
            return
        record_permission_decision(
            self._session_dir,
            session_id=session_id,
            agent_id=agent_id,
            persona=persona,
            tool_name=tool_name,
            decision=decision,
            rule_id=rule_id,
            source=source,
            summary=summary,
            reason=reason,
            request_id=request_id,
        )

    def conversation_index(
        self,
        *,
        conversation_id: str,
        agent_name: str,
        persona: str,
        model: str | None = None,
        task_id: str | None = None,
        status: str = "running",
    ) -> None:
        if self._session_dir is None:
            return
        update_conversation_index(
            self._session_dir,
            conversation_id=conversation_id,
            agent_name=agent_name,
            persona=persona,
            model=model,
            task_id=task_id,
            status=status,
        )

    def context_selection(
        self,
        *,
        actor: str | None,
        task_name: str | None,
        available_artifacts: int,
        injected_artifact_ids: Sequence[str],
        elided_artifact_ids: Sequence[str],
        full_artifact_ids: Sequence[str] | None = None,
    ) -> None:
        if self._session_dir is None:
            return
        record_context_selection(
            self._session_dir,
            actor=actor,
            task_name=task_name,
            available_artifacts=available_artifacts,
            injected_artifact_ids=injected_artifact_ids,
            elided_artifact_ids=elided_artifact_ids,
            full_artifact_ids=full_artifact_ids,
        )

    def report_validation(
        self,
        *,
        actor: str,
        original_status: str,
        final_status: str,
        reasons: list[str],
        execution_elapsed_s: float | None = None,
        summary_elapsed_s: float | None = None,
    ) -> None:
        if self._session_dir is None:
            return
        record_report_validation(
            self._session_dir,
            actor=actor,
            original_status=original_status,
            final_status=final_status,
            reasons=reasons,
            execution_elapsed_s=execution_elapsed_s,
            summary_elapsed_s=summary_elapsed_s,
        )

    def memory_snapshot(
        self,
        *,
        label: str,
        actor: str | None,
        rss_bytes: int | None,
        traced_current_bytes: int | None,
        traced_peak_bytes: int | None,
        top_allocations: list[dict[str, Any]],
        metadata: dict[str, Any] | None = None,
    ) -> None:
        if self._session_dir is None:
            return
        record_memory_snapshot(
            self._session_dir,
            label=label,
            actor=actor,
            rss_bytes=rss_bytes,
            traced_current_bytes=traced_current_bytes,
            traced_peak_bytes=traced_peak_bytes,
            top_allocations=top_allocations,
            metadata=metadata,
        )
