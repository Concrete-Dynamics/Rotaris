"""Opt-in OS-level sandbox for terminal execution (SWR-2507).

Import-light on purpose (stdlib only): this sits on the terminal tool's hot
path, so it must not pull in :mod:`rotaris_core.config` or
:mod:`rotaris_core.tools` and, through them, the OpenHands SDK.
"""

from rotaris_core.sandbox.backends import (
    BubblewrapBackend,
    SandboxBackend,
    SeatbeltBackend,
    UnavailableBackend,
    build_bubblewrap_argv,
    build_seatbelt_profile,
    probe_sandbox,
    reset_sandbox_probe_cache,
    resolve_backend,
    run_sandbox_trial,
)
from rotaris_core.sandbox.spec import (
    SandboxAvailability,
    SandboxMode,
    SandboxSpec,
    SandboxUnavailableError,
)

__all__ = [
    "BubblewrapBackend",
    "SandboxAvailability",
    "SandboxBackend",
    "SandboxMode",
    "SandboxSpec",
    "SandboxUnavailableError",
    "SeatbeltBackend",
    "UnavailableBackend",
    "build_bubblewrap_argv",
    "build_seatbelt_profile",
    "probe_sandbox",
    "reset_sandbox_probe_cache",
    "resolve_backend",
    "run_sandbox_trial",
]
