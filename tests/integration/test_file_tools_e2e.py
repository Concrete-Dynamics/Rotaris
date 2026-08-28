from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor
from threading import Event, Thread
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from pathlib import Path

    import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tools.file_engine import FileToolEngine
from rotaris_core.tools.file_read import ReadFileAction, ReadFileExecutor
from rotaris_core.tools.file_write import WriteFileAction, WriteFileExecutor, WriteFileObservation


def _make_tools(tmp_path: Path) -> tuple[FileToolEngine, ReadFileExecutor, WriteFileExecutor]:
    engine = FileToolEngine(workspace_root=tmp_path)
    return engine, ReadFileExecutor(engine), WriteFileExecutor(engine)


@verifies(SWR.SWR_658, SWR.SWR_659)
def test_round_trip_create_read_edit_and_read_again(tmp_path: Path) -> None:
    _, read_exec, write_exec = _make_tools(tmp_path)

    create_obs = write_exec(
        WriteFileAction(path="notes.txt", command="create", content="alpha\nbeta\n"),
    )
    first_read = read_exec(ReadFileAction(path="notes.txt"))
    edit_obs = write_exec(
        WriteFileAction(path="notes.txt", command="edit", old_str="beta", new_str="BETA"),
    )
    second_read = read_exec(ReadFileAction(path="notes.txt"))

    assert create_obs.success
    assert not first_read.is_error
    assert first_read.text == "1: alpha\n2: beta"
    assert edit_obs.success
    assert edit_obs.match_level == "exact"
    assert not second_read.is_error
    assert second_read.text == "1: alpha\n2: BETA"


@verifies(SWR.SWR_657, SWR.SWR_659)
def test_read_before_write_ledger_gates_existing_files_until_read(tmp_path: Path) -> None:
    target = tmp_path / "gated.txt"
    _ = target.write_text("draft\n", encoding="utf-8", newline="")
    _, read_exec, write_exec = _make_tools(tmp_path)

    blocked = write_exec(
        WriteFileAction(path="gated.txt", command="overwrite", content="published\n"),
    )
    read_obs = read_exec(ReadFileAction(path="gated.txt"))
    allowed = write_exec(
        WriteFileAction(path="gated.txt", command="overwrite", content="published\n"),
    )

    assert blocked.is_error
    assert "You must read gated.txt before editing it." in blocked.text
    assert not read_obs.is_error
    assert allowed.success
    assert target.read_text(encoding="utf-8") == "published\n"


@verifies(SWR.SWR_657, SWR.SWR_659)
def test_undo_after_multiple_edits_restores_intermediate_state(tmp_path: Path) -> None:
    _, read_exec, write_exec = _make_tools(tmp_path)

    create_obs = write_exec(
        WriteFileAction(path="history.txt", command="create", content="one\ntwo\nthree\n"),
    )
    first_edit = write_exec(
        WriteFileAction(path="history.txt", command="edit", old_str="two", new_str="TWO"),
    )
    second_edit = write_exec(
        WriteFileAction(path="history.txt", command="insert", insert_line=2, new_str="inserted"),
    )
    undo_obs = write_exec(WriteFileAction(path="history.txt", command="undo"))
    final_read = read_exec(ReadFileAction(path="history.txt"))

    assert create_obs.success
    assert first_edit.success
    assert second_edit.success
    assert undo_obs.success
    assert not final_read.is_error
    assert final_read.text == "1: one\n2: TWO\n3: three"


@verifies(SWR.SWR_658, SWR.SWR_659)
def test_grep_then_edit_workflow_updates_the_matched_line(tmp_path: Path) -> None:
    _, read_exec, write_exec = _make_tools(tmp_path)
    _ = write_exec(
        WriteFileAction(
            path="app.py",
            command="create",
            content=("status = 'draft'\nowner = 'alice'\nstatus = 'todo'\nprint(status)\n"),
        ),
    )

    grep_obs = read_exec(ReadFileAction(path="app.py", grep=r"status = 'todo'", grep_context=1))
    edit_obs = write_exec(
        WriteFileAction(
            path="app.py",
            command="edit",
            old_str="status = 'todo'",
            new_str="status = 'done'",
        ),
    )
    final_read = read_exec(ReadFileAction(path="app.py"))

    assert not grep_obs.is_error
    assert "1 match(es) for 'status = 'todo'':" in grep_obs.text
    assert "> 3: status = 'todo'" in grep_obs.text
    assert edit_obs.success
    assert not final_read.is_error
    assert "3: status = 'done'" in final_read.text


@verifies(SWR.SWR_657, SWR.SWR_658)
def test_binary_file_read_failure_prevents_follow_up_write_flow(tmp_path: Path) -> None:
    binary_path = tmp_path / "blob.bin"
    _ = binary_path.write_bytes(b"abc\0def")
    _, read_exec, write_exec = _make_tools(tmp_path)

    read_obs = read_exec(ReadFileAction(path="blob.bin"))
    write_obs = write_exec(
        WriteFileAction(path="blob.bin", command="overwrite", content="text now\n"),
    )

    assert read_obs.is_error
    assert read_obs.text == "Binary file (7 bytes). Cannot display content."
    assert write_obs.is_error
    assert "You must read blob.bin before editing it." in write_obs.text
    assert binary_path.read_bytes() == b"abc\0def"


@verifies(SWR.SWR_657, SWR.SWR_659)
def test_latin1_file_can_be_read_then_overwritten_preserving_encoding(tmp_path: Path) -> None:
    latin1_path = tmp_path / "latin1.txt"
    _ = latin1_path.write_bytes("olá\nmañana\n".encode("latin-1"))
    _, read_exec, write_exec = _make_tools(tmp_path)

    first_read = read_exec(ReadFileAction(path="latin1.txt"))
    overwrite_obs = write_exec(
        WriteFileAction(path="latin1.txt", command="overwrite", content="café\nseñor\n"),
    )
    second_read = read_exec(ReadFileAction(path="latin1.txt"))

    assert not first_read.is_error
    assert first_read.encoding == "latin-1"
    assert first_read.text == "1: olá\n2: mañana"
    assert overwrite_obs.success
    assert latin1_path.read_bytes() == "café\nseñor\n".encode("latin-1")
    assert not second_read.is_error
    assert second_read.encoding == "latin-1"
    assert second_read.text == "1: café\n2: señor"


@verifies(SWR.SWR_658)
def test_read_tool_lists_directories_with_real_workspace_entries(tmp_path: Path) -> None:
    (tmp_path / "nested").mkdir()
    (tmp_path / ".git").mkdir()
    _, read_exec, write_exec = _make_tools(tmp_path)
    _ = write_exec(WriteFileAction(path="b.txt", command="create", content="b\n"))
    _ = write_exec(WriteFileAction(path="a.txt", command="create", content="a\n"))

    obs = read_exec(ReadFileAction(path="."))

    assert not obs.is_error
    assert obs.text == "a.txt\nb.txt\nnested/"


@verifies(SWR.SWR_116, SWR.SWR_657)
def test_paths_outside_workspace_are_rejected_for_read_and_write(tmp_path: Path) -> None:
    outside = tmp_path.parent / "escape.txt"
    _, read_exec, write_exec = _make_tools(tmp_path)

    read_obs = read_exec(ReadFileAction(path=str(outside)))
    write_obs = write_exec(
        WriteFileAction(path=str(outside), command="create", content="escape\n"),
    )

    assert read_obs.is_error
    assert "outside workspace root" in read_obs.text
    assert write_obs.is_error
    assert "outside workspace root" in write_obs.text
    assert not outside.exists()


@verifies(SWR.SWR_116)
def test_concurrent_writes_to_different_files_share_one_engine_safely(tmp_path: Path) -> None:
    _, read_exec, write_exec = _make_tools(tmp_path)
    _ = write_exec(WriteFileAction(path="left.txt", command="create", content="left\n"))
    _ = write_exec(WriteFileAction(path="right.txt", command="create", content="right\n"))
    _ = read_exec(ReadFileAction(path="left.txt"))
    _ = read_exec(ReadFileAction(path="right.txt"))

    def apply_update(path: str, old: str, new: str):
        return write_exec(WriteFileAction(path=path, command="edit", old_str=old, new_str=new))

    with ThreadPoolExecutor(max_workers=2) as pool:
        left_future = pool.submit(apply_update, "left.txt", "left", "LEFT")
        right_future = pool.submit(apply_update, "right.txt", "right", "RIGHT")

    left_obs = left_future.result()
    right_obs = right_future.result()

    assert left_obs.success
    assert right_obs.success
    assert (tmp_path / "left.txt").read_text(encoding="utf-8") == "LEFT\n"
    assert (tmp_path / "right.txt").read_text(encoding="utf-8") == "RIGHT\n"


@verifies(SWR.SWR_657, SWR.SWR_659)
def test_overwrite_is_atomic_and_never_exposes_partial_target_content(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    target = tmp_path / "atomic.txt"
    _ = target.write_text("old\ncontent\n", encoding="utf-8", newline="")
    _, read_exec, write_exec = _make_tools(tmp_path)
    _ = read_exec(ReadFileAction(path="atomic.txt"))

    replace_started = Event()
    allow_replace = Event()
    original_replace = os.replace
    observed_before_swap: list[str] = []
    result: dict[str, WriteFileObservation] = {}

    def delayed_replace(src: str, dst: str) -> None:
        replace_started.set()
        _ = allow_replace.wait(timeout=2)
        original_replace(src, dst)

    monkeypatch.setattr("rotaris_core.tools.file_engine.os.replace", delayed_replace)

    def run_overwrite() -> None:
        result["obs"] = write_exec(
            WriteFileAction(path="atomic.txt", command="overwrite", content="new\ncontent\n"),
        )

    worker = Thread(target=run_overwrite)
    worker.start()
    started = replace_started.wait(timeout=2)
    assert started
    observed_before_swap.append(target.read_text(encoding="utf-8"))
    observed_before_swap.append(target.read_text(encoding="utf-8"))
    allow_replace.set()
    worker.join(timeout=2)
    assert not worker.is_alive()

    obs = result["obs"]
    assert isinstance(obs, WriteFileObservation)
    assert all(content == "old\ncontent\n" for content in observed_before_swap)
    assert obs.success
    assert target.read_text(encoding="utf-8") == "new\ncontent\n"


@verifies(SWR.SWR_657, SWR.SWR_659)
def test_whitespace_normalized_fallback_edit_succeeds_end_to_end(tmp_path: Path) -> None:
    _, read_exec, write_exec = _make_tools(tmp_path)
    _ = write_exec(
        WriteFileAction(
            path="fallback.txt",
            command="create",
            content="alpha  \nbeta\t  \nomega\n",
        ),
    )

    read_obs = read_exec(ReadFileAction(path="fallback.txt"))
    edit_obs = write_exec(
        WriteFileAction(
            path="fallback.txt",
            command="edit",
            old_str="alpha\nbeta",
            new_str="ALPHA\nBETA",
        ),
    )
    final_read = read_exec(ReadFileAction(path="fallback.txt"))

    assert not read_obs.is_error
    assert edit_obs.success
    assert edit_obs.match_level == "whitespace"
    assert not final_read.is_error
    assert final_read.text == "1: ALPHA\n2: BETA\n3: omega"


@verifies(SWR.SWR_659)
def test_replace_all_updates_every_occurrence_and_read_confirms_result(tmp_path: Path) -> None:
    _, read_exec, write_exec = _make_tools(tmp_path)
    _ = write_exec(
        WriteFileAction(
            path="repeat.txt",
            command="create",
            content="target\nkeep\ntarget\ntarget\n",
        ),
    )

    before = read_exec(ReadFileAction(path="repeat.txt", grep="target", grep_context=0))
    edit_obs = write_exec(
        WriteFileAction(
            path="repeat.txt",
            command="edit",
            old_str="target",
            new_str="updated",
            replace_all=True,
        ),
    )
    after = read_exec(ReadFileAction(path="repeat.txt"))

    assert not before.is_error
    assert "3 match(es) for 'target':" in before.text
    assert edit_obs.success
    assert edit_obs.occurrences_replaced == 3
    assert not after.is_error
    assert after.text == "1: updated\n2: keep\n3: updated\n4: updated"
