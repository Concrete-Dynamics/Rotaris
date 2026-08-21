from __future__ import annotations

import re
from functools import cache
from threading import RLock

from rotaris_core.reqtocode import SWR, traces

_ErrorTypes = tuple[type[Exception], ...]


@cache
def _sdk_error_types() -> tuple[_ErrorTypes, _ErrorTypes, _ErrorTypes]:
    """Resolve the SDK's LLM exception classes on first use, never at import.

    Deliberately not a module-level import. ``rotaris_core.config.loader``
    imports this module, so ``rotaris_core.config`` -- which nearly everything
    reaches -- would sit behind it. ``from openhands.sdk.llm.exceptions.types``
    first executes ``openhands.sdk.__init__``, which pulls the whole Agent stack
    and litellm: measured at ~9.9s of the 10.6s it took to import
    ``rotaris_core.config``. Every process paid that before doing any work, and
    under ``-n auto`` every xdist worker paid it again.

    Returned as one tuple so the import is attempted exactly once. Missing SDK
    yields empty tuples, which the callers already treat as "fall back to
    matching on the message text".
    """
    try:
        from openhands.sdk.llm.exceptions.types import (
            LLMBadRequestError,
            LLMRateLimitError,
            LLMServiceUnavailableError,
        )
    except ImportError:
        return (), (), ()
    return (LLMBadRequestError,), (LLMRateLimitError,), (LLMServiceUnavailableError,)


def _bad_request_error_types() -> _ErrorTypes:
    return _sdk_error_types()[0]


def _rate_limit_error_types() -> _ErrorTypes:
    return _sdk_error_types()[1]


def _service_unavailable_error_types() -> _ErrorTypes:
    return _sdk_error_types()[2]


_CODEX_UNSUPPORTED_PARAMETERS = frozenset(
    {
        "temperature",
        "max_output_tokens",
        "prompt_cache_retention",
    },
)
_UNSUPPORTED_PARAMETER_RE = re.compile(
    r"unsupported parameter:?\s*['\"]?([^,\n\.'\"}\])]+)",
    re.IGNORECASE,
)
_RETRY_AFTER_RE = re.compile(
    r"retry(?:-|\s)after\s*[:=]?\s*(\d+)\s*(seconds?|secs?|s|minutes?|mins?|m)?",
    re.IGNORECASE,
)
_TRY_AGAIN_IN_RE = re.compile(
    r"try again in\s+(\d+)\s*(seconds?|secs?|s|minutes?|mins?|m)",
    re.IGNORECASE,
)
_INSUFFICIENT_QUOTA_RE = re.compile(r"insufficient[_\- ]quota", re.IGNORECASE)
_PLAIN_QUOTA_EXHAUSTION_RE = re.compile(
    r"exceeded\s+your\s+current\s+quota|check\s+your\s+plan\s+and\s+billing",
    re.IGNORECASE,
)
_QUOTA_MODEL_RE = re.compile(
    r"['\"]?(?:requested[_\- ]?model|requested|model)['\"]?\s*[:=]\s*"
    r"\{?\s*['\"]?(?:requested)?['\"]?\s*:?\s*['\"]([^'\"\s,}]+)",
    re.IGNORECASE,
)
_AUTH_ERROR_MARKERS = (
    "authenticationerror",
    "authentication fail",
    "authentication error",
    "invalid api key",
    "invalid_api_key",
    "incorrect api key",
    "api key not valid",
    "unauthorized",
)
_HTTP_401_RE = re.compile(r"\b401\b")


def _error_message(exc: Exception) -> str:
    message = str(exc).strip()
    return message or exc.__class__.__name__


def is_insufficient_quota_error(exc: Exception | str) -> bool:
    """Detect provider-declared quota exhaustion (REQ-20260515-008).

    Matches the structured OpenAI-style ``insufficient_quota`` error code that
    geraet-cloud and other providers emit alongside HTTP 429 when a concrete
    backing provider/model has run out of quota (distinct from transient
    burst rate limiting).
    """
    message = exc if isinstance(exc, str) else _error_message(exc)
    return (
        _INSUFFICIENT_QUOTA_RE.search(message) is not None
        or _PLAIN_QUOTA_EXHAUSTION_RE.search(message) is not None
    )


@traces(SWR.SWR_919)
def is_auth_error(exc: Exception | str) -> bool:
    """Detect provider authentication/credential failures.

    Matches litellm-style ``AuthenticationError`` chains (e.g.
    ``litellm.AuthenticationError: AuthenticationError: DeepseekException -
    Authentication Fails``) as well as generic invalid-key / HTTP 401
    messages. Retrying the same provider without new credentials will keep
    failing, so callers should switch model or re-authenticate instead.
    """
    message = exc if isinstance(exc, str) else _error_message(exc)
    lowered = message.lower()
    return (
        any(marker in lowered for marker in _AUTH_ERROR_MARKERS)
        or _HTTP_401_RE.search(message) is not None
    )


@traces(SWR.SWR_919)
def is_response_format_error(exc: Exception | str) -> bool:
    """Detect a provider refusing the ``response_format`` it was asked for.

    Not a failure of the request but of the *contract* offered with it: the
    prompt was fine and the same call under a weaker format will usually
    succeed, which is what the structured-output ladders in
    :mod:`rotaris_core.requirements.analysis.judge` and
    :mod:`rotaris_core.ralph.intent_classifier` act on. Both used to carry their
    own copy of this predicate; SWR-919 exists so a provider's error text is
    matched in one place.

    Matches on the parameter name because that is what every provider names —
    DeepSeek answers ``This response_format type is unavailable now``, others
    report it as an unsupported parameter.
    """
    message = exc if isinstance(exc, str) else _error_message(exc)
    return "response_format" in message.lower()


#: ``(model, format type)`` pairs a provider has already refused in this
#: process. A negative cache rather than a capability table on purpose:
#: ``litellm.supports_response_schema`` answers ``True`` for models whose API
#: rejects ``json_schema`` at runtime (deepseek/deepseek-v4-pro is one), so the
#: only trustworthy source is the provider's own refusal.
_rejected_formats: set[tuple[str, str]] = set()
_rejected_formats_lock = RLock()


@traces(SWR.SWR_919)
def remember_rejected_response_format(model: str, format_type: str) -> None:
    """Record that *model* refuses *format_type*, for this process's lifetime.

    Not persisted: a provider that gains a format between releases should be
    offered it again on the next launch, and a cache on disk would keep an
    obsolete refusal alive indefinitely. Within one process the refusal is
    stable, and re-offering it costs a full round trip on every call.
    """
    if not model or not format_type:
        return
    with _rejected_formats_lock:
        _rejected_formats.add((model, format_type))


@traces(SWR.SWR_919)
def response_format_rejected(model: str, format_type: str) -> bool:
    """Whether *model* has already refused *format_type* in this process.

    ``False`` for an unnamed model: a caller that cannot say which model it is
    asking must keep offering the ladder's top rung rather than inherit another
    model's refusal.
    """
    if not model or not format_type:
        return False
    with _rejected_formats_lock:
        return (model, format_type) in _rejected_formats


def reset_rejected_response_formats() -> None:
    """Forget every recorded refusal (test isolation, full-process shutdown)."""
    with _rejected_formats_lock:
        _rejected_formats.clear()


@traces(SWR.SWR_919)
def is_request_encoding_error(exc: Exception | str) -> bool:
    """Detect local HTTP-header encoding failures mislabeled as provider 500s."""
    message = exc if isinstance(exc, str) else _error_message(exc)
    lowered = message.lower()
    return "ascii" in lowered and (
        "codec can't encode character" in lowered or "ordinal not in range(128)" in lowered
    )


@traces(SWR.SWR_919)
def is_rate_limit_error(exc: Exception | str) -> bool:
    """Detect generic provider usage/rate-limit errors (REQ-20260515-001)."""
    rate_limit_errors = _rate_limit_error_types()
    if isinstance(exc, Exception) and rate_limit_errors and isinstance(exc, rate_limit_errors):
        return True

    message = exc if isinstance(exc, str) else _error_message(exc)
    lowered = message.lower()
    return "rate limit" in lowered or "429" in lowered or "too many requests" in lowered


def extract_retry_after_seconds(exc: Exception | str) -> int | None:
    message = exc if isinstance(exc, str) else _error_message(exc)
    hint = _extract_retry_after_hint(message)
    if hint is None:
        return None
    if hint.endswith("m"):
        return int(hint[:-1]) * 60
    if hint.endswith("s"):
        return int(hint[:-1])
    return None


def extract_quota_exhausted_model(exc: Exception | str) -> str | None:
    """Best-effort extraction of the model name from a quota-exhausted error."""
    message = exc if isinstance(exc, str) else _error_message(exc)
    match = _QUOTA_MODEL_RE.search(message)
    if match is None:
        return None
    return match.group(1).strip() or None


def extract_unsupported_parameter(exc: Exception | str) -> str | None:
    message = exc if isinstance(exc, str) else _error_message(exc)
    match = _UNSUPPORTED_PARAMETER_RE.search(message)
    if match is None:
        return None
    normalized = match.group(1).strip().strip("'\"")
    normalized = normalized.replace(" ", "_")
    return normalized or None


def should_condense_llm_bad_request(exc: Exception) -> bool:
    bad_request_errors = _bad_request_error_types()
    if bad_request_errors and not isinstance(exc, bad_request_errors):
        return False
    return extract_unsupported_parameter(exc) is None


@traces(SWR.SWR_919)
def is_transient_llm_runtime_error(exc: Exception) -> bool:
    if isinstance(exc, TimeoutError):
        return False

    if is_request_encoding_error(exc):
        return False

    # Provider quota exhaustion (e.g. ``insufficient_quota`` on a concrete
    # backing model) is not transient — retrying the same model just burns
    # more requests against an exhausted provider (REQ-20260515-008).
    if is_insufficient_quota_error(exc):
        return False

    # Credential failures are permanent until the user re-authenticates or
    # switches provider — retrying the same model is pointless.
    if is_auth_error(exc):
        return False

    if isinstance(exc, _rate_limit_error_types() + _service_unavailable_error_types()):
        return True

    message = _error_message(exc).lower()
    class_name = exc.__class__.__name__.lower()
    transient_markers = (
        "apiconnectionerror",
        "connection error",
        "connection reset",
        "connection aborted",
        "incomplete chunked read",
        "midstreamfallbackerror",
        "peer closed connection",
        "service unavailable",
        "temporarily unavailable",
        "timeout",
        "timed out",
        "transport",
    )
    return any(marker in message or marker in class_name for marker in transient_markers)


def format_llm_runtime_error(exc: Exception) -> str:
    message = _error_message(exc)
    lower_message = message.lower()

    if is_request_encoding_error(message):
        return (
            "LLM credential or HTTP header contains a non-ASCII character. "
            "Re-enter the provider API key using its exact ASCII value."
        )

    if is_insufficient_quota_error(message):
        model = extract_quota_exhausted_model(message)
        if model is not None:
            return (
                f"Provider quota exhausted for model '{model}' (insufficient_quota). "
                "Retrying the same provider/model will keep failing — switch model "
                "or top up the provider account."
            )
        return (
            "Provider quota exhausted (insufficient_quota). Retrying the same "
            "provider/model will keep failing — switch model or top up the "
            "provider account."
        )

    if is_rate_limit_error(message):
        retry_after = _extract_retry_after_hint(message)
        if retry_after is not None:
            return f"LLM provider rate limit hit. Retry after about {retry_after}."
        return "LLM provider rate limit hit. Wait a bit and retry."

    if (
        isinstance(exc, _service_unavailable_error_types())
        or "service unavailable" in lower_message
    ):
        return "LLM provider is temporarily unavailable. Retry in a moment."

    if "No active exception to reraise" in message:
        return (
            "Internal concurrency error: a bare 'raise' was executed in a thread boundary "
            "where no exception was active. This is often triggered by a race condition "
            "between the conversation state lock and the asyncio thread pool during "
            "parent-conversation resume. The iteration has been aborted; the session "
            "will continue with the remaining tasks."
        )

    parameter = extract_unsupported_parameter(message)
    if parameter is not None:
        if parameter in _CODEX_UNSUPPORTED_PARAMETERS:
            return (
                f"Codex compatibility error: backend rejected parameter '{parameter}'. "
                "This backend only accepts a reduced Responses parameter set."
            )
        return f"LLM request rejected unsupported parameter '{parameter}'."

    return message


def summarize_failure_detail(summary: str | None) -> str | None:
    if summary is None:
        return None
    cleaned = summary.strip()
    if not cleaned:
        return None
    if cleaned.startswith("Child failed: "):
        return cleaned.removeprefix("Child failed: ")
    return cleaned


def _extract_retry_after_hint(message: str) -> str | None:
    for pattern in (_RETRY_AFTER_RE, _TRY_AGAIN_IN_RE):
        match = pattern.search(message)
        if match is None:
            continue
        amount = match.group(1)
        unit = (match.group(2) or "s").lower()
        if unit.startswith("m"):
            return f"{amount}m"
        return f"{amount}s"
    return None
