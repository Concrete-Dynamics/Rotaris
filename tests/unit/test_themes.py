"""Theme registry, schema, and stylesheet integration."""

from __future__ import annotations

import dataclasses
import re
from pathlib import Path

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tui.themes import THEMES, Theme, get_theme, set_theme

STYLESHEET = Path(__file__).parents[2] / "src" / "rotaris_core" / "tui" / "styles" / "app.tcss"


@pytest.fixture(autouse=True)
def _restore_current_theme():
    original = get_theme()
    yield
    set_theme(original.name)


@verifies(SWR.SWR_1050)
def test_theme_schema_is_immutable_and_semantic() -> None:
    """Productive use: feature authors pick colors by role instead of by widget.
    Expected outcome: the schema is frozen and every field names a semantic role."""
    roles = {f.name for f in dataclasses.fields(Theme)} - {"name"}
    assert {"bg", "bg_overlay", "bg_selection"} <= roles
    assert {"fg", "fg_muted", "fg_dim", "fg_subtle"} <= roles
    assert {"border", "border_input", "border_focus", "border_active"} <= roles
    assert {"green", "blue", "yellow", "red", "cyan", "purple"} <= roles
    assert "footer_key" in roles

    theme = THEMES["mono"]
    with pytest.raises(dataclasses.FrozenInstanceError):
        theme.bg = "#ffffff"  # type: ignore[misc]


@verifies(SWR.SWR_1051)
def test_every_theme_exports_a_complete_theme_namespaced_css_variable_map() -> None:
    """Productive use: stylesheet rules stay theme-agnostic across every theme.
    Expected outcome: each theme exports one `$theme-*` variable per semantic field."""
    expected = {
        f"theme-{field.name.replace('_', '-')}"
        for field in dataclasses.fields(Theme)
        if field.name != "name"
    }

    for name, theme in THEMES.items():
        variables = theme.css_variables()
        assert set(variables) == expected, name
        assert all(value for value in variables.values()), name


@verifies(SWR.SWR_1052)
def test_registry_ships_tokyo_night_and_dark_themes() -> None:
    """Productive use: users can switch to a shipped alternate theme by name.
    Expected outcome: both alternates are registered and carry their own name."""
    assert {"tokyo-night", "dark"} <= set(THEMES)
    assert THEMES["tokyo-night"].name == "tokyo-night"
    assert THEMES["dark"].name == "dark"


@verifies(SWR.SWR_1053)
def test_default_theme_is_mono_with_alternates_available() -> None:
    """Productive use: a fresh session starts on the black/gray/white baseline.
    Expected outcome: `get_theme()` returns `mono` before any switch."""
    assert get_theme().name == "mono"
    assert set(THEMES) >= {"mono", "tokyo-night", "dark"}


@verifies(SWR.SWR_1054)
def test_shared_stylesheet_uses_theme_variables_instead_of_literal_colors() -> None:
    """Productive use: switching themes restyles the whole TUI, not just parts of it.
    Expected outcome: the shared stylesheet declares no literal hex colors."""
    stylesheet = STYLESHEET.read_text(encoding="utf-8")

    assert "$theme-" in stylesheet
    literals = re.findall(r"#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b", stylesheet)
    assert literals == []
