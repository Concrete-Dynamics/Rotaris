"""Deterministic Serena project setup (SWR-2820).

The runner is exercised through an injected process runner rather than a real
``uvx``: what these tests are about is *which commands are issued and how their
outcomes are reported*, and a live Serena would make that a slow assertion about
someone else's software. The one thing not faked is the command construction —
it comes from the real config entry through the real resolver (SWR-2823), so a
change that stopped honouring the pin fails here.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any
from unittest.mock import Mock

import pytest

import rotaris_core.init.serena_setup as serena_setup
from rotaris_core.config.defaults import DEFAULT_MCP_SERVERS
from rotaris_core.config.mcp_resolution import resolve_serena_cli_command
from rotaris_core.config.schema import MCPServerConfig, RotarisConfig
from rotaris_core.init.serena_setup import (
    INDEX_STEP,
    MEMORIES_STEP,
    PROJECT_STEP,
    SERENA_SETUP_TASK_ID,
    SKIPPED_NO_CODE,
    CommandResult,
    run_serena_setup,
)
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from collections.abc import Callable, Sequence
    from pathlib import Path

pytestmark = pytest.mark.unit

_DEFAULT_SERENA_CLI = resolve_serena_cli_command(DEFAULT_MCP_SERVERS["serena"])
assert _DEFAULT_SERENA_CLI is not None
_DEFAULT_SERENA_PREFIX = [_DEFAULT_SERENA_CLI[0], *_DEFAULT_SERENA_CLI[1]]


class _FakeProcesses:
    """Records the commands asked for and answers each with a scripted result."""

    def __init__(self, failing: str | None = None, **flags: bool) -> None:
        self.calls: list[list[str]] = []
        self._failing = failing
        self._flags = flags

    def __call__(
        self,
        args: Sequence[str],
        _cwd: Path,
        _timeout: float,
        _is_cancelled: Callable[[], bool],
    ) -> CommandResult:
        self.calls.append(list(args))
        if self._failing is not None and self._failing in args:
            return CommandResult(
                args=tuple(args),
                returncode=None if self._flags else 1,
                output="serena: it did not work",
                **self._flags,
            )
        return CommandResult(args=tuple(args), returncode=0, output="ok")

    @property
    def subcommands(self) -> list[str]:
        """The Serena subcommand of each call — everything after the launch prefix."""
        prefix = len(_DEFAULT_SERENA_PREFIX)
        return [" ".join(call[prefix:-1]) for call in self.calls]


def _config(workspace: Path, **servers: MCPServerConfig) -> RotarisConfig:
    return RotarisConfig(
        workspace_root=workspace,
        mcp_servers=dict(servers) or {"serena": DEFAULT_MCP_SERVERS["serena"]},
    )


def _code_workspace(tmp_path: Path) -> Path:
    workspace = tmp_path / "code"
    (workspace / "src").mkdir(parents=True)
    (workspace / "src" / "app.py").write_text("def go() -> None: ...\n", encoding="utf-8")
    return workspace


def _docs_workspace(tmp_path: Path) -> Path:
    workspace = tmp_path / "docs-only"
    workspace.mkdir()
    (workspace / "README.md").write_text("# just docs\n", encoding="utf-8")
    return workspace


@verifies(SWR.SWR_2820)
def test_code_workspace_runs_every_stage(tmp_path: Path) -> None:
    """Productive use: a developer opens a code project and Serena ends up able to
    answer symbol questions about it, with no model involved anywhere.

    Expected outcome: the project file, the symbol index and the memory layout are all
    produced, by the pinned build the MCP server would have launched."""
    workspace = _code_workspace(tmp_path)
    processes = _FakeProcesses()

    result = run_serena_setup(_config(workspace), workspace, run_process=processes)

    assert result.task_id == SERENA_SETUP_TASK_ID
    assert result.status == "success"
    assert result.classification == "code"
    assert processes.subcommands == [
        "project create --ls python",
        "project index",
        "memories initialize",
    ]
    assert [(step.name, step.status) for step in result.steps] == [
        (PROJECT_STEP, "success"),
        (INDEX_STEP, "success"),
        (MEMORIES_STEP, "success"),
    ]
    # The pin reaches the CLI, not only the server launch (SWR-2823).
    assert processes.calls[0][: len(_DEFAULT_SERENA_PREFIX)] == _DEFAULT_SERENA_PREFIX
    assert processes.calls[0][-1] == str(workspace)


@verifies(SWR.SWR_2820)
def test_code_workspace_passes_detected_languages_without_prompting(tmp_path: Path) -> None:
    """Productive use: a developer opens a mixed-language workspace unattended.

    Expected outcome: Serena receives explicit language servers and does not request input."""
    workspace = _code_workspace(tmp_path)
    (workspace / "src" / "client.ts").write_text("export const ready = true;\n", encoding="utf-8")
    (workspace / "src" / "worker.rs").write_text("fn main() {}\n", encoding="utf-8")
    processes = _FakeProcesses()

    result = run_serena_setup(_config(workspace), workspace, run_process=processes)

    assert result.status == "success"
    assert processes.calls[0][len(_DEFAULT_SERENA_PREFIX) :] == [
        "project",
        "create",
        "--ls",
        "python",
        "--ls",
        "typescript",
        "--ls",
        "rust",
        str(workspace),
    ]


@verifies(SWR.SWR_2820)
def test_an_existing_project_file_is_not_recreated(tmp_path: Path) -> None:
    """Productive use: a developer reopens a workspace whose Serena project file already
    exists, or retries after the project step succeeded but indexing failed.

    Expected outcome: the project step reports success without re-running `project create`
    (which would refuse), and indexing and memory seeding still run."""
    workspace = _code_workspace(tmp_path)
    (workspace / ".serena").mkdir()
    (workspace / ".serena" / "project.yml").write_text(
        "language_servers: [python]\n", encoding="utf-8"
    )
    processes = _FakeProcesses()

    result = run_serena_setup(_config(workspace), workspace, run_process=processes)

    assert result.status == "success"
    assert [(step.name, step.status) for step in result.steps] == [
        (PROJECT_STEP, "success"),
        (INDEX_STEP, "success"),
        (MEMORIES_STEP, "success"),
    ]
    # `project create` was not issued; the stages that matter still were.
    assert processes.subcommands == ["project index", "memories initialize"]


@verifies(SWR.SWR_2820, SWR.SWR_2804)
def test_non_code_workspace_skips_indexing_and_memory_seeding(tmp_path: Path) -> None:
    """Productive use: a developer opens a documentation repository and Rotaris does not
    spend minutes indexing symbols that do not exist.

    Expected outcome: the project is registered with Serena, the two stages that need
    code report themselves skipped, and the run still succeeds."""
    workspace = _docs_workspace(tmp_path)
    processes = _FakeProcesses()

    result = run_serena_setup(_config(workspace), workspace, run_process=processes)

    assert result.status == "success"
    assert result.classification == "non-code"
    assert processes.subcommands == ["project create"]
    assert [(step.name, step.status) for step in result.steps] == [
        (PROJECT_STEP, "success"),
        (INDEX_STEP, SKIPPED_NO_CODE),
        (MEMORIES_STEP, SKIPPED_NO_CODE),
    ]
    assert "documentation only" in result.summary


@verifies(SWR.SWR_2820)
def test_a_failing_stage_stops_the_run_and_records_nothing(tmp_path: Path) -> None:
    """Productive use: setup that could not create the project file does not go on to
    report two more failures with the same one cause.

    Expected outcome: the run ends at the failing stage, is retryable, and carries the
    command's own output so the user is told what Serena said."""
    workspace = _code_workspace(tmp_path)
    processes = _FakeProcesses(failing="create")

    result = run_serena_setup(_config(workspace), workspace, run_process=processes)

    assert result.status == "failure"
    assert result.retryable is True
    assert processes.subcommands == ["project create --ls python"]
    assert [step.name for step in result.steps] == [PROJECT_STEP]
    assert "it did not work" in (result.error or "")


@verifies(SWR.SWR_2820)
def test_a_later_failing_stage_keeps_the_stages_that_passed(tmp_path: Path) -> None:
    """Productive use: a user retrying after a failed index can see the project file was
    never the problem.

    Expected outcome: the successful stages stay in the report alongside the failed one."""
    workspace = _code_workspace(tmp_path)
    processes = _FakeProcesses(failing="index")

    result = run_serena_setup(_config(workspace), workspace, run_process=processes)

    assert result.status == "failure"
    assert [(step.name, step.status) for step in result.steps] == [
        (PROJECT_STEP, "success"),
        (INDEX_STEP, "failure"),
    ]
    assert processes.subcommands == ["project create --ls python", "project index"]


@verifies(SWR.SWR_2820)
def test_a_cancelled_run_is_retryable(tmp_path: Path) -> None:
    """Productive use: a developer closes Rotaris while a large repository is indexing,
    and reopening it finishes the job rather than declaring it done or broken.

    Expected outcome: the interruption is reported as a retryable failure in the user's
    own terms, not as an error they are asked to act on."""
    workspace = _code_workspace(tmp_path)
    processes = _FakeProcesses(failing="index", cancelled=True)

    result = run_serena_setup(_config(workspace), workspace, run_process=processes)

    assert result.status == "failure"
    assert result.retryable is True
    index_step = next(step for step in result.steps if step.name == INDEX_STEP)
    assert "stopped" in index_step.detail


@verifies(SWR.SWR_2820)
def test_a_timed_out_stage_is_not_reported_as_a_bad_exit(tmp_path: Path) -> None:
    """Productive use: a hung language server reads as "did not finish", not as Serena
    rejecting the project.

    Expected outcome: the step says so plainly, and the run stays retryable."""
    workspace = _code_workspace(tmp_path)
    processes = _FakeProcesses(failing="index", timed_out=True)

    result = run_serena_setup(_config(workspace), workspace, run_process=processes)

    index_step = next(step for step in result.steps if step.name == INDEX_STEP)
    assert "time budget" in index_step.detail
    assert result.retryable is True


@verifies(SWR.SWR_2820)
def test_timing_out_on_windows_terminates_the_serena_process_tree(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a developer closes Rotaris while Serena has spawned helpers.

    Expected outcome: timeout removes the wrapper and every descendant, leaving no background work."""
    process = Mock()
    process.pid = 4321
    taskkill = Mock(return_value=serena_setup.subprocess.CompletedProcess([], 0))
    monkeypatch.setattr(serena_setup.os, "name", "nt")
    monkeypatch.setattr(serena_setup.subprocess, "run", taskkill)

    result = serena_setup._stop(process, ["serena"], timed_out=True)

    taskkill.assert_called_once_with(
        ["taskkill", "/pid", "4321", "/t", "/f"],
        check=False,
        stdout=serena_setup.subprocess.DEVNULL,
        stderr=serena_setup.subprocess.DEVNULL,
    )
    process.wait.assert_called_once_with(timeout=serena_setup._TERMINATE_GRACE_SECONDS)
    assert result.timed_out is True


@verifies(SWR.SWR_2820)
def test_windows_tree_cleanup_falls_back_to_terminating_the_wrapper(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a developer stops setup while Windows cannot kill its tree.

    Expected outcome: Rotaris does not ignore the failed tree cleanup and still ends the
    direct Serena wrapper rather than leaving all setup work running."""
    process = Mock()
    process.pid = 4321
    taskkill = Mock(return_value=serena_setup.subprocess.CompletedProcess([], 1))
    monkeypatch.setattr(serena_setup.os, "name", "nt")
    monkeypatch.setattr(serena_setup.subprocess, "run", taskkill)

    serena_setup._terminate_process_tree(process)

    taskkill.assert_called_once()
    process.terminate.assert_called_once()


@verifies(SWR.SWR_2820, SWR.SWR_2823)
def test_a_non_launch_serena_entry_is_reported_not_guessed_at(tmp_path: Path) -> None:
    """Productive use: a workspace pointing `serena` at a remote endpoint is told setup
    cannot run there, rather than having some invented command run against its tree.

    Expected outcome: a non-retryable failure and no subprocess at all."""
    workspace = _code_workspace(tmp_path)
    processes = _FakeProcesses()
    config = _config(
        workspace,
        serena=MCPServerConfig(type="http", url="http://127.0.0.1:9121/mcp"),
    )

    result = run_serena_setup(config, workspace, run_process=processes)

    assert result.status == "failure"
    assert result.retryable is False
    assert processes.calls == []


@verifies(SWR.SWR_2820)
def test_a_workspace_without_serena_configured_runs_nothing(tmp_path: Path) -> None:
    """Productive use: setup cannot silently succeed on a machine with no Serena.

    Expected outcome: reported as unavailable, with no command issued."""
    workspace = _code_workspace(tmp_path)
    processes = _FakeProcesses()
    config = RotarisConfig(workspace_root=workspace, mcp_servers={})

    result = run_serena_setup(config, workspace, run_process=processes)

    assert result.status == "failure"
    assert processes.calls == []


@verifies(SWR.SWR_2820)
def test_the_runner_accepts_the_kwargs_the_registry_forwards(tmp_path: Path) -> None:
    """Productive use: a task registered alongside others is dispatched generically, and
    keyword arguments meant for a different runner must not break this one.

    Expected outcome: unknown keyword arguments are ignored rather than raising."""
    workspace = _code_workspace(tmp_path)
    processes = _FakeProcesses()

    result: Any = run_serena_setup(
        _config(workspace),
        workspace,
        run_process=processes,
        mcp_tool_provider=object(),
        on_something_else=lambda: None,
    )

    assert result.status == "success"
