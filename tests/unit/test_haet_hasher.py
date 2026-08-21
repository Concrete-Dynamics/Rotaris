from rotaris_core.haet.hasher import (
    ANCHOR_LENGTH,
    BASE62_CHARS,
    BOF_SENTINEL,
    EOF_SENTINEL,
    context_hash_for_position,
    file_hashes,
    line_hash,
    snapshot_id,
)
from rotaris_core.reqtocode import SWR, verifies


@verifies(SWR.SWR_1814)
def test_anchor_length_is_four() -> None:
    """Locked-in protocol: anchors are 4 base62 characters (~14.7M values)."""
    assert ANCHOR_LENGTH == 4


@verifies(SWR.SWR_1814)
def test_line_hash_is_deterministic() -> None:
    assert line_hash("alpha") == line_hash("alpha")


@verifies(SWR.SWR_1814)
def test_different_inputs_produce_different_anchors() -> None:
    assert line_hash("alpha") != line_hash("beta")
    assert line_hash("foo") != line_hash("bar")


@verifies(SWR.SWR_1814)
def test_empty_string_has_valid_anchor() -> None:
    anchor = line_hash("")
    assert len(anchor) == ANCHOR_LENGTH
    assert set(anchor) <= set(BASE62_CHARS)


@verifies(SWR.SWR_1814)
def test_unicode_has_valid_anchor() -> None:
    for value in ["こんにちは", "你好世界", "🎉🚀✨"]:
        anchor = line_hash(value)
        assert len(anchor) == ANCHOR_LENGTH
        assert set(anchor) <= set(BASE62_CHARS)


@verifies(SWR.SWR_1814)
def test_trailing_newline_is_ignored() -> None:
    assert line_hash("foo\n") == line_hash("foo")
    assert line_hash("foo\r\n") == line_hash("foo")


@verifies(SWR.SWR_1814)
def test_leading_whitespace_changes_hash() -> None:
    assert line_hash("  foo") != line_hash("foo")


@verifies(SWR.SWR_1814)
def test_all_anchors_are_base62_and_four_chars() -> None:
    anchors = [line_hash(value) for value in ["a", "b", "c", "123", "Ω"]]
    assert all(len(anchor) == ANCHOR_LENGTH for anchor in anchors)
    assert all(set(anchor) <= set(BASE62_CHARS) for anchor in anchors)


@verifies(SWR.SWR_1814)
def test_file_hashes_matches_input_length() -> None:
    lines = ["a", "b", "c", "d"]
    assert len(file_hashes(lines)) == len(lines)


# ── snapshot_id ──────────────────────────────────────────────────────


@verifies(SWR.SWR_1815)
def test_snapshot_id_empty_file_is_sentinel() -> None:
    assert snapshot_id(b"") == "empty"


@verifies(SWR.SWR_1815)
def test_snapshot_id_is_deterministic_and_content_derived() -> None:
    assert snapshot_id(b"hello\n") == snapshot_id(b"hello\n")
    assert snapshot_id(b"hello\n") != snapshot_id(b"world\n")
    # 16 hex chars from xxh64
    assert len(snapshot_id(b"hello\n")) == 16


@verifies(SWR.SWR_1815)
def test_snapshot_id_changes_with_any_byte() -> None:
    a = snapshot_id(b"def foo():\n    pass\n")
    b = snapshot_id(b"def foo():\n    pass\n ")  # trailing space
    assert a != b


# ── context_hash_for_position ─────────────────────────────────────────


@verifies(SWR.SWR_1816)
def test_context_hash_returns_bof_sentinel_above_first_line() -> None:
    lines = ["alpha", "beta"]
    assert context_hash_for_position(lines, -1, side="before") == BOF_SENTINEL


@verifies(SWR.SWR_1816)
def test_context_hash_returns_eof_sentinel_past_last_line() -> None:
    lines = ["alpha", "beta"]
    assert context_hash_for_position(lines, 2, side="after") == EOF_SENTINEL


@verifies(SWR.SWR_1816)
def test_context_hash_in_range_is_deterministic_hex() -> None:
    lines = ["alpha", "beta", "gamma"]
    h = context_hash_for_position(lines, 1, side="before")
    assert h == context_hash_for_position(lines, 1, side="before")
    assert all(c in "0123456789abcdef" for c in h)
    assert len(h) == 16


@verifies(SWR.SWR_1816)
def test_context_hash_changes_per_line_content() -> None:
    a = context_hash_for_position(["alpha"], 0, side="before")
    b = context_hash_for_position(["beta"], 0, side="before")
    assert a != b
