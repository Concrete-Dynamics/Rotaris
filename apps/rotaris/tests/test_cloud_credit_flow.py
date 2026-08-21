"""Productive use: a user on Rotaris Cloud sees what their credit is doing, and is
stopped before starting a run the account cannot pay for.

Expected outcome: the balance is on the Overview and in the status bar while the app
is open; when the backend says the account is out of credit the tile says so and offers
the account page; and submitting a prompt in that state raises a confirmation naming
the balance rather than starting a run that would die on its first call.

The window, the credit bridge, the store wiring and every control are real. Only the
account read itself is faked — it is the network.
"""

from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING, Any

import pytest
from fakes import FakeRunBridge
from PySide6.QtWidgets import QDialog, QLabel, QPushButton
from rotaris_core.providers.cloud_account import (
    CloudAccountStatus,
    CloudSignInRequiredError,
    CreditState,
    SettledUsage,
)
from rotaris_core.reqtocode import SWR, verifies
from ui_query import find_by_accessible_name, settle

from rotaris.models import sample_store
from rotaris.services.cloud_account_bridge import CloudAccountBridge
from rotaris.views.main_window import MainWindow
from rotaris.widgets.cloud_credit import CloudCreditCard

if TYPE_CHECKING:
    import datetime as dt
    from pathlib import Path

    from pytestqt.qtbot import QtBot

pytestmark = pytest.mark.e2e

_WINDOW = (1440, 900)


def _occurred() -> dt.datetime:
    import datetime as dt_module

    return dt_module.datetime(2026, 8, 19, 12, 22, tzinfo=dt_module.UTC)


def _funded() -> CloudAccountStatus:
    return CloudAccountStatus(
        currency="USD",
        balance=Decimal("12.48"),
        state=CreditState.AVAILABLE,
        admission_allowed=True,
        latest_settled_usage=SettledUsage(
            occurred_at=_occurred(), status="SUCCEEDED", cost=Decimal("0.0031")
        ),
    )


def _exhausted() -> CloudAccountStatus:
    return CloudAccountStatus(
        currency="USD",
        balance=Decimal("0"),
        state=CreditState.EXHAUSTED,
        admission_allowed=False,
        latest_settled_usage=SettledUsage(
            occurred_at=_occurred(), status="INSUFFICIENT_QUOTA", cost=Decimal("0.0125")
        ),
    )


class _CloudConfigService:
    """The one question the window asks about the run's models."""

    def __init__(self, workspace: Path, *, on_cloud: bool = True) -> None:
        self.on_cloud = on_cloud
        self.workspace = workspace

    def uses_rotaris_cloud(self) -> bool:
        return self.on_cloud


def _sign_in_a_provider(window: MainWindow) -> None:
    """Put the window in the state a working user is in: a provider is authenticated.

    Showing the window kicks off a provider health check, and the stub config
    service cannot answer it, so every provider reads as disconnected. That is a
    different prerequisite from the one under test here.
    """
    for provider in window.store.providers:
        provider.connected = True
        provider.status = "healthy"


def _open(
    qtbot: QtBot,
    reader,  # noqa: ANN001 - a bare callable the test supplies
    *,
    run_bridge: Any | None = None,
    config_service: Any | None = None,
) -> MainWindow:
    window = MainWindow(
        sample_store(),
        run_bridge=run_bridge,
        config_service=config_service,
    )
    qtbot.addWidget(window)
    window.resize(*_WINDOW)
    window.show()
    qtbot.waitExposed(window)
    bridge = CloudAccountBridge(reader=reader, parent=window)
    window.start_cloud_credit(bridge)
    qtbot.waitUntil(lambda: not bridge.running, timeout=5000)
    settle(qtbot)
    return window


@verifies(SWR.SWR_3013)
def test_a_funded_account_shows_its_balance_on_overview_and_in_the_status_bar(
    qtbot: QtBot,
) -> None:
    window = _open(qtbot, _funded)
    window.show_view("dashboard")
    settle(qtbot)

    tile = find_by_accessible_name(
        window.dashboard, "Rotaris Cloud credit", CloudCreditCard, visible_only=True
    )
    balance = find_by_accessible_name(window.status_bar, "Rotaris Cloud credit", QLabel)

    assert "$12.48" in tile.accessibleDescription()
    assert "$12.48" in balance.text()
    assert balance.isVisible()
    window.close()


@verifies(SWR.SWR_3013)
def test_an_account_out_of_credit_warns_and_offers_the_account_page(qtbot: QtBot) -> None:
    opened: list[str] = []
    window = _open(qtbot, _exhausted)
    window._open_rotaris_cloud = lambda: opened.append("account")  # type: ignore[method-assign]
    window.show_view("dashboard")
    settle(qtbot)

    account_button = find_by_accessible_name(
        window.dashboard, "Open Rotaris Cloud", QPushButton, visible_only=True
    )
    account_button.click()

    assert window.dashboard.cloud_credit_card.warning_label.isVisible()
    assert window.dashboard.cloud_credit_card.state_tag.text() == "Out of credit"
    assert opened == ["account"]
    window.close()


@verifies(SWR.SWR_3013)
def test_a_signed_out_user_is_offered_sign_in_instead_of_a_balance(qtbot: QtBot) -> None:
    def reader() -> CloudAccountStatus:
        raise CloudSignInRequiredError("Not signed in to Rotaris Cloud")

    window = _open(qtbot, reader)
    window.show_view("dashboard")
    settle(qtbot)

    find_by_accessible_name(
        window.dashboard, "Sign in to Rotaris Cloud", QPushButton, visible_only=True
    )

    assert window.dashboard.cloud_credit_card.value_label.text() == "—"
    assert not window.status_bar.cloud_credit_label.isVisible()
    window.close()


@verifies(SWR.SWR_3013)
def test_starting_a_run_without_credit_asks_first_and_can_be_declined(
    qtbot: QtBot, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    run_bridge = FakeRunBridge()
    window = _open(
        qtbot,
        _exhausted,
        run_bridge=run_bridge,
        config_service=_CloudConfigService(tmp_path),
    )
    asked: list[str] = []
    opened: list[str] = []
    window._open_rotaris_cloud = lambda: opened.append("account")  # type: ignore[method-assign]
    _sign_in_a_provider(window)

    def decline(self: QDialog) -> int:
        asked.append(self.windowTitle())
        return int(QDialog.DialogCode.Rejected)

    monkeypatch.setattr("rotaris.views.main_window.ConfirmImpactDialog.exec", decline)

    window._submit_prompt("summarise the repository")

    assert asked == ["Rotaris Cloud has no credit"]
    assert run_bridge.prompts == [], "the run started despite the account being refused"
    assert opened == ["account"], "declining did not take the user to their account"
    assert window.workspace.composer.toPlainText() == "summarise the repository", (
        "the declined prompt was lost instead of preserved"
    )
    window.close()


@verifies(SWR.SWR_3013)
def test_the_user_can_start_anyway_when_they_choose_to(
    qtbot: QtBot, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    run_bridge = FakeRunBridge()
    window = _open(
        qtbot,
        _exhausted,
        run_bridge=run_bridge,
        config_service=_CloudConfigService(tmp_path),
    )
    _sign_in_a_provider(window)
    monkeypatch.setattr(
        "rotaris.views.main_window.ConfirmImpactDialog.exec",
        lambda _self: QDialog.DialogCode.Accepted,
    )

    window._submit_prompt("summarise the repository")

    assert run_bridge.prompts == ["summarise the repository"]
    window.close()


@verifies(SWR.SWR_3013)
def test_a_run_on_another_provider_is_never_gated_by_cloud_credit(
    qtbot: QtBot, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """The balance belongs to one provider; a Copilot run must not be stopped by it."""
    run_bridge = FakeRunBridge()
    window = _open(
        qtbot,
        _exhausted,
        run_bridge=run_bridge,
        config_service=_CloudConfigService(tmp_path, on_cloud=False),
    )
    asked: list[str] = []
    _sign_in_a_provider(window)

    def record(self: QDialog) -> int:
        asked.append(self.windowTitle())
        return int(QDialog.DialogCode.Rejected)

    monkeypatch.setattr("rotaris.views.main_window.ConfirmImpactDialog.exec", record)

    window._submit_prompt("summarise the repository")

    assert asked == []
    assert run_bridge.prompts == ["summarise the repository"]
    window.close()
