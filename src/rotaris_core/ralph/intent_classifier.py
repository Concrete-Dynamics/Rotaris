from __future__ import annotations

import asyncio
import json
import logging
from enum import StrEnum
from pathlib import Path
from typing import TYPE_CHECKING, Any

import yaml
from openhands.sdk.llm.message import Message, TextContent
from pydantic import BaseModel, Field

from rotaris_core.llm_errors import (
    is_response_format_error,
    remember_rejected_response_format,
    response_format_rejected,
)
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from openhands.sdk import LLM

    from rotaris_core.config.schema import RotarisConfig

_log = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).resolve().parents[1] / "agents" / "prompts"
INTENT_PROMPT_FILE = PROMPTS_DIR / "intent_classifier.md"
INTENT_MAPPING_FILE = PROMPTS_DIR / "intents" / "intents.yaml"
DEFAULT_CLASSIFICATION_TIMEOUT = 8.0
MAX_PROMPT_CHARS = 4_000


class IntentCategory(StrEnum):
    EXPLICIT_TRIVIAL = "explicit_trivial"
    QUESTION = "question"
    EXPLORATION = "exploration"
    PROBLEM_RESOLUTION = "problem_resolution"
    SINGLE_FILE_CHANGE = "single_file_change"
    SMALL_FEATURE = "small_feature"
    MODERATE_FEATURE = "moderate_feature"
    LARGE_FEATURE = "large_feature"
    REFACTOR = "refactor"
    ARCHITECTURAL = "architectural"
    REQUIREMENTS = "requirements"
    WHOLE_PROJECT = "whole_project"
    AMBIGUOUS = "ambiguous"


FALLBACK_INTENT = IntentCategory.MODERATE_FEATURE


class IntentClassificationResult(BaseModel):
    intent: IntentCategory
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    reason: str | None = None
    fallback: bool = False


_INTENT_RESPONSE_FORMAT: dict[str, Any] = {
    "type": "json_schema",
    "json_schema": {
        "name": "rotaris_intent_classification",
        "strict": True,
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "intent": {
                    "type": "string",
                    "enum": [intent.value for intent in IntentCategory],
                },
                "confidence": {
                    "anyOf": [{"type": "number", "minimum": 0.0, "maximum": 1.0}, {"type": "null"}],
                },
                "reason": {"anyOf": [{"type": "string"}, {"type": "null"}]},
            },
            "required": ["intent", "confidence", "reason"],
        },
    },
}

_INTENT_JSON_OBJECT_RESPONSE_FORMAT: dict[str, Any] = {"type": "json_object"}
_JSON_MODE_PROMPT_SUFFIX = """

JSON output requirements:
- Return only a single JSON object with exactly these keys: "intent", "confidence", "reason".
- The "intent" value must be one of the provided enum values.
- Use null for "confidence" or "reason" when you are unsure.
- Do not wrap the JSON in markdown or add extra prose.
- Example JSON output:
  {"intent":"problem_resolution","confidence":0.87,"reason":"The user asked to diagnose a failure and fix it."}
""".strip()
_USER_VISIBLE_REASON_MAX_CHARS = 180


def _fallback_result(reason: str) -> IntentClassificationResult:
    return IntentClassificationResult(intent=FALLBACK_INTENT, reason=reason, fallback=True)


def _parse_allowed_tools(intent_name: str, raw_tools: object) -> list[str] | None:
    if raw_tools is None:
        return None
    if not isinstance(raw_tools, list) or not all(isinstance(tool, str) for tool in raw_tools):
        raise ValueError(
            f"Intent mapping for {intent_name!r}: 'allowed_tools' must be a list of strings",
        )
    return list(raw_tools)


def _load_classifier_prompt() -> str:
    try:
        return INTENT_PROMPT_FILE.read_text(encoding="utf-8")
    except OSError as exc:
        _log.warning("Intent classifier prompt unavailable (%s); using embedded fallback", exc)
        return (
            "Classify the user's raw request into the provided intent enum. "
            "Return only JSON matching the requested schema."
        )


def _prompt_for_response_format(response_format: dict[str, Any] | None) -> str:
    prompt = _load_classifier_prompt().strip()
    if response_format == _INTENT_RESPONSE_FORMAT:
        return prompt
    return f"{prompt}\n\n{_JSON_MODE_PROMPT_SUFFIX}"


def _build_classifier_messages(
    user_payload: dict[str, object],
    *,
    response_format: dict[str, Any] | None,
) -> list[Message]:
    return [
        Message(
            role="system", content=[TextContent(text=_prompt_for_response_format(response_format))]
        ),
        Message(
            role="user",
            content=[TextContent(text=json.dumps(user_payload, ensure_ascii=False))],
        ),
    ]


def _extract_response_text(response: object) -> str:
    message = getattr(response, "message", None)
    if message is None:
        return ""
    parts: list[str] = []
    for item in getattr(message, "content", []) or []:
        if isinstance(item, TextContent):
            parts.append(item.text)
            continue
        text = getattr(item, "text", None)
        if isinstance(text, str):
            parts.append(text)
    return "\n".join(part for part in parts if part).strip()


def _parse_classification(text: str) -> IntentClassificationResult:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()

    try:
        payload = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        return _fallback_result(f"invalid classifier JSON: {exc}")
    if not isinstance(payload, dict):
        return _fallback_result("classifier JSON was not an object")

    raw_intent = payload.get("intent")
    if not isinstance(raw_intent, str):
        return _fallback_result(f"unmapped classifier intent: {raw_intent!r}")
    try:
        intent = IntentCategory(raw_intent)
    except ValueError:
        return _fallback_result(f"unmapped classifier intent: {raw_intent!r}")

    try:
        return IntentClassificationResult(
            intent=intent,
            confidence=payload.get("confidence"),
            reason=payload.get("reason"),
            fallback=False,
        )
    except ValueError as exc:
        return _fallback_result(f"invalid classifier payload: {exc}")


def summarize_intent_fallback_reason(reason: str | None) -> str | None:
    if reason is None:
        return None

    normalized = reason.strip()
    if not normalized:
        return None

    if normalized.startswith("classifier setup error: "):
        normalized = normalized.removeprefix("classifier setup error: ")
    elif normalized.startswith("classification error: "):
        normalized = normalized.removeprefix("classification error: ")

    lower = normalized.lower()
    if "response_format" in lower and (
        "json_schema" in lower
        or "json schema" in lower
        or "json_object" in lower
        or "invalid_request_error" in lower
        or "unavailable now" in lower
        or "unsupported" in lower
    ):
        normalized = "provider rejected structured output for the intent model"

    if len(normalized) > _USER_VISIBLE_REASON_MAX_CHARS:
        normalized = normalized[: _USER_VISIBLE_REASON_MAX_CHARS - 3].rstrip() + "..."
    return normalized


def classification_status_text(classification: IntentClassificationResult) -> str:
    text = f"Intent classified: {classification.intent.value}"
    if not classification.fallback:
        return text

    reason = summarize_intent_fallback_reason(classification.reason)
    if reason is None:
        return f"{text} (fallback)"
    return f"{text} (fallback: {reason})"


@traces(SWR.SWR_146, SWR.SWR_147, SWR.SWR_152, SWR.SWR_155)
class IntentClassifier:
    """Fast pre-flight classifier for the user's raw prompt."""

    def __init__(
        self,
        llm: LLM,
        timeout: float = DEFAULT_CLASSIFICATION_TIMEOUT,
        response_formats: tuple[dict[str, Any] | None, ...] = (
            _INTENT_RESPONSE_FORMAT,
            _INTENT_JSON_OBJECT_RESPONSE_FORMAT,
            None,
        ),
    ) -> None:
        self.llm = llm
        self.timeout = timeout
        deduped_formats: list[dict[str, Any] | None] = []
        for item in response_formats:
            if item not in deduped_formats:
                deduped_formats.append(item)
        self.response_formats = tuple(deduped_formats)

    @property
    def _model(self) -> str:
        """The model a refusal is recorded against, or ``""`` when unnamed."""
        return getattr(self.llm, "model", "") or ""

    def _offerable(
        self,
        ladder: tuple[dict[str, Any] | None, ...],
    ) -> tuple[dict[str, Any] | None, ...]:
        """*ladder* without the rungs this model has already refused (SWR-919).

        Filtered per call rather than in the constructor: a classifier outlives
        many prompts, and the first of them is what teaches the cache. The last
        rung always stays — it is what the ladder falls back *to*.
        """
        kept = [
            rung
            for rung in ladder[:-1]
            if rung is None or not response_format_rejected(self._model, str(rung.get("type", "")))
        ]
        return (*kept, ladder[-1])

    async def classify(
        self,
        raw_prompt: str,
        metadata: dict[str, str] | None = None,
        prior_orchestrator_response: str | None = None,
    ) -> IntentClassificationResult:
        """Classify *raw_prompt*, falling back safely on any runtime or parse error."""

        async def _run() -> IntentClassificationResult:
            user_payload: dict[str, object] = {
                "prompt": raw_prompt[:MAX_PROMPT_CHARS],
                "metadata": dict(metadata or {}),
            }
            prior_response = (prior_orchestrator_response or "").strip()
            if prior_response:
                user_payload["prior_orchestrator_response"] = prior_response[:MAX_PROMPT_CHARS]
            response_formats = self._offerable(
                self.response_formats or (_INTENT_RESPONSE_FORMAT,),
            )
            for index, response_format in enumerate(response_formats):
                messages = _build_classifier_messages(
                    user_payload,
                    response_format=response_format,
                )
                kwargs: dict[str, Any] = {}
                if response_format is not None:
                    kwargs["response_format"] = response_format
                try:
                    response = await asyncio.to_thread(
                        self.llm.completion,
                        messages,
                        **kwargs,
                    )
                except Exception as exc:
                    if response_format is not None and is_response_format_error(exc):
                        # Remembered even when this was the last rung: the
                        # refusal belongs to the model, not to this attempt
                        # (SWR-919).
                        remember_rejected_response_format(
                            self._model,
                            str(response_format.get("type", "")),
                        )
                        if index + 1 < len(response_formats):
                            _log.info(
                                "Intent classifier response_format %s rejected (%s); retrying",
                                response_format.get("type"),
                                exc,
                            )
                            continue
                    raise

                text = _extract_response_text(response)
                if text:
                    return _parse_classification(text)

                if index + 1 < len(response_formats):
                    current_type = response_format.get("type") if response_format else "none"
                    _log.warning(
                        "Intent classifier returned empty content in %s mode; retrying",
                        current_type,
                    )
                    continue
                return _fallback_result("empty classifier response")

            return _fallback_result("intent classifier produced no usable response")

        try:
            return await asyncio.wait_for(_run(), timeout=self.timeout)
        except TimeoutError:
            _log.warning(
                "Intent classification timed out after %.1fs; using %s",
                self.timeout,
                FALLBACK_INTENT,
            )
            return _fallback_result("classification timed out")
        except Exception as exc:  # noqa: BLE001
            _log.warning("Intent classification failed (%s); using %s", exc, FALLBACK_INTENT)
            return _fallback_result(f"classification error: {exc}")


def _validate_mapping_entry(
    intent_name: str,
    raw_value: object,
) -> tuple[IntentCategory, list[str] | None]:
    """Validate one entry from intents.yaml.

    An entry is a mapping carrying an optional ``allowed_tools`` list. Intent-specific
    *prompt* text no longer lives here — behaviour is composed by the playbook matrix
    (``agents/playbook.py``, SWR-2416). This file governs tool gating only.
    """
    try:
        intent = IntentCategory(intent_name)
    except ValueError as exc:
        raise ValueError(f"Unknown intent mapping key: {intent_name}") from exc

    if raw_value is None:
        return intent, None
    if not isinstance(raw_value, dict):
        raise ValueError(f"Intent mapping for {intent_name!r} must be a mapping or empty")
    return intent, _parse_allowed_tools(intent_name, raw_value.get("allowed_tools"))


@traces(SWR.SWR_156)
def load_intent_tools_mapping(
    mapping_file: Path = INTENT_MAPPING_FILE,
) -> dict[IntentCategory, list[str] | None]:
    """Load per-intent tool allow-lists from YAML.

    Returns ``None`` for intents that do not declare an ``allowed_tools`` list —
    meaning those intents impose no tool restriction and existing persona-level
    restrictions (``coordinator_only``, etc.) remain in effect.
    """
    with mapping_file.open("r", encoding="utf-8") as handle:
        raw_mapping = yaml.safe_load(handle)
    if not isinstance(raw_mapping, dict):
        raise ValueError(f"Intent mapping {mapping_file} must be a YAML mapping")

    result: dict[IntentCategory, list[str] | None] = {}
    for raw_intent, raw_value in raw_mapping.items():
        if not isinstance(raw_intent, str):
            raise ValueError("Intent mapping keys must be strings")
        intent, allowed_tools = _validate_mapping_entry(raw_intent, raw_value)
        result[intent] = allowed_tools
    return result


@traces(SWR.SWR_156)
def intent_tools_for(
    intent: IntentCategory,
    *,
    mapping_file: Path = INTENT_MAPPING_FILE,
) -> list[str] | None:
    """Return the allowed tool list for *intent*, or ``None`` if the intent places no restriction.

    When ``None`` is returned the caller should leave existing persona-level restrictions
    (``coordinator_only``, ``read_only``, ``tool_restrictions``) in effect.
    """
    try:
        mapping = load_intent_tools_mapping(mapping_file)
    except Exception as exc:  # noqa: BLE001
        _log.warning("Intent tools mapping failed (%s); not applying tool restriction", exc)
        return None
    return mapping.get(intent, None)


@traces(SWR.SWR_147, SWR.SWR_154, SWR.SWR_167)
async def classify_initial_intent(
    config: RotarisConfig,
    raw_prompt: str,
    *,
    metadata: dict[str, str] | None = None,
    prior_orchestrator_response: str | None = None,
) -> IntentClassificationResult:
    """Build the small-model classifier and classify a root user prompt."""
    model_key = config.small_model or config.fallback_model or config.default_summary_model
    if model_key is None:
        return _fallback_result("no small model configured")

    try:
        from rotaris_core.config.loader import build_llm_usage_id, load_llm_for_model

        model_cfg = config.models.get(model_key)
        response_formats: tuple[dict[str, Any] | None, ...]
        if model_cfg is not None and model_cfg.provider == "deepseek":
            response_formats = (_INTENT_JSON_OBJECT_RESPONSE_FORMAT, None)
        else:
            response_formats = (
                _INTENT_RESPONSE_FORMAT,
                _INTENT_JSON_OBJECT_RESPONSE_FORMAT,
                None,
            )

        llm = load_llm_for_model(
            config,
            model_key,
            stream=False,
            usage_id=build_llm_usage_id("intent-classifier", model_name=model_key),
        )
        return await IntentClassifier(llm, response_formats=response_formats).classify(
            raw_prompt,
            metadata=metadata,
            prior_orchestrator_response=prior_orchestrator_response,
        )
    except Exception as exc:  # noqa: BLE001
        _log.warning("Intent classifier setup failed (%s); using %s", exc, FALLBACK_INTENT)
        return _fallback_result(f"classifier setup error: {exc}")
