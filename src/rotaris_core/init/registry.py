"""Registry of project-initialization tasks and the prompt decision (SWR-2802).

This module is the extensibility seam of the SWR-2800 epic. The decision logic
here never mentions a concrete task: it asks every *registered* task whether its
prerequisites are met and compares the result against the recorded
:class:`~rotaris_core.config.schema.InitializationState`. Serena project setup is
one registered entry (:data:`SERENA_SETUP_TASK`), not a special case — a future
task (paths, instructions, scripts, tool bootstrapping) becomes part of the
decision by calling :func:`register_task`, with no change to the contract.

Two task sets matter, and they are deliberately different:

``pending_tasks``
    Prerequisites met and the task appears in *neither* ``completed`` nor
    ``skipped``. This is the first-run set — what the SWR-2802 modal offers on a
    workspace that has never been initialized.

``runnable_tasks``
    Prerequisites met and the task is not in ``completed``. A **skipped** task
    stays runnable: skipping defers a task, it does not finish it. This is the
    SWR-2805 set — what a manual "Initialize Project…" re-trigger executes,
    which is exactly the requirement's "the init agent runs only the
    still-pending tasks. Already-completed tasks are not re-run."

``background_tasks``
    The subset of ``pending_tasks`` that needs no decision from the user
    (SWR-2821). This is what a workspace open may simply start: no modal, no run
    gate. ``consent_tasks`` is its complement over the same set, and is what
    :func:`should_prompt` asks about.

Both of the last two are drawn from ``pending_tasks`` rather than
``runnable_tasks`` because both are about a question: one the user has answered
by skipping is not asked again, and not started behind their back either. The
manual SWR-2805 action still offers it, which is how they get it back.

Skipping stops the automatic prompt because it resolves the task, and
:func:`should_prompt` asks per task rather than per workspace. It deliberately
does *not* consult the workspace-wide "never initialized" flag: with background
work in the mix, a deterministic task finishing would stamp ``last_run`` and
silently swallow the prompt for a consent task pending beside it.

*Execution* is generic in the same way as discovery. Each task carries its own
:attr:`InitTask.run` callable returning an :class:`InitTaskResult`, and
:func:`run_pending_tasks` drives them all without ever branching on a task id —
so the Rotaris wiring calls one function and never names Serena. Adding a task
means registering a descriptor; it means no UI change.

The recorded state is always read from the workspace file rather than from
``config.initialization``, so a decision made right after
:func:`record_result` reflects the write instead of a stale in-memory config.
Callers holding a known-fresh state can pass it in via ``state=``.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, replace
from typing import TYPE_CHECKING, Any, Literal, Protocol, cast

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Callable, Iterable, Sequence
    from pathlib import Path

    from rotaris_core.config.project_init_state import TaskOutcome
    from rotaris_core.config.schema import InitializationState, RotarisConfig

_log = logging.getLogger(__name__)

SERENA_TASK_ID = "serena"
"""Stable id of the *agentic* Serena setup task (SWR-2803), as recorded in the config.

No longer registered (SWR-2820). It survives as a constant because workspaces
initialized before that change carry it in ``initialization.completed``, and
reading their config must not become an unknown-id path.
"""

SERENA_SETUP_TASK_ID = "serena-setup"
"""Stable id of the deterministic Serena setup task (SWR-2820)."""

SERENA_MCP_SERVER_NAME = "serena"
"""Name the Serena MCP server is configured under in ``mcp_servers``."""

__all__ = [
    "SERENA_MCP_SERVER_NAME",
    "SERENA_SETUP_TASK",
    "SERENA_SETUP_TASK_ID",
    "SERENA_TASK",
    "SERENA_TASK_ID",
    "InitPromptDecision",
    "InitProgressCallback",
    "InitStepResult",
    "InitStepStatus",
    "InitTask",
    "InitTaskResult",
    "InitTaskRunner",
    "InitTaskStatus",
    "applicable_tasks",
    "background_tasks",
    "consent_tasks",
    "get_task",
    "mark_initialized",
    "pending_tasks",
    "record_result",
    "record_skipped",
    "register_task",
    "registered_tasks",
    "resolve_or_prompt",
    "run_pending_tasks",
    "runnable_tasks",
    "should_prompt",
    "unregister_task",
]

InitStepStatus = str
"""Outcome vocabulary for a single step.

Deliberately open rather than a closed ``Literal``: the generic statuses are
``"success"`` / ``"skipped"`` / ``"failure"``, but a task may report a narrower
reason of its own — the Serena task uses ``"skipped-no-code"`` for the
onboarding step it skips on a documentation-only project (SWR-2804). The modal
renders :attr:`InitStepResult.detail`, not the status, so new vocabulary costs
the UI nothing. Task-level status (:data:`InitTaskStatus`) stays closed, because
the registry branches on it when recording state.
"""

InitTaskStatus = Literal["success", "skipped", "failure"]
"""Overall outcome of one initialization task."""


@traces(SWR.SWR_2800, SWR.SWR_2803)
@dataclass(frozen=True)
class InitStepResult:
    """One reportable step of an initialization task.

    `detail` is a single human-readable line the modal renders verbatim —
    "Serena project activated", "no code found, onboarding skipped".
    """

    name: str
    status: InitStepStatus
    detail: str = ""


@traces(SWR.SWR_2800, SWR.SWR_2802, SWR.SWR_2803)
@dataclass(frozen=True)
class InitTaskResult:
    """What one initialization task reports back, task-agnostically.

    This is the contract between a task's runner and the UI. It carries no Qt
    and no SDK types, so a runner can build one without importing either.

    - `status` ``"success"`` records the task as completed, ``"skipped"``
      records it as skipped, and ``"failure"`` records **nothing** — SWR-2803
      requires a failed task to leave ``initialization`` untouched so the user
      can retry.
    - `steps` is ordered and drives the modal's per-step report.
    - `classification` (``'code'`` / ``'non-code'``, SWR-2804) is forwarded into
      the recorded state when the task determined one.
    - `error` is the failure message shown next to the modal's retry action.
      It is expected whenever `status` is ``"failure"``.
    - `retryable` says whether re-running could plausibly succeed. The modal's
      retry action honours this rather than assuming every failure is worth
      another attempt.
    - `summary` is one or two sentences of user-facing text for the modal, when
      the per-step details alone would not tell the user what happened.
    """

    task_id: str
    status: InitTaskStatus
    steps: tuple[InitStepResult, ...] = ()
    classification: str | None = None
    error: str | None = None
    retryable: bool = False
    summary: str = ""

    @property
    def succeeded(self) -> bool:
        """True when the task ran to completion (a skip is not a success)."""
        return self.status == "success"

    def step(self, name: str) -> InitStepResult | None:
        """Return the named step's result, or ``None`` when the task has none."""
        for entry in self.steps:
            if entry.name == name:
                return entry
        return None

    def step_status(self, name: str) -> str | None:
        """Return the named step's status, or ``None`` when the task has none."""
        entry = self.step(name)
        return entry.status if entry is not None else None


class InitTaskRunner(Protocol):
    """Callable that performs one initialization task.

    Extra keyword arguments passed to :func:`run_pending_tasks` are forwarded
    unchanged, which is how a caller hands a runner the collaborators it needs
    (an agent runner, a cancellation token) without the registry knowing them.
    """

    def __call__(
        self,
        config: RotarisConfig,
        workspace_root: Path,
        **kwargs: Any,
    ) -> InitTaskResult: ...


class InitProgressCallback(Protocol):
    """Notified as :func:`run_pending_tasks` walks the task list.

    Called with ``result=None`` when a task starts and with the finished
    :class:`InitTaskResult` when it ends, so the modal can show the SWR-2802
    in-progress state without knowing which tasks exist.
    """

    def __call__(self, task: InitTask, result: InitTaskResult | None) -> None: ...


@traces(SWR.SWR_2800, SWR.SWR_2802)
@dataclass(frozen=True)
class InitTask:
    """One registered project-initialization task.

    `prerequisite_met` is called as ``task.prerequisite_met(config, root)`` and
    answers "does this workspace have what this task needs?" — for Serena, that
    the MCP server is configured and its command resolves. A task whose
    prerequisites are unmet is invisible: it never appears in the modal and
    never keeps the prompt alive.

    `run` performs the task and reports an :class:`InitTaskResult`. It is a
    member of the descriptor rather than something the caller dispatches on, so
    :func:`run_pending_tasks` can execute any task without knowing what it is.
    A runner that needs a heavy module should import it *inside* the callable —
    that is what keeps this registry importable everywhere.

    `requires_consent` says whether the *user* has anything to decide (SWR-2821).
    It defaults to ``False`` because a task that needs a person is the exception:
    the deterministic setup spends nothing, decides nothing, and asking about it
    only teaches people to click through dialogs. A task that runs an agent —
    spending money and writing durable content — sets it, and only then does the
    SWR-2802 prompt appear and gate runs.

    The distinction is consent, not cost or duration. A background task may well
    take minutes; what makes it background is that there is no decision in it.
    """

    id: str
    label: str
    description: str
    prerequisite_met: Callable[[RotarisConfig, Path], bool]
    run: InitTaskRunner
    requires_consent: bool = False


@traces(SWR.SWR_2802, SWR.SWR_2821)
@dataclass(frozen=True)
class InitPromptDecision:
    """What the UI should do about initialization for a workspace.

    `tasks` is always the :func:`runnable_tasks` set — everything initialization
    would execute if it started right now. On a never-initialized workspace
    nothing can be completed yet, so it equals the pending set.

    `background` is the subset of `tasks` the caller may simply start, with no
    dialog and no gate (SWR-2821). It is handed out here rather than re-derived
    by the caller so that the "does this need a person?" rule lives in one place
    alongside the prompt rule it is the complement of.
    """

    should_prompt: bool
    tasks: tuple[InitTask, ...]
    auto_resolved: bool
    background: tuple[InitTask, ...] = ()


_REGISTRY: dict[str, InitTask] = {}


@traces(SWR.SWR_2800)
def register_task(task: InitTask, *, replace: bool = False) -> None:
    """Add *task* to the registry so it participates in the prompt decision.

    Raises `ValueError` on a duplicate id unless ``replace=True``, so two
    features cannot silently claim the same recorded task id.
    """
    if not replace and task.id in _REGISTRY:
        raise ValueError(f"Initialization task {task.id!r} is already registered")
    _REGISTRY[task.id] = task


@traces(SWR.SWR_2800)
def unregister_task(task_id: str) -> None:
    """Remove *task_id* from the registry; a no-op when it is not registered."""
    _REGISTRY.pop(task_id, None)


@traces(SWR.SWR_2800)
def registered_tasks() -> tuple[InitTask, ...]:
    """Return every registered task, in registration order."""
    return tuple(_REGISTRY.values())


@traces(SWR.SWR_2800)
def get_task(task_id: str) -> InitTask | None:
    """Return the registered task with *task_id*, or `None`."""
    return _REGISTRY.get(task_id)


def _resolve_tasks(tasks: Sequence[InitTask] | None) -> tuple[InitTask, ...]:
    return registered_tasks() if tasks is None else tuple(tasks)


def _resolve_state(
    workspace_root: Path,
    state: InitializationState | None,
) -> InitializationState:
    if state is not None:
        return state
    from rotaris_core.config.project_init_state import (  # noqa: PLC0415 — lazy per AGENTS.md
        read_initialization_state,
    )

    return read_initialization_state(workspace_root)


def _prerequisite_met(task: InitTask, config: RotarisConfig, workspace_root: Path) -> bool:
    try:
        return bool(task.prerequisite_met(config, workspace_root))
    except Exception:
        _log.warning(
            "Prerequisite check for initialization task %r failed; "
            "treating the task as not applicable.",
            task.id,
            exc_info=True,
        )
        return False


@traces(SWR.SWR_2800, SWR.SWR_2802)
def applicable_tasks(
    config: RotarisConfig,
    workspace_root: Path,
    *,
    tasks: Sequence[InitTask] | None = None,
) -> list[InitTask]:
    """Return the registered tasks whose prerequisites this workspace meets.

    Ignores the recorded state entirely — this is "what could ever run here".
    """
    return [
        task for task in _resolve_tasks(tasks) if _prerequisite_met(task, config, workspace_root)
    ]


@traces(SWR.SWR_2802)
def pending_tasks(
    config: RotarisConfig,
    workspace_root: Path,
    *,
    tasks: Sequence[InitTask] | None = None,
    state: InitializationState | None = None,
) -> list[InitTask]:
    """Return applicable tasks that are in neither ``completed`` nor ``skipped``.

    The first-run set backing the SWR-2802 prompt. A task the user skipped is
    *not* here — see :func:`runnable_tasks` for the manual re-trigger set.
    """
    recorded = _resolve_state(workspace_root, state)
    return [
        task
        for task in applicable_tasks(config, workspace_root, tasks=tasks)
        if not recorded.is_resolved(task.id)
    ]


@traces(SWR.SWR_2802, SWR.SWR_2805)
def runnable_tasks(
    config: RotarisConfig,
    workspace_root: Path,
    *,
    tasks: Sequence[InitTask] | None = None,
    state: InitializationState | None = None,
) -> list[InitTask]:
    """Return applicable tasks that have not completed yet.

    SWR-2805: a manual re-initialization runs the still-pending tasks and never
    re-runs completed ones. A previously **skipped** task is still pending work,
    so it is included here even though it no longer raises the prompt.
    """
    recorded = _resolve_state(workspace_root, state)
    return [
        task
        for task in applicable_tasks(config, workspace_root, tasks=tasks)
        if task.id not in recorded.completed
    ]


@traces(SWR.SWR_2821)
def background_tasks(
    config: RotarisConfig,
    workspace_root: Path,
    *,
    tasks: Sequence[InitTask] | None = None,
    state: InitializationState | None = None,
) -> list[InitTask]:
    """Return still-pending tasks that need no decision from the user (SWR-2821).

    What a workspace open may simply *do*. Drawn from :func:`pending_tasks`, so a
    task the user explicitly skipped stays skipped: the SWR-2805 modal lists
    background work too and offers *Skip* for it, and starting it again on the
    next open would quietly overrule an answer they did give. It remains in
    :func:`runnable_tasks`, so that same manual action can still run it whenever
    they want it.
    """
    return [
        task
        for task in pending_tasks(config, workspace_root, tasks=tasks, state=state)
        if not task.requires_consent
    ]


@traces(SWR.SWR_2821)
def consent_tasks(
    config: RotarisConfig,
    workspace_root: Path,
    *,
    tasks: Sequence[InitTask] | None = None,
    state: InitializationState | None = None,
) -> list[InitTask]:
    """Return first-run tasks the user has to answer for (SWR-2821).

    Drawn from :func:`pending_tasks`, the first-run set: a consent task the user
    already skipped has been answered, and re-asking would make "Skip" mean
    "ask me again next time".
    """
    return [
        task
        for task in pending_tasks(config, workspace_root, tasks=tasks, state=state)
        if task.requires_consent
    ]


@traces(SWR.SWR_2802, SWR.SWR_2821)
def should_prompt(
    config: RotarisConfig,
    workspace_root: Path,
    *,
    tasks: Sequence[InitTask] | None = None,
    state: InitializationState | None = None,
) -> bool:
    """True when the workspace should be shown the initialization modal.

    One condition, and it is per task: some applicable task needs the user and
    they have not answered it — neither completed nor skipped (SWR-2802 through
    :func:`consent_tasks`, SWR-2821).

    A workspace whose only pending work is deterministic answers ``False``: that
    work runs in the background, and a prompt asking permission for it would put
    a question in front of someone with no basis to answer it, while gating runs
    on something that is not a precondition for any of them.

    The workspace-wide "never initialized" flag is deliberately *not* consulted.
    It used to stand in for "has this been answered?", which was true while every
    task was prompted; with background work it no longer is. A deterministic task
    finishing stamps ``last_run``, and reading that as an answer would silently
    swallow the prompt for a consent task pending beside it. Per-task resolution
    says the same thing about a prompted task and nothing false about the others.
    """
    return bool(consent_tasks(config, workspace_root, tasks=tasks, state=state))


@traces(SWR.SWR_2802)
def mark_initialized(workspace_root: Path) -> InitializationState:
    """Stamp ``last_run`` without changing the recorded task lists.

    This is how a workspace with no applicable task leaves the "never
    initialized" state (SWR-2802: "no prompt is shown and the workspace is
    marked as initialized (empty task list)"). Existing ``completed`` /
    ``skipped`` entries and the recorded classification are preserved.
    """
    from rotaris_core.config.project_init_state import (  # noqa: PLC0415 — lazy per AGENTS.md
        read_initialization_state,
        utc_now_iso,
        write_initialization_state,
    )
    from rotaris_core.config.schema import InitializationState  # noqa: PLC0415 — lazy per AGENTS.md

    current = read_initialization_state(workspace_root)
    updated = InitializationState(
        completed=list(current.completed),
        skipped=list(current.skipped),
        last_run=utc_now_iso(),
        classification=current.classification,
    )
    write_initialization_state(workspace_root, updated)
    return updated


@traces(SWR.SWR_2802, SWR.SWR_2821)
def resolve_or_prompt(
    config: RotarisConfig,
    workspace_root: Path,
    *,
    tasks: Sequence[InitTask] | None = None,
) -> InitPromptDecision:
    """Decide what initialization owes *workspace_root*, resolving the trivial case.

    The UI calls this on workspace open and does not re-derive the rule:

    - never initialized **and** no applicable task → the workspace is marked
      initialized with an empty task list here, and nothing is shown or started
      (``auto_resolved=True``);
    - never initialized **and** a pending task that needs the user → prompt, with
      the pending tasks to list (SWR-2802);
    - anything pending that needs no user → returned in `background` for the
      caller to start straight away (SWR-2821), whether or not a prompt is also
      due;
    - already resolved → no prompt; `tasks` still carries whatever a manual
      SWR-2805 re-trigger would run, which is empty once everything completed.

    A never-initialized workspace whose only pending work is background work is
    deliberately **not** marked initialized here: the marker is the registry's to
    write when the work finishes (`_record_or_fail`), and stamping it up front
    would report success for a run that has not happened yet.
    """
    recorded = _resolve_state(workspace_root, None)
    # Prerequisites are probed once here; every branch below reuses the result.
    applicable = applicable_tasks(config, workspace_root, tasks=tasks)
    remaining = tuple(task for task in applicable if task.id not in recorded.completed)
    background = tuple(
        task
        for task in remaining
        if not task.requires_consent and not recorded.is_resolved(task.id)
    )

    if recorded.never_initialized and not applicable:
        mark_initialized(workspace_root)
        return InitPromptDecision(should_prompt=False, tasks=(), auto_resolved=True)

    prompt = any(task.requires_consent for task in remaining if not recorded.is_resolved(task.id))
    return InitPromptDecision(
        should_prompt=prompt,
        tasks=remaining,
        auto_resolved=False,
        background=background,
    )


@traces(SWR.SWR_2802)
def record_result(
    workspace_root: Path,
    task_id: str,
    *,
    outcome: TaskOutcome,
    classification: str | None = None,
) -> InitializationState:
    """Record one task's outcome into the workspace config and return the state.

    Thin routing over
    :func:`rotaris_core.config.project_init_state.mark_task`, so the UI has a
    single entry point next to the decision functions.
    """
    from rotaris_core.config.project_init_state import mark_task  # noqa: PLC0415 — lazy

    return mark_task(
        workspace_root,
        task_id,
        outcome=outcome,
        classification=classification,
    )


@traces(SWR.SWR_2802)
def record_skipped(workspace_root: Path, task_ids: Iterable[str]) -> InitializationState:
    """Record every id in *task_ids* as skipped ("Skip" defers all pending tasks).

    An empty *task_ids* still marks the workspace initialized, so a skip can
    never leave it in the "never initialized" state that re-raises the prompt.
    """
    ids = list(task_ids)
    if not ids:
        return mark_initialized(workspace_root)

    state = record_result(workspace_root, ids[0], outcome="skipped")
    for task_id in ids[1:]:
        state = record_result(workspace_root, task_id, outcome="skipped")
    return state


_OUTCOME_BY_STATUS: dict[str, TaskOutcome] = {"success": "completed", "skipped": "skipped"}
"""How a reported task status becomes a recorded outcome. ``failure`` is absent
on purpose: SWR-2803 requires a failed task to leave ``initialization``
untouched so the prompt can be re-triggered."""


def _execute(
    task: InitTask,
    config: RotarisConfig,
    workspace_root: Path,
    kwargs: dict[str, Any],
) -> InitTaskResult:
    """Call one task's runner, converting any escape into a failure result.

    A runner that raises must not take the whole initialization run — or the
    modal — down with it; the user gets a retryable error instead.
    """
    try:
        result = task.run(config, workspace_root, **kwargs)
    except Exception as exc:
        _log.warning("Initialization task %r raised.", task.id, exc_info=True)
        return InitTaskResult(
            task_id=task.id,
            status="failure",
            error=str(exc) or exc.__class__.__name__,
        )

    if not isinstance(result, InitTaskResult):
        return InitTaskResult(
            task_id=task.id,
            status="failure",
            error=(
                f"Initialization task {task.id!r} returned "
                f"{type(result).__name__}, expected InitTaskResult."
            ),
        )
    return result


@traces(SWR.SWR_2800, SWR.SWR_2802, SWR.SWR_2805)
def run_pending_tasks(
    config: RotarisConfig,
    workspace_root: Path,
    *,
    tasks: Sequence[InitTask] | None = None,
    on_progress: InitProgressCallback | None = None,
    **kwargs: Any,
) -> list[InitTaskResult]:
    """Run every still-pending task and record each outcome. Returns the results.

    This is the whole execution seam: the loop dispatches through
    :attr:`InitTask.run` and never branches on a task id, so the Rotaris wiring
    calls this one function and a future task needs no UI change.

    - The task set is :func:`runnable_tasks` — SWR-2805's "only the still-pending
      tasks", which includes previously skipped ones and excludes completed ones.
    - Each result is recorded through
      :func:`rotaris_core.config.project_init_state.mark_task`, carrying any
      `classification` the task determined (SWR-2804). A ``"failure"`` records
      nothing, leaving that task pending for a retry.
    - A failing task does not abort the run; the remaining tasks still execute.
    - With nothing to run, a never-initialized workspace is still marked
      initialized, so an empty run cannot leave the prompt reappearing.
    - Extra keyword arguments are forwarded verbatim to every runner.
    """
    pending = runnable_tasks(config, workspace_root, tasks=tasks)
    if not pending:
        if _resolve_state(workspace_root, None).never_initialized:
            mark_initialized(workspace_root)
        return []

    results: list[InitTaskResult] = []
    for task in pending:
        if on_progress is not None:
            on_progress(task=task, result=None)

        result = _execute(task, config, workspace_root, kwargs)
        outcome = _OUTCOME_BY_STATUS.get(result.status)
        if outcome is not None:
            result = _record_or_fail(result, workspace_root, task, outcome)

        results.append(result)
        if on_progress is not None:
            on_progress(task=task, result=result)

    return results


def _record_or_fail(
    result: InitTaskResult,
    workspace_root: Path,
    task: InitTask,
    outcome: str,
) -> InitTaskResult:
    """Record `result` and return it, or downgrade it to a failure if the write fails.

    The registry is the sole writer of the `initialization:` marker, so a task
    that ran perfectly but could not be persisted must not be reported as a
    success — the next workspace open would prompt again and re-run work the
    user already paid for. Turning it into a retryable failure keeps the modal's
    retry action honest, and keeps every future task from having to remember
    this rule for itself.
    """
    try:
        record_result(
            workspace_root,
            task.id,
            outcome=outcome,  # type: ignore[arg-type]
            classification=result.classification,
        )
    except Exception as exc:  # noqa: BLE001 — an unpersisted task is a failed task
        _log.exception(
            "Initialization task '%s' finished but its marker could not be written",
            task.id,
        )
        return replace(
            result,
            status="failure",
            error=(f"{task.label} completed, but the workspace config could not be written: {exc}"),
            retryable=True,
            summary=(
                f"{task.label} finished, but the result could not be saved. Retry initialization."
            ),
        )
    return result


def _serena_prerequisite_met(config: RotarisConfig, workspace_root: Path) -> bool:
    """True when `serena` is a configured MCP server whose command resolves.

    Asks the shared availability rule
    (:func:`rotaris_core.config.mcp_resolution.mcp_server_is_available`) rather than
    re-deriving it, so the prompt and the personas agree on what "Serena is
    available" means: a literal ``shutil.which(server.command)`` here would call
    ``uvx:serena`` unavailable while the persona factory launches it happily.

    The public helper is used in preference to the factory's private wrapper
    because this check now runs on every workspace open, and the factory pulls
    in the whole agent layer to answer a PATH question.
    """
    server_cfg = config.mcp_servers.get(SERENA_MCP_SERVER_NAME)
    if server_cfg is None:
        return False

    from rotaris_core.config.mcp_resolution import (  # noqa: PLC0415 — lazy per module policy
        mcp_server_is_available,
    )

    return mcp_server_is_available(
        SERENA_MCP_SERVER_NAME,
        server_cfg,
        workspace_root=workspace_root,
    )


_SERENA_SETUP_MODULE = "rotaris_core.init.serena_setup"
_SERENA_SETUP_ATTRIBUTE = "run_serena_setup"

_SERENA_RUNNER_MODULE = "rotaris_core.init.serena_task"
_SERENA_RUNNER_ATTRIBUTE = "run_serena_initialization_sync"
"""The *blocking* adapter, not the coroutine beside it.

`run_pending_tasks` is synchronous — it is driven from a Qt worker thread with
no running event loop. Registering the coroutine function here would make every
Serena run fail with an un-awaited coroutine.
"""


def _run_serena_task(
    config: RotarisConfig,
    workspace_root: Path,
    **kwargs: Any,
) -> InitTaskResult:
    """Run Serena activation + onboarding (SWR-2803) through its own module.

    The import is deferred into the call so this registry — and therefore the
    prompt decision — stays importable and testable on a build where the Serena
    runner is not present. A missing runner is reported as a retryable failure
    rather than raised, which is the same shape the modal renders for any other
    initialization error.
    """
    try:
        import importlib  # noqa: PLC0415 — lazy by design

        module = importlib.import_module(_SERENA_RUNNER_MODULE)
        runner = getattr(module, _SERENA_RUNNER_ATTRIBUTE)
    except (ImportError, AttributeError) as exc:
        _log.warning("Serena initialization runner is unavailable: %s", exc)
        return InitTaskResult(
            task_id=SERENA_TASK_ID,
            status="failure",
            error=f"Serena initialization is unavailable in this build: {exc}",
        )

    return cast("InitTaskResult", runner(config, workspace_root, **kwargs))


SERENA_TASK = InitTask(
    id=SERENA_TASK_ID,
    label="Serena project setup",
    description=(
        "Activate this project in Serena and write onboarding memories so "
        "coding personas can search symbols and references."
    ),
    prerequisite_met=_serena_prerequisite_met,
    run=_run_serena_task,
    # It runs an LLM agent against the user's workspace: that spends their money
    # and writes durable content, so it is theirs to authorize (SWR-2821).
    requires_consent=True,
)
"""The agentic setup task (SWR-2803) — defined, and deliberately **not registered**.

SWR-2820 replaced it with :data:`SERENA_SETUP_TASK`, which does the same work
without a model. It is kept whole rather than deleted because the epic expects
initialization tasks that genuinely need natural language, and this is the
working shape of one: a persona, a prompt, a verdict read from tool events rather
than from prose, and a `requires_consent` declaration that brings the SWR-2802
modal back the moment it is registered again.
"""


def _run_serena_setup_task(
    config: RotarisConfig,
    workspace_root: Path,
    **kwargs: Any,
) -> InitTaskResult:
    """Run Serena's deterministic project setup (SWR-2820) through its own module.

    Imported inside the call for the same reason the agentic runner is: the
    prompt decision runs on every workspace open and must stay importable on a
    build where the runner is absent.
    """
    try:
        import importlib  # noqa: PLC0415 — lazy by design

        module = importlib.import_module(_SERENA_SETUP_MODULE)
        runner = getattr(module, _SERENA_SETUP_ATTRIBUTE)
    except (ImportError, AttributeError) as exc:
        _log.warning("Serena setup runner is unavailable: %s", exc)
        return InitTaskResult(
            task_id=SERENA_SETUP_TASK_ID,
            status="failure",
            error=f"Serena project setup is unavailable in this build: {exc}",
        )

    return cast("InitTaskResult", runner(config, workspace_root, **kwargs))


SERENA_SETUP_TASK = InitTask(
    id=SERENA_SETUP_TASK_ID,
    label="Serena project setup",
    description=(
        "Index this project's symbols with Serena so coding personas can search "
        "symbols and references without re-reading the tree."
    ),
    prerequisite_met=_serena_prerequisite_met,
    run=_run_serena_setup_task,
    # No model, no provider, no durable content of its own — nothing here is the
    # user's to decide, so it runs in the background (SWR-2820, SWR-2821).
    requires_consent=False,
)

register_task(SERENA_SETUP_TASK)
