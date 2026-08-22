---
req-id: SWR-2454
status: draft
trace: required
test: required
title: "The live view keeps up with the run"
epic: SWR-2000
date: 2026-08-22
---

# SWR-2454 — The live view keeps up with the run

While a run is executing, the desktop's live surfaces shall reflect new run
activity promptly, and the work the desktop does per update shall be
proportional to what changed rather than to how much the session has
accumulated.

Both halves are required. A view that is fast on a short session and slow on a
long one has not satisfied this; neither has one that is cheap but a second and
a half behind.

This requirement states the properties, not the means. It does not prescribe a
transport, a delivery mechanism, a data format, or whether the current
mechanism is kept, replaced or supplemented; the implementation plan chooses
that. Several of the criteria below are deliberately written as *preserved*
properties — they are what any chosen design has to keep, and they are the
reason the obvious rewrite is not automatically the right one.

## Why

A long session is the normal case for this product: a Ralph loop runs for
hours. The user's experience of it should not degrade as the session earns its
length. Today the per-update cost grows with accumulated session size, so the
sessions that matter most are the ones served worst.

## Acceptance criteria

### Latency

- Run activity becomes visible on the focused session's live surfaces within
  **250 ms** of the engine producing it, at the 95th percentile, measured on a
  session of any length. The current worst case is approximately 1.25 s; the
  budget is the number to review, and a measured baseline must be recorded
  alongside the first implementation.
- The budget applies to the focused session. An unfocused or foreign session
  (§ Reach) may lag further, but must not lag unboundedly.

### Cost

- The work the desktop performs to apply one update is bounded by the size of
  the change, not by the number of events, agents, todos or artifacts the
  session has accumulated. A session holding 3000 events costs the same per
  update as one holding 30, within a small constant.
- This must hold end to end, not only in the view. SWR-2452 already made the
  transcript's *layout* incremental; a design that satisfies this requirement
  in the view while re-reading and re-deriving whole-session state upstream has
  not satisfied it.
- Idle costs nothing: a run producing no activity produces no repeated work
  beyond a bounded liveness check.

### Reach — what must keep working

- A session executing in **another process** — a CLI or headless run, a second
  desktop window, a detached background session — remains observable from the
  desktop, showing the same content as a session executing in this one. Only
  the latency may differ.
- A session that has **finished** remains inspectable with the same content, as
  does one whose producing process died mid-run.
- Parallel sessions (SWR-2415) keep their per-session behaviour, and unfocused
  sessions keep their summaries live (SWR-2434).

### Correctness — what must not regress

- What the live view shows never contradicts what resuming that session would
  restore. Where the two could diverge, the durable record wins and the view
  converges on it.
- No run-driven work occupies the Qt event loop (SWR-2066).
- A slow, failing or absent view consumer degrades the view only. It never
  fails, stalls or alters the run.
- A run producing activity faster than the view can render it does not starve
  the UI. Coalescing is permitted wherever the latency budget still holds; data
  loss is not — every event that reaches the durable record must be reachable
  by the view.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Applying one update to a projected session touches work proportional to the change: asserted by counting the per-update work over sessions of 30, 300 and 3000 events and requiring the count not to grow with length | the desktop's session-update seam | `apps/rotaris/tests/test_live_update_cost.py` (new) |
| Unit | A view consumer that raises, blocks or is absent leaves the run's own progress and terminal status untouched | the engine→view boundary | `apps/rotaris/tests/test_live_update_cost.py` (new) |
| Integration | A run emitting activity has it visible on the focused session within the latency budget on both a fresh and a long session; a session driven by a second process is observed with the same content; a session whose producer died is still inspectable | desktop host ↔ a live run, and ↔ a foreign run | `apps/rotaris/tests/test_live_view_latency.py` (new), `tests/integration/test_cross_process_session_observation.py` (new) |
| User-flow E2E | A user watches a long-running task in the desktop: new transcript rows, todos and agent state appear promptly throughout, the transcript stays readable as it grows, and the session the user was watching resumes to exactly what was on screen | Public product boundary → user-observable result | `apps/rotaris/tests/test_long_session_liveness_e2e.py` (new) |

Related: [SWR-2453 — A desktop run is the same run as a CLI run](SWR-2453-desktop-runs-on-the-shared-run-lifecycle.md)
(the lifecycle half of the same boundary),
[SWR-2066](../2000-rotaris-desktop.md#swr-2066) (the off-event-loop property this
requirement preserves and narrows — see that entry),
[SWR-2452 — Transcript geometry is incremental](SWR-2452-incremental-transcript-geometry.md)
(the same bounded-cost property, already satisfied in the view layer),
[SWR-2901 — Session event store](../2900-event-store/SWR-2901-session-event-store.md)
and [SWR-2130 — Debounced session persistence](../1500-sessions-diagnostics/SWR-2130-debounced-session-persistence.md)
(the durable record this requirement must stay consistent with).

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
