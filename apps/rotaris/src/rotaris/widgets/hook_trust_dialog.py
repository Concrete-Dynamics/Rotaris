"""Reviewing and deciding on a workspace's lifecycle hooks (SWR-2701, SWR-2704).

A workspace declares its hooks in ``.rotaris/agents.yaml``, which is an ordinary
file inside a repository and therefore travels with a clone. Running them
without asking would mean cloning a repository is enough to execute its author's
shell commands, so the engine's trust gate holds them back until a verdict is
recorded — and this module is the one place a Rotaris user can read those
commands and give one.

Two rules shape it, and both are about the direction a mistake fails in:

* **The commands are rendered here and nowhere else.** The Hooks settings tab
  lists a workspace hook's name, event, matcher and scope; the command text is
  attacker-authored, so it appears only inside the dialog the user deliberately
  opened. ``skipped_hooks_notice`` already refuses to include it.
* **Closing without choosing is a refusal.** ``done`` is the funnel Qt routes
  ``accept``, ``reject``, Escape and the window close box through, so the
  default there is "do not trust". A security dialog that treated a dismissal
  as consent would be worse than no dialog.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, override

from PySide6.QtCore import Signal
from PySide6.QtWidgets import (
    QDialog,
    QDialogButtonBox,
    QLabel,
    QPlainTextEdit,
    QPushButton,
    QVBoxLayout,
)
from rotaris_core.reqtocode import SWR, traces

from rotaris.models.state import HookInfo, HookTrustSummary
from rotaris.theme import tokens
from rotaris.theme.manager import Themed

if TYPE_CHECKING:
    from pathlib import Path

    from PySide6.QtWidgets import QWidget

    from rotaris.theme.spec import Theme

__all__ = ["HookTrustDialog", "hook_trust_summary"]


@traces(SWR.SWR_2701, SWR.SWR_2704, SWR.SWR_2815)
def hook_trust_summary(config: Any, workspace: Path | str) -> HookTrustSummary:
    """The effective hook set for *workspace*, plus the verdict recorded on it.

    Never raises. Hooks are a convenience feature; a config the resolver cannot
    read must leave the settings tab empty, not take the window down. The
    returned rows carry the trust gate's own verdict per hook, so the tab can
    say *blocked* without deciding anything itself.
    """
    try:
        from rotaris_core.hooks.models import resolve_hooks
        from rotaris_core.hooks.trust import (
            load_trust,
            pending_trust_prompt,
            trusted_hooks_for_config,
            workspace_hook_digest,
        )

        declared = resolve_hooks(config)
        trusted = trusted_hooks_for_config(config, workspace)
    except Exception:  # noqa: BLE001 - an unreadable hook config is an empty tab.
        return HookTrustSummary(workspace=str(workspace))

    allowed_ids = {hook.hook_id for hook in trusted.allowed}
    rows = [_hook_info(hook, allowed=hook.hook_id in allowed_ids) for hook in declared]
    # Hooks the workspace list superseded and the refusal put back are not in
    # ``declared`` at all, but they do run, so a tab that omitted them would be
    # lying about what fires.
    rows.extend(_hook_info(hook, allowed=True) for hook in trusted.restored)

    workspace_hooks = tuple(hook for hook in declared if hook.source == "workspace")
    pending = tuple(
        _hook_info(hook, allowed=hook.hook_id in allowed_ids) for hook in workspace_hooks
    )
    if not workspace_hooks:
        status, digest = "none", ""
    else:
        digest = workspace_hook_digest(workspace_hooks)
        prompt = pending_trust_prompt(workspace, declared)
        if prompt is not None:
            status, digest = "review", prompt.digest
        else:
            decision = load_trust(workspace)
            status = "trusted" if decision is not None and decision.trusted else "refused"
    return HookTrustSummary(
        workspace=str(workspace),
        status=status,
        digest=digest,
        hooks=tuple(rows),
        pending=pending,
        notice=trusted.notice,
    )


def _hook_info(hook: Any, *, allowed: bool) -> HookInfo:
    return HookInfo(
        name=str(hook.name),
        event=str(hook.event),
        matcher=str(hook.matcher),
        source=str(hook.source),
        command=str(hook.command),
        allowed=allowed,
        required=bool(hook.required),
        timeout_seconds=float(hook.timeout_seconds),
    )


@traces(SWR.SWR_2701, SWR.SWR_2704, SWR.SWR_2815)
class HookTrustDialog(Themed, QDialog):
    """Shows a workspace's declared hook commands and takes an explicit verdict.

    Args:
        summary: The workspace, its pending hooks and the current verdict.
        parent: Qt parent.
    """

    #: ``True`` for allow, ``False`` for refuse. Emitted exactly once, on
    #: whichever exit path the dialog took — including Escape and the close box.
    decided = Signal(bool)

    def __init__(self, summary: HookTrustSummary, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._summary = summary
        self._decided = False
        self._trusted = False

        title = "Review this workspace's hooks"
        self.setWindowTitle(title)
        self.setModal(True)
        self.setMinimumSize(620, 440)
        self.setAccessibleName(title)
        self.setAccessibleDescription(
            "These shell commands are declared by this repository and run around "
            "agent activity. They do not run until you allow them."
        )

        space = tokens().space
        layout = QVBoxLayout(self)
        layout.setContentsMargins(space.xl, space[2.5], space.xl, space[2.5])
        layout.setSpacing(space.md)

        heading = QLabel(title)
        heading.setObjectName("heading")
        layout.addWidget(heading)

        count = len(summary.pending)
        noun = "hook" if count == 1 else "hooks"
        explanation = QLabel(
            f"{summary.workspace} declares {count} {noun} in .rotaris/agents.yaml. "
            f"Hooks are shell commands written by whoever wrote this repository, and "
            f"they run on your machine with your permissions. Allow them only if you "
            f"trust this repository. {summary.status_label}"
        )
        explanation.setWordWrap(True)
        explanation.setAccessibleName("Why this review is needed")
        layout.addWidget(explanation)

        self.hook_text = QPlainTextEdit(_hook_review_text(summary.pending))
        # Shell is read in mono everywhere else a user meets it; a proportional
        # face here would let a command look different from how it will run.
        self.hook_text.setProperty("mono", "true")
        self.hook_text.setReadOnly(True)
        self.hook_text.setAccessibleName("Workspace hook commands")
        self.hook_text.setAccessibleDescription(
            "The exact shell command each hook runs, with the event it fires on."
        )
        layout.addWidget(self.hook_text, 1)

        self.status_label = QLabel()
        self.status_label.setWordWrap(True)
        self.status_label.setVisible(False)
        self.status_label.setAccessibleName("Hook decision error")
        layout.addWidget(self.status_label)

        buttons = QDialogButtonBox()
        self.refuse_button = QPushButton("Do not run these hooks")
        self.refuse_button.setAccessibleName("Do not run these hooks")
        self.refuse_button.setAccessibleDescription(
            "Records a refusal. The hooks stay skipped until this repository changes them."
        )
        buttons.addButton(self.refuse_button, QDialogButtonBox.ButtonRole.RejectRole)
        self.refuse_button.clicked.connect(self.reject)

        self.allow_button = QPushButton("Allow these hooks")
        self.allow_button.setProperty("variant", "danger")
        self.allow_button.setAccessibleName("Allow these hooks")
        self.allow_button.setAccessibleDescription(
            "Lets this workspace run the shell commands above during every session."
        )
        buttons.addButton(self.allow_button, QDialogButtonBox.ButtonRole.DestructiveRole)
        self.allow_button.clicked.connect(self.accept)
        layout.addWidget(buttons)
        # Refusing is the safe answer, so it is what Enter and the initial focus
        # reach. Allowing takes a deliberate click.
        self.refuse_button.setDefault(True)
        self.refuse_button.setFocus()
        self.install_theme_hook()

    @property
    def trusted(self) -> bool:
        """Whether the user allowed the hooks. ``False`` until they say so."""
        return self._trusted

    def show_error(self, message: str) -> None:
        """Report that the verdict could not be written to disk."""
        self.status_label.setText(message)
        self.status_label.setVisible(True)

    @override
    def done(self, result: int) -> None:
        self._resolve(result == QDialog.DialogCode.Accepted)
        super().done(result)

    @override
    def closeEvent(self, event) -> None:  # type: ignore[no-untyped-def]  # noqa: N802
        # A dialog closed before it was ever shown never reaches ``done``. The
        # refusal is settled here as well, because a security dialog dismissed
        # without an answer must not read as trust.
        self._resolve(False)
        super().closeEvent(event)

    def _resolve(self, trusted: bool) -> None:
        """Record the verdict exactly once, on whichever path got here first."""
        if self._decided:
            return
        self._decided = True
        self._trusted = trusted
        self.decided.emit(trusted)

    @override
    def apply_theme(self, theme: Theme) -> None:
        # The one line the application stylesheet cannot reach: a failure
        # message, painted as words, so it owes the 4.5:1 text token rather
        # than the saturated one a status dot may use.
        self.status_label.setStyleSheet(
            f"font-size:{theme.type.scale.sm}px;color:{theme.color.fail_text};"
        )


def _hook_review_text(hooks: tuple[HookInfo, ...]) -> str:
    if not hooks:
        return "This workspace declares no hooks."
    blocks: list[str] = []
    for hook in hooks:
        matcher = hook.matcher or "every tool call"
        required = "blocks the tool call on failure" if hook.required else "advisory"
        blocks.append(
            f"{hook.name}\n"
            f"  event    {hook.event}\n"
            f"  matches  {matcher}\n"
            f"  timeout  {hook.timeout_seconds:g}s ({required})\n"
            f"  command  {hook.command}",
        )
    return "\n\n".join(blocks)
