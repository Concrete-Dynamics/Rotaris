"""The board's kanban vocabulary, pinned to the engine's (SWR-3311).

The delivery states are the engine's closed set (SWR-3201). The desktop restates
them in several places — the columns and their empty-state sentences, the move
tables that decide which drag is which action, the theme's accents — because the
order and the copy are deliberate UI decisions rather than anything derivable.
That is fine and stays; what was missing is anything asserting the spellings
still agree, so adding a state or renaming a token could leave one table behind
and the board would simply stop rendering it.

Rule for everything here: **pin the agreement between copies, never the content
of one copy.** The empty-column sentences are UI copy and stay free to change;
only their key set is pinned. A test that asserted the wording would be a test
that punished editing it.

None of these found a bug when they were written — they are regression guards,
and the honest reason to have them is that the next person to add a delivery
state should be told by a test rather than by a blank column.
"""

from __future__ import annotations

import ast
import inspect

import pytest
from PySide6.QtCore import Signal
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery.state import DeliveryState

from rotaris import theme
from rotaris.services.requirements_actions import _MOVES, _TARGETS
from rotaris.theme import semantics
from rotaris.views.requirements import BLOCKED_COLUMN, COLUMN_HINTS, COLUMN_ORDER

pytestmark = pytest.mark.unit


def _delivery_table() -> frozenset[str]:
    """The states :func:`rotaris.theme.semantics.delivery_color` has a row for.

    Read out of the mapping literal, which is the only way behind the fallback:
    the function answers Backlog's accent for anything it does not know, so a
    state nobody had coloured would look coloured from the outside and the
    missing row — the whole failure this test exists for — would be invisible.
    The table was a module constant until SWR-3706 moved it inside the function
    that owns it; reading the source is what replaces naming the constant.
    """
    tree = ast.parse(inspect.getsource(semantics.delivery_color))
    mappings = [node for node in ast.walk(tree) if isinstance(node, ast.Dict)]
    assert len(mappings) == 1, "delivery_color no longer holds exactly one mapping to read"
    return frozenset(
        key.value
        for key in mappings[0].keys
        if isinstance(key, ast.Constant) and isinstance(key.value, str)
    )


@verifies(SWR.SWR_3302, SWR.SWR_3201)
def test_the_columns_are_the_engines_delivery_states_minus_the_pinned_one() -> None:
    """Productive use: someone adds a delivery state to the engine.
    Expected outcome: this fails, rather than the board quietly never showing it.

    `Blocked` is deliberately absent from the ordered columns and pinned separately
    (SWR-3303) — it is a column, but not one in the flow's order.

    When SWR-3118 lands (a source reports its own delivery state), extend this
    family: the *external* vocabulary must never leak into column membership, or
    the board starts rendering a column for a state Rotaris does not own.
    """
    flowing = tuple(state.value for state in DeliveryState if state is not DeliveryState.BLOCKED)

    assert flowing == COLUMN_ORDER, "the columns and the enum disagree, or their order does"
    assert DeliveryState.BLOCKED.value == BLOCKED_COLUMN


@verifies(SWR.SWR_3302)
def test_every_column_says_what_belongs_in_it_when_it_is_empty() -> None:
    """Productive use: a project opens the board and six of seven columns are empty.
    Expected outcome: each one says what would be there, because a blank column
    tells a user nothing and "no requirements" is not the same fact as "nothing has
    reached this stage".

    Only the *coverage* is asserted. The sentences themselves are copy.
    """
    assert set(COLUMN_HINTS) == {*COLUMN_ORDER, BLOCKED_COLUMN}
    assert all(COLUMN_HINTS[key].strip() for key in COLUMN_HINTS), "a hint is blank"


@verifies(SWR.SWR_3601, SWR.SWR_3201)
def test_every_move_the_board_offers_names_a_state_the_engine_has() -> None:
    """Productive use: a user drags a card between two columns.
    Expected outcome: both ends of that drag are real delivery states, so the action
    the board derives is one the engine can actually perform.

    `DeliveryState(value)` raises on an unknown token, which is the assertion.
    """
    for action, target in _TARGETS.items():
        assert DeliveryState(target), f"{action} targets {target!r}, which is not a state"
    for source, target in _MOVES:
        assert DeliveryState(source) and DeliveryState(target)


@verifies(SWR.SWR_3601)
def test_a_drag_and_the_action_it_becomes_agree_on_where_the_card_lands() -> None:
    """Productive use: a user drops a card on `Ready` and the board performs `Release`.
    Expected outcome: `Release` puts it in `Ready`. The drag table and the action
    table are written separately, and nothing else notices when they disagree — a
    drop that lands somewhere other than where it was dropped is the bug this
    catches.

    `RELEASE` is reachable from two columns; the assertion is on the mapping, not
    on the pair being unique.
    """
    for (source, target), action in _MOVES.items():
        if action in _TARGETS:
            assert _TARGETS[action] == target, (
                f"dropping {source} → {target} performs {action}, which lands in {_TARGETS[action]}"
            )


@verifies(SWR.SWR_3314, SWR.SWR_3201)
def test_every_delivery_state_has_a_colour_of_its_own() -> None:
    """Productive use: a state is added and the board paints its column and badges.
    Expected outcome: it has its own accent rather than silently borrowing Backlog's.

    Membership is asserted against the table rather than through
    `theme.delivery_color`, which resolves an unknown state to Backlog's accent
    (see :func:`_delivery_table`). The accents themselves come from the function,
    because that is the value the board paints: the table names a token, and two
    different tokens resolving to one colour is the same defect as one row.
    """
    coloured = _delivery_table()
    states = {state.value for state in DeliveryState}

    assert states <= coloured, f"no colour for {sorted(states - coloured)}"
    assert coloured <= states, f"a colour for {sorted(coloured - states)}, which is not a state"
    # Distinct, or the board encodes two states as one thing to look at.
    accents = [theme.delivery_color(state) for state in states]
    assert len(set(accents)) == len(accents), "two delivery states share an accent"


@verifies(SWR.SWR_3311)
def test_the_board_sorts_requirement_ids_with_the_engines_own_key() -> None:
    """Productive use: the board orders a column, and a report orders the same ids.
    Expected outcome: one order, because there is one implementation.

    The board used to carry its own natural-sort key. It agreed with the engine's
    over 534 generated ids and differed only where a character's casefold expands
    (`ß` → `ss`) — but "agrees today" is not the property worth having, and a test
    asserting two copies match can only fail after the divergence exists. The copy
    is gone; this pins that it stays gone.
    """
    from rotaris_core.requirements.model import requirement_sort_key as engine_key

    from rotaris.views import requirements as board

    assert board.requirement_sort_key is engine_key, "the board grew its own sort key again"
    assert sorted(["SWR-100", "SWR-9", "SWR-10"], key=board.requirement_sort_key) == [
        "SWR-9",
        "SWR-10",
        "SWR-100",
    ]


@verifies(SWR.SWR_3315)
def test_the_controller_and_the_board_agree_on_every_name_in_the_contract() -> None:
    """Productive use: someone renames a signal on the board, or a slot on the controller.
    Expected outcome: named here, at the class level.

    A sibling to `_conforms` in `views/requirements.py`, which makes mypy check the
    same contract, and to the per-instance wiring test, which asserts what actually
    got connected. This one pins the *tables*: a row naming a signal the view does
    not declare, or a slot the controller does not have, connects nothing and would
    otherwise be found only by whatever feature stopped working.
    """
    from rotaris.services.requirements_controller import RequirementsController
    from rotaris.views.requirements import RequirementsView

    rows = (*RequirementsController.VIEW_SIGNALS, *RequirementsController.ACTION_SIGNALS)
    assert rows, "the contract cannot be empty"

    missing_signals = [name for name, _ in rows if not hasattr(RequirementsView, name)]
    assert missing_signals == [], (
        f"the tables name signals the board does not declare: {missing_signals}"
    )

    missing_slots = [
        slot for _, slot in rows if not callable(getattr(RequirementsController, slot, None))
    ]
    assert missing_slots == [], (
        f"the tables name slots the controller does not have: {missing_slots}"
    )

    # Every declared signal is wired, or it is surface nothing reaches.
    declared = {
        name for name in vars(RequirementsView) if isinstance(vars(RequirementsView)[name], Signal)
    }
    assert declared == {name for name, _ in rows}, (
        "the board declares a signal no table connects, or the reverse: "
        f"{declared ^ {name for name, _ in rows}}"
    )
