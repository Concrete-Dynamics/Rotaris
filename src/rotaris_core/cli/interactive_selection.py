from __future__ import annotations

import sys
from collections.abc import Callable
from typing import Any, Literal, TextIO, cast

from rotaris_core.reqtocode import SWR, traces

NavigationKey = Literal["up", "down", "enter", "escape", "cancel", "other"]
RenderSelection = Callable[[str, list[str], int], None]
ReadNavigationKey = Callable[[], NavigationKey]

_TITLE = "\x1b[1;36m"
_SELECTED = "\x1b[1;32m"
_UNSELECTED = "\x1b[2;37m"
_RESET = "\x1b[0m"
_SELECTED_PREFIX_FRAMES = (">>", "> ")


@traces(SWR.SWR_730)
def prompt_for_selection(
    title: str,
    options: list[tuple[str, str]],
    *,
    read_key: ReadNavigationKey | None = None,
    render: RenderSelection | None = None,
) -> str | None:
    if not options:
        return None

    selected_index = 0
    labels = [label for _, label in options]
    active_render = render or _AnsiSelectionRenderer(sys.stdout)
    active_read_key = read_key or _read_navigation_key
    active_render(title, labels, selected_index)

    try:
        while True:
            key = active_read_key()
            if key == "up":
                selected_index = (selected_index - 1) % len(options)
                active_render(title, labels, selected_index)
                continue
            if key == "down":
                selected_index = (selected_index + 1) % len(options)
                active_render(title, labels, selected_index)
                continue
            if key == "enter":
                return options[selected_index][0]
            if key in {"escape", "cancel"}:
                return None
    finally:
        if isinstance(active_render, _AnsiSelectionRenderer):
            active_render.finish()


def is_interactive_terminal() -> bool:
    return sys.stdin.isatty() and sys.stdout.isatty()


class _AnsiSelectionRenderer:
    def __init__(self, stream: TextIO) -> None:
        self._stream = stream
        self._line_count = 0
        self._cursor_hidden = False
        self._frame_index = 0

    def __call__(self, title: str, labels: list[str], selected_index: int) -> None:
        selected_prefix = _SELECTED_PREFIX_FRAMES[self._frame_index % len(_SELECTED_PREFIX_FRAMES)]
        self._frame_index += 1
        lines = [
            (f"{_TITLE}{title} (Use Up/Down, Enter to confirm, Esc to cancel){_RESET}"),
            *[
                self._render_option(
                    label=label,
                    selected=index == selected_index,
                    selected_prefix=selected_prefix,
                )
                for index, label in enumerate(labels)
            ],
        ]
        if self._line_count:
            self._stream.write(f"\x1b[{self._line_count}F")
        else:
            self._stream.write("\x1b[?25l")
            self._cursor_hidden = True
        for line in lines:
            self._stream.write("\x1b[2K\r")
            self._stream.write(line)
            self._stream.write("\n")
        self._stream.flush()
        self._line_count = len(lines)

    def finish(self) -> None:
        if self._line_count:
            self._stream.write("\x1b[2K\r")
            self._stream.write("\n")
        if self._cursor_hidden:
            self._stream.write("\x1b[?25h")
        self._stream.flush()
        self._line_count = 0
        self._cursor_hidden = False

    def _render_option(
        self,
        *,
        label: str,
        selected: bool,
        selected_prefix: str,
    ) -> str:
        if selected:
            return f"{_SELECTED}{selected_prefix} {label}{_RESET}"
        return f"{_UNSELECTED}   {label}{_RESET}"


def _read_navigation_key() -> NavigationKey:
    if sys.platform == "win32":
        import msvcrt

        raw = msvcrt.getwch()
        if raw in {"\r", "\n"}:
            return "enter"
        if raw in {"\x03", "\x04"}:
            return "cancel"
        if raw == "\x1b":
            return "escape"
        if raw in {"\x00", "\xe0"}:
            extended = msvcrt.getwch()
            win_navigation_keys: dict[str, NavigationKey] = {"H": "up", "P": "down"}
            win_nav = win_navigation_keys.get(extended, "other")
            return win_nav
        return "other"

    import termios
    import tty

    stream = sys.stdin
    fd = stream.fileno()
    termios_api = cast("Any", termios)
    tty_api = cast("Any", tty)
    tcgetattr = termios_api.tcgetattr
    tcsetattr = termios_api.tcsetattr
    tcsadrain = termios_api.TCSADRAIN
    setraw = tty_api.setraw
    previous = tcgetattr(fd)
    try:
        setraw(fd)
        raw = stream.read(1)
        if raw in {"\x03", "\x04"}:
            return "cancel"
        if raw in {"\r", "\n"}:
            return "enter"
        if raw == "\x1b":
            next_char = stream.read(1)
            if next_char != "[":
                return "escape"
            unix_navigation_keys: dict[str, NavigationKey] = {"A": "up", "B": "down"}
            unix_nav = unix_navigation_keys.get(stream.read(1), "other")
            return unix_nav
        return "other"
    finally:
        tcsetattr(fd, tcsadrain, previous)
