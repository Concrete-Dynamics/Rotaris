"""Centralized usage-cost reporting.

Reads monetary cost from the OpenHands SDK ``LLM.metrics`` subsystem.
Rotaris never derives prices on its own: a cost value either comes
from the provider/LiteLLM pricing registry, or from per-model pricing
the user configured (which the SDK forwards to LiteLLM), or it is
reported as unavailable.  A model LiteLLM cannot price must never be
displayed as costing nothing.

Deliberately separate from :mod:`rotaris_core.tokens`: token estimation
feeds context-compression decisions, price reporting does not.  The two
must not become coupled.
"""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel

from rotaris_core.reqtocode import SWR, traces


@traces(SWR.SWR_839)
class CostSource(StrEnum):
    """Where a cost figure came from — never a Rotaris calculation."""

    PROVIDER = "provider"
    """Priced by LiteLLM's own registry or a provider cost header."""

    CONFIGURED = "configured"
    """Priced from user-supplied per-model pricing metadata."""

    UNAVAILABLE = "unavailable"
    """No pricing known — cost is unknown, not zero."""

    MIXED = "mixed"
    """Some calls were priced and some were not; the total is partial."""


@traces(SWR.SWR_835, SWR.SWR_836, SWR.SWR_839)
class CostSnapshot(BaseModel):
    """Serializable aggregate usage cost for a session or agent."""

    accumulated_cost: float = 0.0
    priced_calls: int = 0
    unpriced_calls: int = 0
    source: CostSource = CostSource.UNAVAILABLE

    @property
    def has_cost_data(self) -> bool:
        """True when at least one call was priced."""
        return self.priced_calls > 0

    @property
    def is_complete(self) -> bool:
        """True when every recorded call carried a price."""
        return self.priced_calls > 0 and self.unpriced_calls == 0

    def merge(self, other: CostSnapshot) -> CostSnapshot:
        return CostSnapshot(
            accumulated_cost=self.accumulated_cost + other.accumulated_cost,
            priced_calls=self.priced_calls + other.priced_calls,
            unpriced_calls=self.unpriced_calls + other.unpriced_calls,
            source=_merge_sources(self, other),
        )


@traces(SWR.SWR_835, SWR.SWR_838, SWR.SWR_839)
def extract_cost_usage(llm: object) -> CostSnapshot:
    """Extract accumulated usage cost from an LLM instance.

    ``Metrics.accumulated_cost`` is the SDK's running total.  The SDK only
    appends to ``metrics.costs`` when a call could actually be priced,
    while ``metrics.token_usages`` gets an entry for every call that
    reported usage — so the difference between the two is the number of
    calls whose price is unknown.  That is what separates "this session
    cost nothing" from "we cannot know what this session cost".
    """
    metrics = getattr(llm, "metrics", None)
    if metrics is None:
        return CostSnapshot()

    costs: list[object] = getattr(metrics, "costs", None) or []
    token_usages: list[object] = getattr(metrics, "token_usages", None) or []
    priced_calls = len(costs)
    unpriced_calls = max(len(token_usages) - priced_calls, 0)

    accumulated = getattr(metrics, "accumulated_cost", 0.0)
    accumulated_cost = float(accumulated) if isinstance(accumulated, int | float) else 0.0

    return CostSnapshot(
        accumulated_cost=accumulated_cost,
        priced_calls=priced_calls,
        unpriced_calls=unpriced_calls,
        source=_resolve_source(llm, priced_calls=priced_calls, unpriced_calls=unpriced_calls),
    )


@traces(SWR.SWR_839, SWR.SWR_841)
def format_cost(snapshot: CostSnapshot) -> str:
    """Render a snapshot for display, labelling anything not provider-exact.

    Never returns a bare ``$0.00`` for a session with no pricing data —
    an unknown cost reads as unknown.
    """
    if not snapshot.has_cost_data:
        return "n/a" if snapshot.unpriced_calls else "—"

    amount = f"${snapshot.accumulated_cost:.4f}"
    if snapshot.source is CostSource.MIXED or not snapshot.is_complete:
        return f"~{amount} (partial)"
    if snapshot.source is CostSource.CONFIGURED:
        return f"{amount} (configured)"
    return amount


def _resolve_source(llm: object, *, priced_calls: int, unpriced_calls: int) -> CostSource:
    if priced_calls == 0:
        return CostSource.UNAVAILABLE
    if unpriced_calls > 0:
        return CostSource.MIXED
    if getattr(llm, "input_cost_per_token", None) is not None:
        return CostSource.CONFIGURED
    return CostSource.PROVIDER


def _merge_sources(first: CostSnapshot, second: CostSnapshot) -> CostSource:
    contributing = {
        snapshot.source
        for snapshot in (first, second)
        if snapshot.priced_calls or snapshot.unpriced_calls
    }
    if not contributing:
        return CostSource.UNAVAILABLE
    if len(contributing) == 1:
        return contributing.pop()
    if contributing == {CostSource.UNAVAILABLE}:
        return CostSource.UNAVAILABLE
    return CostSource.MIXED
