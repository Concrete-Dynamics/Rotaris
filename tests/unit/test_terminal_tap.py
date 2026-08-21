"""Productive use: a person sees live output from whichever terminal backend the agent got.
Expected outcome: each backend is sampled into frames a display can render, an unchanged
screen costs nothing, and a failing sample degrades the preview rather than the command."""

from __future__ import annotations

import threading
from typing import Any

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.terminal_stream.hub import TerminalStreamHub, frames_to_text
from rotaris_core.terminal_stream.tap import TerminalTap, tap_for_terminal

SESSION = "sess-tap"
STREAM = "fg:root"


class FakePtyTerminal:
    """Stands in for the SDK's PTY backend: raw chunks in a line buffer."""

    def __init__(self) -> None:
        self.output_buffer: list[str] = []
        self.output_lock = threading.Lock()
        self.sent: list[tuple[str, bool]] = []

    def emit(self, text: str) -> None:
        with self.output_lock:
            self.output_buffer.append(text)

    def send_keys(self, text: str, enter: bool = True) -> None:
        self.sent.append((text, enter))


class FakeScrapedTerminal:
    """Stands in for a backend that can only be screen-scraped."""

    def __init__(self, screen: str = "") -> None:
        self.screen = screen

    def read_screen(self) -> str:
        return self.screen


class ExplodingTerminal:
    def read_screen(self) -> str:
        raise OSError("the pane died")


def _tap(terminal: Any, hub: TerminalStreamHub) -> TerminalTap:
    tap = tap_for_terminal(terminal, hub, SESSION, STREAM)
    assert tap is not None
    return tap


@pytest.fixture
def hub() -> TerminalStreamHub:
    return TerminalStreamHub(buffer_bytes=8192)


@verifies(SWR.SWR_3618)
def test_a_pty_backend_publishes_only_what_is_new(hub: TerminalStreamHub) -> None:
    terminal = FakePtyTerminal()
    tap = _tap(terminal, hub)

    terminal.emit("compiling\n")
    tap._sample_once()
    terminal.emit("done\n")
    tap._sample_once()

    frames = hub.replay(SESSION, STREAM)
    assert [frame.kind for frame in frames] == ["screen", "delta"]
    assert frames[-1].data == "done\n", "only the new output is published a second time"
    assert frames_to_text(frames) == "compiling\ndone\n"


@verifies(SWR.SWR_3618)
def test_carriage_returns_survive_so_a_progress_bar_can_redraw(hub: TerminalStreamHub) -> None:
    terminal = FakePtyTerminal()
    tap = _tap(terminal, hub)

    terminal.emit("50%\r")
    tap._sample_once()
    terminal.emit("100%\r\n")
    tap._sample_once()

    assert "\r" in frames_to_text(hub.replay(SESSION, STREAM))


@verifies(SWR.SWR_3618)
def test_an_unchanged_screen_publishes_nothing(hub: TerminalStreamHub) -> None:
    terminal = FakeScrapedTerminal("$ ")
    tap = _tap(terminal, hub)

    tap._sample_once()
    before = len(hub.replay(SESSION, STREAM))
    tap._sample_once()
    tap._sample_once()

    assert len(hub.replay(SESSION, STREAM)) == before


@verifies(SWR.SWR_3618)
def test_a_redrawn_screen_replaces_rather_than_appends(hub: TerminalStreamHub) -> None:
    terminal = FakeScrapedTerminal("line one")
    tap = _tap(terminal, hub)
    tap._sample_once()

    terminal.screen = "a completely different screen"
    tap._sample_once()

    frames = hub.replay(SESSION, STREAM)
    assert frames[-1].kind == "screen"
    assert frames_to_text(frames) == "a completely different screen"


@verifies(SWR.SWR_3618)
def test_a_failing_backend_stops_streaming_and_nothing_else(hub: TerminalStreamHub) -> None:
    tap = _tap(ExplodingTerminal(), hub)

    tap._sample_once()  # must not raise into the command

    assert hub.replay(SESSION, STREAM) == []


@verifies(SWR.SWR_3618)
def test_a_backend_nothing_can_sample_yields_no_tap(hub: TerminalStreamHub) -> None:
    assert tap_for_terminal(object(), hub, SESSION, STREAM) is None
    assert tap_for_terminal(None, hub, SESSION, STREAM) is None


@verifies(SWR.SWR_3618)
def test_typed_keys_reach_the_backend_in_its_own_vocabulary(hub: TerminalStreamHub) -> None:
    terminal = FakePtyTerminal()
    tap = _tap(terminal, hub)

    tap.send_keys("ls -la", enter=True)
    tap.send_keys("C-c")

    assert terminal.sent == [("ls -la", True), ("C-c", False)]


@verifies(SWR.SWR_3618)
def test_a_backend_with_no_window_size_reports_that_it_did_not_resize(
    hub: TerminalStreamHub,
) -> None:
    tap = _tap(FakeScrapedTerminal("$ "), hub)

    assert tap.resize(120, 40) is False
    assert tap.resize(0, 0) is False


@verifies(SWR.SWR_3618)
def test_stopping_a_tap_publishes_the_tail_it_had_not_sampled_yet(
    hub: TerminalStreamHub,
) -> None:
    terminal = FakePtyTerminal()
    tap = _tap(terminal, hub)
    tap.start()
    terminal.emit("last words\n")

    tap.stop(join_timeout=0.5)

    assert "last words" in frames_to_text(hub.replay(SESSION, STREAM))
