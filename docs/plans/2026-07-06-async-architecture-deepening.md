# Async Architecture Deepening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the two biggest async-architecture duplications: unify the Ralph iteration behind an observer seam (candidate 1) and extract a shared run-bootstrap module used by both CLI background and TUI runs (candidate 5).

**Architecture:** `RalphLoop._run_iteration` becomes the single implementation of iteration semantics; TUI side-effects move behind a new `RalphIterationObserver` seam (no-op default adapter for headless runs, `TuiIterationObserver` adapter for the TUI). A new `ralph/bootstrap.py` module owns the run-setup pipeline (intent classification, todo construction, summary-agent / improvement-collector / agent factories, post-run state application); `cli/background.py` and `tui/app_run.py` become thin adapters over it.

**Tech Stack:** Python 3.12, asyncio, Textual, OpenHands SDK, pytest (`asyncio_mode = "auto"`).

## Candidate Backlog (from 2026-07-06 architecture review)

This plan implements candidates 1 and 5. The rest are recorded for future plans:

1. **One Ralph iteration, one UI seam** (`ralph/loop.py:573-807` vs `tui/ralph_loop.py:294-695`) — THIS PLAN.
2. **Session persistence off the event loop** — `persist_state` fans out to 7+ synchronous atomic writes on the loop thread (`session/manager.py`, `session/persistence.py`, `session/diagnostics.py:72-96`); two independent debounce layers. Deepen into one async-interface persistence module (`await session.persist(state)`, single debounce, `asyncio.to_thread` writer, guaranteed final flush).
3. **Conversation control seam** — `pause_with_daemon` / `close_conversation_async` / `_graceful_pause_conversation` are three variants of "run blocking conversation method on daemon thread with timeout"; `_active_tool_ids` is read cross-thread without a lock (`scheduler.py:944` vs `child_run.py:1071`). Deepen into one `ConversationControl` module.
4. **Explicit wait barrier** — DONE 2026-07-07 (`docs/plans/2026-07-07-wait-barrier-and-passthrough-collapse.md`): `ChildManager.wait_barrier` (`orchestrator/wait_barrier.py`) replaced the `conversation._rotaris_waited_ids` smuggling; resume-message report lines folded into `_append_child_report_lines`; dead `_collect_waited_reports` / `_build_all_done_resume_message` deleted.
5. **Run bootstrap module (CLI vs TUI)** (`cli/background.py:144-419` vs `tui/app_run.py:45-1044`) — THIS PLAN.
6. **Collapse agent-execution pass-throughs** — DONE 2026-07-07 (same plan doc as candidate 4): `ChildRunRequest`/`run_child_request` deleted (`run_child` calls `run_child_impl` directly); `wait_for_any_terminal` gained an `only_names` filter and absorbed `_wait_for_fresh_terminal`. `_run_with_stall_watchdog` intentionally kept — it binds scheduler state and is the seam tests patch.

## Global Constraints

- Line length 100; `target-version = "py312"`; ruff selects `E,F,I,N,W,UP,B,SIM,TCH`.
- Lazy imports: heavy imports inside functions or behind `TYPE_CHECKING`; never `from rotaris_core import X` at module scope in submodules.
- `scheduler ↔ child_manager ↔ delegate_tool` circular-import triangle: cross-imports stay inside function bodies.
- All state changes on `ChildTaskRecord` go through `record.transition(new_state)`.
- Mock preference: `monkeypatch.setattr` on module path; tests are plain functions, `test_<behavior>()` naming; `asyncio_mode = "auto"`.
- Bump `pyproject.toml` version after the work (0.63.9 → 0.64.0).
- `make lint`, `make typecheck` must stay clean on touched files.
- **Pre-existing test failures (do NOT chase in this plan):** 15 TUI snapshot tests + `test_coordinator_only_persona_strips_non_orchestration_tools` + `test_resolved_runtime_prompt_matches_coordinator_only_tools` were already failing before this plan. Baseline: 17 failed / 2100 passed.

## Intentional Behavior Changes (all in Task 1/2)

These unify divergent semantics onto the base-loop versions (the newer, documented ones):

1. **TUI `blocked` status → PENDING re-queue** (was: ABANDONED + `cancel_children`). Base comment at `ralph/loop.py:772-778` documents why: blocked means the orchestrator delegated to background children that are still running; cancelling them defeats the shutdown-drain work (`_drain_active_children_before_stop`).
2. **TUI gains escalation handling**: `report.escalation is not None` → `_session_abort_requested = True` (previously base-only; TUI silently ignored escalations).
3. **Base (headless) agent build moves off the event loop**: `await asyncio.to_thread(agent_factory, ...)` (previously the CLI path built agents synchronously on the loop; the TUI path already offloaded).
4. **Child-spawn UI notifications are marshalled via `dispatch_ui`** (previously invoked directly — nested spawns from the delegate tool fired UI mutations on the SDK worker thread).
5. **Iteration token usage is aggregate-first in both paths** (TUI previously stored the per-agent snapshot in `RalphIterationState.token_usage`; the GlobalTracker aggregate is documented as authoritative).
6. **TUI summary-agent factory raises `ValueError` when no summary model is configured** (CLI parity; previously TUI passed `None` into `load_llm_for_model` and failed later with a worse error).
7. **TUI iteration `started_at`/`ended_at` use real clock** (`dt.datetime.now(dt.UTC)`), not `state.updated_at`.

---

### Task 0: Commit pending working-tree changes

The working tree contains last session's shutdown-drain fixes (uncommitted): `CLAUDE.md`, `pyproject.toml`, `snapshot_report.html`, `src/rotaris_core/config/schema.py`, `src/rotaris_core/orchestrator/scheduler.py`, `src/rotaris_core/ralph/loop.py`, `src/rotaris_core/tools/wait_for_tasks.py`. This plan's refactor builds on top; commit them first so refactor diffs stay reviewable.

- [ ] **Step 1: Verify the drain changes still pass their targeted tests**

Run: `source venv/bin/activate && pytest tests/unit/test_ralph_loop.py tests/unit/test_scheduler*.py -q`
Expected: PASS (0 failures in these files)

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md pyproject.toml snapshot_report.html src/rotaris_core/config/schema.py src/rotaris_core/orchestrator/scheduler.py src/rotaris_core/ralph/loop.py src/rotaris_core/tools/wait_for_tasks.py
git commit -m "feat: drain background children before natural stop; pause via daemon everywhere

- runtime.shutdown_drain_timeout (default 120s)
- Scheduler.has_active_children() / drain_active_children(timeout)
- child_force_cancelled + background_child_drain_timeout diagnostic issues
- wait_for_tasks routes through pause_with_daemon()"
```

---

### Task 1: `RalphIterationObserver` seam + unified base `_run_iteration`

**Files:**
- Create: `src/rotaris_core/ralph/iteration_observer.py`
- Modify: `src/rotaris_core/ralph/loop.py` (constructor + `_run_iteration` + new `_capture_iteration_tokens`)
- Test: `tests/unit/test_ralph_loop.py` (append new tests)

**Interfaces:**
- Consumes: existing `RalphLoop`, `ChildManager`, `Scheduler.run_child`.
- Produces: `RalphIterationObserver` class with hooks (exact signatures below); `RalphLoop.__init__(..., iteration_observer: RalphIterationObserver | None = None)`; `RalphLoop._observer` attribute; `RalphLoop._capture_iteration_tokens(record) -> dict[str, Any] | None`. Task 2 subclasses `RalphIterationObserver` and relies on every hook firing exactly at the points shown in the `_run_iteration` code below.

- [ ] **Step 1: Write the observer module**

Create `src/rotaris_core/ralph/iteration_observer.py`:

```python
from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from rotaris_core.orchestrator.child_manager import ChildManager
    from rotaris_core.orchestrator.child_state import ChildTaskRecord
    from rotaris_core.orchestrator.report import ChildReportArtifact
    from rotaris_core.ralph.state import RalphIterationOutcome
    from rotaris_core.tools.todo_state import TodoList, TodoTask


class RalphIterationObserver:
    """Lifecycle hooks for one Ralph iteration.

    The base loop drives all orchestration semantics; an observer only
    mirrors progress to a host surface (TUI today, other frontends later).
    This default implementation is a no-op — headless runs use it directly.

    Threading contract: every hook is invoked on the event loop thread
    EXCEPT ``on_child_spawned``, which the delegate tool may fire from an
    ``asyncio.to_thread`` worker. Implementations that touch UI or shared
    state must marshal accordingly.
    """

    def on_iteration_start(self, iteration_num: int, task: TodoTask) -> None:
        """Called after the task is marked IN_PROGRESS, before the child spawns."""

    def on_child_spawned(self, record: ChildTaskRecord, manager: ChildManager) -> None:
        """ChildManager spawn notification — may fire on a worker thread."""

    def on_child_created(
        self, record: ChildTaskRecord, manager: ChildManager, todo: TodoList
    ) -> None:
        """Called after the iteration's root child is spawned and reparented."""

    def on_child_running(self, record: ChildTaskRecord, manager: ChildManager) -> None:
        """Called after the root child transitions to RUNNING."""

    def on_todo_state(self, todo: TodoList) -> None:
        """Called whenever the agent updates its todo list mid-run."""

    def extra_runtime_kwargs(self) -> dict[str, Any]:
        """Additional runtime kwargs merged into the root agent's factory call."""
        return {}

    def bind_scheduler_callbacks(self, manager: ChildManager) -> None:
        """Called before the child runs; wire per-iteration scheduler callbacks."""

    def unbind_scheduler_callbacks(self) -> None:
        """Always called after the child run finishes (success, error, or cancel)."""

    def on_last_prompt_tokens(self, record: ChildTaskRecord, tokens: int) -> None:
        """Called with the root agent's last prompt token count, when available."""

    def on_token_aggregate(self, usage: dict[str, Any] | None) -> None:
        """Called once per iteration with the captured token usage snapshot."""

    def on_iteration_end(
        self,
        record: ChildTaskRecord,
        report: ChildReportArtifact,
        manager: ChildManager,
        todo: TodoList,
        outcome: RalphIterationOutcome,
    ) -> None:
        """Called after outcome resolution, before the iteration state is returned."""
```

- [ ] **Step 2: Write the failing tests**

Append to `tests/unit/test_ralph_loop.py`:

```python
from rotaris_core.ralph.iteration_observer import RalphIterationObserver


class RecordingObserver(RalphIterationObserver):
    def __init__(self) -> None:
        self.calls: list[str] = []
        self.outcomes: list[Any] = []
        self.runtime_extra_used = False

    def on_iteration_start(self, iteration_num, task):
        self.calls.append("iteration_start")

    def on_child_created(self, record, manager, todo):
        self.calls.append("child_created")

    def on_child_running(self, record, manager):
        self.calls.append("child_running")

    def extra_runtime_kwargs(self):
        self.runtime_extra_used = True
        return {"observer_marker": True}

    def bind_scheduler_callbacks(self, manager):
        self.calls.append("bind")

    def unbind_scheduler_callbacks(self):
        self.calls.append("unbind")

    def on_token_aggregate(self, usage):
        self.calls.append("token_aggregate")

    def on_iteration_end(self, record, report, manager, todo, outcome):
        self.calls.append("iteration_end")
        self.outcomes.append(outcome)


async def test_iteration_observer_hooks_fire_in_order():
    observer = RecordingObserver()
    loop = RalphLoop(
        config=make_config(),
        workspace_root="/tmp/test",
        summary_agent=MockSummaryAgent(),
        conversation_factory=lambda agent: MockConversation(),
        iteration_observer=observer,
    )
    task = TodoTask(name="observed", description="observed")
    task.set_execution_context("observed")
    todo = make_todo(task)
    captured_kwargs: dict[str, Any] = {}

    def agent_factory(persona, runtime_kwargs=None, model_override=None):
        if runtime_kwargs:
            captured_kwargs.update(runtime_kwargs)
        return {"persona": persona}

    await loop.run(todo=todo, agent_factory=agent_factory, session_id="obs", max_iterations=1)

    assert observer.calls == [
        "iteration_start",
        "child_created",
        "child_running",
        "bind",
        "unbind",
        "token_aggregate",
        "iteration_end",
    ]
    assert observer.runtime_extra_used
    assert captured_kwargs.get("observer_marker") is True


async def test_iteration_observer_unbind_called_on_child_failure():
    observer = RecordingObserver()
    loop = RalphLoop(
        config=make_config(),
        workspace_root="/tmp/test",
        summary_agent=MockSummaryAgent(),
        conversation_factory=lambda agent: MockConversation(should_fail=True),
        iteration_observer=observer,
    )
    task = TodoTask(name="failing", description="failing")
    task.set_execution_context("failing")
    todo = make_todo(task)

    await loop.run(
        todo=todo,
        agent_factory=lambda persona, rk=None, model_override=None: {"persona": persona},
        session_id="obs-fail",
        max_iterations=1,
    )

    assert "bind" in observer.calls
    assert "unbind" in observer.calls
    assert observer.calls.index("unbind") > observer.calls.index("bind")
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pytest tests/unit/test_ralph_loop.py::test_iteration_observer_hooks_fire_in_order -v`
Expected: FAIL with `ModuleNotFoundError` / `TypeError: __init__() got an unexpected keyword argument 'iteration_observer'`

- [ ] **Step 4: Wire the observer into `RalphLoop`**

In `src/rotaris_core/ralph/loop.py`:

4a. Add module-level import (the observer module is dependency-light — no heavy imports):

```python
from rotaris_core.ralph.iteration_observer import RalphIterationObserver
```

4b. Add constructor kwarg. In `RalphLoop.__init__`, after `improvement_collector_factory` parameter add:

```python
        iteration_observer: RalphIterationObserver | None = None,
```

and in the body (next to `self._improvement_collector_factory = ...`):

```python
        self._observer: RalphIterationObserver = iteration_observer or RalphIterationObserver()
```

4c. Replace the entire `_run_iteration` method (lines 573-807, including the leftover LLM-commentary junk comments at 581-599 and the `del todo`) with:

```python
    async def _run_iteration(
        self,
        iteration_num: int,
        task: TodoTask,
        progress: RalphProgressFile,
        agent_factory: RalphAgentFactory,
        todo: TodoList,
    ) -> RalphIterationState:
        started_at = dt.datetime.now(dt.UTC)
        task.status = TaskStatus.IN_PROGRESS
        self._observer.on_iteration_start(iteration_num, task)
        self.scheduler.diagnostics.timeline(
            "iteration_start",
            actor="ralph",
            message=f"Starting iteration {iteration_num}: {task.name}",
            metadata={"iteration": iteration_num, "task_id": task.id, "task_name": task.name},
        )

        manager = ChildManager(
            parent_agent_id="ralph",
            current_depth=0,
            policy=self.config.runtime,
            spawn_notification_callback=lambda spawned: self._observer.on_child_spawned(
                spawned,
                manager,
            ),
            artifact_store=self.artifact_store,
        )
        record = manager.spawn_child(
            name=task.name,
            persona=self.config.default_persona,
            task_payload=task.execution_payload,
        )
        manager.rebind_parent(record.canonical_name)
        self._observer.on_child_created(record, manager, todo)

        record.transition(ChildTaskState.RUNNING)
        manager.bump_version()
        self._observer.on_child_running(record, manager)

        # Capture the agent's final todo state to validate completion.
        _last_todo_state: list[TodoList] = []

        def _capture_todo_state(todo_update: TodoList) -> None:
            _last_todo_state[:] = [todo_update]
            self._observer.on_todo_state(todo_update)

        runtime_kwargs: dict[str, Any] = {
            "child_manager": manager,
            "scheduler": self.scheduler,
            "agent_factory": agent_factory,
            "todo_state_callback": _capture_todo_state,
        }
        runtime_kwargs.update(self._observer.extra_runtime_kwargs())

        def _todo_correction_provider() -> str | None:
            """Return a correction message if the agent left todos incomplete, else None."""
            incomplete_now = self._get_incomplete_todo_tasks(
                _last_todo_state[-1] if _last_todo_state else None,
            )
            if not incomplete_now:
                return None
            return self._build_incomplete_todo_correction(incomplete_now)

        def _open_todo_items_provider() -> list[str]:
            return [
                item.name
                for item in self._get_incomplete_todo_tasks(
                    _last_todo_state[-1] if _last_todo_state else None,
                )
            ]

        # Build a recursive factory for nested (delegated) children.  Passing
        # runtime_kwargs with the shared child_manager and scheduler lets nested
        # personas that declare ``delegate`` in their tools actually receive the
        # RotarisDelegateTool at agent-creation time.  Without this, create_agent_for_persona
        # silently drops the delegate tool when runtime_kwargs is None.
        _scheduler_ref = self.scheduler

        def _nested_child_factory(
            persona: str,
            _rk: dict[str, Any] | None = None,
            model_override: str | None = None,
        ) -> Any:
            nested_rk: dict[str, Any] = {
                "child_manager": manager,
                "scheduler": _scheduler_ref,
                "agent_factory": _nested_child_factory,
            }
            if _rk:
                nested_rk.update(_rk)
            return agent_factory(persona, nested_rk, model_override=model_override)

        self._observer.bind_scheduler_callbacks(manager)
        try:
            # Agent construction loads LLMs and reads config/prompts from
            # disk — keep it off the event loop.
            agent = await asyncio.to_thread(agent_factory, record.persona, runtime_kwargs)
            report = await self.scheduler.run_child(
                record,
                agent,
                manager=manager,
                agent_factory=_nested_child_factory,
                todo_correction_provider=_todo_correction_provider,
                max_todo_corrections=self.config.runtime.auto_retries_validation,
                open_todo_items_provider=_open_todo_items_provider,
            )
        except asyncio.CancelledError:
            await self.scheduler.cancel_children(manager)
            _log.info(
                "Child %s iteration cancelled during shutdown",
                record.canonical_name,
            )
            raise
        except Exception:
            await self.scheduler.cancel_children(manager)
            raise
        finally:
            self._observer.unbind_scheduler_callbacks()

        _iter_token_usage = self._capture_iteration_tokens(record)
        self._observer.on_token_aggregate(_iter_token_usage)

        incomplete = self._get_incomplete_todo_tasks(
            _last_todo_state[-1] if _last_todo_state else None,
        )
        if report.status == "succeeded" and incomplete:
            report = report.model_copy(
                update={
                    "summary": (
                        self._format_incomplete_todo_summary(incomplete)
                        + ". Re-queued task for the next iteration to continue the todo list."
                    ),
                },
            )
            self._set_incomplete_todo_continuation_payload(task, incomplete, manager=manager)
            task.status = TaskStatus.PENDING
            manager.mark_child_terminal(record.canonical_name, ChildTaskState.SUCCEEDED, report)
            self._observer.on_iteration_end(
                record,
                report,
                manager,
                todo,
                RalphIterationOutcome.PENDING,
            )
            self.scheduler.diagnostics.timeline(
                "iteration_end",
                actor="ralph",
                message=f"Iteration {iteration_num} pending continuation",
                metadata={
                    "iteration": iteration_num,
                    "outcome": str(RalphIterationOutcome.PENDING),
                },
            )
            return RalphIterationState(
                iteration_number=iteration_num,
                task_id=task.id,
                task_name=task.name,
                started_at=started_at,
                ended_at=dt.datetime.now(dt.UTC),
                outcome=RalphIterationOutcome.PENDING,
                commit_sha=None,
                report_summary=report.summary,
                agent_response=report.final_response,
                token_usage=_iter_token_usage,
            )

        # Classify whether the work is complete or needs another iteration.
        # Uses the small_model LLM; skipped when classify_completion=False.
        open_todos = _open_todo_items_provider()
        report = await self._classify_completion(task, report, open_todos=open_todos)

        if report.status == "succeeded":
            task.status = TaskStatus.COMPLETED
            outcome = RalphIterationOutcome.COMPLETED
            progress.completed_tasks += 1
            manager.mark_child_terminal(record.canonical_name, ChildTaskState.SUCCEEDED, report)
        elif report.status in {"failed", "cancelled"}:
            await self.scheduler.cancel_children(manager)
            task.status = TaskStatus.ABANDONED
            outcome = RalphIterationOutcome.ABANDONED
            progress.abandoned_tasks += 1
            manager.mark_child_terminal(record.canonical_name, ChildTaskState.FAILED, report)
            if report.escalation is not None:
                self._session_abort_requested = True
        elif report.status == "blocked":
            # Coordinator-only personas (e.g. orchestrator) may delegate work and
            # end their conversation before results arrive.  "blocked" means the
            # agent dispatched children and is waiting — re-queue for the next
            # iteration instead of aborting.  Do NOT cancel children: they are
            # still running (or have already completed) and the next iteration's
            # agent will collect their results via background_output/task_tracker.
            task.status = TaskStatus.PENDING
            outcome = RalphIterationOutcome.PENDING
        else:
            task.status = TaskStatus.PENDING
            outcome = RalphIterationOutcome.PENDING

        self._observer.on_iteration_end(record, report, manager, todo, outcome)
        self.scheduler.diagnostics.timeline(
            "iteration_end",
            actor="ralph",
            message=f"Iteration {iteration_num} ended with {outcome}",
            metadata={
                "iteration": iteration_num,
                "outcome": str(outcome),
                "summary": report.summary,
            },
        )

        return RalphIterationState(
            iteration_number=iteration_num,
            task_id=task.id,
            task_name=task.name,
            started_at=started_at,
            ended_at=dt.datetime.now(dt.UTC),
            outcome=outcome,
            commit_sha=None,
            report_summary=report.summary,
            agent_response=report.final_response,
            token_usage=_iter_token_usage,
        )
```

4d. Add the merged token-capture helper as a new method on `RalphLoop` (place it right after `_run_iteration`; it replaces the inline token block previously at lines 696-718):

```python
    def _capture_iteration_tokens(self, record: ChildTaskRecord) -> dict[str, Any] | None:
        """Return this iteration's token usage snapshot.

        The GlobalTracker aggregate is authoritative — ``extract_token_usage``
        returns the LLM's *cumulative* running total, so summing per-iteration
        values double-counts.  The per-agent snapshot is only a fallback when
        the tracker has recorded nothing.  Also records the root agent's last
        prompt token count (context size) when available.
        """
        from rotaris_core.tokens import extract_token_usage, get_last_prompt_token_count
        from rotaris_core.tracking.tracker import GlobalTracker

        usage: dict[str, Any] | None = None
        aggregate = GlobalTracker().get_global_tokens()
        if aggregate.total_tokens > 0:
            usage = aggregate.model_dump(mode="json")

        agent_ref = getattr(record, "_agent_ref", None)
        if agent_ref is None:
            for conv in self.scheduler._active_conversations.values():
                agent_ref = getattr(conv, "agent", None)
                if agent_ref is not None:
                    break
        if agent_ref is not None:
            agent_llm = getattr(agent_ref, "llm", None)
            if agent_llm is not None:
                if usage is None:
                    snap = extract_token_usage(agent_llm)
                    if snap.total_tokens > 0:
                        usage = snap.model_dump(mode="json")
                last_prompt = get_last_prompt_token_count(agent_llm)
                if last_prompt is not None and last_prompt > 0:
                    GlobalTracker().set_agent_last_prompt_tokens(
                        record.canonical_name,
                        int(last_prompt),
                    )
                    self._observer.on_last_prompt_tokens(record, int(last_prompt))
        return usage
```

Note: `ChildTaskRecord` is already imported under `TYPE_CHECKING` in loop.py. The `from rotaris_core.tokens import ...` module-level import previously inside `_run_iteration` (lines 702-703) is now inside `_capture_iteration_tokens`.

- [ ] **Step 5: Run the new tests**

Run: `pytest tests/unit/test_ralph_loop.py -v -k observer`
Expected: PASS (both new tests)

- [ ] **Step 6: Run the whole ralph test file + lint + typecheck**

Run: `pytest tests/unit/test_ralph_loop.py -q && ruff check src/rotaris_core/ralph/ && mypy src/rotaris_core/ralph/loop.py src/rotaris_core/ralph/iteration_observer.py`
Expected: all existing base-loop tests still PASS (the TUI-loop tests in this file still exercise the old override — untouched until Task 2). Lint/mypy clean.

- [ ] **Step 7: Commit**

```bash
git add src/rotaris_core/ralph/iteration_observer.py src/rotaris_core/ralph/loop.py tests/unit/test_ralph_loop.py
git commit -m "feat(ralph): add RalphIterationObserver seam to base _run_iteration

Base loop now: builds agents via asyncio.to_thread, fires observer
lifecycle hooks, captures tokens via merged _capture_iteration_tokens
(aggregate-first + last-prompt), and drops leftover junk comments."
```

---

### Task 2: `TuiRalphLoop` becomes an observer adapter (delete the override)

**Files:**
- Modify: `src/rotaris_core/tui/ralph_loop.py` (delete `_run_iteration` override lines 294-695; add `TuiIterationObserver`)
- Test: `tests/unit/test_ralph_loop.py` (TUI tests)

**Interfaces:**
- Consumes: `RalphIterationObserver` (Task 1), all existing `TuiRalphLoop` constructor callbacks (`sync_children`, `dispatch_ui`, `set_live_activity`, `push_activity_event`, `notify_child_spawn`, `apply_conversation_event`, `apply_token_event`, `update_agent_todo`, `persist_state`, `store_report`).
- Produces: `TuiIterationObserver(loop: TuiRalphLoop)` in `tui/ralph_loop.py`; `TuiRalphLoop` public constructor signature UNCHANGED (Task 5 depends on that).

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/test_ralph_loop.py`:

```python
async def test_tui_run_iteration_blocked_requeues_task_as_pending() -> None:
    blocked_report = ChildReportArtifact(
        agent_name="ralph-child",
        persona="orchestrator",
        status="blocked",
        summary="Delegated to background children; waiting",
    )
    loop, _runtime_kwargs, _stored, state, _sync = make_tui_loop(report=blocked_report)
    task = TodoTask(name="delegating", description="delegating")
    task.set_execution_context("delegating")
    todo = make_todo(task)
    progress = RalphProgressFile(
        session_id="session-tui",
        started_at=dt.datetime.now(dt.UTC),
        total_tasks=1,
    )

    iteration = await loop._run_iteration(
        iteration_num=1,
        task=task,
        progress=progress,
        agent_factory=loop._test_agent_factory,
        todo=todo,
    )

    # "blocked" means background children are still running — the task is
    # re-queued (base semantics), NOT abandoned, and children are NOT cancelled.
    assert iteration.outcome == RalphIterationOutcome.PENDING
    assert task.status == TaskStatus.PENDING
    assert progress.abandoned_tasks == 0


async def test_tui_escalation_sets_session_abort() -> None:
    escalated_report = ChildReportArtifact(
        agent_name="ralph-child",
        persona="tester",
        status="failed",
        summary="Escalating",
        escalation=EscalationSignal(reason="unrecoverable", detail="stop the session"),
    )
    loop, _runtime_kwargs, _stored, _state, _sync = make_tui_loop(report=escalated_report)
    task = TodoTask(name="escalating", description="escalating")
    task.set_execution_context("escalating")
    todo = make_todo(task)
    progress = RalphProgressFile(
        session_id="session-tui",
        started_at=dt.datetime.now(dt.UTC),
        total_tasks=1,
    )

    await loop._run_iteration(
        iteration_num=1,
        task=task,
        progress=progress,
        agent_factory=loop._test_agent_factory,
        todo=todo,
    )

    assert loop._session_abort_requested is True
```

Check `EscalationSignal`'s actual field names before finalizing (`grep -n "class EscalationSignal" -A 8 src/rotaris_core/orchestrator/report.py`) and adjust the constructor call to match.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/unit/test_ralph_loop.py -v -k "blocked_requeues or escalation_sets"`
Expected: FAIL — TUI override currently abandons blocked tasks and ignores escalation.

- [ ] **Step 3: Replace the override with `TuiIterationObserver`**

In `src/rotaris_core/tui/ralph_loop.py`:

3a. Delete the entire `_run_iteration` method (lines 294-695).

3b. Add to `TuiRalphLoop.__init__`, as the last line of the body:

```python
        self._observer = TuiIterationObserver(self)
```

3c. Add the observer class at the end of the file. The bodies of `bind_scheduler_callbacks` and `_apply_stall_event` move VERBATIM from the deleted override (old lines 404-486); everything else is the deleted override's UI side-effects regrouped per hook:

```python
class TuiIterationObserver(RalphIterationObserver):
    """Mirrors Ralph iteration lifecycle into the TUI.

    All hooks run on the event loop thread except ``on_child_spawned``,
    which the delegate tool can fire from an ``asyncio.to_thread`` worker —
    that one marshals through ``dispatch_ui`` (``safe_call_from_thread``).
    """

    def __init__(self, loop: TuiRalphLoop) -> None:
        self._loop = loop

    def on_child_spawned(self, record: Any, manager: ChildManager) -> None:
        lp = self._loop
        lp._dispatch_ui(lp._notify_child_spawn, record)
        lp._dispatch_ui(lp._sync_children, manager)

    def on_child_created(self, record: Any, manager: ChildManager, todo: Any) -> None:
        lp = self._loop
        lp._sync_children(manager)
        lp._state.todo_state = todo.model_dump(mode="json")
        lp._persist_state_debounced()

    def on_child_running(self, record: Any, manager: ChildManager) -> None:
        lp = self._loop
        lp._app._run_timer.start_segment()
        lp._set_live_activity(
            record.canonical_name,
            record.persona,
            activity_icon="ANIMATED_THINKING",
            activity_text="Thinking...",
            activity_phase="thinking",
        )
        lp._push_activity_event(
            record.canonical_name,
            "ANIMATED_THINKING",
            "Thinking...",
            "thinking",
        )
        lp._sync_children(manager)
        lp._persist_state_debounced()

    def on_todo_state(self, todo: Any) -> None:
        lp = self._loop
        lp._dispatch_ui(lp._update_agent_todo, todo)

    def extra_runtime_kwargs(self) -> dict[str, Any]:
        lp = self._loop

        def _mcp_failure_callback(warning_message: str) -> None:
            lp._dispatch_ui(
                lambda msg=warning_message: lp._app.notify(
                    msg,
                    severity="warning",
                    timeout=8.0,
                ),
            )

        def _mcp_issue_callback(warning_message: str) -> None:
            lp.scheduler.diagnostics.issue(
                kind="mcp_config",
                severity="warning",
                actor="orchestrator",
                message=warning_message,
            )

        return {
            "mcp_failure_callback": _mcp_failure_callback,
            "mcp_issue_callback": _mcp_issue_callback,
        }

    def bind_scheduler_callbacks(self, manager: ChildManager) -> None:
        lp = self._loop
        lp.scheduler._conversation_event_callback = (
            lambda event_record, event: lp._dispatch_ui(
                lp._apply_conversation_event,
                event_record.canonical_name,
                event_record.persona,
                manager,
                event,
            )
        )
        lp.scheduler._conversation_token_callback = lambda token_record, chunk: (  # type: ignore[assignment]  # scheduler attribute accepts broader callable type
            lp._app.safe_call_from_thread(
                lp._apply_token_event,
                token_record.canonical_name,
                token_record.persona,
                chunk,
            )
        )
        lp.scheduler._spawn_notification_callback = lambda spawned_record: lp._sync_children(
            manager,
        )

        def _apply_stall_event(
            canonical: str,
            persona_name: str,
            elapsed: float,
            phase: str,
        ) -> None:
            if phase == "stalled":
                text = f"Waiting on LLM ({int(elapsed)}s)…"
                icon = "[!]"
                activity_phase = "stalled"
            else:
                text = "Thinking..."
                icon = "ANIMATED_THINKING"
                activity_phase = "thinking"
            lp._set_live_activity(
                canonical,
                persona_name,
                activity_icon=icon,
                activity_text=text,
                activity_phase=activity_phase,
            )
            # Surface the stall (or recovery) on the in-chat streaming line so
            # the user sees an updating elapsed counter even when no reasoning
            # chunks are arriving.
            stream = lp._app._live_stream_messages.get(canonical)
            if stream is None:
                stream = lp._app._live_stream_messages.setdefault(
                    canonical,
                    {
                        "persona": persona_name,
                        "content": "",
                        "reasoning": "",
                        "phase": "thinking",
                        "thinking_started_at": time.monotonic() - max(0.0, elapsed),
                        "stalled": phase == "stalled",
                    },
                )
            else:
                stream["stalled"] = phase == "stalled"
                if not stream.get("thinking_started_at"):
                    stream["thinking_started_at"] = time.monotonic() - max(0.0, elapsed)
            lp._sync_children(manager)
            lp._app.request_widget_refresh()

        lp.scheduler._stall_callback = lambda stall_record, elapsed, phase: lp._dispatch_ui(
            _apply_stall_event,
            stall_record.canonical_name,
            stall_record.persona,
            elapsed,
            phase,
        )

        async def _summarizing_callback(summarizing_record: Any) -> None:
            """Surface the SUMMARIZING state in the TUI before the summary agent blocks."""
            lp._set_live_activity(
                summarizing_record.canonical_name,
                summarizing_record.persona,
                activity_icon="ANIMATED_THINKING",
                activity_text="Summarizing response",
                activity_phase="summarizing",
            )
            lp._sync_children(manager)

        lp.scheduler._summarizing_callback = _summarizing_callback

    def unbind_scheduler_callbacks(self) -> None:
        self._loop.scheduler._summarizing_callback = None

    def on_last_prompt_tokens(self, record: Any, tokens: int) -> None:
        lp = self._loop

        def update_cached_context_tokens(value: int) -> None:
            lp._app._render_state.last_context_tokens = value
            lp._app._refresh_widgets()

        lp._dispatch_ui(update_cached_context_tokens, int(tokens))

    def on_token_aggregate(self, usage: dict[str, Any] | None) -> None:
        lp = self._loop
        from rotaris_core.tracking.tracker import GlobalTracker

        aggregate = GlobalTracker().get_global_tokens()
        if aggregate.total_tokens > 0:
            lp._state.token_usage = aggregate.model_dump(mode="json")
        elif usage is not None and lp._state.token_usage is None:
            lp._state.token_usage = usage

    def on_iteration_end(
        self,
        record: Any,
        report: Any,
        manager: ChildManager,
        todo: Any,
        outcome: RalphIterationOutcome,
    ) -> None:
        lp = self._loop
        if outcome == RalphIterationOutcome.COMPLETED:
            icon, text, phase = "", "Completed", "completed"
        elif outcome == RalphIterationOutcome.ABANDONED:
            icon, text, phase = "✗", report.summary, "failed"
        else:
            icon, text, phase = "", "Continuing next iteration", "pending"
        lp._set_live_activity(
            record.canonical_name,
            record.persona,
            activity_icon=icon,
            activity_text=text,
            activity_phase=phase,
        )
        lp._push_activity_event(record.canonical_name, icon, text, phase)
        lp._sync_children(manager)
        lp._state.todo_state = todo.model_dump(mode="json")
        lp._state.report_artifacts.append(report.model_dump(mode="json"))
        lp._store_report(report.agent_name, report.final_response or report.summary)
        lp._persist_state_now()
```

3d. Fix imports at the top of `tui/ralph_loop.py`: add `from rotaris_core.ralph.iteration_observer import RalphIterationObserver` and `from rotaris_core.ralph.state import RalphIterationOutcome` at module level (both light); remove now-unused imports flagged by ruff (`asyncio`, `ChildTaskState`, `RalphIterationState`, `TaskStatus`, `Agent` may become unused — let `ruff check` decide and delete exactly what it flags). `ChildManager` stays (used in type hints — move to `TYPE_CHECKING` if only hinted). `time` stays (used in `_apply_stall_event` and `_persist_state_*`).

- [ ] **Step 4: Run TUI loop tests**

Run: `pytest tests/unit/test_ralph_loop.py -v -k tui`
Expected: PASS, including the two new tests. Existing TUI tests (`test_tui_run_iteration_requeues_task_when_todo_has_pending_tasks`, `test_tui_run_iteration_syncs_children_on_spawn_and_stall_callbacks`, `test_tui_run_iteration_routes_token_callbacks_through_safe_dispatch`, `test_tui_run_iteration_clears_summarizing_activity_on_success`, etc.) must pass against the unified iteration. If a test asserts on old TUI-only details (e.g. `started_at == state.updated_at`), update the assertion to the unified semantics documented in "Intentional Behavior Changes" — do not re-add divergent behavior.

- [ ] **Step 5: Full unit sweep + lint + typecheck**

Run: `pytest tests/unit -q -x --ignore=tests/unit/test_tui_workflows.py 2>&1 | tail -5 && ruff check src/rotaris_core/tui/ralph_loop.py && mypy src/rotaris_core/tui/ralph_loop.py`
Expected: no NEW failures beyond the pre-existing baseline (see Global Constraints). Lint/mypy clean.

- [ ] **Step 6: Commit**

```bash
git add src/rotaris_core/tui/ralph_loop.py tests/unit/test_ralph_loop.py
git commit -m "refactor(tui): TuiRalphLoop uses TuiIterationObserver, drops _run_iteration override

Fixes two divergences: blocked status now re-queues (was abandoned +
cancelled children, defeating shutdown drain); escalation now aborts
the session in TUI runs. Child-spawn UI updates now marshal through
safe_call_from_thread."
```

---

### Task 3: `ralph/bootstrap.py` — shared run-setup module

**Files:**
- Create: `src/rotaris_core/ralph/bootstrap.py`
- Test: `tests/unit/test_ralph_bootstrap.py`

**Interfaces:**
- Consumes: `classify_initial_intent`, `IntentClassificationResult`, `FALLBACK_INTENT` (from `rotaris_core.ralph.intent_classifier`); `build_contextual_task_payload` et al. (from `rotaris_core.session.task_context`); `SummaryAgent`, `ImprovementCollector`, `load_llm_for_model`, `build_llm_usage_id`, `create_agent_for_persona`.
- Produces (Tasks 4 and 5 call exactly these):
  - `async def classify_run_intent(config: RotarisConfig, task_text: str, *, entrypoint: str) -> IntentClassificationResult`
  - `def build_run_todo(state: SessionState, task_text: str, session_dir: Path) -> tuple[TodoList, TodoTask]`
  - `def make_summary_agent_factory(config: RotarisConfig) -> Callable[[str], SummaryAgent]`
  - `def make_improvement_collector_factory(config: RotarisConfig) -> Callable[[], ImprovementCollector]`
  - `def make_improvement_context_provider(state: SessionState) -> Callable[[], dict[str, Any]]`
  - `def make_agent_factory(config, *, intent_instructions, intent_tools, resolve_model=None, augment_runtime_kwargs=None) -> RalphAgentFactory`
  - `def apply_progress_to_state(state: SessionState, progress: RalphProgressFile, todo: TodoList, ralph: RalphLoop) -> None`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/test_ralph_bootstrap.py`:

```python
from __future__ import annotations

import datetime as dt
from pathlib import Path
from typing import Any

import pytest

from rotaris_core.config.schema import RotarisConfig, RuntimePolicy
from rotaris_core.ralph import bootstrap
from rotaris_core.session.state import SessionState


def make_config(**kwargs: Any) -> RotarisConfig:
    return RotarisConfig(runtime=RuntimePolicy(child_timeout=5), **kwargs)


def make_state(**overrides: Any) -> SessionState:
    now = dt.datetime.now(dt.UTC)
    defaults: dict[str, Any] = {
        "session_id": "boot-test",
        "workspace_root": "/tmp/test",
        "created_at": now,
        "updated_at": now,
    }
    defaults.update(overrides)
    return SessionState(**defaults)


async def test_classify_run_intent_falls_back_on_error(monkeypatch: pytest.MonkeyPatch) -> None:
    async def boom(config: Any, text: str, *, metadata: Any = None) -> Any:
        raise RuntimeError("classifier down")

    monkeypatch.setattr("rotaris_core.ralph.intent_classifier.classify_initial_intent", boom)
    result = await bootstrap.classify_run_intent(make_config(), "do things", entrypoint="test")
    assert result.fallback is True
    assert "classifier down" in result.reason


async def test_classify_run_intent_passes_entrypoint_metadata(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: dict[str, Any] = {}

    from rotaris_core.ralph.intent_classifier import FALLBACK_INTENT, IntentClassificationResult

    async def fake(config: Any, text: str, *, metadata: Any = None) -> Any:
        seen["metadata"] = metadata
        return IntentClassificationResult(intent=FALLBACK_INTENT, reason="ok", fallback=False)

    monkeypatch.setattr("rotaris_core.ralph.intent_classifier.classify_initial_intent", fake)
    await bootstrap.classify_run_intent(make_config(), "do things", entrypoint="tui")
    assert seen["metadata"] == {"entrypoint": "tui"}


def test_build_run_todo_creates_main_phase_when_no_prior_state(tmp_path: Path) -> None:
    state = make_state()
    todo, top_task = bootstrap.build_run_todo(state, "build the feature", tmp_path)
    assert [phase.name for phase in todo.phases] == ["main"]
    assert todo.phases[0].tasks == [top_task]
    assert top_task.execution_payload  # contextual payload was set


def test_build_run_todo_appends_to_existing_first_phase(tmp_path: Path) -> None:
    state = make_state()
    prior, _ = bootstrap.build_run_todo(state, "first task", tmp_path)
    state.todo_state = prior.model_dump(mode="json")

    todo, top_task = bootstrap.build_run_todo(state, "second task", tmp_path)
    assert len(todo.phases[0].tasks) == 2
    assert todo.phases[0].tasks[-1] is top_task


def test_make_summary_agent_factory_raises_without_model() -> None:
    factory = bootstrap.make_summary_agent_factory(make_config())
    with pytest.raises(ValueError, match="Summary model must be configured"):
        factory("nonexistent-persona")


def test_make_improvement_collector_factory_raises_without_model() -> None:
    factory = bootstrap.make_improvement_collector_factory(make_config())
    with pytest.raises(ValueError, match="medium_model must be configured"):
        factory()


def test_make_improvement_context_provider_snapshots_transcript() -> None:
    state = make_state()
    state.transcript_events.append({"role": "user", "content": "hi"})
    provider = bootstrap.make_improvement_context_provider(state)
    ctx = provider()
    assert ctx["transcript_events"] == [{"role": "user", "content": "hi"}]
    # Must be a copy, not the live list.
    ctx["transcript_events"].append({"role": "x", "content": "y"})
    assert len(state.transcript_events) == 1


def test_make_agent_factory_injects_intent_kwargs_for_default_persona(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}

    def fake_load_llm(config: Any, model_key: Any, **kwargs: Any) -> str:
        captured["model_key"] = model_key
        return "fake-llm"

    def fake_create_agent(persona_config: Any, config: Any, runtime_kwargs: Any = None) -> Any:
        captured["runtime_kwargs"] = runtime_kwargs
        return lambda llm: {"agent_for": llm}

    monkeypatch.setattr("rotaris_core.config.loader.load_llm_for_model", fake_load_llm)
    monkeypatch.setattr("rotaris_core.agents.factory.create_agent_for_persona", fake_create_agent)

    config = make_config()
    default_persona = config.default_persona
    assert default_persona in config.personas, "default persona must exist in default config"

    factory = bootstrap.make_agent_factory(
        config,
        intent_instructions="INTENT TEXT",
        intent_tools=["read_file"],
    )
    agent = factory(default_persona)
    assert agent == {"agent_for": "fake-llm"}
    assert captured["runtime_kwargs"]["intent_instructions"] == "INTENT TEXT"
    assert captured["runtime_kwargs"]["intent_tools"] == ["read_file"]


def test_make_agent_factory_unknown_persona_raises() -> None:
    factory = bootstrap.make_agent_factory(
        make_config(),
        intent_instructions="x",
        intent_tools=None,
    )
    with pytest.raises(ValueError, match="Unknown persona"):
        factory("no-such-persona")


def test_apply_progress_to_state_records_progress_and_artifact_id() -> None:
    from rotaris_core.ralph.state import RalphProgressFile
    from rotaris_core.tools.todo_state import TodoList, TodoPhase, TodoTask

    state = make_state()
    todo = TodoList(phases=[TodoPhase(name="main", tasks=[TodoTask(name="t", description="t")])])
    progress = RalphProgressFile(
        session_id="boot-test",
        started_at=dt.datetime.now(dt.UTC),
        total_tasks=1,
    )
    ralph = type("FakeRalph", (), {"last_improvement_artifact_id": "artifact-1"})()

    bootstrap.apply_progress_to_state(state, progress, todo, ralph)
    assert state.ralph_progress is not None
    assert state.todo_state is not None
    assert state.improvement_artifact_ids == ["artifact-1"]

    # Idempotent on artifact id.
    bootstrap.apply_progress_to_state(state, progress, todo, ralph)
    assert state.improvement_artifact_ids == ["artifact-1"]
```

Notes for the implementer:
- If the default `RotarisConfig()` has no personas, `test_make_agent_factory_injects_intent_kwargs_for_default_persona` needs a minimal persona injected — build the config with `personas={config default persona name: PersonaConfig(model="test-model", ...)}` using the real `PersonaConfig` schema (check `src/rotaris_core/config/schema.py:192` for required fields) and `models={"test-model": ...}` is NOT needed because `load_llm_for_model` is monkeypatched. Adjust the test, not the production code.
- `monkeypatch.setattr` targets the SOURCE module paths shown above because `bootstrap` imports lazily inside functions.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/unit/test_ralph_bootstrap.py -v`
Expected: FAIL with `ImportError: cannot import name 'bootstrap'`

- [ ] **Step 3: Write the module**

Create `src/rotaris_core/ralph/bootstrap.py`:

```python
"""Shared run-setup pipeline for CLI background runs and TUI runs.

Both entry points (``cli/background.py`` and ``tui/app_run.py``) assemble
the same machinery around :class:`~rotaris_core.ralph.loop.RalphLoop`:
intent classification, contextual todo construction, summary-agent /
improvement-collector factories, the persona → Agent factory, and
post-run state application.  This module owns that pipeline; the entry
points only supply UI wiring and persistence.

Heavy imports stay inside functions (lazy-import rule).
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from collections.abc import Callable
    from pathlib import Path

    from openhands.sdk import Agent

    from rotaris_core.config.schema import RotarisConfig, PersonaConfig
    from rotaris_core.improvement.collector import ImprovementCollector
    from rotaris_core.orchestrator.summary_agent import SummaryAgent
    from rotaris_core.ralph.intent_classifier import IntentClassificationResult
    from rotaris_core.ralph.loop import RalphLoop
    from rotaris_core.ralph.state import RalphProgressFile
    from rotaris_core.session.state import SessionState
    from rotaris_core.tools.todo_state import TodoList, TodoTask

    # (config, persona_config, model_override) -> (config, persona_config, model_key)
    ModelResolver = Callable[
        [str, PersonaConfig, str | None],
        tuple[RotarisConfig, PersonaConfig, str],
    ]
    RuntimeKwargsAugmentor = Callable[[str, dict[str, Any]], None]

_log = logging.getLogger(__name__)


async def classify_run_intent(
    config: RotarisConfig,
    task_text: str,
    *,
    entrypoint: str,
) -> IntentClassificationResult:
    """Classify the user's initial intent; never raise (falls back)."""
    from rotaris_core.ralph import intent_classifier

    try:
        return await intent_classifier.classify_initial_intent(
            config,
            task_text,
            metadata={"entrypoint": entrypoint},
        )
    except Exception as exc:  # noqa: BLE001
        _log.warning("Intent classification pre-flight failed (%s); continuing", exc)
        return intent_classifier.IntentClassificationResult(
            intent=intent_classifier.FALLBACK_INTENT,
            reason=f"classification pre-flight error: {exc}",
            fallback=True,
        )


def build_run_todo(
    state: SessionState,
    task_text: str,
    session_dir: Path,
) -> tuple[TodoList, TodoTask]:
    """Build the run's todo list with the new top-level task appended.

    Preserves existing todo state when resuming a session.  The contextual
    payload embeds the current transcript, session artifacts, prior todo
    state, and prior progress — call this AFTER appending the user/intent
    transcript events so the payload reflects them.
    """
    from rotaris_core.session.task_context import (
        build_contextual_task_payload,
        build_progress_context,
        build_session_artifact_context,
        build_task_display_name,
        build_todo_context,
    )
    from rotaris_core.tools.todo_state import TodoList, TodoPhase, TodoTask

    contextual_task = build_contextual_task_payload(
        task_text,
        state.transcript_events,
        artifact_context=build_session_artifact_context(session_dir),
        todo_context=build_todo_context(state.todo_state),
        progress_context=build_progress_context(state.ralph_progress),
    )
    top_level_task = TodoTask(name=build_task_display_name(task_text), description=task_text)
    top_level_task.set_execution_context(contextual_task)

    if state.todo_state and state.todo_state.get("phases"):
        todo = TodoList.model_validate(state.todo_state)
        if todo.phases:
            todo.phases[0].tasks.append(top_level_task)
        else:
            todo.phases.append(TodoPhase(name="main", tasks=[top_level_task]))
    else:
        todo = TodoList(phases=[TodoPhase(name="main", tasks=[top_level_task])])
    return todo, top_level_task


def make_summary_agent_factory(config: RotarisConfig) -> Callable[[str], SummaryAgent]:
    """Return the per-persona SummaryAgent factory used by RalphLoop/Scheduler."""

    def summary_agent_for_persona(persona: str) -> SummaryAgent:
        from rotaris_core.config.loader import build_llm_usage_id, load_llm_for_model
        from rotaris_core.orchestrator.summary_agent import SummaryAgent

        persona_config = config.personas.get(persona)
        summary_model = (
            persona_config.summary_model
            if persona_config is not None and persona_config.summary_model is not None
            else config.default_summary_model
        )
        if summary_model is None:
            raise ValueError(f"Summary model must be configured for persona '{persona}'")
        _log.info("Using summary model '%s' for persona '%s'", summary_model, persona)
        summary_llm = load_llm_for_model(
            config,
            summary_model,
            usage_id=build_llm_usage_id("summary", model_name=summary_model, scope=persona),
        )
        return SummaryAgent(llm=summary_llm, timeout=config.runtime.summary_timeout)

    return summary_agent_for_persona


def make_improvement_collector_factory(
    config: RotarisConfig,
) -> Callable[[], ImprovementCollector]:
    """Return the cheap-model ImprovementCollector factory for the post-run pass."""

    def improvement_collector_factory() -> ImprovementCollector:
        from rotaris_core.config.loader import build_llm_usage_id, load_llm_for_model
        from rotaris_core.improvement import ImprovementCollector

        collector_model = config.improvement_collector_model or config.medium_model
        if collector_model is None:
            raise ValueError(
                "medium_model must be configured to enable the post-run improvement collector.",
            )
        collector_llm = load_llm_for_model(
            config,
            collector_model,
            usage_id=build_llm_usage_id(
                "improvement_collector",
                model_name=collector_model,
                scope="session",
            ),
        )
        return ImprovementCollector(
            llm=collector_llm,
            timeout=float(config.runtime.improvement_collector_timeout),
        )

    return improvement_collector_factory


def make_improvement_context_provider(
    state: SessionState,
) -> Callable[[], dict[str, Any]]:
    """Return a provider that snapshots the session transcript for the collector."""

    def improvement_context_provider() -> dict[str, Any]:
        return {"transcript_events": list(state.transcript_events or [])}

    return improvement_context_provider


def make_agent_factory(
    config: RotarisConfig,
    *,
    intent_instructions: str,
    intent_tools: list[str] | None,
    resolve_model: ModelResolver | None = None,
    augment_runtime_kwargs: RuntimeKwargsAugmentor | None = None,
) -> Callable[..., Agent]:
    """Return the persona → Agent factory passed into ``RalphLoop.run``.

    ``resolve_model`` lets a host override model selection (the TUI resolves
    the user's active model and runtime model configs); the default resolves
    ``model_override or persona_config.model`` against the given config.
    ``augment_runtime_kwargs`` lets a host inject extra runtime kwargs
    (e.g. the TUI's condenser token callback) before agent creation.
    """

    def agent_factory(
        persona: str,
        runtime_kwargs: dict[str, Any] | None = None,
        model_override: str | None = None,
    ) -> Agent:
        from rotaris_core.agents.factory import create_agent_for_persona
        from rotaris_core.config.loader import build_llm_usage_id, load_llm_for_model

        persona_config = config.personas.get(persona)
        if persona_config is None:
            raise ValueError(f"Unknown persona: {persona}")
        effective_runtime_kwargs = dict(runtime_kwargs or {})
        if persona == config.default_persona:
            effective_runtime_kwargs.setdefault("intent_instructions", intent_instructions)
            if intent_tools is not None:
                effective_runtime_kwargs.setdefault("intent_tools", intent_tools)
        if augment_runtime_kwargs is not None:
            augment_runtime_kwargs(persona, effective_runtime_kwargs)

        if resolve_model is not None:
            effective_config, effective_persona_config, model_key = resolve_model(
                persona,
                persona_config,
                model_override,
            )
        else:
            effective_config = config
            effective_persona_config = persona_config
            model_key = model_override or persona_config.model

        llm = load_llm_for_model(
            effective_config,
            model_key,
            stream=True,
            usage_id=build_llm_usage_id("agent", model_name=model_key, scope=persona),
        )
        factory_fn = create_agent_for_persona(
            effective_persona_config,
            effective_config,
            runtime_kwargs=effective_runtime_kwargs or None,
        )
        return factory_fn(llm)

    return agent_factory


def apply_progress_to_state(
    state: SessionState,
    progress: RalphProgressFile,
    todo: TodoList,
    ralph: RalphLoop,
) -> None:
    """Record a finished run's progress, todo state, and improvement artifact id."""
    state.ralph_progress = progress.model_dump(mode="json")
    state.todo_state = todo.model_dump(mode="json")
    artifact_id = ralph.last_improvement_artifact_id
    if artifact_id is not None and artifact_id not in state.improvement_artifact_ids:
        state.improvement_artifact_ids.append(artifact_id)
```

Implementation caveat: `classify_run_intent` must call through the module attribute (`intent_classifier.classify_initial_intent`) — NOT `from ... import classify_initial_intent` — so `monkeypatch.setattr("rotaris_core.ralph.intent_classifier.classify_initial_intent", ...)` takes effect. Same pattern for the test-monkeypatched loader/factory functions: `agent_factory` imports them inside the closure at call time, which reads the patched module attributes — but note the test patches `rotaris_core.config.loader.load_llm_for_model` while the code does `from rotaris_core.config.loader import ...` inside the function body; since the import executes per-call, it picks up the monkeypatched attribute. This works; keep the imports inside the function.

- [ ] **Step 4: Run tests**

Run: `pytest tests/unit/test_ralph_bootstrap.py -v`
Expected: PASS (all)

- [ ] **Step 5: Lint + typecheck + commit**

Run: `ruff check src/rotaris_core/ralph/bootstrap.py tests/unit/test_ralph_bootstrap.py && mypy src/rotaris_core/ralph/bootstrap.py`

```bash
git add src/rotaris_core/ralph/bootstrap.py tests/unit/test_ralph_bootstrap.py
git commit -m "feat(ralph): add bootstrap module owning the shared run-setup pipeline"
```

---

### Task 4: `cli/background.py` adopts the bootstrap

**Files:**
- Modify: `src/rotaris_core/cli/background.py` (`_run_task`, lines 144-419)
- Test: existing suite (`tests/unit`, especially anything importing `cli.background`)

**Interfaces:**
- Consumes: every `bootstrap.*` function from Task 3.
- Produces: `_run_task` behavior identical to before (transcript events, timeline events, persistence points unchanged).

- [ ] **Step 1: Rewrite `_run_task`**

Replace the body so the duplicated pipeline goes through bootstrap. The transcript/timeline/persist sequencing stays exactly where it was; only the extracted logic is replaced:

```python
async def _run_task(
    task: str,
    config: RotarisConfig,
    session_manager: SessionManager,
    state: SessionState,
    max_iterations: int | None,
    interrupt_handler: Any | None = None,
) -> RalphProgressFile:
    """Wire background execution to the RalphLoop orchestration engine."""
    from openhands.sdk.event.condenser import Condensation

    from rotaris_core.improvement import RunType
    from rotaris_core.ralph import bootstrap
    from rotaris_core.ralph.intent_classifier import (
        classification_status_text,
        intent_instructions_for,
        intent_tools_for,
    )
    from rotaris_core.ralph.loop import RalphLoop
    from rotaris_core.session.diagnostics import SessionDiagnostics, conversations_dir
    from rotaris_core.tracking.tracker import GlobalTracker

    session_dir = session_manager.session_dir(state.session_id)
    diag = SessionDiagnostics(session_dir)
    state.transcript_events.append(
        {
            "role": "user",
            "content": task,
        },
    )
    _persist_session_state(session_manager, state)

    classification = await bootstrap.classify_run_intent(config, task, entrypoint="background")
    intent_instructions = intent_instructions_for(classification.intent)
    intent_tools = intent_tools_for(classification.intent)
    classification_prompt_text = f"Intent classified: {classification.intent.value}"
    user_visible_classification_text = classification_status_text(classification)
    state.transcript_events.append(
        {
            "role": "system",
            "content": classification_prompt_text,
        },
    )
    diag.timeline(
        "intent_classified",
        actor="background",
        message=user_visible_classification_text,
        metadata={"fallback": classification.fallback, "reason": classification.reason},
    )
    _persist_session_state(session_manager, state)

    todo, _top_level_task = bootstrap.build_run_todo(state, task, session_dir)
    state.todo_state = todo.model_dump(mode="json")
    if user_visible_classification_text != classification_prompt_text:
        state.transcript_events[-1]["content"] = user_visible_classification_text
    _persist_session_state(session_manager, state)

    def apply_conversation_event(record: Any, event: object) -> None:
        if isinstance(event, Condensation):
            from uuid import uuid4

            GlobalTracker().track_compression_completion(
                record.canonical_name,
                event.llm_response_id or str(uuid4()),
            )
            diag.timeline(
                "compression",
                actor=record.canonical_name,
                message="Conversation compression completed",
                metadata={"llm_response_id": event.llm_response_id},
            )
        elif (
            getattr(event, "event_type", None) == "compression"
            and getattr(event, "phase", None) == "done"
        ):
            from uuid import uuid4

            GlobalTracker().track_compression_completion(record.canonical_name, str(uuid4()))
            diag.timeline(
                "compression",
                actor=record.canonical_name,
                message="Conversation compression completed",
            )

    ralph = RalphLoop(
        config=config,
        workspace_root=str(config.workspace_root),
        summary_agent=bootstrap.make_summary_agent_factory(config),
        conversation_persistence_dir=conversations_dir(session_dir),
        conversation_event_callback=apply_conversation_event,
        run_type=RunType.TASK_RUN,
        improvement_collector_factory=bootstrap.make_improvement_collector_factory(config),
        improvement_context_provider=bootstrap.make_improvement_context_provider(state),
    )
    if interrupt_handler is not None:
        interrupt_handler.set_callbacks(
            on_first_interrupt=lambda: ralph.request_shutdown(force=False),
            on_second_interrupt=lambda: ralph.request_shutdown(force=True),
        )

    agent_factory = bootstrap.make_agent_factory(
        config,
        intent_instructions=intent_instructions,
        intent_tools=intent_tools,
    )

    progress = await ralph.run(
        todo=todo,
        agent_factory=agent_factory,
        session_id=state.session_id,
        max_iterations=max_iterations,
    )

    for iteration in progress.iterations:
        response_text = iteration.agent_response or iteration.report_summary
        if not response_text:
            continue
        state.transcript_events.append(
            {
                "role": "agent",
                "name": iteration.task_id,
                "content": response_text,
            },
        )

    from rotaris_core.tokens import TokenSnapshot

    # Each iteration stores the GlobalTracker's cumulative aggregate (already
    # includes all prior iterations), so we must NOT sum them — doing so would
    # multiply-count tokens.  Take the last non-None value instead.
    final_token_usage: TokenSnapshot | None = None
    for iteration in progress.iterations:
        if iteration.token_usage is not None:
            final_token_usage = TokenSnapshot.model_validate(iteration.token_usage)
    if final_token_usage is not None:
        state.token_usage = final_token_usage.model_dump(mode="json")

    bootstrap.apply_progress_to_state(state, progress, todo, ralph)
    _persist_session_state(session_manager, state)
    return progress
```

Delete the now-unused local definitions (`summary_agent_for_persona`, `improvement_collector_factory`, `improvement_context_provider`, `agent_factory`, the todo-construction block) and unused imports; `ruff check` flags them.

- [ ] **Step 2: Run tests + lint + typecheck**

Run: `pytest tests/unit -q -k "background or bootstrap or ralph" && ruff check src/rotaris_core/cli/background.py && mypy src/rotaris_core/cli/background.py`
Expected: PASS / clean.

- [ ] **Step 3: Smoke-import**

Run: `python -c "from rotaris_core.cli import background; print('ok')"`
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add src/rotaris_core/cli/background.py
git commit -m "refactor(cli): background runner delegates run setup to ralph.bootstrap"
```

---

### Task 5: `tui/app_run.py` adopts the bootstrap

**Files:**
- Modify: `src/rotaris_core/tui/app_run.py` (`TuiRunController.start`)
- Test: existing suite (`tests/unit/test_ralph_loop.py`, TUI tests)

**Interfaces:**
- Consumes: `bootstrap.*` from Task 3; `TuiRalphLoop` constructor (unchanged, Task 2).
- Produces: identical TUI run behavior; `TuiRunController.start` keeps its signature.

- [ ] **Step 1: Replace the duplicated pipeline pieces**

In `TuiRunController.start`:

1a. Replace the classification block (the `try: classification = await classify_initial_intent(...)` / `except` at lines 116-128) with:

```python
        from rotaris_core.ralph import bootstrap

        classification = await bootstrap.classify_run_intent(config, task_text, entrypoint="tui")
```

Keep the surrounding transcript-placeholder handling (`classification_status_event`, content swap, `chat_needs_full_rebuild`, notify-on-fallback) exactly as is — that is TUI presentation, not pipeline.

1b. Replace the contextual-payload + todo-construction block (lines 146-170: `contextual_task = build_contextual_task_payload(...)` through the `todo = TodoList(...)` fallback) with:

```python
        todo, _top_level_task = bootstrap.build_run_todo(state, task_text, session_dir)
```

Remove the now-unused imports from `rotaris_core.session.task_context` and `rotaris_core.tools.todo_state` at the top of `start` (ruff flags them).

1c. Replace the local `summary_agent_for_persona`, `improvement_collector_factory`, and `improvement_context_provider` definitions (lines 811-856) with nothing, and change the `TuiRalphLoop(...)` construction kwargs to:

```python
            ralph = TuiRalphLoop(
                config=config,
                workspace_root=str(config.workspace_root),
                summary_agent=bootstrap.make_summary_agent_factory(config),
                state=state,
                app=app,
                sync_children=sync_children,
                dispatch_ui=dispatch_ui,
                set_live_activity=set_live_activity,
                push_activity_event=push_activity_event,
                notify_child_spawn=store_child_spawn,
                apply_conversation_event=apply_conversation_event,
                apply_token_event=apply_token_event,
                update_agent_todo=update_agent_todo,
                persist_state=persist_state,
                clear_live_stream=clear_live_stream,
                store_report=store_report,
                improvement_collector_factory=bootstrap.make_improvement_collector_factory(
                    config,
                ),
                improvement_context_provider=bootstrap.make_improvement_context_provider(state),
            )
```

1d. Replace the local `agent_factory` definition (lines 882-951) with a bootstrap-built factory plus TUI-specific resolvers:

```python
            def _augment_runtime_kwargs(persona: str, kwargs: dict[str, Any]) -> None:
                def _update_context_tokens_live(tokens: int) -> None:
                    app._render_state.last_context_tokens = tokens
                    app.request_widget_refresh()

                kwargs["condenser_token_callback"] = lambda tokens: (
                    app.safe_call_from_thread(_update_context_tokens_live, tokens)
                )

            def _resolve_model(
                persona: str,
                persona_config: Any,
                model_override: str | None,
            ) -> tuple[Any, Any, str]:
                if model_override is not None:
                    model_key = model_override
                else:
                    model_key = (
                        app.active_model_key
                        if persona == config.default_persona and app.active_model_key
                        else persona_config.model
                    )
                effective_persona_config = (
                    persona_config.model_copy(update={"model": model_key})
                    if model_key != persona_config.model
                    else persona_config
                )
                effective_config = config
                if model_key in app._runtime_model_configs:
                    effective_config = config.model_copy(
                        update={
                            "models": {
                                **config.models,
                                model_key: app._runtime_model_configs[model_key],
                            },
                            "personas": {
                                **config.personas,
                                persona: effective_persona_config,
                            },
                        },
                    )
                return effective_config, effective_persona_config, model_key

            agent_factory = bootstrap.make_agent_factory(
                config,
                intent_instructions=intent_instructions,
                intent_tools=intent_tools,
                resolve_model=_resolve_model,
                augment_runtime_kwargs=_augment_runtime_kwargs,
            )
```

1e. Replace the post-run state application (lines 959-965: `state.ralph_progress = ...` through the `improvement_artifact_ids` append) with:

```python
            bootstrap.apply_progress_to_state(state, progress, todo, ralph)
```

- [ ] **Step 2: Run tests + lint + typecheck**

Run: `pytest tests/unit -q 2>&1 | tail -5 && ruff check src/rotaris_core/tui/app_run.py && mypy src/rotaris_core/tui/app_run.py`
Expected: no NEW failures vs. baseline; lint/mypy clean.

- [ ] **Step 3: Manual TUI smoke (optional but recommended)**

Run: `timeout 10 python -m rotaris_core 2>&1 | head -5` (or drive via textual-dev). App must boot without import errors.

- [ ] **Step 4: Commit**

```bash
git add src/rotaris_core/tui/app_run.py
git commit -m "refactor(tui): TuiRunController delegates run setup to ralph.bootstrap"
```

---

### Task 6: Docs, version bump, full verification

**Files:**
- Modify: `CLAUDE.md`, `CONTEXT.md`, `pyproject.toml`

- [ ] **Step 1: Update CLAUDE.md**

In the "Runtime call chain" / RalphLoop section, replace the sentence "The TUI subclass (`TuiRalphLoop`) overrides `_run_iteration` to push widget updates after each step." with:

```
Iteration semantics live ONLY in `RalphLoop._run_iteration`; hosts observe
progress through `RalphIterationObserver` (`ralph/iteration_observer.py`) —
the TUI's `TuiIterationObserver` (`tui/ralph_loop.py`) mirrors lifecycle
hooks into widgets. Never re-override `_run_iteration`; add an observer hook
instead. Run setup (intent classification, todo construction, summary/
improvement/agent factories, post-run state application) is shared between
CLI background and TUI via `ralph/bootstrap.py`.
```

- [ ] **Step 2: Update CONTEXT.md**

Add two Domain Language rows:

```
| **Iteration Observer**  | `RalphIterationObserver` — lifecycle hook seam for one Ralph iteration. Base loop owns semantics; observers (no-op default, `TuiIterationObserver`) mirror progress to a host surface. All hooks fire on the event loop thread except `on_child_spawned` (may fire from a worker thread). |
| **Run Bootstrap**       | `ralph/bootstrap.py` — the shared run-setup pipeline (intent classification, contextual todo, summary-agent / improvement-collector / agent factories, post-run state application) consumed by both CLI background and TUI entry points. |
```

And under Key Design Decisions add:

```
### One Ralph iteration, observed

`RalphLoop._run_iteration` is the single implementation of iteration
semantics (completion classification, blocked-status re-queue, escalation
abort, token capture). Hosts must not override it; they implement
`RalphIterationObserver` hooks. This ended a TUI/base fork that had already
diverged on blocked-status handling.
```

- [ ] **Step 3: Bump version**

`pyproject.toml`: `version = "0.63.9"` → `version = "0.64.0"`.

- [ ] **Step 4: Full verification**

Run: `make lint && make typecheck && pytest tests/unit -q 2>&1 | tail -3`
Expected: lint/typecheck clean; unit failures ≤ the pre-existing 17-failure baseline, and none in ralph/tui-loop/bootstrap/background tests.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md CONTEXT.md pyproject.toml
git commit -m "docs: document iteration-observer seam and run bootstrap; bump to 0.64.0"
```
