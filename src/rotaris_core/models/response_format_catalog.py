"""Per-model response-format capability resolution for structured-output ladders.

The requirements judge and the intent classifier both offer a ladder of
response formats — ``json_schema``, then ``json_object``, then no constraint —
and walk it at runtime (SWR-919). This module maps that ladder onto the rungs
a *named* model actually accepts, using the transport's own per-model
capability metadata — the same source ``supported_reasoning_levels`` consults —
plus one curated exception:

- A provider whose capability metadata is readable and does not list the
  ``response_format`` parameter is offered no typed rung: it can only refuse
  them, and a refusal costs a full round trip.
- DeepSeek accepts the parameter but only the ``json_object`` value; its
  refusal is value-level, which parameter-level metadata cannot express, and
  its runtime refusal is exactly what LiteLLM's own ``supports_response_schema``
  misreports (see SWR-919). DeepSeek models therefore map a ``json_schema``
  rung to ``json_object``.

Metadata that is absent or unreadable leaves the ladder untouched: the runtime
refusal memory in :mod:`rotaris_core.llm_errors` remains the backstop, and an
unnamed model is never changed here.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Mapping

#: Provider ids whose API accepts ``response_format`` but refuses the strict
#: ``json_schema`` value — the one thing capability metadata cannot state.
_JSON_SCHEMA_MAPS_TO_JSON_OBJECT = frozenset({"deepseek"})

#: The rung a ``json_schema`` request becomes for the providers above.
_JSON_OBJECT_RUNG: dict[str, Any] = {"type": "json_object"}

#: Rung types that carry a ``response_format`` payload.
_TYPED_RUNGS = frozenset({"json_schema", "json_object"})


def _provider_of(model: str) -> str:
    """The provider prefix of a qualified model id, or ``""`` when unnamed."""
    if "/" not in model:
        return ""
    return model.split("/", 1)[0].strip().lower()


def _map_json_schema_to_json_object(
    formats: tuple[Mapping[str, Any] | None, ...],
) -> tuple[Mapping[str, Any] | None, ...]:
    """Every ``json_schema`` rung becomes ``json_object``, deduplicated."""
    mapped: list[Mapping[str, Any] | None] = []
    for rung in formats:
        replacement: Mapping[str, Any] | None = (
            _JSON_OBJECT_RUNG if rung is not None and rung.get("type") == "json_schema" else rung
        )
        if replacement not in mapped:
            mapped.append(replacement)
    return tuple(mapped)


def _without_typed_rungs(
    formats: tuple[Mapping[str, Any] | None, ...],
) -> tuple[Mapping[str, Any] | None, ...]:
    """*formats* minus the rungs that carry a ``response_format``.

    The last rung always stays: it is the unconstrained fallback every ladder
    ends in, and the callers' own refusal filtering keeps that invariant.
    """
    kept = [rung for rung in formats[:-1] if rung is None or rung.get("type") not in _TYPED_RUNGS]
    return (*kept, formats[-1])


def _accepts_response_format(model: str, provider: str) -> bool:
    """Whether the transport lists ``response_format`` among the model's parameters.

    ``True`` also when the metadata is unreadable: an unknown model keeps its
    ladder intact, because the runtime probe (SWR-919) is the only source left.
    """
    try:
        import litellm

        bare = model.split("/", 1)[1] if "/" in model else model
        params = litellm.get_supported_openai_params(
            model=bare,
            custom_llm_provider=provider,
        )
    except Exception:  # noqa: BLE001 — unknown providers carry no metadata.
        return True
    return params is None or "response_format" in params


@traces(SWR.SWR_921)
def normalize_response_formats(
    formats: tuple[Mapping[str, Any] | None, ...],
    *,
    model: str = "",
    provider: str = "",
) -> tuple[Mapping[str, Any] | None, ...]:
    """Map *formats* onto the rungs *model* actually accepts.

    *provider* may name the provider directly — configuration knows it even
    when the model id carries no ``provider/model`` prefix — and otherwise it
    is derived from *model*. An unnamed model is returned unchanged: a caller
    that cannot say which model is behind the call must keep offering the
    ladder's top rung rather than inherit another model's constraints.

    The unconstrained last rung is never dropped: it is what the ladders fall
    back *to*, and a ladder with nothing left on it could not ask at all.
    """
    resolved_provider = provider.strip().lower() or _provider_of(model)
    if not resolved_provider or not formats:
        return formats

    if resolved_provider in _JSON_SCHEMA_MAPS_TO_JSON_OBJECT:
        return _map_json_schema_to_json_object(formats)

    if not _accepts_response_format(model, resolved_provider):
        return _without_typed_rungs(formats)
    return formats
