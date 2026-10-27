# RUNTIME slice — architecture proposals — Part 2 — ADR proposals

Part 4 of 10 of [the runtime proposal](../runtime.md), which indexes every part.

## Part 2 — ADR proposals

### ADR-RUNTIME-01 — Where the run engine executes

**Decision to be made.** Which OS process hosts the run engine: the Electron main process, the
renderer, a Node worker thread inside main, one Electron `utilityProcess` shared by all runs, or one
`utilityProcess` per run.

**Constraints that bear on it.** C1.1 (survives every window closing), C1.2 (detach is not a
migration), C1.3 (never outlives the app), C1.4 (windows are destroyed on workspace change), C1.5
(pty-capable command path, process-group signalling), C1.6 (spawns hook processes), C1.7 (owns
long-lived MCP/LSP subprocesses tied to the lock), C1.8 (synchronous durable flush from an arbitrary
caller context), C1.9 (one process per session lock), C1.10 (a separate worker process is an
explicitly supported venue), C2.8 (write right = lock right), C3.5/C3.10 (whole-file rewrites of a
5000-row transcript), C4.3 (per-event write and flush), C5.4/C5.5 (250 ms p95, 100 ms surface
reflection) together with REQ-SHELL-150 (100 ms gesture acknowledgement, 120 ms repaint under
sustained load) and REQ-MONITOR-225 (controls stay operable during a read or projection).

**Alternatives.**

*A — Renderer process.* Eliminated by hard constraints, recorded so the elimination is traceable. A
renderer is destroyed when its window closes, which contradicts C1.1 directly and is made worse by
REQ-SHELL-017 destroying the window on a workspace change (C1.4). A sandboxed renderer cannot load
the native modules the pty path and the hook path require (C1.5, C1.6). And a per-window run host
would make C1.9 (one process per lock) depend on how many windows the user happened to open. Not a
genuine alternative.

*B — Electron main process, in-process.* Genuinely arguable and the cheapest to build. The session
lock, the run registry, the quit choreography (C7.6, C7.7) and the window lifecycle all live in one
place with no boundary to cross; C1.8's synchronous flush is trivially available; the teardown
ordering of C7.4 is under direct control. The cost is that the run engine's synchronous and
I/O-heavy work lands on the process that also serves every window's IPC and lifecycle: a whole-file
rewrite of `state/ui_transcript.json` at up to 5000 rows (C3.10 exists precisely because that
rewrite is whole), a synchronous flush that must not return until the bytes are durable (C1.8), the
Windows rename-retry loop (C3.3), and a write-plus-flush **per event** (C4.3). Any one of these
blocking the main process's loop directly threatens REQ-SHELL-150's 100 ms gesture budget and
REQ-MONITOR-225's "controls stay operable". The argument *for* B is that C3.5 bounds debounced state
writes to twelve per minute per running session, so the whole-transcript rewrite is not continuous;
the argument against is that the per-event flush is, and that a hook process spawn, a pty spawn, or
an MCP server handshake stalling would stall the window layer too.

*C — Node `worker_threads` inside main.* Moves the blocking work off the main thread while keeping
one process. But it keeps one *crash domain*: a native fault in the pty layer, or an OOM, still
takes the windows down with it. It also does not simplify anything B does not already simplify, and
Electron's own guidance is to prefer `utilityProcess` over `child_process.fork` when forking from
main (Electron documentation, `tutorial/process-model` and `api/utility-process`, current
documentation set on electronjs.org, checked via Context7). Worker threads buy the smaller half of
the benefit and none of the isolation.

*D — One `utilityProcess` shared by all runs (the "run host").* `utilityProcess.fork` gives a Node
context with native-module support, its own crash domain reported to main through the `exit` event
and `child-process-gone`, and — uniquely among these options — the ability to hand a `MessagePort`
**directly to a renderer**, so the transcript delta channel need not hop through main. It can only
be forked after `app.ready`, and its own `stdin` cannot be configured to anything but `ignore`
(which does not matter: the run host writes to *its children's* stdin, not its own). The blocking
work of C1.8, C3.3, C3.10 and C4.3 becomes free to be synchronous, because the process it blocks is
not the one drawing windows. The costs are real: the quit choreography of C7.6 now spans a boundary
and main must supervise the run host's teardown under a 30 s backstop; every control operation
crosses a boundary (though C2.1 demands that shape anyway); and a run-host crash loses **every**
in-flight run at once rather than one.

*E — One `utilityProcess` per run.* Best isolation: C6.13 and C10.1 become structural rather than
disciplinary, one lock per process is trivially true (C1.9), and a crash costs one run. The costs
are per-process overhead, and that the app-level obligations — the run registry (C10.2), "ask every
handle to stop before waiting on any" (C7.7), the ordered shutdown effects (C7.6) — become a
distributed protocol rather than local calls. Note that per-run isolation is already required to be
*logical*: REQ-ORCH-151 enumerates exactly which state must be scoped per session id, so process
isolation buys robustness, not correctness.

**Recommendation.** **D — one `utilityProcess` "run host", forked after `app.ready`, hosting the run
registry and every run.** Main keeps window lifecycle, the quit guards, file choosers and the update
path; the run host keeps the engine, the session writer, the event journal, the pty and hook child
processes, and the MCP/LSP subprocess lifetimes bound to the session lock.

The reasoning turns on three things. First, C1.8's synchronous durable flush is not negotiable and
is not something to apologise for — the specification *wants* a call that blocks until bytes are on
disk — and the only clean way to have both that and REQ-SHELL-150's 100 ms gesture budget is for the
blocking to happen somewhere other than the window layer. Second, C2.1 already forces every control
to be expressible as serializable data; putting a real boundary there makes that testable rather
than aspirational, and it is the difference between a requirement that is satisfied and one that is
merely not violated. Third, the recovery machinery for a crashed run host **already has to exist**:
an abandoned lock plus an active `execution_status` is exactly the stale-session case C7.8–C7.13
require to be detectable and repairable. A crashable run host therefore costs no new concepts, and
its crash is announced through the repair notice REQ-SESSION-062 and REQ-SHELL-155 already specify.

**Consequences accepted.**

1. A run-host crash loses every in-flight run at once. All of them become stale sessions repairable
   to `interrupted`; none loses durable history beyond the C3.7 bound. This is user-visible and is
   the main thing E would improve — see "revisit".
2. `utilityProcess.fork` requires `app.ready`, so no run can be started before then. Nothing in
   domains 01, 02, 07, 09 or 20 asks for one.
3. C7.6's "the process does not exit until the run has reported its terminal result and finished
   writing session state" becomes a two-process handshake: main asks the run host to stop, the run
   host runs C7.4's teardown pipeline and exits, main exits after observing that — with the 30 s
   force-exit backstop and the "second quit force-exits immediately" rule applying to the pair.
4. The run host, not main, holds the session lock, and therefore under C2.8 is the only party
   entitled to write a session's event store. Main must never write into a session directory.
5. Any part of the engine needing a main-only Electron API must go through a narrow request back to
   main. In this slice that is only the file chooser for export (REQ-EVENTS-173, REQ-SESSION-189)
   and the reveal-in-file-manager action (REQ-SESSION-191) — both user-gesture-driven and both
   outside the run's critical path.

**Revisit if.** (a) Measurement shows the extra hop cannot meet C5.4's 250 ms p95 or C5.5's 100 ms —
in which case take the `MessagePort`-direct-to-renderer path before reconsidering B. (b) Users
routinely hold more than two concurrent runs and a single crash losing all of them is judged
unacceptable — move to E; the session-lock and stale-repair machinery already makes that safe, and
the run registry becomes a supervisor of N processes rather than a map. (c) A requirement appears
that needs the engine to call a main-only Electron API synchronously and frequently.

---

### ADR-RUNTIME-02 — The run/UI boundary: one control channel, two distinct update channels

**Decision to be made.** How many channels exist between the run engine and everything watching it,
and what each guarantees.

**Constraints.** C2.1/C2.2 (serializable control request/response with a fixed result shape), C5.1
(two update payload shapes), C5.2 (whole-session update carries every displayable field), C5.3 (no
debounce on an unseen row; 50 ms coalescing on growth), C5.6 (decline-and-re-render), C5.7 (no view
may slow or change a run), **C5.8 (the event-bus consumer contract is bounded-blocking at 5 s and a
slow consumer delays the run)**, C5.9 (1024-buffer async consumer that drops rather than blocks),
C5.10 (per-session addressing, late binding, discarded at teardown), C5.11 (one derivation shared by
following and reopening), C4.17 (the catalog is closed at 23 types and deliberately excludes the
verification-gate log).

**Alternatives.**

*A — One channel: publish wire events to the UI and project everything from them.* This is the
"event sourcing" reading of the candidate stack, and it fails on evidence. The catalog is closed at
23 types (C4.13) and REQ-EVENTS-177 explicitly refuses to add a type for a decision that *is*
durably recorded — so the event stream is provably not a complete description of session state.
Meanwhile C5.2 requires the whole-session update to carry **every field any surface can display**,
and C5.11 requires the non-transcript state a foreign viewer sees to come from the same whole-state
read a reopen uses. A single event channel cannot satisfy both.

*B — Two channels: fold the wire-event bus and the view channel together.* Attractive, and wrong for
a specific reason: the two have **incompatible failure contracts**. C5.8 says a slow consumer delays
the run (bounded at 5 s, then detached); C5.7 says no view may slow the run at all. One channel
cannot have both properties, and the specification is deliberate about each — the event bus is the
mechanism that makes persist-before-forward and strict ordering checkable, while the view channel is
the mechanism that makes a broken view harmless.

*C — Three channels (recommended).*

1. **Control** — request/response, arguments restricted to text, numbers, booleans and simple
   collections (C2.1), answering `{ok, value?}` with `value` populated for exactly two operations
   (C2.2), never raising, safe under concurrency, refusing when the run cannot honour it.
2. **Wire events** — the ordered, bounded-blocking bus. Every event is persisted to the journal
   *before* being forwarded to any consumer (the persist-before-forward tee of REQ-SESSION-147), so
   an event a failing consumer never receives is nevertheless on disk (C4.5, C11.2). Delivery to one
   consumer is bounded at 5 s, after which that consumer is treated exactly as one that went away
   (C5.8). Recording is independent of consumption (C5.7).
3. **View updates** — the transcript delta and the whole-session snapshot (C5.1), non-blocking,
   best-effort, per-session addressed, with the 50 ms growth tick and immediate publication of an
   unseen row (C5.3).

**Recommendation.** C, plus one rule that falls out of C5.11 and C2.5: **the transcript projector
must be a pure function** — `(rows, delta) -> rows` — fed by either the local delta channel or the
foreign tail of `transcript.row` events, with the placeholder-fill and upsert-by-index rules
implemented once. Sharing the *projector* while keeping the *transports* different is what makes
REQ-MONITOR-242 ("the transcript a user watched and the transcript restored must be equal") and
REQ-SESSION-159's own justification hold by construction rather than by testing two code paths
against each other.

**Consequences accepted.** Three delivery mechanisms to build, document and test, each with a
different failure contract, and a standing temptation to unify them that must be resisted with the
citations above. The whole-session snapshot must be regenerated whenever *any* displayable field
changes (C5.2), which makes adding a field to the session record a change to the update payload by
definition — that is the failure REQ-MONITOR-217 exists to rule out, and it should be enforced by
deriving the payload type from the record type rather than writing it out by hand.

**Revisit if.** The whole-session snapshot at the maximum supported agent count with full bounded
collections proves too expensive at the reconcile cadence — the answer is then field-level diffing
of that same payload, not folding it into the event stream.

---

### ADR-RUNTIME-03 — Durable store: files as the source of truth; no database in this slice

**Decision to be made.** Whether session state, the event journal and the diagnostics are stored in
files exactly as the specification names them or in a database with the files derived — and where,
if anywhere, SQLite/Drizzle/better-sqlite3 belongs in the runtime.

**Constraints.** C3.1 (the file names *are* the contract, and "no other name is written at the
session-directory root"), C3.3/C3.4 (atomic replace with a fixed write order), C3.6 (last-requested
wins, with a fixed log line for the loser), C3.9 (a listing may read only `metadata.json` and
`lock`), C3.10/C3.11 (bounded live files with atomic compaction), C4.1/C4.2 (byte-identical JSONL),
C2.4 (tailing by byte offset), C2.8 (reads are lock-free and unrestricted), C7.8 (stale detection
must write **nothing**, verifiable by fingerprinting the tree), plus REQ-EVENTS-166 (a stored
history or an exported document must yield every field when read on another machine with a stock
JSON parser and none of this product's code present) and REQ-SESSION-191 (the user can open the
session directory in the platform file manager and the log in a reader).

**Alternatives.**

*A — Files as the source of truth.* Everything named in C3.1 is written directly: state files as
whole-file atomic replaces, append-only files appended, capped files appended and periodically
compacted atomically.

*B — A database as the source of truth, with the files derived.* Fails on a structural point, not a
performance one. The files are compared *as files* by conformance requirements: REQ-EVENTS-015 and
REQ-EVENTS-081 compare the **set of file names** two runs leave behind, and REQ-MONITOR-299 compares
two session directories **entry by entry**. So the files must be written anyway, on the run's own
path, at the run's own moments. A database would therefore be a second copy that can disagree with
the contract copy — and REQ-SESSION-006 already establishes the principle that a loader takes its
facts from state and never from a derived sidecar. Worse, a foreign follower must read a session a
*different process* is writing, lock-free (C2.8); a write-locked database directory is exactly the
coupling C2.8 rules out.

*C — Files as the contract, a database as a derived read index.* The genuinely arguable one. Session
listing is O(sessions) `metadata.json` reads per refresh (C3.9); the event-history listing decodes
the first and last line of every session's journal (REQ-EVENTS-126); both must meet REQ-SHELL-150's
100 ms gesture budget, and in a workspace that has accumulated hundreds of sessions this is real I/O
on every open of the session browser. An index would fix it. Two things push back. First, C3.9 says
building the list "reads no file other than each entry's `metadata.json`" — a reader is entitled to
that behaviour, so an index must be a cache *checked against* those files, not a substitute for
them. Second, C7.8 requires stale detection to write nothing into the session tree, verifiable by
fingerprinting — so any cache must live **outside** `<workspace>/.rotaris/sessions/`, which also
keeps C3.1's "no other name at the session-directory root" intact.

**Recommendation.** **A for v1, with C as the named escape hatch.** Build the file store directly.
If and when session-browser or history-surface latency is measured against REQ-SHELL-150 and fails,
add a read-only index **outside the sessions tree**, keyed by session id, validated against each
`metadata.json`'s `updated_at`, and never consulted by any correctness path (resume, repair,
locking, following).

**The stack finding, stated plainly.** *In this slice, SQLite, Drizzle and better-sqlite3 carry no
requirement.* Every durable artefact domains 01, 02, 07, 09 and 20 define is a file whose name,
encoding, atomicity and byte content are fixed by the specification. Using a database as the source
of truth for any of them would violate C3.1, C3.3, C4.1 and C4.2. That is not an argument against a
database elsewhere in the product — domains 08 and 14 are not mine to judge — but the runtime must
not be designed around one, a shared "persistence layer" that assumes a database would be a poor fit
here, and better-sqlite3 must not become the reason the run host needs a native module it would not
otherwise need.

**Consequences accepted.** More hand-written I/O than an ORM would need, all of it with explicit
atomicity and ordering rules. Session listing is linear in session count. There is no transaction
spanning two files, so the cross-file ordering guarantees (C3.4, C3.12, C3.13) must be enforced by a
single writer — which is ADR-RUNTIME-04.

**Revisit if.** Listing or history-surface latency fails REQ-SHELL-150 at a realistic workspace size
(then add alternative C's index), or a future domain establishes a genuine relational query need
over runtime data that files cannot serve.

---

### ADR-RUNTIME-04 — One ordered session writer per session

**Decision to be made.** How the four separate ordering guarantees over durable writes and published
events are enforced.

**Constraints.** C3.4 (fixed write order within a save, `metadata.json` last), C3.5 (debounce with
immediate flush on any non-`running`/`idle` status), C3.6 (snapshot at request instant; last
requested wins; a fixed log line for the abandoned write), C1.8 (a synchronous flush callable where
no async runtime is active, not returning until durable, and durable enough for a *separate process*
to read a terminal status), C3.12 (persist before publish), C3.13 (durable record before wire event
over an enumerated pair list), C4.4 (writers serialized, no interleaved lines), C4.5 (append never
raises; store marked failed after a write failure), C3.11 (capped appends rewrite atomically), C11.2
(diagnostics writing never fails a run).

**Alternatives.**

*A — Each producer writes its own file and publishes its own event.* Rejected. There are four
distinct ordering rules — the intra-save order (C3.4), persist-before-publish (C3.12),
durable-before-wire over seven enumerated pairs (C3.13), and persist-before-forward for the journal
tee — and enforcing each at every producer makes them unverifiable. The specification names them as
invariants precisely because they are what a killed process must not be able to violate.

*B — An asynchronous write queue with promises.* The natural Node answer, and it fails on C1.8: a
promise-based queue cannot offer a flush that is "usable from any caller's context, including one
where no asynchronous runtime is active" and that "MUST NOT return until the newest requested state
is on disk". REQ-SESSION-070's second guarantee — a terminal status readable by a separate process
before the call returns — makes this unambiguous.

*C — A synchronous-capable serialized writer with an asynchronous fast path (recommended).* One
`SessionWriter` per session id owns the pending-state slot, the debounce timer, a monotonically
increasing **generation** counter, and the handles for the append-only files. `save(state)` captures
a snapshot at the instant of the call (C3.6), stamps a generation, and either writes now or parks.
`flush()` cancels any parked write and drains synchronously with `writeFileSync` + `renameSync` and
the C3.3 Windows retry ladder. A parked write whose generation has been superseded is abandoned with
the exact log line REQ-SESSION-069 fixes. The same object owns the event append, so C4.4's
serialization and C3.13's ordering are local facts rather than conventions.

**Recommendation.** C.

**Consequences accepted.**

1. A synchronous flush blocks the run host's event loop for the duration of one whole-transcript
   write. Bounded by C3.10 at 5000 rows and by C3.5 at twelve debounced writes per minute per
   running session. Acceptable **because ADR-RUNTIME-01 puts the run host off the window layer**;
   if ADR-RUNTIME-01 is revisited toward the main process, this consequence becomes a defect.
2. Two write disciplines coexist per session and must not be confused: whole-file atomic replace
   (`state/*.json`, `metadata.json`, `metrics.json`, `summary.md`, `events.meta.json`) and
   append-plus-periodic-atomic-compaction (`events.jsonl` under C4.7, the ring-capped evidence files
   under C3.11) — with `timeline.jsonl` and `transcript_archive.jsonl` append-only and never
   compacted, the latter explicitly so (REQ-SESSION-131).
3. Failure isolation is per target: a failed journal append marks the journal failed for the run
   (C4.5) without affecting the state writer, and a diagnostics write failure degrades to a log line
   (C8.8, C11.2). The writer must therefore report per-target failure rather than one boolean.
4. The generation mechanism is per session and must not couple two sessions (C3.6's closing rule).

**Revisit if.** Profiling shows the whole-transcript rewrite dominating. The specification's own
answer is already in place — the 5000-row cap of C3.10 exists for exactly this reason — so the next
lever is the size of the live window, not the writer.

---

### ADR-RUNTIME-05 — Following a session the current process does not own

**Decision to be made.** How a viewer follows a session owned by another process, and how that path
relates to the local one.

**Constraints.** C2.3 (the filesystem is the only channel), C2.4 (byte-offset tail with a fully
specified restart rule that includes comparing the truncation marker's dropped count on every read),
C2.5 (row-index reproduction with placeholder fill and single-step re-seed), C2.6 (an executing
handle refuses to follow), C2.7 (750 ms foreign, 2000 ms local), C5.3 (no debounce on an unseen row,
locally), C5.11 (one derivation shared).

**Alternatives.**

*A — Interval-driven resumable reads (recommended).* Each read seeks to the stored offset, reads
what was appended, and **also reads `events.meta.json`** to compare the cumulative dropped count —
C2.4 makes that comparison the thing that turns trim detection from incidental into guaranteed.
Non-transcript state comes from a whole-state read on the same 750 ms tick (REQ-MONITOR-246).

*B — Filesystem watching driving the tail.* Genuinely tempting: lower latency than 750 ms and less
idle work. Two things weigh against it. The restart detection of C2.4 requires reading the truncation
marker on **every read**, so a change notification cannot replace a read; and REQ-MONITOR-288 fixes
750 ms as the *observed latency* for a foreign session, so lower latency is not a requirement being
missed. Platform watcher semantics around atomic renames are also the case watchers handle worst,
and the journal is replaced by rename on every trim (C4.7). A defensible middle position — keep the
interval as the contract and allow a watcher purely as an extra wake-up that never replaces a
scheduled read — is permitted but buys little.

*C — Push over IPC from the writing process.* Rejected by C2.3, and more importantly it does not
serve the case that motivates the requirement: a session owned by a **second instance of the
application**, which has no IPC path to this one at all. REQ-SESSION-159's own reasoning — that
sharing one derivation is what guarantees following and reopening produce identical transcripts — is
lost if the two paths differ in origin.

**Recommendation.** A, plus a structural rule: **implement the local path as the foreign path with a
low-latency transport in front of it.** One projector (ADR-RUNTIME-02) consumes `transcript.row`
events from either source; the local transport is the direct delta channel with no debounce for an
unseen row (C5.3) and the 50 ms growth tick, the foreign transport is the 750 ms tail. They may not
share a transport — C5.3 forbids a 750 ms floor locally — but they must share the projector, the
index rules and the settling rules.

The additional reason is exercise. Under ADR-RUNTIME-01 all of one application's runs live in one
run host, so the only genuinely foreign case is a second application instance opened on the same
workspace — a rare path that would otherwise be barely tested while carrying the trickiest logic in
the slice (C2.4's restart rule, C2.5's placeholder fill). Sharing the projector puts the local
path's traffic through the same code.

**Consequences accepted.** A 750 ms floor on foreign-session latency, which the specification sets.
Two transports to maintain. The offset, the last-seen dropped count and the derived row set are
per-viewer state that must be discarded and re-seeded atomically on a restart flag (C2.5); rows
briefly shown from a superseded read are explicitly accepted rather than defended against
(REQ-SESSION-149 says so and gives the reason).

**Revisit if.** A future requirement lowers foreign-session latency below what a 750 ms poll can
serve — then add a watcher as an extra wake-up while keeping the marker comparison on every read.

---
