"""Per-session audit log for permission decisions (SWR-2506).

Fills the ``AuditSink`` seam SWR-2501 left open: every resolved decision — the
policy ones and the approval resolutions of SWR-2504 — is appended to
``<session_dir>/evidence/permissions.jsonl`` next to the other evidence files.

Sessions bind late, exactly like approval hosts (SWR-2504): an agent's engine is
built in three spawn paths, some of them before the run bootstrap knows the
session directory, and the entry agent is built with no runtime context at all.
The sink therefore resolves the directory from a session-keyed registry **at
record time**; a session nobody registered is a silent no-op rather than an
error, so unit tests and one-off agents keep working without a session on disk.

Entries never carry raw argument values.  The redaction is the one an approver
was shown (:func:`rotaris_core.permissions.approval.argument_summary`), so what
lands on disk is no more revealing than what the UI displayed.
"""

from __future__ import annotations

import logging
from threading import RLock
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from pathlib import Path

    from rotaris_core.permissions.engine import PermissionDecision, PermissionRequest

_log = logging.getLogger(__name__)

_sessions_lock = RLock()
_sessions: dict[str, Path] = {}


@traces(SWR.SWR_2506)
def register_audit_session(session_id: str, session_dir: Path) -> None:
    """Publish where a session's audit entries go; replaces any previous entry."""
    if not session_id:
        raise ValueError("An audit session needs a non-empty session id.")
    with _sessions_lock:
        _sessions[session_id] = session_dir


@traces(SWR.SWR_2506)
def resolve_audit_session(session_id: str | None) -> Path | None:
    """Return the session directory registered for *session_id*, or ``None``.

    Never falls back to another session's directory: one run's decisions must
    not land in another run's audit trail.
    """
    if not session_id:
        return None
    with _sessions_lock:
        return _sessions.get(session_id)


@traces(SWR.SWR_2506)
def discard_audit_session(session_id: str | None) -> None:
    """Stop auditing for *session_id* once its run is over."""
    if not session_id:
        return
    with _sessions_lock:
        _sessions.pop(session_id, None)


@traces(SWR.SWR_2506)
def reset_audit_registry() -> None:
    """Clear every registration (test isolation and full-process shutdown)."""
    with _sessions_lock:
        _sessions.clear()


@traces(SWR.SWR_2506)
class SessionAuditLog:
    """``AuditSink`` writing one agent's decisions into its session's audit log.

    One instance per agent — the engine's ``record`` hook carries no agent
    identity, so the agent id is bound here at construction time.
    """

    __slots__ = ("_agent_id", "_persona", "_session_id")

    def __init__(self, session_id: str, agent_id: str, persona: str = "") -> None:
        self._session_id = session_id
        self._agent_id = agent_id
        self._persona = persona

    def record(self, request: PermissionRequest, decision: PermissionDecision) -> None:
        session_dir = resolve_audit_session(self._session_id)
        if session_dir is None:
            return
        from rotaris_core.permissions.approval import argument_summary, redact_secrets
        from rotaris_core.session.diagnostics import record_permission_decision

        command = redact_secrets(request.command or "")
        summary = f"{request.tool_name}: {command}" if command else argument_summary(request)
        record_permission_decision(
            session_dir,
            session_id=self._session_id,
            agent_id=self._agent_id or request.persona,
            persona=request.persona or self._persona,
            tool_name=request.tool_name,
            decision=decision.decision.value,
            rule_id=decision.rule_id,
            source=decision.source.value,
            summary=summary,
            reason=decision.reason,
        )
