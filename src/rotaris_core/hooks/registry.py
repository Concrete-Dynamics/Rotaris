"""Session-keyed registry for the hook runner (SWR-2702, SWR-2703).

The runner binds late, for the same reason event sinks (SWR-1828), approval
hosts (SWR-2504) and audit sessions (SWR-2506) do: the places that fire hooks —
an agent's tool-dispatch gate and the iteration observer — are constructed in
several spawn paths, some of them before the run bootstrap has loaded a config
or picked a session directory.  Threading a runner through every constructor
would mean touching each of those paths; looking one up by session id at fire
time does not.

The registry shape is deliberately identical to ``rotaris_core.events.bus``: one
module-level dict behind an ``RLock``, with register / resolve / discard / reset.

A session nobody registered is a **silent no-op**: :func:`resolve_hook_runner`
returns ``None`` and the caller skips hooks entirely.  That is what keeps the
desktop app, the existing test suite and any run without hooks configured from
paying for this feature at all.
"""

from __future__ import annotations

from threading import RLock
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from rotaris_core.hooks.runner import HookRunner

__all__ = [
    "discard_hook_runner",
    "register_hook_runner",
    "reset_hook_registry",
    "resolve_hook_runner",
]

_runners_lock = RLock()
_runners: dict[str, HookRunner] = {}


@traces(SWR.SWR_2702)
def register_hook_runner(session_id: str, runner: HookRunner) -> None:
    """Publish which runner fires one session's hooks; replaces any previous one."""
    if not session_id:
        raise ValueError("A hook runner needs a non-empty session id.")
    with _runners_lock:
        _runners[session_id] = runner


@traces(SWR.SWR_2702)
def resolve_hook_runner(session_id: str | None) -> HookRunner | None:
    """Return the runner registered for *session_id*, or ``None``.

    Never falls back to another session's runner: one workspace's hooks must
    not fire on another workspace's tool calls.
    """
    if not session_id:
        return None
    with _runners_lock:
        return _runners.get(session_id)


@traces(SWR.SWR_2702)
def discard_hook_runner(session_id: str | None) -> None:
    """Stop firing hooks for *session_id* once its run is over."""
    if not session_id:
        return
    with _runners_lock:
        _runners.pop(session_id, None)


@traces(SWR.SWR_2703)
def reset_hook_registry() -> None:
    """Clear every registration (test isolation and full-process shutdown)."""
    with _runners_lock:
        _runners.clear()
