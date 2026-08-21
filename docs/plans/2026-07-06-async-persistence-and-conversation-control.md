# Async Persistence + Conversation Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement backlog candidates 2 and 3 from the 2026-07-06 architecture review: move session persistence off the event loop behind a single-debounce async interface, and deepen `orchestrator/scheduler_conversation.py` into the ConversationControl module (thread-safe tool-activity registry + graceful pause moved out of `Scheduler`).

**Architecture:**
- Candidate 3: `scheduler_conversation.py` (already the documented pause/close seam) gains `ToolActivityRegistry` (lock-protected replacement for the raced `Scheduler._active_tool_ids` dict) and a free function `graceful_pause_conversation(...)` (body moved from `Scheduler._graceful_pause_conversation`, which becomes a thin delegator so `child_run.py` call sites stay untouched).
- Candidate 2: new `session/persister.py::SessionPersister` — the one debounce layer; writes happen via `asyncio.to_thread` on a deep copy of the state; non-running execution statuses flush synchronously and immediately (durability for pause/stop/background transitions); `await flush(state)` is the guaranteed final write. Hosts (`tui/app.py`, `tui/app_run.py`, `cli/background.py`) route through `SessionManager.persister`. `SessionManager.save_session` stays for compat but hosts no longer call it.

**Tech Stack:** Python 3.12, asyncio, threading, pydantic `model_copy(deep=True)`, pytest (`asyncio_mode = "auto"`).

## Fixed Bugs / Behavior Changes

1. **`_active_tool_ids` race** — writes from the SDK worker thread (`child_run.py:141-164`), unlocked reads from UI/daemon threads (`scheduler.py:931/944`), and a lost-update window in the discard-then-delete sequence. Now all access goes through a `threading.Lock` inside `ToolActivityRegistry`.
2. **Pending debounced saves could be lost** — `SessionManager.save_session` parks the state in `_pending_save_states` and only writes it when a LATER save call arrives. `SessionPersister` schedules a timer task, so a parked save is always written within the debounce window.
3. **Session snapshot writes move off the event loop** — `save_snapshot` fans out to 7 atomic file writes (resume.json, ui_transcript.json, ui_edit_diffs.json, metrics.json, summary.md, snapshot.json, metadata.json), previously all on the loop thread. Now `asyncio.to_thread` on a deep copy.
4. **Status-transition saves are synchronous and immediate** (pause/stop/background/shutdown) — same as today's `save_session` fast path, now explicit in `request_save`.
5. **TUI `_persist_state_now` finally forces a write at run end** — today it still hits the 10 s manager debounce; the run-end path now awaits `persister.flush(state)`.

## Global Constraints

- Line length 100; ruff `E,F,I,N,W,UP,B,SIM,TCH`; mypy strict.
- Lazy imports; `scheduler ↔ child_manager ↔ delegate_tool` triangle stays function-local.
- Tests: plain functions, monkeypatch on module paths, `asyncio_mode = "auto"`.
- Commit with `git commit --only <paths>` (user has parallel working-tree edits: `generate_traceability.py`, `tests/unit/test_generate_traceability.py`, `snapshot_report.html` — NEVER commit those).
- Pre-existing failures (do not chase): 15 TUI snapshot tests + `test_coordinator_only_persona_strips_non_orchestration_tools` + `test_resolved_runtime_prompt_matches_coordinator_only_tools`. Baseline: 17 failed.
- Version bump at the end: 0.64.0 → 0.65.0.

---

### Task 1: `ToolActivityRegistry` + `graceful_pause_conversation` in `scheduler_conversation.py`

**Files:**
- Modify: `src/rotaris_core/orchestrator/scheduler_conversation.py`
- Test: `tests/unit/test_scheduler_conversation.py` (new)

**Interfaces produced:**
- `class ToolActivityRegistry`: `tool_started(canonical, call_id)`, `tool_finished(canonical, call_id)`, `clear(canonical)`, `has_active_tools(canonical) -> bool`, `active_tool_ids(canonical) -> set[str]` (copy).
- `def graceful_pause_conversation(conversation, canonical_name, *, registry, tool_deadline=30.0, force_close_when_stuck=False, poll_interval=0.5) -> None` — returns immediately; daemon threads do the waiting. Behavior identical to today's `Scheduler._graceful_pause_conversation` but consults the registry.

- [ ] Step 1: Write failing tests (registry semantics, concurrent hammer, graceful-pause three paths with fake conversation + small `poll_interval`/`tool_deadline`).
- [ ] Step 2: Implement both in `scheduler_conversation.py`.
- [ ] Step 3: `pytest tests/unit/test_scheduler_conversation.py -q` + ruff + mypy on the file.
- [ ] Step 4: Commit (`--only` the two files + TRACEABILITY.md).

### Task 2: Scheduler integration — registry replaces `_active_tool_ids`

**Files:**
- Modify: `src/rotaris_core/orchestrator/scheduler.py` (init + `_graceful_pause_conversation` body → delegator), `src/rotaris_core/orchestrator/child_run.py` (3 touch points: lines ~141-143 start, ~158-164 finish, ~1071 clear).
- Test: `tests/unit/test_scheduler.py` (append delegation test).

**Interfaces:** `Scheduler._tool_activity: ToolActivityRegistry`; `Scheduler._graceful_pause_conversation(conversation, canonical_name, *, force_close_when_stuck=False)` keeps its signature (child_run call sites unchanged).

- [ ] Step 1: Replace `self._active_tool_ids: dict[str, set[str]] = {}` with `self._tool_activity = ToolActivityRegistry()`.
- [ ] Step 2: `_graceful_pause_conversation` body: `graceful_pause_conversation(conversation, canonical_name, registry=self._tool_activity, tool_deadline=float(getattr(self.config.runtime, "graceful_pause_tool_deadline", 30.0)), force_close_when_stuck=force_close_when_stuck)`.
- [ ] Step 3: child_run.py: `tool_started` / `tool_finished` / `clear` calls.
- [ ] Step 4: Test: monkeypatch `rotaris_core.orchestrator.scheduler_conversation.graceful_pause_conversation` (wait: scheduler imports it at module top — patch on the scheduler module path it's used from) and assert delegation kwargs; grep for any other `_active_tool_ids` references and fix.
- [ ] Step 5: `pytest tests/unit/test_scheduler.py tests/unit/test_scheduler_recovery.py -q` + ruff + mypy. Commit.

### Task 3: `session/persister.py` — `SessionPersister`

**Files:**
- Create: `src/rotaris_core/session/persister.py`
- Modify: `src/rotaris_core/session/manager.py` (lazy `persister` property)
- Test: `tests/unit/test_session_persister.py` (new)

**Interface produced:**

```python
class SessionPersister:
    def __init__(self, manager: SessionManager, *, debounce_seconds: float = 10.0) -> None
    def request_save(self, state: SessionState) -> None
    async def flush(self, state: SessionState) -> None
    def flush_sync(self, state: SessionState) -> None
```

Semantics:
- `request_save`: if `state.execution_status not in {"running", "idle"}` → cancel timer, `flush_sync` (immediate, caller thread). If no running loop → `flush_sync`. Else store `_pending_state` and ensure a timer task fires at `_last_write_at + debounce` (immediately if already elapsed).
- Writer: `state.updated_at = now`; `copy = state.model_copy(deep=True)`; `await asyncio.to_thread(manager.persistence.save_snapshot, copy)` under an `asyncio.Lock`; write wrapped in `asyncio.shield` so a cancelled timer can't leave a half-written split state.
- `flush`: cancel timer, clear pending, write now (awaited).
- `flush_sync`: `manager.flush_session(state)`.
- `SessionManager.persister` property: cached `SessionPersister(self)` (import inside property — lazy-import rule).

- [ ] Step 1: Failing tests: debounce coalesces rapid saves; parked save written by timer with no further calls; non-running status writes immediately+sync; flush cancels timer and writes; write runs off the calling thread; mutations between request and timer fire land in the written snapshot.
- [ ] Step 2: Implement module + property.
- [ ] Step 3: `pytest tests/unit/test_session_persister.py tests/unit/test_session_manager.py -q` + ruff + mypy. Commit.

### Task 4: Host integration (TUI + CLI)

**Files:**
- Modify: `src/rotaris_core/tui/app_run.py` (`persist_state` closure → `persister.request_save`; run-`finally` → `await persister.flush(state)`), `src/rotaris_core/tui/app.py` (7 `save_session` sites → `persister.request_save`), `src/rotaris_core/cli/background.py` (`_persist_session_state` → `request_save`; end-of-run/except paths → `flush_sync` or awaited `flush`).
- Test: adapt `tests/unit/test_tui_app.py` mocks if they assert on `save_session`.

Notes:
- `TuiRalphLoop` is untouched: its `persist_state` callback now routes to the persister; its local 0.25 s debounce stays (it also gates `_trim_session_state` cost).
- Status-transition sites (pause on SIGINT, stop, background handoff, shutdown message) rely on `request_save`'s sync fast path — no case analysis at call sites.

- [ ] Step 1: Migrate app_run.py; keep `sync_tracker_to_session` + `_refresh_widgets` in the closure.
- [ ] Step 2: Migrate tui/app.py sites.
- [ ] Step 3: Migrate cli/background.py.
- [ ] Step 4: `pytest tests/unit/test_tui_app.py tests/unit/test_ralph_loop.py tests/unit/test_session_manager.py -q` + targeted TUI run tests + ruff + mypy. Commit.

### Task 5: Docs, version, full sweep

- [ ] Step 1: CLAUDE.md — persistence section: snapshot writes now debounced+off-loop via `SessionPersister` (note the known non-atomic gap is unchanged at the file level but writes are now on copies); pausing section: mention `ToolActivityRegistry`.
- [ ] Step 2: CONTEXT.md — domain rows: "Session Persister", "Tool Activity Registry"; design decision: "Conversation control lives in one module".
- [ ] Step 3: pyproject.toml → 0.65.0.
- [ ] Step 4: Full unit sweep in background; expect baseline 17 failures only. `make lint && make typecheck`.
- [ ] Step 5: Commit docs+version.
