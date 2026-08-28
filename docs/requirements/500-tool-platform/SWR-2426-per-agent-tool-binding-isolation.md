---
req-id: SWR-2426
status: approved
trace: required
test: required
type: technical
derived-from: SWR-500
title: "Per-agent runtime tool binding isolation"
epic: SWR-500
date: 2026-07-26
---

# SWR-2426 — Per-agent runtime tool binding isolation

`SWR-500` promises a tool platform where each persona gets the tools its config
declares, but says nothing about how a tool instance is bound to the *agent*
that will call it. Several Rotaris tools are runtime-bound: `artifact_read`,
`artifact_list`, `artifact_write`, `todo`, `delegate`, `background_output` and
`wait_for_tasks` each need the calling agent's identity (persona, canonical
name, task id) and live session objects (artifact store, child manager,
scheduler, agent factory, todo callback).

The SDK tool registry (`openhands.sdk.tool.registry`) is process-global and
last-write-wins, and tool resolution is deferred to conversation start
(`AgentBase._initialize`). `Scheduler.spawn_children` creates every ready
child's agent before any of their conversations exist, so factories that carry
per-agent state in a closure are all overwritten by the last child created —
every sibling then resolves the last child's identity.

Runtime binding must therefore be carried per agent, not per registration:
JSON-safe identity travels in `Tool.params` (so it also survives
`ConversationState` persistence and resume), and non-serialisable session
objects are looked up at resolve time from a binding registry keyed by a
JSON-safe binding key that also travels in `Tool.params`.

## Acceptance criteria

- Registering a runtime-bound tool factory more than once does not change the
  identity resolved by an already-specified `Tool`; each `Tool` spec resolves
  the identity carried in its own `params`.
- Two agents created before either conversation initialises resolve
  `artifact_write` executors carrying their own `persona`, `canonical_name` and
  `task_id`.
- Two agents created in the same scheduler pass resolve `todo` executors whose
  state-change callback is the one registered for that agent, and
  `wait_for_tasks` executors carrying their own `current_task_id`.
- Every `Tool.params` dict produced by `agents/factory.py` is JSON-serialisable;
  non-serialisable runtime objects are never placed in `params`.
- The `artifact_write` factory is registered unconditionally; whether a persona
  may publish is decided when its tool spec list is built, not by which factory
  was registered last.
- Resolving a tool whose `binding_key` is unknown falls back to the most recent
  binding registered for that key slot and logs a warning rather than failing
  silently or raising.
- A binding is discarded when its child reaches a terminal state, so bindings do
  not accumulate for the lifetime of a long run.
- The binding key is deterministic and scoped to the agent: an agent built
  without child context is keyed by its persona, so building a child agent
  neither clobbers nor inherits its parent's binding.

Derived from: [SWR-500 — Tool Platform & Integrations](../500-tool-platform.md)

Epic: [Tool Platform & Integrations](../500-tool-platform.md)
