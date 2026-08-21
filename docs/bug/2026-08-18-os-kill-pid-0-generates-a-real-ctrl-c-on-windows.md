# `os.kill(pid, 0)` is not a liveness probe on Windows — it presses Ctrl+C

**Status:** Fixed 2026-08-21 — the probe is now
`src/rotaris_core/session/liveness.py`, which never signals on either platform.
The mechanism write-up below is kept in full: it is the reason the POSIX idiom
must not come back. Supersedes the leading hypothesis in
[the Windows job report](2026-08-16-desktop-quality-windows-job-red-on-every-master-run.md).

**Corrected while fixing:** see [What the fix measured](#what-the-fix-measured) —
the *answers* the old probe gave were, on Windows 11 with CPython 3.12, right by
accident far more often than this report assumed. The side effect is the defect;
the wrong answer is a narrower case than "liveness is never measured".

**Found:** 2026-08-18 · **Severity:** High (it is why
`desktop-quality (windows-latest)` cannot stay green, and separately it means
session liveness is never measured on Windows) · **Platform:** Windows only

**Affected requirements:** SWR-2437, SWR-2817

---

## The claim

`SessionPersistence._pid_is_alive` asks whether a process is alive with the POSIX
idiom (`session/persistence.py:213-229`):

```python
def _pid_is_alive(self, pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    ...
```

On Windows that call does not probe anything. It generates a **real Ctrl+C in the
console the process is attached to**.

## Why — from the source, not from inference

`CTRL_C_EVENT` is **0**. Microsoft's own reference for `GenerateConsoleCtrlEvent`:

> | **CTRL_C_EVENT** 0 | Generates a CTRL+C signal. This signal cannot be limited to
> a specific process group. |

CPython dispatches on that value before it ever considers the process handle
(`Modules/posixmodule.c`, `os_kill_impl`, v3.12.11 — the version CI pins):

```c
#else /* !MS_WINDOWS */
    DWORD sig = (DWORD)signal;

#ifdef HAVE_WINDOWS_CONSOLE_IO
    /* Console processes which share a common console can be sent CTRL+C or
       CTRL+BREAK events, provided they handle said events. */
    if (sig == CTRL_C_EVENT || sig == CTRL_BREAK_EVENT) {
        if (GenerateConsoleCtrlEvent(sig, (DWORD)pid) == 0) {
            return PyErr_SetFromWindowsErr(0);
        }
        Py_RETURN_NONE;
    }
#endif /* HAVE_WINDOWS_CONSOLE_IO */

    /* If the signal is outside of what GenerateConsoleCtrlEvent can use,
       attempt to open and terminate the process. */
    HANDLE handle = OpenProcess(PROCESS_ALL_ACCESS, FALSE, (DWORD)pid);
```

So `signal == 0` takes the first branch, always. There are exactly two outcomes,
and neither is the question the caller asked:

* **It succeeds** → a CTRL+C signal is generated, and `os.kill` returns `None`, so
  `_pid_is_alive` answers `True` — without having looked at the process.
* **It fails** → `OSError`, and `_pid_is_alive` answers `False` — again without
  having looked at the process.

The existing comment in `persistence.py` is the tell. It records observing
`ERROR_INVALID_PARAMETER (87)` and `ERROR_BAD_FORMAT (11)` and reads them as
"invalid/nonexistent PID". Those are `GenerateConsoleCtrlEvent` refusing a
process-group id, which says nothing about whether the process exists.

## How that produces the CI symptoms

The desktop suite reaches this from the UI. `CheckpointBridge._on_listed` →
`restore_blocked_reason` → `MainWindow._session_is_running` → `session_is_live` →
`_pid_is_alive`, **on the bridge's worker thread**, while the main thread is
running the test.

And one test hands it the test runner's own pid
(`apps/rotaris/tests/test_stale_session_ui.py:255`):

```python
_write_lock(manager, state.session_id, os.getpid())
```

On Linux that is a genuine no-op existence check and the test asserts what it means
to. On Windows it makes the suite press Ctrl+C on itself. A console control event
is delivered asynchronously, so Python raises `KeyboardInterrupt` in the main thread
at whatever bytecode boundary it reaches next — which is exactly the shape the
Windows report has been describing for ten days without a mechanism:

> The `KeyboardInterrupt` lands at a different, arbitrary point each time — always
> inside Qt widget construction or a test helper, never at a consistent call site.
> That is the shape of an interrupt delivered from outside the running code.

It is delivered from outside the running code. The suite sends it.

Three observed outcomes, all the same cause:

| Symptom | Why |
|---|---|
| `KeyboardInterrupt` at `feedback.py:59`, `splitter.py:72`, `ui_query.py:88` | the interrupt lands wherever the main thread happens to be |
| run stops mid-progress-bar, exit code 1, **no summary line** | the CTRL+C reaches everything sharing the console, the step's process tree included |
| `+++ Timeout +++` inside `qtbot.waitUntil` | the main thread is blocked in Qt's C-level event loop, where a pending Ctrl+C cannot be raised at all, so the wait never returns |

The last row is run [32174806730](https://github.com/theUpsider/Rotaris/actions/runs/32174806730)
(`d791712`, 2026-08-18). Its dump names both halves at once — the worker thread
stopped inside the probe, the main thread stuck in the event loop:

```
  File "...\rotaris_core\session\persistence.py", line 217, in _pid_is_alive
    os.kill(pid, 0)
KeyboardInterrupt
~~~~~~~~~~~~~~~~~~~~~~~~~ Stack of MainThread (4688) ~~~~~~~~~~~~~~~~~~~~~~~~~~
  ...
  File "...\apps\rotaris\tests\test_stale_session_ui.py", line 258, in test_a_session_with_a_live_process_is_still_refused_and_told_why
    _settled_listing(qtbot, window, state.session_id)
  ...
  File "...\pytestqt\qt_compat.py", line 160, in exec
    return obj.exec(*args, **kwargs)
+++++++++++++++++++++++++++++++++++ Timeout +++++++++++++++++++++++++++++++++++
```

## What this corrects

The Windows report's leading hypothesis is that CI's `--timeout=30` is too tight
for the suite's own 30 s waits. That is a real discrepancy and worth closing, but
it is **not the cause**, and raising the cap will not fix the job:

* It does not explain a `KeyboardInterrupt`. `pytest-timeout` does not raise one —
  it prints `+++ Timeout +++` and dumps stacks, which the logs show happening
  *separately*.
* It does not explain the runs that end with **no summary line and no timeout
  banner** at all.
* The wait that timed out is not slow. It never completes, because the thread that
  would complete it has interrupted the process.

Raising the cap converts one failure shape into another. It is still worth doing
for the reason the report gives — CI and the `Makefile` should not disagree — but as
housekeeping, not as the fix.

## The product defect, independent of any test

This is not only a CI problem. On Windows, `_pid_is_alive` never measures liveness,
so everything built on it is wrong there:

* `session_is_live()` answers from whether a console API call happened to succeed.
* `_remove_stale_lock` (`persistence.py:198`) therefore never reaps a stale lock, so
  a user whose Rotaris run crashed cannot restore that session's checkpoints — the
  UI keeps refusing with "the session is still running".
* `GitWorktreeService._remove_stale_integration_lock` (`worktrees.py:545`) has the
  same call and the same consequence: the integration lock is never released.

No Windows user has to run the test suite to meet this.

## What the fix measured

Written after the fix, on Windows 11 Pro 26200 with the pinned CPython, probing
from a process in its own console and process group so any control event stayed
contained. Five pids, old probe versus new:

| pid under test | truth | `os.kill(pid, 0)` | `pid_is_alive` |
|---|---|---|---|
| the probing process itself | live | `True` | `True` |
| a live child sharing console and group | live | `True` | `True` |
| a live child in its own process group | live | `True` | `True` |
| a reaped child | dead | `OSError` winerror 11 → `False` | `False` |
| a pid that never existed | dead | `OSError` winerror 11 → `False` | `False` |

Two things follow, and both correct this report rather than confirming it:

* **The answers were mostly accidentally right.** `GenerateConsoleCtrlEvent`
  refuses a pid that names no process group with `ERROR_BAD_FORMAT (11)`, and
  `_pid_is_alive` mapped that to `False` — which is the right answer for a dead
  pid, arrived at for the wrong reason. So the claim above that
  `_remove_stale_lock` "never reaps a stale lock" on Windows did not reproduce:
  it reaps. What remains true is that a dead pid whose *number* happens to be a
  live process group id answers live, and that no part of the old answer came
  from looking at the process.
* **The self-interrupt did not reproduce locally.** In every one of the five
  cases the probing process observed zero `SIGINT`, including when it signalled
  its own pid with a handler installed and Ctrl+C explicitly re-enabled. The
  evidence for delivery therefore remains the CI stack dump quoted above, which
  names `KeyboardInterrupt` raised inside `os.kill(pid, 0)` at
  `persistence.py:217`. Whatever makes the event land on the runner and not on a
  developer's desktop — console host, session, or job object — is unexplained,
  and is why the new tests assert that the probe *cannot* signal rather than
  trying to observe a signal that is not reliably observable.

The fix is not weakened by either correction. A liveness probe that answers from
whether a console API accepted a process-group id is wrong even when the answer
lands on the right side, and it generates a real console control event to get
there.

## Suggested first moves

1. **Replace the probe with one that works on both platforms.** Keep
   `os.kill(pid, 0)` behind `if os.name != "nt"`, and on Windows ask the OS a
   question instead of signalling: `OpenProcess`/`GetExitCodeProcess` via `ctypes`,
   or `psutil.pid_exists` if a dependency is acceptable. The probe has one caller
   contract already documented in `recovery.py` — every ambiguity answers *live* —
   so the Windows branch should keep that direction.
2. **Do it in both places.** `persistence.py:217` and `worktrees.py:545`.
3. Cover it with a test that asserts the probe never signals — the current tests
   assert the *answer*, which is why a probe with a side effect passed them.
4. Then re-read the Windows job. `test_closing_the_window_stops_the_setup_worker`
   failed as an ordinary assertion in run
   [32176221595](https://github.com/theUpsider/Rotaris/actions/runs/32176221595)
   and the tooltip failure in `test_every_drop_has_a_keyboard_equivalent` is
   recorded in the older report; neither is explained by this, and both were
   invisible while the process was being interrupted underneath them.

## Related code

| File | Concern |
|---|---|
| `src/rotaris_core/session/persistence.py` | `_pid_is_alive` (`:217`); the misread error codes in its comment |
| `src/rotaris_core/session/worktrees.py` | the same call for the integration lock (`:545`) |
| `src/rotaris_core/session/recovery.py` | `session_is_live` and the "ambiguity answers live" contract (`:95`, `:141`) |
| `apps/rotaris/src/rotaris/services/checkpoint_bridge.py` | reaches the probe from a worker thread (`:115`, `:234`) |
| `apps/rotaris/tests/test_stale_session_ui.py` | feeds the runner's own pid to it (`:255`) |
| `tests/integration/test_stale_session_repair.py` | does the same twice (`:185`, `:275`); Linux-only in CI, so it has never shown |
