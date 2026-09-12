# ADR-0008 — One ordered session writer per session, owning the session's transactions

- **Status:** proposed
- **Date:** 2026-09-01
- **Origin:** RUNTIME (ADR-RUNTIME-04)
- **Authority:** `owner-decisions.md` **SR-4**, read with **SR-1**, **SR-3** and **SR-9**; and the
  specification as amended on 2026-09-01, which withdrew the persistence debounce outright
- **Depends on:** ADR-0002, ADR-0003 (the line between a file and a row), ADR-0058 (the workspace store), ADR-0004 (for the one file this writer still causes to be written), ADR-0005, ADR-0006
- **Supersedes** two earlier forms of this record dated 2026-08-31: the file-owning form, and the form
  that kept a ten-second window narrowed to the session record. Both are preserved below as the
  alternatives they now are.

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

## Alternatives considered

**A — Each producer writes its own rows and publishes its own event.** Rejected, and the store change
strengthens the rejection. Four ordering rules enforced at every producer are unverifiable; and with a
transaction available, each producer opening its own would let two producers' events commit in an order
other than the order they were emitted, which `REQ-EVENTS-076` forbids — it fixes orderings judged
alike by delivery order on the live channel and by position in the stored history.

**B — An asynchronous write queue with promises.** The natural answer in this runtime, and it fails on
`REQ-SESSION-068` and `REQ-SESSION-070` exactly as it did under the file design: a promise-based queue
cannot offer a flush usable where no asynchronous runtime is active that does not return until the
state is durable, and `REQ-SESSION-070`'s "readable back by any other reader of the store before the
call returns" makes it unambiguous. **This is a constraint on the store's binding and not only on this
writer**, and ADR-0058 applies it as a filter over candidate engines rather than discovering it
afterwards. Any binding whose only interface is a promise is disqualified here, not merely
inconvenient.

**C — Let the store's own concurrency control serialise the writers, with no in-process queue.** The
tempting simplification once a database exists: one transaction per unit of work, a busy timeout for
contention. Rejected, and `REQ-EVENTS-098` has since made the rejection the specification's rather than
this record's. A transaction supplies atomicity and isolation; it does **not** supply emission order,
and the requirement now states that serialisation is required *even where the store cannot corrupt*,
because order is what is at stake. A busy timeout is separately disqualified: it is a wait of unbounded
relation to our own work, where a queue makes the wait bounded by work we scheduled, and
`REQ-MONITOR-232` forbids a view from changing a run's timing.

**D — The ten-second window, narrowed to the session record.** *This record's own previous decision,
preserved as the alternative it now is, because its argument was real and one part of it survives.*

Its case had three legs. `REQ-SESSION-071` stated a bound on write volume as an **observable** — at
most two writes per window, at most twelve per minute — and an observable is not a mechanism to be
optimised away. `REQ-SESSION-067` fixed the window against configuration, so it was not tuning.
And the cost it bounded was real: the session record carries the metric aggregates `REQ-SESSION-139`
reports, and rebuilding those on every tool call would put an aggregate query on the hot path. The
narrowing was careful — the window covered only the session record and never a write that carried a
publish anchor, so `REQ-MONITOR-218` was untouched.

**What changed is a ruling followed by an amendment, and the second went further than the first.**
SR-4 removed the *reason* for the window by making a save record only what changed. The specification
then withdrew the window **outright** rather than narrowing it, and withdrew the observable with it:
`REQ-SESSION-067` now forbids parking and coalescing in terms, and `REQ-SESSION-071` states that no
bound on write volume is needed. Two of the three legs therefore no longer exist. The third — the
aggregate rebuild — is a genuine cost and it does not disappear with the window; it is answered below
by maintaining the aggregates incrementally, which is where the argument goes rather than being lost.

**E — A synchronous-capable serialised writer, per session, owning one transaction per unit of work,
applying every requested save.** Chosen.

## Decision

One `SessionWriter` per session id, living in the run host and owned by whichever run holds that
session's **lock row** (ADR-0005). It owns the run host's connection to the workspace store of
ADR-0058, the serialised queue, a monotonically increasing **generation** counter, the per-session
**ordinal** counters for the append-ordered tables, the maintained metric aggregates, and the
derived-artifact writer that rebuilds `summary.md`.

### One transaction is the unit of work

Every unit of work is one transaction, and **the transaction is the durable anchor every ordering rule
above now names**:

- **Intra-save order dissolves into atomicity, which is what `REQ-SESSION-028` now says.** The session
  record, the transcript rows, the edit diffs, the maintained metric figures and the listing record
  commit together or not at all — and the converse holds too, which writing metadata last never gave.
  `REQ-SESSION-028`'s "no second, whole-state copy is written anywhere" survives literally: the state
  is not one blob and no path assembles one.
- **Durable record before wire event is one transaction, as `REQ-EVENTS-072` now requires.** For each
  pair it enumerates, the durable record and the `event` row go in the **same** transaction, and the
  event is forwarded to consumers and published to views only after it commits. "A run killed between
  the two must leave a record with no event, never an event with no record" stops being a property the
  writer must be trusted to preserve and becomes one it cannot violate.
- **Persist before forward** (`REQ-SESSION-147`) is the commit, then the tee.
- **Persist before publish** (`REQ-MONITOR-221`) is the commit, then the publication. ADR-0010 states
  the rule and its one carve-out; this writer is the single point that enforces it.

### Every requested save is applied, and nothing waits

`save(state)` captures a snapshot at the instant of the call (`REQ-SESSION-068`), stamps a generation,
and enqueues one transaction. **The queue never drops, parks, merges or delays a queued save**
(`REQ-SESSION-067`). Two saves requested microseconds apart produce two commits; that is what the
requirement asks for, it is affordable because a commit is bounded by the rows the save touched rather
than by the length of a document, and `REQ-SESSION-071` states that no write-volume bound applies.

- **`REQ-SESSION-069`'s last-requested-wins holds by construction.** A serialised queue applies saves
  in request order, so the last requested save is the last committed one and "an earlier request whose
  write happened to finish later" cannot arise. The generation stamp is kept because it is what makes
  that checkable in a test and because it orders the derived summary write below — not because the
  writer needs it to arbitrate. See consequence 4: the requirement's exact log line now has no producer
  on this path, and that is reported rather than papered over.
- **`flush()`** drains **synchronously**, returning only once the newest requested state is committed
  and readable back by any other reader of the store (`REQ-SESSION-068`, `REQ-SESSION-070`,
  `REQ-SESSION-072`), and is a no-op where nothing is outstanding (`REQ-SESSION-067`). It is one of the
  two writes ADR-0058 forces to the stronger durability setting — the other being a save carrying a
  terminal status — so "durable before the call returns" is literal rather than interpreted. Ordinary
  per-change commits run at the weaker setting, which is durable against the crash or force-quit
  `REQ-SESSION-034` and `REQ-EVENTS-029` name and keeps the publish path free of an `fsync`.
- **No host may manufacture a save to signal liveness** (`REQ-MONITOR-239`). A save is requested because
  state changed, and for no other reason. This is stated here because with the window gone the temptation
  is newly available and cheap.

### The metric aggregates are maintained, not recomputed

`REQ-SESSION-072` requires any state persisted while a run is under way to already carry the run's
current aggregates, and `REQ-SESSION-168` requires them copied into the state on every persist.
`REQ-SESSION-139` requires the metrics document to be rebuilt from the state plus the evidence records
on every save, with every count taken **over the entries the evidence records still hold after the
retention caps of `REQ-SESSION-133`**.

Under the withdrawn window those three met at most twice per ten seconds. They now meet on every
requested save, so the aggregate must not be a scan:

- The writer holds the counters `REQ-SESSION-139` enumerates as in-process figures and **adjusts them
  inside the transaction that inserts an evidence row**, and inside the transaction in which
  ADR-0024's ring displaces one. Adjusting on displacement is what makes `REQ-SESSION-139`'s "counts
  describe what is stored rather than what the run once produced" true without a query.
- A save therefore copies figures (`REQ-SESSION-168`) rather than computing them, and the metrics
  document is O(1) in the session's history.
- The counters are rebuilt from the store exactly once, at run start and resume, which is
  `REQ-SESSION-169`'s rehydration and already exists.

This is where alternative D's surviving argument lands. The window is not needed to bound this cost;
maintaining the counters removes it.

### What the writer still owns, because a transaction does not supply it

- **Emission order.** The queue is what puts concurrent producers into one order, and the writer assigns
  the per-session ordinal inside the transaction that inserts each append-ordered row — `event` rows
  (ADR-0009), timeline entries, and the audit and evidence rows of ADR-0024. Nothing else may assign
  one. `REQ-EVENTS-076`'s "position in the stored history" is that ordinal. `REQ-EVENTS-098` now
  requires this serialisation explicitly even though the store cannot corrupt, so it is a stated
  obligation rather than an implementation habit.
- **The single-writer rule.** `REQ-EVENTS-098`: a session's history has at most one writer and the
  right to write is exactly the right to hold that session's lock. The store is shared across the
  workspace, so the rule is scoped to a session's rows rather than to the store; what makes it hold is
  ADR-0002 putting every session lock in one process and ADR-0058's table-ownership rule reaching the
  same place from the store's side.
- **The one-shot launch audit.** The launch audit is a row written **exactly once per session** by run
  start-up, after the worktree bind and the sandbox verdict and before the first iteration
  (`REQ-SESSION-138`, `REQ-SESSION-087`, `REQ-SESSION-085`). A resume must not rewrite it. The writer
  enforces the one-shot rather than trusting call sites, and the row's **absence** is what
  `REQ-SESSION-036` reads as an empty configuration snapshot. No other record kind is initialised at
  all: `REQ-SESSION-132` requires a kind a session never wrote to read as empty **without a placeholder
  being created**, so there is no create-if-missing step anywhere in this writer.

### Transcript residency, implemented rather than dissolved

The durable transcript is **one table**, one row per transcript row, keyed by session and by the index
`REQ-EVENTS-052` assigns, which is that row's identity for the life of the session (`REQ-SESSION-192`).
A row is written on first appearance and updated on settle — exactly the two occasions
`REQ-EVENTS-052` gives an incrementally produced row an event, which is why the durable record and the
event stream stay in step by construction and why ADR-0010's carve-out for intra-row growth needs no
second mechanism. `REQ-SESSION-196` licenses not writing the states in between: partially streamed text
is explicitly not restored, "because they describe a moment rather than the session".

**Residency is a column, and release is a transaction.**

- A row carries a nullable **page** number. A row with no page is **resident**; a row with one has been
  released. The index column is never touched by either.
- When an append would take the resident count past 5,000, the writer assigns the next page number to
  the oldest 50 resident rows **in the same transaction as the append, before the append**
  (`REQ-SESSION-192`). Fifty rows sharing a page number is `REQ-SESSION-131`'s whole page; the page
  numbers ascend in release order.
- **No path updates a row that carries a page number.** That is `REQ-SESSION-131`'s "never rewritten,
  reordered or trimmed", enforced the same way ADR-0024 enforces append-only for the audit: the data
  layer exposes no such statement, and the store refuses the update.
- A reader asking for a row older than the resident window is served it from its page
  (`REQ-SESSION-192`), which the desktop reaches through the page-older-rows command ADR-0044 already
  carries and `REQ-CHAT-165` describes.

**Why not the flat table with a limit and an offset** that the previous form of this record chose.
Because it has no *resident* bound at all — the bound would belong to whichever reader asked, not to
the record — and `REQ-SESSION-192` fixes the bound on the record. It also loses `REQ-SESSION-131`'s
page identity, which `REQ-CHAT-165`'s paging is written against. The measured argument in the Context
above is the third reason and the only one that is new.

This is a change to the **durable** transcript only. The renderer's display cap, its recycling window
and its operation counters are ADR-0045's and ADR-0046's; `REQ-MONITOR-216` still omits transcript rows
from the whole-session update, and `REQ-MONITOR-223`'s 2× ceiling is a statement about update cost.

### The one file this writer still causes to be written

`REQ-SESSION-028` keeps the human-readable summary as "the one part written as a file", rebuilt by the
same save and replaced under `REQ-SESSION-033`. `REQ-SESSION-006` makes it derived, forbids any loader
from taking a fact from it, and states the licence this decision rests on: "it is on no path a run
waits for."

- The summary is rebuilt from the state the save captured and written **after that save's commit**,
  through ADR-0004's primitive, **off the run's critical path**. No commit, no publication and no
  control response waits for it.
- Writes are ordered by the save's generation, so a summary rebuilt from an older state can never
  overwrite one rebuilt from a newer one.
- A failed replacement records a warning and leaves the previous summary in force. It never fails the
  save, because the save is already durable and the summary is derived from it.
- `REQ-SESSION-033`'s five-attempt ladder is the only replacement ladder the corpus states and it
  governs exactly this file. See consequence 5: with the debounce gone this file is rewritten at the
  rate saves are requested, which is a real change in write amplification and is recorded rather than
  absorbed.

**One point of wording between this record and ADR-0004, stated so a reader does not have to choose.**
ADR-0004 records that its primitive "does run in the run host, for exactly one file", that the ladder is
"on the save path of a running session", and that this is the one place the primitive can add latency to
one. That is right about *which process* and about *what causes the write*, and this record does not
disagree with either. It is a path a save **causes** and not one a save **waits for**:
`REQ-SESSION-006`'s "it is on no path a run waits for" is what licenses the write to follow the commit
rather than precede the return, and `REQ-SESSION-028` puts the summary outside the set of things made
durable together. If ADR-0004's sentence is read as "the ladder blocks the save", the two records
disagree; on the reading above they do not, and this record takes the second.

### What stays a file, and what is not this writer's

The **session log** is a file because `REQ-SESSION-142` calls it "a file so that a person can open it in
an ordinary text reader" and `REQ-SESSION-191` offers the action that opens it; it is written by the
logging attachment rather than by this writer. Artifact, attachment and image **bodies** stay on disk
referenced by row, never as blobs (`REQ-LIBRARY-087`, `REQ-SESSION-002`). Under `REQ-SESSION-198` the
log, the summary and the bodies are held **with the store** rather than inside the workspace, so this
record fixes no path for any of them; ADR-0058 owns the layout. Provider credentials are not this
writer's at all: `REQ-PROVIDER-016` requires `0600` plus an explicit Windows access-control list, read
back, which is a filesystem guarantee a row cannot make.

## Consequences accepted

1. **A synchronous flush blocks the run host's loop for the duration of one commit**, and that is
   acceptable only **because ADR-0002 puts the run host off the window layer**. If ADR-0002 is ever
   revisited toward the main process, this consequence becomes a defect.
   **What the same loop no longer carries is measured.** Under the file design a compaction left the
   journal with no append handle for **p50 29.8 ms, p95 41.4 ms at the default 20,000-line cap**,
   rising to **840 ms** where the rename ladder was exercised
   (`../spikes/windows-writer-handle-compaction.md`, §4, arms R-F and R-A). That window sat on this
   loop and is gone with the mechanism that produced it. It is recorded because it is the largest
   blocking window this record ever accepted, and a reader comparing the two designs should see it.
2. **The commit rate is now bounded by the run loop's call sites and by nothing this record controls.**
   Under the window a `running` session wrote at most twice per ten seconds; it now writes once per
   requested save, and `REQ-SESSION-071` states that no bound applies. The save-request rate is
   therefore a property of the callers and must be **instrumented** (ADR-0052) rather than assumed.
   Two figures bound the discussion and neither is a measurement of this design: the file design's
   per-event durable write cost **0.518 ms p50** with an `fsync` and 0.0135 ms without one
   (`../spikes/windows-writer-handle-compaction.md`, §3.3), and the run-host-to-renderer transport
   costs **p95 1.291 ms at 10,000 resident rows** against `REQ-MONITOR-222`'s 250 ms
   (`../spikes/ipc-hop-latency.md`, §4.1). ADR-0058's ordinary commit performs no `fsync` and should
   therefore cost less than the flush it replaces — **that is inference, not measurement**, and the
   spike says so in terms: everything upstream of the publish call, "the database commit
   `REQ-MONITOR-221` requires before publication" included, is outside its measured interval
   (`../spikes/ipc-hop-latency.md`, §8). The measurement is owed before the record claims a number.
3. **Failure isolation is no longer per target.** Under files a failed journal append marked the journal
   failed without affecting the state writer (`REQ-EVENTS-088`), and a diagnostics failure degraded to a
   log line (`REQ-HOOKS-128`, `REQ-SESSION-175`). Those rules still hold *as rules*, but the targets
   share one store: a commit failure is a condition of the workspace store and affects every table at
   once. The writer still reports per-target status because the requirements are per target; it must not
   claim independence the store no longer provides. This is SR-4's concentration of the crash domain
   arriving here.
4. **`REQ-SESSION-069`'s exact log line has lost its only producer, and that is reported rather than
   hidden.** The line reports a save abandoned because a newer one superseded it. Under whole-file
   writes it defended against two in-flight writes landing out of order; under the narrowed window its
   producer was the parked save. With no parking and a serialised queue, every requested save commits in
   request order and nothing is ever abandoned. Either the line is now dead text, or `REQ-SESSION-067`'s
   "never coalesced" is meant to be narrower than it reads. **A writer must not manufacture the
   condition in order to keep the message alive**; the generation stamp stays as the checkable
   expression of the guarantee, and the question goes back to the specification.
5. **`summary.md` is now rewritten at the rate saves are requested.** The withdrawn window bounded a
   whole-document rewrite; every other document it bounded became a row, and this one did not. It is off
   the critical path by `REQ-SESSION-006`'s own words, and it is derived so a stale one costs nothing a
   loader reads — but `REQ-SESSION-033`'s ladder can spend up to 1.55 s of backoff on a contended
   replace, and the file design's own measurements put a foreign handle on a freshly written file inside
   the ordinary range of anti-malware behaviour
   (`../spikes/windows-writer-handle-compaction.md`, §4.2 and §7). **This is the one place where
   withdrawing the debounce made something more expensive rather than cheaper**, and it is named here so
   it is met on purpose. The lever, if measurement demands one, is to coalesce the *summary* rebuild —
   which is a departure from `REQ-SESSION-028`'s "rebuilt by the same save" and would need the
   specification's agreement, not this record's.
6. **Transcript residency is now a mechanism this record implements rather than one it dissolved.** The
   previous form of this record removed it; that is corrected. The cost is a released-page path to build
   and test — one that the paging command, `REQ-CHAT-165` and `REQ-SESSION-131` already require to exist
   — and the benefit is the bounded resident cost `REQ-MONITOR-223`'s measured margin depends on.
7. **`REQ-SESSION-139`'s metrics rebuild is O(1) and the metrics *document*'s home is now settled.** The
   previous form of this record returned that question unanswered. `REQ-SESSION-199` makes the metrics
   document one of the four records obtainable as an export and `REQ-SESSION-191` offers the action, so
   it is a record rather than a file and this record no longer has an open question about it.
8. **There is now one transaction spanning what used to be several files**, which is the single largest
   simplification in this record. It does **not** excuse stating the ordering rules: a transaction gives
   atomicity, isolation and durability, and none of emission order, ordinal assignment, single-writer
   discipline or persist-before-publish sequencing. `REQ-EVENTS-098` now says so itself.
9. **The view is no longer ahead of the durable transcript at all.** The previous file-owning record
   accepted a gap of up to one window between what a view showed and what the transcript document held.
   The gap is gone for a row's appearance and its settled form, which commit before they are published.
   It remains, deliberately, for intra-row growth, which has no durable counterpart (`REQ-SESSION-196`,
   `REQ-EVENTS-052`). `REQ-SESSION-196` has been amended to match: it no longer completes the snapshot
   read from stored `transcript.row` events, "so a row the session recorded is a row its persisted state
   already holds and there is nothing left to complete".

## Revisit if

Measurement shows per-change commits dominating the run host's loop at the concurrency `REQ-GIT-145`
permits. The lever is then widening **one** transaction to cover a burst of rows raised inside one
iteration — never delaying a commit that ADR-0010's publish rule anchors on, which would reinstate a
delay floor `REQ-MONITOR-218` forbids, and never reintroducing a window, which `REQ-SESSION-067`
forecloses. Or the save-request *rate* rather than the commit cost proves to be the expense, in which
case the lever is the call sites that request saves and not a mechanism in this writer. Or
`REQ-SESSION-028`'s per-save summary rebuild is measured to be the dominant cost of a save, in which
case consequence 5 becomes a specification question.

## First execution — 2026-09-03, the session writer

*Recorded under GD-10.*

**Built and run:** `packages/engine/src/session-writer.ts`. One transaction per unit of work: the
transcript row, its `transcript.row` event and the session's `updated_at` commit together; the
resident-window release happens in the same transaction before the append that would exceed the cap
(`REQ-SESSION-192`: the 5,001st append releases the oldest 50 as page 1, indices untouched, the
released rows unreachable to the settle path); the trim is its own transaction after the append that
overflowed `cap + cap ÷ 8`, keeping the newest `cap`, with the four-fact truncation record inside it;
a recording failure is sticky, warned exactly once, and later recordings return a failure value with
the store untouched; a terminal-status save commits at the stronger setting and is readable by a
second connection before it returns. All of it is tested against a real store with a controlled
clock, and it runs in the application: a prompt typed into the composer became row 0 of a new session,
its event ordinal 2 behind `session.start`.

**Found: nothing in this record's mechanism.** The queue this record argues for at length is, under a
synchronous binding, call order on one thread — a save is durable when `save()` returns and `flush()`
is the no-op `REQ-SESSION-067` describes. That is not a simplification of the record; it is what the
record's alternative B refused a promise-based queue *for*.

**What it did not build:** the metric aggregates (`REQ-SESSION-139`), the launch audit
(`REQ-SESSION-138`), `summary.md` (`REQ-SESSION-028`'s one file), the evidence rings of ADR-0024, and
the tee to consumers with its 5 s bound (`REQ-EVENTS-165`) — each lands with the mechanism that
produces its rows. Spike 8 and spike 18 were taken with this build; see
`../spikes/store-schema-and-open-path.md` and `../spikes/two-writers-one-store.md`, and ADR-0009's
note for what they changed.

## First execution — 2026-09-03, the run loop: aggregates, the launch audit, summary.md, the terminal transaction

*Recorded under GD-10. This is the second note on this record in one day; the first said what the writer
did not build, and this is that list built.*

**Built and run:** the metric aggregates as in-process figures rehydrated once at run start and copied into
every save (`REQ-SESSION-139/168/169`; `packages/engine/src/run/aggregates.ts`); the one-shot launch audit
as a table whose primary key *is* the one-shot — the writer reports a second insert as refused, it does not
check first (`REQ-SESSION-138`); the timeline as an append-ordered table with the writer assigning the
ordinal (`REQ-ORCH-139`); and `summary.md` rebuilt after each save's commit, off the path, through
ADR-0004's primitive under `REQ-SESSION-033`'s six-attempt ladder, generation-ordered so an older rebuild
never overwrites a newer one (`packages/engine/src/run/summary.ts`). Schema v3 adds columns and two tables
and **no index**, because no budgeted query reads them yet.

**Historical reading, superseded by accepted A3 on 2026-09-06.** `REQ-SESSION-094`
orders the lock release *before* `session.end` and `result`; `REQ-EVENTS-098` makes the right to write a
session's history exactly the right to hold its lock. Read flatly they conflict for the two terminal
events. The writer's `endRun` commits **one durable transaction** in `REQ-SESSION-094`'s order — the
system row of `REQ-SESSION-093`, the lock-row delete, `session.end`, `result`, the terminal status and
its patch — so the writer holds the lock at the instant it records the pair and holds nothing when the
commit is visible, and the bus forwards both after the commit while the sink is still attached. If the
owner reads `REQ-SESSION-094` as requiring the release to be *visible* before the pair is recorded, it is
a one-line change and this note is where it is argued.

**Accepted A3, 2026-09-06: terminal ownership.** The writer retains its lock
through the durable terminal transaction and committed event delivery. Teardown
then detaches session consumers, clears bindings and releases ownership in
guaranteed cleanup. The terminal transaction contains the system row, terminal
events and final state. Its lock stays held after commit until cleanup. A failed
terminal commit publishes no authoritative terminal outcome; the recording-failure
decision OQ-42 governs cancellation and recovery. `run.test.ts` verifies ownership
during both terminal inserts and blocking-consumer delivery, and verifies that
release follows detachment.

**A second reading, on the persisted status at normal completion.** `REQ-MONITOR-029` maps the terminal
result `completed` to the status `completed`; `REQ-SESSION-093` says a normal completion takes its status
from the end-of-run summarisation. They differ for one case — a run whose only task was abandoned stops
`no_pending_tasks` (result `completed`) and summarises `failed`. The run persists the **summarisation's**
status there, because `REQ-SESSION-093` is the requirement about what is persisted; every other outcome
takes `REQ-MONITOR-029`'s mapping. Tested in `run.test.ts`.

**Found: nothing in this record's own mechanism.** What the first run found is ADR-0043's (below).

**2026-09-05, the control channel's units.** `queuePrompt`, `editQueuedPrompt`, `removeQueuedPrompt`,
`triggerQueuedPrompts` (the atomic move over every QUEUED row, one transaction), `pauseAtLimit` (durable: the
status, the count, the limit, the timeline entry) and `resolvePause` (durable: the status the resolution writes
clears the paused-at-limit condition in the same act, REQ-SESSION-110) — each one transaction with its timeline
entry, through the one writer. **Found: nothing.**

## Read back from a live run — 2026-09-12: the compression aggregate was declared and never raised

*A defect of this record's own mechanism, found by reading the store after a 22-minute run rather than by
reading the code, and recorded here because this is where "maintained, not recomputed" was decided.*

**Measured.** Three `context_compressed` timeline entries against `sessions.compressions = 0`. The
per-agent counter of `REQ-MONITOR-086` said three for the same run, so the product held two records of one
fact and they disagreed.

**Found.** `run/aggregates.ts` declared `compressions`, rehydrated it from the row under `REQ-SESSION-169`
and copied it into every `patch()` under `REQ-SESSION-168` — and had no increment method at all. The figure
was complete at both ends of its life and empty in the middle. Nothing in the earlier note caught it because
the note proves the COPY, and a copy of zero is a correct copy.

**The falsified reason, kept beside its replacement.** The section above enumerates the counters
`REQ-SESSION-139` names and says the writer "adjusts them inside the transaction that inserts an evidence
row". That is true of the tool-call and token figures, whose events ARE evidence rows. A compression is not
an evidence row: it completes in `run/compression.ts`, writes a timeline entry and a transcript row, and
inserts nothing the writer would adjust a counter for. The rule as stated therefore had no reach over the
fourth figure, and the code inherited the gap. Restated: **every figure `REQ-SESSION-139` names is raised
where its event completes**, which for three of the four is inside the writer's transaction and for the
fourth is the compression runner.

**Built.** `Aggregates.addCompression()`, called from the one place a compression completes — beside
`writer.activity.compressed(agent)` in `CompressionRunner.runOnce`, on the same line of reasoning that the
two counters count the same event — reached through an optional `onCompressed` on the per-agent
`TurnCompression` that `run.ts` supplies. Every agent's compressor, the root's and each child's, raises the
one session figure, because `REQ-SESSION-139`'s aggregate is the session's and not an agent's.

**Refused: counting the timeline back at save time.** It would close the gap and it is what this record
exists to forbid; a per-save scan is the cost the decision above removes. Proved by
`packages/engine/src/run/compression.test.ts`, which asserts the persisted aggregate equals the number of
`context_compressed` entries the same run wrote.
