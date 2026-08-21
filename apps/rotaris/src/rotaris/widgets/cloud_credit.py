"""The Overview tile that shows what is left in a Rotaris Cloud account (SWR-3013).

A prepaid balance has no denominator, so this is deliberately not a meter: there
is no "percent of credit used" to fill a bar with. It is an amount, the state the
backend puts the account in, and what the last billed call cost.

Every reading a user can land in has a display here — signed out, first read in
flight, funded, unable to spend, and unreadable — because a blank card on the
Overview is indistinguishable from a balance of nothing.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import QHBoxLayout, QLabel, QWidget
from rotaris_core.reqtocode import SWR, traces

from rotaris.theme import tokens
from rotaris.widgets.cards import KpiCard, Tag, make_button
from rotaris.widgets.meters import StatusDot

if TYPE_CHECKING:
    from rotaris.models.state import CloudCredit
    from rotaris.theme.color import Color
    from rotaris.theme.spec import Theme

#: The tag shape each state wears. Shape, not colour: SWR-3013 asks the credit
#: state to survive being read without hue, and the tag's outline is the channel
#: that does it once the label is read out and the colour is gone.
_STATE_TAG_KIND = {
    "available": "accent",
    "exhausted": "outline",
    "overdrafted": "outline",
    "unknown": "neutral",
}

CARD_TITLE = "Rotaris Cloud credit"


@traces(SWR.SWR_3013)
class CloudCreditCard(KpiCard):
    """Rotaris Cloud's balance, its credit state, and the last call's cost."""

    sign_in_requested = Signal()
    account_open_requested = Signal()
    refresh_requested = Signal()

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(CARD_TITLE, parent)
        self.setAccessibleName(CARD_TITLE)

        t = tokens()
        state_row = QHBoxLayout()
        state_row.setSpacing(t.space[0.75])
        self.state_dot = StatusDot(t.color.idle)
        state_row.addWidget(self.state_dot, 0, Qt.AlignmentFlag.AlignVCenter)
        self.state_tag = Tag("", "neutral")
        state_row.addWidget(self.state_tag)
        state_row.addStretch(1)
        self.body.addLayout(state_row)

        self.detail_label = QLabel("")
        self.detail_label.setObjectName("muted")
        self.detail_label.setWordWrap(True)
        self.body.addWidget(self.detail_label)

        self.warning_label = QLabel("")
        self.warning_label.setWordWrap(True)
        self.warning_label.hide()
        self.body.addWidget(self.warning_label)

        self.error_label = QLabel("")
        self.error_label.setObjectName("dim")
        self.error_label.setWordWrap(True)
        self.error_label.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        self.error_label.hide()
        self.body.addWidget(self.error_label)

        actions = QHBoxLayout()
        actions.setSpacing(t.space[0.75])
        self.sign_in_button = make_button("Sign in", "primary")
        self.sign_in_button.setAccessibleName("Sign in to Rotaris Cloud")
        self.sign_in_button.clicked.connect(self.sign_in_requested)
        actions.addWidget(self.sign_in_button)
        self.account_button = make_button("Open Rotaris Cloud", "primary")
        self.account_button.setAccessibleName("Open Rotaris Cloud")
        self.account_button.clicked.connect(self.account_open_requested)
        actions.addWidget(self.account_button)
        self.refresh_button = make_button("Refresh", "ghost")
        self.refresh_button.setAccessibleName("Refresh Rotaris Cloud credit")
        self.refresh_button.clicked.connect(self.refresh_requested)
        actions.addWidget(self.refresh_button)
        actions.addStretch(1)
        self.body.addLayout(actions)

        self._state = ""
        self._dot = "unknown"
        self._render_signed_out()
        # `Card.__init__` installed the theme hook before any of the above
        # existed, so the first `apply_theme` ran against nothing.
        self.apply_theme(tokens())

    def apply_theme(self, theme: Theme) -> None:
        super().apply_theme(theme)
        if not hasattr(self, "warning_label"):
            return
        self.warning_label.setStyleSheet(f"color:{theme.color.wait_text};")
        self.state_dot.set_state(self._dot_color())

    @traces(SWR.SWR_3013)
    def set_credit(self, credit: CloudCredit) -> None:
        """Show ``credit``, whichever of the five readings it is."""
        self.warning_label.hide()
        self.error_label.hide()
        if credit.phase == "ready":
            self._render_ready(credit)
        elif credit.phase == "loading":
            self._render_loading()
        elif credit.phase == "error":
            self._render_error(credit)
        else:
            self._render_signed_out()

    # ── the five readings ────────────────────────────────────────────────

    def _render_signed_out(self) -> None:
        self.set_value("—", "")
        self._set_state("", "Not signed in", "neutral", "unknown")
        self.detail_label.setText("Sign in to Rotaris Cloud to see your credit.")
        self._show_actions(sign_in=True, account=False, refresh=False)
        self.setAccessibleDescription("Not signed in to Rotaris Cloud.")

    def _render_loading(self) -> None:
        self.set_value("…", "")
        self._set_state("", "Checking…", "neutral", "unknown")
        self.detail_label.setText("Reading your Rotaris Cloud balance.")
        self._show_actions(sign_in=False, account=False, refresh=True)
        self.refresh_button.setEnabled(False)
        self.setAccessibleDescription("Reading the Rotaris Cloud balance.")

    def _render_ready(self, credit: CloudCredit) -> None:
        self.set_value(credit.balance_label, "left")
        self._set_state(
            credit.state,
            credit.state_label,
            _STATE_TAG_KIND.get(credit.state, "neutral"),
            credit.state,
        )
        self.detail_label.setText(credit.last_cost_label or "No billed calls yet.")
        blocked = credit.blocked
        if blocked:
            self.warning_label.setText(
                "! This account cannot pay for the next call. Runs on Rotaris Cloud "
                "models will fail until it is topped up."
            )
            self.warning_label.show()
        self._show_actions(sign_in=False, account=blocked, refresh=True)
        description = f"{credit.state_label}. Balance {credit.balance_label}."
        if credit.last_cost_label:
            description = f"{description} {credit.last_cost_label}."
        if blocked:
            description = f"{description} The account cannot pay for the next call."
        self.setAccessibleDescription(description)

    def _render_error(self, credit: CloudCredit) -> None:
        self.set_value("—", "")
        self._set_state("", "Unavailable", "neutral", "unknown")
        self.detail_label.setText("Rotaris Cloud credit could not be read.")
        self.error_label.setText(credit.error)
        self.error_label.setVisible(bool(credit.error))
        self._show_actions(sign_in=False, account=False, refresh=True)
        self.refresh_button.setText("Retry")
        self.refresh_button.setAccessibleName("Retry reading Rotaris Cloud credit")
        self.setAccessibleDescription(f"Rotaris Cloud credit could not be read. {credit.error}")

    # ── helpers ──────────────────────────────────────────────────────────

    def _set_state(self, state: str, label: str, kind: str, dot: str) -> None:
        """Show *label* as the credit state, with *dot* naming the colour it takes.

        *dot* is the state's name rather than its colour so that a theme switch
        can resolve it again; a colour passed in here would be the one the theme
        the card was built under happened to have (SWR-3706).
        """
        self.state_tag.setText(label)
        self.state_tag.setAccessibleName(f"Credit state: {label}")
        self.state_tag.set_kind(kind)
        self._dot = dot
        self.state_dot.set_state(self._dot_color())
        self.state_dot.setAccessibleName(f"Credit state: {label}")
        self.state_dot.setToolTip(label)
        self._state = state

    def _dot_color(self) -> Color:
        """The dot's colour for the state on screen.

        The graphical form of each token, not the text form: the dot never
        carries the meaning on its own — the tag beside it always spells the
        state out in words (SWR-3013) — so it owes the 3:1 a shape owes rather
        than the 4.5:1 a label does.
        """
        t = tokens()
        return {
            "available": t.color.run,
            "exhausted": t.color.fail,
            "overdrafted": t.color.fail,
        }.get(self._dot, t.color.idle)

    def _show_actions(self, *, sign_in: bool, account: bool, refresh: bool) -> None:
        self.sign_in_button.setVisible(sign_in)
        self.account_button.setVisible(account)
        self.refresh_button.setVisible(refresh)
        self.refresh_button.setEnabled(True)
        self.refresh_button.setText("Refresh")
        self.refresh_button.setAccessibleName("Refresh Rotaris Cloud credit")
