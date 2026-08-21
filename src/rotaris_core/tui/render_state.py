from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from rotaris_core.reqtocode import SWR, traces


@dataclass
@traces(SWR.SWR_1279)
class RenderState:
    chat_needs_full_rebuild: bool = True
    last_chat_event_count: int = 0
    last_chat_show_reasoning: bool = False
    last_queued_prompt_count: int = 0
    last_speaker_key: str | None = None
    cached_token_chars: int = 0
    cached_token_event_count: int = 0
    last_context_tokens: int = 0
    last_sync_version: int = -1
    cached_child_dicts: list[dict[str, Any]] = field(default_factory=list)
    open_text_segments_by_agent: dict[str, dict[str, Any]] = field(default_factory=dict)
    last_visible_text_snapshot_by_agent: dict[str, str] = field(default_factory=dict)
    refresh_scheduled: bool = False
    last_widget_refresh_at: float = 0.0

    def reset(self) -> None:
        """Reset all incremental state on session change."""
        self.chat_needs_full_rebuild = True
        self.last_chat_event_count = 0
        self.last_chat_show_reasoning = False
        self.last_queued_prompt_count = 0
        self.last_speaker_key = None
        self.cached_token_chars = 0
        self.cached_token_event_count = 0
        self.last_sync_version = -1
        self.cached_child_dicts = []

    def reset_live(self) -> None:
        """Reset transient live state (stream placeholders, context tokens)."""
        self.open_text_segments_by_agent.clear()
        self.last_visible_text_snapshot_by_agent.clear()
        self.last_context_tokens = 0
