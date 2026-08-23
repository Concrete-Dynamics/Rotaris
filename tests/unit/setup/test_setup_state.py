"""Productive use: setup progress survives crashes and concurrent launches safely.
Expected outcome: records replace atomically and stale locks recover without overlapping runs."""

from __future__ import annotations

import json
import os
import time
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.setup import SetupRecord, activate_managed_tool_environment
from rotaris_core.setup import state as setup_state
from rotaris_core.setup.state import SetupLock, load_setup_record, save_setup_record

if TYPE_CHECKING:
    from pathlib import Path

    import pytest


@verifies(SWR.SWR_3715)
def test_atomic_record_round_trip_preserves_resume_metadata(tmp_path: Path) -> None:
    """Productive use: a restarted setup resumes from its durable completion record.
    Expected outcome: versions, paths, outcome, and accepted degradation survive a replacement write."""
    path = tmp_path / "setup" / "state.json"
    record = SetupRecord(
        manifest_fingerprint="abc",
        outcome="degraded",
        actual_versions={"git": "2.55.0"},
        managed_paths={"git": [str(tmp_path / "tools" / "git" / "bin")]},
        accepted_degradation=True,
    )

    save_setup_record(path, record)

    assert load_setup_record(path) == record
    assert not list(path.parent.glob("*.tmp"))


@verifies(SWR.SWR_3715)
def test_live_lock_excludes_second_process_and_stale_lock_recovers(tmp_path: Path) -> None:
    """Productive use: simultaneous Rotaris launches share one setup writer.
    Expected outcome: a live owner excludes another run while an expired dead owner is recovered."""
    path = tmp_path / "setup.lock"
    first = SetupLock(path)
    second = SetupLock(path)
    assert first.acquire() is True
    assert second.acquire() is False
    first.release()

    path.write_text(
        json.dumps({"pid": 999_999_999, "created": time.time() - 3600}), encoding="utf-8"
    )
    stale = SetupLock(path, stale_after=1)
    assert stale.acquire() is True
    stale.release()


@verifies(SWR.SWR_3715)
def test_live_pid_probe_never_signals_the_process(monkeypatch: pytest.MonkeyPatch) -> None:
    """Productive use: concurrent setup detects a live owner without disrupting Rotaris.
    Expected outcome: the cross-platform process query observes the PID without sending a signal."""
    monkeypatch.setattr(
        setup_state.os,
        "kill",
        lambda *_args: (_ for _ in ()).throw(AssertionError("process signal attempted")),
    )
    monkeypatch.setattr("psutil.pid_exists", lambda pid: pid == 4321)

    assert setup_state._pid_running(4321) is True
    assert setup_state._pid_running(1234) is False


@verifies(SWR.SWR_3715)
def test_environment_activation_prepends_existing_managed_paths_and_owns_caches(
    tmp_path: Path,
) -> None:
    """Productive use: every Rotaris child process can reach provisioned tools.
    Expected outcome: managed bins lead process PATH and uv/npm caches stay under global data."""
    managed = tmp_path / "tools" / "git" / "2.55.0" / "cmd"
    managed.mkdir(parents=True)
    environ = {"PATH": os.pathsep.join(["system-a", "system-b"])}
    record = SetupRecord(managed_paths={"git": [str(managed)]})

    activate_managed_tool_environment(record, data_dir=tmp_path, environ=environ)

    assert environ["PATH"].split(os.pathsep)[0] == str(managed)
    assert environ["UV_CACHE_DIR"] == str(tmp_path / "setup" / "cache" / "uv")
    assert environ["npm_config_cache"] == str(tmp_path / "setup" / "cache" / "npm")
