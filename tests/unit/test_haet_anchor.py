import pytest
from pydantic import ValidationError

from rotaris_core.haet.anchor import TaggedFile, TaggedLine
from rotaris_core.reqtocode import SWR, verifies

_SNAPSHOT = "0123456789abcdef"


def _make_tagged_file(n: int, *, snapshot: str = _SNAPSHOT) -> TaggedFile:
    return TaggedFile(
        path="big.py",
        snapshot_id=snapshot,
        lines=[TaggedLine(line_number=i + 1, anchor="aB12", content=f"line{i}") for i in range(n)],
    )


@verifies(SWR.SWR_1814)
def test_tagged_line_creation_and_validation() -> None:
    line = TaggedLine(line_number=1, anchor="aB12", content="value")
    assert line.line_number == 1
    assert line.anchor == "aB12"
    assert line.content == "value"


@verifies(SWR.SWR_1814)
def test_tagged_line_rejects_short_anchor() -> None:
    with pytest.raises(ValidationError):
        TaggedLine(line_number=1, anchor="aB", content="x")


@verifies(SWR.SWR_1814)
def test_tagged_file_get_line_by_anchor_returns_matches() -> None:
    tagged_file = TaggedFile(
        path="sample.py",
        snapshot_id=_SNAPSHOT,
        lines=[
            TaggedLine(line_number=1, anchor="aB12", content="first"),
            TaggedLine(line_number=2, anchor="cDef", content="second"),
            TaggedLine(line_number=3, anchor="aB12", content="third"),
        ],
    )

    matches = tagged_file.get_line_by_anchor("aB12")

    assert [line.line_number for line in matches] == [1, 3]


@verifies(SWR.SWR_1815)
def test_tagged_file_requires_snapshot_id() -> None:
    with pytest.raises(ValidationError):
        TaggedFile(path="sample.py", lines=[])  # type: ignore[call-arg]


@verifies(SWR.SWR_640)
def test_render_for_llm_format_includes_snapshot_id() -> None:
    tagged_file = TaggedFile(
        path="sample.py",
        snapshot_id="abc123def456",
        lines=[TaggedLine(line_number=1, anchor="aB12", content="first")],
    )

    rendered = tagged_file.render_for_llm()
    lines = rendered.splitlines()
    assert lines[0].startswith("# haet_read: sample.py")
    assert "snapshot_id=abc123def456" in lines[0]
    assert '→ anchor="Ab12"' in lines[0]
    assert lines[1] == "#[aB12]     1 | first"


@verifies(SWR.SWR_1814)
def test_line_number_must_be_at_least_one() -> None:
    with pytest.raises(ValidationError):
        TaggedLine(line_number=0, anchor="aB12", content="bad")


@verifies(SWR.SWR_1814)
def test_content_must_not_end_with_newline() -> None:
    with pytest.raises(ValidationError):
        TaggedLine(line_number=1, anchor="aB12", content="bad\n")


@verifies(SWR.SWR_1814)
def test_render_for_llm_returns_all_lines_when_under_limit() -> None:
    tf = _make_tagged_file(10)
    rendered = tf.render_for_llm()
    lines = rendered.splitlines()
    assert len(lines) == 11
    assert "more lines not shown" not in rendered


@verifies(SWR.SWR_1814)
def test_render_for_llm_truncates_at_300_lines() -> None:
    tf = _make_tagged_file(350)
    rendered = tf.render_for_llm()
    lines = rendered.splitlines()
    assert len(lines) == 302
    assert "50 more lines not shown" in lines[-1]
    assert "offset=300" in lines[-1]


@verifies(SWR.SWR_1814)
def test_render_for_llm_offset_returns_next_page() -> None:
    tf = _make_tagged_file(350)
    rendered = tf.render_for_llm(offset=300)
    lines = rendered.splitlines()
    assert len(lines) == 51
    assert "more lines not shown" not in rendered
    assert "line300" in rendered


@verifies(SWR.SWR_1814)
def test_render_for_llm_offset_beyond_file_returns_no_content() -> None:
    tf = _make_tagged_file(5)
    rendered = tf.render_for_llm(offset=10)
    assert "no more lines at offset=10" in rendered
    assert "#[" not in rendered
