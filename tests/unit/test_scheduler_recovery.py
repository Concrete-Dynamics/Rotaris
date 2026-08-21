"""Unit tests for scheduler recovery gap fix — ConversationRunError unwrapping."""

from __future__ import annotations

import pytest

from rotaris_core.orchestrator.scheduler_conversation import should_unwrap_conversation_run_error
from rotaris_core.reqtocode import SWR, verifies


@verifies(SWR.SWR_919)
def test_should_unwrap_conversation_run_error_with_llm_bad_request() -> None:
    """A ConversationRunError wrapping LLMBadRequestError should be unwrapped."""
    try:
        from openhands.sdk.conversation.exceptions import ConversationRunError
        from openhands.sdk.llm.exceptions.types import LLMBadRequestError
    except ImportError:
        pytest.skip("SDK imports not available")

    inner = LLMBadRequestError("Bad request: reasoning_content missing")
    outer = ConversationRunError("conv-1", inner, persistence_dir="/tmp/test")

    assert should_unwrap_conversation_run_error(outer) is True


@verifies(SWR.SWR_919)
def test_should_unwrap_conversation_run_error_with_non_llm_cause() -> None:
    """A ConversationRunError wrapping a non-LLM error should NOT be unwrapped."""
    try:
        from openhands.sdk.conversation.exceptions import ConversationRunError
    except ImportError:
        pytest.skip("SDK imports not available")

    inner = ValueError("Something else went wrong")
    outer = ConversationRunError("conv-1", inner, persistence_dir="/tmp/test")

    assert should_unwrap_conversation_run_error(outer) is False


@verifies(SWR.SWR_919)
def test_should_unwrap_conversation_run_error_sdk_not_available() -> None:
    """When the SDK's ConversationRunError isn't available, no unwrapping occurs."""
    # should_unwrap_conversation_run_error guards against None sentinel.
    # The global _ConversationRunError is only set on import success.
    assert should_unwrap_conversation_run_error(RuntimeError("bare error")) is False
