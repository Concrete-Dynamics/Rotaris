# Architecture proposals — DATA slice — ADR-DATA-08 — Where the data layer runs

Part 21 of 25 of [the data proposal](../data.md), which indexes every part.

## ADR-DATA-08 — Where the data layer runs

### Decision to be made

Which process owns workspace document I/O, configuration loading, Git invocation and the
traceability engine. This overlaps the ARCH slice's process-model decision and is offered as an
input to it rather than as a settlement of it.

### Constraints that bear on it

- **G10.** `REQ-TRACE-337`: evaluation and projection **never** on the interface event loop;
  `REQ-TRACE-497` lists it among the things that must never be observable. `REQ-GIT-102`: the
  interface accepts and acts on input for the whole time any Git refresh is running.
  `REQ-LIBRARY-122`: analysis runs off the UI thread and the user can keep typing and start runs.
- **G11.** `REQ-TRACE-377`: **no module of the desktop application may launch** a
  requirement-checking or verifier process, and a guard test asserts it. `REQ-TRACE-206`: the
  consuming surface calls the library directly — "no child process, no exit status to inspect and no
  text to parse".
- `REQ-LIBRARY-127`: shutdown leaves nothing of analysis behind, and the work "MUST NOT be handed to
  a durable out-of-process service that would outlive the application". The time from asking to quit
  to the process exiting must not depend on whether an analysis was in flight.
- `REQ-GIT-101`: shutdown **waits** for an in-flight checkpoint Git operation rather than killing it
  mid-call. `REQ-GIT-102`: shutdown waits for a refresh already under way, and exactly one refresh
  runs at start, after the window is first drawn and before onboarding is offered.
- `REQ-GIT-124`: a run counts as active whenever it holds a session lock in this workspace, "whether
  it was started in the desktop foreground or detached into the background, **and whether or not this
  application started it**". Cross-process, cross-instance coordination through lock files is the
  specified world, not an edge case.
- **G7, OQ-6.** `REQ-TRACE-073` compiles and runs **user-supplied regular expressions** over
  repository files, and `REQ-TRACE-154` and `REQ-TRACE-225` deliberately place no time limit on the
  scan.
- `REQ-CONFIG-374`: work completing after the settings screen has been destroyed must not crash.
- Configuration, the Git view, the board and the improvement library are all needed **with no run
  active**, so none of them can live in a per-run process.

### Alternative A — everything in the Electron main process, heavy passes on worker threads

Main is already a Node process with filesystem access, it owns window lifecycle (which
`REQ-GIT-102`'s "after the window has first been drawn" and `REQ-GIT-101`'s shutdown wait both need),
and it means one fewer IPC hop for the board projection.

Against it: main is the process every window's IPC and window management flows through. A synchronous
filesystem call or a runaway user regex there degrades every window at once. Worker threads mitigate
the CPU case and are terminable, so this is not fatal — but it puts the least isolated process in
charge of the least bounded work.

### Alternative B — a long-lived workspace service process, separate from per-run runtime processes

An Electron `utilityProcess` (a Node child with no Chromium) per open workspace, owning all workspace
document I/O, configuration, Git invocation and the traceability engine. Per-run runtime processes
remain separate and short-lived. The main process keeps only the preference store, window state and
lifecycle coordination. The renderer touches no filesystem at all.

For it: isolation from the two genuinely unbounded workloads — user regexes and the engine read that
`REQ-TRACE-225` deliberately leaves unbounded. `REQ-TRACE-377`'s guard test becomes structurally
easy, because a renderer with no Node integration physically cannot spawn a process. It matches the
already-specified world of `REQ-GIT-124`, where several processes coordinate through lock files.

Against it: one more IPC hop for the board projection, which can be large; and lifecycle
coordination (`REQ-GIT-101`'s shutdown wait, `REQ-GIT-102`'s post-first-paint startup refresh)
becomes cross-process choreography rather than a function call.

### Alternative C — in the renderer with Node integration

Rejected outright. `REQ-TRACE-337` forbids it, and enabling Node in a renderer that displays
model-generated content is a security decision no requirement asks for.

### Recommendation

**Alternative B**, offered to the ARCH slice as an input rather than as a settled decision, because
the process model is theirs.

The split I would propose:
- **Renderer:** no filesystem, no Git, no engine. Receives already-translated projection values
  (`REQ-TRACE-378`) and emits intents (`REQ-CONFIG-279`: "The screen's outward contract is a set of
  intent notifications, not file writes… The host commits; the screen never names a file").
- **Workspace service (one per open workspace):** ADR-DATA-02's stores, ADR-DATA-03's configuration
  loader, ADR-DATA-04's Git helper, ADR-DATA-05's checkpoint layer, ADR-DATA-06's engine, and
  ADR-DATA-07's delivery store. Within it, the engine's passes run on worker threads so a runaway
  regex is terminable without taking the service down.
- **Main:** the preference store (ADR-DATA-09), window state, and the lifecycle sequencing that
  `REQ-GIT-101` and `REQ-GIT-102` describe.
- **Per-run runtime processes:** unchanged, and they take the session lock of `REQ-GIT-020` like any
  other process.

Two consequences to carry into synthesis. First, `REQ-TRACE-239`'s 100 ms budget is measured "once
the engine has answered", so projection serialisation across the IPC boundary sits **before** that
line and is not covered by it — but it is still real, and a projection for several hundred
requirements should be measured across the boundary before the gate. Second, `REQ-LIBRARY-127` is
satisfied only if the workspace service is a child that dies with the application; it must not be a
detachable daemon.

### Consequences accepted

- Cross-process lifecycle choreography for two shutdown behaviours that differ deliberately:
  `REQ-GIT-101` waits for checkpoint Git work; `REQ-LIBRARY-127` abandons the analysis call. Both
  must be implemented, and they must not be unified.
- Projection serialisation cost.
- More processes to supervise, and a supervision story for the service itself — which
  `REQ-TRACE-507` already anticipates for the live-refresh subscription: a persistent, actionable
  notice naming what stopped, a re-subscribe action, the last good board kept on screen, no polling
  and no automatic retry.

### What would have to change to revisit this

A measured projection-serialisation cost that endangers board responsiveness; or the ARCH slice
settling on a single-process model for reasons outside this slice, in which case Alternative A plus
worker threads is a defensible fallback and none of ADR-DATA-01 to 07 changes.

---
