"""Deterministic lorem-ipsum markdown generation for tests and demo data.

All randomness flows through ``Random.random()`` only — Python guarantees
cross-version stability for ``random()`` but not for ``choice``/``randint``.
"""

from __future__ import annotations

from dataclasses import dataclass
from random import Random

from rotaris_core.reqtocode import SWR, traces

_WORDS: tuple[str, ...] = (
    "lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing", "elit",
    "sed", "do", "eiusmod", "tempor", "incididunt", "ut", "labore", "et", "dolore",
    "magna", "aliqua", "enim", "ad", "minim", "veniam", "quis", "nostrud",
    "exercitation", "ullamco", "laboris", "nisi", "aliquip", "ex", "ea", "commodo",
    "consequat", "duis", "aute", "irure", "in", "reprehenderit", "voluptate",
    "velit", "esse", "cillum", "eu", "fugiat", "nulla", "pariatur", "excepteur",
    "sint", "occaecat", "cupidatat", "non", "proident", "sunt", "culpa", "qui",
    "officia", "deserunt", "mollit", "anim", "id", "est", "laborum",
)  # fmt: skip


@dataclass(frozen=True)
class MarkdownProfile:
    """Probabilities for markdown block and inline elements."""

    heading: float = 0.08
    code_block: float = 0.07
    bullet_list: float = 0.10
    numbered_list: float = 0.05
    inline_code: float = 0.06
    bold: float = 0.05
    italic: float = 0.04
    link: float = 0.02


@traces(SWR.SWR_1285)
class LoremMarkdownGenerator:
    def __init__(self, seed: int, profile: MarkdownProfile | None = None) -> None:
        self._random = Random(seed)
        self._profile = profile or MarkdownProfile()

    def _rand(self) -> float:
        return self._random.random()

    def _pick(self, items: tuple[str, ...]) -> str:
        return items[int(self._rand() * len(items)) % len(items)]

    def _int_between(self, low: int, high: int) -> int:
        return low + int(self._rand() * (high - low + 1)) % (high - low + 1)

    def words(self, n: int) -> str:
        return " ".join(self._pick(_WORDS) for _ in range(n))

    def sentence(self) -> str:
        raw = self.words(self._int_between(6, 14))
        return raw[0].upper() + raw[1:] + "."

    def paragraph(self, sentences: int | None = None) -> str:
        count = sentences if sentences is not None else self._int_between(3, 6)
        return " ".join(self.sentence() for _ in range(count))

    def _heading(self) -> str:
        level = "#" * self._int_between(1, 3)
        return f"{level} {self.words(self._int_between(2, 5)).title()}"

    def _code_block(self) -> str:
        lines = [
            f"{self._pick(_WORDS)}_{self._pick(_WORDS)} = {self._pick(_WORDS)}({self._pick(_WORDS)!r})"
            for _ in range(self._int_between(2, 6))
        ]
        return "```python\n" + "\n".join(lines) + "\n```"

    def _list_block(self, ordered: bool) -> str:
        items = []
        for i in range(self._int_between(3, 5)):
            marker = f"{i + 1}." if ordered else "-"
            items.append(f"{marker} {self.sentence()}")
        return "\n".join(items)

    def _decorated_paragraph(self) -> str:
        p = self._profile
        parts: list[str] = []
        for _ in range(self._int_between(3, 6)):
            chunk = self.sentence()
            r = self._rand()
            if r < p.inline_code:
                chunk = f"`{self._pick(_WORDS)}_{self._pick(_WORDS)}()` {chunk}"
            elif r < p.inline_code + p.bold:
                chunk = f"**{self.words(2)}** {chunk}"
            elif r < p.inline_code + p.bold + p.italic:
                chunk = f"*{self.words(2)}* {chunk}"
            elif r < p.inline_code + p.bold + p.italic + p.link:
                chunk = f"[{self.words(2)}](https://example.com/{self._pick(_WORDS)}) {chunk}"
            parts.append(chunk)
        return " ".join(parts)

    def markdown(self, words: int = 200) -> str:
        p = self._profile
        blocks: list[str] = []
        emitted = 0
        while emitted < words:
            r = self._rand()
            if r < p.heading:
                block = self._heading()
            elif r < p.heading + p.code_block:
                block = self._code_block()
            elif r < p.heading + p.code_block + p.bullet_list:
                block = self._list_block(ordered=False)
            elif r < p.heading + p.code_block + p.bullet_list + p.numbered_list:
                block = self._list_block(ordered=True)
            else:
                block = self._decorated_paragraph()
            blocks.append(block)
            emitted += len(block.split())
        return "\n\n".join(blocks)
