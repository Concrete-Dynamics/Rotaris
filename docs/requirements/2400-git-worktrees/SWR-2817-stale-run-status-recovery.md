---
req-id: SWR-2817
status: approved
trace: required
test: required
type: technical
derived-from: SWR-2437
title: "Stale run status detection and repair"
epic: SWR-2400
date: 2026-08-08
---

# SWR-2817 — Stale run status detection and repair

`SessionState.execution_status` is written by the process that owns the run. A
`kill -9`, a lost battery or a crashed desktop app never gets to write the
terminal status, so the snapshot says `"running"` for ever and nothing corrected
it. Three things then break permanently for that workspace: checkpoint restore
(SWR-2437) is refused, because recording the pre-restore safety checkpoint would
race a live run's own snapshot writes; worktree integration is refused, because
`_require_base_not_in_use` reads the status as a claim on the base workspace;
and the session list shows a busy session the user cannot act on.

The liveness signal already exists and the repository already trusts it: every
owned session holds `<session_dir>/lock` containing `{"pid", "acquired_at"}`,
and the persistence layer's lock reaper already reaps a lock whose pid is dead.
This requirement applies that same reasoning to `execution_status`, deliberately
reusing the same probe rather than inventing a second, differently-wrong answer.

## Acceptance criteria

- A session is **live** iff its lock file exists **and** the pid it records is
  alive. It is **stale** iff its `execution_status` is in
  `ACTIVE_EXECUTION_STATUSES` (`starting`, `running`, `background`, `pausing`,
  `cancelling`) and it is not live. A terminal status is never stale, whatever
  the lock says.
- **Every ambiguous case resolves toward "live"**: an unreadable lock, a lock
  without a `pid`, a nonsensical pid, a probe that raises. The two mistakes are
  not symmetric — wrongly calling a live session dead lets a restore race a
  running run and corrupt the file holding the undo history, whereas wrongly
  calling a dead session live merely leaves the user where they already were,
  one explicit repair away from moving.
- Detection is **read-only**. It reads `metadata.json` and the lock file only,
  never a snapshot and never the filesystem in write mode; no read path such as
  `list_sessions` auto-repairs. A read that rewrites the state a user is trying
  to diagnose is a surprise.
- Repair is **explicit** and idempotent: it sets the status to `"interrupted"`
  (an existing `RunStatus` word, and outside `ACTIVE_EXECUTION_STATUSES`, so a
  repaired session is never busy again), flushes the snapshot immediately rather
  than through the debounce, then drops the orphaned lock, and files a
  diagnostics timeline entry naming the previous status and the reason. A second
  call changes nothing. A repair never raises: a session that is live, already
  terminal, unreadable or unwritable is simply left alone.
- Both CLIs expose the repair as `sessions --repair` and mark stale sessions in
  the listing; the desktop treats a stale session as not-running, so checkpoint
  restore becomes available, and repairs it on the user's action.
- The one deliberate exception is `_require_base_not_in_use`, which *skips* a
  stale session without repairing it — refusing every future integration for
  ever is worse, the user has no way to act on it from there, and a precondition
  check has no business rewriting state on disk.

## Known limitations

Shared with the lock reaper this reuses, and stated rather than papered over:

- **Pid recycling.** The operating system may hand a dead session's pid to an
  unrelated process; that session then reads as live and stays stuck until the
  new process exits. This fails toward "live", the safe direction.
- **Shared workspaces.** A session running on another machine against the same
  workspace has a pid that is meaningless locally and will usually read as dead,
  so its status may be repaired while it is in fact running. Rotaris does not
  support two hosts driving one workspace, and the lock file has always had the
  same blind spot.
- **Windows.** The probe is `OpenProcess`/`GetExitCodeProcess`, deliberately not
  `os.kill(pid, 0)`: signal `0` is `CTRL_C_EVENT` there, so the POSIX idiom
  generates a real console control event instead of asking a question. Two
  residues remain, both failing toward live: a process whose exit code happens
  to be `259` (`STILL_ACTIVE`) is indistinguishable from a running one, and a
  pid that cannot be opened for any reason other than
  `ERROR_INVALID_PARAMETER` — including a process still addressable through an
  open handle — reads as live.

Two consequences of introducing `"interrupted"` as a persisted execution status,
noted here rather than fixed:

- `_STATUS_BY_EXECUTION_STATUS` (`run_result.py`) has no `"interrupted"` key, so
  a `RunResult` derived from a repaired session that has no progress file would
  report `RunStatus.ERROR` rather than `RunStatus.INTERRUPTED`. Unreachable
  today — the repaired session's progress file is what a result is derived from
  — but it is a mapping that will be wrong the moment that stops holding.
- `RunUiState.from_backend("interrupted")` falls through to `IDLE`. That is
  correctly *not busy*, which is the property the desktop depends on, but it is
  a lossy label: a session the user killed and one that never ran render alike.

Implementation: `src/rotaris_core/session/liveness.py` (the pid probe itself,
shared with the lock reaper and the worktree integration lock);
`src/rotaris_core/session/recovery.py`;
`SessionManager.is_session_live`; `sessions --repair` in `cli/app.py` and
`cli/argparse_app.py`; `CheckpointBridge.repair_stale_session` in the desktop.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | The probe answers from the process and signals nothing: the Windows branch never reaches `os.kill`, only `ERROR_INVALID_PARAMETER` proves absence, and every other refusal reads as live | `rotaris_core.session.liveness` | `tests/unit/test_pid_liveness.py` |
| Unit | A dead pid or a missing lock is stale; an unreadable lock, a missing pid, a nonsensical pid and a failing probe all report live; a terminal session is never stale; detection writes nothing; repair marks the session interrupted, drops the lock, survives a second crash and is idempotent | `rotaris_core.session.recovery` | `tests/unit/test_session_recovery.py` |
| Integration | A crashed session is named as stale in both CLI listings, stops blocking worktree integration, is cleared once by `--repair`, and can then actually restore its checkpoints; a live or unreadable-lock session is never repaired | CLI `sessions` → `SessionManager` → git seam | `tests/integration/test_stale_session_repair.py` |
| User-flow E2E | A user whose session was killed opens the desktop, is offered the rollback again, and sees the repair announced; a session with a live process is still refused and told why | Public product boundary → user-observable result | `apps/rotaris/tests/test_stale_session_ui.py` |

Derived from: [SWR-2437 — Checkpoint rollback](SWR-2437-checkpoint-rollback.md)

Epic: [Git Worktree Isolation](../2400-git-worktrees.md)
