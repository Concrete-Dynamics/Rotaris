"""Carries live terminal frames from the engine onto the Qt thread (SWR-3619).

The engine publishes frames from whichever thread the command is running on —
a tap's sampler thread, a background session's reader thread.  Qt objects may
only be touched from the GUI thread, so the sink does exactly one thing: emit a
queued signal.  Same discipline the session observer in
:mod:`rotaris.services.run_bridge` already documents, for the same reason.

The bridge owns one :class:`~rotaris.models.terminal.TerminalScreen` per
stream.  That single screen is what both display stages read, which is what
makes the transcript preview and the pop-out window incapable of disagreeing.

It is also where user input is written down.  Keys the user types are not the
agent's tool calls and are deliberately not matched against the terminal
permission patterns (SWR-2502), so the audit log (SWR-2506) is the only record
that they happened at all.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from PySide6.QtCore import QObject, Qt, Signal, Slot
from rotaris_core.reqtocode import SWR, traces

from rotaris.models.terminal import DEFAULT_COLS, DEFAULT_ROWS, TerminalScreen

if TYPE_CHECKING:
    from rotaris_core.terminal_stream.hub import (
        TerminalFrame,
        TerminalStreamHub,
        TerminalStreamInfo,
    )


@traces(SWR.SWR_3619)
class TerminalStreamBridge(QObject):
    """One session's live terminals, projected into screens the views read."""

    #: A stream appeared, or its running/exit state changed.
    stream_changed = Signal(str)
    #: Any screen advanced — the cue for a live repaint.
    screen_updated = Signal(str)
    #: Internal: hops a frame from the engine's thread onto this object's.
    _frame_arrived = Signal(object)

    def __init__(self, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self._frame_arrived.connect(self._apply_frame, Qt.ConnectionType.QueuedConnection)
        self._hub: TerminalStreamHub | None = None
        self._session_id = ""
        self._screens: dict[str, TerminalScreen] = {}
        self._attached: set[str] = set()
        #: Highest frame sequence already fed into each screen, so replay and
        #: live delivery cannot both apply the same output.
        self._applied_seq: dict[str, int] = {}
        #: Typed characters not yet written to the audit log, per stream.  A
        #: line is the grain a shell works in; a held key would otherwise write
        #: one audit entry per repeat.
        self._pending_input: dict[str, list[str]] = {}

    # ── attachment ───────────────────────────────────────────────────────

    @property
    def session_id(self) -> str:
        return self._session_id

    def attach(self, hub: TerminalStreamHub, session_id: str) -> None:
        """Follow *session_id*'s terminals; replaces any previous attachment."""
        if not session_id:
            return
        self.detach()
        self._hub = hub
        self._session_id = session_id
        hub.register_sink(session_id, self._on_frame_offthread)
        for info in hub.open_streams(session_id):
            self._ensure_screen(info.stream_id, info)

    def detach(self) -> None:
        """Stop following the current session; keeps screens for reading."""
        if self._hub is not None and self._session_id:
            self._hub.discard_sink(self._session_id)
        self._hub = None
        self._session_id = ""

    def clear(self) -> None:
        """Drop every screen — a new run starts with no terminals."""
        self.detach()
        self._screens.clear()
        self._attached.clear()
        self._applied_seq.clear()
        self._pending_input.clear()

    # ── reading ──────────────────────────────────────────────────────────

    def screen(self, stream_id: str) -> TerminalScreen | None:
        """The emulated screen for *stream_id*, attaching to it if needed.

        Attaching replays whatever the hub still holds, so a preview scrolled
        into view — or a window opened halfway through a build — shows what has
        already been printed instead of a blank screen.
        """
        screen = self._screens.get(stream_id)
        if screen is None:
            screen = self._ensure_screen(stream_id)
        if screen is not None and stream_id not in self._attached:
            self._replay(stream_id, screen)
        return screen

    def peek(self, stream_id: str) -> TerminalScreen | None:
        """The screen for *stream_id* if one already exists — never creates one.

        The transcript delegate folds a screen's revision into its cache key, so
        it asks about streams on every repaint.  Answering that question must
        not bring a stream into being: a session loaded from disk would sprout
        screens that look live for commands that ended hours ago.
        """
        return self._screens.get(stream_id)

    def known_streams(self) -> list[str]:
        """Every stream this bridge has a screen for, oldest first."""
        return list(self._screens)

    def stream_info(self, stream_id: str) -> TerminalStreamInfo | None:
        if self._hub is None:
            return None
        for info in self._hub.open_streams(self._session_id):
            if info.stream_id == stream_id:
                return info
        return None

    def live_stream_count(self) -> int:
        """How many terminals are still running — what the toolbar counts."""
        if self._hub is None:
            return 0
        return sum(1 for info in self._hub.open_streams(self._session_id) if info.running)

    # ── writing back ─────────────────────────────────────────────────────

    def send_keys(self, stream_id: str, text: str, *, enter: bool = False) -> bool:
        """Forward user input; False when the stream no longer accepts it."""
        if self._hub is None or not self._session_id:
            return False
        sent = self._hub.send_keys(self._session_id, stream_id, text, enter=enter)
        if sent:
            self._note_input(stream_id, text, enter=enter)
        return sent

    def resize(self, stream_id: str, cols: int, rows: int) -> bool:
        """Resize the emulated screen and, where possible, the real terminal."""
        screen = self._screens.get(stream_id)
        if screen is not None:
            screen.resize(cols, rows)
        if self._hub is None or not self._session_id:
            return False
        return self._hub.resize(self._session_id, stream_id, cols, rows)

    def interrupt(self, stream_id: str) -> bool:
        """Ctrl-C, without arming take-control: an unambiguous intent."""
        return self.send_keys(stream_id, "C-c")

    def kill(self, stream_id: str) -> bool:
        """Terminate the process behind a stream where the stream supports it."""
        if self._hub is None or not self._session_id:
            return False
        control = self._hub.resolve_control(self._session_id, stream_id)
        if control is None or control.kill is None:
            return False
        control.kill()
        self.record_user_action(stream_id, "killed the process")
        return True

    def can_take_input(self, stream_id: str) -> bool:
        """True when this stream has somewhere to put a keystroke."""
        if self._hub is None or not self._session_id:
            return False
        return self._hub.resolve_control(self._session_id, stream_id) is not None

    # ── audit trail (SWR-2506) ───────────────────────────────────────────

    @traces(SWR.SWR_2428, SWR.SWR_2506)
    def record_user_action(self, stream_id: str, action: str) -> None:
        """Write one user-originated terminal action to the session audit log.

        Taking control, releasing it, interrupting and killing are decisions a
        person made about the agent's process.  They never pass the permission
        engine — that is the point of them — so this log is the only place they
        are recorded.
        """
        self._flush_input(stream_id)
        self._audit(stream_id, action)

    def _note_input(self, stream_id: str, text: str, *, enter: bool) -> None:
        """Accumulate typed input, writing it down one submitted line at a time."""
        if text.startswith("C-"):
            self._flush_input(stream_id)
            self._audit(stream_id, f"sent {text}")
            return
        pending = self._pending_input.setdefault(stream_id, [])
        if text == "BS":
            if pending:
                pending.pop()
        elif len(text) == 1:
            pending.append(text)
        elif text not in ("ENTER", ""):
            # Arrows, tab, paging: navigation within the line the user is
            # composing.  The submitted line is what the audit trail is for.
            return
        if enter or text == "ENTER":
            self._flush_input(stream_id)

    def _flush_input(self, stream_id: str) -> None:
        line = "".join(self._pending_input.pop(stream_id, []))
        if line.strip():
            self._audit(stream_id, f"typed {line}")

    def _audit(self, stream_id: str, action: str) -> None:
        if not self._session_id:
            return
        from rotaris_core.permissions.approval import redact_secrets
        from rotaris_core.permissions.audit import resolve_audit_session
        from rotaris_core.session.diagnostics import record_permission_decision

        session_dir = resolve_audit_session(self._session_id)
        if session_dir is None:
            return
        screen = self._screens.get(stream_id)
        command = redact_secrets(screen.command if screen else "")
        detail = redact_secrets(action)
        summary = f"terminal {stream_id}: {detail}"
        if command:
            summary = f"{summary} (in: {command})"
        record_permission_decision(
            session_dir,
            session_id=self._session_id,
            agent_id=stream_id.partition(":")[2] or stream_id,
            persona="",
            tool_name="terminal",
            decision="user-input",
            rule_id="",
            source="user",
            summary=summary,
            reason="The user acted in the terminal directly; no policy applies.",
        )

    # ── frame plumbing ───────────────────────────────────────────────────

    def _on_frame_offthread(self, frame: TerminalFrame) -> None:
        """Runs on the engine's thread — marshal and return immediately.

        Emitting across a queued connection is the whole point: a slow repaint
        can never stall the command producing the output.
        """
        self._frame_arrived.emit(frame)

    @Slot(object)
    def _apply_frame(self, frame: Any) -> None:
        stream_id = str(getattr(frame, "stream_id", ""))
        if not stream_id:
            return
        screen = self._screens.get(stream_id) or self._ensure_screen(stream_id)
        if screen is None:
            return
        kind = str(getattr(frame, "kind", ""))
        if kind == "meta":
            # Lifecycle only, and idempotent — a repeat is harmless, so it is
            # not gated by the watermark below.
            self._sync_info(stream_id, screen)
            self.stream_changed.emit(stream_id)
            return
        seq = int(getattr(frame, "seq", 0))
        # Creating a screen replays the hub's buffer, so a frame that arrives
        # after its own replay must not be applied a second time — that is what
        # turned one line of output into two.
        if seq <= self._applied_seq.get(stream_id, -1):
            return
        self._applied_seq[stream_id] = seq
        screen.feed_frame(kind, str(getattr(frame, "data", "")))
        self.screen_updated.emit(stream_id)

    def _ensure_screen(
        self,
        stream_id: str,
        info: TerminalStreamInfo | None = None,
    ) -> TerminalScreen | None:
        screen = self._screens.get(stream_id)
        if screen is not None:
            return screen
        resolved = info or self.stream_info(stream_id)
        if resolved is None:
            # A stream the hub does not know is a stream that no longer exists —
            # a row from a reloaded session, say.  Inventing a screen for it
            # would present a finished command as a running one.
            return None
        screen = TerminalScreen(DEFAULT_COLS, DEFAULT_ROWS, command=resolved.command)
        self._screens[stream_id] = screen
        self._replay(stream_id, screen)
        self._sync_info(stream_id, screen, resolved)
        self.stream_changed.emit(stream_id)
        return screen

    def _replay(self, stream_id: str, screen: TerminalScreen) -> None:
        self._attached.add(stream_id)
        if self._hub is None or not self._session_id:
            return
        applied = self._applied_seq.get(stream_id, -1)
        for frame in self._hub.replay(self._session_id, stream_id):
            if frame.seq <= applied:
                continue
            screen.feed_frame(frame.kind, frame.data)
            applied = frame.seq
        self._applied_seq[stream_id] = applied

    def _sync_info(
        self,
        stream_id: str,
        screen: TerminalScreen,
        info: TerminalStreamInfo | None = None,
    ) -> None:
        resolved = info or self.stream_info(stream_id)
        if resolved is None:
            return
        screen.command = resolved.command or screen.command
        screen.truncated = resolved.truncated
        if resolved.running:
            screen.running = True
        elif screen.running:
            screen.mark_closed(resolved.exit_code)
