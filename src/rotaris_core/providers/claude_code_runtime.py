"""Claude Agent SDK execution path for the claude-code provider (SWR-777).

This is a distinct execution path from Rotaris's LiteLLM-routed providers:
requests run through the Agent SDK's local runtime (``query()``), authenticated
with the stored subscription OAuth token. Before every request the runtime
verifies that no higher-precedence API/gateway credential is present, so runs
can never silently bill the Anthropic API instead of the subscription.
"""

from __future__ import annotations

import asyncio
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from rotaris_core.providers.claude_code import (
    CLAUDE_CODE_PROVIDER_ID,
    ensure_no_conflicting_credentials,
    subscription_token_validation_error,
)
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Callable, Coroutine, Sequence
    from pathlib import Path

    from openhands.sdk.llm.llm import LLM
    from openhands.sdk.llm.llm_response import LLMResponse

logger = logging.getLogger(__name__)

#: Default per-model concurrency cap. Deliberately conservative (DeepSeek
#: precedent, SWR-919/SWR-920): the subscription allowance is shared with the
#: user's interactive Claude Code/Desktop sessions.
DEFAULT_MAX_PARALLEL = 2

#: Subagent-spawning tools, denied by default. One Rotaris completion already
#: maps to one full Claude Code agent loop; letting that loop fan out to its own
#: subagents fans out invisibly — Rotaris records neither the subagent work nor
#: its share of the subscription allowance, and the ``max_parallel`` cap above
#: stops meaning anything. Delegation is Rotaris's job, not the CLI's.
SUBAGENT_TOOLS: tuple[str, ...] = ("Agent", "Task")

#: Tool-input keys worth showing in progress logs, most specific first.
_TOOL_DETAIL_KEYS = ("file_path", "pattern", "command", "path", "url", "description")

SDK_MISSING_MESSAGE = (
    "The 'claude-agent-sdk' package is required for the claude-code provider "
    "but is not installed. It ships as the optional extra "
    "rotaris-core[claude-code]: run 'uv sync --all-packages --extra claude-code' (or "
    "\"pip install 'rotaris-core[claude-code]'\"). The SDK wheel bundles the "
    "Claude Code CLI, so no separate Claude Code install is needed."
)


@traces(SWR.SWR_777)
def ensure_sdk_available() -> None:
    """Raise ``RuntimeError`` with install instructions when the SDK is absent.

    Called before the LLM is built so a missing optional extra fails at model
    construction instead of mid-run, once a session directory and evidence log
    already exist. The ``sys.modules`` short-circuit keeps injected test
    doubles working (``find_spec`` rejects modules without a ``__spec__``).
    """
    import importlib.util
    import sys

    if "claude_agent_sdk" in sys.modules:
        return
    if importlib.util.find_spec("claude_agent_sdk") is None:
        raise RuntimeError(SDK_MISSING_MESSAGE)


@dataclass(frozen=True)
class ClaudeCodeRunResult:
    """Final result of one Agent SDK run."""

    text: str
    subtype: str | None = None
    session_id: str | None = None
    is_error: bool = False


@traces(SWR.SWR_777)
class ClaudeCodeRuntime:
    """Serialises Agent SDK runs with a per-model concurrency cap.

    Thread-based semaphores are used (not asyncio ones) because each request
    runs its own event loop on a worker thread via ``asyncio.run``.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._semaphores: dict[str, tuple[int, threading.BoundedSemaphore]] = {}

    def _semaphore_for(self, model: str, max_parallel: int) -> threading.BoundedSemaphore:
        with self._lock:
            existing = self._semaphores.get(model)
            if existing is not None and existing[0] == max_parallel:
                return existing[1]
            semaphore = threading.BoundedSemaphore(max_parallel)
            self._semaphores[model] = (max_parallel, semaphore)
            return semaphore

    def run_prompt(
        self,
        prompt: str,
        *,
        model: str,
        oauth_token: str,
        system_prompt: str | None = None,
        cwd: str | None = None,
        max_turns: int | None = None,
        max_parallel: int = DEFAULT_MAX_PARALLEL,
        env: dict[str, str] | None = None,
        claude_settings_path: Path | None = None,
        disallowed_tools: Sequence[str] = SUBAGENT_TOOLS,
    ) -> ClaudeCodeRunResult:
        """Run one prompt through the Agent SDK's local runtime.

        Raises :class:`~rotaris_core.providers.claude_code.ClaudeCodeCredentialConflictError`
        when a higher-precedence API/gateway credential is present, and
        ``ValueError`` when the stored token is not a subscription setup token.
        """
        ensure_no_conflicting_credentials(env, claude_settings_path=claude_settings_path)

        token_error = subscription_token_validation_error(oauth_token)
        if token_error is not None:
            raise ValueError(f"Invalid claude-code subscription token: {token_error}")

        semaphore = self._semaphore_for(model, max(1, max_parallel))
        with semaphore:
            return _run_coro_in_fresh_loop(
                self._query(
                    prompt,
                    model=model,
                    oauth_token=oauth_token,
                    system_prompt=system_prompt,
                    cwd=cwd,
                    max_turns=max_turns,
                    env=env,
                    disallowed_tools=disallowed_tools,
                ),
            )

    async def _query(
        self,
        prompt: str,
        *,
        model: str,
        oauth_token: str,
        system_prompt: str | None,
        cwd: str | None,
        max_turns: int | None,
        env: dict[str, str] | None,
        disallowed_tools: Sequence[str] = SUBAGENT_TOOLS,
    ) -> ClaudeCodeRunResult:
        try:
            import claude_agent_sdk
        except ImportError as exc:
            raise RuntimeError(SDK_MISSING_MESSAGE) from exc

        options = claude_agent_sdk.ClaudeAgentOptions(
            **_build_option_kwargs(
                model=model,
                oauth_token=oauth_token,
                system_prompt=system_prompt,
                cwd=cwd,
                max_turns=max_turns,
                env=env,
                disallowed_tools=disallowed_tools,
            ),
        )

        # One CLI run can take many minutes. Log every step: without this the
        # console shows nothing at all between spawn and final answer, which is
        # indistinguishable from a hang.
        logger.info("claude-code/%s: run started", model)
        text_parts: list[str] = []
        tool_calls = 0
        subtype: str | None = None
        session_id: str | None = None
        is_error = False
        async for message in claude_agent_sdk.query(prompt=prompt, options=options):
            if isinstance(message, claude_agent_sdk.AssistantMessage):
                texts, used = _collect_assistant_blocks(message, model=model)
                text_parts.extend(texts)
                tool_calls += used
            elif isinstance(message, claude_agent_sdk.ResultMessage):
                subtype = getattr(message, "subtype", None)
                session_id = getattr(message, "session_id", None)
                is_error = bool(getattr(message, "is_error", False))
        logger.info(
            "claude-code/%s: run finished (%s, %d tool calls)",
            model,
            subtype or "no result",
            tool_calls,
        )

        return ClaudeCodeRunResult(
            text="".join(text_parts),
            subtype=subtype,
            session_id=session_id,
            is_error=is_error,
        )


def _build_option_kwargs(
    *,
    model: str,
    oauth_token: str,
    system_prompt: str | None,
    cwd: str | None,
    max_turns: int | None,
    env: dict[str, str] | None,
    disallowed_tools: Sequence[str],
) -> dict[str, Any]:
    """Assemble ``ClaudeAgentOptions`` kwargs for one run."""
    sdk_env = dict(env) if env is not None else {}
    sdk_env["CLAUDE_CODE_OAUTH_TOKEN"] = oauth_token

    option_kwargs: dict[str, Any] = {"model": model, "env": sdk_env}
    if system_prompt is not None:
        option_kwargs["system_prompt"] = system_prompt
    if cwd is not None:
        option_kwargs["cwd"] = cwd
    if max_turns is not None:
        option_kwargs["max_turns"] = max_turns
    if disallowed_tools:
        option_kwargs["disallowed_tools"] = list(disallowed_tools)
    return option_kwargs


def _tool_detail(block: Any) -> str:
    """Short hint about what a tool call is doing, for progress logs."""
    tool_input = getattr(block, "input", None)
    if not isinstance(tool_input, dict):
        return ""
    for key in _TOOL_DETAIL_KEYS:
        value = tool_input.get(key)
        if isinstance(value, str) and value:
            return f" {value[:80]}"
    return ""


def _collect_assistant_blocks(message: Any, *, model: str) -> tuple[list[str], int]:
    """Return (text blocks, tool-call count), logging each tool call."""
    import claude_agent_sdk

    texts: list[str] = []
    tool_calls = 0
    for block in message.content:
        if isinstance(block, claude_agent_sdk.TextBlock):
            texts.append(block.text)
            continue
        name = getattr(block, "name", None)
        if name:
            tool_calls += 1
            logger.info("claude-code/%s: %s%s", model, name, _tool_detail(block))
    return texts, tool_calls


_runtime: ClaudeCodeRuntime | None = None
_runtime_lock = threading.Lock()


def get_runtime() -> ClaudeCodeRuntime:
    global _runtime  # noqa: PLW0603 — process-wide semaphore registry
    with _runtime_lock:
        if _runtime is None:
            _runtime = ClaudeCodeRuntime()
        return _runtime


def _run_coro_in_fresh_loop(
    coro: Coroutine[Any, Any, ClaudeCodeRunResult],
) -> ClaudeCodeRunResult:
    """Run *coro* to completion whether or not this thread has a running loop."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    with ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(asyncio.run, coro).result()


def _render_messages(messages: list[Any]) -> tuple[str, str | None]:
    """Flatten OpenHands messages into (prompt, system_prompt)."""
    system_parts: list[str] = []
    transcript: list[str] = []
    for message in messages:
        role = getattr(message, "role", "user")
        texts = [
            getattr(item, "text", "")
            for item in getattr(message, "content", [])
            if getattr(item, "text", "")
        ]
        text = "\n".join(texts).strip()
        if not text:
            continue
        if role == "system":
            system_parts.append(text)
        else:
            transcript.append(text if role == "user" else f"[assistant]\n{text}")
    system_prompt = "\n\n".join(system_parts) or None
    return "\n\n".join(transcript), system_prompt


@traces(SWR.SWR_777)
def build_claude_code_llm(
    *,
    base_cls: type[LLM],
    model_id: str,
    max_parallel: int | None,
    usage_id: str,
    workspace_root: str | None,
    token_loader: Callable[[], str | None] | None = None,
    runtime: ClaudeCodeRuntime | None = None,
) -> LLM:
    """Build an OpenHands-compatible LLM whose completions run via the Agent SDK.

    The claude-code provider is the "sub-agent shim" from the SWR-777 research
    plan: each completion becomes one Agent SDK run inside the workspace, and
    the SDK's final message is returned into Rotaris's normal persona flow.
    The token is loaded fresh per call and never stored on the instance.
    """

    def _load_token() -> str | None:
        if token_loader is not None:
            return token_loader()
        from rotaris_core.auth.storage import TokenStorage

        token_set = TokenStorage().load(CLAUDE_CODE_PROVIDER_ID)
        return None if token_set is None else token_set.access_token

    resolved_max_parallel = max_parallel if max_parallel is not None else DEFAULT_MAX_PARALLEL

    class _ClaudeCodeLLM(base_cls):  # type: ignore[valid-type,misc]
        def completion(
            self,
            messages: list[Any],
            tools: Any = None,
            add_security_risk_prediction: bool = False,  # noqa: FBT001, FBT002
            on_token: Any = None,
            call_context: Any = None,
            **kwargs: Any,
        ) -> LLMResponse:
            del tools, add_security_risk_prediction, on_token, call_context, kwargs
            token = _load_token()
            if not token:
                raise RuntimeError(
                    "claude-code is not authenticated. Run 'rotaris-cli login "
                    "claude-code' and paste a token minted by 'claude setup-token'.",
                )
            prompt, system_prompt = _render_messages(messages)
            active_runtime = runtime or get_runtime()
            result = active_runtime.run_prompt(
                prompt,
                model=model_id,
                oauth_token=token,
                system_prompt=system_prompt,
                cwd=workspace_root,
                max_parallel=resolved_max_parallel,
            )
            return _build_llm_response(self, result)

    return _ClaudeCodeLLM(
        model=f"{CLAUDE_CODE_PROVIDER_ID}/{model_id}",
        usage_id=usage_id,
    )


def _build_llm_response(llm: Any, result: ClaudeCodeRunResult) -> LLMResponse:
    import uuid

    from litellm.types.utils import Choices, ModelResponse
    from litellm.types.utils import Message as LitellmMessage
    from openhands.sdk.llm.llm_response import LLMResponse
    from openhands.sdk.llm.message import Message, TextContent

    response_id = result.session_id or f"claude-code-{uuid.uuid4().hex}"
    raw_response = ModelResponse(
        id=response_id,
        model=llm.model,
        choices=[
            Choices(
                index=0,
                finish_reason="stop",
                message=LitellmMessage(role="assistant", content=result.text),
            ),
        ],
    )
    return LLMResponse(
        message=Message(role="assistant", content=[TextContent(text=result.text)]),
        metrics=llm.metrics.get_snapshot(),
        raw_response=raw_response,
    )
