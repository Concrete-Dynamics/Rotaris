from __future__ import annotations

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tokens import (
    TokenSnapshot,
    estimate_context_tokens_from_chars,
    extract_token_usage,
    get_last_prompt_token_count,
)


class FakeTokenUsage:
    def __init__(
        self,
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
        cache_read_tokens: int = 0,
        cache_write_tokens: int = 0,
        reasoning_tokens: int = 0,
    ):
        self.prompt_tokens = prompt_tokens
        self.completion_tokens = completion_tokens
        self.cache_read_tokens = cache_read_tokens
        self.cache_write_tokens = cache_write_tokens
        self.reasoning_tokens = reasoning_tokens


class FakeMetrics:
    def __init__(
        self,
        accumulated: FakeTokenUsage | None = None,
        usages: list[FakeTokenUsage] | None = None,
    ):
        self.accumulated_token_usage = accumulated
        self.token_usages = usages or []


class FakeLLM:
    def __init__(self, metrics: FakeMetrics | None = None):
        self.metrics = metrics


@verifies(SWR.SWR_1419)
def test_token_snapshot_total_tokens() -> None:
    snap = TokenSnapshot(prompt_tokens=100, completion_tokens=50)
    assert snap.total_tokens == 150


@verifies(SWR.SWR_1419)
def test_token_snapshot_merge() -> None:
    a = TokenSnapshot(
        prompt_tokens=10,
        completion_tokens=20,
        cache_read_tokens=5,
        cache_write_tokens=3,
        reasoning_tokens=1,
    )
    b = TokenSnapshot(
        prompt_tokens=30,
        completion_tokens=40,
        cache_read_tokens=15,
        cache_write_tokens=7,
        reasoning_tokens=9,
    )
    merged = a.merge(b)

    assert merged.prompt_tokens == 40
    assert merged.completion_tokens == 60
    assert merged.cache_read_tokens == 20
    assert merged.cache_write_tokens == 10
    assert merged.reasoning_tokens == 10
    assert merged.total_tokens == 100


@verifies(SWR.SWR_1419)
def test_token_snapshot_defaults_to_zero() -> None:
    snap = TokenSnapshot()
    assert snap.total_tokens == 0
    assert snap.prompt_tokens == 0


@verifies(SWR.SWR_1419)
def test_extract_token_usage_from_accumulated() -> None:
    metrics = FakeMetrics(
        accumulated=FakeTokenUsage(prompt_tokens=500, completion_tokens=200, cache_read_tokens=50),
    )
    llm = FakeLLM(metrics)

    snap = extract_token_usage(llm)

    assert snap.prompt_tokens == 500
    assert snap.completion_tokens == 200
    assert snap.cache_read_tokens == 50
    assert snap.total_tokens == 700


@verifies(SWR.SWR_1419)
def test_extract_token_usage_falls_back_to_summing_usages() -> None:
    usage1 = FakeTokenUsage(prompt_tokens=100, completion_tokens=50)
    usage2 = FakeTokenUsage(prompt_tokens=200, completion_tokens=75, reasoning_tokens=10)
    metrics = FakeMetrics(accumulated=None, usages=[usage1, usage2])
    llm = FakeLLM(metrics)

    snap = extract_token_usage(llm)

    assert snap.prompt_tokens == 300
    assert snap.completion_tokens == 125
    assert snap.reasoning_tokens == 10
    assert snap.total_tokens == 425


@verifies(SWR.SWR_1419)
def test_extract_token_usage_no_metrics_returns_empty() -> None:
    llm = FakeLLM(metrics=None)

    snap = extract_token_usage(llm)

    assert snap.total_tokens == 0


@verifies(SWR.SWR_1419)
def test_extract_token_usage_empty_usages_returns_empty() -> None:
    metrics = FakeMetrics(accumulated=None, usages=[])
    llm = FakeLLM(metrics)

    snap = extract_token_usage(llm)

    assert snap.total_tokens == 0


@verifies(SWR.SWR_1419)
def test_extract_token_usage_handles_none_fields() -> None:
    accumulated = FakeTokenUsage(prompt_tokens=100)
    accumulated.cache_read_tokens = None  # type: ignore[assignment]
    metrics = FakeMetrics(accumulated=accumulated)
    llm = FakeLLM(metrics)

    snap = extract_token_usage(llm)

    assert snap.prompt_tokens == 100
    assert snap.cache_read_tokens == 0


@verifies(SWR.SWR_1419)
def test_extract_token_usage_plain_object_returns_empty() -> None:
    snap = extract_token_usage(object())
    assert snap.total_tokens == 0


@verifies(SWR.SWR_1401, SWR.SWR_1419)
def test_get_last_prompt_token_count_returns_last() -> None:
    usages = [
        FakeTokenUsage(prompt_tokens=1000),
        FakeTokenUsage(prompt_tokens=2500),
        FakeTokenUsage(prompt_tokens=4200),
    ]
    metrics = FakeMetrics(usages=usages)
    llm = FakeLLM(metrics)

    assert get_last_prompt_token_count(llm) == 4200


@verifies(SWR.SWR_1419)
def test_get_last_prompt_token_count_no_metrics() -> None:
    assert get_last_prompt_token_count(FakeLLM(metrics=None)) is None


@verifies(SWR.SWR_1419)
def test_get_last_prompt_token_count_no_usages() -> None:
    metrics = FakeMetrics(usages=[])
    assert get_last_prompt_token_count(FakeLLM(metrics)) is None


@verifies(SWR.SWR_1419)
def test_get_last_prompt_token_count_zero_returns_none() -> None:
    metrics = FakeMetrics(usages=[FakeTokenUsage(prompt_tokens=0)])
    assert get_last_prompt_token_count(FakeLLM(metrics)) is None


@verifies(SWR.SWR_1419)
def test_get_last_prompt_token_count_plain_object() -> None:
    assert get_last_prompt_token_count(object()) is None


@verifies(SWR.SWR_1419)
def test_estimate_context_tokens_from_chars() -> None:
    assert estimate_context_tokens_from_chars(400, 4) == 100
    assert estimate_context_tokens_from_chars(400, 1) == 400
    assert estimate_context_tokens_from_chars(0, 4) == 0


@verifies(SWR.SWR_1419)
def test_estimate_context_tokens_clamps_chars_per_token() -> None:
    assert estimate_context_tokens_from_chars(100, 0) == 100
    assert estimate_context_tokens_from_chars(100, -5) == 100


@verifies(SWR.SWR_1419)
def test_token_snapshot_serialization_round_trip() -> None:
    snap = TokenSnapshot(
        prompt_tokens=500,
        completion_tokens=200,
        cache_read_tokens=50,
        cache_write_tokens=10,
        reasoning_tokens=5,
    )
    data = snap.model_dump(mode="json")
    restored = TokenSnapshot.model_validate(data)

    assert restored == snap
    assert restored.total_tokens == 700
