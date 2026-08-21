"""Unit tests for session/state_repair.py."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from pathlib import Path

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.state_repair import (
    _REASONING_SENTINEL,
    _needs_repair,
    _repair_event_file,
    repair_reasoning_content,
)

# ── _needs_repair ───────────────────────────────────────────────────────────


@verifies(SWR.SWR_1550)
def test_needs_repair_action_event_missing_reasoning() -> None:
    """ActionEvent missing reasoning_content needs repair."""
    event = {"kind": "ActionEvent", "reasoning_content": None}
    assert _needs_repair(event) is True


@verifies(SWR.SWR_1550)
def test_needs_repair_action_event_with_reasoning() -> None:
    """ActionEvent with reasoning_content does NOT need repair."""
    event = {"kind": "ActionEvent", "reasoning_content": "some reasoning"}
    assert _needs_repair(event) is False


@verifies(SWR.SWR_1550)
def test_needs_repair_agent_message_event_missing_reasoning() -> None:
    """Agent MessageEvent missing llm_message.reasoning_content needs repair."""
    event = {
        "kind": "MessageEvent",
        "source": "agent",
        "llm_message": {"role": "assistant", "reasoning_content": None},
    }
    assert _needs_repair(event) is True


@verifies(SWR.SWR_1550)
def test_needs_repair_agent_message_event_with_reasoning() -> None:
    """Agent MessageEvent with llm_message.reasoning_content does NOT need repair."""
    event = {
        "kind": "MessageEvent",
        "source": "agent",
        "llm_message": {"role": "assistant", "reasoning_content": "chain of thought"},
    }
    assert _needs_repair(event) is False


@verifies(SWR.SWR_1550)
def test_needs_repair_user_message_skipped() -> None:
    """User MessageEvent is never a repair candidate."""
    event = {
        "kind": "MessageEvent",
        "source": "user",
        "llm_message": {"role": "user", "reasoning_content": None},
    }
    assert _needs_repair(event) is False


@verifies(SWR.SWR_1550)
def test_needs_repair_observation_skipped() -> None:
    """ObservationEvents are not repair candidates."""
    event = {"kind": "ObservationEvent", "reasoning_content": None}
    assert _needs_repair(event) is False


# ── _repair_event_file ──────────────────────────────────────────────────────


@verifies(SWR.SWR_1550)
def test_repair_event_file_action_event(tmp_path: Path) -> None:
    """An ActionEvent file missing reasoning_content gets the sentinel."""
    event_data = {
        "id": "test-1",
        "kind": "ActionEvent",
        "source": "agent",
        "reasoning_content": None,
        "thought": [],
        "tool_name": "read_file",
    }
    event_path = tmp_path / "event-00001.json"
    event_path.write_text(json.dumps(event_data))

    result = _repair_event_file(event_path)
    assert result is True

    repaired = json.loads(event_path.read_text())
    assert repaired["reasoning_content"] == _REASONING_SENTINEL


@verifies(SWR.SWR_1550)
def test_repair_event_file_no_change_needed(tmp_path: Path) -> None:
    """An event that has reasoning_content is not modified."""
    event_data = {
        "id": "test-2",
        "kind": "ActionEvent",
        "source": "agent",
        "reasoning_content": "existing reasoning",
        "thought": [],
        "tool_name": "read_file",
    }
    event_path = tmp_path / "event-00002.json"
    event_path.write_text(json.dumps(event_data))

    result = _repair_event_file(event_path)
    assert result is False

    # Content unchanged
    repaired = json.loads(event_path.read_text())
    assert repaired["reasoning_content"] == "existing reasoning"


@verifies(SWR.SWR_1550)
def test_repair_event_file_non_json(tmp_path: Path) -> None:
    """A non-JSON file is silently skipped."""
    event_path = tmp_path / "event-00003.json"
    event_path.write_text("not json")

    result = _repair_event_file(event_path)
    assert result is False


# ── repair_reasoning_content ────────────────────────────────────────────────


@verifies(SWR.SWR_1550)
def test_repair_reasoning_content_integration(tmp_path: Path) -> None:
    """Full repair walk repairs multiple event files."""
    session_dir = tmp_path / "session"
    events_dir = session_dir / "evidence" / "conversations" / "event_logs" / "test-convo" / "events"
    events_dir.mkdir(parents=True)

    # Write events: first missing reasoning, second OK, third missing
    (events_dir / "event-00001.json").write_text(
        json.dumps(
            {
                "id": "1",
                "kind": "ActionEvent",
                "source": "agent",
                "reasoning_content": None,
                "thought": [],
                "tool_name": "read_file",
            }
        )
    )
    (events_dir / "event-00002.json").write_text(
        json.dumps(
            {
                "id": "2",
                "kind": "ActionEvent",
                "source": "agent",
                "reasoning_content": "intact",
                "thought": [],
                "tool_name": "grep",
            }
        )
    )
    (events_dir / "event-00003.json").write_text(
        json.dumps(
            {
                "id": "3",
                "kind": "MessageEvent",
                "source": "agent",
                "llm_message": {"role": "assistant", "reasoning_content": None},
            }
        )
    )

    repaired = repair_reasoning_content(session_dir, "deepseek/deepseek-v4-pro")
    assert repaired == 2

    # Verify event-00001 repaired
    e1 = json.loads((events_dir / "event-00001.json").read_text())
    assert e1["reasoning_content"] == _REASONING_SENTINEL

    # Verify event-00002 unchanged
    e2 = json.loads((events_dir / "event-00002.json").read_text())
    assert e2["reasoning_content"] == "intact"

    # Verify event-00003 repaired
    e3 = json.loads((events_dir / "event-00003.json").read_text())
    assert e3["llm_message"]["reasoning_content"] == _REASONING_SENTINEL


@verifies(SWR.SWR_1550)
def test_repair_reasoning_content_skips_non_thinking_model(tmp_path: Path) -> None:
    """No repair when model does not require reasoning echo."""
    session_dir = tmp_path / "session"
    events_dir = session_dir / "evidence" / "conversations" / "event_logs" / "test-convo" / "events"
    events_dir.mkdir(parents=True)

    (events_dir / "event-00001.json").write_text(
        json.dumps(
            {
                "id": "1",
                "kind": "ActionEvent",
                "source": "agent",
                "reasoning_content": None,
                "thought": [],
                "tool_name": "read_file",
            }
        )
    )

    repaired = repair_reasoning_content(session_dir, "openai/gpt-4o")
    assert repaired == 0

    e1 = json.loads((events_dir / "event-00001.json").read_text())
    assert e1["reasoning_content"] is None  # Unchanged


@verifies(SWR.SWR_1550)
def test_repair_reasoning_content_none_model(tmp_path: Path) -> None:
    """None model name skips repair."""
    repaired = repair_reasoning_content(tmp_path / "session", None)
    assert repaired == 0


@verifies(SWR.SWR_1550)
def test_repair_reasoning_content_missing_evidence_dir(tmp_path: Path) -> None:
    """Missing evidence directory returns 0 with no errors."""
    session_dir = tmp_path / "no-evidence-session"
    session_dir.mkdir()
    repaired = repair_reasoning_content(session_dir, "deepseek/deepseek-v4-pro")
    assert repaired == 0
