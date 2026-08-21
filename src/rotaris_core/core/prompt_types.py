from __future__ import annotations

import threading
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any

from rotaris_core.reqtocode import SWR, traces


class PromptType(Enum):
    STANDARD = "STANDARD"
    STEERING = "STEERING"
    QUEUED = "QUEUED"


class SteeringStatus(Enum):
    PENDING = "PENDING"
    INJECTED = "INJECTED"
    EXPIRED = "EXPIRED"


class QueuedStatus(Enum):
    QUEUED = "QUEUED"
    TRIGGERED = "TRIGGERED"
    COMPLETED = "COMPLETED"


@dataclass(frozen=True)
class SteeringPrompt:
    target_child_id: str
    content: str
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = field(default_factory=datetime.now)
    status: SteeringStatus = SteeringStatus.PENDING


@dataclass(frozen=True)
class QueuedPrompt:
    content: str
    context_snapshot: dict[str, Any]
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = field(default_factory=datetime.now)
    status: QueuedStatus = QueuedStatus.QUEUED
    #: Session that owns this prompt. Empty for unscoped submissions (TUI,
    #: headless CLI), which every run may consume.
    session_id: str = ""


@traces(SWR.SWR_1322)
class PromptRegistry:
    _instance: PromptRegistry | None = None
    _lock = threading.Lock()
    _initialized: bool

    def __new__(cls) -> PromptRegistry:
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._initialized = False
            return cls._instance

    def __init__(self) -> None:
        if self._initialized:
            return

        self._lock = threading.Lock()
        # child_id -> list
        self._steering_prompts: dict[str, list[SteeringPrompt]] = {}
        # prompt_id -> prompt
        self._queued_prompts: dict[str, QueuedPrompt] = {}
        self._initialized = True

    @traces(SWR.SWR_1322)
    def clear(self) -> None:
        """Drop every steering and queued prompt this registry holds.

        The registry is a process-wide singleton, which is what lets the TUI, the
        desktop bridge and a headless run all submit into the same place. It also
        means there is no natural end to its lifetime, so anything that needs the
        registry to start empty -- a test, a harness replaying a session -- has to
        be able to say so. Emptying it in place rather than dropping the singleton
        is deliberate: ``PromptSubmissionAPI`` and every other caller hold a
        reference to *this* object, and replacing ``_instance`` would leave them
        talking to a registry nobody else can see.
        """
        with self._lock:
            self._steering_prompts.clear()
            self._queued_prompts.clear()

    def add_steering_prompt(self, child_id: str, content: str) -> str:
        prompt = SteeringPrompt(target_child_id=child_id, content=content)
        with self._lock:
            if child_id not in self._steering_prompts:
                self._steering_prompts[child_id] = []
            self._steering_prompts[child_id].append(prompt)
        return prompt.id

    def get_steering_prompts(self, child_id: str) -> list[SteeringPrompt]:
        with self._lock:
            return list(self._steering_prompts.get(child_id, []))

    @traces(SWR.SWR_2434)
    def add_queued_prompt(
        self,
        content: str,
        context_snapshot: dict[str, Any],
        session_id: str = "",
    ) -> str:
        owner = session_id or str(context_snapshot.get("session_id") or "")
        prompt = QueuedPrompt(
            content=content,
            context_snapshot=context_snapshot,
            session_id=owner,
        )
        with self._lock:
            self._queued_prompts[prompt.id] = prompt
        return prompt.id

    @traces(SWR.SWR_2434)
    def get_queued_prompts(self, session_id: str | None = None) -> list[QueuedPrompt]:
        """Snapshot every queued prompt, or only the ones one session owns.

        ``session_id=None`` keeps the legacy whole-registry read used by the TUI
        and headless CLI. A concrete id returns that session's prompts only, so
        parallel Rotaris runs can never consume each other's messages.
        """
        with self._lock:
            prompts = list(self._queued_prompts.values())
        if session_id is None:
            return prompts
        return [prompt for prompt in prompts if prompt.session_id == session_id]

    def remove_queued_prompt(self, prompt_id: str) -> QueuedPrompt:
        with self._lock:
            if prompt_id not in self._queued_prompts:
                raise KeyError(f"Queued prompt with ID {prompt_id} not found")

            prompt = self._queued_prompts[prompt_id]
            if prompt.status is not QueuedStatus.QUEUED:
                raise ValueError(
                    f"Queued prompt with ID {prompt_id} is already {prompt.status.value}",
                )

            del self._queued_prompts[prompt_id]
            return prompt

    def update_queued_prompt(self, prompt_id: str, content: str) -> QueuedPrompt:
        """Replace content of a prompt that has not been triggered yet."""
        with self._lock:
            if prompt_id not in self._queued_prompts:
                raise KeyError(f"Queued prompt with ID {prompt_id} not found")

            prompt = self._queued_prompts[prompt_id]
            if prompt.status is not QueuedStatus.QUEUED:
                raise ValueError(
                    f"Queued prompt with ID {prompt_id} is already {prompt.status.value}",
                )
            updated = QueuedPrompt(
                content=content,
                context_snapshot=prompt.context_snapshot,
                id=prompt.id,
                timestamp=prompt.timestamp,
                status=prompt.status,
                session_id=prompt.session_id,
            )
            self._queued_prompts[prompt_id] = updated
            return updated

    def mark_steering_as_injected(self, prompt_id: str) -> None:
        with self._lock:
            for _child_id, prompts in self._steering_prompts.items():
                for i, prompt in enumerate(prompts):
                    if prompt.id == prompt_id:
                        # Since SteeringPrompt is frozen, we must replace it
                        updated_prompt = SteeringPrompt(
                            target_child_id=prompt.target_child_id,
                            content=prompt.content,
                            id=prompt.id,
                            timestamp=prompt.timestamp,
                            status=SteeringStatus.INJECTED,
                        )
                        prompts[i] = updated_prompt
                        return
            raise KeyError(f"Steering prompt with ID {prompt_id} not found")

    def mark_queued_as_triggered(self, prompt_id: str) -> None:
        with self._lock:
            if prompt_id not in self._queued_prompts:
                raise KeyError(f"Queued prompt with ID {prompt_id} not found")

            prompt = self._queued_prompts[prompt_id]
            updated_prompt = QueuedPrompt(
                content=prompt.content,
                context_snapshot=prompt.context_snapshot,
                id=prompt.id,
                timestamp=prompt.timestamp,
                status=QueuedStatus.TRIGGERED,
                session_id=prompt.session_id,
            )
            self._queued_prompts[prompt_id] = updated_prompt
