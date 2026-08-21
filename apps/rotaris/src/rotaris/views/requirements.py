"""The Requirements view: the board, its filters, and the panes it opens.

This is the seventh primary view (SWR-3301). It renders one thing — the board
projection the engine produced (SWR-3216) — as the four surfaces a user needs:

- the **kanban board** over the delivery states (SWR-3302), one column per
  state, each column scrolling on its own and the row of columns scrolling
  horizontally, so nothing clips at the supported minimum of 1000×680;
- the **blocked strip** above them (SWR-3303), which is where a blocked
  requirement is unmissable: it is stated in words with its reason, it is
  reachable without scrolling any column, and each row *points at* the card's
  own column rather than being a second listing of it;
- **sorting and filtering** (SWR-3309), display-only and persisted, with the
  active filter stated so a filtered board is never mistaken for an empty one;
- and the **detail, evidence and graph** panes the board opens.

Everything the view shows is a value the projection carried. Nothing here
computes a health, an evidence state or an epic's progress (SWR-3311), and
nothing here writes: a drop, a move-bar press and a review decision all leave
this file as a signal, and what the move *means* is decided by
:mod:`rotaris.services.requirements_actions` against the engine's transition
matrix (SWR-3601, SWR-3609).

**A drop has a keyboard equivalent, and it is a visible control.** The move bar
above the board is a picker over every delivery column and one button, and the
three parts of it answer one question: the picker marks each column with the
engine's own reachability glyph, the sentence beside it says what the *picked*
column means for the selected requirement — the consequence, or the reason it is
refused — and the button is pressable exactly when that sentence says it should
be (SWR-3602). ``Ctrl+M`` aims it at the first reachable column. Dragging is the
same decision with a mouse: while a card is in the air, every column states in
words and with a glyph whether it can be dropped there, and a column that refuses
does so before the user lets go rather than by bouncing the card back afterwards
(SWR-3314, SWR-3601).

Two mechanics are worth reading before changing anything:

**The board follows the repository without blinking (SWR-3312).** A
re-evaluation arrives as a state *and* a :class:`~rotaris.services
.requirements_bridge.BoardDelta`. When the delta says no card was added, removed
or moved between columns, the affected cards are repainted in place and the
board is not rebuilt — which is what keeps the selection, the scroll position
and the open detail pane exactly where the user left them.

**The board pays per visible card, not per requirement (SWR-3317).** A column
keeps its model's ordered membership and realises widgets only for the band its
own scroll viewport shows, plus :data:`OVERSCAN` cards either side. Scrolling
recycles those widgets through ``set_card`` rather than creating more, a filter
change repaints the bands without tearing anything down, and the search box
debounces into that recompute. Which is why :attr:`RequirementsView.card_widgets`
means *realised* widgets and not board membership — :attr:`~RequirementsView
.columns` is the membership, and :meth:`~RequirementsView.reveal` is how a
caller makes one particular card exist.
"""

from __future__ import annotations

import json
import time
from bisect import bisect_left, bisect_right
from dataclasses import dataclass, field, replace
from typing import TYPE_CHECKING

from PySide6.QtCore import QEvent, QMimeData, QPoint, QSettings, QSize, Qt, QTimer, Signal
from PySide6.QtGui import (
    QColor,
    QDrag,
    QFont,
    QFontMetrics,
    QHideEvent,
    QMouseEvent,
    QPainter,
    QPalette,
    QPen,
    QShowEvent,
)
from PySide6.QtWidgets import (
    QAbstractButton,
    QApplication,
    QComboBox,
    QFrame,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QPushButton,
    QScrollArea,
    QSizePolicy,
    QStackedWidget,
    QStyle,
    QStyleOptionComboBox,
    QStylePainter,
    QToolButton,
    QVBoxLayout,
    QWidget,
)
from rotaris_core.reqtocode import SWR, traces

from rotaris import theme

# The engine's ordering, reached the way every other engine value reaches a board
# surface: through the models layer. This module may not import the engine itself
# (`test_no_board_surface_reaches_the_requirement_engine_at_all`), and it no
# longer carries a second natural-sort key of its own — see the module it comes
# from for what that one was and why it went.
from rotaris.models.requirement_order import requirement_sort_key
from rotaris.models.requirements_state import (
    DEFAULT_BOARD_AXIS,
    PassProgress,
    board_groupings,
    counted,
    grouping_for,
)
from rotaris.models.state import NoticeSeverity, UiNotice
from rotaris.theme import tokens
from rotaris.theme.manager import Themed
from rotaris.theme.phosphor import set_button_icon
from rotaris.views.requirement_detail import RequirementDetailView
from rotaris.views.requirement_graph import RequirementGraphView
from rotaris.widgets.cards import make_button, set_action_availability
from rotaris.widgets.evidence_ring import EvidenceView
from rotaris.widgets.feedback import EmptyState, InlineBanner
from rotaris.widgets.flow import FlowLayout
from rotaris.widgets.hold_reason import HoldReasonBar
from rotaris.widgets.requirement_card import (
    EpicCard,
    RequirementCardWidget,
    blocker_reason,
    card_fact,
    is_blocked,
)

if TYPE_CHECKING:
    from collections.abc import Callable, Iterable, Mapping

    from PySide6.QtCore import QObject
    from PySide6.QtGui import (
        QDragEnterEvent,
        QDragLeaveEvent,
        QDragMoveEvent,
        QDropEvent,
        QEnterEvent,
        QKeyEvent,
        QPaintEvent,
        QResizeEvent,
    )

    from rotaris.models.requirements_state import (
        ActionFeedback,
        PendingAction,
        QueueState,
        RequirementCard,
        RequirementDetail,
        RequirementsBoardState,
    )
    from rotaris.models.requirements_view import RequirementsBoardViewLike
    from rotaris.services.requirements_actions import MoveOption
    from rotaris.services.requirements_bridge import BoardDelta
    from rotaris.theme.spec import Theme

__all__ = [
    "AXIS_COLUMN_HINTS",
    "BLOCKED_COLUMN",
    "BoardColumnModel",
    "BoardFilter",
    "BoardPreferences",
    "CLOSED_COMBO_WIDTH",
    "COLUMN_ORDER",
    "MOVE_SHORTCUT_HINT",
    "OPEN_COMBO_WIDTH",
    "OVERSCAN",
    "PIPELINE_ENTRY_COLUMNS",
    "REQUIREMENT_MIME",
    "RequirementsView",
    "SEARCH_DEBOUNCE_MS",
    "SORT_ORDERS",
    "board_columns",
    "card_axis_value",
    "load_board_preferences",
    "matches",
    "pipeline_unused",
    "priority_rank",
    "requirement_sort_key",
    "save_board_preferences",
    "sort_cards",
    "visible_cards",
]

#: What a dragged requirement card carries. A private type rather than plain
#: text, so a drag from somewhere else in the application cannot be mistaken for
#: a requirement and dropped on a delivery column.
REQUIREMENT_MIME = "application/x-rotaris-requirement"

#: How the move bar announces its shortcut. Every drop this board offers has a
#: keyboard equivalent (SWR-3314) — the bar *is* that equivalent, and the
#: shortcut only puts the focus on it.
MOVE_SHORTCUT_HINT = "Ctrl+M"

#: The delivery states SWR-3302 names, in the order it names them. ``blocked``
#: is deliberately not in this tuple: it is not a stage of progress (SWR-3303).
COLUMN_ORDER: tuple[str, ...] = ("backlog", "ready", "running", "review", "needs-update", "done")

BLOCKED_COLUMN = "blocked"

#: What each empty column says. A blank column tells a user nothing about why it
#: is blank, and "no requirements" is not the same fact as "nothing has reached
#: this stage" (SWR-3302).
COLUMN_HINTS: dict[str, str] = {
    "backlog": "Nothing is waiting. New and re-opened requirements arrive here.",
    "ready": "Nothing is ready. A requirement moves here when it is released for work.",
    "running": "Nothing is running. Agents move requirements here while they work on them.",
    "review": "Nothing is waiting for a review decision.",
    "needs-update": (
        "Nothing needs an update. A delivered requirement lands here when its specification moves."
    ),
    "blocked": "Nothing is blocked. Requirements land here when they need a human.",
    "done": "Nothing is done yet.",
}

#: What an empty column says on each non-delivery axis. The delivery axis has a
#: sentence per column (:data:`COLUMN_HINTS`) because its columns are stages of a
#: process; the others describe a property, where one sentence per axis is the
#: honest amount to say (SWR-3302, SWR-3318).
AXIS_COLUMN_HINTS: dict[str, str] = {
    "health": "No requirement is in this condition.",
    "lifecycle": "No requirement has this lifecycle.",
    "epic": "This epic has no requirements on the board.",
    "priority": "Nothing carries this priority.",
    "source": "This source contributed no requirements.",
}

#: Priority as the engine spells it, best first. A requirement without one sorts
#: after ``Low`` rather than wherever the dictionary happened to put it
#: (SWR-3309).
PRIORITY_ORDER: tuple[str, ...] = ("Critical", "High", "Normal", "Low")

#: The orders the board offers, as ``(key, label)``.
SORT_ORDERS: tuple[tuple[str, str], ...] = (
    ("priority", "Priority, then id"),
    ("id", "Id"),
    ("health", "Health, then id"),
)

#: What the Verify control promises before anything happens (SWR-3615).
#:
#: Three sentences, and the third is the one a user would otherwise get wrong:
#: verification records what a suite measured, and a green suite is evidence
#: rather than a decision. Nothing here moves a card — turning evidence into
#: `Done` stays the completion gate's job (SWR-3215).
VERIFY_TOOLTIP = (
    "Run this workspace's own check suite once and record what it verified.\n"
    "On a large project that is minutes, not seconds.\n"
    "It records evidence and moves no card."
)

#: What the same control says while a pass is in flight.
VERIFY_RUNNING = "Verifying…"
VERIFY_RUNNING_TOOLTIP = (
    "The check suite is running. The board stays usable; its rings update when it finishes."
)

#: What the re-evaluation control promises (SWR-3319). It used to say "Runs
#: nothing and measures nothing", which was untrue on both counts: the pass it
#: started could sit inside four model calls, and it moved cards. Both halves are
#: now said — the rules run, and nothing waits on a provider.
#:
#: One control carries it, and it is the area header's ``Refresh requirements``
#: beside the status sentence. The board's toolbar used to carry a second,
#: labelled ``Re-evaluate``: same slot, same argument, same result, different
#: word — which left a user with two verbs to tell apart and no difference to
#: find. The sentence is defined here because the board owns what a refresh means
#: to the columns; the button lives where the count it changes is stated.
REEVALUATE_TOOLTIP = (
    "Read the sources and stores again and apply the propagation rules.\n"
    "Consults no model and measures nothing.\n"
    "Cards a rule moves will move."
)

#: How many cards a column realises above and below the band its viewport shows
#: (SWR-3317). Enough that a wheel notch, a page key or a card taller than the
#: estimate below lands on a widget that already exists rather than on a gap.
OVERSCAN = 6

#: What a card is assumed to be worth in height until one has been measured.
#: Only ever an opening guess: :meth:`_Column._measure` replaces it per card with
#: what the layout actually gave that card, which is what keeps the scrollbar's
#: range and the band it implies agreeing with each other.
ESTIMATED_CARD_HEIGHT = 190

#: What a column's viewport is assumed to show before it has been laid out.
ESTIMATED_COLUMN_HEIGHT = 420

#: How long the search box waits for the typing to stop before the board is
#: recomputed (SWR-3317). A burst of keystrokes is one repaint, not one each.
SEARCH_DEBOUNCE_MS = 150

#: How often a running pass's elapsed clock is redrawn (SWR-3320). One second,
#: because that is the resolution a stopwatch is read at; the value itself is
#: not re-sent, only the reading recomputed from its start timestamp.
PROGRESS_TICK_MS = 1000

#: How many recycled card widgets the board keeps for reuse. Bounded so a board
#: that was briefly filtered wide does not hold every widget it ever built.
RECYCLE_LIMIT = 48

#: How many times a repaint may re-read the band after measuring what it drew.
#: Two, because the first pass turns estimates into measurements and the second
#: settles on them; anything beyond that would be measuring the same widgets.
_SETTLING_PASSES = 2

#: Where filter and sort selections live across a restart. The same flat,
#: process-wide ``QSettings`` the panel sizes use: a board filter is a property
#: of the person, not of the workspace.
SETTINGS_GROUP = "requirements"

#: Where a board choice that belongs to the *project* lives instead: the
#: per-workspace namespace the composer draft opened, keyed by the same resolved
#: absolute path. Which columns are worth seeing follows from what the workspace
#: contains, so a fold recorded in one must not reach another (SWR-3321).
WORKSPACE_SETTINGS_GROUP = "workspaces"
FOLD_SETTING = "requirementColumnFolds"

#: How wide an open column is. Wide enough that a card never clips inside it:
#: a requirement card's own minimum is ~215 points, and the column owes it that
#: plus its margins and its scroll bar (SWR-3302).
OPEN_COLUMN_MIN_WIDTH = 276
OPEN_COLUMN_MAX_WIDTH = 340
OPEN_COLUMN_MARGINS = (10, 10, 10, 10)

#: What a folded column keeps either side of its rail. The open column's own
#: margin would be most of the rail's width, and the point of folding is that a
#: board of 36 epic columns leaves the ones holding work on screen (SWR-3321).
FOLDED_COLUMN_MARGIN = 4

#: How wide a folded rail may grow, in average characters of its own font.
#: Measured against the font rather than fixed in points, because the rail's job
#: is to stay legible: a display scale or a screen magnifier grows the text, and
#: a rail pinned to a point width would then hold less of the heading the larger
#: the user made it (SWR-3321). Eight characters is what puts every delivery
#: state this board names — ``Backlog``, ``Running``, ``Blocked`` — on one line.
FOLDED_RAIL_WIDTH_CHARS = 8

#: How much wider — in lines of text — every folded rail gets while a card is in
#: the air. A rail is a real drop target, because SWR-3321 says a drag reaches a
#: folded column, and nobody aims a card at a shape they cannot see is a target.
#: The board pays for the extra width for exactly as long as the drag lasts
#: (SWR-3601), which is also why it is added to every rail at once rather than to
#: the one already under the pointer: a target that only appears once you have
#: found it is not a target.
FOLDED_RAIL_DROP_LINES = 1.5

#: What a folded column widens to while a card is in the air, so the engine's
#: refusal is read rather than abbreviated to a glyph (SWR-3602). The open
#: minimum, deliberately: the sentence was written to be read in a column, and
#: anything narrower would wrap it into the shape a folded column used to cut it
#: in half in. Held only for the duration of the drag.
FOLDED_COLUMN_DROP_WIDTH = OPEN_COLUMN_MIN_WIDTH

#: How many lines of its heading a rail wraps before it elides the rest onto the
#: tooltip and the accessible name.
FOLDED_RAIL_LINES = 2

#: How tall this screen's one primary action is. Every other button in the app's
#: style sheet is 24 points high, so the difference is a size a user reads
#: without comparing anything (SWR-3606).
PRIMARY_BUTTON_HEIGHT = 32

_EPIC_FACT = "Epic"
_SOURCE_FACT = "Source"
_PRIORITY_FACT = "Priority"


@dataclass(frozen=True)
class BoardFilter:
    """What the board is currently reduced to — display only (SWR-3309).

    Every dimension is the *displayed* value of the projection, so a filter can
    never disagree with what the cards say. Filtering changes neither delivery
    state nor scheduling order; it changes which cards are on screen.
    """

    text: str = ""
    epic: str = ""
    source: str = ""
    lifecycle: str = ""
    health: str = ""
    priority: str = ""

    @property
    def active(self) -> bool:
        """Whether anything is currently filtered out."""
        return any(
            (self.text, self.epic, self.source, self.lifecycle, self.health, self.priority),
        )

    @property
    def description(self) -> str:
        """The active filter, stated — so an empty board is never a mystery."""
        parts = [
            f'text "{self.text}"' if self.text else "",
            f"epic {self.epic}" if self.epic else "",
            f"source {self.source}" if self.source else "",
            f"lifecycle {self.lifecycle}" if self.lifecycle else "",
            f"health {self.health}" if self.health else "",
            f"priority {self.priority}" if self.priority else "",
        ]
        stated = [part for part in parts if part]
        return "Filtered by " + ", ".join(stated) if stated else "No filter"

    def as_settings(self) -> dict[str, str]:
        """The filter as flat values, for :class:`QSettings`."""
        return {
            "text": self.text,
            "epic": self.epic,
            "source": self.source,
            "lifecycle": self.lifecycle,
            "health": self.health,
            "priority": self.priority,
        }


@dataclass(frozen=True)
class BoardColumnModel:
    """One rendered column: which cards are in it after filtering."""

    key: str
    label: str
    card_ids: tuple[str, ...] = ()
    empty_message: str = ""

    @property
    def count(self) -> int:
        """What the column header prints."""
        return len(self.card_ids)


@traces(SWR.SWR_3309)
def priority_rank(card: RequirementCard) -> int:
    """Where this card's priority sorts — a missing one after ``Low``."""
    priority = card_fact(card, _PRIORITY_FACT)
    return PRIORITY_ORDER.index(priority) if priority in PRIORITY_ORDER else len(PRIORITY_ORDER)


@traces(SWR.SWR_3309)
def sort_cards(cards: tuple[RequirementCard, ...], order: str) -> tuple[RequirementCard, ...]:
    """The board's order: priority then id by default, and never random."""
    if order == "id":
        return tuple(sorted(cards, key=lambda card: requirement_sort_key(card.req_id)))
    if order == "health":
        return tuple(
            sorted(cards, key=lambda card: (card.health_label, requirement_sort_key(card.req_id))),
        )
    return tuple(
        sorted(cards, key=lambda card: (priority_rank(card), requirement_sort_key(card.req_id))),
    )


@traces(SWR.SWR_3309)
def matches(card: RequirementCard, board_filter: BoardFilter) -> bool:
    """Whether *card* survives every active filter dimension."""
    needle = board_filter.text.strip().casefold()
    if needle and needle not in card.req_id.casefold() and needle not in card.title.casefold():
        return False
    if board_filter.epic and board_filter.epic not in (
        card_fact(card, _EPIC_FACT),
        card.req_id if card.is_epic else "",
    ):
        return False
    if board_filter.source and card_fact(card, _SOURCE_FACT) != board_filter.source:
        return False
    if board_filter.lifecycle and card.lifecycle_label != board_filter.lifecycle:
        return False
    if board_filter.health and card.health_label != board_filter.health:
        return False
    return not (board_filter.priority and card_fact(card, _PRIORITY_FACT) != board_filter.priority)


@traces(SWR.SWR_3309)
def visible_cards(
    state: RequirementsBoardState,
    board_filter: BoardFilter,
    order: str,
) -> tuple[RequirementCard, ...]:
    """The cards the board shows, filtered and in order."""
    return sort_cards(tuple(card for card in state.cards if matches(card, board_filter)), order)


@traces(SWR.SWR_3318)
def card_axis_value(card: RequirementCard, axis: str) -> str:
    """Which column of *axis* this card belongs in (SWR-3318).

    Every value is one the card already carries, because the card came from the
    projection and the projection is where these are decided (SWR-3311). The
    spellings are deliberately the engine's own — ``BoardEntry.axis_value``
    answers the same question over the same projection, and a test asserts the
    two agree, so switching an axis can never move a card somewhere the engine
    would not have put it.

    Priority is the one that needs translating: a card shows it as ``Critical``
    where the engine keys it as ``critical``, and a card with no priority carries
    no fact at all where the engine says ``none``.
    """
    if axis == "delivery":
        return card.delivery
    if axis == "health":
        return card.health
    if axis == "lifecycle":
        return card.lifecycle
    if axis == "priority":
        return card_fact(card, _PRIORITY_FACT).casefold() or "none"
    if axis == "source":
        return card_fact(card, _SOURCE_FACT)
    return card.req_id if card.is_epic else card_fact(card, _EPIC_FACT)


def _axis_label(key: str, axis: str) -> str:
    """What a column header prints for *key* on *axis*."""
    if not key:
        return grouping_for(axis).unset_label
    # Epic and source keys are ids, and an id is already its own heading.
    return key if axis in {"epic", "source"} else _label(key)


def _axis_order(cards: tuple[RequirementCard, ...], axis: str) -> list[str]:
    """The columns *axis* shows, in the order it shows them.

    Closed axes get every value whether or not anything is in it, so an empty
    column stays a column that says what belongs there (SWR-3302). Open ones —
    epic, source — get only the values the project actually has, plus the
    unset bucket when something needs it, because a column per epic nobody wrote
    is noise rather than completeness.
    """
    known = list(grouping_for(axis).column_keys)
    if known:
        return known
    present = {card_axis_value(card, axis) for card in cards}
    named = sorted((key for key in present if key), key=requirement_sort_key)
    return [*named, *([""] if "" in present else [])]


@traces(SWR.SWR_3302, SWR.SWR_3318)
def board_columns(
    state: RequirementsBoardState,
    cards: tuple[RequirementCard, ...],
    *,
    blocked_column: bool = True,
    axis: str = DEFAULT_BOARD_AXIS,
) -> tuple[BoardColumnModel, ...]:
    """One column per value of *axis*, holding the visible cards that carry it.

    On the delivery axis — the default, and SWR-3302's answer — membership is the
    projection's (``state.columns``) where it has one, so a card is where the
    engine put it. The fallback, and every other axis, groups by a value read off
    the card, which came from that same projection.
    """
    if axis != DEFAULT_BOARD_AXIS:
        return _grouped_columns(cards, axis)
    order = list(COLUMN_ORDER)
    if blocked_column:
        # Pinned first: `Blocked` is the state a user must not be able to scroll
        # past (SWR-3303).
        order.insert(0, BLOCKED_COLUMN)
    visible = {card.req_id for card in cards}
    ordered_ids = [card.req_id for card in cards]
    labels = {column.key: column.label for column in state.columns}
    membership: dict[str, list[str]] = {key: [] for key in order}
    projected = {column.key: set(column.req_ids) for column in state.columns}
    for req_id in ordered_ids:
        key = _column_of(req_id, state, projected)
        if key == BLOCKED_COLUMN and not blocked_column:
            continue
        membership.setdefault(key, []).append(req_id)
    return tuple(
        BoardColumnModel(
            key=key,
            label=labels.get(key, _label(key)),
            card_ids=tuple(req_id for req_id in membership.get(key, ()) if req_id in visible),
            empty_message=COLUMN_HINTS.get(key, "Nothing is in this column."),
        )
        for key in order
    )


def _grouped_columns(
    cards: tuple[RequirementCard, ...],
    axis: str,
) -> tuple[BoardColumnModel, ...]:
    """The board grouped by an axis other than delivery state (SWR-3318)."""
    membership: dict[str, list[str]] = {key: [] for key in _axis_order(cards, axis)}
    for card in cards:
        membership.setdefault(card_axis_value(card, axis), []).append(card.req_id)
    return tuple(
        BoardColumnModel(
            key=key,
            label=_axis_label(key, axis),
            card_ids=tuple(ids),
            empty_message=AXIS_COLUMN_HINTS.get(axis, "Nothing in this group."),
        )
        for key, ids in membership.items()
    )


def _column_of(
    req_id: str,
    state: RequirementsBoardState,
    projected: dict[str, set[str]],
) -> str:
    for key, ids in projected.items():
        if req_id in ids:
            return key
    card = state.card(req_id)
    return card.delivery if card is not None else "backlog"


def _label(token: str) -> str:
    return " ".join(part.capitalize() for part in token.split("-"))


@dataclass(frozen=True)
class BoardPreferences:
    """What a previous session left behind: how the board was reduced and arranged.

    A record rather than a tuple because the set grows — SWR-3309 persisted the
    filter, the order and the blocked column; SWR-3318 adds the grouping axis —
    and a four-tuple is where a caller starts unpacking the wrong element.
    """

    filter: BoardFilter = BoardFilter()
    order: str = SORT_ORDERS[0][0]
    blocked_column: bool = True
    axis: str = DEFAULT_BOARD_AXIS


@traces(SWR.SWR_3309, SWR.SWR_3318)
def load_board_preferences() -> BoardPreferences:
    """The filter, order, blocked-column setting and axis a previous session left.

    Every value is validated against what this build offers: a stored axis or
    order this version no longer has falls back to the default rather than
    leaving the board grouped by something it cannot render.
    """
    settings = QSettings()
    stored = {
        field: str(settings.value(f"{SETTINGS_GROUP}/filter/{field}", "") or "")
        for field in BoardFilter().as_settings()
    }
    order = str(settings.value(f"{SETTINGS_GROUP}/sort", SORT_ORDERS[0][0]) or SORT_ORDERS[0][0])
    known = {key for key, _ in SORT_ORDERS}
    blocked = str(settings.value(f"{SETTINGS_GROUP}/blocked_column", "true")).lower() != "false"
    stored_axis = str(settings.value(f"{SETTINGS_GROUP}/axis", "") or "")
    return BoardPreferences(
        filter=BoardFilter(**stored),
        order=order if order in known else SORT_ORDERS[0][0],
        blocked_column=blocked,
        axis=grouping_for(stored_axis).key,
    )


@traces(SWR.SWR_3309, SWR.SWR_3318)
def save_board_preferences(
    board_filter: BoardFilter,
    order: str,
    *,
    blocked_column: bool = True,
    axis: str = DEFAULT_BOARD_AXIS,
) -> None:
    """Remember the filter, order and grouping, so the next launch opens the same board."""
    settings = QSettings()
    for name, value in board_filter.as_settings().items():
        settings.setValue(f"{SETTINGS_GROUP}/filter/{name}", value)
    settings.setValue(f"{SETTINGS_GROUP}/sort", order)
    settings.setValue(f"{SETTINGS_GROUP}/blocked_column", "true" if blocked_column else "false")
    settings.setValue(f"{SETTINGS_GROUP}/axis", axis)


@dataclass(frozen=True)
class ColumnFolds:
    """Which columns the user folded or unfolded by hand, and which way (SWR-3321).

    Only the decisions are kept. Everything else follows from the board itself:
    a column nobody has touched is folded exactly while it is empty, re-read on
    every update, which is what stops a card arriving into a column that stays
    hidden. Storing the *decisions* rather than the resulting fold set is what
    makes those two rules coexist — a folded column the user opened stays open
    once it fills, and one they folded stays folded once it does.
    """

    choices: Mapping[str, bool] = field(default_factory=dict)

    def folded(self, model: BoardColumnModel, *, fold_empty: bool = True) -> bool:
        """Whether *model* is folded right now: the user's answer, or emptiness.

        *fold_empty* is how a first-run board escapes the emptiness rule without
        losing it (:func:`pipeline_unused`). A decision the user made outranks
        both, in either direction, exactly as before.
        """
        decided = self.choices.get(model.key)
        if decided is not None:
            return decided
        return fold_empty and model.count == 0

    def with_choice(self, key: str, *, folded: bool) -> ColumnFolds:
        """This set plus the user's decision about one column."""
        return ColumnFolds({**self.choices, key: folded})

    def pruned(self, keys: Iterable[str]) -> ColumnFolds:
        """This set reduced to the columns the board still has.

        The epic and source axes name their columns after ids the project owns
        (SWR-3318), so without this a workspace would accumulate one dead entry
        per epic anybody ever renamed.
        """
        live = set(keys)
        return ColumnFolds({key: value for key, value in self.choices.items() if key in live})

    def as_setting(self) -> str:
        """The decisions as one flat value, for :class:`QSettings`.

        One JSON string rather than a key per column: ``QSettings`` reads ``/``
        as a group separator and an epic or source column key is whatever the
        project called it.
        """
        return json.dumps(dict(sorted(self.choices.items())))


@traces(SWR.SWR_3321)
def load_column_folds(workspace: str) -> ColumnFolds:
    """The folds this workspace was left with, ignoring anything unreadable.

    Per workspace, deliberately, where the filter, the sort order and the axis
    are per person (SWR-3309, SWR-3318): those say how somebody likes to read a
    board, while which columns are worth seeing follows from what the project
    contains. The namespace is the one the composer draft already established.

    A value this build cannot parse leaves no fold rather than an exception, so
    a settings file written by a later version opens the board on the empty-only
    rule instead of failing to draw it.
    """
    raw = QSettings().value(_fold_key(workspace), "")
    try:
        stored = json.loads(str(raw or "") or "{}")
    except (TypeError, ValueError):
        return ColumnFolds()
    if not isinstance(stored, dict):
        return ColumnFolds()
    return ColumnFolds(
        {str(key): bool(value) for key, value in stored.items() if isinstance(value, bool)},
    )


@traces(SWR.SWR_3321)
def save_column_folds(workspace: str, folds: ColumnFolds) -> None:
    """Remember *folds* against *workspace*, so the next launch opens the same board."""
    QSettings().setValue(_fold_key(workspace), folds.as_setting())


def _fold_key(workspace: str) -> str:
    """Where one workspace's folds live. ``default`` when the board has no workspace."""
    return f"{WORKSPACE_SETTINGS_GROUP}/{workspace or 'default'}/{FOLD_SETTING}"


#: Where a requirement already is before anything has been done with it. A new
#: requirement arrives in ``backlog``, and ``blocked`` is not a stage of progress
#: at all (SWR-3303) — so neither of them being occupied says the pipeline has
#: been used. Every other delivery column is the pipeline proper.
PIPELINE_ENTRY_COLUMNS = frozenset({"backlog", BLOCKED_COLUMN})


@traces(SWR.SWR_3321)
def pipeline_unused(models: tuple[BoardColumnModel, ...]) -> bool:
    """Whether no card has ever reached a delivery column past the one it arrives in.

    The first-run case, and the one the emptiness rule gets wrong (SWR-3321). On
    a project nobody has released anything in, *every* downstream column is
    empty — so folding each empty column collapses the whole pipeline into
    rotated rails, and the first thing a new user sees of the workflow they are
    meant to drive is the one view of it that cannot be read or dropped on.

    Folding earns its keep the moment the board is genuinely lopsided: fifty
    cards in ``Done`` and nothing in ``Review`` is a column worth trading for
    horizontal room. Nothing anywhere is not lopsided, it is unstarted, and an
    unstarted pipeline is exactly the thing that has to be legible.
    """
    return not any(model.count for model in models if model.key not in PIPELINE_ENTRY_COLUMNS)


@traces(SWR.SWR_3302, SWR.SWR_3309)
class _FittedComboBox(QComboBox):
    """A drop-down that fits the entry it is *showing*, and states the rest.

    The filter bar needs two things a plain :class:`QComboBox` will not do at
    once. It must not size itself to its longest entry — the epic and source
    filters are keyed by requirement ids the project chooses, so a bar as wide as
    the longest one stops fitting the supported 1000×680 window the day somebody
    writes a longer id (SWR-3302). And it must not cut the entry it is showing
    mid-word: ``Priority, then ic`` is not a value anybody can read, and a
    hard-capped box carried no second copy of what it had cut off.

    So the width follows the *selected* entry rather than the longest one,
    bounded by the ceiling :func:`_compact` gives it. Past that ceiling the text
    is elided with an ellipsis — a visible sign that there is more — and the
    whole value moves onto the tooltip and the accessible description, which is
    where both a sighted user and a screen reader then find it.
    """

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._ceiling = OPEN_COLUMN_MAX_WIDTH
        self._purpose = ""
        #: What :meth:`_chrome` last measured; ``None`` until the style or the
        #: layout has given an answer.
        self._room: int | None = None
        self.setSizeAdjustPolicy(QComboBox.SizeAdjustPolicy.AdjustToMinimumContentsLengthWithIcon)
        self.setMinimumContentsLength(8)
        self.currentIndexChanged.connect(self.restate)

    def fit_within(self, ceiling: int) -> None:
        """Never ask for more than *ceiling* points, whatever the entries say."""
        self._ceiling = ceiling
        self.setMaximumWidth(ceiling)
        self.updateGeometry()
        self.restate()

    def set_purpose(self, text: str) -> None:
        """What this box is *for* — the sentence its tooltip keeps when it fits."""
        self._purpose = text
        self.restate()

    @property
    def purpose(self) -> str:
        """The sentence :meth:`set_purpose` was given."""
        return self._purpose

    def displayed_text(self) -> str:
        """What the box can actually show of its current entry, ellipsis and all."""
        return QFontMetrics(self.font()).elidedText(
            self.currentText(),
            Qt.TextElideMode.ElideRight,
            self._label_width(),
        )

    def sizeHint(self) -> QSize:  # noqa: N802 — Qt's spelling
        """As wide as the selected entry needs, and never wider than the ceiling."""
        hint = super().sizeHint()
        return QSize(min(self._ceiling, max(hint.width(), self._wanted())), hint.height())

    def resizeEvent(self, event: QResizeEvent) -> None:  # noqa: N802 — Qt's spelling
        """A narrower box elides more of the same value, and has to say so.

        And the first real geometry is also the first honest measurement of the
        chrome, which the width this box asks for is computed from — so a hint
        made against the style's estimate is withdrawn and made again.
        """
        super().resizeEvent(event)
        estimated = self._room
        if self._chrome() != estimated:
            self.updateGeometry()
        self.restate()

    def paintEvent(self, event: QPaintEvent) -> None:  # noqa: N802 — Qt's spelling
        """The frame and arrow the style draws, with the label elided into it."""
        del event  # there is one entry on this control and it is repainted whole
        painter = QStylePainter(self)
        painter.setPen(self.palette().color(QPalette.ColorRole.Text))
        option = QStyleOptionComboBox()
        self.initStyleOption(option)
        painter.drawComplexControl(QStyle.ComplexControl.CC_ComboBox, option)
        # `currentText` is a real attribute of the option at run time; the
        # bundled PySide6 stubs simply do not declare it.
        option.currentText = self.displayed_text()  # type: ignore[attr-defined]
        painter.drawControl(QStyle.ControlElement.CE_ComboBoxLabel, option)

    def restate(self) -> None:
        """Put whatever the box had to cut off where a user can still read it.

        Public because an entry's *text* can change under a box that never
        changed index — the move picker relabels its columns whenever the
        selection does (SWR-3602) — and the tooltip then has to follow.
        """
        whole = self.currentText()
        cut = bool(whole) and self.displayed_text() != whole
        self.setToolTip(f"{whole}\n{self._purpose}".strip() if cut else self._purpose)
        self.setAccessibleDescription(whole if cut else "")

    def _label_width(self) -> int:
        """The room the style leaves for text, once the arrow has taken its own."""
        option = QStyleOptionComboBox()
        self.initStyleOption(option)
        return (
            self.style()
            .subControlRect(
                QStyle.ComplexControl.CC_ComboBox,
                option,
                QStyle.SubControl.SC_ComboBoxEditField,
                self,
            )
            .width()
        )

    def _wanted(self) -> int:
        """How wide this box would have to be to show its current entry whole."""
        return QFontMetrics(self.font()).horizontalAdvance(self.currentText()) + self._chrome() + 2

    def _chrome(self) -> int:
        """How much of the box is frame, padding and arrow rather than text.

        Measured against the box's own laid-out geometry wherever there is one,
        because that is the number :meth:`_label_width` will answer with when the
        text is elided — and a width asked for against a different arithmetic
        than the width the text is cut to is how a control ends up exactly wide
        enough to clip. The style's own answer for an empty entry seeds it, for
        the first layout, before there is a geometry to measure.
        """
        room = self._label_width()
        if room > 0 and self.width() > room:
            self._room = self.width() - room
        elif self._room is None:
            option = QStyleOptionComboBox()
            self.initStyleOption(option)
            self._room = (
                self.style()
                .sizeFromContents(
                    QStyle.ContentsType.CT_ComboBox,
                    option,
                    QSize(0, QFontMetrics(self.font()).height()),
                    self,
                )
                .width()
            )
        return self._room


#: How wide a drop-down over a **closed** vocabulary may get. The sort, grouping
#: and move pickers offer a set this build writes, so letting one size to its
#: longest entry is bounded by the code rather than by the project — which is why
#: their ceiling can be the one that fits the words instead of the one that cuts
#: them (SWR-3302).
CLOSED_COMBO_WIDTH = 240

#: How wide a drop-down over an **open** vocabulary may get. The filter
#: dimensions are keyed by epic and source ids the project chooses, so theirs is
#: a hard cap and a longer value is elided against it rather than allowed to
#: widen the bar past the window it has to fit in.
OPEN_COMBO_WIDTH = 150


def _compact(combo: _FittedComboBox, *, maximum: int = OPEN_COMBO_WIDTH) -> None:
    """Bound a drop-down's appetite without letting it clip its own value.

    A combo that grows with its content makes the filter bar as wide as the
    longest epic id on the board, which is how a bar that fit at 1000×680 stops
    fitting the day somebody writes a longer requirement title (SWR-3302). The
    ceiling is what stops that. What :class:`_FittedComboBox` adds underneath it
    is that reaching the ceiling now costs an ellipsis and a tooltip rather than
    a word cut in half.
    """
    # An explicit minimum, because a combo's own minimum size hint follows its
    # longest entry and would push the bar past the window it has to fit in.
    combo.setMinimumWidth(92)
    combo.fit_within(maximum)


# ── the folded rail (SWR-3321) ─────────────────────────────────────────────


def _rail_words(text: str) -> list[str]:
    """*text* split where a rail is allowed to break it: after a space or a dash.

    Not on every character. A heading broken anywhere reads as two half-words
    stacked on top of each other, and the labels a board folds are exactly the
    ones where that hurts — ``Needs Update`` breaks between its words and
    ``SWR-3300`` after its dash, while ``Running`` stays whole or is elided.
    """
    words: list[str] = []
    current = ""
    for char in text:
        current += char
        if char in "- ":
            words.append(current)
            current = ""
    if current:
        words.append(current)
    return [word for word in words if word.strip()]


def _rail_lines(metrics: QFontMetrics, text: str, room: int, limit: int) -> tuple[str, ...]:
    """*text* wrapped into at most *limit* lines of *room* points, elided if it will not fit.

    The elision is deliberate and it is not a loss: what a rail cannot paint is
    still on its tooltip and its accessible name (SWR-3321), so the reduction is
    of the room the heading takes and never of what the column says.
    """
    lines: list[str] = []
    current = ""
    for word in _rail_words(text):
        candidate = f"{current}{word}"
        if current and metrics.horizontalAdvance(candidate.rstrip()) > room:
            lines.append(current.rstrip())
            current = word
        else:
            current = candidate
    if current.strip():
        lines.append(current.rstrip())
    if len(lines) > limit:
        kept = lines[:limit]
        kept[-1] = f"{kept[-1]} {' '.join(lines[limit:])}"
        lines = kept
    return tuple(metrics.elidedText(line, Qt.TextElideMode.ElideRight, room) for line in lines)


@traces(SWR.SWR_3321)
class _FoldedHeader(QAbstractButton):
    """A folded column, drawn as a narrow column and read without turning your head.

    A button rather than a painted label, because unfolding has to be an action
    and not a mouse gesture: :class:`QAbstractButton` brings the focus policy,
    the focus event and ``Space``/``Return`` with it, which is the whole of what
    SWR-3314 asks of a new control.

    **The heading stands up.** It used to run bottom-to-top, the way a kanban
    board turns a heading it has no width for, and that cost more than it saved.
    Rotated text is slow to read at the best of times, and it is actively hostile
    to the users this product promises WCAG 2.2 AA: someone magnifying the board
    pans horizontally through a card, and a heading running along the other axis
    leaves the viewport in the direction they are not moving. So the rail is
    instead as wide as a few characters — :data:`FOLDED_RAIL_WIDTH_CHARS`,
    measured against the font so a larger display scale buys a wider rail — and
    the heading wraps upright inside it over :data:`FOLDED_RAIL_LINES` lines,
    elided against the tooltip and the accessible name that carry it whole.

    **And it reads as a column, not as a divider.** A turned-up ``· 0`` beside a
    dark gap is indistinguishable from decoration, so the rail paints the same
    card ground and the same delivery accent the open column has, with a chevron
    at the top saying which way it opens and the count under the heading. The
    chevron doubles under the pointer and under focus, and while a card is in the
    air it becomes the drop glyph — the same ``↓``/``⃠`` pair the open columns
    show — so a drag can see the rails it may land on before it reaches one
    (SWR-3601, SWR-3602).
    """

    #: Room between the rail's edge and the words inside it.
    PADDING = 6

    #: Two points of rounding room on the width. Qt's advance is a rounded-down
    #: integer and its eliding is not, so a rail sized to exactly what it
    #: measured elides the last letter off a word that fits.
    SLACK = 2

    #: What the rail leads with: which way it opens, and — while a drag is live —
    #: whether the card in the air may land here. Never colour alone (SWR-3602).
    CHEVRON = "›"
    CHEVRON_ACTIVE = "»"
    DROP_OPEN = "↓"
    DROP_CLOSED = "⃠"

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        # Replaced by the column's own accent before the rail is ever shown;
        # this is only what an unattached rail would paint with.
        self._colour: str = tokens().color.text_secondary
        self._label = ""
        self._count = ""
        self._hovered = False
        self._drop: MoveOption | None = None
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        # Fills the height the open column's cards would have had, so a folded
        # column is still a column-shaped thing in the row and not a label
        # floating at the top of an empty stripe.
        self.setSizePolicy(QSizePolicy.Policy.Fixed, QSizePolicy.Policy.Expanding)

    def set_heading(self, label: str, count: int, colour: str) -> None:
        """Take the heading the open column would have shown, and its accent."""
        self._colour = colour
        self._label = label
        self._count = str(count)
        self.setText(f"{label} · {count}")
        self.updateGeometry()
        self.update()

    @traces(SWR.SWR_3601, SWR.SWR_3602)
    def set_drop_state(self, option: MoveOption | None) -> None:
        """Say whether the card in the air may land on the column this rail stands for.

        ``None`` is "no drag is happening", which is also what returns the rail
        to its ordinary width: the widening is borrowed for the drag and never
        kept, exactly like the spring-open it advertises.
        """
        if option is self._drop:
            return
        self._drop = option
        self.updateGeometry()
        self.update()

    @property
    def inviting(self) -> bool:
        """Whether a drag is in the air and this rail is showing its answer."""
        return self._drop is not None

    def rail_width(self) -> int:
        """How wide this rail asks to be, for the heading and the font it has.

        The widest single word it may have to paint, capped — a rail is a saving,
        and one that grows to the longest epic id on the board is not one.
        """
        metrics = QFontMetrics(self.font())
        line = metrics.height()
        words = [metrics.horizontalAdvance(word.rstrip()) for word in _rail_words(self._label)]
        needed = (
            max(
                [
                    *words,
                    metrics.horizontalAdvance(self._count),
                    metrics.horizontalAdvance(self.CHEVRON_ACTIVE),
                    line,
                ],
            )
            + self.SLACK
        )
        cap = max(line, metrics.averageCharWidth() * FOLDED_RAIL_WIDTH_CHARS)
        width = min(cap, needed) + 2 * self.PADDING
        if self._drop is not None:
            width += int(line * FOLDED_RAIL_DROP_LINES)
        return width

    def painted_lines(self) -> tuple[str, ...]:
        """Exactly what this rail draws, top to bottom — the words a user reads.

        Read by the board's tests rather than by the board: what a rail says is
        the whole of SWR-3321's promise that folding hides cards and never
        meaning, and a screenshot cannot be asserted on.
        """
        metrics = QFontMetrics(self.font())
        room = max(1, (self.width() or self.rail_width()) - 2 * self.PADDING)
        heading = list(_rail_lines(metrics, self._label, room, FOLDED_RAIL_LINES))
        lines = [self._glyph(), *heading, self._count]
        height = self.height() or self.sizeHint().height()
        fits = max(1, (height - 2 * self.PADDING) // max(1, metrics.height()))
        if len(lines) <= fits:
            return tuple(lines)
        # The glyph and the count are one line each and cannot be split, so a
        # rail too short for everything spends what is left on the heading.
        room_for_heading = max(0, fits - 2)
        return (self._glyph(), *heading[:room_for_heading], *([self._count] if fits > 1 else []))

    def sizeHint(self) -> QSize:  # noqa: N802 — Qt's spelling
        """Wide enough for the heading it wraps, tall enough for every line of it."""
        metrics = QFontMetrics(self.font())
        lines = 2 + FOLDED_RAIL_LINES
        return QSize(self.rail_width(), metrics.height() * lines + 2 * self.PADDING)

    def minimumSizeHint(self) -> QSize:  # noqa: N802 — Qt's spelling
        """The width is a floor; the height is not.

        A rail must be free to be shorter than everything it would like to paint —
        at 1000×680 under a large display scale it will be — because the
        alternative is a column that raises the window's minimum size (SWR-3302).
        :meth:`painted_lines` drops lines from the heading instead, and the
        tooltip still carries them.
        """
        metrics = QFontMetrics(self.font())
        return QSize(self.rail_width(), metrics.height() * 2 + 2 * self.PADDING)

    def enterEvent(self, event: QEnterEvent) -> None:  # noqa: N802 — Qt's spelling
        """Under the pointer, a rail says it is a control rather than a divider."""
        del event  # there is one thing to record and no detail to read
        self._hovered = True
        self.update()

    def leaveEvent(self, event: QEvent) -> None:  # noqa: N802 — Qt's spelling
        del event  # as above
        self._hovered = False
        self.update()

    def _glyph(self) -> str:
        """The rail's first line: which way it opens, or what a drop would do."""
        if self._drop is not None:
            return self.DROP_OPEN if self._drop.reachable else self.DROP_CLOSED
        return self.CHEVRON_ACTIVE if self._hovered or self.hasFocus() else self.CHEVRON

    def _active(self) -> bool:
        """Whether the rail is being pointed at, focused, or offered a card."""
        return self._hovered or self.hasFocus() or self._drop is not None

    def paintEvent(self, event: QPaintEvent) -> None:  # noqa: N802 — Qt's spelling
        """Draw a narrow column: its ground, its accent edge, and its heading upright."""
        del event  # the whole rail is repainted; it is four short lines
        t = tokens()
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        accent = QColor(self._colour)
        edge = QColor(accent)
        if not self._active():
            # Present but quiet: a board of rails should read as a row of folded
            # columns, not as a row of highlighted ones.
            edge.setAlpha(110)
        body = self.rect().adjusted(1, 1, -1, -1)
        painter.setPen(QPen(edge, 2 if self._active() else 1))
        painter.setBrush(t.color.surface.qcolor)
        painter.drawRoundedRect(body, t.radius.md, t.radius.md)
        if self.hasFocus():
            # Drawn rather than inherited: a button that paints itself gets no
            # focus ring from the style sheet, and an action without a visible
            # focus indicator is one SWR-3314 does not allow.
            painter.setPen(QPen(t.color.focus.qcolor, t.size.focus_ring))
            painter.setBrush(Qt.BrushStyle.NoBrush)
            painter.drawRoundedRect(body, t.radius.md, t.radius.md)
        metrics = QFontMetrics(self.font())
        lines = self.painted_lines()
        width = self.width() - 2 * self.PADDING
        heading = QFont(self.font())
        bold = QFont(self.font())
        bold.setBold(True)
        top = self.PADDING
        for index, line in enumerate(lines):
            first = index == 0
            last = index == len(lines) - 1 and line == self._count
            painter.setPen(QPen(accent if first else t.color.text.qcolor))
            painter.setFont(bold if first or last else heading)
            painter.drawText(
                self.PADDING,
                top,
                width,
                metrics.height(),
                int(Qt.AlignmentFlag.AlignHCenter | Qt.AlignmentFlag.AlignVCenter),
                line,
            )
            top += metrics.height()
        painter.end()


# ── the column widget ──────────────────────────────────────────────────────


@traces(SWR.SWR_3317)
class _Column(Themed, QFrame):
    """One delivery column: a counting header, its own scroll, and a drop target.

    The drop half is the state machine's, never the column's own (SWR-3601): it
    asks *can_drop* — which reaches the transition matrix through the controller
    — and it never decides a move is legal because the card looks like it should
    be. What it owns is the *indication*: while a card is being dragged, every
    column states whether it can be dropped on and why not, in words and with a
    glyph, because colour alone fails the users SWR-3602 is written for.

    **It also owns the band (SWR-3317).** The column holds every id its model
    gave it and a widget for only the ones its viewport shows, between two
    spacer widgets that stand in for the height of what is not realised — so the
    scrollbar reports the whole column while the layout carries a handful of
    cards. Widgets are asked for and handed back through *acquire* and *release*,
    which is what makes them recycled rather than rebuilt: the board's pool
    repaints one card's widget for the next card that scrolls in.
    """

    #: The user folded or unfolded this column by hand (SWR-3321). Carries the
    #: column key and which way, because the board — not the column — is what
    #: remembers the answer for the workspace.
    fold_toggled = Signal(str, bool)

    def __init__(
        self,
        model: BoardColumnModel,
        *,
        acquire: Callable[[str], QWidget | None] | None = None,
        release: Callable[[str, QWidget], None] | None = None,
        can_drop: Callable[[str], MoveOption | None] | None = None,
        on_drop: Callable[[str], bool] | None = None,
        parent: QWidget | None = None,
    ) -> None:
        super().__init__(parent)
        self.setObjectName("panel")
        self.key = model.key
        self._can_drop = can_drop
        self._on_drop = on_drop
        self._acquire = acquire
        self._release = release
        self._ids: tuple[str, ...] = ()
        self._realised: dict[str, QWidget] = {}
        self._heights: dict[str, int] = {}
        self._painted: tuple[int, int] | None = None
        self._painting = False
        #: What the board asked for (SWR-3321), and what a hovering drag asks
        #: for on top of it. Separate, because the drag's answer is borrowed:
        #: it must never become the choice the workspace remembers.
        self._folded = False
        self._sprung = False
        #: The drag's answer for this column, for as long as one is in the air.
        #: Kept rather than only painted, because the column changes shape
        #: underneath it — a rail that springs open has to re-state it.
        self._drop: MoveOption | None = None
        self._accent = theme.delivery_color(model.key)
        self._label = model.label
        self._count = model.count
        self._empty_message = model.empty_message
        self.setAcceptDrops(True)
        self.setMinimumWidth(OPEN_COLUMN_MIN_WIDTH)
        self.setMaximumWidth(OPEN_COLUMN_MAX_WIDTH)
        self._root = root = QVBoxLayout(self)
        root.setContentsMargins(*OPEN_COLUMN_MARGINS)
        root.setSpacing(8)
        # The heading *is* the fold control (SWR-3321): a button rather than a
        # label, so folding is an action with a name, a focus ring and a
        # keyboard path, and not a click a mouse alone can make (SWR-3314).
        self.header = QPushButton()
        self.header.setCursor(Qt.CursorShape.PointingHandCursor)
        self.header.clicked.connect(lambda: self._fold_clicked(folded=True))
        root.addWidget(self.header)
        self.rail = _FoldedHeader()
        self.rail.setVisible(False)
        self.rail.clicked.connect(lambda: self._fold_clicked(folded=False))
        root.addWidget(self.rail, 1)
        self.drop_hint = QLabel()
        self.drop_hint.setWordWrap(True)
        self.drop_hint.setVisible(False)
        root.addWidget(self.drop_hint)
        self.card_scroll = QScrollArea()
        self.card_scroll.setWidgetResizable(True)
        self.card_scroll.setFrameShape(QFrame.Shape.NoFrame)
        self.card_scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.card_scroll.setAccessibleName(f"{model.label} requirements")
        body = QWidget()
        self.cards = QVBoxLayout(body)
        self.cards.setContentsMargins(0, 0, 0, 0)
        self.cards.setSpacing(8)
        # The two ends of the band: their heights are what the cards this column
        # is *not* realising would have taken, so the scrollbar spans the whole
        # column and the realised cards sit where their index says (SWR-3317).
        self.top_spacer = QWidget()
        self.top_spacer.setFixedHeight(0)
        self.cards.addWidget(self.top_spacer)
        self.bottom_spacer = QWidget()
        self.bottom_spacer.setFixedHeight(0)
        self.cards.addWidget(self.bottom_spacer)
        self.cards.addStretch(1)
        self.card_scroll.setWidget(body)
        self.card_scroll.verticalScrollBar().valueChanged.connect(self._scrolled)
        # A viewport that changed size shows a different band and lays its cards
        # out at a different height, and both answers are read off widgets that
        # only exist after Qt has done that layout (SWR-3317). Without this the
        # column keeps whatever it measured before it had been given a size.
        self.card_scroll.viewport().installEventFilter(self)
        root.addWidget(self.card_scroll, 1)
        self.empty_label = QLabel(model.empty_message)
        self.empty_label.setObjectName("muted")
        self.empty_label.setWordWrap(True)
        self.empty_label.setAccessibleName(model.empty_message)
        root.addWidget(self.empty_label)
        self.set_model(model)
        self.install_theme_hook()

    def apply_theme(self, theme: Theme) -> None:
        """Re-derive the accent and the three places this column paints it."""
        del theme  # the accent is asked of the delivery state, not of a token
        self._restyle()

    def _restyle(self) -> None:
        """The column's whole inline presentation, in one place.

        Called at construction and again on every theme change, so the header,
        the folded rail and the drop sentence cannot drift apart — the rail in
        particular caches its colour for `paintEvent` and has no other way back
        to a token.
        """
        t = tokens()
        self._accent = theme.delivery_color(self.key)
        self.header.setStyleSheet(
            f"font-size:{t.type.scale.sm}px;font-weight:{t.type.weight_display};"
            "text-align:left;padding:0;border:none;background:transparent;"
            f"color:{self._accent};"
        )
        self.rail.set_heading(self._label, self._count, self._accent)
        self._style_drop_hint()

    def _style_drop_hint(self) -> None:
        """Paint the drop sentence for whichever answer the column is giving.

        Read back off the ``dropState`` property the stylesheet already keys the
        border off, so the sentence and the border cannot disagree about what
        this column just said.
        """
        t = tokens()
        reachable = self.property("dropState") == "open"
        colour = t.color.run_text if reachable else t.color.text_secondary
        self.drop_hint.setStyleSheet(f"font-size:{t.type.scale.xs}px;color:{colour};")

    def set_model(self, model: BoardColumnModel) -> None:
        """Update the header count and the empty state without touching cards."""
        heading = f"{model.label} · {model.count}"
        self._label = model.label
        # Kept because `_restyle` re-accents the rail on a theme change and has
        # no model in scope — the rail caches its colour for `paintEvent`, so it
        # has to be handed the heading again rather than repolished.
        self._count = model.count
        self._empty_message = model.empty_message
        self.header.setText(heading)
        self.header.setAccessibleName(f"{heading}, fold this column")
        self.rail.set_heading(model.label, model.count, self._accent)
        self.setAccessibleName(f"{model.label} column")
        self.setAccessibleDescription(
            f"{counted(model.count, 'requirement')} in {model.label}"
            if model.count
            else model.empty_message,
        )
        self.empty_label.setVisible(model.count == 0 and not self.folded)
        self._name_rail()

    # ── folding (SWR-3321) ────────────────────────────────────────────────

    @property
    def folded(self) -> bool:
        """Whether this column is reduced to its rail right now.

        The board's answer unless a drag is hovering, which borrows the column
        open for as long as the card is over it (SWR-3601).
        """
        return self._folded and not self._sprung

    @traces(SWR.SWR_3321)
    def set_folded(self, folded: bool) -> None:
        """Fold this column to its rail, or open it again."""
        if folded == self._folded:
            return
        self._folded = folded
        self._apply_fold()

    @traces(SWR.SWR_3321, SWR.SWR_3601)
    def set_sprung(self, sprung: bool) -> None:
        """Borrow a folded column open while a dragged card hovers it.

        Display only and never remembered: a drag that passes over a column the
        user folded must show the drop target and its stated reason (SWR-3602),
        and must leave the fold exactly as it found it.
        """
        if sprung == self._sprung:
            return
        self._sprung = sprung
        self._apply_fold()

    def _apply_fold(self) -> None:
        """Show the rail or the column, and size this frame for whichever it is."""
        folded = self.folded
        # Focus must not be left in a subtree that is about to be hidden
        # (SWR-3314) — the same rule the filter row follows when it closes. The
        # rail has to be showing before it can take it: Qt refuses focus to a
        # hidden widget, and the focus would then land wherever Qt liked.
        stranded = folded and self.isAncestorOf(self.window().focusWidget() or self)
        self.rail.setVisible(folded)
        if stranded:
            self.rail.setFocus(Qt.FocusReason.OtherFocusReason)
        self.header.setVisible(not folded)
        self.card_scroll.setVisible(not folded)
        self.empty_label.setVisible(not folded and not self._ids)
        self._size_fold()
        self._name_rail()
        # The drag, if one is in the air, has to be re-stated for whichever of
        # the two shapes this column now has: a column that springs open under a
        # dragged card owes the user the sentence its rail had no room for.
        self._show_drop_state()
        # Nothing is realised while folded, so opening one has to paint from
        # scratch rather than trust a band recorded before it closed.
        self.repaint_band(force=True)

    def _size_fold(self) -> None:
        """Give this frame the width the shape it is currently in needs.

        Measured, not chosen: a rail is as wide as the font makes its heading,
        and a hard-coded width clips on the first display scale or platform font
        nobody checked (SWR-3302). It is measured again while a drag is live,
        because a rail widens into a target a card can be aimed at for as long as
        one is in the air (SWR-3321, SWR-3601).

        A folded column with a live drop option takes
        :data:`FOLDED_COLUMN_DROP_WIDTH` instead of its rail's own width, which
        is what gives :meth:`_show_drop_state` room to paint the engine's
        sentence rather than abbreviating it to a glyph. The width is given back
        the moment the drag ends.
        """
        if self.folded:
            self._root.setContentsMargins(
                FOLDED_COLUMN_MARGIN,
                OPEN_COLUMN_MARGINS[1],
                FOLDED_COLUMN_MARGIN,
                OPEN_COLUMN_MARGINS[3],
            )
            width = self.rail.rail_width() + 2 * FOLDED_COLUMN_MARGIN
            if self._drop is not None:
                width = max(width, FOLDED_COLUMN_DROP_WIDTH)
            self.setMinimumWidth(width)
            self.setMaximumWidth(width)
            return
        self._root.setContentsMargins(*OPEN_COLUMN_MARGINS)
        self.setMinimumWidth(OPEN_COLUMN_MIN_WIDTH)
        self.setMaximumWidth(OPEN_COLUMN_MAX_WIDTH)

    def _name_rail(self) -> None:
        """Say what the rail is and what it holds, in words (SWR-3314).

        Including the empty sentence, because SWR-3302's promise that an empty
        column states what belongs there has to survive folding — the rail is
        what an empty column looks like now.
        """
        held = len(self._ids)
        self.rail.setAccessibleName(f"Unfold the {self._label} column")
        described = (
            f"{counted(held, 'requirement')} in {self._label}" if held else self._empty_message
        )
        self.rail.setAccessibleDescription(described)
        # Three sentences, because the rail paints an abbreviation of the first:
        # what column this is, what is in it, and that it is a control. The last
        # line is the one a pointer needs — a narrow shape that opens on a click
        # has to say so before the click (SWR-3314).
        self.rail.setToolTip(
            f"{self.rail.text()} — {described}\nClick to open the {self._label} column",
        )

    def _fold_clicked(self, *, folded: bool) -> None:
        self.fold_toggled.emit(self.key, folded)

    # ── the band (SWR-3317) ───────────────────────────────────────────────

    @property
    def card_ids(self) -> tuple[str, ...]:
        """Every requirement in this column, realised or not."""
        return self._ids

    @property
    def realised(self) -> tuple[str, ...]:
        """The requirements this column currently holds a widget for."""
        return tuple(self._realised)

    @traces(SWR.SWR_3317)
    def set_ids(self, ids: tuple[str, ...]) -> None:
        """Take this column's membership, handing back what left it.

        The releasing half is separate from :meth:`repaint_band` on purpose: a
        filter change can move a card from one column to another, and a board
        that acquired before every column had let go would ask for a widget that
        is still in somebody else's layout.
        """
        self._ids = ids
        live = set(ids)
        for req_id in [key for key in self._realised if key not in live]:
            self._let_go(req_id)
        self._painted = None
        self._name_rail()

    @traces(SWR.SWR_3317)
    def repaint_band(self, *, force: bool = False) -> bool:
        """Realise the cards the viewport shows, and recycle the rest.

        ``False`` when the band has not moved — which is what makes a scroll
        inside one already-realised band cost nothing at all.

        Painting *measures*, and measuring can move the band: a card that turns
        out to be shorter than the opening estimate makes the column shorter,
        which puts a different slice of it under the same scroll position. The
        correcting passes settle that, and stop as soon as the band stops
        moving — which is at once, for every card that has been seen before.
        """
        if self._painting:
            # Setting the spacers moves the scrollbar's range, and a value Qt
            # has to clamp arrives back here as a scroll. One paint at a time:
            # the settling passes below already re-read the band.
            return False
        self._painting = True
        try:
            painted = self._paint_once(force=force)
            if not painted:
                return False
            for _ in range(_SETTLING_PASSES):
                if not self._paint_once(force=False):
                    break
        finally:
            self._painting = False
        return True

    def _paint_once(self, *, force: bool) -> bool:
        if self.folded:
            # The point of folding a store-sized board (SWR-3321, SWR-3317): a
            # folded column keeps its whole membership and pays for none of it.
            for req_id in list(self._realised):
                self._let_go(req_id)
            self._painted = None
            return False
        first, last = self._band()
        if not force and (first, last) == self._painted:
            return False
        self._painted = (first, last)
        wanted = self._ids[first:last]
        live = set(wanted)
        for req_id in [key for key in self._realised if key not in live]:
            self._let_go(req_id)
        for held in self._realised.values():
            self.cards.removeWidget(held)
        ordered: dict[str, QWidget] = {}
        for req_id in wanted:
            widget: QWidget | None = self._realised.get(req_id)
            if widget is None and self._acquire is not None:
                widget = self._acquire(req_id)
            if widget is not None:
                ordered[req_id] = widget
        self._realised = ordered
        for index, widget in enumerate(ordered.values()):
            # Index 0 is the leading spacer, so the band starts at 1.
            self.cards.insertWidget(1 + index, widget)
            widget.setVisible(True)
        self._space(first, last)
        self._measure()
        self._space(first, last)
        return True

    @traces(SWR.SWR_3317)
    def reveal(self, req_id: str) -> QWidget | None:
        """Scroll to *req_id* and realise it. ``None`` when this column has none.

        Two steps, because the offsets and the layout answer different questions.
        Every offset below the realised band is computed from an estimate until
        that card has been laid out, so scrolling by offset lands *near* the
        card — near enough to realise it, not near enough to be sure it is whole
        on screen. The second step asks Qt, off the geometry the layout actually
        produced, which is what stops a column coming to rest on the card *before*
        the one asked for, cut through the middle (SWR-3317).
        """
        if req_id not in self._ids:
            return None
        index = self._ids.index(req_id)
        bar = self.card_scroll.verticalScrollBar()
        offsets = self._offsets()
        viewport = self.card_scroll.viewport().height() or ESTIMATED_COLUMN_HEIGHT
        if not bar.value() <= offsets[index] < bar.value() + viewport:
            bar.setValue(min(offsets[index], bar.maximum()))
        self.repaint_band(force=True)
        widget = self._realised.get(req_id)
        if widget is not None:
            # The spacers the paint just set changed how far this column can
            # scroll, and a scroll area only recomputes that when it is next laid
            # out. Asking for the layout now rather than next turn is what lets
            # the scroll below reach the bottom of a column it has just extended.
            QApplication.sendEvent(self.card_scroll, QEvent(QEvent.Type.LayoutRequest))
            self.card_scroll.ensureWidgetVisible(widget, 0, 0)
            self.repaint_band()
        return self._realised.get(req_id)

    def _let_go(self, req_id: str) -> None:
        widget = self._realised.pop(req_id, None)
        if widget is None:
            return
        focused = widget.window().focusWidget()
        if focused is not None and (focused is widget or widget.isAncestorOf(focused)):
            # The column takes the focus back before the widget is recycled. Qt
            # restores the focus to a widget it hid while focused, so leaving it
            # there would hand the user's focus — and with it the board's
            # selection — to whichever requirement this widget is repainted for
            # next (SWR-3317).
            self.card_scroll.setFocus(Qt.FocusReason.OtherFocusReason)
        self.cards.removeWidget(widget)
        if self._release is not None:
            self._release(req_id, widget)

    def _offsets(self) -> list[int]:
        """Where each card starts, and — last — how tall the whole column is."""
        spacing = self.cards.spacing()
        running = 0
        offsets = [0]
        for req_id in self._ids:
            running += self._heights.get(req_id, ESTIMATED_CARD_HEIGHT) + spacing
            offsets.append(running)
        return offsets

    def _band(self) -> tuple[int, int]:
        """Which slice of :attr:`card_ids` the viewport shows, plus the overscan."""
        total = len(self._ids)
        if not total:
            return (0, 0)
        offsets = self._offsets()
        value = self.card_scroll.verticalScrollBar().value()
        height = self.card_scroll.viewport().height() or ESTIMATED_COLUMN_HEIGHT
        first = max(0, bisect_right(offsets, value) - 1)
        last = min(total, bisect_left(offsets, value + height) + 1)
        return (max(0, first - OVERSCAN), min(total, max(last, first + 1) + OVERSCAN))

    def _space(self, first: int, last: int) -> None:
        offsets = self._offsets()
        self.top_spacer.setFixedHeight(offsets[min(first, len(self._ids))])
        self.bottom_spacer.setFixedHeight(
            max(0, offsets[-1] - offsets[min(last, len(self._ids))]),
        )

    def _measure(self) -> None:
        """Record what the layout actually gave each realised card.

        Cards are not a uniform height — alerts, facts and a wrapped title all
        add rows — so the estimate is only ever the opening guess for a card
        nobody has seen yet, and is replaced the moment one is laid out.

        **Only once it really has been laid out.** A card inserted into a column
        Qt has not sized yet reports a height of a handful of points, and that
        answer used to be recorded like any other. Every offset below it was then
        wrong by a factor of twenty: the band covered the whole column, so the
        virtualisation SWR-3317 exists for bought nothing; :meth:`reveal` decided
        every card was already on screen and scrolled to none of them; and the
        spacers put the top card of a scrolled column half above its own
        viewport, which is how a column came to open on a card cut through the
        middle with neither its id nor its title showing. A height below what the
        widget itself says it cannot go under is not a measurement — it is the
        absence of one, and the estimate is the better answer until there is.
        """
        self.cards.activate()
        for req_id, widget in self._realised.items():
            height = widget.height()
            if height >= max(2, widget.minimumSizeHint().height()):
                self._heights[req_id] = height

    def _scrolled(self, value: int) -> None:
        del value  # the band is read off the bar itself
        self.repaint_band()

    def eventFilter(self, watched: QObject, event: QEvent) -> bool:  # noqa: N802 — Qt's spelling
        """Repaint the band when the viewport it is measured against changes size."""
        if watched is self.card_scroll.viewport() and event.type() == QEvent.Type.Resize:
            self.repaint_band(force=True)
        return False

    # ── the drop target (SWR-3601, SWR-3602) ──────────────────────────────

    @traces(SWR.SWR_3602)
    def set_drop_state(self, option: MoveOption | None) -> None:
        """State whether the dragged card may land here, and why not (SWR-3602).

        Three channels, deliberately: the glyph, the sentence and the border. A
        user who cannot separate the two border colours still reads
        ``⃠ Ready → Running is not a move this board makes``.
        """
        self._drop = option
        self._show_drop_state()

    @traces(SWR.SWR_3321, SWR.SWR_3602)
    def _show_drop_state(self) -> None:
        """Put the drag's answer wherever this column currently has room for it.

        Open, that is the hint under the heading, in the words the engine chose.
        Folded, the rail carries the glyph and the accent — and the words are
        shown too, below it, with the column widened to
        :data:`FOLDED_COLUMN_DROP_WIDTH` for as long as a card is in the air.

        The words are not optional and the tooltip is not a substitute for them.
        SWR-3602 exists so the engine's *sentence* reaches the person who tried
        the move: a ``⃠`` says "no" and only the sentence says why, and a folded
        column is exactly where that matters most, because on a board nobody has
        moved a card through yet every target column is folded. What the rail
        cannot do is carry that sentence at eight characters wide — so the column
        stops being eight characters wide while the drag lasts, rather than the
        sentence being dropped. It costs width only during the drag, which is the
        one moment the user is looking for somewhere to aim (SWR-3321, SWR-3601).
        """
        option = self._drop
        folded = self.folded
        self.rail.set_drop_state(option if folded else None)
        self.drop_hint.setVisible(option is not None)
        if option is None:
            self.drop_hint.setText("")
            self.setProperty("dropState", "")
            self._size_fold()
            self._name_rail()
            self._repolish()
            return
        self.drop_hint.setText(option.sentence)
        self.drop_hint.setAccessibleName(option.sentence)
        self.drop_hint.setVisible(True)
        self.setProperty("dropState", "open" if option.reachable else "closed")
        self._style_drop_hint()
        self.setAccessibleDescription(option.sentence)
        if folded:
            self.rail.setAccessibleDescription(option.sentence)
            self.rail.setToolTip(option.sentence)
        self._size_fold()
        self._repolish()

    def _repolish(self) -> None:
        self.style().unpolish(self)
        self.style().polish(self)

    def dragEnterEvent(self, event: QDragEnterEvent) -> None:  # noqa: N802 — Qt's spelling
        """Open a folded column for the card, then answer whether it may land."""
        self.set_sprung(sprung=True)
        self._decide(event)

    def dragMoveEvent(self, event: QDragMoveEvent) -> None:  # noqa: N802 — Qt's spelling
        self._decide(event)

    def dragLeaveEvent(self, event: QDragLeaveEvent) -> None:  # noqa: N802 — Qt's spelling
        """Give a sprung column back when the card moves off it.

        Belt and braces: Qt does not guarantee this event arrives, so the board
        also releases every sprung column when the drag ends (``cancel_drag``).
        """
        del event  # there is one thing to undo and no detail to read
        self.set_sprung(sprung=False)

    def _decide(self, event: QDragMoveEvent) -> None:
        req_id = _dragged_requirement(event.mimeData())
        option = self._can_drop(req_id) if (req_id and self._can_drop is not None) else None
        if option is not None and option.reachable:
            event.acceptProposedAction()
            return
        event.ignore()

    def dropEvent(self, event: QDropEvent) -> None:  # noqa: N802 — Qt's spelling
        """Hand the drop to the board, which hands it to the engine."""
        req_id = _dragged_requirement(event.mimeData())
        if not req_id or self._on_drop is None or not self._on_drop(self.key):
            event.ignore()
            return
        event.acceptProposedAction()


def _dragged_requirement(mime: QMimeData | None) -> str:
    """The requirement id a drag is carrying, or ``""`` when it carries none.

    The private format is the gate and the text is the payload: a drag from
    anywhere else in the desktop fails the first check and never reaches a
    delivery column, however plausible its text looks.
    """
    if mime is None or not mime.hasFormat(REQUIREMENT_MIME):
        return ""
    return mime.text()


# ── the view ───────────────────────────────────────────────────────────────


@traces(SWR.SWR_3301, SWR.SWR_3302, SWR.SWR_3303, SWR.SWR_3309, SWR.SWR_3312)
class RequirementsView(Themed, QWidget):
    """The board a user reaches from the rail, and everything it opens.

    Attached to :class:`~rotaris.services.requirements_controller
    .RequirementsController`, which connects the four signals below and pushes
    boards and details in (SWR-3315). The view never talks to the engine.
    """

    #: The reading signals `RequirementsController.VIEW_SIGNALS` connects.
    #: ``refresh_requested`` stays part of the contract a board offers its host
    #: (SWR-3315) — the shipped board no longer raises it, because the one
    #: re-evaluation control is the area header's (see :data:`REEVALUATE_TOOLTIP`).
    refresh_requested = Signal()
    requirement_selected = Signal(str)
    requirement_activated = Signal(str)
    scroll_changed = Signal(int)
    #: ``(path, line)`` — an evidence site the user wants opened.
    open_file_requested = Signal(str, int)
    #: A run whose session the user wants to see.
    open_run_requested = Signal(str)
    #: A commit the user wants to see in the Git view.
    open_commit_requested = Signal(str)
    #: ``(req_id, source, target, reason)`` — a card moved between columns, by
    #: drag or by the move bar (SWR-3601). The view never decides what the move
    #: *means*; *reason* is empty for every move but a hold, which the engine
    #: refuses without one (SWR-3201), and which this view therefore asks for
    #: before raising the move at all.
    move_requested = Signal(str, str, str, str)
    #: ``(action, req_id)`` — a named board action (SWR-3604, SWR-3610).
    action_requested = Signal(str, str)
    #: The user has read the standing feedback for this requirement (SWR-3602).
    feedback_dismissed = Signal(str)
    #: A requirement the user wants to edit (SWR-3605).
    edit_requested = Signal(str)
    #: The user wants to create a requirement (SWR-3606).
    create_requested = Signal()
    #: ``(req_id, option key)`` — the user answered a blocker (SWR-3607).
    blocker_answered = Signal(str, str)
    #: The user wants to see the delivery queue (SWR-3608). The board's own way
    #: into it: autonomous scheduling that cannot be *reached* is as opaque as
    #: scheduling that cannot be stopped, so the entry point lives on the board
    #: rather than waiting for somebody to wire a menu.
    queue_requested = Signal()
    #: A requirement whose review the user opened (SWR-3603).
    review_requested = Signal(str)
    #: A requirement whose blockers the user opened (SWR-3607).
    blockers_requested = Signal(str)
    #: The user accepted the adoption offer (SWR-3614). Carries nothing: the
    #: offer is about the workspace, not about a requirement.
    adoption_requested = Signal()
    #: The user dismissed the adoption offer. Writes nothing — least of all a
    #: delivery record (SWR-3614).
    adoption_dismissed = Signal()
    #: The user asked for a verification (SWR-3615). Carries nothing: one run of
    #: the workspace's suite answers for every requirement it covers.
    verification_requested = Signal()

    def __init__(self, parent: QWidget | None = None, *, workspace: str = "") -> None:
        super().__init__(parent)
        preferences = load_board_preferences()
        self._filter = preferences.filter
        self._order = preferences.order
        self._blocked_column = preferences.blocked_column
        self._axis = preferences.axis
        # The one board choice that belongs to the project rather than the
        # person, and therefore the one keyed by workspace (SWR-3321).
        self._workspace = workspace
        self._folds = load_column_folds(workspace)
        self._state: RequirementsBoardState | None = None
        self._cards: dict[str, RequirementCardWidget | EpicCard] = {}
        self._columns: dict[str, _Column] = {}
        self._models: tuple[BoardColumnModel, ...] = ()
        #: The cards that survive the filter, by id — what a column asks for
        #: when it realises one (SWR-3317).
        self._visible: dict[str, RequirementCard] = {}
        self._leaf_pool: list[RequirementCardWidget] = []
        self._epic_pool: list[EpicCard] = []
        # Where a recycled widget waits. Parented rather than orphaned: a widget
        # with no parent is a top-level window in Qt, and a board that recycled
        # forty cards would flash forty of them.
        self._recycled = QWidget(self)
        self._recycled.setVisible(False)
        self._search_text = ""
        self._search_timer = QTimer(self)
        self._search_timer.setSingleShot(True)
        self._search_timer.setInterval(SEARCH_DEBOUNCE_MS)
        self._search_timer.timeout.connect(self._apply_search)
        self._details: dict[str, RequirementDetail] = {}
        self._evidence_target = ""
        self._selected = ""
        self._syncing = False
        self._moves: dict[str, tuple[MoveOption, ...]] = {}
        self._pending_actions: tuple[PendingAction, ...] = ()
        #: ``(req_id, target)`` — the move waiting on a stated reason (SWR-3201).
        self._pending_hold: tuple[str, str] = ("", "")
        self._feedback: tuple[ActionFeedback, ...] = ()
        self._queue: QueueState | None = None
        self._dragging = ""
        self._press_at = QPoint()
        self._press_id = ""
        #: The running pass, as the last progress value described it (SWR-3320).
        self._progress = PassProgress()
        #: Redraws the elapsed clock from a timestamp the pass set once, so a
        #: check that produces nothing for minutes still reads as alive. Runs
        #: only while a pass does.
        self._progress_clock = QTimer(self)
        self._progress_clock.setInterval(PROGRESS_TICK_MS)
        self._progress_clock.timeout.connect(self._render_progress)

        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(8)
        self.filter_bar = self._build_filters()
        root.addWidget(self.filter_bar)
        self.move_bar = self._build_move_bar()
        root.addWidget(self.move_bar)
        root.addWidget(self._build_hold_bar())
        root.addWidget(self._build_feedback())
        root.addWidget(self._build_pass_banner())
        self._stack = QStackedWidget()
        self._pages = ["board", "detail", "evidence", "graph"]
        self._stack.addWidget(self._build_board())
        self.detail_view = RequirementDetailView()
        self.detail_view.close_requested.connect(self.show_board)
        self.detail_view.relation_activated.connect(self._open_relation)
        self.detail_view.evidence_requested.connect(self.open_evidence)
        self.detail_view.graph_requested.connect(self.open_graph)
        self.detail_view.run_activated.connect(self.open_run_requested)
        self.detail_view.commit_activated.connect(self.open_commit_requested)
        self.detail_view.edit_requested.connect(self.edit_requested)
        self.detail_view.blockers_requested.connect(self.blockers_requested)
        self.detail_view.blocker_answered.connect(self.blocker_answered)
        self.detail_view.review_requested.connect(self.review_requested)
        self.detail_view.source_requested.connect(self._open_source)
        self._stack.addWidget(self.detail_view)
        self.evidence_view = EvidenceView()
        self.evidence_view.close_requested.connect(self.show_board)
        self.evidence_view.site_activated.connect(self.open_file_requested)
        self.evidence_view.run_activated.connect(self.open_run_requested)
        self._stack.addWidget(self.evidence_view)
        self.graph_view = RequirementGraphView()
        self.graph_view.close_requested.connect(self.show_board)
        self.graph_view.site_activated.connect(self.open_file_requested)
        self.graph_view.node_activated.connect(self._graph_node)
        self._stack.addWidget(self.graph_view)
        root.addWidget(self._stack, 1)
        # One connection rather than a call in every opener: a pane attached by
        # the workflow slice (SWR-3315) never learns this view exists, so the
        # only place that reliably knows a page changed is the stack itself.
        self._stack.currentChanged.connect(self._sync_chrome)
        self._sync_chrome()
        self._sync_filter_controls()
        self._sync_move_bar()
        self._render_empty()
        self.install_theme_hook()

    def apply_theme(self, theme: Theme) -> None:
        """Repaint the blocked strip, the one part of the board styled here.

        Everything else on this page is a column, a card or a pane, and each of
        those follows the theme on its own.
        """
        del theme  # the strip's colour is the blocked column's, not a token name's
        self._style_blocked_heading()
        if self._state is not None:
            self._render_blocked(self._state)

    def _style_blocked_heading(self) -> None:
        t = tokens()
        self.blocked_heading.setStyleSheet(
            f"font-size:{t.type.scale.sm}px;font-weight:{t.type.weight_display};"
            f"color:{theme.delivery_color(BLOCKED_COLUMN)};"
        )

    # ── construction ──────────────────────────────────────────────────────

    def _build_filters(self) -> QWidget:
        """The board's own toolbar: what to create, what to look at, what to run.

        **One rule decides how heavy a control looks, and it is consequence.**
        The filled button is the one action this screen is *for* — writing a
        requirement — and there is exactly one of it. Bordered buttons write
        something to the project: ``Verify`` records evidence, and ``Move`` on
        the strip below records a transition. Flat ones change only what is on
        screen: ``Filters``, ``Clear``, ``Queue``. Before that rule the row mixed
        the three at random, which left a user no way to tell a control that
        starts minutes of work from one that hides a column.

        ``New requirement`` leads the row for the same reason. On a project that
        has just been opened it is the only thing there is to do, and it used to
        sit at the far right of the strip below, beside a disabled ``Move``.

        **And it is heavier than a variant.** Filled against bordered is a
        difference a user only sees by comparing two controls side by side, which
        is not something anybody does with a toolbar. So the primary is also the
        tallest control on the screen and the only bold one, and it carries the
        ``+`` the rest of the application puts on the action that makes a new
        thing.
        """
        bar = QWidget()
        bar.setAccessibleName("Requirement filters")
        layout = QVBoxLayout(bar)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(6)

        # A flowing bar, not a row: eight controls on one enforced line made the
        # area's minimum the *sum* of them — 826 points on Linux and 1052 on
        # Windows, against a supported minimum window of 1000 (SWR-3302). Flowing,
        # its minimum is the widest single control, so the bar wraps instead of
        # pushing the window past the size the product says it supports.
        top = FlowLayout(spacing=8)
        # Filled, bold, taller than everything beside it, and led by the same
        # plus icon the dashboard's ``New session`` uses (SWR-3708). The variant
        # alone was not carrying it: a filled accent button and a bordered one
        # are the same rectangle in the same row at the same height, and the
        # area header's ``Refresh requirements`` — a control that changes
        # nothing a user cannot get back — was still reading as the screen's
        # most important action. A weight a user has to compare two buttons to
        # notice is not a hierarchy.
        self.create_button = make_button("New requirement", "primary")
        set_button_icon(self.create_button, "plus")
        self.create_button.setAccessibleName("Create a requirement")
        self.create_button.setToolTip("Create a requirement in this project's own store")
        emphatic = QFont(self.create_button.font())
        emphatic.setBold(True)
        self.create_button.setFont(emphatic)
        self.create_button.setMinimumHeight(PRIMARY_BUTTON_HEIGHT)
        self.create_button.clicked.connect(self.create_requested)
        top.addWidget(self.create_button)
        self.search = QLineEdit()
        self.search.setPlaceholderText("Search id or title")
        self.search.setAccessibleName("Search requirements")
        self.search.setClearButtonEnabled(True)
        self.search.setMinimumWidth(150)
        self.search.textChanged.connect(self._search_changed)
        for child in self.search.children():
            # Qt builds the inline clear control, so nobody else names it — and
            # an unnamed control is a control a screen reader announces as
            # nothing.
            if isinstance(child, QToolButton):
                child.setAccessibleName("Clear the search text")
                child.setToolTip("Clear the search text")
        top.addWidget(self.search)
        self.sort_combo = _FittedComboBox()
        self.sort_combo.setAccessibleName("Sort requirements")
        self.sort_combo.set_purpose("Order the cards inside every column")
        for key, label in SORT_ORDERS:
            self.sort_combo.addItem(label, key)
        _compact(self.sort_combo, maximum=CLOSED_COMBO_WIDTH)
        self.sort_combo.currentIndexChanged.connect(self._sort_changed)
        top.addWidget(self.sort_combo)
        self.group_combo = _FittedComboBox()
        self.group_combo.setAccessibleName("Group requirements")
        self.group_combo.set_purpose(
            "What the columns are. Delivery state is what Rotaris has done with a"
            " requirement; the others describe what it already is.",
        )
        for grouping in board_groupings():
            self.group_combo.addItem(grouping.label, grouping.key)
        _compact(self.group_combo, maximum=CLOSED_COMBO_WIDTH)
        self.group_combo.setCurrentIndex(max(0, self.group_combo.findData(self._axis)))
        self.group_combo.currentIndexChanged.connect(self._group_changed)
        top.addWidget(self.group_combo)
        self.filters_button = make_button("Filters", "ghost")
        self.filters_button.setCheckable(True)
        self.filters_button.setAccessibleName("Show filters")
        self.filters_button.toggled.connect(self._toggle_filters)
        top.addWidget(self.filters_button)
        # "Clear", not "Clear filters": the word "Filters" is already on the
        # control immediately to its left, and the pair has to fit the supported
        # minimum window beside Verify (SWR-3615). The *accessible* name stays
        # the full phrase, because a screen reader reads this control alone.
        self.clear_button = make_button("Clear", "ghost")
        self.clear_button.setAccessibleName("Clear filters")
        self.clear_button.setToolTip("Drop every active filter in one action")
        self.clear_button.clicked.connect(self.clear_filter)
        top.addWidget(self.clear_button)
        self.queue_button = make_button("Queue", "ghost")
        self.queue_button.setAccessibleName("Show the delivery queue")
        self.queue_button.setToolTip(
            "What is running, what is next, and why each held requirement is held.",
        )
        self.queue_button.clicked.connect(self.queue_requested)
        top.addWidget(self.queue_button)
        # Bordered, unlike the three beside it: verifying runs the workspace's own
        # suite for minutes and writes evidence into the project, where Filters,
        # Clear and Queue only change what is on screen.
        self.verify_button = make_button("Verify", "secondary")
        self.verify_button.setAccessibleName("Verify requirements")
        self.verify_button.setToolTip(VERIFY_TOOLTIP)
        self.verify_button.clicked.connect(self.verification_requested)
        top.addWidget(self.verify_button)
        layout.addLayout(top)

        self.filter_summary = QLabel()
        self.filter_summary.setObjectName("muted")
        self.filter_summary.setWordWrap(True)
        self.filter_summary.setAccessibleName("Active requirement filter")
        layout.addWidget(self.filter_summary)

        self.filter_row = QWidget()
        self.filter_row.setAccessibleName("Filter dimensions")
        row = QHBoxLayout(self.filter_row)
        row.setContentsMargins(0, 0, 0, 0)
        row.setSpacing(8)
        self.epic_combo = self._dimension(row, "Filter by epic", "Any epic")
        self.source_combo = self._dimension(row, "Filter by source", "Any source")
        self.lifecycle_combo = self._dimension(row, "Filter by lifecycle", "Any lifecycle")
        self.health_combo = self._dimension(row, "Filter by health", "Any health")
        self.priority_combo = self._dimension(row, "Filter by priority", "Any priority")
        self.blocked_toggle = make_button("Blocked", "ghost")
        self.blocked_toggle.setCheckable(True)
        self.blocked_toggle.setChecked(self._blocked_column)
        self.blocked_toggle.setAccessibleName("Show a Blocked column")
        self.blocked_toggle.setToolTip(
            "Blocked requirements are always listed above the board; this adds a column for them.",
        )
        self.blocked_toggle.toggled.connect(self._blocked_column_toggled)
        row.addWidget(self.blocked_toggle)
        row.addStretch(1)
        self.filter_row.setVisible(False)
        layout.addWidget(self.filter_row)
        return bar

    def _dimension(self, row: QHBoxLayout, name: str, any_label: str) -> _FittedComboBox:
        """One filter dimension. Its own "Any …" entry is its label (SWR-3309).

        Without a separate kicker on purpose: five labelled combos are 1400
        points of minimum width, which does not fit the supported 1000×680
        window — and a combo whose first entry reads ``Any epic`` needs no second
        word for it.
        """
        combo = _FittedComboBox()
        combo.setAccessibleName(name)
        combo.set_purpose(name)
        combo.addItem(any_label, "")
        _compact(combo)
        combo.currentIndexChanged.connect(self._dimension_changed)
        row.addWidget(combo)
        return combo

    @traces(SWR.SWR_3601, SWR.SWR_3314)
    def _build_move_bar(self) -> QWidget:
        """The keyboard equivalent of every drop this board offers (SWR-3314).

        A visible row of real controls rather than a shortcut: the accessibility
        rules of ``apps/rotaris/AGENTS.md`` put mouse and desktop controls first
        and let shortcuts *supplement* them, and a drag-and-drop board whose only
        keyboard path was a hidden chord would be exactly the inaccessible action
        those rules forbid. Every column is a button; the ones this requirement
        cannot reach are disabled **with the engine's reason on them**
        (SWR-3602), never disabled silently.

        **The three controls answer one question between them.** The strip used
        to give three different answers at once: a sentence listing every column
        the requirement *could* reach, a picker holding the one that was
        *selected*, and a button whose only word about refusing was in a tooltip
        nobody hovers. Now the picker is the subject — each entry carries the
        engine's own reachability glyph, so the choices are still enumerated —
        and the sentence says what happens to *that* choice and why, which is
        also the reason the button beside it is or is not pressable.
        """
        bar = QWidget()
        bar.setObjectName("requirementMoveBar")
        bar.setAccessibleName("Move the selected requirement")
        row = QHBoxLayout(bar)
        row.setContentsMargins(0, 0, 0, 0)
        row.setSpacing(6)
        self.move_label = QLabel()
        self.move_label.setObjectName("muted")
        self.move_label.setWordWrap(True)
        self.move_label.setAccessibleName("Selected requirement")
        row.addWidget(self.move_label, 1)
        # A picker and one button rather than seven buttons: seven controls plus
        # the filter bar do not fit the supported 1000×680 window, and a control
        # a user has to scroll to reach is an inaccessible action.
        self.move_combo = _FittedComboBox()
        self.move_combo.setAccessibleName("Move the selected requirement to")
        self.move_combo.set_purpose("Which column to move the selected requirement to")
        for key in (*COLUMN_ORDER, BLOCKED_COLUMN):
            self.move_combo.addItem(_label(key), key)
        _compact(self.move_combo, maximum=CLOSED_COMBO_WIDTH)
        self.move_combo.currentIndexChanged.connect(self._move_target_changed)
        row.addWidget(self.move_combo)
        self.move_button = make_button("Move", "secondary")
        self.move_button.setAccessibleName("Move the selected requirement")
        self.move_button.clicked.connect(self._move_clicked)
        row.addWidget(self.move_button)
        return bar

    @traces(SWR.SWR_3601, SWR.SWR_3201)
    def _build_hold_bar(self) -> QWidget:
        """The reason a move onto ``Blocked`` needs, asked in place (SWR-3201).

        The same widget the queue panel mounts, under the move bar it belongs to:
        a hold raised from the board and a hold raised from the queue are the
        same transition and are refused on the same terms, so they ask in the
        same words.
        """
        bar = HoldReasonBar()
        bar.confirmed.connect(self._hold_confirmed)
        bar.cancelled.connect(self._hold_cancelled)
        self.hold_bar = bar
        return bar

    def _move_target_changed(self) -> None:
        if not self._syncing:
            self._sync_move_bar()

    def _move_clicked(self) -> None:
        self.move_selected(str(self.move_combo.currentData() or ""))

    @property
    def move_target(self) -> str:
        """Which column the move control is currently aimed at."""
        return str(self.move_combo.currentData() or "")

    @traces(SWR.SWR_3314)
    def set_move_target(self, target: str) -> bool:
        """Aim the move control at *target*. ``False`` when it names no column."""
        index = self.move_combo.findData(target)
        if index < 0:
            return False
        self.move_combo.setCurrentIndex(index)
        self._sync_move_bar()
        return True

    @traces(SWR.SWR_3602)
    def _build_feedback(self) -> QWidget:
        """Where a refused or accepted action states itself, persistently."""
        holder = QWidget()
        holder.setAccessibleName("Requirement action feedback")
        self._feedback_rows = QVBoxLayout(holder)
        self._feedback_rows.setContentsMargins(0, 0, 0, 0)
        self._feedback_rows.setSpacing(6)
        self._feedback_holder = holder
        holder.setVisible(False)
        return holder

    @traces(SWR.SWR_3320)
    def _build_pass_banner(self) -> QWidget:
        """Where a running adoption or verification pass narrates itself.

        Above the page stack rather than on the board page: a pass takes
        minutes, and a user who opens a requirement's detail while it runs must
        not lose the only thing telling them it is still running. It is also not
        the adoption banner — that one's ``Dismiss`` means "put the finding
        away", and a control that also meant "stop telling me about the run"
        would mean two things (SWR-3320).
        """
        self.pass_banner = InlineBanner()
        # This banner offers nothing to press: dismissing a *finding* is a
        # display choice, and a running pass is not one. The action slot is
        # named and disabled rather than left blank, because a control is
        # announced by name whether or not it happens to be showing (SWR-3314).
        self.pass_banner.action_button.setAccessibleName("Verification progress")
        self.pass_banner.action_button.setEnabled(False)
        self.pass_banner.action_button.setVisible(False)
        self.pass_banner.dismiss_button.setVisible(False)
        self.pass_banner.copy_button.setVisible(False)
        self.pass_banner.setVisible(False)
        return self.pass_banner

    def _build_board(self) -> QWidget:
        page = QWidget()
        page.setAccessibleName("Requirement board")
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(8)

        self.blocked_banner = QFrame()
        self.blocked_banner.setObjectName("card")
        self.blocked_banner.setAccessibleName("Blocked requirements")
        banner = QVBoxLayout(self.blocked_banner)
        banner.setContentsMargins(12, 8, 12, 8)
        banner.setSpacing(4)
        self.blocked_heading = QLabel()
        banner.addWidget(self.blocked_heading)
        self._blocked_rows = QVBoxLayout()
        self._blocked_rows.setContentsMargins(0, 0, 0, 0)
        self._blocked_rows.setSpacing(2)
        banner.addLayout(self._blocked_rows)
        self.blocked_banner.setVisible(False)
        layout.addWidget(self.blocked_banner)

        # The adoption offer (SWR-3614). Above the columns, because on the board
        # it describes the columns are all one pile.
        self.adoption_banner = InlineBanner()
        self.adoption_banner.action_requested.connect(lambda _id: self.adoption_requested.emit())
        self.adoption_banner.dismissed.connect(lambda _id: self.adoption_dismissed.emit())
        self.adoption_banner.copy_button.setVisible(False)
        # Named here rather than only while the offer is up: a control announced
        # as nothing is a control a screen reader cannot describe, whether or not
        # it happens to be showing at the moment (SWR-3314).
        self.adoption_banner.action_button.setAccessibleName(
            "Verify this workspace and adopt what passes",
        )
        self.adoption_banner.dismiss_button.setAccessibleName("Dismiss the adoption offer")
        self.adoption_banner.setVisible(False)
        layout.addWidget(self.adoption_banner)

        self.columns_scroll = QScrollArea()
        self.columns_scroll.setWidgetResizable(True)
        self.columns_scroll.setFrameShape(QFrame.Shape.NoFrame)
        self.columns_scroll.setAccessibleName("Delivery columns")
        self.columns_scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        self.columns_scroll.horizontalScrollBar().valueChanged.connect(self._scrolled)
        holder = QWidget()
        self._columns_layout = QHBoxLayout(holder)
        self._columns_layout.setContentsMargins(0, 0, 0, 0)
        self._columns_layout.setSpacing(10)
        self._columns_layout.addStretch(1)
        self.columns_scroll.setWidget(holder)
        layout.addWidget(self.columns_scroll, 1)

        self.empty_state = EmptyState(
            "No requirements to show",
            "Rotaris has not read a requirement store for this workspace yet.",
            action_label="Clear filters",
            action_id="requirements.clear-filter",
        )
        self.empty_state.action_requested.connect(lambda _action: self.clear_filter())
        layout.addWidget(self.empty_state)
        return page

    # ── the board (SWR-3302, SWR-3312) ────────────────────────────────────

    @property
    def state(self) -> RequirementsBoardState | None:
        """The last board this view was given."""
        return self._state

    @property
    def board_filter(self) -> BoardFilter:
        """What the board is currently filtered to."""
        return self._filter

    @property
    def sort_order(self) -> str:
        """Which order the columns are in."""
        return self._order

    @property
    def columns(self) -> tuple[BoardColumnModel, ...]:
        """The rendered columns, after filtering."""
        return self._models

    @property
    @traces(SWR.SWR_3317)
    def card_widgets(self) -> dict[str, RequirementCardWidget | EpicCard]:
        """The card widgets that exist right now, by requirement id.

        **Realised widgets only, and that is the honest meaning** (SWR-3317).
        The board holds a widget for each column's visible band plus its
        overscan and recycles the rest, so over a store of a thousand
        requirements this is a few dozen entries rather than a thousand. What
        the board *holds* is :attr:`columns`; what a caller can reach whether or
        not it is on screen is :meth:`reveal`.
        """
        return dict(self._cards)

    def column_widget(self, key: str) -> QWidget | None:
        """The rendered column for one delivery state, or ``None``."""
        return self._columns.get(key)

    def column_offset(self, key: str) -> int:
        """How far one column is scrolled — the value SWR-3312 preserves."""
        column = self._columns.get(key)
        return column.card_scroll.verticalScrollBar().value() if column is not None else 0

    @property
    def selected_req_id(self) -> str:
        """Which requirement the board has selected."""
        return self._selected

    @property
    @traces(SWR.SWR_3317)
    def populating(self) -> bool:
        """Whether a typed filter has not reached the board yet (SWR-3317).

        The search box debounces, so a keystroke and the repaint it causes are
        two separate moments and this is the gap between them. It is never
        ``True`` *during* a repaint: a repaint touches the visible band and
        finishes inside the call that started it.
        """
        return self._search_timer.isActive()

    @property
    @traces(SWR.SWR_3317)
    def pending_count(self) -> int:
        """How many of the board's cards have no widget right now (SWR-3317).

        The measure of the virtualization rather than of a queue: a large board
        keeps this large on purpose, and it is what a caller checks to know the
        board is paying per visible card instead of per requirement.
        """
        held = sum(len(column.card_ids) for column in self._columns.values())
        return max(0, held - len(self._cards))

    @property
    def page(self) -> str:
        """Which surface is on top — ``board``, ``detail``, or an attached pane."""
        index = self._stack.currentIndex()
        return self._pages[index] if 0 <= index < len(self._pages) else "board"

    # ── the writing surface (SWR-3601, SWR-3602, SWR-3608) ────────────────

    @property
    def panes(self) -> tuple[str, ...]:
        """Every page in this view's stack, attached ones included.

        Reported so the area's composition root can tell "nobody attached a
        review surface" from "one is already attached" and install its default
        without displacing a caller's own (SWR-3315).
        """
        return tuple(self._pages)

    @traces(SWR.SWR_3315)
    def attach_pane(self, key: str, pane: QWidget) -> bool:
        """Add a further surface — review, queue, editor — to this view's stack.

        The extension point the workflow slice hands the surfaces that follow
        (SWR-3315): they are added here and reached with :meth:`show_pane`, and
        ``main_window.py`` never learns any of them exists.
        """
        if key in self._pages:
            return False
        self._pages.append(key)
        self._stack.addWidget(pane)
        return True

    def _sync_chrome(self) -> None:
        """Show the board's own strips on the board, and nowhere else.

        The filter bar and the move strip sit above the page stack, so before
        this they followed the user into every pane — a delivery queue with a
        requirement search over it, and a ``Move`` control aimed at a card the
        page does not show. Both are the board's: they filter its columns and
        move its selection.

        The hold bar, the feedback strip and the pass banner stay. A pane's own
        action states its outcome in the feedback strip, and a pass that takes
        minutes must keep narrating itself wherever the user went (SWR-3320).
        """
        on_board = self.page == "board"
        self.filter_bar.setVisible(on_board)
        self.move_bar.setVisible(on_board)

    def show_pane(self, key: str) -> bool:
        """Bring an attached pane to the front. ``False`` when there is none."""
        if key not in self._pages:
            return False
        self._stack.setCurrentIndex(self._pages.index(key))
        return True

    @traces(SWR.SWR_3315)
    def pane(self, key: str) -> QWidget | None:
        """The surface registered under *key*, or ``None`` when none is.

        The read side of :meth:`attach_pane`. An area that installs its own
        surfaces (SWR-3316) needs a way to reach one it did not keep a
        reference to, and so does a test that wants to drive the surface the
        *product* built rather than one it composed itself.
        """
        if key not in self._pages:
            return None
        return self._stack.widget(self._pages.index(key))

    @traces(SWR.SWR_3601, SWR.SWR_3602)
    def set_move_options(self, options: Mapping[str, tuple[MoveOption, ...]]) -> None:
        """Take the moves each card may make, as the engine's matrix answers them.

        Handed in rather than computed (SWR-3311): reachability is the transition
        matrix' decision, this view has no access to it, and a board that kept a
        second copy would offer drops the engine refuses.
        """
        self._moves = dict(options)
        self._sync_move_bar()
        if self._state is not None:
            # The blocked banner offers each blocked requirement the move back
            # out of Blocked, and only the engine knows whether it is reachable.
            # The controller pushes the board first and these options second, so
            # without this the banner would render its rows against the *previous*
            # answer — which for a freshly blocked requirement is no answer at all.
            self._render_blocked(self._state)

    def move_options_for(self, req_id: str) -> tuple[MoveOption, ...]:
        """Every column this requirement could be moved to, reachable or not."""
        return self._moves.get(req_id, ())

    def option_for(self, req_id: str, target: str) -> MoveOption | None:
        """One column's move option for one requirement, or ``None``."""
        return next(
            (option for option in self.move_options_for(req_id) if option.target == target),
            None,
        )

    @traces(SWR.SWR_3601)
    def set_actions(
        self,
        pending: tuple[PendingAction, ...],
        feedback: tuple[ActionFeedback, ...],
    ) -> None:
        """Show what is in flight and what came back (SWR-3601, SWR-3602)."""
        self._pending_actions = pending
        self._feedback = feedback
        self._render_feedback()
        self._sync_move_bar()

    @traces(SWR.SWR_3608)
    def set_queue(self, queue: QueueState) -> None:
        """Take the delivery queue, and state it above the board (SWR-3608)."""
        self._queue = queue
        self._sync_move_bar()

    @property
    def queue(self) -> QueueState | None:
        """The queue this view was last given."""
        return self._queue

    @property
    def pending_actions(self) -> tuple[PendingAction, ...]:
        """The board actions currently in flight."""
        return self._pending_actions

    @property
    def feedback(self) -> tuple[ActionFeedback, ...]:
        """The standing feedback, in the order it arrived."""
        return self._feedback

    @traces(SWR.SWR_3601, SWR.SWR_3314)
    def move_selected(self, target: str) -> bool:
        """Move the selected requirement to column *target* — the keyboard path.

        The same signal a drop raises, so the two paths cannot diverge: a move
        that works with the mouse works from the keyboard, which is the whole of
        SWR-3601's fourth acceptance criterion.
        """
        return self.move_card(self._selected, target)

    @traces(SWR.SWR_3601, SWR.SWR_3201)
    def move_card(self, req_id: str, target: str, reason: str = "") -> bool:
        """Raise a move of *req_id* onto *target*. ``False`` when it cannot be.

        One move onto ``Blocked`` takes two steps rather than one, and the pause
        is the product: the engine refuses a hold with no stated reason
        (SWR-3201), so a board that raised the move anyway would spend the user's
        click on a refusal it could see coming. The strip asks, and the confirmed
        answer comes back here as *reason* — through this same method, so the
        drag path and the move bar keep sharing one door.
        """
        option = self.option_for(req_id, target)
        if option is None or not option.reachable:
            return False
        if target == BLOCKED_COLUMN and not reason.strip():
            self._pending_hold = (req_id, target)
            self.hold_bar.ask(req_id)
            return True
        card = self._state.card(req_id) if self._state is not None else None
        self.move_requested.emit(
            req_id,
            card.delivery if card is not None else "",
            target,
            reason.strip(),
        )
        return True

    def _hold_confirmed(self, req_id: str, reason: str) -> None:
        """The user stated why: raise the move the strip was standing in for."""
        pending, target = self._pending_hold
        self._pending_hold = ("", "")
        if pending != req_id or not target:
            return
        self.move_card(req_id, target, reason)

    def _hold_cancelled(self) -> None:
        """The hold was taken back. Nothing was moved, so nothing is undone."""
        self._pending_hold = ("", "")
        self._sync_move_bar()

    # ── dragging a card (SWR-3601) ────────────────────────────────────────

    @property
    def dragging(self) -> str:
        """Which requirement is being dragged right now, ``""`` when none is."""
        return self._dragging

    @traces(SWR.SWR_3601, SWR.SWR_3602)
    def begin_drag(self, req_id: str) -> tuple[MoveOption, ...]:
        """Start dragging *req_id*, and make every column state its answer.

        Both halves of SWR-3602's third criterion happen here: the columns that
        cannot be reached say so in words, and they say it *before* the user
        lets go — a card that only bounces back after the drop teaches nothing.
        """
        self._dragging = req_id
        options = self.move_options_for(req_id)
        for key, column in self._columns.items():
            column.set_drop_state(self.option_for(req_id, key))
        return options

    def cancel_drag(self) -> None:
        """Stop indicating drop targets; the drag ended without a drop."""
        self._dragging = ""
        for column in self._columns.values():
            column.set_drop_state(None)
            # Unconditionally, because Qt does not promise a drag-leave event
            # for the column the card was last over (SWR-3321).
            column.set_sprung(sprung=False)

    @traces(SWR.SWR_3601)
    def drop_on(self, target: str) -> bool:
        """Complete the drag on column *target*. ``False`` when it is refused."""
        req_id = self._dragging
        moved = self.move_card(req_id, target) if req_id else False
        self.cancel_drag()
        return moved

    def _drop_check(self, target: str) -> Callable[[str], MoveOption | None]:
        """The reachability question one column asks about the card in the air."""

        def check(req_id: str) -> MoveOption | None:
            return self.option_for(req_id or self._dragging, target)

        return check

    @traces(SWR.SWR_3601)
    def eventFilter(self, watched: QObject, event: QEvent) -> bool:  # noqa: N802 — Qt's spelling
        """Turn a press-and-drag on a card into a real drag (SWR-3601).

        Installed on the card widgets rather than implemented in them: the card
        is a read-only surface owned by the board slice, and a view that reached
        into it to add a ``mouseMoveEvent`` would make two slices own one widget.
        """
        if isinstance(watched, RequirementCardWidget):
            self._card_event(watched, event)
        return super().eventFilter(watched, event)

    def _card_event(self, card: RequirementCardWidget, event: QEvent) -> None:
        if not isinstance(event, QMouseEvent):
            return
        if event.type() == QEvent.Type.MouseButtonPress:
            self._press_at = event.position().toPoint()
            self._press_id = card.req_id
            return
        if event.type() != QEvent.Type.MouseMove or not self._press_id:
            return
        if not (event.buttons() & Qt.MouseButton.LeftButton):
            return
        distance = (event.position().toPoint() - self._press_at).manhattanLength()
        if distance < QApplication.startDragDistance():
            return
        if not grouping_for(self._axis).draggable:
            # A drop is a workflow action on the delivery axis (SWR-3601) and
            # nothing anywhere else: health is derived (SWR-3211), lifecycle is
            # the project's, and dragging a card into one of those columns would
            # promise a write that cannot happen. Refused at the source rather
            # than at the target, so no drag ever starts that has nowhere legal to
            # land — the filter summary carries the standing reason (SWR-3318).
            self._press_id = ""
            return
        self._start_drag(card)

    def _start_drag(self, card: RequirementCardWidget) -> None:
        req_id = self._press_id
        self._press_id = ""
        self.begin_drag(req_id)
        mime = QMimeData()
        mime.setData(REQUIREMENT_MIME, req_id.encode("utf-8"))
        # Stated as text too, so a drag hovering something else in the desktop
        # announces the requirement rather than an opaque payload.
        mime.setText(req_id)
        drag = QDrag(card)
        drag.setMimeData(mime)
        drag.exec(Qt.DropAction.MoveAction)
        # Qt returns here when the drag ends, dropped or not. `drop_on` has
        # already cleared the indication for a completed drop; this clears it for
        # a cancelled one.
        self.cancel_drag()

    # ── feedback and the move bar ─────────────────────────────────────────

    @traces(SWR.SWR_3602)
    def _render_feedback(self) -> None:
        """One persistent banner per standing action feedback (SWR-3602).

        Persistent, dismissible and never a toast: the reason a move was refused
        is exactly the thing a user needs while they decide what to do instead,
        and a message that expired while they were reading it would send them
        back to repeating the move.
        """
        while self._feedback_rows.count():
            item = self._feedback_rows.takeAt(0)
            widget = item.widget()
            if widget is not None:
                widget.setParent(None)
                widget.deleteLater()
        for entry in self._feedback:
            banner = InlineBanner()
            banner.dismissed.connect(self.feedback_dismissed)
            banner.show_notice(
                UiNotice(
                    id=entry.req_id,
                    severity=NoticeSeverity(entry.severity),
                    title=entry.title,
                    # The engine's own sentence, verbatim (SWR-3602).
                    message=entry.reason,
                    details="\n".join(entry.details),
                    persistent=True,
                ),
            )
            banner.dismiss_button.setAccessibleName(f"Dismiss the feedback for {entry.req_id}")
            self._feedback_rows.addWidget(banner)
        self._feedback_holder.setVisible(bool(self._feedback))

    @traces(SWR.SWR_3601, SWR.SWR_3602, SWR.SWR_3314)
    def _sync_move_bar(self) -> None:
        """Offer exactly the move the selected card can make, and explain the rest.

        The button is never merely grey: when the picked column cannot be
        reached, the engine's own reason is its tooltip, its accessible
        description and the sentence beside it (SWR-3602, and the "explain why an
        unavailable action is disabled" rule of ``apps/rotaris/AGENTS.md``).
        """
        req_id = self._selected
        options = self.move_options_for(req_id)
        pending = next((item for item in self._pending_actions if item.req_id == req_id), None)
        target = self.move_target
        option = next((item for item in options if item.target == target), None)
        reachable = option is not None and option.reachable and pending is None
        self._mark_move_targets(options)
        self.move_button.setAccessibleName(
            f"Move {req_id} to {_label(target)}" if req_id else "Move the selected requirement",
        )
        set_action_availability(
            self.move_button,
            enabled=reachable,
            reason=self._unavailable_reason(req_id, option, pending),
        )
        if reachable and option is not None:
            # The consequence, before the action rather than after it
            # (SWR-3601): a control that starts an agent run says so.
            self.move_button.setToolTip(option.consequence)
            self.move_button.setAccessibleDescription(option.consequence)
        self.move_label.setText(self._move_label_text(req_id, pending, option))
        self.move_label.setAccessibleDescription(self.move_label.text())

    @traces(SWR.SWR_3602)
    def _mark_move_targets(self, options: tuple[MoveOption, ...]) -> None:
        """Put the engine's reachability glyph on every entry of the picker.

        This is where the enumeration the sentence beside it used to carry now
        lives. A user scanning the drop-down reads ``→ Ready`` against
        ``⃠ Running`` and picks the reachable one without hovering anything, and
        the glyph is the same second, non-colour channel a drop indicator uses,
        so the two surfaces answer with one vocabulary (SWR-3602, SWR-3314).
        """
        by_target = {option.target: option for option in options}
        for index in range(self.move_combo.count()):
            key = str(self.move_combo.itemData(index) or "")
            option = by_target.get(key)
            marked = f"{option.indicator} {option.label}" if option is not None else _label(key)
            self.move_combo.setItemText(index, marked)
            self.move_combo.setItemData(
                index,
                option.sentence if option is not None else "",
                Qt.ItemDataRole.ToolTipRole,
            )
        self.move_combo.restate()

    def _unavailable_reason(
        self,
        req_id: str,
        option: MoveOption | None,
        pending: PendingAction | None,
    ) -> str:
        if not req_id:
            return "Select a requirement on the board to move it."
        if pending is not None:
            return f"{pending.sentence}. Wait for the engine's answer."
        if option is None:
            return f"{req_id} cannot be moved from this board."
        return option.reason

    def _move_label_text(
        self,
        req_id: str,
        pending: PendingAction | None,
        option: MoveOption | None,
    ) -> str:
        """The picked column's verdict, as a statement of fact.

        Three things had to stop being true here. The sentence described the
        columns the requirement *could* reach while the picker beside it held a
        different one and the button acted on that one — three controls, three
        answers. It was phrased as an action in progress ("Move X to: …") when it
        was an enumeration. And the reason the button was dead went only to a
        tooltip, which is an explanation a user has to already suspect exists.

        So it now says what the *selected* column means for the *selected*
        requirement, in the engine's own words, and names the column the card is
        in — because a strip that talks about an id no visible card is marked
        with is a strip about nothing the user can see.
        """
        if pending is not None:
            return pending.sentence
        if not req_id:
            return f"Select a requirement on the board to move it ({MOVE_SHORTCUT_HINT})"
        subject = f"{req_id} in {origin}" if (origin := self._delivery_label(req_id)) else req_id
        if option is None:
            return f"{subject} cannot be moved from this board."
        verdict = "can move to" if option.reachable else "cannot move to"
        because = option.consequence if option.reachable else option.reason
        return f"{subject} {verdict} {option.label}. {because}".rstrip()

    def _delivery_label(self, req_id: str) -> str:
        """Which delivery column this requirement is in, as the board heads it."""
        state = self._state
        card = state.card(req_id) if state is not None else None
        return _label(card.delivery) if card is not None and card.delivery else ""

    @traces(SWR.SWR_3302, SWR.SWR_3312)
    def set_board(self, state: RequirementsBoardState, delta: BoardDelta | None = None) -> None:
        """Show *state*, updating in place when *delta* says nothing moved.

        The in-place path is the point (SWR-3312): repainting the cards an
        evaluation actually changed keeps the selection, the scroll position and
        the open pane, and a board of several hundred cards is not rebuilt
        because one requirement got a new title.
        """
        previous = self._state
        self._state = state
        self._selected = state.selected_req_id or self._selected
        self._sync_filter_choices(state)
        in_place = (
            previous is not None
            and delta is not None
            and not delta.rebuild_required
            and bool(self._columns)
        )
        if in_place and delta is not None:
            # The membership did not move, but the values did, so the map a
            # column reads when it realises a card has to follow (SWR-3317).
            self._visible = {
                card.req_id: card for card in visible_cards(state, self._filter, self._order)
            }
            for req_id in delta.changed:
                card = self._visible.get(req_id) or state.card(req_id)
                widget = self._cards.get(req_id)
                if card is None or widget is None:
                    continue
                if isinstance(widget, EpicCard):
                    widget.set_epic(card, self._children_of(req_id, state))
                else:
                    widget.set_card(card)
            self._render_blocked(state)
            self._render_adoption(state)
            self._render_verify(state)
            self.set_pass_progress(state.progress)
            self._sync_selection()
            return
        self._rebuild()

    @traces(SWR.SWR_3320)
    def set_pass_progress(self, progress: PassProgress) -> None:
        """Say where the running pass has got to (SWR-3320).

        The narrow path a progress tick takes: this touches the pass banner and
        the verify control and nothing else. It deliberately does **not** go
        through :meth:`set_board` — ten board rebuilds a second would spend
        everything SWR-3317 bought, and a progress value has no card in it.
        """
        self._progress = progress
        if progress.active and not self._progress_clock.isActive():
            self._progress_clock.start()
        elif not progress.active and self._progress_clock.isActive():
            self._progress_clock.stop()
        self._render_progress()

    @traces(SWR.SWR_3320)
    def _render_progress(self) -> None:
        """Draw the current progress value, clock included.

        Called by the clock timer as well as by a new value, which is what makes
        a check that produces no output for four minutes still read as alive.
        """
        progress = self._progress
        if not progress.active:
            self.pass_banner.show_notice(None)
            return
        elapsed = progress.elapsed(time.time())
        sentence = " · ".join(filter(None, (progress.sentence, elapsed)))
        title = (
            "Verifying and adopting this workspace"
            if progress.kind == "adoption"
            else "Verifying this workspace"
        )
        self.pass_banner.show_notice(
            UiNotice(
                id="requirements-pass-progress",
                severity=NoticeSeverity.INFO,
                title=title,
                message=sentence,
                details=progress.detail,
                persistent=False,
            ),
        )
        # After the notice, never before: showing one clears the meter so a bar
        # cannot outlive what it measured.
        self.pass_banner.set_progress(progress.phase_percent, label=progress.counted)
        self.pass_banner.dismiss_button.setVisible(False)
        self.pass_banner.copy_button.setVisible(False)
        self.pass_banner.setAccessibleName(f"{title}. {sentence}")
        self.pass_banner.setAccessibleDescription(progress.counted or sentence)

    def hideEvent(self, event: QHideEvent) -> None:  # noqa: N802 - Qt override
        """Stop the clock when the area goes away, and restart it on return.

        A 1 Hz timer ticking behind a view nobody is looking at is exactly the
        idle work the diagnostics view exists to catch.
        """
        self._progress_clock.stop()
        super().hideEvent(event)

    def showEvent(self, event: QShowEvent) -> None:  # noqa: N802 - Qt override
        """Pick the clock back up if a pass is still running."""
        super().showEvent(event)
        if self._progress.active and not self._progress_clock.isActive():
            self._progress_clock.start()
        self._render_progress()

    @traces(SWR.SWR_3302, SWR.SWR_3317)
    def _rebuild(self) -> None:
        """Recompute the membership and repaint every column's band.

        Nothing is torn down (SWR-3317): the columns stay, their scroll
        positions stay, and each one is handed its new ordered membership and
        asked to repaint the band its viewport shows. That is what makes a
        filter change cost the visible cards rather than all of them, and what
        makes the selection and the scroll survive one exactly as they survive a
        re-evaluation (SWR-3312).
        """
        state = self._state
        if state is None:
            self._render_empty()
            return
        horizontal = self.columns_scroll.horizontalScrollBar().value()
        cards = visible_cards(state, self._filter, self._order)
        self._visible = {card.req_id: card for card in cards}
        self._models = board_columns(
            state,
            cards,
            blocked_column=self._blocked_column,
            axis=self._axis,
        )
        self._sync_columns()
        for model in self._models:
            column = self._columns[model.key]
            column.set_model(model)
            column.set_ids(model.card_ids)
        # After the membership and before the bands: a column that just emptied
        # folds itself here, and one that just gained its first card opens
        # (SWR-3321).
        self._apply_folds()
        for column in self._columns.values():
            column.repaint_band(force=True)
        self._render_blocked(state)
        self._render_adoption(state)
        self._render_verify(state)
        self.set_pass_progress(state.progress)
        self._render_empty()
        self.columns_scroll.horizontalScrollBar().setValue(horizontal)
        self._sync_selection()

    def _sync_columns(self) -> None:
        """Build the column widgets, but only when the set of columns changed.

        Which is the blocked toggle and nothing else: a filter, a sort and a
        re-evaluation all leave the same seven columns in the same order, and
        rebuilding them would throw away the scroll position each one holds.
        """
        wanted = tuple(model.key for model in self._models)
        if tuple(self._columns) == wanted:
            return
        offsets = {
            key: column.card_scroll.verticalScrollBar().value()
            for key, column in self._columns.items()
        }
        self._clear_columns()
        for model in self._models:
            column = _Column(
                model,
                acquire=self._acquire_card,
                release=self._release_card,
                can_drop=self._drop_check(model.key),
                on_drop=self.drop_on,
            )
            column.fold_toggled.connect(self._fold_toggled)
            self._columns[model.key] = column
            # Stretched, so a window with room to spare spends it on the columns
            # that hold cards rather than on the gap beside them (SWR-3302). A
            # column stops at OPEN_COLUMN_MAX_WIDTH — past that a card's title
            # runs to a line length nobody scans — and a folded one cannot grow
            # at all, so what is left over after every column has reached its cap
            # still lands on the trailing spacer. Below the cap the board is
            # exactly as wide as the window, which is the state most boards are
            # in: two open columns on a wide screen now measure 340 points each
            # instead of 276 with 700 points of dark nothing to their right.
            self._columns_layout.insertWidget(self._columns_layout.count() - 1, column, 1)
            remembered = offsets.get(model.key)
            if remembered:
                column.card_scroll.verticalScrollBar().setValue(remembered)

    # ── folding columns (SWR-3321) ────────────────────────────────────────

    @traces(SWR.SWR_3321)
    def _apply_folds(self) -> None:
        """Fold every column the way this workspace says it should be.

        Run after each pass over the models rather than once at construction,
        which is what makes "empty folds itself" a live rule: a column nobody
        decided about follows its own count, so a card can never arrive into
        one that stays folded. A column the user answered for keeps their
        answer, whatever it now holds.

        The one exception is the board a project starts on
        (:func:`pipeline_unused`): while nothing has moved past the column
        requirements arrive in, the delivery columns stay open, so the pipeline a
        first-time user is meant to drive is on screen instead of folded away.
        Only the delivery axis has a pipeline — the open axes name a column per
        epic or source (SWR-3318), and folding the empty ones is the whole reason
        those axes are usable at all.
        """
        fold_empty = self._axis != DEFAULT_BOARD_AXIS or not pipeline_unused(self._models)
        for model in self._models:
            column = self._columns.get(model.key)
            if column is not None:
                column.set_folded(self._folds.folded(model, fold_empty=fold_empty))

    @traces(SWR.SWR_3321)
    def column_folded(self, key: str) -> bool:
        """Whether the column for *key* is reduced to its rail. ``False`` for none."""
        column = self._columns.get(key)
        return column is not None and column.folded

    @traces(SWR.SWR_3321)
    def set_column_folded(self, key: str, *, folded: bool) -> bool:
        """Record the user's fold of one column. ``False`` when it names none.

        The keyboard and mouse paths meet here — the heading, the rail and a
        caller all state the same intent, so none of them can drift from the
        others.
        """
        if key not in self._columns:
            return False
        self._fold_toggled(key, folded)
        return True

    def _fold_toggled(self, key: str, folded: bool) -> None:
        """Remember the decision for this workspace, then show it."""
        self._folds = self._folds.with_choice(key, folded=folded).pruned(
            model.key for model in self._models
        )
        save_column_folds(self._workspace, self._folds)
        self._apply_folds()

    @traces(SWR.SWR_3317)
    def _acquire_card(self, req_id: str) -> QWidget | None:
        """A widget painting *req_id* — recycled where one is free.

        Recycled rather than rebuilt: a card scrolling out of the band leaves a
        widget behind, and repainting it through ``set_card`` for the card
        scrolling in is the same in-place update the live-board path already
        makes (SWR-3312). ``None`` when this board no longer shows *req_id*.
        """
        state = self._state
        card = self._visible.get(req_id)
        if state is None or card is None:
            return None
        existing = self._cards.get(req_id)
        if existing is not None:
            return existing
        widget: RequirementCardWidget | EpicCard
        if card.is_epic:
            children = self._children_of(req_id, state)
            if self._epic_pool:
                widget = self._epic_pool.pop()
                widget.set_epic(card, children)
            else:
                widget = self._build_epic(card, children)
        else:
            if self._leaf_pool:
                widget = self._leaf_pool.pop()
                widget.set_card(card)
            else:
                widget = self._build_leaf(card)
            widget.set_selected(req_id == self._selected)
        self._cards[req_id] = widget
        return widget

    @traces(SWR.SWR_3317)
    def _release_card(self, req_id: str, widget: QWidget) -> None:
        """Take a card widget back for reuse — or drop it once the pool is full."""
        self._cards.pop(req_id, None)
        widget.setParent(self._recycled)
        widget.setVisible(False)
        if isinstance(widget, EpicCard) and len(self._epic_pool) < RECYCLE_LIMIT:
            self._epic_pool.append(widget)
            return
        if isinstance(widget, RequirementCardWidget) and len(self._leaf_pool) < RECYCLE_LIMIT:
            self._leaf_pool.append(widget)
            return
        widget.deleteLater()

    def _build_epic(
        self,
        card: RequirementCard,
        children: tuple[RequirementCard, ...],
    ) -> EpicCard:
        epic = EpicCard(card, children)
        epic.expand_requested.connect(self.filter_to_epic)
        epic.activated.connect(self._activate)
        return epic

    def _build_leaf(self, card: RequirementCard) -> RequirementCardWidget:
        leaf = RequirementCardWidget(card)
        # Connected once, for the life of the widget: every signal names the
        # card the widget is *currently* painting, so recycling it onto another
        # requirement cannot leave a connection pointing at the old one.
        leaf.activated.connect(self._activate)
        leaf.selected.connect(self._select)
        leaf.evidence_activated.connect(self.open_evidence)
        # The card stays a read-only widget; the drag is this view's
        # (SWR-3601). An epic gets none: its state follows from its children
        # and is never set (SWR-3212, SWR-3308).
        leaf.installEventFilter(self)
        return leaf

    def _children_of(
        self,
        epic_id: str,
        state: RequirementsBoardState,
    ) -> tuple[RequirementCard, ...]:
        return tuple(card for card in state.cards if card_fact(card, _EPIC_FACT) == epic_id)

    def _clear_columns(self) -> None:
        for column in self._columns.values():
            # Hands every realised widget back to the pool first, so a column
            # that goes away does not take its cards with it (SWR-3317).
            column.set_ids(())
            self._columns_layout.removeWidget(column)
            column.setParent(None)
            column.deleteLater()
        self._columns = {}

    @traces(SWR.SWR_3303)
    @traces(SWR.SWR_3614)
    def _render_adoption(self, state: RequirementsBoardState) -> None:
        """State the adoption finding, or say nothing at all (SWR-3614).

        Rendering it writes nothing and neither does dismissing it. The offer
        disappears by itself the moment the projection stops carrying one, which
        is what happens as soon as anything has been delivered or adopted — the
        finding it reports is then no longer true.
        """
        offer = state.adoption
        if offer is None or not offer.worth_offering:
            self.adoption_banner.show_notice(None)
            return
        running = state.adopting
        self.adoption_banner.show_notice(
            UiNotice(
                id="requirements-adoption",
                severity=NoticeSeverity.INFO,
                title=offer.title,
                # While the pass runs its own banner narrates it, phase by phase
                # (SWR-3320). This one keeps stating the finding, so the two
                # never say the same thing in two different ways.
                message=("Verifying and adopting…" if running else offer.message),
                persistent=True,
                action_label="" if running else "Verify and adopt",
                action_id="adopt",
            ),
        )
        self.adoption_banner.action_button.setVisible(not running)
        self.adoption_banner.action_button.setAccessibleName(
            "Verify this workspace and adopt what passes",
        )
        self.adoption_banner.dismiss_button.setAccessibleName("Dismiss the adoption offer")
        self.adoption_banner.copy_button.setVisible(False)

    @traces(SWR.SWR_3615)
    def _render_verify(self, state: RequirementsBoardState) -> None:
        """Say what Verify will do before it does it, and say when it is doing it.

        The cost is stated on the control rather than in a dialog nobody reads:
        a user hovering "Verify" learns that it runs the project's own suite,
        that it takes minutes, and — the part that is easy to assume wrongly —
        that it records evidence and moves no card (SWR-3615).
        """
        running = state.verifying
        self.verify_button.setText(VERIFY_RUNNING if running else "Verify")
        self.verify_button.setEnabled(not running and not state.adopting)
        # The phase goes on the tooltip rather than the label: a control whose
        # text changes width every few seconds moves the toolbar under the
        # pointer, and the banner is where the narration belongs (SWR-3320).
        summary = state.progress.summary if state.progress.active else ""
        self.verify_button.setToolTip(
            summary or (VERIFY_RUNNING_TOOLTIP if running else VERIFY_TOOLTIP),
        )
        self.verify_button.setAccessibleName(
            "Verification running" if running else "Verify requirements",
        )
        self.verify_button.setAccessibleDescription(summary)

    @traces(SWR.SWR_3303, SWR.SWR_3601)
    def _render_blocked(self, state: RequirementsBoardState) -> None:
        """State every blocked requirement above the board, once, with a way out.

        Above the columns rather than in one: the blocked count has to be
        reachable without scrolling any column (SWR-3303), and a user who cannot
        separate amber from red still reads the flag and the count here.

        **It is a summary of the column, not a second copy of it.** When the
        board is showing a ``Blocked`` column the same two requirements are on
        screen twice, and they used to answer to different controls in each
        place — the card offered its detail, its evidence and a drag, the banner
        row offered a file. Two listings of one fact, with two sets of
        affordances, is how a user comes to believe they are two different
        things. So the heading says where the requirements are and each row's
        action *goes* there: it unfolds the column if it is folded, scrolls it
        into view, selects the card and hands it the focus, from which every
        action a card has is one key away. Only when the column is switched off
        (SWR-3303 makes it a display setting) is the banner the sole listing —
        and then, and only then, the row opens the requirement itself.

        Three decisions the wording depends on:

        - **The id labels the row; it is not part of the sentence.** One
          requirement, one id, at the start of the line — the engine's reason no
          longer repeats it and neither does this.
        - **The banner does not re-say "Blocked".** The heading already did, so
          each row carries the reason alone (:func:`blocker_reason`), which is
          also what keeps the row from being the card's alert line verbatim. The
          words are still the engine's: nothing here rewords a refusal the board
          did not make (SWR-3602).
        - **The row's action addresses the block, not the file.** Opening the
          requirement's document has nothing to do with why it stopped. A blocked
          requirement has exactly one legal move — back to the state it was
          blocked in (SWR-3201) — and the engine's own move options say whether
          it is reachable, so the row offers *that* first. Beside it goes
          ``Show in <column>``, which takes the user to the card the row is about
          rather than to a second place to act on it; ``Open`` survives only as
          the fallback for a board whose Blocked column is switched off, where
          there is no card to be shown.
        """
        blocked = [card for card in state.cards if is_blocked(card)]
        while self._blocked_rows.count():
            item = self._blocked_rows.takeAt(0)
            widget = item.widget()
            if widget is not None:
                widget.setParent(None)
                widget.deleteLater()
        self.blocked_banner.setVisible(bool(blocked))
        if not blocked:
            self.blocked_heading.setText("")
            self.blocked_banner.setAccessibleDescription("No requirement is blocked.")
            return
        t = tokens()
        noun = "requirement" if len(blocked) == 1 else "requirements"
        column = self._blocked_label()
        where = f" — in the {column} column" if column else " — no column shows them"
        heading = f"⚑ {len(blocked)} blocked {noun}{where}"
        self.blocked_heading.setText(heading)
        self.blocked_heading.setAccessibleName(heading)
        for card in blocked:
            reason = blocker_reason(card) or "no reason was recorded"
            row = QWidget()
            row.setAccessibleName(f"{card.req_id} {reason}")
            layout = QHBoxLayout(row)
            layout.setContentsMargins(0, 0, 0, 0)
            layout.setSpacing(8)
            text = QLabel(f"{card.req_id} — {reason}")
            text.setWordWrap(True)
            # Body weight and the full text colour, not the muted grey this row
            # used to be painted in. Why a requirement stopped is the most
            # consequential sentence on the board, and it was the quietest thing
            # on it — quieter than the card facts, quieter than the column
            # headings, and set against a green acceptance beside it.
            text.setStyleSheet(f"font-size:{t.type.scale.sm}px;color:{t.color.text};")
            text.setAccessibleName(text.text())
            layout.addWidget(text, 1)
            req_id = card.req_id
            # The one column a blocked card can be dropped on, taken from the
            # options the engine answered with rather than from ``blocked_from``:
            # a requirement blocked mid-run is released to Ready, because a
            # person may not put one back into Running (SWR-3203).
            back = next(
                (option for option in self.move_options_for(req_id) if option.reachable),
                None,
            )
            if back is not None:
                target = back.target
                unblock = make_button(f"Return to {back.label}", "ghost")
                unblock.setAccessibleName(f"Return {req_id} to {back.label}")
                unblock.setAccessibleDescription(back.consequence)
                unblock.setToolTip(back.consequence)
                unblock.clicked.connect(
                    lambda _=False, req=req_id, to=target: self.move_card(req, to),
                )
                layout.addWidget(unblock)
            if column:
                button = make_button(f"Show in {column}", "ghost")
                button.setAccessibleName(f"Show {req_id} in the {column} column")
                button.setToolTip(f"Go to this requirement's card in the {column} column")
                button.clicked.connect(lambda _=False, req=req_id: self.show_on_board(req))
            else:
                button = make_button("Open", "ghost")
                button.setAccessibleName(f"Open blocked requirement {req_id}")
                button.setToolTip("No column is showing blocked requirements, so this opens it")
                button.clicked.connect(lambda _=False, req=req_id: self._activate(req))
            layout.addWidget(button)
            self._blocked_rows.addWidget(row)
        self.blocked_banner.setAccessibleDescription(
            "; ".join(f"{card.req_id} {blocker_reason(card)}" for card in blocked),
        )

    def _blocked_label(self) -> str:
        """What the board calls the column holding blocked cards, ``""`` when none does.

        The label the *rendered* board is using rather than the constant, because
        the axis decides it: grouping by epic or lifecycle (SWR-3318) puts a
        blocked requirement in a column named after its epic, and a banner that
        promised a ``Blocked`` column there would point at nothing.
        """
        state = self._state
        if state is None:
            return ""
        blocked = [card.req_id for card in state.cards if is_blocked(card)]
        for model in self._models:
            if any(req_id in model.card_ids for req_id in blocked):
                return model.label
        return ""

    @traces(SWR.SWR_3303, SWR.SWR_3317)
    def show_on_board(self, req_id: str) -> bool:
        """Go to where a requirement already is: its column, opened, scrolled and selected.

        What the blocked banner's rows do instead of being a second listing, and
        the one navigation the board owes any summary above it. Four things have
        to be true before a user is looking at the card, and each of them can be
        false on its own: the board may not be the surface on top, the column may
        be folded to a rail (SWR-3321), it may be scrolled off the side of the
        board, and the card itself may not be realised at all (SWR-3317).
        """
        column = next(
            (key for key, widget in self._columns.items() if req_id in widget.card_ids),
            "",
        )
        if not column:
            return False
        self._stack.setCurrentIndex(0)
        if self.column_folded(column):
            # Recorded like any other unfold: the user asked for this column, and
            # SWR-3321 says a hand-made choice outranks emptiness until they
            # change it back.
            self.set_column_folded(column, folded=False)
        widget = self._columns[column]
        self.columns_scroll.ensureWidgetVisible(widget)
        self._select(req_id)
        card = self.reveal(req_id)
        if card is not None:
            card.setFocus(Qt.FocusReason.OtherFocusReason)
        return True

    def _render_empty(self) -> None:
        """Say why the board is empty — unread, genuinely empty, or filtered."""
        state = self._state
        filtered = self._filter.active
        # The board's *membership*, not its realised widgets: a column scrolled
        # away from every card it holds is not an empty board (SWR-3317).
        has_cards = bool(self._visible)
        if state is None:
            title, description, action = (
                "Requirements have not been read yet",
                "Rotaris reads this workspace's requirement store when you open this view.",
                "",
            )
        elif has_cards:
            self.empty_state.setVisible(False)
            self.columns_scroll.setVisible(True)
            return
        elif filtered:
            title, description, action = (
                "No requirement matches this filter",
                f"{self._filter.description}. Clear it to see the whole board again.",
                # Not "Clear filters": that is the toolbar control's name, and
                # two controls announced identically are two controls a screen
                # reader cannot tell apart.
                "Clear the board filter",
            )
        else:
            title, description, action = (
                "This board has no requirements",
                # The controller names the source that produced this nothing
                # when it knows one (SWR-3120); this is the sentence for a board
                # nobody could attribute.
                state.empty_reason
                or "The requirement store is readable but declares no requirement.",
                "",
            )
        self.empty_state.configure(
            title,
            description,
            action_label=action,
            action_id="requirements.clear-filter",
        )
        if self.empty_state.action_button is not None:
            # `configure` names the button after its label, and an action-less
            # empty state leaves it hidden and nameless. Named anyway: the
            # accessibility sweep walks controls, not only visible ones.
            self.empty_state.action_button.setAccessibleName(action or "Clear the board filter")
        self.empty_state.setVisible(True)
        self.columns_scroll.setVisible(False)

    # ── filtering (SWR-3309) ──────────────────────────────────────────────

    @traces(SWR.SWR_3309, SWR.SWR_3317)
    def set_filter(self, board_filter: BoardFilter) -> None:
        """Apply *board_filter*, state it, remember it, and repaint the board."""
        self._filter = board_filter
        # Whatever the search box was still going to apply is now moot: this
        # filter is the newer answer, and letting the timer fire afterwards
        # would put the older text back (SWR-3317).
        self._search_timer.stop()
        self._search_text = board_filter.text
        self._sync_filter_controls()
        save_board_preferences(
            self._filter,
            self._order,
            blocked_column=self._blocked_column,
            axis=self._axis,
        )
        self._rebuild()

    @traces(SWR.SWR_3309)
    def set_sort_order(self, order: str) -> None:
        """Re-order the board. Display only: no delivery state moves."""
        self._order = order if order in {key for key, _ in SORT_ORDERS} else SORT_ORDERS[0][0]
        self._sync_filter_controls()
        save_board_preferences(
            self._filter,
            self._order,
            blocked_column=self._blocked_column,
            axis=self._axis,
        )
        self._rebuild()

    @traces(SWR.SWR_3318)
    def set_axis(self, axis: str) -> None:
        """Group the board by *axis*. Display only: no delivery state moves.

        No re-read of the engine: the cards already carry every value an axis
        groups by, so this is the same repaint a filter change is (SWR-3317).
        """
        self._axis = grouping_for(axis).key
        self._sync_filter_controls()
        save_board_preferences(
            self._filter,
            self._order,
            blocked_column=self._blocked_column,
            axis=self._axis,
        )
        self._rebuild()

    @property
    def axis(self) -> str:
        """What the columns currently are (SWR-3318)."""
        return self._axis

    @traces(SWR.SWR_3309)
    def clear_filter(self) -> None:
        """Drop every filter dimension in one action (SWR-3309)."""
        self.set_filter(BoardFilter())

    @traces(SWR.SWR_3308)
    def filter_to_epic(self, epic_id: str) -> None:
        """Reduce the board to one epic's children, without leaving the board."""
        self.set_filter(replace(self._filter, epic=epic_id))
        self.show_board()

    @traces(SWR.SWR_3317)
    def _search_changed(self, text: str) -> None:
        """Let the typing settle before the board is recomputed (SWR-3317).

        A keystroke is not a filter: recomputing on each one made a user who
        typed five characters pay for five whole boards, and the four they typed
        through were never on screen long enough to read.
        """
        if self._syncing:
            return
        self._search_text = text
        self._search_timer.start()

    def _apply_search(self) -> None:
        self.set_filter(replace(self._filter, text=self._search_text))

    def _sort_changed(self) -> None:
        if self._syncing:
            return
        self.set_sort_order(str(self.sort_combo.currentData() or SORT_ORDERS[0][0]))

    def _group_changed(self) -> None:
        if self._syncing:
            return
        self.set_axis(str(self.group_combo.currentData() or DEFAULT_BOARD_AXIS))

    def _dimension_changed(self) -> None:
        if self._syncing:
            return
        self.set_filter(
            BoardFilter(
                text=self.search.text(),
                epic=str(self.epic_combo.currentData() or ""),
                source=str(self.source_combo.currentData() or ""),
                lifecycle=str(self.lifecycle_combo.currentData() or ""),
                health=str(self.health_combo.currentData() or ""),
                priority=str(self.priority_combo.currentData() or ""),
            ),
        )

    def _blocked_column_toggled(self, checked: bool) -> None:
        self._blocked_column = checked
        save_board_preferences(
            self._filter,
            self._order,
            blocked_column=checked,
            axis=self._axis,
        )
        self._rebuild()

    @traces(SWR.SWR_3314)
    def _toggle_filters(self, shown: bool) -> None:
        """Open or close the filter row, taking the focus with it.

        A control inside a closed row must not keep the focus or stay in the tab
        sequence (SWR-3314), so focus returns to the toggle that closed it.
        """
        self.filter_row.setVisible(shown)
        self.filters_button.setAccessibleName("Hide filters" if shown else "Show filters")
        if not shown and self.filter_row.isAncestorOf(self.focusWidget() or self):
            self.filters_button.setFocus(Qt.FocusReason.OtherFocusReason)

    def _sync_filter_controls(self) -> None:
        self._syncing = True
        try:
            if self.search.text() != self._filter.text:
                self.search.setText(self._filter.text)
            index = self.sort_combo.findData(self._order)
            self.sort_combo.setCurrentIndex(max(0, index))
            self.group_combo.setCurrentIndex(max(0, self.group_combo.findData(self._axis)))
            for combo, value in (
                (self.epic_combo, self._filter.epic),
                (self.source_combo, self._filter.source),
                (self.lifecycle_combo, self._filter.lifecycle),
                (self.health_combo, self._filter.health),
                (self.priority_combo, self._filter.priority),
            ):
                combo.setCurrentIndex(max(0, combo.findData(value)))
        finally:
            self._syncing = False
        stated = [self._filter.description] if self._filter.active else []
        if self._axis != DEFAULT_BOARD_AXIS:
            # Stated, not implied: a board whose columns are not delivery states
            # looks like a board whose requirements moved, and the one thing a
            # user must never conclude from a grouping is that something was
            # written (SWR-3318).
            stated.append(
                f"grouped by {grouping_for(self._axis).label.casefold()}, drag disabled",
            )
        summary = " · ".join(stated)
        self.filter_summary.setText(summary)
        self.filter_summary.setAccessibleDescription(summary)
        # A row saying "No filter" is a row spent telling a user that nothing has
        # happened, directly under a Clear button greyed out for the same reason.
        # The line exists so a *filtered* board is never mistaken for an empty one
        # (SWR-3309); with no filter there is nothing for it to prevent.
        self.filter_summary.setVisible(bool(summary))
        self.clear_button.setEnabled(self._filter.active)
        self.clear_button.setToolTip(
            "" if self._filter.active else "No filter is active.",
        )

    def _sync_filter_choices(self, state: RequirementsBoardState) -> None:
        """Offer exactly the values this board actually contains."""
        epics = sorted({card.req_id for card in state.cards if card.is_epic})
        epics += sorted(
            {value for card in state.cards if (value := card_fact(card, _EPIC_FACT)) not in epics}
        )
        choices = (
            (self.epic_combo, epics, self._filter.epic),
            (
                self.source_combo,
                sorted({v for card in state.cards if (v := card_fact(card, _SOURCE_FACT))}),
                self._filter.source,
            ),
            (
                self.lifecycle_combo,
                sorted({card.lifecycle_label for card in state.cards}),
                self._filter.lifecycle,
            ),
            (
                self.health_combo,
                sorted({card.health_label for card in state.cards}),
                self._filter.health,
            ),
            (
                self.priority_combo,
                [
                    p
                    for p in PRIORITY_ORDER
                    if any(card_fact(c, _PRIORITY_FACT) == p for c in state.cards)
                ],
                self._filter.priority,
            ),
        )
        self._syncing = True
        try:
            for combo, values, current in choices:
                wanted = [combo.itemText(0), *values]
                have = [combo.itemText(row) for row in range(combo.count())]
                if have == wanted:
                    continue
                any_label = combo.itemText(0)
                combo.clear()
                combo.addItem(any_label, "")
                for value in values:
                    combo.addItem(value, value)
                combo.setCurrentIndex(max(0, combo.findData(current)))
        finally:
            self._syncing = False

    # ── selection, panes and keyboard (SWR-3307, SWR-3310, SWR-3314) ──────

    def _select(self, req_id: str) -> None:
        if req_id == self._selected:
            return
        self._selected = req_id
        self._sync_selection()
        # The move bar follows the selection: its buttons are the keyboard
        # equivalent of dropping *this* card (SWR-3314).
        self._sync_move_bar()
        self.requirement_selected.emit(req_id)

    def _open_source(self, req_id: str) -> None:
        """A read-only requirement's own artefact — reached, not edited (SWR-3605)."""
        detail = self._details.get(req_id)
        if detail is not None and detail.source_path:
            self.open_file_requested.emit(detail.source_path, 0)

    def _activate(self, req_id: str) -> None:
        self._evidence_target = ""
        self._select(req_id)
        self.requirement_activated.emit(req_id)
        detail = self._details.get(req_id)
        if detail is not None and self.page == "board":
            self.show_detail(detail)

    def _open_relation(self, req_id: str) -> None:
        self._activate(req_id)

    def _graph_node(self, req_id: str) -> None:
        self._select(req_id)
        self.requirement_activated.emit(req_id)

    def _sync_selection(self) -> None:
        for req_id, widget in self._cards.items():
            if isinstance(widget, RequirementCardWidget):
                widget.set_selected(req_id == self._selected)

    def _scrolled(self, value: int) -> None:
        self.scroll_changed.emit(value)

    @traces(SWR.SWR_3312)
    def show_detail(self, detail: RequirementDetail) -> None:
        """Show one requirement's detail — or feed it to the pane already open.

        Called by the controller whenever a requirement is activated. A detail
        arriving while another surface is open enriches it instead of yanking
        the user into a different one (SWR-3312) — and that holds for every
        surface, not only the evidence and graph panes this file happens to
        own. The deep read is asynchronous (SWR-3313), so it lands whenever it
        lands; a reviewer who opened a review and was thrown into the detail
        view a second later did not ask for that.
        """
        self._details[detail.req_id] = detail
        self.detail_view.show_detail(detail)
        if self._evidence_target == detail.req_id:
            self.open_evidence(detail.req_id)
            return
        if self.page == "graph":
            state = self._state
            if state is not None:
                self.graph_view.show_graph(detail.req_id, state, detail)
            return
        if self.page not in {"board", "detail"}:
            return
        self._stack.setCurrentWidget(self.detail_view)
        self.detail_view.setFocus(Qt.FocusReason.OtherFocusReason)

    @traces(SWR.SWR_3306)
    def open_evidence(self, req_id: str) -> None:
        """Open the evidence view for *req_id*, asking for its detail as it goes."""
        state = self._state
        card = state.card(req_id) if state is not None else None
        if card is None:
            return
        self._evidence_target = req_id
        self._select(req_id)
        detail = self._details.get(req_id)
        self.evidence_view.set_evidence(card, detail)
        self._stack.setCurrentWidget(self.evidence_view)
        self.evidence_view.setFocus(Qt.FocusReason.OtherFocusReason)
        if detail is None:
            self.requirement_activated.emit(req_id)

    @traces(SWR.SWR_3310)
    def open_graph(self, req_id: str) -> None:
        """Open the neighbourhood graph around *req_id*."""
        state = self._state
        if state is None:
            return
        self._evidence_target = ""
        self.graph_view.show_graph(req_id, state, self._details.get(req_id))
        self._stack.setCurrentWidget(self.graph_view)
        self.graph_view.setFocus(Qt.FocusReason.OtherFocusReason)

    @traces(SWR.SWR_3317)
    def reveal(self, req_id: str) -> RequirementCardWidget | EpicCard | None:
        """Bring *req_id*'s card into view and answer with its widget.

        The counterpart of :attr:`card_widgets` meaning *realised* widgets
        (SWR-3317): a card nobody has scrolled to has none at all, so anything
        that needs one particular card — focusing the selection on the way back
        from a pane, opening a card by id — asks for it to exist here rather
        than assuming it already does. ``None`` when this board does not hold
        the requirement, or when the filter has hidden it.
        """
        if not req_id:
            return None
        for column in self._columns.values():
            if req_id in column.card_ids:
                column.reveal(req_id)
                return self._cards.get(req_id)
        return None

    def show_board(self) -> None:
        """Return to the board and put the focus back on the selected card."""
        self._evidence_target = ""
        self._stack.setCurrentIndex(0)
        widget = self.reveal(self._selected)
        if widget is not None and widget.isVisible():
            widget.setFocus(Qt.FocusReason.OtherFocusReason)
        else:
            self.search.setFocus(Qt.FocusReason.OtherFocusReason)

    @traces(SWR.SWR_3314, SWR.SWR_3601)
    def keyPressEvent(self, event: QKeyEvent) -> None:  # noqa: N802 — Qt's spelling
        """Escape takes back a hold, then returns to the board; Ctrl+F filters;
        Ctrl+M moves the card.

        Ctrl+M puts the focus on the first column the selected requirement can
        actually be moved to, so the keyboard path to a drop is one chord and
        then Enter (SWR-3314). It supplements the move bar rather than replacing
        it: the bar is visible whether or not anybody knows the chord.
        """
        if event.key() == Qt.Key.Key_Escape and self.hold_bar.holding:
            self.hold_bar.dismiss()
            event.accept()
            return
        if event.key() == Qt.Key.Key_Escape and self.page != "board":
            self.show_board()
            event.accept()
            return
        control = event.modifiers() & Qt.KeyboardModifier.ControlModifier
        if event.key() == Qt.Key.Key_F and control:
            self.search.setFocus(Qt.FocusReason.ShortcutFocusReason)
            event.accept()
            return
        if event.key() == Qt.Key.Key_M and control:
            self.focus_move_bar()
            event.accept()
            return
        super().keyPressEvent(event)

    @traces(SWR.SWR_3314)
    def focus_move_bar(self) -> str:
        """Aim the move control at the first reachable column and focus it.

        The first *reachable* one, not simply the first: landing a keyboard user
        on a control that will refuse is the same dead end as a drop target that
        bounces the card back without saying why (SWR-3602).
        """
        chosen = next(
            (option.target for option in self.move_options_for(self._selected) if option.reachable),
            "",
        )
        if chosen:
            self.set_move_target(chosen)
            self.move_button.setFocus(Qt.FocusReason.ShortcutFocusReason)
            return chosen
        self.move_combo.setFocus(Qt.FocusReason.ShortcutFocusReason)
        return ""


def _conforms(view: RequirementsView) -> RequirementsBoardViewLike:
    """The shipped board satisfies the whole controller contract — checked here, by mypy.

    This function is the deliverable, and it is called by nothing. The controller
    still attaches views structurally and still degrades for the ones that
    implement a subset (SWR-3315); what this adds is that the *shipped* view
    cannot drift out of the contract silently. Rename a signal or a probed method
    and this line stops type-checking, at the rename, instead of the connection
    quietly failing to be made and a test noticing later.

    It lives in this module rather than beside the Protocol because ``models/``
    must not import ``views/``, and rather than in a test because the test tree is
    not type-checked — the gate is `mypy src/rotaris_core/` and
    `mypy apps/rotaris/src/rotaris/`, so a conformance check written in a test
    would be inert.
    """
    return view
