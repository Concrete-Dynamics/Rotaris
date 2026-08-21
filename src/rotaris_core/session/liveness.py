"""Ask the operating system whether a pid names a live process.

This exists because ``os.kill(pid, 0)`` — the POSIX idiom, and what every call
site here used to inline — is not a probe on Windows. ``signal == 0`` is
``CTRL_C_EVENT``, and CPython's ``os_kill_impl`` dispatches on that value before
it ever opens the process handle, so the call generates a **real CTRL+C in the
console the process is attached to** and then answers from whether that console
API call happened to succeed. Both of its outcomes are wrong: success means
``True`` without having looked at the process, failure means ``False`` without
having looked at the process. On CI's Windows runners the generated event was
observed coming back as a ``KeyboardInterrupt`` raised inside the probe itself,
while the desktop suite's main thread sat in Qt's event loop.

So the platform branch is not a portability nicety; it is the difference between
asking a question and pressing a key. On Windows the question is
``OpenProcess``/``GetExitCodeProcess``, which reads state and signals nothing.

One contract, shared with :mod:`rotaris_core.session.recovery`: **every
ambiguity answers live** (SWR-2817). The two mistakes are not symmetric —
wrongly calling a live session dead lets a restore race a running run and
corrupt the undo history, whereas wrongly calling a dead session live merely
leaves the user one explicit repair away from moving.
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Any

from rotaris_core.reqtocode import SWR, traces

#: Ask only what liveness needs. ``PROCESS_QUERY_LIMITED_INFORMATION`` is
#: granted across integrity levels where ``PROCESS_QUERY_INFORMATION`` is not,
#: so a process the user cannot fully inspect is still answerable.
_PROCESS_QUERY_LIMITED_INFORMATION = 0x1000

_ERROR_INVALID_PARAMETER = 87

#: ``GetExitCodeProcess``' "has not exited" sentinel.
_STILL_ACTIVE = 259


def _on_windows() -> bool:
    """The platform switch, as a function so tests can drive both branches."""
    return os.name == "nt"


@lru_cache(maxsize=1)
def _kernel32() -> Any:
    """``kernel32`` with the signatures spelled out.

    A handle is pointer-sized; leaving ``OpenProcess`` at the default ``c_int``
    return truncates it on 64-bit and the process is never closed.
    """
    import ctypes

    library = ctypes.WinDLL("kernel32", use_last_error=True)
    library.OpenProcess.restype = ctypes.c_void_p
    library.OpenProcess.argtypes = [ctypes.c_ulong, ctypes.c_int, ctypes.c_ulong]
    library.GetExitCodeProcess.restype = ctypes.c_int
    library.GetExitCodeProcess.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_ulong)]
    library.CloseHandle.restype = ctypes.c_int
    library.CloseHandle.argtypes = [ctypes.c_void_p]
    return library


def _last_error() -> int:
    """``GetLastError`` behind a seam — ``ctypes.get_last_error`` is Windows-only.

    Naming it here is what lets the Windows branch's tests run on every
    platform, which matters because the branch that was broken is the one CI
    mostly does not execute.
    """
    import ctypes

    return int(ctypes.get_last_error())


def _posix_pid_is_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        # A process owned by another user is still a process.
        return True
    except OSError:
        return False
    else:
        return True


def _windows_pid_is_alive(pid: int) -> bool:
    import ctypes

    try:
        kernel32 = _kernel32()
        handle = kernel32.OpenProcess(_PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
        if not handle:
            # ERROR_INVALID_PARAMETER is the only unambiguous "no such process"
            # Windows offers here. ERROR_ACCESS_DENIED means the process exists
            # and is not ours to open, and anything else is a question we failed
            # to ask; both answer live.
            return _last_error() != _ERROR_INVALID_PARAMETER
        try:
            exit_code = ctypes.c_ulong()
            if not kernel32.GetExitCodeProcess(handle, ctypes.pointer(exit_code)):
                return True
            return exit_code.value == _STILL_ACTIVE
        finally:
            kernel32.CloseHandle(handle)
    except (OSError, AttributeError, ValueError):
        # A probe that fails cannot prove death.
        return True


@traces(SWR.SWR_2437, SWR.SWR_2817)
def pid_is_alive(pid: int) -> bool:
    """Whether *pid* names a live process, without signalling it.

    A pid no operating system hands out is dead; every other uncertainty is
    live. Never raises.
    """
    if pid <= 0:
        return False
    if _on_windows():
        return _windows_pid_is_alive(pid)
    return _posix_pid_is_alive(pid)
