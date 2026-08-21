from __future__ import annotations

from rotaris_core.cost import (
    CostSnapshot,
    CostSource,
    extract_cost_usage,
    format_cost,
)
from rotaris_core.reqtocode import SWR, verifies


class FakeMetrics:
    """Stand-in for ``openhands.sdk.llm.utils.metrics.Metrics``.

    The SDK appends to ``costs`` only for calls it could price, while every
    call that reported usage lands in ``token_usages`` — the asymmetry the
    cost module reads.
    """

    def __init__(
        self,
        accumulated_cost: float = 0.0,
        priced: int = 0,
        calls: int = 0,
    ):
        self.accumulated_cost = accumulated_cost
        self.costs = [object() for _ in range(priced)]
        self.token_usages = [object() for _ in range(calls)]


class FakeLLM:
    def __init__(
        self,
        metrics: FakeMetrics | None = None,
        input_cost_per_token: float | None = None,
    ):
        self.metrics = metrics
        self.input_cost_per_token = input_cost_per_token


@verifies(SWR.SWR_835, SWR.SWR_839)
def test_extract_cost_usage_all_calls_priced() -> None:
    llm = FakeLLM(FakeMetrics(accumulated_cost=0.1234, priced=3, calls=3))

    snap = extract_cost_usage(llm)

    assert snap.accumulated_cost == 0.1234
    assert snap.priced_calls == 3
    assert snap.unpriced_calls == 0
    assert snap.source is CostSource.PROVIDER
    assert snap.is_complete


@verifies(SWR.SWR_835, SWR.SWR_838)
def test_extract_cost_usage_no_call_priced_is_unavailable_not_zero() -> None:
    llm = FakeLLM(FakeMetrics(accumulated_cost=0.0, priced=0, calls=5))

    snap = extract_cost_usage(llm)

    assert snap.priced_calls == 0
    assert snap.unpriced_calls == 5
    assert snap.source is CostSource.UNAVAILABLE
    assert not snap.has_cost_data
    assert format_cost(snap) == "n/a"


@verifies(SWR.SWR_835, SWR.SWR_839)
def test_extract_cost_usage_partial_pricing_is_mixed() -> None:
    llm = FakeLLM(FakeMetrics(accumulated_cost=0.02, priced=2, calls=5))

    snap = extract_cost_usage(llm)

    assert snap.priced_calls == 2
    assert snap.unpriced_calls == 3
    assert snap.source is CostSource.MIXED
    assert not snap.is_complete


@verifies(SWR.SWR_837, SWR.SWR_839)
def test_extract_cost_usage_configured_pricing_is_labelled() -> None:
    llm = FakeLLM(
        FakeMetrics(accumulated_cost=0.5, priced=2, calls=2),
        input_cost_per_token=0.000001,
    )

    snap = extract_cost_usage(llm)

    assert snap.source is CostSource.CONFIGURED
    assert format_cost(snap) == "$0.5000 (configured)"


@verifies(SWR.SWR_835)
def test_extract_cost_usage_without_metrics_returns_empty() -> None:
    snap = extract_cost_usage(FakeLLM(metrics=None))

    assert snap == CostSnapshot()
    assert snap.source is CostSource.UNAVAILABLE


@verifies(SWR.SWR_835)
def test_extract_cost_usage_plain_object_returns_empty() -> None:
    assert extract_cost_usage(object()) == CostSnapshot()


@verifies(SWR.SWR_835)
def test_extract_cost_usage_ignores_non_numeric_accumulated_cost() -> None:
    metrics = FakeMetrics(priced=1, calls=1)
    metrics.accumulated_cost = None  # type: ignore[assignment]

    snap = extract_cost_usage(FakeLLM(metrics))

    assert snap.accumulated_cost == 0.0
    assert snap.priced_calls == 1


@verifies(SWR.SWR_835)
def test_extract_cost_usage_more_costs_than_usages_never_goes_negative() -> None:
    snap = extract_cost_usage(FakeLLM(FakeMetrics(accumulated_cost=0.3, priced=4, calls=1)))

    assert snap.unpriced_calls == 0


@verifies(SWR.SWR_835, SWR.SWR_839)
def test_merge_sums_costs_and_keeps_a_single_source() -> None:
    first = CostSnapshot(accumulated_cost=0.2, priced_calls=1, source=CostSource.PROVIDER)
    second = CostSnapshot(accumulated_cost=0.3, priced_calls=2, source=CostSource.PROVIDER)

    merged = first.merge(second)

    assert merged.accumulated_cost == 0.5
    assert merged.priced_calls == 3
    assert merged.source is CostSource.PROVIDER


@verifies(SWR.SWR_839)
def test_merge_of_differing_sources_is_mixed() -> None:
    priced = CostSnapshot(accumulated_cost=0.2, priced_calls=1, source=CostSource.PROVIDER)
    unpriced = CostSnapshot(unpriced_calls=4, source=CostSource.UNAVAILABLE)

    merged = priced.merge(unpriced)

    assert merged.source is CostSource.MIXED
    assert merged.unpriced_calls == 4


@verifies(SWR.SWR_839)
def test_merge_with_empty_snapshot_keeps_original_source() -> None:
    configured = CostSnapshot(accumulated_cost=0.7, priced_calls=2, source=CostSource.CONFIGURED)

    assert configured.merge(CostSnapshot()).source is CostSource.CONFIGURED
    assert CostSnapshot().merge(configured).source is CostSource.CONFIGURED


@verifies(SWR.SWR_841)
def test_format_cost_never_renders_zero_for_unknown_pricing() -> None:
    assert format_cost(CostSnapshot()) == "—"
    assert format_cost(CostSnapshot(unpriced_calls=3)) == "n/a"
    assert "0.00" not in format_cost(CostSnapshot(unpriced_calls=3))


@verifies(SWR.SWR_839, SWR.SWR_841)
def test_format_cost_marks_partial_totals() -> None:
    snap = CostSnapshot(
        accumulated_cost=0.0125,
        priced_calls=1,
        unpriced_calls=2,
        source=CostSource.MIXED,
    )

    assert format_cost(snap) == "~$0.0125 (partial)"


@verifies(SWR.SWR_839, SWR.SWR_841)
def test_format_cost_provider_amount_is_unqualified() -> None:
    snap = CostSnapshot(accumulated_cost=1.5, priced_calls=4, source=CostSource.PROVIDER)

    assert format_cost(snap) == "$1.5000"


@verifies(SWR.SWR_841)
def test_format_cost_renders_a_genuine_zero_from_a_priced_run() -> None:
    snap = CostSnapshot(accumulated_cost=0.0, priced_calls=2, source=CostSource.PROVIDER)

    assert format_cost(snap) == "$0.0000"


@verifies(SWR.SWR_835)
def test_cost_snapshot_serialization_round_trip() -> None:
    snap = CostSnapshot(
        accumulated_cost=0.42,
        priced_calls=3,
        unpriced_calls=1,
        source=CostSource.MIXED,
    )

    restored = CostSnapshot.model_validate(snap.model_dump(mode="json"))

    assert restored == snap
    assert restored.source is CostSource.MIXED


@verifies(SWR.SWR_836)
def test_compression_path_never_imports_cost() -> None:
    """Cost reporting must stay out of the compression decision path."""
    import inspect

    from rotaris_core import cost as cost_module
    from rotaris_core import tokens as tokens_module
    from rotaris_core.agents import compressor as compressor_module

    for module in (tokens_module, compressor_module):
        assert "rotaris_core.cost" not in inspect.getsource(module)

    assert not hasattr(cost_module, "estimate_context_tokens_from_chars")
