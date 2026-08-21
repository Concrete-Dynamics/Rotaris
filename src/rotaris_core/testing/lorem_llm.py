"""Scriptable deterministic mock LLM producing lorem markdown, thinking, tool calls.

A turn is a list of parts (:func:`text`, :func:`thinking`, :func:`tool_call`).
An explicit script controls structure; the seed fills content. Presets provide
infinite deterministic streams when structure does not matter.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.testing.lorem import LoremMarkdownGenerator

if TYPE_CHECKING:
    from openhands.sdk.llm.message import Message


class LoremScriptExhaustedError(RuntimeError):
    """Raised when .completion() is called past the end of the script."""


@dataclass(frozen=True)
class TextPart:
    words: int = 120


@dataclass(frozen=True)
class ThinkingPart:
    words: int = 40


@dataclass(frozen=True)
class ToolCallPart:
    name: str
    args: dict[str, Any] | None = None


Part = TextPart | ThinkingPart | ToolCallPart
Turn = list[Part]


def text(words: int = 120) -> TextPart:
    return TextPart(words=words)


def thinking(words: int = 40) -> ThinkingPart:
    return ThinkingPart(words=words)


def tool_call(name: str, args: dict[str, Any] | None = None) -> ToolCallPart:
    return ToolCallPart(name=name, args=args)


class LoremLLMResponse:
    def __init__(self, message: Message) -> None:
        self.message = message


@traces(SWR.SWR_1285)
class LoremLLM:
    def __init__(self, script: list[Turn] | None = None, seed: int = 0) -> None:
        if script is not None:
            for turn in script:
                for part in turn:
                    if not isinstance(part, TextPart | ThinkingPart | ToolCallPart):
                        raise TypeError(f"invalid turn part: {part!r}")
        self._script = list(script) if script is not None else None
        self._cursor = 0
        self._gen = LoremMarkdownGenerator(seed)
        self._call_index = 0
        self._preset_name: str | None = None
        self.calls: list[Any] = []

    _TOOL_NAMES = ("bash", "grep", "read_file", "haet_edit", "delegate")

    @classmethod
    def _preset(cls, seed: int, preset_name: str) -> LoremLLM:
        llm = cls(script=None, seed=seed)
        llm._preset_name = preset_name
        return llm

    @classmethod
    def chatty(cls, seed: int = 0) -> LoremLLM:
        return cls._preset(seed, "chatty")

    @classmethod
    def terse(cls, seed: int = 0) -> LoremLLM:
        return cls._preset(seed, "terse")

    @classmethod
    def tool_heavy(cls, seed: int = 0) -> LoremLLM:
        return cls._preset(seed, "tool_heavy")

    @classmethod
    def mixed(cls, seed: int = 0) -> LoremLLM:
        return cls._preset(seed, "mixed")

    def _pick_tool(self, r: float) -> str:
        return self._TOOL_NAMES[int(r * len(self._TOOL_NAMES)) % len(self._TOOL_NAMES)]

    def _next_turn(self) -> Turn:
        if self._script is None:
            return self._preset_turn()
        if self._cursor >= len(self._script):
            raise LoremScriptExhaustedError(f"script has only {len(self._script)} turn(s)")
        turn = self._script[self._cursor]
        self._cursor += 1
        return turn

    def _preset_turn(self) -> Turn:
        if self._preset_name is None:
            raise LoremScriptExhaustedError("no script and no preset configured")
        r = self._gen._rand()
        if self._preset_name == "chatty":
            return [text(words=250 + int(r * 200))]
        if self._preset_name == "terse":
            return [text(words=8 + int(r * 20))]
        if self._preset_name == "tool_heavy":
            return [thinking(words=30), tool_call(self._pick_tool(r)), text(words=40)]
        # mixed
        if r < 0.3:
            return [text(words=15 + int(r * 100))]
        if r < 0.6:
            return [
                thinking(words=25),
                tool_call(self._pick_tool(r)),
                text(words=60 + int(r * 100)),
            ]
        return [text(words=150 + int(r * 400))]

    def completion(self, messages: Any, **kwargs: Any) -> LoremLLMResponse:
        self.calls.append(messages)
        return LoremLLMResponse(self._render(self._next_turn()))

    def next_turn_text(self) -> str:
        turn = self._next_turn()
        return "\n\n".join(
            self._gen.markdown(words=p.words) for p in turn if isinstance(p, TextPart)
        )

    def _render(self, turn: Turn) -> Message:
        from openhands.sdk.llm.message import Message, MessageToolCall, TextContent

        content: list[TextContent] = []
        reasoning: list[str] = []
        calls: list[MessageToolCall] = []
        for part in turn:
            if isinstance(part, TextPart):
                content.append(TextContent(text=self._gen.markdown(words=part.words)))
            elif isinstance(part, ThinkingPart):
                reasoning.append(self._gen.paragraph(sentences=max(1, part.words // 10)))
            else:
                args = (
                    part.args
                    if part.args is not None
                    else {
                        "input": self._gen.words(4),
                        "path": f"src/{self._gen.words(1)}.py",
                    }
                )
                self._call_index += 1
                calls.append(
                    MessageToolCall(
                        id=f"lorem-call-{self._call_index}",
                        name=part.name,
                        arguments=json.dumps(args),
                        origin="completion",
                    )
                )
        return Message(
            role="assistant",
            content=content,
            reasoning_content=" ".join(reasoning) if reasoning else None,
            tool_calls=calls or None,
        )
