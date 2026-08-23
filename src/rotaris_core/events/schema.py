"""Versioned event schema for the headless JSON stream (SWR-1829).

Every runtime event a headless run emits (SWR-1828) is one of the models below.
They share a four-field envelope — ``schema_version``, ``event``, ``timestamp``,
``session_id`` — and add a type-specific payload.  ``event`` is the pydantic
discriminator, so :func:`parse_event` reconstructs the exact model from a line
of JSONL without the consumer guessing.

``EVENT_SCHEMA_VERSION`` is deliberately **independent** of
``rotaris_core.session.state.SESSION_SCHEMA_VERSION``: the on-disk session
snapshot and the wire event stream are two contracts with two audiences and two
upgrade cadences.  Do not import one into the other, and do not bump them
together.

Payloads reuse the project's existing structured models rather than inventing
parallel shapes.  They carry them as already-serialized dicts
(``model_dump(mode="json")``) instead of importing the model classes, which
keeps this package import-light: a stream consumer must not drag in the agent
SDK just to parse a line.

Redaction is the schema's job, not the caller's.  Every field that can carry a
command line, an approval summary, raw process output or model text —
``tool.start.arguments``, ``permission.decision.summary``,
``hook.start.command``, ``hook.finish.output``,
``approval.requested.summary`` and every string inside ``transcript.row.row`` —
is masked by a validator, so a caller cannot leak a credential by constructing
(or mutating) a model directly.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, field_validator

from rotaris_core.permissions.approval import (
    _ARGUMENT_PREVIEW_LIMIT,
    _MASK,
    _SECRET_KEY_RE,
    redact_secrets,
)
from rotaris_core.reqtocode import SWR, traces

#: Version of the event wire format.  Bumped only on a breaking change; adding
#: a field or a new ``event`` type is backward-compatible and keeps the version.
EVENT_SCHEMA_VERSION: int = 1

#: How much of one transcript row's text the wire carries.  A stream line is a
#: line, and an event whose size follows the model's output is the one way a
#: single event can make a whole session's history unreadable — the store caps
#: *lines* (``eventstore.writer.DEFAULT_MAX_EVENTS``), not bytes, so nothing
#: else bounds it.  The limit is far above any real reply; text that reaches it
#: is clipped with an ellipsis, so a consumer can see that it happened rather
#: than having to infer it.
_MESSAGE_TEXT_LIMIT = 16_000


def _redact_row_value(value: Any) -> Any:
    """Mask and bound one value out of a transcript row, at any depth.

    Strings are masked then clipped — in that order, because clipping first
    could cut a credential in half and leave a half that matches nothing.
    Containers are walked; everything else is left alone.
    """
    if isinstance(value, str):
        masked = redact_text(value)
        if len(masked) > _MESSAGE_TEXT_LIMIT:
            return masked[: _MESSAGE_TEXT_LIMIT - 1] + "…"
        return masked
    if isinstance(value, Mapping):
        return {str(key): _redact_row_value(item) for key, item in value.items()}
    if isinstance(value, list | tuple):
        return [_redact_row_value(item) for item in value]
    return value


def _utc_now_iso() -> str:
    """ISO-8601 UTC stamp, the only timestamp format on the wire."""
    return datetime.now(UTC).isoformat()


@traces(SWR.SWR_1829)
def redact_text(text: str) -> str:
    """Mask credential-looking content in one free-text field.

    A thin alias for :func:`~rotaris_core.permissions.approval.redact_secrets`,
    which owns the whole redaction ladder — assignments, ``--flag value`` pairs,
    auth schemes and the value-shape sweep for tokens whose surrounding key
    gives nothing away.  Kept as a separate name because the stream (SWR-1829)
    and the approval dialog (SWR-2504) are two audiences for one guarantee, and
    stream consumers import this one.
    """
    return redact_secrets(text)


@traces(SWR.SWR_1829)
def redact_arguments(arguments: Mapping[str, Any]) -> dict[str, str]:
    """Render a tool call's arguments for the stream, secrets masked, values clipped.

    Every value is coerced to ``str`` — the stream promises ``dict[str, str]``,
    so a consumer never has to deal with a nested blob — then masked and
    truncated to ``_ARGUMENT_PREVIEW_LIMIT`` characters.  A key that itself
    looks secret masks its value outright rather than trying to find the secret
    inside it.

    Idempotent: re-running it over already-redacted arguments is a no-op, which
    is what lets the ``tool.start`` validator run on both construction and
    assignment without corrupting a round-trip.
    """
    redacted: dict[str, str] = {}
    for raw_key in arguments:
        key = str(raw_key)
        if _SECRET_KEY_RE.search(key):
            redacted[key] = _MASK
            continue
        rendered = redact_text(str(arguments[raw_key]))
        if len(rendered) > _ARGUMENT_PREVIEW_LIMIT:
            rendered = f"{rendered[:_ARGUMENT_PREVIEW_LIMIT]}…"
        redacted[key] = rendered
    return redacted


@traces(SWR.SWR_1829)
class RotarisEvent(BaseModel):
    """The envelope every streamed event shares.

    ``extra="ignore"`` is the backward-compatibility promise of SWR-1829: a
    consumer pinned to schema version 1 must still parse a stream produced by a
    later build that added fields.  ``validate_assignment=True`` closes the
    redaction bypass — mutating a field re-runs its validator.
    """

    model_config = ConfigDict(extra="ignore", validate_assignment=True)

    schema_version: int = EVENT_SCHEMA_VERSION
    event: str
    timestamp: str = Field(default_factory=_utc_now_iso)
    session_id: str = ""


@traces(SWR.SWR_1829)
class SessionStartEvent(RotarisEvent):
    """A run began: what was asked, where, and under which guard rails."""

    event: Literal["session.start"] = "session.start"
    task: str = ""
    workspace: str = ""
    persona: str = ""
    permission_mode: str = ""
    sandboxed: bool = False
    max_iterations: int | None = None


@traces(SWR.SWR_1829)
class SessionEndEvent(RotarisEvent):
    """A run finished, with its terminal status and aggregate usage figures."""

    event: Literal["session.end"] = "session.end"
    status: str = ""
    stop_reason: str = ""
    iterations_completed: int = 0
    duration_seconds: float | None = None
    #: A serialized ``rotaris_core.tokens.TokenSnapshot``.
    tokens: dict[str, Any] | None = None
    #: A serialized ``rotaris_core.cost.CostSnapshot``.
    cost: dict[str, Any] | None = None


@traces(SWR.SWR_1829)
class IterationStartEvent(RotarisEvent):
    """One Ralph-loop iteration began."""

    event: Literal["iteration.start"] = "iteration.start"
    iteration: int = 0
    task: str = ""


@traces(SWR.SWR_1829)
class IterationEndEvent(RotarisEvent):
    """One Ralph-loop iteration finished, with its outcome classification."""

    event: Literal["iteration.end"] = "iteration.end"
    iteration: int = 0
    outcome: str = ""
    summary: str = ""


@traces(SWR.SWR_1829)
class ChildSpawnEvent(RotarisEvent):
    """A delegated child agent was created."""

    event: Literal["child.spawn"] = "child.spawn"
    child_id: str = ""
    agent_name: str = ""
    task: str = ""


@traces(SWR.SWR_1829)
class ChildTransitionEvent(RotarisEvent):
    """A child moved between ``ChildTaskState`` values."""

    event: Literal["child.transition"] = "child.transition"
    child_id: str = ""
    from_state: str = ""
    to_state: str = ""


@traces(SWR.SWR_1829)
class ChildCompleteEvent(RotarisEvent):
    """A child finished, carrying its full report artifact."""

    event: Literal["child.complete"] = "child.complete"
    child_id: str = ""
    #: A serialized ``rotaris_core.orchestrator.report.ChildReportArtifact``.
    report: dict[str, Any] | None = None


@traces(SWR.SWR_1829)
class ToolStartEvent(RotarisEvent):
    """A tool call was dispatched.  Arguments are redacted by the schema."""

    event: Literal["tool.start"] = "tool.start"
    tool_name: str = ""
    call_id: str = ""
    arguments: dict[str, str] = Field(default_factory=dict)

    @field_validator("arguments", mode="before")
    @classmethod
    def _redact(cls, value: Any) -> Any:
        """Mask on construction *and* on assignment; there is no raw path."""
        if isinstance(value, Mapping):
            return redact_arguments(value)
        return value


@traces(SWR.SWR_1829)
class ToolFinishEvent(RotarisEvent):
    """A tool call ended, with its outcome classification and duration."""

    event: Literal["tool.finish"] = "tool.finish"
    tool_name: str = ""
    call_id: str = ""
    status: str = ""
    duration_ms: float | None = None
    error: str | None = None


@traces(SWR.SWR_1829, SWR.SWR_1831)
class PermissionDecisionEvent(RotarisEvent):
    """One resolved permission decision (SWR-2506), summary redacted."""

    event: Literal["permission.decision"] = "permission.decision"
    #: Set when the decision resolves an ``approval.requested`` event; empty
    #: when the decision never went to a human.  Additive within schema
    #: version 1 (SWR-1831): without it a consumer cannot pair a pending
    #: approval with the resolution that ended it.
    #:
    #: Currently **always empty on a real stream**: the only producer today is
    #: ``rotaris_core.session.diagnostics.record_permission_decision``, which
    #: has no request id in hand.  Populating it is part of the emitter work
    #: that also raises ``approval.requested``; until then a consumer must
    #: treat an empty value as "unpaired", not as "resolved without a human".
    request_id: str = ""
    tool_name: str = ""
    #: A ``rotaris_core.permissions.engine.Decision`` value.
    decision: str = ""
    #: A ``rotaris_core.permissions.engine.DecisionSource`` value.
    source: str = ""
    rule_id: str = ""
    summary: str = ""

    @field_validator("summary", mode="before")
    @classmethod
    def _redact(cls, value: Any) -> Any:
        """The summary quotes a command line; mask it before it leaves the process."""
        if isinstance(value, str):
            return redact_text(value)
        return value


@traces(SWR.SWR_1829)
class VerifierResultEvent(RotarisEvent):
    """A verifier run's outcome for one iteration (SWR-2602/SWR-2604)."""

    event: Literal["verifier.result"] = "verifier.result"
    iteration: int = 0
    passed: bool = False
    #: Serialized ``rotaris_core.verifier.runner.VerifierRunResult`` checks.
    checks: list[dict[str, Any]] = Field(default_factory=list)
    summary: str = ""


@traces(SWR.SWR_2609)
class VerifierProgressEvent(RotarisEvent):
    """Where a verifier run has got to, while it is still running (SWR-2609).

    Emitted alongside — not instead of — :class:`VerifierResultEvent`, which
    stays the terminal verdict for the iteration. A consumer that only wants the
    outcome ignores this event; a consumer rendering a live run needs it, because
    otherwise a suite that takes minutes looks like a run that stopped.
    """

    event: Literal["verifier.progress"] = "verifier.progress"
    iteration: int = 0
    #: ``started`` (suite armed), ``check_started``, or ``check_finished``.
    phase: Literal["started", "check_started", "check_finished"] = "started"
    #: Name of the check this event is about. Empty for ``started``.
    check: str = ""
    #: 1-based position in the suite, and the suite's length. ``0`` for
    #: ``started``, whose ``total`` still carries the suite length.
    index: int = 0
    total: int = 0
    #: Outcome, on ``check_finished`` only.
    status: str = ""
    #: How long the finished check took, in seconds.
    elapsed_s: float = 0.0
    #: The deadline the starting check runs against, after the suite budget has
    #: been applied — what a countdown should be drawn from.
    deadline_s: float = 0.0


@traces(SWR.SWR_1829, SWR.SWR_2454)
class TranscriptRowEvent(RotarisEvent):
    """One row of the run's own transcript, as the run recorded it.

    The stream reported everything a run *did* — iterations, children, tools,
    permissions, verdicts — and nothing it *said*.  A consumer could therefore
    reconstruct a run's mechanics but not its conversation, which is the half a
    person actually reads.  A session executing in another process was the case
    where that mattered: the durable transcript lives in
    ``state/ui_transcript.json``, which is rewritten whole, so a reader either
    re-read the entire session or saw nothing (SWR-2454).

    ``row`` is **not a shape invented for the wire**.  It is the dict
    ``rotaris_core.session.transcript.TranscriptRecorder`` puts into
    ``SessionState.transcript_events``, carried verbatim.  That is the whole
    point: a consumer building a view from these events and a consumer reading
    the session record afterwards are looking at the same rows, so they cannot
    disagree about what the run said.  Its keys are that recorder's contract —
    ``role`` (``user``/``agent``/``thinking``/``tool``/``verifier``/``system``),
    ``name``, ``persona``, ``content``, and role-specific extras — and a consumer
    should read the ones it knows and ignore the rest, exactly as it does for the
    envelope.

    ``index`` is the row's position in that list, which makes this event an
    **upsert rather than an append**.  A row is published when it is created and
    again when it settles: a tool row is opened on the call and closed on the
    result, a streamed message starts as its first token and ends as its finished
    text.  A consumer therefore replaces position *index* rather than appending,
    and a row it has never seen at an index beyond what it holds means it missed
    something and should re-read.

    What is deliberately *not* published is every intermediate mutation.  A
    streamed row changes once per token, and a store recording each of those
    would spend its whole cap (SWR-2901) on one message.  The cost lands on a
    foreign viewer, which sees a streaming row's first token and then its
    finished text at the end of the turn, rather than the growth between.

    Every string in ``row`` is redacted and bounded by the validator below.  A
    transcript quotes what tools printed, so a credential reaches this event by
    exactly the route it reaches ``hook.finish.output``.
    """

    event: Literal["transcript.row"] = "transcript.row"
    #: Position in ``SessionState.transcript_events``.  Stable for the life of a
    #: session unless the transcript is cleared, which restarts it at zero.
    index: int = 0
    #: The recorder's row, verbatim but for masking.
    row: dict[str, Any] = Field(default_factory=dict)

    @field_validator("row", mode="before")
    @classmethod
    def _redact(cls, value: Any) -> Any:
        """Mask and bound every string in the row, however deeply it sits.

        Applied to the whole mapping rather than to a list of known keys: the
        recorder owns which keys a row has, and a redaction rule that named them
        would leak the first time it grew one.
        """
        if isinstance(value, Mapping):
            return {str(key): _redact_row_value(item) for key, item in value.items()}
        return value


@traces(SWR.SWR_1829)
class UsageUpdateEvent(RotarisEvent):
    """Running token and cost totals."""

    event: Literal["usage.update"] = "usage.update"
    #: A serialized ``rotaris_core.tokens.TokenSnapshot``.
    tokens: dict[str, Any] | None = None
    #: A serialized ``rotaris_core.cost.CostSnapshot``.
    cost: dict[str, Any] | None = None


@traces(SWR.SWR_1829)
class ErrorEvent(RotarisEvent):
    """Something failed.  ``fatal`` says whether the run can continue."""

    event: Literal["error"] = "error"
    message: str = ""
    error_class: str = ""
    detail: str = ""
    fatal: bool = False


@traces(SWR.SWR_1829)
class ResultEvent(RotarisEvent):
    """The terminal event of a run — always the last line of the stream."""

    event: Literal["result"] = "result"
    #: A serialized ``RunResult`` (see ``rotaris_core.run_result``, unit U4).
    #: Carried as a dict so this package stays independent of that module.
    result: dict[str, Any] = Field(default_factory=dict)


# --------------------------------------------------------------------------
# P1 feature coverage (SWR-1831): hooks, checkpoints, completion gate and
# approval requests.  These are additive within schema version 1 — the fourteen
# types a pinned consumer already knows keep parsing unchanged.  A consumer
# that has not been rebuilt still meets an unknown discriminator as a
# ``ValidationError`` from :func:`parse_event` (it never guesses), so it must
# skip the line itself; that is unchanged behaviour, not a new hazard.
#
# Schema only: nothing emits these types yet.  Wiring each emission into the
# subsystem that owns the moment is separate work, and a type nothing emits is
# a valid intermediate state.
# --------------------------------------------------------------------------


@traces(SWR.SWR_1831)
class HookStartEvent(RotarisEvent):
    """A configured lifecycle hook was dispatched (SWR-2701/SWR-2702).

    ``command`` is the hook's configured command line and is redacted by the
    schema, exactly as ``tool.start`` redacts its arguments.
    """

    event: Literal["hook.start"] = "hook.start"
    #: Stable ``source:index:event`` identity; pairs this event with its
    #: ``hook.finish``.
    hook_id: str = ""
    #: The hook's configured display name, falling back to its ``hook_id``.
    hook_name: str = ""
    #: The lifecycle point that fired it — a ``rotaris_core.hooks.HOOK_EVENTS``
    #: value such as ``"pre_tool"`` or ``"session_end"``.
    lifecycle_point: str = ""
    #: Which config scope declared it: ``"global"``, ``"workspace"`` or
    #: ``"default"``.  ``"workspace"`` is the untrusted one (SWR-2815).
    scope: str = ""
    #: The tool call the hook is wrapped around; empty for a lifecycle hook.
    tool_name: str = ""
    #: The configured command line, secrets masked by the validator below.
    command: str = ""

    @field_validator("command", mode="before")
    @classmethod
    def _redact(cls, value: Any) -> Any:
        """A hook command line can carry a credential; mask it on the wire."""
        if isinstance(value, str):
            return redact_text(value)
        return value


@traces(SWR.SWR_1831)
class HookFinishEvent(RotarisEvent):
    """A hook invocation ended — or never ran at all (SWR-2704/SWR-2815).

    A hook skipped because its workspace list is untrusted emits **only** this
    event, with ``skipped=True``, ``skip_reason`` set, and ``exit_code`` /
    ``duration_ms`` left ``None``: there was no process, so there is no
    matching ``hook.start`` to pair with.
    """

    event: Literal["hook.finish"] = "hook.finish"
    hook_id: str = ""
    hook_name: str = ""
    lifecycle_point: str = ""
    scope: str = ""
    tool_name: str = ""
    #: The process exit code; ``None`` when the hook never produced one
    #: (skipped, or the process failed to start).
    exit_code: int | None = None
    duration_ms: float | None = None
    #: The exit code stopped the action.  Only ever ``True`` for ``pre_tool``.
    blocked: bool = False
    #: The hook exceeded its timeout and was terminated.
    timed_out: bool = False
    #: The hook was never executed.
    skipped: bool = False
    #: Why it was not executed; empty unless ``skipped``.
    skip_reason: str = ""
    #: Captured stdout/stderr, bounded by the runner and masked by the
    #: validator below.
    output: str = ""

    @field_validator("output", mode="before")
    @classmethod
    def _redact(cls, value: Any) -> Any:
        """Hook output is arbitrary process output; mask it before it ships."""
        if isinstance(value, str):
            return redact_text(value)
        return value


@traces(SWR.SWR_1831)
class CheckpointCreatedEvent(RotarisEvent):
    """A working-tree checkpoint was recorded for this session (SWR-2436)."""

    event: Literal["checkpoint.created"] = "checkpoint.created"
    #: Monotonic per-session checkpoint number; the handle a restore names.
    sequence: int = 0
    #: The Git ref holding the checkpoint.
    ref: str = ""
    #: ``"iteration"``, ``"pre_restore"`` or ``"manual"``.
    kind: str = "iteration"
    #: Iteration it was taken after; ``0`` outside the iteration loop.
    iteration: int = 0
    #: How many paths the checkpoint captured.  A count, not the paths: a
    #: stream line must not grow with the size of the change set.
    changed_paths: int = 0


@traces(SWR.SWR_1831)
class CheckpointRestoredEvent(RotarisEvent):
    """A rollback to a checkpoint was attempted (SWR-2437).

    Also reports a *refused* restore: ``restored=False`` with
    ``blocked_reason`` saying why the tree was left alone.
    """

    event: Literal["checkpoint.restored"] = "checkpoint.restored"
    #: The checkpoint sequence that was asked for.
    sequence: int = 0
    #: Whether the working tree actually changed.
    restored: bool = False
    #: Sequence of the ``kind="pre_restore"`` checkpoint taken before mutating
    #: the tree; ``None`` when none was taken.  A refusal usually means none was
    #: taken — but not always: a restore whose safety checkpoint succeeded and
    #: whose Git restore then failed is refused *and* carries a sequence, and
    #: that sequence is the only record of the pre-restore state.  Read this
    #: field, never infer it from ``restored``.
    safety_sequence: int | None = None
    #: How many paths the restore touched.  Zero when it was refused.
    changed_paths: int = 0
    #: Empty on success; otherwise why the restore did not happen.
    blocked_reason: str = ""


@traces(SWR.SWR_1831)
class GateDecisionEvent(RotarisEvent):
    """What the completion gate decided for one iteration (SWR-2604).

    ``verifier.result`` reports what the checks did; this reports what the
    runner *decided because of it*, which is the part a consumer gates on.
    """

    event: Literal["gate.decision"] = "gate.decision"
    iteration: int = 0
    #: A ``rotaris_core.verifier.gate.GateDecision`` value: ``"passed"``,
    #: ``"gated"`` or ``"exempt"``.
    decision: str = ""
    reason: str = ""
    #: Blocking checks that did not pass.  Empty unless ``gated``.
    unsatisfied_checks: list[str] = Field(default_factory=list)
    #: Advisory checks that failed.  Reported, never blocking.
    advisory_failures: list[str] = Field(default_factory=list)
    #: What the LLM completion classifier concluded, when it ran.  Kept so an
    #: overruled ``COMPLETE`` verdict is visible rather than silent.
    llm_verdict: str | None = None


@traces(SWR.SWR_1831)
class GateRepairEvent(RotarisEvent):
    """How a gated iteration's repair budget was spent (SWR-2605)."""

    event: Literal["gate.repair"] = "gate.repair"
    iteration: int = 0
    #: A ``rotaris_core.verifier.repair.RepairAction`` value: ``"retry"``
    #: re-queues the task, ``"escalate"`` ends it.
    action: str = ""
    #: 1-based number of the attempt this gated iteration consumed.
    attempt: int = 0
    #: The configured budget (``verifier.max_repair_attempts``).
    max_attempts: int = 0
    #: Attempts left after this one.  Carried explicitly rather than derived,
    #: so a consumer never has to re-implement the budget arithmetic.
    remaining_attempts: int = 0
    unsatisfied_checks: list[str] = Field(default_factory=list)
    reason: str = ""


@traces(SWR.SWR_1831)
class ApprovalRequestedEvent(RotarisEvent):
    """A tool call is blocked waiting on a human approval (SWR-2504).

    The resolution keeps being reported by ``permission.decision``; this is the
    event that lets a consumer tell "still working" from "stalled at a prompt
    nobody will answer".  ``timeout_seconds`` gives it a deadline to watch, and
    ``agent_name``/``persona`` say whom it is waiting for.
    """

    event: Literal["approval.requested"] = "approval.requested"
    #: Correlates with the ``permission.decision`` that eventually resolves it.
    request_id: str = ""
    #: Canonical name of the agent whose permission engine raised the request,
    #: copied verbatim from that engine's identity binding.  For a delegated
    #: child it is the same string ``child.spawn`` reports as ``agent_name``, so
    #: the two join and the question reaches the work it belongs to — Rotaris
    #: fans out to eight children at once, and "a command is waiting" without
    #: "waiting for whom" cannot be routed at all.
    #:
    #: Two caveats a consumer must not skip.  A run's *entry* agent has no
    #: delegation identity, and ``agents.factory`` binds its engine to the
    #: persona name instead, so an ``agent_name`` here can be a persona name
    #: with no matching ``child.spawn``; treat a failed join as "this was not a
    #: child", not as a dropped event.  And the value is only ever reported,
    #: never reconstructed: it is empty when the raising engine's resolver holds
    #: no binding at all, because a supervisor routes on this field and a
    #: guessed name is worse than none.  A producer that *has* the name MUST
    #: fill it in rather than leave it blank.
    agent_name: str = ""
    #: Persona the blocked agent runs under — the persona the engine matched
    #: this request against, which is how the policy decided to ask in the first
    #: place.  Independent of ``agent_name`` and populated far more often: a
    #: request always carries a persona, so this is normally set even on the
    #: lines where ``agent_name`` is empty, and it is then the only routing key
    #: a consumer has.  Empty only when the request itself named no persona.
    persona: str = ""
    tool_name: str = ""
    rule_id: str = ""
    #: Redacted one-line description of what is being approved.
    summary: str = ""
    #: The resolver in effect, e.g. ``"brokered"`` or ``"headless"``.
    resolver: str = ""
    #: How long the resolver will wait for a human; ``None`` when it does not
    #: wait at all.
    timeout_seconds: float | None = None
    #: Why this request can never reach a human — today only
    #: ``"headless_policy"``.  Empty while a human may still answer.
    #:
    #: This event is raised *before* the wait, so a reason only knowable
    #: afterwards cannot appear here: a request that times out is announced with
    #: this field empty, and the timeout surfaces on the matching
    #: ``permission.decision``.  Pair the two by ``request_id`` rather than
    #: expecting this field to tell the whole story.
    unattended_reason: str = ""

    @field_validator("summary", mode="before")
    @classmethod
    def _redact(cls, value: Any) -> Any:
        """The summary quotes a command line; mask it before it leaves the process."""
        if isinstance(value, str):
            return redact_text(value)
        return value


#: Discriminated union of every streamable event.  A new event class MUST be
#: added here or :func:`parse_event` cannot reconstruct it.
AnyEvent = Annotated[
    SessionStartEvent
    | SessionEndEvent
    | IterationStartEvent
    | IterationEndEvent
    | ChildSpawnEvent
    | ChildTransitionEvent
    | ChildCompleteEvent
    | ToolStartEvent
    | ToolFinishEvent
    | PermissionDecisionEvent
    | VerifierResultEvent
    | VerifierProgressEvent
    | TranscriptRowEvent
    | UsageUpdateEvent
    | ErrorEvent
    | ResultEvent
    | HookStartEvent
    | HookFinishEvent
    | CheckpointCreatedEvent
    | CheckpointRestoredEvent
    | GateDecisionEvent
    | GateRepairEvent
    | ApprovalRequestedEvent,
    Field(discriminator="event"),
]

#: Built once: a ``TypeAdapter`` compiles a validator, and rebuilding it per
#: line would dominate the cost of parsing a stream.
_EVENT_ADAPTER: TypeAdapter[AnyEvent] = TypeAdapter(AnyEvent)


@traces(SWR.SWR_1829)
def parse_event(payload: dict[str, Any]) -> AnyEvent:
    """Reconstruct the concrete event model from one decoded JSONL object.

    Raises ``pydantic.ValidationError`` for an unknown ``event`` discriminator —
    a consumer meeting a newer event type should skip the line, not guess.
    """
    return _EVENT_ADAPTER.validate_python(payload)


def _json_safe(value: Any) -> Any:
    """Coerce mapping keys to ``str`` so ``sort_keys=True`` cannot raise.

    ``model_dump(mode="json")`` leaves ``dict[str, Any]`` payload values
    untouched, so a caller who stuffed an int-keyed dict into ``report`` would
    otherwise make ``json.dumps`` compare an ``int`` key against a ``str`` key
    and blow up mid-stream.
    """
    if isinstance(value, Mapping):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, list | tuple | set | frozenset):
        return [_json_safe(item) for item in value]
    return value


@traces(SWR.SWR_1828, SWR.SWR_1829)
def serialize_event(event: RotarisEvent) -> str:
    """Render one event as exactly one JSONL line.

    One event is one line — that is the whole contract SWR-1828 rests on, so
    the newline check stays in even though ``ensure_ascii=True`` already escapes
    every line separator (including U+2028/U+2029, which some JSON readers
    treat as line breaks).  ASCII output also survives a Windows console whose
    stdout encoding is not UTF-8.
    """
    line = json.dumps(
        _json_safe(event.model_dump(mode="json")),
        separators=(",", ":"),
        sort_keys=True,
        default=str,
    )
    if "\n" in line or "\r" in line:  # pragma: no cover - unreachable with ensure_ascii
        raise ValueError("A serialized event must never contain a line break.")
    return line
