# Drain Loop + Wait Barrier Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `_drain_delegated_children` a loop so `wait_for_tasks` requests and delegations made during *resumed* parent runs are honored, and stop `WaitForTasksExecutor` from blocking 20 s on its own pause.

**Architecture:** The orchestrator drain currently checks the wait barrier / notifications / queued children exactly once, after the parent's *first* run. But every drain pass resumes the parent, and the resumed parent can call `wait_for_tasks` or delegate again — those requests land one step past the only checkpoint, get silently discarded in `run_child_impl`'s `finally`, and the parent ends "blocked". RalphLoop then re-queues the task and a fresh orchestrator duplicates all the research (observed in session `20260707-103842-887caa4f194c`, 5 identical iterations). Fix: wrap the drain in a loop that re-checks after every resume, with an `attempted_spawn_names` guard against infinite resume cycles, plus notification dedup so children already reported via the wait resume aren't re-announced.

**Tech Stack:** Python 3.12, asyncio, pytest (`asyncio_mode = "auto"`), existing mock-conversation fixtures in `tests/integration/test_orchestrator_e2e.py`.

## Global Constraints

- Line length 100; ruff selects `E,F,I,N,W,UP,B,SIM,TCH`; mypy strict must stay clean (`make lint`, `make typecheck`).
- Pre-existing test baseline: 17 failures (15 TUI snapshot + 2 coordinator-tools tests). Do NOT chase these.
- Commit with `git commit --only <explicit paths>`; never commit the user's parallel files (`TRACEABILITY.md`, `snapshot_report.html`, `generate_traceability.py`, `tests/unit/test_generate_traceability.py`).
- Version bump: `pyproject.toml` 0.66.0 → 0.66.1 (bugfix).
- Commit trailers: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_014SoiAttNbX49iSuWaUcV1A`.

## Design Notes

**Root cause (from session evidence):** parent run #1 delegates → drain entry: barrier empty → `_run_background_drain` spawns + resumes parent → parent run #2 calls `wait_for_tasks` (barrier registered) → `_run_background_drain` returns unconditionally → `run_child_impl` proceeds straight to summarization → SummaryAgent classifies "blocked" → `finally` discards the un-consumed barrier request → Ralph re-queues → duplicate orchestrator.

**Loop termination guard:** `_run_foreground_drain` waits for children (progress guaranteed). `_run_background_drain` only spawns + resumes once — if the resumed parent does nothing new, children stuck `WAITING_ON_DEPENDENCIES` (e.g. dep on a still-running background task) would cause an infinite spawn/resume cycle. Guard: track `attempted_spawn_names`; exit when the pending set contains no names not already attempted. This matches old one-shot behavior for stuck-waiting children while adding re-checks whenever anything *new* appears. Name dedup in `ChildManager.spawn_child` guarantees re-delegations get fresh canonical names, so the guard cannot mask genuinely new work.

**Notification dedup:** `mark_child_terminal` queues a `ChildNotification` for every background child (child_manager.py:368, same lock as `results_by_task_id`, so a visible report implies the notification is already queued — discard-after-collect is race-free). Old one-shot drain returned before ever injecting them after a wait resume; the loop would now inject duplicates ("[BACKGROUND TASK COMPLETED]" for a child already reported in the wait-resume message). New `ChildManager.discard_notifications(task_ids)` is called before each resume in `_run_wait_barrier_if_requested` and after each harvest in `_run_foreground_drain`.

**Pause self-block:** `WaitForTasksExecutor` runs inside `conversation.run()`'s tool-execution step. The SDK run loop cannot advance (and honor the pause) until the executor returns; `pause_with_daemon` blocks the executor 20 s waiting for exactly that — circular wait broken only by timeout. Evidence: `conversation.pause() did not complete within 20s` at every `wait_for_tasks` call in the session log. Fix: `block=False` mode that moves the wait-and-log into a watchdog daemon thread.

**Scoped out — fresh `ChildManager` per Ralph iteration:** children orphaned across iterations (tracked only in `Scheduler._active_tasks`) remain a limitation, but with this fix the parent actually receives its waited results and completes, so "blocked" outcomes become the rare path (parent ended without waiting), already covered by blocked re-queue + `_drain_active_children_before_stop`. Sharing a manager across iterations contradicts the documented per-iteration design; revisit only if evidence shows it still bites.

---

### Task 1: `ChildManager.discard_notifications`

**Files:**
- Modify: `src/rotaris_core/orchestrator/child_manager.py` (after `get_pending_notifications`, ~line 484)
- Test: `tests/unit/test_child_manager.py`

**Interfaces:**
- Produces: `ChildManager.discard_notifications(task_ids: set[str]) -> None` — drops pending notifications whose `task_id` is in `task_ids`, keeps the rest queued in order. Task 2 calls it from the drain.

- [ ] **Step 1: Write the failing test** (append to `tests/unit/test_child_manager.py`, reuse the file's existing manager fixture/helpers for constructing a manager; import `ChildNotification` from `rotaris_core.orchestrator.child_state`)

```python
def test_discard_notifications_drops_matching_and_keeps_rest() -> None:
    manager = ChildManager(
        parent_agent_id="parent",
        current_depth=0,
        policy=RuntimePolicy(max_children=8, max_depth=3),
    )
    for task_id in ("bg_a", "bg_b", "bg_c"):
        manager.pending_notifications.put(
            ChildNotification(
                task_id=task_id,
                canonical_name=f"child-{task_id}",
                description="work",
                state=ChildTaskState.SUCCEEDED,
                duration_s=1.0,
                still_running_count=0,
                artifact_ids=[],
            ),
        )

    manager.discard_notifications({"bg_a", "bg_c"})

    remaining = manager.get_pending_notifications()
    assert [n.task_id for n in remaining] == ["bg_b"]


def test_discard_notifications_empty_set_is_noop() -> None:
    manager = ChildManager(
        parent_agent_id="parent",
        current_depth=0,
        policy=RuntimePolicy(max_children=8, max_depth=3),
    )
    manager.pending_notifications.put(
        ChildNotification(
            task_id="bg_a",
            canonical_name="child-a",
            description="work",
            state=ChildTaskState.SUCCEEDED,
            duration_s=1.0,
            still_running_count=0,
            artifact_ids=[],
        ),
    )

    manager.discard_notifications(set())

    assert [n.task_id for n in manager.get_pending_notifications()] == ["bg_a"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/unit/test_child_manager.py -k discard_notifications -v`
Expected: FAIL with `AttributeError: 'ChildManager' object has no attribute 'discard_notifications'`

- [ ] **Step 3: Implement** (in `child_manager.py`, directly after `get_pending_notifications`)

```python
    def discard_notifications(self, task_ids: set[str]) -> None:
        """Drop pending notifications for tasks already reported to the parent.

        The drain calls this after delivering a child's report through a
        wait-barrier or foreground resume so the same completion is not
        re-announced as a "[BACKGROUND TASK COMPLETED]" notification.
        """
        if not task_ids:
            return
        for notification in self.get_pending_notifications():
            if notification.task_id not in task_ids:
                self.pending_notifications.put(notification)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/unit/test_child_manager.py -k discard_notifications -v`
Expected: 2 PASS

- [ ] **Step 5: Lint, typecheck, commit**

```bash
make lint && make typecheck
git add tests/unit/test_child_manager.py
git commit --only src/rotaris_core/orchestrator/child_manager.py --only tests/unit/test_child_manager.py -m "feat(orchestrator): ChildManager.discard_notifications for drain dedup"
```

---

### Task 2: Drain loop in `_drain_delegated_children`

**Files:**
- Modify: `src/rotaris_core/orchestrator/scheduler_drain.py:77-144` (`_drain_delegated_children`), `:146-190` (`_run_foreground_drain`), `:212-268` (`_run_wait_barrier_if_requested`)
- Test: `tests/integration/test_orchestrator_e2e.py`

**Interfaces:**
- Consumes: `ChildManager.discard_notifications(task_ids: set[str])` from Task 1; existing `manager.wait_barrier.request_wait/consume`; existing fixtures `_RecordingConversation`, `make_manager`, `make_scheduler`, `make_agent`, `RotarisDelegateExecutor`, `DelegateAction`, `MockToolEvent`, `MockMessageEvent`.
- Produces: no signature changes; `_drain_delegated_children` now loops until quiescent.

- [ ] **Step 1: Write the failing tests** (append to `tests/integration/test_orchestrator_e2e.py`, after the double-resume regression tests ~line 705)

```python
class _ScriptedParentConversation(_RecordingConversation):
    """Parent whose run() triggers a scripted side effect on specific run counts.

    Simulates a parent agent that calls wait_for_tasks or delegates more
    children *during a resumed run* — i.e. inside conversation.run() invoked
    by the drain's resume path.
    """

    def __init__(self, **kwargs: object) -> None:
        super().__init__(**kwargs)
        self.on_run: dict[int, object] = {}

    def run(self) -> None:
        super().run()
        action = self.on_run.pop(self.run_call_count, None)
        if action is not None:
            action()  # type: ignore[operator]


# ---------------------------------------------------------------------------
# Regression: one-shot drain (session 20260707-103842-887caa4f194c)
# wait_for_tasks called during a *resumed* run registered a barrier request
# that was never consumed — the drain checked the barrier only at entry.
# The parent ended "blocked" and Ralph spawned a duplicate orchestrator.
# ---------------------------------------------------------------------------


async def test_wait_for_tasks_during_resumed_run_is_honored() -> None:
    """Barrier registered during the spawn-resume run must be consumed:
    the drain loops back, waits for the child, and resumes the parent with
    results instead of falling through to summarization."""
    child = _RecordingConversation(
        events=[MockToolEvent("bash"), MockMessageEvent("assistant", ["bg done"])],
    )
    parent = _ScriptedParentConversation()
    manager = make_manager()
    scheduler, _ = make_scheduler(conversations=[child])
    executor = RotarisDelegateExecutor(manager, scheduler, make_agent)
    observation = executor(
        DelegateAction(
            persona="builder",
            task_name="bg-child",
            task="background work",
            run_in_background=True,
        ),
    )
    # During run #1 (the "Background tasks have started" resume) the parent
    # calls wait_for_tasks on the just-spawned child.
    parent.on_run[1] = lambda: manager.wait_barrier.request_wait(
        parent, [observation.task_id],
    )
    parent_record = ChildTaskRecord(
        name="parent",
        canonical_name="parent",
        persona="orchestrator",
        task_payload="test",
    )

    await asyncio.wait_for(
        scheduler._drain_delegated_children(manager, make_agent, parent, parent_record),
        timeout=10,
    )

    wait_resumes = [
        m
        for m in parent.sent_messages
        if m.startswith("Background tasks you waited for have completed")
    ]
    assert len(wait_resumes) == 1, parent.sent_messages
    assert "**bg-child**" in wait_resumes[0]
    # Run #1 = spawn resume, run #2 = wait-results resume. No third resume:
    # the completion notification for the waited child must be discarded,
    # not re-injected as a duplicate.
    assert parent.run_call_count == 2, parent.sent_messages
    assert not any(
        m.startswith("[BACKGROUND TASK COMPLETED]") for m in parent.sent_messages
    ), parent.sent_messages


async def test_delegation_during_resumed_run_spawns_in_same_drain() -> None:
    """A child delegated during a resumed run must be spawned by the same
    drain call — not silently left QUEUED for a future iteration."""
    first_child = _RecordingConversation(
        events=[MockToolEvent("bash"), MockMessageEvent("assistant", ["first done"])],
    )
    second_child = _RecordingConversation(
        events=[MockToolEvent("bash"), MockMessageEvent("assistant", ["second done"])],
    )
    parent = _ScriptedParentConversation()
    manager = make_manager()
    scheduler, _ = make_scheduler(conversations=[first_child, second_child])
    executor = RotarisDelegateExecutor(manager, scheduler, make_agent)
    executor(
        DelegateAction(
            persona="builder",
            task_name="first",
            task="first work",
            run_in_background=True,
        ),
    )
    # During run #1 the parent delegates a second background child.
    parent.on_run[1] = lambda: executor(
        DelegateAction(
            persona="builder",
            task_name="second",
            task="second work",
            run_in_background=True,
        ),
    )
    parent_record = ChildTaskRecord(
        name="parent",
        canonical_name="parent",
        persona="orchestrator",
        task_payload="test",
    )

    await asyncio.wait_for(
        scheduler._drain_delegated_children(manager, make_agent, parent, parent_record),
        timeout=10,
    )

    states = {
        record.canonical_name: record.state for record in manager.snapshot_children()
    }
    assert states["first"] == ChildTaskState.SUCCEEDED
    assert states["second"] == ChildTaskState.SUCCEEDED, (
        "child delegated during a resumed run must be spawned by the same drain"
    )
    assert second_child.run_call_count == 1
    assert scheduler._active_tasks == {}


async def test_drain_loop_terminates_when_spawn_makes_no_progress(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Children that stay QUEUED/WAITING (spawn makes no progress) must not
    cause an infinite spawn/resume loop: exactly one resume, then return."""
    parent = _ScriptedParentConversation()
    manager = make_manager()
    scheduler, _ = make_scheduler(conversations=[])
    executor = RotarisDelegateExecutor(manager, scheduler, make_agent)
    executor(
        DelegateAction(
            persona="builder",
            task_name="stuck",
            task="never spawns",
            run_in_background=True,
        ),
    )

    async def _spawn_nothing(manager: object, agent_factory: object) -> list[str]:
        del manager, agent_factory
        return []

    monkeypatch.setattr(scheduler, "spawn_children", _spawn_nothing)
    parent_record = ChildTaskRecord(
        name="parent",
        canonical_name="parent",
        persona="orchestrator",
        task_payload="test",
    )

    await asyncio.wait_for(
        scheduler._drain_delegated_children(manager, make_agent, parent, parent_record),
        timeout=10,
    )

    assert parent.run_call_count == 1, (
        "stuck children must yield exactly one resume, not an infinite loop"
    )
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/integration/test_orchestrator_e2e.py -k "resumed_run or no_progress" -v`
Expected: `test_wait_for_tasks_during_resumed_run_is_honored` FAILS (no wait-resume message, run_call_count == 1); `test_delegation_during_resumed_run_spawns_in_same_drain` FAILS (`states["second"]` is QUEUED); `test_drain_loop_terminates_when_spawn_makes_no_progress` PASSES already (guards the new loop — must still pass after Step 3).

- [ ] **Step 3: Implement the loop** — replace `_drain_delegated_children` body in `scheduler_drain.py`:

```python
    async def _drain_delegated_children(
        self,
        manager: ChildManager,
        agent_factory: AgentFactory,
        conversation: Any,
        parent_record: ChildTaskRecord,
        open_todo_items_provider: Callable[[], list[str]] | None = None,
    ) -> None:
        """Execute delegated children and resume the parent with their results.

        Runs as a loop: every drain pass resumes the parent, and the resumed
        parent may call ``wait_for_tasks`` or delegate more children — so the
        barrier / notification / queued-children checks re-run after each
        resume (one-shot checking silently discarded wait requests registered
        during resumed runs and left late delegations QUEUED forever).

        Termination: exits when a pass finds no pending wait request, no
        pending notifications, and no queued children beyond those already
        attempted.  The ``attempted_spawn_names`` guard prevents an infinite
        spawn/resume cycle when children are stuck WAITING_ON_DEPENDENCIES
        (only the QUEUED / WAITING states are considered — snapshotting all
        non-terminal records would include the *current* task when an outer
        ``spawn_children`` call placed it in ``_active_tasks``, deadlocking
        ``wait_for_any_terminal`` on itself).
        """
        attempted_spawn_names: set[str] = set()
        while True:
            if await self._run_wait_barrier_if_requested(
                manager,
                agent_factory,
                conversation,
                parent_record,
                open_todo_items_provider=open_todo_items_provider,
            ):
                continue

            if parent_record.canonical_name == getattr(
                manager,
                "_parent_id",
                None,
            ) and await self._drain_pending_background_notifications(
                manager,
                conversation,
                parent_record,
                open_todo_items_provider=open_todo_items_provider,
            ):
                continue

            pending_names = {
                record.canonical_name
                for record in manager.snapshot_children()
                if record.state
                in {ChildTaskState.QUEUED, ChildTaskState.WAITING_ON_DEPENDENCIES}
            }
            if not pending_names or pending_names <= attempted_spawn_names:
                return
            attempted_spawn_names |= pending_names

            has_foreground = any(
                not record.run_in_background
                for record in manager.snapshot_children()
                if record.canonical_name in pending_names
            )
            if has_foreground:
                await self._run_foreground_drain(
                    manager,
                    agent_factory,
                    conversation,
                    parent_record,
                    open_todo_items_provider=open_todo_items_provider,
                )
            else:
                await self._run_background_drain(
                    manager,
                    agent_factory,
                    conversation,
                    parent_record,
                    open_todo_items_provider=open_todo_items_provider,
                )
            # Parent was resumed during the drain — loop to re-check the
            # barrier, notifications, and any children delegated meanwhile.
```

Then add notification dedup. In `_run_wait_barrier_if_requested`, insert before **both** `resume_msg = self._build_wait_resume_message(...)` lines:

```python
                manager.discard_notifications(
                    {record.task_id for record, _ in waited_pairs if record.task_id},
                )
```

In `_run_foreground_drain`, after the `for child_record, _report in terminal_children:` loop (before `if not terminal_children:`), insert:

```python
                manager.discard_notifications(
                    {record.task_id for record, _ in terminal_children if record.task_id},
                )
```

- [ ] **Step 4: Run the new tests + all drain-related tests**

Run: `pytest tests/integration/test_orchestrator_e2e.py tests/unit/test_scheduler.py tests/unit/test_wait_for_tasks_tool.py tests/unit/test_wait_barrier.py -q`
Expected: all PASS (new tests green; existing double-resume regressions, notification-injection e2e, and resume-message tests unaffected).

- [ ] **Step 5: Lint, typecheck, commit**

```bash
make lint && make typecheck
git add tests/integration/test_orchestrator_e2e.py
git commit --only src/rotaris_core/orchestrator/scheduler_drain.py --only tests/integration/test_orchestrator_e2e.py -m "fix(orchestrator): loop delegation drain so wait requests during resumed runs are honored

One-shot drain checked the wait barrier only at entry. A parent that
delegated in run 1 and called wait_for_tasks during the spawn-resume run
registered a barrier request one step past the only checkpoint; the
request was silently discarded, the parent ended 'blocked', and RalphLoop
spawned a duplicate orchestrator with the same prompt (session
20260707-103842-887caa4f194c, 5 duplicate iterations). The drain now
loops after every parent resume, with an attempted-spawn guard against
infinite resume cycles and notification dedup for children already
reported through a wait or foreground resume."
```

---

### Task 3: Fire-and-forget pause in `WaitForTasksExecutor`

**Files:**
- Modify: `src/rotaris_core/orchestrator/scheduler_conversation.py:140-170` (`pause_with_daemon`)
- Modify: `src/rotaris_core/tools/wait_for_tasks.py:92-106` (`_pause_parent_conversation`)
- Test: `tests/unit/test_scheduler_conversation.py`, `tests/unit/test_wait_for_tasks_tool.py`

**Interfaces:**
- Produces: `pause_with_daemon(conversation: SupportsPause, *, block: bool = True) -> None`. `block=False` returns immediately; wait-and-log moves to a watchdog daemon thread. All existing call sites keep blocking default.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/test_scheduler_conversation.py`:

```python
def test_pause_with_daemon_nonblocking_returns_before_pause_completes() -> None:
    release = threading.Event()

    class _SlowPauseConversation:
        def pause(self) -> None:
            release.wait(timeout=5)

    conversation = _SlowPauseConversation()
    started = time.monotonic()
    pause_with_daemon(conversation, block=False)
    elapsed = time.monotonic() - started
    release.set()

    assert elapsed < 1.0, f"block=False must not wait for pause(), took {elapsed:.1f}s"
```

Append to `tests/unit/test_wait_for_tasks_tool.py` (reuse the file's existing manager/record helpers for setting up a manager with one running background child):

```python
def test_wait_executor_does_not_block_on_slow_pause() -> None:
    """Executor runs inside conversation.run()'s own call stack — the run
    loop cannot honor the pause until the executor returns, so the executor
    must never wait for pause() to land (was a guaranteed 20s stall)."""
    release = threading.Event()

    class _SlowPauseConversation:
        def pause(self) -> None:
            release.wait(timeout=30)

    manager, record = _make_manager_with_running_background_child()
    executor = WaitForTasksExecutor(manager)
    conversation = _SlowPauseConversation()

    started = time.monotonic()
    observation = executor(
        WaitForTasksAction(task_ids=[record.task_id]),
        conversation=conversation,
    )
    elapsed = time.monotonic() - started
    release.set()

    assert elapsed < 2.0, f"executor blocked {elapsed:.1f}s on its own pause"
    assert observation.already_done is False
    assert manager.wait_barrier.consume(conversation) == [record.task_id]
```

(If `tests/unit/test_wait_for_tasks_tool.py` has no `_make_manager_with_running_background_child` helper, adapt to however `test_wait_request_lands_in_manager_wait_barrier` builds its manager + running background record — reuse that exact setup.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/unit/test_scheduler_conversation.py -k nonblocking tests/unit/test_wait_for_tasks_tool.py -k slow_pause -v`
Expected: `test_pause_with_daemon_nonblocking_returns_before_pause_completes` FAILS with `TypeError: pause_with_daemon() got an unexpected keyword argument 'block'`; `test_wait_executor_does_not_block_on_slow_pause` FAILS on the elapsed assertion (~20 s) — run it with `--timeout 60` if the suite default is lower.

- [ ] **Step 3: Implement** — replace `pause_with_daemon` in `scheduler_conversation.py`:

```python
def pause_with_daemon(conversation: SupportsPause, *, block: bool = True) -> None:
    """Pause *conversation* in a daemon thread with a 20 s timeout.

    Dispatches ``conversation.pause()`` to a daemon thread so the caller
    never blocks on the pause call itself (critical for signal-handler /
    UI-thread callers).  With ``block=True`` the caller additionally waits
    up to the timeout for the pause to land.  Pass ``block=False`` from
    call sites that run *inside* the conversation's own run loop (tool
    executors): the run loop cannot advance to its pause check until the
    executor returns, so blocking there always burns the full timeout.
    The completion/warning log then comes from a watchdog thread.
    """
    event = threading.Event()
    pre_state = capture_conversation_state(conversation)

    def _do_pause() -> None:
        try:
            conversation.pause()
        except Exception:
            _log.exception("Failed to pause active conversation during shutdown")
        finally:
            event.set()

    t = threading.Thread(target=_do_pause, name="rotaris-conversation-pause", daemon=True)
    t.start()

    def _await_and_log() -> None:
        if not event.wait(timeout=_CONVERSATION_PAUSE_TIMEOUT_S):
            _log.warning(
                "conversation.pause() did not complete within %.0fs (pre_state=%s)",
                _CONVERSATION_PAUSE_TIMEOUT_S,
                pre_state,
            )
        else:
            _log.info(
                "conversation.pause() completed (pre_state=%s)",
                pre_state,
            )

    if block:
        _await_and_log()
        return
    threading.Thread(
        target=_await_and_log,
        name="rotaris-conversation-pause-watch",
        daemon=True,
    ).start()
```

Update `WaitForTasksExecutor._pause_parent_conversation` in `wait_for_tasks.py` — replace the final call and extend the comment:

```python
        # Dispatch through the daemon-thread-wrapped helper rather than
        # calling conversation.pause() inline: this executor runs *inside*
        # conversation.run()'s own call stack, so a blocking pause() here
        # would be waiting on the very run loop that is currently blocked
        # calling it — the same reentrancy hazard documented on every other
        # pause call site in the scheduler.  block=False because the run
        # loop cannot even *check* the pause flag until this executor
        # returns; waiting for the pause to land is a guaranteed timeout.
        from rotaris_core.orchestrator.scheduler_conversation import pause_with_daemon

        pause_with_daemon(cast("Any", conversation), block=False)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/unit/test_scheduler_conversation.py tests/unit/test_wait_for_tasks_tool.py -v`
Expected: all PASS, new tests complete in well under 2 s.

- [ ] **Step 5: Lint, typecheck, commit**

```bash
make lint && make typecheck
git add tests/unit/test_scheduler_conversation.py tests/unit/test_wait_for_tasks_tool.py
git commit --only src/rotaris_core/orchestrator/scheduler_conversation.py --only src/rotaris_core/tools/wait_for_tasks.py --only tests/unit/test_scheduler_conversation.py --only tests/unit/test_wait_for_tasks_tool.py -m "fix(tools): wait_for_tasks pause is fire-and-forget

The executor runs inside conversation.run()'s tool-execution step; the
run loop cannot honor the pause until the executor returns, so blocking
on pause completion was a guaranteed 20s stall per wait_for_tasks call
(circular wait broken only by the timeout). pause_with_daemon gains
block=False: the pause still dispatches to a daemon thread, but the
wait-and-log moves to a watchdog thread instead of the caller."
```

---

### Task 4: Docs + version bump + full sweep

**Files:**
- Modify: `CLAUDE.md` (ChildManager/wait-barrier paragraph in Architecture section)
- Modify: `CONTEXT.md` ("Wait handshake is explicit, not smuggled" design decision)
- Modify: `pyproject.toml` (version 0.66.0 → 0.66.1)

**Interfaces:** none — documentation only.

- [ ] **Step 1: Update CLAUDE.md** — in the ChildManager paragraph, extend the `wait_barrier` sentence:

Replace:
> It also owns `wait_barrier` (`orchestrator/wait_barrier.py::WaitBarrier`): the `wait_for_tasks` tool registers the task ids a parent wants to block on, and the scheduler drain (`_run_wait_barrier_if_requested`) consumes them — never pass this handshake by setting attributes on the SDK conversation object.

With:
> It also owns `wait_barrier` (`orchestrator/wait_barrier.py::WaitBarrier`): the `wait_for_tasks` tool registers the task ids a parent wants to block on, and the scheduler drain (`_run_wait_barrier_if_requested`) consumes them — never pass this handshake by setting attributes on the SDK conversation object. `_drain_delegated_children` is a **loop**: every parent resume can register a new wait request or delegate more children, so the barrier / notification / queued-children checks re-run after each resume (an `attempted_spawn_names` guard stops the loop when spawn makes no progress). Children reported through a wait or foreground resume have their pending completion notifications dropped via `ChildManager.discard_notifications` so they are not re-announced.

- [ ] **Step 2: Update CONTEXT.md** — extend the "Wait handshake is explicit, not smuggled" section with:

```markdown
The delegation drain re-checks the barrier after *every* parent resume —
`_drain_delegated_children` is a loop, not a one-shot check. A parent that
delegates in its first run and calls `wait_for_tasks` during the spawn-resume
run registers its request one step past drain entry; the one-shot design
silently discarded it, ended the parent "blocked", and made RalphLoop spawn a
duplicate orchestrator (session 20260707-103842). The loop exits when a pass
finds no wait request, no pending notifications, and no queued children it
has not already attempted to spawn.
```

- [ ] **Step 3: Bump version** — `pyproject.toml`: `version = "0.66.0"` → `version = "0.66.1"`.

- [ ] **Step 4: Full sweep + verify baseline**

Run: `make test-cov` or `pytest -q 2>&1 | grep -E "passed|failed"`
Expected: exactly the pre-existing 17 failures (15 TUI snapshot + `test_coordinator_only_persona_strips_non_orchestration_tools` + `test_resolved_runtime_prompt_matches_coordinator_only_tools`); everything else passes. Compare the failing-test list against the baseline before declaring success.

- [ ] **Step 5: Commit**

```bash
git commit --only CLAUDE.md --only CONTEXT.md --only pyproject.toml --only docs/plans/2026-07-07-drain-loop-wait-barrier-fix.md -m "docs: document drain loop + wait-barrier re-check; bump to 0.66.1"
```
