"""Safe, cached Markdown rendering for Qt rich-text widgets."""

from __future__ import annotations

import html
from collections import OrderedDict
from dataclasses import dataclass
from threading import RLock
from typing import TYPE_CHECKING

import mistune
from PySide6.QtCore import Qt
from PySide6.QtWidgets import QLabel, QTextBrowser, QWidget
from rotaris_core.reqtocode import SWR, traces

from rotaris.theme import tokens
from rotaris.theme.manager import Themed

if TYPE_CHECKING:
    from rotaris.theme.spec import Theme


class _QtHtmlRenderer(mistune.HTMLRenderer):
    """Mistune renderer tailored to Qt's supported HTML subset.

    Qt's rich-text engine has no stylesheet of its own to inherit from, so every
    colour a rendered document shows has to be written into the markup. That
    makes the *moment* these methods run the moment the theme is read: the tokens
    are resolved per render, and a theme switch is followed by re-rendering the
    source (see :class:`MarkdownLabel`) rather than by restyling the HTML.
    """

    def codespan(self, text: str) -> str:
        t = tokens()
        return (
            f'<code style="font-family:{t.type.mono};'
            f"background-color:{t.color.track};color:{t.color.text};"
            f'padding:1px 3px;">{html.escape(text)}</code>'
        )

    def block_code(self, code: str, info: str | None = None) -> str:
        t = tokens()
        language = ""
        if info:
            # The fence's language is a caption on the block, not part of it.
            language = (
                f'<div style="color:{t.color.text_tertiary};">{html.escape(info.strip())}</div>'
            )
        return (
            f'<pre style="font-family:{t.type.mono};white-space:pre-wrap;'
            f"background-color:{t.color.track};color:{t.color.text};"
            f"border:{t.size.hairline}px solid {t.color.border_strong};"
            f'padding:{t.space.sm}px;">'
            f"{language}{html.escape(code)}</pre>\n"
        )

    def image(self, text: str, url: str, title: str | None = None) -> str:
        """Do not let rich-text widgets fetch model-supplied remote images."""
        label = text or title or url
        return f"[image: {html.escape(label)}]"


def _render_table(_renderer: mistune.BaseRenderer, text: str) -> str:
    t = tokens()
    return (
        f'<table cellspacing="0" cellpadding="0" '
        f'style="border:{t.size.hairline}px solid {t.color.border_strong};'
        f'margin:{t.space.sm}px 0;">{text}</table>\n'
    )


def _render_table_cell(
    _renderer: mistune.BaseRenderer,
    text: str,
    align: str | None = None,
    head: bool = False,
) -> str:
    t = tokens()
    tag = "th" if head else "td"
    style = (
        f"border:{t.size.hairline}px solid {t.color.border_strong};"
        f"padding:{t.space.xs}px {t.space.sm}px;color:{t.color.text};"
    )
    if head:
        style += f"background-color:{t.color.track};font-weight:{t.type.weight_strong};"
    if align:
        style += f"text-align:{align};"
    return f'<{tag} style="{style}">{text}</{tag}>'


_MARKDOWN_RENDERER = _QtHtmlRenderer(escape=True)
_MARKDOWN = mistune.create_markdown(
    renderer=_MARKDOWN_RENDERER,
    # "table" is required for GFM pipe tables — without it they fall through as
    # literal "| a | b |" paragraphs. strikethrough/task_lists round out GFM.
    plugins=["url", "table", "strikethrough", "task_lists"],
)
# Qt's rich-text engine ignores un-styled <table>/<td> borders, so re-register the
# table renderers with inline borders (same approach as codespan/block_code above).
_MARKDOWN_RENDERER.register("table", _render_table)
_MARKDOWN_RENDERER.register("table_cell", _render_table_cell)

_CACHE_MAX_ENTRIES = 256
_CACHE_MAX_CHARS = 2_000_000
_CACHE_MAX_ENTRY_CHARS = 250_000
#: Keyed on the active theme as well as the source text. The rendered HTML
#: carries its colours inline, so a hit recorded before a theme switch would
#: hand back a document painted in the palette the user just left.
_CACHE: OrderedDict[tuple[str, str], tuple[str, int]] = OrderedDict()
_CACHE_CHARS = 0
_CACHE_HITS = 0
_CACHE_MISSES = 0
_CACHE_LOCK = RLock()


@dataclass(frozen=True)
class MarkdownCacheInfo:
    """Bounded Markdown cache diagnostics used by performance tests."""

    hits: int
    misses: int
    entries: int
    chars: int
    max_entries: int = _CACHE_MAX_ENTRIES
    max_chars: int = _CACHE_MAX_CHARS


@traces(SWR.SWR_2021)
def markdown_to_html(text: str) -> str:
    """Convert Markdown safely while bounding retained streamed revisions."""
    global _CACHE_CHARS, _CACHE_HITS, _CACHE_MISSES
    key = (tokens().name, text)
    with _CACHE_LOCK:
        cached = _CACHE.pop(key, None)
        if cached is not None:
            _CACHE[key] = cached
            _CACHE_HITS += 1
            return cached[0]
        _CACHE_MISSES += 1
    try:
        rendered = str(_MARKDOWN(text))
    except Exception:  # pragma: no cover - defensive fallback around third-party parsing
        escaped = html.escape(text).replace("\n", "<br>")
        rendered = f"<p>{escaped}</p>"

    weight = len(text) + len(rendered)
    if weight > _CACHE_MAX_ENTRY_CHARS:
        return rendered
    with _CACHE_LOCK:
        existing = _CACHE.pop(key, None)
        if existing is not None:
            _CACHE_CHARS -= existing[1]
        _CACHE[key] = (rendered, weight)
        _CACHE_CHARS += weight
        while len(_CACHE) > _CACHE_MAX_ENTRIES or _CACHE_CHARS > _CACHE_MAX_CHARS:
            _old_key, (_old_html, old_weight) = _CACHE.popitem(last=False)
            _CACHE_CHARS -= old_weight
    return rendered


def markdown_cache_info() -> MarkdownCacheInfo:
    with _CACHE_LOCK:
        return MarkdownCacheInfo(
            hits=_CACHE_HITS,
            misses=_CACHE_MISSES,
            entries=len(_CACHE),
            chars=_CACHE_CHARS,
        )


def clear_markdown_cache() -> None:
    global _CACHE_CHARS, _CACHE_HITS, _CACHE_MISSES
    with _CACHE_LOCK:
        _CACHE.clear()
        _CACHE_CHARS = 0
        _CACHE_HITS = 0
        _CACHE_MISSES = 0


class MarkdownLabel(Themed, QLabel):
    """Selectable QLabel that renders safe Markdown and opens links externally.

    Keeps the Markdown it was given rather than only the HTML it produced: the
    document's colours are baked into its markup, so following a theme is
    rendering the source again, and the source is the only thing the rendered
    HTML cannot be turned back into.
    """

    def __init__(self, markdown: str = "", parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setTextFormat(Qt.TextFormat.RichText)
        self.setWordWrap(True)
        self.setOpenExternalLinks(True)
        self.setTextInteractionFlags(
            Qt.TextInteractionFlag.TextSelectableByMouse
            | Qt.TextInteractionFlag.LinksAccessibleByMouse
        )
        self._markdown = markdown
        # Also the first render: the hook applies the active theme immediately.
        self.install_theme_hook()

    def set_markdown(self, markdown: str) -> None:
        self._markdown = markdown
        self.setText(markdown_to_html(markdown))

    def apply_theme(self, theme: Theme) -> None:
        del theme
        self.setText(markdown_to_html(self._markdown))


class MarkdownBrowser(Themed, QTextBrowser):
    """Read-only scrollable Markdown preview with external links enabled."""

    def __init__(self, markdown: str = "", parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setOpenExternalLinks(True)
        self.setReadOnly(True)
        self._markdown = markdown
        self.install_theme_hook()

    def set_markdown(self, markdown: str) -> None:
        self._markdown = markdown
        self.setHtml(markdown_to_html(markdown))

    def apply_theme(self, theme: Theme) -> None:
        del theme
        self.setHtml(markdown_to_html(self._markdown))
