"""Tests for the read_file tool executor."""

from __future__ import annotations

from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tools.file_engine import FileToolEngine
from rotaris_core.tools.file_read import ReadFileAction, ReadFileExecutor

if TYPE_CHECKING:
    from pathlib import Path


def _write_file(path: Path, lines: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    _ = path.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="")


def _make_executor(tmp_path: Path) -> tuple[FileToolEngine, ReadFileExecutor]:
    engine = FileToolEngine(tmp_path)
    return engine, ReadFileExecutor(engine)


@verifies(SWR.SWR_658)
def test_read_normal_file_returns_numbered_content_and_metadata(tmp_path: Path) -> None:
    path = tmp_path / "notes.txt"
    _write_file(path, ["alpha", "beta", "gamma"])
    engine, executor = _make_executor(tmp_path)

    obs = executor(ReadFileAction(path="notes.txt"))

    assert not obs.is_error
    assert obs.text == "1: alpha\n2: beta\n3: gamma"
    assert obs.path == "notes.txt"
    assert obs.total_lines == 3
    assert obs.shown_start == 1
    assert obs.shown_end == 3
    assert obs.encoding == "utf-8"
    assert obs.content_hash == engine.content_hash(path.read_text(encoding="utf-8"))
    assert not obs.truncated


@verifies(SWR.SWR_658)
def test_read_with_offset_skips_earlier_lines(tmp_path: Path) -> None:
    _write_file(tmp_path / "notes.txt", ["one", "two", "three", "four"])
    _, executor = _make_executor(tmp_path)

    obs = executor(ReadFileAction(path="notes.txt", offset=3))

    assert not obs.is_error
    assert obs.text == "3: three\n4: four"
    assert obs.shown_start == 3
    assert obs.shown_end == 4


@verifies(SWR.SWR_658)
def test_read_with_limit_truncates_and_shows_more_lines_notice(tmp_path: Path) -> None:
    _write_file(tmp_path / "notes.txt", ["one", "two", "three", "four"])
    _, executor = _make_executor(tmp_path)

    obs = executor(ReadFileAction(path="notes.txt", limit=2))

    assert not obs.is_error
    assert obs.text == "1: one\n2: two\n\n(2 more lines. Use offset=3 to continue.)"
    assert obs.total_lines == 4
    assert obs.shown_start == 1
    assert obs.shown_end == 2
    assert obs.truncated


@verifies(SWR.SWR_658)
def test_read_directory_returns_listing(tmp_path: Path) -> None:
    (tmp_path / "subdir").mkdir()
    (tmp_path / ".git").mkdir()
    _write_file(tmp_path / "alpha.txt", ["x"])
    _, executor = _make_executor(tmp_path)

    obs = executor(ReadFileAction(path="."))

    assert not obs.is_error
    assert obs.text == "alpha.txt\nsubdir/"
    assert obs.path == "."
    assert obs.total_lines == 0


@verifies(SWR.SWR_658)
def test_read_file_action_accepts_file_path_alias(tmp_path: Path) -> None:
    """read_file accepts ``file_path`` as an alias for ``path``."""
    _write_file(tmp_path / "hello.txt", ["world"])
    _, executor = _make_executor(tmp_path)

    # Construct using the alias name LLMs naturally emit.
    action = ReadFileAction.model_validate({"file_path": "hello.txt"})
    assert action.path == "hello.txt"

    obs = executor(action)
    assert not obs.is_error
    assert obs.text == "1: world"


@verifies(SWR.SWR_658)
def test_read_file_schema_describes_path_parameter_name() -> None:
    schema = ReadFileAction.model_json_schema()

    description = schema["properties"]["path"]["description"]
    assert "Use `path` as the parameter name" in description
    assert "not `file_path`" in description


@verifies(SWR.SWR_658, SWR.SWR_562)
def test_read_missing_file_returns_error_observation(tmp_path: Path) -> None:
    _, executor = _make_executor(tmp_path)
    _write_file(tmp_path / "present.txt", ["ok"])

    obs = executor(ReadFileAction(path="missing.txt"))

    assert obs.is_error
    assert obs.path == "missing.txt"
    assert "File not found: missing.txt." in obs.text
    assert "parent directory" in obs.text
    assert "Nearby entries: present.txt" in obs.text


@verifies(SWR.SWR_658)
def test_read_binary_file_returns_error_observation(tmp_path: Path) -> None:
    path = tmp_path / "data.bin"
    _ = path.write_bytes(b"abc\0def")
    _, executor = _make_executor(tmp_path)

    obs = executor(ReadFileAction(path="data.bin"))

    assert obs.is_error
    assert obs.path == "data.bin"
    assert obs.text == "Binary file (7 bytes). Cannot display content."


@verifies(SWR.SWR_658)
def test_read_with_grep_returns_matching_lines_with_context(tmp_path: Path) -> None:
    _write_file(
        tmp_path / "app.py",
        ["alpha", "beta", "gamma target", "delta", "epsilon target", "zeta"],
    )
    _, executor = _make_executor(tmp_path)

    obs = executor(ReadFileAction(path="app.py", grep="target", grep_context=1))

    assert not obs.is_error
    assert obs.total_lines == 6
    assert obs.encoding == "utf-8"
    assert "2 match(es) for 'target':" in obs.text
    assert "  2: beta" in obs.text
    assert "> 3: gamma target" in obs.text
    assert "  4: delta" in obs.text
    assert "> 5: epsilon target" in obs.text
    assert "  6: zeta" in obs.text


@verifies(SWR.SWR_658)
def test_read_with_grep_no_matches_returns_notice(tmp_path: Path) -> None:
    _write_file(tmp_path / "app.py", ["alpha", "beta"])
    _, executor = _make_executor(tmp_path)

    obs = executor(ReadFileAction(path="app.py", grep="target"))

    assert not obs.is_error
    assert obs.text == "No matches for pattern 'target' in app.py."
    assert obs.total_lines == 2


@verifies(SWR.SWR_658)
def test_read_with_invalid_grep_pattern_returns_error(tmp_path: Path) -> None:
    _write_file(tmp_path / "app.py", ["alpha"])
    _, executor = _make_executor(tmp_path)

    obs = executor(ReadFileAction(path="app.py", grep="["))

    assert obs.is_error
    assert obs.path == "app.py"
    assert obs.text.startswith("Invalid grep pattern:")


@verifies(SWR.SWR_658)
def test_read_records_file_in_engine_ledger(tmp_path: Path) -> None:
    path = tmp_path / "notes.txt"
    _write_file(path, ["alpha", "beta"])
    engine, executor = _make_executor(tmp_path)

    obs = executor(ReadFileAction(path="notes.txt"))

    record = engine.read_ledger[str(path.resolve())]
    assert not obs.is_error
    assert record.content_hash == obs.content_hash


@verifies(SWR.SWR_658)
def test_read_detects_utf8_encoding(tmp_path: Path) -> None:
    path = tmp_path / "utf8.txt"
    _ = path.write_text("café\n", encoding="utf-8", newline="")
    _, executor = _make_executor(tmp_path)

    obs = executor(ReadFileAction(path="utf8.txt"))

    assert not obs.is_error
    assert obs.encoding == "utf-8"
    assert obs.text == "1: café"


@verifies(SWR.SWR_658)
def test_read_detects_latin1_encoding(tmp_path: Path) -> None:
    path = tmp_path / "latin1.txt"
    _ = path.write_bytes(b"caf\xe9\n")
    _, executor = _make_executor(tmp_path)

    obs = executor(ReadFileAction(path="latin1.txt"))

    assert not obs.is_error
    assert obs.encoding == "latin-1"
    assert obs.text == "1: café"
