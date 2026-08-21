"""Switching the active theme, and making the running application follow.

Rebuilding the stylesheet is the easy half. The hard half is that a Qt
application holds theme state in four places at once, and missing any one of
them leaves part of the window painted in the palette the user just left:

1. the **application stylesheet**, which covers everything styled by selector;
2. the **`QPalette`**, which covers what Qt draws itself — a native context
   menu, a file dialog, the text cursor — and which QSS never reaches;
3. **inline stylesheets** on individual widgets, which Qt will not recompute
   until the widget is unpolished and polished again;
4. **self-painting widgets**, which hold nothing at all and simply need to be
   told to paint again.

:meth:`ThemeManager.set_theme` does all four, in that order, and only then
emits — so a subscriber that rebuilds its own presentation is not racing the
stylesheet it will be measured against.

The manager deliberately knows nothing about where a preference is stored. It
takes a callback, because a theme package that imports the app's config service
could not be tested without one, and because "what Rotaris paints itself in" and
"where Rotaris keeps settings" are not the same concern.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from PySide6.QtCore import QObject, Signal
from PySide6.QtGui import QPalette
from PySide6.QtWidgets import QApplication, QWidget
from rotaris_core.reqtocode import SWR, traces
from shiboken6 import isValid

from rotaris.theme import palettes
from rotaris.theme.qss import build_qss

if TYPE_CHECKING:
    from collections.abc import Callable

    from rotaris.theme.spec import Theme

__all__ = ["Themed", "ThemeManager", "theme_manager"]


@traces(SWR.SWR_3701)
class ThemeManager(QObject):
    """Owns which theme is active and drags the application along with it."""

    #: Emitted after the application has been fully restyled. Carries the new
    #: theme's name so a slot can branch without asking for the theme.
    theme_changed = Signal(str)

    def __init__(self, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self._theme: Theme = palettes.get(palettes.DEFAULT_THEME)
        self._persist: Callable[[str], None] | None = None

    @property
    def current(self) -> Theme:
        return self._theme

    def set_persistence(self, persist: Callable[[str], None] | None) -> None:
        """Register where a chosen theme name should be written."""
        self._persist = persist

    def available(self) -> tuple[Theme, ...]:
        return palettes.available()

    @traces(SWR.SWR_3701)
    def set_theme(self, name: str, *, persist: bool = True) -> Theme:
        """Make *name* the active theme and repaint everything.

        An unknown name resolves to the default rather than raising: the caller
        that passes one is a settings file written by a different version of
        Rotaris, and refusing to start over a stale string would be the worse
        failure.

        Selecting the theme that is already active still applies it. That makes
        the call idempotent for startup, where nothing has been applied yet and
        the "no change" shortcut would leave the window unstyled.
        """
        self._theme = palettes.get(name)
        self.apply()
        if persist and self._persist is not None:
            self._persist(self._theme.name)
        self.theme_changed.emit(self._theme.name)
        return self._theme

    def apply(self, app: QApplication | None = None) -> None:
        """Push the active theme onto the application and every live widget."""
        instance = app or QApplication.instance()
        if not isinstance(instance, QApplication):
            # Token-only tests construct no application. Nothing to paint, and
            # the active theme is already set, so this is a success not an error.
            return
        instance.setStyleSheet(build_qss(self._theme))
        instance.setPalette(build_palette(self._theme))
        for widget in instance.topLevelWidgets():
            # A window can be closing while this runs — the user dismissed a
            # dialog as the theme changed, or a test is tearing one down — and
            # Qt keeps the Python wrapper after deleting the C++ object behind
            # it. Touching one of those is a crash, not an exception, so the
            # check has to happen before the walk rather than around it.
            if isValid(widget):
                repolish(widget)

    # ── startup wiring ────────────────────────────────────────────────────
    def restore(self, name: str | None) -> Theme:
        """Apply a persisted preference at startup without writing it back."""
        return self.set_theme(name or palettes.DEFAULT_THEME, persist=False)


def repolish(root: QWidget) -> None:
    """Recompute style for *root* and everything under it.

    Qt caches the resolved style per widget. Changing the application
    stylesheet invalidates that cache for widgets styled by selector, but a
    widget carrying its own `setStyleSheet` keeps its old resolution until it is
    unpolished — so a dialog that styled itself would stay in the previous
    theme, which is exactly the sort of half-repainted window this avoids.
    """
    for widget in (root, *root.findChildren(QWidget)):
        if not isValid(widget):
            continue
        style = widget.style()
        style.unpolish(widget)
        style.polish(widget)
        # `QWidget.update(widget)`, not `widget.update()`. QAbstractItemView
        # redefines `update` to take a QModelIndex, so the zero-argument form
        # raises TypeError on any list, tree or table — and this walk reaches
        # every widget in the window, so a single one of them turns a theme
        # switch into a crash. The unbound call names the overload we mean.
        QWidget.update(widget)


def build_palette(theme: Theme) -> QPalette:
    """The `QPalette` for *theme*.

    Qt paints a handful of things from the palette regardless of the
    stylesheet — native menus, dialog chrome, the caret, disabled text. Without
    this, those arrive in the platform default, which on a dark theme means
    white boxes.
    """
    color = theme.color
    palette = QPalette()
    role = QPalette.ColorRole
    group = QPalette.ColorGroup

    palette.setColor(role.Window, color.bg.qcolor)
    palette.setColor(role.WindowText, color.text.qcolor)
    palette.setColor(role.Base, color.bg.qcolor)
    palette.setColor(role.AlternateBase, color.surface.qcolor)
    palette.setColor(role.Text, color.text.qcolor)
    palette.setColor(role.PlaceholderText, color.text_tertiary.qcolor)
    palette.setColor(role.Button, color.surface_raised.qcolor)
    palette.setColor(role.ButtonText, color.text.qcolor)
    palette.setColor(role.BrightText, color.danger[300].qcolor)
    palette.setColor(role.ToolTipBase, color.surface_raised.qcolor)
    palette.setColor(role.ToolTipText, color.text.qcolor)
    palette.setColor(role.Highlight, color.accent[700].qcolor)
    palette.setColor(role.HighlightedText, color.accent[100].qcolor)
    palette.setColor(role.Link, color.accent[300].qcolor)
    palette.setColor(role.LinkVisited, color.accent[400].qcolor)

    for disabled_role in (role.Text, role.WindowText, role.ButtonText):
        palette.setColor(group.Disabled, disabled_role, color.text_disabled.qcolor)
    palette.setColor(group.Disabled, role.Base, color.disabled_surface.qcolor)
    palette.setColor(group.Disabled, role.Button, color.disabled_surface.qcolor)
    return palette


_MANAGER: ThemeManager | None = None


def theme_manager() -> ThemeManager:
    """The process-wide manager. Created on first use."""
    global _MANAGER  # noqa: PLW0603
    if _MANAGER is None:
        _MANAGER = ThemeManager()
    return _MANAGER


class Themed:
    """Mixin for a widget whose presentation has to be rebuilt on a theme change.

    A widget styled entirely by the application stylesheet needs none of this —
    :func:`repolish` already reaches it. This is for the ones that hold
    presentation themselves: an inline stylesheet built from tokens, a `QFont`
    with tracking on it, a colour captured for `paintEvent`.

    Subclass alongside the Qt base and call :meth:`install_theme_hook` on the
    last line of `__init__`::

        class Tag(Themed, QLabel):
            def __init__(self, text: str) -> None:
                super().__init__(text)
                self.install_theme_hook()

            def apply_theme(self, theme: Theme) -> None:
                self.setStyleSheet(f"color: {theme.color.text};")

    Qt drops the connection when the widget is destroyed, so nothing has to
    unsubscribe.

    Two rules, both of which this class was originally missing and both of which
    cost a debugging session to find:

    **Never list `Themed` again on a base that already has it.** ``Card`` is
    ``Themed``, so ``class KpiCard(Themed, Card)`` is a `TypeError` at import —
    Python cannot order an MRO that needs `Themed` both before and after `Card`.
    Write ``class KpiCard(Card)``; the behaviour is inherited.

    **An `apply_theme` override runs before your `__init__` finishes.** A base
    class calls `install_theme_hook`, and that call dispatches to *your*
    override while your own children do not exist yet. Guard the parts that
    depend on them and always chain::

        def apply_theme(self, theme: Theme) -> None:
            super().apply_theme(theme)
            if (label := getattr(self, "warning_label", None)) is not None:
                label.setStyleSheet(f"color: {theme.color.wait_text};")

    Calling the hook again from the subclass's own `__init__` is safe and is
    the normal way to get a complete first paint: the connection is made once
    and the styling is simply re-applied.
    """

    #: Whether this instance's slot is already connected. A base class and its
    #: subclass both calling the hook is the expected pattern, not a mistake, so
    #: connecting twice — and thus restyling twice on every future switch — has
    #: to be prevented here rather than by remembering not to.
    _theme_hook_installed: bool = False

    def install_theme_hook(self) -> None:
        """Connect to theme changes and apply the current theme now.

        Idempotent. Safe to call from a base constructor and again from the
        subclass's, which is what lets a partially-built widget be styled early
        and completely styled once it is finished.
        """
        if not self._theme_hook_installed:
            theme_manager().theme_changed.connect(self._theme_changed)
            self._theme_hook_installed = True
        self.apply_theme(theme_manager().current)

    def _theme_changed(self, _name: str) -> None:
        self.apply_theme(theme_manager().current)
        if isinstance(self, QWidget):
            # Unbound, for the same reason as in `repolish`: an item view's
            # `update` takes an index.
            QWidget.update(self)

    def apply_theme(self, theme: Theme) -> None:
        """Rebuild whatever this widget holds. Overridden by every user.

        The base implementation does nothing rather than raising, so a subclass
        can always `super().apply_theme(theme)` without knowing whether an
        ancestor implements it.
        """
