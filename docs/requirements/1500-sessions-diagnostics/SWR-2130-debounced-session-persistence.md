---
req-id: SWR-2130
status: approved
trace: required
test: required
type: technical
derived-from: SWR-1545
title: "Debounced session persistence writes"
epic: SWR-1500
date: 2026-07-23
---

# SWR-2130 — Debounced session persistence writes

`SWR-1545` requires session persistence to write split state files, but says
nothing about *when* those writes happen relative to a running loop.
`src/rotaris_core/session/persister.py::SessionPersister` is the single debounce
layer in front of that split-file writer: it must avoid blocking the event
loop, must never lose a save that lands mid-debounce, and must flush
synchronously and immediately on any non-running status transition so that
status changes are always durable.

## Acceptance criteria

- A save request for a running/idle state after a quiet period writes
  immediately, off the event loop thread (`asyncio.to_thread`), on a deep copy
  of the state.
- A save request that lands inside the debounce window is parked and written
  by a timer task once the window elapses, without further calls from the
  caller.
- `flush` writes the pending state immediately and cancels any pending timer;
  `flush_sync` writes synchronously from any thread.
- A save for a non-running execution status (paused, background, completed,
  ...) flushes synchronously and immediately, bypassing the debounce.
- `request_save` degrades to a synchronous write when called with no running
  event loop.
- `SessionManager.persister` exposes a single cached `SessionPersister`
  instance per manager.

## Scope note — the debounce is a durability knob, not a liveness one

The debounce window governs how promptly a run's state becomes *durable*. It is
not a means of controlling how promptly a user interface learns what a run is
doing, and must not be tuned for that purpose. A host that shortens it to make
its view feel live is paying in write amplification for a property it should be
getting some other way, and is coupling its refresh rate to the durability
layer's. Callers today do exactly this — the desktop constructs its
`SessionManager` with a 0.5 s window for view reasons — which
[SWR-2454 — The live view keeps up with the run](../2000-rotaris-desktop/SWR-2454-live-view-keeps-up-with-the-run.md)
exists to unpick. Whatever that lands on, this requirement's window stays free
to be chosen on durability grounds alone.

Derived from: [SWR-1545 — Session persistence must write split state files for resume state, run config, and UI transcript.](../1500-sessions-diagnostics.md)

Epic: [Session Persistence & Diagnostics](../1500-sessions-diagnostics.md)
