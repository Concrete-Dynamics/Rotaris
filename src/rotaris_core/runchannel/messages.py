"""Everything a host may ask of a run, as values (SWR-2453).

One frozen dataclass per operation, carrying scalars and plain containers of
scalars. That restriction is the whole design: a run in another process is
reached by sending these, and a message that could reach a live engine object
would pickle the engine along with it — which is how a "boundary" quietly
becomes a shared heap again.

The set is closed on purpose. :data:`CONTROL_MESSAGES` is what a dispatcher
switches on, and a new operation has to be added here before it can be sent,
which is where the question "can this argument survive being written down?"
gets asked.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from rotaris_core.reqtocode import SWR, traces

__all__ = [
    "CONTROL_MESSAGES",
    "Cancel",
    "CancelAgent",
    "CancelQuestions",
    "ClearTranscript",
    "ControlResult",
    "DeleteQueuedPrompt",
    "EditQueuedPrompt",
    "EditTodo",
    "ForceCompress",
    "InterruptTerminal",
    "KillTerminal",
    "Pause",
    "QueuePrompt",
    "ResizeTerminal",
    "ResolveApproval",
    "ResolveQuestions",
    "SendKeys",
    "SetPermissionMode",
    "Shutdown",
    "SkipVerifierCheck",
    "Steer",
    "SwitchEntryModel",
    "SwitchEntryReasoning",
]


@traces(SWR.SWR_2453)
@dataclass(frozen=True, slots=True)
class ControlResult:
    """What a run says back.

    ``ok`` is the answer every caller acts on: false means the run could not
    carry the request out — it ended, the request timed out, there was nothing
    to act on — and a host shows that rather than pretending the call landed.
    ``value`` carries the one operation that returns something (a queued
    prompt's id) without giving each operation its own result type.
    """

    ok: bool
    value: str = ""

    def __bool__(self) -> bool:
        return self.ok


# ── permission and question prompts ──────────────────────────────────────
#
# Both barriers are already string-keyed create/wait/resolve/cancel, which is
# why they cross a boundary without a new concurrency model: the waiting side
# blocks in the run, and these are the two messages that release it.


@traces(SWR.SWR_2504)
@dataclass(frozen=True, slots=True)
class ResolveApproval:
    """Answer one pending permission approval."""

    request_id: str
    option: str


@dataclass(frozen=True, slots=True)
class ResolveQuestions:
    """Answer the exact prompt an agent is waiting on."""

    agent_id: str
    prompt_id: str
    #: step id -> field -> answer, the shape ``AskQuestionsObservation`` returns.
    answers: dict[str, dict[str, str | None]] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class CancelQuestions:
    """Withdraw the prompt without answering it."""

    agent_id: str
    prompt_id: str


# ── talking to the agents ────────────────────────────────────────────────


@dataclass(frozen=True, slots=True)
class Steer:
    """Say something to a running agent, taken up at its next step."""

    agent_id: str
    text: str


@traces(SWR.SWR_2434)
@dataclass(frozen=True, slots=True)
class QueuePrompt:
    """Queue a follow-up this run — and only this run — may consume."""

    text: str


@dataclass(frozen=True, slots=True)
class EditQueuedPrompt:
    prompt_id: str
    text: str


@dataclass(frozen=True, slots=True)
class DeleteQueuedPrompt:
    prompt_id: str


@dataclass(frozen=True, slots=True)
class EditTodo:
    """Write a host-side todo edit into the active agent's live list."""

    operation: str
    target_id: str
    text: str = ""


# ── changing how the run behaves ─────────────────────────────────────────


@dataclass(frozen=True, slots=True)
class SwitchEntryModel:
    """Point the entry persona at another model, from the next iteration."""

    model_key: str


@dataclass(frozen=True, slots=True)
class SwitchEntryReasoning:
    """Point the entry persona at another reasoning level, from the next iteration."""

    reasoning: str


@traces(SWR.SWR_2503, SWR.SWR_2509)
@dataclass(frozen=True, slots=True)
class SetPermissionMode:
    """Switch the run's permission mode, effective from its next tool call."""

    mode: str


@dataclass(frozen=True, slots=True)
class ForceCompress:
    """Compress the context of every conversation currently active."""


@dataclass(frozen=True, slots=True)
class ClearTranscript:
    """Drop the transcript, keeping the session's artifacts and agent state."""


# ── stopping things ──────────────────────────────────────────────────────


@dataclass(frozen=True, slots=True)
class CancelAgent:
    """Stop one agent. ``orchestrator`` means the whole run."""

    agent_id: str


@traces(SWR.SWR_2610)
@dataclass(frozen=True, slots=True)
class SkipVerifierCheck:
    """Stop the check the verifier is running, leaving the run active."""


@dataclass(frozen=True, slots=True)
class Pause:
    """Let the run finish its current step, then stop."""


@dataclass(frozen=True, slots=True)
class Cancel:
    """Stop the run now, releasing anything waiting on a human first."""


@dataclass(frozen=True, slots=True)
class Shutdown:
    """The host is going away; stop the run and stop watching it."""


# ── the terminal the agent is using ──────────────────────────────────────
#
# The only operations whose *replies* are latency-sensitive, because a person
# is typing. They are also the only ones that name a stream rather than an
# agent: one agent reuses one terminal, but a background session gets its own.


@traces(SWR.SWR_2428)
@dataclass(frozen=True, slots=True)
class SendKeys:
    stream_id: str
    text: str
    enter: bool = False


@dataclass(frozen=True, slots=True)
class ResizeTerminal:
    stream_id: str
    cols: int
    rows: int


@dataclass(frozen=True, slots=True)
class InterruptTerminal:
    stream_id: str


@dataclass(frozen=True, slots=True)
class KillTerminal:
    stream_id: str


#: Every message a host may send. A dispatcher switches on this; a new
#: operation is not sendable until it is here.
CONTROL_MESSAGES: tuple[type, ...] = (
    ResolveApproval,
    ResolveQuestions,
    CancelQuestions,
    Steer,
    QueuePrompt,
    EditQueuedPrompt,
    DeleteQueuedPrompt,
    EditTodo,
    SwitchEntryModel,
    SwitchEntryReasoning,
    SetPermissionMode,
    ForceCompress,
    ClearTranscript,
    CancelAgent,
    SkipVerifierCheck,
    Pause,
    Cancel,
    Shutdown,
    SendKeys,
    ResizeTerminal,
    InterruptTerminal,
    KillTerminal,
)
