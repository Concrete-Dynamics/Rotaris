"""What an agent said, put on the wire (SWR-1829 / SWR-2454).

The stream described everything a run *did* and nothing it *said*, so a session
executing in another process could be watched only by re-reading its whole state
from disk — and for a headless run there was nothing there to read until the run
ended. These pin the emitter that closes that: which SDK events say something,
what is said, and what must never leave with it.

The SDK classes are stood in for by objects carrying the same attributes,
deliberately: the emitter is duck-typed so that ``rotaris_core.events`` stays
parseable without booting a runtime, and a test that imported the real classes
would stop proving that.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import TYPE_CHECKING

import pytest

from rotaris_core.events import register_event_sink, reset_event_registry
from rotaris_core.events.transcript import extract_agent_texts, publish_agent_message
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from collections.abc import Iterator

    from rotaris_core.events import RotarisEvent

pytestmark = [pytest.mark.unit, pytest.mark.usefixtures("clean_event_registry")]


@pytest.fixture
def clean_event_registry() -> Iterator[None]:
    """Keep one test's sink from making the next one pass for the wrong reason."""
    reset_event_registry()
    yield
    reset_event_registry()


def _sink(session_id: str = "s-1") -> list[RotarisEvent]:
    captured: list[RotarisEvent] = []
    register_event_sink(session_id, captured.append)
    return captured


def _record(name: str = "implementer-2", persona: str = "coder") -> SimpleNamespace:
    return SimpleNamespace(canonical_name=name, persona=persona)


def _part(text: str) -> SimpleNamespace:
    return SimpleNamespace(text=text)


def _message(text: str, source: str = "agent") -> SimpleNamespace:
    """A ``MessageEvent``: the agent addressing the reader."""
    return SimpleNamespace(source=source, llm_message=SimpleNamespace(content=[_part(text)]))


def _action(
    thought: str = "",
    reasoning: str = "",
    tool_name: str = "bash",
) -> SimpleNamespace:
    """An ``ActionEvent``: a tool call, with whatever the model said on the way."""
    return SimpleNamespace(
        tool_name=tool_name,
        tool_call_id="call-1",
        thought=[_part(thought)] if thought else [],
        reasoning_content=reasoning,
    )


@verifies(SWR.SWR_1829, SWR.SWR_2454)
def test_an_agent_message_reaches_the_stream() -> None:
    """Productive use: the agent reports what it did.
    Expected outcome: the sentence is on the wire, attributed to the agent that
    said it, so a consumer can join it to the child that was spawned."""
    captured = _sink()

    publish_agent_message("s-1", _record(), _message("I fixed the failing assertion."))

    assert len(captured) == 1
    event = captured[0]
    assert event.event == "agent.message"
    assert event.kind == "message"
    assert event.text == "I fixed the failing assertion."
    assert event.agent_name == "implementer-2"
    assert event.persona == "coder"
    assert event.session_id == "s-1"


@verifies(SWR.SWR_1829, SWR.SWR_2454)
def test_reasoning_and_the_message_it_produced_arrive_in_reading_order() -> None:
    """Productive use: the model reasons, says what it is about to do, and calls a
    tool — all in one turn. Expected outcome: both are published, in the order a
    reader should meet them, and the deliberation is marked as deliberation."""
    captured = _sink()

    publish_agent_message(
        "s-1",
        _record(),
        _action(
            thought="Running the tests now.", reasoning="The failure looks like an off-by-one."
        ),
    )

    assert [(event.kind, event.text) for event in captured] == [
        ("reasoning", "The failure looks like an off-by-one."),
        ("message", "Running the tests now."),
    ]


@verifies(SWR.SWR_1829, SWR.SWR_2454)
def test_an_event_that_says_nothing_publishes_nothing() -> None:
    """Productive use: most of what a conversation emits is machinery.
    Expected outcome: a bare tool call, a user prompt and a tool observation each
    leave the stream alone — the prompt is already `session.start.task` and the
    observation is already a `tool.finish`."""
    captured = _sink()

    publish_agent_message("s-1", _record(), _action())
    publish_agent_message("s-1", _record(), _message("run the tests", source="user"))
    publish_agent_message("s-1", _record(), SimpleNamespace(observation="ok"))

    assert captured == []


@verifies(SWR.SWR_1829)
def test_model_internal_markup_is_not_published_as_something_the_agent_said() -> None:
    """Productive use: a provider leaks raw tool-call markup into message content.
    Expected outcome: nothing is published — a message whose whole content was
    markup is not a message anybody should be shown."""
    captured = _sink()

    publish_agent_message("s-1", _record(), _message("<|tool_call|>"))

    assert captured == []


@verifies(SWR.SWR_1829)
def test_a_credential_the_agent_quoted_does_not_reach_the_wire() -> None:
    """Productive use: the agent repeats the command output it just read, and
    that output printed a token. Expected outcome: the schema masks it, because
    an agent quoting a tool is exactly how a secret gets into free text."""
    captured = _sink()

    publish_agent_message(
        "s-1",
        _record(),
        _message("The script sets API_KEY=sk-livesecret before running."),
    )

    assert "sk-livesecret" not in captured[0].text
    assert "The script sets" in captured[0].text


@verifies(SWR.SWR_1829, SWR.SWR_2454)
def test_a_session_with_no_id_publishes_nothing() -> None:
    """Productive use: a conversation runs outside a session — a probe, a test
    harness. Expected outcome: no event and no exception. A sink cannot even be
    registered without a session id, so the check has to happen before the
    publish rather than inside it."""
    captured = _sink()

    publish_agent_message("", _record(), _message("something"))

    assert captured == []


@verifies(SWR.SWR_1829, SWR.SWR_2454)
def test_a_run_nobody_is_listening_to_does_no_extraction_work() -> None:
    """Productive use: a conversation runs with no store and no stream attached.
    Expected outcome: the emitter stops before reading the event at all — this is
    called for every event of every conversation, so the account nobody asked for
    must not be assembled anyway."""
    read: list[str] = []

    class _Watched:
        source = "agent"

        @property
        def llm_message(self) -> object:
            read.append("llm_message")
            return SimpleNamespace(content=[_part("hello")])

    publish_agent_message("nobody-registered-this", _record(), _Watched())

    assert read == []


@verifies(SWR.SWR_1829)
def test_extraction_reads_a_record_that_is_missing_its_fields() -> None:
    """Productive use: an SDK version moves or renames what an event carries.
    Expected outcome: the emitter finds nothing rather than raising — it runs
    inside a live conversation, and a stream must never fail a run."""
    assert list(extract_agent_texts(SimpleNamespace())) == []
    assert list(extract_agent_texts(SimpleNamespace(reasoning_content=None, thought=None))) == []
    assert list(extract_agent_texts(SimpleNamespace(llm_message=None, source="agent"))) == []


@verifies(SWR.SWR_1829, SWR.SWR_2454)
def test_a_broken_consumer_does_not_reach_the_run() -> None:
    """Productive use: whatever is watching the stream is broken.
    Expected outcome: publishing returns normally, so the conversation that
    called it keeps going."""
    register_event_sink("s-1", lambda _event: (_ for _ in ()).throw(RuntimeError("sink is down")))

    publish_agent_message("s-1", _record(), _message("still working"))
