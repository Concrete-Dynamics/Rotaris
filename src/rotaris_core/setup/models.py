"""Stable value objects shared by every machine-setup surface."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import StrEnum
from typing import TYPE_CHECKING, Any

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from pathlib import Path


@traces(SWR.SWR_3715)
@dataclass(frozen=True, slots=True)
class PlatformArtifact:
    """One immutable archive suitable for a supported release platform."""

    url: str
    sha256: str
    archive: str
    executable_paths: tuple[str, ...]
    strip_components: int = 1


@traces(SWR.SWR_3715)
@dataclass(frozen=True, slots=True)
class ToolSpec:
    """The version contract and supply metadata for one external tool."""

    name: str
    command: str
    version_args: tuple[str, ...]
    minimum_version: str
    provisioned_version: str
    artifacts: dict[str, PlatformArtifact]
    binary_dirs: tuple[str, ...]
    license: str
    capabilities: tuple[str, ...]


@traces(SWR.SWR_3715)
@dataclass(frozen=True, slots=True)
class SetupManifest:
    """Complete pinned machine-tool contract carried by a Rotaris release."""

    schema_version: int
    tools: tuple[ToolSpec, ...]
    mcp_pins: dict[str, str]


class SetupStepKind(StrEnum):
    DETECT = "detect"
    SATISFIED = "satisfied"
    INSTALL = "install"
    WARM_UVX = "warm-uvx"
    WARM_NPX = "warm-npx"
    RECORD = "record"


@traces(SWR.SWR_3715)
@dataclass(frozen=True, slots=True)
class SetupStep:
    """One deterministic, resumable unit of setup work."""

    id: str
    label: str
    kind: SetupStepKind
    tool: str | None = None
    package: str | None = None
    command: tuple[str, ...] = ()
    capabilities: tuple[str, ...] = ()
    version: str | None = None


@traces(SWR.SWR_3715)
@dataclass(frozen=True, slots=True)
class SetupPlan:
    """Ordered work and the fingerprint that made it necessary."""

    manifest_fingerprint: str
    steps: tuple[SetupStep, ...]
    top_up: bool = False


class SetupEventKind(StrEnum):
    PROGRESS = "progress"
    DETAIL = "detail"
    COMPLETE = "complete"
    CANCELLED = "cancelled"
    FAILURE = "failure"


@traces(SWR.SWR_3715)
@dataclass(frozen=True, slots=True)
class SetupEvent:
    """A UI-neutral progress message emitted by the runner."""

    kind: SetupEventKind
    step_id: str
    message: str
    completed: int = 0
    total: int = 0
    elapsed_seconds: float = 0.0
    detail: str = ""


class SetupOutcome(StrEnum):
    COMPLETE = "complete"
    DEGRADED = "degraded"
    CANCELLED = "cancelled"
    ALREADY_RUNNING = "already-running"


@traces(SWR.SWR_3715)
@dataclass(slots=True)
class SetupStepState:
    status: str
    elapsed_seconds: float = 0.0
    detail: str = ""


@traces(SWR.SWR_3715)
@dataclass(slots=True)
class SetupRecord:
    """Atomic completion and resume record stored under the global data dir."""

    schema_version: int = 1
    manifest_fingerprint: str = ""
    outcome: str = ""
    actual_versions: dict[str, str] = field(default_factory=dict)
    managed_paths: dict[str, list[str]] = field(default_factory=dict)
    steps: dict[str, SetupStepState] = field(default_factory=dict)
    degraded_capabilities: list[str] = field(default_factory=list)
    accepted_degradation: bool = False
    started_at: str = ""
    updated_at: str = ""
    completed_at: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> SetupRecord:
        raw_steps = payload.get("steps", {})
        steps = {
            str(key): SetupStepState(**value)
            for key, value in raw_steps.items()
            if isinstance(value, dict)
        }
        fields = {
            key: value
            for key, value in payload.items()
            if key in cls.__dataclass_fields__ and key != "steps"
        }
        return cls(**fields, steps=steps)


@traces(SWR.SWR_3715)
@dataclass(frozen=True, slots=True)
class ToolProbe:
    name: str
    path: Path | None
    version: str | None
    satisfies: bool
    managed: bool = False
