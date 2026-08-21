"""The faces the app names actually reach the screen (SWR-3703).

Most of these exist because Qt fails silently in ways that look like success. A
missing family is substituted rather than reported, so the interface renders in
a face nobody chose. `letter-spacing` and `font-variant-numeric` are *accepted*
by the stylesheet parser and then discarded, so a tracked label looks correct in
the source and renders untracked. Both are caught by measuring, which is the
only way to tell the difference.

One test guards a product decision rather than a Qt trap: the design system's
brand display/body pair is bundled but deliberately unused, and re-adopting it
by editing one palette line should have to be a decision, not an accident.
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

BRAND_FACES = ("Space Grotesk", "Manrope", "JetBrains Mono")


@verifies(SWR.SWR_3703)
def test_the_brand_faces_are_bundled_with_their_licences() -> None:
    """They are OFL, so redistributing them means shipping the licence too."""
    assert FONT_DIR.is_dir(), f"no bundled fonts at {FONT_DIR}"
    faces = [path for path in FONT_DIR.iterdir() if path.suffix.lower() == ".ttf"]
    licences = [path for path in FONT_DIR.iterdir() if path.name.startswith("OFL")]

    assert len(faces) >= 4, "display, body, mono and mono-italic"
    assert len(licences) >= 3, "one licence per family"
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
    monkeypatch.setattr(fonts, "_registered_from", None)

    assert fonts.register_bundled_fonts() == ()

    monkeypatch.setattr(fonts, "_registered_from", None)


@verifies(SWR.SWR_3703)
def test_a_file_that_is_not_a_font_is_skipped_rather_than_fatal(
    qtbot, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from rotaris.theme import fonts

    (tmp_path / "broken.ttf").write_bytes(b"this is not a font")
    monkeypatch.setattr(fonts, "FONT_DIR", tmp_path)
    monkeypatch.setattr(fonts, "_registered_from", None)

    assert fonts.register_bundled_fonts() == ()

    monkeypatch.setattr(fonts, "_registered_from", None)


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
def test_the_type_stacks_are_host_first_and_end_in_something_guaranteed(qtbot) -> None:
    """Ask for the host's face, but never end the stack on a maybe.

    A stack whose last entry is a family the machine might not have is a stack
    that can resolve to whatever Qt feels like — which for a mono stack means a
    proportional face on the terminal's fixed grid (SWR-2429).
    """
    register_bundled_fonts()
    type_ = tokens().type

    assert type_.body_families[0] == "Inter"
    assert "Segoe UI" in type_.body_families
    assert type_.mono_families[0] == "Cascadia Mono"
    assert "JetBrains Mono" in type_.mono_families, "the bundled floor is missing"
    assert type_.mono_families.index("JetBrains Mono") > type_.mono_families.index("Consolas"), (
        "the bundled face must be the fallback, not the first choice"
    )


@pytest.mark.parametrize("name", theme_names())
@verifies(SWR.SWR_3703)
def test_no_palette_paints_the_interface_in_the_rejected_brand_pair(qtbot, name: str) -> None:
    """The brand pair ships, and no theme is allowed to *choose* it.

    It was applied to the product and rejected as unreadable at the sizes this
    interface actually uses — ten- and eleven-pixel chips, dense rows. The faces
    stay in the bundle because a future palette may want them, and because the
    offscreen platform has no host fonts at all; neither is a licence for a
    palette to quietly adopt them again.
    """
    type_ = theme_named(name).type

    for families in (type_.display_families, type_.body_families):
        assert "Space Grotesk" not in families, f"{name} paints its interface in Space Grotesk"
        # Manrope is allowed exactly one position: dead last, behind the generic
        # `sans-serif` that any desktop with fonts of its own resolves. There it
        # is the floor for a host with no fonts at all, and unreachable
        # everywhere else. Anywhere earlier and it is a choice.
        if "Manrope" in families:
            assert families[-1] == "Manrope", f"{name} could resolve to Manrope before the host"
            assert families.index("sans-serif") < families.index("Manrope")


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
