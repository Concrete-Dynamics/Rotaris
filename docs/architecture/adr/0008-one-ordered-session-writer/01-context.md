# ADR-0008 — One ordered session writer per session, owning the session's transactions — Context

Part 1 of 8 of [ADR-0008](../0008-one-ordered-session-writer.md), which indexes every part.

## Context

Four ordering guarantees govern durable writes and published events, and each exists so that a killed
process cannot violate it. **Not one of them is withdrawn.** What has changed twice — once by a ruling,
once by an amendment — is the mechanism each rests on.

- **Intra-save atomicity.** `REQ-SESSION-028` requires a state save to be all-or-nothing: the resumable
  state, the transcript rows, the edit diffs, the metrics document and the listing record are made
  durable together, and no reader may observe a session whose listing record describes a state that was
  not saved or whose parts came from two different saves. The requirement now says in terms that the
  write ordering it formerly fixed existed only to keep the listing record from advertising a state not
  yet recorded, and that **the guarantee it bought is the atomicity itself**. It also fixes what stays
  outside: no second whole-state copy is written anywhere, and the human-readable summary is the one
  part written as a file, under `REQ-SESSION-033`.
- **Persist before publish.** `REQ-MONITOR-221` and `REQ-MONITOR-292`. The requirement now carries its
  own reconciliation with `REQ-MONITOR-218`: persistence "carries no delay of its own: a save is
  durable when it is requested, with nothing deferred behind a timer (`REQ-SESSION-067`)". **The rule
  is stated in ADR-0010; this writer is what makes it true**, by being the object that both commits the
  change and gates the publication.
- **Durable record before wire event**, for the pairs `REQ-EVENTS-072` enumerates: `tool.start` and
  `tool.finish` against the tool-call evidence record (`REQ-SESSION-136`); `permission.decision`
  against the permission audit (`REQ-TOOLS-078`, `REQ-SESSION-137`); `error` against the issue its
  `detail` locates (`REQ-EVENTS-056`, `REQ-SESSION-135`); `gate.decision`, `gate.repair`,
  `checkpoint.created`, `checkpoint.restored` and `hook.finish` against their timeline entries
  (`REQ-SESSION-134`, `REQ-GIT-048`, `REQ-GIT-062`, `REQ-HOOKS-119`). `hook.start` deliberately has no
  counterpart. **The requirement now closes its own escape hatch:** "where the store can make the
  durable record and the event one indivisible step, it MUST, because that is what puts the ordering
  beyond the reach of a defect". Same-transaction is no longer this record's preference; it is the
  requirement's instruction.
- **Persist before forward** for the tee (`REQ-SESSION-147`), so an event a failing consumer never
  receives is nevertheless recorded.

**The call-boundary requirements are the sharpest constraint on the mechanism and they are unchanged in
force.** `REQ-SESSION-068`: a save request captures the state at the instant of the request, so changes
made afterwards cannot produce a record mixing two states; an explicit flush must make the newest
requested state durable, must not return before it is, and **must be usable from a caller's context
where no asynchronous runtime is active**. `REQ-SESSION-070`: once a flush returns the persisted state
is never older than the newest state any caller has asked to have saved — and it may return without
writing only where a later save has already made that true — while a save carrying a terminal status
must not return before that status can be read back by any other reader of the store.
`REQ-SESSION-072` repeats the durability rule for any save taken while a run is under way and requires
such a save to already carry the run's current metric aggregates (`REQ-SESSION-168`).

### The debounce is withdrawn, and that is the reason this record is being rewritten again

`REQ-SESSION-067` as it now stands is a withdrawal, not a narrowing:

> A save MUST be made durable when it is requested, whatever the session's status. No save is deferred
> behind a timer, parked, or coalesced with a later one.

It states its own history — the ten-second window "existed because a save rewrote whole documents and
the cost had to be bounded; a save now records only what changed, so the window buys nothing and costs
the one thing that mattered — it was the interval in which a change could be published before it was
recorded" — and it fixes two consequences: there is no state a caller must remember to flush, and
`REQ-SESSION-034`'s crash-loss budget is **stated in saves rather than in seconds**. A crash loses only
changes for which no save was ever requested; every requested save that completed is durable, every
interrupted save is absent whole, and no partially applied save is observable at any point.

`REQ-SESSION-071` no longer states a bound on write volume, and says so: "No bound on write volume is
stated and none is needed". What survives in that identifier is the no-polling rule, now without
exception anywhere in the product, including over the exports of `REQ-SESSION-199`.

`REQ-MONITOR-239` closes the loop from the other side and is new obligation on every host: a session's
state is durable once a save is requested, no host may rely on a persistence delay and none may be
introduced, shutdown leaves nothing outstanding to flush, and **no host may request saves in order to
make a session appear live** — "liveness comes from the publication path, durability from the record".

### Transcript residency survived the move; only its stated reason changed

The previous form of this record concluded that `REQ-SESSION-192`'s resident cap and
`REQ-SESSION-131`'s paged archive "dissolve", because `REQ-SESSION-192` gave as its reason that every
state save rewrote the transcript whole. **That conclusion is wrong against the amended specification
and is corrected here.** Both requirements survive, restated as observables with a new reason:

- `REQ-SESSION-192` bounds the transcript a session keeps **resident** at the 5000 most recent rows,
  requires the oldest rows to be released in whole pages of 50 **before** an append that would exceed
  it, and fixes three guarantees: releasing a row never changes the index `REQ-EVENTS-052` assigned it,
  a reader asking for a row older than the resident window is served it from the released pages, and
  nothing else caps the transcript. Its stated purpose is now "a bounded resident cost and an
  unbounded, complete history".
- `REQ-SESSION-131` is the single definition of the released-page store: whole pages fixed at 50 rows,
  in release order, **never rewritten, reordered or trimmed**, a released row identical to the row that
  was released.
- `REQ-CHAT-165` depends on both by name for the desktop's page-in-older-rows behaviour and states no
  bound, page size or storage form of its own.

There is also measured reason to keep the resident bound rather than treat it as a fossil. The
run-host-to-renderer spike (`../spikes/ipc-hop-latency.md`, finding 7.3) shows that
`REQ-MONITOR-223`'s ceiling passes today because the idiomatic immutable store update in the renderer
is O(N) in **resident** rows at 2.83 ns per row: at the 5,000-row cap that is ~14 µs against a
~500 µs transport floor and is invisible; the margin is being supplied by the transport, not by the
store. A design that let residency grow without bound would spend that margin.

### The rest of the surrounding contract

`REQ-EVENTS-030` forbids concurrently raised events from interleaving within a record and binds the
*ordering* as well as the content. `REQ-EVENTS-098` requires writes to one session's history to be
serialised, gives it at most one writer, makes the right to write exactly the right to hold that
session's lock (`REQ-SESSION-056`), and now adds two clauses that bind this record and ADR-0058
directly: **serialisation is required even where the store's own guarantees already make two writers
unable to corrupt one another, because what is at stake is emission order (`REQ-EVENTS-076`) as much as
record integrity**; and **a reader must not be able to delay or block the writer, and the writer must
not be able to make a reader fail — "a store in which one blocks the other does not satisfy this
requirement"**.

`REQ-SESSION-133` fixes seven ring caps and now also requires that the trim **take effect in the same
durable operation that records the entry**, and that a record whose cap has dropped entries retain
enough to say so. `REQ-SESSION-132` requires a record kind a session never wrote to read as empty
rather than missing **without a placeholder being created for it**; the launch audit
(`REQ-SESSION-138`) is the one deliberate exception. Under accepted OQ-42
(2026-09-06), REQ-EVENTS-078/088 distinguish isolated consumer faults from a
durable-store failure: the latter quarantines the shared store and cancels affected
runs. In-memory failure notices remain available independently of failed recording.
