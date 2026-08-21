"""What the requirements controller can use, when a view provides all of it.

`RequirementsController` reaches its view through signal-name tables and
`getattr` probes (SWR-3315), and that stays: a view may implement a subset, the
probes degrade, and `connected_signals` reports what was actually wired. The
design is right — a review pane and a minimal test fake are both first-class
without either declaring anything it does not have.

What it cost is that the contract — 19 signals and 9 members — was written
entirely in strings. A renamed member did not fail to compile; it failed to
connect, silently, and only a test noticed. mypy strict is already on in both
packages and can say so at the point of the rename instead.

So this is a **static** contract over a **dynamically** attached view. Nothing
imports it to constrain a caller: `attach_view` still takes a `QWidget`, because
narrowing it would throw away the degradation the seam exists for. The only thing
that consumes it is `_conforms` at the bottom of :mod:`rotaris.views.requirements`
— one function, whose entire job is to make mypy check the shipped view against
this list. Verified against both failure modes before it was written: renaming a
signal and renaming a method each become a type error.

Signals are declared as **read-only properties**. `Signal` is a descriptor whose
`__get__` resolves to `SignalInstance` on an instance, so a property member is the
accurate statement: the view exposes these to be connected to, and nothing
assigns to them.

Lives in ``models/`` because it is framework-free in the sense that matters —
it describes a shape, it does not build one — and because ``views/`` may import
``models/`` while the reverse would be a cycle.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Mapping

    from PySide6.QtCore import SignalInstance
    from PySide6.QtWidgets import QWidget

    from rotaris.models.requirements_state import (
        ActionFeedback,
        PassProgress,
        PendingAction,
        QueueState,
        RequirementDetail,
        RequirementsBoardState,
    )
    from rotaris.services.requirements_actions import MoveOption
    from rotaris.services.requirements_bridge import BoardDelta


@traces(SWR.SWR_3315)
class RequirementsBoardViewLike(Protocol):
    """The whole contract: every signal the controller connects, every member it probes.

    Deliberately not ``@runtime_checkable``, unlike the bridge's ports: nothing
    asks ``isinstance`` of this, and the decorator would advertise a check that is
    shallow anyway — it verifies attributes exist, not that they are signals of
    the right arity. The controller's runtime probing stays exactly as it was.
    """

    # ── the reading signals (RequirementsController.VIEW_SIGNALS) ──────────

    @property
    def refresh_requested(self) -> SignalInstance: ...
    @property
    def requirement_selected(self) -> SignalInstance: ...
    @property
    def requirement_activated(self) -> SignalInstance: ...
    @property
    def scroll_changed(self) -> SignalInstance: ...

    # ── the writing signals (RequirementsController.ACTION_SIGNALS) ────────

    @property
    def move_requested(self) -> SignalInstance: ...
    @property
    def action_requested(self) -> SignalInstance: ...
    @property
    def feedback_dismissed(self) -> SignalInstance: ...
    @property
    def edit_requested(self) -> SignalInstance: ...
    @property
    def create_requested(self) -> SignalInstance: ...
    @property
    def blocker_answered(self) -> SignalInstance: ...
    @property
    def open_file_requested(self) -> SignalInstance: ...
    @property
    def queue_requested(self) -> SignalInstance: ...
    @property
    def review_requested(self) -> SignalInstance: ...
    @property
    def blockers_requested(self) -> SignalInstance: ...
    @property
    def open_run_requested(self) -> SignalInstance: ...
    @property
    def open_commit_requested(self) -> SignalInstance: ...
    @property
    def adoption_requested(self) -> SignalInstance: ...
    @property
    def adoption_dismissed(self) -> SignalInstance: ...
    @property
    def verification_requested(self) -> SignalInstance: ...

    # ── state the controller pushes in ────────────────────────────────────

    def set_board(self, state: RequirementsBoardState, delta: BoardDelta | None = None) -> None: ...
    def set_actions(
        self,
        pending: tuple[PendingAction, ...],
        feedback: tuple[ActionFeedback, ...],
    ) -> None: ...
    def set_queue(self, queue: QueueState) -> None: ...
    def set_pass_progress(self, progress: PassProgress) -> None: ...
    def set_move_options(self, options: Mapping[str, tuple[MoveOption, ...]]) -> None: ...

    # ── navigation, and the panes the workflow slice attaches (SWR-3315) ──

    def show_detail(self, detail: RequirementDetail) -> None: ...
    def show_board(self) -> None: ...
    def show_pane(self, key: str) -> bool: ...
    def attach_pane(self, key: str, pane: QWidget) -> bool: ...
    @property
    def panes(self) -> tuple[str, ...]: ...
