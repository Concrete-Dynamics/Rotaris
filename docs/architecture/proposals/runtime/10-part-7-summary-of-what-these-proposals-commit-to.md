# RUNTIME slice — architecture proposals — Part 7 — Summary of what these proposals commit to

Part 10 of 10 of [the runtime proposal](../runtime.md), which indexes every part.

## Part 7 — Summary of what these proposals commit to

If all eleven are approved, the runtime is:

- One Electron main process for windows, guards and choosers; **one `utilityProcess` run host** for
  every run in the application, forked after `app.ready` (ADR-01).
- **Three channels** between them: a serializable control request/response, a bounded-blocking
  ordered event bus, and a non-blocking view-update channel carrying a transcript delta plus a
  whole-session snapshot (ADR-02).
- **Files as the only source of truth** for session state, the event journal and the diagnostics,
  with no database in the runtime (ADR-03), written through **one ordered writer per session** that
  owns the debounce, the generation ordering and the synchronous flush (ADR-04).
- Foreign sessions followed **from the filesystem** by resumable offset reads plus a 750 ms
  whole-state poll, sharing one transcript projector with the local path (ADR-05).
- Delegated children driven by a **persisted ledger** with one `transition` function that is the
  sole implementation of REQ-MONITOR-300, a five-check admission gate, a per-model FIFO hold queue,
  and a scheduler run to quiescence (ADR-06).
- The **session lock as the single capability token**, one liveness predicate shared by four call
  sites, a guarded `process.kill(pid, 0)` probe verified by spike to be inspection-only on Windows,
  and repair strictly separated from every read path (ADR-07).
- Hooks invoked as fresh processes, **sequential within an occurrence and concurrent across
  occurrences**, resolved on `exit` plus a 5 s grace rather than on `close`, killed as a process and
  never as a group (ADR-08).
- **Two clock ports and a `Budget` value type**, with no bare `Date.now` or timer in engine code, so
  every duration in domain 01 is testable against a controlled clock (ADR-09).
- One **sticky `StopRequest`**, an ordered eight-step teardown that runs even on exception, and a
  single 30 s deadline shared by the cancellation grace and the force-exit backstop (ADR-10).
- A **registry keyed by session id** with focus held entirely in the shell (ADR-11).

The two findings most worth the reviewer's attention are ADR-RUNTIME-03 (the persistence half of the
candidate stack does not apply to this slice) and the note under Part 3 that "an event journal with
projections" describes only the transcript, not session state.
