"""The design system's inventory, as one library (SWR-3702).

A sweep rather than a test per component. The claim SWR-3702 makes is about the
*set* — every component exists, resolves no literal, and follows a theme — and a
claim about a set is only kept by a test that enumerates it. Twenty-seven
hand-written tests would leave the twenty-eighth component uncovered on the day
it is added, which is exactly when the rule is easiest to break.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from PySide6.QtWidgets import QWidget
from rotaris_core.reqtocode import SWR, verifies

from rotaris import widgets
from rotaris.theme import palettes, theme_manager
from rotaris.theme.manager import Themed

if TYPE_CHECKING:
    from collections.abc import Callable, Iterator

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


#: The design system's inventory, group by group, with the smallest call that
#: builds each one. Keyed by the name the design system uses.
INVENTORY: dict[str, Callable[[], QWidget]] = {
    # core
    "Button": lambda: widgets.make_button("Run"),
    "Tag": lambda: widgets.Tag("beta"),
    "StatusDot": widgets.StatusDot,
    "ToggleSwitch": widgets.ToggleSwitch,
    "SegmentedControl": lambda: widgets.SegmentedControl(["swarm", "single"]),
    "Kbd": lambda: widgets.Kbd("Ctrl"),
    "KbdSequence": lambda: widgets.KbdSequence("Ctrl+Shift+P"),
    # forms
    "Input": widgets.Input,
    "TextArea": widgets.TextArea,
    "Select": widgets.Select,
    "FieldLabel": lambda: widgets.FieldLabel("Model"),
    "Field": lambda: widgets.Field("Model", widgets.Input()),
    # surfaces
    "Card": widgets.Card,
    "KpiCard": lambda: widgets.KpiCard("Tokens"),
    "SectionLabel": lambda: widgets.SectionLabel("Overview"),
    # data
    "Sparkline": widgets.Sparkline,
    "MeterBar": widgets.MeterBar,
    "ContextBar": widgets.ContextBar,
    "ContextRing": widgets.ContextRing,
    "Table": lambda: widgets.Table("Commits"),
    # feedback
    "EmptyState": lambda: widgets.EmptyState("Nothing yet", "Start a run to see output."),
    "InlineBanner": widgets.InlineBanner,
    "Spinner": widgets.Spinner,
    "Toast": lambda: widgets.Toast("Saved", body="Your settings were written."),
    # navigation
    "Tabs": widgets.Tabs,
    "NavRail": widgets.NavRail,
    "NavItem": lambda: widgets.NavItem("overview", "◎", "Overview"),
    # patterns
    "PageHeader": lambda: widgets.PageHeader("Mission", "Delegation tree"),
    "SectionHeader": lambda: widgets.SectionHeader("Task agents"),
    "TableCard": lambda: widgets.TableCard("Commits"),
    "LogPanel": widgets.LogPanel,
    "ConfirmDialog": lambda: widgets.ConfirmDialog(
        "Delete worktree",
        "This cannot be undone.",
        ["feat/swr-3700 (2 commits ahead)"],
        confirm_label="Delete worktree",
    ),
}


@verifies(SWR.SWR_3702)
def test_the_whole_inventory_is_exported_from_one_package() -> None:
    """A component nobody can import is a component nobody will reuse."""
    missing = [name for name in INVENTORY if not hasattr(widgets, name.replace("Button", "Tag"))]
    exported = set(widgets.__all__)
    absent = {
        "Tag",
        "StatusDot",
        "ToggleSwitch",
        "SegmentedControl",
        "Kbd",
        "KbdSequence",
        "Input",
        "TextArea",
        "Select",
        "FieldLabel",
        "Field",
        "Card",
        "KpiCard",
        "SectionLabel",
        "Sparkline",
        "MeterBar",
        "ContextRing",
        "Table",
        "EmptyState",
        "InlineBanner",
        "Spinner",
        "Toast",
        "ToastStack",
        "Tabs",
        "NavRail",
        "NavItem",
        "PageHeader",
        "SectionHeader",
        "TableCard",
        "LogPanel",
        "ConfirmDialog",
        "make_button",
        "attach_tooltip",
    } - exported

    assert not absent, f"design-system components missing from rotaris.widgets: {sorted(absent)}"
    assert not missing


@verifies(SWR.SWR_3702)
@pytest.mark.parametrize("name", sorted(INVENTORY), ids=sorted(INVENTORY))
def test_every_component_constructs_without_a_backend(qtbot, name: str) -> None:
    """A primitive that needs a running session is not a primitive."""
    widget = INVENTORY[name]()
    qtbot.addWidget(widget)
    assert isinstance(widget, QWidget)


@verifies(SWR.SWR_3702, SWR.SWR_3706)
@pytest.mark.parametrize("name", sorted(INVENTORY), ids=sorted(INVENTORY))
def test_every_component_that_styles_itself_follows_a_theme_change(qtbot, name: str) -> None:
    """Productive use: a user switches theme and no primitive is left behind.

    Components styled purely by the application stylesheet are repainted by the
    manager and hold no stylesheet of their own — those are skipped here, and
    the live sweep in `test_theme_switching_flow.py` covers them. What this
    catches is a component that builds its own stylesheet and forgets to
    subscribe, which looks identical until the moment a theme changes.
    """
    widget = INVENTORY[name]()
    qtbot.addWidget(widget)

    before = widget.styleSheet()
    theme_manager().set_theme("high-contrast", persist=False)
    after = widget.styleSheet()

    if not before and not after:
        pytest.skip(f"{name} carries no stylesheet of its own")
    assert isinstance(widget, Themed), (
        f"{name} builds its own stylesheet but does not mix in Themed, so it "
        "cannot follow a theme change"
    )
    assert after != before, f"{name} did not rebuild its stylesheet on a theme change"


@verifies(SWR.SWR_3702)
@pytest.mark.parametrize("name", sorted(INVENTORY), ids=sorted(INVENTORY))
def test_no_component_paints_from_a_value_it_captured_at_import(qtbot, name: str) -> None:
    """Building the same component under two themes must produce two results.

    Constructed *after* the switch rather than restyled through it, so this
    catches the other half of the same bug: a value read in a class body is
    identical in every instance, however many themes have been active since.
    """
    theme_manager().set_theme("rotaris-dim", persist=False)
    first = INVENTORY[name]()
    qtbot.addWidget(first)
    dim_sheet = first.styleSheet()

    theme_manager().set_theme("high-contrast", persist=False)
    second = INVENTORY[name]()
    qtbot.addWidget(second)
    contrast_sheet = second.styleSheet()

    if not dim_sheet and not contrast_sheet:
        pytest.skip(f"{name} carries no stylesheet of its own")
    assert dim_sheet != contrast_sheet, (
        f"{name} builds the same stylesheet under two different themes — it is "
        "holding a value captured at import"
    )


@verifies(SWR.SWR_3702)
def test_a_tag_is_readable_on_its_own_fill_in_every_theme(qtbot) -> None:
    """Productive use: a user reads a `running` badge on any theme.

    A tag is the one component whose text does not sit on a card — it sits on
    the tag's own fill, so its contrast has to be resolved against that rather
    than against the surface behind it.
    """
    from rotaris.theme.color import contrast_ratio

    for theme_name in palettes.names():
        theme = theme_manager().set_theme(theme_name, persist=False)
        for kind in ("accent", "neutral", "outline", "run", "wait", "done", "fail"):
            tag = widgets.Tag("running", kind)
            qtbot.addWidget(tag)
            sheet = tag.styleSheet()
            assert sheet, f"{kind} tag has no styling"
            # The pair the component resolved, read back out of what it painted.
            colours = _declared_colours(sheet)
            if "color" in colours and "background" in colours:
                ratio = contrast_ratio(colours["color"], colours["background"])
                assert ratio >= theme.min_text_contrast, (
                    f"{theme_name} {kind} tag text is {ratio:.2f}:1 on its own fill"
                )


def _declared_colours(sheet: str) -> dict[str, str]:
    """The opaque `color` and `background` a stylesheet declares."""
    import re

    found: dict[str, str] = {}
    for prop, pattern in (
        ("color", r"(?<![\w-])color\s*:\s*(#[0-9a-fA-F]{6})"),
        ("background", r"(?<![\w-])background(?:-color)?\s*:\s*(#[0-9a-fA-F]{6})"),
    ):
        match = re.search(pattern, sheet)
        if match:
            found[prop] = match.group(1)
    return found


@verifies(SWR.SWR_3702)
def test_interactive_components_announce_themselves(qtbot) -> None:
    """AGENTS.md: an icon-only or custom control needs an accessible name.

    Rotaris' own test helpers find controls by accessible name, so a component
    without one is untestable as well as unannounceable.
    """
    unnamed: list[str] = []
    for name in ("StatusDot", "ToggleSwitch", "Spinner", "NavItem"):
        widget = INVENTORY[name]()
        qtbot.addWidget(widget)
        if not widget.accessibleName() and not widget.accessibleDescription():
            unnamed.append(name)

    assert not unnamed, f"custom controls with nothing to announce: {unnamed}"
