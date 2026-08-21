"""Work nobody is doing any more stops being reported as running (SWR-3611).

A requirement flow moves its requirement into ``Running`` before the first unit
starts and moves it out again when the last one ends. Between those two writes
the flow is a process, and a process can be killed, crash, or be closed with the
window it was launched from. When that happens the delivery record keeps saying
``Running`` and the run record keeps saying ``running``, and the board goes on
reporting work that stopped hours ago — the exact failure SWR-3611 forbids and
SWR-2817 already had to solve for sessions.

This module is the pass that corrects it, and it is deliberately conservative:
**every rule here is about proving abandonment, never about guessing at it.**
Three facts have to agree before a requirement is touched.

1. *No flow in this process owns it.* The caller says which requirements it is
   running (``running_here``); the desktop's scheduler knows exactly, and a
   headless evaluation owns nothing and says so.
2. *No session behind it is alive.* An in-flight run whose session
   :func:`~rotaris_core.session.recovery.session_is_live` reports live is a real
   run, however long it has been going, and is left entirely alone.
3. *Nothing has touched it for a while.* A run record is opened before the
   agent's session exists, so for the first stretch of a perfectly healthy run
   there is nothing to probe — the record carries no session id and neither does
   anything else. :data:`ABANDONED_AFTER` is the margin that window gets, taken
   from the newest sign of life the workspace has: when the delivery state last
   moved, when the flow last recorded a stage, and when each in-flight run
   started.

What it then does is the *smallest* correction that stops the lie. Run records
are closed as ``interrupted`` through the history's own seam, so the worktree,
the branch, the produced commits and the changed files all survive — SWR-3611's
second criterion is that a restart may not lose work, only stop misreporting it.
The delivery moves ``Running → Blocked`` as the **system** actor with a stated
reason, because ``Blocked`` is the one honest destination the matrix offers: the
work was attempted and did not finish, and a pass that quietly dropped the card
back into ``Ready`` would erase that. From there a person releases it in one
move (:func:`~rotaris_core.requirements.delivery.transitions.resume_target`).

Idempotent by construction: a second pass finds the records terminal and the
delivery out of ``Running``, and writes nothing.
"""

from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Callable, Collection
    from pathlib import Path

    from rotaris_core.requirements.delivery.audit import AuditStore
    from rotaris_core.requirements.delivery.store import DeliveryStore
    from rotaris_core.requirements.execution.history import ExecutionHistory, RunRecord
    from rotaris_core.requirements.execution.snapshot import ExecutionTransitions
    from rotaris_core.requirements.model import CanonicalRequirement

__all__ = [
    "ABANDONED_AFTER",
    "INTERRUPTED_REASON",
    "reconcile_abandoned_runs",
]

#: How long a requirement may show no sign of life before this pass will call it
#: abandoned. Long enough to cover the window between "the run record was opened"
#: and "the agent's session exists", which is the one stretch of a healthy run
#: that has nothing to probe; short enough that a user who reopens Rotaris after
#: a crash finds the board already corrected.
ABANDONED_AFTER = dt.timedelta(minutes=15)

#: What an interrupted record says happened to it. A terminal record with no
#: reason is refused by :class:`~rotaris_core.requirements.execution.history
#: .RunRecord`, and rightly: a retained failure nobody can read is worse than no
#: record at all.
INTERRUPTED_REASON = "no process owned this run any more; it was closed by a recovery pass"

#: Who the correction is recorded as. A system actor, because it asserts
#: something about processes rather than about intent — and named, so the audit
#: trail says which pass moved the card rather than merely "system" (SWR-3213).
_ACTOR = "run-recovery"


@traces(SWR.SWR_3611, SWR.SWR_3414, SWR.SWR_3203)
def reconcile_abandoned_runs(
    workspace: Path,
    *,
    current_for: Callable[[str], CanonicalRequirement | None],
    at: dt.datetime | None = None,
    running_here: Collection[str] = (),
    grace: dt.timedelta = ABANDONED_AFTER,
    is_live: Callable[[str], bool] | None = None,
    transitions: ExecutionTransitions | None = None,
    delivery: DeliveryStore | None = None,
    audit: AuditStore | None = None,
) -> tuple[str, ...]:
    """Close every run nobody owns, and free the requirements they stranded.

    *running_here* names the requirements the calling process is running right
    now, and is the exact answer where there is one: the desktop's scheduler
    holds a requirement's id for the whole flow, record or no record. Callers
    that run nothing — ``rotaris-cli requirements evaluate``, a board read in a
    process that has never started a flow — pass nothing and fall back on the
    liveness probe and *grace*.

    *is_live* is the seam a test replaces; production resolves it to
    :func:`~rotaris_core.session.recovery.session_is_live` over this workspace's
    own session manager, which reads a lock file and a pid and starts nothing.

    Returns one sentence per requirement freed, for the board's own report. An
    empty result is the overwhelmingly common case and costs one directory
    listing.
    """
    from rotaris_core.requirements.delivery.projection import RunOutcome
    from rotaris_core.requirements.delivery.state import DeliveryState
    from rotaris_core.requirements.delivery.store import DeliveryStore as Store
    from rotaris_core.requirements.execution.history import ExecutionHistory

    moment = at if at is not None else dt.datetime.now(dt.UTC)
    store = delivery if delivery is not None else Store(workspace)
    index = store.load_all()
    stranded = [
        req_id
        for req_id in index.req_ids
        if index.get(req_id).state is DeliveryState.RUNNING and req_id not in set(running_here)
    ]
    if not stranded:
        return ()
    history = ExecutionHistory(workspace)
    live = is_live if is_live is not None else _session_liveness(workspace)
    freed: list[str] = []
    for req_id in stranded:
        # The one moment both the margin and the sentence are measured from, so
        # what the pass decides and what it says can never be about different
        # facts.
        since = _last_sign_of_life(history, store, workspace, req_id)
        abandoned = _abandoned_runs(
            history,
            req_id,
            at=moment,
            grace=grace,
            is_live=live,
            since=since,
        )
        if abandoned is None:
            continue
        for record in abandoned:
            history.close(
                record.model_copy(
                    update={
                        "outcome": RunOutcome.INTERRUPTED,
                        "failure_reason": INTERRUPTED_REASON,
                        "finished_at": moment,
                    },
                ),
            )
        sentence = _free(
            workspace,
            req_id,
            at=moment,
            current_for=current_for,
            transitions=transitions,
            delivery=store,
            audit=audit,
            since=since,
        )
        if sentence:
            freed.append(sentence)
    return tuple(freed)


def _abandoned_runs(
    history: ExecutionHistory,
    req_id: str,
    *,
    at: dt.datetime,
    grace: dt.timedelta,
    is_live: Callable[[str], bool],
    since: dt.datetime | None,
) -> tuple[RunRecord, ...] | None:
    """The in-flight records of *req_id* to close, or ``None`` to leave it alone.

    ``None`` and ``()`` are different answers and the difference is the point:
    ``None`` means something here is still alive, and ``()`` means nothing is —
    a requirement stranded in ``Running`` before its first run record was ever
    opened, which is exactly what a process killed during the snapshot or
    decomposition stage leaves behind.

    *since* is the newest sign of life the workspace has, and the margin is
    measured from **it** rather than from the run records alone. That is the
    whole of the young-flow case: a flow opens no run record until its first
    unit starts, so a pass that only looked at records would find nothing to
    date, skip the margin entirely, and close a flow that began a second ago as
    abandoned. The delivery's own move into ``Running`` is the sign of life for
    exactly that window.
    """
    in_flight = history.load(req_id).in_flight
    if any(is_live(record.session_id or "") for record in in_flight):
        return None
    if since is not None and at - since < grace:
        return None
    return in_flight


def _free(
    workspace: Path,
    req_id: str,
    *,
    at: dt.datetime,
    current_for: Callable[[str], CanonicalRequirement | None],
    transitions: ExecutionTransitions | None,
    delivery: DeliveryStore,
    audit: AuditStore | None,
    since: dt.datetime | None,
) -> str:
    """Move *req_id* out of ``Running``, and say what happened to it.

    Through the workspace's own guarded writer (SWR-3515), never the store: the
    move is a transition like any other, it is refused if the matrix says so, and
    it appends exactly one audit record (SWR-3213).
    """
    from rotaris_core.requirements.change_host import workspace_transitions
    from rotaris_core.requirements.delivery.audit import AuditStore as Audit
    from rotaris_core.requirements.delivery.state import (
        DeliveryActor,
        DeliveryState,
        TransitionCause,
    )
    from rotaris_core.requirements.delivery.transitions import TransitionRequest

    requirement = current_for(req_id)
    when = f" since {since.isoformat(timespec='seconds')}" if since is not None else ""
    reason = f"the run's process is gone; nothing has owned this work{when}"
    door = (
        transitions
        if transitions is not None
        else workspace_transitions(
            workspace,
            current_for=current_for,
            delivery=delivery,
            audit=audit if audit is not None else Audit(workspace),
        )
    )
    outcome = door.apply(
        TransitionRequest(
            req_id=req_id,
            target=DeliveryState.BLOCKED,
            actor=DeliveryActor.system(_ACTOR),
            cause=TransitionCause.RUN_FAILED,
            at=at,
            requirement_hash=requirement.current_hash if requirement is not None else "",
            reason=reason,
            detail="recovered a run whose process was gone",
        ),
    )
    if not outcome.accepted:
        return ""
    return f"{req_id}: Running → Blocked — {reason}"


def _last_sign_of_life(
    history: ExecutionHistory,
    delivery: DeliveryStore,
    workspace: Path,
    req_id: str,
) -> dt.datetime | None:
    """The newest moment anything in this workspace says work was happening."""
    from rotaris_core.requirements.execution.flow import FlowStateStore

    moments = [
        moment
        for moment in (
            delivery.read(req_id).delivery.changed_at,
            FlowStateStore(workspace).load(req_id).updated_at,
            *(record.started_at for record in history.load(req_id).runs),
        )
        if moment is not None
    ]
    return max(moments, default=None)


def _session_liveness(workspace: Path) -> Callable[[str], bool]:
    """Whether a session id still has a process, over this workspace's sessions.

    Resolved once per pass and not per record: building a session manager reads a
    directory, and a board with fifty stranded requirements should read it once.
    A probe that cannot be built at all reports every session live, so a
    workspace whose session store is unreadable loses the correction rather than
    making one it cannot justify.
    """
    from rotaris_core.session.manager import SessionManager
    from rotaris_core.session.recovery import session_is_live

    try:
        manager = SessionManager(workspace)
    except Exception:  # noqa: BLE001 - an unbuildable probe must not free anything.
        return lambda _session_id: True

    def live(session_id: str) -> bool:
        if not session_id:
            return False
        try:
            return session_is_live(manager, session_id)
        except Exception:  # noqa: BLE001 - same rule: unknown means live.
            return True

    return live
