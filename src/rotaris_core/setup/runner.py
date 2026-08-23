"""Shared setup runner used by desktop, CLI, and headless hosts."""

from __future__ import annotations

import os
import subprocess
import sys
import time
from collections.abc import Callable
from pathlib import Path
from urllib.parse import urlparse

from rotaris_core.config.paths import GLOBAL_DATA_DIR
from rotaris_core.reqtocode import SWR, traces

from .download import SetupSupplyError, download_archive, extract_and_promote
from .manifest import default_setup_manifest, platform_key
from .models import (
    SetupEvent,
    SetupEventKind,
    SetupManifest,
    SetupOutcome,
    SetupRecord,
    SetupStep,
    SetupStepKind,
    SetupStepState,
)
from .planner import build_setup_plan, probe_tool
from .state import SetupLock, load_setup_record, save_setup_record, utc_now

EventSink = Callable[[SetupEvent], None]
CancelCheck = Callable[[], bool]
CommandRunner = Callable[..., subprocess.CompletedProcess[str]]


def setup_paths(data_dir: Path = GLOBAL_DATA_DIR) -> tuple[Path, Path, Path, Path]:
    root = data_dir / "setup"
    return data_dir / "tools", root / "state.json", root / "cache", root / "setup.lock"


def _path_key() -> str:
    return "Path" if os.name == "nt" else "PATH"


@traces(SWR.SWR_3715)
def activate_managed_tool_environment(
    record: SetupRecord | None = None,
    *,
    data_dir: Path = GLOBAL_DATA_DIR,
    environ: dict[str, str] | None = None,
) -> dict[str, str]:
    """Activate verified managed tools and Rotaris-owned caches in one process."""
    target = os.environ if environ is None else environ
    _tools, state_path, cache, _lock = setup_paths(data_dir)
    active = record or load_setup_record(state_path)
    managed: list[str] = []
    if active is not None:
        for tool in sorted(active.managed_paths):
            for raw in active.managed_paths[tool]:
                path = Path(raw)
                if path.is_dir():
                    managed.append(str(path))
    key = _path_key()
    current = target.get(key, target.get("PATH", ""))
    if managed:
        target[key] = os.pathsep.join([*managed, current]) if current else os.pathsep.join(managed)
        if key != "PATH":
            target["PATH"] = target[key]
    uv_cache = cache / "uv"
    npm_cache = cache / "npm"
    uv_cache.mkdir(parents=True, exist_ok=True)
    npm_cache.mkdir(parents=True, exist_ok=True)
    target["UV_CACHE_DIR"] = str(uv_cache)
    target["npm_config_cache"] = str(npm_cache)
    return target


@traces(SWR.SWR_3715)
def setup_required(
    *,
    manifest: SetupManifest | None = None,
    data_dir: Path = GLOBAL_DATA_DIR,
    manual: bool = False,
) -> bool:
    if manual:
        return True
    from .manifest import manifest_fingerprint

    _tools, state_path, _cache, _lock = setup_paths(data_dir)
    record = load_setup_record(state_path)
    if record is None or record.manifest_fingerprint != manifest_fingerprint(
        manifest or default_setup_manifest()
    ):
        return True
    return record.outcome not in {"complete", "degraded"} or (
        record.outcome == "degraded" and not record.accepted_degradation
    )


@traces(SWR.SWR_3715)
def accept_degraded_setup(*, data_dir: Path = GLOBAL_DATA_DIR) -> None:
    _tools, state_path, _cache, _lock = setup_paths(data_dir)
    record = load_setup_record(state_path)
    if record is None:
        return
    record.outcome = "degraded"
    record.accepted_degradation = True
    record.completed_at = record.completed_at or utc_now()
    save_setup_record(state_path, record)


def _install(
    step: SetupStep,
    manifest: SetupManifest,
    record: SetupRecord,
    *,
    data_dir: Path,
    emit: EventSink,
) -> str:
    spec = next(item for item in manifest.tools if item.name == step.tool)
    key = platform_key()
    artifact = spec.artifacts.get(key)
    if artifact is None:
        raise SetupSupplyError(
            f"{spec.name} {spec.provisioned_version} has no pinned {key} artifact in this release"
        )
    tools, _state, cache, _lock = setup_paths(data_dir)
    filename = Path(urlparse(artifact.url).path).name
    archive = cache / "downloads" / filename
    emit(SetupEvent(SetupEventKind.DETAIL, step.id, f"Downloading {artifact.url}"))
    download_archive(artifact, archive)
    destination = tools / spec.name / spec.provisioned_version
    executables = extract_and_promote(archive, artifact, spec, destination)
    bin_dirs = [str(destination / item) for item in spec.binary_dirs]
    record.managed_paths[spec.name] = bin_dirs
    record.actual_versions[spec.name] = spec.provisioned_version
    activate_managed_tool_environment(record, data_dir=data_dir)
    return "Installed " + ", ".join(str(path) for path in executables)


def _run_warmup(
    step: SetupStep,
    *,
    command_runner: CommandRunner,
    emit: EventSink,
) -> str:
    rendered = subprocess.list2cmdline(list(step.command))
    emit(SetupEvent(SetupEventKind.DETAIL, step.id, rendered))
    try:
        result = command_runner(
            list(step.command),
            capture_output=True,
            text=True,
            timeout=180,
            check=False,
            env=os.environ.copy(),
        )
    except (OSError, subprocess.SubprocessError) as exc:
        raise SetupSupplyError(f"command {rendered} failed: {exc}") from exc
    detail = "\n".join(part.strip() for part in (result.stdout, result.stderr) if part.strip())
    if detail:
        emit(SetupEvent(SetupEventKind.DETAIL, step.id, detail))
    if result.returncode != 0:
        raise SetupSupplyError(
            f"command {rendered} exited {result.returncode}: {detail or 'no detail output'}"
        )
    return f"Cached {step.package}"


def _completed_versions(manifest: SetupManifest) -> dict[str, str]:
    versions: dict[str, str] = {}
    for spec in manifest.tools:
        probe = probe_tool(spec)
        if probe.satisfies and probe.version is not None:
            versions[spec.name] = probe.version
    return versions


@traces(SWR.SWR_3715)
def run_setup(
    *,
    manifest: SetupManifest | None = None,
    mcp_servers: dict[str, object] | None = None,
    data_dir: Path = GLOBAL_DATA_DIR,
    emit: EventSink | None = None,
    cancelled: CancelCheck | None = None,
    manual: bool = False,
    continue_on_failure: bool = False,
    command_runner: CommandRunner = subprocess.run,
) -> SetupOutcome:
    """Execute the shared plan, persisting completion at each boundary."""
    supply = manifest or default_setup_manifest()
    sink = emit or (lambda _event: None)
    is_cancelled = cancelled or (lambda: False)
    _tools, state_path, _cache, lock_path = setup_paths(data_dir)
    lock = SetupLock(lock_path)
    if not lock.acquire():
        sink(SetupEvent(SetupEventKind.COMPLETE, "lock", "Machine setup is already running"))
        activate_managed_tool_environment(data_dir=data_dir)
        return SetupOutcome.ALREADY_RUNNING
    try:
        record = load_setup_record(state_path) or SetupRecord(started_at=utc_now())
        activate_managed_tool_environment(record, data_dir=data_dir)
        servers = mcp_servers
        if servers is None:
            from rotaris_core.config.defaults import DEFAULT_MCP_SERVERS

            servers = DEFAULT_MCP_SERVERS
        plan = build_setup_plan(
            supply,
            mcp_servers=servers,
            record=record,
            env=os.environ.copy(),
            manual=manual,
        )
        if not plan.steps:
            return SetupOutcome.DEGRADED if record.outcome == "degraded" else SetupOutcome.COMPLETE
        record.manifest_fingerprint = plan.manifest_fingerprint
        record.outcome = "running"
        record.accepted_degradation = False
        record.degraded_capabilities = []
        save_setup_record(state_path, record)
        total = len(plan.steps)
        completed = 0
        for step in plan.steps:
            previous = record.steps.get(step.id)
            if (
                previous is not None
                and previous.status == "complete"
                and step.kind
                not in {
                    SetupStepKind.DETECT,
                    SetupStepKind.RECORD,
                }
            ):
                completed += 1
                continue
            if is_cancelled():
                record.outcome = "cancelled"
                save_setup_record(state_path, record)
                sink(
                    SetupEvent(
                        SetupEventKind.CANCELLED, step.id, "Setup cancelled", completed, total
                    )
                )
                return SetupOutcome.CANCELLED
            started = time.monotonic()
            sink(SetupEvent(SetupEventKind.PROGRESS, step.id, step.label, completed, total))
            try:
                if step.kind == SetupStepKind.DETECT:
                    detail = "Checked system and managed tool paths"
                elif step.kind == SetupStepKind.SATISFIED:
                    if step.tool is not None and step.version is not None:
                        record.actual_versions[step.tool] = step.version
                    detail = f"{step.tool} {step.version or 'unknown'} already installed"
                elif step.kind == SetupStepKind.INSTALL:
                    detail = _install(step, supply, record, data_dir=data_dir, emit=sink)
                elif step.kind in {SetupStepKind.WARM_UVX, SetupStepKind.WARM_NPX}:
                    detail = _run_warmup(step, command_runner=command_runner, emit=sink)
                else:
                    record.actual_versions.update(_completed_versions(supply))
                    detail = "Saved verified machine-tool versions"
            except Exception as exc:
                elapsed = time.monotonic() - started
                detail = str(exc)
                record.steps[step.id] = SetupStepState("failed", elapsed, detail)
                record.degraded_capabilities = sorted(
                    set(record.degraded_capabilities).union(step.capabilities)
                )
                record.outcome = "degraded"
                record.accepted_degradation = continue_on_failure
                record.completed_at = utc_now()
                save_setup_record(state_path, record)
                sink(
                    SetupEvent(
                        SetupEventKind.FAILURE,
                        step.id,
                        f"{step.label} failed",
                        completed,
                        total,
                        elapsed,
                        detail,
                    )
                )
                return SetupOutcome.DEGRADED
            elapsed = time.monotonic() - started
            record.steps[step.id] = SetupStepState("complete", elapsed, detail)
            completed += 1
            save_setup_record(state_path, record)
            sink(
                SetupEvent(
                    SetupEventKind.COMPLETE,
                    step.id,
                    detail,
                    completed,
                    total,
                    elapsed,
                )
            )
        record.outcome = "complete"
        record.completed_at = utc_now()
        record.accepted_degradation = False
        save_setup_record(state_path, record)
        sink(SetupEvent(SetupEventKind.COMPLETE, "setup", "Machine setup complete", total, total))
        return SetupOutcome.COMPLETE
    finally:
        lock.release()


@traces(SWR.SWR_3715)
def is_bundled_runtime() -> bool:
    return bool(getattr(sys, "frozen", False) or os.environ.get("ROTARIS_BUNDLED") == "1")


@traces(SWR.SWR_3715)
def ensure_bundled_setup(*, stream: object = sys.stderr) -> SetupOutcome:
    """Automatic bundled-host check with diagnostics on the supplied stream."""
    if not is_bundled_runtime():
        activate_managed_tool_environment()
        return SetupOutcome.COMPLETE

    def write(event: SetupEvent) -> None:
        if event.kind in {SetupEventKind.PROGRESS, SetupEventKind.FAILURE}:
            print(f"setup: {event.message}", file=stream)
        if event.detail:
            print(f"setup: {event.detail}", file=stream)

    return run_setup(emit=write, continue_on_failure=True)
