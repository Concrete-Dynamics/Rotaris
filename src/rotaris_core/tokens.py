"""Centralized token tracking utilities.

Extracts actual token usage from the OpenHands SDK ``LLM.metrics``
subsystem, replacing crude ``total_chars // 4`` estimates throughout
the codebase.
"""

from __future__ import annotations

import logging

from pydantic import BaseModel

from rotaris_core.reqtocode import SWR, traces

_log = logging.getLogger(__name__)


class TokenSnapshot(BaseModel):
    """Serializable aggregate token usage for a session or agent."""

    prompt_tokens: int = 0
    completion_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0
    reasoning_tokens: int = 0

    @property
    def total_tokens(self) -> int:
        return self.prompt_tokens + self.completion_tokens

    def merge(self, other: TokenSnapshot) -> TokenSnapshot:
        return TokenSnapshot(
            prompt_tokens=self.prompt_tokens + other.prompt_tokens,
            completion_tokens=self.completion_tokens + other.completion_tokens,
            cache_read_tokens=self.cache_read_tokens + other.cache_read_tokens,
            cache_write_tokens=self.cache_write_tokens + other.cache_write_tokens,
            reasoning_tokens=self.reasoning_tokens + other.reasoning_tokens,
        )


@traces(SWR.SWR_1419)
def extract_token_usage(llm: object) -> TokenSnapshot:
    """Extract accumulated token usage from an LLM instance.

    Reads ``LLM.metrics.accumulated_token_usage`` when available,
    falling back to summing individual ``token_usages`` entries.
    Returns an empty snapshot when metrics are unavailable.
    """
    metrics = getattr(llm, "metrics", None)
    if metrics is None:
        return TokenSnapshot()

    accumulated = getattr(metrics, "accumulated_token_usage", None)
    if accumulated is not None:
        return TokenSnapshot(
            prompt_tokens=getattr(accumulated, "prompt_tokens", 0) or 0,
            completion_tokens=getattr(accumulated, "completion_tokens", 0) or 0,
            cache_read_tokens=getattr(accumulated, "cache_read_tokens", 0) or 0,
            cache_write_tokens=getattr(accumulated, "cache_write_tokens", 0) or 0,
            reasoning_tokens=getattr(accumulated, "reasoning_tokens", 0) or 0,
        )

    token_usages: list[object] = getattr(metrics, "token_usages", None) or []
    if not token_usages:
        return TokenSnapshot()

    total = TokenSnapshot()
    for usage in token_usages:
        total = total.merge(
            TokenSnapshot(
                prompt_tokens=getattr(usage, "prompt_tokens", 0) or 0,
                completion_tokens=getattr(usage, "completion_tokens", 0) or 0,
                cache_read_tokens=getattr(usage, "cache_read_tokens", 0) or 0,
                cache_write_tokens=getattr(usage, "cache_write_tokens", 0) or 0,
                reasoning_tokens=getattr(usage, "reasoning_tokens", 0) or 0,
            ),
        )
    return total


def get_last_prompt_token_count(llm: object) -> int | None:
    """Return the prompt token count from the most recent LLM call.

    This approximates the current context window size in tokens —
    suitable for compression threshold comparisons.  Returns ``None``
    when metrics are unavailable or no calls have been made.
    """
    metrics = getattr(llm, "metrics", None)
    if metrics is None:
        return None
    token_usages: list[object] = getattr(metrics, "token_usages", None) or []
    if not token_usages:
        return None
    last = token_usages[-1]
    prompt_tokens = getattr(last, "prompt_tokens", None)
    return prompt_tokens if isinstance(prompt_tokens, int) and prompt_tokens > 0 else None


def estimate_context_tokens_from_chars(
    total_chars: int,
    chars_per_token: int = 4,
) -> int:
    return total_chars // max(chars_per_token, 1)
