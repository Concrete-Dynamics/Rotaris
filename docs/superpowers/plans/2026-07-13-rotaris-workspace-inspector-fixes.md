# Rotaris workspace: editable todos, tool-call highlighting, inspector staleness fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Rotaris workspace sidebar todo list editable (add/rename/remove, live or idle), give inspector tool pills a third "called at least once" state, and fix two inspector staleness bugs (root context always 0%, root reasoning ignoring the composer's override).

**Architecture:** All changes live in `apps/rotaris/` (thin Qt frontend) plus one new field on the shared backend `SessionState` (`src/rotaris_core/session/state.py`). No changes to `ralph/loop.py` iteration semantics — todo mutation piggybacks on the live `TodoList` object already handed to `_SessionObserver` via existing `on_child_created`/`on_iteration_end` hooks.

**Tech Stack:** PySide6 (Qt widgets/signals), pydantic (`SessionState`, `TodoList`/`TodoTask`/`TodoPhase`), pytest + pytest-qt + pytest-asyncio.

## Global Constraints

- Ruff line length 100, `target-version = "py312"` — matches existing file style.
- Lazy imports for heavy/backend modules inside functions (per `CLAUDE.md` critical rules) — mirrors existing pattern in `config_service.py`/`run_bridge.py`.
- New `SessionState` field must have a default (backward compat with old session snapshots) — no `SESSION_SCHEMA_VERSION` bump (additive, non-breaking).
- Bump `apps/rotaris/pyproject.toml` version (0.1.8 → 0.1.9) as the final step.
- Follow existing test placement: unit/service tests in `apps/rotaris/tests/test_services.py`, widget/interaction tests in `apps/rotaris/tests/test_views.py`, full observer↔store round-trip tests in `apps/rotaris/tests/test_run_wiring_e2e.py`.

---

## Task 1: Backend — cache root/orchestrator context tokens

**Files:**
- Modify: `src/rotaris_core/session/state.py:37-41` (add field next to `todo_state`)
- Modify: `apps/rotaris/src/rotaris/services/run_bridge.py:613-614` (`on_last_prompt_tokens`), `~672-676` (`_set_prompt_tokens`)
- Test: `apps/rotaris/tests/test_services.py`

**Interfaces:**
- Produces: `SessionState.root_context_tokens: int` (default `0`), read by Task 2's root `AgentNode` construction.

- [ ] **Step 1: Write failing test**

Add to `apps/rotaris/tests/test_services.py` (near `test_bind_scheduler_callbacks_wires_the_ralph_scheduler_not_the_child_manager`):

```python
def test_on_last_prompt_tokens_caches_root_context_tokens() -> None:
    class FakePersister:
        def request_save(self, _state) -> None:
            pass

    manager = SimpleNamespace(persister=FakePersister())
    state = SimpleNamespace(agent_metrics={}, root_context_tokens=0)
    observer = _SessionObserver(SimpleNamespace(call_soon_threadsafe=lambda fn, *a: fn(*a)), manager, state)

    observer.on_last_prompt_tokens(SimpleNamespace(canonical_name="coder-1"), 4200)

    assert state.root_context_tokens == 4200
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd apps/rotaris && uv run pytest tests/test_services.py::test_on_last_prompt_tokens_caches_root_context_tokens -v`
Expected: FAIL — `AttributeError` or assertion `0 == 4200` fails, since `_set_prompt_tokens` doesn't touch `root_context_tokens` yet.

- [ ] **Step 3: Add the field and wire the cache**

In `src/rotaris_core/session/state.py`, right after `agent_todo_state: dict[str, Any] | None = None` (line 38):

```python
    todo_state: dict[str, Any] | None = None
    agent_todo_state: dict[str, Any] | None = None
    # Last observed prompt-token count from *any* agent's LLM call, used as a
    # context-usage proxy for the synthetic root/orchestrator node in Rotaris
    # (no `agent_metrics` entry exists for the root itself — mirrors the same
    # workaround the TUI uses via `render_state.last_context_tokens`).
    root_context_tokens: int = 0
```

In `apps/rotaris/src/rotaris/services/run_bridge.py`, update `_set_prompt_tokens` (~line 672):

```python
    def _set_prompt_tokens(self, agent_name: str, tokens: int) -> None:
        metrics = self.state.agent_metrics.get(agent_name)
        if metrics is not None:
            metrics.last_prompt_tokens = tokens
        self.state.root_context_tokens = tokens
        self.manager.persister.request_save(self.state)
```

- [ ] **Step 4: Run test, verify it passes**

Run: `cd apps/rotaris && uv run pytest tests/test_services.py::test_on_last_prompt_tokens_caches_root_context_tokens -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/rotaris_core/session/state.py apps/rotaris/src/rotaris/services/run_bridge.py apps/rotaris/tests/test_services.py
git commit -m "feat(session): cache last observed prompt tokens as root context proxy"
```

---

## Task 2: Root agent node — fix context 0% and reasoning staleness

**Files:**
- Modify: `apps/rotaris/src/rotaris/services/config_service.py:481-492` (`apply_session` root `AgentNode` construction)
- Modify: `apps/rotaris/tests/test_services.py` (extend `test_config_service_maps_persisted_session_to_store`)

**Interfaces:**
- Consumes: `SessionState.root_context_tokens` (Task 1), `WorkspaceStore.session_reasoning_override` (existing, `models/store.py:56`).
- Produces: root `AgentNode.ctx_used` / `.ctx_limit` / `.reasoning` correctly populated — no new interface, internal fix.

- [ ] **Step 1: Write failing test**

Extend `test_config_service_maps_persisted_session_to_store` in `apps/rotaris/tests/test_services.py`. Add `root_context_tokens` to the fake `state`, set a reasoning override on the store before calling `apply_session`, and assert both fixes:

```python
    state = SimpleNamespace(
        session_id="session-1",
        execution_status="running",
        transcript_events=[{"role": "user", "content": "Build it"}],
        child_states=[
            {
                "canonical_name": "coder-1",
                "persona": "coder",
                "state": "running",
                "task_payload": "Implement view",
                "parent_agent_id": "missing-parent",
            }
        ],
        todo_state={
            "phases": [{"tasks": [{"id": "1", "name": "Implement view", "status": "IN_PROGRESS"}]}]
        },
        token_usage=None,
        global_token_usage=SimpleNamespace(total_tokens=3200),
        global_tool_call_count=2,
        agent_metrics={"coder-1": metrics},
        root_context_tokens=51_200,
    )
    store.session_reasoning_override = "low"

    service.apply_session(state)

    assert store.session_name == "session-1"
    assert store.agents["orchestrator"].state is AgentState.RUNNING
    assert store.agents["orchestrator"].ctx_used == 51_200
    assert store.agents["orchestrator"].ctx_limit == 200_000
    assert store.agents["orchestrator"].reasoning == "low"
```

(Root persona `"orchestrator"` resolves to `model="model"` in the fixture's `config.personas`, and `config.models["model"].max_input_tokens == 200_000` — reuse the existing fixture values, just add the two new assertions and the `root_context_tokens`/`session_reasoning_override` setup above.)

- [ ] **Step 2: Run test, verify it fails**

Run: `cd apps/rotaris && uv run pytest tests/test_services.py::test_config_service_maps_persisted_session_to_store -v`
Expected: FAIL — `ctx_used == 0`, `reasoning == "high"` (persona default), not `51_200`/`"low"`.

- [ ] **Step 3: Fix root node construction**

In `apps/rotaris/src/rotaris/services/config_service.py`, replace the root `AgentNode(...)` call (lines 481-492):

```python
        root_config = self.config.personas.get(root_persona) if self.config is not None else None
        root_model = s.session_model_override or (root_config.model if root_config else "")
        root_model_config = self.config.models.get(root_model) if self.config is not None else None
        root_ctx_limit = (
            root_model_config.max_input_tokens
            if root_model_config and root_model_config.max_input_tokens
            else 128_000
        )
        root = AgentNode(
            id="orchestrator",
            name=root_persona,
            persona=root_persona,
            state=root_state,
            activity="Coordinating run"
            if root_state is AgentState.RUNNING
            else state.execution_status,
            model=root_model,
            reasoning=s.session_reasoning_override
            or str(getattr(root_config, "thinking", None) or "medium"),
            ctx_used=getattr(state, "root_context_tokens", 0) or 0,
            ctx_limit=root_ctx_limit,
            tools=list(root_config.tools) if root_config else [],
        )
```

- [ ] **Step 4: Run test, verify it passes**

Run: `cd apps/rotaris && uv run pytest tests/test_services.py::test_config_service_maps_persisted_session_to_store -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/rotaris/src/rotaris/services/config_service.py apps/rotaris/tests/test_services.py
git commit -m "fix(rotaris): root inspector reflects live context tokens and reasoning override"
```

---

## Task 3: `AgentNode.called_tools` — tools used at least once

**Files:**
- Modify: `apps/rotaris/src/rotaris/models/state.py:41` (add field next to `active_tools`)
- Modify: `apps/rotaris/src/rotaris/services/config_service.py:669-708` (`_agent_from_dict`)
- Modify: `apps/rotaris/tests/test_services.py` (extend `test_config_service_maps_persisted_session_to_store`)

**Interfaces:**
- Produces: `AgentNode.called_tools: list[str]`, consumed by Task 4's pill rendering.

- [ ] **Step 1: Write failing test**

Extend the same test from Task 2 with one more assertion (the fixture's `metrics.tool_calls = {"shell": 2}` already exists at line 32):

```python
    assert store.agents["coder-1"].called_tools == ["shell"]
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd apps/rotaris && uv run pytest tests/test_services.py::test_config_service_maps_persisted_session_to_store -v`
Expected: FAIL — `AgentNode` has no `called_tools` attribute.

- [ ] **Step 3: Add the field and populate it**

In `apps/rotaris/src/rotaris/models/state.py`, in `AgentNode` right after `active_tools: list[str] = field(default_factory=list)` (line 41):

```python
    called_tools: list[str] = field(default_factory=list)
```

In `apps/rotaris/src/rotaris/services/config_service.py`, in `_agent_from_dict` (~line 705), add the field to the returned `AgentNode`:

```python
        active_tools=list(raw.get("active_tools") or []),
        called_tools=sorted(metrics.tool_calls.keys()) if metrics else [],
```

- [ ] **Step 4: Run test, verify it passes**

Run: `cd apps/rotaris && uv run pytest tests/test_services.py::test_config_service_maps_persisted_session_to_store -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/rotaris/src/rotaris/models/state.py apps/rotaris/src/rotaris/services/config_service.py apps/rotaris/tests/test_services.py
git commit -m "feat(rotaris): track tools called at least once per agent"
```

---

## Task 4: Inspector tool pills — three-tier highlighting

**Files:**
- Modify: `apps/rotaris/src/rotaris/views/workspace.py:390-401` (inspector tools loop inside `_refresh_inspector`)
- Test: `apps/rotaris/tests/test_views.py`

**Interfaces:**
- Consumes: `AgentNode.called_tools` (Task 3), existing `AgentNode.active_tools`.

- [ ] **Step 1: Write failing test**

Add to `apps/rotaris/tests/test_views.py`:

```python
def test_inspector_tool_pills_have_three_tiers(qtbot) -> None:
    store = sample_store()
    store.agents["coding-agent-1"].tools = ["haet_edit", "shell", "grep"]
    store.agents["coding-agent-1"].active_tools = ["haet_edit"]
    store.agents["coding-agent-1"].called_tools = ["haet_edit", "shell"]
    store.selected_agent_id = "coding-agent-1"
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    view.show()

    chips = {
        view.tools_layout.itemAt(i).widget().text(): view.tools_layout.itemAt(i).widget()
        for i in range(view.tools_layout.count())
    }

    assert theme.ACCENT_800 in chips["haet_edit"].styleSheet()  # active
    assert theme.ACCENT_400 in chips["shell"].styleSheet()  # called, not active
    assert theme.NEUTRAL_700 in chips["grep"].styleSheet()  # never called
```

Add `from rotaris import theme` to the test file's imports if not already present.

- [ ] **Step 2: Run test, verify it fails**

Run: `cd apps/rotaris && uv run pytest tests/test_views.py::test_inspector_tool_pills_have_three_tiers -v`
Expected: FAIL — current code only has two tiers (`ACCENT_800`/`ACCENT_300` active vs `NEUTRAL_500`/`NEUTRAL_700` dim), `shell`'s chip won't contain `ACCENT_400`.

- [ ] **Step 3: Implement the three-tier styling**

In `apps/rotaris/src/rotaris/views/workspace.py`, replace the tools loop inside `_refresh_inspector` (~lines 390-401):

```python
        _clear(self.tools_layout)
        for tool in agent.tools:
            active = tool in agent.active_tools
            called = tool in agent.called_tools
            chip = QLabel(tool)
            chip.setWordWrap(True)
            if active:
                border, color = theme.ACCENT_800, theme.ACCENT_300
            elif called:
                border, color = theme.ACCENT_400, theme.TEXT
            else:
                border, color = theme.NEUTRAL_700, theme.NEUTRAL_500
            chip.setStyleSheet(
                f"border:1px solid {border};border-radius:4px;padding:2px 6px;"
                f"font-family:{theme.MONO_FAMILY};font-size:10px;color:{color};"
            )
            self.tools_layout.addWidget(chip)
```

Text is now plain `tool` (no manual padding spaces — `padding:2px 6px` in the stylesheet gives the pill its spacing instead), so `.text()` in tests matches the tool name exactly.

(Preserves the existing chip text/padding format — only the border/color selection changes from two branches to three.)

- [ ] **Step 4: Run test, verify it passes**

Run: `cd apps/rotaris && uv run pytest tests/test_views.py::test_inspector_tool_pills_have_three_tiers -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/rotaris/src/rotaris/views/workspace.py apps/rotaris/tests/test_views.py
git commit -m "feat(rotaris): highlight tools called at least once in inspector"
```

---

## Task 5: `TodoItem` data model + `WorkspaceStore` CRUD

**Files:**
- Modify: `apps/rotaris/src/rotaris/models/state.py` (add `TodoItem` dataclass)
- Modify: `apps/rotaris/src/rotaris/models/__init__.py` (export it)
- Modify: `apps/rotaris/src/rotaris/models/store.py:68` (retype `self.todos`), add `todos_changed` signal + CRUD methods, update `sample_store()` demo data (~line 625)
- Test: `apps/rotaris/tests/test_services.py`

**Interfaces:**
- Produces: `TodoItem(id, phase_id, status, text)`; `WorkspaceStore.todos: list[TodoItem]`; `WorkspaceStore.todos_changed: Signal`; `WorkspaceStore.rename_todo(task_id: str, text: str)`, `.remove_todo(task_id: str)`, `.add_todo(phase_id: str, text: str)`.

- [ ] **Step 1: Write failing test**

Add to `apps/rotaris/tests/test_services.py`:

```python
def test_workspace_store_todo_crud_mutates_and_emits() -> None:
    store = WorkspaceStore()
    store.todos = [TodoItem(id="1", phase_id="p1", status="open", text="write docs")]
    seen = []
    store.todos_changed.connect(lambda: seen.append(True))

    store.rename_todo("1", "write better docs")
    assert store.todos[0].text == "write better docs"

    store.add_todo("p1", "add tests")
    assert [t.text for t in store.todos] == ["write better docs", "add tests"]
    assert store.todos[1].phase_id == "p1"

    store.remove_todo("1")
    assert [t.id for t in store.todos] == [store.todos[0].id]
    assert len(seen) == 3
```

Add `TodoItem` to the `rotaris.models` import at the top of the test file.

- [ ] **Step 2: Run test, verify it fails**

Run: `cd apps/rotaris && uv run pytest tests/test_services.py::test_workspace_store_todo_crud_mutates_and_emits -v`
Expected: FAIL — `ImportError: cannot import name 'TodoItem'`.

- [ ] **Step 3: Add `TodoItem` and store CRUD**

In `apps/rotaris/src/rotaris/models/state.py`, add near `TranscriptEvent`:

```python
@dataclass
class TodoItem:
    """One row in the workspace sidebar todo list."""

    id: str
    phase_id: str
    status: str  # done | active | open
    text: str
```

In `apps/rotaris/src/rotaris/models/__init__.py`, add `TodoItem` to both the import block and `__all__`.

In `apps/rotaris/src/rotaris/models/store.py`:
- Add `from rotaris.models.state import (..., TodoItem, ...)` to the existing import block (alphabetical, matches existing style).
- Add `todos_changed = Signal()` next to the other `Signal()` class attributes (~line 43).
- Retype line 68: `self.todos: list[TodoItem] = []`.
- Add CRUD methods near `set_artifacts`/`artifact` (~line 193, same "artifacts" section pattern) as a new `# ── todos ──` section:

```python
    # ── todos ─────────────────────────────────────────────────────────────

    def rename_todo(self, task_id: str, text: str) -> None:
        for item in self.todos:
            if item.id == task_id:
                item.text = text
                break
        self.todos_changed.emit()

    def remove_todo(self, task_id: str) -> None:
        self.todos = [item for item in self.todos if item.id != task_id]
        self.todos_changed.emit()

    def add_todo(self, phase_id: str, text: str) -> None:
        import uuid

        # Temporary id — the next poll tick replaces this with the real
        # backend-assigned id once the edit round-trips through the session.
        local_id = f"local-{uuid.uuid4().hex[:8]}"
        self.todos.append(TodoItem(id=local_id, phase_id=phase_id, status="open", text=text))
        self.todos_changed.emit()
```

Update `sample_store()`'s demo data (~line 625):

```python
    s.todos = [
        TodoItem(id="t1", phase_id="main", status="done", text="Map handler call graph"),
        TodoItem(id="t2", phase_id="main", status="done", text="Design async interface"),
        TodoItem(id="t3", phase_id="main", status="active", text="Convert session handlers"),
        TodoItem(id="t4", phase_id="main", status="open", text="Update tests + docs"),
    ]
```

- [ ] **Step 4: Run test, verify it passes**

Run: `cd apps/rotaris && uv run pytest tests/test_services.py::test_workspace_store_todo_crud_mutates_and_emits -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/rotaris/src/rotaris/models/
git commit -m "feat(rotaris): TodoItem model and WorkspaceStore todo CRUD"
```

---

## Task 6: `_todos_from_state` — preserve ids and phase grouping

**Files:**
- Modify: `apps/rotaris/src/rotaris/services/config_service.py:745-752` (`_todos_from_state`), `:501` (`apply_session` call site + emit `todos_changed`)
- Modify: `apps/rotaris/tests/test_services.py` (fix `test_config_service_maps_persisted_session_to_store` assertion)
- Modify: `apps/rotaris/tests/test_run_wiring_e2e.py` (fix `test_agent_todo_state_takes_priority_over_run_todo` assertion)

**Interfaces:**
- Produces: `_todos_from_state(raw) -> list[TodoItem]` (was `list[tuple[str, str]]`).

- [ ] **Step 1: Write failing test**

Add to `apps/rotaris/tests/test_services.py`:

```python
def test_todos_from_state_preserves_ids_and_phase_grouping() -> None:
    from rotaris.services.config_service import _todos_from_state

    raw = {
        "phases": [
            {
                "id": "phase-1",
                "tasks": [
                    {"id": "a", "name": "map handlers", "status": "COMPLETED"},
                    {"id": "b", "name": "convert session", "status": "IN_PROGRESS"},
                ],
            }
        ]
    }

    todos = _todos_from_state(raw)

    assert todos == [
        TodoItem(id="a", phase_id="phase-1", status="done", text="map handlers"),
        TodoItem(id="b", phase_id="phase-1", status="active", text="convert session"),
    ]
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd apps/rotaris && uv run pytest tests/test_services.py::test_todos_from_state_preserves_ids_and_phase_grouping -v`
Expected: FAIL — `_todos_from_state` still returns `(status, text)` tuples with no id/phase_id.

- [ ] **Step 3: Rewrite `_todos_from_state`**

In `apps/rotaris/src/rotaris/services/config_service.py`, replace the function (~lines 745-752):

```python
def _todos_from_state(raw: dict[str, Any] | None) -> list[TodoItem]:
    todos: list[TodoItem] = []
    for phase in (raw or {}).get("phases", []):
        phase_id = str(phase.get("id") or "")
        for task in phase.get("tasks", []):
            status = str(task.get("status", "PENDING")).upper()
            ui_status = {"COMPLETED": "done", "IN_PROGRESS": "active"}.get(status, "open")
            todos.append(
                TodoItem(
                    id=str(task.get("id") or ""),
                    phase_id=phase_id,
                    status=ui_status,
                    text=str(task.get("name") or "task"),
                )
            )
    return todos
```

Add `TodoItem` to the `rotaris.models.state` import block at the top of `config_service.py`.

In `apply_session` (~line 501), emit the new signal after setting `s.todos`:

```python
        s.todos = _todos_from_state(getattr(state, "agent_todo_state", None) or state.todo_state)
        s.todos_changed.emit()
```

- [ ] **Step 4: Run test, verify it passes, then fix the two now-broken assertions**

Run: `cd apps/rotaris && uv run pytest tests/test_services.py::test_todos_from_state_preserves_ids_and_phase_grouping -v`
Expected: PASS

Now fix the two pre-existing tests whose assertions used the old tuple format:

In `apps/rotaris/tests/test_services.py`, `test_config_service_maps_persisted_session_to_store` — the fixture's `todo_state` has no `"id"` on its phase, so `phase_id` comes out `""`:

```python
    assert store.todos == [TodoItem(id="1", phase_id="", status="active", text="Implement view")]
```

In `apps/rotaris/tests/test_run_wiring_e2e.py`, `test_agent_todo_state_takes_priority_over_run_todo` — same fix, its fixture phase also has no `"id"`:

```python
    assert store.todos == [
        TodoItem(id="a", phase_id="", status="done", text="map handlers"),
        TodoItem(id="b", phase_id="", status="active", text="convert session"),
    ]
```

Add `TodoItem` to `rotaris.models`/`rotaris.models.store` imports in both test files as needed.

Run: `cd apps/rotaris && uv run pytest tests/test_services.py tests/test_run_wiring_e2e.py -v`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add apps/rotaris/src/rotaris/services/config_service.py apps/rotaris/tests/test_services.py apps/rotaris/tests/test_run_wiring_e2e.py
git commit -m "refactor(rotaris): _todos_from_state preserves task/phase ids"
```

---

## Task 7: Live todo mutation — `_SessionObserver.edit_todo`

**Files:**
- Modify: `apps/rotaris/src/rotaris/services/run_bridge.py` (`_SessionObserver.__init__`, `_apply`, new `edit_todo`/`_edit_todo`)
- Test: `apps/rotaris/tests/test_run_wiring_e2e.py` (uses `_Harness`)

**Interfaces:**
- Produces: `_SessionObserver.edit_todo(op: str, target_id: str, text: str = "") -> None` — dispatches onto the observer's asyncio loop and mutates the live `TodoList` the running `RalphLoop` reads.

- [ ] **Step 1: Write failing test**

Add to `apps/rotaris/tests/test_run_wiring_e2e.py`:

```python
def test_edit_todo_mutates_live_todo_and_persisted_mirror(tmp_path) -> None:
    from rotaris_core.tools.todo_state import TodoList, TodoPhase, TodoTask

    h = _Harness(tmp_path)
    try:
        live_todo = TodoList(
            phases=[
                TodoPhase(
                    id="phase-1",
                    name="main",
                    tasks=[TodoTask(id="t1", name="write docs", status="PENDING")],
                )
            ]
        )
        manager = SimpleNamespace(snapshot_children=lambda: [])
        h.observer.on_child_created(h.record, manager, live_todo)

        h.observer.edit_todo("rename", "t1", "write better docs")
        h.observer.edit_todo("add", "phase-1", "add tests")
        h.drain()

        assert live_todo.get_task_by_id("t1").name == "write better docs"
        assert [t.name for t in live_todo.phases[0].tasks] == ["write better docs", "add tests"]
        assert h.state.todo_state["phases"][0]["tasks"][0]["name"] == "write better docs"

        added_id = live_todo.phases[0].tasks[1].id
        h.observer.edit_todo("remove", added_id, "")
        h.drain()
        assert [t.name for t in live_todo.phases[0].tasks] == ["write better docs"]
    finally:
        h.close()
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd apps/rotaris && uv run pytest tests/test_run_wiring_e2e.py::test_edit_todo_mutates_live_todo_and_persisted_mirror -v`
Expected: FAIL — `AttributeError: '_SessionObserver' object has no attribute 'edit_todo'`.

- [ ] **Step 3: Implement `edit_todo`**

In `apps/rotaris/src/rotaris/services/run_bridge.py`, `_SessionObserver.__init__` — add next to `self._child_managers` (~line 313):

```python
        self._live_todo: Any | None = None
```

Update `_apply` (~line 643) to cache the live todo whenever one is passed:

```python
    def _apply(self, records: list[Any], todo: Any | None) -> None:
        existing = {
            str(item.get("canonical_name") or item.get("name")): item
            for item in self.state.child_states
        }
        for record in records:
            payload = record.model_dump(mode="json")
            name = str(payload.get("canonical_name") or payload.get("name"))
            if str(payload.get("state", "")).lower() in self._TERMINAL_CHILD_STATES:
                self._active_tool_calls.pop(name, None)
            payload["active_tools"] = self._active_tool_names(name)
            existing[name] = payload
        self.state.child_states = list(existing.values())
        if todo is not None:
            self._live_todo = todo
            self.state.todo_state = todo.model_dump(mode="json")
        self.manager.persister.request_save(self.state)
```

Add new methods next to `on_last_prompt_tokens`:

```python
    def edit_todo(self, op: str, target_id: str, text: str = "") -> None:
        """Add/rename/remove a task on the live scheduling todo list.

        Dispatched onto the loop thread; mutates the exact `TodoList`
        instance `RalphLoop._run_main_loop` reads, so the change takes
        effect at the next iteration boundary. No-op if no run has ever
        reported a todo yet, or the target id/phase no longer exists —
        the user's edit simply has nothing left to apply to.
        """
        self.loop.call_soon_threadsafe(self._edit_todo, op, target_id, text)

    def _edit_todo(self, op: str, target_id: str, text: str) -> None:
        todo = self._live_todo
        if todo is None:
            return
        if op == "add":
            phase = todo.get_phase_by_id(target_id)
            if phase is not None:
                from rotaris_core.tools.todo_state import TodoTask

                phase.tasks.append(TodoTask(name=text))
        elif op == "rename":
            task = todo.get_task_by_id(target_id)
            if task is not None:
                task.name = text
        elif op == "remove":
            for phase in todo.phases:
                phase.tasks = [t for t in phase.tasks if t.id != target_id]
        self.state.todo_state = todo.model_dump(mode="json")
        self.manager.persister.request_save(self.state)
```

- [ ] **Step 4: Run test, verify it passes**

Run: `cd apps/rotaris && uv run pytest tests/test_run_wiring_e2e.py::test_edit_todo_mutates_live_todo_and_persisted_mirror -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/rotaris/src/rotaris/services/run_bridge.py apps/rotaris/tests/test_run_wiring_e2e.py
git commit -m "feat(rotaris): live todo add/rename/remove on the running session"
```

---

## Task 8: `RunBridge.edit_todo` — bridge wiring for the running case

**Files:**
- Modify: `apps/rotaris/src/rotaris/services/run_bridge.py` (`RunBridge.edit_todo`, `_RunWorker.edit_todo`)
- Test: `apps/rotaris/tests/test_services.py`

**Interfaces:**
- Consumes: `_SessionObserver.edit_todo` (Task 7).
- Produces: `RunBridge.edit_todo(op: str, target_id: str, text: str = "") -> bool` — `True` if dispatched to a live run, `False` if no run is active (caller falls back to Task 9's idle path).

- [ ] **Step 1: Write failing test**

Add to `apps/rotaris/tests/test_services.py`:

```python
def test_run_bridge_edit_todo_forwards_to_worker_when_running() -> None:
    from rotaris.services.run_bridge import RunBridge

    bridge = RunBridge.__new__(RunBridge)
    bridge._run_active = True
    calls = []
    bridge._worker = SimpleNamespace(
        edit_todo=lambda op, target_id, text: calls.append((op, target_id, text)) or True
    )

    assert bridge.edit_todo("rename", "t1", "new text") is True
    assert calls == [("rename", "t1", "new text")]


def test_run_bridge_edit_todo_returns_false_when_idle() -> None:
    from rotaris.services.run_bridge import RunBridge

    bridge = RunBridge.__new__(RunBridge)
    bridge._run_active = False
    bridge._worker = None

    assert bridge.edit_todo("rename", "t1", "new text") is False
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd apps/rotaris && uv run pytest tests/test_services.py::test_run_bridge_edit_todo_forwards_to_worker_when_running tests/test_services.py::test_run_bridge_edit_todo_returns_false_when_idle -v`
Expected: FAIL — `RunBridge` has no `edit_todo` attribute.

- [ ] **Step 3: Implement bridge + worker methods**

In `apps/rotaris/src/rotaris/services/run_bridge.py`, `RunBridge` — add next to `switch_entry_model` (~line 105):

```python
    def edit_todo(self, op: str, target_id: str, text: str = "") -> bool:
        """Add/rename/remove a todo task on the live run, if one is active."""
        if not self.running or self._worker is None:
            return False
        return self._worker.edit_todo(op, target_id, text)
```

In `_RunWorker` — add next to `switch_entry_model` (~line 287):

```python
    def edit_todo(self, op: str, target_id: str, text: str) -> bool:
        if self._observer is None:
            return False
        self._observer.edit_todo(op, target_id, text)
        return True
```

- [ ] **Step 4: Run test, verify it passes**

Run: `cd apps/rotaris && uv run pytest tests/test_services.py::test_run_bridge_edit_todo_forwards_to_worker_when_running tests/test_services.py::test_run_bridge_edit_todo_returns_false_when_idle -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/rotaris/src/rotaris/services/run_bridge.py apps/rotaris/tests/test_services.py
git commit -m "feat(rotaris): RunBridge.edit_todo forwards edits to the live run"
```

---

## Task 9: `ConfigService.edit_todo_persisted` — idle/paused session path

**Files:**
- Modify: `apps/rotaris/src/rotaris/services/config_service.py` (new method)
- Modify: `apps/rotaris/src/rotaris/services/run_bridge.py` (`RunBridge.edit_todo` falls back to it)
- Test: `apps/rotaris/tests/test_services.py`

**Interfaces:**
- Produces: `ConfigService.edit_todo_persisted(op: str, target_id: str, text: str = "") -> bool`.
- `RunBridge.edit_todo` now takes `config_service` into account for the no-active-run branch.

- [ ] **Step 1: Write failing test**

Add to `apps/rotaris/tests/test_services.py`:

```python
def test_edit_todo_persisted_mutates_idle_session_on_disk(tmp_path) -> None:
    from rotaris_core.config.schema import RotarisConfig, ModelConfig, PersonaConfig
    from rotaris_core.session.manager import SessionManager

    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)
    # apply_session (called at the end of edit_todo_persisted) null-guards
    # every self.config access, so a real config isn't required for the
    # assertions below — but create_session needs a real RotarisConfig to
    # snapshot (it calls config.model_dump(mode="json")).
    config = RotarisConfig(
        default_persona="orchestrator",
        large_model="test/model",
        models={"test/model": ModelConfig(provider="test", model_id="m", max_input_tokens=100_000)},
        personas={
            "orchestrator": PersonaConfig(
                name="orchestrator", model="test/model", thinking="high", tools=["delegate"]
            )
        },
    )
    service.session_manager = SessionManager(tmp_path)
    state = service.session_manager.create_session(config)
    state.todo_state = {
        "phases": [{"id": "phase-1", "tasks": [{"id": "t1", "name": "write docs", "status": "PENDING"}]}]
    }
    service.session_manager.persister.flush_sync(state)
    store.session_name = state.session_id

    assert service.edit_todo_persisted("rename", "t1", "write better docs") is True

    reloaded = service.session_manager.load_session(state.session_id)
    assert reloaded.todo_state["phases"][0]["tasks"][0]["name"] == "write better docs"
    assert store.todos[0].text == "write better docs"
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd apps/rotaris && uv run pytest tests/test_services.py::test_edit_todo_persisted_mutates_idle_session_on_disk -v`
Expected: FAIL — `ConfigService` has no `edit_todo_persisted` attribute.

- [ ] **Step 3: Implement it**

In `apps/rotaris/src/rotaris/services/config_service.py`, add near `apply_session`:

```python
    def edit_todo_persisted(self, op: str, target_id: str, text: str = "") -> bool:
        """Add/rename/remove a todo task when no run is currently active.

        Mutates whichever field the sidebar is currently reading from
        (``agent_todo_state`` if present, else ``todo_state``) and flushes
        synchronously so the change survives immediately, matching the
        session persister's rule that non-running status transitions must
        be durable right away.
        """
        if self.session_manager is None or not self.store.session_name:
            return False
        from rotaris_core.tools.todo_state import TodoList, TodoTask

        state = self.session_manager.load_session(self.store.session_name)
        use_agent_state = state.agent_todo_state is not None
        raw = state.agent_todo_state if use_agent_state else state.todo_state
        if raw is None:
            return False
        todo = TodoList.model_validate(raw)
        if op == "add":
            phase = todo.get_phase_by_id(target_id)
            if phase is None:
                return False
            phase.tasks.append(TodoTask(name=text))
        elif op == "rename":
            task = todo.get_task_by_id(target_id)
            if task is None:
                return False
            task.name = text
        elif op == "remove":
            for phase in todo.phases:
                phase.tasks = [t for t in phase.tasks if t.id != target_id]
        else:
            return False
        dumped = todo.model_dump(mode="json")
        if use_agent_state:
            state.agent_todo_state = dumped
        else:
            state.todo_state = dumped
        self.session_manager.persister.flush_sync(state)
        self.apply_session(state)
        return True
```

In `apps/rotaris/src/rotaris/services/run_bridge.py`, update `RunBridge.edit_todo` to fall back:

```python
    def edit_todo(self, op: str, target_id: str, text: str = "") -> bool:
        """Add/rename/remove a todo task, live if a run is active, on disk otherwise."""
        if self.running and self._worker is not None:
            return self._worker.edit_todo(op, target_id, text)
        return self.config_service.edit_todo_persisted(op, target_id, text)
```

- [ ] **Step 4: Run test, verify it passes**

Run: `cd apps/rotaris && uv run pytest tests/test_services.py::test_edit_todo_persisted_mutates_idle_session_on_disk tests/test_services.py::test_run_bridge_edit_todo_returns_false_when_idle -v`
Expected: PASS. Note: `test_run_bridge_edit_todo_returns_false_when_idle` (Task 8) now needs a `bridge.config_service` stub — update it:

```python
def test_run_bridge_edit_todo_falls_back_to_persisted_when_idle() -> None:
    from rotaris.services.run_bridge import RunBridge

    bridge = RunBridge.__new__(RunBridge)
    bridge._run_active = False
    bridge._worker = None
    calls = []
    bridge.config_service = SimpleNamespace(
        edit_todo_persisted=lambda op, target_id, text: calls.append((op, target_id, text)) or True
    )

    assert bridge.edit_todo("rename", "t1", "new text") is True
    assert calls == [("rename", "t1", "new text")]
```

(Replace the old `test_run_bridge_edit_todo_returns_false_when_idle` with this — the idle behavior changed from "return False" to "fall back to disk".)

Run: `cd apps/rotaris && uv run pytest tests/test_services.py -v`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add apps/rotaris/src/rotaris/services/config_service.py apps/rotaris/src/rotaris/services/run_bridge.py apps/rotaris/tests/test_services.py
git commit -m "feat(rotaris): edit todos on idle/paused sessions via persisted state"
```

---

## Task 10: `TodoRow` / `TodoAddRow` widgets

**Files:**
- Create: `apps/rotaris/src/rotaris/widgets/todo_row.py`
- Modify: `apps/rotaris/src/rotaris/widgets/__init__.py` (export both)
- Test: `apps/rotaris/tests/test_views.py`

**Interfaces:**
- Produces: `TodoRow(task_id: str, status: str, text: str)` with signals `renamed = Signal(str, str)`, `removed = Signal(str)`.
- Produces: `TodoAddRow(phase_id: str)` with signal `added = Signal(str, str)`.

- [ ] **Step 1: Write failing test**

Add to `apps/rotaris/tests/test_views.py`:

```python
def test_todo_row_rename_and_remove(qtbot) -> None:
    from rotaris.widgets.todo_row import TodoRow

    row = TodoRow("t1", "open", "write docs")
    qtbot.addWidget(row)
    renamed = []
    removed = []
    row.renamed.connect(lambda tid, text: renamed.append((tid, text)))
    row.removed.connect(removed.append)

    row._start_rename(None)
    row._edit.setText("write better docs")
    row._finish_rename()
    assert renamed == [("t1", "write better docs")]

    row._remove_button.click()
    assert removed == ["t1"]


def test_todo_add_row_emits_added(qtbot) -> None:
    from rotaris.widgets.todo_row import TodoAddRow

    row = TodoAddRow("phase-1")
    qtbot.addWidget(row)
    added = []
    row.added.connect(lambda phase_id, text: added.append((phase_id, text)))

    row._start_add()
    row._edit.setText("add tests")
    row._finish_add()
    assert added == [("phase-1", "add tests")]
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd apps/rotaris && uv run pytest tests/test_views.py::test_todo_row_rename_and_remove tests/test_views.py::test_todo_add_row_emits_added -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'rotaris.widgets.todo_row'`.

- [ ] **Step 3: Implement the widgets**

Create `apps/rotaris/src/rotaris/widgets/todo_row.py`:

```python
"""Editable todo row widgets: click-to-rename, hover-to-remove, add-in-phase."""

from __future__ import annotations

from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QMouseEvent
from PySide6.QtWidgets import QHBoxLayout, QLabel, QLineEdit, QPushButton, QWidget

from rotaris import theme

_STATUS_GLYPH = {"done": "✓", "active": "▸", "open": "○"}
_STATUS_COLOR = {"done": theme.RUN, "active": theme.WAIT, "open": theme.NEUTRAL_700}


class TodoRow(QWidget):
    """One todo task: click text to rename in place, hover for a remove button."""

    renamed = Signal(str, str)  # task_id, new text
    removed = Signal(str)  # task_id

    def __init__(
        self, task_id: str, status: str, text: str, parent: QWidget | None = None
    ) -> None:
        super().__init__(parent)
        self._task_id = task_id
        self.setMouseTracking(True)

        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 1, 0, 1)
        layout.setSpacing(6)

        glyph = QLabel(_STATUS_GLYPH.get(status, "○"))
        glyph.setStyleSheet(f"color:{_STATUS_COLOR.get(status, theme.NEUTRAL_700)};font-size:11px;")
        layout.addWidget(glyph)

        strike = "text-decoration:line-through;" if status == "done" else ""
        self._label = QLabel(text)
        self._label.setStyleSheet(f"font-size:11px;color:{theme.NEUTRAL_400};{strike}")
        self._label.setCursor(Qt.CursorShape.IBeamCursor)
        layout.addWidget(self._label, 1)

        self._edit = QLineEdit(text)
        self._edit.setStyleSheet("font-size:11px;")
        self._edit.hide()
        self._edit.editingFinished.connect(self._finish_rename)
        layout.addWidget(self._edit, 1)

        self._remove_button = QPushButton("✕")
        self._remove_button.setFixedWidth(16)
        self._remove_button.setStyleSheet(
            f"QPushButton{{border:none;color:{theme.NEUTRAL_600};background:transparent;}}"
            f"QPushButton:hover{{color:{theme.ACCENT_400};}}"
        )
        self._remove_button.setCursor(Qt.CursorShape.PointingHandCursor)
        self._remove_button.clicked.connect(lambda: self.removed.emit(self._task_id))
        self._remove_button.hide()
        layout.addWidget(self._remove_button)

    def mousePressEvent(self, event: QMouseEvent) -> None:  # noqa: N802
        if self._label.geometry().contains(event.pos()):
            self._start_rename(event)
        super().mousePressEvent(event)

    def enterEvent(self, event: object) -> None:  # noqa: N802
        self._remove_button.show()
        super().enterEvent(event)

    def leaveEvent(self, event: object) -> None:  # noqa: N802
        self._remove_button.hide()
        super().leaveEvent(event)

    def _start_rename(self, _event: object) -> None:
        self._label.hide()
        self._edit.setText(self._label.text())
        self._edit.show()
        self._edit.setFocus()
        self._edit.selectAll()

    def _finish_rename(self) -> None:
        text = self._edit.text().strip()
        self._edit.hide()
        self._label.show()
        if text and text != self._label.text():
            self._label.setText(text)
            self.renamed.emit(self._task_id, text)


class TodoAddRow(QWidget):
    """'+ add task' affordance for one phase; expands to a text entry on click."""

    added = Signal(str, str)  # phase_id, text

    def __init__(self, phase_id: str, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._phase_id = phase_id

        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 1, 0, 1)

        self._button = QPushButton("+ add task")
        self._button.setStyleSheet(
            f"QPushButton{{border:none;color:{theme.NEUTRAL_600};background:transparent;"
            "font-size:10px;text-align:left;padding:0;}"
            f"QPushButton:hover{{color:{theme.ACCENT_400};}}"
        )
        self._button.setCursor(Qt.CursorShape.PointingHandCursor)
        self._button.clicked.connect(self._start_add)
        layout.addWidget(self._button)

        self._edit = QLineEdit()
        self._edit.setPlaceholderText("task name…")
        self._edit.setStyleSheet("font-size:11px;")
        self._edit.hide()
        self._edit.returnPressed.connect(self._finish_add)
        layout.addWidget(self._edit, 1)

    def _start_add(self) -> None:
        self._button.hide()
        self._edit.show()
        self._edit.setFocus()

    def _finish_add(self) -> None:
        text = self._edit.text().strip()
        self._edit.clear()
        self._edit.hide()
        self._button.show()
        if text:
            self.added.emit(self._phase_id, text)
```

Update `apps/rotaris/src/rotaris/widgets/__init__.py` to export `TodoRow` and `TodoAddRow` alongside the existing widget exports (follow the file's existing import/`__all__` pattern).

- [ ] **Step 4: Run test, verify it passes**

Run: `cd apps/rotaris && uv run pytest tests/test_views.py::test_todo_row_rename_and_remove tests/test_views.py::test_todo_add_row_emits_added -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/rotaris/src/rotaris/widgets/
git commit -m "feat(rotaris): TodoRow and TodoAddRow inline-edit widgets"
```

---

## Task 11: Wire the sidebar todo list to the new widgets

**Files:**
- Modify: `apps/rotaris/src/rotaris/views/workspace.py` (new signals, split `_refresh_todos` out of `_refresh_sidebar`, phase-grouped rendering)
- Test: `apps/rotaris/tests/test_views.py`

**Interfaces:**
- Produces: `WorkspaceView.todo_renamed = Signal(str, str)`, `.todo_removed = Signal(str)`, `.todo_added = Signal(str, str)` — consumed by Task 12's `main_window.py` wiring.
- Consumes: `WorkspaceStore.todos_changed` (Task 5), `TodoRow`/`TodoAddRow` (Task 10).

- [ ] **Step 1: Write failing test**

Add to `apps/rotaris/tests/test_views.py`:

```python
def test_workspace_todo_edits_update_store_and_emit_signals(qtbot) -> None:
    store = sample_store()
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    view.show()

    renamed = []
    removed = []
    added = []
    view.todo_renamed.connect(lambda tid, text: renamed.append((tid, text)))
    view.todo_removed.connect(removed.append)
    view.todo_added.connect(lambda phase_id, text: added.append((phase_id, text)))

    first_row = view.todo_rows.itemAt(0).widget()
    first_row._start_rename(None)
    first_row._edit.setText("renamed task")
    first_row._finish_rename()

    assert renamed == [(store.todos[0].id, "renamed task")]
    assert store.todos[0].text == "renamed task"

    task_id = store.todos[1].id
    second_row = view.todo_rows.itemAt(1).widget()
    second_row._remove_button.click()

    assert removed == [task_id]
    assert task_id not in [t.id for t in store.todos]
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd apps/rotaris && uv run pytest tests/test_views.py::test_workspace_todo_edits_update_store_and_emit_signals -v`
Expected: FAIL — `WorkspaceView` has no `todo_renamed` signal, and `todo_rows` still holds plain `QLabel`s from `_todo_row`.

- [ ] **Step 3: Implement**

In `apps/rotaris/src/rotaris/views/workspace.py`:

Add three new signals next to the existing ones (~line 47-49):

```python
    todo_renamed = Signal(str, str)  # task_id, text
    todo_removed = Signal(str)  # task_id
    todo_added = Signal(str, str)  # phase_id, text
```

Add the import for the new widgets to the existing `from rotaris.widgets import (...)` block:

```python
from rotaris.widgets import (
    AgentTreeList,
    ContextRing,
    SectionLabel,
    SegmentedControl,
    StatusDot,
    TodoAddRow,
    TodoRow,
    artifact_link,
    make_button,
)
```

Connect the new store signal in `__init__` (next to the other `store.*_changed.connect(...)` lines, ~line 66):

```python
        store.todos_changed.connect(self._refresh_todos)
```

And call it once at init alongside the others:

```python
        self._refresh_todos()
```

Remove the todo-rendering lines from `_refresh_sidebar` (the `done = sum(...)`, `self.todos_label.setText(...)`, `_clear(self.todo_rows)`, and the `for status, text in s.todos:` loop) and replace with a new method:

```python
    def _refresh_todos(self) -> None:
        s = self._store
        done = sum(1 for item in s.todos if item.status == "done")
        self.todos_label.setText(f"TODOS  {done}/{len(s.todos)}")
        _clear(self.todo_rows)
        order: list[str] = []
        by_phase: dict[str, list] = {}
        for item in s.todos:
            if item.phase_id not in by_phase:
                by_phase[item.phase_id] = []
                order.append(item.phase_id)
            by_phase[item.phase_id].append(item)
        for phase_id in order:
            for item in by_phase[phase_id]:
                row = TodoRow(item.id, item.status, item.text)
                row.renamed.connect(self._on_todo_renamed)
                row.removed.connect(self._on_todo_removed)
                self.todo_rows.addWidget(row)
            add_row = TodoAddRow(phase_id)
            add_row.added.connect(self._on_todo_added)
            self.todo_rows.addWidget(add_row)

    def _on_todo_renamed(self, task_id: str, text: str) -> None:
        self._store.rename_todo(task_id, text)
        self.todo_renamed.emit(task_id, text)

    def _on_todo_removed(self, task_id: str) -> None:
        self._store.remove_todo(task_id)
        self.todo_removed.emit(task_id)

    def _on_todo_added(self, phase_id: str, text: str) -> None:
        self._store.add_todo(phase_id, text)
        self.todo_added.emit(phase_id, text)
```

Delete the now-unused `_todo_row` module-level function (superseded by `TodoRow`).

- [ ] **Step 4: Run test, verify it passes, then run the full view suite**

Run: `cd apps/rotaris && uv run pytest tests/test_views.py -v`
Expected: ALL PASS (including Task 4's pill test and the pre-existing sidebar/transcript tests, which don't touch todos and should be unaffected).

- [ ] **Step 5: Commit**

```bash
git add apps/rotaris/src/rotaris/views/workspace.py apps/rotaris/tests/test_views.py
git commit -m "feat(rotaris): editable, phase-grouped todo sidebar"
```

---

## Task 12: Wire `main_window.py`, bump version

**Files:**
- Modify: `apps/rotaris/src/rotaris/views/main_window.py` (connect the three new `WorkspaceView` signals)
- Modify: `apps/rotaris/pyproject.toml` (version bump)
- Test: `apps/rotaris/tests/test_main_window.py`

**Interfaces:**
- Consumes: `WorkspaceView.todo_renamed/.todo_removed/.todo_added` (Task 11), `RunBridge.edit_todo` (Tasks 8-9).

- [ ] **Step 1: Write failing test**

`apps/rotaris/tests/test_main_window.py` already has a `FakeRunBridge(QObject)` fixture class (top of file) used via `MainWindow(store, run_bridge=bridge)` — e.g. `test_workspace_prompt_starts_run_and_appends_transcript`. Extend `FakeRunBridge` with an `edit_todo` recorder and add a new test in the same style:

In `FakeRunBridge.__init__`, add next to `self.cancelled: list[str] = []`:

```python
        self.todo_edits: list[tuple[str, str, str]] = []
```

Add a method next to `cancel_agent`:

```python
    def edit_todo(self, op: str, target_id: str, text: str = "") -> bool:
        self.todo_edits.append((op, target_id, text))
        return True
```

Add the test at the end of the file:

```python
def test_workspace_todo_signals_forward_to_run_bridge(qtbot) -> None:
    bridge = FakeRunBridge()
    store = sample_store()
    window = MainWindow(store, run_bridge=bridge)
    qtbot.addWidget(window)
    window.show_view("workspace")

    window.workspace.todo_renamed.emit("t1", "new text")
    window.workspace.todo_removed.emit("t2")
    window.workspace.todo_added.emit("phase-1", "new task")

    assert bridge.todo_edits == [
        ("rename", "t1", "new text"),
        ("remove", "t2", ""),
        ("add", "phase-1", "new task"),
    ]
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd apps/rotaris && uv run pytest tests/test_main_window.py::test_workspace_todo_signals_forward_to_run_bridge -v`
Expected: FAIL — signals not connected yet, `calls` stays empty.

- [ ] **Step 3: Wire the signals**

In `apps/rotaris/src/rotaris/views/main_window.py`, next to the existing `self.workspace.*.connect(...)` lines (~line 124-128):

```python
        self.workspace.todo_renamed.connect(self._rename_todo)
        self.workspace.todo_removed.connect(self._remove_todo)
        self.workspace.todo_added.connect(self._add_todo)
```

Add handler methods next to `_cancel_agent` (~line 287):

```python
    def _rename_todo(self, task_id: str, text: str) -> None:
        if self.run_bridge is not None:
            self.run_bridge.edit_todo("rename", task_id, text)

    def _remove_todo(self, task_id: str) -> None:
        if self.run_bridge is not None:
            self.run_bridge.edit_todo("remove", task_id)

    def _add_todo(self, phase_id: str, text: str) -> None:
        if self.run_bridge is not None:
            self.run_bridge.edit_todo("add", phase_id, text)
```

Bump `apps/rotaris/pyproject.toml`: `version = "0.1.8"` → `version = "0.1.9"`.

- [ ] **Step 4: Run test, verify it passes, then run the full rotaris suite**

Run: `cd apps/rotaris && uv run pytest tests/test_main_window.py::test_workspace_todo_signals_forward_to_run_bridge -v`
Expected: PASS

Run: `cd apps/rotaris && uv run pytest -x -q`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add apps/rotaris/src/rotaris/views/main_window.py apps/rotaris/pyproject.toml apps/rotaris/tests/test_main_window.py
git commit -m "feat(rotaris): wire editable todo signals into main window; bump version"
```

---

## Manual verification (after all tasks)

Run `uv run python -m rotaris --demo`, open the workspace view, and check:
1. Sidebar todos: click a task's text → inline edit → Enter/blur commits rename. Hover a task → ✕ appears → click removes it. Click "+ add task" under a phase → type → Enter adds it.
2. Inspector tool pills for `coding-agent-1` (has real tool-call history in demo data): three visually distinct tiers.
3. Select the `orchestrator` node in the agent tree → context ring is non-zero (demo data already sets `ctx_used=96_412` for it in `sample_store()` — confirms the ring itself renders correctly; the 0%-bug fix is exercised by Task 2's test against a real backend snapshot, not the static demo fixture).
4. Change the reasoning chip in the composer, send a prompt against a real (non-demo) workspace, and confirm the orchestrator's inspector reasoning control reflects the override once the run starts.
