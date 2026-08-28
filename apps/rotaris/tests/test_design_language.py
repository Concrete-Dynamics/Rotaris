"""The design system's icon vocabulary and compositional details (SWR-3708/3709).

Two claims, one per requirement. SWR-3708: every symbol the app shows is a
Phosphor glyph the application itself carries — registered offscreen, DPI-aware,
and re-inked on a theme change rather than frozen on the theme that placed it.
SWR-3709: the UI kit's counted-section pattern is one composition — kicker
uppercase, datum mono and tone-coloured — and the chrome tells place from name
by face.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from PySide6.QtWidgets import QApplication
from rotaris_core.reqtocode import SWR, verifies

from rotaris.theme import palettes, phosphor, theme_manager, tokens

if TYPE_CHECKING:
    from collections.abc import Iterator

pytestmark = pytest.mark.unit


@pytest.fixture(autouse=True)
def _restore_default_theme() -> Iterator[None]:
    """Pin the default theme around every test in this module.

    Set before as well as after: the manager is process-wide and xdist hands a
    worker tests from many files, so inheriting a leftover theme is a failure
    that moves between tests on every run.
    """
    theme_manager().set_theme(palettes.DEFAULT_THEME, persist=False)
    yield
    theme_manager().set_theme(palettes.DEFAULT_THEME, persist=False)


class _FakeScreen:
    def __init__(self, dpr: float) -> None:
        self._dpr = dpr

    def devicePixelRatio(self) -> float:  # noqa: N802
        return self._dpr


def _painted(image) -> bool:
    return any(
        image.pixelColor(x, y).alpha() > 0
        for x in range(image.width())
        for y in range(image.height())
    )


# ---------------------------------------------------------------------------
# SWR-3708 — the icon vocabulary ships with the application
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_3708)
def test_the_phosphor_families_register_without_any_host_font(qtbot) -> None:
    """Productive use: the app starts on a machine with no icon font installed
    (offscreen has *no* host families at all) and the icons still exist."""
    from rotaris.theme.fonts import register_bundled_fonts

    families = register_bundled_fonts()
    assert phosphor.FAMILY in families
    assert phosphor.FILL_FAMILY in families


@verifies(SWR.SWR_3708)
def test_every_nav_item_names_an_icon_the_vocabulary_carries(qtbot) -> None:
    """The rail's symbols are Phosphor names, not fallback characters."""
    from rotaris.views.chrome import NAV_ITEMS

    for _view_id, name, _label in NAV_ITEMS:
        assert name in phosphor.ICONS, f"nav item names unknown icon {name!r}"


@verifies(SWR.SWR_3708)
@pytest.mark.parametrize("dpr", [1.0, 1.5, 2.0])
def test_icons_rasterise_with_ink_at_every_supported_dpr(monkeypatch, qtbot, dpr: float) -> None:
    """Productive use: 125–200 % Windows scaling; the pixmap is scaled up and
    actually painted, never a blank box."""
    monkeypatch.setattr(QApplication, "primaryScreen", lambda: _FakeScreen(dpr))
    pm = phosphor.pixmap("git-branch", tokens().color.text, 24)
    assert pm.width() == round(24 * dpr)
    assert _painted(pm.toImage())


@verifies(SWR.SWR_3708)
def test_an_unknown_icon_name_raises_instead_of_rendering_a_blank(qtbot) -> None:
    with pytest.raises(KeyError):
        phosphor.icon("no-such-icon", tokens().color.text)


@verifies(SWR.SWR_3708)
def test_a_button_icon_is_reinked_when_the_theme_changes(qtbot) -> None:
    """Productive use: the user switches theme (SWR-3701) and no button keeps
    an icon painted in the palette they just left."""
    from rotaris.widgets import make_button

    button = make_button("Cancel run", "danger")
    qtbot.addWidget(button)
    phosphor.set_button_icon(button, "x-circle")
    assert not button.icon().isNull()
    assert button.iconSize().width() > 0
    size = button.iconSize()
    before = button.icon().pixmap(size).toImage()

    theme_manager().set_theme("high-contrast", persist=False)
    after = button.icon().pixmap(size).toImage()

    assert _painted(before)
    assert _painted(after)
    assert before != after, "the icon still carries the previous theme's ink"


@verifies(SWR.SWR_3708)
def test_a_button_icon_takes_its_variants_ink_not_a_default(qtbot) -> None:
    """The icon reads as part of the label: a danger button's icon is inked
    from the danger ramp, a primary button's from the accent."""
    from rotaris.widgets import make_button

    danger = make_button("Cancel", "danger")
    primary = make_button("Send", "primary")
    qtbot.addWidget(danger)
    qtbot.addWidget(primary)
    phosphor.set_button_icon(danger, "x-circle")
    phosphor.set_button_icon(primary, "x-circle")

    size = danger.iconSize()
    assert danger.icon().pixmap(size).toImage() != primary.icon().pixmap(size).toImage()


@verifies(SWR.SWR_3708)
def test_inline_icon_markup_names_the_icon_font(qtbot) -> None:
    """A label that mixes an icon into rich text names the family explicitly,
    so the glyph can never fall back to a host font's guess."""
    span = phosphor.markup("folder-simple", tokens().color.text_tertiary)
    assert phosphor.FAMILY in span
    assert phosphor.char("folder-simple") in span


# ---------------------------------------------------------------------------
# SWR-3709 — the counted-section pattern and the chrome's faces
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_3709)
def test_a_section_headers_datum_is_data_not_part_of_the_kicker(qtbot) -> None:
    """Productive use: the sidebar reads ``AGENTS · 3 live`` — the kicker
    uppercase, the count mono and untouched by the uppercasing."""
    from rotaris.widgets import SectionHeader

    header = SectionHeader("Task agents")
    qtbot.addWidget(header)
    header.set_datum("3 live", tone="live")

    assert header.label.text() == "TASK AGENTS"
    assert header.datum.text() == "3 live", "the datum is never uppercased"
    # The mono face arrives through the stylesheet's `QLabel[mono="true"]`
    # rule — the same door every other mono label uses — so the widget's part
    # is the property, and the size rides in its own stylesheet.
    assert header.datum.property("mono") == "true"
    assert f"font-size:{tokens().type.scale.x2s}px" in header.datum.styleSheet()
    assert header.separator.text() == "·"


@verifies(SWR.SWR_3709)
def test_an_empty_datum_removes_itself_and_its_separator(qtbot) -> None:
    from rotaris.widgets import SectionHeader

    header = SectionHeader("Todos")
    qtbot.addWidget(header)
    header.show()
    header.set_datum("4/7")
    assert header.datum.isVisible()
    header.set_datum("")
    assert not header.datum.isVisible()
    assert not header.separator.isVisible()


@verifies(SWR.SWR_3709)
def test_a_datum_tone_is_resolved_from_the_active_theme(qtbot) -> None:
    """The tone names a meaning; the colour is read at paint time, so a theme
    switch re-inks the datum (SWR-3706)."""
    from rotaris.widgets import SectionHeader

    header = SectionHeader("Active runs")
    qtbot.addWidget(header)
    header.set_datum("2 running", tone="live")
    assert str(tokens().color.run_text) in header.datum.styleSheet()

    theme_manager().set_theme("high-contrast", persist=False)
    assert str(tokens().color.run_text) in header.datum.styleSheet()

    with pytest.raises(KeyError):
        header.set_datum("2 running", tone="loud")


@verifies(SWR.SWR_3709)
def test_the_sidebar_kickers_carry_their_counts_as_data(qtbot) -> None:
    """Productive use: three counted sections in the workspace sidebar agree —
    the todos kicker's own text holds no digits, the counts sit beside it."""
    from rotaris.models.store import WorkspaceStore
    from rotaris.views.workspace import WorkspaceView

    store = WorkspaceStore()
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    # Shown at a real width on purpose. The sidebar coalesces its rebuilds and
    # *holds* them while its panel is off screen, paying them back on the next
    # Show (HiddenPanelReflow, SWR-2454) — and at the default size the layout
    # collapses the sidebar, so showing alone is not enough to put it on
    # screen. Asserting on a kicker the user cannot see tests nothing.
    view.resize(1600, 900)
    view.show()
    qtbot.waitExposed(view)
    assert view.sidebar_panel.isVisible()

    store.add_todo("phase-1", "Map the handler call graph")
    qtbot.waitUntil(lambda: view.todos_header.datum.text() == "0/1", timeout=5_000)

    assert view.todos_header.label.text() == "TODOS"
    assert not any(ch.isdigit() for ch in view.todos_header.label.text())
    assert view.live_label.text() == "0 live"
    assert view.live_label is view.agents_header.datum


@verifies(SWR.SWR_3709)
def test_the_title_bar_chip_tells_place_from_session_by_face(qtbot) -> None:
    """The path is data (mono), the session a name (body), a middle dot between
    them and the folder icon in front."""
    from rotaris.models.store import WorkspaceStore
    from rotaris.views.chrome import TitleBar

    store = WorkspaceStore()
    bar = TitleBar(store)
    qtbot.addWidget(bar)

    chip = bar.workspace_chip.text()
    assert phosphor.char("folder-simple") in chip
    assert phosphor.FAMILY in chip
    assert "·" in chip
    mono_family = tokens().type.mono_font(tokens().type.scale.xs).family()
    assert mono_family in chip, "the path renders in the mono face"


@verifies(SWR.SWR_3709)
def test_the_title_bar_session_status_is_one_tag_chip(qtbot) -> None:
    """The session status is its dot and its word inside one tag-styled pill,
    and the pill's variant follows the state."""
    from rotaris.models.store import WorkspaceStore
    from rotaris.views.chrome import TitleBar

    store = WorkspaceStore()
    store.set_session_status("running")
    bar = TitleBar(store)
    qtbot.addWidget(bar)

    assert bar.status_label.parent() is bar.session_chip
    assert bar.status_dot.parent() is bar.session_chip
    assert bar.status_label.text() == "session running"
    assert str(tokens().color.fill_y) in bar.session_chip.styleSheet()

    store.set_session_status("failed")
    assert str(tokens().color.fill_danger) in bar.session_chip.styleSheet()


@verifies(SWR.SWR_3709)
def test_the_status_bar_branch_fact_carries_its_icon(qtbot) -> None:
    from rotaris.models.store import WorkspaceStore
    from rotaris.views.chrome import StatusBar

    store = WorkspaceStore()
    store.branch = "rotaris/auth-refactor"
    store.ahead = 4
    bar = StatusBar(store)
    qtbot.addWidget(bar)
    bar.refresh()

    text = bar.branch_label.text()
    assert phosphor.char("git-branch") in text
    assert "rotaris/auth-refactor" in text
    assert "↑4" in text
