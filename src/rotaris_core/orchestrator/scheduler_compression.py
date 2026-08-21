"""Context-compression helpers for the Scheduler.

Extracted from ``scheduler.py``: the compression threshold check,
model-config resolution, and the ``force_compress_child`` public API.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from rotaris_core.config.compression import resolve_compression_threshold
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from pathlib import Path

    from rotaris_core.config.schema import RotarisConfig
    from rotaris_core.orchestrator.child_state import ChildTaskRecord
    from rotaris_core.orchestrator.scheduler_diagnostics import SchedulerDiagnosticsProxy

_log = logging.getLogger(__name__)


@traces(SWR.SWR_1401, SWR.SWR_1436, SWR.SWR_1437, SWR.SWR_1438, SWR.SWR_1440, SWR.SWR_1445)
class SchedulerCompressionMixin:
    """Compression helpers — mixin for ``Scheduler``."""

    config: RotarisConfig
    _session_dir: Path | None
    _diag: SchedulerDiagnosticsProxy

    def _extract_transcript_events(self, events: list[object]) -> list[dict[str, Any]]:
        raise NotImplementedError

    async def _maybe_compress_context(
        self,
        conversation: Any,
        record: ChildTaskRecord,
        *,
        agent_llm: object | None = None,
    ) -> dict[str, Any] | None:
        from openhands.sdk.event.condenser import CondensationSummaryEvent

        from rotaris_core.agents.compressor import run_compressor
        from rotaris_core.tokens import (
            estimate_context_tokens_from_chars,
            get_last_prompt_token_count,
        )

        events = list(getattr(getattr(conversation, "state", None), "events", []) or [])
        chars_per_token = max(self.config.compressor.chars_per_token, 1)
        has_condensed_history = any(isinstance(event, CondensationSummaryEvent) for event in events)

        # Prefer actual token count from the LLM metrics over char estimation.
        context_tokens: int | None = None
        if agent_llm is not None and not has_condensed_history:
            context_tokens = get_last_prompt_token_count(agent_llm)

        if context_tokens is None:
            total_chars = 0
            for event in events:
                content = getattr(event, "content", None)
                if content is None and hasattr(event, "llm_message"):
                    content = getattr(event.llm_message, "content", None)
                total_chars += len(str(content))
            context_tokens = estimate_context_tokens_from_chars(total_chars, chars_per_token)

        estimated_tokens = context_tokens
        persona_config = self.config.personas.get(record.persona)
        model_config = self._resolve_compression_model_config(
            persona_config.model if persona_config is not None else None,
            agent_llm,
        )
        resolved_threshold = resolve_compression_threshold(self.config, model_config)
        threshold = resolved_threshold.tokens
        threshold_source = resolved_threshold.source
        _log.debug(
            "Child %s compression threshold=%d [%s]",
            record.canonical_name,
            threshold,
            threshold_source,
        )
        if estimated_tokens < threshold:
            return None

        transcript = self._extract_transcript_events(events)
        compression_result = await run_compressor(
            self.config,
            transcript,
            preserve_recent=self.config.compressor.preserve_recent_turns,
        )
        _log.info(
            "Compressed context for %s: %d tokens -> compressed",
            record.canonical_name,
            estimated_tokens,
        )
        return compression_result

    def _resolve_compression_model_config(
        self,
        configured_model_key: str | None,
        agent_llm: object | None,
    ) -> Any:
        runtime_model = str(getattr(agent_llm, "model", "") or "")
        if runtime_model:
            exact = self.config.models.get(runtime_model)
            if exact is not None:
                return exact
            for model_config in self.config.models.values():
                provider_model_id = f"{model_config.provider}/{model_config.model_id}"
                if runtime_model in {model_config.model_id, provider_model_id}:
                    return model_config
        if configured_model_key is None:
            return None
        return self.config.models.get(configured_model_key)


async def force_compress_child(
    scheduler: Any,
    canonical_name: str,
    conversation: Any,
) -> None:
    """Force context compression for a single child conversation, bypassing threshold checks.

    Unlike ``_maybe_compress_context``, this coroutine never consults any threshold
    configuration — it always proceeds directly to ``run_compressor``.
    """
    from rotaris_core.agents.compressor import run_compressor

    events = list(getattr(getattr(conversation, "state", None), "events", []) or [])
    transcript = scheduler._extract_transcript_events(events)
    await run_compressor(
        scheduler.config,
        transcript,
        preserve_recent=scheduler.config.compressor.preserve_recent_turns,
    )
    _log.info("Force-compressed context for %s", canonical_name)
