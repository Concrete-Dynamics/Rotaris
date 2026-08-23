"""A user changes the theme and the application follows (SWR-3700, SWR-3701).

Driven through the window a user actually sees, by the accessible name a screen
reader would announce, with nothing faked. This is the test that would have
caught every partial-repaint bug the change produced: Qt keeps theme state in
four places, and the three that are easy to remember all look right on their
own.
"""

from __future__ import annotations

import dataclasses
from typing import TYPE_CHECKING

import pytest
from PySide6.QtGui import QPalette
from PySide6.QtWidgets import QApplication, QComboBox, QWidget
from rotaris_core.reqtocode import SWR, verifies
from ui_query import find_by_accessible_name, settle

from rotaris.models import sample_store
from rotaris.theme import palettes, theme_manager, tokens
from rotaris.views.main_window import MainWindow

if TYPE_CHECKING:
    from collections.abc import Iterator

    from rotaris.theme.spec import ColorTokens

pytestmark = pytest.mark.e2e

#: The seven primary views, in nav order.
PRIMARY_VIEWS = (
    "dashboard",
    "workspace",
    "mission",
    "requirements",
    "git",
    "library",
    "settings",
)


@pytest.fixture(autouse=True)
def _restore_default_theme() -> Iterator[None]:
    """Pin the default theme around every test in this module.

    Set before as well as after. The manager is process-wide and xdist gives a
    worker tests from many files, so restoring only on the way out still lets a
    test inherit whatever the previous one left active — which is a failure that
    appears in a different test on every run and passes in isolation.
    """
    theme_manager().set_persistence(None)
    theme_manager().set_theme(palettes.DEFAULT_THEME, persist=False)
    yield
    theme_manager().set_persistence(None)
    theme_manager().set_theme(palettes.DEFAULT_THEME, persist=False)


@pytest.fixture
def window(qtbot) -> MainWindow:
    theme_manager().set_theme(palettes.DEFAULT_THEME, persist=False)
    view = MainWindow(sample_store())
    qtbot.addWidget(view)
    view.resize(1440, 900)
    settle(qtbot)
    return view


def _stylesheets(root: QWidget) -> str:
    """Every inline stylesheet in the tree, concatenated.

    Inline sheets are the ones the application stylesheet cannot reach: Qt keeps
    a widget's own resolution until it is unpolished, so this is where a stale
    theme survives if anything does.
    """
    return "\n".join(
        widget.styleSheet() for widget in (root, *root.findChildren(QWidget)) if widget.styleSheet()
    )


@verifies(SWR.SWR_3701)
def test_a_user_changes_the_theme_from_settings_and_the_window_follows(qtbot, window) -> None:
    """Productive use: a user decides the default is too dim and picks another.

    Expected outcome: the open window repaints — application stylesheet, Qt
    palette and every self-styled widget — without a relaunch.
    """
    app = QApplication.instance()
    assert isinstance(app, QApplication)

    window.show_view("settings")
    settle(qtbot)

    before_qss = app.styleSheet()
    before_window_role = app.palette().color(QPalette.ColorRole.Window).name()
    before_inline = _stylesheets(window)

    control = find_by_accessible_name(window.settings, "Theme", QComboBox)
    control.setCurrentIndex(control.findData("high-contrast"))
    settle(qtbot)

    assert tokens().name == "high-contrast"
    assert app.styleSheet() != before_qss
    assert app.palette().color(QPalette.ColorRole.Window).name() != before_window_role
    assert _stylesheets(window) != before_inline, (
        "no widget rebuilt its own stylesheet — self-styled surfaces are stale"
    )


@verifies(SWR.SWR_3700, SWR.SWR_3701)
def test_no_surface_in_any_primary_view_is_left_in_the_previous_palette(qtbot, window) -> None:
    """Productive use: a user switches theme, then walks through the whole app.

    Expected outcome: nothing anywhere is still painted in the palette they left.
    A single stubborn panel is what makes a theme switch read as broken, and it
    is invisible from the view that happened to be open at the time.
    """
    for name in PRIMARY_VIEWS:
        window.show_view(name)
        settle(qtbot)

    previous = palettes.get("rotaris-dim")
    theme_manager().set_theme("high-contrast", persist=False)
    settle(qtbot)

    # The grounds and the accent: distinctive enough that finding one in an
    # inline stylesheet means that widget never rebuilt.
    stale_tokens = {
        "bg": str(previous.color.bg),
        "surface": str(previous.color.surface),
        "chrome": str(previous.color.chrome),
        "accent": str(previous.color.accent[500]),
        "text": str(previous.color.text),
    }
    # One old hex can legitimately appear in the new palette after 8-bit sRGB
    # quantisation — `rotaris-dim`'s `surface` (oklch 25%) and High Contrast's
    # `surface_raised` both resolve to #222222 — so a probe that could be either
    # palette proves nothing. Keep only the probes that can *only* be the old
    # palette; a widget still showing one of those is stale for sure.
    new_values = _resolved_hexes(theme_manager().current.color)
    probes = {role: value for role, value in stale_tokens.items() if value not in new_values}

    survivors: dict[str, list[str]] = {}
    for widget in (window, *window.findChildren(QWidget)):
        sheet = widget.styleSheet()
        if not sheet:
            continue
        for role, value in probes.items():
            if value in sheet:
                survivors.setdefault(role, []).append(
                    f"{type(widget).__name__}#{widget.objectName() or '-'}"
                )

    assert not survivors, f"widgets still painted in the previous theme: {survivors}"


def _resolved_hexes(color: ColorTokens) -> set[str]:
    """Every hex the *color* group of a theme can paint, for probe disambiguation."""
    from rotaris.theme.color import Color
    from rotaris.theme.spec import Ramp

    hexes: set[str] = set()
    for field in dataclasses.fields(color):
        value = getattr(color, field.name)
        if isinstance(value, Color):
            hexes.add(str(value))
        elif isinstance(value, Ramp):
            hexes.update(str(step) for step in value.steps())
        elif isinstance(value, tuple):
            hexes.update(str(item) for item in value if isinstance(item, Color))
        elif isinstance(value, dict):
            hexes.update(str(item) for item in value.values() if isinstance(item, Color))
    return hexes


@verifies(SWR.SWR_3701)
def test_switching_theme_preserves_what_the_user_was_doing(qtbot, window) -> None:
    """Productive use: a user changes theme mid-session without losing their place.

    Expected outcome: an unsent prompt, the view they were on and their panel
    sizes all survive. A repaint that costs a half-written prompt is worse than
    no theme control at all.
    """
    window.show_view("workspace")
    settle(qtbot)

    from rotaris.widgets import PanelSplitter

    draft = "explain the failing verifier gate"
    window.workspace.composer.setPlainText(draft)
    splitter_sizes = [splitter.sizes() for splitter in window.findChildren(PanelSplitter)]
    assert splitter_sizes, "no resizable panels found — this test would prove nothing"

    theme_manager().set_theme("nocturne", persist=False)
    settle(qtbot)

    assert window.workspace.composer.toPlainText() == draft, "the unsent prompt was lost"
    assert window.store.ui.active_view == "workspace", "the user was moved to another view"
    assert [splitter.sizes() for splitter in window.findChildren(PanelSplitter)] == (
        splitter_sizes
    ), "panel sizes were reset"


@verifies(SWR.SWR_3701)
def test_the_choice_is_written_and_replayed_on_the_next_launch(qtbot) -> None:
    """Productive use: a user picks a theme today and Rotaris opens in it tomorrow.

    The settings root is redirected per test by the ``isolated_ui_settings``
    fixture in conftest, so this reads and writes a real ``QSettings`` without
    touching the developer's own.
    """
    from rotaris.services.theme_preference import (
        install_theme_persistence,
        read_theme_preference,
        write_theme_preference,
    )

    theme_manager().set_persistence(write_theme_preference)
    theme_manager().set_theme("high-contrast")

    assert read_theme_preference() == "high-contrast"

    # A fresh launch: restore from what was written.
    theme_manager().set_theme(palettes.DEFAULT_THEME, persist=False)
    assert install_theme_persistence() == "high-contrast"
    assert tokens().name == "high-contrast"

    theme_manager().set_persistence(None)


@verifies(SWR.SWR_3701)
def test_a_theme_that_no_longer_exists_still_opens_the_application(qtbot) -> None:
    """Productive use: a settings file written by a different Rotaris is replayed.

    Expected outcome: Rotaris opens on the default rather than refusing to start
    over a stale string.
    """
    from rotaris.services.theme_preference import install_theme_persistence, write_theme_preference

    write_theme_preference("a-theme-that-was-removed")
    theme_manager().set_persistence(None)

    assert install_theme_persistence() == palettes.DEFAULT_THEME
    assert tokens().name == palettes.DEFAULT_THEME

    theme_manager().set_persistence(None)


@verifies(SWR.SWR_3700)
def test_every_built_in_theme_can_paint_every_primary_view(qtbot, window) -> None:
    """Productive use: whichever theme a user picks, no view is broken in it.

    A token a palette forgot surfaces as a crash in whichever view reaches for
    it first, and that gets reported as "the Git view is broken on High
    Contrast" rather than as an incomplete palette.
    """
    for theme_name in palettes.names():
        theme_manager().set_theme(theme_name, persist=False)
        for view_name in PRIMARY_VIEWS:
            window.show_view(view_name)
            settle(qtbot)
        assert tokens().name == theme_name
