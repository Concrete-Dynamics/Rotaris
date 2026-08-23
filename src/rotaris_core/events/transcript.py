"""Publishing what an agent said, from the seam every host shares (SWR-1829).

The stream carried a run's mechanics and not its conversation.  This module is
the emitter for :class:`~rotaris_core.events.schema.AgentMessageEvent`, and where
it is called from is most of the design:
``orchestrator.child_run.run_child_impl`` sees every SDK event of every
conversation — the entry agent's included, since the loop runs it as a child —
*before* handing that event to whatever callback the host installed.  A CLI run,
a headless run, an SDK run and a desktop run therefore all emit the same
messages, which is the property that makes the stream a description of the run
rather than of one host's view of it.

Emitting from a host instead would have been smaller and wrong twice over: the
desktop replaces ``scheduler._conversation_event_callback`` outright, so a
callback-based emitter would be the thing it replaces; and a headless run — the
one whose session nothing else can see into — would emit nothing at all.

**Duck-typed on purpose.** Nothing here imports the agent SDK.  ``events`` is
the package a stream consumer parses lines with, and it must not drag in a
runtime; the event classes are recognised by the attributes they carry, which is
also what keeps this working across SDK versions that move a class.

**Containment.** Every call is wrapped by the caller's own ``try`` (``_emit_event``
already guards the host callback the same way) and ``events.bus.publish`` turns a
broken sink into a logged warning.  A run is never failed by what is watching it.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from rotaris_core.events.bus import publish, resolve_event_sink
from rotaris_core.events.schema import AgentMessageEvent
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Iterator


def _is_agent_message(event: object) -> bool:
    """True for a message the agent itself produced.

    ``source`` distinguishes the agent's own message from the user's prompt and
    from a tool's observation, all of which arrive as the same class.  Only the
    agent's belongs on this event: the prompt is already on the wire as
    ``session.start.task``, and an observation is a ``tool.finish``.
    """
    if not hasattr(event, "llm_message"):
        return False
    return str(getattr(event, "source", "")) == "agent"


@traces(SWR.SWR_1829, SWR.SWR_2454)
def extract_agent_texts(event: object) -> Iterator[tuple[str, str]]:
    """Yield ``(kind, text)`` for everything readable in one SDK event.

    An action event can carry both at once — the model reasons, states what it is
    about to do, and calls a tool in a single turn — so this yields rather than
    returns.  Order is the order a reader should see them in: reasoning precedes
    the text it produced.

    Nothing is yielded for an event that says nothing, which is most of them.
    """
    from rotaris_core.sdk_text import visible_message_text

    reasoning = getattr(event, "reasoning_content", None)
    if isinstance(reasoning, str) and reasoning.strip():
        yield "reasoning", reasoning.strip()

    if _is_agent_message(event):
        text = visible_message_text(getattr(getattr(event, "llm_message", None), "content", None))
        if text:
            yield "message", text
        return

    # An action event's ``thought`` is the model addressing the reader on its way
    # to a tool call.  It renders as an ordinary message and is not reasoning:
    # a consumer that hides deliberation must still show this.
    thought = getattr(event, "thought", None)
    if thought is not None:
        text = visible_message_text(thought)
        if text:
            yield "message", text


@traces(SWR.SWR_1829, SWR.SWR_2454)
def publish_agent_message(session_id: str, record: Any, event: object) -> None:
    """Publish what *event* says, if anything, for the agent that produced it.

    Returns before extracting anything when nothing is listening.  Extraction
    runs the visible-text sanitizer, which is several regex passes, and this is
    called for every event of every conversation — so a run with no consumer must
    not pay for the account nobody asked for.  In a real run there is always a
    consumer, because the store registers one for every run (SWR-2901); the guard
    is for the runs that are not real ones.
    """
    if resolve_event_sink(session_id) is None:
        return
    agent_name = str(getattr(record, "canonical_name", "") or "")
    persona = str(getattr(record, "persona", "") or "")
    for kind, text in extract_agent_texts(event):
        publish(
            session_id,
            AgentMessageEvent(
                session_id=session_id,
                agent_name=agent_name,
                persona=persona,
                kind=kind,  # type: ignore[arg-type]  # both literals are produced above
                text=text,
            ),
        )
