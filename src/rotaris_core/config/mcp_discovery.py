from __future__ import annotations

import json
import logging
import os
import re
import sys
from pathlib import Path
from typing import Any, Literal, cast

from rotaris_core.config.schema import MCPServerConfig
from rotaris_core.reqtocode import SWR, traces

_log = logging.getLogger(__name__)

_VALID_SERVER_NAME_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9_-]*$")
_PLACEHOLDER_RE = re.compile(r"\$\{([^}]+)\}")


def get_discovery_locations(workspace_root: Path) -> list[tuple[Path, str]]:
    locations: list[tuple[Path, str]] = [
        (workspace_root / ".mcp.json", "discovered-project"),
    ]

    if sys.platform == "darwin":
        user_path = Path.home() / "Library" / "Application Support" / "mcp.json"
    elif sys.platform == "win32":
        appdata = os.environ.get("APPDATA")
        if appdata is None:
            return locations
        user_path = Path(appdata) / "mcp.json"
    else:
        user_path = Path.home() / ".config" / "mcp.json"

    locations.append((user_path, "discovered-user"))
    return locations


def _parse_env_file(path: Path) -> dict[str, str]:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        _log.warning("mcp_discovery: cannot read envFile %s", path)
        return {}

    result: dict[str, str] = {}
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if "=" not in stripped:
            continue
        key, _, val = stripped.partition("=")
        key = key.strip()
        val = val.strip()
        if (val.startswith('"') and val.endswith('"')) or (
            val.startswith("'") and val.endswith("'")
        ):
            val = val[1:-1]
        result[key] = val
    return result


def _resolve_placeholders(value: str, workspace_root: Path) -> str:
    def _replace(match: re.Match[str]) -> str:
        expr = match.group(1)
        if expr == "workspaceFolder":
            return str(workspace_root)
        if expr.startswith("env:"):
            var_name = expr[4:]
            return os.environ.get(var_name, "")
        _log.warning("mcp_discovery: unknown placeholder ${%s} — leaving as-is", expr)
        return match.group(0)

    return _PLACEHOLDER_RE.sub(_replace, value)


def _parse_server_entry(
    name: str,
    raw: dict[str, Any],
    source: str,
    config_dir: Path,
    workspace_root: Path,
) -> MCPServerConfig | None:
    try:
        raw_type: str | None = raw.get("type")
        url: str | None = raw.get("url")

        effective_type = ("http" if url else "stdio") if raw_type is None else raw_type

        env_from_file: dict[str, str] = {}
        env_file_val = raw.get("envFile")
        if env_file_val is not None:
            env_file_path = Path(env_file_val)
            if not env_file_path.is_absolute():
                env_file_path = config_dir / env_file_path
            env_from_file = _parse_env_file(env_file_path)

        explicit_env: dict[str, str] = raw.get("env") or {}
        merged_env: dict[str, str] = {**env_from_file, **explicit_env}

        resolved_env = {k: _resolve_placeholders(v, workspace_root) for k, v in merged_env.items()}

        cwd_raw: str | None = raw.get("cwd")
        resolved_cwd: str | None = None
        if cwd_raw is not None:
            resolved_cwd = os.path.normpath(_resolve_placeholders(cwd_raw, workspace_root))

        if effective_type in ("http", "sse"):
            return MCPServerConfig(
                type=cast("Literal['http', 'sse']", effective_type),
                url=url,
                headers=raw.get("headers"),
                env=resolved_env,
                cwd=resolved_cwd,
            )
        return MCPServerConfig(
            type="stdio",
            command=raw.get("command"),
            args=raw.get("args") or [],
            env=resolved_env,
            cwd=resolved_cwd,
        )
    except Exception as exc:
        _log.warning("mcp_discovery: skipping server %r from %s: %s", name, source, exc)
        return None


def _load_mcp_json_file(
    path: Path,
    source: str,
    workspace_root: Path,
) -> dict[str, MCPServerConfig]:
    if not path.exists():
        return {}

    try:
        data: Any = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        _log.warning("mcp_discovery: failed to parse %s: %s", path, exc)
        return {}

    if not isinstance(data, dict):
        _log.warning("mcp_discovery: %s is not a JSON object — skipping", path)
        return {}

    raw_servers: Any = data.get("mcpServers") or data.get("servers")
    if not isinstance(raw_servers, dict):
        return {}

    config_dir = path.parent
    result: dict[str, MCPServerConfig] = {}

    for name, raw_entry in raw_servers.items():
        if not _VALID_SERVER_NAME_RE.match(name):
            _log.warning("mcp_discovery: invalid server name %r in %s — skipping", name, path)
            continue
        if not isinstance(raw_entry, dict):
            _log.warning(
                "mcp_discovery: server %r entry is not an object in %s — skipping",
                name,
                path,
            )
            continue
        cfg = _parse_server_entry(name, raw_entry, source, config_dir, workspace_root)
        if cfg is not None:
            result[name] = cfg

    return result


@traces(
    SWR.SWR_1706,
    SWR.SWR_1707,
    SWR.SWR_1708,
    SWR.SWR_1710,
    SWR.SWR_1711,
    SWR.SWR_1712,
    SWR.SWR_1715,
    SWR.SWR_1716,
    SWR.SWR_1729,
    SWR.SWR_1730,
)
def discover_mcp_servers(
    workspace_root: Path,
) -> tuple[dict[str, MCPServerConfig], dict[str, str]]:
    locations = get_discovery_locations(workspace_root)

    project_locations = [(p, s) for p, s in locations if s == "discovered-project"]
    user_locations = [(p, s) for p, s in locations if s != "discovered-project"]

    merged: dict[str, MCPServerConfig] = {}
    source_map: dict[str, str] = {}

    for path, source in user_locations:
        servers = _load_mcp_json_file(path, source, workspace_root)
        for name, cfg in servers.items():
            merged[name] = cfg
            source_map[name] = source

    for path, source in project_locations:
        servers = _load_mcp_json_file(path, source, workspace_root)
        for name, cfg in servers.items():
            merged[name] = cfg
            source_map[name] = source

    return merged, source_map
