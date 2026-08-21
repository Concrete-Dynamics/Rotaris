"""Stall watchdog for the Scheduler.

Extracted from ``scheduler.py``: the ``_run_with_stall_watchdog`` coroutine
that monitors LLM responsiveness during conversation execution.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from typing import TYPE_CHECKING, Any

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Callable

    from rotaris_core.config.schema import RotarisConfig
    from rotaris_core.orchestrator.child_state import ChildTaskRecord
    from rotaris_core.orchestrator.scheduler_diagnostics import SchedulerDiagnosticsProxy

    StallCallback = Callable[[ChildTaskRecord, float, str], None]
    SteeringInjector = Callable[..., bool]

_log = logging.getLogger(__name__)


@traces(SWR.SWR_132)
async def run_with_stall_watchdog(
    conversation: Any,
    record: ChildTaskRecord,
    last_activity: list[float],
    *,
    config: RotarisConfig,
    diag: SchedulerDiagnosticsProxy,
    stall_callback: StallCallback | None = None,
    inject_steering: SteeringInjector | None = None,
    stall_timeout_override: int | None = None,
    on_steering_injected: Any | None = None,
    active_tool_call_ids: set[str] | None = None,
    recent_tool_calls: list[dict[str, str]] | None = None,
    last_llm_event_type: str | None = None,
) -> None:
    """Run ``conversation.run`` off-thread while a watchdog logs stalls.

    The watchdog inspects ``last_activity[0]`` every ``stall_timeout`` seconds
    (or 10s, whichever is smaller). If no event/token has updated the timestamp
    within ``stall_timeout`` seconds, a WARN is emitted naming the child. The
    watchdog never cancels the run — it only surfaces visibility. The hard
    kill is still enforced by the surrounding ``asyncio.wait_for`` using
    ``runtime.child_timeout``.
    """
    configured = (
        stall_timeout_override
        if stall_timeout_override is not None
        else config.runtime.child_stall_timeout
    )
    stall_timeout = max(1, int(configured))
    # Tick every 5s (or stall_timeout/6, whichever is smaller, but never
    # below 1s) so the TUI badge / heartbeat log line refresh frequently
    # while waiting on a slow LLM.
    poll_interval = max(1.0, min(stall_timeout / 6.0, 5.0))
    # Re-emit the WARN log no more than every ``warn_log_interval`` seconds
    # of continuous stall, but always notify the stall_callback every poll
    # so the TUI can update its "Waiting on LLM (Ns)…" countdown live.
    warn_log_interval = max(stall_timeout, 30.0)

    run_task = asyncio.create_task(asyncio.to_thread(conversation.run))

    async def _watchdog() -> None:
        warned = False
        last_warn_log = 0.0
        try:
            while not run_task.done():
                await asyncio.sleep(poll_interval)
                if inject_steering is not None and inject_steering(
                    conversation,
                    record,
                    on_injected=on_steering_injected,
                ):
                    last_activity[0] = time.monotonic()
                elapsed = time.monotonic() - last_activity[0]
                if elapsed >= stall_timeout:
                    active_tools = len(active_tool_call_ids or ())
                    if active_tools:
                        if last_warn_log == 0.0 or (elapsed - last_warn_log) >= warn_log_interval:
                            _log.info(
                                "Child %s waiting on %d active tool call(s) for %.0fs "
                                "(child_timeout=%ds). Continuing to wait.",
                                record.canonical_name,
                                active_tools,
                                elapsed,
                                config.runtime.child_timeout,
                            )
                            last_warn_log = elapsed
                        continue
                    # Log a warning on entry to the stall, and at most once
                    # per ``warn_log_interval`` while it persists, so a
                    # multi-minute hang leaves a heartbeat trail in run.log.
                    if not warned or (elapsed - last_warn_log) >= warn_log_interval:
                        _log.warning(
                            "Child %s appears STALLED: no LLM event or "
                            "token for %.0fs (stall_timeout=%ds, "
                            "child_timeout=%ds). Continuing to wait.",
                            record.canonical_name,
                            elapsed,
                            stall_timeout,
                            config.runtime.child_timeout,
                        )
                        diag.issue(
                            kind="stall",
                            severity="warning",
                            actor=record.canonical_name,
                            message=f"No LLM event or token for {elapsed:.0f}s",
                            metadata={
                                "stall_timeout_s": stall_timeout,
                                "child_timeout_s": config.runtime.child_timeout,
                                "active_tools": list(active_tool_call_ids or ()),
                                "recent_tool_calls": list(recent_tool_calls or ()),
                                "last_llm_event_type": last_llm_event_type,
                            },
                        )
                        last_warn_log = elapsed
                    warned = True
                    # Always notify the UI callback so the badge ticks.
                    if stall_callback is not None:
                        try:
                            stall_callback(record, elapsed, "stalled")
                        except Exception:  # noqa: BLE001
                            _log.exception(
                                "Stall callback failed for child %s",
                                record.canonical_name,
                            )
                elif warned:
                    _log.info(
                        "Child %s recovered from stall after %.0fs",
                        record.canonical_name,
                        elapsed,
                    )
                    warned = False
                    last_warn_log = 0.0
                    if stall_callback is not None:
                        try:
                            stall_callback(record, elapsed, "recovered")
                        except Exception:  # noqa: BLE001
                            _log.exception(
                                "Stall callback failed for child %s",
                                record.canonical_name,
                            )
        except asyncio.CancelledError:
            pass

    watchdog_task = asyncio.create_task(_watchdog())
    try:
        await run_task
    finally:
        watchdog_task.cancel()
        with contextlib.suppress(asyncio.CancelledError, Exception):
            await watchdog_task
