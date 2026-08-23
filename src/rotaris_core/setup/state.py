"""Atomic setup records and the cross-process setup lock."""

from __future__ import annotations

import json
import os
import time
from contextlib import AbstractContextManager, suppress
from datetime import UTC, datetime
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any

from rotaris_core.reqtocode import SWR, traces

from .models import SetupRecord


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


@traces(SWR.SWR_3715)
def load_setup_record(path: Path) -> SetupRecord | None:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return None
    return SetupRecord.from_dict(payload) if isinstance(payload, dict) else None


@traces(SWR.SWR_3715)
def save_setup_record(path: Path, record: SetupRecord) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    record.updated_at = utc_now()
    temp_path: Path | None = None
    try:
        with NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=path.parent,
            prefix="state-",
            suffix=".tmp",
            delete=False,
        ) as handle:
            temp_path = Path(handle.name)
            json.dump(record.to_dict(), handle, sort_keys=True, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_path, path)
    finally:
        if temp_path is not None:
            with suppress(FileNotFoundError):
                temp_path.unlink()


def _pid_running(pid: int) -> bool:
    if pid <= 0:
        return False
    # ``os.kill(pid, 0)`` is the conventional existence probe on POSIX.  On
    # Windows Python routes ordinary signal values through TerminateProcess,
    # which makes signal 0 destructive.  psutil provides the same read-only
    # existence check on every supported Rotaris platform.
    import psutil  # type: ignore[import-untyped]

    return bool(psutil.pid_exists(pid))


@traces(SWR.SWR_3715)
class SetupLock(AbstractContextManager["SetupLock"]):
    """Exclusive lock with bounded stale-owner recovery."""

    def __init__(self, path: Path, *, stale_after: float = 900.0) -> None:
        self.path = path
        self.stale_after = stale_after
        self.acquired = False

    def acquire(self) -> bool:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        for _attempt in range(2):
            try:
                fd = os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            except FileExistsError:
                if not self._recover_stale():
                    return False
                continue
            payload = json.dumps({"pid": os.getpid(), "created": time.time()}).encode("utf-8")
            try:
                os.write(fd, payload)
                os.fsync(fd)
            finally:
                os.close(fd)
            self.acquired = True
            return True
        return False

    def _recover_stale(self) -> bool:
        try:
            payload: Any = json.loads(self.path.read_text(encoding="utf-8"))
            created = float(payload.get("created", 0))
            pid = int(payload.get("pid", 0))
        except (OSError, ValueError, TypeError, json.JSONDecodeError):
            created, pid = 0.0, 0
        if time.time() - created <= self.stale_after and _pid_running(pid):
            return False
        with suppress(FileNotFoundError):
            self.path.unlink()
        return True

    def release(self) -> None:
        if self.acquired:
            with suppress(FileNotFoundError):
                self.path.unlink()
            self.acquired = False

    def __enter__(self) -> SetupLock:
        self.acquire()
        return self

    def __exit__(self, *_args: object) -> None:
        self.release()
