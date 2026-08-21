from __future__ import annotations

from pathlib import Path  # noqa: TC003 - used in test fixtures, not type-only

import pytest
from pydantic import ValidationError

from rotaris_core.haet.engine import HAETEngine
from rotaris_core.haet.hasher import line_hash, snapshot_id
from rotaris_core.haet.patch import (
    HAETHunkResult,
    HAETPatchRequest,
    HAETPatchResult,
    HAETPatchValidationError,
    HAETRecoveryCandidate,
    HAETRecoveryPayload,
)
from rotaris_core.haet.tool import (
    HAETEditAction,
    HAETEditExecutor,
    HAETReadAction,
    _format_haet_validation_error,
    _render_failure,
    _render_success,
)
from rotaris_core.reqtocode import SWR, verifies


@verifies(SWR.SWR_639)
def test_haet_edit_action_coerces_single_hunk_object_into_list() -> None:
    action = HAETEditAction.model_validate(
        {
            "file_path": "sample.py",
            "snapshot_id": "snap",
            "hunks": {
                "operation": "replace",
                "anchor": "aB12",
                "anchor_line_number": 1,
                "content": "value = 1",
            },
        },
    )

    assert len(action.hunks) == 1
    assert action.hunks[0].anchor == "aB12"
    assert action.hunks[0].anchor_line_number == 1


@verifies(SWR.SWR_1815)
def test_haet_edit_action_requires_snapshot_id() -> None:
    with pytest.raises(ValidationError):
        HAETEditAction.model_validate(
            {
                "file_path": "sample.py",
                "hunks": [
                    {
                        "operation": "replace",
                        "anchor": "aB12",
                        "anchor_line_number": 1,
                        "content": "x",
                    },
                ],
            },
        )


@verifies(SWR.SWR_639)
@pytest.mark.parametrize("bad_hunks", ["oops", 1, None])
def test_haet_edit_action_requires_hunks_list_shape(bad_hunks: object) -> None:
    with pytest.raises(ValidationError, match="hunks must be a JSON array"):
        HAETEditAction.model_validate(
            {"file_path": "sample.py", "snapshot_id": "snap", "hunks": bad_hunks},
        )


@verifies(SWR.SWR_639)
def test_haet_edit_action_requires_operation_in_each_hunk() -> None:
    with pytest.raises(ValidationError, match="missing required field 'operation'"):
        HAETEditAction.model_validate(
            {
                "file_path": "sample.py",
                "snapshot_id": "snap",
                "hunks": [{"anchor": "aB12", "anchor_line_number": 1, "content": "x"}],
            },
        )


@verifies(SWR.SWR_640)
def test_format_haet_validation_error_returns_compact_guidance() -> None:
    with pytest.raises(ValidationError) as exc_info:
        HAETPatchRequest(file_path="sample.py", snapshot_id="snap", hunks=[])

    rendered = _format_haet_validation_error(exc_info.value)

    assert rendered.startswith("Invalid haet_edit payload.")
    assert "snapshot_id" in rendered
    assert "Example:" in rendered


@verifies(SWR.SWR_1814)
def test_haet_read_action_basic_shape(tmp_path: Path) -> None:
    file_path = tmp_path / "sample.py"
    file_path.write_text("alpha\n", encoding="utf-8")
    action = HAETReadAction(file_path=str(file_path.relative_to(tmp_path)))
    assert action.file_path == "sample.py"


# ── observation rendering ──────────────────────────────────────────


@verifies(SWR.SWR_1815)
def test_render_success_includes_new_snapshot_id() -> None:
    result = HAETPatchResult(
        success=True,
        file_path="sample.py",
        hunks_applied=1,
        hunk_results=[
            HAETHunkResult(
                hunk_index=0,
                operation="replace",
                line=3,
                lines_removed=1,
                lines_added=1,
            ),
        ],
        new_snapshot_id="abc123",
    )
    rendered = _render_success(result)
    assert "OK: applied 1 hunk(s)" in rendered
    assert "new snapshot_id=abc123" in rendered
    assert "RELOCATED" not in rendered


@verifies(SWR.SWR_1816)
def test_render_success_marks_relocated_runs() -> None:
    result = HAETPatchResult(
        success=True,
        file_path="sample.py",
        hunks_applied=1,
        new_snapshot_id="abc",
        relocated=True,
    )
    assert "RELOCATED" in _render_success(result)


@verifies(SWR.SWR_1816)
def test_render_failure_includes_recovery_candidates() -> None:
    result = HAETPatchResult(
        success=False,
        file_path="sample.py",
        hunks_applied=0,
        new_snapshot_id="cur",
        errors=[
            HAETPatchValidationError(
                hunk_index=-1,
                anchor="",
                error="snapshot_mismatch",
                details="file drifted",
                recovery=HAETRecoveryPayload(
                    fresh_snapshot_id="fresh",
                    candidates=[
                        HAETRecoveryCandidate(
                            line_number=7,
                            anchor="aB12",
                            content_preview="def f():",
                        ),
                    ],
                ),
            ),
        ],
    )
    rendered = _render_failure(result)
    assert "FAIL" in rendered
    assert "snapshot_mismatch" in rendered
    assert "fresh snapshot_id=fresh" in rendered
    assert "L7" in rendered
    assert "aB12" in rendered


# ── end-to-end through the executor ───────────────────────────────


@verifies(SWR.SWR_1815)
def test_executor_success_observation_carries_new_snapshot(tmp_path: Path) -> None:
    file_path = tmp_path / "sample.py"
    file_path.write_text("alpha\nbeta\n", encoding="utf-8")
    engine = HAETEngine(tmp_path)
    executor = HAETEditExecutor(engine)
    snap = snapshot_id(file_path.read_bytes())

    action = HAETEditAction(
        file_path="sample.py",
        snapshot_id=snap,
        hunks=[
            {  # type: ignore[list-item]
                "operation": "replace",
                "anchor": line_hash("beta"),
                "anchor_line_number": 2,
                "content": "BETA",
            },
        ],
    )
    obs = executor(action)
    text = "".join(c.text for c in obs.content if hasattr(c, "text"))
    assert "OK: applied 1 hunk" in text
    assert "new snapshot_id=" in text
    assert obs.ui_diff is not None
    assert obs.ui_diff["added_lines"] == 1
    assert obs.ui_diff["removed_lines"] == 1
    assert file_path.read_text(encoding="utf-8") == "alpha\nBETA\n"


@verifies(SWR.SWR_1816, SWR.SWR_666)
def test_executor_stale_snapshot_returns_recovery_payload(tmp_path: Path) -> None:
    file_path = tmp_path / "sample.py"
    file_path.write_text("alpha\nbeta\nbeta\n", encoding="utf-8")
    engine = HAETEngine(tmp_path)
    executor = HAETEditExecutor(engine)

    action = HAETEditAction(
        file_path="sample.py",
        snapshot_id="stale",  # never matches the real fingerprint
        hunks=[
            {  # type: ignore[list-item]
                "operation": "delete",
                "anchor": line_hash("beta"),
                "anchor_line_number": 2,
            },
        ],
    )
    obs = executor(action)
    text = "".join(c.text for c in obs.content if hasattr(c, "text"))
    assert "snapshot_mismatch" in text
    assert "candidates:" in text
    assert obs.ui_diff is None
