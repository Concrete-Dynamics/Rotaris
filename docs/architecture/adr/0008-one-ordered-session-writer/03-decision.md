# ADR-0008 — One ordered session writer per session, owning the session's transactions — Decision

Part 3 of 8 of [ADR-0008](../0008-one-ordered-session-writer.md), which indexes every part.

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
