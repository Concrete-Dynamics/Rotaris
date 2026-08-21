from __future__ import annotations

import logging
import os
import signal
from typing import TYPE_CHECKING, cast

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Callable
    from types import FrameType
    from typing import Any

_log = logging.getLogger(__name__)


@traces(SWR.SWR_1301, SWR.SWR_1302, SWR.SWR_1303, SWR.SWR_1304, SWR.SWR_1314)
class DoubleCtrlCHandler:
    """Turn SIGINT into graceful-stop then force-exit behavior."""

    def __init__(
        self,
        *,
        on_first_interrupt: Callable[[], None] | None = None,
        on_second_interrupt: Callable[[], None] | None = None,
        emit: Callable[[str], None] | None = None,
        force_exit: Callable[[int], None] | None = None,
    ) -> None:
        self._on_first_interrupt = on_first_interrupt
        self._on_second_interrupt = on_second_interrupt
        self._emit = emit
        self._force_exit = force_exit or os._exit
        self._previous_handler: Callable[[int, FrameType | None], Any] | signal.Handlers | None = (
            None
        )
        self._interrupt_count = 0

    @property
    def interrupt_count(self) -> int:
        return self._interrupt_count

    @property
    def was_interrupted(self) -> bool:
        return self._interrupt_count > 0

    def install(self) -> None:
        self._previous_handler = cast("signal.Handlers", signal.getsignal(signal.SIGINT))
        signal.signal(signal.SIGINT, self._handle_sigint)

    def set_callbacks(
        self,
        *,
        on_first_interrupt: Callable[[], None] | None = None,
        on_second_interrupt: Callable[[], None] | None = None,
    ) -> None:
        self._on_first_interrupt = on_first_interrupt
        self._on_second_interrupt = on_second_interrupt

    def restore(self) -> None:
        if self._previous_handler is None:
            return
        signal.signal(signal.SIGINT, self._previous_handler)
        self._previous_handler = None

    def _handle_sigint(self, signum: int, frame: FrameType | None) -> None:
        del signum, frame
        self._interrupt_count += 1

        if self._interrupt_count == 1:
            self._emit_message(
                "\nInterrupt received. Stopping all agents. "
                "Press Ctrl+C again to force exit immediately.\n",
            )
            self._invoke_callback(self._on_first_interrupt, "first")
            return

        self._emit_message("\nSecond interrupt received. Force exiting now.\n")
        self._invoke_callback(self._on_second_interrupt, "second")
        self.restore()
        self._force_exit(130)

    def _emit_message(self, message: str) -> None:
        if self._emit is None:
            return
        try:
            self._emit(message)
        except Exception:  # noqa: BLE001
            _log.exception("Failed to emit SIGINT status message")

    def _invoke_callback(
        self,
        callback: Callable[[], None] | None,
        phase: str,
    ) -> None:
        if callback is None:
            return
        try:
            callback()
        except Exception:  # noqa: BLE001
            _log.exception("SIGINT %s-interrupt callback failed", phase)
