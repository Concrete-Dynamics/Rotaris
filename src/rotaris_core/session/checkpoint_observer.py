"""Trigger a working-tree checkpoint at every iteration boundary (SWR-2436).

:class:`~rotaris_core.session.checkpoint_service.CheckpointService` decides
*whether* to checkpoint and knows how; this observer decides *when*, which for
SWR-2436 is "after every iteration that modified files".

Why an observer and not a loop override: the repository's standing rule is that
``RalphLoop._run_iteration`` is never re-overridden — a host that wants to react
to an iteration adds a :class:`~rotaris_core.ralph.iteration_observer.RalphIterationObserver`
instead.  That also gets the coverage right for free.  The loop calls
``on_iteration_end`` from **two** places: the main outcome path, and the earlier
return that re-queues a task whose todo list came back incomplete.  An iteration
that ends on the re-queue path still ran an agent and still edited files, so it
still owes the user an undo point; a checkpoint wired to only one of the two
would silently lose those.  Going through the observer seam covers both without
this module having to know either exists.

Nothing here decides policy.  ``capture`` returns ``None`` — not an error — when
checkpointing is off for the session, when the tree is identical to ``HEAD``
(the ordinary outcome of a read-only iteration), and when Git refused, which it
has already recorded as a session warning.  It never raises, which is the
property that lets this hook sit on the iteration's hot path at all.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from rotaris_core.ralph.iteration_observer import RalphIterationObserver
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from rotaris_core.orchestrator.child_manager import ChildManager
    from rotaris_core.orchestrator.child_state import ChildTaskRecord
    from rotaris_core.orchestrator.report import ChildReportArtifact
    from rotaris_core.ralph.state import RalphIterationOutcome
    from rotaris_core.session.checkpoint_service import CheckpointService
    from rotaris_core.tools.todo_state import TodoList, TodoTask

__all__ = ["CheckpointObserver"]

_log = logging.getLogger(__name__)


@traces(SWR.SWR_2436)
class CheckpointObserver(RalphIterationObserver):
    """Asks *service* for a checkpoint at the end of every iteration.

    Args:
        service: The session's checkpoint policy. Build it with the tree the
            agent actually works in (``config.workspace_root``, which is the
            worktree in an isolated session) and ``isolated=`` taken from the
            session's worktree binding — the ``enabled=None`` default resolves
            through it.
    """

    def __init__(self, service: CheckpointService) -> None:
        self._service = service
        #: ``on_iteration_end`` does not carry the iteration number, and the loop
        #: runs iterations strictly sequentially, so the number from the matching
        #: ``on_iteration_start`` is the right one.  Without this every recorded
        #: checkpoint would claim to be from iteration 0, and SWR-2436 requires
        #: the iteration number to be part of what a checkpoint records.
        self._iteration = 0

    @property
    def service(self) -> CheckpointService:
        """The checkpoint policy this observer drives."""
        return self._service

    def on_iteration_start(self, iteration_num: int, task: TodoTask) -> None:
        del task
        try:
            self._iteration = int(iteration_num)
        except (TypeError, ValueError):  # pragma: no cover - the loop passes an int
            self._iteration = 0

    @traces(SWR.SWR_2436)
    def on_iteration_end(
        self,
        record: ChildTaskRecord,
        report: ChildReportArtifact,
        manager: ChildManager,
        todo: TodoList,
        outcome: RalphIterationOutcome,
    ) -> None:
        del report, manager, todo, outcome
        child_name = ""
        name: Any = getattr(record, "canonical_name", "")
        if name:
            child_name = str(name)
        try:
            self._service.capture(iteration=self._iteration, child_name=child_name)
        except Exception:  # noqa: BLE001 - documented not to raise; belt and braces.
            _log.warning(
                "Could not checkpoint the working tree after iteration %d.",
                self._iteration,
                exc_info=True,
            )
