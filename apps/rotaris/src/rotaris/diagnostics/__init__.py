"""Opt-in diagnostics for the Rotaris Qt application."""

from rotaris.diagnostics.live import (
    DiagnosticsConfig,
    LiveDiagnostics,
    NoopDiagnostics,
    resolve_diagnostics_config,
)

__all__ = [
    "DiagnosticsConfig",
    "LiveDiagnostics",
    "NoopDiagnostics",
    "resolve_diagnostics_config",
]
