"""The strip that asks why a requirement is being blocked (SWR-3201, SWR-3602).

``Blocked`` is the one delivery state that cannot be entered silently: the engine
refuses a transition into it without a stated reason, because a blocked card
nobody can explain is a card nobody can clear. Two surfaces put requirements
there — the queue panel's **Hold**, and the board's move onto the ``Blocked``
column — and until this widget existed only one of them asked for the sentence.
The other emitted the move with an empty reason and showed the user the engine's
refusal, which is a control that cannot work by construction.

So the asking lives here, once, and both surfaces mount it. The rule it enforces
is the engine's own and is stated rather than merely applied: the confirm button
is unavailable *with :data:`HOLD_REASON_REQUIRED` on it* until there is
something to record, so a user who cannot see why the button is dead is told.
"""

from __future__ import annotations

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import QHBoxLayout, QLineEdit, QWidget
from rotaris_core.reqtocode import SWR, traces

from rotaris.widgets.cards import make_button, set_action_availability

__all__ = ["HOLD_REASON_REQUIRED", "HoldReasonBar"]

#: What the hold control needs before a requirement can be held (SWR-3201).
HOLD_REASON_REQUIRED = (
    "A blocked requirement carries a stated reason, so the board and the audit "
    "trail can both say why nothing is scheduled for it."
)


@traces(SWR.SWR_3201, SWR.SWR_3314, SWR.SWR_3602)
class HoldReasonBar(QWidget):
    """Asks for the reason a hold needs, and reports it once it has one.

    Hidden until :meth:`ask` names a requirement, and hidden again the moment it
    is answered or taken back — a permanently visible reason box on a board where
    most moves need none is a control that asks a question nobody was posed.
    """

    #: ``(req_id, reason)`` — the hold the user confirmed. Never emitted with an
    #: empty reason; the button that raises it is unavailable until there is one.
    confirmed = Signal(str, str)
    #: The hold was taken back. The requirement was not moved.
    cancelled = Signal()

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setObjectName("holdReasonBar")
        self.setAccessibleName("Hold a requirement")
        self.setVisible(False)
        self._holding = ""
        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(6)
        self.reason = QLineEdit()
        self.reason.setAccessibleName("Why this requirement is held")
        self.reason.setPlaceholderText("Why is this requirement held?")
        self.reason.textChanged.connect(self._sync)
        self.reason.returnPressed.connect(self._confirm)
        layout.addWidget(self.reason, 1)
        self.confirm = make_button("Confirm hold", "primary")
        self.confirm.setAccessibleName("Confirm the hold")
        self.confirm.clicked.connect(self._confirm)
        layout.addWidget(self.confirm)
        self.cancel = make_button("Cancel", "ghost")
        self.cancel.setAccessibleName("Cancel the hold")
        self.cancel.clicked.connect(self.dismiss)
        layout.addWidget(self.cancel)
        self._sync()

    @property
    def holding(self) -> str:
        """Which requirement this strip is asking about, ``""`` when none."""
        return self._holding

    @traces(SWR.SWR_3201, SWR.SWR_3314)
    def ask(self, req_id: str) -> None:
        """Ask why *req_id* is being held, and take the focus to the answer."""
        self._holding = req_id
        self.reason.clear()
        self.reason.setAccessibleName(f"Why {req_id} is held")
        self.confirm.setAccessibleName(f"Confirm holding {req_id}")
        self.cancel.setAccessibleName(f"Cancel holding {req_id}")
        self.setVisible(True)
        self.reason.setFocus(Qt.FocusReason.OtherFocusReason)
        self._sync()

    def dismiss(self) -> None:
        """Take back a hold nobody stated a reason for."""
        asked = bool(self._holding)
        self._holding = ""
        self.reason.clear()
        self.setVisible(False)
        if asked:
            self.cancelled.emit()

    def _confirm(self) -> None:
        reason = self.reason.text().strip()
        req_id = self._holding
        if not (reason and req_id):
            return
        self._holding = ""
        self.reason.clear()
        self.setVisible(False)
        self.confirmed.emit(req_id, reason)

    def _sync(self) -> None:
        ready = bool(self.reason.text().strip())
        set_action_availability(
            self.confirm,
            enabled=ready,
            reason="" if ready else HOLD_REASON_REQUIRED,
        )
