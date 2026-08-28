from __future__ import annotations

import logging
import os
import re
import tempfile
from contextlib import suppress
from datetime import datetime, timedelta
from importlib import import_module
from pathlib import Path
from typing import Any, cast

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from rotaris_core.config.paths import GLOBAL_CONFIG_DIR as _GLOBAL_CONFIG_DIR
from rotaris_core.reqtocode import SWR, traces

yaml = cast("Any", import_module("yaml"))

# The snapshot grows with every discovered model, so it is routinely tens of KB.
# PyYAML's pure-Python loader parses that in ~250ms; libyaml does it in ~25ms.
_SAFE_LOADER = getattr(yaml, "CSafeLoader", yaml.SafeLoader)

# read_snapshot() is called dozens of times during a single Rotaris startup
# (once per provider, per model listing, per provider health check).  Re-parsing
# the same file each time dominated startup, so keep the last parse keyed on the
# file's identity and hand out copies.
_snapshot_cache: dict[Path, tuple[tuple[int, int], ProjectSnapshot]] = {}

_log = logging.getLogger(__name__)


_SECRET_VALUE_PREFIXES = ("ghp_", "ghs_", "ghu_", "gho_", "sk-", "sk_", "iv1.", "eyj")
_SECRET_KEY_WORDS = {
    "auth",
    "authorization",
    "token",
    "secret",
    "password",
    "apikey",
    "bearer",
    "credential",
    "session",
}


def snapshot_path(base: Path | None = None) -> Path:
    root = base if base is not None else _GLOBAL_CONFIG_DIR
    return root / "project_settings.yaml"


class SnapshotModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    display_name: str | None = None
    capabilities: dict[str, Any] = Field(default_factory=dict)
    limits: dict[str, Any] = Field(default_factory=dict)
    pricing: dict[str, float] = Field(default_factory=dict)
    discovered_at: str

    @field_validator("discovered_at", mode="before")
    @classmethod
    def _validate_discovered_at(cls, value: Any) -> Any:
        _validate_iso8601_utc(value, "SnapshotModel.discovered_at")
        return value


class SnapshotProvider(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    display_name: str
    family: str | None = None
    base_url: str | None = None
    authenticated: bool
    models: list[SnapshotModel] = Field(default_factory=list)
    default_summary_model: str | None = None
    large_model: str | None = None
    medium_model: str | None = None
    small_model: str | None = None
    fallback_model: str | None = None

    @field_validator("models", mode="after")
    @classmethod
    def _validate_unique_models(cls, models: list[SnapshotModel]) -> list[SnapshotModel]:
        seen = set()
        unique_models = []
        for m in models:
            if m.id in seen:
                _log.warning("Duplicate model ID '%s' found in snapshot; keeping first.", m.id)
                continue
            seen.add(m.id)
            unique_models.append(m)
        return unique_models

    discovered_at: str

    @field_validator("discovered_at", mode="before")
    @classmethod
    def _validate_discovered_at(cls, value: Any) -> Any:
        _validate_iso8601_utc(value, "SnapshotProvider.discovered_at")
        return value


@traces(SWR.SWR_770, SWR.SWR_1734)
class ProjectSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: int = 1
    providers: dict[str, SnapshotProvider] = Field(default_factory=dict)

    @field_validator("version")
    @classmethod
    def _validate_version(cls, value: int) -> int:
        if value != 1:
            raise ValueError("unsupported project snapshot version")
        return value


def write_snapshot(snapshot: ProjectSnapshot, *, base: Path | None = None) -> Path:
    path = snapshot_path(base)
    path.parent.mkdir(parents=True, exist_ok=True)

    payload = snapshot.model_dump(mode="python")
    _assert_no_secrets(payload)
    rendered = yaml.safe_dump(payload, sort_keys=False, allow_unicode=True)

    fd, tmp_path = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    os.close(fd)
    try:
        with Path(tmp_path).open("w", encoding="utf-8", newline="") as handle:
            handle.write(rendered)
        os.replace(tmp_path, path)
        os.chmod(path, 0o644)
    finally:
        with suppress(FileNotFoundError):
            Path(tmp_path).unlink()

    _snapshot_cache.pop(path, None)
    return path


def clear_snapshot_cache() -> None:
    """Drop the parsed-snapshot cache.

    Only needed when a snapshot file is replaced behind this module's back and
    the new content happens to share the old one's mtime and size.
    """
    _snapshot_cache.clear()


def read_snapshot(base: Path | None = None) -> ProjectSnapshot | None:
    path = snapshot_path(base)
    if not path.exists():
        _snapshot_cache.pop(path, None)
        return None

    try:
        stat = path.stat()
        fingerprint = (stat.st_mtime_ns, stat.st_size)
        cached = _snapshot_cache.get(path)
        if cached is not None and cached[0] == fingerprint:
            return cached[1].model_copy(deep=True)

        raw = yaml.load(path.read_text(encoding="utf-8"), Loader=_SAFE_LOADER)
        snapshot = ProjectSnapshot.model_validate(raw)
    except (OSError, yaml.YAMLError, ValidationError, ValueError) as exc:
        _snapshot_cache.pop(path, None)
        raise ValueError(f"Invalid project snapshot at {path}: {exc}") from exc

    _snapshot_cache[path] = (fingerprint, snapshot)
    return snapshot.model_copy(deep=True)


def update_provider(provider: SnapshotProvider, *, base: Path | None = None) -> ProjectSnapshot:
    snapshot = read_snapshot(base) or ProjectSnapshot()
    providers = dict(snapshot.providers)
    providers[provider.id] = provider
    updated = snapshot.model_copy(update={"providers": providers})
    write_snapshot(updated, base=base)
    return updated


def remove_provider(provider_id: str, *, base: Path | None = None) -> bool:
    snapshot = read_snapshot(base)
    if snapshot is None or provider_id not in snapshot.providers:
        return False

    providers = dict(snapshot.providers)
    del providers[provider_id]
    updated = snapshot.model_copy(update={"providers": providers})
    write_snapshot(updated, base=base)
    return True


def _assert_no_secrets(data: dict[str, Any], path_prefix: str = "") -> None:
    def scan(value: Any, current_path: str) -> None:
        if isinstance(value, dict):
            for key, nested in value.items():
                key_path = f"{current_path}.{key}" if current_path else str(key)
                if _key_looks_like_secret(str(key)) and not _is_model_pricing_field(
                    str(key), current_path
                ):
                    raise ValueError(
                        f"Refusing to write snapshot: secret-like field detected: {key_path}",
                    )
                scan(nested, key_path)
            return

        if isinstance(value, list):
            for index, nested in enumerate(value):
                scan(nested, f"{current_path}.{index}" if current_path else str(index))
            return

        if isinstance(value, tuple):
            for index, nested in enumerate(value):
                scan(nested, f"{current_path}.{index}" if current_path else str(index))
            return

        if isinstance(value, str) and _looks_like_secret(value):
            raise ValueError(
                "Refusing to write snapshot: secret-like field detected: "
                f"{current_path or '<root>'}",
            )

    scan(data, path_prefix)


def _looks_like_secret(value: str) -> bool:
    stripped = value.strip()
    lowered = stripped.lower()
    if lowered.startswith("bearer "):
        bearer_value = stripped.split(None, 1)[1] if len(stripped.split(None, 1)) == 2 else ""
        return bool(bearer_value) and _looks_like_secret(bearer_value)

    if " " in stripped:
        return False
    matching_prefix = next(
        (prefix for prefix in _SECRET_VALUE_PREFIXES if lowered.startswith(prefix)),
        None,
    )
    if matching_prefix is None or len(stripped) <= len(matching_prefix):
        return False
    return any(char.isalpha() for char in stripped)


def _key_looks_like_secret(key: str) -> bool:
    lowered = key.lower()
    if "ghu_" in lowered:
        return True
    if any(marker in lowered for marker in ("api_key", "access_token", "refresh_token")):
        return True

    tokens = [token for token in re.split(r"[^a-z0-9]+", lowered) if token]
    return any(token in _SECRET_KEY_WORDS for token in tokens)


def _is_model_pricing_field(key: str, parent_path: str) -> bool:
    """Allow public per-token cost metadata through the secret-field guard.

    ``input_cost_per_token`` is not a credential even though it includes the
    word ``token``. Limit this exception to a model's public ``pricing`` block
    so a similarly named field cannot relax secret persistence elsewhere.
    """
    return key in {"input_cost_per_token", "output_cost_per_token"} and parent_path.endswith(
        ".pricing"
    )


def _validate_iso8601_utc(value: Any, field_name: str) -> None:
    if not isinstance(value, str):
        raise ValueError(f"{field_name} must be an ISO 8601 UTC string")

    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None or parsed.utcoffset() != timedelta(0):
        raise ValueError(f"{field_name} must be UTC (offset +00:00)")
