"""Secrets management for MCP server environment variables.

Secrets are stored in ``secrets.yaml`` under the global or workspace config
directory alongside ``agents.yaml``.  The file format is a simple mapping from
MCP server name to a dict of env-var key/value pairs::

    tavily:
      TAVILY_API_KEY: tvly-xxxxxx

At child-spawn time, the resolver merges shell environment expansion of
``${VAR_NAME}`` placeholders with stored secrets.  Stored secrets take
precedence over shell environment.
"""

from __future__ import annotations

import os
import re
import tempfile
from pathlib import Path
from typing import Any

import yaml

from rotaris_core.config.paths import WORKSPACE_CONFIG_DIR_NAME
from rotaris_core.reqtocode import SWR, traces

SECRETS_FILE_NAME = "secrets.yaml"
_GITIGNORE_ENTRY = f"{WORKSPACE_CONFIG_DIR_NAME}/"

_ENV_VAR_RE = re.compile(r"^\$\{([^}]+)\}$")


@traces(SWR.SWR_1728)
def ensure_gitignore_excludes_config(workspace_root: Path) -> bool:
    """Ensure ``.rotaris/`` is listed in ``<workspace_root>/.gitignore``.

    Appends the entry if the ``.gitignore`` file exists but does not already
    contain it.  Returns ``True`` if the entry was added or already present;
    ``False`` if the entry could not be written.

    Idempotent: calling this multiple times produces the same result.
    """
    gitignore_path = workspace_root / ".gitignore"
    try:
        content = gitignore_path.read_text(encoding="utf-8") if gitignore_path.exists() else ""
    except (OSError, UnicodeDecodeError):
        return False

    lines = content.splitlines()
    normalized_entry = _GITIGNORE_ENTRY.rstrip("/")
    for line in lines:
        if line.strip().rstrip("/") == normalized_entry:
            return True  # Already present

    new_content = content
    if new_content and not new_content.endswith("\n"):
        new_content += "\n"
    new_content += _GITIGNORE_ENTRY + "\n"

    try:
        fd, tmp_path_str = tempfile.mkstemp(dir=workspace_root, suffix=".tmp")
        tmp_path = Path(tmp_path_str)
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(new_content)
        tmp_path.replace(gitignore_path)
    except (OSError, Exception):
        return False
    return True


def _load_secrets_file(config_dir: Path) -> dict[str, dict[str, str]]:
    """Load secrets from ``secrets.yaml`` in *config_dir*.  Returns ``{}`` if absent."""
    path = config_dir / SECRETS_FILE_NAME
    if not path.exists():
        return {}
    try:
        with path.open("r", encoding="utf-8") as fh:
            data: Any = yaml.safe_load(fh)
    except yaml.YAMLError:
        return {}
    if not isinstance(data, dict):
        return {}
    result: dict[str, dict[str, str]] = {}
    for server, env_map in data.items():
        if isinstance(env_map, dict):
            result[str(server)] = {str(k): str(v) for k, v in env_map.items()}
    return result


@traces(SWR.SWR_1724)
def load_merged_secrets(workspace_root: Path) -> dict[str, dict[str, str]]:
    """Load and merge global + workspace secrets.

    Workspace-level secrets override global-level secrets on a per-key basis.
    """
    from rotaris_core.config.paths import GLOBAL_CONFIG_DIR

    global_secrets = _load_secrets_file(GLOBAL_CONFIG_DIR)
    workspace_secrets = _load_secrets_file(workspace_root / WORKSPACE_CONFIG_DIR_NAME)

    merged: dict[str, dict[str, str]] = {}
    for server, env_map in global_secrets.items():
        merged[server] = dict(env_map)
    for server, env_map in workspace_secrets.items():
        if server in merged:
            merged[server].update(env_map)
        else:
            merged[server] = dict(env_map)
    return merged


def save_secrets(config_dir: Path, data: dict[str, dict[str, str]]) -> None:
    """Atomically write *data* to ``secrets.yaml`` in *config_dir*."""
    config_dir.mkdir(parents=True, exist_ok=True)
    path = config_dir / SECRETS_FILE_NAME
    yaml_content = yaml.dump(data, default_flow_style=False, allow_unicode=True)
    fd, tmp_path_str = tempfile.mkstemp(dir=config_dir, suffix=".tmp")
    tmp_path = Path(tmp_path_str)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(yaml_content)
        tmp_path.replace(path)
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise


@traces(SWR.SWR_1722)
def set_secret(config_dir: Path, server_name: str, key: str, value: str) -> None:
    """Set a single env-var secret for *server_name* in *config_dir*."""
    data = _load_secrets_file(config_dir)
    if server_name not in data:
        data[server_name] = {}
    data[server_name][key] = value
    save_secrets(config_dir, data)


def unset_secret(config_dir: Path, server_name: str, key: str) -> bool:
    """Remove *key* from *server_name* secrets.  Returns ``True`` if it existed."""
    data = _load_secrets_file(config_dir)
    server_data = data.get(server_name)
    if not server_data or key not in server_data:
        return False
    del server_data[key]
    if not server_data:
        del data[server_name]
    save_secrets(config_dir, data)
    return True


def unset_all_secrets(config_dir: Path, server_name: str) -> int:
    """Remove all secrets for *server_name*.  Returns the count of removed keys."""
    data = _load_secrets_file(config_dir)
    server_data = data.pop(server_name, {})
    if server_data:
        save_secrets(config_dir, data)
    return len(server_data)


@traces(SWR.SWR_1726)
def resolve_server_env(
    server_name: str,
    base_env: dict[str, str],
    merged_secrets: dict[str, dict[str, str]],
) -> dict[str, str]:
    """Resolve the env dict for an MCP server at spawn time.

    Resolution order (later overrides earlier):

    1. Expand ``${VAR_NAME}`` placeholders in *base_env* from :data:`os.environ`.
       Keys whose placeholder is not set in the environment are omitted.
       Static values are kept as-is.
    2. Overlay with any entries from *merged_secrets* for this server
       (secrets always override the shell environment).
    """
    resolved: dict[str, str] = {}
    for key, value in base_env.items():
        m = _ENV_VAR_RE.match(value)
        if m:
            env_value = os.environ.get(m.group(1))
            if env_value is not None:
                resolved[key] = env_value
            # Not in environ and not in secrets — omit rather than passing literal
        else:
            resolved[key] = value

    # Overlay: stored secrets override shell values
    server_secrets = merged_secrets.get(server_name, {})
    resolved.update(server_secrets)
    return resolved
