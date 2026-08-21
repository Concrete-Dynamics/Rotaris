from __future__ import annotations

from pathlib import Path
from typing import Literal

import pytest
from pydantic import SecretStr, ValidationError

from rotaris_core.config.schema import (
    CircuitBreakerConfig,
    MCPServerConfig,
    ModelConfig,
    PersonaConfig,
    RotarisConfig,
    RuntimePolicy,
)
from rotaris_core.reqtocode import SWR, verifies

ThinkingLevel = Literal["auto", "low", "medium", "high", "max"]
THINKING_LEVELS: tuple[ThinkingLevel, ...] = ("auto", "low", "medium", "high", "max")


@verifies(SWR.SWR_1709)
def test_mcp_server_config_valid() -> None:
    config = MCPServerConfig(command="playwright-mcp", args=["--headless"], env={"A": "B"})

    assert config.command == "playwright-mcp"
    assert config.args == ["--headless"]
    assert config.env == {"A": "B"}


@verifies(SWR.SWR_1709)
def test_mcp_server_config_stdio_default_type() -> None:
    config = MCPServerConfig(command="npx")

    assert config.type == "stdio"


@verifies(SWR.SWR_1709)
def test_mcp_server_config_stdio_requires_command() -> None:
    with pytest.raises(ValidationError):
        MCPServerConfig(type="stdio")


@verifies(SWR.SWR_1709)
def test_mcp_server_config_http_requires_url() -> None:
    with pytest.raises(ValidationError):
        MCPServerConfig(type="http")


@verifies(SWR.SWR_1709)
def test_mcp_server_config_sse_requires_url() -> None:
    with pytest.raises(ValidationError):
        MCPServerConfig(type="sse")


@verifies(SWR.SWR_1709)
def test_mcp_server_config_http_valid() -> None:
    config = MCPServerConfig(type="http", url="https://x.com")

    assert config.type == "http"
    assert config.url == "https://x.com"


@verifies(SWR.SWR_1709)
def test_mcp_server_config_sse_valid() -> None:
    config = MCPServerConfig(
        type="sse",
        url="https://x.com/sse",
        headers={"Auth": "Bearer x"},
    )

    assert config.type == "sse"
    assert config.url == "https://x.com/sse"
    assert config.headers == {"Auth": "Bearer x"}


@verifies(SWR.SWR_1711)
def test_mcp_server_config_cwd_field() -> None:
    config = MCPServerConfig(command="x", cwd="/tmp")

    assert config.cwd == "/tmp"


@verifies(SWR.SWR_318)
def test_mcp_server_config_legacy_yaml_still_parses() -> None:
    config = MCPServerConfig.model_validate({"command": "npx", "args": ["-y"], "env": {"K": "V"}})

    assert config.command == "npx"
    assert config.args == ["-y"]
    assert config.env == {"K": "V"}


@verifies(SWR.SWR_1708)
def test_rotaris_config_has_mcp_server_sources() -> None:
    assert RotarisConfig().mcp_server_sources == {}


@verifies(SWR.SWR_309, SWR.SWR_358)
def test_model_config_valid() -> None:
    config = ModelConfig(
        provider="openai",
        model_id="openai/gpt-4o",
        api_key=SecretStr("super-secret"),
        api_key_env="OPENAI_API_KEY",
        base_url="https://api.openai.com/v1",
        max_input_tokens=128000,
        max_output_tokens=4096,
    )

    assert config.provider == "openai"
    assert config.model_id == "openai/gpt-4o"
    assert config.api_key is not None
    assert config.api_key.get_secret_value() == "super-secret"


@verifies(SWR.SWR_505)
def test_model_config_secret_not_exposed_in_dump() -> None:
    config = ModelConfig(
        provider="openai",
        model_id="openai/gpt-4o",
        api_key=SecretStr("super-secret"),
    )

    dumped = config.model_dump(mode="json")

    assert dumped["api_key"] != "super-secret"


@verifies(SWR.SWR_302)
def test_persona_config_defaults_valid() -> None:
    config = PersonaConfig(name="tester", model="gpt-4o")

    assert config.summary_model is None
    assert config.system_prompt is None
    assert config.system_prompt_file is None
    assert config.tools == []
    assert config.delegates_to == []
    assert config.custom_tools == []
    assert config.mcp_servers == []


@verifies(SWR.SWR_506, SWR.SWR_909)
def test_runtime_policy_defaults() -> None:
    config = RuntimePolicy()

    assert config.max_children == 20
    assert config.max_active_children == 6
    assert config.max_depth == 3
    assert config.child_timeout == 1200
    assert config.model_timeout == 120
    assert config.shell_timeout == 100
    assert config.tool_timeout == 30
    assert config.summary_timeout == 120
    assert config.auto_retries_transient == 1
    assert config.auto_retries_validation == 0
    assert config.allow_outside_workspace is False
    assert config.memory_diagnostics_enabled is False
    assert config.memory_diagnostics_top_frames == 8
    assert config.message_limit is None
    assert RuntimePolicy(message_limit=5).message_limit == 5
    with pytest.raises(ValidationError):
        RuntimePolicy(message_limit=0)


@verifies(SWR.SWR_218, SWR.SWR_219)
def test_circuit_breaker_defaults() -> None:
    config = CircuitBreakerConfig()

    assert config.model == "gpt-4o-mini"
    assert config.timeout_seconds == 20.0
    assert config.activation_mode == "independent"
    assert config.tool_call_threshold == 60
    assert config.message_count_threshold == 60
    assert config.tool_weight == 0.6
    assert config.message_weight == 0.4
    assert config.target_score == 1.0
    assert config.repetition_threshold == 4
    assert config.cycle_threshold == 3


@verifies(SWR.SWR_305, SWR.SWR_318)
def test_rotaris_config_empty_dicts_valid() -> None:
    config = RotarisConfig(
        personas={},
        models={},
        mcp_servers={},
        workspace_root=Path("/tmp/workspace"),
    )

    assert config.personas == {}
    assert config.models == {}
    assert config.mcp_servers == {}
    assert config.workspace_root == Path("/tmp/workspace")


@verifies(SWR.SWR_316)
@pytest.mark.parametrize(
    ("model_class", "data"),
    [
        (MCPServerConfig, {"command": 123}),
        (ModelConfig, {"provider": "openai", "model_id": 123}),
        (PersonaConfig, {"name": "tester", "model": ["gpt-4o"]}),
        (RuntimePolicy, {"max_children": "many"}),
        (CircuitBreakerConfig, {"activation_mode": "both"}),
        (RotarisConfig, {"personas": [], "models": {}, "mcp_servers": {}}),
    ],
)
def test_invalid_types_raise_validation_error(
    model_class: type[object],
    data: dict[str, object],
) -> None:
    with pytest.raises(ValidationError):
        model_class(**data)


@verifies(SWR.SWR_861)
@pytest.mark.parametrize("level", THINKING_LEVELS)
def test_model_config_thinking_levels(level: ThinkingLevel) -> None:
    config = ModelConfig(provider="anthropic", model_id="claude-sonnet-4", thinking=level)

    assert config.thinking == level


@verifies(SWR.SWR_861)
def test_model_config_thinking_defaults_to_none() -> None:
    config = ModelConfig(provider="anthropic", model_id="claude-sonnet-4")

    assert config.thinking is None


@verifies(SWR.SWR_861)
def test_model_config_thinking_bool_true_coerces_to_high() -> None:
    config = ModelConfig.model_validate(
        {"provider": "anthropic", "model_id": "claude-sonnet-4", "thinking": True},
    )

    assert config.thinking == "high"


@verifies(SWR.SWR_861)
def test_model_config_thinking_bool_false_coerces_to_none() -> None:
    config = ModelConfig.model_validate(
        {"provider": "anthropic", "model_id": "claude-sonnet-4", "thinking": False},
    )

    assert config.thinking is None


@verifies(SWR.SWR_861)
def test_model_config_thinking_invalid_level_raises() -> None:
    with pytest.raises(ValidationError):
        ModelConfig.model_validate(
            {"provider": "anthropic", "model_id": "claude-sonnet-4", "thinking": "ultra"},
        )


@verifies(SWR.SWR_920)
def test_max_parallel_defaults_to_none_for_non_deepseek() -> None:
    """Non-DeepSeek providers get max_parallel=None (unlimited)."""
    config = ModelConfig.model_validate(
        {"provider": "openai", "model_id": "gpt-4o"},
    )
    assert config.max_parallel is None


@verifies(SWR.SWR_920)
def test_max_parallel_defaults_to_3_for_deepseek() -> None:
    """DeepSeek provider defaults to max_parallel=3."""
    config = ModelConfig.model_validate(
        {"provider": "deepseek", "model_id": "deepseek-v4-pro"},
    )
    assert config.max_parallel == 3


@verifies(SWR.SWR_920)
def test_max_parallel_explicit_overrides_default_for_deepseek() -> None:
    """Explicit max_parallel=10 survives the DeepSeek default validator."""
    config = ModelConfig.model_validate(
        {"provider": "deepseek", "model_id": "deepseek-v4-pro", "max_parallel": 10},
    )
    assert config.max_parallel == 10


@verifies(SWR.SWR_920)
def test_max_parallel_must_be_at_least_1() -> None:
    """max_parallel=0 raises validation error due to ge=1."""
    with pytest.raises(ValidationError):
        ModelConfig.model_validate(
            {"provider": "deepseek", "model_id": "deepseek-v4-pro", "max_parallel": 0},
        )


@verifies(SWR.SWR_837)
def test_per_model_pricing_is_optional_and_defaults_to_none() -> None:
    """Models without pricing metadata keep the untouched LiteLLM pricing path."""
    config = ModelConfig.model_validate({"provider": "openai", "model_id": "gpt-4o"})

    assert config.input_cost_per_token is None
    assert config.output_cost_per_token is None


@verifies(SWR.SWR_837)
def test_per_model_pricing_accepts_prompt_and_completion_prices() -> None:
    config = ModelConfig.model_validate(
        {
            "provider": "openai",
            "model_id": "Qwen/Qwen3.6-35B-A3B",
            "input_cost_per_token": 0.0000004,
            "output_cost_per_token": 0.0000012,
        },
    )

    assert config.input_cost_per_token == 0.0000004
    assert config.output_cost_per_token == 0.0000012


@verifies(SWR.SWR_837)
@pytest.mark.parametrize("field", ["input_cost_per_token", "output_cost_per_token"])
def test_per_model_pricing_rejects_negative_prices(field: str) -> None:
    with pytest.raises(ValidationError):
        ModelConfig.model_validate(
            {"provider": "openai", "model_id": "gpt-4o", field: -0.1},
        )
