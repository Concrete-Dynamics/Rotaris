"""About & Legal — product identity, legal links and licensing notices (SWR-3717).

Everything this surface paints is local data: the version string, identity
constants, the legal URL table and the bundled notice file. No network request
happens until the user opens a legal link; the licence bundle opens as a local
file. A failed launch produces a visible, non-blocking error and the page stays
usable (AC-006).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from PySide6.QtCore import Qt, QUrl
from PySide6.QtGui import QDesktopServices
from PySide6.QtWidgets import QGridLayout, QLabel, QVBoxLayout, QWidget
from rotaris_core.reqtocode import SWR, traces

from rotaris import legal
from rotaris.theme.manager import Themed
from rotaris.third_party_licences import notice_bundle_path, read_notice_bundle
from rotaris.widgets import Card, make_button

if TYPE_CHECKING:
    from collections.abc import Callable

    from rotaris.theme.spec import Theme


@traces(SWR.SWR_3717)
def open_external_url(url: str) -> bool:
    """Hand a URL to the operating system's browser; False when nothing took it.

    AC-006: the caller turns a False into a visible, non-blocking error.
    """
    return QDesktopServices.openUrl(QUrl(url))


class _Caption(Themed, QLabel):
    """A small caption that keeps the recipe for its style instead of the result.

    The page holds two of these — one for link failures, one for a missing
    bundle — and both are rebuilt by ``refresh``-like code. Holding the style
    function is what lets them follow a theme switch.
    """

    def __init__(
        self, text: str, style: Callable[[Theme], str], parent: QWidget | None = None
    ) -> None:
        super().__init__(text, parent)
        self._style = style
        self.setWordWrap(True)
        self.install_theme_hook()

    def apply_theme(self, theme: Theme) -> None:
        self.setStyleSheet(self._style(theme))


def _error_caption() -> _Caption:
    return _Caption(
        "",
        lambda t: f"font-size:{t.type.scale.x2s}px;color:{t.color.fail};",
    )


@traces(SWR.SWR_3717)
class AboutLegalPage(Themed, QWidget):
    """The About & Legal surface rendered inside Settings.

    Reachable in every normal desktop state: the page reads nothing but the
    store's version, the identity constants and the local asset bundle, so no
    provider, workspace or authentication is required to render it.
    """

    def __init__(self, version: str, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        layout = QVBoxLayout(self)
        layout.setSpacing(14)

        identity = Card("Product", accented=True)
        self._build_identity(identity, version)
        layout.addWidget(identity)

        documents = Card("Legal documents")
        self.link_error = _error_caption()
        self.link_error.hide()
        documents.body.addWidget(self.link_error)
        for document in legal.LEGAL_DOCUMENTS:
            button = make_button(document.name, "link")
            button.setAccessibleName(f"Open {document.name}")
            button.setAccessibleDescription(f"Opens {document.url} in the system browser")
            button.clicked.connect(lambda _checked=False, doc=document: self._open_document(doc))
            documents.body.addWidget(button)
        layout.addWidget(documents)

        licensing = Card("Licensing")
        licence_line = QLabel(f"Rotaris is licensed under the {legal.PRODUCT_LICENSE} License.")
        licence_line.setObjectName("muted")
        licence_line.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        licensing.body.addWidget(licence_line)
        self.bundle_error = _error_caption()
        self.bundle_error.hide()
        licensing.body.addWidget(self.bundle_error)
        self.bundle_button = make_button("Open third-party licenses", "secondary")
        self.bundle_button.setAccessibleName("Open third-party licenses")
        self.bundle_button.setAccessibleDescription(
            "Opens the third-party license bundle shipped with this build"
        )
        self.bundle_button.clicked.connect(self._open_bundle)
        licensing.body.addWidget(self.bundle_button)
        layout.addWidget(licensing)

        layout.addStretch(1)

    def _build_identity(self, card: Card, version: str) -> None:
        """The product identity rows AC-002 requires, from local metadata only."""
        grid = QGridLayout()
        grid.setHorizontalSpacing(18)
        grid.setVerticalSpacing(8)
        rows = (
            ("Version", f"v{version}"),
            ("Build", legal.build_identifier() or "—"),
            ("Installation", legal.installation_flavour()),
            ("Publisher", legal.PUBLISHER),
            ("Security contact", legal.SECURITY_CONTACT),
        )
        for row_index, (name, value) in enumerate(rows):
            name_label = QLabel(name)
            name_label.setObjectName("muted")
            grid.addWidget(name_label, row_index, 0)
            value_label = QLabel(value)
            value_label.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
            value_label.setAccessibleName(f"{name}: {value}")
            grid.addWidget(value_label, row_index, 1)
        card.body.addLayout(grid)

    def _open_document(self, document: legal.LegalDocument) -> None:
        if open_external_url(document.url):
            self.link_error.hide()
            return
        self.link_error.setText(f"Could not open a browser for {document.name} ({document.url}).")
        self.link_error.show()

    def _open_bundle(self) -> None:
        if read_notice_bundle() is None:
            self.bundle_error.setText("This build does not carry a third-party license bundle.")
            self.bundle_error.show()
            return
        opened = QDesktopServices.openUrl(QUrl.fromLocalFile(str(notice_bundle_path())))
        if opened:
            self.bundle_error.hide()
            return
        self.bundle_error.setText("Could not open the third-party license bundle.")
        self.bundle_error.show()
