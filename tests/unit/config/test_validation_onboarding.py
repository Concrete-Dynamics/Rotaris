from __future__ import annotations

from rotaris_core.config.schema import RotarisConfig
from rotaris_core.config.validation import validate_config
from rotaris_core.reqtocode import SWR, verifies


def _config_data(
    *,
    medium_model: str = "known",
    fallback_model: str | None = "known",
    models: dict[str, dict[str, str | None]] | None = None,
) -> dict[str, object]:
    configured_models = (
        {
            "known": {
                "provider": "openai",
                "model_id": "gpt-5-mini",
                "auth_provider": None,
            },
        }
        if models is None
        else models
    )
    return {
        "default_persona": "orchestrator",
        "default_summary_model": "known",
        "small_model": "known",
        "medium_model": medium_model,
        "large_model": "known",
        "fallback_model": fallback_model,
        "models": configured_models,
        "personas": {
            "orchestrator": {
                "name": "orchestrator",
                "model": "known",
                "tools": [],
                "delegates_to": [],
            },
        },
        "compressor": {
            "model": "known",
            "timeout_seconds": 120,
            "default_threshold": 64_000,
            "auto_threshold_ratio": 0.35,
            "chars_per_token": 4,
            "preserve_recent_turns": 4,
        },
    }


@verifies(SWR.SWR_309)
def test_valid_medium_model_reference_returns_no_error() -> None:
    config = RotarisConfig.model_validate(_config_data(medium_model="known"))

    assert validate_config(config) == []


@verifies(SWR.SWR_309)
def test_unknown_medium_model_error_mentions_field_and_name() -> None:
    config = RotarisConfig.model_validate(_config_data(medium_model="doesnotexist"))

    errors = validate_config(config)

    assert any("medium_model" in error.lower() and "doesnotexist" in error for error in errors)


@verifies(SWR.SWR_309)
def test_fallback_model_none_returns_no_error() -> None:
    config = RotarisConfig.model_validate(_config_data(fallback_model=None))

    assert validate_config(config) == []


@verifies(SWR.SWR_309)
def test_unknown_fallback_model_error_mentions_field_and_name() -> None:
    config = RotarisConfig.model_validate(_config_data(fallback_model="missing"))

    errors = validate_config(config)

    assert any("fallback_model" in error.lower() and "missing" in error for error in errors)


@verifies(SWR.SWR_309)
def test_empty_models_error_guides_user_to_login() -> None:
    config = RotarisConfig.model_validate(_config_data(models={}))

    errors = validate_config(config)

    assert any("Run 'rotaris-cli login'" in error for error in errors)


@verifies(SWR.SWR_309)
def test_project_snapshot_bridge_models_allow_quickstart_agents_yaml() -> None:
    config = RotarisConfig.model_validate(
        _config_data(
            medium_model="copilot-gpt5",
            fallback_model=None,
            models={
                "copilot-gpt5": {
                    "provider": "openai-compatible",
                    "model_id": "gpt-5",
                    "auth_provider": "copilot",
                },
            },
        )
        | {
            "default_summary_model": "copilot-gpt5",
            "small_model": "copilot-gpt5",
            "large_model": "copilot-gpt5",
            "personas": {
                "orchestrator": {
                    "name": "orchestrator",
                    "model": "copilot-gpt5",
                    "tools": [],
                    "delegates_to": [],
                },
            },
            "compressor": {
                "model": "copilot-gpt5",
                "timeout_seconds": 120,
                "default_threshold": 120_000,
                "auto_threshold_ratio": 0.6,
                "chars_per_token": 4,
                "preserve_recent_turns": 4,
            },
        },
    )

    assert validate_config(config) == []


@verifies(SWR.SWR_309)
def test_all_valid_returns_empty_list() -> None:
    config = RotarisConfig.model_validate(_config_data())

    assert validate_config(config) == []
