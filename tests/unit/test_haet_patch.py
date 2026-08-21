import pytest
from pydantic import ValidationError

from rotaris_core.haet.patch import (
    HAETHunk,
    HAETOperation,
    HAETPatchRequest,
    HAETPatchResult,
    HAETRecoveryCandidate,
    HAETRecoveryPayload,
)
from rotaris_core.reqtocode import SWR, verifies


def _hunk(**overrides: object) -> dict[str, object]:
    base: dict[str, object] = {
        "operation": HAETOperation.REPLACE,
        "anchor": "aB12",
        "anchor_line_number": 1,
        "content": "value",
    }
    base.update(overrides)
    return base


@verifies(SWR.SWR_1815)
@pytest.mark.parametrize(
    ("operation", "content"),
    [
        (HAETOperation.INSERT_BEFORE, "value"),
        (HAETOperation.INSERT_AFTER, "value"),
        (HAETOperation.REPLACE, "value"),
        (HAETOperation.DELETE, None),
    ],
)
def test_valid_hunks_for_each_operation(operation: HAETOperation, content: str | None) -> None:
    hunk = HAETHunk(operation=operation, anchor="aB12", anchor_line_number=1, content=content)
    assert hunk.operation == operation


@verifies(SWR.SWR_1814)
def test_anchor_must_be_four_characters() -> None:
    with pytest.raises(ValidationError):
        HAETHunk(operation=HAETOperation.DELETE, anchor="aB", anchor_line_number=1)


@verifies(SWR.SWR_1814)
def test_anchor_line_number_is_required() -> None:
    with pytest.raises(ValidationError):
        HAETHunk.model_validate({"operation": "delete", "anchor": "aB12"})


@verifies(SWR.SWR_1815)
def test_delete_with_content_raises_validation_error() -> None:
    with pytest.raises(ValidationError):
        HAETHunk(
            operation=HAETOperation.DELETE,
            anchor="aB12",
            anchor_line_number=1,
            content="bad",
        )


@verifies(SWR.SWR_1815)
def test_insert_without_content_raises_validation_error() -> None:
    with pytest.raises(ValidationError):
        HAETHunk(
            operation=HAETOperation.INSERT_BEFORE,
            anchor="aB12",
            anchor_line_number=1,
        )


@verifies(SWR.SWR_1815)
def test_end_anchor_only_valid_for_replace() -> None:
    with pytest.raises(ValidationError, match="end_anchor is only valid for REPLACE"):
        HAETHunk(
            operation=HAETOperation.INSERT_BEFORE,
            anchor="aB12",
            anchor_line_number=1,
            end_anchor="cDef",
            end_anchor_line_number=2,
            content="x",
        )


@verifies(SWR.SWR_1815)
def test_end_anchor_requires_end_anchor_line_number() -> None:
    with pytest.raises(ValidationError, match="end_anchor_line_number is required"):
        HAETHunk(
            operation=HAETOperation.REPLACE,
            anchor="aB12",
            anchor_line_number=1,
            end_anchor="cDef",
            content="x",
        )


@verifies(SWR.SWR_1815)
def test_end_anchor_line_number_without_end_anchor_rejected() -> None:
    with pytest.raises(ValidationError, match="must not be set without end_anchor"):
        HAETHunk(
            operation=HAETOperation.REPLACE,
            anchor="aB12",
            anchor_line_number=1,
            end_anchor_line_number=3,
            content="x",
        )


# ── snapshot_id on the request ─────────────────────────────────────


@verifies(SWR.SWR_1815)
def test_request_requires_snapshot_id() -> None:
    with pytest.raises(ValidationError):
        HAETPatchRequest.model_validate({"file_path": "sample.py", "hunks": [_hunk()]})


@verifies(SWR.SWR_1815)
def test_request_with_snapshot_id_accepted() -> None:
    req = HAETPatchRequest(
        # type: ignore[arg-type]
        file_path="sample.py",
        snapshot_id="snap123",
        hunks=[HAETHunk(**_hunk())],
    )
    assert req.snapshot_id == "snap123"


@verifies(SWR.SWR_1815)
def test_empty_hunks_list_raises_validation_error() -> None:
    with pytest.raises(ValidationError):
        HAETPatchRequest(file_path="sample.py", snapshot_id="snap", hunks=[])


# ── context hashes ─────────────────────────────────────────────────


@verifies(SWR.SWR_1816)
@pytest.mark.parametrize("good", ["BOF", "EOF", "0123456789abcdef", "ab", "0a1b2c3d"])
def test_context_hash_accepts_sentinels_and_hex(good: str) -> None:
    hunk = HAETHunk(
        operation=HAETOperation.REPLACE,
        anchor="aB12",
        anchor_line_number=1,
        content="x",
        context_before_hash=good,
    )
    assert hunk.context_before_hash == good


@verifies(SWR.SWR_1816)
@pytest.mark.parametrize("bad", ["GHIJ", "0123456789abcdef0", "Z", " "])
def test_context_hash_rejects_invalid_values(bad: str) -> None:
    with pytest.raises(ValidationError):
        HAETHunk(
            operation=HAETOperation.REPLACE,
            anchor="aB12",
            anchor_line_number=1,
            content="x",
            context_before_hash=bad,
        )


# ── result + recovery serialization ────────────────────────────────


@verifies(SWR.SWR_1816)
def test_patch_result_serialization_includes_new_fields() -> None:
    result = HAETPatchResult(
        success=True,
        file_path="sample.py",
        hunks_applied=1,
        new_snapshot_id="abc",
        relocated=True,
    )
    payload = result.model_dump()
    assert payload["new_snapshot_id"] == "abc"
    assert payload["relocated"] is True


@verifies(SWR.SWR_1816)
def test_recovery_payload_round_trips() -> None:
    payload = HAETRecoveryPayload(
        fresh_snapshot_id="snap",
        candidates=[
            HAETRecoveryCandidate(line_number=3, anchor="aB12", content_preview="def f():"),
        ],
    )
    dumped = payload.model_dump()
    assert dumped["candidates"][0]["line_number"] == 3
    assert dumped["candidates"][0]["anchor"] == "aB12"


# ── truncation placeholder filter ───────────────────────────────────


@verifies(SWR.SWR_1815)
@pytest.mark.parametrize(
    "bad_content",
    [
        "def foo():\n    pass\n... (rest of the file)",
        "x = 1\n... (538 more lines not shown — re-read with offset=300)",
        "function f() {}\n// ...existing code...",
        "def f(): pass\n# ...existing code...",
        "<div/>\n<!-- ...existing code... -->",
        "int main() {}\n/* ...existing code... */",
        "x = 1\n... (snip)",
        "x = 1\n... (truncated)",
        "x = 1\n... (omitted for brevity)",
        "x = 1\n... (unchanged)",
    ],
)
def test_content_with_truncation_placeholder_is_rejected(bad_content: str) -> None:
    with pytest.raises(ValidationError, match="truncation placeholder"):
        HAETHunk(
            operation=HAETOperation.REPLACE,
            anchor="aB12",
            anchor_line_number=1,
            content=bad_content,
        )


@verifies(SWR.SWR_1815)
def test_legitimate_ellipsis_in_content_is_allowed() -> None:
    HAETHunk(
        operation=HAETOperation.REPLACE,
        anchor="aB12",
        anchor_line_number=1,
        content="def foo() -> int: ...",
    )
    HAETHunk(
        operation=HAETOperation.INSERT_AFTER,
        anchor="aB12",
        anchor_line_number=1,
        content='print("loading...")',
    )
