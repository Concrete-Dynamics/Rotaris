"""Session-keyed hub carrying live terminal frames out of the engine (SWR-3617).

Shaped after :mod:`rotaris_core.events.bus` — one registry behind an ``RLock``,
sinks bound late, a session nobody registered is a silent no-op, and a sink that
raises degrades streaming instead of failing the command that produced the
frame.

It is a *separate* registry from the event bus on purpose.  The bus feeds the
JSONL stream headless consumers read; terminal frames arrive ten times a second
and would drown it.

The per-stream replay buffer is what makes a display attaching late — a preview
row scrolled into view, a window opened halfway through a build — show what has
already been printed instead of an empty screen.
"""

from __future__ import annotations

import logging
import time
from collections import deque
from dataclasses import dataclass, field
from threading import RLock
from typing import TYPE_CHECKING, Literal

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Callable, Iterable

_log = logging.getLogger(__name__)

#: What a frame's payload means.  ``delta`` is output appended since the last
#: frame — the true byte stream a pseudo-terminal produces.  ``screen`` is a
#: whole-screen replacement, which is all a tmux pane can be asked for.  ``meta``
#: carries no output; it marks a lifecycle change so a display can react.
type FrameKind = Literal["delta", "screen", "meta"]

#: Default ceiling for one stream's replay buffer.  Chosen so a full screen of
#: scrollback survives without letting a runaway `yes` pin megabytes per stream.
DEFAULT_BUFFER_BYTES = 256 * 1024


@traces(SWR.SWR_3617)
@dataclass(frozen=True, slots=True)
class TerminalFrame:
    """One observation of a terminal's output, as published to a sink."""

    stream_id: str
    seq: int
    kind: FrameKind
    data: str = ""
    cols: int = 0
    rows: int = 0

    @property
    def nbytes(self) -> int:
        return len(self.data)


@traces(SWR.SWR_3617)
@dataclass(slots=True)
class TerminalStreamInfo:
    """What a display needs to label a stream before it has read any frame."""

    stream_id: str
    command: str = ""
    running: bool = True
    started_at: float = 0.0
    exit_code: int | None = None
    #: True once the replay buffer has had to drop frames, so a display can say
    #: "earlier output was dropped" rather than implying it has the whole run.
    truncated: bool = False


@traces(SWR.SWR_3617)
@dataclass(frozen=True, slots=True)
class TerminalStreamControl:
    """How a display talks *back* to one stream.

    A foreground command and a background session are driven through completely
    different machinery — a terminal backend's ``send_keys`` versus a pipe's
    stdin — and the UI should not have to know which it is looking at.  Whoever
    owns the stream registers the callables; the UI only ever asks the hub.
    """

    send_keys: Callable[[str, bool], None]
    resize: Callable[[int, int], bool] | None = None
    interrupt: Callable[[], bool] | None = None
    kill: Callable[[], None] | None = None


@dataclass(slots=True)
class _Stream:
    info: TerminalStreamInfo
    frames: deque[TerminalFrame] = field(default_factory=deque)
    buffered_bytes: int = 0
    next_seq: int = 0


@traces(SWR.SWR_3617)
class TerminalStreamHub:
    """Fan terminal frames from the engine's threads out to one sink per session.

    Every method is safe to call from any thread.  Sinks are snapshotted under
    the lock and invoked outside it: a sink that marshals onto a UI thread can
    block, and holding the registry lock across that would serialize every
    terminal in the process.
    """

    def __init__(self, buffer_bytes: int = DEFAULT_BUFFER_BYTES) -> None:
        self._lock = RLock()
        self._buffer_bytes = max(0, buffer_bytes)
        self._sinks: dict[str, Callable[[TerminalFrame], None]] = {}
        #: session id -> stream id -> stream
        self._streams: dict[str, dict[str, _Stream]] = {}
        #: (session id, stream id) -> how to send input to that stream
        self._controls: dict[tuple[str, str], TerminalStreamControl] = {}

    @property
    def buffer_bytes(self) -> int:
        return self._buffer_bytes

    def set_buffer_bytes(self, buffer_bytes: int) -> None:
        """Retune the replay ceiling; applies to frames buffered from now on."""
        with self._lock:
            self._buffer_bytes = max(0, buffer_bytes)

    # ── sink registry ────────────────────────────────────────────────────

    def register_sink(self, session_id: str, sink: Callable[[TerminalFrame], None]) -> None:
        """Publish where one session's terminal frames go; replaces any previous."""
        if not session_id:
            raise ValueError("A terminal stream sink needs a non-empty session id.")
        with self._lock:
            self._sinks[session_id] = sink

    def discard_sink(self, session_id: str | None) -> None:
        """Stop delivering frames for *session_id*; buffered history is kept."""
        if not session_id:
            return
        with self._lock:
            self._sinks.pop(session_id, None)

    def has_sink(self, session_id: str | None) -> bool:
        """True when someone is listening — lets a tap skip work nobody wants."""
        if not session_id:
            return False
        with self._lock:
            return session_id in self._sinks

    def reset(self) -> None:
        """Clear every registration and buffer (test isolation, shutdown)."""
        with self._lock:
            self._sinks.clear()
            self._streams.clear()
            self._controls.clear()

    # ── stream lifecycle ─────────────────────────────────────────────────

    def open_stream(
        self,
        session_id: str,
        stream_id: str,
        *,
        command: str = "",
        started_at: float | None = None,
    ) -> TerminalStreamInfo:
        """Declare a stream so a display can list it before output arrives."""
        with self._lock:
            streams = self._streams.setdefault(session_id, {})
            existing = streams.get(stream_id)
            if existing is not None:
                existing.info.command = command or existing.info.command
                existing.info.running = True
                existing.info.exit_code = None
                info = existing.info
            else:
                info = TerminalStreamInfo(
                    stream_id=stream_id,
                    command=command,
                    started_at=started_at if started_at is not None else time.time(),
                )
                streams[stream_id] = _Stream(info=info)
        self._publish_meta(session_id, stream_id)
        return info

    def close_stream(
        self,
        session_id: str,
        stream_id: str,
        *,
        exit_code: int | None = None,
    ) -> None:
        """Mark a stream ended so displays stop offering input for it."""
        with self._lock:
            stream = self._streams.get(session_id, {}).get(stream_id)
            if stream is None:
                return
            stream.info.running = False
            stream.info.exit_code = exit_code
            self._controls.pop((session_id, stream_id), None)
        self._publish_meta(session_id, stream_id)

    def open_streams(self, session_id: str | None) -> list[TerminalStreamInfo]:
        """Every stream this session has opened, oldest first."""
        if not session_id:
            return []
        with self._lock:
            streams = self._streams.get(session_id, {})
            return [
                TerminalStreamInfo(
                    stream_id=s.info.stream_id,
                    command=s.info.command,
                    running=s.info.running,
                    started_at=s.info.started_at,
                    exit_code=s.info.exit_code,
                    truncated=s.info.truncated,
                )
                for s in streams.values()
            ]

    def forget_session(self, session_id: str | None) -> None:
        """Drop a finished session's buffers; the sink is discarded separately."""
        if not session_id:
            return
        with self._lock:
            self._streams.pop(session_id, None)

    # ── talking back to a stream ─────────────────────────────────────────

    def register_control(
        self,
        session_id: str,
        stream_id: str,
        control: TerminalStreamControl,
    ) -> None:
        """Declare how input reaches this stream, for as long as it is live."""
        if not session_id or not stream_id:
            return
        with self._lock:
            self._controls[(session_id, stream_id)] = control

    def discard_control(self, session_id: str, stream_id: str) -> None:
        """Forget a stream's input path once it can no longer accept input."""
        with self._lock:
            self._controls.pop((session_id, stream_id), None)

    def resolve_control(
        self,
        session_id: str | None,
        stream_id: str,
    ) -> TerminalStreamControl | None:
        """The stream's input path, or ``None`` when it accepts no input."""
        if not session_id:
            return None
        with self._lock:
            return self._controls.get((session_id, stream_id))

    def send_keys(
        self,
        session_id: str | None,
        stream_id: str,
        text: str,
        *,
        enter: bool = False,
    ) -> bool:
        """Forward user input; False when the stream can no longer take it.

        Typing into a command that has already ended is an ordinary race — the
        user pressed a key as the process exited — not an error.
        """
        control = self.resolve_control(session_id, stream_id)
        if control is None:
            return False
        try:
            control.send_keys(text, enter)
        except Exception:  # noqa: BLE001 - a dead terminal must not raise at the UI
            _log.debug("Terminal input for %s failed", stream_id, exc_info=True)
            return False
        return True

    def resize(self, session_id: str | None, stream_id: str, cols: int, rows: int) -> bool:
        """Resize the backing terminal; False when the platform cannot."""
        control = self.resolve_control(session_id, stream_id)
        if control is None or control.resize is None:
            return False
        try:
            return control.resize(cols, rows)
        except Exception:  # noqa: BLE001 - resizing is best effort
            _log.debug("Terminal resize for %s failed", stream_id, exc_info=True)
            return False

    # ── publish / replay ─────────────────────────────────────────────────

    def publish(
        self,
        session_id: str | None,
        stream_id: str,
        kind: FrameKind,
        data: str,
        *,
        cols: int = 0,
        rows: int = 0,
    ) -> TerminalFrame | None:
        """Buffer a frame and hand it to the session's sink, if any.

        Returns the frame that was buffered, or ``None`` when there was nothing
        to publish.  Frames are buffered even with no sink registered, so a
        display that attaches later still replays what it missed.
        """
        if not session_id or not stream_id:
            return None
        with self._lock:
            streams = self._streams.setdefault(session_id, {})
            stream = streams.get(stream_id)
            if stream is None:
                stream = _Stream(info=TerminalStreamInfo(stream_id=stream_id))
                stream.info.started_at = time.time()
                streams[stream_id] = stream
            frame = TerminalFrame(
                stream_id=stream_id,
                seq=stream.next_seq,
                kind=kind,
                data=data,
                cols=cols,
                rows=rows,
            )
            stream.next_seq += 1
            self._buffer(stream, frame)
            sink = self._sinks.get(session_id)
        if sink is not None:
            self._deliver(sink, session_id, frame)
        return frame

    def replay(self, session_id: str | None, stream_id: str) -> list[TerminalFrame]:
        """Everything still buffered for a stream, in publication order."""
        if not session_id:
            return []
        with self._lock:
            stream = self._streams.get(session_id, {}).get(stream_id)
            return list(stream.frames) if stream is not None else []

    # ── internals ────────────────────────────────────────────────────────

    def _buffer(self, stream: _Stream, frame: TerminalFrame) -> None:
        """Append under the buffer ceiling, dropping the oldest frames first.

        A ``screen`` frame replaces the whole screen, so every frame before it is
        already redundant — keeping them would only waste the budget.
        """
        if self._buffer_bytes <= 0:
            return
        if frame.kind == "screen":
            stream.frames.clear()
            stream.buffered_bytes = 0
        if frame.kind == "meta":
            return
        stream.frames.append(frame)
        stream.buffered_bytes += frame.nbytes
        while stream.frames and stream.buffered_bytes > self._buffer_bytes:
            dropped = stream.frames.popleft()
            stream.buffered_bytes -= dropped.nbytes
            stream.info.truncated = True

    def _publish_meta(self, session_id: str, stream_id: str) -> None:
        with self._lock:
            sink = self._sinks.get(session_id)
            stream = self._streams.get(session_id, {}).get(stream_id)
            if stream is None:
                return
            frame = TerminalFrame(stream_id=stream_id, seq=stream.next_seq, kind="meta")
            stream.next_seq += 1
        if sink is not None:
            self._deliver(sink, session_id, frame)

    def _deliver(
        self,
        sink: Callable[[TerminalFrame], None],
        session_id: str,
        frame: TerminalFrame,
    ) -> None:
        try:
            sink(frame)
        except Exception:  # noqa: BLE001 - a broken display must not fail the run
            _log.warning(
                "Terminal stream sink for session %s failed on a %s frame; frame dropped.",
                session_id,
                frame.kind,
                exc_info=True,
            )


_default_hub: TerminalStreamHub | None = None
_default_lock = RLock()


@traces(SWR.SWR_3617)
def default_hub() -> TerminalStreamHub:
    """The process-wide hub.

    Terminal executors are constructed in several spawn paths that do not know
    where output goes, exactly as agents are for the event bus, so the hub is
    resolved from here rather than threaded through every constructor.
    """
    global _default_hub
    with _default_lock:
        if _default_hub is None:
            _default_hub = TerminalStreamHub()
        return _default_hub


@traces(SWR.SWR_3617)
def reset_default_hub() -> None:
    """Clear the process-wide hub (test isolation)."""
    with _default_lock:
        if _default_hub is not None:
            _default_hub.reset()


def frames_to_text(frames: Iterable[TerminalFrame]) -> str:
    """Flatten replayed frames the way a plain-text consumer would read them."""
    out: list[str] = []
    for frame in frames:
        if frame.kind == "screen":
            out = [frame.data]
        elif frame.kind == "delta":
            out.append(frame.data)
    return "".join(out)
