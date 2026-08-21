"""Configuration surface for the OS-level sandbox (SWR-2507) and the network
egress policy (SWR-2505), exercised through the real config loader."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from pydantic import ValidationError

from rotaris_core.config import loader
from rotaris_core.config.schema import RuntimePolicy
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.unit


def _scopes(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> tuple[Path, Path]:
    """Create an isolated global config dir and workspace, return (global_dir, root)."""
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    return global_dir, workspace_root


@verifies(SWR.SWR_2505, SWR.SWR_2507)
def test_sandbox_and_egress_defaults_are_closed(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: an operator who has configured nothing still gets the safe posture.
    Expected outcome: sandboxing is off (opt-in), the sandbox grants no network, and
    fetch targets are asked about rather than silently allowed."""
    _global_dir, workspace_root = _scopes(tmp_path, monkeypatch)

    runtime = loader.load_config(workspace_root).runtime

    assert runtime.sandbox_mode == "off"
    assert runtime.sandbox_writable_roots == []
    assert runtime.sandbox_allow_network is False
    assert runtime.network_egress_policy == "ask"
    assert runtime.network_allowed_hosts == []
    assert runtime.network_denied_hosts == []


@verifies(SWR.SWR_2505, SWR.SWR_2507)
def test_workspace_agents_yaml_sets_every_sandbox_and_egress_field(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: an operator enables the sandbox and an egress allowlist in their
    workspace agents.yaml.
    Expected outcome: every value reaches the loaded runtime policy unchanged."""
    _global_dir, workspace_root = _scopes(tmp_path, monkeypatch)
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME / "agents.yaml").write_text(
        """
runtime:
  sandbox_mode: workspace-write
  sandbox_writable_roots:
    - /opt/build-cache
  sandbox_allow_network: true
  network_egress_policy: deny
  network_allowed_hosts:
    - github.com
    - "*.npmjs.org"
  network_denied_hosts:
    - metadata.internal
""",
        encoding="utf-8",
    )

    runtime = loader.load_config(workspace_root).runtime

    assert runtime.sandbox_mode == "workspace-write"
    assert runtime.sandbox_writable_roots == ["/opt/build-cache"]
    assert runtime.sandbox_allow_network is True
    assert runtime.network_egress_policy == "deny"
    assert runtime.network_allowed_hosts == ["github.com", "*.npmjs.org"]
    assert runtime.network_denied_hosts == ["metadata.internal"]


@verifies(SWR.SWR_2505, SWR.SWR_2507)
def test_workspace_overrides_global_and_unset_fields_fall_back(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: an operator keeps org-wide sandbox defaults globally and tightens
    only some of them for one workspace.
    Expected outcome: workspace values win, and fields the workspace leaves unset keep the
    global value instead of snapping back to the shipped default."""
    global_dir, workspace_root = _scopes(tmp_path, monkeypatch)
    (global_dir / "agents.yaml").write_text(
        """
runtime:
  sandbox_mode: read-only
  sandbox_writable_roots:
    - /srv/global-cache
  sandbox_allow_network: true
  network_egress_policy: allow
  network_allowed_hosts:
    - global.example
""",
        encoding="utf-8",
    )
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME / "agents.yaml").write_text(
        """
runtime:
  sandbox_mode: workspace-write
  network_egress_policy: deny
  network_denied_hosts:
    - metadata.internal
""",
        encoding="utf-8",
    )

    runtime = loader.load_config(workspace_root).runtime

    # Workspace wins where it speaks.
    assert runtime.sandbox_mode == "workspace-write"
    assert runtime.network_egress_policy == "deny"
    assert runtime.network_denied_hosts == ["metadata.internal"]
    # Global survives where the workspace is silent.
    assert runtime.sandbox_writable_roots == ["/srv/global-cache"]
    assert runtime.sandbox_allow_network is True
    assert runtime.network_allowed_hosts == ["global.example"]


@verifies(SWR.SWR_2507)
def test_unknown_sandbox_mode_is_rejected_by_name() -> None:
    """Productive use: an operator who mistypes the sandbox mode is told what to write.
    Expected outcome: loading fails with an error naming all three valid modes, instead of
    silently running unsandboxed."""
    with pytest.raises(ValidationError) as excinfo:
        RuntimePolicy(sandbox_mode="container")

    message = str(excinfo.value)
    assert "container" in message
    assert "off" in message
    assert "workspace-write" in message
    assert "read-only" in message


@verifies(SWR.SWR_2507)
def test_sandbox_mode_accepts_yaml_boolean_off() -> None:
    """Productive use: an operator writes the natural unquoted ``sandbox_mode: off``.
    Expected outcome: YAML 1.1's boolean False is read as the 'off' mode rather than
    raising a type error about strings."""
    assert RuntimePolicy(sandbox_mode=False).sandbox_mode == "off"  # type: ignore[arg-type]


@verifies(SWR.SWR_2507)
def test_sandbox_writable_roots_rejects_a_relative_path() -> None:
    """Productive use: an operator lists a writable root the sandbox could not mount.
    Expected outcome: the relative entry is rejected at load time, naming the offender."""
    with pytest.raises(ValidationError) as excinfo:
        RuntimePolicy(sandbox_writable_roots=["build/cache"])

    assert "build/cache" in str(excinfo.value)
    assert "absolute" in str(excinfo.value)


@verifies(SWR.SWR_2507)
def test_sandbox_writable_roots_accepts_posix_and_windows_absolute_paths() -> None:
    """Productive use: a team shares one agents.yaml across macOS, Linux and Windows hosts.
    Expected outcome: both absolute spellings are accepted whatever host parses the file."""
    policy = RuntimePolicy(sandbox_writable_roots=[" /opt/cache ", r"C:\Builds\cache"])

    assert policy.sandbox_writable_roots == ["/opt/cache", r"C:\Builds\cache"]


@verifies(SWR.SWR_2505)
def test_unknown_network_egress_policy_is_rejected_by_name() -> None:
    """Productive use: an operator mistypes the egress disposition.
    Expected outcome: the error names allow/ask/deny instead of falling back to a guess."""
    with pytest.raises(ValidationError) as excinfo:
        RuntimePolicy(network_egress_policy="maybe")

    message = str(excinfo.value)
    assert "maybe" in message
    assert "allow" in message
    assert "ask" in message
    assert "deny" in message


@verifies(SWR.SWR_2505)
def test_host_patterns_are_lowercased_and_stripped() -> None:
    """Productive use: an operator pastes host patterns with stray case and whitespace.
    Expected outcome: the stored patterns are comparison-ready, so an allowlisted host is
    not missed over a capital letter."""
    policy = RuntimePolicy(
        network_allowed_hosts=["  GitHub.com ", "*.NPMJS.org", "   "],
        network_denied_hosts=["\tMetadata.Internal\n"],
    )

    assert policy.network_allowed_hosts == ["github.com", "*.npmjs.org"]
    assert policy.network_denied_hosts == ["metadata.internal"]


@verifies(SWR.SWR_2505, SWR.SWR_2507)
def test_list_defaults_are_not_shared_between_policies() -> None:
    """Productive use: two sessions each carry their own sandbox and egress settings.
    Expected outcome: appending to one policy's list never leaks into another's."""
    first = RuntimePolicy()
    second = RuntimePolicy()

    first.sandbox_writable_roots.append("/opt/first")
    first.network_allowed_hosts.append("first.example")

    assert second.sandbox_writable_roots == []
    assert second.network_allowed_hosts == []


@verifies(SWR.SWR_2505, SWR.SWR_2507)
def test_invalid_values_are_rejected_on_assignment_too() -> None:
    """Productive use: a settings screen writes a sandbox choice onto the loaded policy.
    Expected outcome: an invalid write is refused there too, so no code path can install a
    mode the sandbox cannot honor."""
    policy = RuntimePolicy()

    with pytest.raises(ValidationError):
        policy.sandbox_mode = "container"
    with pytest.raises(ValidationError):
        policy.network_egress_policy = "maybe"

    policy.network_allowed_hosts = ["  GitHub.com "]

    assert policy.sandbox_mode == "off"
    assert policy.network_egress_policy == "ask"
    assert policy.network_allowed_hosts == ["github.com"]
