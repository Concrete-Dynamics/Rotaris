# ADR-0052 — One passive instrumentation registry for the benchmark, diagnostics and the budgets

- **Status:** proposed
- **Date:** 2026-08-31
- **Revised:** 2026-09-01. The one-registry decision is unchanged. Three things it did not account for
  are now on it: **SR-4** moves the session stores this registry must count out of memory and into a
  database, and the `ipc-hop-latency` spike establishes both **what** the relay's failure actually looks
  like — which is not what ADR-0044 consequence 4 assumes — and that **`performance.timeOrigin` is not a
  shared clock**, which invalidates any interval this registry assembles from two processes' stamps.
- **Origin:** UI (ADR-UI-08)
- **Depends on:** ADR-0002, ADR-0008, ADR-0045, ADR-0046, ADR-0051, ADR-0058

## Context

**The benchmark and the diagnostics recorder want almost the same numbers.** The two structural counts
appear in both (`REQ-UIBENCH-050`, `REQ-STARTUP-134`). Event-loop lag appears in both at different
cadences — a 10 ms probe for the benchmark (`REQ-UIBENCH-049`), a 250 ms heartbeat for diagnostics
(`REQ-STARTUP-133`). The Markdown cache's occupancy is a benchmark field but is the same object
diagnostics would want. **Building these twice would guarantee they disagree.**

`REQ-STARTUP-130` and `REQ-STARTUP-129`: when diagnostics is off, **no diagnostics files, timers or
instrumentation of any kind exist — zero work, zero disk writes.** Activation has exactly one source,
the preference store; no environment variable and no other surface sets either value.

`REQ-STARTUP-134`: every metric record — one per second — carries, among others, the operating-system
thread count **with names**, the count and names of **the concurrent execution contexts the application
itself creates**, handle and descriptor counts, live widget and object counts, measured event-loop lag,
**one per-view entry for each of the seven primary views** keyed by its lower-cased name carrying
visibility, live widget count and principal-collection size, and **counts only** for session stores.

`REQ-STARTUP-134` and `REQ-STARTUP-136`: **no diagnostics file may contain session content of any kind**
— no transcript or prompt text, no model or tool output, no file contents, no credentials — and stack
frames identify source files **by base name only, never a directory path**.

`REQ-STARTUP-133` and `REQ-STARTUP-157` bound the recorder on disk: four segments per stream with oldest
replaced, a total snapshot budget with further writes refused **without raising an error**, statistics
over fixed-size rings, a capped number of distinct span names with the rest folded under one label, and
a heartbeat whose lag reading is the inter-heartbeat interval minus its period. **Every bound and
cadence in force is readable from the manifest.**

`REQ-UIBENCH-118` ties the benchmark's lag reading to `REQ-SHELL-150`'s **interface** responsiveness
budget, and applies one absolute threshold: every record's lag strictly below 100 ms.

`REQ-NOTIFY-267`: a diagnostics **view** that cannot read or render its own data reports that within
itself and nowhere else, as that region's empty condition, publishing no notice and no acknowledgement;
unreadable records are skipped and counted rather than failing the view.

## Alternatives considered

**A — Two independent instrumentations.** The benchmark reads what it needs; the recorder reads what it
needs.

*For:* each is simple and neither constrains the other; diagnostics can be compiled out entirely under
the zero-work rule.
*Against:* **two definitions of the widget count is a defect waiting to happen**, and that definition is
exactly the thing ADR-0045 had to argue for. Two lag measurements at two cadences, if independently
implemented, will disagree about what "lag" is.

**B — One metrics registry the product owns; two readers with different cadences and different
budgets.** Every countable is registered once, with one definition, and exposed through a single
synchronous sample returning a plain object. The benchmark samples it at phase boundaries; the recorder
samples it every second. Chosen.

*For:* one definition of every counter. The per-view entries come from the **same view registry** that
ADR-0048 already needs for the visibility signal and that ADR-0045 already needs for slot pools. The
Markdown cache exposes its own occupancy, satisfying two requirements from one object.
*Against:* the zero-work rule now applies to a shared registry.

## Decision

**Alternative B, with the passive-registry discipline made explicit**, because it is the only way to
satisfy the zero-work rule and still have one definition of each counter.

- **Passive counters only.** Nothing in the registry may compute anything on write. The widget count is
  the sum of the fixed pool sizes and the chrome element count, maintained when a pool is allocated; the
  object count is a counter the row renderer adjusts when it creates or releases content nodes; the
  transcript operation counters are incremented by the apply stage of ADR-0046; the Markdown cache
  counters are fields of the cache. **Sampling is proportional to the number of registered counters,
  not to the size of the interface tree.** No timer, no allocation and no traversal exists unless a
  reader is attached.
- **The session-store counts are maintained, never queried on the sample path.** `REQ-STARTUP-134`
  requires every metric record to carry, "for session stores, **counts only** — the number of transcript
  entries, agents, todos, artifacts, and cache entries". Under **SR-4** four of those five now live in
  the workspace database rather than in an in-memory collection, and an aggregate over a table is
  proportional to the table's size in exactly the way the passive rule forbids of the interface tree. A
  count query on a once-per-second sample would also put a read on the run host's store connection
  beside the write path of ADR-0008. **The rule is therefore extended in the only direction that keeps
  the discipline honest:** the session writer maintains these as ordinary counters as it inserts rows,
  in the same transaction as the insert, and the registry reads the maintained value. A count that
  cannot be maintained that way does not get a query — it does not get reported. The renderer-side cache
  entry count is unaffected, because a cache already knows its own occupancy (ADR-0045, ADR-0051). This
  is a genuine addition SR-4 forces on this record and it would otherwise have been discovered as a
  slow sample.
- **Two lag observers, one definition.** "Lag" is the amount by which a scheduled callback started later
  than scheduled, floored at zero. The benchmark's is a 10 ms interval reporting the maximum since the
  last record; the recorder's is the 250 ms heartbeat reporting the inter-heartbeat interval minus its
  period. **Both are instances of one observer with different periods and different reducers**, and
  neither exists unless its reader is attached.
- **The lag observer lives in the renderer**, because the benchmark ties the reading to the *interface's*
  responsiveness budget. A main-process reading would be measuring the wrong loop. Diagnostics
  additionally wants main-process figures — thread names, handle counts — so the recorder assembles a
  record from both sides; **the assembly is what crosses the boundary, and it carries counts and names
  only, never content.**
- **Diagnostics also gets a main-process lag reading, and the two must never be conflated.** The
  `ipc-hop-latency` spike measured that under load it is **main's** event loop that goes, not the
  renderer's: relaying an unthrottled frame stream drove main's event-loop lag to **22,777 ms** while
  the renderer's applied latency was the *consequence* rather than the cause. A registry that reads only
  the renderer's loop would report a symptom of a stall it cannot see. So there are two lag readings on
  two loops, and they are distinct fields with distinct names — the same discipline ADR-0044
  consequence 5 imposes on its two sequence vocabularies, and for the same reason. `REQ-UIBENCH-118`'s
  invariant reads the renderer's, and only the renderer's, because that is the loop `REQ-SHELL-150`'s
  budget is about.
- **The relay's capacity is a message rate, so the message rate is a counter.** The spike established
  that the relay's cost is per message rather than per byte — 33.0–37.4 µs in `webContents.send` per
  4 KiB frame against 163.0–195.0 µs per 64 KiB frame, so a 16× payload costs 5× — and that at 12,000
  messages per second main spends about 40 % of every wall second inside `send` alone. **Messages per
  second per channel, and the depth of whatever queue feeds them, are therefore first-class registry
  counters**, maintained by the publisher and by main's relay rather than derived. They are also cheap:
  a counter increment on a path that is already doing a structured clone.
- **A gap counter would not have caught the failure the record expects it to.** ADR-0044 consequence 4
  asks diagnostics to "distinguish a gap caused by an overflowing subscriber queue from one caused by
  the relay". The measurement says there is no such gap to distinguish: in the collapse **nothing was
  dropped and nothing was reordered** — the renderer received every one of the 586,960 frames the run
  host sent, and refused increments were zero in every measured run. **The relay degrades into unbounded
  latency, not into loss.** So the discrimination ADR-0044 wants must be built on **latency and queue
  depth**, not on gaps, and a gap counter that never fires would otherwise read as health while the
  interface is minutes stale. The gap counter is still worth keeping for the case it does cover — a
  sequence number arriving out of order across the two update channels — but it is not the relay
  detector, and this record says so because ADR-0052 is where the detector would be built.
- **"The concurrent execution contexts the application itself creates, together with the names it gives
  them"** maps, under ADR-0002, to: the renderer processes we created named by their window role, the
  run host, the workspace services named by workspace, and any worker threads. **This must be a registry
  we maintain when we create one, not an introspection of the runtime** — the requirement says
  "whatever the runtime it is built on calls them", which is an invitation to name them ourselves.
- **The budgets get runtime assertions in development builds**, fed from the same registry: a
  gesture-to-acknowledgement timer, a pending-changes repaint-interval watchdog, and a
  publication-to-paint timer. These are the numbers `REQ-SHELL-150` and `REQ-MONITOR-222` state as
  pass/fail criteria, and measuring them continuously in development is far cheaper than discovering a
  regression through the benchmark. **Two measured facts constrain how they are built.**
  - **A cross-process interval must be calibrated or it is not a measurement.** The spike found that
    `performance.timeOrigin` is **not a shared clock across Electron processes**: the run-host-to-renderer
    offset ranged over **1.43 ms across 46 runs**, which is larger than the entire one-way latency it was
    being used to measure. Its harness had to run 400 ping-pong exchanges over the transport before every
    measurement to recover a usable figure. The publication-to-paint assertion is exactly such an
    interval — it starts in the run host and ends in the renderer — so it must either carry a calibrated
    offset or be split into two single-process intervals joined by a sequence number. The
    gesture-to-acknowledgement timer is single-process and unaffected, as are `REQ-MONITOR-225`'s
    per-snapshot-load and per-projection durations. **An uncalibrated cross-process assertion reports a
    number whose error is the size of the thing it is measuring**, which is worse than not asserting.
  - **The publication-to-paint assertion has a floor that is not the product's.** The wait for the frame
    after the commit measured **p95 9.127–10.315 ms in every condition** — every topology, every session
    length — which is one to two vsync intervals at 60 Hz and a property of the display cadence. A
    threshold set near that floor fires on healthy runs; the assertion is only meaningful well above it.
- **The no-session-content rule is enforced at the type level.** The record type admits numbers,
  booleans, enumerated strings and registered names only — never free text drawn from session state. A
  field carrying a path is reduced to a base name **at the point of capture, not at the point of
  writing**.

## Consequences accepted

1. Every counter becomes a small ongoing obligation on the code that owns the thing being counted.
2. **A misplaced counter increment is a determinism bug in the benchmark's cross-process identity rather
   than a cosmetic one**, so the apply stage's counters need direct unit tests.
3. The registry is a place where an enthusiastic contributor could add an expensive counter and break
   the zero-work rule; **the passive rule needs to be stated in the code, not only here.** SR-4 makes
   this materially more likely, because a store makes an expensive counter look like a one-line query.
4. **The passive rule now reaches into the run host's write path.** Maintaining the session-store counts
   is an obligation on the session writer of ADR-0008 rather than on interface code, so the zero-work
   rule of `REQ-STARTUP-129` and `REQ-STARTUP-130` — no timers, no instrumentation of any kind when
   diagnostics is off — has to hold for a counter that is incremented inside a database transaction. A
   maintained integer in a row the writer is already updating costs nothing when nobody reads it, which
   is what makes this admissible; a separate counters table updated on every insert would not be.
5. **This record now owns two things that are not interface concerns** — the relay message-rate counters
   and the main-process lag reading. That is a widening of scope, and it is accepted because the
   alternative is the same defect alternative A was rejected for: two definitions of one number. The
   boundary that keeps it honest is unchanged — the assembled record carries **counts and names only,
   never content** (`REQ-STARTUP-134`, `REQ-STARTUP-136`).

## Revisit if

The zero-work rule and the shared registry conflict in practice — for example if a counter cannot be
maintained passively — in which case that specific counter moves to a diagnostics-only path computed on
demand. **Or the update channels move to a direct message port**, which removes main from the transcript
path and makes the relay message-rate counters measure a hop that no longer carries the traffic they
were added for — they would then belong to whatever still crosses main, and the calibration obligation
above would apply to a shorter path rather than disappearing.
