from __future__ import annotations

from enum import StrEnum
from uuid import uuid4

from pydantic import BaseModel, Field, PrivateAttr

from rotaris_core.reqtocode import SWR, traces


class TaskStatus(StrEnum):
    PENDING = "PENDING"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    ABANDONED = "ABANDONED"


class TodoTask(BaseModel):
    id: str = Field(default_factory=lambda: uuid4().hex[:8])
    name: str
    status: TaskStatus = TaskStatus.PENDING
    description: str | None = None
    _execution_context: str | None = PrivateAttr(default=None)

    def set_execution_context(self, payload: str | None) -> None:
        self._execution_context = payload

    @property
    def execution_payload(self) -> str:
        return self._execution_context or self.description or self.name


class TodoPhase(BaseModel):
    id: str = Field(default_factory=lambda: uuid4().hex[:8])
    name: str
    tasks: list[TodoTask] = Field(default_factory=list)


@traces(SWR.SWR_518, SWR.SWR_522)
class TodoList(BaseModel):
    phases: list[TodoPhase] = Field(default_factory=list)

    def get_task_by_id(self, task_id: str) -> TodoTask | None:
        for phase in self.phases:
            for task in phase.tasks:
                if task.id == task_id:
                    return task
        return None

    def get_phase_by_id(self, phase_id: str) -> TodoPhase | None:
        for phase in self.phases:
            if phase.id == phase_id:
                return phase
        return None
