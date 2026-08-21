"""Unit tests for the Claude Code subscription provider (SWR-777).

Productive use: a user who pays for a Claude Code subscription can run
Rotaris personas against that subscription instead of API billing.
Expected outcome: subscription tokens are validated, conflicting API/gateway
credentials refuse the run with an actionable error, and Agent SDK requests
are capped per model.
"""

from __future__ import annotations

import json
import logging
import sys
import threading
import types
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

import pytest

from rotaris_core.auth.claude_code import ClaudeCodeAuthProvider
from rotaris_core.auth.provider import AuthFlowType, AuthStatus, TokenSet
from rotaris_core.config.schema import ModelConfig
from rotaris_core.providers.claude_code import (
    CONFLICTING_ENV_VARS,
    ClaudeCodeCredentialConflictError,
    claude_code_models,
    detect_conflicting_credentials,
    ensure_no_conflicting_credentials,
    subscription_token_validation_error,
)
from rotaris_core.providers.claude_code_runtime import (
    SUBAGENT_TOOLS,
    ClaudeCodeRunResult,
    ClaudeCodeRuntime,
    build_claude_code_llm,
)
from rotaris_core.providers.discovery import discover_models
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from pathlib import Path

_VALID_TOKEN = "sk-ant-oat01-test-token"


# ---------------------------------------------------------------------------
# Token validation
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_777)
def test_subscription_token_accepts_setup_token() -> None:
    assert subscription_token_validation_error(_VALID_TOKEN) is None


@verifies(SWR.SWR_777)
def test_subscription_token_rejects_api_key_to_prevent_api_billing() -> None:
    error = subscription_token_validation_error("sk-ant-api03-real-key")
    assert error is not None
    assert "API" in error
    assert "claude setup-token" in error


@verifies(SWR.SWR_777)
@pytest.mark.parametrize("token", ["", "   ", "ghu_something", "sk-ant-other"])
def test_subscription_token_rejects_non_subscription_values(token: str) -> None:
    assert subscription_token_validation_error(token) is not None


# ---------------------------------------------------------------------------
# Conflicting-credential precheck
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_777)
@pytest.mark.parametrize("var_name", CONFLICTING_ENV_VARS)
def test_conflicting_env_var_detected(var_name: str, tmp_path: Path) -> None:
    conflicts = detect_conflicting_credentials(
        {var_name: "some-value"},
        claude_settings_path=tmp_path / "settings.json",
    )
    assert conflicts == (var_name,)


@verifies(SWR.SWR_777)
def test_api_key_helper_in_claude_settings_detected(tmp_path: Path) -> None:
    settings = tmp_path / "settings.json"
    settings.write_text(json.dumps({"apiKeyHelper": "/usr/local/bin/helper.sh"}))
    conflicts = detect_conflicting_credentials({}, claude_settings_path=settings)
    assert conflicts == ("apiKeyHelper (~/.claude/settings.json)",)


@verifies(SWR.SWR_777)
def test_clean_environment_has_no_conflicts(tmp_path: Path) -> None:
    assert detect_conflicting_credentials({}, claude_settings_path=tmp_path / "settings.json") == ()
    ensure_no_conflicting_credentials({}, claude_settings_path=tmp_path / "settings.json")


@verifies(SWR.SWR_777)
def test_conflict_error_names_variable_and_remedy(tmp_path: Path) -> None:
    with pytest.raises(ClaudeCodeCredentialConflictError) as excinfo:
        ensure_no_conflicting_credentials(
            {"ANTHROPIC_API_KEY": "sk-ant-api03-x"},
            claude_settings_path=tmp_path / "settings.json",
        )
    message = str(excinfo.value)
    assert "ANTHROPIC_API_KEY" in message
    assert "unset" in message.lower()
    assert excinfo.value.conflicts == ("ANTHROPIC_API_KEY",)


# ---------------------------------------------------------------------------
# Static discovery
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_777)
def test_discovery_returns_static_subscription_models_offline() -> None:
    result = discover_models("claude-code", token=_VALID_TOKEN)
    assert result.error is None
    ids = [model.qualified_id for model in result.models]
    assert ids == ["claude-code/opus", "claude-code/sonnet", "claude-code/haiku"]


@verifies(SWR.SWR_777)
def test_discovery_rejects_pasted_api_key() -> None:
    result = discover_models("claude-code", token="sk-ant-api03-real-key")
    assert result.models == []
    assert result.error is not None and "claude setup-token" in result.error


@verifies(SWR.SWR_777)
def test_claude_code_models_use_evergreen_aliases() -> None:
    models = claude_code_models()
    assert [model.id for model in models] == ["opus", "sonnet", "haiku"]


# ---------------------------------------------------------------------------
# Concurrency default (DeepSeek precedent, SWR-919/920)
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_777)
def test_model_config_defaults_max_parallel_for_claude_code() -> None:
    config = ModelConfig(provider="claude-code", model_id="sonnet")
    assert config.max_parallel == 2


@verifies(SWR.SWR_777)
def test_model_config_max_parallel_override_respected() -> None:
    config = ModelConfig(provider="claude-code", model_id="sonnet", max_parallel=5)
    assert config.max_parallel == 5


# ---------------------------------------------------------------------------
# Auth provider
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_777)
async def test_auth_provider_instructs_setup_token_flow() -> None:
    provider = ClaudeCodeAuthProvider()
    assert provider.provider_id == "claude-code"
    assert provider.flow_type == AuthFlowType.API_KEY
    result = await provider.authenticate()
    assert result.success is False
    assert result.error is not None and "claude setup-token" in result.error


@verifies(SWR.SWR_777)
async def test_auth_provider_status_requires_subscription_token() -> None:
    provider = ClaudeCodeAuthProvider()
    valid = TokenSet(access_token=_VALID_TOKEN, refresh_token="")
    api_key = TokenSet(access_token="sk-ant-api03-x", refresh_token="")
    empty = TokenSet(access_token="", refresh_token="")
    assert await provider.check_status(valid) == AuthStatus.AUTHENTICATED
    assert await provider.check_status(api_key) == AuthStatus.UNAUTHENTICATED
    assert await provider.check_status(empty) == AuthStatus.UNAUTHENTICATED


# ---------------------------------------------------------------------------
# Agent SDK runtime
# ---------------------------------------------------------------------------


@dataclass
class _FakeSdkState:
    options: list[Any] = field(default_factory=list)
    prompts: list[str] = field(default_factory=list)
    active: int = 0
    peak: int = 0
    lock: threading.Lock = field(default_factory=threading.Lock)


def _install_fake_sdk(
    monkeypatch: pytest.MonkeyPatch,
    *,
    hold_seconds: float = 0.0,
    tool_uses: list[tuple[str, dict[str, Any]]] | None = None,
) -> _FakeSdkState:
    state = _FakeSdkState()
    module = types.ModuleType("claude_agent_sdk")

    class TextBlock:
        def __init__(self, text: str) -> None:
            self.text = text

    class AssistantMessage:
        def __init__(self, content: list[Any]) -> None:
            self.content = content

    class ResultMessage:
        def __init__(self, subtype: str, session_id: str, *, is_error: bool = False) -> None:
            self.subtype = subtype
            self.session_id = session_id
            self.is_error = is_error

    class ToolUseBlock:
        def __init__(self, name: str, tool_input: dict[str, Any]) -> None:
            self.name = name
            self.input = tool_input

    class ClaudeAgentOptions:
        def __init__(self, **kwargs: Any) -> None:
            self.kwargs = kwargs

    async def query(*, prompt: str, options: Any) -> Any:
        import asyncio

        with state.lock:
            state.prompts.append(prompt)
            state.options.append(options)
            state.active += 1
            state.peak = max(state.peak, state.active)
        try:
            if hold_seconds:
                await asyncio.sleep(hold_seconds)
            for name, tool_input in tool_uses or []:
                yield AssistantMessage(content=[ToolUseBlock(name, tool_input)])
            yield AssistantMessage(content=[TextBlock("hello "), TextBlock("world")])
            yield ResultMessage("success", "sess-1")
        finally:
            with state.lock:
                state.active -= 1

    module.TextBlock = TextBlock  # type: ignore[attr-defined]
    module.ToolUseBlock = ToolUseBlock  # type: ignore[attr-defined]
    module.AssistantMessage = AssistantMessage  # type: ignore[attr-defined]
    module.ResultMessage = ResultMessage  # type: ignore[attr-defined]
    module.ClaudeAgentOptions = ClaudeAgentOptions  # type: ignore[attr-defined]
    module.query = query  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "claude_agent_sdk", module)
    return state


@verifies(SWR.SWR_777)
def test_runtime_denies_subagent_spawning_tools(monkeypatch: pytest.MonkeyPatch) -> None:
    """The CLI must not fan out to its own subagents inside one completion."""
    state = _install_fake_sdk(monkeypatch)
    ClaudeCodeRuntime().run_prompt(
        "Say hello",
        model="sonnet",
        oauth_token=_VALID_TOKEN,
        env={},
    )
    assert state.options[0].kwargs["disallowed_tools"] == list(SUBAGENT_TOOLS)
    assert "Agent" in SUBAGENT_TOOLS


@verifies(SWR.SWR_777)
def test_runtime_logs_tool_progress_during_long_runs(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """A silent multi-minute run is indistinguishable from a hang."""
    _install_fake_sdk(
        monkeypatch,
        tool_uses=[("Grep", {"pattern": "marktanalyse"}), ("Read", {"file_path": "README.md"})],
    )
    with caplog.at_level(logging.INFO, logger="rotaris_core.providers.claude_code_runtime"):
        result = ClaudeCodeRuntime().run_prompt(
            "Find it",
            model="sonnet",
            oauth_token=_VALID_TOKEN,
            env={},
        )

    assert result.text == "hello world"
    messages = [record.getMessage() for record in caplog.records]
    assert any("run started" in message for message in messages)
    assert any("Grep marktanalyse" in message for message in messages)
    assert any("Read README.md" in message for message in messages)
    assert any("2 tool calls" in message for message in messages)


@verifies(SWR.SWR_777)
def test_runtime_executes_through_agent_sdk_with_subscription_token(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    state = _install_fake_sdk(monkeypatch)
    runtime = ClaudeCodeRuntime()
    result = runtime.run_prompt(
        "Say hello",
        model="sonnet",
        oauth_token=_VALID_TOKEN,
        system_prompt="be brief",
        env={},
        claude_settings_path=tmp_path / "settings.json",
    )
    assert result.text == "hello world"
    assert result.subtype == "success"
    assert result.session_id == "sess-1"
    assert result.is_error is False
    assert state.prompts == ["Say hello"]
    option_kwargs = state.options[0].kwargs
    assert option_kwargs["model"] == "sonnet"
    assert option_kwargs["system_prompt"] == "be brief"
    assert option_kwargs["env"]["CLAUDE_CODE_OAUTH_TOKEN"] == _VALID_TOKEN


@verifies(SWR.SWR_777)
def test_runtime_refuses_run_on_conflicting_credential(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    state = _install_fake_sdk(monkeypatch)
    runtime = ClaudeCodeRuntime()
    with pytest.raises(ClaudeCodeCredentialConflictError) as excinfo:
        runtime.run_prompt(
            "Say hello",
            model="sonnet",
            oauth_token=_VALID_TOKEN,
            env={"ANTHROPIC_AUTH_TOKEN": "other"},
            claude_settings_path=tmp_path / "settings.json",
        )
    assert "ANTHROPIC_AUTH_TOKEN" in str(excinfo.value)
    assert state.prompts == []  # SDK never invoked


@verifies(SWR.SWR_777)
def test_runtime_rejects_api_key_token(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    state = _install_fake_sdk(monkeypatch)
    runtime = ClaudeCodeRuntime()
    with pytest.raises(ValueError, match="claude setup-token"):
        runtime.run_prompt(
            "Say hello",
            model="sonnet",
            oauth_token="sk-ant-api03-real-key",
            env={},
            claude_settings_path=tmp_path / "settings.json",
        )
    assert state.prompts == []


@verifies(SWR.SWR_777)
def test_runtime_caps_per_model_concurrency(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    state = _install_fake_sdk(monkeypatch, hold_seconds=0.05)
    runtime = ClaudeCodeRuntime()

    def _run() -> ClaudeCodeRunResult:
        return runtime.run_prompt(
            "work",
            model="sonnet",
            oauth_token=_VALID_TOKEN,
            max_parallel=2,
            env={},
            claude_settings_path=tmp_path / "settings.json",
        )

    with ThreadPoolExecutor(max_workers=5) as pool:
        results = [future.result() for future in [pool.submit(_run) for _ in range(5)]]

    assert len(results) == 5
    assert all(result.text == "hello world" for result in results)
    assert state.peak <= 2


# ---------------------------------------------------------------------------
# LLM shim (distinct execution path into the persona flow)
# ---------------------------------------------------------------------------


class _StubRuntime:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    def run_prompt(self, prompt: str, **kwargs: Any) -> ClaudeCodeRunResult:
        self.calls.append({"prompt": prompt, **kwargs})
        return ClaudeCodeRunResult(text="42", subtype="success", session_id="sess-2")


@verifies(SWR.SWR_777)
def test_claude_code_llm_reports_results_into_persona_flow() -> None:
    from openhands.sdk.llm.llm import LLM
    from openhands.sdk.llm.message import Message, TextContent

    stub = _StubRuntime()
    llm = build_claude_code_llm(
        base_cls=LLM,
        model_id="sonnet",
        max_parallel=None,
        usage_id="test-usage",
        workspace_root="/tmp/ws",
        token_loader=lambda: _VALID_TOKEN,
        runtime=stub,  # type: ignore[arg-type]
    )
    response = llm.completion(
        [
            Message(role="system", content=[TextContent(text="be brief")]),
            Message(role="user", content=[TextContent(text="what is 6*7?")]),
        ],
    )
    assert response.message.role == "assistant"
    assert response.message.content[0].text == "42"  # type: ignore[union-attr]
    call = stub.calls[0]
    assert call["model"] == "sonnet"
    assert call["system_prompt"] == "be brief"
    assert "what is 6*7?" in call["prompt"]
    assert call["oauth_token"] == _VALID_TOKEN
    assert call["cwd"] == "/tmp/ws"
    assert call["max_parallel"] == 2  # provider default when unset


@verifies(SWR.SWR_777)
def test_claude_code_llm_requires_authentication() -> None:
    from openhands.sdk.llm.llm import LLM
    from openhands.sdk.llm.message import Message, TextContent

    llm = build_claude_code_llm(
        base_cls=LLM,
        model_id="sonnet",
        max_parallel=None,
        usage_id="test-usage",
        workspace_root=None,
        token_loader=lambda: None,
        runtime=_StubRuntime(),  # type: ignore[arg-type]
    )
    with pytest.raises(RuntimeError, match="rotaris-cli login"):
        llm.completion([Message(role="user", content=[TextContent(text="hi")])])
