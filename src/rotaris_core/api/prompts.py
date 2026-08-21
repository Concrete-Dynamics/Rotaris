from __future__ import annotations

import threading
from typing import Any

from rotaris_core.core.prompt_types import PromptRegistry, QueuedPrompt
from rotaris_core.reqtocode import SWR, traces


@traces(SWR.SWR_1322)
class PromptSubmissionAPI:
    """API layer for external submission of steering and queued prompts.
    Provides thread-safe methods to interact with the PromptRegistry singleton.
    """

    def __init__(self) -> None:
        self._registry = PromptRegistry()
        self._lock = threading.Lock()

    def submit_steering(self, child_id: str, content: str) -> str:
        """Submits a steering prompt for a specific child agent.

        Args:
            child_id: The unique identifier of the target child agent.
            content: The steering content to be injected.

        Returns:
            The ID of the submitted steering prompt.

        Raises:
            ValueError: If content is empty or whitespace.

        """
        if not content or not content.strip():
            raise ValueError("Steering content cannot be empty.")
        if not child_id or not child_id.strip():
            raise ValueError("child_id cannot be empty.")

        # PromptRegistry.add_steering_prompt is already thread-safe via its own lock
        return self._registry.add_steering_prompt(child_id, content)

    @traces(SWR.SWR_2434)
    def submit_queued(
        self,
        content: str,
        context_snapshot: dict[str, Any] | None = None,
        session_id: str = "",
    ) -> str:
        """Submits a queued prompt to be triggered in the future.

        Args:
            content: The content of the queued prompt.
            context_snapshot: An optional dictionary containing context for the prompt.
            session_id: Owning session. Defaults to ``context_snapshot["session_id"]``
                when present; an empty owner stays consumable by any run.

        Returns:
            The ID of the submitted queued prompt.

        Raises:
            ValueError: If content is empty or whitespace.

        """
        if not content or not content.strip():
            raise ValueError("Queued prompt content cannot be empty.")

        snapshot = context_snapshot if context_snapshot is not None else {}

        # PromptRegistry.add_queued_prompt is already thread-safe via its own lock
        return self._registry.add_queued_prompt(content, snapshot, session_id)

    def unqueue(self, prompt_id: str) -> None:
        """Remove a queued prompt before it is triggered."""
        if not prompt_id or not prompt_id.strip():
            raise ValueError("Queued prompt id cannot be empty.")

        self._registry.remove_queued_prompt(prompt_id)

    def update_queued(self, prompt_id: str, content: str) -> None:
        """Edit a queued prompt before the orchestrator triggers it."""
        if not prompt_id or not prompt_id.strip():
            raise ValueError("Queued prompt id cannot be empty.")
        if not content or not content.strip():
            raise ValueError("Queued prompt content cannot be empty.")
        self._registry.update_queued_prompt(prompt_id, content.strip())

    @traces(SWR.SWR_2434)
    def list_queued(self, session_id: str | None = None) -> list[QueuedPrompt]:
        """Return a thread-safe snapshot of queued prompt records.

        Pass ``session_id`` to see only the prompts one session owns.
        """
        return self._registry.get_queued_prompts(session_id)


# Singleton instance for easy access
prompt_api = PromptSubmissionAPI()
