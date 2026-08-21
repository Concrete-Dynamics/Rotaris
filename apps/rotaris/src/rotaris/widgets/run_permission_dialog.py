"""Telling the user what a released requirement's run is allowed to do (SWR-3707).

Three answers, not two, because the gesture that opens this dialog has already
been made: the user dropped a card on ``Ready``. So the dialog must be able to
say *proceed*, *proceed and stop telling me*, and *actually, no* — and the last
of those has to be what a dismissal means, since a statement about permissions
that a stray Escape turns into consent is not a statement at all.

:class:`~rotaris.widgets.feedback.ConfirmImpactDialog` is the closest existing
shape and is deliberately not reused: it is a two-button confirmation for
irreversible damage, and this is neither. What is borrowed instead is
:class:`~rotaris.widgets.hook_trust_dialog.HookTrustDialog`'s structure — one
resolution point every exit path funnels through, so the answer is recorded once
whichever way the dialog closed.
"""

from __future__ import annotations

from enum import Enum
from typing import TYPE_CHECKING, override

from PySide6.QtWidgets import (
    QDialog,
    QDialogButtonBox,
    QLabel,
    QPushButton,
    QVBoxLayout,
)
from rotaris_core.reqtocode import SWR, traces

from rotaris.theme import tokens
from rotaris.theme.manager import Themed

if TYPE_CHECKING:
    from PySide6.QtWidgets import QWidget

    from rotaris.theme.spec import Theme

__all__ = ["RunPermissionChoice", "RunPermissionDialog"]

#: The heading, and the sentence under it. Kept at module scope because the
#: acceptance criterion is about what the user is *told*, and a test that asserts
#: on the words should not have to build a dialog to read them.
TITLE = "This run gets every tool, and will not stop to ask"

EXPLANATION = (
    "Releasing a requirement starts an agent that works on its own. Nobody is at "
    "the keyboard to answer a permission prompt, so Rotaris gives these runs every "
    "tool and lets them run unattended — otherwise they stop at the first command "
    "that would have needed your approval."
)

#: What that actually costs, in the order a reader needs it: the risk first, then
#: the two things that bound it, then the way out.
IMPACTS: tuple[str, ...] = (
    "The agent reads, writes and runs commands with your account's permissions, "
    "and this machine runs them without a sandbox.",
    "The work happens in the requirement's own git worktree, and reaches your "
    "branch only when you accept the result.",
    "Runs you start from the composer are unaffected — they keep this "
    "workspace's permission mode and still ask you.",
    "You can turn this off in Settings under Permissions. Released requirements "
    "then follow the workspace's mode, and may stop partway.",
)


class RunPermissionChoice(Enum):
    """What the user answered. ``CANCEL`` until they say otherwise."""

    #: Do not start the run. What Escape and the close box also mean.
    CANCEL = "cancel"
    #: Start it, and say this again on the next launch.
    PROCEED = "proceed"
    #: Start it, and never say this again.
    PROCEED_ALWAYS = "proceed-always"


@traces(SWR.SWR_3707)
class RunPermissionDialog(Themed, QDialog):
    """States what a board-started run is given, and takes one of three answers.

    Args:
        req_id: The requirement being released, named so the user can see which
            gesture they are answering for.
        parent: Qt parent.
    """

    def __init__(self, req_id: str = "", parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._choice = RunPermissionChoice.CANCEL

        self.setWindowTitle(TITLE)
        self.setModal(True)
        self.setMinimumWidth(520)
        self.setAccessibleName(TITLE)
        self.setAccessibleDescription(
            "What the agent started by this release is allowed to do on this machine."
        )

        space = tokens().space
        layout = QVBoxLayout(self)
        layout.setContentsMargins(space.lg, space.lg, space.lg, space.lg)
        layout.setSpacing(space.md)

        heading = QLabel(TITLE)
        heading.setObjectName("heading")
        layout.addWidget(heading)

        self.explanation = QLabel(
            f"{req_id} — {EXPLANATION}" if req_id else EXPLANATION,
        )
        self.explanation.setWordWrap(True)
        self.explanation.setAccessibleName("Why this run needs full permissions")
        layout.addWidget(self.explanation)

        self.impact_label = QLabel("\n".join(f"• {item}" for item in IMPACTS))
        self.impact_label.setObjectName("muted")
        self.impact_label.setWordWrap(True)
        self.impact_label.setAccessibleName("What this run may do")
        layout.addWidget(self.impact_label)

        buttons = QDialogButtonBox()

        self.cancel_button = QPushButton("Cancel")
        self.cancel_button.setAccessibleName("Cancel this release")
        self.cancel_button.setAccessibleDescription(
            "Nothing is started and the requirement stays in the column it was in."
        )
        buttons.addButton(self.cancel_button, QDialogButtonBox.ButtonRole.RejectRole)
        self.cancel_button.clicked.connect(self.reject)

        self.always_button = QPushButton("Don't show this again")
        self.always_button.setAccessibleName("Start the run and stop showing this")
        self.always_button.setAccessibleDescription(
            "Starts the run and never asks again on any project. The switch stays in Settings."
        )
        buttons.addButton(self.always_button, QDialogButtonBox.ButtonRole.ActionRole)
        self.always_button.clicked.connect(self._accept_always)

        self.proceed_button = QPushButton("Start the run")
        self.proceed_button.setAccessibleName("Start the run")
        self.proceed_button.setAccessibleDescription(
            "Starts the run now. Rotaris says this again on the next launch."
        )
        buttons.addButton(self.proceed_button, QDialogButtonBox.ButtonRole.AcceptRole)
        self.proceed_button.clicked.connect(self.accept)

        layout.addWidget(buttons)
        # The user asked for this by dropping the card, so the primary answer is
        # where Enter and the initial focus land. Escape still refuses.
        self.proceed_button.setDefault(True)
        self.proceed_button.setFocus()
        self.install_theme_hook()

    @property
    def choice(self) -> RunPermissionChoice:
        """The answer. ``CANCEL`` unless the user actively chose otherwise."""
        return self._choice

    @property
    def proceeds(self) -> bool:
        """Whether the run may start."""
        return self._choice is not RunPermissionChoice.CANCEL

    def _accept_always(self) -> None:
        """ "Don't show this again" — recorded before Qt's own accept path runs."""
        self._choice = RunPermissionChoice.PROCEED_ALWAYS
        self.accept()

    @override
    def done(self, result: int) -> None:
        # The funnel. Qt routes ``accept``, ``reject``, Escape and the close box
        # through here, and a dismissal must read as a refusal — so the only
        # answer set here is the plain proceed, and only for a real acceptance
        # that has not already named itself.
        if result == QDialog.DialogCode.Accepted:
            if self._choice is RunPermissionChoice.CANCEL:
                self._choice = RunPermissionChoice.PROCEED
        else:
            self._choice = RunPermissionChoice.CANCEL
        super().done(result)

    @override
    def apply_theme(self, theme: Theme) -> None:
        # The impact list is the one part that must not fade: it is painted as
        # words a user has to read before answering, so it owes the 4.5:1 text
        # token rather than the muted one the object name would otherwise pick.
        self.impact_label.setStyleSheet(
            f"font-size:{theme.type.scale.sm}px;color:{theme.color.text_secondary};"
        )
