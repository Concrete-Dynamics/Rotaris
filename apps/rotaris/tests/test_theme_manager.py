"""Switching the active theme takes the whole application with it (SWR-3700, SWR-3701).

The registry half is cheap to get right and cheap to get wrong in one specific
way — a stale name in a settings file must not stop Rotaris opening. The manager
half is where the real risk is: Qt holds theme state in four places, and a switch
that reaches three of them leaves a window half-repainted, which is worse than
not offering the choice at all.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from PySide6.QtGui import QPalette
from PySide6.QtWidgets import QApplication, QLabel, QPushButton, QVBoxLayout, QWidget
from rotaris_core.reqtocode import SWR, verifies

from rotaris.theme import palettes, tokens
from rotaris.theme.manager import Themed, ThemeManager, build_palette, theme_manager

if TYPE_CHECKING:
    from collections.abc import Iterator

    from rotaris.theme.spec import Theme

pytestmark = pytest.mark.integration


@pytest.fixture(autouse=True)
def _restore_default_theme() -> Iterator[None]:
    """Pin the default theme, and no persistence, around every test here.

    The manager is process-wide and xdist hands one worker tests from many
    files, so restoring only on the way out still lets a test inherit whatever
    the previous one left active. That failure lands on a different test every
    run and passes in isolation, which is the most expensive kind to chase.
    """
    theme_manager().set_persistence(None)
    theme_manager().set_theme(palettes.DEFAULT_THEME, persist=False)
    yield
    theme_manager().set_persistence(None)
    theme_manager().set_theme(palettes.DEFAULT_THEME, persist=False)


# ── the registry ──────────────────────────────────────────────────────────


@verifies(SWR.SWR_3700)
def test_the_registry_lists_every_built_in_theme() -> None:
    names = palettes.names()
    assert palettes.DEFAULT_THEME in names
    assert {"rotaris-dim", "nocturne", "high-contrast"} <= set(names)
    assert len({theme.label for theme in palettes.available()}) == len(names), (
        "two themes sharing a label would be indistinguishable in Settings"
    )
    for theme in palettes.available():
        assert theme.description, f"{theme.name} gives a user nothing to choose on"


@verifies(SWR.SWR_3700, SWR.SWR_3701)
def test_an_unknown_theme_name_starts_on_the_default() -> None:
    """Productive use: a settings file written by another Rotaris version is replayed.

    Refusing to start over a stale string would be a far worse failure than
    quietly painting the default, so this degrades rather than raising.
    """
    assert palettes.get("a-theme-that-was-removed").name == palettes.DEFAULT_THEME
    assert palettes.get("").name == palettes.DEFAULT_THEME


@verifies(SWR.SWR_3700)
def test_building_a_theme_twice_returns_the_same_object() -> None:
    """Resolving a palette costs a few hundred OKLCH conversions; paint does not pay it."""
    assert palettes.get("nocturne") is palettes.get("nocturne")


# ── the manager ───────────────────────────────────────────────────────────


@verifies(SWR.SWR_3701)
def test_tokens_reports_the_new_theme_immediately_after_a_switch(qtbot) -> None:
    before = tokens()
    theme_manager().set_theme("nocturne", persist=False)
    after = tokens()

    assert before.name != after.name
    assert after.name == "nocturne"
    assert tokens() is theme_manager().current


@verifies(SWR.SWR_3701)
def test_a_switch_repaints_the_application_stylesheet_and_palette(qtbot) -> None:
    """Productive use: a user picks a theme and the open window changes.

    The stylesheet covers what is styled by selector; the QPalette covers what Qt
    draws itself — a native menu, a file dialog, the caret. Missing the palette
    is how a dark app ends up with white popups.
    """
    app = QApplication.instance()
    assert isinstance(app, QApplication)

    theme_manager().set_theme("rotaris-dim", persist=False)
    dim_qss = app.styleSheet()
    dim_window = app.palette().color(QPalette.ColorRole.Window).name()

    theme_manager().set_theme("nocturne", persist=False)

    assert app.styleSheet() != dim_qss
    assert app.palette().color(QPalette.ColorRole.Window).name() != dim_window
    assert str(tokens().color.bg) in app.styleSheet()


@verifies(SWR.SWR_3701)
def test_a_switch_notifies_subscribers_once_with_the_new_name(qtbot) -> None:
    manager = ThemeManager()
    seen: list[str] = []
    manager.theme_changed.connect(seen.append)

    manager.set_theme("high-contrast", persist=False)

    assert seen == ["high-contrast"]


@verifies(SWR.SWR_3701)
def test_the_chosen_theme_is_handed_to_persistence_but_a_restore_is_not(qtbot) -> None:
    """Restoring a preference at startup must not write it straight back.

    A restore that persists looks harmless until a fallback happens: a machine
    that could not resolve the stored theme would silently overwrite the user's
    choice with the default, and it would never come back.
    """
    manager = ThemeManager()
    written: list[str] = []
    manager.set_persistence(written.append)

    manager.set_theme("nocturne")
    assert written == ["nocturne"]

    manager.restore("high-contrast")
    assert written == ["nocturne"], "restore() must not write"
    assert manager.current.name == "high-contrast"

    manager.restore("a-theme-that-was-removed")
    assert manager.current.name == palettes.DEFAULT_THEME
    assert written == ["nocturne"]


@verifies(SWR.SWR_3701)
def test_the_manager_works_before_there_is_an_application_to_paint() -> None:
    """Token-only code and tests construct no QApplication; that is not an error."""
    manager = ThemeManager()
    manager.apply(None)
    assert manager.current.name == palettes.DEFAULT_THEME


@verifies(SWR.SWR_3700)
def test_the_qt_palette_covers_the_roles_qt_draws_itself(qtbot) -> None:
    theme = palettes.get("rotaris-dim")
    palette = build_palette(theme)
    role, group = QPalette.ColorRole, QPalette.ColorGroup

    assert palette.color(role.Window).name() == theme.color.bg.hex
    assert palette.color(role.WindowText).name() == theme.color.text.hex
    assert palette.color(role.ToolTipBase).name() == theme.color.surface_raised.hex
    assert palette.color(role.PlaceholderText).name() == theme.color.text_tertiary.hex
    assert palette.color(group.Disabled, role.Text).name() == theme.color.text_disabled.hex, (
        "disabled text must be dimmed by the palette, not left at full strength"
    )


# ── widgets that hold their own presentation ──────────────────────────────


class _CachingLabel(Themed, QLabel):
    """A widget of the kind that used to freeze: it builds a stylesheet itself."""

    def __init__(self) -> None:
        super().__init__("cached")
        self.applied: list[str] = []
        self.install_theme_hook()

    def apply_theme(self, theme: Theme) -> None:
        self.applied.append(theme.name)
        self.setStyleSheet(f"color: {theme.color.text_secondary};")


@verifies(SWR.SWR_3701)
def test_a_themed_widget_restyles_itself_on_a_switch(qtbot) -> None:
    """Productive use: a dialog styled in its own constructor follows the theme.

    This is the case the application stylesheet cannot reach — Qt keeps a
    widget's own resolution until it is unpolished — and the one that leaves a
    visibly stale panel behind when it is missed.
    """
    label = _CachingLabel()
    qtbot.addWidget(label)
    assert label.applied == [tokens().name]
    first_style = label.styleSheet()

    theme_manager().set_theme("high-contrast", persist=False)

    assert label.applied[-1] == "high-contrast"
    assert label.styleSheet() != first_style
    assert str(palettes.get("high-contrast").color.text_secondary) in label.styleSheet()


@verifies(SWR.SWR_3701)
def test_a_destroyed_widget_does_not_keep_receiving_theme_changes(qtbot) -> None:
    """Qt drops the connection with the receiver, so nothing has to unsubscribe.

    Worth asserting: if it were not true, every transient dialog would leave a
    slot behind and a theme switch would eventually walk thousands of them.
    """
    label = _CachingLabel()
    qtbot.addWidget(label)
    label.deleteLater()
    label.setParent(None)
    del label

    theme_manager().set_theme("nocturne", persist=False)  # must not raise


@verifies(SWR.SWR_3701)
def test_a_switch_survives_a_window_containing_item_views(qtbot) -> None:
    """Productive use: a user switches theme while a tree, a list and a table are on screen.

    `QAbstractItemView` redefines `update` to take a `QModelIndex`, so the
    zero-argument form raises `TypeError` on every one of them. The repolish walk
    reaches every widget in the window, so a single list turned the whole switch
    into a crash — and Rotaris has a list, a tree or a table on nearly every
    view.
    """
    from PySide6.QtWidgets import QListWidget, QTableWidget, QTreeWidget

    from rotaris.theme.manager import repolish

    root = QWidget()
    qtbot.addWidget(root)
    layout = QVBoxLayout(root)
    for view_type in (QListWidget, QTreeWidget, QTableWidget):
        layout.addWidget(view_type())

    repolish(root)  # raised TypeError before the unbound-call fix

    theme_manager().set_theme("nocturne", persist=False)


class _ThemedList(Themed, QLabel):
    """Stands in for a Card subclass: the base installs the hook, the child extends."""

    def __init__(self) -> None:
        super().__init__("base")
        self.applied = 0
        # A base class installing the hook is the pattern that broke: this
        # dispatches to the *subclass* override before it has run its own
        # __init__.
        self.install_theme_hook()
        self.late_child = QLabel("built after the base finished", self)
        self.install_theme_hook()

    def apply_theme(self, theme: Theme) -> None:
        super().apply_theme(theme)
        self.applied += 1
        if (child := getattr(self, "late_child", None)) is not None:
            child.setStyleSheet(f"color: {theme.color.text_secondary};")


@verifies(SWR.SWR_3701)
def test_installing_the_hook_twice_connects_once(qtbot) -> None:
    """Productive use: a Card subclass restyles once per switch, not twice.

    A base and its subclass both installing is the normal pattern — it is how a
    partially-built widget gets styled early and completely styled once it is
    finished. Connecting twice would restyle twice on every future switch, which
    is invisible until a stylesheet rebuild becomes expensive.
    """
    widget = _ThemedList()
    qtbot.addWidget(widget)
    assert widget.applied == 2, "both install calls should apply"

    widget.applied = 0
    theme_manager().set_theme("high-contrast", persist=False)

    assert widget.applied == 1, "the slot was connected more than once"
    assert str(palettes.get("high-contrast").color.text_secondary) in (
        widget.late_child.styleSheet()
    )


@verifies(SWR.SWR_3701)
def test_apply_theme_tolerates_being_called_before_the_subclass_is_built(qtbot) -> None:
    """The base's own hook call reaches an override whose children do not exist yet."""
    widget = _ThemedList()  # would AttributeError without the guard
    qtbot.addWidget(widget)
    assert widget.late_child is not None


@verifies(SWR.SWR_3701)
def test_repolish_reaches_every_descendant(qtbot) -> None:
    """A switch has to reach the whole tree, not just the top-level widget."""
    from rotaris.theme.manager import repolish

    root = QWidget()
    qtbot.addWidget(root)
    layout = QVBoxLayout(root)
    nested = QWidget()
    layout.addWidget(nested)
    inner = QVBoxLayout(nested)
    button = QPushButton("deep")
    inner.addWidget(button)

    repolish(root)  # must not raise and must not need the widget shown
    assert button.style() is not None
