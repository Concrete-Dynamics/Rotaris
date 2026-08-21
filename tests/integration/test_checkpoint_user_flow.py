"""The whole checkpoint story a user lives through (SWR-2436, SWR-2437).

Sibling files prove the seams: ``test_checkpoint_iteration.py`` proves the
observer records a checkpoint during a run, ``test_checkpoint_cli.py`` proves
both CLI entry points drive a restore, and ``tests/unit/test_checkpoints.py``
proves the Git plumbing. None of them walks the user's actual path, which is:
*run the agent, run it again, decide the second run was a mistake, and put the
tree back the way it was.*

That is what this file does, with nothing faked below the model. Two real runs
through ``run_host.execute_run`` drive a real Ralph loop over a real agent that
really writes files through its own ``write_file`` tool, into a real Git
repository. The checkpoints are the ones the run recorded, not ones a test
built by hand, and the rollback goes through the public
:class:`~rotaris_core.session.checkpoint_restore.CheckpointRestorer` — the same
object Rotaris and the CLI subcommand call.

The assertion that matters most is the one users get backwards: restoring an
earlier checkpoint **deletes** a file a later iteration created. A restore
returns the tree to that state; it does not merge that state onto this one.
"""

from __future__ import annotations

import hashlib
import subprocess
from typing import TYPE_CHECKING

import pytest

from rotaris_core.config import loader as config_loader
from rotaris_core.events.bus import reset_event_registry
from rotaris_core.hooks.registry import reset_hook_registry
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.run_host import RunRequest, execute_run
from rotaris_core.run_result import RunStatus
from rotaris_core.session import SessionManager
from rotaris_core.session.checkpoint_restore import CheckpointRestorer, restore_action
from tests.integration.scripted_llm import ScriptedLLM, say, tool_call

if TYPE_CHECKING:
    from collections.abc import Iterator
    from pathlib import Path

    from rotaris_core.config.schema import RotarisConfig
    from rotaris_core.session.state import SessionState
    from tests.integration.scripted_llm import ScriptedTurn

pytestmark = [pytest.mark.integration, pytest.mark.e2e]

#: What the workspace adds on top of the minimal bootstrap config. Checkpoints
#: on (this session is not worktree-isolated, so the default would be off), an
#: unattended permission mode so the agent's writes are not sent to an approval
#: host nobody is manning, and an orchestrator that may touch the workspace
#: itself instead of delegating — the shortest configuration in which one agent
#: really edits one file.
_WORKSPACE_CONFIG = """
checkpoints:
  enabled: true
runtime:
  permission_mode: autonomous
  allow_unsandboxed_autonomous: true
personas:
  orchestrator:
    coordinator_only: false
"""

_TRACKED = "alpha.txt"
_CREATED = "gamma.txt"


@pytest.fixture(autouse=True)
def _clean_registries() -> Iterator[None]:
    """An event sink or hook runner left behind bleeds into the next test."""
    reset_event_registry()
    reset_hook_registry()
    yield
    reset_event_registry()
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


def _git_state(root: Path) -> dict[str, str]:
    """Everything about the user's Git state a checkpoint must not disturb.

    The index is fingerprinted as bytes rather than asked for its diff: a
    checkpoint stages the whole working tree, and the promise is that it does so
    in a throwaway index file, which only a byte comparison can actually check.
    """
    index = root / ".git" / "index"
    reflog = root / ".git" / "logs" / "HEAD"
    return {
        "head": _git(root, "rev-parse", "HEAD").strip(),
        "branch": _git(root, "symbolic-ref", "HEAD").strip(),
        "index": hashlib.sha256(index.read_bytes()).hexdigest(),
        "reflog": reflog.read_text(encoding="utf-8") if reflog.exists() else "",
        "stash": _git(root, "stash", "list"),
    }


def _repository(root: Path) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    _git(root, "init", "-b", "main")
    _git(root, "config", "user.name", "Test User")
    _git(root, "config", "user.email", "test@example.invalid")
    (root / ".gitignore").write_text(".rotaris/\n", encoding="utf-8")
    (root / _TRACKED).write_text("alpha v1\n", encoding="utf-8")
    _git(root, "add", ".")
    _git(root, "commit", "-m", "initial")
    return root


@pytest.fixture
def workspace(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> RotarisConfig:
    """A real Git repository configured to checkpoint, with no global config."""
    from rotaris_core.config.bootstrap import write_minimal_agents_yaml

    root = _repository(tmp_path / "workspace")
    agents_yaml = root / ".rotaris" / "agents.yaml"
    write_minimal_agents_yaml(agents_yaml)
    agents_yaml.write_text(
        agents_yaml.read_text(encoding="utf-8") + _WORKSPACE_CONFIG,
        encoding="utf-8",
    )

    global_dir = tmp_path / "global"
    global_dir.mkdir()
    monkeypatch.setattr(config_loader, "GLOBAL_CONFIG_DIR", global_dir)

    config = config_loader.load_config(root)
    # Configured MCP servers would start subprocesses; nothing here is about MCP.
    config.mcp_servers.clear()
    for persona in config.personas.values():
        persona.mcp_servers.clear()
    return config


async def _run(
    config: RotarisConfig,
    manager: SessionManager,
    monkeypatch: pytest.MonkeyPatch,
    *,
    task: str,
    script: list[ScriptedTurn],
    session_id: str | None = None,
) -> str:
    """Drive one real run whose model answers *script*; return the session id."""
    scripted = ScriptedLLM(script)
    monkeypatch.setattr(
        config_loader,
        "load_llm_for_model",
        lambda *args, **kwargs: scripted.llm,
    )
    result = await execute_run(
        RunRequest(task=task, config=config, max_iterations=1, session_id=session_id),
        manager,
    )
    assert result.status is RunStatus.COMPLETED, result.error
    # The script is exact, not padded: a run that asked for one more completion
    # than it used to would raise rather than quietly change what is tested.
    assert scripted.exhausted, f"{scripted.turns_consumed} of {len(script)} turns used"
    return result.session_id


def _edit_alpha_script() -> list[ScriptedTurn]:
    """Read the tracked file, then overwrite it — a real two-tool agent turn."""
    return [
        tool_call("read_file", path=_TRACKED),
        tool_call("write_file", command="overwrite", path=_TRACKED, content="alpha v2\n"),
        say("Bumped alpha to v2."),
    ]


def _create_gamma_script() -> list[ScriptedTurn]:
    return [
        tool_call("write_file", command="create", path=_CREATED, content="gamma v1\n"),
        say("Added gamma."),
    ]


def _checkpoint_refs(root: Path, session_id: str) -> list[str]:
    raw = _git(
        root,
        "for-each-ref",
        "--format=%(refname)",
        f"refs/rotaris/checkpoints/{session_id}",
    )
    return sorted(line for line in raw.split() if line)


def _reload(root: Path, session_id: str) -> SessionState:
    """The session as a fresh, ordinary reader sees it — no service, no Git."""
    return SessionManager(root).load_session(session_id)


@verifies(SWR.SWR_2436, SWR.SWR_2437)
async def test_a_user_rolls_a_session_back_to_the_state_an_earlier_run_left(
    workspace: RotarisConfig,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: someone runs an agent on their repository, runs it again on the
    same session, decides the second run's work was wrong, and rolls the tree back to
    the checkpoint the first run left.
    Expected outcome: both runs recorded a checkpoint, the session lists them after a
    plain reload, the rollback puts every file back exactly as the preview promised —
    including deleting the file the second run created — a safety checkpoint holds the
    pre-rollback state, and the user's branch, HEAD, index, reflog and stash are
    untouched throughout."""
    config = workspace
    root = config.workspace_root
    manager = SessionManager(root)
    before = _git_state(root)

    session_id = await _run(
        config,
        manager,
        monkeypatch,
        task="bump alpha to v2",
        script=_edit_alpha_script(),
    )
    await _run(
        config,
        manager,
        monkeypatch,
        task="add a gamma file",
        script=_create_gamma_script(),
        session_id=session_id,
    )

    # -- what the two runs actually did to the tree ------------------------
    assert (root / _TRACKED).read_text(encoding="utf-8") == "alpha v2\n"
    assert (root / _CREATED).read_text(encoding="utf-8") == "gamma v1\n"

    # -- each run left an undo point under refs/rotaris/ -------------------
    prefix = f"refs/rotaris/checkpoints/{session_id}"
    assert _checkpoint_refs(root, session_id) == [f"{prefix}/1", f"{prefix}/2"]

    recorded = _reload(root, session_id).checkpoints
    assert [entry.sequence for entry in recorded] == [1, 2]
    assert [entry.kind for entry in recorded] == ["iteration", "iteration"]
    assert _TRACKED in recorded[0].files
    assert _CREATED in recorded[1].files

    assert _git_state(root) == before, "checkpointing moved the user's own Git state"

    # -- the user opens the rollback UI ------------------------------------
    restorer = CheckpointRestorer(session_manager=SessionManager(root), session_id=session_id)
    assert restorer.available
    assert [entry.sequence for entry in restorer.list_checkpoints()] == [1, 2]

    preview = restorer.preview(1)
    assert preview is not None
    assert preview.blocked_reason == "", preview.blocked_reason
    assert preview.dirty_paths == ()
    # Only gamma.txt differs: alpha.txt already reads alpha v2 in checkpoint 1.
    promised = {entry.path: restore_action(entry.status) for entry in preview.entries}
    assert promised == {_CREATED: "delete"}

    # -- and takes the rollback -------------------------------------------
    result = restorer.restore(1)

    assert result.restored, result.blocked_reason
    assert result.blocked_reason == ""
    assert set(result.changed_paths) == {_CREATED}
    # The rollback is itself undoable: the pre-restore tree is a checkpoint too.
    assert result.safety_checkpoint is not None
    assert result.safety_checkpoint.kind == "pre_restore"
    assert result.safety_checkpoint.sequence == 3

    # -- the disk matches what the preview promised, verb by verb ----------
    for path, action in promised.items():
        assert action == "delete"
        assert not (root / path).exists(), f"{path} was promised a {action} and is still there"
    assert (root / _TRACKED).read_text(encoding="utf-8") == "alpha v2\n"

    # A restore only changes file contents; branch history is never rewritten.
    assert _git_state(root) == before

    # The session's own record grew by the safety checkpoint and nothing else.
    assert [entry.sequence for entry in _reload(root, session_id).checkpoints] == [1, 2, 3]


@verifies(SWR.SWR_2437)
async def test_a_rollback_refuses_to_overwrite_work_the_user_did_by_hand(
    workspace: RotarisConfig,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: after a run, the user edits a file themselves, then asks for a
    rollback that would land on top of that edit.
    Expected outcome: the rollback refuses instead of silently discarding the edit, says
    which file is in the way, leaves the file and the checkpoint list exactly as they
    were, and records no safety checkpoint for a restore that never happened."""
    config = workspace
    root = config.workspace_root
    manager = SessionManager(root)

    session_id = await _run(
        config,
        manager,
        monkeypatch,
        task="bump alpha to v2",
        script=_edit_alpha_script(),
    )
    assert _checkpoint_refs(root, session_id) == [f"refs/rotaris/checkpoints/{session_id}/1"]

    (root / _TRACKED).write_text("alpha, hand written by the user\n", encoding="utf-8")
    before = _git_state(root)

    restorer = CheckpointRestorer(session_manager=SessionManager(root), session_id=session_id)
    preview = restorer.preview(1)
    assert preview is not None
    assert preview.dirty_paths == (_TRACKED,)
    assert _TRACKED in preview.blocked_reason
    assert "force" in preview.blocked_reason

    result = restorer.restore(1)

    assert not result.restored
    assert _TRACKED in result.blocked_reason
    assert result.changed_paths == ()
    assert result.safety_checkpoint is None
    # The user's edit survived, and nothing was recorded as if it had not.
    assert (root / _TRACKED).read_text(encoding="utf-8") == "alpha, hand written by the user\n"
    assert [entry.sequence for entry in _reload(root, session_id).checkpoints] == [1]
    assert _git_state(root) == before
