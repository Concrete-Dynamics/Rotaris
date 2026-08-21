#!/usr/bin/env python3
"""Rotaris: CLI-native agentic orchestration framework."""

from __future__ import annotations

import os
from importlib.metadata import PackageNotFoundError
from importlib.metadata import version as _distribution_version
from typing import TYPE_CHECKING, Any

# Suppress OpenHands SDK console banner — set once before any SDK module loads.
os.environ.setdefault("OPENHANDS_SUPPRESS_BANNER", "1")


def _read_version() -> str:
    """The installed distribution's version — the single source of truth.

    ``rotaris-cli version`` prints this, so a literal here drifts away from
    ``pyproject.toml`` silently and tells users the wrong version (it had, by
    more than twenty minor releases). Reading the installed metadata cannot
    drift. The fallback covers running from a source tree that was never
    installed, where there is no metadata to read and no released version to
    name.
    """
    try:
        return _distribution_version("rotaris-core")
    except PackageNotFoundError:  # pragma: no cover - requires an uninstalled tree
        return "0+unknown"


__version__ = _read_version()

__all__ = [
    "ChildManager",
    "RotarisConfig",
    "RotarisDelegateTool",
    "HAETEngine",
    "RalphLoop",
    "Scheduler",
    "SessionManager",
    "TokenSnapshot",
    "__version__",
]

if TYPE_CHECKING:
    from rotaris_core.config.schema import RotarisConfig
    from rotaris_core.haet.engine import HAETEngine
    from rotaris_core.orchestrator import ChildManager, RotarisDelegateTool, Scheduler
    from rotaris_core.ralph import RalphLoop
    from rotaris_core.session import SessionManager
    from rotaris_core.tokens import TokenSnapshot


class _ModuleAttributeError(AttributeError):
    """Raised by __getattr__ when an unknown module attribute is accessed."""

    def __init__(self, module_name: str, attr_name: str) -> None:
        super().__init__(f"module {module_name!r} has no attribute {attr_name!r}")


def __getattr__(name: str) -> Any:
    if name == "RotarisConfig":
        from rotaris_core.config.schema import RotarisConfig

        return RotarisConfig
    if name == "HAETEngine":
        from rotaris_core.haet.engine import HAETEngine

        return HAETEngine
    if name == "Scheduler":
        from rotaris_core.orchestrator import Scheduler

        return Scheduler
    if name == "ChildManager":
        from rotaris_core.orchestrator import ChildManager

        return ChildManager
    if name == "RotarisDelegateTool":
        from rotaris_core.orchestrator import RotarisDelegateTool

        return RotarisDelegateTool
    if name == "RalphLoop":
        from rotaris_core.ralph import RalphLoop

        return RalphLoop
    if name == "SessionManager":
        from rotaris_core.session import SessionManager

        return SessionManager
    if name == "TokenSnapshot":
        from rotaris_core.tokens import TokenSnapshot

        return TokenSnapshot
    raise _ModuleAttributeError(__name__, name)
