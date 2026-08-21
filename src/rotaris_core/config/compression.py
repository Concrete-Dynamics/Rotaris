from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from rotaris_core.config.schema import ModelConfig, RotarisConfig


UNKNOWN_CONTEXT_CAPACITY_TOKENS = 265_000


@dataclass(frozen=True)
class CompressionThreshold:
    tokens: int
    source: str
    percentage: int
    capacity: int


@traces(SWR.SWR_1436, SWR.SWR_1437, SWR.SWR_1438)
def resolve_compression_threshold(
    config: RotarisConfig,
    model_config: ModelConfig | None,
) -> CompressionThreshold:
    """Resolve the effective compression threshold in tokens.

    Capacity selection (highest priority first):

    1. ``model_config.context_compression_threshold`` — an explicit per-model
       compression capacity cap.
    2. ``min(model_config.max_input_tokens, config.compressor.default_threshold)`` —
       the advertised context window bounded by the configured performance cap.
    3. ``config.compressor.default_threshold`` — fallback for unknown capacity.

    The threshold is always ``capacity * percentage / 100``.
    """
    percentage = config.compressor.threshold_percentage
    default_capacity = config.compressor.default_threshold or UNKNOWN_CONTEXT_CAPACITY_TOKENS
    if model_config is not None and model_config.context_compression_threshold is not None:
        capacity: int = model_config.context_compression_threshold
        source = f"global percentage ({percentage}% of context_compression_threshold={capacity})"
    elif model_config is not None and model_config.max_input_tokens is not None:
        capacity = min(model_config.max_input_tokens, default_capacity)
        source = (
            f"global percentage ({percentage}% of bounded capacity={capacity}; "
            f"max_input_tokens={model_config.max_input_tokens}, "
            f"default_threshold={default_capacity})"
        )
    else:
        capacity = default_capacity
        source = f"global percentage ({percentage}% of default_threshold={capacity})"
    tokens = int(capacity * percentage / 100)
    return CompressionThreshold(
        tokens=tokens,
        source=source,
        percentage=percentage,
        capacity=capacity,
    )
