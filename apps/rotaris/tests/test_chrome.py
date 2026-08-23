"""Unit tests for chrome.py — NavRail icons and DPI-aware glyph rendering."""

from __future__ import annotations

import pytest
from PySide6.QtCore import QSize, Qt
from PySide6.QtGui import QIcon
from PySide6.QtWidgets import QApplication
from rotaris_core.reqtocode import SWR, verifies

pytestmark = pytest.mark.unit


class _FakeScreen:
    """Mock screen with a configurable devicePixelRatio."""

    def __init__(self, dpr: float) -> None:
        self._dpr = dpr

    def devicePixelRatio(self) -> float:  # noqa: N802
        return self._dpr


def _patch_primary_screen(monkeypatch, dpr: float) -> None:
    """Replace QApplication.primaryScreen with a fake at the given DPR."""
    monkeypatch.setattr(QApplication, "primaryScreen", lambda: _FakeScreen(dpr))


# ---------------------------------------------------------------------------
# _glyph_icon — DPI-aware rasterisation
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_2092)
def test_glyph_icon_returns_qicon(qtbot) -> None:
    """_glyph_icon returns a non-null QIcon."""
    from rotaris.views.chrome import _glyph_icon

    result = _glyph_icon("\u25ce")
    assert isinstance(result, QIcon)
    assert not result.isNull()


@verifies(SWR.SWR_2092)
def test_glyph_icon_stored_size_at_1x_dpr(monkeypatch, qtbot) -> None:
    """At DPR=1.0, the stored pixmap is 24×24 physical (matches logical)."""
    from rotaris.views.chrome import _glyph_icon

    _patch_primary_screen(monkeypatch, 1.0)
    icon = _glyph_icon("\u25ce", size=24)

    sizes = icon.availableSizes(QIcon.Mode.Normal, QIcon.State.Off)
    assert len(sizes) == 1
    assert sizes[0] == QSize(24, 24)


@verifies(SWR.SWR_2092)
def test_glyph_icon_stored_size_at_1_5x_dpr(monkeypatch, qtbot) -> None:
    """At DPR=1.5, the stored pixmap is 36×36 physical (24 × 1.5)."""
    from rotaris.views.chrome import _glyph_icon

    _patch_primary_screen(monkeypatch, 1.5)
    icon = _glyph_icon("\u25ce", size=24)

    sizes = icon.availableSizes(QIcon.Mode.Normal, QIcon.State.Off)
    assert len(sizes) == 1
    assert sizes[0] == QSize(36, 36)


@verifies(SWR.SWR_2092)
def test_glyph_icon_stored_size_at_2x_dpr(monkeypatch, qtbot) -> None:
    """At DPR=2.0, the stored pixmap is 48×48 physical (24 × 2)."""
    from rotaris.views.chrome import _glyph_icon

    _patch_primary_screen(monkeypatch, 2.0)
    icon = _glyph_icon("\u2699", size=24)

    sizes = icon.availableSizes(QIcon.Mode.Normal, QIcon.State.Off)
    assert len(sizes) == 1
    assert sizes[0] == QSize(48, 48)


@verifies(SWR.SWR_2092)
def test_glyph_icon_pixmap_not_null(monkeypatch, qtbot) -> None:
    """The rendered pixmap contains image data — not blank."""
    from rotaris.views.chrome import _glyph_icon

    _patch_primary_screen(monkeypatch, 2.0)
    icon = _glyph_icon("\u22d4")
    pm = icon.pixmap(24, 24)
    assert not pm.isNull()
    img = pm.toImage()
    assert not img.isNull()


@verifies(SWR.SWR_2092)
def test_glyph_icon_thin_and_dense_glyphs_both_fill_pixmap(
    monkeypatch,
    qtbot,
) -> None:
    """Thin glyphs (⋔, pitchfork) and dense glyphs (◎, bullseye) both
    produce non-empty pixmaps — per-glyph painter scaling prevents
    font-fallback from making some glyphs invisible or tiny."""
    from rotaris.views.chrome import _glyph_icon

    _patch_primary_screen(monkeypatch, 1.0)
    # Thin glyph
    icon_thin = _glyph_icon("\u22d4")  # ⋔ pitchfork
    pm_thin = icon_thin.pixmap(24, 24)
    assert not pm_thin.isNull()
    img_thin = pm_thin.toImage()
    assert not img_thin.isNull()

    # Dense glyph
    icon_dense = _glyph_icon("\u25ce")  # ◎ bullseye
    pm_dense = icon_dense.pixmap(24, 24)
    assert not pm_dense.isNull()
    img_dense = pm_dense.toImage()
    assert not img_dense.isNull()

    # Both have painted pixels (not just transparent background)
    has_paint_thin = False
    has_paint_dense = False
    for y in range(img_thin.height()):
        for x in range(img_thin.width()):
            if img_thin.pixelColor(x, y).alpha() > 0:
                has_paint_thin = True
            if img_dense.pixelColor(x, y).alpha() > 0:
                has_paint_dense = True
    assert has_paint_thin, "thin glyph (⋔) has no painted pixels"
    assert has_paint_dense, "dense glyph (◎) has no painted pixels"


@verifies(SWR.SWR_2092)
def test_glyph_icon_all_nav_glyphs_render(monkeypatch, qtbot) -> None:
    """Every glyph in NAV_ITEMS renders without error at 1×, 1.5×, 2×."""
    from rotaris.views.chrome import NAV_ITEMS, _glyph_icon

    for dpr in (1.0, 1.5, 2.0):
        _patch_primary_screen(monkeypatch, dpr)
        for _, glyph, __ in NAV_ITEMS:
            icon = _glyph_icon(glyph)
            assert not icon.isNull(), f"glyph {glyph!r} null at DPR={dpr}"
            pm = icon.pixmap(24, 24)
            assert not pm.isNull(), f"glyph {glyph!r} pixmap null at DPR={dpr}"


# ---------------------------------------------------------------------------
# NavRail — icon wiring
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_2092)
def test_navrail_buttons_have_17x17_icon_size(qtbot) -> None:
    """Every NavRail button reports iconSize=17×17 — `.nav-item i` from components.css."""
    from rotaris.views.chrome import NavRail

    rail = NavRail()
    qtbot.addWidget(rail)
    for vid, button in rail._buttons.items():
        assert button.iconSize() == QSize(17, 17), (
            f"button {vid} iconSize={button.iconSize().width()}×"
            f"{button.iconSize().height()}, expected 17×17"
        )


@verifies(SWR.SWR_2092)
def test_navrail_buttons_have_non_null_icon(qtbot) -> None:
    """Every NavRail button has a non-null QIcon set."""
    from rotaris.views.chrome import NavRail

    rail = NavRail()
    qtbot.addWidget(rail)
    for vid, button in rail._buttons.items():
        icon = button.icon()
        assert not icon.isNull(), f"button {vid} icon is null"


@verifies(SWR.SWR_2092)
def test_navrail_selection_emits_signal(qtbot) -> None:
    """select('workspace', emit=True) emits view_selected signal."""
    from rotaris.views.chrome import NavRail

    rail = NavRail()
    qtbot.addWidget(rail)
    with qtbot.waitSignal(rail.view_selected, timeout=500) as blocker:
        rail.select("workspace", emit=True)
    assert blocker.args == ["workspace"]
    assert rail.current() == "workspace"


@verifies(SWR.SWR_2092)
def test_navrail_select_toggles_checked_state(qtbot) -> None:
    """select() sets only the target button checked."""
    from rotaris.views.chrome import NavRail

    rail = NavRail()
    qtbot.addWidget(rail)
    rail.select("git")
    assert rail._buttons["git"].isChecked()
    assert not rail._buttons["dashboard"].isChecked()
    assert not rail._buttons["settings"].isChecked()


# ---------------------------------------------------------------------------
# StatusBar — every item in the strip says what it is
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_2509)
def test_the_status_strip_explains_the_safety_settings_it_abbreviates(qtbot) -> None:
    """Productive use: a user reads the bottom strip and wonders what "CB armed" and
    "mode: ask" are. Expected outcome: each item keeps its short form — the row has to
    fit a 1000×680 window — and carries the sentence that explains it, in the tooltip
    and in what a screen reader announces. Before this the strip was four abbreviations
    and an acronym, explained nowhere in the product."""
    from rotaris.models.store import WorkspaceStore
    from rotaris.views.chrome import StatusBar

    store = WorkspaceStore()
    bar = StatusBar(store)
    qtbot.addWidget(bar)

    assert "● CB armed" in bar.flags_label.text()
    assert "mode: ask" in bar.flags_label.text()
    explained = bar.flags_label.toolTip()
    assert "Circuit breaker" in explained
    assert "Secret redaction" in explained
    assert "Permission mode ask" in explained
    assert "this workspace folder only" in explained
    # A screen reader gets the same sentences the pointer does.
    assert bar.flags_label.accessibleDescription() == explained
    assert bar.flags_label.accessibleName() == "Safety settings in force"

    store.set_runtime_toggle("allow_outside_workspace", True)

    assert "outside-workspace!" in bar.flags_label.text()
    assert "outside this workspace folder" in bar.flags_label.toolTip()
    assert "not saved" in bar.flags_label.toolTip(), "the pending edit is explained too"


@verifies(SWR.SWR_2509)
def test_the_status_strip_states_what_its_model_is_for(qtbot) -> None:
    """Productive use: a user sees a model id in the corner of a window that is showing
    them a requirement board, and cannot tell what it has to do with anything. Expected
    outcome: the item names the relation — runs started here use it — and says where it
    is changed. The bare id used to be the whole message."""
    from rotaris.models.store import WorkspaceStore
    from rotaris.views.chrome import StatusBar

    store = WorkspaceStore()
    bar = StatusBar(store)
    qtbot.addWidget(bar)

    store.set_active_model("codex/gpt-5.6-sol")

    assert bar.model_label.text() == "codex/gpt-5.6-sol"
    assert "codex/gpt-5.6-sol" in bar.model_label.toolTip()
    assert "Runs started from this window" in bar.model_label.toolTip()
    assert bar.model_label.accessibleName() == "Model runs use"
    # And the items beside it are no longer anonymous either.
    for label in (bar.path_label, bar.branch_label, bar.tokens_label, bar.bg_label):
        assert label.accessibleName(), "every item in the strip announces itself"
    assert bar.tokens_label.toolTip()
    assert bar.bg_label.toolTip()


@verifies(SWR.SWR_2509)
def test_the_status_strip_shows_which_of_its_items_open_something(qtbot, monkeypatch) -> None:
    """Productive use: a user wants the folder Rotaris is working in, sees the path in
    the bottom strip, and has no reason to believe clicking it does anything — every
    item in the row is styled the same. Expected outcome: the items that open something
    are links, with a link's colour, underline, hand cursor and keyboard reach, and the
    path opens the folder in the file manager. The readings beside it — branch, flags,
    model, tokens, background sessions — stay plain text, because a reading that looks
    pressable promises something the strip cannot deliver."""
    from PySide6.QtGui import QDesktopServices

    from rotaris.models.store import WorkspaceStore
    from rotaris.views.chrome import StatusBar, _StatusLink

    opened: list[str] = []
    monkeypatch.setattr(
        QDesktopServices, "openUrl", lambda url: opened.append(url.toLocalFile()) or True
    )

    store = WorkspaceStore()
    store.workspace_path = "/tmp/punchclock"
    bar = StatusBar(store)
    qtbot.addWidget(bar)
    bar.refresh()

    assert isinstance(bar.path_label, _StatusLink)
    assert bar.path_label.item_text() == "/tmp/punchclock"
    # An eye, not only a screen reader: the item is drawn as a link.
    assert "<a href=" in bar.path_label.text()
    assert bar.path_label.cursor().shape() == Qt.CursorShape.PointingHandCursor
    assert bar.path_label.focusPolicy() != Qt.FocusPolicy.NoFocus
    assert "Opens it in your file manager" in bar.path_label.toolTip()

    bar.path_label.linkActivated.emit("#")

    assert opened == ["/tmp/punchclock"]

    # And the readings stay readings.
    for label in (
        bar.branch_label,
        bar.flags_label,
        bar.model_label,
        bar.tokens_label,
        bar.cost_label,
        bar.bg_label,
    ):
        assert not isinstance(label, _StatusLink), f"{label.accessibleName()} opens nothing"
        assert "<a href=" not in label.text()
        assert label.cursor().shape() == Qt.CursorShape.ArrowCursor


@verifies(SWR.SWR_3013)
def test_the_status_strips_cloud_balance_opens_the_account_it_reports_on(
    qtbot, monkeypatch
) -> None:
    """Productive use: the strip says the Rotaris Cloud account is out of credit, which
    is the one reading a user immediately wants to act on. Expected outcome: the balance
    is a link to the account page credit is bought on, and it keeps the warning colour
    that says the account is empty — the state and the route are both readable."""
    from PySide6.QtGui import QDesktopServices

    from rotaris.models.state import CloudCredit
    from rotaris.models.store import WorkspaceStore
    from rotaris.services.config_service import ROTARIS_CLOUD_QUICK_START_URL
    from rotaris.theme import tokens
    from rotaris.views.chrome import StatusBar

    opened: list[str] = []
    monkeypatch.setattr(
        QDesktopServices, "openUrl", lambda url: opened.append(url.toString()) or True
    )

    store = WorkspaceStore()
    bar = StatusBar(store)
    qtbot.addWidget(bar)

    store.set_cloud_credit(
        CloudCredit(
            phase="ready",
            state="exhausted",
            balance_label="$0.00",
            admission_allowed=False,
        )
    )

    assert bar.cloud_credit_label.item_text() == "$0.00 credit ⚠ no credit"
    assert "<a href=" in bar.cloud_credit_label.text()
    # The text form: this is a word in the strip, so it owes 4.5:1 rather than
    # the 3:1 the same state owes as a dot.
    assert tokens().color.wait_text in bar.cloud_credit_label.text(), (
        "empty account still reads as a warning"
    )
    assert "account page" in bar.cloud_credit_label.toolTip()

    bar.cloud_credit_label.linkActivated.emit("#")

    assert opened == [ROTARIS_CLOUD_QUICK_START_URL]


@verifies(SWR.SWR_3301)
def test_the_rail_carries_seven_primary_views_with_requirements_between_mission_and_git(
    qtbot,
) -> None:
    """Productive use: a user looks for their requirements in the navigation rail.
    Expected outcome: a seventh entry sits where the requirement work belongs, in the run loop."""
    from rotaris.views.chrome import NAV_ITEMS, NavRail

    assert [view_id for view_id, _glyph, _label in NAV_ITEMS] == [
        "dashboard",
        "workspace",
        "mission",
        "requirements",
        "git",
        "library",
        "settings",
    ]
    assert ("requirements", "diamonds-four", "Requirements") in NAV_ITEMS

    rail = NavRail()
    qtbot.addWidget(rail)

    assert len(rail._buttons) == 7
    button = rail._buttons["requirements"]
    # The glyph survives the DPI treatment of SWR-2092 like every other one.
    assert not button.icon().isNull()
    assert button.iconSize() == QSize(17, 17)
    assert button.accessibleName() == "Open Requirements"
    with qtbot.waitSignal(rail.view_selected, timeout=500) as caught:
        rail.select("requirements", emit=True)
    assert caught.args == ["requirements"]
    assert rail.current() == "requirements"
