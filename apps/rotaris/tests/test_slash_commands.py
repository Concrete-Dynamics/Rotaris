"""Slash commands in the workspace composer: parsing, ranking, keys, catalogue.

The pure-model tests below import `rotaris.models.slash_commands` and drive it
with plain callables — no window, no store — because that is where the rules
that break live (SWR-2443).
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest
from a11y import AA_NORMAL_TEXT, contrast_ratio, unnamed_controls
from fakes import FakeRunBridge
from PySide6.QtCore import Qt
from PySide6.QtWidgets import QApplication
from rotaris_core.reqtocode import SWR, verifies

from rotaris.models import sample_store
from rotaris.models.slash_commands import (
    EXECUTED,
    NOT_A_COMMAND,
    PARTIAL,
    RESOLVED,
    SKILL,
    UNAVAILABLE,
    UNKNOWN,
    UNKNOWN_COMMAND,
    SlashCommandError,
    SlashCommandRegistry,
    classify_slash_token,
    parse_slash_input,
    slash_filter_text,
)
from rotaris.models.state import SkillInfo, TranscriptEvent
from rotaris.models.store import WorkspaceStore
from rotaris.theme import palettes, tokens
from rotaris.theme.a11y import raise_on
from rotaris.views.main_window import MainWindow
from rotaris.views.slash_catalogue import normalize_command_name
from rotaris.widgets.slash_popup import NAME_ROLE, SlashHighlighter


def _registry(*names: str) -> SlashCommandRegistry:
    registry = SlashCommandRegistry()
    for name in names:
        registry.register(name, f"Do {name}", lambda _args: None)
    return registry


# ── unit: parsing ─────────────────────────────────────────────────────────


@pytest.mark.unit
@verifies(SWR.SWR_2438, SWR.SWR_2443)
@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("/stop", ("stop", "")),
        ("/STOP", ("stop", "")),
        ("  /stop  ", ("stop", "")),
        ("/model gpt-5", ("model", "gpt-5")),
        ("/model  gpt-5  mini", ("model", "gpt-5  mini")),
        ("/prompts:review", ("prompts:review", "")),
        # `/ ` is the escape: a genuine prompt that opens with a slash.
        ("/ what does a slash mean?", None),
        ("/", None),
        ("hello /stop", None),
        ("/stop\nand also this", None),
        ("", None),
    ],
)
def test_parse_slash_input_separates_commands_from_prompts(
    text: str, expected: tuple[str, str] | None
) -> None:
    assert parse_slash_input(text) == expected


@pytest.mark.unit
@verifies(SWR.SWR_2439)
@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("/", ""),
        ("/st", "st"),
        ("/ST", "st"),
        # Arguments are not a name to match, so the suggestions close.
        ("/model gpt-5", None),
        ("/ escaped", None),
        ("not a command", None),
        ("/stop\nsecond line", None),
    ],
)
def test_slash_filter_text_tracks_the_name_being_typed(text: str, expected: str | None) -> None:
    assert slash_filter_text(text) == expected


# ── unit: ranking ─────────────────────────────────────────────────────────


@pytest.mark.unit
@verifies(SWR.SWR_2439)
def test_match_ranks_prefix_before_substring_before_description() -> None:
    registry = SlashCommandRegistry()
    registry.register("stash", "Stash the composer prompt", lambda _a: None)
    registry.register("restart", "Restart the run", lambda _a: None)
    registry.register("pop", "Apply a stashed prompt", lambda _a: None)
    registry.register("stop", "Cancel the active run", lambda _a: None)

    assert [c.name for c in registry.match("st")] == ["stash", "stop", "restart", "pop"]


@pytest.mark.unit
@verifies(SWR.SWR_2439)
def test_match_lists_everything_for_a_bare_slash_and_nothing_for_a_miss() -> None:
    registry = _registry("stop", "pause")

    assert [c.name for c in registry.match("")] == ["stop", "pause"]
    assert registry.match("zzz") == []


# ── unit: highlighting states ─────────────────────────────────────────────


@pytest.mark.unit
@verifies(SWR.SWR_2440)
@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("/stop", (RESOLVED, 5)),
        ("/sto", (PARTIAL, 4)),
        ("/zzz", (UNKNOWN, 4)),
        ("/stop now", (RESOLVED, 5)),
        ("/ escaped", None),
        ("plain prompt", None),
        ("/", None),
    ],
)
def test_classify_slash_token_reports_state_and_token_span(
    text: str, expected: tuple[str, int] | None
) -> None:
    assert classify_slash_token(text, _registry("stop", "pause")) == expected


@pytest.mark.unit
@verifies(SWR.SWR_2440)
@pytest.mark.parametrize("palette", palettes.names())
def test_every_highlight_colour_clears_the_readability_floor(palette: str) -> None:
    """Every theme, not just the one that happens to be active.

    The highlighter resolves its colours per theme now (SWR-3706), so a palette
    that dims one of the three states is a palette in which a typo stops being
    visible while it is typed — and that is a property of the palette, caught
    when it is written rather than when a user selects it.
    """
    theme = palettes.get(palette)
    states = SlashHighlighter.state_colors(theme)
    colours = [*states.values(), SlashHighlighter.argument_color(theme)]

    for colour in colours:
        assert contrast_ratio(colour, theme.color.surface) >= theme.min_text_contrast
        assert contrast_ratio(colour, theme.color.bg) >= theme.min_text_contrast
    # Three genuinely distinct states, not one colour reused.
    assert len({str(colour) for colour in states.values()}) == 3


# ── unit: dispatch ────────────────────────────────────────────────────────


@pytest.mark.unit
@verifies(SWR.SWR_2438, SWR.SWR_2443)
def test_execute_reports_why_a_command_did_not_run() -> None:
    ran: list[str] = []
    registry = SlashCommandRegistry()
    registry.register("stop", "Cancel the run", lambda args: ran.append(args))
    registry.register(
        "pause",
        "Pause the run",
        lambda _a: ran.append("pause"),
        available=lambda: False,
        unavailable_reason="No run is active.",
    )

    def reject(_args: str) -> None:
        raise SlashCommandError("Usage: /model <name>")

    registry.register("model", "Switch model", reject)

    assert registry.execute("/stop now").status == EXECUTED
    assert ran == ["now"]
    assert registry.execute("just a prompt").status == NOT_A_COMMAND
    assert registry.execute("/nope").status == UNKNOWN_COMMAND
    assert registry.execute("/nope").message == "Unknown command /nope"
    assert registry.execute("/pause").status == UNAVAILABLE
    assert registry.execute("/pause").message == "No run is active."
    assert registry.execute("/model").message == "Usage: /model <name>"
    assert ran == ["now"]


@pytest.mark.unit
@verifies(SWR.SWR_2443)
def test_slash_command_model_imports_neither_qt_nor_the_textual_tui() -> None:
    """The rules must stay testable without a QApplication."""
    source = Path(__file__).parents[1] / "src" / "rotaris" / "models" / "slash_commands.py"
    tree = ast.parse(source.read_text(encoding="utf-8"))

    imported: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imported.add(node.module)

    assert not [name for name in imported if name.startswith(("PySide6", "rotaris_core.tui"))]


# ── integration: the composer ─────────────────────────────────────────────


@pytest.mark.integration
@verifies(SWR.SWR_2439)
def test_typing_a_slash_opens_and_narrows_the_suggestions(qtbot) -> None:
    window = MainWindow(sample_store())
    qtbot.addWidget(window)
    window.show_view("workspace")
    workspace = window.workspace

    workspace.composer.setPlainText("/")
    assert workspace.slash_popup.is_open()
    assert len(workspace.slash_popup.commands()) == len(workspace.slash_registry.list_commands())

    workspace.composer.setPlainText("/st")
    shown = [command.name for command in workspace.slash_popup.commands()]
    assert set(shown[:2]) == {"stash", "stop"}
    # `/pop` only matches through its description, so it ranks after both.
    assert shown.index("pop") > 1

    workspace.composer.setPlainText("/zzzz")
    assert not workspace.slash_popup.is_open()

    workspace.composer.setPlainText("just a prompt")
    assert not workspace.slash_popup.is_open()


@pytest.mark.integration
@verifies(SWR.SWR_2439)
def test_suggestions_never_take_focus_from_the_composer(qtbot) -> None:
    window = MainWindow(sample_store())
    qtbot.addWidget(window)
    window.show()
    qtbot.waitExposed(window)
    window.show_view("workspace")
    window.workspace.composer.setFocus()
    popup = window.workspace.slash_popup
    focus_before = QApplication.focusWidget()

    window.workspace.composer.setPlainText("/st")

    assert popup.is_open()
    assert QApplication.focusWidget() is focus_before
    assert QApplication.focusWidget() not in (popup, popup.list)
    assert popup.focusPolicy() == Qt.FocusPolicy.NoFocus
    assert popup.list.focusPolicy() == Qt.FocusPolicy.NoFocus


@pytest.mark.integration
@verifies(SWR.SWR_2439, SWR.SWR_2442)
def test_unavailable_commands_stay_listed_with_their_reason(qtbot) -> None:
    store = WorkspaceStore()
    window = MainWindow(store, run_bridge=FakeRunBridge())
    qtbot.addWidget(window)
    window.show_view("workspace")

    window.workspace.composer.setPlainText("/stop")
    stop = window.workspace.slash_registry.get("stop")

    assert stop is not None
    assert stop.is_available() is False
    assert stop.unavailable_reason == "No run is active."
    item = window.workspace.slash_popup.list.item(0)
    assert item.data(NAME_ROLE) == "stop"
    assert item.toolTip() == "No run is active."


@pytest.mark.integration
@verifies(SWR.SWR_2440)
def test_the_composer_colours_a_command_as_it_is_typed(qtbot) -> None:
    window = MainWindow(sample_store())
    qtbot.addWidget(window)
    window.show_view("workspace")
    composer = window.workspace.composer

    def token_colour(text: str) -> str:
        composer.setPlainText(text)
        block = composer.document().firstBlock()
        formats = block.layout().formats()
        return formats[0].format.foreground().color().name() if formats else ""

    states = SlashHighlighter.state_colors(tokens())

    assert token_colour("/stop") == str(states[RESOLVED]).lower()
    assert token_colour("/sto") == str(states[PARTIAL]).lower()
    assert token_colour("/zzz") == str(states[UNKNOWN]).lower()
    assert token_colour("/ escaped") == ""
    assert token_colour("plain prompt") == ""


@pytest.mark.integration
@verifies(SWR.SWR_2441)
def test_open_suggestions_own_the_arrow_keys_but_history_keeps_them_otherwise(qtbot) -> None:
    store = sample_store()
    store.prompt_history = ["an earlier prompt"]
    window = MainWindow(store)
    qtbot.addWidget(window)
    window.show_view("workspace")
    composer = window.workspace.composer
    popup = window.workspace.slash_popup

    composer.setPlainText("/s")
    first = popup.current()
    qtbot.keyClick(composer, Qt.Key.Key_Down)

    assert popup.current() is not first
    assert composer.toPlainText() == "/s"

    qtbot.keyClick(composer, Qt.Key.Key_Up)
    qtbot.keyClick(composer, Qt.Key.Key_Up)  # clamps at the top, never recalls
    assert popup.current() is first
    assert composer.toPlainText() == "/s"

    composer.clear()
    qtbot.keyClick(composer, Qt.Key.Key_Up)
    assert composer.toPlainText() == "an earlier prompt"


@pytest.mark.integration
@verifies(SWR.SWR_2441)
def test_tab_completes_the_selected_command_without_submitting(qtbot) -> None:
    bridge = FakeRunBridge()
    window = MainWindow(sample_store(), run_bridge=bridge)
    qtbot.addWidget(window)
    window.show_view("workspace")
    composer = window.workspace.composer

    composer.setPlainText("/stas")
    qtbot.keyClick(composer, Qt.Key.Key_Tab)

    assert composer.toPlainText() == "/stash "
    assert not window.workspace.slash_popup.is_open()
    assert bridge.prompts == []


@pytest.mark.integration
@verifies(SWR.SWR_2441)
def test_enter_submits_a_fully_typed_command_instead_of_recompleting_it(qtbot) -> None:
    bridge = FakeRunBridge()
    bridge.running = True
    store = WorkspaceStore()
    store.set_session_status("running")
    window = MainWindow(store, run_bridge=bridge)
    qtbot.addWidget(window)
    window.show_view("workspace")
    composer = window.workspace.composer

    composer.setPlainText("/pause")
    assert window.workspace.slash_popup.current().name == "pause"
    qtbot.keyClick(composer, Qt.Key.Key_Return)

    assert bridge.paused == ["orchestrator"]
    assert composer.toPlainText() == ""


@pytest.mark.integration
@verifies(SWR.SWR_2441)
def test_escape_closes_the_suggestions_and_keeps_the_text(qtbot) -> None:
    window = MainWindow(sample_store())
    qtbot.addWidget(window)
    window.show_view("workspace")
    composer = window.workspace.composer

    composer.setPlainText("/st")
    qtbot.keyClick(composer, Qt.Key.Key_Escape)

    assert not window.workspace.slash_popup.is_open()
    assert composer.toPlainText() == "/st"


@pytest.mark.integration
@verifies(SWR.SWR_2441)
def test_shift_enter_makes_a_newline_and_closes_the_suggestions(qtbot) -> None:
    window = MainWindow(sample_store())
    qtbot.addWidget(window)
    window.show_view("workspace")
    composer = window.workspace.composer

    qtbot.keyClicks(composer, "/st")
    qtbot.keyClick(composer, Qt.Key.Key_Return, Qt.KeyboardModifier.ShiftModifier)

    assert composer.toPlainText() == "/st\n"
    assert not window.workspace.slash_popup.is_open()


@pytest.mark.integration
@verifies(SWR.SWR_2438, SWR.SWR_2442)
def test_the_mirrored_submit_command_cannot_re_read_its_own_invocation(qtbot) -> None:
    """`/run.submit` submits the composer; clearing first stops it recursing."""
    bridge = FakeRunBridge()
    store = sample_store()
    store.set_session_status("completed")
    window = MainWindow(store, run_bridge=bridge)
    qtbot.addWidget(window)
    window.show_view("workspace")

    assert window.workspace.slash_registry.execute("/run.submit").status == EXECUTED
    assert bridge.prompts == []
    assert window.workspace.composer.toPlainText() == ""


@pytest.mark.integration
@verifies(SWR.SWR_2032, SWR.SWR_2439)
def test_the_open_suggestion_list_is_announced_and_readable(qtbot) -> None:
    """The popup joins the accessibility sweep the primary views already get."""
    window = MainWindow(sample_store())
    qtbot.addWidget(window)
    window.resize(1440, 900)
    window.show()
    qtbot.waitExposed(window)
    window.show_view("workspace")
    popup = window.workspace.slash_popup

    window.workspace.composer.setPlainText("/st")

    assert popup.is_open()
    assert unnamed_controls(popup) == []
    assert popup.accessibleName()
    assert popup.list.accessibleName()
    # The three pens the row delegate paints: name, description, kind badge.
    active = tokens()
    color = active.color
    hovered = color.hover.over(color.surface)
    for colour in (color.accent[300], color.text_secondary, color.text_tertiary):
        assert contrast_ratio(colour, color.surface) >= AA_NORMAL_TEXT
        # A highlighted row's ground is the hover fill, on which the dimmest of
        # the three does not clear the floor unaided. The delegate resolves each
        # pen against the ground it lands on, so what has to hold is that the
        # lift *succeeds* — on a light-grounded palette, raising a colour cannot
        # gain contrast and this is where that would surface.
        painted = raise_on(colour, hovered, active.min_text_contrast)
        assert contrast_ratio(painted, hovered) >= AA_NORMAL_TEXT


# ── integration: the catalogue ────────────────────────────────────────────


@pytest.mark.integration
@verifies(SWR.SWR_2442)
def test_every_command_palette_entry_is_invocable_as_a_slash_command(qtbot) -> None:
    window = MainWindow(sample_store())
    qtbot.addWidget(window)

    registry = window.workspace.slash_registry
    for spec in window.commands.commands():
        assert registry.get(normalize_command_name(spec.id)) is not None


@pytest.mark.integration
@verifies(SWR.SWR_2442)
def test_model_and_persona_commands_validate_their_argument(qtbot) -> None:
    store = sample_store()
    window = MainWindow(store)
    qtbot.addWidget(window)
    window.show_view("workspace")
    registry = window.workspace.slash_registry
    model = store.model_catalog[-1]
    persona = store.personas[-1].name

    assert registry.execute(f"/model {model}").status == EXECUTED
    assert store.active_model == model
    assert window.workspace.model_combo.currentText() == model

    assert registry.execute(f"/persona {persona}").status == EXECUTED
    assert store.session_persona_override == persona

    rejected = registry.execute("/model no-such-model")
    assert "Unknown model" in rejected.message
    assert store.active_model == model
    assert "Usage: /model <name>" in registry.execute("/model").message
    assert "Usage: /persona <name>" in registry.execute("/persona").message


@pytest.mark.integration
@verifies(SWR.SWR_2442)
def test_user_invocable_skills_become_commands_and_automatic_ones_do_not(qtbot) -> None:
    store = WorkspaceStore()
    store.skills = [
        SkillInfo(name="API Docs", scope="project", description="Write API docs", trigger="/api"),
        SkillInfo(name="Auto Only", scope="project", invocation_mode="auto-only"),
    ]
    window = MainWindow(store)
    qtbot.addWidget(window)
    registry = window.workspace.slash_registry

    api = registry.get("api-docs")
    assert api is not None
    assert api.kind == SKILL
    assert api.description == "Write API docs"
    assert registry.get("api") is not None  # the skill's own trigger
    assert registry.get("auto-only") is None

    assert registry.execute("/api-docs").status == EXECUTED
    assert store.skills[0].load_mode == "on"


@pytest.mark.integration
@verifies(SWR.SWR_2442)
def test_the_catalogue_follows_a_skill_rescan(qtbot) -> None:
    store = WorkspaceStore()
    window = MainWindow(store)
    qtbot.addWidget(window)
    assert window.workspace.slash_registry.get("fresh-skill") is None

    store.skills = [SkillInfo(name="Fresh Skill", scope="project")]
    store.library_changed.emit()

    assert window.workspace.slash_registry.get("fresh-skill") is not None


@pytest.mark.integration
@verifies(SWR.SWR_2442)
def test_run_control_commands_drive_the_existing_window_behaviour(qtbot) -> None:
    bridge = FakeRunBridge()
    bridge.running = True
    store = WorkspaceStore()
    store.set_session_status("running")
    window = MainWindow(store, run_bridge=bridge)
    qtbot.addWidget(window)
    window.show_view("workspace")

    assert window.workspace.slash_registry.execute("/pause").status == EXECUTED
    assert bridge.paused == ["orchestrator"]

    store.transcript.append(TranscriptEvent(timestamp="10:00", role="user", text="hi"))
    assert window.workspace.slash_registry.get("clear").is_available() is True
    assert window.workspace.slash_registry.execute("/search").status == EXECUTED
    assert window.workspace.search_panel.isVisibleTo(window.workspace)


# ── integration: submission ───────────────────────────────────────────────


@pytest.mark.integration
@verifies(SWR.SWR_2438)
def test_submitting_a_command_runs_it_instead_of_starting_a_run(qtbot) -> None:
    bridge = FakeRunBridge()
    bridge.running = True
    store = WorkspaceStore()
    store.set_session_status("running")
    window = MainWindow(store, run_bridge=bridge)
    qtbot.addWidget(window)
    window.show_view("workspace")

    window.workspace.composer.setPlainText("/pause")
    qtbot.mouseClick(window.workspace.send_button, Qt.MouseButton.LeftButton)

    assert bridge.paused == ["orchestrator"]
    assert bridge.prompts == []
    assert bridge.queued == {}
    assert window.workspace.composer.toPlainText() == ""


@pytest.mark.integration
@verifies(SWR.SWR_2438)
def test_an_escaped_slash_and_multi_line_text_stay_prompts(qtbot) -> None:
    bridge = FakeRunBridge()
    store = sample_store()
    store.set_session_status("completed")
    window = MainWindow(store, run_bridge=bridge)
    qtbot.addWidget(window)
    window.show_view("workspace")

    window.workspace.composer.setPlainText("/ what does a slash mean here?")
    qtbot.mouseClick(window.workspace.send_button, Qt.MouseButton.LeftButton)
    bridge.running = False  # the second prompt is a fresh run, not a queue entry
    window.workspace.composer.setPlainText("/stop\nand explain why")
    qtbot.mouseClick(window.workspace.send_button, Qt.MouseButton.LeftButton)

    assert bridge.prompts == [
        "/ what does a slash mean here?",
        "/stop\nand explain why",
    ]
