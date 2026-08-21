from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Mapping

ThinkingLevel = Literal["low", "medium", "high", "max"]

# Mirror of openhands.sdk.llm.utils.model_features.SEND_REASONING_CONTENT_MODELS.
# Copied here to avoid importing the SDK at module scope in a leaf module.
_SEND_REASONING_CONTENT_PATTERNS: tuple[str, ...] = (
    "kimi-k2-thinking",
    "kimi-k2.5",
    "kimi-k2.6",
    "openrouter/minimax-m2",
    "deepseek/deepseek-reasoner",
    "deepseek/deepseek-v4-pro",
    "deepseek/deepseek-v4-flash",
)

_UI_LEVELS: tuple[ThinkingLevel, ...] = ("low", "medium", "high", "max")


@dataclass(frozen=True)
class ResolvedReasoningControl:
    """Normalized LiteLLM reasoning effort.

    Provider-specific translation belongs to LiteLLM. ``max`` is Rotaris/TUI
    vocabulary; LiteLLM's normalized spelling is ``xhigh``.
    """

    effort: str
    source: Literal["litellm"] = "litellm"


@traces(SWR.SWR_856, SWR.SWR_863, SWR.SWR_2096)
def resolve_reasoning_control(
    *,
    model_name: str,
    provider: str,
    level: ThinkingLevel,
) -> ResolvedReasoningControl:
    del model_name, provider
    return ResolvedReasoningControl(effort="xhigh" if level == "max" else level)


@traces(SWR.SWR_852, SWR.SWR_853, SWR.SWR_854, SWR.SWR_855, SWR.SWR_2096)
def supported_reasoning_levels(model_name: str, provider: str) -> tuple[ThinkingLevel, ...]:
    """Return normalized UI levels supported according to pinned LiteLLM metadata."""
    try:
        import litellm

        bare_model = (
            model_name.removeprefix(f"{provider}/")
            if model_name.startswith(f"{provider}/")
            else model_name
        )
        params = (
            litellm.get_supported_openai_params(
                model=bare_model,
                custom_llm_provider=provider,
            )
            or []
        )
        if "reasoning_effort" not in params:
            return ()
    except Exception:  # noqa: BLE001 - unknown/custom models have no metadata
        return ()

    info: Mapping[str, object]
    try:
        info = litellm.get_model_info(model=model_name)
    except Exception:  # noqa: BLE001 - generic provider adapters may lack model metadata
        info = {}

    levels = list(_UI_LEVELS)
    if info.get("supports_low_reasoning_effort") is False:
        levels.remove("low")
    if info.get("supports_xhigh_reasoning_effort") is False:
        levels.remove("max")
    return tuple(levels)


def model_requires_reasoning_echo(model_name: str | None) -> bool:
    """Return whether model histories must retain ``reasoning_content``."""
    if not model_name:
        return False
    normalized = model_name.strip().lower()
    return any(pattern in normalized for pattern in _SEND_REASONING_CONTENT_PATTERNS)
