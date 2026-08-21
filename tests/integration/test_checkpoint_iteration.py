"""One real run, wired end to end: lifecycle hooks, checkpoints, one event pair.

This is the seam SWR-2703 and SWR-2436 both land on — the iteration observer —
so the honest way to test either is a genuine run through the shared entry point
``run_host.execute_run``: a real session on disk, a real Ralph loop, a real
agent, a real Git repository, real hook *processes*, and the real event bus.
Only the model is faked (``tests.integration.scripted_llm``), because that is
the network call a test may not make.

What the assertions are about:

* **The hooks a user configured actually ran**, once per occurrence, with the
  session id and workspace on stdin — that is the whole product promise of
  SWR-2703, and a mocked runner would prove none of it.
* **The iteration produced an undo point** under ``refs/rotaris/checkpoints/``
  that survives a reload through a plain ``SessionManager``, without the user's
  branch or ``HEAD`` moving (SWR-2436).
* **The stream carries exactly one ``session.start`` and one ``session.end``.**
  Both this host and the Ralph loop used to publish that pair, so a consumer
  counting them got two.  The count is asserted here *and* for the other host
  shape — a loop driven directly, the way the desktop app and the TUI drive it —
  because the fix moves the responsibility rather than deleting it, and the
  shape that kept its copy must still emit exactly one (SWR-1829).
"""

from __future__ import annotations

import json
import os
import shlex
import subprocess
import sys
from typing import TYPE_CHECKING, Any

import pytest

from rotaris_core.config import loader as config_loader
from rotaris_core.config.schema import RotarisConfig, RuntimePolicy
from rotaris_core.events.bus import register_event_sink, reset_event_registry
from rotaris_core.hooks.registry import reset_hook_registry, resolve_hook_runner
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.run_host import RunRequest, execute_run
from rotaris_core.run_result import RunStatus
from rotaris_core.session import SessionManager
from tests.integration.scripted_llm import ScriptedLLM, say

if TYPE_CHECKING:
    from collections.abc import Iterator
    from pathlib import Path

    from rotaris_core.events.schema import RotarisEvent

pytestmark = [pytest.mark.integration, pytest.mark.e2e]

#: Every agent the run builds answers in one text turn; a turn carrying tool
#: calls would mean "keep going", so the script is all final turns.
_TURN_BUDGET = 40

#: Tracked in the repository's first commit so an iteration that appends to it
#: produces an unambiguous working-tree change for the checkpoint to capture.
_ITERATION_LOG = "iterations.log"


@pytest.fixture(autouse=True)
def _clean_registries() -> Iterator[None]:
    """A sink, approval host or hook runner left behind bleeds into the next test."""
    from rotaris_core.permissions import reset_approval_registry

    reset_event_registry()
    reset_approval_registry()
    reset_hook_registry()
    yield
    reset_event_registry()
    reset_approval_registry()
    reset_hook_registry()


def _git(cwd: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=cwd,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    return result.stdout


def _shell(*parts: str) -> str:
    """Quote *parts* for the shell the hook runner hands the command to."""
    if os.name == "nt":
        return subprocess.list2cmdline(parts)
    return shlex.join(parts)


def _recorder_script(path: Path) -> Path:
    """A hook body: append this invocation's stdin payload to ``argv[1]``."""
    path.write_text(
        "import pathlib, sys\n"
        "target = pathlib.Path(sys.argv[1])\n"
        "target.parent.mkdir(parents=True, exist_ok=True)\n"
        'payload = sys.stdin.read().replace("\\n", " ").strip()\n'
        'with target.open("a", encoding="utf-8") as handle:\n'
        '    handle.write(payload + "\\n")\n',
        encoding="utf-8",
    )
    return path


def _repository(root: Path) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    _git(root, "init", "-b", "main")
    _git(root, "config", "user.name", "Test User")
    _git(root, "config", "user.email", "test@example.invalid")
    (root / ".gitignore").write_text(".rotaris/\n", encoding="utf-8")
    (root / _ITERATION_LOG).write_text("", encoding="utf-8")
    _git(root, "add", ".")
    _git(root, "commit", "-m", "initial")
    return root


def _checkpoint_refs(root: Path, session_id: str) -> list[str]:
    raw = _git(
        root,
        "for-each-ref",
        "--format=%(refname)",
        f"refs/rotaris/checkpoints/{session_id}",
    )
    return [line for line in raw.split() if line]


@pytest.fixture
def hooked_workspace(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> tuple[RotarisConfig, Path]:
    """A real Git workspace whose *user* config declares two lifecycle hooks.

    The hooks live in the global scope on purpose. Hooks declared by the
    *workspace* travel inside a clone and are held back until the user has
    trusted them (SWR-2701), so a workspace-scoped hook here would prove the
    trust gate works rather than that the bridge does — and the trust gate has
    its own suite.
    """
    from rotaris_core.config.bootstrap import write_minimal_agents_yaml

    workspace = _repository(tmp_path / "workspace")
    agents_yaml = workspace / ".rotaris" / "agents.yaml"
    write_minimal_agents_yaml(agents_yaml)
    agents_yaml.write_text(
        agents_yaml.read_text(encoding="utf-8") + "\ncheckpoints:\n  enabled: true\n",
        encoding="utf-8",
    )

    recorder = _recorder_script(tmp_path / "record_hook.py")
    started_log = tmp_path / "session-start.jsonl"

    global_dir = tmp_path / "global"
    global_dir.mkdir()
    (global_dir / "agents.yaml").write_text(
        "hooks:\n"
        "  entries:\n"
        "    - name: announce-start\n"
        "      event: session_start\n"
        f"      command: {json.dumps(_shell(sys.executable, str(recorder), str(started_log)))}\n"
        "      timeout_seconds: 60\n"
        "    - name: log-iteration\n"
        "      event: iteration_end\n"
        "      command: "
        f"{json.dumps(_shell(sys.executable, str(recorder), str(workspace / _ITERATION_LOG)))}\n"
        "      timeout_seconds: 60\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(config_loader, "GLOBAL_CONFIG_DIR", global_dir)

    scripted = ScriptedLLM([say("The task is done.")] * _TURN_BUDGET)
    monkeypatch.setattr(
        config_loader,
        "load_llm_for_model",
        lambda *args, **kwargs: scripted.llm,
    )

    config = config_loader.load_config(workspace)
    # Configured MCP servers would start subprocesses; nothing here is about MCP.
    config.mcp_servers.clear()
    for persona in config.personas.values():
        persona.mcp_servers.clear()
    return config, started_log


@verifies(SWR.SWR_2703, SWR.SWR_2436, SWR.SWR_1829)
async def test_a_run_fires_its_lifecycle_hooks_and_leaves_a_restorable_checkpoint(
    hooked_workspace: tuple[RotarisConfig, Path],
) -> None:
    """Productive use: a user configures a hook to log every iteration, turns
    checkpoints on, and runs a task; afterwards they want to see that the hook
    ran and that the iteration's changes can be undone.
    Expected outcome: the session_start hook ran once with this session's id and
    workspace on stdin, the iteration_end hook wrote one line per iteration, a
    checkpoint ref exists for the iteration that changed files and is still
    listed after a plain reload, the user's branch and HEAD never moved, and the
    stream carries exactly one session.start and one session.end."""
    config, started_log = hooked_workspace
    workspace = config.workspace_root
    head_before = _git(workspace, "rev-parse", "HEAD").strip()
    branch_before = _git(workspace, "rev-parse", "--abbrev-ref", "HEAD").strip()

    events: list[RotarisEvent] = []
    manager = SessionManager(workspace)
    result = await execute_run(
        RunRequest(task="write the release notes", config=config, max_iterations=1),
        manager,
        event_sink=events.append,
    )

    assert result.status is RunStatus.COMPLETED, result.error
    session_id = result.session_id

    # -- the hooks ran, once each, with a payload they can branch on ------
    start_payloads = [
        json.loads(line) for line in started_log.read_text(encoding="utf-8").splitlines() if line
    ]
    assert len(start_payloads) == 1, "session_start fired once per run"
    assert start_payloads[0]["event"] == "session_start"
    assert start_payloads[0]["session_id"] == session_id
    assert start_payloads[0]["workspace"] == str(workspace)
    # The loop's notion of "the task" is the first todo item's execution payload,
    # which wraps the user's words in the run's framing; the user's words are in
    # there, which is what a notification hook needs.
    assert "write the release notes" in start_payloads[0]["task"]

    iteration_lines = [
        line
        for line in (workspace / _ITERATION_LOG).read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    assert len(iteration_lines) == result.iterations_completed == 1
    logged = json.loads(iteration_lines[0])
    assert logged["event"] == "iteration_end"
    assert logged["iteration"] == 1, "the payload names the iteration that ended, not 0"

    # -- the iteration left an undo point --------------------------------
    refs = _checkpoint_refs(workspace, session_id)
    assert refs == [f"refs/rotaris/checkpoints/{session_id}/1"], refs

    # It survives a reload through the ordinary session store, which is what
    # SWR-2436 means by "the mapping is stored with the session".
    reloaded = SessionManager(workspace).load_session(session_id).checkpoints
    assert [entry.ref for entry in reloaded] == refs
    assert reloaded[0].iteration == 1
    assert reloaded[0].child_name
    assert _ITERATION_LOG in reloaded[0].files

    # -- and the user's own Git state is untouched ------------------------
    assert _git(workspace, "rev-parse", "HEAD").strip() == head_before
    assert _git(workspace, "rev-parse", "--abbrev-ref", "HEAD").strip() == branch_before

    # -- one of each lifecycle event, not two -----------------------------
    names = [event.event for event in events]
    assert names.count("session.start") == 1, names
    assert names.count("session.end") == 1, names
    assert names[0] == "session.start"
    assert names[-1] == "result"

    # -- nothing registered outlives the run ------------------------------
    assert resolve_hook_runner(session_id) is None


@verifies(SWR.SWR_1829)
async def test_a_loop_driven_directly_still_publishes_one_session_pair(
    tmp_path: Path,
) -> None:
    """Productive use: the desktop app and the Textual TUI build a RalphLoop
    themselves instead of going through the shared run host, and their session
    views are driven by the same two events.
    Expected outcome: that host shape still emits exactly one session.start and
    one session.end — the duplicate-event fix moved the responsibility to the
    run host without taking the events away from the hosts that own them."""
    from rotaris_core.ralph.loop import RalphLoop
    from rotaris_core.tools.todo_state import TodoList

    session_id = "direct-loop-session"
    captured: list[RotarisEvent] = []
    register_event_sink(session_id, captured.append)

    loop = RalphLoop(
        config=RotarisConfig(runtime=RuntimePolicy(child_timeout=5)),
        workspace_root=str(tmp_path),
        summary_agent=_never_called,
    )
    await loop.run(
        TodoList(phases=[]),
        agent_factory=_never_called,
        session_id=session_id,
    )

    names = [event.event for event in captured]
    assert names.count("session.start") == 1, names
    assert names.count("session.end") == 1, names


def _never_called(*args: Any, **kwargs: Any) -> Any:  # pragma: no cover - defensive
    del args, kwargs
    raise AssertionError("an empty todo list must not build an agent")
