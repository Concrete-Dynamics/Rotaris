# Rotaris workspace: editable todos, tool-call highlighting, inspector staleness fixes

Date: 2026-07-13

## Context

Four related gaps in the Rotaris desktop workspace view (`apps/rotaris/src/rotaris/views/workspace.py`
and its backing `WorkspaceStore` / `RunBridge`):

1. The sidebar todo list is read-only.
2. Inspector tool pills only distinguish "currently in-flight" vs "everything else" — there's no
   way to see which tools an agent has used at least once over its lifetime.
3. The inspector's context ring shows 0% for the root/orchestrator agent, always.
4. Changing reasoning strength in the composer before sending a prompt doesn't show up on the
   resulting orchestrator agent in the inspector.

## REQ1 — Editable todo list

### Data model

Replace `WorkspaceStore.todos: list[tuple[str, str]]` with a small dataclass carrying enough
identity to target an edit:

```python
@dataclass
class TodoItem:
    id: str
    phase_id: str
    status: str  # done | active | open
    text: str
```

`_todos_from_state` (config_service.py) currently discards `task.id` / phase grouping when
flattening backend `TodoList` → UI tuples. It needs to preserve both, and the sidebar needs a
phase header so "+ add task" has a phase to target (interaction style: click text to rename
in-place, hover row for a small ✕ to remove, one "+ add" row per phase footer).

### Store API

```python
WorkspaceStore.rename_todo(task_id: str, text: str) -> None
WorkspaceStore.remove_todo(task_id: str) -> None
WorkspaceStore.add_todo(phase_id: str, text: str) -> None
```

Each does an optimistic local mutation of `self.todos` + emits a change signal, then the
`WorkspaceView` forwards the same op to the backend via new signals (`todo_renamed`,
`todo_removed`, `todo_added`) that the app wires to `RunBridge`.

### Backend write-through

This is the one genuinely new piece of plumbing. Today, todo state only flows one direction:
`RalphLoop` → `on_todo_state(todo)` observer hook → `_apply_todo` → persisted mirror
(`state.agent_todo_state`) → UI. There's no path back into the live `TodoList` object the running
loop reads.

Add `RunBridge.edit_todo(op: Literal["add", "remove", "rename"], target_id: str, text: str = "")`.
It dispatches via `self.loop.call_soon_threadsafe(...)` (same mechanism already used for
`_set_todo_task`) onto a new `_SessionObserver` method that mutates the live `TodoList` instance
directly — the same object instance captured off the most recent `on_todo_state(todo)` callback —
then re-emits `on_todo_state` so the persisted mirror and UI both refresh from one source.

**Assumption to verify first (spike/test before building on top):** that the `todo` object handed
to `on_todo_state` is the same instance `RalphLoop._run_main_loop` mutates directly, not a copy.
If it turns out to be a copy, the mutation needs one more hop to reach the loop's own reference.

### Concurrency / semantics (per your choice: option A)

- Edits always write straight into persisted state; no scope restriction to paused/idle sessions.
- If a run is mid-iteration, the mutation lands on the live object but only takes effect at the
  next iteration boundary — no lock, no queue, no blocking of an in-flight child.
- Renaming the in-progress task is safe (cosmetic — `execution_payload` was already captured at
  spawn time).
- Removing the in-progress task: treat as no-op-if-missing when the loop next looks it up, not an
  error path.

## REQ2 — Tool pill 3-state highlighting

Add `AgentNode.called_tools: list[str]` (new field, default `[]`).

Populate in `_agent_from_dict` (config_service.py) from `metrics.tool_calls.keys()` — this dict is
already tracked per-agent backend-side (currently only consumed for the global KPI breakdown at
`apply_session` line ~358-360).

Root/orchestrator node: no per-root `agent_metrics` entry exists today, so `root.called_tools`
stays empty for now. Same underlying gap as REQ3's root-context problem, but not solved for tools
in this pass — root pills remain dim-only until backend attributes root's own tool calls somewhere
lookup-able. Flagging as a known limitation, not silently missing it.

Pill rendering (`workspace.py` inspector loop, ~line 390) — three tiers instead of two:

| state | condition | border | text |
|---|---|---|---|
| never called | `tool not in agent.called_tools` | `theme.NEUTRAL_700` | `theme.NEUTRAL_500` |
| called, not active | `tool in agent.called_tools and tool not in agent.active_tools` | `theme.ACCENT_400` | `theme.TEXT` |
| active now | `tool in agent.active_tools` | `theme.ACCENT_800` (unchanged) | `theme.ACCENT_300` (unchanged) |

## REQ3 — Context ring 0% fix for root agent

Root cause: in `apply_session` (config_service.py), the synthetic root `AgentNode` is built without
ever setting `ctx_used` — it keeps the dataclass default of `0`.

TUI already solved the equivalent problem with a cached "last observed prompt-token count"
(`render_state.last_context_tokens`), fed by the same `on_last_prompt_tokens` hook rotaris already
receives — rotaris just currently only funnels that value into per-child `agent_metrics` (keyed by
child `canonical_name`, which the root never matches).

Fix, scoped to rotaris only, no `ralph/loop.py` changes:

- Add `SessionState.root_context_tokens: int = 0` (new field with default, per the project's
  backward-compat rule for session schema fields).
- `_SessionObserver.on_last_prompt_tokens` writes into it unconditionally, in addition to its
  existing per-agent write.
- Root node construction: `ctx_used=state.root_context_tokens`, `ctx_limit=` using the same
  model-lookup already used for children (root persona's configured model `max_input_tokens`).

## REQ4 — Reasoning staleness fix for root agent

Exact parity bug against an existing, working pattern: root's `model=` field already resolves as
`s.session_model_override or root_config.model` (config_service.py line ~339) — correct. Root's
`reasoning=` field does not follow the same pattern — it always pulls the static persona default,
ignoring `s.session_reasoning_override` entirely, which is why changing reasoning in the composer
and sending never shows up in the inspector afterward.

Fix: mirror the model line exactly —
`reasoning=s.session_reasoning_override or str(getattr(root_config, "reasoning", ...))`.

The composer's reasoning chip (pre-run, session-wide, applies to the *next* run's entry persona)
and the inspector's reasoning control (post-spawn, per-agent-instance, via `set_agent_reasoning`)
remain two intentionally separate scopes — this mirrors the existing model chip vs. inspector
model combo duality, which nobody has flagged as a problem. Not touching that split.

## Testing

- `WorkspaceStore` unit tests: `add_todo` / `rename_todo` / `remove_todo` mutate `self.todos` and
  emit the right signal.
- `config_service` unit tests: root node picks up `session_reasoning_override` and
  `root_context_tokens` when present; `called_tools` populated from `metrics.tool_calls`.
- `RunBridge`/`_SessionObserver` test: `edit_todo` mutates the live `TodoList` instance and
  re-triggers `on_todo_state`.
- pytest-qt workspace view test: pill styling picks the right of the three tiers; inline
  rename/remove/add interactions in the todo sidebar produce the expected store calls.
