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
from rotaris_core.subprocess_utils import hidden_process_kwargs, prepare_child_command


@verifies(SWR.SWR_3715, SWR.SWR_3724)
def test_release_manifest_carries_exact_tool_and_mcp_pins() -> None:
    """Productive use: a user can reproduce the exact toolchain another install received.
    Expected outcome: each archive has an HTTPS URL, literal digest, version, and license."""
    manifest = default_setup_manifest()

    assert [
        (tool.name, tool.minimum_version, tool.provisioned_version) for tool in manifest.tools
    ] == [
        ("git", None, "2.55.0"),
        ("ripgrep", "14.1.0", "15.2.0"),
    ]
    assert manifest.mcp_pins == {"@playwright/mcp": PLAYWRIGHT_MCP_VERSION}
    for tool in manifest.tools:
        assert tool.license
        for artifact in tool.artifacts.values():
            assert artifact.url.startswith("https://")
            assert len(artifact.sha256) == 64
            int(artifact.sha256, 16)


@verifies(SWR.SWR_3715, SWR.SWR_3724)
def test_default_mcp_configuration_derives_every_pinned_warmup() -> None:
    """Productive use: a bundled install warms every package its default agents can launch.
    Expected outcome: the setup plan follows the authoritative MCP configuration and shared pins."""
    from rotaris_core.config.defaults import DEFAULT_MCP_SERVERS

    assert [step.id for step in derive_mcp_warmups(DEFAULT_MCP_SERVERS)] == [
        "warm:npx:@playwright/mcp@0.0.75"
    ]


@verifies(SWR.SWR_3715)
def test_default_playwright_is_available_only_when_npx_is_installed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a user without Node.js opens Rotaris after a bundled install.
    Expected outcome: Playwright is withheld until the user's Node installation supplies npx."""
    from rotaris_core.config.defaults import DEFAULT_MCP_SERVERS
    from rotaris_core.config.mcp_resolution import mcp_server_is_available

    monkeypatch.setattr("rotaris_core.config.mcp_resolution.shutil.which", lambda _command: None)
    assert mcp_server_is_available("playwright", DEFAULT_MCP_SERVERS["playwright"]) is False

    monkeypatch.setattr(
        "rotaris_core.config.mcp_resolution.shutil.which",
        lambda command: "/usr/bin/npx" if command == "npx" else None,
    )
    assert mcp_server_is_available("playwright", DEFAULT_MCP_SERVERS["playwright"]) is True


@verifies(SWR.SWR_3715)
@pytest.mark.parametrize(
    ("output", "returncode", "satisfies"),
    [
        ("git version 2.41.0.windows.1", 0, True),
        ("git version 1.0.0", 0, True),
        ("unparseable", 0, True),
        ("git version 2.55.0", 1, False),
    ],
)
def test_probe_accepts_any_working_installed_git(
    monkeypatch: pytest.MonkeyPatch, output: str, returncode: int, satisfies: bool
) -> None:
    """Productive use: a user keeps the working Git already installed on the machine.
    Expected outcome: every successful Git probe is accepted, independent of reported version."""
    spec = next(tool for tool in default_setup_manifest().tools if tool.name == "git")
    monkeypatch.setattr(
        "rotaris_core.setup.planner.shutil.which", lambda *_args, **_kwargs: "/bin/git"
    )
    monkeypatch.setattr(
        "rotaris_core.setup.planner.subprocess.run",
        lambda *_args, **_kwargs: subprocess.CompletedProcess([], returncode, output, ""),
    )

    assert probe_tool(spec).satisfies is satisfies


@verifies(SWR.SWR_3715)
def test_setup_plan_reuses_an_older_system_git_without_an_install_step(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a Windows user launches Rotaris with an older Git already installed.
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
            [], 0, "git version 1.0.0.windows.1", ""
        ),
    )

    plan = build_setup_plan(manifest, mcp_servers={})

    assert [step.id for step in plan.steps] == ["detect", "satisfied:git", "record"]


@verifies(SWR.SWR_3715, SWR.SWR_3724)
def test_plan_orders_missing_tools_then_deduplicated_exact_warmups(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: first launch explains work in a stable, dependency-safe order.
    Expected outcome: Git and ripgrep precede sorted exact cache warmups and recording."""
    monkeypatch.setattr(
        "rotaris_core.setup.planner.probe_tool",
        lambda spec, **_kwargs: ToolProbe(spec.name, None, None, False),
    )
    monkeypatch.setattr(
        "rotaris_core.setup.planner.shutil.which",
        lambda command, **_kwargs: "/usr/bin/npx" if command == "npx" else None,
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
        "install:ripgrep",
        "warm:npx:@playwright/mcp@0.0.75",
        "warm:uvx:serena-agent==1.7.0",
        "record",
    ]


@verifies(SWR.SWR_3715)
def test_plan_skips_node_and_playwright_warmup_without_system_npx(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a user installs Rotaris without Node.js.
    Expected outcome: setup reaches the app without downloading Node or Playwright."""
    monkeypatch.setattr(
        "rotaris_core.setup.planner.probe_tool",
        lambda spec, **_kwargs: ToolProbe(spec.name, None, None, False),
    )
    monkeypatch.setattr("rotaris_core.setup.planner.shutil.which", lambda *_args, **_kwargs: None)
    servers = {
        "playwright": SimpleNamespace(
            type="stdio", command="npx", args=["-y", "@playwright/mcp@0.0.75", "--headless"]
        )
    }

    plan = build_setup_plan(default_setup_manifest(), mcp_servers=servers)

    assert [step.id for step in plan.steps] == [
        "detect",
        "install:git",
        "install:ripgrep",
        "record",
    ]


@verifies(SWR.SWR_3715)
def test_plan_launches_the_discovered_windows_npx_command(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a Windows user warms Playwright with their Node.js installation.
    Expected outcome: setup launches the discovered npx.CMD executable successfully."""
    npx = r"C:\Program Files\nodejs\npx.CMD"
    monkeypatch.setattr(
        "rotaris_core.setup.planner.shutil.which",
        lambda command, **_kwargs: npx if command == "npx" else None,
    )
    servers = {
        "playwright": SimpleNamespace(
            type="stdio", command="npx", args=["-y", "@playwright/mcp@0.0.75", "--headless"]
        )
    }

    plan = build_setup_plan(SetupManifest(1, (), {}), mcp_servers=servers)

    warmup = next(step for step in plan.steps if step.id.startswith("warm:npx:"))
    assert warmup.command == (npx, "-y", "@playwright/mcp@0.0.75", "--help")


@verifies(SWR.SWR_3727)
def test_windows_children_are_hidden_and_batch_launchers_use_comspec() -> None:
    """Productive use: a Windows user launches Rotaris without flashing command windows.
    Expected outcome: native tools and npx.cmd receive quiet, executable launch contracts."""
    native, native_options = prepare_child_command(
        [r"C:\Program Files\Git\cmd\git.exe", "--version"],
        platform="win32",
        environ={"COMSPEC": r"C:\Windows\System32\cmd.exe"},
    )
    batch, batch_options = prepare_child_command(
        [r"C:\Program Files\nodejs\npx.cmd", "-y", "@playwright/mcp@0.0.75", "--help"],
        platform="win32",
        environ={"COMSPEC": r"C:\Windows\System32\cmd.exe"},
    )

    assert native == [r"C:\Program Files\Git\cmd\git.exe", "--version"]
    assert native_options == {"creationflags": 0x08000000}
    assert isinstance(batch, str)
    assert batch.startswith(r"C:\Windows\System32\cmd.exe /d /s /c ")
    assert '"C:\\Program Files\\nodejs\\npx.cmd"' in batch
    assert "@playwright/mcp@0.0.75" in batch
    assert batch_options == {"creationflags": 0x08000000}
    assert hidden_process_kwargs(platform="linux") == {}


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
            spec.name, Path(spec.command), spec.minimum_version or spec.provisioned_version, True
        ),
    )

    plan = build_setup_plan(manifest, mcp_servers={}, record=previous)

    assert plan.top_up is True
    assert [step.id for step in plan.steps] == [
        "detect",
        "satisfied:git",
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
