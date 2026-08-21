"""Tests for rotaris_core.config.secrets module."""

from __future__ import annotations

from typing import TYPE_CHECKING

import yaml

if TYPE_CHECKING:
    from pathlib import Path

    import pytest

from rotaris_core.config.secrets import (
    _load_secrets_file,
    ensure_gitignore_excludes_config,
    load_merged_secrets,
    resolve_server_env,
    save_secrets,
    set_secret,
    unset_all_secrets,
    unset_secret,
)
from rotaris_core.reqtocode import SWR, verifies

# ---------------------------------------------------------------------------
# _load_secrets_file
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1724)
def test_load_secrets_file_missing_dir(tmp_path: Path) -> None:
    result = _load_secrets_file(tmp_path / "nonexistent")
    assert result == {}


@verifies(SWR.SWR_1724)
def test_load_secrets_file_missing_file(tmp_path: Path) -> None:
    result = _load_secrets_file(tmp_path)
    assert result == {}


@verifies(SWR.SWR_1724)
def test_load_secrets_file_valid(tmp_path: Path) -> None:
    (tmp_path / "secrets.yaml").write_text(
        "tavily:\n  TAVILY_API_KEY: tvly-abc123\n",
        encoding="utf-8",
    )
    result = _load_secrets_file(tmp_path)
    assert result == {"tavily": {"TAVILY_API_KEY": "tvly-abc123"}}


@verifies(SWR.SWR_1724)
def test_load_secrets_file_invalid_yaml_returns_empty(tmp_path: Path) -> None:
    (tmp_path / "secrets.yaml").write_text(":\ninvalid: [yaml\n", encoding="utf-8")
    result = _load_secrets_file(tmp_path)
    assert result == {}


@verifies(SWR.SWR_1724)
def test_load_secrets_file_non_mapping_returns_empty(tmp_path: Path) -> None:
    (tmp_path / "secrets.yaml").write_text("- list\n- items\n", encoding="utf-8")
    result = _load_secrets_file(tmp_path)
    assert result == {}


# ---------------------------------------------------------------------------
# save_secrets
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1724)
def test_save_secrets_creates_file(tmp_path: Path) -> None:
    data = {"tavily": {"TAVILY_API_KEY": "tvly-secret"}}
    save_secrets(tmp_path, data)
    assert (tmp_path / "secrets.yaml").exists()
    loaded = yaml.safe_load((tmp_path / "secrets.yaml").read_text(encoding="utf-8"))
    assert loaded == data


@verifies(SWR.SWR_1724)
def test_save_secrets_creates_parent_dirs(tmp_path: Path) -> None:
    config_dir = tmp_path / "nested" / "config"
    save_secrets(config_dir, {"srv": {"KEY": "val"}})
    assert (config_dir / "secrets.yaml").exists()


@verifies(SWR.SWR_1724)
def test_save_secrets_overwrites_existing(tmp_path: Path) -> None:
    (tmp_path / "secrets.yaml").write_text("old: data\n", encoding="utf-8")
    save_secrets(tmp_path, {"new": {"K": "V"}})
    loaded = yaml.safe_load((tmp_path / "secrets.yaml").read_text())
    assert loaded == {"new": {"K": "V"}}


@verifies(SWR.SWR_1724)
def test_save_secrets_atomic_no_tmp_left_on_success(tmp_path: Path) -> None:
    save_secrets(tmp_path, {"s": {"k": "v"}})
    tmp_files = list(tmp_path.glob("*.tmp"))
    assert tmp_files == []


# ---------------------------------------------------------------------------
# set_secret / unset_secret / unset_all_secrets
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1722)
def test_set_secret_creates_new_entry(tmp_path: Path) -> None:
    set_secret(tmp_path, "tavily", "TAVILY_API_KEY", "tvly-123")
    data = _load_secrets_file(tmp_path)
    assert data["tavily"]["TAVILY_API_KEY"] == "tvly-123"


@verifies(SWR.SWR_1722)
def test_set_secret_updates_existing_entry(tmp_path: Path) -> None:
    set_secret(tmp_path, "tavily", "TAVILY_API_KEY", "old")
    set_secret(tmp_path, "tavily", "TAVILY_API_KEY", "new")
    data = _load_secrets_file(tmp_path)
    assert data["tavily"]["TAVILY_API_KEY"] == "new"


@verifies(SWR.SWR_1722)
def test_set_secret_adds_key_to_existing_server(tmp_path: Path) -> None:
    set_secret(tmp_path, "tavily", "KEY_A", "aaa")
    set_secret(tmp_path, "tavily", "KEY_B", "bbb")
    data = _load_secrets_file(tmp_path)
    assert data["tavily"] == {"KEY_A": "aaa", "KEY_B": "bbb"}


@verifies(SWR.SWR_1722)
def test_unset_secret_removes_key(tmp_path: Path) -> None:
    set_secret(tmp_path, "tavily", "TAVILY_API_KEY", "val")
    removed = unset_secret(tmp_path, "tavily", "TAVILY_API_KEY")
    assert removed is True
    data = _load_secrets_file(tmp_path)
    assert "tavily" not in data


@verifies(SWR.SWR_1722)
def test_unset_secret_removes_server_when_empty(tmp_path: Path) -> None:
    set_secret(tmp_path, "tavily", "ONLY_KEY", "v")
    unset_secret(tmp_path, "tavily", "ONLY_KEY")
    data = _load_secrets_file(tmp_path)
    assert data == {}


@verifies(SWR.SWR_1722)
def test_unset_secret_returns_false_when_key_absent(tmp_path: Path) -> None:
    removed = unset_secret(tmp_path, "tavily", "MISSING_KEY")
    assert removed is False


@verifies(SWR.SWR_1722)
def test_unset_all_secrets_removes_all_keys(tmp_path: Path) -> None:
    set_secret(tmp_path, "tavily", "K1", "v1")
    set_secret(tmp_path, "tavily", "K2", "v2")
    count = unset_all_secrets(tmp_path, "tavily")
    assert count == 2
    data = _load_secrets_file(tmp_path)
    assert "tavily" not in data


@verifies(SWR.SWR_1722)
def test_unset_all_secrets_returns_zero_when_server_absent(tmp_path: Path) -> None:
    count = unset_all_secrets(tmp_path, "nonexistent")
    assert count == 0


# ---------------------------------------------------------------------------
# load_merged_secrets
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1726)
def test_load_merged_secrets_workspace_overrides_global(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    workspace_root = tmp_path / "workspace"
    ws_config_dir = workspace_root / ".rotaris"
    ws_config_dir.mkdir(parents=True)

    monkeypatch.setattr("rotaris_core.config.secrets.GLOBAL_CONFIG_DIR", global_dir, raising=False)
    # Patch the import inside load_merged_secrets
    monkeypatch.setattr("rotaris_core.config.paths.GLOBAL_CONFIG_DIR", global_dir, raising=False)

    set_secret(global_dir, "tavily", "TAVILY_API_KEY", "global-key")
    set_secret(ws_config_dir, "tavily", "TAVILY_API_KEY", "workspace-key")

    merged = load_merged_secrets(workspace_root)
    assert merged["tavily"]["TAVILY_API_KEY"] == "workspace-key"


@verifies(SWR.SWR_1726)
def test_load_merged_secrets_global_only(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    global_dir = tmp_path / "global"
    workspace_root = tmp_path / "workspace"
    (workspace_root / ".rotaris").mkdir(parents=True)

    monkeypatch.setattr("rotaris_core.config.paths.GLOBAL_CONFIG_DIR", global_dir, raising=False)

    set_secret(global_dir, "tavily", "TAVILY_API_KEY", "global-only")

    merged = load_merged_secrets(workspace_root)
    assert merged["tavily"]["TAVILY_API_KEY"] == "global-only"


@verifies(SWR.SWR_1726)
def test_load_merged_secrets_workspace_only(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    workspace_root = tmp_path / "workspace"
    ws_config_dir = workspace_root / ".rotaris"
    ws_config_dir.mkdir(parents=True)

    monkeypatch.setattr("rotaris_core.config.paths.GLOBAL_CONFIG_DIR", global_dir, raising=False)

    set_secret(ws_config_dir, "myserver", "MY_KEY", "ws-val")

    merged = load_merged_secrets(workspace_root)
    assert merged["myserver"]["MY_KEY"] == "ws-val"


@verifies(SWR.SWR_1726)
def test_load_merged_secrets_no_secrets_returns_empty(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    workspace_root = tmp_path / "workspace"
    (workspace_root / ".rotaris").mkdir(parents=True)

    monkeypatch.setattr("rotaris_core.config.paths.GLOBAL_CONFIG_DIR", global_dir, raising=False)

    merged = load_merged_secrets(workspace_root)
    assert merged == {}


# ---------------------------------------------------------------------------
# resolve_server_env
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1726)
def test_resolve_server_env_expands_placeholder_from_os_environ(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("TAVILY_API_KEY", "tvly-from-env")
    result = resolve_server_env("tavily", {"TAVILY_API_KEY": "${TAVILY_API_KEY}"}, {})
    assert result == {"TAVILY_API_KEY": "tvly-from-env"}


@verifies(SWR.SWR_1726)
def test_resolve_server_env_omits_placeholder_when_not_in_environ(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("MISSING_VAR", raising=False)
    result = resolve_server_env("srv", {"KEY": "${MISSING_VAR}"}, {})
    assert "KEY" not in result


@verifies(SWR.SWR_1726)
def test_resolve_server_env_keeps_static_values() -> None:
    result = resolve_server_env("srv", {"STATIC": "literal-value"}, {})
    assert result == {"STATIC": "literal-value"}


@verifies(SWR.SWR_1726)
def test_resolve_server_env_secrets_override_shell(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("TAVILY_API_KEY", "shell-key")
    secrets = {"tavily": {"TAVILY_API_KEY": "secrets-key"}}
    result = resolve_server_env("tavily", {"TAVILY_API_KEY": "${TAVILY_API_KEY}"}, secrets)
    assert result["TAVILY_API_KEY"] == "secrets-key"


@verifies(SWR.SWR_1726)
def test_resolve_server_env_secrets_injected_even_without_placeholder() -> None:
    """Secrets are added even if base_env has no entry for a key."""
    secrets = {"tavily": {"TAVILY_API_KEY": "injected"}}
    result = resolve_server_env("tavily", {}, secrets)
    assert result["TAVILY_API_KEY"] == "injected"


@verifies(SWR.SWR_1726)
def test_resolve_server_env_no_secrets_no_env_empty_base() -> None:
    result = resolve_server_env("tavily", {}, {})
    assert result == {}


@verifies(SWR.SWR_1726)
def test_resolve_server_env_other_server_secrets_not_injected() -> None:
    secrets = {"other-server": {"KEY": "val"}}
    result = resolve_server_env("tavily", {}, secrets)
    assert result == {}


# ---------------------------------------------------------------------------
# Integration: loader resolves env vars from secrets at load time
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1726)
def test_loader_resolves_secrets_into_mcp_server_env(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from rotaris_core.config import loader

    global_dir = tmp_path / "global"
    workspace_root = tmp_path / "workspace"
    ws_config_dir = workspace_root / ".rotaris"
    ws_config_dir.mkdir(parents=True)

    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    monkeypatch.setattr("rotaris_core.config.paths.GLOBAL_CONFIG_DIR", global_dir)

    # Store a secret for the tavily server in workspace scope
    set_secret(ws_config_dir, "tavily", "TAVILY_API_KEY", "tvly-loaded")

    config = loader.load_config(workspace_root)

    # The resolved env should have the secret injected
    assert config.mcp_servers["tavily"].env.get("TAVILY_API_KEY") == "tvly-loaded"


# ---------------------------------------------------------------------------
# gitignore hygiene / CLI convenience command
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1728)
def test_ensure_gitignore_excludes_config_dir_and_is_idempotent(tmp_path: Path) -> None:
    """Productive use: stored provider keys never reach a commit.
    Expected outcome: `.rotaris/` is listed once in `.gitignore`, however often we ask."""
    (tmp_path / ".gitignore").write_text("__pycache__/\n", encoding="utf-8")

    assert ensure_gitignore_excludes_config(tmp_path) is True
    assert ensure_gitignore_excludes_config(tmp_path) is True

    lines = (tmp_path / ".gitignore").read_text(encoding="utf-8").splitlines()
    assert lines.count(".rotaris/") == 1
    assert "__pycache__/" in lines


@verifies(SWR.SWR_1728)
def test_secrets_file_lives_under_the_ignored_config_dir(tmp_path: Path) -> None:
    """Productive use: the secrets file is covered by the ignore rule it generates.
    Expected outcome: `secrets.yaml` is written inside the ignored `.rotaris/` directory."""
    config_dir = tmp_path / ".rotaris"
    _ = ensure_gitignore_excludes_config(tmp_path)
    set_secret(config_dir, "tavily", "TAVILY_API_KEY", "tvly-test")

    secrets_path = config_dir / "secrets.yaml"
    assert secrets_path.exists()
    assert secrets_path.parent.name == ".rotaris/".rstrip("/")
    assert ".rotaris/" in (tmp_path / ".gitignore").read_text(encoding="utf-8")


@verifies(SWR.SWR_1723)
def test_config_set_tavily_key_command_stores_the_workspace_secret(tmp_path: Path) -> None:
    """Productive use: `rotaris-cli config set-tavily-key` wires up Tavily in one step.
    Expected outcome: the key lands under the tavily server as `TAVILY_API_KEY`, masked in output."""
    import typer
    from typer.testing import CliRunner

    from rotaris_core.cli.commands.config import register

    app = typer.Typer()
    register(app)

    result = CliRunner().invoke(
        app,
        ["config", "set-tavily-key", "tvly-secret-value", "--workspace", str(tmp_path)],
    )

    assert result.exit_code == 0, result.output
    stored = yaml.safe_load((tmp_path / ".rotaris" / "secrets.yaml").read_text(encoding="utf-8"))
    assert stored["tavily"]["TAVILY_API_KEY"] == "tvly-secret-value"
    assert "tvly-secret-value" not in result.output
