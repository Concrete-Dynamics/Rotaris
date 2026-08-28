"""The faces the app names actually reach the screen (SWR-3703).

Most of these exist because Qt fails silently in ways that look like success. A
missing family is substituted rather than reported, so the interface renders in
a face nobody chose. `letter-spacing` and `font-variant-numeric` are *accepted*
by the stylesheet parser and then discarded, so a tracked label looks correct in
the source and renders untracked. Both are caught by measuring, which is the
only way to tell the difference.

One test guards a product decision rather than a Qt trap: the product's faces
lead every shipped palette's type stacks — Space Grotesk for display, Roboto
for body — and swapping them away by editing one palette line should have to
be a decision, not an accident.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from PySide6.QtGui import QFontMetricsF
from rotaris_core.reqtocode import SWR, verifies

from rotaris.theme import tokens
from rotaris.theme.fonts import FONT_DIR, register_bundled_fonts, registered_families
from rotaris.theme.palettes import get as theme_named
from rotaris.theme.palettes import names as theme_names
from rotaris.theme.spec import TypeStyle, css_stack

pytestmark = pytest.mark.unit

BRAND_FACES = ("Space Grotesk", "Manrope", "Roboto", "JetBrains Mono")


@verifies(SWR.SWR_3703)
def test_the_bundled_faces_are_shipped_with_their_licences() -> None:
    """They are OFL, so redistributing them means shipping the licence too."""
    assert FONT_DIR.is_dir(), f"no bundled fonts at {FONT_DIR}"
    faces = [path for path in FONT_DIR.iterdir() if path.suffix.lower() == ".ttf"]
    licences = [path for path in FONT_DIR.iterdir() if path.name.startswith("OFL")]

    assert len(faces) >= 5, "display, body, body-fallback, mono and mono-italic"
    assert len(licences) >= 4, "one licence per family"
    for face in faces:
        assert face.stat().st_size > 10_000, f"{face.name} is too small to be a real font"


@verifies(SWR.SWR_3703)
def test_registration_reports_the_families_qt_accepted(qtbot) -> None:
    families = register_bundled_fonts()
    for face in BRAND_FACES:
        assert face in families, f"{face} did not reach the font database"
    assert registered_families() == families


@verifies(SWR.SWR_3703)
def test_registering_twice_does_not_register_twice(qtbot) -> None:
    """Qt would happily take the same file again and name the family twice."""
    first = register_bundled_fonts()
    assert register_bundled_fonts() == first
    assert len(first) == len(set(first))


@verifies(SWR.SWR_3703)
def test_a_missing_font_directory_does_not_stop_the_application(
    qtbot, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """An interface in the wrong face is a defect; one that will not open is an outage.

    This runs before the first window is constructed, so anything it can
    discover has to be survivable.
    """
    from rotaris.theme import fonts

    monkeypatch.setattr(fonts, "FONT_DIR", tmp_path / "not-here")
    # Both halves of the memo, or teardown restores the key while leaving this
    # test's empty result as the value — and every later caller in the process
    # gets "no families" from a cache that thinks it is still valid.
    monkeypatch.setattr(fonts, "_registered_from", None)
    monkeypatch.setattr(fonts, "_registered", ())

    assert fonts.register_bundled_fonts() == ()


@verifies(SWR.SWR_3703)
def test_a_file_that_is_not_a_font_is_skipped_rather_than_fatal(
    qtbot, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from rotaris.theme import fonts

    (tmp_path / "broken.ttf").write_bytes(b"this is not a font")
    monkeypatch.setattr(fonts, "FONT_DIR", tmp_path)
    # Both halves of the memo — see the note in the missing-directory test.
    monkeypatch.setattr(fonts, "_registered_from", None)
    monkeypatch.setattr(fonts, "_registered", ())

    assert fonts.register_bundled_fonts() == ()


@verifies(SWR.SWR_3703)
def test_the_mono_face_measures_on_a_fixed_grid(qtbot) -> None:
    """Productive use: a user watches a progress bar redraw inside the terminal.

    A stylesheet's font-family never reaches `QWidget.fontMetrics()`, so code that
    sizes a terminal cell has to be handed the families directly. Given a
    proportional fallback the grid tears and box drawing walks sideways
    (SWR-2429), which is why this measures advances instead of reading a name.
    """
    register_bundled_fonts()
    font = tokens().type.mono_font(13)
    metrics = QFontMetricsF(font)

    advances = {metrics.horizontalAdvance(character) for character in "iWl.M0@"}
    assert len(advances) == 1, f"the mono face is not fixed pitch: {sorted(advances)}"
    assert font.fixedPitch() is True


@verifies(SWR.SWR_3703)
def test_the_type_stacks_lead_with_the_product_faces(qtbot) -> None:
    """Space Grotesk speaks for display, Roboto for body, mono stays the host's.

    The named faces are bundled, so a stack that leads with them can never run
    out before its fallbacks; a host face behind them is the safety net for the
    one desktop that cannot render the variable font.
    """
    register_bundled_fonts()
    type_ = tokens().type

    assert type_.display_families[0] == "Space Grotesk"
    assert type_.body_families[0] == "Roboto"
    assert "Manrope" in type_.body_families, "the design system's body face is the first fallback"
    assert "Segoe UI" in type_.body_families, "a host face must sit behind the bundled faces"
    assert type_.mono_families[0] == "Cascadia Mono"
    assert "JetBrains Mono" in type_.mono_families, "the bundled floor is missing"
    assert type_.mono_families.index("JetBrains Mono") > type_.mono_families.index("Consolas"), (
        "the bundled mono face must be the fallback, not the first choice"
    )


@pytest.mark.parametrize("name", theme_names())
@verifies(SWR.SWR_3703)
def test_every_palette_leads_with_the_product_faces(qtbot, name: str) -> None:
    """The product's faces are the choice, not an accident to be re-made per palette.

    A palette that dropped Space Grotesk from the display stack or Roboto from
    the body stack would silently return the interface to a face the product did
    not choose.
    """
    type_ = theme_named(name).type

    assert type_.display_families[0] == "Space Grotesk", f"{name} lost its display face"
    assert type_.body_families[0] == "Roboto", f"{name} lost its body face"


@pytest.mark.parametrize("name", theme_names())
@verifies(SWR.SWR_3703)
def test_nothing_goes_above_the_500_weight_ceiling_except_high_contrast(qtbot, name: str) -> None:
    """Three weights and only three: 400 resting, 500 emphasised.

    High Contrast is the one exception — its 700/800 are its contrast budget
    for readers the AA floor does not serve, not decoration.
    """
    type_ = theme_named(name).type
    ceiling = 800 if name == "high-contrast" else 500

    assert type_.weight_display <= ceiling, f"{name}: display weight {type_.weight_display}"
    assert type_.weight_body <= ceiling, f"{name}: body weight {type_.weight_body}"
    assert type_.weight_strong <= ceiling, f"{name}: strong weight {type_.weight_strong}"


@verifies(SWR.SWR_3703)
def test_a_family_with_a_space_reaches_the_stylesheet_quoted(qtbot) -> None:
    """Unquoted, `Segoe UI` is not a syntax error in QSS — it is a *missing*
    family, and Qt answers missing by substituting silently."""
    assert css_stack(("Cascadia Mono", "Menlo", "monospace")) == (
        '"Cascadia Mono", Menlo, monospace'
    )
    for name in theme_names():
        type_ = theme_named(name).type
        for stack, families in (
            (type_.display, type_.display_families),
            (type_.body, type_.body_families),
            (type_.mono, type_.mono_families),
        ):
            assert stack == css_stack(families), f"{name}: painted and measured faces disagree"


@verifies(SWR.SWR_3703)
def test_tracking_reaches_the_font_rather_than_the_stylesheet(qtbot) -> None:
    """A section label the design system tracks out has to actually be tracked.

    QSS accepts `letter-spacing` and ignores it, so the only proof is that the
    tracked string measures wider than the untracked one.
    """
    register_bundled_fonts()
    tracking = tokens().type.tracking_label
    sample = "SECTION LABEL"

    face = tokens().type.body_families[0]
    plain = QFontMetricsF(TypeStyle(family=face, size=12).font())
    tracked = QFontMetricsF(TypeStyle(family=face, size=12, tracking=tracking).font())

    assert tracked.horizontalAdvance(sample) > plain.horizontalAdvance(sample)


@verifies(SWR.SWR_3703)
def test_tabular_figures_keep_a_ticking_number_from_moving_its_neighbours(qtbot) -> None:
    """Productive use: a token counter climbs while a user reads the row beside it."""
    register_bundled_fonts()
    style = TypeStyle(family="JetBrains Mono", size=12, tabular=True)
    metrics = QFontMetricsF(style.font())

    widths = {metrics.horizontalAdvance(digit) for digit in "0123456789"}
    assert len(widths) == 1


@verifies(SWR.SWR_3703)
def test_the_frozen_build_carries_the_font_assets() -> None:
    """A packaged Rotaris has to look like a run-from-source Rotaris.

    The bundle's data files are collected by walking the package rather than by
    a hand-kept list, so the fonts are picked up without a packaging change —
    but only for as long as the walk keeps including them. A skip rule added for
    some other reason could drop a whole asset directory silently, and the
    symptom would be a shipped binary rendering in a substituted face.
    """
    from rotaris_core.packaging import collect_datas

    bundled = {Path(source).name for source, _ in collect_datas()}
    for face in FONT_DIR.iterdir():
        if face.suffix.lower() == ".ttf":
            assert face.name in bundled, f"{face.name} would be missing from the frozen app"
