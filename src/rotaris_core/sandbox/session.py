"""Bind a session's configuration to an OS-level sandbox (SWR-2507).

:mod:`rotaris_core.sandbox.spec` and :mod:`rotaris_core.sandbox.backends` are
deliberately config-agnostic; this module is the one place that reads
``runtime.sandbox_*`` and turns it into the :class:`SandboxSpec` the terminal
tool enforces, plus the availability verdict every surface reports.

Config is typed loosely (``Any``) on purpose: importing
:mod:`rotaris_core.config` here would drag the OpenHands SDK (~12s of import)
onto the terminal tool's hot path, and this module has to stay stdlib-cheap.

The central rule of SWR-2507 lives in :func:`ensure_sandbox_available`: a
requested sandbox that cannot run is an error, never a quiet downgrade to the
host shell.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.sandbox.backends import probe_sandbox, resolve_backend
from rotaris_core.sandbox.spec import (
    SandboxMode,
    SandboxSpec,
    SandboxUnavailableError,
)

if TYPE_CHECKING:
    from pathlib import Path

    from rotaris_core.sandbox.backends import SandboxBackend

__all__ = [
    "ensure_sandbox_available",
    "resolve_sandbox_spec",
    "sandbox_mode_of",
    "sandbox_status",
]


@traces(SWR.SWR_2507)
def sandbox_mode_of(config: Any) -> SandboxMode:
    """The :class:`SandboxMode` *config* asks for.

    Raises :class:`ValueError` on an unrecognized name rather than assuming
    ``off``: ``RuntimePolicy`` already rejects those at load and assignment
    time, so a value arriving here that this cannot read means the config was
    built by some path that skipped validation — and guessing "no sandbox" for
    a session that asked for one is exactly the silent fallback SWR-2507 bans.
    """
    runtime = getattr(config, "runtime", None)
    raw = getattr(runtime, "sandbox_mode", None)
    if raw is None:
        return SandboxMode.OFF
    return SandboxMode(str(raw).strip().lower())


@traces(SWR.SWR_2507)
def resolve_sandbox_spec(config: Any, workspace_root: Path | str) -> SandboxSpec | None:
    """Build the sandbox spec for *config*, or ``None`` when sandboxing is off.

    *workspace_root* is the directory the session actually runs in — the SWR-2404
    worktree when isolation is on, the workspace itself otherwise — so the
    writable root always matches where the agent's files live.

    ``None`` (rather than a :attr:`SandboxMode.OFF` spec) is the "no sandbox
    requested" answer, so every caller has one falsy thing to test.
    """
    mode = sandbox_mode_of(config)
    if mode is SandboxMode.OFF:
        return None
    runtime = getattr(config, "runtime", None)
    return SandboxSpec.for_workspace(
        workspace_root,
        mode=mode,
        writable_roots=tuple(getattr(runtime, "sandbox_writable_roots", None) or ()),
        allow_network=bool(getattr(runtime, "sandbox_allow_network", False)),
    )


@traces(SWR.SWR_2507)
def ensure_sandbox_available(
    spec: SandboxSpec,
    *,
    backend: SandboxBackend | None = None,
) -> SandboxBackend:
    """Return the backend that will run *spec*, or refuse to run at all.

    Raises :class:`SandboxUnavailableError` — carrying the backend's own reason
    and remediation — when the host cannot provide the sandbox the session asked
    for.  It never returns a passthrough backend, because a caller that got a
    backend back must be able to assume the next command really is sandboxed.

    *backend* is injectable so the whole matrix is exercisable from a host that
    has no sandbox of its own (native Windows).
    """
    resolved = resolve_backend() if backend is None else backend
    if spec.mode is SandboxMode.OFF:
        # Not an error path: nothing was asked for, so there is nothing to fall
        # back *from*.  Every backend passes ``off`` through unchanged.
        return resolved
    availability = resolved.probe()
    if not availability.available:
        raise SandboxUnavailableError(availability)
    return resolved


@traces(SWR.SWR_2507, SWR.SWR_2508)
def sandbox_status(config: Any) -> tuple[bool, str]:
    """``(active, backend name)`` for *config* on this host.

    "Active" means *configured and available*, never merely configured.  The
    SWR-2508 downgrade of an unattended autonomous run is lifted by exactly this
    verdict, and lifting it for a sandbox that cannot start would leave the run
    unrestricted on the host — the one combination SWR-2508 exists to prevent.

    The backend name is empty when the sandbox is not active, so a session
    snapshot never claims a mechanism that did not run.
    """
    if sandbox_mode_of(config) is SandboxMode.OFF:
        return (False, "")
    availability = probe_sandbox()
    if not availability.available:
        return (False, "")
    return (True, availability.backend)
