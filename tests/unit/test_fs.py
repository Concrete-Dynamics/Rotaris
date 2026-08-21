"""Unit tests for ``rotaris_core.fs.atomic_write``."""

from __future__ import annotations

import logging
import os
from typing import TYPE_CHECKING

import pytest

from rotaris_core.fs import atomic_write
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from pathlib import Path


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _raise_access_denied_on_windows(
    src: str,
    dst: str,
) -> None:
    raise _windows_os_error("Access is denied", dst, 5)


def _raise_other_os_error(src: str, dst: str) -> None:
    raise _windows_os_error("Permission denied", dst, 13)


def _windows_os_error(message: str, filename: str, winerror: int) -> OSError:
    exc = OSError(0, message, filename)
    exc.winerror = winerror
    return exc


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_659)
def test_atomic_write_retries_on_access_denied(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Productive use: users can save while Windows briefly locks the destination.
    Expected outcome: transient access denial is retried and the file is written.
    """

    called: list[int] = []
    _real_replace = os.replace  # capture before monkeypatch

    def _flaky_replace(src: str, dst: str) -> None:
        called.append(1)
        if len(called) < 4:  # fail first 3 times
            raise _windows_os_error("Access is denied", dst, 5)
        # succeed on 4th — use the real os.replace, not the monkeypatched one
        _real_replace(src, dst)

    monkeypatch.setattr(os, "replace", _flaky_replace)
    monkeypatch.setattr("rotaris_core.fs.time.sleep", lambda _s: None)

    path = tmp_path / "f.txt"
    atomic_write(path, "hello")

    assert path.read_text(encoding="utf-8") == "hello"
    assert len(called) == 4

    warnings = [r for r in caplog.record_tuples if "atomic_write retry" in r[2]]
    assert len(warnings) == 3
    for i, (_logger, level, msg) in enumerate(warnings):
        assert level == logging.WARNING
        assert f"retry {i + 1}/5" in msg


@verifies(SWR.SWR_659)
def test_atomic_write_exhausts_retries_and_raises(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Productive use: users receive a clear failure when a locked file stays unavailable.
    Expected outcome: access denial propagates after the bounded retry budget.
    """

    monkeypatch.setattr(os, "replace", _raise_access_denied_on_windows)
    monkeypatch.setattr("rotaris_core.fs.time.sleep", lambda _s: None)

    path = tmp_path / "f.txt"
    with pytest.raises(OSError) as exc_info:
        atomic_write(path, "hello")

    assert exc_info.value.winerror == 5

    warnings = [r for r in caplog.record_tuples if "atomic_write retry" in r[2]]
    assert len(warnings) == 4  # 4 retries logged; 5th attempt raises without logging


@verifies(SWR.SWR_659)
def test_atomic_write_no_retry_on_other_errors(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Productive use: users receive unrelated filesystem errors without delay.
    Expected outcome: non-access-denied errors propagate without retries.
    """

    monkeypatch.setattr(os, "replace", _raise_other_os_error)
    monkeypatch.setattr("rotaris_core.fs.time.sleep", lambda _s: None)

    path = tmp_path / "f.txt"
    with pytest.raises(OSError) as exc_info:
        atomic_write(path, "hello")

    assert exc_info.value.winerror == 13

    warnings = [r for r in caplog.record_tuples if "atomic_write retry" in r[2]]
    assert len(warnings) == 0


@verifies(SWR.SWR_659)
def test_atomic_write_no_retry_on_non_windows(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A plain ``OSError`` without a ``winerror`` attribute is not retried."""

    def _plain_os_error(src: str, dst: str) -> None:
        raise OSError("some other error")

    monkeypatch.setattr(os, "replace", _plain_os_error)
    monkeypatch.setattr("rotaris_core.fs.time.sleep", lambda _s: None)

    path = tmp_path / "f.txt"
    with pytest.raises(OSError, match="some other error"):
        atomic_write(path, "hello")
