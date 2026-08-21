"""Choosing a theme in Settings (SWR-3701).

The unit half: the control offers what the registry holds, marks what is
running, and says enough about each option that a user is choosing an
appearance rather than a word.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from PySide6.QtWidgets import QComboBox
from rotaris_core.reqtocode import SWR, verifies
from ui_query import find_by_accessible_name

from rotaris.models import WorkspaceStore
from rotaris.theme import palettes, theme_manager, tokens
from rotaris.views.settings import SettingsView

if TYPE_CHECKING:
    from collections.abc import Iterator

pytestmark = pytest.mark.unit


@pytest.fixture(autouse=True)
def _restore_default_theme() -> Iterator[None]:
    """Pin the default theme around every test in this module.

    Set before as well as after. The manager is process-wide and xdist gives a
    worker tests from many files, so restoring only on the way out still lets a
    test inherit whatever the previous one left active — which is a failure that
    appears in a different test on every run and passes in isolation.
    """
    theme_manager().set_theme(palettes.DEFAULT_THEME, persist=False)
    yield
    theme_manager().set_theme(palettes.DEFAULT_THEME, persist=False)


def _settings(qtbot) -> SettingsView:
    view = SettingsView(WorkspaceStore())
    qtbot.addWidget(view)
    return view


@verifies(SWR.SWR_3701)
def test_the_control_offers_every_built_in_theme_by_its_label(qtbot) -> None:
    view = _settings(qtbot)
    combo = view.theme_select

    offered = {combo.itemData(index): combo.itemText(index) for index in range(combo.count())}

    assert set(offered) == set(palettes.names())
    for theme in palettes.available():
        assert offered[theme.name] == theme.label


@verifies(SWR.SWR_3701)
def test_the_running_theme_is_the_one_shown(qtbot) -> None:
    theme_manager().set_theme("nocturne", persist=False)
    view = _settings(qtbot)

    assert view.theme_select.currentData() == "nocturne"
    assert view.theme_hint.text() == tokens().description


@verifies(SWR.SWR_3701)
def test_each_option_says_what_it_is_rather_than_only_naming_itself(qtbot) -> None:
    """Productive use: a user opens Settings wondering which theme suits them.

    "High contrast" is a name. What it does — pushes the ground and text well
    past the AA floor — is the thing that lets someone choose.
    """
    view = _settings(qtbot)

    for index in range(view.theme_select.count()):
        view.theme_select.setCurrentIndex(index)
        assert view.theme_hint.text() == palettes.get(view.theme_select.itemData(index)).description


@verifies(SWR.SWR_3701)
def test_choosing_a_theme_applies_it(qtbot) -> None:
    view = _settings(qtbot)
    combo = view.theme_select

    combo.setCurrentIndex(combo.findData("high-contrast"))

    assert tokens().name == "high-contrast"
    assert theme_manager().current.name == "high-contrast"


@verifies(SWR.SWR_3701)
def test_the_control_is_reachable_by_the_name_a_screen_reader_announces(qtbot) -> None:
    """The suite drives controls by accessible name, so an unnamed one is untestable
    as well as unannounceable."""
    view = _settings(qtbot)

    control = find_by_accessible_name(view, "Theme", QComboBox)

    assert control is view.theme_select
    assert control.accessibleDescription()


@verifies(SWR.SWR_3701)
def test_the_active_theme_is_conveyed_without_relying_on_colour(qtbot) -> None:
    """A combo box showing the theme's label is text, which is the point.

    The rule in AGENTS.md is that meaning is never encoded in colour alone —
    and "which theme am I on" is the one setting where a purely visual answer
    would be especially easy to reach for.
    """
    theme_manager().set_theme("nocturne", persist=False)
    view = _settings(qtbot)

    assert view.theme_select.currentText() == palettes.get("nocturne").label
