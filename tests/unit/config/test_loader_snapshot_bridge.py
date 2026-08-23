from __future__ import annotations

import logging
from textwrap import dedent
from typing import TYPE_CHECKING, Any

import pytest

from rotaris_core.config.loader import load_config, load_llm_for_model
from rotaris_core.config.project_snapshot import (
    ProjectSnapshot,
    SnapshotModel,
    SnapshotProvider,
    snapshot_path,
    write_snapshot,
)
from rotaris_core.config.validation import validate_config
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from collections.abc import Iterator
    from pathlib import Path


def _model(
    model_id: str,
    *,
    limits: dict[str, Any] | None = None,
    capabilities: dict[str, Any] | None = None,
) -> SnapshotModel:
    return SnapshotModel(
        id=model_id,
        display_name=model_id,
        capabilities=capabilities or {},
        limits=limits or {},
        discovered_at="2026-05-11T00:00:00+00:00",
    )


def _provider(
    provider_id: str,
    models: list[SnapshotModel],
    *,
    authenticated: bool = True,
    large_model: str | None = None,
    medium_model: str | None = None,
    small_model: str | None = None,
    default_summary_model: str | None = None,
) -> SnapshotProvider:
    return SnapshotProvider(
        id=provider_id,
        display_name=provider_id,
        authenticated=authenticated,
        models=models,
        default_summary_model=default_summary_model,
        large_model=large_model,
        medium_model=medium_model,
        small_model=small_model,
        discovered_at="2026-05-11T00:00:00+00:00",
    )


@pytest.fixture
def restore_litellm_model_cost() -> Iterator[None]:
    """Undo model registrations so they cannot leak into other tests."""
    import litellm

    original = dict(litellm.model_cost)
    yield
    litellm.model_cost.clear()
    litellm.model_cost.update(original)


def _write_agents_yaml(workspace_root: Path, content: str) -> None:
    config_dir = workspace_root / ".rotaris"
    config_dir.mkdir(parents=True, exist_ok=True)
    (config_dir / "agents.yaml").write_text(content, encoding="utf-8")


@verifies(SWR.SWR_1702)
def test_load_config_without_snapshot_keeps_default_model_set(
    tmp_path: Path,
    monkeypatch: Any,
) -> None:
    monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", tmp_path)

    config = load_config(tmp_path)

    assert "snapshot-only-model" not in config.models


@verifies(SWR.SWR_1702)
def test_load_config_synthesizes_copilot_models_from_snapshot(
    tmp_path: Path,
    monkeypatch: Any,
) -> None:
    monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", tmp_path)
    write_snapshot(
        ProjectSnapshot(
            providers={
                "copilot": _provider(
                    "copilot", [_model("copilot/gpt-4o"), _model("copilot/gpt-5")]
                ),
            },
        ),
        base=tmp_path,
    )

    config = load_config(tmp_path)

    assert config.models["copilot/gpt-4o"].provider == "openai"
    assert config.models["copilot/gpt-4o"].model_id == "gpt-4o"
    assert config.models["copilot/gpt-4o"].auth_provider == "copilot"
    assert config.models["copilot/gpt-4o"].api_key is None
    assert config.models["copilot/gpt-4o"].max_input_tokens == 128000
    assert config.models["copilot/gpt-4o"].max_output_tokens == 16384
    assert config.models["copilot/gpt-5"].auth_provider == "copilot"
    assert config.models["copilot/gpt-5"].max_input_tokens == 400000
    assert config.models["copilot/gpt-5"].max_output_tokens == 128000


@verifies(SWR.SWR_782)
def test_load_config_applies_cloud_snapshot_pricing_and_suggestions(
    tmp_path: Path,
    monkeypatch: Any,
) -> None:
    """Productive use: a Cloud completion receives configured customer pricing.
    Expected outcome: the persisted catalog price and suggested fallback survive loading.
    """
    monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", tmp_path)
    write_snapshot(
        ProjectSnapshot(
            providers={
                "concrete-cloud": _provider(
                    "concrete-cloud",
                    [
                        SnapshotModel(
                            id="concrete-cloud/openai/gpt-5-mini",
                            display_name="GPT-5 Mini",
                            pricing={
                                "input_cost_per_token": 0.00000025,
                                "output_cost_per_token": 0.000002,
                            },
                            discovered_at="2026-08-23T00:00:00+00:00",
                        ),
                    ],
                    small_model="concrete-cloud/openai/gpt-5-mini",
                ),
            },
        ),
        base=tmp_path,
    )

    config = load_config(tmp_path)

    model = config.models["concrete-cloud/openai/gpt-5-mini"]
    assert model.input_cost_per_token == 0.00000025
    assert model.output_cost_per_token == 0.000002
    assert config.small_model == "concrete-cloud/openai/gpt-5-mini"


@verifies(SWR.SWR_782)
def test_load_cloud_model_forwards_snapshot_customer_pricing_to_litellm(
    tmp_path: Path,
    monkeypatch: Any,
) -> None:
    """Productive use: a Cloud completion reports cost from the catalog rate.
    Expected outcome: LiteLLM receives both public custom per-token rates.
    """
    monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", tmp_path)
    write_snapshot(
        ProjectSnapshot(
            providers={
                "concrete-cloud": _provider(
                    "concrete-cloud",
                    [
                        SnapshotModel(
                            id="concrete-cloud/openai/gpt-5-mini",
                            pricing={
                                "input_cost_per_token": 0.00000025,
                                "output_cost_per_token": 0.000002,
                            },
                            discovered_at="2026-08-23T00:00:00+00:00",
                        ),
                    ],
                ),
            },
        ),
        base=tmp_path,
    )
    monkeypatch.setattr(
        "rotaris_core.config.loader._resolve_auth_provider_token", lambda *_args, **_kwargs: "token"
    )

    llm = load_llm_for_model(load_config(tmp_path), "concrete-cloud/openai/gpt-5-mini")

    assert llm.input_cost_per_token == 0.00000025
    assert llm.output_cost_per_token == 0.000002


@verifies(SWR.SWR_1702)
def test_load_config_synthesizes_model_token_limits_from_snapshot(
    tmp_path: Path,
    monkeypatch: Any,
) -> None:
    monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", tmp_path)
    write_snapshot(
        ProjectSnapshot(
            providers={
                "copilot": _provider(
                    "copilot",
                    [
                        _model(
                            "copilot/gpt-runtime",
                            limits={"context_window": 128000, "output_tokens": 16000},
                        ),
                    ],
                ),
            },
        ),
        base=tmp_path,
    )

    config = load_config(tmp_path)

    assert config.models["copilot/gpt-runtime"].max_input_tokens == 128000
    assert config.models["copilot/gpt-runtime"].max_output_tokens == 16000


@verifies(SWR.SWR_1702)
def test_load_config_synthesizes_codex_auth_provider_from_snapshot(
    tmp_path: Path,
    monkeypatch: Any,
) -> None:
    monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", tmp_path)
    write_snapshot(
        ProjectSnapshot(providers={"codex": _provider("codex", [_model("codex/codex-mini")])}),
        base=tmp_path,
    )

    config = load_config(tmp_path)

    assert config.models["codex/codex-mini"].provider == "openai"
    assert config.models["codex/codex-mini"].model_id == "codex-mini"
    assert config.models["codex/codex-mini"].auth_provider == "codex"
    assert config.models["codex/codex-mini"].api_key is None


@verifies(SWR.SWR_1702)
def test_load_config_synthesizes_deepseek_models_from_snapshot(
    tmp_path: Path,
    monkeypatch: Any,
) -> None:
    monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", tmp_path)
    write_snapshot(
        ProjectSnapshot(
            providers={
                "deepseek": _provider(
                    "deepseek",
                    [_model("deepseek/deepseek-v4-pro"), _model("deepseek/deepseek-v4-flash")],
                ),
            },
        ),
        base=tmp_path,
    )

    config = load_config(tmp_path)

    assert config.models["deepseek/deepseek-v4-pro"].provider == "deepseek"
    assert config.models["deepseek/deepseek-v4-pro"].model_id == "deepseek-v4-pro"
    assert config.models["deepseek/deepseek-v4-pro"].auth_provider == "deepseek"
    assert config.models["deepseek/deepseek-v4-flash"].provider == "deepseek"


@verifies(SWR.SWR_1702)
def test_snapshot_backed_copilot_model_loads_with_valid_litellm_provider(
    tmp_path: Path,
    monkeypatch: Any,
) -> None:
    import json
    import os
    import time

    monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", tmp_path)
    write_snapshot(
        ProjectSnapshot(
            providers={"copilot": _provider("copilot", [_model("copilot/gpt-5.2-codex")])},
        ),
        base=tmp_path,
    )

    # Pre-stage Copilot tokens into the per-workspace LiteLLM cache so that
    # LLM construction does not trigger LiteLLM's interactive device-flow
    # authenticator (which would hang the test).
    token_dir = tmp_path / ".rotaris" / "litellm_cache"
    token_dir.mkdir(parents=True, exist_ok=True)
    (token_dir / "access-token").write_text("ghu_fake_refresh", encoding="utf-8")
    (token_dir / "api-key.json").write_text(
        json.dumps(
            {
                "token": "tid=fake-session-bearer",
                "expires_at": int(time.time()) + 3600,
                "endpoints": {"api": "https://api.githubcopilot.com"},
            },
        ),
        encoding="utf-8",
    )

    config = load_config(tmp_path)
    llm = load_llm_for_model(config, "copilot/gpt-5.2-codex")

    # LiteLLM dispatches to its native GitHub Copilot provider via the
    # ``github_copilot/`` model prefix. base_url is eagerly resolved by
    # LiteLLM from the bridged api-key.json["endpoints"]["api"] during
    # LLM construction.
    assert llm.model == "github_copilot/gpt-5.2-codex"
    assert llm.base_url == "https://api.githubcopilot.com"
    # The loader must have pointed LiteLLM at the per-workspace token cache
    # before constructing the LLM (R10 / Slice 2).
    assert os.environ.get("GITHUB_COPILOT_TOKEN_DIR", "").endswith("litellm_cache")


def _stage_copilot_tokens(workspace_root: Path) -> None:
    """Pre-stage Copilot credentials so LLM construction never opens a device flow."""
    import json
    import time

    token_dir = workspace_root / ".rotaris" / "litellm_cache"
    token_dir.mkdir(parents=True, exist_ok=True)
    (token_dir / "access-token").write_text("ghu_fake_refresh", encoding="utf-8")
    (token_dir / "api-key.json").write_text(
        json.dumps(
            {
                "token": "tid=fake-session-bearer",
                "expires_at": int(time.time()) + 3600,
                "endpoints": {"api": "https://api.githubcopilot.com"},
            },
        ),
        encoding="utf-8",
    )


def _litellm_mode(model_id: str) -> str | None:
    from litellm.main import responses_api_bridge_check

    model_info, _ = responses_api_bridge_check(model_id, "github_copilot")
    mode = model_info.get("mode")
    return mode if isinstance(mode, str) else None


@verifies(SWR.SWR_2810, SWR.SWR_2811)
def test_snapshot_backed_copilot_responses_model_routes_to_the_responses_endpoint(
    tmp_path: Path,
    monkeypatch: Any,
    restore_litellm_model_cost: None,
) -> None:
    """Productive use: an operator selects a Copilot model that only speaks /responses.
    Expected outcome: the run dispatches to that endpoint with reasoning effort intact."""
    monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", tmp_path)
    write_snapshot(
        ProjectSnapshot(
            providers={
                "copilot": _provider(
                    "copilot",
                    [
                        _model(
                            "copilot/gpt-5.6-terra",
                            capabilities={
                                "api_mode": "responses",
                                "supported_endpoints": ["/v1/responses"],
                            },
                            limits={"context_window": 272000, "max_output_tokens": 128000},
                        ),
                    ],
                ),
            },
        ),
        base=tmp_path,
    )
    _stage_copilot_tokens(tmp_path)

    assert _litellm_mode("gpt-5.6-terra") != "responses"

    config = load_config(tmp_path)
    assert config.models["copilot/gpt-5.6-terra"].api_mode == "responses"

    llm = load_llm_for_model(config, "copilot/gpt-5.6-terra")

    assert llm.model == "github_copilot/gpt-5.6-terra"
    # LiteLLM now bridges this model's chat-completions call to /responses.
    assert _litellm_mode("gpt-5.6-terra") == "responses"
    assert llm.max_input_tokens == 272000


@verifies(SWR.SWR_2810, SWR.SWR_2811)
def test_snapshot_backed_copilot_chat_model_keeps_the_chat_route(
    tmp_path: Path,
    monkeypatch: Any,
    restore_litellm_model_cost: None,
) -> None:
    """Productive use: models that already work on chat completions are undisturbed.
    Expected outcome: the chat route is preserved and nothing is registered."""
    monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", tmp_path)
    write_snapshot(
        ProjectSnapshot(
            providers={
                "copilot": _provider(
                    "copilot",
                    [_model("copilot/gpt-5.4", capabilities={"api_mode": "chat"})],
                ),
            },
        ),
        base=tmp_path,
    )
    _stage_copilot_tokens(tmp_path)

    config = load_config(tmp_path)
    assert config.models["copilot/gpt-5.4"].api_mode == "chat"

    llm = load_llm_for_model(config, "copilot/gpt-5.4")

    assert llm.model == "github_copilot/gpt-5.4"
    assert _litellm_mode("gpt-5.4") != "responses"


@verifies(SWR.SWR_1702)
def test_snapshot_backed_deepseek_model_loads_with_deepseek_provider_prefix(
    tmp_path: Path,
    monkeypatch: Any,
) -> None:
    monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", tmp_path)
    write_snapshot(
        ProjectSnapshot(
            providers={"deepseek": _provider("deepseek", [_model("deepseek/deepseek-v4-pro")])},
        ),
        base=tmp_path,
    )

    config = load_config(tmp_path)
    llm = load_llm_for_model(config, "deepseek/deepseek-v4-pro")

    assert llm.model == "deepseek/deepseek-v4-pro"
    assert llm.base_url == "https://api.deepseek.com/v1"


@verifies(SWR.SWR_1702)
def test_user_defined_model_with_snapshot_id_wins(tmp_path: Path, monkeypatch: Any) -> None:
    monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", tmp_path)
    write_snapshot(
        ProjectSnapshot(providers={"copilot": _provider("copilot", [_model("copilot/gpt-4o")])}),
        base=tmp_path,
    )
    _write_agents_yaml(
        tmp_path,
        """models:
  copilot/gpt-4o:
    provider: openai
    model_id: user-gpt-4o
    api_key_env: USER_KEY
""",
    )

    config = load_config(tmp_path)

    assert config.models["copilot/gpt-4o"].provider == "openai"
    assert config.models["copilot/gpt-4o"].model_id == "user-gpt-4o"
    assert config.models["copilot/gpt-4o"].api_key_env == "USER_KEY"
    assert config.models["copilot/gpt-4o"].auth_provider is None


@verifies(SWR.SWR_1702)
def test_medium_and_fallback_model_overlay_merge_global_to_workspace(
    tmp_path: Path,
    monkeypatch,
) -> None:
    global_config_dir = tmp_path / "global"
    global_config_dir.mkdir()
    (global_config_dir / "agents.yaml").write_text(
        "medium_model: global-medium\nfallback_model: global-fallback\n",
        encoding="utf-8",
    )
    _write_agents_yaml(tmp_path, "medium_model: workspace-medium\n")
    monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", global_config_dir)

    config = load_config(tmp_path)

    assert config.medium_model == "workspace-medium"
    assert config.fallback_model == "global-fallback"


@verifies(SWR.SWR_1702)
def test_snapshot_provider_with_zero_models_adds_no_models(
    tmp_path: Path,
    monkeypatch: Any,
) -> None:
    monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", tmp_path)
    write_snapshot(
        ProjectSnapshot(providers={"copilot": _provider("copilot", [])}),
        base=tmp_path,
    )

    config = load_config(tmp_path)

    assert all(model.auth_provider != "copilot" for model in config.models.values())


@verifies(SWR.SWR_1702)
def test_malformed_snapshot_logs_warning_and_loads_defaults(
    tmp_path: Path,
    caplog,
    monkeypatch: Any,
) -> None:
    monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", tmp_path)
    path = snapshot_path(tmp_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("providers: [unclosed", encoding="utf-8")

    with caplog.at_level(logging.WARNING, logger="rotaris_core.config.loader"):
        config = load_config(tmp_path)

    assert config.default_persona == "orchestrator"
    assert "Ignoring project settings snapshot" in caplog.text


@verifies(SWR.SWR_1702)
def test_default_persona_only_agents_yaml_with_snapshot_validates_cleanly(
    tmp_path: Path,
    monkeypatch: Any,
) -> None:
    monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", tmp_path)
    _write_agents_yaml(tmp_path, "default_persona: orchestrator\n")
    write_snapshot(
        ProjectSnapshot(
            providers={
                "copilot": _provider(
                    "copilot",
                    [_model("copilot/gpt-5.4"), _model("copilot/gpt-5-mini")],
                ),
            },
        ),
        base=tmp_path,
    )

    config = load_config(tmp_path)

    assert config.default_persona == "orchestrator"
    assert config.models["copilot/gpt-5.4"].auth_provider == "copilot"
    assert config.models["copilot/gpt-5-mini"].auth_provider == "copilot"


@verifies(SWR.SWR_1702)
def test_workspace_aliases_to_snapshot_copilot_models_validate_cleanly(
    tmp_path: Path,
    monkeypatch: Any,
) -> None:
    monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", tmp_path)
    write_snapshot(
        ProjectSnapshot(
            providers={
                "copilot": _provider(
                    "copilot",
                    [
                        _model("copilot/gpt-5.5"),
                        _model("copilot/claude-sonnet-4.6"),
                    ],
                    large_model="copilot/gpt-5.5",
                    medium_model="copilot/claude-sonnet-4.6",
                    small_model="copilot/claude-sonnet-4.6",
                    default_summary_model="copilot/claude-sonnet-4.6",
                ),
            },
        ),
        base=tmp_path,
    )
    _write_agents_yaml(
        tmp_path,
        dedent(
            """
                        default_persona: orchestrator
                        default_summary_model: copilot/claude-sonnet-4.6
                        large_model: copilot/gpt-5.5
                        medium_model: copilot/claude-sonnet-4.6
                        small_model: copilot/claude-sonnet-4.6
                        fallback_model: copilot/claude-sonnet-4.6
                        personas:
                            orchestrator:
                                model: large_model
                            architect:
                                model: medium_model
                            coding-agent:
                                model: medium_model
                            planner:
                                model: medium_model
                            refactorer:
                                model: medium_model
                        """,
        ).strip(),
    )

    config = load_config(tmp_path)

    assert config.personas["orchestrator"].model == "copilot/gpt-5.5"
    assert config.personas["architect"].model == "copilot/claude-sonnet-4.6"
    assert validate_config(config) == []


@verifies(SWR.SWR_1702)
def test_snapshot_bridges_tier_aliases_when_user_did_not_set(
    tmp_path: Path,
    monkeypatch: Any,
) -> None:
    monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", tmp_path)
    write_snapshot(
        ProjectSnapshot(
            providers={
                "copilot": _provider(
                    "copilot",
                    [
                        _model("copilot/gpt-5"),
                        _model("copilot/gpt-5-mini"),
                        _model("copilot/gpt-5-nano"),
                    ],
                    large_model="copilot/gpt-5",
                    medium_model="copilot/gpt-5-mini",
                    small_model="copilot/gpt-5-nano",
                    default_summary_model="copilot/gpt-5-mini",
                ),
            },
        ),
        base=tmp_path,
    )
    _write_agents_yaml(tmp_path, "default_persona: orchestrator\n")

    config = load_config(tmp_path)

    assert config.default_summary_model == "copilot/gpt-5-mini"
    assert config.large_model == "copilot/gpt-5"
    assert config.medium_model == "copilot/gpt-5-mini"
    assert config.small_model == "copilot/gpt-5-nano"
    assert config.fallback_model == "copilot/gpt-5-nano"


@verifies(SWR.SWR_1702)
def test_load_config_synthesizes_openai_compatible_models_with_base_url(
    tmp_path: Path,
    monkeypatch: Any,
) -> None:
    monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", tmp_path)
    write_snapshot(
        ProjectSnapshot(
            providers={
                "openai-compatible--lab": _provider(
                    "openai-compatible--lab",
                    [_model("openai-compatible--lab/gpt-4.1-mini")],
                    large_model="openai-compatible--lab/gpt-4.1-mini",
                    medium_model="openai-compatible--lab/gpt-4.1-mini",
                    small_model="openai-compatible--lab/gpt-4.1-mini",
                    default_summary_model="openai-compatible--lab/gpt-4.1-mini",
                ).model_copy(
                    update={
                        "family": "openai-compatible",
                        "base_url": "http://localhost:1234/v1",
                    },
                ),
            },
        ),
        base=tmp_path,
    )

    config = load_config(tmp_path)

    assert config.models["openai-compatible--lab/gpt-4.1-mini"].auth_provider == (
        "openai-compatible--lab"
    )
    assert config.models["openai-compatible--lab/gpt-4.1-mini"].base_url == (
        "http://localhost:1234/v1"
    )


@verifies(SWR.SWR_1702)
def test_user_set_large_model_wins_over_snapshot(tmp_path: Path, monkeypatch: Any) -> None:
    monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", tmp_path)
    write_snapshot(
        ProjectSnapshot(
            providers={
                "copilot": _provider(
                    "copilot",
                    [_model("copilot/gpt-5")],
                    large_model="copilot/gpt-5",
                    medium_model="copilot/gpt-5-mini",
                    small_model="copilot/gpt-5-nano",
                ),
            },
        ),
        base=tmp_path,
    )
    _write_agents_yaml(tmp_path, 'large_model: "custom"\n')

    config = load_config(tmp_path)

    assert config.large_model == "custom"
    assert config.medium_model == "copilot/gpt-5-mini"
    assert config.small_model == "copilot/gpt-5-nano"


@verifies(SWR.SWR_1702)
def test_user_set_fallback_model_wins_over_snapshot_small_model(
    tmp_path: Path,
    monkeypatch: Any,
) -> None:
    monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", tmp_path)
    write_snapshot(
        ProjectSnapshot(
            providers={
                "copilot": _provider(
                    "copilot",
                    [_model("copilot/gpt-5-nano")],
                    small_model="copilot/gpt-5-nano",
                ),
            },
        ),
        base=tmp_path,
    )
    _write_agents_yaml(tmp_path, 'fallback_model: "custom-fallback"\n')

    config = load_config(tmp_path)

    assert config.fallback_model == "custom-fallback"


@verifies(SWR.SWR_1702)
def test_snapshot_with_no_tier_values_preserves_builtin_startup_defaults(
    tmp_path: Path,
    monkeypatch: Any,
) -> None:
    monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", tmp_path)
    write_snapshot(
        ProjectSnapshot(providers={"copilot": _provider("copilot", [_model("copilot/gpt-5")])}),
        base=tmp_path,
    )

    config = load_config(tmp_path)

    assert config.large_model == "gpt-4o"
    assert config.medium_model == "gpt-4o-mini"
    assert config.small_model == "gpt-4o-mini"
    assert config.fallback_model == "gpt-4o-mini"


# ---------------------------------------------------------------------------
# Model availability (SWR-2812 / SWR-2813)
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_2812, SWR.SWR_2813)
def test_unavailable_snapshot_models_are_listed_but_never_configured(
    tmp_path: Path,
    monkeypatch: Any,
) -> None:
    """Productive use: the picker can show a policy-blocked model with its reason while
    nothing in the runtime can build a client for it.
    Expected outcome: it lands in unavailable_models and never in models."""
    monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", tmp_path)
    write_snapshot(
        ProjectSnapshot(
            providers={
                "copilot": _provider(
                    "copilot",
                    [
                        _model(
                            "copilot/gpt-5.6-sol",
                            capabilities={
                                "availability": "policy_disabled",
                                "unavailable_detail": "Enable it in Copilot settings",
                            },
                        ),
                        _model(
                            "copilot/gpt-5",
                            capabilities={"availability": "available", "api_mode": "chat"},
                        ),
                    ],
                ),
            },
        ),
        base=tmp_path,
    )

    config = load_config(tmp_path)

    assert "copilot/gpt-5" in config.models
    assert "copilot/gpt-5.6-sol" not in config.models

    withheld = config.unavailable_models["copilot/gpt-5.6-sol"]
    assert withheld.reason_code == "policy_disabled"
    assert withheld.auth_provider == "copilot"
    assert withheld.detail == "Enable it in Copilot settings"
    assert withheld.detail in withheld.reason
    assert "settings" in withheld.reason


@verifies(SWR.SWR_2813)
def test_a_user_declared_model_stays_configured_even_when_the_provider_rejects_it(
    tmp_path: Path,
    monkeypatch: Any,
) -> None:
    """Productive use: an operator who has pinned a model in agents.yaml keeps control —
    provider metadata does not overrule an explicit declaration.
    Expected outcome: the id is a configured model and is not reported as unavailable."""
    monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", tmp_path)
    write_snapshot(
        ProjectSnapshot(
            providers={
                "copilot": _provider(
                    "copilot",
                    [
                        _model(
                            "copilot/gpt-5.6-sol",
                            capabilities={"availability": "policy_disabled"},
                        ),
                    ],
                ),
            },
        ),
        base=tmp_path,
    )
    _write_agents_yaml(
        tmp_path,
        dedent(
            """
            models:
              copilot/gpt-5.6-sol:
                provider: openai
                model_id: gpt-5.6-sol
            """,
        ),
    )

    config = load_config(tmp_path)

    assert "copilot/gpt-5.6-sol" in config.models
    assert "copilot/gpt-5.6-sol" not in config.unavailable_models


@verifies(SWR.SWR_2812)
def test_requesting_an_unavailable_model_fails_with_the_reason(
    tmp_path: Path,
    monkeypatch: Any,
) -> None:
    """Productive use: a stale persona reference names a model the account lost access to.
    Expected outcome: the failure names the cause instead of an opaque provider error."""
    monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", tmp_path)
    write_snapshot(
        ProjectSnapshot(
            providers={
                "copilot": _provider(
                    "copilot",
                    [
                        _model(
                            "copilot/gpt-5.6-sol",
                            capabilities={"availability": "policy_disabled"},
                        ),
                    ],
                ),
            },
        ),
        base=tmp_path,
    )
    config = load_config(tmp_path)

    with pytest.raises(ValueError, match="unavailable"):
        load_llm_for_model(config, "copilot/gpt-5.6-sol")


@verifies(SWR.SWR_2813)
def test_availability_survives_a_snapshot_write_and_read(
    tmp_path: Path,
    monkeypatch: Any,
) -> None:
    """Productive use: opening the picker without re-running discovery still explains
    itself. Expected outcome: the classification round-trips through the snapshot file."""
    monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", tmp_path)
    from rotaris_core.config.project_snapshot import read_snapshot

    write_snapshot(
        ProjectSnapshot(
            providers={
                "copilot": _provider(
                    "copilot",
                    [
                        _model(
                            "copilot/copilot-search-internal",
                            capabilities={"availability": "no_supported_route"},
                        ),
                    ],
                ),
            },
        ),
        base=tmp_path,
    )

    reloaded = read_snapshot(base=tmp_path)

    assert reloaded is not None
    stored = reloaded.providers["copilot"].models[0]
    assert stored.capabilities["availability"] == "no_supported_route"
