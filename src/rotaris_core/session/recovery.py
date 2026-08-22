"""Recover sessions left marked as running by a process that died hard.

``SessionState.execution_status`` is written by the process that owns the run.
A ``kill -9``, a lost battery or a crashed desktop app never gets to write the
terminal status, so the snapshot says ``"running"`` for ever. Three things then
break permanently for that workspace: checkpoint restore is refused (recording
the pre-restore safety checkpoint would race a live run's own snapshot writes),
worktree integration is refused (:meth:`GitWorktreeService._require_base_not_in_use`
treats the status as a claim on the base workspace), and the session list shows
a busy session the user cannot act on.

The liveness signal already exists and the repo already trusts it: every owned
session holds ``<session_dir>/lock`` containing ``{"pid", "acquired_at"}``, and
:meth:`SessionPersistence._remove_stale_lock` already reaps a lock whose pid is
dead. This module applies that same reasoning to ``execution_status`` and
deliberately reuses the same probe rather than inventing a second,
differently-wrong answer.

**Every ambiguous case resolves toward "still running".** An unreadable lock, a
lock with no ``pid`` field, a nonsensical pid, a probe that fails: all report
*live*. The two mistakes are not symmetric. Wrongly declaring a live session
dead lets a restore race a running run and corrupt the file that holds the undo
history. Wrongly declaring a dead session live only leaves the user exactly
where they already were, and one explicit repair away from moving.

Detection is read-only; repair is explicit. Nothing here auto-repairs from a
read path such as ``list_sessions`` — a read that rewrites state on disk is a
surprise, and this is precisely the state a user may be trying to diagnose.
The single deliberate exception is
:meth:`GitWorktreeService._require_base_not_in_use`, which *skips* a stale
session rather than blocking on it, because refusing every future integration
for ever is worse and the user has no way to act on it from there; it still
leaves the correction to the explicit path.

Known limitations, shared with the lock reaper this reuses:

* **Pid recycling.** The operating system may hand a dead session's pid to an
  unrelated process. That session then reads as live and stays stuck until the
  new process exits. This fails toward "live", which is the safe direction.
* **Shared workspaces.** A session running on another machine against the same
  workspace has a pid that is meaningless locally and will usually read as
  dead, so its status may be repaired to ``interrupted`` while it is in fact
  running. Rotaris does not support two hosts driving one workspace, and the
  lock file has always had the same blind spot.
* **Windows.** A process that has exited but whose handle is still open reads
  as live until the last handle is closed.
"""

from __future__ import annotations

import datetime as dt
import json
from contextlib import suppress
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from rotaris_core.session.manager import SessionManager

#: Statuses that claim a live run. Kept in one place because three call sites
#: had begun to disagree about the list.
ACTIVE_EXECUTION_STATUSES: frozenset[str] = frozenset(
    {"starting", "running", "background", "pausing", "cancelling"}
)

#: What a session that lost its process is set to. ``"interrupted"`` is not a
#: new word: :class:`rotaris_core.run_result.RunStatus` already spells the
#: "stopped before it finished" outcome this way, and it is outside
#: :data:`ACTIVE_EXECUTION_STATUSES`, so a repaired session is never busy again.
INTERRUPTED_EXECUTION_STATUS: str = "interrupted"

#: Child states that are already over, spelled as they appear in a snapshot's
#: plain dicts. Mirrors :meth:`ChildTaskState.is_terminal` and is pinned to it by
#: ``test_terminal_child_states_match_the_state_machine``: importing the enum
#: here would drag the orchestrator barrel — and everything the scheduler
#: imports — into every UI path that reads this module.
TERMINAL_CHILD_STATES: frozenset[str] = frozenset({"succeeded", "failed", "cancelled", "blocked"})

#: What a child that lost its run is set to. ``cancelled`` is the one terminal
#: state reachable from every non-terminal state in ``VALID_TRANSITIONS``, which
#: is why SWR-2912's in-process sweep already targets it.
ORPHANED_CHILD_STATE: str = "cancelled"

#: Used when a session's ``updated_at`` cannot be parsed. Unreachable through
#: ``list_sessions`` (which drops such entries) but keeps the type total.
_UNKNOWN_TIME = dt.datetime.fromtimestamp(0, dt.UTC)


@dataclass(frozen=True, slots=True)
class StaleSession:
    """A session whose status claims a run that no process is running."""

    session_id: str
    #: The status it was stuck at, before any repair.
    execution_status: str
    #: When the dead process last wrote the session, not when it was repaired.
    updated_at: dt.datetime
    #: Human-readable: no lock file, or the pid that is gone.
    reason: str


def _pid_is_alive(manager: SessionManager, pid: int) -> bool:
    """Ask the lock reaper's own probe, so both answers can never disagree.

    ``pid_is_alive`` reports a process owned by another user as alive rather
    than raising out, which is the direction this module wants anyway.
    """
    try:
        return bool(manager.persistence._pid_is_alive(pid))  # noqa: SLF001
    except Exception:  # noqa: BLE001 - a probe that fails cannot prove death.
        return True


def _liveness(manager: SessionManager, session_id: str) -> tuple[bool, str]:
    """Return ``(is_live, why_it_is_not)``; every ambiguity answers live.

    ``why_it_is_not`` is empty whenever the session is reported live.
    """
    lock_path = manager.session_dir(session_id) / "lock"
    try:
        raw = lock_path.read_text(encoding="utf-8")
    except FileNotFoundError:
        # No lock at all: nothing claims this session. The only unambiguous
        # "not live" there is.
        return (False, "no lock file is held for this session")
    except OSError:
        # Unreadable, a directory, locked by another process: cannot tell.
        return (True, "")

    try:
        pid = int(json.loads(raw)["pid"])
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        # A corrupt lock or one without a pid says nothing about the process.
        return (True, "")

    if pid <= 0:
        # A pid no operating system hands out; treat it as unreadable, not dead.
        return (True, "")
    if _pid_is_alive(manager, pid):
        return (True, "")
    return (False, f"process {pid} is gone")


def _updated_at(value: Any) -> dt.datetime:
    try:
        return dt.datetime.fromisoformat(str(value))
    except (TypeError, ValueError):
        return _UNKNOWN_TIME


@traces(SWR.SWR_2437, SWR.SWR_2817)
def session_is_live(manager: SessionManager, session_id: str) -> bool:
    """Whether a process still owns *session_id*'s run.

    Live means the lock file exists **and** names a pid that is alive. Anything
    that cannot be established — an unreadable lock, a missing pid, a failing
    probe — reports live, because the cost of a false "dead" is a restore
    racing a real run.
    """
    if not session_id:
        return False
    live, _reason = _liveness(manager, session_id)
    return live


def _stale_from_metadata(
    manager: SessionManager,
    metadata: dict[str, Any],
) -> StaleSession | None:
    session_id = str(metadata.get("session_id") or "")
    if not session_id:
        return None
    status = str(metadata.get("execution_status") or "")
    # A terminal status is never stale, whatever the lock says: nothing is
    # blocked by it and nothing needs correcting.
    if status not in ACTIVE_EXECUTION_STATUSES:
        return None
    live, reason = _liveness(manager, session_id)
    if live:
        return None
    return StaleSession(
        session_id=session_id,
        execution_status=status,
        updated_at=_updated_at(metadata.get("updated_at")),
        reason=reason,
    )


@traces(SWR.SWR_2437, SWR.SWR_2817)
def detect_stale_sessions(manager: SessionManager) -> tuple[StaleSession, ...]:
    """Every session claiming a run no process is running. Writes nothing.

    Reads ``metadata.json`` and the lock file only — never a snapshot, and
    never the filesystem in write mode. A user diagnosing a stuck workspace can
    look without the looking changing what they are looking at.
    """
    try:
        listed = manager.list_sessions(include_internal=True)
    except Exception:  # noqa: BLE001 - a broken session store reports nothing.
        return ()
    found = [
        stale
        for item in listed
        if isinstance(item, dict) and (stale := _stale_from_metadata(manager, item)) is not None
    ]
    return tuple(found)


@traces(SWR.SWR_2437, SWR.SWR_2817)
def repair_stale_session(manager: SessionManager, session_id: str) -> StaleSession | None:
    """Mark *session_id* interrupted if it lost its process, else do nothing.

    Returns the repaired :class:`StaleSession`, or ``None`` when the session is
    live, already terminal, or unreadable. ``None`` is "nothing to do", not an
    error: this is called from UI paths and never raises.

    The snapshot is flushed immediately rather than through the debounce, so a
    second crash cannot lose the correction, and the orphaned lock is removed
    afterwards. That order is deliberate: if the lock removal fails the session
    is already un-stuck and the existing lock reaper clears the lock on the next
    acquire, whereas the reverse order could drop the lock and still leave the
    status claiming a run.
    """
    if not session_id:
        return None

    live, reason = _liveness(manager, session_id)
    if live:
        return None

    try:
        state = manager.read_session_snapshot(session_id)
    except Exception:  # noqa: BLE001 - a missing or corrupt session is not an error here.
        return None

    previous_status = str(state.execution_status)
    if previous_status not in ACTIVE_EXECUTION_STATUSES:
        return None
    previous_updated_at = state.updated_at

    state.execution_status = INTERRUPTED_EXECUTION_STATUS
    try:
        manager.flush_session(state)
    except OSError:
        # A workspace that cannot be written cannot be repaired; the session is
        # left exactly as it was, and reports stale again next time.
        return None

    # Best-effort: if this fails the session is already un-stuck, and the
    # existing lock reaper clears a dead-pid lock on the next acquire.
    with suppress(OSError):
        manager.persistence.release_lock(session_id)

    repaired = StaleSession(
        session_id=session_id,
        execution_status=previous_status,
        updated_at=previous_updated_at,
        reason=reason,
    )
    _record_repair(manager, repaired)
    return repaired


def _record_repair(manager: SessionManager, repaired: StaleSession) -> None:
    """Leave a timeline entry naming the previous status and why it was wrong."""
    try:
        from rotaris_core.session.diagnostics import SessionDiagnostics  # noqa: PLC0415

        SessionDiagnostics(manager.session_dir(repaired.session_id), repaired.session_id).timeline(
            "session.interrupted_recovered",
            severity="warning",
            actor="rotaris",
            message=(
                f"Session was still marked {repaired.execution_status!r} but "
                f"{repaired.reason}; status set to {INTERRUPTED_EXECUTION_STATUS!r}."
            ),
            metadata={
                "previous_execution_status": repaired.execution_status,
                "execution_status": INTERRUPTED_EXECUTION_STATUS,
                "reason": repaired.reason,
            },
        )
    except Exception:  # noqa: BLE001 - diagnostics must never fail a repair.
        return


@traces(SWR.SWR_3714)
def settle_orphaned_children(state: Any) -> int:
    """Close child records a previous run left open. Returns how many moved.

    Called by a run that has just taken the session lock and started nothing of
    its own, which is what makes the answer unambiguous: it owns the session
    alone, so every non-terminal record in the snapshot belongs to a run that no
    longer exists (SWR-3714). No liveness probe is needed — unlike
    :func:`repair_stale_session`, holding the lock already proves the previous
    owner is gone.

    ``cancelled`` is the target for the same reason SWR-2912's own sweep uses it:
    it is the one terminal state reachable from every non-terminal state. The
    completion time and the cleared tool chips matter as much as the state — a
    host renders "running since yesterday" from ``completed_at`` being absent,
    and a live tool chip on a stopped agent is the same contradiction one step
    down.

    Idempotent, and deliberately total rather than clever: a record that is
    already terminal keeps its outcome, its completion time and its artifacts.
    """
    settled_at = dt.datetime.now(dt.UTC).isoformat().replace("+00:00", "Z")
    settled = 0
    for child in getattr(state, "child_states", None) or []:
        if not isinstance(child, dict):
            continue
        if str(child.get("state", "")).strip().lower() in TERMINAL_CHILD_STATES:
            continue
        child["state"] = ORPHANED_CHILD_STATE
        child["completed_at"] = child.get("completed_at") or settled_at
        child["active_tools"] = []
        settled += 1
    return settled


@traces(SWR.SWR_2437, SWR.SWR_2817)
def repair_stale_sessions(manager: SessionManager) -> tuple[StaleSession, ...]:
    """Repair every stale session in the workspace. Idempotent.

    A second call repairs nothing, because a repaired session no longer holds
    an active status.
    """
    repaired = [
        result
        for stale in detect_stale_sessions(manager)
        if (result := repair_stale_session(manager, stale.session_id)) is not None
    ]
    return tuple(repaired)
