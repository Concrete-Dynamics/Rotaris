from __future__ import annotations

import asyncio
import json
import threading
import time
from typing import TYPE_CHECKING, Any

import httpx
import respx
from litellm import CustomStreamWrapper, ModelResponse, ModelResponseStream
from openhands.sdk.llm.fallback_strategy import FallbackStrategy
from openhands.sdk.llm.llm import LLM
from openhands.sdk.llm.message import Message, TextContent

from rotaris_core.auth.copilot_bridge import stage_copilot_tokens
from rotaris_core.auth.provider import TokenSet
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from collections.abc import Iterator
    from pathlib import Path


def _tokens(version: int, *, api_base: str = "https://api.githubcopilot.test") -> TokenSet:
    return TokenSet(
        access_token=f"tid=session-{version}",
        refresh_token=f"ghu_refresh_{version}",
        expires_at=1_800_000_000 + version,
        account_id="acct-test",
        extra={"api_base": api_base},
    )


def _messages() -> list[Message]:
    return [Message(role="user", content=[TextContent(text="hello")])]


def _response(
    model: str,
    content: str = "ok",
    *,
    prompt: int = 2,
    completion: int = 3,
) -> ModelResponse:
    return ModelResponse(
        model=model,
        choices=[{"message": {"role": "assistant", "content": content}}],
        usage={
            "prompt_tokens": prompt,
            "completion_tokens": completion,
            "total_tokens": prompt + completion,
        },
    )


class _RefreshOnce:
    def __init__(self, token_dir: Path) -> None:
        self._token_dir = token_dir
        self._lock = threading.Lock()
        self._done = False

    def refresh(self) -> None:
        with self._lock:
            if self._done:
                return
            httpx.post("https://auth.github.test/copilot/refresh", json={"refresh_token": "ghu"})
            stage_copilot_tokens(_tokens(2), token_dir=self._token_dir)
            self._done = True


class _SimpleStream(CustomStreamWrapper):
    def __init__(self, chunks: list[ModelResponseStream]) -> None:
        self._chunks = iter(chunks)

    def __iter__(self) -> Iterator[ModelResponseStream]:
        return self

    def __next__(self) -> ModelResponseStream:
        return next(self._chunks)


def _chunk(model: str, content: str, *, finish: str | None = None) -> ModelResponseStream:
    return ModelResponseStream(
        model=model,
        choices=[{"delta": {"content": content}, "index": 0, "finish_reason": finish}],
    )


def _stage_with_reader_retry(tokens: TokenSet, *, token_dir: Path) -> None:
    """Stage under a concurrent Windows reader, retrying replace-sharing races.

    ``os.replace`` is atomic, but on Windows it can raise ``PermissionError`` if
    another thread has the destination open at that instant. Retrying keeps the
    stress focused on the no-torn-read property without relaxing JSON parsing.
    """
    deadline = time.monotonic() + 2
    while True:
        try:
            stage_copilot_tokens(tokens, token_dir=token_dir)
            return
        except PermissionError:
            if time.monotonic() >= deadline:
                raise
            time.sleep(0.001)


@verifies(SWR.SWR_306)
@respx.mock
async def test_concurrent_refresh_deduplicates_parallel_401_recovery(
    tmp_path: Path,
    monkeypatch: Any,
) -> None:
    token_dir = tmp_path / "cache"
    stage_copilot_tokens(_tokens(1), token_dir=token_dir)
    refresh_route = respx.post("https://auth.github.test/copilot/refresh").mock(
        return_value=httpx.Response(200, json={"ok": True}),
    )
    refresher = _RefreshOnce(token_dir)

    def fake_completion(**kwargs: Any) -> ModelResponse:
        payload = json.loads((token_dir / "api-key.json").read_text(encoding="utf-8"))
        if payload["token"] == "tid=session-1":
            refresher.refresh()
        return _response(kwargs["model"], "recovered")

    monkeypatch.setattr("openhands.sdk.llm.llm.litellm_completion", fake_completion)
    llm = LLM(model="openai/gpt-5-mini", api_key="test", num_retries=0)

    responses = await asyncio.gather(
        asyncio.to_thread(llm.completion, _messages()),
        asyncio.to_thread(llm.completion, _messages()),
    )

    assert [r.message.content[0].text for r in responses] == ["recovered", "recovered"]
    assert refresh_route.call_count == 1
    assert (token_dir / "access-token").read_text(encoding="utf-8") == "ghu_refresh_2"


@verifies(SWR.SWR_306)
def test_refresh_during_streaming_restages_tokens_and_resumes(
    tmp_path: Path,
    monkeypatch: Any,
) -> None:
    token_dir = tmp_path / "cache"
    stage_copilot_tokens(_tokens(1), token_dir=token_dir)
    retry_count = 0

    def fake_completion(**kwargs: Any) -> _SimpleStream:
        nonlocal retry_count
        chunks = [_chunk(kwargs["model"], "hel")]
        payload = json.loads((token_dir / "api-key.json").read_text(encoding="utf-8"))
        if payload["token"] == "tid=session-1":
            retry_count += 1
            stage_copilot_tokens(_tokens(2), token_dir=token_dir)
        chunks.extend([_chunk(kwargs["model"], "lo"), _chunk(kwargs["model"], "!", finish="stop")])
        return _SimpleStream(chunks)

    monkeypatch.setattr("openhands.sdk.llm.llm.litellm_completion", fake_completion)
    llm = LLM(model="openai/gpt-5-mini", api_key="test", stream=True, num_retries=0)
    seen: list[str] = []

    result = llm.completion(
        _messages(),
        on_token=lambda chunk: seen.append(chunk.choices[0].delta.content or ""),
    )

    assert result.message.content[0].text == "hello!"
    assert "".join(seen) == "hello!"
    assert retry_count == 1
    payload = json.loads((token_dir / "api-key.json").read_text(encoding="utf-8"))
    assert payload["token"] == "tid=session-2"


@verifies(SWR.SWR_306)
def test_long_session_token_rotation_replaces_cache_without_torn_reads(tmp_path: Path) -> None:
    token_dir = tmp_path / "cache"
    stage_copilot_tokens(_tokens(0), token_dir=token_dir)
    stop = threading.Event()
    parse_errors: list[Exception] = []
    observed_tokens: set[str] = set()

    def reader() -> None:
        while not stop.is_set():
            try:
                observed_tokens.add(
                    json.loads((token_dir / "api-key.json").read_text(encoding="utf-8"))["token"],
                )
            except (FileNotFoundError, PermissionError):
                continue
            except Exception as exc:  # noqa: BLE001 - preserve any torn-read evidence
                parse_errors.append(exc)

    thread = threading.Thread(target=reader)
    thread.start()
    try:
        for version in range(1, 4):
            _stage_with_reader_retry(_tokens(version), token_dir=token_dir)
            payload = json.loads((token_dir / "api-key.json").read_text(encoding="utf-8"))
            assert payload["token"] == f"tid=session-{version}"
            assert (token_dir / "access-token").read_text(
                encoding="utf-8",
            ) == f"ghu_refresh_{version}"
    finally:
        stop.set()
        thread.join(timeout=2)

    assert parse_errors == []
    assert observed_tokens
    assert observed_tokens <= {f"tid=session-{version}" for version in range(4)}
    assert list(token_dir.glob("*.tmp")) == []


@verifies(SWR.SWR_306)
def test_fallback_meta_presence_in_metrics_after_primary_failure(
    monkeypatch: Any,
) -> None:
    calls: list[str] = []

    def fake_completion(**kwargs: Any) -> ModelResponse:
        calls.append(kwargs["model"])
        if kwargs["model"] == "openai/primary-model":
            import litellm

            raise litellm.InternalServerError("forced 5xx", "openai", kwargs["model"])
        return _response(kwargs["model"], "fallback-ok", prompt=7, completion=11)

    monkeypatch.setattr("openhands.sdk.llm.llm.litellm_completion", fake_completion)
    fallback = LLM(model="openai/fallback-model", api_key="test", num_retries=0)
    strategy = FallbackStrategy(fallback_llms=[])
    strategy._resolved = [fallback]
    primary = LLM(
        model="openai/primary-model",
        api_key="test",
        num_retries=0,
        fallback_strategy=strategy,
    )

    result = primary.completion(_messages())

    assert result.message.content[0].text == "fallback-ok"
    assert calls == ["openai/primary-model", "openai/fallback-model"]
    fallback_entries = [
        u for u in primary.metrics.token_usages if u.model == "openai/fallback-model"
    ]
    assert fallback_entries
    assert primary.metrics.accumulated_token_usage is not None
    assert primary.metrics.accumulated_token_usage.prompt_tokens >= 7
    assert primary.metrics.accumulated_token_usage.completion_tokens >= 11


@verifies(SWR.SWR_306)
def test_torn_read_retry_atomic_stage_copilot_tokens_stress(tmp_path: Path) -> None:
    token_dir = tmp_path / "cache"
    stage_copilot_tokens(_tokens(0), token_dir=token_dir)
    stop = threading.Event()
    parse_errors: list[Exception] = []
    successful_reads = 0

    def reader() -> None:
        nonlocal successful_reads
        while not stop.is_set():
            try:
                json.loads((token_dir / "api-key.json").read_text(encoding="utf-8"))
                successful_reads += 1
            except (FileNotFoundError, PermissionError):
                continue
            except Exception as exc:  # noqa: BLE001 - test must expose any invalid JSON read
                parse_errors.append(exc)

    threads = [threading.Thread(target=reader) for _ in range(2)]
    for thread in threads:
        thread.start()
    try:
        for version in range(1, 51):
            _stage_with_reader_retry(_tokens(version), token_dir=token_dir)
    finally:
        stop.set()
        for thread in threads:
            thread.join(timeout=2)

    final_payload = json.loads((token_dir / "api-key.json").read_text(encoding="utf-8"))
    assert final_payload["token"] == "tid=session-50"
    assert successful_reads > 0
    assert parse_errors == []
    assert list(token_dir.glob("*.tmp")) == []
