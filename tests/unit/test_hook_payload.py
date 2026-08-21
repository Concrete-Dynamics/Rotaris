"""The JSON a hook reads on stdin (SWR-2702, SWR-2703): what it carries, what it
must never carry, and the malformed values it has to survive."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

import pytest

from rotaris_core.hooks.payload import (
    RESERVED_LIFECYCLE_FIELDS,
    build_lifecycle_payload,
    build_tool_payload,
    redact_payload,
)
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.unit


@verifies(SWR.SWR_2702)
def test_tool_payload_carries_the_whole_call_context(tmp_path: Path) -> None:
    """Productive use: a hook author reads one JSON object and knows which tool ran,
    with which arguments, in which workspace, for which session.
    Expected outcome: every documented field is present, and the object survives a real
    JSON round trip so the hook's own json.load() sees the same thing."""
    payload = build_tool_payload(
        event="pre_tool",
        tool_name="terminal",
        arguments={"command": "git status", "cwd": "."},
        session_id="session-42",
        workspace=tmp_path,
        command="git status",
    )

    assert payload["event"] == "pre_tool"
    assert payload["tool_name"] == "terminal"
    assert payload["arguments"] == {"command": "git status", "cwd": "."}
    assert payload["session_id"] == "session-42"
    assert payload["workspace"] == str(tmp_path)
    assert payload["command"] == "git status"
    # A pre_tool call has no result yet, so the key is simply absent.
    assert "result" not in payload

    # The workspace path is a Windows path with backslashes on this platform; the
    # hook must get it back exactly, which only works if it is JSON-encoded.
    assert json.loads(json.dumps(payload))["workspace"] == str(tmp_path)


@verifies(SWR.SWR_2702)
def test_post_tool_payload_includes_the_result(tmp_path: Path) -> None:
    """Productive use: a formatting hook that runs after an edit wants to know what the
    edit produced.
    Expected outcome: a supplied result reaches the payload; an absent one adds no key."""
    with_result = build_tool_payload(
        event="post_tool",
        tool_name="str_replace_editor",
        arguments={"path": "main.py"},
        session_id="s1",
        workspace=tmp_path,
        result={"exit_code": 0, "lines_changed": 3},
    )
    assert with_result["result"] == {"exit_code": 0, "lines_changed": 3}

    without_result = build_tool_payload(
        event="post_tool",
        tool_name="str_replace_editor",
        arguments={"path": "main.py"},
        session_id="s1",
        workspace=tmp_path,
    )
    assert "result" not in without_result


@verifies(SWR.SWR_2702)
def test_secrets_are_redacted_at_every_depth_of_the_arguments(tmp_path: Path) -> None:
    """Productive use: a user can hand a hook the real tool arguments without handing it
    the credentials that were inside them.
    Expected outcome: a token three levels down is masked, in the nested shape rather
    than by flattening the payload to one string."""
    payload = build_tool_payload(
        event="pre_tool",
        tool_name="fetch",
        arguments={
            "request": {
                "headers": {"Authorization": "Bearer sk-live-abcdef123456"},
                "body": {"credentials": {"api_key": "hunter2-not-a-word"}},
            },
            "retries": [{"header": "x-api-token: ghp_deadbeefdeadbeef"}],
        },
        session_id="s1",
        workspace=tmp_path,
    )

    # Shape preserved: still a nested object, not a stringified blob.
    request = payload["arguments"]["request"]
    assert isinstance(request, dict)
    assert isinstance(request["headers"], dict)

    serialised = json.dumps(payload)
    assert "sk-live-abcdef123456" not in serialised
    assert "hunter2-not-a-word" not in serialised
    assert "ghp_deadbeefdeadbeef" not in serialised
    assert "***" in request["headers"]["Authorization"]
    # The surrounding scheme survives, so a hook author can still see the shape.
    assert request["headers"]["Authorization"].startswith("Bearer")


@verifies(SWR.SWR_2702)
def test_unserialisable_values_degrade_instead_of_raising(tmp_path: Path) -> None:
    """Productive use: a tool argument holding a live object must not be able to fail the
    tool call it belongs to.
    Expected outcome: the value is rendered as text, the builder returns normally, and the
    payload is still valid JSON."""

    class Opaque:
        def __repr__(self) -> str:
            return "<Opaque widget>"

    class Exploding:
        def __repr__(self) -> str:
            raise RuntimeError("no repr for you")

    payload = build_tool_payload(
        event="post_tool",
        tool_name="custom",
        arguments={
            "widget": Opaque(),
            "broken": Exploding(),
            "coords": (1, 2),
            "tags": {"alpha"},
            "score": float("nan"),
            "raw": b"\xff\xfe bytes",
        },
        session_id="s1",
        workspace=tmp_path,
    )

    arguments = payload["arguments"]
    assert arguments["widget"] == "<Opaque widget>"
    assert "Exploding" in arguments["broken"]
    assert arguments["coords"] == [1, 2]
    assert arguments["tags"] == ["alpha"]
    assert arguments["score"] == "nan"
    assert "bytes" in arguments["raw"]
    # Valid JSON with no NaN literal, which json.load() on the hook side rejects.
    assert "NaN" not in json.dumps(payload)
    json.loads(json.dumps(payload))


@verifies(SWR.SWR_2702)
def test_self_referential_arguments_do_not_hang_the_builder(tmp_path: Path) -> None:
    """Productive use: an argument structure that points back at itself must not spin the
    agent's dispatch thread forever.
    Expected outcome: the cycle is rendered as a marker and the payload still serialises."""
    looping: dict[str, Any] = {"name": "loop"}
    looping["self"] = looping

    payload = build_tool_payload(
        event="pre_tool",
        tool_name="custom",
        arguments={"outer": looping},
        session_id="s1",
        workspace=tmp_path,
    )

    assert payload["arguments"]["outer"]["name"] == "loop"
    assert payload["arguments"]["outer"]["self"] == "<recursive>"
    json.loads(json.dumps(payload))


@verifies(SWR.SWR_2703)
def test_lifecycle_payload_carries_the_events_own_fields(tmp_path: Path) -> None:
    """Productive use: a child_completed hook wants the child's report, not just the fact
    that something finished.
    Expected outcome: the event's own data lands at the top level next to the three fixed
    keys, redacted like everything else."""
    payload = build_lifecycle_payload(
        event="child_completed",
        session_id="session-7",
        workspace=tmp_path,
        child_id="child-3",
        status="succeeded",
        report={"summary": "wired the token=super-secret-value up"},
    )

    assert payload["event"] == "child_completed"
    assert payload["session_id"] == "session-7"
    assert payload["workspace"] == str(tmp_path)
    assert payload["child_id"] == "child-3"
    assert payload["status"] == "succeeded"
    assert "super-secret-value" not in json.dumps(payload)


@verifies(SWR.SWR_2703)
def test_lifecycle_payload_without_fields_is_still_a_complete_event(tmp_path: Path) -> None:
    """Productive use: a session_start hook that only needs to know a run began can read
    the payload without guarding every key.
    Expected outcome: the three fixed keys are always there, and nothing else is invented
    around them."""
    payload = build_lifecycle_payload(
        event="session_start",
        session_id="s1",
        workspace=tmp_path,
    )

    assert payload == {
        "event": "session_start",
        "session_id": "s1",
        "workspace": str(tmp_path),
    }
    assert frozenset(payload) == RESERVED_LIFECYCLE_FIELDS


@verifies(SWR.SWR_2702)
def test_redact_payload_is_idempotent_and_leaves_the_caller_s_data_alone() -> None:
    """Productive use: a caller that is unsure whether a payload has been redacted can run
    it through again, and the arguments it passed stay usable afterwards.
    Expected outcome: redacting twice equals redacting once, and the input is not mutated."""
    original = {"arguments": {"flags": ["--token", "ghp_abcdefabcdefabcd"]}}

    once = redact_payload(original)
    twice = redact_payload(once)

    assert once == twice
    assert "ghp_abcdefabcdefabcd" not in json.dumps(once)
    # The caller still owns its own dict.
    assert original["arguments"]["flags"][1] == "ghp_abcdefabcdefabcd"


@verifies(SWR.SWR_2702)
def test_credential_shaped_keys_mask_their_whole_value() -> None:
    """Productive use: a hook sees the shape of an authenticated request without seeing the
    credential, even when the secret value looks like an ordinary word.
    Expected outcome: values under credential-named keys are masked; ordinary keys are
    left readable."""
    redacted = redact_payload(
        {
            "password": "correct horse battery staple",
            "api_key": "plainlookingvalue",
            "path": "src/rotaris_core/hooks/runner.py",
            "count": 3,
        },
    )

    assert redacted["password"] == "***"
    assert redacted["api_key"] == "***"
    assert redacted["path"] == "src/rotaris_core/hooks/runner.py"
    assert redacted["count"] == 3
