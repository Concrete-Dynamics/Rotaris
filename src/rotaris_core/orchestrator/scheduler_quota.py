"""Quota and rate-limit retry helpers for the Scheduler."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from rotaris_core.llm_errors import extract_retry_after_seconds
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from openhands.sdk import Agent

    from rotaris_core.config.schema import RotarisConfig
    from rotaris_core.orchestrator.child_state import ChildTaskRecord


QUOTA_WAIT_BASE_SECONDS = 60
QUOTA_WAIT_MAX_SECONDS = 300


@dataclass(frozen=True, slots=True)
class QuotaWaitDecision:
    action: str
    model_override: str | None = None


@traces(SWR.SWR_904, SWR.SWR_905)
def quota_wait_seconds(exc: Exception, *, attempt: int) -> int:
    retry_after = extract_retry_after_seconds(exc)
    if retry_after is not None:
        return int(max(1, retry_after))
    exponent = int(max(0, attempt - 1))
    local_backoff = int(QUOTA_WAIT_BASE_SECONDS * (2**exponent))
    return int(min(QUOTA_WAIT_MAX_SECONDS, local_backoff))


@traces(SWR.SWR_902)
def same_tier_fallback_models(config: RotarisConfig, current_model: str) -> list[str]:
    tier_name: str | None = None
    for candidate_tier in ("small_model", "medium_model", "large_model"):
        if getattr(config, candidate_tier, None) == current_model:
            tier_name = candidate_tier
            break

    if tier_name is None:
        from rotaris_core.config.project_snapshot import read_snapshot

        try:
            snapshot = read_snapshot()
        except ValueError:
            snapshot = None
        if snapshot is not None:
            for provider in snapshot.providers.values():
                if getattr(provider, "small_model", None) == current_model:
                    tier_name = "small_model"
                    break
                if getattr(provider, "medium_model", None) == current_model:
                    tier_name = "medium_model"
                    break
                if getattr(provider, "large_model", None) == current_model:
                    tier_name = "large_model"
                    break

    if tier_name is None:
        return []

    candidates: list[str] = []
    seen: set[str] = {current_model}
    configured_model = getattr(config, tier_name, None)
    if isinstance(configured_model, str) and configured_model not in seen:
        seen.add(configured_model)
        candidates.append(configured_model)

    from rotaris_core.config.project_snapshot import read_snapshot

    try:
        snapshot = read_snapshot()
    except ValueError:
        snapshot = None
    if snapshot is None:
        return candidates

    for provider in snapshot.providers.values():
        candidate_model = getattr(provider, tier_name, None)
        if not isinstance(candidate_model, str) or candidate_model in seen:
            continue
        seen.add(candidate_model)
        candidates.append(candidate_model)
    return candidates


async def build_model_override_agent(
    agent_factory: Any | None,
    record: ChildTaskRecord,
    *,
    model_override: str,
) -> Agent | None:
    if agent_factory is None:
        return None
    try:
        return await asyncio.to_thread(
            agent_factory,
            record.persona,
            None,
            model_override,
        )
    except TypeError:
        return None


async def await_quota_wait_decision(
    waiters: dict[str, asyncio.Future[QuotaWaitDecision]],
    *,
    actor: str,
    wait_seconds: int,
    allow_auto_resume: bool,
) -> QuotaWaitDecision:
    loop = asyncio.get_running_loop()
    waiter: asyncio.Future[QuotaWaitDecision] = loop.create_future()
    waiters[actor] = waiter
    try:
        if not allow_auto_resume:
            return await waiter
        try:
            return await asyncio.wait_for(waiter, timeout=max(0, wait_seconds))
        except TimeoutError:
            return QuotaWaitDecision(action="retry")
    finally:
        if waiters.get(actor) is waiter:
            waiters.pop(actor, None)
