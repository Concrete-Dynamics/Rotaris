from __future__ import annotations

import json
import threading

from openhands.sdk.llm.message import Message, TextContent

from rotaris_core.agents.compressor import (
    Compressor,
    build_compressor,
)
from rotaris_core.config.defaults import DEFAULT_COMPRESSOR, DEFAULT_CONFIG
from rotaris_core.config.schema import CompressorConfig, ModelConfig, RotarisConfig
from rotaris_core.config.validation import validate_config
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.testing.lorem import LoremMarkdownGenerator

VALID_COMPRESSION_JSON = json.dumps(
    {
        "compressed_history": "Agent read file, made edits, ran tests.",
        "files_touched": ["src/main.py", "tests/test_main.py"],
        "tool_calls_summary": "read_file x2, edit_file x3, run_tests x1",
        "key_decisions": ["Used pytest instead of unittest"],
        "errors_encountered": ["ImportError on first attempt"],
        "current_state": "All tests passing after fix.",
    },
)


class MockLLMResponse:
    def __init__(self, text: str):
        self.message = Message(role="assistant", content=[TextContent(text=text)])


class MockLLM:
    def __init__(self, responses: list[str]):
        self._responses = iter(responses)
        self.calls: list[list[Message]] = []

    def completion(self, messages, **kwargs):
        self.calls.append(messages)
        return MockLLMResponse(next(self._responses))


class SlowMockLLM:
    def __init__(self) -> None:
        self.release = threading.Event()

    def completion(self, messages, **kwargs):
        self.release.wait(timeout=1)
        return MockLLMResponse('{"compressed_history": "late"}')


def _make_messages(count: int) -> list[dict[str, object]]:
    gen = LoremMarkdownGenerator(seed=count)
    return [{"role": "user", "content": gen.sentence(), "tool_name": None} for _ in range(count)]


def _fallback_excerpt(messages: list[dict[str, object]]) -> str:
    return "\n".join(f"[{m['role']}] {m['content']}" for m in messages)


def _make_config(**compressor_overrides: object) -> RotarisConfig:
    return RotarisConfig(
        models={
            "gpt-4o-mini": ModelConfig(
                provider="openai",
                model_id="gpt-4o-mini",
                api_key_env="OPENAI_API_KEY",
            ),
        },
        compressor=CompressorConfig(**compressor_overrides),
    )


@verifies(SWR.SWR_1401, SWR.SWR_1402)
def test_compressor_config_defaults() -> None:
    config = CompressorConfig()

    assert config.model == "gpt-4o-mini"
    assert config.timeout_seconds == 120
    assert config.default_threshold == 265_000
    assert config.threshold_percentage == 60
    assert config.chars_per_token == 4
    assert config.preserve_recent_turns == 4


@verifies(SWR.SWR_1401, SWR.SWR_1402, SWR.SWR_1403)
def test_compressor_config_custom_values() -> None:
    config = CompressorConfig(
        model="custom-model",
        timeout_seconds=30,
        default_threshold=10_000,
        threshold_percentage=75,
        chars_per_token=5,
        preserve_recent_turns=2,
    )

    assert config.model == "custom-model"
    assert config.timeout_seconds == 30
    assert config.default_threshold == 10_000
    assert config.threshold_percentage == 75
    assert config.chars_per_token == 5
    assert config.preserve_recent_turns == 2


@verifies(SWR.SWR_1401, SWR.SWR_1402)
def test_default_config_includes_compressor() -> None:
    assert DEFAULT_CONFIG.compressor == DEFAULT_COMPRESSOR


@verifies(SWR.SWR_1405, SWR.SWR_1407, SWR.SWR_1408, SWR.SWR_1409, SWR.SWR_1413, SWR.SWR_1414)
async def test_compress_context_returns_preserved_messages() -> None:
    messages = _make_messages(4)
    compressor = Compressor(MockLLM([VALID_COMPRESSION_JSON]))

    result = await compressor.compress_context(messages, preserve_recent=2)

    assert result["compressed_history"] == "Agent read file, made edits, ran tests."
    assert result["preserved_messages"] == messages[-2:]


@verifies(SWR.SWR_1405, SWR.SWR_1407, SWR.SWR_1410, SWR.SWR_1411, SWR.SWR_1412)
async def test_compress_context_empty_compressible_returns_no_compression() -> None:
    messages = _make_messages(2)
    compressor = Compressor(MockLLM([]))

    result = await compressor.compress_context(messages, preserve_recent=2)

    assert result["compressed_history"] == ""
    assert result["preserved_messages"] == messages
    assert result["files_touched"] == []
    assert result["tool_calls_summary"] == "No earlier messages required compression."
    assert result["key_decisions"] == []
    assert result["errors_encountered"] == []
    assert result["current_state"] == "Recent messages preserved verbatim."


@verifies(SWR.SWR_1405, SWR.SWR_1407, SWR.SWR_1414)
async def test_compress_context_parses_valid_json_response() -> None:
    compressor = Compressor(MockLLM([VALID_COMPRESSION_JSON]))

    result = await compressor.compress_context(_make_messages(3), preserve_recent=1)

    assert result["compressed_history"] == "Agent read file, made edits, ran tests."
    assert result["files_touched"] == ["src/main.py", "tests/test_main.py"]
    assert result["tool_calls_summary"] == "read_file x2, edit_file x3, run_tests x1"
    assert result["key_decisions"] == ["Used pytest instead of unittest"]
    assert result["errors_encountered"] == ["ImportError on first attempt"]
    assert result["current_state"] == "All tests passing after fix."


@verifies(SWR.SWR_1405, SWR.SWR_1407)
async def test_compress_context_strips_markdown_fences() -> None:
    compressor = Compressor(MockLLM([f"```json\n{VALID_COMPRESSION_JSON}\n``` "]))

    result = await compressor.compress_context(_make_messages(3), preserve_recent=1)

    assert result["compressed_history"] == "Agent read file, made edits, ran tests."
    assert result["files_touched"] == ["src/main.py", "tests/test_main.py"]


@verifies(SWR.SWR_1405, SWR.SWR_1407)
async def test_compress_context_retries_on_invalid_json() -> None:
    llm = MockLLM(["garbage", VALID_COMPRESSION_JSON])
    compressor = Compressor(llm)

    result = await compressor.compress_context(_make_messages(3), preserve_recent=1)

    assert result["compressed_history"] == "Agent read file, made edits, ran tests."
    assert len(llm.calls) == 2
    retry_prompt = llm.calls[1][1].content[0].text
    assert "Parse error:" in retry_prompt
    assert "Return ONLY corrected JSON." in retry_prompt


@verifies(SWR.SWR_1405, SWR.SWR_1407, SWR.SWR_1430, SWR.SWR_1432)
async def test_compress_context_falls_back_on_double_failure() -> None:
    llm = MockLLM(["garbage", "still not json"])
    compressor = Compressor(llm)
    messages = _make_messages(3)

    result = await compressor.compress_context(messages, preserve_recent=1)

    assert len(llm.calls) == 2
    assert result["compressed_history"] == _fallback_excerpt(messages[:-1])
    assert result["preserved_messages"] == messages[-1:]
    assert result["files_touched"] == []
    assert result["tool_calls_summary"] == (
        "Structured compression unavailable; raw transcript excerpt preserved."
    )
    assert result["key_decisions"] == []
    assert result["errors_encountered"] == []
    assert result["current_state"] == (
        "Compression fallback generated after LLM output could not be parsed."
    )


@verifies(SWR.SWR_1405, SWR.SWR_1407, SWR.SWR_1430, SWR.SWR_1432)
async def test_compress_context_timeout_uses_fallback() -> None:
    llm = SlowMockLLM()
    compressor = Compressor(llm, timeout=0.1)
    messages = _make_messages(3)

    try:
        result = await compressor.compress_context(messages, preserve_recent=1)
    finally:
        llm.release.set()

    assert result["compressed_history"] == _fallback_excerpt(messages[:-1])
    assert result["preserved_messages"] == messages[-1:]
    assert result["current_state"] == (
        "Compression fallback generated after LLM output could not be parsed."
    )


@verifies(SWR.SWR_1405, SWR.SWR_1406, SWR.SWR_1407)
async def test_build_compressor_creates_compressor_instance(monkeypatch) -> None:
    fake_llm = object()
    captured: dict[str, object] = {}

    def fake_load_llm_for_model(
        config: RotarisConfig,
        model_name: str,
        *,
        usage_id: str | None = None,
    ) -> object:
        assert config.compressor.model == "gpt-4o-mini"
        assert model_name == "gpt-4o-mini"
        captured["usage_id"] = usage_id
        return fake_llm

    monkeypatch.setattr("rotaris_core.config.loader.load_llm_for_model", fake_load_llm_for_model)
    config = _make_config(timeout_seconds=45)

    compressor = build_compressor(config)

    assert isinstance(compressor, Compressor)
    assert compressor.llm is fake_llm
    assert compressor.timeout == 45
    assert isinstance(captured["usage_id"], str)
    assert captured["usage_id"].startswith("compressor-gpt-4o-mini-")


@verifies(SWR.SWR_1406)
def test_config_validation_catches_unknown_compressor_model() -> None:
    config = _make_config(model="missing-model")

    errors = validate_config(config)

    assert "Compressor references unknown model 'missing-model'" in errors
