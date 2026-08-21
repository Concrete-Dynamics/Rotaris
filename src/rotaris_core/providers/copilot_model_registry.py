"""Teach LiteLLM which GitHub Copilot models live on the Responses endpoint.

Rotaris dispatches every model through LiteLLM's chat-completions entry point.
LiteLLM re-routes such a call to ``/responses`` on its own — but only for models
its metadata map marks ``mode: "responses"``. That map ships a fixed list of
Copilot ids, so a newly published responses-only model (``gpt-5.6-terra``,
``gpt-5.4-mini``, …) is unknown to it, stays on the chat route, and comes back
``400 unsupported_api_for_model``.

Copilot's own ``/models`` payload already answers the question; discovery
records it as ``capabilities["api_mode"]`` (see
:func:`rotaris_core.providers.discovery.copilot_api_mode`). This module is the
one-way handoff of that answer into LiteLLM's map, applied just before the LLM
is constructed.
"""

from __future__ import annotations

import logging

from rotaris_core.reqtocode import SWR, traces

_log = logging.getLogger(__name__)

_LITELLM_PROVIDER = "github_copilot"
_RESPONSES_ENDPOINT = "/v1/responses"


@traces(SWR.SWR_2810, SWR.SWR_2811)
def register_copilot_responses_model(
    model_id: str,
    *,
    max_input_tokens: int | None = None,
    max_output_tokens: int | None = None,
) -> None:
    """Mark ``model_id`` as responses-routed in LiteLLM's model metadata.

    Idempotent: LiteLLM merges the entry into its cost map and drops the model
    info cache, so calling this once per LLM construction is cheap and safe.
    Token limits are forwarded when discovery found them; LiteLLM prices Copilot
    at zero either way, so their only job is context-window accounting.
    """
    if not model_id:
        raise ValueError("Cannot register a Copilot responses model without an id.")

    import litellm

    entry: dict[str, object] = {
        "litellm_provider": _LITELLM_PROVIDER,
        "mode": "responses",
        "supported_endpoints": [_RESPONSES_ENDPOINT],
    }
    if max_input_tokens is not None:
        entry["max_input_tokens"] = max_input_tokens
    if max_output_tokens is not None:
        entry["max_output_tokens"] = max_output_tokens

    litellm.register_model({f"{_LITELLM_PROVIDER}/{model_id}": entry})
    _log.debug("Registered Copilot model %s on the Responses endpoint", model_id)
