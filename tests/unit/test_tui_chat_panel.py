from __future__ import annotations

from unittest.mock import patch

from rich.text import Text
from textual.app import App, ComposeResult
from textual.geometry import Offset
from textual.selection import Selection
from textual.strip import Strip

from rotaris_core.config.schema import RotarisConfig
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tui.transcript_renderer import (
    RenderedBlock,
    TranscriptBlock,
    TranscriptBlockKey,
    TranscriptRenderStore,
    fingerprint_event,
)
from rotaris_core.tui.widgets.chat_panel import ChatPanel


class _PanelApp(App[None]):
    def compose(self) -> ComposeResult:
        yield ChatPanel(id="chat")


class _UnqueuePanelApp(_PanelApp):
    def __init__(self) -> None:
        super().__init__()
        self.unqueued_prompt_id: str | None = None

    def unqueue_prompt(self, prompt_id: str) -> None:
        self.unqueued_prompt_id = prompt_id


def _panel(app: App[None]) -> ChatPanel:
    return app.query_one("#chat", ChatPanel)


@verifies(SWR.SWR_1280)
def test_transcript_event_fingerprint_tracks_render_affecting_fields() -> None:
    mode = {"show_reasoning": False, "tool_result_max_lines": 10}
    event = {"role": "agent", "name": "agent", "content": "**hello**"}

    base = fingerprint_event(event, hide_header=False, mode=mode)

    assert fingerprint_event({**event, "content": "**bye**"}, hide_header=False, mode=mode) != base
    assert fingerprint_event(event, hide_header=True, mode=mode) != base
    assert (
        fingerprint_event(
            event,
            hide_header=False,
            mode={**mode, "show_reasoning": True},
        )
        != base
    )


def _store_with_one_block() -> tuple[TranscriptRenderStore, TranscriptBlock]:
    store = TranscriptRenderStore()
    block = TranscriptBlock(
        index=0,
        event={"role": "agent", "name": "agent", "content": "wrapped message"},
        hide_header=False,
        key=TranscriptBlockKey(
            identity="agent:agent:1",
            fingerprint="fingerprint",
            theme="theme",
        ),
        estimated_height=1,
    )
    store.set_blocks([block])
    return store, block


@verifies(SWR.SWR_1280)
def test_rendered_blocks_are_cached_per_rendered_width() -> None:
    """The user reads whole words after the transcript pane settles to its width.

    The pane first renders with the width available before layout settles, which
    is wider than the width it finally gets once the scrollbar and neighbouring
    panes settle. Serving that wider render for a narrower pane crops the
    overflow, silently eating the characters at each wrap boundary.
    """
    store, block = _store_with_one_block()
    rendered_widths: list[int] = []

    def _render(_block: TranscriptBlock, width: int) -> RenderedBlock:
        rendered_widths.append(width)
        return RenderedBlock(strips=[Strip.blank(width)], reasoning_line_offsets=set())

    store.render_block(block, 48, _render)
    narrowed = store.render_block(block, 46, _render)

    assert rendered_widths == [48, 46]
    assert narrowed.strips[0].cell_length == 46

    # The narrower render is cached too: settling on a width must not re-wrap
    # the whole transcript on every line request.
    store.render_block(block, 46, _render)
    assert rendered_widths == [48, 46]


@verifies(SWR.SWR_1280, SWR.SWR_1282)
def test_replacing_blocks_keeps_renders_for_the_width_in_use() -> None:
    """Appending a transcript event must not throw away the visible renders.

    Blocks are rebuilt on every transcript update, so the cache must keep the
    renders whose block content is still on screen, at every width it holds.
    """
    store, block = _store_with_one_block()

    def _render(_block: TranscriptBlock, width: int) -> RenderedBlock:
        return RenderedBlock(strips=[Strip.blank(width)], reasoning_line_offsets=set())

    store.render_block(block, 46, _render)
    calls_before = store.render_call_count

    store.set_blocks([block])
    store.render_block(block, 46, _render)

    assert store.render_call_count == calls_before


@verifies(SWR.SWR_1279)
async def test_virtual_transcript_renders_bounded_visible_blocks() -> None:
    app = _PanelApp()
    async with app.run_test(size=(100, 24)) as pilot:
        await pilot.pause()
        panel = _panel(app)
        events = [
            {
                "role": "agent",
                "name": "agent",
                "content": f"## Heading {index}\n\nThis is **markdown** content.",
            }
            for index in range(500)
        ]

        panel.set_transcript(
            events,
            placeholder_stream_agents=set(),
            live_stream_messages={},
            queued_prompts=[],
            focused_agent_id=None,
            show_reasoning=False,
            show_tool_events=True,
            show_tool_inputs=True,
            tool_result_max_lines=10,
            tool_input_max_lines=2,
        )
        await pilot.pause()

        assert panel._virtual_transcript.render_call_count < 80
        assert panel._virtual_transcript.cache_block_count <= 300
        assert panel._virtual_transcript.cache_row_count <= 10_000
        assert len(panel.lines) <= 240


@verifies(SWR.SWR_1279)
async def test_virtual_transcript_append_renders_only_new_visible_window() -> None:
    app = _PanelApp()
    async with app.run_test(size=(100, 24)) as pilot:
        await pilot.pause()
        panel = _panel(app)
        events = [
            {"role": "agent", "name": "agent", "content": f"message {index}"}
            for index in range(300)
        ]
        panel.set_transcript(
            events,
            placeholder_stream_agents=set(),
            live_stream_messages={},
            queued_prompts=[],
            focused_agent_id=None,
            show_reasoning=False,
            show_tool_events=True,
            show_tool_inputs=True,
            tool_result_max_lines=10,
            tool_input_max_lines=2,
        )
        calls_before = panel._virtual_transcript.render_call_count

        events.append({"role": "agent", "name": "agent", "content": "new tail"})
        panel.set_transcript(
            events,
            placeholder_stream_agents=set(),
            live_stream_messages={},
            queued_prompts=[],
            focused_agent_id=None,
            show_reasoning=False,
            show_tool_events=True,
            show_tool_inputs=True,
            tool_result_max_lines=10,
            tool_input_max_lines=2,
        )
        await pilot.pause()

        assert panel._virtual_transcript.render_call_count - calls_before < 40


@verifies(SWR.SWR_1283)
async def test_virtual_transcript_preserves_paused_scroll_anchor_on_prepend() -> None:
    app = _PanelApp()
    async with app.run_test(size=(100, 24)) as pilot:
        await pilot.pause()
        panel = _panel(app)
        events = [
            {"role": "agent", "name": "agent", "content": f"message {index}"} for index in range(30)
        ]
        panel.set_transcript(
            events,
            placeholder_stream_agents=set(),
            live_stream_messages={},
            queued_prompts=[],
            focused_agent_id=None,
            show_reasoning=False,
            show_tool_events=True,
            show_tool_inputs=True,
            tool_result_max_lines=10,
            tool_input_max_lines=2,
        )
        target_index = 10
        panel._following = False
        panel.scroll_y = panel._virtual_transcript.start_for_block(target_index)
        before = panel._virtual_transcript.line_to_block(int(panel.scroll_y))
        assert before is not None
        before_block, _ = before

        panel.set_transcript(
            [{"role": "system", "content": "older"}] + events,
            placeholder_stream_agents=set(),
            live_stream_messages={},
            queued_prompts=[],
            focused_agent_id=None,
            show_reasoning=False,
            show_tool_events=True,
            show_tool_inputs=True,
            tool_result_max_lines=10,
            tool_input_max_lines=2,
        )
        await pilot.pause()

        mapped = panel._virtual_transcript.line_to_block(int(panel.scroll_y))
        assert mapped is not None
        block, _ = mapped
        assert block.event is before_block.event


@verifies(SWR.SWR_1283)
async def test_virtual_transcript_suppresses_replayed_thinking_events() -> None:
    app = _PanelApp()
    async with app.run_test(size=(100, 24)) as pilot:
        await pilot.pause()
        panel = _panel(app)
        events = [
            {"role": "user", "content": "Explain the codebase"},
            {"role": "thinking", "name": "orchestrator", "content": "Inspect docs first."},
            {"role": "thinking", "name": "orchestrator", "content": "Inspect docs first."},
            {"role": "agent", "name": "orchestrator", "content": "I will inspect the docs."},
            {"role": "thinking", "name": "orchestrator", "content": "Inspect docs first."},
            {"role": "tool", "name": "orchestrator", "content": "read_file"},
            {"role": "thinking", "name": "orchestrator", "content": "Now synthesize."},
            {"role": "thinking", "name": "orchestrator", "content": "Now synthesize."},
        ]
        panel.set_transcript(
            events,
            placeholder_stream_agents=set(),
            live_stream_messages={},
            queued_prompts=[],
            focused_agent_id=None,
            show_reasoning=False,
            show_tool_events=True,
            show_tool_inputs=True,
            tool_result_max_lines=10,
            tool_input_max_lines=2,
        )
        await pilot.pause()

        thinking_blocks = [
            block
            for block in panel._virtual_transcript.blocks
            if block.event.get("role") == "thinking"
        ]
        assert [block.event["content"] for block in thinking_blocks] == [
            "Inspect docs first.",
            "Now synthesize.",
        ]


@verifies(SWR.SWR_1418, SWR.SWR_713)
async def test_get_selection_returns_text_for_valid_range() -> None:
    app = _PanelApp()
    async with app.run_test(size=(80, 24)) as pilot:
        await pilot.pause()
        panel = _panel(app)
        panel.write(Text("first line"))
        panel.write(Text("second line"))
        await pilot.pause()

        sel = Selection(start=Offset(0, 0), end=Offset(5, 0))
        result = panel.get_selection(sel)
        assert result is not None
        assert result[0] == "first"


@verifies(SWR.SWR_1418, SWR.SWR_713)
async def test_get_selection_spans_multiple_lines() -> None:
    app = _PanelApp()
    async with app.run_test(size=(80, 24)) as pilot:
        await pilot.pause()
        panel = _panel(app)
        panel.write(Text("alpha"))
        panel.write(Text("beta"))
        panel.write(Text("gamma"))
        await pilot.pause()

        sel = Selection(start=Offset(2, 0), end=Offset(3, 2))
        result = panel.get_selection(sel)
        assert result is not None
        assert result[0] == "pha\nbeta\ngam"


@verifies(SWR.SWR_1418, SWR.SWR_713)
async def test_get_selection_returns_none_when_empty() -> None:
    app = _PanelApp()
    async with app.run_test(size=(80, 24)) as pilot:
        await pilot.pause()
        panel = _panel(app)
        sel = Selection(start=Offset(0, 0), end=Offset(0, 0))
        result = panel.get_selection(sel)
        assert result is None


@verifies(SWR.SWR_1418, SWR.SWR_712)
async def test_write_injects_click_meta_for_urls_in_text() -> None:
    app = _PanelApp()
    async with app.run_test(size=(80, 24)) as pilot:
        await pilot.pause()
        panel = _panel(app)
        panel.write(Text("Go to https://example.com/test now"))
        await pilot.pause()

        found = False
        for strip in panel.lines:
            for seg in strip._segments:
                if (
                    seg.style
                    and seg.style._meta
                    and "@click" in seg.style.meta
                    and "example.com" in seg.style.meta["@click"]
                ):
                    found = True
                    break
        assert found, "Expected @click meta on URL segment"


@verifies(SWR.SWR_1418, SWR.SWR_712)
async def test_write_preserves_non_url_text_without_click_meta() -> None:
    app = _PanelApp()
    async with app.run_test(size=(80, 24)) as pilot:
        await pilot.pause()
        panel = _panel(app)
        panel.write(Text("Just plain text here"))
        await pilot.pause()

        for strip in panel.lines:
            for seg in strip._segments:
                if seg.style and seg.style._meta:
                    assert "@click" not in seg.style.meta


@verifies(SWR.SWR_1418, SWR.SWR_712)
async def test_action_link_opens_browser() -> None:
    app = _PanelApp()
    async with app.run_test(size=(80, 24)) as pilot:
        await pilot.pause()
        panel = _panel(app)
        with patch("rotaris_core.tui.widgets.chat_panel.webbrowser.open") as mock_open:
            panel.action_link("https://github.com/test")
            mock_open.assert_called_once_with("https://github.com/test")


@verifies(SWR.SWR_1418)
async def test_action_link_uses_system_opener_when_webbrowser_declines() -> None:
    app = _PanelApp()
    async with app.run_test(size=(80, 24)) as pilot:
        await pilot.pause()
        panel = _panel(app)
        with (
            patch("rotaris_core.tui.widgets.chat_panel.webbrowser.open", return_value=False),
            patch(
                "rotaris_core.tui.widgets.chat_panel.shutil.which",
                return_value="/usr/bin/xdg-open",
            ),
            patch("rotaris_core.tui.widgets.chat_panel.subprocess.Popen") as mock_popen,
        ):
            panel.action_link("https://github.com/test")

        mock_popen.assert_called_once()
        assert mock_popen.call_args.args[0] == ["/usr/bin/xdg-open", "https://github.com/test"]


@verifies(SWR.SWR_1418)
async def test_action_link_ignores_non_http() -> None:
    app = _PanelApp()
    async with app.run_test(size=(80, 24)) as pilot:
        await pilot.pause()
        panel = _panel(app)
        with patch("rotaris_core.tui.widgets.chat_panel.webbrowser.open") as mock_open:
            panel.action_link("ftp://example.com")
            mock_open.assert_not_called()


@verifies(SWR.SWR_1418)
async def test_render_line_includes_offset_metadata() -> None:
    app = _PanelApp()
    async with app.run_test(size=(80, 24)) as pilot:
        await pilot.pause()
        panel = _panel(app)
        panel.write(Text("test content"))
        await pilot.pause()

        strip = panel._render_line(0, 0, 80)
        has_offset = False
        for seg in strip._segments:
            if seg.style and seg.style._meta and "offset" in seg.style.meta:
                has_offset = True
                assert seg.style.meta["offset"][1] == 0
                break
        assert has_offset, "Expected offset metadata in rendered strip"


@verifies(SWR.SWR_1418)
async def test_url_trailing_punctuation_stripped() -> None:
    app = _PanelApp()
    async with app.run_test(size=(80, 24)) as pilot:
        await pilot.pause()
        panel = _panel(app)
        panel.write(Text("See https://example.com/path."))
        await pilot.pause()

        for strip in panel.lines:
            for seg in strip._segments:
                if seg.style and seg.style.link:
                    assert seg.style.link == "https://example.com/path"
                    return
        raise AssertionError("Expected a link segment")


@verifies(SWR.SWR_1235, SWR.SWR_1237, SWR.SWR_1238)
async def test_add_diff_block_renders_header_lines_and_truncation() -> None:
    app = _PanelApp()
    async with app.run_test(size=(80, 24)) as pilot:
        await pilot.pause()
        panel = _panel(app)
        panel.add_diff_block(
            {
                "path": "src/sample.py",
                "operation": "edit",
                "created": True,
                "added_lines": 2,
                "removed_lines": 1,
                "entries": [
                    {"kind": "delete", "line_number": 2, "text": "old value"},
                    {"kind": "add", "line_number": 2, "text": "new value"},
                    {"kind": "context", "line_number": 3, "text": "unchanged"},
                ],
                "truncated": True,
                "remaining_changed_lines": 4,
            },
        )
        await pilot.pause()

        rendered_lines = [strip.text for strip in panel.lines]
        assert any("@ src/sample.py @ [Created] +2 -1" in line for line in rendered_lines)
        assert any("[2]- old value" in line for line in rendered_lines)
        assert any("[2]+ new value" in line for line in rendered_lines)
        assert any("[3]  unchanged" in line for line in rendered_lines)
        assert any("... +4 more lines, diff truncated" in line for line in rendered_lines)


@verifies(SWR.SWR_1005)
async def test_add_queued_section_renders_unqueue_click_target() -> None:
    from rotaris_core.core.prompt_types import QueuedPrompt

    app = _PanelApp()
    async with app.run_test(size=(80, 24)) as pilot:
        await pilot.pause()
        panel = _panel(app)
        prompt = QueuedPrompt(content="finish the follow-up", context_snapshot={}, id="prompt-1234")
        panel.add_queued_section([prompt])
        await pilot.pause()

        rendered_lines = [strip.text for strip in panel.lines]
        assert any("queued for next iteration (1)" in line for line in rendered_lines)
        assert any("[unqueue]" in line for line in rendered_lines)
        assert any("finish the follow-up" in line for line in rendered_lines)

        found = False
        for strip in panel.lines:
            for seg in strip._segments:
                if (
                    seg.style
                    and seg.style._meta
                    and seg.style.meta.get("@click") == "unqueue_prompt('prompt-1234')"
                ):
                    found = True
                    break
        assert found, "Expected clickable unqueue action on queued prompt"


@verifies(SWR.SWR_1005)
async def test_action_unqueue_prompt_delegates_to_app() -> None:
    app = _UnqueuePanelApp()
    async with app.run_test(size=(80, 24)) as pilot:
        await pilot.pause()
        panel = _panel(app)
        panel.action_unqueue_prompt("prompt-1234")

        assert app.unqueued_prompt_id == "prompt-1234"


# ---------------------------------------------------------------------------
# _prepare_streaming_markdown — sanitization unit tests
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1217)
def test_prepare_streaming_markdown_strips_bare_protocol_urls() -> None:
    from rotaris_core.tui.widgets.chat_panel import _prepare_streaming_markdown

    # Trailing bare protocol-only URL at end-of-string.
    assert _prepare_streaming_markdown("**Source:***https://") == "**Source:***"

    # Bare protocol before whitespace / newline.
    sanitized = _prepare_streaming_markdown("Details: https:// next line")
    assert "https://" not in sanitized
    assert "Details:  next line" in sanitized

    # Bare protocol at end of line.
    sanitized = _prepare_streaming_markdown("See http://\nMore text")
    assert "http://" not in sanitized
    assert "See \nMore text" in sanitized

    # Bare protocol before a markdown italic asterisk.
    sanitized = _prepare_streaming_markdown("Link: https://*italic*")
    assert "https://" not in sanitized
    assert "Link: *italic*" in sanitized

    # Bare protocol before closing parenthesis.
    sanitized = _prepare_streaming_markdown("(url: ftp://)")
    assert "ftp://" not in sanitized
    assert sanitized == "(url: )"


@verifies(SWR.SWR_1217)
def test_prepare_streaming_markdown_preserves_valid_and_non_url_text() -> None:
    from rotaris_core.tui.widgets.chat_panel import _prepare_streaming_markdown

    # Intact URL with host must be preserved.
    result = _prepare_streaming_markdown("Visit https://example.com/page for docs")
    assert "https://example.com/page" in result

    # Empty string unchanged.
    assert _prepare_streaming_markdown("") == ""

    # Plain text without URLs unchanged.
    plain = "Some **bold** text with `code` and - list items"
    assert _prepare_streaming_markdown(plain) == plain

    # Unclosed code fence is closed (existing behavior preserved).
    result = _prepare_streaming_markdown("```python\nprint(1)")
    assert result.endswith("\n```")

    # Balanced code fences are not modified.
    balanced = "```python\nprint(1)\n```"
    assert _prepare_streaming_markdown(balanced) == balanced


@verifies(SWR.SWR_1217)
def test_prepare_streaming_markdown_handles_crash_input_from_session() -> None:
    """The exact crash input from session 6c9f21836072 must no longer crash."""
    from rotaris_core.tui.widgets.chat_panel import _prepare_streaming_markdown

    # This is the stream content that crashed mdurl.parse("https://").
    crash_text = (
        "I now have all the evidence needed. Here is my report:\n\n"
        "---\n\n## Findings###1. Carbon styles are NOT auto-bundled"
        " — consumer MUST import them**Source:***https://"
    )
    sanitized = _prepare_streaming_markdown(crash_text)

    # The bare protocol must be gone.
    assert "https://" not in sanitized
    # Markdown structural elements preserved.
    assert "## Findings" in sanitized


@verifies(SWR.SWR_1087)
async def test_tool_result_truncation_is_render_only_and_keeps_source_events_intact() -> None:
    """Productive use: a capped tool result on screen still reaches the model in full.
    Expected outcome: the panel truncates its render while the transcript event keeps every line."""
    app = _PanelApp()
    config = RotarisConfig()
    config.display.tool_result_max_lines = 5
    app.config = config  # type: ignore[attr-defined]
    full_content = "\n".join(f"result line {index}" for index in range(40))
    events = [
        {
            "role": "tool",
            "icon": "ok",
            "phase": "succeeded",
            "content": full_content,
        }
    ]

    async with app.run_test(size=(100, 24)) as pilot:
        await pilot.pause()
        panel = _panel(app)

        panel.set_transcript(
            events,
            placeholder_stream_agents=set(),
            live_stream_messages={},
            queued_prompts=[],
            focused_agent_id=None,
            show_reasoning=False,
            show_tool_events=True,
            show_tool_inputs=True,
            tool_result_max_lines=5,
            tool_input_max_lines=2,
        )
        await pilot.pause()

        rendered = "\n".join(line.text for line in panel.lines)

    assert "result line 0" in rendered
    assert "result line 39" not in rendered
    assert "tool result truncated" in rendered
    assert events[0]["content"] == full_content
