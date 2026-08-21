from __future__ import annotations

from openhands.sdk.llm.exceptions.types import LLMBadRequestError, LLMRateLimitError

from rotaris_core.llm_errors import (
    extract_quota_exhausted_model,
    extract_retry_after_seconds,
    extract_unsupported_parameter,
    format_llm_runtime_error,
    is_auth_error,
    is_insufficient_quota_error,
    is_request_encoding_error,
    is_transient_llm_runtime_error,
    should_condense_llm_bad_request,
    summarize_failure_detail,
)
from rotaris_core.reqtocode import SWR, verifies


@verifies(SWR.SWR_908)
@verifies(SWR.SWR_919)
def test_extract_unsupported_parameter_normalizes_spaces() -> None:
    assert extract_unsupported_parameter("Unsupported parameter: max output tokens.") == (
        "max_output_tokens"
    )


@verifies(SWR.SWR_908)
def test_should_condense_llm_bad_request_rejects_unsupported_parameters() -> None:
    exc = LLMBadRequestError("Unsupported parameter: prompt_cache_retention")

    assert not should_condense_llm_bad_request(exc)


@verifies(SWR.SWR_908)
def test_format_llm_runtime_error_formats_known_codex_parameter() -> None:
    exc = LLMBadRequestError("Unsupported parameter: prompt_cache_retention")

    assert format_llm_runtime_error(exc) == (
        "Codex compatibility error: backend rejected parameter 'prompt_cache_retention'. "
        "This backend only accepts a reduced Responses parameter set."
    )


@verifies(SWR.SWR_904)
def test_format_llm_runtime_error_formats_rate_limit_retry_after() -> None:
    exc = LLMRateLimitError("429 Too Many Requests. Retry-After: 12")

    assert format_llm_runtime_error(exc) == ("LLM provider rate limit hit. Retry after about 12s.")


@verifies(SWR.SWR_908)
def test_summarize_failure_detail_strips_child_prefix() -> None:
    assert summarize_failure_detail("Child failed: backend rejected request") == (
        "backend rejected request"
    )


@verifies(SWR.SWR_908)
def test_is_insufficient_quota_error_detects_structured_code() -> None:
    exc = LLMRateLimitError(
        '429 {"error":{"type":"insufficient_quota","code":"insufficient_quota"}}',
    )

    assert is_insufficient_quota_error(exc)


@verifies(SWR.SWR_908)
def test_is_insufficient_quota_error_ignores_plain_rate_limit() -> None:
    exc = LLMRateLimitError("429 Too Many Requests. Retry-After: 12")

    assert not is_insufficient_quota_error(exc)


@verifies(SWR.SWR_908)
def test_is_insufficient_quota_error_detects_plain_provider_quota_text() -> None:
    exc = LLMRateLimitError(
        "You exceeded your current quota, please check your plan and billing details.",
    )

    assert is_insufficient_quota_error(exc)


@verifies(SWR.SWR_908)
def test_insufficient_quota_is_not_classified_transient() -> None:
    exc = LLMRateLimitError(
        '429 {"error":{"type":"insufficient_quota","code":"insufficient_quota"}}',
    )

    assert not is_transient_llm_runtime_error(exc)


@verifies(SWR.SWR_908)
def test_extract_quota_exhausted_model_finds_requested_model() -> None:
    message = (
        "429 insufficient_quota "
        '{"model":{"requested":"Qwen/Qwen3.6-35B-A3B"},'
        '"error":{"type":"insufficient_quota","code":"insufficient_quota"}}'
    )

    assert extract_quota_exhausted_model(message) == "Qwen/Qwen3.6-35B-A3B"


@verifies(SWR.SWR_908)
def test_format_llm_runtime_error_calls_out_quota_exhaustion_with_model() -> None:
    exc = LLMRateLimitError('429 insufficient_quota model:"Qwen/Qwen3.6-35B-A3B"')

    formatted = format_llm_runtime_error(exc)

    assert "insufficient_quota" in formatted
    assert "Qwen/Qwen3.6-35B-A3B" in formatted


@verifies(SWR.SWR_904, SWR.SWR_905)
def test_extract_retry_after_seconds_supports_minutes() -> None:
    exc = LLMRateLimitError("429 Too Many Requests. Retry-After: 2 minutes")

    assert extract_retry_after_seconds(exc) == 120


@verifies(SWR.SWR_919)
def test_is_auth_error_detects_litellm_authentication_chain() -> None:
    message = (
        "Conversation run failed for id=a1b5bbc8-f2b3-4e8c-9001-002fe36fb02f: "
        "litellm.AuthenticationError: AuthenticationError: DeepseekException - "
        "Authentication Fails (governor)"
    )

    assert is_auth_error(message)
    assert is_auth_error(RuntimeError(message))


@verifies(SWR.SWR_919)
def test_is_auth_error_detects_http_401_and_invalid_key() -> None:
    assert is_auth_error("OpenAIException - Error code: 401 - invalid_api_key")
    assert is_auth_error("Incorrect API key provided")


@verifies(SWR.SWR_919)
def test_is_auth_error_ignores_unrelated_failures() -> None:
    assert not is_auth_error("429 Too Many Requests. Retry-After: 12")
    assert not is_auth_error("Connection reset by peer")
    assert not is_auth_error("context window exceeded: 140100 tokens")


@verifies(SWR.SWR_919)
def test_auth_error_is_not_classified_transient() -> None:
    # Retrying an auth failure without new credentials cannot succeed, even
    # when the provider message happens to mention a transient-looking word.
    exc = RuntimeError("AuthenticationError: token validation timed out upstream")

    assert not is_transient_llm_runtime_error(exc)


@verifies(SWR.SWR_919)
def test_ascii_header_encoding_error_has_actionable_message() -> None:
    exc = RuntimeError(
        "DeepseekException - 'ascii' codec can't encode character '\\xe4' in position 55: "
        "ordinal not in range(128)"
    )

    assert is_request_encoding_error(exc)
    assert not is_transient_llm_runtime_error(exc)
    assert format_llm_runtime_error(exc) == (
        "LLM credential or HTTP header contains a non-ASCII character. "
        "Re-enter the provider API key using its exact ASCII value."
    )


@verifies(SWR.SWR_908)
def test_extract_unsupported_parameter_ignores_json_wrapper_noise() -> None:
    raw = (
        'litellm.BadRequestError: OpenAIException - {"detail":"Unsupported parameter: temperature"}'
    )

    assert extract_unsupported_parameter(raw) == "temperature"
    assert format_llm_runtime_error(RuntimeError(raw)) == (
        "Codex compatibility error: backend rejected parameter 'temperature'. "
        "This backend only accepts a reduced Responses parameter set."
    )
