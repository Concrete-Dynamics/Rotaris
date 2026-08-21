"""Process-global lookup from an agent's binding key to its policy engine (SWR-2501).

The agent spec is serialised into ``ConversationState``, so a live engine cannot
travel as an agent field — only a JSON-safe key can.  This mirrors the
``RuntimeToolBinding`` registry in ``agents/tool_registration.py`` with one
deliberate difference: resolution here is **strict**.  ``resolve_runtime_binding``
falls back to the most recently registered binding when a key is unknown, which
for permissions would mean silently applying another persona's policy — a
security defect rather than a graceful degradation.  An unknown key resolves to
the shared fail-safe default engine instead.
"""

from __future__ import annotations

import logging
from pathlib import Path
from threading import RLock

from rotaris_core.permissions.engine import (
    ALLOW_ALL_POLICY,
    PermissionEngine,
)
from rotaris_core.reqtocode import SWR, traces

_log = logging.getLogger(__name__)

_lock = RLock()
_engines: dict[str, PermissionEngine] = {}
_default_engine: PermissionEngine | None = None


@traces(SWR.SWR_2501)
def default_permission_engine() -> PermissionEngine:
    """The engine used when no key was registered for the calling agent.

    Carries the permissive :data:`ALLOW_ALL_POLICY` so a wiring gap cannot
    silently break runs; the restrictive presets arrive with SWR-2503.  Its
    ``ask`` path still resolves fail-safe to deny.
    """
    global _default_engine  # noqa: PLW0603

    with _lock:
        if _default_engine is None:
            from rotaris_core.core.path_auth import PathAuth

            _default_engine = PermissionEngine(
                policy=ALLOW_ALL_POLICY,
                path_auth=PathAuth(Path.cwd(), allow_outside=True),
                persona="__default__",
            )
        return _default_engine


@traces(SWR.SWR_2501)
def register_permission_engine(key: str, engine: PermissionEngine) -> None:
    """Publish one agent's policy engine under its binding key."""
    with _lock:
        _engines[key] = engine


@traces(SWR.SWR_2501)
def resolve_permission_engine(key: str | None) -> PermissionEngine:
    """Return the engine registered for *key*, or the fail-safe default.

    Never falls back to another agent's engine.
    """
    if key is not None:
        with _lock:
            engine = _engines.get(key)
        if engine is not None:
            return engine
        _log.warning(
            "No permission engine registered for binding key %r; using the default engine.",
            key,
        )
    return default_permission_engine()


@traces(SWR.SWR_2503)
def engines_for_session(session_id: str | None) -> dict[str, PermissionEngine]:
    """Every engine registered under *session_id*'s binding keys.

    ``build_binding_key`` prefixes a key with ``"{session_id}/"`` whenever the
    spawn path knows its session, which covers the entry agent and every child
    of a run.  That prefix is the only handle a mid-session mode change
    (SWR-2503) has on the live engines of one run — and, being a prefix match,
    it cannot reach into another session's engines.
    """
    if not session_id:
        return {}
    prefix = f"{session_id}/"
    with _lock:
        return {key: engine for key, engine in _engines.items() if key.startswith(prefix)}


@traces(SWR.SWR_2501)
def discard_permission_engine(key: str | None) -> None:
    """Drop an agent's engine once it is done, so long runs do not accumulate them."""
    if key is None:
        return
    with _lock:
        _engines.pop(key, None)


@traces(SWR.SWR_2501)
def reset_permission_registry() -> None:
    """Clear every registration, including the cached default engine."""
    global _default_engine  # noqa: PLW0603

    with _lock:
        _engines.clear()
        _default_engine = None
