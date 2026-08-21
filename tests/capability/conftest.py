"""Capability test fixtures — auto-marks tests and skips when the LLM endpoint is unreachable."""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import TYPE_CHECKING

import httpx
import pytest

if TYPE_CHECKING:
    from rotaris_core.config.schema import RotarisConfig

_log = logging.getLogger(__name__)

_endpoint_available: bool | None = None


def _selected_capability_items(items: list[pytest.Item], capability_dir: Path) -> list[pytest.Item]:
    return [
        item for item in items if item.path is not None and item.path.is_relative_to(capability_dir)
    ]


def _capability_explicitly_selected(
    config: pytest.Config,
    capability_items: list[pytest.Item],
) -> bool:
    if not capability_items:
        return False

    markexpr = (config.getoption("markexpr") or "").strip()
    if markexpr:
        return "capability" in markexpr

    keyword = (config.getoption("keyword") or "").lower()
    if keyword:
        return "capability" in keyword

    selected_args = [str(arg) for arg in config.args]
    if not selected_args:
        return False

    capability_root = str(capability_items[0].path.parent)
    return any("capability" in arg or capability_root in arg for arg in selected_args)


def _check_endpoint() -> bool:
    """Derive base_url + api_key from the global config and probe ``/models``."""
    global _endpoint_available  # noqa: PLW0603
    if _endpoint_available is not None:
        return _endpoint_available

    try:
        from rotaris_core.config.loader import load_config

        cfg = load_config(Path.cwd())
        persona = cfg.personas.get(cfg.default_persona)
        if persona is None:
            _endpoint_available = False
            _log.warning("Default persona %r not found in config", cfg.default_persona)
            return False

        model_cfg = cfg.models.get(persona.model)
        if model_cfg is None or model_cfg.base_url is None:
            _endpoint_available = False
            _log.warning("Model %r has no base_url", persona.model if model_cfg else "?")
            return False

        url = model_cfg.base_url.rstrip("/") + "/models"
        headers: dict[str, str] = {}
        if model_cfg.api_key is not None:
            headers["Authorization"] = f"Bearer {model_cfg.api_key.get_secret_value()}"
        elif model_cfg.api_key_env is not None:
            key = os.environ.get(model_cfg.api_key_env, "")
            if key:
                headers["Authorization"] = f"Bearer {key}"

        resp = httpx.get(url, timeout=10, headers=headers)
        _endpoint_available = resp.status_code == 200
    except (httpx.ConnectError, httpx.TimeoutException, OSError):
        _endpoint_available = False
    except Exception:
        _log.exception("Unexpected error checking model endpoint")
        _endpoint_available = False

    _log.info("Model endpoint reachable: %s", _endpoint_available)
    return _endpoint_available


def pytest_collection_modifyitems(items: list[pytest.Item]) -> None:
    capability_dir = Path(__file__).parent
    capability_items = _selected_capability_items(items, capability_dir)
    for item in capability_items:
        item.add_marker(pytest.mark.capability)

    if not capability_items:
        return

    config = items[0].config
    if not _capability_explicitly_selected(config, capability_items):
        for item in capability_items:
            item.add_marker(
                pytest.mark.skip(reason="Capability tests require explicit selection"),
            )
        return

    reachable = _check_endpoint()
    if reachable:
        return

    for item in capability_items:
        item.add_marker(
            pytest.mark.skip(reason="Model endpoint not reachable"),
        )


@pytest.fixture
def capability_workspace(tmp_path: Path) -> Path:
    """Isolated workspace with .rotaris/sessions/ pre-created."""
    ws = tmp_path / "workspace"
    ws.mkdir()
    (ws / ".rotaris" / "sessions").mkdir(parents=True)
    return ws


@pytest.fixture
def capability_config(capability_workspace: Path) -> RotarisConfig:
    """Real global config (~/.config/rotaris/) with workspace_root = tmp dir."""
    from rotaris_core.config.loader import load_config

    return load_config(capability_workspace)
