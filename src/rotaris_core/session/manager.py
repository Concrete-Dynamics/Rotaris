from __future__ import annotations

import datetime as dt
import logging
import time
from typing import TYPE_CHECKING, Any
from uuid import uuid4

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.session.persistence import SessionPersistence
from rotaris_core.session.state import SessionState

_log = logging.getLogger(__name__)

if TYPE_CHECKING:
    from pathlib import Path

    from rotaris_core.config.schema import RotarisConfig
    from rotaris_core.mcp.session_manager import SessionMCPManager
    from rotaris_core.session.persister import SessionPersister
    from rotaris_core.verifier.suite import ResolvedCheckSuite


@traces(SWR.SWR_1021, SWR.SWR_1023, SWR.SWR_1024, SWR.SWR_1028)
class SessionManager:
    """Orchestrates session lifecycle: create, load, save, and lock management."""

    _SAVE_DEBOUNCE_SECONDS: float = 10.0

    def __init__(self, workspace_root: Path, persist_debounce_seconds: float | None = None) -> None:
        """Initialize the session manager for a given workspace.

        Args:
            workspace_root: Root directory of the project workspace.
            persist_debounce_seconds: Override for the debounce window used by
                ``persister`` (default 10s). Hosts that poll persisted state to
                drive a live UI (e.g. Rotaris) want this much shorter than the
                default, which is tuned for headless/background runs.
        """
        self.workspace_root = workspace_root
        self.sessions_dir = workspace_root / ".rotaris" / "sessions"
        self.persistence = SessionPersistence(self.sessions_dir)
        self._last_save_at: dict[str, float] = {}
        self._pending_save_states: dict[str, SessionState] = {}
        self._persister: SessionPersister | None = None
        self._persist_debounce_seconds = persist_debounce_seconds
        self._mcp_manager: SessionMCPManager | None = None

    @property
    def mcp_manager(self) -> SessionMCPManager:
        """Session-scoped shared MCP client manager (lazy init).

        Owns long-lived MCP connections (e.g. LSP subprocess) that survive
        across child-agent conversations.  Call :meth:`shutdown_mcp` at
        session end to tear down all subprocesses.
        """
        if self._mcp_manager is None:
            from rotaris_core.mcp.session_manager import SessionMCPManager  # noqa: PLC0415

            self._mcp_manager = SessionMCPManager()
        return self._mcp_manager

    def shutdown_mcp(self) -> None:
        """Tear down all shared MCP clients. Idempotent."""
        if self._mcp_manager is not None:
            self._mcp_manager.shutdown()
            self._mcp_manager = None

    @property
    def persister(self) -> SessionPersister:
        """Debounced, off-event-loop persistence interface (preferred by hosts)."""
        if self._persister is None:
            from rotaris_core.session.persister import SessionPersister  # noqa: PLC0415

            kwargs = (
                {}
                if self._persist_debounce_seconds is None
                else {"debounce_seconds": self._persist_debounce_seconds}
            )
            self._persister = SessionPersister(self, **kwargs)
        return self._persister

    def session_dir(self, session_id: str) -> Path:
        """Return the filesystem directory for the given session id."""
        return self.persistence.session_dir(session_id)

    @staticmethod
    def new_session_id() -> str:
        """Create a stable session identifier before its snapshot is persisted."""
        timestamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
        return f"{timestamp}-{uuid4().hex[:12]}"

    @traces(SWR.SWR_2612)
    def _gated_suite(self, suite: ResolvedCheckSuite, *, run_id: str) -> ResolvedCheckSuite:
        """Attach the gate's lifecycle state to *suite*, or leave it unset.

        Session start is one of the two places SWR-2612 says the state is
        recomputed, and it is the only one that runs before anything else reads
        the suite. Deliberately best-effort: a workspace whose markers cannot be
        walked resolves without a gate rather than failing to open, and ``None``
        then reads as *not computed* — never as ``absent``.
        """
        from rotaris_core.verifier.gate_state import refresh_gate_state  # noqa: PLC0415

        try:
            gate = refresh_gate_state(suite, self.workspace_root, run_id=run_id)
        except Exception:  # noqa: BLE001 - the gate's state must never stop a session
            _log.debug(
                "Could not resolve the gate state for %s", self.workspace_root, exc_info=True
            )
            return suite
        return suite.model_copy(update={"gate": gate})

    def create_session(
        self,
        config: RotarisConfig,
        *,
        internal: bool = False,
        session_id: str | None = None,
        requirement_id: str = "",
        unit_id: str = "",
    ) -> SessionState:
        """Create a new session, persist its initial snapshot, and acquire a lock.

        Args:
            config: The active configuration to snapshot into the session.
            internal: Whether this session is machinery rather than a user's run.
            session_id: Use this id instead of a fresh one.
            requirement_id: The requirement this run implements, when it was
                started by requirement execution rather than by a human
                (SWR-3612). Empty for every hand-started run.
            unit_id: The execution unit within *requirement_id*, same rule.

        Returns:
            The newly created session state.

        Raises:
            RuntimeError: If the session lock cannot be acquired.
        """
        from rotaris_core.agents.agents_md_loader import clear_agents_md_cache  # noqa: PLC0415
        from rotaris_core.skills import clear_skill_catalog_cache  # noqa: PLC0415
        from rotaris_core.verifier.suite import resolve_check_suite  # noqa: PLC0415

        now = dt.datetime.now(dt.UTC)
        default_persona = config.personas.get(config.default_persona)
        permission_mode = (
            default_persona.permission_mode if default_persona else None
        ) or config.runtime.permission_mode
        resolved_session_id = session_id or self.new_session_id()
        check_suite = self._gated_suite(
            resolve_check_suite(config, self.workspace_root),
            run_id=resolved_session_id,
        )
        state = SessionState(
            session_id=resolved_session_id,
            workspace_root=str(self.workspace_root),
            created_at=now,
            updated_at=now,
            config_snapshot=config.model_dump(mode="json"),
            permission_mode=permission_mode,
            check_suite=check_suite,
            internal=internal,
            requirement_id=requirement_id,
            unit_id=unit_id,
        )
        clear_agents_md_cache()
        clear_skill_catalog_cache()
        self.persistence.save_snapshot(state)
        if not self.persistence.acquire_lock(state.session_id):
            raise RuntimeError(f"Unable to acquire lock for session {state.session_id}")
        return state

    def save_session(self, state: SessionState) -> None:
        """Persist session state, debounced for active runs.

        Terminal sessions (non-running/non-idle) are saved immediately.
        Active sessions are debounced to reduce I/O during rapid state changes.
        """
        state.updated_at = dt.datetime.now(dt.UTC)
        now = time.monotonic()
        sid = state.session_id
        # Always flush immediately when the session is terminal — debounce
        # only applies during active runs where state changes rapidly.
        if state.execution_status not in {"running", "idle"}:
            self._last_save_at[sid] = now
            self._flush_pending(sid)
            self.persistence.save_snapshot(state)
            return
        last = self._last_save_at.get(sid, 0.0)
        if now - last < self._SAVE_DEBOUNCE_SECONDS:
            self._pending_save_states[sid] = state
            return
        self._last_save_at[sid] = now
        self._flush_pending(sid)
        self.persistence.save_snapshot(state)

    def flush_session(self, state: SessionState) -> None:
        """Force-save immediately, bypassing the debounce. Call on shutdown."""
        state.updated_at = dt.datetime.now(dt.UTC)
        sid = state.session_id
        self._last_save_at[sid] = time.monotonic()
        self._flush_pending(sid)
        self.persistence.save_snapshot(state)

    def _flush_pending(self, session_id: str) -> None:
        pending = self._pending_save_states.pop(session_id, None)
        if pending is not None:
            pending.updated_at = dt.datetime.now(dt.UTC)
            self.persistence.save_snapshot(pending)

    def load_session(self, session_id: str) -> SessionState:
        """Load a persisted session and run post-deserialization repairs.

        Args:
            session_id: The session identifier to load.

        Returns:
            The restored session state.
        """
        state = self.read_session_snapshot(session_id)
        self._repair_reasoning_content_on_load(session_id, state)
        return state

    def read_session_snapshot(self, session_id: str) -> SessionState:
        """Read persisted state without run-open repairs or filesystem writes.

        Live views and editors use this API because they need a consistent
        snapshot, not the reasoning-content repair required before an agent
        resumes execution.
        """
        return self.persistence.load_snapshot(session_id)

    def _repair_reasoning_content_on_load(self, session_id: str, state: SessionState) -> None:
        """Run post-deserialization repair for reasoning_content survival.

        This only fires when the orchestrator's model requires reasoning echo-back
        (e.g. DeepSeek V4 with thinking mode). It scans persisted event logs and
        patches missing ``reasoning_content`` fields with a sentinel placeholder.
        """
        import logging  # noqa: PLC0415

        _log = logging.getLogger(__name__)
        try:
            default_persona = state.config_snapshot.get("default_persona", "")
            personas = state.config_snapshot.get("personas", {})
            persona_cfg = personas.get(default_persona, {})
            model_name = persona_cfg.get("model") if isinstance(persona_cfg, dict) else None
            if not model_name:
                return
            from rotaris_core.session.state_repair import repair_reasoning_content  # noqa: PLC0415

            session_dir = self.session_dir(session_id)
            repair_reasoning_content(session_dir, str(model_name))
        except Exception:
            # Repair is a best-effort safety net; never let it break session load.
            _log.exception("Reasoning-content repair failed for session %s", session_id)

    def list_sessions(self, *, include_internal: bool = False) -> list[dict[str, Any]]:
        """List persisted user sessions, optionally including internal recovery sessions."""
        sessions = self.persistence.list_sessions()
        if include_internal:
            return sessions
        return [item for item in sessions if not bool(item.get("internal", False))]

    @traces(SWR.SWR_2437, SWR.SWR_2817)
    def is_session_live(self, session_id: str) -> bool:
        """Whether a process still owns *session_id*'s run.

        Thin delegation to :func:`rotaris_core.session.recovery.session_is_live`
        so callers asking "is this session's status still true?" have one answer
        and none of them has to reach into ``persistence`` internals.
        """
        from rotaris_core.session.recovery import session_is_live  # noqa: PLC0415

        return session_is_live(self, session_id)

    def acquire_lock(self, session_id: str) -> bool:
        """Acquire an exclusive filesystem lock for the given session.

        Returns:
            True if the lock was acquired, False otherwise.
        """
        return self.persistence.acquire_lock(session_id)

    def release_lock(self, session_id: str) -> None:
        """Release the session lock and tear down shared MCP connections."""
        self.shutdown_mcp()
        self.persistence.release_lock(session_id)
