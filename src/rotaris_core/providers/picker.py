from __future__ import annotations

from typing import TYPE_CHECKING

from pydantic import BaseModel, ConfigDict

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Iterable, Sequence

    from rotaris_core.providers.discovery import DiscoveredModel


class PickedModels(BaseModel):
    model_config = ConfigDict(frozen=True)

    small_model: str | None = None
    medium_model: str | None = None
    large_model: str | None = None


_LARGE_PREFERRED: list[list[str]] = [
    ["gpt-5"],
    ["claude-opus", "claude-4-opus", "claude-3-opus"],
    ["gpt-4o"],
    ["deepseek-v4-pro"],
    ["claude-sonnet", "claude-3-7-sonnet", "claude-sonnet-4"],
]
_LARGE_FALLBACK: list[str] = ["deepseek-v4-pro", "opus", "gpt-4"]

_MEDIUM_PREFERRED: list[list[str]] = [
    ["gpt-5-mini"],
    ["gpt-4o-mini"],
    ["claude-haiku", "claude-3-5-haiku"],
    ["deepseek-v4-flash"],
    ["gpt-4-turbo"],
]
_MEDIUM_FALLBACK: list[str] = ["deepseek-v4-flash", "mini", "haiku", "turbo"]

_SMALL_PREFERRED: list[list[str]] = [
    ["gpt-5-nano"],
    ["gpt-4o-mini"],
    ["gpt-3.5-turbo"],
    ["claude-haiku"],
    ["deepseek-v4-flash"],
]
_SMALL_FALLBACK: list[str] = ["nano", "deepseek-v4-flash", "mini", "3.5"]


@traces(SWR.SWR_753)
def pick_default_models(models: list[DiscoveredModel]) -> PickedModels:
    if not models:
        return PickedModels()

    large_model = _pick_for_tier(
        models,
        _LARGE_PREFERRED,
        _LARGE_FALLBACK,
        blocked_ids=(),
        forbidden_patterns=("mini", "nano"),
        forbidden_groups=(0, 2),
    )
    medium_model = _pick_for_tier(
        models,
        _MEDIUM_PREFERRED,
        _MEDIUM_FALLBACK,
        blocked_ids=(large_model,) if large_model is not None else (),
        forbidden_patterns=("3.5",),
    )
    small_model = _pick_for_tier(
        models,
        _SMALL_PREFERRED,
        _SMALL_FALLBACK,
        blocked_ids=tuple(value for value in (large_model, medium_model) if value is not None),
    )

    return PickedModels(
        small_model=small_model,
        medium_model=medium_model,
        large_model=large_model,
    )


def _pick_for_tier(
    models: Sequence[DiscoveredModel],
    preferred_groups: Sequence[Sequence[str]],
    fallback_patterns: Sequence[str],
    *,
    blocked_ids: Iterable[str],
    forbidden_patterns: Sequence[str] = (),
    forbidden_groups: Sequence[int] = (),
) -> str | None:
    blocked = set(blocked_ids)
    for index, group in enumerate(preferred_groups):
        group_forbidden = forbidden_patterns if index in forbidden_groups else ()
        picked = _first_match(models, group, blocked, forbidden_patterns=group_forbidden)
        if picked is not None:
            return picked
    return _first_match(models, fallback_patterns, blocked, forbidden_patterns=forbidden_patterns)


def _first_match(
    models: Sequence[DiscoveredModel],
    patterns: Sequence[str],
    blocked_ids: set[str],
    *,
    forbidden_patterns: Sequence[str] = (),
) -> str | None:
    for model in models:
        model_id = model.id
        qualified_id = model.qualified_id
        if model_id in blocked_ids or qualified_id in blocked_ids:
            continue
        normalized_id = model_id.lower()
        if forbidden_patterns and any(pattern in normalized_id for pattern in forbidden_patterns):
            continue
        if any(pattern in normalized_id for pattern in patterns):
            return qualified_id
    return None
