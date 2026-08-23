"""Public machine-setup API shared by every Rotaris host."""

from .manifest import default_setup_manifest, manifest_fingerprint, platform_key
from .models import (
    PlatformArtifact,
    SetupEvent,
    SetupEventKind,
    SetupManifest,
    SetupOutcome,
    SetupPlan,
    SetupRecord,
    SetupStep,
    SetupStepKind,
    ToolProbe,
    ToolSpec,
)
from .planner import build_setup_plan, derive_mcp_warmups, probe_tool
from .runner import (
    accept_degraded_setup,
    activate_managed_tool_environment,
    ensure_bundled_setup,
    is_bundled_runtime,
    run_setup,
    setup_required,
)
from .state import load_setup_record, save_setup_record

__all__ = [
    "PlatformArtifact",
    "SetupEvent",
    "SetupEventKind",
    "SetupManifest",
    "SetupOutcome",
    "SetupPlan",
    "SetupRecord",
    "SetupStep",
    "SetupStepKind",
    "ToolProbe",
    "ToolSpec",
    "accept_degraded_setup",
    "activate_managed_tool_environment",
    "build_setup_plan",
    "default_setup_manifest",
    "derive_mcp_warmups",
    "ensure_bundled_setup",
    "is_bundled_runtime",
    "load_setup_record",
    "manifest_fingerprint",
    "platform_key",
    "probe_tool",
    "run_setup",
    "save_setup_record",
    "setup_required",
]
