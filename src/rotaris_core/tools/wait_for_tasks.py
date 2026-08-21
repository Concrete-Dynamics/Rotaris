"""Voluntary-wait tool that lets the parent block until background tasks finish."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, cast

from openhands.sdk import Action, Observation, TextContent, ToolDefinition
from openhands.sdk.tool import ToolExecutor
from pydantic import Field

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Sequence
    from typing import Self

    from rotaris_core.orchestrator.child_manager import ChildManager


class WaitForTasksAction(Action):
    task_ids: list[str] = Field(
        default_factory=list,
        description=(
            "List of task IDs to wait for. Empty list means wait for ALL "
            "active background tasks to complete."
        ),
    )


class WaitForTasksObservation(Observation):
    queued_ids: list[str] = Field(
        default_factory=list,
        description="Task IDs that the scheduler will wait for before resuming.",
    )
    already_done: bool = Field(
        default=False,
        description="True if all requested tasks were already terminal (zero-delay path).",
    )

    @property
    def to_llm_content(self) -> Sequence[TextContent]:
        if self.already_done:
            return [
                TextContent(
                    text=f"All requested tasks already complete: {', '.join(self.queued_ids)}",
                ),
            ]
        return [
            TextContent(
                text=f"Waiting for tasks: {', '.join(self.queued_ids)}. "
                "You will be resumed with results when they complete.",
            ),
        ]


@traces(SWR.SWR_142)
class WaitForTasksExecutor(
    ToolExecutor[WaitForTasksAction, WaitForTasksObservation],
):
    def __init__(
        self,
        child_manager: ChildManager,
        *,
        current_task_id: str | None = None,
        parent_canonical_name: str | None = None,
    ) -> None:
        self.child_manager = child_manager
        self.current_task_id = current_task_id
        self.parent_canonical_name = parent_canonical_name

    def __call__(
        self,
        action: WaitForTasksAction,
        conversation: object = None,
    ) -> WaitForTasksObservation:
        ids_to_wait = action.task_ids

        if self.current_task_id is not None and self.current_task_id in ids_to_wait:
            raise ValueError("An agent cannot wait for its own task.")

        direct_child_ids = {
            record.task_id
            for record in self.child_manager.snapshot_children()
            if record.task_id and record.parent_agent_id == self.parent_canonical_name
        }
        if ids_to_wait:
            unrelated_ids = set(ids_to_wait) - direct_child_ids
            if unrelated_ids:
                raise ValueError("An agent can wait only for its direct child tasks.")
        else:
            ids_to_wait = [
                record.task_id
                for record in self.child_manager.snapshot_children()
                if record.run_in_background
                and record.task_id
                and record.task_id != self.current_task_id
                and record.parent_agent_id == self.parent_canonical_name
                and not record.state.is_terminal()
            ]

        all_done = all(tid in self.child_manager.results_by_task_id for tid in ids_to_wait)

        if all_done:
            return WaitForTasksObservation.from_text(
                f"All {len(ids_to_wait)} requested tasks already complete.",
                queued_ids=ids_to_wait,
                already_done=True,
            )

        self._pause_parent_conversation(conversation)
        if conversation is not None:
            self.child_manager.wait_barrier.request_wait(conversation, ids_to_wait)

        return WaitForTasksObservation.from_text(
            f"Waiting for {len(ids_to_wait)} task(s).",
            queued_ids=ids_to_wait,
        )

    def _pause_parent_conversation(self, conversation: object) -> None:
        if conversation is None:
            return
        pause = getattr(conversation, "pause", None)
        if not callable(pause):
            return
        # Dispatch through the daemon-thread-wrapped helper rather than
        # calling conversation.pause() inline: this executor runs *inside*
        # conversation.run()'s own call stack, so a blocking pause() here
        # would be waiting on the very run loop that is currently blocked
        # calling it — the same reentrancy hazard documented on every other
        # pause call site in the scheduler. block=False because the run
        # loop cannot even *check* the pause flag until this executor
        # returns; waiting for the pause to land is a guaranteed timeout.
        from rotaris_core.orchestrator.scheduler_conversation import pause_with_daemon

        pause_with_daemon(cast("Any", conversation), block=False)


_WAIT_FOR_TASKS_TOOL_DESCRIPTION = (
    "Voluntarily block until specific background tasks complete. "
    "Pass a list of task_ids to wait for specific tasks, or pass an empty list "
    "to wait for ALL active background tasks you directly delegated. "
    "If all requested tasks are already complete, returns immediately without blocking. "
    "You will be resumed with a structured summary of all waited-on task results. "
    "Use this when you cannot proceed without background task results and have no "
    "other productive work to do."
)


class WaitForTasksTool(
    ToolDefinition[WaitForTasksAction, WaitForTasksObservation],
):
    @classmethod
    def create(cls, conv_state: object = None, **kwargs: Any) -> Sequence[Self]:
        del conv_state
        child_manager = kwargs["child_manager"]
        current_task_id = kwargs.get("child_task_id")
        parent_canonical_name = kwargs.get("canonical_name") or kwargs.get("persona")
        return [
            cls(
                description=_WAIT_FOR_TASKS_TOOL_DESCRIPTION,
                action_type=WaitForTasksAction,
                observation_type=WaitForTasksObservation,
                executor=WaitForTasksExecutor(
                    child_manager,
                    current_task_id=current_task_id,
                    parent_canonical_name=parent_canonical_name,
                ),
            ),
        ]
