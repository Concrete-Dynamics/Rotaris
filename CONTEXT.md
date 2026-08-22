# CONTEXT.md

Design decisions and architectural invariants for Rotaris, plus the few domain
terms the glossary does not own. Intended to orient AI agents doing architecture
work. For commands and file layout, see CLAUDE.md.

---

## Domain Language

Canonical glossary with source references: [docs/terminology-glossary.md](docs/terminology-glossary.md).
The terms below are the ones that live only here:

| Term                       | Meaning                                                                                                                                                                                                                                                                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **LocalConversation**      | OpenHands SDK object. Its `.run()` method is synchronous — must always be wrapped in `asyncio.to_thread()`.                                                                                                                                                                                                                  |
| **Steering injection**     | Mechanism to inject guidance messages into a running child conversation mid-flight. Used by the TUI to surface user feedback without stopping the agent.                                                                                                                                                                     |
| **Iteration Observer**     | `RalphIterationObserver` (`ralph/iteration_observer.py`) — lifecycle hook seam for one Ralph iteration. The base loop owns semantics; observers (no-op default, `TuiIterationObserver`) mirror progress to a host surface. All hooks fire on the event loop thread except `on_child_spawned` (may fire from a worker thread). |
| **Run Bootstrap**          | `ralph/bootstrap.py` — the shared run-setup pipeline (intent classification, contextual todo, summary-agent / improvement-collector / agent factories, post-run state application) consumed by both CLI background and TUI entry points.                                                                                     |
| **Session Persister**      | `session/persister.py::SessionPersister` — the single debounce layer for session snapshots. Debounced writes run via `asyncio.to_thread` on a deep copy; parked saves are written by a timer; non-running statuses flush synchronously. Hosts reach it via `SessionManager.persister`.                                       |
| **Tool Activity Registry** | `ToolActivityRegistry` (`orchestrator/scheduler_conversation.py`) — lock-protected per-child registry of in-flight tool call ids. Written from SDK worker threads, read by graceful-pause poll threads and UI/signal threads.                                                                                                |
| **Wait Barrier**           | `WaitBarrier` (`orchestrator/wait_barrier.py`), owned by `ChildManager` — the explicit handshake between the `wait_for_tasks` tool (parent registers task ids to block on, from the SDK worker thread) and the scheduler drain (consumes them on the event loop). Keyed by conversation identity.                            |
| **Terminal outcome**       | `tools/terminal_outcome.py` — classifier that separates terminal command outcomes (`success`, `shell_failure`, `suspicious_success`, `soft_pause`, timeout/request/tool failures, background states) from internal tool execution errors so diagnostics, TUI, and summaries read shell results consistently.                 |

---

## Child Task State Machine

```
QUEUED ──────────────┬─→ RUNNING ──→ SUMMARIZING ──→ SUCCEEDED
                     │       └──────────────────────→ FAILED
WAITING_ON_DEPS ─────┘
      │
      └──→ BLOCKED   (cascades recursively when any dependency is FAILED/CANCELLED/BLOCKED)

All four terminal states: SUCCEEDED, FAILED, CANCELLED, BLOCKED
BLOCKED is terminal — it cannot be unblocked.
```

---

## Key Design Decisions

### Threading model

Single-process asyncio. `LocalConversation.run()` is sync (OpenHands SDK) so it runs in `asyncio.to_thread()`. `ChildManager`'s `spawn_child` and `mark_child_terminal` use `threading.Lock` because they're called from both the event loop and background threads.

### Config merge semantics

Field-wise overlay (not deep merge). If a workspace `agents.yaml` declares persona `coding-agent`, it replaces the inherited persona entirely at the persona level; only _absent fields_ inherit from the lower-priority layer. List and dict fields (e.g., `tools`, `mcp_servers`) replace rather than extend.

### Atomic writes everywhere

All file writes — session snapshots, HAET edits, `write_file` tool, token storage — use `tempfile.mkstemp()` + `os.replace()`. No partial-write state on crash. Caveat: a session snapshot fans out to seven per-file-atomic writes, so a crash mid-fan-out can leave the files mutually inconsistent (`state/resume.json` is the load-time source of truth).

### HAET as opt-in

Built-in personas use `read_file`/`write_file` (the `FileToolEngine` with 4-level fuzzy fallback cascade) by default. HAET is available for configurations that want hash-anchored guarantees on large files, but is not the default path.

### `HAETEditTool` bypasses the queue

`HAETEditExecutor` calls `engine.apply_patch()` directly. `HAETQueue` exists for consumers who need per-file serialization but must be wired in explicitly — it is not used by the tool itself.

### Read-before-write enforcement

`write_file` (via `FileToolEngine`) rejects edits to files that haven't been read in the current session. The engine tracks a read ledger shared between `read_file` and `write_file` tool instances.

### Child report as hand-off contract

The parent agent learns about child results only through the `ChildReportArtifact` — not by reading the child's raw transcript. This decouples parent and child reasoning and keeps the parent's context bounded.

### Delegation factory pattern

`create_agent_for_persona()` returns a factory (not an Agent). The factory captures `child_manager`, `scheduler`, and `agent_factory` in a closure so the `delegate` tool can spawn children without going through the SDK's JSON serialization boundary.

### Cascade blocking

When a child reaches `FAILED` or `CANCELLED`, `ChildManager._cascade_blocked()` recursively transitions all downstream dependents (`QUEUED` or `WAITING_ON_DEPS`) to `BLOCKED`. This is irreversible for the session.

### One Ralph iteration, observed

`RalphLoop._run_iteration` is the single implementation of iteration
semantics (completion classification, blocked-status re-queue, escalation
abort, token capture). Hosts must not override it; they implement
`RalphIterationObserver` hooks. This ended a TUI/base fork that had already
diverged on blocked-status handling.

### Conversation control lives in one module

`orchestrator/scheduler_conversation.py` owns every way a blocking
conversation method is run off the caller's thread: `pause_with_daemon`,
`close_conversation_async`, `graceful_pause_conversation`, and the
`ToolActivityRegistry` those decisions consult. `Scheduler` only delegates
(`_graceful_pause_conversation` is a thin wrapper binding its registry and
config deadline). Tool activity was previously tracked in an unlocked dict
shared across threads — the registry's lock is load-bearing, not style.

### Session persistence is debounced off the event loop

`SessionPersister` is the one debounce layer (the old design stacked a TUI
debounce on top of `SessionManager.save_session`'s). Debounced writes deep-copy
the state and write via `asyncio.to_thread`; a save parked inside the debounce
window is written by a timer task instead of waiting for the next save call.
Status transitions (paused/background/completed/…) write synchronously and
immediately. Run-end paths must call `flush`/`flush_sync` — that is the
guaranteed final write.

### Wait handshake is explicit, not smuggled

`wait_for_tasks` used to communicate "resume me when these task ids finish"
by setting a `_rotaris_waited_ids` attribute on the SDK conversation object —
invisible at both seams and easy to break. The handshake now goes through
`ChildManager.wait_barrier` (`WaitBarrier`): the tool registers the request,
the drain consumes it, and `run_child`'s teardown discards any unconsumed
entry. Lock-protected because the two sides run on different threads.

The delegation drain re-checks the barrier after _every_ parent resume —
`_drain_delegated_children` is a loop, not a one-shot check. A parent that
delegates in its first run and calls `wait_for_tasks` during the spawn-resume
run registers its request one step past drain entry; the one-shot design
silently discarded it, ended the parent "blocked", and made RalphLoop spawn a
duplicate orchestrator (session 20260707-103842). The loop exits when a pass
finds no wait request, no pending notifications, and no queued children it
has not already attempted to spawn.

---

## Architectural Boundaries

- `mcp/` is an import redirector only — it prevents `rotaris_core.mcp` from shadowing the external `mcp` package. `__init__.py` defers heavy symbols via `__getattr__`.

---

## Extension Points

| Extension                | Where                                                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| New persona              | Add to `agents.yaml` (workspace or global); system prompt in `agents/prompts/` or inline                               |
| New auth provider        | Implement `AuthProvider` protocol in `auth/`; no core changes required                                                 |
| Custom tool plugin       | Python file with decorated functions; declared per-persona in `agents.yaml` under `custom_tools`                       |
| New model provider       | Add entry to `models.yml`; 30+ providers available through litellm                                                     |
