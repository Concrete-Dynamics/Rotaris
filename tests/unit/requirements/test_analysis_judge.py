"""One model call, one structured verdict, or a stated failure.

The judge is driven here through its injected ``completion`` callable, never a
provider — the same constructor injection the desktop's ``AgentRunHost`` uses,
so the class is testable without an ``LLM`` at all.
"""

from __future__ import annotations

import time

import pytest

from rotaris_core.llm_errors import reset_rejected_response_formats
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.analysis.judge import (
    JudgeError,
    StructuredJudge,
    enum_schema,
)

pytestmark = pytest.mark.unit


class _Part:
    def __init__(self, text: str) -> None:
        self.text = text


class _Message:
    def __init__(self, text: str) -> None:
        self.content = [_Part(text)]


class _Answer:
    def __init__(self, text: str) -> None:
        self.message = _Message(text)


class ScriptedProvider:
    """Answers a fixed sequence, one entry per call, recording what it was asked."""

    def __init__(self, *answers: str) -> None:
        self._answers = list(answers)
        self.calls: list[tuple[list[object], dict[str, object]]] = []

    def __call__(self, messages: list[object], **kwargs: object) -> object:
        self.calls.append((messages, kwargs))
        return _Answer(self._answers[min(len(self.calls) - 1, len(self._answers) - 1)])

    def user_text(self, index: int = 0) -> str:
        messages, _ = self.calls[index]
        return _text_of(messages[1])

    def system_text(self, index: int = 0) -> str:
        messages, _ = self.calls[index]
        return _text_of(messages[0])


def _text_of(message: object) -> str:
    return "\n".join(part.text for part in getattr(message, "content", []))


class RefusingProvider:
    """Rejects a response format the way a provider that does not support it does."""

    def __init__(self, *, rejects: int, answer: str) -> None:
        self._rejects = rejects
        self._answer = answer
        self.formats: list[object] = []

    def __call__(self, messages: list[object], **kwargs: object) -> object:
        del messages
        self.formats.append(kwargs.get("response_format"))
        if len(self.formats) <= self._rejects:
            raise ValueError("Invalid parameter: response_format is not supported")
        return _Answer(self._answer)


class OutageProvider:
    """The provider is simply not there."""

    def __call__(self, messages: list[object], **kwargs: object) -> object:
        del messages, kwargs
        raise ConnectionError("connection reset by peer")


def _judge(provider: object, **kwargs: object) -> StructuredJudge:
    return StructuredJudge(completion=provider, **kwargs)  # type: ignore[arg-type]


@verifies(SWR.SWR_3503)
async def test_a_well_formed_answer_comes_back_as_a_mapping() -> None:
    provider = ScriptedProvider('{"outcome": "tests affected", "reasoning": "criterion moved"}')

    verdict = await _judge(provider).judge(system="classify", user="the diff")

    assert verdict == {"outcome": "tests affected", "reasoning": "criterion moved"}


@verifies(SWR.SWR_3503)
async def test_markdown_fences_the_model_added_anyway_do_not_lose_the_verdict() -> None:
    provider = ScriptedProvider('```json\n{"outcome": "no behavioural impact"}\n```')

    verdict = await _judge(provider).judge(system="classify", user="the diff")

    assert verdict == {"outcome": "no behavioural impact"}


@verifies(SWR.SWR_3503)
async def test_an_unparseable_answer_is_asked_once_more_with_the_parse_error() -> None:
    provider = ScriptedProvider("I think it is fine, really", '{"outcome": "tests affected"}')

    verdict = await _judge(provider).judge(system="classify", user="the diff")

    assert verdict == {"outcome": "tests affected"}
    assert len(provider.calls) == 2
    # The retry has to say what was wrong, or it is just the same question twice.
    retry = provider.user_text(1)
    assert "could not be parsed" in retry
    assert "the diff" in retry


@verifies(SWR.SWR_3503)
async def test_two_unusable_answers_raise_rather_than_inventing_a_verdict() -> None:
    """An outage is not a verdict — the engine records a failure, not a decision."""
    provider = ScriptedProvider("nonsense", "still nonsense")

    with pytest.raises(JudgeError) as caught:
        await _judge(provider).judge(system="classify", user="the diff")

    assert "no usable JSON object" in str(caught.value)
    assert len(provider.calls) == 2


@verifies(SWR.SWR_3503)
async def test_a_json_array_is_not_a_verdict() -> None:
    provider = ScriptedProvider('["tests affected"]', '["still an array"]')

    with pytest.raises(JudgeError):
        await _judge(provider).judge(system="classify", user="the diff")


@verifies(SWR.SWR_3503)
async def test_an_unreachable_provider_is_reported_as_a_failure_not_a_retry_loop() -> None:
    with pytest.raises(JudgeError) as caught:
        await _judge(OutageProvider()).judge(system="classify", user="the diff")

    assert "unreachable" in str(caught.value)


@verifies(SWR.SWR_3503)
async def test_a_slow_provider_gives_up_at_the_timeout() -> None:
    def never_answers(messages: list[object], **kwargs: object) -> object:
        del messages, kwargs
        time.sleep(5)
        return _Answer("{}")

    with pytest.raises(JudgeError) as caught:
        await _judge(never_answers, timeout=0.2).judge(system="classify", user="the diff")

    assert "did not answer within" in str(caught.value)


@verifies(SWR.SWR_3503)
async def test_a_provider_that_refuses_the_strict_schema_still_gets_asked() -> None:
    """Losing a judgement because a provider dislikes json_schema would be absurd."""
    schema = enum_schema("impact", choice_key="outcome", choices=["a", "b"])
    provider = RefusingProvider(rejects=1, answer='{"outcome": "a", "reasoning": "because"}')

    verdict = await _judge(provider, schema=schema).judge(system="classify", user="the diff")

    assert verdict["outcome"] == "a"
    assert provider.formats[0] == schema
    assert provider.formats[1] == {"type": "json_object"}


@verifies(SWR.SWR_3503)
async def test_a_real_provider_failure_is_not_mistaken_for_a_format_rejection() -> None:
    """Walking the ladder on a genuine outage would turn one failure into three."""

    class CountingOutage:
        def __init__(self) -> None:
            self.formats: list[object] = []

        def __call__(self, messages: list[object], **kwargs: object) -> object:
            del messages
            self.formats.append(kwargs.get("response_format"))
            raise ConnectionError("connection reset by peer")

    provider = CountingOutage()
    judge = _judge(provider, schema=enum_schema("x", choice_key="o", choices=["a"]))

    with pytest.raises(JudgeError) as caught:
        await judge.judge(system="classify", user="the diff")

    assert "unreachable" in str(caught.value)
    assert len(provider.formats) == 1


@verifies(SWR.SWR_3503, SWR.SWR_3404)
def test_the_schema_constrains_the_provider_to_the_engine_own_outcomes() -> None:
    from rotaris_core.requirements.change.impact import ImpactOutcome

    schema = enum_schema(
        "impact",
        choice_key="outcome",
        choices=[outcome.value for outcome in ImpactOutcome],
        optional_text_keys=("question",),
        optional_list_keys=("considered",),
    )

    body = schema["json_schema"]["schema"]
    assert body["properties"]["outcome"]["enum"] == [o.value for o in ImpactOutcome]
    assert body["additionalProperties"] is False

    # Strict mode has no optional keys: every property is required, and the ones
    # the caller called optional are nullable instead. A schema that lists only
    # the mandatory keys is rejected by the provider, and because the rejection
    # says "response_format" the ladder would fall through to unconstrained JSON
    # — leaving the closed set unenforced while the code claims it is enforced.
    assert body["required"] == list(body["properties"])
    assert body["properties"]["considered"]["anyOf"] == [
        {"type": "array", "items": {"type": "string"}},
        {"type": "null"},
    ]
    assert body["properties"]["question"]["anyOf"] == [{"type": "string"}, {"type": "null"}]


@verifies(SWR.SWR_3503)
def test_a_judge_with_no_way_to_reach_a_model_refuses_to_be_built() -> None:
    with pytest.raises(ValueError, match="llm or a completion"):
        StructuredJudge()


@verifies(SWR.SWR_3503)
async def test_the_repair_asks_again_under_the_contract_that_answered() -> None:
    """A retry that changes the output contract is not a retry, it is a new question.

    The repair prompt says "your previous answer could not be parsed, correct
    it". Re-walking the ladder can issue that sentence under a *different*
    response format than the one that produced the answer being repaired — the
    model is asked to correct something while the rules change underneath it.
    """

    class Ladder:
        """Refuses the strict schema once, then answers from a script."""

        def __init__(self, *answers: str) -> None:
            self._answers = list(answers)
            self._answered = 0
            self.formats: list[object] = []

        def __call__(self, messages: list[object], **kwargs: object) -> object:
            del messages
            response_format = kwargs.get("response_format")
            self.formats.append(response_format)
            if isinstance(response_format, dict) and response_format.get("type") == "json_schema":
                raise ValueError("Invalid parameter: response_format is not supported")
            answer = self._answers[min(self._answered, len(self._answers) - 1)]
            self._answered += 1
            return _Answer(answer)

    provider = Ladder("not json at all", '{"outcome": "a"}')
    schema = enum_schema("x", choice_key="outcome", choices=["a"])

    verdict = await _judge(provider, schema=schema).judge(system="classify", user="the diff")

    assert verdict == {"outcome": "a"}
    kinds = [fmt.get("type") if isinstance(fmt, dict) else None for fmt in provider.formats]
    assert kinds == ["json_schema", "json_object", "json_object"], (
        f"the repair re-offered a format the provider had already refused: {kinds}"
    )


@verifies(SWR.SWR_3503)
async def test_the_output_contract_reaches_the_model_even_without_a_schema() -> None:
    provider = ScriptedProvider('{"outcome": "a"}')

    await _judge(provider).judge(system="classify the change", user="the diff")

    system = provider.system_text()
    assert "classify the change" in system
    assert "ONLY a single JSON object" in system


def _format_type(value: object) -> str:
    return str(value.get("type", "")) if isinstance(value, dict) else "none"


@verifies(SWR.SWR_919, SWR.SWR_921, SWR.SWR_3503)
async def test_a_format_the_provider_refused_is_not_offered_to_it_again() -> None:
    """Productive use: a board evaluation asks the same DeepSeek model several questions.

    Expected outcome: the strict schema is never offered to DeepSeek — it maps
    to ``json_object`` (SWR-921). When the provider refuses even that, the
    refusal is remembered, and the next judgement starts where the ladder
    landed, so the console carries one rejection line rather than one per
    judgement.
    """
    reset_rejected_response_formats()
    schema = enum_schema("verdict", choice_key="outcome", choices=["a", "b"])
    answer = '{"outcome": "a", "reasoning": "because"}'

    first = RefusingProvider(rejects=1, answer=answer)
    await _judge(first, schema=schema, model="deepseek/deepseek-v4-pro").judge(
        system="classify",
        user="the diff",
    )
    second = RefusingProvider(rejects=0, answer=answer)
    await _judge(second, schema=schema, model="deepseek/deepseek-v4-pro").judge(
        system="classify",
        user="the diff",
    )

    # The first judge offered the mapped rung and fell to the unconstrained
    # one; the second started where the ladder landed.
    assert [_format_type(item) for item in first.formats] == ["json_object", "none"]
    assert [_format_type(item) for item in second.formats] == ["none"]


@verifies(SWR.SWR_921, SWR.SWR_3503)
async def test_a_deepseek_judge_never_offers_the_strict_schema_it_cannot_honour() -> None:
    """Productive use: a board evaluation judges on a DeepSeek model.

    Expected outcome: the strict ``json_schema`` is never sent — the first
    question is already asked under ``json_object``, so the evaluation costs no
    refused round trip.
    """
    reset_rejected_response_formats()
    schema = enum_schema("verdict", choice_key="outcome", choices=["a", "b"])
    provider = ScriptedProvider('{"outcome": "a", "reasoning": "because"}')

    await _judge(provider, schema=schema, model="deepseek/deepseek-v4-pro").judge(
        system="classify",
        user="the diff",
    )

    assert provider.calls[0][1]["response_format"] == {"type": "json_object"}


@verifies(SWR.SWR_919, SWR.SWR_921, SWR.SWR_3503)
async def test_one_model_refusal_does_not_speak_for_another_model() -> None:
    """Productive use: a workspace judges with one provider and verifies with another.

    Expected outcome: DeepSeek's refusal of the mapped ``json_object`` rung costs
    the other model nothing — it is still offered the constrained contract,
    because the closed set the schema enforces is worth a round trip.
    """
    reset_rejected_response_formats()
    schema = enum_schema("verdict", choice_key="outcome", choices=["a", "b"])
    answer = '{"outcome": "a", "reasoning": "because"}'

    refused = RefusingProvider(rejects=1, answer=answer)
    await _judge(refused, schema=schema, model="deepseek/deepseek-v4-pro").judge(
        system="classify",
        user="the diff",
    )
    other = RefusingProvider(rejects=0, answer=answer)
    await _judge(other, schema=schema, model="openai/gpt-4o").judge(
        system="classify",
        user="the diff",
    )

    assert _format_type(other.formats[0]) == "json_schema"


@verifies(SWR.SWR_919, SWR.SWR_921, SWR.SWR_3503)
async def test_an_unnamed_judge_never_inherits_a_refusal_it_cannot_own() -> None:
    """Productive use: a composition drives the judge through an injected completion that
    never said which model is behind it.

    Expected outcome: it keeps offering the strict schema. Assuming an unnamed caller is
    the model that refused would silently drop the closed set for a model that honours it.
    """
    reset_rejected_response_formats()
    schema = enum_schema("verdict", choice_key="outcome", choices=["a", "b"])
    answer = '{"outcome": "a", "reasoning": "because"}'

    named = RefusingProvider(rejects=1, answer=answer)
    await _judge(named, schema=schema, model="deepseek/deepseek-v4-pro").judge(
        system="classify",
        user="the diff",
    )
    unnamed = RefusingProvider(rejects=0, answer=answer)
    await _judge(unnamed, schema=schema).judge(system="classify", user="the diff")

    assert _format_type(unnamed.formats[0]) == "json_schema"
