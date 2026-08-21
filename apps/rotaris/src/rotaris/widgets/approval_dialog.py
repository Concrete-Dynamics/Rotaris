"""Permission approval modal — renders one suspended tool call for a decision."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, override

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QDialog,
    QFrame,
    QHBoxLayout,
    QLabel,
    QPlainTextEdit,
    QPushButton,
    QVBoxLayout,
    QWidget,
)
from rotaris_core.reqtocode import SWR, traces

from rotaris.theme import tokens
from rotaris.theme.manager import Themed

if TYPE_CHECKING:
    from collections.abc import Mapping

    from rotaris.theme.spec import Theme


@traces(SWR.SWR_2504)
class ApprovalDialog(Themed, QDialog):
    """Modal asking the user to allow or refuse one waiting tool call.

    The run is not paused as a whole: only the agent that issued this call
    waits. Every exit path — the three buttons, Escape, the window close box —
    produces an explicit decision, so the waiting agent is never left hanging.
    """

    #: emits the chosen ``ApprovalOption`` value for the shown request
    decided = Signal(str)

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setWindowTitle("Permission required")
        self.setMinimumSize(560, 380)
        self.setModal(True)

        self._request: dict[str, Any] = {}
        self._decided = False

        space = tokens().space
        self._layout = QVBoxLayout(self)
        self._layout.setContentsMargins(space.xl, space[2.5], space.xl, space[2.5])
        self._layout.setSpacing(space.md)

        self._headline = QLabel()
        self._headline.setObjectName("heading")
        self._headline.setWordWrap(True)
        self._layout.addWidget(self._headline)

        self._requester = QLabel()
        self._requester.setObjectName("dim")
        self._requester.setWordWrap(True)
        self._layout.addWidget(self._requester)

        divider = QFrame()
        divider.setFrameShape(QFrame.Shape.HLine)
        divider.setObjectName("approvalDivider")
        divider.setProperty("role", "divider")
        self._layout.addWidget(divider)

        self._detail = QPlainTextEdit()
        self._detail.setObjectName("approvalDetail")
        self._detail.setProperty("mono", "true")
        self._detail.setReadOnly(True)
        self._detail.setAccessibleName("Requested command")
        self._detail.setAccessibleDescription(
            "The exact command or arguments the agent wants to run. Credentials are masked."
        )
        self._layout.addWidget(self._detail, stretch=1)

        self._rule = QLabel()
        self._rule.setObjectName("approvalRule")
        self._rule.setWordWrap(True)
        self._rule.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        self._layout.addWidget(self._rule)

        self._status_label = QLabel()
        self._status_label.setObjectName("approvalStatus")
        self._status_label.setWordWrap(True)
        self._status_label.setVisible(False)
        self._layout.addWidget(self._status_label)

        buttons = QHBoxLayout()
        buttons.setSpacing(space[1.25])

        self._deny_button = QPushButton("Deny")
        self._deny_button.setObjectName("approvalDeny")
        self._deny_button.setProperty("variant", "danger")
        self._deny_button.setAccessibleDescription(
            "Refuse this call. The agent is told why and can choose another approach."
        )
        self._deny_button.clicked.connect(lambda: self._decide("deny"))
        buttons.addWidget(self._deny_button)

        buttons.addStretch()

        self._session_button = QPushButton("Approve for this session")
        self._session_button.setObjectName("approvalSession")
        self._session_button.setProperty("variant", "secondary")
        self._session_button.setAccessibleDescription(
            "Allow this exact call for the rest of the session without asking again."
        )
        self._session_button.clicked.connect(lambda: self._decide("approve_session"))
        buttons.addWidget(self._session_button)

        self._once_button = QPushButton("Approve once")
        self._once_button.setObjectName("approvalOnce")
        self._once_button.setProperty("variant", "primary")
        self._once_button.setAccessibleDescription("Allow this single call.")
        self._once_button.setDefault(True)
        self._once_button.clicked.connect(lambda: self._decide("approve_once"))
        buttons.addWidget(self._once_button)

        self._layout.addLayout(buttons)
        self.install_theme_hook()

    # ── Public API ──────────────────────────────────────────────────────

    @property
    def request_id(self) -> str:
        """Id of the request currently shown ('' before one is set)."""
        return str(self._request.get("request_id", ""))

    def set_request(self, request: Mapping[str, Any]) -> None:
        """Render one pending approval payload."""
        self._request = dict(request)
        self._decided = False
        self._status_label.setVisible(False)

        tool_name = str(self._request.get("tool_name", "")) or "a tool"
        agent_id = str(self._request.get("agent_id", "")) or "an agent"
        persona = str(self._request.get("persona", ""))
        self._headline.setText(f"Allow {agent_id} to run {tool_name}?")
        self._requester.setText(
            f"Requested by {agent_id} ({persona} persona)."
            if persona
            else f"Requested by {agent_id}."
        )
        self._detail.setPlainText(
            str(self._request.get("command") or "")
            or str(self._request.get("argument_summary") or "")
            or "No arguments were reported for this call."
        )
        rule_id = str(self._request.get("rule_id", ""))
        reason = str(self._request.get("reason", ""))
        self._rule.setText(f"Matched rule: {rule_id}\n{reason}" if rule_id else reason)

        self.setAccessibleName(f"Permission required for {tool_name}")
        self.setAccessibleDescription(reason)
        self._set_controls_enabled(True)

    def show_error(self, message: str) -> None:
        """Report that a decision could not be delivered to the waiting agent."""
        self._decided = False
        self._status_label.setText(message)
        self._status_label.setVisible(True)
        self._set_controls_enabled(False)

    def complete_decision(self) -> None:
        """Close after the host confirms the waiting agent got the answer."""
        self._decided = True
        self.accept()

    # ── Internal helpers ────────────────────────────────────────────────

    def _decide(self, option: str) -> None:
        self._decided = True
        self.decided.emit(option)

    def _set_controls_enabled(self, enabled: bool) -> None:
        self._deny_button.setEnabled(enabled)
        self._session_button.setEnabled(enabled)
        self._once_button.setEnabled(enabled)

    @override
    def closeEvent(self, event) -> None:  # type: ignore[no-untyped-def]
        # Closing without a choice must not read as consent.
        if not self._decided:
            self._decide("deny")
        super().closeEvent(event)

    @override
    def keyPressEvent(self, event) -> None:  # type: ignore[no-untyped-def]
        if event.key() == Qt.Key.Key_Escape:
            self._decide("deny")
            self.reject()
            return
        super().keyPressEvent(event)

    @override
    def apply_theme(self, theme: Theme) -> None:
        # The two lines the application stylesheet has no answer for: the
        # matched-rule text is fine print under the command it explains, and the
        # status line is only ever a delivery failure, so it is coloured for the
        # state it reports. Both are painted as words, hence the text tokens.
        color, type_ = theme.color, theme.type
        self._rule.setStyleSheet(f"font-size:{type_.scale.xs}px;color:{color.text_tertiary};")
        self._status_label.setStyleSheet(f"font-size:{type_.scale.sm}px;color:{color.wait_text};")
