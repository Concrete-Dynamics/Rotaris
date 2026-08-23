"""Tool probes and deterministic setup-plan construction."""

from __future__ import annotations

import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any

from packaging.version import InvalidVersion, Version

from rotaris_core.reqtocode import SWR, traces

from .manifest import manifest_fingerprint
from .models import (
    SetupManifest,
    SetupPlan,
    SetupRecord,
    SetupStep,
    SetupStepKind,
    ToolProbe,
    ToolSpec,
)

_VERSION = re.compile(r"(?<!\d)(\d+(?:\.\d+){1,3})(?!\d)")


def _read_version(output: str) -> str | None:
    match = _VERSION.search(output)
    return match.group(1) if match else None


def _meets(version: str | None, minimum: str) -> bool:
    if version is None:
        return False
    try:
        return Version(version) >= Version(minimum)
    except InvalidVersion:
        return False


@traces(SWR.SWR_3715)
def probe_tool(spec: ToolSpec, *, env: dict[str, str] | None = None) -> ToolProbe:
    executable = shutil.which(spec.command, path=(env or os.environ).get("PATH"))
    if executable is None:
        return ToolProbe(spec.name, None, None, False)
    try:
        result = subprocess.run(
            [executable, *spec.version_args],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
            env=env,
        )
    except (OSError, subprocess.SubprocessError):
        return ToolProbe(spec.name, Path(executable), None, False)
    version = _read_version(f"{result.stdout}\n{result.stderr}")
    return ToolProbe(
        spec.name,
        Path(executable),
        version,
        result.returncode == 0 and _meets(version, spec.minimum_version),
    )


def _package_spec(command: str, args: list[str] | tuple[str, ...]) -> str | None:
    if command == "uvx":
        try:
            index = list(args).index("--from")
            return str(args[index + 1])
        except (ValueError, IndexError):
            return next((str(arg) for arg in args if "==" in str(arg)), None)
    if command in {"npx", "npx.cmd"}:
        return next((str(arg) for arg in args if not str(arg).startswith("-")), None)
    return None


def _is_exact_package(package: str) -> bool:
    if "==" in package:
        version = package.rsplit("==", 1)[1]
    elif "@" in package.lstrip("@"):
        version = package.rsplit("@", 1)[1]
    else:
        return False
    try:
        Version(version)
    except InvalidVersion:
        return False
    return True


@traces(SWR.SWR_3715)
def derive_mcp_warmups(mcp_servers: dict[str, Any]) -> tuple[SetupStep, ...]:
    """Derive unique exact uvx/npx package warmups from merged MCP config."""
    found: dict[tuple[str, str], SetupStep] = {}
    for name in sorted(mcp_servers):
        server = mcp_servers[name]
        server_type = getattr(server, "type", "stdio")
        command = str(getattr(server, "command", "") or "")
        args = list(getattr(server, "args", ()) or ())
        if server_type in {"http", "sse"} or command not in {"uvx", "npx", "npx.cmd"}:
            continue
        package = _package_spec(command, args)
        if package is None or not _is_exact_package(package):
            continue
        family = "uvx" if command == "uvx" else "npx"
        if family == "uvx":
            try:
                marker = args.index("--from")
                executable = str(args[marker + 2])
            except (ValueError, IndexError):
                executable = package.split("==", 1)[0]
            warm_command = ("uvx", "--from", package, executable, "--help")
            kind = SetupStepKind.WARM_UVX
        else:
            warm_command = ("npx", "-y", package, "--help")
            kind = SetupStepKind.WARM_NPX
        found[(family, package)] = SetupStep(
            id=f"warm:{family}:{package}",
            label=f"Warm {package}",
            kind=kind,
            package=package,
            command=warm_command,
            capabilities=(f"{name} MCP server",),
        )
    return tuple(found[key] for key in sorted(found))


@traces(SWR.SWR_3715)
def build_setup_plan(
    manifest: SetupManifest,
    *,
    mcp_servers: dict[str, Any],
    record: SetupRecord | None = None,
    env: dict[str, str] | None = None,
    manual: bool = False,
) -> SetupPlan:
    """Probe the machine and return only work needed by this fingerprint."""
    fingerprint = manifest_fingerprint(manifest)
    if (
        not manual
        and record is not None
        and record.manifest_fingerprint == fingerprint
        and record.outcome in {"complete", "degraded"}
        and (record.outcome == "complete" or record.accepted_degradation)
    ):
        return SetupPlan(fingerprint, ())

    steps: list[SetupStep] = [SetupStep("detect", "Detect machine tools", SetupStepKind.DETECT)]
    for spec in manifest.tools:
        probe = probe_tool(spec, env=env)
        if probe.satisfies:
            steps.append(
                SetupStep(
                    id=f"satisfied:{spec.name}",
                    label=f"{spec.name} already installed",
                    kind=SetupStepKind.SATISFIED,
                    tool=spec.name,
                    version=probe.version,
                )
            )
            continue
        steps.append(
            SetupStep(
                id=f"install:{spec.name}",
                label=f"Provision {spec.name}",
                kind=SetupStepKind.INSTALL,
                tool=spec.name,
                capabilities=spec.capabilities,
            )
        )

    completed = (
        record.steps if record is not None and record.manifest_fingerprint == fingerprint else {}
    )
    for warmup in derive_mcp_warmups(mcp_servers):
        state = completed.get(warmup.id)
        if manual or state is None or state.status != "complete":
            steps.append(warmup)
    steps.append(SetupStep("record", "Record machine setup", SetupStepKind.RECORD))
    top_up = (
        record is not None
        and bool(record.manifest_fingerprint)
        and record.manifest_fingerprint != fingerprint
    )
    return SetupPlan(fingerprint, tuple(steps), top_up=top_up)
