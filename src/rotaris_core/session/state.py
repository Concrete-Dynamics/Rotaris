from __future__ import annotations

import datetime as dt
from typing import Any

from pydantic import BaseModel, Field

from rotaris_core.cost import CostSnapshot
from rotaris_core.improvement.types import RunType
from rotaris_core.reqtocode import SWR, traces
from rotaris_core.tokens import TokenSnapshot
from rotaris_core.verifier.suite import (
    ResolvedCheckSuite,  # noqa: TC001 - Pydantic resolves this at runtime.
)

DateTime = dt.datetime

SESSION_SCHEMA_VERSION = 1


class AgentMetrics(BaseModel):
    """Metrics tracked per agent."""

    tool_call_count: int = 0
    tool_calls: dict[str, int] = Field(default_factory=dict)
    token_usage: TokenSnapshot = Field(default_factory=TokenSnapshot)
    cost: CostSnapshot = Field(default_factory=CostSnapshot)
    compressions: int = 0
    last_prompt_tokens: int = 0


@traces(SWR.SWR_2402)
class SessionWorktree(BaseModel):
    """Durable binding between a user session and its Git worktree."""

    path: str
    branch: str
    base_branch: str
    base_revision: str
    created_by_session: bool = True
    merge_status: str = "ready"  # ready | integrating | merged | merge_failed
    integration_session_id: str | None = None


@traces(SWR.SWR_2436)
class SessionCheckpoint(BaseModel):
    """One automatic working-tree checkpoint recorded for this session.

    The engine that produces the underlying Git object lives in
    :mod:`rotaris_core.session.checkpoints`; this is the durable mapping from a
    session's iteration to the ref that can undo it, so a checkpoint taken
    before a crash is still restorable after a resume (SWR-2436).
    """

    sequence: int
    ref: str
    commit: str
    created_at: DateTime
    #: Iteration the checkpoint was taken after; ``0`` when it was not taken
    #: from the iteration loop (a manual or pre-restore capture).
    iteration: int = 0
    #: Child agent whose work triggered it; empty when no child was attributed.
    child_name: str = ""
    #: Paths the checkpoint changed relative to the commit it was taken on.
    files: list[str] = Field(default_factory=list)
    #: ``"iteration"``, ``"pre_restore"`` or ``"manual"``.
    kind: str = "iteration"


@traces(
    SWR.SWR_1545,
    SWR.SWR_910,
    SWR.SWR_918,
    SWR.SWR_2436,
    SWR.SWR_2503,
    SWR.SWR_2507,
    SWR.SWR_2601,
    SWR.SWR_2609,
)
class SessionState(BaseModel):
    schema_version: int = SESSION_SCHEMA_VERSION
    session_id: str
    workspace_root: str
    created_at: DateTime
    updated_at: DateTime
    config_snapshot: dict[str, Any] = Field(default_factory=dict)
    transcript_events: list[dict[str, Any]] = Field(default_factory=list)
    ui_edit_diffs: list[dict[str, Any]] = Field(default_factory=list)
    child_states: list[dict[str, Any]] = Field(default_factory=list)
    report_artifacts: list[dict[str, Any]] = Field(default_factory=list)
    todo_state: dict[str, Any] | None = None
    agent_todo_state: dict[str, Any] | None = None
    # Last observed prompt size. Rotaris uses this for the synthetic root
    # node, which has no dedicated tracker entry.
    root_context_tokens: int = 0
    # Classified intent for this run. Drives playbook resolution (SWR-2416) and is
    # recorded into ``state/run_config.json`` so a session can be audited for which
    # playbook cells it executed. Empty on v1 snapshots and unclassified runs.
    run_intent: str = ""
    # Effective permission mode preset (SWR-2503) resolved for the entry
    # persona at session start, recorded into ``state/run_config.json`` for
    # audit visibility. Empty on v1 snapshots and unresolved runs.
    permission_mode: str = ""
    # Check suite (SWR-2601) resolved at session start, recorded into
    # ``state/run_config.json`` so a finished run can be audited for what it
    # verified and where that suite came from. ``None`` on v1 snapshots and
    # unresolved runs.
    check_suite: ResolvedCheckSuite | None = None
    ralph_progress: dict[str, Any] | None = None
    token_usage: dict[str, Any] | None = None
    execution_status: str = "idle"

    # Whether this run's terminal commands actually executed inside the
    # OS-level sandbox (SWR-2507) — configured *and* available on the host, not
    # merely requested.  Stamped at run start alongside ``permission_mode``, so
    # a finished session can be audited for whether it held unrestricted shell
    # access.  ``False`` on every pre-sandbox snapshot, which is the truth about
    # those runs rather than a placeholder.
    sandboxed: bool = False
    # Which mechanism sandboxed it: "seatbelt", "bubblewrap", or empty when the
    # run was not sandboxed.
    sandbox_backend: str = ""

    # Which requirement, and which of its execution units, this run belongs to
    # (SWR-3612).  ``RunReport`` already carries the session id in the forward
    # direction — board to session — and these two are the way back, so a
    # session list can say what a run is *for* instead of only naming it.  Empty
    # on every session a human started, which is the truth about those runs
    # rather than a placeholder, and empty on every snapshot written before
    # requirement execution existed.  No schema bump: a Pydantic default is what
    # migrates an old snapshot here, exactly as it did for ``run_intent``,
    # ``check_suite`` and ``sandboxed``.
    requirement_id: str = ""
    unit_id: str = ""

    # Optional isolation binding.  Defaults preserve all pre-worktree snapshots.
    worktree: SessionWorktree | None = None

    # Automatic per-iteration Git checkpoints (SWR-2436), newest last.  The
    # mapping lives on the session so checkpoints survive a resume, and it is
    # pruned alongside the refs so it never names a ref that is already gone.
    # Empty on every pre-checkpoint snapshot, which is the truth about those
    # runs rather than a placeholder: they recorded none.
    checkpoints: list[SessionCheckpoint] = Field(default_factory=list)
    # Internal sessions are durable for recovery but never shown in normal session lists.
    internal: bool = False

    # Post-run improvement loop (REQ-20260515-POSTRUN-IMPROVE).
    # ``run_type`` distinguishes user-task runs from approval-gated
    # improvement runs. ``improvement_artifact_ids`` lists artifact files
    # persisted under ``<session_dir>/improvement_artifacts/`` for this
    # session so they can be re-loaded across resumes.
    run_type: RunType = RunType.TASK_RUN
    improvement_artifact_ids: list[str] = Field(default_factory=list)

    # Global counters
    global_tool_call_count: int = 0
    global_token_usage: TokenSnapshot = Field(default_factory=TokenSnapshot)
    # Usage cost as reported by the SDK. The default keeps pre-cost snapshots
    # loadable, and its "unavailable" source keeps an unpriced run from
    # reading as a free one.
    global_cost: CostSnapshot = Field(default_factory=CostSnapshot)
    global_compressions: int = 0

    # Per-agent counters
    agent_metrics: dict[str, AgentMetrics] = Field(default_factory=dict)

    # Seen compression IDs, persisted for exact-once dedup across session resumes.
    # Keyed by agent name (empty string for anonymous compressions).
    seen_compression_ids: dict[str, list[str]] = Field(default_factory=dict)

    # Provider/model pairs that returned a structured quota-exhausted error
    # (HTTP 429 with ``insufficient_quota``) during this session. Values are
    # ``"<provider>/<model>"`` strings, or just ``"<model>"`` when the
    # provider cannot be determined (REQ-20260515-008). Used to prevent
    # auto-retry/auto-fallback onto a backing model that the upstream
    # provider has already declared exhausted for the active session.
    exhausted_provider_models: list[str] = Field(default_factory=list)
    message_count: int = 0
    message_limit: int | None = None

    # Pending interactive questions from the ask_questions tool.  Written by
    # the session observer when an ask_questions action event fires, read by
    # Rotaris poll to detect and render the question stepper.  Cleared when
    # the tool result arrives (answers submitted / cancelled / timed out).
    pending_questions: dict[str, Any] | None = None

    # Tool calls suspended on an interactive permission approval (SWR-2504),
    # keyed by request id.  Written by the host's approval presenter while the
    # dispatching agent thread waits; each entry is removed once the user
    # answers, the request times out, or the run is cancelled.
    pending_approvals: dict[str, dict[str, Any]] = Field(default_factory=dict)

    # Transient wait-state metadata while a live run is suspended on a
    # provider quota condition. Cleared when the run resumes or is stopped.
    wait_state: dict[str, Any] | None = None

    # Transient progress of the post-change check suite while it runs
    # (SWR-2609), so a host reading the persisted snapshot can show which check
    # is executing instead of a run that appears to have stopped. Same lifecycle
    # as ``wait_state``: written when the suite starts, updated per check, and
    # cleared when it ends — ``None`` therefore means "not verifying right now",
    # never "this run verified nothing".
    verifier_state: dict[str, Any] | None = None

    # Why this workspace is running ungated, or "" (SWR-2615). Unlike
    # ``verifier_state`` this *persists* across the suite's lifecycle, because it
    # describes the absence of a gate rather than the progress of one: a run with
    # no gate has nothing in flight to report and is exactly the run a user needs
    # told. Cleared the moment a gate binds.
    gate_warning: str = ""

    # Session-wide active model override selected from the TUI runtime-model
    # picker. Used to preserve manual rate-limit recovery choices across
    # subsequent calls and session reloads.
    active_model_key: str | None = None
    runtime_model_configs: dict[str, dict[str, Any]] = Field(default_factory=dict)
