"""Productive use: a reader of a model's answer sees the Markdown the model wrote.
Expected outcome: stripping model-internal markup leaves the text's own structure —
list nesting and code indentation — intact."""

from __future__ import annotations

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.sdk_text import sanitize_visible_text


@verifies(SWR.SWR_647, SWR.SWR_1217)
def test_sanitize_visible_text_keeps_nested_list_indentation() -> None:
    text = "Steps:\n\n- outer\n  - inner\n"

    assert sanitize_visible_text(text) == text


@verifies(SWR.SWR_647, SWR.SWR_1217)
def test_sanitize_visible_text_keeps_code_block_indentation() -> None:
    text = "```python\ndef f():\n    return 1\n```\n"

    assert sanitize_visible_text(text) == text


@verifies(SWR.SWR_647)
def test_sanitize_visible_text_still_closes_the_gap_markup_removal_leaves() -> None:
    text = "I found the styling files. <|channel>call:todo{operation:add}<tool_call|> here"

    cleaned = sanitize_visible_text(text)

    assert "channel" not in cleaned
    assert "  " not in cleaned


@verifies(SWR.SWR_647)
def test_sanitize_visible_text_still_drops_trailing_space_before_a_newline() -> None:
    assert sanitize_visible_text("line one   \nline two") == "line one\nline two"
