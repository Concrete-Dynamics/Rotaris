"""Interactive ask_questions tool — agent prompts the user via a stepper modal.

The executor synchronously waits on ``UserPromptBarrier`` until the user
submits answers or the prompt is cancelled/times out. Answers are returned
directly as the tool observation.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from openhands.sdk import Action, Observation, TextContent, ToolDefinition
from openhands.sdk.tool import ToolExecutor
from pydantic import BaseModel, Field, model_validator

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Callable, Sequence
    from typing import Self

    from rotaris_core.orchestrator.user_prompt_barrier import (
        PromptResponse,
        UserPromptBarrier,
    )

_log = logging.getLogger(__name__)

# ── Pydantic models for steps and options ──────────────────────────────


class AskQuestionsOption(BaseModel):
    """A single selectable option within a question step."""

    label: str = Field(..., description="Short display label for this option.")
    description: str = Field(
        default="",
        description="Optional longer description shown below the label.",
    )


class AskQuestionsStep(BaseModel):
    """One step in the question stepper.

    Each step has a title, an optional description, and zero or more
    pre-defined options.  When ``allow_freeform`` is True (the default),
    the user can type their own answer instead of picking an option.
    """

    id: str = Field(
        ...,
        description="Unique identifier for this step (e.g. 'topic', 'scope').",
    )
    title: str = Field(..., description="Short heading shown above the options.")
    description: str = Field(
        default="",
        description="Optional explanatory text shown below the title.",
    )
    options: list[AskQuestionsOption] = Field(
        default_factory=list,
        max_length=8,
        description="Pre-defined choices the user can pick from (max 8).",
    )
    allow_freeform: bool = Field(
        default=True,
        description="Whether the user can type a custom answer instead of picking an option.",
    )


# ── Action and Observation ─────────────────────────────────────────────


class AskQuestionsAction(Action):
    """Ask the user one or more grouped questions via a stepper UI.

    The conversation blocks until the user submits answers or the prompt
    times out.  Each step can have pre-defined options and/or a freeform
    text input.
    """

    steps: list[AskQuestionsStep] = Field(
        ...,
        min_length=1,
        max_length=10,
        description=(
            "Ordered list of question steps to show the user. "
            "Each step has a title, optional description, optional options, and "
            "a flag for freeform text input."
        ),
    )

    @model_validator(mode="after")
    def _validate_steps(self) -> AskQuestionsAction:
        seen_ids: set[str] = set()
        for step in self.steps:
            if not step.title.strip():
                raise ValueError("Step must have a non-empty title.")
            if step.id in seen_ids:
                raise ValueError(f"Duplicate step id: {step.id!r}")
            seen_ids.add(step.id)
            if not step.options and not step.allow_freeform:
                raise ValueError(
                    f"Step {step.id!r} must provide options or allow freeform input.",
                )
            for opt in step.options:
                if not opt.label.strip():
                    raise ValueError(
                        f"Option label must be non-empty in step {step.id!r}.",
                    )
        return self


class AskQuestionsObservation(Observation):
    """The user's answers to the question steps."""

    answers: dict[str, dict[str, str | None]] = Field(
        default_factory=dict,
        description=(
            "Map of step_id → {selected_option: str|None, freeform_text: str|None}. "
            "selected_option is the label of the chosen option (or None). "
            "freeform_text is the user's typed answer (or None)."
        ),
    )
    cancelled: bool = Field(
        default=False,
        description="True if the prompt was cancelled by the user or run stop.",
    )
    timed_out: bool = Field(
        default=False,
        description="True if the user did not respond within the timeout.",
    )

    @property
    def to_llm_content(self) -> Sequence[TextContent]:
        if self.cancelled:
            return [TextContent(text="Questions were cancelled.")]
        if self.timed_out:
            return [TextContent(text="User did not respond to the questions in time.")]
        if not self.answers:
            return [TextContent(text="No answers were provided.")]

        lines = ["## User Answers\n"]
        for step_id, answer in self.answers.items():
            selected = answer.get("selected_option")
            freeform = answer.get("freeform_text")
            if selected:
                lines.append(f"- **{step_id}**: {selected}")
            elif freeform:
                lines.append(f"- **{step_id}**: {freeform}")
            else:
                lines.append(f"- **{step_id}**: (no answer)")
        return [TextContent(text="\n".join(lines))]


# ── Executor ───────────────────────────────────────────────────────────


@traces(SWR.SWR_563)
class AskQuestionsExecutor(
    ToolExecutor[AskQuestionsAction, AskQuestionsObservation],
):
    """Wait for user answers without blocking the Qt thread."""

    def __init__(
        self,
        user_prompt_barrier: UserPromptBarrier,
        *,
        on_questions_stored: (Callable[[object, str, list[AskQuestionsStep]], None] | None) = None,
        response_timeout: float = 300.0,
    ) -> None:
        self._barrier = user_prompt_barrier
        self._on_questions_stored = on_questions_stored
        self._response_timeout = response_timeout

    def __call__(
        self,
        action: AskQuestionsAction,
        conversation: object = None,
    ) -> AskQuestionsObservation:
        if conversation is None:
            return AskQuestionsObservation.from_text(
                "No conversation available to wait on.",
                cancelled=True,
            )

        prompt_id: str | None = None
        try:
            prompt_id = self._barrier.create_prompt(conversation)
        except (RuntimeError, ValueError) as exc:
            return AskQuestionsObservation.from_text(
                str(exc),
                cancelled=True,
            )

        if self._on_questions_stored is not None:
            try:
                self._on_questions_stored(conversation, prompt_id, action.steps)
            except Exception:
                self._barrier.discard(conversation)
                _log.exception("Failed to expose questions to the user")
                return AskQuestionsObservation.from_text(
                    "Questions could not be shown to the user.",
                    cancelled=True,
                )

        response: PromptResponse = self._barrier.wait_for_response(
            conversation,
            prompt_id,
            timeout=self._response_timeout,
        )

        from rotaris_core.orchestrator.user_prompt_barrier import PromptWaitStatus

        if response.status is PromptWaitStatus.CANCELLED:
            return AskQuestionsObservation.from_text(
                "Questions were cancelled.",
                cancelled=True,
            )
        if response.status is PromptWaitStatus.TIMED_OUT:
            return AskQuestionsObservation.from_text(
                f"User did not respond within {self._response_timeout:.0f} seconds.",
                timed_out=True,
            )

        answers = response.answers or {}
        return AskQuestionsObservation.from_text(
            f"Received answers for {len(answers)} step(s).",
            answers=answers,
        )


# ── Tool description and factory ───────────────────────────────────────

ASK_QUESTIONS_TOOL_DESCRIPTION = (
    "Ask the user one or more grouped questions with a stepper UI. "
    "Each step has a title, optional description, optional pre-defined options "
    "(max 8 per step), and a flag to allow freeform text input. "
    "The conversation waits up to 300 seconds for the user to submit answers. "
    "Use this when you need to clarify requirements, confirm a decision, or "
    "gather structured input from the user before proceeding."
)


class AskQuestionsTool(
    ToolDefinition[AskQuestionsAction, AskQuestionsObservation],
):
    @classmethod
    def create(cls, conv_state: object = None, **kwargs: Any) -> Sequence[Self]:
        del conv_state
        barrier = kwargs.get("user_prompt_barrier")
        if barrier is None:
            raise ValueError("ask_questions requires user_prompt_barrier runtime context.")
        on_stored = kwargs.get("on_questions_stored")
        timeout = float(kwargs.get("response_timeout", 300.0))
        return [
            cls(
                description=ASK_QUESTIONS_TOOL_DESCRIPTION,
                action_type=AskQuestionsAction,
                observation_type=AskQuestionsObservation,
                executor=AskQuestionsExecutor(
                    user_prompt_barrier=barrier,
                    on_questions_stored=on_stored,
                    response_timeout=timeout,
                ),
            ),
        ]
