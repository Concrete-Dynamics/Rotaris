"""Await blocking LLM calls without letting them outlive their timeout.

Timeout-guarded meta-calls (completion classification, compression, circuit
breaker probes, post-run improvement analysis) all promise the same thing: a
slow provider must never delay the run they annotate (SWR-123, SWR-1612).

``asyncio.wait_for`` alone cannot keep that promise around
``asyncio.to_thread``: cancelling the awaiting coroutine leaves the blocking
call parked in the loop's *default* executor, and ``asyncio.run`` joins that
executor while closing the loop. A provider retrying with backoff for minutes
therefore froze the host long after its timeout had already returned a
fallback. Running the call on a daemon thread lets the host abandon it.
"""

from __future__ import annotations

import asyncio
import logging
import threading
from typing import TYPE_CHECKING, Any

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Callable

_log = logging.getLogger(__name__)


@traces(SWR.SWR_123, SWR.SWR_1612)
async def call_llm_detached[T](func: Callable[..., T], /, *args: Any, **kwargs: Any) -> T:
    """Run ``func`` on a daemon thread and await its result.

    Behaves like ``asyncio.to_thread`` for the caller, except an abandoned call
    (timeout, cancellation) never blocks loop shutdown or interpreter exit.
    """
    loop = asyncio.get_running_loop()
    future: asyncio.Future[T] = loop.create_future()

    def _settle(apply: Callable[[], None]) -> None:
        if not future.done():
            apply()

    def _relay(apply: Callable[[], None]) -> None:
        try:
            loop.call_soon_threadsafe(_settle, apply)
        except RuntimeError:
            # The host already closed the loop; nobody is waiting anymore.
            _log.debug("Detached call to %r finished after loop close.", func)

    def _work() -> None:
        try:
            result = func(*args, **kwargs)
        except BaseException as exc:  # noqa: BLE001 — relayed to the awaiter.
            # Rebound: ``exc`` is cleared when the except block ends, but the
            # relay runs later on the loop thread.
            error = exc
            _relay(lambda: future.set_exception(error))
        else:
            _relay(lambda: future.set_result(result))

    threading.Thread(
        target=_work,
        name=f"detached-llm-{getattr(func, '__name__', 'call')}",
        daemon=True,
    ).start()
    return await future
