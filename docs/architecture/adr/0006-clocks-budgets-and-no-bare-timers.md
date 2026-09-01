# ADR-0006 — Two clock ports and a budget primitive; no bare timers in engine code

- **Status:** proposed
- **Date:** 2026-08-31
- **Origin:** RUNTIME (ADR-RUNTIME-09), DATA (constraint G8, `REQ-TRACE-140`)
- **Depends on:** ADR-0001

## Context

`REQ-ORCH-156` requires every duration in domain 01 to be a wall-clock duration **measured against a
monotonic clock** from the start point its requirement names, and requires **conformance to every one
of them to be demonstrable with a controlled clock** — no conformance claim may depend on real
provider latency or on the wall-clock cost of a live model call.

`REQ-ORCH-124` and `REQ-ORCH-069` fix how a budget behaves: it fixes **when the run takes its stated
action, not the total elapsed time**; where the action can only be taken at a boundary it is taken at
the first boundary at or after expiry, so a long iteration legitimately overshoots; where two budgets
bound the same activity the smaller governs, and expiry of the smaller **never resets** the larger.

Three timestamp conventions coexist deliberately. `REQ-EVENTS-037` and `REQ-EVENTS-120`: event stamps
are ISO-8601 UTC with an explicit `+00:00` offset, are **wall-clock, carry no monotonic guarantee**,
and a clock that moved backwards mid-run may make a bounded query select a non-contiguous set — a
permitted outcome, never an error. `REQ-SESSION-014`: session timestamps are UTC with a `Z` suffix.
`REQ-SESSION-121`: transcript rows carry `ts` in **local** wall-clock `HH:MM:SS`.

`REQ-MONITOR-155` requires the persisted verification deadline to be a **duration in whole seconds
from a recorded start**, never an absolute instant, so it stays meaningful after a resume and to a
viewer in another process that cannot interpret a clock it did not read.

The fixed cadences this record inherits: growth tick 50 ms (`REQ-MONITOR-219`); stall watchdog
`max(1, min(threshold/6, 5))` s (`REQ-ORCH-089`); force-exit backstop and cancellation grace 30 s
(`REQ-SESSION-092`, `REQ-MONITOR-131`), against which `REQ-MONITOR-131`'s separate 5 s restart wait and
`REQ-MONITOR-287`'s worker join cap — 5 s on restart, unbounded at shutdown — must **not** be unified;
final-refresh 3 retries at 100 ms and live-row repaint ~1 s (`REQ-MONITOR-287`); token-history sample
10 s (`REQ-MONITOR-166`); benchmark lag probe 10 ms (`REQ-UIBENCH-049`); diagnostics heartbeat 250 ms
(`REQ-STARTUP-133`); and the one Windows replacement ladder the corpus states, five attempts at
0.05/0.1/0.2/0.4/0.8 s (`REQ-SESSION-033`). `REQ-TRACE-140` separately requires the retirement date to
come from an **injectable clock** defaulting to today's UTC calendar date.

> **Three cadences this list used to carry are withdrawn and must not be re-derived from it.** The
> 750 ms foreign poll and the 2000 ms local reconcile poll went with SR-2 and SR-3 — `REQ-MONITOR-288`
> is withdrawn and `REQ-MONITOR-287` now states that this domain "fixes no cadence for polling a
> session's own state". The **10.0 s state-save debounce** went with the amendment SR-4 authorised:
> `REQ-SESSION-067` now reads "No save is deferred behind a timer, parked, or coalesced with a later
> one", and `REQ-SESSION-071` withdraws the write-volume observable with it. **There is no timer in
> front of a save**, which is the one of the three most likely to be reintroduced by someone reasoning
> from write volume. See constraints D-09 (withdrawn), U-16 and reconciliation 7.

## Alternatives considered

**A — `Date.now()` and `setTimeout` directly, tested with fake timers.** The default, and it fails
`REQ-ORCH-156` twice. `Date.now` is wall-clock and `REQ-EVENTS-120` explicitly permits it to move
backwards mid-run, so a budget built on it can expire early or never. And "conformance to every
duration must be demonstrable with a controlled clock" is a requirement on the **product's**
structure, not on the test harness: fake timers patch a global, which works until one library or one
native call reads the real clock, and that failure is silent.

**B — One injected clock.** Better, but it conflates two things the specification separates. Budgets
need monotonicity and immunity from clock adjustment (`REQ-ORCH-156`); event and session timestamps
must be wall-clock and are explicitly allowed to be non-monotonic (`REQ-EVENTS-120`). One port forces
one guarantee onto both.

**C — Two ports plus a budget value type.** Chosen.

## Decision

- **`MonotonicClock`** — `now(): Millis` over the platform's monotonic source. Every duration,
  deadline, watchdog cadence, coalescing tick, poll interval and backoff reads from it. Timers
  (`setTimeout`, `setInterval`) are obtained **from this port**, so a controlled clock drives the
  50 ms growth tick, the 750 ms and 2000 ms polls, the 10 s debounce and the stall watchdog without
  patching globals.
- **`WallClock`** — `instant(): Instant`, with three formatters over one source for the three
  conventions of `REQ-EVENTS-037`, `REQ-SESSION-014` and `REQ-SESSION-121`. The retirement-date clock
  of `REQ-TRACE-140` is this port with a calendar-date formatter.
- **`Budget`** — a value carrying a start reading and a duration, answering `expired()`, `remaining()`
  and `min(other)`, with `REQ-ORCH-124`'s composition rules built in: the smaller governs, and
  expiring the smaller does not reset the larger. Persisted verification deadlines are stored as the
  **duration** (`REQ-MONITOR-155`) and rehydrated against a fresh start reading.

**No `Date.now()`, `performance.now()`, `setTimeout` or `setInterval` appears in engine code.** A lint
rule enforces it. "Engine code" here means everything in the run host and the workspace service; the
renderer's animation frames and the benchmark's own lag probe are named exceptions (ADR-0050,
ADR-0051), because `REQ-UIBENCH-049` and `REQ-UIBENCH-118` measure the interface's real loop.

## Consequences accepted

1. Every engine component takes a clock, which shows up in every constructor and every test. In
   exchange, the whole constant table plus every budget in domain 01 becomes deterministically
   testable in milliseconds of wall time — which is precisely what `REQ-ORCH-156` asks to be
   demonstrable.
2. Budgets are **values checked at boundaries, not interrupts**. That is consistent with
   `REQ-ORCH-069`'s stated overshoot and means a long iteration legitimately runs past a time limit
   rather than being aborted mid-flight.
3. The renderer's determinism obligation (`REQ-UIBENCH-083`) forbids the *view-model* stage from
   reading any clock at all; ADR-0045 states that separately, and it is not weakened by the presence
   of clock ports elsewhere.

## Revisit if

A dependency proves impossible to drive from an injected clock — a provider SDK with its own internal
timeout, for instance. That timeout must then be surfaced as a configurable value the port can set,
not left to the library.
