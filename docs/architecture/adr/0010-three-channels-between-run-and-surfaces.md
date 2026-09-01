# ADR-0010 — Three channels between the run host and its surfaces

- **Status:** proposed
- **Date:** 2026-09-01
- **Origin:** RUNTIME (ADR-RUNTIME-02)
- **Authority:** `owner-decisions.md` **SR-2**, **SR-3**, **SR-4** and **SR-8**; and the specification
  as amended on 2026-09-01, which withdrew the persistence debounce and stated `REQ-ORCH-155`'s figure
  as a percentile
- **Evidence:** `../spikes/ipc-hop-latency.md` — the first measurement of the run-host → main →
  renderer path on the target platform. It changes three conclusions in this record and confirms two.
- **Depends on:** ADR-0002, ADR-0003, ADR-0058 (the workspace store), ADR-0008, ADR-0009
- **Constrains:** ADR-0044, ADR-0043, ADR-0046, and — newly, on the measurement — ADR-0021

## Context

Three delivery obligations exist and they have **incompatible failure contracts**.

**Control.** `REQ-MONITOR-013` has been amended and no longer needs the architecture to interpret it:
"a run does not execute inside the window that displays it: the surface issuing a control and the part
of the application that executes the run are separate processes of one running instance. That, and only
that, boundary is what this requirement means." It is never a boundary between two instances
(`REQ-STARTUP-161`) and never a boundary to a run this application does not own, because no such run
exists (`REQ-MONITOR-243`). Every operation `REQ-MONITOR-004` names must be issuable across that
boundary with the same arguments, result shape and acceptance semantics, and control arguments are
limited to text, numbers, booleans and simple collections of those "so that a request survives the
boundary without losing meaning". `REQ-MONITOR-005`: a boolean plus an optional string, populated for
exactly two operations and never on a `false`; a control answers `false` rather than raising and is
safe from concurrent callers.

**Wire events.** `REQ-EVENTS-165` and `REQ-EVENTS-031`: delivery of one event to one consumer must
complete before the run proceeds past the operation that raised it — "a slow consumer delays the run
rather than losing or reordering events" — bounded at **5 seconds**, after which that consumer is
detached permanently with a warning and the run proceeds. `REQ-EVENTS-164`: the asynchronous consumer
buffers up to **1024** pending events, discards rather than blocking beyond that, and exposes a discard
count readable during iteration that only ever rises. `REQ-EVENTS-178` fixes what these consumers are:
this application consuming its own runs in its own process, never a published programmatic surface.

**View updates.** `REQ-MONITOR-232`, `REQ-MONITOR-226`, `REQ-MONITOR-293`, `REQ-ORCH-138`: **no view
may hold a run open, slow it down, or change its outcome.** A run observed by nothing, by a healthy
view, or by a broken one must reach the same terminal result, the same persisted record, the same event
sequence and the same timing.

`REQ-MONITOR-214` and `REQ-MONITOR-216` fix the payload shapes: an **incremental transcript update**
carrying the lowest row index whose content may still change, the rows from there on, new diffs and the
persona set; and **one whole-session update** carrying the session record with unbounded collections
emptied and bounded collections carried in full, as a fixed snapshot of the moment it was taken.
`REQ-MONITOR-217` requires the whole update to carry **every field of the session record that any
surface is able to display**, not a curated subset. `REQ-MONITOR-218` to `REQ-MONITOR-220`: a row a
view has not yet seen is published **immediately — no minimum wait, debounce or delay floor of any
size, on any platform**; growth of an already-visible row is coalesced into a trailing **50 ms** tick;
coalescing loses nothing and pending publications flush at run end.

**`REQ-MONITOR-214` also fixes the sequence number**, which is SR-3 arriving in the specification, and
declares itself its single definition: every publication on either channel carries one, from one
counter per session shared by both channels, starting at 1 and raised by exactly one per publication. A
surface begins from a whole-session update and counts on from the number that update carried, so it
always knows the number the next publication must bear. `REQ-MONITOR-226` says what a gap obliges:
record a diagnostic, stop consuming increments, and re-render from a whole read — **on the publication
that reveals the gap rather than after any delay** — and calls that "the whole of how a lost update is
caught". `REQ-MONITOR-287` now fixes no polling cadence at all and `REQ-MONITOR-223` states that a
session with nothing happening does no work: "no timer anywhere runs to discover whether it has
changed".

### Persist before publish, and why the rule got simpler

`REQ-MONITOR-221` binds the view channel: every change is persisted before it is published to any view,
because a view "could otherwise display something a resume would not restore" (`REQ-MONITOR-292`).

**The collision this rule used to cause is gone, and the requirement now says so itself.**
`REQ-MONITOR-221` carries its own reconciliation: it is satisfiable alongside `REQ-MONITOR-218`'s
no-delay-floor rule "because persistence carries no delay of its own: a save is durable when it is
requested, with nothing deferred behind a timer (`REQ-SESSION-067`). The interval in which a change
could be published before it was recorded no longer exists." Under the file design a transcript row's
durable home was a whole document rewritten by a debounced save, so gating publication on that write
would have put a delay floor of up to ten seconds in front of an unseen row. SR-4 removed the reason for
the debounce and the amended specification withdrew it outright. There is no longer a slow durable
record and a fast one to choose between. The rule below is still needed — publication must still wait
for something — but it no longer has to pick a winner.

`REQ-MONITOR-239` adds an obligation this record must carry, because with the debounce gone the
temptation it forbids is newly cheap: **no host may treat persistence as a liveness signal, and none may
request saves in order to make a session appear live.** "Liveness comes from the publication path,
durability from the record." Publication is what tells a surface a session is alive; a save is what
makes the record true. This record owns the first half of that sentence.

`REQ-EVENTS-075`, `REQ-SESSION-146` and `REQ-SESSION-176` require delivery to be **addressed per
session** with no fallback across sessions, registration for an empty session id rejected, and
per-session bindings bound late and discarded at teardown so a straggling event cannot reach a later run
in the same process.

### What the measurement changed

`../spikes/ipc-hop-latency.md` built ADR-0002's four-process arrangement and measured 46 launches on
Windows 11 with Electron 44.1.0, calibrating the cross-process clock per run because
`performance.timeOrigin` is not shared. Four results bear on this record and are used below rather than
summarised here: the budgets pass with two orders of magnitude of margin on the relay; `REQ-ORCH-155`
passes at the percentile SR-8 ruled and fails only under the absolute reading SR-8 rejected; a distinct
Electron channel **name** does not create a distinct transport; and the relay's failure mode under
overload is **unbounded latency with nothing dropped and nothing reordered**.

## Alternatives considered

**A — One channel: publish wire events and project everything from them.** Fails on evidence. The
catalogue is closed at 23 types and `REQ-EVENTS-177` explicitly refuses to add a type for a decision
that *is* durably recorded, so the event stream is provably not a complete description of session state.
Meanwhile `REQ-MONITOR-217` requires the whole-session update to carry every displayable field and
`REQ-SESSION-161` requires everything outside the transcript to come from a whole-session read. One
event channel cannot satisfy both.

**B — Two channels: fold the wire-event bus and the view channel together.** Attractive and wrong for a
specific reason: `REQ-EVENTS-165` says a slow consumer delays the run; `REQ-MONITOR-232` says no view
may slow the run at all. One channel cannot have both properties, and the specification is deliberate
about each — the event bus is what makes persist-before-forward and strict ordering checkable, the view
channel is what makes a broken view harmless.

**C — Three channels.** Chosen.

**D — A fourth transport for a session running elsewhere.** The foreign half this record previously
carried: a surface following a session over the filesystem, fed by the tail of `transcript.row` events.
**Withdrawn by SR-2 and removed.** `REQ-SESSION-159` now fixes two conditions and no third and states
that "the filesystem is never a channel between a run and a surface: no surface follows a session by
reading its record or its files". `REQ-MONITOR-243` says the same from this domain: a live run reaches
every surface over the two publication channels "and by no other route", and "there is consequently no
second way to observe a run". The reason that requirement gave for sharing one derivation is **not**
withdrawn with the mechanism — it now holds by construction, because only one derivation of a transcript
remains.

**E — Anchoring persist-before-publish on the session record rather than on the event history.** Under
the file design the two candidate anchors were different instants and one had a ten-second window in
front of it, so the choice mattered. It no longer does: the transcript row and its `transcript.row`
event commit in **one** transaction (ADR-0008, `REQ-EVENTS-072`), and no save is deferred
(`REQ-SESSION-067`), so both candidate anchors are the same instant. Choosing the transaction rather
than either record is what makes that true rather than coincidental, and it is why this record does not
have to be reopened if the two records are ever written by different code.

**F — A direct `MessagePort` from the run host to the renderer, replacing main's relay for the two
update channels.** ADR-0002 names this as its remedy and ADR-0044 consequence 3 names the trigger: "if
measurement shows the double hop threatens the budgets". **The measurement has been taken and the answer
is that it does not**, so the remedy is not adopted — but the alternative is recorded with its figures,
because it is measurably better and because the reason it is not needed is a *ruling* rather than a
measurement.

The port is 1.9×–2.1× faster on a transcript increment (p95 0.583 ms against 1.133 ms at zero rows;
0.624 ms against 1.291 ms at 10,000), 3.7× on a whole-session update (1.612 ms against 5.951 ms), and
26.9× on that update's worst observed sample (4.650 ms against 124.983 ms). It was verified to work with
`sandbox: true`, `contextIsolation: true` and `nodeIntegration: false` intact — the port reaches the main
world through the preload's `window.postMessage` transfer, because `contextBridge` cannot carry a
`MessagePort` — so none of ADR-0002's renderer posture is given up to get it
(`../spikes/ipc-hop-latency.md`, §2, §6).

**What decides it is SR-8.** The one budget the relay failed was `REQ-ORCH-155` read as an absolute
bound on every update: 24 of 9,000 relay samples exceeded 100 ms, worst 124.983 ms unloaded, against
0 of 6,000 on the port. SR-8 ruled that reading incoherent — no userspace program on a preemptive
operating system can bound every sample — and `REQ-ORCH-155` has since been amended to state the 95th
percentile explicitly and to add that "a single update that took longer is not by itself
non-conformant". At the percentile the relay measures **5.951 ms unloaded and 7.807 ms under 65.5 MB/s
of terminal frames**, 8× to 40× inside the budget. The alternative therefore stops being required and
becomes a lever held in reserve, which is exactly where ADR-0044 consequence 3 puts it.

## Decision

1. **Control** — request/response, arguments restricted to text, numbers, booleans and simple
   collections of those, answering `{ok, value?}` with `value` populated for exactly the two operations
   `REQ-MONITOR-005` names, never raising, safe under concurrency, refusing when the run cannot honour
   it.
2. **Wire events** — the ordered, **bounded-blocking** bus. Every event is persisted before being
   forwarded to any consumer (`REQ-SESSION-147`), so an event a failing consumer never receives is
   nevertheless recorded. Delivery to one consumer is bounded at 5 s, after which that consumer is
   treated exactly as one that went away. Recording is independent of consumption
   (`REQ-EVENTS-082`).
3. **View updates** — the transcript increment and the whole-session update, **non-blocking**,
   best-effort, per-session addressed, with the 50 ms growth tick and immediate publication of an unseen
   row.

### The publish rule, anchored on the commit

> A transcript increment carrying a row's **first appearance** or its **settled form** is published
> **only after** the transaction that recorded that row and its `transcript.row` event has
> **committed**.

That is `REQ-MONITOR-221` satisfied with no delay floor at all, because the commit is per event
(`REQ-EVENTS-029`) and is work the wire channel already performs — the view channel gates on it rather
than adding anything to the path.

`REQ-SESSION-196` is what makes the commit *sufficient* as the anchor, and it now makes it sufficient
more simply than it used to. Everything a reattach restores comes from the read-only snapshot read of
`REQ-SESSION-040`, projected by `REQ-SESSION-156`. The requirement used to complete that snapshot from
the session's own stored `transcript.row` events, for any row a debounced save had not yet written; it
has been amended to say that "no save is deferred any more (`REQ-SESSION-067`), so a row the session
recorded is a row its persisted state already holds and there is nothing left to complete". **A row
whose transaction committed is a row a reattach restores**, and now by one path rather than by two
agreeing.

**One transition is deliberately outside the rule, and the record names it rather than smoothing it
over.** `REQ-EVENTS-052` gives an incrementally produced row exactly two events — first appearance and
settled form — "and none for any state in between", while `REQ-MONITOR-219` publishes intra-row growth
on a 50 ms tick. Those ticks have no durable counterpart at the instant they are published, and gating
them would require an event `REQ-EVENTS-052` forbids. Read flatly, `REQ-MONITOR-221` and
`REQ-MONITOR-219` contradict each other. `REQ-SESSION-196` settles which reading is right: "streaming
animation and partially streamed text" are explicitly **not** restored, "because they describe a moment
rather than the session", and come back as the settled rows they became. The change `REQ-MONITOR-221`
governs is a change to the session record; a growth frame is not one, and publishing it unanchored is
conformant.

**The carve-out is exactly this and no wider.** It covers growth of a row a view already holds, between
that row's first appearance and its settled form. It does **not** cover a new row, a settled row, a
diff, a persona-set change, or anything the whole-session update carries. A previous attempt to state
the rule without the carve-out was unimplementable, and a rule stated with a wider one would be
unenforceable. The boundary is `REQ-EVENTS-052`'s one-or-two-events-per-index contract, and it is the
same boundary ADR-0008 uses to decide when the durable transcript row is written — which is why the two
records cannot drift apart. **Commits being cheap is not a reason to start committing per tick**;
per-tick commits are forbidden for the same reason `REQ-MONITOR-219` forbids per-token publication.

### Sequence numbers and gap detection

**Every publication on either view channel carries a sequence number** from one counter per session,
shared by both channels, starting at 1 and raised by exactly one per publication (`REQ-MONITOR-214`).

- **The number is stamped in the run host, at the moment of publication, by the same per-session owner
  that gates on the commit.** Assigning it anywhere later — at the relay in main, or in the renderer —
  would make a relay reorder indistinguishable from a lost update and would make the counter a property
  of a transport rather than of the session.
- **Stamping and publishing are one indivisible step per session.** Two publications numbered out of
  order would present as a gap that no reconcile can clear.
- **Every attach begins with a whole-session update**, because `REQ-MONITOR-214` gives a surface no
  other way to learn its starting number. This applies to a window opening a live session, to a window
  re-focusing one (`REQ-MONITOR-227`), and to a surface that has just reconciled.
- **A gap obliges an immediate reconcile** (`REQ-MONITOR-226`): record a diagnostic, stop consuming
  increments, re-render from a whole read, and after that read what is shown must equal the persisted
  record. Because a whole-session update deliberately omits the transcript (`REQ-MONITOR-216`),
  reconciling a *transcript* gap also re-delivers the transcript, republished from the lowest index the
  run still holds (`REQ-SESSION-161`, `REQ-MONITOR-215`, `REQ-MONITOR-229`).
- **No timer of any kind sits behind this.** `REQ-MONITOR-223` and `REQ-MONITOR-287` are explicit that a
  session with nothing happening does no periodic work and that this domain now fixes no polling cadence
  at all. `REQ-SESSION-071` forbids re-reading persisted state on a schedule and has no exception
  anywhere in the product — including the exports of `REQ-SESSION-199` and `REQ-EVENTS-172`, which are
  user-initiated actions and never a cadence.

This composes with the rule that already existed: an apply stage that cannot correctly apply an
increment declines it and re-renders from a whole read (`REQ-MONITOR-224`, `REQ-MONITOR-226`), leaving
the rows on display unchanged by the increment it declined (`REQ-SESSION-161`). Gap detection and
decline-to-apply take the same three actions and share one implementation.

**Gap detection is necessary and it is not sufficient, and the measurement is what says so.** Under
overload the relay did not lose anything: at ~50,000 frames per second the renderer received every one
of the 586,960 frames the run host sent, `refused` was 0 throughout, and nothing was reordered — the
relay "degrades into unbounded latency, not into loss", with main's event-loop lag reaching 22,777 ms
and the queue draining for tens of seconds after the run host stopped publishing
(`../spikes/ipc-hop-latency.md`, §7.2). **A sequence-gap counter would never fire in that failure, and
the interface would present only as stale.** `REQ-MONITOR-226` calls gap detection "the whole of how a
*lost update* is caught", which is true and is narrower than the failure space. This record therefore
requires, as an obligation on ADR-0052 rather than a hope:

- a **publish-to-apply latency** instrument, stamped by the publisher and read at the apply stage, so
  the latency failure has a signal of its own;
- a **relay message-rate** instrument, because the spike establishes that the relay's capacity is a
  message rate and not a byte rate — 33.0–37.4 µs per 4 KiB frame against 163.0–195.0 µs per 64 KiB
  frame, a 16× payload for a 5× cost (`../spikes/ipc-hop-latency.md`, §5.4, §7.2).

`REQ-MONITOR-225` already requires each snapshot load and each projection duration in diagnostics, but
those are single-process intervals; the cross-process one is new and is the one that would have caught
this.

### One projector

**The transcript projector is a pure function** `(rows, increment) -> rows`, with the upsert-by-index
rule of `REQ-EVENTS-052` implemented **once**. It has two feeds and they are no longer
local-versus-foreign: the live increment channel, and the projection of the read-only snapshot read that
`REQ-SESSION-156` performs and `REQ-SESSION-196` entitles a reattach to. Sharing the projector is what
keeps `REQ-MONITOR-242`'s equality — the transcript a user watched and the transcript restored must be
equal — true by construction, and `REQ-SESSION-159` now states that this equality "holds by
construction, because only one derivation of a transcript remains".

**The reattach feed has become simpler and this record must not carry the old shape.** It was
"snapshot read, completed from the session's stored `transcript.row` events". `REQ-SESSION-196` has been
amended to remove the completion step, because with no deferred save there is nothing to complete. The
projector's second feed is now the snapshot projection alone. What must not be lost with the mechanism
is the rule it protected, which the requirement restates: there must not be a second, differently
derived path.

The placeholder-fill rule this projector formerly implemented is **withdrawn**: `REQ-SESSION-160` is
withdrawn outright and `REQ-EVENTS-052` now requires a consumer detecting an index gap to stop consuming
increments and reconcile from a whole read rather than invent a row to stand in for one it never
received.

**This projector is not the renderer's apply stage.** ADR-0046's view-model stage is a second,
differently scoped transform: the projector answers "what rows does this session have", the apply stage
answers "what rows are displayed" (folding, display caps, trailer rows, the operation counters of
`REQ-UIBENCH-064`). Conflating them would put `REQ-UIBENCH-083`'s determinism obligation on the run
host, where a wall clock legitimately exists.

The whole-session update payload type is **derived from the session record type** rather than written
out by hand, because `REQ-MONITOR-217`'s failure mode is a curated subset and a derived type makes
adding a field to the record a change to the payload by definition.

### The terminal channel's isolation is not this record's to assume

ADR-0044 gives terminal frames their own channel so "a high-volume stream cannot delay a transcript
row". **The measurement says the mechanism does not exist**: a distinct Electron IPC channel name does
not create a distinct transport, because every `webContents.send` for one `webContents` is multiplexed
onto one pipe and dispatched by one main-process event loop and one renderer main thread. Against a
no-load baseline of p95 1.291 ms at 10,000 rows, transcript p95 rose to 7.733 ms at 65.5 MB/s in 1,000
frames per second and to **126.207 ms at 49.1 MB/s in 12,000 frames per second** — 97.8×, and past
`REQ-MONITOR-222`'s budget at the 12,000-frame rate (`../spikes/ipc-hop-latency.md`, §6 question 2).

Two things follow and they belong here because this record owns the view channel's budget.

- **ADR-0021's frame coalescing is load-bearing for `REQ-MONITOR-222`, not merely a display concern**,
  for as long as terminal frames ride `webContents.send`. At the rate the architecture licenses — 50
  frames per second per stream at the 20 ms floor of `REQ-TOOLS-126`'s own range — no topology showed a
  problem: the relay measured p95 1.514 ms at 999 frames per second. `REQ-CONFIG-112` puts total child
  agents at 20 and concurrent fan-out at 6 by default, so the spike's ≈1,000 frames per second is a
  conservative ceiling for foreground streams. **The spike leaves one question open and this record does
  not close it**: whether background terminal sessions (`REQ-TOOLS-107`) can push the concurrent stream
  count materially above that was not established.
- **If a direct port is ever adopted for the update channels (alternative F), terminal frames must get a
  second port**, not a share of the first. Measured: with terminal frames on their own port, transcript
  p95 was 1.521 ms at 65.5 MB/s and 1.119 ms at 12,000 frames per second, against 7.733 ms and
  126.207 ms on the relay (`../spikes/ipc-hop-latency.md`, §5.2). One shared port recovers most of the
  win but not the isolation.

## Consequences accepted

1. Three delivery mechanisms to build, document and test, each with a different failure contract, and a
   standing temptation to unify them that must be resisted with the citations above.
2. The whole-session update must be regenerated whenever **any** displayable field changes
   (`REQ-MONITOR-217`). Measured, that update costs p95 5.951 ms across both relay hops at 68,858 bytes
   and 12.179 ms at 283,438 bytes — quadrupling the payload multiplied the p95 by 2.05, not by 4, so
   payload size is not the near hazard (`../spikes/ipc-hop-latency.md`, §4.3, §7.4).
3. **`REQ-MONITOR-223`'s ceiling is met, and it is met for a reason that depends on the residency cap.**
   Measured ratio at 10,000 resident rows against zero: **1.14** with an O(1) store append and **1.16**
   with the idiomatic immutable `copy-on-append`, against a ceiling of 2. But `copy-on-append` is
   genuinely O(N) at 2.83 ns per resident row; at `REQ-SESSION-192`'s 5,000-row cap that is ~14 µs
   against a ~500 µs transport floor and is invisible. **The margin is supplied by the transport, not by
   the store** (`../spikes/ipc-hop-latency.md`, §6, §7.3). Two obligations follow: ADR-0008 must keep the
   durable residency bound rather than dissolving it, and a test must measure the **store apply in
   isolation**, because an end-to-end p95 would not catch a regression there. A delta whose
   `fromIndex` is 0 remains a **defect rather than a slow path**; the sender asserts it and diagnostics
   counts it (ADR-0044, ADR-0052).
4. `REQ-MONITOR-108` and `REQ-MONITOR-110`: a display tick must not alter a row, write session state or
   cause a transcript publication, so the elapsed-clock path touches none of these three channels.
5. **The sequence number is a payload field on two IPC channels and is an obligation on ADR-0044's
   relay.** It travels run host → main → renderer and main must relay it unchanged; a relay that
   coalesced, reordered or re-numbered publications would manufacture gaps. The spike found no reordering
   in any topology, including under the collapse — but it also did not exercise a reconcile, a refusal or
   a sequence gap at all (`refused = 0` everywhere), so **the reconcile path's cost is unmeasured**
   (`../spikes/ipc-hop-latency.md`, §8).
6. **The view is no longer ahead of the durable transcript at all.** The previous record accepted a gap
   of up to one debounce window and `REQ-SESSION-034` budgeted exactly that gap. Publication now follows
   the commit that recorded the row, and `REQ-SESSION-034` has been amended to state the crash-loss
   budget **in saves rather than in seconds**. The only thing still published ahead of any durable record
   is intra-row growth, which is not part of the session record (`REQ-SESSION-196`). A conformance test
   that diffs a live surface against the durable transcript **mid-row** still fails correctly behaving
   code for that reason; the comparison `REQ-MONITOR-242` asks for remains watched-transcript against
   reattached-transcript.
7. **What happens after a sticky mid-run store failure is returned as an open question rather than
   decided here.** The case is narrower than it was: `REQ-EVENTS-084` and `REQ-SESSION-089` now settle
   the other half, so a store that will not **open** refuses the run outright and there is no
   degrade-and-continue. What remains is `REQ-EVENTS-088`'s **mid-run** failure, which marks a session's
   history failed for the remainder of the run.
   An earlier form of this record decided that publication then continues **unanchored**, on the ground
   that the durable record had stopped advancing whatever the view did. **The store change materially
   weakens that argument**: under a file a failed append left the earlier history intact and only the
   event missing, while under one transaction the transcript row and its event share a commit, so a
   commit that will not commit means the session record itself stops advancing — the view would be
   showing rows a reattach genuinely cannot restore. `REQ-MONITOR-221` states no exception and
   `REQ-MONITOR-292` makes the persisted record authoritative wherever the two could disagree; nothing in
   the specification settles which reading wins when the record stops being writable. It is filed as
   **OQ-42** rather than re-decided.
   **Interim behaviour, which both readings share and which is not in question:** the run surfaces the
   store failure as a session issue and not only as `REQ-EVENTS-088`'s one warning, and the record
   continues to publish while marking the session's surface **unanchored**, so the condition is visible
   rather than inferred.
8. **A conformance test for any of these budgets must calibrate its clock.** The run-host-to-renderer
   offset of `performance.timeOrigin` ranged over **1.43 ms across 46 runs** — larger than the entire
   one-way latency on the direct-port path — so a test that stamps in one process and compares in another
   reports a number whose error is the size of the thing it measures
   (`../spikes/ipc-hop-latency.md`, §7.5). The spike's own method — NTP-style ping-pong over the same
   transport before measurement, taking the median of the best decile — is the shape the conformance
   harness must adopt.
9. **The measured margins are optimistic and the record says by how much rather than leaving it
   implied.** The spike's renderer had no framework, no state store, no Markdown renderer, no render
   cache and a 40-slot `textContent` recycler in place of ADR-0045's; its terminal handler stored bytes
   in a ring rather than driving a VT emulator; it ran one window, one publishing session and no
   packaging; and everything upstream of the publish call — the commit `REQ-MONITOR-221` requires
   included — is outside the measured interval. Fan-out to several windows (`REQ-MONITOR-243`,
   `REQ-STARTUP-163`) multiplies main's per-message relay cost by the window count and was not measured;
   nor was the aggregate message rate of concurrent runs (`../spikes/ipc-hop-latency.md`, §8). **Every
   figure quoted in this record is a lower bound on the requirement's own interval.**

## Revisit if

Measurement in the real renderer, or with several windows, or with concurrent runs publishing, shows the
double hop threatening `REQ-MONITOR-222` or `REQ-MONITOR-223` — the remedy is then alternative F, with a
second port for terminal frames, and it is already measured. Or the whole-session update at the maximum
supported agent count with full bounded collections proves too expensive at the rate `REQ-MONITOR-217`
forces — the answer is then field-level diffing of that same payload, not folding it into the event
stream. Or ADR-0021's coalescing cap is relaxed, or `REQ-TOOLS-107`'s background sessions are shown to
raise the concurrent stream count materially, in which case the terminal channel needs a real transport
of its own before it needs anything else. Or OQ-42 is answered against continuing publication, in which
case consequence 7 becomes a decision to withhold and `REQ-MONITOR-218`'s no-delay-floor rule must be
reconciled with it explicitly.
