"""The delivery queue: what runs now, what runs next, and what holds the rest.

Autonomous scheduling that cannot be seen or stopped is not a feature, it is a
risk (SWR-3608). This surface answers the two questions a user actually has —
*what will run next* and *how do I hold it* — and it answers them from the
scheduler's own decision rather than from an order composed here.

Four properties carry the requirement:

- **The order is the scheduler's.** :class:`RequirementQueueView` renders
  :attr:`~rotaris.models.requirements_state.QueueState.ready` in the position
  the scheduler assigned and never re-sorts it (SWR-3311). A queue this module
  ordered would be a queue no scheduler agreed to, which is exactly the first
  acceptance criterion's failure.
- **Every hold names its reason.** A held candidate carries the engine's own
  stated reason and whatever it waits for
  (:class:`~rotaris_core.requirements.execution.scheduler.Hold`), because "why
  is nothing running" is the question the queue exists to answer.
- **Stopping holds the queue, it does not cancel work.** The stop control says
  so before it is used and the summary says so afterwards; the runs in flight
  are untouched, which is why
  :attr:`~rotaris.models.requirements_state.QueueState.stopped` is a fact of its
  own rather than an empty queue.
- **The limit is enforced, not displayed.** A concurrency change goes through
  :class:`SchedulingControls`, which writes the workspace's own
  ``requirements.scheduling`` block (SWR-3117) *and* produces the
  :class:`~rotaris_core.requirements.execution.scheduler.SchedulerLimits` the
  next scheduling pass runs with. The queue panel then shows the new limit
  because the scheduler has it, not the other way round.

Holding an individual requirement is the engine's ``Blocked`` state with a
stated reason (SWR-3201), taken through the board's single write path
(SWR-3609): nothing is scheduled for a blocked requirement, which is the
consequence :class:`~rotaris.services.requirements_actions.BoardAction.HOLD`
already names.

Nothing about a *run* is rebuilt here (SWR-3612): a running unit opens its
session in the Workspace view and its branch in Git.
"""

from __future__ import annotations

from dataclasses import replace
from typing import TYPE_CHECKING

from PySide6.QtCore import QObject, Qt, Signal
from PySide6.QtWidgets import (
    QFrame,
    QHBoxLayout,
    QLabel,
    QScrollArea,
    QSpinBox,
    QVBoxLayout,
    QWidget,
)
from rotaris_core.reqtocode import SWR, traces

from rotaris.models.requirements_state import QueueState
from rotaris.services.requirements_actions import BLOCKED, BoardAction, resume_column
from rotaris.theme import tokens
from rotaris.theme.manager import Themed
from rotaris.theme.semantics import delivery_color
from rotaris.widgets.cards import Card, KpiCard, make_button
from rotaris.widgets.feedback import EmptyState
from rotaris.widgets.hold_reason import HOLD_REASON_REQUIRED, HoldReasonBar
from rotaris.widgets.meters import StatusDot, ToggleSwitch
from rotaris.widgets.patterns import ContentColumn, DetailPageHeader, SectionHeader

if TYPE_CHECKING:
    from pathlib import Path

    from PySide6.QtGui import QKeyEvent
    from rotaris_core.config.schema import RequirementSchedulingConfig
    from rotaris_core.requirements.execution.scheduler import SchedulerLimits

    from rotaris.models.requirements_state import QueueCandidate, QueueRun
    from rotaris.models.store import WorkspaceStore
    from rotaris.services.requirements_actions import ActionOutcome
    from rotaris.services.requirements_controller import RequirementsController
    from rotaris.theme.spec import Theme

__all__ = [
    "AUTOMATIC_NOTE",
    "CONTROL_AUTOMATIC",
    "CONTROL_CONCURRENCY",
    "CONTROL_START",
    "CONTROL_STOP",
    "HOLD_REASON_REQUIRED",
    "MAX_CONCURRENCY",
    "QUEUE_CONTROLS",
    "QUEUE_PANE",
    "STOP_NOTE",
    "QueueControls",
    "RequirementQueueView",
    "SchedulingControls",
    "attach_queue",
    "load_scheduling_limits",
    "open_queue",
]

#: The key the queue surface is attached under (SWR-3315).
QUEUE_PANE = "queue"

#: The scheduler-level controls SWR-3608 asks for. A closed set, so a surface
#: cannot grow a control that nothing applies and nothing persists.
CONTROL_AUTOMATIC = "automatic"
CONTROL_CONCURRENCY = "concurrency"
CONTROL_STOP = "stop"
CONTROL_START = "start"
QUEUE_CONTROLS: tuple[str, ...] = (
    CONTROL_AUTOMATIC,
    CONTROL_CONCURRENCY,
    CONTROL_STOP,
    CONTROL_START,
)

#: The two controls that outlive the session, and therefore reach the workspace
#: configuration (SWR-3117). A stop is deliberately not one of them: it is a
#: decision about *now*, and a Rotaris that started up stopped would be a Rotaris
#: nobody could explain.
PERSISTED_CONTROLS: frozenset[str] = frozenset({CONTROL_AUTOMATIC, CONTROL_CONCURRENCY})

#: What turning automatic scheduling on means, stated where it is turned on.
AUTOMATIC_NOTE = (
    "Rotaris starts the next candidate itself as capacity frees up. Off, nothing "
    "starts until you release it."
)

#: What the stop control promises, stated before it is used and after.
STOP_NOTE = (
    "Stopping the queue starts nothing new. Work already in flight keeps running "
    "and finishes normally."
)

#: What the panel says when the scheduler has nothing at all.
EMPTY_QUEUE = "Nothing is queued and nothing is running."
EMPTY_QUEUE_HINT = (
    "Release a requirement for implementation, or turn on automatic scheduling, "
    "and what runs next appears here."
)

#: An upper bound on the spin box rather than on the scheduler: the control has
#: to have one, and a limit a machine cannot serve is a limit nobody wants.
MAX_CONCURRENCY = 64

_SCHEDULING_KEYS = ("requirements", "scheduling")


# ── the limits, as configuration and as the scheduler reads them ───────────


@traces(SWR.SWR_3608, SWR.SWR_3117)
def load_scheduling_limits(workspace: Path | None) -> SchedulerLimits:
    """The scheduling limits this workspace is configured with (SWR-3117).

    Read from the workspace's own ``requirements.scheduling`` block. A workspace
    that configures nothing gets the schema's documented defaults — manual
    scheduling — rather than an invented one, and a file that cannot be read or
    does not validate degrades to those defaults instead of raising on the Qt
    thread.
    """
    from rotaris_core.requirements.execution.scheduler import SchedulerLimits

    block = _read_block(workspace)
    return SchedulerLimits(
        concurrency=block.max_concurrent_units,
        automatic=block.mode == "automatic",
    )


@traces(SWR.SWR_3210, SWR.SWR_3117)
def load_evaluation_policy(workspace: Path | None) -> tuple[int, tuple[str, ...]]:
    """``(debounce_ms, triggers)`` for this workspace's re-evaluation (SWR-3210).

    Read from its own ``requirements.refresh`` block, and returned as plain
    values rather than as engine types so the controller can hold the policy
    without importing the delivery package at construction time.

    A workspace that configures nothing gets the schema's documented defaults —
    400 ms and every trigger — and one whose block cannot be read gets them too,
    rather than a guess at what was meant.
    """
    from rotaris_core.config.schema import RequirementRefreshConfig

    current: object = _read_yaml(_config_path(workspace))
    for key in ("requirements", "refresh"):
        current = current.get(key, {}) if isinstance(current, dict) else {}
    try:
        block = RequirementRefreshConfig.model_validate(current or {})
    except ValueError:
        block = RequirementRefreshConfig()
    return block.debounce_ms, tuple(str(trigger) for trigger in block.triggers)


def _config_path(workspace: Path | None) -> Path | None:
    """Where this workspace keeps its configuration, or ``None`` without one."""
    return None if workspace is None else workspace / ".rotaris" / "agents.yaml"


def _read_block(workspace: Path | None) -> RequirementSchedulingConfig:
    from rotaris_core.config.schema import RequirementSchedulingConfig

    current: object = _read_yaml(_config_path(workspace))
    for key in _SCHEDULING_KEYS:
        current = current.get(key, {}) if isinstance(current, dict) else {}
    try:
        return RequirementSchedulingConfig.model_validate(current or {})
    except ValueError:
        # A block Rotaris cannot read is a block the next load would reject too;
        # the honest answer is the documented default, not a guess at what was
        # meant (SWR-3117).
        return RequirementSchedulingConfig()


def _read_yaml(path: Path | None) -> dict[str, object]:
    import yaml

    if path is None or not path.exists():
        return {}
    try:
        loaded = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError):
        return {}
    return loaded if isinstance(loaded, dict) else {}


@traces(SWR.SWR_3608, SWR.SWR_3117)
class SchedulingControls:
    """Applies a queue control to the scheduler's limits, and persists it.

    The seam SWR-3608 asks for in one object: the value the next scheduling pass
    runs with (:attr:`limits`) and the file the next launch reads it from are
    changed together, so "takes effect without a restart" and "is persisted in
    the configuration" cannot come apart.

    Without a workspace it still works and simply persists nothing — a board
    opened on a directory Rotaris cannot write is still a board whose queue can
    be stopped.
    """

    def __init__(
        self,
        workspace: Path | None = None,
        *,
        limits: SchedulerLimits | None = None,
    ) -> None:
        self._path = _config_path(workspace)
        self._limits = limits if limits is not None else load_scheduling_limits(workspace)

    @property
    def limits(self) -> SchedulerLimits:
        """What the scheduler runs with right now."""
        return self._limits

    @property
    def path(self) -> Path | None:
        """The configuration file these controls are persisted to."""
        return self._path

    @traces(SWR.SWR_3608)
    def apply(self, control: str, value: str = "") -> SchedulerLimits:
        """Apply one queue control and answer with the limits that now hold.

        An unknown control changes nothing and says so by returning the limits
        unchanged: hold and release are the *board's* actions (SWR-3201), not the
        scheduler's, and routing them through here would write a delivery state
        from a scheduling control.
        """
        from rotaris_core.requirements.execution.scheduler import SchedulerLimits

        fields = self._limits.model_dump()
        if control == CONTROL_AUTOMATIC:
            fields["automatic"] = _flag(value)
        elif control == CONTROL_CONCURRENCY:
            fields["concurrency"] = _bounded(value, self._limits.concurrency)
        elif control in {CONTROL_STOP, CONTROL_START}:
            fields["stopped"] = control == CONTROL_STOP
        else:
            return self._limits
        self._limits = SchedulerLimits.model_validate(fields)
        if control in PERSISTED_CONTROLS:
            self.persist()
        return self._limits

    @traces(SWR.SWR_3117)
    def persist(self) -> Path | None:
        """Write the persisted half of the limits into the workspace config.

        Field-wise, into whatever the file already holds: the requirements block
        carries a dozen settings this surface knows nothing about, and rewriting
        the file from the two values a queue panel owns would delete them.
        """
        import yaml
        from rotaris_core.fs import atomic_write

        path = self._path
        if path is None:
            return None
        payload = _read_yaml(path)
        block: dict[str, object] = payload
        for key in _SCHEDULING_KEYS:
            nested = block.get(key)
            if not isinstance(nested, dict):
                nested = {}
                block[key] = nested
            block = nested
        block["mode"] = "automatic" if self._limits.automatic else "manual"
        block["max_concurrent_units"] = self._limits.concurrency
        path.parent.mkdir(parents=True, exist_ok=True)
        atomic_write(path, yaml.safe_dump(payload, sort_keys=False, allow_unicode=True))
        return path


def _flag(value: str) -> bool:
    """``on``/``true``/``1`` — anything else is off, including an empty string."""
    return value.strip().casefold() in {"on", "true", "1", "yes"}


def _bounded(value: str, fallback: int) -> int:
    """A concurrency the scheduler will accept, or the one already in force."""
    token = value.strip()
    if not token.isdigit():
        return fallback
    return max(1, min(MAX_CONCURRENCY, int(token)))


# ── the surface ────────────────────────────────────────────────────────────


@traces(SWR.SWR_3608, SWR.SWR_3612)
class RequirementQueueView(Themed, QWidget):
    """What is running, what is next, what is held — and the controls for it."""

    #: ``(control, value)`` — one of :data:`QUEUE_CONTROLS`.
    control_requested = Signal(str, str)
    #: ``(req_id, reason)`` — hold this requirement, for the stated reason.
    hold_requested = Signal(str, str)
    #: Release a held requirement back to the state it was held in (SWR-3201).
    release_requested = Signal(str)
    #: A running unit's session, to be focused in the Workspace view (SWR-3612).
    open_run_requested = Signal(str)
    #: A branch the user wants to see in the Git view (SWR-3612).
    open_commit_requested = Signal(str)
    close_requested = Signal()

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._queue = QueueState()
        self._syncing = False
        self._rows: list[QWidget] = []
        #: Each list card's counted kicker and the layout its rows go into.
        self._sections: dict[Card, SectionHeader] = {}
        self._row_slots: dict[Card, QVBoxLayout] = {}
        self.setObjectName("requirementQueue")
        self.setAccessibleName("Delivery queue")

        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(10)

        page = QWidget()
        column = QVBoxLayout(page)
        column.setContentsMargins(0, 0, 0, 0)
        column.setSpacing(10)

        self.header = DetailPageHeader("Delivery queue")
        self.header.back_button.setAccessibleName("Back to the requirement board")
        self.header.back_requested.connect(self.close_requested)
        # Kept under the names this panel published before it took the shared
        # header: the accessibility sweep and the scheduling tests reach for
        # them, and the widgets behind them do the same jobs.
        self.back_button = self.header.back_button
        self.title = self.header.title_label
        self.summary = self.header.subtitle_label
        self.summary.setAccessibleName("Queue summary")
        column.addWidget(self.header)

        column.addWidget(self._build_stats())
        column.addWidget(self._build_controls())

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.Shape.NoFrame)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        scroll.setAccessibleName("Queue contents")
        self.scroll_area = scroll
        body = QWidget()
        self._body = QVBoxLayout(body)
        self._body.setContentsMargins(0, 0, 0, 0)
        self._body.setSpacing(10)
        self.running_card = self._list_card("Running now", "queueRunning")
        self.next_card = self._list_card("Next up", "queueNext")
        self.held_card = self._list_card("Held back", "queueHeld")
        self._body.addStretch(1)
        scroll.setWidget(body)
        column.addWidget(scroll, 1)
        root.addWidget(ContentColumn(page), 1)
        self._render()
        self.install_theme_hook()

    def apply_theme(self, theme: Theme) -> None:
        """Redraw the three lists, whose rows carry their text style inline."""
        del theme  # each row re-reads the tokens it is painted with
        self._render()

    # ── construction ──────────────────────────────────────────────────────

    def _list_card(self, title: str, object_name: str) -> Card:
        """One section of the queue: a counted kicker over its own rows.

        The card is built without a kicker of its own and given a
        :class:`~rotaris.widgets.patterns.SectionHeader` instead, because the
        number beside the kicker — ``NEXT UP · 3`` — is the one thing a reader
        checks this section for, and a count crammed into the uppercased kicker
        stops being data.
        """
        card = Card()
        card.setObjectName(object_name)
        card.setAccessibleName(title)
        section = SectionHeader(title)
        card.header_row.insertWidget(0, section)
        rows = QVBoxLayout()
        rows.setContentsMargins(0, 0, 0, 0)
        card.body.addLayout(rows)
        # Carried on the card rather than in a parallel dict: whatever holds a
        # card already holds the two things that fill it.
        self._sections[card] = section
        self._row_slots[card] = rows
        self._body.addWidget(card)
        return card

    @traces(SWR.SWR_3608)
    def _build_stats(self) -> QWidget:
        """The three counts the summary sentence otherwise runs together.

        `0 running · nothing queued · 0 held · limit 2` is a sentence a reader
        has to parse; the same four facts as tiles are read at a glance. The
        sentence stays — it is what a screen reader hears and what the header
        carries — but it is no longer the only way to learn the numbers.
        """
        strip = QWidget()
        strip.setAccessibleName("Queue counts")
        row = QHBoxLayout(strip)
        row.setContentsMargins(0, 0, 0, 0)
        row.setSpacing(10)
        self.running_stat = KpiCard("Running")
        self.queued_stat = KpiCard("Queued")
        self.held_stat = KpiCard("Held")
        for stat in (self.running_stat, self.queued_stat, self.held_stat):
            row.addWidget(stat, 1)
        return strip

    def _build_controls(self) -> QWidget:
        card = Card("Scheduling")
        card.setObjectName("queueControls")
        card.setAccessibleName("Scheduling controls")

        # The stop control rides the card's own header row rather than the
        # first line of its body. It acts on everything under this card, and a
        # control that sat inside the body read as belonging to the switch
        # beside it — which it does not.
        self.stop_button = make_button("Stop the queue", "secondary")
        self.stop_button.setAccessibleName("Stop the queue")
        self.stop_button.setAccessibleDescription(STOP_NOTE)
        self.stop_button.setToolTip(STOP_NOTE)
        self.stop_button.clicked.connect(self._toggle_stopped)
        card.add_header_widget(self.stop_button)

        # Two rows rather than one. The automatic-scheduling control and its
        # sentence alone ask for ~445 points and neither elides; with the limit
        # controls beside them the card demanded 1041 — wider than the whole
        # supported 1000×680 window, which made the *board* unusable there the
        # moment this pane was installed beside it (SWR-3302, SWR-3608).
        # The design system's switch, and the settings view's own pairing for
        # it: the words on the left, the control on the right, the consequence
        # underneath. This is a mode that stays on and starts work by itself,
        # which is what a switch means here and what a check box does not.
        switches = QHBoxLayout()
        switches.setSpacing(8)
        copy = QVBoxLayout()
        copy.setSpacing(2)
        self.automatic_label = QLabel("Schedule requirements automatically")
        self.automatic_label.setWordWrap(True)
        copy.addWidget(self.automatic_label)
        self.automatic_hint = QLabel(AUTOMATIC_NOTE)
        self.automatic_hint.setObjectName("muted")
        self.automatic_hint.setWordWrap(True)
        copy.addWidget(self.automatic_hint)
        switches.addLayout(copy, 1)
        self.automatic = ToggleSwitch()
        self.automatic.setAccessibleName("Schedule requirements automatically")
        self.automatic.setAccessibleDescription(AUTOMATIC_NOTE)
        self.automatic.toggled.connect(self._automatic_toggled)
        switches.addWidget(self.automatic, 0, Qt.AlignmentFlag.AlignVCenter)
        card.body.addLayout(switches)

        limits = QHBoxLayout()
        limits.setSpacing(8)
        limit_label = QLabel("Units at once")
        limit_label.setObjectName("muted")
        limits.addWidget(limit_label)
        self.concurrency = QSpinBox()
        self.concurrency.setRange(1, MAX_CONCURRENCY)
        self.concurrency.setAccessibleName("Units running at once")
        self.concurrency.setAccessibleDescription(
            "How many execution units may be in flight across all requirements.",
        )
        limits.addWidget(self.concurrency)
        self.apply_button = make_button("Apply limit", "secondary")
        self.apply_button.setAccessibleName("Apply the concurrency limit")
        self.apply_button.clicked.connect(self._apply_limit)
        limits.addWidget(self.apply_button)
        limits.addStretch(1)
        card.body.addLayout(limits)

        note = QLabel(STOP_NOTE)
        note.setObjectName("muted")
        note.setWordWrap(True)
        note.setAccessibleName(STOP_NOTE)
        card.body.addWidget(note)

        card.body.addWidget(self._build_hold_bar())
        return card

    def _build_hold_bar(self) -> QWidget:
        """The shared reason strip (SWR-3201), mounted in this panel.

        The board mounts the same widget. Two surfaces asking the same question
        two ways is how one of them ends up not asking it at all, which is the
        defect this replaced.
        """
        bar = HoldReasonBar()
        bar.confirmed.connect(self.hold_requested.emit)
        # Kept under the names the panel published before the strip was
        # extracted: they are what the accessibility tests reach for, and the
        # widgets behind them are the same widgets.
        self.hold_bar = bar
        self.hold_reason = bar.reason
        self.hold_confirm = bar.confirm
        self.hold_cancel = bar.cancel
        return bar

    # ── what is on screen ─────────────────────────────────────────────────

    @property
    def queue(self) -> QueueState:
        """The queue this view was last given."""
        return self._queue

    @property
    def holding(self) -> str:
        """The requirement whose hold reason is being asked for, if any."""
        return self.hold_bar.holding

    @traces(SWR.SWR_3608, SWR.SWR_3311)
    def set_queue(self, queue: QueueState) -> None:
        """Show *queue* exactly as the scheduler decided it — order included."""
        self._queue = queue
        holding = self.hold_bar.holding
        if holding and not any(candidate.req_id == holding for candidate in queue.candidates):
            self.cancel_hold()
        self._render()

    def _render(self) -> None:
        queue = self._queue
        self.header.set_subtitle(queue.summary)
        self.summary.setAccessibleName(queue.summary)
        self._syncing = True
        self.automatic.setChecked(queue.automatic)
        self.concurrency.setValue(max(1, queue.concurrency_limit or 1))
        self._syncing = False
        stopped = queue.stopped
        self.stop_button.setText("Start the queue" if stopped else "Stop the queue")
        self.stop_button.setAccessibleName("Start the queue" if stopped else "Stop the queue")
        self._render_stats(queue)
        self._clear_rows()
        self._fill(
            self.running_card,
            [self._running_row(run) for run in queue.running],
            "Nothing is running right now.",
            hint="A unit that starts appears here while it runs.",
            tone="live",
        )
        self._fill(
            self.next_card,
            [self._candidate_row(candidate) for candidate in queue.ready],
            EMPTY_QUEUE if queue.empty else "Every candidate is held back.",
            hint=EMPTY_QUEUE_HINT if queue.empty else "Release one below and it queues again.",
        )
        self._fill(
            self.held_card,
            [self._held_row(candidate) for candidate in queue.held],
            "Nothing is held back.",
            hint="A held candidate states the reason it waits.",
        )
        self.setAccessibleDescription(
            queue.summary if not queue.empty else f"{EMPTY_QUEUE} {EMPTY_QUEUE_HINT}",
        )

    def _render_stats(self, queue: QueueState) -> None:
        """The three counts, and what the running one is measured against."""
        limit = queue.concurrency_limit
        self.running_stat.set_value(str(len(queue.running)), f"of {limit}" if limit else "")
        self.queued_stat.set_value(str(len(queue.ready)))
        self.held_stat.set_value(str(len(queue.held)))

    def _clear_rows(self) -> None:
        for row in self._rows:
            row.setParent(None)
            row.deleteLater()
        self._rows = []

    def _fill(
        self,
        card: Card,
        rows: list[QWidget],
        empty_message: str,
        *,
        hint: str = "",
        tone: str = "neutral",
    ) -> None:
        """Put *rows* under *card*, or say - as a state, not a blank - why there are none."""
        section = self._sections[card]
        slot = self._row_slots[card]
        slot.setSpacing(0)
        section.set_datum(str(len(rows)), tone if rows and tone == "live" else "neutral")
        if not rows:
            # A dashed empty state rather than a grey sentence: a section with
            # nothing in it must not read as a section that failed to draw, and
            # the hint is the invitation to act that a blank line is not.
            state = EmptyState(empty_message, hint, compact=True)
            card.setAccessibleDescription(f"{empty_message} {hint}".strip())
            slot.addWidget(state)
            self._rows.append(state)
            return
        card.setAccessibleDescription(
            ". ".join(row.accessibleName() for row in rows if row.accessibleName()),
        )
        for index, row in enumerate(rows):
            if index:
                # A hairline between rows, not padding: these are strips of one
                # kind of thing, and the rule is what says where one unit ends.
                slot.addWidget(self._separator())
            slot.addWidget(row)
            self._rows.append(row)

    def _separator(self) -> QFrame:
        line = QFrame()
        line.setProperty("role", "divider")
        line.setFixedHeight(tokens().size.hairline)
        self._rows.append(line)
        return line

    def _row(
        self,
        text: str,
        *,
        mono: bool = False,
        state: str = "",
        pulse: bool = False,
    ) -> tuple[QWidget, QHBoxLayout]:
        """One strip of the queue: what it is, then what can be done to it.

        *state* is a delivery state name, and the dot it paints is the strip's
        one graphic. It says nothing on its own - the sentence beside it names
        the state in words, which is what a dot's colour is never allowed to
        carry alone (SWR-3304).
        """
        t = tokens()
        row = QWidget()
        row.setAccessibleName(text)
        layout = QHBoxLayout(row)
        layout.setContentsMargins(0, t.space.xs, 0, t.space.xs)
        layout.setSpacing(t.space.sm)
        if state:
            dot = StatusDot()
            dot.set_state(str(delivery_color(state)), pulse, label=text)
            layout.addWidget(dot, 0, Qt.AlignmentFlag.AlignVCenter)
        label = QLabel(text)
        label.setWordWrap(True)
        label.setAccessibleName(text)
        label.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        # The mono face is the application stylesheet's, reached by property
        # rather than restated here, so a theme with another mono stack is
        # followed without this row holding a family of its own.
        label.setProperty("mono", "true" if mono else "false")
        label.setStyleSheet(f"font-size:{t.type.scale.xs}px;color:{t.color.text_secondary};")
        layout.addWidget(label, 1)
        return row, layout

    @traces(SWR.SWR_3612, SWR.SWR_3623)
    def _running_row(self, run: QueueRun) -> QWidget:
        """One run in flight, and the surfaces that already own it (SWR-3612)."""
        text = run.sentence + (" — interrupted by a restart" if run.interrupted else "")
        # A restarted run is not breathing, whatever its record says (SWR-3611):
        # the pulse is the one thing on this page that claims something is
        # happening right now, so it stops the moment that stops being true. A
        # run blocked on the user is the same case for the same reason — it is
        # not working, it is waiting for them (SWR-3623).
        working = not run.interrupted and not run.awaiting_input
        row, layout = self._row(text, state="running", pulse=working)
        if run.session_id:
            # Named for what the user would do next. "Open run" is right for a
            # run that is working and wrong for one that is waiting: the queue
            # is where they find out, and the verb is the whole point of the row.
            button = make_button("Answer" if run.awaiting_input else "Open run", "ghost")
            button.setAccessibleName(
                f"Answer {run.run_id} in the Workspace view"
                if run.awaiting_input
                else f"Open the session of {run.run_id} in the Workspace view"
            )
            session = run.session_id
            button.clicked.connect(
                lambda _=False, target=session: self.open_run_requested.emit(target)
            )
            layout.addWidget(button)
        if run.branch:
            button = make_button("Open in Git", "ghost")
            button.setAccessibleName(f"Open {run.branch} in the Git view")
            branch = run.branch
            button.clicked.connect(
                lambda _=False, target=branch: self.open_commit_requested.emit(target),
            )
            layout.addWidget(button)
        return row

    def _candidate_row(self, candidate: QueueCandidate) -> QWidget:
        row, layout = self._row(candidate.sentence, state="ready")
        button = make_button("Hold", "ghost")
        button.setAccessibleName(f"Hold {candidate.req_id}")
        button.setAccessibleDescription(BoardAction.HOLD.consequence)
        button.setToolTip(BoardAction.HOLD.consequence)
        req_id = candidate.req_id
        button.clicked.connect(lambda _=False, target=req_id: self.begin_hold(target))
        layout.addWidget(button)
        return row

    def _held_row(self, candidate: QueueCandidate) -> QWidget:
        row, layout = self._row(candidate.sentence, state="blocked")
        button = make_button("Release", "ghost")
        button.setAccessibleName(f"Release {candidate.req_id}")
        button.setAccessibleDescription(BoardAction.RESUME.consequence)
        button.setToolTip(BoardAction.RESUME.consequence)
        req_id = candidate.req_id
        button.clicked.connect(lambda _=False, target=req_id: self.release_requested.emit(target))
        layout.addWidget(button)
        return row

    # ── the controls (SWR-3608) ───────────────────────────────────────────

    def _automatic_toggled(self, checked: bool) -> None:
        if self._syncing:
            # The queue was pushed in; echoing it back as a control would ask the
            # scheduler to apply the state it just reported.
            return
        self.control_requested.emit(CONTROL_AUTOMATIC, "on" if checked else "off")

    def _apply_limit(self) -> None:
        self.control_requested.emit(CONTROL_CONCURRENCY, str(self.concurrency.value()))

    def _toggle_stopped(self) -> None:
        self.control_requested.emit(CONTROL_START if self._queue.stopped else CONTROL_STOP, "")

    @traces(SWR.SWR_3608, SWR.SWR_3201)
    def begin_hold(self, req_id: str) -> None:
        """Ask for the reason a hold needs before it can be taken (SWR-3201)."""
        self.hold_bar.ask(req_id)

    def cancel_hold(self) -> None:
        """Take back a hold nobody stated a reason for."""
        self.hold_bar.dismiss()

    @traces(SWR.SWR_3314)
    def keyPressEvent(self, event: QKeyEvent) -> None:  # noqa: N802 — Qt's spelling
        """Escape takes back an unconfirmed hold, then closes the surface."""
        if event.key() == Qt.Key.Key_Escape:
            if self.hold_bar.holding:
                self.cancel_hold()
            else:
                self.close_requested.emit()
            event.accept()
            return
        super().keyPressEvent(event)


# ── wiring (SWR-3315) ──────────────────────────────────────────────────────


@traces(SWR.SWR_3608, SWR.SWR_3609)
class QueueControls(QObject):
    """Applies what the queue panel asks for, and publishes what came of it.

    Two different kinds of instruction arrive here and they are deliberately not
    merged. A *scheduler* control — automatic, the limit, stop and start — is
    applied by :class:`SchedulingControls` and reflected immediately, because
    SWR-3608 requires it to take effect without a restart. A *requirement* hold
    is a delivery state change and goes through the board's one write path
    (SWR-3609), which is what makes it attributed, recorded and refusable.

    Only the three control flags are updated locally. The order of the
    candidates and the reason behind every hold stay the scheduler's until it
    publishes its next decision (SWR-3311): a panel that re-ordered its own queue
    after a limit change would be showing a schedule nobody decided.
    """

    #: The :class:`~rotaris.services.requirements_actions.ActionOutcome` of a
    #: hold or a release, so a surface can state what the engine answered.
    decided = Signal(object)

    def __init__(
        self,
        controller: RequirementsController,
        store: WorkspaceStore,
        scheduling: SchedulingControls,
        parent: QObject | None = None,
    ) -> None:
        super().__init__(parent if parent is not None else controller)
        self._controller = controller
        self._store = store
        self._scheduling = scheduling

    @property
    def scheduling(self) -> SchedulingControls:
        """The limits these controls apply and persist."""
        return self._scheduling

    @traces(SWR.SWR_3608)
    def apply(self, control: str, value: str = "") -> QueueState:
        """Apply one scheduler control and publish the queue it produces."""
        # Raised first, so whatever owns a live scheduler hears the instruction
        # even when this desktop is not the thing that will act on it.
        self._controller.control_queue(control, value)
        current = self._store.requirements.queue
        if control not in QUEUE_CONTROLS:
            return current
        limits = self._scheduling.apply(control, value)
        published = replace(
            current,
            automatic=limits.automatic,
            concurrency_limit=limits.concurrency,
            stopped=limits.stopped,
        )
        self._controller.set_queue(published)
        return published

    @traces(SWR.SWR_3608, SWR.SWR_3201, SWR.SWR_3609)
    def hold(self, req_id: str, reason: str) -> ActionOutcome | None:
        """Block *req_id* with the user's stated reason (SWR-3201).

        Through :class:`~rotaris.services.requirements_actions.RequirementActions`
        rather than the controller's generic entry, because a ``Blocked``
        transition without a reason is refused by the engine and the controller's
        ``perform_action`` carries none.
        """
        actions = self._controller.actions
        if actions is None:
            return self._controller.perform_action(str(BoardAction.HOLD), req_id, reason)
        outcome = actions.hold(req_id, source=self._state_of(req_id), reason=reason)
        self.decided.emit(outcome)
        if outcome.accepted:
            self._controller.refresh()
        return outcome

    @traces(SWR.SWR_3608, SWR.SWR_3201)
    def release(self, req_id: str) -> ActionOutcome | None:
        """Return a held requirement to the state it is released to (SWR-3201)."""
        outcome = self._controller.move_requirement(req_id, BLOCKED, self._release_to(req_id))
        if outcome is not None:
            self.decided.emit(outcome)
        return outcome

    def _state_of(self, req_id: str) -> str:
        card = self._store.requirements.card(req_id)
        return card.delivery if card is not None else ""

    def _release_to(self, req_id: str) -> str:
        """Where this hold is cleared to — the engine's answer, not the record's.

        A requirement held *while a run was in flight* is released to ``Ready``,
        because a person may not put one back into ``Running`` (SWR-3203). Aiming
        this at the raw ``blocked_from`` would make Release a button the engine
        refuses every time it is pressed — and Hold is offered on exactly the
        candidates a run is about to start for.
        """
        card = self._store.requirements.card(req_id)
        return resume_column(card.blocked_from if card is not None else "") or "ready"


@traces(SWR.SWR_3315, SWR.SWR_3608)
def attach_queue(
    controller: RequirementsController,
    store: WorkspaceStore,
    *,
    scheduling: SchedulingControls | None = None,
    workspace: Path | None = None,
    pane: RequirementQueueView | None = None,
) -> RequirementQueueView:
    """Build the queue surface and wire it into the requirements area.

    Registered through :meth:`~rotaris.services.requirements_controller
    .RequirementsController.attach_pane` and fed by the store's own queue signal,
    so the panel follows the scheduler's clock rather than the board's
    (SWR-3608) and ``views/main_window.py`` never learns it exists.
    """
    surface = pane if pane is not None else RequirementQueueView()
    limits = scheduling if scheduling is not None else SchedulingControls(workspace)
    controls = QueueControls(controller, store, limits)
    # The controls decide what may start, not only what the panel prints
    # (SWR-3608): a stop that the run starter never learned about would be a
    # control the product reads back to the user and then ignores.
    controller.follow_scheduling(limits)
    controller.attach_pane(QUEUE_PANE, surface)
    surface.control_requested.connect(controls.apply)
    surface.hold_requested.connect(controls.hold)
    surface.release_requested.connect(controls.release)
    surface.open_run_requested.connect(controller.open_run)
    surface.open_commit_requested.connect(controller.open_commit)
    store.requirements_queue_changed.connect(surface.set_queue)
    view = controller.view
    show_board = getattr(view, "show_board", None) if view is not None else None
    if callable(show_board):
        surface.close_requested.connect(show_board)
    # The limits the workspace is configured with are the queue's own facts until
    # the scheduler publishes its first decision (SWR-3117): a panel that opened
    # showing "limit unset" would be reporting a limit the engine does not have.
    surface.set_queue(
        replace(
            store.requirements.queue,
            automatic=limits.limits.automatic,
            concurrency_limit=limits.limits.concurrency,
            stopped=limits.limits.stopped,
        ),
    )
    return surface


@traces(SWR.SWR_3608)
def open_queue(controller: RequirementsController) -> bool:
    """Bring the attached queue surface to the front. ``False`` when there is none.

    The one call a board-side control makes. It lives here rather than on the
    board because the pane does: whatever raises it — a button on the filter bar,
    a menu entry — calls this and needs to know nothing else about the queue.
    """
    view = controller.view
    show_pane = getattr(view, "show_pane", None) if view is not None else None
    if not callable(show_pane):
        return False
    return bool(show_pane(QUEUE_PANE))
