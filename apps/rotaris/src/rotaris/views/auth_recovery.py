"""Modal recovery dialog for runs that keep failing with authentication errors.

Shown only after the automatic fallback-model retry has also failed to
authenticate: the user either switches to a model from another provider or
re-authenticates the failing provider and retries.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from PySide6.QtCore import Signal
from PySide6.QtWidgets import (
    QComboBox,
    QDialog,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QPushButton,
    QVBoxLayout,
    QWidget,
)
from rotaris_core.reqtocode import SWR, traces

from rotaris.theme.manager import Themed

if TYPE_CHECKING:
    from rotaris.theme.spec import Theme


@traces(SWR.SWR_2024)
class AuthRecoveryDialog(Themed, QDialog):
    """Pick an alternative model or re-authenticate the failing provider."""

    #: Emitted with the model key the run should be retried with.
    model_selected = Signal(str)
    #: Emitted with (provider_id, api_key). api_key is "" when the user
    #: re-authenticated externally (OAuth flows) and just wants a retry.
    reauth_submitted = Signal(str, str)

    def __init__(
        self,
        *,
        failed_model: str,
        provider_id: str,
        provider_flow: str,
        model_providers: dict[str, str],
        error_message: str,
        parent: QWidget | None = None,
    ) -> None:
        super().__init__(parent)
        self.provider_id = provider_id
        self.setWindowTitle("Authentication failed")
        self.setModal(True)
        self.resize(560, 0)

        layout = QVBoxLayout(self)
        layout.setSpacing(12)
        title = QLabel(f"Authentication failed for {failed_model or 'the active model'}")
        title.setObjectName("heading")
        layout.addWidget(title)

        self._detail = QLabel(_shorten(error_message))
        self._detail.setWordWrap(True)
        layout.addWidget(self._detail)

        # ── switch to a model from another provider ──────────────────────
        layout.addWidget(QLabel("Retry with a model from another provider:"))
        self.model_combo = QComboBox()
        for key in _alternative_models(model_providers, provider_id, failed_model):
            self.model_combo.addItem(f"{key}   ({model_providers.get(key, '?')})", key)
        row = QHBoxLayout()
        row.addWidget(self.model_combo, 1)
        self.retry_model_button = QPushButton("Retry with selected model")
        self.retry_model_button.setEnabled(self.model_combo.count() > 0)
        self.retry_model_button.clicked.connect(self._emit_model)
        row.addWidget(self.retry_model_button)
        layout.addLayout(row)

        # ── re-authenticate the failing provider ─────────────────────────
        self.api_key_input: QLineEdit | None = None
        self.reauth_button: QPushButton | None = None
        if provider_id:
            if provider_flow == "api_key":
                layout.addWidget(QLabel(f"Or enter a new API key for '{provider_id}':"))
                self.api_key_input = QLineEdit()
                self.api_key_input.setEchoMode(QLineEdit.EchoMode.Password)
                self.api_key_input.setPlaceholderText("API key")
                reauth_button = QPushButton("Save key && retry")
                reauth_button.setEnabled(False)
                self.reauth_button = reauth_button
                self.api_key_input.textChanged.connect(
                    lambda text: reauth_button.setEnabled(bool(text.strip()))
                )
                self.reauth_button.clicked.connect(self._emit_reauth)
                key_row = QHBoxLayout()
                key_row.addWidget(self.api_key_input, 1)
                key_row.addWidget(self.reauth_button)
                layout.addLayout(key_row)
            else:
                hint = QLabel(
                    f"Or re-authenticate by running 'rotaris-cli login {provider_id}' "
                    "in a terminal, then retry."
                )
                hint.setWordWrap(True)
                layout.addWidget(hint)
                self.reauth_button = QPushButton("I've re-authenticated — retry")
                self.reauth_button.clicked.connect(self._emit_reauth)
                layout.addWidget(self.reauth_button)

        cancel_row = QHBoxLayout()
        cancel_row.addStretch(1)
        self.cancel_button = QPushButton("Cancel")
        self.cancel_button.clicked.connect(self.reject)
        cancel_row.addWidget(self.cancel_button)
        layout.addLayout(cancel_row)
        self.install_theme_hook()

    def apply_theme(self, theme: Theme) -> None:
        # The provider's own error text, quoted verbatim — words, so the text
        # form of the failure colour rather than the marker's.
        self._detail.setStyleSheet(f"color:{theme.color.fail_text};")

    def _emit_model(self) -> None:
        model = self.model_combo.currentData()
        if model:
            self.model_selected.emit(str(model))
            self.accept()

    def _emit_reauth(self) -> None:
        api_key = self.api_key_input.text().strip() if self.api_key_input is not None else ""
        self.reauth_submitted.emit(self.provider_id, api_key)
        self.accept()


class PrimaryReauthDialog(Themed, QDialog):
    """Non-blocking prompt to re-authenticate the primary provider.

    Shown while the run keeps going on the fallback model after the primary
    model's provider failed to authenticate. On success the host switches the
    run back onto the primary model from the next iteration.
    """

    #: Emitted with (provider_id, api_key). api_key is "" when the user
    #: re-authenticated externally (OAuth flows) and just confirms.
    reauth_submitted = Signal(str, str)

    def __init__(
        self,
        *,
        primary_model: str,
        fallback_model: str,
        provider_id: str,
        provider_flow: str,
        error_message: str,
        parent: QWidget | None = None,
    ) -> None:
        super().__init__(parent)
        self.provider_id = provider_id
        self.setWindowTitle("Re-authenticate provider")
        self.setModal(False)
        self.resize(540, 0)

        layout = QVBoxLayout(self)
        layout.setSpacing(12)
        title = QLabel(f"Authentication failed for {primary_model or 'the active model'}")
        title.setObjectName("heading")
        layout.addWidget(title)

        info = QLabel(
            f"The run continues on the fallback model {fallback_model}. "
            f"Re-authenticate '{provider_id}' to switch back to "
            f"{primary_model or 'the primary model'} from the next iteration."
        )
        info.setWordWrap(True)
        layout.addWidget(info)

        self._detail = QLabel(_shorten(error_message))
        self._detail.setWordWrap(True)
        layout.addWidget(self._detail)

        self.api_key_input: QLineEdit | None = None
        if provider_flow == "api_key":
            layout.addWidget(QLabel(f"New API key for '{provider_id}':"))
            self.api_key_input = QLineEdit()
            self.api_key_input.setEchoMode(QLineEdit.EchoMode.Password)
            self.api_key_input.setPlaceholderText("API key")
            self.reauth_button = QPushButton("Save key && switch back")
            self.reauth_button.setEnabled(False)
            self.api_key_input.textChanged.connect(
                lambda text: self.reauth_button.setEnabled(bool(text.strip()))
            )
            self.reauth_button.clicked.connect(self._emit_reauth)
            key_row = QHBoxLayout()
            key_row.addWidget(self.api_key_input, 1)
            key_row.addWidget(self.reauth_button)
            layout.addLayout(key_row)
        else:
            hint = QLabel(
                f"Re-authenticate by running 'rotaris-cli login {provider_id}' "
                "in a terminal, then confirm below."
            )
            hint.setWordWrap(True)
            layout.addWidget(hint)
            self.reauth_button = QPushButton("I've re-authenticated — switch back")
            self.reauth_button.clicked.connect(self._emit_reauth)
            layout.addWidget(self.reauth_button)

        dismiss_row = QHBoxLayout()
        dismiss_row.addStretch(1)
        self.dismiss_button = QPushButton("Keep fallback")
        self.dismiss_button.clicked.connect(self.reject)
        dismiss_row.addWidget(self.dismiss_button)
        layout.addLayout(dismiss_row)
        self.install_theme_hook()

    def apply_theme(self, theme: Theme) -> None:
        self._detail.setStyleSheet(f"color:{theme.color.fail_text};")

    def _emit_reauth(self) -> None:
        api_key = self.api_key_input.text().strip() if self.api_key_input is not None else ""
        self.reauth_submitted.emit(self.provider_id, api_key)
        self.accept()


def _alternative_models(
    model_providers: dict[str, str], failing_provider: str, failed_model: str
) -> list[str]:
    """Models from other providers first; fall back to everything but the failed one."""
    others = [
        key
        for key, provider in model_providers.items()
        if provider != failing_provider and key != failed_model
    ]
    if others:
        return others
    return [key for key in model_providers if key != failed_model]


def _shorten(message: str, limit: int = 320) -> str:
    cleaned = " ".join(message.split())
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: limit - 1].rstrip() + "…"
