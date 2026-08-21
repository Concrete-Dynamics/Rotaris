# Wait Barrier + Pass-Through Collapse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement backlog candidates 4 and 6 from `docs/plans/2026-07-06-async-architecture-deepening.md`: replace the `conversation._rotaris_waited_ids` attribute smuggling with an explicit `WaitBarrier`, fold the near-identical resume-message builders (deleting two dead methods), and collapse the `run_child` and terminal-wait pass-throughs.

**Architecture:** A new lock-protected `WaitBarrier` (owned by `ChildManager`, since both `WaitForTasksExecutor` and the drain already hold the manager — deviation from the backlog's "scheduler-owned" sketch, justified below) carries the parent-wait handshake keyed by conversation identity. `scheduler_drain.py` loses two dead methods and gains one shared per-report line formatter. `child_run.py` loses the `ChildRunRequest`/`run_child_request` pure pass-throughs; `scheduler.py` merges `wait_for_any_terminal`/`_wait_for_fresh_terminal` into one method with an optional name filter.

**Tech Stack:** Python 3.12, asyncio, threading, pytest (`asyncio_mode = "auto"`).

## Design Notes

- **Barrier home = ChildManager, not Scheduler.** The backlog said "scheduler-owned wait-barrier registry", but `WaitForTasksExecutor` is constructed with only `child_manager` (`agents/tool_registration.py:463`) — routing the scheduler in would add plumbing for no leverage. The manager already sits on both sides of the handshake and is the delegation-DAG owner; the wait request is about that DAG's children.
- **Keyed by `id(conversation)`** — the exact identity semantics of the old attribute (one pending wait per parent conversation; nested parents sharing a manager don't collide). Entries are popped on consume; `child_run.py`'s `finally` calls `discard()` so a parent that errors before its drain can't leak a stale entry into a reused object id.
- **`_run_with_stall_watchdog` stays.** The backlog listed it in the pass-through chain, but it binds four pieces of scheduler state (`config`, `_diag`, `_stall_callback`, `_inject_pending_steering_prompts`) and is the seam unit/integration tests patch (`tests/unit/test_scheduler.py:498,568,2406,2459`, `tests/integration/test_orchestrator_e2e.py:349`). Deletion test fails: the complexity would reappear at both call sites.
- **Dead code found during exploration:** `_collect_waited_reports` and `_build_all_done_resume_message` in `scheduler_drain.py` have zero callers — delete, don't fold.

## Global Constraints

- Line length 100; `target-version = "py312"`; ruff selects `E,F,I,N,W,UP,B,SIM,TCH`.
- Lazy imports: heavy imports inside functions or behind `TYPE_CHECKING`; never `from rotaris_core import X` at module scope in submodules.
- `scheduler ↔ child_manager ↔ delegate_tool` circular-import triangle: cross-imports stay inside function bodies. (`wait_barrier.py` is dependency-light — importable at module scope from both sides.)
- Tests: plain functions, `test_<behavior>()`, `monkeypatch.setattr` on module paths, `asyncio_mode = "auto"`.
- Commit with `git commit --only <explicit paths>` (new files need `git add` first). NEVER commit: `generate_traceability.py`, `tests/unit/test_generate_traceability.py`, `snapshot_report.html` (user's parallel work). The pre-commit hook regenerates and stages `TRACEABILITY.md` itself.
- Bump `pyproject.toml` version at the end (0.65.0 → 0.66.0).
- `make lint`, `make typecheck` must stay clean.
- **Pre-existing test failures (do NOT chase):** baseline is 17 failed / 2135 passed (15 TUI snapshot + `test_coordinator_only_persona_strips_non_orchestration_tools` + `test_resolved_runtime_prompt_matches_coordinator_only_tools`).

## Intentional Behavior Changes

1. `_rotaris_waited_ids` attribute no longer exists anywhere; the handshake is explicit.
2. `_build_child_resume_message` bullet lines gain bold agent names (`- **name** (persona)…`), matching `_build_wait_resume_message`; `_build_wait_resume_message` findings switch to the multi-line `Findings from <name>:` form. Both messages are LLM-facing prose — tests assert substrings only.
3. `wait_for_any_terminal` gains an optional `only_names: set[str] | None` parameter (default `None` = old behavior). `_wait_for_fresh_terminal` is deleted.
4. `run_child_impl` (renamed from `_run_child_impl`) is `child_run.py`'s public seam; `ChildRunRequest` and `run_child_request` are deleted (no external callers).

---

### Task 1: `WaitBarrier` replaces `_rotaris_waited_ids` smuggling

**Files:**
- Create: `src/rotaris_core/orchestrator/wait_barrier.py`
- Modify: `src/rotaris_core/orchestrator/child_manager.py` (`__init__`), `src/rotaris_core/tools/wait_for_tasks.py:85`, `src/rotaris_core/orchestrator/scheduler_drain.py:220-224`, `src/rotaris_core/orchestrator/child_run.py` (`finally` block), `tests/integration/test_orchestrator_e2e.py:649,698`
- Test: `tests/unit/test_wait_barrier.py` (new), `tests/unit/test_wait_for_tasks_tool.py` (extend)

**Interfaces:**
- Produces: `WaitBarrier` with `request_wait(conversation: object, task_ids: list[str]) -> None`, `consume(conversation: object) -> list[str] | None`, `discard(conversation: object) -> None`; `ChildManager.wait_barrier: WaitBarrier` attribute.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/test_wait_barrier.py`:

```python
"""Tests for the wait barrier (explicit wait_for_tasks ↔ drain handshake)."""

from __future__ import annotations

import threading

from rotaris_core.orchestrator.wait_barrier import WaitBarrier


class FakeConversation:
    pass


def test_consume_returns_requested_ids_once() -> None:
    barrier = WaitBarrier()
    conversation = FakeConversation()
    barrier.request_wait(conversation, ["t-1", "t-2"])
    assert barrier.consume(conversation) == ["t-1", "t-2"]
    assert barrier.consume(conversation) is None


def test_consume_without_request_returns_none() -> None:
    barrier = WaitBarrier()
    assert barrier.consume(FakeConversation()) is None


def test_requests_are_isolated_per_conversation() -> None:
    barrier = WaitBarrier()
    first, second = FakeConversation(), FakeConversation()
    barrier.request_wait(first, ["a"])
    barrier.request_wait(second, ["b"])
    assert barrier.consume(second) == ["b"]
    assert barrier.consume(first) == ["a"]


def test_request_stores_a_copy() -> None:
    barrier = WaitBarrier()
    conversation = FakeConversation()
    ids = ["t-1"]
    barrier.request_wait(conversation, ids)
    ids.append("t-2")
    assert barrier.consume(conversation) == ["t-1"]


def test_discard_removes_pending_request() -> None:
    barrier = WaitBarrier()
    conversation = FakeConversation()
    barrier.request_wait(conversation, ["t-1"])
    barrier.discard(conversation)
    assert barrier.consume(conversation) is None
    barrier.discard(conversation)  # idempotent


def test_concurrent_request_and_consume_do_not_corrupt() -> None:
    barrier = WaitBarrier()
    conversations = [FakeConversation() for _ in range(8)]
    errors: list[Exception] = []

    def hammer(conversation: FakeConversation, index: int) -> None:
        try:
            for i in range(200):
                barrier.request_wait(conversation, [f"c{index}-{i}"])
                consumed = barrier.consume(conversation)
                assert consumed == [f"c{index}-{i}"]
        except Exception as exc:  # noqa: BLE001
            errors.append(exc)

    threads = [
        threading.Thread(target=hammer, args=(conversation, index))
        for index, conversation in enumerate(conversations)
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert errors == []
```

Append to `tests/unit/test_wait_for_tasks_tool.py`:

```python
def test_wait_request_lands_in_manager_wait_barrier(manager: ChildManager) -> None:
    record = manager.spawn_child("worker", "builder", "do work", run_in_background=True)
    conversation = PauseableConversation()

    executor = WaitForTasksExecutor(manager)
    executor(WaitForTasksAction(task_ids=[record.task_id]), conversation=conversation)

    assert manager.wait_barrier.consume(conversation) == [record.task_id]
    assert not hasattr(conversation, "_rotaris_waited_ids")


def test_already_done_does_not_register_wait(manager: ChildManager) -> None:
    record = manager.spawn_child("worker", "builder", "do work", run_in_background=True)
    record.transition(ChildTaskState.RUNNING)
    record.transition(ChildTaskState.SUMMARIZING)
    manager.mark_child_terminal("worker", ChildTaskState.SUCCEEDED, _make_report())

    conversation = PauseableConversation()
    executor = WaitForTasksExecutor(manager)
    obs = executor(WaitForTasksAction(task_ids=[record.task_id]), conversation=conversation)

    assert obs.already_done is True
    assert manager.wait_barrier.consume(conversation) is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/unit/test_wait_barrier.py tests/unit/test_wait_for_tasks_tool.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'rotaris_core.orchestrator.wait_barrier'` and `AttributeError: ... wait_barrier`

- [ ] **Step 3: Write `wait_barrier.py`**

```python
"""Explicit wait-barrier handshake between ``wait_for_tasks`` and the drain."""

from __future__ import annotations

import threading


class WaitBarrier:
    """Pending parent-wait requests, keyed by conversation identity.

    ``wait_for_tasks`` (running on the SDK worker thread inside the parent
    conversation's own run loop) registers the task ids the parent wants to
    block on; ``SchedulerDrainMixin._run_wait_barrier_if_requested`` (event
    loop) consumes them.  This replaces the previous handshake of smuggling
    a ``_rotaris_waited_ids`` attribute onto the conversation object.

    Keys are ``id(conversation)`` — the same one-pending-wait-per-parent
    semantics as the old attribute.  ``consume`` pops the entry; call
    ``discard`` on conversation teardown so an unconsumed entry cannot
    outlive its conversation and be misread if the object id is reused.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._pending: dict[int, list[str]] = {}

    def request_wait(self, conversation: object, task_ids: list[str]) -> None:
        with self._lock:
            self._pending[id(conversation)] = list(task_ids)

    def consume(self, conversation: object) -> list[str] | None:
        with self._lock:
            return self._pending.pop(id(conversation), None)

    def discard(self, conversation: object) -> None:
        with self._lock:
            self._pending.pop(id(conversation), None)
```

- [ ] **Step 4: Wire the barrier through**

4a. `child_manager.py` `__init__` — add after `self._model_max_parallel = {}` (module-scope import is fine: `wait_barrier` imports only `threading`):

```python
from rotaris_core.orchestrator.wait_barrier import WaitBarrier
...
        # Explicit wait_for_tasks ↔ drain handshake (see wait_barrier.py).
        self.wait_barrier = WaitBarrier()
```

4b. `tools/wait_for_tasks.py` — replace lines 83-85:

```python
        self._pause_parent_conversation(conversation)
        if conversation is not None:
            self.child_manager.wait_barrier.request_wait(conversation, ids_to_wait)
```

Drop the now-unused `cast` from the smuggling line (keep the one in `_pause_parent_conversation`).

4c. `scheduler_drain.py` `_run_wait_barrier_if_requested` — replace lines 220-224:

```python
        waited_ids = manager.wait_barrier.consume(conversation)
        if waited_ids is None:
            return False

        waited_ids = [task_id for task_id in waited_ids if task_id]
```

4d. `child_run.py` `finally` block — after `self._tool_activity.clear(record.canonical_name)`:

```python
        if manager is not None:
            manager.wait_barrier.discard(conversation)
```

4e. `tests/integration/test_orchestrator_e2e.py` lines 649 and 698 — replace `parent._rotaris_waited_ids = [...]` with `manager.wait_barrier.request_wait(parent, [...])`.

- [ ] **Step 5: Run tests**

Run: `pytest tests/unit/test_wait_barrier.py tests/unit/test_wait_for_tasks_tool.py tests/unit/test_scheduler.py tests/integration/test_orchestrator_e2e.py -q`
Expected: PASS. Also `grep -rn "_rotaris_waited_ids" src/ tests/` returns nothing.

- [ ] **Step 6: Lint + typecheck + commit**

Run: `make lint && make typecheck`

```bash
git add src/rotaris_core/orchestrator/wait_barrier.py tests/unit/test_wait_barrier.py
git commit --only src/rotaris_core/orchestrator/wait_barrier.py src/rotaris_core/orchestrator/child_manager.py src/rotaris_core/tools/wait_for_tasks.py src/rotaris_core/orchestrator/scheduler_drain.py src/rotaris_core/orchestrator/child_run.py tests/unit/test_wait_barrier.py tests/unit/test_wait_for_tasks_tool.py tests/integration/test_orchestrator_e2e.py -m "refactor(orchestrator): explicit WaitBarrier replaces conversation attribute smuggling"
```

---

### Task 2: Fold resume-message builders; delete dead drain methods

**Files:**
- Modify: `src/rotaris_core/orchestrator/scheduler_drain.py` (delete `_collect_waited_reports`, `_build_all_done_resume_message`; add `_append_child_report_lines`; rewrite `_build_wait_resume_message` + `_build_child_resume_message` bodies)
- Test: `tests/unit/test_scheduler.py` (existing substring assertions at 240-244, 426-431 must keep passing; add one format-parity test)

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/test_scheduler.py`:

```python
def test_wait_and_child_resume_messages_share_report_line_format() -> None:
    scheduler, _ = make_scheduler()
    record = ChildTaskRecord(
        name="worker",
        canonical_name="worker",
        persona="builder",
        task_payload="inspect",
    )
    report = ChildReportArtifact(
        agent_name="worker",
        persona="builder",
        status="succeeded",
        summary="Did the thing",
        key_findings="Detail line",
    )

    child_message = scheduler._build_child_resume_message([(record, report)])
    wait_message = scheduler._build_wait_resume_message([(record, report)])

    expected_bullet = "- **worker** (builder) [succeeded]: Did the thing"
    assert expected_bullet in child_message
    assert expected_bullet in wait_message
    assert "Findings from worker:" in child_message
    assert "Findings from worker:" in wait_message
```

- [ ] **Step 2: Run to verify it fails**

Run: `pytest tests/unit/test_scheduler.py -q -k share_report_line_format`
Expected: FAIL (child message has no bold name; wait message has inline `Findings:`)

- [ ] **Step 3: Implement**

In `scheduler_drain.py`: delete `_collect_waited_reports` (lines 345-359) and `_build_all_done_resume_message` (lines 416-434). Add the shared formatter and rewrite both builders' per-report loops to use it:

```python
    def _append_child_report_lines(
        self,
        lines: list[str],
        record: ChildTaskRecord,
        report: ChildReportArtifact,
    ) -> None:
        lines.append(
            f"- **{record.canonical_name}** ({record.persona}) "
            f"[{report.status}]: {report.summary}",
        )
        artifact_refs = self._format_report_artifact_refs(report)
        if artifact_refs:
            lines.append(f"  Artifacts: {artifact_refs}")
        detail = self._format_parent_resume_detail(report)
        if detail:
            lines.append(f"\n  Findings from {record.canonical_name}:\n{detail}")
```

`_build_wait_resume_message` and `_build_child_resume_message` keep their distinct intro lines; their per-report bodies become `self._append_child_report_lines(lines, record, report)`.

- [ ] **Step 4: Run tests + lint + typecheck**

Run: `pytest tests/unit/test_scheduler.py tests/integration/test_orchestrator_e2e.py -q && make lint && make typecheck`
Expected: PASS / clean.

- [ ] **Step 5: Commit**

```bash
git commit --only src/rotaris_core/orchestrator/scheduler_drain.py tests/unit/test_scheduler.py -m "refactor(orchestrator): fold resume-message report lines; drop dead drain methods"
```

---

### Task 3: Collapse `ChildRunRequest` / `run_child_request`

**Files:**
- Modify: `src/rotaris_core/orchestrator/child_run.py` (delete dataclass + wrapper, rename `_run_child_impl` → `run_child_impl`), `src/rotaris_core/orchestrator/scheduler.py:497-522` (`run_child` calls `run_child_impl` directly)

Both symbols have zero callers outside `scheduler.py:509-522`; deletion test passes (complexity vanishes).

- [ ] **Step 1: Implement**

`child_run.py`: delete `ChildRunRequest` and `run_child_request`; remove `from dataclasses import dataclass` if now unused; rename `_run_child_impl` to `run_child_impl` (same signature, `self: Scheduler` first parameter).

`scheduler.py` `run_child` body:

```python
        from rotaris_core.orchestrator.child_run import run_child_impl

        return await run_child_impl(
            self,
            record,
            agent,
            manager=manager,
            agent_factory=agent_factory,
            todo_correction_provider=todo_correction_provider,
            max_todo_corrections=max_todo_corrections,
            open_todo_items_provider=open_todo_items_provider,
        )
```

- [ ] **Step 2: Verify**

Run: `grep -rn "ChildRunRequest\|run_child_request\|_run_child_impl" src/ tests/` → nothing. Then `pytest tests/unit/test_scheduler.py tests/integration/test_orchestrator_e2e.py -q && make lint && make typecheck`
Expected: PASS / clean.

- [ ] **Step 3: Commit**

```bash
git commit --only src/rotaris_core/orchestrator/child_run.py src/rotaris_core/orchestrator/scheduler.py -m "refactor(orchestrator): run_child calls run_child_impl directly"
```

---

### Task 4: Merge `wait_for_any_terminal` / `_wait_for_fresh_terminal`

**Files:**
- Modify: `src/rotaris_core/orchestrator/scheduler.py:760-858` (one method with `only_names` filter; delete the twin), `src/rotaris_core/orchestrator/scheduler_drain.py:66-71,172` (stub + call site)
- Test: `tests/unit/test_scheduler.py` (add filter test)

**Interfaces:**
- Produces: `async def wait_for_any_terminal(self, manager: ChildManager, only_names: set[str] | None = None) -> list[tuple[ChildTaskRecord, ChildReportArtifact]]`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/test_scheduler.py` (reuse the file's existing helpers for spawning children with active tasks; the shape below assumes two active tasks where only the filtered one completes promptly):

```python
async def test_wait_for_any_terminal_only_names_ignores_other_tasks() -> None:
    scheduler, manager = make_scheduler_with_two_active_children()  # adapt to file's helpers
    # Complete only "fresh-child"; "outer-parent" never finishes.
    terminal = await scheduler.wait_for_any_terminal(manager, only_names={"fresh-child"})
    names = [record.canonical_name for record, _ in terminal]
    assert "fresh-child" in names
```

(Exact fixture wiring to be adapted from the existing `wait_for_any_terminal` tests at lines 1958-2030 — same mock conversation pattern; the essential assertion is that a filtered call returns without the unfiltered task completing.)

- [ ] **Step 2: Implement**

`scheduler.py` — replace both methods with one:

```python
    async def wait_for_any_terminal(
        self,
        manager: ChildManager,
        only_names: set[str] | None = None,
    ) -> list[tuple[ChildTaskRecord, ChildReportArtifact]]:
        """Wait until at least one active task completes.

        When ``only_names`` is given, only tasks with those canonical names
        are awaited — the drain loops pass their freshly spawned names to
        avoid deadlocking on the *current* (outer) task, which is also in
        ``_active_tasks``.
        """
        if only_names is None:
            candidates = dict(self._active_tasks)
        else:
            candidates = {
                name: task for name, task in self._active_tasks.items() if name in only_names
            }
        if not candidates:
            return manager.get_newly_terminal()

        task_names = {task: name for name, task in candidates.items()}
        done, _ = await asyncio.wait(
            tuple(task_names.keys()),
            return_when=asyncio.FIRST_COMPLETED,
        )

        for task in done:
            canonical_name = task_names[task]
            record = manager._children[canonical_name]

            try:
                report = task.result()
                terminal_state = self._report_status_to_terminal_state(report.status)
            except asyncio.CancelledError:
                report = ChildReportArtifact(
                    agent_name=canonical_name,
                    persona=record.persona,
                    status="cancelled",
                    summary="Task was cancelled",
                )
                terminal_state = ChildTaskState.CANCELLED
            except Exception as exc:
                report = ChildReportArtifact(
                    agent_name=canonical_name,
                    persona=record.persona,
                    status="failed",
                    summary=f"Task failed: {exc}",
                )
                terminal_state = ChildTaskState.FAILED

            if not record.state.is_terminal():
                manager.mark_child_terminal(canonical_name, terminal_state, report)

        return manager.get_newly_terminal()
```

`scheduler_drain.py` — replace the `_wait_for_fresh_terminal` stub (lines 66-71) with:

```python
    async def wait_for_any_terminal(
        self,
        manager: ChildManager,
        only_names: set[str] | None = None,
    ) -> list[tuple[ChildTaskRecord, ChildReportArtifact]]:
        raise NotImplementedError
```

and line 172 with `terminal_children = await self.wait_for_any_terminal(manager, only_names=fresh)`. Update the docstring reference at line 92 if it names `wait_for_any_terminal` semantics that changed (it doesn't — keep).

- [ ] **Step 3: Verify**

Run: `grep -rn "_wait_for_fresh_terminal" src/ tests/` → nothing. Then `pytest tests/unit/test_scheduler.py tests/integration/test_orchestrator_e2e.py -q && make lint && make typecheck`
Expected: PASS / clean.

- [ ] **Step 4: Commit**

```bash
git commit --only src/rotaris_core/orchestrator/scheduler.py src/rotaris_core/orchestrator/scheduler_drain.py tests/unit/test_scheduler.py -m "refactor(orchestrator): merge terminal-wait twins behind only_names filter"
```

---

### Task 5: Full sweep, docs, version bump

**Files:**
- Modify: `CLAUDE.md`, `CONTEXT.md`, `pyproject.toml` (0.65.0 → 0.66.0), `docs/plans/2026-07-06-async-architecture-deepening.md` (mark candidates 4+6 done)

- [ ] **Step 1: Full test sweep**

Run: `pytest tests/ -q 2>&1 | tail -3`
Expected: exactly the pre-existing baseline (17 failed), no new failures.

- [ ] **Step 2: Docs**

- `CLAUDE.md`: in the architecture section, note the wait handshake: `wait_for_tasks` registers waited ids in `ChildManager.wait_barrier`; the drain consumes them (no conversation attribute smuggling).
- `CONTEXT.md`: domain-language row **Wait Barrier**; design-decision paragraph (explicit handshake, keyed by conversation identity, discard on conversation teardown).

- [ ] **Step 3: Version bump + commit**

```bash
git commit --only CLAUDE.md CONTEXT.md pyproject.toml docs/plans/2026-07-07-wait-barrier-and-passthrough-collapse.md docs/plans/2026-07-06-async-architecture-deepening.md -m "docs: document WaitBarrier handshake; bump to 0.66.0"
```
