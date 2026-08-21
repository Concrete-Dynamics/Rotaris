from __future__ import annotations

import os
from pathlib import Path

import pytest

from rotaris_core.haet.engine import HAETEngine
from rotaris_core.haet.hasher import context_hash_for_position, line_hash, snapshot_id
from rotaris_core.haet.patch import HAETHunk, HAETOperation, HAETPatchRequest
from rotaris_core.reqtocode import SWR, verifies


def _write_file(
    path: Path,
    lines: list[str],
    line_ending: str = "\n",
    trailing_newline: bool = True,
) -> None:
    content = line_ending.join(lines)
    if lines and trailing_newline:
        content += line_ending
    path.write_text(content, encoding="utf-8", newline="")


def _read_snapshot(path: Path) -> str:
    return snapshot_id(path.read_bytes())


def _hunk(**overrides: object) -> HAETHunk:
    base: dict[str, object] = {
        "operation": HAETOperation.REPLACE,
        "anchor": "aB12",
        "anchor_line_number": 1,
        "content": "value",
    }
    base.update(overrides)
    return HAETHunk(**base)  # type: ignore[arg-type]


# ── read ──────────────────────────────────────────────────────────────


@verifies(SWR.SWR_639, SWR.SWR_640, SWR.SWR_1814)
def test_read_file_returns_tagged_lines_with_snapshot_id(tmp_path: Path) -> None:
    file_path = tmp_path / "sample.py"
    _write_file(file_path, ["first", "second"])
    engine = HAETEngine(tmp_path)

    tagged_file = engine.read_file("sample.py")

    assert [line.line_number for line in tagged_file.lines] == [1, 2]
    assert [line.content for line in tagged_file.lines] == ["first", "second"]
    assert [line.anchor for line in tagged_file.lines] == [line_hash("first"), line_hash("second")]
    assert tagged_file.snapshot_id == _read_snapshot(file_path)


@verifies(SWR.SWR_1815)
def test_read_file_empty_file_returns_empty_snapshot(tmp_path: Path) -> None:
    file_path = tmp_path / "empty.py"
    file_path.write_text("", encoding="utf-8")
    engine = HAETEngine(tmp_path)

    tagged_file = engine.read_file("empty.py")

    assert tagged_file.lines == []
    assert tagged_file.snapshot_id == "empty"


@verifies(SWR.SWR_502, SWR.SWR_2113)
def test_read_file_rejects_path_escape(tmp_path: Path) -> None:
    engine = HAETEngine(tmp_path)
    with pytest.raises(ValueError):
        engine.read_file("../escape.py")


# ── happy paths for each operation ────────────────────────────────────


@verifies(SWR.SWR_1815)
def test_apply_patch_insert_before(tmp_path: Path) -> None:
    file_path = tmp_path / "sample.py"
    _write_file(file_path, ["alpha", "beta"])
    engine = HAETEngine(tmp_path)
    snap = _read_snapshot(file_path)

    result = engine.apply_patch(
        HAETPatchRequest(
            file_path="sample.py",
            snapshot_id=snap,
            hunks=[
                _hunk(
                    operation=HAETOperation.INSERT_BEFORE,
                    anchor=line_hash("beta"),
                    anchor_line_number=2,
                    content="inserted",
                ),
            ],
        ),
    )

    assert result.success is True
    assert result.relocated is False
    assert result.new_snapshot_id is not None and result.new_snapshot_id != snap
    assert file_path.read_text(encoding="utf-8").splitlines() == ["alpha", "inserted", "beta"]


@verifies(SWR.SWR_1815)
def test_apply_patch_insert_after(tmp_path: Path) -> None:
    file_path = tmp_path / "sample.py"
    _write_file(file_path, ["alpha", "beta"])
    engine = HAETEngine(tmp_path)
    snap = _read_snapshot(file_path)

    result = engine.apply_patch(
        HAETPatchRequest(
            file_path="sample.py",
            snapshot_id=snap,
            hunks=[
                _hunk(
                    operation=HAETOperation.INSERT_AFTER,
                    anchor=line_hash("alpha"),
                    anchor_line_number=1,
                    content="inserted",
                ),
            ],
        ),
    )

    assert result.success is True
    assert file_path.read_text(encoding="utf-8").splitlines() == ["alpha", "inserted", "beta"]


@verifies(SWR.SWR_1815)
def test_apply_patch_replace(tmp_path: Path) -> None:
    file_path = tmp_path / "sample.py"
    _write_file(file_path, ["alpha", "beta"])
    engine = HAETEngine(tmp_path)
    snap = _read_snapshot(file_path)

    result = engine.apply_patch(
        HAETPatchRequest(
            file_path="sample.py",
            snapshot_id=snap,
            hunks=[
                _hunk(
                    operation=HAETOperation.REPLACE,
                    anchor=line_hash("beta"),
                    anchor_line_number=2,
                    content="gamma",
                ),
            ],
        ),
    )

    assert result.success is True
    assert file_path.read_text(encoding="utf-8").splitlines() == ["alpha", "gamma"]


@verifies(SWR.SWR_1815)
def test_apply_patch_delete(tmp_path: Path) -> None:
    file_path = tmp_path / "sample.py"
    _write_file(file_path, ["alpha", "beta"])
    engine = HAETEngine(tmp_path)
    snap = _read_snapshot(file_path)

    result = engine.apply_patch(
        HAETPatchRequest(
            file_path="sample.py",
            snapshot_id=snap,
            hunks=[
                _hunk(
                    operation=HAETOperation.DELETE,
                    anchor=line_hash("alpha"),
                    anchor_line_number=1,
                    content=None,
                ),
            ],
        ),
    )

    assert result.success is True
    assert file_path.read_text(encoding="utf-8").splitlines() == ["beta"]


@verifies(SWR.SWR_1815)
def test_apply_patch_multiple_hunks(tmp_path: Path) -> None:
    file_path = tmp_path / "sample.py"
    _write_file(file_path, ["alpha", "beta", "gamma"])
    engine = HAETEngine(tmp_path)
    snap = _read_snapshot(file_path)

    result = engine.apply_patch(
        HAETPatchRequest(
            file_path="sample.py",
            snapshot_id=snap,
            hunks=[
                _hunk(
                    operation=HAETOperation.INSERT_AFTER,
                    anchor=line_hash("alpha"),
                    anchor_line_number=1,
                    content="between",
                ),
                _hunk(
                    operation=HAETOperation.REPLACE,
                    anchor=line_hash("beta"),
                    anchor_line_number=2,
                    content="delta",
                ),
                _hunk(
                    operation=HAETOperation.DELETE,
                    anchor=line_hash("gamma"),
                    anchor_line_number=3,
                    content=None,
                ),
            ],
        ),
    )

    assert result.success is True
    assert file_path.read_text(encoding="utf-8").splitlines() == ["alpha", "between", "delta"]


# ── duplicate-line collision is now handled by anchor_line_number ────


@verifies(SWR.SWR_1814)
def test_duplicate_lines_disambiguated_by_anchor_line_number(tmp_path: Path) -> None:
    file_path = tmp_path / "sample.py"
    _write_file(file_path, ["dup", "middle", "dup"])
    engine = HAETEngine(tmp_path)
    snap = _read_snapshot(file_path)

    result = engine.apply_patch(
        HAETPatchRequest(
            file_path="sample.py",
            snapshot_id=snap,
            hunks=[
                _hunk(
                    operation=HAETOperation.REPLACE,
                    anchor=line_hash("dup"),
                    anchor_line_number=3,
                    content="tail",
                ),
            ],
        ),
    )

    assert result.success is True
    assert file_path.read_text(encoding="utf-8").splitlines() == ["dup", "middle", "tail"]


@verifies(SWR.SWR_1816, SWR.SWR_666, SWR.SWR_562)
def test_unique_anchor_line_mismatch_relocates_current_snapshot(tmp_path: Path) -> None:
    file_path = tmp_path / "sample.py"
    _write_file(file_path, ["alpha", "beta", "gamma"])
    engine = HAETEngine(tmp_path)
    snap = _read_snapshot(file_path)

    result = engine.apply_patch(
        HAETPatchRequest(
            file_path="sample.py",
            snapshot_id=snap,
            hunks=[
                _hunk(
                    operation=HAETOperation.REPLACE,
                    anchor=line_hash("alpha"),
                    anchor_line_number=2,  # WRONG: line 2 is "beta"
                    content="ALPHA",
                ),
            ],
        ),
    )

    assert result.success is True
    assert result.relocated is True
    assert file_path.read_text(encoding="utf-8").splitlines() == ["ALPHA", "beta", "gamma"]


@verifies(SWR.SWR_1816)
def test_unique_end_anchor_line_mismatch_relocates_current_snapshot(tmp_path: Path) -> None:
    file_path = tmp_path / "sample.py"
    _write_file(file_path, ["alpha", "beta", "gamma", "delta"])
    engine = HAETEngine(tmp_path)
    snap = _read_snapshot(file_path)

    result = engine.apply_patch(
        HAETPatchRequest(
            file_path="sample.py",
            snapshot_id=snap,
            hunks=[
                _hunk(
                    operation=HAETOperation.REPLACE,
                    anchor=line_hash("beta"),
                    anchor_line_number=2,
                    end_anchor=line_hash("gamma"),
                    end_anchor_line_number=4,
                    content="middle",
                ),
            ],
        ),
    )

    assert result.success is True
    assert result.relocated is True
    assert file_path.read_text(encoding="utf-8").splitlines() == ["alpha", "middle", "delta"]


@verifies(SWR.SWR_1816, SWR.SWR_666)
def test_ambiguous_anchor_line_mismatch_rejected_with_recovery(tmp_path: Path) -> None:
    """Duplicate anchor mismatch stays rejected because relocation is ambiguous."""
    file_path = tmp_path / "sample.py"
    _write_file(file_path, ["alpha", "beta", "alpha"])
    engine = HAETEngine(tmp_path)
    snap = _read_snapshot(file_path)

    result = engine.apply_patch(
        HAETPatchRequest(
            file_path="sample.py",
            snapshot_id=snap,
            hunks=[
                _hunk(
                    operation=HAETOperation.DELETE,
                    anchor=line_hash("alpha"),
                    anchor_line_number=2,
                    content=None,
                ),
            ],
        ),
    )

    assert result.success is False
    assert result.errors[0].error == "anchor_line_mismatch"
    assert result.errors[0].recovery is not None
    assert file_path.read_text(encoding="utf-8").splitlines() == ["alpha", "beta", "alpha"]


# ── snapshot_id and one-shot re-anchor ───────────────────────────────


@verifies(SWR.SWR_1815, SWR.SWR_666)
def test_stale_snapshot_with_unique_anchors_relocates_silently(tmp_path: Path) -> None:
    """If the file changed but every anchor is still uniquely locatable, the
    engine relocates and applies — the response sets relocated=True.
    """
    file_path = tmp_path / "sample.py"
    _write_file(file_path, ["alpha", "beta", "gamma"])
    engine = HAETEngine(tmp_path)
    stale_snap = _read_snapshot(file_path)

    # Drift the file: prepend a comment line so line numbers all shift.
    _write_file(file_path, ["# header", "alpha", "beta", "gamma"])

    result = engine.apply_patch(
        HAETPatchRequest(
            file_path="sample.py",
            snapshot_id=stale_snap,
            hunks=[
                _hunk(
                    operation=HAETOperation.REPLACE,
                    anchor=line_hash("beta"),
                    anchor_line_number=2,  # stale: actual line is now 3
                    content="DELTA",
                ),
            ],
        ),
    )

    assert result.success is True
    assert result.relocated is True
    assert file_path.read_text(encoding="utf-8").splitlines() == [
        "# header",
        "alpha",
        "DELTA",
        "gamma",
    ]


@verifies(SWR.SWR_1815, SWR.SWR_1816, SWR.SWR_666)
def test_stale_snapshot_with_ambiguous_relocation_returns_recovery(tmp_path: Path) -> None:
    """If a stale anchor cannot be uniquely relocated, the engine returns a
    structured snapshot_mismatch with candidate lines and the fresh snapshot.
    """
    file_path = tmp_path / "sample.py"
    _write_file(file_path, ["alpha", "beta", "gamma"])
    engine = HAETEngine(tmp_path)
    stale_snap = _read_snapshot(file_path)

    # Drift: introduce two `beta` lines both outside the ±5 hint window
    # around line 2 (so neither wins by proximity), forcing ambiguity.
    _write_file(
        file_path,
        ["# header", "x", "y", "z", "q", "r", "s", "t", "beta", "u", "v", "beta", "end"],
    )

    result = engine.apply_patch(
        HAETPatchRequest(
            file_path="sample.py",
            snapshot_id=stale_snap,
            hunks=[
                _hunk(
                    operation=HAETOperation.REPLACE,
                    anchor=line_hash("beta"),
                    anchor_line_number=2,
                    content="DELTA",
                ),
            ],
        ),
    )

    assert result.success is False
    err = result.errors[0]
    assert err.error == "snapshot_mismatch"
    assert err.recovery is not None
    candidates = err.recovery.candidates
    assert len(candidates) == 2
    assert {c.line_number for c in candidates} == {9, 12}
    # File untouched.
    assert file_path.read_text(encoding="utf-8").splitlines()[0] == "# header"


# ── context-window verification ──────────────────────────────────────


@verifies(SWR.SWR_1816)
def test_context_before_hash_match_allows_edit(tmp_path: Path) -> None:
    file_path = tmp_path / "sample.py"
    _write_file(file_path, ["alpha", "beta", "gamma"])
    engine = HAETEngine(tmp_path)
    snap = _read_snapshot(file_path)
    lines = ["alpha", "beta", "gamma"]
    before = context_hash_for_position(lines, 0, side="before")  # alpha is line above beta

    result = engine.apply_patch(
        HAETPatchRequest(
            file_path="sample.py",
            snapshot_id=snap,
            hunks=[
                _hunk(
                    operation=HAETOperation.REPLACE,
                    anchor=line_hash("beta"),
                    anchor_line_number=2,
                    content="DELTA",
                    context_before_hash=before,
                ),
            ],
        ),
    )
    assert result.success is True


@verifies(SWR.SWR_1816)
def test_context_before_hash_mismatch_rejects(tmp_path: Path) -> None:
    file_path = tmp_path / "sample.py"
    _write_file(file_path, ["alpha", "beta", "gamma"])
    engine = HAETEngine(tmp_path)
    snap = _read_snapshot(file_path)

    result = engine.apply_patch(
        HAETPatchRequest(
            file_path="sample.py",
            snapshot_id=snap,
            hunks=[
                _hunk(
                    operation=HAETOperation.REPLACE,
                    anchor=line_hash("beta"),
                    anchor_line_number=2,
                    content="DELTA",
                    context_before_hash="deadbeef",
                ),
            ],
        ),
    )

    assert result.success is False
    assert result.errors[0].error == "context_mismatch"
    assert file_path.read_text(encoding="utf-8").splitlines() == ["alpha", "beta", "gamma"]


@verifies(SWR.SWR_1816)
def test_context_bof_sentinel_works_at_first_line(tmp_path: Path) -> None:
    file_path = tmp_path / "sample.py"
    _write_file(file_path, ["alpha", "beta"])
    engine = HAETEngine(tmp_path)
    snap = _read_snapshot(file_path)

    result = engine.apply_patch(
        HAETPatchRequest(
            file_path="sample.py",
            snapshot_id=snap,
            hunks=[
                _hunk(
                    operation=HAETOperation.INSERT_BEFORE,
                    anchor=line_hash("alpha"),
                    anchor_line_number=1,
                    content="zero",
                    context_before_hash="BOF",
                ),
            ],
        ),
    )

    assert result.success is True


# ── all-or-nothing semantics ──────────────────────────────────────────


@verifies(SWR.SWR_1815)
def test_apply_patch_is_all_or_nothing(tmp_path: Path) -> None:
    file_path = tmp_path / "sample.py"
    _write_file(file_path, ["alpha", "beta", "gamma"])
    engine = HAETEngine(tmp_path)
    snap = _read_snapshot(file_path)

    result = engine.apply_patch(
        HAETPatchRequest(
            file_path="sample.py",
            snapshot_id=snap,
            hunks=[
                _hunk(
                    operation=HAETOperation.REPLACE,
                    anchor=line_hash("alpha"),
                    anchor_line_number=1,
                    content="new-alpha",
                ),
                _hunk(
                    operation=HAETOperation.DELETE,
                    anchor="ZZZZ",
                    anchor_line_number=99,
                    content=None,
                ),
                _hunk(
                    operation=HAETOperation.DELETE,
                    anchor=line_hash("gamma"),
                    anchor_line_number=3,
                    content=None,
                ),
            ],
        ),
    )

    assert result.success is False
    assert result.hunks_applied == 0
    assert file_path.read_text(encoding="utf-8").splitlines() == ["alpha", "beta", "gamma"]


@verifies(SWR.SWR_1815)
def test_apply_patch_uses_atomic_write(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    file_path = tmp_path / "sample.py"
    _write_file(file_path, ["alpha", "beta"])
    engine = HAETEngine(tmp_path)
    snap = _read_snapshot(file_path)

    calls: list[tuple[str, str]] = []
    real_replace = os.replace

    def record_replace(src: str | os.PathLike[str], dst: str | os.PathLike[str]) -> None:
        calls.append((os.fspath(src), os.fspath(dst)))
        real_replace(src, dst)

    monkeypatch.setattr(os, "replace", record_replace)

    result = engine.apply_patch(
        HAETPatchRequest(
            file_path="sample.py",
            snapshot_id=snap,
            hunks=[
                _hunk(
                    operation=HAETOperation.DELETE,
                    anchor=line_hash("beta"),
                    anchor_line_number=2,
                    content=None,
                ),
            ],
        ),
    )

    assert result.success is True
    assert len(calls) == 1
    src, dst = calls[0]
    assert Path(src).parent == tmp_path
    assert dst == os.fspath(file_path)


# ── range replace ────────────────────────────────────────────────────


@verifies(SWR.SWR_1815)
def test_replace_range_replaces_all_lines_in_range(tmp_path: Path) -> None:
    file_path = tmp_path / "sample.py"
    _write_file(file_path, ["def foo():", '    """old docstring."""', "    pass", "# end"])
    engine = HAETEngine(tmp_path)
    snap = _read_snapshot(file_path)

    result = engine.apply_patch(
        HAETPatchRequest(
            file_path="sample.py",
            snapshot_id=snap,
            hunks=[
                _hunk(
                    operation=HAETOperation.REPLACE,
                    anchor=line_hash('    """old docstring."""'),
                    anchor_line_number=2,
                    end_anchor=line_hash("    pass"),
                    end_anchor_line_number=3,
                    content='    """New expanded\n    docstring.\n    """\n    pass',
                ),
            ],
        ),
    )

    assert result.success is True
    assert file_path.read_text(encoding="utf-8").splitlines() == [
        "def foo():",
        '    """New expanded',
        "    docstring.",
        '    """',
        "    pass",
        "# end",
    ]


@verifies(SWR.SWR_1815)
def test_replace_range_end_before_start_rejected(tmp_path: Path) -> None:
    file_path = tmp_path / "sample.py"
    _write_file(file_path, ["alpha", "beta", "gamma"])
    engine = HAETEngine(tmp_path)
    snap = _read_snapshot(file_path)

    result = engine.apply_patch(
        HAETPatchRequest(
            file_path="sample.py",
            snapshot_id=snap,
            hunks=[
                _hunk(
                    operation=HAETOperation.REPLACE,
                    anchor=line_hash("beta"),
                    anchor_line_number=2,
                    end_anchor=line_hash("alpha"),
                    end_anchor_line_number=1,
                    content="replacement",
                ),
            ],
        ),
    )

    assert result.success is False
    assert result.errors[0].error == "end_before_start"


# ── orphan-lines guard preserved ─────────────────────────────────────


@verifies(SWR.SWR_1815)
def test_single_anchor_replace_with_large_content_is_rejected(tmp_path: Path) -> None:
    file_path = tmp_path / "sample.py"
    _write_file(file_path, [f"line{i}" for i in range(50)])
    engine = HAETEngine(tmp_path)
    snap = _read_snapshot(file_path)

    big_content = "\n".join(f"new{i}" for i in range(25))
    result = engine.apply_patch(
        HAETPatchRequest(
            file_path="sample.py",
            snapshot_id=snap,
            hunks=[
                _hunk(
                    operation=HAETOperation.REPLACE,
                    anchor=line_hash("line0"),
                    anchor_line_number=1,
                    content=big_content,
                ),
            ],
        ),
    )

    assert result.success is False
    assert result.errors[0].error == "single_anchor_replace_too_large"
    assert file_path.read_text(encoding="utf-8").startswith("line0\nline1\n")


@verifies(SWR.SWR_1815)
def test_range_replace_with_large_content_is_allowed(tmp_path: Path) -> None:
    file_path = tmp_path / "sample.py"
    _write_file(file_path, [f"line{i}" for i in range(50)])
    engine = HAETEngine(tmp_path)
    snap = _read_snapshot(file_path)

    big_content = "\n".join(f"new{i}" for i in range(25))
    result = engine.apply_patch(
        HAETPatchRequest(
            file_path="sample.py",
            snapshot_id=snap,
            hunks=[
                _hunk(
                    operation=HAETOperation.REPLACE,
                    anchor=line_hash("line0"),
                    anchor_line_number=1,
                    end_anchor=line_hash("line30"),
                    end_anchor_line_number=31,
                    content=big_content,
                ),
            ],
        ),
    )

    assert result.success is True


@verifies(SWR.SWR_1815)
def test_small_single_anchor_replace_is_allowed(tmp_path: Path) -> None:
    file_path = tmp_path / "sample.py"
    _write_file(file_path, ["alpha", "beta"])
    engine = HAETEngine(tmp_path)
    snap = _read_snapshot(file_path)

    result = engine.apply_patch(
        HAETPatchRequest(
            file_path="sample.py",
            snapshot_id=snap,
            hunks=[
                _hunk(
                    operation=HAETOperation.REPLACE,
                    anchor=line_hash("alpha"),
                    anchor_line_number=1,
                    content="\n".join(f"x{i}" for i in range(20)),
                ),
            ],
        ),
    )

    assert result.success is True
