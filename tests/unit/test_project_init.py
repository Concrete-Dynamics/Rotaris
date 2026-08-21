"""Prompt decision and task registry for project initialization (SWR-2802, SWR-2805).

The Serena task is exercised through the real registry entry and the real MCP
availability seam, so these tests fail if the registration or the prerequisite
wiring is removed — not just if the pure decision arithmetic changes.
"""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

import pytest

from rotaris_core.config import loader
from rotaris_core.config.project_init_state import read_initialization_state
from rotaris_core.config.schema import MCPServerConfig, RotarisConfig
from rotaris_core.init import registry
from rotaris_core.init.registry import (
    SERENA_SETUP_TASK_ID,
    InitStepResult,
    InitTask,
    InitTaskResult,
    pending_tasks,
    record_result,
    record_skipped,
    register_task,
    resolve_or_prompt,
    run_pending_tasks,
    runnable_tasks,
    should_prompt,
    unregister_task,
)
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from collections.abc import Iterator

    from rotaris_core.init.registry import InitTaskStatus

pytestmark = pytest.mark.unit


@pytest.fixture
def isolated_home(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    fake_home = tmp_path / "home"
    fake_home.mkdir()
    monkeypatch.setattr(Path, "home", staticmethod(lambda: fake_home))
    monkeypatch.setenv("APPDATA", str(fake_home / "AppData" / "Roaming"))
    monkeypatch.setenv("XDG_CONFIG_HOME", str(fake_home / ".config"))
    return fake_home


@pytest.fixture
def global_dir(tmp_path: Path, isolated_home: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    empty_global = tmp_path / "global"
    empty_global.mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", empty_global)
    return empty_global


@pytest.fixture
def workspace(tmp_path: Path, global_dir: Path) -> Path:
    ws = tmp_path / "ws"
    (ws / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir(parents=True)
    return ws


@pytest.fixture
def clean_registry() -> Iterator[None]:
    """Restore the module-level task registry after a test registers into it."""
    snapshot = registry.registered_tasks()
    yield
    for task in registry.registered_tasks():
        unregister_task(task.id)
    for task in snapshot:
        register_task(task)


def _config_with_serena(workspace_root: Path) -> RotarisConfig:
    """A config where the `serena` MCP server is configured and resolvable.

    An HTTP transport needs no binary on PATH, so the factory's real
    availability check answers `True` on every machine.
    """
    return RotarisConfig(
        workspace_root=workspace_root,
        mcp_servers={
            "serena": MCPServerConfig(type="http", url="http://127.0.0.1:9121/mcp"),
        },
    )


def _config_without_serena(workspace_root: Path) -> RotarisConfig:
    return RotarisConfig(
        workspace_root=workspace_root,
        mcp_servers={
            "context7": MCPServerConfig(type="http", url="http://127.0.0.1:9200/mcp"),
        },
    )


def _task_ids(tasks: list[InitTask]) -> list[str]:
    return [task.id for task in tasks]


def _hypothetical_task(
    task_id: str,
    *,
    applicable: bool = True,
    status: InitTaskStatus = "success",
    classification: str | None = None,
    calls: list[str] | None = None,
    error: str | None = None,
    requires_consent: bool = False,
) -> InitTask:
    """A task the registry's dispatch code has never heard of.

    Nothing about it is Serena-shaped, which is the point: if `run_pending_tasks`
    branched on a task id, this task could not run.
    """

    def _run(config: RotarisConfig, workspace_root: Path, **kwargs: object) -> InitTaskResult:
        if calls is not None:
            calls.append(task_id)
        return InitTaskResult(
            task_id=task_id,
            status=status,
            steps=(InitStepResult(name="only-step", status="success", detail=f"{task_id} ran"),),
            classification=classification,
            error=error,
        )

    return InitTask(
        id=task_id,
        label=task_id.replace("-", " ").title(),
        description=f"Hypothetical initialization task {task_id}.",
        prerequisite_met=lambda _config, _root: applicable,
        run=_run,
        requires_consent=requires_consent,
    )


@verifies(SWR.SWR_2802, SWR.SWR_2820, SWR.SWR_2821)
def test_serena_setup_is_offered_without_a_prompt(workspace: Path) -> None:
    """Productive use: a developer opens a workspace for the first time with Serena set
    up, and Rotaris gets on with indexing it instead of asking permission.

    Expected outcome: the shipped Serena task is pending and handed over as background
    work, no prompt is raised, and the workspace is not marked done before it has run.
    This goes through the real registration and the real prerequisite seam, so removing
    either fails here."""
    config = _config_with_serena(workspace)

    assert should_prompt(config, workspace) is False

    decision = resolve_or_prompt(config, workspace)

    assert decision.should_prompt is False
    assert decision.auto_resolved is False
    assert _task_ids(list(decision.tasks)) == [SERENA_SETUP_TASK_ID]
    assert _task_ids(list(decision.background)) == [SERENA_SETUP_TASK_ID]
    assert _task_ids(pending_tasks(config, workspace)) == [SERENA_SETUP_TASK_ID]
    # Work that has not run yet must not have been silently marked as done.
    assert read_initialization_state(workspace).never_initialized is True


@verifies(SWR.SWR_2820)
def test_a_legacy_serena_workspace_still_owes_the_deterministic_setup(workspace: Path) -> None:
    """Productive use: a workspace initialized by the old agentic setup gets the symbol
    index that setup never built.

    Expected outcome: the recorded `serena` id belongs to a task the registry no longer
    knows, so it neither satisfies nor blocks `serena-setup`, which is still runnable."""
    config = _config_with_serena(workspace)
    record_result(workspace, "serena", outcome="completed", classification="code")

    assert read_initialization_state(workspace).completed == ["serena"]
    assert _task_ids(runnable_tasks(config, workspace)) == [SERENA_SETUP_TASK_ID]
    assert _task_ids(registry.background_tasks(config, workspace)) == [SERENA_SETUP_TASK_ID]
    # It is not a first-run workspace any more, so nothing prompts either way.
    assert should_prompt(config, workspace) is False


@verifies(SWR.SWR_2802)
def test_prompt_not_shown_after_all_resolved(workspace: Path) -> None:
    """Productive use: a developer who already initialized a project reopens it.
    Expected outcome: the prompt stays away for good — the recorded outcome survives a
    real config round-trip to disk, so reopening the workspace does not nag again."""
    (workspace / loader.WORKSPACE_CONFIG_DIR_NAME / "agents.yaml").write_text(
        'mcp_servers:\n  serena:\n    type: http\n    url: "http://127.0.0.1:9121/mcp"\n',
        encoding="utf-8",
    )
    config = loader.load_config(workspace)

    assert _task_ids(pending_tasks(config, workspace)) == [SERENA_SETUP_TASK_ID]

    record_result(workspace, SERENA_SETUP_TASK_ID, outcome="completed", classification="code")

    assert should_prompt(config, workspace) is False
    assert pending_tasks(config, workspace) == []

    reloaded = loader.load_config(workspace)

    assert reloaded.initialization.completed == [SERENA_SETUP_TASK_ID]
    assert reloaded.initialization.classification == "code"
    assert reloaded.initialization.never_initialized is False
    assert should_prompt(reloaded, workspace) is False
    assert resolve_or_prompt(reloaded, workspace).should_prompt is False


@verifies(SWR.SWR_2802)
def test_prompt_not_shown_when_serena_unavailable(workspace: Path) -> None:
    """Productive use: a developer without Serena installed opens a fresh workspace.
    Expected outcome: no prompt appears for a task that could not run anyway, and the
    workspace is recorded as initialized with an empty task list."""
    config = RotarisConfig(
        workspace_root=workspace,
        mcp_servers={
            "serena": MCPServerConfig(
                type="stdio",
                command="Rotaris-no-such-serena-binary",
            ),
        },
    )

    assert should_prompt(config, workspace) is False

    decision = resolve_or_prompt(config, workspace)

    assert decision.should_prompt is False
    assert decision.auto_resolved is True

    state = read_initialization_state(workspace)
    assert state.never_initialized is False
    assert state.completed == []
    assert state.skipped == []


@verifies(SWR.SWR_2802)
def test_prompt_not_shown_when_serena_is_not_configured(workspace: Path) -> None:
    """Productive use: a developer whose .mcp.json has no `serena` entry opens a workspace.
    Expected outcome: the Serena task is not applicable, so no prompt interrupts them."""
    config = _config_without_serena(workspace)

    assert registry.applicable_tasks(config, workspace) == []
    assert should_prompt(config, workspace) is False


@verifies(SWR.SWR_2802, SWR.SWR_2800)
def test_no_applicable_task_marks_workspace_initialized_without_prompting(
    workspace: Path,
) -> None:
    """Productive use: a developer opens a workspace where no setup task can run.
    Expected outcome: the workspace is marked initialized once, silently, and the second
    open neither prompts nor rewrites the marker as a fresh auto-resolution."""
    config = _config_without_serena(workspace)

    first = resolve_or_prompt(config, workspace)

    assert first.auto_resolved is True
    assert first.tasks == ()

    first_run = read_initialization_state(workspace).last_run
    assert first_run is not None

    second = resolve_or_prompt(config, workspace)

    assert second.should_prompt is False
    assert second.auto_resolved is False
    assert read_initialization_state(workspace).last_run == first_run


@verifies(SWR.SWR_2800, SWR.SWR_2802)
def test_additional_registered_task_joins_the_prompt_without_touching_the_decision_logic(
    workspace: Path,
    clean_registry: None,
) -> None:
    """Productive use: a later feature adds its own first-time setup step to the epic.
    Expected outcome: registering the task is enough — it joins the decision alongside
    Serena, raising the prompt because it declares it needs the user, and its own
    prerequisite decides whether it shows up at all."""
    register_task(_hypothetical_task("workspace-paths", requires_consent=True))
    register_task(_hypothetical_task("inapplicable-task", applicable=False))

    config = _config_with_serena(workspace)

    assert should_prompt(config, workspace) is True
    assert _task_ids(pending_tasks(config, workspace)) == [SERENA_SETUP_TASK_ID, "workspace-paths"]

    # Resolving Serena's setup leaves the new task pending — and still asked about.
    # Resolution is per task: another task finishing is not an answer to this one.
    record_result(workspace, SERENA_SETUP_TASK_ID, outcome="completed")

    assert should_prompt(config, workspace) is True
    assert _task_ids(pending_tasks(config, workspace)) == ["workspace-paths"]
    assert _task_ids(runnable_tasks(config, workspace)) == ["workspace-paths"]

    # Answering it — either way — is what ends the prompt.
    record_result(workspace, "workspace-paths", outcome="skipped")

    assert should_prompt(config, workspace) is False
    assert pending_tasks(config, workspace) == []


@verifies(SWR.SWR_2805, SWR.SWR_2802)
def test_skipped_task_does_not_reprompt_but_stays_runnable_for_manual_reinit(
    workspace: Path,
) -> None:
    """Productive use: a developer skips setup, then later picks "Initialize Project…".
    Expected outcome: skipping silences the automatic prompt for good, yet the deferred
    task is still offered to the manual re-trigger so it can be run later."""
    config = _config_with_serena(workspace)

    record_skipped(workspace, [SERENA_SETUP_TASK_ID])

    assert read_initialization_state(workspace).skipped == [SERENA_SETUP_TASK_ID]
    assert should_prompt(config, workspace) is False
    assert pending_tasks(config, workspace) == []

    assert _task_ids(runnable_tasks(config, workspace)) == [SERENA_SETUP_TASK_ID]
    assert _task_ids(list(resolve_or_prompt(config, workspace).tasks)) == [SERENA_SETUP_TASK_ID]


@verifies(SWR.SWR_2805)
def test_completed_task_is_not_offered_to_a_manual_reinitialization(workspace: Path) -> None:
    """Productive use: a developer re-runs initialization after everything already ran.
    Expected outcome: nothing is offered for a second run, so completed onboarding work
    is never repeated."""
    config = _config_with_serena(workspace)

    record_result(workspace, SERENA_SETUP_TASK_ID, outcome="completed")

    assert runnable_tasks(config, workspace) == []
    assert resolve_or_prompt(config, workspace).tasks == ()


@verifies(SWR.SWR_2802)
def test_skip_with_no_tasks_still_takes_the_workspace_out_of_never_initialized(
    workspace: Path,
) -> None:
    """Productive use: a developer dismisses the prompt when nothing was left to run.
    Expected outcome: the dismissal is recorded, so the prompt does not return on the
    next workspace open."""
    config = _config_with_serena(workspace)

    record_skipped(workspace, [])

    assert read_initialization_state(workspace).never_initialized is False
    assert should_prompt(config, workspace) is False


@verifies(SWR.SWR_2800)
def test_failing_prerequisite_check_hides_its_task_instead_of_breaking_the_prompt(
    workspace: Path,
    clean_registry: None,
) -> None:
    """Productive use: a developer opens a workspace where one setup check misbehaves.
    Expected outcome: the broken task is treated as not applicable and the remaining
    tasks are still offered, so one bad plugin cannot block project setup."""

    def _explode(_config: RotarisConfig, _root: Path) -> bool:
        raise RuntimeError("prerequisite probe failed")

    broken = _hypothetical_task("broken-task")
    register_task(
        InitTask(
            id=broken.id,
            label=broken.label,
            description=broken.description,
            prerequisite_met=_explode,
            run=broken.run,
        )
    )

    config = _config_with_serena(workspace)

    assert _task_ids(registry.applicable_tasks(config, workspace)) == [SERENA_SETUP_TASK_ID]
    assert _task_ids(list(resolve_or_prompt(config, workspace).background)) == [
        SERENA_SETUP_TASK_ID,
    ]


@verifies(SWR.SWR_2800)
def test_registering_a_duplicate_task_id_is_rejected(clean_registry: None) -> None:
    """Productive use: two features accidentally claim the same initialization task id.
    Expected outcome: the collision is refused loudly instead of silently overwriting the
    task whose id is already recorded in users' configs."""
    duplicate = _hypothetical_task(SERENA_SETUP_TASK_ID)

    with pytest.raises(ValueError, match=SERENA_SETUP_TASK_ID):
        register_task(duplicate)

    register_task(duplicate, replace=True)

    assert registry.get_task(SERENA_SETUP_TASK_ID) is duplicate


@verifies(SWR.SWR_2800, SWR.SWR_2802)
def test_run_pending_tasks_executes_registered_tasks_it_has_never_heard_of(
    workspace: Path,
    clean_registry: None,
) -> None:
    """Productive use: a later requirement adds a second initialization task to the epic.
    Expected outcome: the task runs and is recorded through the same dispatch as Serena —
    proof the execution path carries no per-task branching, so the UI needs no change."""
    calls: list[str] = []
    unregister_task(SERENA_SETUP_TASK_ID)
    register_task(_hypothetical_task("workspace-paths", calls=calls, classification="code"))
    register_task(_hypothetical_task("repo-instructions", calls=calls, status="skipped"))
    register_task(_hypothetical_task("not-here", applicable=False, calls=calls))

    config = _config_without_serena(workspace)

    results = run_pending_tasks(config, workspace)

    assert calls == ["workspace-paths", "repo-instructions"]
    assert [result.task_id for result in results] == ["workspace-paths", "repo-instructions"]
    assert results[0].succeeded is True
    assert results[0].steps[0].detail == "workspace-paths ran"

    state = read_initialization_state(workspace)
    assert state.completed == ["workspace-paths"]
    assert state.skipped == ["repo-instructions"]
    assert state.classification == "code"

    # The completed task is not offered a second time; the skipped one still is.
    assert calls == ["workspace-paths", "repo-instructions"]
    assert _task_ids(runnable_tasks(config, workspace)) == ["repo-instructions"]
    assert should_prompt(config, workspace) is False


@verifies(SWR.SWR_2802, SWR.SWR_2805)
def test_failing_task_records_nothing_and_stays_available_for_retry(
    workspace: Path,
    clean_registry: None,
) -> None:
    """Productive use: a developer's setup run hits an error in one of several tasks.
    Expected outcome: the other tasks still run, the failure is reported with a message to
    retry, and the failed task is offered again instead of being marked done."""
    unregister_task(SERENA_SETUP_TASK_ID)
    register_task(_hypothetical_task("failing-task", status="failure", error="serena unreachable"))
    register_task(_hypothetical_task("healthy-task"))

    config = _config_without_serena(workspace)

    results = run_pending_tasks(config, workspace)

    assert [(r.task_id, r.status) for r in results] == [
        ("failing-task", "failure"),
        ("healthy-task", "success"),
    ]
    assert results[0].error == "serena unreachable"

    state = read_initialization_state(workspace)
    assert state.completed == ["healthy-task"]
    assert state.skipped == []
    assert _task_ids(runnable_tasks(config, workspace)) == ["failing-task"]


@verifies(SWR.SWR_2800)
def test_a_raising_runner_becomes_a_retryable_failure_instead_of_crashing_the_run(
    workspace: Path,
    clean_registry: None,
) -> None:
    """Productive use: a developer runs setup and one task's implementation throws.
    Expected outcome: the modal gets a retryable error rather than an unhandled exception,
    and the workspace is not falsely recorded as initialized for that task."""

    def _explode(
        _config: RotarisConfig,
        _workspace_root: Path,
        **_kwargs: object,
    ) -> InitTaskResult:
        raise RuntimeError("serena handshake failed")

    unregister_task(SERENA_SETUP_TASK_ID)
    register_task(
        InitTask(
            id="exploding-task",
            label="Exploding",
            description="A task whose runner raises.",
            prerequisite_met=lambda _config, _root: True,
            run=_explode,
        )
    )

    config = _config_without_serena(workspace)

    results = run_pending_tasks(config, workspace)

    assert [result.status for result in results] == ["failure"]
    assert results[0].error == "serena handshake failed"
    assert read_initialization_state(workspace).completed == []


@verifies(SWR.SWR_2802)
def test_run_pending_tasks_reports_progress_for_every_task(
    workspace: Path,
    clean_registry: None,
) -> None:
    """Productive use: a developer watches the setup modal while initialization runs.
    Expected outcome: each task announces its start and its finish, so the modal can show
    an in-progress state and then a per-task result without knowing the task list."""
    events: list[tuple[str, str | None]] = []

    def _on_progress(task: InitTask, result: InitTaskResult | None) -> None:
        events.append((task.id, None if result is None else result.status))

    unregister_task(SERENA_SETUP_TASK_ID)
    register_task(_hypothetical_task("first-task"))
    register_task(_hypothetical_task("second-task"))

    run_pending_tasks(_config_without_serena(workspace), workspace, on_progress=_on_progress)

    assert events == [
        ("first-task", None),
        ("first-task", "success"),
        ("second-task", None),
        ("second-task", "success"),
    ]


@verifies(SWR.SWR_2802)
def test_running_with_nothing_pending_still_marks_the_workspace_initialized(
    workspace: Path,
    clean_registry: None,
) -> None:
    """Productive use: a developer confirms setup on a workspace where no task applies.
    Expected outcome: the run records the workspace as initialized so the prompt does not
    come back on the next open."""
    unregister_task(SERENA_SETUP_TASK_ID)

    results = run_pending_tasks(_config_without_serena(workspace), workspace)

    assert results == []
    assert read_initialization_state(workspace).never_initialized is False


@verifies(SWR.SWR_2800, SWR.SWR_2820)
def test_a_missing_serena_runner_is_reported_as_a_retryable_failure(
    workspace: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a developer initializes on a build where the Serena runner is absent.
    Expected outcome: the registry reports a retryable error instead of raising an import
    error, so the prompt decision keeps working without the runner being installed."""
    monkeypatch.setattr(
        registry, "_SERENA_SETUP_MODULE", "rotaris_core.init._definitely_not_a_module"
    )
    config = _config_with_serena(workspace)

    results = run_pending_tasks(config, workspace)

    assert [(r.task_id, r.status) for r in results] == [(SERENA_SETUP_TASK_ID, "failure")]
    assert results[0].error is not None
    assert read_initialization_state(workspace).completed == []
    assert _task_ids(runnable_tasks(config, workspace)) == [SERENA_SETUP_TASK_ID]


# ---------------------------------------------------------------------------
# Which tasks need a person (SWR-2821)


def _only_registered(*tasks: InitTask) -> None:
    """Make *tasks* the whole registry, so a decision is about them alone."""
    for registered in registry.registered_tasks():
        unregister_task(registered.id)
    for task in tasks:
        register_task(task)


@verifies(SWR.SWR_2821)
def test_background_tasks_raise_no_prompt(workspace: Path, clean_registry: None) -> None:
    """Productive use: a developer opens a workspace whose only outstanding setup is
    deterministic, and is not interrupted by a question they have no basis to answer.

    Expected outcome: the work is handed to the caller to simply start, no prompt is
    raised, and the workspace is *not* marked initialized before the work has run."""
    _only_registered(_hypothetical_task("index-symbols"))
    config = _config_without_serena(workspace)

    assert should_prompt(config, workspace) is False

    decision = resolve_or_prompt(config, workspace)

    assert decision.should_prompt is False
    assert decision.auto_resolved is False
    assert _task_ids(list(decision.background)) == ["index-symbols"]
    assert _task_ids(registry.background_tasks(config, workspace)) == ["index-symbols"]
    assert registry.consent_tasks(config, workspace) == []
    # The marker belongs to the run, not to the decision that scheduled it.
    assert read_initialization_state(workspace).never_initialized is True


@verifies(SWR.SWR_2821)
def test_a_consent_task_still_raises_the_prompt(workspace: Path, clean_registry: None) -> None:
    """Productive use: a task that spends the user's money is still theirs to authorize.

    Expected outcome: the SWR-2802 prompt behaves exactly as before for a task that
    declares it needs consent, and that task is not offered as background work."""
    _only_registered(_hypothetical_task("write-memories", requires_consent=True))
    config = _config_without_serena(workspace)

    decision = resolve_or_prompt(config, workspace)

    assert decision.should_prompt is True
    assert _task_ids(list(decision.tasks)) == ["write-memories"]
    assert decision.background == ()
    assert _task_ids(registry.consent_tasks(config, workspace)) == ["write-memories"]


@verifies(SWR.SWR_2821)
def test_both_kinds_pending_prompts_and_still_offers_the_background_work(
    workspace: Path,
    clean_registry: None,
) -> None:
    """Productive use: a workspace owing both kinds gets on with the deterministic half
    while the user decides about the other.

    Expected outcome: the prompt is raised for the consent task and the background task
    is handed over at the same time — one does not wait on the other."""
    _only_registered(
        _hypothetical_task("index-symbols"),
        _hypothetical_task("write-memories", requires_consent=True),
    )
    config = _config_without_serena(workspace)

    decision = resolve_or_prompt(config, workspace)

    assert decision.should_prompt is True
    assert _task_ids(list(decision.tasks)) == ["index-symbols", "write-memories"]
    assert _task_ids(list(decision.background)) == ["index-symbols"]


@verifies(SWR.SWR_2821)
def test_task_consent_defaults_to_background() -> None:
    """Productive use: a task author who says nothing about consent gets the quiet path.

    Expected outcome: needing a person is the exception and has to be declared, so a
    descriptor that omits it never interrupts anyone."""
    assert _hypothetical_task("some-later-task").requires_consent is False


@verifies(SWR.SWR_2821, SWR.SWR_2805)
def test_an_explicitly_skipped_background_task_is_not_restarted(
    workspace: Path,
    clean_registry: None,
) -> None:
    """Productive use: a developer who opened the setup modal and chose *Skip for now*
    is not overruled by the next workspace open starting the same work anyway.

    Expected outcome: skipping is an answer and it sticks — the task is offered to
    neither the prompt nor the background start, while the manual SWR-2805 action can
    still run it whenever they want it."""
    _only_registered(
        _hypothetical_task("index-symbols"),
        _hypothetical_task("write-memories", requires_consent=True),
    )
    config = _config_without_serena(workspace)

    record_skipped(workspace, ["index-symbols", "write-memories"])

    assert should_prompt(config, workspace) is False
    assert registry.background_tasks(config, workspace) == []
    decision = resolve_or_prompt(config, workspace)
    assert decision.should_prompt is False
    assert decision.background == ()
    # Still unresolved work, so the manual re-trigger keeps offering both.
    assert _task_ids(runnable_tasks(config, workspace)) == ["index-symbols", "write-memories"]
