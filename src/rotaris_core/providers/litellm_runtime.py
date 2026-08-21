"""Process-wide LiteLLM runtime policy.

LiteLLM 1.x schedules synchronous success logging for every streamed chunk on
its global executor.  A long stream can therefore retain the executor's full
worker pool even when Rotaris does not configure LiteLLM callbacks or cache.
OpenHands owns Rotaris's token callbacks, metrics, and telemetry, so the
per-chunk LiteLLM logging path is unnecessary here.
"""

from __future__ import annotations

import logging
import warnings

from rotaris_core.reqtocode import SWR, traces

_log = logging.getLogger(__name__)
_announced = False

# OpenHands telemetry warns once per completion when LiteLLM cannot price the
# model.  The message embeds the model and provider, so "once" keys on the
# model/provider pair: the state stays diagnosable without spamming every call.
_COST_WARNING_PREFIX = "Cost calculation failed"


@traces(SWR.SWR_865)
def configure_litellm_runtime() -> None:
    """Apply the supported, process-wide LiteLLM streaming policy.

    Fail explicitly if the installed LiteLLM no longer exposes the public
    switch.  Silently assigning an unknown module attribute would appear to
    work while restoring the executor growth this policy prevents.
    """
    import litellm

    if not hasattr(litellm, "disable_streaming_logging"):
        raise RuntimeError(
            "Installed LiteLLM is incompatible: disable_streaming_logging is unavailable. "
            "Verify the LiteLLM integration before starting an LLM run."
        )

    litellm.disable_streaming_logging = True
    dedupe_cost_calculation_warnings()

    global _announced
    if not _announced:
        _log.info(
            "LiteLLM per-chunk streaming logging/cache disabled; "
            "OpenHands token metrics and telemetry remain active"
        )
        _announced = True


@traces(SWR.SWR_838, SWR.SWR_840)
def dedupe_cost_calculation_warnings() -> None:
    """Collapse repeated unknown-pricing warnings to one per model.

    Unmapped models make OpenHands telemetry warn on *every* completion.
    The warning is worth seeing — it explains why cost reads as unavailable
    — but only once per model/provider pair per process.
    """
    warnings.filterwarnings(
        "once",
        message=f"^{_COST_WARNING_PREFIX}",
        category=UserWarning,
    )
