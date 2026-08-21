"""Tests for workspace-boundary path authorization."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from rotaris_core.core.path_auth import PathAuth
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from pathlib import Path


@verifies(SWR.SWR_2111)
def test_validate_relative_path(tmp_path: Path) -> None:
    workspace = tmp_path / "ws"
    auth = PathAuth(workspace)

    assert auth.validate("src/main.py") == (workspace / "src/main.py").resolve()


@verifies(SWR.SWR_2111)
def test_validate_absolute_within_workspace(tmp_path: Path) -> None:
    workspace = tmp_path / "ws"
    auth = PathAuth(workspace)
    candidate = (workspace / "src/main.py").resolve()

    assert auth.validate(candidate) == candidate


@verifies(SWR.SWR_2111)
def test_validate_outside_rejected(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    outside = tmp_path / "outside.txt"
    outside.write_text("secret", encoding="utf-8")
    auth = PathAuth(workspace)

    with pytest.raises(ValueError, match="outside workspace root"):
        auth.validate(outside)


@verifies(SWR.SWR_2111)
def test_validate_outside_allowed(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    outside = tmp_path / "outside.txt"
    outside.write_text("secret", encoding="utf-8")
    auth = PathAuth(workspace, allow_outside=True)

    assert auth.validate(outside) == outside.resolve()


@verifies(SWR.SWR_2111)
def test_validate_traversal_rejected(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    auth = PathAuth(workspace)

    with pytest.raises(ValueError, match="outside workspace root"):
        auth.validate("../outside")


@verifies(SWR.SWR_2111)
def test_is_allowed_inside(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    path = workspace / "src" / "main.py"
    path.parent.mkdir(parents=True)
    path.write_text("print('ok')", encoding="utf-8")
    auth = PathAuth(workspace)

    assert auth.is_allowed(path) is True


@verifies(SWR.SWR_2111)
def test_is_allowed_outside(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    outside = tmp_path / "outside.txt"
    outside.write_text("secret", encoding="utf-8")
    auth = PathAuth(workspace)

    assert auth.is_allowed(outside) is False


@verifies(SWR.SWR_2111)
def test_is_allowed_outside_when_allow_outside_true(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    outside = tmp_path / "outside.txt"
    outside.write_text("secret", encoding="utf-8")
    auth = PathAuth(workspace, allow_outside=True)

    assert auth.is_allowed(outside) is True
