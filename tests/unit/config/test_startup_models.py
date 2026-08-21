from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from pathlib import Path

    import pytest

import yaml

from rotaris_core.config.loader import load_config
from rotaris_core.config.startup_models import (
    agents_yaml_path,
    read_startup_model_preferences,
    write_startup_model_preferences,
)
from rotaris_core.reqtocode import SWR, verifies


def _write_workspace_agents_yaml(workspace_root: Path, content: str) -> None:
    path = agents_yaml_path(workspace_root)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content.strip() + "\n", encoding="utf-8")


def _workspace_config_yaml() -> str:
    return (
        "default_summary_model: medium_model\n"
        "small_model: gpt-4o-mini\n"
        "medium_model: balanced-model\n"
        "large_model: gpt-4o\n"
        "fallback_model: small_model\n"
        "personas:\n"
        "  codebase-analyst:\n"
        "    model: medium_model\n"
        "  tester:\n"
        "    model: gpt-4o-mini\n"
        "models:\n"
        "  gpt-4o:\n"
        "    provider: openai\n"
        "    model_id: gpt-4o\n"
        "  gpt-4o-mini:\n"
        "    provider: openai\n"
        "    model_id: gpt-4o-mini\n"
        "  balanced-model:\n"
        "    provider: openai\n"
        "    model_id: gpt-4.1-mini\n"
    )


@verifies(SWR.SWR_727, SWR.SWR_826, SWR.SWR_830)
def test_read_startup_model_preferences_reports_inherited_and_explicit_persona_models(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", global_dir)

    _write_workspace_agents_yaml(workspace_root, _workspace_config_yaml())

    config = load_config(workspace_root)
    prefs = read_startup_model_preferences(workspace_root, config)

    assert prefs.slots["medium_model"] == "balanced-model"
    assert prefs.personas["docs-writer"].inherited is True
    assert prefs.personas["docs-writer"].default_model == "medium_model"
    assert prefs.personas["codebase-analyst"].configured_model == "medium_model"
    assert prefs.personas["codebase-analyst"].resolved_model == "balanced-model"
    assert prefs.personas["tester"].configured_model == "gpt-4o-mini"


@verifies(SWR.SWR_727, SWR.SWR_829, SWR.SWR_830)
def test_write_startup_model_preferences_creates_file_and_updates_slots_and_personas(
    tmp_path: Path,
) -> None:
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()

    path = write_startup_model_preferences(
        workspace_root,
        slots={
            "default_summary_model": "copilot/gpt-5-mini",
            "small_model": "copilot/gpt-5-nano",
            "medium_model": "copilot/gpt-5-mini",
            "large_model": "copilot/gpt-5",
            "fallback_model": "copilot/gpt-5-nano",
        },
        persona_models={"codebase-analyst": "medium_model", "docs-writer": None},
    )

    data = yaml.safe_load(path.read_text(encoding="utf-8"))

    assert data["medium_model"] == "copilot/gpt-5-mini"
    assert data["personas"]["codebase-analyst"]["model"] == "medium_model"
    assert "docs-writer" not in data.get("personas", {})


@verifies(SWR.SWR_864, SWR.SWR_859)
def test_write_startup_model_preferences_persists_slot_thinking_overrides(
    tmp_path: Path,
) -> None:
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()

    path = write_startup_model_preferences(
        workspace_root,
        slots={"medium_model": "balanced-model"},
        slot_thinking={"medium_model": "low", "default_summary_model": "auto"},
    )

    data = yaml.safe_load(path.read_text(encoding="utf-8"))

    assert data["medium_model"] == "balanced-model"
    assert data["medium_model_thinking"] == "low"
    assert data["default_summary_model_thinking"] == "auto"


@verifies(SWR.SWR_727, SWR.SWR_826, SWR.SWR_827)
def test_write_startup_model_preferences_roundtrips_through_load_config(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", global_dir)

    _write_workspace_agents_yaml(workspace_root, _workspace_config_yaml())
    write_startup_model_preferences(
        workspace_root,
        slots={"medium_model": "gpt-4o-mini"},
        persona_models={"codebase-analyst": "medium_model"},
    )

    config = load_config(workspace_root)

    assert config.medium_model == "gpt-4o-mini"

    # Since codebase-analyst has thinking="low" in defaults, it gets a synthetic model
    from rotaris_core.config.startup_models import _unwrap_synthetic_model_name

    assert (
        _unwrap_synthetic_model_name(config, config.personas["codebase-analyst"].model)
        == "gpt-4o-mini"
    )


@verifies(SWR.SWR_864, SWR.SWR_860)
def test_startup_model_preferences_roundtrip_preserves_slot_thinking_without_exposing_synthetic_name(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", global_dir)

    _write_workspace_agents_yaml(workspace_root, _workspace_config_yaml())
    write_startup_model_preferences(
        workspace_root,
        slots={"medium_model": "balanced-model"},
        slot_thinking={"medium_model": "low"},
        persona_models={"codebase-analyst": "medium_model"},
    )

    config = load_config(workspace_root)
    prefs = read_startup_model_preferences(workspace_root, config)

    assert config.medium_model.startswith("__startup_slot__:medium_model")
    assert config.models[config.medium_model].thinking == "low"
    assert prefs.slots["medium_model"] == "balanced-model"
    assert prefs.slot_thinking["medium_model"] == "low"
    assert prefs.personas["codebase-analyst"].resolved_model == "balanced-model"


@verifies(SWR.SWR_727, SWR.SWR_827)
def test_startup_model_preferences_accept_legacy_oracle_alias(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", global_dir)

    _write_workspace_agents_yaml(
        workspace_root,
        _workspace_config_yaml().replace("codebase-analyst", "oracle"),
    )

    config = load_config(workspace_root)
    prefs = read_startup_model_preferences(workspace_root, config)

    assert "codebase-analyst" in config.personas
    assert prefs.personas["codebase-analyst"].configured_model == "medium_model"


@verifies(SWR.SWR_1638)
def test_improvement_collector_model_slot_in_startup_fields() -> None:
    """``improvement_collector_model`` is a recognised startup model slot."""
    from rotaris_core.config.startup_models import STARTUP_MODEL_FIELDS

    assert "improvement_collector_model" in STARTUP_MODEL_FIELDS


@verifies(SWR.SWR_1638)
def test_improvement_collector_model_read_write_roundtrip(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", global_dir)

    _write_workspace_agents_yaml(workspace_root, _workspace_config_yaml())

    # Write a dedicated improvement collector model override.
    write_startup_model_preferences(
        workspace_root,
        slots={"improvement_collector_model": "balanced-model"},
    )

    config = load_config(workspace_root)
    assert config.improvement_collector_model == "balanced-model"

    prefs = read_startup_model_preferences(workspace_root, config)
    assert prefs.slots["improvement_collector_model"] == "balanced-model"


@verifies(SWR.SWR_1638)
def test_improvement_collector_model_thinking_roundtrip(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", global_dir)

    _write_workspace_agents_yaml(workspace_root, _workspace_config_yaml())
    write_startup_model_preferences(
        workspace_root,
        slots={"improvement_collector_model": "balanced-model"},
        slot_thinking={"improvement_collector_model": "high"},
    )

    config = load_config(workspace_root)
    prefs = read_startup_model_preferences(workspace_root, config)

    assert config.improvement_collector_model == "__startup_slot__:improvement_collector_model"
    assert config.models[config.improvement_collector_model].thinking == "high"
    assert prefs.slots["improvement_collector_model"] == "balanced-model"
    assert prefs.slot_thinking["improvement_collector_model"] == "high"


@verifies(SWR.SWR_1638)
def test_improvement_collector_model_falls_back_to_medium_model(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When unset, ``improvement_collector_model`` is None and callers fall
    back to ``medium_model``.
    """
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", global_dir)

    _write_workspace_agents_yaml(workspace_root, _workspace_config_yaml())

    config = load_config(workspace_root)
    # Not explicitly set — should be None (callers fall back to medium_model).
    assert config.improvement_collector_model is None
    assert config.medium_model == "balanced-model"
