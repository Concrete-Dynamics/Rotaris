"""Sandbox value objects: writable/read-only boundary and the no-fallback error.

Every test here is host-independent — the spec layer touches no platform API,
so these assertions hold identically on Windows, macOS and Linux.
"""

from __future__ import annotations

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.sandbox import (
    SandboxAvailability,
    SandboxMode,
    SandboxSpec,
    SandboxUnavailableError,
)
from rotaris_core.sandbox.spec import PROTECTED_SUBPATHS

pytestmark = pytest.mark.unit


@verifies(SWR.SWR_2507)
def test_workspace_spec_makes_the_workspace_writable(tmp_path):
    """Productive use: a developer enables the sandbox for their workspace.
    Expected outcome: the workspace root is the writable root of the sandbox, so
    the agent can still edit the project it was asked to work on."""
    workspace = tmp_path / "project"
    workspace.mkdir()

    spec = SandboxSpec.for_workspace(workspace, mode=SandboxMode.WORKSPACE_WRITE)

    assert spec.workspace_root == workspace.resolve()
    assert spec.effective_writable_roots() == (workspace.resolve(),)
    assert spec.allow_network is False


@verifies(SWR.SWR_2507)
def test_extra_writable_roots_follow_the_workspace(tmp_path):
    """Productive use: a developer grants the agent a shared build cache too.
    Expected outcome: the extra root is writable alongside the workspace, with the
    workspace still first so the primary boundary is unambiguous."""
    workspace = tmp_path / "project"
    workspace.mkdir()
    cache = tmp_path / "cache"
    cache.mkdir()

    spec = SandboxSpec.for_workspace(
        workspace,
        mode=SandboxMode.WORKSPACE_WRITE,
        writable_roots=[cache, cache],
    )

    assert spec.writable_roots == (cache.resolve(),)
    assert spec.effective_writable_roots() == (workspace.resolve(), cache.resolve())


@verifies(SWR.SWR_2507)
def test_git_and_rotaris_are_always_carved_out(tmp_path):
    """Productive use: a developer trusts the sandbox to protect its own config.
    Expected outcome: .git and .rotaris are read-only without anyone asking, so an
    agent cannot install a git hook or widen its own sandbox."""
    workspace = tmp_path / "project"
    workspace.mkdir()

    spec = SandboxSpec.for_workspace(workspace, mode=SandboxMode.WORKSPACE_WRITE)

    assert PROTECTED_SUBPATHS == (".git", ".rotaris")
    assert spec.readonly_subpaths == (
        workspace.resolve() / ".git",
        workspace.resolve() / ".rotaris",
    )


@verifies(SWR.SWR_2507)
def test_relative_writable_root_is_rejected(tmp_path):
    """Productive use: a developer mistypes a writable root in their config.
    Expected outcome: construction fails loudly instead of silently anchoring the
    sandbox boundary to whatever the working directory happens to be."""
    workspace = tmp_path / "project"
    workspace.mkdir()

    with pytest.raises(ValueError, match="absolute"):
        SandboxSpec.for_workspace(
            workspace,
            mode=SandboxMode.WORKSPACE_WRITE,
            writable_roots=["relative/cache"],
        )


@verifies(SWR.SWR_2507)
def test_read_only_mode_makes_nothing_writable(tmp_path):
    """Productive use: a developer runs a review-only session under the sandbox.
    Expected outcome: not even the workspace is writable, so the agent can inspect
    the project but cannot change it."""
    workspace = tmp_path / "project"
    workspace.mkdir()
    extra = tmp_path / "cache"
    extra.mkdir()

    spec = SandboxSpec.for_workspace(
        workspace,
        mode=SandboxMode.READ_ONLY,
        writable_roots=[extra],
    )

    assert spec.effective_writable_roots() == ()


@verifies(SWR.SWR_2507)
def test_off_mode_makes_nothing_writable_because_nothing_is_rendered(tmp_path):
    """Productive use: a developer leaves the sandbox off.
    Expected outcome: the spec renders no writable roots at all, because no
    sandbox policy is applied in that mode."""
    workspace = tmp_path / "project"
    workspace.mkdir()

    spec = SandboxSpec.for_workspace(workspace, mode=SandboxMode.OFF)

    assert spec.effective_writable_roots() == ()


@verifies(SWR.SWR_2507)
def test_network_stays_closed_unless_explicitly_allowed(tmp_path):
    """Productive use: a developer opts the sandboxed session into network access.
    Expected outcome: the flag is off by default and only on when asked for, so a
    sandboxed run never reaches the network by accident."""
    workspace = tmp_path / "project"
    workspace.mkdir()

    closed = SandboxSpec.for_workspace(workspace, mode=SandboxMode.WORKSPACE_WRITE)
    opened = SandboxSpec.for_workspace(
        workspace,
        mode=SandboxMode.WORKSPACE_WRITE,
        allow_network=True,
    )

    assert closed.allow_network is False
    assert opened.allow_network is True


@verifies(SWR.SWR_2507)
def test_sandbox_modes_have_stable_config_values():
    """Productive use: a developer writes sandbox_mode into their config file.
    Expected outcome: the mode names persisted in config keep their exact spelling
    across releases, so an existing config keeps meaning what it meant."""
    assert SandboxMode.OFF == "off"
    assert SandboxMode.WORKSPACE_WRITE == "workspace-write"
    assert SandboxMode.READ_ONLY == "read-only"


@verifies(SWR.SWR_2507)
def test_unavailable_error_shows_reason_and_remediation_on_separate_lines():
    """Productive use: a developer's sandboxed run is blocked on an unequipped host.
    Expected outcome: the raised error tells them both what failed and what to do
    about it, rather than the run quietly proceeding unsandboxed."""
    availability = SandboxAvailability(
        available=False,
        backend="unavailable",
        reason="No sandbox here.",
        remediation="Install one.",
    )

    error = SandboxUnavailableError(availability)

    assert error.availability is availability
    assert str(error) == "No sandbox here.\nInstall one."


@verifies(SWR.SWR_2507)
def test_unavailable_error_still_reads_sensibly_without_a_remediation():
    """Productive use: a developer hits a sandbox failure with no known fix.
    Expected outcome: the error still carries a readable single-line message
    instead of rendering as empty text."""
    error = SandboxUnavailableError(
        SandboxAvailability(available=False, backend="unavailable", reason="Broken.")
    )

    assert str(error) == "Broken."


@verifies(SWR.SWR_2507)
def test_sandbox_package_does_not_import_the_openhands_sdk():
    """Productive use: a developer runs a terminal command in a sandboxed session.
    Expected outcome: consulting the sandbox costs no SDK import, so the sandbox
    check does not add seconds to every command."""
    import subprocess
    import sys

    result = subprocess.run(
        [
            sys.executable,
            "-c",
            "import sys, rotaris_core.sandbox; "
            "print(any(m == 'openhands' or m.startswith('openhands.') for m in sys.modules))",
        ],
        capture_output=True,
        text=True,
        check=True,
    )

    assert result.stdout.strip() == "False"
