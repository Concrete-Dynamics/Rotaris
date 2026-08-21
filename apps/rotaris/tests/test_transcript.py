from __future__ import annotations

import json
import time

import pytest
from rotaris_core.reqtocode import SWR, verifies

from rotaris.models import AgentNode
from rotaris.models.state import TranscriptEvent
from rotaris.theme import persona_color, persona_instance_color, tokens
from rotaris.views.transcript import (
    _event_html,
    _event_identity,
    delegation_context_event,
    group_summary_text,
    group_tool_runs,
    latest_transcript_author,
    search_haystack,
    transcript_attribution,
)

pytestmark = pytest.mark.unit


@verifies(SWR.SWR_2433)
def test_delegation_context_event_contains_delegate_fields() -> None:
    agent = AgentNode(
        id="child-1",
        name="child-1",
        persona="coding-agent",
        parent_id="orchestrator",
        depends_on=["planner"],
        category="deep",
        run_in_background=True,
        delegation_task="TASK: implement feature",
        delegation_session_id="session-1",
        inherited_context=["researcher"],
    )

    event = delegation_context_event(agent)
    fields = json.loads(event.text)

    assert event.kind == "delegation_context"
    assert event.role == "child-1"
    assert event.persona == "coding-agent"
    assert fields == {
        "task_name": "child-1",
        "persona": "coding-agent",
        "category": "deep",
        "run_in_background": True,
        "task": "TASK: implement feature",
        "depends_on": ["planner"],
        "inherited_context": ["researcher"],
    }


@verifies(SWR.SWR_2433)
def test_delegation_context_html_omits_empty_optional_fields() -> None:
    agent = AgentNode(
        id="child-1",
        name="child-1",
        persona="tester",
        parent_id="orchestrator",
        delegation_task="Run checks",
    )
    event = delegation_context_event(agent)

    expanded = _event_html(0, event, False, delegation_collapsed=False)
    collapsed = _event_html(0, event, False, delegation_collapsed=True)

    assert "child-1" in expanded
    assert "tester" in expanded
    assert "Mode: blocking" in expanded
    assert "Run checks" in expanded
    assert "Category:" not in expanded
    assert "Depends on:" not in expanded
    assert "Inherited context:" not in expanded
    assert "Run checks" not in collapsed
    assert "Mode:" not in collapsed


@verifies(SWR.SWR_2433)
def test_delegation_context_html_handles_malformed_payload() -> None:
    event = TranscriptEvent("", "child", "not-json", kind="delegation_context", persona="tester")

    rendered = _event_html(0, event, False, delegation_collapsed=False)

    assert "child" in rendered
    assert "tester" in rendered
    assert "Mode: blocking" in rendered


def _interleaved_events() -> list[TranscriptEvent]:
    return [
        TranscriptEvent("12:00", "you", "please build it", kind="user"),
        TranscriptEvent(
            "12:01",
            "analyst-1",
            "src/app.py",
            kind="tool",
            tool="read_file",
            persona="codebase-analyst",
        ),
        TranscriptEvent(
            "12:02",
            "analyst-1",
            "pattern",
            kind="tool",
            tool="grep",
            persona="codebase-analyst",
        ),
        TranscriptEvent("12:03", "analyst-1", "found the seam", persona="codebase-analyst"),
        TranscriptEvent(
            "12:04",
            "coder-1",
            "src/app.py",
            kind="tool",
            tool="write_file",
            persona="coding-agent",
        ),
        TranscriptEvent("12:05", "you", "thanks", kind="user"),
    ]


@verifies(SWR.SWR_2906)
def test_attribution_blocks_start_at_role_changes() -> None:
    events = _interleaved_events()

    starts = [transcript_attribution(events, row)[0] for row in range(len(events))]

    assert starts == [True, True, False, False, True, True]


@verifies(SWR.SWR_2906)
def test_attribution_label_shows_persona_over_task_name() -> None:
    events = _interleaved_events()

    block_start, line1, line2, color = transcript_attribution(events, 1)

    assert block_start is True
    assert line1 == "Codebase Analyst"
    assert line2 == "analyst-1"
    assert color == persona_instance_color("codebase-analyst", "analyst-1")


@verifies(SWR.SWR_2906)
def test_attribution_continuation_rows_carry_only_the_block_color() -> None:
    events = _interleaved_events()

    block_start, line1, line2, color = transcript_attribution(events, 2)

    assert block_start is False
    assert line1 == ""
    assert line2 == ""
    assert color == persona_instance_color("codebase-analyst", "analyst-1")


@verifies(SWR.SWR_2906)
def test_attribution_fixed_roles_render_single_line_with_fixed_colors() -> None:
    events = [
        TranscriptEvent("", "you", "hi", kind="user", persona="coding-agent"),
        TranscriptEvent("", "orchestrator", "plan", persona="orchestrator"),
    ]

    color = tokens().color
    assert transcript_attribution(events, 0) == (True, "you", "", color.accent[300])
    assert transcript_attribution(events, 1) == (True, "orchestrator", "", color.accent[400])


@verifies(SWR.SWR_2906)
def test_attribution_falls_back_without_persona_and_skips_duplicate_task_line() -> None:
    events = [
        TranscriptEvent("", "mystery-agent", "hello"),
        TranscriptEvent("", "tester", "checking", persona="tester"),
    ]

    # The gutter label is a *word*, so an agent with no persona falls back to the
    # text step of the run axis rather than the saturated one a status dot takes.
    assert transcript_attribution(events, 0) == (
        True,
        "mystery-agent",
        "",
        tokens().color.run_text,
    )
    assert transcript_attribution(events, 1) == (
        True,
        "Tester",
        "",
        persona_color("tester"),
    )


@verifies(SWR.SWR_2910)
def test_newest_agent_row_is_the_transcript_author() -> None:
    """The agent generating right now is the one that wrote the last row."""
    events = _interleaved_events()

    assert latest_transcript_author(events, {"analyst-1", "coder-1"}) == "coder-1"


@verifies(SWR.SWR_2910)
def test_run_owned_rows_are_never_the_transcript_author() -> None:
    """The user, the run's own notices, and the check suite author nothing."""
    events = [
        TranscriptEvent("12:00", "coder-1", "editing", persona="coding-agent"),
        TranscriptEvent("12:01", "system", "Background task b-1 completed.", kind="system"),
        TranscriptEvent("12:02", "verifier", "pytest (1/2)", kind="verifier"),
        TranscriptEvent("12:03", "you", "carry on", kind="user"),
        TranscriptEvent("12:04", "intent", "classified as refactor", kind="intent"),
    ]

    assert latest_transcript_author(events, {"coder-1", "verifier"}) == "coder-1"


@verifies(SWR.SWR_2910)
def test_a_role_naming_no_known_agent_is_skipped_not_answered_with() -> None:
    """A run whose newest row has no agent still names whoever last spoke."""
    events = [
        TranscriptEvent("12:00", "coder-1", "editing", persona="coding-agent"),
        TranscriptEvent("12:01", "retired-agent", "left over from an earlier run"),
    ]

    assert latest_transcript_author(events, {"coder-1"}) == "coder-1"


@verifies(SWR.SWR_2910)
def test_a_transcript_with_no_agent_rows_has_no_author() -> None:
    """Before any agent speaks there is nothing to describe, and we say so."""
    events = [
        TranscriptEvent("12:00", "you", "please build it", kind="user"),
        TranscriptEvent("12:01", "system", "Run started.", kind="system"),
    ]

    assert latest_transcript_author(events, {"coder-1"}) == ""
    assert latest_transcript_author([], {"coder-1"}) == ""


# ---------------------------------------------------------------------------
# Consecutive tool-call grouping (SWR-2432)
# ---------------------------------------------------------------------------


def _call(tool: str, text: str, **overrides: object) -> TranscriptEvent:
    defaults: dict[str, object] = {
        "timestamp": "12:00",
        "role": "coder-1",
        "text": text,
        "kind": "tool",
        "tool": tool,
        "status": "ok",
        "duration": 1.0,
        "event_key": f"call-{text}",
    }
    defaults.update(overrides)
    return TranscriptEvent(**defaults)  # type: ignore[arg-type]


@verifies(SWR.SWR_2432)
def test_a_run_of_same_family_calls_becomes_one_row() -> None:
    """Different read-ish tools share the "reading" family, so they fold together."""
    events = [
        _call("read_file", "a.py"),
        _call("read_file", "b.py"),
        _call("list_dir", "docs/"),
        _call("glob", "**/*.md"),
    ]

    display = group_tool_runs(events)

    assert len(display) == 1
    group = display[0]
    assert group.kind == "tool_group"
    assert group.role == "coder-1"
    fields = json.loads(group.text)
    assert fields["family"] == "reading"
    assert fields["count"] == 4
    assert fields["ok"] == 4
    assert group.duration == 4.0


@verifies(SWR.SWR_2432)
def test_a_lone_call_is_not_a_group() -> None:
    events = [_call("read_file", "a.py")]

    assert group_tool_runs(events) == events


@verifies(SWR.SWR_2432)
def test_family_change_agent_change_and_other_rows_end_a_run() -> None:
    """Only an uninterrupted run of one agent's same-family calls groups."""
    events = [
        _call("read_file", "a.py"),
        _call("read_file", "b.py"),
        _call("edit_file", "a.py"),  # different family
        _call("edit_file", "b.py"),
        TranscriptEvent("12:01", "coder-1", "thinking it over", kind="thinking"),
        _call("read_file", "c.py"),
        _call("read_file", "d.py", role="analyst-1"),  # different agent
    ]

    display = group_tool_runs(events)

    kinds = [(event.kind, event.tool) for event in display]
    assert kinds == [
        ("tool_group", "reading"),
        ("tool_group", "editing"),
        ("thinking", ""),
        ("tool", "read_file"),
        ("tool", "read_file"),
    ]


@verifies(SWR.SWR_2432)
def test_the_question_row_never_folds_into_a_group() -> None:
    """`ask_questions` is an interaction to find, not activity to summarise."""
    events = [
        _call("ask_questions", "pick one"),
        _call("ask_questions", "pick another"),
    ]

    assert group_tool_runs(events) == events


@verifies(SWR.SWR_2432)
def test_an_unmapped_tool_groups_only_with_itself() -> None:
    events = [
        _call("weird_tool", "one"),
        _call("weird_tool", "two"),
        _call("other_tool", "three"),
        _call("other_tool", "four"),
    ]

    display = group_tool_runs(events)

    assert [event.tool for event in display] == ["weird tool", "other tool"]


@verifies(SWR.SWR_2432)
def test_an_expanded_group_keeps_its_header_and_re_emits_its_members() -> None:
    events = [_call("read_file", "a.py"), _call("read_file", "b.py")]
    header = group_tool_runs(events)[0]

    expanded = group_tool_runs(events, {_event_identity(header)})

    assert [event.kind for event in expanded] == ["tool_group", "tool", "tool"]
    assert expanded[1:] == events


@verifies(SWR.SWR_2432)
def test_group_identity_survives_the_group_growing() -> None:
    """An opened group must not snap shut when the next call joins it."""
    events = [_call("read_file", "a.py"), _call("read_file", "b.py")]
    before = _event_identity(group_tool_runs(events)[0])

    events.append(_call("read_file", "c.py"))
    after = _event_identity(group_tool_runs(events)[0])

    assert before == after


@verifies(SWR.SWR_2432)
def test_a_live_group_counts_upward_and_names_the_call_in_flight() -> None:
    events = [
        _call("read_file", "a.py"),
        _call("read_file", "b.py"),
        _call("read_file", "c.py", status="running", duration=0.0, started_at=time.time() - 4),
    ]

    group = group_tool_runs(events)[0]
    html = _event_html(0, group, False)

    assert group.status == "running"
    assert "◉" in html
    assert "running… 4s" in html
    assert "⤷" in html  # the grey follow line
    assert "c.py" in html  # naming the call currently executing
    assert "×3" in html


@verifies(SWR.SWR_2432)
def test_a_settled_group_states_duration_and_its_outcome_tally() -> None:
    events = [
        _call("read_file", "a.py", duration=2.0),
        _call("read_file", "b.py", duration=1.5),
        _call("read_file", "c.py", status="failed", duration=0.5),
    ]

    group = group_tool_runs(events)[0]
    html = _event_html(0, group, False)

    assert group.status == "failed"  # the worst member outcome wins
    assert "▸" in html
    assert "reading" in html
    assert "×3" in html
    assert "4s" in html
    assert "2 ok" in html
    assert "1 failed" in html
    assert tokens().color.fail_text in html  # the tally is text, not a dot
    assert "◉" not in html


@verifies(SWR.SWR_2432)
def test_a_group_answers_search_and_copy_for_its_members() -> None:
    """A hit inside a collapsed run has to land on the row the user can see."""
    events = [_call("read_file", "alpha.py"), _call("read_file", "beta.py")]
    group = group_tool_runs(events)[0]

    haystack = search_haystack(group)
    assert "alpha.py" in haystack
    assert "beta.py" in haystack

    summary = group_summary_text(group)
    assert summary == "reading ×2 · 2 ok · beta.py"
    assert "{" not in summary  # never the raw payload
