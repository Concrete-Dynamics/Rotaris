"""Tests for :func:`rotaris_core.llm_threads.call_llm_detached`.

SWR-123, SWR-1612: a timed-out provider call must not delay the host.
"""

from __future__ import annotations

import asyncio
import threading
import time

import pytest

from rotaris_core.llm_threads import call_llm_detached
from rotaris_core.reqtocode import SWR, verifies


@verifies(SWR.SWR_1612)
def test_timed_out_call_does_not_delay_host_loop_shutdown() -> None:
    """A user whose provider hangs still gets their run's exit immediately.

    The host closes its loop right after the timeout fires; the abandoned
    completion must not be joined on the way out.
    """
    release = threading.Event()

    def _hang() -> str:
        release.wait(timeout=10)
        return "late answer"

    async def _main() -> None:
        with pytest.raises(TimeoutError):
            await asyncio.wait_for(call_llm_detached(_hang), timeout=0.05)

    started = time.perf_counter()
    try:
        asyncio.run(_main())
        elapsed = time.perf_counter() - started
    finally:
        release.set()

    assert elapsed < 5, f"loop shutdown waited {elapsed:.1f}s for the abandoned call"


@verifies(SWR.SWR_1612)
def test_result_and_exception_reach_the_awaiting_caller() -> None:
    """Callers see the same outcome they would get from ``asyncio.to_thread``."""

    def _ok(value: str, *, suffix: str) -> str:
        return value + suffix

    def _boom() -> str:
        raise ValueError("provider refused")

    async def _main() -> str:
        with pytest.raises(ValueError, match="provider refused"):
            await call_llm_detached(_boom)
        return await call_llm_detached(_ok, "answer", suffix="!")

    assert asyncio.run(_main()) == "answer!"
