"""Productive use: an installed Rotaris prepares only machine tools its user needs.
Expected outcome: probes and merged MCP configuration produce a pinned deterministic plan."""

from __future__ import annotations

import subprocess
from pathlib import Path
from types import SimpleNamespace

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.setup import (
    SetupManifest,
    SetupOutcome,
    SetupRecord,
    build_setup_plan,
    default_setup_manifest,
    derive_mcp_warmups,
    manifest_fingerprint,
    probe_tool,
)
from rotaris_core.setup.manifest import PLAYWRIGHT_MCP_VERSION
from rotaris_core.setup.models import ToolProbe


@verifies(SWR.SWR_3715, SWR.SWR_3723)
def test_release_manifest_carries_exact_tool_and_mcp_pins() -> None:
    """Productive use: a user can reproduce the exact toolchain another install received.
    Expected outcome: each archive has an HTTPS URL, literal digest, version, and license."""
    manifest = default_setup_manifest()

    assert [
        (tool.name, tool.minimum_version, tool.provisioned_version) for tool in manifest.tools
    ] == [
        ("git", "2.36.0", "2.55.0"),
        ("node", "20.0.0", "24.19.0"),
        ("ripgrep", "14.1.0", "15.2.0"),
    ]
    assert manifest.mcp_pins == {"@playwright/mcp": PLAYWRIGHT_MCP_VERSION}
    for tool in manifest.tools:
        assert tool.license
        for artifact in tool.artifacts.values():
            assert artifact.url.startswith("https://")
            assert len(artifact.sha256) == 64
            int(artifact.sha256, 16)


@verifies(SWR.SWR_3715, SWR.SWR_3723)
def test_default_mcp_configuration_derives_every_pinned_warmup() -> None:
    """Productive use: a bundled install warms every package its default agents can launch.
    Expected outcome: the setup plan follows the authoritative MCP configuration and shared pins."""
    from rotaris_core.config.defaults import DEFAULT_MCP_SERVERS

    assert [step.id for step in derive_mcp_warmups(DEFAULT_MCP_SERVERS)] == [
        "warm:npx:@playwright/mcp@0.0.75"
    ]


@verifies(SWR.SWR_3715)
@pytest.mark.parametrize(
    ("output", "satisfies"),
    [("git version 2.41.0.windows.1", True), ("git version 2.35.9", False), ("broken", False)],
)
def test_probe_accepts_only_a_satisfying_version(
    monkeypatch: pytest.MonkeyPatch, output: str, satisfies: bool
) -> None:
    """Productive use: an existing system tool is reused when it meets Rotaris' floor.
    Expected outcome: Git 2.41 is accepted and versions lacking required worktree output are rejected."""
    spec = next(tool for tool in default_setup_manifest().tools if tool.name == "git")
    monkeypatch.setattr(
        "rotaris_core.setup.planner.shutil.which", lambda *_args, **_kwargs: "/bin/git"
    )
    monkeypatch.setattr(
        "rotaris_core.setup.planner.subprocess.run",
        lambda *_args, **_kwargs: subprocess.CompletedProcess([], 0, output, ""),
    )

    assert probe_tool(spec).satisfies is satisfies


@verifies(SWR.SWR_3715)
def test_setup_plan_reuses_system_git_2_41_without_an_install_step(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a Windows user launches Rotaris with Git 2.41 already installed.
    Expected outcome: setup reports Git as installed and schedules no Git download."""
    git = next(tool for tool in default_setup_manifest().tools if tool.name == "git")
    manifest = SetupManifest(schema_version=1, tools=(git,), mcp_pins={})
    monkeypatch.setattr(
        "rotaris_core.setup.planner.shutil.which",
        lambda *_args, **_kwargs: r"C:\Program Files\Git\cmd\git.exe",
    )
    monkeypatch.setattr(
        "rotaris_core.setup.planner.subprocess.run",
        lambda *_args, **_kwargs: subprocess.CompletedProcess(
            [], 0, "git version 2.41.0.windows.1", ""
        ),
    )

    plan = build_setup_plan(manifest, mcp_servers={})

    assert [step.id for step in plan.steps] == ["detect", "satisfied:git", "record"]


@verifies(SWR.SWR_3715, SWR.SWR_3723)
def test_plan_orders_missing_tools_then_deduplicated_exact_warmups(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: first launch explains work in a stable, dependency-safe order.
    Expected outcome: Git, Node, ripgrep precede sorted exact cache warmups and recording."""
    monkeypatch.setattr(
        "rotaris_core.setup.planner.probe_tool",
        lambda spec, **_kwargs: ToolProbe(spec.name, None, None, False),
    )
    servers = {
        "serena": SimpleNamespace(
            type="stdio",
            command="uvx",
            args=["--from", "serena-agent==1.7.0", "serena", "start-mcp-server"],
        ),
        "playwright": SimpleNamespace(
            type="stdio", command="npx", args=["-y", "@playwright/mcp@0.0.75", "--headless"]
        ),
        "playwright-copy": SimpleNamespace(
            type="stdio", command="npx", args=["-y", "@playwright/mcp@0.0.75"]
        ),
        "remote": SimpleNamespace(type="http", command="npx", args=["@remote/server@1.0.0"]),
    }

    plan = build_setup_plan(default_setup_manifest(), mcp_servers=servers)

    assert [step.id for step in plan.steps] == [
        "detect",
        "install:git",
        "install:node",
        "install:ripgrep",
        "warm:npx:@playwright/mcp@0.0.75",
        "warm:uvx:serena-agent==1.7.0",
        "record",
    ]


@verifies(SWR.SWR_3715)
def test_matching_completion_and_remembered_degradation_are_fast_paths() -> None:
    """Productive use: later launches reach Rotaris without a perceptible setup check.
    Expected outcome: a matching complete or accepted-degraded fingerprint returns no steps."""
    manifest = default_setup_manifest()
    fingerprint = manifest_fingerprint(manifest)
    complete = SetupRecord(manifest_fingerprint=fingerprint, outcome=SetupOutcome.COMPLETE.value)
    degraded = SetupRecord(
        manifest_fingerprint=fingerprint,
        outcome=SetupOutcome.DEGRADED.value,
        accepted_degradation=True,
    )

    assert build_setup_plan(manifest, mcp_servers={}, record=complete).steps == ()
    assert build_setup_plan(manifest, mcp_servers={}, record=degraded).steps == ()


@verifies(SWR.SWR_3715)
def test_manifest_change_creates_a_top_up_plan(monkeypatch: pytest.MonkeyPatch) -> None:
    """Productive use: an upgrade adds only newly required machine work.
    Expected outcome: a changed fingerprint is labelled as a top-up and reuses satisfying tools."""
    manifest = default_setup_manifest()
    previous = SetupRecord(manifest_fingerprint="old", outcome="complete")
    monkeypatch.setattr(
        "rotaris_core.setup.planner.probe_tool",
        lambda spec, **_kwargs: ToolProbe(
            spec.name, Path(spec.command), spec.minimum_version, True
        ),
    )

    plan = build_setup_plan(manifest, mcp_servers={}, record=previous)

    assert plan.top_up is True
    assert [step.id for step in plan.steps] == [
        "detect",
        "satisfied:git",
        "satisfied:node",
        "satisfied:ripgrep",
        "record",
    ]
    assert all(step.version is not None for step in plan.steps[1:-1])


@verifies(SWR.SWR_3715)
def test_warmups_require_exact_package_specs() -> None:
    """Productive use: MCP cache contents stay reproducible across installations.
    Expected outcome: moving package references are excluded from automatic execution."""
    servers = {
        "moving": SimpleNamespace(type="stdio", command="npx", args=["-y", "@scope/pkg@latest"]),
        "unversioned": SimpleNamespace(type="stdio", command="uvx", args=["tool", "serve"]),
        "exact-unscoped": SimpleNamespace(
            type="stdio", command="npx", args=["-y", "model-server@1.2.3"]
        ),
    }

    assert [step.id for step in derive_mcp_warmups(servers)] == ["warm:npx:model-server@1.2.3"]
