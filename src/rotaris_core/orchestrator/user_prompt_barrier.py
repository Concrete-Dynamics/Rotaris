"""Blocking handshake for interactive agent-to-user question prompts."""

from __future__ import annotations

import threading
import uuid
from dataclasses import dataclass
from enum import StrEnum

from rotaris_core.reqtocode import SWR, traces

QuestionAnswersPayload = dict[str, dict[str, str | None]]


class PromptWaitStatus(StrEnum):
    """Terminal state of one user-prompt wait."""

    RESOLVED = "resolved"
    CANCELLED = "cancelled"
    TIMED_OUT = "timed_out"


@dataclass(frozen=True, slots=True)
class PromptResponse:
    """Result returned to the synchronous tool executor."""

    status: PromptWaitStatus
    answers: QuestionAnswersPayload | None = None


@dataclass(slots=True)
class _PendingPrompt:
    prompt_id: str
    event: threading.Event
    response: PromptResponse | None = None


def _conversation_key(conversation: object) -> str:
    """Return the SDK's stable conversation identifier."""
    conversation_id = getattr(conversation, "id", None)
    if not isinstance(conversation_id, str) or not conversation_id:
        raise ValueError("Conversation must expose a non-empty string id.")
    return conversation_id


@traces(SWR.SWR_2423)
class UserPromptBarrier:
    """Thread-safe pending prompts keyed by stable SDK conversation ID."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._pending: dict[str, _PendingPrompt] = {}

    def create_prompt(self, conversation: object) -> str:
        """Register one pending prompt for a conversation."""
        prompt_id = uuid.uuid4().hex
        conversation_id = _conversation_key(conversation)
        with self._lock:
            if conversation_id in self._pending:
                raise RuntimeError(
                    "Another question prompt is already waiting for this conversation.",
                )
            self._pending[conversation_id] = _PendingPrompt(prompt_id, threading.Event())
        return prompt_id

    def wait_for_response(
        self,
        conversation: object,
        prompt_id: str,
        timeout: float,
    ) -> PromptResponse:
        """Block until exact prompt resolves, cancels, or times out."""
        conversation_id = _conversation_key(conversation)
        with self._lock:
            pending = self._pending.get(conversation_id)
            if pending is None or pending.prompt_id != prompt_id:
                return PromptResponse(PromptWaitStatus.CANCELLED)

        if not pending.event.wait(timeout=max(timeout, 0.0)):
            with self._lock:
                current = self._pending.get(conversation_id)
                if current is pending:
                    self._pending.pop(conversation_id, None)
            return PromptResponse(PromptWaitStatus.TIMED_OUT)

        with self._lock:
            current = self._pending.get(conversation_id)
            if current is not pending:
                return PromptResponse(PromptWaitStatus.CANCELLED)
            self._pending.pop(conversation_id, None)
            return pending.response or PromptResponse(PromptWaitStatus.CANCELLED)

    def resolve(
        self,
        conversation: object,
        prompt_id: str,
        answers: QuestionAnswersPayload,
    ) -> bool:
        """Resolve exact prompt and unblock its executor."""
        return self._finish(
            conversation,
            prompt_id,
            PromptResponse(PromptWaitStatus.RESOLVED, answers),
        )

    def cancel(self, conversation: object, prompt_id: str) -> bool:
        """Cancel exact prompt and unblock its executor."""
        return self._finish(
            conversation,
            prompt_id,
            PromptResponse(PromptWaitStatus.CANCELLED),
        )

    def _finish(
        self,
        conversation: object,
        prompt_id: str,
        response: PromptResponse,
    ) -> bool:
        try:
            conversation_id = _conversation_key(conversation)
        except ValueError:
            return False
        with self._lock:
            pending = self._pending.get(conversation_id)
            if pending is None or pending.prompt_id != prompt_id:
                return False
            pending.response = response
            pending.event.set()
            return True

    def discard(self, conversation: object) -> None:
        """Cancel and remove any pending prompt during conversation teardown."""
        try:
            conversation_id = _conversation_key(conversation)
        except ValueError:
            return
        with self._lock:
            pending = self._pending.pop(conversation_id, None)
            if pending is not None:
                pending.response = PromptResponse(PromptWaitStatus.CANCELLED)
                pending.event.set()

    def cancel_all(self) -> None:
        """Cancel every pending prompt during whole-run shutdown."""
        with self._lock:
            pending_prompts = list(self._pending.values())
            self._pending.clear()
            for pending in pending_prompts:
                pending.response = PromptResponse(PromptWaitStatus.CANCELLED)
                pending.event.set()
