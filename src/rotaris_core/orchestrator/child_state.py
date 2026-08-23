"""Child task state machine."""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field

from rotaris_core.reqtocode import SWR, traces


class ChildTaskState(StrEnum):
    QUEUED = "queued"
    STARTING = "starting"
    RUNNING = "running"
    WAITING_ON_DEPENDENCIES = "waiting_on_dependencies"
    WAITING_ON_MODEL_SLOT = "waiting_on_model_slot"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"
    BLOCKED = "blocked"

    def is_terminal(self) -> bool:
        return self in (
            ChildTaskState.SUCCEEDED,
            ChildTaskState.FAILED,
            ChildTaskState.CANCELLED,
            ChildTaskState.BLOCKED,
        )

    def counts_as_active(self) -> bool:
        """Whether this state counts toward ``active_count``.

        ``WAITING_ON_MODEL_SLOT`` children are idle (not consuming an LLM slot),
        so they are excluded from the active count to avoid needlessly tripping
        ``max_active_children``.
        """
        return not self.is_terminal() and self != ChildTaskState.WAITING_ON_MODEL_SLOT


VALID_TRANSITIONS: dict[ChildTaskState, set[ChildTaskState]] = {
    ChildTaskState.QUEUED: {
        ChildTaskState.STARTING,
        ChildTaskState.RUNNING,
        ChildTaskState.WAITING_ON_DEPENDENCIES,
        ChildTaskState.WAITING_ON_MODEL_SLOT,
        ChildTaskState.CANCELLED,
        ChildTaskState.BLOCKED,
    },
    ChildTaskState.WAITING_ON_DEPENDENCIES: {
        ChildTaskState.QUEUED,
        ChildTaskState.WAITING_ON_MODEL_SLOT,
        ChildTaskState.BLOCKED,
        ChildTaskState.CANCELLED,
    },
    ChildTaskState.WAITING_ON_MODEL_SLOT: {
        ChildTaskState.QUEUED,
        ChildTaskState.BLOCKED,
        ChildTaskState.CANCELLED,
    },
    ChildTaskState.STARTING: {
        ChildTaskState.RUNNING,
        ChildTaskState.FAILED,
        ChildTaskState.CANCELLED,
        ChildTaskState.BLOCKED,
    },
    ChildTaskState.RUNNING: {
        ChildTaskState.SUCCEEDED,
        ChildTaskState.FAILED,
        ChildTaskState.CANCELLED,
        ChildTaskState.BLOCKED,
    },
}


@traces(SWR.SWR_112, SWR.SWR_140, SWR.SWR_177, SWR.SWR_2433, SWR.SWR_3010)
class ChildTaskRecord(BaseModel):
    """Tracks a single child task's lifecycle."""

    name: str
    canonical_name: str
    persona: str
    task_payload: str
    depends_on: list[str] = Field(default_factory=list)
    inherited_context: list[str] = Field(default_factory=list)
    state: ChildTaskState = ChildTaskState.QUEUED
    spawned_at: dt.datetime | None = None
    completed_at: dt.datetime | None = None
    parent_agent_id: str | None = None
    depth: int = 1
    conversation_id: str | None = None
    category: str | None = None
    session_id: str | None = None
    run_in_background: bool = False
    task_id: str = ""
    launch_generation: int = 0
    """Monotonic launch-claim generation; zero for pre-SWR-177 snapshots."""
    produced_artifact_ids: list[str] = Field(default_factory=list)
    received_artifact_ids: list[str] = Field(default_factory=list)
    model_key: str | None = None
    """Resolved model config key (e.g. ``'deepseek/deepseek-v4-pro'``) for
    per-model concurrency tracking.  Populated by the delegate tool at spawn
    time.  ``None`` for synthetic children or children created outside the
    delegate path."""

    granted_tools: list[str] = Field(default_factory=list)
    """Native tool names this child's agent actually got, after ``coordinator_only``,
    ``read_only``, intent policy and per-tool availability were applied.  Recorded at
    launch so the desktop inspector can show the agent's real tool set instead of the
    persona's declaration (SWR-3010).  Empty for a snapshot written before that."""

    granted_mcp_tools: dict[str, list[str]] = Field(default_factory=dict)
    """MCP tool names this child's agent got, per server, after the persona's grant
    (SWR-3008).  Recorded alongside ``granted_tools``; empty when the child has no MCP
    server or the snapshot predates the field."""

    todo_state: dict[str, Any] | None = None
    """Serialised ``TodoList`` for the running child agent.  Populated by the
    per-child ``todo_state_callback`` when the agent calls the ``todo`` tool.
    ``None`` when the child has never produced a todo or the field was absent in
    a pre-existing session snapshot (REQ-20260429-120000-001)."""

    def transition(self, new_state: ChildTaskState) -> None:
        """Validate and apply state transition. Raises ValueError on invalid."""
        allowed = VALID_TRANSITIONS.get(self.state, set())
        if new_state not in allowed:
            raise ValueError(f"Invalid transition: {self.state} → {new_state}")
        self.state = new_state
        if new_state.is_terminal():
            self.completed_at = dt.datetime.now(dt.UTC)


@traces(SWR.SWR_177)
@dataclass(frozen=True, slots=True)
class ChildLaunchClaim:
    """Immutable ownership token for one child launch attempt."""

    canonical_name: str
    task_id: str
    parent_agent_id: str
    generation: int

    @property
    def claim_id(self) -> str:
        return f"{self.task_id or self.canonical_name}:{self.generation}"


@dataclass(frozen=True, slots=True)
class ChildNotification:
    """Lightweight notification emitted when a background child reaches terminal state."""

    task_id: str
    canonical_name: str
    description: str
    state: ChildTaskState
    duration_s: float
    still_running_count: int
    artifact_ids: list[str] = field(default_factory=list)
