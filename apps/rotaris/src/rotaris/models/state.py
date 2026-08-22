"""Plain data model for everything the Rotaris UI renders.

Deliberately framework-free (no Qt imports): views read these through
:class:`rotaris.models.store.WorkspaceStore`, services fill them from the
Rotaris backend, and tests construct them directly.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Literal

from rotaris_core.reqtocode import SWR, traces


@traces(SWR.SWR_2454)
@dataclass(frozen=True, slots=True)
class TranscriptDelta:
    """What changed in a running session's transcript, and where it starts.

    The unit the live path moves. Raw rows, not projected ones: projection is
    the view's half of the work, and doing it here would put a second
    derivation of "what a row renders as" on the run's own thread.

    ``first`` is a raw index into the session's ``transcript_events`` — the
    earliest row that may have changed. Everything from there on is in
    ``rows``; everything before it is untouched. Both are copies, because the
    run goes on mutating the originals.
    """

    #: Raw index the change reaches back to.
    first: int
    #: Raw rows from :attr:`first` onward, copied.
    rows: list[dict[str, object]]
    #: Edit-diff artifacts recorded since the previous delta, copied. Only the
    #: new ones: the consumer keeps the ones it has already been given.
    new_diffs: list[dict[str, object]] = field(default_factory=list)
    #: Agent name → persona, for rows that carry no persona of their own.
    personas: dict[str, str] = field(default_factory=dict)


class AgentState(StrEnum):
    RUNNING = "running"
    WAITING = "waiting"
    QUEUED = "queued"
    DONE = "done"
    FAILED = "failed"
    CANCELLED = "cancelled"


class RunUiState(StrEnum):
    """Normalized lifecycle states rendered by the Rotaris desktop host."""

    IDLE = "idle"
    STARTING = "starting"
    RUNNING = "running"
    PAUSING = "pausing"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLING = "cancelling"
    CANCELLED = "cancelled"

    @classmethod
    def from_backend(cls, value: str) -> RunUiState:
        """Map persisted/backend aliases onto one stable UI state machine."""
        aliases = {
            "attached": cls.RUNNING,
            "background": cls.RUNNING,
            "succeeded": cls.COMPLETED,
            "done": cls.COMPLETED,
            "error": cls.FAILED,
        }
        try:
            return cls(value)
        except ValueError:
            return aliases.get(value, cls.IDLE)

    @property
    def busy(self) -> bool:
        return self in {
            self.STARTING,
            self.RUNNING,
            self.PAUSING,
            self.CANCELLING,
        }


class NoticeSeverity(StrEnum):
    INFO = "info"
    SUCCESS = "success"
    WARNING = "warning"
    ERROR = "error"


@dataclass
class UiNotice:
    """Actionable user-facing state; unlike a toast, may persist until resolved."""

    id: str
    severity: NoticeSeverity
    title: str
    message: str = ""
    details: str = ""
    persistent: bool = False
    action_label: str = ""
    action_id: str = ""
    #: The session this notice is *about*, when it is about one (SWR-2415).
    #: Empty means it belongs to whatever run is focused — the ordinary case —
    #: and those are cleared when the next run starts. A notice naming another
    #: session is news the user has not read yet, and starting a run is not an
    #: answer to it.
    session_id: str = ""


@traces(SWR.SWR_2090, SWR.SWR_2420, SWR.SWR_2432, SWR.SWR_2428)
@dataclass
class UiState:
    """Desktop-only interaction state shared across Rotaris views."""

    active_view: str = "dashboard"
    composer_draft: str = ""
    composer_mode: str = "start"
    sidebar_open: bool = False
    inspector_open: bool = False
    settings_dirty: bool = False
    agent_popout: bool = False
    auto_collapse_tools: bool = False
    group_tool_calls: bool = True
    #: Open the terminal window by itself when a command starts (SWR-2428).
    #: Off by default: the transcript preview is the ordinary way to watch a
    #: command, and a window that opens itself takes focus from the composer.
    terminal_popout: bool = False
    worktree_cleanup_prompt_enabled: bool = True
    notice: UiNotice | None = None


@dataclass(frozen=True)
class QueuedPromptItem:
    """One editable prompt waiting for the active run's next iteration."""

    id: str
    text: str


@traces(SWR.SWR_2422)
@dataclass(frozen=True)
class QuestionOption:
    """A single selectable option within a question step."""

    label: str
    description: str = ""


@traces(SWR.SWR_2422)
@dataclass(frozen=True)
class QuestionStep:
    """One step from the ask_questions tool."""

    id: str
    title: str
    description: str = ""
    options: tuple[QuestionOption, ...] = field(default_factory=tuple)
    allow_freeform: bool = True


@traces(SWR.SWR_2422)
@dataclass
class QuestionAnswers:
    """User's collected answers across all question steps."""

    answers: dict[str, dict[str, str | None]] = field(default_factory=dict)
    """step_id → {selected_option: str|None, freeform_text: str|None}"""


@traces(SWR.SWR_2433, SWR.SWR_3010)
@dataclass
class AgentNode:
    """One agent instance in the delegation DAG."""

    id: str
    name: str
    persona: str
    state: AgentState = AgentState.QUEUED
    parent_id: str | None = None
    depends_on: list[str] = field(default_factory=list)
    activity: str = ""
    model: str = ""
    reasoning: str = "medium"
    ctx_used: int = 0
    ctx_limit: int = 128_000
    tool_calls: int = 0
    elapsed: str = ""
    tools: list[str] = field(default_factory=list)
    mcp_tools: dict[str, list[str]] = field(default_factory=dict)
    """MCP tools this agent holds, per server (SWR-3010). Empty when it has no MCP
    server, or when the snapshot predates the recording."""
    called_tools: list[str] = field(default_factory=list)
    active_tools: list[str] = field(default_factory=list)
    artifacts: list[tuple[str, str, bool]] = field(default_factory=list)
    # (name, producer, ready)
    produced_artifact_ids: list[str] = field(default_factory=list)
    received_artifact_ids: list[str] = field(default_factory=list)
    category: str = ""
    run_in_background: bool = False
    delegation_task: str = ""
    delegation_session_id: str = ""
    inherited_context: list[str] = field(default_factory=list)

    @property
    def ctx_pct(self) -> int:
        if self.ctx_limit <= 0:
            return 0
        return round(100 * self.ctx_used / self.ctx_limit)

    @property
    def is_live(self) -> bool:
        return self.state is AgentState.RUNNING


@dataclass
class RunSummary:
    """Session-level control state, deliberately separate from task agents."""

    state: AgentState = AgentState.QUEUED
    activity: str = ""
    model: str = ""
    reasoning: str = "medium"
    ctx_used: int = 0
    ctx_limit: int = 128_000
    tool_calls: int = 0


@traces(SWR.SWR_2609)
@dataclass(frozen=True)
class VerifierSummary:
    """What the post-change check suite is doing right now (SWR-2609).

    Distinct from agent work on purpose: the run is still `running`, but nothing
    an agent does is what it is waiting on. ``active`` is False whenever no suite
    is in flight, which is the default and the state a finished run returns to.
    """

    active: bool = False
    #: Name of the check being executed, e.g. ``"pytest"``. Empty between checks.
    check: str = ""
    #: Command the running check invokes, shown as the row's detail.
    command: str = ""
    #: 1-based position of the running check, and how many the suite holds.
    index: int = 0
    total: int = 0
    #: ``time.time()`` when the running check started, so the elapsed clock is
    #: rendered client-side instead of being written on every tick.
    started_at: float = 0.0
    #: The running check's effective timeout in seconds, after the suite budget.
    deadline_s: float = 0.0
    #: Why this workspace is running with no quality gate, or "" (SWR-2615).
    #: Deliberately independent of ``active``: it describes the *absence* of a
    #: suite, so the one run that most needs to say something is the run with
    #: nothing in flight to say it.
    gate_warning: str = ""

    @property
    def position_label(self) -> str:
        """``"pytest (2/3)"`` — the check and where it sits in the suite."""
        if not self.check:
            return ""
        if self.total <= 0:
            return self.check
        return f"{self.check} ({self.index}/{self.total})"


@traces(SWR.SWR_2415, SWR.SWR_3612)
@dataclass
class SessionInfo:
    id: str
    name: str
    status: str  # attached | background | completed | idle
    branch: str = ""
    tokens_label: str = ""
    duration_label: str = ""
    detail: str = ""
    #: The run currently projected into the workspace view. Defaults to False so
    #: pre-parallel-run callers keep constructing SessionInfo unchanged.
    focused: bool = False
    #: The requirement this run implements, when one started it (SWR-3612).
    #: Empty means a person started this run — not "unknown" — so nothing at all
    #: is rendered for it. Defaults to "" so every existing caller, and every
    #: session directory written before requirement runs existed, keeps working.
    requirement_id: str = ""
    #: The execution unit within :attr:`requirement_id`. Same rule.
    unit_id: str = ""
    #: Whether this run is blocked on a person — an approval it raised or a
    #: question it asked (SWR-3625). Read from the session's own metadata, so it
    #: is answered for every session at once rather than for the focused one:
    #: only the focused run's pending prompts are ever projected into the store,
    #: which is exactly why a background run had no way to say it was waiting.
    awaiting_input: bool = False

    @property
    def attention(self) -> str:
        """``Waiting for your answer`` — or empty, which is the ordinary case.

        A sentence rather than a flag at the render site, so the four surfaces
        that state it (SWR-3625) cannot word it four ways.
        """
        return "Waiting for your answer" if self.awaiting_input else ""

    @property
    def attribution(self) -> str:
        """``SWR-3416 · swr-3416-impl-a1b2`` — what this run was started for.

        Empty for a run a person started, which is what lets every surface say
        "render this only when it is there" without a placeholder, a dash or an
        empty badge (SWR-3612).
        """
        if not self.requirement_id:
            return ""
        return f"{self.requirement_id} · {self.unit_id}" if self.unit_id else self.requirement_id


@dataclass
class TodoItem:
    """Editable task projected from a backend todo phase."""

    id: str
    phase_id: str
    status: str  # done | active | open
    text: str
    phase_name: str = ""


@traces(SWR.SWR_2419)
@dataclass
class TranscriptDiffLine:
    """One numbered line in a user-visible file diff."""

    kind: Literal["context", "add", "delete"]
    line_number: int
    text: str


@traces(SWR.SWR_2419)
@dataclass
class TranscriptDiff:
    """Structured user-only file diff projected into the transcript."""

    path: str
    operation: str
    created: bool = False
    added_lines: int = 0
    removed_lines: int = 0
    entries: list[TranscriptDiffLine] = field(default_factory=list)
    truncated: bool = False
    remaining_changed_lines: int = 0


@traces(SWR.SWR_2428)
@dataclass
class TranscriptEvent:
    timestamp: str
    role: str  # you | agent name | system | intent
    text: str
    # message | tool | system | user | intent | question_stepper | approval | edit_diff
    # | thinking | delegation_context | verifier
    kind: str = "message"
    tool: str = ""  # tool name for kind == "tool"
    detail: str = ""  # trailing dim detail (exit code, ids, …)
    full_text: str = ""  # untruncated tool-call summary, kind == "tool" only
    full_detail: str = ""  # untruncated tool-result detail, kind == "tool" only
    diff: TranscriptDiff | None = None  # structured payload, kind == "edit_diff" only
    persona: str = ""  # canonical persona label for per-persona coloring
    event_key: str = ""  # stable per-call key (tool rows), for expansion state (SWR-2448)
    status: str = ""  # running | ok | failed | blocked, kind == "tool" only (SWR-2444)
    duration: float = 0.0  # seconds, tool + thinking rows once finished
    started_at: float = 0.0  # wall-clock start, live thinking rows (SWR-2446)
    char_count: int = 0  # streamed reasoning chars, thinking rows (SWR-2446)
    #: Live terminal this row's command is running in, for the streaming preview
    #: and the pop-out window (SWR-2428). Empty on every other kind of row, and
    #: on terminal rows read back from a session that is no longer running.
    stream_id: str = ""


@dataclass
class ArtifactInfo:
    """One session artifact as the UI lists it (body loaded on demand)."""

    id: str
    slug: str
    title: str
    kind: str = "child_report"  # child_report | agent_published | system
    status: str = "succeeded"
    persona: str = ""  # source persona (agent type scope)
    producer: str = ""  # canonical agent instance that created it
    summary: str = ""
    created_label: str = ""
    edited: bool = False

    @property
    def ready(self) -> bool:
        return self.status in ("succeeded", "published")


@dataclass
class CommitInfo:
    hash: str
    message: str
    author: str
    time_label: str
    local: bool = True  # ahead-of-base commit vs already on base


@dataclass
class WorktreeInfo:
    branch: str
    path: str
    session: str = ""
    session_status: str = "idle"  # running | background | idle
    merge_status: str = "ready"  # ready | integrating | merged | merge_failed
    ahead: int = 0
    behind: int = 0
    additions: int = 0
    deletions: int = 0
    files_touched: int = 0
    agent_commits: int = 0
    is_base: bool = False
    active: bool = False


@dataclass
class McpServer:
    name: str
    type: str  # stdio | http | sse
    description: str = ""
    source: str = "yaml"  # yaml | project | user | default
    enabled: bool = True
    available: bool = True
    session_override: bool = False
    health: str = "unknown"  # unknown | checking | healthy | unreachable
    health_detail: str = ""
    tool_count: int | None = None


SERENA_INIT_TASK = "serena-setup"
"""Task id of the Serena project-setup initialization task (SWR-2801, SWR-2820)."""

LEGACY_SERENA_INIT_TASK = "serena"
"""The id the *agentic* setup recorded before SWR-2820 replaced it.

Workspaces initialized by an older build still carry it in
``initialization.completed``, and Settings ▸ Project renders whatever is recorded
— so it keeps its label rather than showing a bare id to someone who never chose
it.
"""

INIT_TASK_LABELS: dict[str, str] = {
    SERENA_INIT_TASK: "Serena project setup",
    LEGACY_SERENA_INIT_TASK: "Serena project setup",
}
"""Human-readable label per initialization task id, for prompts and lists."""


def init_task_label(task: str) -> str:
    """Return the display label for *task*, falling back to the raw task id.

    An unknown id is a future initialization task this build has no label for;
    showing the id beats showing nothing.
    """
    return INIT_TASK_LABELS.get(task, task)


@traces(SWR.SWR_2802, SWR.SWR_2805, SWR.SWR_2821)
@dataclass(frozen=True)
class ProjectInitState:
    """Project-initialization status as the UI renders it (SWR-2802, SWR-2805).

    Frozen with tuple fields so the store can compare a fresh projection
    against the current one and suppress a redundant signal — an unguarded
    emit re-opens the initialization modal on every config reload.

    The six workflow states of a Rotaris flow map onto the fields as:

    - first run / ready — :attr:`never_initialized` with a non-empty
      :attr:`pending`; :attr:`should_prompt` is the modal trigger.
    - in progress — :attr:`running`.
    - success — :attr:`resolved` with entries in :attr:`completed`.
    - empty — :attr:`resolved` with nothing pending and nothing applicable,
      i.e. no initialization task's prerequisites are met in this workspace.
    - recoverable error — :attr:`last_error` alongside a still-pending task,
      so the modal can offer a retry of exactly those tasks.
    """

    #: Applicable task ids that are neither completed nor skipped.
    pending: tuple[str, ...] = ()
    #: The subset of :attr:`pending` the user has to answer for (SWR-2821).
    #: Everything else in `pending` runs in the background on workspace open.
    pending_consent: tuple[str, ...] = ()
    #: Task ids recorded as successfully run in the workspace config.
    completed: tuple[str, ...] = ()
    #: Task ids the user deferred.
    skipped: tuple[str, ...] = ()
    #: "code" | "non-code" as recorded by the initializer (SWR-2804), or "".
    classification: str = ""
    #: True while no initialization outcome has ever been recorded.
    never_initialized: bool = True
    #: ISO-8601 timestamp of the last recorded run, or "" when never run.
    last_run: str = ""
    #: True while the initialization agent is running (transient, not persisted).
    running: bool = False
    #: Message of the last failed initialization run (transient, not persisted).
    last_error: str = ""

    @property
    def resolved(self) -> bool:
        """True when no applicable initialization task is still pending."""
        return not self.pending

    @property
    def should_prompt(self) -> bool:
        """True when the first-run modal should be on screen (SWR-2802, SWR-2821).

        A *view* over already-projected state, not the decision itself:
        :func:`rotaris_core.init.registry.resolve_or_prompt` owns the rule and its
        side effects (a workspace with no applicable task is marked initialized
        there, not here). This restates the same rule over the projection so a
        widget can render from the store alone without calling the backend on
        every repaint. Only ever true for a workspace that has never recorded an
        outcome; a skipped workspace keeps pending tasks but is re-entered
        manually through the SWR-2805 action instead.

        Keyed on :attr:`pending_consent`, not :attr:`pending`: work with no
        decision in it runs in the background and neither raises this modal nor
        gates a run. With no such task registered the prompt — and the composer
        gate that reads this — is dormant, and comes back on its own the day one
        is (SWR-2821).

        :attr:`never_initialized` is deliberately not part of it. Resolution is
        per task, and a task the user answered is already out of
        :attr:`pending_consent`; reading the workspace-wide flag as an answer
        would let a deterministic task finishing swallow the prompt for a consent
        task pending beside it.
        """
        return bool(self.pending_consent) and not self.running

    @property
    def pending_labels(self) -> tuple[str, ...]:
        """Display labels for :attr:`pending`, in the same order."""
        return tuple(init_task_label(task) for task in self.pending)


@dataclass
class SkillInfo:
    name: str
    scope: str  # project | user
    description: str = ""
    trigger: str = ""
    path: str = ""
    load_scope: str = ""  # "this session" | "every session" | ""
    in_context: bool = False
    load_mode: str = "name-only"  # off | name-only | user-invocable-only | on
    invocation_mode: str = "default"  # default | manual-only | auto-only
    shadowed_paths: tuple[str, ...] = ()


@dataclass
class PersonaSpec:
    name: str
    role: str
    model: str
    reasoning: str
    tools: list[str] = field(default_factory=list)
    model_scope: str = "default"  # "workspace" | "global" | "default"
    reasoning_scope: str = "default"  # "workspace" | "global" | "default"


@dataclass
class ProviderInfo:
    id: str
    label: str
    connected: bool
    detail: str = ""
    status: str = "unknown"  # checking | healthy | warning | unauthenticated | error
    auth_flow: str = ""
    user_defined: bool = False
    has_credentials: bool | None = None
    quick_start_url: str | None = None

    def __post_init__(self) -> None:
        if self.has_credentials is None:
            self.has_credentials = self.connected


@traces(SWR.SWR_2814)
@dataclass(frozen=True)
class ModelOption:
    """One entry in a model picker, and whether it can actually be chosen.

    A provider lists models it will not accept — switched off by account policy, or
    reachable only on an endpoint Rotaris cannot use. Dropping those made the picker
    quietly disagree with the provider's own settings page, so they stay listed and
    carry their reason instead (SWR-2812).
    """

    name: str
    available: bool = True
    #: One sentence the user can act on, already carrying the provider's own
    #: wording when it gave any. Empty whenever ``available`` is True.
    reason: str = ""


@dataclass
class SubscriptionLimit:
    label: str
    used_label: str
    pct: int
    detail: str = ""
    color: str = ""


@traces(SWR.SWR_3013)
@dataclass(frozen=True)
class CloudCredit:
    """What Rotaris knows about the signed-in Rotaris Cloud account's credit.

    Rotaris Cloud is prepaid, so a balance is not a percentage of anything and
    carries no denominator a meter could use. The money is pre-rendered here for
    the same reason ``KpiSnapshot.cumulative_cost_label`` is: no view should have
    to decide how an account's money reads.
    """

    #: signed_out | loading | ready | error — every one of them has a display.
    phase: str = "signed_out"
    #: available | exhausted | overdrafted | unknown. Empty unless ``phase`` is ready.
    state: str = ""
    balance_label: str = ""
    #: What the account was last billed, e.g. ``"last call $0.0031"``. Empty for
    #: an account that has never billed one.
    last_cost_label: str = ""
    #: The backend's own answer to "may this account spend right now".
    admission_allowed: bool = True
    #: Technical detail for a failed read, kept copyable rather than paraphrased.
    error: str = ""

    STATE_LABELS = {
        "available": "Funded",
        "exhausted": "Out of credit",
        "overdrafted": "Overdrawn",
        "unknown": "Unknown state",
    }

    @property
    def state_label(self) -> str:
        return self.STATE_LABELS.get(self.state, "Unknown state")

    @property
    def blocked(self) -> bool:
        """The account cannot pay for the next call."""
        return self.phase == "ready" and not self.admission_allowed


@dataclass
class ImprovementProposal:
    id: str
    artifact_id: str
    category: str
    summary: str
    recommended_action: str = ""
    risk: str = "low"  # low | medium | high
    status: str = "pending_review"  # pending_review | approved | rejected | deferred
    created_label: str = ""


@dataclass
class KpiSnapshot:
    cumulative_tokens: int = 0
    # Pre-rendered by rotaris_core.cost.format_cost — carries the "n/a",
    # "(partial)" and "(configured)" qualifiers so no view has to decide
    # what an unpriced run costs.
    cumulative_cost_label: str = ""
    token_history: list[int] = field(default_factory=list)
    tool_calls: int = 0
    tool_call_breakdown: list[tuple[str, int]] = field(default_factory=list)
    files_touched: int = 0
    uncommitted: int = 0


@dataclass
class DelegationSettings:
    strategy: str = "orchestrator"  # orchestrator | swarm | single
    depth_cap: int = 3
    fanout_limit: int = 8
    child_timeout_label: str = "20m"

    STRATEGY_LABELS = {
        "orchestrator": "Orchestrator",
        "swarm": "Swarm",
        "single": "Single agent",
    }

    @property
    def strategy_label(self) -> str:
        return self.STRATEGY_LABELS.get(self.strategy, self.strategy)


@dataclass
class RuntimeToggles:
    compression_threshold_pct: int = 80
    circuit_breaker: bool = True
    allow_outside_workspace: bool = False
    improvement_loop: bool = True
    iteration_cap: int = 25
    #: SWR-2503 preset name; mirrors ``RuntimeConfig.permission_mode``.
    permission_mode: str = "ask"
    #: SWR-2507 OS-level sandbox: off | workspace-write | read-only. Names and
    #: defaults mirror ``RuntimePolicy`` exactly so the desktop never invents a
    #: vocabulary the engine would reject on assignment.
    sandbox_mode: str = "off"
    #: Absolute paths that stay writable inside the sandbox (SWR-2507).
    sandbox_writable_roots: list[str] = field(default_factory=list)
    #: Whether sandboxed commands may reach the network at all (SWR-2507).
    sandbox_allow_network: bool = False
    #: SWR-2505 disposition for a host in neither list: allow | ask | deny.
    network_egress_policy: str = "ask"
    #: SWR-2505 host patterns always permitted; one leading ``*.`` is the only
    #: wildcard, and a denied pattern still wins over a matching entry here.
    network_allowed_hosts: list[str] = field(default_factory=list)
    #: SWR-2505 host patterns always refused, whatever else matches.
    network_denied_hosts: list[str] = field(default_factory=list)


@traces(SWR.SWR_2437)
@dataclass(frozen=True)
class CheckpointRow:
    """One recorded checkpoint, in the columns SWR-2437 asks a listing to show."""

    sequence: int
    #: Already formatted for display; the view does no date arithmetic.
    created_label: str = ""
    iteration: int = 0
    file_count: int = 0
    kind: str = "iteration"


@traces(SWR.SWR_2437)
@dataclass(frozen=True)
class CheckpointList:
    """Everything the checkpoint panel renders for one session.

    ``available`` is the engine's own verdict (a session it does not know, a tree
    Git does not manage); ``blocked_reason`` is why a restore is currently
    refused for reasons that have nothing to do with a particular checkpoint —
    today, that the session is still running.
    """

    session_id: str = ""
    rows: tuple[CheckpointRow, ...] = ()
    available: bool = False
    unavailable_reason: str = ""
    loading: bool = False
    #: The working tree a restore would rewrite — an isolated session's worktree
    #: rather than the user's own checkout, which the confirmation names.
    tree_root: str = ""


@traces(SWR.SWR_2437)
@dataclass(frozen=True)
class CheckpointPreview:
    """What restoring one checkpoint would do, ready to render.

    ``lines`` comes from the engine's own ``format_preview_lines``, which labels
    every path with the verb a restore applies to it. The desktop never derives
    that verb from a status letter: ``"A"`` means a restore *deletes* the path,
    and inverting it here a second time is how a confirmation dialog ends up
    promising the opposite of what happens.
    """

    session_id: str = ""
    sequence: int = 0
    lines: tuple[str, ...] = ()
    changed_count: int = 0
    dirty_paths: tuple[str, ...] = ()
    blocked_reason: str = ""

    @property
    def needs_force(self) -> bool:
        """Whether only an explicit overwrite opt-in can let this restore run."""
        return bool(self.dirty_paths) and bool(self.blocked_reason)

    @property
    def restorable(self) -> bool:
        """Whether a restore can happen at all, with or without forcing."""
        return not self.blocked_reason or self.needs_force


@traces(SWR.SWR_2437)
@dataclass(frozen=True)
class CheckpointRestoreOutcome:
    """The result of an attempted rollback, as the window reports it."""

    session_id: str = ""
    sequence: int = 0
    restored: bool = False
    changed_count: int = 0
    #: Sequence of the ``pre_restore`` checkpoint, or 0 when none was needed.
    safety_sequence: int = 0
    blocked_reason: str = ""


@traces(SWR.SWR_2701)
@dataclass(frozen=True)
class HookInfo:
    """One effective lifecycle hook, as the Hooks settings tab lists it.

    ``command`` is authored by whoever wrote the config this hook came from. For
    a ``workspace`` hook that is a file which travelled inside a clone, so the
    text is rendered **only** inside the review dialog the user deliberately
    opened — never in the tab, a tooltip, or a notice.
    """

    name: str
    event: str
    matcher: str
    source: str
    command: str
    allowed: bool = False
    required: bool = False
    timeout_seconds: float = 0.0

    @property
    def scope_label(self) -> str:
        """Where this hook came from, in words rather than a config token."""
        return {
            "workspace": "workspace",
            "global": "your global config",
            "default": "built-in",
        }.get(self.source, self.source or "unknown")


@traces(SWR.SWR_2701, SWR.SWR_2704)
@dataclass(frozen=True)
class HookTrustSummary:
    """The workspace's hook set plus the verdict recorded against it."""

    workspace: str = ""
    #: ``none`` (nothing to decide) | ``review`` | ``trusted`` | ``refused``
    status: str = "none"
    #: Digest of the hook set awaiting a verdict; empty when none is pending.
    digest: str = ""
    hooks: tuple[HookInfo, ...] = ()
    #: Exactly the workspace hooks a review would show.
    pending: tuple[HookInfo, ...] = ()
    #: The engine's own sentence about hooks that did not run, or "".
    notice: str = ""

    @property
    def review_due(self) -> bool:
        return self.status == "review" and bool(self.pending)

    @property
    def status_label(self) -> str:
        return {
            "none": "This workspace declares no hooks of its own.",
            "review": "This workspace declares hooks that have not been reviewed yet.",
            "trusted": "You allowed this workspace's hooks to run.",
            "refused": "You refused this workspace's hooks; they are skipped.",
        }.get(self.status, self.status)


@traces(SWR.SWR_2509)
def permission_mode_names() -> list[str]:
    """The SWR-2503 mode presets, strictest first.

    Read from the backend rather than hard-coded, so a preset added there shows
    up in the desktop selectors without a second edit here.
    """
    from rotaris_core.permissions import PRESETS

    order = ["restricted", "ask", "autonomous"]
    known = [name for name in order if name in PRESETS]
    return known + [name for name in PRESETS if name not in order]
