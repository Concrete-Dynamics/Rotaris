"""Provider authentication dialog and background task used by Settings."""

from __future__ import annotations

import threading
from html import escape
from typing import TYPE_CHECKING

from PySide6.QtCore import Qt, QThread, QUrl, Signal
from PySide6.QtGui import QDesktopServices
from PySide6.QtWidgets import (
    QComboBox,
    QDialog,
    QDialogButtonBox,
    QLabel,
    QLineEdit,
    QVBoxLayout,
    QWidget,
)
from rotaris_core.reqtocode import SWR, traces

from rotaris.theme import tokens
from rotaris.theme.manager import Themed

if TYPE_CHECKING:
    from collections.abc import Callable

    from rotaris.theme.spec import Theme


@traces(SWR.SWR_2040, SWR.SWR_2041, SWR.SWR_2042, SWR.SWR_2043)
class ProviderTask(QThread):
    """Run provider network/auth work without blocking the desktop event loop."""

    prompt = Signal(str)
    succeeded = Signal(object)
    failed = Signal(str)

    def __init__(self, operation: Callable[[Callable[[object], None]], object]) -> None:
        super().__init__()
        self._operation = operation

    def run(self) -> None:
        try:
            self.succeeded.emit(self._operation(self._show_prompt))
        except Exception as exc:  # noqa: BLE001 - surfaced safely in the UI
            self.failed.emit(str(exc))

    def _show_prompt(self, prompt: object) -> None:
        verification_uri = getattr(prompt, "verification_uri", None)
        user_code = getattr(prompt, "user_code", "")
        url = verification_uri or str(prompt)
        QDesktopServices.openUrl(QUrl(url))
        link = f'<a href="{escape(url)}">{escape(url)}</a>'
        if verification_uri:
            self.prompt.emit(f"Open {link} and enter code {escape(str(user_code))}.")
        else:
            self.prompt.emit(
                f"Your browser should have opened automatically. If it didn't, open this "
                f"link to complete authentication:<br>{link}"
            )


class ProviderAuthDialog(Themed, QDialog):
    """Collect API credentials or display OAuth/device-flow instructions."""

    submitted = Signal(str)

    def __init__(
        self,
        provider_label: str,
        auth_flow: str,
        *,
        reauth: bool,
        parent: QWidget | None = None,
    ) -> None:
        super().__init__(parent)
        self.cancel_event = threading.Event()
        #: Whether the status line is currently reporting a failure. Kept so a
        #: theme switch repaints it in the colour it is actually in, rather than
        #: quietly demoting a visible error back to an ordinary progress note.
        self._status_failed = False
        self.setWindowTitle(f"{'Re-authenticate' if reauth else 'Authenticate'} {provider_label}")
        self.setMinimumWidth(500)
        layout = QVBoxLayout(self)
        title = QLabel(self.windowTitle())
        title.setObjectName("heading")
        layout.addWidget(title)
        self.instructions = QLabel()
        self.instructions.setWordWrap(True)
        layout.addWidget(self.instructions)
        self.api_key_input: QLineEdit | None = None
        if auth_flow == "api_key":
            self.instructions.setText(
                "Enter the provider API key. It will be validated with the provider's "
                "model catalog endpoint before it is saved."
            )
            self.api_key_input = QLineEdit()
            self.api_key_input.setEchoMode(QLineEdit.EchoMode.Password)
            self.api_key_input.setPlaceholderText("API key")
            layout.addWidget(self.api_key_input)
        else:
            self.instructions.setText(
                "Start authentication. Rotaris will open or display the provider's official "
                "sign-in flow here."
            )
        self.status = QLabel("")
        self.status.setWordWrap(True)
        self.status.setTextFormat(Qt.TextFormat.RichText)
        self.status.setTextInteractionFlags(Qt.TextInteractionFlag.TextBrowserInteraction)
        self.status.setOpenExternalLinks(True)
        layout.addWidget(self.status)
        self.buttons = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel
        )
        self.buttons.button(QDialogButtonBox.StandardButton.Ok).setText("Authenticate")
        self.buttons.accepted.connect(self._submit)
        self.buttons.rejected.connect(self._on_cancel)
        layout.addWidget(self.buttons)
        self.install_theme_hook()

    def apply_theme(self, theme: Theme) -> None:
        # A failure the user must read is text, so it owes the body floor: the
        # text form of the state colour, never the dot's.
        color = theme.color.fail_text if self._status_failed else theme.color.text_secondary
        self.status.setStyleSheet(f"font-size:{theme.type.scale.xs}px;color:{color};")

    def _on_cancel(self) -> None:
        self.cancel_event.set()
        self.reject()

    def _submit(self) -> None:
        api_key = self.api_key_input.text().strip() if self.api_key_input is not None else ""
        if self.api_key_input is not None and not api_key:
            self.set_error("API key is required.")
            return
        self.set_busy(True)
        self.submitted.emit(api_key)

    def set_busy(self, busy: bool) -> None:
        self.buttons.button(QDialogButtonBox.StandardButton.Ok).setEnabled(not busy)
        if busy:
            self.status.setText("Authenticating and checking provider health…")

    def set_prompt(self, message: str) -> None:
        self.status.setText(message)

    def set_error(self, message: str) -> None:
        self._status_failed = True
        self.apply_theme(tokens())
        self.status.setText(message)
        self.set_busy(False)


class AddProviderDialog(Themed, QDialog):
    """Add a provider: a built-in one (starts its own auth flow) or a custom
    labelled OpenAI-compatible endpoint (collected here directly)."""

    submitted = Signal(str, str, str)
    builtin_selected = Signal(str)

    _CUSTOM_ENDPOINT = ""

    def __init__(
        self,
        parent: QWidget | None = None,
        *,
        builtin_providers: list[tuple[str, str, str]] | None = None,
    ) -> None:
        super().__init__(parent)
        self._status_failed = False
        self.setWindowTitle("Add provider")
        self.setMinimumWidth(520)
        layout = QVBoxLayout(self)

        self.provider_combo: QComboBox | None = None
        if builtin_providers:
            self.provider_combo = QComboBox()
            self.provider_combo.setAccessibleName("Provider type")
            self.provider_combo.addItem(
                "OpenAI-compatible endpoint (custom URL)", self._CUSTOM_ENDPOINT
            )
            for provider_id, display_name, _auth_flow in builtin_providers:
                self.provider_combo.addItem(display_name, provider_id)
            self.provider_combo.currentIndexChanged.connect(self._sync_mode)
            layout.addWidget(self.provider_combo)

        self.destination_hint = QLabel("")
        self.destination_hint.setObjectName("muted")
        self.destination_hint.setWordWrap(True)
        self.destination_hint.setAccessibleName("Provider destination")
        self.destination_hint.setVisible(bool(builtin_providers))
        layout.addWidget(self.destination_hint)

        self.instructions = QLabel(
            "Add a user-wide endpoint. Rotaris validates its model catalog before saving it."
        )
        self.instructions.setWordWrap(True)
        layout.addWidget(self.instructions)
        self.label_input = QLineEdit()
        self.label_input.setPlaceholderText("Endpoint label")
        self.label_input.setAccessibleName("Endpoint label")
        layout.addWidget(self.label_input)
        self.url_input = QLineEdit("https://api.openai.com/v1")
        self.url_input.setPlaceholderText("https://host.example/v1")
        self.url_input.setAccessibleName("Endpoint URL")
        layout.addWidget(self.url_input)
        self.api_key_input = QLineEdit()
        self.api_key_input.setEchoMode(QLineEdit.EchoMode.Password)
        self.api_key_input.setPlaceholderText("API key")
        self.api_key_input.setAccessibleName("API key")
        layout.addWidget(self.api_key_input)
        self.status = QLabel("")
        self.status.setWordWrap(True)
        layout.addWidget(self.status)
        self.buttons = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel
        )
        self.buttons.button(QDialogButtonBox.StandardButton.Ok).setText("Add endpoint")
        self.buttons.accepted.connect(self._submit)
        self.buttons.rejected.connect(self.reject)
        layout.addWidget(self.buttons)
        self.install_theme_hook()
        self._refresh_destination_hint()

    def apply_theme(self, theme: Theme) -> None:
        # Until something fails this line inherits the dialog's own text style;
        # only the failure is worth painting differently.
        self.status.setStyleSheet(
            f"font-size:{theme.type.scale.xs}px;color:{theme.color.fail_text};"
            if self._status_failed
            else ""
        )

    def _selected_builtin_id(self) -> str:
        if self.provider_combo is None:
            return self._CUSTOM_ENDPOINT
        return str(self.provider_combo.currentData())

    def _sync_mode(self) -> None:
        builtin = bool(self._selected_builtin_id())
        for widget in (self.instructions, self.label_input, self.url_input, self.api_key_input):
            widget.setVisible(not builtin)
        self.buttons.button(QDialogButtonBox.StandardButton.Ok).setText(
            "Authenticate" if builtin else "Add endpoint"
        )
        self._refresh_destination_hint()
        self.status.setText("")

    @traces(SWR.SWR_3721)
    def _refresh_destination_hint(self) -> None:
        """State where the selected provider sends model traffic (SWR-3721).

        Read from the runtime provider catalog — the same source the settings
        rows use — so the dialog cannot drift into its own provider table.
        """
        provider_id = self._selected_builtin_id()
        if not provider_id:
            self.destination_hint.setText(
                "Custom endpoint — model traffic is sent to the base URL you enter below."
            )
            return
        from rotaris_core.providers import get_provider
        from rotaris_core.providers.types import ConnectionMode

        try:
            descriptor = get_provider(provider_id)
        except KeyError:
            self.destination_hint.setText("")
            return
        if descriptor.connection_mode is ConnectionMode.LOCAL_SDK:
            self.destination_hint.setText(
                "Rotaris invokes the Claude Agent SDK installed locally; "
                "traffic goes through that SDK."
            )
        elif descriptor.connection_mode is ConnectionMode.ROTARIS_CLOUD:
            self.destination_hint.setText(
                "Rotaris-managed cloud service — destination: rotaris.ai."
            )
        elif descriptor.connection_mode is ConnectionMode.DIRECT:
            operator = descriptor.operator_name or "the provider"
            self.destination_hint.setText(
                f"Direct provider API — {operator}, destination: {descriptor.destination_host()}."
            )
        else:
            self.destination_hint.setText("")

    def _submit(self) -> None:
        builtin_id = self._selected_builtin_id()
        if builtin_id:
            self.accept()
            self.builtin_selected.emit(builtin_id)
            return
        label = self.label_input.text().strip()
        url = self.url_input.text().strip()
        api_key = self.api_key_input.text().strip()
        if not label:
            self.set_error("Label is required.")
            return
        if not url:
            self.set_error("Endpoint URL is required.")
            return
        if not api_key:
            self.set_error("API key is required.")
            return
        self.set_busy(True)
        self.submitted.emit(label, url, api_key)

    def set_busy(self, busy: bool) -> None:
        self.buttons.button(QDialogButtonBox.StandardButton.Ok).setEnabled(not busy)
        if busy:
            self.status.setText("Validating endpoint and discovering models…")

    def set_error(self, message: str) -> None:
        self._status_failed = True
        self.apply_theme(tokens())
        self.status.setText(message)
        self.set_busy(False)
