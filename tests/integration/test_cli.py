from __future__ import annotations

import importlib
import re
from types import SimpleNamespace
from typing import TYPE_CHECKING, Any

from typer.testing import CliRunner

from rotaris_core import __version__
from rotaris_core.cli.app import app
from rotaris_core.cli.config_errors import CLIConfigLoadError
from rotaris_core.config.schema import RotarisConfig
from rotaris_core.orchestrator.child_state import ChildTaskRecord, ChildTaskState
from rotaris_core.orchestrator.report import ChildReportArtifact
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session import SessionManager

if TYPE_CHECKING:
    from pathlib import Path

    import pytest


cli_app_module = importlib.import_module("rotaris_core.cli.app")


async def _stub_run_child(
    self: Any,
    record: ChildTaskRecord,
    agent: Any,
    *,
    manager: Any = None,
    agent_factory: Any = None,
    todo_correction_provider: Any = None,
    max_todo_corrections: int = 0,
    open_todo_items_provider: Any = None,
) -> ChildReportArtifact:
    """Return a successful report immediately without calling an LLM."""
    del (
        self,
        agent,
        manager,
        agent_factory,
        todo_correction_provider,
        max_todo_corrections,
        open_todo_items_provider,
    )
    record.transition(ChildTaskState.SUCCEEDED)
    return ChildReportArtifact(
        agent_name=record.canonical_name,
        persona=record.persona,
        status="succeeded",
        summary="Structured report summary",
        final_response="Actual user-facing answer",
    )


async def _compression_run_child(
    self: Any,
    record: ChildTaskRecord,
    agent: Any,
    *,
    manager: Any = None,
    agent_factory: Any = None,
    todo_correction_provider: Any = None,
    max_todo_corrections: int = 0,
    open_todo_items_provider: Any = None,
) -> ChildReportArtifact:
    del agent, manager, agent_factory, todo_correction_provider, max_todo_corrections
    del open_todo_items_provider
    callback = self._conversation_event_callback
    if callback is not None:
        callback(record, SimpleNamespace(event_type="compression", phase="done"))
    record.transition(ChildTaskState.SUCCEEDED)
    return ChildReportArtifact(
        agent_name=record.canonical_name,
        persona=record.persona,
        status="succeeded",
        summary="Structured report summary",
        final_response="Actual user-facing answer",
    )


def _capturing_run_child(
    captured_payloads: list[str],
):
    async def _run_child(
        self: Any,
        record: ChildTaskRecord,
        agent: Any,
        *,
        manager: Any = None,
        agent_factory: Any = None,
        todo_correction_provider: Any = None,
        max_todo_corrections: int = 0,
        open_todo_items_provider: Any = None,
    ) -> ChildReportArtifact:
        del (
            self,
            agent,
            manager,
            agent_factory,
            todo_correction_provider,
            max_todo_corrections,
            open_todo_items_provider,
        )
        captured_payloads.append(record.task_payload)
        record.transition(ChildTaskState.SUCCEEDED)
        return ChildReportArtifact(
            agent_name=record.canonical_name,
            persona=record.persona,
            status="succeeded",
            summary="Structured report summary",
            final_response="Actual user-facing answer",
        )

    return _run_child


runner = CliRunner()

#: SGR escapes Rich emits when it decides the output is colour-capable.
_ANSI_ESCAPE_RE = re.compile(r"\x1b\[[0-9;]*m")


def _said(row: dict[str, Any]) -> dict[str, Any]:
    """One transcript row minus its clock stamp.

    Every row a run records carries one now that the engine records them all
    (SWR-2454), and what these assertions are about is what was said, not when.
    """
    return {key: value for key, value in row.items() if key != "ts"}


@verifies(SWR.SWR_2101)
def test_version_command_outputs_package_version() -> None:
    result = runner.invoke(app, ["version"])

    assert result.exit_code == 0
    assert result.stdout.strip() == f"Rotaris {__version__}"


@verifies(SWR.SWR_1009)
def test_help_shows_framework_description() -> None:
    result = runner.invoke(app, ["--help"])

    assert result.exit_code == 0
    assert "CLI-native agentic orchestration framework" in result.stdout


@verifies(SWR.SWR_1017)
def test_run_help_lists_expected_flags() -> None:
    # Two facts about the machine, neither of them about the help text, decide
    # whether a plain substring check passes here.
    #
    # Width: the flags go in a table sized to the terminal, and a narrow one
    # truncates the long ones to `--unsafe-outside-…`.
    #
    # Colour: when Rich is emitting style codes it renders the flag as
    # `<style>-</style><style>-background</style>`, splitting the leading `--`
    # across two escape sequences, so `--background` is not a substring of the
    # raw output at any width. Rich turns colour off when stdout is not a
    # terminal and on in CI, which is exactly the disagreement to remove here.
    result = runner.invoke(app, ["run", "--help"], env={"COLUMNS": "200"})

    assert result.exit_code == 0
    rendered = _ANSI_ESCAPE_RE.sub("", result.stdout)
    for flag in (
        "--background",
        "--workspace",
        "--session",
        "--config",
        "--persona",
        "--max-iterations",
        "--unsafe-outside-workspace",
    ):
        assert flag in rendered


@verifies(SWR.SWR_1009)
def test_sessions_command_handles_empty_workspace(tmp_path: Path) -> None:
    result = runner.invoke(app, ["sessions", "--workspace", str(tmp_path)])

    assert result.exit_code == 0
    assert result.stdout.strip() == ""


@verifies(SWR.SWR_316)
def test_run_reports_incomplete_model_override_without_traceback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def _raise_config_error(*_: object, **__: object) -> RotarisConfig:
        raise CLIConfigLoadError(
            [
                "Model 'deepseek/deepseek-v4-pro' is incomplete: missing required fields 'model_id', 'provider'.",
                "Model entries are full replacements across config scopes, so any override for 'deepseek/deepseek-v4-pro' must include 'model_id', 'provider'.",
            ]
        )

    monkeypatch.setattr(cli_app_module, "_load_cli_config", _raise_config_error)
    monkeypatch.setattr(
        "rotaris_core.cli.startup_recovery.maybe_refresh_models_for_config_error",
        lambda *_args, **_kwargs: False,
    )

    result = runner.invoke(app, ["run", "test task"])

    assert result.exit_code == 1
    assert "Config error: Model 'deepseek/deepseek-v4-pro' is incomplete" in result.output
    assert "must include 'model_id', 'provider'" in result.output
    assert "Traceback" not in result.output


@verifies(SWR.SWR_819)
def test_run_retries_config_load_after_startup_model_refresh(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    config = RotarisConfig()
    config.workspace_root = tmp_path
    load_attempts: list[int] = []
    background_calls: list[dict[str, Any]] = []

    def fake_load(*_args: object, **_kwargs: object) -> RotarisConfig:
        load_attempts.append(1)
        if len(load_attempts) == 1:
            raise CLIConfigLoadError(
                [
                    "Model 'deepseek/deepseek-v4-pro' is incomplete: missing required fields 'model_id', 'provider'.",
                ]
            )
        return config

    monkeypatch.setattr(cli_app_module, "_load_cli_config", fake_load)
    monkeypatch.setattr(
        "rotaris_core.cli.startup_recovery.maybe_refresh_models_for_config_error",
        lambda *_args, **_kwargs: True,
    )
    monkeypatch.setattr("rotaris_core.config.validation.validate_config", lambda _config: [])
    monkeypatch.setattr(
        "rotaris_core.cli.background.run_background",
        lambda **kwargs: background_calls.append(kwargs),
    )

    result = runner.invoke(
        app,
        ["run", "--background", "--workspace", str(tmp_path), "test task"],
    )

    assert result.exit_code == 0
    assert len(load_attempts) == 2
    assert len(background_calls) == 1
    assert background_calls[0]["task"] == "test task"


@verifies(SWR.SWR_147, SWR.SWR_1016, SWR.SWR_1019)
def test_background_run_creates_completed_session(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "rotaris_core.orchestrator.scheduler.Scheduler.run_child",
        _stub_run_child,
    )
    result = runner.invoke(
        app,
        ["run", "--background", "--workspace", str(tmp_path), "test task"],
    )

    assert result.exit_code == 0
    assert "Created session" in result.stdout
    assert "Done." in result.stdout

    manager = SessionManager(tmp_path)
    sessions = manager.list_sessions()
    assert len(sessions) == 1

    state = manager.load_session(sessions[0]["session_id"])
    assert state.execution_status == "completed"
    assert _said(state.transcript_events[0]) == {"role": "user", "content": "test task"}
    assert _said(state.transcript_events[1]) == {
        "role": "system",
        "content": "Intent classified: moderate_feature",
    }
    assert _said(state.transcript_events[2]) == {
        "role": "agent",
        "name": state.transcript_events[2]["name"],
        "content": "Actual user-facing answer",
    }
    assert _said(state.transcript_events[-1]) == {"role": "system", "content": "Run completed."}
    # Every row a run records is stamped now that the engine records them all
    # (SWR-2454) — a CLI session's transcript renders the same as a desktop one.
    assert all(row.get("ts") for row in state.transcript_events[:3])
    assert (manager.session_dir(sessions[0]["session_id"]) / "run.log").exists()


@verifies(SWR.SWR_1020)
def test_background_run_resumes_existing_session(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "rotaris_core.orchestrator.scheduler.Scheduler.run_child",
        _stub_run_child,
    )
    manager = SessionManager(tmp_path)
    state = manager.create_session(RotarisConfig(workspace_root=tmp_path))
    manager.release_lock(state.session_id)

    result = runner.invoke(
        app,
        [
            "run",
            "--background",
            "--workspace",
            str(tmp_path),
            "--session",
            state.session_id,
            "resumed task",
        ],
    )

    assert result.exit_code == 0
    assert f"Resuming session {state.session_id}" in result.stdout

    loaded = manager.load_session(state.session_id)
    assert loaded.execution_status == "completed"
    assert _said(loaded.transcript_events[-4]) == {"role": "user", "content": "resumed task"}
    assert _said(loaded.transcript_events[-3]) == {
        "role": "system",
        "content": "Intent classified: moderate_feature",
    }
    assert loaded.transcript_events[-2]["content"] == "Actual user-facing answer"
    assert _said(loaded.transcript_events[-1]) == {"role": "system", "content": "Run completed."}


@verifies(SWR.SWR_1009)
def test_background_run_persists_compression_metrics(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "rotaris_core.orchestrator.scheduler.Scheduler.run_child",
        _compression_run_child,
    )
    result = runner.invoke(
        app,
        ["run", "--background", "--workspace", str(tmp_path), "test task"],
    )

    assert result.exit_code == 0

    manager = SessionManager(tmp_path)
    sessions = manager.list_sessions()
    state = manager.load_session(sessions[0]["session_id"])

    assert state.global_compressions == 1
    assert len(state.agent_metrics) == 1
    assert next(iter(state.agent_metrics.values())).compressions == 1


@verifies(SWR.SWR_154)
def test_background_run_continues_when_intent_classifier_raises(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _raise_classifier(*args: Any, **kwargs: Any) -> object:
        del args, kwargs
        raise RuntimeError("classifier down")

    monkeypatch.setattr(
        "rotaris_core.ralph.intent_classifier.classify_initial_intent",
        _raise_classifier,
    )
    monkeypatch.setattr(
        "rotaris_core.orchestrator.scheduler.Scheduler.run_child",
        _stub_run_child,
    )

    result = runner.invoke(
        app,
        ["run", "--background", "--workspace", str(tmp_path), "test task"],
    )

    assert result.exit_code == 0
    manager = SessionManager(tmp_path)
    state = manager.load_session(manager.list_sessions()[0]["session_id"])
    assert state.execution_status == "completed"
    assert {
        "role": "system",
        "content": (
            "Intent classified: moderate_feature "
            "(fallback: classification pre-flight error: classifier down)"
        ),
    } in [_said(row) for row in state.transcript_events]


@verifies(SWR.SWR_1009)
def test_background_resume_includes_recent_session_context_and_appends_followup_todo(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured_payloads: list[str] = []
    monkeypatch.setattr(
        "rotaris_core.orchestrator.scheduler.Scheduler.run_child",
        _capturing_run_child(captured_payloads),
    )

    manager = SessionManager(tmp_path)
    state = manager.create_session(RotarisConfig(workspace_root=tmp_path))
    state.transcript_events = [
        {"role": "user", "content": "check the requirement doc and tell me the status"},
        {
            "role": "agent",
            "name": "agent-1",
            "content": "The requirement is implemented. You can mark it as implemented.",
        },
        {"role": "system", "content": "Run completed."},
    ]
    state.todo_state = {
        "phases": [
            {
                "name": "main",
                "tasks": [
                    {
                        "id": "old-task",
                        "name": "obsolete task",
                        "description": "stale description",
                        "status": "COMPLETED",
                    },
                ],
            },
        ],
    }
    manager.save_session(state)
    manager.release_lock(state.session_id)

    result = runner.invoke(
        app,
        [
            "run",
            "--background",
            "--workspace",
            str(tmp_path),
            "--session",
            state.session_id,
            "then mark it as implemented",
        ],
    )

    assert result.exit_code == 0
    assert len(captured_payloads) == 1
    assert "Latest user request:\nthen mark it as implemented" in captured_payloads[0]
    assert "The requirement is implemented. You can mark it as implemented." in captured_payloads[0]
    assert "Do not claim there is no prior context" in captured_payloads[0]

    loaded = manager.load_session(state.session_id)
    tasks = loaded.todo_state["phases"][0]["tasks"]
    assert tasks[0]["name"] == "obsolete task"
    assert tasks[0]["status"] == "COMPLETED"
    assert tasks[1]["name"] == "then mark it as implemented"
    assert "obsolete task" not in tasks[1]["description"]


@verifies(SWR.SWR_1009)
def test_run_without_task_uses_tui_without_crashing(tmp_path: Path, monkeypatch) -> None:
    import rotaris_core.tui as tui_module

    captured: dict[str, object] = {}

    class DummyApp:
        def __init__(self, *, session_manager, config, show_onboarding_review=False) -> None:
            del show_onboarding_review
            captured["workspace_root"] = session_manager.workspace_root
            captured["default_persona"] = config.default_persona

        def run(self) -> None:
            captured["ran"] = True

    monkeypatch.setattr(tui_module, "RotarisTuiApp", DummyApp)

    result = runner.invoke(app, ["run", "--workspace", str(tmp_path)])

    assert result.exit_code == 0
    assert captured == {
        "workspace_root": tmp_path.resolve(),
        "default_persona": "orchestrator",
        "ran": True,
    }


@verifies(SWR.SWR_1009)
def test_background_run_honors_custom_config_file(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "rotaris_core.orchestrator.scheduler.Scheduler.run_child",
        _stub_run_child,
    )
    config_path = tmp_path / "agents.yaml"
    config_path.write_text(
        "default_persona: coding-agent\n",
        encoding="utf-8",
    )

    result = runner.invoke(
        app,
        [
            "run",
            "--background",
            "--workspace",
            str(tmp_path),
            "--config",
            str(config_path),
            "config task",
        ],
    )

    assert result.exit_code == 0

    manager = SessionManager(tmp_path)
    state = manager.load_session(manager.list_sessions()[0]["session_id"])
    assert state.config_snapshot["default_persona"] == "coding-agent"


@verifies(SWR.SWR_2416)
def test_background_run_clamps_child_limits_to_the_playbook_budget(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The classified intent must reach the loop and narrow the real child limits.

    `_budgeted_policy` is unit-tested, but its wiring is not: dropping the
    `ralph.run_intent = ...` assignment in the host would silently disable the clamp
    while every other test still passed. This locks the whole chain — classify ->
    RalphLoop.run_intent -> playbook cell -> RuntimePolicy handed to ChildManager.
    """
    from rotaris_core.ralph.intent_classifier import IntentCategory, IntentClassificationResult

    async def _classify_small_feature(*args: Any, **kwargs: Any) -> Any:
        del args, kwargs
        return IntentClassificationResult(intent=IntentCategory.SMALL_FEATURE)

    monkeypatch.setattr(
        "rotaris_core.ralph.intent_classifier.classify_initial_intent",
        _classify_small_feature,
    )
    monkeypatch.setattr(
        "rotaris_core.orchestrator.scheduler.Scheduler.run_child",
        _stub_run_child,
    )

    import rotaris_core.ralph.loop as loop_module

    real_child_manager = loop_module.ChildManager
    seen_policies: list[Any] = []

    def _recording_child_manager(*args: Any, **kwargs: Any) -> Any:
        seen_policies.append(kwargs.get("policy"))
        return real_child_manager(*args, **kwargs)

    monkeypatch.setattr(loop_module, "ChildManager", _recording_child_manager)

    result = runner.invoke(
        app,
        ["run", "--background", "--workspace", str(tmp_path), "test task"],
    )

    assert result.exit_code == 0, (result.output, result.exception)
    assert seen_policies, "no ChildManager was constructed"

    defaults = RotarisConfig().runtime
    policy = seen_policies[0]
    # `small_feature` gives the orchestrator a `tight` budget.
    assert policy.max_active_children == 2 < defaults.max_active_children
    assert policy.max_children == 6 < defaults.max_children
    assert policy.max_depth == 2 < defaults.max_depth
    # Fields the budget does not govern are untouched.
    assert policy.child_timeout == defaults.child_timeout


@verifies(SWR.SWR_2416)
def test_background_run_leaves_limits_alone_for_a_wide_budget(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from rotaris_core.ralph.intent_classifier import IntentCategory, IntentClassificationResult

    async def _classify_whole_project(*args: Any, **kwargs: Any) -> Any:
        del args, kwargs
        return IntentClassificationResult(intent=IntentCategory.WHOLE_PROJECT)

    monkeypatch.setattr(
        "rotaris_core.ralph.intent_classifier.classify_initial_intent",
        _classify_whole_project,
    )
    monkeypatch.setattr(
        "rotaris_core.orchestrator.scheduler.Scheduler.run_child",
        _stub_run_child,
    )

    import rotaris_core.ralph.loop as loop_module

    real_child_manager = loop_module.ChildManager
    seen_policies: list[Any] = []

    def _recording_child_manager(*args: Any, **kwargs: Any) -> Any:
        seen_policies.append(kwargs.get("policy"))
        return real_child_manager(*args, **kwargs)

    monkeypatch.setattr(loop_module, "ChildManager", _recording_child_manager)

    result = runner.invoke(
        app,
        ["run", "--background", "--workspace", str(tmp_path), "test task"],
    )

    assert result.exit_code == 0, (result.output, result.exception)
    assert seen_policies
    defaults = RotarisConfig().runtime
    assert seen_policies[0].max_active_children == defaults.max_active_children
    assert seen_policies[0].max_children == defaults.max_children
