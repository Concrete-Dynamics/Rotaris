from __future__ import annotations

import datetime as dt
import json
from typing import TYPE_CHECKING

from rotaris_core.config.schema import RotarisConfig
from rotaris_core.cost import CostSnapshot, CostSource
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.diagnostics import (
    SessionDiagnostics,
    _append_jsonl,
    _resolve_conversation_events_dir,
    build_metrics,
    emit_timeline_event,
    record_issue,
    record_memory_snapshot,
    record_tool_call,
    render_summary,
    update_conversation_index,
)
from rotaris_core.session.manager import SessionManager
from rotaris_core.session.state import SessionState

if TYPE_CHECKING:
    from pathlib import Path


@verifies(SWR.SWR_1545, SWR.SWR_1546)
def test_session_save_writes_split_state_and_inspection_files(tmp_path) -> None:
    manager = SessionManager(tmp_path)
    state = manager.create_session(RotarisConfig(workspace_root=tmp_path))

    session_dir = manager.session_dir(state.session_id)

    assert (session_dir / "state" / "resume.json").exists()
    assert (session_dir / "state" / "run_config.json").exists()
    assert (session_dir / "state" / "ui_transcript.json").exists()
    assert (session_dir / "state" / "ui_edit_diffs.json").exists()
    assert (session_dir / "summary.md").exists()
    assert (session_dir / "timeline.jsonl").exists()
    assert (session_dir / "metrics.json").exists()
    assert (session_dir / "issues.json").exists()
    assert (session_dir / "evidence" / "tool-calls.jsonl").exists()
    assert (session_dir / "evidence" / "conversations" / "index.json").exists()

    resume = json.loads((session_dir / "state" / "resume.json").read_text(encoding="utf-8"))
    run_config = json.loads((session_dir / "state" / "run_config.json").read_text(encoding="utf-8"))
    assert resume["config_snapshot"] == {}
    assert resume["ui_edit_diffs"] == []
    assert run_config["config_snapshot"]["workspace_root"] == str(tmp_path)


@verifies(SWR.SWR_2503)
def test_run_config_records_the_effective_permission_mode(tmp_path) -> None:
    from rotaris_core.session.diagnostics import _run_config_payload

    manager = SessionManager(tmp_path)
    config = RotarisConfig(workspace_root=tmp_path)
    config.runtime.permission_mode = "restricted"
    state = manager.create_session(config)

    payload = _run_config_payload(state)

    assert payload["permission_mode"] == "restricted"


@verifies(SWR.SWR_2601)
def test_run_config_records_the_resolved_check_suite_and_its_source(tmp_path) -> None:
    from rotaris_core.config.schema import CheckConfig

    manager = SessionManager(tmp_path)
    config = RotarisConfig(workspace_root=tmp_path)
    config.verifier.checks = [CheckConfig(name="pytest", command="uv run pytest -q")]
    state = manager.create_session(config)

    run_config = json.loads(
        (manager.session_dir(state.session_id) / "state" / "run_config.json").read_text(
            encoding="utf-8",
        ),
    )

    assert run_config["check_suite"]["source"] == "config"
    assert run_config["check_suite"]["checks"][0]["name"] == "pytest"
    assert run_config["check_suite"]["checks"][0]["severity"] == "blocking"


@verifies(SWR.SWR_2612)
def test_run_config_answers_whether_this_run_was_gated_and_why_not(tmp_path) -> None:
    """The question SWR-2612 exists to make answerable from a snapshot.

    An unverifiable run used to look exactly like a clean one, because both
    resolved to an exempt suite and nothing recorded which of the two had
    happened.
    """
    from rotaris_core.config.schema import CheckConfig

    manager = SessionManager(tmp_path)
    bare = RotarisConfig(workspace_root=tmp_path)
    bare_state = manager.create_session(bare)

    assert bare_state.check_suite is not None
    assert bare_state.check_suite.gate is not None
    assert bare_state.check_suite.gate.state == "absent"

    (tmp_path / "pyproject.toml").write_text("[project]\nname='x'\n", encoding="utf-8")
    gated = RotarisConfig(workspace_root=tmp_path)
    gated.verifier.checks = [CheckConfig(name="pytest", command="uv run pytest -q")]
    gated_state = manager.create_session(gated)

    run_config = json.loads(
        (manager.session_dir(gated_state.session_id) / "state" / "run_config.json").read_text(
            encoding="utf-8",
        ),
    )
    gate = run_config["check_suite"]["gate"]

    # A stated suite is bound the moment it is stated; it has simply not been
    # probed here yet, which is what `stale` says (SWR-2613 probes it).
    assert gate["state"] == "stale"
    assert gate["suite_origin"] == "config"
    assert gate["fingerprint"]


@verifies(SWR.SWR_2601)
def test_run_config_distinguishes_an_explicit_empty_suite_from_a_failed_detection(
    tmp_path,
) -> None:
    """An intentional no-verification workspace must not read as a failed detection."""
    from rotaris_core.session.diagnostics import _run_config_payload

    manager = SessionManager(tmp_path)
    explicit = RotarisConfig(workspace_root=tmp_path)
    explicit.verifier.checks = []
    explicit_state = manager.create_session(explicit)
    manager.release_lock(explicit_state.session_id)
    detected_state = manager.create_session(RotarisConfig(workspace_root=tmp_path))

    assert _run_config_payload(explicit_state)["check_suite"]["source"] == "explicit_empty"
    assert _run_config_payload(detected_state)["check_suite"]["source"] == "detection_empty"


@verifies(SWR.SWR_2416)
def test_run_config_records_resolved_playbooks(tmp_path) -> None:
    """A finished session must be auditable for which playbook cells it actually ran."""
    from rotaris_core.config.defaults import DEFAULT_PERSONAS
    from rotaris_core.session.diagnostics import _run_config_payload

    manager = SessionManager(tmp_path)
    state = manager.create_session(
        RotarisConfig(workspace_root=tmp_path, personas=dict(DEFAULT_PERSONAS)),
    )
    state.run_intent = "moderate_feature"

    payload = _run_config_payload(state)

    assert payload["run_intent"] == "moderate_feature"
    playbooks = payload["resolved_playbooks"]
    assert playbooks["orchestrator"]["tier_source"] == "coding-agent"
    assert playbooks["orchestrator"]["variants"]["ROUTE"] in {"direct", "plan-first"}
    assert playbooks["coding-agent"]["tier_source"] == "own"
    assert playbooks["coding-agent"]["intent"] == "moderate_feature"
    # Personas with no matrix row are simply absent rather than fabricated.
    assert "intent-classifier" not in playbooks


@verifies(SWR.SWR_2425)
def test_run_config_records_which_executor_the_plan_was_sized_for(tmp_path) -> None:
    """An operator must be able to see the executor the planner sized its plan against."""
    from rotaris_core.config.defaults import DEFAULT_PERSONAS
    from rotaris_core.session.diagnostics import _run_config_payload

    personas = {name: persona.model_copy() for name, persona in DEFAULT_PERSONAS.items()}
    personas["coding-agent"] = personas["coding-agent"].model_copy(
        update={"model": "small_model"},
    )
    manager = SessionManager(tmp_path)
    state = manager.create_session(RotarisConfig(workspace_root=tmp_path, personas=personas))
    state.run_intent = "moderate_feature"

    planner = _run_config_payload(state)["resolved_playbooks"]["planner"]

    assert planner["tier"] == "large_model"
    assert planner["consumer_source"] == "coding-agent"
    assert planner["consumer_tier"] == "small_model"
    assert planner["variants"]["CHUNKING"] == "micro-slice"
    assert planner["variants"]["OUTPUT"] == "strict-schema"


@verifies(SWR.SWR_2416)
def test_run_config_omits_playbooks_when_run_is_unclassified(tmp_path) -> None:
    from rotaris_core.session.diagnostics import _run_config_payload

    manager = SessionManager(tmp_path)
    state = manager.create_session(RotarisConfig(workspace_root=tmp_path))

    payload = _run_config_payload(state)

    assert payload["run_intent"] == ""
    assert payload["resolved_playbooks"] == {}


@verifies(SWR.SWR_1545)
def test_split_state_load_rehydrates_transcript_and_config(tmp_path) -> None:
    manager = SessionManager(tmp_path)
    state = manager.create_session(RotarisConfig(workspace_root=tmp_path))
    state.transcript_events.append({"role": "user", "content": "hello"})
    state.ui_edit_diffs.append({"diff_id": "diff-1", "path": "sample.txt"})
    manager.save_session(state)

    loaded = manager.load_session(state.session_id)

    assert loaded.transcript_events == [{"role": "user", "content": "hello"}]
    assert loaded.ui_edit_diffs == [{"diff_id": "diff-1", "path": "sample.txt"}]
    assert loaded.config_snapshot["workspace_root"] == str(tmp_path)


@verifies(SWR.SWR_1550)
def test_legacy_snapshot_load_still_works_without_split_state(tmp_path) -> None:
    sessions_dir = tmp_path / ".rotaris" / "sessions"
    session_dir = sessions_dir / "legacy"
    session_dir.mkdir(parents=True)
    now = dt.datetime.now(dt.UTC)
    payload = {
        "session_id": "legacy",
        "workspace_root": str(tmp_path),
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }
    (session_dir / "snapshot.json").write_text(json.dumps(payload), encoding="utf-8")

    loaded = SessionManager(tmp_path).load_session("legacy")

    assert loaded.session_id == "legacy"
    assert loaded.workspace_root == str(tmp_path)


@verifies(SWR.SWR_1550)
def test_a_resumed_legacy_session_stops_reading_the_copy_it_came_from(tmp_path) -> None:
    """Productive use: a user picks up a session from an older version and keeps
    working in it. Expected outcome: what they do next is written to `state/` and
    read back from there — the copy they arrived on is left where it is, stale,
    and is never preferred over the work that came after it."""
    sessions_dir = tmp_path / ".rotaris" / "sessions"
    session_dir = sessions_dir / "legacy"
    session_dir.mkdir(parents=True)
    now = dt.datetime.now(dt.UTC)
    (session_dir / "snapshot.json").write_text(
        json.dumps(
            {
                "session_id": "legacy",
                "workspace_root": str(tmp_path),
                "created_at": now.isoformat(),
                "updated_at": now.isoformat(),
                "transcript_events": [{"role": "user", "content": "before the upgrade"}],
            }
        ),
        encoding="utf-8",
    )

    manager = SessionManager(tmp_path)
    state = manager.load_session("legacy")
    state.transcript_events.append({"role": "assistant", "content": "after the upgrade"})
    manager.save_session(state)

    assert (session_dir / "state" / "resume.json").exists()
    assert manager.load_session("legacy").transcript_events == [
        {"role": "user", "content": "before the upgrade"},
        {"role": "assistant", "content": "after the upgrade"},
    ]
    # Untouched: this is the user's file, and rewriting or deleting it is not
    # what SWR-1550 asks for. It is simply no longer the answer.
    assert json.loads((session_dir / "snapshot.json").read_text(encoding="utf-8"))[
        "transcript_events"
    ] == [{"role": "user", "content": "before the upgrade"}]


@verifies(SWR.SWR_1546, SWR.SWR_1547, SWR.SWR_1548)
def test_timeline_tool_calls_and_issues_are_structured(tmp_path) -> None:
    manager = SessionManager(tmp_path)
    state = manager.create_session(RotarisConfig(workspace_root=tmp_path))
    session_dir = manager.session_dir(state.session_id)

    event_id = emit_timeline_event(
        session_dir,
        "child_start",
        actor="worker",
        message="Worker started",
        metadata={"persona": "builder"},
    )
    record_tool_call(
        session_dir,
        agent_name="worker",
        tool_name="read_file",
        call_id="call-1",
        status="completed",
        elapsed_ms=12,
    )
    issue_id = record_issue(
        session_dir,
        kind="missing_env",
        severity="error",
        actor="worker",
        message="TAVILY_API_KEY is missing",
    )

    timeline = [
        json.loads(line)
        for line in (session_dir / "timeline.jsonl").read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    tool_calls = [
        json.loads(line)
        for line in (session_dir / "evidence" / "tool-calls.jsonl")
        .read_text(encoding="utf-8")
        .splitlines()
        if line.strip()
    ]
    issues = json.loads((session_dir / "issues.json").read_text(encoding="utf-8"))["issues"]

    assert any(event["id"] == event_id for event in timeline)
    assert tool_calls[0]["tool_name"] == "read_file"
    assert issues[0]["id"] == issue_id
    assert issues[0]["kind"] == "missing_env"


@verifies(SWR.SWR_560)
def test_terminal_shell_failure_tool_call_records_issue(tmp_path) -> None:
    _seed_diag_dir(tmp_path)

    record_tool_call(
        tmp_path,
        agent_name="worker",
        tool_name="terminal",
        call_id="call-shell",
        status="error",
        elapsed_ms=12,
        outcome_kind="shell_failure",
        exit_code=4,
        result="ERROR: file or directory not found",
    )

    tool_call = json.loads(
        (tmp_path / "evidence" / "tool-calls.jsonl").read_text(encoding="utf-8"),
    )
    issues = json.loads((tmp_path / "issues.json").read_text(encoding="utf-8"))["issues"]

    assert tool_call["outcome_kind"] == "shell_failure"
    assert tool_call["exit_code"] == 4
    assert issues[0]["kind"] == "terminal_shell_failure"
    assert issues[0]["severity"] == "error"


@verifies(SWR.SWR_560, SWR.SWR_1319, SWR.SWR_1321)
def test_terminal_suspicious_success_tool_call_records_warning_issue(tmp_path) -> None:
    _seed_diag_dir(tmp_path)

    record_tool_call(
        tmp_path,
        agent_name="worker",
        tool_name="terminal",
        call_id="call-suspicious",
        status="warning",
        elapsed_ms=12,
        outcome_kind="suspicious_success",
        exit_code=0,
        warnings=["Pipeline command may have hidden an upstream failure exit code."],
    )

    issues = json.loads((tmp_path / "issues.json").read_text(encoding="utf-8"))["issues"]

    assert issues[0]["kind"] == "terminal_suspicious_success"
    assert issues[0]["metadata"]["warnings"] == [
        "Pipeline command may have hidden an upstream failure exit code.",
    ]


def _seed_diag_dir(tmp_path: Path) -> Path:
    (tmp_path / "evidence" / "conversations").mkdir(parents=True, exist_ok=True)
    (tmp_path / "issues.json").write_text(json.dumps({"issues": []}))
    (tmp_path / "timeline.jsonl").write_text("")
    (tmp_path / "evidence" / "tool-calls.jsonl").write_text("")
    (tmp_path / "evidence" / "report-validation.jsonl").write_text("")
    (tmp_path / "evidence" / "conversations" / "index.json").write_text(
        json.dumps({"conversations": []}),
    )
    return tmp_path


@verifies(SWR.SWR_1551)
def test_session_diagnostics_disabled_is_noop(tmp_path: Path) -> None:
    diag = SessionDiagnostics(None)
    assert diag.enabled is False
    assert diag.session_dir is None
    assert diag.session_dir_str is None

    assert diag.issue(kind="x", message="m") is None
    assert diag.timeline("evt") is None
    diag.tool_call(agent_name="a", tool_name="t", call_id="c", status="ok", elapsed_ms=1)
    diag.conversation_index(conversation_id="c", agent_name="a", persona="p")
    diag.report_validation(actor="a", original_status="ok", final_status="ok", reasons=[])
    assert list(tmp_path.iterdir()) == []


@verifies(SWR.SWR_1551)
def test_session_diagnostics_session_dir_str(tmp_path: Path) -> None:
    diag = SessionDiagnostics(tmp_path)
    assert diag.enabled is True
    assert diag.session_dir == tmp_path
    assert diag.session_dir_str == str(tmp_path)


@verifies(SWR.SWR_1546)
def test_session_diagnostics_issue_writes_to_issues_json(tmp_path: Path) -> None:
    _seed_diag_dir(tmp_path)
    diag = SessionDiagnostics(tmp_path)

    issue_id = diag.issue(kind="test_kind", severity="error", actor="worker", message="boom")
    assert isinstance(issue_id, str) and issue_id

    data = json.loads((tmp_path / "issues.json").read_text())
    assert len(data["issues"]) == 1
    entry = data["issues"][0]
    assert entry["kind"] == "test_kind"
    assert entry["severity"] == "error"
    assert entry["actor"] == "worker"
    assert entry["message"] == "boom"


@verifies(SWR.SWR_1546)
def test_session_diagnostics_timeline_appends_jsonl(tmp_path: Path) -> None:
    _seed_diag_dir(tmp_path)
    diag = SessionDiagnostics(tmp_path)

    event_id = diag.timeline("child_start", actor="a1", message="started")
    assert isinstance(event_id, str) and event_id

    lines = (tmp_path / "timeline.jsonl").read_text().splitlines()
    assert len(lines) == 1
    entry = json.loads(lines[0])
    assert entry["type"] == "child_start"
    assert entry["actor"] == "a1"


@verifies(SWR.SWR_1547)
def test_session_diagnostics_tool_call_writes_jsonl(tmp_path: Path) -> None:
    _seed_diag_dir(tmp_path)
    diag = SessionDiagnostics(tmp_path)

    diag.tool_call(
        agent_name="agent",
        tool_name="read_file",
        call_id="call-1",
        status="ok",
        elapsed_ms=42,
    )

    lines = (tmp_path / "evidence" / "tool-calls.jsonl").read_text().splitlines()
    assert len(lines) == 1
    entry = json.loads(lines[0])
    assert entry["tool_name"] == "read_file"
    assert entry["call_id"] == "call-1"
    assert entry["elapsed_ms"] == 42


@verifies(SWR.SWR_1547)
def test_session_diagnostics_conversation_index_creates_entry(tmp_path: Path) -> None:
    _seed_diag_dir(tmp_path)
    diag = SessionDiagnostics(tmp_path)

    diag.conversation_index(
        conversation_id="conv-1",
        agent_name="agent",
        persona="planner",
        model="gpt-test",
        task_id="t1",
        status="running",
    )

    data = json.loads((tmp_path / "evidence" / "conversations" / "index.json").read_text())
    assert len(data["conversations"]) == 1
    entry = data["conversations"][0]
    assert entry["conversation_id"] == "conv-1"
    assert entry["persona"] == "planner"


@verifies(SWR.SWR_1551, SWR.SWR_1320)
def test_session_diagnostics_report_validation_writes_jsonl(tmp_path: Path) -> None:
    _seed_diag_dir(tmp_path)
    diag = SessionDiagnostics(tmp_path)

    diag.report_validation(
        actor="agent",
        original_status="succeeded",
        final_status="succeeded",
        reasons=[],
        execution_elapsed_s=1.5,
        summary_elapsed_s=0.5,
    )

    lines = (tmp_path / "evidence" / "report-validation.jsonl").read_text().splitlines()
    assert len(lines) == 1
    entry = json.loads(lines[0])
    assert entry["actor"] == "agent"
    assert entry["original_status"] == "succeeded"


@verifies(SWR.SWR_1551, SWR.SWR_1320)
def test_session_diagnostics_context_selection_writes_jsonl(tmp_path: Path) -> None:
    _seed_diag_dir(tmp_path)
    diag = SessionDiagnostics(tmp_path)

    diag.context_selection(
        actor="planner",
        task_name="Investigate failure",
        available_artifacts=3,
        injected_artifact_ids=["art_1", "art_2"],
        elided_artifact_ids=["art_3"],
        full_artifact_ids=["art_2"],
    )

    lines = (tmp_path / "evidence" / "context-selection.jsonl").read_text().splitlines()
    assert len(lines) == 1
    entry = json.loads(lines[0])
    assert entry["actor"] == "planner"
    assert entry["task_name"] == "Investigate failure"
    assert entry["available_artifacts"] == 3
    assert entry["injected_artifact_ids"] == ["art_1", "art_2"]
    assert entry["elided_artifact_ids"] == ["art_3"]
    assert entry["full_artifact_ids"] == ["art_2"]


@verifies(SWR.SWR_1551)
def test_session_diagnostics_memory_snapshot_writes_jsonl(tmp_path: Path) -> None:
    _seed_diag_dir(tmp_path)

    record_memory_snapshot(
        tmp_path,
        label="child_end",
        actor="agent",
        rss_bytes=123,
        traced_current_bytes=45,
        traced_peak_bytes=67,
        top_allocations=[{"file": "x.py", "line": 1, "size_bytes": 10, "count": 1}],
        metadata={"state": "succeeded"},
    )

    lines = (tmp_path / "evidence" / "memory.jsonl").read_text().splitlines()
    assert len(lines) == 1
    entry = json.loads(lines[0])
    assert entry["label"] == "child_end"
    assert entry["actor"] == "agent"
    assert entry["rss_bytes"] == 123
    assert entry["traced_current_bytes"] == 45
    assert entry["traced_peak_bytes"] == 67
    assert entry["metadata"] == {"state": "succeeded"}
    assert entry["top_allocations"][0]["file"] == "x.py"


# -- _resolve_conversation_events_dir ---------------------------------------


def _make_events_dir(base: Path, dir_name: str, num_events: int = 3) -> Path:
    """Create a fake conversation events directory under *base*."""
    events_dir = base / "evidence" / "conversations" / "event_logs" / dir_name / "events"
    events_dir.mkdir(parents=True, exist_ok=True)
    for i in range(num_events):
        (events_dir / f"event-{i:05d}.json").write_text("{}")
    return events_dir


@verifies(SWR.SWR_1547)
def test_resolve_conversation_events_dir_hex_format_fast_path(tmp_path: Path) -> None:
    """The SDK writes hex dirs (no hyphens) — fast path matches directly."""
    hex_id = "da20d15f065c44a695aa7b49a51e92fa"
    _make_events_dir(tmp_path, hex_id)

    result = _resolve_conversation_events_dir(tmp_path, hex_id)
    assert result is not None
    assert result.name == "events"
    assert result.parent.name == hex_id


@verifies(SWR.SWR_1547)
def test_resolve_conversation_events_dir_hyphenated_input_finds_hex_dir(tmp_path: Path) -> None:
    """Hyphenated UUID input should find the SDK's hex-named directory."""
    hex_id = "af96e75ab1eb4857bcdf0fc61c40bca9"
    hyphenated = "af96e75a-b1eb-4857-bcdf-0fc61c40bca9"
    _make_events_dir(tmp_path, hex_id)

    result = _resolve_conversation_events_dir(tmp_path, hyphenated)
    assert result is not None
    assert result.parent.name == hex_id  # resolves to the actual hex dir


@verifies(SWR.SWR_1547)
def test_resolve_conversation_events_dir_missing_returns_none(tmp_path: Path) -> None:
    result = _resolve_conversation_events_dir(tmp_path, "nonexistent-id")
    assert result is None


@verifies(SWR.SWR_1547)
def test_resolve_conversation_events_dir_empty_event_logs_returns_none(tmp_path: Path) -> None:
    (tmp_path / "evidence" / "conversations" / "event_logs").mkdir(parents=True)
    result = _resolve_conversation_events_dir(tmp_path, "any-id")
    assert result is None


@verifies(SWR.SWR_1547)
def test_resolve_conversation_events_dir_non_uuid_string(tmp_path: Path) -> None:
    """Non-UUID conversation IDs (e.g. canonical_name fallback) still work."""
    name = "shell-start-build-started-fixer"
    _make_events_dir(tmp_path, name)

    result = _resolve_conversation_events_dir(tmp_path, name)
    assert result is not None
    assert result.parent.name == name


# -- _conversation_event_count -----------------------------------------------


@verifies(SWR.SWR_1547)
def test_conversation_event_count_returns_correct_number(tmp_path: Path) -> None:
    from rotaris_core.session.diagnostics import _conversation_event_count

    hex_id = "da20d15f065c44a695aa7b49a51e92fa"
    _make_events_dir(tmp_path, hex_id, num_events=7)

    count = _conversation_event_count(tmp_path, hex_id)
    assert count == 7


@verifies(SWR.SWR_1547)
def test_conversation_event_count_with_hyphenated_id(tmp_path: Path) -> None:
    from rotaris_core.session.diagnostics import _conversation_event_count

    hex_id = "ea5af83e6f9a4d5a8847f4bb8788fc2f"
    hyphenated = "ea5af83e-6f9a-4d5a-8847-f4bb8788fc2f"
    _make_events_dir(tmp_path, hex_id, num_events=4)

    count = _conversation_event_count(tmp_path, hyphenated)
    assert count == 4


# -- update_conversation_index path correctness ------------------------------


@verifies(SWR.SWR_1549)
def test_update_conversation_index_path_uses_actual_dir_name(tmp_path: Path) -> None:
    """The 'path' field in index.json must point to the real on-disk directory."""
    hex_id = "da20d15f065c44a695aa7b49a51e92fa"
    hyphenated = "da20d15f-065c-44a6-95aa-7b49a51e92fa"
    _make_events_dir(tmp_path, hex_id, num_events=3)

    update_conversation_index(
        tmp_path,
        conversation_id=hyphenated,
        agent_name="test-agent",
        persona="planner",
        model="test-model",
        status="running",
    )

    data = json.loads(
        (tmp_path / "evidence" / "conversations" / "index.json").read_text(encoding="utf-8"),
    )
    assert len(data["conversations"]) == 1
    entry = data["conversations"][0]
    # The conversation_id in the entry stays as-is (caller's representation).
    assert entry["conversation_id"] == hyphenated
    # The path must match the real on-disk directory.
    assert entry["path"] == f"evidence/conversations/event_logs/{hex_id}"
    # event_count must be non-zero.
    assert entry["event_count"] == 3


@verifies(SWR.SWR_1549)
def test_update_conversation_index_event_count_with_hex_dir(tmp_path: Path) -> None:
    """event_count should be correct when the SDK wrote a hex dir."""
    hex_id = "af96e75ab1eb4857bcdf0fc61c40bca9"
    _make_events_dir(tmp_path, hex_id, num_events=5)

    update_conversation_index(
        tmp_path,
        conversation_id="af96e75a-b1eb-4857-bcdf-0fc61c40bca9",
        agent_name="test-agent",
        persona="coding-agent",
        status="summarizing",
    )

    data = json.loads(
        (tmp_path / "evidence" / "conversations" / "index.json").read_text(encoding="utf-8"),
    )
    assert data["conversations"][0]["event_count"] == 5


@verifies(SWR.SWR_1549)
def test_update_conversation_index_no_events_dir_zero_count(tmp_path: Path) -> None:
    """When no events directory exists, event_count is 0 and path falls back."""
    _seed_diag_dir(tmp_path)

    update_conversation_index(
        tmp_path,
        conversation_id="missing-conv",
        agent_name="test-agent",
        persona="planner",
        status="running",
    )

    data = json.loads(
        (tmp_path / "evidence" / "conversations" / "index.json").read_text(encoding="utf-8"),
    )
    entry = data["conversations"][0]
    assert entry["event_count"] == 0
    assert entry["path"] == "evidence/conversations/event_logs/missing-conv"


@verifies(SWR.SWR_1551)
def test_bounded_jsonl_append_keeps_tail(tmp_path: Path) -> None:
    path = tmp_path / "evidence" / "bounded.jsonl"

    for i in range(5):
        _append_jsonl(path, {"i": i}, max_lines=3)

    rows = [json.loads(line) for line in path.read_text().splitlines()]
    assert rows == [{"i": 2}, {"i": 3}, {"i": 4}]


@verifies(SWR.SWR_841)
def test_summary_reports_unavailable_cost_without_claiming_zero(tmp_path: Path) -> None:
    now = dt.datetime.now(dt.UTC)
    state = SessionState(
        session_id="cost-unavailable",
        workspace_root=str(tmp_path),
        created_at=now,
        updated_at=now,
        global_cost=CostSnapshot(unpriced_calls=6, source=CostSource.UNAVAILABLE),
    )

    metrics = build_metrics(state, tmp_path)
    summary = render_summary(state, metrics)

    assert metrics["global_cost"]["source"] == "unavailable"
    assert "- Cost: n/a" in summary
    assert "$0.00" not in summary


@verifies(SWR.SWR_839, SWR.SWR_841)
def test_summary_labels_configured_cost(tmp_path: Path) -> None:
    now = dt.datetime.now(dt.UTC)
    state = SessionState(
        session_id="cost-configured",
        workspace_root=str(tmp_path),
        created_at=now,
        updated_at=now,
        global_cost=CostSnapshot(
            accumulated_cost=0.25, priced_calls=3, source=CostSource.CONFIGURED
        ),
    )

    summary = render_summary(state, build_metrics(state, tmp_path))

    assert "- Cost: $0.2500 (configured)" in summary


@verifies(SWR.SWR_2911)
def test_tool_outcomes_classify_calls_without_a_terminal_outcome(tmp_path: Path) -> None:
    """Only the terminal tool carries ``outcome_kind``; the rest are still knowable."""
    now = dt.datetime.now(dt.UTC)
    state = SessionState(
        session_id="tool-outcomes",
        workspace_root=str(tmp_path),
        created_at=now,
        updated_at=now,
    )
    record_tool_call(
        tmp_path,
        agent_name="worker",
        tool_name="terminal",
        call_id="call-shell",
        status="error",
        elapsed_ms=12,
        is_error=True,
        outcome_kind="shell_failure",
        exit_code=4,
    )
    record_tool_call(
        tmp_path,
        agent_name="worker",
        tool_name="read_file",
        call_id="call-read",
        status="completed",
        elapsed_ms=8,
    )
    record_tool_call(
        tmp_path,
        agent_name="worker",
        tool_name="get_symbols_overview",
        call_id="call-symbols",
        status="error",
        elapsed_ms=9,
        is_error=True,
    )
    record_tool_call(
        tmp_path,
        agent_name="worker",
        tool_name="write_file",
        call_id="call-rejected",
        status="rejected",
        elapsed_ms=3,
        is_error=True,
    )

    metrics = build_metrics(state, tmp_path)

    assert metrics["tool_outcomes"] == {
        "shell_failure": 1,
        "success": 1,
        "tool_error": 1,
        "rejected": 1,
    }
    assert metrics["terminal_shell_failures"] == 1
    assert metrics["terminal_suspicious_successes"] == 0
    assert metrics["terminal_timeouts"] == 0


@verifies(SWR.SWR_841)
def test_summary_tolerates_metrics_without_a_cost_block(tmp_path: Path) -> None:
    """Metrics recorded before cost telemetry must still render a summary."""
    now = dt.datetime.now(dt.UTC)
    state = SessionState(
        session_id="cost-legacy",
        workspace_root=str(tmp_path),
        created_at=now,
        updated_at=now,
    )
    metrics = build_metrics(state, tmp_path)
    del metrics["global_cost"]

    summary = render_summary(state, metrics)

    assert "- Cost: n/a" in summary
