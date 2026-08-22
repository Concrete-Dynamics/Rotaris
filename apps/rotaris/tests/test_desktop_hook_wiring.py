"""The desktop run carries lifecycle hooks and checkpoints (SWR-2436, SWR-2701).

Rotaris' run workers used to drive ``cli.background._run_task`` directly, and
that shortcut skipped the two things the shared lifecycle composes on top of the
loop — the hook dispatcher and the checkpoint writer — so the *primary*
interface was the one host that had neither. Every desktop run path now goes
through ``rotaris_core.run_host.execute_run``, which composes both.

The tests still install their fake runtime by patching
``rotaris_core.cli.background._run_task``: ``execute_run`` imports it inside its
own body, so the patch point survived the migration and reaches the run through
the lifecycle rather than around it.

These tests prove the composition through its user-observable effects: a hook
process that actually ran (a file it wrote), a checkpoint ref that actually
exists, and a hook the trust gate held back. Only the agent runtime itself is
faked; the hook runner, the trust store, the checkpoint engine and Git are real.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
import yaml
from rotaris_core.config import loader as config_loader
from rotaris_core.hooks.models import resolve_hooks
from rotaris_core.hooks.registry import reset_hook_registry, resolve_hook_runner
from rotaris_core.hooks.trust import store_trust, workspace_hook_digest
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.manager import SessionManager

from rotaris.models.store import WorkspaceStore
from rotaris.services.config_service import ConfigService
from rotaris.services.run_bridge import RunBridge

pytestmark = pytest.mark.integration


def _git(cwd: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", *args], cwd=cwd, text=True, encoding="utf-8", capture_output=True, check=False
    )
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()


def _workspace(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> tuple[Path, Path]:
    """A Git workspace declaring one ``iteration_end`` hook and checkpoints on.

    Returns the workspace root and the marker path the hook writes, which is
    kept outside the repository so the proof of execution cannot be confused
    with an agent edit.
    """
    empty_global = tmp_path / "empty-global"
    empty_global.mkdir()
    monkeypatch.setattr(config_loader, "GLOBAL_CONFIG_DIR", empty_global)

    root = tmp_path / "workspace"
    root.mkdir()
    _git(root, "init", "-b", "main")
    _git(root, "config", "user.name", "Test User")
    _git(root, "config", "user.email", "test@example.invalid")
    (root / ".gitignore").write_text(".rotaris/\n", encoding="utf-8")
    (root / "alpha.txt").write_text("one\n", encoding="utf-8")
    _git(root, "add", ".")
    _git(root, "commit", "-m", "initial")

    marker = tmp_path / "hook-ran.txt"
    script = tmp_path / "hook_script.py"
    script.write_text(
        f"from pathlib import Path\nPath({str(marker)!r}).write_text('fired')\n",
        encoding="utf-8",
    )
    (root / ".rotaris").mkdir(parents=True, exist_ok=True)
    (root / ".rotaris" / "agents.yaml").write_text(
        yaml.safe_dump(
            {
                "checkpoints": {"enabled": True},
                "hooks": [
                    {
                        "name": "repo-formatter",
                        "event": "iteration_end",
                        "command": f'"{sys.executable}" "{script}"',
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    return root, marker


def _bridge(root: Path, store: WorkspaceStore) -> RunBridge:
    service = ConfigService(root, store)
    # Loaded directly rather than through ``service.load()``: that probes every
    # configured provider and costs 5-18 s this flow never reads.
    service.config = config_loader.load_config(root)
    service.session_manager = SessionManager(root)
    return RunBridge(root, store, service)  # type: ignore[arg-type]


def _iterating_run_task(root: Path, seen: dict[str, Any]) -> Any:
    """Stand in for the agent runtime: edit a file, then end one iteration."""

    async def fake_run_task(
        _prompt: str,
        config: Any,
        _manager: Any,
        state: Any,
        _max_iterations: Any,
        **kwargs: Any,
    ) -> Any:
        observers = tuple(kwargs.get("extra_observers", ()))
        seen["observers"] = [type(observer).__name__ for observer in observers]
        seen["session_id"] = state.session_id
        seen["runner_registered"] = resolve_hook_runner(state.session_id) is not None
        (Path(config.workspace_root) / "alpha.txt").write_text("edited\n", encoding="utf-8")
        task = SimpleNamespace(id="task-1")
        record = SimpleNamespace(canonical_name="coder-1", task_id="t1", persona="coder")
        report = SimpleNamespace(status="completed", summary="done")
        for observer in observers:
            observer.on_iteration_start(1, task)
        for observer in observers:
            observer.on_iteration_end(record, report, None, None, "continue")
        return SimpleNamespace(iterations=[])

    del root
    return fake_run_task


def _patch_runtime(monkeypatch: pytest.MonkeyPatch, run_task: Any) -> None:
    monkeypatch.setattr("rotaris_core.cli.background._run_task", run_task)
    monkeypatch.setattr(
        "rotaris_core.ralph.state.summarize_run_progress",
        lambda _progress: ("completed", "Run completed.", "info"),
    )


@verifies(SWR.SWR_2436, SWR.SWR_2701, SWR.SWR_2703)
def test_a_desktop_run_fires_trusted_hooks_and_records_a_checkpoint(
    tmp_path, qtbot, monkeypatch
) -> None:
    """Productive use: a user runs a task in Rotaris on a workspace they trust.
    Expected outcome: their iteration hook actually runs and the iteration is undoable."""
    reset_hook_registry()
    root, marker = _workspace(tmp_path, monkeypatch)
    config = config_loader.load_config(root)
    store_trust(root, digest=workspace_hook_digest(resolve_hooks(config)), trusted=True)
    seen: dict[str, Any] = {}
    _patch_runtime(monkeypatch, _iterating_run_task(root, seen))
    store = WorkspaceStore()
    bridge = _bridge(root, store)
    try:
        with qtbot.waitSignal(bridge.run_finished, timeout=60_000):
            assert bridge.start("do the task") is True
    finally:
        bridge.shutdown()

    # Order matters: the hook observer runs before the checkpoint observer, so a
    # hook that rewrites the tree lands inside the checkpoint the user restores.
    assert seen["observers"] == ["HookLifecycleObserver", "CheckpointObserver"]
    assert seen["runner_registered"] is True
    assert marker.read_text(encoding="utf-8") == "fired"

    snapshot = SessionManager(root).read_session_snapshot(seen["session_id"])
    assert [entry.sequence for entry in snapshot.checkpoints] == [1]
    assert snapshot.checkpoints[0].iteration == 1
    assert "alpha.txt" in snapshot.checkpoints[0].files
    assert _git(root, "rev-parse", "--verify", snapshot.checkpoints[0].ref)
    # A runner left registered would fire this session's hooks on the next run.
    assert resolve_hook_runner(seen["session_id"]) is None


@verifies(SWR.SWR_2701, SWR.SWR_2704)
def test_an_unreviewed_workspace_hook_never_runs_and_the_user_is_told(
    tmp_path, qtbot, monkeypatch
) -> None:
    """Productive use: a user runs a task in a repository they just cloned.
    Expected outcome: the repository's hook does not execute and Rotaris says so."""
    reset_hook_registry()
    root, marker = _workspace(tmp_path, monkeypatch)
    seen: dict[str, Any] = {}
    _patch_runtime(monkeypatch, _iterating_run_task(root, seen))
    store = WorkspaceStore()
    bridge = _bridge(root, store)
    try:
        with qtbot.waitSignal(bridge.run_finished, timeout=60_000):
            assert bridge.start("do the task") is True
    finally:
        bridge.shutdown()

    assert not marker.exists()
    notice = store.ui.notice
    assert notice is not None
    assert notice.severity.value == "warning"
    assert "not been reviewed" in notice.message
    # The advisory names a count and a file, never the repository's command.
    assert sys.executable not in f"{notice.title}{notice.message}{notice.details}"


@verifies(SWR.SWR_2701)
def test_the_hook_runner_is_discarded_when_a_run_fails(tmp_path, qtbot, monkeypatch) -> None:
    """Productive use: a user's run crashes and they immediately start another.
    Expected outcome: the failed run's hooks are unregistered, so they cannot fire again."""
    reset_hook_registry()
    root, _marker = _workspace(tmp_path, monkeypatch)
    sessions: list[str] = []

    async def exploding_run_task(
        _prompt: str,
        _config: Any,
        _manager: Any,
        state: Any,
        _max_iterations: Any,
        **_kwargs: Any,
    ) -> Any:
        sessions.append(state.session_id)
        raise RuntimeError("the model provider refused")

    _patch_runtime(monkeypatch, exploding_run_task)
    store = WorkspaceStore()
    bridge = _bridge(root, store)
    try:
        with qtbot.waitSignal(bridge.run_failed, timeout=60_000):
            assert bridge.start("do the task") is True
    finally:
        bridge.shutdown()

    assert sessions
    assert resolve_hook_runner(sessions[0]) is None
