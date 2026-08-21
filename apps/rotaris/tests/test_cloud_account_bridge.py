"""Productive use: the balance keeps itself current while the user works.
Expected outcome: a reading taken on a worker thread reaches the store and the views
bound to it, a failed or signed-out reading is published as such rather than dropped,
and neither one blocks the window it appears in."""

from __future__ import annotations

import threading
from collections.abc import Callable, Iterator
from decimal import Decimal
from typing import TYPE_CHECKING

import pytest
from rotaris_core.providers.cloud_account import (
    CloudAccountError,
    CloudAccountStatus,
    CloudSignInRequiredError,
    CreditState,
)
from rotaris_core.reqtocode import SWR, verifies

from rotaris.models.store import WorkspaceStore
from rotaris.services.cloud_account_bridge import CloudAccountBridge

if TYPE_CHECKING:
    from pytestqt.qtbot import QtBot

pytestmark = pytest.mark.integration

Reader = Callable[[], CloudAccountStatus]
BridgeFactory = Callable[[Reader], tuple[CloudAccountBridge, WorkspaceStore]]


def _status(balance: str = "12.48", *, admission: bool = True) -> CloudAccountStatus:
    return CloudAccountStatus(
        currency="USD",
        balance=Decimal(balance),
        state=CreditState.AVAILABLE if admission else CreditState.EXHAUSTED,
        admission_allowed=admission,
        latest_settled_usage=None,
    )


@pytest.fixture
def make_bridge(qtbot: QtBot) -> Iterator[BridgeFactory]:
    """Build wired bridge/store pairs, and tear their threads down afterwards.

    The teardown is the point: a QThread still registered with Qt when Python
    frees the bridge crashes the interpreter in whichever later test happens to
    be spinning an event loop.
    """
    built: list[tuple[CloudAccountBridge, WorkspaceStore]] = []

    def factory(reader: Reader) -> tuple[CloudAccountBridge, WorkspaceStore]:
        store = WorkspaceStore()
        bridge = CloudAccountBridge(reader=reader)
        # The real wiring, not a spy: MainWindow.start_cloud_credit connects
        # exactly this, so a signal that stopped reaching the store fails here.
        bridge.credit.connect(store.set_cloud_credit)
        built.append((bridge, store))
        return bridge, store

    yield factory

    for bridge, _store in built:
        bridge.stop()
    qtbot.wait(20)


def _read(qtbot: QtBot, bridge: CloudAccountBridge) -> None:
    """Drive one read to completion, worker thread included."""
    bridge.refresh()
    qtbot.waitUntil(lambda: not bridge.running, timeout=5000)


@verifies(SWR.SWR_3013)
def test_a_reading_reaches_the_store_and_announces_itself(
    qtbot: QtBot, make_bridge: BridgeFactory
) -> None:
    bridge, store = make_bridge(lambda: _status())
    seen: list[str] = []
    store.cloud_credit_changed.connect(lambda: seen.append(store.cloud_credit.phase))

    _read(qtbot, bridge)

    assert store.cloud_credit.phase == "ready"
    assert store.cloud_credit.balance_label == "$12.48"
    assert seen, "the store never announced the new reading"


@verifies(SWR.SWR_3013)
def test_the_first_read_says_it_is_reading_before_it_answers(
    qtbot: QtBot, make_bridge: BridgeFactory
) -> None:
    bridge, store = make_bridge(lambda: _status())
    phases: list[str] = []
    store.cloud_credit_changed.connect(lambda: phases.append(store.cloud_credit.phase))

    _read(qtbot, bridge)

    assert phases[0] == "loading"
    assert phases[-1] == "ready"


@verifies(SWR.SWR_3013)
def test_a_poll_does_not_flicker_a_known_balance_back_to_checking(
    qtbot: QtBot, make_bridge: BridgeFactory
) -> None:
    bridge, store = make_bridge(lambda: _status())
    _read(qtbot, bridge)
    phases: list[str] = []
    store.cloud_credit_changed.connect(lambda: phases.append(store.cloud_credit.phase))

    _read(qtbot, bridge)

    assert "loading" not in phases


@verifies(SWR.SWR_3013)
def test_a_signed_out_account_is_published_rather_than_dropped(
    qtbot: QtBot, make_bridge: BridgeFactory
) -> None:
    def reader() -> CloudAccountStatus:
        raise CloudSignInRequiredError("Not signed in to Rotaris Cloud")

    bridge, store = make_bridge(reader)

    _read(qtbot, bridge)

    assert store.cloud_credit.phase == "signed_out"


@verifies(SWR.SWR_3013)
def test_a_failed_read_carries_its_reason_to_the_store(
    qtbot: QtBot, make_bridge: BridgeFactory
) -> None:
    def reader() -> CloudAccountStatus:
        raise CloudAccountError("Rotaris Cloud account request failed (503)")

    bridge, store = make_bridge(reader)

    _read(qtbot, bridge)

    assert store.cloud_credit.phase == "error"
    assert "503" in store.cloud_credit.error


@verifies(SWR.SWR_3013)
def test_an_unexpected_failure_cannot_take_the_window_with_it(
    qtbot: QtBot, make_bridge: BridgeFactory
) -> None:
    def reader() -> CloudAccountStatus:
        raise RuntimeError("something nobody predicted")

    bridge, store = make_bridge(reader)

    _read(qtbot, bridge)

    assert store.cloud_credit.phase == "error"
    assert "something nobody predicted" in store.cloud_credit.error


@verifies(SWR.SWR_3013)
def test_an_account_that_cannot_spend_reaches_the_store_as_blocked(
    qtbot: QtBot, make_bridge: BridgeFactory
) -> None:
    bridge, store = make_bridge(lambda: _status("0", admission=False))

    _read(qtbot, bridge)

    assert store.cloud_credit.blocked is True
    assert store.cloud_credit.state_label == "Out of credit"


@verifies(SWR.SWR_3013)
def test_starting_reads_once_and_stopping_ends_the_polling(
    qtbot: QtBot, make_bridge: BridgeFactory
) -> None:
    reads: list[int] = []

    def reader() -> CloudAccountStatus:
        reads.append(1)
        return _status()

    bridge, _store = make_bridge(reader)
    bridge.start()
    qtbot.waitUntil(lambda: not bridge.running, timeout=5000)

    bridge.stop()

    assert reads, "start() never read once"
    assert not bridge.running


@verifies(SWR.SWR_3013)
def test_a_second_read_is_refused_while_one_is_in_flight(
    qtbot: QtBot, make_bridge: BridgeFactory
) -> None:
    """A poll landing on a slow read must not stack a second thread on it."""
    release = threading.Event()

    def reader() -> CloudAccountStatus:
        release.wait(timeout=5)
        return _status()

    bridge, _store = make_bridge(reader)
    assert bridge.refresh() is True
    qtbot.waitUntil(lambda: bridge.running, timeout=5000)

    assert bridge.refresh() is False

    release.set()
    qtbot.waitUntil(lambda: not bridge.running, timeout=5000)
