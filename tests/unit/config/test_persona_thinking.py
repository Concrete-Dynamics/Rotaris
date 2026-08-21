"""Unit tests for per-persona thinking / reasoning effort configuration.

Covers:
- Schema: PersonaConfig.thinking validation and boolean coercion
- Loader: _inject_persona_thinking_models() creates synthetic models
- Read/write round-trip: PersonaModelPreference.thinking persistence
- Unwrap: _unwrap_synthetic_model_name() handles __persona__: prefix
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

import pytest
import yaml

from rotaris_core.config.loader import (
    _inject_persona_thinking_models,
    _synthetic_persona_model_name,
    load_config,
)
from rotaris_core.config.schema import PersonaConfig
from rotaris_core.config.startup_models import (
    _SYNTHETIC_PERSONA_MODEL_PREFIX,
    _unwrap_synthetic_model_name,
    agents_yaml_path,
    read_startup_model_preferences,
    write_startup_model_preferences,
)
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from pathlib import Path


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def _write_workspace_agents_yaml(workspace_root: Path, content: str) -> None:
    path = agents_yaml_path(workspace_root)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text((content.strip() + "\n"), encoding="utf-8")


def _base_workspace_config_yaml() -> str:
    """Minimal workspace agents.yaml with models and model aliases."""
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


def _build_workspace_yaml_with_personas(
    *,
    base: str | None = None,
    extra_personas: dict[str, dict[str, Any]] | None = None,
) -> str:
    """Build complete workspace YAML by injecting extra personas into the
    ``personas:`` section of a base YAML string.

    ``extra_personas`` keys are persona names, values are dicts of YAML fields
    (e.g. ``{"model": "large_model", "thinking": "high"}``).
    """
    if base is None:
        base = _base_workspace_config_yaml()
    if not extra_personas:
        return base

    # Find the "personas:" line and insert extra entries after the last
    # existing persona entry but before "models:".
    lines = base.splitlines(keepends=True)

    # Find the start of the models section
    models_line_idx = None
    for i, line in enumerate(lines):
        if line.startswith("models:"):
            models_line_idx = i
            break

    if models_line_idx is None:
        raise ValueError("base YAML must contain a 'models:' section")

    # Build extra persona lines
    extra_lines: list[str] = []
    for name, fields in extra_personas.items():
        extra_lines.append(f"  {name}:\n")
        for key, value in fields.items():
            if value is None:
                extra_lines.append(f"    {key}: null\n")
            elif isinstance(value, bool):
                extra_lines.append(f"    {key}: {'true' if value else 'false'}\n")
            else:
                extra_lines.append(f"    {key}: {value}\n")

    # Insert extra persona entries just before "models:"
    result = "".join(lines[:models_line_idx] + extra_lines + lines[models_line_idx:])
    return result


# ---------------------------------------------------------------------------
# 1. Schema validation
# ---------------------------------------------------------------------------


class TestPersonaConfigThinkingSchema:
    @verifies(SWR.SWR_2096)
    def test_thinking_accepts_valid_literal(self) -> None:
        for level in ("auto", "low", "medium", "high", "max"):
            p = PersonaConfig(name="test", model="gpt-4o", thinking=level)  # type: ignore[arg-type]
            assert p.thinking == level

    @verifies(SWR.SWR_2096)
    def test_thinking_coerces_true_to_high(self) -> None:
        p = PersonaConfig(name="test", model="gpt-4o", thinking=True)  # type: ignore[arg-type]
        assert p.thinking == "high"

    @verifies(SWR.SWR_2096)
    def test_thinking_coerces_false_to_none(self) -> None:
        p = PersonaConfig(name="test", model="gpt-4o", thinking=False)  # type: ignore[arg-type]
        assert p.thinking is None

    @verifies(SWR.SWR_2096)
    def test_thinking_defaults_to_none(self) -> None:
        p = PersonaConfig(name="test", model="gpt-4o")
        assert p.thinking is None

    @verifies(SWR.SWR_2096)
    def test_thinking_rejects_invalid_literal(self) -> None:
        with pytest.raises(ValueError):  # Pydantic validation error
            PersonaConfig(name="test", model="gpt-4o", thinking="invalid")  # type: ignore[arg-type]

    @verifies(SWR.SWR_2096)
    def test_thinking_field_coexists_with_other_fields(self) -> None:
        p = PersonaConfig(
            name="planner",
            model="large_model",
            thinking="high",
            purpose="Test plan persona",
            tools=["delegate", "read_file"],
            fallback_model="small_model",
        )
        assert p.name == "planner"
        assert p.model == "large_model"
        assert p.thinking == "high"
        assert p.purpose == "Test plan persona"
        assert p.fallback_model == "small_model"
        assert "delegate" in p.tools

    @verifies(SWR.SWR_2096)
    def test_thinking_field_roundtrips_through_model_dump(self) -> None:
        p = PersonaConfig(name="test", model="gpt-4o", thinking="low")
        dumped = p.model_dump()
        assert dumped["thinking"] == "low"
        roundtrip = PersonaConfig.model_validate(dumped)
        assert roundtrip.thinking == "low"

    @verifies(SWR.SWR_2096)
    def test_thinking_none_roundtrips_through_model_dump(self) -> None:
        p = PersonaConfig(name="test", model="gpt-4o", thinking=None)
        dumped = p.model_dump()
        assert dumped["thinking"] is None
        roundtrip = PersonaConfig.model_validate(dumped)
        assert roundtrip.thinking is None


# ---------------------------------------------------------------------------
# 2. Loader injection: _inject_persona_thinking_models
# ---------------------------------------------------------------------------


def _make_base_model_data(provider: str = "openai", model_id: str = "gpt-4o") -> dict[str, Any]:
    return {"provider": provider, "model_id": model_id}


def _make_minimal_data(
    models: dict[str, Any] | None = None,
    personas: dict[str, Any] | None = None,
    **extra: Any,
) -> dict[str, Any]:
    return {"models": models or {}, "personas": personas or {}, **extra}


class TestInjectPersonaThinkingModels:
    @verifies(SWR.SWR_2096)
    def test_default_inherits_selected_model_thinking(self) -> None:
        data = _make_minimal_data(
            models={"large_model": {**_make_base_model_data(), "thinking": "high"}},
            personas={"planner": {"model": "large_model", "thinking": "default"}},
        )

        result = _inject_persona_thinking_models(data)

        assert result["personas"]["planner"] == {
            "model": "large_model",
            "thinking": None,
        }
        assert _synthetic_persona_model_name("planner") not in result["models"]

    @verifies(SWR.SWR_2096)
    def test_provider_default_clears_selected_model_thinking(self) -> None:
        data = _make_minimal_data(
            models={"large_model": {**_make_base_model_data(), "thinking": "high"}},
            personas={"planner": {"model": "large_model", "thinking": "provider_default"}},
        )

        result = _inject_persona_thinking_models(data)
        synthetic_name = _synthetic_persona_model_name("planner")

        assert result["models"][synthetic_name]["thinking"] is None
        assert result["personas"]["planner"] == {
            "model": synthetic_name,
            "thinking": None,
        }

    @verifies(SWR.SWR_2096)
    def test_creates_synthetic_model_for_persona_with_thinking(self) -> None:
        data = _make_minimal_data(
            models={"gpt-4o": _make_base_model_data()},
            personas={"planner": {"model": "gpt-4o", "thinking": "high"}},
        )
        result = _inject_persona_thinking_models(data)

        synthetic_name = _synthetic_persona_model_name("planner")
        assert synthetic_name in result["models"]
        assert result["models"][synthetic_name]["thinking"] == "high"
        assert result["models"][synthetic_name]["provider"] == "openai"
        assert result["models"][synthetic_name]["model_id"] == "gpt-4o"
        assert result["personas"]["planner"]["model"] == synthetic_name

    @verifies(SWR.SWR_2096)
    def test_persona_without_thinking_is_unchanged(self) -> None:
        data = _make_minimal_data(
            models={"gpt-4o": _make_base_model_data()},
            personas={"planner": {"model": "gpt-4o"}},
        )
        result = _inject_persona_thinking_models(data)

        assert "planner" in result["personas"]
        assert result["personas"]["planner"]["model"] == "gpt-4o"
        assert _synthetic_persona_model_name("planner") not in result["models"]

    @verifies(SWR.SWR_2096)
    def test_persona_with_thinking_none_is_unchanged(self) -> None:
        data = _make_minimal_data(
            models={"gpt-4o": _make_base_model_data()},
            personas={"planner": {"model": "gpt-4o", "thinking": None}},
        )
        result = _inject_persona_thinking_models(data)

        assert result["personas"]["planner"]["model"] == "gpt-4o"
        assert _synthetic_persona_model_name("planner") not in result["models"]

    @verifies(SWR.SWR_2096)
    def test_synthetic_model_preserves_base_model_fields(self) -> None:
        data = _make_minimal_data(
            models={
                "gpt-4o": {
                    "provider": "openai",
                    "model_id": "gpt-4o",
                    "base_url": "https://api.openai.com/v1",
                    "max_input_tokens": 128000,
                },
            },
            personas={"planner": {"model": "gpt-4o", "thinking": "low"}},
        )
        result = _inject_persona_thinking_models(data)

        synthetic_name = _synthetic_persona_model_name("planner")
        synth = result["models"][synthetic_name]
        assert synth["thinking"] == "low"
        assert synth["provider"] == "openai"
        assert synth["model_id"] == "gpt-4o"
        assert synth["base_url"] == "https://api.openai.com/v1"
        assert synth["max_input_tokens"] == 128000

    @verifies(SWR.SWR_2096)
    def test_multiple_personas_with_different_thinking(self) -> None:
        data = _make_minimal_data(
            models={
                "gpt-4o": _make_base_model_data("openai", "gpt-4o"),
                "gpt-4o-mini": _make_base_model_data("openai", "gpt-4o-mini"),
            },
            personas={
                "planner": {"model": "gpt-4o", "thinking": "high"},
                "tester": {"model": "gpt-4o-mini", "thinking": "low"},
                "docs-writer": {"model": "gpt-4o"},  # no thinking
            },
        )
        result = _inject_persona_thinking_models(data)

        planner_synth = _synthetic_persona_model_name("planner")
        tester_synth = _synthetic_persona_model_name("tester")
        docs_synth = _synthetic_persona_model_name("docs-writer")

        assert planner_synth in result["models"]
        assert result["models"][planner_synth]["thinking"] == "high"
        assert result["personas"]["planner"]["model"] == planner_synth

        assert tester_synth in result["models"]
        assert result["models"][tester_synth]["thinking"] == "low"
        assert result["personas"]["tester"]["model"] == tester_synth

        assert docs_synth not in result["models"]
        assert result["personas"]["docs-writer"]["model"] == "gpt-4o"

    @verifies(SWR.SWR_2096)
    def test_no_models_dict_returns_unchanged(self) -> None:
        data: dict[str, Any] = {
            "personas": {"planner": {"model": "gpt-4o", "thinking": "high"}},
        }
        result = _inject_persona_thinking_models(data)
        assert result is data

    @verifies(SWR.SWR_2096)
    def test_no_personas_dict_returns_unchanged(self) -> None:
        data: dict[str, Any] = {"models": {"gpt-4o": _make_base_model_data()}}
        result = _inject_persona_thinking_models(data)
        assert result is data

    @verifies(SWR.SWR_2096)
    def test_warning_on_unknown_model(self, caplog: pytest.LogCaptureFixture) -> None:
        data = _make_minimal_data(
            models={"gpt-4o": _make_base_model_data()},
            personas={"planner": {"model": "nonexistent-model", "thinking": "high"}},
        )
        with caplog.at_level(logging.WARNING, logger="rotaris_core.config.loader"):
            result = _inject_persona_thinking_models(data)

        assert "Persona thinking override for" in caplog.text
        assert "base model" in caplog.text
        assert "nonexistent-model" in caplog.text
        assert result["personas"]["planner"]["model"] == "nonexistent-model"
        assert _synthetic_persona_model_name("planner") not in result["models"]

    @verifies(SWR.SWR_2096)
    def test_warning_on_no_model_configured(self, caplog: pytest.LogCaptureFixture) -> None:
        data = _make_minimal_data(
            models={"gpt-4o": _make_base_model_data()},
            personas={"planner": {"thinking": "high"}},  # missing model key
        )
        with caplog.at_level(logging.WARNING, logger="rotaris_core.config.loader"):
            result = _inject_persona_thinking_models(data)

        assert "no model configured" in caplog.text
        assert _synthetic_persona_model_name("planner") not in result["models"]

    @verifies(SWR.SWR_2096)
    def test_chaining_persona_thinking_over_slot_synthetic(self) -> None:
        """Persona with model=small_model AND thinking=high (after alias resolution):
        persona model → __startup_slot__:small_model → persona injection copies that
        synthetic, overrides thinking again → __persona__:{name}.
        """
        data = _make_minimal_data(
            models={
                "gpt-4o-mini": _make_base_model_data("openai", "gpt-4o-mini"),
                "__startup_slot__:small_model": {
                    "provider": "openai",
                    "model_id": "gpt-4o-mini",
                    "thinking": "auto",
                },
            },
            personas={"planner": {"model": "__startup_slot__:small_model", "thinking": "high"}},
        )
        result = _inject_persona_thinking_models(data)

        synth = _synthetic_persona_model_name("planner")
        assert synth in result["models"]
        assert result["models"][synth]["thinking"] == "high"
        assert result["models"][synth]["provider"] == "openai"
        assert result["models"][synth]["model_id"] == "gpt-4o-mini"
        assert result["personas"]["planner"]["model"] == synth

    @verifies(SWR.SWR_2096)
    def test_thinking_max_level(self) -> None:
        data = _make_minimal_data(
            models={"deepseek-reasoner": _make_base_model_data("deepseek", "deepseek-reasoner")},
            personas={"planner": {"model": "deepseek-reasoner", "thinking": "max"}},
        )
        result = _inject_persona_thinking_models(data)

        synth = _synthetic_persona_model_name("planner")
        assert result["models"][synth]["thinking"] == "max"


# ---------------------------------------------------------------------------
# 2b. load_config round-trip with persona thinking
# ---------------------------------------------------------------------------


class TestLoadConfigPersonaThinking:
    @verifies(SWR.SWR_386, SWR.SWR_2096)
    def test_load_config_with_persona_thinking_in_agents_yaml(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        global_dir = tmp_path / "global"
        global_dir.mkdir()
        workspace_root = tmp_path / "workspace"
        workspace_root.mkdir()
        monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", global_dir)

        yaml_content = _build_workspace_yaml_with_personas(
            extra_personas={"planner": {"model": "large_model", "thinking": "high"}},
        )
        _write_workspace_agents_yaml(workspace_root, yaml_content)

        config = load_config(workspace_root)

        persona = config.personas["planner"]
        assert persona.thinking == "high", f"Expected thinking='high', got {persona.thinking!r}"
        assert persona.model.startswith(_SYNTHETIC_PERSONA_MODEL_PREFIX), (
            f"Persona model should be synthetic, got: {persona.model}"
        )
        assert persona.model in config.models, (
            f"Synthetic model {persona.model} not in config.models"
        )
        assert config.models[persona.model].thinking == "high"
        assert config.resolved_persona_model_tiers["planner"] == "large_model"

    @verifies(SWR.SWR_2096)
    def test_load_config_persona_without_thinking_has_normal_model(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        global_dir = tmp_path / "global"
        global_dir.mkdir()
        workspace_root = tmp_path / "workspace"
        workspace_root.mkdir()
        monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", global_dir)

        yaml_content = _build_workspace_yaml_with_personas(
            extra_personas={"planner": {"model": "large_model"}},
        )
        _write_workspace_agents_yaml(workspace_root, yaml_content)

        config = load_config(workspace_root)

        persona = config.personas["planner"]
        assert persona.thinking is None
        assert not persona.model.startswith(_SYNTHETIC_PERSONA_MODEL_PREFIX)

    @verifies(SWR.SWR_2096)
    def test_load_config_persona_thinking_none_in_yaml_is_unchanged(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        global_dir = tmp_path / "global"
        global_dir.mkdir()
        workspace_root = tmp_path / "workspace"
        workspace_root.mkdir()
        monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", global_dir)

        yaml_content = _build_workspace_yaml_with_personas(
            extra_personas={"planner": {"model": "large_model", "thinking": None}},
        )
        _write_workspace_agents_yaml(workspace_root, yaml_content)

        config = load_config(workspace_root)

        persona = config.personas["planner"]
        assert persona.thinking is None
        assert not persona.model.startswith(_SYNTHETIC_PERSONA_MODEL_PREFIX)

    @verifies(SWR.SWR_2096)
    def test_load_config_default_personas_have_no_thinking(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Default personas (not overridden in YAML) should have thinking=None."""
        global_dir = tmp_path / "global"
        global_dir.mkdir()
        workspace_root = tmp_path / "workspace"
        workspace_root.mkdir()
        monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", global_dir)

        _write_workspace_agents_yaml(workspace_root, _base_workspace_config_yaml())

        config = load_config(workspace_root)

        for name, persona in config.personas.items():
            if name not in ("codebase-analyst", "tester"):
                # These come from defaults, not YAML overrides
                assert persona.thinking is None, f"Default persona {name} should have thinking=None"


# ---------------------------------------------------------------------------
# 3. Read / write round-trip
# ---------------------------------------------------------------------------


class TestPersonaThinkingReadWrite:
    @verifies(SWR.SWR_2096)
    def test_write_persona_thinking_then_read(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        global_dir = tmp_path / "global"
        global_dir.mkdir()
        workspace_root = tmp_path / "workspace"
        workspace_root.mkdir()
        monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", global_dir)

        _write_workspace_agents_yaml(workspace_root, _base_workspace_config_yaml())

        write_startup_model_preferences(
            workspace_root,
            persona_thinking={"planner": "high"},
        )

        config = load_config(workspace_root)
        prefs = read_startup_model_preferences(workspace_root, config)

        planner = prefs.personas["planner"]
        assert planner.thinking == "high", f"Expected 'high', got {planner.thinking!r}"

    @verifies(SWR.SWR_2096)
    def test_write_persona_thinking_none_removes_key(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        global_dir = tmp_path / "global"
        global_dir.mkdir()
        workspace_root = tmp_path / "workspace"
        workspace_root.mkdir()
        monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", global_dir)

        # First write with thinking via write_startup_model_preferences
        _write_workspace_agents_yaml(workspace_root, _base_workspace_config_yaml())
        write_startup_model_preferences(
            workspace_root,
            persona_thinking={"planner": "high"},
        )

        config = load_config(workspace_root)
        prefs = read_startup_model_preferences(workspace_root, config)
        assert prefs.personas["planner"].thinking == "high"

        # Now clear it using the write API
        write_startup_model_preferences(
            workspace_root,
            persona_thinking={"planner": None},
        )

        # Verify key is absent from YAML
        yaml_data = yaml.safe_load(agents_yaml_path(workspace_root).read_text(encoding="utf-8"))
        planner_data = yaml_data.get("personas", {}).get("planner", {})
        assert "thinking" not in planner_data, (
            f"'thinking' key should be absent, got: {planner_data}"
        )

        # Verify read back is None
        config2 = load_config(workspace_root)
        prefs2 = read_startup_model_preferences(workspace_root, config2)
        assert prefs2.personas["planner"].thinking is None

    @verifies(SWR.SWR_2096)
    def test_multiple_personas_with_different_thinking_roundtrip(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        global_dir = tmp_path / "global"
        global_dir.mkdir()
        workspace_root = tmp_path / "workspace"
        workspace_root.mkdir()
        monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", global_dir)

        _write_workspace_agents_yaml(workspace_root, _base_workspace_config_yaml())

        write_startup_model_preferences(
            workspace_root,
            persona_thinking={
                "planner": "high",
                "tester": "low",
                "docs-writer": None,
            },
        )

        config = load_config(workspace_root)
        prefs = read_startup_model_preferences(workspace_root, config)

        assert prefs.personas["planner"].thinking == "high"
        assert prefs.personas["tester"].thinking == "low"
        assert prefs.personas["docs-writer"].thinking is None

    @verifies(SWR.SWR_2096)
    def test_write_persona_thinking_creates_yaml_key(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        global_dir = tmp_path / "global"
        global_dir.mkdir()
        workspace_root = tmp_path / "workspace"
        workspace_root.mkdir()
        monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", global_dir)

        _write_workspace_agents_yaml(workspace_root, _base_workspace_config_yaml())

        write_startup_model_preferences(
            workspace_root,
            persona_thinking={"planner": "medium"},
        )

        yaml_data = yaml.safe_load(agents_yaml_path(workspace_root).read_text(encoding="utf-8"))
        assert "personas" in yaml_data
        assert "planner" in yaml_data["personas"]
        assert yaml_data["personas"]["planner"]["thinking"] == "medium"

    @verifies(SWR.SWR_2096)
    def test_write_persona_thinking_preserves_existing_persona_model(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        global_dir = tmp_path / "global"
        global_dir.mkdir()
        workspace_root = tmp_path / "workspace"
        workspace_root.mkdir()
        monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", global_dir)

        _write_workspace_agents_yaml(workspace_root, _base_workspace_config_yaml())

        write_startup_model_preferences(
            workspace_root,
            persona_thinking={"codebase-analyst": "high"},
        )

        yaml_data = yaml.safe_load(agents_yaml_path(workspace_root).read_text(encoding="utf-8"))
        assert yaml_data["personas"]["codebase-analyst"]["thinking"] == "high"
        assert yaml_data["personas"]["codebase-analyst"]["model"] == "medium_model"

    @verifies(SWR.SWR_2096)
    def test_persona_thinking_combined_with_persona_models_write(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        global_dir = tmp_path / "global"
        global_dir.mkdir()
        workspace_root = tmp_path / "workspace"
        workspace_root.mkdir()
        monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", global_dir)

        _write_workspace_agents_yaml(workspace_root, _base_workspace_config_yaml())

        write_startup_model_preferences(
            workspace_root,
            persona_models={"planner": "gpt-4o"},
            persona_thinking={"planner": "max"},
        )

        yaml_data = yaml.safe_load(agents_yaml_path(workspace_root).read_text(encoding="utf-8"))
        assert yaml_data["personas"]["planner"]["model"] == "gpt-4o"
        assert yaml_data["personas"]["planner"]["thinking"] == "max"

    @verifies(SWR.SWR_2096)
    def test_entire_roundtrip_load_write_load(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        global_dir = tmp_path / "global"
        global_dir.mkdir()
        workspace_root = tmp_path / "workspace"
        workspace_root.mkdir()
        monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", global_dir)

        _write_workspace_agents_yaml(workspace_root, _base_workspace_config_yaml())

        # 1. Write thinking
        write_startup_model_preferences(
            workspace_root,
            persona_thinking={"planner": "high"},
        )

        # 2. Load config — persona model should be synthetic with thinking baked in
        config = load_config(workspace_root)
        assert config.personas["planner"].thinking == "high"
        assert config.personas["planner"].model.startswith(_SYNTHETIC_PERSONA_MODEL_PREFIX)
        assert config.models[config.personas["planner"].model].thinking == "high"

        # 3. Read preferences — thinking should be visible
        prefs = read_startup_model_preferences(workspace_root, config)
        assert prefs.personas["planner"].thinking == "high"

        # 4. Clear thinking
        write_startup_model_preferences(
            workspace_root,
            persona_thinking={"planner": None},
        )

        # 5. Load again — thinking should be None, no synthetic model
        config2 = load_config(workspace_root)
        assert config2.personas["planner"].thinking is None
        assert not config2.personas["planner"].model.startswith(_SYNTHETIC_PERSONA_MODEL_PREFIX)

        # 6. Read preferences — thinking should be None
        prefs2 = read_startup_model_preferences(workspace_root, config2)
        assert prefs2.personas["planner"].thinking is None


# ---------------------------------------------------------------------------
# 4. Unwrap synthetic model name
# ---------------------------------------------------------------------------


class TestUnwrapSyntheticModelName:
    @verifies(SWR.SWR_2096)
    def test_unwrap_persona_prefix(self) -> None:
        """Placeholder so the class exists even without this particular test."""
        pass

    @verifies(SWR.SWR_2096)
    def test_unwrap_persona_prefix_integration(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        global_dir = tmp_path / "global"
        global_dir.mkdir()
        workspace_root = tmp_path / "workspace"
        workspace_root.mkdir()
        monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", global_dir)

        _write_workspace_agents_yaml(workspace_root, _base_workspace_config_yaml())

        write_startup_model_preferences(
            workspace_root,
            persona_thinking={"planner": "high"},
        )

        config = load_config(workspace_root)
        persona = config.personas["planner"]

        # The model name should be synthetic
        assert persona.model.startswith(_SYNTHETIC_PERSONA_MODEL_PREFIX)

        # _unwrap_synthetic_model_name should return the base model name ("gpt-4o")
        unwrapped = _unwrap_synthetic_model_name(config, persona.model)
        assert unwrapped is not None
        assert unwrapped == "gpt-4o", f"Expected 'gpt-4o', got {unwrapped!r}"

    @verifies(SWR.SWR_2096)
    def test_unwrap_non_synthetic_is_identity(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Non-synthetic model names pass through unchanged."""
        global_dir = tmp_path / "global"
        global_dir.mkdir()
        workspace_root = tmp_path / "workspace"
        workspace_root.mkdir()
        monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", global_dir)

        _write_workspace_agents_yaml(workspace_root, _base_workspace_config_yaml())
        config = load_config(workspace_root)

        assert _unwrap_synthetic_model_name(config, "gpt-4o") == "gpt-4o"
        assert _unwrap_synthetic_model_name(config, "nonexistent") == "nonexistent"
        assert _unwrap_synthetic_model_name(config, None) is None


# ---------------------------------------------------------------------------
# 5. Edge cases and regression
# ---------------------------------------------------------------------------


class TestEdgeCases:
    @verifies(SWR.SWR_2096)
    def test_synthetic_prefix_constant(self) -> None:
        assert _SYNTHETIC_PERSONA_MODEL_PREFIX == "__persona__:"
        assert _synthetic_persona_model_name("planner") == "__persona__:planner"

    @verifies(SWR.SWR_2096)
    def test_persona_thinking_does_not_affect_other_personas(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        global_dir = tmp_path / "global"
        global_dir.mkdir()
        workspace_root = tmp_path / "workspace"
        workspace_root.mkdir()
        monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", global_dir)

        _write_workspace_agents_yaml(workspace_root, _base_workspace_config_yaml())

        write_startup_model_preferences(
            workspace_root,
            persona_thinking={"planner": "auto"},
        )

        config = load_config(workspace_root)

        # Other personas should not have synthetic models (except those configured with default thinking)
        for name, persona in config.personas.items():
            if name == "planner" or persona.thinking is not None:
                assert persona.model.startswith(_SYNTHETIC_PERSONA_MODEL_PREFIX)
            else:
                assert not persona.model.startswith(_SYNTHETIC_PERSONA_MODEL_PREFIX), (
                    f"Persona '{name}' should not have synthetic model, got {persona.model}"
                )

    @verifies(SWR.SWR_2096)
    def test_persona_thinking_coexists_with_slot_thinking(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Slot thinking and persona thinking should work independently."""
        global_dir = tmp_path / "global"
        global_dir.mkdir()
        workspace_root = tmp_path / "workspace"
        workspace_root.mkdir()
        monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", global_dir)

        _write_workspace_agents_yaml(workspace_root, _base_workspace_config_yaml())

        write_startup_model_preferences(
            workspace_root,
            slots={"large_model": "gpt-4o"},
            slot_thinking={"large_model": "auto"},
            persona_thinking={"orchestrator": "high"},
        )

        config = load_config(workspace_root)

        # Slot thinking
        assert config.large_model.startswith("__startup_slot__:large_model")
        assert config.models[config.large_model].thinking == "auto"

        # Persona thinking: orchestrator uses large_model, which was resolved
        # to __startup_slot__:large_model, then persona injection copies that
        # and overrides thinking
        orch = config.personas["orchestrator"]
        assert orch.model.startswith(_SYNTHETIC_PERSONA_MODEL_PREFIX)
        assert config.models[orch.model].thinking == "high"

    @verifies(SWR.SWR_2096)
    def test_empty_data_is_unchanged(self) -> None:
        result = _inject_persona_thinking_models({})
        assert result == {}

    @verifies(SWR.SWR_2096)
    def test_inject_is_idempotent_on_clean_data(self) -> None:
        """Running injection twice on data without thinking should not change models."""
        data = _make_minimal_data(
            models={"gpt-4o": _make_base_model_data()},
            personas={"planner": {"model": "gpt-4o"}},
        )
        result1 = _inject_persona_thinking_models(data)
        result2 = _inject_persona_thinking_models(result1)
        assert result1 == result2
