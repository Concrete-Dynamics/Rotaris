"""Virtualized model/view transcript for long Rotaris sessions."""

from __future__ import annotations

import html
import json
import time
from collections import OrderedDict
from typing import TYPE_CHECKING, Any, cast, override

from PySide6.QtCore import (
    QAbstractItemModel,
    QAbstractListModel,
    QEvent,
    QModelIndex,
    QPersistentModelIndex,
    QPoint,
    QPointF,
    QRectF,
    QSize,
    Qt,
    QTimer,
    QUrl,
    Signal,
)
from PySide6.QtGui import (
    QColor,
    QDesktopServices,
    QFont,
    QFontMetrics,
    QGuiApplication,
    QKeyEvent,
    QKeySequence,
    QMouseEvent,
    QPainter,
    QResizeEvent,
    QTextDocument,
)
from PySide6.QtWidgets import (
    QAbstractItemView,
    QAbstractSlider,
    QListView,
    QMenu,
    QStyle,
    QStyledItemDelegate,
    QStyleOptionViewItem,
    QWidget,
)
from rotaris_core.reqtocode import SWR, traces

from rotaris import theme
from rotaris.markdown import markdown_to_html
from rotaris.theme import tokens
from rotaris.theme.manager import Themed

if TYPE_CHECKING:
    from collections.abc import Callable, Container, Sequence

    from rotaris.models.state import AgentNode, QuestionStep, TranscriptDiff, TranscriptEvent
    from rotaris.models.store import WorkspaceStore
    from rotaris.models.terminal import TerminalCell, TerminalScreen
    from rotaris.services.run_bridge import RunBridge
    from rotaris.theme.color import Color
    from rotaris.theme.spec import Theme
    from rotaris.widgets.approval_dialog import ApprovalDialog
    from rotaris.widgets.question_stepper import QuestionStepper


EVENT_ROLE = int(Qt.ItemDataRole.UserRole) + 1

_ROW_MARGIN_X = 10
_ROW_MARGIN_Y = 5
_TIMESTAMP_WIDTH = 52
_ROLE_WIDTH = 112
_COLUMN_SPACING = 12
_BODY_X = _ROW_MARGIN_X + _TIMESTAMP_WIDTH + _COLUMN_SPACING + _ROLE_WIDTH + _COLUMN_SPACING
_MIN_ROW_HEIGHT = 30
_SIZE_CACHE_LIMIT = 4096
#: Far smaller than the size cache: a laid-out `QTextDocument` costs real
#: memory, and only rows near the viewport are ever painted.
_DOCUMENT_CACHE_LIMIT = 256
_INVALID_INDEX = QModelIndex()


@traces(SWR.SWR_2099, SWR.SWR_2419)
def filter_transcript_for_agent(
    events: list[TranscriptEvent], agent_id: str
) -> list[TranscriptEvent]:
    """Project shared context plus one agent's events into a chat transcript."""
    if not agent_id:
        return list(events)
    return [
        event
        for event in events
        # Verification belongs to the run, not to any one agent: filtering it
        # out per agent would hide it exactly when a user drilled into the
        # agent whose edits are being checked (SWR-2609).
        if event.kind in {"user", "system", "question_stepper", "approval", "verifier"}
        or event.role == agent_id
    ]


#: Roles the run owns rather than an agent the inspector could describe.
#: Deliberately narrower than :data:`_FIXED_ROLES`, which also holds
#: ``"orchestrator"`` because that role has a fixed *colour* — it is still an
#: author, and it resolves to a real agent whenever the run spawned one.
_NON_AUTHOR_ROLES = frozenset({"you", "intent", "system"})


@traces(SWR.SWR_2910)
def latest_transcript_author(
    events: Sequence[TranscriptEvent], known_agent_ids: Container[str]
) -> str:
    """Id of the agent that wrote the newest attributable row; ``""`` if none.

    Scans backwards and stops at the first hit, so the usual case — a run
    streaming rows from the agent that is generating — costs one comparison.
    Rows the run owns rather than an agent are not authorship: the user's own
    messages, ``intent`` and ``system`` rows, and the check suite's ``verifier``
    rows (SWR-2609). A role naming no known agent is skipped rather than
    answered with, so a transcript that ends on one still resolves to whichever
    agent last spoke.
    """
    for event in reversed(events):
        if event.kind == "verifier" or event.role in _NON_AUTHOR_ROLES:
            continue
        if event.role in known_agent_ids:
            return event.role
    return ""


@traces(SWR.SWR_2433)
def delegation_context_event(agent: AgentNode) -> TranscriptEvent:
    """Build a delegation-context synthetic event for a child agent."""
    from rotaris.models.state import TranscriptEvent

    fields = {
        "task_name": agent.name,
        "persona": agent.persona,
        "category": agent.category or None,
        "run_in_background": agent.run_in_background,
        "task": agent.delegation_task,
        "depends_on": agent.depends_on,
        "inherited_context": agent.inherited_context,
    }
    return TranscriptEvent(
        timestamp="",
        role=agent.id,
        text=json.dumps(fields),
        kind="delegation_context",
        persona=agent.persona,
    )


#: Tool name → the family gerund a run of those calls is summarised as. Rows
#: only group with rows of the same family, so a burst of reads stays one line
#: while an edit that follows it starts its own group (SWR-2432).
_TOOL_FAMILIES = {
    "read": "reading",
    "read_file": "reading",
    "list_dir": "reading",
    "list_files": "reading",
    "glob": "reading",
    "view": "reading",
    "edit": "editing",
    "edit_file": "editing",
    "write": "editing",
    "write_file": "editing",
    "create_file": "editing",
    "str_replace": "editing",
    "str_replace_editor": "editing",
    "apply_patch": "editing",
    "grep": "searching",
    "grep_search": "searching",
    "search": "searching",
    "codebase_search": "searching",
    "web_search": "searching",
    "bash": "running",
    "execute": "running",
    "execute_bash": "running",
    "terminal": "running",
    "run_command": "running",
}

#: Tool rows that always stand alone: the question stepper's row carries the
#: control that answers it (the same carve-out SWR-2420 makes).
_UNGROUPABLE_TOOLS = frozenset({"ask_questions"})


def terminal_row_settled(event: TranscriptEvent) -> bool:
    """True once a terminal row has a result of its own.

    An agent reuses one terminal across every command it runs, so all of its
    terminal rows share a stream id.  Only the row still waiting for a result
    may read that stream; a settled one shows what it recorded (SWR-2428).  A
    row reloaded from disk mid-command carries no status at all, and is
    unsettled in exactly the same sense — there is simply no live stream left
    for it to read.
    """
    return event.status not in ("", "running")


def is_ungroupable_tool(event: TranscriptEvent) -> bool:
    """True when this tool row must not be folded into a run group (SWR-2428).

    An unsettled terminal call is exempt because a live preview folded into a
    "▸ running ×7" header would hide the output it exists to show.  Once the
    command has finished the row is an ordinary result and groups like any
    other.  The name is normalised here because the backend may report ``Bash``
    where the preview logic looks for ``bash``.
    """
    tool = event.tool.strip().lower()
    if tool in _UNGROUPABLE_TOOLS:
        return True
    return tool in _TERMINAL_TOOLS and not terminal_row_settled(event)


#: A lone call is not a run — it renders exactly as it does without grouping.
_GROUP_MIN_MEMBERS = 2

#: Cap on the searchable blob a group carries for its members, so a long run of
#: calls cannot grow one row's payload without bound.
_GROUP_SEARCH_CHARS = 2000

#: How far back the live-row scan looks. Live rows sit at the tail; a bounded
#: window keeps the per-second tick independent of transcript length.
_LIVE_ROW_SCAN = 12

#: A counting clock only has to move once a second.  Streaming terminal output
#: has to move as fast as a person reads it, so the tick speeds up while a
#: terminal row is live and drops back afterwards (SWR-2428).
_LIVE_TICK_MS = 1000
_TERMINAL_TICK_MS = 250


@traces(SWR.SWR_2432)
def tool_family(tool: str) -> str:
    """Gerund a tool's calls are summarised as — `read_file` → ``reading``.

    An unmapped tool falls back to its own friendly name, so it still groups
    with repeats of itself and never with a different tool.
    """
    key = tool.strip().lower()
    if not key:
        return "tool"
    return _TOOL_FAMILIES.get(key, key.replace("_", " "))


@traces(SWR.SWR_2432)
def _tool_group_event(members: list[TranscriptEvent], family: str) -> TranscriptEvent:
    """Fold one run of same-family tool calls into a single header event."""
    from rotaris.models.state import TranscriptEvent

    first = members[0]
    tally: dict[str, int] = {}
    duration = 0.0
    starts = []
    current = ""
    for member in members:
        status, _detail, _full = _effective_tool_fields(member)
        tally[status or "ok"] = tally.get(status or "ok", 0) + 1
        duration += member.duration
        if member.started_at:
            starts.append(member.started_at)
        if member.text and member.text != member.tool:
            current = member.text
    running = tally.get("running", 0)
    # Worst outcome wins the group's colour: a run that read nine files and
    # failed the tenth must not read as a clean success.
    status = (
        "running"
        if running
        else next((name for name in ("failed", "blocked", "ok") if tally.get(name)), "")
    )
    haystack = " ".join(
        part for member in members for part in (member.tool, member.text, member.detail) if part
    )
    fields = {
        "family": family,
        "count": len(members),
        "ok": tally.get("ok", 0),
        "failed": tally.get("failed", 0),
        "blocked": tally.get("blocked", 0),
        "running": running,
        "current": current,
        "search": haystack[:_GROUP_SEARCH_CHARS],
    }
    return TranscriptEvent(
        timestamp=first.timestamp,
        role=first.role,
        text=json.dumps(fields),
        kind="tool_group",
        tool=family,
        persona=first.persona,
        event_key=first.event_key,
        status=status,
        duration=round(duration, 1),
        started_at=min(starts) if starts else 0.0,
    )


@traces(SWR.SWR_2432)
def group_tool_runs(
    events: Sequence[TranscriptEvent],
    expanded: Container[str] = frozenset(),
) -> list[TranscriptEvent]:
    """Project a transcript so runs of same-family tool calls read as one row.

    Pure, so the whole grouping rule is testable without a widget. A run is two
    or more adjacent ``tool`` rows from the same agent whose tools share a
    family; anything else — a message, a thinking row, another agent, another
    family — ends it. An expanded group keeps its header and re-emits its
    members, so per-row expansion (SWR-2417) and auto-collapse (SWR-2420) apply
    to them exactly as they do to standalone rows.
    """
    display: list[TranscriptEvent] = []
    index = 0
    total = len(events)
    while index < total:
        event = events[index]
        if event.kind != "tool" or is_ungroupable_tool(event):
            display.append(event)
            index += 1
            continue
        family = tool_family(event.tool)
        end = index + 1
        while (
            end < total
            and events[end].kind == "tool"
            and not is_ungroupable_tool(events[end])
            and events[end].role == event.role
            and tool_family(events[end].tool) == family
        ):
            end += 1
        members = list(events[index:end])
        if len(members) < _GROUP_MIN_MEMBERS:
            display.extend(members)
        else:
            header = _tool_group_event(members, family)
            display.append(header)
            if _event_identity(header) in expanded:
                display.extend(members)
        index = end
    return display


@traces(SWR.SWR_2432)
def group_summary_text(event: TranscriptEvent) -> str:
    """Plain-text form of a group header, for copy and accessible text.

    The header's own payload is JSON — neither a screen reader nor the
    clipboard should ever see that.
    """
    fields = _group_fields(event)
    family = str(fields.get("family") or event.tool or "tool")
    parts = [f"{family} ×{int(fields.get('count') or 0)}"]
    if int(fields.get("running") or 0):
        parts.append("running")
    else:
        parts.extend(
            f"{int(fields.get(name) or 0)} {name}"
            for name in ("ok", "failed", "blocked")
            if int(fields.get(name) or 0)
        )
    current = str(fields.get("current") or "")
    if current:
        parts.append(current)
    return " · ".join(parts)


@traces(SWR.SWR_2432)
def search_haystack(event: TranscriptEvent) -> str:
    """Text a transcript search matches *event* against.

    A group answers for its members: a hit inside a collapsed run lands on the
    header the user can actually see and open, instead of disappearing.
    """
    if event.kind == "tool_group":
        fields = _group_fields(event)
        return " ".join(
            (event.role, str(fields.get("family") or ""), str(fields.get("search") or ""))
        )
    return " ".join((event.role, event.text, event.tool, event.detail))


@traces(
    SWR.SWR_2016,
    SWR.SWR_2017,
    SWR.SWR_2020,
    SWR.SWR_2061,
    SWR.SWR_2062,
    SWR.SWR_2063,
    SWR.SWR_2078,
    SWR.SWR_2079,
    SWR.SWR_2080,
    SWR.SWR_2081,
    SWR.SWR_2082,
    SWR.SWR_2083,
    SWR.SWR_2420,
)
class TranscriptListModel(QAbstractListModel):
    """Incrementally project transcript snapshots into a Qt list model."""

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._events: list[TranscriptEvent] = []
        self.operation_counts = {
            "noop": 0,
            "insert": 0,
            "remove": 0,
            "update": 0,
            "reset": 0,
        }

    @override
    def rowCount(self, parent: QModelIndex | QPersistentModelIndex = _INVALID_INDEX) -> int:
        return 0 if parent.isValid() else len(self._events)

    @override
    def data(
        self,
        index: QModelIndex | QPersistentModelIndex,
        role: int = int(Qt.ItemDataRole.DisplayRole),
    ) -> object:
        if not index.isValid() or not 0 <= index.row() < len(self._events):
            return None
        event = self._events[index.row()]
        if role == EVENT_ROLE:
            return event
        if role in (
            int(Qt.ItemDataRole.DisplayRole),
            int(Qt.ItemDataRole.AccessibleTextRole),
            int(Qt.ItemDataRole.ToolTipRole),
        ):
            prefix = f"{event.timestamp} {event.role}".strip()
            if event.kind == "tool_group":
                body = group_summary_text(event)
            else:
                body = " ".join(part for part in (event.tool, event.text, event.detail) if part)
            return f"{prefix}: {body}" if prefix else body
        return None

    def event_at(self, row: int) -> TranscriptEvent | None:
        return self._events[row] if 0 <= row < len(self._events) else None

    @property
    def events(self) -> list[TranscriptEvent]:
        return self._events

    def sync(self, events: list[TranscriptEvent]) -> bool:
        """Apply common append, truncate, and streamed-tail updates incrementally."""
        if events == self._events:
            self.operation_counts["noop"] += 1
            return False

        old_count = len(self._events)
        new_count = len(events)
        prefix = 0
        common = min(old_count, new_count)
        while prefix < common and self._events[prefix] == events[prefix]:
            prefix += 1

        if prefix == old_count and new_count > old_count:
            self.beginInsertRows(QModelIndex(), old_count, new_count - 1)
            self._events.extend(events[old_count:])
            self.endInsertRows()
            self.operation_counts["insert"] += new_count - old_count
            return True

        if prefix == new_count and old_count > new_count:
            self.beginRemoveRows(QModelIndex(), new_count, old_count - 1)
            del self._events[new_count:]
            self.endRemoveRows()
            self.operation_counts["remove"] += old_count - new_count
            return True

        if old_count == new_count:
            self._events[prefix:] = events[prefix:]
            first = self.index(prefix, 0)
            last = self.index(new_count - 1, 0)
            self.dataChanged.emit(first, last, [EVENT_ROLE, int(Qt.ItemDataRole.DisplayRole)])
            self.operation_counts["update"] += new_count - prefix
            return True

        if new_count > old_count:
            # The shape streaming actually produces: the tail row that is still
            # running gets a new status *and* fresh rows land behind it in the
            # same refresh. Split that into an update plus an append rather than
            # letting it fall through to a reset — a reset throws away the
            # view's layout and scroll position mid-stream, which is exactly the
            # jump the user sees when new messages arrive.
            self._events[prefix:old_count] = events[prefix:old_count]
            self.dataChanged.emit(
                self.index(prefix, 0),
                self.index(old_count - 1, 0),
                [EVENT_ROLE, int(Qt.ItemDataRole.DisplayRole)],
            )
            self.operation_counts["update"] += old_count - prefix
            self.beginInsertRows(QModelIndex(), old_count, new_count - 1)
            self._events.extend(events[old_count:])
            self.endInsertRows()
            self.operation_counts["insert"] += new_count - old_count
            return True

        self.beginResetModel()
        self._events = list(events)
        self.endResetModel()
        self.operation_counts["reset"] += 1
        return True


@traces(SWR.SWR_2447)
def _is_live_event(event: TranscriptEvent) -> bool:
    """True while this row renders a clock or a pulse that has to keep moving.

    Live rows are the handful at the tail; everything else renders identically
    from one second to the next and can be measured and laid out once.
    """
    if event.kind in {"tool", "verifier", "tool_group"} and event.status == "running":
        return True
    if event.kind == "thinking" and not event.duration and event.started_at:
        return time.time() - event.started_at < _STALE_THINKING_SECONDS
    return False


@traces(SWR.SWR_2448, SWR.SWR_2432)
def _event_identity(event: TranscriptEvent) -> str:
    """Stable per-event key for expansion state that survives row insertion."""
    if event.kind == "tool_group":
        # Keyed off the group's *first* member, which never changes as later
        # calls join the run — so an opened group stays open while it grows.
        if event.event_key:
            return f"toolgroup:{event.role}:{event.event_key}"
        return f"toolgroup:{event.role}:{event.tool}:{event.timestamp}"
    if event.kind in {"tool", "verifier"}:
        if event.event_key:
            return f"{event.kind}:{event.role}:{event.event_key}"
        return f"{event.kind}:{event.role}:{event.tool}:{hash(event.full_text or event.text)}"
    if event.kind == "thinking":
        if event.started_at:
            return f"thinking:{event.role}:{event.started_at}"
        return f"thinking:{event.role}:{hash(event.text)}"
    if event.kind == "delegation_context":
        return f"delegation:{event.role}"
    return f"{event.kind}:{event.role}:{hash(event.text)}"


class TranscriptDelegate(QStyledItemDelegate):
    """Paint transcript rows without allocating one QWidget tree per event."""

    def __init__(self, view: TranscriptListView) -> None:
        super().__init__(view)
        self._view = view
        # Keyed by _event_identity, not row index, so an open box survives
        # rows being inserted above it in a live transcript (SWR-2448).
        self._expanded_reasoning: set[str] = set()
        self._expanded_tool: set[str] = set()
        self._delegation_collapsed: set[str] = set()
        # Opened tool-call groups (SWR-2432). Identity-keyed like the sets
        # above, so a group survives its own growth and rows inserted above it.
        self._expanded_groups: set[str] = set()
        #: Resolves a terminal row's live screen; unset until a bridge attaches,
        #: so a transcript with no run still renders terminal rows from their
        #: persisted output (SWR-2428).
        self._screen_provider: Callable[[str], TerminalScreen | None] | None = None
        self._search_match = -1
        self._size_cache: OrderedDict[tuple[object, ...], QSize] = OrderedDict()
        # Laid-out rich text, keyed exactly like the sizes beside it. Qt's text
        # layout — not the Markdown parse, which `markdown_to_html` already
        # caches — is what a repaint pays for, and a repaint runs on hover, on
        # every live tick, and for every visible row after any relayout.
        self._document_cache: OrderedDict[tuple[object, ...], QTextDocument] = OrderedDict()
        self._auto_collapse_getter: Callable[[], bool] | None = None
        self._recent_tool_cache: set[int] | None = None
        model = view.model()
        model.modelReset.connect(self._on_model_reset)
        model.rowsInserted.connect(self._invalidate_recent_tool_cache)
        model.dataChanged.connect(self._invalidate_recent_tool_cache)

    @traces(SWR.SWR_2428)
    def set_screen_provider(self, provider: Callable[[str], TerminalScreen | None]) -> None:
        """Tell the delegate where to find a terminal row's emulated screen.

        A provider rather than a stored screen: rows come and go with every
        refresh, and the bridge is the only thing that knows which streams
        currently exist.
        """
        self._screen_provider = provider

    def screen_for(self, event: TranscriptEvent) -> TerminalScreen | None:
        """The live screen this row may show — only while its command runs.

        One agent reuses one terminal across its commands, so every terminal row
        of that agent carries the same stream id.  A finished row that kept
        reading the live screen would show a later command's output as if it
        were its own; it renders its own recorded result instead (SWR-2428).
        """
        provider = self._screen_provider
        if provider is None or not event.stream_id or terminal_row_settled(event):
            return None
        return provider(event.stream_id)

    def clear_caches(self) -> None:
        self._expanded_reasoning.clear()
        self._expanded_tool.clear()
        self._delegation_collapsed.clear()
        self._expanded_groups.clear()
        self._size_cache.clear()
        self._document_cache.clear()
        self._recent_tool_cache = None

    def invalidate_rendered_caches(self) -> None:
        """Forget every measurement and laid-out document, keeping expansion state.

        A row is rich text with the palette and the type scale written into it,
        and both caches are keyed by content rather than by theme — so after a
        switch they would keep handing back rows painted in the palette the
        reader just left. Which boxes are open is not presentation and survives.
        """
        self._size_cache.clear()
        self._document_cache.clear()

    @property
    def expanded_groups(self) -> set[str]:
        """Identities of the tool-call groups the user has opened (SWR-2432)."""
        return self._expanded_groups

    @traces(SWR.SWR_2448)
    def _on_model_reset(self) -> None:
        """Drop only what a reset actually invalidates: the row-keyed cache.

        Sizes, laid-out documents and expansion state are all keyed by event
        identity, so they survive a reset — which is the point: re-measuring
        every row from scratch is what made a mid-transcript change flicker.
        """
        self._recent_tool_cache = None

    def _invalidate_recent_tool_cache(self) -> None:
        """Recompute which tool rows are recent, and re-measure the ones that left.

        Under auto-collapse a row leaving the recent pair changes height. Saying
        so here means the new height lands in the same layout pass as the
        insertion that caused it, instead of surfacing later as a jump when some
        unrelated relayout happens to run.
        """
        previous = self._recent_tool_cache
        self._recent_tool_cache = None
        if previous is None or self._auto_collapse_getter is None:
            return
        if not self._auto_collapse_getter():
            return
        model = self._view.model()
        if model is None:
            return
        for row in sorted(previous - self._recent_tool_indices()):
            if 0 <= row < model.rowCount():
                self.sizeHintChanged.emit(model.index(row, 0))

    def _recent_tool_indices(self) -> set[int]:
        """Return indices of the most recent tool-call + tool-result pair."""
        if self._recent_tool_cache is not None:
            return self._recent_tool_cache
        model = self._view.model()
        if model is None:
            return set()
        events: list[TranscriptEvent] = cast("TranscriptListModel", model).events
        recent: set[int] = set()
        count = 0
        for i in range(len(events) - 1, -1, -1):
            if events[i].kind == "tool":
                recent.add(i)
                count += 1
                if count >= 2:
                    break
        self._recent_tool_cache = recent
        return recent

    def set_search_match(self, row: int) -> None:
        if row == self._search_match:
            return
        previous = self._search_match
        self._search_match = row
        if previous >= 0:
            self._view.update(self._view.model().index(previous, 0))
        if row >= 0:
            self._view.update(self._view.model().index(row, 0))

    @override
    def sizeHint(
        self,
        option: QStyleOptionViewItem,
        index: QModelIndex | QPersistentModelIndex,
    ) -> QSize:
        event = index.data(EVENT_ROLE)
        if event is None:
            return QSize(max(1, self._view.viewport().width()), _MIN_ROW_HEIGHT)
        width = max(240, self._view.viewport().width() - 2)
        block_start, _line1, line2, _color = transcript_attribution(
            self._view.transcript_model.events, index.row()
        )
        body_width = max(80, width - _BODY_X - _ROW_MARGIN_X)
        content_key = self._content_key(index.row(), body_width, event)
        key = (*content_key, block_start, bool(line2))
        cached = self._size_cache.get(key)
        if cached is not None:
            self._size_cache.move_to_end(key)
            return cached
        document = self._document(index.row(), event, body_width, content_key)
        label_height = _attribution_label_height() if block_start and line2 else 0
        size = QSize(
            width,
            max(_MIN_ROW_HEIGHT, label_height, int(document.size().height()) + 2 * _ROW_MARGIN_Y),
        )
        self._size_cache[key] = size
        self._size_cache.move_to_end(key)
        while len(self._size_cache) > _SIZE_CACHE_LIMIT:
            self._size_cache.popitem(last=False)
        return size

    @override
    def paint(
        self,
        painter: QPainter,
        option: QStyleOptionViewItem,
        index: QModelIndex | QPersistentModelIndex,
    ) -> None:
        event = index.data(EVENT_ROLE)
        if event is None:
            return
        t = tokens()
        view_option = cast("Any", option)
        painter.save()
        painter.setClipRect(view_option.rect)
        self._paint_background(painter, option, index.row(), event.kind)

        # The whole stack, not one face: a stylesheet family never reaches a
        # QFont built here, and naming a single face means a host without it
        # gets Qt's proportional default in a column sized for digits.
        timestamp_font = QFont()
        timestamp_font.setFamilies(list(t.type.mono_families))
        timestamp_font.setPointSizeF(8.0)
        painter.setFont(timestamp_font)
        painter.setPen(
            t.color.text_tertiary.qcolor if event.timestamp else QColor(Qt.GlobalColor.transparent)
        )
        timestamp_rect = view_option.rect.adjusted(_ROW_MARGIN_X, _ROW_MARGIN_Y, 0, 0)
        timestamp_rect.setWidth(_TIMESTAMP_WIDTH)
        painter.drawText(
            timestamp_rect, Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignTop, event.timestamp
        )

        block_start, line1, line2, role_color = transcript_attribution(
            self._view.transcript_model.events, index.row()
        )
        if block_start:
            role_font = QFont()
            role_font.setPointSizeF(8.5)
            role_font.setBold(True)
            painter.setFont(role_font)
            painter.setPen(QColor(role_color))
            role_rect = view_option.rect.adjusted(
                _ROW_MARGIN_X + _TIMESTAMP_WIDTH + _COLUMN_SPACING,
                _ROW_MARGIN_Y,
                0,
                0,
            )
            role_rect.setWidth(_ROLE_WIDTH)
            painter.drawText(
                role_rect,
                Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignTop,
                QFontMetrics(role_font).elidedText(line1, Qt.TextElideMode.ElideRight, _ROLE_WIDTH),
            )
            if line2:
                task_font = QFont()
                task_font.setPointSizeF(8.0)
                painter.setFont(task_font)
                painter.setPen(t.color.text_tertiary.qcolor)
                task_rect = role_rect.adjusted(0, QFontMetrics(role_font).height() + 1, 0, 0)
                painter.drawText(
                    task_rect,
                    Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignTop,
                    QFontMetrics(task_font).elidedText(
                        line2, Qt.TextElideMode.ElideRight, _ROLE_WIDTH
                    ),
                )
        elif event.role:
            # Continuation of the same agent's block: a colour-matched bar in
            # the role gutter keeps rows attributable once the block label has
            # scrolled out of view.
            painter.fillRect(
                view_option.rect.left() + _ROW_MARGIN_X + _TIMESTAMP_WIDTH + _COLUMN_SPACING,
                view_option.rect.top(),
                2,
                view_option.rect.height(),
                QColor(role_color),
            )

        body_rect = view_option.rect.adjusted(
            _BODY_X, _ROW_MARGIN_Y, -_ROW_MARGIN_X, -_ROW_MARGIN_Y
        )
        document = self._document(index.row(), event, max(80, body_rect.width()))
        painter.translate(body_rect.topLeft())
        document.drawContents(painter, QRectF(0, 0, body_rect.width(), body_rect.height()))
        painter.restore()

    @override
    def editorEvent(
        self,
        event: QEvent,
        model: QAbstractItemModel,
        option: QStyleOptionViewItem,
        index: QModelIndex | QPersistentModelIndex,
    ) -> bool:
        if (
            not isinstance(event, QMouseEvent)
            or event.type() != QEvent.Type.MouseButtonRelease
            or event.button() != Qt.MouseButton.LeftButton
        ):
            return False
        transcript_event = index.data(EVENT_ROLE)
        if transcript_event is None:
            return False
        view_option = cast("Any", option)
        body_rect = view_option.rect.adjusted(
            _BODY_X, _ROW_MARGIN_Y, -_ROW_MARGIN_X, -_ROW_MARGIN_Y
        )
        if not body_rect.contains(event.position().toPoint()):
            return False
        document = self._document(index.row(), transcript_event, max(80, body_rect.width()))
        local = event.position() - QPointF(body_rect.topLeft())
        anchor = document.documentLayout().anchorAt(local)
        if not anchor:
            return False
        identity = _event_identity(transcript_event)
        if anchor.startswith("rotaris-group:"):
            # A group toggle changes which rows exist, not just one row's
            # height, so the view has to re-project rather than re-layout.
            if identity in self._expanded_groups:
                self._expanded_groups.remove(identity)
            else:
                self._expanded_groups.add(identity)
            # No cache to clear: expansion is part of the cache key, and the
            # member rows this reveals keep whatever they were measured at.
            self._recent_tool_cache = None
            self._view.refresh_grouping()
            return True
        toggle_set = {
            "rotaris-reasoning:": self._expanded_reasoning,
            "rotaris-tool:": self._expanded_tool,
            "rotaris-delegation:": self._delegation_collapsed,
        }
        for prefix, expansion in toggle_set.items():
            if not anchor.startswith(prefix):
                continue
            if identity in expansion:
                expansion.remove(identity)
            else:
                expansion.add(identity)
            self._drop_event_caches(transcript_event)
            self.sizeHintChanged.emit(index)
            self._view.doItemsLayout()
            self._view.update(index)
            return True
        if anchor.startswith("rotaris-terminal:"):
            self._view.terminal_popout_requested.emit(transcript_event.stream_id)
            return True
        if anchor.startswith("rotaris-questions:"):
            self._view._open_question_stepper(index.row())
            return True
        if anchor.startswith("rotaris-approval:"):
            self._view.open_approval_dialog()
            return True
        url = QUrl(anchor)
        if url.scheme() in {"http", "https"}:
            QDesktopServices.openUrl(url)
            return True
        return False

    def _content_key(self, row: int, width: int, event: TranscriptEvent) -> tuple[object, ...]:
        """Everything the rendered body depends on — the document cache's key.

        Keyed by identity rather than row: a row number changes whenever
        anything is inserted above it, which would throw away the measurement
        and the laid-out document of every row below an insertion. The row's one
        real influence — whether auto-collapse currently holds it shut — is
        folded in as `auto`.
        """
        auto = self._auto_collapse_active(row, event)
        identity = _event_identity(event)
        return (
            identity,
            width,
            event.kind,
            event.role,
            event.tool,
            event.detail,
            len(event.text),
            hash(event.text),
            event.status,
            event.duration,
            event.char_count // 4,
            identity in self._expanded_reasoning,
            identity in self._expanded_tool,
            identity in self._delegation_collapsed,
            identity in self._expanded_groups,
            auto,
            # A streaming terminal changes without any field above changing, so
            # its screen revision is what keeps the cached document honest.
            self._screen_revision(event),
        )

    def _size_key(
        self,
        row: int,
        width: int,
        event: TranscriptEvent,
        block_start: bool = True,
        has_task_line: bool = False,
    ) -> tuple[object, ...]:
        """The content key plus what only the row's *height* depends on."""
        return (*self._content_key(row, width, event), block_start, has_task_line)

    def _screen_revision(self, event: TranscriptEvent) -> int:
        screen = self.screen_for(event)
        return -1 if screen is None else screen.revision

    def _auto_collapse_active(self, row: int, event: TranscriptEvent) -> bool:
        """Return True if this tool row should be force-collapsed by auto-collapse policy."""
        if event.kind != "tool":
            return False
        if is_ungroupable_tool(event):
            # The question stepper carries the control that answers it, and a
            # running terminal collapsed to its name loses both the live output
            # and the way into the window (SWR-2428).
            return False
        if self._auto_collapse_getter is None:
            return False
        if not self._auto_collapse_getter():
            return False
        if _event_identity(event) in self._expanded_tool:
            return False
        return row not in self._recent_tool_indices()

    def _drop_event_caches(self, event: TranscriptEvent) -> None:
        """Forget the measurement and layout of one event, across every width."""
        identity = _event_identity(event)
        for cache in (self._size_cache, self._document_cache):
            for key in [key for key in cache if key[0] == identity]:
                del cache[key]

    def _document(
        self,
        row: int,
        event: TranscriptEvent,
        width: int,
        content_key: tuple[object, ...] | None = None,
    ) -> QTextDocument:
        """Laid-out rich text for one row, reused whenever nothing about it moved.

        `row` reaches `_event_html` only to number the anchors, and every click
        resolves its row from the index it landed on — so a document that
        outlives its original row number stays correct. `content_key` lets a
        caller that already built the key hand it over instead of paying for it
        twice.
        """
        auto_collapsed = self._auto_collapse_active(row, event)
        identity = _event_identity(event)
        # Live rows redraw a clock every second; caching one would freeze it.
        key = (
            None
            if _is_live_event(event)
            else (content_key if content_key is not None else self._content_key(row, width, event))
        )
        if key is not None:
            cached = self._document_cache.get(key)
            if cached is not None:
                self._document_cache.move_to_end(key)
                return cached
        document = QTextDocument()
        document.setUndoRedoEnabled(False)
        document.setDocumentMargin(0)
        document.setDefaultStyleSheet(_document_css(event.kind))
        document.setHtml(
            f'<div style="{_document_style(event.kind)}">'
            f"{_event_html(row, event, identity in self._expanded_reasoning, identity in self._expanded_tool, auto_collapsed, identity in self._delegation_collapsed, identity in self._expanded_groups, self.screen_for(event))}"
            "</div>"
        )
        document.setTextWidth(width)
        if key is not None:
            self._document_cache[key] = document
            self._document_cache.move_to_end(key)
            while len(self._document_cache) > _DOCUMENT_CACHE_LIMIT:
                self._document_cache.popitem(last=False)
        return document

    def _paint_background(
        self,
        painter: QPainter,
        option: QStyleOptionViewItem,
        row: int,
        kind: str,
    ) -> None:
        view_option = cast("Any", option)
        # `.qcolor` rather than QColor(token): the selection washes are
        # translucent, and Qt's colour parser understands `#rrggbb` but not the
        # `rgba(...)` spelling QSS needs — it would hand back an invalid colour,
        # which paints black.
        color = tokens().color
        if row == self._search_match:
            painter.fillRect(view_option.rect, color.accent[900].qcolor)
            painter.fillRect(
                view_option.rect.adjusted(0, 0, -view_option.rect.width() + 2, 0),
                color.focus.qcolor,
            )
        elif view_option.state & QStyle.StateFlag.State_Selected:
            painter.fillRect(view_option.rect, color.accent[800].qcolor)
        elif view_option.state & QStyle.StateFlag.State_MouseOver:
            painter.fillRect(view_option.rect, color.hover.qcolor)
        elif kind == "delegation_context":
            painter.fillRect(view_option.rect, color.accent_tint_soft.qcolor)
        elif kind == "user":
            painter.fillRect(view_option.rect, color.accent[900].qcolor)


class TranscriptListView(Themed, QListView):
    """Virtual transcript list with exact whole-message copy support."""

    #: A terminal row asked to be opened in the pop-out window (SWR-2428).
    terminal_popout_requested = Signal(str)

    @traces(SWR.SWR_2452)
    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        model = TranscriptListModel(self)
        self.setModel(model)
        self._delegate = TranscriptDelegate(self)
        self.setItemDelegate(self._delegate)
        # Not `Batched`. Qt throws the whole item layout away on every row
        # insertion and every `dataChanged`, and batched mode then rebuilds it
        # `batchSize` rows per event-loop pass — during which every row past the
        # laid-out prefix has a zero-height `visualRect` and paints as
        # background. With the viewport pinned to the tail, the tail lands in
        # the *last* batch, so the whole transcript reads blank until then, for
        # `rowCount / batchSize` frames. Laying out in one pass costs the same
        # total work and never shows a half-built transcript.
        self.setLayoutMode(QListView.LayoutMode.SinglePass)
        self.setResizeMode(QListView.ResizeMode.Adjust)
        self.setMovement(QListView.Movement.Static)
        self.setVerticalScrollMode(QAbstractItemView.ScrollMode.ScrollPerPixel)
        self.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.setSelectionMode(QAbstractItemView.SelectionMode.SingleSelection)
        self.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self.customContextMenuRequested.connect(self._show_copy_menu)
        self.setMouseTracking(True)
        self.setObjectName("transcriptView")
        self._auto_collapse_getter: Callable[[], bool] | None = None
        self._group_tools_getter: Callable[[], bool] | None = None
        # The ungrouped truth. The model holds what is *displayed*, which is a
        # projection of this list once grouping is on (SWR-2432).
        self._source_events: list[TranscriptEvent] = []
        self._following_tail = True
        self._pin_pending = False
        self._stepper_questions: list[QuestionStep] | None = None
        self._stepper_modal: QuestionStepper | None = None
        self._run_bridge: RunBridge | None = None
        self._stepper_agent_id = ""
        self._stepper_prompt_id = ""
        self._pending_approvals: tuple[dict[str, Any], ...] = ()
        self._approval_modal: ApprovalDialog | None = None
        self.setProperty("followingTail", True)
        self.setAccessibleName("Session transcript")
        self.setAccessibleDescription(
            "Agent activity and messages. A green border means new output is followed. "
            "Select a row, then use Copy message or Ctrl+C."
        )
        scrollbar = self.verticalScrollBar()
        scrollbar.rangeChanged.connect(self._scroll_range_changed)
        scrollbar.actionTriggered.connect(self._scroll_action_triggered)
        scrollbar.sliderPressed.connect(lambda: self.set_following_tail(False))
        scrollbar.sliderMoved.connect(self._slider_moved)
        scrollbar.sliderReleased.connect(self._sync_tail_state_from_position)
        # Live rows (thinking without duration, running tools) show elapsed
        # labels that must keep counting between store refreshes (SWR-2447).
        self._live_repaint = QTimer(self)
        self._live_repaint.setInterval(_LIVE_TICK_MS)
        self._live_repaint.timeout.connect(self._on_live_tick)
        model.rowsInserted.connect(self._update_live_timer)
        model.dataChanged.connect(self._update_live_timer)
        model.modelReset.connect(self._update_live_timer)
        self.install_theme_hook()

    def apply_theme(self, theme: Theme) -> None:
        """Restyle the frame and re-render every row from the new palette.

        The delegate paints rows rather than building widgets, so nothing under
        this view is reached by a repolish; the rendered caches have to be
        dropped and the rows measured again, or the transcript keeps the palette
        the reader just left until the next store refresh happens to touch it.
        """
        self.setStyleSheet(
            f"QListView#transcriptView{{background:{theme.color.bg};"
            f"border:{theme.size.hairline}px solid {theme.color.border};}}"
            f'QListView#transcriptView[followingTail="true"]{{'
            f"border:{theme.size.hairline}px solid {theme.color.run};}}"
        )
        self._delegate.invalidate_rendered_caches()
        self.doItemsLayout()
        self.viewport().update()

    @property
    def transcript_model(self) -> TranscriptListModel:
        model = self.model()
        assert isinstance(model, TranscriptListModel)
        return model

    @traces(SWR.SWR_2432)
    def set_events(self, events: list[TranscriptEvent]) -> bool:
        """Feed the transcript; returns True when the displayed rows changed.

        The single entry point for both transcript surfaces, so grouping is
        applied once here rather than at every call site.
        """
        self._source_events = list(events)
        return self.transcript_model.sync(self._display_events())

    @traces(SWR.SWR_2432)
    def _display_events(self) -> list[TranscriptEvent]:
        if self._group_tools_getter is None or not self._group_tools_getter():
            return list(self._source_events)
        return group_tool_runs(self._source_events, self._delegate.expanded_groups)

    @traces(SWR.SWR_2432)
    def refresh_grouping(self, *, force_layout: bool = False) -> None:
        """Re-project after a group toggle or a change to the grouping setting.

        `force_layout` is for the changes that leave the rows themselves alone
        and only alter their heights — auto-collapse is the one that does that.
        Everything else lays out only when the projection actually moved, since
        measuring every row is the most expensive thing this view does and must
        never be a reflex to an unrelated refresh.
        """
        saved_scroll = self.verticalScrollBar().value()
        follow_tail = self._following_tail
        if self.transcript_model.sync(self._display_events()):
            self.restore_after_model_change(saved_scroll, follow_tail)
        elif not force_layout:
            return
        self.doItemsLayout()
        self.viewport().update()

    @traces(SWR.SWR_2447, SWR.SWR_2432)
    def _live_rows(self) -> list[int]:
        """Rows that still count upward (thinking or running tool), tail first.

        Only the tail can be live — streamed rows are always appended last —
        so a bounded scan keeps this O(1) per sync.
        """
        events = self.transcript_model.events
        start = max(0, len(events) - _LIVE_ROW_SCAN)
        return [
            start + offset for offset, event in enumerate(events[start:]) if _is_live_event(event)
        ]

    @traces(SWR.SWR_2447)
    def _has_live_rows(self) -> bool:
        return bool(self._live_rows())

    @traces(SWR.SWR_2447)
    @traces(SWR.SWR_2428)
    def _update_live_timer(self) -> None:
        rows = self._live_rows()
        if not rows:
            self._live_repaint.stop()
            return
        events = self.transcript_model.events
        streaming = any(is_terminal_event(events[row]) for row in rows if row < len(events))
        interval = _TERMINAL_TICK_MS if streaming else _LIVE_TICK_MS
        if self._live_repaint.interval() != interval:
            self._live_repaint.setInterval(interval)
        if not self._live_repaint.isActive():
            self._live_repaint.start()

    @traces(SWR.SWR_2447)
    def _on_live_tick(self) -> None:
        """Repaint the counting rows only — not the whole viewport.

        A full viewport update re-paints every visible row once a second, and a
        painted row that is not in the document cache is re-laid-out. Touching
        the two or three rows that actually changed keeps a live run from
        shimmering the transcript above it.
        """
        rows = self._live_rows()
        if not rows:
            self._live_repaint.stop()
            return
        model = self.transcript_model
        for row in rows:
            self.update(model.index(row, 0))

    @property
    def transcript_delegate(self) -> TranscriptDelegate:
        return self._delegate

    def set_auto_collapse_getter(self, getter: Callable[[], bool]) -> None:
        """Wire the auto-collapse preference so the delegate can read it on every paint."""
        self._delegate._auto_collapse_getter = getter

    @traces(SWR.SWR_2432)
    def set_group_tools_getter(self, getter: Callable[[], bool]) -> None:
        """Wire the tool-call grouping preference, read on every re-projection."""
        self._group_tools_getter = getter

    @traces(SWR.SWR_2428)
    def set_terminal_screens(self, provider: Callable[[str], TerminalScreen | None]) -> None:
        """Wire terminal rows to their live screens; safe to call more than once."""
        self._delegate.set_screen_provider(provider)

    def set_store_and_bridge(self, store: WorkspaceStore, bridge: RunBridge | None) -> None:
        """Wire up pending_questions_changed and answer resolution."""
        self._run_bridge = bridge
        store.pending_questions_changed.connect(self._on_pending_questions_changed)
        store.pending_approvals_changed.connect(self._on_pending_approvals_changed)

    @traces(SWR.SWR_2504)
    def _on_pending_approvals_changed(self, pending: object) -> None:
        """Open, advance, or close the approval modal as requests come and go.

        A blocked tool call needs an answer now, so the first pending request
        opens its modal without waiting for the user to find the transcript row;
        further requests queue behind it.
        """
        incoming = pending if isinstance(pending, tuple | list) else ()
        self._pending_approvals = tuple(dict(item) for item in incoming if isinstance(item, dict))
        modal = self._approval_modal
        if modal is not None:
            shown = modal.request_id
            if any(item.get("request_id") == shown for item in self._pending_approvals):
                return
            # The shown request is gone (answered elsewhere, timed out, run
            # ended) — close it without sending a second, stale decision.
            self._close_approval_modal()
        if self._pending_approvals:
            self.open_approval_dialog()

    @traces(SWR.SWR_2504)
    def open_approval_dialog(self) -> None:
        """Show the oldest pending approval; no-op when one is already open."""
        if self._approval_modal is not None or not self._pending_approvals:
            return
        from rotaris.widgets.approval_dialog import ApprovalDialog

        modal = ApprovalDialog(self)
        modal.decided.connect(self._on_approval_decided)
        modal.set_request(self._pending_approvals[0])
        self._approval_modal = modal
        modal.show()

    def _on_approval_decided(self, option: str) -> None:
        """Deliver one decision to the waiting agent."""
        modal = self._approval_modal
        if modal is None:
            return
        request_id = modal.request_id
        delivered = self._run_bridge is not None and self._run_bridge.resolve_approval(
            request_id,
            option,
        )
        if not delivered:
            modal.show_error(
                "Could not deliver the decision. The waiting agent is no longer available."
            )
            return
        modal.complete_decision()
        modal.deleteLater()
        self._approval_modal = None
        # Remaining requests belong to other agents that are still blocked.
        self._pending_approvals = tuple(
            item for item in self._pending_approvals if item.get("request_id") != request_id
        )
        if self._pending_approvals:
            self.open_approval_dialog()

    def _close_approval_modal(self) -> None:
        """Close the modal without deciding (its request is already resolved)."""
        modal = self._approval_modal
        self._approval_modal = None
        if modal is not None:
            modal.blockSignals(True)
            modal.close()
            modal.deleteLater()

    def _on_pending_questions_changed(self, pending: dict[str, Any] | None) -> None:
        """Cache exact prompt identity for the projected stepper row."""
        if not pending:
            self._stepper_questions = None
            self._stepper_agent_id = ""
            self._stepper_prompt_id = ""
            self._close_stepper_modal()
            return
        raw_steps = pending.get("steps")
        if not isinstance(raw_steps, list) or not raw_steps:
            return

        # Parse steps and insert a trigger row
        from rotaris.models.state import QuestionOption, QuestionStep

        try:
            steps = [
                QuestionStep(
                    id=s["id"],
                    title=s["title"],
                    description=s.get("description", ""),
                    options=tuple(
                        QuestionOption(label=o["label"], description=o.get("description", ""))
                        for o in s.get("options", [])
                    ),
                    allow_freeform=s.get("allow_freeform", True),
                )
                for s in raw_steps
            ]
        except (KeyError, TypeError):
            return

        self._stepper_questions = steps
        self._stepper_agent_id = str(pending.get("agent_id", ""))
        self._stepper_prompt_id = str(pending.get("prompt_id", ""))

    def _open_question_stepper(self, row: int) -> None:
        """Open the QuestionStepper modal for the pending questions."""
        if self._stepper_modal is not None:
            return
        if self._stepper_questions is None:
            return
        from rotaris.widgets.question_stepper import QuestionStepper

        self._stepper_modal = QuestionStepper(self)
        self._stepper_modal.answers_submitted.connect(self._on_answers_submitted)
        self._stepper_modal.cancelled.connect(self._on_questions_cancelled)
        self._stepper_modal.set_questions(list(self._stepper_questions))
        self._stepper_modal.show()

    def _on_answers_submitted(self, answers: object) -> None:
        """Forward answers to the bridge for barrier resolution."""
        if self._run_bridge is None or not self._run_bridge.resolve_questions(
            self._stepper_agent_id,
            self._stepper_prompt_id,
            answers,
        ):
            if self._stepper_modal is not None:
                self._stepper_modal.show_error(
                    "Could not deliver answers. The waiting agent is no longer available."
                )
            return
        if self._stepper_modal is not None:
            modal = self._stepper_modal
            modal.complete_submission()
            modal.deleteLater()
        self._stepper_modal = None

    def _on_questions_cancelled(self) -> None:
        modal = self._stepper_modal
        if self._run_bridge is not None:
            self._run_bridge.cancel_questions(
                self._stepper_agent_id,
                self._stepper_prompt_id,
            )
        self._stepper_modal = None
        if modal is not None:
            modal.deleteLater()

    def _close_stepper_modal(self) -> None:
        """Close and clean up the stepper modal."""
        if self._stepper_modal is not None:
            self._stepper_modal.blockSignals(True)
            self._stepper_modal.close()
            self._stepper_modal.deleteLater()
            self._stepper_modal = None

    @property
    def following_tail(self) -> bool:
        return self._following_tail

    def set_following_tail(self, following: bool) -> None:
        if following == self._following_tail:
            if following:
                self._pin_to_tail()
            return
        self._following_tail = following
        self.setProperty("followingTail", following)
        self.style().unpolish(self)
        self.style().polish(self)
        self.viewport().update()
        if following:
            self._pin_to_tail()

    def restore_after_model_change(self, saved_scroll: int, following_tail: bool) -> None:
        self.set_following_tail(following_tail)
        if not following_tail:
            self.verticalScrollBar().setValue(saved_scroll)

    def _pin_to_tail(self) -> None:
        """Scroll to the bottom once per event-loop turn.

        Batched layout means the scrollbar's maximum grows in steps after rows
        are inserted, so an append fires several pin requests — the explicit one
        from the refresh, then one per `rangeChanged`. Pinning on each of them
        moves the viewport several times in as many frames, which is the jump
        that reads as flicker. Coalescing lands the tail exactly once, after the
        layout has settled.
        """
        scrollbar = self.verticalScrollBar()
        scrollbar.setValue(scrollbar.maximum())
        if self._pin_pending:
            return
        self._pin_pending = True
        QTimer.singleShot(0, self._settle_tail)

    def _settle_tail(self) -> None:
        self._pin_pending = False
        if not self._following_tail:
            return
        scrollbar = self.verticalScrollBar()
        scrollbar.setValue(scrollbar.maximum())

    def _scroll_range_changed(self, _minimum: int, _maximum: int) -> None:
        if self._following_tail:
            self._pin_to_tail()

    def _scroll_action_triggered(self, action: int) -> None:
        upward_actions = {
            QAbstractSlider.SliderAction.SliderSingleStepSub.value,
            QAbstractSlider.SliderAction.SliderPageStepSub.value,
            QAbstractSlider.SliderAction.SliderToMinimum.value,
        }
        if action in upward_actions:
            self.set_following_tail(False)
        QTimer.singleShot(0, self._sync_tail_state_from_position)

    def _slider_moved(self, value: int) -> None:
        self.set_following_tail(value == self.verticalScrollBar().maximum())

    def _sync_tail_state_from_position(self) -> None:
        scrollbar = self.verticalScrollBar()
        self.set_following_tail(scrollbar.value() == scrollbar.maximum())

    def copy_selected_message(self) -> bool:
        event = self.transcript_model.event_at(self.currentIndex().row())
        if event is None:
            return False
        text = group_summary_text(event) if event.kind == "tool_group" else event.text
        QGuiApplication.clipboard().setText(text)
        return True

    @override
    def resizeEvent(self, event: QResizeEvent) -> None:
        scrollbar = self.verticalScrollBar()
        saved_scroll = scrollbar.value()
        super().resizeEvent(event)
        self.doItemsLayout()
        if self._following_tail:
            self._pin_to_tail()
        else:
            scrollbar.setValue(saved_scroll)

    @override
    def keyPressEvent(self, event: QKeyEvent) -> None:
        if event.matches(QKeySequence.StandardKey.Copy) and self.copy_selected_message():
            event.accept()
            return
        super().keyPressEvent(event)
        QTimer.singleShot(0, self._sync_tail_state_from_position)

    def _show_copy_menu(self, point: QPoint) -> None:
        index = self.indexAt(point)
        if index.isValid():
            self.setCurrentIndex(index)
        menu = self._build_copy_menu()
        menu.exec(self.viewport().mapToGlobal(point))

    @traces(SWR.SWR_2449)
    def _build_copy_menu(self) -> QMenu:
        menu = QMenu(self)
        copy_action = menu.addAction("Copy message")
        copy_action.setEnabled(self.currentIndex().isValid())
        copy_action.triggered.connect(self.copy_selected_message)
        event = self.transcript_model.event_at(self.currentIndex().row())
        if event is not None and event.kind == "tool":
            clipboard = QGuiApplication.clipboard()
            tool_input = event.full_text or event.text
            tool_output = event.full_detail or event.detail
            input_action = menu.addAction("Copy tool input")
            input_action.setEnabled(bool(tool_input))
            input_action.triggered.connect(lambda: clipboard.setText(tool_input))
            output_action = menu.addAction("Copy tool output")
            output_action.setEnabled(bool(tool_output))
            output_action.triggered.connect(lambda: clipboard.setText(tool_output))
        return menu


@traces(SWR.SWR_2417, SWR.SWR_2419, SWR.SWR_2420, SWR.SWR_2422, SWR.SWR_2433)
@traces(SWR.SWR_2444, SWR.SWR_2445, SWR.SWR_2446, SWR.SWR_2909)
def _event_html(
    row: int,
    event: TranscriptEvent,
    expanded: bool,
    tool_expanded: bool = False,
    auto_collapsed: bool = False,
    delegation_collapsed: bool = False,
    group_expanded: bool = False,
    screen: TerminalScreen | None = None,
) -> str:
    if event.kind == "tool_group":
        return _tool_group_html(row, event, group_expanded)
    if event.kind == "delegation_context":
        return _delegation_context_html(row, event, delegation_collapsed)
    if event.kind == "message":
        return markdown_to_html(event.text)
    if event.kind == "question_stepper":
        t = tokens()
        steps_summary = event.text
        return (
            f'<span style="font-family:{t.type.mono}">'
            f'<span style="color:{t.color.wait_text};font-weight:600">?</span> '
            f'<span style="color:{t.color.text};font-weight:600">input needed</span></span><br>'
            f'<span style="color:{t.color.text_tertiary}">{_plain_html(steps_summary)}</span> '
            f'<a href="rotaris-questions:{row}" '
            f'style="font-weight:600">answer →</a>'
        )
    if event.kind == "approval":
        t = tokens()
        return (
            f'<span style="font-family:{t.type.mono}">'
            f'<span style="color:{t.color.fail_text};font-weight:600">!</span> '
            f'<span style="color:{t.color.text};font-weight:600">permission required</span></span>'
            f'<br><span style="color:{t.color.text_tertiary}">{_plain_html(event.text)}</span> '
            f'<a href="rotaris-approval:{row}" style="font-weight:600">decide →</a>'
        )
    if event.kind == "tool":
        return _tool_html(row, event, tool_expanded, auto_collapsed, screen)
    if event.kind == "verifier":
        return _verifier_html(row, event, tool_expanded)
    if event.kind == "edit_diff" and event.diff is not None:
        return _diff_html(event.diff)
    if event.kind == "thinking":
        return _thinking_html(row, event, expanded)
    return _plain_html(event.text)


#: Status glyphs older sessions baked into the result detail (SWR-2444).
_LEGACY_STATUS_PREFIXES = (("✓ ", "ok"), ("✗ ", "failed"), ("! ", "blocked"))

#: A live thinking row whose duration never got stamped (killed process) stops
#: counting after this long and falls back to a plain finished header.
_STALE_THINKING_SECONDS = 3600.0


def _legacy_status(detail: str) -> tuple[str, str]:
    """Split a legacy glyph prefix off the detail: (status, clean_detail)."""
    for prefix, status in _LEGACY_STATUS_PREFIXES:
        if detail.startswith(prefix):
            return status, detail[len(prefix) :]
    return "", detail


def _tokens_label(char_count: int) -> str:
    return f"~{char_count // 4:,} tok"


def _duration_label(seconds: float) -> str:
    """`3.2s` under a minute, `14m 40s` above — the comp's duration idiom."""
    if seconds >= 60:
        minutes, secs = divmod(int(seconds), 60)
        return f"{minutes}m {secs:02d}s"
    return f"{seconds:g}s"


def _pulse_color() -> str:
    """1 Hz blink for live-row dots, driven by the existing repaint tick."""
    color = tokens().color
    # The blinking ◉ is a shape, not a word, so it takes the graphical step of
    # the amber rather than the lighter one the label beside it is painted in.
    return color.wait if int(time.time()) % 2 == 0 else color.neutral[700]


def _rail_panel(rail_color: str, inner_html: str, boxed: bool = False) -> str:
    """Content beside a 2px colour rail — the Nocturne card accent, in rich text.

    QTextDocument has no per-side borders, so the rail is a narrow filled cell.
    ``boxed`` adds the card surface and outline around the content cell.
    """
    t = tokens()
    box = (
        f"background:{t.color.surface};border:{t.size.hairline}px solid {t.color.border};"
        if boxed
        else ""
    )
    return (
        f'<table cellspacing="0" cellpadding="0" width="100%" style="margin-top:4px">'
        f'<tr><td width="2" bgcolor="{rail_color}"></td>'
        f'<td style="{box}"><div style="margin:5px 8px">{inner_html}</div></td></tr></table>'
    )


def _status_shape_color(status: str) -> Color | None:
    """Rail colour for a structured tool status; ``None`` when it has no verdict.

    A rail is a 2px filled cell — a shape, which owes 3:1 — so it takes the
    saturated middle of the ramp. Its label takes :func:`_status_text_color`.
    """
    color = tokens().color
    return {
        "running": color.wait,
        "ok": color.run,
        "failed": color.fail,
        "blocked": color.fail,
    }.get(status)


def _status_text_color(status: str) -> Color | None:
    """The same four verdicts painted as words, which owe the 4.5:1 text floor."""
    color = tokens().color
    return {
        "running": color.wait_text,
        "ok": color.run_text,
        "failed": color.fail_text,
        "blocked": color.fail_text,
    }.get(status)


def _verifier_accent() -> Color:
    """Accent for check rows (SWR-2609).

    The verifier persona already owns a colour in the ramp, and a check is that
    persona's work — reusing it keeps one idea one colour instead of introducing
    a second "not an agent" hue.
    """
    return theme.persona_color("verifier")


def _tool_outcome_html(status: str, duration: float) -> str:
    """Trailing outcome — `ok · 3.2s` in the status colour, comp idiom."""
    t = tokens()
    color = _status_text_color(status) or t.color.text_tertiary
    if status == "running":
        return (
            f' <span style="color:{_pulse_color()}">◉</span>'
            f' <span style="color:{t.color.wait_text}">running…</span>'
        )
    parts = [status] if status else []
    if duration:
        parts.append(_duration_label(duration))
    if not parts:
        return ""
    return f' <span style="color:{color}">{" · ".join(parts)}</span>'


def _effective_tool_fields(event: TranscriptEvent) -> tuple[str, str, str]:
    """(status, detail, full_detail) with any legacy glyph prefix normalised."""
    status, detail, full_detail = event.status, event.detail, event.full_detail
    if not status:
        status, detail = _legacy_status(detail)
        _, full_detail = _legacy_status(full_detail)
    return status, detail, full_detail


@traces(SWR.SWR_2444, SWR.SWR_2445)
def _tool_html(
    row: int,
    event: TranscriptEvent,
    tool_expanded: bool,
    auto_collapsed: bool,
    screen: TerminalScreen | None = None,
) -> str:
    t = tokens()
    status, detail, full_detail = _effective_tool_fields(event)
    effective_expanded = tool_expanded and not auto_collapsed
    # Same interactivity rule as before the redesign (SWR-2417): only rows with
    # something beyond the truncated preview expand.
    has_more = bool(event.full_text or full_detail) and (
        event.full_text != event.text or full_detail != detail
    )
    interactive = has_more or auto_collapsed
    chevron = "▾" if effective_expanded else "▸"
    head = (
        f'<span style="color:{t.color.info_text};font-weight:600">'
        f"{chevron} {html.escape(event.tool or 'tool')}</span>"
    )
    if interactive:
        head = f'<a href="rotaris-tool:{row}" style="text-decoration:none">{head}</a>'
    if auto_collapsed:
        # Auto-collapsed rows carry the chevron and tool name only — no
        # summary, no preview, no panel (SWR-2420).
        return head
    if event.text and event.text != event.tool:
        head += f' <span style="color:{t.color.text_secondary}">{_plain_html(event.text)}</span>'
    head += _tool_outcome_html(status, event.duration)
    if is_terminal_event(event) and screen is not None:
        # A running shell command shows its own output, live, instead of a
        # truncated one-line summary — that is the whole point of the row.
        # A finished one, and one reloaded from disk with no stream left to
        # read, fall through to the ordinary tool rendering below, so a result
        # reads the same way however the session was opened.
        return _terminal_preview_html(row, event, screen, head)
    if not effective_expanded:
        return _collapsed_tool_html(head, detail)
    panel = _tool_panel_html(
        event.full_text or event.text,
        full_detail or detail,
        _status_shape_color(status) or t.color.neutral[700],
    )
    return head + panel


#: Lines of the live terminal screen the transcript preview shows.  Enough to
#: read a failing test's traceback tail; short enough that one command cannot
#: push the rest of the conversation off the screen (SWR-2428).
_TERMINAL_PREVIEW_ROWS = 12

#: Tools whose rows carry a live terminal preview.
_TERMINAL_TOOLS = frozenset({"terminal", "bash"})


@traces(SWR.SWR_2428)
def is_terminal_event(event: TranscriptEvent) -> bool:
    """True when this row is a shell command, and so previewable."""
    return event.kind == "tool" and event.tool.strip().lower() in _TERMINAL_TOOLS


@traces(SWR.SWR_2428)
def _terminal_cell_html(cell: TerminalCell) -> str:
    """One painted character, carrying only the styling it actually differs by."""
    styles: list[str] = []
    fg, bg = cell.fg, cell.bg
    if cell.reverse:
        fg, bg = bg, fg
    colour = theme.terminal_color(fg, background=False)
    if colour != tokens().color.terminal_fg:
        styles.append(f"color:{colour}")
    if bg != "default" or cell.reverse:
        styles.append(f"background:{theme.terminal_color(bg, background=True)}")
    if cell.bold:
        styles.append("font-weight:600")
    if cell.italics:
        styles.append("font-style:italic")
    if cell.underscore:
        styles.append("text-decoration:underline")
    char = html.escape(cell.char).replace(" ", "&nbsp;")
    if not styles:
        return char
    return f'<span style="{";".join(styles)}">{char}</span>'


@traces(SWR.SWR_2428)
def _terminal_screen_html(screen: TerminalScreen, rows: int) -> str:
    """The tail of an emulated screen, with its colour, as transcript HTML.

    Rendered from the emulator rather than from raw text on purpose: a progress
    bar that rewrote its own line renders as one line here, exactly as it does
    in the terminal, instead of as forty.
    """
    grid = screen.tail_grid(rows)
    if not grid:
        return ""
    lines: list[str] = []
    for row in grid:
        trimmed = list(row)
        while trimmed and trimmed[-1].blank:
            trimmed.pop()
        lines.append("".join(_terminal_cell_html(cell) for cell in trimmed) or "&nbsp;")
    return "<br>".join(lines)


@traces(SWR.SWR_2428)
def _terminal_preview_html(
    row: int,
    event: TranscriptEvent,
    screen: TerminalScreen,
    head: str,
) -> str:
    """A terminal row: its header, the live tail, and the way into the window."""
    t = tokens()
    body = _terminal_screen_html(screen, _TERMINAL_PREVIEW_ROWS)
    if not body:
        detail = event.full_detail or event.detail
        body = _plain_html(detail) if detail else ""
    # A live command rails in the "running" teal rather than the amber every
    # other unfinished row uses: here the output underneath is already moving,
    # and the rail says which stream it belongs to.
    rail = (
        t.color.run
        if event.status == "running"
        else (_status_shape_color(event.status) or t.color.neutral[700])
    )
    parts: list[str] = []
    if screen.truncated:
        parts.append(
            f'<div style="color:{t.color.text_tertiary};'
            f'font-size:{t.type.scale.x2s}px">earlier output dropped</div>'
        )
    if body:
        parts.append(
            f'<div style="font-family:{t.type.mono};font-size:{t.type.scale.xs}px;'
            f"color:{t.color.terminal_fg};background:{t.color.terminal_bg};"
            f'padding:6px;border-radius:{t.radius.sm}px">{body}</div>'
        )
    if event.stream_id:
        parts.append(
            f'<div style="margin-top:2px">'
            f'<a href="rotaris-terminal:{row}" '
            f'style="color:{t.color.accent[400]};text-decoration:none;'
            f'font-size:{t.type.scale.x2s}px">'
            "open terminal →</a></div>"
        )
    if not parts:
        return head
    return head + _rail_panel(rail, "".join(parts), boxed=True)


def _group_fields(event: TranscriptEvent) -> dict[str, Any]:
    """Decode a group header's payload; an unreadable one degrades to empty."""
    try:
        fields = json.loads(event.text)
    except json.JSONDecodeError:
        return {}
    return fields if isinstance(fields, dict) else {}


@traces(SWR.SWR_2432)
def _group_outcome_html(event: TranscriptEvent, fields: dict[str, Any]) -> str:
    """Trailing outcome for a group — a live clock, then the settled tally."""
    t = tokens()
    if int(fields.get("running") or 0):
        elapsed = max(0.0, time.time() - event.started_at) if event.started_at else 0.0
        clock = f" {int(elapsed)}s" if event.started_at else ""
        return (
            f' <span style="color:{_pulse_color()}">◉</span>'
            f' <span style="color:{t.color.wait_text}">running…{clock}</span>'
        )
    parts: list[tuple[str, Color]] = []
    if event.duration:
        parts.append((_duration_label(event.duration), t.color.text_tertiary))
    tally = (
        ("ok", t.color.run_text),
        ("failed", t.color.fail_text),
        ("blocked", t.color.fail_text),
    )
    for name, color in tally:
        counted = int(fields.get(name) or 0)
        if counted:
            parts.append((f"{counted} {name}", color))
    if not parts:
        return ""
    separator = f'<span style="color:{t.color.text_tertiary}"> · </span>'
    rendered = separator.join(
        f'<span style="color:{color}">{html.escape(label)}</span>' for label, color in parts
    )
    return f"{separator}{rendered}"


@traces(SWR.SWR_2432)
def _tool_group_html(row: int, event: TranscriptEvent, expanded: bool) -> str:
    """One run of same-family tool calls, as a single row.

    Collapsed it reads ``▸ reading ×17 · 14.5s · 17 ok``. While the run is live
    the header counts upward and a grey ``⤷`` line underneath carries the call
    currently executing, so a wall of identical rows becomes one row that says
    what is happening and to which argument.
    """
    t = tokens()
    fields = _group_fields(event)
    family = str(fields.get("family") or event.tool or "tool")
    count = int(fields.get("count") or 0)
    chevron = "▾" if expanded else "▸"
    head = (
        f'<a href="rotaris-group:{row}" style="text-decoration:none">'
        f'<span style="color:{t.color.info_text};font-weight:600">'
        f"{chevron} {html.escape(family)}</span>"
        f'<span style="color:{t.color.text_tertiary}"> ×{count}</span></a>'
    )
    head += _group_outcome_html(event, fields)
    current = str(fields.get("current") or "")
    if int(fields.get("running") or 0) and current:
        return _collapsed_tool_html(head, current)
    return head


@traces(SWR.SWR_2609)
def _verifier_html(row: int, event: TranscriptEvent, tool_expanded: bool) -> str:
    """One check of the post-change suite, as a live row.

    Deliberately not a tool row: an agent did not call this. It is the
    workspace's own check, so it carries the verifier accent and says ``verify``
    rather than borrowing the tool colour a user reads as "the model did
    something". While it runs the row counts upward from ``started_at``, which
    is the whole point — a ten-minute check must never look like a stalled run.
    """
    t = tokens()
    status, detail, full_detail = _effective_tool_fields(event)
    chevron = "▾" if tool_expanded else "▸"
    head = (
        f'<span style="color:{_verifier_accent()};font-weight:600">'
        f"{chevron} verify</span> "
        f'<span style="color:{t.color.text};font-weight:600">'
        f"{html.escape(event.tool or 'check')}</span>"
    )
    if bool(event.full_text or full_detail):
        head = f'<a href="rotaris-tool:{row}" style="text-decoration:none">{head}</a>'
    if event.text and event.text != event.tool:
        head += f' <span style="color:{t.color.text_secondary}">{_plain_html(event.text)}</span>'
    head += _verifier_outcome_html(status, event.duration, event.started_at)
    if not tool_expanded:
        return _collapsed_tool_html(head, detail)
    panel = _tool_panel_html(
        event.full_text or event.text,
        full_detail or detail,
        _status_shape_color(status) or _verifier_accent(),
    )
    return head + panel


@traces(SWR.SWR_2609)
def _verifier_outcome_html(status: str, duration: float, started_at: float) -> str:
    """Trailing outcome for a check — a live clock, then its settled verdict."""
    if status != "running":
        return _tool_outcome_html(status, duration)
    elapsed = max(0.0, time.time() - started_at) if started_at else 0.0
    return (
        f' <span style="color:{_pulse_color()}">◉</span>'
        f' <span style="color:{tokens().color.wait_text}">running… {int(elapsed)}s</span>'
    )


def _collapsed_tool_html(head: str, detail: str) -> str:
    """Header plus the one-line `⤷` result preview when there is one."""
    if not detail:
        return head
    color = tokens().color
    return (
        f'{head}<br><span style="color:{color.neutral[700]}">⤷</span> '
        f'<span style="color:{color.text_tertiary}">{_plain_html(detail)}</span>'
    )


@traces(SWR.SWR_2445)
def _tool_panel_html(full_in: str, full_out: str, rail_color: str) -> str:
    """Expanded tool body: a Nocturne rail card with INPUT/OUTPUT micro-labels."""
    t = tokens()
    sections = []
    for label, text, color in (
        ("INPUT", full_in, t.color.neutral[300]),
        ("OUTPUT", full_out, t.color.text_secondary),
    ):
        if not text:
            continue
        sections.append(
            f'<div style="color:{t.color.text_tertiary};'
            f'font-size:{t.type.scale.x2s}px;font-weight:600">'
            f"{label}</div>"
            f'<div style="color:{color}">{_plain_html(text)}</div>'
        )
    if not sections:
        return ""
    return _rail_panel(rail_color, "".join(sections), boxed=True)


@traces(SWR.SWR_2446)
def _thinking_html(row: int, event: TranscriptEvent, expanded: bool) -> str:
    t = tokens()
    live = False
    elapsed = event.duration
    if not elapsed and event.started_at:
        candidate = max(0.0, time.time() - event.started_at)
        if candidate < _STALE_THINKING_SECONDS:
            live = True
            elapsed = candidate

    metrics = []
    if elapsed:
        metrics.append(f"{int(elapsed)}s" if live else _duration_label(elapsed))
    if event.char_count:
        metrics.append(_tokens_label(event.char_count))
    metrics_html = "".join(f" · {html.escape(part)}" for part in metrics)

    # Reasoning speaks in the accent family — tool rows own the teal.
    if live:
        head = (
            f'<span style="color:{_pulse_color()}">◉</span> '
            f'<span style="color:{t.color.wait_text};font-weight:600">reasoning…</span>'
        )
    else:
        chevron = "▾" if expanded else "▸"
        head = (
            f'<span style="color:{t.color.accent[400]};font-weight:600">{chevron} reasoning</span>'
        )
    header = (
        f'<a href="rotaris-reasoning:{row}" style="text-decoration:none">'
        f'<span style="font-family:{t.type.mono}">{head}'
        f'<span style="color:{t.color.text_tertiary}">{metrics_html}</span></span></a>'
    )
    if expanded and event.text:
        body = (
            f'<span style="font-style:italic;color:{t.color.text_secondary}">'
            f"{_plain_html(event.text)}</span>"
        )
        return header + _rail_panel(t.color.accent[800], body)
    return header


@traces(SWR.SWR_2433, SWR.SWR_2435, SWR.SWR_2909)
def _delegation_context_html(row: int, event: TranscriptEvent, collapsed: bool) -> str:
    try:
        fields = json.loads(event.text)
    except json.JSONDecodeError:
        fields = {}
    t = tokens()
    task_name = str(fields.get("task_name") or event.role)
    persona = str(fields.get("persona") or event.persona)
    persona_color = theme.persona_instance_color(persona, event.role)
    chevron = "▸" if collapsed else "▾"
    summary = (
        f'<a href="rotaris-delegation:{row}" style="text-decoration:none">'
        f'<span style="font-family:{t.type.mono}">'
        f'<span style="color:{t.color.info_text};font-weight:600">{chevron} delegate</span> '
        f'<span style="color:{persona_color};font-weight:600">{html.escape(task_name)}</span>'
        f'<span style="color:{t.color.text_tertiary}"> · {html.escape(persona)}</span>'
        f"</span></a>"
    )
    if collapsed:
        return summary

    details = []
    category = fields.get("category")
    mode = "background" if fields.get("run_in_background") else "blocking"
    meta = [f"Mode: {mode}"]
    if category:
        meta.insert(0, f"Category: {category}")
    details.append(html.escape("  ·  ".join(meta)))
    task = str(fields.get("task") or "")
    if task:
        details.append(
            f'<div style="margin-top:4px;white-space:pre-wrap">{_plain_html(task)}</div>'
        )
    depends_on = [str(item) for item in fields.get("depends_on") or []]
    if depends_on:
        details.append(f"Depends on: {html.escape(', '.join(depends_on))}")
    inherited_context = [str(item) for item in fields.get("inherited_context") or []]
    if inherited_context:
        details.append(f"Inherited context: {html.escape(', '.join(inherited_context))}")
    return summary + _rail_panel(persona_color, "<br>".join(details))


@traces(SWR.SWR_2419)
def _diff_html(diff: TranscriptDiff) -> str:
    t = tokens()
    # Every one of these is a *word* — a count, a marker, a line of source — so
    # they take the text step of each axis, not the saturated one a dot uses.
    created = f' <span style="color:{t.color.info_text}">[Created]</span>' if diff.created else ""
    rendered = [
        f"<strong>{html.escape(diff.path)}</strong>{created} "
        f'<span style="color:{t.color.run_text}">+{diff.added_lines}</span> '
        f'<span style="color:{t.color.fail_text}">-{diff.removed_lines}</span>'
    ]
    colors = {
        "context": t.color.text_secondary,
        "add": t.color.run_text,
        "delete": t.color.fail_text,
    }
    prefixes = {"context": " ", "add": "+", "delete": "-"}
    for entry in diff.entries:
        rendered.append(
            f'<span style="color:{t.color.text_tertiary}">[{entry.line_number}]</span>'
            f'<span style="color:{colors[entry.kind]}">'
            f"{prefixes[entry.kind]} {html.escape(entry.text)}</span>"
        )
    if diff.truncated and diff.remaining_changed_lines:
        rendered.append(
            f'<span style="color:{t.color.text_tertiary}">'
            f"… +{diff.remaining_changed_lines} more lines, diff truncated</span>"
        )
    return "<br>".join(rendered)


def _plain_html(text: str) -> str:
    return html.escape(text).replace("\n", "<br>")


def _document_css(kind: str) -> str:
    t = tokens()
    scale = t.type.scale
    # A Markdown heading inside a transcript row labels a section of one
    # message, not a page. Qt's own `h1` is 2em of the row's 13px body, which
    # reads as a different message arriving rather than as a heading in this
    # one — so the ladder is re-cut from the type scale, tight enough that the
    # three levels a model actually writes stay distinguishable side by side.
    return (
        f"a{{color:{t.color.accent[300]};text-decoration:underline;}}"
        "p{margin:0 0 6px 0;} ul,ol{margin-top:2px;margin-bottom:6px;}"
        f"h1{{font-size:{scale.md}px;margin:8px 0 4px 0;}}"
        f"h2{{font-size:{scale.base}px;margin:8px 0 4px 0;}}"
        f"h3,h4,h5,h6{{font-size:{scale.sm}px;margin:6px 0 3px 0;}}"
    )


def _document_style(kind: str) -> str:
    t = tokens()
    color = {
        "user": t.color.text,
        "system": t.color.text_secondary,
        "intent": t.color.text_secondary,
        "thinking": t.color.text_tertiary,
        "tool": t.color.text_secondary,
        "tool_group": t.color.text_secondary,
        "verifier": t.color.text_secondary,
        "delegation_context": t.color.neutral[300],
    }.get(kind, t.color.neutral[300])
    family = t.type.mono if kind in {"tool", "tool_group", "verifier", "edit_diff"} else t.type.body
    return f"color:{color};font-family:{family};font-size:{t.type.scale.sm}px;"


_FIXED_ROLES = frozenset({"you", "intent", "system", "orchestrator"})


@traces(SWR.SWR_2906)
def transcript_attribution(events: list[TranscriptEvent], row: int) -> tuple[bool, str, str, str]:
    """Resolve the role-column attribution for *row*: (block_start, line1, line2, color).

    Consecutive same-role events form one attribution block. The block's first
    row carries the label — the persona display name over the agent's task
    name — and every later row inherits only the block colour, painted as a
    continuation bar in the role gutter.
    """
    event = events[row]
    color = _role_color(event.role, event.persona)
    if row > 0 and events[row - 1].role == event.role:
        return False, "", "", color
    if event.persona and event.role not in _FIXED_ROLES:
        line2 = "" if event.role == event.persona else event.role
        return True, theme.persona_display(event.persona), line2, color
    return True, event.role, "", color


@traces(SWR.SWR_2906)
def _attribution_label_height() -> int:
    """Row height needed to show both attribution label lines unclipped."""
    role_font = QFont()
    role_font.setPointSizeF(8.5)
    role_font.setBold(True)
    task_font = QFont()
    task_font.setPointSizeF(8.0)
    return (
        QFontMetrics(role_font).height() + 1 + QFontMetrics(task_font).height() + 2 * _ROW_MARGIN_Y
    )


@traces(SWR.SWR_2421, SWR.SWR_2435)
def _role_color(role: str, persona: str = "") -> str:
    # The block label is the primary use — a bold word in the role column — and
    # the continuation bar under it is the same colour narrowed to 2px. A value
    # that has to carry a word owes the text floor, so the axes resolve to their
    # text steps here, exactly as `persona_instance_color` does for the rest.
    color = tokens().color
    fixed = {
        "you": color.accent[300],
        "intent": color.info_text,
        "system": color.info_text,
        "orchestrator": color.accent[400],
    }.get(role)
    if fixed is not None:
        return fixed
    if persona:
        return theme.persona_instance_color(persona, role)
    return color.run_text
