from __future__ import annotations

from types import SimpleNamespace

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tui.streaming import extract_reasoning_text, extract_stream_text


@verifies(SWR.SWR_642, SWR.SWR_1232)
def test_extract_stream_text_reads_plain_string_chunk() -> None:
    text, has_reasoning = extract_stream_text("hello")

    assert text == "hello"
    assert has_reasoning is False


@verifies(SWR.SWR_642)
def test_extract_stream_text_reads_content_delta_from_chunk_object() -> None:
    chunk = SimpleNamespace(
        choices=[
            SimpleNamespace(
                delta=SimpleNamespace(content="hello "),
            ),
            SimpleNamespace(
                delta=SimpleNamespace(content="world"),
            ),
        ],
    )

    text, has_reasoning = extract_stream_text(chunk)

    assert text == "hello world"
    assert has_reasoning is False


@verifies(SWR.SWR_550, SWR.SWR_642)
def test_extract_stream_text_preserves_line_breaks_for_structured_content_blocks() -> None:
    chunk = SimpleNamespace(
        choices=[
            SimpleNamespace(
                delta=SimpleNamespace(
                    content=[
                        SimpleNamespace(text="First paragraph"),
                        SimpleNamespace(text="Second paragraph"),
                        SimpleNamespace(text="- item A\n- item B"),
                    ],
                ),
            ),
        ],
    )

    text, has_reasoning = extract_stream_text(chunk)

    assert text == "First paragraph\nSecond paragraph\n- item A\n- item B"
    assert has_reasoning is False


@verifies(SWR.SWR_1217, SWR.SWR_550)
def test_extract_stream_text_keeps_a_blank_line_delta_between_markdown_blocks() -> None:
    """A provider streams the blank line after a heading as a delta of its own;
    dropping it makes the next paragraph part of the heading."""
    deltas = ["## Classification", "\n\n", "TYPE D — a scope decision."]

    streamed = "".join(
        extract_stream_text(
            SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content=delta))])
        )[0]
        for delta in deltas
    )

    assert streamed == "## Classification\n\nTYPE D — a scope decision."


@verifies(SWR.SWR_1217)
def test_extract_stream_text_keeps_a_space_only_delta_between_words() -> None:
    chunk = SimpleNamespace(
        choices=[SimpleNamespace(delta=SimpleNamespace(content=" "))],
    )

    text, has_reasoning = extract_stream_text(chunk)

    assert text == " "
    assert has_reasoning is False


@verifies(SWR.SWR_1012)
def test_extract_stream_text_detects_reasoning_without_exposing_it() -> None:
    chunk = SimpleNamespace(
        choices=[
            SimpleNamespace(
                delta=SimpleNamespace(reasoning_content="private reasoning"),
            ),
        ],
    )

    text, has_reasoning = extract_stream_text(chunk)

    assert text == ""
    assert has_reasoning is True


@verifies(SWR.SWR_642, SWR.SWR_646)
def test_extract_stream_text_suppresses_pure_internal_markup() -> None:
    chunk = SimpleNamespace(
        choices=[
            SimpleNamespace(delta=SimpleNamespace(content="<|im_start|>")),
            SimpleNamespace(delta=SimpleNamespace(content="<|im_end|>")),
        ],
    )

    text, has_reasoning = extract_stream_text(chunk)

    assert text == ""
    assert has_reasoning is True


@verifies(SWR.SWR_550, SWR.SWR_642)
def test_extract_stream_text_keeps_mixed_content_when_marker_and_text_share_chunk() -> None:
    chunk = SimpleNamespace(
        choices=[
            SimpleNamespace(
                delta=SimpleNamespace(content="Found the issue after  ground reading app.py"),
            ),
        ],
    )

    text, has_reasoning = extract_stream_text(chunk)

    assert text == "Found the issue after ground reading app.py"
    assert has_reasoning is False


@verifies(SWR.SWR_642, SWR.SWR_646)
def test_extract_stream_text_strips_raw_tool_call_tail_from_mixed_content() -> None:
    chunk = SimpleNamespace(
        choices=[
            SimpleNamespace(
                delta=SimpleNamespace(
                    content=(
                        "I found the styling files. "
                        '<|channel>call:todo{operation:<|">add_phase<|">}<tool_call|>'
                    ),
                ),
            ),
        ],
    )

    text, has_reasoning = extract_stream_text(chunk)

    assert text == "I found the styling files."
    assert has_reasoning is False


@verifies(SWR.SWR_1012)
def test_extract_stream_text_suppresses_internal_tool_schema_deliberation() -> None:
    chunk = SimpleNamespace(
        choices=[
            SimpleNamespace(
                delta=SimpleNamespace(
                    content=(
                        "The blocker is that I have been failing to provide the required "
                        "`operation` field in my `write_file` calls. The tool documentation "
                        "specifies that each edit must include `operation`, so I will use "
                        "`replace`."
                    ),
                ),
            ),
        ],
    )

    text, has_reasoning = extract_stream_text(chunk)

    assert text == ""
    assert has_reasoning is True


@verifies(SWR.SWR_647, SWR.SWR_648)
def test_extract_stream_text_suppresses_plain_raw_tool_call_text() -> None:
    chunk = SimpleNamespace(
        choices=[
            SimpleNamespace(
                delta=SimpleNamespace(
                    content=(
                        'call:terminal{command:grep -r "\\$theme-" '
                        "src/rotaris_core/tui/styles/app.tcss | head -n 20,security_risk:LOW,"
                        "summary:List theme variables to find suitable focus color.}"
                    ),
                ),
            ),
        ],
    )

    text, has_reasoning = extract_stream_text(chunk)

    assert text == ""
    assert has_reasoning is True


@verifies(SWR.SWR_641, SWR.SWR_1012)
def test_extract_reasoning_text_returns_empty_for_plain_string() -> None:
    assert extract_reasoning_text("hello") == ""


@verifies(SWR.SWR_641, SWR.SWR_1012)
def test_extract_reasoning_text_extracts_reasoning_content() -> None:
    chunk = SimpleNamespace(
        choices=[
            SimpleNamespace(
                delta=SimpleNamespace(reasoning_content="step 1: analyze"),
            ),
        ],
    )

    assert extract_reasoning_text(chunk) == "step 1: analyze"


@verifies(SWR.SWR_641, SWR.SWR_1012)
def test_extract_reasoning_text_extracts_reasoning_field() -> None:
    chunk = SimpleNamespace(
        choices=[
            SimpleNamespace(
                delta=SimpleNamespace(reasoning="let me think about this"),
            ),
        ],
    )

    assert extract_reasoning_text(chunk) == "let me think about this"


@verifies(SWR.SWR_641, SWR.SWR_1012)
def test_extract_reasoning_text_extracts_thinking_blocks() -> None:
    chunk = SimpleNamespace(
        choices=[
            SimpleNamespace(
                delta=SimpleNamespace(
                    thinking_blocks=[
                        SimpleNamespace(thinking="block one"),
                        SimpleNamespace(thinking="block two"),
                    ],
                ),
            ),
        ],
    )

    assert extract_reasoning_text(chunk) == "block oneblock two"


@verifies(SWR.SWR_641, SWR.SWR_1012)
def test_extract_reasoning_text_extracts_reasoning_items() -> None:
    chunk = SimpleNamespace(
        choices=[
            SimpleNamespace(
                delta=SimpleNamespace(
                    reasoning_items=[
                        SimpleNamespace(text="item A"),
                        SimpleNamespace(text="item B"),
                    ],
                ),
            ),
        ],
    )

    assert extract_reasoning_text(chunk) == "item Aitem B"


@verifies(SWR.SWR_641)
def test_extract_reasoning_text_returns_empty_for_content_only_chunk() -> None:
    chunk = SimpleNamespace(
        choices=[
            SimpleNamespace(
                delta=SimpleNamespace(content="visible text"),
            ),
        ],
    )

    assert extract_reasoning_text(chunk) == ""
