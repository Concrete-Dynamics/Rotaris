"""One real run, against a real model, through the workspace's own run path.

Productive use: a person opens a workspace, asks Rotaris a question about a file
in it, and reads the answer.

Expected outcome: the orchestrator hands the question to the codebase-analyst,
the analyst reads the file, and what the run says afterwards contains something
it could only have got by reading it.

This is the only test in the repository that talks to a provider. Everything
else fakes the model, and a faked model answers the way the test author assumed
it would — which is precisely the assumption that breaks in production. Prompts
get read differently by a real model, tool schemas get filled in wrongly or not
at all, and a delegation the fake always makes is one a real model can decline.
Those are the failures this test exists to catch, and none of them are visible
to a suite that never leaves the process.

Run it deliberately::

    uv run pytest tests/live -m live -s

See ``conftest.py`` for the two locks (explicit selection, readable key) and
``.env.live.example`` for the credentials.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import TYPE_CHECKING, Any

import pytest

if TYPE_CHECKING:
    from pathlib import Path

    from rotaris_core.config.schema import RotarisConfig

_log = logging.getLogger(__name__)

#: The one fact the model cannot know without opening the file. Deliberately
#: not a word, a date or anything else a plausible guess could land on: the
#: whole assertion is that this string made the trip from disk, through a tool
#: call, into a real model's context and back out again.
SECRET_TOKEN = "ROTARIS-LIVE-7F3A9C21-Q4"

FILE_NAME = "DEPLOY_NOTES.md"

FILE_BODY = f"""\
# Deployment notes

The rollout is gated on a release token issued by the build server.

- Environment: staging
- Release token: {SECRET_TOKEN}
- Owner: platform team

Do not reuse a token across environments.
"""

#: Note what is *not* here: the token. If the task carried it, a model that
#: never opened the file could still repeat it, and the test would pass while
#: proving nothing.
TASK = (
    f"What is the release token recorded in the file `{FILE_NAME}` in this workspace? "
    f"Delegate the lookup to the codebase-analyst persona, then report the token "
    f"back to me verbatim in your final answer."
)

#: Generous on purpose. A live provider's latency is not the thing under test,
#: and a run that fails for being 20 seconds slower than the last one teaches
#: nobody anything.
RUN_TIMEOUT_SECONDS = 600.0

#: Tools that answer "what does this file say?". Any of them counts as the
#: analyst having done its job; which one it picks is its own business.
READ_TOOLS = frozenset({"read_file", "haet_read", "grep", "glob"})


def _stored_events(session_dir: Path) -> list[dict[str, Any]]:
    from rotaris_core.eventstore.reader import read_session_events

    return [stored.payload for stored in read_session_events(session_dir)]


def _event_types(events: list[dict[str, Any]]) -> list[str]:
    return [str(event.get("event", "")) for event in events]


def _transcript_personas(events: list[dict[str, Any]]) -> set[str]:
    personas: set[str] = set()
    for event in events:
        if event.get("event") != "transcript.row":
            continue
        row = event.get("row")
        if isinstance(row, dict):
            persona = row.get("persona")
            if isinstance(persona, str) and persona:
                personas.add(persona)
    return personas


@pytest.mark.timeout(900)
async def test_a_live_run_delegates_reads_a_file_and_answers(
    live_config: RotarisConfig,
    live_workspace: Path,
) -> None:
    from rotaris_core.run_host import RunRequest, execute_run
    from rotaris_core.run_result import RunStatus
    from rotaris_core.session.manager import SessionManager

    assert SECRET_TOKEN not in TASK, "The task must not carry the answer it is checking for."
    (live_workspace / FILE_NAME).write_text(FILE_BODY, encoding="utf-8")

    session_manager = SessionManager(live_workspace)
    started = time.monotonic()
    result = await asyncio.wait_for(
        execute_run(
            RunRequest(task=TASK, config=live_config, max_iterations=3),
            session_manager,
        ),
        timeout=RUN_TIMEOUT_SECONDS,
    )
    elapsed = time.monotonic() - started

    session_dir = session_manager.session_dir(result.session_id)
    events = _stored_events(session_dir)
    types = _event_types(events)
    _log.info(
        "Live run finished in %.1fs — session=%s status=%s events=%d",
        elapsed,
        result.session_id,
        result.status,
        len(events),
    )

    # The run itself. `error` is reported before `status` because it is the one
    # that says *why*, and a bare "ERROR != COMPLETED" from a live provider is
    # the least useful failure message this test could produce.
    assert result.error is None, f"The live run failed: {result.error}"
    assert result.status is RunStatus.COMPLETED, (
        f"status={result.status} stop_reason={result.stop_reason!r} "
        f"after {elapsed:.1f}s; events: {types}"
    )

    # The lifecycle bracket a host reads to tell a finished run from an
    # abandoned one (SWR-1828).
    assert types[0] == "session.start", f"first event was {types[0]!r}"
    assert types[-1] == "result", f"last event was {types[-1]!r}"

    # The delegation. A single-agent run that happened to answer correctly is
    # not what was asked for, and would leave the whole child lifecycle — the
    # part most likely to break against a real model — untested.
    assert "child.spawn" in types, f"the orchestrator never delegated; events: {types}"
    personas = _transcript_personas(events)
    assert "codebase-analyst" in personas, (
        f"no codebase-analyst spoke in this run; personas seen: {sorted(personas)}"
    )

    # The read. Which tool it used is the analyst's choice; that it opened
    # something is not.
    read_calls = [
        str(event.get("tool_name", ""))
        for event in events
        if event.get("event") == "tool.start" and event.get("tool_name") in READ_TOOLS
    ]
    assert read_calls, f"nothing read a file; tool calls: {[e.get('tool_name') for e in events]}"

    # The answer. The token exists in exactly one place — the file written
    # above — so finding it in what the run recorded is proof the whole chain
    # ran: prompt, delegation, tool call, model, transcript.
    recorded = "\n".join(json.dumps(event) for event in events)
    assert SECRET_TOKEN in recorded or SECRET_TOKEN in (result.summary or ""), (
        f"The run never reported the token. summary={result.summary!r}"
    )
