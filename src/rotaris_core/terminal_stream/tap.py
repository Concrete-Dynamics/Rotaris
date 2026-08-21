"""Per-backend adapters that sample a live terminal into frames (SWR-3618).

The hardened terminal runs on three backends and only one of them hands out a
byte stream:

* ``SubprocessTerminal`` keeps every decoded PTY chunk in ``output_buffer``,
  carriage returns and SGR escapes intact — a true VT stream.
* ``TmuxTerminal`` owns a pane; the only way to read it is ``capture-pane``,
  which returns an already-rendered screen.
* ``WindowsTerminal`` reads PowerShell's pipes and can only be screen-scraped.

Rather than three sampling algorithms, there is one: take a snapshot of
whatever the backend can produce, and diff it against the previous snapshot.
When the new snapshot extends the old one — the overwhelmingly common case,
because terminals mostly append — publish just the suffix as a ``delta``.  When
it does not, the screen was redrawn, cleared or scrolled out of the buffer, so
publish the whole thing as a ``screen`` replacement.  Backends differ only in
how a snapshot is produced.

The tap only ever *reads*.  Nothing it does may change what the agent observes,
and a tap that fails stops streaming for that stream alone rather than failing
the command.
"""

from __future__ import annotations

import logging
import threading
from typing import TYPE_CHECKING, Any

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from rotaris_core.terminal_stream.hub import TerminalStreamHub

_log = logging.getLogger(__name__)

#: How often a tap samples its backend.  100 ms is below the threshold where a
#: person reads output as "stuttering" and far above the cost of a buffer join.
DEFAULT_INTERVAL_S = 0.1

#: Lines of tmux scrollback captured per sample.  A whole 10k-line history
#: re-captured ten times a second would cost more than the feature is worth.
TMUX_CAPTURE_LINES = 500


@traces(SWR.SWR_3618)
class TerminalTap:
    """Samples one terminal backend and publishes what changed.

    Also the input and resize path: the pop-out terminal sends keys through the
    tap rather than reaching into the backend, so every write is serialised
    against every other write to the same terminal.
    """

    def __init__(
        self,
        terminal: Any,
        hub: TerminalStreamHub,
        session_id: str,
        stream_id: str,
        *,
        interval_s: float = DEFAULT_INTERVAL_S,
    ) -> None:
        self._terminal = terminal
        self._hub = hub
        self._session_id = session_id
        self._stream_id = stream_id
        self._interval_s = max(0.01, interval_s)
        self._previous = ""
        self._write_lock = threading.Lock()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._cols, self._rows = self._backend_size()

    # ── lifecycle ────────────────────────────────────────────────────────

    def start(self) -> None:
        """Begin sampling on a daemon thread; harmless to call twice."""
        if self._thread is not None:
            return
        self._stop.clear()
        thread = threading.Thread(
            target=self._sample_loop,
            name=f"terminal-tap-{self._stream_id}",
            daemon=True,
        )
        self._thread = thread
        thread.start()

    def stop(self, *, join_timeout: float = 1.0) -> None:
        """Stop sampling after one final sample, so the tail is never lost."""
        self._stop.set()
        thread = self._thread
        self._thread = None
        if thread is not None and thread.is_alive():
            thread.join(timeout=join_timeout)
        self._sample_once()

    def __enter__(self) -> TerminalTap:
        self.start()
        return self

    def __exit__(self, *_exc: object) -> None:
        self.stop()

    # ── input / resize ───────────────────────────────────────────────────

    def send_keys(self, text: str, *, enter: bool = False) -> None:
        """Forward user input to the backend, one sender at a time.

        Named keys (``C-c``, ``UP``, ``ENTER``…) are the backend's own
        vocabulary, so they pass straight through.
        """
        send = getattr(self._terminal, "send_keys", None)
        if send is None:
            return
        with self._write_lock:
            send(text, enter)

    def resize(self, cols: int, rows: int) -> bool:
        """Resize the backend's terminal where the platform allows it.

        Returns True when the backend was actually resized.  A no-op elsewhere:
        a PowerShell pipe has no window size to set, and pretending otherwise
        would make the emulator and the process disagree silently.
        """
        if cols <= 0 or rows <= 0:
            return False
        self._cols, self._rows = cols, rows
        with self._write_lock:
            try:
                return _resize_backend(self._terminal, cols, rows)
            except Exception:  # noqa: BLE001 - resizing is best effort
                _log.debug("Terminal resize failed for %s", self._stream_id, exc_info=True)
                return False

    # ── sampling ─────────────────────────────────────────────────────────

    def _sample_loop(self) -> None:
        while not self._stop.wait(self._interval_s):
            self._sample_once()

    def _sample_once(self) -> None:
        try:
            snapshot = self._snapshot()
        except Exception:  # noqa: BLE001 - streaming must never fail a command
            _log.debug("Terminal tap sample failed for %s", self._stream_id, exc_info=True)
            self._stop.set()
            return
        if snapshot is None or snapshot == self._previous:
            return
        previous = self._previous
        self._previous = snapshot
        if previous and snapshot.startswith(previous):
            self._publish("delta", snapshot[len(previous) :])
        else:
            self._publish("screen", snapshot)

    def _publish(self, kind: str, data: str) -> None:
        if not data:
            return
        self._hub.publish(
            self._session_id,
            self._stream_id,
            kind,  # type: ignore[arg-type]
            data,
            cols=self._cols,
            rows=self._rows,
        )

    def _snapshot(self) -> str | None:
        """Everything the backend can currently show, as one string."""
        buffer = getattr(self._terminal, "output_buffer", None)
        lock = getattr(self._terminal, "output_lock", None)
        if buffer is not None:
            # PTY backend: the reader thread stores raw decoded chunks, so
            # carriage returns and SGR escapes survive — this is the real stream.
            if lock is not None:
                with lock:
                    return "".join(buffer)
            return "".join(buffer)
        pane = getattr(self._terminal, "pane", None)
        if pane is not None:
            return _capture_tmux_pane(pane)
        read_screen = getattr(self._terminal, "read_screen", None)
        if read_screen is None:
            return None
        return str(read_screen())

    def _backend_size(self) -> tuple[int, int]:
        pane = getattr(self._terminal, "pane", None)
        if pane is not None:
            try:
                return int(pane.width or 0), int(pane.height or 0)
            except (TypeError, ValueError):
                return 0, 0
        return 0, 0


@traces(SWR.SWR_3618)
def _capture_tmux_pane(pane: Any) -> str:
    """Capture a pane *with* escape sequences, which the SDK's reader drops.

    ``-e`` keeps SGR so colour survives, ``-J`` rejoins wrapped lines, and the
    history window is bounded because this runs on every sample.
    """
    result = pane.cmd("capture-pane", "-e", "-J", "-p", "-S", f"-{TMUX_CAPTURE_LINES}")
    return "\n".join(line.rstrip() for line in result.stdout)


@traces(SWR.SWR_3618)
def _resize_backend(terminal: Any, cols: int, rows: int) -> bool:
    """Set the backend terminal's window size; True when it took effect."""
    pane = getattr(terminal, "pane", None)
    if pane is not None:
        pane.cmd("resize-pane", "-x", str(cols), "-y", str(rows))
        return True
    fd = getattr(terminal, "_pty_master_fd", None)
    if fd is None:
        return False
    try:
        import fcntl
        import struct
        import termios
    except ImportError:  # pragma: no cover - Windows has no termios
        return False
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
    return True


@traces(SWR.SWR_3618)
def tap_for_terminal(
    terminal: Any,
    hub: TerminalStreamHub,
    session_id: str,
    stream_id: str,
    *,
    interval_s: float = DEFAULT_INTERVAL_S,
) -> TerminalTap | None:
    """Build a tap for *terminal*, or ``None`` when nothing can be sampled.

    Returning ``None`` rather than raising is deliberate: an unknown backend
    should cost the user a live preview, not the command.
    """
    if terminal is None:
        return None
    if not any(hasattr(terminal, attr) for attr in ("output_buffer", "pane", "read_screen")):
        return None
    return TerminalTap(terminal, hub, session_id, stream_id, interval_s=interval_s)
