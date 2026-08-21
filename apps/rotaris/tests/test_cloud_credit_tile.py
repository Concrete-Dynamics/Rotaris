"""Productive use: a Rotaris Cloud user can read their credit off the Overview.
Expected outcome: every reading the tile can hold — signed out, checking, funded,
out of credit, unreadable — says what it is and offers the action that fits it, so
the user is never left looking at a blank card guessing what it means."""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import TYPE_CHECKING

import pytest
from rotaris_core.providers.cloud_account import (
    CloudAccountStatus,
    CreditState,
    SettledUsage,
)
from rotaris_core.reqtocode import SWR, verifies

from rotaris.models.state import CloudCredit
from rotaris.services.cloud_account_bridge import format_money, to_cloud_credit
from rotaris.widgets.cloud_credit import CloudCreditCard

if TYPE_CHECKING:
    from pytestqt.qtbot import QtBot

pytestmark = pytest.mark.unit


def _card(qtbot: QtBot) -> CloudCreditCard:
    card = CloudCreditCard()
    qtbot.addWidget(card)
    return card


def _funded(**overrides: object) -> CloudCredit:
    base = {
        "phase": "ready",
        "state": "available",
        "balance_label": "$12.48",
        "last_cost_label": "last call $0.0031",
        "admission_allowed": True,
    }
    base.update(overrides)
    return CloudCredit(**base)  # type: ignore[arg-type]


@verifies(SWR.SWR_3013)
def test_a_signed_out_user_is_told_to_sign_in_rather_than_shown_zero(qtbot: QtBot) -> None:
    card = _card(qtbot)
    card.show()

    card.set_credit(CloudCredit(phase="signed_out"))

    assert card.value_label.text() == "—"
    assert card.state_tag.text() == "Not signed in"
    assert "Sign in" in card.detail_label.text()
    assert card.sign_in_button.isVisible()
    assert not card.account_button.isVisible()
    assert not card.warning_label.isVisible()


@verifies(SWR.SWR_3013)
def test_the_first_read_says_it_is_reading(qtbot: QtBot) -> None:
    card = _card(qtbot)

    card.set_credit(CloudCredit(phase="loading"))

    assert card.state_tag.text() == "Checking…"
    assert not card.refresh_button.isEnabled()


@verifies(SWR.SWR_3013)
def test_a_funded_account_shows_balance_state_and_last_call(qtbot: QtBot) -> None:
    card = _card(qtbot)

    card.set_credit(_funded())

    assert card.value_label.text() == "$12.48"
    assert card.state_tag.text() == "Funded"
    assert card.detail_label.text() == "last call $0.0031"
    assert not card.warning_label.isVisible()
    assert "12.48" in card.accessibleDescription()


@verifies(SWR.SWR_3013)
def test_an_account_that_never_billed_a_call_says_so(qtbot: QtBot) -> None:
    card = _card(qtbot)

    card.set_credit(_funded(last_cost_label=""))

    assert card.detail_label.text() == "No billed calls yet."


@verifies(SWR.SWR_3013)
def test_an_account_that_cannot_spend_warns_and_offers_the_account(qtbot: QtBot) -> None:
    card = _card(qtbot)
    card.show()

    card.set_credit(_funded(state="exhausted", balance_label="$0.00", admission_allowed=False))

    assert card.state_tag.text() == "Out of credit"
    assert card.warning_label.isVisible()
    assert card.account_button.isVisible()
    assert "cannot pay" in card.accessibleDescription()


@verifies(SWR.SWR_3013)
def test_a_failed_read_keeps_a_retry_and_the_copyable_reason(qtbot: QtBot) -> None:
    card = _card(qtbot)
    card.show()

    card.set_credit(CloudCredit(phase="error", error="Rotaris Cloud account request failed (503)"))

    assert card.state_tag.text() == "Unavailable"
    assert card.refresh_button.text() == "Retry"
    assert card.refresh_button.isEnabled()
    assert card.error_label.isVisible()
    assert "503" in card.error_label.text()


@verifies(SWR.SWR_3013)
def test_recovering_from_a_failure_clears_the_failure_display(qtbot: QtBot) -> None:
    card = _card(qtbot)
    card.show()
    card.set_credit(CloudCredit(phase="error", error="boom"))

    card.set_credit(_funded())

    assert not card.error_label.isVisible()
    assert card.refresh_button.text() == "Refresh"
    assert card.value_label.text() == "$12.48"


@verifies(SWR.SWR_3013)
def test_the_credit_state_is_readable_without_colour(qtbot: QtBot) -> None:
    """Colour alone must not carry the state — the tag text always spells it out."""
    card = _card(qtbot)

    for state, expected in (
        ("available", "Funded"),
        ("exhausted", "Out of credit"),
        ("overdrafted", "Overdrawn"),
        ("unknown", "Unknown state"),
    ):
        card.set_credit(_funded(state=state))
        assert card.state_tag.text() == expected
        assert card.state_dot.accessibleName() == f"Credit state: {expected}"


@verifies(SWR.SWR_3013)
def test_every_control_on_the_tile_announces_itself(qtbot: QtBot) -> None:
    card = _card(qtbot)

    assert card.accessibleName() == "Rotaris Cloud credit"
    assert card.sign_in_button.accessibleName() == "Sign in to Rotaris Cloud"
    assert card.account_button.accessibleName() == "Open Rotaris Cloud"
    assert card.refresh_button.accessibleName() == "Refresh Rotaris Cloud credit"


# ── the translation from an exact amount to the words above ──────────────────


def _status(
    balance: str,
    *,
    state: CreditState = CreditState.AVAILABLE,
    admission: bool = True,
    usage: SettledUsage | None = None,
    currency: str = "USD",
) -> CloudAccountStatus:
    return CloudAccountStatus(
        currency=currency,
        balance=Decimal(balance),
        state=state,
        admission_allowed=admission,
        latest_settled_usage=usage,
    )


@verifies(SWR.SWR_3013)
def test_a_balance_is_rounded_down_so_it_never_overstates_the_money() -> None:
    assert format_money(Decimal("12.489"), "USD", floor=True) == "$12.48"
    assert format_money(Decimal("-0.015"), "USD", floor=True) == "-$0.02"


@verifies(SWR.SWR_3013)
def test_a_sub_cent_cost_keeps_the_digits_that_make_it_non_zero() -> None:
    assert format_money(Decimal("0.0031"), "USD") == "$0.0031"
    assert format_money(Decimal("0"), "USD") == "$0.00"


@verifies(SWR.SWR_3013)
def test_an_unfamiliar_currency_is_named_rather_than_given_a_wrong_symbol() -> None:
    assert format_money(Decimal("9.5"), "CHF") == "9.50 CHF"


@verifies(SWR.SWR_3013)
def test_a_reading_becomes_the_state_the_views_bind_to() -> None:
    occurred = dt.datetime(2026, 8, 19, 12, 22, tzinfo=dt.UTC)
    credit = to_cloud_credit(
        _status(
            "12.48",
            usage=SettledUsage(occurred_at=occurred, status="SUCCEEDED", cost=Decimal("0.0031")),
        )
    )

    assert credit.phase == "ready"
    assert credit.state == "available"
    assert credit.balance_label == "$12.48"
    assert credit.last_cost_label == "last call $0.0031"
    assert credit.blocked is False


@verifies(SWR.SWR_3013)
def test_an_account_the_backend_will_not_admit_reads_as_blocked() -> None:
    credit = to_cloud_credit(_status("0", state=CreditState.EXHAUSTED, admission=False))

    assert credit.blocked is True
    assert credit.state_label == "Out of credit"
    assert credit.last_cost_label == ""
