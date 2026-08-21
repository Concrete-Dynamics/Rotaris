"""Background terminal session pool.

A self-contained, thread-safe pool of long-running background subprocesses used by
the hardened terminal tool. Each :class:`TerminalBgSession` wraps a single subprocess
with its own output-reader thread and timeout timer; :class:`TerminalSessionRegistry`
owns the collection and enforces the per-pool session cap.

This module deliberately has no dependency on the OpenHands SDK terminal types so the
session pool can be imported and tested in isolation.
"""

from __future__ import annotations

import hashlib
import os
import signal
import subprocess
import threading
import time
from contextlib import suppress
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Literal

from openhands.sdk.logger import get_logger

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Callable

_log = get_logger(__name__)

_TIMEOUT_EXIT_CODE = 124
_MAX_BG_OUTPUT_SIZE = 1_000_000  # 1 MB per background session
_BG_SESSION_ID_PREFIX = "ts_"
_BG_KILL_GRACE_SECONDS = 5

BgSessionStatus = Literal["running", "completed", "killed", "failed", "timeout"]


@dataclass
@traces(SWR.SWR_508, SWR.SWR_513, SWR.SWR_514)
class TerminalBgSession:
    """A single background terminal session wrapping a subprocess."""

    session_id: str
    process: subprocess.Popen[bytes]
    command: str
    working_dir: str
    started_at: datetime

    status: BgSessionStatus = "running"
    exit_code: int | None = None

    output_buffer: str = ""
    read_cursor: int = 0

    timeout: float | None = None
    _output_thread: threading.Thread | None = field(default=None, repr=False)
    _timer: threading.Timer | None = field(default=None, repr=False)
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)
    #: Called with each decoded chunk as it is read, and once with the exit code
    #: when the process ends (SWR-3618).  Plain callables rather than a hub
    #: reference so this module keeps its independence from the streaming stack
    #: and stays testable on its own.
    _on_output: Callable[[str], None] | None = field(default=None, repr=False)
    _on_exit: Callable[[int | None], None] | None = field(default=None, repr=False)

    @traces(SWR.SWR_3618)
    def observe(
        self,
        on_output: Callable[[str], None] | None = None,
        on_exit: Callable[[int | None], None] | None = None,
    ) -> None:
        """Stream this session's output somewhere as well as buffering it."""
        self._on_output = on_output
        self._on_exit = on_exit

    def _notify_output(self, chunk: str) -> None:
        observer = self._on_output
        if observer is None or not chunk:
            return
        try:
            observer(chunk)
        except Exception:  # noqa: BLE001 - a broken display must not stop the reader
            _log.debug("Background session %s output observer failed", self.session_id)

    def _notify_exit(self) -> None:
        observer = self._on_exit
        if observer is None:
            return
        self._on_exit = None
        try:
            observer(self.exit_code)
        except Exception:  # noqa: BLE001 - a broken display must not stop teardown
            _log.debug("Background session %s exit observer failed", self.session_id)

    def start_reader(self) -> None:
        """Start the background output-reader thread."""
        self._output_thread = threading.Thread(target=self._read_output, daemon=True)
        self._output_thread.start()

    def start_timeout_timer(self, timeout_seconds: float) -> None:
        """Start a timer that will kill the process after the timeout."""
        self._timer = threading.Timer(timeout_seconds, self._on_timeout)
        self._timer.daemon = True
        self._timer.start()

    def _read_output(self) -> None:
        """Read stdout/stderr line-by-line until process exits."""
        try:
            assert self.process.stdout is not None
            for line in iter(self.process.stdout.readline, b""):
                with self._lock:
                    decoded = line.decode("utf-8", errors="replace")
                    self.output_buffer += decoded
                    # Truncate from beginning if over limit
                    if len(self.output_buffer) > _MAX_BG_OUTPUT_SIZE:
                        excess = len(self.output_buffer) - _MAX_BG_OUTPUT_SIZE
                        self.output_buffer = self.output_buffer[excess:]
                        self.read_cursor = max(0, self.read_cursor - excess)
                # Outside the lock: a display's sink may marshal onto another
                # thread, and holding the reader's lock across that would stall
                # the very output it is trying to show.
                self._notify_output(decoded)
        except (ValueError, OSError):
            return  # Process closed the pipe
        finally:
            self._wait_for_exit()

    def _wait_for_exit(self) -> None:
        """Wait for the process to exit and record its exit code."""
        with suppress(OSError, subprocess.SubprocessError):
            self.process.wait()
        with self._lock:
            if self.status == "running":
                self.exit_code = self.process.returncode
                self.status = "completed" if self.exit_code == 0 else "failed"
            # Cancel the timer if it hasn't fired
            if self._timer is not None:
                self._timer.cancel()
        self._notify_exit()

    def _await_exit_within_grace(self) -> None:
        """Let a SIGTERM'd process exit on its own, for at most the grace period.

        The grace period is an upper bound, not a fixed pause. A process that honours
        SIGTERM is usually gone within milliseconds, and sleeping the full
        :data:`_BG_KILL_GRACE_SECONDS` regardless meant every ``kill``/``timeout`` --
        including the ones the agent triggers to reclaim a session it no longer needs --
        blocked five seconds after the work was already over. Waiting *for the exit*
        keeps the same contract (SIGTERM first, SIGKILL only for what ignores it) and
        returns as soon as there is nothing left to wait for.
        """
        with suppress(subprocess.TimeoutExpired, OSError, subprocess.SubprocessError):
            self.process.wait(timeout=_BG_KILL_GRACE_SECONDS)

    def _on_timeout(self) -> None:
        """Force-kill the process on timeout."""
        with self._lock:
            if self.status != "running":
                return
        with suppress(OSError, ProcessLookupError):
            self.process.send_signal(signal.SIGTERM)
        # Give it a grace period, then SIGKILL
        self._await_exit_within_grace()
        with suppress(OSError, ProcessLookupError):
            self.process.kill()
        with suppress(OSError, subprocess.SubprocessError):
            self.process.wait()
        with self._lock:
            self.status = "timeout"
            self.exit_code = _TIMEOUT_EXIT_CODE

    def poll_output(self) -> tuple[BgSessionStatus, str]:
        """Return (status, new_output_since_last_poll)."""
        with self._lock:
            new_output = self.output_buffer[self.read_cursor :]
            self.read_cursor = len(self.output_buffer)
            return self.status, new_output

    def send_input(self, data: str) -> None:
        """Write data to the process stdin."""
        try:
            if self.process.stdin is not None:
                self.process.stdin.write(data.encode("utf-8"))
                self.process.stdin.flush()
        except (BrokenPipeError, OSError):
            _log.warning(
                "Failed to send input to session %s (pipe closed)",
                self.session_id,
            )

    def send_signal(self, sig: int) -> None:
        """Send a signal to the process."""
        with suppress(OSError, ProcessLookupError):
            self.process.send_signal(sig)

    def kill(self) -> None:
        """Force-kill the session and return final output."""
        with self._lock:
            if self.status != "running":
                return
        if self._timer is not None:
            self._timer.cancel()
        with suppress(OSError, ProcessLookupError):
            self.process.send_signal(signal.SIGTERM)
        self._await_exit_within_grace()
        with suppress(OSError, ProcessLookupError):
            self.process.kill()
        with suppress(OSError, subprocess.SubprocessError):
            self.process.wait()
        with self._lock:
            self.status = "killed"
            self.exit_code = -1

    def cleanup(self) -> None:
        """Ensure the process and threads are cleaned up."""
        if self._timer is not None:
            self._timer.cancel()
        with self._lock:
            if self.status == "running":
                self.status = "killed"
                self.exit_code = -1
        with suppress(OSError, ProcessLookupError):
            self.process.kill()
        with suppress(OSError, subprocess.TimeoutExpired):
            self.process.wait(timeout=2)


@traces(SWR.SWR_2126)
class TerminalSessionRegistry:
    """Thread-safe registry for background terminal sessions."""

    def __init__(self, max_sessions: int = 20, default_timeout: float = 3600) -> None:
        self._sessions: dict[str, TerminalBgSession] = {}
        self._lock = threading.Lock()
        self._max_sessions = max_sessions
        self._default_timeout = default_timeout

    @property
    def max_sessions(self) -> int:
        return self._max_sessions

    def _generate_session_id(self, command: str) -> str:
        raw = f"{command}{time.monotonic_ns()}"
        digest = hashlib.md5(raw.encode(), usedforsecurity=False).hexdigest()[:8]
        return f"{_BG_SESSION_ID_PREFIX}{digest}"

    def spawn(
        self,
        command: str,
        working_dir: str,
        timeout: float | None = None,
        env: dict[str, str] | None = None,
    ) -> str:
        """Spawn a background process and return its session_id."""
        effective_timeout = timeout if timeout is not None else self._default_timeout

        with self._lock:
            if len(self._sessions) >= self._max_sessions:
                raise RuntimeError(
                    f"Maximum background terminal sessions ({self._max_sessions}) "
                    "reached. Kill or wait for existing sessions before starting new ones.",
                )

            session_id = self._generate_session_id(command)
            # Ensure uniqueness (paranoid collision check)
            while session_id in self._sessions:
                session_id = self._generate_session_id(command + str(time.monotonic_ns()))

            process_env = os.environ.copy()
            if env:
                process_env.update(env)

            try:
                preexec_fn = getattr(os, "setpgrp", None) if os.name != "nt" else None
                process = subprocess.Popen(
                    command,
                    shell=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    stdin=subprocess.PIPE,
                    cwd=working_dir,
                    env=process_env,
                    preexec_fn=preexec_fn,  # Run in a new process group on POSIX.
                )
            except OSError as exc:
                raise RuntimeError(f"Failed to spawn background command: {exc}") from exc

            session = TerminalBgSession(
                session_id=session_id,
                process=process,
                command=command,
                working_dir=working_dir,
                started_at=datetime.now(timezone.utc),  # noqa: UP017
                timeout=effective_timeout,
            )
            self._sessions[session_id] = session

        session.start_reader()
        session.start_timeout_timer(effective_timeout)
        _log.info("Background session %s started: %s", session_id, command)
        return session_id

    @traces(SWR.SWR_3618)
    def session(self, session_id: str) -> TerminalBgSession | None:
        """The session itself, for callers that need to observe or drive it."""
        with self._lock:
            return self._sessions.get(session_id)

    def query(self, session_id: str) -> tuple[BgSessionStatus, str, int | None]:
        """Poll a session for new output. Returns (status, new_output, exit_code)."""
        session = self._sessions.get(session_id)
        if session is None:
            raise ValueError(f"Unknown background session: {session_id!r}")
        status, output = session.poll_output()
        return status, output, session.exit_code

    def kill(self, session_id: str) -> tuple[BgSessionStatus, str, int | None]:
        """Kill a background session and return final output."""
        session = self._sessions.get(session_id)
        if session is None:
            raise ValueError(f"Unknown background session: {session_id!r}")
        session.kill()
        status, output = session.poll_output()
        return status, output, session.exit_code

    def send_input(self, session_id: str, data: str) -> None:
        """Send stdin data to a background session."""
        session = self._sessions.get(session_id)
        if session is None:
            raise ValueError(f"Unknown background session: {session_id!r}")
        session.send_input(data)

    def send_signal(self, session_id: str, sig: int) -> None:
        """Send a signal to a background session."""
        session = self._sessions.get(session_id)
        if session is None:
            raise ValueError(f"Unknown background session: {session_id!r}")
        session.send_signal(sig)

    def list_sessions(self) -> list[dict[str, Any]]:
        """Return summary info for all active sessions."""
        result: list[dict[str, Any]] = []
        with self._lock:
            for session in self._sessions.values():
                result.append(
                    {
                        "session_id": session.session_id,
                        "command": session.command,
                        "status": session.status,
                        "exit_code": session.exit_code,
                        "started_at": session.started_at.isoformat(),
                    },
                )
        return result

    def get_active_session_ids(self) -> list[str]:
        """Return IDs of sessions still in 'running' state."""
        with self._lock:
            return [sid for sid, s in self._sessions.items() if s.status == "running"]

    def cleanup(self) -> None:
        """Kill all sessions and clean up resources."""
        with self._lock:
            sessions = list(self._sessions.values())
            self._sessions.clear()
        for session in sessions:
            session.cleanup()

    def __del__(self) -> None:
        with suppress(Exception):
            self.cleanup()
