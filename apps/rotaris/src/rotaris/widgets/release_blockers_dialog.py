"""What a user is asked before a held requirement is released (SWR-3622).

The gesture has already been made — the card was dropped on ``Ready`` — so this
dialog is not a yes/no confirmation. It is the answer to "what is in the way",
and it has to offer every reasonable next move, because a user who is told only
*no* has learned nothing they can act on:

```text
Release anyway         the dependency is not real, or not yet; proceed
Take me to SWR-x       nothing moves; the board goes to the blocker
Start with SWR-y       release the root of the chain instead (SWR-3623)
Cancel                 nothing moves and nothing is started
```

Three things are deliberate:

- **Nothing here is worded by the board.** Each row prints the dependency
  gate's own sentence, carried through
  :func:`~rotaris.models.requirements_state.build_release_hold` (SWR-3510). A
  reason this surface invented would be a refusal nobody can take
  responsibility for.
- **"Release anyway" is never the default.** Enter and the initial focus land
  on the constructive answer — the root, when there is one, and otherwise the
  navigation. Escape refuses, like every other dialog in this product.
- **A chain with no root says so.** A cycle, a dangling ``depends-on`` and a
  root that is already running are three different facts, and each is stated
  instead of being flattened into a disabled button.

:class:`~rotaris.widgets.run_permission_dialog.RunPermissionDialog` is the shape
this borrows: one resolution point every exit path funnels through, so the
answer is recorded once whichever way the dialog closed.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import TYPE_CHECKING, override

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QDialog,
    QDialogButtonBox,
    QFrame,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QVBoxLayout,
)
from rotaris_core.reqtocode import SWR, traces

from rotaris.theme import tokens
from rotaris.theme.manager import Themed
from rotaris.widgets.cards import SectionLabel, make_button

if TYPE_CHECKING:
    from PySide6.QtGui import QShowEvent
    from PySide6.QtWidgets import QWidget

    from rotaris.models.requirements_state import HeldDependency, ReleaseHold
    from rotaris.theme.spec import Theme

__all__ = [
    "EXPLANATION",
    "RELEASE_ANYWAY_CONSEQUENCE",
    "ReleaseBlockerChoice",
    "ReleaseBlockerDecision",
    "ReleaseBlockersDialog",
    "release_blocker_prompt",
]

#: Why an unmet dependency is worth stopping for, in the engine's terms rather
#: than the board's. Kept at module scope because the acceptance criterion is
#: about what the user is *told*, and a test that asserts on the words should
#: not have to build a dialog to read them.
EXPLANATION = (
    "A requirement that depends on another cannot sensibly be implemented first: "
    "the agent would invent the missing foundation, and when the real one lands the "
    "two implementations disagree."
)

RELEASE_ANYWAY_CONSEQUENCE = (
    "Starts the run now, against dependencies that have not been delivered. The "
    "scheduler still holds its units until they are, so the run may wait rather "
    "than start."
)

NAVIGATE_CONSEQUENCE = "Nothing is moved and nothing is started. The board goes to that card."

CANCEL_CONSEQUENCE = "Nothing is started and the requirement stays in the column it was in."


class ReleaseBlockerChoice(Enum):
    """What the user answered. ``CANCEL`` until they say otherwise."""

    #: Do not release, and do nothing else. What Escape and the close box mean.
    CANCEL = "cancel"
    #: Release this requirement despite the unmet dependencies.
    RELEASE_ANYWAY = "release-anyway"
    #: Go to one of the requirements in the way; move nothing.
    NAVIGATE = "navigate"
    #: Release the root of the chain instead of this requirement (SWR-3623).
    HANDLE_FIRST = "handle-first"


@traces(SWR.SWR_3622)
@dataclass(frozen=True)
class ReleaseBlockerDecision:
    """The answer, and the requirement it is about where that is not obvious.

    :attr:`target` carries the id for the two answers that name one — the
    blocker to go to, and the root to release. Empty for the other two, so a
    caller never has to guess which requirement an answer meant.
    """

    choice: ReleaseBlockerChoice = ReleaseBlockerChoice.CANCEL
    target: str = ""

    @property
    def proceeds(self) -> bool:
        """Whether the release the user asked for should go ahead unchanged."""
        return self.choice is ReleaseBlockerChoice.RELEASE_ANYWAY


@traces(SWR.SWR_3622, SWR.SWR_3623)
class ReleaseBlockersDialog(Themed, QDialog):
    """States what is in the way of a release, and takes one of four answers.

    Args:
        hold: What the dependency gate said, in the board's own shape.
        parent: Qt parent.
    """

    def __init__(self, hold: ReleaseHold, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._hold = hold
        self._decision = ReleaseBlockerDecision()

        self.setWindowTitle(hold.heading)
        self.setModal(True)
        self.setMinimumWidth(560)
        self.setAccessibleName(hold.heading)
        self.setAccessibleDescription(hold.accessible_description)

        space = tokens().space
        layout = QVBoxLayout(self)
        layout.setContentsMargins(space.lg, space.lg, space.lg, space.lg)
        layout.setSpacing(space.md)

        heading = QLabel(hold.heading)
        heading.setObjectName("heading")
        layout.addWidget(heading)

        self.explanation = QLabel(EXPLANATION)
        self.explanation.setWordWrap(True)
        self.explanation.setAccessibleName("Why an undelivered dependency stops a release")
        layout.addWidget(self.explanation)

        self._toned: list[QLabel] = []
        for held in hold.held_by:
            layout.addWidget(self._row(held))

        self.chain_label = QLabel(f"In order: {hold.chain_sentence}")
        self.chain_label.setObjectName("muted")
        self.chain_label.setWordWrap(True)
        self.chain_label.setAccessibleName("The order these requirements have to land in")
        self.chain_label.setVisible(bool(hold.chain_sentence))
        layout.addWidget(self.chain_label)

        # Why there is no root to offer — a cycle, a dangling target, or a
        # requirement already in flight. Stated rather than left as a missing
        # button, which a user would read as the product having nothing to say.
        self.no_root_label = QLabel(hold.root_reason)
        self.no_root_label.setWordWrap(True)
        self.no_root_label.setAccessibleName("Why the chain has no root to start with")
        self.no_root_label.setVisible(bool(hold.root_reason))
        self._toned.append(self.no_root_label)
        layout.addWidget(self.no_root_label)

        layout.addWidget(self._buttons())
        self.install_theme_hook()

    # ── the parts ─────────────────────────────────────────────────────────

    def _row(self, held: HeldDependency) -> QFrame:
        """One requirement in the way, with the gate's sentence and a way to it."""
        t = tokens()
        row = QFrame()
        row.setObjectName("card")
        row.setProperty("surface", "card")
        row.setAccessibleName(f"Dependency on {held.req_id}")
        row.setAccessibleDescription(held.accessible_description)
        box = QVBoxLayout(row)
        box.setContentsMargins(t.space.md, t.space[1.25], t.space.md, t.space[1.25])
        box.setSpacing(t.space[0.75])
        box.addWidget(SectionLabel(held.req_id))

        reason = QLabel(held.sentence)
        reason.setWordWrap(True)
        self._toned.append(reason)
        box.addWidget(reason)

        controls = QHBoxLayout()
        controls.setSpacing(t.space.sm)
        button = make_button(f"Take me to {held.req_id}", "secondary")
        button.setAccessibleName(f"Go to {held.req_id}, which {self._hold.req_id} waits for")
        button.setAccessibleDescription(NAVIGATE_CONSEQUENCE)
        button.clicked.connect(lambda *_, target=held.req_id: self._navigate(target))
        controls.addWidget(button)
        controls.addStretch(1)
        box.addLayout(controls)
        return row

    def _buttons(self) -> QDialogButtonBox:
        """The four answers, weighted so the constructive one reads as the primary.

        Built with :func:`~rotaris.widgets.cards.make_button` rather than as bare
        push buttons: a filled control and a bordered one are the same rectangle
        at the same height, and "Release anyway" sitting at the visual weight of
        "Start with SWR-3305" would make the answer that starts an unattended run
        look like the recommended one.
        """
        buttons = QDialogButtonBox()

        self.cancel_button = make_button("Cancel", "ghost")
        self.cancel_button.setAccessibleName("Cancel this release")
        self.cancel_button.setAccessibleDescription(CANCEL_CONSEQUENCE)
        buttons.addButton(self.cancel_button, QDialogButtonBox.ButtonRole.RejectRole)
        self.cancel_button.clicked.connect(self.reject)

        self.anyway_button = make_button("Release anyway", "secondary")
        self.anyway_button.setAccessibleName(f"Release {self._hold.req_id} anyway")
        self.anyway_button.setAccessibleDescription(RELEASE_ANYWAY_CONSEQUENCE)
        buttons.addButton(self.anyway_button, QDialogButtonBox.ButtonRole.ActionRole)
        self.anyway_button.clicked.connect(self._release_anyway)

        self.root_button: QPushButton | None = None
        if self._hold.resolvable:
            root = self._hold.root
            self.root_button = make_button(f"Start with {root}", "primary")
            self.root_button.setAccessibleName(f"Release {root} instead")
            self.root_button.setAccessibleDescription(
                f"Releases {root} — the first requirement in this chain with nothing left to"
                f" wait for — and starts its run. {self._hold.req_id} is not moved.",
            )
            buttons.addButton(self.root_button, QDialogButtonBox.ButtonRole.AcceptRole)
            self.root_button.clicked.connect(self._handle_first)
            self.root_button.setDefault(True)
        else:
            self.cancel_button.setDefault(True)
        return buttons

    @property
    def opening_focus(self) -> QPushButton:
        """Where the keyboard lands when this dialog opens.

        The answer that makes progress — the root when there is one, and
        otherwise the refusal. Never "Release anyway": that one starts an
        unattended run against a foundation that does not exist yet, and no
        keystroke should reach it by accident.
        """
        return self.root_button if self.root_button is not None else self.cancel_button

    @override
    def showEvent(self, event: QShowEvent) -> None:  # noqa: N802 — Qt's spelling
        # Set here rather than at construction: Qt assigns the initial focus to
        # the first widget in the tab chain when the dialog is shown, which would
        # otherwise take it back off the answer and hand it to the first "Take me
        # to …" — and Enter on a focused button clicks *that* one, whatever is
        # marked as the default.
        super().showEvent(event)
        self.opening_focus.setFocus(Qt.FocusReason.OtherFocusReason)

    # ── the answers ───────────────────────────────────────────────────────

    def _navigate(self, target: str) -> None:
        self._decision = ReleaseBlockerDecision(ReleaseBlockerChoice.NAVIGATE, target)
        self.accept()

    def _handle_first(self) -> None:
        self._decision = ReleaseBlockerDecision(
            ReleaseBlockerChoice.HANDLE_FIRST,
            self._hold.root,
        )
        self.accept()

    def _release_anyway(self) -> None:
        self._decision = ReleaseBlockerDecision(ReleaseBlockerChoice.RELEASE_ANYWAY)
        self.accept()

    @property
    def decision(self) -> ReleaseBlockerDecision:
        """The answer. ``CANCEL`` unless the user actively chose otherwise."""
        return self._decision

    @override
    def done(self, result: int) -> None:
        # The funnel. Qt routes ``accept``, ``reject``, Escape and the close box
        # through here, and a dismissal must read as a refusal — so an exit that
        # never named an answer is a cancellation, whichever code it carried.
        if result != QDialog.DialogCode.Accepted:
            self._decision = ReleaseBlockerDecision()
        super().done(result)

    @override
    def apply_theme(self, theme: Theme) -> None:
        # The rows and the no-root sentence are words a user has to read before
        # answering, so they owe the 4.5:1 text token rather than the muted one
        # the surrounding card would otherwise give them.
        for label in self._toned:
            label.setStyleSheet(
                f"font-size:{theme.type.scale.sm}px;color:{theme.color.text_secondary};",
            )


@traces(SWR.SWR_3622)
def release_blocker_prompt(
    hold: ReleaseHold, parent: QWidget | None = None
) -> ReleaseBlockerDecision:
    """Raise the dialog for *hold* and answer with what the user chose.

    The default the controller installs, and the whole of its dependency on Qt:
    a test replaces this one callable and answers without a live modal.
    """
    dialog = ReleaseBlockersDialog(hold, parent)
    dialog.exec()
    decision = dialog.decision
    dialog.deleteLater()
    return decision
