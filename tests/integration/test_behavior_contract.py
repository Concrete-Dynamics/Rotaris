from __future__ import annotations

from typing import TYPE_CHECKING, Any

import pytest
from typer.testing import CliRunner

from rotaris_core import __version__
from rotaris_core.cli.app import app
from rotaris_core.cli.argparse_app import main as argparse_main
from rotaris_core.config.schema import RotarisConfig
from rotaris_core.orchestrator.child_state import ChildTaskRecord, ChildTaskState
from rotaris_core.orchestrator.report import ChildReportArtifact
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session import SessionManager

if TYPE_CHECKING:
    from pathlib import Path


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


runner = CliRunner()


class TyperBackend:
    name = "typer"

    def invoke(
        self,
        args: list[str],
        capsys: pytest.CaptureFixture[str] | None = None,
    ) -> tuple[int, str, str]:
        del capsys
        result = runner.invoke(app, args)
        return result.exit_code, result.stdout, ""


class ArgparseBackend:
    name = "argparse"

    def invoke(
        self,
        args: list[str],
        capsys: pytest.CaptureFixture[str] | None = None,
    ) -> tuple[int, str, str]:
        normalized_args = [arg for arg in args if arg != "--background"]
        code = argparse_main(argv=normalized_args)
        if capsys is None:
            return code, "", ""
        captured = capsys.readouterr()
        return code, captured.out, captured.err


type CliBackend = TyperBackend | ArgparseBackend


@pytest.fixture(params=[TyperBackend(), ArgparseBackend()], ids=["typer", "argparse"])
def cli_backend(request: pytest.FixtureRequest) -> CliBackend:
    return request.param


@verifies(SWR.SWR_1817, SWR.SWR_2101, SWR.SWR_2104)
def test_version_command_outputs_package_version(
    cli_backend: CliBackend,
    capsys: pytest.CaptureFixture[str],
) -> None:
    code, stdout, stderr = cli_backend.invoke(["version"], capsys)

    assert code == 0
    assert stderr == ""
    assert stdout.strip() == f"Rotaris {__version__}"


@verifies(SWR.SWR_1817, SWR.SWR_2104, SWR.SWR_2105)
def test_sessions_command_handles_empty_workspace(
    cli_backend: CliBackend,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    code, stdout, stderr = cli_backend.invoke(
        ["sessions", "--workspace", str(tmp_path)],
        capsys,
    )

    assert code == 0
    assert stdout.strip() == ""
    assert stderr == ""


@verifies(SWR.SWR_1024, SWR.SWR_1821, SWR.SWR_1822)
def test_background_run_creates_completed_session(
    cli_backend: CliBackend,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr(
        "rotaris_core.orchestrator.scheduler.Scheduler.run_child",
        _stub_run_child,
    )

    code, stdout, _ = cli_backend.invoke(
        ["run", "--background", "--workspace", str(tmp_path), "test task"],
        capsys,
    )

    assert code == 0
    if cli_backend.name == "typer":
        assert "Created session" in stdout
        assert "Done." in stdout

    manager = SessionManager(tmp_path)
    sessions = manager.list_sessions()
    assert len(sessions) == 1

    state = manager.load_session(sessions[0]["session_id"])
    assert state.execution_status == "completed"
    assert state.transcript_events[0] == {"role": "user", "content": "test task"}
    assert state.transcript_events[1] == {
        "role": "system",
        "content": "Intent classified: moderate_feature",
    }
    assert state.transcript_events[2] == {
        "role": "agent",
        "name": state.transcript_events[2]["name"],
        "content": "Actual user-facing answer",
    }
    assert state.transcript_events[-1] == {"role": "system", "content": "Run completed."}
    session_dir = manager.session_dir(sessions[0]["session_id"])
    assert (session_dir / "run.log").exists()
    assert (session_dir / "evidence" / "debug.log").exists()
    assert (session_dir / "summary.md").exists()


@verifies(SWR.SWR_1028, SWR.SWR_1821)
def test_background_run_resumes_existing_session(
    cli_backend: CliBackend,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr(
        "rotaris_core.orchestrator.scheduler.Scheduler.run_child",
        _stub_run_child,
    )
    manager = SessionManager(tmp_path)
    state = manager.create_session(RotarisConfig(workspace_root=tmp_path))
    manager.release_lock(state.session_id)

    code, stdout, _ = cli_backend.invoke(
        [
            "run",
            "--background",
            "--workspace",
            str(tmp_path),
            "--session",
            state.session_id,
            "resumed task",
        ],
        capsys,
    )

    assert code == 0
    if cli_backend.name == "typer":
        assert f"Resuming session {state.session_id}" in stdout

    loaded = manager.load_session(state.session_id)
    assert loaded.execution_status == "completed"
    assert loaded.transcript_events[-4] == {"role": "user", "content": "resumed task"}
    assert loaded.transcript_events[-3] == {
        "role": "system",
        "content": "Intent classified: moderate_feature",
    }
    assert loaded.transcript_events[-2]["content"] == "Actual user-facing answer"
    assert loaded.transcript_events[-1] == {"role": "system", "content": "Run completed."}


@verifies(SWR.SWR_314)
def test_background_run_honors_custom_config_file(
    cli_backend: CliBackend,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr(
        "rotaris_core.orchestrator.scheduler.Scheduler.run_child",
        _stub_run_child,
    )
    config_path = tmp_path / "agents.yaml"
    config_path.write_text("default_persona: coding-agent\n", encoding="utf-8")

    code, _, _ = cli_backend.invoke(
        [
            "run",
            "--background",
            "--workspace",
            str(tmp_path),
            "--config",
            str(config_path),
            "config task",
        ],
        capsys,
    )

    assert code == 0

    manager = SessionManager(tmp_path)
    state = manager.load_session(manager.list_sessions()[0]["session_id"])
    assert state.config_snapshot["default_persona"] == "coding-agent"


@verifies(SWR.SWR_316, SWR.SWR_317)
def test_background_run_custom_config_file_preserves_unspecified_persona_fields(
    cli_backend: CliBackend,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr(
        "rotaris_core.orchestrator.scheduler.Scheduler.run_child",
        _stub_run_child,
    )
    config_path = tmp_path / "agents.yaml"
    config_path.write_text(
        """
personas:
  coding-agent:
    model: gpt-4o-mini
""".strip(),
        encoding="utf-8",
    )

    code, _, _ = cli_backend.invoke(
        [
            "run",
            "--background",
            "--workspace",
            str(tmp_path),
            "--config",
            str(config_path),
            "--persona",
            "coding-agent",
            "config task",
        ],
        capsys,
    )

    assert code == 0

    manager = SessionManager(tmp_path)
    state = manager.load_session(manager.list_sessions()[0]["session_id"])
    coding_agent = state.config_snapshot["personas"]["coding-agent"]
    assert coding_agent["model"] == "gpt-4o-mini"
    assert coding_agent["system_prompt_file"] == "prompts/coding_agent.md"
