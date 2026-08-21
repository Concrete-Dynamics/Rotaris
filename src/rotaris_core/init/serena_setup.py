"""Set a workspace up in Serena deterministically, with no agent (SWR-2820).

Project setup was an LLM agent's job (SWR-2803). It is not one. Everything the
setup produces, Serena's own CLI produces without a model, and the one part the
agent added — prose memories — was a small model's guess at content Rotaris
already injects from ``AGENTS.md`` (SWR-449), read afterwards by nobody, because
no persona prompt mentioned memories at all.

What that cost: the pinned ``serena-agent`` resolves to 75 transitive packages,
so the first launch on a cold ``uvx`` cache is minutes of download before the
agent takes a turn — and with no provider configured it ends in a LiteLLM
authentication error, having spent all of it. Meanwhile the step that actually
makes Serena fast, building the symbol index, never ran at all: Serena's
``onboarding`` tool does not index, it returns a prompt.

So this module runs three CLI subcommands and reports one step for each. It needs
no model, no provider, no conversation, and — being deterministic — no question
for the user (SWR-2821), which is what lets it run in the background on workspace
open instead of behind a modal.

Three decisions worth stating:

* **There is no separate health check.** ``serena project health-check`` looked
  like the obvious fourth step and was measured doing the opposite of its job: it
  ran past a five-minute budget on a two-file workspace, and on Windows it dies
  with ``UnicodeEncodeError`` while printing the ``❌`` of its own failure
  message — so the one case where it has something to say is the case where it
  cannot say it. Nothing was lost by removing it: ``project index`` finishing
  successfully *is* the health check, because it only can if the language server
  started and answered.
* **The child runs in UTF-8.** Serena's CLI prints status glyphs, and Python on
  Windows defaults its pipes to the console codepage, which cannot encode them.
  Without this a subcommand can fail on the character it uses to report success.
* **Nothing here writes the ``initialization:`` marker.** As for every task,
  :mod:`rotaris_core.init.registry` is the sole writer (`_record_or_fail`), so a
  failed run leaves the workspace re-runnable and a future task author cannot
  forget the rule.
"""

from __future__ import annotations

import logging
import os
import subprocess  # noqa: S404 — the whole point of this module
import time
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from rotaris_core.init.classifier import classify_project, source_extensions_in_project
from rotaris_core.init.registry import InitStepResult, InitTaskResult
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Callable, Sequence
    from pathlib import Path

    from rotaris_core.config.schema import RotarisConfig
    from rotaris_core.init.classifier import ProjectKind

_log = logging.getLogger(__name__)

SERENA_SETUP_TASK_ID = "serena-setup"
"""Task id recorded in ``initialization.completed`` (SWR-2820).

Deliberately not ``serena``. A workspace initialized before this requirement
carries ``completed: [serena]`` for a task that never built an index; under a
shared id it would count as done and never get one. Under a new id that stale
entry is simply an id the registry no longer knows, and the workspace picks up
the setup it never had.
"""

SERENA_MCP_SERVER_NAME = "serena"

PROJECT_STEP = "project"
INDEX_STEP = "index"
MEMORIES_STEP = "memories"

SKIPPED_NO_CODE = "skipped-no-code"
"""Step status for work a documentation-only workspace has nothing to do (SWR-2804)."""

#: Per-step wall-clock budgets. ``index`` is minutes by design: on a cold machine
#: it downloads the language server and then walks the whole tree. The others are
#: bounded generously enough that a slow disk is not mistaken for a hang, and
#: tightly enough that a hung child does not sit there for an hour.
DEFAULT_STEP_TIMEOUTS: dict[str, float] = {
    PROJECT_STEP: 300.0,
    INDEX_STEP: 1800.0,
    MEMORIES_STEP: 120.0,
}

#: Forced onto the child so Serena's status glyphs cannot kill a subcommand.
#: Python on Windows encodes a piped stdout in the console codepage, and `cp1252`
#: has no `✅` or `❌` — measured taking down `serena project health-check`
#: mid-message.
_UTF8_ENV = {"PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"}

_POLL_INTERVAL_SECONDS = 0.25
"""How often a running child is checked for completion, timeout and cancellation."""

_TERMINATE_GRACE_SECONDS = 5.0
"""How long a terminated child may exit before it is killed outright."""

_DETAIL_LIMIT = 400
"""How much of a failing command's output reaches the reported step detail."""

_SERENA_LANGUAGE_BY_SOURCE_EXTENSION = {
    ".py": "python",
    ".js": "typescript",
    ".ts": "typescript",
    ".jsx": "typescript",
    ".tsx": "typescript",
    ".rs": "rust",
    ".go": "go",
    ".java": "java",
    ".c": "cpp",
    ".cpp": "cpp",
    ".h": "cpp",
    ".hpp": "cpp",
    ".rb": "ruby",
    ".php": "php",
    ".swift": "swift",
    ".kt": "kotlin",
    ".scala": "scala",
    ".cs": "csharp",
    ".fs": "fsharp",
    ".ex": "elixir",
    ".exs": "elixir",
    ".r": "r",
    ".jl": "julia",
}
"""Serena language-server ids for the default SWR-2804 source extensions."""

__all__ = [
    "DEFAULT_STEP_TIMEOUTS",
    "INDEX_STEP",
    "MEMORIES_STEP",
    "PROJECT_STEP",
    "SERENA_SETUP_TASK_ID",
    "SKIPPED_NO_CODE",
    "CommandResult",
    "SerenaSetupResult",
    "run_serena_setup",
]


@dataclass(frozen=True)
class CommandResult:
    """One CLI invocation and how it ended.

    ``returncode`` is ``None`` when the command never produced one — a timeout or
    a cancellation — so "did not finish" is never mistaken for "finished badly".
    """

    args: tuple[str, ...]
    returncode: int | None
    output: str = ""
    timed_out: bool = False
    cancelled: bool = False

    @property
    def ok(self) -> bool:
        return self.returncode == 0


@dataclass(frozen=True)
@traces(SWR.SWR_2820)
class SerenaSetupResult(InitTaskResult):
    """Outcome of one deterministic Serena setup run.

    Extends the generic contract with the commands the verdict was derived from,
    so a caller can audit *what ran*. The generic fields are what the UI renders;
    these are for diagnostics and tests.
    """

    commands: tuple[CommandResult, ...] = ()


@traces(SWR.SWR_2820, SWR.SWR_2804)
def run_serena_setup(
    config: RotarisConfig,
    workspace_root: Path,
    *,
    is_cancelled: Callable[[], bool] | None = None,
    step_timeouts: dict[str, float] | None = None,
    run_process: Any | None = None,
    **_kwargs: Any,
) -> SerenaSetupResult:
    """Run Serena's setup CLI for *workspace_root* and report per-step status.

    The ``(config, workspace_root, **kwargs)`` signature is the shape the
    initialization-task registry holds as a task's ``run`` member, so this can be
    dispatched generically. Extra keyword arguments the registry forwards for
    other tasks are accepted and ignored.

    Args:
        config: Resolved workspace config. Supplies the ``serena`` server entry
            the CLI invocation is derived from (SWR-2823) and
            ``project_init.source_extensions`` for the classification.
        workspace_root: The project being set up.
        is_cancelled: Polled while a command runs; a true answer terminates the
            child and ends the run. This is how closing Rotaris mid-index stops
            the work rather than orphaning a subprocess.
        step_timeouts: Per-step wall-clock budgets, defaulting to
            :data:`DEFAULT_STEP_TIMEOUTS`.
        run_process: Seam for tests. Defaults to a real subprocess launch.

    Returns:
        A :class:`SerenaSetupResult`. A failure is returned, not raised — the
        caller records it and may offer a retry.
    """
    timeouts = {**DEFAULT_STEP_TIMEOUTS, **(step_timeouts or {})}
    cancelled = is_cancelled or (lambda: False)
    launch = _resolve_launch(config)
    if launch is None:
        return _unavailable()

    command, prefix = launch
    source_extensions = list(config.project_init.source_extensions)
    classification = classify_project(workspace_root, source_extensions)
    _log.info(
        "Serena setup starting — workspace=%s classification=%s command=%s",
        workspace_root,
        classification,
        command,
    )

    runner = run_process or _run_process
    target = str(workspace_root)
    steps: list[InitStepResult] = []
    commands: list[CommandResult] = []

    def _invoke(step: str, *subcommand: str) -> CommandResult:
        args = [command, *prefix, *subcommand]
        result = runner(args, workspace_root, timeouts[step], cancelled)
        commands.append(result)
        return result

    # Step 1 — the project file. Everything below needs it, so a failure here
    # ends the run rather than reporting three further failures with one cause.
    if _serena_project_file_exists(workspace_root):
        # `serena project create` refuses to overwrite an existing project file,
        # so do not re-run it: the step's goal is already met and the user's
        # language configuration must not be clobbered (SWR-2820).
        project = CommandResult(
            args=tuple([command, *prefix, "project", "create", target]),
            returncode=0,
            output="project file already exists; left as is",
        )
        commands.append(project)
    else:
        project = _invoke(
            PROJECT_STEP,
            "project",
            "create",
            *_serena_language_arguments(workspace_root, source_extensions),
            target,
        )
    steps.append(_step(PROJECT_STEP, project))
    if not project.ok:
        return _failed(steps, commands, classification, PROJECT_STEP, project)

    # Steps 2 and 3 — indexing and the memory layout, both meaningless without
    # code to index (SWR-2804). The classification decided that before any
    # subprocess started, by scanning the filesystem rather than asking a model.
    if classification == "non-code":
        steps.append(
            _skipped(INDEX_STEP, "No source files found, so there are no symbols to index."),
        )
        steps.append(
            _skipped(MEMORIES_STEP, "No source files found, so no memory layout was seeded."),
        )
    else:
        index = _invoke(INDEX_STEP, "project", "index", target)
        steps.append(_step(INDEX_STEP, index))
        if not index.ok:
            return _failed(steps, commands, classification, INDEX_STEP, index)

        memories = _invoke(MEMORIES_STEP, "memories", "initialize", target)
        steps.append(_step(MEMORIES_STEP, memories))
        if not memories.ok:
            return _failed(steps, commands, classification, MEMORIES_STEP, memories)

    _log.info(
        "Serena setup finished — workspace=%s classification=%s",
        workspace_root,
        classification,
    )
    return SerenaSetupResult(
        task_id=SERENA_SETUP_TASK_ID,
        status="success",
        steps=tuple(steps),
        classification=classification,
        summary=_summary(classification),
        commands=tuple(commands),
    )


# ---------------------------------------------------------------------------
# Reporting


def _step(name: str, result: CommandResult) -> InitStepResult:
    if result.ok:
        return InitStepResult(name=name, status="success")
    return InitStepResult(name=name, status="failure", detail=_detail(result))


def _skipped(name: str, detail: str) -> InitStepResult:
    return InitStepResult(name=name, status=SKIPPED_NO_CODE, detail=detail)


def _detail(result: CommandResult) -> str:
    if result.cancelled:
        return "Setup was stopped before this step finished."
    if result.timed_out:
        return "This step did not finish within its time budget."
    return result.output.strip()[-_DETAIL_LIMIT:]


@traces(SWR.SWR_2820)
def _serena_language_arguments(workspace_root: Path, source_extensions: Sequence[str]) -> list[str]:
    """Return explicit language arguments so Serena never asks an unattended user."""
    configured_extensions = set(source_extensions_in_project(workspace_root, source_extensions))
    languages = [
        language
        for extension, language in _SERENA_LANGUAGE_BY_SOURCE_EXTENSION.items()
        if extension in configured_extensions
    ]
    return [argument for language in dict.fromkeys(languages) for argument in ("--ls", language)]


@traces(SWR.SWR_2820)
def _serena_project_file_exists(workspace_root: Path) -> bool:
    """Whether Serena's project file already exists for *workspace_root*.

    ``serena project create`` refuses to overwrite an existing project file, so a
    workspace whose file is already present — from a prior partial run, or because the
    Serena MCP server wrote it when it launched in single-project mode — must skip the
    create step rather than fail on it (SWR-2820).
    """
    return (workspace_root / ".serena" / "project.yml").exists()


_STEP_FAILURE_REASONS: dict[str, str] = {
    PROJECT_STEP: "Serena could not create this project's configuration",
    INDEX_STEP: "Serena could not index this project's symbols",
    MEMORIES_STEP: "Serena could not seed this project's memory layout",
}


def _failed(
    steps: list[InitStepResult],
    commands: list[CommandResult],
    classification: ProjectKind,
    step: str,
    result: CommandResult,
) -> SerenaSetupResult:
    reason = _STEP_FAILURE_REASONS.get(step, f"Serena setup step '{step}' failed")
    detail = _detail(result)
    _log.warning("Serena setup failed at step '%s': %s", step, detail or "no output")
    return SerenaSetupResult(
        task_id=SERENA_SETUP_TASK_ID,
        status="failure",
        steps=tuple(steps),
        classification=classification,
        error=f"{reason}{f': {detail}' if detail else '.'}",
        # A cancelled run is not a broken one: the work is still worth doing, and
        # the workspace is left exactly as re-runnable as a failed one.
        retryable=True,
        summary=(
            "Serena setup did not complete for this project. "
            "It runs again the next time this workspace is opened."
        ),
        commands=tuple(commands),
    )


def _unavailable() -> SerenaSetupResult:
    """Result for a workspace whose ``serena`` entry yields no CLI invocation.

    Reached when the configured server is not a Serena launch — an HTTP endpoint,
    say, or a command with no launch verb. Reported rather than guessed at: an
    invented invocation would run some other program against the user's tree.
    """
    return SerenaSetupResult(
        task_id=SERENA_SETUP_TASK_ID,
        status="failure",
        error=(
            "This workspace's `serena` entry is not a local Serena launch, so its "
            "setup commands cannot be derived from it."
        ),
        retryable=False,
        summary=(
            "Serena project setup was skipped: the configured `serena` server is not "
            "one Rotaris can run setup commands against."
        ),
    )


def _summary(classification: ProjectKind) -> str:
    if classification == "non-code":
        return (
            "Serena is set up for this project. No symbols were indexed because the "
            "workspace contains documentation only."
        )
    return "Serena is set up for this project and its symbols are indexed."


# ---------------------------------------------------------------------------
# Process execution


def _resolve_launch(config: RotarisConfig) -> tuple[str, list[str]] | None:
    server_cfg = config.mcp_servers.get(SERENA_MCP_SERVER_NAME)
    if server_cfg is None:
        return None
    from rotaris_core.config.mcp_resolution import (  # noqa: PLC0415 — lazy per module policy
        resolve_serena_cli_command,
    )

    return resolve_serena_cli_command(server_cfg)


@traces(SWR.SWR_2820)
def _run_process(
    args: Sequence[str],
    cwd: Path,
    timeout: float,
    is_cancelled: Callable[[], bool],
) -> CommandResult:
    """Run one CLI command to completion, or stop it.

    Polled rather than handed to ``subprocess.run(timeout=...)`` because a run
    also has to end when *Rotaris* does: indexing a large repository takes
    minutes, and a user who closes the window in the middle of one should not
    leave a subprocess walking their tree. On either exit the child is terminated
    and then killed if it ignores that, so nothing is orphaned.
    """
    try:
        process = subprocess.Popen(  # noqa: S603 — argv list, no shell, command from config
            list(args),
            cwd=str(cwd),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            env={**os.environ, **_UTF8_ENV},
        )
    except OSError as exc:
        return CommandResult(args=tuple(args), returncode=None, output=str(exc))

    deadline = time.monotonic() + timeout
    while True:
        if process.poll() is not None:
            break
        if is_cancelled():
            return _stop(process, args, cancelled=True)
        if time.monotonic() >= deadline:
            return _stop(process, args, timed_out=True)
        time.sleep(_POLL_INTERVAL_SECONDS)

    output = process.stdout.read() if process.stdout is not None else ""
    return CommandResult(args=tuple(args), returncode=process.returncode, output=output or "")


@traces(SWR.SWR_2820)
def _terminate_process_tree(process: subprocess.Popen[str]) -> None:
    """Terminate ``process`` and all descendants on Windows."""
    if os.name == "nt":
        try:
            taskkill = subprocess.run(  # noqa: S603, S607 -- fixed Windows system command and PID
                ["taskkill", "/pid", str(process.pid), "/t", "/f"],
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            if taskkill.returncode == 0:
                return
            _log.debug("taskkill could not end the Serena process tree; ending the wrapper")
        except OSError:
            _log.debug(
                "taskkill was unavailable; terminating the Serena wrapper only", exc_info=True
            )
    process.terminate()


@traces(SWR.SWR_2820)
def _stop(
    process: subprocess.Popen[str],
    args: Sequence[str],
    *,
    cancelled: bool = False,
    timed_out: bool = False,
) -> CommandResult:
    """End a child that overran its budget or was cancelled, and report it as such."""
    try:
        _terminate_process_tree(process)
        process.wait(timeout=_TERMINATE_GRACE_SECONDS)
    except subprocess.TimeoutExpired:
        process.kill()
    except OSError:  # pragma: no cover — the child already exited
        _log.debug("Serena setup child was already gone when stopped", exc_info=True)
    return CommandResult(
        args=tuple(args),
        returncode=None,
        cancelled=cancelled,
        timed_out=timed_out,
    )
