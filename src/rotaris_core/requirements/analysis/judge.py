"""One model call, one structured verdict, or a stated failure.

Every agentic requirements job asks the same shape of question: here are two
versions of a requirement (or a repository survey, or a list of traces), pick
one outcome from a closed set and say why. This is the one place that asks it.

What it is *not* is a validator. Each engine already owns a tolerant reader —
``impact.read_verdict``, ``decomposition.read_proposal`` — that turns a payload
into a domain object and, crucially, *downgrades* rather than raises: an
outcome nobody named, an unknown outcome, an outcome without reasoning all
become ``human clarification required`` with the reason stated. Duplicating
that here would give two policies for the same question and let the weaker one
win. So this module's job ends at "JSON text to ``Mapping``".

Failure is a raise, not an empty mapping, for the same reason: an outage is not
a verdict. ``ImpactAnalyzer`` already turns a raise into an ``ImpactFailure``
that names what went wrong, which is a better record than a verdict nobody
made.

Three behaviours are inherited from existing meta-callers in this repository
rather than invented:

- the call runs through :func:`rotaris_core.llm_threads.call_llm_detached`,
  because ``asyncio.wait_for`` around ``asyncio.to_thread`` cannot stop a
  provider retrying with backoff from outliving its timeout and freezing the
  host (see that module's docstring);
- the response-format ladder ``json_schema -> json_object -> none`` with
  provider rejection detected on the error text, from
  ``ralph.intent_classifier``, because not every provider honours strict
  schemas and losing the whole judgement over that would be absurd — the
  ladder is first mapped through per-model capability metadata
  (``models.response_format_catalog``, SWR-921), so a model known to lack
  ``response_format``, or one whose refusal is known ahead of time like
  DeepSeek, is never offered a rung it can only refuse, and the refusal is
  *remembered* (``rotaris_core.llm_errors``), because a provider that refused
  a format once refuses it every time and a board evaluation makes many of
  these calls;
- one repair retry that hands the parse error back, from
  ``improvement.collector``.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import TYPE_CHECKING, Any

from rotaris_core.llm_errors import (
    is_response_format_error,
    remember_rejected_response_format,
    response_format_rejected,
)
from rotaris_core.llm_threads import call_llm_detached
from rotaris_core.models.response_format_catalog import normalize_response_formats
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Callable, Mapping, Sequence

    from openhands.sdk import LLM

_log = logging.getLogger(__name__)

__all__ = ["JudgeError", "StructuredJudge", "enum_schema"]

#: The floor under a judgement's wall clock, for a judge nobody gave one.
#:
#: Not the answer to "how long may this take" — that is a fact about the model
#: being asked, and
#: :func:`~rotaris_core.requirements.analysis.persona.analyst_timeout` reads it
#: from the same configuration the transport reads. This number used to *be* the
#: policy, and being shorter than a single configured HTTP attempt it could only
#: ever cut off calls that were still going fine.
DEFAULT_JUDGE_TIMEOUT = 90.0

_JSON_ONLY = (
    "\n\nReturn ONLY a single JSON object. No prose before or after it, no markdown fences."
)

_REPAIR = (
    "Your previous answer could not be parsed as a single JSON object.\n"
    "Parse error: {error}\n"
    "Return ONLY the corrected JSON object."
)


class JudgeError(RuntimeError):
    """The judge produced no usable answer — timeout, outage, or unparseable twice."""


@traces(SWR.SWR_3503, SWR.SWR_3404)
def enum_schema(
    name: str,
    *,
    choice_key: str,
    choices: Sequence[str],
    reason_key: str = "reasoning",
    optional_text_keys: Sequence[str] = (),
    optional_list_keys: Sequence[str] = (),
) -> dict[str, Any]:
    """Build a strict ``json_schema`` response format for a closed-set verdict.

    *choices* is meant to be fed straight from the engine's own enum, so the
    set the provider is constrained to and the set the reader accepts cannot
    drift apart. A judgement whose shape does not fit this — a mapping of
    per-item decisions, say — should pass its own schema dict instead; this is
    a convenience for the common case, not the only supported form.
    """
    properties: dict[str, Any] = {
        choice_key: {"type": "string", "enum": list(choices)},
        reason_key: {"type": "string"},
    }
    # Strict Structured Outputs has no notion of an optional key: ``required``
    # must list *every* property, and optionality is spelled as a nullable type.
    # Listing only the mandatory two is a schema the provider rejects outright —
    # and the rejection carries the words "response_format", so the ladder below
    # would quietly fall through to unconstrained JSON and the closed set would
    # never actually be enforced. A constraint that silently does not apply is
    # worse than none, because the docstring claims it does.
    # ``ralph.intent_classifier`` already spells this correctly; this follows it.
    for key in optional_text_keys:
        properties[key] = {"anyOf": [{"type": "string"}, {"type": "null"}]}
    for key in optional_list_keys:
        properties[key] = {
            "anyOf": [{"type": "array", "items": {"type": "string"}}, {"type": "null"}],
        }

    return {
        "type": "json_schema",
        "json_schema": {
            "name": name,
            "strict": True,
            "schema": {
                "type": "object",
                "properties": properties,
                "required": list(properties),
                "additionalProperties": False,
            },
        },
    }


@traces(SWR.SWR_3106, SWR.SWR_3404, SWR.SWR_3411, SWR.SWR_3503, SWR.SWR_3507)
class StructuredJudge:
    """Asks one model one question and returns the object it answered with.

    Pass *completion* to drive it without a provider: it stands in for
    ``llm.completion`` and takes the same ``(messages, **kwargs)``. That is how
    the concrete analysts stay unit-testable without an ``LLM``, following the
    same constructor-injection the desktop's ``AgentRunHost`` uses for its own
    outside-world calls.
    """

    def __init__(
        self,
        llm: LLM | None = None,
        *,
        schema: Mapping[str, Any] | None = None,
        timeout: float = DEFAULT_JUDGE_TIMEOUT,
        completion: Callable[..., object] | None = None,
        model: str = "",
    ) -> None:
        if llm is None and completion is None:
            raise ValueError("StructuredJudge needs an llm or a completion callable")
        self._llm = llm
        self._completion = completion
        self._timeout = timeout
        # Named so a refusal can be remembered against the model that made it.
        # An injected ``completion`` knows its own model and the ``llm`` carries
        # one; an unnamed judge simply never consults the cache, which costs a
        # round trip rather than risking one model inheriting another's refusal.
        self._model = model or getattr(llm, "model", "") or ""
        # json_schema first, then plain JSON mode, then nothing but the prompt —
        # mapped first through per-model capabilities (SWR-921), so a model
        # that cannot honour a rung never sees it, and then filtered for
        # formats this process already learned are refused (SWR-919).
        ladder: tuple[Mapping[str, Any] | None, ...] = (
            (schema, {"type": "json_object"}, None)
            if schema is not None
            else ({"type": "json_object"}, None)
        )
        self._formats = self._offerable(
            normalize_response_formats(ladder, model=self._model),
        )

    def _offerable(
        self,
        ladder: tuple[Mapping[str, Any] | None, ...],
    ) -> tuple[Mapping[str, Any] | None, ...]:
        """*ladder* without the rungs this model has already refused.

        The unconstrained last rung is never dropped: it is what the ladder
        falls back *to*, and a ladder with nothing left on it could not ask at
        all. Everything above it is skipped once the provider has said no, so
        the second judgement of a pass does not repeat the first one's wasted
        round trip.
        """
        kept = [
            rung
            for rung in ladder[:-1]
            if rung is None or not response_format_rejected(self._model, str(rung.get("type", "")))
        ]
        return (*kept, ladder[-1])

    async def judge(self, *, system: str, user: str) -> Mapping[str, Any]:
        """Return the model's answer as a mapping.

        Raises:
            JudgeError: the model timed out, was unreachable, or answered with
                something that is not a JSON object twice in a row.
        """
        try:
            return await asyncio.wait_for(self._ask(system, user), timeout=self._timeout)
        except TimeoutError:
            # The model is named because this message is what a blocked
            # requirement carries: "the analyst did not answer" says nothing a
            # user can act on, while the model that was slow points straight at
            # the ``models.<name>.timeout`` that governs how long it may take.
            on = f" on {self._model}" if self._model else ""
            raise JudgeError(
                f"the analyst{on} did not answer within {self._timeout:.0f}s",
            ) from None

    async def _ask(self, system: str, user: str) -> Mapping[str, Any]:
        prompt = user
        error = "no answer"
        # The ladder is walked once, and the repair reuses the rung that
        # answered. Re-deriving it would let the retry issue "your previous
        # answer could not be parsed, correct it" under a *different* output
        # contract than the one that produced that answer — incoherent in the
        # one code path whose whole job is coherence with the previous turn.
        formats = self._formats
        for attempt in range(2):
            text, formats = await self._complete(system, prompt, formats)
            if text:
                try:
                    return _as_object(text)
                except ValueError as exc:
                    error = str(exc)
            else:
                error = "empty response"
            if attempt == 0:
                _log.info("Requirements judge answer unusable (%s); asking once more", error)
                prompt = f"{user}\n\n{_REPAIR.format(error=error)}"
        raise JudgeError(f"the analyst answered with no usable JSON object: {error}")

    async def _complete(
        self,
        system: str,
        user: str,
        formats: tuple[Mapping[str, Any] | None, ...],
    ) -> tuple[str, tuple[Mapping[str, Any] | None, ...]]:
        """Ask under the first of *formats* the provider accepts.

        Returns the answer and the rung it was *asked under*, narrowed to one
        entry, so a caller can ask again under the same contract. Asked under,
        not "that produced it": when the last rung answers with nothing, that
        rung still comes back, and handing the repair the contract the empty turn
        was issued under is the point. A provider that refused ``json_schema``
        once will refuse it again; re-offering it costs a round trip and tells
        the model something different than last time.
        """
        from openhands.sdk.llm.message import Message, TextContent

        messages = [
            Message(role="system", content=[TextContent(text=system + _JSON_ONLY)]),
            Message(role="user", content=[TextContent(text=user)]),
        ]
        call = self._completion if self._completion is not None else _llm_completion(self._llm)

        for index, response_format in enumerate(formats):
            kwargs: dict[str, Any] = {}
            if response_format is not None:
                kwargs["response_format"] = dict(response_format)
            try:
                response = await call_llm_detached(call, messages, **kwargs)
            except Exception as exc:
                if response_format is not None and is_response_format_error(exc):
                    # Recorded whether or not there is a rung left to fall to:
                    # the refusal is a fact about the model, and the next judge
                    # in this process should not offer it again either.
                    remember_rejected_response_format(
                        self._model,
                        str(response_format.get("type", "")),
                    )
                    if index + 1 < len(formats):
                        _log.info(
                            "Provider rejected response_format %s (%s); falling back",
                            response_format.get("type"),
                            exc,
                        )
                        continue
                raise JudgeError(f"the analyst was unreachable: {exc}") from exc

            text = _extract_text(response).strip()
            if text or index + 1 >= len(formats):
                return text, (response_format,)
            _log.info("Empty answer in %s mode; falling back", response_format)
        # Unreachable: the last iteration either returns or raises. Narrowed
        # anyway, because this is the one path that could hand back the full
        # ladder, and a later edit that made it reachable would silently undo the
        # narrowing above without failing anything.
        return "", formats[-1:]


def _llm_completion(llm: LLM | None) -> Callable[..., object]:
    if llm is None:  # pragma: no cover — the constructor rules this out.
        raise ValueError("StructuredJudge has neither an llm nor a completion callable")
    return llm.completion


def _extract_text(response: object) -> str:
    from openhands.sdk.llm.message import TextContent

    message = getattr(response, "message", None)
    if message is None:
        return ""
    parts: list[str] = []
    for item in getattr(message, "content", []) or []:
        if isinstance(item, TextContent):
            parts.append(item.text)
        else:
            text = getattr(item, "text", None)
            if isinstance(text, str):
                parts.append(text)
    return "\n".join(part for part in parts if part)


def _as_object(text: str) -> Mapping[str, Any]:
    """Parse *text* into a mapping, tolerating fences the model added anyway."""
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = "\n".join(
            line for line in stripped.splitlines() if not line.startswith("```")
        ).strip()
    try:
        parsed = json.loads(stripped)
    except json.JSONDecodeError as exc:
        raise ValueError(f"not JSON ({exc.msg} at line {exc.lineno})") from exc
    if not isinstance(parsed, dict):
        raise ValueError(f"expected a JSON object, got {type(parsed).__name__}")
    return parsed
