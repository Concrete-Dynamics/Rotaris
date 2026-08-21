"""The liveness probe answers a question and presses no keys.

Every existing test of this probe asserts the *answer*, which is exactly why a
probe with a side effect passed all of them for months: on Windows
``os.kill(pid, 0)`` is ``CTRL_C_EVENT``, so the call generated a real Ctrl+C in
the console and then reported liveness from whether that console API happened to
succeed. The tests below therefore assert the *mechanism* — that the Windows
branch never reaches ``os.kill`` — alongside the answers.

The Windows branch is driven through stubs rather than skipped off-platform. The
branch that was broken is the one most runs never execute, and a test that only
runs where the bug is already visible is not a regression test.
"""

from __future__ import annotations

import ctypes
import gc
import os
import subprocess
import sys
from typing import Any

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session import liveness
from rotaris_core.session.liveness import pid_is_alive
from rotaris_core.session.persistence import SessionPersistence

pytestmark = pytest.mark.unit

_ERROR_ACCESS_DENIED = 5
_ERROR_INVALID_PARAMETER = 87
_ERROR_INVALID_HANDLE = 6
_STILL_ACTIVE = 259


class _FakeKernel32:
    """Just enough of ``kernel32`` to drive every arm of the Windows branch."""

    def __init__(self, *, handle: int, exit_code: int = _STILL_ACTIVE, query_ok: bool = True):
        self._handle = handle
        self._exit_code = exit_code
        self._query_ok = query_ok
        self.closed: list[int] = []

    def OpenProcess(self, access: int, inherit: bool, pid: int) -> int:  # noqa: N802
        return self._handle

    def GetExitCodeProcess(self, handle: Any, out: Any) -> int:  # noqa: N802
        if not self._query_ok:
            return 0
        out[0] = self._exit_code
        return 1

    def CloseHandle(self, handle: Any) -> int:  # noqa: N802
        self.closed.append(handle)
        return 1


def _windows(monkeypatch: pytest.MonkeyPatch, kernel32: _FakeKernel32, error: int = 0) -> None:
    """Take the Windows branch on whatever platform this is running on."""
    monkeypatch.setattr(liveness, "_on_windows", lambda: True)
    monkeypatch.setattr(liveness, "_kernel32", lambda: kernel32)
    monkeypatch.setattr(liveness, "_last_error", lambda: error)


def _forbid_kill(monkeypatch: pytest.MonkeyPatch) -> None:
    """Make any signal from the probe a failure rather than a side effect."""

    def kill(pid: int, sig: int) -> None:
        message = f"the liveness probe signalled pid {pid} with {sig}"
        raise AssertionError(message)

    monkeypatch.setattr(liveness.os, "kill", kill)


def _dead_pid() -> int:
    """A pid nothing is running under: a real child, spawned, waited for, released.

    The handle has to go too — Windows keeps an exited process addressable while
    any handle to it is open.
    """
    process = subprocess.Popen([sys.executable, "-c", "pass"])  # noqa: S603
    process.wait()
    pid = process.pid
    del process
    gc.collect()
    return pid


# ── the mechanism: the Windows branch signals nothing ────────────────────────


@verifies(SWR.SWR_2817)
def test_the_windows_probe_answers_without_signalling_the_process(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a Windows user's desktop asks whether a crashed run is still alive.
    Expected outcome: the answer comes from the process, and no CTRL+C reaches the console
    the app is attached to."""
    kernel32 = _FakeKernel32(handle=0x1234)
    _windows(monkeypatch, kernel32)
    _forbid_kill(monkeypatch)

    assert pid_is_alive(os.getpid()) is True
    assert kernel32.closed == [0x1234], "the process handle has to be released"


@verifies(SWR.SWR_2817)
def test_a_dead_process_is_reported_dead_without_signalling_it(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: the lock reaper meets a lock left by a process that is gone.
    Expected outcome: dead, so the lock is reaped and the user's checkpoints become
    restorable -- and again without a signal."""
    kernel32 = _FakeKernel32(handle=0x1234, exit_code=0)
    _windows(monkeypatch, kernel32)
    _forbid_kill(monkeypatch)

    assert pid_is_alive(4321) is False


# ── the answers, on this platform, for real pids ─────────────────────────────


@verifies(SWR.SWR_2817)
def test_this_process_is_alive_and_a_reaped_one_is_not() -> None:
    """Productive use: the two cases every caller depends on, measured on the real OS.
    Expected outcome: the running interpreter is live, a child that has exited is not."""
    assert pid_is_alive(os.getpid()) is True
    assert pid_is_alive(_dead_pid()) is False


@verifies(SWR.SWR_2817)
@pytest.mark.parametrize("pid", [0, -1, -4321])
def test_a_pid_no_operating_system_hands_out_is_dead(pid: int) -> None:
    """Productive use: a corrupt lock file carrying a nonsensical pid.
    Expected outcome: dead, and in particular never passed to the platform call --
    a negative pid is a process *group* to ``os.kill``."""
    assert pid_is_alive(pid) is False


@verifies(SWR.SWR_2817)
def test_the_lock_reapers_probe_and_this_one_never_disagree(tmp_path: Any) -> None:
    """Productive use: recovery asks the reaper's probe so both answers stay one answer.
    Expected outcome: the same verdict for the same pid, live and dead alike."""
    persistence = SessionPersistence(tmp_path / "sessions")
    for pid in (os.getpid(), _dead_pid(), 0):
        assert persistence._pid_is_alive(pid) is pid_is_alive(pid)  # noqa: SLF001


# ── the direction of every ambiguity: live ───────────────────────────────────


@verifies(SWR.SWR_2817)
def test_a_process_that_cannot_be_opened_reads_as_live(monkeypatch: pytest.MonkeyPatch) -> None:
    """Productive use: a session owned by another user, or by a higher integrity level.
    Expected outcome: live -- refusing to open a process is not evidence it is gone, and
    a false 'dead' lets a restore race a run."""
    _windows(monkeypatch, _FakeKernel32(handle=0), error=_ERROR_ACCESS_DENIED)

    assert pid_is_alive(4321) is True


@verifies(SWR.SWR_2817)
def test_only_an_invalid_parameter_proves_the_process_is_gone(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: the pid in the lock file names nothing at all.
    Expected outcome: dead -- the one unambiguous answer Windows offers here."""
    _windows(monkeypatch, _FakeKernel32(handle=0), error=_ERROR_INVALID_PARAMETER)

    assert pid_is_alive(4321) is False


@verifies(SWR.SWR_2817)
def test_an_unrecognised_open_failure_reads_as_live(monkeypatch: pytest.MonkeyPatch) -> None:
    """Productive use: the probe fails for a reason nobody enumerated.
    Expected outcome: live -- a question that could not be asked is not an answer."""
    _windows(monkeypatch, _FakeKernel32(handle=0), error=_ERROR_INVALID_HANDLE)

    assert pid_is_alive(4321) is True


@verifies(SWR.SWR_2817)
def test_an_unreadable_exit_code_reads_as_live(monkeypatch: pytest.MonkeyPatch) -> None:
    """Productive use: the handle opens but the exit code cannot be read.
    Expected outcome: live, and the handle is still closed."""
    kernel32 = _FakeKernel32(handle=0x99, query_ok=False)
    _windows(monkeypatch, kernel32)

    assert pid_is_alive(4321) is True
    assert kernel32.closed == [0x99]


@verifies(SWR.SWR_2817)
def test_a_probe_that_raises_reads_as_live(monkeypatch: pytest.MonkeyPatch) -> None:
    """Productive use: ctypes itself fails -- a missing export, a refused load.
    Expected outcome: live. The probe never raises out into a caller that was only
    asking a question."""

    def explode() -> Any:
        raise OSError(_ERROR_ACCESS_DENIED, "kernel32 is unavailable")

    monkeypatch.setattr(liveness, "_on_windows", lambda: True)
    monkeypatch.setattr(liveness, "_kernel32", explode)

    assert pid_is_alive(4321) is True


# ── the posix branch keeps its own reading ───────────────────────────────────


@verifies(SWR.SWR_2817)
def test_another_users_process_is_still_a_process_on_posix(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a POSIX session whose pid belongs to another user.
    Expected outcome: live -- ``PermissionError`` proves the process exists."""
    monkeypatch.setattr(liveness, "_on_windows", lambda: False)

    def kill(pid: int, sig: int) -> None:
        raise PermissionError(1, "Operation not permitted")

    monkeypatch.setattr(liveness.os, "kill", kill)

    assert pid_is_alive(4321) is True


@verifies(SWR.SWR_2817)
def test_the_windows_signature_matches_what_kernel32_expects() -> None:
    """Productive use: the real call, not a stub, on the platform that has it.
    Expected outcome: the running process reads as live through the actual kernel32
    binding -- proof the argtypes and the pointer-sized handle are right."""
    if os.name != "nt":
        pytest.skip("kernel32 exists on Windows only")

    library = liveness._kernel32()  # noqa: SLF001

    assert library.OpenProcess.restype is ctypes.c_void_p
    assert liveness._windows_pid_is_alive(os.getpid()) is True  # noqa: SLF001
