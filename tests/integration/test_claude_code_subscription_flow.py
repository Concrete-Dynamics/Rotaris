"""Hermetic user-flow E2E for the Claude Code subscription provider (SWR-777).

Productive use: a user registers the ``claude-code`` provider with a token
minted by ``claude setup-token``, runs a persona request against the
subscription through the Agent SDK's local runtime, and logs out again.
Expected outcome: the token is stored through the credential-separation
architecture (never in workspace files or snapshots), requests execute
through the Agent SDK path, and logout returns the provider to the
unauthenticated state.
"""

from __future__ import annotations

import importlib.util
import json
import os
import stat
import sys
import types
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

import pytest

from rotaris_core.auth.logout import logout_provider
from rotaris_core.auth.storage import TokenStorage
from rotaris_core.cli.auth_flow import LoginUI, run_login
from rotaris_core.config.loader import load_config, load_llm_for_model
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from pathlib import Path

_VALID_TOKEN = "sk-ant-oat01-integration-token"


@dataclass(frozen=True)
class _FakeUI(LoginUI):
    secret_responses: list[str | None] = field(default_factory=list)
    infos: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    def choose_provider(self, options: list[tuple[str, str]]) -> str | None:
        return None

    def prompt_text(self, prompt: str, *, default: str | None = None) -> str | None:
        return default

    def prompt_secret(self, prompt: str) -> str | None:
        return self.secret_responses.pop(0) if self.secret_responses else None

    def choose_model(
        self,
        prompt: str,
        options: list[tuple[str, str]],
        *,
        default: str | None = None,
        allow_skip: bool = False,
    ) -> str | None:
        return default

    def show_auth_prompt(self, *, verification_url: str, user_code: str, message: str) -> None:
        return None

    def info(self, message: str) -> None:
        self.infos.append(message)

    def warning(self, message: str) -> None:
        return None

    def error(self, message: str) -> None:
        self.errors.append(message)

    def confirm(self, prompt: str, *, default: bool = False) -> bool:
        return False

    def choose_recovery(self) -> str:
        return "abort"


def _isolate_user_dirs(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    global_config = tmp_path / "global-config"
    monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", global_config)
    monkeypatch.setattr("rotaris_core.config.project_snapshot._GLOBAL_CONFIG_DIR", global_config)
    monkeypatch.setattr(
        "rotaris_core.auth.storage._get_default_token_dir",
        lambda: tmp_path / "tokens",
    )
    monkeypatch.setattr(
        "rotaris_core.cli.editor_launcher.launch_editor",
        lambda path, *, blocking=False: type(
            "EditorResult",
            (),
            {"launched": False, "error": None},
        )(),
    )
    # Hermetic credential precheck: ignore the developer machine's real env
    # and ~/.claude/settings.json.
    for var in (
        "ANTHROPIC_AUTH_TOKEN",
        "ANTHROPIC_API_KEY",
        "CLAUDE_CODE_USE_BEDROCK",
        "CLAUDE_CODE_USE_VERTEX",
        "CLAUDE_CODE_USE_FOUNDRY",
    ):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setattr(
        "rotaris_core.providers.claude_code._default_claude_settings_path",
        lambda: tmp_path / "claude-settings.json",
    )
    return global_config


def _install_fake_sdk(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    captured: dict[str, Any] = {}
    module = types.ModuleType("claude_agent_sdk")

    class TextBlock:
        def __init__(self, text: str) -> None:
            self.text = text

    class AssistantMessage:
        def __init__(self, content: list[Any]) -> None:
            self.content = content

    class ResultMessage:
        def __init__(self) -> None:
            self.subtype = "success"
            self.session_id = "sess-e2e"
            self.is_error = False

    class ClaudeAgentOptions:
        def __init__(self, **kwargs: Any) -> None:
            self.kwargs = kwargs

    async def query(*, prompt: str, options: Any) -> Any:
        captured["prompt"] = prompt
        captured["options"] = options.kwargs
        yield AssistantMessage([TextBlock("subscription says hi")])
        yield ResultMessage()

    module.TextBlock = TextBlock  # type: ignore[attr-defined]
    module.AssistantMessage = AssistantMessage  # type: ignore[attr-defined]
    module.ResultMessage = ResultMessage  # type: ignore[attr-defined]
    module.ClaudeAgentOptions = ClaudeAgentOptions  # type: ignore[attr-defined]
    module.query = query  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "claude_agent_sdk", module)
    return captured


@verifies(SWR.SWR_777)
def test_register_run_and_logout_claude_code(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    global_config = _isolate_user_dirs(monkeypatch, tmp_path)
    captured = _install_fake_sdk(monkeypatch)
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    # 1. Register: instructions shown, token pasted, static models discovered.
    ui = _FakeUI(secret_responses=[_VALID_TOKEN])
    login_result = run_login("claude-code", workspace_root=workspace, reauth=False, ui=ui)
    assert login_result.success, login_result.message
    assert login_result.models_discovered == 3
    assert any("claude setup-token" in message for message in ui.infos)

    # 2. Credential separation: token stored 0600, never in workspace/snapshot.
    token_file = tmp_path / "tokens" / "claude-code.json"
    assert token_file.exists()
    if os.name != "nt":  # Windows does not preserve POSIX owner bits
        assert stat.S_IMODE(token_file.stat().st_mode) == 0o600
    stored = json.loads(token_file.read_text())
    assert stored["access_token"] == _VALID_TOKEN
    for artifact in [*global_config.rglob("*"), *workspace.rglob("*")]:
        if artifact.is_file():
            assert _VALID_TOKEN not in artifact.read_text(errors="ignore")

    # 3. Run: the model resolves through the Agent SDK path, never LiteLLM.
    config = load_config(workspace)
    model_cfg = config.models["claude-code/sonnet"]
    assert model_cfg.auth_provider == "claude-code"
    assert model_cfg.provider == "claude-code"
    assert model_cfg.max_parallel == 2

    from openhands.sdk.llm.message import Message, TextContent

    llm = load_llm_for_model(config, "claude-code/sonnet")
    response = llm.completion([Message(role="user", content=[TextContent(text="hello?")])])
    assert response.message.content[0].text == "subscription says hi"  # type: ignore[union-attr]
    assert captured["options"]["model"] == "sonnet"
    assert captured["options"]["env"]["CLAUDE_CODE_OAUTH_TOKEN"] == _VALID_TOKEN
    # Delegation stays Rotaris's job: the CLI may not spawn its own subagents.
    assert "Agent" in captured["options"]["disallowed_tools"]

    # 4. Logout clears the stored token and returns to unauthenticated.
    logout_result = logout_provider("claude-code")
    assert logout_result.kind == "signed_out"
    assert not TokenStorage().has_tokens("claude-code")


@verifies(SWR.SWR_777)
def test_run_fails_actionably_on_conflicting_credential(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _isolate_user_dirs(monkeypatch, tmp_path)
    _install_fake_sdk(monkeypatch)
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    ui = _FakeUI(secret_responses=[_VALID_TOKEN])
    assert run_login("claude-code", workspace_root=workspace, reauth=False, ui=ui).success

    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-api03-somebody")

    from openhands.sdk.llm.message import Message, TextContent

    from rotaris_core.providers.claude_code import ClaudeCodeCredentialConflictError

    config = load_config(workspace)
    llm = load_llm_for_model(config, "claude-code/sonnet")
    with pytest.raises(ClaudeCodeCredentialConflictError) as excinfo:
        llm.completion([Message(role="user", content=[TextContent(text="hello?")])])
    assert "ANTHROPIC_API_KEY" in str(excinfo.value)


@verifies(SWR.SWR_777)
def test_missing_sdk_fails_at_model_construction(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """A missing optional extra is reported before any run starts."""
    _isolate_user_dirs(monkeypatch, tmp_path)
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    ui = _FakeUI(secret_responses=[_VALID_TOKEN])
    assert run_login("claude-code", workspace_root=workspace, reauth=False, ui=ui).success

    real_find_spec = importlib.util.find_spec

    def _find_spec(name: str, *args: Any, **kwargs: Any) -> Any:
        if name == "claude_agent_sdk":
            return None
        return real_find_spec(name, *args, **kwargs)

    monkeypatch.delitem(sys.modules, "claude_agent_sdk", raising=False)
    monkeypatch.setattr(importlib.util, "find_spec", _find_spec)

    config = load_config(workspace)
    with pytest.raises(RuntimeError) as excinfo:
        load_llm_for_model(config, "claude-code/sonnet")
    assert "uv sync --all-packages --extra claude-code" in str(excinfo.value)
