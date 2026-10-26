# ADR-0010 — Three channels between the run host and its surfaces — Decision

Part 3 of 10 of [ADR-0010](../0010-three-channels-between-run-and-surfaces.md), which indexes every part.

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
