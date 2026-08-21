"""Bridge from the Ralph observer seam to the lifecycle hook runner (SWR-2703).

SWR-2703 asks for five session lifecycle events a user can attach a shell
command to — ``session_start``, ``session_end``, ``iteration_end``,
``child_completed`` and ``verifier_finished`` — and says outright how it wants
them wired: *"bridge from the existing RalphIterationObserver seam without
overriding _run_iteration"*.  That is all this module is.  It owns no policy:
which hooks exist, whether they may run at all, how long they get and what a
non-zero exit means are decided by :mod:`rotaris_core.hooks.models`,
:mod:`rotaris_core.hooks.trust` and :class:`~rotaris_core.hooks.runner.HookRunner`.

Two properties are load-bearing.

**A hook cannot break the run.**  ``HookRunner.run_lifecycle`` is already total —
a missing interpreter, a hook that hangs, a hook that exits 7, all come back as
outcomes rather than exceptions — and every callback here is wrapped anyway, so
even a bug *in this bridge* degrades to a log line.  A lifecycle hook is
informational by definition (SWR-2703): its exit code never blocks the loop, and
``run_lifecycle`` reports ``blocked=False`` whatever it was.

**Hooks run inline, on the event-loop thread.**  Every hook this observer fires
sits on that thread (only ``on_child_spawned``, which this class does not
implement, may arrive from a worker), so a hook that uses its whole 60 s budget
stalls the loop for 60 s.  That is deliberate:

* The alternative — dispatching to a background thread and returning — makes a
  ``session_end`` notification hook unreliable, because the run's own teardown
  would race it and the process may exit before the hook does.  SWR-2703's
  user-flow scenario is precisely "a session with a ``session_end`` notification
  hook observably runs it when the run finishes", and "usually" is not a
  property worth shipping.
* Inline execution keeps the ordering a hook author would assume: the
  ``iteration_end`` hook for iteration 3 has finished before iteration 4 starts.
* The cost is already bounded by the runner: every hook is spawned with a
  wall-clock timeout and killed when it expires, and three failures disable a
  hook for the rest of the session (SWR-2704).
* A run with no hooks configured pays nothing at all — every callback below
  starts with a ``has_hooks`` check, so no payload is assembled and no process
  is spawned.

The user therefore controls the stall through the one knob that makes sense: the
``timeout`` on their own hook entry.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from rotaris_core.ralph.iteration_observer import RalphIterationObserver
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from rotaris_core.hooks.runner import HookRunner
    from rotaris_core.orchestrator.child_manager import ChildManager
    from rotaris_core.orchestrator.child_state import ChildTaskRecord
    from rotaris_core.orchestrator.report import ChildReportArtifact
    from rotaris_core.ralph.state import RalphIterationOutcome
    from rotaris_core.tools.todo_state import TodoList, TodoTask
    from rotaris_core.verifier.runner import VerifierRunResult

__all__ = ["HookLifecycleObserver"]

_log = logging.getLogger(__name__)


def _text(value: Any) -> str:
    """A payload string that is never ``None`` and never raises on conversion."""
    if value is None:
        return ""
    try:
        return str(value)
    except Exception:  # noqa: BLE001 - a hostile ``__str__`` must not fail a run.
        return ""


def _report_for(record: Any, manager: Any) -> Any | None:
    """The report *manager* committed for *record*, if it has one.

    Mirrors what ``StreamEventObserver`` does for ``child.complete``: a child
    that carries a task id is looked up by it, and the loop's own root child —
    which does not always have one — is looked up by its canonical name.
    """
    task_id = _text(getattr(record, "task_id", ""))
    results = getattr(manager, "results_by_task_id", None)
    if task_id and isinstance(results, dict):
        report = results.get(task_id)
        if report is not None:
            return report
    reports = getattr(manager, "_reports", None)
    if isinstance(reports, dict):
        return reports.get(_text(getattr(record, "canonical_name", "")))
    return None


@traces(SWR.SWR_2703)
class HookLifecycleObserver(RalphIterationObserver):
    """Fires one session's lifecycle hooks from the loop's observer callbacks.

    Construct one per run from the session's :class:`HookRunner` — built, as
    always, from :attr:`~rotaris_core.hooks.trust.TrustedHookSet.allowed` and
    never from the raw resolved hook set — and append it to the loop's extra
    observers.  It contributes nothing to the run but the hook calls: no runtime
    kwargs, no state the loop reads back.
    """

    def __init__(self, runner: HookRunner) -> None:
        self._runner = runner
        #: ``on_iteration_end`` does not carry the iteration number and the loop
        #: runs iterations strictly sequentially, so the number from the matching
        #: ``on_iteration_start`` is the right one.  Without this every
        #: ``iteration_end`` payload would report iteration 0.
        self._iteration = 0

    @property
    def runner(self) -> HookRunner:
        """The runner these callbacks fire through."""
        return self._runner

    # -- helpers -----------------------------------------------------------

    def _fire(self, event: str, **fields: Any) -> None:
        """Run *event*'s hooks, swallowing everything.

        ``run_lifecycle`` is total already; the guard is for this bridge's own
        payload assembly, which reads attributes off foreign objects.
        """
        try:
            self._runner.run_lifecycle(event, **fields)
        except Exception:  # noqa: BLE001 - a hook may never break the run.
            _log.warning("Lifecycle hooks for %s failed unexpectedly.", event, exc_info=True)

    def _wants(self, event: str) -> bool:
        """Whether assembling this event's payload is worth doing at all."""
        try:
            return self._runner.has_hooks(event)
        except Exception:  # noqa: BLE001 - see ``_fire``.
            _log.warning("Could not check hooks for %s.", event, exc_info=True)
            return False

    # -- hooks -------------------------------------------------------------

    @traces(SWR.SWR_2703)
    def on_session_start(self, session_id: str, task: str) -> None:
        del session_id  # the runner stamps its own session id into the payload
        if not self._wants("session_start"):
            return
        self._fire("session_start", task=_text(task))

    @traces(SWR.SWR_2703)
    def on_session_end(self, session_id: str, status: str) -> None:
        del session_id
        if not self._wants("session_end"):
            return
        self._fire("session_end", status=_text(status))

    def on_iteration_start(self, iteration_num: int, task: TodoTask) -> None:
        del task
        try:
            self._iteration = int(iteration_num)
        except (TypeError, ValueError):  # pragma: no cover - the loop passes an int
            self._iteration = 0

    @traces(SWR.SWR_2703)
    def on_child_terminal(self, record: ChildTaskRecord, manager: ChildManager) -> None:
        if not self._wants("child_completed"):
            return
        report = _report_for(record, manager)
        self._fire(
            "child_completed",
            child_id=_text(getattr(record, "task_id", "")),
            child_name=_text(getattr(record, "canonical_name", "")),
            persona=_text(getattr(record, "persona", "")),
            state=_text(getattr(record, "state", "")),
            status=_text(getattr(report, "status", "")),
            summary=_text(getattr(report, "summary", "")),
        )

    @traces(SWR.SWR_2602, SWR.SWR_2703)
    def on_verifier_run(self, iteration_num: int, result: VerifierRunResult) -> None:
        if not self._wants("verifier_finished"):
            return
        self._fire(
            "verifier_finished",
            iteration=iteration_num,
            executed=bool(getattr(result, "executed", False)),
            passed=bool(getattr(result, "passed", False)),
            skip_reason=_text(getattr(result, "skip_reason", "")),
            failed_checks=[
                _text(getattr(check, "name", ""))
                for check in (getattr(result, "blocking_failures", None) or [])
            ],
        )

    @traces(SWR.SWR_2703)
    def on_iteration_end(
        self,
        record: ChildTaskRecord,
        report: ChildReportArtifact,
        manager: ChildManager,
        todo: TodoList,
        outcome: RalphIterationOutcome,
    ) -> None:
        del manager, todo
        if not self._wants("iteration_end"):
            return
        self._fire(
            "iteration_end",
            iteration=self._iteration,
            outcome=_text(outcome),
            child_name=_text(getattr(record, "canonical_name", "")),
            status=_text(getattr(report, "status", "")),
            summary=_text(getattr(report, "summary", "")),
        )
