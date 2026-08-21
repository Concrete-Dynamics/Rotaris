from __future__ import annotations

from typing import TYPE_CHECKING, Any

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


@traces(SWR.SWR_119)
class RalphIterationObserver:
    """Lifecycle hooks for one Ralph iteration.

    The base loop drives all orchestration semantics; an observer only
    mirrors progress to a host surface (TUI today, other frontends later).
    This default implementation is a no-op — headless runs use it directly.

    Threading contract: every hook is invoked on the event loop thread
    EXCEPT ``on_child_spawned``, which the delegate tool may fire from an
    ``asyncio.to_thread`` worker. Implementations that touch UI or shared
    state must marshal accordingly.
    """

    @traces(SWR.SWR_2703)
    def on_session_start(self, session_id: str, task: str) -> None:
        """Called once, when the loop takes ownership of the run.

        Fires at the same point the loop announces the run on the wire, before
        the first iteration and before any agent exists, so an observer can put
        something in place that the first agent will need (SWR-2703).
        """

    @traces(SWR.SWR_2703)
    def on_session_end(self, session_id: str, status: str) -> None:
        """Called once, when the loop releases the run, whatever ended it.

        Every exit path of the main loop — completion, a stop request, a
        cancellation, or an exception travelling out of it — passes through this
        hook exactly once. *status* is the run's terminal
        :class:`~rotaris_core.run_result.RunStatus` value.
        """

    def on_iteration_start(self, iteration_num: int, task: TodoTask) -> None:
        """Called after the task is marked IN_PROGRESS, before the child spawns."""

    def on_child_spawned(self, record: ChildTaskRecord, manager: ChildManager) -> None:
        """ChildManager spawn notification — may fire on a worker thread."""

    def on_child_created(
        self,
        record: ChildTaskRecord,
        manager: ChildManager,
        todo: TodoList,
    ) -> None:
        """Called after the iteration's root child is spawned and reparented."""

    def on_child_running(self, record: ChildTaskRecord, manager: ChildManager) -> None:
        """Called after the root child transitions to RUNNING."""

    def on_child_terminal(self, record: ChildTaskRecord, manager: ChildManager) -> None:
        """Called after a child terminal state and report are committed."""

    def on_todo_state(self, todo: TodoList) -> None:
        """Called whenever the agent updates its todo list mid-run."""

    def extra_runtime_kwargs(self) -> dict[str, Any]:
        """Additional runtime kwargs merged into the root agent's factory call."""
        return {}

    def bind_scheduler_callbacks(self, manager: ChildManager) -> None:
        """Called before the child runs; wire per-iteration scheduler callbacks."""

    def unbind_scheduler_callbacks(self) -> None:
        """Always called after the child run finishes (success, error, or cancel)."""

    def on_last_prompt_tokens(self, record: ChildTaskRecord, tokens: int) -> None:
        """Called with the root agent's last prompt token count, when available."""

    def on_token_aggregate(self, usage: dict[str, Any] | None) -> None:
        """Called once per iteration with the captured token usage snapshot."""

    @traces(SWR.SWR_2609, SWR.SWR_2611)
    def on_verifier_started(
        self,
        iteration_num: int,
        suite: ResolvedCheckSuite,
        control: VerifierRunControl,
    ) -> None:
        """Called once before the first check of a post-change verifier run.

        This is the hook that turns "the agent finished" into "the workspace is
        being checked" for a host — everything up to here looked like the run
        had gone quiet. *control* stays valid until :meth:`on_verifier_run`, so a
        host may hold it to offer a skip (SWR-2610).
        """

    @traces(SWR.SWR_2609)
    def on_verifier_check_started(
        self,
        iteration_num: int,
        check: ResolvedCheck,
        index: int,
        total: int,
        deadline_s: float,
    ) -> None:
        """Called as each check starts. *index* is 1-based."""

    @traces(SWR.SWR_2609)
    def on_verifier_check_finished(
        self,
        iteration_num: int,
        result: CheckResult,
        index: int,
        total: int,
    ) -> None:
        """Called as each check settles, whatever its outcome."""

    @traces(SWR.SWR_2602)
    def on_verifier_run(self, iteration_num: int, result: VerifierRunResult) -> None:
        """Called after the post-change verifier run, or after its recorded skip."""

    @traces(SWR.SWR_2605)
    def on_repair_escalation(
        self,
        iteration_num: int,
        decision: RepairDecision,
        evidence: VerifierEvidence | None,
    ) -> None:
        """Called when a gated task exhausts its repair budget and is abandoned.

        This is the hook an interactive host uses to put the failing checks in
        front of the user for a decision. Headless runs need nothing: the same
        facts land on the diagnostics timeline and in the child report.
        """

    @traces(SWR.SWR_911)
    def on_message_limit_reached(self, message_count: int, message_limit: int) -> None:
        """Called after an iteration reaches the configured message limit."""

    def on_iteration_end(
        self,
        record: ChildTaskRecord,
        report: ChildReportArtifact,
        manager: ChildManager,
        todo: TodoList,
        outcome: RalphIterationOutcome,
    ) -> None:
        """Called after outcome resolution, before the iteration state is returned."""
