# RUNTIME slice — architecture proposals — Scope

Part 1 of 10 of [the runtime proposal](../runtime.md), which indexes every part.

## Scope

This slice owns the process topology and the run engine:

- **01 Run orchestration** (`REQ-ORCH`) — the iteration loop, delegation, child scheduling, stop
  conditions, verification gating, cancellation.
- **02 Run monitoring and steering** (`REQ-MONITOR`) — the child state machine, run control surface,
  live update transport, crash reconciliation.
- **07 Session persistence and resume** (`REQ-SESSION`) — on-disk layout, atomic writes, locking,
  the shared run lifecycle, resume, cross-process following.
- **09 Lifecycle hooks** (`REQ-HOOKS`) — invoking user shell commands at named points without
  letting one stall a run.
- **20 Event history, replay, export** (`REQ-EVENTS`) — the wire event stream, the durable journal,
  replay and trajectory export.

Out of slice but load-bearing here and cited where it matters: domain 05 (the tool and terminal
execution path, the single waiting mechanism), domain 06 (worktrees, checkpoints, the lock file
shape), domain 11/12 (application entry point, window lifecycle, quit guards), domain 15
(configuration keys), domain 19 (presentation state vocabulary).

Two things are settled by product decision and are not reopened: the product is one Electron desktop
application, and the model layer sits behind an internal abstraction rather than a vendor SDK called
from feature code.

---
