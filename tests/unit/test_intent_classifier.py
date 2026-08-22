from __future__ import annotations

import json
import time
from types import SimpleNamespace
from typing import TYPE_CHECKING, Any

import pytest
from openhands.sdk.llm.message import Message, TextContent

from rotaris_core.config.schema import ModelConfig, RotarisConfig
from rotaris_core.ralph.intent_classifier import (
    FALLBACK_INTENT,
    IntentCategory,
    IntentClassificationResult,
    IntentClassifier,
    classification_status_text,
    classify_initial_intent,
    intent_tools_for,
    load_intent_tools_mapping,
)
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from pathlib import Path


def _response(text: str) -> object:
    return SimpleNamespace(message=Message(role="assistant", content=[TextContent(text=text)]))


class FakeLLM:
    def __init__(self, response_text: str) -> None:
        self.response_text = response_text
        self.calls: list[dict[str, Any]] = []

    def completion(self, messages: list[Message], **kwargs: Any) -> object:
        self.calls.append({"messages": messages, "kwargs": kwargs})
        return _response(self.response_text)


@verifies(SWR.SWR_146, SWR.SWR_152)
async def test_classifier_returns_valid_json_intent() -> None:
    llm = FakeLLM('{"intent":"small_feature","confidence":0.82,"reason":"clear feature"}')

    result = await IntentClassifier(llm, timeout=1).classify("add prompt history")

    assert result.intent == IntentCategory.SMALL_FEATURE
    assert result.confidence == 0.82
    assert result.reason == "clear feature"
    assert result.fallback is False
    assert llm.calls[0]["kwargs"]["response_format"]["type"] == "json_schema"


@verifies(SWR.SWR_146, SWR.SWR_152)
async def test_classifier_accepts_problem_resolution_intent() -> None:
    llm = FakeLLM(
        '{"intent":"problem_resolution","confidence":0.91,'
        '"reason":"broken behavior with repair requested"}',
    )

    result = await IntentClassifier(llm, timeout=1).classify(
        "figure out why this test fails and fix it",
    )

    assert result.intent == IntentCategory.PROBLEM_RESOLUTION
    assert result.confidence == 0.91
    assert result.reason == "broken behavior with repair requested"
    assert result.fallback is False


@verifies(SWR.SWR_154)
async def test_classifier_invalid_json_falls_back_to_moderate_feature() -> None:
    llm = FakeLLM("small_feature")

    result = await IntentClassifier(llm, timeout=1).classify("add prompt history")

    assert result.intent == FALLBACK_INTENT
    assert result.fallback is True
    assert "invalid classifier JSON" in (result.reason or "")


@verifies(SWR.SWR_154)
async def test_classifier_unmapped_intent_falls_back_to_moderate_feature() -> None:
    llm = FakeLLM('{"intent":"space_station","confidence":0.9,"reason":"nope"}')

    result = await IntentClassifier(llm, timeout=1).classify("add prompt history")

    assert result.intent == FALLBACK_INTENT
    assert result.fallback is True
    assert "unmapped classifier intent" in (result.reason or "")


@verifies(SWR.SWR_154)
async def test_classifier_timeout_falls_back_to_moderate_feature() -> None:
    class SlowLLM:
        def completion(self, messages: list[Message], **kwargs: Any) -> object:
            del messages, kwargs
            time.sleep(0.05)
            return _response('{"intent":"small_feature","confidence":0.9,"reason":"late"}')

    result = await IntentClassifier(SlowLLM(), timeout=0.01).classify("add prompt history")

    assert result.intent == FALLBACK_INTENT
    assert result.fallback is True
    assert result.reason == "classification timed out"


@verifies(SWR.SWR_155)
async def test_classifier_uses_only_raw_prompt_and_metadata() -> None:
    llm = FakeLLM('{"intent":"question","confidence":0.7,"reason":"asks why"}')

    await IntentClassifier(llm, timeout=1).classify(
        "Why does the scheduler retry?",
        metadata={"entrypoint": "background"},
    )

    user_message = llm.calls[0]["messages"][1]
    text = user_message.content[0].text
    assert "Why does the scheduler retry?" in text
    assert '"entrypoint": "background"' in text
    assert "transcript_events" not in text
    assert "workspace index" not in text
    assert "contextual_task" not in text
    assert "file contents" not in text


@verifies(SWR.SWR_167)
async def test_classifier_payload_includes_optional_prior_orchestrator_response() -> None:
    """Productive use: resumed user request gets bounded prior work context.
    Expected outcome: optional history is trimmed, bounded, and omitted when unusable."""
    llm = FakeLLM('{"intent":"question","confidence":0.7,"reason":"asks why"}')

    await IntentClassifier(llm, timeout=1).classify(
        "Why does the scheduler retry?",
        metadata={"entrypoint": "background"},
        prior_orchestrator_response="  " + ("context" * 1000) + "  ",
    )

    text = llm.calls[0]["messages"][1].content[0].text

    payload = json.loads(text)
    assert payload["prior_orchestrator_response"] == ("context" * 1000)[:4000]
    assert len(payload["prior_orchestrator_response"]) == 4000

    fresh_llm = FakeLLM('{"intent":"question","confidence":0.7,"reason":"asks why"}')
    await IntentClassifier(fresh_llm, timeout=1).classify("fresh", prior_orchestrator_response="  ")
    assert "prior_orchestrator_response" not in fresh_llm.calls[0]["messages"][1].content[0].text


@verifies(SWR.SWR_167)
def test_classifier_prompt_treats_history_as_untrusted_context() -> None:
    """Productive use: classifier resists instructions embedded in old agent output.
    Expected outcome: prompt prioritizes new request and rejects historical instructions."""
    from rotaris_core.ralph.intent_classifier import _load_classifier_prompt

    prompt = _load_classifier_prompt()
    assert "untrusted historical" in prompt
    assert "Prioritize the new `prompt`" in prompt
    assert "instructions, tool requests" in prompt


@verifies(SWR.SWR_152)
async def test_classifier_retries_with_json_object_when_json_schema_is_rejected() -> None:
    class ResponseFormatRejectingLLM:
        def __init__(self) -> None:
            self.calls: list[dict[str, Any]] = []

        def completion(self, messages: list[Message], **kwargs: Any) -> object:
            self.calls.append({"messages": messages, "kwargs": kwargs})
            if len(self.calls) == 1:
                raise RuntimeError(
                    'litellm.BadRequestError: DeepseekException - {"error":{"message":"'
                    'This response_format type is unavailable now","type":"invalid_request_error"}}',
                )
            return _response(
                '{"intent":"problem_resolution","confidence":0.93,"reason":"bug + fix request"}',
            )

    llm = ResponseFormatRejectingLLM()

    result = await IntentClassifier(llm, timeout=1).classify("find the failure and fix it")

    assert result.intent == IntentCategory.PROBLEM_RESOLUTION
    assert result.fallback is False
    assert len(llm.calls) == 2
    assert llm.calls[0]["kwargs"]["response_format"]["type"] == "json_schema"
    assert llm.calls[1]["kwargs"]["response_format"]["type"] == "json_object"
    assert "Example JSON output" in llm.calls[1]["messages"][0].content[0].text


@verifies(SWR.SWR_152)
async def test_classify_initial_intent_uses_json_object_for_deepseek(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    llm = FakeLLM('{"intent":"small_feature","confidence":0.72,"reason":"clear scoped change"}')
    config = RotarisConfig(
        workspace_root=".",
        small_model="deepseek-small",
        models={
            "deepseek-small": ModelConfig(
                provider="deepseek",
                model_id="deepseek-v4-pro",
            ),
        },
    )

    monkeypatch.setattr(
        "rotaris_core.config.loader.load_llm_for_model", lambda *args, **kwargs: llm
    )
    monkeypatch.setattr(
        "rotaris_core.config.loader.build_llm_usage_id",
        lambda *args, **kwargs: "intent-classifier/test",
    )

    result = await classify_initial_intent(config, "add a focused change")

    assert result.intent == IntentCategory.SMALL_FEATURE
    assert llm.calls[0]["kwargs"]["response_format"]["type"] == "json_object"


@verifies(SWR.SWR_154)
def test_classification_status_text_summarizes_response_format_fallback() -> None:
    result = classification_status_text(
        IntentClassificationResult(
            intent=IntentCategory.MODERATE_FEATURE,
            reason=(
                "classification error: litellm.BadRequestError: DeepseekException - "
                '{"error":{"message":"This response_format type is unavailable now"}}'
            ),
            fallback=True,
        ),
    )

    assert result == (
        "Intent classified: moderate_feature "
        "(fallback: provider rejected structured output for the intent model)"
    )


@verifies(SWR.SWR_176)
def test_classification_status_text_reports_carried_over_intent() -> None:
    """Productive use: user who typed "continue" reads why the run picked the intent it did.
    Expected outcome: continuation is named as such, and never as a classifier fallback."""
    carried = classification_status_text(
        IntentClassificationResult(
            intent=IntentCategory.PROBLEM_RESOLUTION,
            reason="continued the session's previous intent (problem_resolution)",
            carried_over=True,
        ),
    )

    assert carried == "Intent classified: problem_resolution (continued from previous run)"
    assert "fallback" not in carried


def _write_mapping(tmp_path: Path, mapping_text: str) -> Path:
    mapping = tmp_path / "intents.yaml"
    mapping.write_text(mapping_text, encoding="utf-8")
    return mapping


# --- load_intent_tools_mapping and intent_tools_for tests ---


@verifies(SWR.SWR_156)
def test_intent_tools_mapping_loads_allowed_tools(tmp_path: Path) -> None:
    mapping = _write_mapping(
        tmp_path,
        "moderate_feature:\nexplicit_trivial:\n  allowed_tools:\n"
        "    - delegate\n    - write_file\n",
    )

    result = load_intent_tools_mapping(mapping)

    assert result[IntentCategory.MODERATE_FEATURE] is None
    assert result[IntentCategory.EXPLICIT_TRIVIAL] == ["delegate", "write_file"]


@verifies(SWR.SWR_2416)
def test_intent_mapping_rejects_leftover_instruction_snippets(tmp_path: Path) -> None:
    """Intent prompt text moved to the playbook; a stale `instructions:` key is a mistake."""
    mapping = _write_mapping(tmp_path, "moderate_feature: moderate_feature.md\n")

    with pytest.raises(ValueError, match="must be a mapping or empty"):
        load_intent_tools_mapping(mapping)


@verifies(SWR.SWR_156)
def test_intent_tools_for_returns_list_for_explicit_trivial() -> None:
    """intent_tools_for returns a non-None list for explicit_trivial in the real mapping."""
    result = intent_tools_for(IntentCategory.EXPLICIT_TRIVIAL)

    assert isinstance(result, list)
    assert "write_file" in result
    assert "read_file" in result
    assert "delegate" in result


@verifies(SWR.SWR_156)
def test_intent_tools_for_returns_list_for_single_file_change() -> None:
    """intent_tools_for returns a non-None list for single_file_change."""
    result = intent_tools_for(IntentCategory.SINGLE_FILE_CHANGE)

    assert isinstance(result, list)
    assert "write_file" in result


@verifies(SWR.SWR_156)
def test_intent_tools_for_returns_none_for_moderate_feature() -> None:
    """intent_tools_for returns None for complex intents (no tool override)."""
    result = intent_tools_for(IntentCategory.MODERATE_FEATURE)

    assert result is None


@verifies(SWR.SWR_156)
def test_intent_tools_for_returns_none_for_problem_resolution() -> None:
    """problem_resolution is a complex intent and should not override tool restrictions."""
    result = intent_tools_for(IntentCategory.PROBLEM_RESOLUTION)

    assert result is None


@verifies(SWR.SWR_154)
def test_intent_tools_for_returns_none_on_mapping_error(tmp_path: Path) -> None:
    """Returns None gracefully when mapping file has invalid content."""
    bad_mapping = tmp_path / "intents.yaml"
    bad_mapping.write_text("not: valid: yaml: [", encoding="utf-8")

    result = intent_tools_for(
        IntentCategory.EXPLICIT_TRIVIAL,
        mapping_file=bad_mapping,
    )

    assert result is None
