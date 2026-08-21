"""Tests for rotaris_core.config.mcp_discovery module.

Coverage:
  - get_discovery_locations, discover_mcp_servers
  - placeholder resolution, envFile parsing, name validation
  - merge order (project wins over user on collision)
  - error handling: missing files, invalid JSON, bad names, missing command
"""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path
from typing import TYPE_CHECKING, Any

from rotaris_core.config.mcp_discovery import discover_mcp_servers
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _write_mcp_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data))


def _stdio_entry(command: str = "npx", args: list[str] | None = None) -> dict[str, Any]:
    return {"command": command, "args": args or ["-y", "some-server"]}


def _http_entry(url: str = "https://api.example.com/mcp") -> dict[str, Any]:
    return {"type": "http", "url": url, "headers": {"Authorization": "Bearer x"}}


def _sse_entry(url: str = "https://api.example.com/sse") -> dict[str, Any]:
    return {"type": "sse", "url": url}


# ---------------------------------------------------------------------------
# Redirect user-level discovery to tmp_path
# ---------------------------------------------------------------------------


def _patch_home(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    """Make Path.home() return tmp_path/home so user-level .mcp.json is isolated."""
    fake_home = tmp_path / "home"
    fake_home.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(Path, "home", staticmethod(lambda: fake_home))
    # Also patch APPDATA (Windows path)
    monkeypatch.setenv("APPDATA", str(fake_home / "AppData" / "Roaming"))
    return fake_home


def _user_mcp_path(fake_home: Path) -> Path:
    """Return the platform-appropriate user mcp.json path under fake_home."""
    if sys.platform == "darwin":
        return fake_home / "Library" / "Application Support" / "mcp.json"
    if sys.platform == "win32":
        return fake_home / "AppData" / "Roaming" / "mcp.json"
    return fake_home / ".config" / "mcp.json"


# ---------------------------------------------------------------------------
# 1. Empty — no files → ({}, {})
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1715, SWR.SWR_1716)
def test_no_files_returns_empty(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_home(monkeypatch, tmp_path)
    ws = tmp_path / "workspace"
    ws.mkdir()

    servers, source_map = discover_mcp_servers(ws)

    assert servers == {}
    assert source_map == {}


# ---------------------------------------------------------------------------
# 2. Project .mcp.json — one stdio server
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1715, SWR.SWR_1716)
def test_project_mcp_json_parsed(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_home(monkeypatch, tmp_path)
    ws = tmp_path / "workspace"
    ws.mkdir()
    _write_mcp_json(
        ws / ".mcp.json",
        {"mcpServers": {"fs": _stdio_entry("node", ["server.js"])}},
    )

    servers, source_map = discover_mcp_servers(ws)

    assert "fs" in servers
    assert servers["fs"].command == "node"
    assert servers["fs"].args == ["server.js"]
    assert source_map["fs"] == "discovered-project"


# ---------------------------------------------------------------------------
# 3. User mcp.json — only user location populated
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1715, SWR.SWR_1716, SWR.SWR_1730)
def test_user_mcp_json_parsed(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    fake_home = _patch_home(monkeypatch, tmp_path)
    user_mcp = _user_mcp_path(fake_home)
    _write_mcp_json(user_mcp, {"mcpServers": {"mytool": _stdio_entry("mytool-bin")}})

    ws = tmp_path / "workspace"
    ws.mkdir()

    servers, source_map = discover_mcp_servers(ws)

    assert "mytool" in servers
    assert source_map["mytool"] == "discovered-user"


# ---------------------------------------------------------------------------
# 4. Collision: project wins over user
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1715, SWR.SWR_1716, SWR.SWR_1730)
def test_project_overrides_user_on_name_collision(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_home = _patch_home(monkeypatch, tmp_path)
    user_mcp = _user_mcp_path(fake_home)
    _write_mcp_json(user_mcp, {"mcpServers": {"shared": _stdio_entry("user-binary")}})

    ws = tmp_path / "workspace"
    ws.mkdir()
    _write_mcp_json(ws / ".mcp.json", {"mcpServers": {"shared": _stdio_entry("project-binary")}})

    servers, source_map = discover_mcp_servers(ws)

    assert servers["shared"].command == "project-binary"
    assert source_map["shared"] == "discovered-project"


# ---------------------------------------------------------------------------
# 5. Alternate top-level key: "servers" instead of "mcpServers"
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1715, SWR.SWR_1716)
def test_alternate_servers_top_level_key(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_home(monkeypatch, tmp_path)
    ws = tmp_path / "workspace"
    ws.mkdir()
    _write_mcp_json(ws / ".mcp.json", {"servers": {"alt": _stdio_entry("alt-cmd")}})

    servers, _ = discover_mcp_servers(ws)

    assert "alt" in servers
    assert servers["alt"].command == "alt-cmd"


# ---------------------------------------------------------------------------
# 6. HTTP server: type, url, headers preserved
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1715, SWR.SWR_1716)
def test_http_server_parsed_with_url_and_headers(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_home(monkeypatch, tmp_path)
    ws = tmp_path / "workspace"
    ws.mkdir()
    entry = _http_entry("https://api.example.com/mcp")
    _write_mcp_json(ws / ".mcp.json", {"mcpServers": {"remote": entry}})

    servers, _ = discover_mcp_servers(ws)

    assert "remote" in servers
    cfg = servers["remote"]
    assert cfg.type == "http"
    assert cfg.url == "https://api.example.com/mcp"
    assert cfg.headers is not None
    assert cfg.headers["Authorization"] == "Bearer x"


# ---------------------------------------------------------------------------
# 7. SSE server
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1715, SWR.SWR_1716)
def test_sse_server_parsed(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_home(monkeypatch, tmp_path)
    ws = tmp_path / "workspace"
    ws.mkdir()
    _write_mcp_json(
        ws / ".mcp.json",
        {"mcpServers": {"stream": _sse_entry("https://stream.example.com/sse")}},
    )

    servers, _ = discover_mcp_servers(ws)

    assert "stream" in servers
    assert servers["stream"].type == "sse"
    assert servers["stream"].url == "https://stream.example.com/sse"


# ---------------------------------------------------------------------------
# 8. Invalid name skipped, warning logged
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1715, SWR.SWR_1716)
def test_invalid_server_name_skipped(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    _patch_home(monkeypatch, tmp_path)
    ws = tmp_path / "workspace"
    ws.mkdir()
    _write_mcp_json(
        ws / ".mcp.json",
        {"mcpServers": {"123bad": _stdio_entry("node"), "good": _stdio_entry("ok")}},
    )

    with caplog.at_level(logging.WARNING, logger="rotaris_core.config.mcp_discovery"):
        servers, _ = discover_mcp_servers(ws)

    assert "123bad" not in servers
    assert "good" in servers
    assert any("123bad" in r.message for r in caplog.records)


# ---------------------------------------------------------------------------
# 9. ${workspaceFolder} placeholder in cwd
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1715, SWR.SWR_1716)
def test_workspace_folder_placeholder_resolved_in_cwd(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_home(monkeypatch, tmp_path)
    ws = tmp_path / "workspace"
    ws.mkdir()
    entry: dict[str, Any] = {
        "command": "node",
        "args": ["server.js"],
        "cwd": "${workspaceFolder}/server",
    }
    _write_mcp_json(ws / ".mcp.json", {"mcpServers": {"svc": entry}})

    servers, _ = discover_mcp_servers(ws)

    assert "svc" in servers
    assert servers["svc"].cwd == str(ws / "server")


# ---------------------------------------------------------------------------
# 10. ${env:VAR} placeholder in env values
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1715, SWR.SWR_1716)
def test_env_var_placeholder_resolved(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_home(monkeypatch, tmp_path)
    monkeypatch.setenv("MY_TOKEN", "secret-token-value")
    ws = tmp_path / "workspace"
    ws.mkdir()
    entry: dict[str, Any] = {
        "command": "node",
        "args": [],
        "env": {"TOKEN": "${env:MY_TOKEN}"},
    }
    _write_mcp_json(ws / ".mcp.json", {"mcpServers": {"svc": entry}})

    servers, _ = discover_mcp_servers(ws)

    assert servers["svc"].env["TOKEN"] == "secret-token-value"


# ---------------------------------------------------------------------------
# 11. envFile loaded and merged into env
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1715, SWR.SWR_1716)
def test_envfile_loaded_and_merged(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_home(monkeypatch, tmp_path)
    ws = tmp_path / "workspace"
    ws.mkdir()

    env_file = ws / ".env"
    env_file.write_text("FROM_FILE=file-value\n# comment\n\nOTHER=hello\n")

    entry: dict[str, Any] = {
        "command": "node",
        "args": [],
        "envFile": ".env",
    }
    _write_mcp_json(ws / ".mcp.json", {"mcpServers": {"svc": entry}})

    servers, _ = discover_mcp_servers(ws)

    cfg = servers["svc"]
    assert cfg.env["FROM_FILE"] == "file-value"
    assert cfg.env["OTHER"] == "hello"


# ---------------------------------------------------------------------------
# 12. Explicit env wins over envFile when same key
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1715, SWR.SWR_1716)
def test_envfile_does_not_override_explicit_env(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_home(monkeypatch, tmp_path)
    ws = tmp_path / "workspace"
    ws.mkdir()

    env_file = ws / ".env"
    env_file.write_text("SHARED=from-file\n")

    entry: dict[str, Any] = {
        "command": "node",
        "args": [],
        "env": {"SHARED": "explicit-wins"},
        "envFile": ".env",
    }
    _write_mcp_json(ws / ".mcp.json", {"mcpServers": {"svc": entry}})

    servers, _ = discover_mcp_servers(ws)

    assert servers["svc"].env["SHARED"] == "explicit-wins"


# ---------------------------------------------------------------------------
# 13. Invalid JSON → warns, returns ({}, {}), no exception
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1715, SWR.SWR_1716)
def test_invalid_json_warns_and_skips(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    _patch_home(monkeypatch, tmp_path)
    ws = tmp_path / "workspace"
    ws.mkdir()
    (ws / ".mcp.json").write_text("{not valid json}")

    with caplog.at_level(logging.WARNING, logger="rotaris_core.config.mcp_discovery"):
        servers, source_map = discover_mcp_servers(ws)

    assert servers == {}
    assert source_map == {}
    assert len(caplog.records) >= 1


# ---------------------------------------------------------------------------
# 14. Missing command for stdio → skipped with warning (Pydantic ValidationError)
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1715, SWR.SWR_1716)
def test_missing_command_for_stdio_warns_and_skips(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    _patch_home(monkeypatch, tmp_path)
    ws = tmp_path / "workspace"
    ws.mkdir()
    entry: dict[str, Any] = {"args": ["--verbose"]}  # no command, no url → stdio invalid
    _write_mcp_json(ws / ".mcp.json", {"mcpServers": {"broken": entry}})

    with caplog.at_level(logging.WARNING, logger="rotaris_core.config.mcp_discovery"):
        servers, _ = discover_mcp_servers(ws)

    assert "broken" not in servers
    assert len(caplog.records) >= 1


# ---------------------------------------------------------------------------
# 15. envFile missing → warn, server still present, env empty
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1715, SWR.SWR_1716)
def test_envfile_missing_warns_continues(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    _patch_home(monkeypatch, tmp_path)
    ws = tmp_path / "workspace"
    ws.mkdir()

    entry: dict[str, Any] = {
        "command": "node",
        "args": [],
        "envFile": "nonexistent.env",
    }
    _write_mcp_json(ws / ".mcp.json", {"mcpServers": {"svc": entry}})

    with caplog.at_level(logging.WARNING, logger="rotaris_core.config.mcp_discovery"):
        servers, _ = discover_mcp_servers(ws)

    assert "svc" in servers
    assert servers["svc"].env == {}
    assert any("nonexistent.env" in r.message for r in caplog.records)
