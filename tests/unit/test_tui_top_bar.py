"""The focused-agent badge survives a refresh that arrives before it exists.

`RotarisTuiApp` drives its live animation from a timer, so a widget refresh is
scheduled by the clock and not by the mount. That puts one window on every
screen build in which `TopBar` is already in the DOM and the three `Static`
children `compose` yields are not — and a `NoMatches` raised there does not
degrade into a missed repaint, it propagates out of the timer callback and takes
the application down. SWR-1250 forbids exactly that.
"""

from __future__ import annotations

import pytest
from textual.widgets import Static

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tui.view_model import FocusedAgentBadge
from rotaris_core.tui.widgets.top_bar import TopBar

pytestmark = pytest.mark.unit


def _composed(top_bar: TopBar) -> Static:
    """The badge `Static` that `compose` yields, without mounting anything."""
    focus = [
        widget
        for widget in top_bar.compose()
        if isinstance(widget, Static) and widget.id == "top-bar-focus"
    ]
    assert len(focus) == 1, "compose must yield exactly one badge"
    return focus[0]


@verifies(SWR.SWR_1250)
def test_a_refresh_before_the_badge_is_composed_does_not_raise() -> None:
    """Productive use: someone opens Rotaris and the live-animation tick lands in the
    moment between the top bar entering the screen and its children appearing.
    Expected outcome: the tick is absorbed, no UI exception reaches the timer that
    would end the session, and the badge still knows what it was asked to show."""
    top_bar = TopBar()

    top_bar.update_focus_badge(FocusedAgentBadge(label="planner", state="running"))

    assert top_bar.focus_badge_text == "planner"
    assert top_bar.focus_badge_state == "running"


@verifies(SWR.SWR_1250)
def test_the_badge_that_arrived_early_is_shown_once_the_children_appear() -> None:
    """Productive use: the same early tick carries a real agent, and the user must end
    up looking at that agent rather than at the placeholder.
    Expected outcome: the `Static` the top bar composes carries the early badge's text
    and its state class, so the update is deferred rather than dropped."""
    top_bar = TopBar()

    top_bar.update_focus_badge(FocusedAgentBadge(label="planner", state="failed"))
    focus = _composed(top_bar)

    assert "planner" in str(focus.render())
    assert focus.has_class("-failed")


@verifies(SWR.SWR_1250)
def test_an_empty_focus_composes_the_neutral_placeholder() -> None:
    """Productive use: nothing is selected yet, which is what every session starts as.
    Expected outcome: the composed badge reads the neutral placeholder in the neutral
    state, so an untouched top bar and one reset to empty look the same."""
    top_bar = TopBar()

    top_bar.update_focus_badge(None)
    focus = _composed(top_bar)

    assert str(focus.render()) == "No agent selected"
    assert focus.has_class("-none")
