from __future__ import annotations

import os
import tempfile
from contextlib import suppress
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any

import yaml

from rotaris_core.config.bootstrap import write_minimal_agents_yaml
from rotaris_core.config.defaults import DEFAULT_PERSONAS, LEGACY_PERSONA_ALIASES
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from rotaris_core.config.schema import RotarisConfig, ThinkingLevel

STARTUP_MODEL_FIELDS: tuple[str, ...] = (
    "default_summary_model",
    "improvement_collector_model",
    "gatekeeper_model",
    "small_model",
    "medium_model",
    "large_model",
    "fallback_model",
)
PERSONA_MODEL_ALIAS_FIELDS: tuple[str, ...] = ("small_model", "medium_model", "large_model")
STARTUP_MODEL_THINKING_FIELDS: dict[str, str] = {
    "default_summary_model": "default_summary_model_thinking",
    "improvement_collector_model": "improvement_collector_model_thinking",
    "gatekeeper_model": "gatekeeper_model_thinking",
    "small_model": "small_model_thinking",
    "medium_model": "medium_model_thinking",
    "large_model": "large_model_thinking",
    "fallback_model": "fallback_model_thinking",
}
_SYNTHETIC_STARTUP_MODEL_PREFIX = "__startup_slot__:"
_SYNTHETIC_PERSONA_MODEL_PREFIX = "__persona__:"


def _visible_thinking(value: Any) -> Any:
    """Hide removed legacy ``auto`` effort as provider default."""
    return None if value == "auto" else value


@dataclass(frozen=True)
class PersonaModelPreference:
    persona_name: str
    configured_model: str | None
    resolved_model: str
    inherited: bool
    default_model: str | None
    thinking: ThinkingLevel | None = None


@dataclass(frozen=True)
class StartupModelPreferences:
    slots: dict[str, str | None]
    slot_thinking: dict[str, ThinkingLevel | None]
    personas: dict[str, PersonaModelPreference]


def agents_yaml_path(workspace_root: Path) -> Path:
    return workspace_root / ".rotaris" / "agents.yaml"


def _canonicalize_persona_name(name: str) -> str:
    return LEGACY_PERSONA_ALIASES.get(name, name)


def _normalize_raw_personas(raw_personas: object) -> dict[str, Any]:
    if not isinstance(raw_personas, dict):
        return {}

    normalized: dict[str, Any] = {}
    for raw_name, raw_persona in raw_personas.items():
        key = _canonicalize_persona_name(raw_name) if isinstance(raw_name, str) else raw_name
        normalized[key] = raw_persona
    return normalized


def _apply_slot_overrides(data: dict[str, Any], slots: dict[str, str | None]) -> None:
    for field_name, model_name in slots.items():
        if field_name not in STARTUP_MODEL_FIELDS:
            raise ValueError(f"Unknown startup model field: {field_name}")
        data[field_name] = model_name


def _apply_slot_thinking_overrides(
    data: dict[str, Any],
    slot_thinking: dict[str, ThinkingLevel | None],
) -> None:
    for slot_name, thinking in slot_thinking.items():
        thinking_field = STARTUP_MODEL_THINKING_FIELDS.get(slot_name)
        if thinking_field is None:
            raise ValueError(f"Unknown startup model thinking field for slot: {slot_name}")
        if thinking is None:
            data.pop(thinking_field, None)
            continue
        data[thinking_field] = thinking


def _require_persona_mapping(data: dict[str, Any]) -> dict[str, Any]:
    personas = data.setdefault("personas", {})
    if not isinstance(personas, dict):
        raise ValueError("agents.yaml personas must be a mapping")
    return personas


def _apply_persona_model_override(
    personas: dict[str, Any],
    persona_name: str,
    model_name: str | None,
) -> None:
    canonical_name = _canonicalize_persona_name(persona_name)
    current = personas.get(canonical_name, {})
    if not isinstance(current, dict):
        raise ValueError(f"agents.yaml persona '{canonical_name}' must be a mapping")

    updated = dict(current)
    if model_name is None:
        updated.pop("model", None)
        if updated:
            personas[canonical_name] = updated
        else:
            personas.pop(canonical_name, None)
        return

    updated["model"] = model_name
    personas[canonical_name] = updated


def _apply_persona_thinking_override(
    personas: dict[str, Any],
    persona_name: str,
    thinking: ThinkingLevel | None,
) -> None:
    canonical_name = _canonicalize_persona_name(persona_name)
    current = personas.get(canonical_name, {})
    if not isinstance(current, dict):
        raise ValueError(f"agents.yaml persona '{canonical_name}' must be a mapping")

    updated = dict(current)
    if thinking is None:
        updated.pop("thinking", None)
        if updated:
            personas[canonical_name] = updated
        else:
            personas.pop(canonical_name, None)
        return

    updated["thinking"] = thinking
    personas[canonical_name] = updated


def _drop_legacy_persona_aliases(personas: dict[str, Any]) -> None:
    for legacy_name, canonical_name in LEGACY_PERSONA_ALIASES.items():
        if canonical_name in personas:
            personas.pop(legacy_name, None)


def _unwrap_synthetic_model_name(
    config: RotarisConfig, model_name: str | None, *, unwrap_slot: bool = True
) -> str | None:
    if model_name is None:
        return None

    if not model_name.startswith(_SYNTHETIC_PERSONA_MODEL_PREFIX) and (
        not unwrap_slot or not model_name.startswith(_SYNTHETIC_STARTUP_MODEL_PREFIX)
    ):
        return model_name

    synthetic_cfg = config.models.get(model_name)
    if synthetic_cfg is None:
        return None

    _synthetic_prefixes = (_SYNTHETIC_STARTUP_MODEL_PREFIX, _SYNTHETIC_PERSONA_MODEL_PREFIX)
    synthetic_dump = synthetic_cfg.model_dump(mode="python", exclude={"thinking"})
    for candidate_name, candidate_cfg in config.models.items():
        if candidate_name.startswith(_synthetic_prefixes):
            continue
        if candidate_cfg.model_dump(mode="python", exclude={"thinking"}) == synthetic_dump:
            return candidate_name

    return synthetic_cfg.model_id


def _resolve_slot_model_value(
    slot_name: str,
    raw_data: dict[str, Any],
    config: RotarisConfig,
    *,
    trail: tuple[str, ...] = (),
) -> str | None:
    raw_value = raw_data.get(slot_name)
    if isinstance(raw_value, str):
        if raw_value in STARTUP_MODEL_FIELDS:
            if raw_value in trail:
                return None
            return _resolve_slot_model_value(raw_value, raw_data, config, trail=(*trail, raw_value))
        return raw_value

    return _unwrap_synthetic_model_name(config, getattr(config, slot_name), unwrap_slot=True)


@traces(SWR.SWR_801, SWR.SWR_810, SWR.SWR_826, SWR.SWR_827, SWR.SWR_860, SWR.SWR_1638)
def read_startup_model_preferences(
    workspace_root: Path,
    config: RotarisConfig,
) -> StartupModelPreferences:
    raw = _load_agents_yaml(agents_yaml_path(workspace_root))
    raw_personas = _normalize_raw_personas(raw.get("personas", {}))

    slots = {field: _resolve_slot_model_value(field, raw, config) for field in STARTUP_MODEL_FIELDS}
    slot_thinking = {
        field: _visible_thinking(getattr(config, STARTUP_MODEL_THINKING_FIELDS[field]))
        for field in STARTUP_MODEL_FIELDS
    }
    personas: dict[str, PersonaModelPreference] = {}
    for persona_name, persona_cfg in config.personas.items():
        raw_persona = raw_personas.get(persona_name, {})
        if not isinstance(raw_persona, dict):
            raw_persona = {}

        configured_model = raw_persona.get("model")
        if configured_model is not None and not isinstance(configured_model, str):
            configured_model = str(configured_model)

        configured_thinking = _visible_thinking(raw_persona.get("thinking"))

        default_model = None
        default_persona = DEFAULT_PERSONAS.get(persona_name)
        if default_persona is not None:
            default_model = default_persona.model

        resolved_model: str | None = persona_cfg.model
        if resolved_model and resolved_model.startswith(_SYNTHETIC_PERSONA_MODEL_PREFIX):
            resolved_model = _unwrap_synthetic_model_name(config, resolved_model, unwrap_slot=False)

        personas[persona_name] = PersonaModelPreference(
            persona_name=persona_name,
            configured_model=configured_model,
            resolved_model=resolved_model or persona_cfg.model,
            inherited=configured_model is None,
            default_model=default_model,
            thinking=configured_thinking,
        )

    return StartupModelPreferences(slots=slots, slot_thinking=slot_thinking, personas=personas)


@traces(SWR.SWR_829, SWR.SWR_830, SWR.SWR_831, SWR.SWR_859, SWR.SWR_1638)
def write_startup_model_preferences(
    workspace_root: Path,
    *,
    slots: dict[str, str | None] | None = None,
    slot_thinking: dict[str, ThinkingLevel | None] | None = None,
    persona_models: dict[str, str | None] | None = None,
    persona_thinking: dict[str, ThinkingLevel | None] | None = None,
) -> Path:
    path = agents_yaml_path(workspace_root)
    if not path.exists():
        write_minimal_agents_yaml(path)

    data = _load_agents_yaml(path)

    if slots:
        _apply_slot_overrides(data, slots)
    if slot_thinking:
        _apply_slot_thinking_overrides(data, slot_thinking)

    if persona_models or persona_thinking:
        personas = _require_persona_mapping(data)

        if persona_models:
            for persona_name, model_name in persona_models.items():
                _apply_persona_model_override(personas, persona_name, model_name)

        if persona_thinking:
            for persona_name, thinking in persona_thinking.items():
                _apply_persona_thinking_override(personas, persona_name, thinking)

        _drop_legacy_persona_aliases(personas)

        if not personas:
            data.pop("personas", None)

    _atomic_write_yaml(path, data)
    return path


def _load_agents_yaml(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}

    try:
        with path.open("r", encoding="utf-8") as handle:
            data = yaml.safe_load(handle)
    except yaml.YAMLError as exc:
        raise ValueError(f"Invalid YAML in {path}: {exc}") from exc

    if data is None:
        return {}
    if not isinstance(data, dict):
        raise ValueError(f"Invalid YAML in {path}: top-level content must be a mapping")
    return data


def _atomic_write_yaml(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    rendered = yaml.safe_dump(data, sort_keys=False, allow_unicode=True)

    fd, tmp = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    os.close(fd)
    tmp_path = Path(tmp)
    try:
        tmp_path.write_text(rendered, encoding="utf-8")
        os.chmod(tmp_path, 0o644)
        os.replace(tmp_path, path)
    finally:
        with suppress(FileNotFoundError):
            tmp_path.unlink()
