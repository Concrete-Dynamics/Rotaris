"""Productive use: a person reads a running command's screen, not a flattened log.
Expected outcome: the emulated screen resolves what plain text cannot — an overwritten
progress line, colour, a clear, a resize — so the transcript preview and the pop-out
window can never describe the same command differently."""

from __future__ import annotations

import pytest
from rotaris_core.reqtocode import SWR, verifies

from rotaris.models.terminal import TerminalScreen, rows_of, screen_from_text

pytestmark = pytest.mark.unit


@verifies(SWR.SWR_3619)
def test_a_progress_line_that_rewrites_itself_stays_one_line() -> None:
    screen = TerminalScreen(40, 10)

    screen.feed("downloading\r\n")
    screen.feed("  0%\r")
    screen.feed(" 50%\r")
    screen.feed("100%\r\n")

    assert screen.tail_text(10) == ["downloading", "100%"]


@verifies(SWR.SWR_3619)
def test_colour_survives_so_a_failure_still_reads_as_a_failure() -> None:
    screen = TerminalScreen(40, 6)

    screen.feed("\x1b[31mFAILED\x1b[0m tests/test_x.py\r\n")

    row = screen.tail_grid(1)[0]
    coloured = [cell.fg for cell in row if cell.char.strip()]
    assert coloured[:6] == ["red"] * 6
    assert coloured[6:] != ["red"], "the reset must end the colour run"


@verifies(SWR.SWR_3619)
def test_bold_and_underline_are_carried_per_cell() -> None:
    screen = TerminalScreen(20, 4)

    screen.feed("\x1b[1mbold\x1b[0m \x1b[4munder\x1b[0m")

    cells = {cell.char: cell for cell in screen.tail_grid(1)[0] if cell.char.strip()}
    assert cells["b"].bold is True
    assert cells["u"].underscore is True


@verifies(SWR.SWR_3619)
def test_clearing_the_screen_clears_the_preview() -> None:
    screen = TerminalScreen(30, 8)
    screen.feed("noise\r\nmore noise\r\n")

    screen.feed("\x1b[2J\x1b[Hfresh start\r\n")

    assert screen.tail_text(8) == ["fresh start"]


@verifies(SWR.SWR_3619)
def test_a_short_command_occupies_its_own_length_not_the_whole_screen() -> None:
    screen = TerminalScreen(40, 24)

    screen.feed("one\r\ntwo\r\n")

    assert screen.tail_text(12) == ["one", "two"]
    assert rows_of(screen.tail_grid(12)) == ["one", "two"]


@verifies(SWR.SWR_3619)
def test_the_preview_shows_only_the_tail_of_a_long_run() -> None:
    screen = TerminalScreen(40, 30)
    screen.feed("".join(f"line {index}\r\n" for index in range(25)))

    assert screen.tail_text(3) == ["line 22", "line 23", "line 24"]


@verifies(SWR.SWR_3619)
def test_a_whole_screen_frame_replaces_and_a_delta_appends() -> None:
    screen = TerminalScreen(30, 8)

    screen.feed_frame("delta", "first\r\n")
    screen.feed_frame("delta", "second\r\n")
    assert screen.tail_text(8) == ["first", "second"]

    screen.feed_frame("screen", "everything redrawn")
    assert screen.tail_text(8) == ["everything redrawn"]


@verifies(SWR.SWR_3619)
def test_the_revision_moves_only_when_the_screen_does() -> None:
    screen = TerminalScreen(20, 5)
    start = screen.revision

    screen.feed("")
    assert screen.revision == start, "an empty write is not a change"

    screen.feed("something\r\n")
    assert screen.revision > start


@verifies(SWR.SWR_3619)
def test_resizing_reports_whether_anything_changed() -> None:
    screen = TerminalScreen(80, 24)

    assert screen.resize(80, 24) is False
    assert screen.resize(120, 40) is True
    assert (screen.cols, screen.rows) == (120, 40)


@verifies(SWR.SWR_3619)
def test_giving_back_a_row_does_not_throw_away_the_output() -> None:
    # A window that reports one row fewer than the emulator started with used to
    # clip from the top, which silently deleted the only line on the screen.
    screen = TerminalScreen(80, 24)
    screen.feed("1 failed\r\n")

    screen.resize(79, 23)

    assert screen.tail_text(5) == ["1 failed"]


@verifies(SWR.SWR_3619)
def test_a_screen_too_full_to_shrink_keeps_its_most_recent_lines() -> None:
    screen = TerminalScreen(20, 6)
    screen.feed("".join(f"row {index}\r\n" for index in range(6)))

    screen.resize(20, 3)

    assert screen.tail_text(5)[-1] == "row 5", "the newest output must survive"


@verifies(SWR.SWR_3619)
def test_a_finished_command_records_how_it_ended() -> None:
    screen = TerminalScreen(20, 5)

    screen.mark_closed(2)

    assert screen.running is False
    assert screen.exit_code == 2


@verifies(SWR.SWR_3619)
def test_copying_the_terminal_yields_readable_text() -> None:
    screen = TerminalScreen(40, 8, command="pytest")
    screen.feed("2 passed\r\n1 failed\r\n")

    assert screen.text() == "2 passed\n1 failed"


@verifies(SWR.SWR_3619)
def test_a_reloaded_session_renders_its_persisted_output() -> None:
    # A session read back from disk has no live stream, but the row it saved
    # must still read like a terminal rather than like an empty preview.
    screen = screen_from_text("collected 3 items\n3 passed\n")

    assert screen.running is False
    assert screen.tail_text(12) == ["collected 3 items", "3 passed"]
