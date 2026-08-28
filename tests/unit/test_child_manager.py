from concurrent.futures import ThreadPoolExecutor

import pytest

from rotaris_core.config.schema import RuntimePolicy
from rotaris_core.orchestrator.artifacts import SessionArtifactStore
from rotaris_core.orchestrator.child_manager import ChildManager
from rotaris_core.orchestrator.child_state import ChildNotification, ChildTaskState
from rotaris_core.orchestrator.report import ChildReportArtifact
from rotaris_core.reqtocode import SWR, verifies


@pytest.fixture
def policy():
    return RuntimePolicy(max_children=8, max_depth=3)


@pytest.fixture
def manager(policy):
    return ChildManager(parent_agent_id="parent_1", current_depth=1, policy=policy)


def make_report(summary="test summary"):
    return ChildReportArtifact(
        agent_name="agent",
        persona="persona",
        status="succeeded",
        summary=summary,
        final_response=summary,
        last_response=summary,
    )


@verifies(SWR.SWR_177)
def test_launch_claims_are_atomic_exactly_once_and_parent_scoped(manager) -> None:
    """Productive use: overlapping drains launch each direct delegated task once."""
    direct = [
        manager.spawn_child(f"probe-{index}", "tester", f"probe {index}") for index in range(3)
    ]
    nested = manager.spawn_child(
        "nested-probe",
        "tester",
        "nested probe",
        parent_agent_id=direct[0].canonical_name,
    )

    with ThreadPoolExecutor(max_workers=2) as pool:
        batches = list(pool.map(lambda _: manager.claim_ready_children("parent_1"), range(2)))

    direct_claims = [claim for batch in batches for claim in batch]
    assert {claim.canonical_name for claim in direct_claims} == {
        record.canonical_name for record in direct
    }
    assert len(direct_claims) == len(direct)
    assert all(record.state == ChildTaskState.STARTING for record in direct)
    assert nested.state == ChildTaskState.QUEUED

    nested_claims = manager.claim_ready_children(direct[0].canonical_name)
    assert [claim.canonical_name for claim in nested_claims] == [nested.canonical_name]
    assert manager.claim_ready_children("parent_1") == []


@verifies(SWR.SWR_177)
def test_starting_claim_reserves_model_capacity_until_terminal(manager) -> None:
    """Productive use: a model cap remains honored while an agent is being built."""
    first = manager.spawn_child("first", "tester", "first", model_key="shared-model")
    second = manager.spawn_child("second", "tester", "second", model_key="shared-model")
    manager.enqueue_model_slot(first.canonical_name, "shared-model", max_parallel=1)
    manager.enqueue_model_slot(second.canonical_name, "shared-model", max_parallel=1)

    claims = manager.claim_ready_children("parent_1")

    assert [claim.canonical_name for claim in claims] == [first.canonical_name]
    assert first.state == ChildTaskState.STARTING
    assert second.state == ChildTaskState.WAITING_ON_MODEL_SLOT

    running = manager.transition_launch_claim(claims[0], ChildTaskState.RUNNING)
    assert running is first
    manager.mark_child_terminal(first.canonical_name, ChildTaskState.SUCCEEDED, make_report())

    next_claims = manager.claim_ready_children("parent_1")
    assert [claim.canonical_name for claim in next_claims] == [second.canonical_name]


@verifies(SWR.SWR_101, SWR.SWR_102, SWR.SWR_1113)
def test_spawn_single_child(manager):
    record = manager.spawn_child("test", "test_persona", "do something")
    assert record.canonical_name == "test"
    assert record.state == ChildTaskState.QUEUED
    assert manager.active_count == 1
    assert not manager.all_terminal


@verifies(SWR.SWR_107, SWR.SWR_1532)
def test_spawn_with_depends_on(manager):
    manager.spawn_child("A", "test_persona", "payload A")
    record_b = manager.spawn_child("B", "test_persona", "payload B", depends_on=["A"])
    assert record_b.state == ChildTaskState.WAITING_ON_DEPENDENCIES


@verifies(SWR.SWR_107, SWR.SWR_111, SWR.SWR_128)
def test_dependency_completes_resolves_dependent(manager):
    manager.spawn_child("A", "test_persona", "payload A")
    manager.spawn_child("B", "test_persona", "payload B", depends_on=["A"])

    # A finishes
    record_a = manager._children["A"]
    record_a.transition(ChildTaskState.RUNNING)
    manager.mark_child_terminal("A", ChildTaskState.SUCCEEDED, make_report())

    # B should resolve
    ready = manager.resolve_ready_children()
    assert len(ready) == 1
    assert ready[0].canonical_name == "B"
    assert ready[0].state == ChildTaskState.QUEUED


@verifies(SWR.SWR_109)
def test_dependency_fails_cascades_blocked(manager):
    manager.spawn_child("A", "test_persona", "payload A")
    manager.spawn_child("B", "test_persona", "payload B", depends_on=["A"])

    # A fails
    record_a = manager._children["A"]
    record_a.transition(ChildTaskState.RUNNING)
    manager.mark_child_terminal("A", ChildTaskState.FAILED, make_report())

    # B should be blocked
    assert manager._children["B"].state == ChildTaskState.BLOCKED


@verifies(SWR.SWR_109, SWR.SWR_561)
def test_terminal_state_callback_receives_completed_and_cascaded_children(policy):
    """Productive use: a run host can persist every child that reaches a terminal state.
    Expected outcome: completed and dependency-blocked children are reported after transition."""
    terminal_records = []
    manager = ChildManager(
        parent_agent_id="parent_1",
        current_depth=1,
        policy=policy,
        terminal_state_callback=terminal_records.append,
    )
    first = manager.spawn_child("first", "test_persona", "payload")
    manager.spawn_child("dependent", "test_persona", "payload", depends_on=[first.task_id])

    first.transition(ChildTaskState.RUNNING)
    manager.mark_child_terminal("first", ChildTaskState.FAILED, make_report())

    by_name = {record.canonical_name: record for record in terminal_records}
    assert set(by_name) == {"first", "dependent"}
    assert by_name["first"].state == ChildTaskState.FAILED
    assert by_name["dependent"].state == ChildTaskState.BLOCKED
    assert all(record.completed_at is not None for record in by_name.values())


@verifies(SWR.SWR_103, SWR.SWR_1114)
def test_name_dedup_twice(manager):
    r1 = manager.spawn_child("test", "p", "p")
    r2 = manager.spawn_child("test", "p", "p")
    assert r1.canonical_name == "test"
    assert r2.canonical_name == "test_1"


@verifies(SWR.SWR_103, SWR.SWR_1513)
def test_long_child_name_gets_compact_canonical_name(manager):
    long_name = (
        "Files touched: REQUIREMENTS.md generate_traceability.py .pre-commit-hook.sh "
        "Makefile pyproject.toml -- annotate all tests with matching requirement IDs"
    )

    record = manager.spawn_child(long_name, "p", "payload")

    assert record.name == long_name
    assert len(record.canonical_name) <= 80
    assert record.canonical_name.startswith("Files-touched-REQUIREMENTS.md")
    assert " " not in record.canonical_name


@verifies(SWR.SWR_103)
def test_name_dedup_three_times(manager):
    r1 = manager.spawn_child("test", "p", "p")
    r2 = manager.spawn_child("test", "p", "p")
    r3 = manager.spawn_child("test", "p", "p")
    assert r1.canonical_name == "test"
    assert r2.canonical_name == "test_1"
    assert r3.canonical_name == "test_2"


@verifies(SWR.SWR_104, SWR.SWR_1115)
def test_max_total_children_exceeded(manager):
    manager._policy.max_children = 2
    manager.spawn_child("test1", "p", "p")
    manager.spawn_child("test2", "p", "p")
    with pytest.raises(ValueError, match="Max total children"):
        manager.spawn_child("test3", "p", "p")


@verifies(SWR.SWR_104, SWR.SWR_1115)
def test_max_active_children_exceeded(manager):
    manager._policy.max_active_children = 1
    manager.spawn_child("test1", "p", "p")
    # "test1" is QUEUED (non-terminal), so active_count=1
    with pytest.raises(ValueError, match="Max active children"):
        manager.spawn_child("test2", "p", "p")


@verifies(SWR.SWR_106)
def test_max_depth_exceeded():
    policy = RuntimePolicy(max_depth=2)
    manager = ChildManager("p", 2, policy)
    with pytest.raises(ValueError, match="Max depth"):
        manager.spawn_child("test", "p", "p")


@verifies(SWR.SWR_108, SWR.SWR_1118)
def test_cycle_detection_direct(manager):
    manager.spawn_child("A", "p", "p")
    manager.spawn_child("B", "p", "p", depends_on=["A"])

    manager._children["A"].depends_on = ["B"]

    with pytest.raises(ValueError, match="cycle"):
        manager.spawn_child("C", "p", "p", depends_on=["A"])


@verifies(SWR.SWR_108, SWR.SWR_1118)
def test_cycle_detection_chain(manager):
    manager.spawn_child("A", "p", "p")
    manager.spawn_child("B", "p", "p", depends_on=["A"])

    manager._children["A"].depends_on = ["C"]

    with pytest.raises(ValueError, match="cycle"):
        manager.spawn_child("C", "p", "p", depends_on=["B"])


@verifies(SWR.SWR_107, SWR.SWR_1118)
def test_unknown_dependency(manager):
    with pytest.raises(ValueError, match="Unknown dependency"):
        manager.spawn_child("A", "p", "p", depends_on=["B"])


@verifies(SWR.SWR_111, SWR.SWR_112)
def test_get_newly_terminal_marks_observed(manager):
    manager.spawn_child("A", "p", "p")
    record_a = manager._children["A"]
    record_a.transition(ChildTaskState.RUNNING)
    manager.mark_child_terminal("A", ChildTaskState.SUCCEEDED, make_report())

    term = manager.get_newly_terminal()
    assert len(term) == 1
    assert term[0][0].canonical_name == "A"


@verifies(SWR.SWR_111)
def test_get_newly_terminal_called_twice_returns_empty(manager):
    manager.spawn_child("A", "p", "p")
    record_a = manager._children["A"]
    record_a.transition(ChildTaskState.RUNNING)
    manager.mark_child_terminal("A", ChildTaskState.SUCCEEDED, make_report())
    manager.get_newly_terminal()

    term2 = manager.get_newly_terminal()
    assert len(term2) == 0


@verifies(SWR.SWR_113, SWR.SWR_1119)
def test_get_all_children_summary(manager):
    manager.spawn_child("A", "p1", "p")
    record_a = manager._children["A"]
    record_a.transition(ChildTaskState.RUNNING)
    manager.mark_child_terminal("A", ChildTaskState.SUCCEEDED, make_report("done"))

    manager.spawn_child("B", "p2", "p")

    summaries = manager.get_all_children_summary()
    assert len(summaries) == 2

    # dict order matches insertion order in python
    assert summaries[0] == {
        "canonical_name": "A",
        "persona": "p1",
        "state": "succeeded",
        "summary": "done",
    }
    assert summaries[1] == {
        "canonical_name": "B",
        "persona": "p2",
        "state": "queued",
        "summary": "",
    }


@verifies(SWR.SWR_104)
def test_active_count(manager):
    manager.spawn_child("A", "p", "p")
    manager.spawn_child("B", "p", "p")
    assert manager.active_count == 2
    record_a = manager._children["A"]
    record_a.transition(ChildTaskState.RUNNING)
    manager.mark_child_terminal("A", ChildTaskState.SUCCEEDED, make_report())
    assert manager.active_count == 1


@verifies(SWR.SWR_112, SWR.SWR_1122)
def test_all_terminal(manager):
    assert manager.all_terminal is True  # empty

    manager.spawn_child("A", "p", "p")
    assert manager.all_terminal is False

    record_a = manager._children["A"]
    record_a.transition(ChildTaskState.RUNNING)
    manager.mark_child_terminal("A", ChildTaskState.SUCCEEDED, make_report())
    assert manager.all_terminal is True


# ---------------------------------------------------------------------------
# Context forwarding via depends_on (task_id acceptance + PRIOR AGENT CONTEXT injection)
# ---------------------------------------------------------------------------


def _complete_child(manager, canonical_name, report):
    """Helper: walk a child through RUNNING → SUCCEEDED."""
    record = manager._children[canonical_name]
    record.transition(ChildTaskState.RUNNING)
    manager.mark_child_terminal(canonical_name, ChildTaskState.SUCCEEDED, report)


@verifies(SWR.SWR_139)
def test_spawn_child_accepts_task_id_in_depends_on(manager):
    record_a = manager.spawn_child("A", "p", "payload A", run_in_background=True)
    task_id_a = record_a.task_id
    assert task_id_a.startswith("bg_")

    record_b = manager.spawn_child("B", "p", "payload B", depends_on=[task_id_a])
    # task_id was resolved to canonical name internally
    assert record_b.depends_on == ["A"]
    assert record_b.state == ChildTaskState.WAITING_ON_DEPENDENCIES


@verifies(SWR.SWR_139)
def test_spawn_child_rejects_unknown_task_id(manager):
    with pytest.raises(ValueError, match="Unknown task_id in depends_on"):
        manager.spawn_child("A", "p", "payload", depends_on=["bg_deadbeef"])


@verifies(SWR.SWR_128, SWR.SWR_140, SWR.SWR_2132)
def test_resolve_ready_children_injects_dependency_result(manager):
    record_a = manager.spawn_child("A", "librarian", "research", run_in_background=True)
    task_id_a = record_a.task_id

    manager.spawn_child("B", "planner", "plan it", depends_on=[task_id_a])

    report_a = ChildReportArtifact(
        agent_name="agent",
        persona="librarian",
        status="succeeded",
        summary="Found 3 relevant files",
        key_findings="auth.py handles tokens; routes.py has endpoints",
        final_response="auth.py handles tokens; routes.py has endpoints",
    )
    _complete_child(manager, "A", report_a)

    ready = manager.resolve_ready_children()
    assert len(ready) == 1
    payload = ready[0].task_payload
    assert "PRIOR AGENT CONTEXT:" in payload
    assert "=== A (persona: librarian) [succeeded] ===" in payload
    assert "RESULT:" in payload
    assert "auth.py handles tokens" in payload
    # original payload still present
    assert "plan it" in payload


@verifies(SWR.SWR_547)
def test_resolve_ready_children_no_injection_without_report(manager):
    """If dependency has no report yet (edge case), task_payload is unchanged."""
    manager.spawn_child("A", "p", "payload A")
    manager.spawn_child("B", "p", "payload B", depends_on=["A"])

    # Manually transition A to SUCCEEDED without storing a report
    record_a = manager._children["A"]
    record_a.transition(ChildTaskState.RUNNING)
    record_a.transition(ChildTaskState.SUCCEEDED)
    record_a.completed_at = record_a.completed_at  # no-op, just referencing

    ready = manager.resolve_ready_children()
    assert len(ready) == 1
    assert ready[0].task_payload == "payload B"
    assert "PRIOR AGENT CONTEXT:" not in ready[0].task_payload


@verifies(SWR.SWR_547, SWR.SWR_2132)
def test_resolve_ready_children_injects_final_response_when_no_artifact(manager):
    record_a = manager.spawn_child("A", "p", "payload A", run_in_background=True)
    task_id_a = record_a.task_id

    manager.spawn_child("B", "p", "payload B", depends_on=[task_id_a])

    report_no_findings = ChildReportArtifact(
        agent_name="agent",
        persona="p",
        status="succeeded",
        summary="Completed analysis",
        key_findings=None,
        final_response="Completed analysis",
    )
    _complete_child(manager, "A", report_no_findings)

    ready = manager.resolve_ready_children()
    assert len(ready) == 1
    payload = ready[0].task_payload
    assert "RESULT:" in payload
    assert "Completed analysis" in payload


@verifies(SWR.SWR_104, SWR.SWR_111)
def test_multiple_independent_ready(manager):
    manager.spawn_child("A", "p", "p")
    manager.spawn_child("B", "p", "p")
    manager.spawn_child("C", "p", "p", depends_on=["A"])

    ready = manager.resolve_ready_children()
    assert len(ready) == 2
    names = {r.canonical_name for r in ready}
    assert names == {"A", "B"}


@verifies(SWR.SWR_109)
def test_cascading_block_multiple_deps(manager):
    manager.spawn_child("B", "p", "p")
    manager.spawn_child("C", "p", "p")
    manager.spawn_child("A", "p", "p", depends_on=["B", "C"])

    record_c = manager._children["C"]
    record_c.transition(ChildTaskState.RUNNING)
    manager.mark_child_terminal("C", ChildTaskState.SUCCEEDED, make_report())

    record_b = manager._children["B"]
    record_b.transition(ChildTaskState.RUNNING)
    manager.mark_child_terminal("B", ChildTaskState.FAILED, make_report())

    assert manager._children["A"].state == ChildTaskState.BLOCKED


@verifies(SWR.SWR_139)
def test_spawn_child_assigns_task_id(manager):
    record = manager.spawn_child("worker", "builder", "do work")
    assert record.task_id.startswith("bg_")
    assert len(record.task_id) == 11  # "bg_" + 8 hex chars


@verifies(SWR.SWR_140)
def test_mark_terminal_enqueues_notification_for_background_child(manager):
    record = manager.spawn_child("worker", "builder", "do work", run_in_background=True)
    record.transition(ChildTaskState.RUNNING)
    manager.mark_child_terminal("worker", ChildTaskState.SUCCEEDED, make_report())

    notifications = manager.get_pending_notifications()
    assert len(notifications) == 1
    assert notifications[0].task_id == record.task_id
    assert notifications[0].canonical_name == "worker"
    assert notifications[0].state == ChildTaskState.SUCCEEDED


@verifies(SWR.SWR_143)
def test_mark_terminal_no_notification_for_foreground_child(manager):
    record = manager.spawn_child("worker", "builder", "do work", run_in_background=False)
    record.transition(ChildTaskState.RUNNING)
    manager.mark_child_terminal("worker", ChildTaskState.SUCCEEDED, make_report())

    notifications = manager.get_pending_notifications()
    assert len(notifications) == 0


@verifies(SWR.SWR_142)
def test_results_by_task_id_populated(manager):
    record = manager.spawn_child("worker", "builder", "do work", run_in_background=True)
    report = make_report("custom summary")
    record.transition(ChildTaskState.RUNNING)
    manager.mark_child_terminal("worker", ChildTaskState.SUCCEEDED, report)

    assert record.task_id in manager.results_by_task_id
    assert manager.results_by_task_id[record.task_id] == report


@verifies(SWR.SWR_142)
def test_get_record_by_task_id(manager):
    record = manager.spawn_child("worker", "builder", "do work")
    found = manager.get_record_by_task_id(record.task_id)
    assert found is not None
    assert found.canonical_name == "worker"

    not_found = manager.get_record_by_task_id("bg_nonexistent")
    assert not_found is None


@verifies(SWR.SWR_141)
def test_notification_still_running_count(manager):
    manager.spawn_child("w1", "builder", "task 1", run_in_background=True)
    r2 = manager.spawn_child("w2", "builder", "task 2", run_in_background=True)

    r1 = manager._children["w1"]
    r1.transition(ChildTaskState.RUNNING)
    manager.mark_child_terminal("w1", ChildTaskState.SUCCEEDED, make_report())

    notifications = manager.get_pending_notifications()
    assert len(notifications) == 1
    assert notifications[0].still_running_count == 1

    r2.transition(ChildTaskState.RUNNING)
    manager.mark_child_terminal("w2", ChildTaskState.SUCCEEDED, make_report())

    notifications = manager.get_pending_notifications()
    assert len(notifications) == 1
    assert notifications[0].still_running_count == 0


# ---------------------------------------------------------------------------
# Compact dependency context & inherited_context
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_129, SWR.SWR_140, SWR.SWR_2132)
def test_dep_context_includes_final_response_for_research_persona(manager):
    record_a = manager.spawn_child("A", "librarian", "research", run_in_background=True)
    task_id_a = record_a.task_id
    manager.spawn_child("B", "coding-agent", "implement it", depends_on=[task_id_a])

    report_a = ChildReportArtifact(
        agent_name="agent",
        persona="librarian",
        status="succeeded",
        summary="Mapped the slash command code paths",
        key_findings="widgets: input_composer.py, slash_commands.py",
        final_response=(
            "Detailed exploration: the slash command registry lives in "
            "src/rotaris_core/tui/widgets/slash_commands.py and is invoked from "
            "input_composer.py. Existing tests cover registry but not overlay."
        ),
    )
    _complete_child(manager, "A", report_a)

    ready = manager.resolve_ready_children()
    payload = ready[0].task_payload
    assert "RESULT:" in payload
    assert "Detailed exploration" in payload
    # authoritative trust framing visible to the child
    assert "authoritative" in payload


@verifies(SWR.SWR_129, SWR.SWR_2132)
def test_dep_context_includes_final_response_for_implementation_persona(manager):
    record_a = manager.spawn_child("A", "coding-agent", "step 1", run_in_background=True)
    task_id_a = record_a.task_id
    manager.spawn_child("B", "tester", "verify", depends_on=[task_id_a])

    report_a = ChildReportArtifact(
        agent_name="agent",
        persona="coding-agent",
        status="succeeded",
        summary="Implemented step 1",
        key_findings=None,
        final_response="A long body the parent already saw and acted on.",
    )
    _complete_child(manager, "A", report_a)

    ready = manager.resolve_ready_children()
    payload = ready[0].task_payload
    assert "RESULT:" in payload
    assert "A long body the parent already saw and acted on." in payload


@verifies(SWR.SWR_129, SWR.SWR_2132)
def test_dep_context_uses_oversized_final_response_when_it_is_the_result(manager):
    record_a = manager.spawn_child("A", "librarian", "research", run_in_background=True)
    task_id_a = record_a.task_id
    manager.spawn_child("B", "coding-agent", "implement", depends_on=[task_id_a])

    huge = "X" * 20000
    report_a = ChildReportArtifact(
        agent_name="agent",
        persona="librarian",
        status="succeeded",
        summary="huge",
        final_response=huge,
    )
    _complete_child(manager, "A", report_a)

    ready = manager.resolve_ready_children()
    payload = ready[0].task_payload
    assert "RESULT:" in payload
    assert huge in payload


@verifies(SWR.SWR_114, SWR.SWR_129, SWR.SWR_2132, SWR.SWR_1532)
def test_build_inherited_context_block_for_succeeded_sibling(manager):
    record_a = manager.spawn_child("A", "planner", "plan", run_in_background=True)
    report_a = ChildReportArtifact(
        agent_name="agent",
        persona="planner",
        status="succeeded",
        summary="Plan summary",
        final_response="Step 1, Step 2, Step 3.",
    )
    _complete_child(manager, "A", report_a)

    block = manager.build_inherited_context_block([record_a.task_id])
    assert "PRIOR AGENT CONTEXT:" in block
    assert "=== A (persona: planner) [succeeded] ===" in block
    assert "RESULT:" in block
    assert "Step 1, Step 2, Step 3." in block


@verifies(SWR.SWR_114)
def test_build_inherited_context_block_skips_unknown_and_pending(manager):
    record_a = manager.spawn_child("A", "planner", "plan", run_in_background=True)
    # not completed → should be skipped silently
    block = manager.build_inherited_context_block([record_a.task_id, "bg_unknown"])
    assert block == ""


@verifies(SWR.SWR_143)
def test_build_inherited_context_block_empty_input(manager):
    assert manager.build_inherited_context_block([]) == ""


@verifies(SWR.SWR_143)
def test_build_inherited_context_block_rejects_empty_string(manager):
    with pytest.raises(ValueError, match="non-empty"):
        manager.build_inherited_context_block([""])


def _make_notification(task_id: str) -> ChildNotification:
    return ChildNotification(
        task_id=task_id,
        canonical_name=f"child-{task_id}",
        description="work",
        state=ChildTaskState.SUCCEEDED,
        duration_s=1.0,
        still_running_count=0,
    )


@verifies(SWR.SWR_107, SWR.SWR_2132)
def test_dependency_context_prefers_final_response_then_last_response(
    manager: ChildManager,
) -> None:
    """Productive use: a dependent child can act on a completed sibling's actual result.
    Expected outcome: terminal text is used first and a terminal-tool child falls back to its last reply."""
    first = manager.spawn_child("first", "researcher", "inspect", run_in_background=True)
    second = manager.spawn_child(
        "second", "builder", "implement", depends_on=[first.task_id], run_in_background=True
    )
    first.transition(ChildTaskState.RUNNING)
    manager.mark_child_terminal(
        first.canonical_name,
        ChildTaskState.SUCCEEDED,
        ChildReportArtifact(
            agent_name=first.canonical_name,
            persona=first.persona,
            status="succeeded",
            summary="Child completed.",
            last_response="I started exploring the module.",
            final_response="The module uses a single registry.",
        ),
    )

    ready = manager.resolve_ready_children()

    assert ready == [second]
    assert "RESULT:\nThe module uses a single registry." in second.task_payload
    assert "I started exploring the module." not in second.task_payload


@verifies(SWR.SWR_141, SWR.SWR_2132)
def test_terminal_result_does_not_create_a_generated_artifact(
    policy: RuntimePolicy, tmp_path
) -> None:
    """Productive use: a parent can receive a child result without publishing it.
    Expected outcome: only explicit artifact writes become durable session artifacts."""
    store = SessionArtifactStore(tmp_path)
    manager = ChildManager("parent", 1, policy, artifact_store=store)
    record = manager.spawn_child("worker", "builder", "inspect", run_in_background=True)
    record.transition(ChildTaskState.RUNNING)

    manager.mark_child_terminal(
        record.canonical_name,
        ChildTaskState.SUCCEEDED,
        ChildReportArtifact(
            agent_name=record.canonical_name,
            persona=record.persona,
            status="succeeded",
            summary="Child completed.",
            final_response="Inspection complete.",
        ),
    )

    assert store.list() == []


@verifies(SWR.SWR_140)
def test_discard_notifications_drops_matching_and_keeps_rest(manager):
    for task_id in ("bg_a", "bg_b", "bg_c"):
        manager.pending_notifications.put(_make_notification(task_id))

    manager.discard_notifications({"bg_a", "bg_c"})

    remaining = manager.get_pending_notifications()
    assert [n.task_id for n in remaining] == ["bg_b"]


@verifies(SWR.SWR_140)
def test_discard_notifications_empty_set_is_noop(manager):
    manager.pending_notifications.put(_make_notification("bg_a"))

    manager.discard_notifications(set())

    assert [n.task_id for n in manager.get_pending_notifications()] == ["bg_a"]


# ── a run that ends leaves no record claiming to run (SWR-2906) ──────────────
"""Productive use: a user reopens a session whose run has ended.
Expected outcome: no agent in it still claims to be running."""


@verifies(SWR.SWR_2912)
def test_finalize_incomplete_cancels_every_unfinished_record(manager):
    queued = manager.spawn_child("queued", "test_persona", "never dispatched")
    running = manager.spawn_child("running", "test_persona", "cut off mid-flight")
    running.transition(ChildTaskState.RUNNING)
    waiting = manager.spawn_child("waiting", "test_persona", "held", depends_on=["queued"])

    closed = manager.finalize_incomplete("Run was cancelled before this agent finished")

    assert set(closed) == {"queued", "running"}
    assert queued.state is ChildTaskState.CANCELLED
    assert running.state is ChildTaskState.CANCELLED
    # Cancelling the dependency cascades BLOCKED onto its dependent, so the
    # sweep finds it already terminal and reports it as none of its doing. What
    # the requirement asks for is that nothing is left open, not who closed it.
    assert waiting.state is ChildTaskState.BLOCKED
    assert manager.all_terminal


@verifies(SWR.SWR_2912)
def test_finalize_incomplete_leaves_terminal_records_alone(manager):
    done = manager.spawn_child("done", "test_persona", "finished properly")
    done.transition(ChildTaskState.RUNNING)
    manager.mark_child_terminal("done", ChildTaskState.SUCCEEDED, make_report("real summary"))
    manager.spawn_child("open", "test_persona", "still queued")

    closed = manager.finalize_incomplete("Run ended")

    assert closed == ["open"]
    assert done.state is ChildTaskState.SUCCEEDED
    assert manager._reports["done"].summary == "real summary"


@verifies(SWR.SWR_2912)
def test_finalize_incomplete_is_idempotent(manager):
    manager.spawn_child("open", "test_persona", "still queued")

    assert manager.finalize_incomplete("Run ended") == ["open"]
    assert manager.finalize_incomplete("Run ended") == []


@verifies(SWR.SWR_2912)
def test_finalize_incomplete_notifies_the_terminal_state_callback(policy):
    seen: list[str] = []
    manager = ChildManager(
        parent_agent_id="parent_1",
        current_depth=1,
        policy=policy,
        terminal_state_callback=lambda record: seen.append(record.canonical_name),
    )
    manager.spawn_child("open", "test_persona", "still queued")

    manager.finalize_incomplete("Run ended")

    # The callback is what the hosts persist from; a swept child that never
    # reached it would stay 'queued' in the snapshot on disk.
    assert seen == ["open"]
