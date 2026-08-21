"""Ralph-loop observers that publish runtime events (SWR-1828 / SWR-1829).

Two classes live here:

* :class:`StreamEventObserver` translates the :class:`RalphIterationObserver`
  hooks into schema events on the session bus.  It is the emission seam for
  iteration, child, usage and verifier coverage; the tool-call, permission and
  error coverage comes from ``rotaris_core.session.diagnostics``, and the
  session boundary from ``rotaris_core.ralph.loop``.
* :class:`CompositeIterationObserver` exists because a loop has exactly one
  ``iteration_observer`` slot and two hosts already occupy it — the headless CLI
  installs ``_BackgroundMessageLimitObserver`` and Rotaris installs its own
  ``_SessionObserver``.  Turning the stream on must *add* an observer, never
  displace one.

**Import weight.** This module imports ``rotaris_core.ralph.iteration_observer``
to subclass it, which executes ``rotaris_core.ralph.__init__`` and with it the
whole agent SDK (~35 s cold).  That is why ``rotaris_core.events.__init__``
re-exports these two names *lazily*: a stream consumer that only parses lines
must never pay for a runtime it does not boot.

**Threading.** ``on_child_spawned`` may fire from an ``asyncio.to_thread``
worker while every other hook fires on the event-loop thread, so the small
amount of per-child bookkeeping this observer keeps (which children have been
announced, and their last known state) sits behind an ``RLock``.  Nothing here
blocks: the bus snapshots its sink under its own lock and calls out unlocked.

**Failure containment.** The loop calls most hooks unguarded, so an exception
raised here would abort a real iteration.  Every hook body is therefore wrapped:
a broken stream degrades the stream, never the run.
"""

from __future__ import annotations

import logging
from threading import RLock
from typing import TYPE_CHECKING, Any

from rotaris_core.events.bus import publish
from rotaris_core.events.schema import (
    ChildCompleteEvent,
    ChildSpawnEvent,
    ChildTransitionEvent,
    IterationEndEvent,
    IterationStartEvent,
    UsageUpdateEvent,
    VerifierProgressEvent,
    VerifierResultEvent,
)
from rotaris_core.ralph.iteration_observer import RalphIterationObserver
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from rotaris_core.orchestrator.child_manager import ChildManager
    from rotaris_core.orchestrator.child_state import ChildTaskRecord
    from rotaris_core.orchestrator.report import ChildReportArtifact
    from rotaris_core.ralph.state import RalphIterationOutcome
    from rotaris_core.tools.todo_state import TodoList, TodoTask
    from rotaris_core.verifier.evidence import VerifierEvidence
    from rotaris_core.verifier.repair import RepairDecision
    from rotaris_core.verifier.runner import CheckResult, VerifierRunControl, VerifierRunResult
    from rotaris_core.verifier.suite import ResolvedCheck, ResolvedCheckSuite

_log = logging.getLogger(__name__)


def _child_id(record: Any) -> str:
    """Stable identity for one child across spawn, transition and completion.

    ``task_id`` is the delegate tool's handle and is what a consumer correlates
    on; ``canonical_name`` is the fallback for synthetic children spawned
    outside that path (the loop's own root child before a task id exists).
    """
    return str(getattr(record, "task_id", "") or getattr(record, "canonical_name", "") or "")


def _state_name(record: Any) -> str:
    state = getattr(record, "state", None)
    return "" if state is None else str(state)


def _dump(model: Any) -> dict[str, Any] | None:
    """Serialize a pydantic payload for the wire, or give up quietly."""
    if model is None:
        return None
    dump = getattr(model, "model_dump", None)
    if not callable(dump):
        return None
    try:
        dumped = dump(mode="json")
    except Exception:  # noqa: BLE001 - a foreign payload must not fail a run.
        return None
    return dumped if isinstance(dumped, dict) else None


@traces(SWR.SWR_1828, SWR.SWR_1829, SWR.SWR_1832)
class StreamEventObserver(RalphIterationObserver):
    """Publish iteration, child, usage and verifier events for one session.

    Deliberately **does not** implement ``on_repair_escalation``, even though
    the hook exists and carries exactly the ``RepairDecision`` that
    ``gate.repair`` reports.  That event is published from
    ``session.diagnostics.emit_timeline_event`` instead, which covers *both*
    outcomes of a repair decision — the retry and the escalation — from the one
    seam the loop already records them through.  Implementing the hook here as
    well would publish a second ``gate.repair`` for every escalation, and a
    consumer counting attempts against a budget would double-count them.
    """

    def __init__(self, session_id: str) -> None:
        self._session_id = session_id
        self._lock = RLock()
        #: Children already announced with a ``child.spawn`` event.  The loop
        #: reaches ``on_child_spawned`` (worker thread) and ``on_child_created``
        #: (loop thread) for the same child, and only one spawn belongs on the
        #: wire.
        self._announced: set[str] = set()
        #: Last state published per child, so ``child.transition`` can carry a
        #: real ``from_state`` and a repeated notification is not re-emitted.
        self._states: dict[str, str] = {}
        #: ``on_iteration_end`` does not carry the iteration number; the loop
        #: runs iterations strictly sequentially, so the number from the
        #: matching ``on_iteration_start`` is the right one.
        self._iteration = 0

    # -- helpers -------------------------------------------------------

    def _emit(self, event: Any) -> None:
        publish(self._session_id, event)

    def _announce_spawn(self, record: Any, *, seed_state: bool) -> str:
        """Publish ``child.spawn`` once per child; return its id.

        Also called from the transition paths so a child first seen when it
        already moved (a cascaded ``BLOCKED``, or a host that skipped the spawn
        callback) still gets its ``child.spawn`` before any later event about
        it — the ordering guarantee a consumer builds a tree from.

        *seed_state* records the record's state as the baseline the next
        ``child.transition`` reports as its ``from_state``.  A genuine spawn
        hook seeds it; a transition path must not, or the state it is about to
        report would already be the baseline and the transition would be
        swallowed as a repeat.
        """
        child_id = _child_id(record)
        if not child_id:
            return ""
        with self._lock:
            if child_id in self._announced:
                return child_id
            self._announced.add(child_id)
            if seed_state:
                self._states[child_id] = _state_name(record)
        self._emit(
            ChildSpawnEvent(
                session_id=self._session_id,
                child_id=child_id,
                agent_name=str(getattr(record, "canonical_name", "") or ""),
                task=str(getattr(record, "task_payload", "") or ""),
            ),
        )
        return child_id

    def _transition(self, record: Any) -> None:
        child_id = self._announce_spawn(record, seed_state=False)
        if not child_id:
            return
        to_state = _state_name(record)
        with self._lock:
            from_state = self._states.get(child_id, "")
            if from_state == to_state:
                return
            self._states[child_id] = to_state
        self._emit(
            ChildTransitionEvent(
                session_id=self._session_id,
                child_id=child_id,
                from_state=from_state,
                to_state=to_state,
            ),
        )

    @staticmethod
    def _report_for(record: Any, manager: Any) -> Any | None:
        """Find the report a manager committed for *record*, if any."""
        task_id = str(getattr(record, "task_id", "") or "")
        results = getattr(manager, "results_by_task_id", None)
        if task_id and isinstance(results, dict):
            report = results.get(task_id)
            if report is not None:
                return report
        # ``results_by_task_id`` is only populated for children that carry a
        # task id; the loop's own root child does not always.
        reports = getattr(manager, "_reports", None)
        if isinstance(reports, dict):
            return reports.get(str(getattr(record, "canonical_name", "") or ""))
        return None

    # -- hooks ---------------------------------------------------------

    def on_iteration_start(self, iteration_num: int, task: TodoTask) -> None:
        try:
            with self._lock:
                self._iteration = iteration_num
            self._emit(
                IterationStartEvent(
                    session_id=self._session_id,
                    iteration=iteration_num,
                    task=str(getattr(task, "name", "") or ""),
                ),
            )
        except Exception:  # noqa: BLE001 - the stream must not fail the run.
            _log.warning("Could not publish iteration.start", exc_info=True)

    def on_child_spawned(self, record: ChildTaskRecord, manager: ChildManager) -> None:
        del manager
        try:
            self._announce_spawn(record, seed_state=True)
        except Exception:  # noqa: BLE001 - see above.
            _log.warning("Could not publish child.spawn", exc_info=True)

    def on_child_created(
        self,
        record: ChildTaskRecord,
        manager: ChildManager,
        todo: TodoList,
    ) -> None:
        del manager, todo
        try:
            self._announce_spawn(record, seed_state=True)
        except Exception:  # noqa: BLE001 - see above.
            _log.warning("Could not publish child.spawn", exc_info=True)

    def on_child_running(self, record: ChildTaskRecord, manager: ChildManager) -> None:
        del manager
        try:
            self._transition(record)
        except Exception:  # noqa: BLE001 - see above.
            _log.warning("Could not publish child.transition", exc_info=True)

    def on_child_terminal(self, record: ChildTaskRecord, manager: ChildManager) -> None:
        try:
            self._transition(record)
            child_id = _child_id(record)
            if not child_id:
                return
            self._emit(
                ChildCompleteEvent(
                    session_id=self._session_id,
                    child_id=child_id,
                    report=_dump(self._report_for(record, manager)),
                ),
            )
        except Exception:  # noqa: BLE001 - see above.
            _log.warning("Could not publish child.complete", exc_info=True)

    def on_token_aggregate(self, usage: dict[str, Any] | None) -> None:
        try:
            if not usage:
                # Nothing was measured this iteration; an empty usage event
                # would tell a consumer the totals reset.
                return
            self._emit(UsageUpdateEvent(session_id=self._session_id, tokens=dict(usage)))
        except Exception:  # noqa: BLE001 - see above.
            _log.warning("Could not publish usage.update", exc_info=True)

    @traces(SWR.SWR_2609)
    def on_verifier_started(
        self,
        iteration_num: int,
        suite: ResolvedCheckSuite,
        control: VerifierRunControl,
    ) -> None:
        del control  # A stream consumer cannot act on the run; it only watches.
        self._emit_verifier_progress(
            iteration_num,
            phase="started",
            total=len(suite.checks),
        )

    @traces(SWR.SWR_2609)
    def on_verifier_check_started(
        self,
        iteration_num: int,
        check: ResolvedCheck,
        index: int,
        total: int,
        deadline_s: float,
    ) -> None:
        self._emit_verifier_progress(
            iteration_num,
            phase="check_started",
            check=check.name,
            index=index,
            total=total,
            deadline_s=round(deadline_s, 1),
        )

    @traces(SWR.SWR_2609)
    def on_verifier_check_finished(
        self,
        iteration_num: int,
        result: CheckResult,
        index: int,
        total: int,
    ) -> None:
        self._emit_verifier_progress(
            iteration_num,
            phase="check_finished",
            check=result.name,
            index=index,
            total=total,
            status=result.status,
            elapsed_s=result.duration_s,
        )

    @traces(SWR.SWR_2609)
    def _emit_verifier_progress(
        self,
        iteration_num: int,
        *,
        phase: str,
        check: str = "",
        index: int = 0,
        total: int = 0,
        status: str = "",
        elapsed_s: float = 0.0,
        deadline_s: float = 0.0,
    ) -> None:
        try:
            self._emit(
                VerifierProgressEvent(
                    session_id=self._session_id,
                    iteration=iteration_num,
                    phase=phase,  # type: ignore[arg-type]
                    check=check,
                    index=index,
                    total=total,
                    status=status,
                    elapsed_s=elapsed_s,
                    deadline_s=deadline_s,
                ),
            )
        except Exception:  # noqa: BLE001 - see above.
            _log.warning("Could not publish verifier.progress", exc_info=True)

    @traces(SWR.SWR_2602)
    def on_verifier_run(self, iteration_num: int, result: VerifierRunResult) -> None:
        try:
            dumped = _dump(result) or {}
            checks = dumped.get("results")
            self._emit(
                VerifierResultEvent(
                    session_id=self._session_id,
                    iteration=iteration_num,
                    passed=bool(getattr(result, "passed", False)),
                    checks=[check for check in checks if isinstance(check, dict)]
                    if isinstance(checks, list)
                    else [],
                    summary=self._verifier_summary(result),
                ),
            )
        except Exception:  # noqa: BLE001 - see above.
            _log.warning("Could not publish verifier.result", exc_info=True)

    @staticmethod
    def _verifier_summary(result: Any) -> str:
        if not getattr(result, "executed", False):
            reason = str(getattr(result, "skip_reason", "") or "")
            return f"Check suite skipped. {reason}".strip()
        failures = getattr(result, "blocking_failures", None) or []
        total = len(getattr(result, "results", None) or [])
        if failures:
            names = ", ".join(str(getattr(check, "name", "?")) for check in failures)
            return f"{len(failures)} of {total} check(s) failed: {names}"
        return f"All {total} check(s) passed."

    def on_iteration_end(
        self,
        record: ChildTaskRecord,
        report: ChildReportArtifact,
        manager: ChildManager,
        todo: TodoList,
        outcome: RalphIterationOutcome,
    ) -> None:
        del record, manager, todo
        try:
            with self._lock:
                iteration = self._iteration
            self._emit(
                IterationEndEvent(
                    session_id=self._session_id,
                    iteration=iteration,
                    outcome=str(outcome),
                    summary=str(getattr(report, "summary", "") or ""),
                ),
            )
        except Exception:  # noqa: BLE001 - see above.
            _log.warning("Could not publish iteration.end", exc_info=True)


@traces(SWR.SWR_1828, SWR.SWR_1829)
class CompositeIterationObserver(RalphIterationObserver):
    """Fan one loop's observer hooks out to several delegates.

    Delegates are duck-typed, not subclass-checked, because Rotaris'
    ``_SessionObserver`` is a plain class: a hook a delegate does not define is
    skipped, and a delegate that raises is logged and stepped over so one broken
    observer cannot silence the others.

    :meth:`extra_runtime_kwargs` is the one hook with a return value.  Results
    are merged left to right, so **a later delegate wins a key collision** —
    pass the host's own observer first and additive observers (such as
    :class:`StreamEventObserver`, which contributes nothing) after it.
    """

    def __init__(self, *observers: Any) -> None:
        self._observers: tuple[Any, ...] = tuple(obs for obs in observers if obs is not None)

    @property
    def observers(self) -> tuple[Any, ...]:
        """The delegates, in forwarding order."""
        return self._observers

    def _forward(self, hook: str, *args: Any) -> None:
        for observer in self._observers:
            method = getattr(observer, hook, None)
            if method is None:
                continue
            try:
                method(*args)
            except Exception:  # noqa: BLE001 - one broken delegate must not stop the rest.
                _log.exception(
                    "Iteration observer %r failed in %s; continuing with the others.",
                    type(observer).__name__,
                    hook,
                )

    # -- hooks (one per RalphIterationObserver method; the reflection test in
    # -- tests/unit/test_event_observer.py fails if this list falls behind) ---

    @traces(SWR.SWR_2703)
    def on_session_start(self, session_id: str, task: str) -> None:
        self._forward("on_session_start", session_id, task)

    @traces(SWR.SWR_2703)
    def on_session_end(self, session_id: str, status: str) -> None:
        self._forward("on_session_end", session_id, status)

    def on_iteration_start(self, iteration_num: int, task: TodoTask) -> None:
        self._forward("on_iteration_start", iteration_num, task)

    def on_child_spawned(self, record: ChildTaskRecord, manager: ChildManager) -> None:
        self._forward("on_child_spawned", record, manager)

    def on_child_created(
        self,
        record: ChildTaskRecord,
        manager: ChildManager,
        todo: TodoList,
    ) -> None:
        self._forward("on_child_created", record, manager, todo)

    def on_child_running(self, record: ChildTaskRecord, manager: ChildManager) -> None:
        self._forward("on_child_running", record, manager)

    def on_child_terminal(self, record: ChildTaskRecord, manager: ChildManager) -> None:
        self._forward("on_child_terminal", record, manager)

    def on_todo_state(self, todo: TodoList) -> None:
        self._forward("on_todo_state", todo)

    def extra_runtime_kwargs(self) -> dict[str, Any]:
        merged: dict[str, Any] = {}
        for observer in self._observers:
            method = getattr(observer, "extra_runtime_kwargs", None)
            if method is None:
                continue
            try:
                extra = method()
            except Exception:  # noqa: BLE001 - see ``_forward``.
                _log.exception(
                    "Iteration observer %r failed in extra_runtime_kwargs; skipping it.",
                    type(observer).__name__,
                )
                continue
            if isinstance(extra, dict):
                merged.update(extra)
        return merged

    def bind_scheduler_callbacks(self, manager: ChildManager) -> None:
        self._forward("bind_scheduler_callbacks", manager)

    def unbind_scheduler_callbacks(self) -> None:
        self._forward("unbind_scheduler_callbacks")

    def on_last_prompt_tokens(self, record: ChildTaskRecord, tokens: int) -> None:
        self._forward("on_last_prompt_tokens", record, tokens)

    def on_token_aggregate(self, usage: dict[str, Any] | None) -> None:
        self._forward("on_token_aggregate", usage)

    @traces(SWR.SWR_2609)
    def on_verifier_started(
        self,
        iteration_num: int,
        suite: ResolvedCheckSuite,
        control: VerifierRunControl,
    ) -> None:
        self._forward("on_verifier_started", iteration_num, suite, control)

    @traces(SWR.SWR_2609)
    def on_verifier_check_started(
        self,
        iteration_num: int,
        check: ResolvedCheck,
        index: int,
        total: int,
        deadline_s: float,
    ) -> None:
        self._forward(
            "on_verifier_check_started",
            iteration_num,
            check,
            index,
            total,
            deadline_s,
        )

    @traces(SWR.SWR_2609)
    def on_verifier_check_finished(
        self,
        iteration_num: int,
        result: CheckResult,
        index: int,
        total: int,
    ) -> None:
        self._forward("on_verifier_check_finished", iteration_num, result, index, total)

    @traces(SWR.SWR_2602)
    def on_verifier_run(self, iteration_num: int, result: VerifierRunResult) -> None:
        self._forward("on_verifier_run", iteration_num, result)

    @traces(SWR.SWR_2605)
    def on_repair_escalation(
        self,
        iteration_num: int,
        decision: RepairDecision,
        evidence: VerifierEvidence | None,
    ) -> None:
        self._forward("on_repair_escalation", iteration_num, decision, evidence)

    @traces(SWR.SWR_911)
    def on_message_limit_reached(self, message_count: int, message_limit: int) -> None:
        self._forward("on_message_limit_reached", message_count, message_limit)

    def on_iteration_end(
        self,
        record: ChildTaskRecord,
        report: ChildReportArtifact,
        manager: ChildManager,
        todo: TodoList,
        outcome: RalphIterationOutcome,
    ) -> None:
        self._forward("on_iteration_end", record, report, manager, todo, outcome)
