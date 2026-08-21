"""Rotaris Cloud credit, read off the UI thread (SWR-3013).

Same shape as :mod:`rotaris.services.update_bridge`: a ``QObject`` that owns a
``QThread``, does every blocking thing on it, and reports back with a signal.
The balance is money the user is spending while they watch, so it is read on a
timer — and a timer that froze the window every two minutes would be worse than
no balance at all.

The reading itself lives in :mod:`rotaris_core.providers.cloud_account`. What is
here is the thread, the schedule, and the one translation from an exact amount to
the words a tile shows.
"""

from __future__ import annotations

from decimal import ROUND_FLOOR, ROUND_HALF_UP, Decimal
from typing import TYPE_CHECKING

from PySide6.QtCore import QObject, QThread, QTimer, Signal, Slot
from rotaris_core.providers.cloud_account import (
    CloudAccountError,
    CloudAccountStatus,
    CloudSignInRequiredError,
    load_cloud_account_status,
)
from rotaris_core.reqtocode import SWR, traces

from rotaris.models.state import CloudCredit

if TYPE_CHECKING:
    from collections.abc import Callable

#: How often an open window re-reads the balance. Long enough not to matter to
#: the backend, short enough that a spending run is not read as funded for long.
DEFAULT_POLL_INTERVAL_MS = 120_000

_CURRENCY_SYMBOLS = {"USD": "$", "EUR": "€", "GBP": "£"}


@traces(SWR.SWR_3013)
def format_money(amount: Decimal, currency: str, *, floor: bool = False) -> str:
    """Render an exact amount as the words a user reads.

    ``floor`` rounds towards negative infinity, which is what a balance wants:
    a balance rounded up tells the user they have money they cannot spend.
    """
    rounding = ROUND_FLOOR if floor else ROUND_HALF_UP
    places = Decimal("0.01") if abs(amount) >= Decimal("0.01") or amount == 0 else Decimal("0.0001")
    quantized = amount.quantize(places, rounding=rounding)
    symbol = _CURRENCY_SYMBOLS.get(currency, "")
    if symbol:
        sign = "-" if quantized < 0 else ""
        return f"{sign}{symbol}{abs(quantized):,f}"
    return f"{quantized:,f} {currency}"


@traces(SWR.SWR_3013)
def to_cloud_credit(status: CloudAccountStatus) -> CloudCredit:
    """Translate a backend reading into the state the views bind to."""
    usage = status.latest_settled_usage
    last_cost = (
        f"last call {format_money(usage.cost, status.currency)}" if usage is not None else ""
    )
    return CloudCredit(
        phase="ready",
        state=str(status.state),
        balance_label=format_money(status.balance, status.currency, floor=True),
        last_cost_label=last_cost,
        admission_allowed=status.admission_allowed,
    )


class _ReadWorker(QObject):
    """One blocking read, and whichever of the three answers it produced."""

    finished = Signal()
    read = Signal(object)

    def __init__(self, reader: Callable[[], CloudAccountStatus]) -> None:
        super().__init__()
        self._reader = reader

    @Slot()
    def run(self) -> None:
        try:
            credit = to_cloud_credit(self._reader())
        except CloudSignInRequiredError:
            credit = CloudCredit(phase="signed_out")
        except CloudAccountError as exc:
            credit = CloudCredit(phase="error", error=str(exc))
        except Exception as exc:  # noqa: BLE001 - a balance must never crash the window
            credit = CloudCredit(phase="error", error=f"{type(exc).__name__}: {exc}")
        self.read.emit(credit)
        self.finished.emit()


@traces(SWR.SWR_3013)
class CloudAccountBridge(QObject):
    """Reads Rotaris Cloud credit on a schedule and on demand.

    Constructed with a ``reader`` so a test can drive the real signalling against
    a recorded account without a network.
    """

    #: A :class:`~rotaris.models.state.CloudCredit` — including the signed-out and
    #: failed readings, which are displays in their own right, not silences.
    credit = Signal(object)

    def __init__(
        self,
        *,
        reader: Callable[[], CloudAccountStatus] | None = None,
        interval_ms: int = DEFAULT_POLL_INTERVAL_MS,
        parent: QObject | None = None,
    ) -> None:
        super().__init__(parent)
        self._reader = reader if reader is not None else load_cloud_account_status
        self._thread: QThread | None = None
        self._worker: _ReadWorker | None = None
        self._last = CloudCredit()
        self._timer = QTimer(self)
        self._timer.setInterval(interval_ms)
        self._timer.timeout.connect(self.refresh)

    @property
    def running(self) -> bool:
        return self._thread is not None and self._thread.isRunning()

    @traces(SWR.SWR_3013)
    def start(self) -> None:
        """Read now, then keep re-reading while the window is open."""
        self._timer.start()
        self.refresh()

    def stop(self) -> None:
        """Stop polling and wait out an in-flight read, at shutdown."""
        self._timer.stop()
        thread = self._thread
        if thread is not None and thread.isRunning():
            thread.quit()
            thread.wait(5000)

    @traces(SWR.SWR_3013)
    def refresh(self) -> bool:
        """Read the balance once. Returns False when a read is already in flight."""
        if self.running:
            return False
        # Only the first read blanks the tile; a poll must not flicker a balance
        # the user is looking at back to "Checking…".
        if self._last.phase != "ready":
            self._emit(CloudCredit(phase="loading"))
        worker = _ReadWorker(self._reader)
        worker.read.connect(self._emit)
        thread = QThread(self)
        worker.moveToThread(thread)
        thread.started.connect(worker.run)
        worker.finished.connect(thread.quit)
        # Both are held until the next read replaces them, and neither is deleted
        # from inside its own ``finished`` handler: a QThread freed while Qt still
        # holds it takes the process with it, and this one runs every two minutes.
        self._thread = thread
        self._worker = worker
        thread.start()
        return True

    @Slot(object)
    def _emit(self, credit: CloudCredit) -> None:
        self._last = credit
        self.credit.emit(credit)
