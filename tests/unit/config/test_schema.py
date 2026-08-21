from __future__ import annotations

from rotaris_core.config.schema import RotarisConfig
from rotaris_core.reqtocode import SWR, verifies


@verifies(SWR.SWR_316)
def test_rotaris_config_model_alias_defaults() -> None:
    config = RotarisConfig()

    assert config.small_model is None
    assert config.medium_model is None
    assert config.large_model is None
    assert config.fallback_model == config.small_model


@verifies(SWR.SWR_316)
def test_rotaris_config_model_alias_custom_values_via_constructor() -> None:
    config = RotarisConfig(
        small_model="small",
        medium_model="medium",
        large_model="large",
        fallback_model="fallback",
    )

    assert config.small_model == "small"
    assert config.medium_model == "medium"
    assert config.large_model == "large"
    assert config.fallback_model == "fallback"


@verifies(SWR.SWR_316)
def test_rotaris_config_fallback_model_none_defaults_to_small_model() -> None:
    config = RotarisConfig(fallback_model=None)

    assert config.fallback_model == config.small_model


@verifies(SWR.SWR_316)
def test_rotaris_config_model_alias_roundtrip_via_model_dump() -> None:
    config = RotarisConfig(medium_model="medium", fallback_model=None)

    dumped = config.model_dump()
    roundtrip = RotarisConfig.model_validate(dumped)

    assert dumped["medium_model"] == "medium"
    assert dumped["fallback_model"] == config.small_model
    assert roundtrip.medium_model == "medium"
    assert roundtrip.fallback_model == config.small_model


@verifies(SWR.SWR_386)
def test_resolved_persona_model_tiers_are_runtime_only() -> None:
    config = RotarisConfig(
        resolved_persona_model_tiers={"coding-agent": "large_model"},
    )

    assert config.resolved_persona_model_tiers["coding-agent"] == "large_model"
    assert "resolved_persona_model_tiers" not in config.model_dump()


@verifies(SWR.SWR_1167)
def test_tui_keyboard_leader_defaults_to_ctrl_x() -> None:
    config = RotarisConfig()

    assert config.tui.keyboard.leader == "Ctrl+X"
    assert config.tui.keyboard.leader_warning is None


@verifies(SWR.SWR_1167)
def test_tui_keyboard_leader_accepts_custom_ctrl_letter() -> None:
    config = RotarisConfig.model_validate({"tui": {"keyboard": {"leader": "ctrl+g"}}})

    assert config.tui.keyboard.leader == "Ctrl+G"
    assert config.tui.keyboard.leader_warning is None


@verifies(SWR.SWR_1167)
def test_tui_keyboard_leader_invalid_value_falls_back_to_default() -> None:
    config = RotarisConfig.model_validate({"tui": {"keyboard": {"leader": "F12"}}})

    assert config.tui.keyboard.leader == "Ctrl+X"
    assert config.tui.keyboard.leader_warning == "Invalid tui.keyboard.leader 'F12'; using Ctrl+X."
