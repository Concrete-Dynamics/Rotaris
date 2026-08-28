from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import litellm
import pytest
from litellm import ModelResponse
from openhands.sdk.llm.exceptions.types import LLMRateLimitError
from openhands.sdk.llm.message import Message, TextContent
from openhands.sdk.llm.options.responses_options import select_responses_options
from pydantic import SecretStr

from rotaris_core.auth.provider import TokenSet
from rotaris_core.config import loader
from rotaris_core.config.defaults import DEFAULT_PERSONAS
from rotaris_core.config.schema import RotarisConfig
from rotaris_core.reqtocode import SWR, verifies


def _llm_api_key_value(llm: object) -> str | None:
    api_key = getattr(llm, "api_key", None)
    if isinstance(api_key, SecretStr):
        return api_key.get_secret_value()
    if isinstance(api_key, str):
        return api_key
    return None


def _messages() -> list[Message]:
    return [Message(role="user", content=[TextContent(text="hello")])]


@verifies(SWR.SWR_919)
def test_llm_retry_rejects_request_encoding_error() -> None:
    exc = RuntimeError(
        "DeepseekException - 'ascii' codec can't encode character '\\xe4': "
        "ordinal not in range(128)"
    )

    assert not loader._llm_retryable_exception(exc, (RuntimeError,))


def _response(model: str, content: str = "ok") -> ModelResponse:
    return ModelResponse(
        model=model,
        choices=[{"message": {"role": "assistant", "content": content}}],
        usage={"prompt_tokens": 2, "completion_tokens": 3, "total_tokens": 5},
    )


@verifies(SWR.SWR_313, SWR.SWR_318, SWR.SWR_386)
def test_load_config_defaults_only(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)

    config = loader.load_config(workspace_root)

    assert len(config.personas) == len(DEFAULT_PERSONAS)
    assert config.default_persona == "orchestrator"
    assert config.models["gpt-4o"].api_key_env == "OPENAI_API_KEY"
    assert config.personas["codebase-analyst"].thinking == "low"
    assert config.resolved_persona_model_tiers["coding-agent"] == "medium_model"
    assert config.workspace_root == workspace_root


@verifies(SWR.SWR_1701)
def test_loader_top_level_merge_keys_cover_schema_fields() -> None:
    wired_fields = {
        *loader._REPLACE_TOP_LEVEL_KEYS,
        *loader._NAMED_ENTRY_TOP_LEVEL_KEYS,
        *loader._FIELD_MERGE_TOP_LEVEL_KEYS,
    }

    assert wired_fields | loader._PROGRAMMATIC_KEYS | {"display", "inject_agents_md"} == set(
        RotarisConfig.model_fields
    )


@verifies(SWR.SWR_313, SWR.SWR_315)
def test_load_config_global_only(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (global_dir / "agents.yaml").write_text(
        """
default_persona: coding-agent
personas:
  coding-agent:
    name: coding-agent
    model: custom-model
    tools:
      - terminal
models:
  custom-model:
    provider: openai
    model_id: openai/custom
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)

    assert config.default_persona == "coding-agent"
    assert config.personas["coding-agent"].model == "custom-model"
    assert config.personas["coding-agent"].tools == ["terminal"]
    assert config.personas["coding-agent"].system_prompt_file == "prompts/coding_agent.md"
    assert config.models["custom-model"].model_id == "openai/custom"


@verifies(SWR.SWR_316)
def test_orchestrator_global_override_preserves_default_prompt_file(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (global_dir / "agents.yaml").write_text(
        """
personas:
  orchestrator:
    name: orchestrator
    model: vllm
    summary_model: vllm
    tools:
      - delegate
      - terminal
      - todo
      - git_commit
      - fetch
models:
  vllm:
    provider: openai
    model_id: google/gemma-4-26B-A4B-it
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)

    assert config.personas["orchestrator"].tools == [
        "delegate",
        "terminal",
        "todo",
        "git_commit",
        "fetch",
    ]
    assert config.personas["orchestrator"].system_prompt_file == "prompts/orchestrator.md"


@verifies(SWR.SWR_313, SWR.SWR_314)
def test_load_config_workspace_only(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    workspace_config_dir = workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME
    workspace_config_dir.mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (workspace_config_dir / "agents.yaml").write_text(
        """
default_persona: tester
personas:
  tester:
    name: tester
    model: workspace-model
    tools:
      - git_commit
models:
  workspace-model:
    provider: anthropic
    model_id: anthropic/tester
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)

    assert config.default_persona == "tester"
    assert config.personas["tester"].model == "workspace-model"
    assert config.models["workspace-model"].provider == "anthropic"


@verifies(SWR.SWR_313, SWR.SWR_318, SWR.SWR_386)
def test_load_config_resolves_medium_model_aliases(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    workspace_config_dir = workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME
    workspace_config_dir.mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (workspace_config_dir / "agents.yaml").write_text(
        """
default_summary_model: medium_model
small_model: gpt-4o-mini
medium_model: balanced-model
large_model: gpt-4o
personas:
  docs-writer:
    name: docs-writer
    model: medium_model
    summary_model: medium_model
    fallback_model: medium_model
    tools:
      - write_file
compressor:
  model: medium_model
circuit_breaker:
  model: medium_model
models:
  gpt-4o:
    provider: openai
    model_id: gpt-4o
  gpt-4o-mini:
    provider: openai
    model_id: gpt-4o-mini
  balanced-model:
    provider: openai
    model_id: gpt-4.1-mini
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)

    assert config.default_summary_model == "balanced-model"
    assert config.personas["docs-writer"].model == "balanced-model"
    assert config.personas["docs-writer"].summary_model == "balanced-model"
    assert config.personas["docs-writer"].fallback_model == "balanced-model"
    assert config.resolved_persona_model_tiers["docs-writer"] == "medium_model"
    assert config.compressor.model == "balanced-model"
    assert config.circuit_breaker.model == "balanced-model"


@verifies(SWR.SWR_313, SWR.SWR_316)
def test_load_config_normalizes_legacy_oracle_persona_name(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    workspace_config_dir = workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME
    workspace_config_dir.mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (workspace_config_dir / "agents.yaml").write_text(
        """
default_persona: oracle
personas:
    oracle:
        name: oracle
        model: gpt-4o-mini
        delegates_to:
            - librarian
models:
    gpt-4o:
        provider: openai
        model_id: gpt-4o
    gpt-4o-mini:
        provider: openai
        model_id: gpt-4o-mini
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)

    assert config.default_persona == "codebase-analyst"
    assert "codebase-analyst" in config.personas
    assert "oracle" not in config.personas
    assert config.personas["codebase-analyst"].name == "codebase-analyst"


@verifies(SWR.SWR_206, SWR.SWR_218, SWR.SWR_223, SWR.SWR_227)
def test_load_config_merges_circuit_breaker_settings(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    workspace_config_dir = workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME
    workspace_config_dir.mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (global_dir / "agents.yaml").write_text(
        """
circuit_breaker:
  activation_mode: weighted
  tool_call_threshold: 12
  tool_weight: 0.7
""".strip(),
        encoding="utf-8",
    )
    (workspace_config_dir / "agents.yaml").write_text(
        """
circuit_breaker:
  message_count_threshold: 15
  message_weight: 0.3
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)

    assert config.circuit_breaker.activation_mode == "weighted"
    assert config.circuit_breaker.tool_call_threshold == 12
    assert config.circuit_breaker.message_count_threshold == 15
    assert config.circuit_breaker.tool_weight == 0.7
    assert config.circuit_breaker.message_weight == 0.3


@verifies(SWR.SWR_313, SWR.SWR_315)
def test_load_config_global_and_workspace_merge_order(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    workspace_config_dir = workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME
    workspace_config_dir.mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (global_dir / "agents.yaml").write_text(
        """
default_persona: coding-agent
personas:
  coding-agent:
    name: coding-agent
    model: global-model
    tools:
      - terminal
models:
  global-model:
    provider: openai
    model_id: openai/global
""".strip(),
        encoding="utf-8",
    )
    (workspace_config_dir / "agents.yaml").write_text(
        """
default_persona: tester
personas:
  coding-agent:
    name: coding-agent
    model: workspace-model
    tools:
      - read_file
  tester:
    name: tester
    model: workspace-model
models:
  workspace-model:
    provider: anthropic
    model_id: anthropic/workspace
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)

    assert config.default_persona == "tester"
    assert config.personas["coding-agent"].model == "workspace-model"
    assert config.models["workspace-model"].model_id == "anthropic/workspace"
    assert config.models["global-model"].model_id == "openai/global"


@verifies(SWR.SWR_316, SWR.SWR_317, SWR.SWR_1825)
def test_workspace_persona_override_preserves_unspecified_fields(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    workspace_config_dir = workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME
    workspace_config_dir.mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (global_dir / "agents.yaml").write_text(
        """
personas:
  coding-agent:
    name: coding-agent
    model: gpt-4o
    tools:
      - terminal
      - git_commit
    delegates_to:
      - tester
""".strip(),
        encoding="utf-8",
    )
    (workspace_config_dir / "agents.yaml").write_text(
        """
personas:
  coding-agent:
    model: gpt-4o-mini
    tools:
      - read_file
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)

    assert config.personas["coding-agent"].tools == ["read_file"]
    assert config.personas["coding-agent"].delegates_to == ["tester"]
    assert config.personas["coding-agent"].name == "coding-agent"


@verifies(SWR.SWR_316)
def test_persona_override_can_clear_inherited_fields_explicitly(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    workspace_config_dir = workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME
    workspace_config_dir.mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (workspace_config_dir / "agents.yaml").write_text(
        """
personas:
  coding-agent:
    system_prompt_file:
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)

    assert config.personas["coding-agent"].system_prompt_file is None
    assert config.personas["coding-agent"].model == "gpt-4o-mini"


@verifies(SWR.SWR_316)
def test_workspace_model_override_preserves_unspecified_fields(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    workspace_config_dir = workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME
    workspace_config_dir.mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (global_dir / "models.yml").write_text(
        """
models:
  custom-model:
    provider: openai
    model_id: openai/custom
    base_url: https://example.invalid/v1
""".strip(),
        encoding="utf-8",
    )
    (workspace_config_dir / "models.yml").write_text(
        """
models:
  custom-model:
    model_id: openai/workspace
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)

    assert config.models["custom-model"].provider == "openai"
    assert config.models["custom-model"].model_id == "openai/workspace"
    assert config.models["custom-model"].base_url == "https://example.invalid/v1"


@verifies(SWR.SWR_313, SWR.SWR_316)
def test_runtime_override_preserves_unspecified_fields(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    workspace_config_dir = workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME
    workspace_config_dir.mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (global_dir / "agents.yaml").write_text(
        """
runtime:
  max_children: 4
  model_timeout: 240
""".strip(),
        encoding="utf-8",
    )
    (workspace_config_dir / "agents.yaml").write_text(
        """
runtime:
  max_iterations: 9
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)

    assert config.runtime.max_children == 4
    assert config.runtime.model_timeout == 240
    assert config.runtime.max_iterations == 9


@verifies(SWR.SWR_2503)
def test_workspace_permission_mode_overrides_global(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    workspace_config_dir = workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME
    workspace_config_dir.mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (global_dir / "agents.yaml").write_text(
        """
runtime:
  permission_mode: restricted
""".strip(),
        encoding="utf-8",
    )
    (workspace_config_dir / "agents.yaml").write_text(
        """
runtime:
  permission_mode: autonomous
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)

    assert config.runtime.permission_mode == "autonomous"


@verifies(SWR.SWR_2503)
def test_persona_permission_mode_is_independent_of_runtime_default(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (global_dir / "agents.yaml").write_text(
        """
runtime:
  permission_mode: ask
personas:
  reviewer:
    name: reviewer
    model: small_model
    permission_mode: restricted
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)

    assert config.runtime.permission_mode == "ask"
    assert config.personas["reviewer"].permission_mode == "restricted"


@verifies(SWR.SWR_2508)
def test_workspace_opt_in_for_unsandboxed_autonomy_overrides_global(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    workspace_config_dir = workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME
    workspace_config_dir.mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (global_dir / "agents.yaml").write_text(
        """
runtime:
  permission_mode: autonomous
""".strip(),
        encoding="utf-8",
    )
    (workspace_config_dir / "agents.yaml").write_text(
        """
runtime:
  allow_unsandboxed_autonomous: true
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)

    assert config.runtime.allow_unsandboxed_autonomous is True


@verifies(SWR.SWR_2508)
def test_unsandboxed_autonomy_is_not_opted_in_by_default(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)

    config = loader.load_config(workspace_root)

    assert config.runtime.allow_unsandboxed_autonomous is False


@verifies(SWR.SWR_2601)
def test_workspace_verifier_checks_override_global(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    workspace_config_dir = workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME
    workspace_config_dir.mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (global_dir / "agents.yaml").write_text(
        """
verifier:
  checks:
    - name: global-check
      command: echo global
""".strip(),
        encoding="utf-8",
    )
    (workspace_config_dir / "agents.yaml").write_text(
        """
verifier:
  checks:
    - name: pytest
      command: uv run pytest -q
      timeout: 900
    - name: ruff
      command: uv run ruff check .
      severity: advisory
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)

    assert config.verifier.checks is not None
    assert [check.name for check in config.verifier.checks] == ["pytest", "ruff"]
    assert config.verifier.checks[0].timeout == 900
    assert config.verifier.checks[0].severity == "blocking"
    assert config.verifier.checks[1].severity == "advisory"


@verifies(SWR.SWR_2601)
def test_explicit_empty_checks_override_a_global_suite(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    workspace_config_dir = workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME
    workspace_config_dir.mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (global_dir / "agents.yaml").write_text(
        """
verifier:
  checks:
    - name: global-check
      command: echo global
""".strip(),
        encoding="utf-8",
    )
    (workspace_config_dir / "agents.yaml").write_text(
        """
verifier:
  checks: []
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)

    # An explicit empty list must survive the overlay as "no verification",
    # not fall back to the global suite the way an omitted key would.
    assert config.verifier.checks == []


@verifies(SWR.SWR_2601)
def test_omitted_verifier_section_leaves_checks_unset(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)

    config = loader.load_config(workspace_root)

    assert config.verifier.checks is None


@verifies(SWR.SWR_2407)
def test_workspace_can_override_worktree_storage_subpath(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: users can choose where isolated worktrees are stored.
    Expected outcome: workspace configuration overrides the global worktree subpath.
    """
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    workspace_config_dir = workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME
    workspace_config_dir.mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (global_dir / "agents.yaml").write_text(
        "worktree_storage_subpath: global-worktrees",
        encoding="utf-8",
    )
    (workspace_config_dir / "agents.yaml").write_text(
        "worktree_storage_subpath: local-worktrees",
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)

    assert config.worktree_storage_subpath == "local-worktrees"


@verifies(SWR.SWR_318)
def test_global_persona_not_in_workspace_is_preserved(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    workspace_config_dir = workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME
    workspace_config_dir.mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (global_dir / "agents.yaml").write_text(
        """
personas:
  custom-docs:
    name: custom-docs
    model: gpt-4o
""".strip(),
        encoding="utf-8",
    )
    (workspace_config_dir / "agents.yaml").write_text(
        "personas: {}",
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)

    assert "custom-docs" in config.personas


@verifies(SWR.SWR_318)
def test_missing_yaml_files_fallback_gracefully(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)

    assert loader._load_yaml_file(global_dir / "agents.yaml") == {}
    config = loader.load_config(workspace_root)

    assert config.personas["orchestrator"].name == "orchestrator"


@verifies(SWR.SWR_1704)
def test_load_llm_for_model_uses_literal_secret_misplaced_in_api_key_env(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    literal_secret = "ZPR2JVlQk0nbhkU1CNGNMD4DhKZgPF"
    (global_dir / "agents.yaml").write_text(
        f"""
personas:
  orchestrator:
    name: orchestrator
    model: vllm
models:
  vllm:
    provider: openai
    model_id: openai/google/gemma-4-26B-A4B-it
    api_key_env: {literal_secret}
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)
    llm = loader.load_llm_for_model(config, "vllm")

    assert _llm_api_key_value(llm) == literal_secret


@verifies(SWR.SWR_1704)
def test_load_llm_for_model_prefers_environment_variable_value(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    monkeypatch.setenv("MODEL_TOKEN", "env-secret")
    (global_dir / "agents.yaml").write_text(
        """
personas:
  orchestrator:
    name: orchestrator
    model: vllm
models:
  vllm:
    provider: openai
    model_id: openai/google/gemma-4-26B-A4B-it
    api_key_env: MODEL_TOKEN
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)
    llm = loader.load_llm_for_model(config, "vllm")

    assert _llm_api_key_value(llm) == "env-secret"


@verifies(SWR.SWR_701)
def test_load_llm_for_copilot_auth_uses_litellm_native_provider(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Copilot models route through LiteLLM's native ``github_copilot/`` provider.

    Rotaris no longer resolves the bearer token on each call. Instead, AuthManager
    stages the OAuth refresh + session tokens into a per-workspace cache directory,
    and LiteLLM's bundled Copilot authenticator reads them. The loader's
    responsibility is to (a) point LiteLLM at the right cache via
    ``GITHUB_COPILOT_TOKEN_DIR`` and (b) construct an LLM with the
    ``github_copilot/<model_id>`` prefix and the standard editor-integration headers.
    """
    import json
    import os
    import time

    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)

    # Pre-stage tokens so LiteLLM's authenticator does not trigger an
    # interactive device-flow login during LLM construction.
    token_dir = workspace_root / ".rotaris" / "litellm_cache"
    token_dir.mkdir(parents=True, exist_ok=True)
    (token_dir / "access-token").write_text("ghu_fake_refresh", encoding="utf-8")
    (token_dir / "api-key.json").write_text(
        json.dumps(
            {
                "token": "tid=fresh-bearer",
                "expires_at": int(time.time()) + 3600,
                "endpoints": {"api": "https://api.business.githubcopilot.com"},
            },
        ),
        encoding="utf-8",
    )

    (global_dir / "agents.yaml").write_text(
        """
models:
  copilot-gpt5:
    provider: openai
    model_id: gpt-5.3
    auth_provider: copilot
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)
    llm = loader.load_llm_for_model(config, "copilot-gpt5")

    # LiteLLM-native dispatch — model string carries the provider prefix.
    assert llm.model == "github_copilot/gpt-5.3"
    # Copilot always uses /chat/completions even on GPT-5 family models.
    assert not llm.uses_responses_api()
    # OpenHands defaults reasoning_effort="high", but Copilot chat completions
    # reject function tools when reasoning_effort is present.
    assert llm.reasoning_effort is None
    assert llm.prompt_cache_retention is None
    # Editor-integration headers must accompany every Copilot request.
    assert llm.extra_headers is not None
    assert llm.extra_headers.get("Copilot-Integration-Id") == "vscode-chat"
    assert llm.extra_headers.get("Editor-Plugin-Version", "").startswith("copilot-chat/")
    # Loader must have configured LiteLLM's authenticator cache dir.
    assert os.environ.get("GITHUB_COPILOT_TOKEN_DIR", "").endswith("litellm_cache")


@verifies(SWR.SWR_701)
def test_load_llm_for_copilot_chat_options_omit_reasoning_effort(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import json
    import time

    from openhands.sdk.llm.options.chat_options import select_chat_options

    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)

    token_dir = workspace_root / ".rotaris" / "litellm_cache"
    token_dir.mkdir(parents=True, exist_ok=True)
    (token_dir / "access-token").write_text("ghu_fake_refresh", encoding="utf-8")
    (token_dir / "api-key.json").write_text(
        json.dumps(
            {
                "token": "tid=fresh-bearer",
                "expires_at": int(time.time()) + 3600,
                "endpoints": {"api": "https://api.githubcopilot.com"},
            },
        ),
        encoding="utf-8",
    )

    (global_dir / "agents.yaml").write_text(
        """
models:
  copilot-gpt5:
    provider: openai
    model_id: gpt-5.4
    auth_provider: copilot
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)
    llm = loader.load_llm_for_model(config, "copilot-gpt5")

    options = select_chat_options(llm, {"tools": [{"type": "function"}]}, has_tools=True)

    assert "reasoning_effort" not in options
    assert "prompt_cache_retention" not in options


def _write_copilot_thinking_config(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    *,
    model_id: str,
    api_mode: str,
) -> tuple[RotarisConfig, str]:
    """Build a Copilot model configured with an explicit thinking level."""
    import json
    import time

    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)

    token_dir = workspace_root / ".rotaris" / "litellm_cache"
    token_dir.mkdir(parents=True, exist_ok=True)
    (token_dir / "access-token").write_text("ghu_fake_refresh", encoding="utf-8")
    (token_dir / "api-key.json").write_text(
        json.dumps(
            {
                "token": "tid=fresh-bearer",
                "expires_at": int(time.time()) + 3600,
                "endpoints": {"api": "https://api.githubcopilot.com"},
            },
        ),
        encoding="utf-8",
    )

    (global_dir / "agents.yaml").write_text(
        f"""
models:
  copilot-model:
    provider: openai
    model_id: {model_id}
    auth_provider: copilot
    api_mode: {api_mode}
    thinking: high
""".strip(),
        encoding="utf-8",
    )

    return loader.load_config(workspace_root), "copilot-model"


@verifies(SWR.SWR_2810, SWR.SWR_2811)
def test_load_llm_for_copilot_responses_model_keeps_reasoning_effort(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: an operator sets a thinking level on a responses-routed model.
    Expected outcome: the effort reaches the request instead of being dropped."""
    import litellm

    original_model_cost = dict(litellm.model_cost)
    try:
        config, model_name = _write_copilot_thinking_config(
            tmp_path,
            monkeypatch,
            model_id="gpt-5.6-terra",
            api_mode="responses",
        )
        llm = loader.load_llm_for_model(config, model_name)

        assert llm.reasoning_effort == "high"
    finally:
        litellm.model_cost.clear()
        litellm.model_cost.update(original_model_cost)


@verifies(SWR.SWR_2810)
def test_load_llm_for_copilot_chat_model_still_drops_reasoning_effort(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: chat-routed Copilot models keep working with function tools.
    Expected outcome: reasoning effort stays stripped on that route."""
    config, model_name = _write_copilot_thinking_config(
        tmp_path,
        monkeypatch,
        model_id="gpt-5.4",
        api_mode="chat",
    )
    llm = loader.load_llm_for_model(config, model_name)

    assert llm.reasoning_effort is None


@verifies(SWR.SWR_1704)
def test_load_llm_for_model_skips_retry_on_insufficient_quota(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (global_dir / "agents.yaml").write_text(
        """
models:
  cloud-model:
    provider: openai
    model_id: Qwen/Qwen3.6-35B-A3B
    base_url: http://app.localhost/v1
""".strip(),
        encoding="utf-8",
    )

    calls: list[str] = []

    def fake_completion(**kwargs: object) -> ModelResponse:
        calls.append(str(kwargs["model"]))
        raise litellm.RateLimitError(
            '429 {"error":{"type":"insufficient_quota","code":"insufficient_quota"}}',
            "openai",
            str(kwargs["model"]),
        )

    monkeypatch.setattr("openhands.sdk.llm.llm.litellm_completion", fake_completion)
    config = loader.load_config(workspace_root)
    llm = loader.load_llm_for_model(config, "cloud-model")

    with pytest.raises(LLMRateLimitError):
        llm.completion(_messages())

    assert calls == ["openai/Qwen/Qwen3.6-35B-A3B"]


@verifies(SWR.SWR_1704)
def test_load_llm_for_model_skips_retry_on_plain_quota_message(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (global_dir / "agents.yaml").write_text(
        """
models:
  cloud-model:
    provider: openai
    model_id: Qwen/Qwen3.6-35B-A3B
    base_url: http://app.localhost/v1
""".strip(),
        encoding="utf-8",
    )

    calls: list[str] = []

    def fake_completion(**kwargs: object) -> ModelResponse:
        calls.append(str(kwargs["model"]))
        raise litellm.RateLimitError(
            "You exceeded your current quota, please check your plan and billing details.",
            "openai",
            str(kwargs["model"]),
        )

    monkeypatch.setattr("openhands.sdk.llm.llm.litellm_completion", fake_completion)
    config = loader.load_config(workspace_root)
    llm = loader.load_llm_for_model(config, "cloud-model")

    with pytest.raises(LLMRateLimitError):
        llm.completion(_messages())

    assert calls == ["openai/Qwen/Qwen3.6-35B-A3B"]


@verifies(SWR.SWR_1704)
def test_load_llm_for_model_retries_plain_rate_limit(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (global_dir / "agents.yaml").write_text(
        """
models:
  cloud-model:
    provider: openai
    model_id: Qwen/Qwen3.6-35B-A3B
    base_url: http://app.localhost/v1
    num_retries: 3
""".strip(),
        encoding="utf-8",
    )

    calls: list[str] = []

    def fake_completion(**kwargs: object) -> ModelResponse:
        calls.append(str(kwargs["model"]))
        if len(calls) < 3:
            raise litellm.RateLimitError(
                "429 Too Many Requests. Retry-After: 1",
                "openai",
                str(kwargs["model"]),
            )
        return _response(str(kwargs["model"]), "recovered")

    monkeypatch.setattr("openhands.sdk.llm.llm.litellm_completion", fake_completion)
    monkeypatch.setattr("time.sleep", lambda _seconds: None)
    config = loader.load_config(workspace_root)
    llm = loader.load_llm_for_model(config, "cloud-model")

    result = llm.completion(_messages())

    assert result.message.content[0].text == "recovered"
    assert calls == [
        "openai/Qwen/Qwen3.6-35B-A3B",
        "openai/Qwen/Qwen3.6-35B-A3B",
        "openai/Qwen/Qwen3.6-35B-A3B",
    ]


@verifies(SWR.SWR_701, SWR.SWR_703)
def test_load_llm_for_copilot_stages_stored_tokens_before_construction(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import os
    import time

    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)

    def load_token(_self: object, provider_id: str) -> TokenSet | None:
        if provider_id != "copilot":
            return None
        return TokenSet(
            access_token="tid=fresh-bearer",
            refresh_token="ghu_fake_refresh",
            expires_at=time.time() + 3600,
            extra={"api_base": "https://api.business.githubcopilot.com", "sku": "business"},
        )

    monkeypatch.setattr(
        "rotaris_core.auth.storage.TokenStorage.load",
        load_token,
    )

    (global_dir / "agents.yaml").write_text(
        """
models:
  copilot-gpt5:
    provider: openai
    model_id: gpt-5.3
    auth_provider: copilot
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)
    llm = loader.load_llm_for_model(config, "copilot-gpt5")

    token_dir = workspace_root / ".rotaris" / "litellm_cache"
    assert llm.model == "github_copilot/gpt-5.3"
    assert (token_dir / "access-token").read_text(encoding="utf-8") == "ghu_fake_refresh"
    payload = json.loads((token_dir / "api-key.json").read_text(encoding="utf-8"))
    assert payload["token"] == "tid=fresh-bearer"
    assert payload["endpoints"]["api"] == "https://api.business.githubcopilot.com"
    assert payload["sku"] == "business"
    assert os.environ["GITHUB_COPILOT_TOKEN_DIR"] == str(token_dir)


@verifies(SWR.SWR_701)
def test_load_llm_for_copilot_does_not_resolve_bearer_at_construction(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """LLM construction is non-authenticating.

    No HTTP calls, no token-cache reads. LiteLLM's authenticator only runs on the
    first API call. This test asserts the loader does not pre-warm credentials —
    if tokens are missing at request time, LiteLLM raises its own error.
    """
    import json
    import time

    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)

    # Pre-stage tokens (LLM construction triggers LiteLLM's
    # ``get_model_info`` → authenticator on import; without staged tokens this
    # would hang on device-flow polling).
    token_dir = workspace_root / ".rotaris" / "litellm_cache"
    token_dir.mkdir(parents=True, exist_ok=True)
    (token_dir / "access-token").write_text("ghu_fake_refresh", encoding="utf-8")
    (token_dir / "api-key.json").write_text(
        json.dumps(
            {
                "token": "tid=fresh-bearer",
                "expires_at": int(time.time()) + 3600,
                "endpoints": {"api": "https://api.githubcopilot.com"},
            },
        ),
        encoding="utf-8",
    )

    (global_dir / "agents.yaml").write_text(
        """
models:
  copilot-gpt5:
    provider: openai
    model_id: gpt-5.3
    auth_provider: copilot
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)
    llm = loader.load_llm_for_model(config, "copilot-gpt5")

    # Rotaris's old ``_get_litellm_api_key_value`` hook is gone — LiteLLM handles
    # bearer resolution internally via the staged files.
    assert not hasattr(llm, "_get_litellm_api_key_value") or (
        callable(getattr(llm, "_get_litellm_api_key_value", None))
        # Default SDK implementation returns ``api_key`` (may be None for Copilot).
    )
    # The constructed LLM does not embed a bearer — LiteLLM reads it per-call.
    assert llm.api_key is None or _llm_api_key_value(llm) in (None, "")


@verifies(SWR.SWR_702)
def test_load_llm_for_codex_auth_rewrites_platform_base_url_to_codex_backend(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    monkeypatch.setattr(
        loader, "_resolve_auth_provider_token", lambda *_args, **_kwargs: "codex-token"
    )
    (global_dir / "agents.yaml").write_text(
        """
models:
  codex-gpt55:
    provider: openai
    model_id: gpt-5.5
    base_url: https://api.openai.com/v1
    auth_provider: codex
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)
    llm = loader.load_llm_for_model(config, "codex-gpt55")

    assert llm.model == "openai/gpt-5.5"
    assert _llm_api_key_value(llm) == "codex-token"
    assert llm.base_url == loader._CODEX_BASE_URL
    assert llm.is_subscription
    assert llm.extra_headers is not None
    assert llm.extra_headers["originator"] == "codex_cli_rs"
    assert llm.litellm_extra_body == {"store": False}


@verifies(SWR.SWR_702)
def test_load_llm_for_codex_auth_defaults_to_codex_backend_when_base_url_missing(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    monkeypatch.setattr(
        loader, "_resolve_auth_provider_token", lambda *_args, **_kwargs: "codex-token"
    )
    (global_dir / "agents.yaml").write_text(
        """
models:
  codex-gpt55:
    provider: openai
    model_id: gpt-5.5
    auth_provider: codex
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)
    llm = loader.load_llm_for_model(config, "codex-gpt55")

    assert llm.base_url == loader._CODEX_BASE_URL


@verifies(SWR.SWR_702)
def test_load_llm_for_codex_auth_clears_inferred_max_output_tokens(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    monkeypatch.setattr(
        loader, "_resolve_auth_provider_token", lambda *_args, **_kwargs: "codex-token"
    )
    (global_dir / "agents.yaml").write_text(
        """
models:
  codex-gpt55:
    provider: openai
    model_id: gpt-5.5
    auth_provider: codex
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)
    llm = loader.load_llm_for_model(config, "codex-gpt55")

    assert llm.base_url == loader._CODEX_BASE_URL
    assert llm.is_subscription
    assert llm.temperature is None
    assert llm.max_output_tokens is None
    assert llm.prompt_cache_retention is None


@verifies(SWR.SWR_703)
def test_load_llm_for_codex_auth_includes_account_header_when_available(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    monkeypatch.setattr(
        loader, "_resolve_auth_provider_token", lambda *_args, **_kwargs: "codex-token"
    )

    from rotaris_core.auth import storage as storage_module

    class FakeStorage:
        def load(self, provider_id: str) -> TokenSet | None:
            assert provider_id == "codex"
            return TokenSet(
                access_token="codex-token",
                refresh_token="codex-refresh",
                account_id="acct-123",
            )

    monkeypatch.setattr(storage_module, "TokenStorage", FakeStorage)
    (global_dir / "agents.yaml").write_text(
        """
models:
  codex-gpt55:
    provider: openai
    model_id: gpt-5.5
    auth_provider: codex
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)
    llm = loader.load_llm_for_model(config, "codex-gpt55")

    assert llm.extra_headers is not None
    assert llm.extra_headers["chatgpt-account-id"] == "acct-123"


@verifies(SWR.SWR_702)
def test_load_llm_for_codex_auth_seeds_openhands_subscription_credentials(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    monkeypatch.setattr(
        loader, "_resolve_auth_provider_token", lambda *_args, **_kwargs: "codex-token"
    )

    from rotaris_core.auth import storage as storage_module

    class FakeStorage:
        def load(self, provider_id: str) -> TokenSet | None:
            assert provider_id == "codex"
            return TokenSet(
                access_token="codex-token",
                refresh_token="codex-refresh",
                expires_at=1_700_000_000.25,
                account_id="acct-123",
            )

    staged: list[TokenSet] = []

    def fake_stage(token_set: TokenSet) -> None:
        staged.append(token_set)

    monkeypatch.setattr(storage_module, "TokenStorage", FakeStorage)
    monkeypatch.setattr(
        "rotaris_core.auth.codex_bridge.stage_openhands_oauth_credentials",
        fake_stage,
    )
    (global_dir / "agents.yaml").write_text(
        """
models:
  codex-gpt55:
    provider: openai
    model_id: gpt-5.5
    auth_provider: codex
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)
    llm = loader.load_llm_for_model(config, "codex-gpt55")

    assert llm.auth_type == "subscription"
    assert llm.subscription_vendor == "openai"
    assert llm._subscription_credentials is not None
    assert llm._subscription_credentials.vendor == "openai"
    assert llm._subscription_credentials.access_token == "codex-token"
    assert llm._subscription_credentials.refresh_token == "codex-refresh"
    assert llm._subscription_credentials.expires_at == 1_700_000_000_250
    assert staged and staged[0].access_token == "codex-token"


@verifies(SWR.SWR_702)
def test_load_llm_for_codex_auth_omits_unsupported_responses_parameters(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    monkeypatch.setattr(
        loader, "_resolve_auth_provider_token", lambda *_args, **_kwargs: "codex-token"
    )
    (global_dir / "agents.yaml").write_text(
        """
models:
  codex-gpt55:
    provider: openai
    model_id: gpt-5.5
    auth_provider: codex
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)
    llm = loader.load_llm_for_model(config, "codex-gpt55", stream=True)
    options = select_responses_options(llm, {}, include=None, store=False)
    extra_body = getattr(llm, "litellm_extra_body", None) or {}

    assert llm.stream is True
    assert options["store"] is False
    assert options["tool_choice"] == "auto"
    assert "max_output_tokens" not in options
    assert "temperature" not in options
    assert "prompt_cache_retention" not in options
    assert "stream_options" not in extra_body


@verifies(SWR.SWR_703)
def test_resolve_auth_provider_token_accepts_codex_token_with_current_oauth_scopes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from rotaris_core.auth import storage as storage_module

    class FakeStorage:
        def load(self, provider_id: str) -> TokenSet | None:
            assert provider_id == "codex"
            return TokenSet(
                access_token="stored-token",
                refresh_token="refresh-token",
                extra={"requested_scopes": "openid profile email offline_access"},
            )

    monkeypatch.setattr(storage_module, "TokenStorage", FakeStorage)

    token = loader._resolve_auth_provider_token(
        "codex-model",
        SimpleNamespace(auth_provider="codex"),
    )

    assert token == "stored-token"


@verifies(SWR.SWR_3711)
def test_resolve_auth_provider_token_never_leaves_a_running_loop(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An authenticated credential is resolved without touching the event loop.

    Hosts build models from inside a running loop, so every hop out of one costs
    a thread carrying its own private loop — and a hop that fails takes the real
    error with it. Making ``run_auth_coro`` explode proves the usable-credential
    path never reaches it.
    """
    import asyncio

    from rotaris_core.auth import manager as manager_module
    from rotaris_core.auth import storage as storage_module

    class FakeStorage:
        def load(self, provider_id: str) -> TokenSet | None:
            assert provider_id == "codex"
            return TokenSet(
                access_token="stored-token",
                refresh_token="refresh-token",
                extra={"requested_scopes": "openid profile email offline_access"},
            )

    def explode(coro: object) -> None:
        coro.close()  # type: ignore[attr-defined]
        raise AssertionError("resolving an authenticated credential must not run a coroutine")

    monkeypatch.setattr(storage_module, "TokenStorage", FakeStorage)
    monkeypatch.setattr(manager_module, "run_auth_coro", explode)

    async def resolve_from_inside_a_loop() -> str | None:
        return loader._resolve_auth_provider_token(
            "codex-model",
            SimpleNamespace(auth_provider="codex"),
        )

    assert asyncio.run(resolve_from_inside_a_loop()) == "stored-token"


@verifies(SWR.SWR_316, SWR.SWR_1704)
def test_load_llm_for_model_does_not_double_prefix_provider(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (global_dir / "agents.yaml").write_text(
        """
personas:
  orchestrator:
    name: orchestrator
    model: vllm
models:
  vllm:
    provider: openai
    model_id: openai/google/gemma-4-26B-A4B-it
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)
    llm = loader.load_llm_for_model(config, "vllm")

    assert llm.model == "openai/google/gemma-4-26B-A4B-it"


@verifies(SWR.SWR_1704)
def test_load_llm_for_model_can_enable_streaming(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(litellm, "disable_streaming_logging", False)
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (global_dir / "agents.yaml").write_text(
        """
personas:
  orchestrator:
    name: orchestrator
    model: vllm
models:
  vllm:
    provider: openai
    model_id: openai/google/gemma-4-26B-A4B-it
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)
    llm = loader.load_llm_for_model(config, "vllm", stream=True)

    assert llm.stream is True
    assert litellm.disable_streaming_logging is True


@verifies(SWR.SWR_1704)
def test_load_llm_for_model_can_disable_streaming_per_model(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (global_dir / "agents.yaml").write_text(
        """
personas:
  orchestrator:
    name: orchestrator
    model: vllm
models:
  vllm:
    provider: openai
    model_id: openai/google/gemma-4-26B-A4B-it
    disable_streaming: true
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)
    llm = loader.load_llm_for_model(config, "vllm", stream=True)

    assert llm.stream is False


@verifies(SWR.SWR_703, SWR.SWR_720)
def test_load_llm_for_concrete_cloud_uses_stored_api_base(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)

    def load_token(_self: object, provider_id: str) -> TokenSet | None:
        if provider_id != "concrete-cloud":
            return None
        return TokenSet(
            access_token="jwt-access-token",
            refresh_token="refresh-token",
            expires_at=10_000_000_000.0,
            extra={"api_base": "http://app.localhost/v1"},
        )

    monkeypatch.setattr("rotaris_core.auth.storage.TokenStorage.load", load_token)
    (global_dir / "agents.yaml").write_text(
        """
models:
  cloud-model:
    provider: openai
    model_id: gpt-4.1-mini
    auth_provider: concrete-cloud
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)
    llm = loader.load_llm_for_model(config, "cloud-model")

    assert _llm_api_key_value(llm) == "jwt-access-token"
    assert llm.base_url == "http://app.localhost/v1"


@verifies(SWR.SWR_857, SWR.SWR_1704)
def test_load_llm_for_concrete_cloud_streaming_includes_usage_for_stored_api_base(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)

    def load_token(_self: object, provider_id: str) -> TokenSet | None:
        if provider_id != "concrete-cloud":
            return None
        return TokenSet(
            access_token="jwt-access-token",
            refresh_token="refresh-token",
            expires_at=10_000_000_000.0,
            extra={"api_base": "http://app.localhost/v1"},
        )

    monkeypatch.setattr("rotaris_core.auth.storage.TokenStorage.load", load_token)
    (global_dir / "agents.yaml").write_text(
        """
models:
  cloud-model:
    provider: openai
    model_id: gpt-4.1-mini
    auth_provider: concrete-cloud
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)
    llm = loader.load_llm_for_model(config, "cloud-model", stream=True)

    assert llm.stream is True
    extra_body = getattr(llm, "litellm_extra_body", None) or {}
    stream_options = extra_body.get("stream_options", {})
    assert stream_options.get("include_usage") is True


@verifies(SWR.SWR_1704)
def test_load_llm_for_model_generates_unique_usage_ids(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (global_dir / "agents.yaml").write_text(
        """
models:
  vllm:
    provider: openai
    model_id: openai/google/gemma-4-26B-A4B-it
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)
    first = loader.load_llm_for_model(config, "vllm")
    second = loader.load_llm_for_model(config, "vllm")

    assert first.usage_id.startswith("llm-vllm-")
    assert second.usage_id.startswith("llm-vllm-")
    assert first.usage_id != second.usage_id


@verifies(SWR.SWR_1704)
def test_load_llm_for_model_allows_explicit_usage_id(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (global_dir / "agents.yaml").write_text(
        """
models:
  vllm:
    provider: openai
    model_id: openai/google/gemma-4-26B-A4B-it
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)
    llm = loader.load_llm_for_model(config, "vllm", usage_id="summary-vllm-test")

    assert llm.usage_id == "summary-vllm-test"


@verifies(SWR.SWR_1704)
def test_load_llm_for_model_applies_model_limits_and_runtime_timeout(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (global_dir / "agents.yaml").write_text(
        """
runtime:
  model_timeout: 45
models:
  vllm:
    provider: openai
    model_id: openai/google/gemma-4-26B-A4B-it
    max_input_tokens: 20000
    max_output_tokens: 567
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)
    llm = loader.load_llm_for_model(config, "vllm")

    assert llm.timeout == 45
    assert llm.max_input_tokens == 20000
    assert llm.max_output_tokens == 567


@verifies(SWR.SWR_1704)
def test_load_config_applies_known_model_limits_for_manual_models(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (global_dir / "agents.yaml").write_text(
        """
models:
  openai-default:
    provider: openai
    model_id: gpt-4o
  copilot-default:
    provider: openai
    auth_provider: copilot
    base_url: https://api.githubcopilot.com
    model_id: gpt-4o-mini
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)

    assert config.models["openai-default"].max_input_tokens == 128000
    assert config.models["openai-default"].max_output_tokens == 16384
    assert config.models["copilot-default"].max_input_tokens == 128000
    assert config.models["copilot-default"].max_output_tokens == 16384


@verifies(SWR.SWR_1704)
def test_load_config_preserves_explicit_user_limit_over_registry(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (global_dir / "agents.yaml").write_text(
        """
models:
  openai-custom:
    provider: openai
    model_id: gpt-4o
    max_input_tokens: 64000
    max_output_tokens: 999
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)

    assert config.models["openai-custom"].max_input_tokens == 64000
    assert config.models["openai-custom"].max_output_tokens == 999


@verifies(SWR.SWR_1704)
def test_load_llm_for_model_applies_sampling_penalties_and_extra_body(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (global_dir / "agents.yaml").write_text(
        """
models:
  vllm:
    provider: openai
    model_id: openai/google/gemma-4-26B-A4B-it
    temperature: 0.2
    top_p: 0.9
    top_k: 40
    seed: 42
    presence_penalty: 0.5
    repetition_penalty: 1.1
    extra_body:
      return_token_ids: true
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)
    llm = loader.load_llm_for_model(config, "vllm")

    assert llm.temperature == 0.2
    assert llm.top_p == 0.9
    assert llm.top_k == 40
    assert llm.seed == 42
    assert llm.litellm_extra_body == {
        "presence_penalty": 0.5,
        "repetition_penalty": 1.1,
        "return_token_ids": True,
    }


@verifies(SWR.SWR_309)
def test_invalid_yaml_raises_clear_error(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    invalid_file = global_dir / "agents.yaml"
    invalid_file.write_text("personas: [broken", encoding="utf-8")

    with pytest.raises(ValueError, match=r"Invalid YAML.*agents\.yaml"):
        loader.load_config(workspace_root)


@verifies(SWR.SWR_854)
@pytest.mark.parametrize(
    ("level", "expected_effort"),
    [
        ("low", "low"),
        ("medium", "medium"),
        ("high", "high"),
        ("max", "xhigh"),
    ],
)
def test_load_llm_for_anthropic_model_sets_reasoning_effort(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    level: str,
    expected_effort: str,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (global_dir / "models.yml").write_text(
        f"""
models:
  claude-model:
    provider: anthropic
    model_id: claude-sonnet-4-20250514
    thinking: {level}
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)
    llm = loader.load_llm_for_model(config, "claude-model")

    assert llm.reasoning_effort == expected_effort


@verifies(SWR.SWR_855)
@pytest.mark.parametrize(
    ("level", "expected_effort"),
    [
        ("low", "low"),
        ("medium", "medium"),
        ("high", "high"),
        ("max", "xhigh"),
    ],
)
def test_load_llm_for_openai_model_sets_reasoning_effort(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    level: str,
    expected_effort: str,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (global_dir / "models.yml").write_text(
        f"""
models:
  o3-model:
    provider: openai
    model_id: o3-mini
    thinking: {level}
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)
    llm = loader.load_llm_for_model(config, "o3-model")

    assert llm.reasoning_effort == expected_effort


@verifies(SWR.SWR_861)
def test_load_llm_for_model_no_thinking_explicitly_clears_sdk_default(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Provider default must override OpenHands' reasoning_effort='high' default."""
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (global_dir / "models.yml").write_text(
        """
models:
  basic-model:
    provider: openai
    model_id: o3-mini
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)

    assert config.models["basic-model"].thinking is None
    assert loader._resolve_thinking_kwargs(config.models["basic-model"]) == {
        "reasoning_effort": None
    }
    assert loader.load_llm_for_model(config, "basic-model").reasoning_effort is None


@verifies(SWR.SWR_856, SWR.SWR_863)
def test_resolve_thinking_kwargs_unknown_model_delegates_to_litellm(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (global_dir / "models.yml").write_text(
        """
models:
  mystery-gpt:
    provider: openai
    model_id: custom-reasoner
    thinking: max
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)

    kwargs = loader._resolve_thinking_kwargs(config.models["mystery-gpt"])

    assert kwargs == {"reasoning_effort": "xhigh"}


@verifies(SWR.SWR_2096)
def test_custom_reasoning_effort_map_adapts_normalized_level(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (global_dir / "models.yml").write_text(
        """
models:
  custom-reasoner:
    provider: openai
    model_id: custom-reasoner
    thinking: low
    reasoning_effort_map:
      low: light
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)

    assert loader._resolve_thinking_kwargs(config.models["custom-reasoner"]) == {
        "reasoning_effort": "light"
    }
    assert loader.load_llm_for_model(config, "custom-reasoner").reasoning_effort == "light"


@verifies(SWR.SWR_861)
def test_load_llm_for_model_thinking_bool_true_uses_high_effort(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (global_dir / "models.yml").write_text(
        """
models:
  claude-model:
    provider: anthropic
    model_id: claude-sonnet-4-20250514
    thinking: true
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)
    llm = loader.load_llm_for_model(config, "claude-model")

    assert llm.reasoning_effort == "high"


@verifies(SWR.SWR_861)
def test_thinking_yaml_roundtrip_via_config_load(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME / "models.yml").write_text(
        """
models:
  my-claude:
    provider: anthropic
    model_id: claude-sonnet-4-20250514
    thinking: high
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)

    assert config.models["my-claude"].thinking == "high"


@verifies(SWR.SWR_864)
def test_load_config_synthesizes_startup_slot_model_for_thinking_override(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    workspace_config_dir = workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME
    workspace_config_dir.mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (workspace_config_dir / "agents.yaml").write_text(
        """
medium_model: claude-reasoner
medium_model_thinking: high
personas:
  coding-agent:
    model: medium_model
models:
  claude-reasoner:
    provider: anthropic
    model_id: claude-sonnet-4-20250514
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)

    assert config.medium_model == "__startup_slot__:medium_model"
    assert config.models[config.medium_model].thinking == "high"
    assert config.personas["coding-agent"].model == "__startup_slot__:medium_model"


# ---------------------------------------------------------------------------
# DeepSeek thinking / streaming tests
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_857)
def test_resolve_thinking_kwargs_deepseek_high(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (global_dir / "models.yml").write_text(
        """
models:
  ds:
    provider: deepseek
    model_id: deepseek-v4-pro
    thinking: high
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)

    kwargs = loader._resolve_thinking_kwargs(config.models["ds"])
    assert kwargs == {"reasoning_effort": "high"}


@verifies(SWR.SWR_857)
def test_resolve_thinking_kwargs_deepseek_none(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (global_dir / "models.yml").write_text(
        """
models:
  ds:
    provider: deepseek
    model_id: deepseek-v4-flash
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)

    assert config.models["ds"].thinking is None
    assert loader._resolve_thinking_kwargs(config.models["ds"]) == {"reasoning_effort": None}


@verifies(SWR.SWR_857)
def test_resolve_thinking_kwargs_deepseek_max_uses_litellm_xhigh(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Max uses LiteLLM's normalized xhigh spelling for every provider."""
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (global_dir / "models.yml").write_text(
        """
models:
  ds:
    provider: deepseek
    model_id: deepseek-v4-pro
    thinking: max
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)

    kwargs = loader._resolve_thinking_kwargs(config.models["ds"])
    assert kwargs == {"reasoning_effort": "xhigh"}


@verifies(SWR.SWR_856)
def test_load_llm_for_model_deepseek_thinking_delegates_translation(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (global_dir / "models.yml").write_text(
        """
models:
  ds:
    provider: deepseek
    model_id: deepseek-v4-pro
    thinking: high
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)
    llm = loader.load_llm_for_model(config, "ds")

    assert llm.reasoning_effort == "high"
    assert getattr(llm, "litellm_extra_body", None) in ({}, None)


@verifies(SWR.SWR_857)
def test_load_llm_for_model_deepseek_max_effort_survives_llm_construction(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (global_dir / "models.yml").write_text(
        """
models:
  ds:
    provider: deepseek
    model_id: deepseek-v4-pro
    thinking: max
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)
    llm = loader.load_llm_for_model(config, "ds")

    assert llm.reasoning_effort == "xhigh"


@verifies(SWR.SWR_856)
def test_load_llm_for_model_deepseek_no_thinking_no_extra_body(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (global_dir / "models.yml").write_text(
        """
models:
  ds:
    provider: deepseek
    model_id: deepseek-v4-flash
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)
    llm = loader.load_llm_for_model(config, "ds")

    extra_body = getattr(llm, "litellm_extra_body", None) or {}
    assert "thinking" not in extra_body


@verifies(SWR.SWR_856, SWR.SWR_858, SWR.SWR_756)
def test_load_llm_for_model_deepseek_streaming_usage_included(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (global_dir / "models.yml").write_text(
        """
models:
  ds:
    provider: deepseek
    model_id: deepseek-v4-pro
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)
    llm = loader.load_llm_for_model(config, "ds", stream=True)

    extra_body = getattr(llm, "litellm_extra_body", None) or {}
    stream_options = extra_body.get("stream_options", {})
    assert stream_options.get("include_usage") is True


@verifies(SWR.SWR_856)
def test_load_llm_for_model_disable_streaming_skips_stream_usage_options(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (global_dir / "models.yml").write_text(
        """
models:
  ds:
    provider: deepseek
    model_id: deepseek-v4-pro
    disable_streaming: true
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)
    llm = loader.load_llm_for_model(config, "ds", stream=True)

    assert llm.stream is False
    extra_body = getattr(llm, "litellm_extra_body", None) or {}
    assert "stream_options" not in extra_body


# ---------------------------------------------------------------------------
# MCP discovery integration tests
# ---------------------------------------------------------------------------


def _patch_home_loader(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    fake_home = tmp_path / "home"
    fake_home.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(Path, "home", staticmethod(lambda: fake_home))
    monkeypatch.setenv("APPDATA", str(fake_home / "AppData" / "Roaming"))
    return fake_home


def _write_mcp_json(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data), encoding="utf-8")


@verifies(SWR.SWR_1706, SWR.SWR_1708)
def test_load_config_with_project_mcp_json(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    global_dir = tmp_path / "empty_global"
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    _patch_home_loader(monkeypatch, tmp_path)

    _write_mcp_json(
        workspace_root / ".mcp.json",
        {"mcpServers": {"foo": {"command": "npx", "args": ["-y", "foo-server"]}}},
    )

    config = loader.load_config(workspace_root)

    assert "foo" in config.mcp_servers
    assert config.mcp_servers["foo"].command == "npx"
    assert config.mcp_server_sources["foo"] == "discovered-project"


@verifies(SWR.SWR_1708)
def test_load_config_yaml_wins_over_mcp_json(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "empty_global"
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    workspace_config_dir = workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME
    workspace_config_dir.mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    _patch_home_loader(monkeypatch, tmp_path)

    _write_mcp_json(
        workspace_root / ".mcp.json",
        {"mcpServers": {"foo": {"command": "from-discovery", "args": []}}},
    )
    (workspace_config_dir / "agents.yaml").write_text(
        """
mcp_servers:
  foo:
    command: from-yaml
    args: []
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)

    assert config.mcp_servers["foo"].command == "from-yaml"
    assert config.mcp_server_sources["foo"] == "yaml"


@verifies(SWR.SWR_1706)
def test_load_config_mcp_json_missing_silently_ignored(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "empty_global"
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    _patch_home_loader(monkeypatch, tmp_path)

    config = loader.load_config(workspace_root)

    assert config.workspace_root == workspace_root
    assert all(label == "default" for label in config.mcp_server_sources.values())


@verifies(SWR.SWR_1714)
def test_load_config_source_map_populated_for_all_servers(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "empty_global"
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    workspace_config_dir = workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME
    workspace_config_dir.mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    _patch_home_loader(monkeypatch, tmp_path)

    _write_mcp_json(
        workspace_root / ".mcp.json",
        {"mcpServers": {"disc-server": {"command": "disc-cmd", "args": []}}},
    )
    (workspace_config_dir / "agents.yaml").write_text(
        """
mcp_servers:
  yaml-server:
    command: yaml-cmd
    args: []
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)

    assert config.mcp_server_sources["yaml-server"] == "yaml"
    assert config.mcp_server_sources["disc-server"] == "discovered-project"


@verifies(SWR.SWR_1708)
def test_load_config_yaml_only_server_source_is_yaml(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "empty_global"
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    workspace_config_dir = workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME
    workspace_config_dir.mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    _patch_home_loader(monkeypatch, tmp_path)

    (workspace_config_dir / "agents.yaml").write_text(
        """
mcp_servers:
  my-server:
    command: my-cmd
    args: []
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)

    assert "my-server" in config.mcp_servers
    assert config.mcp_server_sources["my-server"] == "yaml"


@verifies(SWR.SWR_1706)
def test_load_config_discovered_only_server_source_label(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "empty_global"
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    _patch_home_loader(monkeypatch, tmp_path)

    _write_mcp_json(
        workspace_root / ".mcp.json",
        {"mcpServers": {"disc-only": {"command": "some-cmd", "args": []}}},
    )

    config = loader.load_config(workspace_root)

    assert "disc-only" in config.mcp_servers
    assert config.mcp_server_sources["disc-only"] == "discovered-project"


@verifies(SWR.SWR_1710)
def test_load_config_invalid_mcp_json_does_not_crash(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "empty_global"
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    _patch_home_loader(monkeypatch, tmp_path)

    (workspace_root / ".mcp.json").write_text("{not valid json}", encoding="utf-8")

    config = loader.load_config(workspace_root)

    assert config.workspace_root == workspace_root
    assert all(label != "discovered-project" for label in config.mcp_server_sources.values())


@verifies(SWR.SWR_1707, SWR.SWR_1709)
def test_load_config_http_server_discovered(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "empty_global"
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    _patch_home_loader(monkeypatch, tmp_path)

    _write_mcp_json(
        workspace_root / ".mcp.json",
        {"mcpServers": {"remote": {"type": "http", "url": "https://x.example.com/mcp"}}},
    )

    config = loader.load_config(workspace_root)

    assert "remote" in config.mcp_servers
    assert config.mcp_servers["remote"].type == "http"
    assert config.mcp_servers["remote"].url == "https://x.example.com/mcp"
    assert config.mcp_server_sources["remote"] == "discovered-project"


@verifies(SWR.SWR_854)
def test_load_config_backfills_base_url_from_catalog_when_provider_snapshot_has_null(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Snapshot providers may persist base_url: null (e.g. DeepSeek login bug).

    The loader must backfill from the built-in provider catalog's default_base_url
    so that requests are routed to the correct API endpoint.
    """
    from rotaris_core.config.project_snapshot import (
        ProjectSnapshot,
        SnapshotModel,
        SnapshotProvider,
        write_snapshot,
    )
    from rotaris_core.providers.catalog import get_provider

    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)

    # Stage a project snapshot with a DeepSeek provider that has base_url: null.
    deepseek_default_url = get_provider("deepseek").default_base_url
    snapshot = ProjectSnapshot(
        providers={
            "deepseek": SnapshotProvider(
                id="deepseek",
                display_name="DeepSeek",
                family="deepseek",
                base_url=None,  # THE BUG: null base_url
                authenticated=True,
                models=[
                    SnapshotModel(
                        id="deepseek/deepseek-v4-pro",
                        display_name="DeepSeek V4 Pro",
                        discovered_at="2026-01-01T00:00:00Z",
                    ),
                    SnapshotModel(
                        id="deepseek/deepseek-v4-flash",
                        display_name="DeepSeek V4 Flash",
                        discovered_at="2026-01-01T00:00:00Z",
                    ),
                ],
                small_model="deepseek/deepseek-v4-flash",
                medium_model="deepseek/deepseek-v4-flash",
                large_model="deepseek/deepseek-v4-pro",
                default_summary_model="deepseek/deepseek-v4-flash",
                discovered_at="2026-01-01T00:00:00Z",
            ),
        },
    )
    write_snapshot(snapshot, base=global_dir)

    # Set up the workspace agents.yaml to use deepseek models.
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME / "agents.yaml").write_text(
        """
small_model: deepseek/deepseek-v4-flash
medium_model: deepseek/deepseek-v4-flash
large_model: deepseek/deepseek-v4-pro
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)

    # The loaded model configs must have the catalog's default base_url,
    # NOT null.
    assert "deepseek/deepseek-v4-pro" in config.models
    assert config.models["deepseek/deepseek-v4-pro"].base_url == deepseek_default_url
    assert config.models["deepseek/deepseek-v4-flash"].base_url == deepseek_default_url


@verifies(SWR.SWR_854)
def test_load_config_backfills_partial_yaml_override_from_snapshot_model(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from rotaris_core.config.project_snapshot import (
        ProjectSnapshot,
        SnapshotModel,
        SnapshotProvider,
        write_snapshot,
    )

    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    workspace_config_dir = workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME
    workspace_config_dir.mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)

    write_snapshot(
        ProjectSnapshot(
            providers={
                "deepseek": SnapshotProvider(
                    id="deepseek",
                    display_name="DeepSeek",
                    family="deepseek",
                    base_url="https://api.deepseek.com/v1",
                    authenticated=True,
                    models=[
                        SnapshotModel(
                            id="deepseek/deepseek-v4-pro",
                            display_name="DeepSeek V4 Pro",
                            discovered_at="2026-01-01T00:00:00+00:00",
                        ),
                    ],
                    small_model="deepseek/deepseek-v4-pro",
                    medium_model="deepseek/deepseek-v4-pro",
                    large_model="deepseek/deepseek-v4-pro",
                    default_summary_model="deepseek/deepseek-v4-pro",
                    discovered_at="2026-01-01T00:00:00+00:00",
                ),
            },
        ),
        base=global_dir,
    )
    (workspace_config_dir / "agents.yaml").write_text(
        """
large_model: deepseek/deepseek-v4-pro
models:
  deepseek/deepseek-v4-pro:
    context_compression_threshold: 250000
""".strip(),
        encoding="utf-8",
    )

    config = loader.load_config(workspace_root)

    assert config.large_model == "deepseek/deepseek-v4-pro"
    assert config.models["deepseek/deepseek-v4-pro"].provider == "deepseek"
    assert config.models["deepseek/deepseek-v4-pro"].model_id == "deepseek-v4-pro"
    assert config.models["deepseek/deepseek-v4-pro"].context_compression_threshold == 250000


@verifies(SWR.SWR_837)
def test_load_llm_for_model_forwards_configured_pricing(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Both prices reach the SDK, which hands them to LiteLLM as custom pricing."""
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (global_dir / "agents.yaml").write_text(
        """
personas:
  orchestrator:
    name: orchestrator
    model: vllm
models:
  vllm:
    provider: openai
    model_id: openai/Qwen/Qwen3.6-35B-A3B
    api_key_env: MODEL_TOKEN
    input_cost_per_token: 0.0000004
    output_cost_per_token: 0.0000012
""".strip(),
        encoding="utf-8",
    )
    monkeypatch.setenv("MODEL_TOKEN", "token")

    config = loader.load_config(workspace_root)
    llm = loader.load_llm_for_model(config, "vllm")

    assert llm.input_cost_per_token == 0.0000004
    assert llm.output_cost_per_token == 0.0000012


@verifies(SWR.SWR_837, SWR.SWR_838)
def test_load_llm_for_model_omits_pricing_when_unconfigured(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Unpriced models must keep today's LiteLLM behaviour, not a fabricated price."""
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    (global_dir / "agents.yaml").write_text(
        """
personas:
  orchestrator:
    name: orchestrator
    model: vllm
models:
  vllm:
    provider: openai
    model_id: openai/Qwen/Qwen3.6-35B-A3B
    api_key_env: MODEL_TOKEN
""".strip(),
        encoding="utf-8",
    )
    monkeypatch.setenv("MODEL_TOKEN", "token")

    config = loader.load_config(workspace_root)
    llm = loader.load_llm_for_model(config, "vllm")

    assert llm.input_cost_per_token is None
    assert llm.output_cost_per_token is None


def _no_response_retry_state(kwargs: dict[str, object]) -> SimpleNamespace:
    from openhands.sdk.llm.exceptions import LLMNoResponseError

    exc = LLMNoResponseError("LLM returned no response")
    return SimpleNamespace(
        outcome=SimpleNamespace(exception=lambda: exc),
        kwargs=kwargs,
        attempt_number=1,
    )


@verifies(SWR.SWR_702)
def test_no_response_retry_skips_temperature_injection_for_codex_backend() -> None:
    llm = SimpleNamespace(base_url=loader._CODEX_BASE_URL, log_retry_attempt=lambda state: None)
    kwargs: dict[str, object] = {}

    loader._quota_aware_before_sleep(
        llm,
        _no_response_retry_state(kwargs),
        num_retries=5,
        retry_listener=None,
    )

    assert "temperature" not in kwargs


@verifies(SWR.SWR_702)
def test_no_response_retry_still_injects_temperature_for_regular_backends() -> None:
    llm = SimpleNamespace(base_url=None, log_retry_attempt=lambda state: None)
    kwargs: dict[str, object] = {}

    loader._quota_aware_before_sleep(
        llm,
        _no_response_retry_state(kwargs),
        num_retries=5,
        retry_listener=None,
    )

    assert kwargs["temperature"] == 1.0
